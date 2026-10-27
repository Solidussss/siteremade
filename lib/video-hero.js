// THE VIDEO HERO: a design's drawn hero, with real video underneath instead of the drawing. The drawn heroes tell a
// story in steps as you scroll (car detailing: pre-rinse, snow foam, wash, decontam, polish, ceramic) and their cards
// and readouts tick through the steps. Here each step becomes a short clip, made by a top video model (Seedance or
// Kling, through Higgsfield with the key SiteRemade already has, else Seedance on fal.ai), and each clip
// starts on the last frame of the one before, so the steps play as one continuous take. The take is joined into one
// video the page plays with the scroll: down moves it forward, up rewinds. The design's own cards stay on top.
//
//   1. Claude writes each step's shot from the step's own caption (shots()): one continuous take, the same subject,
//      slow steady camera, nothing that AI video gets wrong (text, logos, faces up close)
//   2. Seedance makes the clips in order (clip()), each from the last frame of the one before
//   3. ffmpeg joins them into one video built for scrubbing: every frame a keyframe, 24 fps, no sound (assemble())
//
// It's made once per design (or per site) on the server and kept; showing it costs nothing. SiteRemade's own keys pay
// (FAL_KEY for the video, ANTHROPIC_API_KEY for the shots), never the customer's, and never in dev or tests.
'use strict';

const fs = require('fs');
const path = require('path');
const { execFile } = require('child_process');

const MODEL = process.env.SITEREMADE_VIDEO_MODEL || 'bytedance/seedance-2.5/image-to-video';
const RESOLUTION = process.env.SITEREMADE_VIDEO_RESOLUTION || '1080p';
const SECONDS = 5;
const sleep = (ms) => new Promise((ok) => setTimeout(ok, ms));

function ffmpegPath() {
  if (process.env.FFMPEG_PATH) return process.env.FFMPEG_PATH;
  try { const p = require('ffmpeg-static'); if (p && fs.existsSync(p)) return p; } catch (e) { /* not installed */ }
  return 'ffmpeg';
}
const run = (args, timeoutMs = 600000) => new Promise((ok, no) => execFile(ffmpegPath(), args, { timeout: timeoutMs, maxBuffer: 16 * 1024 * 1024 }, (e, out, err) => (e ? no(new Error(`ffmpeg: ${String(err || e.message).split('\n').filter(Boolean).slice(-2).join(' ')}`)) : ok(out))));

// ---- 1. the shots ----------------------------------------------------------------------------------------------------
const SHOT_RULES = `You direct the opening video of a small business's website. The video is one continuous take, cut into steps that
play as the visitor scrolls. Each step is about ${SECONDS} seconds and starts exactly where the previous one ended (its first
frame is the previous step's last frame), so the same place, the same subject, the same light carry through.

Write one shot per step for an image-to-video model (Seedance). Each shot is one or two plain sentences in this order:
the camera move, the subject and what visibly happens to it in this step, the light, then "steady camera, no cuts, no text".
Rules that keep AI video from looking fake:
- One slow, smooth camera move per shot (slow push in, slow dolly left/right, gentle orbit, slow tilt). Never fast moves, zooms or cuts.
- Keep the subject the same object throughout (the same car, the same plate, the same chair): never introduce a new one.
- Show the step's work as change on the subject (foam appears, water runs off, the shine comes up), done by gloved hands or tools
  at the edge of frame at most. No faces, no close-up hands holding things, no readable text, no logos, no screens.
- Realistic, photographic, natural colours. No glow, sparkles, slow-motion splashes or anything that looks like an effect.
- The last step ends on the finished result, still and beautiful.`;

const SHOT_SCHEMA = { type: 'object', additionalProperties: false, required: ['shots'], properties: { shots: { type: 'array', items: { type: 'string' } } } };

