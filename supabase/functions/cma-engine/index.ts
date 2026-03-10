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

// Score how similar a comp is to the subject (0-1, higher = more similar)
function scoreComp(
  subject: ListingData,
  comp: ListingData,
  subjectFeatures: FeatureTags | null,
  compFeatures: FeatureTags | null
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
    const isFactory = (t: string) => ["manufactured", "modular", "mobile_home"].includes(t);
    const isMobileHome = (t: string) => t === "mobile_home";
    const isModular = (t: string) => t === "modular";

    // Resolve construction type with fallback inference from MLS data
    const resolveConstruction = (features: Record<string, unknown> | null, listing: Record<string, unknown>): string => {
      // Check feature tags first
      const tagged = (features?.construction_type as string) || "unknown";
      if (tagged !== "unknown") return tagged;
      // Infer from property_sub_type (MLS explicitly flags manufactured/modular)
      const subType = ((listing.property_sub_type || "") as string).toLowerCase();
      if (subType.includes("manufactured") || subType.includes("mobile")) return "manufactured";
      if (subType.includes("modular")) return "modular";
      // Infer from raw_data if available
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
      if (carConst.includes("log") || bodyType.includes("log")) return "log";
      // Default: if subject has known type and we can't determine comp, assume site_built
      // Rationale: MLS data explicitly flags manufactured/modular; absence implies site-built
      return "site_built";
    };

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
      } else if (isModular(subConstruction) && !isFactory(compConstruction) ||
                 isModular(compConstruction) && !isFactory(subConstruction)) {
        // Modular vs site-built: mild penalty (same building codes, same financing)
        scores.type_match *= 0.7;
      } else if (isMobileHome(subConstruction) || isMobileHome(compConstruction)) {
        // Pre-1976 mobile home involved: severe penalty (unfinanceable, different market)
        scores.type_match *= 0.15;
      } else if (isFactory(subConstruction) !== isFactory(compConstruction)) {
        // Post-1976 manufactured vs site-built: moderate penalty
        scores.type_match *= 0.3;
      } else if (isFactory(subConstruction) && isFactory(compConstruction)) {
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
      (Date.now() - new Date(comp.close_date + "T00:00:00").getTime()) /
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
    (subject.bathrooms_total_integer || 0) -
      (comp.bathrooms_total_integer || 0)
  );
  scores.bedbath_match = Math.max(0, 1 - (bedDiff + bathDiff) / 6);

  // Weighted total (land CMAs weight lot size and features higher, sqft/beds don't apply)
  const isLand = (subject.property_type || "").toLowerCase() === "land";
  const weights = isLand
    ? {
        proximity: 0.25,
        type_match: 0.10,
        sqft_sim: 0.0, // N/A for land
        lot_sim: 0.25, // Primary driver for land
        feature_sim: 0.25, // Views, water, usability matter most
        recency: 0.10,
        bedbath_match: 0.0, // N/A for land
      }
    : {
        proximity: 0.25,
        type_match: 0.15,
        sqft_sim: 0.2,
        lot_sim: 0.1,
        feature_sim: 0.15,
        recency: 0.1,
        bedbath_match: 0.05,
      };

  let total = 0;
  for (const [k, w] of Object.entries(weights)) {
    total += (scores[k] || 0) * w;
  }

  return { total, breakdown: scores };
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
  view_per_point: 15000,
  water_per_point: 12000,
  land_per_point: 8000,
  road_noise_per_point: 7000,
  privacy_per_point: 6000,
  elevation_per_100ft: 2000,

  // Lot size
  per_acre: 15000,

  // Market
  monthly_appreciation_pct: 0.3, // 0.3% per month (approx 3.6% annually)
};

