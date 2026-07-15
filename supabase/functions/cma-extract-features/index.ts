// CMA Feature Extraction Edge Function
// Uses Claude API to analyze MLS listing remarks and extract mountain-specific features
// for Comparative Market Analysis (views, water, land character, road noise, etc.)
//
// Deploy: supabase functions deploy cma-extract-features
// Invoke: POST /functions/v1/cma-extract-features
//   { "action": "extract-single", "listing_key": "..." }
//   { "action": "backfill", "limit": 25 }
//   { "action": "stats" }
//
// Env vars required:
//   ANTHROPIC_API_KEY           - Claude API key
//   SUPABASE_URL                - Supabase project URL
//   SUPABASE_SERVICE_ROLE_KEY   - Supabase service role key

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY") || "";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
const SUPABASE_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";

const EXTRACTION_MODEL = "claude-sonnet-5";
const REQUEST_DELAY_MS = 800; // Delay between Claude API calls

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

// USGS Elevation API
async function getElevation(lat: number, lng: number): Promise<number | null> {
  try {
    const url = `https://epqs.nationalmap.gov/v1/json?x=${lng}&y=${lat}&units=Feet&wkid=4326`;
    const resp = await fetch(url);
    if (!resp.ok) return null;
    const data = await resp.json();
    const elev = parseFloat(data?.value);
    return isNaN(elev) || elev < 0 ? null : Math.round(elev);
  } catch {
    return null;
  }
}

