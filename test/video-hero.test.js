'use strict';
// THE VIDEO HERO (lib/video-hero.js): a design's story steps as one real video take that plays with the scroll. Here
// fal.ai, the photo library and Claude are stand-ins: nothing is paid for, nothing leaves the machine. ffmpeg is real.
process.env.SITEREMADE_DB_PATH = ':memory:';
process.env.SITEREMADE_DESIGN_OWNER_CUTOFF = '2999-01-01T00:00:00.000Z';
delete process.env.ANTHROPIC_API_KEY;
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');
const jpeg = require('jpeg-js');
const { app, setDesignDeps } = require('../server.js');
const videoHero = require('../lib/video-hero');

const OWNER = 'jaydenflynn9@gmail.com';
const photo = () => { const W = 1280, H = 720, px = Buffer.alloc(W * H * 4); for (let i = 0; i < W * H; i++) { px[i * 4] = 150; px[i * 4 + 1] = 40; px[i * 4 + 2] = 40; px[i * 4 + 3] = 255; } return Buffer.from(jpeg.encode({ width: W, height: H, data: px }, 80).data); };
// a real one-second clip, as Seedance would hand back
const CLIP = path.join(os.tmpdir(), `vh-clip-${process.pid}.mp4`);
execFileSync(videoHero.ffmpegPath(), ['-y', '-loglevel', 'error', '-f', 'lavfi', '-i', 'testsrc=size=640x360:rate=24:duration=1', '-pix_fmt', 'yuv420p', '-c:v', 'libx264', CLIP]);

const submitted = [];
const services = async (url, opt = {}) => {
  const u = String(url);
  if (u.startsWith('https://pixabay.com/api/')) return new Response(JSON.stringify({ hits: [1, 2, 3].map((n) => ({ largeImageURL: `https://cdn.example/${n}.jpg`, imageWidth: 3000, imageHeight: 2000, tags: 'car', user: 'u', pageURL: 'https://pixabay.example' })) }), { status: 200 });
  if (u.startsWith('https://cdn.example/')) return new Response(photo(), { status: 200 });
  if (u.startsWith('https://queue.fal.run/') && opt.method === 'POST') {
    assert.equal(opt.headers.authorization, 'Key test-fal-key');
    const body = JSON.parse(opt.body); submitted.push(body); const id = `r${submitted.length}`;
    return new Response(JSON.stringify({ request_id: id, status_url: `https://queue.fal.run/bytedance/seedance-2.5/requests/${id}/status`, response_url: `https://queue.fal.run/bytedance/seedance-2.5/requests/${id}` }), { status: 200 });
  }
  if (/\/status$/.test(u)) return new Response(JSON.stringify({ status: 'COMPLETED' }), { status: 200 });
  if (u.startsWith('https://queue.fal.run/')) return new Response(JSON.stringify({ video: { url: 'https://fal.media/files/take.mp4' } }), { status: 200 });
  if (u === 'https://fal.media/files/take.mp4') return new Response(fs.readFileSync(CLIP), { status: 200 });
  return new Response('no', { status: 404 });
};

async function server() {
  const srv = app.listen(0, '127.0.0.1'); await new Promise((r) => srv.on('listening', r));
  const base = `http://127.0.0.1:${srv.address().port}`;
  const session = async (email) => {
    let cookie = '';
    const call = async (method, p, body, headers = {}) => {
      const r = await fetch(base + p, { method, headers: { 'content-type': 'application/json', origin: base, cookie, ...headers }, body: body ? JSON.stringify(body) : undefined });
      const sc = r.headers.get('set-cookie'); if (sc) cookie = sc.split(';')[0];
      const buf = Buffer.from(await r.arrayBuffer()); let json = null; try { json = JSON.parse(buf.toString()); } catch (e) { /* not json */ }
      return { status: r.status, json, text: buf.toString(), buf, type: r.headers.get('content-type') || '' };
    };
    if (email) { const up = await call('POST', '/api/auth/signup', { email, password: 'correct-horse-battery-staple' }); if (up.status !== 200) await call('POST', '/api/auth/signin', { email, password: 'correct-horse-battery-staple' }); }
    return call;
  };
  return { srv, session };
}
const until = async (f) => { for (let i = 0; i < 300; i++) { const v = await f(); if (v) return v; await new Promise((r) => setTimeout(r, 100)); } throw new Error('timed out'); };

