// Public Records Sync — Fetches tax/assessment data from NC county ArcGIS APIs
// Runs weekly via cron to populate the public_records table
// Data sources: NC OneMap (statewide), Haywood County Open Data, Jackson County Open Data

import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
const SUPABASE_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";

// NC OneMap Parcels FeatureServer — covers all 100 NC counties
const NC_ONEMAP_URL =
  "https://services.nconemap.gov/secure/rest/services/NC1Map_Parcels/FeatureServer/0/query";

// County-specific ArcGIS endpoints (richer data for these counties)
const COUNTY_ENDPOINTS: Record<string, string> = {
  Haywood:
    "https://maps.haywoodcountync.gov/arcgis/rest/services/Land_Records/Open_Data/MapServer/0/query",
  Jackson:
    "https://gis.jacksonnc.org/arcgis/rest/services/Parcels/MapServer/0/query",
};

// Known county tax rates (per $100 assessed value) — update annually
const COUNTY_TAX_RATES: Record<string, number> = {
  Haywood: 0.489, // county only
  Jackson: 0.44,
  Swain: 0.432,
  Macon: 0.368,
};

const REQUEST_DELAY_MS = 500;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

serve(async (req) => {
  if (req.method !== "POST") {
    return new Response("POST required", { status: 405 });
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

  try {
    const body = await req.json();
    const action = body.action || "sync";
    const county = body.county || "all"; // "all", "Haywood", "Jackson", etc.
    const limit = body.limit || 500; // max listings to process per run

    console.log(`[PublicRecords] Starting ${action} for county: ${county}`);

    // Get active MLS listings that need public record data
    let query = supabase
      .from("mls_listings")
      .select(
        "listing_key, street_number, street_name, street_suffix, city, county_or_parish, postal_code"
      )
      .eq("mlg_can_view", true)
      .not("street_number", "eq", "")
      .not("street_name", "eq", "");

    if (county !== "all") {
      query = query.ilike("county_or_parish", `%${county}%`);
    }

    const { data: listings, error: listErr } = await query.limit(limit);

    if (listErr) throw listErr;
    if (!listings || listings.length === 0) {
      return jsonResponse({ status: "ok", message: "No listings to process" });
    }

    console.log(`[PublicRecords] Processing ${listings.length} listings`);

    let matched = 0;
    let skipped = 0;
    let errors = 0;

    for (const listing of listings) {
      try {
        const address = buildAddress(listing);
        const countyName = listing.county_or_parish || "";

        // Check if we already have recent data (skip if updated within 7 days)
        const { data: existing } = await supabase
          .from("public_records")
          .select("updated_at")
          .eq("listing_key", listing.listing_key)
          .order("year", { ascending: false })
          .limit(1);

        if (existing && existing.length > 0) {
          const lastUpdate = new Date(existing[0].updated_at);
          const daysSince =
            (Date.now() - lastUpdate.getTime()) / (1000 * 60 * 60 * 24);
          if (daysSince < 7) {
            skipped++;
            continue;
          }
        }

        // Try county-specific endpoint first, fallback to NC OneMap
        let parcelData = null;

        if (COUNTY_ENDPOINTS[countyName]) {
          parcelData = await queryArcGIS(
            COUNTY_ENDPOINTS[countyName],
            address,
            countyName
          );
        }

        if (!parcelData) {
          parcelData = await queryNCOneMap(address, countyName);
        }

        if (parcelData) {
          // Upsert public record
          const currentYear = new Date().getFullYear();
          const taxRate = COUNTY_TAX_RATES[countyName] || 0.45;
          const assessedValue = parcelData.totalValue || 0;
          const estimatedTax = assessedValue > 0 ? (assessedValue / 100) * taxRate : null;

          await supabase.from("public_records").upsert(
            {
              listing_key: listing.listing_key,
              parcel_id: parcelData.parcelId || "",
              year: currentYear,
              assessed_value: assessedValue,
              land_value: parcelData.landValue || null,
              improved_value: parcelData.improvedValue || null,
              tax_amount: parcelData.taxAmount || estimatedTax,
              source_county: countyName,
              source_url: parcelData.sourceUrl || "NC OneMap",
              updated_at: new Date().toISOString(),
            },
            { onConflict: "listing_key,year" }
          );

          // If we got prior year data, insert that too
          if (parcelData.priorYearValue && parcelData.priorYear) {
            const priorTax =
              parcelData.priorYearValue > 0
                ? (parcelData.priorYearValue / 100) * taxRate
                : null;
            await supabase.from("public_records").upsert(
              {
                listing_key: listing.listing_key,
                parcel_id: parcelData.parcelId || "",
                year: parcelData.priorYear,
                assessed_value: parcelData.priorYearValue,
                land_value: null,
                improved_value: null,
                tax_amount: priorTax,
                source_county: countyName,
                source_url: parcelData.sourceUrl || "NC OneMap",
                updated_at: new Date().toISOString(),
              },
              { onConflict: "listing_key,year" }
            );
          }

          matched++;
        } else {
          skipped++;
        }

        await sleep(REQUEST_DELAY_MS);
      } catch (err) {
        console.warn(
          `[PublicRecords] Error processing ${listing.listing_key}:`,
          err
        );
        errors++;
      }
    }

    console.log(
      `[PublicRecords] Done. Matched: ${matched}, Skipped: ${skipped}, Errors: ${errors}`
    );

    return jsonResponse({
      status: "ok",
      processed: listings.length,
      matched,
      skipped,
      errors,
    });
  } catch (err) {
    console.error("[PublicRecords] Fatal error:", err);
    return jsonResponse({ status: "error", message: String(err) }, 500);
  }
});

// ── Query NC OneMap statewide parcel data ──
async function queryNCOneMap(
  address: string,
  county: string
): Promise<ParcelData | null> {
  const whereClause = buildWhereClause(address, county, "nconemap");
  const params = new URLSearchParams({
    where: whereClause,
    outFields:
      "PARNO,ESSION,TOTVAL,LANDVAL,IMPVAL,ADDR,CITY,STATEABBR,ZIPCODE,ACRES",
    returnGeometry: "false",
    f: "json",
    resultRecordCount: "1",
  });

  try {
    const resp = await fetch(`${NC_ONEMAP_URL}?${params.toString()}`);
    if (!resp.ok) return null;
    const data = await resp.json();

    if (!data.features || data.features.length === 0) return null;

    const attrs = data.features[0].attributes;
    return {
      parcelId: attrs.PARNO || attrs.ESSION || "",
      totalValue: attrs.TOTVAL || 0,
      landValue: attrs.LANDVAL || 0,
      improvedValue: attrs.IMPVAL || 0,
      taxAmount: null, // NC OneMap doesn't include tax amount directly
      sourceUrl: "NC OneMap",
      priorYearValue: null,
      priorYear: null,
    };
  } catch (err) {
    console.warn("[PublicRecords] NC OneMap query error:", err);
    return null;
  }
}

// ── Query county-specific ArcGIS endpoint ──
async function queryArcGIS(
  endpoint: string,
  address: string,
  county: string
): Promise<ParcelData | null> {
  const whereClause = buildWhereClause(address, county, "county");
  const params = new URLSearchParams({
    where: whereClause,
    outFields: "*",
    returnGeometry: "false",
    f: "json",
    resultRecordCount: "1",
  });

  try {
    const resp = await fetch(`${endpoint}?${params.toString()}`);
    if (!resp.ok) return null;
    const data = await resp.json();

    if (!data.features || data.features.length === 0) return null;

    const attrs = data.features[0].attributes;

    // County schemas vary — try common field names
    const totalValue =
      attrs.TOTAL_VALUE ||
      attrs.TOTVAL ||
      attrs.TOTALVALUE ||
      attrs.APPRAISEDVALUE ||
      attrs.MARKET_VALUE ||
      0;
    const landValue =
      attrs.LAND_VALUE ||
      attrs.LANDVAL ||
      attrs.LANDVALUE ||
      0;
    const improvedValue =
      attrs.IMPROVED_VALUE ||
      attrs.IMPVAL ||
      attrs.BLDGVALUE ||
      attrs.BUILDING_VALUE ||
      0;
    const taxAmount =
      attrs.TAX_AMOUNT ||
      attrs.TAXAMOUNT ||
      attrs.TOTAL_TAX ||
      null;
    const parcelId =
      attrs.PARCEL_ID ||
      attrs.PARNO ||
      attrs.PIN ||
      attrs.PARCELID ||
      attrs.REID ||
      "";

    return {
      parcelId: String(parcelId),
      totalValue,
      landValue,
      improvedValue,
      taxAmount,
      sourceUrl: `${county} County GIS`,
      priorYearValue: null,
      priorYear: null,
    };
  } catch (err) {
    console.warn(`[PublicRecords] ${county} query error:`, err);
    return null;
  }
}

// ── Build address string for ArcGIS query ──
function buildAddress(listing: any): string {
  const parts = [
    listing.street_number || "",
    listing.street_name || "",
    listing.street_suffix || "",
  ].filter(Boolean);
  return parts.join(" ").trim();
}

// ── Build WHERE clause for ArcGIS queries ──
function buildWhereClause(
  address: string,
  county: string,
  source: string
): string {
  // Escape single quotes for SQL
  const safeAddr = address.replace(/'/g, "''");

  if (source === "nconemap") {
    // NC OneMap uses ADDR field and county filter
    const safeCounty = county.replace(/'/g, "''");
    return `ADDR LIKE '%${safeAddr}%'${
      safeCounty ? ` AND CNTYNAME = '${safeCounty}'` : ""
    }`;
  }

  // County-specific: typically SITUS_ADDR or LOCATION or PHYADDR
  return `(SITUS_ADDR LIKE '%${safeAddr}%' OR LOCATION LIKE '%${safeAddr}%' OR PHYADDR LIKE '%${safeAddr}%' OR ADDR LIKE '%${safeAddr}%')`;
}

// ── Types ──
interface ParcelData {
  parcelId: string;
  totalValue: number;
  landValue: number;
  improvedValue: number;
  taxAmount: number | null;
  sourceUrl: string;
  priorYearValue: number | null;
  priorYear: number | null;
}

function jsonResponse(data: any, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
