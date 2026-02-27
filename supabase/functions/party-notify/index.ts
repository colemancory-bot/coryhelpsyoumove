// Search Party — Notification Edge Function
// Notifies party members when someone leaves a note or favorites a property
//
// Deploy: supabase functions deploy party-notify
// Invoke: POST /functions/v1/party-notify { party_id, action_type, actor_name, property_address, note_preview }
//
// Env vars required:
//   RESEND_API_KEY — Resend email API key
//   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY — Supabase admin access

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY") || "";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
const SUPABASE_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers":
    "Content-Type, Authorization, apikey, x-client-info",
};

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

// Rate limit: track last email per member (in-memory, resets on function cold start)
const lastEmailSent: Record<string, number> = {};
const RATE_LIMIT_MS = 15 * 60 * 1000; // 15 minutes

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    // Authenticate caller via JWT
    const authHeader = req.headers.get("Authorization") || "";
    const token = authHeader.replace("Bearer ", "");
    const {
      data: { user },
      error: authErr,
    } = await supabase.auth.getUser(token);

    if (authErr || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json();
    const {
      party_id,
      action_type,
      actor_name,
      property_address,
      note_preview,
      property_key,
    } = body;

    if (!party_id || !action_type) {
      return new Response(
        JSON.stringify({ error: "party_id and action_type required" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    // Load active members (except the actor) who have email notifications on
    const { data: members } = await supabase
      .from("search_party_members")
      .select("id, email, display_name, user_id")
      .eq("party_id", party_id)
      .eq("status", "active")
      .eq("notify_email", true)
      .neq("user_id", user.id);

    if (!members || members.length === 0) {
      return new Response(
        JSON.stringify({ success: true, emails_sent: 0 }),
        {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    let emailsSent = 0;
    const now = Date.now();

    for (const member of members) {
      // Rate limit check
      const lastSent = lastEmailSent[member.id] || 0;
      if (now - lastSent < RATE_LIMIT_MS) {
        console.log(
          `[party-notify] Rate limited for member ${member.id} (last email ${Math.round((now - lastSent) / 1000)}s ago)`,
        );
        continue;
      }

      if (!member.email || !RESEND_API_KEY) continue;

      const actorDisplay = actor_name || "A party member";
      const addressDisplay = property_address || "a property";

      let subject = "";
      let bodyText = "";

      if (action_type === "note") {
        subject = `${actorDisplay} left a note about ${addressDisplay}`;
        bodyText = note_preview
          ? `<p style="font-size: 15px; line-height: 1.6; margin: 0 0 16px;">"${note_preview.substring(0, 200)}${note_preview.length > 200 ? "..." : ""}"</p>`
          : "";
      } else if (action_type === "favorite") {
        subject = `${actorDisplay} favorited ${addressDisplay}`;
        bodyText = `<p style="font-size: 15px; line-height: 1.6; margin: 0 0 16px;">${actorDisplay} added this property to their favorites.</p>`;
      } else {
        subject = `New activity in your Search Party`;
        bodyText = `<p style="font-size: 15px; line-height: 1.6; margin: 0 0 16px;">${actorDisplay} was active on ${addressDisplay}.</p>`;
      }

      const propertyUrl = property_key
        ? `https://coryhelpsyoumove.com/?p=${encodeURIComponent(property_key)}`
        : "https://coryhelpsyoumove.com";

      try {
        await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${RESEND_API_KEY}`,
          },
          body: JSON.stringify({
            from: "CoryHelpsYouMove.com <noreply@coryhelpsyoumove.com>",
            to: [member.email],
            subject,
            html: `
              <div style="font-family: 'Outfit', Arial, sans-serif; max-width: 560px; margin: 0 auto; padding: 40px 24px; background: #F5F0E8; color: #1A1815;">
                <div style="text-align:center; margin-bottom: 24px;">
                  <h1 style="font-family: 'Cormorant Garamond', Georgia, serif; font-size: 24px; font-weight: 600; color: #1A1815; margin: 0;">
                    Search Party Update
                  </h1>
                </div>

                <div style="background: #fff; border-radius: 12px; padding: 24px; margin-bottom: 24px; border: 1px solid rgba(196,176,140,0.2);">
                  <p style="font-size: 14px; color: #666; margin: 0 0 12px; text-transform: uppercase; letter-spacing: 0.05em;">
                    ${action_type === "note" ? "New Note" : "New Favorite"}
                  </p>
                  <p style="font-size: 16px; font-weight: 600; margin: 0 0 12px;">
                    ${addressDisplay}
                  </p>
                  ${bodyText}
                </div>

                <div style="text-align: center; margin-bottom: 24px;">
                  <a href="${propertyUrl}" style="display: inline-block; background: #C4B08C; color: #0C0B09; text-decoration: none; padding: 12px 32px; border-radius: 8px; font-size: 14px; font-weight: 600;">
                    View Property
                  </a>
                </div>

                <div style="text-align: center; font-size: 12px; color: #999;">
                  <p style="margin: 0;">CoryHelpsYouMove.com &mdash; Western NC Real Estate</p>
                </div>
              </div>
            `,
          }),
        });

        lastEmailSent[member.id] = now;
        emailsSent++;
      } catch (emailErr) {
        console.error(
          `[party-notify] Failed to email ${member.email}:`,
          emailErr,
        );
      }

      // Also insert in-app notification
      if (member.user_id) {
        try {
          await supabase.from("alert_notifications").insert({
            user_id: member.user_id,
            alert_type: `party_${action_type}`,
            property_key: property_key || null,
            title: subject,
            message: `${actorDisplay} ${action_type === "note" ? "left a note on" : "favorited"} ${addressDisplay}`,
            email_sent: true,
          });
        } catch (notifErr) {
          console.error("[party-notify] Notification insert error:", notifErr);
        }
      }
    }

    return new Response(
      JSON.stringify({ success: true, emails_sent: emailsSent }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  } catch (err) {
    console.error("[party-notify] Error:", err);
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
