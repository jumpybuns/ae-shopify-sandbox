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
  // CONFIRMED against ae_sdk's shipped TypeScript definitions
  // (DS_Get_Order_Params / DS_Get_Order_Result in its dist/index.d.ts) —
  // this replaces the earlier placeholder, which used the wrong method
  // name (aliexpress.ds.order.get) and got a live InvalidApiPath error.
  // The real method has an extra "trade." segment.
  const method = process.env.AE_ORDER_STATUS_METHOD || 'aliexpress.trade.ds.order.get';
  const data = await callApi(method, { order_id: aeOrderId });

  // Envelope name confirmed from the SDK's own type defs: ae_sdk's JS also
  // defensively checks for an alternate spelling
  // (aliexpress_ds_trade_order_get_response) that AliExpress sometimes
  // returns instead — worth keeping in mind if this ever looks empty.
  const envelope = data?.aliexpress_trade_ds_order_get_response
    ?? data?.aliexpress_ds_trade_order_get_response;

  if (!envelope) {
    throw new PermanentError(
      `unexpected response shape — no aliexpress_trade_ds_order_get_response: ${JSON.stringify(data)}`
    );
  }

  // Same business-rejection pattern as placeOrder: rsp_code !== 200 inside
  // an otherwise-200 HTTP response means AliExpress rejected the request
  // itself (e.g. order not found), distinct from a transport/auth failure.
  if (envelope.rsp_code && envelope.rsp_code !== 200 && envelope.rsp_code !== '200') {
    throw new PermanentError(envelope.rsp_msg || 'AliExpress rejected the order status request', envelope.rsp_code);
  }

  const result = envelope.result ?? {};

  // Confirmed field names: order_status / logistics_status are both on the
  // result directly; the tracking number lives one level down, inside
  // logistics_info_list[].logistics_no (there can be more than one
  // logistics record per order — this takes the first).
  return {
    status: result.logistics_status || result.order_status || 'unknown',
    trackingNumber: result.logistics_info_list?.[0]?.logistics_no || null,
  };
}

export async function getProductDetails(aeProductId) {
  // CONFIRMED method + param/response shape against ae_sdk's shipped
  // TypeScript definitions (DS_Product_Params / DS_Product_Result in its
  // dist/index.d.ts) — same evidence-based approach as getOrderStatus.
  const method = process.env.AE_PRODUCT_DETAILS_METHOD || 'aliexpress.ds.product.get';
  const data = await callApi(method, {
    product_id: aeProductId,
    ship_to_country: process.env.AE_SHIP_TO_COUNTRY || 'US',
  });

  const envelope = data?.aliexpress_ds_product_get_response;

  if (!envelope) {
    throw new PermanentError(
      `unexpected response shape — no aliexpress_ds_product_get_response: ${JSON.stringify(data)}`
    );
  }

  if (envelope.rsp_code && envelope.rsp_code !== 200 && envelope.rsp_code !== '200') {
    throw new PermanentError(envelope.rsp_msg || 'AliExpress rejected the product details request', envelope.rsp_code);
  }

  const result = envelope.result ?? {};

  // Escape hatch for the next shape surprise — run with AE_DEBUG=1 to see
  // exactly what AliExpress actually sent back, rather than guessing again.
  if (process.env.AE_DEBUG) {
    console.log('[getProductDetails] raw result:', JSON.stringify(result, null, 2));
  }

  const baseInfo = result.ae_item_base_info_dto ?? {};
  const multimedia = result.ae_multimedia_info_dto ?? {};

  // AliExpress's raw response wraps list fields TOP-protocol style — NOT
  // as a bare array, but as an object keyed by a singular field name, e.g.
  // { ae_item_sku_info_d_t_o: [...] } (and collapsed to a single plain
  // object, not even wrapped in an array, when there's exactly one item).
  // This unwrapping logic is lifted directly from ae_sdk's own
  // extractNestedArray() helper (dist/index.mjs) — confirmed real, not a
  // guess, since that's exactly what caused the first live test to fail
  // with "skuList.map is not a function": the earlier version of this
  // function assumed a bare array.
  function extractNestedArray(obj, nestedKey) {
    if (!obj) return [];
    if (nestedKey in obj && obj[nestedKey]) {
      return Array.isArray(obj[nestedKey]) ? obj[nestedKey] : [obj[nestedKey]].filter(Boolean);
    }
    return [];
  }

  const skuList = extractNestedArray(result.ae_item_sku_info_dtos, 'ae_item_sku_info_d_t_o');

  // image_urls is documented as a single string of multiple URLs.
  // AliExpress's long-standing TOP-protocol convention for this field is
  // semicolon-separated — NOT confirmed against a live response yet, so
  // double check the first real import against what actually comes back
  // before trusting this blindly.
  const images = (multimedia.image_urls || '')
    .split(';')
    .map((s) => s.trim())
    .filter(Boolean);

  const variants = skuList.map((sku) => {
    // CORRECTED after the first live import: sku_attr IS returned as a
    // literal field directly on each sku object — the construct-from-
    // properties logic below was an unnecessary guess that happened to
    // match. Prefer the literal field; fall back to reconstruction only
    // if a future response is ever missing it.
    const props = extractNestedArray(sku.aeop_s_k_u_propertys ?? sku.ae_sku_property_dtos, 'ae_sku_property_d_t_o');
    const skuAttr = sku.sku_attr || props
      .map((p) => `${p.sku_property_id}:${p.property_value_id}`)
      .join(';');

    // PRICING DECISION, not a settled fact — worth your explicit review.
    // The real response has two very different numbers per variant, e.g.
    // sku_price "167.44" vs offer_sale_price "72.00" (and consistently
    // ~40-55% apart on the second variant too). That pattern — a
    // consistently higher "list" number next to a consistently lower
    // "offer" number — matches a crossed-out original price next to an
    // active sale price, so this defaults to offer_sale_price as your
    // actual cost basis. If that's wrong for your account/region, override
    // via AE_PRICE_FIELD=sku_price in .env — don't let this default sit
    // unverified against your first invoice.
    const priceField = process.env.AE_PRICE_FIELD || 'offer_sale_price';
    const price = sku[priceField] ?? sku.offer_sale_price ?? sku.sku_price;

    return {
      skuAttr,
      price,
      listPrice: sku.sku_price,
      offerPrice: sku.offer_sale_price,
      currencyCode: sku.currency_code,
      // CORRECTED: the real field is sku_available_stock, not
      // ipm_sku_stock (which doesn't appear anywhere in a live response —
      // the first import silently reported 0 stock for everything because
      // of this).
      stock: sku.sku_available_stock ?? sku.s_k_u_available_stock ?? 0,
      // Human-readable variant label built from the property names/values
      // (e.g. "Color: Black"), for mapping to a Shopify option value.
      label: props.map((p) => p.sku_property_value).join(' / ') || 'Default',
    };
  });

  return {
    title: baseInfo.subject,
    categoryId: baseInfo.category_id,
    images,
    variants,
  };
}
