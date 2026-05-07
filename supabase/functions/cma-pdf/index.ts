// CMA PDF HTML Generator Edge Function
// Generates polished CMA report HTML from saved report data
// The HTML can be converted to PDF via Puppeteer locally or rendered in-browser
//
// Deploy: supabase functions deploy cma-pdf
// Invoke: POST /functions/v1/cma-pdf
//   { "action": "generate-html", "report_id": "..." }
//   { "action": "generate-html", "report_data": { subject, comps, valuation, ai_summary } }

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
const SUPABASE_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

// Agent info (could be moved to config)
const AGENT = {
  name: "Cory Coleman",
  title: "REALTOR\u00AE",
  company: "Keller Williams Great Smokies",
  phone: "(828) 506-6413",
  email: "coryhelpsyoumove@gmail.com",
  website: "coryhelpsyoumove.com",
  office: "96 W Sylva Shopping Area, Sylva, NC 28779",
};

function fmt(n: number | null | undefined): string {
  if (n == null) return "\u2014";
  return "$" + Math.round(n).toLocaleString("en-US");
}

function fmtNum(n: number | null | undefined): string {
  if (n == null) return "\u2014";
  return n.toLocaleString("en-US");
}

function adjClass(v: number): string {
  if (v > 0) return "adj-pos";
  if (v < 0) return "adj-neg";
  return "adj-zero";
}

function adjVal(v: number | null | undefined): string {
  if (v == null || v === 0) return "$0";
  const sign = v > 0 ? "+" : "";
  return sign + fmt(v);
}

interface CompData {
  listing: Record<string, unknown>;
  features: Record<string, unknown> | null;
  adjustments: Record<string, unknown>;
}

interface MarketStats {
  active_count: number;
  sold_6mo_count: number;
  sold_prior_6mo_count: number;
  median_sold_price: number;
  median_sold_price_prior: number;
  median_dom: number;
  avg_ppsf: number;
  months_of_inventory: number;
  county: string;
  property_type: string;
}

