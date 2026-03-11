// MLS Grid Replication Edge Function
// Handles initial import and incremental sync for all 4 resource types:
// Property, Member, Office, OpenHouse
//
// Deploy: supabase functions deploy mls-sync
// Invoke: POST /functions/v1/mls-sync { "action": "sync" | "initial-import", "resource": "Property", "limit": 500 }
// Schedule: Set up a cron via pg_cron or external scheduler every 15 minutes

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

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

// MLS Grid rate limits (warning at 2 RPS, suspension at 6 RPS):
//   - Max 4 requests/second at all times
//   - Max 7,200 requests/hour (warning), 18,000/hour (suspension)
//   - Max 40,000 requests/24h (warning), 60,000/24h (suspension)
// 1200ms delay = ~0.83 RPS, well under the 2 RPS warning threshold.
// NEVER fire multiple invocations in parallel — always sequential via cron.
const REQUEST_DELAY_MS = 1200;

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

async function mlsGridFetch(url: string): Promise<any> {
  const resp = await fetch(url, {
    headers: {
      Authorization: `Bearer ${MLS_GRID_TOKEN}`,
      "Accept-Encoding": "gzip,deflate",
      Accept: "application/json",
    },
  });
  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`MLS Grid API ${resp.status}: ${text}`);
  }
  return resp.json();
}

