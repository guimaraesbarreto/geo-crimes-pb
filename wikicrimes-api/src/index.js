const express = require('express');
const cors = require('cors');
const axios = require('axios');
const cron = require('node-cron');
const { Pool } = require('pg');
const { geocodeAddress } = require('./geocoder');
const { importNeighborhoods } = require('./seedNeighborhoods');

const app = express();
app.use(cors());
app.use(express.json());

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgres://localhost:5432/wikicrimes_geo'
});

const MOCK_API_URL = process.env.MOCK_API_URL || 'http://mock-api:3000';

async function migrateSpatialSchema() {
  await pool.query(`
    DO $$
    DECLARE
      item RECORD;
    BEGIN
      FOR item IN
        SELECT * FROM (VALUES
          ('sync_control', 'synchronization_state'),
          ('crimes_geo', 'georeferenced_incidents'),
          ('bairros_jp', 'neighborhood_boundaries')
        ) AS table_names(old_name, new_name)
      LOOP
        IF to_regclass('public.' || quote_ident(item.old_name)) IS NOT NULL
          AND to_regclass('public.' || quote_ident(item.new_name)) IS NULL THEN
          EXECUTE format('ALTER TABLE %I RENAME TO %I', item.old_name, item.new_name);
        END IF;
      END LOOP;

      FOR item IN
        SELECT * FROM (VALUES
          ('synchronization_state', 'ultimo_timestamp', 'last_synced_at'),
          ('georeferenced_incidents', 'mongo_id', 'source_id'),
          ('georeferenced_incidents', 'tipo', 'type'),
          ('georeferenced_incidents', 'cidade', 'city'),
          ('georeferenced_incidents', 'estado', 'state'),
          ('georeferenced_incidents', 'bairro', 'neighborhood'),
          ('georeferenced_incidents', 'rua', 'street'),
          ('georeferenced_incidents', 'endereco', 'address'),
          ('georeferenced_incidents', 'numero_vitimas', 'victim_count'),
          ('georeferenced_incidents', 'numero_criminosos', 'offender_count'),
          ('georeferenced_incidents', 'presente_na_origem', 'present_in_source'),
          ('georeferenced_incidents', 'data_ocorrencia', 'occurred_at'),
          ('georeferenced_incidents', 'geom_4326', 'location_wgs84'),
          ('georeferenced_incidents', 'geom_5880', 'location_projected'),
          ('georeferenced_incidents', 'geom_31985', 'location_projected'),
          ('neighborhood_boundaries', 'nome', 'name'),
          ('neighborhood_boundaries', 'geom_4326', 'geometry_wgs84'),
          ('neighborhood_boundaries', 'geom_31985', 'geometry_projected'),
          ('neighborhood_boundaries', 'area_km2', 'area_sq_km')
        ) AS column_names(table_name, old_name, new_name)
      LOOP
        IF to_regclass('public.' || quote_ident(item.table_name)) IS NOT NULL
          AND EXISTS (
            SELECT 1 FROM information_schema.columns
            WHERE table_schema = 'public'
              AND table_name = item.table_name
              AND column_name = item.old_name
          )
          AND NOT EXISTS (
            SELECT 1 FROM information_schema.columns
            WHERE table_schema = 'public'
              AND table_name = item.table_name
              AND column_name = item.new_name
          ) THEN
          EXECUTE format(
            'ALTER TABLE %I RENAME COLUMN %I TO %I',
            item.table_name, item.old_name, item.new_name
          );
        END IF;
      END LOOP;
    END
    $$;

    CREATE TABLE IF NOT EXISTS synchronization_state (
      id INT PRIMARY KEY DEFAULT 1,
      last_synced_at TIMESTAMPTZ
    );
    INSERT INTO synchronization_state (id, last_synced_at)
      VALUES (1, NULL) ON CONFLICT DO NOTHING;

    CREATE TABLE IF NOT EXISTS georeferenced_incidents (
      id SERIAL PRIMARY KEY,
      source_id VARCHAR(50) UNIQUE NOT NULL,
      type VARCHAR(100) NOT NULL,
      city VARCHAR(100) NOT NULL,
      state VARCHAR(2) NOT NULL DEFAULT 'PB',
      neighborhood VARCHAR(100) NOT NULL,
      street VARCHAR(150) NOT NULL,
      address TEXT NOT NULL,
      victim_count SMALLINT NOT NULL DEFAULT 1,
      offender_count SMALLINT NOT NULL DEFAULT 1,
      present_in_source BOOLEAN NOT NULL DEFAULT FALSE,
      occurred_at TIMESTAMPTZ NOT NULL,
      location_wgs84 GEOMETRY(Point, 4326) NOT NULL,
      location_projected GEOMETRY(Point, 5880) NOT NULL
    );
    ALTER TABLE georeferenced_incidents ADD COLUMN IF NOT EXISTS city VARCHAR(100);
    ALTER TABLE georeferenced_incidents ADD COLUMN IF NOT EXISTS state VARCHAR(2);
    ALTER TABLE georeferenced_incidents ADD COLUMN IF NOT EXISTS victim_count SMALLINT;
    ALTER TABLE georeferenced_incidents ADD COLUMN IF NOT EXISTS offender_count SMALLINT;
    ALTER TABLE georeferenced_incidents ADD COLUMN IF NOT EXISTS present_in_source BOOLEAN NOT NULL DEFAULT FALSE;
    UPDATE georeferenced_incidents SET city = 'João Pessoa' WHERE city IS NULL;
    UPDATE georeferenced_incidents SET state = 'PB' WHERE state IS NULL;
    UPDATE georeferenced_incidents SET victim_count = 1 WHERE victim_count IS NULL;
    UPDATE georeferenced_incidents SET offender_count = 1 WHERE offender_count IS NULL;
    ALTER TABLE georeferenced_incidents ALTER COLUMN city SET NOT NULL;
    ALTER TABLE georeferenced_incidents ALTER COLUMN state SET DEFAULT 'PB';
    ALTER TABLE georeferenced_incidents ALTER COLUMN state SET NOT NULL;
    ALTER TABLE georeferenced_incidents ALTER COLUMN victim_count SET DEFAULT 1;
    ALTER TABLE georeferenced_incidents ALTER COLUMN victim_count SET NOT NULL;
    ALTER TABLE georeferenced_incidents ALTER COLUMN offender_count SET DEFAULT 1;
    ALTER TABLE georeferenced_incidents ALTER COLUMN offender_count SET NOT NULL;

    DO $$
    BEGIN
      IF Find_SRID('public', 'georeferenced_incidents', 'location_projected') <> 5880 THEN
        ALTER TABLE georeferenced_incidents ALTER COLUMN location_projected
          TYPE geometry(Point, 5880)
          USING ST_Transform(location_projected, 5880);
      END IF;
      IF NOT EXISTS (
        SELECT 1 FROM georeferenced_incidents WHERE present_in_source = TRUE
      ) THEN
        UPDATE synchronization_state SET last_synced_at = NULL WHERE id = 1;
      END IF;
    END
    $$;

    UPDATE georeferenced_incidents SET type = CASE type
      WHEN 'Furto' THEN 'Theft'
      WHEN 'Roubo a Transeunte' THEN 'Street Robbery'
      WHEN 'Furto de Veículo' THEN 'Vehicle Theft'
      WHEN 'Vandalismo' THEN 'Vandalism'
      WHEN 'Roubo a Comércio' THEN 'Commercial Robbery'
      ELSE type
    END;

    CREATE TABLE IF NOT EXISTS neighborhood_boundaries (
      id SERIAL PRIMARY KEY,
      city VARCHAR(100) NOT NULL DEFAULT 'João Pessoa',
      name VARCHAR(120) NOT NULL,
      geometry_wgs84 GEOMETRY(MultiPolygon, 4326) NOT NULL,
      geometry_projected GEOMETRY(MultiPolygon, 31985) NOT NULL,
      area_sq_km NUMERIC(10, 4) NOT NULL
    );
    ALTER TABLE neighborhood_boundaries ADD COLUMN IF NOT EXISTS city VARCHAR(100);
    UPDATE neighborhood_boundaries SET city = 'João Pessoa' WHERE city IS NULL;
    ALTER TABLE neighborhood_boundaries ALTER COLUMN city SET DEFAULT 'João Pessoa';
    ALTER TABLE neighborhood_boundaries ALTER COLUMN city SET NOT NULL;
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
  `);
}

