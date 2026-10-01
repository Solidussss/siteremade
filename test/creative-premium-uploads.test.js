'use strict';
// HIGGSFIELD IS UPLOADS-ONLY, AND A CHOICE (lib/creative/premium-source.js, premium-media.js planForChoice, server.js,
// creative.js): the generator offers three modes -- Creative (no Higgsfield), Creative + Cinematic Hero (one premium
// video), Creative Showcase (three) -- and the mode decides the quote. Only the owner's own uploads, good enough for a
// full-screen video, are ever sent to Higgsfield; web pictures stay on the page. Higgsfield and the models are mocked
// (test/helpers/run-server.js): $0 of real provider spend.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const zlib = require('zlib');
const PS = require('../lib/creative/premium-source');
const PM = require('../lib/media/premium-media');
const Q = require('../lib/quotes');
const { costs } = require('../lib/provider-budget');
const { startServer, client, providerCalls } = require('./helpers/server-process');
const { mockPng } = require('./helpers/mock-image');
const { premiumRun } = require('./helpers/premium-job');

const assess = (w, h, extra) => Object.assign({ width: w, height: h, aspect: +(w / h).toFixed(3), orientation: w > h * 1.15 ? 'landscape' : h > w * 1.15 ? 'portrait' : 'square', subject: null, colours: ['#c0502e'], luminance: 110, background: { colour: '#333333', uniformity: 0.3 } }, extra || {});
const up = (id, w, h, extra) => Object.assign({ id, origin: 'upload', title: id, mime: 'image/jpeg', assess: assess(w, h) }, extra || {});
const web = (id, extra) => Object.assign({ id, origin: 'research', title: id, license: 'CC BY 4.0', pageUrl: `https://example.org/${id}`, mime: 'image/jpeg', assess: assess(2400, 1350) }, extra || {});

// ================================================================ 1. the rule: uploads only
test('1. eligibility: the owner\'s own uploads only -- web, discovered, picked and licensed pictures never; a cut-out follows its photo; the logo never', () => {
  const assets = [up('u1', 2000, 1125), web('r1'), web('r2', { license: 'CC0' }), up('p1', 2000, 1125, { ownerPicked: true, pageUrl: 'https://shop.example/x' }), up('c1', 900, 900, { origin: 'derived', cutoutOf: 'u1' }), up('c2', 900, 900, { origin: 'derived', cutoutOf: 'r1' }), up('lg', 1600, 900, { ownerRole: 'logo' }), up('fake', 2000, 1125, { sourceUrl: 'https://cdn.example/x.jpg' })];
  const byId = new Map(assets.map(a => [a.id, a])); const v = id => PS.eligible(byId.get(id), { byId });
  assert.deepEqual(v('u1'), { ok: true, code: 'ok', reason: 'your own upload, good enough for full-screen premium video' });
  assert.equal(v('r1').code, 'not_upload'); assert.equal(v('r2').code, 'not_upload', 'an openly licensed web picture is still not an upload');
  assert.equal(v('p1').code, 'picked_web'); assert.equal(v('c1').ok, true, 'a cut-out of the owner\'s upload'); assert.equal(v('c2').code, 'not_upload');
  assert.equal(v('lg').code, 'logo'); assert.equal(v('fake').code, 'not_upload', 'a picture with a web address is not an upload, whatever it is labelled');
  assert.match(v('r1').reason, /premium video uses uploaded images only/);
  // the server uses the same verdict
  assert.deepEqual(PM.sourceEligibility(byId.get('r1'), { byId }), v('r1'));
});

