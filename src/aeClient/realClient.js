import { signRequest } from './signing.js';
import { TransientError, PermanentError } from './errors.js';

// The commonly documented sync gateway for the AliExpress Open Platform.
// CONFIRM against your own app's API console once approved — regional
// gateways can differ (e.g. api-sg vs a China-region endpoint), and this
// is exactly the kind of detail that's only visible once you have real
// developer-console access, not something safe to guess from outside docs.
const API_BASE = process.env.AE_API_BASE_URL || 'https://api-sg.aliexpress.com/sync';

function buildSystemParams(method) {
  return {
    app_key: process.env.AE_APP_KEY,
    method,
    sign_method: process.env.AE_SIGN_METHOD || 'sha256',
    timestamp: Date.now().toString(),
    format: 'json',
    v: '2.0',
    // The per-seller access token from the OAuth-style seller-authorization
    // flow — NOT your app secret. This is what scopes the call to a
    // specific authorized seller account.
    session: process.env.AE_ACCESS_TOKEN,
  };
}

async function callApi(method, businessParams) {
  const systemParams = buildSystemParams(method);
  const allParams = { ...systemParams, ...businessParams };
  const sign = signRequest(allParams, process.env.AE_APP_SECRET, systemParams.sign_method);

  const body = new URLSearchParams({ ...allParams, sign });

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10000);

  let response;
  try {
    response = await fetch(API_BASE, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
      signal: controller.signal,
    });
  } catch (err) {
    throw new TransientError(`transport error calling AliExpress: ${err.message}`);
  } finally {
    clearTimeout(timeout);
  }

  const data = await response.json().catch(() => {
    throw new TransientError('AliExpress returned a non-JSON response');
  });

  // TOP-derived APIs return errors as HTTP 200 with an error_response body,
  // not as an HTTP error status — has to be checked explicitly, not via
  // response.ok.
  if (data.error_response) {
    const { code, msg, sub_code } = data.error_response;
    // Rate-limit / throttling errors are the classic "actually transient"
    // case here — CONFIRM the real sub_code values for this against your
    // docs once you're getting live errors; this is a reasonable starting
    // guess, not a verified list.
    const isLikelyTransient = /flow|frequency|throttl|rate.?limit/i.test(sub_code || msg || '');
    if (isLikelyTransient) {
      throw new TransientError(`AliExpress rate-limited the request: ${msg}`);
    }
    throw new PermanentError(msg || 'AliExpress API error', code || sub_code);
  }

  return data;
}

export async function placeOrder({ shopifyOrderId, lineItems, address }) {
  // PLACEHOLDER METHOD NAME — pull the real DS (dropshipper) order-creation
  // method name from your approved app's API reference once you have
  // console access. Naming pattern for TOP-derived methods is typically
  // `aliexpress.<domain>.<action>`, but guessing the exact string here
  // would be worse than leaving it explicit and overridable.
  const method = process.env.AE_PLACE_ORDER_METHOD || 'aliexpress.trade.ds.order.create';

  const businessParams = {
    logistics_address: JSON.stringify({
      contact_person: address.contact_name,
      address: address.street_address,
      city: address.city,
      province: address.province_code,
      country: address.country_code,
      zip: address.postal_code,
      mobile_no: address.phone || '',
    }),
    product_items: JSON.stringify(
      lineItems.map((li) => ({
        product_id: li.ae_sku_id,
        product_count: li.quantity,
      }))
    ),
    // Many DS-style order-creation APIs accept an idempotency key so the
    // SUPPLIER side also protects against duplicate submission, not just
    // your own worker. CONFIRM the real param name for this — out_order_id
    // is a common pattern on TOP-derived trade APIs but not guaranteed.
    out_order_id: shopifyOrderId,
  };

  const data = await callApi(method, businessParams);

  // PLACEHOLDER RESPONSE SHAPE — update this line once you can see a real
  // response body. TOP-derived APIs typically nest the result under a key
  // named after the method (e.g. aliexpress_trade_ds_order_create_response),
  // so this almost certainly needs adjusting.
  const aeOrderId =
    data?.aliexpress_trade_ds_order_create_response?.result?.order_id ??
    data?.result?.order_id;

  if (!aeOrderId) {
    throw new PermanentError('AliExpress order placed but no order_id found in response — check response shape');
  }

  return { aeOrderId };
}

export async function getOrderStatus(aeOrderId) {
  // PLACEHOLDER METHOD NAME — same caveat as above.
  const method = process.env.AE_ORDER_STATUS_METHOD || 'aliexpress.trade.ds.order.get';
  const data = await callApi(method, { order_id: aeOrderId });

  // PLACEHOLDER RESPONSE SHAPE — same caveat as above.
  const result =
    data?.aliexpress_trade_ds_order_get_response?.result ?? data?.result ?? {};

  return {
    status: result.status || 'unknown',
    trackingNumber: result.tracking_number || null,
  };
}
