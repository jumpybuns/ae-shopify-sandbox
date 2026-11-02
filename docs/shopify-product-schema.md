# Shopify Admin GraphQL: product-related types

Introspected from the store at the API version the middleware uses, 2026-10-30. A trailing ! means required.

## Product (OBJECT)

The `Product` object lets you manage products in a merchant’s store. Products are the goods and services that merchants offer to customers. They can include var

| Field | Type | Notes |
|---|---|---|
| `availablePublicationsCount` | Count | The number of [publications](https://shopify.dev/docs/api/admin-graphql/latest/objects/Publication) that a resource is published to, without [feedback errors](h |
| `bundleComponents` | ProductBundleComponentConnection! | A list of [components](https://shopify.dev/docs/apps/build/product-merchandising/bundles/add-product-fixed-bundle) that are associated with a product in a bundl |
| `bundleConsolidatedOptions` | [ComponentizedProductsBundleConsolidatedOption!] | A list of consolidated options for a product in a bundle. |
| `category` | TaxonomyCategory | The category of a product from [Shopify's Standard Product Taxonomy](https://shopify.github.io/product-taxonomy/releases/unstable/?categoryId=sg-4-17-2-17). |
| `collections` | CollectionConnection! | A list of [collections](https://shopify.dev/docs/api/admin-graphql/latest/objects/Collection) that include the product. |
| `combinedListing` | CombinedListing | A special product type that combines separate products from a store into a single product listing. [Combined listings](https://shopify.dev/apps/build/product-me |
| `combinedListingRole` | CombinedListingsRole | The [role of the product](https://shopify.dev/docs/apps/build/product-merchandising/combined-listings/build-for-combined-listings) in a combined listing. If `nu |
| `compareAtPriceRange` | ProductCompareAtPriceRange | The [compare-at price range](https://help.shopify.com/manual/products/details/product-pricing/sale-pricing) of the product in the shop's default currency. |
| `contextualPricing` | ProductContextualPricing! | The pricing that applies to a customer in a specific context. For example, a price might vary depending on the customer's location. Only active markets are cons |
| `createdAt` | DateTime! | The date and time when the product was created. |
| `defaultCursor` | String! | A default [cursor](https://shopify.dev/api/usage/pagination-graphql) that returns the single next record, sorted ascending by ID. |
| `description` | String! | A single-line description of the product, with [HTML tags](https://developer.mozilla.org/en-US/docs/Web/HTML) removed. |
| `descriptionHtml` | HTML! | The description of the product, with HTML tags. For example, the description might include bold `<strong></strong>` and italic `<i></i>` text. |
| `events` | EventConnection! | The paginated list of events associated with the host subject. |
| `featuredMedia` | Media | The featured [media](https://shopify.dev/docs/apps/build/online-store/product-media) associated with the product. |
| `feedback` | ResourceFeedback | The information that lets merchants know what steps they need to take to make sure that the app is set up correctly. For example, if a merchant hasn't set up a  |
| `giftCardSettings` | GiftCardProductSettings | The gift card settings for this product. Only available on gift card products. |
| `giftCardTemplateSuffix` | String | The [theme template](https://shopify.dev/docs/storefronts/themes/architecture/templates) that's used when customers view the gift card in a store. |
| `handle` | String! | A unique, human-readable string of the product's title. A handle can contain letters, hyphens (`-`), and numbers, but no spaces. The handle is used in the onlin |
| `hasOnlyDefaultVariant` | Boolean! | Whether the product has only a single variant with the default option and value. |
| `hasOutOfStockVariants` | Boolean! | Whether the product has variants that are out of stock. |
| `hasVariantsThatRequiresComponents` | Boolean! | Whether at least one of the product variants requires [bundle components](https://shopify.dev/docs/apps/build/product-merchandising/bundles/add-product-fixed-bu |
| `id` | ID! | A globally-unique ID. |
| `inCollection` | Boolean! | Whether the product is in a specified [collection](https://shopify.dev/docs/api/admin-graphql/latest/objects/collection). |
| `isGiftCard` | Boolean! | Whether the product is a gift card. |
| `legacyResourceId` | UnsignedInt64! | The ID of the corresponding resource in the REST Admin API. |
| `media` | MediaConnection! | The [media](https://shopify.dev/docs/apps/build/online-store/product-media) associated with the product. Valid media are images, 3D models, videos. |
| `mediaCount` | Count | The total count of [media](https://shopify.dev/docs/apps/build/online-store/product-media) that's associated with a product. |
| `metafield` | Metafield | A [custom field](https://shopify.dev/docs/apps/build/custom-data), including its `namespace` and `key`, that's associated with a Shopify resource for the purpos |
| `metafields` | MetafieldConnection! | A list of [custom fields](https://shopify.dev/docs/apps/build/custom-data) that a merchant associates with a Shopify resource. |
| `onlineStorePreviewUrl` | URL | The [preview URL](https://help.shopify.com/manual/online-store/setting-up#preview-your-store) for the online store. |
| `onlineStoreUrl` | URL | The product's URL on the online store. If `null`, then the product isn't published to the online store sales channel. |
| `options` | [ProductOption!]! | A list of product options. The limit is defined by the [shop's resource limits for product options](https://shopify.dev/docs/api/admin-graphql/latest/objects/Sh |
| `priceRangeV2` | ProductPriceRangeV2! | The minimum and maximum prices of a product, expressed in decimal numbers. For example, if the product is priced between $10.00 and $50.00, then the price range |
| `productComponents` | ProductComponentTypeConnection! | A list of products that contain at least one variant associated with at least one of the current products' variants via group relationship. |
| `productComponentsCount` | Count | A count of unique products that contain at least one variant associated with at least one of the current products' variants via group relationship. |
| `productParents` | ProductConnection! | A list of products that has a variant that contains any of this product's variants as a component. |
| `productType` | String! | The [product type](https://help.shopify.com/manual/products/details/product-type) that merchants define. |
| `publishedAt` | DateTime | The date and time when the product was published to the online store. |
| `publishedInContext` | Boolean! | Whether the product is published for a customer only in a specified context. For example, a product might be published for a customer only in a specific locatio |
| `publishedOnPublication` | Boolean! | Whether the resource is published to a specified [publication](https://shopify.dev/docs/api/admin-graphql/latest/objects/Publication). |
| `requiresSellingPlan` | Boolean! | Whether the product can only be purchased with a [selling plan](https://shopify.dev/docs/apps/build/purchase-options/subscriptions/selling-plans). Products that |
| `resourcePublications` | ResourcePublicationConnection! | The list of resources that are published to a [publication](https://shopify.dev/docs/api/admin-graphql/latest/objects/Publication). |
| `resourcePublicationsCount` | Count | The total number of [publications](https://shopify.dev/docs/api/admin-graphql/latest/objects/Publication) that a resource is published to, including publication |
| `resourcePublicationsV2` | ResourcePublicationV2Connection! | The list of resources that are either published or staged to be published to a [publication](https://shopify.dev/docs/api/admin-graphql/latest/objects/Publicati |
| `restrictedForResource` | RestrictedForResource | Whether the merchant can make changes to the product when they [edit the order](https://shopify.dev/docs/apps/build/orders-fulfillment/order-management-apps/edi |
| `sellingPlanGroups` | SellingPlanGroupConnection! | A list of all [selling plan groups](https://shopify.dev/docs/apps/build/purchase-options/subscriptions/selling-plans/build-a-selling-plan) that are associated w |
| `sellingPlanGroupsCount` | Count | A count of [selling plan groups](https://shopify.dev/docs/apps/build/purchase-options/subscriptions/selling-plans/build-a-selling-plan) that are associated with |
| `seo` | SEO! | The [SEO title and description](https://help.shopify.com/manual/promoting-marketing/seo/adding-keywords) that are associated with a product. |
| `status` | ProductStatus! | The [product status](https://help.shopify.com/manual/products/details/product-details-page#product-status), which controls visibility across all sales channels. |
| `tags` | [String!]! | A comma-separated list of searchable keywords that are associated with the product. For example, a merchant might apply the `sports` and `summer` tags to produc |
| `templateSuffix` | String | The [theme template](https://shopify.dev/docs/storefronts/themes/architecture/templates) that's used when customers view the product in a store. |
| `title` | String! | The name for the product that displays to customers. The title is used to construct the product's handle. For example, if a product is titled "Black Sunglasses" |
| `totalInventory` | Int! | The quantity of inventory that's in stock. |
| `tracksInventory` | Boolean! | Whether [inventory tracking](https://help.shopify.com/manual/products/inventory/getting-started-with-inventory/set-up-inventory-tracking) has been enabled for t |
| `translations` | [Translation!]! | The published translations associated with the resource. |
| `unpublishedPublications` | PublicationConnection! | The list of [publications](https://shopify.dev/docs/api/admin-graphql/latest/objects/Publication) that the resource isn't published to. |
| `updatedAt` | DateTime! | The date and time when the product was last modified. A product's `updatedAt` value can change for different reasons. For example, if an order is placed for a p |
| `variants` | ProductVariantConnection! | A list of [variants](https://shopify.dev/docs/api/admin-graphql/latest/objects/ProductVariant) associated with the product. If querying a single product at the  |
| `variantsCount` | Count | The number of [variants](https://shopify.dev/docs/api/admin-graphql/latest/objects/ProductVariant) that are associated with the product. |
| `variantsInCollection` | ProductVariantConnection | A list of [variants](https://shopify.dev/docs/api/admin-graphql/latest/objects/ProductVariant) associated with the product that are members of the specified [co |
| `variantsInCollectionCount` | Count | The number of [variants](https://shopify.dev/docs/api/admin-graphql/latest/objects/ProductVariant) associated with the product that are members of the specified |
| `vendor` | String! | The name of the product's vendor. |

## ProductVariant (OBJECT)

The `ProductVariant` object represents a version of a [product](https://shopify.dev/docs/api/admin-graphql/latest/objects/Product) that comes in more than one [

| Field | Type | Notes |
|---|---|---|
| `availableForSale` | Boolean! | Whether the product variant is available for sale. |
| `availablePublicationsCount` | Count | The number of [publications](https://shopify.dev/docs/api/admin-graphql/latest/objects/Publication) that a resource is published to, without [feedback errors](h |
| `barcode` | String | The value of the barcode associated with the product. |
| `compareAtPrice` | Money | The compare-at price of the variant in the default shop currency. |
| `contextualPricing` | ProductVariantContextualPricing! | The pricing that applies for a customer in a given context. As of API version 2025-04, only active markets are considered in the price resolution. |
| `createdAt` | DateTime! | The date and time when the variant was created. |
| `defaultCursor` | String! | A default [cursor](https://shopify.dev/api/usage/pagination-graphql) that returns the single next record, sorted ascending by ID. |
| `deliveryProfile` | DeliveryProfile | The [delivery profile](https://shopify.dev/api/admin-graphql/latest/objects/DeliveryProfile) for the variant. |
| `displayName` | String! | Display name of the variant, based on product's title + variant's title. |
| `events` | EventConnection! | The paginated list of events associated with the host subject. |
| `id` | ID! | A globally-unique ID. |
| `inventoryItem` | InventoryItem! | The inventory item, which is used to query for inventory information. |
| `inventoryPolicy` | ProductVariantInventoryPolicy! | Whether customers are allowed to place an order for the product variant when it's out of stock. |
| `inventoryQuantity` | Int | The total sellable quantity of the variant. |
| `legacyResourceId` | UnsignedInt64! | The ID of the corresponding resource in the REST Admin API. |
| `media` | MediaConnection! | The media associated with the product variant. |
| `metafield` | Metafield | A [custom field](https://shopify.dev/docs/apps/build/custom-data), including its `namespace` and `key`, that's associated with a Shopify resource for the purpos |
| `metafields` | MetafieldConnection! | A list of [custom fields](https://shopify.dev/docs/apps/build/custom-data) that a merchant associates with a Shopify resource. |
| `position` | Int! | The order of the product variant in the list of product variants. The first position in the list is 1. |
| `price` | Money! | The price of the product variant in the default shop currency. |
| `product` | Product! | The product that this variant belongs to. |
| `productParents` | ProductConnection! | A list of products that have product variants that contain this variant as a product component. |
| `productVariantComponents` | ProductVariantComponentConnection! | A list of the product variant components. |
| `publishedOnPublication` | Boolean! | Whether the resource is published to a specified [publication](https://shopify.dev/docs/api/admin-graphql/latest/objects/Publication). |
| `requiresComponents` | Boolean! | Whether a product variant requires components. The default value is `false`. If `true`, then the product variant can only be purchased as a parent bundle with c |
| `resourcePublications` | ResourcePublicationConnection! | The list of resources that are published to a [publication](https://shopify.dev/docs/api/admin-graphql/latest/objects/Publication). |
| `resourcePublicationsCount` | Count | The total number of [publications](https://shopify.dev/docs/api/admin-graphql/latest/objects/Publication) that a resource is published to, including publication |
| `resourcePublicationsV2` | ResourcePublicationV2Connection! | The list of resources that are either published or staged to be published to a [publication](https://shopify.dev/docs/api/admin-graphql/latest/objects/Publicati |
| `selectedOptions` | [SelectedOption!]! | List of product options applied to the variant. |
| `sellableOnlineQuantity` | Int! | The total sellable quantity of the variant for online channels. This doesn't represent the total available inventory or capture [limitations based on customer l |
| `sellingPlanGroups` | SellingPlanGroupConnection! | A list of all selling plan groups defined in the current shop associated with the product variant. |
| `sellingPlanGroupsCount` | Count | Count of selling plan groups associated with the product variant. |
| `showUnitPrice` | Boolean! | Whether to show the unit price for this product variant. |
| `sku` | String | A case-sensitive identifier for the product variant in the shop. Required in order to connect to a fulfillment service. |
| `taxable` | Boolean! | Whether a tax is charged when the product variant is sold. |
| `title` | String! | The title of the product variant. |
| `translations` | [Translation!]! | The published translations associated with the resource. |
| `unitPrice` | MoneyV2 | The unit price value for the variant based on the variant measurement. |
| `unitPriceMeasurement` | UnitPriceMeasurement | The unit price measurement for the variant. |
| `unpublishedPublications` | PublicationConnection! | The list of [publications](https://shopify.dev/docs/api/admin-graphql/latest/objects/Publication) that the resource isn't published to. |
| `updatedAt` | DateTime! | The date and time (ISO 8601 format) when the product variant was last modified. |

## ProductSetInput (INPUT_OBJECT)

The input fields required to create or update a product via ProductSet mutation.

| Field | Type | Notes |
|---|---|---|
| `descriptionHtml` | String | The description of the product, with HTML tags. For example, the description might include bold `<strong></strong>` and italic `<i></i>` text. |
| `handle` | String | A unique, human-readable string that's used to identify the product in URLs. A handle can contain letters, hyphens (`-`), and numbers, but no spaces. If no hand |
| `seo` | SEOInput | The [SEO title and description](https://help.shopify.com/manual/promoting-marketing/seo/adding-keywords) that are associated with a product. |
| `productType` | String | The [product type](https://help.shopify.com/manual/products/details/product-type) that merchants define. |
| `tags` | [String!] | A list of searchable keywords that are associated with the product. For example, a merchant might apply the `sports` and `summer` tags to products that are asso |
| `templateSuffix` | String | The [theme template](https://shopify.dev/docs/storefronts/themes/architecture/templates) that's used when customers view a product in a store. |
| `giftCardTemplateSuffix` | String | The [theme template](https://shopify.dev/docs/storefronts/themes/architecture/templates) that's used when customers view a gift card in a store. |
| `title` | String | The name for the product that displays to customers. If no handle is explicitly provided, then the title is used to construct the product's handle. For example, |
| `vendor` | String | The name of the product's vendor. |
| `category` | ID | The ID of the [category](https://shopify.github.io/product-taxonomy/releases/unstable/?categoryId=sg-4-17-2-17) that's associated with the product. |
| `giftCard` | Boolean | Whether the product is a gift card. |
| `redirectNewHandle` | Boolean | Whether a redirect is required after a new handle has been provided. If `true`, then the old handle is redirected to the new one automatically. |
| `status` | ProductStatus | The status of the product. |
| `collections` | [ID!] | The IDs of collections that this product will be a member of. |
| `metafields` | [MetafieldInput!] | The metafields to associate with this product. Complexity cost: 0.4 per metafield. |
| `files` | [FileSetInput!] | The files to associate with the product. Complexity cost: 1.9 per file. |
| `productOptions` | [OptionSetInput!] | List of custom product options and option values (maximum of 3 per product). |
| `variants` | [ProductVariantSetInput!] | A list of variants associated with the product. Complexity cost: 0.2 per variant. |
| `requiresSellingPlan` | Boolean | Whether the product can only be purchased with a selling plan (subscription). Products that are sold exclusively on subscription can only be created on online s |
| `claimOwnership` | ProductClaimOwnershipInput | The input field to enable an app to provide additional product features. For example, you can specify [`bundles: true`](https://shopify.dev/docs/api/admin-graph |
| `combinedListingRole` | CombinedListingsRole | The role of the product in a product grouping. It can only be set during creation. |

## ProductVariantSetInput (INPUT_OBJECT)

The input fields for specifying a product variant to create or update.

| Field | Type | Notes |
|---|---|---|
| `id` | ID | Specifies the product variant to update or create a new variant if absent. |
| `optionValues` | [VariantOptionValueInput!]! | The custom properties that a shop owner uses to define product variants. |
| `price` | Money | The price of the variant. |
| `sku` | String | The SKU for the variant. Case-sensitive string. |
| `barcode` | String | The value of the barcode associated with the product. |
| `position` | Int | The order of the product variant in the list of product variants. The first position in the list is 1. |
| `file` | FileSetInput | The file to associate with the variant. Complexity cost: 0.6 per variant file. Any file specified here must also be specified in the `files` input for the produ |
| `metafields` | [MetafieldInput!] | Additional customizable information about the product variant. Complexity cost: 0.4 per variant metafield. |
| `published` | Boolean | Indicates whether the product variant is created as published or unpublished. This option is only available for new product variants. |
| `compareAtPrice` | Money | The compare-at price of the variant. |
| `requiresComponents` | Boolean | Whether a product variant requires components. The default value is `false`. If `true`, then the product variant can only be purchased as a parent bundle with c |
| `inventoryPolicy` | ProductVariantInventoryPolicy | Whether customers are allowed to place an order for the product variant when it's out of stock. Defaults to `DENY`. |
| `inventoryQuantities` | [ProductSetInventoryInput!] | The inventory quantities at each location where the variant is stocked. If you're updating an existing variant, then you can only update the quantities at locat |
| `inventoryItem` | InventoryItemInput | The inventory item associated with the variant, used for unit cost. |
| `taxable` | Boolean | Whether the variant is taxable. |
| `taxCode` | String | The tax code associated with the variant. |
| `unitPriceMeasurement` | UnitPriceMeasurementInput | The unit price measurement for the product variant. |
| `showUnitPrice` | Boolean | Whether or not unit price should be shown for this product variant. |

## ProductOptionInput

_not found in this API version_

## InventoryItem (OBJECT)

An inventory item represents the inventory for a [product variant](https://shopify.dev/docs/api/admin-graphql/latest/objects/ProductVariant). It holds the stock

| Field | Type | Notes |
|---|---|---|
| `countryCodeOfOrigin` | CountryCode | The ISO 3166-1 alpha-2 country code of where the item originated from. |
| `countryHarmonizedSystemCodes` | CountryHarmonizedSystemCodeConnection! | A list of country specific harmonized system codes. |
| `createdAt` | DateTime! | The date and time when the inventory item was created. |
| `duplicateSkuCount` | Int! | The number of inventory items that share the same SKU with this item. |
| `harmonizedSystemCode` | String | The harmonized system code of the item. This must be a number between 6 and 13 digits. |
| `id` | ID! | A globally-unique ID. |
| `inventoryHistoryUrl` | URL | The URL that points to the inventory history for the item. |
| `inventoryLevel` | InventoryLevel | The inventory item's quantities at the specified location. |
| `inventoryLevels` | InventoryLevelConnection! | A list of the inventory item's quantities for each location that the inventory item can be stocked at. |
| `legacyResourceId` | UnsignedInt64! | The ID of the corresponding resource in the REST Admin API. |
| `locationsCount` | Count | The number of locations where this inventory item is stocked. |
| `measurement` | InventoryItemMeasurement! | The packaging dimensions of the inventory item. |
| `provinceCodeOfOrigin` | String | The ISO 3166-2 alpha-2 province code of where the item originated from. |
| `requiresShipping` | Boolean! | Whether a customer needs to provide a shipping address when placing an order containing the inventory item. |
| `sku` | String | Inventory item SKU. Case-sensitive string. |
| `tracked` | Boolean! | Whether inventory levels are tracked for the item. |
| `trackedEditable` | EditableProperty! | Whether the value of the `tracked` field for the inventory item can be changed. |
| `unitCost` | MoneyV2 | Unit cost associated with the inventory item. The shop's currency is used. Note: the user must have "View product costs" permission granted in order to access t |
| `updatedAt` | DateTime! | The date and time when the inventory item was updated. |
| `variants` | ProductVariantConnection | A paginated list of the variants that reference this inventory item. |

## Collection (OBJECT)

The `Collection` object represents a group of [products](https://shopify.dev/docs/api/admin-graphql/latest/objects/Product) that merchants can organize to make 

| Field | Type | Notes |
|---|---|---|
| `activeOperations` | CollectionOperations! | Collection duplicate operations involving this collection, either as a source (copying products from this collection to another) or a target (copying products t |
| `availablePublicationsCount` | Count | The number of [publications](https://shopify.dev/docs/api/admin-graphql/latest/objects/Publication) that a resource is published to, without [feedback errors](h |
| `createdAt` | DateTime! | The date and time when the collection was created. |
| `description` | String! | A single-line, text-only description of the collection, stripped of any HTML tags and formatting that were included in the description. |
| `descriptionHtml` | HTML! | The description of the collection, including any HTML tags and formatting. This content is typically displayed to customers, such as on an online store, dependi |
| `events` | EventConnection! | The paginated list of events associated with the host subject. |
| `feedback` | ResourceFeedback | Information about the collection that's provided through resource feedback. |
| `handle` | String! | A unique string that identifies the collection. If a handle isn't specified when a collection is created, it's automatically generated from the collection's ori |
| `hasProduct` | Boolean! | Whether the collection includes the specified product. |
| `id` | ID! | A globally-unique ID. |
| `image` | Image | The image associated with the collection. |
| `legacyResourceId` | UnsignedInt64! | The ID of the corresponding resource in the REST Admin API. |
| `metafield` | Metafield | A [custom field](https://shopify.dev/docs/apps/build/custom-data), including its `namespace` and `key`, that's associated with a Shopify resource for the purpos |
| `metafields` | MetafieldConnection! | A list of [custom fields](https://shopify.dev/docs/apps/build/custom-data) that a merchant associates with a Shopify resource. |
| `products` | ProductConnection! | The products that are included in the collection. |
| `productsCount` | Count | The number of products in the collection. |
| `publishedOnPublication` | Boolean! | Whether the resource is published to a specified [publication](https://shopify.dev/docs/api/admin-graphql/latest/objects/Publication). |
| `resourcePublications` | ResourcePublicationConnection! | The list of resources that are published to a [publication](https://shopify.dev/docs/api/admin-graphql/latest/objects/Publication). |
| `resourcePublicationsCount` | Count | The total number of [publications](https://shopify.dev/docs/api/admin-graphql/latest/objects/Publication) that a resource is published to, including publication |
| `resourcePublicationsV2` | ResourcePublicationV2Connection! | The list of resources that are either published or staged to be published to a [publication](https://shopify.dev/docs/api/admin-graphql/latest/objects/Publicati |
| `seo` | SEO! | If the default SEO fields for page title and description have been modified, contains the modified information. |
| `sortOrder` | CollectionSortOrder! | The order in which the products in the collection are displayed by default in the Shopify admin and in sales channels, such as an online store. |
| `sources` | [CollectionSource!]! | The sources that provide products for this collection. Each source represents a way products are included in the collection, such as through conditions and rule |
| `subCollectionEligibility` | CollectionSubCollectionEligibility! | Whether this collection is eligible to be referenced as a sub-collection from another collection's source. Returns one state per role (inclusion / exclusion). U |
| `templateSuffix` | String | The suffix of the Liquid template being used to show the collection in an online store. For example, if the value is `custom`, then the collection is using the  |
| `title` | String! | The name of the collection. It's displayed in the Shopify admin and is typically displayed in sales channels, such as an online store. |
| `translations` | [Translation!]! | The published translations associated with the resource. |
| `unpublishedPublications` | PublicationConnection! | The list of [publications](https://shopify.dev/docs/api/admin-graphql/latest/objects/Publication) that the resource isn't published to. |
| `updatedAt` | DateTime! | The date and time ([ISO 8601 format](http://en.wikipedia.org/wiki/ISO_8601)) when the collection was last modified. |
