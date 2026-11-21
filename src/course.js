/**
 * 功能：定义加长的双桥环线及岸上坡面，供建模、驾驶和小地图共用。
 * 时间：2026-11-20 | 作者：lq
 */
export const RADIUS = 94;
export const STRAIGHT = 350;
export const ROAD = 10;
export const DECK = 5.5;
export const TURN = Math.PI * RADIUS;
export const LAP = 4 * STRAIGHT + 2 * TURN;
export const GRID = STRAIGHT - 135;
export const SECTORS = [
  { name: '白翼双拱桥', english: 'WHITE ARCH', start: GRID },
  { name: '双塔斜拉桥', english: 'TWIN PYLONS', start: 2 * STRAIGHT + TURN + GRID },
];

// 功能：两岸出桥后的独立山坡，桥面、发车区及半圆弯保持水平。时间：2026-11-20 | 作者：lq。
export const HILLS = [
  { name: '北岸飞跃坡', start: STRAIGHT + 133, length: 204, rise: 15 },
  { name: '南岸飞跃坡', start: 3 * STRAIGHT + TURN + 133, length: 210, rise: 16 },
];
export const EMBANKMENT = 23;

// 功能：四次正弦让坡面首尾的高度、坡度、曲率都平滑接入平路。时间：2026-11-20 | 作者：lq。
export function roadProfile(s) {
  const hill = HILLS.find(({ start, length }) => s > start && s < start + length);
  if (!hill) return { y: DECK, grade: 0, curvature: 0, hill: null };
  const k = Math.PI / hill.length;
  const a = (s - hill.start) * k;
  const sin = Math.sin(a), cos = Math.cos(a);
  return {
    y: DECK + hill.rise * sin ** 4,
    grade: 4 * hill.rise * k * sin ** 3 * cos,
    curvature: 4 * hill.rise * k ** 2 * (3 * sin ** 2 * cos ** 2 - sin ** 4),
    hill,
  };
}

// 功能：以两个直线段和两个半圆组成连续的平面路线，距离单位为米。时间：2026-11-20 | 作者：lq。
function horizontal(s) {
  if (s < 2 * STRAIGHT) return { x: -RADIUS, z: STRAIGHT - s, dx: 0, dz: -1, turn: 0 };
  if (s < 2 * STRAIGHT + TURN) {
    const a = (s - 2 * STRAIGHT) / RADIUS;
    return { x: -RADIUS * Math.cos(a), z: -STRAIGHT - RADIUS * Math.sin(a), dx: Math.sin(a), dz: -Math.cos(a), turn: 1 };
  }
  if (s < 4 * STRAIGHT + TURN) {
    return { x: RADIUS, z: -STRAIGHT + s - 2 * STRAIGHT - TURN, dx: 0, dz: 1, turn: 0 };
  }
  const a = (s - 4 * STRAIGHT - TURN) / RADIUS;
  return { x: RADIUS * Math.cos(a), z: STRAIGHT + RADIUS * Math.sin(a), dx: -Math.sin(a), dz: Math.cos(a), turn: 1 };
}

export function sample(distance) {
  const s = ((distance % LAP) + LAP) % LAP;
  return { ...horizontal(s), ...roadProfile(s) };
}

// 功能：计算跨起跑线的有符号最短距离，正值表示目标在前方。时间：2026-11-21 | 作者：lq。
export function courseGap(from, to) {
  const gap = to - from;
  return gap - Math.round(gap / LAP) * LAP;
}

// 功能：已有绝对桥面高度叠加坡面高差，路肩、护栏和灯杆随坡。时间：2026-11-20 | 作者：lq。
export function point(s, offset = 0, y = DECK) {
  const { x, y: roadY, z, dx, dz } = sample(s);
  return [x - dz * offset, y + roadY - DECK, z + dx * offset];
}

// 功能：预留加长路线周围的树木和街区净空。时间：2026-11-20 | 作者：lq。
export function distanceToCourse(x, z) {
  return Math.abs(Math.hypot(x, Math.max(0, Math.abs(z) - STRAIGHT)) - RADIUS);
}
