# CMA Backtest Baseline

**Generated:** 2026-07-15T00:05:20.945Z
**Phase:** 0 (finding F1 of `docs/cma-accuracy-plan.md`) — this is the regression gate. Re-run after every accuracy change and compare.

## Method

- **Subjects:** closed sales (`close_price > 0`) in the trailing **12 months**, counties: Haywood, Jackson, Macon, Swain, type filter: `all`.
- **Sampling:** up to **40 per county**, stratified to preserve the land/residential mix present in the window. Deterministic (seed 1234567), reproducible.
- **As-of date:** each subject is valued as if today were its `close_date − 45 days` (appraiser convention approximating the contract/price-agreement date). The engine's new `as_of_date` time-travel parameter enforces that only comps closed on or before that date are used.
- **Comps:** `find-comps` with `{ limit: 8 }`, then the top **4** non-price-outlier comps (fewer if unavailable; subject skipped as *insufficient comps* if < 2).
- **Engine:** deterministic `find-comps` scoring + `calculate-adjustments`. We deliberately do **NOT** use `auto-select-comps` (it calls Claude — slow, costly, non-deterministic), so this baseline is stable and repeatable.
- **Prediction:** `valuation.suggested_price`; **actual:** `close_price`; **error%** = (predicted − actual) / actual.

## ⚠ Data caveat: feature-tag coverage is effectively zero

`cma_feature_tags` (agent_id IS NULL) currently holds **6 rows** against **18,491** closed sales with a price (~0.032% coverage). That means the engine's mountain/feature adjustments (view, water, condition, land usability, privacy, road noise, elevation, construction) are **almost never exercised** in this baseline — nearly every subject and comp is valued on size, lot, age, and time only. This directly quantifies finding **F9** ("ensure feature extraction backfill has actually covered the comp universe"). Because requiring a tag per subject would yield ~0 subjects, this run uses `--require-tags false`. Backfilling `cma-extract-features` across the closed universe is a prerequisite for measuring any feature-adjustment change.

## Headline

| Segment | N valued | N skipped | MdAPE | PPE10 | PPE20 | Bias | Med. gross adj |
|---|---|---|---|---|---|---|---|
| **Overall** | 159 | 1 | 20.2% | 23.3% | 49.7% | 20.1% | 21.4% |

- **MdAPE** = median absolute % error. **PPE10 / PPE20** = share of predictions within 10% / 20% of actual. **Bias** = mean signed error (positive = engine overvalues). **Med. gross adj** = median of the comps' gross-adjustment % (comparability quality).
- Industry context (F1): rural PPE10 for national AVMs (Zillow/Redfin) runs ~50–60%.

## By county

| Segment | N valued | N skipped | MdAPE | PPE10 | PPE20 | Bias | Med. gross adj |
|---|---|---|---|---|---|---|---|
| Haywood | 40 | 0 | 19.5% | 22.5% | 52.5% | 4.0% | 21.4% |
| Jackson | 40 | 0 | 28.9% | 22.5% | 42.5% | 41.1% | 19.7% |
| Macon | 40 | 0 | 19.5% | 22.5% | 50.0% | 19.7% | 28.3% |
| Swain | 39 | 1 | 19.6% | 25.6% | 53.8% | 15.3% | 20.9% |

## By property type

| Segment | N valued | N skipped | MdAPE | PPE10 | PPE20 | Bias | Med. gross adj |
|---|---|---|---|---|---|---|---|
| residential | 121 | 1 | 16.5% | 28.1% | 57.9% | 18.3% | 20.9% |
| land | 38 | 0 | 43.3% | 7.9% | 23.7% | 25.7% | 22.6% |

## By price band

| Segment | N valued | N skipped | MdAPE | PPE10 | PPE20 | Bias | Med. gross adj |
|---|---|---|---|---|---|---|---|
| <$300K | 85 | 0 | 31.5% | 14.1% | 32.9% | 26.9% | 22.9% |
| $300–600K | 58 | 0 | 12.7% | 34.5% | 69.0% | 18.9% | 20.4% |
| >$600K | 16 | 1 | 14.9% | 31.3% | 68.8% | -12.0% | 16.8% |

## Skips

Total subjects attempted: **160**. Valued: **159**. Skipped: **1**.

| Reason | Count |
|---|---|
| insufficient_comps | 1 |

Comps that closed after the as-of date (time-travel leaks; should be 0): **0**.

## Worst 10 misses (address-free)

| listing_key | county | type | predicted | actual | error % |
|---|---|---|---|---|---|
| fa66437a00583550d635b5fc52c9f140 | Jackson | residential | $2,984,151 | $335,000 | 790.8% |
| e37c6daba999924b89468f2a0989a50d | Macon | land | $25,880 | $5,000 | 417.6% |
| 7a09fc76a705b9aa09a7d7525b16e553 | Jackson | land | $46,554 | $14,000 | 232.5% |
| 39bd3c836da1d7af8f9f9b0fbac0b2d7 | Swain | land | $101,667 | $32,500 | 212.8% |
| CAR118078491 | Jackson | residential | $367,920 | $125,000 | 194.3% |
| 3ff25c5370a11f9ba5042716889dd4a6 | Swain | land | $76,085 | $29,500 | 157.9% |
| 4483b699c256369c594eaf54a41db807 | Macon | residential | $337,832 | $132,000 | 155.9% |
| 04a2518b9dab71fe3fa9d01014c89cc8 | Jackson | land | $50,859 | $25,000 | 103.4% |
| 4ef9c03581f47d26b6d3949a4930afaf | Jackson | residential | $222,389 | $114,000 | 95.1% |
| 23b0cd1e37d754ba4448831705610077 | Swain | land | $87,754 | $45,000 | 95.0% |

---
_Raw per-subject results: `scripts/output/backtest-2026-07-15.json`._
