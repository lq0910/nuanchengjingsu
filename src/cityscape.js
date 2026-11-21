/**
 * 功能：按参考图生成 4 号桥对岸 CBD、文化场馆和两岸背景街区。
 * 时间：2026-11-21 | 作者：lq
 */
import * as T from 'three';
import { Batch, material, random } from './geometry.js';
import { distanceToCourse, EMBANKMENT } from './course.js';

export const BANK_Y = 4.94;
const box = new T.BoxGeometry();
const shell = new T.BoxGeometry();
// 功能：幕墙只占箱体四个立面，屋顶另用实心材质。时间：2026-11-21 | 作者：lq。
const wallIndices = shell.groups.filter(({ materialIndex }) => materialIndex !== 2 && materialIndex !== 3)
  .flatMap(({ start, count }) => Array.from(shell.index.array.slice(start, start + count)));
shell.setIndex(wallIndices);
shell.clearGroups();

export const cbdTowers = [
  { x: -59, z: 171, width: 17, depth: 20, height: 43 },
  { x: -27, z: 166, width: 16, depth: 19, height: 51 },
  { x: 9, z: 170, width: 19, depth: 22, height: 74 },
  { x: 52, z: 172, width: 19, depth: 22, height: 74 },
  { x: 138, z: 166, width: 16, depth: 18, height: 49 },
  { x: 169, z: 167, width: 17, depth: 19, height: 44 },
  { x: 206, z: 171, width: 19, depth: 21, height: 50 },
];

// 功能：给场馆台基和塔楼后院预留空间，供背景街区和植被一起避让。时间：2026-11-21 | 作者：lq。
const lots = [
  [-74, 70, 143, 188],
  [119, 222, 143, 188],
  [-73, 70, -185, -144],
];

export function isLandmarkLot(x, z, margin = 0) {
  return lots.some(([left, right, front, back]) =>
    x > left - margin && x < right + margin && z > front - margin && z < back + margin);
}

// 功能：绘制多种立面与独立夜间亮窗贴图，控制高楼可见窗格的数量和均匀度。时间：2026-11-21 | 作者：lq。
function facade(bays, floors, office, seed) {
  const rng = random(seed);
  const canvas = document.createElement('canvas');
  const light = document.createElement('canvas');
  canvas.width = light.width = 256;
  canvas.height = light.height = 512;
  const ctx = canvas.getContext('2d');
  const lamps = light.getContext('2d');
  const { width, height } = canvas;
  const w = width / bays;
  const h = height / floors;
  ctx.fillStyle = office ? '#a7b7bb' : '#c5b4a0';
  ctx.fillRect(0, 0, width, height);
  lamps.fillStyle = '#000';
  lamps.fillRect(0, 0, width, height);
  for (let floor = 0; floor < floors; floor++) {
    const y = floor * h;
    for (let bay = 0; bay < bays; bay++) {
      const x = bay * w;
      const shade = rng() * 13 + 47;
      const pane = office ? w - 2.5 : w * 0.7;
      const start = x + (w - pane) / 2;
      const top = y + (office ? 1 : h * 0.17);
      const paneHeight = h * (office ? 0.74 : 0.56);
      const glass = ctx.createLinearGradient(0, top, 0, top + paneHeight);
      const sky = (1 - floor / floors) * (office ? 43 : 15);
      glass.addColorStop(0, `rgb(${shade + sky},${shade + sky + 24},${shade + sky + 34})`);
      glass.addColorStop(1, `rgb(${shade},${shade + 12},${shade + 20})`);
      ctx.fillStyle = glass;
      ctx.fillRect(start, top, pane, paneHeight);
      if (rng() < (office ? 0.27 : 0.18)) {
        lamps.fillStyle = rng() < 0.68 ? '#ecc698' : '#a7d9ee';
        lamps.fillRect(start + 1, top + 1, pane - 2, paneHeight - 2);
      }
      if (!office && bay % 2 === 1) {
        ctx.fillStyle = '#887a70';
        ctx.fillRect(start - 2, top + paneHeight - 2, pane + 4, 4);
      }
    }
    ctx.fillStyle = office ? '#778b92' : '#aa9886';
    ctx.fillRect(0, y + h - 1.6, width, 1.6);
  }
  const textures = [canvas, light].map((source) => {
    const texture = new T.CanvasTexture(source);
    texture.colorSpace = T.SRGBColorSpace;
    texture.anisotropy = 4;
    return texture;
  });
  return material(0xffffff, {
    map: textures[0], emissiveMap: textures[1], emissive: 0xffffff,
    emissiveIntensity: 0, roughness: office ? 0.49 : 0.82,
  });
}

