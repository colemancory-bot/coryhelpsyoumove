// Favorite Notify — alerts Cory the moment a signed-in visitor saves a property.
//
// Saving a property is the strongest buying signal the site produces short of a
// form submission: it requires an account, and it names a specific house. Until
// now nothing happened when one landed. Two people had saved four properties
// between them and Cory was never told about any of them.
//
// Two channels, because Cory asked for both text and email and there is no SMS
// provider on this project:
//   email — Resend, same sender as admin-notify
//   text  — pushed to AFK Broker (the CRM), which texts and emails Cory on
//           intake. That is the only SMS path that exists today.
//
// Called by the `favorites_notify_on_insert` trigger via pg_net, so it fires on
// the database write and does not depend on the browser staying open.
//
// Deploy: supabase functions deploy favorite-notify --no-verify-jwt
// Invoke: POST /functions/v1/favorite-notify
//   { user_id, property_key }                 — one save (the trigger sends this)
//   { user_id, property_key, backfill: true } — same, subject marked catch-up
//
// Env vars:
//   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
//   RESEND_API_KEY, ADMIN_NOTIFY_FROM, ADMIN_NOTIFY_TO, ADMIN_NOTIFY_SECRET
//   AFK_BROKER_URL, AFK_BROKER_SECRET

const SB_URL = Deno.env.get("SUPABASE_URL") || "";
const SB_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY") || "";
const FROM = Deno.env.get("ADMIN_NOTIFY_FROM") || "Cory Automation <notify@coryhelpsyoumove.com>";
const TO = Deno.env.get("ADMIN_NOTIFY_TO") || "coryhelpsyoumove@gmail.com";
// Dedicated to this function so the trigger's copy of the secret can live in a
// database setting without having to recover the existing ADMIN_NOTIFY_SECRET,
// whose plaintext is not readable back out of Supabase.
const SECRET = Deno.env.get("FAVORITE_NOTIFY_SECRET") || Deno.env.get("ADMIN_NOTIFY_SECRET") || "";
const AFK_URL = Deno.env.get("AFK_BROKER_URL") || "";
const AFK_SECRET = Deno.env.get("AFK_BROKER_SECRET") || "";

const SITE = "https://coryhelpsyoumove.com";

const cors: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, x-admin-secret",
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });
}

const ESCAPES: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
};

