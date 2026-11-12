'use strict';
// BESPOKE (v5) -- one website designed for one business, the way the hand-built Calgary sites were made:
//   1 spec     Claude reads the fact sheet and looks at every photo: intake (what, who, the ONE primary action,
//              what is missing), which photos to use and how to crop them, and a direction (a signature interaction
//              made from this business, a display font no other site uses, brand colours). Written to SPEC.md.
//   2 media    the chosen photos are cropped and resized (lib/bespoke/media.js)
//   3 build    Claude writes the single-file page under the rules (lib/bespoke/rules.js); the code checks
//              (lib/bespoke/validate.js) send back anything wrong, up to 3 times
//   4 look     headless Chrome screenshots in still mode (lib/bespoke/qa.js); Claude scores them against the review
//              and fixes the weakest things, up to 3 rounds, until every score is 7+ and the average 8+
//   run(input, deps) -> { ok, html, spec, report }
//   input: { facts, photosDir, photos: [file], outDir, usedFonts: [], usedSignatures: [], video?: mp4 made from their photo }
//   deps:  { ai: { start(system), say(content), usage }, shoot?(dir), reviewImages?(shots), prepare?(plan, dirs), prepareVideo?(mp4, outDir) }
const fs = require('fs');
const path = require('path');
const { PROCESS } = require('./rules');
const { check } = require('./validate');
const { text, image } = require('./claude');

const MAX_BUILD_TRIES = 3, MAX_LOOK_ROUNDS = 3;

function jsonIn(s) {
  const fence = String(s).match(/```json\s*([\s\S]*?)```/);
  const body = fence ? fence[1] : String(s).slice(String(s).indexOf('{'), String(s).lastIndexOf('}') + 1);
  return JSON.parse(body);
}
function htmlIn(s) {
  const fence = String(s).match(/```html\s*([\s\S]*?)```/);
  const body = fence ? fence[1] : String(s);
  const i = body.search(/<!doctype html>/i);
  return i >= 0 ? body.slice(i).trim() : null;
}

const SPEC_ASK = (input) => `FACT SHEET (the only facts you may use):
${JSON.stringify(input.facts, null, 2)}

USED FONTS (display fonts other sites already use; do not pick these): ${(input.usedFonts || []).join(', ') || 'none'}
USED SIGNATURES (do not repeat these ideas): ${(input.usedSignatures || []).join('; ') || 'none'}

PHOTOS: ${input.photos.length ? input.photos.join(', ') : 'none (design a type-led page)'} (shown below in this order).

Step 1, the spec. Look at every photo. Answer with ONE json block:
{
 "intake": { "what": "", "visitor": "", "primaryAction": "", "primaryUrl": "", "objections": [""], "proof": [""], "missing": [""] },
 "photos": [ { "file": "", "use": true, "why": "", "out": "short-name.jpg", "crop": { "x": 0, "y": 0, "w": 1, "h": 1 }, "alt": "" } ],
 "direction": { "signature": "", "signatureWhy": "", "displayFont": "", "bodyFont": "", "colours": { "name": "#rrggbb" }, "mood": "" },
 "sections": [ "" ],
 "spec_md": "a short SPEC.md: intake, direction, tokens (hex, fonts, easing), sections, facts used, what is not invented"
}
crop values are fractions of the photo (cut away text overlays, app UI, watermarks and identifiable people).
primaryUrl must come from the fact sheet (their booking, order, Instagram or site link) or be a Google Maps search for
the address.`;

const VIDEO_NOTE = (v) => !v ? '' : `
A HERO VIDEO made from their own photo is ready: media/${v.video} (muted, no sound), poster media/${v.poster}, last
frame media/${v.last}${v.frames ? `, and ${v.frames.count} still frames ${v.frames.pattern} (${v.frames.w}x${v.frames.h},
${v.frames.seconds}s)` : ''}. Make it the hero: ${v.frames ? 'a pinned hero whose canvas flips through the still frames as the visitor scrolls (load them progressively, draw the nearest loaded one, cover-fit)' : 'the video plays muted and inline once, then holds its last frame'}.
The design's words and the primary action sit on top, readable over every frame (a soft scrim). Still mode and reduced
motion show media/${v.last} with the words and no pinning. On phones keep it light: frames at half density are fine.`;
const BUILD_ASK = (media, video) => `Step 2, the page. Prepared photos you may use (as media/<file>): ${media.filter((f) => !/^hero[-.]/.test(f)).join(', ') || 'none'}.${VIDEO_NOTE(video)}
Write the complete index.html now under every rule. Answer with ONE \`\`\`html block and nothing else.`;

const LOOK_ASK = (round, warnings, overflow) => `Round ${round} of the visual review. These are screenshots of your page in still mode: desktop
1440x900, phone 390x844, then desktop and phone full pages (scaled down).
${overflow && overflow.mobile > 0 ? `The page overflows sideways by ${overflow.mobile}px at 390px wide: blocking, fix it.\n` : ''}${warnings.length ? 'Code warnings: ' + warnings.join(' ') + '\n' : ''}
Score 1 to 10: first impression, hierarchy and readability, the signature moment, copy (specific, no filler, no
invented facts), phone layout, faithful to their photos and brand. Blocking: overflow, stretched or blank images,
unreadable text, broken layout, placeholder copy.
If every score is 7 or more and the average 8 or more and nothing blocks, answer {"done": true, "scores": {...}}.
Otherwise list the 3 weakest things in one line each, then the complete fixed index.html in ONE \`\`\`html block.`;

