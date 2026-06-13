// Lead forwarder — sends each website lead to the CRM (AFK Broker).
//
// AFK Broker (afkbroker.com) is Cory's CRM. The lead is POSTed to the intake
// endpoint with an `x-afk-secret` header. Follow Up Boss has been REMOVED
// (subscription ended 2026-06-15) — AFK Broker is now the only destination.
//
// The function name stays `fub-push` so the website's existing call sites
// (app.js `_pushToFUB` and the home-valuation page) do not change.
//
// The website also inserts every lead into its own Supabase `leads` table
// independently, so a transient AFK failure here does not lose the lead.
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

const AFK_URL = Deno.env.get("AFK_BROKER_URL") || "";
const AFK_SECRET = Deno.env.get("AFK_BROKER_SECRET") || "";
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

  if (!AFK_URL) {
    console.error("[lead-forward] AFK_BROKER_URL not set — lead NOT forwarded:", lead.email || lead.phone || "");
    return json({ error: "AFK Broker not configured (set AFK_BROKER_URL)" }, 500);
  }

  const afk = await sendToAfk(lead);
  if (afk.ok) {
    console.log("[lead-forward] AFK ok:", lead.source || "(none)", lead.email || lead.phone || "");
    return json({ ok: true, via: "afk" });
  }
  console.error("[lead-forward] AFK failed:", afk.status, afk.detail);
  return json({ error: "AFK forward failed", status: afk.status, detail: afk.detail }, 502);
});