// 功能：用曲面圈层塑造铜色展馆外壳，并预先计算暖色洗墙灯的照射范围。时间：2026-11-21 | 作者：lq。
function waveMuseum(scene, framing, nightFixtures) {
  const center = [39, BANK_Y, -165];
  const tau = Math.PI * 2;
  const profile = (angle, level, lift = 0) => {
    const swell = (0.74 + 0.28 * Math.sin(Math.PI * level) + 0.07 * level)
      * (1 - T.MathUtils.smoothstep(level, 0.63, 1));
    const radius = swell + lift;
    const wave = 1 + 0.115 * Math.cos(angle * 2 + 1.25) + 0.055 * Math.cos(angle * 3);
    const roofline = 23.2 + 3.6 * Math.sin(angle * 2 - 0.28) * (1 - T.MathUtils.smoothstep(level, 0.8, 1));
    return [
      center[0] + 24.5 * radius * wave * Math.cos(angle),
      center[1] + 0.6 + roofline * level,
      center[2] + 15.3 * radius * Math.sin(angle),
    ];
  };
  const positions = [];
  const indices = [];
  const colors = [];
  const wash = [];
  const washIntensity = { value: 0 };
  const uplights = 10;
  const bronze = new T.Color(0x9c6947);
  const rings = 80;
  const sides = 72;
  for (let row = 0; row <= rings; row++) {
    const level = row / rings * 0.999;
    for (let j = 0; j < sides; j++) {
      const angle = j / sides * tau;
      const rib = [0, 0.013, 0.018, 0.005][row % 4];
      positions.push(...profile(angle, level, rib * Math.sin(Math.PI * level)));
      const tint = bronze.clone().multiplyScalar([0.48, 0.9, 1.08, 0.78][row % 4]);
      colors.push(tint.r, tint.g, tint.b);
      const fan = ((1 + Math.cos((angle - 0.15) * uplights)) / 2) ** (2.6 - level * 2);
      const falloff = (1 - level) ** 0.9;
      wash.push(0.07 + falloff * (0.08 + fan * 0.72) * [0.33, 0.72, 1, 0.79][row % 4]);
      if (row > 0) {
        const a = (row - 1) * sides + j;
        const b = (row - 1) * sides + (j + 1) % sides;
        indices.push(a, a + sides, b, b, a + sides, b + sides);
      }
    }
  }
  const peak = positions.length / 3;
  positions.push(...profile(0, 1));
  colors.push(bronze.r, bronze.g, bronze.b);
  wash.push(0.07);
  for (let j = 0; j < sides; j++) indices.push(rings * sides + j, peak, rings * sides + (j + 1) % sides);
  const skin = new T.BufferGeometry();
  skin.setAttribute('position', new T.Float32BufferAttribute(positions, 3));
  skin.setAttribute('color', new T.Float32BufferAttribute(colors, 3));
  skin.setAttribute('aUplight', new T.Float32BufferAttribute(wash, 1));
  skin.setIndex(indices);
  skin.computeVertexNormals();
  const copper = material(0xffffff, { vertexColors: true, roughness: 0.48, metalness: 0.18 });
  // 功能：夜间只点亮铜壳上的局部光带，避免增加全场逐像素点光源。时间：2026-11-21 | 作者：lq。
  copper.onBeforeCompile = (shader) => {
    shader.uniforms.uMuseumNight = washIntensity;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float aUplight;\nvarying float vUplight;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvUplight = aUplight;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform float uMuseumNight;\nvarying float vUplight;')
      .replace('#include <emissivemap_fragment>', `
        #include <emissivemap_fragment>
        totalEmissiveRadiance += vec3(1.0, 0.50, 0.19) * vUplight * uMuseumNight;
      `);
  };
  scene.add(new T.Mesh(skin, copper));

  // 功能：在原有天窗金属边框外侧嵌入暖白灯带，台基上保留对应的上照灯。时间：2026-11-21 | 作者：lq。
  const glazing = (u, v, lift = 0.025) => profile(1.13 + u * 0.43 + 0.12 * v, 0.66 + v * 0.15, lift);
  const pane = glazing(0, 0);
  const glassIndices = [];
  const segments = 40;
  const layers = 5;
  for (let layer = 1; layer <= layers; layer++) {
    for (let i = 0; i < segments; i++) {
      const a = i / segments * tau;
      pane.push(...glazing(Math.cos(a) * layer / layers, Math.sin(a) * layer / layers));
      const current = (layer - 1) * segments + i + 1;
      const next = (layer - 1) * segments + (i + 1) % segments + 1;
      if (layer === 1) glassIndices.push(0, current, next);
      else glassIndices.push(current - segments, current, next, current - segments, next, next - segments);
      if (layer === layers) {
        const b = a + tau / segments;
        framing.beam(glazing(Math.cos(a), Math.sin(a)), glazing(Math.cos(b), Math.sin(b)), 0.21, 0.21, 0xceac7d);
        nightFixtures.beam(glazing(Math.cos(a), Math.sin(a), 0.038), glazing(Math.cos(b), Math.sin(b), 0.038),
          0.15, 0.15, 0xffbb73);
      }
    }
  }
  for (const u of [-0.75, -0.5, -0.25, 0, 0.25, 0.5, 0.75]) {
    const edge = Math.sqrt(1 - u * u);
    for (let i = 0; i < 8; i++) {
      framing.beam(glazing(u, edge * (i / 4 - 1)), glazing(u, edge * ((i + 1) / 4 - 1)),
        0.09, 0.1, 0x9bb0b7);
    }
  }
  const glass = new T.BufferGeometry();
  glass.setAttribute('position', new T.Float32BufferAttribute(pane, 3));
  glass.setIndex(glassIndices);
  glass.computeVertexNormals();
  const skylight = material(0x365869, {
    side: T.DoubleSide, roughness: 0.32, emissive: 0x4c819a, emissiveIntensity: 0,
  });
  scene.add(new T.Mesh(glass, skylight));
  for (let i = 0; i < uplights; i++) {
    const angle = i * tau / uplights + 0.15;
    const [x, , z] = profile(angle, 0, 0.117);
    framing.add([x, BANK_Y + 1.015, z], [0.58, 0.12, 0.4], -angle, 0x554d3d);
    nightFixtures.add([x, BANK_Y + 1.09, z], [0.45, 0.055, 0.28], -angle, 0xffb366);
  }
  nightFixtures.add([39, BANK_Y + 0.91, -143.96], [45, 0.16, 0.09], 0, 0xd99357);
  return (night) => {
    washIntensity.value = night ? 1.36 : 0;
    skylight.emissiveIntensity = night ? 0.48 : 0;
  };
}