// Build the system prompt for feature extraction
const SYSTEM_PROMPT = `You are analyzing Western North Carolina mountain property listings for a Comparative Market Analysis tool.
Extract mountain-specific features from the listing data provided.

Use these WNC-calibrated rating scales:

view_quality (1-5):
  1 = No view, surrounded by trees or other structures
  2 = Filtered or seasonal view through trees
  3 = Partial mountain view, some obstruction
  4 = Good long-range mountain view, mostly unobstructed
  5 = Panoramic or layered mountain view, exceptional 180+ degrees

water_quality (1-5):
  1 = No water features
  2 = Nearby creek or water access (not on property)
  3 = Creek or stream runs through property
  4 = Creek frontage, pond, or significant water feature
  5 = River frontage, waterfall, or multiple water features

land_usability (1-5):
  1 = Very steep, cliff-like terrain, mostly unbuildable
  2 = Mostly steep with small usable areas
  3 = Mixed terrain, some level and some steep
  4 = Gentle slope, mostly usable land
  5 = Level or gently rolling, fully usable

road_noise (1-5):
  1 = On or adjacent to highway/major road, significant noise
  2 = Near secondary road, moderate noise
  3 = Set back from road, some ambient noise
  4 = Quiet residential area, minimal noise
  5 = Secluded, no road noise, end of road or long driveway

condition_rating (1-5):
  1 = Needs major renovation, structural issues
  2 = Dated, needs significant updates (kitchen, baths, systems)
  3 = Average condition, livable but not updated
  4 = Well maintained, some recent updates
  5 = Fully renovated, new construction, or move-in perfect

privacy_rating (1-5):
  1 = No privacy, close neighbors on all sides
  2 = Limited privacy, neighbors visible and close
  3 = Moderate privacy, some separation from neighbors
  4 = Good privacy, significant setback or tree buffer
  5 = Very private, secluded, no visible neighbors

For arrays, use these standard values:

view_type: long_range, layered_mountain, seasonal, filtered, valley, pastoral, wooded, city_lights, lake, none
water_features: creek_frontage, creek_on_property, river_frontage, pond, spring, branch, waterfall, lake_access, none
land_character: wooded, pasture, cleared, steep, gentle_slope, rolling, flat, rocky, mixed
road_access: paved_state, paved_county, paved_private, gravel, dirt, shared, gated, state_maintained
outbuildings: detached_garage, barn, workshop, shed, greenhouse, guest_house, carport, root_cellar
special_features: wrap_porch, screened_porch, stone_fireplace, wood_stove, hot_tub, deck, covered_porch, rocking_chair_porch, outdoor_kitchen, garden, fenced_yard, dog_run
utilities_available: public_water, well, shared_well, public_sewer, septic_installed, septic_needed, electric_at_road, underground_electric, natural_gas, propane, no_electric

winter_access values: year_round_paved, year_round_gravel, seasonal_difficulty, chains_recommended, four_wheel_drive
perc_status values: approved, failed, not_tested, unknown
timber_quality values: mature_hardwood, young_growth, mixed, cleared, unknown

restriction_status: Determines if the property has deed restrictions/covenants/HOA or is unrestricted.
- "unrestricted" = No deed restrictions, no HOA, no covenants. Look for: "unrestricted" in remarks, Restrictions field = "None", no HOA fees. In WNC unrestricted is a major selling point.
- "restricted" = Has deed restrictions, HOA, covenants, subdivision rules. Look for: Restrictions field has entries (other than "None"), HOA/association fees present, remarks mention covenants or restrictions.
- "unknown" = Cannot determine from available data.

NC-SPECIFIC NOTES:
- Construction type: WNC has many manufactured and modular homes. Look for clues in Construction Type, Body Type, Structure Type fields, and in remarks. Important distinctions:
  * "mobile_home" = pre-June 1976 (before HUD code). These are unfinanceable and a separate market. Use if year_built < 1976 AND indicators show factory-built, OR if remarks say "mobile home" and it's clearly old.
  * "manufactured" = post-June 1976 HUD code homes. Indicators: "manufactured", "double wide", "single wide", "HUD code", "on frame". If year_built >= 1976 and factory-built, use this.
  * "modular" = built to same building codes as site-built, assembled on-site. Indicators: "modular" in Construction Type or remarks.
  * "site_built" = traditional stick-built construction.
  * "log" = log cabin construction.
  Use year_built to help distinguish mobile_home vs manufactured when clues are ambiguous.
- Septic bedrooms: NC has no legal definition of "bedroom." In rural areas on septic, the septic permit (120 gal/day/bedroom) sets the functional bedroom count. If remarks mention a specific septic permit capacity (e.g., "3-bedroom septic" or "septic approved for 3 bedrooms"), extract septic_permitted_bedrooms. This may differ from the MLS bedroom count.
- Above/below grade sqft: NC REALTORS combine all Heated Living Area (HLA) into one number, but above-grade and below-grade sqft are valued differently for appraisals. If structured MLS data provides AboveGradeFinishedArea and BelowGradeFinishedArea, use those. If remarks mention "finished basement" or "lower level," infer a split. Set sqft_source to "mls_structured" if from MLS fields or "ai_inferred" if estimated from context.

Return a JSON object with exactly these fields (no additional text, just valid JSON):
{
  "view_quality": <1-5>,
  "view_type": [<strings>],
  "water_quality": <1-5>,
  "water_features": [<strings>],
  "land_usability": <1-5>,
  "land_character": [<strings>],
  "road_noise": <1-5>,
  "road_access": [<strings>],
  "condition_rating": <1-5>,
  "condition_notes": "<brief note about condition>",
  "privacy_rating": <1-5>,
  "winter_access": "<value>",
  "outbuildings": [<strings>],
  "special_features": [<strings>],
  "above_grade_sqft": <int or null>,
  "below_grade_sqft": <int or null>,
  "sqft_source": "<mls_structured|ai_inferred|unknown>",
  "septic_permitted_bedrooms": <int or null>,
  "utilities_available": [<strings>],
  "perc_status": "<value or null>",
  "timber_quality": "<value or null>",
  "buildable_sites": <int or null>,
  "road_frontage_ft": <int or null>,
  "subdivision_potential": <boolean or null>,
  "construction_type": "<site_built|manufactured|modular|mobile_home|log|unknown>",
  "restriction_status": "<unrestricted|restricted|unknown>",
  "restrictions_summary": "<brief summary of restrictions or empty string>",
  "has_pool": <boolean>,
  "pool_type": "<in_ground|above_ground|indoor|none>",
  "basement_type": "<finished|partial|unfinished|crawl_space|none>",
  "basement_sqft": <int or null>,
  "has_fireplace": <boolean>,
  "fireplace_count": <int>,
  "fireplace_type": "<stone|brick|gas|wood_burning|electric|multiple|none>",
  "covered_outdoor_sqft": <int or null>,
  "garage_type": "<attached|detached|carport|none>",
  "garage_sqft": <int or null>,
  "outbuilding_count": <int>,
  "outbuilding_value_tier": <0-3>,
  "confidence": <0.0-1.0 how confident you are in these ratings>
}

STRUCTURAL FEATURE NOTES:
- Pool: In WNC mountains, pools are uncommon. Check PoolFeatures, PoolPrivateYN fields AND remarks. "in_ground" for permanent pools, "above_ground" for removable ones.
- Basement: Very common in WNC mountain homes due to sloped terrain. "finished" = full living space with heating, "partial" = some rooms finished, "unfinished" = storage/utility only, "crawl_space" = access-only. Check Basement, BasementYN, BelowGradeFinishedArea, NAV27_BasementHeatedSqFt fields.
- Fireplace: Stone/masonry fireplaces are premium WNC features. Count total fireplaces. Check FireplaceYN, FireplacesTotal, FireplaceFeatures fields.
- Covered outdoor space: Estimate total sqft of covered porches, screened porches, covered decks combined. Mountain homes often have substantial covered porch space. Check PatioAndPorchFeatures and remarks. Only count COVERED areas, not open decks.
- Garage: Check GarageYN, GarageSpaces, AttachedGarageYN, CAR_SqFtGarage for type and size. A standard single-car space is ~400 sqft. An oversized/shop garage may be 800-1200+ sqft.
- Outbuilding value tier: 0=none, 1=small (shed, basic carport, value $2-5K), 2=medium (workshop, multi-car detached garage, value $10-20K), 3=large (barn, guest house, large commercial structure, value $25K+). Count separate structures only, not attached garages.

If a feature cannot be determined from the listing data, use your best judgment based on context clues. Set confidence lower (0.3-0.5) when guessing. If you have strong evidence from the remarks, set confidence higher (0.7-0.9).

For land listings with no structure, set condition_rating to null and condition_notes to "Vacant land".
For residential listings, set land-only fields (timber_quality, buildable_sites, subdivision_potential) to null unless clearly relevant.`;

