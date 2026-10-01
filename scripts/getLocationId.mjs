// One-off CLI helper: prints the store's fulfillment locations so you can
// pick which one to put in .env as SHOPIFY_LOCATION_ID. Run with:
//   node scripts/getLocationId.mjs
import 'dotenv/config';
import { listLocations } from '../src/shopifyAdminClient.js';

const locations = await listLocations();

if (!locations.length) {
  console.log('No locations found — is the app actually installed with read_locations approved?');
  process.exit(1);
}

console.log('Locations on this store:\n');
for (const loc of locations) {
  console.log(`${loc.name}${loc.isActive ? '' : ' (inactive)'}`);
  console.log(`  id: ${loc.id}\n`);
}
console.log('Copy the "id" of the location you want (usually your only/main one) into .env as SHOPIFY_LOCATION_ID.');
