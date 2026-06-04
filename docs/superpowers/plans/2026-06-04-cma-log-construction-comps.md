# CMA Log-Home Comp & Construction-Adjustment Fixes — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix the CMA tool so a log-home subject is comped log-to-log first, the construction premium is a small structure-based (sqft) adjustment instead of a hidden 10%-of-price bump, unrated comps stop getting a phantom $40K condition adjustment, and every adjustment is visible on the report grid.

**Architecture:** Three deployables. `crm.js` (browser, ships with the static site) owns the per-comp adjustment math (construction + condition). `cma-engine` (Deno edge fn) owns comp *selection*. `cma-pdf` (Deno edge fn) renders the report grid. Changes are surgical edits to existing functions plus one new module-level helper in the engine.

**Tech Stack:** Vanilla browser JS (`crm.js`), Deno/TypeScript edge functions (Supabase), Node 24 (for the verification script). No test framework exists; Deno is not installed locally, so engine/PDF changes are verified by code review + a post-deploy acceptance checklist (Task 6). Deterministic math (Tasks 1-2) is verified by a runnable Node script (Task 3).

**Spec:** `docs/superpowers/specs/2026-06-04-cma-log-construction-comps-design.md`

---

## File Structure

| File | Change |
|---|---|
| `crm.js` | Construction adjustment → 5% on sqft basis (const + 2 functions); condition default `\|\| 3` → `\|\| 0` (3 sites) |
| `supabase/functions/cma-pdf/index.ts` | Add Construction + Elevation grid rows; add log-fallback caveat |
| `supabase/functions/cma-engine/index.ts` | Lift `resolveConstruction` to module scope; log-preferred candidate pooling + 40mi radius for log subjects; return `log_comp_count`/`construction_fallback` |
| `scripts/verify-cma-adjustments.mjs` | NEW — Node golden-number check for the construction + condition math |

---

## Task 1: Construction adjustment → 5% on square-footage basis (`crm.js`)

**Files:**
- Modify: `crm.js:1788` (rate), `crm.js:1839-1851` (slider recalc), `crm.js:1982-1989` (`cmaInitConstructionAdj`)

- [ ] **Step 1: Change the log rate from 10% to 5%**

Find at `crm.js:1786-1788`:
```js
  // Construction type: % of improvement value (sale price minus estimated lot value)
  // Positive = premium over site-built, negative = discount
  construction_pct: { site_built: 0, manufactured: -0.25, modular: -0.10, log: 0.10, mobile_home: -0.35, unknown: 0 }
```
Replace with:
```js
  // Construction type: % of STRUCTURE value (living area x price_per_sqft), NOT price.
  // Basing it on price double-counts land (a cabin on 15ac vs a house on 0.5ac).
  // Positive = premium over site-built, negative = discount.
  construction_pct: { site_built: 0, manufactured: -0.25, modular: -0.10, log: 0.05, mobile_home: -0.35, unknown: 0 }
```

- [ ] **Step 2: Rebase the slider-recalc construction case on sqft**

Find at `crm.js:1839-1852`:
```js
    case 'adj_construction_type': {
      var subCT = sf.construction_type || 'site_built';
      var compCT = cmaGetCompVal(ci, 'construction_type') || 'site_built';
      if (subCT === compCT) return 0;
      // % of improvement value (sale price minus estimated lot value)
      var c = _cmaState.selectedComps[ci];
      var compPrice = c.listing.close_price || c.listing.list_price || 0;
      var compLot = cmaGetCompVal(ci, 'lot_size_acres') || c.listing.lot_size_acres || 0;
      var lotVal = cmaCalcLotValue(compLot);
      var improvementVal = Math.max(compPrice - lotVal, compPrice * 0.3); // floor at 30% of price
      var subPct = r.construction_pct[subCT] || 0;
      var compPct = r.construction_pct[compCT] || 0;
      return Math.round(improvementVal * (subPct - compPct));
    }
```
Replace with:
```js
    case 'adj_construction_type': {
      var subCT = sf.construction_type || 'site_built';
      var compCT = cmaGetCompVal(ci, 'construction_type') || 'site_built';
      if (subCT === compCT) return 0;
      // Structure-based: premium attaches to the building (living area), never to land.
      var compSqft = cmaGetCompVal(ci, 'living_area') || _cmaState.selectedComps[ci].listing.living_area || 0;
      if (!compSqft) return 0; // no sqft -> can't size a structure premium
      var structureVal = compSqft * r.price_per_sqft;
      var subPct = r.construction_pct[subCT] || 0;
      var compPct = r.construction_pct[compCT] || 0;
      return Math.round(structureVal * (subPct - compPct));
    }
```

