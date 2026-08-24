-- Store chatbot conversations server-side.
--
-- Until now the only record of a chat was localStorage on the visitor's own
-- machine (app.js _saveChatState, key 'cc_chat_conv', 30 minute TTL). A
-- conversation only reached the database if extractLeadFromConversation found
-- BOTH a name AND an email-or-phone in it (app.js tryPushChatLead). Everything
-- else -- someone asking about septic on a 12 acre parcel and then leaving --
-- was discarded when the tab closed. Cory has never seen those.
--
-- The non-converting conversations are the useful ones. They show what people
-- actually ask for versus what the site ranks for, and search_intents captures
-- the machine-readable [SEARCH:{...}] filters the bot emitted, so the questions
-- can be counted rather than eyeballed.
--
-- session_id is a client-generated uuid held in sessionStorage for the life of
-- the tab, so the row is upserted as the conversation grows instead of one row
-- per message.
--
-- RLS: anon may INSERT and UPDATE but has no SELECT policy, so a visitor can
-- write their own transcript and never read anyone else's. UPDATE is keyed on a
-- uuid that is not exposed anywhere, and the worst case for a guessed id is an
-- overwritten transcript, not a disclosure. Reads are admin-only.

CREATE TABLE IF NOT EXISTS chat_conversations (
  id              UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  session_id      TEXT NOT NULL UNIQUE,
  transcript      TEXT NOT NULL DEFAULT '',
  message_count   INT  NOT NULL DEFAULT 0,
  search_intents  JSONB DEFAULT '[]'::jsonb,
  lead_captured   BOOLEAN NOT NULL DEFAULT false,
  contact_email   TEXT,
  contact_phone   TEXT,
  contact_name    TEXT,
  page_url        TEXT,
  referrer        TEXT,
  journey         JSONB,
  user_agent      TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_chat_conv_created  ON chat_conversations(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_chat_conv_captured ON chat_conversations(lead_captured);

ALTER TABLE chat_conversations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anyone can start a chat conversation" ON chat_conversations;
CREATE POLICY "Anyone can start a chat conversation"
  ON chat_conversations FOR INSERT
  WITH CHECK (true);

DROP POLICY IF EXISTS "Anyone can update their chat conversation" ON chat_conversations;
CREATE POLICY "Anyone can update their chat conversation"
  ON chat_conversations FOR UPDATE
  USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Admin can read chat conversations" ON chat_conversations;
CREATE POLICY "Admin can read chat conversations"
  ON chat_conversations FOR SELECT
  USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );

-- Keep updated_at honest so "last active" is meaningful in the dashboard.
CREATE OR REPLACE FUNCTION chat_conversations_touch()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS chat_conversations_set_updated_at ON chat_conversations;
CREATE TRIGGER chat_conversations_set_updated_at
  BEFORE UPDATE ON chat_conversations
  FOR EACH ROW EXECUTE FUNCTION chat_conversations_touch();
