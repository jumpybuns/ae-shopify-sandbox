// src/tagRules.js
//
// Tags are derived from a keyword list YOU control (catalog/tags.txt), not by
// splitting titles into words (which would turn "Electric", "Guitar", "+" and
// "4-in-1" into tags).
//
// File format, one rule per line:
//   Delay: delay, echo, tape echo
//   Overdrive: overdrive, drive
// A product gets the tag on the left when any keyword on the right appears as
// a whole word (case-insensitive) in its title or description. '#' = comment.

import fs from 'node:fs';

export function parseTagRules(text) {
  const rules = [];
  String(text).split(/\r?\n/).forEach((raw, i) => {
    const line = raw.replace(/\s+#.*$/, '').trim();
    if (!line || line.startsWith('#')) return;
    const m = line.match(/^([^:]+):(.*)$/);
    if (!m) throw new Error(`tag rules line ${i + 1}: expected "Tag: keyword, keyword", got "${line}"`);
    const tag = m[1].trim();
    const keywords = m[2].split(',').map((k) => k.trim()).filter(Boolean);
    if (!tag || !keywords.length) throw new Error(`tag rules line ${i + 1}: needs a tag name and at least one keyword`);
    rules.push({ tag, keywords });
  });
  return rules;
}

/** Missing file is not an error: no rules means no keyword tags. */
export function loadTagRules(filePath = process.env.TAG_RULES_FILE || 'catalog/tags.txt') {
  if (!fs.existsSync(filePath)) return [];
  return parseTagRules(fs.readFileSync(filePath, 'utf8'));
}

const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

export function stripHtml(html) {
  return String(html || '').replace(/<[^>]*>/g, ' ').replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim();
}

/** Tags whose keywords appear as whole words in `text`. Order follows the rules file. */
export function matchTags(text, rules) {
  const hay = String(text || '');
  const out = [];
  for (const { tag, keywords } of rules || []) {
    const hit = keywords.some((k) => new RegExp(`(^|[^a-z0-9])${escapeRe(k)}([^a-z0-9]|$)`, 'i').test(hay));
    if (hit && !out.some((t) => t.toLowerCase() === tag.toLowerCase())) out.push(tag);
  }
  return out;
}

/** The brand plus every rule tag matching `text`, de-duplicated case-insensitively. */
export function buildTags(brand, text, rules) {
  const out = [];
  for (const t of [brand, ...matchTags(text, rules)]) {
    if (t && !out.some((o) => o.toLowerCase() === t.toLowerCase())) out.push(t);
  }
  return out;
}
