from contextlib import asynccontextmanager
from datetime import datetime, time, timezone
import logging
import os
import re
from typing import Literal
from zoneinfo import ZoneInfo

from fastapi import FastAPI, HTTPException, Query
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy import text

from app.database import TIME_ZONE, engine, initialize_database
from app.features import WINDOW_NAMES, next_window_start
from app.recommendation_engine import generate_recommendations
from app.risk_engine import build_risk_context, predict_risk


logging.basicConfig(level=os.getenv("LOG_LEVEL", "INFO"))
logger = logging.getLogger("patrol-ml-service")
FORTALEZA = ZoneInfo(TIME_ZONE)

SIMULATION_METADATA = {
    "mode": "synthetic_simulation",
    "data_source": "Synthetic mock incidents geocoded approximately",
    "geography": "Seven OpenStreetMap neighborhood boundaries in João Pessoa",
    "spatial_reference": "SRID 5880 for distance calculations; SRID 4326 for GeoJSON",
    "is_operational_advice": False,
    "limitations": [
        "No real incident, dispatch, road-network, or travel-time data is used.",
        "The synthetic sample is small and the geocoding is approximate.",
        "Scores and prevented-incident values are simulations, not causal estimates.",
        "Do not use these outputs to deploy real-world patrols or make enforcement decisions.",
    ],
}


@asynccontextmanager
async def lifespan(_app: FastAPI):
    initialize_database()
    logger.info("Synthetic patrol simulation service initialized.")
    yield
    engine.dispose()


app = FastAPI(
    title="WikiCrimes Paraíba — Simulação de Patrulhamento",
    description=(
        "Simulação demonstrativa baseada exclusivamente em ocorrências sintéticas; "
        "não é um sistema operacional de despacho."
    ),
    version="0.1.0",
    lifespan=lifespan,
)


class PatrolRecommendationRequest(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    cars_available: int = Field(alias="carros_disponiveis", ge=0, le=50)
    motorcycles_available: int = Field(alias="motos_disponiveis", ge=0, le=50)
    target_time: str | None = Field(
        default=None,
        alias="turno_ou_horario",
        description="Opcional: ISO 8601 ou horário HH:MM no fuso de João Pessoa.",
        max_length=40,
    )
    strategy: Literal[
        "preventiva_cobertura",
        "foco_hotspots",
        "balanceada",
    ] = Field(default="balanceada", alias="estrategia")


def parse_target_time(value: str | None, now: datetime | None = None) -> datetime:
    if value is None:
        return now or datetime.now(timezone.utc)

    named_windows = {
        "madrugada": 3,
        "22h-04h": 23,
        "manhã cedo": 5,
        "manha cedo": 5,
        "05h-06h": 5,
        "manhã": 12,
        "manha": 12,
        "07h-17h": 12,
        "tarde": 15,
        "noite": 19,
        "18h-21h": 19,
    }
    if value.strip().casefold() in named_windows:
        reference = (now or datetime.now(timezone.utc)).astimezone(FORTALEZA)
        target_hour = named_windows[value.strip().casefold()]
        return datetime.combine(
            reference.date(), time(target_hour), FORTALEZA
        ).astimezone(timezone.utc)

    if re.fullmatch(r"\d{2}:\d{2}", value):
        parsed_time = time.fromisoformat(value)
        reference = (now or datetime.now(timezone.utc)).astimezone(FORTALEZA)
        return datetime.combine(reference.date(), parsed_time, FORTALEZA).astimezone(
            timezone.utc
        )

    try:
        parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError as error:
        raise ValueError(
            "turno_ou_horario deve usar HH:MM ou uma data/hora ISO 8601."
        ) from error
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=FORTALEZA)
    return parsed.astimezone(timezone.utc)


def _metadata(model_metadata: dict) -> dict:
    return {
        **SIMULATION_METADATA,
        "modelo": model_metadata,
        "faixas_horarias": list(WINDOW_NAMES.values()),
    }


