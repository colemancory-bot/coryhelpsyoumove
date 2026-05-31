-- ═══════════════════════════════════════════════════════════════════════
-- Lock broker-private COLUMNS of mls_listings from the public (anon) role
-- ═══════════════════════════════════════════════════════════════════════
-- WHY: The compliance RLS policy ("Public can read IDX-eligible active winners",
-- migration 20260424000001) correctly gates WHICH ROWS the anon role can read.
-- But Postgres RLS is row-level only — once a row is readable, EVERY column of
-- it is returned. So on every publicly-visible listing, the anon/publishable
-- key (embedded in the site's JS, extractable by anyone) can read broker-private
-- columns and the full RESO record.
--
-- CONFIRMED (2026-05-30) using ONLY the anon key, no login, on an active winner:
--   private_remarks      -> "Please make sure all doors are locked... SkyFi &..."
--   showing_instructions -> "Vacant, Schedule in Showing Manager"
-- and raw_data (the full RESO record, incl. OwnerName + the above) is readable.
-- This is an MLS Grid / RESO display-rule violation and a real security risk
-- (anyone can enumerate which listed homes are vacant, lockbox info, occupant
-- phones, compensation).
--
-- FIX: column-level privileges. RLS still decides the rows; this decides the
-- columns the anon role may read. We REVOKE anon's table-wide SELECT and GRANT
-- it back on the PUBLIC / IDX-displayable columns only — NOT raw_data and NOT
-- the private columns. RLS row-gating is left UNCHANGED (single source of truth;
-- not duplicated here). authenticated (admin CRM) and service_role (edge
-- functions, and afkbroker's server-side reader using the SERVICE key) keep
-- full access, so the admin/CMA paths and sync are unaffected.
--
-- A view was considered and rejected: a view would force duplicating the
-- compliance row-filter (drift risk on a compliance-critical predicate), and
-- the public site's only mls_listings select('*') is the admin path anyway.
-- ═══════════════════════════════════════════════════════════════════════

-- Remove the blanket table grant for the public role.
REVOKE SELECT ON public.mls_listings FROM anon;

-- Grant back ONLY public / IDX-displayable columns. Excludes (private):
--   private_remarks, showing_instructions, showing_contact_*, occupant_*,
--   lock_box_*, buyer_agency_compensation, sub_agency_compensation,
--   transaction_broker_compensation, listing_agreement, concessions_*,
--   internet_whole_listing, and raw_data.
-- Address/lat/lng are included because Rule 7 (migration 20260424000001)
-- already blanks them at sync time for InternetAddressDisplayYN opt-outs.
GRANT SELECT (
  id, listing_id, listing_key, originating_system_name, modification_timestamp,
  standard_status, mlg_can_view, list_price, close_price, original_list_price,
  street_number, street_name, street_suffix, unit_number, city, state_or_province,
  postal_code, county_or_parish, full_address, property_type, property_sub_type,
  bedrooms_total, bathrooms_total_integer, bathrooms_half, living_area,
  living_area_units, lot_size_acres, lot_size_square_feet, year_built, stories,
  garage_spaces, parking_total, public_remarks, directions, list_agent_key,
  list_agent_full_name, list_agent_email, list_agent_phone, list_office_key,
  list_office_name, list_office_phone, buyer_agent_key, buyer_agent_full_name,
  buyer_office_key, buyer_office_name, list_date, close_date, expiration_date,
  days_on_market, cumulative_days_on_market, latitude, longitude, association_fee,
  association_fee_frequency, association_name, tax_annual_amount, tax_year,
  heating, cooling, interior_features, exterior_features, appliances,
  waterfront_features, view, roof, flooring, foundation_details,
  construction_materials, water_source, sewer, electric, zoning, restrictions,
  created_at, updated_at, feed_type, special_listing_conditions, virtual_tour_url,
  video_url, attribution_contact, living_area_range, photos_change_timestamp,
  address_group_key, quality_score, media_count, is_winner,
  internet_entire_listing_display_yn, internet_address_display_yn, mlg_can_use
) ON public.mls_listings TO anon;

-- Verification after apply (run with ONLY the anon/publishable key):
--   SELECT private_remarks FROM mls_listings LIMIT 1;   -> permission denied ✓
--   SELECT raw_data FROM mls_listings LIMIT 1;          -> permission denied ✓
--   SELECT list_price, full_address FROM mls_listings
--     WHERE is_winner LIMIT 1;                          -> still returns ✓ (site OK)
-- NOTE: any PUBLIC query that errors with "permission denied for column X"
-- after this means X is a public field that needs adding to the GRANT above
-- (fail-closed: errors are visible, never silent leaks). The admin CRM and
-- afkbroker must use the authenticated session / service key (not anon).
