-- Correct the lead source written by handle_new_user.
--
-- public.contacts carries a CHECK constraint restricting source to
-- ('chatbot','consultation_form','account_signup','manual','referral','other').
-- The create_contact_from_lead trigger copies leads.source straight into
-- contacts.source, so any lead written with a source outside that list makes
-- the contacts INSERT fail, which rolls back the lead INSERT with it.
--
-- 20260823000001 wrote 'account_signup_' || provider, which is not in the
-- list. Because handle_new_user swallows exceptions so a capture failure can
-- never block a signup, that would have silently produced no lead at all --
-- exactly the failure mode this whole change exists to remove. Caught when
-- the backfill hit the constraint.
--
-- The provider now travels in the message instead of the source.

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

    IF NEW.email IS NOT NULL AND NEW.email <> '' THEN
      INSERT INTO public.leads (first_name, last_name, email, phone, source, message, created_at)
      VALUES (
        coalesce(v_first, ''),
        coalesce(v_last, ''),
        NEW.email,
        '',
        'account_signup',
        'Created an account on coryhelpsyoumove.com via ' || v_prov
          || ' on ' || to_char(NEW.created_at, 'Mon FMDD, YYYY') || '.',
        NEW.created_at
      );
    END IF;
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING '[handle_new_user] capture failed for %: %', NEW.id, SQLERRM;
  END;
  RETURN NEW;
END;
$$;
