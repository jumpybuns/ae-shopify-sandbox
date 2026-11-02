// src/shopifyProducts.js
//
// Shopify read/write for the sync tool. The only part of the sync that talks
// to the network; everything it decides comes from the pure modules.

import { graphqlRequest, setMetafields } from './shopifyAdminClient.js';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Retries transient failures (Shopify throttling, 429, 5xx, network) with backoff. */
export async function withRetry(fn, { tries = 5, baseMs = 1000 } = {}) {
  let lastErr;
  for (let i = 0; i < tries; i++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      const msg = String(err?.message || err);
      const transient = /THROTTLED|throttl|429|\b50[0-4]\b|ECONNRESET|ETIMEDOUT|EAI_AGAIN|fetch failed/i.test(msg);
      if (!transient || i === tries - 1) throw err;
      await sleep(baseMs * 2 ** i);
    }
  }
  throw lastErr;
}

const LIST = `
  query SyncProducts($after: String) {
    shop { name }
    products(first: 100, after: $after) {
      pageInfo { hasNextPage endCursor }
      nodes {
        id title descriptionHtml vendor tags
        mapped: metafield(namespace: "ae_sync", key: "product_id") { value }
        synced: metafield(namespace: "ae_sync", key: "synced") { value }
      }
    }
  }`;

/** Every product in the store, normalized, plus the shop name. */
export async function listProductsForSync() {
  const products = [];
  let shopName = '';
  let after = null;
  for (;;) {
    const d = await withRetry(() => graphqlRequest(LIST, { after }));
    shopName = d.shop?.name || shopName;
    for (const n of d.products.nodes) {
      products.push({
        id: n.id,
        title: n.title,
        descriptionHtml: n.descriptionHtml || '',
        vendor: n.vendor || '',
        tags: n.tags || [],
        aeId: n.mapped?.value || null,
        synced: n.synced?.value || null,
      });
    }
    if (!d.products.pageInfo.hasNextPage) break;
    after = d.products.pageInfo.endCursor;
  }
  return { shopName, products };
}

const UPDATE = `
  mutation SyncUpdate($product: ProductUpdateInput!) {
    productUpdate(product: $product) {
      product { id }
      userErrors { field message }
    }
  }`;

/** Writes only the given fields (title, descriptionHtml, vendor, tags). Throws on userErrors. */
export async function updateProductFields(id, set) {
  const d = await withRetry(() => graphqlRequest(UPDATE, { product: { id, ...set } }));
  const errs = d.productUpdate.userErrors;
  if (errs.length) throw new Error(`productUpdate userErrors: ${JSON.stringify(errs)}`);
}

/** Stores what we last wrote, so the next run can tell hand edits from our own. */
export async function saveSnapshot(id, snapshot) {
  await withRetry(() =>
    setMetafields([
      { ownerId: id, namespace: 'ae_sync', key: 'synced', type: 'json', value: JSON.stringify(snapshot) },
    ])
  );
}
