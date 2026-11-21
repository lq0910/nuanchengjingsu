/**
 * 功能：生成环线临检和施工，并为每辆车独立处理通行、降速和恢复。
 * 时间：2026-11-21 | 作者：lq
 */
import { LAP, SECTORS } from './course.js';

export const CHECK_SPEED = 45;
export const EVENT_NOTICE = 175;
const CHECK_DELAY = 1.6;
const WORK_LENGTH = 36;
const WORK_OPEN_EDGE = 0.95;
const SITES = SECTORS.map(({ start }) => start + 212);
const MODES = ['mixed', 'checkpoint', 'work', 'off'];

export const normalizeEventMode = (mode) => MODES.includes(mode) ? mode : 'mixed';

// 功能：随机交换两岸项目，后续圈轮换；事件只放在桥头与飞坡之间的直道。时间：2026-11-21 | 作者：lq。
export function planRoadEvents(start, laps, mode, random = Math.random) {
  if (mode === 'off') return [];
  const firstKind = Number(random() < 0.5);
  const sites = SITES.map((distance) => ((distance - start) % LAP + LAP) % LAP).sort((a, b) => a - b);
  return Array.from({ length: laps }, (_, lap) => sites.map((site, index) => {
    const kind = mode === 'mixed' ? ['checkpoint', 'work'][(firstKind + lap + index) % 2] : mode;
    const distance = start + lap * LAP + site;
    return { kind, distance, end: distance + (kind === 'work' ? WORK_LENGTH : 0), openSide: random() < 0.5 ? -1 : 1 };
  })).flat();
}

export function roadEventFor(car, events) {
  return events[car.eventIndex];
}

// 功能：AI 和玩家遵循同一限速线；AI 根据刹车距离提前收油并完成施工并道。时间：2026-11-21 | 作者：lq。
export function eventApproach(car, events, wet) {
  const event = roadEventFor(car, events);
  if (!event) return null;
  const gap = event.distance - car.distance;
  if (gap > EVENT_NOTICE) return null;
  const speed = event.kind === 'checkpoint' ? (CHECK_SPEED - 3) / 3.6 : 36;
  return {
    speed: Math.sqrt(speed ** 2 + (wet ? 12 : 16) * Math.max(0, gap - 3)),
    offset: event.kind === 'work' ? event.openSide * 4.35 : null,
  };
}

// 功能：超速车辆先停在检查线，计时结束后自动放行；压入封闭车道会掉速并引导回开放侧。时间：2026-11-21 | 作者：lq。
export function restrictRoadTravel(car, events, previous, dt) {
  if (car.checkHold > 0) {
    car.checkHold = Math.max(0, car.checkHold - dt);
    car.distance = previous;
    car.velocity = 0;
    return;
  }
  const event = roadEventFor(car, events);
  if (!event || car.distance < event.distance) return;
  if (event.kind === 'checkpoint') {
    car.eventIndex++;
    car.lastCheckpoint = event;
    if (car.velocity > CHECK_SPEED / 3.6) {
      car.distance = Math.max(previous, event.distance);
      car.velocity = 0;
      car.checkHold = CHECK_DELAY;
      car.boosting = false;
    }
    return;
  }
  if (previous <= event.end && car.offset * event.openSide < WORK_OPEN_EDGE && !car.airborne) {
    car.workContact = true;
    car.velocity = Math.min(car.velocity, 19);
    car.distance = Math.min(car.distance, Math.max(previous, event.distance) + 19 * dt);
    car.offset += event.openSide * Math.min(WORK_OPEN_EDGE - car.offset * event.openSide, 5 * dt);
    if (car.lateral * event.openSide < 0) car.lateral *= Math.exp(-10 * dt);
  } else {
    car.workContact = false;
  }
  if (car.distance > event.end) {
    car.eventIndex++;
    car.workContact = false;
  }
}
