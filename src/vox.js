// Voxel geometry helper: collects colored boxes and merges them into one
// BufferGeometry with baked vertex colors (chunky lit-voxel look).
import * as THREE from 'three';

function hash3(x, y, z) {
  let h = x * 374761393 + y * 668265263 + z * 2147483647;
  h = (h ^ (h >> 13)) * 1274126177;
  h = h ^ (h >> 16);
  return ((h & 0xffff) / 0xffff - 0.5); // -0.5..0.5
}

export class Vox {
  constructor() {
    this.pos = []; this.col = []; this.idx = [];
    this.count = 0;
  }
  // box centered at (x,y,z), size (w,h,d); top face sits at y + h/2
  box(x, y, z, w, h, d, color, opts = {}) {
    const c = new THREE.Color(color);
    if (opts.jitter) {
      const j = opts.jitter * hash3(Math.round(x * 3), Math.round(y * 3), Math.round(z * 3));
      c.offsetHSL(0, 0, j);
    }
    const hw = w / 2, hh = h / 2, hd = d / 2;
    const r = c.r, g = c.g, b = c.b;
    const i = this.count;
    // faces: +x,-x,+y,-y,+z,-z with baked face shading so voxels read even flat
    const V = [
      [x+hw,y-hh,z+hd,1.02],[x+hw,y-hh,z-hd,1.02],[x+hw,y+hh,z-hd,1.02],[x+hw,y+hh,z+hd,1.02],
      [x-hw,y-hh,z-hd,0.78],[x-hw,y-hh,z+hd,0.78],[x-hw,y+hh,z+hd,0.78],[x-hw,y+hh,z-hd,0.78],
      [x-hw,y+hh,z+hd,1.14],[x-hw,y+hh,z-hd,1.14],[x+hw,y+hh,z-hd,1.14],[x+hw,y+hh,z+hd,1.14],
      [x-hw,y-hh,z-hd,0.5],[x-hw,y-hh,z+hd,0.5],[x+hw,y-hh,z+hd,0.5],[x+hw,y-hh,z-hd,0.5],
      [x-hw,y-hh,z+hd,0.92],[x+hw,y-hh,z+hd,0.92],[x+hw,y+hh,z+hd,0.92],[x-hw,y+hh,z+hd,0.92],
      [x+hw,y-hh,z-hd,0.68],[x-hw,y-hh,z-hd,0.68],[x-hw,y+hh,z-hd,0.68],[x+hw,y+hh,z-hd,0.68],
    ];
    for (let f = 0; f < 6; f++) {
      const base = i + f * 4;
      for (let v = 0; v < 4; v++) {
        const p = V[f * 4 + v];
        this.pos.push(p[0], p[1], p[2]);
        const s = p[3];
        this.col.push(r * s, g * s, b * s);
      }
      this.idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
    }
    this.count += 24;
  }
  get empty() { return this.count === 0; }
  geometry() {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.col, 3));
    g.setIndex(this.idx);
    g.computeBoundingSphere();
    return g;
  }
}

export function voxMaterial() {
  return new THREE.MeshLambertMaterial({ vertexColors: true });
}

// ---- car box list: cars are authored as [x,y,z,w,h,d,color] in a local
// voxel unit CU; front of the car faces +x, up is +y, origin at ground center.
export function buildCarGeo(boxes) {
  const vx = new Vox();
  for (const [x, y, z, w, h, d, col] of boxes) {
    vx.box(x, y, z, w, h, d, col);
  }
  return vx.geometry();
}
