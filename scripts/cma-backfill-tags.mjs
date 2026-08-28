// CMA Feature-Tag Backfill Driver (finding F9 of docs/cma-accuracy-plan.md)
//
// Only ~6 of ~7,900 comp-relevant listings have cma_feature_tags rows, so the
// engine's mountain/feature adjustments never fire. The edge function's own
// `backfill` action can't scale (it fetches the newest 50 Closed rows and skips
// tagged ones, so once the newest page is tagged it never advances). This driver
// derives the FULL untagged target set and calls the function's `extract-single`
// action key-by-key.
//
// Target set (both counties + status branches configurable):
//   county_or_parish in (Haywood, Jackson, Macon, Swain) AND
//   [ (standard_status = Closed AND close_price not null AND close_date >= 36 months ago)
//     OR standard_status in (Active, "Active Under Contract", Pending) ]
//   MINUS every listing_key already present in cma_feature_tags.
//
// The untagged set is re-derived at startup, so re-running skips completed work
// (resume-safe). Ctrl+C finishes in-flight calls and prints progress.
//
// Credentials (same convention as scripts/cma-backtest.mjs):
//   SUPABASE_URL                 (default: the project URL below)
//   SUPABASE_SERVICE_ROLE_KEY    (required — service key authorizes the function
//                                 and reads listings/tags). Never printed.
//
// Run (PowerShell / bash — supply the key via env):
//   node scripts/cma-backfill-tags.mjs --dry-run
//   node scripts/cma-backfill-tags.mjs --limit 10
//   node scripts/cma-backfill-tags.mjs              # full run (unlimited)
//
// Flags:
//   --limit N         process at most N listings (default: unlimited)
//   --dry-run         print counts + estimated runtime/cost, make no calls
//   --counties A,B    override counties (default: Haywood,Jackson,Macon,Swain)
//   --status S        closed | active | all  (default: all)
//   --scope S         legacy | trimmed  (default: legacy). trimmed matches the
//                     batch backfill scope (docs/cma-accuracy-plan.md); when set,
//                     --status is ignored. Use with --dry-run for an exact
//                     untagged trimmed-scope count.

import { writeFileSync, mkdirSync, appendFileSync } from "node:fs";
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
  counties: (args.counties || "Haywood,Jackson,Macon,Swain").split(",").map((s) => s.trim()).filter(Boolean),
  status: (args.status || "all").toLowerCase(), // closed | active | all
  scope: (args.scope || "legacy").toLowerCase(), // legacy | trimmed
  limit: args.limit && args.limit !== "true" ? parseInt(args.limit, 10) : Infinity,
  dryRun: args["dry-run"] === "true" || args["dry-run"] === true,
  monthsClosed: 36,
  concurrency: 2,
  launchSpacingMs: 500, // ~500ms between launches
  callTimeoutMs: 120000, // extract-single calls Claude + USGS; give it room
  retryBackoffMs: 15000, // one retry on 5xx/timeout/429
  failLog: `scripts/output/backfill-failures-${todayStr}.log`,
  costPerListing: 0.01, // ~$0.01/listing (dry-run estimate)
  assumedCallSeconds: 4, // dry-run runtime estimate only
};

const SUPABASE_URL = process.env.SUPABASE_URL || "https://kzaabnnwjupjqvydiqlz.supabase.co";
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
if (!SERVICE_KEY) {
  console.error("ERROR: SUPABASE_SERVICE_ROLE_KEY env var is required (authorizes the function and reads listings/tags).");
  console.error("Retrieve it from the linked Supabase CLI, e.g.:");
  console.error("  supabase projects api-keys --output json --project-ref kzaabnnwjupjqvydiqlz");
  process.exit(1);
}
const REST = SUPABASE_URL + "/rest/v1";
const FN = SUPABASE_URL + "/functions/v1/cma-extract-features";
const H = { apikey: SERVICE_KEY, Authorization: "Bearer " + SERVICE_KEY };

// ── REST paginate helper (PostgREST caps at 1000/page) ──
async function restPaginate(pathNoRange, pageSize = 1000) {
  const rows = [];
  for (let from = 0; ; from += pageSize) {
    const to = from + pageSize - 1;
    const r = await fetch(REST + pathNoRange, { headers: { ...H, Range: `${from}-${to}` } });
    if (!r.ok) throw new Error(`REST ${r.status} on ${pathNoRange}: ${await r.text()}`);
    const page = await r.json();
    rows.push(...page);
    if (page.length < pageSize) break;
  }
  return rows;
}

