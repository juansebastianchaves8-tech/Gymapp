// One-off icon generator: writes flat-color PNG icons with a simple
// dumbbell glyph, no external deps (zlib only). Run with `node scripts/gen-icons.js`.
const zlib = require('zlib');
const fs = require('fs');
const path = require('path');

const BG = [10, 15, 20]; // near-black background matching app dark theme
const FG = [0, 200, 140]; // accent green

function crc32(buf) {
  let c;
  const table = crc32.table || (crc32.table = (() => {
    const t = [];
    for (let n = 0; n < 256; n++) {
      c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
      t[n] = c;
    }
    return t;
  })());
  let crc = 0xffffffff;
  for (let i = 0; i < buf.length; i++) crc = table[(crc ^ buf[i]) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const typeBuf = Buffer.from(type, 'ascii');
  const lenBuf = Buffer.alloc(4);
  lenBuf.writeUInt32BE(data.length, 0);
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
  return Buffer.concat([lenBuf, typeBuf, data, crcBuf]);
}

function drawDumbbell(size, px) {
  const cx = size / 2, cy = size / 2;
  const barHalfLen = size * 0.30;
  const barHalfW = size * 0.045;
  const plateR = size * 0.16;
  const plateOffset = barHalfLen * 0.78;

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = x - cx, dy = y - cy;
      let on = false;
      // bar
      if (Math.abs(dx) <= barHalfLen && Math.abs(dy) <= barHalfW) on = true;
      // two plates (circles) at each end
      const dLeft = Math.hypot(dx + plateOffset, dy);
      const dRight = Math.hypot(dx - plateOffset, dy);
      if (dLeft <= plateR || dRight <= plateR) on = true;
      const idx = (y * size + x) * 3;
      if (on) {
        px[idx] = FG[0]; px[idx + 1] = FG[1]; px[idx + 2] = FG[2];
      } else {
        px[idx] = BG[0]; px[idx + 1] = BG[1]; px[idx + 2] = BG[2];
      }
    }
  }
}

function makePNG(size) {
  const px = Buffer.alloc(size * size * 3);
  drawDumbbell(size, px);

  const raw = Buffer.alloc((size * 3 + 1) * size);
  for (let y = 0; y < size; y++) {
    raw[y * (size * 3 + 1)] = 0; // filter type 0
    px.copy(raw, y * (size * 3 + 1) + 1, y * size * 3, (y + 1) * size * 3);
  }

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // color type RGB
  ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;

  const idat = zlib.deflateSync(raw);

  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  return Buffer.concat([
    signature,
    chunk('IHDR', ihdr),
    chunk('IDAT', idat),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

const outDir = path.join(__dirname, '..', 'icons');
if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

for (const size of [180, 192, 512]) {
  const buf = makePNG(size);
  fs.writeFileSync(path.join(outDir, `icon-${size}.png`), buf);
  console.log(`wrote icon-${size}.png (${buf.length} bytes)`);
}
