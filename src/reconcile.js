// src/reconcile.js
//
// Pure planner: given a product as it is in Shopify now, what we want it to
// be, and the snapshot of our last write, decide what to change and what to
// leave alone. No network.

import { FIELDS, DEFAULT_FIELDS } from './fieldDefs.js';

export function parseSnapshot(value) {
  if (!value) return {};
  try {
    const v = JSON.parse(value);
    return v && typeof v === 'object' && !Array.isArray(v) ? v : {};
  } catch {
    return {}; // unreadable snapshot == no snapshot; never throw on stored data
  }
}

/**
 * product: { id, title, descriptionHtml, vendor, tags[], synced? (snapshot JSON string) }
 * ctx:     { brand?, shopName?, tagRules? }
 * opts:    { fields?: string[], overwrite?: boolean }
 *
 * Returns { set, changes, skipped, snapshot, snapshotChanged }.
 *   set       fields to send to productUpdate (empty = nothing to write)
 *   snapshot  the snapshot to store after a successful write
 */
export function planProduct(product, ctx, opts = {}) {
  const fields = opts.fields?.length ? opts.fields : DEFAULT_FIELDS;
  const unknown = fields.filter((f) => !FIELDS[f]);
  if (unknown.length) throw new Error(`unknown field(s): ${unknown.join(', ')}. Known: ${Object.keys(FIELDS).join(', ')}`);

  const before = parseSnapshot(product.synced);
  const result = { set: {}, changes: [], skipped: [], snapshot: { ...before }, snapshotChanged: false };

  for (const f of fields) {
    const p = FIELDS[f].plan(product, ctx, before, opts);
    Object.assign(result.set, p.set);
    result.changes.push(...p.changes);
    result.skipped.push(...p.skipped);
    Object.assign(result.snapshot, p.baseline);
  }

  result.snapshotChanged = JSON.stringify(result.snapshot) !== JSON.stringify(before);
  return result;
}