// what each step should look like on video: [prompt] one per step. call(system, content) -> parsed JSON; without one
// (no key), a plain shot from the step's own words
async function shots({ category, steps, image, call = null }) {
  const plain = steps.map((s, i) => `Slow steady push in. ${s.title}: ${s.caption} ${i === steps.length - 1 ? 'Ends on the finished result, still.' : ''} Realistic, natural light, steady camera, no cuts, no text.`.replace(/\s+/g, ' ').trim());
  if (!call) return plain;
  const content = [];
  if (image) content.push({ type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: Buffer.from(image).toString('base64') } });
  content.push({ type: 'text', text: `The business: a ${category}. ${image ? 'The photo above is the first frame of the take. ' : ''}The steps, in order:\n${steps.map((s, i) => `${i + 1}. ${s.title}: ${s.caption}`).join('\n')}\n\nWrite exactly ${steps.length} shots, one per step, in order.` });
  try {
    const j = await call(SHOT_RULES, content, SHOT_SCHEMA);
    const out = Array.isArray(j && j.shots) ? j.shots.map((x) => String(x || '').replace(/\s+/g, ' ').trim().slice(0, 900)) : [];
    return out.length === steps.length && out.every(Boolean) ? out : plain;
  } catch (e) { return plain; }
}

// a design that doesn't list its story as steps (a barber's fade, a perfume's notes): Claude reads the design's words
// and the starting photo and writes the take's steps -> [{ title, caption }] (STORY_STEPS of them), or null
const STORY_STEPS = 5;
const STORY_SCHEMA = { type: 'object', additionalProperties: false, required: ['steps'], properties: { steps: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['title', 'caption'], properties: { title: { type: 'string' }, caption: { type: 'string' } } } } } };
async function storySteps({ category, words, image, call = null }) {
  if (!call) return null;
  const content = [];
  if (image) content.push({ type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: Buffer.from(image).toString('base64') } });
  content.push({ type: 'text', text: `The business: a ${category}. ${image ? 'The photo above is the first frame of the take. ' : ''}Its website's words:\n${String(words).slice(0, 6000)}\n\nWrite exactly ${STORY_STEPS} steps for the opening video: the business's work on one subject, start to finish, as the visitor scrolls (a haircut from start to the finished fade, a dish from raw to plated, a room from bare to finished). Each step: a two-or-three-word title and one short sentence of what visibly happens. Only what can be filmed on the subject in the photo; no people's faces, no screens, no text.` });
  try {
    const j = await call('You plan the scroll story of a small business website\'s opening video. Answer in the schema.', content, STORY_SCHEMA);
    const out = (Array.isArray(j && j.steps) ? j.steps : []).map((x) => ({ title: String(x.title || '').trim().slice(0, 60), caption: String(x.caption || '').trim().slice(0, 300) })).filter((x) => x.title);
    return out.length === STORY_STEPS ? out : null;
  } catch (e) { return null; }
}

