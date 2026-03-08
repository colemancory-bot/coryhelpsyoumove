-- CMA (Comparative Market Analysis) Tables
-- Mountain-specific CMA tool with AI-powered feature extraction

-- ═══ 39. CMA Feature Tags ═══
CREATE TABLE IF NOT EXISTS cma_feature_tags (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  listing_key TEXT NOT NULL,
  agent_id UUID,
  view_quality INT CHECK (view_quality BETWEEN 1 AND 5),
  water_quality INT CHECK (water_quality BETWEEN 1 AND 5),
  land_usability INT CHECK (land_usability BETWEEN 1 AND 5),
  road_noise INT CHECK (road_noise BETWEEN 1 AND 5),
  condition_rating INT CHECK (condition_rating BETWEEN 1 AND 5),
  privacy_rating INT CHECK (privacy_rating BETWEEN 1 AND 5),
  view_type TEXT[] DEFAULT '{}',
  water_features TEXT[] DEFAULT '{}',
  land_character TEXT[] DEFAULT '{}',
  road_access TEXT[] DEFAULT '{}',
  outbuildings TEXT[] DEFAULT '{}',
  special_features TEXT[] DEFAULT '{}',
  elevation_ft INT,
  condition_notes TEXT DEFAULT '',
  winter_access TEXT DEFAULT '',
  extraction_model TEXT DEFAULT '',
  extraction_confidence NUMERIC CHECK (extraction_confidence BETWEEN 0 AND 1),
  raw_extraction JSONB DEFAULT '{}',
  extracted_from TEXT[] DEFAULT '{}',
  manually_overridden BOOLEAN DEFAULT false,
  override_notes TEXT DEFAULT '',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(listing_key, agent_id)
);
CREATE INDEX IF NOT EXISTS idx_cma_feature_tags_listing ON cma_feature_tags(listing_key);
CREATE INDEX IF NOT EXISTS idx_cma_feature_tags_agent ON cma_feature_tags(agent_id) WHERE agent_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_cma_feature_tags_view ON cma_feature_tags(view_quality) WHERE view_quality IS NOT NULL;
ALTER TABLE cma_feature_tags ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admin can manage feature tags" ON cma_feature_tags FOR ALL USING (
  EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
);

-- ═══ 40. CMA Reports ═══
CREATE TABLE IF NOT EXISTS cma_reports (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  agent_id UUID,
  subject_listing_key TEXT,
  subject_address TEXT NOT NULL,
  subject_city TEXT DEFAULT '',
  subject_county TEXT DEFAULT '',
  subject_data JSONB DEFAULT '{}',
  subject_features JSONB DEFAULT '{}',
  report_name TEXT DEFAULT '',
  report_date DATE DEFAULT CURRENT_DATE,
  purpose TEXT DEFAULT 'listing' CHECK (purpose IN ('listing', 'buyer', 'appraisal_review')),
  status TEXT DEFAULT 'draft' CHECK (status IN ('draft', 'final', 'archived')),
  suggested_low INT,
  suggested_high INT,
  suggested_price INT,
  agent_recommended_price INT,
  agent_notes TEXT DEFAULT '',
  ai_summary TEXT DEFAULT '',
  ai_considerations JSONB DEFAULT '[]',
  pdf_url TEXT DEFAULT '',
  pdf_generated_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_cma_reports_agent ON cma_reports(agent_id);
CREATE INDEX IF NOT EXISTS idx_cma_reports_subject ON cma_reports(subject_listing_key);
CREATE INDEX IF NOT EXISTS idx_cma_reports_status ON cma_reports(status);
ALTER TABLE cma_reports ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admin can manage CMA reports" ON cma_reports FOR ALL USING (
  EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
);

-- ═══ 41. CMA Adjustments ═══
CREATE TABLE IF NOT EXISTS cma_adjustments (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  report_id UUID NOT NULL REFERENCES cma_reports(id) ON DELETE CASCADE,
  comp_listing_key TEXT NOT NULL,
  comp_order INT DEFAULT 0,
  comp_data JSONB DEFAULT '{}',
  comp_features JSONB DEFAULT '{}',
  adj_living_area INT DEFAULT 0,
  adj_lot_size INT DEFAULT 0,
  adj_bedrooms INT DEFAULT 0,
  adj_bathrooms INT DEFAULT 0,
  adj_garage INT DEFAULT 0,
  adj_year_built INT DEFAULT 0,
  adj_condition INT DEFAULT 0,
  adj_view INT DEFAULT 0,
  adj_water_features INT DEFAULT 0,
  adj_land_character INT DEFAULT 0,
  adj_road_noise INT DEFAULT 0,
  adj_privacy INT DEFAULT 0,
  adj_elevation INT DEFAULT 0,
  adj_outbuildings INT DEFAULT 0,
  adj_special_features INT DEFAULT 0,
  adj_time INT DEFAULT 0,
  adj_concessions INT DEFAULT 0,
  total_adjustment INT DEFAULT 0,
  adjusted_price INT DEFAULT 0,
  gross_adjustment_pct NUMERIC DEFAULT 0,
  net_adjustment_pct NUMERIC DEFAULT 0,
  slider_states JSONB DEFAULT '{}',
  ai_suggested_adjustments JSONB DEFAULT '{}',
  ai_reasoning JSONB DEFAULT '{}',
  overrides JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_cma_adjustments_report ON cma_adjustments(report_id);
ALTER TABLE cma_adjustments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admin can manage CMA adjustments" ON cma_adjustments FOR ALL USING (
  EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
);

-- ═══ 42. CMA Paired Sales ═══
CREATE TABLE IF NOT EXISTS cma_paired_sales (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  agent_id UUID,
  listing_key_a TEXT NOT NULL,
  listing_key_b TEXT NOT NULL,
  feature_category TEXT NOT NULL,
  feature_a_value TEXT DEFAULT '',
  feature_b_value TEXT DEFAULT '',
  price_a INT NOT NULL,
  price_b INT NOT NULL,
  derived_adjustment INT NOT NULL,
  similarity_score NUMERIC CHECK (similarity_score BETWEEN 0 AND 1),
  confidence TEXT DEFAULT 'low' CHECK (confidence IN ('low', 'medium', 'high')),
  county TEXT DEFAULT '',
  area TEXT DEFAULT '',
  sale_date_a DATE,
  sale_date_b DATE,
  ai_derived BOOLEAN DEFAULT true,
  notes TEXT DEFAULT '',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_cma_paired_sales_feature ON cma_paired_sales(feature_category, county);
ALTER TABLE cma_paired_sales ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admin can manage paired sales" ON cma_paired_sales FOR ALL USING (
  EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
);