test('the shots: one per step, from the step’s own words, and a plain shot when the writer fails', async () => {
  const steps = [{ title: 'Pre-rinse', caption: 'Low-pressure rinse.' }, { title: 'Ceramic', caption: 'The coating bonds.' }];
  const plain = await videoHero.shots({ category: 'car detailing', steps });
  assert.equal(plain.length, 2); assert.match(plain[0], /Pre-rinse/); assert.match(plain[1], /no text/);
  const written = await videoHero.shots({ category: 'car detailing', steps, call: async (system, content) => { assert.match(system, /one continuous take/); assert.match(content[content.length - 1].text, /1\. Pre-rinse/); return { shots: ['A', 'B'] }; } });
  assert.deepEqual(written, ['A', 'B']);
  assert.equal((await videoHero.shots({ category: 'x', steps, call: async () => ({ shots: ['only one'] }) })).length, 2, 'a wrong count: the plain shots');
});

test('Higgsfield makes the clips with the key SiteRemade already has: the model\u2019s own settings, waiting until done', async () => {
  const calls = [];
  const hf = { submit: async (endpoint, params) => { calls.push([endpoint, params]); return { requestId: 'req-1', status: 'queued' }; },
    status: (() => { let n = 0; return async () => (++n < 3 ? { status: 'in_progress' } : { status: 'completed', outputUrl: 'https://cdn.higgsfield.example/clip.mp4' }); })() };
  const url = await videoHero.higgsfieldClip({ hf, endpoint: 'bytedance/seedance/v2/image-to-video', prompt: 'Slow push in.', imageUrl: 'https://www.siteremade.com/f.jpg', wait: async () => {} });
  assert.equal(url, 'https://cdn.higgsfield.example/clip.mp4');
  assert.deepEqual(calls[0][1], { duration: 5, resolution: '1080p', generate_audio: false, prompt: 'Slow push in.', image_url: 'https://www.siteremade.com/f.jpg' });
  assert.deepEqual(videoHero.higgsfieldParams('kling-video/v3.0/4k/image-to-video'), { duration: 5, sound: 'off' });
  const flagged = { submit: async () => ({ requestId: 'r' }), status: async () => ({ status: 'nsfw' }) };
  await assert.rejects(videoHero.higgsfieldClip({ hf: flagged, endpoint: 'x/y', prompt: 'p', imageUrl: 'u', wait: async () => {} }), /flagged/);
});

test('a take cut short picks up where it stopped: the shots and the clips already made are kept', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vh-resume-'));
  const steps = [{ title: 'One', caption: 'a' }, { title: 'Two', caption: 'b' }, { title: 'Three', caption: 'c' }];
  fs.writeFileSync(path.join(dir, 'shots.json'), JSON.stringify(['S1', 'S2', 'S3']));
  fs.copyFileSync(CLIP, path.join(dir, 'clip-1.mp4')); await videoHero.lastFrame(path.join(dir, 'clip-1.mp4'), path.join(dir, 'frame-1.jpg'));
  const made = [];
  const r = await videoHero.make({ design: 'd', category: 'c', steps, start: photo(), dir, clipper: async (prompt, imageUrl) => { made.push([prompt, imageUrl]); return 'https://fal.media/files/take.mp4'; },
    call: async () => { throw new Error('the shots are not written again'); }, publicUrl: (f) => `https://x/${path.basename(f)}`, fetchImpl: services });
  assert.deepEqual(made.map((m) => m[0]), ['S2', 'S3'], 'only the clips not yet made');
  assert.equal(made[0][1], 'https://x/frame-1.jpg', 'carrying on from the last clip made');
  assert.equal(r.seconds, 15); assert.ok(fs.existsSync(r.video));
});

