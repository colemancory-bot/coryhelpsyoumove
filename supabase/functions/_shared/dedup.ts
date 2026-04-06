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

/**
 * Produce the address_group_key for an mls_listings row. Rows for the same
 * physical property across feeds should hash to the same key.
 *
 * Strategy: lowercase, strip punctuation, expand suffix abbreviations
 * (st → street, etc.), concat with city, strip whitespace. Mirrors the SQL
 * `mls_normalize_key` function.
 */
export function computeAddressGroupKey(
  streetNumber: string,
  streetName: string,
  streetSuffix: string,
  city: string,
): string {
  const street = [streetNumber, streetName, streetSuffix].filter(Boolean).join(" ");
  const combined = (street + " " + (city || "")).toLowerCase();
  const cleaned = combined.replace(/[^a-z0-9\s]/g, "").replace(/\s+/g, " ").trim();
  if (!cleaned) return "";
  const expanded = cleaned.split(" ").map((word) => SUFFIX_MAP[word] || word).join("");
  return expanded;
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
