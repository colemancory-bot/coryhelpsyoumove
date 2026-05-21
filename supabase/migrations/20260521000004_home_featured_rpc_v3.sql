-- v3: drop the parts the client doesn't strictly need on first paint, so the
-- function returns under 1s. Removed:
--   * latest_modification subquery — was a separate ~1s aggregate over the
--     winner partial index. The freshness poller doesn't actually need this
--     hint from the RPC; init() sets _latestMod from the bulk listingRows it
--     loads in the background.
--   * siblings CTE — was joining loser rows back by address_group_key, which
--     forced a second scan of mls_listings. Featured cards only show the
--     primary MLS attribution for a fraction of a second before init()
--     refreshes them with the full mlsSources array, so single-source
--     attribution on first paint is fine.
--
-- Rewrote the photo lookup as a single IN-list query against mls_media
-- instead of N×LATERAL joins. With 24 keys, the planner does 24 indexed
-- lookups in one pass.

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
  -- One scan of mls_media for all candidate keys. DISTINCT ON picks the
  -- lowest "order" per listing_key, preferring 0 over 1.
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
          'siblings', '[]'::jsonb
        )
      )
      FROM with_photos w
    ), '[]'::jsonb)
  );
$$;

GRANT EXECUTE ON FUNCTION home_featured(int) TO anon, authenticated;
