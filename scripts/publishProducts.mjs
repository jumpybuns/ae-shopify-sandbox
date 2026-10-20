// scripts/publishProducts.mjs
//
// Makes importer-created products visible on the storefront: sets them ACTIVE
// and publishes them to the Online Store sales channel. "Active" alone is not
// enough; a product must also be published to the Online Store channel, or it
// has no /products/<handle> page and never appears in search.
//
// Only touches products that carry an ae_sync.product_id metafield, and skips
// ones already live (status ACTIVE with an onlineStoreUrl). ARCHIVED products
// are left alone.
//
// Needs the read_publications + write_publications scopes (deploy + approve).
//
// Usage:
//   node scripts/publishProducts.mjs            # preview, writes nothing
//   node scripts/publishProducts.mjs --apply    # publish for real
//   node scripts/publishProducts.mjs --apply --include-drafts   # also activate DRAFTs

import 'dotenv/config';
import { graphqlRequest, activateAndPublish, getOnlineStorePublicationId } from '../src/shopifyAdminClient.js';

const apply = process.argv.includes('--apply');
const includeDrafts = process.argv.includes('--include-drafts');

const LIST = `
  query($after: String) {
    products(first: 100, after: $after) {
      pageInfo { hasNextPage endCursor }
      nodes {
        id title status onlineStoreUrl
        mapped: metafield(namespace: "ae_sync", key: "product_id") { value }
      }
    }
  }`;

await getOnlineStorePublicationId(); // fail fast if scopes/channel are missing

const all = [];
let after = null;
for (;;) {
  const d = await graphqlRequest(LIST, { after });
  all.push(...d.products.nodes);
  if (!d.products.pageInfo.hasNextPage) break;
  after = d.products.pageInfo.endCursor;
}

const imported = all.filter((p) => p.mapped?.value);
const todo = imported.filter((p) => {
  if (p.status === 'ARCHIVED') return false;
  if (p.status === 'DRAFT') return includeDrafts;
  return !p.onlineStoreUrl; // ACTIVE but not on the Online Store
});
const draftsLeft = imported.filter((p) => p.status === 'DRAFT').length;

console.log(`${imported.length} imported products; ${todo.length} to publish (${apply ? 'APPLYING' : 'preview'}).`);
if (!includeDrafts && draftsLeft) console.log(`${draftsLeft} DRAFT product(s) skipped; add --include-drafts to publish those too.`);
console.log();

let ok = 0, failed = 0;
for (const p of todo) {
  console.log(`- [${p.status}] ${p.title.slice(0, 80)}`);
  if (!apply) continue;
  try {
    await activateAndPublish(p.id);
    ok++;
  } catch (e) {
    failed++;
    console.log(`  FAILED: ${e.message}`);
  }
  await new Promise((r) => setTimeout(r, 300));
}
if (apply) console.log(`\nPublished ${ok}, failed ${failed}. Re-run scripts/checkPublication.mjs to verify.`);
else if (todo.length) console.log('\nPreview only. Re-run with --apply to publish these.');
