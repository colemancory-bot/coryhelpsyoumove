-- Capture every account signup as a lead, server-side.
--
-- Audited 2026-08-23: 16 accounts existed, 9 real prospects had never produced
-- a lead or a CRM contact, and NOT ONE lead had ever been written with the
-- sources the signup code emits (smart_signup, smart_signup_mobile, oauth_*).
-- Every lead on record came from consultation_form (19) or chatbot (2).
--
-- Cause: the 2026-02-26 "2-step signup" refactor moved profile and lead
-- creation into the second screen (name / phone), which the client can close.
-- onAuthStateChange marks the visitor logged in before that screen, so the
-- account works whether or not they finish. public.profiles has 2 rows out of
-- 16 accounts and both predate that refactor.
--
-- Fix: create the profile and the lead from a trigger on auth.users, so
-- capture cannot be skipped by closing a modal or by a client-side error.

-- ── 1. Route notifications to AFK Broker instead of the dead Follow Up Boss ──
--
-- push_to_fub was still POSTing every lead and profile to
-- api.followupboss.com with a hardcoded API key. That subscription ended
-- 2026-06-15 and was removed from the edge function, but the trigger was
-- never updated, so the database has been notifying nobody. The key it
-- carried should be treated as exposed and rotated.
--
-- The payload is now the flat shape the fub-push edge function expects, and
-- it forwards created_at so a backfilled lead shows its ORIGINAL signup date
-- rather than the moment it was replayed.
CREATE OR REPLACE FUNCTION push_to_fub()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  BEGIN
    PERFORM net.http_post(
      url := 'https://kzaabnnwjupjqvydiqlz.supabase.co/functions/v1/fub-push',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imt6YWFibm53anVwanF2eWRpcWx6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzExMTE5NDMsImV4cCI6MjA4NjY4Nzk0M30.2B2sJnAuDim_yhn5UFKxXzdZw58ne4E20-ulW8pTwPA'
      ),
      body := jsonb_build_object(
        'first_name',  coalesce(NEW.first_name, ''),
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
    -- Never let a notification failure roll back the lead itself.
    RAISE WARNING '[push_to_fub] notify failed for lead %: %', NEW.id, SQLERRM;
  END;
  RETURN NEW;
END;
$$;

-- Profiles are not leads. This trigger fired a second notification for the
-- same person and is redundant now that auth.users creates the lead.
DROP TRIGGER IF EXISTS on_profile_created ON public.profiles;

-- ── 2. Create profile + lead the moment an account exists ──
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_full  text := coalesce(NEW.raw_user_meta_data->>'full_name',
                           NEW.raw_user_meta_data->>'name', '');
  v_first text := nullif(split_part(v_full, ' ', 1), '');
  v_last  text := nullif(trim(substr(v_full, coalesce(nullif(position(' ' in v_full), 0), length(v_full)) + 1)), '');
  v_prov  text := coalesce(NEW.raw_app_meta_data->>'provider', 'email');
BEGIN
  BEGIN
    INSERT INTO public.profiles (id, first_name, last_name, email, phone)
    VALUES (NEW.id, coalesce(v_first, ''), coalesce(v_last, ''), coalesce(NEW.email, ''), '')
    ON CONFLICT (id) DO NOTHING;

    -- Only create a lead if we have something to contact them with.
    IF NEW.email IS NOT NULL AND NEW.email <> '' THEN
      INSERT INTO public.leads (first_name, last_name, email, phone, source, message, created_at)
      VALUES (
        coalesce(v_first, ''),
        coalesce(v_last, ''),
        NEW.email,
        '',
        'account_signup_' || v_prov,
        'Created an account on coryhelpsyoumove.com via ' || v_prov || '.',
        NEW.created_at
      );
    END IF;
  EXCEPTION WHEN OTHERS THEN
    -- A capture failure must never block someone from signing up.
    RAISE WARNING '[handle_new_user] capture failed for %: %', NEW.id, SQLERRM;
  END;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION handle_new_user();
