# CoryHelpsYouMove.com — Project Documentation

## SEO IS THE #1 PRIORITY FOR THIS WEBSITE
Every code change, new page, and content addition must consider SEO impact. When in doubt, optimize for search.

## FAIR HOUSING ACT COMPLIANCE IS MANDATORY
All content on this website MUST comply with the Fair Housing Act (42 U.S.C. 3601-3619) and the North Carolina State Fair Housing Act (Chapter 41A). This is non-negotiable.

### The Core Rule: Describe the property, not the people.

### Protected Classes (Federal + NC)
Race, color, religion, national origin, sex (includes sexual orientation/gender identity), disability, familial status, affordable housing status (NC).

### Content Rules — NEVER:
- Describe who a property/area is "perfect for" (no "great for retirees/families/singles")
- Say "safe," "low crime," "quiet neighborhood," or "dangerous"
- Rate schools as "good" or "best" — link to GreatSchools.org or school district sites instead
- Describe demographics of residents (racial, ethnic, religious, age composition)
- Use "exclusive," "restricted," "private" as community character descriptors
- Use "family-friendly," "empty nester," "bachelor," "couples only"
- Describe religious character of a community
- Provide crime statistics or safety comparisons between areas
- Steer by describing certain towns as better for certain groups

### Content Rules — ALWAYS:
- Describe physical property features, geography, landmarks, distances, amenities
- Cite objective data with sources (median prices, tax rates, elevation, climate)
- Link to third-party sources for schools, safety, demographics
- Use inclusive language: "residents," "homebuyers," "newcomers"
- Present facts and let readers draw their own conclusions
- Include Equal Housing Opportunity statement on every page
- Include Fair Housing disclaimer on blog posts

### Blog Post Disclaimers (required on every post):
- Equal Housing Opportunity statement
- "This content is for informational purposes only and does not constitute legal, financial, or tax advice."
- "Information is believed to be accurate but is not guaranteed. Buyers should verify all information independently."

---

## Project Overview

**Site:** coryhelpsyoumove.com
**Agent:** Cory Coleman, Keller Williams Great Smokies
**Office:** 96 W Sylva Shopping Area, Sylva, NC 28779
**Phone:** (828) 506-6413
**Email:** coryhelpsyoumove@gmail.com

**Tech Stack:**
- Vanilla JS/CSS single-page app (no framework)
- GitHub Pages hosting
- Supabase backend (auth, database, edge functions)
- Leaflet.js for maps
- Google Fonts: Cormorant Garamond (display) + Outfit (body)

**Key Files:**
- `index.html` (~1180 lines) — Homepage with property overlays, search, compare, chat
- `app.js` (~4600 lines) — All application logic, town page injection, overlays
- `styles.css` (~2172 lines) — All styles including print CSS and responsive
- `towns/*.html` (8 files) — Town landing pages
- `blog/*.html` (4 posts + index) — Blog content
- `events.html` — Community events page
- `404.html` — Custom animated 404 page
- `sitemap.xml` — XML sitemap (needs updates post-launch)
- `supabase-migrations.sql` — Database schema (needs to be run)

**Design Tokens:**
- Dark: `--bg:#0C0B09`, `--gold:#C4B08C`, `--cream:#F5F0E8`
- Light: `--bg:#F8F6F1`, `--gold:#8B7748`, `--cream:#1A1815`
- Animations: `fadeUp`, `cubic-bezier(0.16, 1, 0.3, 1)` easing, grain overlay via SVG fractalNoise

---

## Technical SEO Fixes

### 1. Sitemap Updates (`sitemap.xml`)
- [x] Add blog index: `https://coryhelpsyoumove.com/blog/`
- [x] Add `<lastmod>` dates to every entry
- [ ] Update sitemap whenever new pages are added (ongoing task)

### 2. Unique Town Page Meta Descriptions
All 8 towns have unique, character-specific descriptions (verified 2026-04-23):
- [x] **Waynesville** — Award-winning Main Street, arts district, Haywood County seat, gateway to Blue Ridge Parkway
- [x] **Sylva** — College-town energy, walkable downtown, Tuckasegee River, Jackson County courthouse
- [x] **Bryson City** — Great Smoky Mountains gateway, Nantahala Gorge, railroad town, outdoor recreation capital
- [x] **Maggie Valley** — Cataloochee ski access, elk viewing, vacation rental market, festival culture
- [x] **Cashiers/Highlands** — Luxury mountain plateau, 3,500+ ft elevation, gated communities, waterfalls
- [x] **Franklin** — Gem capital of the world, affordable land & acreage, Macon County, Appalachian Trail access
- [x] **Dillsboro** — Artisan village, Tuckasegee River, historic charm, walkable small-town character
- [x] **Cullowhee** — Western Carolina University, student housing investment, mountain campus community

