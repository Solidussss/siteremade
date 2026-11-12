'use strict';
// BESPOKE (v5) -- what can be checked in code on a bespoke page before anyone looks at it.
//   check(html, { facts, usedFonts, media }) -> { errors: [..], warnings: [..], fonts: { display, all } }
// errors block the page (the writer gets them back and fixes them); warnings are passed to the visual review.
const { BANNED_FONTS, BANNED_WORDS, ALLOWED_EXTERNAL } = require('./rules');

const strip = (html) => html.replace(/<script[\s\S]*?<\/script>/gi, ' ').replace(/<style[\s\S]*?<\/style>/gi, ' ')
  .replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&#x27;|&rsquo;|&#39;/g, "'").replace(/\s+/g, ' ');
const norm = (s) => String(s).toLowerCase().replace(/\s+/g, '').replace(/:00(?=[ap]m)/g, '').replace(/[–—]/g, '-');
const digits = (s) => String(s).replace(/\D/g, '');

// the Google Fonts families a page loads, in order (the first one listed is taken as the display font unless the
// page marks its own with --disp / --display)
function fontsOf(html) {
  const all = [];
  for (const m of html.matchAll(/fonts\.googleapis\.com\/css2\?([^"'\s>]+)/g)) {
    for (const f of m[1].split('&')) if (f.startsWith('family=')) all.push(decodeURIComponent(f.slice(7).split(':')[0].replace(/\+/g, ' ')));
  }
  let display = all[0] || null;
  const v = html.match(/--(?:disp|display)\s*:\s*["']?([^"',;]+)/);
  if (v && all.includes(v[1].trim())) display = v[1].trim();
  return { all, display };
}

// numbers a visitor would act on, found in the visible text: prices, phone numbers, clock times, percentages
function claims(text) {
  const out = [];
  for (const m of text.matchAll(/[$€£]\s?\d[\d,]*(?:\.\d{2})?/g)) out.push({ kind: 'price', value: m[0] });
  for (const m of text.matchAll(/\(?\b\d{3}\)?[\s.-]\d{3}[\s.-]\d{4}\b/g)) out.push({ kind: 'phone', value: m[0] });
  for (const m of text.matchAll(/\b\d{1,2}(?::\d{2})?\s?(?:am|pm)\b/gi)) out.push({ kind: 'time', value: m[0] });
  for (const m of text.matchAll(/\b\d+(?:\.\d+)?\s?%/g)) out.push({ kind: 'percent', value: m[0] });
  return out;
}
function inFacts(c, corpus, corpusDigits) {
  if (c.kind === 'phone') return corpusDigits.includes(digits(c.value));
  if (c.kind === 'price') return corpus.includes(norm(c.value).replace(/^[$€£]/, ''));
  return corpus.includes(norm(c.value));
}

function check(html, { facts = {}, usedFonts = [], media = null } = {}) {
  const errors = [], warnings = [];
  const need = (ok, msg) => { if (!ok) errors.push(msg); };
  need(/^\s*<!doctype html>/i.test(html), 'Start with <!doctype html>.');
  need(/<html[^>]*\slang=["'][a-z]{2}/i.test(html), 'Set <html lang>.');
  need(/<title>[^<]{3,}<\/title>/i.test(html), 'Add a <title>.');
  need(/<meta[^>]+name=["']description["'][^>]+content=(["'])(?:(?!\1)[\s\S]){20,}?\1/i.test(html), 'Add a meta description.');
  need(/<meta[^>]+name=["']robots["'][^>]+content=["'][^"']*noindex/i.test(html), 'Add <meta name="robots" content="noindex">.');
  const css = (html.match(/<style[^>]*>([\s\S]*?)<\/style>/i) || [, ''])[1];
  need(/^\s*html\s*,\s*body\s*\{[^}]*background/i.test(css), 'The first CSS rule must be html,body{background:...}.');
  need(/overflow-x\s*:\s*clip/i.test(css), 'Use overflow-x:clip on html and body.');
  need(/prefers-reduced-motion/i.test(html), 'Handle prefers-reduced-motion.');
  need(/\[\?&\]still|[?&]still\b/.test(html), 'Support still mode (?still in the URL shows the final state).');
  need(/classList\.add\(\s*['"]js['"]\s*\)/.test(html) && /setTimeout\([\s\S]{0,400}?,\s*(\d{3,4})\s*\)/.test(html), 'Fail safe: add a "js" class before hiding anything, and a setTimeout that forces content visible.');
  const t = html.match(/setTimeout\([\s\S]{0,400}?,\s*(\d{3,5})\s*\)/);
  if (t && Number(t[1]) > 3500) errors.push('The fail-safe timeout must be 3500 ms or less.');
  need(/<a[^>]+href=["']#main["'][^>]*>/i.test(html) && /id=["']main["']/.test(html), 'Add a skip link to #main and an element with id="main".');
  need(/:focus-visible|:focus\b/.test(css), 'Add visible focus styles.');
  if (/href=["']#["']/.test(html)) errors.push('Every link must go somewhere (no href="#").');
  for (const m of html.matchAll(/<img\b[^>]*>/gi)) if (!/\balt=["'][^"']*["']/i.test(m[0])) { errors.push('Every <img> needs alt text.'); break; }

  // nothing from outside except Google Fonts and the two pinned libraries; images only from media/
  for (const m of html.matchAll(/\b(?:src|href)=["'](https?:\/\/[^"']+)["']/gi)) {
    const u = m[1], tag = html.slice(Math.max(0, m.index - 60), m.index);
    if (/<a\b[^>]*$/i.test(tag)) continue; // ordinary outbound links are fine
    if (!ALLOWED_EXTERNAL.some((r) => r.test(u))) errors.push(`Not allowed to load ${u.slice(0, 80)} (only Google Fonts, gsap@3.12.5, lenis@1.1.13).`);
  }
  for (const m of html.matchAll(/url\(\s*["']?(https?:[^"')]+)/gi)) if (!ALLOWED_EXTERNAL.some((r) => r.test(m[1]))) errors.push(`Not allowed: background ${m[1].slice(0, 80)}.`);
  if (media) for (const m of html.matchAll(/media\/([A-Za-z0-9._-]+)/g)) if (!media.includes(m[1])) errors.push(`media/${m[1]} is not one of the prepared photos.`);

  const fonts = fontsOf(html);
  if (!fonts.all.length) warnings.push('No Google Fonts found.');
  for (const f of fonts.all) if (BANNED_FONTS.includes(f)) errors.push(`${f} is not allowed.`);
  if (fonts.display && usedFonts.map((x) => x.toLowerCase()).includes(fonts.display.toLowerCase())) errors.push(`The display font ${fonts.display} is already used by another site: pick another.`);

  const text = strip(html), lower = text.toLowerCase();
  for (const w of BANNED_WORDS) if (lower.includes(w)) errors.push(`Remove "${w}" from the copy.`);
  if (/\w -\w|\w- \w/.test(text)) warnings.push('A hyphen sits inside a sentence; rewrite without it.');
  const corpus = norm(JSON.stringify(facts)), corpusDigits = digits(JSON.stringify(facts));
  for (const c of claims(text)) if (!inFacts(c, corpus, corpusDigits)) errors.push(`"${c.value}" (${c.kind}) is not in the fact sheet: remove it or use the exact fact.`);
  return { errors: [...new Set(errors)], warnings, fonts };
}

module.exports = { check, fontsOf, claims, strip };