// Land CMA uses different weights: lot/views/water/access matter more, structure doesn't apply
const WNC_LAND_DEFAULTS = {
  // Primary land value drivers
  per_acre: 20000, // Higher weight for land CMAs (primary value driver)

  // Mountain adjustments per rating point (land values views/water more)
  view_per_point: 20000, // Views matter MORE for land (buyer choosing build site)
  water_per_point: 15000, // Creek frontage especially valuable
  land_per_point: 12000, // Most critical: steep = unbuildable = huge discount
  road_noise_per_point: 10000, // Road access quality matters more for raw land
  privacy_per_point: 8000,
  elevation_per_100ft: 2000,

  // Structure-related: N/A for land
  price_per_sqft: 0,
  per_bedroom: 0,
  per_bathroom: 0,
  per_garage_space: 0,
  per_year_age: 0,

  // Market
  monthly_appreciation_pct: 0.3,
};

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
}

function calculateCompAdjustments(
  subject: ListingData,
  comp: ListingData,
  subjectFeatures: FeatureTags | null,
  compFeatures: FeatureTags | null,
  compOrder: number,
  pairedSalesData: Record<string, number> | null,
  sliderOverrides?: Record<string, number>
): AdjustmentResult {
  const adjustments: Record<string, number> = {};
  const warnings: string[] = [];
  const salePrice = comp.close_price || comp.list_price || 0;

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
  }

  // Lot size
  const subLot = subject.lot_size_acres || 0;
  const compLot = comp.lot_size_acres || 0;
  if (subLot > 0 && compLot > 0) {
    adjustments.adj_lot_size = Math.round(
      (subLot - compLot) * rates.per_acre
    );
  }

  // Bedrooms
  const subBeds = subject.bedrooms_total || 0;
  const compBeds = comp.bedrooms_total || 0;
  if (subBeds > 0 && compBeds > 0) {
    adjustments.adj_bedrooms = (subBeds - compBeds) * rates.per_bedroom;
  }

  // Bathrooms
  const subBaths = subject.bathrooms_total_integer || 0;
  const compBaths = comp.bathrooms_total_integer || 0;
  if (subBaths > 0 && compBaths > 0) {
    adjustments.adj_bathrooms = (subBaths - compBaths) * rates.per_bathroom;
  }

  // Garage
  const subGarage = (subject.garage_spaces as number) || 0;
  const compGarage = (comp.garage_spaces as number) || 0;
  adjustments.adj_garage = (subGarage - compGarage) * rates.per_garage_space;

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
      // Condition adjustments are larger: roughly $20K per point
      adjustments.adj_condition = (subCond - compCond) * 20000;
    }
  }

  // ── Market Adjustments ──

  // Time adjustment (months since comp sold)
  if (comp.close_date) {
    const monthsSinceSale =
      (Date.now() - new Date(comp.close_date + "T00:00:00").getTime()) /
      (30 * 86400000);
    if (monthsSinceSale > 1) {
      adjustments.adj_time = Math.round(
        salePrice * (rates.monthly_appreciation_pct / 100) * monthsSinceSale
      );
    }
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
    totalAdj += val;
    grossAdj += Math.abs(val);
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
  }>
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
    subject.list_price ? `List Price: $${subject.list_price.toLocaleString()}` : "",
  ]
    .filter(Boolean)
    .join(" | ");

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

Return valid JSON with this structure:
{
  "considerations": [...],
  "summary": "...",
  "comp_reasoning": { "listing_key_1": "...", "listing_key_2": "..." }
}`;

  const userMessage = `SUBJECT PROPERTY:
${subjectDesc}