- [ ] **Step 3: Rebase `cmaInitConstructionAdj` on sqft**

Find at `crm.js:1982-1989`:
```js
    var adj = 0;
    if (subCT !== compCT) {
      var compPrice = c.listing.close_price || c.listing.list_price || 0;
      var compLot = c.listing.lot_size_acres || 0;
      var lotVal = cmaCalcLotValue(compLot);
      var improvementVal = Math.max(compPrice - lotVal, compPrice * 0.3);
      adj = Math.round(improvementVal * ((cp[subCT] || 0) - (cp[compCT] || 0)));
    }
```
Replace with:
```js
    var adj = 0;
    if (subCT !== compCT) {
      // Structure-based: premium attaches to living area, never to land/price.
      var compSqft = c.listing.living_area || 0;
      if (compSqft) {
        var structureVal = compSqft * CMA_RATES.price_per_sqft;
        adj = Math.round(structureVal * ((cp[subCT] || 0) - (cp[compCT] || 0)));
      }
    }
```

- [ ] **Step 4: Verify (deferred to Task 3's script — no standalone run here)**

These are browser functions; their math is asserted by `scripts/verify-cma-adjustments.mjs` in Task 3.

- [ ] **Step 5: Commit**
```bash
git add crm.js
git commit -m "fix(cma): base log construction premium on sqft, drop 10% -> 5%"
```

---

## Task 2: Remove the phantom condition default (`crm.js`)

**Files:**
- Modify: `crm.js:3329`, `crm.js:3572`, `crm.js:4371`

Unrated comps currently default to condition `3` ("Fair") against a high-rated subject, auto-creating a large condition adjustment while the grid shows the comp as unrated. The condition dropdown already has `0: 'Unknown'`, and `cmaInitConditionAdj` guards `if (!compCond) return;`, so defaulting to `0` yields no adjustment and a correct "Unknown" display.

- [ ] **Step 1: Fix the init default**

Find at `crm.js:3329`:
```js
    _cmaState.compConditions[i] = cf.condition_rating || 3; // Default to 3 (Fair for Age)
```
Replace with:
```js
    _cmaState.compConditions[i] = cf.condition_rating || 0; // Unrated -> "Unknown", no condition adj until the agent rates it
```

- [ ] **Step 2: Fix the render-time fallback**

Find at `crm.js:3572`:
```js
    var compCond = (_cmaState.compConditions && _cmaState.compConditions[ci] != null) ? _cmaState.compConditions[ci] : (cf.condition_rating || 3);
```
Replace with:
```js
    var compCond = (_cmaState.compConditions && _cmaState.compConditions[ci] != null) ? _cmaState.compConditions[ci] : (cf.condition_rating || 0);
```

- [ ] **Step 3: Fix the comp-replacement default**

Find at `crm.js:4371`:
```js
    _cmaState.compConditions[compIdx] = cf.condition_rating || 3;
```
Replace with:
```js
    _cmaState.compConditions[compIdx] = cf.condition_rating || 0;
```

- [ ] **Step 4: Confirm no unguarded `(subCond - compCond)` remains**

Run:
```bash
grep -n "subCond - compCond\|condition_rating || 3" crm.js
```
Expected: the only `subCond - compCond` hits are `crm.js:2010` (inside `if (!compCond) return;`) and `crm.js:4063` (inside `(subCond > 0 && compCond > 0)`); **zero** `condition_rating || 3` hits remain.

- [ ] **Step 5: Commit**
```bash
git add crm.js
git commit -m "fix(cma): unrated comps no longer get a phantom condition adjustment"
```

---

## Task 3: Node golden-number verification for the math (`scripts/verify-cma-adjustments.mjs`)

**Files:**
- Create: `scripts/verify-cma-adjustments.mjs`

This mirrors (does not import) the `crm.js` construction/condition formulas and locks the expected outputs for the 571 One Feather comps. Keep it in sync if the formulas change.

- [ ] **Step 1: Write the verification script**

```js
// Verifies the CMA construction + condition adjustment math against the
// 571 One Feather Rd (log home) comps. Mirrors crm.js logic — keep in sync.
// Run: node scripts/verify-cma-adjustments.mjs
const PRICE_PER_SQFT = 175;
const CONSTRUCTION_PCT = { site_built: 0, manufactured: -0.25, modular: -0.10, log: 0.05, mobile_home: -0.35, unknown: 0 };
const CONDITION_PER_POINT = 20000;

// Structure-based construction adjustment (Task 1)
function constructionAdj(subCT, compCT, compSqft) {
  if (subCT === compCT || !compSqft) return 0;
  const structureVal = compSqft * PRICE_PER_SQFT;
  return Math.round(structureVal * ((CONSTRUCTION_PCT[subCT] || 0) - (CONSTRUCTION_PCT[compCT] || 0)));
}
// Condition adjustment (Task 2): compCond 0 = unrated -> no adjustment
function conditionAdj(subCond, compCond) {
  if (!compCond) return 0;
  return (subCond - compCond) * CONDITION_PER_POINT;
}

const comps = [
  { name: 'Bettys Creek',  price: 360000, sqft: 1152 },
  { name: 'Ivy Ridge',     price: 390000, sqft: 1344 },
  { name: 'Choice Place',  price: 305000, sqft: 1080 },
];
const expectedConstruction = [10080, 11760, 9450]; // log subject vs site-built comp, 5% of sqft*175

let failures = 0;
function check(label, actual, expected) {
  const ok = actual === expected;
  if (!ok) failures++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}: got ${actual}, expected ${expected}`);
}

