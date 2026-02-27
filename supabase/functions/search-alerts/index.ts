// Search Alerts — Cron Job Edge Function
// Matches new listings to saved searches + checks price drop subscriptions
//
// Deploy: supabase functions deploy search-alerts
// Schedule: pg_cron after MLS sync (e.g. every 6 hours)
// Invoke: POST /functions/v1/search-alerts (no auth required — internal only)
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

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

interface SavedSearch {
  id: string;
  user_id: string;
  search_name: string;
  filters: Record<string, unknown>;
  notify_email: boolean;
  last_notified_at: string | null;
}

interface PriceDropSub {
  id: string;
  user_id: string;
  property_key: string;
  listing_key: string;
  current_price: number;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  try {
    let totalAlertsSent = 0;

    // ═══ 1. Saved Search Alerts ═══
    const { data: searches } = await supabase
      .from("saved_searches")
      .select("id, user_id, search_name, filters, notify_email, last_notified_at")
      .eq("notify_email", true);

    if (searches && searches.length > 0) {
      for (const search of searches as SavedSearch[]) {
        const since = search.last_notified_at || new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
        const filters = search.filters || {};

        // Build listing query based on saved filters
        let query = supabase
          .from("mls_listings")
          .select("listing_key, full_address, city, list_price, property_type, bedrooms_total, bathrooms_total_integer, standard_status")
          .eq("standard_status", "Active")
          .eq("mlg_can_view", true)
          .gte("created_at", since);

        // Apply saved filters
        if (filters.locations && Array.isArray(filters.locations) && filters.locations.length > 0) {
          query = query.in("city", filters.locations as string[]);
        }
        if (filters.type) {
          query = query.eq("property_type", filters.type as string);
        }
        if (filters.price) {
          const pp = (filters.price as string).split("-");
          if (pp[0] && parseInt(pp[0]) > 0) query = query.gte("list_price", parseInt(pp[0]));
          if (pp[1] && parseInt(pp[1]) < 10000000) query = query.lte("list_price", parseInt(pp[1]));
        }
        if (filters.beds) {
          query = query.gte("bedrooms_total", parseInt(filters.beds as string));
        }
        if (filters.baths) {
          query = query.gte("bathrooms_total_integer", parseInt(filters.baths as string));
        }

        const { data: matches } = await query.limit(20);

        if (matches && matches.length > 0) {
          // Get user email
          const { data: profile } = await supabase
            .from("profiles")
            .select("email")
            .eq("id", search.user_id)
            .single();

          if (profile?.email && RESEND_API_KEY) {
            const listingList = matches
              .slice(0, 5)
              .map((l) => `<li style="margin-bottom:8px"><strong>${l.full_address}</strong>, ${l.city} — $${(l.list_price || 0).toLocaleString()}</li>`)
              .join("");

            const moreText = matches.length > 5 ? `<p style="color:#666;font-size:14px">...and ${matches.length - 5} more</p>` : "";

            await fetch("https://api.resend.com/emails", {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${RESEND_API_KEY}`,
              },
              body: JSON.stringify({
                from: "CoryHelpsYouMove.com <noreply@coryhelpsyoumove.com>",
                to: [profile.email],
                subject: `${matches.length} new listing${matches.length > 1 ? "s" : ""} match your search: ${search.search_name}`,
                html: `
                  <div style="font-family: 'Outfit', Arial, sans-serif; max-width: 560px; margin: 0 auto; padding: 40px 24px; background: #F5F0E8; color: #1A1815;">
                    <h1 style="font-family: 'Cormorant Garamond', Georgia, serif; font-size: 24px; margin: 0 0 16px; text-align: center;">New Listings Match Your Search</h1>
                    <div style="background: #fff; border-radius: 12px; padding: 24px; margin-bottom: 24px; border: 1px solid rgba(196,176,140,0.2);">
                      <p style="font-size: 14px; color: #666; margin: 0 0 12px;"><strong>${search.search_name}</strong></p>
                      <ul style="padding-left: 16px; margin: 0;">${listingList}</ul>
                      ${moreText}
                    </div>
                    <div style="text-align: center;">
                      <a href="https://coryhelpsyoumove.com" style="display: inline-block; background: #C4B08C; color: #0C0B09; text-decoration: none; padding: 12px 32px; border-radius: 8px; font-size: 14px; font-weight: 600;">View All Matches</a>
                    </div>
                    <div style="text-align: center; font-size: 12px; color: #999; margin-top: 24px;">
                      <p>CoryHelpsYouMove.com &mdash; Western NC Real Estate</p>
                    </div>
                  </div>
                `,
              }),
            });

            totalAlertsSent++;

            // Insert in-app notification
            await supabase.from("alert_notifications").insert({
              user_id: search.user_id,
              alert_type: "search_match",
              title: `${matches.length} new listing${matches.length > 1 ? "s" : ""} match "${search.search_name}"`,
              message: `New listings found: ${matches.slice(0, 3).map((l) => l.full_address).join(", ")}`,
              email_sent: true,
            });
          }

          // Update last_notified_at
          await supabase
            .from("saved_searches")
            .update({ last_notified_at: new Date().toISOString() })
            .eq("id", search.id);
        }

        await sleep(200); // Rate limit between searches
      }
    }

    // ═══ 2. Price Drop Alerts ═══
    const { data: priceSubs } = await supabase
      .from("price_drop_subscriptions")
      .select("id, user_id, property_key, listing_key, current_price");

    if (priceSubs && priceSubs.length > 0) {
      for (const sub of priceSubs as PriceDropSub[]) {
        if (!sub.listing_key) continue;

        // Check latest price
        const { data: listing } = await supabase
          .from("mls_listings")
          .select("list_price, full_address, city")
          .eq("listing_key", sub.listing_key)
          .single();

        if (!listing || !listing.list_price || listing.list_price >= sub.current_price) continue;

        const dropAmount = sub.current_price - listing.list_price;
        const dropPct = Math.round((dropAmount / sub.current_price) * 100);

        // Get user email
        const { data: profile } = await supabase
          .from("profiles")
          .select("email")
          .eq("id", sub.user_id)
          .single();

        if (profile?.email && RESEND_API_KEY) {
          await fetch("https://api.resend.com/emails", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${RESEND_API_KEY}`,
            },
            body: JSON.stringify({
              from: "CoryHelpsYouMove.com <noreply@coryhelpsyoumove.com>",
              to: [profile.email],
              subject: `Price drop! ${listing.full_address} is now $${listing.list_price.toLocaleString()}`,
              html: `
                <div style="font-family: 'Outfit', Arial, sans-serif; max-width: 560px; margin: 0 auto; padding: 40px 24px; background: #F5F0E8; color: #1A1815;">
                  <h1 style="font-family: 'Cormorant Garamond', Georgia, serif; font-size: 24px; margin: 0 0 16px; text-align: center;">Price Drop Alert</h1>
                  <div style="background: #fff; border-radius: 12px; padding: 24px; margin-bottom: 24px; border: 1px solid rgba(196,176,140,0.2);">
                    <p style="font-size: 16px; font-weight: 600; margin: 0 0 8px;">${listing.full_address}, ${listing.city || ""}</p>
                    <p style="font-size: 14px; margin: 0 0 4px;">Was: <s>$${sub.current_price.toLocaleString()}</s></p>
                    <p style="font-size: 20px; font-weight: 700; color: #27ae60; margin: 0;">Now: $${listing.list_price.toLocaleString()} <span style="font-size: 14px; font-weight: 400;">(−$${dropAmount.toLocaleString()}, ${dropPct}% off)</span></p>
                  </div>
                  <div style="text-align: center;">
                    <a href="https://coryhelpsyoumove.com/?p=${encodeURIComponent(sub.property_key)}" style="display: inline-block; background: #C4B08C; color: #0C0B09; text-decoration: none; padding: 12px 32px; border-radius: 8px; font-size: 14px; font-weight: 600;">View Property</a>
                  </div>
                  <div style="text-align: center; font-size: 12px; color: #999; margin-top: 24px;">
                    <p>CoryHelpsYouMove.com &mdash; Western NC Real Estate</p>
                  </div>
                </div>
              `,
            }),
          });

          // Insert in-app notification
          await supabase.from("alert_notifications").insert({
            user_id: sub.user_id,
            alert_type: "price_drop",
            property_key: sub.property_key,
            title: `Price drop: ${listing.full_address}`,
            message: `Price reduced from $${sub.current_price.toLocaleString()} to $${listing.list_price.toLocaleString()} (−${dropPct}%)`,
            email_sent: true,
          });

          totalAlertsSent++;
        }

        // Update subscription with new price
        await supabase
          .from("price_drop_subscriptions")
          .update({ current_price: listing.list_price })
          .eq("id", sub.id);

        await sleep(200);
      }
    }

    return new Response(
      JSON.stringify({ success: true, alerts_sent: totalAlertsSent }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  } catch (err) {
    console.error("[search-alerts] Error:", err);
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
