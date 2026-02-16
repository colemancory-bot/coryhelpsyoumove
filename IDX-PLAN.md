# Custom IDX Feed — Build Plan

**Goal:** Replace SimplyRETS with a direct MLS data feed stored in Supabase.
**Why:** No middleman, $0/month ongoing, full data ownership, faster queries, unlimited customization.

---

## MLS Feeds

The sync engine is built to support multiple MLSs. Each feed pulls into the same `listings` table with a `source_mls` field so we know where each listing came from. Deduplication handles properties that appear in more than one MLS.

| MLS | Status | Coverage |
|---|---|---|
| **Carolina Smokies MLS** | Pending setup | Western NC mountains |
| **Canopy MLS** | Pending setup | Greater Charlotte / Western NC |
| **Highlands Cashiers MLS** | Future | Highlands, Cashiers, Sapphire area |

Adding a new MLS = add credentials + field mapping. The sync engine handles the rest.

---

## Prerequisites (Cory's action items)

### Carolina Smokies MLS
- [ ] Contact Carolina Smokies MLS about RESO Web API or RETS feed access for IDX
- [ ] Get approved (typically 1-3 weeks)
- [ ] Receive credentials (server URL, API key or username/password)
- [ ] Confirm IDX compliance requirements (disclaimers, update frequency, photo rules)

### Canopy MLS
- [ ] Contact Canopy MLS (or ask KW broker) about RESO Web API or RETS feed access for IDX
- [ ] Get approved (typically 1-3 weeks)
- [ ] Receive credentials (server URL, API key or username/password)
- [ ] Confirm IDX compliance requirements (disclaimers, update frequency, photo rules)

### Highlands Cashiers MLS (future)
- [ ] Subscribe when ready
- [ ] Same process: request RESO Web API / RETS access, get credentials

---

## Phase 1 — Data Sync Engine

- [ ] Supabase `listings` table: full schema for all MLS fields (address, price, beds, baths, sqft, lot, type, status, photos, description, coordinates, year built, days on market, MLS ID, source_mls, etc.)
- [ ] Supabase Edge Function: scheduled sync every 15-30 minutes
- [ ] Multi-MLS support: pull from Carolina Smokies + Canopy independently
- [ ] Per-MLS field mapping config (each MLS may name fields differently)
- [ ] Deduplication: same property in multiple MLSs → keep most recent
- [ ] Handle new listings, price changes, status changes, delisted/sold
- [ ] Photo URL handling (hotlink from MLS or store in Supabase Storage)
- [ ] City-to-town-slug mapping (MLS city names to your town pages)
- [ ] Sync log table: every run records timestamp, MLS source, listings processed, errors, duration
- [ ] Designed so adding Highlands Cashiers MLS (or any future MLS) is just config — no code changes

## Phase 2 — Site Integration

- [ ] Replace SimplyRETS API calls with reads from Supabase `listings` table
- [ ] Update `ALL_LISTINGS` and `TOWN_LISTINGS` to pull from own database
- [ ] Featured listings, town pages, search results all read from local data
- [ ] Property detail overlay pulls full listing data including all photos
- [ ] IDX compliance disclaimers (MLS logo, last updated timestamp, broker attribution)

## Phase 3 — Monitoring & Alerts

- [ ] Sync health checks: alert if sync fails
- [ ] Stale data detection: alert if listings haven't updated in 1+ hours
- [ ] Error logging: detailed logs in Supabase for debugging
- [ ] Graceful fallback: site shows last good data if sync fails
- [ ] Daily summary alert (text or email): active listings count, new today, price changes, last sync time
- [ ] Optional: weekly digest of market changes

## Phase 4 — Advanced

