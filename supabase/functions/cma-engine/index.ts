// CMA Engine Edge Function
// Comp selection, adjustment calculation, AI advisor, report CRUD
//
// Deploy: supabase functions deploy cma-engine
// Invoke: POST /functions/v1/cma-engine
//   { "action": "find-comps", "listing_key": "...", "filters": {...} }
//   { "action": "auto-select-comps", "listing_key": "...", "target_count": 4 }
//   { "action": "calculate-adjustments", "subject": {...}, "comps": [...] }
//   { "action": "ai-advise", "report_id": "..." }
//   { "action": "save-report", "report": {...} }
//   { "action": "get-report", "report_id": "..." }
//   { "action": "generate-paired-sales", "county": "...", "limit": 50 }
//
// Env vars required:
//   ANTHROPIC_API_KEY           - Claude API key
//   SUPABASE_URL                - Supabase project URL
//   SUPABASE_SERVICE_ROLE_KEY   - Supabase service role key

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY") || "";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
const SUPABASE_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
const AI_MODEL = "claude-sonnet-4-20250514";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function jsonResp(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

// ═══════════════════════════════════════════════════════════════
// COMP SIMILARITY SCORING
// Weighted scoring across geography, property type, size, features
// ═══════════════════════════════════════════════════════════════

interface ListingData {
  listing_key: string;
  full_address?: string;
  city?: string;
  county_or_parish?: string;
  property_type?: string;
  property_sub_type?: string;
  living_area?: number;
  lot_size_acres?: number;
  bedrooms_total?: number;
  bathrooms_total_integer?: number;
  bathrooms_half?: number;
  days_on_market?: number;
  list_date?: string;
  year_built?: number;
  garage_spaces?: number;
  close_price?: number;
  close_date?: string;
  list_price?: number;
  latitude?: number;
  longitude?: number;
  standard_status?: string;
  stories?: number;
  public_remarks?: string;
  photo_url?: string;
  photos?: string[];
  [key: string]: unknown;
}

interface FeatureTags {
  view_quality?: number;
  water_quality?: number;
  land_usability?: number;
  road_noise?: number;
  condition_rating?: number;
  privacy_rating?: number;
  elevation_ft?: number;
  view_type?: string[];
  water_features?: string[];
  land_character?: string[];
  road_access?: string[];
  outbuildings?: string[];
  special_features?: string[];
  winter_access?: string;
  condition_notes?: string;
  restriction_status?: string; // "unrestricted" | "restricted" | "unknown"
  restrictions_summary?: string;
  [key: string]: unknown;
}

// Haversine distance in miles between two lat/lng points
function distanceMiles(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number
): number {
  const R = 3959; // Earth radius in miles
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// Apply a lat/lng bounding-box prefilter to a comp query. Rows with NULL
// coordinates are KEPT (they can't be boxed out and the precise post-query
// distance filter keeps them too). maxDistance is in miles; 1 deg lat ~= 69 mi,
// 1 deg lng ~= 69*cos(lat) mi. A 0.05 deg pad (~3.5 mi) absorbs the approximation.
// deno-lint-ignore no-explicit-any
function applyBoundingBox(query: any, lat: number, lng: number, maxDistance: number): any {
  const latDelta = maxDistance / 69 + 0.05;
  const cosLat = Math.cos((lat * Math.PI) / 180);
  const safeCos = Math.abs(cosLat) < 0.01 ? 0.01 : cosLat;
  const lngDelta = maxDistance / (69 * safeCos) + 0.05;
  const latLo = lat - latDelta, latHi = lat + latDelta;
  const lngLo = lng - lngDelta, lngHi = lng + lngDelta;
  // Two AND-combined .or() groups: keep null-coordinate rows OR rows inside the box.
  return query
    .or(`latitude.is.null,and(latitude.gte.${latLo},latitude.lte.${latHi})`)
    .or(`longitude.is.null,and(longitude.gte.${lngLo},longitude.lte.${lngHi})`);
}

// Effective bathroom count that discounts half baths to 0.5.
// RESO semantics vary by feed, but both Canopy (mls-sync) and CSAR (navica-sync)
// populate BathroomsTotalInteger and BathroomsHalf independently from the feed.
// Safest non-double-counting reading: BathroomsTotalInteger counts every bathroom
// room (full AND half) as a whole number, so we split out the halves and value
// them at 0.5 each: effective = (total - half) full baths + 0.5*half.
function effectiveBaths(totalInteger: unknown, half: unknown): number {
  const t = Number(totalInteger) || 0;
  const h = Number(half) || 0;
  const full = Math.max(0, t - h);
  return full + 0.5 * h;
}

// ── Construction type resolution (shared by scoreComp and comp selection) ──
function isFactoryConstruction(t: string): boolean { return ["manufactured", "modular", "mobile_home"].includes(t); }
function isMobileHomeConstruction(t: string): boolean { return t === "mobile_home"; }
function isModularConstruction(t: string): boolean { return t === "modular"; }
function isLogConstruction(t: string): boolean { return t === "log"; }

// Resolve construction type from feature tags, then MLS sub-type / materials / raw_data.
// "Log Siding" is NOT log construction (exterior veneer); only standalone "Log" counts.
function resolveConstruction(features: Record<string, unknown> | null, listing: Record<string, unknown>): string {
  const tagged = (features?.construction_type as string) || "unknown";
  if (tagged !== "unknown") return tagged;
  const subType = ((listing.property_sub_type || "") as string).toLowerCase();
  if (subType.includes("manufactured") || subType.includes("mobile")) return "manufactured";
  if (subType.includes("modular")) return "modular";
  const raw = (listing.raw_data || {}) as Record<string, unknown>;
  const carConst = ((raw.CAR_ConstructionType || "") as string).toLowerCase();
  const bodyType = (Array.isArray(raw.BodyType) ? raw.BodyType.join(" ") : ((raw.BodyType || "") as string)).toLowerCase();
  if (carConst.includes("manufactured") || carConst.includes("mobile") ||
      bodyType.includes("double wide") || bodyType.includes("single wide") ||
      bodyType.includes("manufactured")) {
    const yr = (listing.year_built || 0) as number;
    return (yr > 0 && yr < 1976) ? "mobile_home" : "manufactured";
  }
  if (carConst.includes("modular") || bodyType.includes("modular")) return "modular";
  const constMats = Array.isArray(raw.ConstructionMaterials) ? raw.ConstructionMaterials : [];
  const hasLogMaterial = constMats.some((m: unknown) => ((m || "") as string).toLowerCase().trim() === "log");
  const colMats = Array.isArray(listing.construction_materials) ? listing.construction_materials : [];
  const hasLogCol = colMats.some((m: unknown) => ((m || "") as string).toLowerCase().trim() === "log");
  const archStyle = (Array.isArray(raw.ArchitecturalStyle) ? raw.ArchitecturalStyle.join(" ") : ((raw.ArchitecturalStyle || "") as string)).toLowerCase();
  const structType = (Array.isArray(raw.StructureType) ? raw.StructureType.join(" ") : ((raw.StructureType || "") as string)).toLowerCase();
  if (hasLogMaterial || hasLogCol || carConst.includes("log") || bodyType.includes("log") || archStyle.includes("log") || structType.includes("log")) return "log";
  return "site_built";
}

// Score how similar a comp is to the subject (0-1, higher = more similar)
function scoreComp(
  subject: ListingData,
  comp: ListingData,
  subjectFeatures: FeatureTags | null,
  compFeatures: FeatureTags | null,
  // asOfMs: "value as of" timestamp for time-travel/backtesting. Defaults to
  // Date.now() so live behavior is byte-for-byte identical when not supplied.
  asOfMs: number = Date.now()
): { total: number; breakdown: Record<string, number> } {
  const scores: Record<string, number> = {};

  // Geographic proximity (weight: 0.25)
  if (subject.latitude && subject.longitude && comp.latitude && comp.longitude) {
    const dist = distanceMiles(
      subject.latitude, subject.longitude,
      comp.latitude, comp.longitude
    );
    // Within 1 mile = 1.0, 5 miles = 0.7, 10 miles = 0.4, 20+ miles = 0.0
    scores.proximity = Math.max(0, 1 - dist / 20);
  } else {
    // Same county fallback
    scores.proximity =
      subject.county_or_parish === comp.county_or_parish ? 0.5 : 0.2;
  }

  // Property type match (weight: 0.15)
  if (subject.property_type === comp.property_type) {
    scores.type_match =
      subject.property_sub_type === comp.property_sub_type ? 1.0 : 0.8;
  } else {
    scores.type_match = 0.1;
  }

  // Construction type match (type-aware penalty based on real estate data)
  // Key distinctions supported by appraisal research:
  // - Modular homes are built to same building codes as site-built (mild penalty)
  // - Post-1976 manufactured homes (HUD code) appreciate similarly on owned land (moderate penalty)
  // - Pre-1976 mobile homes are unfinanceable via FHA/VA/USDA/conventional (severe penalty)
  {
    const subConstruction = subjectFeatures
      ? resolveConstruction(subjectFeatures, subject)
      : "unknown";
    const compConstruction = compFeatures
      ? resolveConstruction(compFeatures, comp)
      : resolveConstruction(null, comp);

    if (subConstruction !== "unknown" && compConstruction !== "unknown") {
      if (subConstruction === compConstruction) {
        // Exact construction type match bonus
        scores.type_match = Math.min(1.0, scores.type_match * 1.1);
      } else if (isLogConstruction(subConstruction) || isLogConstruction(compConstruction)) {
        // Log home vs non-log: moderate penalty (different market segment, buyers seek log specifically)
        // Log-to-site_built is more acceptable than log-to-manufactured
        if (isFactoryConstruction(subConstruction) || isFactoryConstruction(compConstruction)) {
          scores.type_match *= 0.2; // Log vs manufactured/modular: very different markets
        } else {
          scores.type_match *= 0.5; // Log vs site-built: same financing, different aesthetic/premium
        }
      } else if (isModularConstruction(subConstruction) && !isFactoryConstruction(compConstruction) ||
                 isModularConstruction(compConstruction) && !isFactoryConstruction(subConstruction)) {
        // Modular vs site-built: mild penalty (same building codes, same financing)
        scores.type_match *= 0.7;
      } else if (isMobileHomeConstruction(subConstruction) || isMobileHomeConstruction(compConstruction)) {
        // Pre-1976 mobile home involved: severe penalty (unfinanceable, different market)
        scores.type_match *= 0.15;
      } else if (isFactoryConstruction(subConstruction) !== isFactoryConstruction(compConstruction)) {
        // Post-1976 manufactured vs site-built: moderate penalty
        scores.type_match *= 0.3;
      } else if (isFactoryConstruction(subConstruction) && isFactoryConstruction(compConstruction)) {
        // Both factory-built but different sub-types (e.g., manufactured vs modular)
        scores.type_match *= 0.8;
      }
    }
  }

  // Living area similarity (weight: 0.20)
  const subSqft = subject.living_area || 0;
  const compSqft = comp.living_area || 0;
  if (subSqft > 0 && compSqft > 0) {
    const ratio = Math.min(subSqft, compSqft) / Math.max(subSqft, compSqft);
    scores.sqft_sim = ratio; // 1.0 = identical, 0.5 = one is 2x the other
  } else {
    scores.sqft_sim = 0.3;
  }

  // Lot size similarity (weight: 0.10)
  const subLot = subject.lot_size_acres || 0;
  const compLot = comp.lot_size_acres || 0;
  if (subLot > 0 && compLot > 0) {
    const ratio = Math.min(subLot, compLot) / Math.max(subLot, compLot);
    scores.lot_sim = ratio;
  } else {
    scores.lot_sim = 0.3;
  }

  // Feature similarity (weight: 0.15) - mountain features
  if (subjectFeatures && compFeatures) {
    const featureKeys = [
      "view_quality",
      "water_quality",
      "land_usability",
      "road_noise",
      "privacy_rating",
    ] as const;
    let featureScore = 0;
    let featureCount = 0;
    for (const key of featureKeys) {
      const sv = subjectFeatures[key] as number | undefined;
      const cv = compFeatures[key] as number | undefined;
      if (sv != null && cv != null) {
        featureScore += 1 - Math.abs(sv - cv) / 4; // Max diff is 4 (1 to 5)
        featureCount++;
      }
    }
    scores.feature_sim = featureCount > 0 ? featureScore / featureCount : 0.5;
  } else {
    scores.feature_sim = 0.5;
  }

  // Recency (weight: 0.10)
  if (comp.close_date) {
    const daysSinceSale = Math.floor(
      (asOfMs - new Date(comp.close_date + "T00:00:00").getTime()) /
        86400000
    );
    // Within 90 days = 1.0, 180 = 0.75, 365 = 0.5, 730+ = 0
    scores.recency = Math.max(0, 1 - daysSinceSale / 730);
  } else {
    scores.recency = 0.3;
  }

  // Bed/bath match (weight: 0.05)
  const bedDiff = Math.abs(
    (subject.bedrooms_total || 0) - (comp.bedrooms_total || 0)
  );
  const bathDiff = Math.abs(
    effectiveBaths(subject.bathrooms_total_integer, subject.bathrooms_half) -
      effectiveBaths(comp.bathrooms_total_integer, comp.bathrooms_half)
  );
  scores.bedbath_match = Math.max(0, 1 - (bedDiff + bathDiff) / 6);

  // Price similarity (weight: 0.10)
  // Prevents wildly different-priced comps from ranking high
  // A $2.6M comp should not score well against a $500K subject
  // Prefer list_price (current asking) over close_price (historical sale).
  // If close_price is stale (2+ years old), ignore it for scoring since
  // appreciation may have changed the property's value significantly.
  let subPrice = (subject.list_price || 0) as number;
  if (!subPrice && subject.close_price && subject.close_date) {
    const closeDateMs = new Date(subject.close_date + "T00:00:00").getTime();
    const yearsSinceClose = (asOfMs - closeDateMs) / (365.25 * 86400000);
    if (yearsSinceClose < 2) {
      subPrice = subject.close_price as number; // Recent sale, still relevant
    }
    // If 2+ years old, leave subPrice as 0 (neutral scoring)
  } else if (!subPrice) {
    subPrice = (subject.close_price || 0) as number; // No close_date, use what we have
  }
  const compPrice = ((comp.close_price || 0) as number);
  if (subPrice > 0 && compPrice > 0) {
    const priceRatio = Math.min(subPrice, compPrice) / Math.max(subPrice, compPrice);
    scores.price_sim = priceRatio; // 1.0 = same price, 0.5 = one is 2x the other
  } else {
    scores.price_sim = 0.5; // No price data or stale price = neutral
  }

  // Weighted total (land CMAs weight lot size and features higher, sqft/beds don't apply)
  const isLand = (subject.property_type || "").toLowerCase() === "land";

  // Dynamic lot weight: boost for large-acreage subjects (10+ ac) to avoid
  // selecting tiny-lot comps that need unreliable $100K+ lot adjustments.
  // At 10ac, lot_sim stays 0.10. At 25ac, it's 0.20. At 50+ac, it's 0.25.
  const baseLotWeight = 0.10;
  const lotBoost = isLand ? 0 : Math.min(0.15, Math.max(0, (subLot - 10) / 40) * 0.15);
  const adjLotWeight = baseLotWeight + lotBoost;
  // Take the boost equally from proximity (which over-favors nearby but dissimilar properties)
  const adjProxWeight = 0.20 - lotBoost;

  const weights = isLand
    ? {
        proximity: 0.20,
        type_match: 0.10,
        sqft_sim: 0.0, // N/A for land
        lot_sim: 0.25, // Primary driver for land
        feature_sim: 0.25, // Views, water, usability matter most
        recency: 0.10,
        bedbath_match: 0.0, // N/A for land
        price_sim: 0.10,
      }
    : {
        proximity: adjProxWeight,
        type_match: 0.15,
        sqft_sim: 0.15,
        lot_sim: adjLotWeight,
        feature_sim: 0.15,
        recency: 0.10,
        bedbath_match: 0.05,
        price_sim: 0.10,
      };

  let total = 0;
  for (const [k, w] of Object.entries(weights)) {
    total += (scores[k] || 0) * w;
  }

  return { total, breakdown: scores };
}

// Detect price outliers within a comp group using median-based rule.
// A comp is an outlier if its sale price is >2x or <0.5x the group median.
// This catches cases like a $2.6M luxury condo among $500K-$900K homes.
// Returns a Set of listing_keys that are outliers.
function detectPriceOutliers(
  comps: Array<{ listing: ListingData; [key: string]: unknown }>
): Set<string> {
  // Use close_price when present, else list_price, so active land comps (which
  // carry only a list price) participate in outlier detection instead of being
  // invisible to it (F5).
  const prices = comps
    .map((c) => (c.listing.close_price || c.listing.list_price || 0) as number)
    .filter((p) => p > 0);
  if (prices.length < 4) return new Set(); // Need enough data for meaningful detection

  prices.sort((a, b) => a - b);
  const median = prices[Math.floor(prices.length / 2)];

  const outlierKeys = new Set<string>();
  for (const c of comps) {
    const price = (c.listing.close_price || c.listing.list_price || 0) as number;
    if (price <= 0) continue;
    if (price > median * 2 || price < median * 0.5) {
      outlierKeys.add(c.listing.listing_key);
    }
  }
  return outlierKeys;
}

// ═══════════════════════════════════════════════════════════════
// ADJUSTMENT CALCULATION
// Standard + mountain adjustments with appraisal guardrails
// ═══════════════════════════════════════════════════════════════

// WNC default adjustment values (used when no paired sales data available)
const WNC_DEFAULTS = {
  // Standard adjustments
  price_per_sqft: 175, // $/sqft for living area adjustment
  per_bedroom: 12000,
  per_bathroom: 10000,
  per_garage_space: 8000,
  per_year_age: 500, // depreciation per year difference

  // Mountain adjustments per rating point difference (1-5 scale)
  view_per_point: 25000,
  water_per_point: 20000,
  land_per_point: 8000,
  road_noise_per_point: 7000,
  privacy_per_point: 6000,
  elevation_per_100ft: 2000,
  condition_per_point: 20000, // condition rating $/point (was hardcoded at the call site)

  // Lot size: tiered marginal value (larger parcels = lower per-acre rate)
  // These define the marginal value of each acre within that tier
  lot_tiers: [
    { upTo: 2, perAcre: 25000 },   // First 2 acres: homesite premium
    { upTo: 5, perAcre: 15000 },   // 2-5 acres: usable yard/garden
    { upTo: 10, perAcre: 8000 },   // 5-10 acres: privacy buffer
    { upTo: 25, perAcre: 4000 },   // 10-25 acres: wooded/pasture
    { upTo: 50, perAcre: 2500 },   // 25-50 acres: large tract
    { upTo: Infinity, perAcre: 1500 }, // 50+ acres: bulk land
  ],

  // Restriction adjustment: % of lot value applied when restriction status differs
  // Unrestricted land commands a premium in WNC (flexibility, no HOA, can subdivide/farm/etc.)
  unrestricted_premium_pct: 0.10, // 10% of lot value for residential

  // Structural feature adjustments
  pool_inground: 0,            // WNC: pools don't reliably add value (short season, maintenance)
  pool_above_ground: -3000,    // Slight negative for removal/maintenance liability
  basement_finished_per_sqft: 60,  // Finished basement $/sqft (less than above-grade)
  basement_partial: 20000,     // Flat value for partially finished basement
  basement_unfinished: 10000,  // Flat value for unfinished basement (storage value)
  fireplace_value: 8000,       // Per fireplace
  fireplace_stone_premium: 5000, // Additional for stone/masonry
  covered_outdoor_per_sqft: 30, // Covered porch/deck $/sqft
  outbuilding_tier_values: [0, 5000, 15000, 30000] as number[], // Per tier 0-3
  garage_oversize_per_sqft: 25, // Extra $/sqft above standard (400 sqft/space)

  // Market
  monthly_appreciation_pct: 0.3, // 0.3% per month (approx 3.6% annually)
};

// Land CMA uses different weights: lot/views/water/access matter more, structure doesn't apply
const WNC_LAND_DEFAULTS = {
  // Primary land value drivers - higher tiers since land value IS the value
  lot_tiers: [
    { upTo: 2, perAcre: 35000 },   // First 2 acres: buildable homesite
    { upTo: 5, perAcre: 20000 },   // 2-5 acres: primary use area
    { upTo: 10, perAcre: 15000 },  // 5-10 acres: extended use
    { upTo: 25, perAcre: 6000 },   // 10-25 acres: wooded/pasture
    { upTo: 50, perAcre: 3500 },   // 25-50 acres: large tract
    { upTo: Infinity, perAcre: 2000 }, // 50+ acres: bulk land
  ],

  // Mountain adjustments per rating point (land values views/water more)
  view_per_point: 20000, // Views matter MORE for land (buyer choosing build site)
  water_per_point: 15000, // Creek frontage especially valuable
  land_per_point: 12000, // Most critical: steep = unbuildable = huge discount
  road_noise_per_point: 10000, // Road access quality matters more for raw land
  privacy_per_point: 8000,
  elevation_per_100ft: 2000,
  condition_per_point: 20000, // condition rating $/point (rarely applies to raw land)

  // Restriction adjustment: higher for land since restrictions directly limit land use
  unrestricted_premium_pct: 0.15, // 15% of lot value for land CMAs

  // Structure-related: N/A for land
  price_per_sqft: 0,
  per_bedroom: 0,
  per_bathroom: 0,
  per_garage_space: 0,
  garage_oversize_per_sqft: 0, // land has no structures; without this, x * undefined = NaN poisons adj_garage
  per_year_age: 0,

  // Market
  monthly_appreciation_pct: 0.3,
};

// Calculate cumulative lot value using tiered marginal rates
// Each tier defines the per-acre rate for acres within that range.
// Example: 12 acres with tiers [2@$25K, 5@$15K, 10@$8K, 25@$4K]
//   = 2×$25K + 3×$15K + 5×$8K + 2×$4K = $50K + $45K + $40K + $8K = $143K
function tieredLotValue(acres: number, tiers: Array<{upTo: number; perAcre: number}>): number {
  let total = 0;
  let prevCap = 0;
  for (const tier of tiers) {
    if (acres <= prevCap) break;
    const acresInTier = Math.min(acres, tier.upTo) - prevCap;
    total += acresInTier * tier.perAcre;
    prevCap = tier.upTo;
  }
  return total;
}

function medianOf(nums: number[]): number {
  if (!nums.length) return 0;
  const s = nums.slice().sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

// ── Market-derived time adjustment (F2) ──
// Build a quarterly price index from our own closed sales and return a
// monthsFactor(compCloseMs) that gives the % change between the comp's sale
// quarter and the as-of quarter. Replaces the hardcoded +0.3%/month, which
// assumed appreciation that post-Helene WNC did not have. When data is thin the
// factor is null, meaning ZERO time adjustment (an appraiser never assumes drift).
//   - metric: residential = median close_price/living_area; land = median
//     close_price/tieredLotValue(acres) (normalizes plattage).
//   - buckets: calendar quarters, >= 8 sales each (thin buckets merge forward),
//     smoothed with a 2-bucket trailing average.
//   - factor clamped to +/-25% total; null when either bucket is missing or the
//     smoothed series has < 3 buckets.
interface MarketIndex { factor: (compCloseMs: number) => number | null; }
// deno-lint-ignore no-explicit-any
async function computeMarketIndex(sb: any, county: string, isLand: boolean, asOfMs: number): Promise<MarketIndex> {
  const nullIndex: MarketIndex = { factor: () => null };
  if (!county) return nullIndex;
  const startD = new Date(asOfMs);
  startD.setMonth(startD.getMonth() - 42);
  const startStr = startD.toISOString().split("T")[0];
  const endStr = new Date(asOfMs).toISOString().split("T")[0];

  let q = sb
    .from("mls_listings")
    .select("close_price, close_date, living_area, lot_size_acres")
    .eq("standard_status", "Closed")
    .eq("county_or_parish", county)
    .gt("close_price", 0)
    .gte("close_date", startStr)
    .lte("close_date", endStr)
    .order("close_date", { ascending: true })
    .limit(2000);
  q = isLand
    ? q.eq("property_type", "Land").gt("lot_size_acres", 0)
    : q.neq("property_type", "Land").gt("living_area", 0);

  const { data, error } = await q;
  if (error || !data || data.length === 0) return nullIndex;

  const qIndex = (ms: number): number => {
    const d = new Date(ms);
    return d.getUTCFullYear() * 4 + Math.floor(d.getUTCMonth() / 3);
  };
  const landTiers = WNC_LAND_DEFAULTS.lot_tiers;

  const byQ = new Map<number, number[]>();
  for (const r of data as Array<Record<string, unknown>>) {
    const price = Number(r.close_price) || 0;
    if (price <= 0 || !r.close_date) continue;
    let metric: number;
    if (isLand) {
      const lv = tieredLotValue(Number(r.lot_size_acres) || 0, landTiers);
      if (lv <= 0) continue;
      metric = price / lv;
    } else {
      const la = Number(r.living_area) || 0;
      if (la <= 0) continue;
      metric = price / la;
    }
    const qi = qIndex(new Date((r.close_date as string) + "T00:00:00").getTime());
    if (!byQ.has(qi)) byQ.set(qi, []);
    byQ.get(qi)!.push(metric);
  }
  if (byQ.size === 0) return nullIndex;

  const qis = [...byQ.keys()].sort((a, b) => a - b);
  const minQ = qis[0], maxQ = qis[qis.length - 1];

  // Contiguous quarter buckets; merge any bucket with < 8 sales into the next.
  const raw: Array<{ qStart: number; qEnd: number; values: number[] }> = [];
  for (let qi = minQ; qi <= maxQ; qi++) {
    raw.push({ qStart: qi, qEnd: qi, values: (byQ.get(qi) || []).slice() });
  }
  const merged: Array<{ qStart: number; qEnd: number; values: number[] }> = [];
  let carry: { qStart: number; qEnd: number; values: number[] } | null = null;
  for (let i = 0; i < raw.length; i++) {
    let b = raw[i];
    if (carry) { b = { qStart: carry.qStart, qEnd: b.qEnd, values: carry.values.concat(b.values) }; carry = null; }
    if (b.values.length < 8 && i < raw.length - 1) { carry = b; continue; }
    merged.push(b);
  }
  if (carry) {
    if (merged.length) {
      const last = merged[merged.length - 1];
      last.qEnd = carry.qEnd;
      last.values = last.values.concat(carry.values);
    } else {
      merged.push(carry);
    }
  }
  const usable = merged.filter((b) => b.values.length >= 8);
  const base = (usable.length ? usable : merged).map((b) => ({ qStart: b.qStart, qEnd: b.qEnd, idx: medianOf(b.values) }));
  if (base.length < 3) return nullIndex;

  // 2-bucket trailing-average smoothing.
  const smoothed = base.map((s, i) => {
    const prev = i > 0 ? base[i - 1].idx : s.idx;
    return { qStart: s.qStart, qEnd: s.qEnd, idx: (s.idx + prev) / 2 };
  });

  const findBucket = (qi: number) => {
    for (const s of smoothed) if (qi >= s.qStart && qi <= s.qEnd) return s;
    return null;
  };
  const firstB = smoothed[0], lastB = smoothed[smoothed.length - 1];
  const asOfQi = qIndex(asOfMs);
  // As-of usually sits at/after the newest data; clamp it to the latest bucket
  // (the "current" market level) rather than nulling out every comp.
  let asOfBucket = findBucket(asOfQi);
  if (!asOfBucket) asOfBucket = asOfQi > lastB.qEnd ? lastB : (asOfQi < firstB.qStart ? firstB : lastB);

  return {
    factor: (compCloseMs: number): number | null => {
      if (!asOfBucket || !asOfBucket.idx) return null;
      const cb = findBucket(qIndex(compCloseMs));
      if (!cb || !cb.idx) return null;
      let f = asOfBucket.idx / cb.idx - 1;
      if (f > 0.25) f = 0.25;
      if (f < -0.25) f = -0.25;
      return f;
    },
  };
}

// Rolling county land list-to-sale ratio (F7): median(close_price/list_price)
// over closed Land sales in the last 24 months. Active land is priced at raw
// list price, but rural land closes below ask; this discounts it. Fallback 0.90
// when fewer than 8 closed samples exist.
// deno-lint-ignore no-explicit-any
async function computeLandListToSaleRatio(sb: any, county: string, asOfMs: number): Promise<number> {
  if (!county) return 0.90;
  const startD = new Date(asOfMs);
  startD.setMonth(startD.getMonth() - 24);
  const startStr = startD.toISOString().split("T")[0];
  const endStr = new Date(asOfMs).toISOString().split("T")[0];
  const { data } = await sb
    .from("mls_listings")
    .select("close_price, list_price")
    .eq("standard_status", "Closed")
    .eq("county_or_parish", county)
    .eq("property_type", "Land")
    .gt("close_price", 0)
    .gt("list_price", 0)
    .gte("close_date", startStr)
    .lte("close_date", endStr)
    .order("close_date", { ascending: false })
    .limit(2000);
  const ratios = ((data || []) as Array<Record<string, unknown>>)
    .map((r) => (Number(r.close_price) || 0) / (Number(r.list_price) || 1))
    .filter((x) => x > 0 && x < 3 && Number.isFinite(x));
  if (ratios.length < 8) return 0.90;
  return medianOf(ratios);
}

// Detect whether a property is restricted or unrestricted from MLS data + AI features
// In WNC, "unrestricted" is a major selling point (no HOA, no covenants, can farm/subdivide)
function getRestrictionStatus(
  listing: ListingData,
  features: FeatureTags | null
): "unrestricted" | "restricted" | "unknown" {
  const restrictions = (listing.restrictions as string[]) || [];
  const summary = (features?.restrictions_summary as string) || "";
  const remarks = ((listing.public_remarks as string) || "").toLowerCase();

  // Check feature tags first (AI-extracted restriction_status)
  if (features?.restriction_status === "unrestricted") return "unrestricted";
  if (features?.restriction_status === "restricted") return "restricted";

  // Check MLS restrictions field
  const restrictionStr = restrictions.join(" ").toLowerCase();

  // Explicit "none" or unrestricted indicators
  if (
    restrictions.some((r) => /^none$/i.test(r.trim())) ||
    /\bunrestrict/i.test(summary) ||
    /\bno\s+restrict/i.test(summary) ||
    /\bunrestrict/i.test(remarks) ||
    /\bno\s+(deed\s+)?restrict/i.test(remarks)
  ) {
    return "unrestricted";
  }

  // Deed restrictions, HOA, covenants, subdivision restrictions
  if (
    /deed\s*restrict|covenant|hoa|association|subdivision\s*restrict/i.test(restrictionStr) ||
    /deed\s*restrict|covenant|hoa\b|association\s+(fee|due)/i.test(summary) ||
    (listing.association_fee && Number(listing.association_fee) > 0)
  ) {
    return "restricted";
  }

  // If restrictions array has entries but none matched "None"
  if (restrictions.length > 0 && !restrictions.some((r) => /^none$/i.test(r.trim()))) {
    return "restricted";
  }

  return "unknown";
}

interface AdjustmentResult {
  comp_listing_key: string;
  comp_order: number;
  sale_price: number;
  adjustments: Record<string, number>;
  total_adjustment: number;
  adjusted_price: number;
  gross_adjustment_pct: number;
  net_adjustment_pct: number;
  warnings: string[];
  ai_suggested: Record<string, number>;
  price_basis?: string; // "close" | "list" | "list_adjusted"
  list_to_sale_ratio?: number | null;
  completeness?: number; // fraction (0-1) of the 6 mountain ratings present on the comp
  is_closed?: boolean;
  is_stale_active?: boolean;
}

function calculateCompAdjustments(
  subject: ListingData,
  comp: ListingData,
  subjectFeatures: FeatureTags | null,
  compFeatures: FeatureTags | null,
  compOrder: number,
  pairedSalesData: Record<string, number> | null,
  sliderOverrides?: Record<string, number>,
  // asOfMs: "value as of" timestamp for time-travel/backtesting. Defaults to
  // Date.now() so live behavior is byte-for-byte identical when not supplied.
  asOfMs: number = Date.now(),
  // timeFactor: market-derived appreciation factor for this comp (F2). null =>
  // apply zero time adjustment (no assumed drift). undefined preserves legacy
  // behavior for any caller that doesn't supply it.
  timeFactor?: number | null,
  // listToSaleRatio: county land list-to-sale ratio (F7). Applied to non-closed
  // land comps whose price basis is list_price. undefined/null => no discount.
  listToSaleRatio?: number | null
): AdjustmentResult {
  const adjustments: Record<string, number> = {};
  const warnings: string[] = [];

  // Price basis (F7): closed comps use close_price. Non-closed comps (Active/
  // Pending/AUC) carry only a list price; rural land closes below ask, so we
  // discount the list price by the county list-to-sale ratio and mark the basis.
  const compStatus = String(comp.standard_status || "").toLowerCase();
  const isClosedComp = compStatus === "closed";
  let salePrice = comp.close_price || comp.list_price || 0;
  let priceBasis: string = comp.close_price ? "close" : (comp.list_price ? "list" : "close");
  let appliedRatio: number | null = null;
  if (!isClosedComp && !comp.close_price && (comp.list_price || 0) > 0 &&
      typeof listToSaleRatio === "number" && listToSaleRatio > 0) {
    salePrice = Math.round((comp.list_price as number) * listToSaleRatio);
    priceBasis = "list_adjusted";
    appliedRatio = listToSaleRatio;
  }

  // Staleness (F7): an active listing sitting > 365 days is overpriced by
  // definition. Warn here; the valuation step excludes it from the weighted mean.
  const compDom = Number(comp.days_on_market) || 0;
  const isStaleActive = !isClosedComp && compDom > 365;
  if (isStaleActive) {
    warnings.push(
      `Comp ${compOrder + 1} has been listed ${compDom} days (>365). Stale active listing; excluded from the valuation average and shown as a ceiling reference only.`
    );
  }

  // Use land rates for land CMAs, standard for residential
  const isLand = (subject.property_type || "").toLowerCase() === "land";
  const baseRates = isLand ? WNC_LAND_DEFAULTS : WNC_DEFAULTS;
  const rates = { ...baseRates, ...(pairedSalesData || {}) };

  // ── Standard Adjustments ──

  // Living area ($/sqft x sqft difference)
  const subSqft = subject.living_area || 0;
  const compSqft = comp.living_area || 0;
  if (subSqft > 0 && compSqft > 0) {
    adjustments.adj_living_area = Math.round(
      (subSqft - compSqft) * rates.price_per_sqft
    );
  } else if (subSqft === 0 && compSqft > 0) {
    warnings.push("MISSING DATA: Subject living area is unknown. Square footage adjustment is $0 but should not be. Enter the subject's sqft manually.");
  } else if (compSqft === 0 && subSqft > 0) {
    warnings.push(`MISSING DATA: Comp ${compOrder + 1} has no living area data. Square footage adjustment is $0 and may be unreliable.`);
  }

  // Lot size (tiered marginal value: larger parcels have lower per-acre rates)
  const subLot = subject.lot_size_acres || 0;
  const compLot = comp.lot_size_acres || 0;
  if (subLot > 0 && compLot > 0) {
    adjustments.adj_lot_size = Math.round(
      tieredLotValue(subLot, rates.lot_tiers) - tieredLotValue(compLot, rates.lot_tiers)
    );
  } else if (subLot === 0 && compLot > 0) {
    warnings.push("MISSING DATA: Subject lot size is unknown. Lot size adjustment is $0 but should not be. Enter the subject's acreage manually.");
  } else if (compLot === 0 && subLot > 0) {
    warnings.push(`MISSING DATA: Comp ${compOrder + 1} has no lot size data. Lot size adjustment is $0 and may be unreliable.`);
  }

  // Restriction status (unrestricted vs restricted land)
  // Unrestricted land commands a premium in WNC: no HOA/covenants, can subdivide, farm, etc.
  // Adjustment = % of the SUBJECT's lot value (unrestricted subject vs restricted comp = positive)
  const subRestriction = getRestrictionStatus(subject, subjectFeatures);
  const compRestriction = getRestrictionStatus(comp, compFeatures);
  if (
    subRestriction !== "unknown" &&
    compRestriction !== "unknown" &&
    subRestriction !== compRestriction
  ) {
    // Use the average lot value as the basis for the percentage adjustment
    const avgLotAcres = (subLot + compLot) / 2 || 1;
    const avgLotValue = tieredLotValue(avgLotAcres, rates.lot_tiers);
    const premium = Math.round(avgLotValue * rates.unrestricted_premium_pct);
    // Positive if subject is unrestricted (worth more), negative if subject is restricted
    adjustments.adj_restrictions =
      subRestriction === "unrestricted" ? premium : -premium;
  }

  // Bedrooms
  const subBeds = subject.bedrooms_total || 0;
  const compBeds = comp.bedrooms_total || 0;
  if (subBeds > 0 && compBeds > 0) {
    adjustments.adj_bedrooms = (subBeds - compBeds) * rates.per_bedroom;
  }

  // Bathrooms (half baths valued at 0.5 of a full bath; see effectiveBaths)
  const subBaths = effectiveBaths(subject.bathrooms_total_integer, subject.bathrooms_half);
  const compBaths = effectiveBaths(comp.bathrooms_total_integer, comp.bathrooms_half);
  if (subBaths > 0 && compBaths > 0) {
    adjustments.adj_bathrooms = Math.round((subBaths - compBaths) * rates.per_bathroom);
  }

  // Garage (enhanced: base rate per space + oversize premium)
  const subGarage = (subject.garage_spaces as number) || 0;
  const compGarage = (comp.garage_spaces as number) || 0;
  {
    const baseGarageAdj = (subGarage - compGarage) * rates.per_garage_space;
    // Size premium for oversized garages (workshops, etc.)
    const subGarageSqft = (subjectFeatures?.garage_sqft as number) || (subGarage * 400);
    const compGarageSqft = (compFeatures?.garage_sqft as number) || (compGarage * 400);
    const standardSqft = Math.max(subGarage, compGarage, 1) * 400;
    const extraSubSqft = Math.max(0, subGarageSqft - standardSqft);
    const extraCompSqft = Math.max(0, compGarageSqft - standardSqft);
    const sizeAdj = Math.round((extraSubSqft - extraCompSqft) * rates.garage_oversize_per_sqft);
    adjustments.adj_garage = baseGarageAdj + sizeAdj;
  }

  // ── Structural Feature Adjustments ──

  if (subjectFeatures && compFeatures) {
    // Pool (WNC: neutral to slightly negative due to short season, maintenance)
    const subPool = subjectFeatures.has_pool as boolean || false;
    const compPool = compFeatures.has_pool as boolean || false;
    if (subPool !== compPool) {
      const poolValue = (type: string): number => {
        if (type === "in_ground" || type === "indoor") return rates.pool_inground;
        if (type === "above_ground") return rates.pool_above_ground;
        return 0;
      };
      const subPoolType = (subjectFeatures.pool_type as string) || "none";
      const compPoolType = (compFeatures.pool_type as string) || "none";
      adjustments.adj_pool = poolValue(subPool ? subPoolType : "none") - poolValue(compPool ? compPoolType : "none");
    }

    // Basement
    const subBasement = (subjectFeatures.basement_type as string) || "none";
    const compBasement = (compFeatures.basement_type as string) || "none";
    if (subBasement !== compBasement) {
      const basementValue = (type: string, sqft: number | null): number => {
        switch (type) {
          case "finished": return (sqft || 800) * rates.basement_finished_per_sqft;
          case "partial": return rates.basement_partial;
          case "unfinished": return rates.basement_unfinished;
          case "crawl_space": return 0;
          case "none": return 0;
          default: return 0;
        }
      };
      adjustments.adj_basement = Math.round(
        basementValue(subBasement, subjectFeatures.basement_sqft as number | null) -
        basementValue(compBasement, compFeatures.basement_sqft as number | null)
      );
    }

    // Fireplace
    const subFP = (subjectFeatures.has_fireplace as boolean) ? ((subjectFeatures.fireplace_count as number) || 1) : 0;
    const compFP = (compFeatures.has_fireplace as boolean) ? ((compFeatures.fireplace_count as number) || 1) : 0;
    if (subFP !== compFP) {
      let fpAdj = (subFP - compFP) * rates.fireplace_value;
      // Stone/masonry premium
      const subStone = ((subjectFeatures.fireplace_type as string) || "").includes("stone");
      const compStone = ((compFeatures.fireplace_type as string) || "").includes("stone");
      if (subStone && !compStone && subFP > 0) fpAdj += rates.fireplace_stone_premium;
      if (compStone && !subStone && compFP > 0) fpAdj -= rates.fireplace_stone_premium;
      adjustments.adj_fireplace = fpAdj;
    }

    // Covered outdoor space (porches, screened porches, covered decks)
    const subOutdoor = (subjectFeatures.covered_outdoor_sqft as number) || 0;
    const compOutdoor = (compFeatures.covered_outdoor_sqft as number) || 0;
    if (subOutdoor > 0 || compOutdoor > 0) {
      adjustments.adj_covered_outdoor = Math.round(
        (subOutdoor - compOutdoor) * rates.covered_outdoor_per_sqft
      );
    }

    // Outbuildings (tier-based)
    const subOutbldg = (subjectFeatures.outbuilding_value_tier as number) || 0;
    const compOutbldg = (compFeatures.outbuilding_value_tier as number) || 0;
    if (subOutbldg !== compOutbldg) {
      adjustments.adj_outbuildings =
        (rates.outbuilding_tier_values[subOutbldg] || 0) - (rates.outbuilding_tier_values[compOutbldg] || 0);
    }
  }

  // Year built (age difference)
  const subYear = subject.year_built || 0;
  const compYear = comp.year_built || 0;
  if (subYear > 0 && compYear > 0) {
    adjustments.adj_year_built = (subYear - compYear) * rates.per_year_age;
  }

  // ── Mountain-Specific Adjustments ──

  if (subjectFeatures && compFeatures) {
    // View quality
    const subView = subjectFeatures.view_quality || 0;
    const compView = compFeatures.view_quality || 0;
    if (subView > 0 && compView > 0) {
      adjustments.adj_view = (subView - compView) * rates.view_per_point;
    }

    // Water features
    const subWater = subjectFeatures.water_quality || 0;
    const compWater = compFeatures.water_quality || 0;
    if (subWater > 0 && compWater > 0) {
      adjustments.adj_water_features =
        (subWater - compWater) * rates.water_per_point;
    }

    // Land usability
    const subLand = subjectFeatures.land_usability || 0;
    const compLand = compFeatures.land_usability || 0;
    if (subLand > 0 && compLand > 0) {
      adjustments.adj_land_character =
        (subLand - compLand) * rates.land_per_point;
    }

    // Road noise
    const subRoad = subjectFeatures.road_noise || 0;
    const compRoad = compFeatures.road_noise || 0;
    if (subRoad > 0 && compRoad > 0) {
      adjustments.adj_road_noise =
        (subRoad - compRoad) * rates.road_noise_per_point;
    }

    // Privacy
    const subPrivacy = subjectFeatures.privacy_rating || 0;
    const compPrivacy = compFeatures.privacy_rating || 0;
    if (subPrivacy > 0 && compPrivacy > 0) {
      adjustments.adj_privacy =
        (subPrivacy - compPrivacy) * rates.privacy_per_point;
    }

    // Elevation
    const subElev = subjectFeatures.elevation_ft || 0;
    const compElev = compFeatures.elevation_ft || 0;
    if (subElev > 0 && compElev > 0) {
      adjustments.adj_elevation = Math.round(
        ((subElev - compElev) / 100) * rates.elevation_per_100ft
      );
    }

    // Condition
    const subCond = subjectFeatures.condition_rating || 0;
    const compCond = compFeatures.condition_rating || 0;
    if (subCond > 0 && compCond > 0) {
      // Condition adjustments are larger; rate lives in the rates objects now.
      adjustments.adj_condition = (subCond - compCond) * rates.condition_per_point;
    }
  }

  // ── Missing-rating warnings + data completeness (F9) ──
  // Each mountain adjustment above fires only when BOTH sides have a rating > 0.
  // A silently-omitted adjustment made an untagged comp look "cleaner" (fewer
  // adjustments -> lower gross -> MORE weight), which is backwards. Warn on every
  // one-sided rating and compute a completeness fraction the valuation step uses
  // to DOWN-weight thinly-tagged comps.
  const ratingCats: Array<[string, keyof FeatureTags]> = [
    ["view", "view_quality"],
    ["water", "water_quality"],
    ["land usability", "land_usability"],
    ["road noise", "road_noise"],
    ["privacy", "privacy_rating"],
    ["condition", "condition_rating"],
  ];
  let ratingsPresentOnComp = 0;
  if (!compFeatures) {
    warnings.push(`Comp ${compOrder + 1} has no feature extraction; mountain adjustments omitted.`);
  } else {
    for (const [label, key] of ratingCats) {
      const sv = Number((subjectFeatures || {})[key]) || 0;
      const cv = Number(compFeatures[key]) || 0;
      if (cv > 0) ratingsPresentOnComp++;
      if ((sv > 0) !== (cv > 0)) {
        const missingSide = sv > 0 ? "comp" : "subject";
        warnings.push(`${label} rating missing on ${missingSide}; ${label} adjustment omitted for comp ${compOrder + 1}.`);
      }
    }
  }
  const completeness = compFeatures ? ratingsPresentOnComp / ratingCats.length : 0;

  // ── Market Adjustments ──

  // Time adjustment (F2): market-derived. timeFactor is index(as-of quarter) /
  // index(comp's sale quarter) - 1, clamped to +/-25%. When it's null/undefined
  // (thin data, or an active comp with no close_date) we apply ZERO adjustment —
  // an appraiser never assumes appreciation. The legacy monthly_appreciation_pct
  // is retained in the rates objects for manual sliders/reference only.
  if (comp.close_date && typeof timeFactor === "number" && Number.isFinite(timeFactor)) {
    adjustments.adj_time = Math.round(salePrice * timeFactor);
  } else {
    adjustments.adj_time = 0;
  }

  // Concessions (if sale price vs close price differ, or from data)
  adjustments.adj_concessions = 0;

  // ── Apply Slider Overrides ──
  // Sliders override AI-suggested values. Each slider maps to an adjustment key.
  if (sliderOverrides) {
    for (const [key, val] of Object.entries(sliderOverrides)) {
      if (key.startsWith("adj_")) {
        adjustments[key] = val;
      }
    }
  }

  // ── Calculate Totals ──
  let totalAdj = 0;
  let grossAdj = 0;
  for (const val of Object.values(adjustments)) {
    // Guard: a missing rate can make an adjustment NaN. Never let one bad value
    // poison the whole result (NaN total -> NaN adjusted_price -> dropped -> blank CMA).
    const v = Number.isFinite(val) ? val : 0;
    totalAdj += v;
    grossAdj += Math.abs(v);
  }

  const adjustedPrice = salePrice + totalAdj;
  const grossPct = salePrice > 0 ? (grossAdj / salePrice) * 100 : 0;
  const netPct = salePrice > 0 ? (Math.abs(totalAdj) / salePrice) * 100 : 0;

  // ── Appraisal Guardrail Warnings ──
  if (grossPct > 25) {
    warnings.push(
      `Gross adjustments (${grossPct.toFixed(1)}%) exceed 25% of sale price. This comp may not be sufficiently comparable.`
    );
  }
  if (netPct > 15) {
    warnings.push(
      `Net adjustments (${netPct.toFixed(1)}%) exceed 15% of sale price. Consider whether this comp is appropriate.`
    );
  }

  // Check individual adjustments > 10% of sale price
  for (const [key, val] of Object.entries(adjustments)) {
    if (salePrice > 0 && Math.abs(val) / salePrice > 0.1) {
      const label = key
        .replace("adj_", "")
        .replace(/_/g, " ")
        .replace(/\b\w/g, (c) => c.toUpperCase());
      warnings.push(
        `${label} adjustment ($${Math.abs(val).toLocaleString()}) exceeds 10% of comp sale price.`
      );
    }
  }

  return {
    comp_listing_key: comp.listing_key,
    comp_order: compOrder,
    sale_price: salePrice,
    adjustments,
    total_adjustment: totalAdj,
    adjusted_price: adjustedPrice,
    gross_adjustment_pct: Math.round(grossPct * 10) / 10,
    net_adjustment_pct: Math.round(netPct * 10) / 10,
    warnings,
    ai_suggested: { ...adjustments }, // Preserve AI suggestions before overrides
    price_basis: priceBasis,
    list_to_sale_ratio: appliedRatio,
    completeness,
    is_closed: isClosedComp,
    is_stale_active: isStaleActive,
  };
}

// ═══════════════════════════════════════════════════════════════
// AI ADVISOR
// Claude-powered analysis: considerations, per-comp reasoning, summary
// ═══════════════════════════════════════════════════════════════

async function getAIAdvice(
  subject: ListingData,
  subjectFeatures: FeatureTags | null,
  comps: Array<{
    listing: ListingData;
    features: FeatureTags | null;
    adjustments: AdjustmentResult;
  }>,
  valuation?: { suggested_low?: number; suggested_high?: number; suggested_price?: number }
): Promise<{
  considerations: Array<{
    category: string;
    severity: string;
    message: string;
    suggested_action: string;
  }>;
  summary: string;
  comp_reasoning: Record<string, string>;
}> {
  // Build the context for Claude
  const subjectDesc = [
    `Address: ${subject.full_address || "Unknown"}, ${subject.city || ""}, ${subject.county_or_parish || ""}`,
    `Type: ${subject.property_type || ""} / ${subject.property_sub_type || ""}`,
    subject.living_area ? `Sqft: ${subject.living_area}` : "",
    subject.lot_size_acres ? `Lot: ${subject.lot_size_acres} acres` : "",
    subject.bedrooms_total ? `Beds: ${subject.bedrooms_total}` : "",
    subject.bathrooms_total_integer
      ? `Baths: ${subject.bathrooms_total_integer}`
      : "",
    subject.year_built ? `Year Built: ${subject.year_built}` : "",
    subject.list_price ? `Current List Price: $${subject.list_price.toLocaleString()}` : "",
  ]
    .filter(Boolean)
    .join(" | ");

  // Build appreciation context if prior sale history exists
  const marketAnnualRate = WNC_DEFAULTS.monthly_appreciation_pct * 12; // 3.6%
  let appreciationContext = "";
  if (subject.close_price && subject.close_date) {
    const purchaseDate = new Date(subject.close_date + "T00:00:00");
    const yearsSince = (Date.now() - purchaseDate.getTime()) / (365.25 * 86400000);
    const suggestedPrice = valuation?.suggested_price || 0;

    const lines: string[] = [
      `Last Sale: $${subject.close_price.toLocaleString()} on ${subject.close_date} (${yearsSince.toFixed(1)} years ago)`,
    ];

    if (suggestedPrice > 0) {
      lines.push(`CMA Suggested Value: $${suggestedPrice.toLocaleString()}`);
      const totalAppreciation = ((suggestedPrice - subject.close_price) / subject.close_price) * 100;
      const annualRate = yearsSince > 0.25 ? totalAppreciation / yearsSince : null;
      if (annualRate !== null) {
        lines.push(`Implied Annual Appreciation: ${annualRate.toFixed(1)}%`);
      }
      lines.push(`Market Baseline (${subject.city || "WNC"}): ~${marketAnnualRate.toFixed(1)}% annually`);
      if (annualRate !== null) {
        if (annualRate > marketAnnualRate + 1.5) {
          lines.push("This property has appreciated ABOVE the general market rate, which may indicate strong demand for its features or a risk of overvaluation.");
        } else if (annualRate < marketAnnualRate - 1.5) {
          lines.push("This property has appreciated BELOW the general market rate, which may indicate deferred maintenance, unfavorable location factors, or a buying opportunity.");
        } else {
          lines.push("This property has tracked with the general market appreciation rate.");
        }
      }
    }
    appreciationContext = "\n\nAPPRECIATION CONTEXT:\n  " + lines.join("\n  ");
  } else if (valuation?.suggested_price) {
    appreciationContext = `\n\nCMA VALUATION:\n  Suggested Value: $${valuation.suggested_price.toLocaleString()} (Range: $${(valuation.suggested_low || 0).toLocaleString()} - $${(valuation.suggested_high || 0).toLocaleString()})`;
  }

  const featureDesc = subjectFeatures
    ? [
        `View: ${subjectFeatures.view_quality || "?"}/5 (${(subjectFeatures.view_type || []).join(", ") || "unknown"})`,
        `Water: ${subjectFeatures.water_quality || "?"}/5 (${(subjectFeatures.water_features || []).join(", ") || "none"})`,
        `Land: ${subjectFeatures.land_usability || "?"}/5 (${(subjectFeatures.land_character || []).join(", ") || "unknown"})`,
        `Road Noise: ${subjectFeatures.road_noise || "?"}/5`,
        `Privacy: ${subjectFeatures.privacy_rating || "?"}/5`,
        `Condition: ${subjectFeatures.condition_rating || "?"}/5`,
        subjectFeatures.elevation_ft
          ? `Elevation: ${subjectFeatures.elevation_ft}ft`
          : "",
      ]
        .filter(Boolean)
        .join(" | ")
    : "No feature tags available";

  // Check if agent overrode any adjustments (slider changes show the agent disagrees with AI-extracted features)
  // Compare actual adj values to what the formula would have produced
  const overrideNotes: string[] = [];
  if (comps.length > 0) {
    const a0 = comps[0].adjustments;
    const cf0 = comps[0].features;
    if (subjectFeatures && cf0) {
      // If view adjustment is $0 or negative but subject view_quality is high, agent likely overrode it
      const viewDiff = (subjectFeatures.view_quality || 0) - (cf0.view_quality || 0);
      const expectedViewDir = viewDiff > 0 ? "positive" : viewDiff < 0 ? "negative" : "zero";
      const actualViewAdj = a0.adjustments.adj_view || 0;
      if (viewDiff > 1 && actualViewAdj <= 0) {
        overrideNotes.push("AGENT OVERRIDE: View adjustment was reduced/zeroed despite AI rating subject view at " + (subjectFeatures.view_quality || "?") + "/5. The agent has determined the AI-extracted view quality is inaccurate. Do NOT reference the subject having good views.");
      } else if (viewDiff < -1 && actualViewAdj >= 0) {
        overrideNotes.push("AGENT OVERRIDE: View adjustment was increased despite AI rating subject view lower than comp. The agent has determined the subject has better views than the AI detected.");
      }
      // Check privacy
      const privDiff = (subjectFeatures.privacy_rating || 0) - (cf0.privacy_rating || 0);
      if (privDiff > 1 && (a0.adjustments.adj_privacy || 0) <= 0) {
        overrideNotes.push("AGENT OVERRIDE: Privacy adjustment was reduced/zeroed despite AI rating subject privacy at " + (subjectFeatures.privacy_rating || "?") + "/5. Do NOT reference the subject having excellent privacy.");
      }
      // Check water
      const waterDiff = (subjectFeatures.water_quality || 0) - (cf0.water_quality || 0);
      if (waterDiff > 1 && (a0.adjustments.adj_water_features || 0) <= 0) {
        overrideNotes.push("AGENT OVERRIDE: Water features adjustment was reduced/zeroed. Do NOT reference the subject having premium water features.");
      }
    }
  }

  const compsDesc = comps
    .map((c, i) => {
      const l = c.listing;
      const f = c.features;
      const a = c.adjustments;
      return [
        `\nCOMP ${i + 1}: ${l.full_address || "Unknown"}, ${l.city || ""}`,
        `  Sale Price: $${(l.close_price || 0).toLocaleString()} (closed ${l.close_date || "unknown"})`,
        `  Type: ${l.property_type || ""} | Sqft: ${l.living_area || "?"} | Lot: ${l.lot_size_acres || "?"} acres | Beds: ${l.bedrooms_total || "?"} | Baths: ${l.bathrooms_total_integer || "?"}`,
        `  Year Built: ${l.year_built || "?"} | Garage: ${l.garage_spaces || 0}`,
        f
          ? `  Features: View ${f.view_quality || "?"}/5, Water ${f.water_quality || "?"}/5, Land ${f.land_usability || "?"}/5, Road Noise ${f.road_noise || "?"}/5, Privacy ${f.privacy_rating || "?"}/5, Condition ${f.condition_rating || "?"}/5${f.elevation_ft ? ", Elev " + f.elevation_ft + "ft" : ""}`
          : "  Features: Not tagged",
        `  Adj Breakdown: ${Object.entries(a.adjustments).filter(([, v]) => v !== 0).map(([k, v]) => `${k.replace("adj_", "")}: $${(v as number).toLocaleString()}`).join(", ") || "none"}`,
        `  Adjustments: Total $${a.total_adjustment.toLocaleString()} | Adjusted Price: $${a.adjusted_price.toLocaleString()}`,
        `  Gross Adj: ${a.gross_adjustment_pct}% | Net Adj: ${a.net_adjustment_pct}%`,
        a.warnings.length
          ? `  WARNINGS: ${a.warnings.join("; ")}`
          : "",
      ]
        .filter(Boolean)
        .join("\n");
    })
    .join("\n");

  const systemPrompt = `You are an expert real estate appraiser and CMA analyst specializing in Western North Carolina mountain properties.

You understand that in WNC mountain markets, land character drives value more than structure. Two identical cabins can differ by $200K based on views, creek frontage, road access, and elevation.

Analyze the subject property and its comparable sales. Provide:

1. CONSIDERATIONS: An array of consideration objects, each with:
   - category: "pricing" | "comp_selection" | "adjustment" | "market" | "mountain_factor" | "risk"
   - severity: "info" | "warning" | "critical"
   - message: Clear, actionable insight (2-3 sentences max)
   - suggested_action: What the agent should do about it

2. SUMMARY: A professional 3-5 sentence narrative summarizing the CMA findings, suitable for a listing presentation. Reference specific data points and comparables. Write in third person professional tone.

3. COMP_REASONING: For EACH comp, write a plain-English paragraph (3-5 sentences) comparing it to the subject. Cover:
   - What makes the comp stronger or weaker than the subject
   - Key differences that drive the adjustments
   - Any concerns about using this comp
   - How confident you are in this comparison
   Use the comp's listing key as the object key.

Focus on mountain-specific factors that RPR and other tools miss. Flag any comps that may not be truly comparable despite surface similarity. Consider seasonal access, road quality, view permanence (tree growth), and flood/slide risk.

If appreciation context is provided, comment on whether the property's value trajectory is healthy relative to market norms. Flag any cases where implied appreciation seems unusually high (may indicate overvaluation) or unusually low (may indicate opportunity or deferred maintenance).

CRITICAL: The mountain feature ratings were AI-extracted from MLS listing remarks and may be INACCURATE. The agent may have overridden them via sliders. If the "AGENT CORRECTIONS" section is present, those corrections take priority over the AI-extracted ratings. Base your analysis on the ACTUAL ADJUSTMENT VALUES, not the AI-extracted feature ratings. If adj_view is $0 for all comps, the subject does NOT have premium views regardless of what the AI-extracted rating says.

Return valid JSON with this structure:
{
  "considerations": [...],
  "summary": "...",
  "comp_reasoning": { "listing_key_1": "...", "listing_key_2": "..." }
}`;

  const userMessage = `SUBJECT PROPERTY:
${subjectDesc}
${appreciationContext}

SUBJECT MOUNTAIN FEATURES (AI-extracted from MLS remarks):
${featureDesc}
${overrideNotes.length > 0 ? "\nIMPORTANT - AGENT CORRECTIONS TO AI-EXTRACTED FEATURES:\n" + overrideNotes.join("\n") + "\nThe agent has local knowledge and has manually corrected these ratings via sliders. Trust the agent's corrections over the AI-extracted values. Do NOT reference features the agent has overridden." : ""}

COMPARABLE SALES:
${compsDesc}

Analyze these comparables and provide your professional assessment.`;

  try {
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: AI_MODEL,
        max_tokens: 3000,
        system: systemPrompt,
        messages: [{ role: "user", content: userMessage }],
      }),
    });

    if (!response.ok) {
      console.error(`Claude API error: ${response.status}`);
      return {
        considerations: [
          {
            category: "risk",
            severity: "warning",
            message: "AI analysis unavailable. Review adjustments manually.",
            suggested_action: "Check API key and try again.",
          },
        ],
        summary: "AI summary unavailable.",
        comp_reasoning: {},
      };
    }

    const data = await response.json();
    const text = data?.content?.[0]?.text || "";
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      console.error("No JSON in AI response:", text.slice(0, 200));
      return {
        considerations: [],
        summary: "AI analysis could not be parsed.",
        comp_reasoning: {},
      };
    }

    return JSON.parse(jsonMatch[0]);
  } catch (e) {
    console.error("AI advice error:", e);
    return {
      considerations: [],
      summary: "AI analysis encountered an error.",
      comp_reasoning: {},
    };
  }
}

