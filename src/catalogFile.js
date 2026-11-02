// src/catalogFile.js
//
// The one parser for catalog/catalog.txt, used by importCatalog.mjs and
// syncProducts.mjs so they can never disagree about what the file means.
//
// Format: a [Brand] header, then one AliExpress product URL or numeric id per
// line. '#' starts a comment (a whole line, or anything after "  #").

import fs from 'node:fs';
import { extractAeId } from './catalogUtil.js';

/** Returns [{ brand, entries: [{ raw, id, line }] }]. Throws on malformed lines. */
export function parseCatalogText(text, label = 'catalog') {
  const sections = [];
  let current = null;

  String(text).split(/\r?\n/).forEach((rawLine, idx) => {
    const lineNo = idx + 1;
    const line = rawLine.replace(/\s+#.*$/, '').trim();
    if (!line || line.startsWith('#')) return;

    const header = line.match(/^\[(.+)\]$/);
    if (header) {
      current = { brand: header[1].trim(), entries: [] };
      sections.push(current);
      return;
    }
    if (!current) {
      throw new Error(`${label}:${lineNo}: "${line}" appears before any [Brand] header`);
    }
    const id = extractAeId(line);
    if (!id) {
      throw new Error(`${label}:${lineNo}: couldn't find a product id in "${line}"`);
    }
    current.entries.push({ raw: line, id, line: lineNo });
  });

  return sections;
}

export function parseCatalog(filePath) {
  return parseCatalogText(fs.readFileSync(filePath, 'utf8'), filePath);
}

/**
 * Map of aeProductId -> brand (the header text exactly as written).
 * Throws if one product is listed under two different brands, because the
 * correct brand can't be known and guessing would mislabel it.
 */
export function brandByAeId(sections) {
  const map = new Map();
  for (const s of sections) {
    for (const e of s.entries) {
      const existing = map.get(e.id);
      if (existing && existing !== s.brand) {
        throw new Error(`product ${e.id} is listed under both "${existing}" and "${s.brand}" (catalog line ${e.line})`);
      }
      map.set(e.id, s.brand);
    }
  }
  return map;
}
