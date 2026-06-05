// listing-share — Open Graph card endpoint for property links.
//
// coryhelpsyoumove.com is a static GitHub Pages SPA, so a property page
// (/?listing=...) is rendered by JavaScript. Social scrapers (Facebook,
// iMessage, X, Slack, LinkedIn, ...) do NOT run JavaScript, so a shared
// property link only ever shows the generic homepage card. The site's Share
// button points here instead. This function returns HTML carrying that
// property's Open Graph tags (photo, address, price) for scrapers, and
// instantly redirects real visitors on to the live listing page.
//
// Deploy:  supabase functions deploy listing-share --no-verify-jwt
//   (--no-verify-jwt makes it public; scrapers can't send an auth token. It
//    only reads IDX-displayable listings, mlg_can_view = true, so nothing
//    private can leak.)
// URL:     /functions/v1/listing-share?id=<listing-id-or-address-slug>
//
// SUPABASE_URL and SUPABASE_ANON_KEY are auto-injected into edge functions.

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
const ANON = Deno.env.get("SUPABASE_ANON_KEY") || "";
const SITE = "https://coryhelpsyoumove.com";
const FALLBACK_IMAGE = SITE + "/images/hero-bg.jpg";

const SELECT =
  "select=listing_id,listing_key,list_price,full_address,city,property_sub_type," +
  "bedrooms_total,bathrooms_total_integer,living_area,list_office_name" +
  "&mlg_can_view=eq.true&limit=1";

Deno.serve(async (req: Request) => {
  const url = new URL(req.url);
  const id = url.searchParams.get("id") || url.searchParams.get("listing") || "";
  const dest = SITE + "/?listing=" + encodeURIComponent(id); // where humans land
  // Canonical = the public function URL (the shared link). req.url cannot be
  // used: Supabase strips the /functions/v1/ prefix and presents http internally.
  const selfUrl = SUPABASE_URL + "/functions/v1/listing-share?id=" + encodeURIComponent(id);

  let og = {
    title: "Western NC Real Estate | Cory Coleman",
    description:
      "Mountain homes, cabins, and land across Western North Carolina with Keller Williams Great Smokies.",
    image: FALLBACK_IMAGE,
  };

  if (id) {
    try {
      const listing = await lookup(id);
      if (listing) og = buildOg(listing);
    } catch (_e) {
      /* fall back to the generic card */
    }
  }

  return new Response(renderHtml(og, dest, selfUrl), {
    headers: {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "public, max-age=300",
    },
  });
});

async function lookup(id: string): Promise<Record<string, unknown> | null> {
  const headers = { apikey: ANON, Authorization: "Bearer " + ANON };
  let q: string;
  if (/^[A-Z]{2,4}\d+$/i.test(id)) {
    // MLS-id form, e.g. CAR4354146
    q = SUPABASE_URL + "/rest/v1/mls_listings?listing_id=eq." + encodeURIComponent(id) + "&" + SELECT;
  } else {
    // Address-slug form, e.g. 72-summer-shade-court-hendersonville-nc
    const words = id.replace(/-nc$/, "").split("-").filter((w) => w.length > 1);
    if (words.length < 2) return null;
    const addr = "%" + words.slice(0, -1).join("%") + "%";
    const city = "%" + words[words.length - 1] + "%";
    q = SUPABASE_URL + "/rest/v1/mls_listings?full_address=ilike." + encodeURIComponent(addr) +
        "&city=ilike." + encodeURIComponent(city) + "&" + SELECT;
  }

  const res = await fetch(q, { headers });
  if (!res.ok) return null;
  const rows = (await res.json()) as Record<string, unknown>[];
  if (!rows.length) return null;
  const l = rows[0];

  // Primary photo: lowest-order R2 (permanent) image. NOTE: "order" is a
  // reserved word in PostgREST, so sort BY it (order=order.asc) instead of
  // trying to filter order=eq.0, which the REST API rejects.
  try {
    const mres = await fetch(
      SUPABASE_URL + "/rest/v1/mls_media?listing_key=eq." + encodeURIComponent(String(l.listing_key)) +
        "&local_url=not.is.null&select=local_url&order=order.asc&limit=1",
      { headers }
    );
    if (mres.ok) {
      const m = (await mres.json()) as { local_url?: string }[];
      if (m.length && m[0].local_url) (l as Record<string, unknown>)._photo = m[0].local_url;
    }
  } catch (_e) {
    /* photo is optional */
  }
  return l;
}

function buildOg(l: Record<string, any>) {
  const price = l.list_price ? "$" + Number(l.list_price).toLocaleString("en-US") : "";
  const addr = String(l.full_address || "").trim();
  const title = [addr, price].filter(Boolean).join(" · ") || "Western NC Property";

  const bits: string[] = [];
  if (l.bedrooms_total) bits.push(l.bedrooms_total + " bd");
  if (l.bathrooms_total_integer) bits.push(l.bathrooms_total_integer + " ba");
  if (l.living_area) bits.push(Number(l.living_area).toLocaleString("en-US") + " sqft");
  let desc = bits.join(" · ");
  if (l.city) desc += (desc ? " in " : "") + l.city + ", NC";
  if (l.property_sub_type) desc = l.property_sub_type + (desc ? ". " + desc : "");
  if (l.list_office_name) desc += ". Listed by " + l.list_office_name + ".";
  desc = desc.trim() || "Western North Carolina real estate with Cory Coleman.";

  return { title, description: desc, image: l._photo || FALLBACK_IMAGE };
}

function esc(s: string): string {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function renderHtml(
  og: { title: string; description: string; image: string },
  dest: string,
  selfUrl: string
): string {
  const t = esc(og.title), de = esc(og.description), im = esc(og.image);
  const d = esc(dest), self = esc(selfUrl);
  return `<!DOCTYPE html><html lang="en"><head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${t}</title>
<meta property="og:type" content="website">
<meta property="og:title" content="${t}">
<meta property="og:description" content="${de}">
<meta property="og:image" content="${im}">
<meta property="og:url" content="${self}">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${t}">
<meta name="twitter:description" content="${de}">
<meta name="twitter:image" content="${im}">
<meta http-equiv="refresh" content="0; url=${d}">
<script>location.replace(${JSON.stringify(dest)});</script>
<style>body{font-family:system-ui,-apple-system,sans-serif;background:#0C0B09;color:#F5F0E8;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0;text-align:center}a{color:#C4B08C}</style>
</head><body>
<p>Taking you to the listing. <a href="${d}">Tap here if it does not load.</a></p>
</body></html>`;
}
