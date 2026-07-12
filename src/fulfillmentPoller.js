import db from './db.js';
import { getOrderStatus } from './aeClient/index.js';
import { getOpenFulfillmentOrderId, createFulfillment } from './shopifyAdminClient.js';

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

  try {
    const fulfillmentOrderId = await getOpenFulfillmentOrderId(shopifyOrderId);
    const fulfillment = await createFulfillment(fulfillmentOrderId, { trackingNumber });
    console.log(
      `[poller] Shopify order ${shopifyOrderId} fulfilled — fulfillment ${fulfillment.id}, status ${fulfillment.status}`
    );
  } catch (err) {
    // Deliberately NOT rethrown — a failed fulfillment push shouldn't undo
    // the fact that the supplier already shipped it. This should surface
    // somewhere a human will see it (log aggregation, alerting) rather
    // than silently retry forever, since the same query error will likely
    // repeat identically on every poll cycle otherwise.
    console.error(`[poller] failed to push fulfillment for order ${shopifyOrderId}:`, err.message);
  }
}

async function pollOnce() {
  const processingOrders = db.prepare("SELECT * FROM orders WHERE status = 'processing'").all();

  for (const order of processingOrders) {
    try {
      const { status, trackingNumber } = await getOrderStatus(order.ae_order_id);

      if (status === 'shipped') {
        db.prepare(
          "UPDATE orders SET status = 'shipped', updated_at = datetime('now') WHERE shopify_order_id = ?"
        ).run(order.shopify_order_id);
        console.log(`[poller] order ${order.shopify_order_id} shipped, tracking ${trackingNumber}`);
        await pushFulfillmentToShopify(order.shopify_order_id, trackingNumber);
      }
    } catch (err) {
      // Transient errors here are fine to just log and retry on the next
      // poll cycle — no need to update order state for a single failed
      // status check.
      console.error(`[poller] error checking order ${order.shopify_order_id}:`, err.message);
    }
  }
}

export function startFulfillmentPoller() {
  console.log(`[poller] starting, checking every ${POLL_INTERVAL_MS / 1000}s`);
  setInterval(pollOnce, POLL_INTERVAL_MS);
}
