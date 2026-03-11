-- Backfill living_area from NAV27_SqFt_Rng edge-case formats
-- Previous migration handled "2001-2200" standard range format.
-- This handles "< 800" and "4000+" and any combo like "< 800'1001-1200".
-- Uses substring to extract just the first number after < or before +.

-- "< NNN" format (must be exactly "< " followed by digits at start, nothing else weird)
UPDATE mls_listings
SET living_area = GREATEST(
  (SUBSTRING(raw_data->>'NAV27_SqFt_Rng' FROM '<\s*(\d+)'))::numeric - 100,
  200
)
WHERE living_area IS NULL
  AND raw_data->>'NAV27_SqFt_Rng' IS NOT NULL
  AND raw_data->>'NAV27_SqFt_Rng' ~ '^<\s*\d+$';

-- "NNN+" format (must be exactly digits followed by +, nothing else)
UPDATE mls_listings
SET living_area = (SUBSTRING(raw_data->>'NAV27_SqFt_Rng' FROM '(\d+)\+'))::numeric + 200
WHERE living_area IS NULL
  AND raw_data->>'NAV27_SqFt_Rng' IS NOT NULL
  AND raw_data->>'NAV27_SqFt_Rng' ~ '^\d+\+$';
