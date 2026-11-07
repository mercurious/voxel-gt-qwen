// Five cars, each a voxel tribute to a real-world icon. Boxes are authored on
// a CU=0.28m voxel grid: [x, y, z, w, h, d, color]; +x = front, +y = up.
import * as THREE from 'three';
import { Vox, voxMaterial } from './vox.js';

export const CU = 0.28;

const DARK = 0x181b20, GLASS = 0x12161d, LAMP = 0xf2f5f8, TAIL = 0xe03030,
      RIM = 0x9aa2aa, TIRE = 0x14161a;

export const CARS = [
  {
    id: 'n44',
    brand: 'N4 MOTORS', name: 'R44 GRAN TURBO',
    insp: 'Inspired by the Nissan Skyline GT-R (R34)',
    blurb: 'All-wheel-drive homely rocket. Absorbs kerbs, drags everyone to fourth gear.',
    color: 0x2f66c8, swatch: '#2f66c8',
    stats: { power: 7.6, vmax: 78, grip: 9.6, brake: 15.2, steer: 0.56 },
    wheels: [[5.2, 3.4], [5.2, -3.4], [-5.2, 3.4], [-5.2, -3.4]],
    boxes: [
      [0, 2.2, 0, 17, 3.4, 6.6, 0x2f66c8],
      [0, 4.4, 0, 13, 1.4, 6.2, 0x2f66c8],
      [-0.6, 6.1, 0, 8.4, 2.2, 5.4, GLASS],
      [-0.6, 7.5, 0, 6.8, 0.8, 5.0, 0x2f66c8],
      [7.8, 2.7, 0, 1.8, 2.4, 6.4, 0x2f66c8],
      [8.2, 2.0, 0, 1.2, 1.6, 3.6, 0x0c0e11],
      [7.9, 3.6, 2.0, 1.2, 1.2, 1.6, LAMP],
      [7.9, 3.6, -2.0, 1.2, 1.2, 1.6, LAMP],
      [5.4, 5.3, 0, 3, 0.6, 2.6, DARK],
      [-8.2, 3.2, 0, 1.4, 3, 6.2, 0x2f66c8],
      [-8.7, 3.7, 2.2, 0.8, 1.2, 1.6, TAIL],
      [-8.7, 3.7, -2.2, 0.8, 1.2, 1.6, TAIL],
      [-7.5, 6.7, 0, 2.2, 0.6, 6.0, DARK],
      [-7.3, 5.7, 2.2, 0.6, 1.6, 0.6, DARK],
      [-7.3, 5.7, -2.2, 0.6, 1.6, 0.6, DARK],
      [2.4, 5.7, 3.4, 1.2, 0.8, 0.8, DARK],
      [2.4, 5.7, -3.4, 1.2, 0.8, 0.8, DARK],
      [0, 1.2, 3.3, 10, 0.8, 0.7, DARK],
      [0, 1.2, -3.3, 10, 0.8, 0.7, DARK],
    ],
  },
  {
    id: 'p934',
    brand: 'STUTTGART WERKE', name: '934 SPORT',
    insp: 'Inspired by the Porsche 911 Carrera RS / GT3',
    blurb: 'Rear-engined ballet slipper. Teases your grip on every exit — and forgives none.',
    color: 0xece9e2, swatch: '#ece9e2',
    stats: { power: 7.0, vmax: 76, grip: 10.6, brake: 16, steer: 0.62 },
    wheels: [[4.9, 3.3], [4.9, -3.3], [-4.9, 3.3], [-4.9, -3.3]],
    boxes: [
      [0, 2.1, 0, 15.5, 3.0, 6.2, 0xece9e2],
      [6.4, 2.7, 0, 3.4, 2.4, 5.2, 0xece9e2],
      [4.8, 3.9, 0, 3.6, 1.6, 5.6, 0xece9e2],
      [-0.4, 5.6, 0, 6.6, 3.2, 5.0, GLASS],
      [-0.4, 7.2, 0, 5.4, 0.7, 4.6, 0xece9e2],
      [-5.6, 5.1, 0, 5.2, 1.8, 5.6, 0xece9e2],
      [-8.1, 6.2, 0, 1.4, 0.6, 5.6, 0xc0272d],
      [5.2, 4.6, 0, 3.4, 0.4, 1.6, 0xc0272d],
      [-0.4, 7.6, 0, 5.2, 0.4, 1.4, 0xc0272d],
      [-5.6, 6.1, 0, 5.0, 0.4, 1.6, 0xc0272d],
      [7.2, 3.4, 1.9, 1.0, 1.2, 1.6, LAMP],
      [7.2, 3.4, -1.9, 1.0, 1.2, 1.6, LAMP],
      [-7.9, 3.7, 2.0, 0.8, 1.0, 2.0, TAIL],
      [-7.9, 3.7, -2.0, 0.8, 1.0, 2.0, TAIL],
      [1.0, 1.3, 3.1, 9, 0.8, 0.7, DARK],
      [1.0, 1.3, -3.1, 9, 0.8, 0.7, DARK],
      [2.6, 5.4, 3.3, 1.2, 0.8, 0.8, DARK],
      [2.6, 5.4, -3.3, 1.2, 0.8, 0.8, DARK],
    ],
  },
  {
    id: 'a80',
    brand: 'TRUENO MOTOR WORKS', name: 'A80 THUNDER',
    insp: 'Inspired by the Toyota Supra Mk IV (A80)',
    blurb: 'Boosted 2JZ-energy legend. Spools late, then throws torque at the rear like a dare.',
    color: 0xe0782a, swatch: '#e0782a',
    stats: { power: 8.2, vmax: 74, grip: 8.4, brake: 14, steer: 0.58 },
    wheels: [[5.5, 3.4], [5.5, -3.4], [-5.5, 3.4], [-5.5, -3.4]],
    boxes: [
      [0, 2.3, 0, 17.5, 3.4, 6.6, 0xe0782a],
      [6.6, 4.5, 0, 4.8, 1.6, 5.8, 0xe0782a],
      [8.4, 2.8, 0, 1.6, 2.2, 5.4, 0xe0782a],
      [-1.4, 6.1, 0, 7.4, 2.6, 5.2, GLASS],
      [-1.4, 7.4, 0, 6.0, 0.8, 5.0, DARK],
      [-7.4, 6.8, 0, 2.8, 0.7, 6.4, DARK],
      [-7.2, 5.8, 2.2, 0.6, 1.6, 0.6, DARK],
      [-7.2, 5.8, -2.2, 0.6, 1.6, 0.6, DARK],
      [7.4, 5.3, 2.2, 1.4, 1.1, 1.5, LAMP],
      [7.4, 5.3, -2.2, 1.4, 1.1, 1.5, LAMP],
      [-8.5, 3.4, 2.2, 0.8, 1.2, 1.8, TAIL],
      [-8.5, 3.4, -2.2, 0.8, 1.2, 1.8, TAIL],
      [-8.8, 2.6, 0, 1.0, 2.0, 5.0, DARK],
      [1.5, 1.4, 3.3, 11, 0.8, 0.7, DARK],
      [1.5, 1.4, -3.3, 11, 0.8, 0.7, DARK],
      [2.5, 5.8, 3.5, 1.2, 0.8, 0.8, DARK],
      [2.5, 5.8, -3.5, 1.2, 0.8, 0.8, DARK],
    ],
  },
  {
    id: 'ct5',
    brand: 'LANGO', name: 'CT-5 CUNEO',
    insp: 'Inspired by the Lamborghini Countach LP400',
    blurb: 'A wedge with scissor attitude. Lazy steering, stratospheric top speed — a straight-line knife.',
    color: 0xe8c41c, swatch: '#e8c41c',
    stats: { power: 6.8, vmax: 84, grip: 7.8, brake: 13.5, steer: 0.5 },
    wheels: [[5.4, 3.5], [5.4, -3.5], [-5.4, 3.5], [-5.4, -3.5]],
    boxes: [
      [0, 1.7, 0, 17, 2.0, 6.6, DARK],
      [2.4, 3.2, 0, 11, 1.4, 6.4, 0xe8c41c],
      [7.6, 2.5, 0, 3, 1.4, 5.4, 0xe8c41c],
      [-1.6, 4.6, 0, 9, 1.4, 6.0, 0xe8c41c],
      [-1.6, 6.3, 0, 5.6, 2.0, 4.8, GLASS],
      [-6.2, 5.3, 0, 5, 1.2, 5.6, 0xe8c41c],
      [-7.6, 7.2, 0, 2.6, 0.6, 6.8, DARK],
      [-7.4, 6.2, 2.6, 0.6, 1.6, 0.6, DARK],
      [-7.4, 6.2, -2.6, 0.6, 1.6, 0.6, DARK],
      [4.8, 5.2, 2.4, 1.2, 1.0, 1.4, LAMP],
      [4.8, 5.2, -2.4, 1.2, 1.0, 1.4, LAMP],
      [-8.4, 4.2, 0, 1.0, 1.6, 5.4, DARK],
      [-1.6, 3.9, 3.3, 7, 1.0, 0.4, DARK],
      [-1.6, 3.9, -3.3, 7, 1.0, 0.4, DARK],
      [-2.5, 2.6, 3.4, 5, 1.4, 0.5, DARK],
      [-2.5, 2.6, -3.4, 5, 1.4, 0.5, DARK],
    ],
  },
  {
    id: 'f40',
    brand: 'ROSSA & CO.', name: 'F-40 CORSA',
    insp: 'Inspired by the Ferrari F40',
    blurb: 'Twin-turbo red saint with a wing on its back. Twitchy, loud, and unbearably fast.',
    color: 0xc81f1f, swatch: '#c81f1f',
    stats: { power: 8.6, vmax: 81, grip: 9.0, brake: 15.5, steer: 0.6 },
    wheels: [[4.9, 3.4], [4.9, -3.4], [-4.9, 3.4], [-4.9, -3.4]],
    boxes: [
      [0, 2.1, 0, 16, 3.0, 6.2, 0xc81f1f],
      [6.6, 3.3, 0, 4.4, 1.6, 5.6, 0xc81f1f],
      [8.2, 2.5, 0, 1.6, 1.8, 5.0, 0xc81f1f],
      [-1, 5.7, 0, 6, 2.6, 4.9, GLASS],
      [-1, 7.1, 0, 4.8, 0.6, 4.4, 0xc81f1f],
      [-5.6, 4.9, 0, 6, 1.4, 5.8, 0xc81f1f],
      [-6.6, 5.3, 0, 2, 0.7, 3.6, DARK],
      [-7.8, 6.9, 0, 2.4, 0.6, 6.2, DARK],
      [-7.8, 7.5, 3.1, 2.4, 1.4, 0.4, DARK],
      [-7.8, 7.5, -3.1, 2.4, 1.4, 0.4, DARK],
      [7.6, 4.3, 2.0, 1.0, 1.2, 1.4, LAMP],
      [7.6, 4.3, -2.0, 1.0, 1.2, 1.4, LAMP],
      [-8.5, 3.6, 2.1, 0.8, 1.0, 1.4, TAIL],
      [-8.5, 3.6, -2.1, 0.8, 1.0, 1.4, TAIL],
      [4.8, 2.2, 3.2, 4, 2.4, 0.8, 0xa01818],
      [4.8, 2.2, -3.2, 4, 2.4, 0.8, 0xa01818],
      [-4.8, 2.2, 3.2, 4, 2.4, 0.8, 0xa01818],
      [-4.8, 2.2, -3.2, 4, 2.4, 0.8, 0xa01818],
      [1.6, 1.3, 3.2, 9, 0.8, 0.7, DARK],
      [1.6, 1.3, -3.2, 9, 0.8, 0.7, DARK],
    ],
  },
];

