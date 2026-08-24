-- Remove the last hardcoded Follow Up Boss credential and the dead cron
-- that carried it.
--
-- check_new_listings_and_notify() ran every 6 hours on the `check-new-listings`
-- cron and held TWO hardcoded API keys in its body: a Follow Up Boss key and a
-- Resend key. Follow Up Boss was cancelled 2026-06-15.
--
-- It was also completely inert:
--   * It scans public.listings_cache, which has 0 rows.
--   * Its Resend guard reads `if resend_key != '<the same literal it was just
--     assigned>'`, which can never be true, so the email branch never ran.
--   * Its only live outbound call was the POST to api.followupboss.com.
--
-- Saved-search alerts are handled by the search-alerts edge function, scheduled
-- twice daily as the `search-alerts` cron since 2026-08-08. That reads
-- mls_listings and sends through Resend with the key held in an env var, which
-- is where a secret belongs. This function is a superseded duplicate.
--
-- Both keys it exposed should be treated as compromised and rotated.

SELECT cron.unschedule('check-new-listings');

DROP FUNCTION IF EXISTS check_new_listings_and_notify();
