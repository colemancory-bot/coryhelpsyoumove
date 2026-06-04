// Verifies the CMA construction + condition adjustment math against the
// 571 One Feather Rd (log home) comps. Mirrors crm.js logic — keep in sync.
// Run: node scripts/verify-cma-adjustments.mjs
const PRICE_PER_SQFT = 175;
const CONSTRUCTION_PCT = { site_built: 0, manufactured: -0.25, modular: -0.10, log: 0.05, mobile_home: -0.35, unknown: 0 };
const CONDITION_PER_POINT = 20000;

// Structure-based construction adjustment (Task 1)
function constructionAdj(subCT, compCT, compSqft) {
  if (subCT === compCT || !compSqft) return 0;
  const structureVal = compSqft * PRICE_PER_SQFT;
  return Math.round(structureVal * ((CONSTRUCTION_PCT[subCT] || 0) - (CONSTRUCTION_PCT[compCT] || 0)));
}
// Condition adjustment (Task 2): compCond 0 = unrated -> no adjustment
function conditionAdj(subCond, compCond) {
  if (!compCond) return 0;
  return (subCond - compCond) * CONDITION_PER_POINT;
}

const comps = [
  { name: 'Bettys Creek',  price: 360000, sqft: 1152 },
  { name: 'Ivy Ridge',     price: 390000, sqft: 1344 },
  { name: 'Choice Place',  price: 305000, sqft: 1080 },
];
const expectedConstruction = [10080, 11760, 9450]; // log subject vs site-built comp, 5% of sqft*175

let failures = 0;
function check(label, actual, expected) {
  const ok = actual === expected;
  if (!ok) failures++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}: got ${actual}, expected ${expected}`);
}

comps.forEach((c, i) => {
  check(`construction[${c.name}]`, constructionAdj('log', 'site_built', c.sqft), expectedConstruction[i]);
});
check('construction log-to-log = 0', constructionAdj('log', 'log', 1200), 0);
check('condition unrated (0) = 0', conditionAdj(5, 0), 0);
check('condition rated 4 vs 5 = 20000', conditionAdj(5, 4), 20000);

// Informational: resulting valuation (legit adjustments from the report grid + new construction, condition removed)
const legit = [18625, -27475, 26780]; // living+lot+year(+garage,+time) per comp, condition excluded
const adjusted = comps.map((c, i) => c.price + legit[i] + expectedConstruction[i]);
console.log('\nAdjusted comp prices:', adjusted.map(p => '$' + p.toLocaleString()).join(', '));
const avg = Math.round(adjusted.reduce((s, p) => s + p, 0) / adjusted.length);
console.log('Simple-average value: $' + avg.toLocaleString(), '(was $431,488)');

console.log(`\n${failures === 0 ? 'ALL CHECKS PASSED' : failures + ' CHECK(S) FAILED'}`);
process.exit(failures === 0 ? 0 : 1);
