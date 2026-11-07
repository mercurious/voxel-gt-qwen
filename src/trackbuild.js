// Builds a playable voxel circuit from a control-point list:
// sampled spline, deduped voxel road + curbs + walls + embankments, scenery,
// and spatial queries (height, nearest-sample index, wall zones).
import * as THREE from 'three';
import { Vox, voxMaterial } from './vox.js';

export const DS = 2; // spline sample spacing (m)
const VS = 2;        // voxel size (m)
const YQ = 1;        // elevation quantization (m)

function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function buildTrack(def) {
  const pts3 = def.pts.map(p => new THREE.Vector3(p[0], p[2], p[1]));
  const curve = new THREE.CatmullRomCurve3(pts3, true, 'centripetal');
  const totalLen = curve.getLength();
  const N = Math.max(120, Math.round(totalLen / DS));
  const sp = curve.getSpacedPoints(N); // N+1 pts, last ~ first
  const halfW = def.width;
  const c = Math.max(2, Math.round(halfW / VS));

  const S = { x: new Float64Array(N), y: new Float64Array(N), z: new Float64Array(N),
              tx: new Float64Array(N), tz: new Float64Array(N),
              rx: new Float64Array(N), rz: new Float64Array(N),
              yq: new Float64Array(N), R: new Float64Array(N) };
  for (let i = 0; i < N; i++) {
    S.x[i] = sp[i].x; S.y[i] = sp[i].y; S.z[i] = sp[i].z;
    S.yq[i] = Math.round(sp[i].y / YQ) * YQ;
    const a = sp[(i + N - 1) % N], b = sp[(i + 1) % N];
    let tx = b.x - a.x, ty = b.y - a.y, tz = b.z - a.z;
    const L = Math.hypot(tx, ty, tz) || 1;
    S.tx[i] = tx / L; S.tz[i] = tz / L;
    S.rx[i] = S.tz[i]; S.rz[i] = -S.tx[i]; // right-hand side of travel
  }
  // corner radius (smoothed over +-3 samples)
  for (let i = 0; i < N; i++) {
    let turn = 0;
    for (let k = -3; k < 3; k++) {
      const a = (i + k + N) % N, b = (i + k + 1) % N;
      const cr = S.tx[a] * S.tz[b] - S.tz[a] * S.tx[b];
      const dt = S.tx[a] * S.tx[b] + S.tz[a] * S.tz[b];
      turn += Math.abs(Math.atan2(cr, dt));
    }
    S.R[i] = Math.min(4000, (6 * DS) / Math.max(turn, 1e-4));
  }

  // wall zones: suppress walls near the figure-8 crossover
  const wallOn = new Uint8Array(N).fill(1);
  for (let i = 0; i < N; i++) {
    for (let j = i + 30; j < N; j++) {
      if (N - (j - i) < 30) continue;
      const dx = S.x[i] - S.x[j], dz = S.z[i] - S.z[j];
      if (dx * dx + dz * dz < 45 * 45) {
        for (let k = -4; k <= 4; k++) { wallOn[(i + k + N) % N] = 0; wallOn[(j + k + N) % N] = 0; }
      }
    }
  }

  // true if a column dropped at (x,z) would land on a DIFFERENT part of the
  // track (the figure-8 lower deck) — used to keep piers/embankment fill from
  // impaling the other deck and creating coincident faces
  const overOtherTrack = (x, z, i) => {
    const r2 = (halfW + VS) * (halfW + VS);
    for (let k = 0; k < N; k += 3) {
      const dk = Math.abs(k - i);
      if (dk < 30 || N - dk < 30) continue;
      const dx = x - S.x[k], dz = z - S.z[k];
      if (dx * dx + dz * dz < r2) return true;
    }
    return false;
  };

  const vx = new Vox();
  const seen = new Set();
  // Snap every track cell to the world voxel grid: cells tile perfectly with
  // no overlap, so there are never coincident faces to z-fight.
  const put = (x, y, z, w, h, d, col, jitter) => {
    x = Math.round(x / VS) * VS;
    z = Math.round(z / VS) * VS;
    const key = (x / VS) + '|' + Math.round(y / YQ) + '|' + (z / VS);
    if (seen.has(key)) return;
    seen.add(key);
    vx.box(x, y, z, w, h, d, col, jitter ? { jitter } : undefined);
  };

  const ASPHALT = 0x2c2c31, RED = 0xd03434, WHITE = 0xe8e8e4, RAIL = 0xbcbcb4;
  // samples whose outer cells are occupied by grandstands (fill skips there so
  // the stand columns don't share grid cells with embankment columns)
  const standZone = new Uint8Array(N);
  for (let g = 0; g < def.scenery.stands; g++)
    for (let k = 0; k < 20; k++) standZone[(8 + g * 60 + k) % N] = 1;

  // ---- voxel road as cell classification, not stamped boxes ----
  // Samples stamp candidate grid cells; each cell is then classified ONCE by
  // its lateral distance to its nearest sample (road / curb / wall / fill).
  // Exactly one box per grid column per height layer -> no overlaps, no
  // coplanar faces, and no holes where diagonal runs collapse onto a cell.
  const cols = new Map(); // 'kx|kz' -> Map(yq -> {bi, bs})
  const RSTAMP = c + 7;
  for (let i = 0; i < N; i++) {
    for (let j = -RSTAMP; j <= RSTAMP; j++) {
      const px = S.x[i] + S.rx[i] * j * VS, pz = S.z[i] + S.rz[i] * j * VS;
      const k0 = Math.round(px / VS), k1 = Math.round(pz / VS), yq = S.yq[i];
      for (let ox = -1; ox <= 1; ox++) for (let oz = -1; oz <= 1; oz++) {
        const kx = k0 + ox, kz = k1 + oz;
        const dx = kx * VS - S.x[i], dz = kz * VS - S.z[i];
        const sc = dx * dx + dz * dz;
        const ck = kx + '|' + kz;
        let m = cols.get(ck);
        if (!m) { m = new Map(); cols.set(ck, m); }
        const e = m.get(yq);
        if (!e || sc < e.bs) m.set(yq, { bi: i, bs: sc });
      }
    }
  }
  for (const [ck, m] of cols) {
    const parts = ck.split('|'), kx = +parts[0], kz = +parts[1];
    const cx = kx * VS, cz = kz * VS;
    const es = [...m.values()].sort((a, b) => a.bs - b.bs).slice(0, 6);
    const taken = [];
    for (const e of es) {
      const i = e.bi, y = S.yq[i];
      const d = (cx - S.x[i]) * S.rx[i] + (cz - S.z[i]) * S.rz[i];
      const ad = Math.abs(d);
      let y0 = 0, y1 = 0, colr = 0, jit = 0, ok = true;
      if (ad <= (c + 0.5) * VS) {                       // asphalt / start grid
        y0 = y - VS; y1 = y;
        colr = i < 3 ? (((kx + kz) & 1) ? WHITE : 0x17181c) : ASPHALT;
        jit = 0.05;
      } else if (ad <= (c + 1.5) * VS) {                // kerb stones
        y0 = y - VS; y1 = y;
        colr = Math.floor(i / 3) % 2 ? RED : WHITE;
      } else if (wallOn[i] && ad > (c + 2.5) * VS && ad <= (c + 3.5) * VS) {
        y0 = y - 2.2; y1 = y + 2.8;                     // buried base
        colr = i % 12 < 3 ? RED : RAIL;
      } else if (y > YQ && ad > (c + 1.5) * VS && ad <= (c + 6.5) * VS &&
                 !(standZone[i] && ad >= (c + 4.5) * VS) && !overOtherTrack(cx, cz, i)) {
        const jlat = Math.round(ad / VS);               // embankment fill
        const top = y - (jlat - (c + 1)) * VS * 0.55;
        if (top <= 0.5) continue;
        y0 = -1; y1 = top; colr = 0x5a5148; jit = 0.04;
      } else ok = false;
      if (!ok) continue;
      const boxes = [[y0, y1, colr, jit]];
      // elevated deck/kerb/wall columns get a solid core down to the slab;
      // the column overlap tracker skips the core where the lower deck of the
      // figure-8 already owns that span, keeping bridge clearance visible
      if (y > YQ && y0 > -1) boxes.push([-1, y0, 0x5a5148, 0.04]);
      for (const [b0, b1, bcol, bjit] of boxes) {
        if (b1 - b0 < 0.15) continue;
        let clash = false;
        for (const t of taken) if (b0 < t[1] && b1 > t[0]) { clash = true; break; }
        if (clash) continue;
        taken.push([b0, b1]);
        vx.box(cx, (b0 + b1) / 2, cz, VS, b1 - b0, VS, bcol, bjit ? { jitter: bjit } : undefined);
      }
    }
  }

  // bounds
  let minX = 1e9, maxX = -1e9, minZ = 1e9, maxZ = -1e9;
  for (let i = 0; i < N; i++) {
    if (S.x[i] < minX) minX = S.x[i]; if (S.x[i] > maxX) maxX = S.x[i];
    if (S.z[i] < minZ) minZ = S.z[i]; if (S.z[i] > maxZ) maxZ = S.z[i];
  }
  const cxm = (minX + maxX) / 2, czm = (minZ + maxZ) / 2;

  // ground slab — top sits 1m below the road surface so the two never share a plane
  const gx = (maxX - minX) + 900, gz = (maxZ - minZ) + 900;
  vx.box(cxm, -2.5, czm, gx, 3, gz, def.ground, 0.045);

  // ---- scenery ----
  const rnd = mulberry32(def.name.length * 7919 + N);
  const minDistToTrack = (x, z) => {
    let best = 1e18;
    for (let i = 0; i < N; i += 4) {
      const dx = x - S.x[i], dz = z - S.z[i];
      const d = dx * dx + dz * dz;
      if (d < best) best = d;
    }
    return Math.sqrt(best);
  };
  const greens = [0x2d5a24, 0x376b2b, 0x457a33, 0x2a4f22];
  for (let n = 0, tries = 0; n < def.scenery.trees && tries < def.scenery.trees * 6; tries++) {
    n++;
    const x = minX - 160 + rnd() * ((maxX - minX) + 320);
    const z = minZ - 160 + rnd() * ((maxZ - minZ) + 320);
    const d = minDistToTrack(x, z);
    if (d < halfW + 14 || d > 300) { n--; continue; }
    const h = 6 + rnd() * 6, g = greens[(rnd() * 4) | 0];
    vx.box(x, (h - 1) / 2, z, 2, h + 1, 2, 0x4a3423);
    const fs = 8 + rnd() * 6;
    vx.box(x, h + fs * 0.25, z, fs, fs * 0.7, fs, g, 0.06);
    vx.box(x, h + fs * 0.7, z, fs * 0.6, fs * 0.5, fs * 0.6, g, 0.06);
  }
  const bRadius = Math.max(maxX - minX, maxZ - minZ) / 2;
  for (let n = 0; n < def.scenery.hills; n++) {
    const a = rnd() * Math.PI * 2;
    const rr = bRadius + 220 + rnd() * 380;
    const x = cxm + Math.cos(a) * rr, z = czm + Math.sin(a) * rr;
    const s = 70 + rnd() * 90, h1 = 45 + rnd() * 70;
    const gcol = 0x44603c, scol = 0x7a7f78;
    vx.box(x, (h1 - 1) / 2, z, s, h1 + 1, s, rnd() < 0.4 ? scol : gcol, 0.07);
    vx.box(x, h1 + h1 * 0.28, z, s * 0.62, h1 * 0.56, s * 0.62, gcol, 0.07);
    vx.box(x, h1 * 1.75, z, s * 0.32, h1 * 0.34, s * 0.32, 0x8a8f88, 0.07);
  }
  // grandstands along the start straight — solid stepped columns (put() snaps
  // them to the grid so neighbouring cells never overlap and z-fight)
  for (let g = 0; g < def.scenery.stands; g++) {
    const base = 8 + g * 60;
    for (let k = 0; k < 20; k++) {
      const i = (base + k) % N;
      for (let r = 0; r < 3; r++) {
        const j = c + 5 + r;
        const px = S.x[i] + S.rx[i] * j * VS, pz = S.z[i] + S.rz[i] * j * VS;
        const top = S.yq[i] + 3.2 + r * 2.4;
        put(px, (top - 1) / 2, pz, VS, top + 1, VS, 0x555a62);
        if (rnd() < 0.55) {
          const hue = [0xd05050, 0x5070d0, 0xe0c050, 0x60b060, 0xd0d0d0][(rnd() * 5) | 0];
          vx.box(Math.round(px / VS) * VS, top + 0.75, Math.round(pz / VS) * VS, 1, 1.5, 1, hue);
        }
      }
    }
  }
  // start gantry
  {
    const y = S.yq[0];
    for (const j of [c + 2, -(c + 2)]) {
      vx.box(S.x[0] + S.rx[0] * j * VS, y + 5, S.z[0] + S.rz[0] * j * VS, 2, 14, 2, 0xdddddd);
    }
    const span = (2 * (c + 2) + 2) * VS;
    vx.box(S.x[0], y + 12.5, S.z[0], 2, 2.5, span, 0xffffff);
    for (let k = 0; k < 6; k++) {
      const j = -c - 1.5 + k * (span / VS) / 5.4;
      vx.box(S.x[0], y + 12.5, S.z[0] + S.rz[0] * j * VS, 2.2, 1, VS, 0xd03434);
    }
  }

  const road = new THREE.Mesh(vx.geometry(), voxMaterial());
  road.frustumCulled = false;
  const group = new THREE.Group();
  group.add(road);

  // ---- queries ----
  const wallLimit = halfW + 3 * VS;
  function heightAt(x, z, yCar, hint) {
    const i = idxAt(x, z, yCar, hint);
    if (i < 0) return 0;
    const d = Math.abs((x - S.x[i]) * S.rx[i] + (z - S.z[i]) * S.rz[i]);
    const over = Math.max(0, d - halfW - 1.5 * VS);
    return Math.max(-1, S.yq[i] - over * 0.55);
  }
  function scoreOf(i, x, z, y) {
    const dx = x - S.x[i], dz = z - S.z[i], dy = y - S.yq[i];
    return dx * dx + dz * dz + 4 * dy * dy;
  }
  function idxAt(x, z, y, hint) {
    if (hint >= 0) {
      let best = -1, bs = 1e18;
      for (let k = -80; k <= 80; k++) {
        const i = (hint + k + N) % N;
        const sc = scoreOf(i, x, z, y);
        if (sc < bs) { bs = sc; best = i; }
      }
      if (bs < 140 * 140) return best;
    }
    let best = -1, bs = 1e18;
    for (let i = 0; i < N; i++) {
      const sc = scoreOf(i, x, z, y);
      if (sc < bs) { bs = sc; best = i; }
    }
    return best;
  }

  const ring = [];
  for (let i = 0; i < N; i += 3) ring.push(S.x[i], S.z[i]);

  return {
    def, group, S, N, totalLen, halfW, wallLimit, wallOn,
    heightAt, idxAt, ring, bounds: { minX, maxX, minZ, maxZ, cx: cxm, cz: czm, r: bRadius },
  };
}