// Extract features for a single listing
async function extractFeatures(
  listing: Record<string, unknown>
): Promise<Record<string, unknown> | null> {
  const remarks = (listing.public_remarks as string) || "";
  const privateRemarks = (listing.private_remarks as string) || "";
  const rawData = (listing.raw_data as Record<string, unknown>) || {};
  const viewArr = (listing.view as string[]) || [];
  const waterArr = (listing.waterfront_features as string[]) || [];
  const extFeatures = (listing.exterior_features as string[]) || [];
  const intFeatures = (listing.interior_features as string[]) || [];

  // Extract structured MLS fields from raw_data for above/below grade and other details
  const foundationArr = (listing.foundation_details as string[]) || [];
  const sewerArr = (listing.sewer as string[]) || [];
  const waterSourceArr = (listing.water_source as string[]) || [];
  const electricArr = (listing.electric as string[]) || [];
  const roadSurface = (rawData.RoadSurfaceType as string[]) || [];
  const lotFeatures = (rawData.LotFeatures as string[]) || [];
  const basementArr = (rawData.Basement as string[]) || [];

  // Above/below grade from structured MLS data (Canopy MLS provides these)
  const aboveGrade = rawData.AboveGradeFinishedArea as number | null;
  const belowGrade = rawData.BelowGradeFinishedArea as number | null;
  const sqftMain = rawData.CAR_SqFtMain as string | null;
  const sqftUpper = rawData.CAR_SqFtUpper as string | null;
  const sqftLower = rawData.CAR_SqFtLower as string | null;
  const sqftBasement = rawData.CAR_SqFtUnheatedBasement as string | null;
  const basementYN = rawData.BasementYN as boolean | null;
  const elevation = rawData.Elevation as number | null;

  // Pool, fireplace, porch features from MLS
  const poolFeatures = (rawData.PoolFeatures as string[]) || [];
  const poolPrivateYN = rawData.PoolPrivateYN as boolean | null;
  const fireplaceYN = rawData.FireplaceYN as boolean | null;
  const fireplaceFeatures = (rawData.FireplaceFeatures as string[]) || [];
  const fireplaceTotal = rawData.FireplacesTotal as number | null;
  const patioAndPorch = (rawData.PatioAndPorchFeatures as string[]) || [];
  const attachedGarageYN = rawData.AttachedGarageYN as boolean | null;
  const garageSqft = rawData.CAR_SqFtGarage as string | null;

  // Navica-specific fields
  const navBasementHtdSqft = rawData.NAV27_BasementHeatedSqFt as string | null;
  const navRestrictions = rawData.NAV27_Restrictions as boolean | null;
  const navRestrictionDesc = rawData.NAV27_Restriction_Desc as string | null;

  // Restrictions from Canopy
  const carRestrictions = rawData.CAR_Restrictions as string | null;

  // Construction type / Body type (manufactured/modular detection)
  const carConstructionType = rawData.CAR_ConstructionType as string | null;
  const bodyType = rawData.BodyType as string[] | null;
  const structureType = rawData.StructureType as string[] | null;
  const architecturalStyle = rawData.ArchitecturalStyle as string[] | null;

  // Build context for Claude
  const propertyContext = [
    `Address: ${listing.full_address || ""}, ${listing.city || ""}, NC`,
    `Property Type: ${listing.property_type || ""}`,
    `Subtype: ${listing.property_sub_type || ""}`,
    listing.living_area ? `Living Area (Total HLA): ${listing.living_area} sqft` : "",
    aboveGrade != null ? `Above Grade Finished Area: ${aboveGrade} sqft` : "",
    belowGrade != null && belowGrade > 0 ? `Below Grade Finished Area: ${belowGrade} sqft` : "",
    sqftMain ? `Main Level Sqft: ${sqftMain}` : "",
    sqftUpper && sqftUpper !== "0" ? `Upper Level Sqft: ${sqftUpper}` : "",
    sqftLower && sqftLower !== "0" ? `Lower Level Sqft: ${sqftLower}` : "",
    listing.lot_size_acres ? `Lot Size: ${listing.lot_size_acres} acres` : (rawData.LotSizeArea && rawData.LotSizeUnits === "Acres" ? `Lot Size: ${rawData.LotSizeArea} acres` : ""),
    listing.bedrooms_total ? `Bedrooms: ${listing.bedrooms_total}` : "",
    listing.bathrooms_total_integer ? `Bathrooms: ${listing.bathrooms_total_integer}` : "",
    listing.year_built ? `Year Built: ${listing.year_built}` : "",
    listing.stories ? `Stories: ${listing.stories}` : "",
    listing.garage_spaces ? `Garage Spaces: ${listing.garage_spaces}` : "",
    basementYN != null ? `Has Basement: ${basementYN ? "Yes" : "No"}` : "",
    basementArr.length ? `Basement Details: ${basementArr.join(", ")}` : "",
    foundationArr.length ? `Foundation: ${foundationArr.join(", ")}` : "",
    viewArr.length ? `MLS View Field: ${viewArr.join(", ")}` : "",
    waterArr.length ? `MLS Waterfront Features: ${waterArr.join(", ")}` : "",
    extFeatures.length ? `Exterior Features: ${extFeatures.join(", ")}` : "",
    intFeatures.length ? `Interior Features: ${intFeatures.join(", ")}` : "",
    sewerArr.length ? `Sewer: ${sewerArr.join(", ")}` : "",
    waterSourceArr.length ? `Water Source: ${waterSourceArr.join(", ")}` : "",
    electricArr.length ? `Electric: ${electricArr.join(", ")}` : "",
    roadSurface.length ? `Road Surface: ${roadSurface.join(", ")}` : "",
    lotFeatures.length ? `Lot Features: ${lotFeatures.join(", ")}` : "",
    listing.county_or_parish ? `County: ${listing.county_or_parish}` : "",
    listing.zoning ? `Zoning: ${listing.zoning}` : "",
    carRestrictions ? `Restrictions (MLS): ${carRestrictions}` : "",
    navRestrictionDesc ? `Restrictions (CSAR): ${navRestrictionDesc}` : "",
    (listing.restrictions as string[])?.length
      ? `Restrictions: ${(listing.restrictions as string[]).join(", ")}`
      : "",
    carConstructionType ? `Construction Type: ${carConstructionType}` : "",
    bodyType?.length ? `Body Type: ${bodyType.join(", ")}` : "",
    structureType?.length ? `Structure Type: ${structureType.join(", ")}` : "",
    architecturalStyle?.length ? `Architectural Style: ${architecturalStyle.join(", ")}` : "",
    poolFeatures.length ? `Pool Features: ${poolFeatures.join(", ")}` : "",
    poolPrivateYN != null ? `Private Pool: ${poolPrivateYN ? "Yes" : "No"}` : "",
    fireplaceYN != null ? `Has Fireplace: ${fireplaceYN ? "Yes" : "No"}` : "",
    fireplaceFeatures.length ? `Fireplace Features: ${fireplaceFeatures.join(", ")}` : "",
    fireplaceTotal != null ? `Total Fireplaces: ${fireplaceTotal}` : "",
    patioAndPorch.length ? `Patio/Porch Features: ${patioAndPorch.join(", ")}` : "",
    attachedGarageYN != null ? `Attached Garage: ${attachedGarageYN ? "Yes" : "No"}` : "",
    garageSqft ? `Garage Sqft: ${garageSqft}` : "",
    navBasementHtdSqft ? `Basement Heated Sqft: ${navBasementHtdSqft}` : "",
    sqftBasement ? `Unheated Basement Sqft: ${sqftBasement}` : "",
    elevation ? `Elevation: ${elevation} ft` : "",
    remarks ? `\nPublic Remarks:\n${remarks}` : "",
    privateRemarks ? `\nPrivate/Agent Remarks:\n${privateRemarks}` : "",
  ]
    .filter(Boolean)
    .join("\n");

  // Call Claude API
  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": ANTHROPIC_API_KEY,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: EXTRACTION_MODEL,
      max_tokens: 1800,
      // Sonnet 5 runs adaptive thinking by default when `thinking` is omitted,
      // which would prepend a `thinking` block to the response content array.
      // This extraction wants fast, deterministic JSON, so disable thinking.
      thinking: { type: "disabled" },
      system: SYSTEM_PROMPT,
      messages: [
        {
          role: "user",
          content: `Analyze this Western NC mountain property and extract features:\n\n${propertyContext}`,
        },
      ],
    }),
  });

  if (!response.ok) {
    const errText = await response.text();
    console.error(`Claude API error ${response.status}: ${errText}`);
    return null;
  }

  const data = await response.json();
  // Find the first text block rather than assuming index 0. On Sonnet 5 the
  // content array can lead with a non-text block (e.g. a thinking block), so a
  // hardcoded content[0].text would read undefined or garbage.
  const contentBlocks = Array.isArray(data?.content) ? data.content : [];
  const text =
    contentBlocks.find((b: Record<string, unknown>) => b?.type === "text")?.text || "";

  // Parse JSON from Claude's response
  try {
    // Extract JSON from response (handle markdown code blocks)
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      console.error("No JSON found in Claude response:", text.slice(0, 200));
      return null;
    }
    const parsed = JSON.parse(jsonMatch[0]);
    parsed._model = EXTRACTION_MODEL;
    parsed._raw = text;
    return parsed;
  } catch (e) {
    console.error("Failed to parse Claude response:", e, text.slice(0, 200));
    return null;
  }
}

