import crypto from 'node:crypto';

/**
 * AliExpress Open Platform request signing.
 *
 * AliExpress's Open Platform is a descendant of Taobao Open Platform (TOP),
 * and inherits its signing scheme: sort every request parameter (system +
 * business) alphabetically by key, concatenate as `key1value1key2value2...`
 * with no separators, wrap the secret on both ends, then hash.
 *
 * `sign_method` is issued per-app in your API console — it'll say either
 * `md5` or `hmac-sha256` (sha256 is the more common current default, which
 * is why it's the default here). CONFIRM which one your approved app
 * actually uses before going live; this is a one-line change either way.
 */
export function signRequest(params, appSecret, signMethod = 'sha256') {
  const sortedKeys = Object.keys(params)
    .filter((k) => params[k] !== undefined && params[k] !== null && k !== 'sign')
    .sort();

  const concatenated = sortedKeys.map((k) => `${k}${params[k]}`).join('');
  const base = `${appSecret}${concatenated}${appSecret}`;

  if (signMethod === 'md5') {
    return crypto.createHash('md5').update(base, 'utf8').digest('hex').toUpperCase();
  }
  return crypto.createHmac('sha256', appSecret).update(base, 'utf8').digest('hex').toUpperCase();
}
