import 'dotenv/config';
import { createShopifyWebhookApp } from './shopifyWebhook.js';
import { createMockAliExpressApp } from './mockAliExpress.js';
import { processOrder } from './orderWorker.js';
import { startFulfillmentPoller } from './fulfillmentPoller.js';
import { enqueue } from './queue.js';

const SHOPIFY_PORT = process.env.SHOPIFY_WEBHOOK_PORT || 4000;
const MOCK_AE_PORT = process.env.MOCK_AE_PORT || 4001;

// --- Mock AliExpress ("the supplier") ---
const mockAe = createMockAliExpressApp();
mockAe.listen(MOCK_AE_PORT, () => {
  console.log(`[mock-ae] listening on http://localhost:${MOCK_AE_PORT}`);
  console.log(`[mock-ae] admin page: http://localhost:${MOCK_AE_PORT}/mock-ae/admin`);
});

// --- Shopify webhook receiver ("your app") ---
const shopifyApp = createShopifyWebhookApp({
  secret: process.env.SHOPIFY_WEBHOOK_SECRET || 'dev_secret_change_me',
  onOrderCreate: (payload) => {
    enqueue({
      payload,
      retries: 3,
      handler: processOrder,
    });
  },
});
shopifyApp.listen(SHOPIFY_PORT, () => {
  console.log(`[shopify-webhook] listening on http://localhost:${SHOPIFY_PORT}`);
  console.log(`[shopify-webhook] webhook endpoint: http://localhost:${SHOPIFY_PORT}/webhooks/orders/create`);
});

// --- Fulfillment poller ---
startFulfillmentPoller();

console.log('\nAll set. Try: npm run test-webhook\n');
