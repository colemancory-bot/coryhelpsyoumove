-- Backfill living_area from NAV27_SqFt_Rng (CSAR/Navica custom field)
-- CSAR stores sqft as ranges like "2001-2200" in NAV27_SqFt_Rng instead of LivingAreaRange
-- This is the primary source of sqft data for most CSAR residential listings
-- Uses midpoint of range as the living_area value

-- First: NAV27_SqFt_Rng range format "2001-2200"
UPDATE mls_listings
SET living_area = ROUND((
  SPLIT_PART(raw_data->>'NAV27_SqFt_Rng', '-', 1)::numeric +
  SPLIT_PART(raw_data->>'NAV27_SqFt_Rng', '-', 2)::numeric
) / 2.0)
WHERE living_area IS NULL
  AND raw_data->>'NAV27_SqFt_Rng' IS NOT NULL
  AND raw_data->>'NAV27_SqFt_Rng' != ''
  AND raw_data->>'NAV27_SqFt_Rng' ~ '^\d+-\d+$';

-- Second: NAV27_Htd_SqFt (exact value if available)
UPDATE mls_listings
SET living_area = (raw_data->>'NAV27_Htd_SqFt')::numeric
WHERE living_area IS NULL
  AND raw_data->>'NAV27_Htd_SqFt' IS NOT NULL
  AND raw_data->>'NAV27_Htd_SqFt' ~ '^\d+\.?\d*$';

-- Also store the range in living_area_range column for reference
UPDATE mls_listings
SET living_area_range = raw_data->>'NAV27_SqFt_Rng'
WHERE (living_area_range IS NULL OR living_area_range = '')
  AND raw_data->>'NAV27_SqFt_Rng' IS NOT NULL
  AND raw_data->>'NAV27_SqFt_Rng' != '';
