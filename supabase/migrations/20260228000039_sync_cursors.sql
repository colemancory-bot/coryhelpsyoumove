-- Cursor table for tracking media refresh progress between cron invocations.
-- Each media-refresh cycle (AM and PM) consists of 18 invocations 3 min apart.
-- Without a shared cursor, every invocation restarts from the oldest listing.
-- This table lets each invocation pick up where the last left off.

CREATE TABLE IF NOT EXISTS sync_cursors (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL DEFAULT '',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Seed the media-refresh cursor
INSERT INTO sync_cursors (key, value)
VALUES ('media-refresh', '')
ON CONFLICT (key) DO NOTHING;

-- Service-role only — no public access
ALTER TABLE sync_cursors ENABLE ROW LEVEL SECURITY;

-- Reset cursor before each refresh cycle so the 18 invocations page from scratch.
-- AM reset: 2:55 AM UTC (5 min before the 3:00 AM cycle starts)
SELECT cron.schedule(
  'mls-grid-media-cursor-reset-am',
  '55 2 * * *',
  $$UPDATE sync_cursors SET value = '', updated_at = now() WHERE key = 'media-refresh';$$
);

-- PM reset: 2:55 PM UTC (5 min before the 3:00 PM cycle starts)
SELECT cron.schedule(
  'mls-grid-media-cursor-reset-pm',
  '55 14 * * *',
  $$UPDATE sync_cursors SET value = '', updated_at = now() WHERE key = 'media-refresh';$$
);
