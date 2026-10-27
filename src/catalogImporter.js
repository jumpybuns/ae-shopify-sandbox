// src/catalogImporter.js
//
// Shared import logic for scripts/importProduct.mjs (one product) and
// scripts/importCatalog.mjs (a whole catalog file of brands). Everything
// that decides "should this product be imported, and how" lives here so the
// two scripts can't drift apart.
//
// importAeProduct() never throws for a product-level problem — it returns a
// result object ({ status: 'created' | 'dry-run' | 'skipped' | 'failed', ... })
// so a batch run can keep going and report everything at the end. Only
// programmer errors (bad arguments) throw.
//
// NO PRICING MARKUP unless IMPORT_MARKUP is set (e.g. IMPORT_MARKUP=1.8).
// That is a business decision, not something to default silently.

import { getProductDetails } from './aeClient/aliexpressClient.js';
import { createOrUpdateProduct, setMetafields, findProductByAeId, activateAndPublish } from './shopifyAdminClient.js';
import { shortTitle, descriptionFromTitle } from './productText.js';

// Shopify's variants(first:) page limit — the importer reads variants back
// from the productSet response, so more than this can't be mapped in one go.
const MAX_VARIANTS = 250;
// metafieldsSet accepts at most 25 entries per call.
const METAFIELD_BATCH = 25;
// Shopify's product title limit.
const MAX_TITLE = 255;

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

function truncateTitle(title) {
  const t = String(title || '').trim();
  if (t.length <= MAX_TITLE) return t;
  const cut = t.slice(0, MAX_TITLE - 1);
  const lastSpace = cut.lastIndexOf(' ');
  return (lastSpace > 120 ? cut.slice(0, lastSpace) : cut).trim() + '…';
}

function parseMarkup() {
  const raw = process.env.IMPORT_MARKUP;
  if (!raw) return 1;
  const n = parseFloat(raw);
  if (!Number.isFinite(n) || n <= 0) {
    throw new Error(`IMPORT_MARKUP must be a positive number, got "${raw}"`);
  }
  return n;
}

/**
 * Imports one AliExpress product as a DRAFT Shopify product.
 *
 * options:
 *   expectedBrand  brand you expect (from the catalog section). Skips the
 *                  product if AliExpress's Brand Name doesn't match.
 *   dryRun         do every check, but write nothing to Shopify.
 *   force          import even if the brand is missing/mismatched.
 *   seen           Set of AliExpress ids already handled in this run.
 */
