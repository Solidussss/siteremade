'use strict';
// TRUE 3D — Blender, headless (server only). The one place SiteRemade starts Blender: to turn a model file a provider (or
// an owner) supplied into a model a website can show (scripts/blender/prepare_asset.py: upright, centred, one size, within
// the triangle and texture budget, one GLB).
//
//   detect(opts)             -> { available, path, version, reason }     where Blender is, or exactly why it is not usable
//   prepareAsset(job, opts)  -> { ok: true, glb, report } | { ok: false, code, reason }
//   stageFiles(dir, files)   -> { ok: true, paths } | { ok: false, code, reason }
//
// A MODEL FILE IS UNTRUSTED, and so is its name. The rules, each one tested (test/three-d.test.js):
//   - Blender is started directly (never through a shell) with a FIXED argument list; the only thing that varies is the
//     path of a job file this module wrote itself, inside a temporary folder it made itself. No customer or provider text
//     ever becomes an argument, an option name or a path
//   - every job gets its own temporary folder; the model is written there under a fixed name; nothing else is readable by
//     name from the job, and the folder is removed afterwards whatever happened
//   - only self-contained formats are accepted (FORMATS): a file that can point at other files on the disk -- a .gltf with
//     its side files, an .obj with its material library, an .fbx -- is not handed to Blender, and never a .blend (which can
//     carry scripts). A GLB that points outside itself is refused before Blender sees it (pipeline.js)
//   - the file's size is bounded before it is written; the run is bounded in time, and a run past its time is killed with
//     everything it started
//   - Blender starts with factory settings (no user add-ons, no start-up scripts), with script auto-execution off, offline,
//     and with an environment that carries no SiteRemade secret: it could not leak a provider key if it wanted to
//   - this module uploads nothing anywhere. Blender reads one local file and writes one local file
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');
const TD = require('../creative/three-d');

const SCRIPT = path.join(__dirname, '..', '..', 'scripts', 'blender', 'prepare_asset.py');
// what Blender may be given: one file, complete in itself
const FORMATS = ['.glb', '.stl', '.ply'];
// what a provider's side files may be called (see stageFiles): textures and geometry, by plain name
const SIDE_FILE = /^[A-Za-z0-9][A-Za-z0-9 ._-]{0,100}\.(png|jpe?g|webp|bin|glb|stl|ply)$/i;
const MIN_VERSION = [3, 6];
const DEFAULT_TIMEOUT_MS = 120000;
const UP_AXES = ['Y', 'Z', 'X', '-Y', '-Z', '-X'];
const fail = (code, reason, extra) => Object.assign({ ok: false, code, reason }, extra || {});
const num = (v, lo, hi, d) => (typeof v === 'number' && isFinite(v) ? Math.max(lo, Math.min(hi, v)) : d);

