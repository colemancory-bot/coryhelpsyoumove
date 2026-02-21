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
  event_type TEXT DEFAULT 'PRICE_CHANGE' CHECK (event_type IN ('LISTED', 'PRICE_CHANGE', 'PENDING', 'SOLD', 'BACK_ON_MARKET', 'DELISTED')),
  source TEXT DEFAULT 'MLS',
  previous_price INT,
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

-- ═══════════════════════════════════════════════════════════════
-- CRM TABLES — Phase 1 CRM + Document Management
-- ═══════════════════════════════════════════════════════════════

-- ═══ 11. Contacts (unified CRM record) ═══
CREATE TABLE IF NOT EXISTS contacts (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  first_name TEXT DEFAULT '',
  last_name TEXT DEFAULT '',
  email TEXT DEFAULT '',
  phone TEXT DEFAULT '',
  stage TEXT DEFAULT 'new' CHECK (stage IN ('new','contacted','showing','under_contract','closed','past_client')),
  source TEXT DEFAULT 'manual' CHECK (source IN ('chatbot','consultation_form','account_signup','manual','referral','other')),
  source_detail TEXT DEFAULT '',
  chat_transcript TEXT DEFAULT '',
  tags TEXT[] DEFAULT '{}',
  is_archived BOOLEAN DEFAULT false,
  last_contacted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_contacts_stage ON contacts(stage);
CREATE INDEX IF NOT EXISTS idx_contacts_email ON contacts(email);
CREATE INDEX IF NOT EXISTS idx_contacts_user ON contacts(user_id);
CREATE INDEX IF NOT EXISTS idx_contacts_updated ON contacts(updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_contacts_last_contacted ON contacts(last_contacted_at);
ALTER TABLE contacts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admin can manage all contacts" ON contacts FOR ALL USING (
  EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
);

-- ═══ 12. Contact Notes ═══
CREATE TABLE IF NOT EXISTS contact_notes (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  contact_id UUID REFERENCES contacts(id) ON DELETE CASCADE NOT NULL,
  note_text TEXT NOT NULL,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  is_pinned BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_contact_notes_contact ON contact_notes(contact_id, created_at DESC);
ALTER TABLE contact_notes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admin can manage contact notes" ON contact_notes FOR ALL USING (
  EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
);

-- ═══ 13. Tasks ═══
CREATE TABLE IF NOT EXISTS tasks (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  contact_id UUID REFERENCES contacts(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT DEFAULT '',
  due_date DATE,
  due_time TIME,
  priority TEXT DEFAULT 'normal' CHECK (priority IN ('low','normal','high','urgent')),
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending','completed','cancelled')),
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_tasks_contact ON tasks(contact_id);
CREATE INDEX IF NOT EXISTS idx_tasks_due ON tasks(due_date, status);
CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status, due_date);
ALTER TABLE tasks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admin can manage all tasks" ON tasks FOR ALL USING (
  EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
);

-- ═══ 14. Contact Activity (CRM event log) ═══
CREATE TABLE IF NOT EXISTS contact_activity (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  contact_id UUID REFERENCES contacts(id) ON DELETE CASCADE NOT NULL,
  activity_type TEXT NOT NULL,
  description TEXT DEFAULT '',
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_contact_activity_contact ON contact_activity(contact_id, created_at DESC);
ALTER TABLE contact_activity ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admin can manage contact activity" ON contact_activity FOR ALL USING (
  EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
);

-- ═══ 15. Transactions (Dotloop-style loops) ═══
CREATE TABLE IF NOT EXISTS transactions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  contact_id UUID REFERENCES contacts(id) ON DELETE CASCADE,
  property_address TEXT DEFAULT '',
  property_data JSONB DEFAULT '{}',
  transaction_type TEXT DEFAULT 'purchase' CHECK (transaction_type IN ('purchase','sale','lease','other')),
  status TEXT DEFAULT 'active' CHECK (status IN ('active','pending','closed','cancelled')),
  close_date DATE,
  contract_price INT,
  notes TEXT DEFAULT '',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_transactions_contact ON transactions(contact_id);
CREATE INDEX IF NOT EXISTS idx_transactions_status ON transactions(status);
CREATE INDEX IF NOT EXISTS idx_transactions_close ON transactions(close_date);
ALTER TABLE transactions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admin can manage all transactions" ON transactions FOR ALL USING (
  EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
);

