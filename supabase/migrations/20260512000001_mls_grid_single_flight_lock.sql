-- Single-flight lock for mls-sync to satisfy MLS Grid Best Practice §7:
-- "DO NOT send more than one replication request at a time. If you have a
--  multi-threaded or multi-process API client, do not split replication
--  requests. Replication requests must be in sequential order."
--
-- We have three crons that hit api.mlsgrid.com:
--   * mls-grid-sync-properties (every 15 min)
--   * mls-grid-sync-full       (hourly at :35)
--   * mls-grid-backfill-media  (every 2 min)
--
-- When two fire in the same minute (e.g. :35 sync-full + :36 backfill-media,
-- or :07 sync-properties + :08 backfill-media), the combined burst exceeds
-- the 2 RPS guidance even though each one alone respects it. That is the
-- cause of the May 7/11/12 rate-limit warnings.
--
-- This lock is held at the edge-function layer: every action that calls
-- api.mlsgrid.com or media.mlsgrid.com tries to acquire it; if held by
-- another invocation, the action returns 200 with skipped=locked and exits
-- without making any MLS Grid calls. The cron will retry on its next tick.

INSERT INTO mls_sync_state (
  resource_type,
  originating_system_name,
  status,
  last_sync_at,
  error_message,
  last_modification_timestamp,
  records_synced
) VALUES (
  '_mls_grid_lock',
  '',
  'idle',
  '1970-01-01T00:00:00Z',
  '',
  NULL,
  0
) ON CONFLICT (resource_type) DO NOTHING;

-- Sanity-check: confirm the lock row exists and is idle so the first
-- post-deploy invocation will be able to acquire it.
UPDATE mls_sync_state
   SET status = 'idle',
       last_sync_at = '1970-01-01T00:00:00Z',
       error_message = ''
 WHERE resource_type = '_mls_grid_lock';
