-- Migration 31: BBO Extended Fields
ALTER TABLE mls_listings ADD COLUMN IF NOT EXISTS lock_box_type TEXT DEFAULT '';
ALTER TABLE mls_listings ADD COLUMN IF NOT EXISTS lock_box_serial_number TEXT DEFAULT '';
ALTER TABLE mls_listings ADD COLUMN IF NOT EXISTS lock_box_location TEXT DEFAULT '';
ALTER TABLE mls_listings ADD COLUMN IF NOT EXISTS showing_contact_name TEXT DEFAULT '';
ALTER TABLE mls_listings ADD COLUMN IF NOT EXISTS showing_contact_phone TEXT DEFAULT '';
ALTER TABLE mls_listings ADD COLUMN IF NOT EXISTS showing_contact_type TEXT DEFAULT '';
ALTER TABLE mls_listings ADD COLUMN IF NOT EXISTS buyer_agency_compensation TEXT DEFAULT '';
ALTER TABLE mls_listings ADD COLUMN IF NOT EXISTS sub_agency_compensation TEXT DEFAULT '';
ALTER TABLE mls_listings ADD COLUMN IF NOT EXISTS transaction_broker_compensation TEXT DEFAULT '';
ALTER TABLE mls_listings ADD COLUMN IF NOT EXISTS occupant_name TEXT DEFAULT '';
ALTER TABLE mls_listings ADD COLUMN IF NOT EXISTS occupant_phone TEXT DEFAULT '';
ALTER TABLE mls_listings ADD COLUMN IF NOT EXISTS occupant_type TEXT DEFAULT '';
ALTER TABLE mls_listings ADD COLUMN IF NOT EXISTS listing_agreement TEXT DEFAULT '';
ALTER TABLE mls_listings ADD COLUMN IF NOT EXISTS special_listing_conditions TEXT DEFAULT '';
ALTER TABLE mls_listings ADD COLUMN IF NOT EXISTS virtual_tour_url TEXT DEFAULT '';
ALTER TABLE mls_listings ADD COLUMN IF NOT EXISTS video_url TEXT DEFAULT '';
ALTER TABLE mls_listings ADD COLUMN IF NOT EXISTS concessions_amount NUMERIC;
ALTER TABLE mls_listings ADD COLUMN IF NOT EXISTS concessions_comments TEXT DEFAULT '';
