from collections import Counter
from datetime import datetime, time, timedelta, timezone
import math
import os
from zoneinfo import ZoneInfo

import pandas as pd


TIME_ZONE = os.getenv("TIME_ZONE", "America/Fortaleza")
FEATURE_COLUMNS = [
    "count_24h",
    "count_7d",
    "count_14d",
    "count_30d",
    "mean_victims_30d",
    "mean_offenders_30d",
    "mean_severity_30d",
    "spillover_24h",
    "trend_ratio_7d_30d",
    "window_incident_rate_30d",
    "local_hour_sin",
    "local_hour_cos",
    "hour_window",
    "dominant_type",
    "primary_street",
]

WINDOW_NAMES = {
    "early_morning": "Madrugada (22h-04h)",
    "dawn": "Manhã cedo (05h-06h)",
    "daytime": "Manhã e tarde (07h-17h)",
    "evening": "Noite (18h-21h)",
}
WINDOW_HOURS_PER_DAY = {
    "early_morning": 7,
    "dawn": 2,
    "daytime": 11,
    "evening": 4,
}
TYPE_SEVERITY = {
    "Theft": 1.0,
    "Street Robbery": 1.6,
    "Vehicle Theft": 1.3,
    "Vandalism": 0.8,
    "Commercial Robbery": 1.5,
}
HOUR_NS = 60 * 60 * 1_000_000_000
DAY_NS = 24 * HOUR_NS


def hour_window(hour: int) -> str:
    if hour >= 22 or hour <= 4:
        return "early_morning"
    if 5 <= hour <= 6:
        return "dawn"
    if 7 <= hour <= 17:
        return "daytime"
    return "evening"


def incident_severity(crime_type: str, victim_count: int, offender_count: int) -> float:
    base = TYPE_SEVERITY.get(crime_type, 1.0)
    severity = base + max(0, victim_count - 1) * 0.35 + max(0, offender_count - 1) * 0.25
    return min(5.0, severity)


def _prepare_incidents(incidents: pd.DataFrame) -> dict[str, dict]:
    if incidents.empty:
        return {}

    prepared = incidents.copy()
    prepared["occurred_at"] = pd.to_datetime(prepared["occurred_at"], utc=True)
    prepared = prepared.sort_values("occurred_at")
    prepared["timestamp_ns"] = prepared["occurred_at"].astype("int64")
    local_times = prepared["occurred_at"].dt.tz_convert(TIME_ZONE)
    prepared["hour_window"] = local_times.dt.hour.map(hour_window)
    prepared["severity"] = [
        incident_severity(crime_type, int(victims), int(offenders))
        for crime_type, victims, offenders in zip(
            prepared["type"],
            prepared["victim_count"],
            prepared["offender_count"],
            strict=True,
        )
    ]

    grouped = {}
    for hex_id, group in prepared.groupby("hex_id", sort=False):
        grouped[hex_id] = {
            "times": group["timestamp_ns"].to_numpy(),
            "types": group["type"].to_numpy(),
            "streets": group["street"].fillna("").to_numpy(),
            "victims": group["victim_count"].to_numpy(dtype=float),
            "offenders": group["offender_count"].to_numpy(dtype=float),
            "severity": group["severity"].to_numpy(dtype=float),
            "windows": group["hour_window"].to_numpy(),
        }
    return grouped


