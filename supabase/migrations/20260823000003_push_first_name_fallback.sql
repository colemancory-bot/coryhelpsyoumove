-- Give AFK Broker a non-empty first_name.
--
-- AFK's intake validates first_name with a >=1 character minimum and rejects
-- the whole lead with a 400 when it is blank. Email/password signups have no
-- name at the moment the account is created (the name is asked for on a later
-- screen that most people never reach, which is the bug this series fixes), so
-- every one of them would be refused by the CRM.
--
-- Observed during the 2026-08-23 backfill: 9 leads were sent, the 2 carrying a
-- Google display name were accepted, and all 7 nameless ones came back 502
-- "AFK forward failed / too_small first_name".
--
-- When we have no name we send the email local part, which is at least
-- searchable and obviously a placeholder, and the real email rides along.

CREATE OR REPLACE FUNCTION push_to_fub()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_first text := coalesce(
    nullif(trim(NEW.first_name), ''),
    nullif(split_part(coalesce(NEW.email, ''), '@', 1), ''),
    'Website Lead'
  );
BEGIN
  BEGIN
    PERFORM net.http_post(
      url := 'https://kzaabnnwjupjqvydiqlz.supabase.co/functions/v1/fub-push',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imt6YWFibm53anVwanF2eWRpcWx6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzExMTE5NDMsImV4cCI6MjA4NjY4Nzk0M30.2B2sJnAuDim_yhn5UFKxXzdZw58ne4E20-ulW8pTwPA'
      ),
      body := jsonb_build_object(
        'first_name',  v_first,
        'last_name',   coalesce(NEW.last_name, ''),
        'email',       coalesce(NEW.email, ''),
        'phone',       coalesce(NEW.phone, ''),
        'message',     coalesce(NEW.message, ''),
        'source',      coalesce(NEW.source, 'website'),
        'external_id', NEW.id::text,
        'created_at',  coalesce(NEW.created_at, now())
      )
    );
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING '[push_to_fub] notify failed for lead %: %', NEW.id, SQLERRM;
  END;
  RETURN NEW;
END;
$$;
