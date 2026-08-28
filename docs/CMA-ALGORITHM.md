# CMA Algorithm Reference

**Version:** 2026-Q1
**Last Updated:** March 11, 2026
**Market:** Western North Carolina (Haywood, Jackson, Macon, Swain counties)

This document describes every rate, formula, and weighting used in the CMA (Comparative Market Analysis) engine. Update these values quarterly based on market conditions.

---

## Where to Change Rates

Rates live in two places that must stay in sync:

| File | Variable | Purpose |
|------|----------|---------|
| `crm.js` (~line 1729) | `CMA_RATES` | Client-side grid recalculation |
| `supabase/functions/cma-engine/index.ts` (~line 357) | `WNC_DEFAULTS` | Server-side engine calculation |

There are also **4 slider call sites** in `crm.js` that map the adjustment-grid
sliders to dollar values. As of F4 they no longer use hardcoded per-point dollar
objects; they call `cmaMountainMultiplier(adjKey, compIdx)`, which returns
`pct_per_point × comp_basis` (so a slider notch scales with the comp's price, staying
proportional on cheap properties and land). Elevation keeps its flat `$2,000`/100ft
multiplier. There is nothing to hand-sync at those sites anymore — they read the same
`CMA_RATES` percentages as the grid recompute.

After changing rates in the engine, redeploy:
```
npx supabase functions deploy cma-engine
```
> Deploy WITHOUT `--no-verify-jwt`. The function runs with `verify_jwt=true` in
> production; passing the flag would silently make it public.

---

## Standard Adjustments

These apply to residential CMAs. The formula is always:
```
adjustment = (subject_value - comp_value) * rate
```
A positive adjustment means the comp is inferior (missing something the subject has), so we add value to the comp.

| Category | Rate | Unit | Formula |
|----------|------|------|---------|
| Living Area | $175 | per sqft | `(subject_sqft - comp_sqft) * 175` |
| Bedrooms | $12,000 | per bedroom | `(subject_beds - comp_beds) * 12000` |
| Bathrooms | $10,000 | per effective bath | `(subject_eff_baths - comp_eff_baths) * 10000` |
| Garage | $8,000 | per space | `(subject_garage - comp_garage) * 8000` |
| Year Built | $500 | per year | `(subject_year - comp_year) * 500` |

### Notes
- **Living area** at $175/sqft is based on WNC median price per square foot for residential. For land CMAs this is $0.
- **Bathrooms** use an *effective* count that discounts half baths to 0.5. Both feeds
  (Canopy `mls-sync`, CSAR `navica-sync`) populate `BathroomsTotalInteger` and
  `BathroomsHalf` independently. To avoid double-counting we read `BathroomsTotalInteger`
  as a whole-room count (full and half rooms alike) and value each half bath at 0.5:
  `effective = (total - half) + 0.5 * half`. Implemented as `effectiveBaths()` in the
  engine and `cmaEffectiveBaths()` in `crm.js`.
- **Garage** at $8K reflects WNC mountain market where garages are valued but not as premium as suburban markets.
- **Year built** at $500/year is intentionally conservative. Age matters less in WNC where 1960s cabins and 2020 builds coexist. The condition rating (below) captures actual property condition.

---

## Mountain Feature Adjustments (1-5 Rating Scale)

These are the biggest value drivers in WNC mountain real estate. Each property gets rated 0-5 on these features.

### Percentage of comp basis (F4)

As of the F4 change, all mountain premiums except elevation are a **percent of the
comp's effective sale price** ("basis"), not a flat dollar amount. Flat dollars were
disproportionate: a $25K/view-point rate is ~5% of a $450K home but could exceed a
$40K parcel's entire value, which blew median gross adjustments to 55% residential /
105% land, tripped the 35% gross-adjustment guardrail, and thinned the usable comp
set (see `docs/cma-backtest-phase2-tags.md`). Appraisers scale qualitative premiums
proportionally, so the formula is now:

```
basis = comp effective sale price   (close_price, or list_price × list-to-sale ratio for land actives)
adjustment = round((subject_rating - comp_rating) * pct_per_point * basis)
```

