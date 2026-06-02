# SEO & GEO Action Plan — Google's 2025–2026 Changes

> Created 2026-06-02. Built from an adversarially-verified deep-research pass (25 sources, 114 claims extracted, 25 verified by 3-vote panels, 23 confirmed / 2 SEO-blog myths refuted) plus a current-state audit of this repo.
>
> **Confidence key:** `[CONFIRMED]` = primary Google source or gold-standard study. `[EXPERT-OPINION]` = Whitespark/BrightLocal 2026 survey (aggregated expert opinion, not Google-confirmed weights). `[FORWARD-LOOKING]` = announced but unlaunched.

---

## TL;DR — the strategic read

Google reoriented Search around AI. AI Overviews now sit at the top of ~85% of result pages and AI Mode passed 1B+ monthly users. On queries that trigger an AI Overview, organic clicks roughly **halve**, and the AI summary's own citations return almost nothing (~1% of AI-summary visits click a source). `[CONFIRMED]`

But the response is **not** a rebuild. Google's own May 2026 developer guide is blunt: there is **no separate "AI SEO."** AI Overviews and AI Mode run on the core ranking system, so the same people-first, locally-authoritative content and clean technical structure that win organic also win AI features. `[CONFIRMED]`

For a single local agent, the highest-leverage moves are mostly **off the website**: Google Business Profile completeness (the #1 Local Pack lever) and genuine review velocity (#2 for both Local Pack *and* AI visibility). The website's job is to keep being the thing portals and other KW agents aren't: a source of unique local expertise.

**The biggest risk is wasted effort**, in two directions:
1. **AI gimmicks Google says to skip** — llms.txt, extra "AI schema." Google explicitly says don't.
2. **GBP busywork the data shows is inert** — geo-tagged photos, keyword-stuffed descriptions, posting-for-ranking, Q&A seeding. (Several of these are currently recommended in `CLAUDE.md` and need correcting — see §6.)

This site is already in good shape: rich schema, FAQ/Breadcrumb everywhere, static crawlable town prose, wide-open robots.txt. The plan below is mostly *protect what works, stop the inert stuff, and double down on the two real levers.*

---

## 1. What actually changed (confirmed)

| # | Change | What it means for Cory | Confidence |
|---|---|---|---|
| 1 | **AI Overviews + AI Mode dominate the top of the SERP.** AI Mode 1B+ users; AIO at top of ~85% of pages. | The page a searcher sees is increasingly an AI answer, not 10 links. Winning = being cited *or* ranking high enough to survive above-the-fold compression. | CONFIRMED (Google I/O 2026; SEJ field study) |
| 2 | **AIO roughly halves organic CTR on affected queries; in-answer citations don't recover it** (~1% click in-summary). | Don't chase AI citations for *traffic* — the value is brand exposure. The traffic defense is targeting intents AIOs trigger on *less* (transactional listing/"contact an agent" searches) where a click is still the goal. | CONFIRMED (Pew browser-tracking; Ahrefs 300k-kw; direction unanimous across 12+ studies — exact % softer) |
| 3 | **No separate AI-SEO discipline.** Generative features are rooted in core ranking. | The existing SEO investment *is* the AI strategy. No overhaul warranted. | CONFIRMED (Google May 2026 guide) |
| 4 | **Google's #1 named lever for AI visibility = valuable, non-commodity content + sound technical structure.** Google: this "more than any other suggestion." | Directly validates the content-driven strategy. Cory's genuine local expertise (STR rules, cost-of-living, neighborhood guides, post-Helene perspective) is exactly what wins; thin/duplicative listing-feed pages lose hardest. | CONFIRMED (Google May 2026 guide) |
| 5 | **Core updates ran ~quarterly:** Mar 2025, Jun 2025, Dec 2025, Mar 2026, May 2026. Helpful-content system folded into core updates. | Expect roughly quarterly ranking wobble as *normal*. Correlate any traffic shift to these dated windows before assuming a site problem. | CONFIRMED (Search Status Dashboard) |
| 6 | **Core-update discipline:** small drops → take *no* drastic action, don't change content already performing; large sustained drops → whole-*site* (not page) people-first self-assessment. | Don't gut working town/blog pages after every update. Reserve big rework for genuine sustained sitewide declines. | CONFIRMED (Google core-updates doc) |
| 7 | **GBP is the dominant Local Pack lever (~32%); primary category is the single top factor.** | GBP completeness is local priority #1. The website *alone* cannot win the Local Pack — matches this project's own "realtor sylva" finding. | EXPERT-OPINION (Whitespark/BrightLocal 2026) |
| 8 | **Reviews = #2 for BOTH Local Pack (20%, up from 16%) and AI visibility (16%).** Signals: rating, # of native Google reviews *with text*, recency, steady growth. | Genuine review velocity is the #2 lever — but must run inside the already-built compliant flow (no selective solicitation, no star-gating, no coached content, full moderation). | EXPERT-OPINION (Whitespark/BrightLocal 2026) |
| 9 | **2026 = first year AI visibility measured separately.** Mix: on-page content **24% (#1)**, reviews 16%, citations 13%, links 13%, GBP 12%. | For *local AI* answers the lever tilts from GBP toward on-page content quality + consistent NAP citations + earned backlinks (chambers, local press, WCU link). | EXPERT-OPINION (Whitespark/BrightLocal 2026) |
| 10 | **Google "information agents"** (summer 2026, AI Pro/Ultra first) will monitor blogs/news/social for changes. | Fresh, timestamped, factual local content (quarterly market updates, regulation changes) positions the site as a monitored source. Low priority — unlaunched. | FORWARD-LOOKING (Google I/O 2026) |

**Two widely-repeated claims were refuted (0–3) and excluded:** that the Dec 2025 core update specifically "enforced E-E-A-T / penalized fake freshness," and that the Jun 2025 update was a "hidden gems" tailwind for small sites. Both were unsupported SEO-blog speculation — **do not plan around them.**

---

## 2. What this does NOT require — stop / don't-start list

Spending zero effort here is a deliverable, not a gap:

- ❌ **Don't build an `llms.txt`.** Google says it's unnecessary; AI crawlers don't even request it (server-log studies); Mueller equated it to the dead `keywords` meta tag. `[CONFIRMED]`
- ❌ **Don't add "AI schema" or pile on structured data for AI.** Google: "there's no special schema.org structured data that you need to add" and lists "overfocus on structured data" as a thing to ignore. *(Keep existing schema — it's for rich results, not AI.)* `[CONFIRMED]`
- ❌ **Don't gut working pages after a core update.** Google explicitly recommends *against* changing content that's already performing. `[CONFIRMED]`
- ❌ **Don't do GBP busywork as a ranking play:** geo-tagged photos (Google strips EXIF on upload), keyword-stuffed GBP description (Google confirmed it's not a ranking field), keywords in review responses, high post *volume*, Q&A *volume*. All measured at little-to-no Local Pack impact, several confirmed by controlled Sterling Sky tests. `[EXPERT-OPINION + controlled tests]`
  - *Nuance:* posts/photos still have UX/conversion value, and Q&A still answers real buyer questions — just don't treat them as ranking levers or chase a cadence for SEO's sake.

---

## 3. The plan — prioritized

### Tier 1 — Highest leverage (mostly Cory's manual work, off-site)

**1.1 — Finish Google Business Profile to 100%.** *(Owner: Cory. Impact: highest. The single biggest local lever.)*
- Confirm **primary category = Real Estate Agent** (the #1 factor).
- Populate **Services** (currently empty — blocks Profile Strength), set **Opening Date**, add secondary categories, all 9 service-area towns.
- Replace the photo showing the **wrong phone (828-586-4616)** with correct (828-506-6413).
- Keep NAP identical to the citation block in `CLAUDE.md` everywhere.
- *This is unchanged advice — the 2026 data just confirms it's the right #1 priority.*

**1.2 — Build genuine review velocity, compliantly.** *(Owner: Cory. Impact: #2 lever for local AND AI.)*
- After every closing, send the review link via the already-rebuilt `review.html` flow. Ask for an honest review; **let clients write their own words** (no town names/keywords coaching — that's the violation the flow was rebuilt to avoid).
- What moves the needle: **volume + recency + authenticity** of native Google reviews with text. Steady trickle > burst.
- Respond to every review (normal, human responses — not keyword-stuffed).
- *Open question for Cory: realistic monthly closing volume → realistic review cadence. This is the lever most likely to close the gap vs. the established KW competitors (Candy Wood, Sundog) noted in CLAUDE.md.*

**1.3 — Keep publishing non-commodity local expertise.** *(Owner: Cory + me. Impact: Google's #1 named AI lever AND #1 local-AI on-page factor.)*
- Stay on the existing content calendar (2 posts/mo + monthly town-page refresh + quarterly market update).
- Prioritize topics where Cory has first-hand experience and portals have nothing: county STR rules, cost-of-living breakdowns, neighborhood guides, post-Helene buyer perspective, off-grid/homestead, WCU investment angle.
- Quality bar: would a local expert recognize this as insider knowledge, or is it rephrased listing-feed filler? AIOs suppress the latter hardest.

### Tier 2 — Site / code changes (I can do these)

**2.1 — Remove the self-serving `aggregateRating` from `index.html`.** *(Impact: compliance hygiene. Effort: 2 min.)*
- The schema currently self-declares `5 stars / 3 reviews` on the `RealEstateAgent`. Self-serving review markup on a LocalBusiness subtype is **ineligible for star rich results** and Google advises against adding it — it won't earn stars and is technically non-compliant.
- *Note: this is pre-existing hygiene, not a 2025-2026 change.* The reviews that actually count for ranking live on the **GBP**, not in your own page's markup.
- Recommendation: remove the `aggregateRating` block. (Real Google reviews still drive the #2 ranking lever via GBP.)

**2.2 — Add an author / `Person` E-E-A-T entity.** *(Impact: medium — aligns with the lens Google prescribes for sustained-drop recovery and YMYL-adjacent content. Effort: moderate.)*
- Add a `Person` schema for Cory (name, jobTitle, `worksFor` KW Great Smokies, `hasCredential` NC license, `sameAs` social, `knowsAbout`), and reference him as `author` on blog `Article` schema.
- Add a visible author byline + short bio block on blog posts (real experience signals: years in market, license #, "lives in / works across these towns").
- *Frame honestly: this is best-practice E-E-A-T reinforcement, not a fix for the refuted "Dec 2025 E-E-A-T crackdown."*

**2.3 — Protect crawlability (mostly already good).** *(Impact: foundational. Effort: low — verify + monitor.)*
- ✅ Town-page prose is static HTML (verified) — crawlable. Good.
- The MLS listing cards are JS-injected from Supabase; that's acceptable (commodity content, portals win those, IDX duplication is a known non-asset). No action needed beyond awareness.
- Keep semantic HTML and clean internal linking. No JS-rendering changes required.

**2.4 — Tilt content/internal-linking toward AIO-resistant transactional intent.** *(Impact: protects clickable traffic. Effort: ongoing.)*
- Informational queries ("is Waynesville a good place to retire") increasingly get eaten by AI Overviews — keep them for brand/authority but don't expect the clicks.
- Make sure **transactional** intents (homes-for-sale-under-$X, "contact an agent," specific-feature land searches) have strong landing surfaces and clear CTAs — these trigger AIOs less and still convert to a site visit + lead.

### Tier 3 — Measurement & discipline

**3.1 — Measure real AIO exposure.** Spot-check the top target queries ("realtor sylva," "unrestricted land waynesville nc," "homes for sale [town] under [price]") in a clean/incognito SERP and note which trigger an AI Overview. That tells us how much of the ~50% CTR risk is real vs. insulated. *(Open question #1 from research.)*
**3.2 — GSC + core-update calendar.** Watch Search Console against the dated core-update windows (next expected ~late summer / Q3 2026). Treat quarterly wobble as normal; only act on sustained sitewide decline — and then at the site-overall people-first level, not by gutting pages.

### Tier 4 — Forward-looking (low priority, speculative)

**4.1 — Publishing cadence feeds "information agents."** The quarterly-market-update / fresh-data habit already positions the site for the summer-2026 monitoring agents. No new work — just keep timestamps accurate and data factual.
**4.2 — Off-Google engines (ChatGPT/Perplexity).** Google's "it's just SEO" guidance is scoped to Google. Off-Google engines may weight brand mentions/links more. The lever there is the same backlink/citation work already in CLAUDE.md (chambers, local press, WCU) plus being mentioned around the web — not on-site gimmicks.

---

## 4. What I can do right now vs. what's yours

| Action | Owner | Status |
|---|---|---|
| 2.1 Remove self-serving `aggregateRating` | Me (code) | ✅ Done 2026-06-02 (removed from `index.html`; JSON-LD re-validated) |
| 2.2 Add author E-E-A-T | Me (code) | ✅ Done 2026-06-02 — schema author was *already* rich; added the missing **visible byline** (author + license + `<time>` date) to all 7 blog posts |
| 6. Correct stale GBP guidance in `CLAUDE.md` | Me (docs) | ✅ Done 2026-06-02 (2026 ranking-factors note added to GBP section) |
| 3.1 Measure AIO exposure on target queries | Me (research) | ✅ Done 2026-06-02 — intent-based assessment in §8 (live per-query check still needs an incognito/rank-tracker eyeball) |
| 2.4 Audit transactional landing surfaces / CTAs | Me (review) | Ready on your OK |
| 1.1 GBP completion | Cory | Manual |
| 1.2 Review requests after closings | Cory | Manual (flow already built) |
| 1.3 Keep publishing | Cory + me | Ongoing |

---

## 5. Open decisions for Cory

1. **AIO exposure check** — want me to run the SERP spot-check on your top ~10 target queries and report which get AI-Overview'd? (Determines how exposed you actually are.)
2. **`aggregateRating`** — OK to remove it? (It's not earning stars and is non-compliant; real reviews count via GBP regardless.)
3. **Review cadence** — what's your realistic monthly closing count? Sets a concrete, compliant review-velocity target.
4. **CLAUDE.md correction** — OK to update the now-falsified GBP tactics (see §6)?

---

## 6. Corrections needed to `CLAUDE.md`

The "Local SEO Checklist" recommends tactics the 2026 data shows are inert as ranking levers. These should be re-labeled (keep for UX/conversion value, drop as ranking plays):

- "Upload 10+ photos … one per town" — fine for profile completeness/UX; **geo-tagging them does nothing** (EXIF stripped on upload).
- "Write 750-char description with natural keywords" — fine to write; **the description is not a ranking field** (Google-confirmed). Write it for humans, not keywords.
- "Post weekly (market stats, listings…)" — fine for engagement; **post volume is not a measured ranking lever** (Sterling Sky 9-week test: zero movement).
- "Seed Q&A section with 5-10 questions" — fine for answering buyers; **Q&A volume is not a ranking lever.**

Net correction: **redirect that effort to reviews, primary category, and NAP consistency** — the factors that actually move the Local Pack.

---

## 7. Sources & confidence notes

- **Treat as authoritative:** Google's May 2026 generative-AI optimization guide, the core-updates doc (updated Dec 2025), the I/O 2026 blog, and Pew's browser-tracking study.
- **Treat directionally:** AIO CTR-loss magnitudes (correlational, not causal; Google disputes the methodologies but offers no counter-data; 12+ studies agree on direction).
- **Treat as expert opinion:** every local-ranking *weight* (32% GBP, 20% reviews, 24% on-page AI, the no-impact list) comes from one source family — the Whitespark 2026 survey via BrightLocal. The "no-impact" items are additionally backed by controlled tests, which makes those specifically stronger.
- **Field moves quarterly.** Re-verify AIO behavior and CTR data before any major bet; the "information agents" surface is unlaunched.

Key URLs: Google generative-AI guide (`developers.google.com/search/docs/fundamentals/ai-optimization-guide`), Google core-updates doc (`developers.google.com/search/docs/appearance/core-updates`), Google I/O 2026 (`blog.google/.../search-io-2026/`), Pew (`pewresearch.org/short-reads/2025/07/22/...`), Ahrefs AIO study (`ahrefs.com/blog/ai-overviews-reduce-clicks-update/`), BrightLocal 2026 ranking factors (`brightlocal.com/learn/google-local-algorithm-and-ranking-factors/`).

---

## 8. Appendix — AIO exposure by query intent (added 2026-06-02)

**Method note:** live per-query AI-Overview presence was not directly measurable with available tooling and should be spot-checked in an incognito browser or a rank tracker that flags AIO (research open question #1). The classification below is **intent-based**: AI Overviews trigger heavily on informational/question queries and far less on transactional and local-commercial intent. Use it to set expectations, not as measured SERP data.

**Most exposed to AIO click loss** *(informational/question — expect the answer to appear in the AI Overview; value shifts to brand/authority + AI citation, not raw clicks):*
- is waynesville nc a good place to retire
- cost of living waynesville nc / western north carolina
- moving to western north carolina / moving to sylva nc
- best mountain towns to retire in nc
- what is unrestricted land / off grid land western nc
- property tax rates haywood county nc
- hurricane helene western nc real estate
- short term rental rules western nc *(high AIO risk but near-zero competition, so keep it for authority + AI citation)*

→ Keep publishing these (they build topical authority, E-E-A-T, and AI-citation surface), but don't model them as traffic drivers. Make sure each gives a reason to click through (local data, a tool, a CTA) that an AI summary can't replicate.

**Relatively insulated** *(transactional + local-commercial — AIOs trigger less; the click is still winnable; this is where to chase ranking + conversions):*
- homes for sale [town] nc under [price]
- unrestricted land waynesville nc / franklin nc
- mountain cabins / log cabins bryson city nc for sale
- maggie valley nc cabins for sale
- cashiers nc homes for sale / under 500k
- land for sale jackson county nc / macon county nc
- homes near tuckasegee river nc

**Local Pack territory** *(not AIO — Maps/Local Pack dominates; the GBP levers in §1.1–1.2 are the play, not on-page copy):*
- realtor sylva / real estate agent sylva nc
- [town] nc real estate agent
- realtor near me

**Takeaway:** Cory's transactional town keywords and "realtor [town]" queries are the *least* exposed to the AIO CTR collapse and the *most* winnable. The blog's informational keywords are the *most* exposed. That argues for keeping the blog for authority/citation while making sure the transactional surfaces (town pages, listing CTAs, contact paths) are strong, because that is where a click still converts to a lead.

---

## 9. Transactional surface audit (item 2.4, done 2026-06-02)

Audited the conversion paths for the AIO-insulated, click-winnable queries from §8 (homes/cabins/land for sale, "realtor [town]").

**Strong already (keep):**
- Town pages carry real transactional surfaces: a property search (type / beds / baths / price slider), a featured-listings grid, a transactional FAQ (median price, taxes, STR, unrestricted land), and a phone CTA. Consistent across all 8 towns.
- Homepage `#contact` is a complete lead form (name / email / phone / "I'm interested in" / message) with a 24-hour-response promise and a privacy reassurance. Strong.
- Internal linking is healthy both directions: blog posts link to town pages ("Related:"), town FAQs link to the relevant blog guide, footer links every town + homepage sections.
- GA4 fires a `search` event on property search.

**Fixed in this pass:**
- ✅ **CTA was phone-only.** Added a secondary "Send a Message" button (to the homepage consultation form) beside the "Call" button on all 8 town pages. Captures buyers (especially out-of-state relocators) who won't cold-call.

**Recommendations (need a decision):**

| # | Finding | Impact | Effort |
|---|---|---|---|
| A | **No crawlable URLs for price-band / feature queries.** Search runs through a JS overlay (`openSearchResults`) with no indexable page, so "homes for sale [town] under $400k", "cabins for sale bryson city", "unrestricted land franklin" (all in the keyword strategy) have no page to rank. The town page only ranks for the broad "[town] real estate." Single biggest transactional-SEO gap. Fix: pre-generate static, indexable landing pages/sections per top price-band + property-type per town (the repo already has `_generate-pages.js` to extend). | High | High |
| C | **Town pages bounce contact to the homepage** (`index.html#contact`), losing town context. Option: pass the town into the form (prefill the message / hidden field) so Cory knows the market, or add a compact inline form on town pages. | Medium | Medium |
| D | **Transactional payload depends on JS listings that can fail.** Featured-listings grids are JS-injected and the MLS query was observed timing out in local preview. If the grid is empty, the core "Homes & Land for Sale" section renders bare. Add an always-present fallback (e.g., a static "Browse all [town] listings" link). | Medium | Low–Med |
| E | **"Unrestricted/restricted" filter is gated behind account creation.** "unrestricted land [town]" is a high-intent query in the strategy; gating that exact filter adds friction for those searchers. Trade-off (lead capture vs. friction) worth a conscious choice, e.g. let it run once free, then gate. | Low–Med | Low |

**Net:** the conversion foundation is solid and now has a non-phone path on every town page. The highest-leverage remaining move is **A** (indexable price-band/feature pages), because those are exactly the queries §8 flagged as winnable and AIO-insulated.

**Progress update (2026-06-02, cont.):**
- ✅ **D done.** `app.js` now degrades gracefully when the MLS load fails/times out: `_townFeaturedFallback` renders a "Browse [Town] Listings" CTA, a 12s watchdog swaps a stuck loading spinner, and the empty-listings path shows the fallback instead of a bare section.
- 🚧 **A in progress.** Reference page built and verified: `mountain-cabins-bryson-city-nc.html` (~965 words unique content, CollectionPage/BreadcrumbList/FAQPage schema, pre-filtered search CTA). Rolling out 6 more (Waynesville under $400k, Maggie Valley cabins, Franklin unrestricted land, Sylva under $300k, Cashiers under $500k, Waynesville acreage). "Bryson City log cabins" dropped to avoid duplicating the cabins reference page.
- 🔎 Investigating the intermittent MLS **statement timeout** (root cause of the empty grids D now covers).