- [ ] Historical data tracking (price history, days on market trends)
- [ ] Sold/closed listing archive for market analysis
- [ ] Custom fields (Cory's private notes on listings, showing availability)
- [ ] Integration with CRM (link listings to client interests, auto-suggest to leads)

---

## Technical Architecture

```
Carolina Smokies MLS ──┐
                       ├──> Supabase Edge Function (runs every 15-30 min)
Canopy MLS ────────────┤         |
                       │         v
Highlands Cashiers ────┘  Supabase `listings` table
(future)                  (deduplicated, unified schema)
                                 |
                                 v
                          Your website reads from own DB
                          (fast, no rate limits)
```

### Multi-MLS Sync Logic

- Each MLS has its own credentials and field mapping config
- Sync runs each feed independently — if one fails, the others still update
- Each listing stores `source_mls` field (e.g., "carolina_smokies", "canopy", "highlands_cashiers")
- Deduplication by address + city — if same property appears in two MLSs, keep the most recently updated version
- Adding a new MLS = add credentials + field mapping. No code rewrite needed.

### Database Tables

- **`listings`** — All active MLS listings with `source_mls` field (replaces SimplyRETS API calls)
- **`listings_history`** — Price changes, status changes over time
- **`sync_log`** — Every sync run: timestamp, MLS source, success/fail, count, errors
- **`mls_config`** — Credentials and field mappings per MLS (encrypted)

### Monitoring Flow

```
Sync runs every 15-30 min
        |
    Success? ──yes──> Log to sync_log, continue
        |
       no
        |
        v
Alert Cory (text/email): "MLS sync failed at [time]"
Site continues showing last good data
```

---

## Comparison vs SimplyRETS

| | Direct Feed | SimplyRETS |
|---|---|---|
| Monthly cost | $0 | $50-100+ |
| Data ownership | 100% yours | Theirs |
| Speed | Fast (local DB) | Slower (external API) |
| Customization | Unlimited | Limited |
| Maintenance | Self-monitored with alerts | They handle it |
| Dependency | None | Their service |
| Rate limits | None | Their limits |

---

## SEO Advantage (vs SimplyRETS)

SimplyRETS loads listings via JavaScript after the page renders. Google's crawler often sees a blank page — meaning your listings are essentially invisible to search engines. The direct feed approach fixes this entirely.

### What we build:

- [ ] **Static listing pages** — each property gets its own URL: `coryhelpsyoumove.com/properties/74-mountain-view-rd-waynesville`
- [ ] **Auto-generated on sync** — every time listings update, static HTML pages are regenerated
- [ ] **Rich meta tags per listing** — unique title, description, Open Graph image for each property
- [ ] **JSON-LD structured data** — Schema.org `RealEstateListing` markup so Google can show rich results (price, beds, baths, photo in search)
- [ ] **Auto-generated sitemap.xml** — updated every sync with all active listing URLs
- [ ] **Canonical URLs** — prevent duplicate content issues
- [ ] **Internal linking** — listing pages link back to town pages, town pages link to listings

### SEO impact:

- **Hundreds of indexable pages** — every active listing becomes a page Google can find and rank
- **Long-tail keyword coverage** — pages automatically target searches like:
  - "74 Mountain View Rd Waynesville NC"
  - "3 bedroom homes for sale Sylva NC"
  - "unrestricted land Maggie Valley NC"
  - "cabins under 300k Bryson City NC"
- **Faster load times** — static HTML loads instantly vs waiting for API calls (Google rewards speed)
- **Fresh content signal** — listings update regularly, showing Google the site is active
- **Compete with Zillow/Realtor.com** — instead of those portals being the only indexed result for a property address, your site shows up too

### SimplyRETS SEO comparison:

| | Direct Feed | SimplyRETS |
|---|---|---|
| Individual listing URLs | Yes | No (JS overlays) |
| Google can crawl listings | Yes (static HTML) | Unreliable (JS rendering) |
| Structured data per listing | Yes | No |
| Auto-generated sitemap | Yes | No |
| Meta tags per listing | Yes | No (generic page meta) |
| Page load speed | Instant (static) | Slow (API call first) |

---

## IDX Compliance Checklist

- [ ] MLS disclaimer/logo on all listing pages
- [ ] "Last updated" timestamp displayed
- [ ] Listing broker attribution
- [ ] Data refresh frequency meets MLS requirements (usually every 15 min - 4 hours)
- [ ] No caching beyond allowed timeframe
- [ ] Proper handling of sold/withdrawn listings (remove within required timeframe)

---

## Migration Steps

1. Build sync engine and `listings` table
2. Run in parallel with SimplyRETS (both pulling data)
3. Switch site to read from own database
4. Verify all listings display correctly
5. Remove SimplyRETS credentials and code
6. Cancel SimplyRETS (if subscribed) or skip signup entirely