If `basis <= 0` the percentage adjustments are skipped with a MISSING DATA warning
(no NaN). **Elevation stays flat** ($/100ft) — its premium is not price-proportional
in the same way.

| Category | Residential %/pt | Land %/pt | Formula |
|----------|-----------------|-----------|---------|
| View Quality | 5.5% | 10% | `(subj - comp) * pct * basis` |
| Water Features | 4.4% | 8% | `(subj - comp) * pct * basis` |
| Condition | 4.4% | 4.4% | `(subj - comp) * pct * basis` |
| Land Usability | 1.8% | 9% | `(subj - comp) * pct * basis` |
| Road Noise | 1.5% | 6% | `(subj - comp) * pct * basis` |
| Privacy | 1.3% | 4% | `(subj - comp) * pct * basis` |
| Elevation | $2,000 (flat) | $2,000 (flat) | `((subj_elev - comp_elev) / 100) * 2000` |

**Residential %/pt are calibrated to reproduce the prior flat dollars at the ~$450K
median**, so behavior at the median is unchanged and only behavior away from it
becomes proportional: `25000/450000 = 5.5%`, `20000/450000 = 4.4%`,
`8000/450000 = 1.8%`, `7000/450000 = 1.5%`, `6000/450000 = 1.3%`.

**Land %/pt are steeper**, derived from the WNC premium ranges in
`docs/land-cma-research.md` (per rating point over a ~5-point scale): panoramic views
25-75%+ → 10%/pt; year-round creek 25-50% / river 25-75% → 8%/pt; buildability is
decisive, steep 10-30% discount and >30% "unsuitable" for NC septic → 9%/pt; road
access is the #1 land driver (2-4x over landlocked) → 6%/pt for the road_noise proxy;
privacy 4%/pt. Condition rarely applies to raw land and stays at the residential 4.4%.

The %/pt values live in `view_pct_per_point` / `water_pct_per_point` /
`land_pct_per_point` / `road_noise_pct_per_point` / `privacy_pct_per_point` /
`condition_pct_per_point` in engine `WNC_DEFAULTS` (residential) and
`WNC_LAND_DEFAULTS` (land), and in `CMA_RATES` (client, with a nested `land_pct`
object). Elevation is `elevation_per_100ft`.

### Rating Scale Reference

**View Quality:**
0 = No view, 1 = Minimal/wooded, 2 = Seasonal/partial, 3 = Short-range mountain, 4 = Year-round long-range, 5 = Breathtaking panoramic

**Water Features:**
0 = No water, 1 = Seasonal creek/spring, 2 = Year-round creek, 3 = Larger creek/pond/river proximity, 4 = River frontage/lake access, 5 = Premium waterfront (major river, waterfall, lake frontage)

**Condition:**
0 = Tear-down, 1 = Major renovation needed, 2 = Needs work, 3 = Average/livable, 4 = Well-maintained/updated, 5 = Fully renovated/new construction

**Land Usability:**
0 = Unusable steep, 1 = Mostly steep, 2 = Some usable area, 3 = Mixed terrain, 4 = Mostly usable, 5 = Flat/gently rolling

**Road Noise:**
0 = Highway adjacent, 1 = Significant road noise, 2 = Moderate, 3 = Some, 4 = Quiet, 5 = Very remote/silent

**Privacy:**
0 = Visible from all sides, 1 = Minimal privacy, 2 = Some screening, 3 = Average, 4 = Well-screened, 5 = Completely secluded

### Why These Rates

- **Views are #1.** Long-range mountain views are the primary value driver in WNC. At 5.5%/pt a full 5-point spread is 27.5% of the comp's price — ~$124K on a $450K home, matching market reality — but it scales down on a modest cabin and up on land (10%/pt) instead of being a fixed $125K everywhere.
- **Water is #2.** National data shows river frontage at ~24% premium (Collateral Analytics). At 4.4%/pt a 5-point spread is 22% of the comp's price, ~$99K on a $450K home.
- **Condition at 4.4%/pt** reflects that a fully renovated home vs a fixer-upper can easily differ by ~$100K on a mid-priced home, while staying proportional on cheaper stock. The rate lives in the rates objects as `condition_pct_per_point` (engine `WNC_DEFAULTS`/`WNC_LAND_DEFAULTS`, client `CMA_RATES`), not hardcoded at the call site.

