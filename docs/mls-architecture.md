# MLS / IDX integration

Reference moved out of `CLAUDE.md`, which keeps the display rules. Both feeds are live on production.

Both feeds are wired up and running on production. Contact for Navica: tom@navicamls.net. API host: navapi.navicamls.net.

## Architecture
- **Navica (CSAR)** — `supabase/functions/navica-sync/index.ts`. Pulls Property, Member, Office, OpenHouse via RESO Web API.
- **MLS Grid (Canopy)** — `supabase/functions/mls-sync/index.ts`. Canopy MLS feed.
- Both write into a unified `mls_listings` table. MLS Grid compliance requires that displayed photos be stored on our own infrastructure (Cloudflare R2), not hotlinked.
- Sync state tracked in `mls_sync_state` table, keyed by `resource_type` (e.g. `Navica_Property`). Includes stale-lock auto-reset after 10 min.
- Photos: only the **winner** of each cross-MLS dedup group gets R2 storage — see "Cross-MLS dedup" below.

## Cross-MLS dedup (server-side winner flag)
Both CSAR and Canopy often carry the same physical property. Instead of storing both sets of photos and deduping in the browser, one row per group is elected the winner and only that row gets R2 photos.

- **Migration:** `supabase/migrations/20260406000001_winner_dedup.sql`
- **Columns on `mls_listings`:** `address_group_key`, `quality_score`, `media_count`, `is_winner`
- **Trigger:** `mls_listings_winner_recalc` fires on INSERT or UPDATE of `(address_group_key, quality_score, media_count, standard_status, mlg_can_view)` and calls `mls_recalc_winner(grp)`. It does **not** watch `is_winner`, so the recalc's own flag updates don't re-trigger.
- **Winner rule:** highest `quality_score` DESC, then `media_count` DESC, then `modification_timestamp` DESC, then `listing_key` ASC. Active / Pending / Active Under Contract preferred; fallback to any status so the group still has a "primary" row for UI attribution.
- **Quality score:** identical weights to the old client-side `_qualityScore` — photo presence dominates (+100), with small tiebreaks for sqft, lat/lng, description length, year built, and lot. Computed at sync time by `computeQualityScore` in `supabase/functions/_shared/dedup.ts`.
- **Address group key:** normalized street+city with suffix expansion (st → street, etc.). Computed at sync time by `computeAddressGroupKey` in `_shared/dedup.ts`. SQL equivalent `mls_normalize_key` exists in the migration for the one-time seed of existing rows.

## Flip handling and cleanup queue
If a listing on MLS B later gets better data than the current winner on MLS A, the trigger flips `is_winner` and queues the former winner for R2 cleanup after a **24h grace period** (absorbs transient sync glitches).

- **Queue table:** `mls_media_cleanup_queue` — `(listing_key, listing_id, reason, queued_at)`, service-role only
- **Worker:** `mls-sync` action `cleanup-orphan-media` — reads queue rows older than `graceHours` (default 24), double-checks the listing didn't reclaim winner status during the grace window, then deletes R2 objects under `listings/{listing_id}/` and clears `local_url` on `mls_media`. If the listing became a winner again, the queue entry is just dropped.
- **Cron:** `mls-cleanup-orphan-media` runs hourly at `:37` (`supabase/migrations/20260406000002_winner_cleanup_cron.sql`)

## Cron Jobs (pg_cron + pg_net)
- `navica-sync-properties` — every 15 min, `{action:"sync-active", resource:"Property", limit:500}`
- `navica-sync-full` — hourly at :05, all resources
- `mls-grid-*` crons — see `20260228000036_mls_grid_cron.sql`
- `media-refresh` — AM/PM cycles, 18 invocations 3 min apart, cursor in `sync_cursors` table
- `mls-grid-backfill-media` — every 2 min, downloads Canopy winner photos to R2 (losers are skipped via an `is_winner` check against `mls_listings` on each page)
- `mls-cleanup-orphan-media` — hourly at :37, processes the 24h-grace cleanup queue

