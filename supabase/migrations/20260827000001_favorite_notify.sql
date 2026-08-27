-- Notify Cory when a signed-in visitor saves a property.
--
-- Saving a property is the strongest buying signal the site produces short of a
-- form submission: it requires an account and it names a specific house.
-- Nothing has ever fired on it. As of 2026-08-27 two people had saved four
-- properties between them, including two saved four minutes apart the previous
-- night, and Cory was never told about any of them.
--
-- The trigger lives on the database rather than in app.js so the alert survives
-- the tab closing, and so it also covers saves written by anything else that
-- touches `favorites`.
--
-- Fires on INSERT only. `favorites` has UNIQUE (user_id, property_key) and the
-- site deletes the row on unfavorite, so one save produces exactly one alert.
-- Unfavouriting and saving again does re-alert, which is the correct read of
-- renewed interest.
--
-- Delivery is the favorite-notify edge function: email via Resend, plus a push
-- to AFK Broker for the text (AFK texts and emails Cory on intake, and is the
-- only SMS path configured on this project).
--
-- pg_net is fire-and-forget. A failed request lands in net._http_response and
-- never blocks or rolls back the visitor's save. Losing the notification is
-- bad; losing the save is worse.
--
-- The shared secret comes from Supabase Vault rather than being inlined, so it
-- is not sitting in this file, in \df+ output, or in the migration history the
-- way the anon JWT in 20260808000002_search_alerts_cron.sql is. `ALTER DATABASE
-- ... SET` was the first choice but the migration role cannot set parameters.
-- Created once, out of band:
--   SELECT vault.create_secret('<value>', 'favorite_notify_secret', '...');
-- and the same value is set on the edge function as FAVORITE_NOTIFY_SECRET.

CREATE OR REPLACE FUNCTION notify_favorite_saved()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_secret text;
BEGIN
  SELECT decrypted_secret INTO v_secret
  FROM vault.decrypted_secrets
  WHERE name = 'favorite_notify_secret'
  LIMIT 1;

  IF v_secret IS NULL OR v_secret = '' THEN
    RAISE WARNING 'notify_favorite_saved: vault secret favorite_notify_secret missing, skipping';
    RETURN NEW;
  END IF;

  PERFORM net.http_post(
    url     := 'https://kzaabnnwjupjqvydiqlz.supabase.co/functions/v1/favorite-notify',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-admin-secret', v_secret
    ),
    body    := jsonb_build_object(
      'user_id', NEW.user_id,
      'property_key', NEW.property_key,
      -- Block until both channels have actually been called, so the recorded
      -- status in net._http_response is the real outcome rather than a bare
      -- "queued". The function can also fire and forget, but that leaves no
      -- way to tell a delivered notification from a dropped one.
      'wait', true
    ),
    -- pg_net defaults to 5s. Gathering the listing, the visitor's other saves,
    -- then calling Resend and AFK does not fit in that, and the first live test
    -- came back "Timeout of 5000 ms reached".
    timeout_milliseconds := 20000
  );

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS favorites_notify_on_insert ON favorites;
CREATE TRIGGER favorites_notify_on_insert
  AFTER INSERT ON favorites
  FOR EACH ROW EXECUTE FUNCTION notify_favorite_saved();
