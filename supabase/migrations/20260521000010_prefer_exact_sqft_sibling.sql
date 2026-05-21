-- CSAR agents almost always enter sqft as a range ("2401-2600") and the
-- system fills `living_area` with the midpoint (2501). Canopy requires an
-- exact figure, so for any property carried by both MLSes the Canopy
-- sibling's `living_area` is the truer number.
--
-- The cross-MLS winner still picks per the recency rule (so list_price
-- stays fresh), but at render time we override `living_area` with the
-- sibling's value when the winner has a `living_area_range` set and the
-- sibling has a non-range `living_area`.
--
-- Affects home_featured() and search_listings(). The trigger / underlying
-- row data is unchanged.

CREATE OR REPLACE FUNCTION home_featured(limit_count int DEFAULT 6)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH candidates AS MATERIALIZED (
    SELECT
      l.listing_key, l.listing_id, l.address_group_key, l.list_price,
      l.full_address, l.city, l.property_type, l.property_sub_type,
      l.bedrooms_total, l.bathrooms_total_integer,
      l.living_area, l.living_area_range,
      l.lot_size_acres, l.lot_size_square_feet,
      l.standard_status, l.association_fee, l.latitude, l.longitude,
      l.year_built, l.days_on_market, l.modification_timestamp,
      l.public_remarks,
      l.list_agent_full_name, l.list_office_name, l.list_office_phone,
      l.attribution_contact, l.originating_system_name, l.restrictions,
      l.list_date
    FROM mls_listings l
    WHERE l.is_winner = true
      AND l.mlg_can_view = true
      AND l.standard_status IN ('Active', 'Active Under Contract', 'Pending')
      AND l.property_type <> 'Residential Lease'
    ORDER BY l.days_on_market ASC NULLS LAST, l.modification_timestamp DESC
    LIMIT GREATEST(limit_count * 4, 24)
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
    WHERE m.listing_key IN (SELECT listing_key FROM candidates)
      AND m."order" IN (0, 1)
      AND (m.local_url <> '' OR m.media_url NOT LIKE '%mlsgrid.com%')
    ORDER BY m.listing_key, m."order" ASC
  ),
  with_photos AS (
    SELECT c.*, p.primary_photo
    FROM candidates c
    JOIN photos p ON p.listing_key = c.listing_key
    WHERE p.primary_photo IS NOT NULL
    LIMIT limit_count
  ),
  -- Look for a sibling row in the same address group that has an exact
  -- sqft (no living_area_range). If found, use ITS living_area instead of
  -- the winner's CSAR-midpoint-style value.
  sqft_overrides AS (
    SELECT
      w.listing_key AS winner_key,
      MAX(sib.living_area) FILTER (
        WHERE (sib.living_area_range IS NULL OR sib.living_area_range = '')
          AND sib.living_area IS NOT NULL
          AND sib.living_area > 0
      ) AS exact_living_area
    FROM with_photos w
    JOIN mls_listings sib
      ON sib.address_group_key = w.address_group_key
     AND sib.listing_key <> w.listing_key
     AND sib.mlg_can_view = true
    WHERE w.address_group_key IS NOT NULL
      AND coalesce(w.living_area_range, '') <> ''
    GROUP BY w.listing_key
  )
  SELECT jsonb_build_object(
    'listings', coalesce((
      SELECT jsonb_agg(
        jsonb_build_object(
          'listing_key', w.listing_key,
          'listing_id', w.listing_id,
          'address_group_key', w.address_group_key,
          'list_price', w.list_price,
          'full_address', w.full_address,
          'city', w.city,
          'property_type', w.property_type,
          'property_sub_type', w.property_sub_type,
          'bedrooms_total', w.bedrooms_total,
          'bathrooms_total_integer', w.bathrooms_total_integer,
          -- Prefer sibling's exact sqft over winner's range midpoint
          'living_area', coalesce(so.exact_living_area, w.living_area),
          'living_area_range',
            CASE WHEN so.exact_living_area IS NOT NULL THEN ''
                 ELSE w.living_area_range END,
          'lot_size_acres', w.lot_size_acres,
          'lot_size_square_feet', w.lot_size_square_feet,
          'standard_status', w.standard_status,
          'association_fee', w.association_fee,
          'latitude', w.latitude,
          'longitude', w.longitude,
          'year_built', w.year_built,
          'days_on_market', w.days_on_market,
          'modification_timestamp', w.modification_timestamp,
          'public_remarks', w.public_remarks,
          'list_agent_full_name', w.list_agent_full_name,
          'list_office_name', w.list_office_name,
          'list_office_phone', w.list_office_phone,
          'attribution_contact', w.attribution_contact,
          'originating_system_name', w.originating_system_name,
          'restrictions', w.restrictions,
          'list_date', w.list_date,
          'primary_photo', w.primary_photo,
          'siblings', '[]'::jsonb
        )
      )
      FROM with_photos w
      LEFT JOIN sqft_overrides so ON so.winner_key = w.listing_key
    ), '[]'::jsonb)
  );
$$;

GRANT EXECUTE ON FUNCTION home_featured(int) TO anon, authenticated;


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

GRANT EXECUTE ON FUNCTION search_listings(text[], text, numeric, numeric, int, int, text, text, text, text, int) TO anon, authenticated;