// ================================================================ 2. the quality gate
test('2. the quality gate: big enough, wide enough for a full-screen 16:9 frame, the subject inside it and large enough, sharp, not blocky -- the file\'s own size wins over the browser\'s', () => {
  const q = (a, ctx) => PS.quality(a, ctx).code;
  assert.equal(q(up('a', 1920, 1080)), 'ok');
  assert.equal(q(up('a', 1024, 768)), 'too_small'); assert.match(PS.quality(up('a', 640, 360)).reason, /upload too small \(640×360; premium video needs at least 1280×720\)/);
  assert.equal(q(up('a', 1080, 1920)), 'too_narrow', 'a phone portrait is too narrow to fill a wide screen at 1280 x 720');
  assert.equal(q(up('a', 3024, 4032, { assess: assess(3024, 4032, { subject: [0.2, 0.05, 0.8, 0.95] }) })), 'subject_cut', 'a full-height subject would be cut by a wide frame');
  assert.equal(q(up('a', 1920, 1080, { assess: assess(1920, 1080, { subject: [0.48, 0.48, 0.55, 0.53] }) })), 'subject_small');
  assert.equal(q(up('a', 1920, 1080, { assess: assess(1920, 1080, { subject: [0.3, 0.2, 0.7, 0.9] }) })), 'ok');
  assert.equal(q(up('a', 1920, 1080, { assess: assess(1920, 1080, { transparent: true }) })), 'transparent');
  assert.equal(q(up('a', 1920, 1080, { quality: { sharpness: 0.3 } })), 'too_blurry'); assert.match(PS.quality(up('a', 1920, 1080, { quality: { sharpness: 0.3 } })).reason, /^upload too blurry/);
  assert.equal(q(up('a', 1920, 1080, { quality: { sharpness: 1.4, blockiness: 2.6 } })), 'too_compressed');
  assert.equal(q(up('a', 1920, 1080, { quality: { sharpness: 1.4, blockiness: 1.1 } })), 'ok');
  assert.equal(q({ id: 'x', origin: 'upload' }), 'not_measured');
  // the server's own reading of the file beats what the browser said
  assert.equal(q(up('a', 4000, 2250), { measured: { width: 800, height: 450, bytes: 90000, mime: 'image/jpeg' } }), 'too_small');
  assert.equal(q(up('a', 1920, 1080), { measured: { width: 1920, height: 1080, bytes: 20000, mime: 'image/jpeg' } }), 'too_compressed', 'about 0.01 bytes a pixel');
});