-- ═══ 16. Documents ═══
CREATE TABLE IF NOT EXISTS documents (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  contact_id UUID REFERENCES contacts(id) ON DELETE SET NULL,
  transaction_id UUID REFERENCES transactions(id) ON DELETE SET NULL,
  file_name TEXT NOT NULL,
  file_path TEXT NOT NULL,
  file_size INT DEFAULT 0,
  file_type TEXT DEFAULT '',
  category TEXT DEFAULT 'other' CHECK (category IN ('contract','disclosure','inspection','appraisal','title','insurance','closing','other')),
  is_template BOOLEAN DEFAULT false,
  status TEXT DEFAULT 'draft' CHECK (status IN ('draft','sent','viewed','signed','completed')),
  sent_to_email TEXT DEFAULT '',
  sent_at TIMESTAMPTZ,
  viewed_at TIMESTAMPTZ,
  share_token TEXT UNIQUE,
  share_expires_at TIMESTAMPTZ,
  uploaded_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_documents_contact ON documents(contact_id);
CREATE INDEX IF NOT EXISTS idx_documents_transaction ON documents(transaction_id);
CREATE INDEX IF NOT EXISTS idx_documents_share ON documents(share_token);
CREATE INDEX IF NOT EXISTS idx_documents_template ON documents(is_template) WHERE is_template = true;
ALTER TABLE documents ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admin can manage all documents" ON documents FOR ALL USING (
  EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
);
-- Allow public access to shared documents via share_token (read-only, non-expired)
CREATE POLICY "Anyone can read shared documents" ON documents FOR SELECT USING (
  share_token IS NOT NULL AND (share_expires_at IS NULL OR share_expires_at > now())
);

-- ═══ 17. Transaction Checklist ═══
CREATE TABLE IF NOT EXISTS transaction_checklist (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  transaction_id UUID REFERENCES transactions(id) ON DELETE CASCADE NOT NULL,
  title TEXT NOT NULL,
  is_completed BOOLEAN DEFAULT false,
  completed_at TIMESTAMPTZ,
  due_date DATE,
  sort_order INT DEFAULT 0,
  document_id UUID REFERENCES documents(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_tx_checklist_transaction ON transaction_checklist(transaction_id, sort_order);
ALTER TABLE transaction_checklist ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admin can manage transaction checklists" ON transaction_checklist FOR ALL USING (
  EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
);

-- ═══ 18. Trigger: Auto-create contact from new lead ═══
CREATE OR REPLACE FUNCTION create_contact_from_lead()
RETURNS TRIGGER AS $$
DECLARE
  existing_contact_id UUID;
BEGIN
  -- Check if contact already exists by email
  IF NEW.email IS NOT NULL AND NEW.email != '' THEN
    SELECT id INTO existing_contact_id FROM contacts
      WHERE LOWER(email) = LOWER(NEW.email) LIMIT 1;
  END IF;

  IF existing_contact_id IS NOT NULL THEN
    -- Update existing contact: append transcript if chatbot source
    UPDATE contacts SET
      chat_transcript = CASE
        WHEN NEW.source IN ('chatbot', 'chatbot_signup') AND NEW.message IS NOT NULL AND NEW.message != ''
        THEN COALESCE(chat_transcript, '') || E'\n\n--- ' || NEW.source || ' (' || to_char(NOW(), 'YYYY-MM-DD HH24:MI') || ') ---\n' || NEW.message
        ELSE chat_transcript
      END,
      updated_at = NOW()
    WHERE id = existing_contact_id;

    -- Log activity
    INSERT INTO contact_activity (contact_id, activity_type, description, metadata)
    VALUES (existing_contact_id, 'lead_created',
      'New lead from ' || COALESCE(NEW.source, 'unknown'),
      jsonb_build_object('source', NEW.source));
  ELSE
    -- Create new contact
    INSERT INTO contacts (first_name, last_name, email, phone, source, chat_transcript, stage)
    VALUES (
      COALESCE(NEW.first_name, ''),
      COALESCE(NEW.last_name, ''),
      COALESCE(NEW.email, ''),
      COALESCE(NEW.phone, ''),
      COALESCE(NEW.source, 'manual'),
      CASE WHEN NEW.source IN ('chatbot', 'chatbot_signup') THEN COALESCE(NEW.message, '') ELSE '' END,
      'new'
    )
    RETURNING id INTO existing_contact_id;

    -- Log activity
    INSERT INTO contact_activity (contact_id, activity_type, description, metadata)
    VALUES (existing_contact_id, 'lead_created',
      'Lead captured from ' || COALESCE(NEW.source, 'unknown'),
      jsonb_build_object('source', NEW.source));
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Only create trigger if it doesn't exist
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'on_lead_insert') THEN
    CREATE TRIGGER on_lead_insert
      AFTER INSERT ON leads
      FOR EACH ROW
      EXECUTE FUNCTION create_contact_from_lead();
  END IF;
