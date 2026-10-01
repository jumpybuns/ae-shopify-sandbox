// aeAuth.js
// Owns: exchanging a code for tokens, refreshing before expiry, and handing
// the rest of the app a *currently valid* access token.
//
// This hand-rolls the token exchange rather than depending on ae_sdk's
// system client — ae_sdk@0.6.0 (the version installed for this project)
// only exports AffiliateClient and DropshipperClient. There is no
// AESystemClient, and neither exported class has generateToken/
// refreshToken. That mismatch between the package's README and its
// actually-shipped code is what blocked this file before.
//
// The token endpoints ARE documented directly on AliExpress's own API
// reference (openservice.aliexpress.com/doc/api.htm, "System Tool"
// section), so hand-rolling against the already-verified `signRequest`
// is more reliable than depending on an SDK whose docs don't match its
// code.

import { signRequest } from './signing.js';
import { saveTokens, getTokens, isExpired } from './tokenStore.js';

// CONFIRM this exact path against your API console once you can see it.
// AliExpress's own reference documents the endpoints as "/auth/token/create"
// and "/auth/token/refresh" — REST-style system-tool calls, distinct from
// the method-parameter /sync gateway used for business calls like
// placeOrder. The /rest prefix on the same api-sg host is the common
// convention for this family of international-platform APIs, but this is
// the one remaining unconfirmed detail in the whole auth flow — verify it
// against a real request/response rather than trusting this default.
const TOKEN_CREATE_URL =
  process.env.AE_TOKEN_CREATE_URL || 'https://api-sg.aliexpress.com/rest/auth/token/create';
const TOKEN_REFRESH_URL =
  process.env.AE_TOKEN_REFRESH_URL || 'https://api-sg.aliexpress.com/rest/auth/token/refresh';

function buildParams(extra) {
  return {
    app_key: process.env.AE_APP_KEY,
    sign_method: process.env.AE_SIGN_METHOD || 'sha256',
    timestamp: Date.now().toString(),
    ...extra,
  };
}

async function tokenRequest(url, extra) {
  const params = buildParams(extra);

  // These are AliExpress "system interface" (path-routed) endpoints, not
  // the method-routed /sync business gateway — per signing.js, those
  // require the request's API path prepended to the signing string.
  // Omitting this (as the previous version did) produces a signature
  // AliExpress rejects with IncompleteSignature.
  const apiPath = new URL(url).pathname.replace(/^\/rest/, '');
  const sign = signRequest(params, process.env.AE_APP_SECRET, params.sign_method, apiPath);
  const signedParams = { ...params, sign };

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(signedParams),
  });

  const data = await res.json();

  if (data.error_response) {
    throw new Error(`AE token request failed: ${data.error_response.msg || JSON.stringify(data.error_response)}`);
  }

  // Field names come straight from AliExpress's own documented response:
  // access_token / refresh_token / expires_in / refresh_expires_in.
  const { access_token: accessToken, refresh_token: refreshToken, expires_in: expiresInSeconds } = data;

  if (!accessToken || !refreshToken) {
    throw new Error(`AE token response missing access_token/refresh_token — got: ${JSON.stringify(data)}`);
  }

  return { accessToken, refreshToken, expiresInSeconds: expiresInSeconds ?? 86400 };
}

/** One-time: exchange the seller-consent code (from authorize.js's callback) for the first token pair. */
export async function exchangeCode(code) {
  const tokens = await tokenRequest(TOKEN_CREATE_URL, { code });
  saveTokens(tokens);
  return tokens;
}

/** Refresh using the stored refresh_token. */
export async function refresh() {
  const current = getTokens();
  if (!current) {
    throw new Error('No stored tokens to refresh — run authorize.js once first');
  }
  const tokens = await tokenRequest(TOKEN_REFRESH_URL, { refresh_token: current.refresh_token });
  saveTokens(tokens);
  return tokens;
}

/**
 * The function the rest of the app calls. Returns a valid access token,
 * refreshing transparently first if the stored one has expired.
 */
export async function getValidAccessToken() {
  const row = getTokens();
  if (!row) {
    throw new Error('AliExpress not authorized yet — run authorize.js once');
  }
  if (isExpired(row)) {
    const refreshed = await refresh();
    return refreshed.accessToken;
  }
  return row.access_token;
}