### 3. Missing Meta Tags
- [x] `events.html` — `og:image`, `twitter:image`, `twitter:description`
- [x] `blog/index.html` — `og:image`, `twitter:image`, `twitter:description`
- [x] All 8 town pages — `twitter:description`
- [x] All blog posts — `twitter:description` (8 posts covered)

### 4. BreadcrumbList Schema
Added as a second `<script type="application/ld+json">` on every subpage (17 files confirmed):
- [x] All 8 town pages: Home → [Town Name]
- [x] All blog posts: Home → Blog → [Post Title]
- [x] Blog index: Home → Blog
- [x] Events page: Home → Events

### 5. Homepage Schema Address (`index.html`)
- [x] Full `streetAddress` / `addressLocality` / `addressRegion` / `postalCode` / `addressCountry` present

### 6. Lazy Loading (`index.html`)
- [x] `loading="lazy"` applied to below-fold images (16 instances confirmed)
- [x] Nav logos and hero badge correctly left un-lazy

### 7. Blog OG Images
- [x] Local hosting under `images/blog/` (no external Unsplash hotlinks)
- [x] `.webp` optimized versions present alongside `.jpg`
- [ ] `short-term-rental-rules-western-nc.html` and `is-waynesville-nc-good-place-to-retire.html` currently share generic hero images — consider adding dedicated OG art

### 8. FAQPage Schema
- [x] Added to all 8 town pages (verified 2026-04-23)
- [x] Added to top 3 blog posts 2026-04-24: `is-waynesville-nc-good-place-to-retire.html` (6 Q&A), `short-term-rental-rules-western-nc.html` (6 Q&A), `unrestricted-land-western-nc.html` (6 Q&A)

### 9. Title & Meta Rewrites — CTR Diagnostic (2026-04-24)
GSC showed 3 clicks on 1,030 impressions (0.3% CTR) at avg position 5.4. Top 3 queries were all Sylva-related with 876 combined impressions and zero clicks reported at "position 1.0", but live SERP inspection revealed the site does not actually appear in the visible SERP for "realtor sylva." Local Pack was dominated by other KW Great Smokies agents (Candy Wood 4.9 stars 50 reviews, Sundog Realty 4.7 stars 46 reviews) and the brokerage itself (3.7 stars 10 reviews, still showing wrong phone 828-586-4616). The main lever is GBP Local Pack ranking, not website copy, but:
- [x] Rewrote all 8 town page titles, meta descriptions, og:title/description, twitter:title/description to remove em dashes and differentiate from the identical "X NC Real Estate | Homes & Land for Sale | Cory Coleman" template
- [x] Fixed em dashes in 2 blog post meta descriptions (retire guide, STR guide)
- [ ] Body text of town pages and blog posts still contains extensive em dashes (`&mdash;` entities) — broader rewrite project, not tackled in this pass
- [ ] User to seed GBP Q&A (10 pairs drafted in chat session 2026-04-24)

---

## Keyword Strategy

### Principle
Target long-tail keywords where Zillow/Redfin are weak. Don't compete on head terms like "waynesville nc homes for sale" — portals will always win those. Instead, target informational queries, price-range queries, and feature-specific searches where expert content beats listing feeds.

### Tier 1: High-Intent Buyer Keywords (Per Town)

**Waynesville (Haywood County — median home ~$434K):**
| Keyword | Est. Monthly Searches | Competition |
|---|---|---|
| unrestricted land waynesville nc | 50-150 | Low |
| homes for sale waynesville nc under 400k | 30-90 | Low-Med |
| mountain view homes waynesville nc | 20-60 | Low |
| waynesville nc homes with acreage | 20-50 | Low |
| haywood county land for sale | 50-100 | Medium |
| fixer upper homes waynesville nc | 10-30 | Very Low |

**Sylva (Jackson County — median ~$360K):**
| Keyword | Est. Monthly Searches | Competition |
|---|---|---|
| homes for sale sylva nc under 300k | 30-70 | Low |
| sylva nc homes with mountain views | 10-30 | Very Low |
| land for sale jackson county nc | 40-80 | Medium |
| homes near tuckasegee river nc | 10-30 | Very Low |

**Bryson City (Swain County):**
| Keyword | Est. Monthly Searches | Competition |
|---|---|---|
| mountain cabins bryson city nc for sale | 40-100 | Low |
| bryson city nc log cabins for sale | 30-80 | Low |
| riverfront property bryson city nc | 10-30 | Very Low |
| homes near great smoky mountains nc | 50-150 | Medium |

**Maggie Valley (Haywood County):**
| Keyword | Est. Monthly Searches | Competition |
|---|---|---|
| maggie valley nc cabins for sale | 40-100 | Low |
| investment property maggie valley nc | 10-30 | Very Low |
| maggie valley vacation rental for sale | 10-20 | Very Low |

