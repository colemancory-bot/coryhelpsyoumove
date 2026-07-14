# CMA Accuracy Plan: Appraiser-Style Review

**Date:** 2026-07-14
**Scope:** `supabase/functions/cma-engine/index.ts`, `cma-extract-features/index.ts`, `crm.js` CMA module, `docs/CMA-ALGORITHM.md`
**Goal:** Make the CMA engine extremely accurate for rural Western NC (Haywood, Jackson, Macon, Swain).

---

## How an appraiser would grade the current tool

What's already good (better than most agent CMA tools):

- Tiered marginal lot values (plattage effect) instead of linear $/acre
- Construction type as % of improvement value, not flat dollars
- Gross/net adjustment guardrail warnings (25% / 15% / 10% thresholds)
- Inverse-gross-adjustment weighting of comps
- Paired-sales calibration concept
- Land CMAs include actives/pendings because rural land sales are sparse
- Comp override system so the agent can correct bad MLS data

Where the accuracy leaks are, ranked by impact:

---

## Findings (ranked by expected error contribution)

### F1. No accuracy measurement exists (blocker for everything else)
There is no way to know if any rate or rule change makes valuations better or worse. Every other finding below is a hypothesis until it can be scored.

**Fix: build a backtest harness first.** For every closed sale in the DB with feature tags (target 100+ per county):
1. Treat the sold listing as the subject, using only data known before its close date (comp date cutoff = subject's list date; exclude the subject itself).
2. Run auto-select-comps + calculate-adjustments blind.
3. Compare `suggested_price` to actual `close_price`.
4. Report: median absolute % error (MdAPE), % within 10% (PPE10), % within 20%, segmented by county, property type (residential/land/log/manufactured), and price band.

This becomes the regression gate: every change in this plan gets a before/after backtest run. Industry AVM benchmark for context: rural PPE10 for Zillow/national AVMs is poor (~50-60%); beating that decisively is the whole pitch of this tool.

### F2. Hardcoded +0.3%/month time adjustment (wrong sign risk)
`monthly_appreciation_pct: 0.3` is baked in. Post-Helene the WNC market *declined* (median -2.5%, inventory +41%). The engine adds phantom appreciation to every aged comp: up to +3.6% error/year for residential, and land CMAs use a 36-month window, so a 3-year-old land comp gets inflated ~11% in the wrong direction if the market was flat or falling.

**Fix:** Derive the market-conditions adjustment from our own MLS data. Monthly rolling median $/sqft (residential) and $/acre-tier (land) per county, stored in a small `cma_market_index` table refreshed by cron. Time adjustment = index(now) / index(comp close month) - 1. Sign can be negative. Fall back to 0% (not +0.3%) when data is thin. An appraiser never assumes appreciation; they extract it from the market.

### F3. The biggest rural value drivers are extracted but never adjusted for
`cma-extract-features` already captures `road_access`, `perc_status`, `utilities_available`, `winter_access`, `road_frontage_ft` into `cma_feature_tags`. `calculateCompAdjustments` never reads any of them. Our own research doc (`docs/land-cma-research.md`) ranks road access as the #1 land value driver (2-4x swing paved vs landlocked) and septic status as a 10-30% swing. Right now two parcels, one on paved state road with approved septic and one on a 4WD track with no perc test, adjust identically except for the fuzzy `road_noise` proxy.

**Fix:** Add adjustment categories, expressed as % of lot value (so they scale):
| Category | Basis | Suggested starting rates (calibrate via F1) |
|---|---|---|
| Road access class | paved_state baseline | gravel county -8%, private gravel -15%, 4WD/seasonal -35%, landlocked -70% |
| Septic/perc status | approved permit baseline | not_tested -15% (land) / -5% (residential), failed -40% (land) |
| Utilities | power at road baseline | no electric -10% to -20% depending on likely extension distance |
| Winter access | year_round baseline | seasonal_difficulty -5%, 4WD-only -15% |
| Flood zone | Zone X baseline | AE/A -10% of improvement value (needs FEMA NFHL lookup, see F8) |

Rate the subject and comp on the same scale and adjust the difference, same pattern as existing categories. Missing data on either side = no adjustment + a MISSING DATA warning (see F9).

### F4. Flat-dollar mountain adjustments ignore price tier
View at $25K/point is applied identically to a $180K manufactured home in Whittier and a $1.4M Cashiers estate. Appraisal practice: qualitative premiums are proportional. A 5/5 panoramic view is worth far more than $125K on the plateau and less than $125K at the bottom of the market. Same problem for water, privacy, condition.

**Fix:** Convert view/water/privacy/condition to % of comp value per point (e.g. view 5%/pt, water 4%/pt, condition 4.5%/pt, privacy 1.5%/pt as starting points that reproduce today's dollars at the ~$450K median), or scale the flat rates by (comp_price / county_median). Keep the dollar display in the grid. Calibrate against paired sales + backtest.

### F5. Same-county hard filter + no submarket awareness
Two failure modes:
1. **County lines cut off the nearest comps.** A subject in Balsam or Dellwood may have its best comps across the Haywood/Jackson line 3 miles away, while the engine reaches 15 miles inside the county instead.
2. **Within-county micro-markets are invisible.** Jackson County spans Sylva (~$15-17K/acre) and Cashiers/Highlands plateau ($400K+/acre listings). The county filter happily mixes them; only price-similarity scoring (weight 0.10) and the 2x-median outlier rule push back, and for land actives `detectPriceOutliers` never fires because it reads `close_price` only.

**Fix:**
- Drop county as a hard filter; make the query geographic (bounding box on lat/lng) and keep county as a scoring signal (same county = small bonus).
- Add a `submarket` tag per listing (rule-based from city + elevation band: e.g. `cashiers_plateau` = Cashiers/Highlands/Glenville/Sapphire or elevation > 3200ft in south Jackson; `sylva_basin`; `maggie_valley`; etc.). Same-submarket = strong scoring bonus, cross-submarket = heavy penalty. This is the appraiser's "market area" concept, which never was the county.
- Extend `detectPriceOutliers` to use `close_price || list_price` so active land comps participate.

### F6. Comp candidate query returns an arbitrary 100 rows (bug)
Both `find-comps` and `auto-select-comps` do `.select(...).limit(100)` with **no `.order()`**. Postgres row order without ORDER BY is unspecified. In any county+type combo with more than 100 closed sales in the window, the candidate pool is effectively random, and the distance filter runs *after* the limit, so nearby comps can be silently absent from the pool entirely.

**Fix:** Add `.order("close_date", { ascending: false })` at minimum; better, prefilter by bounding box around the subject and raise the limit to 300-500. Cheap fix, real accuracy win in Haywood where volume is highest.

### F7. Active land listings priced at raw list price
Land comps include Active/Pending rows valued at `list_price` with no adjustment. Rural land routinely sells at 85-93% of list, and the longer a parcel sits (WNC land DOM is often 1-2 years) the more overpriced it is by definition. This biases every land CMA high, which is exactly the conversation an agent doesn't want at a listing appointment.

**Fix:**
- Compute a rolling county list-to-sale ratio for land from our own closed rows; multiply active list prices by it before adjustments.
- Add a DOM-based staleness discount or cap (e.g. listings >365 DOM flagged and further discounted or excluded from the weighted mean, kept only as a "ceiling" exhibit).
- In the weighted average, give sold comps 2x the weight of actives. Appraisers treat listings as the ceiling of value, never as primary evidence.

### F8. Feature ratings come from marketing remarks only
`cma-extract-features` has Claude read MLS public remarks. Remarks are advertising: "gorgeous mountain views" is routinely a winter-only glimpse. There is no ground truth. Since view/water/usability drive $100K+ spreads, rating noise is a first-order error source. Also: `getElevation` exists but there is no slope or viewshed use, despite the research doc mapping out USGS 3DEP.

**Fix (in order of effort):**
1. **Photo-based extraction.** Winner listings already have photos in R2. Send the top 5-8 photos to Claude vision alongside remarks; photos catch view quality, condition, land character far more honestly than remarks. Store `extraction_source: remarks|photos|both` and a per-field confidence.
2. **DEM-derived land_usability.** USGS 3DEP 1m DEM: compute mean/max slope over the parcel (county GIS parcel polygons are already integrated for Jackson/Haywood). Slope >30% = NC septic "unsuitable" — this makes `land_usability` and part of septic risk objective instead of vibes.
3. **Viewshed scoring (later).** Line-of-sight from the parcel high point against the DEM to grade view potential 0-5. Big differentiator, heavier lift.
4. **FEMA NFHL flood lookup** by lat/lng (free WMS/API) to power the F3 flood adjustment.

### F9. Missing feature ratings silently zero the adjustment
Every mountain adjustment is gated on `subView > 0 && compView > 0` etc. If either side lacks a tag, the adjustment is $0 with **no warning** (sqft and lot size do warn). A comp with no feature extraction competes on equal footing with a fully-tagged comp and looks "cleaner" (lower gross adjustments = higher weight!). That's backwards: the least-documented comp currently gets the most influence.

**Fix:** Warn on every skipped category ("Comp 3 has no view rating; view adjustment omitted"), and add a data-completeness factor to the comp weight so fully-tagged comps outweigh untagged ones. Also ensure feature extraction backfill has actually covered the comp universe (add a coverage stat to the admin dashboard).

### F10. Paired-sales calibration is under-constrained
- No minimum sample size: one "high confidence" pair overrides the county default rate wholesale.
- `Math.abs(median)` forces rates positive and can mask a sign-inconsistent (i.e. garbage) category.
- Pairs control sqft (within 30%), county, 10mi, and the other 4 rating categories, but **not** lot size, condition, construction type, year built, or sale-date gap, so the derived $/point absorbs whatever else differed.
- `condition_rating` isn't calibrated at all, and its $20K/point rate is hardcoded at the call site (line ~763) instead of living in `WNC_DEFAULTS`, contradicting `docs/CMA-ALGORITHM.md` which claims all rates live in the rates objects.

**Fix:** Require n ≥ 5 high-confidence pairs per category; use shrinkage (blend derived median toward the default proportional to sample size, e.g. `rate = (n*median + k*default)/(n+k)` with k=5); add lot-size (within 30%), construction-match, and year (within 15) constraints; time-normalize the two sale prices using the F2 market index before differencing; move condition rate into the rates objects and include `condition_rating` in the calibration categories.

### F11. Smaller correctness items
- **Half baths ignored:** `bathrooms_total_integer` only. Use full + half (half at ~40-50% of full-bath rate). RESO provides `BathroomsFull`/`BathroomsHalf`.
- **Concessions always $0:** placeholder. Post-NAR-settlement, seller-paid buyer-agent comp and concessions are real. Pull RESO concession fields where the feed provides them; otherwise leave the manual grid field but surface it in AI advice.
- **Elevation adjustment is linear** but the market is non-monotonic (sweet spot ~2,500-4,000 ft; above 4,000 ft winter access costs bite). Replace with band-based: premium rising to the sweet spot, penalty above ~4,200 ft unless Cashiers/Highlands submarket.
- **Weighting is too gentle:** a comp at 25% gross adjustments still gets weight 0.8 vs 1.0. Square the penalty or exclude comps >35% gross from the weighted mean (keep them visible with warnings).
- **Dual rate cards** (`crm.js CMA_RATES` + engine `WNC_DEFAULTS` + 4 slider multiplier objects) must be hand-synced per the docs. Move rates to a `cma_rates` DB table (or a shared JSON the client fetches) so there is one source of truth and quarterly recalibration touches one place.

---

## Implementation plan

### Phase 0: Measure (do first, ~1 session)
- Backtest harness (F1) as a script or engine action: blind re-valuation of past closed sales, MdAPE/PPE10 by county/type/price band.
- Baseline report checked into `docs/` so every later phase proves its gain.
- Feature-tag coverage stats (what % of closed sales have tags — F9 dependency).

### Phase 1: Correctness fixes (~1 session, biggest cheap wins)
- Query ordering/bounding-box bug (F6)
- Market-index time adjustment replacing +0.3%/mo (F2)
- List-to-sale ratio + staleness handling for land actives (F7)
- Outlier detection using list_price fallback (F5 partial)
- Missing-rating warnings + completeness weighting (F9)
- Condition rate into rates objects; half baths; weight curve (F10/F11 partial)
- Re-run backtest; record delta.

### Phase 2: Rural drivers + scaling (~1-2 sessions)
- Road access / septic / utilities / winter access adjustments from existing tags (F3)
- Percentage-based scaling for view/water/privacy/condition (F4)
- Submarket tagging + market-area comp search replacing hard county filter (F5)
- Re-run backtest; recalibrate starting rates.

### Phase 3: Ground truth (~2-3 sessions)
- Photo-based feature extraction with confidence scores (F8.1)
- DEM slope for land_usability + septic-suitability flag (F8.2)
- FEMA flood zone lookup + adjustment (F8.4)
- Viewshed scoring (F8.3, optional/later)

### Phase 4: Self-calibrating loop (ongoing)
- Hardened paired-sales derivation with shrinkage (F10)
- Quarterly cron: refresh market index, list-to-sale ratios, paired-sales rates, and backtest report; email summary via admin-notify
- Single-source rate table shared by engine and client (F11)
- Confidence score on every CMA output (comp count, distance, tag completeness, gross adj levels) so the report itself says how much to trust the number.

---

## What success looks like
- Backtested MdAPE under ~8% residential / ~15% land per county (land is inherently noisier).
- PPE10 meaningfully above national AVM rural performance, documented, and honest: the confidence score tells the agent when the tool is guessing.
- Quarterly recalibration is one cron + one review, not a hand-sync across three files.
