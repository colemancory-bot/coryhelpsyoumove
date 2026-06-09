# Handoff: receive leads from coryhelpsyoumove.com into AFK Broker

**Paste this whole file into a fresh AFK Broker session (or point Claude Code at this path).** It is written for a session that has the AFK Broker codebase loaded and knows nothing about the website. Your job is to build (or confirm) the receiving end of a lead integration and then **write a short spec back** so the website side can be wired to match.

---

## Background

`coryhelpsyoumove.com` is Cory Coleman's real-estate website (a separate codebase from AFK Broker). It captures leads from several places: a home-valuation tool, a consultation/contact form, an on-site chatbot, account sign-ups, and behavioral triggers (showing requests, high-intent browsing). Cory switched his CRM from Follow Up Boss to **AFK Broker**, so the website needs to send its leads to AFK Broker.

The website now also captures **lead intelligence (a "journey")** with each lead: how the visitor arrived (channel + referrer + UTMs), the page they landed on, the pages they viewed, and the **properties they viewed**. This rides along in the payload so AFK Broker can show Cory a lead that reads like *"Found via Google search, landed on the homepage, viewed 214 Chin Tree Rd and 2 other listings, then submitted the contact form."* Please store and surface this; it is the most valuable part.

**The goal:**
1. AFK Broker exposes an HTTP endpoint the website can POST a new lead to.
2. AFK Broker stores the lead (and its journey) like any other CRM lead.
3. AFK Broker notifies Cory of each new lead **by text and by email**. (Cory believes AFK Broker already has notifications set up; reuse that system if so. Include the "found via / viewed" summary in the notification if you can.)

**How the website will call you:** server-to-server from a Supabase edge function (Deno). There is **no fixed source IP**, so authentication must be a **shared secret in a header**, not an IP allowlist. The website reads the endpoint from an env var named `AFK_BROKER_URL` and the secret from `AFK_BROKER_SECRET`.

---

## What the website will send you (current contract)

```
POST  https://afkbroker.com/api/leads/intake          ← your endpoint; tell me the real path
Headers:
  Content-Type: application/json
  x-afk-secret: <shared secret>                        ← you generate this; see "secret" below
Body (JSON):
{
  "source_site":  "coryhelpsyoumove.com",
  "lead_source":  "home_valuation",   // also: consultation_form, chatbot, showing_request, high_intent, price_drop, smart_signup, oauth_google, reengagement
  "first_name":   "Jane",
  "last_name":    "Smith",
  "email":        "jane@example.com",
  "phone":        "8285550123",        // may be empty
  "message":      "free-text; also has a readable journey summary appended at the end",
  "external_id":  "client-generated stable id (uuid)",   // dedupe key
  "created_at":   "2026-06-08T18:00:00Z",

  "journey": {
    "channel":           "Google search",     // best-effort label: Google search, Facebook, Direct, a referrer host, etc.
    "referrer":          "https://www.google.com/",
    "landing_page":      "/",                  // first page of the session
    "utm":               { "source": "", "medium": "", "campaign": "" },
    "pages_viewed":      ["/", "/towns/sylva.html", "/?listing=CAR4354146"],
    "properties_viewed": [ { "address": "214 Chin Tree Rd, Sylva", "price": "$850,000", "id": "CAR4354146" } ],
    "summary":           "Found via: Google search\nLanded on: ...\nProperties viewed (1): 214 Chin Tree Rd $850,000\nPages this visit (3): Home -> Sylva -> 214 Chin Tree Rd"
  }
}
```

**Notes:**
- **Either email or phone will be present; sometimes only one.**
- The `journey` object is **best-effort**: some visitors block sessionStorage or arrive with no referrer, so any journey field may be empty. Treat it as enrichment, never as required for accepting the lead.
- `journey.summary` is the same story as the structured fields, pre-formatted as plain text, convenient to drop straight into the SMS/email notification.
- The field names above are my proposal. **If AFK Broker's lead model wants different names or a different shape (including how you want `journey` nested), define it in your reply and I will map to it on the website side.**

### Sample payloads

Consultation-form lead with journey:
```json
{ "source_site":"coryhelpsyoumove.com", "lead_source":"consultation_form",
  "first_name":"Dale", "last_name":"Whitmore", "email":"dale@example.com", "phone":"8285550174",
  "message":"Buying: Looking for a cabin in Maggie Valley under $500k.\n\n--- How they found you ---\nFound via: Facebook\nLanded on: ...",
  "external_id":"7c1f-...", "created_at":"2026-06-08T18:02:11Z",
  "journey": { "channel":"Facebook", "referrer":"https://l.facebook.com/", "landing_page":"/blog/best-time-to-sell-house-western-nc.html",
    "utm": {"source":"","medium":"","campaign":""}, "pages_viewed":["/blog/best-time-to-sell-house-western-nc.html","/"],
    "properties_viewed":[], "summary":"Found via: Facebook\nLanded on: Best Time to Sell ..." } }
```

