// scripts/setDescriptionHtml.mjs
//
// Backfill: replace the placeholder description (the AliExpress title in a
// single <p>) with the listing's real description HTML.
//
// That HTML is ae_item_base_info_dto.detail, returned by the same
// aliexpress.ds.product.get call the importer uses. New imports write it
// themselves (see catalogImporter.js). This script is for products created
// before that, when the description was only the title.
//
//   - Only products with an ae_sync.product_id metafield are considered.
//   - A description is replaced when it is empty or still the original title.
//     Any other description is left alone.
//   - script tags, SVG, and event handlers are stripped before the write.
//
// Usage:
//   node scripts/setDescriptionHtml.mjs                     # preview, writes nothing
//   node scripts/setDescriptionHtml.mjs --apply             # update Shopify
//   node scripts/setDescriptionHtml.mjs --product <id>      # one AE id, URL, or Shopify GID
//   node scripts/setDescriptionHtml.mjs --delay 750         # ms between AliExpress calls

import 'dotenv/config';
import { graphqlRequest } from '../src/shopifyAdminClient.js';
import { getProductDetails } from '../src/aeClient/aliexpressClient.js';
import { extractAeId } from '../src/catalogImporter.js';
import { isTitlePlaceholder } from '../src/productText.js';

const argv = process.argv.slice(2);
const apply = argv.includes('--apply');
const productIdx = argv.indexOf('--product');
const only = productIdx >= 0 ? argv[productIdx + 1] : null;
const delayIdx = argv.indexOf('--delay');
const delay = delayIdx >= 0 ? parseInt(argv[delayIdx + 1], 10) : 750;

const onlyAe = only ? extractAeId(only) : null;

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
      product { id }
      userErrors { field message }
    }
  }`;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const snippet = (html) => String(html || '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 80);

const all = [];
let after = null;
for (;;) {
  const d = await graphqlRequest(LIST, { after });
  all.push(...d.products.nodes);
  if (!d.products.pageInfo.hasNextPage) break;
  after = d.products.pageInfo.endCursor;
}

const imported = all.filter((p) => {
  if (!p.mapped?.value) return false;
  if (!only) return true;
  if (p.id === only) return true;
  return !!(onlyAe && p.mapped.value === onlyAe);
});

console.log(`${imported.length} imported product(s) to check (${apply ? 'APPLYING' : 'preview'}).`);
if (only && !imported.length) {
  console.log(`No Shopify product matched ${only}.`);
  process.exit(0);
}

let ok = 0, failed = 0, skipped = 0;
for (const p of imported) {
  let ae;
  try {
    ae = await getProductDetails(p.mapped.value);
  } catch (e) {
    failed++;
    console.log(`- FAILED AliExpress ${p.mapped.value}: ${e.message}`);
    await sleep(delay);
    continue;
  }

  if (!ae.descriptionHtml) {
    skipped++;
    console.log(`- skip, listing has no description   ${p.title.slice(0, 60)}`);
  } else if (!isTitlePlaceholder(p.descriptionHtml, ae.title)) {
    skipped++;
    console.log(`- skip, description already edited   ${p.title.slice(0, 60)}`);
  } else {
    console.log(`- placeholder => "${snippet(ae.descriptionHtml)}"   ${p.title.slice(0, 60)}`);
    if (apply) {
      try {
        const d = await graphqlRequest(UPDATE, { product: { id: p.id, descriptionHtml: ae.descriptionHtml } });
        const errs = d.productUpdate.userErrors;
        if (errs.length) throw new Error(JSON.stringify(errs));
        ok++;
      } catch (e) {
        failed++;
        console.log(`  FAILED: ${e.message}`);
      }
    }
  }
  await sleep(delay);
}

if (apply) console.log(`\nUpdated ${ok}, skipped ${skipped}, failed ${failed}.`);
else console.log(`\nPreview only. ${imported.length - skipped - failed} would be updated. Re-run with --apply to write them.`);
