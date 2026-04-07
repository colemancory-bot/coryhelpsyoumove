-- Hourly cron to process the mls_media_cleanup_queue.
--
-- Entries sit in the queue for 24 hours before their R2 photos are actually
-- deleted. This grace period lets a transient sync glitch self-correct: if
-- the listing reclaims winner status before the 24 hours elapse, the worker
-- drops the queue entry without touching R2.
--
-- Runs at :37 to avoid colliding with :00/:05/:15 sync crons.

SELECT cron.schedule(
  'mls-cleanup-orphan-media',
  '37 * * * *',
  $$
  SELECT net.http_post(
    url := 'https://kzaabnnwjupjqvydiqlz.supabase.co/functions/v1/mls-sync',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imt6YWFibm53anVwanF2eWRpcWx6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzExMTE5NDMsImV4cCI6MjA4NjY4Nzk0M30.2B2sJnAuDim_yhn5UFKxXzdZw58ne4E20-ulW8pTwPA'
    ),
    body := '{"action":"cleanup-orphan-media","graceHours":24,"limit":50}'::jsonb
  );
  $$
);
