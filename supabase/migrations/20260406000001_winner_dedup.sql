-- Server-side cross-MLS winner tracking.
--
-- Problem: the same physical property often has rows in both CSAR (Navica) and
-- Canopy (MLS Grid). Previously, both feeds downloaded all photos to R2 and
-- dedup happened client-side, wasting storage and bandwidth on photos that are
-- never shown. This migration introduces `is_winner` so only one row per
-- physical address controls the media we actually store.
--
-- Design:
--   1. `address_group_key` — normalized street+city, groups CSAR and Canopy rows
--      for the same property.
--   2. `quality_score` — computed by the sync functions on upsert; higher wins.
--   3. `media_count` — number of photos on the feed, feeds into quality_score
--      and is used as a tiebreak.
--   4. `is_winner` — exactly one row per group is the winner. Only winners get
--      R2 media storage. Client app.js queries winners only.
--   5. `mls_media_cleanup_queue` — when the winner flips (rare), the old
--      winner's listing_key is queued for R2 deletion after a 24h grace period
--      (protects against transient sync glitches).
--
-- The trigger recalculates the winner whenever any of
-- (address_group_key, quality_score, media_count, standard_status, mlg_can_view)
-- changes on a row. It does NOT watch is_winner itself, so the trigger is not
-- reentrant when the recalc function updates flags.


-- ── 1. Address normalization function ─────────────────────────────
-- Matches app.js `_normalizeAddress` + `_suffixMap` closely enough that two
-- rows for the same property get the same key. Not a perfect clone; the sync
-- functions compute the key in TS and set it on upsert, so this SQL function
-- is only used for the one-time backfill of existing rows and as a sanity
-- reference. Leave IMMUTABLE so it can be called from generated contexts.

CREATE OR REPLACE FUNCTION mls_normalize_key(street text, city text)
RETURNS text LANGUAGE plpgsql IMMUTABLE AS $$
DECLARE
  s text;
BEGIN
  s := lower(coalesce(street, '') || ' ' || coalesce(city, ''));
  -- Strip anything that isn't a letter, digit, or space.
  s := regexp_replace(s, '[^a-z0-9 ]', '', 'g');
  -- Collapse whitespace.
  s := regexp_replace(s, '\s+', ' ', 'g');
  s := trim(s);

  -- Word-boundary suffix expansions. Order matters: longer tokens first so
  -- 'blvd' is not half-matched by a shorter rule.
  s := regexp_replace(s, '\mpkwy\M',  'parkway',   'g');
  s := regexp_replace(s, '\mblvd\M',  'boulevard', 'g');
  s := regexp_replace(s, '\mxing\M',  'crossing',  'g');
  s := regexp_replace(s, '\mholw\M',  'hollow',    'g');
  s := regexp_replace(s, '\mlndg\M',  'landing',   'g');
  s := regexp_replace(s, '\mmdws\M',  'meadows',   'g');
  s := regexp_replace(s, '\mpsge\M',  'passage',   'g');
  s := regexp_replace(s, '\mrnch\M',  'ranch',     'g');
  s := regexp_replace(s, '\mspgs\M',  'springs',   'g');
  s := regexp_replace(s, '\mfrks\M',  'forks',     'g');
  s := regexp_replace(s, '\mterr\M',  'terrace',   'g');
  s := regexp_replace(s, '\mhwy\M',   'highway',   'g');
  s := regexp_replace(s, '\mrdg\M',   'ridge',     'g');
  s := regexp_replace(s, '\mest\M',   'estates',   'g');
  s := regexp_replace(s, '\mgln\M',   'glen',      'g');
  s := regexp_replace(s, '\mgrv\M',   'grove',     'g');
  s := regexp_replace(s, '\mknl\M',   'knoll',     'g');
  s := regexp_replace(s, '\mmdw\M',   'meadow',    'g');
  s := regexp_replace(s, '\mmls\M',   'mills',     'g');
  s := regexp_replace(s, '\mmtn\M',   'mountain',  'g');
  s := regexp_replace(s, '\mspg\M',   'spring',    'g');
  s := regexp_replace(s, '\mvly\M',   'valley',    'g');
  s := regexp_replace(s, '\mvis\M',   'vista',     'g');
  s := regexp_replace(s, '\mbnd\M',   'bend',      'g');
  s := regexp_replace(s, '\mbrg\M',   'bridge',    'g');
  s := regexp_replace(s, '\mbrk\M',   'brook',     'g');
  s := regexp_replace(s, '\mcrk\M',   'creek',     'g');
  s := regexp_replace(s, '\mfrk\M',   'fork',      'g');
  s := regexp_replace(s, '\mhls\M',   'hills',     'g');
  s := regexp_replace(s, '\mter\M',   'terrace',   'g');
  s := regexp_replace(s, '\mave\M',   'avenue',    'g');
  s := regexp_replace(s, '\mrd\M',    'road',      'g');
  s := regexp_replace(s, '\mdr\M',    'drive',     'g');
  s := regexp_replace(s, '\mst\M',    'street',    'g');
  s := regexp_replace(s, '\mct\M',    'court',     'g');
  s := regexp_replace(s, '\mln\M',    'lane',      'g');
  s := regexp_replace(s, '\mcir\M',   'circle',    'g');
  s := regexp_replace(s, '\mpl\M',    'place',     'g');
  s := regexp_replace(s, '\mtrl\M',   'trail',     'g');
  s := regexp_replace(s, '\mpt\M',    'point',     'g');
  s := regexp_replace(s, '\mhl\M',    'hill',      'g');
  s := regexp_replace(s, '\mlk\M',    'lake',      'g');
  s := regexp_replace(s, '\mml\M',    'mill',      'g');
  s := regexp_replace(s, '\mmt\M',    'mount',     'g');
  s := regexp_replace(s, '\mvw\M',    'view',      'g');
  s := regexp_replace(s, '\mcv\M',    'cove',      'g');
  s := regexp_replace(s, '\mne\M',    'northeast', 'g');
  s := regexp_replace(s, '\mnw\M',    'northwest', 'g');
  s := regexp_replace(s, '\mse\M',    'southeast', 'g');
  s := regexp_replace(s, '\msw\M',    'southwest', 'g');
  s := regexp_replace(s, '\mn\M',     'north',     'g');
  s := regexp_replace(s, '\ms\M',     'south',     'g');
  s := regexp_replace(s, '\me\M',     'east',      'g');
  s := regexp_replace(s, '\mw\M',     'west',      'g');

  -- Final: strip all whitespace. The JS version does the same by joining words
  -- with an empty string. This guarantees "123 main st" and "123  Main St"
  -- produce identical keys.
  s := regexp_replace(s, '\s+', '', 'g');
  RETURN s;
