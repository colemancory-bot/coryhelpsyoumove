# Technical SEO fixes log

Completed technical SEO work and the incidents behind the standing rules, moved out of `CLAUDE.md`. The rules themselves (new-page checklist, cache buster, inbound links) are in `CLAUDE.md`; open items are also collected in `docs/backlog.md`.

## Technical SEO fixes (April 2026)

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

## Cache buster incident (2026-08-27)

This was learned by shipping the `?listing=` deep-link fix (PR #112) without
bumping it. The live `app.js` on GitHub Pages contained the fix, `curl` confirmed
it, and the site still opened the wrong property in a real browser because the
cached HTML was still asking for `app.js?v=107`.

The version numbers had also drifted: `index.html` was on `app.js?v=107` /
`styles.css?v=103` while the other 18 pages were still on `v=103` / `v=97`, so
town and keyword landing pages were serving older JS and CSS than the homepage.
Everything is on `v=108` now. **Bump all of them together, to the same number.**

## Orphan pages incident (2026-08-08)

A sitemap entry is **not a discovery path**. On 2026-08-08 we found 14 live pages sitting in GSC as "Discovered - currently not indexed" with **Last crawled: N/A**, four months after launch. All were in `sitemap.xml`, all were technically perfect. URL Inspection showed why:

```
Discovery
  Sitemaps        https://coryhelpsyoumove.com/sitemap.xml
  Referring page  https://coryhelpsyoumove.com/sitemap.xml
```

Referring page = the sitemap. The ten keyword landing pages only linked to *each other*, so Googlebot had no path in from an indexed page and never spent crawl budget on them. On a low-authority domain, sitemap-only discovery does not get you crawled.
