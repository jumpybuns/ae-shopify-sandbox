# Product procedures

How products get from AliExpress into the Shopify store, and how to fix them
afterwards. Written for developers who did not build this. Everything below
reflects the code as of this writing; where something is not built or not yet
verified against the live services, it says so (see **Known gaps**).

Commands run from the repo root. Secrets live in `.env` and are never pasted
into chat, tickets or commits.

---

## 0. How it fits together

**Three places hold product data, and each owns different things.**

| Place | Owns |
|---|---|
| `catalog/catalog.txt` | *Which* products to import and which **brand** each belongs to |
| AliExpress (`aliexpress.ds.product.get`) | Variants, prices, stock, images, the listing title |
| Shopify | What customers see, plus anything edited by hand |

**Mapping metafields (namespace `ae_sync`).** These are how an order finds its
way back to AliExpress. Treat them as load-bearing.

| Metafield | On | Meaning |
|---|---|---|
| `product_id` | Product | The AliExpress product id. Its presence is what marks a product as importer-created. |
| `sku_attr` | Variant | The AliExpress variant string (e.g. `14:29#SIBLING`) sent when ordering. |
| `no_sku_attr` | Variant | `true` instead of `sku_attr` for a single-variant listing AliExpress returns with a blank `sku_attr`. |
| `synced` | Product | JSON baseline of what the sync tool last wrote (e.g. `{"vendor":"Mosky"}`), used to tell hand edits from our own. |

**What the importer creates for each product**

- Status **DRAFT**. Nothing goes live until you publish it (section 2, step 5).
- One option named **Style**; each AliExpress variant is one option value.
- SKUs `AE-<aeProductId>-<index>`. The duplicate check depends on `-0` existing.
- Title shortened (first natural break, or ~70 characters); the **full original
  title goes in the description**.
- Vendor: the catalog `[Brand]` header; if imported without a brand, the first
  word of the AliExpress title; else Shopify's default (the shop name).
- Tags: the brand, plus tags matched from `catalog/tags.txt`.
- Price: AliExpress `offer_sale_price` (override with `AE_PRICE_FIELD`) times
  `IMPORT_MARKUP`. **`IMPORT_MARKUP` defaults to 1, meaning you sell at cost.**
  Set it deliberately. No currency conversion is done.
- Stock: AliExpress `sku_available_stock`, at the location in `SHOPIFY_LOCATION_ID`.
- The mapping metafields above.

**Safe to re-run.** The importer finds existing products by SKU and skips them;
the sync tool changes nothing when nothing differs.

---

## 1. One-time setup and pre-flight

1. **`.env`** (names only; get values from the owner, never from chat):
   `SHOPIFY_STORE_DOMAIN`, `SHOPIFY_APP_CLIENT_ID`, `SHOPIFY_APP_CLIENT_SECRET`,
   `SHOPIFY_LOCATION_ID`, `AE_APP_KEY`, `AE_APP_SECRET`, `AE_REDIRECT_URI`,
   `AUTH_PORT`. Optional: `IMPORT_MARKUP`, `AE_PRICE_FIELD`, `SHOP_CURRENCY`
   (default USD), `AE_SHIP_TO_COUNTRY` (default US), `TAG_RULES_FILE`,
   `AE_DEBUG=1` (prints the raw AliExpress response).
2. **Shopify app scopes** (`shopify.app.ae-sync-service.toml`, deployed with
   `npx shopify app deploy`, then approved on the store):
   `write_merchant_managed_fulfillment_orders, read_orders, read_products,
   write_products, read_inventory, write_inventory, read_locations,
   read_publications, write_publications`. A changed scope list does nothing
   until it is both deployed **and** approved in the store's admin under
   Settings → Apps. Use the file `shopify.app.ae-sync-service.toml`; the older
   `shopify.app.toml` points at a different app and is stale.
3. **Location id.** `node scripts/getLocationId.mjs`, then put the id in `.env`.
4. **AliExpress authorization.** The stored refresh token expires, and imports
   then fail with `IllegalRefreshToken` on every product. Fix: start ngrok on
   `AUTH_PORT`, set `AE_REDIRECT_URI` to the current ngrok URL +
   `/ae/callback`, run `node src/aeClient/authorize.js`, open the URL it prints,
   log in with the regular buyer account and approve. Tokens are stored in
   `sandbox.db`.
5. **Tests.** `node --test src/reconcile.test.mjs src/aeClient/client.test.mjs`.

---

## 2. Create a single product

Use for a one-off. For more than a few, use section 4.

1. **Check it.** Nothing is written:
   ```bash
   node scripts/importProduct.mjs <aliexpress-id-or-url> --brand "Mooer" --dry-run
   ```
   `--brand` makes the import refuse a listing whose AliExpress "Brand Name"
   does not match (keeps knockoffs out). It also becomes the vendor and a tag.
