// aliexpressClient.js
// The "next" real AliExpress client — supersedes realClient.js. Built to
// satisfy a pre-existing test (client.test.mjs) that predates this file
// and encodes real, specific evidence about the actual API shape:
//   - line items keyed by aeProductId/aeSkuAttr (the real ae_sdk
//     DropshipperClient.createOrder shape, confirmed against its GitHub
//     usage example — not the ae_sku_id guess in realClient.js)
//   - response envelope aliexpress_ds_order_create_response, with an
//     internal rsp_code/rsp_msg for BUSINESS-level rejections (out of
//     stock, etc) — distinct from the top-level error_response used for
//     auth/signature-level failures
//   - order id lives at result.order_list.number[0]
//   - an UNMAPPED_ITEM permanent error when a line item has no AliExpress
//     product mapping at all
//
// Token handling goes through aeAuth.js's getValidAccessToken(), which
// auto-refreshes — the wiring change described in realClient-change.md,
// applied here rather than left as a note.
//
// CONFIRM the exact method name and response shape against your first
// real order once you're live — this reconciles the best available
// evidence, but nothing here has been exercised against the real API yet.

import { signRequest } from './signing.js';
import { TransientError, PermanentError } from './errors.js';
import { getValidAccessToken } from './aeAuth.js';

const API_BASE = process.env.AE_API_BASE_URL || 'https://api-sg.aliexpress.com/sync';

async function resolveAccessToken() {
  try {
    return await getValidAccessToken();
  } catch (err) {
    // Fallback for local/unit testing or a manual override before the
    // OAuth flow has been run once — once authorize.js has run, the
    // stored, auto-refreshing token takes precedence automatically since
    // getValidAccessToken() above succeeds and this branch is never hit.
    if (process.env.AE_ACCESS_TOKEN) {
      return process.env.AE_ACCESS_TOKEN;
    }
    throw err;
  }
}

async function buildSystemParams(method) {
  return {
    app_key: process.env.AE_APP_KEY,
    method,
    sign_method: process.env.AE_SIGN_METHOD || 'sha256',
    timestamp: Date.now().toString(),
    format: 'json',
    v: '2.0',
    session: await resolveAccessToken(),
  };
}

async function callApi(method, businessParams) {
  const systemParams = await buildSystemParams(method);
  const allParams = { ...systemParams, ...businessParams };
  // NOT prepending apiPath here, unlike the system/auth endpoints in
  // aeAuth.js. Tested directly: adding apiPath='/sync' caused a working
  // method (aliexpress.ds.trade.order.get) to fail with IncompleteSignature,
  // where it previously got past signature validation fine (failing later,
  // on InvalidApiPath, for an unrelated reason — a bad method name). So for
  // this method-routed gateway, the signed message must NOT include a path.
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

  // 5xx and 429 are retryable at the HTTP layer.
  if (response.status >= 500 || response.status === 429) {
    throw new TransientError(`AE HTTP ${response.status}`);
  }

  const data = await response.json().catch(() => {
    throw new TransientError('AliExpress returned a non-JSON response');
  });

  // TOP-derived APIs return AUTH/SIGNATURE-level errors as HTTP 200 with
  // an error_response body, not as an HTTP error status.
  if (data.error_response) {
    const { code, msg, sub_code } = data.error_response;
    // Check code, sub_code, AND msg together — AliExpress may put the
    // meaningful signal in any of the three (e.g. code: 'isv.rate-limit'
    // with an unrelated-looking msg like 'qps'), so checking only one
    // field at a time misses real matches.
    const isLikelyTransient = /flow|frequency|throttl|rate.?limit/i.test(
      [code, sub_code, msg].filter(Boolean).join(' ')
    );
    if (isLikelyTransient) {
      throw new TransientError(`AliExpress rate-limited the request: ${msg}`);
    }
    throw new PermanentError(msg || 'AliExpress API error', code || sub_code);
  }

  return data;
}

function assertMapped(lineItems) {
  const unmapped = lineItems.find((li) => !li.aeProductId || !li.aeSkuAttr);
  if (unmapped) {
    throw new PermanentError(
      `line item missing AliExpress product mapping (aeProductId/aeSkuAttr): ${JSON.stringify(unmapped)}`,
      'UNMAPPED_ITEM'
    );
  }
}

