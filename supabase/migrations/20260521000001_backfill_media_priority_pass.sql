-- Split backfill-media into two passes to fix two real problems:
--
-- 1. New listings (e.g. 214 Chin Tree Rd listed 5/20 at 11pm) were getting
--    stuck at the back of the queue behind older missing-photo listings.
--    Front-end shows them with placeholder cards until backfill catches up.
--
-- 2. With the 750ms global throttle and ~30 photos per listing, the prior
--    cron (limit=5, all photos) only cleared ~20 listings/hour. New listings
--    arrived faster than backlog drained — queue grew from 43 to 1,381 in
--    24 hours.
--
-- New cron layout:
--
--   :12, :27, :42, :57  (every 15 min)  — PRIORITY PASS
--     limit=30, maxPhotos=2
--     Downloads just the first 2 photos per listing (the card needs only
--     photo 0, with photo 1 as backup). 30 listings × 3 calls/listing
--     (1 OData + 2 photos) = 90 calls at 750ms = ~67 seconds per invocation.
--     Total: ~120 listings/hour get card-visible photos.
--
--   :13  (hourly)  — FULL FILL PASS
--     limit=5, maxPhotos=null (all)
--     Picks up photos 2-N for listings that already had the priority pass
--     done. 5 listings × ~28 remaining photos = ~145 calls = ~109s, well
--     under the 150s edge timeout. ~20 listings/hour fully filled out.
--
-- Both gated by the global 750ms throttle and the single-flight lock, so
-- concurrent firings serialize correctly.

SELECT cron.unschedule('mls-grid-backfill-media');

SELECT cron.schedule(
  'mls-grid-backfill-media-priority',
  '12,27,42,57 * * * *',
  $$
  SELECT net.http_post(
    url := 'https://kzaabnnwjupjqvydiqlz.supabase.co/functions/v1/mls-sync',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imt6YWFibm53anVwanF2eWRpcWx6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzExMTE5NDMsImV4cCI6MjA4NjY4Nzk0M30.2B2sJnAuDim_yhn5UFKxXzdZw58ne4E20-ulW8pTwPA'
    ),
    body := '{"action":"backfill-media","limit":30,"maxPhotos":2}'::jsonb
  );
  $$
);

SELECT cron.schedule(
  'mls-grid-backfill-media-fill',
  '13 * * * *',
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
