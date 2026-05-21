// MLS Grid Replication Edge Function
// Handles initial import and incremental sync for all 4 resource types:
// Property, Member, Office, OpenHouse
//
// Deploy: supabase functions deploy mls-sync
// Invoke: POST /functions/v1/mls-sync { "action": "sync" | "initial-import", "resource": "Property", "limit": 500 }
// Schedule: Set up a cron via pg_cron or external scheduler every 15 minutes

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { computeAddressGroupKey, computeQualityScore } from "../_shared/dedup.ts";

// ── Configuration ──────────────────────────────────────────────
const MLS_GRID_API = "https://api.mlsgrid.com/v2";
const ORIGINATING_SYSTEM_NAME = Deno.env.get("MLS_GRID_ORIGINATING_SYSTEM") || "";
const MLS_GRID_TOKEN = Deno.env.get("MLS_GRID_TOKEN") || "";
const MLS_LOCAL_PREFIX = Deno.env.get("MLS_LOCAL_PREFIX") || "";
const R2_WORKER_URL = Deno.env.get("R2_WORKER_URL") || "";
const R2_WORKER_SECRET = Deno.env.get("R2_WORKER_SECRET") || "";
const R2_PUBLIC_URL = Deno.env.get("R2_PUBLIC_URL") || "";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
const SUPABASE_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";

// MLS Grid rate limits — official guidance from Best Practices Guide §9:
// "DO NOT send more than 2 requests per second." Both warning emails we got
// quoted this exact "2 requests per second limit" line. The 4 RPS / 6 RPS
// thresholds in the warning email are the operational tripwires MLS Grid
// measures; the documented ceiling is 2 RPS.
//
// Other hard caps:
//   - Warning:    7,200 req/hr / 40,000 req/24h / 3,072 MB/hr / 40 GB/24h
//   - Suspension: 18,000 req/hr / 60,000 req/24h / 4,096 MB/hr / 60 GB/24h
//
// Both api.mlsgrid.com (OData) and media.mlsgrid.com (photo URLs) count
// toward the same RPS budget, so the photo-download loops below need their
// own delay. Best Practice §7 also forbids parallel replication requests, so
// NEVER run two crons firing the same action concurrently — sequential only.
const REQUEST_DELAY_MS = 1200;          // OData page-to-page (~0.83 RPS)
const MEDIA_DOWNLOAD_DELAY_MS = 600;    // Photo-to-photo (~1.67 RPS, under the 2 RPS ceiling)

// ── Global rate limiter ──────────────────────────────────────────
// Per-loop sleep() calls weren't enough. MLS Grid measures peak RPS on
// 1-second sliding windows and we kept tripping 4 RPS at two seams:
//   (1) sync-full iterates Property → Member → Office → OpenHouse with no
//       delay between resources (~120-300ms gaps, 4 calls in 645ms).
//   (2) backfill-media's OData call → first photo download has no throttle
//       between them (~300-450ms gaps).
// This module-level timestamp + mustWait() helper guarantees AT LEAST
// MLS_GRID_MIN_GAP_MS between ANY two calls to api.mlsgrid.com or
// media.mlsgrid.com, regardless of which function or action initiated them.
// 750ms = 1.33 RPS sustained, comfortably under the 2 RPS guidance.
const MLS_GRID_MIN_GAP_MS = 750;
let _lastMlsGridCallAt = 0;
async function mustWaitMlsGrid(): Promise<void> {
  const elapsed = Date.now() - _lastMlsGridCallAt;
  if (elapsed < MLS_GRID_MIN_GAP_MS) {
    await new Promise((r) => setTimeout(r, MLS_GRID_MIN_GAP_MS - elapsed));
  }
  _lastMlsGridCallAt = Date.now();
}

// Max records per OData page
const PAGE_SIZE = 200;

// Default max records per invocation (Supabase Edge Functions have time limits)
// For initial import, run multiple invocations; each picks up where the last left off
const DEFAULT_MAX_RECORDS = 500;

// Geographic filter — only store listings from these WNC counties
// Note: MLS Grid replication API only allows filtering on: MlgCanView, ModificationTimestamp,
// OriginatingSystemName, StandardStatus, ListingId, PropertyType, ListOfficeMlsId
// So we filter CountyOrParish SERVER-SIDE after receiving records (not in the OData $filter)
const WNC_COUNTIES = new Set([
  "Haywood", "Jackson", "Swain", "Macon", "Buncombe",
  "Henderson", "Transylvania", "Graham"
]);

// ── R2 Worker Proxy ──────────────────────────────────────────
function r2Available(): boolean {
  return !!(R2_WORKER_URL && R2_WORKER_SECRET);
}

// ── Single-flight lock for MLS Grid Best Practice §7 ─────────
// "DO NOT send more than one replication request at a time."
// Three crons hit api.mlsgrid.com (sync-properties, sync-full, backfill-
// media) and they overlap during the same minute (e.g. :35 sync-full +
// :36 backfill-media). Combined burst exceeds 2 RPS. This lock forces
// sequential execution across cron invocations: only ONE mls-sync action
// can hold it at a time. Stale locks auto-expire after 5 min so a crashed
// invocation doesn't wedge the system.
const LOCK_RESOURCE = "_mls_grid_lock";
const LOCK_STALE_MS = 5 * 60 * 1000;

async function tryAcquireMlsGridLock(supabase: any, action: string): Promise<boolean> {
  const now = new Date().toISOString();
  // Two-step acquire pattern. We tried .or('status.eq.idle,last_sync_at.lt.X')
  // first but PostgREST's OR filter does not match through Supabase JS the way
  // raw SQL does (suspect: dot-delimited ISO ms in the value confuses the
  // PostgREST URL parser). Two simple UPDATEs are clearer anyway:
  //   1. Common case: take the lock if currently idle.
  //   2. Fallback: take over a stale lock (>5 min, previous run crashed).
  // Both UPDATEs use row-level locks in Postgres so concurrent callers are
  // serialized — exactly one returns a row from either step.
  const { data: idleData, error: idleErr } = await supabase
    .from("mls_sync_state")
    .update({ status: "running", last_sync_at: now, error_message: `held by ${action}` })
    .eq("resource_type", LOCK_RESOURCE)
    .eq("status", "idle")
    .select("resource_type");
  if (idleErr) {
    console.warn(`[Lock] idle-acquire error: ${idleErr.message}`);
    return false;
  }
  if (Array.isArray(idleData) && idleData.length > 0) return true;

  // Stale takeover. Strip milliseconds so the timestamp comparison doesn't
  // collide with PostgREST's dot delimiter (precaution, not strictly needed
  // for .lt() but consistent).
  const staleBefore = new Date(Date.now() - LOCK_STALE_MS)
    .toISOString()
    .replace(/\.\d{3}Z$/, "Z");
  const { data: staleData, error: staleErr } = await supabase
    .from("mls_sync_state")
    .update({ status: "running", last_sync_at: now, error_message: `held by ${action} (stale takeover)` })
    .eq("resource_type", LOCK_RESOURCE)
    .eq("status", "running")
    .lt("last_sync_at", staleBefore)
    .select("resource_type");
  if (staleErr) {
    console.warn(`[Lock] stale-takeover error: ${staleErr.message}`);
    return false;
  }
  return Array.isArray(staleData) && staleData.length > 0;
}

async function releaseMlsGridLock(supabase: any) {
  try {
    await supabase
      .from("mls_sync_state")
      .update({ status: "idle", last_sync_at: new Date().toISOString(), error_message: "" })
      .eq("resource_type", LOCK_RESOURCE);
  } catch (err) {
    console.warn("[Lock] release error:", err);
  }
}

function lockedSkipResponse(action: string) {
  return new Response(JSON.stringify({
    ok: true, action, skipped: "locked",
    reason: "Another mls-sync invocation holds the MLS Grid lock. Try again next cron tick.",
  }), {
    headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
  });
}

// ── Helpers ────────────────────────────────────────────────────
function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

// Normalize timestamp for OData filter compatibility
// PostgreSQL returns "2025-10-10 16:55:06.668+00" but OData needs "2025-10-10T16:55:06.668Z"
function normalizeTimestamp(ts: string): string {
  if (!ts) return ts;
  return ts
    .replace(" ", "T")              // space → T separator
    .replace(/\+00:00$/, "Z")       // +00:00 → Z
    .replace(/\+00$/, "Z");         // +00 → Z
}

// Strip MLS local field prefixes from key field values before storage/display
function stripPrefix(value: string | null | undefined): string {
  if (!value || !MLS_LOCAL_PREFIX) return value || "";
  return value.startsWith(MLS_LOCAL_PREFIX)
    ? value.slice(MLS_LOCAL_PREFIX.length)
    : value;
}

// Module-scoped audit-log handle. Set once per request at the top of the
// Deno.serve handler so every mlsGridFetch / uploadMediaToR2 call can write.
let _auditSupabase: any = null;
let _auditCaller = "mls-sync:unknown";
function setMlsGridAudit(supabase: any, caller: string) {
  _auditSupabase = supabase;
  _auditCaller = caller;
}
async function logMlsGridCall(row: {
  endpoint: string; url: string; status_code: number | null;
  duration_ms: number; response_bytes: number | null; error_message: string | null;
}) {
  if (!_auditSupabase) return;
  try {
    await _auditSupabase.from("mls_grid_api_log").insert({
      caller: _auditCaller,
      endpoint: row.endpoint,
      url: row.url,
      status_code: row.status_code,
      duration_ms: row.duration_ms,
      response_bytes: row.response_bytes,
      error_message: row.error_message,
    });
  } catch (_) {
    // Audit log failure must NEVER break the sync.
  }
}

async function mlsGridFetch(url: string, timeoutMs = 25000): Promise<any> {
  // Global throttle — ensures ≥750ms gap from the prior MLS Grid call,
  // whether it was an OData fetch, a photo download, or a call made by
  // another action in the same invocation. See MLS_GRID_MIN_GAP_MS.
  await mustWaitMlsGrid();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const t0 = Date.now();
  let statusCode: number | null = null;
  let respBytes: number | null = null;
  let errMsg: string | null = null;
  try {
    const resp = await fetch(url, {
      headers: {
        Authorization: `Bearer ${MLS_GRID_TOKEN}`,
        "Accept-Encoding": "gzip,deflate",
        Accept: "application/json",
      },
      signal: controller.signal,
    });
    statusCode = resp.status;
    if (!resp.ok) {
      const text = await resp.text();
      respBytes = text.length;
      errMsg = `MLS Grid API ${resp.status}: ${text.slice(0, 200)}`;
      throw new Error(errMsg);
    }
    const json = await resp.json();
    respBytes = JSON.stringify(json).length;
    return json;
  } catch (e: any) {
    if (!errMsg) errMsg = e.message || String(e);
    throw e;
  } finally {
    clearTimeout(timer);
    await logMlsGridCall({
      endpoint: "api.mlsgrid.com",
      url,
      status_code: statusCode,
      duration_ms: Date.now() - t0,
      response_bytes: respBytes,
      error_message: errMsg,
    });
  }
}

// Download image and upload to Cloudflare R2 via Worker proxy
// Create SEO-friendly slug from address: "14 Winter Woods Drive" + "Asheville" + "NC" → "14-winter-woods-drive-asheville-nc"
function addressSlug(streetNumber: string, streetName: string, streetSuffix: string, city: string, state: string): string {
  const parts = [streetNumber, streetName, streetSuffix, city, state || "nc"]
    .filter(Boolean)
    .join(" ")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return parts || "property";
}

