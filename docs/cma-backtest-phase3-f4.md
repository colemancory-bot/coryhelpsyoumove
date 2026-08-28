# CMA Backtest — Phase 3 measurement point (F4: percentage-based mountain adjustments)

**Generated:** 2026-07-15
**Compared against:** `docs/cma-backtest-baseline.md` (Phase 0), `docs/cma-backtest-phase1.md`
(Phase 1), and `docs/cma-backtest-phase2-tags.md` (Phase 2, tags active, corrected run).
**Engine code:** Phase 2 engine plus **finding F4** (`docs/cma-accuracy-plan.md`): the
per-point mountain adjustments (view, water, land usability, road noise, privacy,
condition) were converted from flat dollars to a **percent of the comp's effective sale
price**, deployed 2026-07-15 before this run. No data changes since the Phase 2 run
beyond normal daily MLS sync drift.

What changed in the engine (see `docs/CMA-ALGORITHM.md` § Mountain Feature Adjustments):

1. `WNC_DEFAULTS`: `*_per_point` dollar keys replaced by `*_pct_per_point`, calibrated
   to reproduce the old dollars at the ~$450K residential median (view 5.5%/pt, water
   4.4%, condition 4.4%, land usability 1.8%, road noise 1.5%, privacy 1.3%). Behavior
   at the median is unchanged; away from it the premium now scales with the comp.
2. `WNC_LAND_DEFAULTS`: steeper land percentages derived from
   `docs/land-cma-research.md` premium ranges (view 10%/pt, land usability 9%, water
   8%, road noise 6%, privacy 4%).
3. Elevation stays flat $/100ft (not price-proportional the same way).
4. Basis guard: comps with no usable price skip these adjustments with a MISSING DATA
   warning instead of computing nonsense.
5. Paired-sales calibration converts each stored pair to percentage space at read time
   (`pct = derived_adjustment / mean(price_a, price_b)`), then applies the same n≥5 /
   median / k=5 shrinkage rules in pct space. Stored pairs unchanged.
6. `crm.js` grid recompute and the 4 slider call sites mirror the same formulas
   (slider notch = pct × comp basis).

**Method — identical to all prior runs.** Same script (`scripts/cma-backtest.mjs`),
same defaults (12 months, 40/county, Haywood/Jackson/Macon/Swain, type `all`), same
seed (1234567), run with `--include-all-types` so sampling reproduces the v1 subject
universe. This run sampled the same 160 subjects; the four-way tables below are the
`--recompute` (v2-filter) reconciliation of the four raw files against the **same 153
clean subjects** (drop: 4 `Commercial Sale`, 3 null-coordinate). Raw:
`scripts/output/backtest-phase3-f4-2026-07-15.json`.

**Run-to-run noise caveat:** an accidental duplicate of this exact run (same code,
same subjects, ~25 minutes earlier) produced overall MdAPE 22.3% vs 21.5% here — the
engine is deterministic but the DB underneath it is live (MLS syncs every 15 min, and
the market index / list-to-sale ratio queries see whatever is current). Differences
smaller than ~1 point in any cell of these tables should be read as noise.

---

## Four-way comparison (v2-clean, 153 subjects)

`N` = subjects valued. Bias positive = engine overvalues. `Med. gross` = median comp
gross-adjustment % (comparability / guardrail pressure). Time-travel leaks: **0**.

### Overall

| Metric | Baseline | Phase 1 | Phase 2 (tags) | Phase 3 (F4) |
|---|---|---|---|---|
| N valued | 153 | 148 | 152 | **152** |
| MdAPE | 20.6% | 20.5% | 21.9% | **21.5%** |
| PPE10 | 23.5% | 20.9% | 23.0% | **26.3%** |
| PPE20 | 49.0% | 48.0% | 45.4% | **46.7%** |
| Bias | +14.9% | +15.8% | +19.0% | **+14.8%** |
| Med. gross adj | 21.5% | 22.4% | 55.1% | **51.4%** |

### By county — MdAPE / PPE10 / Bias / Med.gross (base → P1 → P2 → P3)

| County | N (P3) | MdAPE | PPE10 | Bias | Med.gross |
|---|---|---|---|---|---|
| Haywood | 39 | 19.7 → 20.0 → 23.9 → 24.0 | 23.1 → 18.4 → 15.4 → 23.1 | +4.4 → +6.0 → +10.3 → +5.1 | 21.5 → 22.0 → 54.3 → 53.5 |
| Jackson | 38 | 28.9 → 25.0 → 26.8 → 26.3 | 23.7 → 8.1 → 21.1 → 23.7 | +22.8 → +28.1 → +29.7 → +25.7 | 19.7 → 25.1 → 53.9 → 52.5 |
| Macon | 38 | 19.5 → 16.8 → 17.7 → 17.8 | 23.7 → 29.7 → 34.2 → 28.9 | +17.0 → +18.5 → +29.1 → +21.3 | 28.3 → 21.6 → 56.7 → 46.5 |
| Swain | 37 | 19.6 → 17.7 → 19.0 → 19.1 | 23.7 → 27.8 → 21.6 → 29.7 | +15.5 → +10.8 → +6.7 → +7.1 | 20.8 → 22.2 → 55.9 → 51.5 |

