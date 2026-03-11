-- Backfill NULL lot_size_acres from raw_data
-- The Navica backfill sync path was missing LotSizeArea + LotSizeUnits fallback logic
-- This fixes existing closed listings that have acreage data in raw_data but NULL in the column

-- Fix lot_size_acres from LotSizeArea (when units = Acres) or LotSizeSquareFeet
UPDATE mls_listings
SET
  lot_size_acres = CASE
    WHEN raw_data->>'LotSizeUnits' = 'Acres' AND raw_data->>'LotSizeArea' IS NOT NULL
      THEN (raw_data->>'LotSizeArea')::numeric
    WHEN raw_data->>'LotSizeSquareFeet' IS NOT NULL
      THEN (raw_data->>'LotSizeSquareFeet')::numeric / 43560.0
    ELSE lot_size_acres
  END,
  lot_size_square_feet = CASE
    WHEN raw_data->>'LotSizeSquareFeet' IS NOT NULL
      THEN (raw_data->>'LotSizeSquareFeet')::numeric
    WHEN raw_data->>'LotSizeUnits' = 'Acres' AND raw_data->>'LotSizeArea' IS NOT NULL
      THEN (raw_data->>'LotSizeArea')::numeric * 43560.0
    ELSE lot_size_square_feet
  END
WHERE lot_size_acres IS NULL
  AND (raw_data->>'LotSizeArea' IS NOT NULL OR raw_data->>'LotSizeSquareFeet' IS NOT NULL);

-- Fix living_area from LivingAreaRange midpoint when LivingArea is NULL
-- CSAR allows ranges like "2000-3000" instead of exact sqft
UPDATE mls_listings
SET living_area = CASE
  WHEN raw_data->>'LivingAreaRange' ~ '^\d+\s*-\s*\d+$'
    THEN ROUND((
      SPLIT_PART(raw_data->>'LivingAreaRange', '-', 1)::numeric +
      SPLIT_PART(raw_data->>'LivingAreaRange', '-', 2)::numeric
    ) / 2.0)
  WHEN raw_data->>'LivingAreaRange' ~ '^\d+$'
    THEN (raw_data->>'LivingAreaRange')::numeric
  ELSE living_area
END
WHERE living_area IS NULL
  AND raw_data->>'LivingAreaRange' IS NOT NULL
  AND raw_data->>'LivingAreaRange' != '';
