# CMA Backtest — Phase 2 measurement point 3 (post tag-backfill, CORRECTED)

**Generated:** 2026-07-15 (corrected re-run, same day as the invalidated first attempt)
**Compared against:** `docs/cma-backtest-baseline.md` (Phase 0) and `docs/cma-backtest-phase1.md` (Phase 1).
**Engine code:** Phase 1 engine **plus one fix**: the land structural-feature crash
found by the first measurement-point-3 run (see "Caveat A — RESOLVED" below) was fixed
and deployed before this run. No other engine change. The data changes since Phase 1
remain:

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
Haywood/Jackson/Macon/Swain, type `all`), same seed (1234567), run with
`--include-all-types` so sampling reproduces the v1 subject universe. This run sampled
the **exact same 160 subjects** as the Phase 0/Phase 1/first-Phase-2 raw files
(verified: 160/160 key intersection against both), and the three-way tables below are
all the `--recompute` (v2-filter) reconciliation of the three raw files against the
**same 153 clean subjects** (drop: 4 `Commercial Sale`, 3 null-coordinate). No engine
calls in recompute, so it is a true apples-to-apples reconciliation.

Raw: `scripts/output/backtest-phase2-tags-corrected-2026-07-15.json`.
(The invalidated first attempt is preserved at
`scripts/output/backtest-phase2-tags-2026-07-15.json` for forensics.)

---

## Caveat A — RESOLVED: the land structural-feature crash is fixed; land is now measurable

The first measurement-point-3 run surfaced a real, pre-existing bug in
`supabase/functions/cma-engine/index.ts`: the structural-feature adjustment block was
gated only on `subjectFeatures && compFeatures`, **not** on `!isLand`, while
`WNC_LAND_DEFAULTS` intentionally omits the residential structural rate keys. For a
land subject, `rates.outbuilding_tier_values` was `undefined`, so
`rates.outbuilding_tier_values[tier]` threw (`Cannot read properties of undefined
(reading '0')`) whenever a land subject and comp carried different
`outbuilding_value_tier` tags — HTTP 500 on 13 of 38 clean land subjects. It was
dormant through Phases 0 and 1 because land listings had no feature tags.

**Fix (deployed 2026-07-15, before this run):** per `docs/CMA-ALGORITHM.md` § "Land CMA
Differences" ("Structural features are ignored" for land), the entire structural block
(pool, basement, fireplace, covered outdoor, outbuildings) is now gated on `!isLand`,
and the structural rate keys were added to `WNC_LAND_DEFAULTS` as explicit zeros as
defense-in-depth. Smoke-verified against a live tagged land subject with a differing
outbuilding tier (the exact former crash path): HTTP 200, valuation produced, no
structural adjustments in the response.

**Consequence:** this run had **zero** engine crashes (160/160 subjects processed; 2
non-crash skips: 1 `no_valuation`, 1 `insufficient_comps`, both Swain). The **land
segment is now honestly measured for the first time with tags active.** The land rows
in the first attempt's report (24 crash-survivors) were a biased subsample and are
superseded by this document.

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
comps, all-comps-excluded, or no valuation). Bias positive = engine overvalues.
`Med. gross` = median comp gross-adjustment % (comparability quality / guardrail
pressure). Time-travel leaks: **0**.

### Overall

| Metric | Baseline | Phase 1 | Phase 2 (tags, corrected) |
|---|---|---|---|
| N valued | 153 | 148 | **152** |
| MdAPE | 20.6% | 20.5% | 21.9% |
| PPE10 | 23.5% | 20.9% | 23.0% |
| PPE20 | 49.0% | 48.0% | 45.4% |
| Bias | +14.9% | +15.8% | +19.0% |
| Med. gross adj | 21.5% | 22.4% | **55.1%** |

(N valued recovered from the crash-depressed 139 of the invalidated first attempt to
152 — the engine now values essentially the whole clean sample again.)

### By county — MdAPE / PPE10 / PPE20 / Bias / Med.gross (base → P1 → P2)

| County | N (b→P1→P2) | MdAPE | PPE10 | PPE20 | Bias | Med.gross |
|---|---|---|---|---|---|---|
| Haywood | 39→38→39 | 19.7 → 20.0 → 23.9 | 23.1 → 18.4 → 15.4 | 51.3 → 50.0 → 35.9 | +4.4 → +6.0 → +10.3 | 21.5 → 22.0 → 54.3 |
| Jackson | 38→37→38 | 28.9 → 25.0 → 26.8 | 23.7 → 8.1 → 21.1 | 42.1 → 29.7 → 39.5 | +22.8 → +28.1 → +29.7 | 19.7 → 25.1 → 53.9 |
| Macon | 38→37→38 | 19.5 → 16.8 → 17.7 | 23.7 → 29.7 → 34.2 | 50.0 → 56.8 → 55.3 | +17.0 → +18.5 → +29.1 | 28.3 → 21.6 → 56.7 |
| Swain | 38→36→37 | 19.6 → 17.7 → 19.0 | 23.7 → 27.8 → 21.6 | 52.6 → 55.6 → 51.4 | +15.5 → +10.8 → +6.7 | 20.8 → 22.2 → 55.9 |

### By property type

