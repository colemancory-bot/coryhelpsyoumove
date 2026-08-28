// CMA Feature Extraction Edge Function
// Uses Claude API to analyze MLS listing remarks and extract mountain-specific features
// for Comparative Market Analysis (views, water, land character, road noise, etc.)
//
// Deploy: supabase functions deploy cma-extract-features
// Invoke: POST /functions/v1/cma-extract-features
//   { "action": "extract-single", "listing_key": "..." }
//   { "action": "backfill", "limit": 25 }
//   { "action": "stats" }
//   { "action": "extract-new", "limit": 60 }                     realtime, trimmed scope (weekly cron)
//   { "action": "batch-submit", "scope": "trimmed", "limit": 1000 } Message Batches API, 50% cost
//   { "action": "batch-status", "batch_id"?: "..." }             poll Anthropic + update tracking
//   { "action": "batch-ingest", "batch_id"?: "...", "limit": 100 } stream results .jsonl → upsert
//
// Batch backfill trimmed scope (4 counties: Haywood, Jackson, Macon, Swain):
//   1. Closed, close_price not null, close_date >= now-12mo (all property types)
//   2. Closed, close_price not null, property_type=Land, close_date in [now-36mo, now-12mo)
//   3. status in (Active, Active Under Contract, Pending), property_type=Land
//   minus listing_keys already in cma_feature_tags.
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
const EXTRACTION_MAX_TOKENS = 1800;
const ANTHROPIC_VERSION = "2023-06-01";
const ANTHROPIC_MESSAGES_URL = "https://api.anthropic.com/v1/messages";
const ANTHROPIC_BATCHES_URL = "https://api.anthropic.com/v1/messages/batches";

// Counties in the CMA comp universe (trimmed backfill scope).
const CMA_COUNTIES = ["Haywood", "Jackson", "Macon", "Swain"];

function anthropicHeaders(): Record<string, string> {
  return {
    "Content-Type": "application/json",
    "x-api-key": ANTHROPIC_API_KEY,
    "anthropic-version": ANTHROPIC_VERSION,
  };
}

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

// Build the property-context user prompt from a listing row.
// SHARED by extract-single (realtime) and batch-submit so the two paths never
// diverge — one prompt-builder, one place to change field mappings.
function buildPropertyContext(listing: Record<string, unknown>): string {
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

  return propertyContext;
}

// Build the exact Messages-API request params for a listing. This single object
// is used verbatim by extract-single (POST /v1/messages) and by batch-submit
// (as the `params` of each batch request) so both paths share model / system /
// user-content / thinking / max_tokens with no copy-paste divergence.
function buildRequestParams(listing: Record<string, unknown>): Record<string, unknown> {
  const propertyContext = buildPropertyContext(listing);
  return {
    model: EXTRACTION_MODEL,
    max_tokens: EXTRACTION_MAX_TOKENS,
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
  };
}

