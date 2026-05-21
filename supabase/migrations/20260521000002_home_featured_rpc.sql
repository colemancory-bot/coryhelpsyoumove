-- Stage 1 of the homepage speed refactor.
--
-- Today's homepage init paginates all 8,697 winner listings, all primary media
-- rows, and every loser sibling before painting the 6 featured cards. That
-- means ~9 round-trips and ~8 MB on the wire before anything visible renders.
-- The "cheap and clunky" feel Cory called out is mostly that gap.
--
-- This RPC moves the visible-on-load query to the server: one round-trip,
-- ~10 KB, just the 6 cards plus their loser-sibling attribution plus the
-- latest modification_timestamp so the freshness poller still works.
--
-- The full ALL_LISTINGS payload still loads — but in the background, after
-- the featured grid paints. Search and CMA keep working against the same
-- in-memory ALL_LISTINGS they read today. Stage 2 (server-side search) is
-- the follow-up that lets us drop the bulk fetch entirely.
--
-- Security model:
--   - SECURITY INVOKER so RLS still applies. Anon's existing policy already
--     restricts SELECT on mls_listings to is_winner + mlg_can_view + active
--     statuses, so the function inherits those gates rather than re-encoding
--     them. The body's WHERE clause matches the RLS predicates explicitly so
--     the planner can use the partial index without relying on RLS-rewritten
--     predicates being pushed down.
--   - GRANT EXECUTE to anon (and authenticated, since the admin CRM runs
--     under that role on the same homepage).

-- Partial index supporting the featured ORDER BY. The existing
-- idx_mls_listings_winner_active is on (standard_status, city, list_price)
-- which doesn't help an ORDER BY days_on_market query.
CREATE INDEX IF NOT EXISTS idx_mls_listings_featured_dom
  ON mls_listings(days_on_market ASC NULLS LAST)
  WHERE is_winner = true
    AND mlg_can_view = true
    AND standard_status IN ('Active', 'Active Under Contract', 'Pending')
    AND property_type <> 'Residential Lease';

ANALYZE mls_listings;


CREATE OR REPLACE FUNCTION home_featured(limit_count int DEFAULT 6)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  -- Over-fetch by 4x so we can drop the rows without a usable primary photo
  -- without falling under the requested limit. In practice almost every
  -- active winner has at least one photo, but the priority-pass backfill
  -- means a brand-new listing may not yet, and we'd rather show stale-DOM
  -- listings than empty cards.
  WITH candidates AS (
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
      l.list_date,
      (
        SELECT
          CASE
            WHEN NULLIF(m.local_url, '') IS NOT NULL THEN m.local_url
            WHEN m.media_url NOT LIKE '%mlsgrid.com%' THEN m.media_url
            ELSE NULL
          END
        FROM mls_media m
        WHERE m.listing_key = l.listing_key
          AND m."order" IN (0, 1)
          AND (m.local_url <> '' OR m.media_url NOT LIKE '%mlsgrid.com%')
        ORDER BY m."order" ASC
        LIMIT 1
      ) AS primary_photo
    FROM mls_listings l
    WHERE l.is_winner = true
      AND l.mlg_can_view = true
      AND l.standard_status IN ('Active', 'Active Under Contract', 'Pending')
      AND l.property_type <> 'Residential Lease'
    ORDER BY l.days_on_market ASC NULLS LAST, l.modification_timestamp DESC
    LIMIT GREATEST(limit_count * 4, 24)
  ),
  with_photos AS (
    SELECT * FROM candidates
    WHERE primary_photo IS NOT NULL
    LIMIT limit_count
  ),
  -- Loser siblings so the card detail can still render the "Also listed on..."
  -- attribution block without the bulk siblings fetch.
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

GRANT EXECUTE ON FUNCTION home_featured(int) TO anon, authenticated;