## Site-Side Reader
- `app.js` MLS_GRID section loads only `is_winner=true` rows from Supabase, plus a small sibling projection for loser attribution (`listing_id`, `originating_system_name`, `attribution_contact`).
- `_attachMlsSources` builds the `mlsSources` array on each listing from the sibling map. Replaces the old client-side `_deduplicateListings` (deleted).
- Feature flag `MLS_GRID.enabled` in `app.js` (search for `var MLS_GRID`).

## Historical: Slow Upserts → Stale Sync (resolved 2026-04-06)
On 2026-04-06 the Navica sync cursor was stuck ~10 days behind because `sync-active` was averaging ~3.8s per record (confirmed via `{limit:10}` returning in 38s). Root cause: both sync functions were calling `uploadMediaToR2` inline for each primary photo — a 1-2s synchronous HTTP round trip from the Supabase edge worker. At 500 records per cron body, each invocation would need ~31 minutes to finish, but edge functions kill at ~150s, so the cursor never advanced and every cron run redid the same work.

Fix: removed `uploadMediaToR2` from the `navica-sync` and `mls-sync` Property loops — the backfill-media cron already handles R2 asynchronously for winners only. If sync performance regresses again, check that no new synchronous external I/O has been added inside the per-record loop.

If the cursor gets stuck in `mls_sync_state`:
```sql
UPDATE mls_sync_state SET status='idle', error_message='manual reset'
WHERE resource_type IN ('Navica_Property','MLSGrid_Property');
```
Then invoke the function with a small limit (e.g. `{limit:20}`) a few times to walk it forward.

## MLS Grid IDX compliance: live-data verification (2026-04-24)

These passed architectural review (Canopy MLS compliance form, ticket #CMDLA00483263). After Canopy and Navica feeds went live, a full audit against production data found gaps in all three rules and a fix was shipped as `supabase/migrations/20260424000001_compliance_rule7_8_11b.sql` plus updates to both sync functions (`supabase/functions/mls-sync/index.ts` and `supabase/functions/navica-sync/index.ts`).

- [x] **Rule 7 — Address Withholding:** Verified via live anon REST on 2026-04-24. Gap found: 15 Active rows (9 Canopy + 6 CSAR) had `InternetAddressDisplayYN=false` yet still exposed `street_*` / `latitude` / `longitude` to the public. Fix: promoted `internet_address_display_yn` into a dedicated column, added one-time address masking for existing opt-outs, and every sync path (Canopy primary + sync-one + mini-backfill + backfill-closed, Navica primary + backfill-closed) now blanks `street_number/street_name/street_suffix/unit_number/latitude/longitude` when the seller opts out. `full_address` is a generated column and follows automatically.
- [x] **Rule 8 — Seller IDX Opt-Out:** Verified via live anon REST on 2026-04-24. Gap found: 6 Active Canopy rows had `InternetEntireListingDisplayYN=false` yet were still served to anon (e.g. CAR292869404 — `MlgCanUse=["BO","VOW"]`, no IDX, was exposed). Fix: promoted `internet_entire_listing_display_yn` + `mlg_can_use` into dedicated columns; sync writes `mlg_can_view = MlgCanView && InternetEntireListingDisplayYN && MlgCanUse.includes('IDX')`; new RLS policy `Public can read IDX-eligible active winners` enforces every gate at the database edge, so a direct REST call cannot see what the frontend filter would hide.
- [x] **Rule 11B — Data Removal on Refresh:** Verified via live anon REST on 2026-04-24. Incremental sync does capture status transitions (not just Actives — confirmed at `mls-sync/index.ts:188-189`), but the prior RLS policy only filtered on `mlg_can_view`, so 2,103 non-Active winner rows (1,413 Closed + 318 Canceled + 372 Expired) were still readable by anon even though the frontend filter excluded them. Fix: new RLS policy restricts anon SELECT to `standard_status IN ('Active','Active Under Contract','Pending')`. Non-Active rows are retained (agent-only CMA back-office still needs them) but admin-only via the existing `Admin can manage listings` policy.
