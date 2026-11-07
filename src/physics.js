// Arcade car physics on the sampled track field. 2D velocity + heading; the
// same code drives the player and the AI opponents.
import { DS } from './trackbuild.js';

const clamp = (v, a, b) => v < a ? a : v > b ? b : v;

export function wrapAngle(a) {
  while (a > Math.PI) a -= Math.PI * 2;
  while (a < -Math.PI) a += Math.PI * 2;
  return a;
}

// place on the starting grid behind the line (slot 0 = pole)
export function makeRacer(car, T, slot, isPlayer) {
  const row = slot >> 1, col = (slot & 1) ? 1 : -1;
  const i = ((T.N - 14 - row * 9) % T.N + T.N) % T.N;
  const off = col * (T.halfW * 0.55);
  return {
    car, isPlayer,
    x: T.S.x[i] + T.S.rx[i] * off,
    z: T.S.z[i] + T.S.rz[i] * off,
    y: T.S.yq[i],
    h: Math.atan2(T.S.tz[i], T.S.tx[i]),
    vx: 0, vz: 0, speed: 0, slip: 0,
    idx: i, prog: i, lap: 0, prevLapDone: 0,
    lapStart: 0, lapProgBase: i, laps: [], best: Infinity,
    finished: false, finishTime: 0,
    offroad: false, hitT: -9,
    laneOff: (isPlayer ? 0 : (slot % 3 - 1) * (T.halfW * 0.34)),
    skill: 1,
  };
}

export function resetToTrack(c, T) {
  const i = T.idxAt(c.x, c.z, c.y, c.idx);
  c.x = T.S.x[i]; c.z = T.S.z[i]; c.y = T.S.yq[i];
  c.h = Math.atan2(T.S.tz[i], T.S.tx[i]);
  c.vx = 0; c.vz = 0; c.speed = 0;
}

// returns true on the frame a lap was completed
export function stepCar(c, inp, T, dt, tNow) {
  const st = c.car.stats;
  const vmax = st.vmax * T.def.topSpeedCap * c.skill;
  let ch = Math.cos(c.h), sh = Math.sin(c.h);
  let speedF = c.vx * ch + c.vz * sh;

  // signed lateral distance to the racing line (used for surface state)
  const d0 = (c.x - T.S.x[c.idx]) * T.S.rx[c.idx] + (c.z - T.S.z[c.idx]) * T.S.rz[c.idx];
  c.offroad = Math.abs(d0) > T.halfW + 4; // curbs stay grippy; grass bites

  // yaw: needs some speed to turn, less authority at top speed
  const sfac = clamp(speedF / 7, -1, 1) * (1 - Math.min(0.55, Math.abs(speedF) / (1.9 * vmax)));
  c.h += inp.steer * st.steer * sfac * dt;
  c.h = wrapAngle(c.h);
  ch = Math.cos(c.h); sh = Math.sin(c.h);
  speedF = c.vx * ch + c.vz * sh;

  // lateral slip decays at the grip rate -> grip cornering, drifty when broken
  let latx = c.vx - ch * speedF, latz = c.vz - sh * speedF;
  let grip = st.grip * (c.offroad ? 0.35 : 1) * (inp.hand ? 0.3 : 1);
  const keep = Math.max(0, 1 - grip * dt);
  latx *= keep; latz *= keep;

  // longitudinal
  let a = 0;
  if (inp.throttle > 0) a += st.power * inp.throttle;
  if (inp.brake > 0) {
    if (speedF > 0.5) a -= st.brake * inp.brake;
    else if (speedF > -13) a -= st.power * 0.42 * inp.brake;
  }
  if (inp.hand) a -= Math.sign(speedF) * 6;
  speedF += a * dt;
  speedF -= speedF * (0.28 + (c.offroad ? 0.9 : 0)) * dt; // drag + dirt
  speedF = clamp(speedF, -14, vmax);

  c.vx = ch * speedF + latx;
  c.vz = sh * speedF + latz;
  c.x += c.vx * dt;
  c.z += c.vz * dt;
  c.speed = Math.hypot(c.vx, c.vz);
  c.slip = Math.hypot(latx, latz);

  // advance along the track (windowed search keeps us on the right bridge layer)
  const ni = T.idxAt(c.x, c.z, c.y, c.idx);
  let di = ni - c.idx;
  if (di > T.N / 2) di -= T.N;
  if (di < -T.N / 2) di += T.N;
  c.prog += di;
  c.idx = ni;

  // walls
  const dl = (c.x - T.S.x[ni]) * T.S.rx[ni] + (c.z - T.S.z[ni]) * T.S.rz[ni];
  const lim = T.wallLimit - 0.8;
  if (T.def.walls && Math.abs(dl) > lim && T.wallOn[ni]) {
    const sgn = Math.sign(dl), S = T.S;
    c.x = S.x[ni] + S.rx[ni] * sgn * lim;
    c.z = S.z[ni] + S.rz[ni] * sgn * lim;
    const rv = c.vx * S.rx[ni] + c.vz * S.rz[ni];
    if (rv * sgn > 0) { c.vx -= S.rx[ni] * rv * 1.5; c.vz -= S.rz[ni] * rv * 1.5; }
    c.vx *= 0.5; c.vz *= 0.5;
    c.hitT = tNow;
  }

  // terrain follows the quantized road surface
  const gh = T.heightAt(c.x, c.z, c.y, ni);
  c.y += (gh - c.y) * Math.min(1, dt * 10);

  // The grid sits just behind the line, so the first crossing STARTS lap 1
  // rather than completing one: only count laps with (nearly) a full lap of
  // progress since the last counted crossing.
  const lapDone = Math.floor(c.prog / T.N);
  if (lapDone > c.prevLapDone) {
    if (c.prog - c.lapProgBase >= T.N * 0.85) {
      c.laps.push(tNow - c.lapStart);
      if (tNow - c.lapStart < c.best) c.best = tNow - c.lapStart;
      c.lapStart = tNow;
      c.lapProgBase = c.prog;
      c.lap = c.laps.length;
      c.prevLapDone = lapDone;
      return true;
    }
    c.prevLapDone = lapDone; // crossed before race proper
  }
  return false;
}