test('the owner makes a design’s video hero; it chains clip to clip and plays with the scroll, privately', async () => {
  const { srv, session } = await server();
  setDesignDeps({ writer: () => { throw new Error('no writer'); }, fetch: services, wait: async () => {}, photoKeys: { pixabay: 'pk' }, falKey: 'test-fal-key',
    director: () => async () => ({ plan: { use_photos: true, main: 2, before: 1, middle: [], camera: [], skip: [], note: '' } }),
    shotWriter: () => async (system, content) => ({ shots: content[content.length - 1].text.split('\n').filter((l) => /^\d+\./.test(l)).map((l) => `Slow push in, ${l.replace(/^\d+\.\s*/, '')}, steady camera, no text.`) }) });
  try {
    const owner = await session(OWNER), guest = await session(null), stranger = await session('someone@example.com');
    assert.equal((await stranger('POST', '/api/demo-videos/beadline/make', {})).status, 404);
    // no starting photo yet: the owner is told what to do first
    await owner('POST', '/api/demo-videos/beadline/make', {});
    const first = await until(async () => { const r = await owner('GET', '/api/demo-videos/beadline'); return r.json.video && r.json.video.status === 'failed' ? r.json.video : null; });
    assert.match(first.why, /find demo photos/);
    await owner('POST', '/api/demo-photos/find', { designs: ['beadline'] });
    await until(async () => { const r = await owner('GET', '/api/demo-photos'); return !r.json.job.running && r.json.job.done.includes('beadline'); });
    // made: six steps, six clips, each starting where the one before ended
    await owner('POST', '/api/demo-videos/beadline/make', {});
    const made = await until(async () => { const r = await owner('GET', '/api/demo-videos/beadline'); return r.json.video && r.json.video.status === 'ready' ? r.json.video : r.json.video && r.json.video.status === 'failed' ? assert.fail(r.json.video.why) : null; });
    assert.equal(made.shots.length, 6); assert.equal(submitted.length, 6);
    submitted.forEach((b, i) => { assert.match(b.image_url, new RegExp(`/designs/video-frame/[A-Za-z0-9_-]+/frame-${i}\\.jpg$`), `clip ${i + 1} starts from frame ${i}`); assert.equal(b.generate_audio, false); assert.equal(b.resolution, '1080p'); });
    assert.match(submitted[1].prompt, /Snow foam|Snow/i, 'each shot is its step');
    // the owner's private preview plays it; nobody else sees it
    const pv = await owner('GET', '/video-preview/beadline');
    assert.equal(pv.status, 200); assert.ok(pv.text.includes('class="srph-shot srph-video" src="/designs/demo-video/beadline/hero.mp4'), 'the video hero');
    assert.equal((await stranger('GET', '/video-preview/beadline')).status, 404);
    const vid = await guest('GET', '/designs/demo-video/beadline/hero.mp4', null, { range: 'bytes=0-99' });
    assert.equal(vid.status, 206, 'the video answers range requests, so it scrubs'); assert.match(vid.type, /video\/mp4/);
    // once made, the site's demo plays it too, and the catalogue's still is the video's first frame
    assert.ok((await guest('GET', '/designs/demo/beadline')).text.includes('class="srph-shot srph-video" src="/designs/demo-video/beadline/hero.mp4'), 'the public demo plays the video');
    const still = await guest('GET', '/designs/poster/beadline.jpg'); assert.equal(still.status, 200); assert.match(still.type, /image\/jpeg/);
    assert.ok(!(await guest('GET', '/designs/demo/steadyhand')).text.includes('hero.mp4'), 'a design without a video keeps its hero');
  } finally { setDesignDeps({ writer: () => { throw new Error('no writer'); } }); srv.close(); try { fs.unlinkSync(CLIP); } catch (e) { /* gone */ } }
});