2. **Create it** (same command without `--dry-run`). Result is one of
   `CREATED`, `SKIPPED` (with a reason), or `FAILED`.
3. **Review it in Shopify admin** (it is a draft): price, images, variants.
4. **Add vendor/tags if you imported without `--brand`:**
   `node scripts/syncProducts.mjs --product <id> --fields vendor,tags`
   (preview first; see section 3).
5. **Publish.** Active is **not** the same as published: a product must be
   available on the **Online Store** sales channel, or it has no
   `/products/<handle>` page and never appears in search. Either use the admin
   bulk action for sales-channel availability, or
   `node scripts/publishProducts.mjs` (preview) then `--apply`
   (`--include-drafts` to include drafts). Passing `--publish` to the import
   does steps 2 and 5 together, skipping review.
6. **Verify.** `node scripts/checkPublication.mjs` should show 0 products
   "ACTIVE but NOT on Online Store".

**Flags:** `--dry-run`, `--force` (import despite a brand mismatch or missing
brand), `--publish`, `--brand`.

---

## 3. Update an existing product, or one field of one product

The tool is `scripts/syncProducts.mjs`. It works on products the importer
created (those with `ae_sync.product_id`).

```bash
# preview one field on one product (writes nothing)
node scripts/syncProducts.mjs --product <aliexpress-id | shopify-gid | admin-url> --fields vendor
# write it
node scripts/syncProducts.mjs --product <...> --fields vendor --apply
```

`--product` accepts an AliExpress id or URL, a Shopify GID
(`gid://shopify/Product/123`), or a Shopify admin product URL. Several can be
comma-separated. Omit `--fields` to run all three managed fields.

**What it manages, and the rule for each field**

| Field | Policy | Behavior |
|---|---|---|
| `vendor` | unless-edited | Set to the catalog brand. Replaced only if the current value is Shopify's default or matches what the tool last wrote. |
| `tags` | add-only | Adds the brand and keyword tags. Merged with existing tags; never removes any. |
| `title` | create-only* | If the description is empty, moves the full title into it and shortens the title. Never touches a product with a description. |

\* applied only to products still in their imported state.

**Reading the preview.** `CHANGE` will be written. `SKIP` says why not:
- `edited by hand since last sync`: someone changed it after the tool wrote
  it. Left alone on purpose.
- `no baseline and value differs`: no record of what the tool last wrote, and
  the value does not look like an untouched default. Left alone.
- `description already set`: title split skipped to protect your text.

**Flags that change the safety rules (use deliberately)**
- `--overwrite`: replace a differing value even without a baseline. Use when you
  know the existing value is wrong (e.g. a bad first-word vendor).
- `--adopt`: also record current values as the baseline, so later hand edits
  are detected. Run once after cleaning up a batch.
- `--only <brand>`: restrict to a catalog brand.

**Editing in Shopify admin instead.** Fine for title, description, tags, vendor,
collections and images. **Do not** change a variant's SKU, option values or any
`ae_sync` metafield by hand: an order uses them to buy the right item, and a
wrong one means the wrong item ships.

**What this tool cannot change yet:** price, stock, images, variants and the
mapping metafields. See section 5.

Results of the last run: `catalog/last-sync.json`.

---

## 4. Bulk import

1. **Fill `catalog/catalog.txt`:** a `[Brand]` header, then one AliExpress URL
   or numeric id per line; `#` for comments. Collect links from the brand's
   **official** AliExpress store. A product listed under two brands is an
   error. The header text becomes the vendor and a tag, so spell it as it
   should appear on the storefront.
2. **Optional: edit `catalog/tags.txt`** (`Tag: keyword, keyword` per line;
   whole-word, case-insensitive match against the title and description).
3. **Dry run**, which checks every product and writes nothing:
   ```bash
   node scripts/importCatalog.mjs --dry-run
   ```
4. **Import:** `node scripts/importCatalog.mjs`
   Options: `--only <brand>`, `--file <path>`, `--delay <ms>` (default 750,
   raise it if throttled), `--force`, `--publish`. A summary prints at the end
   and the full result is in `catalog/last-run.json`; exit code 1 if any failed.
5. **Fix up and publish:** section 3 for vendor/tags on anything imported
   earlier, then section 2 step 5 (publish) and step 6 (verify).

**Common SKIPPED reasons and what to do**

| Message | Meaning / action |
|---|---|
| `already imported as <id>` | Exists. Nothing to do; use section 3 to change it. |
| `brand is "X", expected Y` | Not the brand's own listing. Check the link, or `--force` if it really is theirs. |
| `no "Brand Name" property` | Listing doesn't state a brand. `--force` after checking it. |
| `N of M variant(s) have an empty sku_attr` | Seller left variant data blank. Inspect with `node scripts/inspectSku.mjs <id>`. A **single-variant** listing with a `sku_id` is imported automatically; a multi-variant one with blanks is skipped on purpose. |
| `variant priced in X but the store currency is Y` | No conversion exists. Set `SHOP_CURRENCY` only if it is wrong. |
| `exceeds the 250 variants` | Too many to map. Not importable as is. |
| `two variants share the same option label` | Shopify rejects duplicate option values. |
| `a Shopify product with SKU AE-<id>-0 exists but has no ae_sync.product_id` | An orphan (see section 5). |