// ── Build the target set ──
async function buildTargetKeys() {
  const cty = `county_or_parish=in.(${CFG.counties.join(",")})`;

  // scope=trimmed matches the batch backfill exactly (docs/cma-accuracy-plan.md):
  //   1. Closed, close_price not null, close_date >= now-12mo (all types)
  //   2. Closed, close_price not null, property_type=Land, close_date 12-36mo
  //   3. Active / Active Under Contract / Pending, property_type=Land
  if (CFG.scope === "trimmed") {
    const d12 = new Date(Date.now() - 365 * 86400000).toISOString().split("T")[0];
    const d36 = new Date(Date.now() - 3 * 365 * 86400000).toISOString().split("T")[0];
    const land = encodeURIComponent('"Active Under Contract"');
    const orClause =
      `or=(` +
      `and(standard_status.eq.Closed,close_price.not.is.null,close_date.gte.${d12}),` +
      `and(standard_status.eq.Closed,close_price.not.is.null,property_type.eq.Land,close_date.gte.${d36},close_date.lt.${d12}),` +
      `and(standard_status.in.(Active,${land},Pending),property_type.eq.Land)` +
      `)`;
    const path = `/mls_listings?select=listing_key,standard_status&${cty}&${orClause}&order=listing_key.asc`;
    return restPaginate(path);
  }

  // status=closed uses plain AND filters; active/all use the clause above.
  let path;
  if (CFG.status === "closed") {
    const floor = new Date(Date.now() - CFG.monthsClosed * 30 * 86400000).toISOString().split("T")[0];
    path = `/mls_listings?select=listing_key,standard_status&${cty}&standard_status=eq.Closed&close_price=not.is.null&close_date=gte.${floor}&order=listing_key.asc`;
  } else if (CFG.status === "active") {
    path = `/mls_listings?select=listing_key,standard_status&${cty}&standard_status=in.(Active,${encodeURIComponent('"Active Under Contract"')},Pending)&order=listing_key.asc`;
  } else {
    const floor = new Date(Date.now() - CFG.monthsClosed * 30 * 86400000).toISOString().split("T")[0];
    const orClause = `or=(and(standard_status.eq.Closed,close_price.not.is.null,close_date.gte.${floor}),standard_status.in.(Active,${encodeURIComponent('"Active Under Contract"')},Pending))`;
    path = `/mls_listings?select=listing_key,standard_status&${cty}&${orClause}&order=listing_key.asc`;
  }
  return restPaginate(path);
}

async function buildTaggedKeys() {
  const rows = await restPaginate(`/cma_feature_tags?select=listing_key&order=listing_key.asc`);
  return new Set(rows.map((r) => r.listing_key));
}

// ── extract-single call with one retry on 5xx / timeout / 429 ──
async function extractOne(listingKey) {
  async function attempt() {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), CFG.callTimeoutMs);
    try {
      const r = await fetch(FN, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...H },
        body: JSON.stringify({ action: "extract-single", listing_key: listingKey }),
        signal: ctrl.signal,
      });
      const retriable = r.status >= 500 || r.status === 429;
      const bodyText = await r.text();
      return { ok: r.ok, status: r.status, retriable, bodyText };
    } catch (e) {
      // AbortError (timeout) or network error → retriable
      return { ok: false, status: 0, retriable: true, bodyText: String(e && e.message || e) };
    } finally {
      clearTimeout(t);
    }
  }
  let res = await attempt();
  if (!res.ok && res.retriable) {
    await sleep(CFG.retryBackoffMs);
    res = await attempt();
  }
  if (res.ok) return { ok: true };
  return { ok: false, reason: `HTTP ${res.status}: ${(res.bodyText || "").slice(0, 300)}` };
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ── Graceful shutdown ──
let aborted = false;
process.on("SIGINT", () => {
  if (aborted) { console.error("\nForce quit."); process.exit(1); }
  aborted = true;
  console.error("\nCtrl+C received — no new launches; waiting for in-flight calls to finish...");
});

function fmtDuration(sec) {
  sec = Math.round(sec);
  const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = sec % 60;
  return (h ? `${h}h ` : "") + (h || m ? `${m}m ` : "") + `${s}s`;
}

