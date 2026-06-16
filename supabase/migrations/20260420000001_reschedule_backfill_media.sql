-- Re-enable mls-grid-backfill-media cron after removing inline R2 uploads from
-- the Property sync loop. Inline uploads (1-2s each) were tripping the 150s
-- Supabase edge function timeout on large catch-up batches, stalling the
-- Canopy sync watermark for days.
--
-- Now: the sync loop stores mls_media rows with local_url="" when photos
-- change. This cron runs every 2 min and uploads missing photos to R2 for
-- winner listings only. Stays within the 150s timeout at limit:10.

-- Reset cursor so backfill re-scans all active listings and picks up any
-- with empty local_url (photos that changed while the cron was disabled).
INSERT INTO sync_cursors (key, value, updated_at)
VALUES ('backfill-media', '', NOW())
ON CONFLICT (key) DO UPDATE SET value = '', updated_at = NOW();

-- Re-schedule the cron (may not exist if previously unscheduled).
DO $$
BEGIN
  PERFORM cron.unschedule('mls-grid-backfill-media');
EXCEPTION WHEN OTHERS THEN
  NULL;
END $$;

SELECT cron.schedule(
  'mls-grid-backfill-media',
  '*/2 * * * *',
  $cron$
  SELECT net.http_post(
    url := 'https://kzaabnnwjupjqvydiqlz.supabase.co/functions/v1/mls-sync',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imt6YWFibm53anVwanF2eWRpcWx6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzExMTE5NDMsImV4cCI6MjA4NjY4Nzk0M30.2B2sJnAuDim_yhn5UFKxXzdZw58ne4E20-ulW8pTwPA'
    ),
    body := '{"action":"backfill-media","limit":10}'::jsonb
  );
  $cron$
);