interface ReportInput {
  subject: {
    listing: Record<string, unknown>;
    features: Record<string, unknown> | null;
  };
  comps: CompData[];
  valuation: {
    suggested_low: number;
    suggested_high: number;
    suggested_price: number;
  };
  ai_summary?: string;
  ai_considerations?: Array<Record<string, string>>;
  comp_reasoning?: Record<string, string>;
  report_date?: string;
  methodology_note?: string;
  agent_recommended_price?: number;
  agent_notes?: string;
  market_stats?: MarketStats;
}

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function generateCMAHtml(data: ReportInput): string {
  const sub = data.subject.listing;
  const subFeats = data.subject.features || {};
  const comps = data.comps;
  const val = data.valuation;
  const reportDate = data.report_date || new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
  const isLand = (sub.property_type as string || "").toLowerCase() === "land";
  const numComps = comps.length;
  const colSpan = numComps + 2;

  // Build comp header cells
  const compHeaders = comps.map((c, i) => {
    const addr = (c.listing.full_address as string || "Unknown").replace(/,.*/, "");
    return `<th class="comp-col">Comp ${i + 1}<br><span style="font-size:0.45rem;font-weight:400;">${addr}</span></th>`;
  }).join("\n        ");

  function dataRow(label: string, subjectVal: string, compVals: string[]): string {
    const tds = compVals.map(v => `<td>${v}</td>`).join("");
    return `<tr><td>${label}</td><td class="subject-val">${subjectVal}</td>${tds}</tr>`;
  }

  function adjRow(label: string, adjKey: string): string {
    const tds = comps.map(c => {
      const v = (c.adjustments as Record<string, number>)[adjKey] || 0;
      return `<td class="${adjClass(v)}">${adjVal(v)}</td>`;
    }).join("");
    return `<tr><td style="padding-left:0.8rem;color:var(--text-secondary);font-size:0.55rem;">${label}</td><td class="subject-val"></td>${tds}</tr>`;
  }

  // Helper for feature rating display
  function ratingStr(val: unknown): string {
    if (val == null || val === 0 || val === "0") return "\u2014";
    return `${val}/5`;
  }

  // Build CMA grid rows
  let gridRows = "";

  // Sale Price row
  gridRows += `<tr class="price-row"><td>Sale Price</td><td class="subject-val">\u2014</td>${comps.map(c => `<td>${fmt(c.listing.close_price as number)}</td>`).join("")}</tr>\n`;

  if (!isLand) {
    // Property Characteristics section
    gridRows += `<tr class="section-row"><td colspan="${colSpan}">Property Characteristics</td></tr>\n`;
    gridRows += dataRow("Living Area (sqft)", fmtNum(sub.living_area as number), comps.map(c => fmtNum(c.listing.living_area as number)));
    gridRows += adjRow("Adj @ $175/sqft", "adj_living_area");
    gridRows += dataRow("Bedrooms", String(sub.bedrooms_total || "\u2014"), comps.map(c => String(c.listing.bedrooms_total || "\u2014")));
    gridRows += adjRow("Adj @ $12K/BR", "adj_bedrooms");
    gridRows += dataRow("Bathrooms", String(sub.bathrooms_total_integer || "\u2014"), comps.map(c => String(c.listing.bathrooms_total_integer || "\u2014")));
    gridRows += adjRow("Adj @ $10K/BA", "adj_bathrooms");
  }

  // Land & Site section
  gridRows += `<tr class="section-row"><td colspan="${colSpan}">Land &amp; Site</td></tr>\n`;
  gridRows += dataRow("Lot Size (acres)", String(sub.lot_size_acres || "\u2014"), comps.map(c => String(c.listing.lot_size_acres || "\u2014")));
  gridRows += adjRow("Lot Size Adj (tiered)", "adj_lot_size");

  // Restriction status
  const subRestrStr = subFeats.restriction_status === "unrestricted" ? "Unrestricted" : subFeats.restriction_status === "restricted" ? "Restricted" : "\u2014";
  gridRows += dataRow("Restrictions", subRestrStr, comps.map(c => {
    const rs = c.features?.restriction_status;
    return rs === "unrestricted" ? "Unrestricted" : rs === "restricted" ? "Restricted" : "\u2014";
  }));
  gridRows += adjRow("Restriction Adj", "adj_restrictions");

  if (!isLand) {
    // Age & Condition section
    gridRows += `<tr class="section-row"><td colspan="${colSpan}">Age &amp; Condition</td></tr>\n`;
    gridRows += dataRow("Year Built", String(sub.year_built || "\u2014"), comps.map(c => String(c.listing.year_built || "\u2014")));
    gridRows += adjRow("Adj @ $500/yr", "adj_year_built");
    gridRows += dataRow("Garage Spaces", String((sub.garage_spaces as number) || 0), comps.map(c => String((c.listing.garage_spaces as number) || 0)));
    gridRows += adjRow("Adj @ $15K/space", "adj_garage");
    gridRows += dataRow("Condition", `${subFeats.condition_rating || "?"}/5`, comps.map(c => `${c.features?.condition_rating || "?"}/5`));
    gridRows += adjRow("Adj @ $20K/pt", "adj_condition");
  }

  // Structural Features section
  if (!isLand) {
    gridRows += `<tr class="section-row"><td colspan="${colSpan}">Structural Features</td></tr>\n`;

    // Pool
    const subPoolStr = subFeats.has_pool ? (subFeats.pool_type as string || "Yes") : "None";
    gridRows += dataRow("Pool", subPoolStr, comps.map(c => c.features?.has_pool ? (c.features.pool_type as string || "Yes") : "None"));
    gridRows += adjRow("Pool Adj", "adj_pool");

    // Basement
    const subBasementStr = (subFeats.basement_type as string) && subFeats.basement_type !== "none" ? (subFeats.basement_type as string) : "None";
    gridRows += dataRow("Basement", subBasementStr, comps.map(c => {
      const bt = c.features?.basement_type as string;
      return bt && bt !== "none" ? bt : "None";
    }));
    gridRows += adjRow("Basement Adj", "adj_basement");

    // Fireplace
    const subFPStr = subFeats.has_fireplace ? `${subFeats.fireplace_count || 1}x ${subFeats.fireplace_type || ""}`.trim() : "None";
    gridRows += dataRow("Fireplace", subFPStr, comps.map(c => c.features?.has_fireplace ? `${c.features.fireplace_count || 1}x` : "None"));
    gridRows += adjRow("Fireplace Adj", "adj_fireplace");

    // Covered Outdoor
    gridRows += dataRow("Covered Outdoor", subFeats.covered_outdoor_sqft ? `${fmtNum(subFeats.covered_outdoor_sqft as number)} sqft` : "\u2014",
      comps.map(c => c.features?.covered_outdoor_sqft ? `${fmtNum(c.features.covered_outdoor_sqft as number)} sqft` : "\u2014"));
    gridRows += adjRow("Covered Outdoor Adj", "adj_covered_outdoor");

    // Outbuildings
    const subOutbldg = (subFeats.outbuildings as string[]) || [];
    gridRows += dataRow("Outbuildings", subOutbldg.length > 0 ? subOutbldg.join(", ") : "None",
      comps.map(c => {
        const o = (c.features?.outbuildings as string[]) || [];
        return o.length > 0 ? o.join(", ") : "None";
      }));
    gridRows += adjRow("Outbuilding Adj", "adj_outbuildings");
  }

  // Mountain Features section
  gridRows += `<tr class="section-row"><td colspan="${colSpan}">Mountain Features</td></tr>\n`;
  gridRows += dataRow("View Quality", `${subFeats.view_quality || "?"}/5`, comps.map(c => `${c.features?.view_quality || "?"}/5`));
  gridRows += adjRow(isLand ? "Adj @ $20K/pt" : "Adj @ $15K/pt", "adj_view");

  // Water
  gridRows += dataRow("Water Features", `${subFeats.water_quality || "?"}/5`, comps.map(c => `${c.features?.water_quality || "?"}/5`));
  gridRows += adjRow(isLand ? "Adj @ $15K/pt" : "Adj @ $12K/pt", "adj_water_features");

  // Land Usability
  gridRows += dataRow("Land Usability", `${subFeats.land_usability || "?"}/5`, comps.map(c => `${c.features?.land_usability || "?"}/5`));
  gridRows += adjRow(isLand ? "Adj @ $12K/pt" : "Adj @ $8K/pt", "adj_land_character");

  // Privacy & Road Noise
  gridRows += dataRow("Road Noise", `${subFeats.road_noise || "?"}/5`, comps.map(c => `${c.features?.road_noise || "?"}/5`));
  gridRows += adjRow(isLand ? "Adj @ $10K/pt" : "Adj @ $7K/pt", "adj_road_noise");

  gridRows += dataRow("Privacy", `${subFeats.privacy_rating || "?"}/5`, comps.map(c => `${c.features?.privacy_rating || "?"}/5`));
  gridRows += adjRow(isLand ? "Adj @ $8K/pt" : "Adj @ $6K/pt", "adj_privacy");

  // Market section
  gridRows += `<tr class="section-row"><td colspan="${colSpan}">Market</td></tr>\n`;
  gridRows += adjRow("Time Adj (0.3%/mo)", "adj_time");

  // Totals
  const netAdjs = comps.map(c => {
    const v = (c.adjustments as Record<string, number>).total_adjustment || 0;
    return `<td class="${adjClass(v)}" style="font-weight:700">${adjVal(v)}</td>`;
  }).join("");
  gridRows += `<tr class="total-row"><td>Net Adjustment</td><td class="subject-val"></td>${netAdjs}</tr>\n`;

  const adjPrices = comps.map(c => {
    const v = (c.adjustments as Record<string, number>).adjusted_price || 0;
    return `<td>${fmt(v)}</td>`;
  }).join("");
  gridRows += `<tr class="adjusted-row"><td>Adjusted Sale Price</td><td class="subject-val">\u2014</td>${adjPrices}</tr>\n`;

  // Build AI summary section
  const aiSection = data.ai_summary ? `
  <div class="subsection" style="margin-top:1rem;">
    <div class="subsection-title">AI Market Analysis</div>
    <div class="market-narrative"><p>${data.ai_summary}</p></div>
  </div>` : "";

  const methodNote = data.methodology_note || `This ${numComps}-comp analysis uses WNC-calibrated adjustment rates. ${isLand ? "Land valuations weight lot size, views, water features, and usability above structural factors." : "Adjustments reflect local market conditions in Western North Carolina."} Values are estimates based on comparable sales and should not be considered an appraisal.`;

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>CMA Report \u2014 ${sub.full_address || "Property"}</title>
<link href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,300;0,400;0,500;0,600;0,700;1,300;1,400&family=Outfit:wght@200;300;400;500;600&display=swap" rel="stylesheet">
<style>
  :root {
    --gold: #8B7748;
    --gold-light: rgba(139, 119, 72, 0.08);
    --gold-border: rgba(139, 119, 72, 0.25);
    --cream: #FDFAF5;
    --text: #1A1D23;
    --text-secondary: #5A6170;
    --text-muted: #9098A8;
    --border: #E2E6EC;
    --bg: #FFFFFF;
    --bg-subtle: #F5F7FA;
    --green: #2E7D32;
    --green-light: rgba(46, 125, 50, 0.08);
    --red: #C62828;
    --red-light: rgba(198, 40, 40, 0.06);
  }
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: 'Outfit', 'Helvetica Neue', Arial, sans-serif; font-size: 10pt; color: var(--text); background: #EEEAE4; line-height: 1.5; -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
  .page { width: 8.5in; min-height: 11in; margin: 0.5in auto; background: var(--bg); padding: 0.6in 0.65in; position: relative; box-shadow: 0 2px 20px rgba(0,0,0,0.12); }
  .page + .page { page-break-before: always; }
  h1, h2, h3 { font-family: 'Cormorant Garamond', Georgia, serif; }
  h1 { font-weight: 600; } h2 { font-weight: 600; }
  .section-label { font-family: 'Outfit', sans-serif; font-size: 0.55rem; font-weight: 600; letter-spacing: 0.18em; text-transform: uppercase; color: var(--gold); margin-bottom: 0.3rem; }
  .gold-rule-wide { width: 100%; height: 1px; background: var(--border); border: none; margin: 0.5rem 0; }
  .cover { display: flex; flex-direction: column; justify-content: center; align-items: center; text-align: center; min-height: calc(11in - 1.2in); }
  .cover-top-line { width: 60px; height: 2px; background: var(--gold); margin-bottom: 2rem; }
  .cover-label { font-family: 'Outfit', sans-serif; font-size: 0.6rem; font-weight: 500; letter-spacing: 0.25em; text-transform: uppercase; color: var(--gold); margin-bottom: 1.5rem; }
  .cover-address { font-family: 'Cormorant Garamond', Georgia, serif; font-size: 2.2rem; font-weight: 600; color: var(--text); line-height: 1.2; margin-bottom: 0.3rem; }
  .cover-city { font-family: 'Cormorant Garamond', Georgia, serif; font-size: 1.3rem; font-weight: 400; color: var(--text-secondary); margin-bottom: 2rem; }
  .cover-value-box { background: var(--gold-light); border: 1px solid var(--gold-border); padding: 1rem 2.5rem; margin-bottom: 0.6rem; }
  .cover-value-label { font-size: 0.55rem; font-weight: 600; letter-spacing: 0.18em; text-transform: uppercase; color: var(--gold); margin-bottom: 0.25rem; }
  .cover-value { font-family: 'Cormorant Garamond', Georgia, serif; font-size: 1.8rem; font-weight: 700; color: var(--green); }
  .cover-value-range { font-family: 'Outfit', sans-serif; font-size: 0.75rem; color: var(--text-secondary); margin-top: 0.2rem; }
  .cover-date { font-size: 0.7rem; color: var(--text-muted); margin-bottom: 3rem; }
  .cover-divider { width: 40px; height: 1px; background: var(--border); margin-bottom: 2rem; }
  .cover-agent-name { font-family: 'Cormorant Garamond', Georgia, serif; font-size: 1.15rem; font-weight: 600; color: var(--text); margin-bottom: 0.15rem; }
  .cover-agent-title { font-size: 0.7rem; color: var(--text-secondary); margin-bottom: 0.1rem; }
  .cover-agent-contact { font-size: 0.65rem; color: var(--text-muted); line-height: 1.6; }
  .cover-footer { position: absolute; bottom: 0.6in; left: 0; right: 0; text-align: center; font-size: 0.55rem; color: var(--text-muted); letter-spacing: 0.05em; }
  .subject-header { margin-bottom: 1.2rem; }
  .subject-address { font-size: 1.4rem; margin-top: 0.2rem; margin-bottom: 0.1rem; }
  .subject-city { font-size: 0.8rem; color: var(--text-secondary); }
  .facts-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 0; margin-bottom: 1.2rem; }
  .fact-row { display: flex; justify-content: space-between; padding: 0.3rem 0.5rem; border-bottom: 1px dotted var(--border); font-size: 0.75rem; }
  .fact-row:nth-child(odd) { background: var(--bg-subtle); }
  .fact-label { color: var(--text-secondary); font-weight: 400; }
  .fact-value { font-weight: 500; text-align: right; }
  .subsection { margin-bottom: 1rem; }
  .subsection-title { font-family: 'Cormorant Garamond', Georgia, serif; font-size: 0.9rem; font-weight: 600; color: var(--text); margin-bottom: 0.4rem; padding-bottom: 0.2rem; border-bottom: 1px solid var(--border); }
  .market-narrative { font-size: 0.75rem; color: var(--text-secondary); line-height: 1.7; margin-top: 0.5rem; }
  .market-narrative p { margin-bottom: 0.5rem; }
  .cma-table { width: 100%; border-collapse: collapse; font-size: 0.62rem; margin-bottom: 0.8rem; }
  .cma-table th { padding: 0.35rem 0.4rem; font-size: 0.58rem; font-weight: 600; letter-spacing: 0.06em; text-transform: uppercase; border-bottom: 2px solid var(--gold-border); background: var(--bg-subtle); text-align: center; }
  .cma-table th:first-child { text-align: left; color: var(--gold); }
  .cma-table th.subject-col { color: var(--gold); background: var(--gold-light); }
  .cma-table th.comp-col { color: var(--text-secondary); }
  .cma-table td { padding: 0.3rem 0.4rem; border-bottom: 1px solid var(--border); text-align: center; }
  .cma-table td:first-child { text-align: left; font-weight: 500; color: var(--text); }
  .cma-table td.subject-val { background: var(--gold-light); font-weight: 500; color: var(--gold); }
  .cma-table .section-row td { background: var(--bg-subtle); font-size: 0.58rem; font-weight: 600; letter-spacing: 0.08em; text-transform: uppercase; color: var(--gold); border-bottom: 1px solid var(--border); padding: 0.25rem 0.4rem; }
  .cma-table .price-row td { font-weight: 600; font-size: 0.78rem; background: var(--bg-subtle); border-bottom: 2px solid var(--border); }
  .cma-table .total-row td { font-weight: 700; font-size: 0.72rem; border-top: 2px solid var(--border); background: var(--bg-subtle); }
  .cma-table .adjusted-row td { font-weight: 700; font-size: 0.78rem; background: var(--green-light); color: var(--green); border-top: 2px solid var(--green); }
  .cma-table .adjusted-row td:first-child { color: var(--green); }
  .cma-table .adjusted-row td.subject-val { color: var(--gold); background: var(--gold-light); }
  .adj-pos { color: var(--green) !important; }
  .adj-neg { color: var(--red) !important; }
  .adj-zero { color: var(--text-muted) !important; }
  .valuation-box { background: var(--green-light); border: 1px solid rgba(46, 125, 50, 0.2); padding: 1rem 1.5rem; text-align: center; margin: 1rem 0; }
  .valuation-label { font-size: 0.6rem; font-weight: 600; letter-spacing: 0.15em; text-transform: uppercase; color: var(--green); margin-bottom: 0.25rem; }
  .valuation-price { font-family: 'Cormorant Garamond', Georgia, serif; font-size: 1.6rem; font-weight: 700; color: var(--green); margin-bottom: 0.1rem; }
  .valuation-range { font-family: 'Outfit', sans-serif; font-size: 0.8rem; font-weight: 500; color: var(--text-secondary); margin-bottom: 0.15rem; }
  .valuation-note { font-size: 0.65rem; color: var(--text-secondary); }
  .methodology { font-size: 0.65rem; color: var(--text-muted); line-height: 1.6; margin-top: 0.6rem; }
  .methodology p { margin-bottom: 0.3rem; }
  .range-explain { font-size: 0.72rem; color: var(--text-secondary); line-height: 1.65; padding: 0.7rem 0.9rem; background: var(--bg-subtle); border-left: 3px solid var(--gold); border-radius: 4px; }
  .range-explain p { margin-bottom: 0.45rem; }
  .range-explain ul { margin: 0 0 0.45rem 1.1rem; padding: 0; }
  .range-explain li { margin-bottom: 0.3rem; }
  .range-explain li:last-child { margin-bottom: 0; }
  .range-explain strong { color: var(--text); font-weight: 600; }
  .range-explain-note { font-size: 0.65rem; color: var(--text-muted); font-style: italic; margin-bottom: 0 !important; }
  .disclaimers { margin-top: 1rem; padding-top: 0.6rem; border-top: 1px solid var(--border); font-size: 0.58rem; color: var(--text-muted); line-height: 1.6; }
  .disclaimers p { margin-bottom: 0.3rem; }
  .eho { font-weight: 600; color: var(--text-secondary); }
  .photo-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 0.4rem; margin-top: 0.5rem; }
  .photo-grid img { width: 100%; height: auto; border-radius: 4px; display: block; object-fit: cover; }
  .photo-grid .hero { grid-column: 1 / -1; }
  .photo-grid .hero img { max-height: 3.2in; object-fit: cover; }
  .photo-grid .small img { height: 1.5in; }
  .photo-note { font-size: 0.55rem; color: var(--text-muted); text-align: center; margin-top: 0.4rem; }
  .activity-table { width: 100%; border-collapse: collapse; font-size: 0.65rem; margin-bottom: 0.8rem; }
  .activity-table th { padding: 0.35rem 0.3rem; font-size: 0.58rem; font-weight: 600; letter-spacing: 0.05em; text-transform: uppercase; border-bottom: 2px solid var(--gold-border); background: var(--bg-subtle); text-align: center; color: var(--text-secondary); }
  .activity-table th:first-child { text-align: left; }
  .activity-table td { padding: 0.3rem 0.3rem; border-bottom: 1px solid var(--border); text-align: center; }
  .activity-table td:first-child { text-align: left; }
  .status-sold { font-size: 0.55rem; font-weight: 600; color: var(--green); background: var(--green-light); padding: 0.1rem 0.3rem; border-radius: 3px; }
  .comp-highlight { background: var(--bg-subtle); padding: 0.5rem 0.7rem; border-left: 3px solid var(--gold); margin-bottom: 0.4rem; }
  .comp-highlight-title { font-weight: 600; font-size: 0.72rem; margin-bottom: 0.15rem; }
  .comp-highlight-text { font-size: 0.65rem; color: var(--text-secondary); line-height: 1.6; }
  /* Market overview stat cards */
  .stat-card { flex: 1; background: var(--bg-subtle); border: 1px solid var(--border); border-radius: 6px; padding: 0.6rem 0.8rem; text-align: center; }
  .stat-label { font-size: 0.55rem; font-weight: 600; letter-spacing: 0.1em; text-transform: uppercase; color: var(--text-muted); margin-bottom: 0.2rem; }
  .stat-value { font-family: 'Cormorant Garamond', Georgia, serif; font-size: 1.1rem; font-weight: 700; color: var(--text); }
  /* Comp detail cards */
  .comp-detail-card { margin-bottom: 0.6rem; border: 1px solid var(--border); border-radius: 6px; padding: 0.6rem 0.7rem; break-inside: avoid; }
  .comp-detail-card-second { margin-top: 0.8rem; }
  .comp-detail-header { margin-bottom: 0.4rem; }
  .comp-detail-num { font-size: 0.55rem; font-weight: 600; letter-spacing: 0.12em; text-transform: uppercase; color: var(--gold); }
  .comp-detail-addr { font-family: 'Cormorant Garamond', Georgia, serif; font-size: 1rem; font-weight: 600; }
  .comp-detail-body { display: flex; gap: 0.6rem; }
  .comp-detail-photo { width: 2.4in; flex-shrink: 0; }
  .comp-detail-photo img { width: 100%; height: 1.6in; object-fit: cover; border-radius: 4px; display: block; }
  .comp-detail-facts { flex: 1; }
  .comp-detail-price { font-family: 'Cormorant Garamond', Georgia, serif; font-size: 1.15rem; font-weight: 700; color: var(--green); }
  .comp-detail-meta { font-size: 0.62rem; color: var(--text-secondary); margin-bottom: 0.3rem; }
  .comp-detail-specs { display: flex; flex-wrap: wrap; gap: 0.2rem 0.6rem; font-size: 0.65rem; color: var(--text); margin-bottom: 0.3rem; }
  .comp-detail-features { display: flex; flex-wrap: wrap; gap: 0.2rem; }
  .pdf-chip { font-size: 0.52rem; padding: 0.1rem 0.35rem; background: var(--bg-subtle); border: 1px solid var(--border); border-radius: 3px; color: var(--text-secondary); }
  .pdf-chip-good { background: rgba(46, 125, 50, 0.08); border-color: rgba(46, 125, 50, 0.2); color: var(--green); }
  .pdf-chip-warn { background: rgba(230, 167, 0, 0.08); border-color: rgba(230, 167, 0, 0.2); color: #8B6914; }
  .comp-detail-remarks { font-size: 0.62rem; color: var(--text-secondary); line-height: 1.5; margin-top: 0.3rem; font-style: italic; }
  .comp-detail-adjustment { font-size: 0.65rem; margin-top: 0.3rem; padding-top: 0.3rem; border-top: 1px dotted var(--border); }
  @media print {
    body { background: white; margin: 0; padding: 0; }
    .page { width: auto; min-height: auto; margin: 0; padding: 0.5in 0.6in; box-shadow: none; border: none; }
    @page { size: letter; margin: 0; }
  }
</style>
</head>
<body>

<!-- PAGE 1: COVER -->
<div class="page cover-page">
  <div class="cover">
    <div class="cover-top-line"></div>
    <div class="cover-label">Comparative Market Analysis</div>
    <div class="cover-address">${sub.full_address || "Property Address"}</div>
    <div class="cover-city">${sub.city || ""}, NC ${sub.postal_code || ""} &nbsp;|&nbsp; ${sub.county_or_parish || ""} County</div>
    <div class="cover-value-box">
      <div class="cover-value-label">Estimated Market Value</div>
      <div class="cover-value">${fmt(val.suggested_price)}</div>
      <div class="cover-value-range">${fmt(val.suggested_low)} &ndash; ${fmt(val.suggested_high)}</div>
    </div>
    <div class="cover-date">Prepared ${reportDate}</div>
    <div class="cover-divider"></div>
    <div class="cover-agent-name">${AGENT.name}</div>
    <div class="cover-agent-title">${AGENT.title} &nbsp;|&nbsp; ${AGENT.company}</div>
    <div class="cover-agent-contact">${AGENT.phone}<br>${AGENT.email}<br>${AGENT.website}</div>
    <div class="cover-footer">Equal Housing Opportunity &nbsp;&bull;&nbsp; ${AGENT.office}</div>
  </div>
</div>

<!-- PAGE 2: SUBJECT PROPERTY DETAILS (EXPANDED) -->
<div class="page">
  <div class="subject-header">
    <div class="section-label">Subject Property</div>
    <h2 class="subject-address">${sub.full_address || ""}</h2>
    <div class="subject-city">${sub.city || ""}, NC ${sub.postal_code || ""} &nbsp;&bull;&nbsp; ${sub.county_or_parish || ""} County</div>
  </div>
  <hr class="gold-rule-wide">

  <div class="subsection-title" style="margin-top:0.6rem;">Property Facts</div>
  <div class="facts-grid">
    <div class="facts-col" style="border-right: 1px solid var(--border);">
      ${!isLand ? `<div class="fact-row"><span class="fact-label">Bedrooms</span><span class="fact-value">${sub.bedrooms_total || "\u2014"}</span></div>
      <div class="fact-row"><span class="fact-label">Bathrooms</span><span class="fact-value">${sub.bathrooms_total_integer || "\u2014"}</span></div>
      <div class="fact-row"><span class="fact-label">Living Area</span><span class="fact-value">${fmtNum(sub.living_area as number)} sqft</span></div>` : ""}
      <div class="fact-row"><span class="fact-label">Lot Size</span><span class="fact-value">${sub.lot_size_acres || "\u2014"} acres</span></div>
      ${!isLand ? `<div class="fact-row"><span class="fact-label">Year Built</span><span class="fact-value">${sub.year_built || "\u2014"}</span></div>
      <div class="fact-row"><span class="fact-label">Garage</span><span class="fact-value">${(sub.garage_spaces as number) || 0} spaces</span></div>
      ${sub.stories ? `<div class="fact-row"><span class="fact-label">Stories</span><span class="fact-value">${sub.stories}</span></div>` : ""}` : ""}
    </div>
    <div class="facts-col">
      <div class="fact-row"><span class="fact-label">Property Type</span><span class="fact-value">${sub.property_type || ""}</span></div>
      <div class="fact-row"><span class="fact-label">Construction</span><span class="fact-value" style="text-transform:capitalize">${(() => {
        const ct = subFeats.construction_type as string || "unknown";
        if (ct === "unknown") return "Site-Built";
        return ct.replace(/_/g, " ");
      })()}</span></div>
      <div class="fact-row"><span class="fact-label">Restrictions</span><span class="fact-value">${subFeats.restriction_status === "unrestricted" ? "Unrestricted" : subFeats.restriction_status === "restricted" ? "Restricted" : "\u2014"}</span></div>
      <div class="fact-row"><span class="fact-label">County</span><span class="fact-value">${sub.county_or_parish || ""}</span></div>
      ${subFeats.elevation_ft ? `<div class="fact-row"><span class="fact-label">Elevation</span><span class="fact-value">${fmtNum(subFeats.elevation_ft as number)} ft</span></div>` : ""}
      ${sub.close_price ? `<div class="fact-row"><span class="fact-label">Last Sale</span><span class="fact-value">${fmt(sub.close_price as number)} (${sub.close_date || ""})</span></div>` : ""}
      ${sub.list_price ? `<div class="fact-row"><span class="fact-label">List Price</span><span class="fact-value">${fmt(sub.list_price as number)}</span></div>` : ""}
    </div>
  </div>

  <div class="subsection-title" style="margin-top:0.8rem;">Mountain &amp; Site Features</div>
  <div class="facts-grid">
    <div class="facts-col" style="border-right: 1px solid var(--border);">
      <div class="fact-row"><span class="fact-label">View Quality</span><span class="fact-value">${ratingStr(subFeats.view_quality)}${subFeats.view_type && (subFeats.view_type as string[]).length ? ` (${(subFeats.view_type as string[]).join(", ")})` : ""}</span></div>
      <div class="fact-row"><span class="fact-label">Water Features</span><span class="fact-value">${ratingStr(subFeats.water_quality)}${subFeats.water_features && (subFeats.water_features as string[]).length ? ` (${(subFeats.water_features as string[]).join(", ")})` : ""}</span></div>
      <div class="fact-row"><span class="fact-label">Land Usability</span><span class="fact-value">${ratingStr(subFeats.land_usability)}${subFeats.land_character && (subFeats.land_character as string[]).length ? ` (${(subFeats.land_character as string[]).join(", ")})` : ""}</span></div>
    </div>
    <div class="facts-col">
      <div class="fact-row"><span class="fact-label">Road Noise</span><span class="fact-value">${ratingStr(subFeats.road_noise)}</span></div>
      <div class="fact-row"><span class="fact-label">Privacy</span><span class="fact-value">${ratingStr(subFeats.privacy_rating)}</span></div>
      <div class="fact-row"><span class="fact-label">Condition</span><span class="fact-value">${ratingStr(subFeats.condition_rating)}</span></div>
    </div>
  </div>

  ${!isLand && (subFeats.has_pool || (subFeats.basement_type && subFeats.basement_type !== "none") || subFeats.has_fireplace || ((subFeats.outbuildings as string[])?.length > 0)) ? `
  <div class="subsection-title" style="margin-top:0.8rem;">Structural Features</div>
  <div class="facts-grid">
    <div class="facts-col" style="border-right: 1px solid var(--border);">
      <div class="fact-row"><span class="fact-label">Pool</span><span class="fact-value">${subFeats.has_pool ? (subFeats.pool_type as string || "Yes") : "None"}</span></div>
      <div class="fact-row"><span class="fact-label">Basement</span><span class="fact-value">${(subFeats.basement_type && subFeats.basement_type !== "none") ? (subFeats.basement_type as string) : "None"}</span></div>
    </div>
    <div class="facts-col">
      <div class="fact-row"><span class="fact-label">Fireplace</span><span class="fact-value">${subFeats.has_fireplace ? `${subFeats.fireplace_count || 1}x ${subFeats.fireplace_type || ""}`.trim() : "None"}</span></div>
      <div class="fact-row"><span class="fact-label">Outbuildings</span><span class="fact-value">${((subFeats.outbuildings as string[]) || []).length > 0 ? (subFeats.outbuildings as string[]).join(", ") : "None"}</span></div>
    </div>
  </div>` : ""}

  ${aiSection}
</div>

<!-- PAGES 3-4: PROPERTY PHOTOS (up to 2 pages) -->
${(() => {
  const photos = (sub.photos as string[]) || [];
  const photoUrl = sub.photo_url as string || "";
  const allPhotos = photos.length ? photos : (photoUrl ? [photoUrl] : []);
  if (allPhotos.length === 0) return "";
  const heroPhoto = allPhotos[0];
  const page1Photos = allPhotos.slice(1, 7);
  const page2Photos = allPhotos.slice(7, 13);
  let html = `<div class="page">
  <div class="subject-header">
    <div class="section-label">Property Photos</div>
    <h2 style="font-size: 1.2rem; margin-top: 0.2rem;">${sub.full_address || ""}</h2>
  </div>
  <hr class="gold-rule-wide">
  <div class="photo-grid">
    <div class="hero"><img src="${heroPhoto}" alt="Primary property photo" onerror="this.style.display='none'"></div>
    ${page1Photos.map((p: string) => `<div class="small"><img src="${p}" alt="Property photo" onerror="this.parentElement.style.display='none'"></div>`).join("\n    ")}
  </div>
  <div class="photo-note">Photos from MLS listing. Contact agent for current property photos.</div>
</div>`;
  if (page2Photos.length > 0) {
    html += `\n<div class="page">
  <div class="subject-header">
    <div class="section-label">Property Photos (continued)</div>
    <h2 style="font-size: 1.2rem; margin-top: 0.2rem;">${sub.full_address || ""}</h2>
  </div>
  <hr class="gold-rule-wide">
  <div class="photo-grid">
    ${page2Photos.map((p: string) => `<div class="small"><img src="${p}" alt="Property photo" onerror="this.parentElement.style.display='none'"></div>`).join("\n    ")}
  </div>
</div>`;
  }
  return html;
})()}

<!-- PAGE: MARKET OVERVIEW (conditional) -->
${(() => {
  const ms = data.market_stats;
  if (!ms || (!ms.sold_6mo_count && !ms.active_count)) return "";
  const priceTrendPct = ms.median_sold_price_prior > 0
    ? ((ms.median_sold_price - ms.median_sold_price_prior) / ms.median_sold_price_prior * 100).toFixed(1)
    : null;
  const priceTrendDir = priceTrendPct ? (parseFloat(priceTrendPct) >= 0 ? "up" : "down") : null;
  const marketType = ms.months_of_inventory <= 4 ? "Seller's Market" : ms.months_of_inventory >= 7 ? "Buyer's Market" : "Balanced Market";
  const marketColor = ms.months_of_inventory <= 4 ? "var(--green)" : ms.months_of_inventory >= 7 ? "var(--red)" : "var(--gold)";
  return `<div class="page">
  <div class="subject-header">
    <div class="section-label">Market Overview</div>
    <h2 style="font-size: 1.2rem; margin-top: 0.2rem;">${esc(ms.county)} County &nbsp;&bull;&nbsp; ${esc(ms.property_type)}</h2>
    <div class="subject-city">As of ${reportDate}</div>
  </div>
  <hr class="gold-rule-wide">

  <div style="display:flex; gap:0.5rem; margin:1rem 0;">
    <div class="stat-card">
      <div class="stat-label">Active Listings</div>
      <div class="stat-value">${ms.active_count}</div>
    </div>
    <div class="stat-card">
      <div class="stat-label">Sold (6 months)</div>
      <div class="stat-value">${ms.sold_6mo_count}</div>
    </div>
    <div class="stat-card">
      <div class="stat-label">Median DOM</div>
      <div class="stat-value">${ms.median_dom ? Math.round(ms.median_dom) + " days" : "\u2014"}</div>
    </div>
  </div>
  <div style="display:flex; gap:0.5rem; margin:0 0 1rem;">
    <div class="stat-card">
      <div class="stat-label">Median Sale Price</div>
      <div class="stat-value">${ms.median_sold_price ? fmt(ms.median_sold_price) : "\u2014"}</div>
    </div>
    <div class="stat-card">
      <div class="stat-label">Avg Price/SqFt</div>
      <div class="stat-value">${ms.avg_ppsf ? "$" + Math.round(ms.avg_ppsf) : "\u2014"}</div>
    </div>
    <div class="stat-card">
      <div class="stat-label">Months of Inventory</div>
      <div class="stat-value">${ms.months_of_inventory ? ms.months_of_inventory.toFixed(1) : "\u2014"}</div>
    </div>
  </div>

  <div style="background:var(--bg-subtle); padding:0.8rem 1rem; border-radius:6px; margin-bottom:1rem;">
    <div style="font-size:0.7rem; font-weight:600; color:${marketColor}; margin-bottom:0.3rem;">${marketType}</div>
    <div style="font-size:0.7rem; color:var(--text-secondary); line-height:1.6;">
      ${ms.months_of_inventory ? `With ${ms.months_of_inventory.toFixed(1)} months of inventory, the ${esc(ms.county)} County ${ms.property_type.toLowerCase()} market is currently a <strong style="color:${marketColor}">${marketType.toLowerCase()}</strong>.` : ""}
      ${priceTrendPct ? ` Median sale price is <strong>${priceTrendDir} ${Math.abs(parseFloat(priceTrendPct))}%</strong> compared to the prior 6-month period.` : ""}
      ${ms.sold_6mo_count > 0 ? ` There have been ${ms.sold_6mo_count} closed sales in the past 6 months${ms.median_dom ? ` with a median of ${Math.round(ms.median_dom)} days on market` : ""}.` : ""}
    </div>
  </div>

  <div class="methodology" style="margin-top:1.5rem;">
    <p>Market data sourced from MLS listings in ${esc(ms.county)} County for ${ms.property_type.toLowerCase()} properties. Statistics reflect recent closed sales and active listings as of the report date.</p>
  </div>
</div>`;
})()}

<!-- COMP DETAIL PAGES (2 comps per page) -->
<div class="page">
  <div class="subject-header">
    <div class="section-label">Comparable Properties</div>
    <h2 style="font-size: 1.2rem; margin-top: 0.2rem;">Property Details</h2>
  </div>
  <hr class="gold-rule-wide">
${comps.map((c, i) => {
  const cl = c.listing;
  const cf = c.features || {};
  const adj = c.adjustments as Record<string, number>;
  const addr = (cl.full_address as string || "Unknown").replace(/,.*/, "");
  const city = cl.city as string || "";
  const photoUrl = cl.photo_url as string || "";
  const remarks = (cl.public_remarks as string || "").slice(0, 400);
  const mlsId = cl.listing_id as string || "";
  const dist = cl.distance as number || null;
  return `  <div class="comp-detail-card${i > 0 ? " comp-detail-card-second" : ""}">
    <div class="comp-detail-header">
      <div class="comp-detail-num">Comp ${i + 1}</div>
      <div class="comp-detail-addr">${esc(addr)}, ${esc(city)}</div>
    </div>
    <div class="comp-detail-body">
      ${photoUrl ? `<div class="comp-detail-photo"><img src="${photoUrl}" alt="Comp ${i + 1} photo" onerror="this.parentElement.style.display='none'"></div>` : ""}
      <div class="comp-detail-facts">
        <div class="comp-detail-price">${fmt(cl.close_price as number)}</div>
        <div class="comp-detail-meta">Sold ${cl.close_date || "\u2014"}${mlsId ? ` &nbsp;|&nbsp; MLS #${esc(mlsId)}` : ""}${dist ? ` &nbsp;|&nbsp; ${dist} mi from subject` : ""}</div>
        <div class="comp-detail-specs">
          ${!isLand ? `<span>${cl.bedrooms_total || "?"} bed / ${cl.bathrooms_total_integer || "?"} bath</span><span>${fmtNum(cl.living_area as number)} sqft</span>` : ""}
          <span>${cl.lot_size_acres || "\u2014"} acres</span>
          ${!isLand ? `<span>Built ${cl.year_built || "\u2014"}</span><span>${(cl.garage_spaces as number) || 0} garage</span>` : ""}
        </div>
        <div class="comp-detail-features">
          ${cf.view_quality ? `<span class="pdf-chip">View ${cf.view_quality}/5</span>` : ""}
          ${cf.water_quality ? `<span class="pdf-chip">Water ${cf.water_quality}/5</span>` : ""}
          ${cf.land_usability ? `<span class="pdf-chip">Land ${cf.land_usability}/5</span>` : ""}
          ${cf.privacy_rating ? `<span class="pdf-chip">Privacy ${cf.privacy_rating}/5</span>` : ""}
          ${cf.condition_rating ? `<span class="pdf-chip">Cond ${cf.condition_rating}/5</span>` : ""}
          ${cf.restriction_status === "unrestricted" ? `<span class="pdf-chip pdf-chip-good">Unrestricted</span>` : cf.restriction_status === "restricted" ? `<span class="pdf-chip pdf-chip-warn">Restricted</span>` : ""}
          ${(() => {
            const ct = cf.construction_type as string || "";
            if (ct && ct !== "site_built" && ct !== "unknown") return `<span class="pdf-chip pdf-chip-warn">${ct.replace(/_/g, " ")}</span>`;
            return "";
          })()}
        </div>
      </div>
    </div>
    ${remarks ? `<div class="comp-detail-remarks">${esc(remarks)}${remarks.length >= 400 ? "..." : ""}</div>` : ""}
    <div class="comp-detail-adjustment">
      <span>Net Adjustment: <strong class="${adjClass(adj.total_adjustment || 0)}">${adjVal(adj.total_adjustment)}</strong></span>
      <span style="margin-left:1rem;">Adjusted Price: <strong style="color:var(--green)">${fmt(adj.adjusted_price)}</strong></span>
    </div>
  </div>`;
}).join("\n")}
</div>

<!-- COMPARABLE SALES ACTIVITY -->
<div class="page">
  <div class="subject-header">
    <div class="section-label">Comparable Sales Activity</div>
    <h2 style="font-size: 1.2rem; margin-top: 0.2rem;">Recent Sales Used in Analysis</h2>
  </div>
  <hr class="gold-rule-wide">

  <table class="activity-table">
    <thead>
      <tr>
        <th>Address</th>
        <th>Status</th>
        <th>Price</th>
        ${!isLand ? "<th>Beds/Baths</th><th>SqFt</th>" : ""}
        <th>Acres</th>
        ${!isLand ? "<th>Year</th>" : ""}
        <th>Sold Date</th>
      </tr>
    </thead>
    <tbody>
      <tr style="background: var(--gold-light);">
        <td style="font-weight: 600;">${((sub.full_address as string) || "").replace(/,.*/, "")}<br><span style="font-size:0.55rem;color:var(--gold);font-weight:600;">SUBJECT</span></td>
        <td><span style="font-size:0.55rem;font-weight:600;color:var(--gold);">${(sub.standard_status as string) || "SUBJECT"}</span></td>
        <td>${sub.list_price ? fmt(sub.list_price as number) : "\u2014"}</td>
        ${!isLand ? `<td>${sub.bedrooms_total || "?"} / ${sub.bathrooms_total_integer || "?"}</td><td>${fmtNum(sub.living_area as number)}</td>` : ""}
        <td>${sub.lot_size_acres || "\u2014"}</td>
        ${!isLand ? `<td>${sub.year_built || "\u2014"}</td>` : ""}
        <td>\u2014</td>
      </tr>
      ${comps.map((c, i) => {
        const cl = c.listing;
        const mlsId = cl.listing_id ? `MLS #${cl.listing_id}` : "";
        const dist = cl.distance ? `${cl.distance} mi` : "";
        const meta = [mlsId, dist].filter(Boolean).join(" \u2022 ");
        return `<tr>
        <td>${((cl.full_address as string) || "").replace(/,.*/, "")}<br><span style="font-size:0.55rem;color:var(--text-muted);">Comp ${i + 1}${meta ? " \u2022 " + meta : ""}</span></td>
        <td><span class="status-sold">SOLD</span></td>
        <td style="font-weight:600;">${fmt(cl.close_price as number)}</td>
        ${!isLand ? `<td>${cl.bedrooms_total || "?"} / ${cl.bathrooms_total_integer || "?"}</td><td>${fmtNum(cl.living_area as number)}</td>` : ""}
        <td>${cl.lot_size_acres || "\u2014"}</td>
        ${!isLand ? `<td>${cl.year_built || "\u2014"}</td>` : ""}
        <td>${cl.close_date || "\u2014"}</td>
      </tr>`;
      }).join("\n      ")}
    </tbody>
  </table>

  ${(() => {
    const reasoning = data.comp_reasoning || {};
    const hasReasoning = Object.keys(reasoning).length > 0;
    if (!hasReasoning) return "";
    let html = '<div class="subsection-title" style="margin-top:1rem;">Comparable Property Highlights</div>';
    comps.forEach((c, i) => {
      const key = c.listing.listing_key as string;
      const reason = reasoning[key] || "";
      if (!reason) return;
      const addr = ((c.listing.full_address as string) || "").replace(/,.*/, "");
      html += `<div class="comp-highlight">
        <div class="comp-highlight-title">Comp ${i + 1}: ${addr}</div>
        <div class="comp-highlight-text">${reason}</div>
      </div>`;
    });
    return html;
  })()}
</div>

<!-- PAGE 5: CMA ADJUSTMENT GRID -->
<div class="page">
  <div class="subject-header">
    <div class="section-label">Comparative Market Analysis</div>
    <h2 style="font-size: 1.2rem; margin-top: 0.2rem;">Adjustment Grid &amp; Valuation</h2>
  </div>
  <hr class="gold-rule-wide">

  <table class="cma-table">
    <thead>
      <tr>
        <th>Feature</th>
        <th class="subject-col">Subject</th>
        ${compHeaders}
      </tr>
    </thead>
    <tbody>
      ${gridRows}
    </tbody>
  </table>

  <div class="valuation-box">
    <div class="valuation-label">Estimated Market Value</div>
    <div class="valuation-price">${fmt(val.suggested_price)}</div>
    <div class="valuation-range">${fmt(val.suggested_low)} &ndash; ${fmt(val.suggested_high)}</div>
    <div class="valuation-note">Based on ${numComps} comparable ${isLand ? "land" : ""} sales analysis</div>
  </div>

  <div class="methodology">
    <p><strong>Methodology:</strong> ${methodNote}</p>
${(() => {
  // Detect comps with large gross adjustments (>25% of sale price)
  const largeAdjComps: string[] = [];
  comps.forEach(c => {
    const price = c.listing.close_price as number || 0;
    const totalAdj = Math.abs((c.adjustments as Record<string, number>).total_adjustment || 0);
    if (price > 0 && totalAdj / price > 0.25) {
      largeAdjComps.push(c.listing.full_address as string || "Unknown");
    }
  });
  let notes = "";
  if (largeAdjComps.length > 0) {
    notes += `<p><strong>Note:</strong> ${largeAdjComps.length === 1 ? "One comparable" : largeAdjComps.length + " comparables"} required adjustments exceeding 25% of sale price, which may reduce reliability. These comps were included due to limited comparable inventory in this market area.</p>`;
  }
  // Show weighted average context
  if (val.suggested_price && numComps > 1) {
    const adjPrices = comps.map(c => (c.adjustments as Record<string, number>).adjusted_price || 0);
    const minAdj = Math.min(...adjPrices);
    const maxAdj = Math.max(...adjPrices);
    if (maxAdj - minAdj > 50000) {
      notes += `<p><strong>Price Spread:</strong> Adjusted comp prices range from ${fmt(minAdj)} to ${fmt(maxAdj)}. The wider spread reflects differences in property characteristics and mountain features among available comparables.</p>`;
    }
  }
  return notes;
})()}
  </div>

  <div class="disclaimers">
    <p class="eho">Equal Housing Opportunity</p>
    <p>This CMA is not an appraisal and should not be considered as one. It is an estimate of market value based on comparable sales data and the agent's knowledge of local market conditions.</p>
    <p>Information is believed to be accurate but is not guaranteed. Buyers and sellers should verify all information independently.</p>
  </div>
</div>

<!-- PRICING STRATEGY PAGE -->
<div class="page">
  <div class="subject-header">
    <div class="section-label">Pricing Strategy</div>
    <h2 style="font-size: 1.4rem; margin-top: 0.2rem;">${sub.full_address || ""}</h2>
    <div class="subject-city">${sub.city || ""}, NC &nbsp;&bull;&nbsp; ${sub.county_or_parish || ""} County</div>
  </div>
  <hr class="gold-rule-wide">

  <div class="valuation-box" style="margin-top:1.5rem; padding:1.2rem 2rem;">
    <div class="valuation-label">CMA Estimated Market Value</div>
    <div class="valuation-price" style="font-size:2rem;">${fmt(val.suggested_price)}</div>
    <div class="valuation-range" style="font-size:0.85rem;">${fmt(val.suggested_low)} &ndash; ${fmt(val.suggested_high)}</div>
  </div>

  <div class="subsection-title" style="margin-top:1.5rem;">Understanding the Price Range</div>
  <div class="range-explain">
    <p>The price range shows a realistic spread for where this property could sell, given current market conditions and the comparable sales we used.</p>
    <ul>
      <li><strong>Low end (${fmt(val.suggested_low)}):</strong> what the home is likely to bring if it needs to sell quickly, the market softens, or showings reveal condition issues that the comps did not have.</li>
      <li><strong>Estimated market value (${fmt(val.suggested_price)}):</strong> the most likely sale price under typical conditions, weighted toward the comps that needed the fewest adjustments.</li>
      <li><strong>High end (${fmt(val.suggested_high)}):</strong> the upper edge if listing timing, demand, and presentation all line up, or if a buyer specifically values this home's features over the comps.</li>
    </ul>
    <p class="range-explain-note">A CMA is not a formal appraisal. Final sale price is determined by the market, the buyer, and how the home shows.</p>
  </div>

  <div class="subsection-title" style="margin-top:1.5rem;">CMA Summary</div>
  <div class="facts-grid" style="margin-bottom:1rem;">
    <div class="facts-col" style="border-right: 1px solid var(--border);">
      <div class="fact-row"><span class="fact-label">Number of Comps</span><span class="fact-value">${numComps}</span></div>
      <div class="fact-row"><span class="fact-label">Average Comp Sale Price</span><span class="fact-value">${fmt(comps.reduce((s, c) => s + ((c.listing.close_price as number) || 0), 0) / numComps)}</span></div>
      <div class="fact-row"><span class="fact-label">Average Net Adjustment</span><span class="fact-value">${adjVal(comps.reduce((s, c) => s + ((c.adjustments as Record<string, number>).total_adjustment || 0), 0) / numComps)}</span></div>
    </div>
    <div class="facts-col">
      <div class="fact-row"><span class="fact-label">Average Adjusted Price</span><span class="fact-value">${fmt(comps.reduce((s, c) => s + ((c.adjustments as Record<string, number>).adjusted_price || 0), 0) / numComps)}</span></div>
      ${!isLand && sub.living_area ? `<div class="fact-row"><span class="fact-label">Estimated $/sqft</span><span class="fact-value">$${Math.round(val.suggested_price / (sub.living_area as number))}</span></div>` : ""}
      ${sub.lot_size_acres ? `<div class="fact-row"><span class="fact-label">Estimated $/acre</span><span class="fact-value">${fmt(val.suggested_price / (sub.lot_size_acres as number))}</span></div>` : ""}
    </div>
  </div>

  ${data.agent_recommended_price ? `
  <div style="background:var(--gold-light); border:1px solid var(--gold-border); padding:0.8rem 1.2rem; margin:1rem 0;">
    <div style="font-size:0.6rem; font-weight:600; letter-spacing:0.15em; text-transform:uppercase; color:var(--gold); margin-bottom:0.2rem;">Agent's Recommended Price</div>
    <div style="font-family:'Cormorant Garamond',Georgia,serif; font-size:1.5rem; font-weight:700; color:var(--gold);">${fmt(data.agent_recommended_price)}</div>
  </div>` : ""}

  ${data.agent_notes ? `
  <div class="subsection-title" style="margin-top:1rem;">Agent Notes</div>
  <div class="market-narrative"><p>${esc(data.agent_notes)}</p></div>` : ""}

  <div class="methodology" style="margin-top:1.5rem;">
    <p><strong>Methodology:</strong> ${methodNote}</p>
  </div>

  <div class="disclaimers" style="margin-top:auto; position:absolute; bottom:0.6in; left:0.65in; right:0.65in;">
    <p class="eho">Equal Housing Opportunity</p>
    <p>This CMA is not an appraisal and should not be considered as one. It is an estimate of market value based on comparable sales data and the agent's knowledge of local market conditions. Information is believed to be accurate but is not guaranteed.</p>
    <p style="margin-top:0.4rem;">Prepared by ${AGENT.name}, ${AGENT.title} | ${AGENT.company}<br>${AGENT.phone} | ${AGENT.email} | ${AGENT.website}</p>
  </div>
</div>

</body>
</html>`;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const body = await req.json();
    const action = body.action || "generate-html";

    if (action === "generate-html") {
      let reportData: ReportInput;

      if (body.report_id) {
        // Load from database
        const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

        const { data: report, error: reportErr } = await sb
          .from("cma_reports")
          .select("*")
          .eq("id", body.report_id)
          .maybeSingle();

        if (reportErr || !report) {
          return new Response(
            JSON.stringify({ error: "Report not found", detail: reportErr?.message }),
            { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        // Load adjustments
        const { data: adjustments } = await sb
          .from("cma_adjustments")
          .select("*")
          .eq("report_id", body.report_id)
          .order("comp_order", { ascending: true });

        // Fetch subject photos from mls_media (prefer local_url from R2, fall back to media_url)
        const subjectKey = (report.subject_data as Record<string, unknown>)?.listing_key as string;
        let subjectPhotos: string[] = [];
        if (subjectKey) {
          const { data: photoRows } = await sb
            .from("mls_media")
            .select("media_url, local_url")
            .eq("listing_key", subjectKey)
            .order("order", { ascending: true })
            .limit(13);
          if (photoRows?.length) {
            subjectPhotos = photoRows.map((p: Record<string, unknown>) =>
              (p.local_url as string) || (p.media_url as string)
            ).filter(Boolean);
          }
        }

        // Fetch comp feature tags as fallback if comp_features is empty in DB
        const compKeys = (adjustments || [])
          .map((adj: Record<string, unknown>) => adj.comp_listing_key as string)
          .filter(Boolean);
        let compTagMap: Map<string, Record<string, unknown>> = new Map();
        if (compKeys.length) {
          const { data: compTags } = await sb
            .from("cma_feature_tags")
            .select("*")
            .in("listing_key", compKeys)
            .is("agent_id", null);
          (compTags || []).forEach((t: Record<string, unknown>) => {
            compTagMap.set(t.listing_key as string, t);
          });
        }

        // Fetch primary photo for each comp
        const compPhotoMap: Map<string, string> = new Map();
        if (compKeys.length) {
          const { data: compPhotoRows } = await sb
            .from("mls_media")
            .select("listing_key, media_url, local_url")
            .in("listing_key", compKeys)
            .eq("order", 1);
          (compPhotoRows || []).forEach((p: Record<string, unknown>) => {
            const url = (p.local_url as string) || (p.media_url as string);
            if (url) compPhotoMap.set(p.listing_key as string, url);
          });
        }

        // Fetch public_remarks for comps that don't have it in comp_data
        const compRemarksMap: Map<string, string> = new Map();
        const remarksNeeded = compKeys.filter(k => {
          const adj = (adjustments || []).find((a: Record<string, unknown>) => a.comp_listing_key === k);
          const cd = (adj?.comp_data as Record<string, unknown>) || {};
          return !cd.public_remarks;
        });
        if (remarksNeeded.length) {
          const { data: remarkRows } = await sb
            .from("mls_listings")
            .select("listing_key, public_remarks")
            .in("listing_key", remarksNeeded);
          (remarkRows || []).forEach((r: Record<string, unknown>) => {
            if (r.public_remarks) compRemarksMap.set(r.listing_key as string, r.public_remarks as string);
          });
        }

        // Fetch market stats for context page
        let marketStats: MarketStats | undefined;
        const subjectCounty = (report.subject_data as Record<string, unknown>)?.county_or_parish as string;
        const subjectPropType = (report.subject_data as Record<string, unknown>)?.property_type as string;
        if (subjectCounty && subjectPropType) {
          try {
            const sixMonthsAgo = new Date(Date.now() - 180 * 86400000).toISOString().split("T")[0];
            const twelveMonthsAgo = new Date(Date.now() - 365 * 86400000).toISOString().split("T")[0];

            // Active listings count
            const { count: activeCount } = await sb
              .from("mls_listings")
              .select("*", { count: "exact", head: true })
              .eq("county_or_parish", subjectCounty)
              .eq("property_type", subjectPropType)
              .eq("standard_status", "Active");

            // Sold in last 6 months
            const { data: sold6mo } = await sb
              .from("mls_listings")
              .select("close_price, days_on_market, living_area")
              .eq("county_or_parish", subjectCounty)
              .eq("property_type", subjectPropType)
              .eq("standard_status", "Closed")
              .gte("close_date", sixMonthsAgo)
              .not("close_price", "is", null)
              .order("close_price", { ascending: true });

            // Sold in prior 6 months
            const { data: soldPrior } = await sb
              .from("mls_listings")
              .select("close_price")
              .eq("county_or_parish", subjectCounty)
              .eq("property_type", subjectPropType)
              .eq("standard_status", "Closed")
              .gte("close_date", twelveMonthsAgo)
              .lt("close_date", sixMonthsAgo)
              .not("close_price", "is", null)
              .order("close_price", { ascending: true });

            if (sold6mo && sold6mo.length > 0) {
              const prices = sold6mo.map((r: Record<string, unknown>) => r.close_price as number).filter(Boolean);
              const doms = sold6mo.map((r: Record<string, unknown>) => r.days_on_market as number).filter((d): d is number => d != null);
              const ppsfs = sold6mo
                .filter((r: Record<string, unknown>) => (r.living_area as number) > 0 && (r.close_price as number) > 0)
                .map((r: Record<string, unknown>) => (r.close_price as number) / (r.living_area as number));

              const medianPrice = prices[Math.floor(prices.length / 2)] || 0;
              const medianDom = doms.length ? doms[Math.floor(doms.length / 2)] : 0;
              const avgPpsf = ppsfs.length ? ppsfs.reduce((a, b) => a + b, 0) / ppsfs.length : 0;

              const priorPrices = (soldPrior || []).map((r: Record<string, unknown>) => r.close_price as number).filter(Boolean);
              const medianPriorPrice = priorPrices.length ? priorPrices[Math.floor(priorPrices.length / 2)] : 0;

              const monthlySales = sold6mo.length / 6;
              const monthsInv = (activeCount || 0) > 0 && monthlySales > 0 ? (activeCount || 0) / monthlySales : 0;

              marketStats = {
                active_count: activeCount || 0,
                sold_6mo_count: sold6mo.length,
                sold_prior_6mo_count: (soldPrior || []).length,
                median_sold_price: medianPrice,
                median_sold_price_prior: medianPriorPrice,
                median_dom: medianDom,
                avg_ppsf: avgPpsf,
                months_of_inventory: monthsInv,
                county: subjectCounty,
                property_type: subjectPropType,
              };
            }
          } catch (e) {
            console.error("Market stats query failed:", e);
          }
        }

        // Build report data from DB records
        const subjectListing = { ...(report.subject_data || {} as Record<string, unknown>) } as Record<string, unknown>;
        if (subjectPhotos.length) {
          subjectListing.photos = subjectPhotos;
        }
        reportData = {
          subject: {
            listing: subjectListing,
            features: report.subject_features || null,
          },
          comps: (adjustments || []).map((adj: Record<string, unknown>) => {
            const savedFeats = adj.comp_features as Record<string, unknown> | null;
            const hasFeats = savedFeats && Object.keys(savedFeats).length > 0;
            const feats = hasFeats ? savedFeats : (compTagMap.get(adj.comp_listing_key as string) || null);
            const compListing = { ...((adj.comp_data as Record<string, unknown>) || {}) };
            // Add photo URL and public_remarks
            const ck = adj.comp_listing_key as string;
            if (ck && compPhotoMap.has(ck)) {
              compListing.photo_url = compPhotoMap.get(ck);
            }
            if (ck && !compListing.public_remarks && compRemarksMap.has(ck)) {
              compListing.public_remarks = compRemarksMap.get(ck);
            }
            return {
              listing: compListing,
              features: feats,
              adjustments: {
                adj_living_area: adj.adj_living_area,
                adj_lot_size: adj.adj_lot_size,
                adj_restrictions: adj.adj_restrictions,
                adj_bedrooms: adj.adj_bedrooms,
                adj_bathrooms: adj.adj_bathrooms,
                adj_garage: adj.adj_garage,
                adj_year_built: adj.adj_year_built,
                adj_view: adj.adj_view,
                adj_water_features: adj.adj_water_features,
                adj_land_character: adj.adj_land_character,
                adj_road_noise: adj.adj_road_noise,
                adj_privacy: adj.adj_privacy,
                adj_elevation: adj.adj_elevation,
                adj_condition: adj.adj_condition,
                adj_time: adj.adj_time,
                total_adjustment: adj.total_adjustment,
                adjusted_price: adj.adjusted_price,
              },
            };
          }),
          valuation: {
            suggested_low: report.suggested_low || 0,
            suggested_high: report.suggested_high || 0,
            suggested_price: report.suggested_price || 0,
          },
          ai_summary: report.ai_summary || "",
          agent_recommended_price: report.agent_recommended_price || undefined,
          agent_notes: report.agent_notes || undefined,
          market_stats: marketStats,
          comp_reasoning: (() => {
            const reasons: Record<string, string> = {};
            (adjustments || []).forEach((adj: Record<string, unknown>) => {
              const key = adj.comp_listing_key as string;
              const aiR = adj.ai_reasoning;
              if (key && aiR) {
                if (typeof aiR === "string" && aiR.length > 0) {
                  reasons[key] = aiR;
                } else if (typeof aiR === "object" && (aiR as Record<string, string>).summary) {
                  reasons[key] = (aiR as Record<string, string>).summary;
                }
              }
            });
            return reasons;
          })(),
          report_date: report.report_date,
        };
      } else if (body.report_data) {
        // Use provided data directly
        reportData = body.report_data;
      } else {
        return new Response(
          JSON.stringify({ error: "report_id or report_data required" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const html = generateCMAHtml(reportData);

      // Return HTML directly or as JSON
      if (body.format === "html") {
        return new Response(html, {
          headers: { ...corsHeaders, "Content-Type": "text/html; charset=utf-8" },
        });
      }

      return new Response(
        JSON.stringify({ ok: true, html, length: html.length }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({ error: `Unknown action: ${action}` }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("CMA PDF error:", error);
    return new Response(
      JSON.stringify({ error: "Internal server error", detail: (error as Error).message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
