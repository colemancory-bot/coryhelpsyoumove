-- ═══════════════════════════════════════════════════════════════════════
-- Performance: expression index for the search_listings acreage filter
-- ═══════════════════════════════════════════════════════════════════════
-- SYMPTOM (observed in production): a search that sets a lot-size range fails
-- with "canceling statement due to statement timeout". The acreage predicate
-- added in migration 20260808000003 is the only filter in search_listings that
-- has no index behind it, so every acreage-constrained search degrades into a
-- scan of the whole eligible winner set with the coalesce/nullif arithmetic
-- evaluated per row before anything can be discarded.
--
-- FIX: a partial btree index on the acreage expression itself, so the
-- p_min_acres / p_max_acres range predicates become an index range scan.
--
-- WHY THE EXPRESSION IS COPIED CHARACTER-FOR-CHARACTER FROM THE RPC:
--   Postgres does not "understand" that two expressions are mathematically
--   equivalent. It matches an expression index by comparing the *parse tree*
--   of the indexed expression against the parse tree in the query, so the
--   index is only usable if it is built from the same functions, in the same
--   nesting, over the same constants. Any of the following would produce a
--   different tree and silently defeat the index:
--     * CASE WHEN ... END instead of nullif(..., 0)
--     * lot_size_acres alone, without the square-foot fallback
--     * / 43560 or / 43560::float8 instead of / 43560.0
--     * flipping the coalesce argument order
--   Both lot_size_acres and lot_size_square_feet are NUMERIC, so the literal
--   43560.0 parses as numeric in the index and in the RPC identically. There
--   is no implicit cast on either side to diverge. If search_listings is ever
--   re-created, this expression has to be edited in lockstep with it — see
--   supabase/migrations/20260808000003_search_listings_lot_size.sql.
--
-- WHY THE PARTIAL PREDICATE IS THESE THREE GATES:
--   search_listings can only ever return active, viewable winners, so indexing
--   anything outside that set is dead weight on a table the sync + winner-
--   recalc trigger rewrites constantly. The three gates below are exactly the
--   unconditional (non-parameterized) WHERE clauses in the RPC's `filtered`
--   CTE, so every acreage query trivially implies the index predicate and the
--   planner can use it no matter which optional parameters are supplied.

CREATE INDEX IF NOT EXISTS idx_mls_listings_acreage
  ON mls_listings ((
    coalesce(
      nullif(lot_size_acres, 0),
      nullif(lot_size_square_feet, 0) / 43560.0
    )
  ))
  WHERE is_winner = true
    AND mlg_can_view = true
    AND standard_status IN ('Active', 'Active Under Contract', 'Pending');

-- Refresh planner statistics so the new index is costed correctly. Expression
-- indexes also give ANALYZE somewhere to record stats for the *expression*,
-- which the planner otherwise has to guess at.
ANALYZE mls_listings;

-- ── Verify on the live DB ────────────────────────────────────────────────────
--   EXPLAIN (ANALYZE, BUFFERS)
--   SELECT listing_key FROM mls_listings
--    WHERE is_winner = true AND mlg_can_view = true
--      AND standard_status IN ('Active','Active Under Contract','Pending')
--      AND property_type <> 'Residential Lease'
--      AND coalesce(nullif(lot_size_acres, 0),
--                   nullif(lot_size_square_feet, 0) / 43560.0) >= 5;
-- Expect an Index/Bitmap scan on idx_mls_listings_acreage, not a Seq Scan.
--
-- ── Notes ────────────────────────────────────────────────────────────────────
-- * The RPC also filters property_type <> 'Residential Lease', and that is
--   deliberately NOT part of the index predicate. A query only has to IMPLY
--   the index predicate to use the index, not match it exactly, so the extra
--   lease filter is applied as a cheap recheck once the row set is narrowed.
--   Leaving it out keeps this predicate identical to the ones on
--   idx_mls_listings_beds and idx_mls_listings_search_trgm (migration
--   20260521000005), so all three cover the same row set and stay easy to
--   reason about together.
-- * On the live table, prefer CREATE INDEX CONCURRENTLY when applying by hand
--   (it cannot run inside a transaction) to avoid blocking sync writes. The
--   plain form above is migration-safe here: the eligible set is only the few
--   thousand active viewable winners, so the build (and the SHARE lock it holds
--   against concurrent writes) finishes well inside a single sync cycle.
