'use strict';
// A stand-in for Blender, for tests of everything AROUND Blender (lib/three-d/blender.js, pipeline.js, the premium job):
// it is started exactly as Blender is -- the same fixed arguments, the same job file -- and behaves as told, so the
// wrapper's own rules (time limit, cleanup, structured errors, a fixed command, no secrets in the environment) are tested
// on any machine, with or without Blender. The real Blender is tested separately, where it is installed.
//
//   node fake-blender.js <mode> <log file or ''> ...the arguments Blender would get...
//     ok        writes the committed normalised fixture as the output, with a report
//     hang      never finishes (the wrapper must stop it)
//     crash     exits 3 without a report
//     refuse    reports { ok: false, code: 'malformed' } and exits 1
//     garbage   reports ok but writes bytes that are not a model
//     oversize  reports ok but writes a model over the shipping budget (the raw fixture: a 4096 px texture)
//     escape    tries to write its output OUTSIDE the job's folder, then reports ok with nothing in it
// With a log file, it records its arguments, its working folder and the NAMES of its environment variables.
const fs = require('fs');
const path = require('path');

const [mode, logFile, ...args] = process.argv.slice(2);
const FIX = path.join(__dirname, '..', 'fixtures', 'three-d');
const jobFile = args[args.indexOf('--') + 1];
if (logFile) fs.appendFileSync(logFile, JSON.stringify({ mode, args, cwd: process.cwd(), env: Object.keys(process.env).sort(), jobFile }) + '\n');
if (mode === 'hang') { setInterval(() => {}, 1000); return; }
if (mode === 'crash') process.exit(3);
const job = JSON.parse(fs.readFileSync(jobFile, 'utf8'));
const report = r => fs.writeFileSync(job.report, JSON.stringify(r));
if (mode === 'refuse') { report({ ok: false, code: 'malformed', reason: 'the model file could not be read (stand-in)' }); process.exit(1); }
const ok = { ok: true, blender: 'stand-in', static: true, applied_transforms: true, scale: 0.0245098, center: [3.2, 18.4, -1.5], origin: 'center', up_axis: job.options.up_axis, triangles_before: 4224, triangles_after: 4224, decimated: false, textures: [], parts: ['Body', 'Cap', 'Label'], animations: [], warnings: [] };
if (mode === 'garbage') { fs.writeFileSync(job.output, Buffer.from('this is not a model at all, whatever its name says')); report(ok); process.exit(0); }
if (mode === 'oversize') { fs.writeFileSync(job.output, fs.readFileSync(path.join(FIX, 'product-raw.glb'))); report(ok); process.exit(0); }
if (mode === 'escape') { try { fs.writeFileSync(path.join(path.dirname(job.output), '..', 'sr-3d-escaped.glb'), 'x'); } catch (e) { /* refused by the OS: fine */ } report(ok); process.exit(0); }
fs.writeFileSync(job.output, fs.readFileSync(path.join(FIX, 'product-normalized.glb'))); report(ok); process.exit(0);
