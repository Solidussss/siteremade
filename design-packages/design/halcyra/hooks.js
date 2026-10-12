// Halcyra's design-specific build logic: values computed from the content (prices, the concentration chart, the
// bottle label line) and the rules the schema can't express (timeline order, concentration range, note shares, word
// widths in the hero title). Runs at build time only.
'use strict';
const ROWS = [
  { key: 'cologne', name: 'Cologne', lo: 2, hi: 5, style: 'left:6.67%;width:10%', range: '2–5%' },
  { key: 'toilette', name: 'Toilette', lo: 5, hi: 15, style: 'left:16.67%;width:33.33%', range: '5–15%' },
  { key: 'parfum', name: 'Parfum EDP', lo: 15, hi: 20, style: 'left:50%;width:16.67%', range: '15–20%' },
  { key: 'extrait', name: 'Extrait', lo: 20, hi: 30, style: 'left:66.67%;width:33.33%', range: '20–30%' },
];
const FEATURED = 1; // the middle size is the one the page leads with (the design's `let size = 1`)

function derive(c, ctx) {
  const cur = c.locale.currency, f = c.sizes.items[FEATURED];
  const total = f.ml * 10, weeks = total / (3 * 5), months = weeks / 4.345; // the calculator's opening state: 3 sprays, 5 days
  return {
    featuredMl: f.ml,
    featuredPrice: cur + f.price,
    introSmell: `${c.product.concentration}% concentrate · ${c.product.longevity} on skin`,
    labelLine: labelLine(c, ctx),
    maxShare: Math.max(...c.notes.map((n) => n.share)),
    conc: ROWS.map((r) => ({ ...r, us: r.key === c.product.concentrationType })),
    markerLeft: +(c.product.concentration / 30 * 100).toFixed(2),
    // what the calculator shows before the page script recomputes it
    init: { sprays: total.toLocaleString(c.locale.locale), last: months >= 2 ? Math.round(months) : Math.round(weeks), lastUnit: months >= 2 ? 'months' : 'weeks', perWear: cur + (f.price / (total / 3)).toFixed(2), perMl: cur + (f.price / f.ml).toFixed(2) },
    heroFit: heroFit(c, ctx) + captionFit(c, ctx),
  };
}

// Hero title guard. The title column is min(460px, 38vw) wide at up to 140px type; a word wider than 3.2 em would run
// out of the column towards the bottle. Only then, the title shrinks just enough for its longest word to fit
// (desktop), and the same on phones (64px type in the full width). Names that fit get nothing, so the original
// stays byte-for-byte.
function heroFit(c, ctx) {
  if (!ctx) return '';
  const em = Math.max(...plain(c.product.name).split(/\s+/).map((w) => ctx.textEm('heroTitle', w)));
  if (em <= 3.2) return '';
  const k = (0.96 / em).toFixed(4);
  return `@media (min-width:760px){.hero-copy h1{font-size:min(clamp(64px,8.6vw,140px),calc(min(460px,38vw) * ${k}))}}\n@media (max-width:759px){.hero-copy h1{font-size:min(64px,calc((100vw - 2 * max(16px,4.2vw)) * ${k}))}}\n`;
}
// Phone caption guard. On phones the bottle is sized once, around the caption shown at load (hero.caption). Scrolling
// swaps in the tier captions and the closing one; if one of those wraps to more lines, the text grows into the bottle.
// The original grows from 2 to 3 lines too, but happens to leave about 32px above its bottle, so it gets away with it;
// a brand's slightly different HUD can leave only 9px (seen in the live trial). So when any caption wraps to more lines
// than the opening one, the caption reserves room for the longest from the start (estimated in the real font: 15.5px
// in a 36ch column, 1.6 line height). theme.captionFit "off" keeps the original's behaviour (the default content).
function captionFit(c, ctx) {
  if (!ctx || c.theme.captionFit === 'off') return '';
  const colEm = 36 * ctx.textEm('zeroWidth', '0');
  const lines = (t) => { let n = 1, w = 0; const sp = ctx.textEm('caption', ' '); for (const word of plain(t).split(/\s+/)) { const ww = ctx.textEm('caption', word); if (w && w + sp + ww > colEm) { n++; w = ww; } else w += (w ? sp : 0) + ww; } return n; };
  const first = lines(c.hero.caption), most = Math.max(first, ...c.tiers.map((t) => lines(t.caption)), lines(c.hud.end.caption));
  return most > first ? `@media (max-width:759px){.hero-copy .caption{min-height:${(most * 1.6).toFixed(1)}em}}\n` : '';
}

