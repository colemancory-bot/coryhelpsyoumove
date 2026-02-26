-- pg_cron and pg_net are pre-installed on Supabase (extensions schema)
-- No CREATE EXTENSION needed — they're enabled via the Supabase dashboard

-- Schedule navica-sync to run every 15 minutes for active Property listings
-- Uses sync-active action which filters to Active/Pending/Under Contract only
SELECT cron.schedule(
  'navica-sync-properties',
  '*/15 * * * *',  -- every 15 minutes
  $$
  SELECT net.http_post(
    url := 'https://kzaabnnwjupjqvydiqlz.supabase.co/functions/v1/navica-sync',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imt6YWFibm53anVwanF2eWRpcWx6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzExMTE5NDMsImV4cCI6MjA4NjY4Nzk0M30.2B2sJnAuDim_yhn5UFKxXzdZw58ne4E20-ulW8pTwPA'
    ),
    body := '{"action":"sync-active","resource":"Property","limit":500}'::jsonb
  );
  $$
);

-- Schedule full sync (all resources) once per hour to catch Members, Offices, OpenHouses
SELECT cron.schedule(
  'navica-sync-full',
  '5 * * * *',  -- 5 minutes past every hour
  $$
  SELECT net.http_post(
    url := 'https://kzaabnnwjupjqvydiqlz.supabase.co/functions/v1/navica-sync',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imt6YWFibm53anVwanF2eWRpcWx6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzExMTE5NDMsImV4cCI6MjA4NjY4Nzk0M30.2B2sJnAuDim_yhn5UFKxXzdZw58ne4E20-ulW8pTwPA'
    ),
    body := '{"action":"sync","resource":"all","limit":500}'::jsonb
  );
  $$
);
