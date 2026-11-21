/**
 * 功能：绘制沥青赛道、机动车道、护栏，以及参考图中的双拱桥和双 A 塔斜拉桥。
 * 时间：2026-11-20 | 作者：lq
 */
import * as T from 'three';
import { makeBridgeFlags } from './bridge-flags.js';
import { DECK, EMBANKMENT, HILLS, LAP, ROAD, RADIUS, GRID, SECTORS, point, sample } from './course.js';
import { Batch, material, random, rectangularSweep } from './geometry.js';

const box = new T.BoxGeometry();
const cylinder = new T.CylinderGeometry(0.5, 0.5, 1, 7);

function asphaltTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 256;
  const context = canvas.getContext('2d');
  const pixels = context.createImageData(256, 256);
  const rng = random(12);
  for (let i = 0; i < pixels.data.length; i += 4) {
    const n = 60 + rng() * 31 + (rng() > 0.965 ? 35 : 0);
    pixels.data.set([n * 0.94, n, n * 1.05, 255], i);
  }
  context.putImageData(pixels, 0, 0);
  const texture = new T.CanvasTexture(canvas);
  texture.wrapS = texture.wrapT = T.RepeatWrapping;
  texture.colorSpace = T.SRGBColorSpace;
  texture.anisotropy = 8;
  return texture;
}

