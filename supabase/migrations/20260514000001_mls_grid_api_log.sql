-- Per-request audit log for every MLS Grid API call.
-- We are getting rate-limit warnings (4 RPS hourly avg) that don't match
-- our own cron-side measurement (~0.003 RPS). Pinpointing the source
-- requires visibility into every single api.mlsgrid.com / media.mlsgrid.com
-- request — including ad-hoc invocations from cma-engine, manual sync-one,
-- or anything else using MLS_GRID_TOKEN.
--
-- 7-day retention is enforced by a periodic cron (keeps table small).

CREATE TABLE IF NOT EXISTS mls_grid_api_log (
  id BIGSERIAL PRIMARY KEY,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  caller TEXT NOT NULL,            -- e.g. 'mls-sync:sync-properties', 'mls-sync:backfill-media', 'cma-engine:lookup-listing'
  endpoint TEXT NOT NULL,          -- 'api.mlsgrid.com' or 'media.mlsgrid.com'
  url TEXT,                        -- full URL (signed media URLs OK to store; they're transient)
  status_code INT,
  duration_ms INT,
  response_bytes BIGINT,
  error_message TEXT
);

CREATE INDEX IF NOT EXISTS idx_mls_grid_api_log_created_at
  ON mls_grid_api_log (created_at DESC);

CREATE INDEX IF NOT EXISTS idx_mls_grid_api_log_caller
  ON mls_grid_api_log (caller, created_at DESC);

-- RLS: only service role can read/write. Public never sees this.
ALTER TABLE mls_grid_api_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Service role only" ON mls_grid_api_log
  FOR ALL USING (auth.role() = 'service_role');

-- 7-day retention sweep, runs hourly at :08 (outside the cron-stagger windows).
SELECT cron.schedule(
  'mls-grid-api-log-prune',
  '8 * * * *',
  $$DELETE FROM mls_grid_api_log WHERE created_at < now() - interval '7 days';$$
);
