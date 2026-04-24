-- ═══════════════════════════════════════════════════════════════════════
-- MLS Grid Compliance — Rules 7, 8, 11B (Live-Data Verification 2026-04-24)
-- ═══════════════════════════════════════════════════════════════════════
-- Rule 7  — Address withholding: listings with InternetAddressDisplayYN=false
--           must not expose address/lat/lng to the public.
-- Rule 8  — Seller IDX opt-out: listings with InternetEntireListingDisplayYN=false
--           or missing "IDX" in MlgCanUse must not be displayed publicly.
-- Rule 11B — Data removal on refresh: closed/expired/withdrawn/canceled listings
--           must not appear on public display after the next sync.
--
-- Gaps found against live data:
--   - 6 Active Canopy rows had InternetEntireListingDisplayYN=false yet were
--     served to anon via REST (e.g. CAR292869404).
--   - 15 Active rows (9 Canopy + 6 CSAR) had InternetAddressDisplayYN=false
--     yet full_address / street_* / lat / lng were readable.
--   - 2,103 non-Active winner rows (Closed/Canceled/Expired) were readable
--     by anon because the prior RLS policy only filtered on mlg_can_view.
--
-- Fix strategy:
--   1. Promote the three IDX-eligibility signals into dedicated columns
--      so RLS can apply them with indexable predicates.
--   2. Backfill from raw_data for existing rows.
--   3. Tighten the "Anyone can read active listings" RLS so anon role
--      only sees rows that pass every compliance gate.
--   4. One-time cleanup: mask address columns on Rule 7 opt-outs.
-- ═══════════════════════════════════════════════════════════════════════

-- 1. Dedicated columns for the compliance signals ──────────────────────
ALTER TABLE mls_listings
  ADD COLUMN IF NOT EXISTS internet_entire_listing_display_yn BOOLEAN DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS internet_address_display_yn BOOLEAN DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS mlg_can_use TEXT[] DEFAULT ARRAY['IDX']::TEXT[];

COMMENT ON COLUMN mls_listings.internet_entire_listing_display_yn IS
  'RESO InternetEntireListingDisplayYN — seller opt-in for public IDX display. If FALSE, row must not appear on the public site (Canopy Rule 8).';
COMMENT ON COLUMN mls_listings.internet_address_display_yn IS
  'RESO InternetAddressDisplayYN — seller opt-in for public address display. If FALSE, address / lat / lng must be masked (Canopy Rule 7).';
COMMENT ON COLUMN mls_listings.mlg_can_use IS
  'MLS Grid MlgCanUse — allowed feed types. If it does not contain "IDX" the row must not appear on the public site (Canopy Rule 8).';

-- 2. Backfill from raw_data for rows synced before this migration ──────
UPDATE mls_listings
SET internet_entire_listing_display_yn = COALESCE(
      (raw_data->>'InternetEntireListingDisplayYN')::boolean,
      TRUE
    )
WHERE raw_data ? 'InternetEntireListingDisplayYN';

UPDATE mls_listings
SET internet_address_display_yn = COALESCE(
      (raw_data->>'InternetAddressDisplayYN')::boolean,
      TRUE
    )
WHERE raw_data ? 'InternetAddressDisplayYN';

UPDATE mls_listings
SET mlg_can_use = ARRAY(
      SELECT jsonb_array_elements_text(raw_data->'MlgCanUse')
    )
WHERE jsonb_typeof(raw_data->'MlgCanUse') = 'array';

-- 3. One-time address masking for Rule 7 opt-outs already on disk ──────
-- Addresses are derived from street_number / street_name / street_suffix /
-- unit_number (full_address is a GENERATED column), and lat / lng are stored.
-- Zero them on every row the seller opted out of address display.
UPDATE mls_listings
SET street_number = '',
    street_name = '',
    street_suffix = '',
    unit_number = '',
    latitude = NULL,
    longitude = NULL
WHERE internet_address_display_yn = FALSE
  AND (
    street_number <> ''
    OR street_name <> ''
    OR street_suffix <> ''
    OR unit_number <> ''
    OR latitude IS NOT NULL
    OR longitude IS NOT NULL
  );

-- 4. Tighten the RLS policy to block non-compliant rows from anon ──────
-- The prior policy ("mlg_can_view = true") leaked Closed/Expired/Canceled
-- winners plus seller-opted-out rows. Replace it with a policy that matches
-- the frontend filter exactly, so direct REST access cannot see anything
-- the site itself would not display.
DROP POLICY IF EXISTS "Anyone can read active listings" ON mls_listings;

CREATE POLICY "Public can read IDX-eligible active winners" ON mls_listings
FOR SELECT USING (
  mlg_can_view = TRUE
  AND is_winner = TRUE
  AND standard_status IN ('Active', 'Active Under Contract', 'Pending')
  AND COALESCE(internet_entire_listing_display_yn, TRUE) = TRUE
  AND 'IDX' = ANY(COALESCE(mlg_can_use, ARRAY['IDX']::TEXT[]))
  AND COALESCE(property_type, '') <> 'Residential Lease'
);

-- 5. Support index for the new RLS predicates ──────────────────────────
CREATE INDEX IF NOT EXISTS idx_mls_listings_compliance_gate
  ON mls_listings (standard_status, is_winner)
  WHERE mlg_can_view = TRUE
    AND internet_entire_listing_display_yn = TRUE
    AND (property_type IS NULL OR property_type <> 'Residential Lease');

-- 6. Sanity check (for manual runs — no-op in CI) ──────────────────────
-- After this migration, the anon role should see zero rows with:
--   standard_status NOT IN ('Active','Active Under Contract','Pending')
--   internet_entire_listing_display_yn = FALSE
--   internet_address_display_yn = FALSE with non-empty street_number
--   mlg_can_use containing no 'IDX'
