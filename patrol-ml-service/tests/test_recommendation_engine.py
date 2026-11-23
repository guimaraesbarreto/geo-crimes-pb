import unittest
from datetime import datetime, timezone

from pyproj import Transformer
from shapely.geometry import Point, shape
from shapely.ops import transform

from app.recommendation_engine import generate_recommendations


_to_projected = Transformer.from_crs("EPSG:4326", "EPSG:5880", always_xy=True).transform


def candidate(hex_id, longitude, risk_score, neighborhood, crime_type):
    center_x, center_y = _to_projected(longitude, -7.12)
    return {
        "hex_id": hex_id,
        "neighborhood_name": neighborhood,
        "risk_score": risk_score,
        "occurrence_probability": risk_score / 100,
        "expected_severity": 1.5,
        "expected_incident_count_2h": risk_score / 100,
        "dominant_type": crime_type,
        "mean_victims_30d": 1.5,
        "mean_offenders_30d": 1.2,
        "primary_street": "Av. Exemplo",
        "center_x": center_x,
        "center_y": center_y,
        "longitude": longitude,
        "latitude": -7.12,
    }


class PatrolRecommendationTests(unittest.TestCase):
    def setUp(self):
        self.candidates = [
            candidate("cell-center", -34.88, 85, "Centro", "Street Robbery"),
            candidate("cell-manaira", -34.84, 72, "Manaíra", "Vehicle Theft"),
            candidate("cell-bessa", -34.82, 50, "Bessa", "Theft"),
        ]

    def recommend(self, **overrides):
        future_candidates = [
            {**self.candidates[0], "risk_score": 15},
            {**self.candidates[1], "risk_score": 95},
            {**self.candidates[2], "risk_score": 90},
        ]
        options = {
            "current_candidates": self.candidates,
            "future_candidates": future_candidates,
            "cars_available": 2,
            "motorcycles_available": 2,
            "strategy": "balanced",
            "next_window_time": datetime(2026, 11, 24, 1, tzinfo=timezone.utc),
        }
        options.update(overrides)
        return generate_recommendations(**options)

    def test_creates_requested_vehicle_types_and_valid_geojson_sectors(self):
        plan = self.recommend()
        units = plan["viaturas_sugeridas"]
        self.assertEqual(len(units), 4)
        self.assertEqual(sum(unit["tipo"] == "carro" for unit in units), 2)
        self.assertEqual(sum(unit["tipo"] == "moto" for unit in units), 2)
        self.assertIn("Alta", {unit["prioridade"] for unit in units})
        self.assertTrue(
            all(unit["prioridade"] in {"Alta", "Média", "Baixa"} for unit in units)
        )
        for unit in units:
            sector = shape(unit["setor_cobertura"])
            self.assertTrue(sector.is_valid)
            self.assertEqual(sector.geom_type, "Polygon")
            projected = transform(_to_projected, sector)
            center = transform(
                _to_projected,
                Point(unit["ponto_base"]["longitude"], unit["ponto_base"]["latitude"]),
            )
            expected_radius = 1000 if unit["tipo"] == "moto" else 2000
            self.assertAlmostEqual(projected.centroid.distance(center), 0, delta=5)
            self.assertAlmostEqual(
                (projected.area / 3.141592653589793) ** 0.5,
                expected_radius,
                delta=20,
            )

    def test_returns_simulated_between_shift_movements(self):
        plan = self.recommend(
            current_candidates=[
                candidate("source", -34.88, 20, "Centro", "Theft"),
            ],
            future_candidates=[
                candidate("destination", -34.84, 90, "Manaíra", "Street Robbery"),
            ],
            cars_available=1,
            motorcycles_available=0,
            next_window_time=datetime(2026, 11, 24, 1, tzinfo=timezone.utc),
        )
        self.assertIsInstance(plan["resumo_executivo"], str)
        self.assertTrue(plan["movimentacoes_entre_turnos"])
        self.assertTrue(
            all(
                movement["viatura_id"].startswith(("MOTO-", "VTR-"))
                for movement in plan["movimentacoes_entre_turnos"]
            )
        )
        self.assertTrue(
            all(
                movement["horario_sugerido"] == "22h"
                for movement in plan["movimentacoes_entre_turnos"]
            )
        )

    def test_supports_zero_vehicles_and_rejects_unknown_strategies(self):
        plan = self.recommend(cars_available=0, motorcycles_available=0)
        self.assertEqual(plan["viaturas_sugeridas"], [])
        self.assertEqual(plan["movimentacoes_entre_turnos"], [])
        with self.assertRaises(ValueError):
            self.recommend(strategy="unrecognized")


if __name__ == "__main__":
    unittest.main()
