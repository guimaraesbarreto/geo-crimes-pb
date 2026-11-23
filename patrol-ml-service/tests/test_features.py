import unittest
from datetime import datetime, timezone
from zoneinfo import ZoneInfo

import pandas as pd

from app.features import build_current_features, hour_window, next_window_start


class SpatiotemporalFeatureTests(unittest.TestCase):
    def test_hour_windows_match_generator_activity_periods(self):
        self.assertEqual(hour_window(4), "early_morning")
        self.assertEqual(hour_window(5), "dawn")
        self.assertEqual(hour_window(17), "daytime")
        self.assertEqual(hour_window(18), "evening")
        self.assertEqual(hour_window(22), "early_morning")

    def test_feature_snapshot_excludes_future_incidents(self):
        grid = [{
            "hex_id": "jp_test",
            "neighborhood_name": "Centro",
            "area_sq_m": 200000,
            "center_x": 1,
            "center_y": 1,
            "longitude": -34.88,
            "latitude": -7.12,
            "geometry_geojson": {"type": "Polygon", "coordinates": []},
        }]
        incidents = pd.DataFrame([
            {
                "hex_id": "jp_test",
                "type": "Theft",
                "street": "Rua A",
                "victim_count": 1,
                "offender_count": 1,
                "occurred_at": "2026-11-23T12:00:00Z",
            },
            {
                "hex_id": "jp_test",
                "type": "Street Robbery",
                "street": "Rua B",
                "victim_count": 2,
                "offender_count": 2,
                "occurred_at": "2026-11-23T14:00:00Z",
            },
        ])
        snapshot = datetime(2026, 11, 23, 13, tzinfo=timezone.utc)
        features = build_current_features(
            grid,
            incidents,
            neighbors={},
            target_time=snapshot,
            history_cutoff=datetime(2026, 11, 23, 15, tzinfo=timezone.utc),
        )
        self.assertEqual(features.iloc[0]["count_30d"], 1)
        self.assertEqual(features.iloc[0]["dominant_type"], "Theft")
        self.assertEqual(features.iloc[0]["primary_street"], "Rua A")

    def test_next_shift_uses_fortaleza_time(self):
        target = datetime(2026, 11, 24, 1, 30, tzinfo=timezone.utc)
        next_shift = next_window_start(target)
        fortaleza_time = next_shift.astimezone(ZoneInfo("America/Fortaleza"))
        self.assertEqual(fortaleza_time.day, 24)
        self.assertEqual(fortaleza_time.hour, 5)


if __name__ == "__main__":
    unittest.main()
