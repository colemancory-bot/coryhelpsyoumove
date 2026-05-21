-- Stage 2 of the homepage speed refactor.
--
-- srApplyFilters() in app.js currently filters ALL_LISTINGS in memory after
-- the full bulk fetch is done. That makes the search button feel slow on
-- cold load (user clicks Search before init() resolves and waits 4-6s) and
-- means every search request hands the browser ~8 MB of JSON just to display
-- a few cards.
--
-- This migration introduces search_listings() — a server-side RPC that takes
-- the same filter dimensions and returns ~30 KB instead of 8 MB. Search no
-- longer needs to wait on init() at all.
--
-- Includes:
--   1. pg_trgm GIN index for fuzzy address/city/MLS-id text search.
--   2. Helper to compute the "restrictions" enum the way mapListing() does.
--   3. search_listings(...) RPC itself — SECURITY DEFINER, gates explicit.

CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- GIN trigram index covering the three identity-ish fields the text search
-- needs to fuzzy-match: street address, city, and the listing ID (so an
-- agent can paste an MLS number and find the property). public_remarks is
-- deliberately excluded — paragraphs of marketing text bloat the index
-- without helping common searches.
CREATE INDEX IF NOT EXISTS idx_mls_listings_search_trgm
  ON mls_listings USING gin (
    (
      COALESCE(full_address,'') || ' ' ||
      COALESCE(city,'') || ' ' ||
      COALESCE(listing_id,'')
    ) gin_trgm_ops
  )
  WHERE is_winner = true
    AND mlg_can_view = true
    AND standard_status IN ('Active', 'Active Under Contract', 'Pending');

-- Supporting indexes for the most common filter combinations. The existing
-- idx_mls_listings_winner_active already covers (status, city, list_price)
-- so most price+location queries are fast. Add beds and lot for the other
-- common dimensions.
CREATE INDEX IF NOT EXISTS idx_mls_listings_beds
  ON mls_listings(bedrooms_total)
  WHERE is_winner = true
    AND mlg_can_view = true
    AND standard_status IN ('Active', 'Active Under Contract', 'Pending');

ANALYZE mls_listings;


-- Compute the same restrictions enum the client computes in mapListing().
-- 'hoa' when there are meaningful restriction entries OR a non-zero
-- association fee; 'unrestricted' otherwise.
CREATE OR REPLACE FUNCTION mls_compute_restrictions(
  restrictions text[],
  association_fee numeric
) RETURNS text
LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE
    WHEN association_fee IS NOT NULL AND association_fee > 0 THEN 'hoa'
    WHEN EXISTS (
      SELECT 1 FROM unnest(coalesce(restrictions, ARRAY[]::text[])) r
      WHERE lower(trim(r)) NOT IN ('', 'no', 'none', 'no restrictions')
    ) THEN 'hoa'
    ELSE 'unrestricted'
  END
$$;


CREATE OR REPLACE FUNCTION search_listings(
  p_cities         text[]  DEFAULT NULL,
  p_property_type  text    DEFAULT NULL,
  p_min_price      numeric DEFAULT NULL,
  p_max_price      numeric DEFAULT NULL,
  p_min_beds       int     DEFAULT NULL,
  p_min_baths      int     DEFAULT NULL,
  p_restrict       text    DEFAULT NULL,
  p_text_query     text    DEFAULT NULL,
  p_sort_key       text    DEFAULT 'daysOnMarket',
  p_sort_dir       text    DEFAULT 'asc',
  p_limit          int     DEFAULT 1000
) RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_text text := nullif(trim(p_text_query), '');
  v_haystack text := '';
  v_result jsonb;
