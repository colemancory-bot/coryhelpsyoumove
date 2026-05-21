// Shared helpers for server-side cross-MLS dedup.
//
// These helpers must stay in sync with:
//   - `mls_normalize_key` in migrations/20260406000001_winner_dedup.sql
//   - `_normalizeAddress`, `_suffixMap`, `_qualityScore` in app.js
//
// The TS versions are the source of truth at sync time. Rows written by the
// edge functions carry the TS-computed address_group_key, quality_score,
// and media_count; the SQL equivalents exist only for the one-time backfill
// of existing rows and manual SQL work.

const SUFFIX_MAP: Record<string, string> = {
  rd: "road", dr: "drive", st: "street", ave: "avenue", blvd: "boulevard",
  ct: "court", ln: "lane", cir: "circle", pl: "place", trl: "trail",
  pkwy: "parkway", hwy: "highway", rdg: "ridge", xing: "crossing",
  ter: "terrace", terr: "terrace", pt: "point", crk: "creek", hl: "hill",
  hls: "hills", holw: "hollow", lk: "lake", brg: "bridge", brk: "brook",
  est: "estates", gln: "glen", grv: "grove", knl: "knoll", lndg: "landing",
  mdw: "meadow", mdws: "meadows", ml: "mill", mls: "mills", mt: "mount",
  mtn: "mountain", psge: "passage", rnch: "ranch", spg: "spring",
  spgs: "springs", vly: "valley", vw: "view", vis: "vista", run: "run",
  frk: "fork", frks: "forks", pass: "pass", cv: "cove", bnd: "bend",
  n: "north", s: "south", e: "east", w: "west",
  ne: "northeast", nw: "northwest", se: "southeast", sw: "southwest",
};

// Generic street-type suffix words to strip from the END of the cleaned token
// list. MLS feeds disagree on where the suffix lives — some put "Rd" inside
// street_name, others fill street_suffix="Road" and leave street_name as the
// stem. After we've concatenated everything and expanded abbreviations,
// dropping a trailing generic suffix lets both shapes collapse onto the same
// key. The list is intentionally conservative: words like "ridge", "hollow",
// "creek", "spring" are NOT included because they appear inside street names
// (e.g. "Old Mill Creek Road" must NOT become "Old Mill Sylva").
const STRIPPABLE_TRAILING_SUFFIXES = new Set([
  "road", "drive", "street", "avenue", "boulevard", "court", "lane",
  "circle", "place", "terrace", "trail", "parkway", "highway", "way",
  "loop", "alley", "path", "row", "pike", "plaza", "square",
]);

/**
 * Produce the address_group_key for an mls_listings row. Rows for the same
 * physical property across feeds should hash to the same key.
 *
 * Strategy: lowercase, strip punctuation, expand suffix abbreviations
 * (st → street, etc.), concat with city, strip whitespace. Mirrors the SQL
 * `mls_normalize_key` function.
 *
 * NOTE: street_suffix is intentionally NOT included in the key. Different
 * MLSes spell the suffix differently for the same property — CSAR may write
 * "1124 Skyland" with an empty suffix while Canopy carries "1124 Skyland
 * Drive". Excluding the suffix collapses those onto one group. The rare
 * case where two physical streets share a number + root name + town is a
 * tolerable false-positive vs. the routine false-negative we'd have
 * otherwise.
 */
export function computeAddressGroupKey(
  streetNumber: string,
  streetName: string,
  streetSuffix: string,
  city: string,
): string {
  // Pull in EVERY street field — some feeds stash the suffix inside
  // street_name, some put it in street_suffix. After we expand abbreviations
  // we strip trailing generic suffix words from whichever bucket they ended
  // up in.
  const street = [streetNumber, streetName, streetSuffix].filter(Boolean).join(" ");
  const cityStr = (city || "").toLowerCase();
  const streetLower = street.toLowerCase();
  const streetCleaned = streetLower.replace(/[^a-z0-9\s]/g, "").replace(/\s+/g, " ").trim();
  if (!streetCleaned) {
    // No street info at all — fall back to just the city to keep the key non-empty.
    return cityStr.replace(/[^a-z0-9]/g, "");
  }
  // Expand "rd"→"road", "dr"→"drive", etc. against the street tokens only,
  // then drop trailing generic-suffix words. City tokens are handled separately
  // so we don't accidentally strip "Drive" out of a town named "Drive Springs".
  const streetTokens = streetCleaned.split(" ").map((w) => SUFFIX_MAP[w] || w);
  while (
    streetTokens.length > 1 &&
    STRIPPABLE_TRAILING_SUFFIXES.has(streetTokens[streetTokens.length - 1])
  ) {
    streetTokens.pop();
  }
  const cityCleaned = cityStr.replace(/[^a-z0-9\s]/g, "").replace(/\s+/g, " ").trim();
  return [...streetTokens, ...cityCleaned.split(" ").filter(Boolean)].join("");
}

/**
 * Data-quality score used to pick the winner when two MLSes carry the same
 * listing. Mirrors `_qualityScore` in app.js and the backfill UPDATE in the
 * winner_dedup migration.
 *
 * Higher = better. Photo presence (100) dominates everything else combined,
 * so the sibling with photos will always beat one without.
 */
export function computeQualityScore(args: {
  mediaCount: number;
  livingArea: number | null;
  latitude: number | null;
  longitude: number | null;
  publicRemarks: string;
  yearBuilt: number | null;
  lotSizeAcres: number | null;
}): number {
  let score = 0;
  if (args.mediaCount > 0) score += 100;
  if (args.livingArea && args.livingArea > 0) score += 10;
  if (args.latitude != null && args.longitude != null) score += 15;
  const descLen = (args.publicRemarks || "").length;
  if (descLen > 200) score += 20;
  else if (descLen > 50) score += 10;
  else if (descLen > 0) score += 3;
  if (args.yearBuilt) score += 5;
  if (args.lotSizeAcres && args.lotSizeAcres > 0) score += 5;
  return score;
}
