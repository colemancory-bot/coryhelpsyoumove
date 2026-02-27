-- Performance indexes for the main frontend listing query
-- The site's primary query filters: mlg_can_view=true, standard_status IN (...), property_type != Lease
-- Current indexes don't cover this exact combination, causing 1-2.7s query times

-- Composite partial index matching the exact frontend query pattern
-- Covers: WHERE mlg_can_view = true AND property_type != 'Residential Lease'
-- Index on standard_status allows quick IN ('Active','Active Under Contract','Pending') lookup
CREATE INDEX IF NOT EXISTS idx_mls_listings_frontend_query
ON mls_listings(standard_status, city, list_price)
WHERE mlg_can_view = true AND property_type != 'Residential Lease';

-- Primary photo lookup — the frontend fetches order=1 media for all listings
-- Current index is on (listing_key, "order") but this partial index is more targeted
CREATE INDEX IF NOT EXISTS idx_mls_media_primary_photo
ON mls_media(listing_key)
WHERE "order" = 1;

-- County filter for MLS Grid sync queries (CountyOrParish-based filtering)
CREATE INDEX IF NOT EXISTS idx_mls_listings_county
ON mls_listings(county_or_parish, standard_status)
WHERE mlg_can_view = true;

-- Analyze to update query planner statistics after adding indexes
ANALYZE mls_listings;
ANALYZE mls_media;
