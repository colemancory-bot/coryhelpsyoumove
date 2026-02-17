# CoryHelpsYouMove.com — Project Documentation

## SEO IS THE #1 PRIORITY FOR THIS WEBSITE
Every code change, new page, and content addition must consider SEO impact. When in doubt, optimize for search.

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

## Technical SEO Fixes — TO DO (Post IDX Launch)

Execute these once real MLS/IDX data is live:

### 1. Sitemap Updates (`sitemap.xml`)
- [ ] Add blog index: `https://coryhelpsyoumove.com/blog/`
- [ ] Add `<lastmod>` dates to every entry (use actual last-modified date)
- [ ] Update sitemap whenever new pages are added

### 2. Unique Town Page Meta Descriptions
All 8 towns currently use identical template: "Explore homes, cabins, and land for sale in [Town], NC. [County] real estate with mountain views and Blue Ridge access."

Rewrite each to highlight the town's unique character:
- [ ] **Waynesville** — Award-winning Main Street, arts district, Haywood County seat, gateway to Blue Ridge Parkway
- [ ] **Sylva** — College-town energy, walkable downtown, Tuckasegee River, Jackson County courthouse
- [ ] **Bryson City** — Great Smoky Mountains gateway, Nantahala Gorge, railroad town, outdoor recreation capital
- [ ] **Maggie Valley** — Cataloochee ski access, elk viewing, vacation rental market, festival culture
- [ ] **Cashiers/Highlands** — Luxury mountain plateau, 3,500+ ft elevation, gated communities, waterfalls
- [ ] **Franklin** — Gem capital of the world, affordable land & acreage, Macon County, Appalachian Trail access
- [ ] **Dillsboro** — Artisan village, Tuckasegee River, historic charm, walkable small-town character
- [ ] **Cullowhee** — Western Carolina University, student housing investment, mountain campus community

### 3. Missing Meta Tags
- [ ] `events.html` — Add `og:image`, `twitter:image`, `twitter:description`
- [ ] `blog/index.html` — Add `og:image`, `twitter:image`, `twitter:description`
- [ ] All 8 town pages — Add `twitter:description`
- [ ] All 4 blog posts — Add `twitter:description`

### 4. BreadcrumbList Schema
Add to every subpage (towns, blogs, events) as a second `<script type="application/ld+json">`:
- [ ] All 8 town pages: Home → [Town Name]
- [ ] All 4 blog posts: Home → Blog → [Post Title]
- [ ] Blog index: Home → Blog
- [ ] Events page: Home → Events

### 5. Homepage Schema Address (`index.html` lines 43-47)
- [ ] Update address from region-only to full address:
```json
"address": {
  "@type": "PostalAddress",
  "streetAddress": "96 W Sylva Shopping Area",
  "addressLocality": "Sylva",
  "addressRegion": "NC",
  "postalCode": "28779",
  "addressCountry": "US"
}
```

### 6. Lazy Loading (`index.html`)
- [ ] Add `loading="lazy"` to area card images (lines 364-371)
- [ ] Add `loading="lazy"` to blog card images (lines 438+)
- [ ] Add `loading="lazy"` to about section image (line 336)
- [ ] Do NOT add to nav logos or hero badge (above fold)

### 7. Blog OG Images
- [ ] Download Unsplash images, optimize as WebP, host locally in `images/blog/`
- [ ] Update og:image and twitter:image URLs in all 4 blog posts to local paths

### 8. FAQPage Schema
- [ ] Add to any page with Q&A or FAQ content (blog posts, town pages after FAQ sections added)

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
- [ ] Claim profile at business.google.com
- [ ] Primary category: Real Estate Agent
- [ ] Secondary: Real Estate Consultant, Real Estate Service
- [ ] Add all 9 towns as service areas
- [ ] Write 750-char description with natural keywords
- [ ] Upload 10+ photos (headshot, office, one per town)
- [ ] Seed Q&A section with 5-10 questions
- [ ] Post weekly (market stats, listings, events, tips)
- [ ] After every closing: send review link, ask them to mention the town

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
- [ ] Internal links to 2-3 related pages
- [ ] Entry added to `sitemap.xml` with `<lastmod>` date
- [ ] H1 > H2 > H3 heading hierarchy (one H1 per page)

---

## Pending Features & Notes

### MLS / IDX Integration
- Provider: Navica RESO Web API via Carolina Smokies Association of Realtors
- Cost: ~$100/month for raw API feed
- API Host: navapi.navicamls.net
- Contact: tom@navicamls.net
- Need three-party agreement: CSAR + KW Great Smokies + Cory/site
- Prefer RESO Web API over legacy RETS

### Supabase
- `supabase-migrations.sql` needs to be run (12 account features + admin dashboard tables)
- Tables: profiles, property_notes, viewing_history, showing_requests, availability_windows, property_questions, qa_library, price_history, alert_notifications, user_activity

### Pre-Production Checklist
- [ ] Remove `devUnlock()` / `devLock()` functions
- [ ] Run supabase-migrations.sql
- [ ] Set up Navica API feed
- [ ] Execute all technical SEO fixes (Section above)
- [ ] Submit sitemap to Google Search Console
- [ ] Claim Google Business Profile

### Future Features
- Google Calendar sync for showing requests
- BBO feed integration from Canopy MLS (agent copy print fields)
- Email notifications via Resend for price drop alerts and saved search matches
