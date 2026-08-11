-- Add lot size (acreage) filtering to search_listings.
--
-- The search bar has had no way to filter by lot size, which is a real gap on
-- a site where land and acreage is a large share of inventory and
-- "homes with acreage" is a Tier 1 keyword with its own landing page.
--
-- Two data quirks this has to handle:
--
--   1. Listings carry EITHER lot_size_acres OR lot_size_square_feet, not
--      always both. app.js already normalizes this at render time
--      (app.js:991) by falling back to square_feet/43560. The filter has to
--      do the same or it silently drops every listing that only reported
--      square feet.
--   2. Some rows carry a literal 0 in lot_size_acres while having a real
--      square-foot figure, so NULLIF(...,0) is needed before the coalesce,
--      otherwise those fall through as "0 acres" and never match a minimum.
--
-- Rows with no lot size at all evaluate to NULL and are excluded whenever an
-- acreage filter is active, which is the correct read of "at least 5 acres":
-- unknown is not a match.
--
-- The signature gains two parameters, so the old function is dropped rather
-- than replaced. CREATE OR REPLACE with a different parameter list would
-- create an overload instead, and calls using named parameters would then
-- fail as ambiguous. Migrations run in a transaction, so the drop and create
-- are atomic and the site never sees a missing function.

DROP FUNCTION IF EXISTS search_listings(text[], text, numeric, numeric, int, int, text, text, text, text, int);

