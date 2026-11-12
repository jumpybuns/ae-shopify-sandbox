// scripts/setPrice.mjs
//
// Set each imported variant's Shopify price to its current AliExpress cost
// plus 40% (cost × 1.4). The cost is the same field the importer uses
// (offer_sale_price, unless AE_PRICE_FIELD overrides it).
//
// Price lives on the variant, so this updates variants, not the product.
// A variant is matched to its AliExpress sku by the ae_sync.sku_attr
// metafield written at import.
//
//   - Only products with an ae_sync.product_id metafield are considered.
//   - A variant already at the target price is left alone.
//   - Variants with no matching AliExpress sku are left alone and reported.
//
// Usage:
//   node scripts/setPrice.mjs                       # preview, writes nothing
//   node scripts/setPrice.mjs --apply               # update Shopify
//   node scripts/setPrice.mjs --product <id>        # one AE id, URL, or Shopify GID
//   node scripts/setPrice.mjs --markup 1.4          # multiplier (1.4 = +40%)
//   node scripts/setPrice.mjs --delay 750           # ms between AliExpress calls
//
// New imports use IMPORT_MARKUP the same way. Set IMPORT_MARKUP=1.4 so
// products imported later get this price without running this script.

import 'dotenv/config';
import { graphqlRequest } from '../src/shopifyAdminClient.js';
import { getProductDetails } from '../src/aeClient/aliexpressClient.js';
import { extractAeId } from '../src/catalogImporter.js';
import { markedUpPrice, matchAeVariant } from '../src/pricing.js';

const argv = process.argv.slice(2);
const apply = argv.includes('--apply');
const productIdx = argv.indexOf('--product');
const only = productIdx >= 0 ? argv[productIdx + 1] : null;
const markupIdx = argv.indexOf('--markup');
const markup = markupIdx >= 0 ? Number(argv[markupIdx + 1]) : 1.4;
const delayIdx = argv.indexOf('--delay');
const delay = delayIdx >= 0 ? parseInt(argv[delayIdx + 1], 10) : 750;

if (!Number.isFinite(markup) || markup <= 0) {
  throw new Error(`--markup must be a positive number, got "${argv[markupIdx + 1]}"`);
}

const onlyAe = only ? extractAeId(only) : null;
const addedPct = Math.round((markup - 1) * 100);

const LIST = `
  query($after: String) {
    products(first: 50, after: $after) {
      pageInfo { hasNextPage endCursor }
      nodes {
        id
        title
        mapped: metafield(namespace: "ae_sync", key: "product_id") { value }
        variants(first: 250) {
          nodes {
            id
            sku
            price
            skuAttr: metafield(namespace: "ae_sync", key: "sku_attr") { value }
            noSkuAttr: metafield(namespace: "ae_sync", key: "no_sku_attr") { value }
          }
        }
      }
    }
  }`;
const UPDATE = `
  mutation($productId: ID!, $variants: [ProductVariantsBulkInput!]!) {
    productVariantsBulkUpdate(productId: $productId, variants: $variants) {
      productVariants { id price }
      userErrors { field message }
    }
  }`;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

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

console.log(`${imported.length} imported product(s) to check at cost × ${markup} (+${addedPct}%) (${apply ? 'APPLYING' : 'preview'}).`);
if (only && !imported.length) {
  console.log(`No Shopify product matched ${only}.`);
  process.exit(0);
}

let ok = 0, failed = 0, skipped = 0, would = 0;
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

  const changes = [];
  let unmatched = 0;
  for (const v of p.variants?.nodes || []) {
    const aeVar = matchAeVariant(
      { sku: v.sku, skuAttr: v.skuAttr?.value || null, noSkuAttr: v.noSkuAttr?.value === 'true' },
      ae.variants,
      p.mapped.value,
    );
    if (!aeVar) {
      unmatched++;
      console.log(`- skip, no AliExpress variant for ${v.sku || v.id}   ${p.title.slice(0, 50)}`);
      continue;
    }
    const next = markedUpPrice(aeVar.price, markup);
    if (!next) {
      unmatched++;
      console.log(`- skip, bad AliExpress price "${aeVar.price}" for ${v.sku || v.id}`);
      continue;
    }
    const current = Number(v.price).toFixed(2);
    if (current === next) continue;
    changes.push({ id: v.id, sku: v.sku, from: current, to: next });
  }

  if (!changes.length) {
    skipped++;
    console.log(`- already at +${addedPct}%   ${p.title.slice(0, 60)}`);
  } else {
    would++;
    for (const c of changes) {
      console.log(`- $${c.from} => $${c.to}  ${c.sku || c.id}   ${p.title.slice(0, 50)}`);
    }
    if (apply) {
      try {
        const d = await graphqlRequest(UPDATE, {
          productId: p.id,
          variants: changes.map((c) => ({ id: c.id, price: c.to })),
        });
        const errs = d.productVariantsBulkUpdate.userErrors;
        if (errs.length) throw new Error(JSON.stringify(errs));
        ok++;
      } catch (e) {
        failed++;
        console.log(`  FAILED: ${e.message}`);
      }
    }
  }
  if (unmatched && changes.length) {
    console.log(`  ${unmatched} variant(s) on this product were left unchanged`);
  }
  await sleep(delay);
}

if (apply) console.log(`\nUpdated ${ok}, already priced ${skipped}, failed ${failed}.`);
else console.log(`\nPreview only. ${would} product(s) would be updated. Re-run with --apply to write them.`);