// Build the tag record from extracted features (shared by single + backfill)
function buildTagRecord(
  listingKey: string,
  features: Record<string, unknown>,
  elevation: number | null
) {
  return {
    listing_key: listingKey,
    agent_id: null,
    view_quality: features.view_quality,
    view_type: features.view_type || [],
    water_quality: features.water_quality,
    water_features: features.water_features || [],
    land_usability: features.land_usability,
    land_character: features.land_character || [],
    road_noise: features.road_noise,
    road_access: features.road_access || [],
    condition_rating: features.condition_rating,
    condition_notes: features.condition_notes || "",
    privacy_rating: features.privacy_rating,
    winter_access: features.winter_access || "",
    outbuildings: features.outbuildings || [],
    special_features: features.special_features || [],
    above_grade_sqft: features.above_grade_sqft ?? null,
    below_grade_sqft: features.below_grade_sqft ?? null,
    sqft_source: features.sqft_source || "unknown",
    septic_permitted_bedrooms: features.septic_permitted_bedrooms ?? null,
    utilities_available: features.utilities_available || [],
    perc_status: features.perc_status || "",
    timber_quality: features.timber_quality || "",
    buildable_sites: features.buildable_sites ?? null,
    road_frontage_ft: features.road_frontage_ft ?? null,
    subdivision_potential: features.subdivision_potential ?? null,
    construction_type: features.construction_type || "unknown",
    restriction_status: features.restriction_status || "unknown",
    restrictions_summary: features.restrictions_summary || "",
    has_pool: features.has_pool ?? false,
    pool_type: features.pool_type || "none",
    basement_type: features.basement_type || "none",
    basement_sqft: features.basement_sqft ?? null,
    has_fireplace: features.has_fireplace ?? false,
    fireplace_count: features.fireplace_count || 0,
    fireplace_type: features.fireplace_type || "",
    covered_outdoor_sqft: features.covered_outdoor_sqft ?? null,
    garage_type: features.garage_type || "",
    garage_sqft: features.garage_sqft ?? null,
    outbuilding_count: features.outbuilding_count || 0,
    outbuilding_value_tier: features.outbuilding_value_tier || 0,
    elevation_ft: elevation,
    extraction_model: EXTRACTION_MODEL,
    extraction_confidence: features.confidence || 0.5,
    raw_extraction: { response: features._raw, parsed: features },
    extracted_from: ["public_remarks", "raw_data"],
    updated_at: new Date().toISOString(),
  };
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
    const body = await req.json();
    const action = body.action || "extract-single";

    // ── Action: stats ──
    if (action === "stats") {
      const { count: totalClosed } = await sb
        .from("mls_listings")
        .select("*", { count: "exact", head: true })
        .eq("standard_status", "Closed");

      const { count: totalTagged } = await sb
        .from("cma_feature_tags")
        .select("*", { count: "exact", head: true });

      return new Response(
        JSON.stringify({
          ok: true,
          total_closed_listings: totalClosed || 0,
          total_tagged: totalTagged || 0,
          remaining: (totalClosed || 0) - (totalTagged || 0),
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ── Action: extract-single ──
    if (action === "extract-single") {
      const listingKey = body.listing_key;
      if (!listingKey) {
        return new Response(
          JSON.stringify({ error: "listing_key required" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Fetch listing
      const { data: listing, error: fetchErr } = await sb
        .from("mls_listings")
        .select("*")
        .eq("listing_key", listingKey)
        .maybeSingle();

      if (fetchErr || !listing) {
        return new Response(
          JSON.stringify({ error: "Listing not found", detail: fetchErr?.message }),
          { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Extract features
      const features = await extractFeatures(listing);
      if (!features) {
        return new Response(
          JSON.stringify({ error: "Feature extraction failed" }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Get elevation if we have coordinates
      let elevation: number | null = null;
      if (listing.latitude && listing.longitude) {
        elevation = await getElevation(
          parseFloat(listing.latitude),
          parseFloat(listing.longitude)
        );
      }

      // Upsert feature tags
      const tagRecord = buildTagRecord(listingKey, features, elevation);

      const { error: upsertErr } = await sb
        .from("cma_feature_tags")
        .upsert(tagRecord, { onConflict: "listing_key,agent_id" });

      if (upsertErr) {
        console.error("Upsert error:", upsertErr);
        return new Response(
          JSON.stringify({ error: "Failed to save features", detail: upsertErr.message }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      return new Response(
        JSON.stringify({ ok: true, listing_key: listingKey, features: tagRecord }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ── Action: backfill ──
    if (action === "backfill") {
      const limit = Math.min(body.limit || 25, 50); // Max 50 per invocation
      const county = body.county || null; // Optional county filter

      // Find closed listings without feature tags
      let query = sb
        .from("mls_listings")
        .select("listing_key, full_address, city, county_or_parish, property_type, property_sub_type, living_area, lot_size_acres, bedrooms_total, bathrooms_total_integer, year_built, stories, garage_spaces, public_remarks, private_remarks, view, waterfront_features, exterior_features, interior_features, restrictions, zoning, latitude, longitude, raw_data")
        .eq("standard_status", "Closed")
        .order("close_date", { ascending: false })
        .limit(limit);

      if (county) {
        query = query.eq("county_or_parish", county);
      }

      const { data: listings, error: queryErr } = await query;

      if (queryErr) {
        return new Response(
          JSON.stringify({ error: "Query failed", detail: queryErr.message }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      if (!listings || listings.length === 0) {
        return new Response(
          JSON.stringify({ ok: true, extracted: 0, message: "No untagged listings found" }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Filter out already-tagged listings
      const keys = listings.map((l: Record<string, unknown>) => l.listing_key);
      const { data: existingTags } = await sb
        .from("cma_feature_tags")
        .select("listing_key")
        .in("listing_key", keys);

      const taggedKeys = new Set((existingTags || []).map((t: Record<string, unknown>) => t.listing_key));
      const untagged = listings.filter((l: Record<string, unknown>) => !taggedKeys.has(l.listing_key));

      if (untagged.length === 0) {
        return new Response(
          JSON.stringify({ ok: true, extracted: 0, message: "All fetched listings already tagged" }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Process each listing
      let extracted = 0;
      const errors: string[] = [];

      for (const listing of untagged) {
        try {
          const features = await extractFeatures(listing);
          if (!features) {
            errors.push(`${listing.listing_key}: extraction failed`);
            continue;
          }

          // Get elevation
          let elevation: number | null = null;
          if (listing.latitude && listing.longitude) {
            elevation = await getElevation(
              parseFloat(listing.latitude as string),
              parseFloat(listing.longitude as string)
            );
          }

          const tagRecord = buildTagRecord(listing.listing_key as string, features, elevation);

          const { error: upsertErr } = await sb
            .from("cma_feature_tags")
            .upsert(tagRecord, { onConflict: "listing_key,agent_id" });

          if (upsertErr) {
            errors.push(`${listing.listing_key}: upsert failed - ${upsertErr.message}`);
          } else {
            extracted++;
          }
        } catch (e) {
          errors.push(`${listing.listing_key}: ${(e as Error).message}`);
        }

        // Rate limit between Claude API calls
        await new Promise((r) => setTimeout(r, REQUEST_DELAY_MS));
      }

      return new Response(
        JSON.stringify({
          ok: true,
          extracted,
          attempted: untagged.length,
          errors: errors.length ? errors : undefined,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({ error: `Unknown action: ${action}` }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Unhandled error:", error);
    return new Response(
      JSON.stringify({ error: "Internal server error", detail: (error as Error).message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