// 功能：用上宽下窄的倾斜石材体块、通高玻璃和宽台阶组成文化馆。时间：2026-11-21 | 作者：lq。
function cultureCenter(scene, masonry, glazing) {
  const stone = material(0xd7d0bd);
  const volumes = [
    { x: -57, y: 23, width: 12, depth: 23, lean: -4.4 },
    { x: -40, y: 22, width: 12, depth: 23, lean: -3.1 },
    { x: -16, y: 20, width: 17, depth: 24, lean: -0.65 },
  ];
  for (const { x, y, width, depth, lean } of volumes) {
    const front = -163 + depth / 2;
    const base = width * 0.44;
    const top = width / 2;
    const shape = new T.Shape()
      .moveTo(-base, 0).lineTo(base, 0)
      .lineTo(top + lean, y).lineTo(-top + lean, y).lineTo(-base, 0);
    const geo = new T.ExtrudeGeometry(shape, { depth, bevelThickness: 0.46, bevelSize: 0.48, bevelSegments: 2 });
    const mesh = new T.Mesh(geo, stone);
    mesh.position.set(x, BANK_Y + 1.18, front - depth);
    scene.add(mesh);
    for (let level = 1; level <= 6; level++) {
      const t = level / 7;
      const span = T.MathUtils.lerp(base, top, t) + 0.47;
      masonry.add([x + lean * t, BANK_Y + 1.18 + y * t, front + 0.012], [span * 2, 0.035, 0.064], 0, 0xa8a290);
    }
  }
  for (const [x, width, height, z] of [[-48, 10, 16, -156], [-29, 15, 15, -156]]) {
    glazing.add([x, BANK_Y + 1.1 + height / 2, z], [width, height, 14]);
    masonry.add([x, BANK_Y + 1.1 + height, z], [width + 0.3, 0.22, 14.3], 0, 0x868f8c);
  }
  glazing.add([-0.5, BANK_Y + 7.6, -161.8], [14.5, 12.8, 14.1]);
  for (let i = 0; i < 5; i++) {
    masonry.add([-40, BANK_Y + 0.12 * (i + 1), -149 - i * 0.45], [58, 0.24 * (i + 1), 2.1], 0, 0xbeb8a5);
  }
}

