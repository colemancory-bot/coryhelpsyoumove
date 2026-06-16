-- Disable media-refresh and backfill crons after R2 backfill is verified complete.
-- R2 URLs don't expire, so the twice-daily media URL refresh is no longer needed.
-- This eliminates ~11,600 MLS Grid API calls/day.
--
-- ONLY RUN THIS after verifying:
--   1. SELECT value FROM sync_cursors WHERE key = 'backfill-media' → should be 'DONE'
--   2. Canopy listing photos load from R2 domain on coryhelpsyoumove.com
--   3. New listings from the 15-min sync get R2 photos automatically

-- Remove media-refresh crons (no longer needed with permanent R2 URLs)
SELECT cron.unschedule('mls-grid-media-refresh-am');
SELECT cron.unschedule('mls-grid-media-refresh-pm');
SELECT cron.unschedule('mls-grid-media-cursor-reset-am');
SELECT cron.unschedule('mls-grid-media-cursor-reset-pm');

-- Remove backfill cron (one-time job, now complete)
SELECT cron.unschedule('mls-grid-backfill-media');
