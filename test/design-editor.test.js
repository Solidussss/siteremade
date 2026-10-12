'use strict';
// THE WEBSITE EDITOR (lib/design-editor.js, lib/design-sites.js edit/undo): what a built design site lets the owner
// change comes from the design's own rules; a change goes through the same checker as generation and rebuilds the real
// page; the owner's typed facts count as confirmed by them; undo restores. Scripted writer, no AI.
process.env.SITEREMADE_DB_PATH = ':memory:';
process.env.SITEREMADE_DESIGN_OWNER_CUTOFF = '2999-01-01T00:00:00.000Z';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { app, setDesignDeps } = require('../server.js');
const editor = require('../lib/design-editor');
const { loadDesign, validate } = require('../design-packages/engine/engine');

const FIX = path.join(__dirname, 'fixtures', 'design-sites');
const meridian = () => JSON.parse(fs.readFileSync(path.join(FIX, 'meridian-38.json'), 'utf8'));
const D = loadDesign(path.join(__dirname, '..', 'design-packages', 'design', 'aldane'));
const SPEC = JSON.parse(fs.readFileSync(path.join(D.dir, 'brief.json'), 'utf8'));

test('fields come from the design\'s rules: editable text, numbers, choices; the drawing and the pinned name are not', () => {
  const { fields, lists } = editor.fields(D, SPEC, meridian());
  const at = (p) => fields.find((f) => f.path === p);
  assert.deepEqual(Object.assign({}, at('configure.cases.1.price')), { path: 'configure.cases.1.price', kind: 'number', value: 2150, min: 1, max: 999999 });
  assert.equal(at('hero.title').kind, 'text'); assert.equal(at('hero.title').max, 24);
  assert.equal(at('features.dualTime').kind, 'toggle');
  assert.equal(at('business.name').locked, true);
  assert.equal(at('configure.straps.0.kind').kind, 'choice', 'optional: strap or bracelet, on every strap');
  assert.equal(at('configure.cases.0.colour').value, null, 'optional colour, empty = the drawn finish');
  assert.ok(!fields.some((f) => /^_|\._/.test(f.path)), 'nothing internal');
  assert.deepEqual(lists, [], 'Aldane\'s lists are fixed sizes');
  const lintel = loadDesign(path.join(__dirname, '..', 'design-packages', 'design', 'lintel'));
  const lspec = JSON.parse(fs.readFileSync(path.join(lintel.dir, 'brief.json'), 'utf8'));
  const L = editor.fields(lintel, lspec, JSON.parse(fs.readFileSync(path.join(lintel.dir, 'default.json'), 'utf8')));
  assert.ok(L.lists.some((l) => l.path === 'area.places') && !L.lists.some((l) => l.path === 'model.rooms'), 'places can be added; the floor plan\'s rooms cannot');
  assert.ok(!L.fields.some((f) => /^model\.rooms\.\d+\.(x|y|w|d)$/.test(f.path)), 'room geometry is not hand-editable');
});

test('apply: coerces, refuses what is not editable, clears optional fields, adds and removes list items', () => {
  const c = meridian();
  const r = editor.apply(D, SPEC, c, { changes: [{ path: 'configure.cases.1.price', value: '2,295' }, { path: 'features.dualTime', value: 'true' }, { path: 'configure.cases.1.colour', value: '' }] });
  assert.equal(r.content.configure.cases[1].price, 2295); assert.equal(r.content.features.dualTime, true);
  assert.ok(!('colour' in r.content.configure.cases[1]), 'cleared: back to the drawn finish');
  assert.equal(c.configure.cases[1].price, 2150, 'the original content is untouched');
  assert.throws(() => editor.apply(D, SPEC, c, { changes: [{ path: 'business.name', value: 'X' }, { path: 'model.x', value: 1 }, { path: 'configure.cases.0.colour', value: 'red' }] }), (e) => e.errors.length === 3);
  const lintel = loadDesign(path.join(__dirname, '..', 'design-packages', 'design', 'lintel'));
  const lspec = JSON.parse(fs.readFileSync(path.join(lintel.dir, 'brief.json'), 'utf8'));
  const lc = JSON.parse(fs.readFileSync(path.join(lintel.dir, 'default.json'), 'utf8'));
  const added = editor.apply(lintel, lspec, lc, { ops: [{ op: 'add', list: 'area.places' }] });
  assert.equal(added.content.area.places.length, 11); assert.deepEqual(validate(lintel, added.content).errors, []);
  assert.throws(() => editor.apply(lintel, lspec, lc, { ops: [{ op: 'add', list: 'model.rooms' }] }), /could not be made/);
});

