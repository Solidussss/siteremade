// The purchased-website ZIP (the ownership handoff). Built in Node itself -- zlib's raw DEFLATE and CRC-32 plus the
// ZIP container format written here -- with NO system `zip` binary, no shell and no platform-specific tool, so the
// exact same code produces the exact same archive on Windows development machines and on Railway's Linux images.
//
// (It used to shell out to `zip`: the image this was first written on happened to have /usr/bin/zip, Railway's
// Node images do not, so every production export failed with `spawnSync zip ENOENT` -- the 500 behind the Client App's
// "The website files could not be prepared".)
//
// Format: a standard PKZIP archive (APPNOTE 6.3.x) -- local file headers, file data (DEFLATE, or STORED when
// compression would not help), a central directory and the end-of-central-directory record. UTF-8 names (general
// purpose bit 11). Every entry carries the same fixed timestamp (1980-01-01 00:00), so the same files always produce
// byte-identical archives. The limits below keep every size well inside the classic (non-ZIP64) format.
'use strict';
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

// Every path this module ever writes into an archive is one THIS repo's own export compiler generated (page
// filenames are sanitized slugs, asset filenames are sha256 hex -- see lib/site-render.js's pageFileName and
// lib/export-compiler.js's hydrateAssetsForExport), never a raw path taken from project content. This walk is still a
// real defense-in-depth check: it refuses to archive anything (a) outside `srcDir`, (b) containing a `..` segment, or
// (c) an absolute path -- so even a future bug upstream that let a hostile filename through would be caught here,
// not silently archived (spec §28: "prevent path traversal... into archive entries").
function listFilesSafely(srcDir) {
  const out = [];
  const absRoot = path.resolve(srcDir);
  function walk(dir) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      const rel = path.relative(absRoot, full);
      if (rel.split(path.sep).includes('..') || path.isAbsolute(rel)) {
        throw new Error(`Refusing to archive path outside export root: ${rel}`);
      }
      if (entry.isDirectory()) walk(full);
      else if (entry.isFile()) out.push(rel);
    }
  }
  walk(absRoot);
  return out;
}

const MAX_ARCHIVE_FILES = 400; // generous vs. a real export's file count (6 pages + ~40 assets + a handful of chrome files); bounds a runaway package (spec §28)
const MAX_ARCHIVE_TOTAL_BYTES = 60 * 1024 * 1024; // 60MB -- generous for images this app itself caps at 8MB each (MAX_DATA_URL_BYTES), still bounded

// CRC-32 (IEEE): zlib.crc32 on Node >= 22.2 (package.json requires >= 22.13), with a table fallback.
const CRC_TABLE = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
function crc32(buf) {
  if (typeof zlib.crc32 === 'function') return zlib.crc32(buf) >>> 0;
  let c = 0xffffffff; for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
const DOS_TIME = 0; // 00:00:00
const DOS_DATE = (0 << 9) | (1 << 5) | 1; // 1980-01-01
const UTF8_FLAG = 0x0800;

// entries: [{ name: 'assets/x.png' (forward slashes), data: Buffer }] -> Buffer (a complete .zip)
function buildZip(entries) {
  const locals = []; const centrals = []; let offset = 0;
  for (const e of entries) {
    const name = Buffer.from(String(e.name).replace(/\\/g, '/'), 'utf8');
    const data = Buffer.isBuffer(e.data) ? e.data : Buffer.from(e.data);
    const crc = crc32(data);
    const deflated = zlib.deflateRawSync(data, { level: 9 });
    const stored = deflated.length >= data.length; // already-compressed images are kept as they are
    const body = stored ? data : deflated; const method = stored ? 0 : 8;
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0); local.writeUInt16LE(20, 4); local.writeUInt16LE(UTF8_FLAG, 6); local.writeUInt16LE(method, 8);
    local.writeUInt16LE(DOS_TIME, 10); local.writeUInt16LE(DOS_DATE, 12); local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(body.length, 18); local.writeUInt32LE(data.length, 22); local.writeUInt16LE(name.length, 26); local.writeUInt16LE(0, 28);
    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0); central.writeUInt16LE(20, 4); central.writeUInt16LE(20, 6); central.writeUInt16LE(UTF8_FLAG, 8); central.writeUInt16LE(method, 10);
    central.writeUInt16LE(DOS_TIME, 12); central.writeUInt16LE(DOS_DATE, 14); central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(body.length, 20); central.writeUInt32LE(data.length, 24); central.writeUInt16LE(name.length, 28);
    central.writeUInt16LE(0, 30); central.writeUInt16LE(0, 32); central.writeUInt16LE(0, 34); central.writeUInt16LE(0, 36);
    central.writeUInt32LE(0, 38); central.writeUInt32LE(offset, 42);
    locals.push(local, name, body); centrals.push(central, name);
    offset += local.length + name.length + body.length;
  }
  const cd = Buffer.concat(centrals);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(0, 4); end.writeUInt16LE(0, 6);
  end.writeUInt16LE(entries.length, 8); end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(cd.length, 12); end.writeUInt32LE(offset, 16); end.writeUInt16LE(0, 20);
  return Buffer.concat(locals.concat([cd, end]));
}

// Zips every file under `srcDir` into `destZipPath`, with archive entry paths relative to `srcDir` (so extracting the
// zip lands the site files directly, not nested under a container-path prefix). Sorted, deterministic, bounded. The
// archive is written to a temporary file and renamed into place, so a reader never sees a half-written ZIP.
function zipDirectory(srcDir, destZipPath) {
  const absRoot = path.resolve(srcDir);
  const files = listFilesSafely(absRoot).sort(); // sorted -- stable archive member order, see export reproducibility (§12)
  if (!files.length) throw new Error('Nothing to archive.');
  if (files.length > MAX_ARCHIVE_FILES) throw new Error(`Export package has too many files (${files.length} > ${MAX_ARCHIVE_FILES}).`);
  let totalBytes = 0;
  for (const f of files) totalBytes += fs.statSync(path.join(absRoot, f)).size;
  if (totalBytes > MAX_ARCHIVE_TOTAL_BYTES) throw new Error(`Export package is too large (${totalBytes} bytes > ${MAX_ARCHIVE_TOTAL_BYTES}).`);
  const zip = buildZip(files.map(f => ({ name: f.split(path.sep).join('/'), data: fs.readFileSync(path.join(absRoot, f)) })));
  fs.mkdirSync(path.dirname(destZipPath), { recursive: true });
  const tmp = `${destZipPath}.${process.pid}.${Date.now()}.tmp`;
  fs.writeFileSync(tmp, zip);
  fs.renameSync(tmp, destZipPath);
  return { path: destZipPath, fileCount: files.length, totalBytes, zipBytes: fs.statSync(destZipPath).size, files: files.map(f => f.split(path.sep).join('/')) };
}

module.exports = { zipDirectory, buildZip, crc32, listFilesSafely, MAX_ARCHIVE_FILES, MAX_ARCHIVE_TOTAL_BYTES };
