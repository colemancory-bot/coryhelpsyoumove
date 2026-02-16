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

## Migration Steps (when ready)

1. Build Phase 1 CRM
2. Test alongside FUB (dual-write period)
3. Disconnect FUB edge function trigger
4. Cancel FUB subscription
