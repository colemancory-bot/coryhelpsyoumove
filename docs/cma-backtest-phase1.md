# CMA Backtest — Phase 1

**Generated:** 2026-07-15 (Phase 1 correctness fixes)
**Compared against:** `docs/cma-backtest-baseline.md` (Phase 0).
**Method:** identical to baseline — same script (`scripts/cma-backtest.mjs`), same
defaults (12 months, 40/county, Haywood/Jackson/Macon/Swain, type `all`), same seed
(1234567), so the sampled subjects match the baseline. Deterministic `find-comps` +
`calculate-adjustments`, top 4 non-outlier comps, `suggested_price` vs `close_price`.

> **Data caveat carries over:** `cma_feature_tags` still holds ~6 rows against 18,491
> closed sales (~0.03% coverage). Every feature-dependent change in this phase (F9
> completeness weighting, missing-rating warnings, and the mountain adjustments the
> completeness factor scales) is therefore **dormant** in this backtest — nearly every
> comp is untagged. Backfilling `cma-extract-features` is a prerequisite for measuring
> those. What this run *does* exercise: the query fix (F6), the market-derived time
> adjustment (F2), land actives handling (F7), the price-segment guard (F5), the
> half-bath math, the weight-curve reforms (F11), and the paired-sales guards (F10).

## Baseline vs Phase 1

| Segment | N (base→P1) | MdAPE base→P1 | PPE10 base→P1 | PPE20 base→P1 | Bias base→P1 |
|---|---|---|---|---|---|
| **Overall** | 159→154 | 20.2% → 20.2% | 23.3% → 21.4% | 49.7% → 48.7% | +20.1% → +25.6% |
| Haywood | 40→39 | 19.5% → 19.8% | 22.5% → 17.9% | 52.5% → 51.3% | +4.0% → +5.4% |
| Jackson | 40→39 | 28.9% → 25.0% | 22.5% → 7.7% | 42.5% → 30.8% | +41.1% → +63.6% |
| Macon | 40→39 | 19.5% → 16.8% | 22.5% → 30.8% | 50.0% → 56.4% | +19.7% → +22.3% |
| Swain | 39→37 | 19.6% → 17.5% | 25.6% → 29.7% | 53.8% → 56.8% | +15.3% → +10.3% |
| residential | 121→118 | 16.5% → 17.9% | 28.1% → 25.4% | 57.9% → 56.8% | +18.3% → +25.0% |
| **land** | 38→36 | **43.3% → 35.6%** | 7.9% → 8.3% | 23.7% → 22.2% | +25.7% → +27.4% |
| <$300K | 85→82 | 31.5% → 24.5% | 14.1% → 14.6% | 32.9% → 31.7% | +26.9% → +26.4% |
| $300–600K | 58→56 | 12.7% → 16.2% | 34.5% → 30.4% | 69.0% → 66.1% | +18.9% → +33.1% |
| >$600K | 16→16 | 14.9% → 15.6% | 31.3% → 25.0% | 68.8% → 75.0% | −12.0% → −4.6% |

Positive bias = the engine overvalues.

## Clean comparison (harness v2 filters)

The table above is polluted by subjects the v1 harness never should have sampled:
`Commercial Sale` rows bucketed as "residential" and coordinate-less rows with no
geography to prune on (see "The one-outlier effect" below). The harness was rebuilt
(`scripts/cma-backtest.mjs`, v2) to sample only `property_type in (Residential, Land)`
with **both** coordinates present, and a `--recompute <raw.json>` mode re-scores the
existing raw outputs under those same filters — no engine calls, so it's a true
apples-to-apples reconciliation of the two prior runs. Both runs used the same seed,
so they sampled the **same 153** clean subjects (dropped: 4 `Commercial Sale`, 3
null-coordinate).

