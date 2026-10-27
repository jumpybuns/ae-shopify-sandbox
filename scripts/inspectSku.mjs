// scripts/inspectSku.mjs
//
// Read-only. Prints what AliExpress actually returns for each variant of one
// product, to diagnose imports skipped with "empty sku_attr".
//
// Usage: node scripts/inspectSku.mjs <product-id-or-url>

import 'dotenv/config';
import { getProductDetails } from '../src/aeClient/aliexpressClient.js';
import { extractAeId } from '../src/catalogImporter.js';

const id = extractAeId(process.argv[2]);
if (!id) {
  console.error('Usage: node scripts/inspectSku.mjs <product-id-or-url>');
  process.exit(2);
}
const ae = await getProductDetails(id);
console.log(`${ae.title}\nbrand: ${ae.brand ?? '(none)'}  store: ${ae.storeName}  variants: ${ae.variants.length}\n`);
ae.variants.forEach((v, i) => {
  console.log(`#${i}  sku_attr=${JSON.stringify(v.skuAttr)}  sku_id=${v.skuId}  label=${JSON.stringify(v.label)}  price=${v.price}  stock=${v.stock}`);
});
const empty = ae.variants.find((v) => !v.skuAttr);
if (empty) {
  console.log('\nRaw AliExpress sku object for the first variant with an empty sku_attr:');
  console.log(JSON.stringify(empty.raw, null, 2));
}