---

## Lot Size Adjustment (Tiered Marginal Value)

Lot value uses a tiered system because additional acreage has diminishing returns. The first 2 acres (homesite) are worth the most per acre. Large tracts are valued lower per acre.

| Tier | Acres | Value per Acre |
|------|-------|---------------|
| 1 | 0 - 2 | $25,000/acre |
| 2 | 2 - 5 | $15,000/acre |
| 3 | 5 - 10 | $8,000/acre |
| 4 | 10 - 25 | $4,000/acre |
| 5 | 25 - 50 | $2,500/acre |
| 6 | 50+ | $1,500/acre |

### Formula
```
For each tier, calculate: min(remaining_acres, tier_size) * tier_rate
Sum all tiers = total lot value
Adjustment = subject_lot_value - comp_lot_value
```

### Examples

| Acreage | Estimated Lot Value |
|---------|-------------------|
| 0.5 acres | $12,500 |
| 1 acre | $25,000 |
| 2 acres | $50,000 |
| 5 acres | $95,000 |
| 10 acres | $135,000 |
| 25 acres | $195,000 |
| 50 acres | $257,500 |

---

## Restriction Status Adjustment

Unrestricted land commands a premium in WNC (no HOA, can subdivide, farm, build multiple structures).

**Rate:** 10% of the comp's estimated lot value

### Formula
```
If subject is unrestricted and comp is restricted:
  adjustment = +comp_lot_value * 0.10

If subject is restricted and comp is unrestricted:
  adjustment = -comp_lot_value * 0.10

If same status: $0
```

### Example
Comp has 5 acres (lot value ~$95K) and is restricted. Subject is unrestricted.
Adjustment = +$95,000 * 0.10 = +$9,500

---

## Construction Type Adjustment

Construction type uses a **percentage of improvement value** (not flat dollars) because the impact scales with property price. Improvement value = sale price minus estimated lot value, with a floor at 30% of sale price.

| Type | % of Improvement Value | Direction |
|------|----------------------|-----------|
| Site-Built | 0% | Baseline |
| Log | +10% | Premium |
| Modular | -10% | Discount |
| Manufactured | -25% | Discount |
| Mobile Home | -35% | Discount |

### Formula
```
comp_price = comp sale price
comp_lot_value = tiered lot value from acreage
improvement_value = max(comp_price - comp_lot_value, comp_price * 0.30)

subject_pct = construction_pct[subject_type]
comp_pct = construction_pct[comp_type]

adjustment = improvement_value * (subject_pct - comp_pct)
```

### Example
Subject is manufactured (-25%). Comp is site-built (0%). Comp sold for $350K on 3 acres.
- Comp lot value: 2 * $25K + 1 * $15K = $65K
- Improvement value: $350K - $65K = $285K
- Adjustment: $285K * (-0.25 - 0) = -$71,250

This means the manufactured subject is worth ~$71K less than the site-built comp.

---

## Structural Feature Adjustments

| Feature | Rate | Formula |
|---------|------|---------|
| Pool (Inground) | $0 | No adjustment (WNC: short season, maintenance costs offset value) |
| Pool (Above Ground) | -$3,000 | Slight negative for removal liability |
| Basement (Finished) | $60/sqft | `(subject_bsmt_sqft - comp_bsmt_sqft) * 60` |
| Basement (Partial) | $20,000 | Flat value |
| Basement (Unfinished) | $10,000 | Flat value (storage/workshop potential) |
| Fireplace | $8,000 | Per fireplace count difference |
| Fireplace (Stone/Masonry) | +$5,000 | Additional premium per stone fireplace |
| Covered Outdoor Space | $30/sqft | `(subject_sqft - comp_sqft) * 30` |
| Outbuildings | Tiered | Tier 0=$0, Tier 1=$5K, Tier 2=$15K, Tier 3=$30K |

