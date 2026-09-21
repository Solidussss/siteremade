// V8.7: the 'local' AssetStore implementation -- extracted, unchanged in
// behavior, from what used to be lib/project-store.js's own
// ensureAssetStoreDir/internalizeOneEntry/hydrateOneEntry filesystem code.
// Pure byte storage, content-addressed by sha256: `put` writes a file named
// after the hash of its own bytes (so identical bytes always land at the
// same path -- real dedup, not merely "don't double insert"), `get` reads
// it back. Content-TYPE metadata (e.g. "image/png") is deliberately NOT
// tracked here -- it already lives in the DatabaseAdapter's `asset_blobs`
// table (lib/project-store.js supplies it there, extracted from the
// original data: URL) -- keeping exactly one source of truth for it rather
// than duplicating it into a second, filesystem-side metadata scheme.
//
// The export compiler (lib/export-compiler.js) and lib/project-store.js
// both go through this store rather than touching `fs`/a hard-coded
// directory constant directly -- that's what makes it possible to swap in
// a real object-storage-backed store later without either of those files
// changing.
'use strict';
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

function defaultDir() {
  return process.env.SITEREMADE_ASSET_STORE_DIR || path.join(__dirname, '..', '..', 'data', 'asset-store');
}

function createLocalAssetStore(dir) {
  const storeDir = dir || defaultDir();
  function ensureDir() { fs.mkdirSync(storeDir, { recursive: true }); }
  function filePath(hash) { return path.join(storeDir, hash); }

  return {
    kind: 'local',
    dir: storeDir,
    // Writes `buffer` under its own sha256 hash (a no-op if that hash is
    // already present -- the whole point of content addressing) and
    // returns {hash, byteLength} so the caller (lib/project-store.js) can
    // record contentType/byteLength in the DatabaseAdapter's asset_blobs
    // table itself.
    put(buffer) {
      ensureDir();
      const hash = crypto.createHash('sha256').update(buffer).digest('hex');
      const dest = filePath(hash);
      if (!fs.existsSync(dest)) fs.writeFileSync(dest, buffer);
      return { hash, byteLength: buffer.length };
    },
    get(hash) {
      try { return fs.readFileSync(filePath(hash)); } catch (e) { return null; }
    },
    exists(hash) {
      return fs.existsSync(filePath(hash));
    },
    delete(hash) {
      try { fs.unlinkSync(filePath(hash)); return true; } catch (e) { return false; }
    },
    // Pure filesystem metadata (byteLength via stat) -- content-type is
    // intentionally not duplicated here, see this file's header.
    stat(hash) {
      try { const s = fs.statSync(filePath(hash)); return { byteLength: s.size }; } catch (e) { return null; }
    },
  };
}

let singleton = null;
let singletonDir = null;
function getInstance() {
  const dir = defaultDir();
  if (singleton && singletonDir === dir) return singleton;
  singleton = createLocalAssetStore(dir);
  singletonDir = dir;
  return singleton;
}

module.exports = { createLocalAssetStore, getInstance };