// Claude on SiteRemade's key, answering in the schema's JSON
function claudeCaller(key, model = 'claude-sonnet-5-5') {
  if (!key) return null;
  return async (system, content, schema) => {
    const r = await fetch('https://api.anthropic.com/v1/messages', { method: 'POST', headers: { 'content-type': 'application/json', 'x-api-key': key, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({ model, max_tokens: 4000, system, messages: [{ role: 'user', content }], output_config: { effort: 'medium', format: { type: 'json_schema', schema } } }) });
    if (!r.ok) throw new Error(`shot writer error ${r.status}`);
    const j = await r.json();
    if (j.stop_reason === 'refusal' || j.stop_reason === 'max_tokens') throw new Error(`shot writer stopped (${j.stop_reason})`);
    return JSON.parse((j.content || []).filter((b) => b.type === 'text').map((b) => b.text).join(''));
  };
}

// ---- 2. the clips ----------------------------------------------------------------------------------------------------
// one clip from fal's queue: submit, wait, fetch the result -> the video's URL
async function clip({ key, prompt, imageUrl, fetchImpl = fetch, wait = sleep, model = MODEL, resolution = RESOLUTION, log = () => {} }) {
  const headers = { authorization: `Key ${key}`, 'content-type': 'application/json' };
  const input = { prompt, image_url: imageUrl, duration: String(SECONDS), resolution, aspect_ratio: '16:9', generate_audio: false };
  let r = await fetchImpl(`https://queue.fal.run/${model}`, { method: 'POST', headers, body: JSON.stringify(input) });
  // (a resolution this endpoint doesn't make: the next one down)
  if (r.status === 422 && resolution === '1080p') { log('1080p refused, using 720p'); return clip({ key, prompt, imageUrl, fetchImpl, wait, model, resolution: '720p', log }); }
  if (!r.ok) { let why = ''; try { why = (await r.text()).replace(/\s+/g, ' ').slice(0, 300); } catch (e) { /* none */ } throw new Error(`video service refused the clip (${r.status}${r.status === 401 || r.status === 403 ? ': check FAL_KEY' : r.status === 402 ? ': add credit on fal.ai' : ''}) ${why}`.trim()); }
  const sub = await r.json();
  const base = `https://queue.fal.run/${model.split('/').slice(0, 2).join('/')}/requests/${sub.request_id}`;
  const statusUrl = sub.status_url || `${base}/status`, resultUrl = sub.response_url || base;
  for (let t = 0; ; t++) {
    if (t > 240) throw new Error('the clip took more than 20 minutes');
    await wait(5000);
    const s = await fetchImpl(statusUrl, { headers });
    if (!s.ok) continue;
    const st = await s.json();
    if (st.status === 'COMPLETED') break;
    if (st.status === 'FAILED' || st.status === 'ERROR') throw new Error('the video service failed this clip');
  }
  r = await fetchImpl(resultUrl, { headers });
  if (!r.ok) throw new Error(`could not fetch the clip (${r.status})`);
  const out = await r.json();
  const url = out && (out.video && out.video.url || out.video_url || (out.videos && out.videos[0] && out.videos[0].url));
  if (!url) throw new Error('the video service returned no video');
  return url;
}

// one clip from Higgsfield (lib/media/higgsfield.js, the key SiteRemade already has): the same top models (Seedance,
// Kling), through Higgsfield's own API -> the video's URL. endpoint is a Higgsfield model id.
function higgsfieldParams(endpoint) {
  if (/seedance/i.test(endpoint)) return { duration: SECONDS, resolution: RESOLUTION, generate_audio: false };
  if (/^kling-video\//i.test(endpoint)) return { duration: SECONDS, sound: 'off' };
  if (/^wan\//i.test(endpoint)) return { duration: SECONDS, resolution: '720p' };
  return { duration: SECONDS };
}
// (job: { get, set } keeps the request's id on disk, so a restart while the clip is being made picks the same clip up
// instead of paying for it again)
async function higgsfieldClip({ hf, endpoint, prompt, imageUrl, wait = sleep, log = () => {}, job = null }) {
  const had = job && job.get();
  const sub = had ? { requestId: had } : await hf.submit(endpoint, { ...higgsfieldParams(endpoint), prompt, image_url: imageUrl });
  if (had) log('collecting the clip ordered before the restart'); else if (job) job.set(sub.requestId);
  for (let t = 0; ; t++) {
    if (t > 240) throw new Error('the clip took more than 20 minutes');
    await wait(5000);
    let st; try { st = await hf.status(sub.requestId); } catch (e) { log(`status check: ${e.message}`); continue; }
    if (st.status === 'completed') { if (!st.outputUrl) throw new Error('Higgsfield returned no video'); return st.outputUrl; }
    if (['failed', 'nsfw', 'canceled'].includes(st.status)) throw new Error(`Higgsfield ${st.status === 'nsfw' ? 'flagged' : st.status} this clip`);
  }
}

// ---- 3. the take -----------------------------------------------------------------------------------------------------
// the last frame of a clip, as a JPEG
async function lastFrame(file, out) { await run(['-y', '-sseof', '-0.25', '-i', file, '-update', '1', '-q:v', '2', out]); return out; }

// the clips joined into one video for scrubbing (a keyframe every third of a second, so any moment is a few frames
// away: about 7 MB for 30 seconds at 1280 px), plus a
// poster (the first frame) for the moment before it loads -> { video, poster, seconds }
async function assemble(files, dir) {
  const list = path.join(dir, 'clips.txt');
  fs.writeFileSync(list, files.map((f) => `file '${f.replace(/'/g, "'\\''")}'`).join('\n'));
  const video = path.join(dir, 'hero.mp4'), poster = path.join(dir, 'poster.jpg');
  await run(['-y', '-f', 'concat', '-safe', '0', '-i', list, '-an', '-vf', 'scale=1280:-2:flags=lanczos,fps=24,format=yuv420p', '-c:v', 'libx264', '-preset', 'slow', '-crf', '27', '-g', '8', '-keyint_min', '8', '-sc_threshold', '0', '-movflags', '+faststart', video], 1800000);
  await run(['-y', '-i', video, '-frames:v', '1', '-q:v', '3', poster]);
  const seconds = files.length * SECONDS;
  await frames(video, dir, seconds);
  return { video, poster, seconds };
}

// the take as still pictures, the way the smoothest scroll sites do it: the page flips through them with the scroll
// instead of seeking a video (which stutters, most of all on iPhones). Eight a second, 90 to 240 of them, 1280 px.
// -> { count, w, h, seconds }, also kept as frames.json beside them
async function frames(video, dir, seconds) {
  const out = path.join(dir, 'f'); fs.rmSync(out, { recursive: true, force: true }); fs.mkdirSync(out, { recursive: true });
  const want = Math.min(240, Math.max(90, Math.round(seconds * 8)));
  await run(['-y', '-i', video, '-vf', `fps=${(want / seconds).toFixed(4)},scale=1280:-2:flags=lanczos`, '-q:v', '5', path.join(out, '%d.jpg')], 1800000);
  const count = fs.readdirSync(out).filter((f) => /^\d+\.jpg$/.test(f)).length;
  const j = require('jpeg-js').decode(fs.readFileSync(path.join(out, '1.jpg')), { maxMemoryUsageInMB: 256 });
  const info = { count, w: j.width, h: j.height, seconds };
  fs.writeFileSync(path.join(dir, 'frames.json'), JSON.stringify(info));
  return info;
}

// the whole hero for one design: shots, clips in a chain, the take. publicUrl(file) gives a public address for a file
// in `dir` (fal fetches each clip's first frame from it). -> { video, poster, seconds, shots }
// clipper(prompt, imageUrl) makes one clip (Higgsfield or fal); without one, fal with `key`
async function make({ design, category, steps, start, dir, key, clipper = null, call = null, publicUrl, fetchImpl = fetch, wait = sleep, log = () => {} }) {
  if (!clipper && !key) throw new Error('no video service is set up (HIGGSFIELD_API_KEY or FAL_KEY)');
  // (a take cut short -- a restart -- picks up where it stopped: the shots and every clip already made are kept,
  // so nothing is paid for twice)
  fs.mkdirSync(dir, { recursive: true });
  const first = path.join(dir, 'frame-0.jpg'); if (!fs.existsSync(first)) fs.writeFileSync(first, start);
  const saved = path.join(dir, 'shots.json');
  let prompts = null; try { prompts = JSON.parse(fs.readFileSync(saved, 'utf8')); } catch (e) { /* not yet */ }
  if (!Array.isArray(prompts) || prompts.length !== steps.length) { prompts = await shots({ category, steps, image: start, call }); fs.writeFileSync(saved, JSON.stringify(prompts, null, 2)); log(`${design}: ${prompts.length} shots written`); }
  else log(`${design}: picking up where it stopped`);
  const files = []; let frame = first;
  for (let i = 0; i < prompts.length; i++) {
    const done = path.join(dir, `clip-${i + 1}.mp4`), doneFrame = path.join(dir, `frame-${i + 1}.jpg`), jobFile = path.join(dir, `clip-${i + 1}.job`);
    const job = { get: () => { try { return fs.readFileSync(jobFile, 'utf8').trim() || null; } catch (e) { return null; } }, set: (id) => fs.writeFileSync(jobFile, String(id)) };
    if (fs.existsSync(done) && fs.existsSync(doneFrame) && fs.statSync(done).size > 1000) { files.push(done); frame = doneFrame; log(`${design}: clip ${i + 1} already made`); continue; }
    const stepLog = (m) => log(`${design} step ${i + 1}: ${m}`);
    const url = clipper ? await clipper(prompts[i], publicUrl(frame), stepLog, job) : await clip({ key, prompt: prompts[i], imageUrl: publicUrl(frame), fetchImpl, wait, log: stepLog });
    const r = await fetchImpl(url); if (!r.ok) throw new Error(`could not download clip ${i + 1} (${r.status})`);
    const file = path.join(dir, `clip-${i + 1}.mp4`); fs.writeFileSync(file, Buffer.from(await r.arrayBuffer())); files.push(file);
    frame = await lastFrame(file, path.join(dir, `frame-${i + 1}.jpg`)); try { fs.unlinkSync(jobFile); } catch (e) { /* none */ }
    log(`${design}: clip ${i + 1} of ${prompts.length} made`);
  }
  const take = await assemble(files, dir);
  return { ...take, shots: prompts };
}

module.exports = { MODEL, RESOLUTION, SECONDS, SHOT_RULES, STORY_STEPS, shots, storySteps, claudeCaller, clip, higgsfieldClip, higgsfieldParams, lastFrame, assemble, frames, make, ffmpegPath };