| Type | N (b→P1→P2) | MdAPE | PPE10 | PPE20 | Bias | Med.gross |
|---|---|---|---|---|---|---|
| residential | 115→112→115 | 17.7 → 18.1 → 18.1 | 28.7 → 25.0 → 27.8 | 57.4 → 56.3 → 53.0 | +11.3 → +12.1 → +11.4 | 21.4 → 22.1 → 49.1 |
| land | 38→36→37 | 43.3 → 35.6 → **43.6** | 7.9 → 8.3 → 8.1 | 23.7 → 22.2 → 21.6 | +25.7 → +27.4 → **+42.5** | 22.6 → 26.3 → **105.0** |

**Land is measured honestly for the first time with tags active** (37 of 38 clean land
subjects valued; the one skip is a `no_valuation`, not a crash). The residential row is
**identical** to the invalidated first attempt (the fix touches only land subjects), a
useful consistency check.

### By price band

| Band | N (b→P1→P2) | MdAPE | PPE10 | PPE20 | Bias | Med.gross |
|---|---|---|---|---|---|---|
| <$300K | 84→81→83 | 31.2 → 24.4 → 28.4 | 14.3 → 14.8 → 16.9 | 33.3 → 32.1 → 32.5 | +25.3 → +24.4 → +27.4 | 22.9 → 24.6 → 69.8 |
| $300–600K | 56→54→56 | 12.7 → 16.2 → 14.2 | 35.7 → 31.5 → 33.9 | 69.6 → 66.7 → 64.3 | +5.7 → +7.8 → +10.9 | 20.4 → 21.4 → 44.5 |
| >$600K | 13→13→13 | 17.7 → 16.5 → 21.1 | 30.8 → 15.4 → 15.4 | 61.5 → 69.2 → 46.2 | −13.5 → −4.2 → −0.2 | 16.9 → 20.4 → 31.4 |

---

## Interpretation — did feature adjustments help, hurt, or wash?

**Residential: wash.** MdAPE is dead flat (17.7% → 18.1% → 18.1%), PPE10 recovered its
Phase-1 dip (28.7% → 25.0% → 27.8%), bias unchanged. Feature coverage neither helped nor
hurt the segment that already worked.

**Land: the corrected measurement is worse than the crash-biased one suggested — tags
actively hurt land.** With all 37 land subjects now valued, land MdAPE is 43.6%: tags
erased the entire Phase-1 improvement (43.3% → 35.6% → 43.6%) and land bias exploded to
**+42.5%** (from +27.4%). Median land gross adjustment is **105%** — the flat-dollar
mountain rates ($20K/view point, $15K/water point on land) are routinely **larger than
the parcel's whole value** at land price points, so adjustments overwhelm the comps,
trip the 35% gross-adjustment guardrail, thin the usable comp set, and push valuations
up. (The invalidated first run's 24 crash-survivors had read slightly *less* bad —
42.3% MdAPE, +44.2% bias — but that subsample excluded every subject whose comps
carried a differing outbuilding tier, so it was not representative.)

**Overall headline: slight net negative, driven entirely by land.** MdAPE 20.6% →
20.5% → 21.9%, PPE20 49.0% → 45.4%, bias +14.9% → +19.0%. The first attempt's
"PPE10 best-of-three" reading (25.2%) does **not** survive the correction — corrected
overall PPE10 is 23.0%, marginally below baseline. Segments the first attempt described
as recovering (Jackson PPE10 "24.2%") land lower once the crashed land subjects rejoin
the denominator (21.1%), though Jackson's MdAPE improvement over baseline is real
(28.9% → 26.8%).

**The unambiguous, dominant effect remains the gross-adjustment explosion.** Median
comp gross adjustment jumped 21.5% → 55.1% overall (residential 49%, land 105%). The
mechanism works exactly as designed — dormant view/water/condition/structural
adjustments now fire — but it confirms **finding F4** decisively: the flat-dollar
mountain rates are a modest % of a $500K home but an enormous % of a $150K cabin or a
$60K parcel. Haywood, with the densest tag coverage, regressed most (MdAPE 19.7% →
23.9%, PPE20 51.3% → 35.9%).

**Paired-sales calibration activated but was not a needle-mover** (Caveat B): shrunk
toward defaults, its effect is small next to "adjustments fire at all."

### Verdict

Tag coverage is a **prerequisite that is now in place**, and with the land crash fixed
the whole 153-subject gate is measurable again (152 valued). But un-scaled flat-dollar
feature adjustments are a clear net negative for land and a wash for residential. The
measurement points directly at the remaining Phase 2 work: **(1)** ~~fix the land
structural-block crash~~ — **done, this run**; **(2)** implement percentage-based
scaling for view/water/privacy/condition (F4) so feature adjustments stop overwhelming
cheap-property and land valuations and tripping the 35% guardrail — land's 105% median
gross adjustment makes this the single highest-leverage change; **(3)** submarket
tagging (F5) for Jackson. Do not ship feature-adjustment-driven land CMAs to the CRM as
an accuracy improvement until F4 lands; the crash fix restores availability, not
accuracy.

---
_Raw per-subject results: `scripts/output/backtest-phase2-tags-corrected-2026-07-15.json`
(invalidated first attempt: `scripts/output/backtest-phase2-tags-2026-07-15.json`).
Baseline raw: `scripts/output/backtest-2026-07-15.json`. Phase 1 raw:
`scripts/output/backtest-phase1-2026-07-14.json`._
