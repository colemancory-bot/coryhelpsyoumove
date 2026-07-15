# CMA Backtest — Phase 2 measurement point 3 (post tag-backfill)

**Generated:** 2026-07-15
**Compared against:** `docs/cma-backtest-baseline.md` (Phase 0) and `docs/cma-backtest-phase1.md` (Phase 1).
**Engine code:** unchanged from Phase 1 (cma-engine was **not** redeployed). The only
things that changed since the Phase 1 run are **data**:

1. **Feature-tag coverage went from ~6 rows to 4,820** (`cma_feature_tags`, agent_id
   IS NULL), after the `cma-extract-features` batch backfill and the dedup fix
   (migration `20260715000001`). Coverage of the closed universe is now ~26%
   (4,820 / 18,493), and much higher within the trailing-12-month comp window the
   backtest actually draws from. So the mountain/structural feature adjustments and
   the F9 completeness weighting — **dormant in Phases 0 and 1** — now fire.
2. **Paired-sales calibration was generated** (`generate-paired-sales`, 200 pairs per
   county) and **activated** — see caveat B.

**Method — identical to the baseline and Phase 1 runs.** Same script
(`scripts/cma-backtest.mjs`), same defaults (12 months, 40/county,
Haywood/Jackson/Macon/Swain, type `all`), same seed (1234567). This run sampled the
**exact same 160 subjects** as the Phase 0/Phase 1 raw files (verified: 160/160 key
intersection), and the three-way tables below are all the `--recompute` (v2-filter)
reconciliation of the three raw files against the **same 153 clean subjects** (drop: 4
`Commercial Sale`, 3 null-coordinate). No engine calls in recompute, so it is a true
apples-to-apples reconciliation.

Raw: `scripts/output/backtest-phase2-tags-2026-07-15.json`.

---

## ⚠ Caveat A (must read): a latent cma-engine crash makes the LAND segment unmeasurable this run

Turning on tag coverage surfaced a real, pre-existing bug in
`supabase/functions/cma-engine/index.ts`. **13 of the 38 clean land subjects now return
HTTP 500** from `calculate-adjustments` (`Cannot read properties of undefined (reading
'0')`).

**Root cause:** the structural-feature block (`index.ts:876`) is gated only on
`subjectFeatures && compFeatures`, **not** on `!isLand`. `WNC_LAND_DEFAULTS`
(`index.ts:471`) omits the residential structural rate keys, so for a land subject
`rates.outbuilding_tier_values` is `undefined`, and `index.ts:938`
(`rates.outbuilding_tier_values[subOutbldg]`) dereferences `undefined[0]` whenever a
land subject and comp carry different `outbuilding_value_tier` values. It never fired
before because land listings had no feature tags, so the block was skipped. (The same
block also silently produces `NaN` pool/basement/fireplace adjustments for land via the
other missing keys — masked until now for the same reason.)

**Consequence for this report:** the **land** rows below are **not trustworthy** —
land dropped from 36 valued (Phase 1) to 24, and the 24 survivors are a biased
subsample (only land subjects whose outbuilding tier happened to match their comps'
avoided the crash). **Residential is unaffected** (`WNC_DEFAULTS` has all the keys), so
the residential and overall-residential-driven numbers are sound.

**Fix (one-liner, for the Phase 2 code pass — not deployed here):** gate the structural
block on `!isLand`, or guard the array (`(rates.outbuilding_tier_values || [])[...]`),
or add the structural keys to `WNC_LAND_DEFAULTS`. Then re-run to measure land honestly.
Do **not** measure the land segment off this run.

## Caveat B: paired-sales calibration DID activate

`generate-paired-sales` was run for all four counties (200 pairs each; Haywood needed a
retry past a statement timeout). `calculate-adjustments` uses a county's paired rate for
a category only when **≥5 high-confidence pairs** exist, shrinking the derived median
toward the WNC default with `rate = (n·median + 5·default)/(n+5)`. High-confidence pair
counts (a pair is "high" only when the two sales' living-area ratio > 0.9, so land pairs
never qualify):

