-- Schedule the search-alerts edge function.
--
-- The function (supabase/functions/search-alerts/index.ts) matches new
-- listings to saved searches and checks price-drop subscriptions, emailing
-- via Resend. Its own header says "Schedule: pg_cron after MLS sync (e.g.
-- every 6 hours)" but no cron job was ever created and the function was never
-- deployed, so it has never run once. Every saved search a visitor has
-- created since the feature shipped has produced zero emails.
--
-- This matters because saved-search alerts are the highest-retention feature
-- on an agent site: each alert email pulls the visitor back to our domain
-- instead of Zillow. GA4 (28d to 2026-08-06) shows organic visitors engaging
-- for 1m02s but almost never returning, and one key event in the period.
--
-- Timing: twice daily rather than the every-6-hours the header suggests, so
-- nobody gets a 2am listing email. pg_cron runs in UTC.
--   12:20 UTC = 8:20am EDT / 7:20am EST
--   21:20 UTC = 5:20pm EDT / 4:20pm EST
-- The :20 offset keeps it clear of the sync crons at :00 :05 :07 :15 :22 :30
-- :35 :37 :45 :52.
--
-- Dedup: the function stamps saved_searches.last_notified_at whenever it
-- sends, and the next run only queries listings created after that stamp, so
-- twice-daily runs cannot double-send. When a search has no matches the stamp
-- is left alone and the window stays a rolling 24 hours.

SELECT cron.schedule(
  'search-alerts',
  '20 12,21 * * *',
  $$
  SELECT net.http_post(
    url := 'https://kzaabnnwjupjqvydiqlz.supabase.co/functions/v1/search-alerts',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imt6YWFibm53anVwanF2eWRpcWx6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzExMTE5NDMsImV4cCI6MjA4NjY4Nzk0M30.2B2sJnAuDim_yhn5UFKxXzdZw58ne4E20-ulW8pTwPA'
    ),
    body := '{}'::jsonb
  );
  $$
);
