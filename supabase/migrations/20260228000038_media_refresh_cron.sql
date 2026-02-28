-- Daily media URL refresh for Canopy MLS (MLS Grid)
-- MLS Grid media URLs are signed and expire in ~24 hours.
-- This cron refreshes all Canopy listing media URLs twice daily.
-- Each invocation processes up to 500 listings; the full refresh
-- (~5,800 listings) requires ~17 invocations spaced apart.
-- We schedule 18 invocations at 3-minute intervals starting at 3 AM and 3 PM UTC.

-- Morning refresh: 3:00 AM - 3:51 AM UTC (18 invocations × 3 min apart)
SELECT cron.schedule(
  'mls-grid-media-refresh-am',
  '0,3,6,9,12,15,18,21,24,27,30,33,36,39,42,45,48,51 3 * * *',
  $$
  SELECT net.http_post(
    url := 'https://kzaabnnwjupjqvydiqlz.supabase.co/functions/v1/mls-sync',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imt6YWFibm53anVwanF2eWRpcWx6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzExMTE5NDMsImV4cCI6MjA4NjY4Nzk0M30.2B2sJnAuDim_yhn5UFKxXzdZw58ne4E20-ulW8pTwPA'
    ),
    body := '{"action":"media-refresh","limit":500}'::jsonb
  );
  $$
);

-- Afternoon refresh: 3:00 PM - 3:51 PM UTC (18 invocations × 3 min apart)
SELECT cron.schedule(
  'mls-grid-media-refresh-pm',
  '0,3,6,9,12,15,18,21,24,27,30,33,36,39,42,45,48,51 15 * * *',
  $$
  SELECT net.http_post(
    url := 'https://kzaabnnwjupjqvydiqlz.supabase.co/functions/v1/mls-sync',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imt6YWFibm53anVwanF2eWRpcWx6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzExMTE5NDMsImV4cCI6MjA4NjY4Nzk0M30.2B2sJnAuDim_yhn5UFKxXzdZw58ne4E20-ulW8pTwPA'
    ),
    body := '{"action":"media-refresh","limit":500}'::jsonb
  );
  $$
);
