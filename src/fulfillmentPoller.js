import db from './db.js';

const AE_BASE_URL = process.env.MOCK_AE_BASE_URL || 'http://localhost:4001';
const POLL_INTERVAL_MS = 5000; // real system: 15-30 min. Fast here so you can watch it work.

async function pushFulfillmentToShopify(shopifyOrderId, trackingNumber) {
  const domain = process.env.SHOPIFY_STORE_DOMAIN;
  const token = process.env.SHOPIFY_ADMIN_ACCESS_TOKEN;

  if (!domain || !token) {
    console.log(
      `[poller] (no Shopify creds set) would mark order ${shopifyOrderId} fulfilled with tracking ${trackingNumber}`
    );
    return;
  }

  // Real call — wire this up once you have a dev store + Admin API token.
  // Note: fulfillmentCreate needs a fulfillment_order_id, which you'd fetch
  // via the order's fulfillmentOrders field first. Left as the next step
  // once you're pointing this at a live store.
  const query = `
    mutation fulfillmentCreate($input: FulfillmentInput!) {
      fulfillmentCreateV2(fulfillment: $input) {
        fulfillment { id status }
        userErrors { field message }
      }
    }
  `;
  console.log(`[poller] would call Shopify Admin API for ${shopifyOrderId} with tracking ${trackingNumber}`);
  console.log('[poller] (query prepared, not sent — fill in fulfillment_order_id lookup first)', query.slice(0, 40));
}

async function pollOnce() {
  const processingOrders = db.prepare("SELECT * FROM orders WHERE status = 'processing'").all();

  for (const order of processingOrders) {
    try {
      const res = await fetch(`${AE_BASE_URL}/mock-ae/order/${order.ae_order_id}/status`);
      if (!res.ok) continue;
      const data = await res.json();

      if (data.status === 'shipped') {
        db.prepare(
          "UPDATE orders SET status = 'shipped', updated_at = datetime('now') WHERE shopify_order_id = ?"
        ).run(order.shopify_order_id);
        console.log(`[poller] order ${order.shopify_order_id} shipped, tracking ${data.tracking_number}`);
        await pushFulfillmentToShopify(order.shopify_order_id, data.tracking_number);
      }
    } catch (err) {
      console.error(`[poller] error checking order ${order.shopify_order_id}:`, err.message);
    }
  }
}

export function startFulfillmentPoller() {
  console.log(`[poller] starting, checking every ${POLL_INTERVAL_MS / 1000}s`);
  setInterval(pollOnce, POLL_INTERVAL_MS);
}
