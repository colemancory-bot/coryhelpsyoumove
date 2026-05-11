-- Second MLS Grid rate-limit warning (May 11 2026) traced to a duplicate cron.
--
-- An orphan `backfill-media-catchup` cron was firing the same
-- `action=backfill-media` POST every 2 minutes at limit=10, in parallel with
-- `mls-grid-backfill-media` (limit=5). Two concurrent invocations of the same
-- action walking the same cursor and re-fetching the same photos doubled the
-- per-minute load on api.mlsgrid.com / media.mlsgrid.com and, during their
-- ~30s overlap windows, bursted past the 4 RPS warning threshold.
--
-- The catchup cron also resets the cursor to '' whenever it reaches DONE, so
-- the loop runs forever instead of going quiet once everything is backfilled.
--
-- Fix:
--   1. Drop the duplicate catchup cron.
--   2. Add a slower, gated cursor-reset cron that only resets when there are
--      mls_media rows still missing local_url. The regular every-2-min cron
--      then does the actual walk. Hourly reset = up to 1h delay before new
--      listing photos appear on R2 (acceptable for IDX).

SELECT cron.unschedule('backfill-media-catchup');

SELECT cron.schedule(
  'mls-grid-backfill-media-reset',
  '13 * * * *',  -- hourly at :13, offset from the work cron's even-minute schedule
  $$
  UPDATE sync_cursors
  SET value = '', updated_at = now()
  WHERE key = 'backfill-media'
    AND value = 'DONE'
    AND EXISTS (
      SELECT 1
      FROM mls_media m
      JOIN mls_listings l ON l.listing_key = m.listing_key
      WHERE m.local_url = ''
        AND l.is_winner = true
        AND l.originating_system_name = 'carolina'
        AND l.standard_status IN ('Active','Active Under Contract','Pending')
      LIMIT 1
    );
  $$
);
