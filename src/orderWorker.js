import db from './db.js';
import { normalizeAddress, AddressValidationError } from './addressNormalizer.js';
import { placeOrder as aePlaceOrder } from './aeClient/index.js';
import { TransientError, PermanentError } from './aeClient/errors.js';
import { getAeMappingForVariant } from './shopifyAdminClient.js';

/**
 * A raw Shopify line item has product_id/variant_id/sku/title/quantity —
 * none of which are aeProductId/aeSkuAttr. aliexpressClient.js's
 * placeOrder() requires exactly those two fields per item (see
 * assertMapped() there) and throws PermanentError/UNMAPPED_ITEM if either
 * is missing. This is what actually supplies them: for each line item,
 * look up the ae.product_id / ae.sku_attr metafields that
 * scripts/importProduct.mjs writes when a product gets imported.
 *
 * Only called in real mode — the mock supplier doesn't validate a mapping
 * at all, and requiring a live Shopify Admin token just to run the mock
 * pipeline would be an unnecessary coupling.
 */
async function enrichLineItems(lineItems) {
  const enriched = [];
  for (const li of lineItems) {
    const mapping = await getAeMappingForVariant(li.variant_id);
    enriched.push({
      ...li,
      // Left undefined (not defaulted to a placeholder) when unmapped —
      // assertMapped() in aliexpressClient.js is what should catch this
      // and reject it as PermanentError/UNMAPPED_ITEM, not this function.
      aeProductId: mapping?.aeProductId,
      aeSkuAttr: mapping?.aeSkuAttr,
    });
  }
  return enriched;
}

/**
 * Handles one Shopify order payload: places the matching order with
 * AliExpress (mock or real, depending on AE_MODE), and records the outcome.
 * Designed to be safe to call more than once for the same order (idempotent).
 */
export async function processOrder(shopifyOrderPayload) {
  const shopifyOrderId = String(shopifyOrderPayload.id);

  // --- Idempotency check #2 (belt and suspenders) ---
  // The webhook layer already dedupes by webhook_id, but that only protects
  // against duplicate *deliveries*. This checks duplicate *processing* —
  // e.g. if the worker crashed after placing the AE order but before
  // marking it done, a retry shouldn't double-order.
  const existing = db.prepare('SELECT * FROM orders WHERE shopify_order_id = ?').get(shopifyOrderId);
  if (existing && existing.ae_order_id) {
    console.log(`[worker] order ${shopifyOrderId} already placed with AliExpress (${existing.ae_order_id}), skipping`);
    return;
  }

  if (!existing) {
    db.prepare('INSERT INTO orders (shopify_order_id, status) VALUES (?, ?)').run(shopifyOrderId, 'pending');
    for (const li of shopifyOrderPayload.line_items || []) {
      db.prepare(
        'INSERT INTO order_line_items (shopify_order_id, ae_sku_id, title, qty) VALUES (?, ?, ?, ?)'
      ).run(shopifyOrderId, li.ae_sku_id || li.sku || 'unknown-sku', li.title, li.quantity);
    }
  }

  // --- Normalize the address BEFORE calling the supplier ---
  // Catching a structurally bad address here (missing province_code, no
  // name at all, etc.) is strictly better than finding out from a 422
  // after a network round-trip — and it's the same "don't retry" failure
  // mode either way, so we treat it identically to a supplier rejection.
  let normalizedAddress;
  try {
    normalizedAddress = normalizeAddress(shopifyOrderPayload.shipping_address);
  } catch (err) {
    if (err instanceof AddressValidationError) {
      db.prepare(
        "UPDATE orders SET status = 'failed', last_error = ?, updated_at = datetime('now') WHERE shopify_order_id = ?"
      ).run(`address validation: ${err.message}`, shopifyOrderId);
      console.warn(`[worker] order ${shopifyOrderId} failed address validation: ${err.message}`);
      return; // handled outcome, not a queue failure — don't rethrow
    }
    throw err;
  }

  try {
    // In mock mode, pass raw Shopify line items through unchanged — the
    // mock supplier doesn't need or check an AE mapping. In real mode,
    // enrich each item with its aeProductId/aeSkuAttr first (see
    // enrichLineItems above) so assertMapped() in aliexpressClient.js has
    // what it needs instead of failing every single real order.
    const lineItems = process.env.AE_MODE === 'real'
      ? await enrichLineItems(shopifyOrderPayload.line_items)
      : shopifyOrderPayload.line_items;

    const { aeOrderId } = await aePlaceOrder({
      shopifyOrderId,
      lineItems,
      address: normalizedAddress,
      // Only meaningful in mock mode — lets you rehearse failure modes on
      // demand. The real client ignores this field entirely.
      simulate: shopifyOrderPayload.simulate || 'success',
    });

    db.prepare(
      'UPDATE orders SET ae_order_id = ?, status = ?, updated_at = datetime(\'now\') WHERE shopify_order_id = ?'
    ).run(aeOrderId, 'processing', shopifyOrderId);
    console.log(`[worker] placed AE order ${aeOrderId} for Shopify order ${shopifyOrderId}`);
  } catch (err) {
    if (err instanceof TransientError) {
      // Worth retrying — rethrow and let the queue's retry/backoff handle it.
      db.prepare(
        'UPDATE orders SET retry_count = retry_count + 1, last_error = ?, updated_at = datetime(\'now\') WHERE shopify_order_id = ?'
      ).run(err.message, shopifyOrderId);
      throw err;
    }

    if (err instanceof PermanentError) {
      // Out-of-stock / bad-address / rejected-order responses are not
      // transient — retrying automatically just repeats the same failure.
      // Flagged for a human instead of silently retried.
      db.prepare(
        "UPDATE orders SET status = 'failed', last_error = ?, updated_at = datetime('now') WHERE shopify_order_id = ?"
      ).run(err.message, shopifyOrderId);
      console.warn(`[worker] order ${shopifyOrderId} failed permanently: ${err.message}`);
      return; // handled outcome, not a queue failure
    }

    throw err; // unexpected error shape — surface it rather than swallow it
  }
}
