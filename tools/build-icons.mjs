// Generates the PWA icon set with ZERO new dependencies — a minimal PNG
// encoder using only Node's built-in zlib, matching the app's own "zero
// runtime dependencies" rule (plan.md L1) extended to its dev tooling.
// Icon design mirrors the app's own header "mark": a filled circle in the
// Atlas visited colour with a soft halo, on the Atlas water colour — so the
// home-screen icon is recognizably the same object as the little dot the
// app already shows next to its name, not a separately-invented logo.
import fs from "node:fs";
import zlib from "node:zlib";

const WATER = [0x7c, 0x99, 0xb4];   // Atlas --water
const VISITED = [0x9c, 0x38, 0x26]; // Atlas --visited
const HALO = [0xb8, 0x7a, 0x6c];    // a blend toward --water, for the halo ring

function crc32(buf) {
  let c;
  const table = crc32.table ?? (crc32.table = (() => {
    const t = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      t[n] = c >>> 0;
    }
    return t;
  })());
  c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = table[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const typeBuf = Buffer.from(type, "ascii");
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])));
  return Buffer.concat([len, typeBuf, data, crc]);
}
function encodePNG(w, h, pixels /* Uint8Array RGB, w*h*3 */) {
  const raw = Buffer.alloc(h * (1 + w * 3));
  for (let y = 0; y < h; y++) {
    const rowStart = y * (1 + w * 3);
    raw[rowStart] = 0; // filter: None
    pixels.copy(raw, rowStart + 1, y * w * 3, (y + 1) * w * 3);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; ihdr[9] = 2; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0; // 8-bit RGB, no interlace
  const idat = zlib.deflateSync(raw, { level: 9 });
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr), chunk("IDAT", idat), chunk("IEND", Buffer.alloc(0)),
  ]);
}

// Renders the mark: solid water background, a soft halo ring, a solid inner
// circle — antialiased by supersampling 4x, since a hard-edged circle at
// small icon sizes reads as jagged.
function renderIcon(size, { padFrac = 0, safeCircleFrac = 0.42 } = {}) {
  const SS = 4, S = size * SS;
  const px = Buffer.alloc(S * S * 3);
  const cx = S / 2, cy = S / 2;
  const rCircle = S * safeCircleFrac * (1 - padFrac);
  const rHalo = rCircle * 1.35;
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      const d = Math.hypot(x - cx + 0.5, y - cy + 0.5);
      const c = d <= rCircle ? VISITED : d <= rHalo ? HALO : WATER;
      const i = (y * S + x) * 3;
      px[i] = c[0]; px[i + 1] = c[1]; px[i + 2] = c[2];
    }
  }
  // box-downsample SS×SS -> 1×1
  const out = Buffer.alloc(size * size * 3);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let r = 0, g = 0, b = 0;
      for (let sy = 0; sy < SS; sy++) for (let sx = 0; sx < SS; sx++) {
        const i = ((y * SS + sy) * S + (x * SS + sx)) * 3;
        r += px[i]; g += px[i + 1]; b += px[i + 2];
      }
      const n = SS * SS, o = (y * size + x) * 3;
      out[o] = Math.round(r / n); out[o + 1] = Math.round(g / n); out[o + 2] = Math.round(b / n);
    }
  }
  return out;
}

const dir = new URL("../docs/design-studies/01-map/icons/", import.meta.url);
fs.mkdirSync(dir, { recursive: true });
const write = (name, size, opts) => {
  const buf = encodePNG(size, size, renderIcon(size, opts));
  fs.writeFileSync(new URL(name, dir), buf);
  console.log(name.padEnd(24), size + "×" + size, buf.length, "bytes");
};
write("icon-192.png", 192);
write("icon-512.png", 512);
// Maskable icons get masked to a shape (often a circle/squircle) by the OS,
// so the safe zone shrinks to keep the mark from being clipped.
write("icon-maskable-512.png", 512, { padFrac: 0.28 });
write("apple-touch-icon-180.png", 180); // iOS ignores manifest icons; needs its own tag
console.log("total:", fs.readdirSync(dir).reduce((s, f) => s + fs.statSync(new URL(f, dir)).size, 0), "bytes");
