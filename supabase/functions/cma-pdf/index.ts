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
}

function generateCMAHtml(data: ReportInput): string {
  const sub = data.subject.listing;
  const comps = data.comps;
  const val = data.valuation;
  const reportDate = data.report_date || new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
  const isLand = (sub.property_type as string || "").toLowerCase() === "land";
  const numComps = comps.length;
  const colSpan = numComps + 2; // Feature col + Subject col + comp cols

  // Build comp header cells
  const compHeaders = comps.map((c, i) => {
    const addr = (c.listing.full_address as string || "Unknown").replace(/,.*/, "");
    return `<th class="comp-col">Comp ${i + 1}<br><span style="font-size:0.45rem;font-weight:400;">${addr}</span></th>`;
  }).join("\n        ");

  // Helper to build a data row
  function dataRow(label: string, subjectVal: string, compVals: string[]): string {
    const tds = compVals.map(v => `<td>${v}</td>`).join("");
    return `<tr><td>${label}</td><td class="subject-val">${subjectVal}</td>${tds}</tr>`;
  }

  // Helper to build an adjustment row
  function adjRow(label: string, adjKey: string): string {
    const tds = comps.map(c => {
      const v = (c.adjustments as Record<string, number>)[adjKey] || 0;
      return `<td class="${adjClass(v)}">${adjVal(v)}</td>`;
    }).join("");
    return `<tr><td style="padding-left:0.8rem;color:var(--text-secondary);font-size:0.55rem;">${label}</td><td class="subject-val"></td>${tds}</tr>`;
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
  gridRows += adjRow(isLand ? "Adj @ $20K/ac" : "Adj @ $15K/ac", "adj_lot_size");

  if (!isLand) {
    // Age & Condition section
    gridRows += `<tr class="section-row"><td colspan="${colSpan}">Age &amp; Condition</td></tr>\n`;
    gridRows += dataRow("Year Built", String(sub.year_built || "\u2014"), comps.map(c => String(c.listing.year_built || "\u2014")));
    gridRows += adjRow("Adj @ $500/yr", "adj_year_built");
    gridRows += dataRow("Garage Spaces", String((sub.garage_spaces as number) || 0), comps.map(c => String((c.listing.garage_spaces as number) || 0)));
    gridRows += adjRow("Adj @ $8K/space", "adj_garage");
  }

  // Mountain Features section
  gridRows += `<tr class="section-row"><td colspan="${colSpan}">Mountain Features</td></tr>\n`;

  // View
  const subFeats = data.subject.features || {};
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
  .valuation-range { font-family: 'Cormorant Garamond', Georgia, serif; font-size: 1.6rem; font-weight: 700; color: var(--green); margin-bottom: 0.15rem; }
  .valuation-note { font-size: 0.65rem; color: var(--text-secondary); }
  .methodology { font-size: 0.65rem; color: var(--text-muted); line-height: 1.6; margin-top: 0.6rem; }
  .methodology p { margin-bottom: 0.3rem; }
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
      <div class="cover-value">${fmt(val.suggested_low)} &ndash; ${fmt(val.suggested_high)}</div>
    </div>
    <div class="cover-date">Prepared ${reportDate}</div>
    <div class="cover-divider"></div>
    <div class="cover-agent-name">${AGENT.name}</div>
    <div class="cover-agent-title">${AGENT.title} &nbsp;|&nbsp; ${AGENT.company}</div>
    <div class="cover-agent-contact">${AGENT.phone}<br>${AGENT.email}<br>${AGENT.website}</div>
    <div class="cover-footer">Equal Housing Opportunity &nbsp;&bull;&nbsp; ${AGENT.office}</div>
  </div>
</div>

<!-- PAGE 2: SUBJECT PROPERTY -->
<div class="page">
  <div class="subject-header">
    <div class="section-label">Subject Property</div>
    <h2 class="subject-address">${sub.full_address || ""}</h2>
    <div class="subject-city">${sub.city || ""}, NC ${sub.postal_code || ""} &nbsp;&bull;&nbsp; ${sub.county_or_parish || ""} County</div>
  </div>
  <hr class="gold-rule-wide">
  <div class="facts-grid">
    <div class="facts-col" style="border-right: 1px solid var(--border);">
      ${!isLand ? `<div class="fact-row"><span class="fact-label">Bedrooms</span><span class="fact-value">${sub.bedrooms_total || "\u2014"}</span></div>
      <div class="fact-row"><span class="fact-label">Bathrooms</span><span class="fact-value">${sub.bathrooms_total_integer || "\u2014"}</span></div>
      <div class="fact-row"><span class="fact-label">Living Area</span><span class="fact-value">${fmtNum(sub.living_area as number)} sqft</span></div>` : ""}
      <div class="fact-row"><span class="fact-label">Lot Size</span><span class="fact-value">${sub.lot_size_acres || "\u2014"} acres</span></div>
      ${!isLand ? `<div class="fact-row"><span class="fact-label">Year Built</span><span class="fact-value">${sub.year_built || "\u2014"}</span></div>
      <div class="fact-row"><span class="fact-label">Garage</span><span class="fact-value">${(sub.garage_spaces as number) || 0} spaces</span></div>` : ""}
    </div>
    <div class="facts-col">
      <div class="fact-row"><span class="fact-label">Property Type</span><span class="fact-value">${sub.property_type || ""}</span></div>
      <div class="fact-row"><span class="fact-label">Subtype</span><span class="fact-value">${sub.property_sub_type || "\u2014"}</span></div>
      ${subFeats.construction_type && subFeats.construction_type !== "unknown" && subFeats.construction_type !== "site_built" ? `<div class="fact-row"><span class="fact-label">Construction</span><span class="fact-value" style="text-transform:capitalize">${(subFeats.construction_type as string || "").replace(/_/g, " ")}</span></div>` : ""}
      <div class="fact-row"><span class="fact-label">County</span><span class="fact-value">${sub.county_or_parish || ""}</span></div>
      ${sub.list_price ? `<div class="fact-row"><span class="fact-label">List Price</span><span class="fact-value">${fmt(sub.list_price as number)}</span></div>` : ""}
    </div>
  </div>
  ${aiSection}
</div>

<!-- PAGE 3: PROPERTY PHOTOS (only if photos available) -->
${(() => {
  const photos = (sub.photos as string[]) || [];
  const photoUrl = sub.photo_url as string || "";
  const allPhotos = photos.length ? photos : (photoUrl ? [photoUrl] : []);
  if (allPhotos.length === 0) return "";
  const heroPhoto = allPhotos[0];
  const smallPhotos = allPhotos.slice(1, 7);
  return `<div class="page">
  <div class="subject-header">
    <div class="section-label">Property Photos</div>
    <h2 style="font-size: 1.2rem; margin-top: 0.2rem;">${sub.full_address || ""}</h2>
  </div>
  <hr class="gold-rule-wide">
  <div class="photo-grid">
    <div class="hero"><img src="${heroPhoto}" alt="Primary property photo"></div>
    ${smallPhotos.map((p: string) => `<div class="small"><img src="${p}" alt="Property photo"></div>`).join("\n    ")}
  </div>
  <div class="photo-note">Photos from MLS listing. Contact agent for current property photos.</div>
</div>`;
})()}

<!-- PAGE 4: COMPARABLE SALES ACTIVITY -->
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
        <td>${sub.list_price ? fmt(sub.list_price as number) : "\u2014"}</td>
        ${!isLand ? `<td>${sub.bedrooms_total || "?"} / ${sub.bathrooms_total_integer || "?"}</td><td>${fmtNum(sub.living_area as number)}</td>` : ""}
        <td>${sub.lot_size_acres || "\u2014"}</td>
        ${!isLand ? `<td>${sub.year_built || "\u2014"}</td>` : ""}
        <td>\u2014</td>
      </tr>
      ${comps.map((c, i) => {
        const cl = c.listing;
        return `<tr>
        <td>${((cl.full_address as string) || "").replace(/,.*/, "")}<br><span style="font-size:0.55rem;color:var(--text-muted);">Comp ${i + 1}${cl.distance ? " \u2022 " + cl.distance + " mi" : ""}</span></td>
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
    <div class="valuation-range">${fmt(val.suggested_low)} &ndash; ${fmt(val.suggested_high)}</div>
    <div class="valuation-note">Based on ${numComps} comparable ${isLand ? "land" : ""} sales analysis</div>
  </div>

  <div class="methodology">
    <p><strong>Methodology:</strong> ${methodNote}</p>
  </div>

  <div class="disclaimers">
    <p class="eho">Equal Housing Opportunity</p>
    <p>This CMA is not an appraisal and should not be considered as one. It is an estimate of market value based on comparable sales data and the agent's knowledge of local market conditions.</p>
    <p>Information is believed to be accurate but is not guaranteed. Buyers and sellers should verify all information independently.</p>
    <p style="margin-top: 0.3rem;">Prepared by ${AGENT.name}, ${AGENT.title} | ${AGENT.company} | ${AGENT.phone}</p>
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

        // Build report data from DB records
        reportData = {
          subject: {
            listing: report.subject_data || {},
            features: report.subject_features || null,
          },
          comps: (adjustments || []).map((adj: Record<string, unknown>) => ({
            listing: (adj.comp_data as Record<string, unknown>) || {},
            features: (adj.comp_features as Record<string, unknown>) || null,
            adjustments: {
              adj_living_area: adj.adj_living_area,
              adj_lot_size: adj.adj_lot_size,
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
          })),
          valuation: {
            suggested_low: report.suggested_low || 0,
            suggested_high: report.suggested_high || 0,
            suggested_price: report.suggested_price || 0,
          },
          ai_summary: report.ai_summary || "",
          comp_reasoning: (() => {
            // Build comp reasoning from per-adjustment ai_reasoning
            const reasons: Record<string, string> = {};
            (adjustments || []).forEach((adj: Record<string, unknown>) => {
              const key = adj.comp_listing_key as string;
              const aiR = adj.ai_reasoning as Record<string, string> | null;
              if (key && aiR && aiR.summary) reasons[key] = aiR.summary;
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
