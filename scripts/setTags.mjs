// scripts/setVendors.mjs
//
// One-off: set the Shopify "vendor" of products the importer already created
// to the brand they were imported under.
//
// The brand comes from catalog/catalog.txt: each imported product carries its
// AliExpress id in the ae_sync.product_id metafield, and the catalog says
// which [Brand] section lists that id. No AliExpress calls are made.
//
//   - Only products with an ae_sync.product_id metafield are considered.
//   - Products whose id isn't in the catalog file are reported and left alone.
//   - Products already on the right vendor are skipped. Nothing else about a
//     product is changed.
//
// Usage:
//   node scripts/setVendors.mjs                 # preview, writes nothing
//   node scripts/setVendors.mjs --apply         # update Shopify
//   node scripts/setVendors.mjs --file path     # use a different catalog file

import 'dotenv/config';
import fs from 'node:fs';
import { graphqlRequest } from '../src/shopifyAdminClient.js';
import { extractAeId } from '../src/catalogImporter.js';

const argv = process.argv.slice(2);
const apply = argv.includes('--apply');
const fileIdx = argv.indexOf('--file');
const file = fileIdx >= 0 ? argv[fileIdx + 1] : 'catalog/catalog.txt';

// aeProductId -> brand (the [Header] text, exactly as written)
const brandById = new Map();
let current = null;
fs.readFileSync(file, 'utf8').split(/\r?\n/).forEach((raw, i) => {
  const line = raw.replace(/\s+#.*$/, '').trim();
  if (!line || line.startsWith('#')) return;
  const h = line.match(/^\[(.+)\]$/);
  if (h) { current = h[1].trim(); return; }
  if (!current) throw new Error(`${file}:${i + 1}: entry before any [Brand] header`);
  const id = extractAeId(line);
  if (!id) throw new Error(`${file}:${i + 1}: no product id in "${line}"`);
  if (brandById.has(id) && brandById.get(id) !== current) {
    throw new Error(`${file}:${i + 1}: product ${id} is listed under both "${brandById.get(id)}" and "${current}"`);
  }
  brandById.set(id, current);
});

const LIST = `
  query($after: String) {
    products(first: 100, after: $after) {
      pageInfo { hasNextPage endCursor }
      nodes {
        id title vendor
        mapped: metafield(namespace: "ae_sync", key: "product_id") { value }
      }
    }
  }`;
const UPDATE = `
  mutation($product: ProductUpdateInput!) {
    productUpdate(product: $product) {
      product { id tag }
      userErrors { field message }
    }
  }`;

const all = [];
let after = null;
for (;;) {
  const d = await graphqlRequest(LIST, { after });
  all.push(...d.products.nodes);
  if (!d.products.pageInfo.hasNextPage) break;
  after = d.products.pageInfo.endCursor;
}

const imported = all.filter((p) => p.mapped?.value);
const notInCatalog = imported.filter((p) => !brandById.has(p.mapped.value));
const inCatalog = imported.filter((p) => brandById.has(p.mapped.value));
const todo = inCatalog.filter((p) => p.vendor !== brandById.get(p.mapped.value));

console.log(`${imported.length} imported products; ${inCatalog.length} found in ${file}; ${todo.length} need a vendor change (${apply ? 'APPLYING' : 'preview'}).`);
if (notInCatalog.length) {
  console.log(`\n${notInCatalog.length} imported product(s) are NOT listed in the catalog file and are left alone:`);
  for (const p of notInCatalog.slice(0, 10)) console.log(`  ${p.title.slice(0, 70)}  (AE ${p.mapped.value}, vendor "${p.vendor}")`);
  if (notInCatalog.length > 10) console.log(`  ...and ${notInCatalog.length - 10} more`);
}
console.log();

let ok = 0, failed = 0;
for (const p of todo) {
  const tags = brandById.get(p.mapped.value);
  console.log(`- "${p.vendor}" => "${brand}"   ${p.title.slice(0, 60)}`);
  if (!apply) continue;
  try {
    const d = await graphqlRequest(UPDATE, { product: { id: p.id, vendor: brand, tag: tags } });
    const errs = d.productUpdate.userErrors;
    if (errs.length) throw new Error(JSON.stringify(errs));
    ok++;
  } catch (e) {
    failed++;
    console.log(`  FAILED: ${e.message}`);
  }
  await new Promise((r) => setTimeout(r, 300));
}
if (apply) console.log(`\nUpdated ${ok}, failed ${failed}.`);
else if (todo.length) console.log('\nPreview only. Re-run with --apply to write these changes.');
