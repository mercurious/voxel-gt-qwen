// VOXEL GT — game shell: state machine, menus, cameras, HUD, minimap, audio.
import * as THREE from 'three';
import { TRACKS } from './tracks.js';
import { CARS, buildCarMesh } from './cars.js';
import { Vox, voxMaterial } from './vox.js';
import { buildTrack, DS } from './trackbuild.js';
import { makeRacer, stepCar, aiInput, collideCars, resetToTrack } from './physics.js';
import { quantizeFrame, decodeRec, playGhost, ghostDelta, arcPos } from './ghost.js';

const $ = id => document.getElementById(id);
const clamp = (v, a, b) => v < a ? a : v > b ? b : v;

// ---------- renderer / scene ----------
const canvas = $('game');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: false });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
const scene = new THREE.Scene();
const cam = new THREE.PerspectiveCamera(62, 1, 0.5, 2600);
const hemi = new THREE.HemisphereLight(0xffffff, 0x3a4a35, 0.9);
const sun = new THREE.DirectionalLight(0xfff2dc, 0.75);
sun.position.set(250, 500, 150);
scene.add(hemi, sun);

window.addEventListener('error', ev => {
  const el = $('bigmsg');
  el.textContent = 'JS ERROR: ' + ev.message;
  el.classList.add('on');
  bigTimer = 10;
  console.error(ev.error || ev.message);
});

function resize() {
  const w = innerWidth, h = innerHeight;
  renderer.setSize(w, h);
  cam.aspect = w / h;
  cam.updateProjectionMatrix();
}
addEventListener('resize', resize);
resize();

// ---------- assets ----------
console.time('build tracks');
const tracks = TRACKS.map(buildTrack);
console.timeEnd('build tracks');

// track view roots (shared groups, swapped into the single scene)
const trackRoots = tracks.map(T => {
  const g = new THREE.Group();
  g.add(T.group);
  return g;
});

// garage root
const garageRoot = new THREE.Group();
{
  const vx = new Vox();
  vx.box(0, -0.5, 0, 30, 1, 30, 0x272d38, 0.04);
  for (let k = 0; k < 8; k++) {
    const a = k / 8 * Math.PI * 2;
    vx.box(Math.cos(a) * 15.5, 0.6, Math.sin(a) * 15.5, 1.4, 2.2, 1.4, k % 2 ? 0xe8b83a : 0x3f79ae);
  }
  const pad = new THREE.Mesh(vx.geometry(), voxMaterial());
  garageRoot.add(pad);
}
const turntable = new THREE.Group();
garageRoot.add(turntable);

// ---------- minimap prefit ----------
const maps = tracks.map(T => {
  const b = T.bounds;
  const s = Math.min(148 / (b.maxX - b.minX), 116 / (b.maxZ - b.minZ));
  const ox = (160 - (b.maxX - b.minX) * s) / 2 - b.minX * s;
  const oy = (128 - (b.maxZ - b.minZ) * s) / 2 - b.minZ * s;
  return { s, ox, oy };
});
const mapCtx = $('mapc').getContext('2d');

