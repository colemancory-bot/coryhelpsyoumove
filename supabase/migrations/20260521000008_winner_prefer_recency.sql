-- Tiebreak change in mls_recalc_winner: prefer recency over media_count once
-- quality_score is equal.
--
-- Context: 1124 Skyland was double-listed in CSAR ($239 k, 32 photos) and
-- Canopy ($229 k, 31 photos). Both rows had quality_score = 155 (any-photos
-- bonus dominates). The old rule then broke the tie on media_count, electing
-- the CSAR row. But that meant a one-photo difference picked the staler
-- price. For real-estate data the fresher row is almost always the right
-- price — the agent updated one feed more recently than the other.
--
-- New order:
--   1. quality_score DESC        (rows with photos beat rows without)
--   2. modification_timestamp     (more recent = trusted, esp. for price)
--   3. media_count DESC          (tiebreak when both feeds are equally fresh)
--   4. listing_key ASC           (determinism)
--
-- The migration also forces a winner recalc across every group so any group
-- whose ordering flips re-elects today instead of waiting for an upsert.

CREATE OR REPLACE FUNCTION mls_recalc_winner(grp text)
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
  new_winner_key text;
  old_winner_key text;
  old_listing_id text;
BEGIN
  IF grp IS NULL OR grp = '' THEN
    RETURN;
  END IF;

  SELECT listing_key
    INTO old_winner_key
    FROM mls_listings
   WHERE address_group_key = grp
     AND is_winner = true
   LIMIT 1;

  SELECT listing_key
    INTO new_winner_key
    FROM mls_listings
   WHERE address_group_key = grp
     AND mlg_can_view = true
     AND standard_status IN ('Active', 'Pending', 'Active Under Contract')
   ORDER BY quality_score DESC,
            modification_timestamp DESC NULLS LAST,
            media_count DESC,
            listing_key ASC
   LIMIT 1;

  IF new_winner_key IS NULL THEN
    SELECT listing_key
      INTO new_winner_key
      FROM mls_listings
     WHERE address_group_key = grp
     ORDER BY quality_score DESC,
              modification_timestamp DESC NULLS LAST,
              media_count DESC,
              listing_key ASC
     LIMIT 1;
  END IF;

  IF new_winner_key IS NULL THEN
    RETURN;
  END IF;

  IF old_winner_key IS NOT DISTINCT FROM new_winner_key THEN
    RETURN;
  END IF;

  UPDATE mls_listings
     SET is_winner = false
   WHERE address_group_key = grp
     AND is_winner = true
     AND listing_key <> new_winner_key;

  UPDATE mls_listings
     SET is_winner = true
   WHERE listing_key = new_winner_key
     AND is_winner = false;

  -- Queue old winner for R2 cleanup with 24h grace. If it's re-elected winner
  -- before the grace expires, the cleanup worker will skip it.
  IF old_winner_key IS NOT NULL THEN
    SELECT listing_id INTO old_listing_id
      FROM mls_listings
     WHERE listing_key = old_winner_key
     LIMIT 1;
    INSERT INTO mls_media_cleanup_queue (listing_key, listing_id, reason, queued_at)
    VALUES (old_winner_key, old_listing_id, 'lost_winner', now())
    ON CONFLICT (listing_key) DO UPDATE
      SET queued_at = excluded.queued_at,
          reason    = excluded.reason;
  END IF;
END;
$$;

-- Force recalc across every group with the new ordering.
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
