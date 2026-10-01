// scripts/testOrderStatus.mjs
//
// Throwaway diagnostic — NOT part of the app. Calls getOrderStatus with a
// bogus order id against the REAL AliExpress API (using your now-working
// stored OAuth tokens) to cheaply validate the guessed method name and
// signing path without risking a real placeOrder call.
//
// What the result tells us:
//   - An error like "order not found" / "invalid order id" / a business
//     rsp_code rejection  -> the method name + signing are correct, this ID
//     just doesn't exist. getOrderStatus is good to trust.
//   - An error like "invalid method" / "api not exist" / "isv.not-exist"
//     -> the method name guess (aliexpress.ds.order.get) is wrong and
//     needs to be corrected via AE_ORDER_STATUS_METHOD before relying on it.
//   - A fresh IncompleteSignature error -> something about THIS call's
//     params differs from what placeOrder would send; worth a closer look
//     even though the core signing function is already proven working.
//
// Run with:  node scripts/testOrderStatus.mjs

import 'dotenv/config';
import { getOrderStatus } from '../src/aeClient/aliexpressClient.js';

const BOGUS_ORDER_ID = '000000000000000';

console.log(`[testOrderStatus] calling getOrderStatus('${BOGUS_ORDER_ID}') against the real API...\n`);

try {
  const result = await getOrderStatus(BOGUS_ORDER_ID);
  console.log('✅ Call succeeded (unexpected for a bogus id, but here is the shape):');
  console.log(JSON.stringify(result, null, 2));
} catch (err) {
  console.log(`❌ Call failed as expected — the interesting part is WHICH kind of failure:\n`);
  console.log('name   :', err.name);
  console.log('message:', err.message);
  if (err.code) console.log('code   :', err.code);
  console.log('\nLook at the message/code above:');
  console.log('  - mentions the order/id (not found, invalid, etc) -> method name is correct, move on to placeOrder with confidence');
  console.log('  - mentions the method/api itself (not exist, invalid method, isv.*-not-exist) -> fix AE_ORDER_STATUS_METHOD in .env and retest');
  console.log('  - IncompleteSignature again -> something param-specific to this call differs from the token exchange; paste this output and we\'ll dig in');
}
