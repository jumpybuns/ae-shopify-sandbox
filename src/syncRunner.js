// src/syncRunner.js
//
// The reconcile loop. All I/O comes in through `deps`, so this runs against
// fakes in tests and against Shopify from scripts/syncProducts.mjs.
//
//   deps.updateProduct(id, set)      write product fields
//   deps.saveSnapshot(id, snapshot)  store what was written
//   deps.log(line)                   output
//   deps.sleep(ms)                   pacing between writes

import { planProduct } from './reconcile.js';
import { normalizeBrand } from './catalogUtil.js';

export async function runSync(cfg, deps) {
  const { products, shopName, brandById, tagRules, fields, only, apply, adopt, overwrite, productKeys } = cfg;
  const { updateProduct, saveSnapshot, log, sleep } = deps;

  let imported = products.filter((p) => p.aeId);
  if (only?.length) {
    const wanted = only.map(normalizeBrand);
    imported = imported.filter((p) => wanted.includes(normalizeBrand(brandById.get(p.aeId))));
  }

  // --product: match an AliExpress id or a Shopify product id (gid or bare number).
  const unmatchedKeys = [];
  if (productKeys?.length) {
    const hit = (p, k) => p.aeId === k || p.id === k || p.id.endsWith('/' + k);
    for (const k of productKeys) if (!imported.some((p) => hit(p, k))) unmatchedKeys.push(k);
    imported = imported.filter((p) => productKeys.some((k) => hit(p, k)));
  }

  const summary = {
    unmatchedKeys,
    considered: imported.length, changed: 0, unchanged: 0, withSkips: 0,
    failed: 0, notInCatalog: 0, adopted: 0, results: [],
  };

  for (const p of imported) {
    const brand = brandById.get(p.aeId);
    if (!brand) summary.notInCatalog++;
    const plan = planProduct(p, { brand, shopName, tagRules }, { fields, overwrite });

    const writeFields = Object.keys(plan.set).length > 0;
    const writeSnapshot = plan.snapshotChanged && (writeFields || adopt);

    if (plan.skipped.length) summary.withSkips++;
    if (!writeFields && !writeSnapshot && !plan.skipped.length) { summary.unchanged++; continue; }

    log(`${p.title.slice(0, 70)}  (AE ${p.aeId})`);
    for (const c of plan.changes) log(`  CHANGE ${c.field.padEnd(11)} ${JSON.stringify(c.from).slice(0, 70)} -> ${JSON.stringify(c.to).slice(0, 70)}`);
    for (const s of plan.skipped) log(`  SKIP   ${s.field.padEnd(11)} ${s.reason}`);
    if (!writeFields && writeSnapshot) log('  ADOPT  current values recorded as the baseline');

    const result = { id: p.id, aeId: p.aeId, changes: plan.changes, skipped: plan.skipped, status: 'preview' };
    summary.results.push(result);

    if (!writeFields && !writeSnapshot) continue;
    if (!apply) { if (writeFields) summary.changed++; else summary.adopted++; continue; }

    try {
      if (writeFields) await updateProduct(p.id, plan.set);
      if (writeSnapshot) await saveSnapshot(p.id, plan.snapshot);
      result.status = 'written';
      if (writeFields) summary.changed++; else summary.adopted++;
    } catch (err) {
      result.status = 'failed';
      result.error = err?.message || String(err);
      summary.failed++;
      log(`  FAILED: ${result.error}`);
    }
    await sleep(300);
  }
  return summary;
}
