-- ═══════════════════════════════════════════════════════════════
-- SUPABASE MIGRATIONS — 12 Account Features + Admin Dashboard
-- Run these in the Supabase SQL Editor (Dashboard → SQL Editor)
-- ═══════════════════════════════════════════════════════════════

-- ═══ 1. Add admin role to profiles ═══
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS role TEXT DEFAULT 'user' CHECK (role IN ('user', 'admin'));
-- Set Cory as admin (update with the correct email)
UPDATE profiles SET role = 'admin' WHERE email = 'coryhelpsyoumove@gmail.com';

-- ═══ 2. Property Notes (cloud sync) ═══
CREATE TABLE IF NOT EXISTS property_notes (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  property_key TEXT NOT NULL,
  note_text TEXT DEFAULT '',
  updated_at TIMESTAMPTZ DEFAULT now(),
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(user_id, property_key)
);
ALTER TABLE property_notes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can CRUD own notes" ON property_notes FOR ALL USING (auth.uid() = user_id);

-- ═══ 3. Viewing History ═══
CREATE TABLE IF NOT EXISTS viewing_history (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  property_key TEXT NOT NULL,
  property_data JSONB DEFAULT '{}',
  viewed_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_viewing_history_user ON viewing_history(user_id, viewed_at DESC);
ALTER TABLE viewing_history ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can read own history" ON viewing_history FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own history" ON viewing_history FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Admin can read all history" ON viewing_history FOR SELECT USING (
  EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
);

-- ═══ 4. Showing Requests ═══
CREATE TABLE IF NOT EXISTS showing_requests (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  property_key TEXT NOT NULL,
  property_data JSONB DEFAULT '{}',
  preferred_slots JSONB NOT NULL DEFAULT '[]',
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending','confirmed','completed','rescheduled','cancelled')),
  confirmed_slot JSONB DEFAULT NULL,
  agent_notes TEXT DEFAULT '',
  user_name TEXT DEFAULT '',
  user_email TEXT DEFAULT '',
  user_phone TEXT DEFAULT '',
  gcal_event_id TEXT DEFAULT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE showing_requests ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can read own showings" ON showing_requests FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can create showings" ON showing_requests FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Admin can manage all showings" ON showing_requests FOR ALL USING (
  EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
);

-- ═══ 5. Availability Windows (future Google Calendar sync) ═══
CREATE TABLE IF NOT EXISTS availability_windows (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  day_of_week INT CHECK (day_of_week BETWEEN 0 AND 6),
  start_time TIME NOT NULL,
  end_time TIME NOT NULL,
  is_recurring BOOLEAN DEFAULT true,
  specific_date DATE DEFAULT NULL,
  is_blocked BOOLEAN DEFAULT false,
  gcal_calendar_id TEXT DEFAULT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE availability_windows ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can read availability" ON availability_windows FOR SELECT USING (true);
CREATE POLICY "Admin can manage availability" ON availability_windows FOR ALL USING (
  EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
);

-- Seed default availability: Mon-Fri 9am-5pm, Sat 10am-3pm
INSERT INTO availability_windows (day_of_week, start_time, end_time) VALUES
  (1, '09:00', '17:00'), (2, '09:00', '17:00'), (3, '09:00', '17:00'),
  (4, '09:00', '17:00'), (5, '09:00', '17:00'), (6, '10:00', '15:00');

-- ═══ 6. Property Questions (Ask Cory) ═══
CREATE TABLE IF NOT EXISTS property_questions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  property_key TEXT NOT NULL,
  property_data JSONB DEFAULT '{}',
  question_text TEXT NOT NULL,
  response_text TEXT DEFAULT NULL,
  responded_at TIMESTAMPTZ DEFAULT NULL,
  is_read BOOLEAN DEFAULT false,
  user_name TEXT DEFAULT '',
  user_email TEXT DEFAULT '',
  created_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE property_questions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can read own questions" ON property_questions FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can create questions" ON property_questions FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Admin can manage all questions" ON property_questions FOR ALL USING (
  EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
);

-- ═══ 7. Q&A Library (Local Expert Knowledge) ═══
CREATE TABLE IF NOT EXISTS qa_library (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  category TEXT NOT NULL,
  question TEXT NOT NULL,
  answer TEXT NOT NULL,
  sort_order INT DEFAULT 0,
  is_published BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE qa_library ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Logged-in users can read published QA" ON qa_library FOR SELECT USING (auth.uid() IS NOT NULL AND is_published = true);
CREATE POLICY "Admin can manage QA" ON qa_library FOR ALL USING (
  EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
);

-- ═══ 8. Price History (for drop alerts) ═══
CREATE TABLE IF NOT EXISTS price_history (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  listing_key TEXT NOT NULL,
  price INT NOT NULL,
  recorded_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_price_history_listing ON price_history(listing_key, recorded_at DESC);
ALTER TABLE price_history ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can read price history" ON price_history FOR SELECT USING (true);
CREATE POLICY "Admin can manage price history" ON price_history FOR ALL USING (
  EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
);

-- ═══ 9. Alert Notifications (all user alerts) ═══
CREATE TABLE IF NOT EXISTS alert_notifications (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  alert_type TEXT NOT NULL,
  property_key TEXT,
  title TEXT DEFAULT '',
  message TEXT NOT NULL,
  is_read BOOLEAN DEFAULT false,
  email_sent BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_alert_notif_user ON alert_notifications(user_id, created_at DESC);
ALTER TABLE alert_notifications ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can read own notifications" ON alert_notifications FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can update own notifications" ON alert_notifications FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Admin can manage notifications" ON alert_notifications FOR ALL USING (
  EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
);

-- ═══ 10. User Activity (journey timeline) ═══
CREATE TABLE IF NOT EXISTS user_activity (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  activity_type TEXT NOT NULL,
  property_key TEXT,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_user_activity_user ON user_activity(user_id, created_at DESC);
ALTER TABLE user_activity ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can read own activity" ON user_activity FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can log activity" ON user_activity FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Admin can read all activity" ON user_activity FOR SELECT USING (
  EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
);