async function uploadMediaToR2(
  mediaUrl: string,
  listingId: string,
  order: number,
  slug?: string
): Promise<string> {
  if (!r2Available()) return "";
  // Global throttle — same shared timestamp as mlsGridFetch so an OData
  // call followed immediately by a photo download still respects ≥750ms.
  await mustWaitMlsGrid();
  const t0 = Date.now();
  let statusCode: number | null = null;
  let errMsg: string | null = null;
  try {
    // MLS Grid docs (v2.0): "ALL requests to download the expanded media
    // using the Media URL MUST include the HTTP header User-Agent. The
    // User-Agent value MUST be the Oauth 2 access token you are provided
    // by MLS Grid." Enforcement begins June 1, 2026.
    const resp = await fetch(mediaUrl, {
      headers: { "User-Agent": MLS_GRID_TOKEN },
    });
    statusCode = resp.status;
    if (!resp.ok) {
      errMsg = `media fetch ${resp.status}`;
      await logMlsGridCall({
        endpoint: "media.mlsgrid.com", url: mediaUrl,
        status_code: statusCode, duration_ms: Date.now() - t0,
        response_bytes: null, error_message: errMsg,
      });
      return "";
    }
    const contentType = resp.headers.get("content-type") || "image/jpeg";
    const ext = contentType.includes("png") ? "png" : "jpg";
    // SEO-friendly path: listings/14-winter-woods-drive-asheville-nc/photo-1.jpg
    // Falls back to listings/CAR4363291/0.jpg if no slug
    const folder = slug || listingId;
    const fileName = slug ? `photo-${order + 1}` : String(order);
    const key = `listings/${folder}/${fileName}.${ext}`;
    const uploadResp = await fetch(`${R2_WORKER_URL}/${key}`, {
      method: "PUT",
      headers: {
        "Authorization": `Bearer ${R2_WORKER_SECRET}`,
        "Content-Type": contentType,
      },
      body: resp.body,
    });
    if (uploadResp.ok) {
      await logMlsGridCall({
        endpoint: "media.mlsgrid.com", url: mediaUrl,
        status_code: statusCode, duration_ms: Date.now() - t0,
        response_bytes: parseInt(resp.headers.get("content-length") || "0", 10) || null,
        error_message: null,
      });
      return R2_PUBLIC_URL ? `${R2_PUBLIC_URL}/${key}` : key;
    }
    console.warn(`[R2] Upload failed for ${key}: ${uploadResp.status}`);
    errMsg = `R2 upload ${uploadResp.status}`;
    await logMlsGridCall({
      endpoint: "media.mlsgrid.com", url: mediaUrl,
      status_code: statusCode, duration_ms: Date.now() - t0,
      response_bytes: null, error_message: errMsg,
    });
    return "";
  } catch (err) {
    console.warn(`[R2] Upload error for ${listingId}/${order}:`, String(err));
    await logMlsGridCall({
      endpoint: "media.mlsgrid.com", url: mediaUrl,
      status_code: statusCode, duration_ms: Date.now() - t0,
      response_bytes: null, error_message: String(err).slice(0, 200),
    });
    return "";
  }
}

// Delete all R2 objects for a listing (cleanup when MlgCanView goes false)
async function deleteR2Folder(listingId: string): Promise<void> {
  if (!r2Available() || !listingId) return;
  try {
    const prefix = `listings/${listingId}/`;
    const listResp = await fetch(`${R2_WORKER_URL}/${prefix}?prefix=${encodeURIComponent(prefix)}`, {
      method: "GET",
      headers: { "Authorization": `Bearer ${R2_WORKER_SECRET}` },
    });
    if (!listResp.ok) return;
    const { keys } = await listResp.json() as { keys: string[] };
    for (const k of keys) {
      await fetch(`${R2_WORKER_URL}/${k}`, {
        method: "DELETE",
        headers: { "Authorization": `Bearer ${R2_WORKER_SECRET}` },
      });
    }
    if (keys.length > 0) {
      console.log(`[R2] Deleted ${keys.length} objects for listing ${listingId}`);
    }
  } catch (err) {
    console.warn(`[R2] Cleanup error for ${listingId}:`, err);
  }
}