async function synchronizeIncidents() {
  const client = await pool.connect();
  let transactionOpen = false;
  try {
    const syncState = await client.query(
      'SELECT last_synced_at FROM synchronization_state WHERE id = 1'
    );
    const lastSyncedAt = syncState.rows.at(0)?.last_synced_at;
    const url = lastSyncedAt
      ? `${MOCK_API_URL}/api/incidents/sync?since=${encodeURIComponent(lastSyncedAt.toISOString())}&limit=500`
      : `${MOCK_API_URL}/api/incidents/sync?limit=500`;
    const { data } = await axios.get(url);

    if (data.count === 0) return;

    await client.query('BEGIN');
    transactionOpen = true;

    for (const incident of data.data) {
      const { lon, lat } = geocodeAddress(
        incident.city,
        incident.neighborhood,
        incident.street,
        incident.address
      );

      await client.query(`
        INSERT INTO georeferenced_incidents (
          source_id, type, city, state, neighborhood, street, address,
          victim_count, offender_count, occurred_at,
          location_wgs84, location_projected, present_in_source
        )
        VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8, $9, $10,
          ST_SetSRID(ST_MakePoint($11, $12), 4326),
          ST_Transform(ST_SetSRID(ST_MakePoint($11, $12), 4326), 5880),
          TRUE
        )
        ON CONFLICT (source_id) DO UPDATE SET
          type = EXCLUDED.type,
          city = EXCLUDED.city,
          state = EXCLUDED.state,
          neighborhood = EXCLUDED.neighborhood,
          street = EXCLUDED.street,
          address = EXCLUDED.address,
          victim_count = EXCLUDED.victim_count,
          offender_count = EXCLUDED.offender_count,
          occurred_at = EXCLUDED.occurred_at,
          location_wgs84 = EXCLUDED.location_wgs84,
          location_projected = EXCLUDED.location_projected,
          present_in_source = TRUE
      `, [
        incident._id,
        incident.type,
        incident.city,
        incident.state,
        incident.neighborhood,
        incident.street,
        incident.address,
        incident.victimCount,
        incident.offenderCount,
        incident.occurredAt,
        lon,
        lat
      ]);
    }

    if (data.lastTimestamp) {
      await client.query(
        'UPDATE synchronization_state SET last_synced_at = $1 WHERE id = 1',
        [data.lastTimestamp]
      );
    }

    await client.query('COMMIT');
    transactionOpen = false;
    console.log(`[PostGIS worker] Synchronized ${data.count} georeferenced incidents.`);
  } catch (error) {
    if (transactionOpen) await client.query('ROLLBACK');
    console.error('[PostGIS worker] Incident synchronization failed:', error.message);
  } finally {
    client.release();
  }
}

