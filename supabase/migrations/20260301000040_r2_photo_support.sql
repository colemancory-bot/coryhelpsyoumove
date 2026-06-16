-- R2 photo storage support
-- Adds PhotosChangeTimestamp tracking so we only re-download media when photos change,
-- and a backfill cursor for the one-time migration of existing photos to R2.

-- Track when photos change (MLS Grid signal field)
ALTER TABLE mls_listings
  ADD COLUMN IF NOT EXISTS photos_change_timestamp TIMESTAMPTZ;

-- Index to help backfill find media rows missing R2 URLs
CREATE INDEX IF NOT EXISTS idx_mls_media_no_local_url
  ON mls_media(listing_key)
  WHERE local_url = '' OR local_url IS NULL;

-- Backfill cursor (same pattern as media-refresh cursor)
INSERT INTO sync_cursors (key, value)
VALUES ('backfill-media', '')
ON CONFLICT (key) DO NOTHING;
