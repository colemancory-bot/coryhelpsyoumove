-- Add structural feature columns to cma_feature_tags for pool, basement, fireplace,
-- covered outdoor space, garage details, and outbuilding info.
-- These enable new CMA adjustment calculations that differentiate properties
-- with meaningfully different amenities.

-- Pool
ALTER TABLE cma_feature_tags ADD COLUMN IF NOT EXISTS has_pool BOOLEAN DEFAULT false;
ALTER TABLE cma_feature_tags ADD COLUMN IF NOT EXISTS pool_type TEXT DEFAULT 'none';

-- Basement
ALTER TABLE cma_feature_tags ADD COLUMN IF NOT EXISTS basement_type TEXT DEFAULT 'none';
ALTER TABLE cma_feature_tags ADD COLUMN IF NOT EXISTS basement_sqft INT;

-- Fireplace
ALTER TABLE cma_feature_tags ADD COLUMN IF NOT EXISTS has_fireplace BOOLEAN DEFAULT false;
ALTER TABLE cma_feature_tags ADD COLUMN IF NOT EXISTS fireplace_count INT DEFAULT 0;
ALTER TABLE cma_feature_tags ADD COLUMN IF NOT EXISTS fireplace_type TEXT DEFAULT '';

-- Covered outdoor space (porches, screened porches, covered decks)
ALTER TABLE cma_feature_tags ADD COLUMN IF NOT EXISTS covered_outdoor_sqft INT;

-- Garage details (beyond just space count)
ALTER TABLE cma_feature_tags ADD COLUMN IF NOT EXISTS garage_type TEXT DEFAULT '';
ALTER TABLE cma_feature_tags ADD COLUMN IF NOT EXISTS garage_sqft INT;

-- Outbuildings
ALTER TABLE cma_feature_tags ADD COLUMN IF NOT EXISTS outbuilding_count INT DEFAULT 0;
ALTER TABLE cma_feature_tags ADD COLUMN IF NOT EXISTS outbuilding_value_tier INT DEFAULT 0;

-- New adjustment columns in cma_adjustments
ALTER TABLE cma_adjustments ADD COLUMN IF NOT EXISTS adj_pool INT DEFAULT 0;
ALTER TABLE cma_adjustments ADD COLUMN IF NOT EXISTS adj_basement INT DEFAULT 0;
ALTER TABLE cma_adjustments ADD COLUMN IF NOT EXISTS adj_fireplace INT DEFAULT 0;
ALTER TABLE cma_adjustments ADD COLUMN IF NOT EXISTS adj_covered_outdoor INT DEFAULT 0;
