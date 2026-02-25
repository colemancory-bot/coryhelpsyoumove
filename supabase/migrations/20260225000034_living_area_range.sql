-- Add living_area_range column for CSAR listings that provide a range instead of exact sqft
-- RESO field: LivingAreaRange (e.g., "1000-1500", "2000-2500")
ALTER TABLE mls_listings ADD COLUMN IF NOT EXISTS living_area_range TEXT DEFAULT '';