### Outbuilding Tiers
- 0 = None
- 1 = Small shed or basic outbuilding
- 2 = Workshop, large barn, or multiple outbuildings
- 3 = Significant structures (guest house, large barn with utilities)

---

## Market Time Adjustment

Market-derived from our own closed sales, not a fixed rate. The old hardcoded
+0.3%/month assumed appreciation that post-Helene WNC did not have (median -2.5%,
inventory +41%), so it inflated every aged comp in the wrong direction.

### How the index is built (`computeMarketIndex`)
1. Pull closed sales for the comp's county over the 42 months before the as-of date.
2. Per-sale metric: residential = `close_price / living_area`; land =
   `close_price / tieredLotValue(acres)` (normalizes plattage).
3. Bucket sales into calendar quarters. Each bucket needs >= 8 sales; thin buckets
   merge forward into the next.
4. Take the median per bucket, then smooth with a 2-bucket trailing average.

### Formula
```
factor = index(as-of quarter) / index(comp's sale quarter) - 1     (clamped to +/-25%)
time_adjustment = round(comp_sale_price * factor)
```

- The factor's sign can be **negative** (a declining market discounts old comps).
- When the index is unavailable — fewer than 3 smoothed buckets, or the comp's /
  as-of quarter is missing — the factor is `null` and the time adjustment is **$0**.
  An appraiser never assumes drift; zero is the safe default, not +0.3%/mo.
- Active/pending comps have no close date, so they never receive a time adjustment.
- `monthly_appreciation_pct` remains in the rates objects for reference and manual
  sliders, but is no longer used as the default.

This is applied by the server-side engine, not the client-side grid. The client
displays the engine's `adj_time` and does not recompute it locally.

---

## Valuation: Weighted Average

After all adjustments are applied to each comp, the final CMA value uses a weighted
mean over an **included set** of comps.

### Included set
A comp contributes to the point value and the range only if:
- its adjusted price is > 0,
- its gross adjustments are <= 35% (comps over 35% are excluded but stay visible with a warning), and
- it is not a stale active listing (> 365 days on market — kept as a ceiling reference only).

### Weight formula
```
base   = 1 / (1 + gross_adjustment_pct / 100)
weight = base^2                         # squared penalty — heavily favors close comps
         * (2 if sold else 1)           # sold comps outweigh active/pending listings 2:1
         * (0.5 + 0.5 * completeness)   # completeness = fraction of the 6 mountain
                                        # ratings present on the comp's feature tags

weighted_price = sum(adjusted_price * weight) / sum(weight)
```

Only comps inside the trimmed range (see below) contribute to the weighted mean.

### Range
Sort the included set's adjusted prices; if 4+ comps, drop the single lowest and
highest (trim extremes). The range low/high come from this same included set so the
range and the point value stay consistent.

### Why these rules
- **Squared curve:** a comp at 25% gross used to get weight 0.80 vs 1.0 — too gentle.
  Squared, it drops to ~0.64, so marginal comps stop dragging the number.
- **35% exclusion:** an appraiser wouldn't lean on a comp needing a third of its price
  in adjustments; it's shown but not counted.
- **Sold 2x active:** appraisers treat listings as the ceiling of value, never as
  primary evidence.
