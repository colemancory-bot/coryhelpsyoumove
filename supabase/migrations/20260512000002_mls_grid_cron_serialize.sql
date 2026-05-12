-- Stagger MLS Grid crons so they never fire in the same minute, eliminating
-- the dominant cause of the 2 RPS overflow warnings.
--
-- The new single-flight lock (20260512000001) already serializes API calls
-- across crons, but staggering reduces wasted lock-skip invocations and
-- keeps logs readable.
--
-- New schedule (all offsets relative to the top of the hour, UTC):
--   :07, :22, :37, :52  mls-grid-sync-properties  (every 15 min — matches docs §4)
--   :40                 mls-grid-sync-full        (hourly, 3 min after :37 sync)
--   :12, :27, :42, :57  mls-grid-backfill-media   (every 15 min, 5 min after sync)
--
-- Was previously:
--   :07, :22, :37, :52  sync-properties           (unchanged)
--   :35                 sync-full                 (overlapped with :37 sync-properties)
--   */2                 backfill-media            (fired every 2 min — biggest offender)

SELECT cron.unschedule('mls-grid-sync-full');
SELECT cron.unschedule('mls-grid-backfill-media');

-- Hourly full sync (Member, Office, OpenHouse + Property again).
-- Offset to :40 so it lands cleanly after :37 sync-properties finishes.
SELECT cron.schedule(
  'mls-grid-sync-full',
  '40 * * * *',
  $$
  SELECT net.http_post(
    url := 'https://kzaabnnwjupjqvydiqlz.supabase.co/functions/v1/mls-sync',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imt6YWFibm53anVwanF2eWRpcWx6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzExMTE5NDMsImV4cCI6MjA4NjY4Nzk0M30.2B2sJnAuDim_yhn5UFKxXzdZw58ne4E20-ulW8pTwPA'
    ),
    body := '{"action":"sync","resource":"all","limit":500}'::jsonb
  );
  $$
);

-- Backfill-media: drop from every-2-min to every-15-min on a different
-- offset from sync. Photos downloaded asynchronously to R2; no urgency
-- to fire constantly. 4 invocations/hour x 5 listings = 20 listings/hour
-- backfilled, plenty for incremental drift on already-backfilled inventory.
SELECT cron.schedule(
  'mls-grid-backfill-media',
  '12,27,42,57 * * * *',
  $$
  SELECT net.http_post(
    url := 'https://kzaabnnwjupjqvydiqlz.supabase.co/functions/v1/mls-sync',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imt6YWFibm53anVwanF2eWRpcWx6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzExMTE5NDMsImV4cCI6MjA4NjY4Nzk0M30.2B2sJnAuDim_yhn5UFKxXzdZw58ne4E20-ulW8pTwPA'
    ),
    body := '{"action":"backfill-media","limit":5}'::jsonb
  );
  $$
);
