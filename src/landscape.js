/**
 * 功能：生成滨水步道、成组乔木、花坛以及沿赛道和坡面生长的草丛。
 * 时间：2026-11-21 | 作者：lq
 */
import * as T from 'three';
import { Batch, material, random } from './geometry.js';
import { BANK_Y, isLandmarkLot } from './cityscape.js';
import { distanceToCourse, EMBANKMENT, LAP, point, sample } from './course.js';

const box = new T.BoxGeometry();
const leafTints = [0x45633a, 0x506e38, 0x536f44, 0x637c41, 0x6f773b, 0x365a42];
const grassTints = [0x658346, 0x5b793b, 0x78834a, 0x8b8950, 0x567745];

// 功能：扰动共享树冠轮廓，并让冠底与叶梢形成明暗层次。时间：2026-11-21 | 作者：lq。
function foliageGeometry() {
  const geo = new T.IcosahedronGeometry(1, 1);
  const position = geo.getAttribute('position');
  const colors = [];
  for (let i = 0; i < position.count; i++) {
    const x = position.getX(i), y = position.getY(i), z = position.getZ(i);
    const bulge = 1 + 0.17 * Math.sin(x * 9.3 + y * 7.8) * Math.cos(z * 8.5 - y * 2.1);
    position.setXYZ(i, x * bulge, y * bulge, z * bulge);
    const light = 0.68 + (y + 1) * 0.21 + 0.06 * Math.sin(x * 7.8 + z * 4.1);
    colors.push(light * 0.96, light, light * 0.92);
  }
  geo.setAttribute('color', new T.Float32BufferAttribute(colors, 3));
  geo.computeVertexNormals();
  return geo;
}

// 功能：以带弧度的草叶组成单株几何，实例只改变大小、角度和颜色。时间：2026-11-21 | 作者：lq。
function grassGeometry() {
  const rng = random(118);
  const positions = [], colors = [], indices = [];
  for (let i = 0; i < 7; i++) {
    const angle = i * 2.39996;
    const dx = Math.cos(angle), dz = Math.sin(angle);
    const height = 0.3 + rng() * 0.54;
    const bend = 0.18 + rng() * 0.36;
    const width = 0.027 + rng() * 0.04;
    const base = positions.length / 3;
    for (const [y, radius, span, tint] of [[0, 0.03, 0.65, 0.43], [0.57, 0.36, 1, 0.78], [1, 1, 0, 1.13]]) {
      for (const side of [-1, 1]) {
        positions.push(dx * bend * radius - dz * width * span * side, y * height,
          dz * bend * radius + dx * width * span * side);
        colors.push(tint, tint, tint * 0.87);
      }
    }
    indices.push(base, base + 1, base + 2, base + 1, base + 3, base + 2, base + 2, base + 3, base + 4);
  }
  const geo = new T.BufferGeometry();
  geo.setIndex(indices);
  geo.setAttribute('position', new T.Float32BufferAttribute(positions, 3));
  geo.setAttribute('color', new T.Float32BufferAttribute(colors, 3));
  geo.computeVertexNormals();
  return geo;
}

// 功能：用花心和扇形花瓣做成不同高低的花枝组，近看保留单朵轮廓。时间：2026-11-21 | 作者：lq。
function flowerGeometry() {
  const positions = [], colors = [];
  const triangle = (a, b, c, tint) => {
    positions.push(...a, ...b, ...c);
    for (let i = 0; i < 3; i++) colors.push(...tint);
  };
  for (const [x, y, z] of [[0.19, 0.51, -0.16], [-0.18, 0.37, -0.13], [0.09, 0.29, 0.23]]) {
    const center = [x, y, z];
    const at = (angle, radius, lift) => [x + Math.cos(angle) * radius, y + lift, z + Math.sin(angle) * radius];
    triangle([x - 0.013, 0, z], [x + 0.013, 0, z], center, [0.56, 0.68, 0.32]);
    for (let i = 0; i < 5; i++) {
      const a = i * Math.PI * 0.4;
      const inner = at(a, 0.015, 0);
      const left = at(a - 0.53, 0.079, 0.018);
      const tip = at(a, 0.131, 0.031);
      const right = at(a + 0.53, 0.079, 0.018);
      triangle(inner, tip, left, [1, 0.82, 0.73]);
      triangle(inner, right, tip, [0.96, 0.64, 0.64]);
      triangle([x, y + 0.004, z], at(a + 0.62, 0.026, 0.006), at(a - 0.62, 0.026, 0.006),
        [1, 0.89, 0.46]);
    }
  }
  const geo = new T.BufferGeometry();
  geo.setAttribute('position', new T.Float32BufferAttribute(positions, 3));
  geo.setAttribute('color', new T.Float32BufferAttribute(colors, 3));
  geo.computeVertexNormals();
  return geo;
}