**Cashiers / Highlands (Jackson/Macon):**
| Keyword | Est. Monthly Searches | Competition |
|---|---|---|
| cashiers nc homes for sale | 100-300 | Med-High |
| cashiers nc land for sale | 30-70 | Medium |
| gated communities cashiers nc | 10-30 | Low |
| cashiers nc homes under 500k | 10-30 | Low |

**Franklin (Macon County — avg land $153K):**
| Keyword | Est. Monthly Searches | Competition |
|---|---|---|
| franklin nc homes with acreage | 30-70 | Low |
| unrestricted land franklin nc | 30-80 | Low |
| macon county nc land for sale | 40-100 | Medium |
| franklin nc homestead property | 10-20 | Very Low |

**Dillsboro (Jackson County — 5-15 listings):**
| Keyword | Est. Monthly Searches | Competition |
|---|---|---|
| dillsboro nc homes for sale | 10-30 | Very Low |
| dillsboro nc real estate | 10-30 | Very Low |

**Cullowhee (Jackson County — WCU market):**
| Keyword | Est. Monthly Searches | Competition |
|---|---|---|
| cullowhee nc homes near wcu | 10-20 | Very Low |
| cullowhee nc rental investment property | 10-20 | Very Low |
| homes for sale near western carolina university | 10-30 | Very Low |

### Tier 2: Informational / Research Keywords (Blog Targets)
| Keyword | Est. Monthly Searches | Competition |
|---|---|---|
| cost of living waynesville nc | 100-300 | Medium |
| is waynesville nc a good place to retire | 50-150 | Medium |
| moving to western north carolina | 100-300 | Med-High |
| short term rental rules western nc | 20-50 | Very Low |
| hurricane helene western nc real estate | 50-200 | Low |
| off grid land western nc | 30-70 | Low |
| waynesville nc neighborhoods guide | 10-30 | Low |
| best mountain towns to retire in nc | 50-150 | Medium |
| property tax rates haywood county nc | 10-30 | Low |

### Tier 3: Feature & Seasonal Keywords
- creek front property western nc
- fixer upper cabins western nc
- land for sale under 50k western nc
- snowbird homes western nc
- nc mountains real estate after helene

---

## Blog Content Calendar — First 90 Days

### Month 1
1. **"Is Waynesville NC a Good Place to Retire? A Local's Honest Take"** (2,500 words)
   - Target: `is waynesville nc a good place to retire`
   - Cover: cost of living, healthcare, walkability, recreation, neighborhoods, pros/cons
   - Links to: towns/waynesville.html, blog/mountain-towns-guide.html

2. **"Short-Term Rental Rules in Western NC: County-by-County Guide"** (2,000 words)
   - Target: `short term rental rules western nc`
   - Cover: Haywood, Jackson, Macon, Swain county rules, occupancy taxes, insurance
   - First-mover advantage — nobody has this content
   - Links to: towns/maggie-valley.html, towns/bryson-city.html, towns/franklin.html

3. **Expand existing unrestricted land guide** (+1,000 words)
   - Add county-specific septic/well requirements, financing info, FAQ section with FAQPage schema
   - Links to: all town pages

4. **"The Real Cost of Living in Western NC: 2026 Town-by-Town Breakdown"** (3,000 words)
   - Target: `cost of living western north carolina`
   - Comparison table of all 9 towns: median home price, rent, property tax, groceries, utilities
   - Hidden costs: well/septic, gravel roads, propane, flood insurance
   - Links to: every town page

### Month 2
5. **"Waynesville NC Neighborhoods: Where to Live"** (2,000 words)
   - Target: `waynesville nc neighborhoods`
   - Cover: Downtown/Main Street, Frog Level, Hazelwood, Laurel Ridge, Lake Junaluska
   - Only markfields.com has this — be the second authority

6. **"Hurricane Helene and WNC Real Estate: What Buyers Should Know"** (2,000 words)
   - Target: `hurricane helene western nc real estate`
   - Data: inventory up 41%, median down 2.5%, days on market 69-80, recovery timeline

7. **Update towns/waynesville.html** — Add FAQ section, price ranges, internal links

8. **"Off-Grid and Homestead Land in Western NC"** (2,000 words)
   - Target: `off grid land western nc`
   - Geographic gap — Retreat Realty covers north, nobody covers Haywood/Jackson/Macon

### Month 3
9. **Q1 2026 Market Update** (1,500 words)
   - Use Canopy Realtors data (canopyrealtors.com press releases)

10. **"Maggie Valley Investment Property: Your Guide to Mountain Rental Income"** (1,500 words)
    - Target: `investment property maggie valley nc`
    - Tourism drivers, turnkey cabins, rental management, seasonal income

