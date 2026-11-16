// Draws build/icon.png (512×512) with no dependencies: the app's favicon (assets/icon.svg) — a
// rounded teal square with a white "ML" — rasterized with signed distances and 4×4 supersampling.
// electron-builder turns the PNG into the Windows .ico. Run: node scripts/make-icon.mjs
import { mkdirSync, writeFileSync } from 'node:fs';
import { deflateSync } from 'node:zlib';

const SIZE = 512;
const SAMPLES = 4;
const TEAL = [0x0d, 0x94, 0x88];
const RADIUS = SIZE * (14 / 64); // same corner ratio as the SVG
const STROKE = 44;

// Letters as stroked segments with round caps. M: x 110–256, L: x 292–400; both y 150–362.
const SEGMENTS = [
  [118, 362, 118, 150], // M left stem
  [118, 150, 190, 290], // M left diagonal
  [190, 290, 262, 150], // M right diagonal
  [262, 150, 262, 362], // M right stem
  [330, 150, 330, 362], // L stem
  [330, 362, 410, 362], // L foot
];

function distanceToSegment(px, py, [x1, y1, x2, y2]) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const t = Math.max(0, Math.min(1, ((px - x1) * dx + (py - y1) * dy) / (dx * dx + dy * dy)));
  return Math.hypot(px - (x1 + t * dx), py - (y1 + t * dy));
}

function insideSquare(x, y) {
  const cx = Math.min(Math.max(x, RADIUS), SIZE - RADIUS);
  const cy = Math.min(Math.max(y, RADIUS), SIZE - RADIUS);
  return Math.hypot(x - cx, y - cy) <= RADIUS;
}

const isLetter = (x, y) => SEGMENTS.some((s) => distanceToSegment(x, y, s) <= STROKE / 2);

const raw = Buffer.alloc((SIZE * 4 + 1) * SIZE);
for (let y = 0; y < SIZE; y += 1) {
  raw[y * (SIZE * 4 + 1)] = 0; // filter: none
  for (let x = 0; x < SIZE; x += 1) {
    let coverage = 0;
    let letter = 0;
    for (let sy = 0; sy < SAMPLES; sy += 1) {
      for (let sx = 0; sx < SAMPLES; sx += 1) {
        const px = x + (sx + 0.5) / SAMPLES;
        const py = y + (sy + 0.5) / SAMPLES;
        if (!insideSquare(px, py)) continue;
        coverage += 1;
        if (isLetter(px, py)) letter += 1;
      }
    }
    const total = SAMPLES * SAMPLES;
    const white = coverage === 0 ? 0 : letter / coverage;
    const offset = y * (SIZE * 4 + 1) + 1 + x * 4;
    for (let c = 0; c < 3; c += 1)
      raw[offset + c] = Math.round(TEAL[c] * (1 - white) + 255 * white);
    raw[offset + 3] = Math.round((coverage / total) * 255);
  }
}

const crcTable = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
function crc32(buffer) {
  let c = 0xffffffff;
  for (const byte of buffer) c = crcTable[(c ^ byte) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const out = Buffer.alloc(body.length + 8);
  out.writeUInt32BE(data.length, 0);
  body.copy(out, 4);
  out.writeUInt32BE(crc32(body), body.length + 4);
  return out;
}

const header = Buffer.alloc(13);
header.writeUInt32BE(SIZE, 0);
header.writeUInt32BE(SIZE, 4);
header[8] = 8; // bit depth
header[9] = 6; // RGBA
const png = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  chunk('IHDR', header),
  chunk('IDAT', deflateSync(raw, { level: 9 })),
  chunk('IEND', Buffer.alloc(0)),
]);

mkdirSync('build', { recursive: true });
writeFileSync('build/icon.png', png);
console.log(`build/icon.png (${png.length} bytes)`);
