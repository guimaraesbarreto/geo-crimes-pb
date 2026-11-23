from dataclasses import dataclass

import numpy as np
import pandas as pd
from sklearn.calibration import CalibratedClassifierCV
from sklearn.compose import ColumnTransformer
from sklearn.ensemble import RandomForestClassifier
from sklearn.metrics import brier_score_loss
from sklearn.model_selection import TimeSeriesSplit
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import OneHotEncoder

from app.features import FEATURE_COLUMNS


CATEGORICAL_FEATURES = ["hour_window", "dominant_type", "primary_street"]
NUMERIC_FEATURES = [column for column in FEATURE_COLUMNS if column not in CATEGORICAL_FEATURES]


@dataclass
class TrainedRiskModel:
    estimator: Pipeline | CalibratedClassifierCV | None
    metadata: dict


def _new_estimator() -> Pipeline:
    preprocessing = ColumnTransformer(
        transformers=[
            ("categories", OneHotEncoder(handle_unknown="ignore"), CATEGORICAL_FEATURES),
            ("numbers", "passthrough", NUMERIC_FEATURES),
        ],
        remainder="drop",
    )
    classifier = RandomForestClassifier(
        n_estimators=160,
        max_depth=10,
        min_samples_leaf=2,
        class_weight="balanced_subsample",
        random_state=42,
        n_jobs=-1,
    )
    return Pipeline([("features", preprocessing), ("classifier", classifier)])


def train_risk_model(samples: pd.DataFrame) -> TrainedRiskModel:
    if samples.empty or "target_incident_count" not in samples:
        return TrainedRiskModel(
            estimator=None,
            metadata={
                "model": "historical_baseline",
                "training_samples": 0,
                "positive_samples": 0,
                "walk_forward_brier_score": None,
                "probability_calibration": "unavailable_insufficient_history",
            },
        )

    training = samples.sort_values("snapshot_at").reset_index(drop=True)
    labels = (training["target_incident_count"] > 0).astype(int)
    positive_samples = int(labels.sum())
    unique_snapshots = training["snapshot_at"].nunique()
    if len(training) < 100 or positive_samples < 8 or labels.nunique() < 2 or unique_snapshots < 5:
        return TrainedRiskModel(
            estimator=None,
            metadata={
                "model": "historical_baseline",
                "training_samples": int(len(training)),
                "positive_samples": positive_samples,
                "walk_forward_brier_score": None,
                "probability_calibration": "unavailable_insufficient_history",
            },
        )

    snapshots = np.array(sorted(training["snapshot_at"].unique()))
    splitter = TimeSeriesSplit(n_splits=3, gap=1)
    scores = []
    calibration_splits = []
    for train_times_index, validation_times_index in splitter.split(snapshots):
        train_times = set(snapshots[train_times_index])
        validation_times = set(snapshots[validation_times_index])
        train_mask = training["snapshot_at"].isin(train_times)
        validation_mask = training["snapshot_at"].isin(validation_times)
        y_train = labels.loc[train_mask]
        y_validation = labels.loc[validation_mask]
        if y_train.nunique() < 2 or y_validation.nunique() < 2:
            continue

        train_indices = np.flatnonzero(train_mask.to_numpy())
        validation_indices = np.flatnonzero(validation_mask.to_numpy())
        calibration_splits.append((train_indices, validation_indices))
        estimator = _new_estimator()
        estimator.fit(training.loc[train_mask, FEATURE_COLUMNS], y_train)
        probabilities = estimator.predict_proba(
            training.loc[validation_mask, FEATURE_COLUMNS]
        )[:, 1]
        scores.append(brier_score_loss(y_validation, probabilities))

    if len(scores) < 2:
        return TrainedRiskModel(
            estimator=None,
            metadata={
                "model": "historical_baseline",
                "training_samples": int(len(training)),
                "positive_samples": positive_samples,
                "walk_forward_brier_score": None,
                "walk_forward_folds": len(scores),
                "probability_calibration": "unavailable_insufficient_temporal_folds",
            },
        )

    final_estimator = CalibratedClassifierCV(
        estimator=_new_estimator(),
        method="sigmoid",
        cv=calibration_splits,
        ensemble=True,
    )
    final_estimator.fit(training[FEATURE_COLUMNS], labels)
    return TrainedRiskModel(
        estimator=final_estimator,
        metadata={
            "model": "random_forest_classifier",
            "training_samples": int(len(training)),
            "positive_samples": positive_samples,
            "walk_forward_brier_score": float(np.mean(scores)) if scores else None,
            "walk_forward_folds": len(scores),
            "probability_calibration": "temporal_sigmoid_ensemble",
        },
    )


def predict_probabilities(model: TrainedRiskModel, features: pd.DataFrame) -> np.ndarray:
    if features.empty:
        return np.array([], dtype=float)
    if model.estimator is None:
        from app.features import expected_incident_rate

        rates = features.to_dict(orient="records")
        return np.array(
            [1.0 - np.exp(-expected_incident_rate(row)) for row in rates],
            dtype=float,
        )
    return model.estimator.predict_proba(features[FEATURE_COLUMNS])[:, 1]
