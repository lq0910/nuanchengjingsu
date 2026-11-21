/**
 * 功能：用共享几何生成低多边形公交、出租车、骑行者和行人，保留可动画节点。
 * 时间：2026-11-21 | 作者：lq
 */
import * as T from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { mergeGeometries, mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import { material } from './geometry.js';

export const WHEEL_RADIUS = { bus: 0.49, taxi: 0.34, bicycle: 0.33 };
const PAINT = {
  bus: [0x187d88, 0x2f639f, 0xa94236, 0x42865e],
  taxi: [0xf3b82a, 0xf4cb49, 0xeb9032, 0xffe063],
  bicycle: [0xef764b, 0x5bb4c3, 0xa2b96a, 0xae82b8],
  pedestrian: [0x4798ab, 0xb95d51, 0xbb8e46, 0x768abb],
};

const box = new T.BoxGeometry();
const rounded = new RoundedBoxGeometry(1, 1, 1, 1, 0.10);
const sphere = new T.SphereGeometry(1, 10, 8);
const cylinder = new T.CylinderGeometry(1, 1, 1, 8);
const wheelShell = new T.CylinderGeometry(1, 1, 1, 18).rotateZ(Math.PI / 2);
const bikeTire = new T.TorusGeometry(0.308, 0.022, 6, 24).rotateY(Math.PI / 2);
const bikeRim = new T.TorusGeometry(0.287, 0.010, 5, 24).rotateY(Math.PI / 2);
const rubber = material(0x21252b);
const metal = material(0xa8b7c2, { metalness: 0.47, roughness: 0.37 });
const trim = material(0x202a32);
const glass = material(0x426275, { metalness: 0.31, roughness: 0.28 });
const white = material(0xe9eee7);
const skin = material(0xc8916e);
const trousers = material(0x344252);
const tail = material(0xe24945, { emissive: 0xff3326, emissiveIntensity: 0.67 });
const headlamp = material(0xf4f6e3, { emissive: 0xf1f3d1, emissiveIntensity: 0.75 });
const sign = material(0xffcf72, { emissive: 0xffb446, emissiveIntensity: 0.52 });

function mesh(parent, geometry, surface, size, position) {
  const object = new T.Mesh(geometry, surface);
  object.scale.fromArray(size);
  object.position.fromArray(position);
  parent.add(object);
  return object;
}

function part(parent, surface, size, position, soft = false) {
  return mesh(parent, soft ? rounded : box, surface, size, position);
}

function beam(parent, surface, from, to, radius) {
  const start = new T.Vector3(...from);
  const direction = new T.Vector3(...to).sub(start);
  const object = mesh(parent, cylinder, surface, [radius, direction.length(), radius], start.addScaledVector(direction, 0.5).toArray());
  object.quaternion.setFromUnitVectors(T.Object3D.DEFAULT_UP, direction.normalize());
  return object;
}

function pivot(parent, name, position) {
  const group = new T.Group();
  group.name = name;
  group.position.fromArray(position);
  parent.add(group);
  return group;
}

// 功能：按材质合并固定部件，车轮和四肢在各自转轴下单独合并。时间：2026-11-21 | 作者：lq。
function compact(group) {
  const byMaterial = new Map();
  for (const object of [...group.children]) {
    if (!object.isMesh) {
      compact(object);
      continue;
    }
    object.updateMatrix();
    const geometry = object.geometry.index ? object.geometry.toNonIndexed() : object.geometry.clone();
    geometry.deleteAttribute('uv');
    geometry.applyMatrix4(object.matrix);
    if (!byMaterial.has(object.material)) byMaterial.set(object.material, []);
    byMaterial.get(object.material).push(geometry);
    object.removeFromParent();
  }
  for (const [surface, geometries] of byMaterial) {
    const merged = mergeGeometries(geometries);
    group.add(new T.Mesh(mergeVertices(merged), surface));
    merged.dispose();
    for (const geometry of geometries) geometry.dispose();
  }
}

function lampPair(root, x, y, front, rear, width) {
  for (const side of [-1, 1]) {
    part(root, headlamp, [width, 0.13, 0.055], [side * x, y, front], true);
    part(root, tail, [width, 0.16, 0.055], [side * x, y, rear], true);
  }
}

function motorWheels(root, positions, radius, halfTrack, tread, inset = false) {
  for (const [axle, z] of positions.entries()) {
    for (const side of [-1, 1]) {
      const group = pivot(root, `Wheel_${axle}_${side < 0 ? 'L' : 'R'}`, [side * halfTrack, radius, z]);
      mesh(group, wheelShell, rubber, [tread, radius, radius], [0, 0, 0]);
      const face = side * (tread / 2 + 0.006);
      mesh(group, wheelShell, metal, [0.028, radius * 0.6, radius * 0.6], [face, 0, 0]);
      mesh(group, wheelShell, trim, [0.031, radius * 0.43, radius * 0.43], [face + side * 0.012, 0, 0]);
      for (let i = 0; i < (inset ? 5 : 6); i++) {
        const angle = i * Math.PI / (inset ? 2.5 : 3);
        const lug = part(group, metal, [0.041, radius * 0.32, radius * 0.074], [face + side * 0.03, Math.cos(angle) * radius * 0.29, Math.sin(angle) * radius * 0.29]);
        lug.rotation.x = angle;
      }
    }
  }
}

// 功能：公交包括全宽风挡、分段车窗、双开门、车尾灯和线路牌。时间：2026-11-21 | 作者：lq。
function buildBus(root, paint) {
  part(root, trim, [2.12, 0.32, 10.55], [0, 0.63, 0], true);
  part(root, paint, [2.46, 1.06, 11.45], [0, 1.04, 0], true);
  part(root, white, [2.46, 1.49, 11.43], [0, 2.25, 0], true);
  part(root, white, [2.43, 0.19, 11.34], [0, 2.99, 0], true);
  part(root, trim, [2.04, 0.13, 3.92], [0, 3.079, -1.1], true);
  part(root, paint, [2.43, 0.15, 11.21], [0, 1.57, 0], true);
  for (const side of [-1, 1]) {
    const x = side * 1.231;
    part(root, trim, [0.032, 1.05, 10.75], [x, 2.17, 0], true);
    for (const z of [-4.32, -2.24, -0.16, 1.92, 4.0]) {
      part(root, glass, [0.046, 0.85, 1.82], [x, 2.18, z], true);
      part(root, white, [0.05, 0.035, 1.65], [x, 2.52, z]);
    }
    if (side > 0) {
      for (const z of [0.74, 4.07]) {
        part(root, trim, [0.063, 1.78, 1.28], [x, 1.54, z], true);
        for (const d of [-0.30, 0.30]) part(root, glass, [0.075, 1.51, 0.52], [x, 1.56, z + d], true);
      }
    }
    part(root, trim, [0.25, 0.14, 0.19], [side * 1.21, 2.31, 5.1], true);
    part(root, trim, [0.16, 0.43, 0.21], [side * 1.29, 2.18, 5.1], true);
    part(root, paint, [0.043, 0.13, 2.75], [x, 0.83, -2.15]);
  }
  for (const side of [-1, 1]) {
    const z = side * 5.725;
    part(root, trim, [2.21, 1.26, 0.053], [0, 2.18, z], true);
    part(root, glass, [2.09, 0.79, 0.072], [0, 2.10, z], true);
    part(root, trim, [0.96, 0.28, 0.083], [0, 2.69, z], true);
    part(root, white, [0.43, 0.12, 0.061], [0, 0.79, z]);
    drawLabel(root, '28', 0.22, 2.685, side * 5.777, side);
  }
  lampPair(root, 0.89, 1.05, 5.735, -5.735, 0.37);
  motorWheels(root, [-3.61, 3.8], WHEEL_RADIUS.bus, 1.04, 0.31);
}

// 功能：出租车的斜风挡、黄色车漆、顶灯、棋盘腰线和侧镜用于区分普通赛车。时间：2026-11-21 | 作者：lq。
function buildTaxi(root, paint) {
  part(root, trim, [1.60, 0.26, 4.39], [0, 0.47, 0], true);
  part(root, paint, [1.84, 0.56, 4.59], [0, 0.75, 0], true);
  part(root, paint, [1.72, 0.28, 1.16], [0, 1, 1.45], true);
  const cabin = box.clone();
  const vertices = cabin.attributes.position;
  for (let i = 0; i < vertices.count; i++) {
    if (vertices.getY(i) > 0) {
      vertices.setX(i, vertices.getX(i) * 0.87);
      vertices.setZ(i, vertices.getZ(i) * 0.67 - 0.04);
    }
  }
  cabin.computeVertexNormals();
  mesh(root, cabin, glass, [1.66, 0.59, 2.72], [0, 1.19, -0.18]);
  part(root, paint, [1.47, 0.1, 1.89], [0, 1.49, -0.28], true);
  part(root, trim, [0.63, 0.08, 0.33], [0, 1.56, -0.30], true);
  part(root, sign, [0.58, 0.18, 0.29], [0, 1.63, -0.30], true);
  for (const side of [-1, 1]) {
    const x = side * 0.925;
    const pillar = part(root, trim, [0.045, 0.5, 0.09], [side * 0.789, 1.25, -0.29]);
    pillar.rotation.z = side * 0.18;
    part(root, paint, [0.23, 0.16, 0.23], [x, 1.17, 0.58], true);
    for (const y of [0.835, 0.895]) {
      for (let i = 0; i < 9; i++) {
        part(root, trim, [0.011, 0.057, 0.12], [x, y, -0.98 + i * 0.24 + (y > 0.85 ? 0.12 : 0)]);
      }
    }
    for (const z of [-0.99, 0.19]) part(root, trim, [0.025, 0.036, 0.20], [x, 0.985, z], true);
  }
  part(root, trim, [1.12, 0.14, 0.072], [0, 0.71, 2.293], true);
  part(root, trim, [1.34, 0.12, 0.072], [0, 0.54, -2.273], true);
  part(root, white, [0.43, 0.11, 0.074], [0, 0.73, -2.278]);
  lampPair(root, 0.65, 0.9, 2.27, -2.285, 0.35);
  motorWheels(root, [-1.40, 1.40], WHEEL_RADIUS.taxi, 0.79, 0.25, true);
  drawLabel(root, 'TAXI', 0.086, 1.65, -0.15, 1, trim);
  drawLabel(root, 'TAXI', 0.086, 1.65, -0.45, -1, trim);
}

// 功能：用几何笔画制作可随 GLB 导出的路线编号和出租标识。时间：2026-11-21 | 作者：lq。
const GLYPHS = {
  '2': ['###', '  #', '###', '#  ', '###'],
  '8': ['###', '# #', '###', '# #', '###'],
  T: ['###', ' # ', ' # ', ' # ', ' # '],
  A: [' # ', '# #', '###', '# #', '# #'],
  X: ['# #', '# #', ' # ', '# #', '# #'],
  I: ['###', ' # ', ' # ', ' # ', '###'],
};

function drawLabel(root, text, height, y, z, side, surface = sign) {
  const dot = height / 5;
  [...text].forEach((letter, index) => {
    GLYPHS[letter].forEach((row, v) => {
      [...row].forEach((pixel, u) => {
        if (pixel === '#') part(root, surface, [dot, dot, 0.005], [side * (index * 4 + u - (text.length * 4 - 2) / 2) * dot, y + (2 - v) * dot, z]);
      });
    });
  });
}

// 功能：双轮带轮圈、轮辐和车架，曲柄、双腿与车轮有独立转轴。时间：2026-11-21 | 作者：lq。
function buildBicycle(root, paint) {
  const radius = WHEEL_RADIUS.bicycle;
  for (const [i, z] of [-0.59, 0.59].entries()) {
    const wheel = pivot(root, `Wheel_${i}`, [0, radius, z]);
    mesh(wheel, bikeTire, rubber, [1, 1, 1], [0, 0, 0]);
    mesh(wheel, bikeRim, metal, [1, 1, 1], [0, 0, 0]);
    for (let spoke = 0; spoke < 8; spoke++) {
      const a = spoke * Math.PI / 4;
      beam(wheel, metal, [0, 0, 0], [0, Math.sin(a) * 0.287, Math.cos(a) * 0.287], 0.006);
    }
  }
  const seat = [0, 0.92, -0.26];
  const pedal = [0, 0.43, -0.11];
  const head = [0, 0.82, 0.39];
  const rear = [0, radius, -0.59];
  for (const [a, b] of [[head, seat], [head, pedal], [seat, pedal], [seat, rear], [pedal, rear], [head, [0, radius, 0.59]]]) {
    beam(root, paint, a, b, 0.027);
  }
  part(root, rubber, [0.22, 0.07, 0.27], [0, 0.97, -0.26], true);
  beam(root, metal, head, [0, 1.06, 0.44], 0.023);
  beam(root, rubber, [-0.30, 1.06, 0.48], [0.30, 1.06, 0.48], 0.022);
  part(root, tail, [0.13, 0.085, 0.04], [0, 0.87, -0.43], true);
  part(root, headlamp, [0.11, 0.075, 0.095], [0, 1.04, 0.52], true);

  const crank = pivot(root, 'Crank', pedal);
  for (const side of [-1, 1]) {
    const end = [side * 0.16, side * 0.12, 0];
    beam(crank, metal, [side * 0.12, 0, 0], end, 0.018);
    part(crank, trim, [0.11, 0.038, 0.065], end, true);
    const upper = pivot(root, `Thigh_${side}`, [side * 0.105, 1.01, -0.24]);
    beam(upper, trousers, [0, 0, 0], [0, -0.35, 0], 0.074);
    const lower = pivot(root, `Shin_${side}`, [side * 0.16, 0.68, -0.04]);
    beam(lower, trousers, [0, 0, 0], [0, -0.40, 0], 0.056);
    const shoe = pivot(root, `Shoe_${side}`, [side * 0.16, 0.51, -0.11]);
    part(shoe, rubber, [0.12, 0.075, 0.22], [0, 0.024, 0.05], true);

    const shoulder = [side * 0.154, 1.38, 0.06];
    const elbow = [side * 0.23, 1.15, 0.18];
    beam(root, paint, shoulder, elbow, 0.069);
    beam(root, skin, elbow, [side * 0.26, 1.06, 0.48], 0.038);
  }
  const jersey = part(root, paint, [0.35, 0.47, 0.23], [0, 1.22, -0.09], true);
  jersey.rotation.x = 0.59;
  part(root, white, [0.263, 0.065, 0.09], [0, 1.26, -0.23]);
  mesh(root, sphere, skin, [0.105, 0.126, 0.103], [0, 1.54, 0.19]);
  mesh(root, sphere, white, [0.122, 0.076, 0.137], [0, 1.633, 0.18]);
  part(root, trim, [0.20, 0.036, 0.12], [0, 1.61, 0.27], true);
}

// 功能：穿外套和背包的行人，四肢按步幅摆动。时间：2026-11-21 | 作者：lq。
function buildPedestrian(root, paint) {
  part(root, paint, [0.36, 0.51, 0.23], [0, 1.18, 0], true);
  part(root, trousers, [0.31, 0.19, 0.20], [0, 0.93, 0], true);
  part(root, trim, [0.265, 0.345, 0.155], [0, 1.22, -0.15], true);
  part(root, white, [0.167, 0.043, 0.018], [0, 1.23, -0.233], true);
  mesh(root, sphere, skin, [0.108, 0.137, 0.106], [0, 1.58, 0.017]);
  mesh(root, sphere, trim, [0.115, 0.066, 0.112], [0, 1.667, 0.001]);
  part(root, trim, [0.174, 0.033, 0.105], [0, 1.642, 0.101], true);
  for (const side of [-1, 1]) {
    const leg = pivot(root, `Leg_${side}`, [side * 0.09, 0.9, 0]);
    beam(leg, trousers, [0, 0, 0], [0, -0.40, 0.02], 0.077);
    beam(leg, trousers, [0, -0.38, 0.02], [0, -0.81, -0.02], 0.064);
    part(leg, white, [0.145, 0.088, 0.26], [0, -0.855, 0.053], true);
    const arm = pivot(root, `Arm_${side}`, [side * 0.19, 1.38, 0]);
    beam(arm, paint, [0, 0, 0], [side * 0.049, -0.30, 0.015], 0.068);
    beam(arm, paint, [side * 0.049, -0.28, 0.015], [side * 0.052, -0.49, 0.048], 0.046);
    mesh(arm, sphere, skin, [0.049, 0.064, 0.043], [side * 0.053, -0.53, 0.063]);
  }
}

const BUILDERS = { bus: buildBus, taxi: buildTaxi, bicycle: buildBicycle, pedestrian: buildPedestrian };

export function makeTrafficModels() {
  const models = {};
  for (const [kind, build] of Object.entries(BUILDERS)) {
    const root = new T.Group();
    root.name = kind;
    const paint = material(PAINT[kind][0], { roughness: 0.46, metalness: kind === 'pedestrian' ? 0 : 0.11 });
    paint.name = 'TrafficPaint';
    build(root, paint);
    compact(root);
    const colors = PAINT[kind].map((color) => {
      const surface = paint.clone();
      surface.color.set(color);
      return surface;
    });
    models[kind] = (variant = 0) => {
      const model = root.clone();
      model.traverse((object) => {
        if (object.material === paint) object.material = colors[variant];
      });
      return model;
    };
  }
  return models;
}

// 功能：用路面行进距离驱动轮轴、步态和脚踏，暂停或停车时保持当前姿势。时间：2026-11-21 | 作者：lq。
export function trafficAnimation(model, kind) {
  const wheels = model.children.filter(({ name }) => name.startsWith('Wheel_'));
  const limbs = [-1, 1].map((side) => ({
    side,
    leg: model.getObjectByName(`Leg_${side}`),
    arm: model.getObjectByName(`Arm_${side}`),
    thigh: model.getObjectByName(`Thigh_${side}`),
    shin: model.getObjectByName(`Shin_${side}`),
    shoe: model.getObjectByName(`Shoe_${side}`),
  }));
  const crank = model.getObjectByName('Crank');
  const down = new T.Vector3(0, -1, 0);
  const knee = new T.Vector3();
  const direction = new T.Vector3();
  return (travel, phase = 0) => {
    for (const wheel of wheels) wheel.rotation.x = travel / WHEEL_RADIUS[kind];
    if (kind === 'pedestrian') {
      const stride = Math.sin((travel / 1.48 + phase) * Math.PI * 2);
      for (const { side, leg, arm } of limbs) {
        leg.rotation.x = side * stride * 0.33;
        arm.rotation.x = -side * stride * 0.29;
      }
    }
    if (crank) {
      const angle = (travel / 4.4 + phase) * Math.PI * 2;
      crank.rotation.x = angle;
      for (const { side, thigh, shin, shoe } of limbs) {
        shoe.position.set(side * 0.16, 0.456 + side * Math.cos(angle) * 0.12, -0.11 + side * Math.sin(angle) * 0.12);
        direction.subVectors(shoe.position, thigh.position);
        const length = direction.length();
        direction.divideScalar(length);
        const along = (0.35 ** 2 - 0.40 ** 2 + length ** 2) / (2 * length);
        const bend = Math.sqrt(Math.max(0, 0.35 ** 2 - along ** 2));
        knee.copy(thigh.position).addScaledVector(direction, along);
        knee.y += direction.z * bend;
        knee.z -= direction.y * bend;
        shin.position.copy(knee);
        thigh.quaternion.setFromUnitVectors(down, direction.subVectors(knee, thigh.position).normalize());
        shin.quaternion.setFromUnitVectors(down, direction.subVectors(shoe.position, knee).normalize());
      }
    }
  };
}
