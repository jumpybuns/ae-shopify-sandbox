// Shopify Admin GraphQL client.
//
// AUTH: uses the OAuth client-credentials grant (POST
// /admin/oauth/access_token with grant_type=client_credentials), NOT a
// static token — this is the current flow for a Dev Dashboard app as of
// the Jan 2026 custom-app deprecation. The token is cached and
// auto-refreshed (valid ~86399s per Shopify's own response), the same
// pattern as aeClient/aeAuth.js's getValidAccessToken(). Needs
// SHOPIFY_STORE_DOMAIN, SHOPIFY_APP_CLIENT_ID, SHOPIFY_APP_CLIENT_SECRET.
//
// API version pinned to 2026-07 (current stable as of writing) — Shopify
// versions are quarterly and get sunset, so bump ADMIN_API_VERSION when
// upgrading rather than leaving it to drift silently.
const ADMIN_API_VERSION = '2026-07';

// 60s skew, same margin aeClient/tokenStore.js uses, so a token doesn't
// expire mid-request.
const REFRESH_SKEW_MS = 60_000;

let cachedToken = null; // { accessToken, expiresAt }

/**
 * Both Shopify calls below used to do a blind `await res.json()`, which
 * crashes with an unhelpful "Unexpected token '<'" when Shopify (or a
 * proxy/CDN in front of it) returns an HTML error page instead of JSON —
 * exactly what happened on the first live test of this file. This checks
 * the response first and surfaces the real status + a body snippet
 * instead of a generic parse crash.
 */
async function parseJsonResponse(res, context) {
  const text = await res.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error(
      `${context} returned non-JSON (HTTP ${res.status} ${res.statusText}). ` +
      `First 300 chars: ${text.slice(0, 300)}`
    );
  }
  if (!res.ok && !data.errors) {
    // A JSON body with a non-2xx status but no GraphQL-style `errors` key
    // — e.g. a plain {"error":"..."} from the OAuth token endpoint.
    throw new Error(`${context} failed (HTTP ${res.status}): ${JSON.stringify(data)}`);
  }
  return data;
}

function assertConfigured() {
  const domain = process.env.SHOPIFY_STORE_DOMAIN;
  const clientId = process.env.SHOPIFY_APP_CLIENT_ID;
  const clientSecret = process.env.SHOPIFY_APP_CLIENT_SECRET;
  if (!domain || !clientId || !clientSecret) {
    throw new Error('SHOPIFY_STORE_DOMAIN, SHOPIFY_APP_CLIENT_ID, and SHOPIFY_APP_CLIENT_SECRET must all be set');
  }
  return { domain, clientId, clientSecret };
}

async function fetchNewToken() {
  const { domain, clientId, clientSecret } = assertConfigured();

  const res = await fetch(`https://${domain}/admin/oauth/access_token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      grant_type: 'client_credentials',
      client_id: clientId,
      client_secret: clientSecret,
    }),
  });

  const data = await parseJsonResponse(res, 'Shopify client-credentials token request');

  if (!data.access_token) {
    throw new Error(`Shopify client-credentials token request failed: ${JSON.stringify(data)}`);
  }

  cachedToken = {
    accessToken: data.access_token,
    // Shopify returns expires_in in seconds (86399 typically).
    expiresAt: Date.now() + (data.expires_in * 1000) - REFRESH_SKEW_MS,
  };

  return cachedToken.accessToken;
}

async function getAccessToken() {
  if (cachedToken && Date.now() < cachedToken.expiresAt) {
    return cachedToken.accessToken;
  }
  return fetchNewToken();
}

async function graphqlRequest(query, variables) {
  const { domain } = assertConfigured();
  const token = await getAccessToken();

  const res = await fetch(`https://${domain}/admin/api/${ADMIN_API_VERSION}/graphql.json`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Shopify-Access-Token': token,
    },
    body: JSON.stringify({ query, variables }),
  });

  const data = await parseJsonResponse(res, `Shopify GraphQL request (status ${res.status})`);

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