// ---------------------------------------------------------------- where Blender is
const EXE = process.platform === 'win32' ? 'blender.exe' : 'blender';
function candidates(env) {
  const e = env || process.env; const out = [];
  // 1. the operator's own setting (server configuration -- never a request's): an absolute path to the program itself
  if (e.BLENDER_PATH) out.push({ path: String(e.BLENDER_PATH), from: 'BLENDER_PATH' });
  // 2. on the PATH (looked up here, directory by directory: no shell, no `which`)
  String(e.PATH || e.Path || '').split(path.delimiter).filter(Boolean).forEach(dir => out.push({ path: path.join(dir, EXE), from: 'PATH' }));
  // 3. where Blender's own installers put it
  if (process.platform === 'win32') {
    [e.ProgramFiles, e['ProgramFiles(x86)']].filter(Boolean).forEach(pf => {
      const base = path.join(pf, 'Blender Foundation');
      try { fs.readdirSync(base).sort().reverse().forEach(d => out.push({ path: path.join(base, d, EXE), from: 'installed' })); } catch (err) { /* not installed there */ }
    });
  } else if (process.platform === 'darwin') out.push({ path: '/Applications/Blender.app/Contents/MacOS/Blender', from: 'installed' });
  else ['/usr/bin/blender', '/usr/local/bin/blender', '/snap/bin/blender', '/opt/blender/blender'].forEach(p => out.push({ path: p, from: 'installed' }));
  // 4. a portable copy beside the repo's own files (.tools/blender -- ignored by git; see CREATIVE_3D.md)
  out.push({ path: path.join(__dirname, '..', '..', '.tools', 'blender', EXE), from: '.tools' });
  return out;
}
const isFile = p => { try { return fs.statSync(p).isFile(); } catch (e) { return false; } };
// one short run of a program, bounded: -> { code, out } (code null: it did not finish)
function runOnce(file, args, ms) {
  return new Promise(resolve => {
    let out = ''; let done = false; let child;
    const finish = code => { if (done) return; done = true; clearTimeout(timer); resolve({ code, out }); };
    try { child = spawn(file, args, { shell: false, windowsHide: true, stdio: ['ignore', 'pipe', 'ignore'], env: childEnv(os.tmpdir()) }); } catch (e) { resolve({ code: null, out: '' }); return; }
    const timer = setTimeout(() => { killTree(child); finish(null); }, ms);
    child.stdout.on('data', d => { if (out.length < 4000) out += d.toString('utf8'); });
    child.on('error', () => finish(null)); child.on('close', code => finish(code));
  });
}
let cached = null;
// opts: { env, refresh, paths: [the only places to look -- tests: none, to see what a server without Blender says],
// command: { file, args } (tests: a stand-in program in place of Blender) }
async function detect(opts) {
  const o = opts || {};
  if (o.command) return { available: true, path: o.command.file, version: 'stand-in', reason: '' };
  if (cached && !o.refresh && !o.env && !o.paths) return cached;
  const env = o.env || process.env; const list = (Array.isArray(o.paths) ? o.paths.map(p => ({ path: String(p), from: 'given' })) : candidates(env)).filter((c, i, all) => all.findIndex(x => x.path === c.path) === i);
  let result = null; let found = false;
  for (const c of list) {
    if (!path.isAbsolute(c.path) || !isFile(c.path)) continue;
    found = true;
    const r = await runOnce(c.path, ['--background', '--version'], 30000);
    const m = /Blender\s+(\d+)\.(\d+)(?:\.(\d+))?/.exec(r.out || '');
    if (r.code !== 0 || !m) { result = result || { available: false, path: c.path, version: '', reason: `Blender at ${c.from} did not start` }; continue; }
    const v = [Number(m[1]), Number(m[2])];
    if (v[0] < MIN_VERSION[0] || (v[0] === MIN_VERSION[0] && v[1] < MIN_VERSION[1])) { result = { available: false, path: c.path, version: m[0].replace(/^Blender\s+/, ''), reason: `Blender ${v.join('.')} is too old: ${MIN_VERSION.join('.')} or newer is needed` }; continue; }
    result = { available: true, path: c.path, version: `${m[1]}.${m[2]}${m[3] ? '.' + m[3] : ''}`, from: c.from, reason: '' }; break;
  }
  if (!result) result = { available: false, path: '', version: '', reason: found ? 'Blender did not start' : 'Blender is not installed on this server (set BLENDER_PATH to its program, or install it)' };
  if (!o.env && !o.paths) cached = result;
  return result;
}

