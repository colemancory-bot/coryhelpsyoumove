// Open Graph worker for property listing links.
//
// coryhelpsyoumove.com is a static GitHub Pages SPA. A property page is
// rendered client-side at /?listing=<id-or-slug>, so social scrapers
// (Facebook, iMessage, X, Slack, LinkedIn, ...) that do NOT run JavaScript
// only ever see the homepage's generic Open Graph card. This Worker sits in
// front (via Cloudflare) and, for /?listing= URLs, rewrites the og:/twitter:
// meta tags in the homepage HTML to the specific property's photo, address,
// and price using Cloudflare's HTMLRewriter. Real visitors still get the
// normal SPA; only the meta tags change.
//
// It mirrors the deep-link resolution in app.js (_checkPropDeepLink) and only
// reads listings the public is allowed to see (mlg_can_view = true), so it can
// never expose an IDX-withheld listing.
//
// Cloudflare does not re-invoke a Worker on its own fetch() subrequests, so
// fetch(request) goes straight to the GitHub Pages origin with no loop.
//
// Env (Worker vars / secrets):
//   SUPABASE_URL        https://kzaabnnwjupjqvydiqlz.supabase.co
//   SUPABASE_ANON_KEY   the public anon key (RLS-gated; safe to expose)
//   FALLBACK_IMAGE      optional; default https://coryhelpsyoumove.com/images/hero-bg.jpg

interface Env {
  SUPABASE_URL: string;
  SUPABASE_ANON_KEY: string;
  FALLBACK_IMAGE?: string;
}

const SELECT =
  "select=listing_id,listing_key,list_price,full_address,city,property_sub_type," +
  "bedrooms_total,bathrooms_total_integer,living_area,list_office_name" +
  "&mlg_can_view=eq.true&limit=1";

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const slug = url.searchParams.get("listing");

    // Anything that is not a property deep-link passes straight through.
    if (!slug) return fetch(request);

    const originResp = await fetch(request);
    const ct = originResp.headers.get("content-type") || "";
    if (!ct.includes("text/html")) return originResp;

    let listing: Record<string, unknown> | null = null;
    try {
      listing = await lookupListing(slug, env);
    } catch (_e) {
      listing = null;
    }
    // No match (e.g. listing is not IDX-displayable): keep the generic card.
    if (!listing) return originResp;

    const og = buildOg(listing, slug, env);

    return new HTMLRewriter()
      .on('meta[property="og:title"]', new AttrSetter("content", og.title))
      .on('meta[property="og:description"]', new AttrSetter("content", og.description))
      .on('meta[property="og:image"]', new AttrSetter("content", og.image))
      .on('meta[property="og:url"]', new AttrSetter("content", og.url))
      .on('meta[name="twitter:title"]', new AttrSetter("content", og.title))
      .on('meta[name="twitter:description"]', new AttrSetter("content", og.description))
      .on('meta[name="twitter:image"]', new AttrSetter("content", og.image))
      .on("title", new TextSetter(og.title))
      .transform(originResp);
  },
};

async function lookupListing(slug: string, env: Env): Promise<Record<string, unknown> | null> {
  const root = env.SUPABASE_URL.replace(/\/+$/, "");
  const headers = {
    apikey: env.SUPABASE_ANON_KEY,
    Authorization: "Bearer " + env.SUPABASE_ANON_KEY,
  };

  let query: string;
  // An MLS id is any run of letters and digits with no separators; an address
  // slug always contains dashes. The old test was /^[A-Z]{2,4}\d+$/i, which
  // matched Canopy's CAR4363291 but NOT the 2,711 CSAR ids, every one of which
  // is pure digits (26048301), nor the 44 Canopy ids shaped like CARNCM576730.
  // Those fell through to the slug branch, failed its words.length < 2 guard,
  // and every CSAR share link fell back to the generic site card.
  if (/^[A-Za-z0-9]+$/.test(slug)) {
    // MLS-id form, e.g. CAR4363291 or 26048301
    query = root + "/rest/v1/mls_listings?listing_id=eq." + encodeURIComponent(slug) + "&" + SELECT;
  } else {
    // Address-slug form, e.g. 14-winter-woods-drive-asheville-nc
    const words = slug.replace(/-nc$/, "").split("-").filter((w) => w.length > 1);
    if (words.length < 2) return null;
    const addrPat = "%" + words.slice(0, -1).join("%") + "%";
    const cityPat = "%" + words[words.length - 1] + "%";
    query =
      root + "/rest/v1/mls_listings?full_address=ilike." + encodeURIComponent(addrPat) +
      "&city=ilike." + encodeURIComponent(cityPat) + "&" + SELECT;
  }

  const res = await fetch(query, { headers });
  if (!res.ok) return null;
  const rows = (await res.json()) as Record<string, unknown>[];
  if (!rows.length) return null;
  const lst = rows[0];

  // Primary photo. Prefer the permanent R2 copy (local_url), then fall back to a
  // CDN media_url (e.g. CSAR / CloudFront listings not stored in R2), but skip
  // MLS Grid signed URLs since those expire in ~24h and would break the card.
  // ("order" is reserved in PostgREST, so sort BY it, not filter order=eq.0.)
  try {
    const mres = await fetch(
      root + "/rest/v1/mls_media?listing_key=eq." + encodeURIComponent(String(lst.listing_key)) +
        "&select=local_url,media_url&order=order.asc&limit=8",
      { headers }
    );
    if (mres.ok) {
      const m = (await mres.json()) as { local_url?: string; media_url?: string }[];
      for (const row of m) {
        const photo = row.local_url ||
          (row.media_url && !String(row.media_url).includes("mlsgrid") ? row.media_url : "");
        if (photo) { lst._photo = photo; break; }
      }
    }
  } catch (_e) {
    /* photo is optional */
  }
  return lst;
}

function buildOg(l: Record<string, any>, slug: string, env: Env) {
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

  const image = l._photo || env.FALLBACK_IMAGE || "https://coryhelpsyoumove.com/images/hero-bg.jpg";

  return {
    title,
    description: desc,
    image,
    url: "https://coryhelpsyoumove.com/?listing=" + encodeURIComponent(slug),
  };
}

class AttrSetter {
  constructor(private attr: string, private value: string) {}
  element(el: Element) {
    el.setAttribute(this.attr, this.value);
  }
}

class TextSetter {
  constructor(private value: string) {}
  element(el: Element) {
    el.setInnerContent(this.value);
  }
}