function readText(query, name, maximumLength = 100) {
  const value = query[name];
  if (value === undefined) return null;
  if (typeof value !== 'string' || !value.trim() || value.length > maximumLength) {
    const error = new Error(`${name} must be text with up to ${maximumLength} characters.`);
    error.status = 400;
    throw error;
  }
  return value.trim();
}

function buildFilters(query, fields = ['type', 'city', 'neighborhood'], placeholderOffset = 0) {
  const params = [];
  const conditions = ['present_in_source = TRUE'];
  for (const field of fields) {
    const value = readText(query, field);
    if (value) {
      params.push(value);
      conditions.push(`${field} = $${params.length + placeholderOffset}`);
    }
  }
  return { params, where: `WHERE ${conditions.join(' AND ')}` };
}

function readNumber(query, name, defaultValue, minimum, maximum) {
  const value = query[name] ?? defaultValue;
  if (typeof value !== 'string' || !/^-?\d+(\.\d+)?$/.test(value)) {
    const error = new Error(`${name} must be numeric.`);
    error.status = 400;
    throw error;
  }
  const number = Number(value);
  if (!Number.isFinite(number) || number < minimum || number > maximum) {
    const error = new Error(`${name} must be between ${minimum} and ${maximum}.`);
    error.status = 400;
    throw error;
  }
  return number;
}

function sendError(response, error) {
  if (error.status === 400) return response.status(400).json({ error: error.message });
  console.error('Request failed:', error);
  return response.status(500).json({ error: 'An internal error occurred while processing the request.' });
}

app.get('/api/map/points', async (request, response) => {
  try {
    const { params, where } = buildFilters(request.query);
    const result = await pool.query(`
      SELECT json_build_object(
        'type', 'FeatureCollection',
        'features', COALESCE(json_agg(
          json_build_object(
            'type', 'Feature',
            'geometry', ST_AsGeoJSON(location_wgs84)::json,
            'properties', json_build_object(
              'id', id,
              'type', type,
              'city', city,
              'state', state,
              'neighborhood', neighborhood,
              'address', address,
              'occurred_at', occurred_at,
              'victim_count', victim_count,
              'offender_count', offender_count
            )
          )
        ), '[]'::json)
      ) AS geojson
      FROM georeferenced_incidents
      ${where}
    `, params);
    response.json(result.rows.at(0).geojson);
  } catch (error) {
    sendError(response, error);
  }
});

