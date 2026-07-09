import db from './db.js';

const AE_BASE_URL = process.env.MOCK_AE_BASE_URL || 'http://localhost:4001';

/**
 * Handles one Shopify order payload: places the matching order with
 * "AliExpress" (the mock), and records the outcome. Designed to be safe
 * to call more than once for the same order (idempotent).
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

  const body = {
    shopify_order_id: shopifyOrderId,
    line_items: shopifyOrderPayload.line_items,
    address: shopifyOrderPayload.shipping_address,
    // The mock reads this to let YOU control what happens — a real
    // AliExpress order obviously wouldn't take this parameter. It's only
    // here so you can rehearse each failure mode on demand while testing.
    simulate: shopifyOrderPayload.simulate || 'success',
  };

  let response;
  try {
    // A real third-party API can hang. Never let one slow supplier stall
    // your whole worker — always set an explicit timeout.
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);
    response = await fetch(`${AE_BASE_URL}/mock-ae/order`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    clearTimeout(timeout);
  } catch (err) {
    // Network error or timeout — this IS worth retrying, so we rethrow
    // and let the queue's retry/backoff handle it.
    db.prepare(
      'UPDATE orders SET retry_count = retry_count + 1, last_error = ?, updated_at = datetime(\'now\') WHERE shopify_order_id = ?'
    ).run(`transport error: ${err.message}`, shopifyOrderId);
    throw err;
  }

  if (response.status === 201) {
    const data = await response.json();
    db.prepare(
      'UPDATE orders SET ae_order_id = ?, status = ?, updated_at = datetime(\'now\') WHERE shopify_order_id = ?'
    ).run(data.ae_order_id, 'processing', shopifyOrderId);
    console.log(`[worker] placed AE order ${data.ae_order_id} for Shopify order ${shopifyOrderId}`);
    return;
  }

  // --- Deliberate non-retry path ---
  // Out-of-stock / bad-address responses are not transient — retrying
  // automatically just repeats the same failure and can confuse state.
  // These get flagged for a human instead of silently retried.
  const errorBody = await response.json().catch(() => ({}));
  db.prepare(
    'UPDATE orders SET status = ?, last_error = ?, updated_at = datetime(\'now\') WHERE shopify_order_id = ?'
  ).run('failed', errorBody.error || `HTTP ${response.status}`, shopifyOrderId);
  console.warn(`[worker] order ${shopifyOrderId} failed permanently: ${errorBody.error}`);
  // No throw here — this is a "handled" outcome, not a queue failure.
}