function esc(s: unknown): string {
  return String(s ?? "").replace(/[&<>"']/g, (c) => ESCAPES[c]);
}

function money(n: unknown): string {
  const v = Number(n);
  return Number.isFinite(v) && v > 0 ? "$" + v.toLocaleString("en-US") : "Price n/a";
}

async function sb(path: string): Promise<any[]> {
  const res = await fetch(SB_URL + "/rest/v1/" + path, {
    headers: { apikey: SB_KEY, Authorization: "Bearer " + SB_KEY },
  }).catch(() => null);
  if (!res || !res.ok) return [];
  const out = await res.json().catch(() => []);
  return Array.isArray(out) ? out : [];
}

// favorites.property_key is "<lower full_address>|<lower city>", not a listing
// key, so the listing has to be matched on the composed address rather than
// joined on an id.
async function findListing(propertyKey: string): Promise<any | null> {
  const key = (propertyKey || "").trim().toLowerCase();
  const sep = key.lastIndexOf("|");
  if (sep < 0) return null;
  const addr = key.slice(0, sep);
  const city = key.slice(sep + 1);
  if (!addr || !city) return null;
  const cols =
    "listing_id,listing_key,full_address,city,list_price,standard_status,is_winner," +
    "bedrooms_total,bathrooms_total_integer,living_area,lot_size_acres";
  const rows = await sb(
    "mls_listings?select=" + cols +
      "&city=ilike." + encodeURIComponent(city) +
      "&full_address=ilike." + encodeURIComponent(addr) +
      "&limit=5"
  );
  if (!rows.length) return null;
  return rows.find((r) => r.is_winner) || rows[0];
}

function listingUrl(l: any): string {
  return l && l.listing_id ? SITE + "/?listing=" + encodeURIComponent(l.listing_id) : SITE;
}

async function notify(
  userId: string,
  propertyKey: string,
  backfill: boolean
): Promise<Record<string, unknown>> {
  // --- who saved it ------------------------------------------------------
  const authRes = await fetch(SB_URL + "/auth/v1/admin/users/" + userId, {
    headers: { apikey: SB_KEY, Authorization: "Bearer " + SB_KEY },
  }).catch(() => null);
  const authUser = authRes && authRes.ok ? await authRes.json().catch(() => ({})) : {};
  const email: string = (authUser && authUser.email) || "";
  const meta = (authUser && authUser.user_metadata) || {};

  const profileRows = await sb(
    "profiles?select=first_name,last_name,phone&id=eq." + userId + "&limit=1"
  );
  const prof = profileRows[0] || {};

  // Fall through every place a name or phone could have been captured. Accounts
  // created before the 2026-08-23 signup fix have no profile row at all.
  let name = [prof.first_name, prof.last_name].filter(Boolean).join(" ").trim();
  if (!name) name = String(meta.full_name || meta.name || "").trim();
  let phone = String(prof.phone || meta.phone || "").trim();

  if ((!name || !phone) && email) {
    const leadRows = await sb(
      "leads?select=first_name,last_name,phone&email=eq." + encodeURIComponent(email) +
        "&order=created_at.desc&limit=1"
    );
    const lead = leadRows[0] || {};
    if (!name) name = [lead.first_name, lead.last_name].filter(Boolean).join(" ").trim();
    if (!phone) phone = String(lead.phone || "").trim();
  }

  // --- what they saved, and what else is on their list -------------------
  const listing = await findListing(propertyKey);
  const allFavs = await sb(
    "favorites?select=property_key,created_at&user_id=eq." + userId +
      "&order=created_at.desc&limit=25"
  );

  const others: Array<{ fav: any; listing: any }> = [];
  for (const f of allFavs) {
    if (f.property_key === propertyKey) continue;
    others.push({ fav: f, listing: await findListing(f.property_key) });
  }

  const headline = listing
    ? listing.full_address + ", " + listing.city + " (" + money(listing.list_price) + ")"
    : propertyKey;
  const who = name || email || "Unknown visitor";
  const subject = (backfill ? "[catch-up] " : "") + who + " saved " + headline;

  // --- email -------------------------------------------------------------
  const specs: string[] = [];
  if (listing && listing.bedrooms_total) specs.push(listing.bedrooms_total + " bd");
  if (listing && listing.bathrooms_total_integer) specs.push(listing.bathrooms_total_integer + " ba");
  if (listing && listing.living_area) {
    specs.push(Number(listing.living_area).toLocaleString("en-US") + " sqft");
  }
  if (listing && listing.lot_size_acres) specs.push(listing.lot_size_acres + " ac");

  const missing = '<em style="color:#999">not on file</em>';
  const contactRows =
    '<tr><td style="padding:4px 14px 4px 0;color:#666">Email</td><td>' +
      (email ? '<a href="mailto:' + esc(email) + '">' + esc(email) + "</a>" : missing) +
      "</td></tr>" +
    '<tr><td style="padding:4px 14px 4px 0;color:#666">Name</td><td>' +
      (name ? esc(name) : missing) + "</td></tr>" +
    '<tr><td style="padding:4px 14px 4px 0;color:#666">Phone</td><td>' +
      (phone ? '<a href="tel:' + esc(phone) + '">' + esc(phone) + "</a>" : missing) +
      "</td></tr>";

  const othersHtml = others.length
    ? '<h3 style="font-size:15px;margin:24px 0 8px">Also on their list (' + others.length + ")</h3>" +
      '<ul style="padding-left:18px;margin:0;font-size:14px">' +
      others
        .map((o) => {
          const label = o.listing
            ? o.listing.full_address + ", " + o.listing.city
            : o.fav.property_key;
          const price = o.listing ? " &mdash; " + money(o.listing.list_price) : "";
          const when = String(o.fav.created_at || "").slice(0, 10);
          return '<li style="margin-bottom:6px"><a href="' + listingUrl(o.listing) + '">' +
            esc(label) + "</a>" + price +
            ' <span style="color:#999">(' + esc(when) + ")</span></li>";
        })
        .join("") +
      "</ul>"
    : "";

  const html =
    '<div style="font-family:-apple-system,Segoe UI,Helvetica,Arial,sans-serif;max-width:600px;color:#1a1815">' +
    '<p style="font-size:12px;color:#8B7748;text-transform:uppercase;letter-spacing:1.5px;margin:0 0 6px">Property saved</p>' +
    '<h2 style="margin:0 0 16px;font-size:20px;font-weight:600">' + esc(who) + " saved a property</h2>" +
    '<table style="font-size:14px;border-collapse:collapse;margin-bottom:20px">' + contactRows + "</table>" +
    '<div style="border:1px solid #e5e0d8;border-radius:8px;padding:16px">' +
      '<a href="' + listingUrl(listing) + '" style="font-size:16px;font-weight:600;color:#8B7748;text-decoration:none">' +
      esc(listing ? listing.full_address + ", " + listing.city : propertyKey) + "</a>" +
      '<p style="margin:6px 0 0;font-size:15px"><strong>' + money(listing && listing.list_price) + "</strong>" +
      (specs.length ? ' &middot; <span style="color:#666">' + esc(specs.join(" · ")) + "</span>" : "") +
      "</p>" +
      (listing && listing.listing_id
        ? '<p style="margin:4px 0 0;font-size:12px;color:#999">MLS# ' + esc(listing.listing_id) +
          " &middot; " + esc(listing.standard_status) + "</p>"
        : "") +
    "</div>" +
    othersHtml +
    '<p style="margin-top:24px;font-size:12px;color:#999">Sent by coryhelpsyoumove.com when a signed-in visitor saves a property.</p>' +
    "</div>";

  const results: Record<string, unknown> = {};

  if (RESEND_API_KEY) {
    const payload: Record<string, unknown> = { from: FROM, to: [TO], subject, html };
    if (email) payload.reply_to = email;
    const r = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: "Bearer " + RESEND_API_KEY },
      body: JSON.stringify(payload),
    }).catch(() => null);
    results.email = r ? r.status : "request failed";
  } else {
    results.email = "skipped: no RESEND_API_KEY";
  }

  // --- text, by way of the CRM -------------------------------------------
  // AFK Broker texts and emails Cory on intake, so this is the SMS path. The
  // payload carries the same email every time, so AFK threads repeat saves onto
  // the existing contact instead of inventing a new person per save.
  if (AFK_URL && AFK_SECRET) {
    const total = others.length + 1;
    const summary =
      "Saved " + headline +
      (total > 1 ? " (" + total + " saved total)" : "") +
      ". " + listingUrl(listing);
    const firstName = (name.split(" ")[0] || email.split("@")[0] || "Website").slice(0, 60);
    const r = await fetch(AFK_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-afk-secret": AFK_SECRET },
      body: JSON.stringify({
        source_site: "coryhelpsyoumove.com",
        lead_source: "property_saved",
        first_name: firstName,
        last_name: name.split(" ").slice(1).join(" "),
        email,
        phone,
        message: summary,
        external_id: ("fav:" + userId + ":" + propertyKey).slice(0, 120),
        created_at: new Date().toISOString(),
      }),
    }).catch(() => null);
    results.afk = r ? r.status : "request failed";
  } else {
    results.afk = "skipped: AFK not configured";
  }

  return { who, headline, ...results };
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405, headers: cors });

  if (!SECRET || (req.headers.get("x-admin-secret") || "") !== SECRET) {
    return json({ error: "unauthorized" }, 401);
  }

  let body: { user_id?: string; property_key?: string; backfill?: boolean; wait?: boolean };
  try {
    body = await req.json();
  } catch {
    return json({ error: "invalid json" }, 400);
  }
  const userId = body.user_id || "";
  const propertyKey = body.property_key || "";
  if (!userId || !propertyKey) return json({ error: "user_id and property_key required" }, 400);

  const work = notify(userId, propertyKey, !!body.backfill);

  // pg_net gives up after 5 seconds, and gathering the listing, the visitor's
  // other saves, then calling Resend and AFK reliably takes longer than that.
  // Acknowledge immediately and finish in the background so the trigger records
  // a real status instead of a timeout. Pass wait:true to block for the result,
  // which is what manual calls and backfills want.
  if (body.wait) {
    const result = await work.catch((e) => ({ error: String(e) }));
    return json({ ok: true, ...result });
  }

  work.catch((e) => console.error("[favorite-notify] failed:", e));
  if (typeof (globalThis as any).EdgeRuntime?.waitUntil === "function") {
    (globalThis as any).EdgeRuntime.waitUntil(work);
  }
  return json({ ok: true, queued: true }, 202);
});
