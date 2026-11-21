/**
 * 功能：按 RS5 车身尺寸检测双车接触，在赛道坐标中分离车身并交换冲量。
 * 时间：2026-11-20 | 作者：lq
 */
import { courseGap, RADIUS, ROAD, sample } from './course.js';

// GLB 包络约 2.06 × 4.73 米，留少量余量避免反光镜一擦就弹开。
const RS5 = { halfWidth: 0.99, halfLength: 2.32, height: 1.4, mass: 1, radius: Math.hypot(0.99, 2.32) };

// 功能：按轮廓和长宽约束护栏，公交、自行车和行人分别使用自身尺寸。时间：2026-11-21 | 作者：lq。
export function laneLimit(heading, { halfWidth, halfLength } = RS5) {
  return ROAD - Math.max(1.1, halfWidth * Math.abs(Math.cos(heading)) + halfLength * Math.abs(Math.sin(heading)));
}

function body(car) {
  const track = sample(car.distance);
  const { dx, dz } = track;
  const sin = Math.sin(car.heading);
  const cos = Math.cos(car.heading);
  const fx = dx * cos - dz * sin;
  const fz = dz * cos + dx * sin;
  return {
    shape: car.collider ?? RS5,
    track, fx, fz, sx: -fz, sz: fx,
    x: track.x - dz * car.offset, z: track.z + dx * car.offset,
    vx: dx * car.velocity - dz * car.lateral, vz: dz * car.velocity + dx * car.lateral,
  };
}

function extent(car, nx, nz) {
  return car.shape.halfLength * Math.abs(car.fx * nx + car.fz * nz)
    + car.shape.halfWidth * Math.abs(car.sx * nx + car.sz * nz);
}

function shift(car, { track }, x, z) {
  const { dx, dz, turn } = track;
  const limit = laneLimit(car.heading, car.collider);
  car.distance += (dx * x + dz * z) / (1 - turn * car.offset / RADIUS);
  car.offset = Math.max(-limit, Math.min(limit, car.offset - dz * x + dx * z));
}

function impulse(car, { track }, x, z) {
  // 功能：轻型道路使用者受推挤后降回自身速度档，避免被持续顶到赛车速度。时间：2026-11-21 | 作者：lq。
  const speed = car.velocity + track.dx * x + track.dz * z;
  car.velocity = Math.max(0, Math.min(car.collider?.maxImpactSpeed ?? Infinity, speed));
  car.lateral += -track.dz * x + track.dx * z;
}

export function collide(a, b) {
  // 功能：先按实际车长与环线坐标粗筛，再检测水平四轴和垂直包络。时间：2026-11-21 | 作者：lq。
  const shapeA = a.collider ?? RS5;
  const shapeB = b.collider ?? RS5;
  const reach = shapeA.radius + shapeB.radius;
  if (Math.abs(courseGap(a.distance, b.distance)) > reach * 1.14) return null;
  const first = body(a);
  const second = body(b);
  // 功能：以各自路面为高度基准，公交在长坡上的车头、车尾仍可碰撞。时间：2026-11-21 | 作者：lq。
  const heightA = a.airborne ? a.height - first.track.y : 0;
  const heightB = b.airborne ? b.height - second.track.y : 0;
  if (heightA >= heightB + shapeB.height || heightB >= heightA + shapeA.height) return null;
  const x = second.x - first.x;
  const z = second.z - first.z;
  if (x * x + z * z > reach ** 2) return null;

  // 在两辆车的纵轴、横轴上分别检查投影，沿重叠量最小的一轴推出。
  let depth = Infinity, nx = 0, nz = 0;
  for (const car of [first, second]) {
    for (const [ax, az] of [[car.fx, car.fz], [car.sx, car.sz]]) {
      const projection = x * ax + z * az;
      const overlap = extent(first, ax, az) + extent(second, ax, az) - Math.abs(projection);
      if (overlap <= 0) return null;
      if (overlap < depth) {
        depth = overlap;
        const sign = projection < 0 ? -1 : 1;
        nx = sign * ax;
        nz = sign * az;
      }
    }
  }

  // 功能：按街机质量分配分离距离和冲量，护栏挡住的一部分交给另一方。时间：2026-11-21 | 作者：lq。
  const shareA = shapeB.mass / (shapeA.mass + shapeB.mass);
  const correctionA = (depth + 0.012) * shareA;
  const correctionB = depth + 0.012 - correctionA;
  const normalMove = (car, before) => {
    const after = body(car);
    return (after.x - before.x) * nx + (after.z - before.z) * nz;
  };
  shift(a, first, -nx * correctionA, -nz * correctionA);
  shift(b, second, nx * correctionB, nz * correctionB);
  const movedA = Math.max(0, -normalMove(a, first));
  const movedB = Math.max(0, normalMove(b, second));
  if (movedA < correctionA) shift(b, second, nx * (correctionA - movedA), nz * (correctionA - movedA));
  if (movedB < correctionB) shift(a, first, -nx * (correctionB - movedB), -nz * (correctionB - movedB));

  // 仅在互相靠近时施加低弹性冲量，分离中的车不会被再次撞飞。
  const closing = (first.vx - second.vx) * nx + (first.vz - second.vz) * nz;
  if (closing <= 0) return 0;
  const pushA = closing * 1.08 * shareA;
  const pushB = closing * 1.08 - pushA;
  impulse(a, first, -nx * pushA, -nz * pushA);
  impulse(b, second, nx * pushB, nz * pushB);
  return closing;
}
