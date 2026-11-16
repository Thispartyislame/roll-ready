// Minimal ZIP writer and reader for backups (no dependencies). One file is in memory at a time.
// Limits: classic ZIP only, so each file and the whole archive must stay under 4 GB.
const fs = require('node:fs');
const zlib = require('node:zlib');

const TABLE = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
function crc32(buf) { let c = 0xffffffff; for (let i = 0; i < buf.length; i++) c = TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; }
const MAX = 0xffffffff;
const tooBig = () => new Error('This backup would be larger than 4 GB, which is more than a single backup file can hold. Remove some large soundboard videos or recordings, or copy the data folder by hand.');

// entries: [{ name, file, compress }]
function writeZip(out, entries) {
  if (entries.length > 65000) throw new Error('Too many files for one backup.');
  const fd = fs.openSync(out, 'w');
  const central = []; let offset = 0;
  const now = new Date();
  const time = (now.getHours() << 11) | (now.getMinutes() << 5) | (now.getSeconds() >> 1);
  const date = ((now.getFullYear() - 1980) << 9) | ((now.getMonth() + 1) << 5) | now.getDate();
  try {
    for (const e of entries) {
      const data = fs.readFileSync(e.file);
      if (data.length >= MAX) throw tooBig();
      const body = e.compress ? zlib.deflateRawSync(data) : data;
      const name = Buffer.from(e.name, 'utf8');
      const head = Buffer.alloc(30);
      head.writeUInt32LE(0x04034b50, 0); head.writeUInt16LE(20, 4); head.writeUInt16LE(0x0800, 6); head.writeUInt16LE(e.compress ? 8 : 0, 8);
      head.writeUInt16LE(time, 10); head.writeUInt16LE(date, 12); head.writeUInt32LE(crc32(data), 14);
      head.writeUInt32LE(body.length, 18); head.writeUInt32LE(data.length, 22); head.writeUInt16LE(name.length, 26);
      central.push({ head, name, offset });
      for (const part of [head, name, body]) fs.writeSync(fd, part);
      offset += 30 + name.length + body.length;
      if (offset >= MAX) throw tooBig();
    }
    let size = 0;
    for (const c of central) {
      const rec = Buffer.alloc(46);
      rec.writeUInt32LE(0x02014b50, 0); rec.writeUInt16LE(20, 4);
      c.head.copy(rec, 6, 4, 30);                     // version needed … extra length, same layout as the local header
      rec.writeUInt32LE(c.offset, 42);
      fs.writeSync(fd, rec); fs.writeSync(fd, c.name); size += 46 + c.name.length;
    }
    const end = Buffer.alloc(22);
    end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(central.length, 8); end.writeUInt16LE(central.length, 10);
    end.writeUInt32LE(size, 12); end.writeUInt32LE(offset, 16);
    fs.writeSync(fd, end);
  } catch (err) { fs.closeSync(fd); fs.rmSync(out, { force: true }); throw err; }
  fs.closeSync(fd);
  return { files: central.length, bytes: fs.statSync(out).size };
}

// Returns { names, extract(name, destFile) }. Throws if the file isn't a ZIP this module can read.
function openZip(file) {
  const fd = fs.openSync(file, 'r');
  const size = fs.fstatSync(fd).size;
  const read = (pos, len) => { const b = Buffer.alloc(len); fs.readSync(fd, b, 0, len, pos); return b; };
  const tailLen = Math.min(size, 65557); const tail = read(size - tailLen, tailLen);
  let at = -1; for (let i = tail.length - 22; i >= 0; i--) if (tail.readUInt32LE(i) === 0x06054b50) { at = i; break; }
  if (at < 0) { fs.closeSync(fd); throw new Error('That file isn\'t a Roll Ready backup.'); }
  const count = tail.readUInt16LE(at + 10); const cdSize = tail.readUInt32LE(at + 12); const cdOffset = tail.readUInt32LE(at + 16);
  const cd = read(cdOffset, cdSize); const entries = new Map();
  for (let p = 0, n = 0; n < count; n++) {
    if (cd.readUInt32LE(p) !== 0x02014b50) break;
    const nlen = cd.readUInt16LE(p + 28), elen = cd.readUInt16LE(p + 30), clen = cd.readUInt16LE(p + 32);
    entries.set(cd.toString('utf8', p + 46, p + 46 + nlen), { method: cd.readUInt16LE(p + 10), crc: cd.readUInt32LE(p + 16), csize: cd.readUInt32LE(p + 20), offset: cd.readUInt32LE(p + 42) });
    p += 46 + nlen + elen + clen;
  }
  return {
    names: [...entries.keys()],
    extract(name, dest) {
      const e = entries.get(name); if (!e) throw new Error('Missing from the backup: ' + name);
      const local = read(e.offset, 30);
      const body = read(e.offset + 30 + local.readUInt16LE(26) + local.readUInt16LE(28), e.csize);
      const data = e.method === 8 ? zlib.inflateRawSync(body) : body;
      if (crc32(data) !== e.crc) throw new Error('The backup file is damaged (' + name + ').');
      fs.writeFileSync(dest, data);
    },
    close() { fs.closeSync(fd); },
  };
}

module.exports = { writeZip, openZip };