Many `FAILED` with `IllegalRefreshToken`: re-authorize (section 1, step 4).

---

## 5. Resync when the import data was wrong

First decide **what** is wrong, because the right fix differs.

| Symptom | Fix |
|---|---|
| Wrong vendor, tags, title/description text | Section 3. Safe, repeatable. |
| Product never appears on the storefront / in search | Not published to the Online Store. Section 2, steps 5 and 6. |
| Wrong **price, stock, images, or variants** (or AliExpress changed them since import) | **No automated update exists yet.** If the product has **no orders**: edit it in admin (title/price/images are fine), or delete the draft in admin and re-run the import. If it **has orders**: edit in admin carefully and never touch SKUs or option values. |
| Wrong **mapping** (an order would buy the wrong variant) | Check: `node scripts/verifyMapping.mjs <product-gid>` prints each variant's option next to its `sku_attr`; `node scripts/inspectSku.mjs <aliexpress-id>` shows what AliExpress returns. If the product has **no orders**: delete it in admin and re-import. If it **has orders**: correct the variant metafield with the `setMetafields` helper in `src/shopifyAdminClient.js` (`metafieldsSet`, namespace `ae_sync`, key `sku_attr`) and re-check with `verifyMapping`. There is no script for this yet. |
| Import stopped part-way | Re-run the same command. Existing products are skipped. A product reported as "may exist without a complete mapping" must be deleted in admin and re-imported, otherwise orders for it fail. |
| Orphan: a product with SKU `AE-<id>-0` and no `ae_sync.product_id` | The importer refuses to touch it. Delete it in admin, then re-import. |

**Re-importing after a delete.** The importer decides "already imported" from
what exists in Shopify, so once the product is deleted a normal import creates
it fresh. Deleting is a manual step in admin on purpose; the app's scripts never
delete products.

**Throttling or network errors.** The sync tool retries with backoff. The
importer reports the product as failed; re-run, and raise `--delay`.

---

## 6. Diagnostic scripts

| Script | Does |
|---|---|
| `importProduct.mjs`, `importCatalog.mjs` | Create products (sections 2, 4) |
| `syncProducts.mjs` | Reconcile vendor / tags / title (section 3) |
| `publishProducts.mjs` | Make products visible on the storefront |
| `checkPublication.mjs` | Read-only: counts active vs actually published |
| `inspectSku.mjs <id>` | Read-only: what AliExpress returns per variant |
| `verifyMapping.mjs <gid>` | Read-only: option next to `sku_attr` per variant |
| `dumpAeShape.mjs`, `dumpShopifySchema.mjs` | Read-only: write the AliExpress / Shopify field shapes to `docs/` |
| `getLocationId.mjs` | Lists store locations |

`setVendors.mjs`, `fixTitles.mjs` and `setTags.mjs` are superseded by
`syncProducts.mjs`.

---

## 7. Known gaps (do not assume these work)

- **No price/stock sync.** Prices and stock are read once at import. They drift
  from AliExpress, and a delisted product is not detected.
- **No listing-status check.** The importer does not check whether a listing is
  still on sale or ships to your customers. AliExpress's SDK types list
  `product_status_type` and `ws_offline_date`, but these were never confirmed
  against a live response.
- **Orders have never been tested live.** `placeOrder` is verified only against
  the SDK shapes and stubs. Ordering a **single-variant** product with no
  `sku_attr` (the `no_sku_attr` path) is based on the SDK marking `sku_attr`
  optional; AliExpress's actual behavior is unconfirmed. A real test order is
  the only way to settle both.
- **Collections** are not created automatically.
- **Variants are flattened** into one "Style" option (color and size are joined).
- **Free-tier ngrok** URLs change on restart, so re-authorizing means updating
  `AE_REDIRECT_URI` each time. The AliExpress refresh-token expiry date is not
  stored, so nothing warns you before it lapses.
- **No compare-and-set on writes.** If a person edits a product in admin in the
  few seconds between the sync's read and write, that edit can be overwritten.
  Run the sync when nobody is editing.

## 8. Rules of thumb

1. Preview, then apply. Every write tool has a no-write mode.
2. Drafts first; publish after a human looked.
3. Never hand-edit SKUs, option values or `ae_sync` metafields.
4. Never delete a product that has orders.
5. One source of truth per field (section 0); if you need to change who owns a
   field, change its policy in `src/fieldDefs.js`, don't work around it.
