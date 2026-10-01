import { TransientError, PermanentError } from './errors.js';

// Load the client with a mocked global fetch so we exercise error routing without network/creds.
process.env.AE_APP_KEY = 'k'; process.env.AE_APP_SECRET = 's'; process.env.AE_ACCESS_TOKEN = 't';

let scenario;
global.fetch = async () => {
  const mk = (obj, status=200) => ({ ok: status<400, status, json: async () => obj });
  switch (scenario) {
    case 'throttle':   return mk({ error_response: { code: 'isv.rate-limit', msg: 'qps' } });
    case 'badsign':    return mk({ error_response: { code: 'IncompleteSignature', msg: 'bad sign' } });
    case 'http500':    return mk({}, 500);
    case 'reject':     return mk({ aliexpress_ds_order_create_response: { rsp_code: 15, rsp_msg: 'out of stock' } });
    case 'success':    return mk({ aliexpress_ds_order_create_response: { rsp_code: 200, result: { order_list: { number: [700123] } } } });
    case 'network':    throw new Error('ECONNRESET');
  }
};

const { placeOrder } = await import('./aliexpressClient.js');
const li = [{ aeProductId: 1005001, aeSkuAttr: '14:29', quantity: 1 }];
const addr = { name: 'A B', address1: '1 St', city: 'LA', province: 'CA', country_code: 'US', zip: '90001', phone: '555' };

async function expect(name, sc, Type) {
  scenario = sc;
  try {
    const r = await placeOrder({ shopifyOrderId: 'S1', lineItems: li, address: addr });
    if (Type === 'ok') { console.log(`PASS ${name}: ${JSON.stringify(r)}`); return; }
    console.log(`FAIL ${name}: expected ${Type.name}, got success`);
  } catch (e) {
    const ok = Type !== 'ok' && e instanceof Type;
    console.log(`${ok?'PASS':'FAIL'} ${name}: ${e.name} (${e.code||'-'}) "${e.message}"`);
  }
}

await expect('throttle -> Transient', 'throttle', TransientError);
await expect('bad sign -> Permanent', 'badsign', PermanentError);
await expect('HTTP 500 -> Transient', 'http500', TransientError);
await expect('business reject -> Permanent', 'reject', PermanentError);
await expect('network -> Transient', 'network', TransientError);
await expect('success -> {aeOrderId}', 'success', 'ok');

// unmapped line item -> Permanent, without needing the network
scenario = 'success';
try { await placeOrder({ shopifyOrderId: 'S2', lineItems: [{ sku: 'X' }], address: addr }); console.log('FAIL unmapped'); }
catch (e) { console.log(`${e instanceof PermanentError && e.code==='UNMAPPED_ITEM'?'PASS':'FAIL'} unmapped item -> Permanent: ${e.name} (${e.code})`); }
