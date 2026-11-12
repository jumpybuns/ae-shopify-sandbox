// Shared price math for the importer and scripts/setPrice.mjs.
// markup is a multiplier: 1 sells at the AliExpress cost, 1.4 adds 40%.

/** AliExpress price string times markup, as a Shopify decimal. Null if the price is unusable. */
export function markedUpPrice(raw, markup) {
  const n = parseFloat(raw);
  const factor = Number(markup);
  if (!Number.isFinite(n) || n <= 0) return null;
  if (!Number.isFinite(factor) || factor <= 0) return null;
  return (n * factor).toFixed(2);
}

/**
 * The AliExpress variant that belongs to a Shopify variant.
 * sku_attr is the stable key written at import. A single-variant listing
 * is marked no_sku_attr instead. The SKU AE-<id>-<index> is only a fallback
 * when that metafield was not stored.
 */
export function matchAeVariant(shopifyVariant, aeVariants, aeProductId) {
  const list = Array.isArray(aeVariants) ? aeVariants : [];
  if (shopifyVariant.skuAttr) {
    return list.find((v) => v.skuAttr === shopifyVariant.skuAttr) || null;
  }
  if (shopifyVariant.noSkuAttr && list.length === 1) return list[0];
  const m = String(shopifyVariant.sku || '').match(/^AE-(\d+)-(\d+)$/);
  if (m && m[1] === String(aeProductId)) return list[Number(m[2])] || null;
  return null;
}
