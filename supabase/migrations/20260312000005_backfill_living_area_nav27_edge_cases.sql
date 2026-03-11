-- Backfill living_area from NAV27_SqFt_Rng edge-case formats
-- Previous migration handled "2001-2200" format. This handles "< 800" and "4000+" formats.

-- "< 800" format: estimate as value minus 100 (e.g. < 800 -> 700)
UPDATE mls_listings
SET living_area = GREATEST(
  (REGEXP_REPLACE(raw_data->>'NAV27_SqFt_Rng', '^<\s*', ''))::numeric - 100,
  200
)
WHERE living_area IS NULL
  AND raw_data->>'NAV27_SqFt_Rng' ~ '^<\s*\d+';

-- "4000+" format: estimate as value plus 200 (e.g. 4000+ -> 4200)
UPDATE mls_listings
SET living_area = (REGEXP_REPLACE(raw_data->>'NAV27_SqFt_Rng', '\+.*$', ''))::numeric + 200
WHERE living_area IS NULL
  AND raw_data->>'NAV27_SqFt_Rng' ~ '^\d+\s*\+';
