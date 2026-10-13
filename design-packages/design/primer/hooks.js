// Primer's design-specific build logic: the page scripts' data written from the content (the six steps, the lesson in
// the exercise book, the red pen, subjects, levels and rates, lesson lengths, how often, words, times and tutors) and
// the rules the schema can't express (lines that fit a page in the handwriting, a score within its total, real times,
// widths of the big type). Runs at build time only.
'use strict';
const { FILTERS } = require('../../engine/template');
const js = FILTERS.js;

const WINDOWS = ['[0,.14]', '[.14,.3]', '[.3,.48]', '[.48,.64]', '[.64,.82]', '[.82,1]'];
const num = (n) => String(+(+n).toFixed(3)).replace(/^(-?)0\./, '$1.');
const list = (a) => a.map(js).join(',');

function derive(c) {
  const L = c.lesson, P = c.price;
  return {
    tel: c.contact.phone.replace(/[^\d+]/g, ''),
    businessSaid: c.business.name.replace(/\s*&\s*/g, ' and '),
    brandSaid: c.brand.name.replace(/\s*&\s*/g, ' and '),
    stagesJs: c.stages.map((s, i) => ` {n:${js(s.n)},c:${js(s.c)},w:${WINDOWS[i]}}`).join(',\n'),
    lessonJs: `{topic:${js(L.topic)},question:${js(L.question)},idea:${js(L.idea)},sketch:${js(L.sketch)},\n example:[${list(L.example)}],exampleLabel:${js(L.exampleLabel)},tryLabel:${js(L.tryLabel)},tryQ:${js(L.tryQ)},wrong:${js(L.wrong)},fix:${js(L.fix)},right:${js(L.right)},\n minutes:${L.minutes},tries:${L.tries},score:${L.score},of:${L.of},confidence:${js(L.confidence)},start:${js(L.start)}}`,
    red: c.theme.accent,
    subjectsJs: c.subjects.list.map((s) => ` {n:${js(s.n)},d:${js(s.d)},col:${js(s.col)},sign:${js(s.sign)},levels:[${list(s.levels)}]}`).join(',\n'),
    levelsJs: `[${P.levels.map((l) => `{n:${js(l.n)},d:${js(l.d)},rate:${num(l.rate)}}`).join(',')}]`,
    lengthsJs: P.lengths.join(','),
    freqsJs: `[${P.freqs.map((f) => `{n:${js(f.n)},x:${num(f.x)}}`).join(',')}]`,
    wordsJs: `{${['min', 'hour', 'each', 'week', 'term', 'weeks'].map((k) => `${k}:${js(P.words[k])}`).join(',')},sent:${js(c.trial.words.sent)},reply:${js(c.trial.words.reply)}}`,
    lv: String(Math.min(1, P.levels.length - 1)),
    ln: String(Math.min(1, P.lengths.length - 1)),
    timesJs: `[${list(c.trial.times)}]`,
    tutorsJs: `[${c.trial.tutors.map((t) => `{n:${js(t.n)},does:${js(t.does)}}`).join(',')}]`,
  };
}

// Widths of the big display type (Bricolage Grotesque 800, -.025em), in em (metrics.json), and of the handwriting
// (Kalam) in the exercise book. Hero title: 1440x900 desktop, 82.8px (9.2vh) in a 520px column, 6.2 em; the two lines
// together may take four lines before the copy reaches the card (checked 1280x720 to 1920x1080). Phone: 48px in 288px
// on a 320px phone: no word wider than 6 em. Section titles: 41.6px there: no word wider than 6.9 em.
// The book's left page writes from .15 of its width to the ticks at .86 (.71 page units, less a little air): the question at .068, other lines at .06.
// Phone nav row on a 360px phone: the logo (28px), the brand (Bricolage 21px) and the button (Nunito Sans 700, 14px,
// 32px of padding) with their gaps in 328px.
const LIMITS = { heroEm: 6.2, heroLines: 4, heroWord: 6, sectionWord: 6.9, navRow: 238, line: 0.66 };
function wrapLines(words, width, em) { let n = 1, w = 0; const sp = em(' '); for (const word of words) { const ww = em(word); if (w && w + sp + ww > width) { n++; w = ww; } else w += (w ? sp : 0) + ww; } return n; }

function validate(c, ctx) {
  const e = [];
  const em = (t) => ctx.textEm('display', String(t)), hand = (t) => ctx.textEm('hand', String(t));
  const words = (s) => String(s).split(/\s+/).filter(Boolean);
  const L = c.lesson;
  if (L.score > L.of) e.push('lesson.score: no more than lesson.of');
  // every handwritten line fits its page
  const lines = [['lesson.question', L.question, 0.068, 0], ['lesson.wrong', L.wrong, 0.06, 0.04], ['lesson.fix', '→ ' + L.fix, 0.058, 0.04], ['lesson.right', L.right, 0.06, 0.04], ['lesson.tryQ', `${L.tryLabel}: ${L.tryQ}`, 0.05, 0]];
  L.example.forEach((s, i) => lines.push([`lesson.example.${i}`, s, 0.06, 0.04]));
  for (const [p, s, size, ind] of lines) { const w = hand(s) * size + ind; if (w > LIMITS.line) e.push(`${p}: "${s}" is too long for a line of the exercise book; shorten it`); }
  c.trial.times.forEach((t, i) => { if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(t)) e.push(`trial.times.${i}: a time like 16:00 (24-hour)`); });
  // the big type
  const n = wrapLines(words(c.hero.title), LIMITS.heroEm, em) + wrapLines(words(c.hero.titleEm), LIMITS.heroEm, em);
  if (n > LIMITS.heroLines) e.push(`hero.title + hero.titleEm: the hero title takes ${n} lines on a desktop (room for ${LIMITS.heroLines}); shorten one`);
  for (const p of ['hero.title', 'hero.titleEm']) for (const w of words(ctx.get(c, p))) { const x = em(w); if (x > LIMITS.heroWord) e.push(`${p}: the word "${w}" is too wide for a phone (${x.toFixed(2)} em, room for ${LIMITS.heroWord})`); }
  for (const p of ['subjects.title', 'subjects.titleEm', 'price.title', 'price.titleEm', 'trial.title', 'trial.titleEm']) for (const w of words(ctx.get(c, p))) { const x = em(w); if (x > LIMITS.sectionWord) e.push(`${p}: the word "${w}" is too wide for a phone (${x.toFixed(2)} em, room for ${LIMITS.sectionWord})`); }
  const nav = em(c.brand.name) * 21 + ctx.textEm('cta', c.nav.cta) * 14;
  if (nav > LIMITS.navRow) e.push(`brand.name + nav.cta: the phone nav row needs ${Math.round(nav)}px of text, a 360px phone has ${LIMITS.navRow}px`);
  return e;
}

module.exports = { derive, validate, LIMITS };