// a tiny PNG writer for synthetic pictures (RGBA), so the measurements run on real pixels
function png(w, h, fill) {
  const row = w * 4 + 1; const raw = Buffer.alloc(row * h);
  for (let y = 0; y < h; y++) { raw[y * row] = 0; for (let x = 0; x < w; x++) { const c = fill(x, y); const i = y * row + 1 + x * 4; raw[i] = c; raw[i + 1] = c; raw[i + 2] = c; raw[i + 3] = 255; } }
  const crc = b => { let c, k = -1; for (let n = 0; n < b.length; n++) { c = (k ^ b[n]) & 0xff; for (let j = 0; j < 8; j++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; k = (k >>> 8) ^ c; } return (k ^ -1) >>> 0; };
  const chunk = (t, d) => { const l = Buffer.alloc(4); l.writeUInt32BE(d.length); const td = Buffer.concat([Buffer.from(t), d]); const c = Buffer.alloc(4); c.writeUInt32BE(crc(td)); return Buffer.concat([l, td, c]); };
  const ih = Buffer.alloc(13); ih.writeUInt32BE(w, 0); ih.writeUInt32BE(h, 4); ih[8] = 8; ih[9] = 6;
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk('IHDR', ih), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}
const rgba = (w, h, f) => { const d = new Uint8ClampedArray(w * h * 4); for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const v = f(x, y); const i = (y * w + x) * 4; d[i] = v; d[i + 1] = v; d[i + 2] = v; d[i + 3] = 255; } return { width: w, height: h, data: d }; };
test('3. the measurements: sharpness tells a crisp picture from a blurred one; blockiness finds a JPEG grid; a file\'s header gives its true size', () => {
  let s = 7; const rnd = () => (s = (s * 16807) % 2147483647) / 2147483647; const cells = Array.from({ length: 64 * 64 }, () => rnd());
  const crisp = (x, y) => (cells[(Math.floor(y / 12) % 64) * 64 + (Math.floor(x / 12) % 64)] > 0.5 ? 220 : 30);
  const sharp = rgba(320, 200, crisp);
  // the same picture, clearly blurred (a 17 x 17 box, applied as two passes)
  const W = 320, H = 200, R = 8; const at = (x, y) => crisp(Math.max(0, Math.min(W - 1, x)), Math.max(0, Math.min(H - 1, y)));
  const rows = []; for (let y = 0; y < H; y++) { rows.push([]); for (let x = 0; x < W; x++) { let t = 0; for (let d = -R; d <= R; d++) t += at(x + d, y); rows[y].push(t / (2 * R + 1)); } }
  const blur = rgba(W, H, (x, y) => { let t = 0; for (let d = -R; d <= R; d++) t += rows[Math.max(0, Math.min(H - 1, y + d))][x]; return t / (2 * R + 1); });
  const a = PS.sharpness(sharp), b = PS.sharpness(blur);
  assert.ok(a > 1, `sharp ${a}`); assert.ok(b < PS.GATE.minSharpness, `blurred ${b}`);
  assert.equal(PS.sharpness(rgba(200, 200, () => 128)), null, 'a flat picture cannot be judged: never rejected for blur');
  // blockiness: smooth content with steps on the 8-pixel grid (what heavy JPEG compression leaves) vs the same without
  const smooth = (x, y) => 80 + 60 * Math.sin(x / 23) + 40 * Math.cos(y / 17);
  const clean = rgba(256, 256, smooth); const blocky = rgba(256, 256, (x, y) => smooth(Math.floor(x / 8) * 8 + 4, Math.floor(y / 8) * 8 + 4));
  assert.ok(PS.blockiness(clean) < 1.3, `clean ${PS.blockiness(clean)}`); assert.ok(PS.blockiness(blocky) >= PS.GATE.maxBlockiness, `blocky ${PS.blockiness(blocky)}`);
  // headers: PNG, JPEG (SOF0), WebP (VP8X)
  assert.deepEqual(PS.headerSize(png(1280, 720, () => 0)), { width: 1280, height: 720, mime: 'image/png' });
  const jpg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0, 1, 1, 0, 0, 1, 0, 1, 0, 0, 0xff, 0xc0, 0x00, 0x11, 0x08, 0x04, 0x38, 0x07, 0x80, 0x03, 1, 0x22, 0, 2, 0x11, 1, 3, 0x11, 1]);
  assert.deepEqual(PS.headerSize(jpg), { width: 1920, height: 1080, mime: 'image/jpeg' });
  const webp = Buffer.alloc(30); webp.write('RIFF', 0, 'latin1'); webp.write('WEBP', 8, 'latin1'); webp.write('VP8X', 12, 'latin1'); webp.writeUIntLE(1999, 24, 3); webp.writeUIntLE(1124, 27, 3);
  assert.deepEqual(PS.headerSize(webp), { width: 2000, height: 1125, mime: 'image/webp' });
  assert.equal(PS.headerSize(Buffer.from('not an image at all, just text')), null);
});

// ================================================================ 4. the three modes -> the plan and the quote
const plan = choice => PM.planForChoice({ choice, brief: 'A page for our sneaker brand with a cinematic hero video', provider: { hasKey: true, mode: 'live', env: { HIGGSFIELD_VIDEO_ENDPOINT: 'kling-video/v3.0/4k/image-to-video' } }, costs: costs({}), tierFor: (intent, est) => Q.premiumTier(PM.INTENTS[intent].mediaType, est) });
const total = p => Q.build('creative_generation', { premium: p.planned }).credits;
test('4. the modes decide the quote: Creative 6 (whatever the brief says), Cinematic Hero 18, Showcase 42 -- no uploads plans nothing and says why; a showcase with one suitable upload is never silently three', () => {
  const creative = plan({ on: false }); assert.equal(total(creative), 6); assert.equal(creative.status.reason, 'off'); assert.equal(creative.status.briefAsks, true, 'the brief mentions video: the generator says so, the quote does not change');
  const hero = plan({ on: true, moments: 1, eligibleUploads: 1 }); assert.deepEqual(hero.planned.map(p => [p.intent, p.credits]), [['cinematic_hero', 12]]); assert.equal(total(hero), 18);
  const show = plan({ on: true, moments: 3, eligibleUploads: 2 }); assert.deepEqual(show.planned.map(p => p.role), ['hero', 'takeover', 'payoff']); assert.equal(total(show), 42); assert.equal(show.strategy, 'showcase');
  const none = plan({ on: true, moments: 1, eligibleUploads: 0 }); assert.equal(none.planned.length, 0); assert.equal(none.status.reason, 'needs_upload'); assert.match(none.status.message, /uploaded images only/);
  const one = plan({ on: true, moments: 3, eligibleUploads: 1 }); assert.equal(one.planned.length, 1, 'never three planned for one suitable upload');
  assert.match(one.status.reduced.message, /at least 2 suitable uploaded photos; with 1, this includes the hero video only/);
});

