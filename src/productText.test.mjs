import test from 'node:test';
import assert from 'node:assert/strict';
import { descriptionFromTitle, sanitizeDescriptionHtml, isTitlePlaceholder } from './productText.js';

const title = 'Gervana Bingzi Overdrive Effect Pedal';

test('sanitizeDescriptionHtml drops script, svg, and event handlers', () => {
  const raw = `<div class="detailmodule_text" onclick="steal()"><p>True bypass</p><script>alert(1)</script><svg><script>x</script></svg><a href="javascript:alert(1)">x</a></div>`;
  const clean = sanitizeDescriptionHtml(raw);
  assert.match(clean, /True bypass/);
  assert.doesNotMatch(clean, /script|onclick|javascript:|<svg/i);
});

test('isTitlePlaceholder matches the importer placeholder and leaves edits', () => {
  assert.equal(isTitlePlaceholder('', title), true);
  assert.equal(isTitlePlaceholder(descriptionFromTitle(title), title), true);
  assert.equal(isTitlePlaceholder('<p>My own copy</p>', title), false);
  assert.equal(isTitlePlaceholder('<p>True bypass pedal.</p><ul><li>Metal</li></ul>', title), false);
});
