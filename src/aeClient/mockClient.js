import { TransientError, PermanentError } from './errors.js';

const AE_BASE_URL = process.env.MOCK_AE_BASE_URL || 'http://localhost:4001';

export async function placeOrder({ shopifyOrderId, lineItems, address, simulate }) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5000);

  let response;
  try {
    response = await fetch(`${AE_BASE_URL}/mock-ae/order`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        shopify_order_id: shopifyOrderId,
        line_items: lineItems,
        address,
        simulate,
      }),
      signal: controller.signal,
    });
  } catch (err) {
    throw new TransientError(`transport error: ${err.message}`);
  } finally {
    clearTimeout(timeout);
  }

  if (response.status === 201) {
    const data = await response.json();
    return { aeOrderId: data.ae_order_id };
  }

  const errorBody = await response.json().catch(() => ({}));
  throw new PermanentError(errorBody.error || `HTTP ${response.status}`, errorBody.error);
}

export async function getOrderStatus(aeOrderId) {
  const res = await fetch(`${AE_BASE_URL}/mock-ae/order/${aeOrderId}/status`);
  if (!res.ok) {
    throw new TransientError(`status check failed: HTTP ${res.status}`);
  }
  const data = await res.json();
  return { status: data.status, trackingNumber: data.tracking_number };
}
