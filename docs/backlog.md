# Backlog and open items

Open items moved out of `CLAUDE.md`. Status was recorded in April 2026 unless noted, and is not re-verified here.

## Supabase

- `supabase-migrations.sql` was listed as "needs to be run" (12 account features + admin dashboard tables). `app.js` already reads several of these tables; confirm in the Supabase dashboard before running anything.
- Tables: profiles, property_notes, viewing_history, showing_requests, availability_windows, property_questions, qa_library, price_history, alert_notifications, user_activity

## Open SEO items

- Dedicated OG art for `blog/short-term-rental-rules-western-nc.html` and `blog/is-waynesville-nc-good-place-to-retire.html` (both still use generic hero images as of November 2026).
- Body text of town pages and blog posts still contains `&mdash;` entities (still true as of November 2026).
- Seed GBP Q&A (10 pairs drafted 2026-04-24). The 2026 research in `docs/seo-geo-action-plan-2026.md` finds Q&A volume has little ranking effect.

## Future features

- Google Calendar sync for showing requests
- BBO feed integration from Canopy MLS (agent copy print fields)
- Email notifications via Resend for price drop alerts and saved search matches
