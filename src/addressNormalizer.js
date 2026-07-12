// Maps Shopify's shipping_address shape into whatever fields a supplier
// (AliExpress, in production) actually requires for order placement.
//
// This exists because the two schemas don't line up 1:1 — confirmed by
// diffing a real Shopify webhook payload against what we'd been testing
// with. Shopify gives you both a full name (`province`, `country`) and a
// code (`province_code`, `country_code`); most dropship supplier APIs want
// ONE specific one of those, not both, and picking the wrong one is a
// common cause of an address getting rejected downstream.
//
// Swap the target shape here once you have real AliExpress Open Platform
// docs in front of you — this is deliberately a single, isolated place to
// do that, rather than scattered inline across the worker.
export function normalizeAddress(shopifyAddress) {
  if (!shopifyAddress) {
    throw new AddressValidationError('missing shipping_address entirely');
  }

  const {
    first_name,
    last_name,
    name,
    address1,
    address2,
    city,
    province_code,
    country_code,
    zip,
    phone,
  } = shopifyAddress;

  const contactName = name || [first_name, last_name].filter(Boolean).join(' ').trim();

  const required = { contactName, address1, city, province_code, country_code, zip };
  const missing = Object.entries(required)
    .filter(([, v]) => !v)
    .map(([k]) => k);

  if (missing.length) {
    // Fail loud and early, BEFORE calling the supplier API — this is the
    // "don't retry blindly" failure mode from the architecture doc, just
    // caught one step earlier than a 422 from the supplier would catch it.
    throw new AddressValidationError(`missing required field(s): ${missing.join(', ')}`);
  }

  return {
    contact_name: contactName,
    street_address: address2 ? `${address1}, ${address2}` : address1,
    city,
    // Most supplier APIs want the CODE, not the full name — adjust here
    // if the real AliExpress schema turns out to want the full name instead.
    province_code,
    country_code,
    postal_code: zip,
    phone: phone || null, // genuinely nullable on real Shopify orders — don't assume it's present
  };
}

export class AddressValidationError extends Error {
  constructor(message) {
    super(message);
    this.name = 'AddressValidationError';
  }
}