// Download image and upload to Cloudflare R2 via Worker proxy
async function uploadMediaToR2(
  mediaUrl: string,
  listingId: string,
  order: number
): Promise<string> {
  if (!r2Available()) return "";
  try {
    const resp = await fetch(mediaUrl);
    if (!resp.ok) return "";
    const contentType = resp.headers.get("content-type") || "image/jpeg";
    const ext = contentType.includes("png") ? "png" : "jpg";
    const key = `listings/${listingId}/${order}.${ext}`;
    const uploadResp = await fetch(`${R2_WORKER_URL}/${key}`, {
      method: "PUT",
      headers: {
        "Authorization": `Bearer ${R2_WORKER_SECRET}`,
        "Content-Type": contentType,
      },
      body: resp.body,
    });
    if (uploadResp.ok) {
      return R2_PUBLIC_URL ? `${R2_PUBLIC_URL}/${key}` : key;
    }
    console.warn(`[R2] Upload failed for ${key}: ${uploadResp.status}`);
    return "";
  } catch (err) {
    console.warn(`[R2] Upload error for ${listingId}/${order}:`, String(err));
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
    url = `${MLS_GRID_API}/Property?$filter=${baseFilter} and MlgCanView eq true and StandardStatus eq 'Active'${tsFilter}&$expand=Media&$top=${PAGE_SIZE}&$orderby=ModificationTimestamp asc`;
  } else {
    // Incremental sync: get ALL changes (including status transitions) since last sync
    url = `${MLS_GRID_API}/Property?$filter=${baseFilter}${tsFilter}&$expand=Media&$top=${PAGE_SIZE}&$orderby=ModificationTimestamp asc`;
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
      const canView = record.MlgCanView !== false;

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

      if (!canView) {
        // MlgCanView false = no longer IDX-eligible
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
            .update({ mlg_can_view: false, updated_at: new Date().toISOString() })
            .eq("listing_key", listingKey);
        }
        totalSynced++;
        continue;
      }

      // Map RESO Data Dictionary fields
      const listing = {
        listing_id: listingId,
        listing_key: listingKey,
        originating_system_name: ORIGINATING_SYSTEM_NAME,
        modification_timestamp: modTs,
        standard_status: record.StandardStatus || "Active",
        mlg_can_view: canView,
        feed_type: "IDX", // MLS Grid listings default to IDX
        list_price: record.ListPrice || null,
        close_price: record.ClosePrice || null,
        original_list_price: record.OriginalListPrice || null,
        street_number: record.StreetNumber || "",
        street_name: record.StreetName || "",
        street_suffix: record.StreetSuffix || "",
        unit_number: record.UnitNumber || "",
        city: record.City || "",
        state_or_province: record.StateOrProvince || "NC",
        postal_code: record.PostalCode || "",
        county_or_parish: record.CountyOrParish || "",
        property_type: record.PropertyType || "",
        property_sub_type: record.PropertySubType || "",
        bedrooms_total: record.BedroomsTotal || 0,
        bathrooms_total_integer: record.BathroomsTotalInteger || 0,
        bathrooms_half: record.BathroomsHalf || 0,
        living_area: record.LivingArea || null,
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
        latitude: record.Latitude || null,
        longitude: record.Longitude || null,
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
        await supabase.from("mls_media").delete().eq("listing_key", listingKey);
        const mediaRows = [];
        for (let i = 0; i < media.length; i++) {
          const m = media[i];
          const mediaUrl = m.MediaURL || "";
          const localUrl = await uploadMediaToR2(mediaUrl, listingId, i);
          mediaRows.push({
            listing_key: listingKey,
            media_key: m.MediaKey || `${listingKey}-${i}`,
            media_url: mediaUrl,
            local_url: localUrl,
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
  let url = `${MLS_GRID_API}/Member?$filter=OriginatingSystemName eq '${ORIGINATING_SYSTEM_NAME}' and MlgCanView eq true${mTsFilter}&$top=${PAGE_SIZE}&$orderby=ModificationTimestamp asc`;

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
  let url = `${MLS_GRID_API}/Office?$filter=OriginatingSystemName eq '${ORIGINATING_SYSTEM_NAME}' and MlgCanView eq true${oTsFilter}&$top=${PAGE_SIZE}&$orderby=ModificationTimestamp asc`;

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
  let url = `${MLS_GRID_API}/OpenHouse?$filter=OriginatingSystemName eq '${ORIGINATING_SYSTEM_NAME}' and MlgCanView eq true${ohTsFilter}&$top=${PAGE_SIZE}&$orderby=ModificationTimestamp asc`;

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
      let url = `${MLS_GRID_API}/Property?$filter=${baseFilter}${tsFilter}&$expand=Media&$top=${PAGE_SIZE}&$orderby=ModificationTimestamp asc`;
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

    // ── Backfill action: download existing Canopy photos to R2 ──
    // Pages through all active Canopy listings via MLS Grid API with $expand=Media,
    // downloads each photo to R2, and updates local_url in mls_media.
    // Uses sync_cursors for resume between cron invocations.
    if (action === "backfill-media") {
      let resumeTs = body.lastTimestamp || null;
      if (!resumeTs) {
        const { data: cursorRow } = await supabase
          .from("sync_cursors")
          .select("value")
          .eq("key", "backfill-media")
          .single();
        const cursorVal = cursorRow?.value || "";
        if (cursorVal === "DONE") {
          console.log("[Backfill] Already complete (cursor=DONE), skipping");
          return new Response(JSON.stringify({
            ok: true, action: "backfill-media", processed: 0,
            status: "complete", hasMore: false
          }), {
            headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
          });
        }
        resumeTs = cursorVal || null;
      }

      const baseFilter = `OriginatingSystemName eq '${ORIGINATING_SYSTEM_NAME}' and MlgCanView eq true and StandardStatus eq 'Active'`;
      const tsFilter = resumeTs ? ` and ModificationTimestamp gt ${normalizeTimestamp(resumeTs)}` : "";
      let bfUrl = `${MLS_GRID_API}/Property?$filter=${baseFilter}${tsFilter}&$expand=Media&$top=${PAGE_SIZE}&$orderby=ModificationTimestamp asc`;
      let totalProcessed = 0;
      let greatestTs = resumeTs || "";
      let r2Uploaded = 0;
      let r2Failed = 0;

      while (bfUrl && totalProcessed < maxRecords) {
        const data = await mlsGridFetch(bfUrl);
        const records = data.value || [];
        console.log(`[Backfill] Page: ${records.length} records`);

        for (const record of records) {
          if (totalProcessed >= maxRecords) break;
          const lk = record.ListingKey || "";
          const lid = stripPrefix(record.ListingId || "");
          const mTs = record.ModificationTimestamp || "";
          if (mTs > greatestTs) greatestTs = mTs;

          // Server-side filters (same as syncProperties)
          const county = record.CountyOrParish || "";
          if (!county || !WNC_COUNTIES.has(county)) continue;
          if ((record.PropertyType || "") === "Residential Lease") continue;
          if (record.MlgCanView === false) continue;

          const media = record.Media || [];
          if (media.length > 0) {
            // Check if this listing already has R2 photos
            const { data: existingMedia } = await supabase
              .from("mls_media")
              .select("local_url")
              .eq("listing_key", lk)
              .neq("local_url", "")
              .limit(1);

            if (existingMedia && existingMedia.length > 0) {
              // Already has R2 photos, skip
              totalProcessed++;
              continue;
            }

            // Delete stale media rows and re-insert with R2 URLs
            await supabase.from("mls_media").delete().eq("listing_key", lk);
            const mediaRows = [];
            for (let i = 0; i < media.length; i++) {
              const m = media[i];
              const mUrl = m.MediaURL || "";
              const localUrl = await uploadMediaToR2(mUrl, lid, i);
              if (localUrl) r2Uploaded++; else r2Failed++;
              mediaRows.push({
                listing_key: lk,
                media_key: m.MediaKey || `${lk}-${i}`,
                media_url: mUrl,
                local_url: localUrl,
                media_type: m.MimeType || "image/jpeg",
                media_category: m.MediaCategory || "Photo",
                short_description: m.ShortDescription || "",
                order: m.Order || i,
                image_width: m.ImageWidth || null,
                image_height: m.ImageHeight || null,
                modification_timestamp: m.ModificationTimestamp || mTs,
              });
            }
            if (mediaRows.length > 0) {
              await supabase.from("mls_media").insert(mediaRows);
            }
            console.log(`[Backfill] ${lid}: ${mediaRows.filter(r => r.local_url).length}/${mediaRows.length} photos to R2`);
          }
          totalProcessed++;
        }

        bfUrl = data["@odata.nextLink"] || "";
        if (bfUrl && totalProcessed < maxRecords) await sleep(REQUEST_DELAY_MS);
      }

      const hasMore = !!bfUrl && totalProcessed >= maxRecords;
      const cursorValue = hasMore ? greatestTs : "DONE";
      await supabase.from("sync_cursors")
        .upsert({ key: "backfill-media", value: cursorValue, updated_at: new Date().toISOString() });
      console.log(`[Backfill] Saved cursor: ${cursorValue} (processed ${totalProcessed}, R2: ${r2Uploaded} ok, ${r2Failed} failed)`);

      return new Response(JSON.stringify({
        ok: true, action: "backfill-media",
        processed: totalProcessed, r2Uploaded, r2Failed,
        lastTimestamp: greatestTs, hasMore
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

      // Use smaller page size for backfill to avoid MLS Grid rate limit issues
      const bfPageSize = 100;
      const baseFilter = `OriginatingSystemName eq '${ORIGINATING_SYSTEM_NAME}' and StandardStatus eq 'Closed'`;
      const tsFilter = resumeTs ? ` and ModificationTimestamp gt ${normalizeTimestamp(resumeTs)}` : "";
      let bfUrl = `${MLS_GRID_API}/Property?$filter=${baseFilter}${tsFilter}&$expand=Media&$top=${bfPageSize}&$orderby=ModificationTimestamp asc`;
      let totalSynced = 0;
      let greatestTs = resumeTs || "";
      let skippedOld = 0;

      while (bfUrl && totalSynced < maxRecords) {
        const data = await mlsGridFetch(bfUrl);
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

          // Map and insert the listing (same mapping as syncProperties)
          const listing = {
            listing_id: listingId,
            listing_key: listingKey,
            originating_system_name: ORIGINATING_SYSTEM_NAME,
            modification_timestamp: modTs,
            standard_status: record.StandardStatus || "Closed",
            mlg_can_view: record.MlgCanView !== false,
            feed_type: "IDX",
            list_price: record.ListPrice || null,
            close_price: record.ClosePrice || null,
            original_list_price: record.OriginalListPrice || null,
            street_number: record.StreetNumber || "",
            street_name: record.StreetName || "",
            street_suffix: record.StreetSuffix || "",
            unit_number: record.UnitNumber || "",
            city: record.City || "",
            state_or_province: record.StateOrProvince || "NC",
            postal_code: record.PostalCode || "",
            county_or_parish: record.CountyOrParish || "",
            property_type: record.PropertyType || "",
            property_sub_type: record.PropertySubType || "",
            bedrooms_total: record.BedroomsTotal || 0,
            bathrooms_total_integer: record.BathroomsTotalInteger || 0,
            bathrooms_half: record.BathroomsHalf || 0,
            living_area: record.LivingArea || null,
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
            latitude: record.Latitude || null,
            longitude: record.Longitude || null,
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

          // Store media metadata only (skip R2 download to minimize API calls)
          // CMA is admin-only; photos served from MLS Grid URLs or omitted
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

          totalSynced++;
        }

        bfUrl = data["@odata.nextLink"] || "";
        // Use longer delay for backfill to stay well under MLS Grid rate limits
        if (bfUrl && totalSynced < maxRecords) await sleep(2000);
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
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[MLS Grid] Fatal error: ${msg}`);
    return new Response(
      JSON.stringify({ ok: false, error: msg }),
      { status: 500, headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" } }
    );
  }
});