async function run(input, deps) {
  const { ai } = deps, out = input.outDir, report = { steps: [], issues: [] };
  fs.mkdirSync(out, { recursive: true });
  ai.start(PROCESS);

  // 1 spec
  const photoBlocks = [];
  for (const f of input.photos) photoBlocks.push(text(`Photo: ${f}`), image(path.join(input.photosDir, f)));
  let spec, said = await ai.say([text(SPEC_ASK(input)), ...photoBlocks]);
  for (let tries = 0; ; tries++) {
    const problems = [];
    try { spec = jsonIn(said); } catch (e) { problems.push('Answer with one valid json block.'); }
    if (spec) {
      const font = String(spec.direction && spec.direction.displayFont || '');
      if (!font) problems.push('Choose a display font.');
      if ((input.usedFonts || []).map((x) => x.toLowerCase()).includes(font.toLowerCase())) problems.push(`${font} is already used: choose another display font.`);
      for (const p of spec.photos || []) if (p.use && !input.photos.includes(p.file)) problems.push(`${p.file} is not one of the photos.`);
    }
    if (!problems.length) break;
    if (tries >= 1) throw new Error('spec: ' + problems.join(' '));
    said = await ai.say(problems.join('\n'));
  }
  fs.writeFileSync(path.join(out, 'SPEC.md'), String(spec.spec_md || ''));
  report.steps.push({ step: 'spec', direction: spec.direction, primaryAction: spec.intake && spec.intake.primaryAction });

  // 2 media
  const plan = (spec.photos || []).filter((p) => p.use);
  const prepared = deps.prepare ? deps.prepare(plan, { inDir: input.photosDir, outDir: out }) : plan.map((p) => ({ file: p.file, out: p.out, ok: true }));
  const media = prepared.filter((p) => p.ok).map((p) => p.out);
  for (const p of prepared) if (!p.ok) report.issues.push(`photo ${p.file}: ${p.error}`);
  // a hero video from their own photo (optional): input.video, prepared by deps.prepareVideo (lib/bespoke/video.js)
  let video = null;
  if (input.video && deps.prepareVideo) {
    try { video = await deps.prepareVideo(input.video, out); media.push(video.video, video.poster, video.last); } catch (e) { report.issues.push(`hero video: ${e.message}`); }
  }
  report.steps.push({ step: 'media', media, video: video && { frames: video.frames && video.frames.count } });

  // 3 build (+ code checks)
  const opts = { facts: input.facts, usedFonts: input.usedFonts || [], media };
  let html = htmlIn(await ai.say(BUILD_ASK(media, video))), result;
  for (let tries = 1; ; tries++) {
    result = html ? check(html, opts) : { errors: ['Answer with the complete page in one ```html block starting with <!doctype html>.'], warnings: [] };
    report.steps.push({ step: 'build', try: tries, errors: result.errors });
    if (!result.errors.length) break;
    if (tries >= MAX_BUILD_TRIES) { report.issues.push(...result.errors); break; }
    html = htmlIn(await ai.say('Fix these and answer with the complete page in one ```html block:\n- ' + result.errors.join('\n- '))) || html;
  }
  fs.writeFileSync(path.join(out, 'index.html'), html || '');

  // 4 look (screenshots -> review -> fix)
  if (deps.shoot && html && !result.errors.length) {
    for (let round = 1; round <= MAX_LOOK_ROUNDS; round++) {
      const shots = deps.shoot(out);
      const imgs = deps.reviewImages ? deps.reviewImages(shots) : shots;
      const answer = await ai.say([text(LOOK_ASK(round, result.warnings || [], shots.overflow)),
        image(imgs.desktop), image(imgs.mobile), image(imgs.desktopFull), image(imgs.mobileFull)]);
      let verdict = null; try { verdict = jsonIn(answer); } catch (e) { /* a fixed page instead */ }
      if (verdict && verdict.done && !(shots.overflow && shots.overflow.mobile > 0)) { report.steps.push({ step: 'look', round, done: true, scores: verdict.scores }); break; }
      const fixed = htmlIn(answer);
      if (!fixed) { report.steps.push({ step: 'look', round, done: false, note: 'no fixed page returned' }); break; }
      const r2 = check(fixed, opts);
      report.steps.push({ step: 'look', round, done: false, fixes: answer.slice(0, answer.indexOf('```')).trim().slice(0, 600), errors: r2.errors });
      if (r2.errors.length) { report.issues.push(...r2.errors.map((e) => `round ${round}: ${e} (kept the previous version)`)); break; }
      html = fixed; result = r2; fs.writeFileSync(path.join(out, 'index.html'), html);
      if (round === MAX_LOOK_ROUNDS) deps.shoot(out);
    }
  }
  report.usage = ai.usage;
  fs.writeFileSync(path.join(out, 'report.json'), JSON.stringify(report, null, 2));
  return { ok: !!html && !report.issues.length, html, spec, report };
}

module.exports = { run, jsonIn, htmlIn };
