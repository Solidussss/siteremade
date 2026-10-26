'use strict';
// ASK FOR A CHANGE (lib/design-ask.js + the /ask route + edit's rename/via): a request in the owner's words becomes a
// plan in the editor's own terms, dry-run and shown before anything is saved; applying it is a normal edit with undo;
// the design's template (its animation) is never part of what can change. A scripted writer -- never the paid AI.
// (customers using the AI themselves: off by default now, websites are done for you; this checks the flow when it's on)
process.env.SITEREMADE_DESIGNS_AI_OPEN = 'on';
process.env.SITEREMADE_DB_PATH = ':memory:';
process.env.SITEREMADE_DESIGN_OWNER_CUTOFF = '2999-01-01T00:00:00.000Z';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const ask = require('../lib/design-ask');
const { loadDesign } = require('../design-packages/engine/engine');

const DIR = path.join(__dirname, '..', 'design-packages', 'design');
const load = (name) => ({ d: loadDesign(path.join(DIR, name)), spec: JSON.parse(fs.readFileSync(path.join(DIR, name, 'brief.json'), 'utf8')), content: JSON.parse(fs.readFileSync(path.join(DIR, name, 'default.json'), 'utf8')) });
// answers in order; records what it was sent
function scripted(answers) {
  const sent = [], usage = { calls: 0, input: 0, output: 0, cacheWrite: 0, cacheRead: 0 };
  return { name: 'scripted', usage, sent, start(p) { sent.push(p); }, feedback(t) { sent.push({ feedback: t }); }, async next() { usage.calls++; return JSON.stringify(answers.shift()); } };
}

test('a colour request becomes a checked plan: theme fields only, before -> after, nothing saved', async () => {
  const { d, spec, content } = load('steadyhand');
  const w = scripted([{ kind: 'design', summary: 'Black and gold.', changes: [{ path: 'theme.accent', value: '#a67c1e' }, { path: 'theme.room', value: '#0b0a09' }], ops: [], rename: null, cannot: [], question: null }]);
  const r = await ask.plan(d, spec, content, 'Change the colours to black and gold', w);
  assert.equal(r.ok, true, r.message);
  assert.equal(r.kind, 'design');
  assert.deepEqual(r.diff.map((x) => [x.path, x.before, x.after]), [['theme.accent', '#e23b2f', '#a67c1e'], ['theme.room', '#131110', '#0b0a09']]);
  // the writer only ever sees the editable fields -- the template (drawing, scroll scenes, animation) is not in the prompt
  assert.match(w.sent[0].user, /theme\.accent \[colour\]/);
  assert.doesNotMatch(w.sent[0].user + w.sent[0].system, /<canvas|requestAnimationFrame|getContext/);
  assert.match(w.sent[0].system, /cannot see or change/);
});

test('a plan that breaks the rules goes back once, then the fixed one is shown', async () => {
  const { d, spec, content } = load('steadyhand');
  const w = scripted([
    { kind: 'animation', summary: 'x', changes: [{ path: 'hero.scene.speed', value: 3 }, { path: 'hero.line1', value: 'Sharp' }], ops: [], cannot: [] },
    { kind: 'content', summary: 'New headline.', changes: [{ path: 'hero.line1', value: 'Sharp lines' }], ops: [], cannot: ['The fade animation itself stays as designed.'] },
  ]);
  const r = await ask.plan(d, spec, content, 'Make the hero animation faster and the headline sharper', w);
  assert.equal(r.ok, true);
  assert.match(w.sent[1].feedback, /hero\.scene\.speed: not something this design lets you change/);
  assert.deepEqual(r.diff.map((x) => x.path), ['hero.line1']);
  assert.equal(r.cannot.length, 1);
});

test('a plan that still breaks the rules is refused, and a photo request is a "cannot", not a change', async () => {
  const { d, spec, content } = load('steadyhand');
  const bad = { kind: 'content', summary: 'x', changes: [{ path: 'hero.line1', value: 'x'.repeat(200) }], ops: [], cannot: [] };
  const r = await ask.plan(d, spec, content, 'make the headline really long', scripted([bad, bad]));
  assert.equal(r.ok, false);
  const p = await ask.plan(d, spec, content, 'Replace the image with this upload', scripted([{ kind: 'none', summary: 'Nothing to change.', changes: [], ops: [], cannot: ['This design draws its visuals in code; there is no photo to replace.'] }]));
  assert.equal(p.ok, true);
  assert.deepEqual(p.diff, []);
  assert.equal(p.cannot.length, 1);
});

test('rename goes through the business-name rule; a name too long for the design is refused', () => {
  const { d, spec, content } = load('steadyhand');
  assert.deepEqual(ask.check(d, spec, content, { changes: [], ops: [], rename: 'Fade Society' }).diff.map((x) => [x.path, x.after]), [['business.name', 'Fade Society']]);
  assert.match(ask.check(d, spec, content, { changes: [], ops: [], rename: 'F'.repeat(60) }).errors[0], /longer than this design shows/);
});