// The line etched on the bottle. Its type never drops below 8px, so on phones (where the bottle shrinks to fit the
// space the text leaves) a line wider than the original's own runs off the glass. Then it uses the short type name.
function labelLine(c, ctx) {
  const f = c.sizes.items[FEATURED], tail = ` · ${c.product.concentration}% · ${f.ml} ML`;
  const full = c.product.type.toUpperCase() + tail;
  if (!ctx) return full;
  const ref = ctx.textEm('labelLine', 'EAU DE PARFUM · 18% · 50 ML');
  return ctx.textEm('labelLine', full) <= ref + 0.01 ? full : c.product.typeShort.toUpperCase() + tail;
}
const plain = (s) => String(s).replace(/\*/g, '');

function validate(c, ctx) {
  const e = [];
  const t = c.timeline;
  if (!(t.heartFrom > 0 && t.baseFrom > t.heartFrom && t.end > t.baseFrom)) e.push('timeline: heartFrom < baseFrom < end (minutes on skin)');
  const row = ROWS.find((r) => r.key === c.product.concentrationType);
  if (row && (c.product.concentration < row.lo || c.product.concentration > row.hi)) e.push(`product.concentration: ${c.product.concentration}% is outside ${row.name} (${row.range})`);
  const sum = c.notes.reduce((a, n) => a + n.share, 0);
  if (Math.abs(sum - 100) > 1) e.push(`notes.*.share: shares add up to ${sum}%, should be 100%`);
  if (c.sizes.items.some((s, i) => i && s.ml <= c.sizes.items[i - 1].ml)) e.push('sizes.items: smallest to largest');
  if (c.sizes.items.some((s, i) => i && s.price <= c.sizes.items[i - 1].price)) e.push('sizes.items: a bigger bottle must cost more than a smaller one');
  // a word of the product name may shrink the hero title (see heroFit), but not below about 48px on desktop
  for (const w of plain(c.product.name).split(/\s+/)) {
    const em = ctx.textEm('heroTitle', w);
    if (em > 8) e.push(`product.name: the word "${w}" is too long even for a shrunk hero title (${em.toFixed(2)} em, room for 8)`);
  }
  // the phone nav row: brand + buy button must fit beside the sound button on a 375px phone
  // (375 - 2 x 16 gutter - 2 x 10 gap - 78 sound button = 245px; the buy button adds 2 x 14px padding)
  const f = c.sizes.items[FEATURED], cta = `${c.nav.ctaVerb} ${f.ml} ml · ${c.locale.currency}${f.price}`;
  const navPx = ctx.textEm('navBrand', c.business.short) * 26 + ctx.textEm('navCta', cta) * 13 + 28;
  if (navPx > 245) e.push(`business.short + nav.ctaVerb + price: the phone nav row needs ${Math.round(navPx)}px, a 375px phone has 245px ("${c.business.short}" + "${cta}")`);
  // the bottle's etched lines
  const line = labelLine(c, ctx), lw = ctx.textEm('labelLine', line);
  if (lw > 31) e.push(`bottle label line "${line}" is too wide for the glass (${lw.toFixed(1)} em, room for 31): shorten product.type`);
  return e;
}

module.exports = { derive, validate, _plain: (s) => String(s).replace(/\*/g, '') };
