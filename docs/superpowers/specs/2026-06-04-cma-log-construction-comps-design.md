# CMA Engine: Log-Home Comp Selection, Construction Adjustment & Grid Transparency

**Date:** 2026-06-04
**Status:** Draft — awaiting user review
**Trigger:** Review of `CMA-571-One-Feather-Rd.html` (a log home) surfaced a valuation ~$40-55K too high.

---

## Problem

A CMA produced for **571 One Feather Rd** (a 2022 log home, Whittier) concluded **$431,488**, well above what the comps support. Investigation found five distinct issues:

1. **Hidden construction premium.** A `+10% of improvement value` log premium (~$28-37K/comp) is folded into every Net Adjustment and Adjusted Price but has **no row in the PDF grid**, so the printed line items never reconcile to the printed net. Computed in `crm.js`, not the engine. (`adj_elevation` is likewise unrendered.)
2. **Premium magnitude unsupported.** Appraisal literature: log homes "rarely sell for much if any premium over standard construction," have a narrower buyer pool, and are best valued via log-to-log comps. A flat +10% systematically inflates log-subject CMAs.
3. **Premium basis double-counts land.** It is `% of (sale price − lot value)` with a `compPrice × 0.3` floor. On high-acreage parcels the floor forces the "structure" base up to 30% of total price, so land inflates the premium — wrong for a structure-only adjustment.
4. **Phantom condition adjustment.** Unrated comps default to condition `3` ("Fair for Age") against a `5/5` subject → an automatic `(5−3) × $20K = +$40K` per comp, while the grid still displays the comp condition as "?/5".
5. **Comp selection ignores construction.** A log subject was comped against **zero** log homes. Construction type only applies a weak `0.5×` nerf to one similarity sub-score; there is no hard preference and no radius expansion to find log sales.

## Goals

- A log subject is comped **log-to-log first**, widening the search radius to find them.
- When no log comps exist, fall back to site-built **with a small, visible, structure-based adjustment**.
- Every adjustment that affects the total is **shown on the grid** (grid always reconciles to Net Adjustment).
- Condition adjustments never apply to comps the agent hasn't explicitly rated.

## Non-Goals

- Re-validating the manufactured/modular/mobile percentages (only their *basis* changes; values unchanged).
- Moving construction-adjustment math from the frontend into the edge function (kept in `crm.js` where slider overrides live; engine inconsistency noted but out of scope).
- Land CMAs (construction adjustment already N/A when `isLand`).

---

## Design

### 1. Construction adjustment — structure-based 5% (`crm.js`)

**Rate** ([crm.js:1788](../../crm.js)): `construction_pct.log` changes `0.10 → 0.05`. Other types unchanged.

**Basis** (both [crm.js:1839-1851](../../crm.js) slider recalc and [crm.js:1955-1994](../../crm.js) `cmaInitConstructionAdj`): replace the price-minus-lot improvement value with a square-footage-derived structure value:

```
structureValue = compLivingArea × CMA_RATES.price_per_sqft   // price_per_sqft = 175
adj_construction_type = round(structureValue × (subPct − compPct))
```

- Independent of `close_price` and `lot_size_acres` — a cabin on 15 acres and a house on 0.5 acres with the same footprint get the same premium.
- Log subject vs site-built comp: `1,152 sqft × 175 × 0.05 ≈ $10,080` (was ~$33,800).
- Log-to-log: `subPct − compPct = 0` → **$0** (market already prices it in).
- If `compLivingArea` is missing/0: adjustment = `$0` + existing missing-sqft warning (do **not** fall back to price — that reintroduces land contamination).

### 2. Comp selection — prefer log, widen radius (`cma-engine`, `find-comps` + `auto-select-comps`)

For a subject whose resolved construction is `log`:
- Raise the default `max_distance_miles` from `15` to `40` (only for log subjects; matches appraisal practice of pulling log comps 10-40 mi out). Explicit `filters.max_distance_miles` still overrides.
- After scoring, **partition candidates by resolved construction** (reuse existing `resolveConstruction`). Fill comp slots with log candidates first (highest-scored); only backfill with non-log (site-built/modular, never manufactured/mobile) when log candidates < target.
- Return `log_comp_count` and a `construction_fallback: true/false` flag in the response so the UI/PDF can caveat.

### 3. Grid transparency (`cma-pdf`)

In the adjustment-grid builder, add rows so the printed lines always sum to Net Adjustment:
- **Construction** data row (`subFeats.construction_type` vs each comp's) + **Construction Adj** row rendering `adj_construction_type` — placed in the "Age & Condition" or a new "Construction" section.
- **Elevation** data + adj row rendering `adj_elevation` (currently computed but never shown), placed in "Mountain Features."

Both fields are already persisted in the saved report; this is render-only.

### 4. Condition fix (`crm.js`)

Replace the `|| 3` comp-condition default at [crm.js:3329](../../crm.js), [crm.js:3572](../../crm.js), and [crm.js:4371](../../crm.js) with "unrated" (`null`/`0`):
- Unrated comp → **no condition adjustment** (parity). The existing `if (!compCond) return;` guard in `cmaInitConditionAdj` then yields `$0`.
- Grid displays "Not rated" (or "?/5") for the comp condition — now consistent with the `$0` adjustment.
- The agent can still set a comp's condition via the existing Step-3 selector to apply an adjustment deliberately.

### 5. Fallback caveat (`cma-pdf`)

When `construction_fallback` is true (log subject, site-built comps used), render a one-line note near the valuation: *"No log-home sales were available within the search area; comparables are site-built with a structure-based construction adjustment. Log valuations are most reliable when supported by log-to-log sales."*

---

## Impact (571 One Feather, recomputed)

| | Old | New |
|---|---|---|
| Construction premium / comp | ~$28-37K (10%, price-based, hidden) | ~$9.5-11.8K (5%, sqft-based, shown) |
| Condition / comp | +$40K (phantom) | $0 (unrated) |
| **Concluded value** | **$431,488** | **~$370K** |

~$370K aligns with the county median ($375K) and the same-town Whittier comp.

## Testing & Deployment

- **`crm.js`** (static site): construction basis/rate + condition default. No redeploy; ships with the site. Verifiable locally against the saved report data.
- **`cma-pdf`** (edge function): grid rows + caveat. **Requires `supabase functions deploy cma-pdf`.** Render-only; testable by regenerating the existing report.
- **`cma-engine`** (edge function): comp selection. **Requires `supabase functions deploy cma-engine`** and **live MLS data** to verify log-preference — Claude cannot run this locally; user verifies post-deploy by running a CMA on a known log subject and confirming log comps surface (or the fallback caveat appears).

## Open Questions

None blocking. Per-sqft basis uses the existing `price_per_sqft` (175); tunable later if a dedicated structure-cost rate is preferred.