// Parse the feature JSON out of a Claude text block. Shared by extract-single
// (realtime response) and batch-ingest (result .jsonl). Tolerant of markdown
// code fences: the regex grabs the first {...} object regardless of surrounding
// prose or ```json fences.
function parseExtractionText(text: string): Record<string, unknown> | null {
  try {
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

// Pull the first text block from a Messages-API response/result content array.
// On Sonnet 5 the array can lead with a non-text block (e.g. a thinking block),
// so a hardcoded content[0].text would read undefined or garbage.
function firstTextBlock(content: unknown): string {
  const blocks = Array.isArray(content) ? content : [];
  return (
    blocks.find((b: Record<string, unknown>) => b?.type === "text")?.text || ""
  );
}

// Extract features for a single listing (realtime path).
async function extractFeatures(
  listing: Record<string, unknown>
): Promise<Record<string, unknown> | null> {
  const response = await fetch(ANTHROPIC_MESSAGES_URL, {
    method: "POST",
    headers: anthropicHeaders(),
    body: JSON.stringify(buildRequestParams(listing)),
  });

  if (!response.ok) {
    const errText = await response.text();
    console.error(`Claude API error ${response.status}: ${errText}`);
    return null;
  }

  const data = await response.json();
  return parseExtractionText(firstTextBlock(data?.content));
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

// ── Shared: idempotent write of a backfill (agent_id IS NULL) tag row ──
// The agent_id IS NULL scope is guarded by a PARTIAL unique index
// (uq_cma_feature_tags_listing_no_agent, migration 20260715000001). Postgres can't
// infer a partial index as an ON CONFLICT arbiter unless the statement carries the
// index predicate (`WHERE agent_id IS NULL`), which PostgREST does not emit — so a
// plain `.upsert(tagRecord, { onConflict: "listing_key" })` 400s with 42P10, and
// `onConflict: "listing_key,agent_id"` never dedups (SQL treats NULLs as distinct,
// which is exactly the bug that let 1,169 duplicates accumulate). Emulate the upsert:
// INSERT, and on a unique-violation (23505) UPDATE the existing backfill row in place.
// Idempotent and race-safe — a concurrent writer that loses the insert race falls
// through to the update instead of creating a second row or erroring.
type SbClient = ReturnType<typeof createClient>;

async function upsertTagNoAgent(
  sb: SbClient,
  tagRecord: Record<string, unknown>
): Promise<{ ok: boolean; error?: string }> {
  const ins = await sb.from("cma_feature_tags").insert(tagRecord);
  if (!ins.error) return { ok: true };
  // deno-lint-ignore no-explicit-any
  if ((ins.error as any).code !== "23505") return { ok: false, error: ins.error.message };
  const upd = await sb
    .from("cma_feature_tags")
    .update(tagRecord)
    .eq("listing_key", tagRecord.listing_key as string)
    .is("agent_id", null);
  if (upd.error) return { ok: false, error: upd.error.message };
  return { ok: true };
}

// ── Shared: extract + elevation + upsert for one listing (realtime path) ──
// Used by extract-single, backfill, and extract-new.
async function extractAndUpsert(
  sb: SbClient,
  listing: Record<string, unknown>
): Promise<{ ok: boolean; error?: string }> {
  const features = await extractFeatures(listing);
  if (!features) return { ok: false, error: "extraction failed" };

  let elevation: number | null = null;
  if (listing.latitude && listing.longitude) {
    elevation = await getElevation(
      parseFloat(listing.latitude as string),
      parseFloat(listing.longitude as string)
    );
  }

  const tagRecord = buildTagRecord(listing.listing_key as string, features, elevation);
  return upsertTagNoAgent(sb, tagRecord);
}

// ── Trimmed-scope selection (shared by batch-submit and extract-new) ──
// Returns fresh query-builder factories per branch so each can be paginated.
// scope "trimmed" (default):
//   1. Closed, close_price not null, close_date >= now-12mo  (all property types)
//   2. Closed, close_price not null, property_type=Land, close_date in [now-36mo, now-12mo)
//   3. status in (Active, Active Under Contract, Pending), property_type=Land
// scope "all": every Closed-with-price OR Active/AUC/Pending row in the 4 counties.
function scopeBranches(scope: string): Array<(sb: SbClient) => unknown> {
  const now = Date.now();
  const d12 = new Date(now - 365 * 86400000).toISOString().split("T")[0];
  const d36 = new Date(now - 3 * 365 * 86400000).toISOString().split("T")[0];
  const activeStatuses = ["Active", "Active Under Contract", "Pending"];

  if (scope === "all") {
    return [
      (sb) =>
        sb
          .from("mls_listings")
          .select("listing_key")
          .in("county_or_parish", CMA_COUNTIES)
          .eq("standard_status", "Closed")
          .not("close_price", "is", null),
      (sb) =>
        sb
          .from("mls_listings")
          .select("listing_key")
          .in("county_or_parish", CMA_COUNTIES)
          .in("standard_status", activeStatuses),
    ];
  }

  // trimmed
  return [
    (sb) =>
      sb
        .from("mls_listings")
        .select("listing_key")
        .in("county_or_parish", CMA_COUNTIES)
        .eq("standard_status", "Closed")
        .not("close_price", "is", null)
        .gte("close_date", d12),
    (sb) =>
      sb
        .from("mls_listings")
        .select("listing_key")
        .in("county_or_parish", CMA_COUNTIES)
        .eq("standard_status", "Closed")
        .not("close_price", "is", null)
        .eq("property_type", "Land")
        .gte("close_date", d36)
        .lt("close_date", d12),
    (sb) =>
      sb
        .from("mls_listings")
        .select("listing_key")
        .in("county_or_parish", CMA_COUNTIES)
        .in("standard_status", activeStatuses)
        .eq("property_type", "Land"),
  ];
}

// Paginate a select("listing_key") query (PostgREST caps at 1000/page).
async function fetchAllKeys(
  sb: SbClient,
  factory: (sb: SbClient) => unknown
): Promise<string[]> {
  const keys: string[] = [];
  const pageSize = 1000;
  for (let from = 0; ; from += pageSize) {
    // deno-lint-ignore no-explicit-any
    const q = factory(sb) as any;
    const { data, error } = await q.range(from, from + pageSize - 1);
    if (error) throw new Error(error.message);
    if (!data || data.length === 0) break;
    for (const r of data) keys.push(r.listing_key);
    if (data.length < pageSize) break;
  }
  return keys;
}

// All in-scope listing_keys that are NOT yet in cma_feature_tags, optionally
// also excluding a supplied set (e.g. keys already sitting in open batches).
async function getUntaggedScopeKeys(
  sb: SbClient,
  scope: string,
  exclude?: Set<string>
): Promise<string[]> {
  const seen = new Set<string>();
  for (const factory of scopeBranches(scope)) {
    const ks = await fetchAllKeys(sb, factory);
    for (const k of ks) seen.add(k);
  }

  // Subtract already-tagged keys (paginated).
  const tagged = new Set<string>();
  const pageSize = 1000;
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await sb
      .from("cma_feature_tags")
      .select("listing_key")
      .range(from, from + pageSize - 1);
    if (error) throw new Error(error.message);
    if (!data || data.length === 0) break;
    for (const r of data) tagged.add(r.listing_key as string);
    if (data.length < pageSize) break;
  }

  const untagged: string[] = [];
  for (const k of seen) {
    if (tagged.has(k)) continue;
    if (exclude && exclude.has(k)) continue;
    untagged.push(k);
  }
  untagged.sort();
  return untagged;
}

// Fetch full listing rows (select *) for a set of keys, chunked to keep the
// PostgREST `in` list a sane size. select("*") matches extract-single exactly.
async function fetchListingsByKeys(
  sb: SbClient,
  keys: string[]
): Promise<Array<Record<string, unknown>>> {
  const out: Array<Record<string, unknown>> = [];
  const chunk = 200;
  for (let i = 0; i < keys.length; i += chunk) {
    const slice = keys.slice(i, i + chunk);
    const { data, error } = await sb
      .from("mls_listings")
      .select("*")
      .in("listing_key", slice);
    if (error) throw new Error(error.message);
    if (data) out.push(...(data as Array<Record<string, unknown>>));
  }
  return out;
}

// Keys already submitted in any tracked batch (so batch-submit never resubmits).
async function getSubmittedKeys(sb: SbClient): Promise<Set<string>> {
  const set = new Set<string>();
  const { data, error } = await sb
    .from("cma_extract_batches")
    .select("submitted_keys");
  if (error) throw new Error(error.message);
  for (const row of data || []) {
    for (const k of (row.submitted_keys as string[]) || []) set.add(k);
  }
  return set;
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

      // Extract + elevation + upsert (shared realtime path)
      const res = await extractAndUpsert(sb, listing);
      if (!res.ok) {
        return new Response(
          JSON.stringify({ error: "Feature extraction failed", detail: res.error }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      return new Response(
        JSON.stringify({ ok: true, listing_key: listingKey }),
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
          const res = await extractAndUpsert(sb, listing);
          if (res.ok) extracted++;
          else errors.push(`${listing.listing_key}: ${res.error}`);
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

    // ── Action: extract-new (weekly cron — realtime extraction of new listings) ──
    if (action === "extract-new") {
      const limit = Math.max(1, body.limit || 60);
      const untagged = await getUntaggedScopeKeys(sb, "trimmed");
      const target = untagged.slice(0, limit);

      if (target.length === 0) {
        return new Response(
          JSON.stringify({ ok: true, extracted: 0, remaining: 0, message: "No untagged trimmed-scope listings" }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const listings = await fetchListingsByKeys(sb, target);
      let extracted = 0;
      const errors: string[] = [];

      for (const listing of listings) {
        try {
          const res = await extractAndUpsert(sb, listing);
          if (res.ok) extracted++;
          else errors.push(`${listing.listing_key}: ${res.error}`);
        } catch (e) {
          errors.push(`${listing.listing_key}: ${(e as Error).message}`);
        }
        await new Promise((r) => setTimeout(r, REQUEST_DELAY_MS));
      }

      return new Response(
        JSON.stringify({
          ok: true,
          extracted,
          attempted: target.length,
          remaining: untagged.length - extracted,
          errors: errors.length ? errors : undefined,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ── Action: batch-submit (Message Batches API — 50% cost) ──
    if (action === "batch-submit") {
      const scope = body.scope === "all" ? "all" : "trimmed";
      const limit = Math.max(1, body.limit || 1000);
      const CHUNK = 800; // stay well under the 100k-request / 256MB batch limits

      // Exclude keys already sitting in tracked batches so we never resubmit.
      const alreadySubmitted = await getSubmittedKeys(sb);
      const untagged = await getUntaggedScopeKeys(sb, scope, alreadySubmitted);
      const target = untagged.slice(0, limit);

      if (target.length === 0) {
        return new Response(
          JSON.stringify({
            ok: true,
            scope,
            untagged_total: untagged.length,
            submitted: 0,
            batches: [],
            message: "Nothing untagged left to submit",
          }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Fetch full rows and build one batch request per listing.
      const listings = await fetchListingsByKeys(sb, target);
      const requests = listings.map((l) => ({
        custom_id: l.listing_key as string,
        params: buildRequestParams(l),
      }));

      const created: Array<{ batch_id: string; count: number }> = [];
      for (let i = 0; i < requests.length; i += CHUNK) {
        const chunk = requests.slice(i, i + CHUNK);
        const resp = await fetch(ANTHROPIC_BATCHES_URL, {
          method: "POST",
          headers: anthropicHeaders(),
          body: JSON.stringify({ requests: chunk }),
        });
        if (!resp.ok) {
          const errText = await resp.text();
          return new Response(
            JSON.stringify({
              error: "Batch submit failed",
              status: resp.status,
              detail: errText.slice(0, 500),
              created_so_far: created,
            }),
            { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }
        const batch = await resp.json();
        const submittedKeys = chunk.map((c) => c.custom_id);
        const { error: insErr } = await sb.from("cma_extract_batches").insert({
          batch_id: batch.id,
          submitted_count: chunk.length,
          submitted_keys: submittedKeys,
          status: batch.processing_status || "in_progress",
        });
        if (insErr) console.error("Tracking insert error:", insErr.message);
        created.push({ batch_id: batch.id, count: chunk.length });
      }

      return new Response(
        JSON.stringify({
          ok: true,
          scope,
          untagged_total: untagged.length,
          submitted: target.length,
          batches: created,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ── Action: batch-status ──
    if (action === "batch-status") {
      let q = sb.from("cma_extract_batches").select("*");
      if (body.batch_id) q = q.eq("batch_id", body.batch_id);
      else q = q.neq("status", "ingested");
      const { data: rows, error: rowsErr } = await q;
      if (rowsErr) {
        return new Response(
          JSON.stringify({ error: "Tracking query failed", detail: rowsErr.message }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const out: Array<Record<string, unknown>> = [];
      for (const row of rows || []) {
        const resp = await fetch(`${ANTHROPIC_BATCHES_URL}/${row.batch_id}`, {
          headers: anthropicHeaders(),
        });
        if (!resp.ok) {
          out.push({ batch_id: row.batch_id, error: (await resp.text()).slice(0, 300) });
          continue;
        }
        const b = await resp.json();
        // Don't clobber a local 'ingested' marker with Anthropic's 'ended'.
        const newStatus = row.status === "ingested" ? "ingested" : b.processing_status;
        await sb
          .from("cma_extract_batches")
          .update({
            status: newStatus,
            request_counts: b.request_counts || {},
            updated_at: new Date().toISOString(),
          })
          .eq("batch_id", row.batch_id);
        out.push({
          batch_id: row.batch_id,
          processing_status: b.processing_status,
          request_counts: b.request_counts,
          results_url: b.results_url || null,
        });
      }

      return new Response(
        JSON.stringify({ ok: true, batches: out }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ── Action: batch-ingest (stream results .jsonl, upsert, resume-safe) ──
    if (action === "batch-ingest") {
      const limit = Math.max(1, body.limit || 100);

      // Pick a batch: explicit body.batch_id, else the earliest ended, not-yet-
      // fully-ingested tracked batch.
      let batchId: string | null = body.batch_id || null;
      if (!batchId) {
        const { data: rows } = await sb
          .from("cma_extract_batches")
          .select("*")
          .neq("status", "ingested")
          .order("created_at", { ascending: true });
        for (const r of rows || []) {
          const resp = await fetch(`${ANTHROPIC_BATCHES_URL}/${r.batch_id}`, {
            headers: anthropicHeaders(),
          });
          if (!resp.ok) continue;
          const b = await resp.json();
          if (b.processing_status === "ended") {
            batchId = r.batch_id as string;
            break;
          }
        }
        if (!batchId) {
          return new Response(
            JSON.stringify({ ok: true, ingested: 0, failed: 0, remaining: 0, message: "No ended batch to ingest" }),
            { headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }
      }

      // Get the batch to find the results_url.
      const bresp = await fetch(`${ANTHROPIC_BATCHES_URL}/${batchId}`, {
        headers: anthropicHeaders(),
      });
      if (!bresp.ok) {
        return new Response(
          JSON.stringify({ error: "Batch fetch failed", detail: (await bresp.text()).slice(0, 300) }),
          { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      const batch = await bresp.json();
      if (batch.processing_status !== "ended") {
        return new Response(
          JSON.stringify({ ok: false, batch_id: batchId, processing_status: batch.processing_status, message: "Batch not ended yet" }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      if (!batch.results_url) {
        return new Response(
          JSON.stringify({ error: "Batch has no results_url", batch_id: batchId }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Stream + parse the results .jsonl.
      const rres = await fetch(batch.results_url, { headers: anthropicHeaders() });
      if (!rres.ok) {
        return new Response(
          JSON.stringify({ error: "Results fetch failed", detail: (await rres.text()).slice(0, 300) }),
          { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      const txt = await rres.text();
      const results = txt
        .split("\n")
        .filter(Boolean)
        .map((l) => JSON.parse(l));

      const succeeded = results.filter(
        (r) => r?.result?.type === "succeeded"
      );
      const erroredIds = results
        .filter((r) => r?.result?.type !== "succeeded")
        .map((r) => r.custom_id);
      if (erroredIds.length) {
        console.error(`Batch ${batchId} non-succeeded custom_ids:`, erroredIds.slice(0, 50));
      }

      // Skip keys already tagged (resume-safe cursor = cma_feature_tags itself).
      const succeededKeys = succeeded.map((r) => r.custom_id as string);
      const tagged = new Set<string>();
      const cch = 300;
      for (let i = 0; i < succeededKeys.length; i += cch) {
        const slice = succeededKeys.slice(i, i + cch);
        const { data } = await sb
          .from("cma_feature_tags")
          .select("listing_key")
          .in("listing_key", slice);
        for (const t of data || []) tagged.add(t.listing_key as string);
      }

      const pending = succeeded.filter((r) => !tagged.has(r.custom_id as string));
      const toProcess = pending.slice(0, limit);

      // Fetch coords for elevation lookups.
      const coordMap = new Map<string, { lat: unknown; lng: unknown }>();
      const pkeys = toProcess.map((r) => r.custom_id as string);
      for (let i = 0; i < pkeys.length; i += cch) {
        const slice = pkeys.slice(i, i + cch);
        const { data } = await sb
          .from("mls_listings")
          .select("listing_key, latitude, longitude")
          .in("listing_key", slice);
        for (const l of data || [])
          coordMap.set(l.listing_key as string, { lat: l.latitude, lng: l.longitude });
      }

      let ingested = 0;
      let failed = 0;
      const failedIds: string[] = [];

      for (const r of toProcess) {
        const key = r.custom_id as string;
        try {
          const text = firstTextBlock(r.result?.message?.content);
          const features = parseExtractionText(text);
          if (!features) {
            failed++;
            failedIds.push(key);
            continue;
          }
          let elevation: number | null = null;
          const c = coordMap.get(key);
          if (c && c.lat && c.lng) {
            elevation = await getElevation(
              parseFloat(c.lat as string),
              parseFloat(c.lng as string)
            );
          }
          const tagRecord = buildTagRecord(key, features, elevation);
          // Idempotent, race-safe write. The `tagged` pre-check above already skips
          // custom_ids that have a tag row, so this normally INSERTs; the 23505->update
          // branch inside the helper only fires if a concurrent invocation (e.g. a
          // client-abort retry) races the same key — which is exactly the failure mode
          // that produced the 1,169 duplicates before the partial unique index existed.
          const res = await upsertTagNoAgent(sb, tagRecord);
          if (!res.ok) {
            failed++;
            failedIds.push(key);
            console.error(`Ingest ${key} write failed:`, res.error);
          } else {
            ingested++;
          }
        } catch (e) {
          failed++;
          failedIds.push(key);
          console.error(`Ingest ${key} failed:`, (e as Error).message);
        }
      }

      const remaining = pending.length - ingested;

      // Mark fully ingested when every succeeded result is now tagged.
      const { data: batchRow } = await sb
        .from("cma_extract_batches")
        .select("ingested_count")
        .eq("batch_id", batchId)
        .maybeSingle();
      const prevIngested = (batchRow?.ingested_count as number) || 0;
      await sb
        .from("cma_extract_batches")
        .update({
          ingested_count: prevIngested + ingested,
          status: remaining <= 0 ? "ingested" : "ended",
          updated_at: new Date().toISOString(),
        })
        .eq("batch_id", batchId);

      if (failedIds.length) console.error(`Batch ${batchId} ingest failures:`, failedIds);

      return new Response(
        JSON.stringify({
          ok: true,
          batch_id: batchId,
          ingested,
          failed,
          remaining,
          errored_in_batch: erroredIds.length,
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
