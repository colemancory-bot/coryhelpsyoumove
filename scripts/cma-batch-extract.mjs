// CMA Feature-Tag Backfill via the Anthropic Message Batches API (50% cost).
//
// This driver talks ONLY to the Supabase edge function `cma-extract-features`
// with the service-role key. The Anthropic API key never leaves the edge
// function — all batch submit/poll/ingest calls happen server-side. This script
// just orchestrates the three phases:
//
//   1. SUBMIT  — call { action: "batch-submit", scope, limit } in a loop until
//                every untagged trimmed-scope listing is sitting in a batch.
//                The function excludes already-submitted keys, so each call
//                submits a fresh slice; loop ends when submitted === 0.
//   2. POLL    — call { action: "batch-status" } every 60s until every tracked
//                batch reports processing_status "ended" (or the timeout hits).
//   3. INGEST  — call { action: "batch-ingest", batch_id, limit } per ended
//                batch, looping until remaining === 0 (or a pass makes no
//                progress — that means only unparseable results remain).
//
// Trimmed scope (4 counties: Haywood, Jackson, Macon, Swain):
//   1. Closed, close_price not null, close_date >= now-12mo (all types)
//   2. Closed, close_price not null, property_type=Land, close_date 12-36mo
//   3. Active / Active Under Contract / Pending, property_type=Land
//   minus listing_keys already in cma_feature_tags.
//
// Credentials (never printed):
//   SUPABASE_URL               (default: project URL below)
//   SUPABASE_SERVICE_ROLE_KEY  (required — authorizes the function)
//     Retrieve via: npx supabase projects api-keys --project-ref kzaabnnwjupjqvydiqlz
//
// Run:
//   node scripts/cma-batch-extract.mjs --dry-run          # print scope counts, no calls
//   node scripts/cma-batch-extract.mjs                    # full: submit → poll → ingest
//   node scripts/cma-batch-extract.mjs --scope all        # broader scope
//   node scripts/cma-batch-extract.mjs --submit-only      # phase 1 only
//   node scripts/cma-batch-extract.mjs --ingest-only      # phase 3 only (batches already ended)
//
// Flags:
//   --scope trimmed|all   default trimmed
//   --submit-limit N      per batch-submit call cap (default 1000; function chunks at 800)
//   --ingest-limit N      per batch-ingest call cap (default 100)
//   --poll-seconds N      poll interval (default 60)
//   --max-poll-minutes N  give up polling after this (default 90) and report batch ids
//   --dry-run             print untagged counts only
//   --submit-only         run phase 1 then exit
//   --ingest-only         skip submit + poll, ingest ended batches

const args = (() => {
  const out = {};
  const a = process.argv.slice(2);
  for (let i = 0; i < a.length; i++) {
    if (a[i].startsWith("--")) {
      const key = a[i].slice(2);
      const val = a[i + 1] && !a[i + 1].startsWith("--") ? a[++i] : "true";
      out[key] = val;
    }
  }
  return out;
})();

const CFG = {
  scope: (args.scope || "trimmed").toLowerCase(),
  submitLimit: args["submit-limit"] ? parseInt(args["submit-limit"], 10) : 1000,
  ingestLimit: args["ingest-limit"] ? parseInt(args["ingest-limit"], 10) : 100,
  pollSeconds: args["poll-seconds"] ? parseInt(args["poll-seconds"], 10) : 60,
  maxPollMinutes: args["max-poll-minutes"] ? parseInt(args["max-poll-minutes"], 10) : 90,
  dryRun: args["dry-run"] === "true",
  submitOnly: args["submit-only"] === "true",
  ingestOnly: args["ingest-only"] === "true",
  costPerListing: 0.004, // batch pricing estimate
};