comps.forEach((c, i) => {
  check(`construction[${c.name}]`, constructionAdj('log', 'site_built', c.sqft), expectedConstruction[i]);
});
check('construction log-to-log = 0', constructionAdj('log', 'log', 1200), 0);
check('condition unrated (0) = 0', conditionAdj(5, 0), 0);
check('condition rated 4 vs 5 = 20000', conditionAdj(5, 4), 20000);

// Informational: resulting valuation (legit adjustments from the report grid + new construction, condition removed)
const legit = [18625, -27475, 26780]; // living+lot+year(+garage,+time) per comp, condition excluded
const adjusted = comps.map((c, i) => c.price + legit[i] + expectedConstruction[i]);
console.log('\nAdjusted comp prices:', adjusted.map(p => '$' + p.toLocaleString()).join(', '));
const avg = Math.round(adjusted.reduce((s, p) => s + p, 0) / adjusted.length);
console.log('Simple-average value: $' + avg.toLocaleString(), '(was $431,488)');

console.log(`\n${failures === 0 ? 'ALL CHECKS PASSED' : failures + ' CHECK(S) FAILED'}`);
process.exit(failures === 0 ? 0 : 1);
```

- [ ] **Step 2: Run it**

Run: `node scripts/verify-cma-adjustments.mjs`
Expected: all `PASS` lines, "Simple-average value: $368,073 (was $431,488)", final `ALL CHECKS PASSED`, exit 0.

- [ ] **Step 3: Commit**
```bash
git add scripts/verify-cma-adjustments.mjs
git commit -m "test(cma): golden-number check for construction + condition math"
```

---

## Task 4: Show Construction + Elevation rows and a log-fallback caveat (`cma-pdf`)

**Files:**
- Modify: `supabase/functions/cma-pdf/index.ts` (grid builder ~lines 163-233; valuation/caveat area)

Both `adj_construction_type` and `adj_elevation` are already persisted in the report but never rendered, so the grid's line items don't sum to the printed Net Adjustment. Add the rows. The `adjRow`/`dataRow` helpers already exist (cma-pdf:110-131).

- [ ] **Step 1: Add the Construction rows to the Age & Condition section**

Find at `cma-pdf:170-171`:
```js
    gridRows += dataRow("Condition", `${subFeats.condition_rating || "?"}/5`, comps.map(c => `${c.features?.condition_rating || "?"}/5`));
    gridRows += adjRow("Adj @ $20K/pt", "adj_condition");
