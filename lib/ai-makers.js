'use strict';
// THE PAID WORK behind each customer AI action (lib/ai-jobs.js runs these, one call per part, and charges or refunds).
// Every maker returns { result, usd } -- usd is what the provider charged (or, where the provider reports no cost,
// SiteRemade's budgeted figure from lib/ai-prices.js) -- or throws an error carrying e.usd when the provider charged
// for something that couldn't be used. Keys reach this file only from server.js through lib/paid-providers.js, so a
// development machine or a test can never make a paid call from here.
//
//   assist_update  Claude turns the customer's words into a plan in the editor's own terms (lib/design-ask.js) --
//                  nothing is saved; applying it is a normal (free) edit with undo
//   own_plan       Claude turns "Make It Your Own" answers into that same kind of plan, plus the prompts for a start
//                  image, an end image and the motion between them
//   image          one picture from OpenAI (gpt-image-1, JPEG), kept on the volume
//   video          one Wan 3.0 Prime clip through Higgsfield: a start image, an end image only if the endpoint is
//                  configured to take one, 5 or 12 seconds, no audio (where the endpoint has the setting)
//   exterior       the same, from one exterior photo, with a cinematic property prompt
//   showcase       one segment per pair of photos; joined into one film afterwards (free, ffmpeg)
const fs = require('fs');
const path = require('path');
const { execFile } = require('child_process');
const prices = require('./ai-prices');

const sleep = (ms) => new Promise((ok) => setTimeout(ok, ms));
const fail = (message, usd = 0) => Object.assign(new Error(message), { usd });

// ---- Claude: the image/video prompts for "Make It Your Own" (one small call, JSON out)
const PROMPT_TOOL = {
  name: 'prompts', description: 'The generation prompts for this website.',
  input_schema: { type: 'object', additionalProperties: false, required: ['start', 'end', 'motion'],
    properties: { start: { type: 'string', description: 'The start image: subject, setting, light, lens, mood. One paragraph. No text, no logos, no faces up close.' },
      end: { type: 'string', description: 'The end image: the SAME scene, camera and light as the start, changed only by what happens. Empty if no end image is wanted.' },
      motion: { type: 'string', description: 'What happens between them, for the video model: one continuous shot, slow steady camera, physical and believable.' } } },
};
function promptRequest(answers, site) {
  const a = answers || {};
  return [`Business: ${site.businessName || 'a small business'} (${site.design} design${site.category ? `, ${site.category}` : ''}).`,
    a.feel && `The feel they want: ${a.feel}`, a.audience && `Who it's for: ${a.audience}`, a.colours && `Colours: ${a.colours}`,
    a.story && `Their story: ${a.story}`, a.start && `The start image: ${a.start}`, a.end && `The end image: ${a.end}`, a.motion && `What happens between: ${a.motion}`]
    .filter(Boolean).join('\n');
}

// ---- Claude looks at the customer's own start/end images and says how the website should match them
const MATCH_TOOL = {
  name: 'match', description: 'How this website should change to match the hero images.',
  input_schema: { type: 'object', additionalProperties: false, required: ['look', 'request', 'motion'],
    properties: { look: { type: 'string', description: 'One sentence: the mood, light and palette of the images.' },
      request: { type: 'string', description: 'The change to ask the website editor for, in plain words: colours (with hex values taken from the images), the feel of the headline and copy, what to emphasise -- and, if the owner described their business, rewrite the words for that business using only what they said. Only what the images and the owner support; never invent facts, prices or claims about the business.' },
      motion: { type: 'string', description: 'For the video model: what happens between the start and end image, one continuous shot, slow steady camera, physical and believable.' } } },
};