END $$;

-- ═══ 19. Trigger: Link profile to contact on signup ═══
CREATE OR REPLACE FUNCTION link_profile_to_contact()
RETURNS TRIGGER AS $$
DECLARE
  found_contact_id UUID;
BEGIN
  -- Try to link by email
  IF NEW.email IS NOT NULL AND NEW.email != '' THEN
    UPDATE contacts SET user_id = NEW.id, updated_at = NOW()
    WHERE LOWER(email) = LOWER(NEW.email) AND user_id IS NULL
    RETURNING id INTO found_contact_id;
  END IF;

  -- If no contact existed, create one
  IF found_contact_id IS NULL THEN
    INSERT INTO contacts (user_id, first_name, last_name, email, phone, source, stage)
    VALUES (
      NEW.id,
      COALESCE(NEW.first_name, ''),
      COALESCE(NEW.last_name, ''),
      COALESCE(NEW.email, ''),
      COALESCE(NEW.phone, ''),
      'account_signup',
      'new'
    );
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Only create trigger if it doesn't exist
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'on_profile_insert') THEN
    CREATE TRIGGER on_profile_insert
      AFTER INSERT ON profiles
      FOR EACH ROW
      EXECUTE FUNCTION link_profile_to_contact();
  END IF;
END $$;

-- ═══ 20. One-time data migration: Seed contacts from existing leads ═══
-- Run this ONCE after creating the tables above.
-- Deduplicates by email, takes the earliest lead per email.
INSERT INTO contacts (first_name, last_name, email, phone, source, chat_transcript, stage, created_at)
SELECT DISTINCT ON (LOWER(email))
  COALESCE(first_name, ''),
  COALESCE(last_name, ''),
  email,
  COALESCE(phone, ''),
  COALESCE(source, 'manual'),
  CASE WHEN source IN ('chatbot', 'chatbot_signup') THEN COALESCE(message, '') ELSE '' END,
  'new',
  created_at
FROM leads
WHERE email IS NOT NULL AND email != ''
ORDER BY LOWER(email), created_at ASC
ON CONFLICT DO NOTHING;

-- Link contacts to existing profiles by email
UPDATE contacts c SET user_id = p.id
FROM profiles p
WHERE LOWER(c.email) = LOWER(p.email) AND c.user_id IS NULL;