// ================================================================ 5. the real server (Higgsfield and the models mocked)
async function withServer(env, fn) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sr-premium-up-'));
  const e = Object.assign({ SITEREMADE_BACKEND: 'local', SITEREMADE_DB_PATH: path.join(dir, 'app.db'), SITEREMADE_ASSET_STORE_DIR: path.join(dir, 'assets'), SITEREMADE_EXPORTS_DIR: path.join(dir, 'exports'), SITEREMADE_PREMIUM_LOG_DIR: path.join(dir, 'p'), ANTHROPIC_API_KEY: 'test-only', OPENAI_API_KEY: '', STRIPE_SECRET_KEY: '', SITEREMADE_TRIAL_CREDITS: '50', MOCK_CALL_LOG: path.join(dir, 'calls.log'), NODE_ENV: 'test', HIGGSFIELD_API_KEY: 'hf-test-key:secret', HIGGSFIELD_VIDEO_ENDPOINT: 'https://api.higgsfield.ai/kling-video/v3.0/4k/image-to-video' }, env);
  const s = await startServer(e); const call = client(s.port);
  await call('POST', '/api/auth/signup', { email: `pu-${process.pid}-${Date.now()}@example.com`, password: 'correct-horse-battery-staple' });
  try { await fn({ call, calls: () => providerCalls(e.MOCK_CALL_LOG) }); } finally { await s.stop(); fs.rmSync(dir, { recursive: true, force: true }); }
}
const BRIEF = 'A page for Zorbo, our sneaker brand, with a cinematic hero video';
const MODE = { creative: { on: false }, hero: n => ({ on: true, moments: 1, eligibleUploads: n }), showcase: n => ({ on: true, moments: 3, eligibleUploads: n }) };
const hd = (id, title) => ({ id, origin: 'upload', title: title || id, mime: 'image/png', dataUrl: mockPng(id, '16:9-hd') });
const small = (id) => ({ id, origin: 'upload', title: id, mime: 'image/png', dataUrl: mockPng(id, '16:9') });
async function begin(call, premium) {
  const ask = await call('POST', '/api/creative/research', { brief: BRIEF, premium });
  const r = ask.body.needsConfirmation ? await call('POST', '/api/creative/research', { brief: BRIEF, premium, quoteId: ask.body.quote.id }) : ask;
  return { ask, r };
}
const plannedLines = q => q.items.filter(i => /^premium_/.test(i.code));
const submits = calls => calls().filter(c => c.provider === 'higgsfield' && /image-to-video$/.test(c.endpoint)).length;

test('5. server: Creative mode with no uploads makes the page normally -- no premium line, no premium credits, no Higgsfield', async () => {
  await withServer({}, async ({ call, calls }) => {
    const { ask, r } = await begin(call, MODE.creative);
    assert.equal(ask.body.quote.credits, 6); assert.equal(plannedLines(ask.body.quote).length, 0); assert.equal(ask.body.premium.reason, 'off');
    assert.equal(r.body.ok, true, JSON.stringify(r.body).slice(0, 200)); assert.equal(r.body.creditsRemaining, 44, 'only the page is reserved');
    const p = await premiumRun(call, { jobId: r.body.jobId, brief: BRIEF, assets: [] });
    assert.equal(p.body.premium.executionStarted, false); assert.equal(submits(calls), 0);
  });
});

