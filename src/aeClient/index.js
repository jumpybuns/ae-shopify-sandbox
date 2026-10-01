import * as mockClient from './mockClient.js';
import * as aliexpressClient from './aliexpressClient.js';

// Flip with AE_MODE=real in .env once your AliExpress app is approved and
// you've confirmed the method names/response shapes flagged in
// aliexpressClient.js. Defaults to mock so nothing breaks by omission.
//
// Points at aliexpressClient.js, not the older realClient.js — the newer
// file satisfies client.test.mjs's contract (aeProductId/aeSkuAttr line
// items, the aliexpress_ds_order_create_response envelope, rsp_code
// business-rejection handling) that realClient.js never implemented.
// realClient.js is left in place for reference but is no longer wired in.
const mode = process.env.AE_MODE || 'mock';
const client = mode === 'real' ? aliexpressClient : mockClient;

if (mode === 'real') {
  console.log('[aeClient] running in REAL mode — calls will hit the live AliExpress Open Platform');
} else {
  console.log('[aeClient] running in MOCK mode — calls hit the local mock supplier');
}

export const placeOrder = client.placeOrder;
export const getOrderStatus = client.getOrderStatus;
