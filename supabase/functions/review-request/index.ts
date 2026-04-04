// Review Request — Edge Function
// Manages the review collection workflow: send request emails, load/submit reviews, admin approve/reject
//
// Deploy: supabase functions deploy review-request
// Invoke: POST /functions/v1/review-request { action: "send" | "load" | "submit" | "approve" | "reject" | "list", ... }
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

/** Generate a URL-safe random token (32 characters) */
function generateToken(): string {
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  // Base64url encode: URL-safe, no padding
  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

/** JSON error response helper */
function errorResponse(
  message: string,
  status: number,
): Response {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

/** JSON success response helper */
function jsonResponse(data: Record<string, unknown>, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

/** Verify admin auth from Authorization header */
async function verifyAdmin(
  req: Request,
): Promise<{ ok: boolean; error?: string }> {
  const authHeader = req.headers.get("Authorization") || "";
  const token = authHeader.replace("Bearer ", "");
  const {
    data: { user },
    error: authErr,
  } = await supabase.auth.getUser(token);

  if (authErr || !user) {
    return { ok: false, error: "Unauthorized" };
  }

  // Check admin role in profiles table
  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  if (!profile || profile.role !== "admin") {
    return { ok: false, error: "Admin access required" };
  }

  return { ok: true };
}

// ---------------------------------------------------------------------------
// Action handlers
// ---------------------------------------------------------------------------

async function handleSend(body: Record<string, string>): Promise<Response> {
  const { clientName, clientEmail, propertyAddress, town } = body;

  if (!clientName || !clientEmail) {
    return errorResponse("clientName and clientEmail are required", 400);
  }

  const token = generateToken();

  // Insert review request
  const { error: insertErr } = await supabase
    .from("review_requests")
    .insert({
      client_name: clientName,
      client_email: clientEmail.toLowerCase(),
      property_address: propertyAddress || "",
      town: town || "",
      token,
      status: "pending",
    });

  if (insertErr) {
    console.error("[review-request] Insert error:", insertErr);
    return errorResponse("Failed to create review request", 500);
  }

  // Send email via Resend
  const reviewUrl = `https://coryhelpsyoumove.com/review.html?token=${token}`;

  if (RESEND_API_KEY) {
    try {
      const propertyLine = propertyAddress
        ? `regarding <strong>${propertyAddress}</strong>${town ? ` in ${town}` : ""}`
        : "";

      const emailRes = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${RESEND_API_KEY}`,
        },
        body: JSON.stringify({
          from: "Cory Coleman <noreply@coryhelpsyoumove.com>",
          to: [clientEmail],
          subject: `${clientName}, how was your experience?`,
          html: `
            <div style="font-family: 'Outfit', Arial, sans-serif; max-width: 560px; margin: 0 auto; padding: 0; background: #F5F0E8; color: #1A1815;">
              <div style="background: #0C0B09; padding: 28px 24px; text-align: center; border-bottom: 3px solid #C4B08C;">
                <h1 style="font-family: 'Cormorant Garamond', Georgia, serif; font-size: 26px; font-weight: 600; color: #F5F0E8; margin: 0;">
                  CoryHelpsYouMove.com
                </h1>
              </div>

              <div style="padding: 36px 24px;">
                <p style="font-size: 16px; line-height: 1.6; margin: 0 0 16px;">
                  Hi ${clientName},
                </p>
                <p style="font-size: 15px; line-height: 1.6; margin: 0 0 16px;">
                  Thank you for working with me ${propertyLine}. I hope everything went smoothly and you're settling in well.
                </p>
                <p style="font-size: 15px; line-height: 1.6; margin: 0 0 28px;">
                  If you have a minute, I'd really appreciate hearing about your experience. Your feedback helps me improve and helps other folks looking for homes in Western NC.
                </p>

                <div style="text-align: center; margin-bottom: 28px;">
                  <a href="${reviewUrl}" style="display: inline-block; background: #C4B08C; color: #0C0B09; text-decoration: none; padding: 14px 36px; border-radius: 8px; font-size: 15px; font-weight: 600; letter-spacing: 0.02em;">
                    Leave a Review
                  </a>
                </div>

                <p style="font-size: 14px; line-height: 1.6; color: #666; margin: 0;">
                  Thanks again, and don't hesitate to reach out if you ever need anything.
                </p>
              </div>

              <div style="padding: 20px 24px; text-align: center; font-size: 12px; color: #999; border-top: 1px solid rgba(196,176,140,0.2);">
                <p style="margin: 0 0 4px;">Cory Coleman, Keller Williams Great Smokies</p>
                <p style="margin: 0 0 4px;">(828) 506-6413</p>
                <p style="margin: 0;">
                  <a href="https://coryhelpsyoumove.com" style="color: #C4B08C;">coryhelpsyoumove.com</a>
                </p>
              </div>
            </div>
          `,
        }),
      });

      const emailData = await emailRes.text();
      console.log("[review-request] Resend response:", emailRes.status, emailData);
    } catch (emailErr) {
      // Email failure shouldn't fail the request — the row is created
      console.error("[review-request] Email send error:", emailErr);
    }
  } else {
    console.warn("[review-request] RESEND_API_KEY not set — request created but no email sent");
  }

  return jsonResponse({ ok: true, token });
}

async function handleLoad(body: Record<string, string>): Promise<Response> {
  const { token } = body;

  if (!token) {
    return errorResponse("token is required", 400);
  }

  const { data: request, error } = await supabase
    .from("review_requests")
    .select("client_name, property_address, town, status")
    .eq("token", token)
    .single();

  if (error || !request) {
    return errorResponse("Review request not found", 404);
  }

  if (request.status !== "pending") {
    return errorResponse("This review has already been submitted", 400);
  }

  return jsonResponse({
    ok: true,
    clientName: request.client_name,
    propertyAddress: request.property_address,
    town: request.town,
    status: request.status,
  });
}

async function handleSubmit(
  body: Record<string, unknown>,
): Promise<Response> {
  const { token, rating, reviewText, propertyType, buyOrSell } = body as {
    token: string;
    rating: number;
    reviewText: string;
    propertyType?: string;
    buyOrSell?: string;
  };

  if (!token || !rating || !reviewText) {
    return errorResponse("token, rating, and reviewText are required", 400);
  }

  // Look up the review request
  const { data: request, error: lookupErr } = await supabase
    .from("review_requests")
    .select("id, client_name, status")
    .eq("token", token)
    .single();

  if (lookupErr || !request) {
    return errorResponse("Review request not found", 404);
  }

  if (request.status !== "pending") {
    return errorResponse("This review has already been submitted", 400);
  }

  // Auto-publish 5-star reviews
  const isPublished = rating === 5;

  // Insert the review
  const { data: review, error: reviewErr } = await supabase
    .from("reviews")
    .insert({
      reviewer_name: request.client_name,
      review_text: reviewText,
      rating,
      source: "Website",
      review_date: new Date().toISOString().split("T")[0],
      is_published: isPublished,
    })
    .select("id")
    .single();

  if (reviewErr || !review) {
    console.error("[review-request] Review insert error:", reviewErr);
    return errorResponse("Failed to save review", 500);
  }

  // Update the review request
  const { error: updateErr } = await supabase
    .from("review_requests")
    .update({
      status: "submitted",
      submitted_at: new Date().toISOString(),
      review_id: review.id,
    })
    .eq("id", request.id);

  if (updateErr) {
    console.error("[review-request] Request update error:", updateErr);
  }

  return jsonResponse({ ok: true, published: isPublished });
}

async function handleApprove(
  req: Request,
  body: Record<string, string>,
): Promise<Response> {
  const auth = await verifyAdmin(req);
  if (!auth.ok) {
    return errorResponse(auth.error!, 401);
  }

  const { reviewId } = body;
  if (!reviewId) {
    return errorResponse("reviewId is required", 400);
  }

  const { error: reviewErr } = await supabase
    .from("reviews")
    .update({ is_published: true })
    .eq("id", reviewId);

  if (reviewErr) {
    console.error("[review-request] Approve error:", reviewErr);
    return errorResponse("Failed to approve review", 500);
  }

  const { error: reqErr } = await supabase
    .from("review_requests")
    .update({ status: "approved" })
    .eq("review_id", reviewId);

  if (reqErr) {
    console.error("[review-request] Request status update error:", reqErr);
  }

  return jsonResponse({ ok: true });
}

async function handleReject(
  req: Request,
  body: Record<string, string>,
): Promise<Response> {
  const auth = await verifyAdmin(req);
  if (!auth.ok) {
    return errorResponse(auth.error!, 401);
  }

  const { reviewId } = body;
  if (!reviewId) {
    return errorResponse("reviewId is required", 400);
  }

  const { error: reviewErr } = await supabase
    .from("reviews")
    .update({ is_published: false })
    .eq("id", reviewId);

  if (reviewErr) {
    console.error("[review-request] Reject error:", reviewErr);
    return errorResponse("Failed to reject review", 500);
  }

  const { error: reqErr } = await supabase
    .from("review_requests")
    .update({ status: "rejected" })
    .eq("review_id", reviewId);

  if (reqErr) {
    console.error("[review-request] Request status update error:", reqErr);
  }

  return jsonResponse({ ok: true });
}

async function handleList(req: Request): Promise<Response> {
  const auth = await verifyAdmin(req);
  if (!auth.ok) {
    return errorResponse(auth.error!, 401);
  }

  const { data: requests, error } = await supabase
    .from("review_requests")
    .select(`
      id,
      client_name,
      client_email,
      property_address,
      town,
      token,
      status,
      created_at,
      submitted_at,
      review_id,
      reviews (
        id,
        reviewer_name,
        review_text,
        rating,
        source,
        review_date,
        is_published
      )
    `)
    .order("created_at", { ascending: false });

  if (error) {
    console.error("[review-request] List error:", error);
    return errorResponse("Failed to fetch review requests", 500);
  }

  return jsonResponse({ ok: true, requests: requests || [] });
}

// ---------------------------------------------------------------------------
// Main handler
// ---------------------------------------------------------------------------

Deno.serve(async (req: Request) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return errorResponse("Method not allowed", 405);
  }

  try {
    const body = await req.json();
    const { action } = body;

    switch (action) {
      case "send":
        return await handleSend(body);
      case "load":
        return await handleLoad(body);
      case "submit":
        return await handleSubmit(body);
      case "approve":
        return await handleApprove(req, body);
      case "reject":
        return await handleReject(req, body);
      case "list":
        return await handleList(req);
      default:
        return errorResponse(
          `Unknown action: ${action}. Expected: send, load, submit, approve, reject, list`,
          400,
        );
    }
  } catch (err) {
    console.error("[review-request] Error:", err);
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
