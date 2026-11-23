CREATE TABLE IF NOT EXISTS ml_hex_grid_jp (
    hex_id TEXT PRIMARY KEY,
    city VARCHAR(100) NOT NULL DEFAULT 'João Pessoa',
    neighborhood_name VARCHAR(120) NOT NULL,
    geometry_projected GEOMETRY(Geometry, 5880) NOT NULL,
    center_projected GEOMETRY(Point, 5880) NOT NULL,
    geometry_wgs84 GEOMETRY(Geometry, 4326) NOT NULL,
    center_wgs84 GEOMETRY(Point, 4326) NOT NULL,
    area_sq_m NUMERIC(14, 2) NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS ml_hex_grid_jp_geometry_gix
    ON ml_hex_grid_jp USING GIST (geometry_projected);
CREATE INDEX IF NOT EXISTS ml_hex_grid_jp_center_gix
    ON ml_hex_grid_jp USING GIST (center_projected);

CREATE INDEX IF NOT EXISTS incidents_ml_city_time_idx
    ON georeferenced_incidents (city, occurred_at)
    WHERE present_in_source = TRUE;
CREATE INDEX IF NOT EXISTS incidents_ml_projected_gix
    ON georeferenced_incidents USING GIST (location_projected);
