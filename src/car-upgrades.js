/**
 * 功能：为 RS5 制作同色尾翼和两套凹面轮毂，沿用原车轮轴与刹车系统。
 * 时间：2026-11-21 | 作者：lq
 */
import * as T from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

function beveledShape(shape, depth, bevel) {
  return new T.ExtrudeGeometry(shape, { depth, bevelEnabled: true, bevelSize: bevel, bevelThickness: bevel, bevelSegments: 3, steps: 1 });
}

// 功能：沿车宽渐缩翼弦与厚度，翼尖顺着行李厢曲线收拢。时间：2026-11-21 | 作者：lq。
function wingBlade(raised) {
  // 剖面依次经过前缘、上表面、后缘及下表面。每组是沿翼弦的位置与相对高度。
  const profile = [[0, 0], [0.06, 0.47], [0.19, 0.67], [0.37, 0.69], [0.62, 0.56],
    [0.84, 0.32], [1, 0.04], [0.85, -0.12], [0.54, -0.27], [0.25, -0.32], [0.07, -0.25]];
  const span = raised ? 0.73 : 0.69;
  const sections = 30;
  const vertices = [];
  const indices = [];
  for (let station = 0; station <= sections; station++) {
    const x = span * (2 * station / sections - 1);
    const edge = Math.abs(x / span);
    const tip = T.MathUtils.smoothstep(edge, 0.68, 1);
    const chord = (raised ? 0.235 : 0.178) * (1 - 0.58 * tip);
    const thickness = (raised ? 0.043 : 0.046) * (1 - 0.60 * tip);
    const front = (raised ? -1.985 : -1.975) + 0.065 * edge ** 2;
    const height = (raised ? 1.147 : 1.032) - (raised ? 0.049 : 0.057) * edge ** 2;
    for (const [along, depth] of profile) {
      vertices.push(x, height + depth * thickness + along * (raised ? 0.007 : 0.050), front - along * chord);
    }
  }
  const stride = profile.length;
  for (let station = 0; station < sections; station++) {
    for (let j = 0; j < stride; j++) {
      const a = station * stride + j;
      const b = station * stride + (j + 1) % stride;
      indices.push(a, a + stride, b + stride, a, b + stride, b);
    }
  }
  for (let j = 1; j < stride - 1; j++) {
    const right = sections * stride;
    indices.push(0, j, j + 1, right, right + j + 1, right + j);
  }
  const geometry = new T.BufferGeometry();
  geometry.setAttribute('position', new T.Float32BufferAttribute(vertices, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

// 功能：低位 GT 用随车色变化的弧形短支座连接箱盖与翼面。时间：2026-11-21 | 作者：lq。
function buildSpoilers(paint) {
  const lip = new T.Mesh(wingBlade(false), paint);
  const gt = new T.Group();
  gt.add(new T.Mesh(wingBlade(true), paint));
  const pedestal = new T.Shape();
  pedestal.moveTo(-2.123, 0.981);
  pedestal.quadraticCurveTo(-2.035, 0.991, -1.975, 1.012);
  pedestal.quadraticCurveTo(-2.034, 1.037, -2.055, 1.133);
  pedestal.lineTo(-2.151, 1.133);
  pedestal.quadraticCurveTo(-2.148, 1.053, -2.182, 0.986);
  pedestal.closePath();
  const mount = beveledShape(pedestal, 0.057, 0.011).rotateY(-Math.PI / 2).translate(0.0285, 0, 0);
  for (const side of [-1, 1]) {
    const support = new T.Mesh(mount, paint);
    support.position.x = side * 0.416;
    gt.add(support);
  }
  return { lip, gt };
}

// 功能：按实测轮胎内径制作阶梯轮圈和凹面细辐条，空隙中仍可见原刹车盘。时间：2026-11-21 | 作者：lq。
function buildRim(split, reflection) {
  const shell = new T.MeshStandardMaterial({
    color: split ? '#abb2bf' : '#cbd3de', metalness: 0.78, roughness: 0.28, envMap: reflection, envMapIntensity: 1.18,
  });
  const milled = new T.MeshStandardMaterial({
    color: split ? '#c8d0da' : '#e9edf1', metalness: 0.83, roughness: 0.24, envMap: reflection, envMapIntensity: 1.17,
  });
  const hardware = new T.MeshStandardMaterial({
    color: '#6c7b8b', metalness: 0.66, roughness: 0.35, envMap: reflection, envMapIntensity: 0.89,
  });
  const face = new T.Group();
  const revolve = (points) => new T.LatheGeometry(points.map(([radius, depth]) => new T.Vector2(radius, depth)), 64).rotateX(Math.PI / 2);
  const barrel = revolve([[0.252, -0.074], [0.252, 0.028], [0.245, 0.053], [0.245, 0.088], [0.251, 0.095],
    [0.260, 0.098], [0.263, 0.118], [0.272, 0.118], [0.279, 0.108], [0.279, -0.074], [0.252, -0.074]]);
  const edge = revolve([[0.261, 0.116], [0.265, 0.125], [0.273, 0.125], [0.279, 0.114], [0.272, 0.116], [0.261, 0.116]]);
  face.add(new T.Mesh(barrel, shell), new T.Mesh(edge, milled));

  const spoke = new T.Shape();
  if (split) {
    spoke.moveTo(-0.028, 0.053);
    spoke.lineTo(0.028, 0.053);
    spoke.quadraticCurveTo(0.023, 0.112, 0.041, 0.239);
    spoke.quadraticCurveTo(0.023, 0.250, 0.014, 0.250);
    spoke.quadraticCurveTo(0.002, 0.180, 0, 0.143);
    spoke.quadraticCurveTo(-0.003, 0.135, -0.008, 0.145);
    spoke.quadraticCurveTo(-0.025, 0.191, -0.039, 0.247);
    spoke.lineTo(-0.059, 0.237);
    spoke.quadraticCurveTo(-0.049, 0.157, -0.023, 0.101);
    spoke.closePath();
  } else {
    spoke.moveTo(-0.014, 0.054);
    spoke.lineTo(0.017, 0.054);
    spoke.quadraticCurveTo(0.023, 0.150, 0.042, 0.240);
    spoke.quadraticCurveTo(0.027, 0.252, 0.013, 0.250);
    spoke.quadraticCurveTo(-0.001, 0.168, -0.014, 0.106);
    spoke.closePath();
  }
  const section = beveledShape(spoke, 0.019, 0.006);
  const positions = section.getAttribute('position');
  for (let i = 0; i < positions.count; i++) {
    const radius = Math.hypot(positions.getX(i), positions.getY(i));
    const dish = 0.058 + 0.030 * T.MathUtils.smoothstep(radius, 0.075, 0.250);
    positions.setZ(i, positions.getZ(i) + dish);
  }
  const count = split ? 5 : 10;
  const copies = Array.from({ length: count }, (_, i) => section.clone().rotateZ(i * 2 * Math.PI / count));
  face.add(new T.Mesh(mergeGeometries(copies), shell));
  copies.forEach((geometry) => geometry.dispose());
  section.dispose();

  // 中心盖和五颗螺栓压在轮毂面板中，采用不同粗糙度保持材质区分。
  const hub = revolve([[0, 0.049], [0.077, 0.049], [0.077, 0.065], [0.068, 0.082], [0.048, 0.088], [0, 0.088]]);
  const badge = revolve([[0, 0.092], [0.026, 0.092], [0.032, 0.087], [0.032, 0.082]]);
  const bolts = Array.from({ length: 5 }, (_, i) => {
    const a = i * 2 * Math.PI / 5 + 0.31;
    return new T.CylinderGeometry(0.0065, 0.0085, 0.011, 6).rotateX(Math.PI / 2)
      .translate(Math.cos(a) * 0.051, Math.sin(a) * 0.051, 0.088).toNonIndexed();
  });
  face.add(new T.Mesh(hub, shell), new T.Mesh(badge, milled), new T.Mesh(mergeGeometries(bolts), hardware));
  bolts.forEach((geometry) => geometry.dispose());
  return face;
}

// 功能：车库和比赛共用改装网格，换车漆时尾翼同步更新。时间：2026-11-21 | 作者：lq。
export function attachCarUpgrades(model, wheels, reflection) {
  const spoilerPaint = new T.MeshPhysicalMaterial({
    metalness: 0.53, roughness: 0.31, clearcoat: 0.48, clearcoatRoughness: 0.28, envMap: reflection, envMapIntensity: 0.8,
  });
  const spoilers = buildSpoilers(spoilerPaint);
  model.add(...Object.values(spoilers));
  const curved = buildRim(false, reflection);
  const silver = buildRim(true, reflection);
  const rims = wheels.map((wheel) => {
    const factory = wheel.children.filter((mesh) => mesh.material.name === 'Shiny Black Metal');
    const sport = silver.clone();
    const split = curved.clone();
    // 轮毂正面朝向车外，随原有轮轴滚动。
    sport.rotation.y = split.rotation.y = Math.sign(wheel.position.x) * Math.PI / 2;
    wheel.add(sport, split);
    return { factory, sport, split };
  });
  return ({ color, spoiler = 'stock', rims: style = 'stock' }) => {
    spoilerPaint.color.set(color);
    spoilers.lip.visible = spoiler === 'lip';
    spoilers.gt.visible = spoiler === 'gt';
    for (const { factory, sport, split } of rims) {
      factory.forEach((mesh) => { mesh.visible = style === 'stock'; });
      sport.visible = style === 'sport';
      split.visible = style === 'split';
    }
  };
}
