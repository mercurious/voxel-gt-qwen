// Track records & ghost playback — the pure data layer (no DOM/WebGL), so it
// runs headless in node and is unit-tested by tools/ghosttest.js. main.js owns
// the localStorage cache and the mesh; this owns the encode/decode/replay math.
//
// A record run is sampled every 1/60 s (the sim step) as 5 quantized ints per
// frame: x, y, z at 6.25 cm, heading at ~0.35°, progress at 1/32 sample.
// Positions are absolute world coords; progress is cumulative (no lap
// alignment needed) and SUB-SAMPLE: the raw c.prog is a whole sample index,
// which steps in 2 m jumps and makes the delta ambiguous for whole seconds at
// launch speeds — so we project the car onto the local tangent to get a
// continuous arc position before quantizing.

import { DS } from './trackbuild.js';

// continuous arc position: cumulative sample index + sub-sample offset, by
// projecting the car onto the local tangent. Both the recorded progs and the
// player's live comparison use this, so they share one smooth metric.
export function arcPos(c, T) {
  const i = c.idx;
  const frac = Math.max(-0.5, Math.min(0.5,
    ((c.x - T.S.x[i]) * T.S.tx[i] + (c.z - T.S.z[i]) * T.S.tz[i]) / DS));
  return c.prog + frac;
}

export function quantizeFrame(c, arr, T) {
  arr.push(Math.round(c.x * 16), Math.round(c.y * 16), Math.round(c.z * 16),
    Math.round(c.h * 256), Math.round(arcPos(c, T) * 32));
}

export function decodeRec(o) {
  const f = o.f, n = (f.length / 5) | 0;
  const xs = new Float32Array(n), ys = new Float32Array(n), zs = new Float32Array(n),
    hs = new Float32Array(n), progs = new Float32Array(n);
  for (let k = 0; k < n; k++) {
    const j = k * 5;
    xs[k] = f[j] / 16; ys[k] = f[j + 1] / 16; zs[k] = f[j + 2] / 16;
    hs[k] = f[j + 3] / 256; progs[k] = f[j + 4] / 32;
  }
  return { lap: o.lap, car: o.car, d: o.d, n, xs, ys, zs, hs, progs };
}

// Ghost pose at replay time tau (seconds since the race start — the recorded
// run began on the same grid slot, so no lap alignment is needed). Holds the
// final pose after the recording ends.
export function playGhost(rec, tau) {
  const k = Math.min(Math.max(0, tau) * 60, rec.n - 1);
  const i0 = Math.min(k | 0, rec.n - 2), a = Math.min(1, k - i0), i1 = i0 + 1;
  const lp = (A, B) => A + (B - A) * a;
  return {
    x: lp(rec.xs[i0], rec.xs[i1]),
    y: lp(rec.ys[i0], rec.ys[i1]),
    z: lp(rec.zs[i0], rec.zs[i1]),
    h: lp(rec.hs[i0], rec.hs[i1]),
    speed: Math.hypot(rec.xs[i1] - rec.xs[i0], rec.zs[i1] - rec.zs[i0]) * 60,
    done: k >= rec.n - 1,
  };
}

// The live delta: at what clock time did the ghost FIRST pass where the player
// is now? delta = raceT - thatTime, so delta > 0 means the player is behind.
// Binary search over the (non-decreasing) progs array; first-crossing matters
// because progs plateau while a car crawls through a sample's 2 m window.
// (A player driving backwards briefly violates the monotonic assumption; the
// delta just gets silly for a frame or two, which is fine.)
export function ghostDelta(rec, playerProg, raceT) {
  const P = rec.progs;
  if (playerProg <= P[0]) return { delta: null }; // not launched past the grid yet
  if (playerProg >= P[rec.n - 1]) return { delta: raceT - (rec.n - 1) / 60 }; // ghost run over
  let lo = 0, hi = rec.n - 1; // P[lo] < playerProg <= P[hi]
  while (hi - lo > 1) {
    const m = (lo + hi) >> 1;
    if (P[m] >= playerProg) hi = m; else lo = m;
  }
  const tk = lo + (playerProg - P[lo]) / Math.max(1e-9, P[hi] - P[lo]);
  return { delta: raceT - tk / 60 };
}
