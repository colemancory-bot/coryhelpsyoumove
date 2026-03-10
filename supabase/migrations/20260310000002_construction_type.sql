-- Add construction_type to cma_feature_tags for manufactured/modular home detection
ALTER TABLE cma_feature_tags ADD COLUMN IF NOT EXISTS construction_type TEXT DEFAULT 'unknown'
  CHECK (construction_type IN ('site_built', 'manufactured', 'modular', 'mobile_home', 'log', 'unknown'));
