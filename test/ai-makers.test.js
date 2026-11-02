'use strict';
// THE PAID WORK (lib/ai-makers.js) against stand-in providers: what each maker sends, what it keeps, what it reports as
// spent -- and that a failure the provider doesn't charge for is reported as costing nothing. No network.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');
const makers = require('../lib/ai-makers');

const FF = require('ffmpeg-static');
const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'ai-makers-'));
const fakeHf = ({ outcome = 'completed', calls = [] } = {}) => ({
  calls,
  async submit(endpoint, params) { calls.push({ endpoint, params }); return { requestId: 'req_1234' }; },
  async status() { return outcome === 'completed' ? { status: 'completed', outputUrl: 'https://cdn.example/v.mp4' } : { status: outcome }; },
  async cancel() { return true; },
  async download() { return { bytes: Buffer.from('not really a video'), mime: 'video/mp4' }; },
});
const job = { id: 'aij_testjob123456', account_id: 'acct_a' };
const ctx = (dir, params) => ({ base: 'https://www.siteremade.com', dir, params });
const wan = (o = {}) => Object.assign({ endpoint: 'wan/test-endpoint', endParam: '', resolution: '1080p', extra: { generate_audio: false } }, o);

test('a Wan clip: the start image, 5 or 12 seconds, 1080p, the configured no-audio setting; an end image only if the endpoint takes one', async () => {
  const calls = [], dir = tmp();
  const m = makers.create({ higgsfield: fakeHf({ calls }), wan: wan(), wait: async () => {}, ffmpegBin: FF });
  const r = await m.makers.video({ n: 1 }, job, ctx(dir, { start: 'TOKENtokenTOKENtoken1234', end: 'TOKENtokenTOKENtoken5678', seconds: 12, prompt: 'the doors open' }));
  assert.equal(calls[0].endpoint, 'wan/test-endpoint');
  assert.deepEqual([calls[0].params.duration, calls[0].params.resolution, calls[0].params.generate_audio], [12, '1080p', false]);
  assert.equal(calls[0].params.image_url, 'https://www.siteremade.com/ai-media/in/TOKENtokenTOKENtoken1234.jpg');
  assert.equal(Object.values(calls[0].params).filter((v) => /5678/.test(String(v))).length, 0, 'no end image sent: the endpoint was not configured for one');
  assert.equal(r.usd, 3.36); assert.equal(r.result.url, `/ai-media/${job.id}/video.mp4`); assert.ok(fs.existsSync(path.join(dir, 'video.mp4')));
  const calls2 = [];
  await makers.create({ higgsfield: fakeHf({ calls: calls2 }), wan: wan({ endParam: 'end_image_url' }), wait: async () => {}, ffmpegBin: FF })
    .makers.video({ n: 1 }, job, ctx(tmp(), { start: 'TOKENtokenTOKENtoken1234', end: 'TOKENtokenTOKENtoken5678', seconds: 5 }));
  assert.equal(calls2[0].params.end_image_url, 'https://www.siteremade.com/ai-media/in/TOKENtokenTOKENtoken5678.jpg');  const calls3 = [];
  const r3 = await makers.create({ higgsfield: fakeHf({ calls: calls3 }), wan: wan(), wait: async () => {}, ffmpegBin: FF })
    .makers.exterior({ n: 1 }, job, ctx(tmp(), { start: 'TOKENtokenTOKENtoken1234', seconds: 10, quality: '720p' }));
  assert.deepEqual([calls3[0].params.duration, calls3[0].params.resolution, r3.usd], [10, '720p', 1.4], 'the length and quality they picked');
});

test('a showcase segment goes from photo n to photo n+1; a failed or flagged clip costs nothing (Higgsfield does not charge it)', async () => {
  const calls = [];
  const m = makers.create({ higgsfield: fakeHf({ calls }), wan: wan({ endParam: 'end_image_url' }), wait: async () => {}, ffmpegBin: FF });
  const photos = ['A'.repeat(24), 'B'.repeat(24), 'C'.repeat(24)];
  await m.makers.showcase({ n: 2 }, job, ctx(tmp(), { photos, seconds: 5 }));
  assert.match(calls[0].params.image_url, /BBBB/); assert.match(calls[0].params.end_image_url, /CCCC/);
  for (const outcome of ['failed', 'nsfw']) {
    const bad = makers.create({ higgsfield: fakeHf({ outcome }), wan: wan(), wait: async () => {}, ffmpegBin: FF });
    await assert.rejects(bad.makers.exterior({ n: 1 }, job, ctx(tmp(), { start: 'A'.repeat(24), seconds: 5 })), (e) => e.usd === 0 && (outcome === 'nsfw' ? /flagged/.test(e.message) : /couldn’t make/.test(e.message)));
  }
});

