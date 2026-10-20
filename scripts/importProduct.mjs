// scripts/importProduct.mjs
//
// Imports ONE AliExpress product into Shopify as a DRAFT product (not
// published; review it before going live), stamped with the AE mapping
// metafields the order side needs. For many products at once, use
// scripts/importCatalog.mjs instead; both share src/catalogImporter.js, so
// they apply exactly the same checks.
//
// Usage:
//   node scripts/importProduct.mjs <product-id-or-url> [--brand "Mooer"] [--dry-run] [--force]
//
//   --brand   only import if AliExpress's "Brand Name" matches
//   --dry-run run every check, write nothing to Shopify
//   --force   import even if the brand is missing or doesn't match
//
// Writes two metafields (namespace must be >= 3 chars, hence "ae_sync"):
//   Product-level:  ae_sync.product_id  = the AliExpress product id
//   Variant-level:  ae_sync.sku_attr    = that variant's AE sku_attr string
// orderWorker.js reads these back (via getAeMappingForVariant) to know what
// to order from AliExpress when a Shopify order comes in.
//
// Re-running for a product that's already imported is safe: it is skipped,
// not duplicated.
//
// NO PRICING MARKUP unless IMPORT_MARKUP is set (e.g. IMPORT_MARKUP=1.8), and
// NO CURRENCY CONVERSION (a non-USD variant is skipped; see SHOP_CURRENCY).

import 'dotenv/config';
import { importAeProduct, extractAeId } from '../src/catalogImporter.js';

const argv = process.argv.slice(2);
let target = null;
const opts = { expectedBrand: null, dryRun: false, force: false, publish: false };

for (let i = 0; i < argv.length; i++) {
  const a = argv[i];
  if (a === '--brand') opts.expectedBrand = argv[++i];
  else if (a === '--dry-run') opts.dryRun = true;
  else if (a === '--force') opts.force = true;
  else if (a === '--publish') opts.publish = true;
  else if (!target && !a.startsWith('--')) target = a;
  else {
    console.error(`Unknown argument: ${a}`);
    process.exit(2);
  }
}

const aeProductId = extractAeId(target);
if (!aeProductId) {
  console.error('Usage: node scripts/importProduct.mjs <product-id-or-url> [--brand "Mooer"] [--dry-run] [--force]');
  process.exit(2);
}
if (!opts.dryRun && !process.env.SHOPIFY_LOCATION_ID) {
  console.error('SHOPIFY_LOCATION_ID is not set in .env (run: node scripts/getLocationId.mjs). Use --dry-run to check without it.');
  process.exit(2);
}

console.log(`[importProduct] ${opts.dryRun ? '(dry run) ' : ''}importing AliExpress product ${aeProductId}...`);
const r = await importAeProduct(aeProductId, opts);

if (r.title) console.log(`  title: ${r.title}`);
if (r.brand !== undefined) console.log(`  brand: ${r.brand ?? '(none listed)'}   store: ${r.storeName ?? '?'}   variants: ${r.variantCount}`);
console.log(`\n${r.status.toUpperCase()}: ${r.reason}`);
if (r.shopifyId) console.log(`  Shopify product: ${r.shopifyId}`);
if (r.status === 'created') {
  console.log('  Review it in Shopify admin, set real pricing/description, then publish when ready.');
}

process.exit(r.status === 'failed' ? 1 : 0);
