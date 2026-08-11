#!/usr/bin/env node
/**
 * Orphan page checker.
 *
 * Why this exists: in August 2026 we found 14 pages sitting in Google Search
 * Console as "Discovered - currently not indexed" with Last crawled = N/A,
 * four months after they went live. Every one of them was in sitemap.xml and
 * every one of them was fine technically. The URL Inspection report gave it
 * away:
 *
 *     Discovery
 *       Sitemaps        https://coryhelpsyoumove.com/sitemap.xml
 *       Referring page  https://coryhelpsyoumove.com/sitemap.xml
 *
 * Referring page = the sitemap, which means nothing on the site linked to them.
 * The ten keyword landing pages only linked to each other, so Googlebot had no
 * path in from an indexed page and never spent crawl budget on them. A sitemap
 * entry alone is a weak hint on a low-authority domain.
 *
 * So: any page we publish needs inbound links from other pages, not just a
 * sitemap row. This script builds the internal link graph and fails if a page
 * listed in sitemap.xml has fewer than MIN_INBOUND distinct pages linking to it.
 *
 * Usage:
 *   node scripts/check-orphan-pages.js            # check, exit 1 on failure
 *   node scripts/check-orphan-pages.js --list     # also print the full graph
 */

const fs = require('fs');
const path = require('path');

const ROOT = process.cwd();
const MIN_INBOUND = 2;
const SITE = 'https://coryhelpsyoumove.com';

// Directories we never treat as site content.
const SKIP_DIRS = new Set([
  '.git', '.claude', '.planning', 'node_modules', 'supabase', 'docs', 'scripts'
]);

// Pages that are intentionally not linked from the site body (utility, admin,
// dev, or one-off pages). These are exempt from the inbound-link requirement
// but should still be kept out of sitemap.xml where they don't belong.
const EXEMPT = new Set([
  'index.html',      // the homepage is the root of the graph
  '404.html',
  'admin.html',
  'doc.html',
  'gbp-launcher.html',
  'review.html',
  'cma-report-35-coweeta.html'
]);

function walk(dir, out) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (SKIP_DIRS.has(entry.name)) continue;
      walk(path.join(dir, entry.name), out);
    } else if (entry.isFile() && entry.name.endsWith('.html')) {
      out.push(path.join(dir, entry.name));
    }
  }
  return out;
}

/** Absolute fs path -> repo-relative posix path ("towns/sylva.html"). */
function toRepoPath(abs) {
  return path.relative(ROOT, abs).split(path.sep).join('/');
}

/**
 * Resolve an href found in `fromRepoPath` to a repo-relative page path,
 * or null if it isn't an internal HTML page link.
 */
function resolveHref(href, fromRepoPath) {
  let h = href.trim();
  if (!h) return null;
  if (/^(https?:)?\/\//i.test(h)) {
    // Absolute URL: only keep our own domain.
    if (h.indexOf(SITE) !== 0) return null;
    h = h.slice(SITE.length) || '/';
  }
  if (/^(mailto:|tel:|javascript:|data:|#)/i.test(h)) return null;

  h = h.split('#')[0].split('?')[0];
  if (!h) return null;

  let resolved;
  if (h.startsWith('/')) {
    resolved = h.slice(1);
  } else {
    const fromDir = path.posix.dirname(fromRepoPath);
    resolved = path.posix.normalize(path.posix.join(fromDir === '.' ? '' : fromDir, h));
  }

  if (resolved === '' || resolved.endsWith('/')) resolved += 'index.html';
  if (!resolved.endsWith('.html')) return null;
  if (resolved.startsWith('..')) return null;
  return resolved;
}

/** sitemap <loc> -> repo-relative page path. */
function locToRepoPath(loc) {
  let p = loc.trim();
  if (p.indexOf(SITE) === 0) p = p.slice(SITE.length);
  p = p.split('#')[0].split('?')[0];
  if (p.startsWith('/')) p = p.slice(1);
  if (p === '' || p.endsWith('/')) p += 'index.html';
  return p;
}

// ── Build the link graph ────────────────────────────────────────────────────
const files = walk(ROOT, []).map(toRepoPath);
const fileSet = new Set(files);

/** target page -> Set of pages linking to it */
const inbound = new Map();
files.forEach((f) => inbound.set(f, new Set()));

const HREF_RE = /href\s*=\s*["']([^"']+)["']/gi;

for (const file of files) {
  const html = fs.readFileSync(path.join(ROOT, file), 'utf-8');
  let m;
  HREF_RE.lastIndex = 0;
  while ((m = HREF_RE.exec(html)) !== null) {
    const target = resolveHref(m[1], file);
    if (!target || target === file) continue;
    if (!inbound.has(target)) inbound.set(target, new Set());
    inbound.get(target).add(file);
  }
}

// ── Check every sitemap URL ─────────────────────────────────────────────────
const sitemapPath = path.join(ROOT, 'sitemap.xml');
if (!fs.existsSync(sitemapPath)) {
  console.error('sitemap.xml not found at repo root. Run from the repo root.');
  process.exit(2);
}
const sitemap = fs.readFileSync(sitemapPath, 'utf-8');
const locs = [...sitemap.matchAll(/<loc>\s*([^<]+?)\s*<\/loc>/gi)].map((m) => m[1]);

const orphans = [];
const thin = [];
const missing = [];

for (const loc of locs) {
  const page = locToRepoPath(loc);
  if (EXEMPT.has(page)) continue;
  if (!fileSet.has(page)) { missing.push({ loc, page }); continue; }
  const count = inbound.has(page) ? inbound.get(page).size : 0;
  if (count === 0) orphans.push({ page, count, from: [] });
  else if (count < MIN_INBOUND) thin.push({ page, count, from: [...inbound.get(page)] });
}

if (process.argv.includes('--list')) {
  console.log('Inbound link counts for every sitemap page:\n');
  for (const loc of locs) {
    const page = locToRepoPath(loc);
    const count = inbound.has(page) ? inbound.get(page).size : 0;
    console.log(String(count).padStart(3) + '  ' + page + (EXEMPT.has(page) ? '  (exempt)' : ''));
  }
  console.log('');
}

let failed = false;

if (missing.length) {
  console.error('SITEMAP POINTS AT FILES THAT DO NOT EXIST (' + missing.length + '):');
  missing.forEach((m) => console.error('  ' + m.loc));
  console.error('');
  failed = true;
}

if (orphans.length) {
  console.error('ORPHANED (0 inbound internal links, Google will likely never crawl these):');
  orphans.forEach((o) => console.error('  ' + o.page));
  console.error('');
  failed = true;
}

if (thin.length) {
  console.error('THINLY LINKED (fewer than ' + MIN_INBOUND + ' inbound links):');
  thin.forEach((t) => console.error('  ' + t.page + '  <- ' + t.from.join(', ')));
  console.error('');
  failed = true;
}

if (failed) {
  console.error('FAIL. Every published page needs at least ' + MIN_INBOUND + ' inbound links from');
  console.error('other pages on the site. A sitemap entry is not a discovery path.');
  console.error('Add contextual links from the relevant town pages, the homepage');
  console.error('"Popular Searches" block, or related blog posts, then re-run.');
  process.exit(1);
}

console.log('OK. All ' + locs.length + ' sitemap pages have at least ' + MIN_INBOUND + ' inbound internal links.');
