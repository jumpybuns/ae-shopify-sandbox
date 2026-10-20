// scripts/checkPublication.mjs
//
// Read-only diagnostic: for every product the importer created (the ones
// carrying an ae_sync.product_id metafield), reports its status and whether
// it is actually published to the Online Store sales channel.
//
// A product can be status ACTIVE and still be invisible on the storefront:
// "active" only means it's not a draft/archived. It must ALSO be published
// to the Online Store channel. Products created through the API aren't
// published to any channel by default, and an unpublished product has no
// storefront page (404 at /products/<handle>) and never appears in search.
// Shopify reports that as onlineStoreUrl = null.
//
// Usage: node scripts/checkPublication.mjs

import 'dotenv/config';
import { graphqlRequest } from '../src/shopifyAdminClient.js';

const QUERY = `
  query ImportedProducts($after: String) {
    products(first: 100, after: $after) {
      pageInfo { hasNextPage endCursor }
      nodes {
        id
        title
        handle
        status
        onlineStoreUrl
        mapped: metafield(namespace: "ae_sync", key: "product_id") { value }
      }
    }
  }
`;

const all = [];
let after = null;
for (;;) {
  const data = await graphqlRequest(QUERY, { after });
  all.push(...data.products.nodes);
  if (!data.products.pageInfo.hasNextPage) break;
  after = data.products.pageInfo.endCursor;
}

const imported = all.filter((p) => p.mapped?.value);
const byStatus = (s) => imported.filter((p) => p.status === s);
const published = imported.filter((p) => p.onlineStoreUrl);
const activeNotPublished = imported.filter((p) => p.status === 'ACTIVE' && !p.onlineStoreUrl);

console.log(`Products in store:                 ${all.length}`);
console.log(`Created by the importer:           ${imported.length}`);
console.log(`  status ACTIVE:                   ${byStatus('ACTIVE').length}`);
console.log(`  status DRAFT:                    ${byStatus('DRAFT').length}`);
console.log(`  status ARCHIVED:                 ${byStatus('ARCHIVED').length}`);
console.log(`  published to the Online Store:   ${published.length}`);
console.log(`  ACTIVE but NOT on Online Store:  ${activeNotPublished.length}`);

if (activeNotPublished.length) {
  console.log('\nExamples of ACTIVE products with no storefront page:');
  for (const p of activeNotPublished.slice(0, 8)) {
    console.log(`  ${p.title.slice(0, 60)}  (/products/${p.handle})`);
  }
}
if (published.length) {
  console.log('\nExample storefront URL that should work:');
  console.log(`  ${published[0].onlineStoreUrl}`);
}