```
Replace with:
```js
    gridRows += dataRow("Condition", `${subFeats.condition_rating || "?"}/5`, comps.map(c => `${c.features?.condition_rating || "?"}/5`));
    gridRows += adjRow("Adj @ $20K/pt", "adj_condition");
    const ctLabel = (v) => { const s = (v || "").toString().replace(/_/g, "-"); return s ? s.charAt(0).toUpperCase() + s.slice(1) : "—"; };
    gridRows += dataRow("Construction", ctLabel(subFeats.construction_type), comps.map(c => ctLabel(c.features?.construction_type)));
    gridRows += adjRow("Construction Adj (5%/sqft)", "adj_construction_type");
```

- [ ] **Step 2: Add the Elevation rows to the Mountain Features section**

Find at `cma-pdf:228-229`:
```js
  gridRows += dataRow("Privacy", `${subFeats.privacy_rating || "?"}/5`, comps.map(c => `${c.features?.privacy_rating || "?"}/5`));
  gridRows += adjRow(isLand ? "Adj @ $8K/pt" : "Adj @ $6K/pt", "adj_privacy");
```
Replace with:
```js
  gridRows += dataRow("Privacy", `${subFeats.privacy_rating || "?"}/5`, comps.map(c => `${c.features?.privacy_rating || "?"}/5`));
  gridRows += adjRow(isLand ? "Adj @ $8K/pt" : "Adj @ $6K/pt", "adj_privacy");
  gridRows += dataRow("Elevation (ft)", subFeats.elevation_ft ? `${subFeats.elevation_ft}` : "—", comps.map(c => c.features?.elevation_ft ? `${c.features.elevation_ft}` : "—"));
  gridRows += adjRow("Adj @ $2K/100ft", "adj_elevation");
```

- [ ] **Step 3: Add the log-fallback caveat under the valuation box**

Find the methodology note at `cma-pdf:255`:
```js
  const methodNote = data.methodology_note || `This ${numComps}-comp analysis uses WNC-calibrated adjustment rates. ${isLand ? "Land valuations weight lot size, views, water features, and usability above structural factors." : "Adjustments reflect local market conditions in Western North Carolina."} Values are estimates based on comparable sales and should not be considered an appraisal.`;
```
Immediately after that line add:
```js
  const subIsLog = (subFeats.construction_type || "") === "log";
  const anyLogComp = comps.some(c => (c.features?.construction_type || "") === "log");
  const logCaveat = (subIsLog && !anyLogComp)
    ? `<p><strong>Construction note:</strong> No log-home sales were available within the search area, so comparables are site-built with a structure-based construction adjustment. Log-home valuations are most reliable when supported by log-to-log sales.</p>`
    : "";
```
Then find where `methodNote` is rendered in the returned template (search `${methodNote}`) and add `${logCaveat}` immediately after it.

- [ ] **Step 4: Verify (code review — cannot run Deno locally)**

Run: `grep -n "adj_construction_type\|adj_elevation\|logCaveat" supabase/functions/cma-pdf/index.ts`
Expected: `adj_construction_type` and `adj_elevation` each now appear in an `adjRow(...)` call; `logCaveat` is defined and referenced in the template. Confirm by reading the grid builder that the sequence of `adjRow` keys now equals the set of nonzero adjustment keys the engine/frontend can produce (so lines sum to Net Adjustment).

- [ ] **Step 5: Commit**
```bash
git add supabase/functions/cma-pdf/index.ts
git commit -m "fix(cma-pdf): render construction + elevation rows; add log-fallback caveat"
```

---

## Task 5: Log-preferred comp selection + radius (`cma-engine`)

**Files:**
- Modify: `supabase/functions/cma-engine/index.ts` — lift `resolveConstruction` (currently nested in `scoreComp` ~146-193) to module scope; update `auto-select-comps` (~2110-2211) and `find-comps` (~1912 radius).

The log preference currently lives only in the AI prompt, but (a) the 15-mile radius filters out distant log comps before scoring, and (b) log comps scoring below the top-10 never reach the AI. Fix both deterministically.

- [ ] **Step 1: Lift `resolveConstruction` + predicates to module scope**

In `scoreComp` the block at `cma-engine:146-193` defines `isFactory`, `isMobileHome`, `isModular`, `isLog`, and `resolveConstruction` locally. Move these five to module scope (just above `scoreComp`, after the `FeatureTags` interface ~line 90) as standalone functions:
```ts
function isFactoryConstruction(t: string): boolean { return ["manufactured", "modular", "mobile_home"].includes(t); }
function isMobileHomeConstruction(t: string): boolean { return t === "mobile_home"; }
function isModularConstruction(t: string): boolean { return t === "modular"; }
function isLogConstruction(t: string): boolean { return t === "log"; }