// 功能：沿滨水面布置双主塔、侧楼与连续裙楼，并以多种体块补全远处街区。时间：2026-11-21 | 作者：lq。
export function buildCityscape(scene) {
  const masonry = new Batch(box, material(0xffffff));
  const nightFixtures = new Batch(box, new T.MeshBasicMaterial({ color: 0xffffff, toneMapped: false }));
  const office = [facade(11, 25, true, 72), facade(9, 17, true, 251), facade(12, 4, true, 206)];
  const housing = [facade(6, 6, false, 152), facade(6, 11, false, 218)];
  const glass = office.map((surface) => new Batch(shell, surface));
  const blocks = housing.map((surface) => new Batch(shell, surface));
  const rng = random(853);
  const roofs = [0xcbc7bb, 0xbd9d86, 0xa79788, 0xcfb49a, 0xb69b92];
  const plinth = BANK_Y + 0.64;
  const steppedBlock = (batch, x, z, w, d, height, roof, base = plinth) => {
    batch.add([x, base + height / 2, z], [w, height, d]);
    masonry.add([x, base - 0.22, z], [w + 0.66, 0.44, d + 0.63], 0, roof);
    masonry.add([x, base + height + 0.22, z], [w + 0.4, 0.44, d + 0.4], 0, roof);
  };

  for (const [left, right, color] of [[-73, 70, 0xb0b5ac], [119, 221, 0xb1b9b3]]) {
    const mid = (left + right) / 2;
    const width = right - left;
    masonry.add([mid, BANK_Y + 0.32, 164.8], [width, 0.64, 42], 0, 0xa8aa9e);
    steppedBlock(glass[2], mid, 157.6, width - 2, 11.5, 7.8, color);
    masonry.add([mid, BANK_Y + 3.39, 151.65], [width - 1.9, 0.23, 0.42], 0, 0xd1d5c9);
    const columns = Math.ceil(width / 4.4);
    for (let i = 0; i < columns; i++) {
      const x = left + (i + 0.5) * width / columns;
      masonry.add([x, BANK_Y + 4.5, 151.66], [0.18, 7.82, 0.36], 0, 0xbfc9c4);
    }
  }
  for (const [i, { x, z, width, depth, height }] of cbdTowers.entries()) {
    const tall = i === 2 || i === 3;
    const roof = tall ? 0xa9bbbc : i % 2 ? 0x93a4ac : 0x829598;
    steppedBlock(glass[tall ? 0 : 1], x, z, width, depth, height, roof);
    masonry.add([x, plinth + height + 0.63, z], [width * 0.87, 0.81, depth * 0.86], 0, roof);
    for (const side of [-1, 1]) {
      for (const face of [-1, 1]) {
        masonry.add([x + side * width * 0.497, plinth + height * 0.5, z + face * depth * 0.497],
          [0.34, height, 0.34], 0, roof);
      }
    }
    // 功能：以冷白灯带勾勒双子塔及旁边的第三高楼，远处仍能分辨楼冠和竖向线条。时间：2026-11-21 | 作者：lq。
    if (tall || i === 1) {
      const crown = plinth + height - 0.32;
      const tint = tall ? 0xafddff : 0xd2e5f4;
      const railHeight = height - 8.2;
      for (const side of [-1, 1]) {
        nightFixtures.add([x, crown, z + side * (depth / 2 + 0.16)], [width + 0.4, 0.48, 0.18], 0, tint);
        nightFixtures.add([x + side * (width / 2 + 0.16), crown, z], [0.18, 0.48, depth + 0.4], 0, tint);
        for (const face of [-1, 1]) {
          nightFixtures.add([x + side * (width / 2 - 0.48), crown - railHeight / 2 - 0.18,
            z + face * (depth / 2 + 0.1)], [0.31, railHeight, 0.16], 0, 0x7eaed1);
        }
      }
    }
  }

  masonry.add([-1.4, BANK_Y + 0.48, -164], [138, 0.96, 40], 0, 0xb3ada0);
  cultureCenter(scene, masonry, glass[1]);
  const setMuseumNight = waveMuseum(scene, masonry, nightFixtures);

  for (const bank of [-1, 1]) {
    for (let row = 0; row < 3; row++) {
      for (let i = 0; i < 41; i++) {
        const x = (i - 20) * 26 + (row % 2) * 11 + (rng() - 0.5) * 8;
        const z = bank * (215 + row * 66 + rng() * 35);
        const width = 12 + rng() * 9;
        const depth = 12 + rng() * 11;
        const clearance = Math.hypot(width, depth) / 2 + 2;
        if (distanceToCourse(x, z) < EMBANKMENT + clearance || isLandmarkLot(x, z, clearance)) continue;
        const tall = rng() > 0.52;
        const height = tall ? 19 + rng() * 12 : 9 + rng() * 8;
        const roof = roofs[Math.floor(rng() * roofs.length)];
        steppedBlock(blocks[Number(tall)], x, z, width, depth, height, roof, BANK_Y + 0.18);
        if (i % 3 !== 0) {
          masonry.add([x + width * 0.13, BANK_Y + height + 1.15, z + 1.5],
            [width * 0.56, 1.15, depth * 0.57], 0, roof);
        }
      }
    }
  }

  for (const batch of [masonry, ...glass, ...blocks]) batch.finish(scene);
  const fixtures = nightFixtures.finish(scene);
  fixtures.visible = false;
  return {
    // 功能：统一切换地标观景灯和亮窗，夜雨也保持开启。时间：2026-11-21 | 作者：lq。
    setNight(night) {
      for (const surface of [...office, ...housing]) surface.emissiveIntensity = night ? 0.69 : 0;
      fixtures.visible = night;
      setMuseumNight(night);
    },
  };
}