// ── Property Sync ──────────────────────────────────────────────
async function syncProperties(
  supabase: any,
  isInitial: boolean,
  lastTimestamp: string | null,
  maxRecords: number = DEFAULT_MAX_RECORDS
) {
  // MLS Grid replication only allows: OriginatingSystemName, MlgCanView, ModificationTimestamp,
  // StandardStatus, ListingId, PropertyType (eq only, no 'ne'), ListOfficeMlsId
  // PropertyType and CountyOrParish filtering done server-side after receiving records
  let url: string;
  const baseFilter = `OriginatingSystemName eq '${ORIGINATING_SYSTEM_NAME}'`;
  const tsFilter = lastTimestamp ? ` and ModificationTimestamp gt ${normalizeTimestamp(lastTimestamp)}` : "";
  if (isInitial) {
    // Initial import: only Active listings + resume from saved timestamp if any
    url = `${MLS_GRID_API}/Property?$filter=${baseFilter} and MlgCanView eq true and StandardStatus eq 'Active'${tsFilter}&$expand=Media&$top=${PAGE_SIZE}`;
  } else {
    // Incremental sync: get ALL changes (including status transitions) since last sync
    url = `${MLS_GRID_API}/Property?$filter=${baseFilter}${tsFilter}&$expand=Media&$top=${PAGE_SIZE}`;
  }

  let totalSynced = 0;
  let greatestTimestamp = lastTimestamp || "";

  while (url && totalSynced < maxRecords) {
    const data = await mlsGridFetch(url);
    const records = data.value || [];

    console.log(`[MLS Grid] Property page: ${records.length} records`);

    for (const record of records) {
      if (totalSynced >= maxRecords) break;

      const listingKey = record.ListingKey || "";
      const listingId = stripPrefix(record.ListingId || "");
      const modTs = record.ModificationTimestamp || "";

      // Canopy MLS Compliance gates (verified against live data 2026-04-24).
      //   Rule 8 — MlgCanView=false, InternetEntireListingDisplayYN=false,
      //            or MlgCanUse missing "IDX" ⇒ not IDX-displayable.
      //   Rule 7 — InternetAddressDisplayYN=false ⇒ mask address / coords.
      const canView = record.MlgCanView !== false;
      const sellerAllowsInternetDisplay = record.InternetEntireListingDisplayYN !== false;
      const mlgCanUse: string[] = Array.isArray(record.MlgCanUse) ? record.MlgCanUse : [];
      // Empty/missing MlgCanUse defaults to allowed (common for sync feeds that
      // don't project the field). Only block when we have an explicit array that
      // omits "IDX".
      const idxAllowed = mlgCanUse.length === 0 || mlgCanUse.includes("IDX");
      const idxDisplayable = canView && sellerAllowsInternetDisplay && idxAllowed;
      const sellerAllowsAddressDisplay = record.InternetAddressDisplayYN !== false;

      if (modTs > greatestTimestamp) greatestTimestamp = modTs;

      // Server-side filters (MLS Grid replication API has limited $filter support)
      // 1. Geographic — only store WNC county listings (skip if county is empty or not in our list)
      const county = record.CountyOrParish || "";
      if (!county || !WNC_COUNTIES.has(county)) {
        continue; // Skip non-WNC listings (including those with no county set)
      }
      // 2. Exclude rentals
      if ((record.PropertyType || "") === "Residential Lease") {
        continue;
      }

      if (!idxDisplayable) {
        // Not IDX-displayable (MlgCanView false, seller opted out of internet
        // display, or MlgCanUse lacks "IDX").
        // Soft-delete: set mlg_can_view=false but RETAIN listing data for CMA back-office use
        // Clean up R2 photos (not needed for public display; CMA uses DB data)
        await deleteR2Folder(listingId);
        const { data: existingRow } = await supabase
          .from("mls_listings")
          .select("listing_key")
          .eq("listing_key", listingKey)
          .maybeSingle();
        if (existingRow) {
          await supabase
            .from("mls_listings")
            .update({
              mlg_can_view: false,
              internet_entire_listing_display_yn: sellerAllowsInternetDisplay,
              mlg_can_use: mlgCanUse.length ? mlgCanUse : ["IDX"],
              updated_at: new Date().toISOString(),
            })
            .eq("listing_key", listingKey);
        }
        totalSynced++;
        continue;
      }

      // Rule 7: mask address fields when the seller opted out of address display.
      // full_address is a GENERATED column off street_* / unit_number, so
      // blanking the source columns masks the derived value automatically.
      const streetNumber = sellerAllowsAddressDisplay ? (record.StreetNumber || "") : "";
      const streetName = sellerAllowsAddressDisplay ? (record.StreetName || "") : "";
      const streetSuffix = sellerAllowsAddressDisplay ? (record.StreetSuffix || "") : "";
      const unitNumber = sellerAllowsAddressDisplay ? (record.UnitNumber || "") : "";
      const latitude = sellerAllowsAddressDisplay ? (record.Latitude || null) : null;
      const longitude = sellerAllowsAddressDisplay ? (record.Longitude || null) : null;

      // Map RESO Data Dictionary fields
      const listing: Record<string, any> = {
        listing_id: listingId,
        listing_key: listingKey,
        originating_system_name: ORIGINATING_SYSTEM_NAME,
        modification_timestamp: modTs,
        standard_status: record.StandardStatus || "Active",
        mlg_can_view: canView,
        internet_entire_listing_display_yn: sellerAllowsInternetDisplay,
        internet_address_display_yn: sellerAllowsAddressDisplay,
        mlg_can_use: mlgCanUse.length ? mlgCanUse : ["IDX"],
        feed_type: "IDX", // MLS Grid listings default to IDX
        list_price: record.ListPrice || null,
        close_price: record.ClosePrice || null,
        original_list_price: record.OriginalListPrice || null,
        street_number: streetNumber,
        street_name: streetName,
        street_suffix: streetSuffix,
        unit_number: unitNumber,
        city: record.City || "",
        state_or_province: record.StateOrProvince || "NC",
        postal_code: record.PostalCode || "",
        county_or_parish: record.CountyOrParish || "",
        property_type: record.PropertyType || "",
        property_sub_type: record.PropertySubType || "",
        bedrooms_total: record.BedroomsTotal || 0,
        bathrooms_total_integer: record.BathroomsTotalInteger || 0,
        bathrooms_half: record.BathroomsHalf || 0,
        living_area: record.LivingArea || record.AboveGradeFinishedArea || record.BuildingAreaTotal || null,
        living_area_range: record.LivingAreaRange || "",
        living_area_units: record.LivingAreaUnits || "Square Feet",
        lot_size_acres: record.LotSizeAcres || (record.LotSizeUnits === "Acres" && record.LotSizeArea ? record.LotSizeArea : null) || (record.LotSizeSquareFeet ? record.LotSizeSquareFeet / 43560 : null),
        lot_size_square_feet: record.LotSizeSquareFeet || (record.LotSizeUnits === "Acres" && record.LotSizeArea ? record.LotSizeArea * 43560 : null),
        year_built: record.YearBuilt || null,
        stories: record.Stories || null,
        garage_spaces: record.GarageSpaces || 0,
        parking_total: record.ParkingTotal || 0,
        public_remarks: record.PublicRemarks || "",
        private_remarks: record.PrivateRemarks || "",
        showing_instructions: record.ShowingInstructions || "",
        directions: record.Directions || "",
        list_agent_key: record.ListAgentKey || "",
        list_agent_full_name: record.ListAgentFullName || "",
        list_agent_email: record.ListAgentEmail || "",
        list_agent_phone: record.ListAgentDirectPhone || record.ListAgentOfficePhone || "",
        list_office_key: record.ListOfficeKey || "",
        list_office_name: record.ListOfficeName || "",
        list_office_phone: record.ListOfficePhone || "",
        attribution_contact: record.AttributionContact || "",
        buyer_agent_key: record.BuyerAgentKey || "",
        buyer_agent_full_name: record.BuyerAgentFullName || "",
        buyer_office_key: record.BuyerOfficeKey || "",
        buyer_office_name: record.BuyerOfficeName || "",
        list_date: record.ListingContractDate || null,
        close_date: record.CloseDate || null,
        expiration_date: record.ExpirationDate || null,
        days_on_market: record.DaysOnMarket || 0,
        cumulative_days_on_market: record.CumulativeDaysOnMarket || 0,
        latitude: latitude,
        longitude: longitude,
        association_fee: record.AssociationFee || null,
        association_fee_frequency: record.AssociationFeeFrequency || "",
        association_name: record.AssociationName || "",
        tax_annual_amount: record.TaxAnnualAmount || null,
        tax_year: record.TaxYear || null,
        heating: record.Heating || [],
        cooling: record.Cooling || [],
        interior_features: record.InteriorFeatures || [],
        exterior_features: record.ExteriorFeatures || [],
        appliances: record.Appliances || [],
        waterfront_features: record.WaterfrontFeatures || [],
        view: record.View || [],
        roof: record.Roof || [],
        flooring: record.Flooring || [],
        foundation_details: record.FoundationDetails || [],
        construction_materials: record.ConstructionMaterials || [],
        water_source: record.WaterSource || [],
        sewer: record.Sewer || [],
        electric: record.Electric || [],
        internet_whole_listing: record.InternetWholeListing || [],
        zoning: record.Zoning || "",
        restrictions: record.Restrictions || [],
        photos_change_timestamp: record.PhotosChangeTimestamp || null,
        raw_data: record,
        updated_at: new Date().toISOString(),
      };

      // ── Dedup fields ────────────────────────────────────────
      // See supabase/functions/_shared/dedup.ts. The trigger on mls_listings
      // uses these to elect exactly one winner per physical address across
      // CSAR and Canopy feeds. Only winners get R2 media storage.
      const mediaCountForScore = Array.isArray(record.Media) ? record.Media.length : 0;
      listing.address_group_key = computeAddressGroupKey(
        record.StreetNumber || "",
        record.StreetName || "",
        record.StreetSuffix || "",
        record.City || "",
      );
      listing.media_count = mediaCountForScore;
      listing.quality_score = computeQualityScore({
        mediaCount: mediaCountForScore,
        livingArea: listing.living_area,
        latitude: listing.latitude,
        longitude: listing.longitude,
        publicRemarks: listing.public_remarks,
        yearBuilt: listing.year_built,
        lotSizeAcres: listing.lot_size_acres,
      });

      // ── Price History Tracking ──
      const currentPrice = record.ListPrice || null;
      const currentStatus = record.StandardStatus || "Active";

      const { data: existing } = await supabase
        .from("mls_listings")
        .select("list_price, standard_status, full_address, city, photos_change_timestamp")
        .eq("listing_key", listingKey)
        .single();

      if (!existing) {
        // New listing — record LISTED event
        if (currentPrice) {
          await supabase.from("price_history").insert({
            listing_key: listingKey,
            price: currentPrice,
            event_type: "LISTED",
            source: "MLS",
            previous_price: null,
          });
        }
      } else {
        const prevPrice = existing.list_price;
        const prevStatus = existing.standard_status;

        // Detect price change
        if (prevPrice && currentPrice && currentPrice !== prevPrice) {
          await supabase.from("price_history").insert({
            listing_key: listingKey,
            price: currentPrice,
            event_type: "PRICE_CHANGE",
            source: "MLS",
            previous_price: prevPrice,
          });

          // ── Price Drop → Notify favoriting users via FUB ──
          if (currentPrice < prevPrice) {
            try {
              const propKey = ((existing.full_address || "") + "|" + (existing.city || "")).toLowerCase();
              const { data: favUsers } = await supabase
                .from("favorites")
                .select("user_id")
                .eq("property_key", propKey);

              if (favUsers && favUsers.length > 0) {
                const address = existing.full_address || `${record.StreetNumber || ""} ${record.StreetName || ""} ${record.StreetSuffix || ""}`.trim();
                const userIds = favUsers.map((f: { user_id: string }) => f.user_id);
                const { data: profiles } = await supabase
                  .from("profiles")
                  .select("id, email, first_name")
                  .in("id", userIds);

                const fmt = (n: number) => n.toLocaleString("en-US");
                for (const profile of (profiles || [])) {
                  // In-app notification
                  await supabase.from("alert_notifications").insert({
                    user_id: profile.id,
                    alert_type: "price_drop",
                    property_key: propKey,
                    title: "Price Drop: " + address,
                    message: "Price reduced from $" + fmt(prevPrice) + " to $" + fmt(currentPrice),
                  });
                  // Push to FUB
                  const fubUrl = Deno.env.get("SUPABASE_URL") + "/functions/v1/fub-push";
                  const fubKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
                  await fetch(fubUrl, {
                    method: "POST",
                    headers: { "Content-Type": "application/json", "Authorization": "Bearer " + fubKey },
                    body: JSON.stringify({
                      email: profile.email,
                      first_name: profile.first_name || "",
                      source: "price_drop",
                      message: "Price drop on favorited property: " + address +
                        " — $" + fmt(prevPrice) + " → $" + fmt(currentPrice),
                    }),
                  }).catch((err: unknown) => console.warn("[Price Drop FUB] Push failed:", err));
                }
                console.log(`[MLS Grid] Price drop alerts sent for ${address} to ${(profiles || []).length} users`);
              }
            } catch (err) {
              console.warn("[MLS Grid] Price drop notification error:", err);
            }
          }
        }

        // Detect status changes
        if (prevStatus !== currentStatus) {
          if (currentStatus === "Pending" || currentStatus === "Active Under Contract") {
            await supabase.from("price_history").insert({
              listing_key: listingKey,
              price: currentPrice,
              event_type: "PENDING",
              source: "MLS",
              previous_price: prevPrice,
            });
          } else if (currentStatus === "Closed") {
            await supabase.from("price_history").insert({
              listing_key: listingKey,
              price: record.ClosePrice || currentPrice,
              event_type: "SOLD",
              source: "MLS",
              previous_price: prevPrice,
            });
          } else if (prevStatus === "Pending" && currentStatus === "Active") {
            await supabase.from("price_history").insert({
              listing_key: listingKey,
              price: currentPrice,
              event_type: "BACK_ON_MARKET",
              source: "MLS",
              previous_price: prevPrice,
            });
          } else if (currentStatus === "Expired") {
            await supabase.from("price_history").insert({
              listing_key: listingKey,
              price: currentPrice,
              event_type: "EXPIRED",
              source: "MLS",
              previous_price: prevPrice,
            });
          } else if (currentStatus === "Withdrawn") {
            await supabase.from("price_history").insert({
              listing_key: listingKey,
              price: currentPrice,
              event_type: "WITHDRAWN",
              source: "MLS",
              previous_price: prevPrice,
            });
          }
        }
      }

      await supabase.from("mls_listings").upsert(listing, { onConflict: "listing_key" });

      // Handle media — only re-download when photos actually changed
      // PhotosChangeTimestamp signals that media files were updated (per MLS Grid docs)
      const media = record.Media || [];
      const newPhotosTs = record.PhotosChangeTimestamp || null;
      const photosChanged = !existing
        || !newPhotosTs
        || !existing.photos_change_timestamp
        || newPhotosTs !== existing.photos_change_timestamp;

      if (media.length > 0 && photosChanged) {
        // R2 uploads are NOT done inline here — they were too slow (1-2s each)
        // and caused the 150s edge function timeout to trip on large batches,
        // stalling the watermark. The backfill-media cron (every 2 min) fills
        // in local_url asynchronously for winners only.
        //
        // When photosChanged=true, local_url is intentionally cleared so the
        // backfill cron's "skip if all R2 URLs present" check does not short-
        // circuit a re-upload of stale photos. This creates a brief broken-
        // image window (up to ~2 min) for listings whose photos just changed.
        await supabase.from("mls_media").delete().eq("listing_key", listingKey);
        const mediaRows = [];
        for (let i = 0; i < media.length; i++) {
          const m = media[i];
          const mediaUrl = m.MediaURL || "";
          const order = m.Order || i;
          mediaRows.push({
            listing_key: listingKey,
            media_key: m.MediaKey || `${listingKey}-${i}`,
            media_url: mediaUrl,
            local_url: "",
            media_type: m.MimeType || "image/jpeg",
            media_category: m.MediaCategory || "Photo",
            short_description: m.ShortDescription || "",
            order: order,
            image_width: m.ImageWidth || null,
            image_height: m.ImageHeight || null,
            modification_timestamp: m.ModificationTimestamp || modTs,
          });
        }
        if (mediaRows.length > 0) {
          await supabase.from("mls_media").insert(mediaRows);
        }
      }

      totalSynced++;
    }

    // Follow @odata.nextLink for pagination
    url = data["@odata.nextLink"] || "";
    if (url && totalSynced < maxRecords) await sleep(REQUEST_DELAY_MS);
  }

  const hasMore = !!url && totalSynced >= maxRecords;
  return { totalSynced, greatestTimestamp, hasMore };
}

// ── Member Sync ────────────────────────────────────────────────
async function syncMembers(
  supabase: any,
  isInitial: boolean,
  lastTimestamp: string | null,
  maxRecords: number = DEFAULT_MAX_RECORDS
) {
  const mTsFilter = lastTimestamp ? ` and ModificationTimestamp gt ${normalizeTimestamp(lastTimestamp)}` : "";
  let url = `${MLS_GRID_API}/Member?$filter=OriginatingSystemName eq '${ORIGINATING_SYSTEM_NAME}' and MlgCanView eq true${mTsFilter}&$top=${PAGE_SIZE}`;

  let totalSynced = 0;
  let greatestTimestamp = lastTimestamp || "";

  while (url && totalSynced < maxRecords) {
    const data = await mlsGridFetch(url);
    const records = data.value || [];

    console.log(`[MLS Grid] Member page: ${records.length} records`);

    for (const r of records) {
      if (totalSynced >= maxRecords) break;

      const modTs = r.ModificationTimestamp || "";
      if (modTs > greatestTimestamp) greatestTimestamp = modTs;
      const canView = r.MlgCanView !== false;
      const key = r.MemberKey || "";

      if (!canView) {
        await supabase.from("mls_members").delete().eq("member_key", key);
      } else {
        await supabase.from("mls_members").upsert({
          member_key: key,
          member_mls_id: stripPrefix(r.MemberMlsId || ""),
          originating_system_name: ORIGINATING_SYSTEM_NAME,
          modification_timestamp: modTs,
          mlg_can_view: canView,
          member_full_name: r.MemberFullName || "",
          member_first_name: r.MemberFirstName || "",
          member_last_name: r.MemberLastName || "",
          member_email: r.MemberEmail || "",
          member_phone: r.MemberDirectPhone || r.MemberOfficePhone || "",
          member_mobile_phone: r.MemberMobilePhone || "",
          member_office_key: r.OfficeMlsId || r.OfficeKey || "",
          member_status: r.MemberStatus || "Active",
          raw_data: r,
          updated_at: new Date().toISOString(),
        }, { onConflict: "member_key" });
      }
      totalSynced++;
    }
    url = data["@odata.nextLink"] || "";
    if (url && totalSynced < maxRecords) await sleep(REQUEST_DELAY_MS);
  }

  const hasMore = !!url && totalSynced >= maxRecords;
  return { totalSynced, greatestTimestamp, hasMore };
}