// Resolve construction type from feature tags, then MLS sub-type / materials / raw_data.
function resolveConstruction(features: Record<string, unknown> | null, listing: Record<string, unknown>): string {
  const tagged = (features?.construction_type as string) || "unknown";
  if (tagged !== "unknown") return tagged;
  const subType = ((listing.property_sub_type || "") as string).toLowerCase();
  if (subType.includes("manufactured") || subType.includes("mobile")) return "manufactured";
  if (subType.includes("modular")) return "modular";
  const raw = (listing.raw_data || {}) as Record<string, unknown>;
  const carConst = ((raw.CAR_ConstructionType || "") as string).toLowerCase();
  const bodyType = (Array.isArray(raw.BodyType) ? raw.BodyType.join(" ") : ((raw.BodyType || "") as string)).toLowerCase();
  if (carConst.includes("manufactured") || carConst.includes("mobile") ||
      bodyType.includes("double wide") || bodyType.includes("single wide") || bodyType.includes("manufactured")) {
    const yr = (listing.year_built || 0) as number;
    return (yr > 0 && yr < 1976) ? "mobile_home" : "manufactured";
  }
  if (carConst.includes("modular") || bodyType.includes("modular")) return "modular";
  const constMats = Array.isArray(raw.ConstructionMaterials) ? raw.ConstructionMaterials : [];
  const hasLogMaterial = constMats.some((m: unknown) => ((m || "") as string).toLowerCase().trim() === "log");
  const colMats = Array.isArray(listing.construction_materials) ? listing.construction_materials : [];
  const hasLogCol = colMats.some((m: unknown) => ((m || "") as string).toLowerCase().trim() === "log");
  const archStyle = (Array.isArray(raw.ArchitecturalStyle) ? raw.ArchitecturalStyle.join(" ") : ((raw.ArchitecturalStyle || "") as string)).toLowerCase();
  const structType = (Array.isArray(raw.StructureType) ? raw.StructureType.join(" ") : ((raw.StructureType || "") as string)).toLowerCase();
  if (hasLogMaterial || hasLogCol || carConst.includes("log") || bodyType.includes("log") || archStyle.includes("log") || structType.includes("log")) return "log";
  return "site_built";
}
```
Then in `scoreComp`, delete the local `const isFactory = ...` through `const resolveConstruction = ...` definitions (the five `const` declarations only) and update the two call sites to use the module functions: `resolveConstruction(subjectFeatures, subject)` / `resolveConstruction(null, comp)` stay the same name; replace `isLog(...)`→`isLogConstruction(...)`, `isFactory(...)`→`isFactoryConstruction(...)`, `isModular(...)`→`isModularConstruction(...)`, `isMobileHome(...)`→`isMobileHomeConstruction(...)` in the penalty `if/else` (cma-engine:202-227).

- [ ] **Step 2: Add `construction_materials` to the comp query select**

In `auto-select-comps`, find the select at `cma-engine:2117` and append `, construction_materials` to the column list (so `resolveConstruction` can detect log from MLS materials when a comp has no feature tag). Do the same for the `find-comps` select (~`cma-engine:1865`).

- [ ] **Step 3: Resolve subject construction early + widen radius for log subjects**

In `auto-select-comps`, immediately after the feature-overrides block (`cma-engine:2108`, before `const dateFloor`), insert:
```ts
      // Resolve subject construction up front (drives radius + comp pooling below)
      let subConstr = resolveConstruction(subjectTags, subject);
      if (subConstr === "unknown") subConstr = "site_built";
      const isLogSubject = subConstr === "log";
```
Then change `cma-engine:2113` from:
```ts
      const maxDistance = filters.max_distance_miles || 15;
