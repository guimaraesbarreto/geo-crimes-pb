import unittest

import pandas as pd

from app.features import FEATURE_COLUMNS
from app.model import train_risk_model


class TemporalModelTests(unittest.TestCase):
    def test_trains_and_reports_walk_forward_validation(self):
        rows = []
        for snapshot_index in range(12):
            for cell_index in range(10):
                row = {
                    "snapshot_at": f"2026-10-{snapshot_index + 1:02d}T00:00:00+00:00",
                    "target_incident_count": int((snapshot_index + cell_index) % 3 == 0),
                    "hour_window": ("daytime", "evening")[snapshot_index % 2],
                    "dominant_type": ("Theft", "Street Robbery")[cell_index % 2],
                    "primary_street": ("Rua A", "Av. B")[cell_index % 2],
                }
                row.update({feature: float((snapshot_index + cell_index) % 5) for feature in FEATURE_COLUMNS
                            if feature not in row})
                rows.append(row)

        model = train_risk_model(pd.DataFrame(rows))
        self.assertIsNotNone(model.estimator)
        self.assertEqual(model.metadata["model"], "random_forest_classifier")
        self.assertGreater(model.metadata["walk_forward_folds"], 0)
        self.assertGreaterEqual(model.metadata["walk_forward_brier_score"], 0)
        self.assertLessEqual(model.metadata["walk_forward_brier_score"], 1)

    def test_uses_explicit_baseline_when_history_is_too_small(self):
        model = train_risk_model(pd.DataFrame())
        self.assertIsNone(model.estimator)
        self.assertEqual(model.metadata["model"], "historical_baseline")


if __name__ == "__main__":
    unittest.main()
