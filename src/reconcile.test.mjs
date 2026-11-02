import test from 'node:test';
import assert from 'node:assert/strict';
import { parseCatalogText, brandByAeId } from './catalogFile.js';
import { parseTagRules, matchTags, buildTags } from './tagRules.js';
import { decideScalar } from './fieldDefs.js';
import { planProduct, parseSnapshot } from './reconcile.js';
import { runSync } from './syncRunner.js';

const prod = (o = {}) => ({
  id: 'gid://shopify/Product/1', title: 'MOSKY DTC 4-in-1 Electric Guitar Effects Pedal Distortion + Overdrive + Loop + Delay True Bypass Guitar Parts & Accessories',
  descriptionHtml: '', vendor: 'Hifi Password', tags: [], aeId: '111', synced: null, ...o,
});
const rules = parseTagRules('Delay: delay, echo\nOverdrive: overdrive\nDistortion: distortion\nLooper: loop, looper');
const ctx = { brand: 'Mosky', shopName: 'Hifi Password', tagRules: rules };

test('catalog parser: sections, comments, urls', () => {
  const s = parseCatalogText('# c\n[Mooer]\n123456789 # note\nhttps://www.aliexpress.com/item/1005001234567890.html\n[Joyo]\n');
  assert.equal(s.length, 2);
  assert.deepEqual(s[0].entries.map((e) => e.id), ['123456789', '1005001234567890']);
  assert.equal(s[1].entries.length, 0);
});
test('catalog parser: entry before header and unparseable line throw', () => {
  assert.throws(() => parseCatalogText('123456789'), /before any \[Brand\]/);
  assert.throws(() => parseCatalogText('[A]\nhello'), /couldn't find a product id/);
});
test('brandByAeId: same brand twice ok, conflicting brands throw', () => {
  assert.equal(brandByAeId(parseCatalogText('[A]\n123456\n123456')).get('123456'), 'A');
  assert.throws(() => brandByAeId(parseCatalogText('[A]\n123456\n[B]\n123456')), /both "A" and "B"/);
});

test('tag rules: whole words only, case-insensitive, de-duplicated', () => {
  assert.deepEqual(matchTags('Analog DELAY pedal', rules), ['Delay']);
  assert.deepEqual(matchTags('Delayed signal', rules), []);          // not a whole word
  assert.deepEqual(matchTags('Overdrive + echo + delay', rules), ['Delay', 'Overdrive']);
  assert.deepEqual(buildTags('delay', 'a delay pedal', rules), ['delay']); // brand vs rule tag, case-insensitive
  assert.throws(() => parseTagRules('no colon here'), /expected "Tag: keyword/);
});

test('decideScalar policies', () => {
  const base = { key: 'vendor', policy: 'unless-edited' };
  assert.deepEqual(decideScalar({ ...base, current: 'x', desired: '' }), { none: true });
  assert.deepEqual(decideScalar({ ...base, current: 'A', desired: 'A' }), { same: true });
  assert.equal(decideScalar({ ...base, current: 'x', desired: 'A', policy: 'create' }).skip.includes('creation'), true);
  assert.equal(decideScalar({ ...base, current: 'x', desired: 'A', policy: 'always' }).change, 'A');
  // baseline present and matching -> safe; baseline present and different -> hand edit
  assert.equal(decideScalar({ ...base, current: 'old', desired: 'A', snapshot: { vendor: 'old' } }).change, 'A');
  assert.match(decideScalar({ ...base, current: 'mine', desired: 'A', snapshot: { vendor: 'old' } }).skip, /edited by hand/);
  // no baseline: only untouched defaults or --overwrite
  assert.match(decideScalar({ ...base, current: 'mine', desired: 'A' }).skip, /no baseline/);
  assert.equal(decideScalar({ ...base, current: 'mine', desired: 'A', overwrite: true }).change, 'A');
  assert.equal(decideScalar({ ...base, current: 'dflt', desired: 'A', isUntouchedDefault: (v) => v === 'dflt' }).change, 'A');
});

test('plan: default vendor replaced, tags merged without losing existing tags', () => {
  const p = planProduct(prod({ tags: ['Keep Me'] }), ctx, { fields: ['vendor', 'tags'] });
  assert.equal(p.set.vendor, 'Mosky');
  assert.deepEqual(p.set.tags, ['Keep Me', 'Mosky', 'Delay', 'Overdrive', 'Distortion', 'Looper']);
  assert.deepEqual(p.snapshot, { vendor: 'Mosky' });
  assert.equal(p.snapshotChanged, true);
});
test('plan: hand-set vendor with no baseline is left alone', () => {
  const p = planProduct(prod({ vendor: 'My Custom Vendor' }), ctx, { fields: ['vendor'] });
  assert.equal(p.set.vendor, undefined);
  assert.match(p.skipped[0].reason, /no baseline/);
});
test('plan: vendor edited after our last write is not overwritten', () => {
  const p = planProduct(prod({ vendor: 'Edited', synced: JSON.stringify({ vendor: 'Mosky' }) }), ctx, { fields: ['vendor'] });
  assert.equal(p.set.vendor, undefined);
  assert.match(p.skipped[0].reason, /edited by hand/);
});
test('plan: tags are case-insensitively deduplicated and never removed', () => {
  const p = planProduct(prod({ tags: ['mosky', 'DELAY', 'Custom'] }), ctx, { fields: ['tags'] });
  assert.deepEqual(p.set.tags, ['mosky', 'DELAY', 'Custom', 'Overdrive', 'Distortion', 'Looper']);
  const none = planProduct(prod({ tags: ['mosky', 'delay', 'overdrive', 'distortion', 'loop', 'Looper'] }), ctx, { fields: ['tags'] });
  assert.equal(none.set.tags, undefined);
});
test('plan: long title moves into empty description; existing description protects it', () => {
  const p = planProduct(prod(), ctx, { fields: ['title'] });
  assert.equal(p.set.title, 'MOSKY DTC 4-in-1 Electric Guitar Effects Pedal Distortion');
  assert.match(p.set.descriptionHtml, /^<p>MOSKY DTC .*Accessories<\/p>$/);
  const q = planProduct(prod({ descriptionHtml: '<p>My own copy</p>' }), ctx, { fields: ['title'] });
  assert.deepEqual(q.set, {});
  assert.match(q.skipped[0].reason, /description already set/);
  assert.deepEqual(planProduct(prod({ title: 'Short Title' }), ctx, { fields: ['title'] }).set, {});
});
test('plan: unknown field and corrupt snapshot', () => {
  assert.throws(() => planProduct(prod(), ctx, { fields: ['nope'] }), /unknown field/);
  assert.deepEqual(parseSnapshot('{not json'), {});
  assert.deepEqual(parseSnapshot('[1,2]'), {});
  assert.equal(planProduct(prod({ synced: '{bad' }), ctx, { fields: ['vendor'] }).set.vendor, 'Mosky');
});

// ---- the loop, against a fake Shopify --------------------------------------
function fake(products) {
  const store = new Map(products.map((p) => [p.id, structuredClone(p)]));
  const calls = { update: [], snap: [] };
  return {
    store, calls,
    products: () => [...store.values()].map((p) => structuredClone(p)),
    deps: {
      updateProduct: async (id, set) => { calls.update.push([id, set]); if (id === 'bad') throw new Error('boom'); Object.assign(store.get(id), set); },
      saveSnapshot: async (id, snap) => { calls.snap.push([id, snap]); store.get(id).synced = JSON.stringify(snap); },
      log: () => {}, sleep: async () => {},
    },
  };
}
const cfg = (f, extra = {}) => ({
  products: f.products(), shopName: 'Hifi Password', tagRules: rules, fields: ['vendor', 'tags', 'title'],
  brandById: new Map([['111', 'Mosky'], ['222', 'Joyo']]), only: [], apply: true, adopt: false, overwrite: false, ...extra,
});

test('runSync: preview writes nothing', async () => {
  const f = fake([prod()]);
  const s = await runSync(cfg(f, { apply: false }), f.deps);
  assert.equal(f.calls.update.length, 0);
  assert.equal(s.changed, 1);
});
test('runSync: apply writes once, second run is a no-op', async () => {
  const f = fake([prod()]);
  const s1 = await runSync(cfg(f), f.deps);
  assert.equal(s1.changed, 1);
  assert.equal(f.calls.update.length, 1);
  assert.equal(f.calls.snap.length, 1);
  const s2 = await runSync(cfg(f), f.deps);
  assert.equal(s2.changed, 0);
  assert.equal(s2.unchanged, 1);
  assert.equal(f.calls.update.length, 1);   // nothing new written
});
test('runSync: one failing product does not stop the rest; counts are right', async () => {
  const f = fake([prod({ id: 'bad' }), prod({ id: 'gid://shopify/Product/2', aeId: '222' })]);
  const s = await runSync(cfg(f), f.deps);
  assert.equal(s.failed, 1);
  assert.equal(s.changed, 1);
  assert.equal(f.store.get('gid://shopify/Product/2').vendor, 'Joyo');
});
test('runSync: unmanaged products untouched; products outside the catalog still get keyword tags', async () => {
  const f = fake([prod({ id: 'x', aeId: null }), prod({ id: 'y', aeId: '999' })]);
  const s = await runSync(cfg(f), f.deps);
  assert.equal(s.considered, 1);                 // only the imported one
  assert.equal(s.notInCatalog, 1);
  assert.equal(f.store.get('x').vendor, 'Hifi Password');
  assert.equal(f.store.get('y').vendor, 'Hifi Password'); // no brand known -> vendor untouched
  assert.ok(f.store.get('y').tags.includes('Delay'));      // keyword tags need no brand
});
test('runSync: --only limits to one brand', async () => {
  const f = fake([prod(), prod({ id: 'gid://shopify/Product/2', aeId: '222' })]);
  const s = await runSync(cfg(f, { only: ['joyo'] }), f.deps);
  assert.equal(s.considered, 1);
  assert.equal(f.store.get('gid://shopify/Product/1').vendor, 'Hifi Password');
});
test('runSync: --adopt records a baseline for already-correct products without rewriting fields', async () => {
  const f = fake([prod({ vendor: 'Mosky', tags: ['Mosky', 'Delay', 'Overdrive', 'Distortion', 'Looper'], descriptionHtml: '<p>x</p>' })]);
  const none = await runSync(cfg(f), f.deps);
  assert.equal(f.calls.snap.length, 0);          // without --adopt: nothing written
  const s = await runSync(cfg(f, { adopt: true }), f.deps);
  assert.equal(s.adopted, 1);
  assert.equal(f.calls.update.length, 0);
  assert.deepEqual(f.calls.snap[0][1], { vendor: 'Mosky' });
});

import { extractProductKey } from './catalogUtil.js';
test('extractProductKey: AE id/url, Shopify gid, admin url, junk', () => {
  assert.equal(extractProductKey('3256812951317449'), '3256812951317449');
  assert.equal(extractProductKey('https://www.aliexpress.com/item/1005001234567890.html'), '1005001234567890');
  assert.equal(extractProductKey('gid://shopify/Product/10346479681753'), '10346479681753');
  assert.equal(extractProductKey('https://admin.shopify.com/store/hifi-password/products/10346479681753'), '10346479681753');
  assert.equal(extractProductKey('hello'), null);
});
test('runSync: --product limits to one product by AE id or Shopify id, and reports a miss', async () => {
  const mk = () => fake([prod(), prod({ id: 'gid://shopify/Product/2', aeId: '222' })]);
  let f = mk();
  let s = await runSync(cfg(f, { productKeys: ['222'] }), f.deps);
  assert.equal(s.considered, 1);
  assert.equal(f.store.get('gid://shopify/Product/1').vendor, 'Hifi Password');
  f = mk();
  s = await runSync(cfg(f, { productKeys: ['1'] }), f.deps);            // Shopify numeric id
  assert.equal(s.considered, 1);
  assert.equal(f.store.get('gid://shopify/Product/1').vendor, 'Mosky');
  f = mk();
  s = await runSync(cfg(f, { productKeys: ['424242'] }), f.deps);
  assert.deepEqual(s.unmatchedKeys, ['424242']);
});
