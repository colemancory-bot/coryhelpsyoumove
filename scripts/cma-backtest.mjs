// CMA Backtest Harness (Phase 0 / finding F1 of docs/cma-accuracy-plan.md)
//
// Blindly re-values past closed sales with the CMA engine as if it were the
// approximate contract date (close_date - 45 days), then compares the engine's
// suggested_price to the actual close_price. Produces MdAPE / PPE10 / PPE20 /
// bias, segmented by county, property type, and price band, plus a worst-misses
// table. This is the regression gate: every later accuracy change re-runs it.
//
// Uses the DETERMINISTIC find-comps action (scoring only), NOT auto-select-comps
// (which calls Claude — slow, costly, non-deterministic). See the report header.
//
// Credentials (same server-side convention the stack uses elsewhere):
//   SUPABASE_URL                 (default: the project URL below)
//   SUPABASE_SERVICE_ROLE_KEY    (required — anon RLS blocks reading Closed sales)
// The service-role key is a valid JWT, so it also satisfies the engine's
// verify_jwt gate. Never printed.
//
// Run (PowerShell / bash — supply the key via env):
//   node scripts/cma-backtest.mjs --months 12 --per-county 40 \
//     --counties "Haywood,Jackson,Macon,Swain" --type all \
//     --out docs/cma-backtest-baseline.md --raw scripts/output/backtest-<date>.json

import { writeFileSync, mkdirSync, readFileSync } from "node:fs";
import { dirname } from "node:path";

// ── CLI args ──
function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith("--")) {
      const key = a.slice(2);
      const val = argv[i + 1] && !argv[i + 1].startsWith("--") ? argv[++i] : "true";
      out[key] = val;
    }
  }
  return out;
}
const args = parseArgs(process.argv.slice(2));
const todayStr = new Date().toISOString().split("T")[0];

const CFG = {
  months: parseInt(args.months || "12", 10),
  perCounty: parseInt(args["per-county"] || "40", 10),
  counties: (args.counties || "Haywood,Jackson,Macon,Swain").split(",").map((s) => s.trim()).filter(Boolean),
  type: (args.type || "all").toLowerCase(), // all | residential | land
  requireTags: String(args["require-tags"] || "false").toLowerCase() === "true",
  contractLagDays: parseInt(args["contract-lag-days"] || "45", 10),
  concurrency: parseInt(args.concurrency || "4", 10),
  out: args.out || "docs/cma-backtest-baseline.md",
  raw: args.raw || `scripts/output/backtest-${todayStr}.json`,
  seed: parseInt(args.seed || "1234567", 10),
  // Harness v2 subject filters (see docs/cma-backtest-phase1.md "harness v2"):
  //   Only sample true comp-able subjects — property_type in (Residential, Land)
  //   and BOTH coordinates present. Excludes "Commercial Sale" /
  //   "Residential Income" and coordinate-less rows that the v1 harness bucketed
  //   as "residential" and let distort the aggregates.
  // --include-all-types is the escape hatch: restores v1 sampling (no type
  //   restriction, no coordinate requirement) so old runs can be reproduced.
  includeAllTypes: args["include-all-types"] === "true" || args["include-all-types"] === true,
  // --recompute <raw.json>: recompute the full metrics tables from an existing
  //   raw output WITHOUT calling the engine, applying the v2 subject filters.
  recompute: typeof args.recompute === "string" && args.recompute !== "true" ? args.recompute : null,
};

// property_type values that count as valid comp-able subjects for v2 sampling.
const VALID_SUBJECT_TYPES = new Set(["Residential", "Land"]);

const SUPABASE_URL = process.env.SUPABASE_URL || "https://kzaabnnwjupjqvydiqlz.supabase.co";
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
if (!SERVICE_KEY) {
  console.error("ERROR: SUPABASE_SERVICE_ROLE_KEY env var is required (anon RLS blocks reading Closed sales).");
  console.error("Retrieve it from the linked Supabase CLI, e.g.:");
  console.error('  supabase projects api-keys --reveal --output json --project-ref kzaabnnwjupjqvydiqlz');
  process.exit(1);
}
const REST = SUPABASE_URL + "/rest/v1";
const ENGINE = SUPABASE_URL + "/functions/v1/cma-engine";
const H = { apikey: SERVICE_KEY, Authorization: "Bearer " + SERVICE_KEY };

