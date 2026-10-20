// src/productText.js
//
// AliExpress listing titles are keyword-stuffed ("MOSKY DTC 4-in-1 Electric
// Guitar Effects Pedal Distortion + Overdrive + Loop + Delay True Bypass Guitar
// Parts & Accessories"). A storefront wants a short title, with the long text
// kept as the product description instead of thrown away.

const SHORT_OK = 60;      // titles this short are left alone
const SHORT_MAX = 70;     // hard cap when we have to cut at a word boundary
const MIN_CUT = 25;       // don't cut so early the title becomes meaningless

// Trailing junk left after a cut: separators and dangling connector words.
const TRAIL = /[\s+&,\-/|:;]+$|\s+(?:and|with|for|or|the|a|of|in)$/i;

export function shortTitle(full) {
  const t = String(full || '').replace(/\s+/g, ' ').trim();
  if (t.length <= SHORT_OK) return t;

  // Prefer the first natural separator: " + ", " & ", ",", " | ", " - ".
  const re = /\s+[+&|]\s+|\s*,\s*|\s+-\s+/g;
  let m;
  while ((m = re.exec(t))) {
    if (m.index >= MIN_CUT && m.index <= SHORT_MAX + 10) return t.slice(0, m.index).trim();
    if (m.index > SHORT_MAX + 10) break;
  }

  // Otherwise cut at the last word boundary within the cap.
  const cut = t.slice(0, SHORT_MAX + 1);
  const lastSpace = cut.lastIndexOf(' ');
  let out = (lastSpace >= MIN_CUT ? cut.slice(0, lastSpace) : t.slice(0, SHORT_MAX)).trim();
  while (TRAIL.test(out)) out = out.replace(TRAIL, '');
  return out;
}

const esc = (s) =>
  String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** The full original title as description HTML. */
export function descriptionFromTitle(full) {
  const t = String(full || '').replace(/\s+/g, ' ').trim();
  return t ? `<p>${esc(t)}</p>` : '';
}