11. **"Moving to Sylva NC: Everything You Need to Know"** (2,000 words)
    - Target: `moving to sylva nc`
    - Downtown, schools, WCU proximity, river recreation, brewery scene

12. **"Buying Creek-Front Property in Western NC"** (1,500 words)
    - Target: `creek front property western nc`
    - Flood zones, insurance, setbacks, property value premiums

### Ongoing Cadence
- 2 blog posts per month (1 informational guide + 1 market/update)
- 1 town page update per month (add FAQ, fresh stats, internal links)
- 1 quarterly market update (using Canopy Realtors MLS data)
- 1 GBP post per week (short-form: market stat, listing, event, tip)

### Future Blog Topics (Months 4-6+)
- Moving to Bryson City NC
- Student Housing Investment Near WCU
- Homes with Acreage in Franklin NC
- Gated Communities in Cashiers NC
- Can You Build a Tiny House in NC?
- Log Cabin Builders in Western NC
- Snowbird Guide: Winters in FL, Summers in WNC
- Best Time to Buy a Home in Western NC

---

## Competitor Analysis

### The Portal Problem (Don't Compete Here)
Zillow, Redfin, Homes.com, Realtor.com dominate head terms like "waynesville nc homes for sale." Don't target these. Instead, target longer variations and informational queries where portals have no content.

### Regional Competitors

**smokymountainhomes4sale.com (Jon Tharp Team / KW Franklin)**
- Strength: Massive IDX page count (price-range + property-type subpages for every town)
- Weakness: ZERO blog content, zero guides, zero educational content
- Gap: Content-driven approach wins on informational queries they completely ignore

**searchwnc.com (Western Carolina Properties)**
- Strength: Decades-old brand recognition
- Weakness: Dated website, no blog, limited content
- Gap: Modern content-rich site outperforms on all informational queries

**markfields.com (Mark Fields)**
- Strength: Excellent "Living in Waynesville" content, ranks for Waynesville info queries
- Weakness: Waynesville ONLY — ignores all other 8 towns
- Gap: Match his quality for Waynesville + cover 8 towns he ignores entirely

**awenasarealtygroup.com (RE/MAX Bryson City/Sylva)**
- Strength: Top agents in Bryson City and Sylva
- Weakness: No blog, no guides, no educational content
- Gap: Content-driven approach to their territory

**828realestate.com**
- Strength: One solid "Buying NC Mountain Land" guide
- Weakness: Single piece of content, no sustained strategy
- Gap: More detailed, more town-specific, part of larger content ecosystem

**Christie's & Meadows Mountain (Highlands/Cashiers)**
- Strength: Dominant in luxury segment
- Gap: Don't compete on luxury — target sub-$500K buyers and land buyers they ignore

### Content Gaps Where Cory Wins
| Gap | Current Competition |
|---|---|
| STR regulations guide for WNC | Nobody |
| Cost of living town-by-town comparison | Only generic national sites |
| Full 9-town expert content coverage | Nobody |
| Student housing / WCU investment angle | Completely untapped |
| Post-Helene buyer perspective from an agent | Only news outlets |
| Off-grid/homestead in southern WNC | Retreat Realty (only covers north) |
| Maggie Valley investment property content | Nobody |
| Dillsboro real estate content | Nobody (only IDX pages) |

---

## Local SEO Checklist (Manual Tasks for Cory)

### Google Business Profile (HIGHEST PRIORITY)

