# Patrol ML simulation service

This FastAPI service provides a non-operational patrol-planning simulation for the
seven João Pessoa neighborhoods whose OpenStreetMap boundaries are currently
loaded into PostGIS. It consumes only synthetic mock incidents with approximate
coordinates. It must not be used to deploy real patrols or make enforcement
decisions.

## Run with Docker Compose

The service is exposed on `http://localhost:8001`. On startup it creates
`ml_hex_grid_jp` in SRID 5880 from the existing neighborhood polygons, clips
approximately 500 m hexagons to those polygons, and transforms the geometries to
SRID 4326 for GeoJSON output. If neighborhood imports complete after service
startup, the first prediction request retries the grid refresh.

## Endpoints

- `GET /health` checks the PostGIS connection.
- `GET /api/patrol/risk?turno_ou_horario=18:00` returns a simulated risk ranking
  for each hexagon. The time accepts `HH:MM` in `America/Fortaleza` or an ISO 8601
  timestamp.
- `POST /api/patrol/recommend` accepts:

```json
{
  "carros_disponiveis": 6,
  "motos_disponiveis": 8,
  "turno_ou_horario": "18:00",
  "estrategia": "balanceada"
}
```

Strategies are `preventiva_cobertura`, `foco_hotspots`, and `balanceada`.
Recommendations include approximate coverage circles and heuristic,
non-causal prevented-incident estimates. Metadata identifies the synthetic
source, limited neighborhood coverage, model, and validation status.

## Modeling notes

Features use event history available before each snapshot, grouped by hexagon and
local activity window (`05h-06h`, `07h-17h`, `18h-21h`, `22h-04h`). Training
snapshots are separated by time; temporal validation uses `TimeSeriesSplit`.
When the number of positive examples or temporal folds is insufficient, the
service reports and uses a historical baseline rather than presenting a trained
model. When temporal folds contain both outcomes, probabilities are calibrated
with a sigmoid ensemble fitted on out-of-time folds.
