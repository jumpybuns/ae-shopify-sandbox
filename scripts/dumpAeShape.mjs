// scripts/dumpAeShape.mjs
//
// Read-only. Fetches one product from AliExpress and writes its SHAPE: every
// field path with its type and one short example value, with long text and
// URLs trimmed. Use it to see what aliexpress.ds.product.get really returns
// (as opposed to what the SDK's type definitions claim).
//
// Usage: node scripts/dumpAeShape.mjs <product-id-or-url> [--out docs/ae-product-shape.md]

import 'dotenv/config';         
import fs from 'node:fs';
import { getRawProduct } from '../src/aeClient/aliexpressClient.js';
import { extractAeId } from '../src/catalogImporter.js';

const argv = process.argv.slice(2);
const id = extractAeId(argv.find((a) => !a.startsWith('--')));
const outIdx = argv.indexOf('--out');
const result = await getRawProduct(id);
const subject = result.ae_item_base_info_dto?.subject;

let productName = "";
let subjectParts = [];  // The first part of the subject is the product name.

if (subject) {
  productName = subject.split(" ")[0];
  subjectParts = subject.split(" ");
} else {
  productName = id;
  subjectParts = [id];
}

console.log('subjectParts', subjectParts);
const out = outIdx >= 0 ? argv[outIdx + 1] : `docs/ae-${productName.replace(/ /g, "-")}.md`;
const rows = new Map(); // path -> { types:Set, example }
function sample(v) {
  if (typeof v === 'string') return JSON.stringify(v.length > 50 ? v.slice(0, 47) + '...' : v);
  return String(v);
}
function walk(v, path) {
  const type = v === null ? 'null' : Array.isArray(v) ? 'array' : typeof v;
  const row = rows.get(path) || { types: new Set(), example: undefined };
  row.types.add(type);
  if (type !== 'object' && type !== 'array' && row.example === undefined) row.example = sample(v);
  rows.set(path, row);
  if (type === 'array') v.forEach((el) => walk(el, path + '[]'));
  else if (type === 'object') for (const [k, val] of Object.entries(v)) walk(val, path ? `${path}.${k}` : k);
}

walk(result, '');

const lines = [
  `# aliexpress.ds.product.get: observed shape`,
  ``,
  `Product ${id}, fetched ${new Date().toISOString().slice(0, 10)}. Types and one example per field; text trimmed.`,
  ``,
  `| Path | Type | Example |`,
  `|---|---|---|`,
];
for (const [path, r] of rows) {
  if (!path) continue;
  lines.push(`| \`${path}\` | ${[...r.types].join(' / ')} | ${r.example === undefined ? '' : '`' + r.example.replace(/\|/g, '\\|') + '`'} |`);
}
fs.mkdirSync(out.split('/').slice(0, -1).join('/') || '.', { recursive: true });
fs.writeFileSync(out, lines.join('\n') + '\n');
console.log(`Wrote ${rows.size - 1} field paths to ${out}`);