// ---------------------------------------------------------------- the run
// what Blender's process may see: enough to start, a private scratch and settings folder, and nothing of SiteRemade's
function childEnv(dir) {
  const e = process.env; const out = {};
  ['PATH', 'Path', 'SystemRoot', 'SYSTEMROOT', 'windir', 'ComSpec', 'PATHEXT', 'NUMBER_OF_PROCESSORS', 'PROCESSOR_ARCHITECTURE', 'HOME', 'LANG', 'LC_ALL', 'LD_LIBRARY_PATH', 'DISPLAY'].forEach(k => { if (e[k] !== undefined) out[k] = e[k]; });
  const mine = path.join(dir, 'blender-user');
  Object.assign(out, { TEMP: dir, TMP: dir, TMPDIR: dir, BLENDER_USER_RESOURCES: mine, BLENDER_USER_CONFIG: path.join(mine, 'config'), BLENDER_USER_SCRIPTS: path.join(mine, 'scripts'), PYTHONDONTWRITEBYTECODE: '1' });
  return out;
}
function killTree(child) {
  if (!child || !child.pid) return;
  try {
    if (process.platform === 'win32') spawn('taskkill', ['/pid', String(child.pid), '/T', '/F'], { shell: false, windowsHide: true, stdio: 'ignore' }).on('error', () => {});
    else { try { process.kill(-child.pid, 'SIGKILL'); } catch (e) { child.kill('SIGKILL'); } }
  } catch (e) { /* it is already gone */ }
}
function removeDir(dir) { try { fs.rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 120 }); } catch (e) { /* the OS clears its temp folder */ } }

// A provider's files, written into a job's folder under their own PLAIN names. A name with a folder in it, a drive, a
// leading dot, anything outside the short list of model and texture types, or one that would land outside the folder is
// refused -- the whole set is, and nothing is written. files: [{ name, bytes }]
function stageFiles(dir, files) {
  const root = path.resolve(dir); const out = []; const seen = new Set(); let total = 0;
  for (const f of Array.isArray(files) ? files : []) {
    const name = f && typeof f.name === 'string' ? f.name : '';
    if (!name || name.length > 120 || /[\\/:\u0000-\u001f]/.test(name) || name.includes('..') || !SIDE_FILE.test(name)) return fail('unsafe_path', 'a provider file has a name that is not allowed');
    if (!Buffer.isBuffer(f.bytes)) return fail('malformed', 'a provider file has no content');
    const dest = path.resolve(root, name);
    if (path.dirname(dest) !== root || seen.has(name.toLowerCase())) return fail('unsafe_path', 'a provider file has a name that is not allowed');
    total += f.bytes.length; if (total > TD.LIMITS.inputBytes) return fail('too_large', 'the provider files are too large');
    seen.add(name.toLowerCase()); out.push({ name, dest, bytes: f.bytes });
  }
  out.forEach(f => fs.writeFileSync(f.dest, f.bytes, { flag: 'wx' }));
  return { ok: true, paths: out.map(f => f.dest) };
}

// The bounded choices Blender is given (every one an enum or a clamped number; unknown keys are dropped)
function cleanOptions(raw) {
  const o = raw && typeof raw === 'object' ? raw : {};
  return {
    target_size: num(o.targetSize, 0.05, 100, 1), max_triangles: Math.round(num(o.maxTriangles, 100, 5000000, TD.LIMITS.trianglesTarget)), max_texture: Math.round(num(o.maxTexture, 64, 8192, TD.LIMITS.textureSize)),
    origin: o.origin === 'base' ? 'base' : 'center', up_axis: UP_AXES.includes(o.upAxis) ? o.upAxis : 'Y', yaw_deg: num(o.yawDeg, -360, 360, 0), apply_transforms: o.applyTransforms !== false,
  };
}

