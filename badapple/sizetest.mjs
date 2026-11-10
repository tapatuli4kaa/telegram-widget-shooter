import fs from 'node:fs';
import { newModel, newFrames, RangeEncoder, RangeDecoder, encodeFrame, decodeFrame } from './codec.mjs';

const [, , file, W, H, step, verify] = process.argv;
const w = +W, h = +H, st = +step;
const raw = fs.readFileSync(file);
const n = Math.floor(raw.length / (w * h));
const m = newModel(), F = newFrames(w, h), rc = new RangeEncoder();
const frames = [];
for (let f = 0; f < n; f += st) {
  const bits = new Uint8Array(w * h);
  for (let k = 0; k < w * h; k++) bits[k] = raw[f * w * h + k] > 127 ? 1 : 0;
  frames.push(bits);
  encodeFrame(rc, m, F, bits);
}
const out = rc.finish();
const secs = n / 30;
console.log(`${w}x${h} @${30 / st}fps: ${frames.length} frames, ${out.length} B, ${(out.length / secs).toFixed(0)} B/s, ${(out.length / frames.length).toFixed(1)} B/frame`);
if (verify) {
  const m2 = newModel(), F2 = newFrames(w, h), rd = new RangeDecoder(out);
  for (let k = 0; k < frames.length; k++) {
    decodeFrame(rd, m2, F2);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (F2.cur[(y + 2) * F2.S + x + 2] !== frames[k][y * w + x]) { console.log('MISMATCH frame', k); process.exit(1); }
  }
  console.log('roundtrip ok');
}
