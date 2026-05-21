-- Found a second class of dedup miss while testing the first:
--
--   CSAR:    street_name = "Chin Tree Rd", street_suffix = ""
--   Canopy:  street_name = "Chin Tree",    street_suffix = "Road"
--
-- The previous fix (drop street_suffix from the key) didn't help here
-- because CSAR stuffs the suffix inside street_name. Same property,
-- different keys, still showing up twice.
--
-- Fix: after expansion, strip ANY trailing generic-suffix word from the
-- normalized street tokens, regardless of which field it came from. The
-- list is intentionally conservative — "ridge", "hollow", "creek",
-- "spring" stay because they appear inside legitimate street names.
--
-- Affects:
--   * mls_normalize_key() — SQL helper used by the backfill UPDATE below
--     and as a reference for the TS implementation.
--   * supabase/functions/_shared/dedup.ts — source of truth at sync time
--     (already updated in the same commit).
--
-- After UPDATE, force a winner recalc across every group.

CREATE OR REPLACE FUNCTION mls_normalize_key(street text, city text)
RETURNS text LANGUAGE plpgsql IMMUTABLE AS $$
DECLARE
  s_street text;
  s_city   text;
BEGIN
  -- Normalize street independently so we can strip trailing generic
  -- suffix words before the city tokens get appended.
  s_street := lower(coalesce(street, ''));
  s_street := regexp_replace(s_street, '[^a-z0-9 ]', '', 'g');
  s_street := regexp_replace(s_street, '\s+', ' ', 'g');
  s_street := trim(s_street);

  -- Expand abbreviations within the street tokens. Order matters — longer
  -- tokens first so 'blvd' isn't half-matched by a shorter rule.
  s_street := regexp_replace(s_street, '\mpkwy\M',  'parkway',   'g');
  s_street := regexp_replace(s_street, '\mblvd\M',  'boulevard', 'g');
  s_street := regexp_replace(s_street, '\mxing\M',  'crossing',  'g');
  s_street := regexp_replace(s_street, '\mholw\M',  'hollow',    'g');
  s_street := regexp_replace(s_street, '\mlndg\M',  'landing',   'g');
  s_street := regexp_replace(s_street, '\mmdws\M',  'meadows',   'g');
  s_street := regexp_replace(s_street, '\mpsge\M',  'passage',   'g');
  s_street := regexp_replace(s_street, '\mrnch\M',  'ranch',     'g');
  s_street := regexp_replace(s_street, '\mspgs\M',  'springs',   'g');
  s_street := regexp_replace(s_street, '\mfrks\M',  'forks',     'g');
  s_street := regexp_replace(s_street, '\mterr\M',  'terrace',   'g');
  s_street := regexp_replace(s_street, '\mhwy\M',   'highway',   'g');
  s_street := regexp_replace(s_street, '\mrdg\M',   'ridge',     'g');
  s_street := regexp_replace(s_street, '\mest\M',   'estates',   'g');
  s_street := regexp_replace(s_street, '\mgln\M',   'glen',      'g');
  s_street := regexp_replace(s_street, '\mgrv\M',   'grove',     'g');
  s_street := regexp_replace(s_street, '\mknl\M',   'knoll',     'g');
  s_street := regexp_replace(s_street, '\mmdw\M',   'meadow',    'g');
  s_street := regexp_replace(s_street, '\mmls\M',   'mills',     'g');
  s_street := regexp_replace(s_street, '\mmtn\M',   'mountain',  'g');
  s_street := regexp_replace(s_street, '\mspg\M',   'spring',    'g');
  s_street := regexp_replace(s_street, '\mvly\M',   'valley',    'g');
  s_street := regexp_replace(s_street, '\mvis\M',   'vista',     'g');
  s_street := regexp_replace(s_street, '\mbnd\M',   'bend',      'g');
  s_street := regexp_replace(s_street, '\mbrg\M',   'bridge',    'g');
  s_street := regexp_replace(s_street, '\mbrk\M',   'brook',     'g');
  s_street := regexp_replace(s_street, '\mcrk\M',   'creek',     'g');
  s_street := regexp_replace(s_street, '\mfrk\M',   'fork',      'g');
  s_street := regexp_replace(s_street, '\mhls\M',   'hills',     'g');
  s_street := regexp_replace(s_street, '\mter\M',   'terrace',   'g');
  s_street := regexp_replace(s_street, '\mave\M',   'avenue',    'g');
  s_street := regexp_replace(s_street, '\mrd\M',    'road',      'g');
  s_street := regexp_replace(s_street, '\mdr\M',    'drive',     'g');
  s_street := regexp_replace(s_street, '\mst\M',    'street',    'g');
  s_street := regexp_replace(s_street, '\mct\M',    'court',     'g');
  s_street := regexp_replace(s_street, '\mln\M',    'lane',      'g');
  s_street := regexp_replace(s_street, '\mcir\M',   'circle',    'g');
  s_street := regexp_replace(s_street, '\mpl\M',    'place',     'g');
  s_street := regexp_replace(s_street, '\mtrl\M',   'trail',     'g');
  s_street := regexp_replace(s_street, '\mpt\M',    'point',     'g');
  s_street := regexp_replace(s_street, '\mhl\M',    'hill',      'g');
  s_street := regexp_replace(s_street, '\mlk\M',    'lake',      'g');
  s_street := regexp_replace(s_street, '\mml\M',    'mill',      'g');
  s_street := regexp_replace(s_street, '\mmt\M',    'mount',     'g');
  s_street := regexp_replace(s_street, '\mvw\M',    'view',      'g');
  s_street := regexp_replace(s_street, '\mcv\M',    'cove',      'g');
  s_street := regexp_replace(s_street, '\mne\M',    'northeast', 'g');
  s_street := regexp_replace(s_street, '\mnw\M',    'northwest', 'g');
  s_street := regexp_replace(s_street, '\mse\M',    'southeast', 'g');
  s_street := regexp_replace(s_street, '\msw\M',    'southwest', 'g');
  s_street := regexp_replace(s_street, '\mn\M',     'north',     'g');
  s_street := regexp_replace(s_street, '\ms\M',     'south',     'g');
  s_street := regexp_replace(s_street, '\me\M',     'east',      'g');
  s_street := regexp_replace(s_street, '\mw\M',     'west',      'g');

  -- Strip trailing generic-suffix words from the street tokens. Loops so
  -- something like "Foo Drive Way" → "Foo" (multiple trailing suffixes).
  -- Conservative list — words that almost always indicate "street type"
  -- and never appear inside real street-name stems in WNC.
  LOOP
    DECLARE
      stripped text;
    BEGIN
      stripped := regexp_replace(
        s_street,
        '\s+(road|drive|street|avenue|boulevard|court|lane|circle|place|terrace|trail|parkway|highway|way|loop|alley|path|row|pike|plaza|square)$',
        '',
        ''
      );
      EXIT WHEN stripped = s_street;
      s_street := stripped;
    END;
  END LOOP;

  -- Normalize city (no abbreviation expansion, no trailing strip).
  s_city := lower(coalesce(city, ''));
  s_city := regexp_replace(s_city, '[^a-z0-9 ]', '', 'g');
  s_city := regexp_replace(s_city, '\s+', ' ', 'g');
  s_city := trim(s_city);

  -- Combine, strip all whitespace. Matches the TS join("") behavior.
  RETURN regexp_replace(s_street || ' ' || s_city, '\s+', '', 'g');
END;
$$;

-- Re-key every row that the new normalizer would compute differently from
-- its current address_group_key. The trigger recalcs winners on UPDATE.
UPDATE mls_listings
   SET address_group_key = mls_normalize_key(
     coalesce(street_number, '') || ' ' || coalesce(street_name, '') || ' ' || coalesce(street_suffix, ''),
     coalesce(city, '')
   )
 WHERE address_group_key IS DISTINCT FROM mls_normalize_key(
     coalesce(street_number, '') || ' ' || coalesce(street_name, '') || ' ' || coalesce(street_suffix, ''),
     coalesce(city, '')
   );

-- Force winner recalc across every group.
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
