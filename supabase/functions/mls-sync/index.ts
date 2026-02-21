// MLS Grid Replication Edge Function
// Handles initial import and incremental sync for all 4 resource types:
// Property, Member, Office, OpenHouse
//
// Deploy: supabase functions deploy mls-sync
// Invoke: POST /functions/v1/mls-sync { "action": "sync" | "initial-import", "resource": "Property" }
// Schedule: Set up a cron via pg_cron or external scheduler every 15 minutes

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// ── Configuration ──────────────────────────────────────────────
const MLS_GRID_API = "https://api.mlsgrid.com/v2";
const ORIGINATING_SYSTEM_NAME = Deno.env.get("MLS_GRID_ORIGINATING_SYSTEM") || "";
const MLS_GRID_TOKEN = Deno.env.get("MLS_GRID_TOKEN") || "";
const MLS_LOCAL_PREFIX = Deno.env.get("MLS_LOCAL_PREFIX") || "";
const R2_ENDPOINT = Deno.env.get("R2_ENDPOINT") || "";
const R2_ACCESS_KEY = Deno.env.get("R2_ACCESS_KEY") || "";
const R2_SECRET_KEY = Deno.env.get("R2_SECRET_KEY") || "";
const R2_BUCKET = Deno.env.get("R2_BUCKET") || "mls-media";
const R2_PUBLIC_URL = Deno.env.get("R2_PUBLIC_URL") || "";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
const SUPABASE_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";

// Rate limiting: max 2 req/s — we stay safely under
const REQUEST_DELAY_MS = 600;

// ── Helpers ────────────────────────────────────────────────────
function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
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

// Download image and upload to Cloudflare R2
async function uploadMediaToR2(
  mediaUrl: string,
  listingId: string,
  order: number
): Promise<string> {
  if (!R2_ENDPOINT || !R2_ACCESS_KEY) return "";
  try {
    const resp = await fetch(mediaUrl);
    if (!resp.ok) return "";
    const blob = await resp.blob();
    const ext = mediaUrl.includes(".png") ? "png" : "jpg";
    const key = `listings/${listingId}/${order}.${ext}`;
    const putUrl = `${R2_ENDPOINT}/${R2_BUCKET}/${key}`;
    const uploadResp = await fetch(putUrl, {
      method: "PUT",
      headers: { "Content-Type": blob.type || "image/jpeg" },
      body: blob,
    });
    if (uploadResp.ok) {
      return R2_PUBLIC_URL ? `${R2_PUBLIC_URL}/${key}` : key;
    }
    return "";
  } catch {
    return "";
  }
}

// ── Property Sync ──────────────────────────────────────────────
async function syncProperties(
  supabase: any,
  isInitial: boolean,
  lastTimestamp: string | null
) {
  let url: string;
  if (isInitial) {
    url = `${MLS_GRID_API}/Property?$filter=OriginatingSystemName eq '${ORIGINATING_SYSTEM_NAME}' and MlgCanView eq true&$expand=Media,Rooms,UnitTypes`;
  } else {
    url = `${MLS_GRID_API}/Property?$filter=OriginatingSystemName eq '${ORIGINATING_SYSTEM_NAME}' and ModificationTimestamp gt ${lastTimestamp}&$expand=Media,Rooms,UnitTypes`;
  }

  let totalSynced = 0;
  let greatestTimestamp = lastTimestamp || "";

  while (url) {
    const data = await mlsGridFetch(url);
    const records = data.value || [];

    for (const record of records) {
      const listingKey = record.ListingKey || "";
      const listingId = stripPrefix(record.ListingId || "");
      const modTs = record.ModificationTimestamp || "";
      const canView = record.MlgCanView !== false;

      if (modTs > greatestTimestamp) greatestTimestamp = modTs;

      if (!canView) {
        // MlgCanView false = marked for deletion
        await supabase.from("mls_listings").delete().eq("listing_key", listingKey);
        await supabase.from("mls_media").delete().eq("listing_key", listingKey);
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
        living_area_units: record.LivingAreaUnits || "Square Feet",
        lot_size_acres: record.LotSizeAcres || null,
        lot_size_square_feet: record.LotSizeSquareFeet || null,
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
        raw_data: record,
        updated_at: new Date().toISOString(),
      };

      // ── Price History Tracking ──
      const currentPrice = record.ListPrice || null;
      const currentStatus = record.StandardStatus || "Active";

      const { data: existing } = await supabase
        .from("mls_listings")
        .select("list_price, standard_status")
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
          }
        }
      }

      await supabase.from("mls_listings").upsert(listing, { onConflict: "listing_key" });

      // Handle media — download to R2, store local URLs
      const media = record.Media || [];
      if (media.length > 0) {
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
    if (url) await sleep(REQUEST_DELAY_MS);
  }

  return { totalSynced, greatestTimestamp };
}