test('an image is a JPEG from OpenAI, kept on the volume; a refusal costs nothing', async () => {
  const dir = tmp(); const sent = [];
  const fetchImpl = async (url, o) => { sent.push(JSON.parse(o.body)); return new Response(JSON.stringify({ data: [{ b64_json: Buffer.from('jpeg-bytes').toString('base64') }] }), { status: 200 }); };
  const m = makers.create({ openaiKey: 'sk-test', fetchImpl });
  const r = await m.makers.image({ n: 2 }, job, ctx(dir, { prompts: ['start', 'the end'], aspect: '9:16' }));
  assert.equal(sent[0].prompt, 'the end'); assert.equal(sent[0].output_format, 'jpeg'); assert.equal(sent[0].size, '1024x1536');
  assert.equal(r.result.url, `/ai-media/${job.id}/image-2.jpg`); assert.equal(fs.readFileSync(path.join(dir, 'image-2.jpg'), 'utf8'), 'jpeg-bytes');
  const no = makers.create({ openaiKey: 'sk-test', fetchImpl: async () => new Response('{}', { status: 400 }) });
  await assert.rejects(no.makers.image({ n: 1 }, job, ctx(tmp(), { prompts: ['x'] })), (e) => e.usd === 0);
});

test('a Claude update that fails still reports what Claude cost; one that works returns the plan to show', async () => {
  const row = { id: 'ds_x', account_id: 'acct_a', design: 'steadyhand' };
  const designSites = { cost: () => 0.012, view: () => ({ businessName: 'Fade' }),
    ask: async (r, req) => (req === 'bad' ? { ok: false, message: 'no', usage: {} } : { ok: true, kind: 'design', summary: 'Gold.', changes: [{ path: 'theme.accent', value: '#a67c1e' }], ops: [], cannot: [], diff: [], usage: {} }) };
  const m = makers.create({ db: { designSites: { find: () => row } }, designSites, writer: () => ({}) });
  const ok = await m.makers.assist_update({ n: 1 }, job, ctx(tmp(), { siteId: 'ds_x', request: 'gold' }));
  assert.equal(ok.result.plan.summary, 'Gold.'); assert.equal(ok.usd, 0.012);
  await assert.rejects(m.makers.assist_update({ n: 1 }, job, ctx(tmp(), { siteId: 'ds_x', request: 'bad' })), (e) => e.usd === 0.012);
  await assert.rejects(m.makers.assist_update({ n: 1 }, { id: job.id, account_id: 'someone_else' }, ctx(tmp(), { siteId: 'ds_x', request: 'gold' })), /Site not found/);
});

test('a showcase’s finished segments are joined in order into one film (free)', async () => {
  const dir = tmp();
  for (const n of [1, 2]) execFileSync(FF, ['-v', 'error', '-y', '-f', 'lavfi', '-i', `color=c=${n === 1 ? 'red' : 'blue'}:s=320x180:d=1`, '-pix_fmt', 'yuv420p', path.join(dir, `segment-${n}.mp4`)]);
  const m = makers.create({ ffmpegBin: FF, wan: wan() });
  const url = await m.joinShowcase({ id: job.id, parts: [{ n: 2, status: 'done' }, { n: 1, status: 'done' }, { n: 3, status: 'failed' }] }, ctx(dir, {}));
  assert.equal(url, `/ai-media/${job.id}/showcase.mp4`); assert.ok(fs.statSync(path.join(dir, 'showcase.mp4')).size > 1000);
});

