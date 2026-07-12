// Minimal Shopify Admin GraphQL client for the one thing the fulfillment
// poller needs: turn a Shopify order id + tracking number into a real
// fulfillment on the order.
//
// API version pinned to 2026-07 (current stable as of writing) — Shopify
// versions are quarterly and get sunset, so bump ADMIN_API_VERSION when
// upgrading rather than leaving it to drift silently.
const ADMIN_API_VERSION = '2026-07';

function assertConfigured() {
  const domain = process.env.SHOPIFY_STORE_DOMAIN;
  const token = process.env.SHOPIFY_ADMIN_ACCESS_TOKEN;
  if (!domain || !token) {
    throw new Error('SHOPIFY_STORE_DOMAIN and SHOPIFY_ADMIN_ACCESS_TOKEN must both be set');
  }
  return { domain, token };
}

async function graphqlRequest(query, variables) {
  const { domain, token } = assertConfigured();

  const res = await fetch(`https://${domain}/admin/api/${ADMIN_API_VERSION}/graphql.json`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Shopify-Access-Token': token,
    },
    body: JSON.stringify({ query, variables }),
  });

  const data = await res.json();

  if (data.errors) {
    // Top-level GraphQL errors (bad query, missing scope, auth failure) —
    // distinct from userErrors, which are business-logic validation errors
    // returned inside a successful response.
    throw new Error(`Shopify GraphQL error: ${JSON.stringify(data.errors)}`);
  }

  return data.data;
}

/**
 * Finds the first open (unfulfilled) fulfillment order for a Shopify order.
 * Requires the app to have a fulfillment-order read scope — if this comes
 * back empty on a real order that clearly has unfulfilled items, that's
 * usually a missing-scope issue, not a bug in this query (a known rough
 * edge in Shopify's own API per their community forum).
 */
export async function getOpenFulfillmentOrderId(shopifyOrderId) {
  const gid = `gid://shopify/Order/${shopifyOrderId}`;

  const data = await graphqlRequest(
    `query GetFulfillmentOrders($id: ID!) {
      order(id: $id) {
        fulfillmentOrders(first: 5) {
          nodes {
            id
            status
          }
        }
      }
    }`,
    { id: gid }
  );

  const nodes = data?.order?.fulfillmentOrders?.nodes || [];
  const open = nodes.find((n) => n.status === 'OPEN');

  if (!open) {
    throw new Error(
      `no OPEN fulfillment order found for Shopify order ${shopifyOrderId} (found: ${nodes.map((n) => n.status).join(', ') || 'none'})`
    );
  }

  return open.id;
}

/**
 * Creates a fulfillment with tracking info for a given fulfillment order.
 * Uses fulfillmentCreate (not fulfillmentCreateV2, which Shopify's docs
 * mark deprecated in favor of this one — same input shape either way).
 */
export async function createFulfillment(fulfillmentOrderId, { trackingNumber, carrierName = 'AliExpress Standard Shipping' }) {
  const data = await graphqlRequest(
    `mutation CreateFulfillment($fulfillment: FulfillmentInput!) {
      fulfillmentCreate(fulfillment: $fulfillment) {
        fulfillment {
          id
          status
        }
        userErrors {
          field
          message
        }
      }
    }`,
    {
      fulfillment: {
        lineItemsByFulfillmentOrder: [{ fulfillmentOrderId }],
        trackingInfo: {
          company: carrierName,
          number: trackingNumber,
        },
        notifyCustomer: true,
      },
    }
  );

  const userErrors = data?.fulfillmentCreate?.userErrors || [];
  if (userErrors.length) {
    throw new Error(`fulfillmentCreate userErrors: ${JSON.stringify(userErrors)}`);
  }

  return data.fulfillmentCreate.fulfillment;
}
