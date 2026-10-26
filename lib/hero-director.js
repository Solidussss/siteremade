// THE HERO DIRECTOR: a customer sends their photos with a website request; this decides how the design's hero uses
// them. Claude looks at the photos (vision, on SiteRemade's own key: the owner's cost, never the customer's) and picks
// the photo that should end the hero, a "before" if there is one, up to two for the middle, where each photo's subject
// is (so phones crop around it), which way the camera drifts and how far it pushes in, and which photos to leave out
// (blurry, a screenshot, a flyer, someone's face up close without a reason). Without a key, or when the answer doesn't
// fit, the customer's own order is used: their first photo ends the hero, the next two are the middle.
//
// The plan goes into the design as fields the owner can still change in the editor:
//   photo hero designs (design.json "photoHero")  photos.before, photos.second, photos.third, photos.main, photos.camera
//   the barber and dentist designs                hero.before, hero.photo2, hero.photo3, hero.photo
'use strict';

const { ORDER } = require('../design-packages/engine/photo-hero');

const MODEL = 'claude-sonnet-5-5';
const MAX_PHOTOS = 8;

const SCHEMA = {
  type: 'object', additionalProperties: false,
  required: ['main', 'before', 'middle', 'camera', 'skip', 'note'],
  properties: {
    main: { type: 'integer', description: 'the photo number that ends the hero: the strongest picture of the finished work, the place or the team' },
    before: { type: 'integer', description: 'the photo number of a true "before" of the same thing as main, or 0 when there is none' },
    middle: { type: 'array', items: { type: 'integer' }, description: 'up to two photo numbers for the middle of the scroll, in the order they should appear' },
    camera: {
      type: 'array', description: 'one entry for each photo used',
      items: {
        type: 'object', additionalProperties: false, required: ['photo', 'focus_x', 'focus_y', 'drift', 'zoom'],
        properties: {
          photo: { type: 'integer' },
          focus_x: { type: 'number', description: 'where the subject is, 0 (left edge) to 100 (right edge)' },
          focus_y: { type: 'number', description: 'where the subject is, 0 (top) to 100 (bottom)' },
          drift: { type: 'string', enum: ['left', 'right'], description: 'which way the camera slides while scrolling' },
          zoom: { type: 'number', description: 'how far the camera pushes in by the end of the photo, 1.05 (barely) to 1.5 (a lot)' },
        },
      },
    },
    skip: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['photo', 'why'], properties: { photo: { type: 'integer' }, why: { type: 'string' } } } },
    note: { type: 'string', description: 'one or two plain sentences for the website owner about the choice' },
  },
};

const SYSTEM = `You arrange a small business's own photos into the opening screen of its new website.

The opening screen is a scroll scene. While the visitor scrolls, up to four photos play as chapters: a "before" (only if there is one), up to two middle photos, then the main photo, which stays at the end. Each new photo wipes in from the left behind a thin light line. Inside each chapter the camera slowly slides sideways and pushes in toward the point you choose.

The business's headline and buttons sit over the left half of the screen on computers and over the top half on phones, on a soft veil. Phones show a tall, narrow crop of each photo, centred on your focus point, so put the focus on the subject (the haircut, the plate, the car, the garden, the room), not on empty space.

Choose like a careful art director:
- main: the single best photo of the result or the place. Sharp, well lit, clearly this business.
- before: only a real before of the same thing as main (the same garden, room, car, hair). Otherwise 0.
- middle: the photos that tell the story best on the way to main (the work in progress, details, the team). Up to two. Leave it empty rather than use weak photos.
- skip: photos that would hurt the site: blurry, dark, a screenshot, a flyer or text-heavy image, a near-duplicate, or a close-up of a person's face that isn't the point. Say why in a few words.
- camera: for every photo you use, the subject's position, the drift (alternate left and right so the chapters don't all move the same way), and the zoom (gentle, around 1.15 to 1.3, more for wide shots, less for close-ups).
- note: tell the owner in one or two plain sentences what you chose and anything to ask the customer for (for example a sharper photo of the shop front).

Photos are numbered from 1 in the order the customer sent them. Use each photo at most once.`;

// the plan without a model: the customer's own order
function byOrder(n) {
  return { main: 1, before: 0, middle: [2, 3].filter((i) => i <= n), camera: [], skip: [], note: 'Photos used in the order the customer sent them: the first ends the hero.' };
}

// the model's answer, kept only if it fits the photos there are (numbers in range, nothing used twice, a main photo)
function checkPlan(j, n) {
  if (!j || typeof j !== 'object') return null;
  const ok = (i) => Number.isInteger(i) && i >= 1 && i <= n;
  if (!ok(j.main)) return null;
  const used = new Set([j.main]);
  const before = ok(j.before) && !used.has(j.before) ? j.before : 0; if (before) used.add(before);
  const middle = (Array.isArray(j.middle) ? j.middle : []).filter((i) => ok(i) && !used.has(i) && used.add(i)).slice(0, 2);
  const num = (v, lo, hi, d) => (typeof v === 'number' && isFinite(v) ? Math.min(hi, Math.max(lo, v)) : d);
  const camera = (Array.isArray(j.camera) ? j.camera : []).filter((c) => c && ok(c.photo)).map((c) => ({ photo: c.photo, fx: Math.round(num(c.focus_x, 0, 100, 50)), fy: Math.round(num(c.focus_y, 0, 100, 45)), dir: c.drift === 'left' ? -1 : 1, zoom: +num(c.zoom, 1.05, 1.5, 1.24).toFixed(2) }));
  const skip = (Array.isArray(j.skip) ? j.skip : []).filter((s) => s && ok(s.photo) && !used.has(s.photo)).map((s) => ({ photo: s.photo, why: String(s.why || '').slice(0, 160) }));
  return { main: j.main, before, middle, camera, skip, note: String(j.note || '').replace(/\s+/g, ' ').trim().slice(0, 400) };
}

