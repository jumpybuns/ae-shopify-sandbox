// scripts/fixTitles.mjs
//
// One-off cleanup for products the importer already created with the long
// AliExpress title as their title and an empty description. For each imported
// product (has an ae_sync.product_id metafield) whose description is empty and
// whose title is longer than a storefront title should be:
//   - description <- the full current title
//   - title       <- a short version (see src/productText.js)
// Products that already have a description are never touched.
//
// Usage:
//   node scripts/fixTitles.mjs            # preview only, writes nothing
//   node scripts/fixTitles.mjs --apply    # actually update Shopify

import 'dotenv/config';
import { graphqlRequest } from '../src/shopifyAdminClient.js';
import { shortTitle, descriptionFromTitle } from '../src/productText.js';

const apply = process.argv.includes('--apply');

const LIST = `
  query($after: String) {
    products(first: 100, after: $after) {
      pageInfo { hasNextPage endCursor }
      nodes {
        id title descriptionHtml
        mapped: metafield(namespace: "ae_sync", key: "product_id") { value }
      }
    }
  }`;
const UPDATE = `
  mutation($product: ProductUpdateInput!) {
    productUpdate(product: $product) {
      product { id title }
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

const todo = all.filter((p) => {
  if (!p.mapped?.value) return false;               // not importer-created
  if ((p.descriptionHtml || '').trim()) return false; // already has a description
  return shortTitle(p.title) !== p.title.trim();    // title actually shrinks
});

console.log(`${all.length} products in store; ${todo.length} need fixing (${apply ? 'APPLYING' : 'preview'}).\n`);

let ok = 0, failed = 0;
for (const p of todo) {
  const next = shortTitle(p.title);
  console.log(`- ${p.title}\n  => ${next}`);
  if (!apply) continue;
  try {
    const d = await graphqlRequest(UPDATE, {
      product: { id: p.id, title: next, descriptionHtml: descriptionFromTitle(p.title) },
    });
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