```
to:
```ts
      const maxDistance = filters.max_distance_miles || (isLogSubject ? 40 : 15);
```

- [ ] **Step 4: Pool log comps first before the top-10 cut**

In `auto-select-comps`, find `cma-engine:2199`:
```ts
      const top10 = cleanScored.slice(0, 10);
```
Replace with:
```ts
      // For a log subject, surface same-construction comps to the selector first
      // (each group is already score-sorted). Backfill with non-log only as needed.
      let pooled = cleanScored;
      let logCompCount = 0;
      if (isLogSubject) {
        const logComps = cleanScored.filter((c) => resolveConstruction(c.features, c.listing) === "log");
        const otherComps = cleanScored.filter((c) => resolveConstruction(c.features, c.listing) !== "log");
        logCompCount = logComps.length;
        pooled = [...logComps, ...otherComps];
      }
      const top10 = pooled.slice(0, 10);
      const constructionFallback = isLogSubject && logCompCount < targetCount;
```

- [ ] **Step 5: Return the new flags in both response paths**

In the early "not enough candidates" return (`cma-engine:2203-2210`) and the final selection return, add to the JSON: `log_comp_count: isLogSubject ? logCompCount : undefined,` and `construction_fallback: isLogSubject ? constructionFallback : undefined,`. (The frontend may surface these; the PDF self-detects the caveat, so this is informational.)

- [ ] **Step 6: Apply the radius bump to `find-comps`**

In `find-comps`, resolve subject construction the same way (after subject tags are loaded) and change its `const maxDistance = filters.max_distance_miles || 15;` (`cma-engine:1912`) to `|| (isLogSubject ? 40 : 15)`. (Pooling is optional here since `find-comps` returns a candidate list for manual selection; radius parity is the important part.)

- [ ] **Step 7: Verify (code review — cannot run Deno locally)**

Run: `grep -n "function resolveConstruction\|resolveConstruction(" supabase/functions/cma-engine/index.ts`
Expected: exactly one `function resolveConstruction` (module scope) and call sites in `scoreComp`, `auto-select-comps` pooling, and `find-comps`. Confirm no remaining local `const resolveConstruction` inside `scoreComp`, and that `isLog`/`isFactory`/`isModular`/`isMobileHome` short names no longer appear unqualified (all renamed to `*Construction`).

- [ ] **Step 8: Commit**
```bash
git add supabase/functions/cma-engine/index.ts
git commit -m "fix(cma-engine): prefer log comps + widen radius for log subjects"
```

---

## Task 6: Post-deploy acceptance (user-run — requires live MLS data)

These cannot be checked locally (Deno not installed; engine needs the live `mls_listings` table). After merging and deploying:

- [ ] Deploy: `supabase functions deploy cma-engine` and `supabase functions deploy cma-pdf`.
- [ ] Re-run a CMA on **571 One Feather Rd** (or another log subject). Confirm:
  - [ ] Comps are log homes where available; if none, the report shows the **construction caveat**.
  - [ ] The grid now has **Construction** and **Elevation** rows, and per-comp line items **sum to the Net Adjustment**.
  - [ ] Unrated comps show **"Unknown"** condition with **$0** condition adjustment (no automatic $40K).
  - [ ] Concluded value is in the **high-$360s–low-$370s**, not ~$431K.

---

## Self-Review

- **Spec coverage:** (1) structure-based 5% construction → Tasks 1, 3. (2) log-preferred selection + radius → Task 5. (3) grid transparency (construction + elevation) → Task 4. (4) condition default removal → Tasks 2, 3. (5) fallback caveat → Task 4 Step 3. All five spec items covered.
- **Placeholders:** none — every edit shows exact find/replace code.
- **Type/name consistency:** `resolveConstruction(features, listing)` signature identical at all call sites; predicates uniformly renamed to `*Construction`; `construction_pct`, `price_per_sqft`, `condition_per_point`, `adj_construction_type`, `adj_elevation` match across `crm.js`, `cma-pdf`, and the verification script.
- **Scope:** one coherent feature (log-home CMA accuracy) across three deployables; not decomposable into independently-shippable subsystems. On-screen `crm.js` grid construction row and re-validating the manufactured/modular percentages are noted out-of-scope follow-ups.