### By property type

| Type | N (P3) | MdAPE | PPE10 | PPE20 | Bias | Med.gross |
|---|---|---|---|---|---|---|
| residential | 115 | 17.7 → 18.1 → 18.1 → **18.9** | 28.7 → 25.0 → 27.8 → **30.4** | 57.4 → 56.3 → 53.0 → 53.9 | +11.3 → +12.1 → +11.4 → **+9.8** | 21.4 → 22.1 → 49.1 → 49.1 |
| land | 37 | 43.3 → 35.6 → 43.6 → **35.7** | 7.9 → 8.3 → 8.1 → **13.5** | 23.7 → 22.2 → 21.6 → 24.3 | +25.7 → +27.4 → +42.5 → **+30.2** | 22.6 → 26.3 → 105.0 → **71.3** |

### By price band

| Band | N (P3) | MdAPE | PPE10 | Bias | Med.gross |
|---|---|---|---|---|---|
| <$300K | 83 | 31.2 → 24.4 → 28.4 → **25.9** | 14.3 → 14.8 → 16.9 → **19.3** | +25.3 → +24.4 → +27.4 → +21.1 | 22.9 → 24.6 → 69.8 → **56.1** |
| $300–600K | 56 | 12.7 → 16.2 → 14.2 → 16.4 | 35.7 → 31.5 → 33.9 → 35.7 | +5.7 → +7.8 → +10.9 → +9.9 | 20.4 → 21.4 → 44.5 → 49.0 |
| >$600K | 13 | 17.7 → 16.5 → 21.1 → 19.1 | 30.8 → 15.4 → 15.4 → 30.8 | −13.5 → −4.2 → −0.2 → −4.3 | 16.9 → 20.4 → 31.4 → 41.5 |

---

## Interpretation — did F4 do what the Phase 2 report demanded?

**Land: yes — the Phase 1 gain is recovered.** Land MdAPE went 43.3 → 35.6 → 43.6 →
**35.7**, i.e. F4 clawed back everything the flat-dollar tag explosion had erased,
while keeping the tags **active** (Phase 1's 35.6 was achieved with tags dormant).
Land PPE10 is the best of any run (13.5% vs 7.9-8.3% everywhere else), and land bias
fell from +42.5% back to +30.2%. This was the specific target of the change and it
landed almost exactly on it (35.7 vs the ≤35.6 goal; within run-to-run noise).

**Gross adjustments came down materially, but are still high.** Median land gross
went 105% → 71.3% (−34 pts) and the <$300K band 69.8% → 56.1%. Residential stayed at
49.1% — expected, because the residential percentages were calibrated to reproduce the
old dollars at the median, so the typical residential comp's adjustments barely moved;
the reduction concentrates exactly where the flat rates were most disproportionate
(cheap properties and land). But 51% overall median gross is still far above the
21-26% of the pre-tag era and above the 25%/35% guardrails on many comps. F4 fixed
the *scaling* of the qualitative premiums; the sheer *number* of firing adjustment
categories (plus rating noise from remarks-only extraction, F8) keeps gross high.

**Overall: modest net positive, and the best PPE10 of any measurement point.**
Overall PPE10 26.3% (best of four), bias +14.8% (best of four, back below baseline),
MdAPE 21.5% (better than Phase 2's 21.9%, still ~1pt above baseline). The one real
cost: residential MdAPE ticked up 18.1 → 18.9 (with PPE10 *improving* to a
best-of-four 30.4 and bias improving to +9.8 — the distribution tightened around the
truth but its median error widened slightly). At ~115 subjects that is within noise
(see the caveat above) but worth watching in the next run.

**Honest bottom line:** F4 did exactly what it was scoped to do — stop flat-dollar
qualitative premiums from overwhelming cheap-property and land valuations — and land
accuracy is back to its best measured level *with feature adjustments live*. It did
NOT make the tool accurate: land MdAPE ~36% and a +30% land bias are still poor in
absolute terms, overall MdAPE is still ~21%, and the <$300K band is still the weak
spot. The remaining Phase 2+ levers are unchanged: submarket awareness (F5, Jackson's
+26% bias is the standing argument), rural driver adjustments already extracted but
unused (F3), and ground-truth feature ratings (F8) to cut the rating noise that both
inflates gross adjustments and randomizes their sign.

---
_Raw per-subject results: `scripts/output/backtest-phase3-f4-2026-07-15.json`.
Phase 2 raw: `scripts/output/backtest-phase2-tags-corrected-2026-07-15.json`.
Phase 1 raw: `scripts/output/backtest-phase1-2026-07-14.json`.
Baseline raw: `scripts/output/backtest-2026-07-15.json`._