export async function importAeProduct(inputId, options = {}) {
  const { expectedBrand = null, dryRun = false, force = false, publish = false, seen = new Set() } = options;
  const result = { inputId: String(inputId), status: 'failed', reason: '' };

  try {
    const markup = parseMarkup();
    const shopCurrency = process.env.SHOP_CURRENCY || 'USD';

    const ae = await getProductDetails(inputId);
    const aeProductId = ae.productId;
    Object.assign(result, {
      aeProductId,
      title: ae.title,
      brand: ae.brand,
      storeName: ae.storeName,
      variantCount: ae.variants.length,
    });

    const skip = (reason) => {
      result.status = 'skipped';
      result.reason = reason;
      return result;
    };

    if (seen.has(aeProductId)) return skip('already handled earlier in this run');

    // --- Brand check -------------------------------------------------
    if (expectedBrand && !force) {
      if (!ae.brand) {
        return skip(`no "Brand Name" property on the listing (expected ${expectedBrand}); re-run with --force to import anyway`);
      }
      if (!brandMatches(expectedBrand, ae.brand)) {
        return skip(`brand is "${ae.brand}" (store: ${ae.storeName}), expected ${expectedBrand}; re-run with --force to import anyway`);
      }
    }

    // --- Sanity checks on the AE data --------------------------------
    if (!ae.title) return skip('listing has no title');
    if (ae.variants.length === 0) return skip('listing has no purchasable variants');
    if (ae.variants.length > MAX_VARIANTS) {
      return skip(`${ae.variants.length} variants exceeds the ${MAX_VARIANTS} this importer can map`);
    }
    const badCurrency = ae.variants.find((v) => v.currencyCode && v.currencyCode !== shopCurrency);
    if (badCurrency) {
      return skip(`variant priced in ${badCurrency.currencyCode} but the store currency is ${shopCurrency} (set SHOP_CURRENCY if that's wrong); no conversion is done`);
    }
    const emptySku = ae.variants.filter((v) => !v.skuAttr);
    // Exception: a listing with exactly ONE variant and a real sku_id is a
    // single-SKU item with nothing to choose (confirmed shape: sku_attr "",
    // id "", no property block, sku_id present). Imported with no_sku_attr.
    const singleSku = ae.variants.length === 1 && emptySku.length === 1 && emptySku[0].skuId;
    if (emptySku.length && !singleSku) {
      return skip(
        `${emptySku.length} of ${ae.variants.length} variant(s) have an empty sku_attr` +
        ` (AE sku_id: ${emptySku.map((v) => v.skuId ?? '?').slice(0, 3).join(', ')});` +
        ' placeOrder needs sku_attr to say which variant to buy. Inspect with: node scripts/inspectSku.mjs ' + aeProductId
      );
    }
    const prices = ae.variants.map((v) => parseFloat(v.price));
    if (prices.some((p) => !Number.isFinite(p) || p <= 0)) {
      return skip('a variant has a missing or non-positive price');
    }
    const labels = ae.variants.map((v, i) => v.label || `Variant ${i + 1}`);
    if (new Set(labels).size !== labels.length) {
      return skip('two variants share the same option label; Shopify would reject the option values');
    }

    // --- Duplicate protection ----------------------------------------
    const existing = await findProductByAeId(aeProductId);
    if (existing) {
      result.shopifyId = existing.id;
      if (existing.mappedAeId === aeProductId) {
        return skip(`already imported as ${existing.id} (${existing.status})`);
      }
      return skip(
        `a Shopify product with SKU AE-${aeProductId}-0 exists (${existing.id}) but has no ae_sync.product_id mapping; ` +
        'delete or fix it in Shopify admin first, otherwise orders for it would fail'
      );
    }

    if (dryRun) {
      seen.add(aeProductId);
      result.status = 'dry-run';
      result.reason = 'checks passed; would create a DRAFT product';
      return result;
    }

    // --- Create the product ------------------------------------------
    const skuFor = (i) => `AE-${aeProductId}-${i}`;
    const shopifyProduct = await createOrUpdateProduct({
      title: truncateTitle(shortTitle(ae.title)),
      descriptionHtml: descriptionFromTitle(ae.title),
      images: ae.images,
      optionName: 'Style',
      variants: ae.variants.map((v, i) => ({
        optionValue: labels[i],
        price: (parseFloat(v.price) * markup).toFixed(2),
        sku: skuFor(i),
        inventoryQuantity: v.stock || 0,
      })),
    });
    result.shopifyId = shopifyProduct.id;

    // --- Write the AE mapping metafields -----------------------------
    // Variants are matched back to their AE sku_attr by SKU (not by array
    // position), so the mapping can't silently cross if Shopify ever
    // returns variants in a different order.
    const entries = [
      {
        ownerId: shopifyProduct.id,
        namespace: 'ae_sync',
        key: 'product_id',
        type: 'single_line_text_field',
        value: aeProductId,
      },
    ];
    const returned = new Map(shopifyProduct.variants.nodes.map((n) => [n.sku, n.id]));
    for (let i = 0; i < ae.variants.length; i++) {
      const variantId = returned.get(skuFor(i));
      if (!variantId) {
        throw new Error(`Shopify did not return a variant for SKU ${skuFor(i)}; product ${shopifyProduct.id} was created WITHOUT its mapping`);
      }
      entries.push({
        ownerId: variantId,
        namespace: 'ae_sync',
        // Metafields can't be empty, so a blank sku_attr is recorded as a flag.
        key: ae.variants[i].skuAttr ? 'sku_attr' : 'no_sku_attr',
        type: 'single_line_text_field',
        value: ae.variants[i].skuAttr || 'true',
      });
    }
    for (let i = 0; i < entries.length; i += METAFIELD_BATCH) {
      await setMetafields(entries.slice(i, i + METAFIELD_BATCH));
    }

    seen.add(aeProductId);
    result.status = 'created';
    result.reason = 'created as DRAFT with AE mapping';
    if (publish) {
      // Mapping is already written, so a publish failure leaves a valid draft.
      try {
        await activateAndPublish(shopifyProduct.id);
        result.reason = 'created, ACTIVE and published to the Online Store, with AE mapping';
      } catch (e) {
        result.reason += ` (publish FAILED: ${e.message}; run scripts/publishProducts.mjs later)`;
      }
    }
    return result;
  } catch (err) {
    result.status = 'failed';
    result.reason = err?.message || String(err);
    if (result.shopifyId) {
      result.reason += ` (product ${result.shopifyId} may exist without a complete mapping; check it in Shopify admin before re-running)`;
    }
    return result;
  }
}