// ── Deterministic RNG (mulberry32) so sampling is reproducible run-to-run ──
function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function shuffle(arr, rng) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// ── REST helpers ──
async function restGet(path, { range } = {}) {
  const headers = { ...H };
  if (range) headers.Range = range;
  const r = await fetch(REST + path, { headers });
  if (!r.ok) throw new Error(`REST ${r.status} on ${path}: ${await r.text()}`);
  return r.json();
}

async function engineCall(action, payload, attempt = 0) {
  try {
    const r = await fetch(ENGINE, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...H },
      body: JSON.stringify({ action, ...payload }),
    });
    if (r.status >= 500) throw new Error(`engine ${action} HTTP ${r.status}`);
    return await r.json();
  } catch (e) {
    if (attempt < 1) {
      await new Promise((res) => setTimeout(res, 1500));
      return engineCall(action, payload, attempt + 1);
    }
    return { error: String(e && e.message || e) };
  }
}

// ── Concurrency pool ──
async function pool(items, size, worker) {
  const results = new Array(items.length);
  let idx = 0;
  async function run() {
    for (;;) {
      const i = idx++;
      if (i >= items.length) return;
      results[i] = await worker(items[i], i);
      if ((i + 1) % 10 === 0 || i + 1 === items.length) {
        process.stderr.write(`  ...${i + 1}/${items.length}\n`);
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(size, items.length) }, run));
  return results;
}

// ── Metrics ──
function median(nums) {
  if (!nums.length) return null;
  const s = nums.slice().sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}
function metrics(records) {
  const valued = records.filter((r) => r.status === "valued");
  const skipped = records.filter((r) => r.status !== "valued");
  const absErr = valued.map((r) => Math.abs(r.error_pct) * 100);
  const signed = valued.map((r) => r.error_pct * 100);
  const gross = valued.map((r) => r.median_gross_adj_pct).filter((x) => x != null);
  const n = valued.length;
  return {
    n,
    skipped: skipped.length,
    mdape: n ? median(absErr) : null,
    ppe10: n ? valued.filter((r) => Math.abs(r.error_pct) <= 0.10).length / n : null,
    ppe20: n ? valued.filter((r) => Math.abs(r.error_pct) <= 0.20).length / n : null,
    bias: n ? signed.reduce((s, v) => s + v, 0) / n : null,
    medGross: gross.length ? median(gross) : null,
  };
}
const pct = (x, d = 1) => (x == null ? "—" : x.toFixed(d) + "%");
const frac = (x) => (x == null ? "—" : (x * 100).toFixed(1) + "%");
const money = (x) => (x == null ? "—" : "$" + Math.round(x).toLocaleString());

function priceBand(p) {
  if (p < 300000) return "<$300K";
  if (p <= 600000) return "$300–600K";
  return ">$600K";
}

// ── Subject selection ──
async function fetchSubjects(county) {
  const floor = new Date(Date.now() - CFG.months * 30 * 86400000).toISOString().split("T")[0];
  // close_date window keeps the scan small (avoids statement timeouts on the 18k-row table).
  let path =
    `/mls_listings?select=listing_key,full_address,county_or_parish,property_type,close_price,close_date,living_area,lot_size_acres,latitude,longitude` +
    `&standard_status=eq.Closed&close_price=gt.0&county_or_parish=eq.${encodeURIComponent(county)}` +
    `&close_date=gte.${floor}&order=close_date.desc&limit=5000`;
  // v2 filters (skipped by --include-all-types): true comp-able subjects only.
  if (!CFG.includeAllTypes) {
    path += `&property_type=in.(${[...VALID_SUBJECT_TYPES].join(",")})`;
    path += `&latitude=not.is.null&longitude=not.is.null`;
  }
  let rows = await restGet(path);
  if (CFG.type === "land") rows = rows.filter((r) => (r.property_type || "").toLowerCase() === "land");
  else if (CFG.type === "residential") rows = rows.filter((r) => (r.property_type || "").toLowerCase() !== "land");
  if (CFG.requireTags) {
    const keys = rows.map((r) => r.listing_key);
    const tagged = new Set();
    for (let i = 0; i < keys.length; i += 200) {
      const chunk = keys.slice(i, i + 200);
      const inList = "(" + chunk.map((k) => `"${k}"`).join(",") + ")";
      const t = await restGet(`/cma_feature_tags?select=listing_key&agent_id=is.null&listing_key=in.${encodeURIComponent(inList)}`);
      t.forEach((x) => tagged.add(x.listing_key));
    }
    rows = rows.filter((r) => tagged.has(r.listing_key));
  }
  return rows;
}

