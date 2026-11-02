// scripts/syncProducts.mjs
//
// Reconciles product fields in Shopify with the catalog, under the per-field
// policies in src/fieldDefs.js. One tool instead of one script per field.
// Replaces the one-off scripts setVendors.mjs, setTags.mjs and fixTitles.mjs.
//
// Usage:
//   node scripts/syncProducts.mjs                       # preview, writes nothing
//   node scripts/syncProducts.mjs --apply               # write the changes
//   node scripts/syncProducts.mjs --fields vendor,tags  # only these (vendor, tags, title)
//   node scripts/syncProducts.mjs --only Mooer          # one catalog brand
//   node scripts/syncProducts.mjs --product <id|url|gid> --fields vendor   # one field, one product
//   node scripts/syncProducts.mjs --adopt --apply       # also record current values as the
//                                                       # baseline, so later hand edits are detected
//   node scripts/syncProducts.mjs --overwrite --apply   # replace values even when there is no
//                                                       # baseline and they look hand-set
//   --file catalog/catalog.txt   --tags-file catalog/tags.txt
//
// Safe to re-run: a second run with nothing new changes nothing. A product
// that fails is reported and skipped; the rest continue. Exit code 1 if any failed.

import 'dotenv/config';
import fs from 'node:fs';
import { parseCatalog, brandByAeId } from '../src/catalogFile.js';
import { extractProductKey } from '../src/catalogUtil.js';
import { loadTagRules } from '../src/tagRules.js';
import { listProductsForSync, updateProductFields, saveSnapshot } from '../src/shopifyProducts.js';
import { runSync } from '../src/syncRunner.js';
import { FIELDS, DEFAULT_FIELDS } from '../src/fieldDefs.js';

const argv = process.argv.slice(2);
const flag = (n) => argv.includes(n);
const val = (n) => { const i = argv.indexOf(n); return i >= 0 ? argv[i + 1] : undefined; };

const apply = flag('--apply');
const fields = val('--fields') ? val('--fields').split(',').map((s) => s.trim()).filter(Boolean) : DEFAULT_FIELDS;
const only = val('--only') ? val('--only').split(',').map((s) => s.trim()).filter(Boolean) : [];
const catalogFile = val('--file') || 'catalog/catalog.txt';
const productKeys = val('--product')
  ? val('--product').split(',').map((s) => extractProductKey(s)).filter(Boolean)
  : [];
if (val('--product') && !productKeys.length) {
  console.error('--product needs an AliExpress id/URL, or a Shopify product GID/admin URL.');
  process.exit(2);
}
const tagsFile = val('--tags-file');

const bad = fields.filter((f) => !FIELDS[f]);
if (bad.length) {
  console.error(`Unknown field(s): ${bad.join(', ')}. Known: ${Object.keys(FIELDS).join(', ')}`);
  process.exit(2);
}

let brandById, tagRules;
try {
  brandById = brandByAeId(parseCatalog(catalogFile));
  tagRules = loadTagRules(tagsFile);
} catch (err) {
  console.error(err.message);
  process.exit(2);
}

console.log(`${apply ? 'APPLYING' : 'PREVIEW'}: fields = ${fields.join(', ')}${only.length ? `; brands = ${only.join(', ')}` : ''}`);
console.log(`catalog: ${brandById.size} product id(s) in ${catalogFile}; ${tagRules.length} tag rule(s)\n`);

const { shopName, products } = await listProductsForSync();
const summary = await runSync(
  { products, shopName, brandById, tagRules, fields, only, productKeys, apply, adopt: flag('--adopt'), overwrite: flag('--overwrite') },
  { updateProduct: updateProductFields, saveSnapshot, log: (l) => console.log(l), sleep: (ms) => new Promise((r) => setTimeout(r, ms)) }
);

if (summary.unmatchedKeys.length) {
  console.error(`\nNo imported product matches: ${summary.unmatchedKeys.join(', ')} (is it imported, and does it have an ae_sync.product_id?)`);
  process.exit(2);
}
console.log(`\n${summary.considered} imported product(s) considered.`);
console.log(`  ${apply ? 'updated' : 'would update'}: ${summary.changed}`);
if (summary.adopted) console.log(`  ${apply ? 'baselines recorded' : 'baselines to record'}: ${summary.adopted}`);
console.log(`  already correct: ${summary.unchanged}`);
console.log(`  with skipped fields: ${summary.withSkips}`);
if (summary.notInCatalog) console.log(`  not listed in ${catalogFile} (no brand to apply): ${summary.notInCatalog}`);
if (summary.failed) console.log(`  FAILED: ${summary.failed} (see above)`);

fs.mkdirSync('catalog', { recursive: true });
fs.writeFileSync('catalog/last-sync.json', JSON.stringify({ at: new Date().toISOString(), apply, fields, summary }, null, 2));
if (!apply && summary.changed + summary.adopted > 0) console.log('\nPreview only. Re-run with --apply to write these changes.');
process.exit(summary.failed ? 1 : 0);