// 功能：铺设随坡的带状网格，亦可将一侧固定在地面作为护坡。时间：2026-11-20 | 作者：lq。
function ribbon(scene, left, right, y, surface, start = 0, length = LAP, groundEdge = null) {
  const positions = [], uv = [], indices = [];
  const count = Math.ceil(length / 1.5);
  for (let i = 0; i <= count; i++) {
    const distance = start + i / count * length;
    for (const edge of [left, right]) {
      const vertex = point(distance, edge, y);
      if (edge === groundEdge) vertex[1] = 4.87;
      positions.push(...vertex);
      uv.push(edge / 5, distance / 5);
    }
    const a = i * 2;
    if (i < count) indices.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
  }
  const geometry = new T.BufferGeometry();
  geometry.setAttribute('position', new T.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new T.Float32BufferAttribute(uv, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  const mesh = new T.Mesh(geometry, surface);
  scene.add(mesh);
  return mesh;
}

// 功能：湿沥青保留细颗粒与轻微的天光反射，不叠加波纹或条带。时间：2026-11-20 | 作者：lq。
function wetAsphalt(dry, skyReflection) {
  const wet = dry.clone();
  wet.color.set(0x939ca7);
  wet.roughness = 0.46;
  wet.onBeforeCompile = (shader) => {
    shader.uniforms.uWetSky = skyReflection;
    shader.fragmentShader = shader.fragmentShader.replace('#include <common>', `
      #include <common>
      uniform vec3 uWetSky;
    `).replace('#include <emissivemap_fragment>', `
      #include <emissivemap_fragment>
      float grazing = pow(1.0 - saturate(dot(normal, normalize(vViewPosition))), 2.6);
      totalEmissiveRadiance += uWetSky * grazing;
    `);
  };
  return wet;
}

function checker(scene, distance) {
  const white = new Batch(box, material(0xf6f2dd));
  const black = new Batch(box, material(0x242c34));
  const { dx, dz } = sample(distance);
  for (let row = 0; row < 3; row++) {
    for (let col = 0; col < 24; col++) {
      const batch = (row + col) % 2 ? white : black;
      batch.add(point(distance + row * 0.55, (col - 11.5) * 0.81, DECK + 0.022), [0.81, 0.024, 0.55], Math.atan2(dx, dz));
    }
  }
  white.finish(scene);
  black.finish(scene);
}

function markings(scene) {
  const dashes = new Batch(box, material(0xe0e7e3));
  const stripe = new Batch(box, material(0xffffff));
  // 功能：虚线中点随坡，短段和俯仰避免车道线埋进坡面。时间：2026-11-20 | 作者：lq。
  for (let s = 0; s < LAP; s += 9) {
    for (const mid of [s - 1.5, s - 0.5, s + 0.5, s + 1.5]) {
      const { dx, dz, grade } = sample(mid);
      const yaw = Math.atan2(dx, dz), pitch = -Math.atan(grade);
      for (const n of [-5, 5]) dashes.add(point(mid, n, DECK + 0.022), [0.11, 0.023, 1.015], yaw, undefined, pitch);
    }
  }
  for (let s = 0; s < LAP; s += 2) {
    if (!sample(s).turn) continue;
    const { dx, dz } = sample(s);
    for (const side of [-1, 1]) stripe.add(point(s, side * 9.84, DECK + 0.029), [0.55, 0.045, 2.03], Math.atan2(dx, dz), Math.floor(s / 4) % 2 ? 0xf3eeee : 0xb6343a);
  }
  dashes.finish(scene);
  stripe.finish(scene);
  checker(scene, GRID + 1);
  checker(scene, SECTORS[1].start + 1);
}

function barriers(scene, concrete, glowing) {
  const rail = new Batch(box, material(0xd0dbe2, { metalness: 0.28 }));
  const posts = new Batch(box, material(0xffffff));
  const blocks = new Batch(box, concrete);
  for (let s = 0; s < LAP; s += 3) {
    const { dx, dz, z } = sample(s);
    const yaw = Math.atan2(dx, dz);
    const bridge = Math.abs(z) < 125;
    for (const side of [-1, 1]) {
      const edge = side * 10.5;
      const next = Math.min(s + 3, LAP);
      for (const y of [DECK + 0.31, DECK + 0.89]) rail.beam(point(s, edge, y), point(next, edge, y), 0.12, 0.16);
      posts.add(point(s, edge, DECK + 0.47), [0.17, 0.96, 0.17], yaw, Math.round(s / 3) % 2 ? 0xe1e7e8 : 0x3581b2);
      if (bridge) {
        rail.beam(point(s, side * 13.05, DECK + 0.92), point(next, side * 13.05, DECK + 0.92), 0.10, 0.10);
        posts.add(point(s, side * 13.05, DECK + 0.46), [0.10, 0.92, 0.11], yaw, 0xdce5ed);
      }
      if (s % 12 === 0) glowing.add(point(s, edge, DECK + 0.98), [0.15, 0.075, 0.48], yaw);
    }
  }
  for (const x of [-RADIUS, RADIUS]) {
    blocks.add([x, DECK - 0.9, 0], [26.4, 1.72, 252]);
    for (let z = -105; z <= 105; z += 35) {
      for (const side of [-1, 1]) blocks.add([x + side * 7.6, 1.45, z], [2.3, 6, 3.1]);
      blocks.add([x, 3.5, z], [20, 1.05, 3.25]);
    }
  }
  posts.finish(scene);
  rail.finish(scene);
  blocks.finish(scene);
}

function archBridge(scene, white, concrete) {
  const towers = new Batch(box, concrete);
  const hangers = new Batch(cylinder, material(0xe0e4e4, { metalness: 0.35 }));
  for (const side of [-1, 1]) {
    // 主拱向外倾斜，低位副拱由引桥伸入并和主拱交汇。
    const main = (t) => new T.Vector3(-RADIUS + side * (12 + 5.5 * Math.sin(t * Math.PI)), 1.2 + 38 * Math.sin(t * Math.PI) ** 0.83, 91 - 174 * t);
    const lower = (t) => new T.Vector3(-RADIUS + side * (20 - 7 * Math.sin(t * Math.PI) + 3 * Math.sin(t * 2 * Math.PI)), 5 + 15 * Math.sin(t * Math.PI), 126 - 252 * t);
    for (const [curve, w, d] of [[main, 2.5, 2.9], [lower, 1.55, 1.65]]) {
      const points = Array.from({ length: 81 }, (_, i) => curve(i / 80));
      scene.add(rectangularSweep(points, w, d, white));
      for (const t of [0, 1]) {
        const foot = curve(t);
        towers.add([foot.x, -0.05 + foot.y * 0.5, foot.z], [4.2, foot.y + 1.5, 5.5]);
      }
    }
    for (let i = 1; i < 28; i++) {
      const t = i / 28;
      const top = main(t);
      const x = -RADIUS + side * 11.65;
      hangers.beam(top.toArray(), [x, DECK + 0.25, top.z + side * 15 * Math.sin(t * Math.PI)], 0.085);
      const diagonal = lower(t);
      if (i % 2 === 0) hangers.beam(diagonal.toArray(), [x, DECK + 0.25, diagonal.z - side * 12], 0.065);
    }
  }
  towers.finish(scene);
  hangers.finish(scene);
}

function cableBridge(scene, white, concrete, towerGlow, cableGlow) {
  const towers = new Batch(box, white);
  const plinth = new Batch(box, concrete);
  const cables = new Batch(cylinder, material(0xf2ede4, { metalness: 0.25 }));
  for (const z of [-59, 59]) {
    for (const side of [-1, 1]) {
      const foot = [RADIUS + side * 13.8, -2, z];
      const knee = [RADIUS + side * 11.4, DECK + 1.7, z];
      const top = [RADIUS + side * 2.45, 58, z];
      towers.beam(foot, knee, 3.5, 4.7);
      towers.beam(knee, top, 2.8, 3.8);
      plinth.add([foot[0], -0.05, z], [6.1, 3.4, 7.4]);
      for (const face of [-1, 1]) {
        towerGlow.beam([knee[0], knee[1], z + face * 1.92], [top[0], top[1], z + face * 1.92], 0.14, 0.13);
      }
      // 双索面扇形展开，塔顶锚点分级排列，与桥面外侧一一对应。
      for (let i = 0; i < 15; i++) {
        const y = 30.2 + i * 1.78;
        const x = T.MathUtils.lerp(knee[0], top[0], (y - knee[1]) / (top[1] - knee[1]));
        for (const fan of [-1, 1]) {
          const start = [x + side * 1.3, y, z + fan * 1.03];
          const end = [RADIUS + side * 11.45, DECK + 0.25, z + fan * (9 + i * 3.42)];
          cables.beam(start, end, 0.076);
          cableGlow.beam(start, end, 0.11);
        }
      }
    }
    towers.add([RADIUS, 56.6, z], [6.2, 3.0, 3.75]);
    towers.add([RADIUS, 34, z], [13.3, 2.25, 3.5]);
  }
  towers.finish(scene);
  plinth.finish(scene);
  cables.finish(scene);
}

function lamps(scene, glowing) {
  const poles = new Batch(cylinder, material(0x95a8b4, { metalness: 0.35 }));
  const flags = makeBridgeFlags();
  for (let s = 10; s < LAP; s += 24) {
    const current = sample(s);
    const { dx, dz } = current;
    for (const side of [-1, 1]) {
      const base = point(s, side * 11.9, DECK);
      const top = point(s, side * 11.9, DECK + 5.5);
      const elbow = point(s + 0.35, side * 11.5, DECK + 6.3);
      const tip = point(s + 0.65, side * 10.35, DECK + 6.58);
      poles.beam(base, top, 0.14);
      poles.beam(top, elbow, 0.12);
      poles.beam(elbow, tip, 0.11);
      glowing.add(tip, [0.7, 0.16, 0.33], Math.atan2(dx, dz));
      if (current.x === RADIUS && Math.abs(current.z) < 125) {
        const flagBase = point(s + 8, side * 12.3, DECK);
        const flagTop = point(s + 8, side * 12.3, DECK + 2.65);
        poles.beam(flagBase, flagTop, 0.065);
        // 功能：旗面上角对准原旗杆顶端，两侧旗帜使用同一风向。时间：2026-11-21 | 作者：lq。
        flags.add(point(s + 8, side * 12.3, DECK + 2.15), Math.atan2(dx, dz) - 1.05);
      }
    }
  }
  poles.finish(scene);
  flags.finish(scene);
  return flags;
}

// 功能：在两个高架坡下铺设岸堤，两侧连接现有的河岸地面。时间：2026-11-20 | 作者：lq。
function hillsides(scene) {
  const fill = material(0x625f4f, { side: T.DoubleSide });
  for (const { start, length } of HILLS) {
    ribbon(scene, -EMBANKMENT, -13.15, DECK - 0.035, fill, start, length, -EMBANKMENT);
    ribbon(scene, 13.15, EMBANKMENT, DECK - 0.035, fill, start, length, EMBANKMENT);
  }
}

export function buildTrack(scene) {
  const concrete = material(0x87969d);
  const white = material(0xf3efe1);
  const light = material(0xe9eedb, { emissive: 0xffd582, emissiveIntensity: 0.03 });
  const glowing = new Batch(box, light);
  const towerGlow = new Batch(box, new T.MeshBasicMaterial({ color: 0x58bfff }));
  const cableGlow = new Batch(cylinder, new T.MeshBasicMaterial({ color: 0xb32d67 }));
  const road = material(0xeeeeee, { map: asphaltTexture(), side: T.DoubleSide, roughness: 0.93 });
  const roadMesh = ribbon(scene, -ROAD, ROAD, DECK, road);
  const skyReflection = { value: new T.Color() };
  const wetRoad = wetAsphalt(road, skyReflection);
  const paint = material(0xe5ae51, { side: T.DoubleSide });
  const edge = material(0xd2d9dc, { side: T.DoubleSide });
  for (const side of [-1, 1]) {
    const centerLine = [side * 0.19 - 0.067, side * 0.19 + 0.067];
    const edgeLine = [side * 9.55 - 0.09, side * 9.55 + 0.09];
    ribbon(scene, ...centerLine, DECK + 0.017, paint);
    ribbon(scene, ...edgeLine, DECK + 0.017, edge);
  }
  const shoulder = material(0xa16a62, { side: T.DoubleSide });
  ribbon(scene, -13.15, -ROAD, DECK - 0.025, shoulder);
  ribbon(scene, ROAD, 13.15, DECK - 0.025, shoulder);
  hillsides(scene);
  markings(scene);
  barriers(scene, concrete, glowing);
  archBridge(scene, white, concrete);
  cableBridge(scene, white, concrete, towerGlow, cableGlow);
  const flags = lamps(scene, glowing);
  const luminousTowers = towerGlow.finish(scene);
  const luminousCables = cableGlow.finish(scene);
  glowing.finish(scene);
  return {
    // 功能：更新桥上旗面的风动画。时间：2026-11-21 | 作者：lq。
    updateFlags: flags.update,
    // 功能：分别切换桥灯和路面材质，支持夜雨组合。时间：2026-11-20 | 作者：lq。
    setWeather(night, wet) {
      light.emissiveIntensity = night ? 2.6 : 0.03;
      luminousTowers.visible = night;
      luminousCables.visible = night;
      roadMesh.material = wet ? wetRoad : road;
      if (wet) skyReflection.value.setRGB(...(night ? [0.010, 0.017, 0.027] : [0.027, 0.037, 0.049]));
    },
  };
}