// Stratified sample: preserve the land/residential mix that exists in the window.
function stratifiedSample(rows, cap, rng) {
  if (rows.length <= cap) return shuffle(rows, rng);
  const land = shuffle(rows.filter((r) => (r.property_type || "").toLowerCase() === "land"), rng);
  const res = shuffle(rows.filter((r) => (r.property_type || "").toLowerCase() !== "land"), rng);
  const landTarget = Math.round((land.length / rows.length) * cap);
  const resTarget = cap - landTarget;
  const picked = land.slice(0, Math.min(landTarget, land.length)).concat(res.slice(0, Math.min(resTarget, res.length)));
  // Top up if one stratum ran short.
  if (picked.length < cap) {
    const remaining = shuffle(rows.filter((r) => !picked.includes(r)), rng);
    picked.push(...remaining.slice(0, cap - picked.length));
  }
  return shuffle(picked, rng);
}

// ── Per-subject valuation ──
function asOfDateFor(closeDate) {
  const d = new Date(closeDate + "T00:00:00");
  d.setDate(d.getDate() - CFG.contractLagDays);
  return d.toISOString().split("T")[0];
}

async function valueSubject(subj) {
  const asOf = asOfDateFor(subj.close_date);
  const base = {
    listing_key: subj.listing_key,
    county: subj.county_or_parish,
    property_type: (subj.property_type || "").toLowerCase() === "land" ? "land" : "residential",
    price_band: priceBand(subj.close_price),
    actual: subj.close_price,
    as_of_date: asOf,
  };
  const fc = await engineCall("find-comps", { listing_key: subj.listing_key, as_of_date: asOf, filters: { limit: 8 } });
  if (fc.error) return { ...base, status: "error_find_comps", detail: fc.error };
  const allComps = fc.comps || [];
  // Verify time-travel: no comp closed after as_of (defensive sanity, recorded not enforced).
  const leaks = allComps.filter((c) => c.listing && c.listing.close_date && c.listing.close_date > asOf).length;
  const clean = allComps.filter((c) => !c.is_price_outlier);
  const chosen = clean.slice(0, 4);
  if (chosen.length < 2) return { ...base, status: "insufficient_comps", comps_available: allComps.length, comps_clean: clean.length };
  const subject = fc.subject || { listing: subj, features: null };
  const ca = await engineCall("calculate-adjustments", {
    subject,
    comps: chosen.map((c) => ({ listing: c.listing, features: c.features })),
    as_of_date: asOf,
  });
  if (ca.error) return { ...base, status: "error_calc_adjust", detail: ca.error };
  const predicted = ca.valuation && ca.valuation.suggested_price;
  if (!predicted || predicted <= 0) return { ...base, status: "no_valuation", comps_used: chosen.length };
  const grossPcts = (ca.adjustments || []).map((a) => a.gross_adjustment_pct).filter((x) => x != null);
  return {
    ...base,
    status: "valued",
    predicted,
    error_pct: (predicted - subj.close_price) / subj.close_price,
    comps_used: chosen.length,
    comp_keys: chosen.map((c) => c.listing.listing_key),
    median_gross_adj_pct: median(grossPcts),
    time_leak_comps: leaks,
  };
}