// ---------- audio ----------
const SFX = {
  on: true, ctx: null, master: null, engGain: null, skidGain: null, oscA: null, oscB: null, err: null,
  init() {
    if (this.ctx) {
      // a later gesture can finish unlocking a context that started suspended
      if (this.ctx.state === 'suspended') this.ctx.resume().catch(() => {});
      return;
    }
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      const c = this.ctx = new AC();
      if (c.state === 'suspended') c.resume().catch(() => {}); // we're inside a gesture right now
      this.master = c.createGain(); this.master.gain.value = this.on ? 0.6 : 0;
      this.master.connect(c.destination);
      // engine: two detuned oscillators through a lowpass
      this.engGain = c.createGain(); this.engGain.gain.value = 0;
      const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 1100;
      this.oscA = c.createOscillator(); this.oscA.type = 'sawtooth';
      this.oscB = c.createOscillator(); this.oscB.type = 'square';
      this.oscA.connect(lp); this.oscB.connect(lp);
      lp.connect(this.engGain); this.engGain.connect(this.master);
      this.oscA.start(); this.oscB.start();
      // skid: looping filtered noise
      const buf = c.createBuffer(1, c.sampleRate * 2, c.sampleRate);
      const d = buf.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
      const src = c.createBufferSource(); src.buffer = buf; src.loop = true;
      const bp = c.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 950; bp.Q.value = 0.8;
      this.skidGain = c.createGain(); this.skidGain.gain.value = 0;
      src.connect(bp); bp.connect(this.skidGain); this.skidGain.connect(this.master);
      src.start();
      if (c.state !== 'running') c.resume().catch(() => {}); // belt and braces
    } catch (e) {
      this.err = String((e && e.message) || e || 'unknown');
      this.ctx = null;
      console.warn('audio unavailable', e);
    }
  },
  status() {
    if (this.err) return 'FAILED: ' + this.err;
    if (!this.ctx) return 'not started';
    const st = this.ctx.state;
    return st === 'running' ? 'running @' + Math.round(this.ctx.sampleRate / 100) / 10 + 'kHz' : st.toUpperCase();
  },
  setOn(v) {
    this.on = v;
    if (this.master) this.master.gain.value = v ? 0.6 : 0;
    if (v) this.beep(660, 0.12); // audible proof the audio path is alive
  },
  beep(freq, dur = 0.15) {
    if (!this.ctx || !this.on) return;
    try {
      const c = this.ctx, t = c.currentTime;
      const o = c.createOscillator(), g = c.createGain();
      o.type = 'triangle'; o.frequency.value = freq;
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.3, t + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      o.connect(g); g.connect(this.master);
      o.start(t); o.stop(t + dur + 0.05);
    } catch (e) { /* ignore */ }
  },
  update(rpm01, load, slip, driving) {
    if (!this.ctx || !this.on) return;
    if (this.ctx.state === 'suspended') this.ctx.resume().catch(() => {});
    const f = 48 + 300 * rpm01 + (driving ? 40 : 0);
    this.oscA.frequency.value = f;
    this.oscB.frequency.value = f * 0.5 + 3;
    this.engGain.gain.value = driving ? 0.05 + 0.055 * load + 0.04 * rpm01 : 0;
    this.skidGain.gain.value = driving ? Math.min(0.22, slip * 0.04) : 0;
  },
};
addEventListener('pointerdown', () => SFX.init()); // clicks also unlock audio
window.SFX = SFX; // console debug handle

// the #aud chip (index.html) mirrors the real AudioContext state so we can
// diagnose "no sound" without a devtools console; clicking it force-unlocks
// and plays a test beep
const audEl = document.getElementById('aud');
function audioChip() {
  if (!audEl) return;
  const healthy = !SFX.err && SFX.ctx && SFX.ctx.state === 'running';
  audEl.style.display = healthy ? 'none' : ''; // quiet when all is well
  audEl.textContent = '♪ ' + SFX.status();
  audEl.className = SFX.err ? 'err' : 'warn';
}
if (audEl) audEl.addEventListener('pointerdown', e => {
  e.stopPropagation();
  SFX.init();
  if (SFX.ctx) SFX.ctx.resume().catch(() => {});
  SFX.on = true;
  if (SFX.master) SFX.master.gain.value = 0.6;
  audioChip();
  setTimeout(() => SFX.beep(880, 0.25), 150); // let resume() settle first
});

// ---------- music: one 60s seamless loop per circuit ----------
// Rendered offline (audio/<song>.wav, see the compose notes in git-free repo
// history); looped through a gain into SFX.master so the M mute covers it.
const TRACK_SONGS = ['grunering', 'sakura', 'autodromo']; // index-aligned with TRACKS
const MUSIC = {
  src: null, gain: null, song: null, want: null, cache: {},
  level() {
    if (state === 'race' || state === 'countdown') return 0.5;
    if (state === 'result' || state === 'paused') return 0.34;
    return 0.22; // title/cars/track menus
  },
  setTrack(i) { this.playSong(TRACK_SONGS[i]); },
  async playSong(name) {
    if (name === this.want) { if (!this.src) this.start(name); return; }
    this.want = name;
    if (!SFX.ctx) SFX.init();
    if (SFX.ctx) SFX.ctx.resume().catch(() => {});
    if (!SFX.ctx) return;
    try {
      let buf = this.cache[name];
      if (!buf) {
        const r = await fetch('audio/' + name + '.wav');
        if (!r.ok) throw new Error('http ' + r.status);
        buf = await SFX.ctx.decodeAudioData(await r.arrayBuffer());
        this.cache[name] = buf;
      }
      if (this.want !== name) return; // a newer selection won the race
      this.start(name, buf);
    } catch (e) { console.warn('music unavailable', e); }
  },
  start(name, buf) {
    buf = buf || this.cache[name];
    if (!buf || !SFX.ctx) return;
    const c = SFX.ctx, t = c.currentTime;
    if (this.gain) { // crossfade the outgoing track
      const g = this.gain, s = this.src;
      g.gain.cancelScheduledValues(t);
      g.gain.setValueAtTime(g.gain.value, t);
      g.gain.linearRampToValueAtTime(0, t + 0.8);
      setTimeout(() => { try { s.stop(); } catch (e) { /* already done */ } }, 950);
    }
    const g = c.createGain(); g.gain.value = 0;
    const s = c.createBufferSource(); s.buffer = buf; s.loop = true;
    s.connect(g); g.connect(SFX.master);
    s.start();
    g.gain.linearRampToValueAtTime(this.level(), t + 1.5);
    this.gain = g; this.src = s; this.song = name;
  },
  setLevel() {
    if (!this.gain || !SFX.ctx) return;
    const g = this.gain, t = SFX.ctx.currentTime;
    g.gain.cancelScheduledValues(t);
    g.gain.setValueAtTime(g.gain.value, t);
    g.gain.linearRampToValueAtTime(this.level(), t + 0.6);
  },
};