// ── Main ──
async function main() {
  console.error(`CMA feature-tag backfill: counties=${CFG.counties.join(",")} scope=${CFG.scope} status=${CFG.scope === "trimmed" ? "(ignored)" : CFG.status} limit=${CFG.limit === Infinity ? "∞" : CFG.limit}`);
  console.error("Deriving target set (paginating)...");

  const targetRows = await buildTargetKeys();
  const tagged = await buildTaggedKeys();

  // De-dup target keys, then subtract tagged. Track branch split for reporting.
  const seen = new Set();
  const untagged = [];
  let closedCount = 0, activeCount = 0;
  for (const row of targetRows) {
    if (seen.has(row.listing_key)) continue;
    seen.add(row.listing_key);
    if (tagged.has(row.listing_key)) continue;
    untagged.push(row.listing_key);
    if (row.standard_status === "Closed") closedCount++; else activeCount++;
  }

  console.error(`Target rows: ${targetRows.length} (unique ${seen.size}). Already tagged: ${tagged.size}.`);
  console.error(`Untagged targets: ${untagged.length}  (closed ${closedCount}, active ${activeCount})`);

  const toProcess = untagged.slice(0, CFG.limit === Infinity ? untagged.length : CFG.limit);

  if (CFG.dryRun) {
    // Concurrency-bound estimate: rate ≈ concurrency / assumedCallSeconds, but no
    // faster than one launch per launchSpacingMs.
    const byLatency = toProcess.length * CFG.assumedCallSeconds / CFG.concurrency;
    const bySpacing = toProcess.length * (CFG.launchSpacingMs / 1000);
    const estSec = Math.max(byLatency, bySpacing);
    const cost = toProcess.length * CFG.costPerListing;
    console.error("\n── DRY RUN (no calls made) ──");
    console.error(`Would process: ${toProcess.length} listings`);
    console.error(`  split (of untagged targets): closed ${closedCount}, active ${activeCount}`);
    console.error(`Estimated runtime: ~${fmtDuration(estSec)}  (concurrency ${CFG.concurrency}, ~${CFG.assumedCallSeconds}s/call assumed)`);
    console.error(`Estimated API cost: ~$${cost.toFixed(2)}  (at $${CFG.costPerListing}/listing)`);
    return;
  }

  if (toProcess.length === 0) {
    console.error("Nothing to do — every target is already tagged.");
    return;
  }

  mkdirSync(dirname(CFG.failLog), { recursive: true });

  // ── Scheduler: concurrency 2, ~500ms between launches, retry inside extractOne ──
  let launched = 0, succeeded = 0, failed = 0, inFlight = 0;
  const startMs = Date.now();
  let lastLogged = 0;

  function logProgress(force) {
    const done = succeeded + failed;
    if (!force && done - lastLogged < 50) return;
    lastLogged = done;
    const elapsed = (Date.now() - startMs) / 1000;
    const rate = done / elapsed; // completions/sec
    const remaining = toProcess.length - done;
    const eta = rate > 0 ? remaining / rate : 0;
    console.error(`  ${done}/${toProcess.length} done (ok ${succeeded}, fail ${failed}) — ${rate.toFixed(2)}/s, ETA ${fmtDuration(eta)}`);
  }

  await new Promise((resolve) => {
    let idx = 0;
    async function launchNext() {
      if (idx >= toProcess.length || aborted) return;
      const key = toProcess[idx++];
      inFlight++;
      launched++;
      extractOne(key).then((res) => {
        if (res.ok) {
          succeeded++;
        } else {
          failed++;
          appendFileSync(CFG.failLog, `${key}\t${res.reason}\n`);
        }
        inFlight--;
        logProgress(false);
        maybeFinish();
        // A finished slot frees capacity — try to top back up immediately.
        if (!aborted && idx < toProcess.length && inFlight < CFG.concurrency) launchNext();
      });
    }
    function maybeFinish() {
      if ((idx >= toProcess.length || aborted) && inFlight === 0) {
        resolve();
      }
    }
    // Launch loop: keep up to `concurrency` in flight, spacing launches by ~500ms.
    (async () => {
      while (!aborted && idx < toProcess.length) {
        if (inFlight < CFG.concurrency) {
          launchNext();
          await sleep(CFG.launchSpacingMs);
        } else {
          await sleep(50);
        }
      }
      maybeFinish();
    })();
  });

  logProgress(true);
  const elapsed = (Date.now() - startMs) / 1000;
  console.error("\n── SUMMARY ──");
  console.error(`Attempted: ${launched}   Succeeded: ${succeeded}   Failed: ${failed}`);
  console.error(`Elapsed: ${fmtDuration(elapsed)}   Rate: ${(( succeeded + failed) / elapsed).toFixed(2)}/s`);
  if (failed > 0) console.error(`Failures logged to: ${CFG.failLog}`);
  if (aborted) console.error("(interrupted — re-run to resume; the untagged set is re-derived at startup)");
}

main().catch((e) => { console.error("FATAL:", e); process.exit(1); });