// ═══════════════════════════════════════════════════════════════
// PAIRED SALES GENERATION
// Find pairs of similar sold properties differing in one feature
// ═══════════════════════════════════════════════════════════════

async function generatePairedSales(
  sb: ReturnType<typeof createClient>,
  county: string | null,
  limit: number
): Promise<{ generated: number; errors: string[] }> {
  // Fetch closed listings with feature tags
  let query = sb
    .from("mls_listings")
    .select(
      "listing_key, close_price, close_date, living_area, lot_size_acres, bedrooms_total, bathrooms_total_integer, year_built, property_type, property_sub_type, city, county_or_parish, latitude, longitude"
    )
    .eq("standard_status", "Closed")
    .not("close_price", "is", null)
    .order("close_date", { ascending: false })
    .limit(200);

  if (county) {
    query = query.eq("county_or_parish", county);
  }

  const { data: listings, error: qErr } = await query;
  if (qErr || !listings || listings.length < 2) {
    return { generated: 0, errors: [qErr?.message || "Not enough listings"] };
  }

  // Fetch feature tags for these listings
  const keys = listings.map(
    (l: Record<string, unknown>) => l.listing_key as string
  );
  const { data: tags } = await sb
    .from("cma_feature_tags")
    .select("*")
    .in("listing_key", keys);

  const tagMap = new Map<string, FeatureTags>();
  (tags || []).forEach((t: FeatureTags & { listing_key: string }) => {
    tagMap.set(t.listing_key, t);
  });

  // Only consider listings with feature tags
  const tagged = listings.filter((l: ListingData) =>
    tagMap.has(l.listing_key)
  );

  if (tagged.length < 2) {
    return {
      generated: 0,
      errors: ["Not enough tagged listings for paired sales"],
    };
  }

  const featureCategories = [
    "view_quality",
    "water_quality",
    "land_usability",
    "road_noise",
    "privacy_rating",
  ];

  const pairs: Array<Record<string, unknown>> = [];
  const errors: string[] = [];

  // Compare each pair of similar listings
  for (let i = 0; i < tagged.length && pairs.length < limit; i++) {
    for (let j = i + 1; j < tagged.length && pairs.length < limit; j++) {
      const a = tagged[i] as ListingData;
      const b = tagged[j] as ListingData;
      const fa = tagMap.get(a.listing_key)!;
      const fb = tagMap.get(b.listing_key)!;

      // Must be same property type and similar size (within 30%)
      if (a.property_type !== b.property_type) continue;
      const sqftA = a.living_area || 0;
      const sqftB = b.living_area || 0;
      if (sqftA > 0 && sqftB > 0) {
        const ratio = Math.min(sqftA, sqftB) / Math.max(sqftA, sqftB);
        if (ratio < 0.7) continue;
      }

      // Must be in same county
      if (a.county_or_parish !== b.county_or_parish) continue;

      // Must be geographically close (within 10 miles)
      if (a.latitude && a.longitude && b.latitude && b.longitude) {
        const dist = distanceMiles(
          a.latitude, a.longitude,
          b.latitude, b.longitude
        );
        if (dist > 10) continue;
      }

      // Find which single feature differs most
      for (const cat of featureCategories) {
        const valA = (fa as Record<string, unknown>)[cat] as number | undefined;
        const valB = (fb as Record<string, unknown>)[cat] as number | undefined;
        if (valA == null || valB == null) continue;
        const diff = Math.abs(valA - valB);
        if (diff < 2) continue; // Need meaningful difference (2+ points)

        // Check other features are similar (within 1 point each)
        let othersSimilar = true;
        for (const otherCat of featureCategories) {
          if (otherCat === cat) continue;
          const oA = (fa as Record<string, unknown>)[otherCat] as
            | number
            | undefined;
          const oB = (fb as Record<string, unknown>)[otherCat] as
            | number
            | undefined;
          if (oA != null && oB != null && Math.abs(oA - oB) > 1) {
            othersSimilar = false;
            break;
          }
        }

        if (!othersSimilar) continue;

        const priceA = a.close_price || 0;
        const priceB = b.close_price || 0;
        if (priceA === 0 || priceB === 0) continue;

        const priceDiff = priceA - priceB;
        const derivedAdj = Math.round(priceDiff / diff); // Per-point adjustment

        // Calculate similarity (how close the other attributes are)
        let simScore = 0.5;
        if (sqftA > 0 && sqftB > 0) {
          simScore = Math.min(sqftA, sqftB) / Math.max(sqftA, sqftB);
        }

        const confidence =
          simScore > 0.9 ? "high" : simScore > 0.75 ? "medium" : "low";

        pairs.push({
          agent_id: null,
          listing_key_a: a.listing_key,
          listing_key_b: b.listing_key,
          feature_category: cat,
          feature_a_value: String(valA),
          feature_b_value: String(valB),
          price_a: priceA,
          price_b: priceB,
          derived_adjustment: derivedAdj,
          similarity_score: Math.round(simScore * 100) / 100,
          confidence,
          county: a.county_or_parish || "",
          area: a.city || "",
          sale_date_a: a.close_date,
          sale_date_b: b.close_date,
          ai_derived: true,
          notes: `Auto-derived: ${cat} diff of ${diff} points, $${Math.abs(derivedAdj).toLocaleString()}/point`,
        });
      }
    }
  }

  // Insert pairs
  if (pairs.length > 0) {
    const { error: insertErr } = await sb
      .from("cma_paired_sales")
      .upsert(pairs);
    if (insertErr) {
      errors.push(`Insert error: ${insertErr.message}`);
    }
  }

  return { generated: pairs.length, errors };
}

