# WikiCrimes Paraíba

Geo Crimes PB is a demonstration project for exploring synthetic crime data
with a web map, a Node.js API, and PostGIS spatial analysis. An optional Python
service provides a clearly labeled patrol-planning and risk-prediction
simulation.

> **Important:** This project does not use verified crime reports, authoritative
> address geocoding, police dispatch data, or a road network. Incidents and
> coordinates are synthetic or approximate. Outputs are for software and
> analytics demonstrations only; they are not operational advice and must not
> be used to deploy patrols, target people or communities, or make enforcement
> decisions.

## Components

| Component | Description | Local URL |
| --- | --- | --- |
| `mock-crime-api/` | Express and MongoDB API that generates synthetic incidents across 15 Paraíba cities. | `http://localhost:3000` |
| `wikicrimes-api/` | Express API for PostGIS points, hotspots, hexagons, proximity, and neighborhood statistics. | `http://localhost:4000` |
| `wikicrimes-web/` | Leaflet map UI. Visible interface text is in Brazilian Portuguese. | `http://localhost:8080` |
| `patrol-ml-service/` | FastAPI simulation for temporal risk scoring and vehicle-placement recommendations. | `http://localhost:8001` |
| `postgis-init/` | Initial PostGIS schema for new database volumes. | — |

Docker Compose also starts MongoDB and PostGIS. Data is persisted in the
`mongo_data` and `postgis_data` volumes.

## Requirements

- Docker Engine
- Docker Compose v2 (`docker compose`)

## Start the project

From the project root:

```bash
docker compose up --build
```

Open the map at <http://localhost:8080>. The APIs and service health endpoints
are available at:

- Mock API: <http://localhost:3000/api/incidents>
- Spatial API: <http://localhost:4000/api/map/cities>
- Patrol simulation health: <http://localhost:8001/health>
- Patrol simulation OpenAPI docs: <http://localhost:8001/docs>

Stop the containers with `Ctrl+C`, or run `docker compose down`. The named data
volumes are preserved by default. Do not remove them if you need to keep the
MongoDB or PostGIS data.

## Synthetic incident generation

When the mock API starts, it migrates legacy MongoDB incident fields and
collections. If the `incidents` collection is empty, it inserts 300 initial
synthetic records. After startup, it checks once per minute whether to add a new
record.

The current generator is configured for an **expected average of 500 generated
records per day across all 15 cities**. This is a probability-based expectation,
not a daily quota, so the actual count can be higher or lower. The generation
probability is higher at night and lower during the day. A record includes a
city, neighborhood, street, incident type, victim and offender counts, and
timestamps. Locations and addresses are not verified.

Run the mock API tests locally:

```bash
cd mock-crime-api
npm test
```

## API overview

### Mock incident API

Common query filters include `type`, `city`, `neighborhood`, `startDate`, and
`endDate`, where applicable.

| Method and path | Description |
| --- | --- |
| `GET /api/incidents` | Paginated incident list (`page`, `limit`). |
| `GET /api/incidents/search-address?q=...` | Search incident address text. |
| `GET /api/incidents/critical-streets` | Rank streets by incident count. |
| `GET /api/incidents/sync?since=...&limit=...` | Incremental sync ordered by creation time. |
| `GET /api/statistics` | Grouped incident, victim, and offender counts. |
| `GET /api/statistics/daily-evolution` | Daily grouped counts in `America/Fortaleza`. |

Example:

```bash
curl 'http://localhost:3000/api/incidents?city=Jo%C3%A3o%20Pessoa&limit=10'
```

### Spatial API

Common filters include `city`, `type`, and `neighborhood` where applicable.

| Method and path | Description |
| --- | --- |
| `GET /api/map/cities` | Cities present in synchronized incidents. |
| `GET /api/map/points` | Incident points as GeoJSON. |
| `GET /api/map/hotspots` | DBSCAN-based clusters as GeoJSON. |
| `GET /api/map/hexagons` | Hexagonal aggregation of incident counts. |
| `GET /api/map/proximity?latitude=...&longitude=...&radiusMeters=...` | Nearby incidents using `ST_DWithin`. |
| `GET /api/map/neighborhoods?city=Jo%C3%A3o%20Pessoa` | Neighborhood boundaries and spatial statistics. |

Neighborhood polygons are OpenStreetMap-derived and currently cover seven
neighborhoods in João Pessoa only. Attribution and license information are
included in `wikicrimes-api/joao_pessoa_neighborhoods.geojson`.

### Patrol ML simulation

This service currently runs independently on port 8001; it is **not proxied
through the spatial API or displayed in the web UI**.

- `GET /api/patrol/risk?turno_ou_horario=18:00` returns a risk ranking for each
  grid cell.
- `POST /api/patrol/recommend` accepts a JSON request such as:

```json
{
  "carros_disponiveis": 6,
  "motos_disponiveis": 8,
  "turno_ou_horario": "18:00",
  "estrategia": "balanceada"
}
```

Supported strategies are `preventiva_cobertura`, `foco_hotspots`, and
`balanceada`. Time can be supplied as `HH:MM`, a named period, or an ISO 8601
timestamp; plain clock times use the `America/Fortaleza` time zone.

The service creates `ml_hex_grid_jp` in PostGIS with approximately 500 m
hexagons clipped to the available neighborhood boundaries. Distances use SRID
5880 and GeoJSON uses SRID 4326. Model features include 24-hour, 7-day, 14-day,
and 30-day counts, hourly activity periods, severity, crime type, and neighboring
cell activity. The pipeline uses temporal walk-forward validation and sigmoid
calibration when the available sample supports it. Otherwise, it explicitly
reports and uses a historical baseline. The current mock history may be too
small to train a meaningful model.

The returned coverage areas and estimated prevented-incident values are
heuristics, not measured effects or causal estimates.

Run the patrol service tests locally after installing
`patrol-ml-service/requirements.txt`:

```bash
cd patrol-ml-service
python -m unittest discover -s tests -v
```

## Data and spatial reference notes

- The mock generator includes 15 cities in Paraíba; neighborhood boundary
  coverage in PostGIS is currently limited to seven João Pessoa neighborhoods.
- Incident points are synthetic and approximately geocoded. They should not be
  interpreted as actual incident addresses or locations.
- Incident geometries are stored in SRID 5880 for metric analysis and SRID 4326
  for web mapping.
- Neighborhood geometries are stored in SRID 31985 and transformed as needed.
- `postgis-init/01-init.sql` initializes a new database volume. The spatial API
  also performs schema migration when it starts against an existing volume.

## Configuration

Docker Compose supplies the service connection settings. The main variables
include:

| Variable | Used by | Compose default |
| --- | --- | --- |
| `MONGO_URI` | Mock API | `mongodb://mongodb:27017/ssp_mock` |
| `DATABASE_URL` | Spatial API | `postgres://wikicrimes:wikicrimes_pass@postgis:5432/wikicrimes_geo` |
| `MOCK_API_URL` | Spatial API | `http://mock-api:3000` |
| `DATABASE_URL` | Patrol ML service | `postgresql+psycopg2://wikicrimes:wikicrimes_pass@postgis:5432/wikicrimes_geo` |
| `TIME_ZONE` | Patrol ML service | `America/Fortaleza` |

The credentials in the Compose file are for local demonstration only. Replace
them and use an appropriate secrets-management approach before deploying to a
shared or public environment.
