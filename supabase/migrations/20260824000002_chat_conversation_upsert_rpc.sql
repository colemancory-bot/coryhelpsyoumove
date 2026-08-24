-- Replace the anon INSERT/UPDATE policies on chat_conversations with a single
-- narrow RPC.
--
-- Two reasons.
--
-- 1. It did not work. PostgREST upsert issues INSERT ... ON CONFLICT DO UPDATE,
--    and under RLS that path was rejected with 42501 "new row violates row-level
--    security policy" even though the INSERT and UPDATE policies were both
--    WITH CHECK (true). A plain INSERT against the same table with the same anon
--    key returned 201. Verified against production on 2026-08-24.
--
-- 2. The policies were wider than the feature needs. "Anyone can update their
--    chat conversation" was USING (true), so anon could overwrite any row by
--    guessing a session_id. Nothing leaked (there is no anon SELECT policy) but
--    a stranger could blank someone's transcript.
--
-- SECURITY DEFINER runs as the table owner, which bypasses RLS, so the anon
-- write policies come off entirely. The function is the only anon write path and
-- it can only ever touch the row matching the session_id it was handed.
--
-- Inputs are clamped rather than trusted: the transcript, page_url, referrer and
-- user_agent are all attacker-controlled strings from a public page.

CREATE OR REPLACE FUNCTION chat_conversation_upsert(
  p_session_id     text,
  p_transcript     text,
  p_message_count  int,
  p_search_intents jsonb   DEFAULT '[]'::jsonb,
  p_lead_captured  boolean DEFAULT false,
  p_contact_email  text    DEFAULT NULL,
  p_contact_phone  text    DEFAULT NULL,
  p_contact_name   text    DEFAULT NULL,
  p_page_url       text    DEFAULT NULL,
  p_referrer       text    DEFAULT NULL,
  p_journey        jsonb   DEFAULT NULL,
  p_user_agent     text    DEFAULT NULL
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_session_id IS NULL OR length(p_session_id) NOT BETWEEN 8 AND 64 THEN
    RAISE EXCEPTION 'invalid session id';
  END IF;

  INSERT INTO chat_conversations (
    session_id, transcript, message_count, search_intents, lead_captured,
    contact_email, contact_phone, contact_name, page_url, referrer, journey, user_agent
  ) VALUES (
    p_session_id,
    left(coalesce(p_transcript, ''), 100000),
    greatest(coalesce(p_message_count, 0), 0),
    coalesce(p_search_intents, '[]'::jsonb),
    coalesce(p_lead_captured, false),
    nullif(left(coalesce(p_contact_email, ''), 320), ''),
    nullif(left(coalesce(p_contact_phone, ''), 40),  ''),
    nullif(left(coalesce(p_contact_name,  ''), 200), ''),
    nullif(left(coalesce(p_page_url,      ''), 500), ''),
    nullif(left(coalesce(p_referrer,      ''), 500), ''),
    p_journey,
    nullif(left(coalesce(p_user_agent,    ''), 500), '')
  )
  ON CONFLICT (session_id) DO UPDATE SET
    transcript     = EXCLUDED.transcript,
    message_count  = EXCLUDED.message_count,
    search_intents = EXCLUDED.search_intents,
    lead_captured  = chat_conversations.lead_captured OR EXCLUDED.lead_captured,
    -- Contact details only ever fill in, never blank out. The lead extractor can
    -- lose a name when the conversation is trimmed to the last N messages.
    contact_email  = coalesce(EXCLUDED.contact_email, chat_conversations.contact_email),
    contact_phone  = coalesce(EXCLUDED.contact_phone, chat_conversations.contact_phone),
    contact_name   = coalesce(EXCLUDED.contact_name,  chat_conversations.contact_name),
    page_url       = coalesce(EXCLUDED.page_url,      chat_conversations.page_url),
    journey        = coalesce(EXCLUDED.journey,       chat_conversations.journey);
END;
$$;

REVOKE ALL ON FUNCTION chat_conversation_upsert(text,text,int,jsonb,boolean,text,text,text,text,text,jsonb,text) FROM public;
GRANT EXECUTE ON FUNCTION chat_conversation_upsert(text,text,int,jsonb,boolean,text,text,text,text,text,jsonb,text) TO anon, authenticated;

DROP POLICY IF EXISTS "Anyone can start a chat conversation" ON chat_conversations;
DROP POLICY IF EXISTS "Anyone can update their chat conversation" ON chat_conversations;
