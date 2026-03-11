-- Add restriction_status column to cma_feature_tags
-- Values: "unrestricted", "restricted", "unknown"
-- Used for CMA lot size adjustments: unrestricted land commands a premium in WNC
ALTER TABLE cma_feature_tags ADD COLUMN IF NOT EXISTS restriction_status TEXT DEFAULT 'unknown'
  CHECK (restriction_status IN ('unrestricted', 'restricted', 'unknown'));
