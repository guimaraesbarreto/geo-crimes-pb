WITH neighborhood_union AS MATERIALIZED (
    SELECT ST_UnaryUnion(ST_Collect(ST_Transform(geometry_projected, 5880))) AS geom
    FROM neighborhood_boundaries
    WHERE city = 'João Pessoa'
),
bounds AS (
    SELECT
        ST_XMin(Box3D(geom)) AS min_x,
        ST_YMin(Box3D(geom)) AS min_y,
        ST_XMax(Box3D(geom)) AS max_x,
        ST_YMax(Box3D(geom)) AS max_y
    FROM neighborhood_union
    WHERE geom IS NOT NULL
),
grid_indices AS (
    SELECT x.i, y.j
    FROM bounds
    CROSS JOIN LATERAL generate_series(
        FLOOR(min_x / 433.0127019)::INTEGER - 2,
        CEIL(max_x / 433.0127019)::INTEGER + 2
    ) AS x(i)
    CROSS JOIN LATERAL generate_series(
        FLOOR(min_y / 500.0)::INTEGER - 2,
        CEIL(max_y / 500.0)::INTEGER + 2
    ) AS y(j)
),
hexagons AS (
    SELECT
        CONCAT('jp_', ROUND(center_x)::INTEGER, '_', ROUND(center_y)::INTEGER) AS hex_id,
        ST_MakePolygon(
            ST_MakeLine(ARRAY(
                SELECT ST_SetSRID(
                    ST_MakePoint(
                        center_x + 288.6751346 * COS(step * PI() / 3.0),
                        center_y + 288.6751346 * SIN(step * PI() / 3.0)
                    ),
                    5880
                )
                FROM generate_series(0, 6) AS step
                ORDER BY step
            ))
        ) AS geom
    FROM (
        SELECT
            i,
            j,
            i * 433.0127019 + CASE WHEN MOD(j, 2) = 0 THEN 0 ELSE 216.5063509 END AS center_x,
            j * 500.0 AS center_y
        FROM grid_indices
    ) AS centers
),
clipped_hexagons AS (
    SELECT
        hexagons.hex_id,
        ST_Multi(ST_CollectionExtract(ST_MakeValid(
            ST_Intersection(hexagons.geom, neighborhood_union.geom)
        ), 3)) AS geom
    FROM hexagons
    CROSS JOIN neighborhood_union
    WHERE ST_Intersects(hexagons.geom, neighborhood_union.geom)
),
cells AS (
    SELECT
        clipped_hexagons.hex_id,
        clipped_hexagons.geom,
        neighborhoods.name AS neighborhood_name
    FROM clipped_hexagons
    CROSS JOIN LATERAL (
        SELECT boundaries.name
        FROM neighborhood_boundaries AS boundaries
        WHERE boundaries.city = 'João Pessoa'
          AND ST_Intersects(
              clipped_hexagons.geom,
              ST_Transform(boundaries.geometry_projected, 5880)
          )
        ORDER BY ST_Area(ST_Intersection(
            clipped_hexagons.geom,
            ST_Transform(boundaries.geometry_projected, 5880)
        )) DESC
        LIMIT 1
    ) AS neighborhoods
    WHERE ST_Area(clipped_hexagons.geom) > 1
)
INSERT INTO ml_hex_grid_jp (
    hex_id,
    city,
    neighborhood_name,
    geometry_projected,
    center_projected,
    geometry_wgs84,
    center_wgs84,
    area_sq_m,
    updated_at
)
SELECT
    hex_id,
    'João Pessoa',
    neighborhood_name,
    geom,
    ST_PointOnSurface(geom),
    ST_Transform(geom, 4326),
    ST_Transform(ST_PointOnSurface(geom), 4326),
    ST_Area(geom),
    NOW()
FROM cells
ON CONFLICT (hex_id) DO UPDATE SET
    neighborhood_name = EXCLUDED.neighborhood_name,
    geometry_projected = EXCLUDED.geometry_projected,
    center_projected = EXCLUDED.center_projected,
    geometry_wgs84 = EXCLUDED.geometry_wgs84,
    center_wgs84 = EXCLUDED.center_wgs84,
    area_sq_m = EXCLUDED.area_sq_m,
    updated_at = EXCLUDED.updated_at;