// ── Report ──
function metricRow(label, m) {
  return `| ${label} | ${m.n} | ${m.skipped} | ${pct(m.mdape)} | ${frac(m.ppe10)} | ${frac(m.ppe20)} | ${pct(m.bias)} | ${pct(m.medGross)} |`;
}
function buildReport(records, meta) {
  const valued = records.filter((r) => r.status === "valued");
  const skipReasons = {};
  for (const r of records) if (r.status !== "valued") skipReasons[r.status] = (skipReasons[r.status] || 0) + 1;

  const overall = metrics(records);
  const byCounty = CFG.counties.map((c) => [c, metrics(records.filter((r) => r.county === c))]);
  const byType = ["residential", "land"].map((t) => [t, metrics(records.filter((r) => r.property_type === t))]);
  const bands = ["<$300K", "$300–600K", ">$600K"];
  const byBand = bands.map((b) => [b, metrics(records.filter((r) => r.price_band === b))]);

  const worst = valued
    .slice()
    .sort((a, b) => Math.abs(b.error_pct) - Math.abs(a.error_pct))
    .slice(0, 10);

  const H2 = "| Segment | N valued | N skipped | MdAPE | PPE10 | PPE20 | Bias | Med. gross adj |";
  const SEP = "|---|---|---|---|---|---|---|---|";

  let md = "";
  md += `# CMA Backtest Baseline\n\n`;
  md += `**Generated:** ${meta.generatedAt}\n`;
  md += `**Phase:** 0 (finding F1 of \`docs/cma-accuracy-plan.md\`) — this is the regression gate. Re-run after every accuracy change and compare.\n\n`;
  md += `## Method\n\n`;
  md += `- **Subjects:** closed sales (\`close_price > 0\`) in the trailing **${CFG.months} months**, counties: ${CFG.counties.join(", ")}, type filter: \`${CFG.type}\`.\n`;
  md += `- **Sampling:** up to **${CFG.perCounty} per county**, stratified to preserve the land/residential mix present in the window. Deterministic (seed ${CFG.seed}), reproducible.\n`;
  md += `- **As-of date:** each subject is valued as if today were its \`close_date − ${CFG.contractLagDays} days\` (appraiser convention approximating the contract/price-agreement date). The engine's new \`as_of_date\` time-travel parameter enforces that only comps closed on or before that date are used.\n`;
  md += `- **Comps:** \`find-comps\` with \`{ limit: 8 }\`, then the top **4** non-price-outlier comps (fewer if unavailable; subject skipped as *insufficient comps* if < 2).\n`;
  md += `- **Engine:** deterministic \`find-comps\` scoring + \`calculate-adjustments\`. We deliberately do **NOT** use \`auto-select-comps\` (it calls Claude — slow, costly, non-deterministic), so this baseline is stable and repeatable.\n`;
  md += `- **Prediction:** \`valuation.suggested_price\`; **actual:** \`close_price\`; **error%** = (predicted − actual) / actual.\n\n`;

  if (meta.tagCoverage) {
    md += `## ⚠ Data caveat: feature-tag coverage is effectively zero\n\n`;
    md += `\`cma_feature_tags\` (agent_id IS NULL) currently holds **${meta.tagCoverage.tagRows} rows** against **${meta.tagCoverage.closedRows.toLocaleString()}** closed sales with a price (~${(100 * meta.tagCoverage.tagRows / meta.tagCoverage.closedRows).toFixed(3)}% coverage). `;
    md += `That means the engine's mountain/feature adjustments (view, water, condition, land usability, privacy, road noise, elevation, construction) are **almost never exercised** in this baseline — nearly every subject and comp is valued on size, lot, age, and time only. `;
    md += `This directly quantifies finding **F9** ("ensure feature extraction backfill has actually covered the comp universe"). Because requiring a tag per subject would yield ~0 subjects, this run uses \`--require-tags ${CFG.requireTags}\`. Backfilling \`cma-extract-features\` across the closed universe is a prerequisite for measuring any feature-adjustment change.\n\n`;
  }

  md += `## Headline\n\n`;
  md += `${H2}\n${SEP}\n`;
  md += `${metricRow("**Overall**", overall)}\n\n`;
  md += `- **MdAPE** = median absolute % error. **PPE10 / PPE20** = share of predictions within 10% / 20% of actual. **Bias** = mean signed error (positive = engine overvalues). **Med. gross adj** = median of the comps' gross-adjustment % (comparability quality).\n`;
  md += `- Industry context (F1): rural PPE10 for national AVMs (Zillow/Redfin) runs ~50–60%.\n\n`;

  md += `## By county\n\n${H2}\n${SEP}\n`;
  for (const [c, m] of byCounty) md += `${metricRow(c, m)}\n`;
  md += `\n## By property type\n\n${H2}\n${SEP}\n`;
  for (const [t, m] of byType) md += `${metricRow(t, m)}\n`;
  md += `\n## By price band\n\n${H2}\n${SEP}\n`;
  for (const [b, m] of byBand) md += `${metricRow(b, m)}\n`;

  md += `\n## Skips\n\nTotal subjects attempted: **${records.length}**. Valued: **${valued.length}**. Skipped: **${records.length - valued.length}**.\n\n`;
  md += `| Reason | Count |\n|---|---|\n`;
  for (const [k, v] of Object.entries(skipReasons)) md += `| ${k} | ${v} |\n`;
  const leakTotal = valued.reduce((s, r) => s + (r.time_leak_comps || 0), 0);
  md += `\nComps that closed after the as-of date (time-travel leaks; should be 0): **${leakTotal}**.\n`;

  md += `\n## Worst 10 misses (address-free)\n\n`;
  md += `| listing_key | county | type | predicted | actual | error % |\n|---|---|---|---|---|---|\n`;
  for (const r of worst) {
    md += `| ${r.listing_key} | ${r.county} | ${r.property_type} | ${money(r.predicted)} | ${money(r.actual)} | ${(r.error_pct * 100).toFixed(1)}% |\n`;
  }
  md += `\n---\n_Raw per-subject results: \`${CFG.raw}\`._\n`;
  return md;
}

