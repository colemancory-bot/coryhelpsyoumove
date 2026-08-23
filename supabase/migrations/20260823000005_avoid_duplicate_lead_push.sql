-- Stop the server trigger from double-notifying on client-created leads.
--
-- Introduced by 20260823000001. Before it, the on_lead_created trigger posted
-- to the dead Follow Up Boss, so the only live notification was the browser
-- calling _pushToFUB -> fub-push -> AFK. Rerouting the trigger to the same
-- edge function meant a consultation-form or chatbot lead would notify TWICE,
-- once from the browser and once from the trigger, with different external_ids
-- so AFK would not dedupe them.
--
-- The browser push is the better one for those sources: it carries the session
-- journey (channel, referrer, landing page, pages and properties viewed) that
-- the database does not have.
--
-- So the trigger now only fires for leads the SERVER creates, which is the
-- account_signup rows written by handle_new_user. Those have no browser behind
-- them at all, which is the entire reason they were being missed.

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
  -- Client-side paths push themselves, with richer journey data attached.
  IF coalesce(NEW.source, '') <> 'account_signup' THEN
    RETURN NEW;
  END IF;

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
