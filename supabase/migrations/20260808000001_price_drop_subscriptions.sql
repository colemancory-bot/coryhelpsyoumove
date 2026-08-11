-- Create price_drop_subscriptions.
--
-- This table was defined in the root supabase-migrations.sql (section 37) but
-- that file was never run against production. Verified 2026-08-08 via anon
-- REST: the table returns PGRST205 "Could not find the table
-- 'public.price_drop_subscriptions'".
--
-- Consequence: app.js:8941 writes a row every time a signed-in visitor clicks
-- "watch this price" on a listing. Every one of those writes has been failing
-- silently. The search-alerts edge function also reads this table for its
-- price-drop pass, so that half of the function is a no-op until this exists.
--
-- Definition copied verbatim from supabase-migrations.sql section 37 so the
-- two stay in sync.

CREATE TABLE IF NOT EXISTS price_drop_subscriptions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  property_key TEXT NOT NULL,
  listing_key TEXT DEFAULT '',
  current_price INT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(user_id, property_key)
);

CREATE INDEX IF NOT EXISTS idx_price_drop_user ON price_drop_subscriptions(user_id);
CREATE INDEX IF NOT EXISTS idx_price_drop_listing ON price_drop_subscriptions(listing_key);

ALTER TABLE price_drop_subscriptions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can CRUD own price drop subs" ON price_drop_subscriptions;
CREATE POLICY "Users can CRUD own price drop subs"
  ON price_drop_subscriptions FOR ALL
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Admin can read all price drop subs" ON price_drop_subscriptions;
CREATE POLICY "Admin can read all price drop subs"
  ON price_drop_subscriptions FOR SELECT
  USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );
