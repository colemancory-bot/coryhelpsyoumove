# CoryHelpsYouMove.com

Real estate site for Cory Coleman (Keller Williams Great Smokies) covering western North Carolina. Vanilla JS/CSS on GitHub Pages with a Supabase backend.

SEO comes first on this site. Weigh search impact on every page and content change.

## Fair Housing

All content must comply with the federal Fair Housing Act (42 U.S.C. 3601-3619) and the North Carolina State Fair Housing Act (Chapter 41A). The core rule: describe the property, not the people.

Protected classes (federal + NC): race, color, religion, national origin, sex (includes sexual orientation and gender identity), disability, familial status, affordable housing status (NC).

Never:
- Describe who a property or area is "perfect for" (no "great for retirees/families/singles")
- Say "safe," "low crime," "quiet neighborhood," or "dangerous"
- Rate schools as "good" or "best"; link to GreatSchools.org or the school district instead
- Describe demographics of residents (racial, ethnic, religious, age composition)
- Use "exclusive," "restricted," "private" as community character descriptors
- Use "family-friendly," "empty nester," "bachelor," "couples only"
- Describe the religious character of a community
- Provide crime statistics or safety comparisons between areas
- Steer by describing certain towns as better for certain groups

Always:
- Describe physical property features, geography, landmarks, distances, amenities
- Cite objective data with sources (median prices, tax rates, elevation, climate)
- Link to third-party sources for schools, safety, demographics
- Use inclusive language: "residents," "homebuyers," "newcomers"
- Present facts and let readers draw their own conclusions
- Include the Equal Housing Opportunity statement on every page

Every blog post also carries these disclaimers:
- Equal Housing Opportunity statement
- "This content is for informational purposes only and does not constitute legal, financial, or tax advice."
- "Information is believed to be accurate but is not guaranteed. Buyers should verify all information independently."

## Project facts

Use this NAP exactly, on the site and in every citation: Cory Coleman - Keller Williams Great Smokies, 96 W Sylva Shopping Area, Sylva, NC 28779, (828) 506-6413, coryhelpsyoumove.com. Email: coryhelpsyoumove@gmail.com

Stack: vanilla JS/CSS (no framework), Supabase (auth, database, edge functions), Leaflet maps, Google Fonts Cormorant Garamond (display) and Outfit (body).

Design tokens: dark `--bg:#0C0B09` `--gold:#C4B08C` `--cream:#F5F0E8`; light `--bg:#F8F6F1` `--gold:#8B7748` `--cream:#1A1815`. Animations use `fadeUp` with `cubic-bezier(0.16, 1, 0.3, 1)`; the grain overlay is an SVG fractalNoise.

## Where things are

- `index.html`, `app.js`, `styles.css`: homepage, all app logic (overlays, search, compare, chat, town page injection) and all styles (including print and responsive)
- `towns/*.html`: town landing pages, hand-edited
- Root `*.html`: keyword landing pages, about page, events, review flow, 404
- `blog/*.html`: posts, listed in `blog/index.html`
- `supabase/functions/`, `supabase/migrations/`: edge functions and schema; `workers/`: Cloudflare workers
- `docs/seo-strategy.md`: competitors, Google Business Profile, citations, backlinks
- `docs/seo-geo-action-plan-2026.md`: 2026 ranking-factor research and action plan
- `docs/keywords.md`: keyword targets by town and tier
- `docs/blog-content-calendar.md`: the original 90-day blog plan and future topics
- `docs/seo-fixes-log.md`: completed technical SEO work and the incidents behind the rules below
- `docs/mls-architecture.md`: MLS feeds, dedup, crons, stuck-sync recovery, IDX compliance audit
- `docs/review-flow-compliance.md`: why the review flow is built the way it is
- `docs/backlog.md`: open items and future features

## Build and deploy

There is no build step. GitHub Pages (Jekyll) serves the repo root from `main`, so merging to `main` deploys the site. `_config.yml` lists the paths kept off the public site; add new non-public directories there.

Edge functions deploy separately with the Supabase CLI (`supabase functions deploy <name>`), and workers with `wrangler deploy` from `workers/<name>/`. Tests: `node --test` from the repo root.

Do not run `_generate-pages.js` (untracked, repo root). It is stale and would revert the April 2026 title rewrites.

## New pages

Target long-tail queries where Zillow and Redfin are weak (informational, price-range, feature-specific), not head terms like "waynesville nc homes for sale".

Every new page needs:
- `<title>`: unique, under 60 chars, includes the primary keyword
- `<meta name="description">`: unique, 150-160 chars, keyword used naturally
- `<link rel="canonical">`: self-referencing
- `og:title`, `og:description`, `og:type`, `og:url`, `og:image`
- `twitter:card`, `twitter:title`, `twitter:description`, `twitter:image`
- JSON-LD schema for the page type (Article, RealEstateAgent, FAQPage, etc.) plus a separate BreadcrumbList JSON-LD block
- Descriptive alt text on all images; `loading="lazy"` below the fold; images hosted locally (no Unsplash or other external URLs)
- Links out to 2-3 related pages, and inbound links from at least 2 existing pages (see below)
- An entry in `sitemap.xml` with `<lastmod>`
- One H1, then H2 > H3 hierarchy
- `node scripts/check-orphan-pages.js` passing

## Inbound links

A sitemap entry alone does not get a page crawled on this domain. Every page needs inbound links from at least 2 existing, indexed pages:
- Town-specific landing pages: the "Popular \<Town\> Searches" block (`class="town-listings"`) on the matching `towns/*.html`
- Any keyword landing page: the "Popular Searches" block (`id="popular-searches"`) on `index.html`
- Blog posts: a card in `blog/index.html` plus contextual links from 1-2 related posts
- Nav and footer links count, but contextual in-body links matter more.

`scripts/check-orphan-pages.js` fails if any sitemap page has fewer than 2 distinct inbound links. Run it before every commit that adds a page; `--list` prints the link graph.

## Cache buster

Pages load `app.js?v=N` and `styles.css?v=N`, and those files are cached for four hours. After editing either file, bump `?v=` on every page, all to the same number. Check with:

```bash
grep -rno 'app\.js?v=[0-9]*\|styles\.css?v=[0-9]*' --include=*.html . | awk -F: '{print $3}' | sort | uniq -c
```

To verify a deploy, load the page in a browser with a throwaway query param (`?cb=123`) and check the `<script src>` in the DOM. `curl` bypasses the browser cache, so it can show a fix as live while visitors still get the old file.

## Reviews

The review flow (`review.html`, `supabase/functions/review-request/`) follows Google's review policy and the FTC fake-reviews rule. Keep it that way: one path for every star rating, no pre-written review text or suggestion chips, no automatic copy to clipboard, no coaching on what to write, and every review lands in moderation (`is_published: false`). When asking clients for a review, never request specific content such as town names or keywords.

## MLS display rules

- Two feeds, Navica (CSAR, `supabase/functions/navica-sync`) and MLS Grid (Canopy, `supabase/functions/mls-sync`), write into one `mls_listings` table.
- Displayed photos come from our own R2 storage, never hotlinked. Only the winner of each cross-MLS dedup group gets R2 photos, and the site reads `is_winner=true` rows.
- Never expose the address or coordinates when the seller opted out (`InternetAddressDisplayYN=false`). Never serve non-IDX rows, or rows outside Active, Active Under Contract and Pending, to anonymous users. RLS enforces both; keep it that way, and keep every sync path masking opted-out addresses.
- No synchronous external calls (such as R2 uploads) inside the per-record sync loop. They stall the sync cursor; photos go through the backfill-media cron.
