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

There are also **4 slider multiplier objects** in `crm.js` (search for `adj_view:`) that must match the mountain feature rates. These control how the slider maps to dollar values in the adjustment grid.

After changing rates in the engine, redeploy:
```
npx supabase functions deploy cma-engine --no-verify-jwt
```

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
| Bathrooms | $10,000 | per bathroom | `(subject_baths - comp_baths) * 10000` |
| Garage | $8,000 | per space | `(subject_garage - comp_garage) * 8000` |
| Year Built | $500 | per year | `(subject_year - comp_year) * 500` |

### Notes
- **Living area** at $175/sqft is based on WNC median price per square foot for residential. For land CMAs this is $0.
- **Garage** at $8K reflects WNC mountain market where garages are valued but not as premium as suburban markets.
- **Year built** at $500/year is intentionally conservative. Age matters less in WNC where 1960s cabins and 2020 builds coexist. The condition rating (below) captures actual property condition.

---

## Mountain Feature Adjustments (1-5 Rating Scale)

These are the biggest value drivers in WNC mountain real estate. Each property gets rated 0-5 on these features.

| Category | Rate per Point | Max Spread (0 to 5) | Formula |
|----------|---------------|---------------------|---------|
| View Quality | $25,000 | $125,000 | `(subject_rating - comp_rating) * 25000` |
| Water Features | $20,000 | $100,000 | `(subject_rating - comp_rating) * 20000` |
| Condition | $20,000 | $100,000 | `(subject_rating - comp_rating) * 20000` |
| Land Usability | $8,000 | $40,000 | `(subject_rating - comp_rating) * 8000` |
| Road Noise | $7,000 | $35,000 | `(subject_rating - comp_rating) * 7000` |
| Privacy | $6,000 | $30,000 | `(subject_rating - comp_rating) * 6000` |
| Elevation | $2,000 | per 100ft diff | `((subject_elev - comp_elev) / 100) * 2000` |

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

- **Views are #1.** Long-range mountain views are the primary value driver in WNC. A 5-point spread at $25K = $125K, which matches market reality where breathtaking views add $100K-$150K.
- **Water is #2.** National data shows river frontage at ~24% premium (Collateral Analytics). At $20K/point, the full spread is $100K, which is ~22% of a $450K median WNC home.
- **Condition at $20K** reflects that a fully renovated home vs a fixer-upper can easily differ by $100K.

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
| Log | +5% | Premium |
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

Applied when a comp's sale date differs significantly from the current market.

**Rate:** 0.3% per month (approximately 3.6% annual appreciation)

### Formula
```
months_diff = months between comp close date and current date
time_adjustment = comp_price * (months_diff * 0.003)
```

This is applied by the server-side engine, not the client-side grid.

---

## Valuation: Weighted Average

After all adjustments are applied to each comp, the final CMA value uses **inverse-gross-adjustment weighting**. Comps with fewer total adjustments are considered more similar to the subject and get more weight.

### Formula
```
For each comp:
  gross_adjustment_pct = sum of absolute values of all adjustments / comp_price * 100
  weight = 1 / (1 + gross_adjustment_pct / 100)

weighted_price = sum(adjusted_price * weight) / sum(weight)
```

### Example
| Comp | Adjusted Price | Gross Adj % | Weight | Contribution |
|------|---------------|-------------|--------|-------------|
| Comp 1 | $480,000 | 8% | 0.926 | $444,480 |
| Comp 2 | $510,000 | 15% | 0.870 | $443,700 |
| Comp 3 | $465,000 | 22% | 0.820 | $381,300 |
| Comp 4 | $495,000 | 5% | 0.952 | $471,240 |

Weighted Price = ($444,480 + $443,700 + $381,300 + $471,240) / (0.926 + 0.870 + 0.820 + 0.952) = **$487,100**

The range uses the middle comps (excluding highest and lowest if 4+ comps).

### Why Not Simple Average?
A comp that needed $80K in adjustments is less reliable than one that only needed $10K. The weighting ensures the most similar comps have the most influence on the final value.

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

Land CMAs focus entirely on lot size, views, water, land usability, road noise, privacy, elevation, and restriction status. Structural features are ignored.

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
- [ ] Update both `crm.js` CMA_RATES and `cma-engine` WNC_DEFAULTS
- [ ] Update the 4 slider multiplier objects in `crm.js` if mountain rates changed
- [ ] Redeploy: `npx supabase functions deploy cma-engine --no-verify-jwt`
- [ ] Update this document with new rates and the date