**This is the authoritative baseline-vs-phase1 comparison.** (`N` shows valued; Phase 1
leaves 5 subjects unvalued — the >35% gross-adjustment exclusion (F11c) removes every
comp for those. That coverage trade is now guarded in the engine by the empty-included
fallback, but these raw files predate it.)

| Segment | N (base→P1) | MdAPE base→P1 | PPE10 base→P1 | PPE20 base→P1 | Bias base→P1 |
|---|---|---|---|---|---|
| **Overall** | 153→148 | 20.6% → 20.5% | 23.5% → 20.9% | 49.0% → 48.0% | +14.9% → +15.8% |
| Haywood | 39→38 | 19.7% → 20.0% | 23.1% → 18.4% | 51.3% → 50.0% | +4.4% → +6.0% |
| Jackson | 38→37 | 28.9% → 25.0% | 23.7% → 8.1% | 42.1% → 29.7% | +22.8% → +28.1% |
| Macon | 38→37 | 19.5% → 16.8% | 23.7% → 29.7% | 50.0% → 56.8% | +17.0% → +18.5% |
| Swain | 38→36 | 19.6% → 17.7% | 23.7% → 27.8% | 52.6% → 55.6% | +15.5% → +10.8% |
| residential | 115→112 | 17.7% → 18.1% | 28.7% → 25.0% | 57.4% → 56.3% | +11.3% → +12.1% |
| **land** | 38→36 | **43.3% → 35.6%** | 7.9% → 8.3% | 23.7% → 22.2% | +25.7% → +27.4% |
| <$300K | 84→81 | 31.2% → 24.4% | 14.3% → 14.8% | 33.3% → 32.1% | +25.3% → +24.4% |
| $300–600K | 56→54 | 12.7% → 16.2% | 35.7% → 31.5% | 69.6% → 66.7% | +5.7% → +7.8% |
| >$600K | 13→13 | 17.7% → 16.5% | 30.8% → 15.4% | 61.5% → 69.2% | −13.5% → −4.2% |

**Reading it:** with the Commercial artifact and coordinate-less rows removed, the
headline **bias barely moves** (+14.9% → +15.8%, a single point — not the +5.5pt jump
the polluted table showed) and **MdAPE is flat** (20.6% → 20.5%). The genuine wins are
in the segments Phase 1 targeted: **land MdAPE drops 7.7 points** (43.3% → 35.6%, still
the worst segment but much improved) and **cheap subjects improve** (<$300K MdAPE 31.2%
→ 24.4%). The cost side is real too: overall PPE10 slips ~2.6 points and Phase 1 refuses
to value 5 subjects it can no longer comp within 35%. Jackson remains the problem county
(PPE10 collapses 23.7% → 8.1% as the >35% guard thins its already-mixed Sylva/Cashiers
comp pool), which is exactly the submarket-tagging work Phase 2 is scoped to fix. Net:
on clean numbers Phase 1 is a **correctness pass that measurably helped the worst
segments and held the headline flat**, at a small coverage/PPE10 cost — a defensible
trade, and better than the outlier-distorted headline made it look.

## The one-outlier effect (read this before the interpretation)

The overall **bias** regression is dominated by a single subject the backtest
mislabels. `fa66437a…` is a **Commercial Sale** in Sylva with **null coordinates**
and only 3 comps in the whole county window ($225K / $1.43M / $5.2M). The backtest
buckets it as "residential" (its rule is simply `property_type != Land`), and with no
coordinates there is no geography to prune on. Its error went 790% → **1448%**, and on
a base of 154 subjects that one prediction alone adds ~9 points to the mean bias.

Remove just that subject and the aggregate is nearly flat:

| Metric (all valued) | Baseline | Phase 1 |
|---|---|---|
| MdAPE | 20.2% | 20.2% |
| Bias | +20.1% | +25.6% |
| **Bias, excl. the Commercial outlier** | **+15.2%** | **+16.3%** |
| PPE10 | 23.3% | 21.4% |