| County | view | water | land_usability | road_noise | privacy | condition |
|---|---|---|---|---|---|---|
| Haywood | 14 ✓ | 23 ✓ | 8 ✓ | 1 | 3 | 0 |
| Jackson | 19 ✓ | 15 ✓ | 7 ✓ | 3 | 5 ✓ | 0 |
| Macon | 18 ✓ | 17 ✓ | 8 ✓ | 0 | 4 | 0 |
| Swain | 8 ✓ | 5 ✓ | 12 ✓ | 2 | 1 | 0 |

So **view / water / land_usability paired rates were live in every county**, and
**privacy** in Jackson. `road_noise`, `condition`, and (everywhere) land pairs stayed on
the WNC defaults. Because the rates are shrunk toward the defaults (k=5) and the derived
medians landed close to them, the paired rates' marginal effect on the numbers is small;
the dominant change this run is simply that feature adjustments **fire at all**.
Note the paired pairs are drawn from present-day sales (no as-of cutoff), a mild
anachronism a backtest should eventually correct, but it matches live engine behavior.

---

## Three-way comparison (v2-clean, 153 subjects)

`N` = subjects **valued** (of the 153 clean subjects; the rest skipped — insufficient
comps, all-comps-excluded, or the Caveat-A crash). Bias positive = engine overvalues.
`Med. gross` = median comp gross-adjustment % (comparability quality / guardrail
pressure).

### Overall

| Metric | Baseline | Phase 1 | Phase 2 (tags) |
|---|---|---|---|
| N valued | 153 | 148 | 139 |
| MdAPE | 20.6% | 20.5% | 21.1% |
| PPE10 | 23.5% | 20.9% | **25.2%** |
| PPE20 | 49.0% | 48.0% | 48.2% |
| Bias | +14.9% | +15.8% | +17.1% |
| Med. gross adj | 21.5% | 22.4% | **53.5%** |

### By county — MdAPE / PPE10 / PPE20 / Bias / Med.gross (base → P1 → P2)

| County | N (b→P1→P2) | MdAPE | PPE10 | PPE20 | Bias | Med.gross |
|---|---|---|---|---|---|---|
| Haywood | 39→38→36 | 19.7 → 20.0 → 23.9 | 23.1 → 18.4 → 16.7 | 51.3 → 50.0 → 36.1 | +4.4 → +6.0 → +12.5 | 21.5 → 22.0 → 53.5 |
| Jackson | 38→37→33 | 28.9 → 25.0 → 23.5 | 23.7 → 8.1 → 24.2 | 42.1 → 29.7 → 42.4 | +22.8 → +28.1 → +22.8 | 19.7 → 25.1 → 50.2 |
| Macon | 38→37→36 | 19.5 → 16.8 → 16.8 | 23.7 → 29.7 → 36.1 | 50.0 → 56.8 → 58.3 | +17.0 → +18.5 → +27.7 | 28.3 → 21.6 → 52.6 |
| Swain | 38→36→34 | 19.6 → 17.7 → 18.3 | 23.7 → 27.8 → 23.5 | 52.6 → 55.6 → 55.9 | +15.5 → +10.8 → +5.1 | 20.8 → 22.2 → 53.6 |

### By property type

| Type | N (b→P1→P2) | MdAPE | PPE10 | PPE20 | Bias | Med.gross |
|---|---|---|---|---|---|---|
| residential | 115→112→115 | 17.7 → 18.1 → 18.1 | 28.7 → 25.0 → 27.8 | 57.4 → 56.3 → 53.0 | +11.3 → +12.1 → +11.4 | 21.4 → 22.1 → 49.1 |
| land ⚠ | 38→36→24 | 43.3 → 35.6 → 42.3 | 7.9 → 8.3 → 12.5 | 23.7 → 22.2 → 25.0 | +25.7 → +27.4 → +44.2 | 22.6 → 26.3 → 126.8 |

⚠ **land is invalid this run** — Caveat A. 13 of 38 land subjects crashed; the 24
survivors are a biased subsample. Do not draw conclusions from the land row.

### By price band