CREATE FUNCTION search_listings(
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
  p_limit          int     DEFAULT 1000,
  p_min_acres      numeric DEFAULT NULL,
  p_max_acres      numeric DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_text text := nullif(trim(p_text_query), '');
  v_result jsonb;
BEGIN
  WITH filtered AS MATERIALIZED (
    SELECT
      l.listing_key, l.listing_id, l.address_group_key, l.list_price,
      l.full_address, l.city, l.property_type, l.property_sub_type,
      l.bedrooms_total, l.bathrooms_total_integer,
      l.living_area, l.living_area_range,
      l.lot_size_acres, l.lot_size_square_feet,
      l.standard_status, l.association_fee, l.latitude, l.longitude,
      l.year_built, l.days_on_market, l.list_date, l.modification_timestamp,
      l.list_agent_full_name, l.list_office_name, l.list_office_phone,
      l.attribution_contact, l.originating_system_name, l.restrictions
    FROM mls_listings l
    WHERE l.is_winner = true
      AND l.mlg_can_view = true
      AND l.standard_status IN ('Active', 'Active Under Contract', 'Pending')
      AND l.property_type <> 'Residential Lease'
      AND (p_cities IS NULL OR cardinality(p_cities) = 0 OR l.city = ANY(p_cities))
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
        p_min_acres IS NULL
        OR coalesce(
             nullif(l.lot_size_acres, 0),
             nullif(l.lot_size_square_feet, 0) / 43560.0
           ) >= p_min_acres
      )
      AND (
        p_max_acres IS NULL
        OR coalesce(
             nullif(l.lot_size_acres, 0),
             nullif(l.lot_size_square_feet, 0) / 43560.0
           ) <= p_max_acres
      )
      AND (
        p_restrict IS NULL OR p_restrict = ''
        OR (p_restrict = 'unrestricted'
            AND mls_compute_restrictions(l.restrictions, l.association_fee) = 'unrestricted')
        OR (p_restrict = 'restricted'
            AND mls_compute_restrictions(l.restrictions, l.association_fee) <> 'unrestricted')
      )
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
    ORDER BY
      CASE WHEN v_text IS NOT NULL AND p_sort_key = 'relevance'
           THEN similarity(
             coalesce(l.full_address,'') || ' ' || coalesce(l.city,'') || ' ' || coalesce(l.listing_id,''),
             v_text
           ) END DESC,
      CASE WHEN p_sort_key = 'daysOnMarket' AND p_sort_dir = 'asc'  THEN l.days_on_market END ASC NULLS LAST,
      CASE WHEN p_sort_key = 'daysOnMarket' AND p_sort_dir = 'desc' THEN l.days_on_market END DESC NULLS LAST,
      CASE WHEN p_sort_key = 'price' AND p_sort_dir = 'asc'  THEN l.list_price END ASC NULLS LAST,
      CASE WHEN p_sort_key = 'price' AND p_sort_dir = 'desc' THEN l.list_price END DESC NULLS LAST,
      CASE WHEN p_sort_key = 'priceSqft' AND p_sort_dir = 'asc'
           THEN (l.list_price::numeric / NULLIF(l.living_area, 0)) END ASC NULLS LAST,
      CASE WHEN p_sort_key = 'priceSqft' AND p_sort_dir = 'desc'
           THEN (l.list_price::numeric / NULLIF(l.living_area, 0)) END DESC NULLS LAST,
      CASE WHEN p_sort_key = 'priceAcre' AND p_sort_dir = 'asc'
           THEN (l.list_price::numeric / NULLIF(l.lot_size_acres, 0)) END ASC NULLS LAST,
      CASE WHEN p_sort_key = 'priceAcre' AND p_sort_dir = 'desc'
           THEN (l.list_price::numeric / NULLIF(l.lot_size_acres, 0)) END DESC NULLS LAST,
      l.listing_key ASC
    LIMIT GREATEST(p_limit, 1)
  ),
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
  sqft_overrides AS (
    SELECT
      f.listing_key AS winner_key,
      MAX(sib.living_area) FILTER (
        WHERE (sib.living_area_range IS NULL OR sib.living_area_range = '')
          AND sib.living_area IS NOT NULL
          AND sib.living_area > 0
      ) AS exact_living_area
    FROM filtered f
    JOIN mls_listings sib
      ON sib.address_group_key = f.address_group_key
     AND sib.listing_key <> f.listing_key
     AND sib.mlg_can_view = true
    WHERE f.address_group_key IS NOT NULL
      AND coalesce(f.living_area_range, '') <> ''
    GROUP BY f.listing_key
  )
  SELECT jsonb_build_object(
    'listings', coalesce((
      SELECT jsonb_agg(
        jsonb_build_object(
          'listing_key', f.listing_key,
          'listing_id', f.listing_id,
          'address_group_key', f.address_group_key,
          'list_price', f.list_price,
          'full_address', f.full_address,
          'city', f.city,
          'property_type', f.property_type,
          'property_sub_type', f.property_sub_type,
          'bedrooms_total', f.bedrooms_total,
          'bathrooms_total_integer', f.bathrooms_total_integer,
          'living_area', coalesce(so.exact_living_area, f.living_area),
          'living_area_range',
            CASE WHEN so.exact_living_area IS NOT NULL THEN ''
                 ELSE f.living_area_range END,
          'lot_size_acres', f.lot_size_acres,
          'lot_size_square_feet', f.lot_size_square_feet,
          'standard_status', f.standard_status,
          'association_fee', f.association_fee,
          'latitude', f.latitude,
          'longitude', f.longitude,
          'year_built', f.year_built,
          'days_on_market', f.days_on_market,
          'list_date', f.list_date,
          'modification_timestamp', f.modification_timestamp,
          'list_agent_full_name', f.list_agent_full_name,
          'list_office_name', f.list_office_name,
          'list_office_phone', f.list_office_phone,
          'attribution_contact', f.attribution_contact,
          'originating_system_name', f.originating_system_name,
          'restrictions', f.restrictions,
          'primary_photo', p.primary_photo
        )
      )
      FROM filtered f
      LEFT JOIN photos p ON p.listing_key = f.listing_key
      LEFT JOIN sqft_overrides so ON so.winner_key = f.listing_key
    ), '[]'::jsonb)
  ) INTO v_result;

  RETURN v_result;
END;
$$;

GRANT EXECUTE ON FUNCTION search_listings(text[], text, numeric, numeric, int, int, text, text, text, text, int, numeric, numeric) TO anon, authenticated;