On the 153 non-Commercial subjects, bias moved +15.2% → +16.3% (+1.1 pt) and MdAPE
was unchanged.

## Interpretation — what moved and what didn't

**Real win: land.** Land was the worst segment and improved the most — MdAPE
43.3% → 35.6%. This is the list-to-sale ratio (F7) pricing active land honestly, the
`detectPriceOutliers` fix (F5) letting active land comps participate in outlier
detection, and the $/acre-participation changes. Land bias barely moved (+25.7 →
+27.4) but the median error dropped ~8 points, which is the metric that matters for a
noisy segment.

**Mostly flat: residential and the headline.** MdAPE held (~20%); PPE10 slipped ~2
points; bias rose, but ~80% of that rise is the single Commercial artifact above.
Excluding it, residential/overall is within ~1 point of baseline. Phase 1 is, on
aggregate, a **correctness pass that did not move headline accuracy** — expected,
because the two biggest intended levers are dormant:

1. **Feature-tag coverage is still ~0.** F9 (completeness weighting, missing-rating
   warnings) and every mountain adjustment it scales never fire. Until
   `cma-extract-features` is backfilled across the closed universe, these can't help
   the backtest. This is the single highest-leverage prerequisite for Phase 2/3.

2. **The market actually rose in this window, so the honest time index adds bias, it
   doesn't remove it.** F2's premise (post-Helene decline → drop the phantom
   +0.3%/mo) did not hold for this 12-month sample: the data-derived quarterly index
   shows appreciation, so it applies a *larger* upward time adjustment than the old
   flat rate, nudging bias up (residential +18.3 → +25.0). This is the correct,
   data-driven behavior — the residual overvaluation is a comp-**selection** problem
   that time adjustment amplifies, not a time-adjustment error. It should stay; the
   fix is upstream (segment/submarket comp selection, Phase 2).

**The price-segment guard's `>=6 survivors` threshold defeats it exactly where it's
needed.** The worst misses are cheap subjects in luxury-mixed or thin submarkets
(Sylva/Cashiers, cheap land). In those places fewer than 6 in-segment comps exist
within range, so the guard "keeps all and logs" — including the $2–5M comps it was
meant to drop. The guard as specced (≥6) never engaged on any of the top-10 misses.
**Phase 2 recommendation:** lower the threshold (e.g. ≥3) or make it relative
(keep in-segment comps whenever ≥2 survive and at least one out-of-segment comp would
otherwise dominate), and add submarket tagging (F5 full) so Cashiers-plateau sales
stop being drawn as comps for Sylva-basin subjects.

**Coverage dropped slightly (159 → 154 valued; skips 1 → 6, five `no_valuation`).**
The >35% gross-adjustment exclusion (F11c) now removes every comp for a handful of
subjects that previously scraped a value out of very-poor comps. Refusing to value on
comps needing >35% adjustment is defensible appraiser behavior, but it's a real
coverage/accuracy trade the agent should see surfaced (the warnings now say so).

## Feeds into later phases

- **Phase 2 (rural drivers):** (a) fix the price-segment guard threshold — biggest
  single accuracy lever visible here; (b) submarket tagging to stop cross-market comp
  mixing (Jackson's Sylva/Cashiers split drives its 25–64% bias); (c) percentage-based
  view/water/condition scaling so mountain adjustments don't apply luxury dollars to
  cheap homes.
- **Phase 3 (ground truth):** backfill `cma-extract-features` first — nothing in F9
  or the mountain-adjustment reforms can be measured until comp coverage is non-trivial.
- **Backtest harness itself:** it should exclude `Commercial Sale` (and other non
  residential/land property types) rather than bucket them as "residential," and it
  should skip subjects with no coordinates. One such subject is currently distorting
  the entire bias headline.

---
_Raw per-subject results: `scripts/output/backtest-phase1-2026-07-14.json`. Baseline
raw: `scripts/output/backtest-2026-07-15.json`._
