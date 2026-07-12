import * as mockClient from './mockClient.js';
import * as realClient from './realClient.js';

// Flip with AE_MODE=real in .env once your AliExpress app is approved and
// you've confirmed the method names/response shapes flagged in
// realClient.js. Defaults to mock so nothing breaks by omission.
const mode = process.env.AE_MODE || 'mock';
const client = mode === 'real' ? realClient : mockClient;

if (mode === 'real') {
  console.log('[aeClient] running in REAL mode — calls will hit the live AliExpress Open Platform');
} else {
  console.log('[aeClient] running in MOCK mode — calls hit the local mock supplier');
}

export const placeOrder = client.placeOrder;
export const getOrderStatus = client.getOrderStatus;