SUBJECT MOUNTAIN FEATURES:
${featureDesc}

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

      // ── Try MLS Grid (Canopy MLS) ──
      const mlsGridToken = Deno.env.get("MLS_GRID_TOKEN") || "";
      const mlsGridSystem = Deno.env.get("MLS_GRID_ORIGINATING_SYSTEM") || "";
      if (mlsGridToken && mlsGridSystem) {
        try {
          const mlsLocalPrefix = Deno.env.get("MLS_LOCAL_PREFIX") || "";
          const prefixedId = searchId && mlsLocalPrefix ? `${mlsLocalPrefix}${searchId}` : searchId;
          let filter = `OriginatingSystemName eq '${mlsGridSystem}'`;
          if (prefixedId) {
            filter += ` and ListingId eq '${prefixedId}'`;
          } else if (addrStreetName) {
            // Address-based search: match street number exactly + street name contains
            if (addrStreetNumber) {
              filter += ` and StreetNumber eq '${addrStreetNumber}'`;
            }
            filter += ` and contains(StreetName,'${addrStreetName.replace(/'/g, "''")}')`;
            if (addrCity) {
              filter += ` and City eq '${addrCity.replace(/'/g, "''")}'`;
            }
          }
          // Order by most recent close date so we get the latest listing first
          const orderBy = searchAddress ? "&$orderby=CloseDate desc,ModificationTimestamp desc" : "";
          const url = `https://api.mlsgrid.com/v2/Property?$filter=${filter}&$expand=Media&$top=5${orderBy}`;
          const resp = await fetch(url, {
            headers: {
              Authorization: `Bearer ${mlsGridToken}`,
              Accept: "application/json",
            },
          });
          if (resp.ok) {
            const data = await resp.json();
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
                full_address: fullAddr,
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
          } else {
            errors.push(`MLS Grid: ${resp.status}`);
          }
        } catch (err) {
          errors.push(`MLS Grid: ${err instanceof Error ? err.message : String(err)}`);
        }
      }

      // ── Try Navica (CSAR) ──
      const navicaToken = Deno.env.get("NAVICA_SERVER_TOKEN") || "";
      const navicaDataset = Deno.env.get("NAVICA_DATASET_ID") || "nav27";
      if (navicaToken) {
        try {
          let filter = "PropertyType ne 'Residential Lease'";
          if (searchId) {
            filter += ` and ListingId eq '${searchId}'`;
          } else if (addrStreetName) {
            // Address-based search for Navica
            if (addrStreetNumber) {
              filter += ` and StreetNumber eq '${addrStreetNumber}'`;
            }
            filter += ` and contains(StreetName,'${addrStreetName.replace(/'/g, "''")}')`;
            if (addrCity) {
              filter += ` and City eq '${addrCity.replace(/'/g, "''")}'`;
            }
          }
          const navicaBase = `https://navapi.navicamls.net/api/v2/OData/${navicaDataset}`;
          const orderBy = searchAddress ? "&$orderby=CloseDate desc" : "";
          const url = `${navicaBase}/Property?$filter=${filter}&$top=5${orderBy}&access_token=${navicaToken}`;
          const resp = await fetch(url, {
            headers: { Accept: "application/json" },
          });
          if (resp.ok) {
            const data = await resp.json();
            const records = data.value || [];
            for (const r of records) {
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
                full_address: navFullAddr,
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

              await sb.from("mls_listings").upsert(listing, { onConflict: "listing_key" });

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
          } else {
            errors.push(`Navica: ${resp.status}`);
          }
        } catch (err) {
          errors.push(`Navica: ${err instanceof Error ? err.message : String(err)}`);
        }
      }

      return jsonResp({
        ok: true,
        results,
        found: results.length,
        errors: errors.length > 0 ? errors : undefined,
        message: results.length > 0
          ? `Found ${results.length} listing(s) from MLS API and saved to database`
          : searchId ? "No listings found matching that ID" : "No listings found matching that address",
      });
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

      // Build comp query
      const dateFloor =
        filters.min_close_date ||
        new Date(Date.now() - 365 * 86400000).toISOString().split("T")[0];
      const maxDistance = filters.max_distance_miles || 15;

      let compQuery = sb
        .from("mls_listings")
        .select(
          "listing_key, full_address, city, county_or_parish, property_type, property_sub_type, living_area, lot_size_acres, bedrooms_total, bathrooms_total_integer, year_built, garage_spaces, close_price, close_date, list_price, latitude, longitude, standard_status, stories, public_remarks"
        )
        .eq("standard_status", "Closed")
        .not("close_price", "is", null)
        .gte("close_date", dateFloor)
        .limit(100);

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

      // City filter - match specific city or exclude certain cities
      if (filters.city) {
        compQuery = compQuery.eq("city", filters.city);
      } else if (filters.exclude_cities && filters.exclude_cities.length > 0) {
        // Exclude luxury/non-comparable markets
        for (const ec of filters.exclude_cities) {
          compQuery = compQuery.neq("city", ec);
        }
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
          cFeatures
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

      return jsonResp({
        ok: true,
        subject: {
          listing: subject,
          features: subjectTags,
        },
        comps: scored.slice(0, topN),
        total_candidates: filteredComps.length,
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

      // Find comps (same logic as find-comps action)
      const dateFloor = filters.min_close_date ||
        new Date(Date.now() - 365 * 86400000).toISOString().split("T")[0];
      const maxDistance = filters.max_distance_miles || 15;

      let compQuery = sb
        .from("mls_listings")
        .select("listing_key, full_address, city, county_or_parish, property_type, property_sub_type, living_area, lot_size_acres, bedrooms_total, bathrooms_total_integer, year_built, garage_spaces, close_price, close_date, list_price, latitude, longitude, standard_status, stories, public_remarks")
        .eq("standard_status", "Closed")
        .not("close_price", "is", null)
        .gte("close_date", dateFloor)
        .limit(100);

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
        const score = scoreComp(subject as ListingData, c, subjectTags || null, cFeatures);
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
      const top10 = scored.slice(0, 10);

      if (top10.length <= targetCount) {
        // Not enough to be selective, return all
        return jsonResp({
          ok: true,
          subject: { listing: subject, features: subjectTags },
          selected: top10,
          ai_reasoning: "Not enough candidates to be selective. All available comps included.",
          total_candidates: filteredComps.length,
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
- CRITICAL: Construction type matters, with nuance:
  * Pre-1976 "mobile homes" are UNFINANCEABLE (no FHA/VA/USDA/conventional) and are essentially a separate market. Never use as comps for site-built or modern manufactured homes.
  * Post-1976 manufactured homes (HUD code) should be compared to other manufactured homes, not site-built. They appreciate similarly on owned land but are a different construction class.
  * Modular homes are built to the SAME building codes as site-built homes and can be reasonable comps for site-built properties (mild penalty, not a dealbreaker).
  * This is the most common CMA error in WNC where manufactured/mobile homes are prevalent.
- Prefer comps that bracket the subject's likely value (some above, some below)

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
          ai_selection: aiSelection,
          total_candidates: filteredComps.length,
        });
      } catch (e) {
        console.error("AI comp selection error:", e);
        return jsonResp({
          ok: true,
          subject: { listing: subject, features: subjectTags },
          selected: top10.slice(0, targetCount),
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

      if (!subjectData || !compsData) {
        return jsonResp(
          { error: "subject and comps required" },
          400
        );
      }

      // Look up paired sales data for this area
      const county = subjectData.listing.county_or_parish || "";
      const { data: pairedSales } = await sb
        .from("cma_paired_sales")
        .select("feature_category, derived_adjustment, confidence")
        .eq("county", county)
        .eq("confidence", "high");

      // Build rates from paired sales
      const pairedRates: Record<string, number> = {};
      if (pairedSales && pairedSales.length > 0) {
        const byCategory = new Map<string, number[]>();
        for (const ps of pairedSales) {
          const cat = ps.feature_category as string;
          if (!byCategory.has(cat)) byCategory.set(cat, []);
          byCategory.get(cat)!.push(ps.derived_adjustment as number);
        }
        // Use median of high-confidence paired sales
        for (const [cat, values] of byCategory) {
          values.sort((a, b) => a - b);
          const median = values[Math.floor(values.length / 2)];
          const rateKey = cat + "_per_point";
          pairedRates[rateKey] = Math.abs(median);
        }
      }

      // Calculate adjustments for each comp
      const results = compsData.map((comp, i) => {
        const compSliders = sliderStates[comp.listing.listing_key] || {};
        return calculateCompAdjustments(
          subjectData.listing,
          comp.listing,
          subjectData.features,
          comp.features,
          i,
          Object.keys(pairedRates).length > 0 ? pairedRates : null,
          compSliders
        );
      });

      // Calculate suggested price range from adjusted prices
      const adjustedPrices = results.map((r) => r.adjusted_price);
      const validPrices = adjustedPrices.filter((p) => p > 0);

      let suggestedLow = 0;
      let suggestedHigh = 0;
      let suggestedPrice = 0;

      if (validPrices.length > 0) {
        validPrices.sort((a, b) => a - b);
        // Trim extremes if we have 4+ comps
        const trimmed =
          validPrices.length >= 4
            ? validPrices.slice(1, -1)
            : validPrices;
        suggestedLow = trimmed[0];
        suggestedHigh = trimmed[trimmed.length - 1];
        suggestedPrice = Math.round(
          trimmed.reduce((s, v) => s + v, 0) / trimmed.length
        );
      }

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

      if (!subjectData || !compsData) {
        return jsonResp(
          { error: "subject and comps with adjustments required" },
          400
        );
      }

      const advice = await getAIAdvice(
        subjectData.listing,
        subjectData.features,
        compsData
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
      const county = (body.county || "").toLowerCase();

      if (!address || address.length < 3) {
        return jsonResp({ error: "Address required (min 3 chars)" }, 400);
      }

      // Also search MLS for any previous listing at this address
      const { data: mlsMatches } = await sb
        .from("mls_listings")
        .select("listing_key, full_address, city, county_or_parish, property_type, property_sub_type, living_area, lot_size_acres, bedrooms_total, bathrooms_total_integer, year_built, garage_spaces, close_price, close_date, list_price, standard_status, latitude, longitude, stories, public_remarks")
        .ilike("full_address", `%${address}%`)
        .order("modification_timestamp", { ascending: false })
        .limit(5);

      // County GIS lookup
      let countyData: Record<string, unknown> | null = null;
      let countySource = "";

      try {
        if (county === "jackson" || county.includes("jackson")) {
          // Jackson County: Two-step - parcels then building details
          const parcelUrl = `https://gis.jacksonnc.org/jcgis/rest/services/Tax_Admin/Parcels/MapServer/0/query?where=PropAddr+LIKE+'%25${encodeURIComponent(address.toUpperCase())}%25'&outFields=PIN,PropAddr,AssessedAcres,TotBldgValue,TotLandValue,TaxableValue,SalePrice,SaleDate,CurrentOwner1&f=json&resultRecordCount=5`;
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
          const url = `https://maps.haywoodcountync.gov/arcgis/rest/services/Land_Records/Open_Data/MapServer/3/query?where=Prop_Addr+LIKE+'%25${encodeURIComponent(address.toUpperCase())}%25'&outFields=ALPHA,Prop_Addr,Calc_Acres,Heated_Area,Yr_Built,Land_Value,Bldg_Value,Assd_Value,Sale_Price,Sale_Date,Owner_1,SubDivName&f=json&resultRecordCount=5`;
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
          const url = `https://maps.swaincountync.gov/server/rest/services/ParcelsForDownload/FeatureServer/0/query?where=ParcelAddr+LIKE+'%25${encodeURIComponent(address.toUpperCase())}%25'&outFields=PIN,ParcelAddr,DEED_ACRE,TotalAssessedValue,ParcelBuildingValue,ParcelLandValue,Name1&f=json&resultRecordCount=5`;
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
          const url = `https://services.nconemap.gov/secure/rest/services/NC1Map_Parcels/FeatureServer/1/query?where=siteadd+LIKE+'%25${encodeURIComponent(address.toUpperCase())}%25'${countyName ? `+AND+cntyname='${countyName}'` : ""}&outFields=parno,siteadd,ownname,gisacres,parval,landval,improvval,structyear,parusedesc,cntyname&f=json&resultRecordCount=5`;
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