// 功能：程序化绘制稀疏草地纹理，长焦远景与近处草叶衔接。时间：2026-11-21 | 作者：lq。
function bankSurface() {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 256;
  const ctx = canvas.getContext('2d');
  const image = ctx.createImageData(256, 256);
  const rng = random(55);
  const tau = Math.PI * 2;
  for (let y = 0; y < 256; y++) {
    for (let x = 0; x < 256; x++) {
      const noise = 6 * Math.sin(tau * (x + y * 2) / 256) + 5 * Math.cos(tau * (x * 3 - y) / 256);
      const green = 107 + noise + rng() * 19;
      image.data.set([green * 0.81, green, green * 0.64, 255], (y * 256 + x) * 4);
    }
  }
  ctx.putImageData(image, 0, 0);
  const texture = new T.CanvasTexture(canvas);
  texture.wrapS = texture.wrapT = T.RepeatWrapping;
  texture.repeat.set(260, 122);
  texture.colorSpace = T.SRGBColorSpace;
  texture.anisotropy = 4;
  return material(0xa8a997, { map: texture });
}

// 功能：采用少量共享材质和实例批次构造两岸绿地，给赛道及地标保留净空。时间：2026-11-21 | 作者：lq。
export function buildLandscape(scene) {
  const rng = random(6189);
  const ground = bankSurface();
  const stone = new Batch(box, material(0xffffff));
  const branches = new Batch(new T.CylinderGeometry(0.32, 0.5, 1, 6), material(0xffffff));
  const foliage = new Batch(foliageGeometry(), material(0xffffff, { vertexColors: true, flatShading: true }));
  const grass = new Batch(grassGeometry(), material(0xffffff, { vertexColors: true, side: T.DoubleSide }));
  const flowers = new Batch(flowerGeometry(), material(0xffffff, { vertexColors: true, side: T.DoubleSide }));
  const shadows = new Batch(new T.CircleGeometry(1, 12), material(0xffffff, { roughness: 1 }));
  const flowerTints = [0xe1423b, 0xc03142, 0xed6c4b, 0xf3b556, 0xf3d7b2];
  const pick = (palette) => palette[Math.floor(rng() * palette.length)];

  // 功能：树冠按树形分层，主干与分枝对齐，树下补接地暗部。时间：2026-11-21 | 作者：lq。
  const tree = (x, z, size, form) => {
    const height = size * (form === 1 ? 1.19 : 1);
    const trunkTop = BANK_Y + height * 0.65;
    const wide = size * (form === 1 ? 0.24 : 0.345);
    const lean = (rng() - 0.5) * 0.63;
    const base = [x, BANK_Y, z];
    branches.beam(base, [x + lean, trunkTop, z + lean * 0.48], size * 0.07, size * 0.06, 0x65533e);
    const leaves = pick(leafTints);
    foliage.add([x + lean, BANK_Y + height * 0.77, z], [wide, height * 0.35, wide * 0.91], rng() * 6, leaves);
    const yaw = rng() * Math.PI * 2;
    for (let i = 0; i < (form === 1 ? 2 : 3); i++) {
      const angle = yaw + i * Math.PI * 2 / 3;
      const lx = x + Math.cos(angle) * wide * 0.75;
      const lz = z + Math.sin(angle) * wide * 0.75;
      const y = BANK_Y + height * (0.59 + rng() * 0.16);
      if (size > 3) branches.beam([x + lean * 0.55, BANK_Y + height * 0.32, z],
        [lx, y, lz], size * 0.034, size * 0.037, 0x715b43);
      foliage.add([lx, y, lz], [wide * 0.75, height * 0.21, wide * 0.72], angle, pick(leafTints));
    }
    shadows.add([x + size * 0.19, BANK_Y + 0.012, z + size * 0.12],
      [wide * 1.27, wide * 0.84, 1], 0, 0x586e43, -Math.PI / 2);
  };

  // 功能：花坛由低矮灌木、裸土、草丛和成组花色组成，保留步道和广场入口。时间：2026-11-21 | 作者：lq。
  const bed = (x, z, width, depth, colorIndex) => {
    stone.add([x, BANK_Y + 0.05, z], [width, 0.1, depth], 0, 0x777e57);
    for (let i = 0; i < width / 0.74; i++) {
      const px = x - width / 2 + 0.3 + i * 0.74;
      for (const side of [-1, 1]) foliage.add([px, BANK_Y + 0.21 + rng() * 0.09, z + side * (depth * 0.5 - 0.28)],
        [0.51, 0.33, 0.37], rng() * 6, 0x54713d);
    }
    for (let i = 0; i < width * depth * 1.65; i++) {
      const px = x + (rng() - 0.5) * (width - 0.8);
      const pz = z + (rng() - 0.5) * (depth - 0.81);
      const size = 0.65 + rng() * 0.7;
      grass.add([px, BANK_Y + 0.09, pz], [0.96, size * 0.65, 0.96], rng() * 6, pick(grassTints));
      if (i % 5 !== 4) flowers.add([px, BANK_Y + 0.11, pz], [size, size, size], rng() * 6,
        rng() > 0.25 ? flowerTints[colorIndex] : pick(flowerTints));
    }
  };

  for (const bank of [-1, 1]) {
    const land = new T.Mesh(new T.PlaneGeometry(3400, 1600), ground);
    land.rotation.x = -Math.PI / 2;
    land.position.set(0, BANK_Y, bank * 925.7);
    scene.add(land);
    for (const [left, right] of [[-530, -116], [-72, 72], [116, 530]]) {
      const mid = (left + right) / 2;
      const width = right - left;
      stone.add([mid, 2, bank * 126], [width, 5.8, 1.05], 0, 0x858b82);
      stone.add([mid, BANK_Y + 0.055, bank * 129.65], [width, 0.11, 5.9], 0, 0xb4ad98);
      stone.add([mid, BANK_Y + 0.105, bank * 126.9], [width, 0.21, 0.34], 0, 0xc9c5b4);
      for (let x = left + 2; x < right - 3; x += 6) {
        stone.add([x, BANK_Y + 0.114, bank * 129.65], [0.035, 0.018, 5.8], 0, 0x8f8c7f);
      }

      for (let x = left + 7; x < right - 5; x += 12) {
        if (x > -70 && x < 70 && Math.abs(x + 5) < 12) continue;
        const z = bank * (137.7 + rng() * 2);
        tree(x, z, 3.1 + rng() * 2.0, 1);
      }
    }
    for (const [index, x] of [-207, -158, -55, -30, 22, 49, 138, 169, 203, 245].entries()) {
      bed(x, bank * (bank === 1 ? 141.25 : 140.5), 16, 3.15, index % 5 === 4 ? 3 : index % 3);
    }

    // 功能：城市边缘留出道路和楼间空隙，成组乔木后逐渐过渡到疏林。时间：2026-11-21 | 作者：lq。
    for (let group = 0; group < 47; group++) {
      const cx = (rng() - 0.5) * 1030;
      const cz = bank * (153 + rng() * 59);
      for (let i = 0; i < 5; i++) {
        const x = cx + (rng() - 0.5) * 25;
        const z = cz + (rng() - 0.5) * 14;
        if (Math.abs(z) < 149 || Math.abs(z) > 207 || isLandmarkLot(x, z, 4)
          || distanceToCourse(x, z) < EMBANKMENT + 5) continue;
        tree(x, z, 3.2 + rng() * 4.2, i === 0 ? 1 : 0);
      }
    }
  }

  // 功能：沿肩线铺矮草，飞跃坡按横向高度插值，保证草根贴地且与护栏保持间距。时间：2026-11-21 | 作者：lq。
  for (let s = 0; s < LAP; s += 2.35) {
    const road = sample(s);
    if (Math.abs(road.z) < 134) continue;
    for (const side of [-1, 1]) {
      for (let i = 0; i < 4; i++) {
        const offset = 14.85 + i * 2.65 + rng() * 0.85;
        const [x, , z] = point(s, side * offset);
        if (isLandmarkLot(x, z, 0.5)) continue;
        const slope = Math.max(0, (EMBANKMENT - offset) / (EMBANKMENT - 13.15));
        const y = road.hill ? Math.max(BANK_Y, T.MathUtils.lerp(4.87, road.y - 0.035, slope)) : BANK_Y;
        const size = 0.62 + rng() * 0.73;
        grass.add([x, y - 0.014, z], [size, size, size], rng() * 6, pick(grassTints));
        if (i === 3 && Math.floor(s / 2.35) % 7 === 0) {
          flowers.add([x, y, z], [size, size * 0.79, size], rng() * 6, 0xefc785);
        }
      }
    }
  }
  for (const batch of [stone, shadows, branches, foliage, grass, flowers]) batch.finish(scene);
}
