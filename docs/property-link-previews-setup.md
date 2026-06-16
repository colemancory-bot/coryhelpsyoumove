# Rich link previews for property links (Cloudflare Worker setup)

**Problem this fixes:** when you share a property link (`coryhelpsyoumove.com/?listing=...`) on Facebook, in a text, on X, etc., the preview shows the generic homepage card instead of the home's photo, address, and price. That is because the property page is drawn by JavaScript and social scrapers do not run JavaScript, so they only see the static homepage HTML.

**The fix:** put Cloudflare in front of the site (GitHub Pages stays the origin) and run the `og-listings` Worker. For `/?listing=` URLs it rewrites the Open Graph tags on the fly to the real property. Everyone else, and every other page, is untouched.

The Worker code is in `workers/og-listings/`. The steps below are the one-time setup, and most of them are clicks in dashboards, not code.

---

## What you need
- The Cloudflare account you already use for the R2 media bucket.
- Access to wherever **coryhelpsyoumove.com is registered** (the registrar) to change nameservers.
- `wrangler` CLI (`npm i -g wrangler`, then `wrangler login`).

> Heads-up: Step 2 (nameserver change) is the only step with real risk. The site stays on GitHub Pages the whole time; Cloudflare just sits in front. Do it during a quiet hour and keep this guide open. Nothing is deleted, so it is reversible.

---

## Step 1 — Add the domain to Cloudflare
1. Cloudflare dashboard, **Add a site**, enter `coryhelpsyoumove.com`, choose the **Free** plan.
2. Cloudflare scans your current DNS and shows you **two nameservers** (like `xxx.ns.cloudflare.com`). Copy them.

## Step 2 — Point the domain at Cloudflare (the DNS move)
At your **registrar**, replace the current nameservers with the two Cloudflare gave you. Save. Propagation is usually fast but can take a few hours. Cloudflare emails you when the domain is **Active**. The site keeps working the entire time.

## Step 3 — Confirm the GitHub Pages DNS records, proxied
In Cloudflare, **DNS → Records**, make sure these exist (Cloudflare usually imports them; add any that are missing). These are GitHub Pages' addresses:

| Type | Name | Value | Proxy |
|---|---|---|---|
| A | `coryhelpsyoumove.com` | `185.199.108.153` | **Proxied (orange)** |
| A | `coryhelpsyoumove.com` | `185.199.109.153` | **Proxied (orange)** |
| A | `coryhelpsyoumove.com` | `185.199.110.153` | **Proxied (orange)** |
| A | `coryhelpsyoumove.com` | `185.199.111.153` | **Proxied (orange)** |
| CNAME | `www` | `colemancory-bot.github.io` | **Proxied (orange)** |

The **orange cloud (Proxied)** is what lets the Worker run. (Confirm the `www` target matches your GitHub Pages user.)

## Step 4 — SSL and origin
- **SSL/TLS → Overview → set the mode to `Full`** (not Flexible). GitHub Pages serves HTTPS, so Full keeps it end-to-end encrypted and avoids a redirect loop.
- Leave the repo's `CNAME` file (`coryhelpsyoumove.com`) and GitHub Pages custom-domain setting exactly as they are. GitHub Pages remains the origin.

## Step 5 — Deploy the Worker
```bash
cd workers/og-listings
wrangler deploy
wrangler secret put SUPABASE_ANON_KEY     # paste the site's anon key (same one in app.js)
```
`SUPABASE_URL` and `FALLBACK_IMAGE` are already set in `wrangler.toml`.

## Step 6 — Route the Worker to the live domain
Either uncomment the `[[routes]]` block in `wrangler.toml` and `wrangler deploy` again, or in the dashboard: **Workers & Pages → og-listings → Settings → Domains & Routes → Add route** `coryhelpsyoumove.com/*` on zone `coryhelpsyoumove.com`.

---

## Test it
1. Grab a real listing link from the site (open a property, hit **Share → Copy**).
2. Paste it into the **Facebook Sharing Debugger**: https://developers.facebook.com/tools/debug/ , then click **Scrape Again**. You should now see the home's photo, address, and price, not the generic card.
3. Also paste it into an iMessage to yourself, and post it in a test (private) Facebook post or X draft.
4. Sanity-check that normal pages are untouched: scrape the homepage, a town page, and a blog post; they should look exactly as before.
5. Open a couple of property links in a normal browser to confirm the site still loads and the listing opens.

> Facebook caches previews. After this is live, use the Sharing Debugger's **Scrape Again** on any link that still shows the old card.

---

## How it stays MLS-compliant
The Worker reads listings exactly like the website does, filtered to `mlg_can_view = true`, so it can only ever build a card for a listing the public is already allowed to see. If a listing is IDX-withheld or not found, the link simply falls back to the generic homepage card. The card also appends "Listed by `{brokerage}`" for attribution.

## Rollback (if anything looks wrong)
- Fastest: in **Workers Routes**, delete the `coryhelpsyoumove.com/*` route. Previews revert to generic instantly; the site is unaffected.
- Or set the DNS records back to **DNS only (grey cloud)** to take Cloudflare's proxy out of the path entirely.
- Full revert: point the registrar's nameservers back to the originals. The site returns to plain GitHub Pages.