test('build your hero: Claude sees the customer’s own images, the website is changed to match, and the video from those images goes on the site', async () => {
  const aiDir = tmp(); const dir = path.join(aiDir, job.id); fs.mkdirSync(dir); fs.mkdirSync(path.join(aiDir, 'in'));
  const S = 'S'.repeat(24), E = 'E'.repeat(24);
  fs.writeFileSync(path.join(aiDir, 'in', `${S}.jpg`), 'start-jpeg'); fs.writeFileSync(path.join(aiDir, 'in', `${E}.jpg`), 'end-jpeg');
  const row = { id: 'ds_h', account_id: 'acct_a', design: 'steadyhand' };
  const edits = [], seen = [], calls = [];
  const designSites = { cost: () => 0.01, view: () => ({ businessName: 'Fade' }),
    ask: async (r, req) => { seen.push(req); return { ok: true, summary: 'Dusk gold.', changes: [{ path: 'theme.accent', value: '#c08a2e' }], ops: [], diff: [{ path: 'theme.accent' }], usage: {} }; },
    edit: (db, r, body) => { edits.push(body); return { ok: true }; } };
  const claudeJson = async (o) => { calls.push(o); return { json: { look: 'Warm dusk light.', request: 'Use gold #c08a2e as the accent.', motion: 'the sign lights up' }, usd: 0.03 }; };
  const hf = []; const parts = [];
  const deps = { db: { designSites: { find: () => row }, aiJobs: { parts: () => parts } }, designSites, writer: () => ({}), claudeJson, higgsfield: fakeHf({ calls: hf }), wan: wan({ endParam: 'end_image_url' }), wait: async () => {}, ffmpegBin: FF };
  const m = makers.create(deps);
  const c = ctx(dir, { siteId: 'ds_h', start: S, end: E, seconds: 5, prompt: 'the door opens' });
  const one = await m.makers.hero_build({ n: 1 }, job, c);
  assert.deepEqual(calls[0].images.map((i) => Buffer.from(i.data, 'base64').toString()), ['start-jpeg', 'end-jpeg'], 'Claude is shown exactly the customer’s images');
  assert.equal(seen[0], 'Use gold #c08a2e as the accent.'); assert.equal(edits[0].via, 'ask'); assert.equal(one.result.applied, 1); assert.equal(one.usd, 0.04);
  const two = await m.makers.hero_build({ n: 2 }, job, c);
  assert.match(hf[0].params.image_url, /SSSS/); assert.match(hf[0].params.end_image_url, /EEEE/);
  assert.equal(hf[0].params.prompt, 'the door opens the sign lights up');
  assert.equal(edits[1].via, 'director'); assert.equal(edits[1].changes[0].path, 'photos.video'); assert.equal(two.result.onSite, true); assert.equal(two.usd, 1.4);
  // a retry of the video alone still has Claude's motion
  parts.push({ n: 1, result_json: JSON.stringify(one.result) });
  await m.makers.hero_build({ n: 2 }, job, ctx(dir, { siteId: 'ds_h', start: S, seconds: 5 }));
  assert.equal(hf[1].params.prompt, 'the sign lights up'); assert.equal(hf[1].params.end_image_url, undefined);
});

test('walkthrough tour: the photos go to Wan reference-to-video as references for ONE clip; before & after ends on the after picture', async () => {
  const calls = [];
  const m = makers.create({ higgsfield: fakeHf({ calls }), wan: wan({ endParam: 'end_image_url', refEndpoint: 'wan/ref-endpoint' }), wait: async () => {}, ffmpegBin: FF });
  const photos = ['A'.repeat(24), 'B'.repeat(24), 'C'.repeat(24)];
  const r = await m.makers.walkthrough({ n: 1 }, job, ctx(tmp(), { photos, seconds: 15, quality: '720p', prompt: 'start at the porch' }));
  assert.equal(calls[0].endpoint, 'wan/ref-endpoint');
  assert.deepEqual(calls[0].params.image_urls.map((u) => u.slice(-28, -24)), ['AAAA', 'BBBB', 'CCCC'], 'every photo, in order');
  assert.equal(calls[0].params.image_url, undefined); assert.equal(calls[0].params.end_image_url, undefined);
  assert.deepEqual([calls[0].params.duration, calls[0].params.resolution, calls[0].params.generate_audio], [15, '720p', false]);
  assert.match(calls[0].params.prompt, /^start at the porch .*walkthrough tour/); assert.equal(r.usd, 2.1);
  await m.makers.exterior({ n: 1 }, job, ctx(tmp(), { start: photos[0], end: photos[1], seconds: 5 }));
  assert.equal(calls[1].endpoint, 'wan/test-endpoint'); assert.match(calls[1].params.end_image_url, /BBBB/); assert.match(calls[1].params.prompt, /built from the ground up/);
  assert.equal(makers.create({ higgsfield: fakeHf(), wan: wan() }).available.walkthrough() !== '', true, 'off until the reference endpoint is set');
});