test('6. server: a video mode with no suitable upload plans nothing (and says premium video needs uploads); the price preview stores nothing', async () => {
  await withServer({}, async ({ call, calls }) => {
    const { ask } = await begin(call, MODE.hero(0));
    assert.equal(plannedLines(ask.body.quote).length, 0); assert.equal(ask.body.premium.reason, 'needs_upload'); assert.match(ask.body.premium.message, /uploaded images only/);
    // the generator's live price: each mode's total, the chosen mode's lines, the balance -- nothing written
    const before = (await call('GET', '/api/credits')).body.credits.remaining;
    const pr = await call('POST', '/api/creative/price', { request: BRIEF, premium: MODE.hero(1) });
    assert.equal(pr.body.ok, true); assert.deepEqual([pr.body.modes.creative.credits, pr.body.modes.hero.credits, pr.body.modes.showcase.credits], [6, 18, 42]);
    assert.equal(pr.body.credits, 18); assert.equal(pr.body.creditsRemaining, before, 'a preview reserves nothing'); assert.equal((await call('GET', '/api/credits')).body.credits.remaining, before);
    assert.equal(submits(calls), 0);
  });
});

test('7. server: Cinematic Hero with one suitable upload -> the quote includes the premium line, the video is made from that upload and charged once', async () => {
  await withServer({}, async ({ call, calls }) => {
    const { ask, r } = await begin(call, MODE.hero(1));
    assert.equal(ask.body.quote.credits, 18); assert.deepEqual(plannedLines(ask.body.quote).map(i => i.credits), [12]);
    const p = await premiumRun(call, { jobId: r.body.jobId, brief: BRIEF, heroAsset: 'u1', assets: [hd('u1', 'our sneaker')] });
    assert.deepEqual(p.body.premium.delivered, ['cinematic_hero']); assert.equal(p.body.creditsCharged, 12); assert.equal(submits(calls), 1);
  });
});

test('8. server: an upload too small for full-screen video is never sent -- the reason is said and its credits come back; web pictures beside it are never used for video', async () => {
  await withServer({}, async ({ call, calls }) => {
    const { r } = await begin(call, MODE.hero(1)); // (a studio that miscounted: the server measures the file itself)
    const web = { id: 'r1', origin: 'research', title: 'sneaker on a shop', license: 'CC BY 4.0', pageUrl: 'https://shop.example/s', mime: 'image/png', dataUrl: mockPng('r1', '16:9-hd') };
    const p = await premiumRun(call, { jobId: r.body.jobId, brief: BRIEF, heroAsset: 'r1', assets: [web, small('u1')] });
    assert.equal(p.body.premium.executionStarted, false); assert.equal(p.body.creditsCharged, 0); assert.equal(p.body.creditsRefunded, 12);
    assert.equal(p.body.premium.status.reason, 'source_not_eligible'); assert.match(p.body.premium.status.message, /uploaded images only|upload too small/);
    assert.equal(submits(calls), 0, 'neither the licensed web picture nor the small upload reached Higgsfield');
  });
});

test('9. server: not enough credits for the chosen mode -> nothing is reserved, the quote says so, and the cheaper Creative mode still goes ahead', async () => {
  await withServer({ SITEREMADE_TRIAL_CREDITS: '10' }, async ({ call }) => {
    const ask = await call('POST', '/api/creative/research', { brief: BRIEF, premium: MODE.hero(1) });
    assert.equal(ask.body.quote.credits, 18);
    const tryIt = await call('POST', '/api/creative/research', { brief: BRIEF, premium: MODE.hero(1), quoteId: ask.body.quote.id });
    assert.equal(tryIt.body.creditsExceeded, true); assert.equal(tryIt.body.creditsRemaining, 10, 'nothing was taken');
    // the owner chose to continue without premium video: a Creative quote, confirmed, runs
    const { r } = await begin(call, MODE.creative);
    assert.equal(r.body.ok, true, JSON.stringify(r.body).slice(0, 200)); assert.equal(r.body.creditsRemaining, 4);
  });
});

test('10. server: a showcase asked for with one suitable upload is never silently three -- the quote has one premium line and the reason', async () => {
  await withServer({}, async ({ call }) => {
    const { ask } = await begin(call, MODE.showcase(1));
    assert.equal(plannedLines(ask.body.quote).length, 1); assert.equal(ask.body.quote.credits, 18); assert.match(ask.body.premium.reduced.message, /at least 2 suitable uploaded photos/);
    const two = await call('POST', '/api/quotes', { operation: 'creative_generation', request: BRIEF, premium: MODE.showcase(2) });
    assert.deepEqual(plannedLines(two.body.quote).map(i => i.role), ['hero', 'takeover', 'payoff']); assert.equal(two.body.quote.credits, 42);
  });
});

