// Follow Up Boss — Lead Push Edge Function
// Pushes new leads to FUB via the Events API
//
// Deploy: supabase functions deploy fub-push
// Invoke: POST /functions/v1/fub-push { first_name, last_name, email, phone, message, source }
//
// Env vars required:
//   FUB_API_KEY — Follow Up Boss API key (Admin → API → cory-site)

const FUB_API_KEY = Deno.env.get("FUB_API_KEY") || "";
const FUB_EVENTS_URL = "https://api.followupboss.com/v1/events";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, apikey, x-client-info",
};

// Map our source codes to FUB event types
function mapSourceToType(source: string): string {
  switch (source) {
    case "chatbot":
      return "General Inquiry";
    case "chatbot_signup":
    case "account_signup":
      return "Registration";
    case "consultation_form":
    case "high_intent":
    case "price_drop":
    case "showing_request":
      return "Property Inquiry";
    case "reengagement":
      return "Website Activity";
    default:
      return "General Inquiry";
  }
}

Deno.serve(async (req: Request) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  if (!FUB_API_KEY) {
    console.error("[fub-push] FUB_API_KEY not set");
    return new Response(JSON.stringify({ error: "FUB API key not configured" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const body = await req.json();
    const { first_name, last_name, email, phone, message, source } = body;

    if (!email && !phone) {
      return new Response(JSON.stringify({ error: "Email or phone required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Build FUB event payload
    const person: Record<string, unknown> = {};
    if (first_name) person.firstName = first_name;
    if (last_name) person.lastName = last_name;
    if (email) person.emails = [{ value: email }];
    if (phone) person.phones = [{ value: phone }];

    const eventPayload = {
      source: "CoryHelpsYouMove.com",
      system: "CoryHelpsYouMove",
      type: mapSourceToType(source || ""),
      person,
      description: message || "",
    };

    console.log("[fub-push] Sending event to FUB:", JSON.stringify({
      type: eventPayload.type,
      email: email || "(none)",
      source: source || "(none)",
    }));

    // POST to FUB Events API with Basic Auth (API key as username, blank password)
    const authHeader = "Basic " + btoa(FUB_API_KEY + ":");
    const fubRes = await fetch(FUB_EVENTS_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: authHeader,
      },
      body: JSON.stringify(eventPayload),
    });

    const fubData = await fubRes.text();
    console.log("[fub-push] FUB response:", fubRes.status, fubData);

    if (!fubRes.ok) {
      return new Response(JSON.stringify({
        error: "FUB API error",
        status: fubRes.status,
        detail: fubData,
      }), {
        status: 502,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("[fub-push] Error:", err);
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