const SUPABASE_URL = process.env.SUPABASE_URL || "https://kzaabnnwjupjqvydiqlz.supabase.co";
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
if (!SERVICE_KEY) {
  console.error("ERROR: SUPABASE_SERVICE_ROLE_KEY env var is required.");
  console.error("  npx supabase projects api-keys --output json --project-ref kzaabnnwjupjqvydiqlz");
  process.exit(1);
}
const FN = SUPABASE_URL + "/functions/v1/cma-extract-features";
const H = { "Content-Type": "application/json", apikey: SERVICE_KEY, Authorization: "Bearer " + SERVICE_KEY };

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function call(bodyObj, timeoutMs = 150000) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const r = await fetch(FN, { method: "POST", headers: H, body: JSON.stringify(bodyObj), signal: ctrl.signal });
    const text = await r.text();
    let json;
    try { json = JSON.parse(text); } catch { json = { _raw: text.slice(0, 500) }; }
    if (!r.ok) return { ok: false, status: r.status, json };
    return { ok: true, status: r.status, json };
  } catch (e) {
    return { ok: false, status: 0, json: { error: String(e && e.message || e) } };
  } finally {
    clearTimeout(t);
  }
}

function fmtDuration(sec) {
  sec = Math.round(sec);
  const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = sec % 60;
  return (h ? `${h}h ` : "") + (h || m ? `${m}m ` : "") + `${s}s`;
}

// ── Phase 1: submit ──
async function submitAll() {
  console.error(`\n── PHASE 1: SUBMIT (scope=${CFG.scope}, per-call limit=${CFG.submitLimit}) ──`);
  const batchIds = [];
  let totalSubmitted = 0;
  for (let pass = 1; ; pass++) {
    const res = await call({ action: "batch-submit", scope: CFG.scope, limit: CFG.submitLimit });
    if (!res.ok) {
      console.error(`  submit pass ${pass} FAILED (HTTP ${res.status}):`, JSON.stringify(res.json).slice(0, 400));
      // If some batches were created before the failure, keep them.
      for (const b of res.json?.created_so_far || []) batchIds.push(b.batch_id);
      break;
    }
    const { submitted, untagged_total, batches } = res.json;
    for (const b of batches || []) batchIds.push(b.batch_id);
    totalSubmitted += submitted || 0;
    console.error(`  pass ${pass}: submitted ${submitted} (untagged remaining before this pass: ${untagged_total}); batches this pass: ${(batches || []).map((b) => b.batch_id).join(", ") || "none"}`);
    if (!submitted || submitted === 0) break;
  }
  console.error(`  submit complete: ${totalSubmitted} listings across ${batchIds.length} batch(es).`);
  return batchIds;
}

// ── Phase 2: poll ──
async function pollUntilEnded() {
  console.error(`\n── PHASE 2: POLL (every ${CFG.pollSeconds}s, max ${CFG.maxPollMinutes}m) ──`);
  const startMs = Date.now();
  const deadline = startMs + CFG.maxPollMinutes * 60000;
  while (true) {
    const res = await call({ action: "batch-status" });
    if (!res.ok) {
      console.error(`  status FAILED (HTTP ${res.status}):`, JSON.stringify(res.json).slice(0, 300));
    } else {
      const batches = res.json.batches || [];
      const summary = batches.map((b) => {
        const c = b.request_counts || {};
        return `${b.batch_id}=${b.processing_status}(ok:${c.succeeded ?? "?"}/err:${c.errored ?? "?"}/proc:${c.processing ?? "?"})`;
      });
      const elapsed = (Date.now() - startMs) / 1000;
      console.error(`  [${fmtDuration(elapsed)}] ${batches.length} open batch(es): ${summary.join("  ") || "none"}`);
      const allEnded = batches.length === 0 || batches.every((b) => b.processing_status === "ended");
      if (allEnded) {
        console.error("  all batches ended.");
        return { timedOut: false, openBatches: batches.map((b) => b.batch_id) };
      }
    }
    if (Date.now() >= deadline) {
      const res2 = await call({ action: "batch-status" });
      const open = (res2.json?.batches || []).filter((b) => b.processing_status !== "ended").map((b) => b.batch_id);
      console.error(`  poll timeout after ${CFG.maxPollMinutes}m. Still-processing batch ids: ${open.join(", ") || "none"}`);
      return { timedOut: true, openBatches: open };
    }
    await sleep(CFG.pollSeconds * 1000);
  }
}

