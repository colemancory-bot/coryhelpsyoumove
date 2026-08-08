-- Weekly cron: extract feature tags for newly-arrived trimmed-scope listings.
--
-- New listings land at ~50-100/week; realtime extraction of them is a few cents.
-- The 'extract-new' action selects untagged trimmed-scope listings (4 counties,
-- the same three branches as the batch backfill) and extracts up to `limit` of
-- them realtime, one Claude call each.
--
-- Schedule: 09:20 UTC every Monday. That is 05:20 America/New_York during EDT
-- (04:20 during EST). pg_cron runs in UTC; DST shifts the local wall-clock hour
-- by one, which is immaterial for a weekly low-cost maintenance job. :20 avoids
-- the :00/:05/:15/:37 MLS-sync crons.

SELECT cron.schedule(
  'cma-extract-new-weekly',
  '20 9 * * 1',
  $$
  SELECT net.http_post(
    url := 'https://kzaabnnwjupjqvydiqlz.supabase.co/functions/v1/cma-extract-features',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imt6YWFibm53anVwanF2eWRpcWx6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzExMTE5NDMsImV4cCI6MjA4NjY4Nzk0M30.2B2sJnAuDim_yhn5UFKxXzdZw58ne4E20-ulW8pTwPA'
    ),
    body := '{"action":"extract-new","limit":120}'::jsonb
  );
  $$
);
