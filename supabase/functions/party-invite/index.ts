// Search Party — Invite Edge Function
// Sends invite emails to join a Search Party via Resend
//
// Deploy: supabase functions deploy party-invite
// Invoke: POST /functions/v1/party-invite { party_id, invitee_email, inviter_name }
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
    const { party_id, invitee_email, inviter_name } = body;

    if (!party_id || !invitee_email) {
      return new Response(
        JSON.stringify({ error: "party_id and invitee_email required" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    // Verify caller is an active member of this party
    const { data: membership } = await supabase
      .from("search_party_members")
      .select("id")
      .eq("party_id", party_id)
      .eq("user_id", user.id)
      .eq("status", "active")
      .single();

    if (!membership) {
      return new Response(
        JSON.stringify({ error: "You are not an active member of this party" }),
        {
          status: 403,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    // Check if already invited
    const { data: existing } = await supabase
      .from("search_party_members")
      .select("id, status")
      .eq("party_id", party_id)
      .eq("email", invitee_email.toLowerCase())
      .single();

    if (existing) {
      return new Response(
        JSON.stringify({
          error:
            existing.status === "active"
              ? "This person is already in your Search Party"
              : "An invite has already been sent to this email",
          already_exists: true,
        }),
        {
          status: 409,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    // Get party name
    const { data: party } = await supabase
      .from("search_parties")
      .select("name")
      .eq("id", party_id)
      .single();

    const partyName = party?.name || "Our Home Search";

    // Generate invite token
    const invite_token = crypto.randomUUID();

    // Insert pending member row
    const { error: insertErr } = await supabase
      .from("search_party_members")
      .insert({
        party_id,
        email: invitee_email.toLowerCase(),
        role: "member",
        status: "pending",
        invite_token,
        invited_at: new Date().toISOString(),
      });

    if (insertErr) {
      console.error("[party-invite] Insert error:", insertErr);
      return new Response(
        JSON.stringify({ error: "Failed to create invite" }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    // Send email via Resend
    const inviteUrl = `https://coryhelpsyoumove.com/?invite=${invite_token}`;
    const senderName = inviter_name || "Someone";

    if (RESEND_API_KEY) {
      try {
        const emailRes = await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${RESEND_API_KEY}`,
          },
          body: JSON.stringify({
            from: "CoryHelpsYouMove.com <noreply@coryhelpsyoumove.com>",
            to: [invitee_email],
            subject: `${senderName} invited you to their Search Party!`,
            html: `
              <div style="font-family: 'Outfit', Arial, sans-serif; max-width: 560px; margin: 0 auto; padding: 40px 24px; background: #F5F0E8; color: #1A1815;">
                <div style="text-align:center; margin-bottom: 32px;">
                  <h1 style="font-family: 'Cormorant Garamond', Georgia, serif; font-size: 28px; font-weight: 600; color: #1A1815; margin: 0 0 8px;">
                    You've Been Invited to a Search Party
                  </h1>
                  <p style="font-size: 15px; color: #666; margin: 0;">
                    ${senderName} wants to search for homes together
                  </p>
                </div>

                <div style="background: #fff; border-radius: 12px; padding: 28px; margin-bottom: 28px; border: 1px solid rgba(196,176,140,0.2);">
                  <p style="font-size: 15px; line-height: 1.6; margin: 0 0 8px;">
                    <strong>${senderName}</strong> invited you to join their Search Party
                    "<strong>${partyName}</strong>" on CoryHelpsYouMove.com.
                  </p>
                  <p style="font-size: 14px; line-height: 1.6; color: #666; margin: 0;">
                    When you join, you'll be able to share favorite properties, leave notes for each other,
                    and collaborate on your home search together.
                  </p>
                </div>

                <div style="text-align: center; margin-bottom: 28px;">
                  <a href="${inviteUrl}" style="display: inline-block; background: #C4B08C; color: #0C0B09; text-decoration: none; padding: 14px 36px; border-radius: 8px; font-size: 15px; font-weight: 600; letter-spacing: 0.02em;">
                    Join the Search Party
                  </a>
                </div>

                <div style="text-align: center; font-size: 12px; color: #999;">
                  <p style="margin: 0 0 4px;">CoryHelpsYouMove.com &mdash; Western NC Real Estate</p>
                  <p style="margin: 0;">Cory Coleman, Keller Williams Great Smokies</p>
                  <p style="margin: 8px 0 0;">
                    <a href="https://coryhelpsyoumove.com" style="color: #C4B08C;">coryhelpsyoumove.com</a>
                  </p>
                </div>
              </div>
            `,
          }),
        });

        const emailData = await emailRes.text();
        console.log("[party-invite] Resend response:", emailRes.status, emailData);
      } catch (emailErr) {
        // Email failure shouldn't fail the invite — the invite row is created
        console.error("[party-invite] Email send error:", emailErr);
      }
    } else {
      console.warn("[party-invite] RESEND_API_KEY not set — invite created but no email sent");
    }

    return new Response(
      JSON.stringify({ success: true, invite_token }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  } catch (err) {
    console.error("[party-invite] Error:", err);
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