test('11. server: web pictures and uploads together -- the web picture is on the page, only the upload is planned as the video source', async () => {
  await withServer({ MOCK_DIRECTOR: 'follow' }, async ({ call }) => {
    const { r } = await begin(call, MODE.hero(1));
    const m = (w, h) => ({ width: w, height: h, aspect: +(w / h).toFixed(3), orientation: 'landscape', subject: null, colours: ['#c0502e', '#223344'], luminance: 110, background: { colour: '#333333', uniformity: 0.3 } });
    const assets = [{ id: 'r1', origin: 'research', title: 'Zorbo sneaker on a shop page', license: 'CC BY 4.0', pageUrl: 'https://shop.example/z', mime: 'image/jpeg', assess: m(2400, 1350), curation: { role: 'subject', identity: 'exact', depicts: 'a Zorbo sneaker', issues: [] } },
      { id: 'u1', origin: 'upload', title: 'our sneaker', mime: 'image/jpeg', assess: m(1920, 1080) }];
    const p = await call('POST', '/api/creative/plan', { brief: BRIEF, jobId: r.body.jobId, understanding: r.body.understanding, facts: [], supplied: {}, assets, thumbnails: [], mainAsset: 'r1', seed: 'w1' });
    assert.equal(p.body.ok, true, JSON.stringify(p.body).slice(0, 300));
    assert.equal(p.body.visualPlan.premiumHero.source, 'u1', 'the video starts from the upload'); assert.match(p.body.visualPlan.premiumHero.note, /uploaded images only/);
    assert.ok(p.body.visualPlan.used.includes('r1'), 'the web picture is still on the page');
  });
});

// ================================================================ 6. the studio: the mode is the owner's, the popup never changes it
test('12. studio: three generation modes beside the uploads; the confirmation never changes the mode by itself -- only an explicit "switch to" does', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'creative.js'), 'utf8');
  assert.match(src, /name: 'Creative', line: 'No Higgsfield video\. The lowest cost\.', on: false/);
  assert.match(src, /name: 'Creative \+ Cinematic Hero'.*on: true, moments: 1, needs: 1/);
  assert.match(src, /name: 'Creative Showcase'.*on: true, moments: 3, needs: 2/);
  assert.match(src, /Higgsfield video modes require eligible uploaded images\./);
  assert.match(src, /role="radiogroup" aria-label="Generation mode"/);
  // the mode changes only where the owner acts: a mode card (click / arrows) or an explicit "Switch to" in the modal
  const sets = src.split('\n').filter(l => /setMode\(/.test(l) && !/function setMode/.test(l));
  assert.ok(sets.length >= 1 && sets.every(l => /addEventListener\('click'|keydown|afterSwitch|a\.indexOf\('mode:'\) === 0/.test(l)), sets.join('\n'));
  assert.doesNotMatch(src.slice(src.indexOf('  function modal(o) {'), src.indexOf('  // credits are bought in a new tab')), /S\.mode/, 'the modal never touches the mode');
  // the choices: not enough uploads -> upload / a lower mode / cancel; not enough credits -> buy / a cheaper mode / cancel
  const conf = src.slice(src.indexOf('  function confirmGeneration() {'), src.indexOf('  // OWNERSHIP + CREDITS: other dynamic work'));
  assert.match(conf, /id: 'upload', label: 'Upload suitable photos'/); assert.match(conf, /lower\.map\(switchAction\)/); assert.match(conf, /cheaper\.map\(switchAction\)/);
  assert.match(conf, /id: 'buy', label: 'Buy more credits'/); assert.ok((conf.match(/id: 'cancel', label: 'Cancel'/g) || []).length >= 3);
  assert.doesNotMatch(src, /window\.confirm\(d\.quote\.message|window\.confirm\(\(preface/, 'no native confirm for prices any more');
  // the research call carries the chosen mode, and the uploads' premium quality is measured from the file as it came
  assert.match(src, /hasUploads: uploads\.length, premium: premiumChoice\(\)/);
  assert.match(src, /var quality = uploadQuality\(im\);/);
});