> **2026 ranking-factors update (full detail in `docs/seo-geo-action-plan-2026.md`).** Verified research (Whitespark/BrightLocal 2026 plus controlled Sterling Sky tests) reprioritizes this list. The factors that actually move the Local Pack are the **primary category** (the single #1 factor, already set), **NAP consistency**, profile **completeness** (Services, Opening Date, secondary categories), and **genuine review velocity** (the #2 factor, for both Local Pack and AI search). Several items below have **little-to-no measured ranking impact** and should be kept only for their UX/conversion value, not pursued as ranking levers: geo-tagging photos (Google strips EXIF on upload), keyword-stuffing the description (Google confirmed it is NOT a ranking field), keywords in review responses, high post volume, and Q&A volume. Do them if they help a real buyer. Do not expect ranking lift.

- [x] Claim profile at business.google.com (CLAIMED AND VERIFIED — confirmed 2026-04-23 via business.google.com/dashboard)
- [x] Primary category: Real Estate Agent (confirmed set)
- [ ] Secondary: Real Estate Consultant, Real Estate Service (verify in profile edit)
- [ ] Add all 9 towns as service areas
- [ ] Write 750-char description with natural keywords
- [ ] Upload 10+ photos (headshot, office, one per town) — **NOTE: one existing photo shows wrong phone `828-586-4616` instead of correct `828-506-6413` — needs removal or replacement**
- [ ] Populate Services list (currently empty — blocks Profile Strength from reaching 100%)
- [ ] Set Opening Date (currently blank)
- [ ] Set Special/Holiday hours
- [ ] Respond to pending 5-star review
- [ ] Seed Q&A section with 5-10 questions
- [ ] Post weekly (market stats, listings, events, tips)
- [ ] After every closing: send review link. Do NOT ask reviewers to include specific content (town names, keywords, etc.) — that violates Google's "requesting specific content" rule. Let them write their own words.

### Google Search Console
- [ ] Add property: https://coryhelpsyoumove.com
- [ ] Verify via DNS TXT record or HTML file
- [ ] Submit sitemap URL
- [ ] Monitor coverage and performance reports

### Local Citations (Consistent NAP everywhere)
```
Cory Coleman - Keller Williams Great Smokies
96 W Sylva Shopping Area
Sylva, NC 28779
(828) 506-6413
coryhelpsyoumove.com
```

Priority citation sites:
- [ ] Google Business Profile
- [ ] Zillow Agent Profile
- [ ] Realtor.com Agent
- [ ] Facebook Business Page
- [ ] Yelp
- [ ] Apple Maps (mapsconnect.apple.com)
- [ ] Bing Places (bingplaces.com)
- [ ] KW Agent Page (kw.com)
- [ ] Homes.com
- [ ] FastExpert
- [ ] Nextdoor Business
- [ ] Haywood County Chamber of Commerce
- [ ] Jackson County Chamber of Commerce
- [ ] Macon County Chamber of Commerce
- [ ] BBB
- [ ] Yellow Pages
- [ ] Manta
- [ ] Hotpads

### Backlink Strategy
- [ ] Join county chambers of commerce ($200-500/yr each — member directory backlinks)
- [ ] Sponsor local events (5K, school fundraiser — get listed on event sites)
- [ ] Partner with home inspectors, lenders, title companies for reciprocal links
- [ ] Pitch guest articles to Smoky Mountain News, The Mountaineer
- [ ] Contact WCU off-campus housing office for resource page link

---

## New Page Checklist (Standards for Every New Page)

Every page added to this site MUST have:
- [ ] `<title>` — unique, under 60 chars, includes primary keyword
- [ ] `<meta name="description">` — unique, 150-160 chars, includes keyword naturally
- [ ] `<link rel="canonical">` — self-referencing canonical URL
- [ ] `<meta property="og:title">` + `og:description` + `og:type` + `og:url` + `og:image`
- [ ] `<meta name="twitter:card">` + `twitter:title` + `twitter:description` + `twitter:image`
- [ ] `<script type="application/ld+json">` — appropriate schema (Article, RealEstateAgent, FAQPage, etc.)
- [ ] `<script type="application/ld+json">` — BreadcrumbList schema
- [ ] All images: descriptive alt text with relevant keywords
- [ ] Below-fold images: `loading="lazy"`
- [ ] Images hosted locally (no external URLs like Unsplash)
- [ ] Internal links to 2-3 related pages (links **out** of the new page)
- [ ] **Inbound links from at least 2 existing pages** (links **into** the new page) — see below
- [ ] Entry added to `sitemap.xml` with `<lastmod>` date
- [ ] H1 > H2 > H3 heading hierarchy (one H1 per page)
- [ ] `node scripts/check-orphan-pages.js` passes

### Bump the cache buster when you change app.js or styles.css (learned 2026-08-27)

Every page references these with a version query: `app.js?v=108`, `styles.css?v=108`.
`Cache-Control` on those files is `max-age=14400`, so **a fix that does not bump
`?v=` does not reach anyone who has visited before, for four hours.**

This was learned by shipping the `?listing=` deep-link fix (PR #112) without
bumping it. The live `app.js` on GitHub Pages contained the fix, `curl` confirmed
it, and the site still opened the wrong property in a real browser because the
cached HTML was still asking for `app.js?v=107`.

The version numbers had also drifted: `index.html` was on `app.js?v=107` /
`styles.css?v=103` while the other 18 pages were still on `v=103` / `v=97`, so
town and keyword landing pages were serving older JS and CSS than the homepage.
Everything is on `v=108` now. **Bump all of them together, to the same number.**

```bash
# after editing app.js or styles.css
grep -rno 'app\.js?v=[0-9]*\|styles\.css?v=[0-9]*' --include=*.html . | awk -F: '{print $3}' | sort | uniq -c
```

Verifying a deploy: `curl` bypasses the browser cache and will happily tell you
the fix is live while every real visitor still runs the old file. Load the page
with a throwaway query param (`?cb=123`) and check the actual `<script src>` in
the DOM before believing it shipped.

### Inbound Links Are Not Optional (learned the hard way, 2026-08-08)

A sitemap entry is **not a discovery path**. On 2026-08-08 we found 14 live pages sitting in GSC as "Discovered - currently not indexed" with **Last crawled: N/A**, four months after launch. All were in `sitemap.xml`, all were technically perfect. URL Inspection showed why:

```
Discovery
  Sitemaps        https://coryhelpsyoumove.com/sitemap.xml
  Referring page  https://coryhelpsyoumove.com/sitemap.xml
```

Referring page = the sitemap. The ten keyword landing pages only linked to *each other*, so Googlebot had no path in from an indexed page and never spent crawl budget on them. On a low-authority domain, sitemap-only discovery does not get you crawled.

**Where inbound links go:**
- **Town-specific landing pages** → the "Popular \<Town\> Searches" block (`class="town-listings"`) on the matching `towns/*.html`
- **Any keyword landing page** → the "Popular Searches" block (`id="popular-searches"`) on `index.html` — the homepage is the highest-authority page on the site
- **Blog posts** → a card in `blog/index.html` **plus** contextual links from 1-2 related existing posts
- Nav/footer links count, but Google discounts boilerplate. Contextual in-body links from indexed pages are what move the needle.

**Enforcement:** `scripts/check-orphan-pages.js` builds the internal link graph and fails if any `sitemap.xml` page has fewer than 2 distinct inbound links. Run it before every commit that adds a page. `--list` prints the full graph.

**Note:** `_generate-pages.js` at the repo root is untracked, stale, and would revert the April 2026 title rewrites if run. Town pages are hand-edited. Do not run it.

---

## MLS / IDX Integration — LIVE

Both feeds are wired up and running on production. Contact for Navica: tom@navicamls.net. API host: navapi.navicamls.net.

### Architecture
- **Navica (CSAR)** — `supabase/functions/navica-sync/index.ts`. Pulls Property, Member, Office, OpenHouse via RESO Web API.
- **MLS Grid (Canopy)** — `supabase/functions/mls-sync/index.ts`. Canopy MLS feed.
- Both write into a unified `mls_listings` table. MLS Grid compliance requires that displayed photos be stored on our own infrastructure (Cloudflare R2), not hotlinked.
- Sync state tracked in `mls_sync_state` table, keyed by `resource_type` (e.g. `Navica_Property`). Includes stale-lock auto-reset after 10 min.
- Photos: only the **winner** of each cross-MLS dedup group gets R2 storage — see "Cross-MLS dedup" below.

### Cross-MLS dedup (server-side winner flag)
Both CSAR and Canopy often carry the same physical property. Instead of storing both sets of photos and deduping in the browser, one row per group is elected the winner and only that row gets R2 photos.

- **Migration:** `supabase/migrations/20260406000001_winner_dedup.sql`
- **Columns on `mls_listings`:** `address_group_key`, `quality_score`, `media_count`, `is_winner`
- **Trigger:** `mls_listings_winner_recalc` fires on INSERT or UPDATE of `(address_group_key, quality_score, media_count, standard_status, mlg_can_view)` and calls `mls_recalc_winner(grp)`. It does **not** watch `is_winner`, so the recalc's own flag updates don't re-trigger.
- **Winner rule:** highest `quality_score` DESC, then `media_count` DESC, then `modification_timestamp` DESC, then `listing_key` ASC. Active / Pending / Active Under Contract preferred; fallback to any status so the group still has a "primary" row for UI attribution.
- **Quality score:** identical weights to the old client-side `_qualityScore` — photo presence dominates (+100), with small tiebreaks for sqft, lat/lng, description length, year built, and lot. Computed at sync time by `computeQualityScore` in `supabase/functions/_shared/dedup.ts`.
- **Address group key:** normalized street+city with suffix expansion (st → street, etc.). Computed at sync time by `computeAddressGroupKey` in `_shared/dedup.ts`. SQL equivalent `mls_normalize_key` exists in the migration for the one-time seed of existing rows.

### Flip handling and cleanup queue
If a listing on MLS B later gets better data than the current winner on MLS A, the trigger flips `is_winner` and queues the former winner for R2 cleanup after a **24h grace period** (absorbs transient sync glitches).

- **Queue table:** `mls_media_cleanup_queue` — `(listing_key, listing_id, reason, queued_at)`, service-role only
- **Worker:** `mls-sync` action `cleanup-orphan-media` — reads queue rows older than `graceHours` (default 24), double-checks the listing didn't reclaim winner status during the grace window, then deletes R2 objects under `listings/{listing_id}/` and clears `local_url` on `mls_media`. If the listing became a winner again, the queue entry is just dropped.
- **Cron:** `mls-cleanup-orphan-media` runs hourly at `:37` (`supabase/migrations/20260406000002_winner_cleanup_cron.sql`)

### Cron Jobs (pg_cron + pg_net)
- `navica-sync-properties` — every 15 min, `{action:"sync-active", resource:"Property", limit:500}`
- `navica-sync-full` — hourly at :05, all resources
- `mls-grid-*` crons — see `20260228000036_mls_grid_cron.sql`
- `media-refresh` — AM/PM cycles, 18 invocations 3 min apart, cursor in `sync_cursors` table
- `mls-grid-backfill-media` — every 2 min, downloads Canopy winner photos to R2 (losers are skipped via an `is_winner` check against `mls_listings` on each page)
- `mls-cleanup-orphan-media` — hourly at :37, processes the 24h-grace cleanup queue

### Site-Side Reader
- `app.js` MLS_GRID section loads only `is_winner=true` rows from Supabase, plus a small sibling projection for loser attribution (`listing_id`, `originating_system_name`, `attribution_contact`).
- `_attachMlsSources` builds the `mlsSources` array on each listing from the sibling map. Replaces the old client-side `_deduplicateListings` (deleted).
- Feature flag `MLS_GRID.enabled` at app.js:826.

### Historical: Slow Upserts → Stale Sync (resolved 2026-04-06)
On 2026-04-06 the Navica sync cursor was stuck ~10 days behind because `sync-active` was averaging ~3.8s per record (confirmed via `{limit:10}` returning in 38s). Root cause: both sync functions were calling `uploadMediaToR2` inline for each primary photo — a 1-2s synchronous HTTP round trip from the Supabase edge worker. At 500 records per cron body, each invocation would need ~31 minutes to finish, but edge functions kill at ~150s, so the cursor never advanced and every cron run redid the same work.

Fix: removed `uploadMediaToR2` from the `navica-sync` and `mls-sync` Property loops — the backfill-media cron already handles R2 asynchronously for winners only. If sync performance regresses again, check that no new synchronous external I/O has been added inside the per-record loop.

If the cursor gets stuck in `mls_sync_state`:
```sql
UPDATE mls_sync_state SET status='idle', error_message='manual reset'
WHERE resource_type IN ('Navica_Property','MLSGrid_Property');
```
Then invoke the function with a small limit (e.g. `{limit:20}`) a few times to walk it forward.

## Pending Features & Notes

### Supabase
- `supabase-migrations.sql` needs to be run (12 account features + admin dashboard tables)
- Tables: profiles, property_notes, viewing_history, showing_requests, availability_windows, property_questions, qa_library, price_history, alert_notifications, user_activity

### Pre-Production Checklist
- [x] Remove `devUnlock()` / `devLock()` functions (verified absent 2026-04-23)
- [ ] Run supabase-migrations.sql
- [x] Execute all technical SEO fixes (see Technical SEO Fixes section — complete as of 2026-04-23)
- [x] Submit sitemap to Google Search Console (verified submitted, Success status, 20 pages discovered)
- [x] Claim Google Business Profile (verified claimed 2026-04-23)

### MLS Grid IDX Compliance — Live-Data Verification (2026-04-24)
These passed architectural review (Canopy MLS compliance form, ticket #CMDLA00483263). After Canopy and Navica feeds went live, a full audit against production data found gaps in all three rules and a fix was shipped as `supabase/migrations/20260424000001_compliance_rule7_8_11b.sql` plus updates to both sync functions (`supabase/functions/mls-sync/index.ts` and `supabase/functions/navica-sync/index.ts`).

- [x] **Rule 7 — Address Withholding:** Verified via live anon REST on 2026-04-24. Gap found: 15 Active rows (9 Canopy + 6 CSAR) had `InternetAddressDisplayYN=false` yet still exposed `street_*` / `latitude` / `longitude` to the public. Fix: promoted `internet_address_display_yn` into a dedicated column, added one-time address masking for existing opt-outs, and every sync path (Canopy primary + sync-one + mini-backfill + backfill-closed, Navica primary + backfill-closed) now blanks `street_number/street_name/street_suffix/unit_number/latitude/longitude` when the seller opts out. `full_address` is a generated column and follows automatically.
- [x] **Rule 8 — Seller IDX Opt-Out:** Verified via live anon REST on 2026-04-24. Gap found: 6 Active Canopy rows had `InternetEntireListingDisplayYN=false` yet were still served to anon (e.g. CAR292869404 — `MlgCanUse=["BO","VOW"]`, no IDX, was exposed). Fix: promoted `internet_entire_listing_display_yn` + `mlg_can_use` into dedicated columns; sync writes `mlg_can_view = MlgCanView && InternetEntireListingDisplayYN && MlgCanUse.includes('IDX')`; new RLS policy `Public can read IDX-eligible active winners` enforces every gate at the database edge, so a direct REST call cannot see what the frontend filter would hide.
- [x] **Rule 11B — Data Removal on Refresh:** Verified via live anon REST on 2026-04-24. Incremental sync does capture status transitions (not just Actives — confirmed at `mls-sync/index.ts:188-189`), but the prior RLS policy only filtered on `mlg_can_view`, so 2,103 non-Active winner rows (1,413 Closed + 318 Canceled + 372 Expired) were still readable by anon even though the frontend filter excluded them. Fix: new RLS policy restricts anon SELECT to `standard_status IN ('Active','Active Under Contract','Pending')`. Non-Active rows are retained (agent-only CMA back-office still needs them) but admin-only via the existing `Admin can manage listings` policy.

### Review Collection Flow Compliance (2026-04-24)
The review flow (`review.html` + `supabase/functions/review-request/index.ts`) was rebuilt against Google's current review policies (Maps UGC "Prohibited & restricted content", April 2026 enforcement phase) and the FTC's October 2024 fake-reviews rule. The prior flow had six distinct violation patterns; all six are now removed.

**Policies in play:**
- Google: "Discourage or prohibit negative reviews, *or selectively solicit positive reviews* from customers."
- Google: Prohibits "Merchants requesting that staff solicit reviews that include specific content."
- Google: Reviews must "reflect a genuine experience" and not be "content that is not based on a real experience." April 2026 detection phase actively flags AI-generated / templated review content.
- FTC rule (Oct 2024): targets businesses that "only ask for reviews from people they think will leave positive ones." Fines up to $51,744 per violation.

**What was removed (violations in prior flow):**
1. **Star-gating branch** — `onRatingNext()` previously routed 5★ to public posting and 1–4★ to a private-only form. This was "selective solicitation" by Google's definition. Fix: one flow for every rating. Everyone sees the public posting links on the thank-you screen regardless of stars. Private feedback is no longer a branch; it's what happens automatically because every review lands in the moderation queue.
2. **`generateReview()` template generator** — Composed 3–4 sentence reviews from randomized arrays of openers, middles, standouts, and closings. Classic "content not based on real experience" + AI-generated pattern. Deleted entirely.
3. **Fallback standout text** — If reviewer left the textarea blank, the generator substituted phrases like "He made the whole process straightforward and stress-free." Reviewer could post a "review" they never wrote. Deleted with the generator.
4. **Suggestion chips** — 8 pre-written phrases ("Knew every neighborhood," "Local mountain home expert," etc.) that pasted into the textarea on click. "Influencing the contents of the review." Deleted.
5. **Auto-copy-to-clipboard on navigation** — Clicking "Post on Google" silently stuffed the clipboard. Replaced with a manual "Copy my review" button that the reviewer has to click themselves.
6. **SEO-coaching paragraph** — "Mentioning the town name, county, and whether you bought or sold helps search engines recommend Cory to other people." Telling reviewers what specific content to include is the same violation whether it's directed at staff or customers. Deleted.

**Also fixed:** `handleSubmit` previously set `is_published: rating === 5` to auto-publish 5-star reviews without moderation. Now every review lands with `is_published: false` and goes through admin approval. Businesses are allowed to curate their own testimonials page; the moderation queue is not review gating because it only affects the site's own testimonials widget, not whether the reviewer is invited to post on Google / Facebook / Yelp.

**What the new flow looks like:**
1. Email request (unchanged) — sent to every client after a closing.
2. Star rating selector (stars captured for internal testimonial display, not used to branch the flow).
3. Free-form textarea with neutral helper copy: "Reviews tend to be most useful when they describe what actually happened. The area you worked in, what the process was like, or specific details from the transaction are all worth mentioning. Write whatever feels right." No chips, no examples, no sentiment-leading prompts.
4. Thank-you screen shown to every reviewer regardless of rating: reviewer's own text is displayed, manual "Copy my review" button, public posting links for Google / Facebook / Yelp. No auto-copy. No star-based branching.
5. Review lands in moderation queue. Admin approves via existing dashboard before it appears on the public testimonials widget.

**Trade-offs Cory explicitly accepted:**
- 1–4 star reviewers now see the public posting links. In practice most self-select to private (industry data from Birdeye / Podium / SOCi consistently shows this), but the theoretical risk of a negative public review is the price of compliance.
- No more auto-publish of 5-star reviews to the site. Every review needs admin approval first.
- The template generator is gone. Cory has to trust clients to write in their own words. This is the entire point of the fix.

### Future Features
- Google Calendar sync for showing requests
- BBO feed integration from Canopy MLS (agent copy print fields)
- Email notifications via Resend for price drop alerts and saved search matches
