import crypto from 'node:crypto';

/**
 * AliExpress Open Platform request signing.
 *
 * Verified directly against the worked examples in AliExpress's own API
 * reference doc (both the "business interface" /sync case and the "system
 * interface" /auth/token/create case) — these are no longer guesses:
 *
 *   - sha256 means HMAC-SHA256 *keyed by the app secret*, over the sorted,
 *     concatenated params. The secret is the HMAC key, NOT wrapped into the
 *     message itself. (The previous version of this function wrapped the
 *     secret into the message AND used it as the HMAC key — double-counting
 *     it — which produces a signature AliExpress's servers reject.)
 *   - md5 is the older TOP-style scheme: plain MD5 of secret+message+secret,
 *     with the secret wrapped on both ends (no HMAC key) — kept as-is since
 *     this one wasn't exercised against a doc example, but it's the
 *     documented legacy TOP convention.
 *   - System interfaces (path-routed calls like /auth/token/create or
 *     /auth/token/refresh) need their request path prepended to the
 *     concatenated string BEFORE hashing — confirmed: the token exchange
 *     only succeeded once apiPath was added. Pass it as `apiPath` for those.
 *   - The method-routed /sync business gateway (placeOrder, getOrderStatus)
 *     must NOT get an apiPath — confirmed directly: adding one made an
 *     otherwise-valid call (once the method name was fixed) fail with
 *     IncompleteSignature. Omit apiPath for these calls.
 */
export function signRequest(params, appSecret, signMethod = 'sha256', apiPath = '') {
  const sortedKeys = Object.keys(params)
    .filter((k) => params[k] !== undefined && params[k] !== null && k !== 'sign')
    .sort();

  const concatenated = sortedKeys.map((k) => `${k}${params[k]}`).join('');
  const message = `${apiPath}${concatenated}`;

  if (signMethod === 'md5') {
    const wrapped = `${appSecret}${message}${appSecret}`;
    return crypto.createHash('md5').update(wrapped, 'utf8').digest('hex').toUpperCase();
  }
  return crypto.createHmac('sha256', appSecret).update(message, 'utf8').digest('hex').toUpperCase();
}
