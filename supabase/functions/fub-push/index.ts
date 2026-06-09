// Lead forwarder — sends each website lead to the CRM.
//
// PRIMARY: AFK Broker (afkbroker.com). Set AFK_BROKER_URL + AFK_BROKER_SECRET to
//   enable. The lead is POSTed to the intake endpoint with an `x-afk-secret`
//   header. This is the new CRM and replaces Follow Up Boss.
// FALLBACK: Follow Up Boss Events API (FUB_API_KEY). Used when AFK is not
//   configured, OR when an AFK send fails — so a lead is never silently lost
//   during the cutover. Remove FUB once AFK is confirmed working.
//
// The function name stays `fub-push` so the website's existing call site
// (app.js _pushToFUB) does not change.
//
// Deploy: supabase functions deploy fub-push
// Invoke: POST /functions/v1/fub-push  { first_name, last_name, email, phone,
//   message, source, external_id, created_at, referrer, channel, landing_page,
//   utm_source, utm_medium, utm_campaign, pages_viewed[], properties_viewed[],
//   journey_summary }
//
// Env vars:
//   AFK_BROKER_URL     — AFK Broker intake URL (e.g. https://afkbroker.com/api/leads/intake)
//   AFK_BROKER_SECRET  — shared secret, sent as the x-afk-secret header
//   FUB_API_KEY        — Follow Up Boss API key (fallback path)

const AFK_URL = Deno.env.get("AFK_BROKER_URL") || "";
const AFK_SECRET = Deno.env.get("AFK_BROKER_SECRET") || "";
const FUB_API_KEY = Deno.env.get("FUB_API_KEY") || "";
const FUB_EVENTS_URL = "https://api.followupboss.com/v1/events";
const SOURCE_SITE = "coryhelpsyoumove.com";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, apikey, x-client-info",
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

// Map our source codes to FUB event types (fallback path only)
function mapSourceToType(source: string): string {
  switch (source) {
    case "chatbot":
      return "General Inquiry";
    case "chatbot_signup":
    case "account_signup":
    case "smart_signup":
    case "smart_signup_mobile":
      return "Registration";
    case "consultation_form":
    case "high_intent":
    case "price_drop":
    case "showing_request":
    case "home_valuation":
      return "Property Inquiry";
    case "reengagement":
      return "Website Activity";
    default:
      if (source && source.indexOf("oauth") === 0) return "Registration";
      return "General Inquiry";
  }
}

type Lead = Record<string, any>;
type SendResult = { ok: boolean; status: number; detail: string };

async function sendToAfk(lead: Lead): Promise<SendResult> {
  const payload = {
    source_site: SOURCE_SITE,
    lead_source: lead.source || "",
    first_name: lead.first_name || "",
    last_name: lead.last_name || "",
    email: lead.email || "",
    phone: lead.phone || "",
    message: lead.message || "",
    external_id: lead.external_id || "",
    created_at: lead.created_at || new Date().toISOString(),
    journey: {
      channel: lead.channel || "",
      referrer: lead.referrer || "",
      landing_page: lead.landing_page || "",
      utm: {
        source: lead.utm_source || "",
        medium: lead.utm_medium || "",
        campaign: lead.utm_campaign || "",
      },
      pages_viewed: lead.pages_viewed || [],
      properties_viewed: lead.properties_viewed || [],
      summary: lead.journey_summary || "",
    },
  };
  try {
    const res = await fetch(AFK_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-afk-secret": AFK_SECRET },
      body: JSON.stringify(payload),
    });
    return { ok: res.ok, status: res.status, detail: await res.text() };
  } catch (err) {
    return { ok: false, status: 0, detail: String(err) };
  }
}

async function sendToFub(lead: Lead): Promise<SendResult> {
  const person: Record<string, unknown> = {};
  if (lead.first_name) person.firstName = lead.first_name;
  if (lead.last_name) person.lastName = lead.last_name;
  if (lead.email) person.emails = [{ value: lead.email }];
  if (lead.phone) person.phones = [{ value: lead.phone }];
  const eventPayload = {
    source: "CoryHelpsYouMove.com",
    system: "CoryHelpsYouMove",
    type: mapSourceToType(lead.source || ""),
    person,
    description: lead.message || "",
  };
  try {
    const res = await fetch(FUB_EVENTS_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Basic " + btoa(FUB_API_KEY + ":"),
      },
      body: JSON.stringify(eventPayload),
    });
    return { ok: res.ok, status: res.status, detail: await res.text() };
  } catch (err) {
    return { ok: false, status: 0, detail: String(err) };
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  let lead: Lead;
  try {
    lead = await req.json();
  } catch {
    return json({ error: "Invalid JSON" }, 400);
  }

  if (!lead.email && !lead.phone) return json({ error: "Email or phone required" }, 400);

  // PRIMARY: AFK Broker (once configured)
  if (AFK_URL) {
    const afk = await sendToAfk(lead);
    if (afk.ok) {
      console.log("[lead-forward] AFK ok:", lead.source || "(none)", lead.email || lead.phone || "");
      return json({ ok: true, via: "afk" });
    }
    console.error("[lead-forward] AFK failed:", afk.status, afk.detail);
    // Fall through to FUB so the lead is not lost during/after cutover
    if (FUB_API_KEY) {
      const fub = await sendToFub(lead);
      if (fub.ok) return json({ ok: true, via: "fub_fallback", afk_status: afk.status });
      return json({ error: "AFK and FUB both failed", afk: afk.status, fub: fub.status }, 502);
    }
    return json({ error: "AFK failed and no FUB fallback configured", afk: afk.status, detail: afk.detail }, 502);
  }

  // No AFK configured yet — use Follow Up Boss
  if (FUB_API_KEY) {
    const fub = await sendToFub(lead);
    if (fub.ok) return json({ ok: true, success: true, via: "fub" });
    return json({ error: "FUB API error", status: fub.status, detail: fub.detail }, 502);
  }

  return json({ error: "No CRM configured (set AFK_BROKER_URL or FUB_API_KEY)" }, 500);
});
