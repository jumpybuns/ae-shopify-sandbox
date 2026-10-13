// scripts/importCatalog.mjs
//
// Imports every product listed in catalog/catalog.txt as a DRAFT Shopify
// product, checking each one against the brand of the section it's listed
// under and skipping anything already imported.
//
// Usage:
//   node scripts/importCatalog.mjs --dry-run            # check everything, write nothing
//   node scripts/importCatalog.mjs                      # import for real
//   node scripts/importCatalog.mjs --only Mooer         # one brand (repeatable)
//   node scripts/importCatalog.mjs --file path/to.txt   # a different catalog file
//   node scripts/importCatalog.mjs --force              # import despite brand mismatch
//   node scripts/importCatalog.mjs --delay 1500         # ms between products (default 750)
//
// Catalog file format (see catalog/catalog.txt):
//   [Brand Name]
//   https://www.aliexpress.com/item/1005000000000000.html
//   3256800000000000        # a bare product id works too
//   # lines starting with # are comments
//
// A summary is also written to catalog/last-run.json.

import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import { importAeProduct, extractAeId, normalizeBrand } from '../src/catalogImporter.js';

// --- args --------------------------------------------------------------
const argv = process.argv.slice(2);
const flags = { dryRun: false, force: false, only: [], file: 'catalog/catalog.txt', delay: 750 };
for (let i = 0; i < argv.length; i++) {
  const a = argv[i];
  if (a === '--dry-run') flags.dryRun = true;
  else if (a === '--force') flags.force = true;
  else if (a === '--only') flags.only.push(argv[++i]);
  else if (a === '--file') flags.file = argv[++i];
  else if (a === '--delay') flags.delay = parseInt(argv[++i], 10);
  else {
    console.error(`Unknown argument: ${a}`);
    process.exit(2);
  }
}
if (!Number.isFinite(flags.delay) || flags.delay < 0) {
  console.error('--delay needs a non-negative number of milliseconds');
  process.exit(2);
}

// --- parse the catalog file --------------------------------------------
function parseCatalog(filePath) {
  const text = fs.readFileSync(filePath, 'utf8');
  const sections = []; // { brand, entries: [{ raw, id, line }] }
  let current = null;

  text.split(/\r?\n/).forEach((rawLine, idx) => {
    const lineNo = idx + 1;
    const line = rawLine.replace(/\s+#.*$/, '').trim();
    if (!line || line.startsWith('#')) return;

    const header = line.match(/^\[(.+)\]$/);
    if (header) {
      current = { brand: header[1].trim(), entries: [] };
      sections.push(current);
      return;
    }
    if (!current) {
      throw new Error(`${filePath}:${lineNo}: "${line}" appears before any [Brand] header`);
    }
    const id = extractAeId(line);
    if (!id) {
      throw new Error(`${filePath}:${lineNo}: couldn't find a product id in "${line}"`);
    }
    current.entries.push({ raw: line, id, line: lineNo });
  });

  return sections;
}

let sections;
try {
  sections = parseCatalog(flags.file);
} catch (err) {
  console.error(err.message);
  process.exit(2);
}

if (flags.only.length) {
  const wanted = flags.only.map(normalizeBrand);
  sections = sections.filter((s) => wanted.includes(normalizeBrand(s.brand)));
  if (!sections.length) {
    console.error(`No catalog section matches: ${flags.only.join(', ')}`);
    process.exit(2);
  }
}

const total = sections.reduce((n, s) => n + s.entries.length, 0);
if (total === 0) {
  console.log('Nothing to import: no product ids under any [Brand] section yet.');
  console.log(`Add AliExpress product URLs or ids to ${flags.file} and run again.`);
  process.exit(0);
}

if (!flags.dryRun && !process.env.SHOPIFY_LOCATION_ID) {
  console.error('SHOPIFY_LOCATION_ID is not set in .env (run: node scripts/getLocationId.mjs). Use --dry-run to check without it.');
  process.exit(2);
}

// --- run ---------------------------------------------------------------
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const seen = new Set();
const results = [];
let n = 0;

const activeSections = sections.filter((s) => s.entries.length > 0);
console.log(`${flags.dryRun ? 'DRY RUN: ' : ''}${total} product(s) across ${activeSections.length} brand(s)\n`);

for (const section of activeSections) {
  console.log(`== ${section.brand} (${section.entries.length}) ==`);
  for (const entry of section.entries) {
    n += 1;
    const r = await importAeProduct(entry.id, {
      expectedBrand: section.brand,
      dryRun: flags.dryRun,
      force: flags.force,
      seen,
    });
    results.push({ brandSection: section.brand, line: entry.line, ...r });

    const tag = { created: 'CREATED ', 'dry-run': 'OK      ', skipped: 'SKIPPED ', failed: 'FAILED  ' }[r.status];
    const name = (r.title || '(no title)').slice(0, 70);
    console.log(`[${n}/${total}] ${tag} ${r.aeProductId || r.inputId}  ${name}`);
    console.log(`            ${r.reason}${r.shopifyId && r.status === 'created' ? ` -> ${r.shopifyId}` : ''}`);

    if (n < total) await sleep(flags.delay);
  }
  console.log('');
}

// --- summary -----------------------------------------------------------
const count = (s) => results.filter((r) => r.status === s).length;
console.log('Summary');
console.log(`  created:  ${count('created')}`);
console.log(`  dry-run OK: ${count('dry-run')}`);
console.log(`  skipped:  ${count('skipped')}`);
console.log(`  failed:   ${count('failed')}`);

const reportPath = path.join(path.dirname(flags.file), 'last-run.json');
fs.writeFileSync(reportPath, JSON.stringify({ ranAt: new Date().toISOString(), flags, results }, null, 2));
console.log(`\nFull details: ${reportPath}`);
if (!flags.dryRun && count('created')) {
  console.log('Review the new DRAFT products in Shopify admin (pricing, description, collection) before publishing.');
}

process.exit(count('failed') ? 1 : 0);