export function buildCarMesh(car) {
  const vx = new Vox();
  for (const [x, y, z, w, h, d, col] of car.boxes) {
    vx.box(x * CU, y * CU, z * CU, w * CU, h * CU, d * CU, col);
  }
  const body = new THREE.Mesh(vx.geometry(), voxMaterial());

  // wheels as a separate geometry per corner so they can spin
  const wv = new Vox();
  wv.box(0, 0, 0, 3 * CU, 3 * CU, 2.3 * CU, TIRE);
  wv.box(0, 0, 1.2 * CU, 2.2 * CU, 2.2 * CU, 0.35 * CU, RIM);
  wv.box(0, 0, -1.2 * CU, 2.2 * CU, 2.2 * CU, 0.35 * CU, RIM);
  const wheelGeo = wv.geometry();
  const wheelMat = voxMaterial();

  const g = new THREE.Group();
  g.add(body);
  const wheels = [];
  for (const [x, z] of car.wheels) {
    const wm = new THREE.Mesh(wheelGeo, wheelMat);
    wm.position.set(x * CU, 1.5 * CU, z * CU);
    g.add(wm);
    wheels.push(wm);
  }
  g.userData.wheels = wheels;
  // raise so tire bottom sits at y=0
  g.position.y = 0;
  return g;
}
