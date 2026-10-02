'use strict';
// Reads a ZIP the way a customer's computer would: the archive's own central directory, each entry inflated and its
// CRC-32 checked. Enough for the archives lib/archive.js writes (stored or deflated entries, no ZIP64, no encryption).
// Used to prove what a purchased-website ZIP really contains -- from the ZIP itself, not from the folder it was made of.
//
//   readZip(buffer) -> [{ name, data }]        extractZip(buffer, dir) -> [names]
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const { crc32 } = require('../../lib/archive');

function readZip(buf) {
  let eocd = -1; for (let i = buf.length - 22; i >= Math.max(0, buf.length - 65557); i--) if (buf.readUInt32LE(i) === 0x06054b50) { eocd = i; break; }
  if (eocd < 0) throw new Error('not a ZIP archive');
  const count = buf.readUInt16LE(eocd + 10); let off = buf.readUInt32LE(eocd + 16); const out = [];
  for (let n = 0; n < count; n++) {
    if (buf.readUInt32LE(off) !== 0x02014b50) throw new Error('bad central directory');
    const method = buf.readUInt16LE(off + 10), crc = buf.readUInt32LE(off + 16), csize = buf.readUInt32LE(off + 20), usize = buf.readUInt32LE(off + 24);
    const nlen = buf.readUInt16LE(off + 28), xlen = buf.readUInt16LE(off + 30), clen = buf.readUInt16LE(off + 32), local = buf.readUInt32LE(off + 42);
    const name = buf.toString('utf8', off + 46, off + 46 + nlen);
    const start = local + 30 + buf.readUInt16LE(local + 26) + buf.readUInt16LE(local + 28); const body = buf.subarray(start, start + csize);
    const data = method === 0 ? Buffer.from(body) : method === 8 ? zlib.inflateRawSync(body) : null;
    if (!data) throw new Error(`unsupported compression in ${name}`);
    if (data.length !== usize || crc32(data) !== crc) throw new Error(`corrupt entry ${name}`);
    out.push({ name, data }); off += 46 + nlen + xlen + clen;
  }
  return out;
}
function extractZip(buf, dir) {
  const root = path.resolve(dir);
  return readZip(buf).map(e => {
    const dest = path.resolve(root, e.name);
    if (dest !== root && !dest.startsWith(root + path.sep)) throw new Error(`entry outside the folder: ${e.name}`);
    fs.mkdirSync(path.dirname(dest), { recursive: true }); fs.writeFileSync(dest, e.data); return e.name;
  });
}

module.exports = { readZip, extractZip };
