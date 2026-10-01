// scripts/verifyMapping.mjs
//
// One-off spot-check: confirms productSet's returned variant order actually
// matches submission order, by reading back each variant's ae_sync.sku_attr
// metafield and its option value (color), and printing them side by side.
// If the mapping is correct, each sku_attr's color-id prefix should
// obviously correspond to the variant's option value (e.g. "SKY BLUE"
// should read back the sku_attr containing "14:1254", "black" should read
// back "14:193" — matching what importProduct.mjs logged when it fetched
// the AE product).
//
// Usage: node scripts/verifyMapping.mjs <shopify-product-gid>
// e.g.:  node scripts/verifyMapping.mjs gid://shopify/Product/10322457297113
import 'dotenv/config';
import { graphqlRequest } from '../src/shopifyAdminClient.js';

const productGid = process.argv[2];
if (!productGid) {
  console.error('Usage: node scripts/verifyMapping.mjs <shopify-product-gid>');
  process.exit(1);
}

const data = await graphqlRequest(
  `query VerifyMapping($id: ID!) {
    product(id: $id) {
      title
      variants(first: 50) {
        nodes {
          id
          title
          selectedOptions { name value }
          skuAttr: metafield(namespace: "ae_sync", key: "sku_attr") { value }
        }
      }
    }
  }`,
  { id: productGid }
);

const product = data?.product;
if (!product) {
  console.error('No product found for that gid — check it was copied correctly.');
  process.exit(1);
}

console.log(`Product: ${product.title}\n`);
for (const v of product.variants.nodes) {
  const optionStr = v.selectedOptions.map((o) => `${o.name}=${o.value}`).join(', ');
  console.log(`${v.id}`);
  console.log(`  option: ${optionStr}`);
  console.log(`  ae_sync.sku_attr metafield: ${v.skuAttr?.value || '(MISSING)'}\n`);
}
console.log('Compare each variant\'s option value against the sku_attr logged during import —');
console.log('e.g. "SKY BLUE" should show sku_attr starting with "14:1254", "black" with "14:193".');
