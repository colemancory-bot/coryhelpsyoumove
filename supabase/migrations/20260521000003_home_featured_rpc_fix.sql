-- v1 of home_featured() timed out under load. Root causes:
--   1. SECURITY INVOKER means RLS rewrites the body's mls_listings predicates,
--      and the planner couldn't combine them cleanly with the function's own
--      WHERE clause. The function already enforces the same gates RLS would,
--      so swap to SECURITY DEFINER + STABLE and skip the rewrite.
--   2. The per-row correlated subquery for primary_photo did one nested-loop
--      lookup per candidate; LIMIT 24 of those happened before the LIMIT 6 hit.
--      Rewrite as a LATERAL join so the planner can pick a single index path.
--   3. Composite ORDER BY (days_on_market, modification_timestamp) couldn't be
--      satisfied by the partial index. Drop the secondary key; days_on_market
--      alone is enough — ties are rare and order is cosmetic.

CREATE OR REPLACE FUNCTION home_featured(limit_count int DEFAULT 6)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH candidates AS MATERIALIZED (
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
      l.modification_timestamp,
      l.public_remarks,
      l.list_agent_full_name,
      l.list_office_name,
      l.list_office_phone,
      l.attribution_contact,
      l.originating_system_name,
      l.restrictions,
      l.list_date
    FROM mls_listings l
    WHERE l.is_winner = true
      AND l.mlg_can_view = true
      AND l.standard_status IN ('Active', 'Active Under Contract', 'Pending')
      AND l.property_type <> 'Residential Lease'
    ORDER BY l.days_on_market ASC NULLS LAST
    LIMIT GREATEST(limit_count * 4, 24)
  ),
  with_photos AS (
    SELECT c.*, p.primary_photo
    FROM candidates c
    CROSS JOIN LATERAL (
      SELECT
        CASE
          WHEN NULLIF(m.local_url, '') IS NOT NULL THEN m.local_url
          WHEN m.media_url NOT LIKE '%mlsgrid.com%' THEN m.media_url
          ELSE NULL
        END AS primary_photo
      FROM mls_media m
      WHERE m.listing_key = c.listing_key
        AND m."order" IN (0, 1)
        AND (m.local_url <> '' OR m.media_url NOT LIKE '%mlsgrid.com%')
      ORDER BY m."order" ASC
      LIMIT 1
    ) p
    WHERE p.primary_photo IS NOT NULL
    LIMIT limit_count
  ),
  siblings AS (
    SELECT
      w.listing_key AS winner_key,
      jsonb_agg(jsonb_build_object(
        'listing_id', sib.listing_id,
        'originating_system_name', sib.originating_system_name,
        'attribution_contact', sib.attribution_contact
      )) AS sibling_rows
    FROM with_photos w
    JOIN mls_listings sib
      ON sib.address_group_key = w.address_group_key
     AND sib.is_winner = false
     AND sib.mlg_can_view = true
    WHERE w.address_group_key IS NOT NULL
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
          'living_area', w.living_area,
          'living_area_range', w.living_area_range,
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
          'siblings', coalesce(
            (SELECT sibling_rows FROM siblings sb WHERE sb.winner_key = w.listing_key),
            '[]'::jsonb
          )
        )
      )
      FROM with_photos w
    ), '[]'::jsonb),
    'latest_modification', (
      SELECT max(modification_timestamp)::text
      FROM mls_listings
      WHERE is_winner = true
        AND mlg_can_view = true
        AND standard_status IN ('Active', 'Active Under Contract', 'Pending')
        AND property_type <> 'Residential Lease'
    )
  );
$$;

-- Re-grant (DEFINER functions still need EXECUTE for anon to call them).
GRANT EXECUTE ON FUNCTION home_featured(int) TO anon, authenticated;