test('through the routes: edit rebuilds the real page, owner-typed facts are confirmed, rule breaks are refused, undo restores', async () => {
  setDesignDeps({ writer: () => ({ name: 'scripted', usage: { calls: 0, input: 0, output: 0, cacheWrite: 0, cacheRead: 0 }, start() {}, feedback() {}, async next() { return JSON.stringify(meridian()); } }) });
  const srv = app.listen(0, '127.0.0.1'); await new Promise((r) => srv.on('listening', r));
  const base = `http://127.0.0.1:${srv.address().port}`; let cookie = '';
  const call = async (m, p, body) => { const r = await fetch(base + p, { method: m, headers: { 'content-type': 'application/json', cookie }, body: body ? JSON.stringify(body) : undefined }); const sc = r.headers.get('set-cookie'); if (sc) cookie = sc.split(';')[0]; const t = await r.text(); let j = null; try { j = JSON.parse(t); } catch (e) { /* html */ } return { status: r.status, json: j, text: t }; };
  try {
    assert.equal((await call('POST', '/api/auth/signup', { email: 'jaydenflynn9@gmail.com', password: 'correct-horse-battery-staple' })).status, 200);
    const id = (await call('POST', '/api/designs/sites', { design: 'aldane', brief: { businessName: 'Meridian 38', brand: 'Meridian', businessKind: 'real', watch: 'Hand-wound, 42-hour power reserve, 4 Hz.', options: 'Cases $1,850, $2,150, $2,400.', reserve: '$300 deposit.' } })).json.site.id;
    for (let i = 0; i < 100 && (await call('GET', `/api/designs/sites/${id}`)).json.site.status === 'writing'; i++) await new Promise((r) => setTimeout(r, 30));
    const ed = await call('GET', `/api/designs/sites/${id}/editor`);
    assert.equal(ed.status, 200); assert.ok(ed.json.editor.fields.length > 100); assert.equal(ed.json.editor.revisions, 0);

    const ok = await call('POST', `/api/designs/sites/${id}/edit`, { changes: [{ path: 'configure.cases.1.price', value: 2295 }, { path: 'configure.straps.0.kind', value: 'bracelet' }, { path: 'specs.rows.2.mm', value: 46 }] });
    assert.equal(ok.status, 200, ok.text);
    assert.deepEqual(ok.json.changed.sort(), ['configure.cases.1.price', 'configure.straps.0.kind', 'specs.rows.2.mm']);
    const page = (await call('GET', `/api/designs/sites/${id}/preview`)).text;
    assert.match(page, /2295/); assert.match(page, /pBracelet/);
    assert.ok(ok.json.site.reality.confirmed.some((c) => c.path === 'specs.rows.2.mm' && c.edited && c.by.startsWith('account:')), 'the lug-to-lug the owner typed is confirmed by them');
    assert.ok(!ok.json.site.confirm.some((c) => c.path === 'specs.rows.2.mm' && c.status === 'proposed'));
    assert.equal(ok.json.editor.revisions, 1);

    const bad = await call('POST', `/api/designs/sites/${id}/edit`, { changes: [{ path: 'configure.cases.0.price', value: 0 }] });
    assert.equal(bad.status, 400); assert.ok(bad.json.errors.some((e) => e.startsWith('configure.cases.0.price')));
    const locked = await call('POST', `/api/designs/sites/${id}/edit`, { changes: [{ path: 'business.name', value: 'Other' }] });
    assert.equal(locked.status, 400);

    const un = await call('POST', `/api/designs/sites/${id}/undo`, {});
    assert.equal(un.status, 200); assert.equal(un.json.editor.revisions, 0);
    const back = (await call('GET', `/api/designs/sites/${id}/preview`)).text;
    assert.doesNotMatch(back, /pBracelet/); assert.doesNotMatch(back, /\b2295\b/);
    assert.equal((await call('POST', `/api/designs/sites/${id}/undo`, {})).status, 400, 'nothing more to undo');
  } finally { srv.close(); }
});
