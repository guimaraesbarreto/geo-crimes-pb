CREATE EXTENSION IF NOT EXISTS postgis;

CREATE TABLE IF NOT EXISTS synchronization_state (
    id INT PRIMARY KEY DEFAULT 1,
    last_synced_at TIMESTAMPTZ
);
INSERT INTO synchronization_state (id, last_synced_at)
VALUES (1, NULL)
ON CONFLICT DO NOTHING;

CREATE TABLE IF NOT EXISTS georeferenced_incidents (
    id SERIAL PRIMARY KEY,
    source_id VARCHAR(50) UNIQUE NOT NULL,
    type VARCHAR(100) NOT NULL,
    city VARCHAR(100) NOT NULL,
    state VARCHAR(2) NOT NULL DEFAULT 'PB',
    neighborhood VARCHAR(100) NOT NULL,
    street VARCHAR(150) NOT NULL,
    address TEXT NOT NULL,
    victim_count SMALLINT NOT NULL CHECK (victim_count BETWEEN 1 AND 5),
    offender_count SMALLINT NOT NULL CHECK (offender_count BETWEEN 1 AND 4),
    present_in_source BOOLEAN NOT NULL DEFAULT FALSE,
    occurred_at TIMESTAMPTZ NOT NULL,
    location_wgs84 GEOMETRY(Point, 4326) NOT NULL,
    location_projected GEOMETRY(Point, 5880) NOT NULL
);

CREATE TABLE IF NOT EXISTS neighborhood_boundaries (
    id SERIAL PRIMARY KEY,
    city VARCHAR(100) NOT NULL,
    name VARCHAR(120) NOT NULL,
    geometry_wgs84 GEOMETRY(MultiPolygon, 4326) NOT NULL,
    geometry_projected GEOMETRY(MultiPolygon, 31985) NOT NULL,
    area_sq_km NUMERIC(10, 4) NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS neighborhood_boundaries_city_name_idx
    ON neighborhood_boundaries (city, name);

CREATE INDEX IF NOT EXISTS neighborhood_boundaries_wgs84_gix
    ON neighborhood_boundaries USING GIST (geometry_wgs84);
CREATE INDEX IF NOT EXISTS neighborhood_boundaries_projected_gix
    ON neighborhood_boundaries USING GIST (geometry_projected);
CREATE INDEX IF NOT EXISTS incidents_location_wgs84_gix
    ON georeferenced_incidents USING GIST (location_wgs84);
CREATE INDEX IF NOT EXISTS incidents_location_projected_gix
    ON georeferenced_incidents USING GIST (location_projected);
CREATE INDEX IF NOT EXISTS incidents_type_idx ON georeferenced_incidents (type);
CREATE INDEX IF NOT EXISTS incidents_occurred_at_idx ON georeferenced_incidents (occurred_at);
CREATE INDEX IF NOT EXISTS incidents_city_neighborhood_idx
    ON georeferenced_incidents (city, neighborhood);
CREATE INDEX IF NOT EXISTS incidents_present_source_idx
    ON georeferenced_incidents (city, type)
    WHERE present_in_source = TRUE;
