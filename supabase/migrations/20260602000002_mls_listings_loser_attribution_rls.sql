-- ═══════════════════════════════════════════════════════════════════════
-- Restore cross-MLS attribution: let anon read IDX-eligible "loser" rows
-- ═══════════════════════════════════════════════════════════════════════
-- SYMPTOM: the public site's cross-MLS "also listed in ..." attribution block
-- stopped populating. The frontend siblings query (app.js, ~line 1054) asks for
--     mlg_can_view = true AND is_winner = false
-- to attribute the other MLS(es) that carry a displayed property. But the
-- compliance policy "Public can read IDX-eligible active winners" (migration
-- 20260424000001) requires is_winner = TRUE, so under RLS the siblings query
-- now returns ZERO rows for anon. The required attribution (the displayed
-- winner's own broker/MLS) still works via the winner row; only the extra
-- cross-MLS source list is missing.
--
-- COMPLIANCE REASONING (read before applying — this touches anon RLS):
--   A "loser" is the non-primary row for a property that ALSO appears in another
--   MLS. Cross-MLS dedup elects one winner per address group; the loser is the
--   same physical, already-displayed property. This policy exposes loser rows
--   ONLY when the loser itself passes every IDX gate the winner policy enforces
--   (active status, mlg_can_view, IDX in mlg_can_use, display-allowed, non-lease).
--   So every row this policy can return is independently an IDX-displayable
--   listing — nothing that the compliance audit (Rule 7/8/11B) intended to hide
--   becomes visible. A BO/VOW-only or opted-out loser (mlg_can_view = false,
--   no IDX) is still blocked. Column exposure is unchanged: the column-level
--   GRANT from migration 20260530000001 already restricts anon to safe columns,
--   so even these rows return only the public projection.
--
--   Net effect: anon can read the minimal attribution projection
--   (listing_key, address_group_key, listing_id, originating_system_name,
--    attribution_contact) of IDX-eligible active losers, which is what the
--   mlsSources display needs. RESO/MLS Grid attribution display is supported,
--   not undermined.
--
--   ALTERNATIVE (zero RLS change) if you prefer not to touch anon RLS at all:
--   drop the siblings query in app.js and accept that the cross-MLS source list
--   is not shown (the required single-listing attribution still renders). This
--   migration is the option that restores the feature compliantly.

CREATE POLICY "Public can read IDX-eligible active losers for attribution"
ON mls_listings
FOR SELECT USING (
  mlg_can_view = TRUE
  AND is_winner = FALSE
  AND standard_status IN ('Active', 'Active Under Contract', 'Pending')
  AND COALESCE(internet_entire_listing_display_yn, TRUE) = TRUE
  AND 'IDX' = ANY(COALESCE(mlg_can_use, ARRAY['IDX']::TEXT[]))
  AND COALESCE(property_type, '') <> 'Residential Lease'
);

-- ── Verify on the live DB AFTER applying (run as the anon role) ──────────────
-- Should now return the small attribution projection of active IDX losers:
--   SELECT listing_key, originating_system_name, attribution_contact
--     FROM mls_listings WHERE is_winner = FALSE LIMIT 5;     -> rows ✓
-- And must STILL block non-IDX / non-active / opted-out losers:
--   SELECT count(*) FROM mls_listings
--    WHERE is_winner = FALSE AND mlg_can_view = FALSE;       -> 0 ✓
--   SELECT count(*) FROM mls_listings
--    WHERE is_winner = FALSE
--      AND standard_status NOT IN ('Active','Active Under Contract','Pending'); -> 0 ✓
-- Private columns must remain blocked (column GRANT from 20260530000001):
--   SELECT private_remarks FROM mls_listings WHERE is_winner = FALSE LIMIT 1; -> permission denied ✓
