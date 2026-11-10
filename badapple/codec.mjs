// Shared bitmap-video codec: context-modelled binary range coder (LZMA-style
// carry handling, 16-bit probabilities). The widget's decoder is a minified
// copy of decodeFrame/RangeDecoder below and must stay bit-exact with it.

export const PB = 16;            // probability precision
export const ONE = 1 << PB;
export const NCTX = 1 << 12;     // context bits (see ctxOf)

// Adaptive model state, shared by encoder and decoder.
export function newModel() {
  const p = new Uint16Array(NCTX + 1).fill(ONE >> 1); // last slot: "frame same" flag
  const n = new Uint8Array(NCTX + 1);                  // adaptation speed counter
  return { p, n };
}

// rate: fast at first, then settle at 1/32
const RATE = [1, 2, 2, 3, 3, 4, 4, 4, 5];
export function update(m, i, bit) {
  const k = m.n[i] < 8 ? RATE[m.n[i]++] : 5;
  let p = m.p[i];
  if (bit) p -= p >> k; else p += (ONE - p) >> k;
  if (p < 64) p = 64; else if (p > ONE - 64) p = ONE - 64;
  m.p[i] = p; // p = probability of 0
}

// Frame buffers are padded by 2 on every side: stride = W + 4.
// cur: W WW NW N NE NN ; prev: C L R U D DD(prev x,y+2)?
export function ctxOf(c, q, i, S) {
  return (c[i - 1]) | (c[i - 2] << 1) | (c[i - S - 1] << 2) | (c[i - S] << 3) |
    (c[i - S + 1] << 4) | (c[i - 2 * S] << 5) |
    (q[i] << 6) | (q[i - 1] << 7) | (q[i + 1] << 8) | (q[i - S] << 9) | (q[i + S] << 10) |
    (c[i - S + 2] << 11);
}

export class RangeEncoder {
  constructor() { this.low = 0; this.range = 0xFFFFFFFF; this.cache = 0; this.cacheSize = 1; this.out = []; }
  bit(m, i, b) {
    const bound = (this.range >>> PB) * m.p[i];
    if (!b) this.range = bound; else { this.low += bound; this.range -= bound; }
    update(m, i, b);
    while (this.range < 0x1000000) { this.range = (this.range * 256) >>> 0; this.shiftLow(); }
  }
  shiftLow() {
    if (this.low < 0xFF000000 || this.low >= 0x100000000) {
      const carry = this.low >= 0x100000000 ? 1 : 0;
      let t = this.cache;
      do { this.out.push((t + carry) & 0xFF); t = 0xFF; } while (--this.cacheSize);
      this.cache = Math.floor(this.low / 0x1000000) & 0xFF;
    }
    this.cacheSize++;
    this.low = (this.low % 0x1000000) * 256;
  }
  finish() { for (let k = 0; k < 5; k++) this.shiftLow(); return Uint8Array.from(this.out); }
  clone() {
    const e = new RangeEncoder();
    Object.assign(e, this); e.out = this.out.slice(); return e;
  }
}

export class RangeDecoder {
  constructor(buf) { this.b = buf; this.pos = 0; this.range = 0xFFFFFFFF; this.code = 0; for (let k = 0; k < 5; k++) this.code = (this.code * 256 + this.byte()) >>> 0; }
  byte() { return this.pos < this.b.length ? this.b[this.pos++] : 0; }
  bit(m, i) {
    const bound = (this.range >>> PB) * m.p[i];
    let b;
    if (this.code < bound) { this.range = bound; b = 0; } else { this.code -= bound; this.range -= bound; b = 1; }
    update(m, i, b);
    while (this.range < 0x1000000) { this.range = (this.range * 256) >>> 0; this.code = (this.code * 256 + this.byte()) >>> 0; }
    return b;
  }
}

export function newFrames(W, H) {
  const S = W + 4, N = S * (H + 4);
  return { W, H, S, cur: new Uint8Array(N), prev: new Uint8Array(N) };
}

// bits: Uint8Array W*H of 0/1 (1 = white)
export function encodeFrame(rc, m, F, bits) {
  const { W, H, S } = F;
  const c = F.prev; // write new frame into the old prev buffer, then swap
  const q = F.cur;
  let same = 1;
  for (let y = 0; y < H && same; y++) for (let x = 0; x < W; x++) if (bits[y * W + x] !== q[(y + 2) * S + x + 2]) { same = 0; break; }
  rc.bit(m, NCTX, same);
  if (same) return;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = (y + 2) * S + x + 2;
    const b = bits[y * W + x];
    rc.bit(m, ctxOf(c, q, i, S), b);
    c[i] = b;
  }
  F.prev = q; F.cur = c;
}

export function decodeFrame(rd, m, F) {
  const { W, H, S } = F;
  if (rd.bit(m, NCTX)) return false;
  const c = F.prev, q = F.cur;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = (y + 2) * S + x + 2;
    c[i] = rd.bit(m, ctxOf(c, q, i, S));
  }
  F.prev = q; F.cur = c;
  return true;
}

export function cloneModel(m) { return { p: m.p.slice(), n: m.n.slice() }; }
export function cloneFrames(F) { return { ...F, cur: F.cur.slice(), prev: F.prev.slice() }; }