export function collideCars(a, b) {
  const dx = b.x - a.x, dz = b.z - a.z, d2 = dx * dx + dz * dz;
  const R = 3.4;
  if (d2 < 1e-4 || d2 > R * R) return;
  const d = Math.sqrt(d2), nx = dx / d, nz = dz / d, pen = (R - d) / 2;
  a.x -= nx * pen; a.z -= nz * pen;
  b.x += nx * pen; b.z += nz * pen;
  const ra = a.vx * nx + a.vz * nz, rb = b.vx * nx + b.vz * nz;
  if (ra - rb > 0) { // approaching
    a.vx += (rb - ra) * nx * 0.7; a.vz += (rb - ra) * nz * 0.7;
    b.vx += (ra - rb) * nx * 0.7; b.vz += (ra - rb) * nz * 0.7;
  }
}

// pure-pursuit AI: aim down the road, slow for the measured corner radius
export function aiInput(c, T) {
  const look = Math.round((8 + c.speed * 0.75) / DS);
  const j = (c.idx + look) % T.N;
  const tx = T.S.x[j] + T.S.rx[j] * c.laneOff;
  const tz = T.S.z[j] + T.S.rz[j] * c.laneOff;
  const err = wrapAngle(Math.atan2(tz - c.z, tx - c.x) - c.h);
  const steer = clamp(err * 2.4, -1, 1);

  // look ahead down the road for the tightest upcoming radius
  let R = 4000;
  for (let k = 0; k < look + 10; k++) {
    const r = T.S.R[(c.idx + k) % T.N];
    if (r < R) R = r;
  }
  const vT = clamp(Math.sqrt(c.car.stats.grip * 1.15 * R), 9, c.car.stats.vmax * T.def.topSpeedCap * c.skill);
  let throttle = 0, brake = 0;
  if (c.speed < vT) throttle = 1;
  else if (c.speed > vT * 1.14) brake = 1;
  return { throttle, brake, steer, hand: 0 };
}
