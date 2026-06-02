-- ═══════════════════════════════════════════════════════════════════════
-- Performance: index the anon listings query so it stops hitting statement_timeout
-- ═══════════════════════════════════════════════════════════════════════
-- SYMPTOM (observed 2026-06): the public site's MLS load intermittently fails
-- with "canceling statement due to statement timeout" on the anon winners query
-- (app.js MLS_GRID._fetchAll on mls_listings). Empty featured grids result.
-- A frontend fallback now covers the symptom; this addresses the cause.
--
-- ROOT CAUSE (predicate mismatch defeats the existing index):
--   The compliance RLS policy "Public can read IDX-eligible active winners"
--   (migration 20260424000001) gates anon SELECT with, among others:
--       COALESCE(internet_entire_listing_display_yn, TRUE) = TRUE
--       COALESCE(property_type, '') <> 'Residential Lease'
--   But the support index idx_mls_listings_compliance_gate is partial on the
--   STRICT form (internet_entire_listing_display_yn = TRUE), which excludes
--   NULLs. Postgres cannot prove the COALESCE(...) query predicate implies the
--   strict index predicate, so it will NOT use that index. It falls back to
--   idx_mls_listings_frontend_query (no is_winner column), scans every active
--   mlg_can_view row — winners PLUS every cross-MLS loser duplicate — and
--   re-checks is_winner + the COALESCE/ANY predicates per row. On a multi-
--   thousand-row table that plan is borderline and intermittently exceeds the
--   8s anon statement_timeout, worst during sync writes (the winner-recalc
--   trigger churns the table -> stale stats -> worse plans). The intermittency
--   is the tell: a missing index is consistently slow.
--
-- FIX: a partial index whose predicate uses the SAME COALESCE expressions as
-- the RLS policy, so the planner can match it and jump straight to the small
-- set of active, IDX-eligible winners. The residual 'IDX' = ANY(mlg_can_use)
-- check is cheap once the row set is narrowed.

CREATE INDEX IF NOT EXISTS idx_mls_listings_idx_eligible
  ON mls_listings (standard_status)
  WHERE mlg_can_view = TRUE
    AND is_winner = TRUE
    AND COALESCE(internet_entire_listing_display_yn, TRUE) = TRUE
    AND COALESCE(property_type, '') <> 'Residential Lease';

-- Refresh planner statistics so the new index is costed correctly.
ANALYZE mls_listings;

-- ── Verify on the live DB BEFORE relying on this (run as the anon role) ──────
-- Confirm the new index is chosen and the query is fast:
--   EXPLAIN (ANALYZE, BUFFERS)
--   SELECT listing_key FROM mls_listings
--    WHERE mlg_can_view = TRUE AND is_winner = TRUE
--      AND standard_status IN ('Active','Active Under Contract','Pending')
--      AND property_type <> 'Residential Lease'
--    ORDER BY listing_key;
-- Expect an Index/Bitmap scan on idx_mls_listings_idx_eligible (not a Seq Scan
-- on the whole table), and execution time well under the 8s timeout.
--
-- ── Notes ────────────────────────────────────────────────────────────────────
-- * On the live table, prefer running this as CREATE INDEX CONCURRENTLY in a
--   standalone statement (cannot run inside a txn) to avoid locking sync writes.
--   The IF NOT EXISTS form above is migration-safe; swap to CONCURRENTLY when
--   applying by hand against production.
-- * The older idx_mls_listings_compliance_gate (strict-equality partial) is now
--   likely unused by the anon path. Check pg_stat_user_indexes.idx_scan after a
--   day of traffic; if it stays at zero it can be dropped to save write overhead
--   on this frequently-updated table. Not dropped here on purpose.
