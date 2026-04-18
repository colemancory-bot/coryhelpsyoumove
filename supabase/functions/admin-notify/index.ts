// Admin Notify — shared-secret-protected email proxy for internal automation.
//
// Deploy: supabase functions deploy admin-notify
// Invoke: POST /functions/v1/admin-notify
//
// Env vars required:
//   RESEND_API_KEY          — Resend email API key
//   ADMIN_NOTIFY_SECRET     — shared secret required in x-admin-secret header
//   ADMIN_NOTIFY_FROM       — sender address (e.g. "Cory Automation <notify@coryhelpsyoumove.com>")
//   ADMIN_NOTIFY_TO         — recipient address (defaults to coryhelpsyoumove@gmail.com)

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY") || "";
const ADMIN_NOTIFY_SECRET = Deno.env.get("ADMIN_NOTIFY_SECRET") || "";
const FROM = Deno.env.get("ADMIN_NOTIFY_FROM") || "Cory Automation <notify@coryhelpsyoumove.com>";
const DEFAULT_TO = Deno.env.get("ADMIN_NOTIFY_TO") || "coryhelpsyoumove@gmail.com";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, x-admin-secret",
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405, headers: corsHeaders });
  }

  const providedSecret = req.headers.get("x-admin-secret") || "";
  if (!ADMIN_NOTIFY_SECRET || providedSecret !== ADMIN_NOTIFY_SECRET) {
    return new Response(JSON.stringify({ error: "unauthorized" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  let body: { subject?: string; html?: string; text?: string; to?: string };
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: "invalid json" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const { subject, html, text, to } = body;
  if (!subject || (!html && !text)) {
    return new Response(JSON.stringify({ error: "subject and html|text required" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const resendBody: Record<string, unknown> = {
    from: FROM,
    to: [to || DEFAULT_TO],
    subject,
  };
  if (html) resendBody.html = html;
  if (text) resendBody.text = text;

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${RESEND_API_KEY}`,
    },
    body: JSON.stringify(resendBody),
  });

  const result = await res.json().catch(() => ({}));
  if (!res.ok) {
    return new Response(JSON.stringify({ error: "resend failed", detail: result }), {
      status: 502,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  return new Response(JSON.stringify({ ok: true, id: result.id }), {
    status: 200,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