def _feature_row(
    cell: dict,
    incident_data: dict | None,
    snapshot: pd.Timestamp,
    spillover_24h: float,
) -> dict:
    snapshot_ns = int(snapshot.tz_convert("UTC").value)
    if incident_data:
        times = incident_data["times"]
        end = times.searchsorted(snapshot_ns, side="left")
        start_30d = times.searchsorted(snapshot_ns - 30 * DAY_NS, side="left")
        start_14d = times.searchsorted(snapshot_ns - 14 * DAY_NS, side="left")
        start_7d = times.searchsorted(snapshot_ns - 7 * DAY_NS, side="left")
        start_24h = times.searchsorted(snapshot_ns - DAY_NS, side="left")
        recent_start = start_30d
        count_30d = end - start_30d
        count_14d = end - start_14d
        count_7d = end - start_7d
        count_24h = end - start_24h
        recent_types = incident_data["types"][recent_start:end]
        recent_streets = incident_data["streets"][recent_start:end]
        recent_windows = incident_data["windows"][recent_start:end]
        window_name = hour_window(snapshot.tz_convert(TIME_ZONE).hour)
        window_count = int((recent_windows == window_name).sum())
        dominant_type = Counter(recent_types).most_common(1)[0][0] if count_30d else "No recent incidents"
        primary_street = Counter(street for street in recent_streets if street).most_common(1)
        severity_mean = float(incident_data["severity"][recent_start:end].mean()) if count_30d else 1.0
        victims_mean = float(incident_data["victims"][recent_start:end].mean()) if count_30d else 1.0
        offenders_mean = float(incident_data["offenders"][recent_start:end].mean()) if count_30d else 1.0
    else:
        count_24h = count_7d = count_14d = count_30d = window_count = 0
        dominant_type = "No recent incidents"
        primary_street = []
        severity_mean = victims_mean = offenders_mean = 1.0
        window_name = hour_window(snapshot.tz_convert(TIME_ZONE).hour)

    local_hour = snapshot.tz_convert(TIME_ZONE).hour + snapshot.tz_convert(TIME_ZONE).minute / 60
    window_hours = WINDOW_HOURS_PER_DAY[window_name]
    return {
        "hex_id": cell["hex_id"],
        "neighborhood_name": cell["neighborhood_name"],
        "area_sq_m": cell["area_sq_m"],
        "center_x": cell["center_x"],
        "center_y": cell["center_y"],
        "longitude": cell["longitude"],
        "latitude": cell["latitude"],
        "geometry_geojson": cell["geometry_geojson"],
        "snapshot_at": snapshot.isoformat(),
        "count_24h": int(count_24h),
        "count_7d": int(count_7d),
        "count_14d": int(count_14d),
        "count_30d": int(count_30d),
        "mean_victims_30d": victims_mean,
        "mean_offenders_30d": offenders_mean,
        "mean_severity_30d": severity_mean,
        "spillover_24h": float(spillover_24h),
        "trend_ratio_7d_30d": (count_7d + 0.5) / ((count_30d / 30.0 * 7.0) + 0.5),
        "window_incident_rate_30d": window_count / (30.0 * window_hours),
        "local_hour_sin": math.sin(2 * math.pi * local_hour / 24),
        "local_hour_cos": math.cos(2 * math.pi * local_hour / 24),
        "hour_window": window_name,
        "dominant_type": dominant_type,
        "primary_street": primary_street[0][0] if primary_street else "No recent street",
        "window_label": WINDOW_NAMES[window_name],
    }


def build_training_samples(
    grid: list[dict],
    incidents: pd.DataFrame,
    neighbors: dict[str, list[str]],
    as_of: datetime,
) -> pd.DataFrame:
    if not grid:
        return pd.DataFrame()
    history = _prepare_incidents(incidents)
    as_of_timestamp = pd.Timestamp(as_of)
    if as_of_timestamp.tzinfo is None:
        as_of_timestamp = as_of_timestamp.tz_localize(timezone.utc)
    else:
        as_of_timestamp = as_of_timestamp.tz_convert(timezone.utc)

    last_snapshot = as_of_timestamp.floor("6h") - pd.Timedelta(hours=2)
    first_snapshot = last_snapshot - pd.Timedelta(days=30)
    snapshots = pd.date_range(first_snapshot, last_snapshot, freq="6h")
    rows = []
    for snapshot in snapshots:
        count_24h_by_hex = {}
        for cell in grid:
            data = history.get(cell["hex_id"])
            if data:
                upper = data["times"].searchsorted(int(snapshot.value), side="left")
                lower = data["times"].searchsorted(
                    int(snapshot.value) - DAY_NS, side="left"
                )
                count_24h_by_hex[cell["hex_id"]] = upper - lower
            else:
                count_24h_by_hex[cell["hex_id"]] = 0

        for cell in grid:
            neighbor_ids = neighbors.get(cell["hex_id"], [])
            spillover = (
                sum(count_24h_by_hex.get(neighbor_id, 0) for neighbor_id in neighbor_ids)
                / len(neighbor_ids)
                if neighbor_ids
                else 0.0
            )
            row = _feature_row(cell, history.get(cell["hex_id"]), snapshot, spillover)
            target_start = int(snapshot.value)
            target_end = target_start + 2 * HOUR_NS
            data = history.get(cell["hex_id"])
            if data:
                left = data["times"].searchsorted(target_start, side="left")
                right = data["times"].searchsorted(target_end, side="left")
                row["target_incident_count"] = right - left
                if right > left:
                    row["target_severity"] = float(data["severity"][left:right].mean())
                else:
                    row["target_severity"] = 0.0
            else:
                row["target_incident_count"] = 0
                row["target_severity"] = 0.0
            rows.append(row)
    return pd.DataFrame(rows)