| Band | N (b→P1→P2) | MdAPE | PPE10 | PPE20 | Bias | Med.gross |
|---|---|---|---|---|---|---|
| <$300K | 84→81→71 | 31.2 → 24.4 → 27.8 | 14.3 → 14.8 → 19.7 | 33.3 → 32.1 → 35.2 | +25.3 → +24.4 → +25.7 | 22.9 → 24.6 → 64.0 |
| $300–600K | 56→54→55 | 12.7 → 16.2 → 14.0 | 35.7 → 31.5 → 34.5 | 69.6 → 66.7 → 65.5 | +5.7 → +7.8 → +10.0 | 20.4 → 21.4 → 45.1 |
| >$600K | 13→13→13 | 17.7 → 16.5 → 21.1 | 30.8 → 15.4 → 15.4 | 61.5 → 69.2 → 46.2 | −13.5 → −4.2 → −0.2 | 16.9 → 20.4 → 31.4 |

(The <$300K band's N drop is mostly the crashed cheap-land subjects — Caveat A — so read
its shift cautiously too.)

---

## Interpretation — did feature adjustments help, hurt, or wash?

**Wash on headline accuracy; the tags fired but did not move the number.** Overall MdAPE
is flat-to-slightly-worse (20.6% → 20.5% → 21.1%) and residential MdAPE is dead flat
(17.7% → 18.1% → 18.1%). Bias drifted up marginally (+14.9% → +17.1%). The hoped-for
accuracy jump from finally having feature data did **not** materialize on the median.

**The one genuine positive is PPE10 in the weak segments.** Overall PPE10 is the best of
the three runs (23.5% → 25.2%), and the segments Phase 1 hurt most recovered: Jackson
PPE10 rebounded from its Phase-1 collapse (23.7% → 8.1% → 24.2%) and its MdAPE kept
falling (28.9% → 25.0% → 23.5%); Macon PPE10 climbed (23.7% → 29.7% → 36.1%); the
<$300K band's PPE10 improved (14.3% → 14.8% → 19.7%). So feature coverage tightened the
cluster of near-misses even though it didn't move the median error.

**The unambiguous, dominant effect is a doubling of gross adjustments.** Median comp
gross adjustment jumped 21.5% → 53.5% overall (residential 49%, and land 127%). This is
the mechanism working exactly as designed — dormant view/water/condition/structural
adjustments now fire — but it is a **double-edged result**:

- It confirms **finding F4** in the raw. The flat-dollar mountain rates ($20–25K/view
  point, $15–20K/water point, $20K/condition point) are a modest % of a $500K home but
  an enormous % of a $150K cabin or a $30K land parcel. On cheap properties they blow
  straight past the 35% gross-adjustment guardrail, which then **excludes those comps**
  from the weighted mean. That is why Haywood's PPE20 fell (51.3% → 36.1%) and coverage
  thinned. The adjustments are directionally right but **not scaled** — percentage-based
  scaling (F4) is the indicated next step before feature coverage can convert into
  accuracy rather than gross-adjustment inflation.
- Haywood specifically regressed (MdAPE 19.7% → 23.9%, PPE10 23.1% → 16.7%): it had the
  most feature-tagged comps and the highest paired-rate activation, so it absorbed the
  most of this un-scaled gross-adjustment pressure.

**Paired-sales calibration activated but was not a needle-mover** (Caveat B): shrunk
toward defaults, its effect is small next to "adjustments fire at all."

**Land is unmeasured** (Caveat A) — the engine crash must be fixed before Phase 2 can
score the segment that most needs it.

### Verdict

Tag coverage is a **prerequisite that is now in place**, but on its own it **washed** on
headline accuracy and **modestly helped PPE10** in the weak counties/price bands, at a
real coverage cost driven by un-scaled adjustment magnitudes. The measurement points
directly at the Phase 2 work: **(1)** fix the land structural-block crash; **(2)**
implement percentage-based scaling for view/water/privacy/condition (F4) so feature
adjustments stop overwhelming cheap-property valuations and tripping the 35% guardrail;
**(3)** submarket tagging (F5) for Jackson. Feature coverage did not hurt residential and
tightened the near-miss cluster — a fair foundation — but it is not, by itself, the
accuracy win; the adjustment **scaling** is.

---
_Raw per-subject results: `scripts/output/backtest-phase2-tags-2026-07-15.json`.
Baseline raw: `scripts/output/backtest-2026-07-15.json`. Phase 1 raw:
`scripts/output/backtest-phase1-2026-07-14.json`._