// ── Phase 3: ingest ──
async function ingestAll() {
  console.error(`\n── PHASE 3: INGEST (per-call limit=${CFG.ingestLimit}) ──`);
  let totalIngested = 0, totalFailed = 0, calls = 0;
  while (true) {
    const res = await call({ action: "batch-ingest", limit: CFG.ingestLimit });
    calls++;
    if (!res.ok) {
      console.error(`  ingest FAILED (HTTP ${res.status}):`, JSON.stringify(res.json).slice(0, 300));
      break;
    }
    const { ingested = 0, failed = 0, remaining = 0, batch_id, message } = res.json;
    if (message && message.includes("No ended batch")) {
      console.error("  no more ended batches to ingest.");
      break;
    }
    totalIngested += ingested;
    totalFailed += failed;
    console.error(`  call ${calls}: batch ${batch_id || "?"} ingested ${ingested}, failed ${failed}, remaining ${remaining}`);
    // Stop if a pass makes zero forward progress (only unparseable results left).
    if (ingested === 0 && remaining > 0) {
      console.error(`  no progress with ${remaining} remaining on batch ${batch_id} — likely unparseable results. Stopping.`);
      break;
    }
    if (ingested === 0 && remaining === 0) {
      // this batch fully done; loop picks up the next ended batch or exits
      continue;
    }
  }
  console.error(`  ingest complete: ${totalIngested} ingested, ${totalFailed} failed across ${calls} call(s).`);
  return { totalIngested, totalFailed };
}

async function dryRun() {
  // Use batch-submit's own scope counter without submitting? No — batch-submit
  // submits. Instead call stats + report scope via a zero-effect probe: we call
  // batch-status (harmless) and print the trimmed-scope estimate from the sibling
  // realtime driver. Simplest: just report the function 'stats' plus a note.
  console.error(`── DRY RUN (scope=${CFG.scope}) ──`);
  const res = await call({ action: "stats" });
  if (res.ok) {
    console.error(`  cma_feature_tags total tagged: ${res.json.total_tagged}`);
    console.error(`  total Closed listings: ${res.json.total_closed_listings}`);
  }
  console.error("  For exact untagged trimmed-scope count use:");
  console.error("    node scripts/cma-backfill-tags.mjs --scope trimmed --dry-run");
  console.error(`  Estimated batch cost at $${CFG.costPerListing}/listing applies to whatever remains.`);
}

async function main() {
  console.error(`CMA batch backfill driver — scope=${CFG.scope}`);
  if (CFG.dryRun) return dryRun();

  const startMs = Date.now();

  if (!CFG.ingestOnly) {
    await submitAll();
    if (CFG.submitOnly) {
      console.error("\n--submit-only: stopping after submit. Run again with --ingest-only once batches end.");
      return;
    }
    const poll = await pollUntilEnded();
    if (poll.timedOut) {
      console.error("\nStopping gracefully — batches still processing. Re-run with --ingest-only later to ingest:");
      console.error(`  still-open: ${poll.openBatches.join(", ")}`);
      return;
    }
  }

  const { totalIngested, totalFailed } = await ingestAll();

  const elapsed = (Date.now() - startMs) / 1000;
  console.error("\n── SUMMARY ──");
  console.error(`Ingested: ${totalIngested}   Failed: ${totalFailed}`);
  console.error(`Elapsed: ${fmtDuration(elapsed)}`);
}

main().catch((e) => { console.error("FATAL:", e); process.exit(1); });
