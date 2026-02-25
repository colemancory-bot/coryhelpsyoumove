-- Migration 33: Add attribution_contact for Canopy MLS IDX compliance
-- The listing agent selects their preferred contact method (email/phone) in MLS.
-- This field stores the resolved contact value for display in "Listed by..." attribution.
ALTER TABLE mls_listings ADD COLUMN IF NOT EXISTS attribution_contact TEXT DEFAULT '';
