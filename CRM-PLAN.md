# Custom CRM — Build Plan

**Goal:** Replace Follow Up Boss with a fully owned CRM built on Supabase.
**Why:** Data privacy (Zillow owns FUB), full control, custom features on demand, no monthly cost.

---

## Phase 1 — Core CRM (Replace FUB basics)

- [ ] Admin dashboard (password-protected, separate from public site)
- [ ] Contacts list with search/filter (name, email, phone, source, status)
- [ ] Lead pipeline stages: New → Contacted → Showing → Under Contract → Closed → Past Client
- [ ] Contact detail page: notes, activity timeline, chat transcript history
- [ ] Automatic lead intake from website (chat, signup, consultation form — already in Supabase)
- [ ] Follow-up reminders / task list per contact

## Phase 2 — Automation & Communication

- [ ] Email notifications on new leads
- [ ] Follow-up reminder alerts (email or text to Cory)
- [ ] Basic drip email sequences (automated follow-ups)
- [ ] SMS integration (optional)

## Phase 3 — Advanced Features

- [ ] Client portal (clients see saved properties, schedule showings)
- [ ] Analytics dashboard (lead sources, conversion rates, response times)
- [ ] Calendar integration
- [ ] Custom features as needed

---

## Technical Notes

- **Backend:** Supabase (already in use — leads, profiles, favorites tables exist)
- **Frontend:** TBD — could be a separate admin page on the same site or a standalone app
- **Auth:** Supabase admin role (separate from client accounts)
- **Data:** 100% owned by Cory — no third-party access
- **Existing data flow:** Chat leads, consultation form, and account signups already insert into Supabase `leads` and `profiles` tables. Currently triggers FUB via edge function — will redirect to CRM instead.

## Phase 4 — AI Agents (Email, Text, Calendar)

### Email Agent
- [ ] Connect to Cory's Gmail via Google API
- [ ] AI scans incoming emails for meeting commitments (showings, inspections, closings, client meetings)
- [ ] Extracts: who, what, where, when
- [ ] Auto-creates Google Calendar event with details
- [ ] Sends confirmation: "Added showing at 74 Mountain View Rd with John Smith, Thursday 2pm — correct?"
- [ ] Links calendar events to CRM contacts automatically

### Text/SMS Agent
- [ ] Connect via Twilio or Google Voice
- [ ] AI reads incoming texts for scheduling commitments
- [ ] Same extraction: who, what, where, when → Calendar event
- [ ] Confirmation before creating event
- [ ] Links to CRM contacts

### Smart Features
- [ ] Conflict detection — warns if new event overlaps existing calendar
- [ ] Suggests alternative times if busy
- [ ] Learns patterns (e.g., no showings before 9am, prefers afternoons)
- [ ] Tags events by type (showing, closing, inspection, personal)
- [ ] Auto-links events to CRM contact profiles and listing records

---

## Phase 5 — Mobile App (PWA)

- [ ] Progressive Web App (PWA) — installable from browser, no app store needed
- [ ] Works on both iPhone and Android
- [ ] Manifest file, service worker, install prompt
- [ ] Clients can access saved properties, chat, account from home screen
- [ ] CRM admin panel mobile-friendly for managing leads on the go

---

## Migration Steps (when ready)

1. Build Phase 1 CRM
2. Test alongside FUB (dual-write period)
3. Disconnect FUB edge function trigger
4. Cancel FUB subscription