// job: { bytes: Buffer (the model file), ext: '.glb', options: { targetSize, maxTriangles, maxTexture, origin, upAxis,
// yawDeg, applyTransforms } }; opts: { timeoutMs, env, tmpRoot (where the job's own folder is made: the system's temporary
// folder unless the server says otherwise), command (tests: a stand-in program) }
async function prepareAsset(job, opts) {
  const j = job || {}; const o = opts || {};
  const ext = String(j.ext || '').toLowerCase();
  if (!FORMATS.includes(ext)) return fail('unsupported_format', 'this kind of model file is not accepted');
  if (!Buffer.isBuffer(j.bytes) || !j.bytes.length) return fail('malformed', 'the model file is empty');
  if (j.bytes.length > TD.LIMITS.inputBytes) return fail('too_large', `the model file is larger than ${Math.round(TD.LIMITS.inputBytes / 1048576)} MB`);
  const found = await detect(o);
  if (!found.available) return fail('blender_unavailable', found.reason);
  const timeoutMs = num(o.timeoutMs, 1000, 30 * 60 * 1000, DEFAULT_TIMEOUT_MS);
  let dir = '';
  try { dir = fs.mkdtempSync(path.join(o.tmpRoot || os.tmpdir(), 'sr-3d-')); } catch (e) { return fail('no_workspace', 'a temporary folder could not be made'); }
  try {
    const input = path.join(dir, `input${ext}`); const output = path.join(dir, 'output.glb'); const report = path.join(dir, 'report.json'); const jobFile = path.join(dir, 'job.json');
    fs.writeFileSync(input, j.bytes, { flag: 'wx' });
    fs.writeFileSync(jobFile, JSON.stringify({ input, output, report, options: cleanOptions(j.options) }), { flag: 'wx' });
    // the whole command: fixed words, one path this function made. (A stand-in program, in tests, gets the same words.)
    const base = ['--background', '--factory-startup', '--disable-autoexec', '-noaudio', '--python-exit-code', '1'];
    const modern = /^(\d+)\.(\d+)/.exec(found.version); if (modern && (Number(modern[1]) > 4 || (Number(modern[1]) === 4 && Number(modern[2]) >= 2))) base.push('--offline-mode');
    const args = (o.command ? o.command.args || [] : []).concat(base, ['--python', SCRIPT, '--', jobFile]);
    const file = o.command ? o.command.file : found.path;
    const ran = await new Promise(resolve => {
      let tail = ''; let done = false; let child;
      const finish = r => { if (done) return; done = true; clearTimeout(timer); resolve(r); };
      try { child = spawn(file, args, { cwd: dir, shell: false, windowsHide: true, detached: process.platform !== 'win32', stdio: ['ignore', 'pipe', 'pipe'], env: childEnv(dir) }); }
      catch (e) { resolve({ code: null, error: 'start' }); return; }
      const timer = setTimeout(() => { killTree(child); finish({ code: null, error: 'timeout', tail }); }, timeoutMs);
      const keep = d => { tail = (tail + d.toString('utf8')).slice(-4000); };
      child.stdout.on('data', keep); child.stderr.on('data', keep);
      child.on('error', () => finish({ code: null, error: 'start', tail })); child.on('close', code => finish({ code, tail }));
    });
    if (ran.error === 'timeout') return fail('timeout', `Blender did not finish within ${Math.round(timeoutMs / 1000)} seconds`);
    if (ran.error === 'start') return fail('blender_unavailable', 'Blender could not be started');
    let rep = null;
    try { const st = fs.statSync(report); if (st.isFile() && st.size < 1024 * 1024) rep = JSON.parse(fs.readFileSync(report, 'utf8')); } catch (e) { rep = null; }
    if (rep && rep.ok === false) return fail(/^[a-z_]{2,40}$/.test(rep.code || '') ? rep.code : 'blender_failed', String(rep.reason || 'Blender could not process the model').slice(0, 240));
    if (ran.code !== 0 || !rep || rep.ok !== true) return fail('blender_failed', 'Blender stopped without finishing the model', { exitCode: ran.code });
    let glb = null;
    try { const st = fs.statSync(output); if (st.isFile() && st.size > 0 && st.size <= TD.LIMITS.inputBytes) glb = fs.readFileSync(output); } catch (e) { glb = null; }
    if (!glb) return fail('blender_failed', 'Blender wrote no usable model');
    return { ok: true, glb, report: rep, blender: found.version };
  } catch (e) {
    return fail('blender_failed', 'the model could not be processed');
  } finally { removeDir(dir); }
}

module.exports = { detect, prepareAsset, stageFiles, cleanOptions, candidates, childEnv, FORMATS, SCRIPT, MIN_VERSION, DEFAULT_TIMEOUT_MS };
