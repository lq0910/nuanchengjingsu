/**
 * 功能：在环线生成并驱动行人、骑行者、公交和出租车，处理跟车与临时改道。
 * 时间：2026-11-21 | 作者：lq
 */
import { courseGap, LAP, RADIUS, sample } from './course.js';
import { laneLimit } from './collision.js';
import { CHECK_SPEED } from './road-events.js';

// 功能：街机质量用于碰撞反馈，实际宽度、长度和高度用于接触检测。时间：2026-11-21 | 作者：lq。
const TYPES = {
  bus: { count: 4, size: [2.56, 11.6, 3.15], mass: 1.9, lane: 2.55, workLane: 2.55, speed: [10, 14] },
  taxi: { count: 5, size: [1.86, 4.62, 1.75], mass: 1, lane: 2.55, workLane: 2.55, speed: [14, 20] },
  bicycle: { count: 6, size: [0.68, 1.88, 1.76], mass: 0.58, lane: 6.6, workLane: 5.65, speed: [4.2, 6.4], maxImpactSpeed: 10 },
  pedestrian: { count: 6, size: [0.61, 0.64, 1.74], mass: 0.42, lane: 8.55, workLane: 8.1, speed: [1.2, 1.8], maxImpactSpeed: 3.4 },
};
const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

// 功能：每次发车重新抽签，在全环分配起始间距，给发车区和车尾留出空间。时间：2026-11-21 | 作者：lq。
export function planTraffic(start, random = Math.random) {
  const kinds = Object.entries(TYPES).flatMap(([kind, { count }]) => Array(count).fill(kind));
  for (let i = kinds.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [kinds[i], kinds[j]] = [kinds[j], kinds[i]];
  }
  const firstVehicle = kinds.findIndex((kind) => kind === 'bus' || kind === 'taxi');
  [kinds[0], kinds[firstVehicle]] = [kinds[firstVehicle], kinds[0]];
  return kinds.map((kind, id) => {
    const { size: [width, length, height], mass, lane, workLane, speed, maxImpactSpeed } = TYPES[kind];
    const distance = start + 49 + id * LAP / kinds.length + random() * 18;
    const offset = (random() < 0.5 ? -1 : 1) * lane;
    const cruise = speed[0] + random() * (speed[1] - speed[0]);
    return {
      id, kind, variant: Math.floor(random() * 4), distance, offset, laneOffset: offset, workLane,
      velocity: cruise, cruise, lateral: 0, heading: 0, travel: 0,
      collider: { halfWidth: width / 2, halfLength: length / 2, height, mass, radius: Math.hypot(width, length) / 2, maxImpactSpeed },
    };
  });
}

// 功能：根据前车间距分配制动距离，雨天提前减速。时间：2026-11-21 | 作者：lq。
function followingSpeed(car, traffic, offset, width, braking, range = 110) {
  let speed = Infinity;
  for (const other of traffic) {
    if (other === car || Math.abs(other.offset - offset) >= width + other.collider.halfWidth + 0.35) continue;
    const gap = courseGap(car.distance, other.distance);
    if (gap <= 0 || gap > range) continue;
    const clearance = gap - (car.collider?.halfLength ?? 2.32) - other.collider.halfLength - 2.7;
    speed = Math.min(speed, Math.sqrt(other.velocity ** 2 + braking * Math.max(0, clearance)) - Math.max(0, -clearance));
  }
  return Math.max(0, speed);
}

// 功能：按比赛所在圈的活动路段跟随临检限速和施工并道，暂停时由比赛停止调用。时间：2026-11-21 | 作者：lq。
export function advanceTraffic(traffic, events, playerDistance, wet, dt) {
  const activeEvents = events.filter(({ distance }) => distance >= playerDistance - 92 && distance < playerDistance + LAP - 92);
  for (const actor of traffic) {
    let targetOffset = actor.laneOffset;
    let speed = actor.cruise * (wet ? 0.86 : 1);
    for (const event of activeEvents) {
      const gap = courseGap(actor.distance, event.distance);
      if (gap < -(event.end - event.distance) - 12 || gap > 100) continue;
      if (event.kind === 'work') targetOffset = event.openSide * actor.workLane;
      else speed = Math.min(speed, CHECK_SPEED / 3.6 - 0.8);
    }
    speed = Math.min(speed, followingSpeed(actor, traffic, actor.offset, actor.collider.halfWidth, wet ? 4 : 6, 48));
    const road = sample(actor.distance);
    actor.velocity += clamp(speed - actor.velocity, -12 * dt, 2.8 * dt);
    actor.distance += actor.velocity * dt / ((1 - road.turn * actor.offset / RADIUS) * Math.hypot(1, road.grade));
    actor.travel += actor.velocity * dt;
    const steer = clamp((targetOffset - actor.offset) * 2.6, -2.8, 2.8);
    actor.lateral += (steer - actor.lateral) * (1 - Math.exp(-6 * dt));
    actor.heading += (clamp(Math.atan2(actor.lateral, Math.max(2, actor.velocity)), -0.25, 0.25) - actor.heading) * (1 - Math.exp(-8 * dt));
    const limit = laneLimit(actor.heading, actor.collider);
    actor.offset = clamp(actor.offset + actor.lateral * dt, -limit, limit);
    if (Math.abs(actor.offset) === limit) actor.lateral = 0;
  }
}

// 功能：AI 在安全车道超越慢车，施工时只在开放侧选线，变线前仍按当前车道制动。时间：2026-11-21 | 作者：lq。
export function trafficApproach(car, traffic, preferred, openSide, wet) {
  let offset = preferred;
  const obstructed = (lane) => traffic.some((actor) => {
    if (Math.abs(lane - actor.offset) >= 1.42 + actor.collider.halfWidth) return false;
    const gap = courseGap(car.distance, actor.distance);
    return gap >= -12 && gap <= 100;
  });
  if (obstructed(preferred)) {
    const lanes = openSide ? [7.35 * openSide, 2.45 * openSide] : [preferred - 3.65, preferred + 3.65];
    offset = lanes.filter((lane) => Math.abs(lane) <= 7.65 && !obstructed(lane))
      .sort((a, b) => Math.abs(car.offset - a) - Math.abs(car.offset - b))[0] ?? preferred;
  }
  return { offset, speed: followingSpeed(car, traffic, car.offset, 0.99, wet ? 12 : 17) };
}
