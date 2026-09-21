// V8.6: real downloadable export artifact (spec §18). This sandbox has no
// npm access (no `archiver`/`jszip`), but `zip` IS present as a system
// binary (confirmed via `which zip` -- /usr/bin/zip on this image), so a
// real, standard .zip is built by invoking it directly with execFile --
// fixed argv array, never a shell string, so nothing from a filename can
// ever be interpreted as a shell command (spec §28: "never concatenate
// user content into a shell command"). No custom/hand-rolled archive
// format is needed.
'use strict';
const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');

// Every path this module ever writes into an archive is one THIS repo's
// own export compiler generated (page filenames are sanitized slugs, asset
// filenames are sha256 hex -- see lib/site-render.js's pageFileName and
// lib/export-compiler.js's hydrateAssetsForExport), never a raw path taken
// from project content. This walk is still a real defense-in-depth check:
// it refuses to archive anything (a) outside `srcDir`, (b) containing a
// `..` segment, or (c) an absolute path -- so even a future bug upstream
// that let a hostile filename through would be caught here, not silently
// archived (spec §28: "prevent path traversal... into archive entries").
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

// Zips every file under `srcDir` into `destZipPath`, with archive entry
// paths relative to `srcDir` (so extracting the zip lands the site files
// directly, not nested under a container-path prefix). Deterministic and
// safe: `zip` is invoked with a fixed, hand-built argv array and `cwd:
// srcDir`, never a shell, never string-interpolated user content.
function zipDirectory(srcDir, destZipPath) {
  const absRoot = path.resolve(srcDir);
  const files = listFilesSafely(absRoot).sort(); // sorted -- stable archive member order, see export reproducibility (§12)
  if (!files.length) throw new Error('Nothing to archive.');
  if (files.length > MAX_ARCHIVE_FILES) throw new Error(`Export package has too many files (${files.length} > ${MAX_ARCHIVE_FILES}).`);
  let totalBytes = 0;
  for (const f of files) totalBytes += fs.statSync(path.join(absRoot, f)).size;
  if (totalBytes > MAX_ARCHIVE_TOTAL_BYTES) throw new Error(`Export package is too large (${totalBytes} bytes > ${MAX_ARCHIVE_TOTAL_BYTES}).`);
  fs.mkdirSync(path.dirname(destZipPath), { recursive: true });
  try { fs.unlinkSync(destZipPath); } catch (e) { /* fine if it didn't exist yet */ }
  // -X: no extra file attributes (more reproducible byte output across
  // runs); fixed flags, fixed dest, fixed file list -- no shell, no glob
  // expansion of anything project-supplied.
  execFileSync('zip', ['-X', '-q', destZipPath, ...files], { cwd: absRoot });
  return { path: destZipPath, fileCount: files.length, totalBytes: fs.statSync(destZipPath).size };
}

module.exports = { zipDirectory, listFilesSafely, MAX_ARCHIVE_FILES, MAX_ARCHIVE_TOTAL_BYTES };