// Claude, looking at the photos. call({ images: [{ mime, b64 }], brief }) -> { plan, usage }
function claudeDirector(key, model = MODEL) {
  return async ({ images, brief }) => {
    if (!key) throw new Error('The hero director is not configured on this server.');
    const content = [];
    images.forEach((im, i) => { content.push({ type: 'text', text: `Photo ${i + 1}` }, { type: 'image', source: { type: 'base64', media_type: im.mime, data: im.b64 } }); });
    content.push({ type: 'text', text: brief });
    const body = JSON.stringify({ model, max_tokens: 4000, system: SYSTEM, messages: [{ role: 'user', content }], output_config: { effort: 'medium', format: { type: 'json_schema', schema: SCHEMA } } });
    let r, tries = 0;
    for (;;) {
      r = await fetch('https://api.anthropic.com/v1/messages', { method: 'POST', headers: { 'content-type': 'application/json', 'x-api-key': key, 'anthropic-version': '2023-06-01' }, body });
      if ((r.status === 429 || r.status === 529 || r.status >= 500) && tries++ < 2) { await new Promise((ok) => setTimeout(ok, 4000 * tries)); continue; }
      break;
    }
    if (!r.ok) throw new Error(`hero director error ${r.status}`);
    const j = await r.json();
    if (j.stop_reason === 'refusal') throw new Error('the hero director declined these photos');
    if (j.stop_reason === 'max_tokens') throw new Error('the hero director’s answer was cut off');
    const text = (j.content || []).filter((b) => b.type === 'text').map((b) => b.text).join('');
    return { plan: JSON.parse(text), usage: { model, input: j.usage.input_tokens || 0, output: j.usage.output_tokens || 0 } };
  };
}
// estimated cost (USD) at $2 / $10 per million input / output tokens
const cost = (u) => (u ? (u.input * 2 + u.output * 10) / 1e6 : 0);

// the plan for these photos ([{ mime, data: Buffer }]), by Claude when `call` is given, else in the customer's order
async function direct(photos, { call = null, design = '', category = '', businessName = '' } = {}) {
  const list = photos.slice(0, MAX_PHOTOS), n = list.length;
  if (!n) return null;
  let plan = null, by = 'order', usage = null, problem = null;
  if (call) {
    try {
      const brief = `The business: ${businessName || 'a small business'}${category ? `, a ${category}` : ''}. The website design: ${design || 'a scroll-scene design'}. Arrange its ${n} photo${n > 1 ? 's' : ''} for the opening screen.`;
      const r = await call({ images: list.map((p) => ({ mime: p.mime, b64: Buffer.from(p.data).toString('base64') })), brief });
      usage = r.usage || null; plan = checkPlan(r.plan, n);
      if (plan) by = 'claude'; else problem = 'the answer didn’t fit the photos';
    } catch (e) { problem = String(e && e.message || e).slice(0, 200); }
  }
  return { plan: plan || byOrder(n), by, usage, costUsd: +cost(usage).toFixed(4), problem };
}

// the editor changes that put the plan into a design: [{ path, value }] (none when the design takes no photos)
function changes(d, plan, urls) {
  const opt = (d.schema && d.schema.optional) || {};
  const pick = { before: plan.before, second: plan.middle[0] || 0, third: plan.middle[1] || 0, main: plan.main };
  if (d.manifest && d.manifest.photoHero) {
    const out = ORDER.filter((k) => pick[k]).map((k) => ({ path: `photos.${k}`, value: urls[pick[k] - 1] }));
    // the camera, one entry per photo in chapter order ("fx fy dir zoom"); the defaults where the plan has none
    const cam = ORDER.filter((k) => pick[k]).map((k) => plan.camera.find((c) => c.photo === pick[k]));
    if (cam.some(Boolean)) out.push({ path: 'photos.camera', value: cam.map((c, i) => (c ? `${c.fx} ${c.fy} ${c.dir} ${c.zoom}` : `50 45 ${i % 2 ? -1 : 1} 1.24`)).join(';') });
    return out;
  }
  if (opt['hero.photo']) {
    const map = { before: 'hero.before', second: 'hero.photo2', third: 'hero.photo3', main: 'hero.photo' };
    return ORDER.filter((k) => pick[k] && opt[map[k]]).map((k) => ({ path: map[k], value: urls[pick[k] - 1] }));
  }
  return [];
}

module.exports = { MODEL, MAX_PHOTOS, SCHEMA, SYSTEM, byOrder, checkPlan, claudeDirector, cost, direct, changes };
