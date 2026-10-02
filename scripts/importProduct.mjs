// scripts/importProduct.mjs
//
// Pulls one AliExpress product into Shopify as a DRAFT product (not
// published — review it before going live), and stamps it with the AE
// mapping metafields the order side needs.
//
// Usage:
//   node scripts/importProduct.mjs <aliexpress-product-id>
//
// What it does:
//   1. Fetches real product data from AliExpress (aliexpress.ds.product.get)
//   2. Creates the Shopify product + variants via productSet
//   3. Writes two metafields via metafieldsSet (namespace must be >= 3
//      chars, hence "ae_sync" rather than "ae"):
//        - Product-level:  ae_sync.product_id  = the AliExpress product id
//        - Variant-level:  ae_sync.sku_attr    = that variant's AE sku_attr string
//      orderWorker.js reads these back (via shopifyAdminClient's
//      getAeMappingForVariant) to know what to actually order from
//      AliExpress when a Shopify order comes in.
//
// NO PRICING MARKUP IS APPLIED. The Shopify price is set to the raw
// AliExpress sku_price verbatim — that's a business decision only you
// should make, not something to silently default. Edit the `markup`
// constant below, or edit prices in Shopify afterward, before publishing.
//
// NO CURRENCY CONVERSION either — if AliExpress returns a non-USD price
// for your account/region, check currencyCode in the logged output below.

import 'dotenv/config';
import { getProductDetails } from '../src/aeClient/aliexpressClient.js';
import { createOrUpdateProduct, setMetafields } from '../src/shopifyAdminClient.js';

const aeProductId = process.argv[2];
if (!aeProductId) {
  console.error('Usage: node scripts/importProduct.mjs <aliexpress-product-id>');
  process.exit(1);
}

// Edit this if you want a markup applied automatically. 1.0 = no markup.
const markup = 1.0;

console.log(`[importProduct] fetching AliExpress product ${aeProductId}...`);
const aeProduct = await getProductDetails(aeProductId);

console.log(`[importProduct] got "${aeProduct.title}" — ${aeProduct.variants.length} variant(s)`);
for (const v of aeProduct.variants) {
  console.log(`  - ${v.label}: ${v.currencyCode} ${v.price} (stock: ${v.stock}) sku_attr="${v.skuAttr}"`);
}

if (aeProduct.variants.some((v) => !v.skuAttr)) {
  console.warn(
    '\n⚠️  At least one variant has an empty sku_attr. This likely means the ' +
    'property-list shape in the real response differs from what getProductDetails() ' +
    'assumes (see the comment above its sku_attr construction). Check the raw ' +
    'response before trusting this import — an empty sku_attr will cause ' +
    'placeOrder to reject this variant with UNMAPPED_ITEM later.\n'
  );
}

const shopifyProductInput = {
  title: aeProduct.title,
  images: aeProduct.images,
  optionName: 'Style',
  variants: aeProduct.variants.map((v, i) => ({
    optionValue: v.label || `Variant ${i + 1}`,
    price: (parseFloat(v.price) * markup).toFixed(2),
    sku: `AE-${aeProductId}-${i}`,
    inventoryQuantity: v.stock || 0,
  })),
};

console.log('\n[importProduct] creating Shopify product (as DRAFT)...');
const shopifyProduct = await createOrUpdateProduct(shopifyProductInput);
console.log(`[importProduct] created ${shopifyProduct.id}`);

// --- Write the AE mapping metafields ---
const metafieldEntries = [
  {
    ownerId: shopifyProduct.id,
    namespace: 'ae_sync',
    key: 'product_id',
    type: 'single_line_text_field',
    value: String(aeProductId),
  },
];

// Match each returned Shopify variant back to the AE variant it came from,
// by position — productSet returns variants in the same order they were
// submitted in. CONFIRMED via scripts/verifyMapping.mjs against a real
// 2-variant import (SKY BLUE -> sku_attr "14:1254...", black -> "14:193...",
// in the submitted order) — safe to rely on.
shopifyProduct.variants.nodes.forEach((shopifyVariant, i) => {
  const aeVariant = aeProduct.variants[i];
  if (!aeVariant) return;
  metafieldEntries.push({
    ownerId: shopifyVariant.id,
    namespace: 'ae_sync',
    key: 'sku_attr',
    type: 'single_line_text_field',
    value: aeVariant.skuAttr,
  });
});

console.log(`[importProduct] writing ${metafieldEntries.length} metafield(s)...`);
await setMetafields(metafieldEntries);

console.log(`\n✅ Imported as a DRAFT product: ${shopifyProduct.id}`);
console.log('   Review it in Shopify admin, set real pricing/description, then publish when ready.');
