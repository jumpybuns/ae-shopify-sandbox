import test from 'node:test';
import assert from 'node:assert/strict';
import { markedUpPrice, matchAeVariant } from './pricing.js';

test('markedUpPrice adds 40% and rejects a bad cost', () => {
  assert.equal(markedUpPrice('31.99', 1.4), '44.79');
  assert.equal(markedUpPrice('70.39', 1), '70.39');
  assert.equal(markedUpPrice('0', 1.4), null);
  assert.equal(markedUpPrice('12.00', 0), null);
});

test('matchAeVariant prefers sku_attr over SKU index', () => {
  const ae = [
    { skuAttr: '14:193', price: '10.00' },
    { skuAttr: '14:200', price: '12.00' },
  ];
  const hit = matchAeVariant({ sku: 'AE-99-0', skuAttr: '14:200' }, ae, '99');
  assert.equal(hit.price, '12.00');
  assert.equal(matchAeVariant({ sku: 'AE-99-1', skuAttr: 'missing' }, ae, '99'), null);
  assert.equal(matchAeVariant({ sku: 'AE-99-1' }, ae, '99').price, '12.00');
  assert.equal(matchAeVariant({ noSkuAttr: true }, [{ skuAttr: '', price: '5.00' }], '99').price, '5.00');
});
