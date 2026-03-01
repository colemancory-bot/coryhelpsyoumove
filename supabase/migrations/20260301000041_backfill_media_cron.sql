-- Temporary cron for R2 photo backfill.
-- Runs every 2 minutes, processes up to 20 WNC listings per invocation.
-- Each listing has ~13 photos, so ~260 R2 uploads per run.
-- Full backfill of ~5,500 remaining Canopy listings completes in ~9 hours.
-- Remove this cron after backfill completes (cursor = 'DONE').

SELECT cron.schedule(
  'mls-grid-backfill-media',
  '*/2 * * * *',
  $$
  SELECT net.http_post(
    url := 'https://kzaabnnwjupjqvydiqlz.supabase.co/functions/v1/mls-sync',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imt6YWFibm53anVwanF2eWRpcWx6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzExMTE5NDMsImV4cCI6MjA4NjY4Nzk0M30.2B2sJnAuDim_yhn5UFKxXzdZw58ne4E20-ulW8pTwPA'
    ),
    body := '{"action":"backfill-media","limit":20}'::jsonb
  );
  $$
);
