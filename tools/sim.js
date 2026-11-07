// Headless simulation harness — runs the REAL game modules in node.
// Usage: node tools/sim.js [trackIndex]   (default: all three)
//
// For every track x car combo it drives a pure-AI 3-lap run with exactly the
// same code path the browser uses (aiInput -> stepCar at STEP=1/60) and prints
// lap times, best lap and top speed. This is the tuning baseline: any physics
// or track change should be re-run through here before going near the browser.

import { TRACKS } from '../src/tracks.js';
import { buildTrack, DS } from '../src/trackbuild.js';
import { CARS } from '../src/cars.js';
import { makeRacer, stepCar, aiInput } from '../src/physics.js';

const STEP = 1 / 60;          // same fixed step as main.js
const LAPS = 3;
const STUCK_AT = 420;         // seconds before we call a run dead

const fmt = t => {
  const m = Math.floor(t / 60), s = t - m * 60;
  return m ? `${m}:${s.toFixed(2).padStart(5, '0')}` : s.toFixed(2);
};

function timeTrial(T, carDef) {
  const c = makeRacer(carDef, T, 0, false);
  let t = 0, peak = 0;
  for (let step = 0; c.lap < LAPS; step++) {
    const inp = aiInput(c, T);
    stepCar(c, inp, T, STEP, t);
    t += STEP; peak = Math.max(peak, c.speed);
    if (t > STUCK_AT) return null; // AI got stuck — report as failure
  }
  return { laps: c.laps, best: c.best, peak, t };
}

const only = process.argv[2] !== undefined ? [+process.argv[2]] : [0, 1, 2];
for (const ti of only) {
  const def = TRACKS[ti];
  const T = buildTrack(def);
  console.log(`\n=== ${def.name} — ${T.N} samples, ${(T.N * DS / 1000).toFixed(2)} km, ` +
    `width ${def.width}, cap x${def.topSpeedCap} ===`);
  console.log('car'.padEnd(22) + 'best'.padStart(9) + 'avg'.padStart(9) +
    'total'.padStart(10) + 'km/h'.padStart(8));
  for (const car of CARS) {
    const r = timeTrial(T, car);
    if (!r) { console.log(car.name.padEnd(22) + '  STUCK (no finish)'); continue; }
    const avg = r.laps.reduce((a, b) => a + b, 0) / r.laps.length;
    console.log(car.name.padEnd(22) +
      fmt(r.best).padStart(9) + fmt(avg).padStart(9) +
      fmt(r.t).padStart(10) + Math.round(r.peak * 3.6).toString().padStart(8));
  }
}