-- ═══════════════════════════════════════════════════════════════
-- MLS GRID REPLICATION TABLES
-- These tables store replicated data from MLS Grid Web API
-- ═══════════════════════════════════════════════════════════════

-- ═══ 21. MLS Listings (Property Resource) ═══
CREATE TABLE IF NOT EXISTS mls_listings (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  listing_id TEXT NOT NULL UNIQUE,
  listing_key TEXT NOT NULL UNIQUE,
  originating_system_name TEXT NOT NULL,
  modification_timestamp TIMESTAMPTZ NOT NULL,
  standard_status TEXT DEFAULT 'Active',
  mlg_can_view BOOLEAN DEFAULT true,

  -- Core listing data (RESO Data Dictionary fields)
  list_price INT,
  close_price INT,
  original_list_price INT,
  street_number TEXT DEFAULT '',
  street_name TEXT DEFAULT '',
  street_suffix TEXT DEFAULT '',
  unit_number TEXT DEFAULT '',
  city TEXT DEFAULT '',
  state_or_province TEXT DEFAULT 'NC',
  postal_code TEXT DEFAULT '',
  county_or_parish TEXT DEFAULT '',
  full_address TEXT GENERATED ALWAYS AS (
    TRIM(CONCAT_WS(' ', street_number, street_name, street_suffix,
      CASE WHEN unit_number != '' THEN CONCAT('Unit ', unit_number) ELSE NULL END))
  ) STORED,

  -- Property details
  property_type TEXT DEFAULT '',
  property_sub_type TEXT DEFAULT '',
  bedrooms_total INT DEFAULT 0,
  bathrooms_total_integer INT DEFAULT 0,
  bathrooms_half INT DEFAULT 0,
  living_area NUMERIC,
  living_area_units TEXT DEFAULT 'Square Feet',
  lot_size_acres NUMERIC,
  lot_size_square_feet NUMERIC,
  year_built INT,
  stories INT,
  garage_spaces INT DEFAULT 0,
  parking_total INT DEFAULT 0,

  -- Description and remarks
  public_remarks TEXT DEFAULT '',
  private_remarks TEXT DEFAULT '',
  showing_instructions TEXT DEFAULT '',
  directions TEXT DEFAULT '',

  -- Agent/office info
  list_agent_key TEXT DEFAULT '',
  list_agent_full_name TEXT DEFAULT '',
  list_agent_email TEXT DEFAULT '',
  list_agent_phone TEXT DEFAULT '',
  list_office_key TEXT DEFAULT '',
  list_office_name TEXT DEFAULT '',
  list_office_phone TEXT DEFAULT '',
  buyer_agent_key TEXT DEFAULT '',
  buyer_agent_full_name TEXT DEFAULT '',
  buyer_office_key TEXT DEFAULT '',
  buyer_office_name TEXT DEFAULT '',

  -- Dates
  list_date DATE,
  close_date DATE,
  expiration_date DATE,
  days_on_market INT DEFAULT 0,
  cumulative_days_on_market INT DEFAULT 0,

  -- Location
  latitude NUMERIC,
  longitude NUMERIC,

  -- Associations
  association_fee NUMERIC,
  association_fee_frequency TEXT DEFAULT '',
  association_name TEXT DEFAULT '',

  -- Taxes
  tax_annual_amount NUMERIC,
  tax_year INT,

  -- Features (stored as arrays for flexibility)
  heating TEXT[] DEFAULT '{}',
  cooling TEXT[] DEFAULT '{}',
  interior_features TEXT[] DEFAULT '{}',
  exterior_features TEXT[] DEFAULT '{}',
  appliances TEXT[] DEFAULT '{}',
  waterfront_features TEXT[] DEFAULT '{}',
  view TEXT[] DEFAULT '{}',
  roof TEXT[] DEFAULT '{}',
  flooring TEXT[] DEFAULT '{}',
  foundation_details TEXT[] DEFAULT '{}',
  construction_materials TEXT[] DEFAULT '{}',

  -- Utilities
  water_source TEXT[] DEFAULT '{}',
  sewer TEXT[] DEFAULT '{}',
  electric TEXT[] DEFAULT '{}',
  internet_whole_listing TEXT[] DEFAULT '{}',

  -- Restrictions / zoning
  zoning TEXT DEFAULT '',
  restrictions TEXT[] DEFAULT '{}',

  -- Full raw JSON from MLS Grid (for fields we haven't mapped)
  raw_data JSONB DEFAULT '{}',

  -- Internal tracking
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_mls_listings_mod ON mls_listings(originating_system_name, modification_timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_mls_listings_status ON mls_listings(standard_status) WHERE mlg_can_view = true;
CREATE INDEX IF NOT EXISTS idx_mls_listings_city ON mls_listings(city, standard_status);
CREATE INDEX IF NOT EXISTS idx_mls_listings_price ON mls_listings(list_price) WHERE mlg_can_view = true AND standard_status = 'Active';
CREATE INDEX IF NOT EXISTS idx_mls_listings_type ON mls_listings(property_type, standard_status);
CREATE INDEX IF NOT EXISTS idx_mls_listings_geo ON mls_listings(latitude, longitude) WHERE latitude IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_mls_listings_listing_id ON mls_listings(listing_id);

ALTER TABLE mls_listings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can read active listings" ON mls_listings FOR SELECT USING (mlg_can_view = true);
CREATE POLICY "Admin can manage listings" ON mls_listings FOR ALL USING (
  EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
);

-- ═══ 22. MLS Media (expanded from Property) ═══
CREATE TABLE IF NOT EXISTS mls_media (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  listing_key TEXT NOT NULL REFERENCES mls_listings(listing_key) ON DELETE CASCADE,
  media_key TEXT NOT NULL UNIQUE,
  media_url TEXT NOT NULL,
  local_url TEXT DEFAULT '',
  media_type TEXT DEFAULT 'image/jpeg',
  media_category TEXT DEFAULT 'Photo',
  short_description TEXT DEFAULT '',
  "order" INT DEFAULT 0,
  image_width INT,
  image_height INT,
  modification_timestamp TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_mls_media_listing ON mls_media(listing_key, "order");
ALTER TABLE mls_media ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can read media" ON mls_media FOR SELECT USING (true);
CREATE POLICY "Admin can manage media" ON mls_media FOR ALL USING (
  EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
);

-- ═══ 23. MLS Members (Member Resource) ═══
CREATE TABLE IF NOT EXISTS mls_members (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  member_key TEXT NOT NULL UNIQUE,
  member_mls_id TEXT DEFAULT '',
  originating_system_name TEXT NOT NULL,
  modification_timestamp TIMESTAMPTZ NOT NULL,
  mlg_can_view BOOLEAN DEFAULT true,
  member_full_name TEXT DEFAULT '',
  member_first_name TEXT DEFAULT '',
  member_last_name TEXT DEFAULT '',
  member_email TEXT DEFAULT '',
  member_phone TEXT DEFAULT '',
  member_mobile_phone TEXT DEFAULT '',
  member_office_key TEXT DEFAULT '',
  member_status TEXT DEFAULT 'Active',
  raw_data JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_mls_members_mod ON mls_members(originating_system_name, modification_timestamp DESC);
ALTER TABLE mls_members ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can read active members" ON mls_members FOR SELECT USING (mlg_can_view = true);
CREATE POLICY "Admin can manage members" ON mls_members FOR ALL USING (
  EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
);

-- ═══ 24. MLS Offices (Office Resource) ═══
CREATE TABLE IF NOT EXISTS mls_offices (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  office_key TEXT NOT NULL UNIQUE,
  office_mls_id TEXT DEFAULT '',
  originating_system_name TEXT NOT NULL,
  modification_timestamp TIMESTAMPTZ NOT NULL,
  mlg_can_view BOOLEAN DEFAULT true,
  office_name TEXT DEFAULT '',
  office_phone TEXT DEFAULT '',
  office_email TEXT DEFAULT '',
  office_address TEXT DEFAULT '',
  office_city TEXT DEFAULT '',
  office_state TEXT DEFAULT '',
  office_postal_code TEXT DEFAULT '',
  office_status TEXT DEFAULT 'Active',
  raw_data JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_mls_offices_mod ON mls_offices(originating_system_name, modification_timestamp DESC);
ALTER TABLE mls_offices ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can read active offices" ON mls_offices FOR SELECT USING (mlg_can_view = true);
CREATE POLICY "Admin can manage offices" ON mls_offices FOR ALL USING (
  EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
);

-- ═══ 25. MLS Open Houses (OpenHouse Resource) ═══
CREATE TABLE IF NOT EXISTS mls_open_houses (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  open_house_key TEXT NOT NULL UNIQUE,
  listing_key TEXT REFERENCES mls_listings(listing_key) ON DELETE CASCADE,
  listing_id TEXT DEFAULT '',
  originating_system_name TEXT NOT NULL,
  modification_timestamp TIMESTAMPTZ NOT NULL,
  mlg_can_view BOOLEAN DEFAULT true,
  open_house_date DATE,
  open_house_start_time TIME,
  open_house_end_time TIME,
  open_house_remarks TEXT DEFAULT '',
  showing_agent_key TEXT DEFAULT '',
  raw_data JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_mls_open_houses_mod ON mls_open_houses(originating_system_name, modification_timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_mls_open_houses_date ON mls_open_houses(open_house_date) WHERE mlg_can_view = true;
ALTER TABLE mls_open_houses ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can read active open houses" ON mls_open_houses FOR SELECT USING (mlg_can_view = true);
CREATE POLICY "Admin can manage open houses" ON mls_open_houses FOR ALL USING (
  EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
);

-- ═══ 26. MLS Sync State (tracks replication progress) ═══
CREATE TABLE IF NOT EXISTS mls_sync_state (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  resource_type TEXT NOT NULL UNIQUE,
  originating_system_name TEXT NOT NULL,
  last_modification_timestamp TIMESTAMPTZ,
  last_sync_at TIMESTAMPTZ DEFAULT now(),
  records_synced INT DEFAULT 0,
  status TEXT DEFAULT 'idle' CHECK (status IN ('idle', 'running', 'error')),
  error_message TEXT DEFAULT '',
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Seed sync state for all 4 resource types
INSERT INTO mls_sync_state (resource_type, originating_system_name) VALUES
  ('Property', ''),
  ('Member', ''),
  ('Office', ''),
  ('OpenHouse', '')
ON CONFLICT (resource_type) DO NOTHING;

ALTER TABLE mls_sync_state ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admin can manage sync state" ON mls_sync_state FOR ALL USING (
  EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
);

-- ═══ 27. Public Records (County Tax/Assessment History via NC OneMap) ═══
CREATE TABLE IF NOT EXISTS public_records (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  listing_key TEXT REFERENCES mls_listings(listing_key) ON DELETE CASCADE,
  parcel_id TEXT DEFAULT '',
  year INT NOT NULL,
  assessed_value NUMERIC,
  land_value NUMERIC,
  improved_value NUMERIC,
  tax_amount NUMERIC,
  sale_date DATE,
  sale_price INT,
  source_county TEXT DEFAULT '',
  source_url TEXT DEFAULT '',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(listing_key, year)
);

CREATE INDEX IF NOT EXISTS idx_public_records_listing ON public_records(listing_key, year DESC);
CREATE INDEX IF NOT EXISTS idx_public_records_parcel ON public_records(parcel_id, year DESC);

ALTER TABLE public_records ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can read public records" ON public_records FOR SELECT USING (true);
CREATE POLICY "Admin can manage public records" ON public_records FOR ALL USING (
  EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
);
