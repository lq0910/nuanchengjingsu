/**
 * 功能：把 Audi GLB 烘焙在一起的左右轮拆到独立轴心，保留原网格、材质和刹车卡钳。
 * 时间：2026-11-20 | 作者：lq
 */
import * as T from 'three';

// 功能：左右两侧共享原顶点属性，只拆分不跨车身中轴的三角形索引。时间：2026-11-20 | 作者：lq。
function splitWheelMesh(source, toModel, pivots) {
  const { geometry } = source;
  const position = geometry.getAttribute('position');
  const index = geometry.getIndex();
  const sides = [[], []];
  const vertex = new T.Vector3();
  const x = new Float32Array(position.count);
  for (let i = 0; i < position.count; i++) x[i] = vertex.fromBufferAttribute(position, i).applyMatrix4(toModel).x;
  const count = index ? index.count : position.count;
  for (let i = 0; i < count; i += 3) {
    const a = index ? index.getX(i) : i;
    const b = index ? index.getX(i + 1) : i + 1;
    const c = index ? index.getX(i + 2) : i + 2;
    sides[Number(x[a] + x[b] + x[c] > 0)].push(a, b, c);
  }
  return sides.map((indices, side) => {
    if (!indices.length) return null;
    const half = new T.BufferGeometry();
    for (const [name, attribute] of Object.entries(geometry.attributes)) half.setAttribute(name, attribute);
    half.setIndex(indices);
    const box = new T.Box3();
    for (const i of indices) box.expandByPoint(vertex.fromBufferAttribute(position, i));
    half.boundingBox = box;
    half.boundingSphere = box.getBoundingSphere(new T.Sphere());
    const mesh = new T.Mesh(half, source.material);
    const offset = pivots[side].position.clone().negate();
    new T.Matrix4().makeTranslation(offset).multiply(toModel).decompose(mesh.position, mesh.quaternion, mesh.scale);
    return mesh;
  });
}

// 功能：轮胎节点的原点决定轴心，轮毂和制动盘按轴距归组；车钳不参与滚动。时间：2026-11-20 | 作者：lq。
export function prepareWheels(model) {
  model.updateWorldMatrix(true, true);
  const toRoot = model.matrixWorld.clone().invert();
  const parts = model.children.filter((node) => /^(Tire|Rims|BrakeDisk)_?Front/.test(node.name));
  const tires = parts.filter((node) => node.name.startsWith('Tire')).sort((a, b) => b.position.z - a.position.z);
  if (tires.length !== 2) return [];
  const axles = tires.map((tire, axle) => {
    const center = tire.getWorldPosition(new T.Vector3()).applyMatrix4(toRoot);
    const bounds = new T.Box3().setFromObject(tire).applyMatrix4(toRoot);
    const radius = (bounds.max.y - bounds.min.y) / 2;
    const pivots = [-1, 1].map((sign) => {
      const pivot = new T.Group();
      pivot.name = `WheelSpin_${axle}_${sign < 0 ? 'negative' : 'positive'}`;
      pivot.position.copy(center);
      pivot.position.x = sign * Math.abs(center.x);
      pivot.userData.radius = radius;
      return pivot;
    });
    return { z: center.z, pivots };
  });
  for (const part of parts) {
    const { pivots } = Math.abs(part.position.z - axles[0].z) < Math.abs(part.position.z - axles[1].z) ? axles[0] : axles[1];
    part.traverse((mesh) => {
      if (!mesh.isMesh) return;
      const toModel = toRoot.clone().multiply(mesh.matrixWorld);
      splitWheelMesh(mesh, toModel, pivots).forEach((half, side) => { if (half) pivots[side].add(half); });
    });
    part.removeFromParent();
  }
  const wheels = axles.flatMap(({ pivots }) => pivots);
  model.add(...wheels);
  return wheels.map(({ name }) => name);
}

// 功能：按车轮真实半径换算滚动角，使用固定物理步累计的位移而不是渲染帧数。时间：2026-11-20 | 作者：lq。
export function rollWheels(wheels, distance) {
  for (const wheel of wheels) wheel.rotation.x = (distance / wheel.userData.radius) % (Math.PI * 2);
}
