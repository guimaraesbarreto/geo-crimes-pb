import json
import os
from pathlib import Path

import pandas as pd
from sqlalchemy import create_engine, text


SERVICE_ROOT = Path(__file__).resolve().parents[1]
TIME_ZONE = os.getenv("TIME_ZONE", "America/Fortaleza")
DATABASE_URL = os.getenv(
    "DATABASE_URL",
    "postgresql+psycopg2://wikicrimes:wikicrimes_pass@localhost:5432/wikicrimes_geo",
)

engine = create_engine(DATABASE_URL, pool_pre_ping=True, pool_size=5, max_overflow=5)


def _run_sql_file(connection, relative_path: str) -> None:
    sql = (SERVICE_ROOT / relative_path).read_text(encoding="utf-8")
    connection.exec_driver_sql(sql)


def initialize_database() -> None:
    with engine.begin() as connection:
        _run_sql_file(connection, "sql/01-ml-schema.sql")
        _run_sql_file(connection, "sql/02-refresh-hex-grid.sql")


def refresh_hex_grid() -> None:
    with engine.begin() as connection:
        _run_sql_file(connection, "sql/02-refresh-hex-grid.sql")


def fetch_grid() -> list[dict]:
    query = text(
        """
        SELECT
            hex_id,
            neighborhood_name,
            area_sq_m,
            ST_X(center_projected) AS center_x,
            ST_Y(center_projected) AS center_y,
            ST_X(center_wgs84) AS longitude,
            ST_Y(center_wgs84) AS latitude,
            ST_AsGeoJSON(geometry_wgs84) AS geometry_geojson
        FROM ml_hex_grid_jp
        WHERE city = 'João Pessoa'
        ORDER BY hex_id
        """
    )
    with engine.connect() as connection:
        rows = connection.execute(query).mappings().all()

    return [
        {
            **dict(row),
            "area_sq_m": float(row["area_sq_m"]),
            "center_x": float(row["center_x"]),
            "center_y": float(row["center_y"]),
            "longitude": float(row["longitude"]),
            "latitude": float(row["latitude"]),
            "geometry_geojson": json.loads(row["geometry_geojson"]),
        }
        for row in rows
    ]


def fetch_neighbors() -> dict[str, list[str]]:
    query = text(
        """
        SELECT source.hex_id AS source_id, target.hex_id AS target_id
        FROM ml_hex_grid_jp AS source
        JOIN ml_hex_grid_jp AS target
          ON source.hex_id <> target.hex_id
         AND ST_DWithin(source.center_projected, target.center_projected, 600)
        WHERE source.city = 'João Pessoa'
          AND target.city = 'João Pessoa'
        """
    )
    neighbors: dict[str, list[str]] = {}
    with engine.connect() as connection:
        for row in connection.execute(query).mappings():
            neighbors.setdefault(row["source_id"], []).append(row["target_id"])
    return neighbors


def fetch_incidents(days: int = 60) -> pd.DataFrame:
    query = text(
        """
        SELECT
            grid.hex_id,
            incident.type,
            incident.street,
            incident.victim_count,
            incident.offender_count,
            incident.occurred_at
        FROM georeferenced_incidents AS incident
        JOIN LATERAL (
            SELECT candidate.hex_id
            FROM ml_hex_grid_jp AS candidate
            WHERE candidate.city = 'João Pessoa'
              AND ST_Covers(candidate.geometry_projected, incident.location_projected)
            ORDER BY candidate.area_sq_m, candidate.hex_id
            LIMIT 1
        ) AS grid ON TRUE
        WHERE incident.city = 'João Pessoa'
          AND incident.present_in_source = TRUE
          AND incident.occurred_at >= NOW() - make_interval(days => :days)
          AND incident.occurred_at <= NOW()
        ORDER BY incident.occurred_at
        """
    )
    with engine.connect() as connection:
        return pd.read_sql_query(query, connection, params={"days": days})