BEGIN
  WITH filtered AS (
    SELECT
      l.listing_key,
      l.listing_id,
      l.address_group_key,
      l.list_price,
      l.full_address,
      l.city,
      l.property_type,
      l.property_sub_type,
      l.bedrooms_total,
      l.bathrooms_total_integer,
      l.living_area,
      l.living_area_range,
      l.lot_size_acres,
      l.lot_size_square_feet,
      l.standard_status,
      l.association_fee,
      l.latitude,
      l.longitude,
      l.year_built,
      l.days_on_market,
      l.list_date,
      l.modification_timestamp,
      l.list_agent_full_name,
      l.list_office_name,
      l.list_office_phone,
      l.attribution_contact,
      l.originating_system_name,
      l.restrictions,
      mls_compute_restrictions(l.restrictions, l.association_fee) AS restrict_enum,
      CASE
        WHEN v_text IS NULL THEN 1.0
        ELSE similarity(
          coalesce(l.full_address,'') || ' ' ||
          coalesce(l.city,'') || ' ' ||
          coalesce(l.listing_id,''),
          v_text
        )
      END AS text_score
    FROM mls_listings l
    WHERE l.is_winner = true
      AND l.mlg_can_view = true
      AND l.standard_status IN ('Active', 'Active Under Contract', 'Pending')
      AND l.property_type <> 'Residential Lease'
      -- City filter (areas → cities translated client-side)
      AND (p_cities IS NULL OR cardinality(p_cities) = 0 OR l.city = ANY(p_cities))
      -- Property type filter (UI labels → DB property_type / sub_type values)
      AND (
        p_property_type IS NULL OR p_property_type = ''
        OR (p_property_type = 'Single Family'
            AND l.property_type IN ('Residential','Single Family Residence'))
        OR (p_property_type = 'Cabin'
            AND coalesce(l.property_sub_type,'') ILIKE '%cabin%')
        OR (p_property_type = 'Multi-Family'
            AND l.property_type IN ('Multifamily','Multi-Family'))
        OR (p_property_type = 'Land'
            AND l.property_type = 'Land')
      )
      AND (p_min_price IS NULL OR l.list_price >= p_min_price)
      AND (p_max_price IS NULL OR l.list_price <= p_max_price)
      AND (p_min_beds  IS NULL OR coalesce(l.bedrooms_total, 0)             >= p_min_beds)
      AND (p_min_baths IS NULL OR coalesce(l.bathrooms_total_integer, 0)    >= p_min_baths)
      AND (
        p_restrict IS NULL OR p_restrict = ''
        OR (p_restrict = 'unrestricted'
            AND mls_compute_restrictions(l.restrictions, l.association_fee) = 'unrestricted')
        OR (p_restrict = 'restricted'
            AND mls_compute_restrictions(l.restrictions, l.association_fee) <> 'unrestricted')
      )
      -- Fuzzy text gate: combination of ILIKE (for substrings shorter than
      -- the trigram threshold) and % (which uses the GIN index for trgms).
      AND (
        v_text IS NULL
        OR (
          coalesce(l.full_address,'') || ' ' ||
          coalesce(l.city,'') || ' ' ||
          coalesce(l.listing_id,'')
        ) ILIKE '%' || v_text || '%'
        OR (
          coalesce(l.full_address,'') || ' ' ||
          coalesce(l.city,'') || ' ' ||
          coalesce(l.listing_id,'')
        ) % v_text
      )
  ),
  -- Pull primary photo for the survivors. DISTINCT ON over (listing_key)
  -- preferring lowest order (0 > 1).
  photos AS (
    SELECT DISTINCT ON (m.listing_key)
      m.listing_key,
      CASE
        WHEN NULLIF(m.local_url, '') IS NOT NULL THEN m.local_url
        WHEN m.media_url NOT LIKE '%mlsgrid.com%' THEN m.media_url
        ELSE NULL
      END AS primary_photo
    FROM mls_media m
    WHERE m.listing_key IN (SELECT listing_key FROM filtered)
      AND m."order" IN (0, 1)
      AND (m.local_url <> '' OR m.media_url NOT LIKE '%mlsgrid.com%')
    ORDER BY m.listing_key, m."order" ASC
  ),
  enriched AS (
    SELECT f.*, p.primary_photo
    FROM filtered f
    LEFT JOIN photos p ON p.listing_key = f.listing_key
  ),
  sorted AS (
    SELECT * FROM enriched
    ORDER BY
      -- Relevance: explicit text_score sort regardless of dir
      CASE WHEN v_text IS NOT NULL AND p_sort_key = 'relevance' THEN text_score END DESC,
      -- All other sorts respect p_sort_dir
      CASE WHEN p_sort_key = 'daysOnMarket' AND p_sort_dir = 'asc'  THEN days_on_market END ASC NULLS LAST,
      CASE WHEN p_sort_key = 'daysOnMarket' AND p_sort_dir = 'desc' THEN days_on_market END DESC NULLS LAST,
      CASE WHEN p_sort_key = 'price' AND p_sort_dir = 'asc'  THEN list_price END ASC NULLS LAST,
      CASE WHEN p_sort_key = 'price' AND p_sort_dir = 'desc' THEN list_price END DESC NULLS LAST,
      CASE WHEN p_sort_key = 'priceSqft' AND p_sort_dir = 'asc'
           THEN (list_price::numeric / NULLIF(living_area, 0)) END ASC NULLS LAST,
      CASE WHEN p_sort_key = 'priceSqft' AND p_sort_dir = 'desc'
           THEN (list_price::numeric / NULLIF(living_area, 0)) END DESC NULLS LAST,
      CASE WHEN p_sort_key = 'priceAcre' AND p_sort_dir = 'asc'
           THEN (list_price::numeric / NULLIF(lot_size_acres, 0)) END ASC NULLS LAST,
      CASE WHEN p_sort_key = 'priceAcre' AND p_sort_dir = 'desc'
           THEN (list_price::numeric / NULLIF(lot_size_acres, 0)) END DESC NULLS LAST,
      -- Tiebreak: stable order by listing_key
      listing_key ASC
    LIMIT GREATEST(p_limit, 1)
  )
  SELECT jsonb_build_object(
    'listings', coalesce((
      SELECT jsonb_agg(
        jsonb_build_object(
          'listing_key', s.listing_key,
          'listing_id', s.listing_id,
          'address_group_key', s.address_group_key,
          'list_price', s.list_price,
          'full_address', s.full_address,
          'city', s.city,
          'property_type', s.property_type,
          'property_sub_type', s.property_sub_type,
          'bedrooms_total', s.bedrooms_total,
          'bathrooms_total_integer', s.bathrooms_total_integer,
          'living_area', s.living_area,
          'living_area_range', s.living_area_range,
          'lot_size_acres', s.lot_size_acres,
          'lot_size_square_feet', s.lot_size_square_feet,
          'standard_status', s.standard_status,
          'association_fee', s.association_fee,
          'latitude', s.latitude,
          'longitude', s.longitude,
          'year_built', s.year_built,
          'days_on_market', s.days_on_market,
          'list_date', s.list_date,
          'modification_timestamp', s.modification_timestamp,
          'list_agent_full_name', s.list_agent_full_name,
          'list_office_name', s.list_office_name,
          'list_office_phone', s.list_office_phone,
          'attribution_contact', s.attribution_contact,
          'originating_system_name', s.originating_system_name,
          'restrictions', s.restrictions,
          'primary_photo', s.primary_photo
        )
      )
      FROM sorted s
    ), '[]'::jsonb),
    'count', (SELECT count(*)::int FROM filtered),
    'truncated', (SELECT count(*) > p_limit FROM filtered)
  ) INTO v_result;

  RETURN v_result;
END;
$$;

GRANT EXECUTE ON FUNCTION search_listings(text[], text, numeric, numeric, int, int, text, text, text, text, int) TO anon, authenticated;