def _risk_response(context, target_time: datetime) -> dict:
    predictions = predict_risk(context, target_time)
    data = []
    for row in predictions.to_dict(orient="records"):
        data.append(
            {
                "hex_id": row["hex_id"],
                "bairro_referencia": row["neighborhood_name"],
                "ponto_base": {
                    "latitude": row["latitude"],
                    "longitude": row["longitude"],
                },
                "risk_score": row["risk_score"],
                "probabilidade_ocorrencia": row["occurrence_probability"],
                "expected_severity": round(row["mean_severity_30d"], 2),
                "expected_incident_count_2h": row["expected_incident_count_2h"],
                "tipo_predominante": row["dominant_type"],
                "dominant_type": row["dominant_type"],
                "mean_victims_30d": row["mean_victims_30d"],
                "mean_offenders_30d": row["mean_offenders_30d"],
                "primary_street": row["primary_street"],
                "center_x": row["center_x"],
                "center_y": row["center_y"],
                "janela_horaria": row["window_label"],
                "top_factors": row["top_factors"],
                "geometry": row["geometry_geojson"],
            }
        )
    data.sort(key=lambda item: item["risk_score"], reverse=True)
    return {
        "simulado": True,
        "horario_alvo": target_time.isoformat(),
        "total_hexagonos": len(data),
        "data": data,
        "metadados": _metadata(context.model.metadata),
    }


def _get_context_and_target(target_time: str | None):
    now = datetime.now(timezone.utc)
    try:
        parsed_target = parse_target_time(target_time, now)
    except ValueError as error:
        raise HTTPException(status_code=400, detail=str(error)) from error

    try:
        context = build_risk_context(now)
    except Exception as error:
        logger.exception("Could not prepare simulated patrol predictions.")
        raise HTTPException(
            status_code=503,
            detail=(
                "Serviço de simulação indisponível. Verifique a conexão PostGIS "
                "e a presença dos limites de bairros."
            ),
        ) from error
    return context, parsed_target


@app.get("/health")
def health() -> dict:
    try:
        with engine.connect() as connection:
            connection.execute(text("SELECT 1"))
    except Exception as error:
        logger.exception("PostGIS health check failed.")
        raise HTTPException(status_code=503, detail="PostGIS unavailable.") from error
    return {"status": "ok", "mode": "synthetic_simulation"}


@app.get("/api/patrol/risk")
def get_risk(
    target_time: str | None = Query(default=None, alias="turno_ou_horario", max_length=40),
) -> dict:
    context, parsed_target = _get_context_and_target(target_time)
    return _risk_response(context, parsed_target)


@app.post("/api/patrol/recommend")
def recommend_patrol(request: PatrolRecommendationRequest) -> dict:
    context, target_time = _get_context_and_target(request.target_time)
    next_shift_time = next_window_start(target_time)
    current_response = _risk_response(context, target_time)
    future_response = _risk_response(context, next_shift_time)
    current_candidates = [
        {
            "hex_id": item["hex_id"],
            "neighborhood_name": item["bairro_referencia"],
            "risk_score": item["risk_score"],
            "occurrence_probability": item["probabilidade_ocorrencia"],
            "expected_severity": item["expected_severity"],
            "expected_incident_count_2h": item["expected_incident_count_2h"],
            "dominant_type": item["dominant_type"],
            "mean_victims_30d": item["mean_victims_30d"],
            "mean_offenders_30d": item["mean_offenders_30d"],
            "primary_street": item["primary_street"],
            "center_x": item["center_x"],
            "center_y": item["center_y"],
            "longitude": item["ponto_base"]["longitude"],
            "latitude": item["ponto_base"]["latitude"],
        }
        for item in current_response["data"]
    ]
    future_candidates = [
        {
            "hex_id": item["hex_id"],
            "neighborhood_name": item["bairro_referencia"],
            "risk_score": item["risk_score"],
            "occurrence_probability": item["probabilidade_ocorrencia"],
            "expected_severity": item["expected_severity"],
            "expected_incident_count_2h": item["expected_incident_count_2h"],
            "dominant_type": item["dominant_type"],
            "mean_victims_30d": item["mean_victims_30d"],
            "mean_offenders_30d": item["mean_offenders_30d"],
            "primary_street": item["primary_street"],
            "center_x": item["center_x"],
            "center_y": item["center_y"],
            "longitude": item["ponto_base"]["longitude"],
            "latitude": item["ponto_base"]["latitude"],
        }
        for item in future_response["data"]
    ]

    strategy = {
        "preventiva_cobertura": "preventive_coverage",
        "foco_hotspots": "hotspot_focus",
        "balanceada": "balanced",
    }[request.strategy]
    try:
        plan = generate_recommendations(
            current_candidates,
            future_candidates,
            request.cars_available,
            request.motorcycles_available,
            strategy,
            next_shift_time,
        )
    except ValueError as error:
        raise HTTPException(status_code=422, detail=str(error)) from error

    return {
        "simulado": True,
        "horario_alvo": target_time.isoformat(),
        "proxima_mudanca_faixa": next_shift_time.isoformat(),
        "estrategia": request.strategy,
        **plan,
        "metadados": _metadata(context.model.metadata),
    }