// ---------- track records & ghosts (time attack) ----------
// A record is the player's fastest TT lap plus a frame-by-frame replay of the
// whole run that produced it (grid launch included), sampled every 1/60 s —
// the same clock raceT runs on, so playback is exact and the live delta can be
// derived from progress: "when did the ghost pass where you are now?".
// Quantized ints keep localStorage small (positions 6.25cm, heading ~0.35°).
const recs = new Array(tracks.length).fill(undefined); // undefined = not loaded yet
function loadRec(i) {
  if (recs[i] !== undefined) return recs[i];
  let r = null;
  try {
    const s = localStorage.getItem('vgt.rec.' + i);
    if (s) { const o = JSON.parse(s); if (o && Array.isArray(o.f) && o.f.length >= 15 && isFinite(o.lap)) r = decodeRec(o); }
  } catch (e) { /* private mode / bad data: records just don't exist */ }
  recs[i] = r;
  return r;
}
function saveRec(i, raw) {
  try {
    if (raw) localStorage.setItem('vgt.rec.' + i, JSON.stringify(raw));
    else localStorage.removeItem('vgt.rec.' + i);
  } catch (e) { console.warn('record not saved (quota?)', e); }
  recs[i] = raw ? decodeRec(raw) : null;
}

// ---------- input ----------
const keys = {};
addEventListener('keydown', e => {
  const k = e.key.toLowerCase();
  if ([' ', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright'].includes(e.key.toLowerCase()) || e.key === ' ') e.preventDefault();
  if (!keys[k]) onKey(e.key.toLowerCase(), e);
  keys[k] = true;
});
addEventListener('keyup', e => { keys[e.key.toLowerCase()] = false; });

// ---------- game state ----------
let state = 'title';
let carSel = 0, trkSel = 0, mode = 'race';
let viewRoot = null;
let racers = [], player = null, raceRoot = null;
let raceT = 0, countdownT = 0, camMode = 0, bigTimer = 0;
let ghost = null, recF = [], recBeaten = false;
const TOTAL_LAPS = 3;
const camPos = new THREE.Vector3(0, 30, 80);
const camLook = new THREE.Vector3();

function setView(v) {
  if (viewRoot) scene.remove(viewRoot);
  if (v === 'garage') {
    scene.background = new THREE.Color(0x11151c);
    scene.fog = new THREE.Fog(0x11151c, 40, 160);
    if (turntable.userData.mesh) { turntable.remove(turntable.userData.mesh); }
    const m = buildCarMesh(CARS[carSel]);
    turntable.add(m); turntable.userData.mesh = m;
    viewRoot = garageRoot;
  } else if (v === 'preview') {
    const T = tracks[trkSel];
    scene.background = new THREE.Color(T.def.sky);
    scene.fog = new THREE.Fog(T.def.fog, 220, 1300);
    trackRoots[trkSel].add(T.group); // steal back from whatever root held it
    viewRoot = trackRoots[trkSel];
  } else if (v === 'race') {
    const T = tracks[trkSel];
    scene.background = new THREE.Color(T.def.sky);
    scene.fog = new THREE.Fog(T.def.fog, 300, 1700);
    raceRoot.add(T.group);
    viewRoot = raceRoot;
  }
  scene.add(viewRoot);
}

function showMenu(id) {
  for (const m of ['menuTitle', 'menuCars', 'menuTrack', 'menuResult'])
    $(m).classList.toggle('on', m === id);
  $('ui').classList.toggle('on', !!id);
  $('hud').classList.toggle('on', !id);
}

function msg(txt, dur = 1.2) {
  const el = $('bigmsg');
  el.textContent = txt;
  el.classList.add('on');
  bigTimer = dur;
}

// ---------- menus ----------
const statRange = {};
for (const s of ['power', 'vmax', 'grip', 'brake', 'steer']) {
  statRange[s] = [Math.min(...CARS.map(c => c.stats[s])), Math.max(...CARS.map(c => c.stats[s]))];
}
function fillCarMenu() {
  const car = CARS[carSel];
  $('carSelN').textContent = `${carSel + 1}/${CARS.length}`;
  const bar = (k, label) => {
    const [lo, hi] = statRange[k];
    const pc = Math.round((car.stats[k] - lo) / (hi - lo) * 100);
    return `<div class="stat">${label}</div><div class="bar"><i style="width:${18 + pc * 0.82}%"></i></div>`;
  };
  $('carInfo').innerHTML =
    `<h2>${car.brand} ${car.name}</h2><div class="insp">${car.insp}</div>` +
    `<div class="blurb">${car.blurb}</div>` +
    bar('power', 'POWER') + bar('vmax', 'TOP SPEED') + bar('grip', 'GRIP') +
    bar('brake', 'BRAKES') + bar('steer', 'STEERING');
  document.querySelectorAll('.carChip').forEach((el, i) => el.classList.toggle('on', i === carSel));
}
function buildCarStrip() {
  const strip = $('carStrip');
  strip.innerHTML = '';
  CARS.forEach((c, i) => {
    const d = document.createElement('div');
    d.className = 'carChip';
    d.innerHTML = `<div class="sw" style="background:${c.swatch}"></div><div class="nm">${c.name}</div><div class="br">${c.brand}</div>`;
    d.addEventListener('click', () => { carSel = i; fillCarMenu(); if (state === 'cars') setView('garage'); });
    strip.appendChild(d);
  });
}
function trackFacts(T) {
  let corners = 0, straight = 0, run = 0, minR = 1e9;
  for (let i = 0; i < T.N; i++) {
    const r = T.S.R[i];
    if (r < minR) minR = r;
    if (r < 100 && r <= T.S.R[(i + T.N - 1) % T.N] && r <= T.S.R[(i + 1) % T.N]) corners++;
    run = r > 1200 ? run + DS : 0;
    if (run > straight) straight = run;
  }
  return `Length <span>${(T.totalLen / 1000).toFixed(2)} km</span><br>` +
    `Longest straight <span>${(straight / 1000).toFixed(2)} km</span><br>` +
    `Corners <span>${corners}</span> · Tightest <span>${Math.round(minR)} m</span>`;
}
function buildTrackStrip() {
  const strip = $('trackStrip');
  strip.innerHTML = '';
  tracks.forEach((T, i) => {
    const d = document.createElement('div');
    d.className = 'trackCard';
    const rec = loadRec(i);
    const car = rec && CARS.find(c => c.id === rec.car);
    const recTxt = rec
      ? `RECORD <span>${fmt(rec.lap)}</span> · ${car ? car.name : '?'} · ${new Date(rec.d).toISOString().slice(0, 10)}`
      : 'RECORD <span>— none yet</span>';
    d.innerHTML = `<h3>${T.def.name}</h3><div class="insp">${T.def.insp}</div>` +
      `<div class="facts">${trackFacts(T)}</div><div class="insp" style="margin-top:8px">${T.def.blurb}</div>` +
      `<div class="facts" style="margin-top:8px">${recTxt}</div>`;
    strip.appendChild(d);
  });
}
function fillTrackMenu() {
  $('trkSelN').textContent = `${trkSel + 1}/${tracks.length}`;
  document.querySelectorAll('.trackCard').forEach((el, i) => el.classList.toggle('on', i === trkSel));
  $('modeRace').classList.toggle('on', mode === 'race');
  $('modeTT').classList.toggle('on', mode === 'tt');
  $('clearRec').style.display = (mode === 'tt' && loadRec(trkSel)) ? '' : 'none';
}
buildCarStrip();
buildTrackStrip();
fillCarMenu();
fillTrackMenu();

$('modeRace').addEventListener('click', () => { mode = 'race'; fillTrackMenu(); });
$('modeTT').addEventListener('click', () => { mode = 'tt'; fillTrackMenu(); });
$('clearRec').addEventListener('click', () => {
  saveRec(trkSel, null);
  buildTrackStrip(); fillTrackMenu();
  msg('RECORD CLEARED', 1.4);
});
$('goBtn').addEventListener('click', startRace);
$('againBtn').addEventListener('click', startRace);
$('menuBtn').addEventListener('click', gotoTitle);

function gotoTitle() {
  state = 'title';
  showMenu('menuTitle');
  setView('preview');
}

// ---------- race lifecycle ----------
function startRace() {
  const T = tracks[trkSel];
  if (raceRoot) scene.remove(raceRoot);
  raceRoot = new THREE.Group();
  raceRoot.add(T.group);

  racers = [];
  const others = CARS.filter((_, i) => i !== carSel);
  const gridN = mode === 'race' ? CARS.length : 1; // you + every other car = 5
  const aiCars = others.slice(0, gridN - 1);
  for (let slot = 0; slot < gridN; slot++) {
    const isPlayer = mode === 'tt' || slot === gridN - 1;
    const carDef = isPlayer ? CARS[carSel] : aiCars[slot];
    const c = makeRacer(carDef, T, slot, isPlayer);
    if (isPlayer) player = c;
    if (mode === 'race') c.skill = 1.0 - (slot >> 1) * 0.03;
    c.mesh = buildCarMesh(carDef);
    raceRoot.add(c.mesh);
    racers.push(c);
  }

  // time-attack ghost: a translucent replay of the saved record run
  ghost = null; recF = []; recBeaten = false;
  if (mode === 'tt') {
    const rec = loadRec(trkSel);
    if (rec) {
      const gd = CARS.find(c => c.id === rec.car) || CARS[carSel];
      const m = buildCarMesh(gd);
      m.traverse(o => {
        if (o.isMesh) {
          const mt = o.material.clone();
          mt.transparent = true; mt.opacity = 0.35; mt.depthWrite = false;
          o.material = mt;
        }
      });
      m.visible = false;
      raceRoot.add(m);
      ghost = { mesh: m, rec, delta: null };
    }
  }

  raceT = 0; countdownT = 0;
  state = 'countdown';
  showMenu(null);
  setView('race');
  const p = player;
  camPos.set(p.x - Math.cos(p.h) * 14, p.y + 6, p.z - Math.sin(p.h) * 14);
  MUSIC.setTrack(trkSel); // in case we jumped straight in (RETRY from results)
  msg('3', 0.9);
}

function finishRace() {
  state = 'result';
  showMenu('menuResult');
  const T = tracks[trkSel];
  const rows = [];
  if (mode === 'tt') {
    $('resTitle').textContent = recBeaten ? `NEW RECORD — ${T.def.name}` : `TIME ATTACK — ${T.def.name}`;
    player.laps.forEach((l, i) => rows.push(`<div class="row"><span>LAP ${i + 1}</span><span>${fmt(l)}</span></div>`));
    rows.push(`<div class="row"><span class="p1">BEST LAP</span><span class="p1">${fmt(player.best)}</span></div>`);
    const rec = loadRec(trkSel);
    if (rec) rows.push(`<div class="row"><span>TRACK RECORD</span><span>${fmt(rec.lap)}</span></div>`);
    $('resultRows').innerHTML = rows.join('');
  } else {
    const order = [...racers].sort((a, b) => {
      if (a.finished && b.finished) return a.finishTime - b.finishTime;
      if (a.finished) return -1;
      if (b.finished) return 1;
      return b.prog - a.prog;
    });
    const ppos = order.indexOf(player) + 1;
    $('resTitle').textContent = ppos === 1 ? 'VICTORY!' : `RACE COMPLETE — P${ppos}`;
    order.forEach((c, i) => {
      const t = c.finished ? fmt(c.finishTime) : `${Math.floor(c.prog / T.N)} laps`;
      const cls = c === player ? ' class="p1"' : '';
      rows.push(`<div class="row"><span${cls}>P${i + 1} ${c.car.brand} ${c.car.name}${c === player ? ' (you)' : ''}</span><span${cls}>${t}</span></div>`);
    });
    rows.push(`<div class="row"><span class="p1">BEST LAP</span><span class="p1">${fmt(player.best)}</span></div>`);
    $('resultRows').innerHTML = rows.join('');
  }
}
function fmt(t) {
  if (!isFinite(t)) return '--:--.---';
  const m = Math.floor(t / 60), s = t - m * 60;
  return `${m}:${s < 10 ? '0' : ''}${s.toFixed(3)}`;
}

// ---------- keys ----------
function onKey(k, e) {
  SFX.init();
  if (k === 'm') { SFX.setOn(!SFX.on); msg(SFX.on ? ('♪ SOUND ON · ' + SFX.status()) : '♪ MUTED', 1.6); return; }
  if (state === 'title') {
    if (k === 'enter') { state = 'cars'; showMenu('menuCars'); setView('garage'); }
  } else if (state === 'cars') {
    if (k === 'arrowleft' || k === 'a') { carSel = (carSel + CARS.length - 1) % CARS.length; fillCarMenu(); setView('garage'); }
    else if (k === 'arrowright' || k === 'd') { carSel = (carSel + 1) % CARS.length; fillCarMenu(); setView('garage'); }
    else if (k === 'enter') { state = 'track'; showMenu('menuTrack'); setView('preview'); MUSIC.setTrack(trkSel); }
    else if (k === 'escape') gotoTitle();
  } else if (state === 'track') {
    if (k === 'arrowleft' || k === 'a') { trkSel = (trkSel + tracks.length - 1) % tracks.length; fillTrackMenu(); setView('preview'); MUSIC.setTrack(trkSel); }
    else if (k === 'arrowright' || k === 'd') { trkSel = (trkSel + 1) % tracks.length; fillTrackMenu(); setView('preview'); MUSIC.setTrack(trkSel); }
    else if (k === 'enter') startRace();
    else if (k === 'escape') { state = 'cars'; showMenu('menuCars'); setView('garage'); }
  } else if (state === 'race') {
    if (k === 'escape') { state = 'paused'; msg('PAUSED · ESC resume · Q quit', 99); }
    else if (k === 'c') camMode = (camMode + 1) % 3;
    else if (k === 'r') resetToTrack(player, tracks[trkSel]);
  } else if (state === 'paused') {
    if (k === 'escape') { state = 'race'; $('bigmsg').classList.remove('on'); }
    else if (k === 'q') gotoTitle();
  } else if (state === 'result') {
    if (k === 'enter') startRace();
    else if (k === 'escape') gotoTitle();
  }
}

// ---------- race update ----------
function raceInputs() {
  const steer = (keys.a || keys.arrowleft ? -1 : 0) + (keys.d || keys.arrowright ? 1 : 0);
  return {
    throttle: keys.w || keys.arrowup ? 1 : 0,
    brake: keys.s || keys.arrowdown ? 1 : 0,
    steer,
    hand: !!keys[' '],
  };
}

let simAcc = 0;
function updateRace(dt) {
  const T = tracks[trkSel];
  // rubber band
  for (const c of racers) {
    if (c.isPlayer || mode === 'tt') continue;
    const base = 1.0 - (racers.indexOf(c) >> 1) * 0.03; // front of grid is quickest
    const gapM = (player.prog - c.prog) * DS;
    c.skill = base * (gapM > 300 ? 1.07 : gapM < -300 ? 0.94 : 1);
  }
  simAcc += dt;
  const STEP = 1 / 60;
  let steps = 0;
  while (simAcc >= STEP && steps < 5) {
    simAcc -= STEP; steps++;
    raceT += STEP;
    for (const c of racers) {
      const inp = c.isPlayer ? raceInputs() : aiInput(c, T);
      c.steerVis = inp.steer;
      const lapDone = stepCar(c, inp, T, STEP, raceT);
      if (c.isPlayer && mode === 'tt') quantizeFrame(c, recF, T); // ghost footage
      if (lapDone && !c.isPlayer && !c.finished) {
        if (c.lap >= TOTAL_LAPS) { c.finished = true; c.finishTime = raceT; }
      }
      if (lapDone && c.isPlayer) {
        const recSet = mode === 'tt' && checkRecord();
        if (c.lap >= TOTAL_LAPS) {
          c.finished = true; c.finishTime = raceT;
          finishRace();
          return;
        } else if (mode === 'race') {
          msg(`LAP ${c.lap} · ${fmt(c.laps[c.laps.length - 1])}`, 1.4);
        } else if (!recSet) {
          msg(fmt(c.laps[c.laps.length - 1]), 1.4);
        }
      }
    }
    for (let i = 0; i < racers.length; i++)
      for (let j = i + 1; j < racers.length; j++)
        collideCars(racers[i], racers[j]);
  }

  // meshes
  for (const c of racers) {
    c.mesh.position.set(c.x, c.y, c.z);
    c.mesh.rotation.y = -c.h;
    const spin = c.speed / 0.42 * (1 / 60);
    for (let w = 0; w < 4; w++) {
      const wm = c.mesh.userData.wheels[w];
      wm.rotation.z += spin;
      if (w < 2) wm.rotation.y = (c.steerVis || 0) * 0.4;
    }
  }

  if (ghost) updateGhost(T);
  updateHUD(T);
  updateCamera(dt);
}

// called the step the player completes a lap in time attack
// returns true if this lap became the new track record
function checkRecord() {
  const lapT = player.laps[player.laps.length - 1];
  const old = loadRec(trkSel);
  if (old && lapT >= old.lap) return false;
  saveRec(trkSel, { lap: lapT, car: CARS[carSel].id, d: Date.now(), f: recF.slice(0) });
  recBeaten = true;
  msg('NEW TRACK RECORD ' + fmt(lapT), 2);
  return true;
}

function updateGhost(T) {
  const g = ghost, m = g.mesh;
  const p = playGhost(g.rec, raceT); // same raceT clock the player is on
  m.position.set(p.x, p.y, p.z);
  m.rotation.y = -p.h;
  const spin = p.speed / 0.42 * (1 / 60);
  for (let w = 0; w < 4; w++) m.userData.wheels[w].rotation.z += spin;
  m.visible = true;
  g.delta = ghostDelta(g.rec, arcPos(player, T), raceT).delta; // >0 = behind
}

function updateHUD(T) {
  const p = player;
  $('kmh').textContent = Math.round(p.speed * 3.6);
  const bands = [13, 24, 37, 50, 63, Infinity];
  let g = 0;
  while (g < 5 && p.speed > bands[g]) g++;
  const lo = g === 0 ? 0 : bands[g - 1];
  const hi = bands[g];
  const frac = clamp((p.speed - lo) / (hi - lo), 0, 1);
  $('gear').textContent = p.speed < 1 ? 'N' : String(g + 1);
  $('tachobar').style.width = `${Math.round((p.speed < 1 ? 0.08 : 0.12 + frac * 0.88) * 100)}%`;

  const order = [...racers].sort((a, b) => b.prog - a.prog);
  const pos = order.indexOf(p) + 1;
  $('posTxt').textContent = mode === 'tt' ? 'TT' : `P${pos}/${racers.length}`;
  $('lapTxt').textContent = `LAP ${Math.min(p.lap + 1, TOTAL_LAPS)}/${TOTAL_LAPS}`;
  $('curLap').textContent = fmt(raceT - p.lapStart);
  $('bestTxt').textContent = `BEST ${fmt(p.best)}`;
  const dEl = $('deltaTxt');
  if (mode === 'tt' && ghost) {
    const d = ghost.delta;
    dEl.textContent = d == null ? '' :
      'DELTA ' + (d >= 0 ? '+' : '−') + (Math.abs(d) < 60 ? Math.abs(d).toFixed(3) : fmt(Math.abs(d)));
    dEl.className = 'ghostline ' + (d == null ? '' : d >= 0 ? 'behind' : 'ahead');
  } else if (mode === 'tt') {
    dEl.textContent = 'NO RECORD — DRIVE A CLEAN LAP';
    dEl.className = 'ghostline';
  } else { dEl.textContent = ''; dEl.className = 'ghostline'; }
  SFX.update(p.speed < 1 ? 0.12 : 0.12 + frac * 0.85, keys.w || keys.arrowup ? 1 : 0, p.slip, true);
  drawMap(T, order);
}

function drawMap(T, order) {
  const g = mapCtx;
  const M = maps[trkSel];
  g.clearRect(0, 0, 160, 128);
  g.strokeStyle = '#dfe6ef88';
  g.lineWidth = 2.5;
  g.beginPath();
  const R = T.ring;
  for (let i = 0; i < R.length; i += 2) {
    const x = R[i] * M.s + M.ox, y = R[i + 1] * M.s + M.oy;
    if (i === 0) g.moveTo(x, y); else g.lineTo(x, y);
  }
  g.closePath();
  g.stroke();
  for (const c of order) {
    if (c === player) continue;
    g.fillStyle = '#9aa6b8';
    g.fillRect(c.x * M.s + M.ox - 1.5, c.z * M.s + M.oy - 1.5, 3, 3);
  }
  if (ghost && ghost.mesh.visible) {
    g.fillStyle = '#5fd0e0';
    g.fillRect(ghost.mesh.position.x * M.s + M.ox - 1.5, ghost.mesh.position.z * M.s + M.oy - 1.5, 3, 3);
  }
  g.fillStyle = '#e8b83a';
  g.beginPath();
  g.arc(player.x * M.s + M.ox, player.z * M.s + M.oy, 3.2, 0, 7);
  g.fill();
}

function updateCamera(dt) {
  const p = player;
  const ch = Math.cos(p.h), sh = Math.sin(p.h);
  let tx, ty, tz, lx, ly, lz;
  if (camMode === 2) { // hood
    tx = p.x + ch * 0.4; ty = p.y + 2.3; tz = p.z + sh * 0.4;
    lx = p.x + ch * 30; ly = p.y + 1.6; lz = p.z + sh * 30;
  } else if (camMode === 1) { // far chase
    tx = p.x - ch * 22; ty = p.y + 10; tz = p.z - sh * 22;
    lx = p.x + ch * 10; ly = p.y + 2; lz = p.z + sh * 10;
  } else { // chase
    tx = p.x - ch * 13; ty = p.y + 5.2; tz = p.z - sh * 13;
    lx = p.x + ch * 8; ly = p.y + 1.6; lz = p.z + sh * 8;
  }
  const k = camMode === 2 ? 1 : Math.min(1, dt * 5.5);
  camPos.x += (tx - camPos.x) * k;
  camPos.y += (ty - camPos.y) * k;
  camPos.z += (tz - camPos.z) * k;
  cam.position.copy(camPos);
  camLook.lerp(new THREE.Vector3(lx, ly, lz), Math.min(1, dt * 8));
  cam.lookAt(camLook);
}

// ---------- menus / preview updates ----------
let previewA = 0.7;
function updatePreview(dt) {
  if (viewRoot === garageRoot) {
    turntable.rotation.y += dt * 0.5;
    cam.position.set(8.5, 3.4, 8.5);
    cam.lookAt(0, 1.3, 0);
  } else {
    const b = tracks[trkSel].bounds;
    previewA += dt * 0.08;
    const r = b.r * 0.5 + 60;
    cam.position.set(b.cx + Math.cos(previewA) * r, b.r * 0.34 + 45, b.cz + Math.sin(previewA) * r);
    cam.lookAt(b.cx, 8, b.cz);
  }
}

// ---------- main loop ----------
let last = performance.now();
let audT = 0;
let lastState = state;
function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  audT -= dt;
  if (audT <= 0) { audioChip(); audT = 0.5; } // keep the status chip current
  if (state !== lastState) { lastState = state; MUSIC.setLevel(); } // duck/lift music per screen

  if (bigTimer > 0) {
    bigTimer -= dt;
    if (bigTimer <= 0) $('bigmsg').classList.remove('on');
  }

  if (state === 'countdown') {
    countdownT += dt;
    const n = 3 - Math.floor(countdownT);
    const el = $('bigmsg');
    if (n >= 1) {
      if (el.textContent !== String(n)) { el.textContent = String(n); SFX.beep(520, 0.14); }
      el.classList.add('on');
      bigTimer = 0.5;
    } else if (countdownT < 3.8) {
      if (el.textContent !== 'GO!') { el.textContent = 'GO!'; el.classList.add('on'); bigTimer = 0.6; SFX.beep(1040, 0.4); }
    } else {
      el.classList.remove('on');
      state = 'race';
      for (const c of racers) c.lapStart = 0;
      raceT = 0; simAcc = 0;
    }
    SFX.update(0.18, 0, 0, true); // idling engine through the countdown
    updateCamera(dt);
  } else if (state === 'race') {
    updateRace(dt);
  } else if (state === 'paused' || state === 'result') {
    SFX.update(0.1, 0, 0, false);
    // frozen camera stays on the scene
  } else {
    SFX.update(0.1, 0, 0, state === 'cars');
    updatePreview(dt);
  }
  renderer.render(scene, cam);
}

// debug hook: run VGT.debug() in the F12 console to inspect game/record state
window.VGT = {
  debug() {
    const st = { state, mode, trkSel, carSel, ghost: ghost ? 'live' : 'none', localStorage: 'unknown' };
    try { localStorage.setItem('vgt.probe', '1'); localStorage.removeItem('vgt.probe'); st.localStorage = 'OK'; }
    catch (e) { st.localStorage = 'BLOCKED: ' + e.name; }
    st.records = recs.map((_, i) => { const r = loadRec(i); return r ? `${fmt(r.lap)} by ${r.car}` : 'none'; });
    console.log(st);
    return st;
  },
};

gotoTitle();
requestAnimationFrame(frame);