// ── Member Sync ────────────────────────────────────────────────
async function syncMembers(
  supabase: any,
  isInitial: boolean,
  lastTimestamp: string | null
) {
  let url = isInitial
    ? `${MLS_GRID_API}/Member?$filter=OriginatingSystemName eq '${ORIGINATING_SYSTEM_NAME}' and MlgCanView eq true`
    : `${MLS_GRID_API}/Member?$filter=OriginatingSystemName eq '${ORIGINATING_SYSTEM_NAME}' and ModificationTimestamp gt ${lastTimestamp}`;

  let totalSynced = 0;
  let greatestTimestamp = lastTimestamp || "";

  while (url) {
    const data = await mlsGridFetch(url);
    for (const r of data.value || []) {
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
    if (url) await sleep(REQUEST_DELAY_MS);
  }
  return { totalSynced, greatestTimestamp };
}

// ── Office Sync ────────────────────────────────────────────────
async function syncOffices(
  supabase: any,
  isInitial: boolean,
  lastTimestamp: string | null
) {
  let url = isInitial
    ? `${MLS_GRID_API}/Office?$filter=OriginatingSystemName eq '${ORIGINATING_SYSTEM_NAME}' and MlgCanView eq true`
    : `${MLS_GRID_API}/Office?$filter=OriginatingSystemName eq '${ORIGINATING_SYSTEM_NAME}' and ModificationTimestamp gt ${lastTimestamp}`;

  let totalSynced = 0;
  let greatestTimestamp = lastTimestamp || "";

  while (url) {
    const data = await mlsGridFetch(url);
    for (const r of data.value || []) {
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
    if (url) await sleep(REQUEST_DELAY_MS);
  }
  return { totalSynced, greatestTimestamp };
}

// ── OpenHouse Sync ─────────────────────────────────────────────
async function syncOpenHouses(
  supabase: any,
  isInitial: boolean,
  lastTimestamp: string | null
) {
  let url = isInitial
    ? `${MLS_GRID_API}/OpenHouse?$filter=OriginatingSystemName eq '${ORIGINATING_SYSTEM_NAME}' and MlgCanView eq true`
    : `${MLS_GRID_API}/OpenHouse?$filter=OriginatingSystemName eq '${ORIGINATING_SYSTEM_NAME}' and ModificationTimestamp gt ${lastTimestamp}`;

  let totalSynced = 0;
  let greatestTimestamp = lastTimestamp || "";

  while (url) {
    const data = await mlsGridFetch(url);
    for (const r of data.value || []) {
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
    if (url) await sleep(REQUEST_DELAY_MS);
  }
  return { totalSynced, greatestTimestamp };
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
    const isInitial = action === "initial-import";

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

      const lastTs = isInitial ? null : syncState?.last_modification_timestamp || null;

      await supabase.from("mls_sync_state")
        .update({ status: "running", error_message: "" }).eq("resource_type", res);

      try {
        const result = await syncFn(supabase, isInitial, lastTs);
        await supabase.from("mls_sync_state").update({
          last_modification_timestamp: result.greatestTimestamp || lastTs,
          last_sync_at: new Date().toISOString(),
          records_synced: result.totalSynced,
          status: "idle",
          error_message: "",
          originating_system_name: ORIGINATING_SYSTEM_NAME,
        }).eq("resource_type", res);

        results[res] = { synced: result.totalSynced, lastTimestamp: result.greatestTimestamp };
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        await supabase.from("mls_sync_state")
          .update({ status: "error", error_message: msg }).eq("resource_type", res);
        results[res] = { error: msg };
      }
    }

    return new Response(JSON.stringify({ ok: true, action, results }), {
      headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
    });
  } catch (err) {
    return new Response(
      JSON.stringify({ ok: false, error: err instanceof Error ? err.message : String(err) }),
      { status: 500, headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" } }
    );
  }
});