test('already-confirmed fields are flagged in the plan', () => {
  const { d, spec, content } = load('steadyhand');
  content._reality = { v: 1, kind: 'real', confirmed: [{ path: 'menu.groups.0.items.0.price', text: '42', by: 'owner', at: 'x' }] };
  const r = ask.check(d, spec, content, { changes: [{ path: 'menu.groups.0.items.0.price', value: 50 }], ops: [] });
  assert.equal(r.diff[0].approved, true);
  assert.match(ask.prompt(d, spec, content, 'raise prices').system, /already confirmed these fields: menu\.groups\.0\.items\.0\.price/);
});

test('through the server: ask -> plan (nothing saved) -> apply -> undo, rename included', async () => {
  const { app, setDesignDeps } = require('../server.js');
  const queue = [];
  setDesignDeps({ writer: () => {
    const next = queue.shift();
    if (next === 'site') { // the first generation: the design's own example, as a real business
      const usage = { calls: 0, input: 0, output: 0, cacheWrite: 0, cacheRead: 0 };
      return { name: 'scripted', usage, start() {}, feedback() {}, async next() { const c = JSON.parse(fs.readFileSync(path.join(DIR, 'steadyhand', 'default.json'), 'utf8')); c.footer.fine = 'Steady Hand Barbers.'; c._questions = []; return JSON.stringify(c); } };
    }
    return scripted([next]);
  } });
  const srv = app.listen(0, '127.0.0.1'); await new Promise((r) => srv.on('listening', r));
  const base = `http://127.0.0.1:${srv.address().port}`;
  let cookie = '';
  const call = async (method, p, body) => {
    const r = await fetch(base + p, { method, headers: { 'content-type': 'application/json', cookie, origin: base }, body: body ? JSON.stringify(body) : undefined, redirect: 'manual' });
    const sc = r.headers.get('set-cookie'); if (sc) cookie = sc.split(';')[0];
    const text = await r.text(); let json = null; try { json = JSON.parse(text); } catch (e) { /* html */ }
    return { status: r.status, json, text };
  };
  try {
    assert.equal((await call('POST', '/api/auth/signup', { email: 'ask@example.com', password: 'correct-horse-battery-staple' })).status, 200);
    queue.push('site');
    const made = await call('POST', '/api/designs/sites', { design: 'steadyhand', brief: { businessName: 'Steady Hand Barbers', about: 'A barbershop' } });
    assert.equal(made.status, 200, made.text.slice(0, 200));
    const id = made.json.site.id;
    for (let i = 0; i < 200; i++) { const s = (await call('GET', `/api/designs/sites/${id}`)).json.site; if (s.status !== 'writing') { assert.equal(s.status, 'built', s.message || ''); break; } await new Promise((r) => setTimeout(r, 50)); }
    const html0 = (await call('GET', `/api/designs/sites/${id}/preview`)).text;

    queue.push({ kind: 'mixed', summary: 'Renamed, black and gold.', changes: [{ path: 'theme.accent', value: '#a67c1e' }, { path: 'business.wordmark', value: 'FADE SOCIETY' }], ops: [], rename: 'Fade Society', cannot: [], question: null });
    const asked = await call('POST', `/api/designs/sites/${id}/ask`, { request: 'Rename it Fade Society, black and gold' });
    assert.equal(asked.status, 200, asked.text.slice(0, 300));
    assert.deepEqual(asked.json.plan.diff.map((x) => x.path).sort(), ['business.name', 'business.wordmark', 'theme.accent']);
    // nothing saved yet
    assert.equal((await call('GET', `/api/designs/sites/${id}/preview`)).text, html0);

    const pl = asked.json.plan;
    const applied = await call('POST', `/api/designs/sites/${id}/edit`, { changes: pl.changes, ops: pl.ops, rename: pl.rename, via: 'ask' });
    assert.equal(applied.status, 200, applied.text.slice(0, 300));
    assert.equal(applied.json.site.businessName, 'Fade Society');
    const html1 = (await call('GET', `/api/designs/sites/${id}/preview`)).text;
    assert.match(html1, /#a67c1e/i);
    // the signature animation is untouched: apart from the owner's own colours and wordmark (which the barber's cape
    // paints), the hero's canvas and scroll runtime are byte-for-byte the design's own
    const script = (h) => (h.match(/<script>[\s\S]*?<\/script>/g) || []).filter((x) => /getContext|requestAnimationFrame/.test(x)).map((x) => x.replace(/#[0-9a-f]{6}/gi, '#c').replace(/STEADY HAND|FADE SOCIETY/g, 'WORDMARK')).join('');
    assert.ok(script(html0).length > 2000, 'the hero runtime is there');

    const undone = await call('POST', `/api/designs/sites/${id}/undo`, {});
    assert.equal(undone.json.site.businessName, 'Steady Hand Barbers', 'undo puts the name back too');
    assert.equal((await call('GET', `/api/designs/sites/${id}/preview`)).text, html0, 'and the page');
    assert.equal(script(html1), script(html0));

    // an empty request is refused without an AI call
    assert.equal((await call('POST', `/api/designs/sites/${id}/ask`, { request: '  ' })).status, 400);
  } finally { srv.close(); setDesignDeps({}); }
});
