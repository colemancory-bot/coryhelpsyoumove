-- Add adj_restrictions column to cma_adjustments table
-- Captures the dollar adjustment for restricted vs unrestricted land differences
ALTER TABLE cma_adjustments ADD COLUMN IF NOT EXISTS adj_restrictions INT DEFAULT 0;
