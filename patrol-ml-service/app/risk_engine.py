from dataclasses import dataclass
from datetime import datetime

import pandas as pd

from app.database import fetch_grid, fetch_incidents, fetch_neighbors, refresh_hex_grid
from app.features import add_risk_explanations, build_current_features, build_training_samples
from app.model import TrainedRiskModel, predict_probabilities, train_risk_model


@dataclass
class RiskContext:
    grid: list[dict]
    incidents: pd.DataFrame
    neighbors: dict[str, list[str]]
    model: TrainedRiskModel
    history_cutoff: datetime


def build_risk_context(now: datetime) -> RiskContext:
    grid = fetch_grid()
    if not grid:
        refresh_hex_grid()
        grid = fetch_grid()
    if not grid:
        raise RuntimeError(
            "Nenhum hexágono disponível. Verifique a importação dos limites de bairro de João Pessoa."
        )

    incidents = fetch_incidents(days=60)
    neighbors = fetch_neighbors()
    samples = build_training_samples(grid, incidents, neighbors, now)
    model = train_risk_model(samples)
    return RiskContext(
        grid=grid,
        incidents=incidents,
        neighbors=neighbors,
        model=model,
        history_cutoff=now,
    )


def predict_risk(context: RiskContext, target_time: datetime) -> pd.DataFrame:
    predictions = build_current_features(
        context.grid,
        context.incidents,
        context.neighbors,
        target_time,
        context.history_cutoff,
    )
    if predictions.empty:
        return predictions

    probabilities = predict_probabilities(context.model, predictions)
    predictions["occurrence_probability"] = probabilities.clip(0, 1)
    predictions["risk_score"] = (predictions["occurrence_probability"] * 100).round(1)
    predictions["expected_incident_count_2h"] = predictions.apply(
        lambda row: max(
            row["occurrence_probability"],
            row["count_7d"] / (7.0 * 24.0) * 2.0,
        ),
        axis=1,
    ).round(3)
    predictions = add_risk_explanations(
        predictions, model_used=context.model.estimator is not None
    )
    return predictions
