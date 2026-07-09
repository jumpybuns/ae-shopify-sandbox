import 'dotenv/config';
import crypto from 'node:crypto';

// Usage:
//   npm run test-webhook                    -> simulates a normal successful order
//   npm run test-webhook -- out_of_stock    -> simulates AliExpress rejecting for stock
//   npm run test-webhook -- address_rejected
//   npm run test-webhook -- timeout
//   npm run test-webhook -- duplicate       -> sends the SAME webhook id twice, to
//                                              prove the idempotency check works

const simulate = process.argv[2] || 'success';
const port = process.env.SHOPIFY_WEBHOOK_PORT || 4000;
const secret = process.env.SHOPIFY_WEBHOOK_SECRET || 'dev_secret_change_me';

function buildPayload(orderId) {
  // 'duplicate' is a webhook-delivery test, not a supplier behavior —
  // the underlying AliExpress order should place normally either way.
  const aeSimulate = simulate === 'duplicate' ? 'success' : simulate;
  return {
    id: orderId,
    name: `#100${orderId}`,
    simulate: aeSimulate,
    line_items: [
      { ae_sku_id: 'AE-PEDAL-001', title: 'Fuzz Pedal Clone', quantity: 1 },
    ],
    shipping_address: {
      address1: '123 Main St',
      city: 'Vancouver',
      province: 'WA',
      zip: '98660',
      country: 'US',
    },
  };
}

async function sendWebhook(orderId, webhookId) {
  const payload = buildPayload(orderId);
  const rawBody = Buffer.from(JSON.stringify(payload));
  const hmac = crypto.createHmac('sha256', secret).update(rawBody).digest('base64');

  const res = await fetch(`http://localhost:${port}/webhooks/orders/create`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Shopify-Hmac-Sha256': hmac,
      'X-Shopify-Webhook-Id': webhookId,
      'X-Shopify-Topic': 'orders/create',
    },
    body: rawBody,
  });

  console.log(`webhook ${webhookId} -> HTTP ${res.status}: ${await res.text()}`);
}

const orderId = Math.floor(Math.random() * 1e6);
const webhookId = crypto.randomUUID();

await sendWebhook(orderId, webhookId);

if (simulate === 'duplicate') {
  console.log('sending the exact same webhook id again to test dedupe...');
  await sendWebhook(orderId, webhookId); // same id on purpose
}
