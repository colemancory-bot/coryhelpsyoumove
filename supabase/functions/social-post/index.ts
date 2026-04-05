// Social Media Post Generator + Auto-Post
// Deploy: supabase functions deploy social-post
//
// Actions:
//   generate — Returns platform-specific post text for FB, IG, LinkedIn, GBP
//   post-facebook — Posts photo + caption to Facebook Page via Graph API
//   post-instagram — Posts photo + caption to Instagram via Graph API
//   test — Tests Meta API connectivity
//
// Env vars:
//   META_PAGE_ACCESS_TOKEN — System user token with pages_manage_posts
//   META_PAGE_ID — Facebook Page ID
//   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const META_TOKEN = Deno.env.get("META_PAGE_ACCESS_TOKEN") || "";
const META_PAGE_ID = Deno.env.get("META_PAGE_ID") || "";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
const SUPABASE_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
const GRAPH_API = "https://graph.facebook.com/v21.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, apikey, x-client-info",
};

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

function jsonResponse(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

// County lookup
const COUNTY_MAP: Record<string, string> = {
  "Waynesville": "Haywood", "Canton": "Haywood", "Clyde": "Haywood", "Maggie Valley": "Haywood",
  "Sylva": "Jackson", "Cullowhee": "Jackson", "Cashiers": "Jackson", "Dillsboro": "Jackson", "Webster": "Jackson",
  "Bryson City": "Swain", "Almond": "Swain",
  "Franklin": "Macon", "Highlands": "Macon", "Otto": "Macon",
  "Asheville": "Buncombe", "Arden": "Buncombe", "Black Mountain": "Buncombe", "Candler": "Buncombe",
  "Fairview": "Buncombe", "Fletcher": "Buncombe", "Swannanoa": "Buncombe", "Weaverville": "Buncombe",
  "Brevard": "Transylvania", "Robbinsville": "Graham",
};

// Landmark associations
const LANDMARKS: Record<string, string> = {
  "Haywood": "Blue Ridge Parkway",
  "Swain": "Great Smoky Mountains National Park",
  "Jackson": "Tuckasegee River",
  "Macon": "Appalachian Trail",
  "Buncombe": "Blue Ridge Mountains",
  "Transylvania": "Pisgah National Forest",
};

interface ListingData {
  address: string;
  city: string;
  price: number;
  beds: number;
  baths: number;
  sqft: number;
  lot: string;
  type: string;
  mlsId: string;
  description: string;
  photoUrl: string;
  listingKey: string;
}

function generatePosts(listing: ListingData) {
  const { address, city, price, beds, baths, sqft, lot, type, mlsId, description, listingKey } = listing;
  const county = COUNTY_MAP[city] || "";
  const landmark = county ? LANDMARKS[county] || "" : "";
  const priceStr = "$" + price.toLocaleString("en-US");
  const propUrl = `https://coryhelpsyoumove.com/?listing=${encodeURIComponent(mlsId || listingKey)}`;

  // Property description snippet (first sentence or first 120 chars)
  const descSnippet = description
    ? description.split(/\.\s/)[0].substring(0, 150) + (description.length > 150 ? "..." : "")
    : "";

  // Type label for captions
  const typeLabel = type === "Land" ? "land" : type === "Cabin" ? "cabin" : type === "Multi-Family" ? "multi-family property" : "home";

  // Stats line
  const statsLine = type === "Land"
    ? `${lot} | ${priceStr}`
    : `${beds} bed, ${baths} bath | ${sqft > 0 ? sqft.toLocaleString() + " sq ft | " : ""}${priceStr}`;

  // ── Facebook ──
  const fb = [
    `New Listing in ${city}, NC | ${priceStr}`,
    "",
    type === "Land"
      ? `${lot} of ${typeLabel} in ${city}${county ? ", " + county + " County" : ""}.${descSnippet ? " " + descSnippet : ""}`
      : `${beds} bed, ${baths} bath ${typeLabel}${sqft > 0 ? ", " + sqft.toLocaleString() + " sq ft" : ""} in ${city}${county ? ", " + county + " County" : ""}.${descSnippet ? " " + descSnippet : ""}`,
    "",
    `View details + photos: ${propUrl}`,
    "",
    `Cory Coleman, Broker | Keller Williams Great Smokies`,
    `Equal Housing Opportunity`,
    "",
    `#${city.replace(/\s+/g, "")}NC #WNCRealEstate ${county ? "#" + county + "County " : ""}#WesternNC #HomesForSale`,
  ].join("\n");

  // ── Instagram ──
  const ig = [
    type === "Land"
      ? `${lot} in ${city}, NC. ${priceStr}.`
      : `${beds} bed, ${baths} bath ${typeLabel} in ${city}, NC. ${priceStr}.`,
    "",
    descSnippet || `Beautiful ${typeLabel} in ${city}${county ? ", " + county + " County" : ""}, North Carolina.`,
    "",
    statsLine,
    address,
    `${city}${county ? ", " + county + " County" : ""}, NC`,
    "",
    landmark ? `Near ${landmark}.` : "",
    "",
    `Link in bio for full details and photos.`,
    "",
    `Cory Coleman, Broker`,
    `Keller Williams Great Smokies`,
    `Equal Housing Opportunity`,
    "",
    `#${city.replace(/\s+/g, "")}NC #WNCRealEstate ${county ? "#" + county + "CountyNC " : ""}#WesternNorthCarolina #MountainHomes #${type.replace(/[\s-]+/g, "")}ForSale #NCRealEstate #BlueRidgeMountains #${city.replace(/\s+/g, "")}HomesForSale #RealEstate #NewListing`,
  ].filter(Boolean).join("\n");

  // ── LinkedIn ──
  const li = [
    `Just listed: ${statsLine} in ${city}${county ? ", " + county + " County" : ""}, NC.`,
    "",
    descSnippet || `${type === "Land" ? "Acreage" : "Property"} available in the Western North Carolina mountains.`,
    "",
    `If you know anyone looking for ${typeLabel === "land" ? "land" : "a " + typeLabel} in the Western North Carolina mountains, I'd appreciate the referral.`,
    "",
    `View the full listing: ${propUrl}`,
    "",
    `#WNCRealEstate #${city.replace(/\s+/g, "")}NC #RealEstate`,
  ].join("\n");

  // ── Google Business Profile ──
  const gbp = [
    `New listing in ${city}, NC. ${statsLine}${county ? " in " + county + " County" : ""}.${descSnippet ? " " + descSnippet.substring(0, 80) : ""} View at coryhelpsyoumove.com`,
    "",
    `Cory Coleman, Broker | Keller Williams Great Smokies`,
  ].join("\n");

  return { facebook: fb, instagram: ig, linkedin: li, gbp };
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }

  try {
    const body = await req.json();
    const action = body.action || "";

    // ── Test Meta API connectivity ──
    if (action === "test") {
      if (!META_TOKEN || !META_PAGE_ID) {
        return jsonResponse({ ok: false, error: "META_PAGE_ACCESS_TOKEN or META_PAGE_ID not set" });
      }
      const res = await fetch(`${GRAPH_API}/${META_PAGE_ID}?fields=id,name&access_token=${META_TOKEN}`);
      const data = await res.json();
      console.log("[social-post] Test response:", JSON.stringify(data));
      return jsonResponse({ ok: res.ok, data });
    }

    // ── Generate post text for all platforms ──
    if (action === "generate") {
      const listing: ListingData = body.listing;
      if (!listing || !listing.address) {
        return jsonResponse({ error: "listing data required" }, 400);
      }
      const posts = generatePosts(listing);
      return jsonResponse({ ok: true, posts });
    }

    // ── Post to Facebook Page ──
    if (action === "post-facebook") {
      if (!META_TOKEN || !META_PAGE_ID) {
        return jsonResponse({ error: "Meta API not configured" }, 500);
      }
      let { message, photoUrl, imageBase64, listingKey } = body;
      if (!message) return jsonResponse({ error: "message required" }, 400);

      // If canvas image was sent as base64, upload to R2 first
      if (imageBase64 && !photoUrl) {
        try {
          const R2_WORKER = Deno.env.get("R2_WORKER_URL") || "";
          const R2_SECRET = Deno.env.get("R2_WORKER_SECRET") || "";
          const R2_PUBLIC = Deno.env.get("R2_PUBLIC_URL") || "";
          if (R2_WORKER && R2_SECRET) {
            const base64Data = imageBase64.replace(/^data:image\/\w+;base64,/, "");
            const binaryStr = atob(base64Data);
            const bytes = new Uint8Array(binaryStr.length);
            for (let i = 0; i < binaryStr.length; i++) bytes[i] = binaryStr.charCodeAt(i);
            const key = `social/${listingKey || "post"}-${Date.now()}.jpg`;
            const uploadRes = await fetch(`${R2_WORKER}/${key}`, {
              method: "PUT",
              headers: { "Authorization": `Bearer ${R2_SECRET}`, "Content-Type": "image/jpeg" },
              body: bytes,
            });
            if (uploadRes.ok) {
              // Use worker URL for serving (has CORS)
              photoUrl = `${R2_WORKER}/${key}`;
              console.log("[social-post] Uploaded overlay image to R2:", key);
            }
          }
        } catch (e) {
          console.warn("[social-post] R2 upload failed:", String(e));
        }
      }

      // Get page-specific access token from system user token
      const pageTokenRes = await fetch(`${GRAPH_API}/${META_PAGE_ID}?fields=access_token&access_token=${META_TOKEN}`);
      const pageTokenData = await pageTokenRes.json();
      const pageToken = pageTokenData.access_token || META_TOKEN;
      console.log("[social-post] Page token obtained:", pageTokenRes.ok, pageToken ? "yes" : "no");

      let result;
      if (photoUrl) {
        // Post photo with caption
        const res = await fetch(`${GRAPH_API}/${META_PAGE_ID}/photos`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            url: photoUrl,
            message: message,
            access_token: pageToken,
          }),
        });
        result = await res.json();
        console.log("[social-post] FB photo post:", res.status, JSON.stringify(result));
        if (!res.ok) return jsonResponse({ ok: false, error: result.error?.message || "Facebook API error", detail: result }, 502);
      } else {
        // Text-only post
        const res = await fetch(`${GRAPH_API}/${META_PAGE_ID}/feed`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            message: message,
            access_token: pageToken,
          }),
        });
        result = await res.json();
        console.log("[social-post] FB text post:", res.status, JSON.stringify(result));
        if (!res.ok) return jsonResponse({ ok: false, error: result.error?.message || "Facebook API error", detail: result }, 502);
      }

      // Log to social_posts table
      if (listingKey) {
        await supabase.from("social_posts").insert({
          listing_key: listingKey,
          platform: "facebook",
          post_text: message,
          platform_post_id: result.id || result.post_id || "",
          posted_at: new Date().toISOString(),
        }).then(() => {}).catch(() => {});
      }

      return jsonResponse({ ok: true, postId: result.id || result.post_id });
    }

    // ── Post to Instagram ──
    if (action === "post-instagram") {
      if (!META_TOKEN || !META_PAGE_ID) {
        return jsonResponse({ error: "Meta API not configured" }, 500);
      }
      const { caption, photoUrl, listingKey } = body;
      if (!caption || !photoUrl) return jsonResponse({ error: "caption and photoUrl required" }, 400);

      // Step 1: Get Instagram Business Account ID linked to the Page
      const igRes = await fetch(`${GRAPH_API}/${META_PAGE_ID}?fields=instagram_business_account&access_token=${META_TOKEN}`);
      const igData = await igRes.json();
      const igAccountId = igData.instagram_business_account?.id;
      if (!igAccountId) {
        console.log("[social-post] No IG business account linked:", JSON.stringify(igData));
        return jsonResponse({ ok: false, error: "No Instagram Business Account linked to this Facebook Page" }, 400);
      }

      // Step 2: Create media container
      const containerRes = await fetch(`${GRAPH_API}/${igAccountId}/media`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          image_url: photoUrl,
          caption: caption,
          access_token: META_TOKEN,
        }),
      });
      const containerData = await containerRes.json();
      console.log("[social-post] IG container:", containerRes.status, JSON.stringify(containerData));
      if (!containerRes.ok) return jsonResponse({ ok: false, error: containerData.error?.message || "IG container error", detail: containerData }, 502);

      const containerId = containerData.id;

      // Step 3: Publish the container (may need a brief delay)
      await new Promise(r => setTimeout(r, 3000));

      const publishRes = await fetch(`${GRAPH_API}/${igAccountId}/media_publish`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          creation_id: containerId,
          access_token: META_TOKEN,
        }),
      });
      const publishData = await publishRes.json();
      console.log("[social-post] IG publish:", publishRes.status, JSON.stringify(publishData));
      if (!publishRes.ok) return jsonResponse({ ok: false, error: publishData.error?.message || "IG publish error", detail: publishData }, 502);

      // Log
      if (listingKey) {
        await supabase.from("social_posts").insert({
          listing_key: listingKey,
          platform: "instagram",
          post_text: caption,
          platform_post_id: publishData.id || "",
          posted_at: new Date().toISOString(),
        }).then(() => {}).catch(() => {});
      }

      return jsonResponse({ ok: true, postId: publishData.id });
    }

    // ── Post history ──
    if (action === "history") {
      const { listingKey } = body;
      const query = supabase.from("social_posts").select("*").order("posted_at", { ascending: false });
      if (listingKey) query.eq("listing_key", listingKey);
      const { data, error } = await query.limit(50);
      if (error) return jsonResponse({ ok: false, error: error.message }, 500);
      return jsonResponse({ ok: true, posts: data || [] });
    }

    return jsonResponse({ error: "Unknown action: " + action }, 400);
  } catch (err) {
    console.error("[social-post] Error:", err);
    return jsonResponse({ error: String(err) }, 500);
  }
});