// ---- OpenAI: one picture, as a JPEG
async function openaiImage({ key, prompt, aspect = '16:9', model = 'gpt-image-1', quality = 'medium', fetchImpl = fetch }) {
  const size = aspect === '1:1' ? '1024x1024' : (aspect === '9:16' || aspect === '4:5') ? '1024x1536' : '1536x1024';
  const r = await fetchImpl('https://api.openai.com/v1/images/generations', { method: 'POST', headers: { authorization: `Bearer ${key}`, 'content-type': 'application/json' },
    body: JSON.stringify({ model, prompt, size, quality, n: 1, output_format: 'jpeg', output_compression: 85 }) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw fail(`The image service refused this (${r.status}).`);   // OpenAI doesn't charge a refused request
  const b64 = j && j.data && j.data[0] && j.data[0].b64_json; if (!b64) throw fail('The image service returned no picture.');
  return Buffer.from(b64, 'base64');
}

// ---- Higgsfield: one Wan clip. Parameters come from the server's configuration (see WAN in server.js), because the
// endpoint's exact inputs could not be verified from here.
// image-to-video (startUrl, optional endUrl) or, with refUrls, reference-to-video (one clip guided by several photos)
async function wanClip({ hf, wan, prompt, startUrl, endUrl, refUrls, seconds, quality, wait = sleep, log = () => {} }) {
  const t = prices.table(); const q = t.video.qualities.includes(quality) ? quality : t.video.quality;
  const params = Object.assign(refUrls ? { prompt, image_urls: refUrls, duration: seconds, resolution: q } : { prompt, image_url: startUrl, duration: seconds, resolution: q }, wan.extra || {});
  if (!refUrls && endUrl && wan.endParam) params[wan.endParam] = endUrl;
  const sub = await hf.submit(refUrls ? wan.refEndpoint : wan.endpoint, params);
  const usd = +(seconds * t.provider.wan_usd_per_second[q]).toFixed(4);   // Higgsfield reports no cost: the budget figure
  for (let t = 0; ; t++) {
    if (t > 360) { await hf.cancel(sub.requestId); throw fail('The video took more than 30 minutes.', usd); }
    await wait(5000);
    let st; try { st = await hf.status(sub.requestId); } catch (e) { log(`status: ${e.message}`); continue; }
    if (st.status === 'completed') { if (!st.outputUrl) throw fail('The video service returned no video.', usd); return { url: st.outputUrl, usd }; }
    // (Higgsfield doesn't charge failed or flagged requests)
    if (['failed', 'nsfw', 'canceled'].includes(st.status)) throw fail(st.status === 'nsfw' ? 'The video service flagged this. Try different photos or words.' : 'The video service couldn’t make this clip.', 0);
  }
}

function ffmpeg(bin, args, timeout = 600000) { return new Promise((ok, no) => execFile(bin, args, { timeout }, (e, so, se) => (e ? no(new Error(String(se || e.message).slice(-300))) : ok()))); }

// deps: { db, designSites, writer: () => writer, claudeJson: async ({ system, user, tool }) => { json, usd },
//         openaiKey, higgsfield: hf | null, wan: { endpoint, endParam, resolution, extra }, dir: the AI media folder,
//         ffmpegBin, wait, log, fetchImpl }
function create(deps) {
  const d = deps; const log = d.log || (() => {});
  const site = (job, params) => { const row = params.siteId && d.db.designSites.find(params.siteId); if (!row || row.account_id !== job.account_id) throw fail('Site not found.'); return row; };
  const input = (ref) => (/\//.test(ref) ? ref : `in/${ref}.jpg`);   // an upload token or "<job>/<file>"
  async function keepVideo(job, ctx, name, url) {
    const got = await d.higgsfield.download(url, 'video');
    const file = path.join(ctx.dir, `${name}.mp4`); fs.writeFileSync(file, got.bytes);
    try { await ffmpeg(d.ffmpegBin, ['-y', '-i', file, '-frames:v', '1', '-q:v', '3', path.join(ctx.dir, `${name}.jpg`)], 60000); } catch (e) { log(`poster: ${e.message}`); }
    return { url: `/ai-media/${job.id}/${name}.mp4`, poster: `/ai-media/${job.id}/${name}.jpg` };
  }
  async function clip(job, ctx, name, { start, end, refs, prompt, seconds, quality }) {
    let usd = 0;
    try {
      const c = await wanClip({ hf: d.higgsfield, wan: d.wan, prompt, startUrl: start ? `${ctx.base}/ai-media/${input(start)}` : null, endUrl: end ? `${ctx.base}/ai-media/${input(end)}` : null,
        refUrls: refs ? refs.map((r) => `${ctx.base}/ai-media/${input(r)}`) : null, seconds, quality: quality || ctx.params.quality, wait: d.wait, log });
      usd = c.usd;
      return { result: await keepVideo(job, ctx, name, c.url), usd };
    } catch (e) { throw fail(e.message, e.usd != null ? e.usd : usd); }
  }
  const makers = {
    async assist_update(part, job, ctx) {
      const row = site(job, ctx.params);
      const r = await d.designSites.ask(row, ctx.params.request, d.writer());
      const usd = d.designSites.cost(r.usage || {});
      if (!r.ok) throw fail(r.message || 'The change couldn’t be worked out. Try saying it another way.', usd);
      return { result: { plan: { request: r.request, kind: r.kind, summary: r.summary, changes: r.changes, ops: r.ops, rename: r.rename, cannot: r.cannot, question: r.question, diff: r.diff } }, usd };
    },
    async own_plan(part, job, ctx) {
      const row = site(job, ctx.params); const a = ctx.params.answers || {};
      const view = d.designSites.view(row);
      const want = [a.feel && `Make it feel ${a.feel}.`, a.audience && `It's for ${a.audience}.`, a.colours && `Colours: ${a.colours}.`, a.story && `Our story: ${a.story}.`].filter(Boolean).join(' ');
      let usd = 0, plan = null;
      if (want) {
        const r = await d.designSites.ask(row, `Make this website our own. ${want}`, d.writer()); usd += d.designSites.cost(r.usage || {});
        if (r.ok) plan = { request: r.request, kind: r.kind, summary: r.summary, changes: r.changes, ops: r.ops, rename: r.rename, cannot: r.cannot, question: r.question, diff: r.diff };
      }
      let prompts = null;
      if (a.start || a.end || a.motion || a.story || a.feel) {
        const p = await d.claudeJson({ system: 'You write prompts for an image model and a video model, for a small business website hero. Stay true to what the owner said; never invent facts about the business. No text, letters or logos in images.', user: promptRequest(a, { businessName: view.businessName, design: row.design }), tool: PROMPT_TOOL });
        usd += p.usd || 0; prompts = p.json;
      }
      if (!plan && !prompts) throw fail('Nothing could be planned from those answers. Try adding a little more.', usd);
      return { result: { plan, prompts }, usd };
    },
    // "Build your hero": the customer's OWN start (and end) image, used exactly as given. Part 1: Claude looks at them
    // and the rest of the website is changed to match (applied, with undo). Part 2: Wan makes the hero from those
    // images, and it goes straight onto the site.
    async hero_build(part, job, ctx) {
      const p = ctx.params, row = site(job, p), aiDir = path.dirname(ctx.dir);
      const pics = [p.start, p.end].filter(Boolean).map((t) => ({ mediaType: 'image/jpeg', data: fs.readFileSync(path.join(aiDir, 'in', `${t}.jpg`)).toString('base64') }));
      if (part.n === 1) {
        const view = d.designSites.view(row);
        const m = await d.claudeJson({ system: 'You are matching a small business website to the hero images its owner made. Look closely at the images: palette, light, mood, subject. Keep the business’s facts exactly as they are.',
          user: `Business: ${view.businessName || 'a small business'} (${row.design} design).${p.about ? `\nThe owner describes the business: ${p.about}` : ''}${p.prompt ? `\nThe owner says what happens between the images: ${p.prompt}` : ''}\nThe ${pics.length > 1 ? 'first image is the start and the second is the end' : 'image is the start'} of the hero video.`, tool: MATCH_TOOL, images: pics });
        let usd = m.usd || 0; const look = m.json || {};
        if (!look.request) throw fail('Claude couldn’t read the images. Try another pair.', usd);
        ctx.motion = look.motion;
        const r = await d.designSites.ask(d.db.designSites.find(row.id), look.request, d.writer()); usd += d.designSites.cost(r.usage || {});
        if (!r.ok) throw fail(r.message || 'The website couldn’t be matched to the images.', usd);
        let applied = 0;
        if (r.diff && r.diff.length) {
          const e = d.designSites.edit(d.db, d.db.designSites.find(row.id), { changes: r.changes, ops: r.ops, via: 'ask' }, 'account:' + job.account_id);
          if (e.error) throw fail('The matching changes broke the design’s rules, so nothing was changed.', usd);
          applied = r.diff.length;
        }
        return { result: { look: look.look, motion: look.motion || '', summary: r.summary, applied, diff: r.diff || [] }, usd };
      }
      if (ctx.motion == null) {   // a retry of the video alone: take the motion Claude wrote when it looked at the images
        try { const one = d.db.aiJobs.parts(job.id).find((x) => x.n === 1); ctx.motion = (one && one.result_json && JSON.parse(one.result_json).motion) || ''; } catch (e) { ctx.motion = ''; }
      }
      const c = await clip(job, ctx, 'video', { start: p.start, end: p.end, seconds: p.seconds, prompt: [p.prompt, ctx.motion].filter(Boolean).join(' ') || 'A slow, steady cinematic camera move from the first image to the last. Believable motion.' });
      const vid = { path: 'photos.video', value: c.result.url }, poster = { path: 'photos.main', value: `${String(ctx.base).replace(/^http:/, 'https:')}${c.result.poster}` };
      const e = d.designSites.edit(d.db, d.db.designSites.find(row.id), { changes: fs.existsSync(path.join(ctx.dir, 'video.jpg')) ? [vid, poster] : [vid], via: 'director' }, 'account:' + job.account_id);
      return { result: Object.assign({}, c.result, { onSite: !e.error }), usd: c.usd };
    },
    async image(part, job, ctx) {
      const prompt = (ctx.params.prompts || [])[part.n - 1]; if (!prompt) throw fail('No prompt for this image.');
      const buf = await openaiImage({ key: d.openaiKey, prompt, aspect: ctx.params.aspect, fetchImpl: d.fetchImpl });
      const name = `image-${part.n}.jpg`; fs.writeFileSync(path.join(ctx.dir, name), buf);
      return { result: { url: `/ai-media/${job.id}/${name}` }, usd: prices.table().provider.image_usd };
    },
    async video(part, job, ctx) {
      const p = ctx.params; return clip(job, ctx, 'video', { start: p.start, end: p.end, prompt: p.prompt || 'A slow, steady cinematic camera move. Natural light, believable motion.', seconds: p.seconds });
    },
    // Before & after: the first picture (before -- an empty plot, a shell, a dated room) to the last (the finished
    // property), one continuous shot; with no end picture, a slow exterior move
    async exterior(part, job, ctx) {
      const p = ctx.params;
      const how = p.end && d.wan.endParam
        ? 'The same place transforms from the first image into the last, as if built from the ground up: one continuous shot from a steady camera, the work progressing naturally, ending exactly on the finished property. Real architecture of the final image, natural light, no people, no text.'
        : 'A slow cinematic drone move around this property\'s exterior, steady and smooth, real architecture unchanged, natural light, no people, no text.';
      return clip(job, ctx, 'video', { start: p.start, end: p.end, seconds: p.seconds, prompt: `${p.prompt ? p.prompt + ' ' : ''}${how}` });
    },
    // Walkthrough tour: the photos (in order) are references for ONE continuous tour (Wan reference-to-video)
    async walkthrough(part, job, ctx) {
      const p = ctx.params;
      return clip(job, ctx, 'video', { refs: p.photos, seconds: p.seconds,
        prompt: `${p.prompt ? p.prompt + ' ' : ''}A smooth real-estate walkthrough tour of this property: one continuous, steady gimbal shot moving through the spaces shown in the reference images, in the order given. Keep every room, furniture and finish exactly as in the images. Natural light, no people, no text.` });
    },
    async showcase(part, job, ctx) {
      const p = ctx.params, n = part.n;
      return clip(job, ctx, `segment-${n}`, { start: p.photos[n - 1], end: p.photos[n], seconds: p.seconds,
        prompt: `${p.prompt ? p.prompt + ' ' : ''}A slow, smooth real-estate camera move through this room, steady gimbal, natural light, the room and furniture unchanged, no people, no text.${d.wan.endParam ? ' End on the next view.' : ''}` });
    },
  };
  // after a showcase: its finished segments joined, in order, into one film (free)
  async function joinShowcase(job, ctx) {
    const done = job.parts.filter((p) => p.status === 'done').sort((a, b) => a.n - b.n).map((p) => path.join(ctx.dir, `segment-${p.n}.mp4`)).filter((f) => fs.existsSync(f));
    if (done.length < 2) return null;
    const list = path.join(ctx.dir, 'segments.txt'); fs.writeFileSync(list, done.map((f) => `file '${f.replace(/'/g, "'\\''")}'`).join('\n'));
    await ffmpeg(d.ffmpegBin, ['-y', '-f', 'concat', '-safe', '0', '-i', list, '-an', '-vf', 'scale=1920:-2:flags=lanczos,fps=30,format=yuv420p', '-c:v', 'libx264', '-preset', 'medium', '-crf', '20', '-movflags', '+faststart', path.join(ctx.dir, 'showcase.mp4')], 900000);
    return `/ai-media/${job.id}/showcase.mp4`;
  }
  // what isn't set up on this server, per action ('' = ready)
  const available = {
    assist_update: () => (d.hasClaude ? '' : 'AI updates aren’t set up on this server.'),
    own_plan: () => (d.hasClaude ? '' : 'AI planning isn’t set up on this server.'),
    hero_build: () => (!d.hasClaude ? 'AI isn’t set up on this server.' : d.higgsfield && d.wan.endpoint ? '' : 'Hero videos aren’t switched on yet.'),
    image: () => (d.openaiKey ? '' : 'AI images aren’t set up on this server.'),
    video: () => (d.higgsfield && d.wan.endpoint ? '' : 'AI video isn’t set up on this server yet.'),
    exterior: () => (d.higgsfield && d.wan.endpoint ? '' : 'Property videos aren’t set up on this server yet.'),
    showcase: () => (d.higgsfield && d.wan.endpoint ? '' : 'Property videos aren’t set up on this server yet.'),
    walkthrough: () => (d.higgsfield && d.wan.refEndpoint ? '' : 'Walkthrough tours aren’t set up on this server yet.'),
  };
  return { makers, available, joinShowcase };
}

module.exports = { create, openaiImage, wanClip, promptRequest, PROMPT_TOOL, MATCH_TOOL };
