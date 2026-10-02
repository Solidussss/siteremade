'use strict';
// Builds the ONE 3D engine every SiteRemade page with a 3D scene uses: lib/three-d/runtime-src.js + three.js + its glTF
// loader -> vendor/three-d/sr3d.min.js (a classic script: window.SiteRemade3D), with vendor/three-d/manifest.json beside
// it (its size, its hash, the three.js version, and the hash of the sources it was built from -- so a test can tell a
// stale build without three.js installed). The built file is committed: the server and the export only ever copy it.
// three and esbuild are development dependencies, needed to run this script and nothing else.
//
//   node scripts/build-three-d-runtime.js          write vendor/three-d/
//   node scripts/build-three-d-runtime.js --check  exit 1 if the committed build does not match its sources
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const crypto = require('crypto');

const ROOT = path.join(__dirname, '..');
const OUT_DIR = path.join(ROOT, 'vendor', 'three-d');
const OUT = path.join(OUT_DIR, 'sr3d.min.js');
const MANIFEST = path.join(OUT_DIR, 'manifest.json');
const SOURCES = ['lib/three-d/runtime-src.js', 'lib/creative/three-d-pose.js'];
const sha = buf => crypto.createHash('sha256').update(buf).digest('hex');
// (line endings never change the hash: the same sources on Windows and on Linux are the same build)
const sourceHash = () => sha(SOURCES.map(f => fs.readFileSync(path.join(ROOT, f), 'utf8').replace(/\r\n/g, '\n')).join('\n--\n'));

if (process.argv.includes('--check')) {
  const m = fs.existsSync(MANIFEST) ? JSON.parse(fs.readFileSync(MANIFEST, 'utf8')) : null;
  const ok = m && fs.existsSync(OUT) && m.sourceSha256 === sourceHash() && m.sha256 === sha(fs.readFileSync(OUT));
  if (!ok) { console.error('vendor/three-d/sr3d.min.js is stale: run node scripts/build-three-d-runtime.js'); process.exit(1); }
  console.log('vendor/three-d/sr3d.min.js is up to date'); process.exit(0);
}

let esbuild; let threeVersion;
const THREE_DIR = path.join(ROOT, 'node_modules', 'three');
try { esbuild = require('esbuild'); threeVersion = JSON.parse(fs.readFileSync(path.join(THREE_DIR, 'package.json'), 'utf8')).version; }
catch (e) { console.error('This build needs the development dependencies: npm install (three, esbuild).'); process.exit(1); }

// three.js is MIT-licensed: its notice travels with every copy of the engine (the banner, and LICENSE-three.txt beside it)
const banner = `/*! SiteRemade 3D engine. Includes three.js r${threeVersion.split('.')[1]} -- MIT License, (c) three.js authors; see LICENSE-three.txt. */`;
const res = esbuild.buildSync({
  entryPoints: [path.join(ROOT, 'lib', 'three-d', 'runtime-src.js')], bundle: true, format: 'iife', globalName: 'SiteRemade3D', minify: true, target: ['es2020'],
  legalComments: 'none', banner: { js: banner }, write: false, logLevel: 'warning', charset: 'utf8',
});
const code = Buffer.from(res.outputFiles[0].contents);
fs.mkdirSync(OUT_DIR, { recursive: true });
fs.writeFileSync(OUT, code);
fs.writeFileSync(path.join(OUT_DIR, 'LICENSE-three.txt'), fs.readFileSync(path.join(THREE_DIR, 'LICENSE'), 'utf8').replace(/\r\n/g, '\n'));
const manifest = { engine: 'sr3d', file: 'sr3d.min.js', three: threeVersion, bytes: code.length, gzipBytes: zlib.gzipSync(code, { level: 9 }).length, sha256: sha(code), sourceSha256: sourceHash(), sources: SOURCES };
fs.writeFileSync(MANIFEST, JSON.stringify(manifest, null, 2) + '\n');
console.log(`wrote vendor/three-d/sr3d.min.js (${code.length} bytes, ${manifest.gzipBytes} gzipped, three ${threeVersion})`);
