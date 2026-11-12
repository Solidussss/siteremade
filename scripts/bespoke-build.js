#!/usr/bin/env node
'use strict';
// Build one bespoke (v5) website from a business folder. Owner/admin tool: nothing is published or stored in the
// database; the page is written to a folder you open yourself.
//
//   ANTHROPIC_API_KEY=... node scripts/bespoke-build.js <business-dir> [--out <dir>] [--used <used.json>] [--no-look]
//
// <business-dir>/facts.json   everything known about the business (name, address, hours, menu, links, notes);
//                             only these facts may appear on the page
// <business-dir>/photos/      the business's own photos (jpg, png, webp; up to 12 are shown to the AI)
// --used <used.json>          { "fonts": ["Lilita One", ...], "signatures": ["lime drop", ...] } already taken by
//                             other sites, so this one is different
// Output: <out>/index.html, media/, SPEC.md, shots/, report.json (default <business-dir>/v5)
const fs = require('fs');
const path = require('path');
const { run } = require('../lib/bespoke/pipeline');
const { claude, cost } = require('../lib/bespoke/claude');
const { prepare } = require('../lib/bespoke/media');
const qa = require('../lib/bespoke/qa');

async function main() {
  const args = process.argv.slice(2);
  const dir = args.find((a) => !a.startsWith('--'));
  if (!dir) { console.error('usage: node scripts/bespoke-build.js <business-dir> [--out <dir>] [--used <used.json>] [--no-look]'); process.exit(2); }
  const opt = (k) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : null; };
  const out = path.resolve(opt('--out') || path.join(dir, 'v5'));
  const facts = JSON.parse(fs.readFileSync(path.join(dir, 'facts.json'), 'utf8'));
  const photosDir = path.join(dir, 'photos');
  const photos = fs.existsSync(photosDir) ? fs.readdirSync(photosDir).filter((f) => /\.(jpe?g|png|webp)$/i.test(f)).sort().slice(0, 12) : [];
  const used = opt('--used') ? JSON.parse(fs.readFileSync(opt('--used'), 'utf8')) : {};
  const look = !args.includes('--no-look') && qa.findChrome();
  if (!look && !args.includes('--no-look')) console.warn('No Chrome found: skipping the screenshot review (set CHROME_PATH).');

  const ai = claude(process.env.ANTHROPIC_API_KEY, { model: process.env.BESPOKE_MODEL || 'claude-sonnet-5-5' });
  const t0 = Date.now();
  const res = await run({ facts, photosDir, photos, outDir: out, usedFonts: used.fonts || [], usedSignatures: used.signatures || [] },
    { ai, prepare, shoot: look ? (d) => qa.shoot(d) : null, reviewImages: look ? qa.reviewImages : null });
  const secs = Math.round((Date.now() - t0) / 1000);
  console.log(JSON.stringify({ ok: res.ok, out, signature: res.spec && res.spec.direction && res.spec.direction.signature,
    font: res.spec && res.spec.direction && res.spec.direction.displayFont, issues: res.report.issues, calls: ai.usage.calls,
    usd: Number(cost(ai.usage).toFixed(2)), seconds: secs }, null, 2));
  process.exit(res.ok ? 0 : 1);
}
main().catch((e) => { console.error(e.message || e); process.exit(1); });
