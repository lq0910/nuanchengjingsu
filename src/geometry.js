/**
 * 功能：批量生成桥梁梁柱、轨道标记和场景实例，控制渲染提交次数。
 * 时间：2026-11-20 | 作者：lq
 */
import * as T from 'three';

export function random(seed) {
  return () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) | 0;
    return (seed >>> 0) / 4294967296;
  };
}

export function material(color, options = {}) {
  return new T.MeshStandardMaterial({ color, roughness: 0.72, ...options });
}

export class Batch {
  constructor(geometry, surface) {
    this.geometry = geometry;
    this.surface = surface;
    this.transforms = [];
    this.colors = [];
    this.object = new T.Object3D();
  }

  // 功能：允许道路标线沿纵坡俯仰，同时保持既有的平面实例接口。时间：2026-11-20 | 作者：lq。
  add(position, scale, yaw = 0, color, pitch = 0) {
    this.object.position.fromArray(position);
    this.object.scale.fromArray(scale);
    this.object.rotation.set(pitch, yaw, 0, 'YXZ');
    this.save(color);
  }

  beam(start, end, width, depth = width, color) {
    const a = new T.Vector3(...start);
    const b = new T.Vector3(...end);
    const direction = b.clone().sub(a);
    this.object.position.copy(a).lerp(b, 0.5);
    this.object.scale.set(width, direction.length(), depth);
    this.object.quaternion.setFromUnitVectors(new T.Vector3(0, 1, 0), direction.normalize());
    this.save(color);
  }

  save(color) {
    this.object.updateMatrix();
    this.transforms.push(this.object.matrix.clone());
    this.colors.push(color);
  }

  finish(parent) {
    if (!this.transforms.length) return;
    const mesh = new T.InstancedMesh(this.geometry, this.surface, this.transforms.length);
    this.transforms.forEach((matrix, index) => {
      mesh.setMatrixAt(index, matrix);
      if (this.colors[index] !== undefined) mesh.setColorAt(index, new T.Color(this.colors[index]));
    });
    mesh.computeBoundingSphere();
    parent.add(mesh);
    return mesh;
  }
}

// 沿着三维曲线扫掠矩形截面，得到连续的箱形拱肋。
export function rectangularSweep(samples, width, depth, surface) {
  const positions = [];
  const indices = [];
  const edges = [[-1, -1], [1, -1], [1, 1], [-1, 1]];
  samples.forEach((p, i) => {
    const tangent = samples[Math.min(i + 1, samples.length - 1)].clone().sub(samples[Math.max(i - 1, 0)]).normalize();
    const side = new T.Vector3(1, 0, 0).addScaledVector(tangent, -tangent.x).normalize();
    const normal = new T.Vector3().crossVectors(tangent, side);
    edges.forEach(([u, v]) => positions.push(...p.clone().addScaledVector(side, u * width / 2).addScaledVector(normal, v * depth / 2).toArray()));
    if (i === 0) return;
    for (let e = 0; e < 4; e++) {
      const a = (i - 1) * 4 + e;
      const b = (i - 1) * 4 + (e + 1) % 4;
      indices.push(a, b, b + 4, a, b + 4, a + 4);
    }
  });
  const last = positions.length / 3 - 4;
  indices.push(0, 2, 1, 0, 3, 2, last, last + 1, last + 2, last, last + 2, last + 3);
  const geometry = new T.BufferGeometry();
  geometry.setAttribute('position', new T.Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  const flat = geometry.toNonIndexed();
  flat.computeVertexNormals();
  geometry.dispose();
  return new T.Mesh(flat, surface);
}