export async function placeOrder({ shopifyOrderId, lineItems, address }) {
  // Checked BEFORE any network call — an unmapped item can't succeed no
  // matter what, so there's no reason to spend a round-trip finding out.
  assertMapped(lineItems);

  const method = process.env.AE_PLACE_ORDER_METHOD || 'aliexpress.ds.order.create';

  const businessParams = {
    // Shape confirmed against ae_sdk's real DropshipperClient.createOrder
    // usage example — full_name/mobile_no, not contact_person, is what
    // the actual SDK sends.
    logistics_address: JSON.stringify({
      full_name: address.contact_name,
      address: address.street_address,
      city: address.city,
      province: address.province_code,
      country: address.country_code,
      zip: address.postal_code,
      mobile_no: address.phone || '',
    }),
    product_items: JSON.stringify(
      lineItems.map((li) => ({
        product_id: li.aeProductId,
        sku_attr: li.aeSkuAttr,
        product_count: li.quantity,
      }))
    ),
    // Idempotency key so the SUPPLIER side also protects against
    // duplicate submission, not just our own worker — CONFIRM this param
    // name against a real response; out_order_id is a common pattern on
    // TOP-derived trade APIs but not yet verified for this one.
    out_order_id: shopifyOrderId,
  };

  const data = await callApi(method, businessParams);

  // The envelope name follows AliExpress's method-name convention (dots
  // become underscores, "_response" appended) — confirmed via the
  // pre-written test this file satisfies, not a fresh guess.
  const envelope = data?.aliexpress_ds_order_create_response;

  if (!envelope) {
    throw new PermanentError(
      `unexpected response shape — no aliexpress_ds_order_create_response: ${JSON.stringify(data)}`
    );
  }

  // Business-level rejections (out of stock, etc) come back as HTTP 200
  // with a SUCCESSFUL envelope but rsp_code !== 200 inside it — distinct
  // from the top-level error_response used for auth/signature failures.
  // This is the detail that would have silently treated a rejected order
  // as a success under the old realClient.js.
  if (envelope.rsp_code !== 200) {
    throw new PermanentError(envelope.rsp_msg || 'AliExpress rejected the order', envelope.rsp_code);
  }

  const aeOrderId = envelope.result?.order_list?.number?.[0];
  if (!aeOrderId) {
    throw new PermanentError('AliExpress order placed but no order number found in response — check response shape');
  }

  return { aeOrderId: String(aeOrderId) };
}

export async function getOrderStatus(aeOrderId) {
  // CONFIRMED against a real call: 'aliexpress.ds.order.get' (the previous
  // guess) doesn't exist and fails with InvalidApiPath before signature is
  // even checked. 'aliexpress.ds.trade.order.get' is a real, documented
  // dropshipper method that takes a flat order_id param (matching what this
  // function already sends) and returned a real envelope on a live call.
  const method = process.env.AE_ORDER_STATUS_METHOD || 'aliexpress.ds.trade.order.get';
  const data = await callApi(method, { order_id: aeOrderId });

  // Envelope key follows AliExpress's method-name convention (dots become
  // underscores, "_response" appended) — same convention placeOrder relies
  // on, but derived from the actual method here since AE_ORDER_STATUS_METHOD
  // is overridable and a hardcoded key would silently break if it's changed.
  const envelopeKey = `${method.replace(/\./g, '_')}_response`;
  const envelope = data?.[envelopeKey] ?? {};
  const result = envelope.result ?? {};

  // Field names per AliExpress's documented aliexpress.ds.trade.order.get
  // response shape: result.order_status / result.logistics_status, and a
  // logistics_info_list array (first entry's logistics_no) rather than a
  // single tracking_number/logistics_no field.
  const logisticsInfo = result.logistics_info_list?.ae_order_logistics_info?.[0]
    ?? result.logistics_info_list?.[0];

  return {
    status: result.order_status || result.logistics_status || 'unknown',
    trackingNumber: logisticsInfo?.logistics_no || null,
  };
}
