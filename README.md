# VOXEL GT

A browser racing game: Gran Turismo, one cube at a time. Three.js (vendored
r169) voxel renderer, hand-rolled arcade physics, five cars and three circuits
built entirely from axis-aligned boxes.

Run: `python3 -m http.server 8777` then open `http://localhost:8777/`.

## Contents
- `src/` — game modules: `main.js` (state machine, HUD, audio/music),
  `trackbuild.js` (spline → voxel road via grid-cell classification),
  `physics.js`, `cars.js`, `tracks.js`, `vox.js`, `ai` in physics.
- `audio/` — three 60-second seamless music loops, one per circuit,
  rendered by `tools/compose.py` (pure-Python synth; re-render with
  `python3 -I tools/compose.py audio`).
- `vendor/three.module.js` — Three.js r169, unmodified.

## A note on names
Every car and track is an original voxel design with a fictional name and an
explicit "Inspired by …" credit line in menus and source comments — a tribute,
not an impersonation. No trademarks, logos, or scans of real assets are used.

Controls: W/↑ throttle · S/↓ brake · A/D steer · SPACE handbrake · R reset ·
C camera · M sound · ESC menu.
