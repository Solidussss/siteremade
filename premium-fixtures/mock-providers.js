'use strict';
// node -r ./premium-fixtures/mock-providers.js server.js
//
// TEST DOUBLE for api.openai.com (images) and api.anthropic.com (messages).
// Used ONLY by the fixture harness so the REAL client + REAL server code can be
// exercised end to end without API keys. What it is and is not:
//   - Images are SYNTHETIC procedural scenes (gradient + one block placed where
//     the prompt says the subject goes), not photography. They prove plumbing:
//     sizes, ratios, focal points, crops, evaluation, retry, fallback.
//     They say NOTHING about real image quality.
//   - Token usage numbers are estimates from prompt length. Cost figures derived
//     from them are simulations, not billing.
//   - The website PLANNER call is refused (529) so the client's deterministic
//     engine plans the site, exactly as it does when no Anthropic key is set.
//   - Env MOCK_BLANK_ONCE=hero makes the first hero image come back blank once
//     (to exercise the one-retry policy); MOCK_LOG=<file> records every call.
const zlib = require('zlib');
const fs = require('fs');

const real = globalThis.fetch;
const LOG = process.env.MOCK_LOG;
const blankOnce = new Set(String(process.env.MOCK_BLANK_ONCE || '').split(',').filter(Boolean));
const log = o => { if (LOG) try { fs.appendFileSync(LOG, JSON.stringify(Object.assign({ at: new Date().toISOString() }, o)) + '\n'); } catch (_) { /* ignore */ } };

const crcTable = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
const crc32 = buf => { let c = 0xffffffff; for (let i = 0; i < buf.length; i++) c = crcTable[(c ^ buf[i]) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
function chunk(type, data) { const len = Buffer.alloc(4); len.writeUInt32BE(data.length); const td = Buffer.concat([Buffer.from(type), data]); const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td)); return Buffer.concat([len, td, crc]); }
function png(w, h, pixel) {
  const row = w * 3 + 1, raw = Buffer.alloc(row * h);
  for (let y = 0; y < h; y++) { raw[y * row] = 0; for (let x = 0; x < w; x++) { const [r, g, b] = pixel(x, y); const o = y * row + 1 + x * 3; raw[o] = r; raw[o + 1] = g; raw[o + 2] = b; } }
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 2;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw, { level: 3 })), chunk('IEND', Buffer.alloc(0))]);
}
let seed = 1; const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };

function scene(prompt, size, blank) {
  const [W, H] = size === '1536x1024' ? [768, 512] : size === '1024x1536' ? [512, 768] : [512, 512]; // half-size, same ratio
  if (blank) return png(W, H, () => [235, 235, 235]);
  const right = /right 55%/.test(prompt), left = /left 55%/.test(prompt);
  const warm = /warm/.test(prompt);
  const sky = warm ? [242, 196, 150] : [150, 190, 232], ground = warm ? [96, 78, 60] : [78, 96, 84];
  const bx0 = right ? W * 0.45 : left ? W * 0.05 : W * 0.3, bx1 = right ? W * 0.95 : left ? W * 0.55 : W * 0.7;
  return png(W, H, (x, y) => {
    const t = y / H, n = (rnd() - 0.5) * 34;
    let c = t < 0.62 ? sky.map((v, i) => v + (255 - v) * (0.15 - t * 0.2) + n) : ground.map(v => v + n);
    if (x > bx0 && x < bx1 && y > H * 0.28 && y < H * 0.78) c = [120 + n, 70 + n, 62 + n]; // the "subject"
    return c.map(v => Math.max(0, Math.min(255, v)));
  });
}
const json = (o, status) => new Response(JSON.stringify(o), { status: status || 200, headers: { 'content-type': 'application/json' } });

globalThis.fetch = async function (url, opts) {
  const u = String(url);
  if (u.startsWith('https://api.openai.com/v1/images/generations')) {
    const b = JSON.parse(opts.body);
    let blank = false;
    if (blankOnce.has('hero') && /Wide landscape frame/.test(b.prompt) && !/Simple, uncluttered/.test(b.prompt) && !blankOnce.has('_hero_done')) { blank = true; blankOnce.add('_hero_done'); }
    log({ kind: 'image', model: b.model, quality: b.quality, size: b.size, blank, prompt: b.prompt });
    return json({ data: [{ b64_json: scene(b.prompt, b.size, blank).toString('base64') }] });
  }
  if (u.startsWith('https://api.anthropic.com/v1/messages')) {
    const b = JSON.parse(opts.body);
    const tool = b.tool_choice && b.tool_choice.name;
    const chars = JSON.stringify(b).length;
    const usage = { input_tokens: Math.round(chars / 4), output_tokens: 0, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 };
    if (tool === 'submit_website_plan') { log({ kind: 'planner_refused', model: b.model }); return json({ error: { message: 'mock: planner not available' } }, 529); }
    if (tool === 'report_defects') { usage.output_tokens = 260; log({ kind: 'critic', model: b.model, usage }); return json({ model: b.model, usage, content: [{ type: 'tool_use', name: 'report_defects', input: { defects: [] } }] }); }
    if (tool === 'report_semantic_defects') {
      usage.output_tokens = 500; log({ kind: 'semantic_critic', model: b.model, usage });
      const defects = process.env.MOCK_SEMANTIC_DEFECT ? [{ category: 'CTA_CONSISTENCY', code: 'mock_cta', severity: 3, where: 'hero', field: 'cta', evidence: 'mock finding', fixKind: 'apply_fix_text', fixText: process.env.MOCK_SEMANTIC_DEFECT }] : [];
      return json({ model: b.model, usage, content: [{ type: 'tool_use', name: 'report_semantic_defects', input: { defects } }] });
    }
    usage.output_tokens = 40; log({ kind: 'rewrite', model: b.model, usage });
    return json({ model: b.model, usage, content: [{ type: 'text', text: 'Straightforward service you can rely on.' }] });
  }
  return real(url, opts);
};