def build_current_features(
    grid: list[dict],
    incidents: pd.DataFrame,
    neighbors: dict[str, list[str]],
    target_time: datetime,
    history_cutoff: datetime,
) -> pd.DataFrame:
    if not grid:
        return pd.DataFrame()

    prepared = incidents.copy()
    if not prepared.empty:
        prepared["occurred_at"] = pd.to_datetime(prepared["occurred_at"], utc=True)
        cutoff = pd.Timestamp(history_cutoff)
        if cutoff.tzinfo is None:
            cutoff = cutoff.tz_localize(timezone.utc)
        else:
            cutoff = cutoff.tz_convert(timezone.utc)
        prepared = prepared.loc[prepared["occurred_at"] <= cutoff]

    history = _prepare_incidents(prepared)
    snapshot = pd.Timestamp(target_time)
    if snapshot.tzinfo is None:
        snapshot = snapshot.tz_localize(timezone.utc)
    else:
        snapshot = snapshot.tz_convert(timezone.utc)
    count_24h_by_hex = {}
    for cell in grid:
        data = history.get(cell["hex_id"])
        if data:
            upper = data["times"].searchsorted(int(snapshot.value), side="left")
            lower = data["times"].searchsorted(
                int(snapshot.value) - DAY_NS, side="left"
            )
            count_24h_by_hex[cell["hex_id"]] = upper - lower
        else:
            count_24h_by_hex[cell["hex_id"]] = 0

    rows = []
    for cell in grid:
        neighbor_ids = neighbors.get(cell["hex_id"], [])
        spillover = (
            sum(count_24h_by_hex.get(neighbor_id, 0) for neighbor_id in neighbor_ids)
            / len(neighbor_ids)
            if neighbor_ids
            else 0.0
        )
        rows.append(_feature_row(cell, history.get(cell["hex_id"]), snapshot, spillover))
    return pd.DataFrame(rows)


def next_window_start(target_time: datetime) -> datetime:
    local_time = target_time
    if local_time.tzinfo is None:
        local_time = local_time.replace(tzinfo=timezone.utc)
    local_time = local_time.astimezone(ZoneInfo(TIME_ZONE))
    boundaries = [5, 7, 18, 22]
    for hour in boundaries:
        candidate = local_time.replace(hour=hour, minute=0, second=0, microsecond=0)
        if candidate > local_time:
            return candidate
    return datetime.combine(
        local_time.date() + timedelta(days=1),
        time(5),
        tzinfo=local_time.tzinfo,
    )


def add_risk_explanations(frame: pd.DataFrame, model_used: bool) -> pd.DataFrame:
    if frame.empty:
        return frame

    explanations = []
    for row in frame.to_dict(orient="records"):
        factors = []
        if row["count_7d"] > 0 and row["count_7d"] >= row["count_30d"] * 0.5:
            factors.append("Recorrência recente elevada nos últimos 7 dias.")
        if row["window_incident_rate_30d"] >= 0.03:
            factors.append(f"Histórico de ocorrências na faixa {row['window_label'].lower()}.")
        if row["spillover_24h"] >= 0.25:
            factors.append("Hexágonos vizinhos registraram atividade nas últimas 24 horas.")
        if row["mean_severity_30d"] >= 1.7:
            factors.append("Histórico recente apresenta maior severidade sintética.")
        if row["count_30d"] < 3:
            factors.append("Amostra histórica pequena; interpretar o resultado com cautela.")
        if not factors:
            factors.append(
                "Estimativa baseada na recorrência histórica disponível, sem sinal local forte."
            )
        if not model_used:
            factors.append("Estimativa por linha de base; histórico insuficiente para treinar o modelo.")
        explanations.append(factors[:3])

    frame = frame.copy()
    frame["top_factors"] = explanations
    return frame


def expected_incident_rate(row: dict) -> float:
    recent_rate = row["count_7d"] / (7.0 * 24.0)
    monthly_rate = row["count_30d"] / (30.0 * 24.0)
    period_rate = row["window_incident_rate_30d"]
    return max(0.0, 2.0 * (0.6 * period_rate + 0.25 * recent_rate + 0.15 * monthly_rate))