// ── Recompute mode (--recompute <raw.json>) ──
// Recompute the metrics tables from an existing raw output WITHOUT calling the
// engine, applying the v2 subject filters. Re-fetches each subject's real
// property_type + coordinates by listing_key (the raw records only store the
// bucketed residential/land label and no coords), then drops any subject whose
// type isn't Residential/Land or that has a null coordinate.
async function fetchListingMeta(keys) {
  const meta = {};
  for (let i = 0; i < keys.length; i += 200) {
    const chunk = keys.slice(i, i + 200);
    const inList = "(" + chunk.map((k) => `"${k}"`).join(",") + ")";
    const rows = await restGet(
      `/mls_listings?select=listing_key,property_type,latitude,longitude&listing_key=in.${encodeURIComponent(inList)}`
    );
    for (const r of rows) meta[r.listing_key] = r;
  }
  return meta;
}

async function recomputeMode(rawPath) {
  const raw = JSON.parse(readFileSync(rawPath, "utf8"));
  const records = raw.records || [];
  const counties = (raw.config && raw.config.counties) || CFG.counties;
  const keys = records.map((r) => r.listing_key);
  console.error(`Recompute: ${rawPath} — ${records.length} records; re-fetching real type + coords...`);
  const meta = await fetchListingMeta(keys);

  const dropTypes = {};
  let dropType = 0, dropCoord = 0, missing = 0;
  const kept = [];
  for (const rec of records) {
    if (CFG.includeAllTypes) { kept.push(rec); continue; }
    const m = meta[rec.listing_key];
    if (!m) { missing++; continue; }
    const okType = VALID_SUBJECT_TYPES.has(m.property_type);
    const okCoord = m.latitude != null && m.longitude != null;
    if (!okType) { dropType++; dropTypes[m.property_type] = (dropTypes[m.property_type] || 0) + 1; continue; }
    if (!okCoord) { dropCoord++; continue; }
    kept.push(rec);
  }
  console.error(
    `  kept ${kept.length}/${records.length}  (dropped bad-type ${dropType} ${JSON.stringify(dropTypes)}, null-coord ${dropCoord}, missing-from-db ${missing})`
  );

  const H2 = "| Segment | N valued | N skipped | MdAPE | PPE10 | PPE20 | Bias | Med. gross adj |";
  const SEP = "|---|---|---|---|---|---|---|---|";
  const seg = (label, recs) => metricRow(label, metrics(recs));
  let md = "";
  md += `### Recompute (v2 filters) — ${rawPath}\n\n`;
  md += `Kept **${kept.length}** of ${records.length} subjects (dropped ${dropType} non-Residential/Land, ${dropCoord} null-coordinate).\n\n`;
  md += `${H2}\n${SEP}\n`;
  md += `${seg("**Overall**", kept)}\n`;
  for (const c of counties) md += `${seg(c, kept.filter((r) => r.county === c))}\n`;
  for (const t of ["residential", "land"]) md += `${seg(t, kept.filter((r) => r.property_type === t))}\n`;
  for (const b of ["<$300K", "$300–600K", ">$600K"]) md += `${seg(b, kept.filter((r) => r.price_band === b))}\n`;
  console.log("\n" + md);
  return { rawPath, kept: kept.length, of: records.length, md };
}