// ═══════════════════════════════════════════════════════════════
// MAIN HANDLER
// ═══════════════════════════════════════════════════════════════

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
    const body = await req.json();
    const action = body.action || "";

    // ═══ ACTION: lookup-listing ═══
    // On-demand MLS API query for properties not in our database
    // Used when subject property was sold >2 years ago and not in local DB
    // Queries both MLS Grid (Canopy) and Navica (CSAR) APIs by listing ID or address
    if (action === "lookup-listing") {
      const searchId = body.listing_id || "";
      const searchAddress = body.address || "";

      if (!searchId && !searchAddress) {
        return jsonResp({ error: "listing_id or address required" }, 400);
      }

      // Parse address into components for OData filtering
      // Handles formats like "123 Main St", "123 Main Street, Franklin"
      let addrStreetNumber = "";
      let addrStreetName = "";
      let addrCity = "";
      if (searchAddress) {
        const addrParts = searchAddress.split(",").map((s: string) => s.trim());
        const streetPart = addrParts[0] || "";
        addrCity = addrParts[1] || "";

        // Split street into number + name
        const streetMatch = streetPart.match(/^(\d+)\s+(.+)/);
        if (streetMatch) {
          addrStreetNumber = streetMatch[1];
          // Remove suffix (St, Rd, Dr, etc.) for broader matching
          addrStreetName = streetMatch[2]
            .replace(/\b(st|street|rd|road|dr|drive|ln|lane|ct|court|cir|circle|ave|avenue|blvd|boulevard|way|pl|place|trl|trail|hwy|highway|pkwy|parkway)\b\.?$/i, "")
            .trim();
        } else {
          addrStreetName = streetPart;
        }
      }

      const results: Record<string, unknown>[] = [];
      const errors: string[] = [];

      // Helper: title-case a string for StreetName matching
      function titleCase(s: string): string {
        return s.replace(/\w\S*/g, (t) => t.charAt(0).toUpperCase() + t.slice(1).toLowerCase());
      }

      // ── Try MLS Grid (Canopy MLS) ──
      const mlsGridToken = Deno.env.get("MLS_GRID_TOKEN") || "";
      const mlsGridSystem = Deno.env.get("MLS_GRID_ORIGINATING_SYSTEM") || "";
      if (mlsGridToken && mlsGridSystem) {
        // MLS Grid only supports filtering on: OriginatingSystemName, ModificationTimestamp,
        // StandardStatus, PropertyType, ListingId, MlgCanView, ListOfficeMlsId.
        // StreetName/StreetNumber/City are NOT filterable. Address search must use Navica or local DB.
        if (searchId) {
        try {
          const mlsLocalPrefix = Deno.env.get("MLS_LOCAL_PREFIX") || "";
          const prefixedId = mlsLocalPrefix ? `${mlsLocalPrefix}${searchId}` : searchId;
          const filter = `OriginatingSystemName eq '${mlsGridSystem}' and ListingId eq '${prefixedId}'`;
          console.log("[lookup] MLS Grid filter:", filter);
          const url = `https://api.mlsgrid.com/v2/Property?$filter=${filter}&$expand=Media&$top=5`;
          const _t0 = Date.now();
          let _statusCode: number | null = null;
          let _respBytes: number | null = null;
          let _errMsg: string | null = null;
          const resp = await fetch(url, {
            headers: { Authorization: `Bearer ${mlsGridToken}`, Accept: "application/json" },
          });
          _statusCode = resp.status;
          if (!resp.ok) {
            const body = await resp.text().catch(() => "");
            _respBytes = body.length;
            _errMsg = `MLS Grid ${resp.status}: ${body.slice(0, 200)}`;
            console.log("[lookup] MLS Grid error:", resp.status, body.slice(0, 200));
            errors.push(`MLS Grid: ${resp.status}`);
            // Audit log this call too — caller bypasses mls-sync's lock,
            // so we need visibility into it from the rate-limit log.
            await sb.from("mls_grid_api_log").insert({
              caller: "cma-engine:lookup-listing", endpoint: "api.mlsgrid.com",
              url, status_code: _statusCode, duration_ms: Date.now() - _t0,
              response_bytes: _respBytes, error_message: _errMsg,
            }).then(() => {}, () => {});
          } else {
          const data = await resp.json();
          _respBytes = JSON.stringify(data).length;
          await sb.from("mls_grid_api_log").insert({
            caller: "cma-engine:lookup-listing", endpoint: "api.mlsgrid.com",
            url, status_code: _statusCode, duration_ms: Date.now() - _t0,
            response_bytes: _respBytes, error_message: null,
          }).then(() => {}, () => {});
          const records = data.value || [];
          for (const r of records) {
            // Store to our DB for future use
            const listingKey = r.ListingKey || "";
            const listingId = mlsLocalPrefix && r.ListingId?.startsWith(mlsLocalPrefix)
              ? r.ListingId.slice(mlsLocalPrefix.length)
              : (r.ListingId || "");

              const fullAddr = `${r.StreetNumber || ""} ${r.StreetName || ""} ${r.StreetSuffix || ""}`.trim();

              const listing = {
                listing_id: listingId,
                listing_key: listingKey,
                originating_system_name: mlsGridSystem,
                modification_timestamp: r.ModificationTimestamp || "",
                standard_status: r.StandardStatus || "Closed",
                mlg_can_view: r.MlgCanView !== false,
                feed_type: "IDX",
                // Note: full_address is a GENERATED column, do NOT include it
                list_price: r.ListPrice || null,
                close_price: r.ClosePrice || null,
                original_list_price: r.OriginalListPrice || null,
                street_number: r.StreetNumber || "",
                street_name: r.StreetName || "",
                street_suffix: r.StreetSuffix || "",
                unit_number: r.UnitNumber || "",
                city: r.City || "",
                state_or_province: r.StateOrProvince || "NC",
                postal_code: r.PostalCode || "",
                county_or_parish: r.CountyOrParish || "",
                property_type: r.PropertyType || "",
                property_sub_type: r.PropertySubType || "",
                bedrooms_total: r.BedroomsTotal || 0,
                bathrooms_total_integer: r.BathroomsTotalInteger || 0,
                bathrooms_half: r.BathroomsHalf || 0,
                living_area: r.LivingArea || null,
                living_area_units: r.LivingAreaUnits || "Square Feet",
                lot_size_acres: r.LotSizeAcres || null,
                lot_size_square_feet: r.LotSizeSquareFeet || null,
                year_built: r.YearBuilt || null,
                stories: r.Stories || null,
                garage_spaces: r.GarageSpaces || 0,
                parking_total: r.ParkingTotal || 0,
                public_remarks: r.PublicRemarks || "",
                list_agent_full_name: r.ListAgentFullName || "",
                list_office_name: r.ListOfficeName || "",
                buyer_agent_full_name: r.BuyerAgentFullName || "",
                buyer_office_name: r.BuyerOfficeName || "",
                list_date: r.ListingContractDate || null,
                close_date: r.CloseDate || null,
                days_on_market: r.DaysOnMarket || 0,
                latitude: r.Latitude || null,
                longitude: r.Longitude || null,
                tax_annual_amount: r.TaxAnnualAmount || null,
                tax_year: r.TaxYear || null,
                heating: r.Heating || [],
                cooling: r.Cooling || [],
                view: r.View || [],
                waterfront_features: r.WaterfrontFeatures || [],
                water_source: r.WaterSource || [],
                sewer: r.Sewer || [],
                zoning: r.Zoning || "",
                raw_data: r,
                updated_at: new Date().toISOString(),
              };

              // Upsert to DB so it's available for future queries
              await sb.from("mls_listings").upsert(listing, { onConflict: "listing_key" });

              // Store media too
              const media = r.Media || [];
              if (media.length > 0) {
                await sb.from("mls_media").delete().eq("listing_key", listingKey);
                const mediaRows = media.map((m: any, i: number) => ({
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
                  modification_timestamp: m.ModificationTimestamp || "",
                }));
                await sb.from("mls_media").insert(mediaRows);
              }

            results.push({
              listing_key: listingKey,
              listing_id: listingId,
              source: "Canopy MLS",
              full_address: fullAddr,
              city: r.City || "",
              standard_status: r.StandardStatus || "",
              close_price: r.ClosePrice || null,
              close_date: r.CloseDate || null,
              list_price: r.ListPrice || null,
              living_area: r.LivingArea || null,
              bedrooms_total: r.BedroomsTotal || 0,
              bathrooms_total_integer: r.BathroomsTotalInteger || 0,
              year_built: r.YearBuilt || null,
              photo_count: media.length,
            });
          }
          } // close else (resp.ok)
        } catch (err) {
          errors.push(`MLS Grid: ${err instanceof Error ? err.message : String(err)}`);
        }
        } else {
          // Address-based search: MLS Grid doesn't support StreetName/StreetNumber filtering
          console.log("[lookup] MLS Grid skipped for address search (only supports ListingId filter)");
        }
      }

      // ── Try Navica (CSAR) ──
      const navicaToken = Deno.env.get("NAVICA_SERVER_TOKEN") || "";
      const navicaDataset = Deno.env.get("NAVICA_DATASET_ID") || "nav27";
      if (navicaToken) {
        try {
          const navicaBase = `https://navapi.navicamls.net/api/v2/OData/${navicaDataset}`;
          const navOrderBy = searchAddress ? "&$orderby=CloseDate desc" : "";

          // Helper to fetch from Navica with a given filter
          async function navicaQuery(f: string, top = 10): Promise<any[]> {
            const u = `${navicaBase}/Property?$filter=${f}&$top=${top}${navOrderBy}&access_token=${navicaToken}`;
            console.log("[lookup] Navica query:", u.replace(navicaToken, "***"));
            const r = await fetch(u, { headers: { Accept: "application/json" } });
            if (!r.ok) {
              const body = await r.text().catch(() => "");
              console.log("[lookup] Navica error:", r.status, body.slice(0, 200));
              throw new Error(`${r.status}`);
            }
            const d = await r.json();
            return d.value || [];
          }

          // Build filter based on search type
          let navRecords: any[] = [];
          if (searchId) {
            const idFilter = `PropertyType ne 'Residential Lease' and ListingId eq '${searchId}'`;
            console.log("[lookup] Navica filter (ID):", idFilter);
            navRecords = await navicaQuery(idFilter);
          } else if (addrStreetName) {
            // Strategy: try multiple approaches to find the listing
            // 1. Exact match with city (most precise)
            // 2. contains() on StreetName with StreetNumber (works without city)
            // 3. StreetNumber only, filter locally (broadest)
            const nameTitled = titleCase(addrStreetName).replace(/'/g, "''");
            const nameLower = addrStreetName.toLowerCase();

            // Approach 1: Exact StreetName + City (if city provided)
            if (addrCity) {
              const exactFilter = `PropertyType ne 'Residential Lease' and StreetNumber eq '${addrStreetNumber}' and StreetName eq '${nameTitled}' and City eq '${addrCity.replace(/'/g, "''")}'`;
              console.log("[lookup] Navica filter (exact+city):", exactFilter);
              try { navRecords = await navicaQuery(exactFilter); } catch (e) { console.log("[lookup] Navica exact+city failed:", e); }
            }

            // Approach 2: contains() on StreetName with StreetNumber (no city needed)
            if (navRecords.length === 0 && addrStreetNumber) {
              // Use first word of street name for contains() to handle multi-word names
              const nameWords = addrStreetName.trim().split(/\s+/);
              const containsWord = titleCase(nameWords[0]).replace(/'/g, "''");
              const containsFilter = `PropertyType ne 'Residential Lease' and StreetNumber eq '${addrStreetNumber}' and contains(StreetName,'${containsWord}')`;
              console.log("[lookup] Navica filter (contains):", containsFilter);
              try {
                const containsResults = await navicaQuery(containsFilter, 20);
                // Local filter to verify full street name match
                navRecords = containsResults.filter((r: any) =>
                  (r.StreetName || "").toLowerCase().includes(nameLower)
                );
                if (navRecords.length === 0 && containsResults.length > 0) {
                  // contains() found results but none matched the full name - show what we got
                  navRecords = containsResults;
                }
              } catch (e) {
                console.log("[lookup] Navica contains() failed:", e);
              }
            }

            // Approach 3: StreetNumber only, broader search with local filtering
            if (navRecords.length === 0 && addrStreetNumber) {
              console.log("[lookup] Navica fallback: StreetNumber only");
              let broadFilter = `PropertyType ne 'Residential Lease' and StreetNumber eq '${addrStreetNumber}'`;
              if (addrCity) broadFilter += ` and City eq '${addrCity.replace(/'/g, "''")}'`;
              try {
                const broadResults = await navicaQuery(broadFilter, 20);
                navRecords = broadResults.filter((r: any) =>
                  (r.StreetName || "").toLowerCase().includes(nameLower)
                );
              } catch (e) {
                console.log("[lookup] Navica broad search failed:", e);
                errors.push(`Navica: ${e instanceof Error ? e.message : String(e)}`);
              }
            }
          }
          for (const r of navRecords) {
              const listingKey = r.ListingKey || "";
              const listingId = r.ListingId || r.ListingKey || "";

              // Check if already found via MLS Grid (avoid duplicates)
              if (results.some((res: any) => res.listing_id === listingId)) continue;

              const navFullAddr = `${r.StreetNumber || ""} ${r.StreetName || ""} ${r.StreetSuffix || ""}`.trim();

              const listing = {
                listing_id: listingId,
                listing_key: listingKey,
                originating_system_name: r.OriginatingSystemName || "CSAR",
                modification_timestamp: r.APIModificationTimestamp || r.ModificationTimestamp || "",
                standard_status: r.StandardStatus || "Closed",
                mlg_can_view: true,
                feed_type: "IDX",
                // Note: full_address is a GENERATED column, do NOT include it
                list_price: r.ListPrice || null,
                close_price: r.ClosePrice || null,
                original_list_price: r.OriginalListPrice || null,
                street_number: r.StreetNumber || "",
                street_name: r.StreetName || "",
                street_suffix: r.StreetSuffix || "",
                unit_number: r.UnitNumber || "",
                city: r.City || "",
                state_or_province: r.StateOrProvince || "NC",
                postal_code: r.PostalCode || "",
                county_or_parish: r.CountyOrParish || "",
                property_type: r.PropertyType || "",
                property_sub_type: r.PropertySubType || "",
                bedrooms_total: r.BedroomsTotal || 0,
                bathrooms_total_integer: r.BathroomsTotalInteger || 0,
                bathrooms_half: r.BathroomsHalf || 0,
                living_area: r.LivingArea || null,
                living_area_units: r.LivingAreaUnits || "Square Feet",
                lot_size_acres: r.LotSizeAcres || null,
                lot_size_square_feet: r.LotSizeSquareFeet || null,
                year_built: r.YearBuilt || null,
                stories: r.Stories || null,
                garage_spaces: r.GarageSpaces || 0,
                parking_total: r.ParkingTotal || 0,
                public_remarks: r.PublicRemarks || "",
                list_agent_full_name: r.ListAgentFullName || "",
                list_office_name: r.ListOfficeName || "",
                buyer_agent_full_name: r.BuyerAgentFullName || "",
                buyer_office_name: r.BuyerOfficeName || "",
                list_date: r.ListingContractDate || null,
                close_date: r.CloseDate || null,
                days_on_market: r.DaysOnMarket || 0,
                latitude: r.Latitude || null,
                longitude: r.Longitude || null,
                tax_annual_amount: r.TaxAnnualAmount || null,
                tax_year: r.TaxYear || null,
                heating: r.Heating || [],
                cooling: r.Cooling || [],
                view: r.View || [],
                waterfront_features: r.WaterfrontFeatures || [],
                water_source: r.WaterSource || [],
                sewer: r.Sewer || [],
                zoning: r.Zoning || "",
                raw_data: r,
                updated_at: new Date().toISOString(),
              };

              const { error: upsertErr } = await sb.from("mls_listings").upsert(listing, { onConflict: "listing_key" });
              if (upsertErr) {
                console.error("[lookup] Navica upsert error:", upsertErr.message, upsertErr.details);
                errors.push(`DB save: ${upsertErr.message}`);
              }

            results.push({
              listing_key: listingKey,
              listing_id: listingId,
              source: "CSAR",
              full_address: navFullAddr,
              city: r.City || "",
              standard_status: r.StandardStatus || "",
              close_price: r.ClosePrice || null,
              close_date: r.CloseDate || null,
              list_price: r.ListPrice || null,
              living_area: r.LivingArea || null,
              bedrooms_total: r.BedroomsTotal || 0,
              bathrooms_total_integer: r.BathroomsTotalInteger || 0,
              year_built: r.YearBuilt || null,
              photo_count: 0,
            });
          }
        } catch (err) {
          errors.push(`Navica: ${err instanceof Error ? err.message : String(err)}`);
        }
      }

      // If address search returned 0 MLS results, try county GIS as a fallback
      // County records have property details (beds, baths, sqft, sale info) searchable by address
      let countyFallback: Record<string, unknown> | null = null;
      let countyFallbackSource = "";
      if (results.length === 0 && searchAddress && addrStreetNumber) {
        try {
          const addrUpper = searchAddress.toUpperCase();
          // Try NC OneMap statewide parcels (covers all counties)
          const oneMapUrl = `https://services.nconemap.gov/secure/rest/services/NC1Map_Parcels/FeatureServer/1/query?where=siteadd+LIKE+'%25${encodeURIComponent(addrUpper)}%25'&outFields=parno,siteadd,ownname,gisacres,parval,landval,improvval,structyear,parusedesc,cntyname&f=json&resultRecordCount=5`;
          console.log("[lookup] County GIS fallback query:", oneMapUrl);
          const ncResp = await fetch(oneMapUrl);
          const ncData = await ncResp.json();
          if (ncData.features && ncData.features.length > 0) {
            const parcel = ncData.features[0].attributes;
            countyFallback = {
              full_address: parcel.siteadd || searchAddress,
              county_or_parish: parcel.cntyname || "",
              lot_size_acres: parcel.gisacres || null,
              assessed_value: parcel.parval || null,
              land_value: parcel.landval || null,
              building_value: parcel.improvval || null,
              year_built: parcel.structyear || null,
              owner: parcel.ownname || null,
              pin: parcel.parno || null,
              land_use: parcel.parusedesc || null,
            };
            countyFallbackSource = "NC OneMap";
            console.log("[lookup] County GIS found:", parcel.siteadd, parcel.cntyname);

            // Try county-specific GIS for more details (beds, baths, sqft)
            const cnty = (parcel.cntyname || "").toLowerCase();
            if (cnty === "jackson") {
              const jUrl = `https://gis.jacksonnc.org/jcgis/rest/services/Tax_Admin/Parcels/MapServer/0/query?where=PropAddr+LIKE+'%25${encodeURIComponent(addrUpper)}%25'&outFields=PIN,PropAddr,AssessedAcres,TotBldgValue,TotLandValue,TaxableValue,SalePrice,SaleDate,CurrentOwner1&f=json&resultRecordCount=1`;
              const jRes = await fetch(jUrl);
              const jData = await jRes.json();
              if (jData.features && jData.features.length > 0) {
                const jp = jData.features[0].attributes;
                countyFallback.last_sale_price = jp.SalePrice || null;
                countyFallback.last_sale_date = jp.SaleDate || null;
                countyFallbackSource = "Jackson County GIS";
                // Get building details
                if (jp.PIN) {
                  const bUrl = `https://gis.jacksonnc.org/jcgis/rest/services/Tax_Admin/Appraisal/MapServer/1/query?where=PIN='${jp.PIN}'&outFields=SqFt,NbrBdrms,FullBath,HalfBath,NbrStories,YrBuilt,YrRemodeled,Style,Grade,Cond&f=json`;
                  const bRes = await fetch(bUrl);
                  const bData = await bRes.json();
                  if (bData.features && bData.features.length > 0) {
                    const bldg = bData.features[0].attributes;
                    countyFallback.living_area = bldg.SqFt || null;
                    countyFallback.bedrooms_total = bldg.NbrBdrms || null;
                    countyFallback.bathrooms_total_integer = bldg.FullBath || null;
                    countyFallback.half_baths = bldg.HalfBath || null;
                    countyFallback.year_built = parseInt(bldg.YrBuilt) || countyFallback.year_built;
                    countyFallback.stories = parseInt(bldg.NbrStories) || null;
                    countyFallback.condition = bldg.Cond || null;
                  }
                }
              }
            } else if (cnty === "haywood") {
              const hUrl = `https://maps.haywoodcountync.gov/arcgis/rest/services/Land_Records/Open_Data/MapServer/3/query?where=Prop_Addr+LIKE+'%25${encodeURIComponent(addrUpper)}%25'&outFields=Prop_Addr,Calc_Acres,Heated_Area,Yr_Built,Land_Value,Bldg_Value,Assd_Value,Sale_Price,Sale_Date,Owner_1&f=json&resultRecordCount=1`;
              const hRes = await fetch(hUrl);
              const hData = await hRes.json();
              if (hData.features && hData.features.length > 0) {
                const hp = hData.features[0].attributes;
                countyFallback.living_area = hp.Heated_Area || null;
                countyFallback.year_built = hp.Yr_Built || countyFallback.year_built;
                countyFallback.last_sale_price = hp.Sale_Price || null;
                countyFallback.last_sale_date = hp.Sale_Date || null;
                countyFallbackSource = "Haywood County GIS";
              }
            } else if (cnty === "swain") {
              const sUrl = `https://maps.swaincountync.gov/server/rest/services/ParcelsForDownload/FeatureServer/0/query?where=ParcelAddr+LIKE+'%25${encodeURIComponent(addrUpper)}%25'&outFields=PIN,ParcelAddr,DEED_ACRE,TotalAssessedValue,ParcelBuildingValue,ParcelLandValue,Name1&f=json&resultRecordCount=1`;
              const sRes = await fetch(sUrl);
              const sData = await sRes.json();
              if (sData.features && sData.features.length > 0) {
                const sp = sData.features[0].attributes;
                countyFallback.lot_size_acres = parseFloat(sp.DEED_ACRE) || countyFallback.lot_size_acres;
                countyFallbackSource = "Swain County GIS";
              }
            }
          }
        } catch (countyErr) {
          console.error("[lookup] County GIS fallback error:", countyErr);
          // Non-fatal, continue with MLS-only response
        }
      }

      return jsonResp({
        ok: true,
        results,
        found: results.length,
        errors: errors.length > 0 ? errors : undefined,
        apis_queried: {
          mls_grid: !mlsGridToken || !mlsGridSystem ? "skipped (no token)" : searchAddress ? "skipped (address search not supported)" : "queried",
          navica: navicaToken ? "queried" : "skipped (no token)",
        },
        parsed_address: searchAddress ? { street_number: addrStreetNumber, street_name: addrStreetName, city: addrCity || "(none)" } : undefined,
        county_record: countyFallback,
        county_source: countyFallbackSource,
        message: results.length > 0
          ? `Found ${results.length} listing(s) from MLS API and saved to database`
          : countyFallback
            ? "No MLS listings found, but property found in county records"
            : searchId ? "No listings found matching that ID" : "No listings found matching that address",
      });
    }

    // ═══ ACTION: score-comp ═══
    // Score a single comp against a subject. Used when the client adds an
    // MLS listing as a comp manually — find-comps already filters by
    // status/date/distance, so the manually-added row never went through
    // that pipeline and needs its similarity computed here.
    //
    // Body: { subject_listing_key, comp_listing_key, subject_overrides?,
    //         feature_overrides? }
    // Returns: { similarity: {...}, distance: number|null }
    if (action === "score-comp") {
      const subjectKey = body.subject_listing_key;
      const compKey = body.comp_listing_key;
      if (!subjectKey || !compKey) {
        return jsonResp(
          { error: "subject_listing_key and comp_listing_key required" },
          400,
        );
      }
      const { data: subjRow, error: subErr } = await sb
        .from("mls_listings")
        .select("*")
        .eq("listing_key", subjectKey)
        .maybeSingle();
      if (subErr || !subjRow) {
        return jsonResp({ error: "Subject not found" }, 404);
      }
      const { data: compRow, error: compErr } = await sb
        .from("mls_listings")
        .select("*")
        .eq("listing_key", compKey)
        .maybeSingle();
      if (compErr || !compRow) {
        return jsonResp({ error: "Comp not found" }, 404);
      }
      // Apply client overrides to the subject so the score reflects the
      // user's edits (sqft, beds, year, etc.) just like find-comps does.
      const subject = { ...subjRow } as Record<string, unknown>;
      if (body.subject_overrides) {
        for (const [k, v] of Object.entries(body.subject_overrides)) {
          if (v != null) subject[k] = v;
        }
      }
      const [{ data: subjTags }, { data: compTags }] = await Promise.all([
        sb.from("cma_feature_tags").select("*").eq("listing_key", subjectKey).is(
          "agent_id",
          null,
        ).maybeSingle(),
        sb.from("cma_feature_tags").select("*").eq("listing_key", compKey).is(
          "agent_id",
          null,
        ).maybeSingle(),
      ]);
      const mergedSubjTags = body.feature_overrides
        ? { ...(subjTags || {}), ...body.feature_overrides }
        : subjTags;
      const similarity = scoreComp(
        subject as ListingData,
        compRow as ListingData,
        (mergedSubjTags as FeatureTags) || null,
        (compTags as FeatureTags) || null,
      );
      const distance =
        subject.latitude && subject.longitude && compRow.latitude &&
          compRow.longitude
          ? Math.round(
            distanceMiles(
              subject.latitude as number,
              subject.longitude as number,
              compRow.latitude as number,
              compRow.longitude as number,
            ) * 10,
          ) / 10
          : null;
      return jsonResp({ ok: true, similarity, distance });
    }

    // ═══ ACTION: find-comps ═══
    if (action === "find-comps") {
      const listingKey = body.listing_key;
      const manualSubject = body.manual_subject;
      const filters = body.filters || {};

      let subject: Record<string, unknown>;
      let subjectTags: Record<string, unknown> | null = null;

      if (listingKey) {
        // Fetch from database
        const { data: dbSubject, error: subErr } = await sb
          .from("mls_listings")
          .select("*")
          .eq("listing_key", listingKey)
          .maybeSingle();

        if (subErr || !dbSubject) {
          return jsonResp(
            { error: "Subject listing not found", detail: subErr?.message },
            404
          );
        }
        subject = dbSubject;

        // Apply subject overrides from client (user-edited sqft, beds, year, etc.)
        // This ensures the engine scores comps against the user's edited values,
        // not stale DB data (e.g., pre-renovation sqft, old construction type)
        if (body.subject_overrides) {
          for (const [k, v] of Object.entries(body.subject_overrides)) {
            if (v != null) subject[k] = v;
          }
        }

        // Fetch subject feature tags
        const { data: tags } = await sb
          .from("cma_feature_tags")
          .select("*")
          .eq("listing_key", listingKey)
          .is("agent_id", null)
          .maybeSingle();
        subjectTags = tags;
      } else if (manualSubject) {
        // Manual entry - use provided data directly
        subject = manualSubject;
      } else {
        return jsonResp(
          { error: "listing_key or manual_subject required" },
          400
        );
      }

      // Apply feature overrides from client (e.g. user-set construction_type)
      if (body.feature_overrides) {
        subjectTags = { ...(subjectTags || {}), ...body.feature_overrides };
      }

      // Resolve subject construction; log subjects search a wider radius (scarce log sales)
      let subConstr = resolveConstruction(subjectTags, subject);
      if (subConstr === "unknown") subConstr = "site_built";
      const isLogSubject = subConstr === "log";

      // Build comp query
      const isLandSubject = String(subject.property_type || "").toLowerCase() === "land";
      // Time-travel/backtest support: value the subject as if today were `as_of_date`.
      // asOfProvided gates the "past date" behaviors; when absent, asOfMs = Date.now()
      // and every query/scoring path is byte-for-byte identical to live behavior.
      const asOfDate = typeof body.as_of_date === "string" ? body.as_of_date : null;
      const asOfProvided = !!asOfDate;
      const asOfMs = asOfProvided
        ? new Date(asOfDate + "T00:00:00").getTime()
        : Date.now();
      const dateFloor =
        filters.min_close_date ||
        new Date(asOfMs - (isLandSubject ? 1095 : 365) * 86400000).toISOString().split("T")[0];
      const maxDistance = filters.max_distance_miles || (isLogSubject ? 40 : 15);

      let compQuery = sb
        .from("mls_listings")
        .select(
          "listing_key, full_address, city, county_or_parish, property_type, property_sub_type, living_area, lot_size_acres, bedrooms_total, bathrooms_total_integer, bathrooms_half, year_built, garage_spaces, close_price, close_date, list_price, days_on_market, list_date, latitude, longitude, standard_status, stories, public_remarks, construction_materials"
        )
        // Deterministic ordering + a higher cap so the distance filter (which runs
        // AFTER this query) sees the newest sales, not an arbitrary 100 rows (F6).
        .order("close_date", { ascending: false, nullsFirst: false })
        .limit(400);
      // Land: sales are sparse and comparable parcels sit as listings for years, so
      // closed-only biases toward the few better-located lots that actually sold.
      // Include active/pending listings (priced via list_price downstream).
      // Backtest caveat: when as_of_date is provided we CANNOT reconstruct which
      // listings were Active on that past date (current standard_status reflects
      // today), so land backtests restrict to Closed comps only.
      if (isLandSubject && !asOfProvided) {
        compQuery = compQuery
          .in("standard_status", ["Closed", "Active", "Active Under Contract", "Pending"])
          .or(`standard_status.neq.Closed,close_date.gte.${dateFloor}`);
      } else {
        compQuery = compQuery
          .eq("standard_status", "Closed")
          .not("close_price", "is", null)
          .gte("close_date", dateFloor);
      }
      // Upper bound: a comp that closed after as_of_date did not exist as a sale
      // yet, so it cannot inform value on that date.
      if (asOfProvided) {
        compQuery = compQuery.lte("close_date", asOfDate);
      }

      // Exclude subject if it's from DB
      if (listingKey) {
        compQuery = compQuery.neq("listing_key", listingKey);
      }

      // County filter (same county by default, allow override)
      if (filters.county) {
        compQuery = compQuery.eq("county_or_parish", filters.county);
      } else if (subject.county_or_parish) {
        compQuery = compQuery.eq(
          "county_or_parish",
          subject.county_or_parish as string
        );
      }

      // Property type filter
      if (filters.property_type) {
        compQuery = compQuery.eq("property_type", filters.property_type);
      } else if (subject.property_type) {
        compQuery = compQuery.eq("property_type", subject.property_type as string);
      }

      // City filter - match specific city or exclude certain cities.
      // ilike is case-insensitive so "clyde" matches "Clyde" (the value
      // stored on every row). Was failing silently with .eq before — the
      // filter looked applied but returned 0 rows.
      if (filters.city) {
        compQuery = compQuery.ilike("city", filters.city);
      } else if (filters.exclude_cities && filters.exclude_cities.length > 0) {
        // Exclude luxury/non-comparable markets
        for (const ec of filters.exclude_cities) {
          compQuery = compQuery.not("city", "ilike", ec);
        }
      }

      // Bounding-box prefilter (F6): narrows the candidate pool to the subject's
      // vicinity BEFORE the .limit(400), so nearby comps aren't crowded out by
      // distant same-county sales. Null-coordinate rows are kept (see helper).
      if (subject.latitude && subject.longitude) {
        compQuery = applyBoundingBox(compQuery, subject.latitude as number, subject.longitude as number, maxDistance);
      }

      const { data: rawComps, error: compErr } = await compQuery;
      if (compErr) {
        return jsonResp(
          { error: "Comp query failed", detail: compErr.message },
          500
        );
      }

      if (!rawComps || rawComps.length === 0) {
        return jsonResp({
          ok: true,
          comps: [],
          message: "No comparable sold listings found",
        });
      }

      // Distance filter (post-query since Supabase doesn't do geo natively)
      let filteredComps = rawComps as ListingData[];
      if (subject.latitude && subject.longitude) {
        filteredComps = filteredComps.filter((c: ListingData) => {
          if (!c.latitude || !c.longitude) return true; // Keep comps without coordinates
          return (
            distanceMiles(
              subject.latitude!,
              subject.longitude!,
              c.latitude!,
              c.longitude!
            ) <= maxDistance
          );
        });
      }

      // Price-segment guard (F5 partial): appraisers confine comps to the subject's
      // market segment. Price similarity is only a 0.10 scoring weight — too weak to
      // stop a $335K subject drawing $2.9M comps. When the subject has an anchor
      // price, drop candidates priced > 2.5x or < 0.4x it, but only if >= 6 survive.
      {
        let anchorPrice = (subject.list_price as number) || 0;
        if (!anchorPrice && subject.close_price && subject.close_date) {
          const yrs = (asOfMs - new Date((subject.close_date as string) + "T00:00:00").getTime()) / (365.25 * 86400000);
          if (yrs < 2) anchorPrice = subject.close_price as number;
        }
        if (anchorPrice > 0) {
          const inSeg = filteredComps.filter((c) => {
            const p = (c.close_price || c.list_price || 0) as number;
            return p > 0 && p <= anchorPrice * 2.5 && p >= anchorPrice * 0.4;
          });
          if (inSeg.length >= 6) {
            filteredComps = inSeg;
          } else {
            console.log(`[find-comps] price-segment guard skipped: only ${inSeg.length} of ${filteredComps.length} comps in segment (anchor $${Math.round(anchorPrice).toLocaleString()})`);
          }
        }
      }

      // Land: drop gross $/acre outliers (dev tracts, bulk lots) so they don't sit among rural lots
      if (isLandSubject && filteredComps.length >= 4) {
        const ppa = filteredComps.map((c) => { const p = (c.close_price || c.list_price || 0); const a = (c.lot_size_acres || 0); return a > 0 ? p / a : 0; }).filter((x) => x > 0).sort((a, b) => a - b);
        const med = ppa.length ? ppa[Math.floor(ppa.length / 2)] : 0;
        if (med > 0) {
          const pruned = filteredComps.filter((c) => { const a = (c.lot_size_acres || 0); const p = (c.close_price || c.list_price || 0); const x = a > 0 ? p / a : med; return x <= med * 5 && x >= med * 0.2; });
          if (pruned.length >= 3) filteredComps = pruned;
        }
      }

      // Fetch feature tags for all potential comps
      const compKeys = filteredComps.map((c: ListingData) => c.listing_key);
      const { data: compTags } = await sb
        .from("cma_feature_tags")
        .select("*")
        .in("listing_key", compKeys)
        .is("agent_id", null);

      const compTagMap = new Map<string, FeatureTags>();
      (compTags || []).forEach(
        (t: FeatureTags & { listing_key: string }) => {
          compTagMap.set(t.listing_key, t);
        }
      );

      // Score and rank comps
      const scored = filteredComps.map((c: ListingData) => {
        const cFeatures = compTagMap.get(c.listing_key) || null;
        const score = scoreComp(
          subject as ListingData,
          c,
          subjectTags || null,
          cFeatures,
          asOfMs
        );
        return {
          listing: c,
          features: cFeatures,
          similarity: score,
          distance:
            subject.latitude && subject.longitude && c.latitude && c.longitude
              ? Math.round(
                  distanceMiles(
                    subject.latitude,
                    subject.longitude,
                    c.latitude,
                    c.longitude
                  ) * 10
                ) / 10
              : null,
        };
      });

      // Sort by total similarity score descending
      scored.sort((a, b) => b.similarity.total - a.similarity.total);

      // Return top N (default 8)
      const topN = Math.min(filters.limit || 8, scored.length);
      const topComps = scored.slice(0, topN);

      // Detect price outliers within the selected group
      const outlierKeys = detectPriceOutliers(topComps);
      if (outlierKeys.size > 0) {
        console.log("[find-comps] Price outliers detected:", [...outlierKeys]);
      }
      const compsWithFlags = topComps.map((c) => ({
        ...c,
        is_price_outlier: outlierKeys.has(c.listing.listing_key),
      }));

      return jsonResp({
        ok: true,
        subject: {
          listing: subject,
          features: subjectTags,
        },
        comps: compsWithFlags,
        total_candidates: filteredComps.length,
        outliers_detected: outlierKeys.size,
      });
    }

    // ═══ ACTION: auto-select-comps ═══
    // AI picks the best 3-5 comps from scored candidates with reasoning
    if (action === "auto-select-comps") {
      const listingKey = body.listing_key;
      const manualSubject = body.manual_subject;
      const filters = body.filters || {};
      const targetCount = Math.min(body.target_count || 4, 6);

      // Reuse find-comps logic internally
      let subject: Record<string, unknown>;
      let subjectTags: Record<string, unknown> | null = null;

      if (listingKey) {
        const { data: dbSubject, error: subErr } = await sb
          .from("mls_listings")
          .select("*")
          .eq("listing_key", listingKey)
          .maybeSingle();
        if (subErr || !dbSubject) {
          return jsonResp({ error: "Subject listing not found", detail: subErr?.message }, 404);
        }
        subject = dbSubject;

        // Apply subject overrides from client (user-edited sqft, beds, year, etc.)
        if (body.subject_overrides) {
          for (const [k, v] of Object.entries(body.subject_overrides)) {
            if (v != null) subject[k] = v;
          }
        }

        const { data: tags } = await sb
          .from("cma_feature_tags")
          .select("*")
          .eq("listing_key", listingKey)
          .is("agent_id", null)
          .maybeSingle();
        subjectTags = tags;
      } else if (manualSubject) {
        subject = manualSubject;
      } else {
        return jsonResp({ error: "listing_key or manual_subject required" }, 400);
      }

      // Apply feature overrides from client (e.g. user-set construction_type)
      if (body.feature_overrides) {
        subjectTags = { ...(subjectTags || {}), ...body.feature_overrides };
      }

      // Resolve subject construction up front (drives radius + comp pooling below)
      let subConstr = resolveConstruction(subjectTags, subject);
      if (subConstr === "unknown") subConstr = "site_built";
      const isLogSubject = subConstr === "log";

      // Find comps (same logic as find-comps action)
      const isLandSubject = String(subject.property_type || "").toLowerCase() === "land";
      // Time-travel/backtest support (see find-comps action for full rationale).
      // asOfMs defaults to Date.now() so live behavior is unchanged when as_of_date absent.
      const asOfDate = typeof body.as_of_date === "string" ? body.as_of_date : null;
      const asOfProvided = !!asOfDate;
      const asOfMs = asOfProvided
        ? new Date(asOfDate + "T00:00:00").getTime()
        : Date.now();
      const dateFloor = filters.min_close_date ||
        new Date(asOfMs - (isLandSubject ? 1095 : 365) * 86400000).toISOString().split("T")[0];
      // Log subjects: widen radius to surface scarce log sales (appraisal practice: 10-40mi).
      const maxDistance = filters.max_distance_miles || (isLogSubject ? 40 : 15);

      let compQuery = sb
        .from("mls_listings")
        .select("listing_key, full_address, city, county_or_parish, property_type, property_sub_type, living_area, lot_size_acres, bedrooms_total, bathrooms_total_integer, bathrooms_half, year_built, garage_spaces, close_price, close_date, list_price, days_on_market, list_date, latitude, longitude, standard_status, stories, public_remarks, construction_materials")
        // Deterministic ordering + higher cap so nearby comps aren't crowded out (F6).
        .order("close_date", { ascending: false, nullsFirst: false })
        .limit(400);
      // Land: include active/pending listings, not just closed sales (see find-comps).
      // Backtest caveat: with as_of_date we cannot reconstruct past Active status,
      // so land backtests restrict to Closed comps only (see find-comps action).
      if (isLandSubject && !asOfProvided) {
        compQuery = compQuery
          .in("standard_status", ["Closed", "Active", "Active Under Contract", "Pending"])
          .or(`standard_status.neq.Closed,close_date.gte.${dateFloor}`);
      } else {
        compQuery = compQuery
          .eq("standard_status", "Closed")
          .not("close_price", "is", null)
          .gte("close_date", dateFloor);
      }
      // Upper bound: comps that closed after as_of_date didn't exist as sales yet.
      if (asOfProvided) {
        compQuery = compQuery.lte("close_date", asOfDate);
      }

      if (listingKey) compQuery = compQuery.neq("listing_key", listingKey);
      if (filters.county) {
        compQuery = compQuery.eq("county_or_parish", filters.county);
      } else if (subject.county_or_parish) {
        compQuery = compQuery.eq("county_or_parish", subject.county_or_parish as string);
      }
      if (filters.property_type) {
        compQuery = compQuery.eq("property_type", filters.property_type);
      } else if (subject.property_type) {
        compQuery = compQuery.eq("property_type", subject.property_type as string);
      }
      if (filters.city) {
        compQuery = compQuery.eq("city", filters.city);
      }

      // Bounding-box prefilter (F6): see find-comps for rationale.
      if (subject.latitude && subject.longitude) {
        compQuery = applyBoundingBox(compQuery, subject.latitude as number, subject.longitude as number, maxDistance);
      }

      const { data: rawComps, error: compErr } = await compQuery;
      if (compErr) return jsonResp({ error: "Comp query failed", detail: compErr.message }, 500);
      if (!rawComps || rawComps.length === 0) {
        return jsonResp({ ok: true, selected: [], message: "No comparable sold listings found" });
      }

      // Distance filter
      let filteredComps = rawComps as ListingData[];
      if (subject.latitude && subject.longitude) {
        filteredComps = filteredComps.filter((c: ListingData) => {
          if (!c.latitude || !c.longitude) return true;
          return distanceMiles(subject.latitude!, subject.longitude!, c.latitude!, c.longitude!) <= maxDistance;
        });
      }

      // Price-segment guard (F5 partial): see find-comps for rationale.
      {
        let anchorPrice = (subject.list_price as number) || 0;
        if (!anchorPrice && subject.close_price && subject.close_date) {
          const yrs = (asOfMs - new Date((subject.close_date as string) + "T00:00:00").getTime()) / (365.25 * 86400000);
          if (yrs < 2) anchorPrice = subject.close_price as number;
        }
        if (anchorPrice > 0) {
          const inSeg = filteredComps.filter((c) => {
            const p = (c.close_price || c.list_price || 0) as number;
            return p > 0 && p <= anchorPrice * 2.5 && p >= anchorPrice * 0.4;
          });
          if (inSeg.length >= 6) {
            filteredComps = inSeg;
          } else {
            console.log(`[auto-select] price-segment guard skipped: only ${inSeg.length} of ${filteredComps.length} comps in segment`);
          }
        }
      }

      // Land: drop gross $/acre outliers (dev tracts, bulk lots) so they don't sit among rural lots
      if (isLandSubject && filteredComps.length >= 4) {
        const ppa = filteredComps.map((c) => { const p = (c.close_price || c.list_price || 0); const a = (c.lot_size_acres || 0); return a > 0 ? p / a : 0; }).filter((x) => x > 0).sort((a, b) => a - b);
        const med = ppa.length ? ppa[Math.floor(ppa.length / 2)] : 0;
        if (med > 0) {
          const pruned = filteredComps.filter((c) => { const a = (c.lot_size_acres || 0); const p = (c.close_price || c.list_price || 0); const x = a > 0 ? p / a : med; return x <= med * 5 && x >= med * 0.2; });
          if (pruned.length >= 3) filteredComps = pruned;
        }
      }

      // Fetch feature tags for comps
      const compKeys = filteredComps.map((c: ListingData) => c.listing_key);
      const { data: compTags } = await sb
        .from("cma_feature_tags")
        .select("*")
        .in("listing_key", compKeys)
        .is("agent_id", null);
      const compTagMap = new Map<string, FeatureTags>();
      (compTags || []).forEach((t: FeatureTags & { listing_key: string }) => {
        compTagMap.set(t.listing_key, t);
      });

      // Score and take top 10
      const scored = filteredComps.map((c: ListingData) => {
        const cFeatures = compTagMap.get(c.listing_key) || null;
        const score = scoreComp(subject as ListingData, c, subjectTags || null, cFeatures, asOfMs);
        return {
          listing: c,
          features: cFeatures,
          similarity: score,
          distance: (subject.latitude && subject.longitude && c.latitude && c.longitude)
            ? Math.round(distanceMiles(subject.latitude as number, subject.longitude as number, c.latitude, c.longitude) * 10) / 10
            : null,
        };
      });
      scored.sort((a, b) => b.similarity.total - a.similarity.total);

      // Detect and remove price outliers before AI selection
      // Outliers indicate a different market segment and skew the analysis
      const outlierKeys = detectPriceOutliers(scored.slice(0, 10));
      const excludedOutliers: Array<{ listing_key: string; price: number; reason: string }> = [];
      let cleanScored = scored;
      if (outlierKeys.size > 0) {
        console.log("[auto-select] Removing price outliers:", [...outlierKeys]);
        for (const c of scored) {
          if (outlierKeys.has(c.listing.listing_key)) {
            excludedOutliers.push({
              listing_key: c.listing.listing_key,
              price: (c.listing.close_price || 0) as number,
              reason: "Price outlier: significantly different from comp group median",
            });
          }
        }
        cleanScored = scored.filter((c) => !outlierKeys.has(c.listing.listing_key));
      }

      // Candidate pool is ranked purely by overall similarity (scoreComp already gives
      // log-to-log a mild edge). We do NOT front-load log comps — size/price similarity
      // must dominate, so a similar site-built home beats a much larger/pricier log home.
      const top10 = cleanScored.slice(0, 10);
      const logCompCount = isLogSubject
        ? cleanScored.filter((c) => resolveConstruction(c.features, c.listing) === "log").length
        : 0;
      const constructionFallback = isLogSubject && logCompCount < targetCount;

      if (top10.length <= targetCount) {
        // Not enough to be selective, return all
        return jsonResp({
          ok: true,
          subject: { listing: subject, features: subjectTags },
          selected: top10,
          excluded_outliers: excludedOutliers.length > 0 ? excludedOutliers : undefined,
          ai_reasoning: "Not enough candidates to be selective. All available comps included.",
          total_candidates: filteredComps.length,
          log_comp_count: isLogSubject ? logCompCount : undefined,
          construction_fallback: isLogSubject ? constructionFallback : undefined,
        });
      }

      // Ask Claude to pick the best comps
      const isLand = (subject.property_type as string) === "Land";
      // Resolve subject construction type using same logic as scoring
      let subConstructionType = (subjectTags?.construction_type as string) || "unknown";
      if (subConstructionType === "unknown") {
        // Try to infer from MLS data
        const subType = ((subject.property_sub_type || "") as string).toLowerCase();
        if (subType.includes("manufactured") || subType.includes("mobile")) subConstructionType = "manufactured";
        else if (subType.includes("modular")) subConstructionType = "modular";
        else {
          const raw = (subject.raw_data || {}) as Record<string, unknown>;
          const carConst = ((raw.CAR_ConstructionType || "") as string).toLowerCase();
          const bodyTypeArr = Array.isArray(raw.BodyType) ? raw.BodyType.join(" ") : ((raw.BodyType || "") as string);
          const bodyTypeLc = bodyTypeArr.toLowerCase();
          if (carConst.includes("manufactured") || carConst.includes("mobile") ||
              bodyTypeLc.includes("double wide") || bodyTypeLc.includes("single wide")) {
            subConstructionType = "manufactured";
          } else if (carConst.includes("modular")) {
            subConstructionType = "modular";
          }
        }
      }
      const subjectDesc = [
        `${subject.full_address || "Unknown"}, ${subject.city || ""}, ${subject.county_or_parish || ""}`,
        `Type: ${subject.property_type || ""} / ${subject.property_sub_type || ""}`,
        subConstructionType !== "unknown" ? `Construction: ${subConstructionType}` : "",
        subject.living_area ? `Sqft: ${subject.living_area}` : "",
        subject.lot_size_acres ? `Lot: ${subject.lot_size_acres} acres` : "",
        subject.bedrooms_total ? `Beds: ${subject.bedrooms_total}` : "",
        subject.bathrooms_total_integer ? `Baths: ${subject.bathrooms_total_integer}` : "",
        subject.year_built ? `Year Built: ${subject.year_built}` : "",
        subject.list_price ? `List Price: $${(subject.list_price as number).toLocaleString()}` : "",
      ].filter(Boolean).join(" | ");

      const compsDesc = top10.map((c, i) => {
        const l = c.listing;
        const f = c.features;
        return [
          `COMP ${i + 1} [${l.listing_key}]: ${l.full_address || "Unknown"}, ${l.city || ""}`,
          `  Sale: $${(l.close_price || 0).toLocaleString()} (${l.close_date || "?"})`,
          `  Score: ${(c.similarity.total * 100).toFixed(1)}% | Distance: ${c.distance ?? "?"}mi`,
          isLand ? `  Lot: ${l.lot_size_acres || "?"} acres` : `  Sqft: ${l.living_area || "?"} | Lot: ${l.lot_size_acres || "?"} acres`,
          isLand ? "" : `  Beds: ${l.bedrooms_total || "?"} | Baths: ${l.bathrooms_total_integer || "?"} | Year: ${l.year_built || "?"} | Garage: ${l.garage_spaces || 0}`,
          f ? `  Features: View ${f.view_quality || "?"}/5, Water ${f.water_quality || "?"}/5, Land ${f.land_usability || "?"}/5${f.construction_type && f.construction_type !== "unknown" ? ` | Construction: ${f.construction_type}` : ""}` : "",
          l.public_remarks ? `  Remarks: ${(l.public_remarks as string).substring(0, 150)}...` : "",
        ].filter(Boolean).join("\n");
      }).join("\n\n");

      const selectionPrompt = `You are an expert WNC real estate appraiser selecting comparable properties for a CMA.

SUBJECT: ${subjectDesc}
${isLand ? "\nThis is a LAND CMA. Focus on lot size, usability, access, views, water, and restrictions. Ignore sqft/beds/baths." : ""}

TOP 10 SCORED CANDIDATES:
${compsDesc}

Select the best ${targetCount} comps for this CMA. Consider:
- Property similarity (type, size, age, features)
- Geographic relevance (same neighborhood/area preferred)
- Recency of sale
- ${isLand ? "Land characteristics match (usability, access, views, water)" : "Similar structure and lot"}
- Avoid comps with very different property subtypes (e.g., condo vs single family)
- CRITICAL: Construction type matching (follow this priority order):
  * Pre-1976 "mobile homes" are UNFINANCEABLE and a separate market. NEVER use as comps for site-built, manufactured, or modular homes. NEVER use site-built as comps for pre-1976 mobile homes.
  * Modular homes follow the SAME building codes as site-built. These are interchangeable as comps with only a mild note needed.
  * For manufactured homes (post-1976 HUD code) as the SUBJECT:
    1. BEST: Select other manufactured home sales. Fill as many comp slots as possible with manufactured homes.
    2. FALLBACK: If fewer than ${targetCount} manufactured comps are available in the top 10, you MAY use site-built comps to fill remaining slots. When doing so, note in your reasoning that the comp is site-built and the value estimate should be adjusted downward to account for the construction type difference.
    3. Never leave comp slots empty just because no manufactured comps exist. A site-built comp with a noted adjustment is better than no comp.
  * For log homes/cabins as the SUBJECT:
    1. SIZE and PRICE similarity come FIRST. A site-built home close in square footage and sale price is a BETTER comp than a log home that is much larger or pricier. Never select a comp that needs huge size adjustments (e.g. living area >25% different) just because it is log.
    2. Among comps of SIMILAR size and price, prefer log-to-log (log buyers seek log construction). Fill remaining slots with similar site-built comps; the grid applies a small structure-based construction adjustment.
    3. NEVER use manufactured or mobile home comps for a log home subject.
  * For site-built homes as the SUBJECT: strongly prefer site-built or modular comps. Only use manufactured comps as a last resort, and note the value should be adjusted upward.
  * This is the most common CMA error in WNC where manufactured/mobile homes are prevalent.
- Prefer comps that bracket the subject's likely value (some above, some below)
- NEVER select a comp whose sale price is wildly different from the group. If most comps are $400K-$900K and one is $2M+, the expensive comp is from a different market segment (luxury community, different property class) and must be excluded. Same applies to comps far below the group.
- The comp set must be internally consistent in price range BEFORE adjustments.${excludedOutliers.length > 0 ? `\n\nNOTE: ${excludedOutliers.length} price outlier(s) were already removed from the candidate pool: ${excludedOutliers.map(o => `$${o.price.toLocaleString()} (${o.listing_key})`).join(", ")}` : ""}

Return JSON:
{
  "selected": ["listing_key_1", "listing_key_2", ...],
  "reasoning": {
    "listing_key_1": "Why selected (1-2 sentences)",
    "listing_key_2": "Why selected"
  },
  "excluded": {
    "listing_key_x": "Why excluded (1 sentence)"
  }
}`;

      try {
        const aiResp = await fetch("https://api.anthropic.com/v1/messages", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-api-key": ANTHROPIC_API_KEY,
            "anthropic-version": "2023-06-01",
          },
          body: JSON.stringify({
            model: AI_MODEL,
            max_tokens: 1500,
            messages: [{ role: "user", content: selectionPrompt }],
          }),
        });

        if (!aiResp.ok) {
          console.error(`Claude API error: ${aiResp.status}`);
          // Fallback: return top N by score
          return jsonResp({
            ok: true,
            subject: { listing: subject, features: subjectTags },
            selected: top10.slice(0, targetCount),
            ai_reasoning: "AI selection unavailable, returning top scored comps.",
            total_candidates: filteredComps.length,
          });
        }

        const aiData = await aiResp.json();
        const aiText = aiData?.content?.[0]?.text || "";
        const jsonMatch = aiText.match(/\{[\s\S]*\}/);

        if (!jsonMatch) {
          return jsonResp({
            ok: true,
            subject: { listing: subject, features: subjectTags },
            selected: top10.slice(0, targetCount),
            ai_reasoning: "Could not parse AI selection, returning top scored comps.",
            total_candidates: filteredComps.length,
          });
        }

        const aiSelection = JSON.parse(jsonMatch[0]);
        const selectedKeys = new Set(aiSelection.selected || []);

        // Reorder scored comps to put selected ones first
        const selectedComps = top10.filter(c => selectedKeys.has(c.listing.listing_key));
        const remainingComps = top10.filter(c => !selectedKeys.has(c.listing.listing_key));

        return jsonResp({
          ok: true,
          subject: { listing: subject, features: subjectTags },
          selected: selectedComps,
          remaining: remainingComps,
          excluded_outliers: excludedOutliers.length > 0 ? excludedOutliers : undefined,
          ai_selection: aiSelection,
          total_candidates: filteredComps.length,
          log_comp_count: isLogSubject ? logCompCount : undefined,
          construction_fallback: isLogSubject ? constructionFallback : undefined,
        });
      } catch (e) {
        console.error("AI comp selection error:", e);
        return jsonResp({
          ok: true,
          subject: { listing: subject, features: subjectTags },
          selected: top10.slice(0, targetCount),
          excluded_outliers: excludedOutliers.length > 0 ? excludedOutliers : undefined,
          ai_reasoning: "AI selection error, returning top scored comps.",
          total_candidates: filteredComps.length,
        });
      }
    }

    // ═══ ACTION: calculate-adjustments ═══
    if (action === "calculate-adjustments") {
      const subjectData = body.subject as {
        listing: ListingData;
        features: FeatureTags | null;
      };
      const compsData = body.comps as Array<{
        listing: ListingData;
        features: FeatureTags | null;
      }>;
      const sliderStates = body.slider_states || {};

      // Time-travel/backtest support: value the subject as if today were as_of_date.
      // Defaults to Date.now() so the time adjustment is identical to live behavior
      // when as_of_date is absent.
      const asOfMs = typeof body.as_of_date === "string"
        ? new Date(body.as_of_date + "T00:00:00").getTime()
        : Date.now();

      if (!subjectData || !compsData) {
        return jsonResp(
          { error: "subject and comps required" },
          400
        );
      }

      const isLandSubject = String(subjectData.listing.property_type || "").toLowerCase() === "land";
      const county = subjectData.listing.county_or_parish || "";

      // Look up paired sales data for this area (F10 partial): require >= 5 high-
      // confidence pairs per category, shrink the derived median toward the WNC
      // default (rate = (n*median + 5*default)/(n+5)), and ignore any category
      // whose median is negative (sign-inconsistent = garbage). Also fixes the
      // category -> rate-key mapping: feature_category is "view_quality" etc., but
      // the rate keys are "view_per_point" etc., so the old cat+"_per_point" join
      // produced keys that matched nothing and silently disabled paired sales.
      const CATEGORY_RATE_KEY: Record<string, string> = {
        view_quality: "view_per_point",
        water_quality: "water_per_point",
        land_usability: "land_per_point",
        road_noise: "road_noise_per_point",
        privacy_rating: "privacy_per_point",
        condition_rating: "condition_per_point",
      };
      const { data: pairedSales } = await sb
        .from("cma_paired_sales")
        .select("feature_category, derived_adjustment, confidence")
        .eq("county", county)
        .eq("confidence", "high");

      const pairedRates: Record<string, number> = {};
      if (pairedSales && pairedSales.length > 0) {
        const defaults = isLandSubject ? WNC_LAND_DEFAULTS : WNC_DEFAULTS;
        const byCategory = new Map<string, number[]>();
        for (const ps of pairedSales) {
          const cat = ps.feature_category as string;
          if (!byCategory.has(cat)) byCategory.set(cat, []);
          byCategory.get(cat)!.push(ps.derived_adjustment as number);
        }
        for (const [cat, values] of byCategory) {
          const rateKey = CATEGORY_RATE_KEY[cat];
          if (!rateKey) continue;
          const def = (defaults as Record<string, number>)[rateKey];
          if (typeof def !== "number") continue;
          const n = values.length;
          if (n < 5) continue; // too few pairs to trust
          values.sort((a, b) => a - b);
          const median = values[Math.floor(values.length / 2)];
          if (median < 0) continue; // sign-inconsistent -> keep the default
          pairedRates[rateKey] = Math.round((n * median + 5 * def) / (n + 5));
        }
      }

      // Request-scoped caches (F2/F7): the market index and land list-to-sale
      // ratio are per-county; comps are usually the subject's county, so this is
      // 1-2 DB queries per request. Keyed by county (+isLand for the index).
      const indexCache = new Map<string, MarketIndex>();
      const ratioCache = new Map<string, number>();
      async function getIndex(cty: string): Promise<MarketIndex> {
        const key = cty + "|" + isLandSubject;
        if (!indexCache.has(key)) {
          indexCache.set(key, await computeMarketIndex(sb, cty, isLandSubject, asOfMs));
        }
        return indexCache.get(key)!;
      }
      async function getRatio(cty: string): Promise<number> {
        if (!ratioCache.has(cty)) {
          ratioCache.set(cty, await computeLandListToSaleRatio(sb, cty, asOfMs));
        }
        return ratioCache.get(cty)!;
      }

      // Calculate adjustments for each comp (sequential because time factor /
      // ratio lookups are async and cached).
      const results: AdjustmentResult[] = [];
      for (let i = 0; i < compsData.length; i++) {
        const comp = compsData[i];
        const compSliders = sliderStates[comp.listing.listing_key] || {};
        const compCounty = comp.listing.county_or_parish || county;
        const idx = await getIndex(compCounty);
        const compCloseMs = comp.listing.close_date
          ? new Date(comp.listing.close_date + "T00:00:00").getTime()
          : null;
        const timeFactor = compCloseMs != null ? idx.factor(compCloseMs) : null;
        const listToSaleRatio = isLandSubject ? await getRatio(compCounty) : null;
        results.push(calculateCompAdjustments(
          subjectData.listing,
          comp.listing,
          subjectData.features,
          comp.features,
          i,
          Object.keys(pairedRates).length > 0 ? pairedRates : null,
          compSliders,
          asOfMs,
          timeFactor,
          listToSaleRatio
        ));
      }

      // ── Valuation weighted mean ──
      // Build the INCLUDED set: positive adjusted price, gross adjustments <= 35%
      // (F11c), and not a stale active listing (F7). Excluded comps stay in the
      // returned `results` (visible with warnings) but don't inform the number.
      const included: Array<{ price: number; grossPct: number; isClosed: boolean; completeness: number }> = [];
      for (const r of results) {
        if (!(r.adjusted_price > 0)) continue;
        if ((r.gross_adjustment_pct || 0) > 35) {
          r.warnings.push(`Excluded from the valuation average: gross adjustments (${r.gross_adjustment_pct}%) exceed 35%. Shown for reference only.`);
          continue;
        }
        if (r.is_stale_active) continue; // > 365-day active listing (already warned)
        included.push({
          price: r.adjusted_price,
          grossPct: r.gross_adjustment_pct || 0,
          isClosed: r.is_closed !== false,
          completeness: typeof r.completeness === "number" ? r.completeness : 0,
        });
      }

      let suggestedLow = 0;
      let suggestedHigh = 0;
      let suggestedPrice = 0;

      if (included.length > 0) {
        const sorted = included.slice().sort((a, b) => a.price - b.price);
        // Range: trim extremes if 4+ (same as before) — computed from the SAME
        // included set so range and point value stay consistent.
        const rangeSet = sorted.length >= 4 ? sorted.slice(1, -1) : sorted;
        suggestedLow = rangeSet[0].price;
        suggestedHigh = rangeSet[rangeSet.length - 1].price;

        // Weight = (1/(1+gross/100))^2  [squared penalty, F11c]
        //   x 2 for sold comps vs non-closed  [F7]
        //   x (0.5 + 0.5*completeness)  [thinly-tagged comps down-weighted, F9]
        // Only comps inside the trimmed range contribute to the point value.
        let totalWeight = 0;
        let weightedSum = 0;
        for (const item of included) {
          if (item.price < suggestedLow || item.price > suggestedHigh) continue;
          const base = 1 / (1 + item.grossPct / 100);
          let w = base * base;
          w *= item.isClosed ? 2 : 1;
          w *= 0.5 + 0.5 * item.completeness;
          totalWeight += w;
          weightedSum += item.price * w;
        }
        suggestedPrice = totalWeight > 0
          ? Math.round(weightedSum / totalWeight)
          : Math.round(rangeSet.reduce((s, v) => s + v.price, 0) / rangeSet.length);
      }

      const validPrices = results.map((r) => r.adjusted_price).filter((p) => p > 0).sort((a, b) => a - b);

      return jsonResp({
        ok: true,
        adjustments: results,
        valuation: {
          suggested_low: suggestedLow,
          suggested_high: suggestedHigh,
          suggested_price: suggestedPrice,
          adjusted_prices: validPrices,
        },
        paired_sales_used: Object.keys(pairedRates).length > 0,
      });
    }

    // ═══ ACTION: ai-advise ═══
    if (action === "ai-advise") {
      const subjectData = body.subject as {
        listing: ListingData;
        features: FeatureTags | null;
      };
      const compsData = body.comps as Array<{
        listing: ListingData;
        features: FeatureTags | null;
        adjustments: AdjustmentResult;
      }>;
      const valuationData = body.valuation as {
        suggested_low?: number;
        suggested_high?: number;
        suggested_price?: number;
      } | null;

      if (!subjectData || !compsData) {
        return jsonResp(
          { error: "subject and comps with adjustments required" },
          400
        );
      }

      const advice = await getAIAdvice(
        subjectData.listing,
        subjectData.features,
        compsData,
        valuationData || undefined
      );

      return jsonResp({
        ok: true,
        considerations: advice.considerations,
        summary: advice.summary,
        comp_reasoning: advice.comp_reasoning,
      });
    }

    // ═══ ACTION: save-report ═══
    if (action === "save-report") {
      const report = body.report;
      if (!report) {
        return jsonResp({ error: "report data required" }, 400);
      }

      const reportRecord = {
        id: report.id || undefined,
        agent_id: null,
        subject_listing_key: report.subject_listing_key || null,
        subject_address: report.subject_address || "",
        subject_city: report.subject_city || "",
        subject_county: report.subject_county || "",
        subject_data: report.subject_data || {},
        subject_features: report.subject_features || {},
        report_name: report.report_name || "",
        report_date: report.report_date || new Date().toISOString().split("T")[0],
        purpose: report.purpose || "listing",
        status: report.status || "draft",
        suggested_low: report.suggested_low || null,
        suggested_high: report.suggested_high || null,
        suggested_price: report.suggested_price || null,
        agent_recommended_price: report.agent_recommended_price || null,
        agent_notes: report.agent_notes || "",
        ai_summary: report.ai_summary || "",
        ai_considerations: report.ai_considerations || [],
        updated_at: new Date().toISOString(),
      };

      // Upsert report
      const { data: savedReport, error: saveErr } = await sb
        .from("cma_reports")
        .upsert(reportRecord)
        .select()
        .single();

      if (saveErr) {
        return jsonResp(
          { error: "Failed to save report", detail: saveErr.message },
          500
        );
      }

      // Save adjustments if provided
      if (report.adjustments && Array.isArray(report.adjustments)) {
        // Delete existing adjustments for this report
        await sb
          .from("cma_adjustments")
          .delete()
          .eq("report_id", savedReport.id);

        // Insert new adjustments
        const adjRecords = report.adjustments.map(
          (adj: Record<string, unknown>) => ({
            report_id: savedReport.id,
            comp_listing_key: adj.comp_listing_key || "",
            comp_order: adj.comp_order || 0,
            comp_data: adj.comp_data || {},
            comp_features: adj.comp_features || {},
            adj_living_area: adj.adj_living_area || 0,
            adj_lot_size: adj.adj_lot_size || 0,
            adj_restrictions: adj.adj_restrictions || 0,
            adj_bedrooms: adj.adj_bedrooms || 0,
            adj_bathrooms: adj.adj_bathrooms || 0,
            adj_garage: adj.adj_garage || 0,
            adj_year_built: adj.adj_year_built || 0,
            adj_condition: adj.adj_condition || 0,
            adj_view: adj.adj_view || 0,
            adj_water_features: adj.adj_water_features || 0,
            adj_land_character: adj.adj_land_character || 0,
            adj_road_noise: adj.adj_road_noise || 0,
            adj_privacy: adj.adj_privacy || 0,
            adj_elevation: adj.adj_elevation || 0,
            adj_pool: adj.adj_pool || 0,
            adj_basement: adj.adj_basement || 0,
            adj_fireplace: adj.adj_fireplace || 0,
            adj_covered_outdoor: adj.adj_covered_outdoor || 0,
            adj_outbuildings: adj.adj_outbuildings || 0,
            adj_special_features: adj.adj_special_features || 0,
            adj_time: adj.adj_time || 0,
            adj_concessions: adj.adj_concessions || 0,
            total_adjustment: adj.total_adjustment || 0,
            adjusted_price: adj.adjusted_price || 0,
            gross_adjustment_pct: adj.gross_adjustment_pct || 0,
            net_adjustment_pct: adj.net_adjustment_pct || 0,
            slider_states: adj.slider_states || {},
            ai_suggested_adjustments: adj.ai_suggested_adjustments || {},
            ai_reasoning: adj.ai_reasoning || {},
            overrides: adj.overrides || {},
          })
        );

        const { error: adjErr } = await sb
          .from("cma_adjustments")
          .insert(adjRecords);

        if (adjErr) {
          console.error("Adjustment save error:", adjErr);
          // Report was saved, adjustments failed
          return jsonResp({
            ok: true,
            report: savedReport,
            adjustment_error: adjErr.message,
          });
        }
      }

      return jsonResp({ ok: true, report: savedReport });
    }

    // ═══ ACTION: get-report ═══
    if (action === "get-report") {
      const reportId = body.report_id;
      if (!reportId) {
        return jsonResp({ error: "report_id required" }, 400);
      }

      const { data: report, error: getErr } = await sb
        .from("cma_reports")
        .select("*")
        .eq("id", reportId)
        .maybeSingle();

      if (getErr || !report) {
        return jsonResp(
          { error: "Report not found", detail: getErr?.message },
          404
        );
      }

      // Fetch adjustments
      const { data: adjustments } = await sb
        .from("cma_adjustments")
        .select("*")
        .eq("report_id", reportId)
        .order("comp_order", { ascending: true });

      return jsonResp({
        ok: true,
        report,
        adjustments: adjustments || [],
      });
    }

    // ═══ ACTION: list-reports ═══
    if (action === "list-reports") {
      const status = body.status || null;
      let query = sb
        .from("cma_reports")
        .select(
          "id, subject_address, subject_city, subject_county, report_name, report_date, status, suggested_price, agent_recommended_price, created_at, updated_at"
        )
        .is("agent_id", null)
        .order("updated_at", { ascending: false });

      if (status) {
        query = query.eq("status", status);
      }

      const { data: reports, error: listErr } = await query;
      if (listErr) {
        return jsonResp(
          { error: "Failed to list reports", detail: listErr.message },
          500
        );
      }

      return jsonResp({ ok: true, reports: reports || [] });
    }

    // ═══ ACTION: delete-report ═══
    if (action === "delete-report") {
      const reportId = body.report_id;
      if (!reportId) {
        return jsonResp({ error: "report_id required" }, 400);
      }

      // Adjustments cascade-delete due to FK constraint
      const { error: delErr } = await sb
        .from("cma_reports")
        .delete()
        .eq("id", reportId);

      if (delErr) {
        return jsonResp(
          { error: "Failed to delete report", detail: delErr.message },
          500
        );
      }

      return jsonResp({ ok: true, deleted: reportId });
    }

    // ═══ ACTION: generate-paired-sales ═══
    if (action === "generate-paired-sales") {
      const county = body.county || null;
      const limit = Math.min(body.limit || 50, 200);

      const result = await generatePairedSales(sb, county, limit);
      return jsonResp({ ok: true, ...result });
    }

    // ═══ ACTION: property-lookup ═══
    // Query county tax/GIS records to pre-fill property data
    if (action === "property-lookup") {
      const address = body.address || "";
      const pin = (body.pin || "").trim();
      const county = (body.county || "").toLowerCase();
      // Tolerate PINs typed without dashes/spaces — NC standard parcel IDs are NNNN-NN-NNNN,
      // and the GIS PIN field is exact-match, so "7569724345" must become "7569-72-4345".
      const pinDigits = pin.replace(/\D/g, "");
      const normPin = /^\d{10}$/.test(pinDigits)
        ? `${pinDigits.slice(0, 4)}-${pinDigits.slice(4, 6)}-${pinDigits.slice(6)}`
        : pin;

      if (!pin && (!address || address.length < 3)) {
        return jsonResp({ error: "Address (min 3 chars) or PIN required" }, 400);
      }

      // Also search MLS for any previous listing at this address. Skipped for a
      // PIN-only lookup (no address to match -> the ilike would match everything).
      let mlsMatches: Record<string, unknown>[] = [];
      if (!pin && address) {
        const { data } = await sb
          .from("mls_listings")
          .select("listing_key, full_address, city, county_or_parish, property_type, property_sub_type, living_area, lot_size_acres, bedrooms_total, bathrooms_total_integer, year_built, garage_spaces, close_price, close_date, list_price, standard_status, latitude, longitude, stories, public_remarks")
          .ilike("full_address", `%${address}%`)
          .order("modification_timestamp", { ascending: false })
          .limit(5);
        mlsMatches = (data as Record<string, unknown>[]) || [];
      }

      // County GIS lookup
      let countyData: Record<string, unknown> | null = null;
      let countySource = "";

      try {
        if (county === "jackson" || county.includes("jackson")) {
          // Jackson County: Two-step - parcels then building details
          const where = pin ? `PIN='${normPin}'` : `PropAddr LIKE '%${address.toUpperCase()}%'`;
          const parcelUrl = `https://gis.jacksonnc.org/jcgis/rest/services/Tax_Admin/Parcels/MapServer/0/query?where=${encodeURIComponent(where)}&outFields=PIN,PropAddr,AssessedAcres,TotBldgValue,TotLandValue,TaxableValue,SalePrice,SaleDate,CurrentOwner1&f=json&resultRecordCount=5`;
          const pRes = await fetch(parcelUrl);
          const pData = await pRes.json();

          if (pData.features && pData.features.length > 0) {
            const parcel = pData.features[0].attributes;
            countyData = {
              full_address: parcel.PropAddr || address,
              county_or_parish: "Jackson",
              lot_size_acres: parseFloat(parcel.AssessedAcres) || null,
              assessed_value: parcel.TaxableValue || null,
              land_value: parcel.TotLandValue || null,
              building_value: parcel.TotBldgValue || null,
              last_sale_price: parcel.SalePrice || null,
              owner: parcel.CurrentOwner1 || null,
              pin: parcel.PIN || null,
            };
            countySource = "Jackson County GIS";

            // Get building details (beds, baths, sqft, year built)
            if (parcel.PIN) {
              const bldgUrl = `https://gis.jacksonnc.org/jcgis/rest/services/Tax_Admin/Appraisal/MapServer/1/query?where=PIN='${parcel.PIN}'&outFields=SqFt,NbrBdrms,FullBath,HalfBath,NbrStories,YrBuilt,YrRemodeled,Style,Grade,Cond,BsmtArea,BsmtFinishPct&f=json`;
              const bRes = await fetch(bldgUrl);
              const bData = await bRes.json();
              if (bData.features && bData.features.length > 0) {
                const bldg = bData.features[0].attributes;
                countyData.living_area = bldg.SqFt || null;
                countyData.bedrooms_total = bldg.NbrBdrms || null;
                countyData.bathrooms_total_integer = bldg.FullBath || null;
                countyData.half_baths = bldg.HalfBath || null;
                countyData.year_built = parseInt(bldg.YrBuilt) || null;
                countyData.year_remodeled = parseInt(bldg.YrRemodeled) || null;
                countyData.stories = parseInt(bldg.NbrStories) || null;
                countyData.style = bldg.Style || null;
                countyData.grade = bldg.Grade || null;
                countyData.condition = bldg.Cond || null;
                countyData.basement_area = bldg.BsmtArea || null;
                countyData.basement_finished_pct = bldg.BsmtFinishPct || null;
              }
            }
          }
        } else if (county === "haywood" || county.includes("haywood")) {
          // Haywood County: Single query with heated area + year built
          const where = pin ? `ALPHA='${pin}'` : `Prop_Addr LIKE '%${address.toUpperCase()}%'`;
          const url = `https://maps.haywoodcountync.gov/arcgis/rest/services/Land_Records/Open_Data/MapServer/3/query?where=${encodeURIComponent(where)}&outFields=ALPHA,Prop_Addr,Calc_Acres,Heated_Area,Yr_Built,Land_Value,Bldg_Value,Assd_Value,Sale_Price,Sale_Date,Owner_1,SubDivName&f=json&resultRecordCount=5`;
          const hRes = await fetch(url);
          const hData = await hRes.json();

          if (hData.features && hData.features.length > 0) {
            const parcel = hData.features[0].attributes;
            countyData = {
              full_address: parcel.Prop_Addr || address,
              county_or_parish: "Haywood",
              lot_size_acres: parcel.Calc_Acres || null,
              living_area: parcel.Heated_Area || null,
              year_built: parcel.Yr_Built || null,
              assessed_value: parcel.Assd_Value || null,
              land_value: parcel.Land_Value || null,
              building_value: parcel.Bldg_Value || null,
              last_sale_price: parcel.Sale_Price || null,
              owner: parcel.Owner_1 || null,
              pin: parcel.ALPHA || null,
            };
            countySource = "Haywood County GIS";
          }
        } else if (county === "swain" || county.includes("swain")) {
          // Swain County: Basic parcel data (no beds/baths/sqft)
          const where = pin ? `PIN='${normPin}'` : `ParcelAddr LIKE '%${address.toUpperCase()}%'`;
          const url = `https://maps.swaincountync.gov/server/rest/services/ParcelsForDownload/FeatureServer/0/query?where=${encodeURIComponent(where)}&outFields=PIN,ParcelAddr,DEED_ACRE,TotalAssessedValue,ParcelBuildingValue,ParcelLandValue,Name1&f=json&resultRecordCount=5`;
          const sRes = await fetch(url);
          const sData = await sRes.json();

          if (sData.features && sData.features.length > 0) {
            const parcel = sData.features[0].attributes;
            countyData = {
              full_address: parcel.ParcelAddr || address,
              county_or_parish: "Swain",
              lot_size_acres: parseFloat(parcel.DEED_ACRE) || null,
              assessed_value: parseFloat(parcel.TotalAssessedValue) || null,
              land_value: parseFloat(parcel.ParcelLandValue) || null,
              building_value: parseFloat(parcel.ParcelBuildingValue) || null,
              owner: parcel.Name1 || null,
              pin: parcel.PIN || null,
            };
            countySource = "Swain County GIS";
          }
        } else {
          // Fallback: NC OneMap statewide parcels (basic data for any county)
          const countyName = county.charAt(0).toUpperCase() + county.slice(1);
          const where = (pin ? `parno='${normPin}'` : `siteadd LIKE '%${address.toUpperCase()}%'`) + (countyName ? ` AND cntyname='${countyName}'` : "");
          const url = `https://services.nconemap.gov/secure/rest/services/NC1Map_Parcels/FeatureServer/1/query?where=${encodeURIComponent(where)}&outFields=parno,siteadd,ownname,gisacres,parval,landval,improvval,structyear,parusedesc,cntyname&f=json&resultRecordCount=5`;
          const nRes = await fetch(url);
          const nData = await nRes.json();

          if (nData.features && nData.features.length > 0) {
            const parcel = nData.features[0].attributes;
            countyData = {
              full_address: parcel.siteadd || address,
              county_or_parish: parcel.cntyname || county,
              lot_size_acres: parcel.gisacres || null,
              assessed_value: parcel.parval || null,
              land_value: parcel.landval || null,
              building_value: parcel.improvval || null,
              year_built: parcel.structyear || null,
              owner: parcel.ownname || null,
              pin: parcel.parno || null,
              land_use: parcel.parusedesc || null,
            };
            countySource = "NC OneMap";
          }
        }
      } catch (e) {
        console.error("County GIS lookup error:", e);
        // Non-fatal: continue with MLS results
      }

      return jsonResp({
        ok: true,
        mls_matches: mlsMatches || [],
        county_record: countyData,
        county_source: countySource,
      });
    }

    return jsonResp({ error: `Unknown action: ${action}` }, 400);
  } catch (error) {
    console.error("Unhandled error:", error);
    return jsonResp(
      { error: "Internal server error", detail: (error as Error).message },
      500
    );
  }
});
