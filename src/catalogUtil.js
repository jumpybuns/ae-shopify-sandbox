// src/catalogUtil.js
//
// Pure helpers shared by the importer, the sync tool and the catalog parser.
// No network, no database, so they are safe to import anywhere and to unit test.

/** "M-VAVE", "m‑vave" (non-breaking hyphen!) and "MVave" all normalize alike. */
export function normalizeBrand(s) {
  return String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '');
}

/**
 * Loose match between the brand you asked for and AliExpress's "Brand Name"
 * property (e.g. expected "Mooer", actual "MOOER Audio" -> match). The
 * reverse direction (actual contained in expected) only counts for 3+ chars
 * so a one- or two-letter brand value can't match everything.
 */
export function brandMatches(expected, actual) {
  const e = normalizeBrand(expected);
  const a = normalizeBrand(actual);
  if (!e || !a) return false;
  return a.includes(e) || (a.length >= 3 && e.includes(a));
}

/**
 * Accepts a bare numeric id or a product URL and returns the id string, or
 * null if it can't find one. Handles /item/<id>.html and ?productId=<id>.
 */
export function extractAeId(text) {
  const s = String(text || '').trim();
  if (/^\d{6,}$/.test(s)) return s;
  const m = s.match(/\/item\/(\d{6,})(?:\.html)?/) || s.match(/[?&]productId=(\d{6,})/i);
  return m ? m[1] : null;
}

/**
 * Turns what a person types for "which product" into a lookup key, or null.
 * Accepts: an AliExpress product URL or id, a Shopify GID
 * (gid://shopify/Product/123), or a Shopify admin product URL (.../products/123).
 * A bare number matches either an AliExpress id or a Shopify product id.
 */
export function extractProductKey(text) {
  const s = String(text || '').trim();
  const gid = s.match(/gid:\/\/shopify\/Product\/(\d+)/);
  if (gid) return gid[1];
  const admin = s.match(/admin\.shopify\.com\/.*\/products\/(\d+)/) || s.match(/\.myshopify\.com\/admin\/products\/(\d+)/);
  if (admin) return admin[1];
  return extractAeId(s) || (/^\d{4,}$/.test(s) ? s : null);
}
