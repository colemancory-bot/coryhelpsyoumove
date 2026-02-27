-- MLS Grid (Canopy MLS) cron jobs — syncs listings from 8 WNC counties
-- Geographic filter is built into the mls-sync edge function (CountyOrParish in ...)
-- Counties: Haywood, Jackson, Swain, Macon, Buncombe, Henderson, Transylvania, Graham

-- Schedule mls-sync Property every 15 minutes (offset by 7 min from Navica to avoid overlap)
SELECT cron.schedule(
  'mls-grid-sync-properties',
  '7,22,37,52 * * * *',  -- every 15 minutes, offset from Navica's 0,15,30,45
  $$
  SELECT net.http_post(
    url := 'https://kzaabnnwjupjqvydiqlz.supabase.co/functions/v1/mls-sync',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imt6YWFibm53anVwanF2eWRpcWx6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzExMTE5NDMsImV4cCI6MjA4NjY4Nzk0M30.2B2sJnAuDim_yhn5UFKxXzdZw58ne4E20-ulW8pTwPA'
    ),
    body := '{"action":"sync","resource":"Property","limit":500}'::jsonb
  );
  $$
);

-- Schedule full sync (Members, Offices, OpenHouses) once per hour
SELECT cron.schedule(
  'mls-grid-sync-full',
  '35 * * * *',  -- 35 minutes past every hour (offset from Navica's :05)
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

-- Update MLS Grid sync state rows to have correct originating_system_name
UPDATE mls_sync_state
SET originating_system_name = 'carolina'
WHERE resource_type IN ('Property', 'Member', 'Office', 'OpenHouse')
  AND (originating_system_name = '' OR originating_system_name IS NULL);
