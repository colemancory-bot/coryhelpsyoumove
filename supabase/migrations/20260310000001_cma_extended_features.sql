-- Add extended CMA feature fields for above/below grade sqft and septic bedrooms
-- These support NC-specific valuation nuances

-- Above/below grade square footage breakdown
ALTER TABLE cma_feature_tags ADD COLUMN IF NOT EXISTS above_grade_sqft INT;
ALTER TABLE cma_feature_tags ADD COLUMN IF NOT EXISTS below_grade_sqft INT;
ALTER TABLE cma_feature_tags ADD COLUMN IF NOT EXISTS sqft_source TEXT DEFAULT 'unknown'
  CHECK (sqft_source IN ('mls_structured', 'ai_inferred', 'unknown'));

-- Septic-permitted bedrooms (NC-specific: septic permit limits functional bedrooms)
ALTER TABLE cma_feature_tags ADD COLUMN IF NOT EXISTS septic_permitted_bedrooms INT;

-- Land-specific fields
ALTER TABLE cma_feature_tags ADD COLUMN IF NOT EXISTS utilities_available TEXT[] DEFAULT '{}';
ALTER TABLE cma_feature_tags ADD COLUMN IF NOT EXISTS perc_status TEXT DEFAULT '';
ALTER TABLE cma_feature_tags ADD COLUMN IF NOT EXISTS timber_quality TEXT DEFAULT '';
ALTER TABLE cma_feature_tags ADD COLUMN IF NOT EXISTS buildable_sites INT;
ALTER TABLE cma_feature_tags ADD COLUMN IF NOT EXISTS road_frontage_ft INT;
ALTER TABLE cma_feature_tags ADD COLUMN IF NOT EXISTS subdivision_potential BOOLEAN;
ALTER TABLE cma_feature_tags ADD COLUMN IF NOT EXISTS restrictions_summary TEXT DEFAULT '';
