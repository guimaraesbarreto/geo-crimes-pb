from datetime import datetime
from typing import Any
import os
from zoneinfo import ZoneInfo

from pyproj import Transformer
from shapely.geometry import Point, mapping
from shapely.ops import transform


_to_wgs84 = Transformer.from_crs("EPSG:5880", "EPSG:4326", always_xy=True).transform
_DENSE_NEIGHBORHOODS = {"Centro", "Manaíra", "Tambaú", "Mangabeira"}
_MOTORCYCLE_TYPES = {"Theft", "Street Robbery", "Vandalism"}
_CAR_TYPES = {"Vehicle Theft", "Commercial Robbery"}
_TIME_ZONE = ZoneInfo(os.getenv("TIME_ZONE", "America/Fortaleza"))
_STRATEGY_LABELS = {
    "preventive_coverage": "preventive_coverage",
    "hotspot_focus": "hotspot_focus",
    "balanced": "balanced",
}


def _tactical_value(candidate: dict, vehicle_type: str, strategy: str) -> float:
    value = float(candidate["risk_score"])
    value += float(candidate["expected_severity"]) * 5
    value += float(candidate["expected_incident_count_2h"]) * 10

    crime_type = candidate["dominant_type"]
    neighborhood = candidate["neighborhood_name"]
    street = candidate["primary_street"].lower()
    if vehicle_type == "moto":
        if crime_type in _MOTORCYCLE_TYPES:
            value *= 1.2
        if neighborhood in _DENSE_NEIGHBORHOODS:
            value *= 1.1
        if any(term in street for term in ("avenida", "av.", "comercial")):
            value *= 1.05
    else:
        if crime_type in _CAR_TYPES:
            value *= 1.2
        if candidate["mean_offenders_30d"] >= 1.5 or candidate["mean_victims_30d"] >= 2:
            value *= 1.1
        if street.startswith(("avenida", "av.")):
            value *= 1.08

    if strategy == "hotspot_focus":
        value *= 0.75 + float(candidate["risk_score"]) / 400
    return value


def _to_geojson(geometry) -> dict:
    return mapping(transform(_to_wgs84, geometry))


def _coverage_ratio(
    candidate: dict,
    selected: list[tuple[float, float, float]],
) -> float:
    ratio = 1.0
    for selected_x, selected_y, selected_radius in selected:
        distance = Point(candidate["center_x"], candidate["center_y"]).distance(
            Point(selected_x, selected_y)
        )
        if distance <= selected_radius:
            ratio *= 0.2
        elif distance <= selected_radius * 1.35:
            ratio *= 0.65
    return ratio


def _priority(score: float) -> str:
    if score >= 70:
        return "Alta"
    if score >= 40:
        return "Média"
    return "Baixa"


def _tactical_justification(candidate: dict, vehicle_type: str, strategy: str) -> str:
    neighborhood = candidate["neighborhood_name"]
    risk = candidate["risk_score"]
    strategy_focus = {
        "preventive_coverage": "ampliar cobertura territorial",
        "hotspot_focus": "concentrar cobertura no maior risco relativo",
        "balanced": "equilibrar risco e cobertura territorial",
    }[strategy]
    if vehicle_type == "moto":
        focus = "mobilidade rápida em área adensada"
        if candidate["dominant_type"] in _MOTORCYCLE_TYPES:
            focus = "recorrência de delitos oportunistas no histórico sintético"
        return (
            f"Moto posicionada em {neighborhood} para {focus} e {strategy_focus}; "
            f"risco simulado {risk:.1f}/100, com raio aproximado de 1 km."
        )

    focus = "cobertura ampla do setor"
    if candidate["dominant_type"] in _CAR_TYPES:
        focus = "histórico sintético de crimes patrimoniais e prevenção veicular"
    elif candidate["mean_offenders_30d"] >= 1.5:
        focus = "maior severidade e grupos médios no histórico sintético"
    return (
        f"Carro posicionado em {neighborhood} para {focus} e {strategy_focus}; "
        f"risco simulado {risk:.1f}/100, com raio aproximado de 2 km."
    )


def _rank_candidates(
    candidates: list[dict],
    vehicle_type: str,
    strategy: str,
    selected: list[tuple[float, float, float]],
) -> list[tuple[float, dict]]:
    ranked = []
    for candidate in candidates:
        coverage = _coverage_ratio(candidate, selected)
        value = _tactical_value(candidate, vehicle_type, strategy)
        if strategy == "preventive_coverage":
            value *= coverage
        elif strategy == "balanced":
            value *= 0.4 + 0.6 * coverage
        ranked.append((value, candidate))
    return sorted(
        ranked,
        key=lambda item: (item[0], item[1]["risk_score"], item[1]["hex_id"]),
        reverse=True,
    )


