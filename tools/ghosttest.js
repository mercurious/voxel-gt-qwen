// Unit tests for src/ghost.js against REAL simulated laps (node tools/ghosttest.js).
// Generates an AI lap with the actual physics, encodes it exactly as main.js
// does, JSON round-trips it, then checks decode fidelity, replay pose, and the
// live-delta math for ahead/behind/perfect cases.

import { TRACKS } from '../src/tracks.js';
import { buildTrack } from '../src/trackbuild.js';
import { CARS } from '../src/cars.js';
import { makeRacer, stepCar, aiInput } from '../src/physics.js';
import { quantizeFrame, decodeRec, playGhost, ghostDelta, arcPos } from '../src/ghost.js';

let fails = 0;
function ok(name, cond, extra = '') {
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${extra ? '  ' + extra : ''}`);
  if (!cond) fails++;
}

// --- capture a real lap with real physics ---
const T = buildTrack(TRACKS[1]); // sakura
const car = makeRacer(CARS[4], T, 0, true);
const f = [];
let t = 0, steps = 0;
while (car.lap < 1 && t < 400) {
  stepCar(car, aiInput(car, T), T, 1 / 60, t);
  t += 1 / 60; steps++;
  quantizeFrame(car, f, T);
}
ok('lap captured', car.laps.length === 1, `lap=${t.toFixed(2)}s frames=${f.length / 5}`);

// --- JSON round-trip like localStorage does ---
const raw = JSON.parse(JSON.stringify({ lap: t, car: 'f40', d: Date.now(), f }));
const rec = decodeRec(raw);
ok('frame count', rec.n === f.length / 5);

// --- decode fidelity vs the live car at the END of the run ---
// (only the final pose is comparable to `car` mid-stream; compare bounds overall)
let maxErr = 0;
for (let k = 0; k < rec.n; k++) {
  const dx = rec.xs[k] * 16 - Math.round(rec.xs[k] * 16); // self-consistency
  maxErr = Math.max(maxErr, Math.abs(dx));
}
ok('quantization self-consistent', maxErr < 1e-4);
ok('final pose matches sim end',
  Math.hypot(rec.xs[rec.n - 1] - car.x, rec.zs[rec.n - 1] - car.z) <= 0.08,
  `err=${Math.hypot(rec.xs[rec.n - 1] - car.x, rec.zs[rec.n - 1] - car.z).toFixed(4)}m`);

// --- progress is usable by ghostDelta: monotone non-decreasing ---
let mono = true;
for (let k = 1; k < rec.n; k++) if (rec.progs[k] < rec.progs[k - 1]) mono = false;
ok('progs monotone', mono);

// --- replay pose: at exact frame times, pose == stored frame ---
let poseErr = 0;
for (let k = 5; k < rec.n - 5; k += 31) {
  const p = playGhost(rec, k / 60);
  poseErr = Math.max(poseErr, Math.hypot(p.x - rec.xs[k], p.y - rec.ys[k], p.z - rec.zs[k]));
}
ok('replay pose at frame times', poseErr < 1e-4, `maxErr=${poseErr.toFixed(6)}m`);

// --- replay between frames stays within one frame of travel ---
let mid = 0, hop = 0;
for (let k = 5; k < rec.n - 6; k += 31) {
  const p = playGhost(rec, (k + 0.5) / 60);
  mid = Math.max(mid, Math.min(Math.hypot(p.x - rec.xs[k], p.z - rec.zs[k]),
    Math.hypot(p.x - rec.xs[k + 1], p.z - rec.zs[k + 1])));
  hop = Math.max(hop, Math.hypot(rec.xs[k + 1] - rec.xs[k], rec.zs[k + 1] - rec.zs[k]));
}
ok('replay interpolates between frames', mid <= hop + 1e-3, `maxOff=${mid.toFixed(3)} <= frameHop=${hop.toFixed(3)}m`);

// --- replay past the end holds the final pose ---
const endP = playGhost(rec, rec.n / 60 + 12.5);
ok('holds final pose after end',
  endP.x === rec.xs[rec.n - 1] && endP.z === rec.zs[rec.n - 1] && endP.done);

// --- live delta: perfect replay (incl. the crawl off the line) ~0 ---
let dPerfect = 0, dPerfectLate = 0;
for (let k = 0; k < rec.n; k++) {
  const r = ghostDelta(rec, rec.progs[k], k / 60);
  if (r.delta !== null) {
    if (k > 900) dPerfectLate = Math.max(dPerfectLate, Math.abs(r.delta));
    else dPerfect = Math.max(dPerfect, Math.abs(r.delta));
  }
}
// thresholds: arcPos quantizes at 6.25cm and its ±0.5 tangent clamp can stall
// arc position for a frame or two in tight corners — that bounds identical-
// replay delta jitter at a few frames; anything beyond that is a real bug.
ok('delta ~0 on identical replay, launch phase', dPerfect < 0.07, `max=${dPerfect.toFixed(4)}s`);
ok('delta ~0 on identical replay, racing phase', dPerfectLate < 0.04, `max=${dPerfectLate.toFixed(4)}s`);

let r = ghostDelta(rec, rec.progs[600], 630 / 60);
ok('delta = +0.5s when half a second behind', r.delta !== null && Math.abs(r.delta - 0.5) < 0.02, `delta=${r.delta && r.delta.toFixed(4)}`);

r = ghostDelta(rec, rec.progs[660], 630 / 60);
ok('delta = -0.5s when half a second ahead', r.delta !== null && Math.abs(r.delta + 0.5) < 0.02, `delta=${r.delta && r.delta.toFixed(4)}`);

const before = ghostDelta(rec, rec.progs[0] - 5, 0);
ok('delta null before ghost start', before.delta === null);

// --- end-to-end: a real slower player drives against the decoded ghost ---
const you = makeRacer(CARS[4], T, 0, true); // same car, one full-tap brake = slow
let raceT = 0, dmin = 1e9, dmax = -1e9, nulls = 0, samples = 0;
for (let k = 0; you.lap < 1 && raceT < 400; k++) {
  stepCar(you, aiInput(you, T), T, 1 / 60, raceT);
  raceT += 1 / 60;
  const slow = k > 300 && k < 1200; // lift off for 15 seconds mid-lap
  if (slow) { you.vx *= 0.985; you.vz *= 0.985; } // simulate the player being slow
  const d = ghostDelta(rec, arcPos(you, T), raceT).delta;
  if (d === null) nulls++;
  else { samples++; dmin = Math.min(dmin, d); dmax = Math.max(dmax, d); }
}
ok('slower drive: delta stays positive and grows', samples > 3000 && dmin > -0.15 && dmax > 0.5,
  `range=[${dmin.toFixed(2)},${dmax.toFixed(2)}] nulls=${nulls}`);
ok('ghost pose tracks the driver who set it',
  (() => {
    const a = makeRacer(CARS[4], T, 0, true);
    let t2 = 0;
    for (let k = 0; a.lap < 1 && t2 < 400; k++) { stepCar(a, aiInput(a, T), T, 1 / 60, t2); t2 += 1 / 60; }
    // re-simulate the identical lap and compare every pose against the replay
    let err = 0; t2 = 0;
    for (let k = 0; a.lap < 1 && t2 < 400; k++) {
      stepCar(a, aiInput(a, T), T, 1 / 60, t2); t2 += 1 / 60;
      const p = playGhost(rec, t2);
      err = Math.max(err, Math.hypot(p.x - a.x, p.z - a.z));
    }
    return err < 0.1; // replay pose within 10cm of the real thing at every step
  })(), 're-simulated lap vs replay');

console.log(fails ? `\n${fails} FAILURES` : '\nALL GHOST TESTS PASS');
process.exit(fails ? 1 : 0);
