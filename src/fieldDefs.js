// src/fieldDefs.js
//
// One definition per managed product field. Each says what the field should
// be, and under which POLICY the tool may change it on a product that already
// exists:
//
//   always         AliExpress/the catalog owns it; overwrite when different
//   unless-edited  update only if nobody changed it by hand since our last write
//   add-only       only ever adds values (tags): never removes or rewrites
//   create         set once when the product is created, never changed after
//
// "Edited by hand" is detected by comparing the live value to a snapshot of
// what this tool last wrote (product metafield ae_sync.synced). With no
// snapshot yet, a value is only replaced when it is clearly an untouched
// default (see isUntouchedDefault), or when --overwrite is given.
//
// Everything here is pure: no network, so it is unit tested without Shopify.

import { shortTitle, descriptionFromTitle } from './productText.js';
import { buildTags, stripHtml } from './tagRules.js';

const norm = (s) => String(s ?? '').trim();
const has = (o, k) => !!o && Object.prototype.hasOwnProperty.call(o, k);

/**
 * Decision for one scalar field.
 * Returns exactly one of: { none } no desired value, { same }, { change: value },
 * { skip: reason }.
 */
export function decideScalar({ key, current, desired, snapshot, policy, isUntouchedDefault, overwrite }) {
  if (desired === undefined || desired === null || norm(desired) === '') return { none: true };
  if (norm(current) === norm(desired)) return { same: true };
  if (policy === 'create') return { skip: 'policy: set at creation only' };
  if (policy === 'always') return { change: desired };

  // unless-edited
  if (has(snapshot, key)) {
    return norm(snapshot[key]) === norm(current)
      ? { change: desired }
      : { skip: 'edited by hand since last sync' };
  }
  if (overwrite) return { change: desired };
  if (isUntouchedDefault && isUntouchedDefault(current)) return { change: desired };
  return { skip: 'no baseline and value differs (use --overwrite to replace it)' };
}

function empty() {
  return { set: {}, changes: [], skipped: [], baseline: {} };
}

export const FIELDS = {
  // Vendor = the catalog [Brand] header the product was imported under.
  vendor: {
    policy: 'unless-edited',
    plan(product, ctx, snapshot, opts) {
      const out = empty();
      const shop = norm(ctx.shopName).toLowerCase();
      const d = decideScalar({
        key: 'vendor',
        current: product.vendor,
        desired: ctx.brand,
        snapshot,
        policy: 'unless-edited',
        isUntouchedDefault: (v) => !norm(v) || (shop && norm(v).toLowerCase() === shop),
        overwrite: opts.overwrite,
      });
      if (d.change !== undefined) {
        out.set.vendor = d.change;
        out.changes.push({ field: 'vendor', from: norm(product.vendor), to: d.change });
        out.baseline.vendor = d.change;
      } else if (d.same) {
        out.baseline.vendor = norm(ctx.brand);
      } else if (d.skip) {
        out.skipped.push({ field: 'vendor', reason: d.skip });
      }
      return out;
    },
  },

  // Tags: the brand, plus tags whose keywords appear in the title/description.
  // Add-only. productUpdate REPLACES the tag list, so we send the existing
  // tags plus the missing ones.
  tags: {
    policy: 'add-only',
    plan(product, ctx) {
      const out = empty();
      const text = `${product.title || ''} ${stripHtml(product.descriptionHtml)}`;
      const wanted = buildTags(ctx.brand, text, ctx.tagRules);
      const current = Array.isArray(product.tags) ? product.tags : [];
      const have = new Set(current.map((t) => t.toLowerCase()));
      const missing = wanted.filter((t) => !have.has(t.toLowerCase()));
      if (missing.length) {
        out.set.tags = [...current, ...missing];
        out.changes.push({ field: 'tags', from: current.join(', ') || '(none)', to: `+ ${missing.join(', ')}` });
      }
      return out;
    },
  },

  // Title/description: the AliExpress title is keyword-stuffed. Where the
  // description is still empty, move the full title into it and shorten the
  // title. Never touches a product that already has a description.
  title: {
    policy: 'create',
    plan(product) {
      const out = empty();
      const full = norm(product.title);
      const short = shortTitle(full);
      if (!full || short === full) return out;
      if (norm(stripHtml(product.descriptionHtml))) {
        out.skipped.push({ field: 'title', reason: 'description already set; title left as is' });
        return out;
      }
      out.set.title = short;
      out.set.descriptionHtml = descriptionFromTitle(full);
      out.changes.push({ field: 'title', from: full, to: short });
      out.changes.push({ field: 'description', from: '(empty)', to: 'full original title' });
      return out;
    },
  },
};

export const DEFAULT_FIELDS = ['vendor', 'tags', 'title'];