END;
$$;


-- ── 2. Columns ────────────────────────────────────────────────────

ALTER TABLE mls_listings
  ADD COLUMN IF NOT EXISTS address_group_key text,
  ADD COLUMN IF NOT EXISTS quality_score     int     NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS media_count       int     NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS is_winner         boolean NOT NULL DEFAULT true;

-- Index for fast group lookups (sync recalc + client mlsSources fetch).
CREATE INDEX IF NOT EXISTS idx_mls_listings_group_key
  ON mls_listings(address_group_key)
  WHERE address_group_key IS NOT NULL;

-- Partial index the site uses for every listings query.
CREATE INDEX IF NOT EXISTS idx_mls_listings_winner_active
  ON mls_listings(standard_status, city, list_price)
  WHERE is_winner = true AND mlg_can_view = true;


-- ── 3. Media cleanup queue ────────────────────────────────────────

CREATE TABLE IF NOT EXISTS mls_media_cleanup_queue (
  listing_key text        PRIMARY KEY REFERENCES mls_listings(listing_key) ON DELETE CASCADE,
  listing_id  text        NOT NULL,
  reason      text        NOT NULL CHECK (reason IN ('lost_winner', 'deleted')),
  queued_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_mls_cleanup_due
  ON mls_media_cleanup_queue(queued_at);

ALTER TABLE mls_media_cleanup_queue ENABLE ROW LEVEL SECURITY;
-- No public policies — service role only.


-- ── 4. Winner recalculation function ──────────────────────────────
-- Picks the best row for an address group and flips is_winner flags.
-- Queues the previous winner for R2 cleanup if the winner changes.
-- Safe to call repeatedly; idempotent when nothing changes.

CREATE OR REPLACE FUNCTION mls_recalc_winner(grp text)
RETURNS void LANGUAGE plpgsql AS $$
DECLARE
  new_winner_key text;
  old_winner_key text;
  old_listing_id text;
BEGIN
  IF grp IS NULL OR grp = '' THEN
    RETURN;
  END IF;

  -- Current winner (if any)
  SELECT listing_key
    INTO old_winner_key
    FROM mls_listings
   WHERE address_group_key = grp
     AND is_winner = true
   LIMIT 1;

  -- Pick best active-ish listing. Tiebreak by media_count, then freshness, then
  -- key for determinism.
  SELECT listing_key
    INTO new_winner_key
    FROM mls_listings
   WHERE address_group_key = grp
     AND mlg_can_view = true
     AND standard_status IN ('Active', 'Pending', 'Active Under Contract')
   ORDER BY quality_score DESC,
            media_count DESC,
            modification_timestamp DESC NULLS LAST,
            listing_key ASC
   LIMIT 1;

  -- No active listing — fall back to the best of any status, so the group
  -- still has a "primary" row the UI can attribute to. This keeps mlsSources
  -- data consistent even when a listing goes Closed/Expired.
  IF new_winner_key IS NULL THEN
    SELECT listing_key
      INTO new_winner_key
      FROM mls_listings
     WHERE address_group_key = grp
     ORDER BY quality_score DESC,
              media_count DESC,
              modification_timestamp DESC NULLS LAST,
              listing_key ASC
     LIMIT 1;
  END IF;

  -- Empty group — nothing to do.
  IF new_winner_key IS NULL THEN
    RETURN;
  END IF;

  -- No change — nothing to do.
  IF old_winner_key IS NOT DISTINCT FROM new_winner_key THEN
    RETURN;
  END IF;

  -- Flip flags. Only winners in this group will have is_winner = true.
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
     WHERE listing_key = old_winner_key;

    IF old_listing_id IS NOT NULL THEN
      INSERT INTO mls_media_cleanup_queue (listing_key, listing_id, reason, queued_at)
      VALUES (old_winner_key, old_listing_id, 'lost_winner', now())
      ON CONFLICT (listing_key) DO UPDATE
        SET reason    = 'lost_winner',
            queued_at = now();
    END IF;
  END IF;
END;
$$;


-- ── 5. Trigger ────────────────────────────────────────────────────
-- Fires only when fields that can affect winner selection change.
-- Does NOT watch is_winner, so mls_recalc_winner's flag updates do not
-- retrigger. Also handles row moving between groups (edit to street/city).

CREATE OR REPLACE FUNCTION mls_listings_winner_trigger()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    PERFORM mls_recalc_winner(NEW.address_group_key);
  ELSIF TG_OP = 'UPDATE' THEN
    PERFORM mls_recalc_winner(NEW.address_group_key);
    IF OLD.address_group_key IS DISTINCT FROM NEW.address_group_key THEN
      PERFORM mls_recalc_winner(OLD.address_group_key);
    END IF;
  END IF;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS mls_listings_winner_recalc ON mls_listings;
CREATE TRIGGER mls_listings_winner_recalc
AFTER INSERT OR UPDATE OF
  address_group_key, quality_score, media_count, standard_status, mlg_can_view
ON mls_listings
FOR EACH ROW
EXECUTE FUNCTION mls_listings_winner_trigger();


-- ── 6. Backfill existing rows ─────────────────────────────────────
-- Seed address_group_key + quality_score + media_count for all current rows,
-- then run the recalc once per group so is_winner flags are correct before
-- the sync functions start writing new data.

-- Seed group key using the SQL normalizer.
UPDATE mls_listings
   SET address_group_key = mls_normalize_key(
     coalesce(street_number, '') || ' ' ||
     coalesce(street_name, '')   || ' ' ||
     coalesce(street_suffix, ''),
     coalesce(city, '')
   )
 WHERE address_group_key IS NULL;

-- Seed media_count from mls_media.
UPDATE mls_listings l
   SET media_count = sub.cnt
  FROM (
    SELECT listing_key, count(*)::int AS cnt
      FROM mls_media
     GROUP BY listing_key
  ) sub
 WHERE l.listing_key = sub.listing_key;

-- Seed quality score. Mirrors app.js _qualityScore:
--   +100 media present, +10 sqft, +15 lat/lng, +20/10/3 description,
--   +5 year_built, +5 lot.
UPDATE mls_listings
   SET quality_score =
     (CASE WHEN media_count > 0 THEN 100 ELSE 0 END) +
     (CASE WHEN living_area IS NOT NULL AND living_area > 0 THEN 10 ELSE 0 END) +
     (CASE WHEN latitude IS NOT NULL AND longitude IS NOT NULL THEN 15 ELSE 0 END) +
     (CASE
        WHEN length(coalesce(public_remarks, '')) > 200 THEN 20
        WHEN length(coalesce(public_remarks, '')) > 50  THEN 10
        WHEN length(coalesce(public_remarks, '')) > 0   THEN 3
        ELSE 0
      END) +
     (CASE WHEN year_built IS NOT NULL THEN 5 ELSE 0 END) +
     (CASE WHEN lot_size_acres IS NOT NULL AND lot_size_acres > 0 THEN 5 ELSE 0 END);

-- Reset is_winner to false for everyone, then recalc per group so exactly
-- one row per group is marked winner.
UPDATE mls_listings SET is_winner = false WHERE is_winner = true;

DO $$
DECLARE
  grp text;
BEGIN
  FOR grp IN
    SELECT DISTINCT address_group_key
      FROM mls_listings
     WHERE address_group_key IS NOT NULL
       AND address_group_key <> ''
  LOOP
    PERFORM mls_recalc_winner(grp);
  END LOOP;
END;
$$;
