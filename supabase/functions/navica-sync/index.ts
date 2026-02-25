// Navica CSAR (Carolina Smokies) MLS Sync Edge Function
// Replicates Property, Member, Office, OpenHouse from Navica RESO Web API
// Data source: Carolina Smokies Association of Realtors (CSAR)
//
// Deploy: supabase functions deploy navica-sync
// Invoke: POST /functions/v1/navica-sync { "action": "sync" | "initial-import", "resource": "Property" }
// Schedule: Set up a cron via pg_cron or external scheduler every 15 minutes
//
// Env vars required:
//   NAVICA_SERVER_TOKEN  — Server Token from Navica API Access page
//   NAVICA_DATASET_ID    — Dataset ID (default: nav27 for Carolina Smokies AOR)
//   SUPABASE_URL         — Supabase project URL
//   SUPABASE_SERVICE_ROLE_KEY — Supabase service role key
//   R2_ENDPOINT, R2_ACCESS_KEY, R2_SECRET_KEY, R2_BUCKET, R2_PUBLIC_URL — Cloudflare R2

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// ── Configuration ──────────────────────────────────────────────
const NAVICA_DATASET_ID = Deno.env.get("NAVICA_DATASET_ID") || "nav27";
const NAVICA_API_BASE = `https://navapi.navicamls.net/api/v2/OData/${NAVICA_DATASET_ID}`;
const NAVICA_SERVER_TOKEN = Deno.env.get("NAVICA_SERVER_TOKEN") || "";

const R2_ENDPOINT = Deno.env.get("R2_ENDPOINT") || "";
const R2_ACCESS_KEY = Deno.env.get("R2_ACCESS_KEY") || "";
const R2_SECRET_KEY = Deno.env.get("R2_SECRET_KEY") || "";
const R2_BUCKET = Deno.env.get("R2_BUCKET") || "mls-media";
const R2_PUBLIC_URL = Deno.env.get("R2_PUBLIC_URL") || "";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
const SUPABASE_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";

// Originating system name for CSAR records stored in mls_listings
// Navica returns "Carolina Smokies AOR" — we normalize to "CSAR" for our DB
const ORIGINATING_SYSTEM = "CSAR";

// Sync state rows use this prefix to coexist with MLS Grid rows
const SYNC_PREFIX = "Navica_";

// Rate limiting: Navica RESO Web API — stay safely under limits
const REQUEST_DELAY_MS = 600;

// Max records per page (Navica may enforce its own limit)
const PAGE_SIZE = 200;

// Default max records per invocation (Supabase Edge Functions have time limits)
// For initial import, run multiple invocations; each picks up where the last left off
const DEFAULT_MAX_RECORDS = 500;

// ── Helpers ────────────────────────────────────────────────────
function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

// Normalize timestamp to ISO 8601 with Z suffix (not +00:00) for OData filter compatibility
function normalizeTimestamp(ts: string): string {
  if (!ts) return ts;
  // PostgreSQL returns +00:00 but OData filter needs Z suffix
  return ts.replace(/\+00:00$/, "Z").replace(/\+00$/, "Z");
}

// Append access_token to a URL (handles existing query params)
function withToken(url: string): string {
  // If URL already has access_token (e.g. from @odata.nextLink), skip
  if (url.includes("access_token=")) return url;
  const sep = url.includes("?") ? "&" : "?";
  return `${url}${sep}access_token=${NAVICA_SERVER_TOKEN}`;
}

async function navicaFetch(url: string): Promise<any> {
  const authedUrl = withToken(url);
  const resp = await fetch(authedUrl, {
    headers: {
      "Accept-Encoding": "gzip,deflate",
      Accept: "application/json",
    },
  });
  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`Navica API ${resp.status}: ${text}`);
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

// Determine if listing is IDX-approved (public display) from FeedTypes.
// Navica includes FeedType/FeedTypes on each record to distinguish
// IDX (public display) from BBO (broker back office only).
function isIdxApproved(record: any): boolean {
  const feedTypes = record.FeedTypes || record.FeedType || "";
  if (Array.isArray(feedTypes)) {
    return feedTypes.some((ft: string) =>
      ft.toUpperCase().includes("IDX")
    );
  }
  if (typeof feedTypes === "string" && feedTypes.length > 0) {
    return feedTypes.toUpperCase().includes("IDX");
  }
  // If no FeedType info available, default to true (display as IDX)
  return true;
}