def _make_unit(
    unit_number: int,
    vehicle_type: str,
    candidate: dict,
    strategy: str,
) -> dict:
    unit_prefix = "MOTO" if vehicle_type == "moto" else "VTR"
    radius = 1000 if vehicle_type == "moto" else 2000
    coverage = Point(candidate["center_x"], candidate["center_y"]).buffer(radius, quad_segs=24)
    prevented_estimate = min(
        candidate["expected_incident_count_2h"] * 0.2,
        candidate["occurrence_probability"] * 0.2,
    )
    return {
        "viatura_id": f"{unit_prefix}-{unit_number:02d}",
        "tipo": "moto" if vehicle_type == "moto" else "carro",
        "ponto_base": {
            "latitude": candidate["latitude"],
            "longitude": candidate["longitude"],
        },
        "setor_cobertura": _to_geojson(coverage),
        "bairro_referencia": candidate["neighborhood_name"],
        "prioridade": _priority(candidate["risk_score"]),
        "crimes_prevenidos_estimados": round(prevented_estimate, 2),
        "justificativa_tatica": _tactical_justification(
            candidate, vehicle_type, strategy
        ),
        "hex_id": candidate["hex_id"],
        "_center_x": candidate["center_x"],
        "_center_y": candidate["center_y"],
        "_coverage_radius": radius,
        "_risk_score": candidate["risk_score"],
    }


def _movement_suggestions(
    units: list[dict],
    future_candidates: list[dict],
    target_time: datetime,
    strategy: str,
) -> list[dict]:
    if not future_candidates:
        return []

    next_local = target_time.astimezone(_TIME_ZONE).strftime("%Hh")
    suggestions = []
    used_future_hexes: set[str] = set()
    for unit in units:
        vehicle_type = "moto" if unit["tipo"] == "moto" else "car"
        ranked = _rank_candidates(future_candidates, vehicle_type, strategy, [])
        destination = next(
            (candidate for _, candidate in ranked if candidate["hex_id"] not in used_future_hexes),
            None,
        )
        if destination is None:
            continue
        used_future_hexes.add(destination["hex_id"])
        distance = Point(unit["_center_x"], unit["_center_y"]).distance(
            Point(destination["center_x"], destination["center_y"])
        )
        if (
            distance < 500
            or destination["hex_id"] == unit["hex_id"]
            or destination["risk_score"] <= unit["_risk_score"] + 5
        ):
            continue
        suggestions.append(
            {
                "viatura_id": unit["viatura_id"],
                "tipo": unit["tipo"],
                "bairro_origem": unit["bairro_referencia"],
                "bairro_destino": destination["neighborhood_name"],
                "ponto_destino": {
                    "latitude": destination["latitude"],
                    "longitude": destination["longitude"],
                },
                "risk_score_proximo_turno": destination["risk_score"],
                "horario_sugerido": next_local,
                "justificativa": (
                    f"Reposicionamento simulado para {destination['neighborhood_name']} "
                    f"às {next_local}, onde a estimativa para a próxima faixa horária "
                    "é maior no histórico sintético."
                ),
                "distancia_aproximada_m": round(distance),
            }
        )
    return suggestions


def generate_recommendations(
    current_candidates: list[dict],
    future_candidates: list[dict],
    cars_available: int,
    motorcycles_available: int,
    strategy: str,
    next_window_time: datetime,
) -> dict[str, Any]:
    if strategy not in _STRATEGY_LABELS:
        raise ValueError(f"Estratégia desconhecida: {strategy}")
    if not current_candidates:
        raise ValueError("Não há células disponíveis para montar a simulação.")

    units = []
    selected_coverage: list[tuple[float, float, float]] = []
    next_car_number = next_moto_number = 1
    max_count = max(cars_available, motorcycles_available)
    for index in range(max_count):
        vehicles = []
        if index < cars_available:
            vehicles.append("car")
        if index < motorcycles_available:
            vehicles.append("moto")
        for vehicle_type in vehicles:
            ranked = _rank_candidates(
                current_candidates, vehicle_type, strategy, selected_coverage
            )
            _, candidate = ranked[0]
            unit_number = next_moto_number if vehicle_type == "moto" else next_car_number
            unit = _make_unit(unit_number, vehicle_type, candidate, strategy)
            if vehicle_type == "moto":
                next_moto_number += 1
            else:
                next_car_number += 1
            selected_coverage.append(
                (candidate["center_x"], candidate["center_y"], unit["_coverage_radius"])
            )
            units.append(unit)

    movements = _movement_suggestions(
        units, future_candidates, next_window_time, strategy
    )
    public_units = [
        {key: value for key, value in unit.items() if not key.startswith("_")}
        for unit in units
    ]
    return {
        "viaturas_sugeridas": public_units,
        "movimentacoes_entre_turnos": movements,
        "resumo_executivo": (
            f"Simulação para {len(public_units)} viaturas em {len({unit['hex_id'] for unit in units})} "
            "hexágonos candidatos. O plano prioriza áreas segundo o histórico sintético "
            "e não estima efeito causal de policiamento."
        ),
    }