// ── Main ──
async function main() {
  if (CFG.recompute) {
    await recomputeMode(CFG.recompute);
    return;
  }

  console.error(`CMA backtest: months=${CFG.months} perCounty=${CFG.perCounty} type=${CFG.type} requireTags=${CFG.requireTags}`);
  const rng = mulberry32(CFG.seed);

  // Tag-coverage stat (F9 deliverable).
  let tagCoverage = null;
  try {
    const closedCR = await fetch(REST + "/mls_listings?select=listing_key&standard_status=eq.Closed&close_price=gt.0", { headers: { ...H, Prefer: "count=exact", Range: "0-0" } });
    const tagCR = await fetch(REST + "/cma_feature_tags?select=listing_key&agent_id=is.null", { headers: { ...H, Prefer: "count=exact", Range: "0-0" } });
    tagCoverage = {
      closedRows: parseInt((closedCR.headers.get("content-range") || "/0").split("/")[1], 10),
      tagRows: parseInt((tagCR.headers.get("content-range") || "/0").split("/")[1], 10),
    };
    console.error(`Tag coverage: ${tagCoverage.tagRows} tags / ${tagCoverage.closedRows} closed sales`);
  } catch (e) { console.error("tag coverage probe failed:", e.message); }

  // Build subject list.
  const subjects = [];
  for (const county of CFG.counties) {
    const rows = await fetchSubjects(county);
    const sample = stratifiedSample(rows, CFG.perCounty, rng);
    console.error(`${county}: ${rows.length} eligible closed sales -> sampled ${sample.length}`);
    subjects.push(...sample);
  }
  console.error(`Valuing ${subjects.length} subjects (concurrency ${CFG.concurrency})...`);

  const records = await pool(subjects, CFG.concurrency, valueSubject);

  // Write raw JSON.
  mkdirSync(dirname(CFG.raw), { recursive: true });
  writeFileSync(CFG.raw, JSON.stringify({ config: CFG, tagCoverage, generatedAt: new Date().toISOString(), records }, null, 2));

  // Write report.
  const md = buildReport(records, { generatedAt: new Date().toISOString(), tagCoverage });
  mkdirSync(dirname(CFG.out), { recursive: true });
  writeFileSync(CFG.out, md);

  const m = metrics(records);
  console.error(`\nDONE. Overall: N=${m.n} skipped=${m.skipped} MdAPE=${pct(m.mdape)} PPE10=${frac(m.ppe10)} PPE20=${frac(m.ppe20)} bias=${pct(m.bias)}`);
  console.error(`Report: ${CFG.out}  Raw: ${CFG.raw}`);
}

main().catch((e) => { console.error("FATAL:", e); process.exit(1); });
