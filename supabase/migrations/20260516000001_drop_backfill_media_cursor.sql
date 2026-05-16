-- backfill-media now uses a DB-driven work list (queries mls_media for
-- listing_keys with local_url=''), not a ModificationTimestamp cursor.
-- The cursor pattern was missing 2,523 historical listings whose initial
-- photo upload failed, because their mod_ts was before the cursor and
-- "gt last_ts" never re-pulled them. Drop the leftover artifacts:
--
--   1. The reset cron that periodically re-armed the dead cursor.
--   2. The cursor row itself.

SELECT cron.unschedule('mls-grid-backfill-media-reset');
DELETE FROM sync_cursors WHERE key = 'backfill-media';