app.get('/api/map/cities', async (_request, response) => {
  try {
    const result = await pool.query(
      'SELECT DISTINCT city FROM georeferenced_incidents WHERE present_in_source = TRUE ORDER BY city'
    );
    response.json({ cities: result.rows.map((row) => row.city) });
  } catch (error) {
    sendError(response, error);
  }
});

app.get('/api/map/hotspots', async (request, response) => {
  try {
    const radius = readNumber(request.query, 'radius', '350', 50, 5000);
    const minimumPoints = readNumber(request.query, 'minimumPoints', '4', 2, 100);
    const filters = buildFilters(request.query, ['type', 'city', 'neighborhood'], 2);
    const result = await pool.query(`
      WITH clusters AS (
        SELECT
          id, type, city, neighborhood, victim_count, offender_count,
          location_projected,
          ST_ClusterDBSCAN(location_projected, eps := $1, minpoints := $2)
            OVER (PARTITION BY city) AS cluster_id
        FROM georeferenced_incidents
        ${filters.where}
      ),
      hotspot_polygons AS (
        SELECT
          city,
          cluster_id,
          COUNT(*) AS incident_count,
          SUM(victim_count) AS victim_count,
          SUM(offender_count) AS offender_count,
          MODE() WITHIN GROUP (ORDER BY type) AS predominant_type,
          MODE() WITHIN GROUP (ORDER BY neighborhood) AS primary_neighborhood,
          ST_Transform(
            ST_Buffer(ST_ConvexHull(ST_Collect(location_projected)), 80),
            4326
          ) AS hotspot_area
        FROM clusters
        WHERE cluster_id IS NOT NULL
        GROUP BY city, cluster_id
      )
      SELECT json_build_object(
        'type', 'FeatureCollection',
        'features', COALESCE(json_agg(
          json_build_object(
            'type', 'Feature',
            'geometry', ST_AsGeoJSON(hotspot_area)::json,
            'properties', json_build_object(
              'cluster_id', cluster_id,
              'city', city,
              'incident_count', incident_count,
              'victim_count', victim_count,
              'offender_count', offender_count,
              'predominant_type', predominant_type,
              'primary_neighborhood', primary_neighborhood
            )
          )
        ), '[]'::json)
      ) AS geojson
      FROM hotspot_polygons
    `, [radius, minimumPoints, ...filters.params]);
    response.json(result.rows.at(0).geojson);
  } catch (error) {
    sendError(response, error);
  }
});

app.get('/api/map/hexagons', async (request, response) => {
  try {
    const size = readNumber(request.query, 'size', '400', 100, 5000);
    const filters = buildFilters(request.query, ['type', 'city', 'neighborhood'], 1);
    const result = await pool.query(`
      WITH filtered_incidents AS (
        SELECT id, city, victim_count, offender_count, location_projected
        FROM georeferenced_incidents
        ${filters.where}
      ),
      city_bounds AS (
        SELECT city, ST_Expand(ST_Extent(location_projected), 500) AS bbox
        FROM filtered_incidents
        GROUP BY city
      ),
      grid AS (
        SELECT bounds.city, hex.i, hex.j, ST_SetSRID(hex.geom, 5880) AS geometry
        FROM city_bounds AS bounds
        CROSS JOIN LATERAL ST_HexagonGrid($1, bounds.bbox) AS hex
      ),
      counts AS (
        SELECT
          grid.city,
          grid.i,
          grid.j,
          COUNT(incidents.id) AS incident_count,
          SUM(incidents.victim_count) AS victim_count,
          SUM(incidents.offender_count) AS offender_count,
          ST_Transform(grid.geometry, 4326) AS geometry_wgs84
        FROM grid
        JOIN filtered_incidents AS incidents
          ON incidents.city = grid.city
          AND ST_Intersects(grid.geometry, incidents.location_projected)
        GROUP BY grid.city, grid.i, grid.j, grid.geometry
      )
      SELECT json_build_object(
        'type', 'FeatureCollection',
        'features', COALESCE(json_agg(
          json_build_object(
            'type', 'Feature',
            'geometry', ST_AsGeoJSON(geometry_wgs84)::json,
            'properties', json_build_object(
              'city', city,
              'incident_count', incident_count,
              'victim_count', victim_count,
              'offender_count', offender_count
            )
          )
        ), '[]'::json)
      ) AS geojson
      FROM counts
    `, [size, ...filters.params]);
    response.json(result.rows.at(0).geojson);
  } catch (error) {
    sendError(response, error);
  }
});

