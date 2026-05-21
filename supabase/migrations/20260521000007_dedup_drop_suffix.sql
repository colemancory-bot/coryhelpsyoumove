-- Cross-MLS dedup was missing pairs where the two MLSes recorded the same
-- property with different street_suffix values. Example seen in production:
--   CSAR        → "1124 Skyland",         suffix=""
--   Canopy MLS  → "1124 Skyland Drive",   suffix="Drive"
-- Same agent, same beds/baths/sqft, same town — but two distinct
-- address_group_keys (1124skylandsylva vs 1124skylanddrivesylva) so both
-- rows stayed is_winner=true and the search results showed the listing
-- twice.
--
-- Fix: drop street_suffix from the key computation so suffix mismatches
-- collapse onto the same group. The matching change in
-- supabase/functions/_shared/dedup.ts keeps future syncs consistent.
--
-- After updating address_group_key, the existing trigger
-- mls_listings_winner_recalc fires per affected group and re-elects a
-- winner using the existing quality_score / media_count ranking.

UPDATE mls_listings
   SET address_group_key = mls_normalize_key(
     coalesce(street_number, '') || ' ' || coalesce(street_name, ''),
     coalesce(city, '')
   )
 WHERE address_group_key IS NOT NULL
   AND address_group_key <> mls_normalize_key(
     coalesce(street_number, '') || ' ' || coalesce(street_name, ''),
     coalesce(city, '')
   );

-- The trigger handles the winner recalc for groups whose keys changed, but
-- we also need to handle the case where a row's key DIDN'T change but a
-- sibling row's key merged into its group. Force a recalc over every
-- distinct group to be safe.
DO $$
DECLARE
  grp text;
BEGIN
  FOR grp IN
    SELECT DISTINCT address_group_key
      FROM mls_listings
     WHERE address_group_key IS NOT NULL
  LOOP
    PERFORM mls_recalc_winner(grp);
  END LOOP;
END $$;
