-- Deduplicate cma_feature_tags in the backfill (agent_id IS NULL) scope and add a
-- partial unique index so re-ingestion can never insert a second row per listing_key.
--
-- Background: batch-ingest in supabase/functions/cma-extract-features upserted with
-- onConflict "listing_key,agent_id". The table's UNIQUE(listing_key, agent_id) never
-- fires when agent_id IS NULL — SQL treats NULLs as distinct — so the "upsert" degraded
-- to a plain INSERT. Client-side aborts that lost their ingest cursor re-processed the
-- same batch results as fresh rows: 5,989 rows accumulated for 4,820 distinct
-- listing_keys (1,169 duplicates), all agent_id IS NULL.
--
-- This is a live bug: cma-engine looks up a subject's tags with
--   .eq("listing_key", X).is("agent_id", null).maybeSingle()
-- and maybeSingle() errors when two rows match, so any CMA on a duplicated listing
-- loses its subject feature tags.

-- 1. Delete duplicates, keeping the most recently updated row per listing_key
--    (tiebreak: created_at, then id) within the agent_id IS NULL scope. updated_at is
--    written to now() by buildTagRecord on every ingest, so "most recent" = latest write.
--    The strict (updated_at, created_at, id) ordering is a total order, so exactly one
--    row per listing_key survives.
DELETE FROM cma_feature_tags a
USING cma_feature_tags b
WHERE a.agent_id IS NULL
  AND b.agent_id IS NULL
  AND a.listing_key = b.listing_key
  AND a.id <> b.id
  AND (
        a.updated_at <  b.updated_at
    OR (a.updated_at =  b.updated_at AND a.created_at <  b.created_at)
    OR (a.updated_at =  b.updated_at AND a.created_at =  b.created_at AND a.id < b.id)
  );

-- 2. Partial unique index: one backfill (agent_id IS NULL) row per listing_key. This
--    complements the existing UNIQUE(listing_key, agent_id) constraint, which only
--    covers the agent-specific (agent_id NOT NULL) override rows.
CREATE UNIQUE INDEX IF NOT EXISTS uq_cma_feature_tags_listing_no_agent
  ON cma_feature_tags (listing_key)
  WHERE agent_id IS NULL;