// ── Office Sync ────────────────────────────────────────────────
async function syncOffices(
  supabase: any,
  isInitial: boolean,
  lastTimestamp: string | null,
  maxRecords: number = DEFAULT_MAX_RECORDS
) {
  const oTsFilter = lastTimestamp ? ` and ModificationTimestamp gt ${normalizeTimestamp(lastTimestamp)}` : "";
  let url = `${MLS_GRID_API}/Office?$filter=OriginatingSystemName eq '${ORIGINATING_SYSTEM_NAME}' and MlgCanView eq true${oTsFilter}&$top=${PAGE_SIZE}`;

  let totalSynced = 0;
  let greatestTimestamp = lastTimestamp || "";

  while (url && totalSynced < maxRecords) {
    const data = await mlsGridFetch(url);
    const records = data.value || [];

    console.log(`[MLS Grid] Office page: ${records.length} records`);

    for (const r of records) {
      if (totalSynced >= maxRecords) break;

      const modTs = r.ModificationTimestamp || "";
      if (modTs > greatestTimestamp) greatestTimestamp = modTs;
      const canView = r.MlgCanView !== false;
      const key = r.OfficeKey || "";

      if (!canView) {
        await supabase.from("mls_offices").delete().eq("office_key", key);
      } else {
        await supabase.from("mls_offices").upsert({
          office_key: key,
          office_mls_id: stripPrefix(r.OfficeMlsId || ""),
          originating_system_name: ORIGINATING_SYSTEM_NAME,
          modification_timestamp: modTs,
          mlg_can_view: canView,
          office_name: r.OfficeName || "",
          office_phone: r.OfficePhone || "",
          office_email: r.OfficeEmail || "",
          office_address: [r.OfficeAddress1, r.OfficeAddress2].filter(Boolean).join(", "),
          office_city: r.OfficeCity || "",
          office_state: r.OfficeStateOrProvince || "",
          office_postal_code: r.OfficePostalCode || "",
          office_status: r.OfficeStatus || "Active",
          raw_data: r,
          updated_at: new Date().toISOString(),
        }, { onConflict: "office_key" });
      }
      totalSynced++;
    }
    url = data["@odata.nextLink"] || "";
    if (url && totalSynced < maxRecords) await sleep(REQUEST_DELAY_MS);
  }

  const hasMore = !!url && totalSynced >= maxRecords;
  return { totalSynced, greatestTimestamp, hasMore };
}

// ── OpenHouse Sync ─────────────────────────────────────────────
async function syncOpenHouses(
  supabase: any,
  isInitial: boolean,
  lastTimestamp: string | null,
  maxRecords: number = DEFAULT_MAX_RECORDS
) {
  const ohTsFilter = lastTimestamp ? ` and ModificationTimestamp gt ${normalizeTimestamp(lastTimestamp)}` : "";
  let url = `${MLS_GRID_API}/OpenHouse?$filter=OriginatingSystemName eq '${ORIGINATING_SYSTEM_NAME}' and MlgCanView eq true${ohTsFilter}&$top=${PAGE_SIZE}`;

  let totalSynced = 0;
  let greatestTimestamp = lastTimestamp || "";

  while (url && totalSynced < maxRecords) {
    const data = await mlsGridFetch(url);
    const records = data.value || [];

    console.log(`[MLS Grid] OpenHouse page: ${records.length} records`);

    for (const r of records) {
      if (totalSynced >= maxRecords) break;

      const modTs = r.ModificationTimestamp || "";
      if (modTs > greatestTimestamp) greatestTimestamp = modTs;
      const canView = r.MlgCanView !== false;
      const key = r.OpenHouseKey || "";

      if (!canView) {
        await supabase.from("mls_open_houses").delete().eq("open_house_key", key);
      } else {
        await supabase.from("mls_open_houses").upsert({
          open_house_key: key,
          listing_key: r.ListingKey || null,
          listing_id: stripPrefix(r.ListingId || ""),
          originating_system_name: ORIGINATING_SYSTEM_NAME,
          modification_timestamp: modTs,
          mlg_can_view: canView,
          open_house_date: r.OpenHouseDate || null,
          open_house_start_time: r.OpenHouseStartTime || null,
          open_house_end_time: r.OpenHouseEndTime || null,
          open_house_remarks: r.OpenHouseRemarks || "",
          showing_agent_key: r.ShowingAgentKey || "",
          raw_data: r,
          updated_at: new Date().toISOString(),
        }, { onConflict: "open_house_key" });
      }
      totalSynced++;
    }
    url = data["@odata.nextLink"] || "";
    if (url && totalSynced < maxRecords) await sleep(REQUEST_DELAY_MS);
  }

  const hasMore = !!url && totalSynced >= maxRecords;
  return { totalSynced, greatestTimestamp, hasMore };
}