app.get('/api/map/proximity', async (request, response) => {
  try {
    const latitude = readNumber(request.query, 'latitude', undefined, -90, 90);
    const longitude = readNumber(request.query, 'longitude', undefined, -180, 180);
    const radiusMeters = readNumber(request.query, 'radiusMeters', '500', 1, 50000);
    const city = readText(request.query, 'city');
    const params = [longitude, latitude, radiusMeters];
    const cityFilter = city ? (params.push(city), `AND city = $${params.length}`) : '';
    const result = await pool.query(`
      SELECT
        id, type, city, state, neighborhood, address, occurred_at,
        victim_count, offender_count,
        COUNT(*) OVER() AS total_found,
        ROUND(ST_Distance(
          location_projected,
          ST_Transform(ST_SetSRID(ST_MakePoint($1, $2), 4326), 5880)
        )::numeric, 1) AS distance_meters
      FROM georeferenced_incidents
      WHERE ST_DWithin(
        location_projected,
        ST_Transform(ST_SetSRID(ST_MakePoint($1, $2), 4326), 5880),
        $3
      )
      AND present_in_source = TRUE
      ${cityFilter}
      ORDER BY distance_meters ASC
      LIMIT 100
    `, params);
    const total = Number(result.rows[0]?.total_found || 0);
    const incidents = result.rows.map(({ total_found: _total, ...incident }) => incident);
    response.json({ radius_meters: radiusMeters, total, returned_count: incidents.length, incidents });
  } catch (error) {
    sendError(response, error);
  }
});

app.get('/api/map/neighborhoods', async (request, response) => {
  try {
    const type = readText(request.query, 'type');
    const city = readText(request.query, 'city');
    if (city && city !== 'João Pessoa') {
      return response.json({
        type: 'FeatureCollection',
        features: [],
        notice: 'Os limites de bairros estão disponíveis apenas para João Pessoa.'
      });
    }
    if (!city) {
      return response.json({
        type: 'FeatureCollection',
        features: [],
        notice: 'Selecione João Pessoa para visualizar os limites de bairros disponíveis.'
      });
    }

    const params = ['João Pessoa'];
    const typeFilter = type ? (params.push(type), 'AND incidents.type = $2') : '';
    const result = await pool.query(`
      WITH neighborhood_statistics AS (
        SELECT
          boundaries.id,
          boundaries.name,
          boundaries.area_sq_km,
          boundaries.geometry_wgs84,
          COUNT(incidents.id) AS incident_count,
          COALESCE(SUM(incidents.victim_count), 0) AS victim_count,
          COALESCE(SUM(incidents.offender_count), 0) AS offender_count
        FROM neighborhood_boundaries AS boundaries
        LEFT JOIN georeferenced_incidents AS incidents
          ON ST_Contains(ST_Transform(boundaries.geometry_projected, 5880), incidents.location_projected)
          AND incidents.city = $1
          AND incidents.present_in_source = TRUE
          ${typeFilter}
        WHERE boundaries.city = $1
        GROUP BY boundaries.id, boundaries.name, boundaries.area_sq_km, boundaries.geometry_wgs84
      )
      SELECT json_build_object(
        'type', 'FeatureCollection',
        'features', COALESCE(json_agg(
          json_build_object(
            'type', 'Feature',
            'geometry', ST_AsGeoJSON(ST_SimplifyPreserveTopology(geometry_wgs84, 0.00005))::json,
            'properties', json_build_object(
              'id', id,
              'city', 'João Pessoa',
              'name', name,
              'area_sq_km', ROUND(area_sq_km, 2),
              'incident_count', incident_count,
              'victim_count', victim_count,
              'offender_count', offender_count,
              'incidents_per_sq_km', CASE
                WHEN area_sq_km > 0 THEN ROUND((incident_count / area_sq_km)::numeric, 2)
                ELSE 0
              END
            )
          )
        ), '[]'::json)
      ) AS geojson
      FROM neighborhood_statistics
    `, params);
    response.json(result.rows.at(0).geojson);
  } catch (error) {
    sendError(response, error);
  }
});

const PORT = process.env.PORT || 4000;

async function start() {
  await migrateSpatialSchema();
  await importNeighborhoods(pool);
  cron.schedule('*/15 * * * * *', synchronizeIncidents);
  app.listen(PORT, () => {
    console.log(`Spatial API listening on port ${PORT}`);
    setTimeout(synchronizeIncidents, 3000);
  });
}

start().catch((error) => {
  console.error('Failed to start spatial API:', error);
  process.exitCode = 1;
});