Home-valuation lead (note the multi-line `message`):
```json
{ "source_site":"coryhelpsyoumove.com", "lead_source":"home_valuation",
  "first_name":"Margaret", "last_name":"Hale", "email":"margaret@example.com", "phone":"8285550199",
  "message":"HOME VALUATION REQUEST\n\nAddress: 44 Plott Balsam Rd, Sylva\n...\n\n--- How they found you ---\nFound via: Google search\n...",
  "external_id":"9b22-...", "created_at":"2026-06-08T18:05:43Z",
  "journey": { "channel":"Google search", "referrer":"https://www.google.com/", "landing_page":"/what-is-my-home-worth-western-nc.html",
    "utm": {"source":"","medium":"","campaign":""}, "pages_viewed":["/what-is-my-home-worth-western-nc.html"],
    "properties_viewed":[], "summary":"Found via: Google search\n..." } }
```

---

## What I need you to do (in the AFK Broker session)

1. **Recon and report.** Confirm AFK Broker's stack, where leads are stored (table/model), and how notifications work (which SMS provider, which email provider, and whether new external leads already notify Cory).

2. **Build or confirm a lead-intake endpoint.** It should:
   - Accept the JSON body above (or your adjusted shape).
   - **Verify the `x-afk-secret` header** against a stored secret; reject with 401 if it does not match. Never expose the endpoint without this check.
   - **Store the lead** in AFK Broker's normal lead store, tagged with `lead_source` and `source_site`, **and store/attach the `journey`** (channel, landing page, pages, properties) so it is visible on the lead.
   - **Be idempotent:** dedupe on `(source_site, external_id)` so a retry does not create a duplicate. Return 200 on a duplicate without re-notifying.
   - On a genuinely new lead, **notify Cory by text and by email**, ideally including `journey.summary`. Reuse AFK Broker's existing new-lead notification if there is one; wire external leads to it if they do not already fire it.
   - Return a small JSON response. The website treats `{"ok": true}` (or `{"success": true}`) as success.

3. **Generate the shared secret** (a long random string), store it in AFK Broker's environment/secrets, and note it so Cory can hand it to me. Do not paste the secret into any committed file.

4. **Test it.** POST a sample payload (above) and confirm: the lead + journey are stored, a duplicate does not double-create, and Cory actually receives the text and the email.

---

## Write me back (the reply I need)

When you are done, reply with a short **integration spec** so the website can be wired to match:

- **Intake URL** (full) — goes into the website env var `AFK_BROKER_URL`.
- **Auth:** the header name (`x-afk-secret` unless you changed it) and how Cory should give me the secret value — it goes into the website env var `AFK_BROKER_SECRET` (never written into a committed file).
- **The exact payload you accept:** any field renames, additions, or required-vs-optional differences, including how you want `journey` shaped. If you kept my shape, just say so.
- **Response format** and status codes (success, duplicate, auth failure).
- **Confirmation** that a test lead produced both the SMS and the email to Cory, including which providers were used.
- Anything else I should know (rate limits, timeouts; CORS is not needed, this is server-to-server).

Optional but helpful: **write me a prompt back** to run in the website session that includes the final URL and confirms the two env-var names, so I can flip the switch in one step.

---

## Where it stands on the website side (for your awareness)

- **Already built and deployed:** the website inserts every lead into its own Supabase `leads` table, then forwards it via the `fub-push` Supabase edge function. That function is **repurposed**: if `AFK_BROKER_URL` + `AFK_BROKER_SECRET` are set, it POSTs the contract above to your endpoint with the `x-afk-secret` header; otherwise (and as a fallback if your endpoint errors) it still posts to Follow Up Boss, so **no lead is lost during the cutover.**
- The website attaches the `journey` automatically to every lead (a small tracker in `shared.js`); you do not need to do anything for it to arrive.
- **To go live:** Cory sets `AFK_BROKER_URL` and `AFK_BROKER_SECRET` on the `fub-push` edge function using your reply. That is the entire switch. Once AFK is confirmed working, the FUB fallback (and `FUB_API_KEY`) can be removed.

## Guardrails

- **Auth is mandatory.** The endpoint handles real PII (names, emails, phones). Never accept an unauthenticated request.
- **Idempotency.** The website forwards from an edge function and may retry; dedupe on `(source_site, external_id)`.
- **Secret hygiene.** Generate the secret in AFK Broker, share it with Cory out of band, store it as an env var on both sides. Do not commit it.