- **Completeness factor:** previously an untagged comp showed fewer adjustments, so it
  got a *lower* gross and therefore *more* weight — backwards. Down-weighting by tag
  completeness fixes that. (Client-side recompute mirrors the squared curve and the
  sold-2x rule but not the completeness factor, which needs the comp's tag data.)

---

## Land CMA Differences

When the property type is "Land" or has no living area, the engine uses different defaults:

| Setting | Residential | Land |
|---------|------------|------|
| price_per_sqft | $175 | $0 |
| per_bedroom | $12,000 | $0 |
| per_bathroom | $10,000 | $0 |
| per_garage_space | $8,000 | $0 |
| per_year_age | $500 | $0 |
| unrestricted_premium_pct | 10% | 15% |
| view_pct_per_point | 5.5% | 10% |
| water_pct_per_point | 4.4% | 8% |
| land_pct_per_point | 1.8% | 9% |
| road_noise_pct_per_point | 1.5% | 6% |
| privacy_pct_per_point | 1.3% | 4% |
| condition_pct_per_point | 4.4% | 4.4% |
| elevation_per_100ft | $2,000 (flat) | $2,000 (flat) |

Land CMAs focus entirely on lot size, views, water, land usability, road noise, privacy, elevation, and restriction status. Structural features are ignored. The mountain-feature %/pt are **steeper for land** (see Mountain Feature Adjustments above), because on a raw parcel the qualitative feature often IS most of the value.

### Active/pending land comps (list-to-sale ratio + staleness)
Rural land sells sparsely and sits for a long time, so land CMAs include active,
pending, and under-contract listings — but priced honestly, not at raw list price:

- **List-to-sale ratio (`computeLandListToSaleRatio`).** Median of
  `close_price / list_price` over closed Land sales in the comp's county in the
  trailing 24 months. Fewer than 8 samples falls back to **0.90**. A non-closed land
  comp whose price basis is its list price is multiplied by this ratio before any
  adjustments, and the result is marked `price_basis: "list_adjusted"`.
- **Staleness.** An active listing with > 365 days on market is overpriced by
  definition; it gets a warning and is **excluded from the weighted mean** (shown as
  a ceiling reference only).
- **Sold vs active weighting.** In the weighted mean, sold comps get 2x the weight of
  non-closed comps (see Weighted Average).

---

## Paired-Sales Calibration

When enough high-confidence paired sales exist for a county, they refine the mountain
feature rates. Because the rates are now **percentages** (F4), the paired data — which
is stored as a dollar-per-point `derived_adjustment` — is **converted to percentage
space at read time**. Rules (per feature category):

- Each pair contributes `pct = derived_adjustment / mean(price_a, price_b)`. Pairs
  with no usable price basis are dropped. Stored pairs are left as-is (dollars); the
  conversion happens only when `calculate-adjustments` reads them.
- Require **>= 5** high-confidence pairs; fewer keeps the WNC default.
- Take the **median pct** per category, then **shrink** toward the default percentage:
  `rate = (n * median + 5 * default) / (n + 5)`. A handful of pairs nudges the rate; it
  takes many to move it far. (No rounding — these are small fractions.)
- If the derived median pct is **negative** (sign-inconsistent — nonsensical for these
  categories), the paired data is ignored and the default is used.
- The `feature_category` values (`view_quality`, `water_quality`, `land_usability`,
  `road_noise`, `privacy_rating`, `condition_rating`) map to the rate keys
  (`view_pct_per_point`, etc.) via an explicit table.

Only "high"-confidence pairs (living-area ratio > 0.9) qualify, so land pairs never
contribute; land mountain %/pt stay on the `WNC_LAND_DEFAULTS` values.

---

## Comp Override System

Users can manually edit any comp value in the Step 3 grid (beds, baths, sqft, garage, year, ratings, etc.). When a value is overridden:

1. The override is stored in `_cmaState.compOverrides[compIndex][field]`
2. The `cmaGetCompVal()` function checks overrides first, then listing data, then features
3. Adjustments auto-recalculate using the overridden value
4. Overrides are saved with the report and restored when loading

This lets the agent correct MLS data errors without modifying the listing record.

---

## Quarterly Review Checklist

Every quarter, review these rates against recent sales data:

- [ ] Pull 20-30 recent closed sales in each county
- [ ] Compare paired sales (similar properties with one key difference) to validate rates
- [ ] Check median $/sqft for the market (currently $175)
- [ ] Review any new construction type trends (modular becoming more common?)
- [ ] Update `version` field to current quarter (e.g., '2026-Q2')
- [ ] Update both `crm.js` CMA_RATES (residential keys + nested `land_pct`) and `cma-engine` WNC_DEFAULTS / WNC_LAND_DEFAULTS
- [ ] Mountain rates are now percentages of comp basis; the `crm.js` sliders read them via `cmaMountainMultiplier` (no separate multiplier objects to hand-sync)
- [ ] Redeploy: `npx supabase functions deploy cma-engine` (NOT `--no-verify-jwt`)
- [ ] Update this document with new rates and the date
