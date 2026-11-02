// scripts/dumpShopifySchema.mjs
//
// Read-only. Asks YOUR store's Admin GraphQL API (at the version the
// middleware uses) to describe the product-related types, and writes them as
// markdown. Introspection needs no special scopes.
//
// Usage: node scripts/dumpShopifySchema.mjs [--out docs/shopify-product-schema.md] [Type ...]
// Default types: Product, ProductVariant, ProductSetInput, ProductVariantSetInput,
//                ProductOptionInput, InventoryItem, Collection

import 'dotenv/config';
import fs from 'node:fs';
import { graphqlRequest } from '../src/shopifyAdminClient.js';

const argv = process.argv.slice(2);
const outIdx = argv.indexOf('--out');
const out = outIdx >= 0 ? argv[outIdx + 1] : 'docs/shopify-product-schema.md';
const names = argv.filter((a, i) => !a.startsWith('--') && i !== outIdx + 1);
const types = names.length
  ? names
  : ['Product', 'ProductVariant', 'ProductSetInput', 'ProductVariantSetInput', 'ProductOptionInput', 'InventoryItem', 'Collection'];

const REF = `kind name ofType { kind name ofType { kind name ofType { kind name ofType { kind name } } } }`;
const QUERY = `
  query($n: String!) {
    __type(name: $n) {
      name kind description
      fields { name description isDeprecated type { ${REF} } }
      inputFields { name description type { ${REF} } }
      enumValues { name }
    }
  }`;

function typeStr(t) {
  if (!t) return '?';
  if (t.kind === 'NON_NULL') return typeStr(t.ofType) + '!';
  if (t.kind === 'LIST') return '[' + typeStr(t.ofType) + ']';
  return t.name;
}
const cell = (s) => String(s || '').replace(/\s+/g, ' ').replace(/\|/g, '\\|').slice(0, 160);

const lines = [`# Shopify Admin GraphQL: product-related types`, ``, `Introspected from the store at the API version the middleware uses, ${new Date().toISOString().slice(0, 10)}. A trailing ! means required.`, ``];
for (const name of types) {
  const d = await graphqlRequest(QUERY, { n: name });
  const t = d.__type;
  if (!t) { lines.push(`## ${name}`, ``, `_not found in this API version_`, ``); continue; }
  lines.push(`## ${t.name} (${t.kind})`, ``, cell(t.description), ``);
  const members = t.fields || t.inputFields || [];
  if (members.length) {
    lines.push(`| Field | Type | Notes |`, `|---|---|---|`);
    for (const f of members) {
      lines.push(`| \`${f.name}\` | ${typeStr(f.type)} | ${f.isDeprecated ? '**deprecated** ' : ''}${cell(f.description)} |`);
    }
    lines.push(``);
  }
}
fs.mkdirSync(out.split('/').slice(0, -1).join('/') || '.', { recursive: true });
fs.writeFileSync(out, lines.join('\n'));
console.log(`Wrote ${types.length} type(s) to ${out}`);