// ── Main Handler ───────────────────────────────────────────────
const SYNC_FNS: Record<string, Function> = {
  Property: syncProperties,
  Member: syncMembers,
  Office: syncOffices,
  OpenHouse: syncOpenHouses,
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, {
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Access-Control-Allow-Headers": "authorization, content-type",
      },
    });
  }

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "POST only" }), { status: 405 });
  }

  if (!MLS_GRID_TOKEN || !ORIGINATING_SYSTEM_NAME) {
    return new Response(
      JSON.stringify({ error: "Missing MLS_GRID_TOKEN or MLS_GRID_ORIGINATING_SYSTEM env vars" }),
      { status: 500 }
    );
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

  try {
    const body = await req.json();
    const action = body.action || "sync";
    const resource = body.resource || "all";
    const maxRecords = body.limit || DEFAULT_MAX_RECORDS;
    const isInitial = action === "initial-import";

    console.log(
      `[MLS Grid] Starting ${action} for resource: ${resource} (limit: ${maxRecords})`
    );

    // Bind the audit logger so every MLS Grid call below gets a row in
    // mls_grid_api_log tagged with which action initiated it.
    setMlsGridAudit(supabase, `mls-sync:${action}`);

    // Best Practice §7: only one replication request to MLS Grid at a time.
    // Three crons hit api.mlsgrid.com on different schedules and used to
    // overlap during the same minute, causing the 2 RPS guidance to break.
    // Gate every action that touches api.mlsgrid.com or media.mlsgrid.com
    // with a Postgres-side single-flight lock. If another invocation holds
    // it we exit immediately — the cron will retry on its next tick.
    const MLS_GRID_ACTIONS = new Set([
      "sync", "initial-import", "sync-one", "mini-backfill",
      "media-refresh", "backfill-media", "backfill-closed", "health",
    ]);
    const needsLock = MLS_GRID_ACTIONS.has(action);
    let lockHeld = false;
    if (needsLock) {
      lockHeld = await tryAcquireMlsGridLock(supabase, action);
      if (!lockHeld) {
        console.log(`[Lock] ${action} skipped — another mls-sync invocation holds the MLS Grid lock`);
        return lockedSkipResponse(action);
      }
    }

    try {

    // Quick health check: test MLS Grid API connectivity
    if (action === "health") {
      try {
        const testFilter = body.filter || `ListingId eq 'HEALTHCHECK'`;
        const testTop = body.top || 1;
        const expand = body.expand ? `&$expand=${body.expand}` : "";
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 15000);
        const testUrl = `${MLS_GRID_API}/Property?$filter=${testFilter}&$top=${testTop}${expand}`;
        console.log("[health] Testing URL:", testUrl);
        const resp = await fetch(testUrl, {
          headers: { Authorization: `Bearer ${MLS_GRID_TOKEN}`, "Accept-Encoding": "gzip,deflate", Accept: "application/json" },
          signal: controller.signal,
        });
        clearTimeout(timer);
        const text = await resp.text();
        return new Response(JSON.stringify({
          ok: true, action: "health",
          mls_grid_status: resp.status,
          mls_grid_response: text.slice(0, 500),
          response_length: text.length,
          token_present: !!MLS_GRID_TOKEN,
          system: ORIGINATING_SYSTEM_NAME,
          url: testUrl,
        }), {
          headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
        });
      } catch (e: any) {
        return new Response(JSON.stringify({
          ok: false, action: "health",
          error: e.message,
          token_present: !!MLS_GRID_TOKEN,
        }), {
          headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
        });
      }
    }

    // Targeted single-listing sync: fetch one record by ListingId and force
    // a full upsert + R2 photo re-upload. Used when the main watermark sync
    // is backed up and we need a specific listing refreshed immediately.
    if (action === "sync-one") {
      const listingIdIn = (body.listingId || "").trim();
      if (!listingIdIn) {
        return new Response(JSON.stringify({ error: "listingId required" }), {
          status: 400,
          headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
        });
      }
      const filter = `OriginatingSystemName eq '${ORIGINATING_SYSTEM_NAME}' and ListingId eq '${listingIdIn}'`;
      const url = `${MLS_GRID_API}/Property?$filter=${encodeURIComponent(filter)}&$expand=Media&$top=1`;
      const data = await mlsGridFetch(url);
      const record = (data.value || [])[0];
      if (!record) {
        return new Response(JSON.stringify({ ok: false, error: "listing not found in MLS Grid feed", listingId: listingIdIn }), {
          status: 404,
          headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
        });
      }

      const listingKey = record.ListingKey || "";
      const listingId = stripPrefix(record.ListingId || "");
      const modTs = record.ModificationTimestamp || "";
      const canView = record.MlgCanView !== false;
      const sellerAllowsInternetDisplay = record.InternetEntireListingDisplayYN !== false;
      const sellerAllowsAddressDisplay = record.InternetAddressDisplayYN !== false;
      const mlgCanUse: string[] = Array.isArray(record.MlgCanUse) ? record.MlgCanUse : [];
      const idxAllowed = mlgCanUse.length === 0 || mlgCanUse.includes("IDX");
      const county = record.CountyOrParish || "";

      if (!county || !WNC_COUNTIES.has(county)) {
        return new Response(JSON.stringify({ ok: false, error: "listing county not in WNC set", county }), {
          headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
        });
      }

      // Rule 7: mask address fields when the seller opted out of address display
      const streetNumber = sellerAllowsAddressDisplay ? (record.StreetNumber || "") : "";
      const streetName = sellerAllowsAddressDisplay ? (record.StreetName || "") : "";
      const streetSuffix = sellerAllowsAddressDisplay ? (record.StreetSuffix || "") : "";
      const unitNumber = sellerAllowsAddressDisplay ? (record.UnitNumber || "") : "";
      const latitude = sellerAllowsAddressDisplay ? (record.Latitude || null) : null;
      const longitude = sellerAllowsAddressDisplay ? (record.Longitude || null) : null;

      const mediaCountForScore = Array.isArray(record.Media) ? record.Media.length : 0;
      const listing: Record<string, any> = {
        listing_id: listingId,
        listing_key: listingKey,
        originating_system_name: ORIGINATING_SYSTEM_NAME,
        modification_timestamp: modTs,
        standard_status: record.StandardStatus || "Active",
        // Rule 8: if the seller opted out of internet display or MlgCanUse lacks
        // IDX, suppress from public display via mlg_can_view even when the
        // upstream MlgCanView is true.
        mlg_can_view: canView && sellerAllowsInternetDisplay && idxAllowed,
        internet_entire_listing_display_yn: sellerAllowsInternetDisplay,
        internet_address_display_yn: sellerAllowsAddressDisplay,
        mlg_can_use: mlgCanUse.length ? mlgCanUse : ["IDX"],
        feed_type: "IDX",
        list_price: record.ListPrice || null,
        close_price: record.ClosePrice || null,
        original_list_price: record.OriginalListPrice || null,
        street_number: streetNumber,
        street_name: streetName,
        street_suffix: streetSuffix,
        unit_number: unitNumber,
        city: record.City || "",
        state_or_province: record.StateOrProvince || "NC",
        postal_code: record.PostalCode || "",
        county_or_parish: county,
        property_type: record.PropertyType || "",
        property_sub_type: record.PropertySubType || "",
        bedrooms_total: record.BedroomsTotal || 0,
        bathrooms_total_integer: record.BathroomsTotalInteger || 0,
        bathrooms_half: record.BathroomsHalf || 0,
        living_area: record.LivingArea || record.AboveGradeFinishedArea || record.BuildingAreaTotal || null,
        living_area_range: record.LivingAreaRange || "",
        living_area_units: record.LivingAreaUnits || "Square Feet",
        lot_size_acres: record.LotSizeAcres || (record.LotSizeUnits === "Acres" && record.LotSizeArea ? record.LotSizeArea : null) || (record.LotSizeSquareFeet ? record.LotSizeSquareFeet / 43560 : null),
        lot_size_square_feet: record.LotSizeSquareFeet || (record.LotSizeUnits === "Acres" && record.LotSizeArea ? record.LotSizeArea * 43560 : null),
        year_built: record.YearBuilt || null,
        stories: record.Stories || null,
        garage_spaces: record.GarageSpaces || 0,
        parking_total: record.ParkingTotal || 0,
        public_remarks: record.PublicRemarks || "",
        private_remarks: record.PrivateRemarks || "",
        showing_instructions: record.ShowingInstructions || "",
        directions: record.Directions || "",
        list_agent_key: record.ListAgentKey || "",
        list_agent_full_name: record.ListAgentFullName || "",
        list_agent_email: record.ListAgentEmail || "",
        list_agent_phone: record.ListAgentDirectPhone || record.ListAgentOfficePhone || "",
        list_office_key: record.ListOfficeKey || "",
        list_office_name: record.ListOfficeName || "",
        list_office_phone: record.ListOfficePhone || "",
        attribution_contact: record.AttributionContact || "",
        buyer_agent_key: record.BuyerAgentKey || "",
        buyer_agent_full_name: record.BuyerAgentFullName || "",
        buyer_office_key: record.BuyerOfficeKey || "",
        buyer_office_name: record.BuyerOfficeName || "",
        list_date: record.ListingContractDate || null,
        close_date: record.CloseDate || null,
        expiration_date: record.ExpirationDate || null,
        days_on_market: record.DaysOnMarket || 0,
        cumulative_days_on_market: record.CumulativeDaysOnMarket || 0,
        latitude: latitude,
        longitude: longitude,
        association_fee: record.AssociationFee || null,
        association_fee_frequency: record.AssociationFeeFrequency || "",
        association_name: record.AssociationName || "",
        tax_annual_amount: record.TaxAnnualAmount || null,
        tax_year: record.TaxYear || null,
        heating: record.Heating || [],
        cooling: record.Cooling || [],
        interior_features: record.InteriorFeatures || [],
        exterior_features: record.ExteriorFeatures || [],
        appliances: record.Appliances || [],
        waterfront_features: record.WaterfrontFeatures || [],
        view: record.View || [],
        roof: record.Roof || [],
        flooring: record.Flooring || [],
        foundation_details: record.FoundationDetails || [],
        construction_materials: record.ConstructionMaterials || [],
        water_source: record.WaterSource || [],
        sewer: record.Sewer || [],
        electric: record.Electric || [],
        internet_whole_listing: record.InternetWholeListing || [],
        zoning: record.Zoning || "",
        restrictions: record.Restrictions || [],
        photos_change_timestamp: record.PhotosChangeTimestamp || null,
        raw_data: record,
        updated_at: new Date().toISOString(),
        address_group_key: computeAddressGroupKey(
          streetNumber,
          streetName,
          streetSuffix,
          record.City || "",
        ),
        media_count: mediaCountForScore,
        quality_score: computeQualityScore({
          mediaCount: mediaCountForScore,
          livingArea: record.LivingArea || record.AboveGradeFinishedArea || record.BuildingAreaTotal || null,
          latitude: latitude,
          longitude: longitude,
          publicRemarks: record.PublicRemarks || "",
          yearBuilt: record.YearBuilt || null,
          lotSizeAcres: record.LotSizeAcres || null,
        }),
      };

      await supabase.from("mls_listings").upsert(listing, { onConflict: "listing_key" });

      // Force-refresh media regardless of PhotosChangeTimestamp diff. If the
      // inline R2 upload fails (e.g. MLS Grid is rate-limiting), we still
      // write the deterministic R2 URL to local_url — if the R2 object
      // already exists from a previous upload the site keeps working, and
      // the backfill-media cron will overwrite it with fresh content later.
      const media = record.Media || [];
      const uploaded: number[] = [];
      const failed: number[] = [];
      if (media.length > 0) {
        await supabase.from("mls_media").delete().eq("listing_key", listingKey);
        const slug = addressSlug(record.StreetNumber || "", record.StreetName || "", record.StreetSuffix || "", record.City || "", record.StateOrProvince || "");
        const mediaRows = [];
        for (let i = 0; i < media.length; i++) {
          const m = media[i];
          const mediaUrl = m.MediaURL || "";
          const order = m.Order || i;
          // Throttle photo downloads to stay under MLS Grid's 4 RPS cap.
          if (i > 0) await sleep(MEDIA_DOWNLOAD_DELAY_MS);
          const uploadResult = await uploadMediaToR2(mediaUrl, listingId, i, slug);
          const deterministicUrl = R2_PUBLIC_URL
            ? `${R2_PUBLIC_URL}/listings/${slug || listingId}/photo-${i + 1}.jpg`
            : "";
          const localUrl = uploadResult || deterministicUrl;
          if (uploadResult) uploaded.push(order); else failed.push(order);
          mediaRows.push({
            listing_key: listingKey,
            media_key: m.MediaKey || `${listingKey}-${i}`,
            media_url: mediaUrl,
            local_url: localUrl,
            media_type: m.MimeType || "image/jpeg",
            media_category: m.MediaCategory || "Photo",
            short_description: m.ShortDescription || "",
            order: order,
            image_width: m.ImageWidth || null,
            image_height: m.ImageHeight || null,
            modification_timestamp: m.ModificationTimestamp || modTs,
          });
        }
        if (mediaRows.length > 0) {
          await supabase.from("mls_media").insert(mediaRows);
        }
      }

      return new Response(JSON.stringify({
        ok: true, action: "sync-one",
        listingId, listingKey,
        modTs, photosChangeTs: record.PhotosChangeTimestamp,
        mediaCount: media.length,
        r2Uploaded: uploaded.length,
        r2Failed: failed.length,
      }), {
        headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
      });
    }

    // Mini backfill: fetch one page of closed listings and upsert WNC ones
    if (action === "mini-backfill") {
      const steps: string[] = [];
      try {
        const cutoffMonths = body.cutoffMonths || 36;
        const cutoffDate = new Date();
        cutoffDate.setMonth(cutoffDate.getMonth() - cutoffMonths);
        const cutoffStr = cutoffDate.toISOString().split("T")[0];
        const resumeTs = body.lastTimestamp || "";
        const bfPageSize = body.pageSize || 200;
        steps.push("config: cutoff=" + cutoffStr + " resume=" + (resumeTs || "none") + " pageSize=" + bfPageSize);

        const baseFilter = `OriginatingSystemName eq '${ORIGINATING_SYSTEM_NAME}' and StandardStatus eq 'Closed'`;
        const tsFilter = resumeTs ? ` and ModificationTimestamp gt ${normalizeTimestamp(resumeTs)}` : "";
        const bfUrl = `${MLS_GRID_API}/Property?$filter=${baseFilter}${tsFilter}&$top=${bfPageSize}`;
        steps.push("fetching...");

        const data = await mlsGridFetch(bfUrl, 20000);
        const records = data.value || [];
        steps.push("fetched: " + records.length + " records");

        let synced = 0;
        let skippedCounty = 0;
        let skippedOld = 0;
        let skippedExisting = 0;
        let greatestTs = resumeTs;

        for (const record of records) {
          const listingKey = record.ListingKey || "";
          const modTs = record.ModificationTimestamp || "";
          if (modTs > greatestTs) greatestTs = modTs;

          const county = record.CountyOrParish || "";
          if (!county || !WNC_COUNTIES.has(county)) { skippedCounty++; continue; }
          if ((record.PropertyType || "") === "Residential Lease") continue;
          const closeDate = record.CloseDate || "";
          if (closeDate && closeDate < cutoffStr) { skippedOld++; continue; }

          const { data: existing } = await supabase
            .from("mls_listings")
            .select("listing_key")
            .eq("listing_key", listingKey)
            .maybeSingle();
          if (existing) { skippedExisting++; continue; }

          const listingId = stripPrefix(record.ListingId || "");
          // Compliance gates (Rules 7 & 8) — same logic as the primary sync path.
          const canView = record.MlgCanView !== false;
          const sellerAllowsInternetDisplay = record.InternetEntireListingDisplayYN !== false;
          const sellerAllowsAddressDisplay = record.InternetAddressDisplayYN !== false;
          const mlgCanUse: string[] = Array.isArray(record.MlgCanUse) ? record.MlgCanUse : [];
          const idxAllowed = mlgCanUse.length === 0 || mlgCanUse.includes("IDX");
          await supabase.from("mls_listings").upsert({
            listing_id: listingId,
            listing_key: listingKey,
            originating_system_name: ORIGINATING_SYSTEM_NAME,
            modification_timestamp: modTs,
            standard_status: record.StandardStatus || "Closed",
            mlg_can_view: canView && sellerAllowsInternetDisplay && idxAllowed,
            internet_entire_listing_display_yn: sellerAllowsInternetDisplay,
            internet_address_display_yn: sellerAllowsAddressDisplay,
            mlg_can_use: mlgCanUse.length ? mlgCanUse : ["IDX"],
            feed_type: "IDX",
            list_price: record.ListPrice || null,
            close_price: record.ClosePrice || null,
            original_list_price: record.OriginalListPrice || null,
            street_number: sellerAllowsAddressDisplay ? (record.StreetNumber || "") : "",
            street_name: sellerAllowsAddressDisplay ? (record.StreetName || "") : "",
            street_suffix: sellerAllowsAddressDisplay ? (record.StreetSuffix || "") : "",
            unit_number: sellerAllowsAddressDisplay ? (record.UnitNumber || "") : "",
            city: record.City || "",
            state_or_province: record.StateOrProvince || "NC",
            postal_code: record.PostalCode || "",
            county_or_parish: record.CountyOrParish || "",
            property_type: record.PropertyType || "",
            property_sub_type: record.PropertySubType || "",
            bedrooms_total: record.BedroomsTotal || 0,
            bathrooms_total_integer: record.BathroomsTotalInteger || 0,
            bathrooms_half: record.BathroomsHalf || 0,
            living_area: record.LivingArea || record.AboveGradeFinishedArea || record.BuildingAreaTotal || null,
            lot_size_acres: record.LotSizeAcres || null,
            lot_size_square_feet: record.LotSizeSquareFeet || null,
            year_built: record.YearBuilt || null,
            stories: record.Stories || null,
            garage_spaces: record.GarageSpaces || 0,
            public_remarks: record.PublicRemarks || "",
            list_agent_full_name: record.ListAgentFullName || "",
            list_office_name: record.ListOfficeName || "",
            buyer_agent_full_name: record.BuyerAgentFullName || "",
            buyer_office_name: record.BuyerOfficeName || "",
            list_date: record.ListingContractDate || null,
            close_date: record.CloseDate || null,
            days_on_market: record.DaysOnMarket || 0,
            latitude: sellerAllowsAddressDisplay ? (record.Latitude || null) : null,
            longitude: sellerAllowsAddressDisplay ? (record.Longitude || null) : null,
            tax_annual_amount: record.TaxAnnualAmount || null,
            raw_data: record,
            updated_at: new Date().toISOString(),
          }, { onConflict: "listing_key" });

          if (record.ClosePrice) {
            await supabase.from("price_history").insert({
              listing_key: listingKey,
              price: record.ClosePrice,
              event_type: "SOLD",
              source: "MLS",
              previous_price: record.ListPrice || null,
            }).then(() => {}).catch(() => {}); // ignore dups
          }
          synced++;
        }

        const nextLink = data["@odata.nextLink"] || "";
        // Save cursor
        await supabase.from("sync_cursors")
          .upsert({ key: "backfill-closed", value: greatestTs || "", updated_at: new Date().toISOString() });

        steps.push("synced=" + synced + " skippedCounty=" + skippedCounty + " skippedOld=" + skippedOld + " skippedExisting=" + skippedExisting);
        steps.push("greatestTs=" + greatestTs);
        steps.push("hasMore=" + !!nextLink);

        return new Response(JSON.stringify({
          ok: true, action: "mini-backfill", steps, synced, skippedCounty, skippedOld, skippedExisting,
          lastTimestamp: greatestTs, hasMore: !!nextLink
        }), {
          headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
        });
      } catch (e: any) {
        steps.push("error: " + e.message);
        return new Response(JSON.stringify({ ok: false, action: "mini-backfill", steps, error: e.message }), {
          headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
        });
      }
    }

    // ── Media refresh: re-fetch fresh signed URLs for all Canopy media ──
    // MLS Grid media URLs expire in ~24 hours. This action pages through
    // all Active Canopy properties, fetches fresh media URLs via $expand=Media,
    // and updates the mls_media table. Much faster than full re-import since
    // it skips listing upsert, price history, notifications, etc.
    //
    // Cursor paging: the sync_cursors table stores the last processed
    // ModificationTimestamp so that each cron invocation picks up where the
    // previous one left off. When all listings are processed, cursor is set
    // to 'DONE' so remaining invocations in the cycle are no-ops. A separate
    // cron resets the cursor to '' before each AM/PM cycle.
    if (action === "media-refresh") {
      // 1. Read cursor from DB (body.lastTimestamp overrides for manual calls)
      let resumeTs = body.lastTimestamp || null;
      if (!resumeTs) {
        const { data: cursorRow } = await supabase
          .from("sync_cursors")
          .select("value")
          .eq("key", "media-refresh")
          .single();
        const cursorVal = cursorRow?.value || "";
        if (cursorVal === "DONE") {
          console.log("[Media Refresh] Cycle already complete (cursor=DONE), skipping");
          return new Response(JSON.stringify({
            ok: true, action: "media-refresh", refreshed: 0,
            status: "cycle-complete", hasMore: false
          }), {
            headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
          });
        }
        resumeTs = cursorVal || null;
      }

      const baseFilter = `OriginatingSystemName eq '${ORIGINATING_SYSTEM_NAME}' and MlgCanView eq true and StandardStatus eq 'Active'`;
      const tsFilter = resumeTs ? ` and ModificationTimestamp gt ${normalizeTimestamp(resumeTs)}` : "";
      let url = `${MLS_GRID_API}/Property?$filter=${baseFilter}${tsFilter}&$expand=Media&$top=${PAGE_SIZE}`;
      let totalRefreshed = 0;
      let greatestTs = resumeTs || "";

      while (url && totalRefreshed < maxRecords) {
        const data = await mlsGridFetch(url);
        const records = data.value || [];
        console.log(`[Media Refresh] Page: ${records.length} records`);

        for (const record of records) {
          if (totalRefreshed >= maxRecords) break;
          const listingKey = record.ListingKey || "";
          const listingId = stripPrefix(record.ListingId || "");
          const modTs = record.ModificationTimestamp || "";
          if (modTs > greatestTs) greatestTs = modTs;

          // Server-side county + lease filter (same as syncProperties)
          const county = record.CountyOrParish || "";
          if (!county || !WNC_COUNTIES.has(county)) continue;
          if ((record.PropertyType || "") === "Residential Lease") continue;
          if (record.MlgCanView === false) continue;

          // Only update media — skip full listing upsert
          const media = record.Media || [];
          if (media.length > 0) {
            await supabase.from("mls_media").delete().eq("listing_key", listingKey);
            const mediaRows = [];
            for (let i = 0; i < media.length; i++) {
              const m = media[i];
              mediaRows.push({
                listing_key: listingKey,
                media_key: m.MediaKey || `${listingKey}-${i}`,
                media_url: m.MediaURL || "",
                local_url: "",
                media_type: m.MimeType || "image/jpeg",
                media_category: m.MediaCategory || "Photo",
                short_description: m.ShortDescription || "",
                order: m.Order || i,
                image_width: m.ImageWidth || null,
                image_height: m.ImageHeight || null,
                modification_timestamp: m.ModificationTimestamp || modTs,
              });
            }
            if (mediaRows.length > 0) {
              await supabase.from("mls_media").insert(mediaRows);
            }
          }
          totalRefreshed++;
        }
        url = data["@odata.nextLink"] || "";
        if (url && totalRefreshed < maxRecords) await sleep(REQUEST_DELAY_MS);
      }

      const hasMore = !!url && totalRefreshed >= maxRecords;

      // 2. Save cursor back to DB for the next cron invocation
      const cursorValue = hasMore ? greatestTs : "DONE";
      await supabase
        .from("sync_cursors")
        .upsert({ key: "media-refresh", value: cursorValue, updated_at: new Date().toISOString() });
      console.log(`[Media Refresh] Saved cursor: ${cursorValue} (refreshed ${totalRefreshed})`);

      return new Response(JSON.stringify({
        ok: true, action: "media-refresh",
        refreshed: totalRefreshed, lastTimestamp: greatestTs, hasMore
      }), {
        headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
      });
    }

    // ── Cleanup action: delete R2 photos for listings that lost winner status ──
    // When a cross-MLS dedup flip happens, the former winner is enqueued to
    // mls_media_cleanup_queue with a 24h grace period (to absorb transient
    // sync glitches). This action processes entries that have aged past the
    // grace period. Runs hourly via pg_cron.
    if (action === "cleanup-orphan-media") {
      const graceHours = typeof body.graceHours === "number" ? body.graceHours : 24;
      const limit = typeof body.limit === "number" ? body.limit : 50;

      // Fetch eligible queue rows (queued_at older than grace period).
      const cutoff = new Date(Date.now() - graceHours * 3600 * 1000).toISOString();
      const { data: queueRows, error: queueErr } = await supabase
        .from("mls_media_cleanup_queue")
        .select("listing_key, listing_id, reason, queued_at")
        .lt("queued_at", cutoff)
        .order("queued_at", { ascending: true })
        .limit(limit);

      if (queueErr) {
        return new Response(JSON.stringify({ ok: false, error: queueErr.message }), {
          status: 500,
          headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
        });
      }

      let deleted = 0;
      let skippedReclaimed = 0;
      let errors = 0;

      for (const row of (queueRows || [])) {
        // Double-check that the listing didn't reclaim winner status within
        // the grace window. If it did, drop the queue entry without touching
        // R2 — its photos are still needed.
        const { data: listingRow } = await supabase
          .from("mls_listings")
          .select("is_winner")
          .eq("listing_key", row.listing_key)
          .maybeSingle();

        if (listingRow?.is_winner === true) {
          await supabase
            .from("mls_media_cleanup_queue")
            .delete()
            .eq("listing_key", row.listing_key);
          skippedReclaimed++;
          continue;
        }

        // Delete R2 objects under this listing's folder, then clear local_url
        // on any mls_media rows so a future re-win triggers a fresh download.
        try {
          await deleteR2Folder(row.listing_id);
          await supabase
            .from("mls_media")
            .update({ local_url: "" })
            .eq("listing_key", row.listing_key)
            .neq("local_url", "");
          await supabase
            .from("mls_media_cleanup_queue")
            .delete()
            .eq("listing_key", row.listing_key);
          deleted++;
        } catch (err) {
          errors++;
          console.error(`[Cleanup] Failed for ${row.listing_key}:`, err);
        }
      }

      return new Response(JSON.stringify({
        ok: true,
        action: "cleanup-orphan-media",
        deleted,
        skippedReclaimed,
        errors,
        graceHours,
      }), {
        headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
      });
    }

    // ── Backfill action: download missing Canopy photos to R2 ──
    //
    // Previously this paged through all Active Canopy listings with
    // $expand=Media using a ModificationTimestamp cursor. Two problems:
    //
    //   1. Each $top=200 page returned ~2,600 MediaURL strings (200
    //      listings × ~13 photos). MLS Grid appears to count those
    //      issued MediaURLs against the request quota — at 4 invocations
    //      per hour that's ~10,400 MediaURLs/hour, roughly the 4 RPS
    //      hourly average their warning email reports. Our own audit
    //      shows only 12 HTTP requests/hr; the discrepancy is the
    //      MediaURL count inside expanded responses.
    //
    //   2. The cursor "gt last_ts" pattern only catches NEW changes.
    //      Listings whose initial photo upload failed sit with empty
    //      local_url at an OLD ModificationTimestamp and are never
    //      reprocessed. We had 2,523 such listings as of 5/16, and the
    //      cursor was happily walking past them returning r2Uploaded:0
    //      every cycle.
    //
    // New pattern: query the DB for listings that actually need photos,
    // then make ONE targeted MLS Grid call per listing (returns 1
    // Property × ~13 MediaURLs = ~13 issued URLs per call). At maxRecords
    // listings per invocation that's ~13 × N MediaURLs, dramatically
    // smaller than the previous ~2,600 per page. When nothing needs
    // backfill, the function makes zero MLS Grid calls and exits.
    if (action === "backfill-media") {
      const limit = maxRecords;

      // 1. DB query: which Active winner listings have at least one
      //    mls_media row with empty local_url? Use a CTE-style select via
      //    the PostgREST relationship syntax. We pull listing_key from
      //    mls_media where local_url='' and join to mls_listings for the
      //    winner/status filters. To keep it simple we run two queries.
      const { data: missingMedia, error: missingErr } = await supabase
        .from("mls_media")
        .select("listing_key, mls_listings!inner(listing_id, is_winner, originating_system_name, standard_status)")
        .eq("local_url", "")
        .eq("mls_listings.is_winner", true)
        .eq("mls_listings.originating_system_name", ORIGINATING_SYSTEM_NAME)
        .in("mls_listings.standard_status", ["Active", "Active Under Contract", "Pending"])
        .limit(limit * 20);  // overshoot so we can dedup per-listing
      if (missingErr) {
        console.warn(`[Backfill] missing-media query error: ${missingErr.message}`);
      }

      // Dedup to one entry per listing_key (a listing with 13 missing
      // photos shouldn't burn 13 spots in our limit).
      const seen = new Set<string>();
      const work: Array<{ listing_key: string; listing_id: string }> = [];
      for (const row of (missingMedia || []) as any[]) {
        if (work.length >= limit) break;
        if (seen.has(row.listing_key)) continue;
        seen.add(row.listing_key);
        const lid = row.mls_listings?.listing_id || "";
        work.push({ listing_key: row.listing_key, listing_id: lid });
      }

      if (work.length === 0) {
        console.log("[Backfill] No listings missing photos — exiting without touching MLS Grid");
        return new Response(JSON.stringify({
          ok: true, action: "backfill-media", processed: 0,
          r2Uploaded: 0, r2Failed: 0, mlsGridCalls: 0,
          status: "complete", hasMore: false,
        }), {
          headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
        });
      }

      let r2Uploaded = 0;
      let r2Failed = 0;
      let mlsGridCalls = 0;

      // 2. For each listing in the work list, targeted MLS Grid call.
      //    Each call returns exactly 1 Property record with its Media
      //    array (~13 MediaURLs). $top=1 minimizes scan on their side.
      for (let i = 0; i < work.length; i++) {
        const { listing_key: lk, listing_id: lid } = work[i];

        // Page-to-page throttle between sibling targeted calls.
        if (i > 0) await sleep(REQUEST_DELAY_MS);

        // ListingId in our DB is already stored exactly as MLS Grid serves
        // it (e.g. "CAR4354358") — the MLS_LOCAL_PREFIX env var ("CAR_")
        // is a SEPARATE convention that the sync's stripPrefix uses only
        // when the raw value happens to start with it. Don't try to
        // re-prefix here or you get "CAR_CAR4354358" and an empty result.
        const filter = `OriginatingSystemName eq '${ORIGINATING_SYSTEM_NAME}' and ListingId eq '${lid}'`;
        const turl = `${MLS_GRID_API}/Property?$filter=${encodeURIComponent(filter)}&$expand=Media&$top=1`;

        let record: any = null;
        try {
          const data = await mlsGridFetch(turl);
          mlsGridCalls++;
          record = (data.value || [])[0];
        } catch (err) {
          console.warn(`[Backfill] targeted fetch failed for ${lid}: ${err}`);
          continue;
        }
        if (!record) {
          // Listing no longer in MLS Grid feed (likely deleted upstream).
          // Mark the local rows as no-op so we stop trying.
          console.log(`[Backfill] ${lid}: not found in feed; skipping`);
          continue;
        }

        // Cross-MLS dedup check: if this listing isn't currently a winner
        // we shouldn't bother backfilling photos. (Could happen if winner
        // flipped after we queued this row.)
        const { data: winnerCheck } = await supabase
          .from("mls_listings")
          .select("is_winner")
          .eq("listing_key", lk)
          .maybeSingle();
        if (!winnerCheck?.is_winner) {
          console.log(`[Backfill] ${lid}: no longer winner; skipping`);
          continue;
        }

        const media: any[] = record.Media || [];
        if (media.length === 0) {
          // No media on this listing — clear any orphan empty rows.
          await supabase.from("mls_media").delete().eq("listing_key", lk).eq("local_url", "");
          continue;
        }

        // Look up what we already have in R2 for this listing.
        const { data: existingMedia } = await supabase
          .from("mls_media")
          .select("media_key, order, local_url")
          .eq("listing_key", lk);
        const existingByKey: Record<string, { local_url: string; order: number }> = {};
        (existingMedia || []).forEach((m: any) => {
          if (m.media_key) existingByKey[m.media_key] = { local_url: m.local_url || "", order: m.order };
        });

        const mTs = record.ModificationTimestamp || "";
        const bfSlug = addressSlug(
          record.StreetNumber || "", record.StreetName || "", record.StreetSuffix || "",
          record.City || "", record.StateOrProvince || "",
        );

        // Rebuild rows; reuse R2 URL when MediaKey already has one,
        // download only the genuinely missing keys.
        await supabase.from("mls_media").delete().eq("listing_key", lk);
        const mediaRows: any[] = [];
        let fetchedSoFar = 0;
        for (let j = 0; j < media.length; j++) {
          const m = media[j];
          const mUrl = m.MediaURL || "";
          const key = m.MediaKey || `${lk}-${j}`;
          const order = m.Order || j;

          let localUrl = "";
          const ex = existingByKey[key];
          if (ex && ex.local_url) {
            localUrl = ex.local_url;
          } else {
            if (fetchedSoFar > 0) await sleep(MEDIA_DOWNLOAD_DELAY_MS);
            localUrl = await uploadMediaToR2(mUrl, lid, j, bfSlug);
            fetchedSoFar++;
          }
          if (localUrl) r2Uploaded++; else r2Failed++;
          mediaRows.push({
            listing_key: lk,
            media_key: key,
            media_url: mUrl,
            local_url: localUrl,
            media_type: m.MimeType || "image/jpeg",
            media_category: m.MediaCategory || "Photo",
            short_description: m.ShortDescription || "",
            order: order,
            image_width: m.ImageWidth || null,
            image_height: m.ImageHeight || null,
            modification_timestamp: m.ModificationTimestamp || mTs,
          });
        }
        if (mediaRows.length > 0) {
          await supabase.from("mls_media").insert(mediaRows);
        }
        console.log(`[Backfill] ${lid}: ${fetchedSoFar} new photos downloaded, ${mediaRows.length - fetchedSoFar} reused from R2`);
      }

      // Surface remaining-work count so cron tuning is observable. Same
      // join filters as the work-list query above — count of Canopy winner
      // Active/AUC/Pending listings still missing at least one R2 URL.
      const { data: remainingRows } = await supabase
        .from("mls_media")
        .select("listing_key, mls_listings!inner(is_winner, originating_system_name, standard_status)")
        .eq("local_url", "")
        .eq("mls_listings.is_winner", true)
        .eq("mls_listings.originating_system_name", ORIGINATING_SYSTEM_NAME)
        .in("mls_listings.standard_status", ["Active", "Active Under Contract", "Pending"]);
      const remainingListings = new Set((remainingRows || []).map((r: any) => r.listing_key)).size;

      return new Response(JSON.stringify({
        ok: true, action: "backfill-media",
        processed: work.length, r2Uploaded, r2Failed,
        mlsGridCalls,
        remainingListings,
      }), {
        headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
      });
    }

    // ── Backfill Closed: pull 12 months of historical sold listings for CMA ──
    // This uses StandardStatus eq 'Closed' to fetch all sold listings.
    // Run multiple invocations to page through all records (cursor-based).
    // IMPORTANT: Keep batch sizes small (limit 200) to stay under MLS Grid
    // daily request caps (40K warning, 60K suspension). Run once per hour max.
    if (action === "backfill-closed") {
      // Allow custom cutoff (default 36 months) and reset to re-run a completed backfill
      const cutoffMonths = body.cutoffMonths || 36;
      const forceReset = body.reset === true;
      let resumeTs = body.lastTimestamp || null;
      if (!resumeTs) {
        const { data: cursorRow } = await supabase
          .from("sync_cursors")
          .select("value")
          .eq("key", "backfill-closed")
          .single();
        const cursorVal = cursorRow?.value || "";
        if (cursorVal === "DONE" && !forceReset) {
          console.log("[Backfill Closed] Already complete (cursor=DONE), skipping. Pass reset:true to re-run.");
          return new Response(JSON.stringify({
            ok: true, action: "backfill-closed", synced: 0,
            status: "complete", hasMore: false,
            hint: "Pass reset:true to re-run with extended cutoff"
          }), {
            headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
          });
        }
        if (forceReset) {
          console.log("[Backfill Closed] Resetting cursor for re-run");
          resumeTs = null;
        } else {
          resumeTs = cursorVal || null;
        }
      }

      // Only pull listings closed within the cutoff window (default 36 months)
      const cutoffDate = new Date();
      cutoffDate.setMonth(cutoffDate.getMonth() - cutoffMonths);
      const cutoffStr = cutoffDate.toISOString().split("T")[0];
      console.log(`[Backfill Closed] Cutoff: ${cutoffMonths} months (${cutoffStr}), reset: ${forceReset}`);

      // Skip $expand=Media for backfill (photos not needed for CMA comps, saves huge payload).
      // Use large page size to move quickly through non-WNC records (only WNC counties are kept).
      const bfPageSize = body.pageSize || 200;
      const includeMedia = body.includeMedia === true;
      const baseFilter = `OriginatingSystemName eq '${ORIGINATING_SYSTEM_NAME}' and StandardStatus eq 'Closed'`;
      const tsFilter = resumeTs ? ` and ModificationTimestamp gt ${normalizeTimestamp(resumeTs)}` : "";
      const expandClause = includeMedia ? "&$expand=Media" : "";
      let bfUrl = `${MLS_GRID_API}/Property?$filter=${baseFilter}${tsFilter}${expandClause}&$top=${bfPageSize}`;
      let totalSynced = 0;
      let greatestTs = resumeTs || "";
      let skippedOld = 0;

      while (bfUrl && totalSynced < maxRecords) {
        let data: any;
        try {
          data = await mlsGridFetch(bfUrl, 30000);
        } catch (fetchErr: any) {
          console.error(`[Backfill Closed] MLS Grid fetch error: ${fetchErr.message}`);
          // Save progress and return partial results
          if (greatestTs) {
            await supabase.from("sync_cursors")
              .upsert({ key: "backfill-closed", value: greatestTs, updated_at: new Date().toISOString() });
          }
          return new Response(JSON.stringify({
            ok: false, action: "backfill-closed",
            error: fetchErr.message,
            synced: totalSynced, skippedOld,
            lastTimestamp: greatestTs, hasMore: true
          }), {
            headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
          });
        }
        const records = data.value || [];
        console.log(`[Backfill Closed] Page: ${records.length} records`);

        for (const record of records) {
          if (totalSynced >= maxRecords) break;
          const listingKey = record.ListingKey || "";
          const listingId = stripPrefix(record.ListingId || "");
          const modTs = record.ModificationTimestamp || "";
          if (modTs > greatestTs) greatestTs = modTs;

          // Server-side county + lease filter
          const county = record.CountyOrParish || "";
          if (!county || !WNC_COUNTIES.has(county)) continue;
          if ((record.PropertyType || "") === "Residential Lease") continue;

          // Skip if closed before cutoff (too old)
          const closeDate = record.CloseDate || "";
          if (closeDate && closeDate < cutoffStr) {
            skippedOld++;
            continue;
          }

          // Check if we already have this listing
          const { data: existing } = await supabase
            .from("mls_listings")
            .select("listing_key")
            .eq("listing_key", listingKey)
            .maybeSingle();
          if (existing) {
            // Already have it, skip
            totalSynced++;
            continue;
          }

          // Compliance gates (Rules 7 & 8) — matches primary sync path.
          const canView = record.MlgCanView !== false;
          const sellerAllowsInternetDisplay = record.InternetEntireListingDisplayYN !== false;
          const sellerAllowsAddressDisplay = record.InternetAddressDisplayYN !== false;
          const mlgCanUse: string[] = Array.isArray(record.MlgCanUse) ? record.MlgCanUse : [];
          const idxAllowed = mlgCanUse.length === 0 || mlgCanUse.includes("IDX");

          // Map and insert the listing (same mapping as syncProperties)
          const listing = {
            listing_id: listingId,
            listing_key: listingKey,
            originating_system_name: ORIGINATING_SYSTEM_NAME,
            modification_timestamp: modTs,
            standard_status: record.StandardStatus || "Closed",
            mlg_can_view: canView && sellerAllowsInternetDisplay && idxAllowed,
            internet_entire_listing_display_yn: sellerAllowsInternetDisplay,
            internet_address_display_yn: sellerAllowsAddressDisplay,
            mlg_can_use: mlgCanUse.length ? mlgCanUse : ["IDX"],
            feed_type: "IDX",
            list_price: record.ListPrice || null,
            close_price: record.ClosePrice || null,
            original_list_price: record.OriginalListPrice || null,
            street_number: sellerAllowsAddressDisplay ? (record.StreetNumber || "") : "",
            street_name: sellerAllowsAddressDisplay ? (record.StreetName || "") : "",
            street_suffix: sellerAllowsAddressDisplay ? (record.StreetSuffix || "") : "",
            unit_number: sellerAllowsAddressDisplay ? (record.UnitNumber || "") : "",
            city: record.City || "",
            state_or_province: record.StateOrProvince || "NC",
            postal_code: record.PostalCode || "",
            county_or_parish: record.CountyOrParish || "",
            property_type: record.PropertyType || "",
            property_sub_type: record.PropertySubType || "",
            bedrooms_total: record.BedroomsTotal || 0,
            bathrooms_total_integer: record.BathroomsTotalInteger || 0,
            bathrooms_half: record.BathroomsHalf || 0,
            living_area: record.LivingArea || record.AboveGradeFinishedArea || record.BuildingAreaTotal || null,
            living_area_range: record.LivingAreaRange || "",
            living_area_units: record.LivingAreaUnits || "Square Feet",
            lot_size_acres: record.LotSizeAcres || (record.LotSizeUnits === "Acres" && record.LotSizeArea ? record.LotSizeArea : null) || (record.LotSizeSquareFeet ? record.LotSizeSquareFeet / 43560 : null),
            lot_size_square_feet: record.LotSizeSquareFeet || (record.LotSizeUnits === "Acres" && record.LotSizeArea ? record.LotSizeArea * 43560 : null),
            year_built: record.YearBuilt || null,
            stories: record.Stories || null,
            garage_spaces: record.GarageSpaces || 0,
            parking_total: record.ParkingTotal || 0,
            public_remarks: record.PublicRemarks || "",
            private_remarks: record.PrivateRemarks || "",
            showing_instructions: record.ShowingInstructions || "",
            directions: record.Directions || "",
            list_agent_key: record.ListAgentKey || "",
            list_agent_full_name: record.ListAgentFullName || "",
            list_agent_email: record.ListAgentEmail || "",
            list_agent_phone: record.ListAgentDirectPhone || record.ListAgentOfficePhone || "",
            list_office_key: record.ListOfficeKey || "",
            list_office_name: record.ListOfficeName || "",
            list_office_phone: record.ListOfficePhone || "",
            attribution_contact: record.AttributionContact || "",
            buyer_agent_key: record.BuyerAgentKey || "",
            buyer_agent_full_name: record.BuyerAgentFullName || "",
            buyer_office_key: record.BuyerOfficeKey || "",
            buyer_office_name: record.BuyerOfficeName || "",
            list_date: record.ListingContractDate || null,
            close_date: record.CloseDate || null,
            expiration_date: record.ExpirationDate || null,
            days_on_market: record.DaysOnMarket || 0,
            cumulative_days_on_market: record.CumulativeDaysOnMarket || 0,
            latitude: sellerAllowsAddressDisplay ? (record.Latitude || null) : null,
            longitude: sellerAllowsAddressDisplay ? (record.Longitude || null) : null,
            association_fee: record.AssociationFee || null,
            association_fee_frequency: record.AssociationFeeFrequency || "",
            association_name: record.AssociationName || "",
            tax_annual_amount: record.TaxAnnualAmount || null,
            tax_year: record.TaxYear || null,
            heating: record.Heating || [],
            cooling: record.Cooling || [],
            interior_features: record.InteriorFeatures || [],
            exterior_features: record.ExteriorFeatures || [],
            appliances: record.Appliances || [],
            waterfront_features: record.WaterfrontFeatures || [],
            view: record.View || [],
            roof: record.Roof || [],
            flooring: record.Flooring || [],
            foundation_details: record.FoundationDetails || [],
            construction_materials: record.ConstructionMaterials || [],
            water_source: record.WaterSource || [],
            sewer: record.Sewer || [],
            electric: record.Electric || [],
            internet_whole_listing: record.InternetWholeListing || [],
            zoning: record.Zoning || "",
            restrictions: record.Restrictions || [],
            photos_change_timestamp: record.PhotosChangeTimestamp || null,
            raw_data: record,
            updated_at: new Date().toISOString(),
          };

          await supabase.from("mls_listings").upsert(listing, { onConflict: "listing_key" });

          // Record SOLD event in price history
          if (record.ClosePrice) {
            await supabase.from("price_history").insert({
              listing_key: listingKey,
              price: record.ClosePrice,
              event_type: "SOLD",
              source: "MLS",
              previous_price: record.ListPrice || null,
            });
          }

          // Store media metadata only if $expand=Media was used
          if (includeMedia) {
            const media = record.Media || [];
            if (media.length > 0) {
              const mediaRows = media.map((m: any, i: number) => ({
                listing_key: listingKey,
                media_key: m.MediaKey || `${listingKey}-${i}`,
                media_url: m.MediaURL || "",
                local_url: "", // Skip R2 for backfilled closed listings
                media_type: m.MimeType || "image/jpeg",
                media_category: m.MediaCategory || "Photo",
                short_description: m.ShortDescription || "",
                order: m.Order || i,
                image_width: m.ImageWidth || null,
                image_height: m.ImageHeight || null,
                modification_timestamp: m.ModificationTimestamp || modTs,
              }));
              await supabase.from("mls_media").insert(mediaRows);
            }
          }

          totalSynced++;
        }

        bfUrl = data["@odata.nextLink"] || "";
        // Page-to-page delay matches the rest of the file. Earlier value (500ms)
        // was 2 RPS, faster than every other path and a contributor to the May
        // 2026 rate-limit warning.
        if (bfUrl && totalSynced < maxRecords) await sleep(REQUEST_DELAY_MS);
      }

      const hasMore = !!bfUrl && totalSynced >= maxRecords;
      const cursorValue = hasMore ? greatestTs : "DONE";
      await supabase.from("sync_cursors")
        .upsert({ key: "backfill-closed", value: cursorValue, updated_at: new Date().toISOString() });
      console.log(`[Backfill Closed] Saved cursor: ${cursorValue} (synced ${totalSynced}, skipped ${skippedOld} old)`);

      return new Response(JSON.stringify({
        ok: true, action: "backfill-closed",
        synced: totalSynced, skippedOld,
        lastTimestamp: greatestTs, hasMore
      }), {
        headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
      });
    }

    // ── Cleanup action: remove non-WNC listings that slipped through ──
    if (action === "cleanup") {
      const wncList = Array.from(WNC_COUNTIES);
      // Delete listings with empty county
      const { count: emptyCount } = await supabase
        .from("mls_listings")
        .delete({ count: "exact" })
        .eq("originating_system_name", ORIGINATING_SYSTEM_NAME)
        .eq("county_or_parish", "");
      // Delete listings with county NOT in WNC list
      const { count: nonWncCount } = await supabase
        .from("mls_listings")
        .delete({ count: "exact" })
        .eq("originating_system_name", ORIGINATING_SYSTEM_NAME)
        .not("county_or_parish", "in", `(${wncList.join(",")})`);
      return new Response(JSON.stringify({
        ok: true, action: "cleanup",
        deleted: { emptyCounty: emptyCount || 0, nonWnc: nonWncCount || 0 }
      }), {
        headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
      });
    }

    const resources = resource === "all"
      ? ["Property", "Member", "Office", "OpenHouse"]
      : [resource];

    const results: Record<string, any> = {};

    // Process sequentially — MLS Grid best practice: no parallel replication requests
    for (const res of resources) {
      const syncFn = SYNC_FNS[res];
      if (!syncFn) { results[res] = { error: `Unknown resource: ${res}` }; continue; }

      const { data: syncState } = await supabase
        .from("mls_sync_state").select("*").eq("resource_type", res).single();

      // Stale-lock protection: if status is "running" but last_sync_at was >10 min ago,
      // the previous run crashed/timed out — auto-reset so we don't stay stuck forever
      if (syncState?.status === "running" && syncState?.last_sync_at) {
        const staleMins = (Date.now() - new Date(syncState.last_sync_at).getTime()) / 60000;
        if (staleMins > 10) {
          console.warn(`[MLS Grid] ${res} stuck in "running" for ${Math.round(staleMins)} min — resetting stale lock`);
          await supabase.from("mls_sync_state")
            .update({ status: "idle", error_message: `Auto-reset: stale lock after ${Math.round(staleMins)} min` })
            .eq("resource_type", res);
        } else {
          console.log(`[MLS Grid] ${res} already running (${Math.round(staleMins)} min ago) — skipping`);
          results[res] = { skipped: true, reason: "already running" };
          continue;
        }
      }

      // Use saved timestamp for resumption — even initial imports resume from where
      // the last batch left off (the sync function handles URL building for initial vs incremental)
      const lastTs = syncState?.last_modification_timestamp || null;

      await supabase.from("mls_sync_state")
        .update({ status: "running", error_message: "" }).eq("resource_type", res);

      try {
        const result = await syncFn(supabase, isInitial, lastTs, maxRecords);

        const updatePayload = {
          last_modification_timestamp: result.greatestTimestamp || lastTs,
          last_sync_at: new Date().toISOString(),
          records_synced: result.totalSynced,
          status: "idle",
          error_message: result.hasMore
            ? `Partial: ${result.totalSynced} records synced, more available. Invoke again to continue.`
            : "",
          originating_system_name: ORIGINATING_SYSTEM_NAME,
        };
        console.log(`[MLS Grid] Updating sync state for ${res}:`, JSON.stringify(updatePayload));
        await supabase.from("mls_sync_state").update(updatePayload).eq("resource_type", res);

        results[res] = {
          synced: result.totalSynced,
          lastTimestamp: result.greatestTimestamp,
          hasMore: result.hasMore,
        };

        console.log(
          `[MLS Grid] ${res}: synced ${result.totalSynced} records${result.hasMore ? " (more available)" : ""}`
        );
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        await supabase.from("mls_sync_state")
          .update({ status: "error", error_message: msg }).eq("resource_type", res);
        results[res] = { error: msg };
        console.error(`[MLS Grid] ${res} error: ${msg}`);
      }
    }

    return new Response(JSON.stringify({ ok: true, action, source: "Canopy MLS", results }), {
      headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
    });

    } finally {
      // Release the MLS Grid single-flight lock so the next cron tick can proceed.
      // Runs regardless of which return path or exception was hit above.
      if (lockHeld) await releaseMlsGridLock(supabase);
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[MLS Grid] Fatal error: ${msg}`);
    return new Response(
      JSON.stringify({ ok: false, error: msg }),
      { status: 500, headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" } }
    );
  }
});