// Get raw feed type string for storage in feed_type column
function getFeedType(record: any): string {
  const feedTypes = record.FeedTypes || record.FeedType || "";
  if (Array.isArray(feedTypes)) return feedTypes.join(",");
  return String(feedTypes || "IDX");
}

// ── Property Sync ──────────────────────────────────────────────
async function syncProperties(
  supabase: any,
  isInitial: boolean,
  lastTimestamp: string | null,
  maxRecords: number = DEFAULT_MAX_RECORDS,
  extraFilter: string = ""
) {
  let url: string;
  // Build $filter clause
  const filters: string[] = [];
  // Always exclude rental listings
  filters.push("PropertyType ne 'Residential Lease'");
  if (!isInitial && lastTimestamp) {
    filters.push(`APIModificationTimestamp gt ${normalizeTimestamp(lastTimestamp)}`);
  }
  if (extraFilter) filters.push(extraFilter);
  const filterClause = filters.length > 0 ? `$filter=${filters.join(" and ")}&` : "";
  url = `${NAVICA_API_BASE}/Property?${filterClause}$top=${PAGE_SIZE}&$orderby=APIModificationTimestamp asc`;

  let totalSynced = 0;
  let greatestTimestamp = lastTimestamp || "";

  while (url && totalSynced < maxRecords) {
    const data = await navicaFetch(url);
    const records = data.value || [];

    console.log(
      `[NavicaSync] Property page: ${records.length} records`
    );

    for (const record of records) {
      if (totalSynced >= maxRecords) break;
      const listingKey = record.ListingKey || "";
      const listingId = record.ListingId || record.ListingKey || "";
      // Use APIModificationTimestamp (Navica-recommended) with fallback to ModificationTimestamp
      const modTs = record.APIModificationTimestamp || record.ModificationTimestamp || "";
      const stdStatus = record.StandardStatus || "Active";

      if (modTs > greatestTimestamp) greatestTimestamp = modTs;

      // Handle deleted/withdrawn/expired — remove from our database
      if (
        stdStatus === "Deleted" ||
        stdStatus === "Expired" ||
        stdStatus === "Withdrawn"
      ) {
        await supabase
          .from("mls_listings")
          .delete()
          .eq("listing_key", listingKey);
        await supabase
          .from("mls_media")
          .delete()
          .eq("listing_key", listingKey);
        totalSynced++;
        continue;
      }

      const idxApproved = isIdxApproved(record);
      const feedType = getFeedType(record);

      // Map RESO Data Dictionary fields → our mls_listings schema
      const listing: Record<string, any> = {
        listing_id: listingId,
        listing_key: listingKey,
        originating_system_name:
          record.OriginatingSystemName || ORIGINATING_SYSTEM,
        modification_timestamp: modTs,
        standard_status: stdStatus,
        mlg_can_view: idxApproved,
        feed_type: feedType,

        // Pricing
        list_price: record.ListPrice || null,
        close_price: record.ClosePrice || null,
        original_list_price: record.OriginalListPrice || null,

        // Address
        street_number: record.StreetNumber || "",
        street_name: record.StreetName || "",
        street_suffix: record.StreetSuffix || "",
        unit_number: record.UnitNumber || "",
        city: record.City || "",
        state_or_province: record.StateOrProvince || "NC",
        postal_code: record.PostalCode || "",
        county_or_parish: record.CountyOrParish || "",

        // Property details
        property_type: record.PropertyType || "",
        property_sub_type: record.PropertySubType || "",
        bedrooms_total: record.BedroomsTotal || 0,
        bathrooms_total_integer: record.BathroomsTotalInteger || 0,
        bathrooms_half: record.BathroomsHalf || 0,
        living_area: record.LivingArea || null,
        living_area_range: record.LivingAreaRange || "",
        living_area_units: record.LivingAreaUnits || "Square Feet",
        lot_size_acres: record.LotSizeAcres || null,
        lot_size_square_feet: record.LotSizeSquareFeet || null,
        year_built: record.YearBuilt || null,
        stories: record.Stories || null,
        garage_spaces: record.GarageSpaces || 0,
        parking_total: record.ParkingTotal || 0,

        // Remarks
        public_remarks: record.PublicRemarks || "",
        private_remarks: record.PrivateRemarks || "",
        showing_instructions: record.ShowingInstructions || "",
        directions: record.Directions || "",

        // Listing agent
        list_agent_key: record.ListAgentKey || "",
        list_agent_full_name: record.ListAgentFullName || "",
        list_agent_email: record.ListAgentEmail || "",
        list_agent_phone:
          record.ListAgentDirectPhone ||
          record.ListAgentOfficePhone ||
          "",
        list_office_key: record.ListOfficeKey || "",
        list_office_name: record.ListOfficeName || "",
        list_office_phone: record.ListOfficePhone || "",
        attribution_contact: record.AttributionContact || "",

        // Buyer agent
        buyer_agent_key: record.BuyerAgentKey || "",
        buyer_agent_full_name: record.BuyerAgentFullName || "",
        buyer_office_key: record.BuyerOfficeKey || "",
        buyer_office_name: record.BuyerOfficeName || "",

        // Dates
        list_date: record.ListingContractDate || null,
        close_date: record.CloseDate || null,
        expiration_date: record.ExpirationDate || null,
        days_on_market: record.DaysOnMarket || 0,
        cumulative_days_on_market: record.CumulativeDaysOnMarket || 0,

        // Location
        latitude: record.Latitude || null,
        longitude: record.Longitude || null,

        // HOA / Association
        association_fee: record.AssociationFee || null,
        association_fee_frequency: record.AssociationFeeFrequency || "",
        association_name: record.AssociationName || "",

        // Taxes
        tax_annual_amount: record.TaxAnnualAmount || null,
        tax_year: record.TaxYear || null,

        // Features (arrays)
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

        // Utilities
        water_source: record.WaterSource || [],
        sewer: record.Sewer || [],
        electric: record.Electric || [],
        internet_whole_listing: record.InternetWholeListing || [],

        // Zoning
        zoning: record.Zoning || "",
        restrictions: record.Restrictions || [],

        // BBO: Lock box
        lock_box_type: record.LockBoxType || "",
        lock_box_serial_number: record.LockBoxSerialNumber || "",
        lock_box_location: record.LockBoxLocation || "",

        // BBO: Showing contact
        showing_contact_name: record.ShowingContactName || "",
        showing_contact_phone: record.ShowingContactPhone || "",
        showing_contact_type: record.ShowingContactType || "",

        // BBO: Commission / compensation
        buyer_agency_compensation: record.BuyerAgencyCompensation || "",
        sub_agency_compensation: record.SubAgencyCompensation || "",
        transaction_broker_compensation: record.TransactionBrokerCompensation || "",

        // BBO: Occupant info
        occupant_name: record.OccupantName || "",
        occupant_phone: record.OccupantPhone || "",
        occupant_type: record.OccupantType || "",

        // BBO: Listing terms
        listing_agreement: record.ListingAgreement || "",
        special_listing_conditions: record.SpecialListingConditions || "",

        // Virtual tour / video
        virtual_tour_url: record.VirtualTourURLUnbranded || record.VirtualTourURLBranded || "",
        video_url: record.VideoURL || "",

        // Seller concessions
        concessions_amount: record.ConcessionsAmount || null,
        concessions_comments: record.ConcessionsComments || "",

        // Raw JSON (complete record for unmapped fields)
        raw_data: record,

        updated_at: new Date().toISOString(),
      };

      // ── Price History Tracking ──────────────────────────────
      // Read existing record BEFORE upsert to detect changes
      const currentPrice = record.ListPrice || null;
      const currentStatus = stdStatus;

      const { data: existing } = await supabase
        .from("mls_listings")
        .select("list_price, standard_status, full_address, city")
        .eq("listing_key", listingKey)
        .single();

      if (!existing) {
        // New listing — record LISTED event
        if (currentPrice) {
          await supabase.from("price_history").insert({
            listing_key: listingKey,
            price: currentPrice,
            event_type: "LISTED",
            source: "CSAR",
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
            source: "CSAR",
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
                console.log(`[Navica Sync] Price drop alerts sent for ${address} to ${(profiles || []).length} users`);
              }
            } catch (err) {
              console.warn("[Navica Sync] Price drop notification error:", err);
            }
          }
        }

        // Detect status transitions
        if (prevStatus !== currentStatus) {
          if (
            currentStatus === "Pending" ||
            currentStatus === "Active Under Contract"
          ) {
            await supabase.from("price_history").insert({
              listing_key: listingKey,
              price: currentPrice,
              event_type: "PENDING",
              source: "CSAR",
              previous_price: prevPrice,
            });
          } else if (currentStatus === "Closed") {
            await supabase.from("price_history").insert({
              listing_key: listingKey,
              price: record.ClosePrice || currentPrice,
              event_type: "SOLD",
              source: "CSAR",
              previous_price: prevPrice,
            });
          } else if (
            prevStatus === "Pending" &&
            currentStatus === "Active"
          ) {
            await supabase.from("price_history").insert({
              listing_key: listingKey,
              price: currentPrice,
              event_type: "BACK_ON_MARKET",
              source: "CSAR",
              previous_price: prevPrice,
            });
          }
        }
      }

      // Upsert the listing
      await supabase
        .from("mls_listings")
        .upsert(listing, { onConflict: "listing_key" });

      // ── Media Handling ─────────────────────────────────────
      // Media comes expanded from the Property query ($expand=Media)
      const media = record.Media || [];
      if (media.length > 0) {
        // Delete existing media for this listing, re-insert fresh
        await supabase
          .from("mls_media")
          .delete()
          .eq("listing_key", listingKey);

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

    // Follow @odata.nextLink for pagination (RESO Web API standard)
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
  let url = (isInitial || !lastTimestamp)
    ? `${NAVICA_API_BASE}/Member?$top=${PAGE_SIZE}&$orderby=APIModificationTimestamp asc`
    : `${NAVICA_API_BASE}/Member?$filter=APIModificationTimestamp gt ${normalizeTimestamp(lastTimestamp!)}&$top=${PAGE_SIZE}&$orderby=APIModificationTimestamp asc`;

  let totalSynced = 0;
  let greatestTimestamp = lastTimestamp || "";

  while (url && totalSynced < maxRecords) {
    const data = await navicaFetch(url);
    const records = data.value || [];

    console.log(`[NavicaSync] Member page: ${records.length} records`);

    for (const r of records) {
      if (totalSynced >= maxRecords) break;
      const modTs = r.APIModificationTimestamp || r.ModificationTimestamp || "";
      if (modTs > greatestTimestamp) greatestTimestamp = modTs;
      const key = r.MemberKey || "";
      const status = r.MemberStatus || "Active";

      if (status === "Inactive" || status === "Deleted") {
        await supabase
          .from("mls_members")
          .delete()
          .eq("member_key", key);
      } else {
        await supabase.from("mls_members").upsert(
          {
            member_key: key,
            member_mls_id: r.MemberMlsId || "",
            originating_system_name:
              r.OriginatingSystemName || ORIGINATING_SYSTEM,
            modification_timestamp: modTs,
            mlg_can_view: true,
            member_full_name: r.MemberFullName || "",
            member_first_name: r.MemberFirstName || "",
            member_last_name: r.MemberLastName || "",
            member_email: r.MemberEmail || "",
            member_phone:
              r.MemberDirectPhone || r.MemberOfficePhone || "",
            member_mobile_phone: r.MemberMobilePhone || "",
            member_office_key:
              r.OfficeMlsId || r.OfficeKey || "",
            member_status: status,
            raw_data: r,
            updated_at: new Date().toISOString(),
          },
          { onConflict: "member_key" }
        );
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
  let url = (isInitial || !lastTimestamp)
    ? `${NAVICA_API_BASE}/Office?$top=${PAGE_SIZE}&$orderby=APIModificationTimestamp asc`
    : `${NAVICA_API_BASE}/Office?$filter=APIModificationTimestamp gt ${normalizeTimestamp(lastTimestamp!)}&$top=${PAGE_SIZE}&$orderby=APIModificationTimestamp asc`;

  let totalSynced = 0;
  let greatestTimestamp = lastTimestamp || "";

  while (url && totalSynced < maxRecords) {
    const data = await navicaFetch(url);
    const records = data.value || [];

    console.log(`[NavicaSync] Office page: ${records.length} records`);

    for (const r of records) {
      if (totalSynced >= maxRecords) break;
      const modTs = r.APIModificationTimestamp || r.ModificationTimestamp || "";
      if (modTs > greatestTimestamp) greatestTimestamp = modTs;
      const key = r.OfficeKey || "";
      const status = r.OfficeStatus || "Active";

      if (status === "Inactive" || status === "Deleted") {
        await supabase
          .from("mls_offices")
          .delete()
          .eq("office_key", key);
      } else {
        await supabase.from("mls_offices").upsert(
          {
            office_key: key,
            office_mls_id: r.OfficeMlsId || "",
            originating_system_name:
              r.OriginatingSystemName || ORIGINATING_SYSTEM,
            modification_timestamp: modTs,
            mlg_can_view: true,
            office_name: r.OfficeName || "",
            office_phone: r.OfficePhone || "",
            office_email: r.OfficeEmail || "",
            office_address: [r.OfficeAddress1, r.OfficeAddress2]
              .filter(Boolean)
              .join(", "),
            office_city: r.OfficeCity || "",
            office_state: r.OfficeStateOrProvince || "",
            office_postal_code: r.OfficePostalCode || "",
            office_status: status,
            raw_data: r,
            updated_at: new Date().toISOString(),
          },
          { onConflict: "office_key" }
        );
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
  let url = (isInitial || !lastTimestamp)
    ? `${NAVICA_API_BASE}/OpenHouse?$top=${PAGE_SIZE}&$orderby=APIModificationTimestamp asc`
    : `${NAVICA_API_BASE}/OpenHouse?$filter=APIModificationTimestamp gt ${normalizeTimestamp(lastTimestamp!)}&$top=${PAGE_SIZE}&$orderby=APIModificationTimestamp asc`;

  let totalSynced = 0;
  let greatestTimestamp = lastTimestamp || "";

  while (url && totalSynced < maxRecords) {
    const data = await navicaFetch(url);
    const records = data.value || [];

    console.log(
      `[NavicaSync] OpenHouse page: ${records.length} records`
    );

    for (const r of records) {
      if (totalSynced >= maxRecords) break;
      const modTs = r.APIModificationTimestamp || r.ModificationTimestamp || "";
      if (modTs > greatestTimestamp) greatestTimestamp = modTs;
      const key = r.OpenHouseKey || "";

      // OpenHouses don't have a status — they simply exist or are removed.
      // If we re-encounter one, upsert it. Expired ones stop appearing.
      await supabase.from("mls_open_houses").upsert(
        {
          open_house_key: key,
          listing_key: r.ListingKey || null,
          listing_id: r.ListingId || "",
          originating_system_name:
            r.OriginatingSystemName || ORIGINATING_SYSTEM,
          modification_timestamp: modTs,
          mlg_can_view: true,
          open_house_date: r.OpenHouseDate || null,
          open_house_start_time: r.OpenHouseStartTime || null,
          open_house_end_time: r.OpenHouseEndTime || null,
          open_house_remarks: r.OpenHouseRemarks || "",
          showing_agent_key: r.ShowingAgentKey || "",
          raw_data: r,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "open_house_key" }
      );
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
  // CORS preflight
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
    return new Response(JSON.stringify({ error: "POST only" }), {
      status: 405,
    });
  }

  if (!NAVICA_SERVER_TOKEN) {
    return new Response(
      JSON.stringify({
        error: "Missing NAVICA_SERVER_TOKEN env var",
      }),
      { status: 500 }
    );
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

  try {
    const body = await req.json();
    const action = body.action || "sync"; // "sync" | "initial-import" | "sync-active"
    const resource = body.resource || "all"; // "all" | "Property" | etc.
    const maxRecords = body.limit || DEFAULT_MAX_RECORDS; // max records per invocation
    const isInitial = action === "initial-import";
    // Optional OData $filter to pass to Property sync (e.g. "StandardStatus eq 'Active'")
    const extraFilter = body.filter || "";
    // Shortcut: "sync-active" action auto-sets filter for active/pending listings
    const activeFilter = action === "sync-active"
      ? "StandardStatus eq 'Active' or StandardStatus eq 'Pending' or StandardStatus eq 'Active Under Contract'"
      : extraFilter;

    console.log(
      `[NavicaSync] Starting ${action} for resource: ${resource} (limit: ${maxRecords})${activeFilter ? " filter: " + activeFilter : ""}`
    );

    const resources =
      resource === "all"
        ? ["Property", "Member", "Office", "OpenHouse"]
        : [resource];

    const results: Record<string, any> = {};

    // Process sequentially (one resource at a time)
    for (const res of resources) {
      const syncFn = SYNC_FNS[res];
      if (!syncFn) {
        results[res] = { error: `Unknown resource: ${res}` };
        continue;
      }

      // Sync state uses prefixed resource type: "Navica_Property", etc.
      const syncStateKey = `${SYNC_PREFIX}${res}`;

      const { data: syncState } = await supabase
        .from("mls_sync_state")
        .select("*")
        .eq("resource_type", syncStateKey)
        .single();

      // sync-active uses timestamp for resumption across invocations (combined with status filter)
      const lastTs = isInitial
        ? null
        : syncState?.last_modification_timestamp || null;

      // Mark as running
      const { error: runErr } = await supabase
        .from("mls_sync_state")
        .update({ status: "running", error_message: "" })
        .eq("resource_type", syncStateKey);
      if (runErr) console.error(`[NavicaSync] Failed to mark ${syncStateKey} running:`, runErr.message);

      try {
        // Pass activeFilter only to Property sync (other resources don't need it)
        const result = res === "Property"
          ? await syncFn(supabase, isInitial, lastTs, maxRecords, activeFilter)
          : await syncFn(supabase, isInitial, lastTs, maxRecords);

        // Update sync state with results
        const updatePayload = {
          last_modification_timestamp: result.greatestTimestamp || lastTs,
          last_sync_at: new Date().toISOString(),
          records_synced: result.totalSynced,
          status: "idle", // CHECK constraint allows: idle, running, error
          error_message: result.hasMore
            ? `Partial: ${result.totalSynced} records synced, more available. Invoke again to continue.`
            : "",
          originating_system_name: ORIGINATING_SYSTEM,
        };
        console.log(`[NavicaSync] Updating sync state for ${syncStateKey}:`, JSON.stringify(updatePayload));
        const { error: updateErr } = await supabase
          .from("mls_sync_state")
          .update(updatePayload)
          .eq("resource_type", syncStateKey);
        if (updateErr) console.error(`[NavicaSync] Sync state update FAILED:`, updateErr.message);

        results[res] = {
          synced: result.totalSynced,
          lastTimestamp: result.greatestTimestamp,
          hasMore: result.hasMore,
        };

        console.log(
          `[NavicaSync] ${res}: synced ${result.totalSynced} records${result.hasMore ? " (more available)" : ""}`
        );
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        await supabase
          .from("mls_sync_state")
          .update({ status: "error", error_message: msg })
          .eq("resource_type", syncStateKey);
        results[res] = { error: msg };
        console.error(`[NavicaSync] ${res} error: ${msg}`);
      }
    }

    return new Response(
      JSON.stringify({ ok: true, action, source: "CSAR", results }),
      {
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
        },
      }
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[NavicaSync] Fatal error: ${msg}`);
    return new Response(JSON.stringify({ ok: false, error: msg }), {
      status: 500,
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*",
      },
    });
  }
});