/**
 * Creates or updates a product + its variants in one call via productSet
 * (Shopify's current recommended upsert mutation — confirmed against
 * shopify.dev's own docs for the productSet mutation, Sept 2026).
 *
 * Deliberately does NOT set metafields here — productSet's docs don't
 * clearly confirm variant-level metafield support, and there's an open
 * complaint thread on Shopify's community forum about productSet and
 * metafield behavior changing. setAeMetafields() below uses the
 * separately well-documented metafieldsSet mutation instead, which is
 * confirmed to work on any owner type (Product or ProductVariant).
 *
 * `product` shape:
 *   { title, descriptionHtml?, images: string[], optionName: string,
 *     variants: [{ optionValue, price, sku, inventoryQuantity }] }
 */
export async function createOrUpdateProduct(product) {
  const data = await graphqlRequest(
    `mutation ProductSet($input: ProductSetInput!) {
      productSet(input: $input, synchronous: true) {
        product {
          id
          variants(first: 50) {
            nodes {
              id
              sku
            }
          }
        }
        userErrors {
          field
          message
        }
      }
    }`,
    {
      input: {
        title: product.title,
        descriptionHtml: product.descriptionHtml || '',
        status: 'DRAFT', // review before publishing — don't go live sight-unseen
        files: (product.images || []).map((url) => ({
          originalSource: url,
          contentType: 'IMAGE',
        })),
        productOptions: [
          {
            name: product.optionName,
            values: product.variants.map((v) => ({ name: v.optionValue })),
          },
        ],
        variants: product.variants.map((v) => ({
          price: v.price,
          sku: v.sku,
          optionValues: [{ optionName: product.optionName, name: v.optionValue }],
          inventoryQuantities: [
            {
              locationId: process.env.SHOPIFY_LOCATION_ID,
              name: 'available',
              quantity: v.inventoryQuantity,
            },
          ],
        })),
      },
    }
  );

  const userErrors = data?.productSet?.userErrors || [];
  if (userErrors.length) {
    throw new Error(`productSet userErrors: ${JSON.stringify(userErrors)}`);
  }

  return data.productSet.product;
}

/**
 * Sets up to 25 metafields in one call (Shopify's documented per-call cap).
 * `entries`: [{ ownerId, namespace, key, value, type }]
 */
export async function setMetafields(entries) {
  const data = await graphqlRequest(
    `mutation SetMetafields($metafields: [MetafieldsSetInput!]!) {
      metafieldsSet(metafields: $metafields) {
        metafields { id key namespace }
        userErrors { field message code }
      }
    }`,
    { metafields: entries }
  );

  const userErrors = data?.metafieldsSet?.userErrors || [];
  if (userErrors.length) {
    throw new Error(`metafieldsSet userErrors: ${JSON.stringify(userErrors)}`);
  }

  return data.metafieldsSet.metafields;
}

/**
 * Looks up the AliExpress product id + sku_attr mapping for a given
 * Shopify variant — the read side of the metafields setAeMetafields()
 * writes. orderWorker.js calls this to enrich a raw Shopify line item
 * before handing it to aeClient.placeOrder(), which requires both fields.
 *
 * namespace/key here MUST match what importProduct.mjs writes with
 * setMetafields() — "ae" / "product_id" and "ae" / "sku_attr".
 */
export async function getAeMappingForVariant(variantId) {
  const gid = `gid://shopify/ProductVariant/${variantId}`;

  const data = await graphqlRequest(
    `query GetAeMapping($id: ID!) {
      productVariant(id: $id) {
        skuAttr: metafield(namespace: "ae", key: "sku_attr") { value }
        product {
          productId: metafield(namespace: "ae", key: "product_id") { value }
        }
      }
    }`,
    { id: gid }
  );

  const aeProductId = data?.productVariant?.product?.productId?.value;
  const aeSkuAttr = data?.productVariant?.skuAttr?.value;

  if (!aeProductId || !aeSkuAttr) {
    return null; // caller decides how to handle an unmapped variant
  }

  return { aeProductId, aeSkuAttr };
}

/**
 * Lists the store's fulfillment locations — one-off helper to find the
 * value for SHOPIFY_LOCATION_ID in .env, which createOrUpdateProduct()
 * needs for inventoryQuantities. Not used anywhere else in the pipeline.
 */
export async function listLocations() {
  const data = await graphqlRequest(
    `query ListLocations {
      locations(first: 25) {
        nodes { id name isActive }
      }
    }`
  );
  return data?.locations?.nodes || [];
}
