-- MLS Grid rate-limit fix (May 2026 warning email)
-- After adding per-photo throttling (MEDIA_DOWNLOAD_DELAY_MS=400ms) inside
-- backfill-media's photo loop, the per-invocation budget at limit=10 listings
-- × ~13 photos × 400ms = ~52s on photos alone, which crowds the 150s edge
-- function timeout. Reducing per-run batch size to 5 listings keeps total
-- elapsed at ~26s while still backfilling ~150 listings/hour at the 2-min cron.

SELECT cron.unschedule('mls-grid-backfill-media');

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
    body := '{"action":"backfill-media","limit":5}'::jsonb
  );
  $$
);
