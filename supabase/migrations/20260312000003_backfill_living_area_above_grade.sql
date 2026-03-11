-- Backfill living_area from AboveGradeFinishedArea or BuildingAreaTotal
-- Some CSAR listings have no LivingArea or LivingAreaRange but do have these RESO fields
-- This catches the remaining NULL living_area records after the LivingAreaRange midpoint backfill

UPDATE mls_listings
SET living_area = COALESCE(
  (raw_data->>'AboveGradeFinishedArea')::numeric,
  (raw_data->>'BuildingAreaTotal')::numeric
)
WHERE living_area IS NULL
  AND (raw_data->>'AboveGradeFinishedArea' IS NOT NULL
    OR raw_data->>'BuildingAreaTotal' IS NOT NULL);
