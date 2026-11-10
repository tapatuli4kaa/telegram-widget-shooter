// Encodes the video into chunks for the bot: each chunk is one chat_data edit.
// usage: node encode.mjs <video> <W> <H> <fps> [out.json]
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
import { newModel, newFrames, RangeEncoder, RangeDecoder, encodeFrame, decodeFrame, cloneModel, cloneFrames } from './codec.mjs';

const [, , video, Ws, Hs, fpsS, outFile] = process.argv;
if (!video) { console.error('usage: node encode.mjs <video> <W> <H> <fps> [out.json]'); process.exit(1); }
const W = +Ws, H = +Hs, FPS = +fpsS;
const out = outFile ?? new URL(`./stream_${W}x${H}_${FPS}.json`, import.meta.url).pathname.replace(/^\/(\w:)/, '$1');

// chat_data holds 1024 bytes of text: "<seq>:<base64>" → at most 762 binary bytes (1 header byte + range coder bytes)
const MAXBIN = 762;

const raw = execFileSync('ffmpeg', ['-v', 'error', '-i', video, '-vf', `fps=${FPS},scale=${W}:${H}:flags=area`, '-f', 'rawvideo', '-pix_fmt', 'gray', '-'], { maxBuffer: 1 << 30 });
const n = Math.floor(raw.length / (W * H));
console.log(`${n} frames ${W}x${H} @${FPS}`);

const frames = [];
for (let f = 0; f < n; f++) {
  const bits = new Uint8Array(W * H);
  for (let k = 0; k < W * H; k++) bits[k] = raw[f * W * H + k] > 127 ? 1 : 0;
  frames.push(bits);
}

let m = newModel(), F = newFrames(W, H);
const chunks = [];
let rc = new RangeEncoder(), inChunk = 0;
const close = () => { const b = rc.finish(); chunks.push(Buffer.concat([Buffer.from([inChunk]), Buffer.from(b)])); rc = new RangeEncoder(); inChunk = 0; };
for (let f = 0; f < n; f++) {
  const snap = { m: cloneModel(m), F: cloneFrames(F), rc: rc.clone() };
  encodeFrame(rc, m, F, frames[f]);
  if (inChunk > 0 && (1 + rc.out.length + 5 > MAXBIN || inChunk === 255)) {
    m = snap.m; F = snap.F; rc = snap.rc;
    close();
    encodeFrame(rc, m, F, frames[f]);
  }
  inChunk++;
}
close();

// verify: decode everything back exactly as the widget will
{
  const m2 = newModel(), F2 = newFrames(W, H);
  let f = 0;
  for (const c of chunks) {
    const rd = new RangeDecoder(c.subarray(1));
    for (let k = 0; k < c[0]; k++, f++) {
      decodeFrame(rd, m2, F2);
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (F2.cur[(y + 2) * F2.S + x + 2] !== frames[f][y * W + x]) throw new Error('mismatch at frame ' + f);
    }
  }
  if (f !== n) throw new Error('frame count mismatch');
}

const b64 = chunks.map((c) => c.toString('base64'));
const maxText = Math.max(...b64.map((s, i) => Buffer.byteLength(`${i}:${s}`)));
const total = chunks.reduce((a, c) => a + c.length, 0);
console.log(`${chunks.length} chunks, ${total} B, max chat_data ${maxText} B, ${(n / chunks.length).toFixed(1)} frames/chunk → ${(n / FPS / chunks.length).toFixed(2)} s of video per edit`);
fs.writeFileSync(out, JSON.stringify({ W, H, FPS, frames: n, chunks: b64 }));
console.log('wrote', out);
