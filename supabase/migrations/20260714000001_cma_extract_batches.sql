-- Tracking table for cma-extract-features Message Batches API backfill.
--
-- One row per submitted Anthropic message batch. batch-submit inserts a row
-- with the submitted listing_keys; batch-status refreshes processing_status and
-- request_counts; batch-ingest advances ingested_count and flips status to
-- 'ingested' once every succeeded result has been written to cma_feature_tags.
--
-- Service-role only: RLS is enabled with no permissive policy, so anon /
-- authenticated cannot read or write it. The edge function uses the service
-- role, which bypasses RLS. Same pattern as mls_media_cleanup_queue.

CREATE TABLE IF NOT EXISTS cma_extract_batches (
  id              UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  batch_id        TEXT        NOT NULL UNIQUE,
  submitted_count INT         NOT NULL DEFAULT 0,
  ingested_count  INT         NOT NULL DEFAULT 0,
  status          TEXT        NOT NULL DEFAULT 'submitted',
  request_counts  JSONB       NOT NULL DEFAULT '{}',
  submitted_keys  TEXT[]      NOT NULL DEFAULT '{}',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_cma_extract_batches_status
  ON cma_extract_batches(status);

ALTER TABLE cma_extract_batches ENABLE ROW LEVEL SECURITY;
-- No public policies — service role only.
