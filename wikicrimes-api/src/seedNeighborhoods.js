const fs = require('node:fs');
const path = require('node:path');
const { Pool } = require('pg');
const neighborhoodCity = 'João Pessoa';

const joaoPessoaNeighborhoodsGeoJSON = JSON.parse(
  fs.readFileSync(path.join(__dirname, '../joao_pessoa_neighborhoods.geojson'), 'utf8')
);

async function importNeighborhoods(pool) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    for (const feature of joaoPessoaNeighborhoodsGeoJSON.features) {
      await client.query(`
        WITH geom_raw AS (
          SELECT ST_Multi(ST_MakeValid(ST_SetSRID(ST_GeomFromGeoJSON($3), 4326))) AS g4326
        ),
        geom_proj AS (
          SELECT g4326, ST_Transform(g4326, 31985) AS g31985 FROM geom_raw
        )
        INSERT INTO neighborhood_boundaries (
          city, name, geometry_wgs84, geometry_projected, area_sq_km
        )
        SELECT $1, $2, g4326, g31985, ST_Area(g31985) / 1000000.0
        FROM geom_proj
        ON CONFLICT (city, name) DO UPDATE SET
          geometry_wgs84 = EXCLUDED.geometry_wgs84,
          geometry_projected = EXCLUDED.geometry_projected,
          area_sq_km = EXCLUDED.area_sq_km
      `, [neighborhoodCity, feature.properties.name, JSON.stringify(feature.geometry)]);
    }

    await client.query('COMMIT');
    console.log(`Imported ${joaoPessoaNeighborhoodsGeoJSON.features.length} neighborhood boundaries.`);
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

if (require.main === module) {
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL || '******localhost:5432/wikicrimes_geo'
  });

  importNeighborhoods(pool)
    .catch((err) => {
      console.error('Failed to import neighborhood boundaries:', err);
      process.exitCode = 1;
    })
    .finally(() => pool.end());
}

module.exports = { importNeighborhoods };
