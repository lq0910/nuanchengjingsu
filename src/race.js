/**
 * 功能：管理起跑倒数、街机驾驶、电脑对手、加速能量、圈时和名次。
 * 时间：2026-11-20 | 作者：lq
 */
import { LAP, RADIUS, sample } from './course.js';
import { collide, laneLimit } from './collision.js';
import { eventApproach, normalizeEventMode, planRoadEvents, restrictRoadTravel } from './road-events.js';
import { advanceTraffic, planTraffic, trafficApproach } from './traffic.js';

export const TOP_SPEED = 69;
const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

// 功能：圈数限于 1–5，缺省仍是单圈；比赛开始后使用发车时的圈数。时间：2026-11-20 | 作者：lq。
export const MAX_LAPS = 5;
export function normalizeLaps(value) {
  const laps = Number(value);
  return Number.isInteger(laps) && laps >= 1 && laps <= MAX_LAPS ? laps : 1;
}

// 功能：赛车数量包含玩家，保留原有两名对手的发车位，新增对手交错排队。时间：2026-11-20 | 作者：lq。
export const DEFAULT_CARS = 3;
const RIVAL_LANES = [-2.6, 5.55, -6.05, 0.1, -3.7, 6.3, 3.8];
const RIVAL_SPEEDS = [61, 56, 59, 54, 57, 52, 55];
export const MAX_CARS = 1 + RIVAL_LANES.length;
export function normalizeCars(value) {
  const cars = Number(value);
  return Number.isInteger(cars) && cars >= 1 && cars <= MAX_CARS ? cars : DEFAULT_CARS;
}

// 功能：仅接受明确选择的雨天，兼容旧存档并保持晴天为默认。时间：2026-11-20 | 作者：lq。
export const normalizeWeather = (value) => value === 'rain' ? 'rain' : 'clear';

// 功能：坡顶失重后保持竖直惯性，用重力弹道与坡面交点计算落地。时间：2026-11-20 | 作者：lq。
const JUMP_GRAVITY = 34;
const vehicle = (distance, offset) => ({
  distance, offset, velocity: 0, lateral: 0, heading: 0, boost: 1,
  height: sample(distance).y, verticalSpeed: 0, pitch: 0, airborne: false, landing: 0, wheelTravel: 0,
  // 功能：每辆车记录自己的事件进度与停车计时。时间：2026-11-21 | 作者：lq。
  eventIndex: 0, checkHold: 0, lastCheckpoint: null, workContact: false,
});

function updateRide(car, before, forward, dt) {
  const road = sample(car.distance);
  car.landing *= Math.exp(-dt * 8);
  const speed = (car.distance - forward) / dt;
  if (!car.airborne && road.curvature * speed ** 2 < -JUMP_GRAVITY && speed > 0) {
    car.airborne = true;
    car.height = before.y;
    car.verticalSpeed = before.grade * speed;
  }
  if (car.airborne) {
    car.height += (car.verticalSpeed - JUMP_GRAVITY * dt / 2) * dt;
    car.verticalSpeed -= JUMP_GRAVITY * dt;
    const approach = road.grade * speed - car.verticalSpeed;
    if (car.height <= road.y && approach > 0) {
      car.airborne = false;
      car.landing = clamp(approach / 10, 0, 1);
    }
  }
  if (!car.airborne) {
    car.height = road.y;
    car.verticalSpeed = road.grade * speed;
  }
  const pitch = car.airborne ? Math.atan2(car.verticalSpeed, Math.max(speed, 1)) : Math.atan(road.grade);
  car.pitch += (pitch - car.pitch) * (1 - Math.exp(-dt * 14));
}

export class Race {
  // 功能：网页比赛启用城市交通，模拟调用可按需选择。时间：2026-11-21 | 作者：lq。
  constructor(startDistance, laps = 1, cars = DEFAULT_CARS, weather = 'clear', events = 'off', traffic = false) {
    this.trafficEnabled = traffic;
    this.reset(startDistance, laps, cars, weather, events);
  }

  // 功能：在发车时锁定路况，供驾驶与成绩共用。时间：2026-11-20 | 作者：lq。
  reset(startDistance, laps = 1, cars = DEFAULT_CARS, weather = 'clear', events = 'off') {
    this.startDistance = startDistance;
    this.laps = normalizeLaps(laps);
    this.weather = normalizeWeather(weather);
    // 功能：锁定本场事件安排，重赛才重新抽取。时间：2026-11-21 | 作者：lq。
    this.eventMode = normalizeEventMode(events);
    this.events = planRoadEvents(startDistance, this.laps, this.eventMode);
    this.completedLaps = 0;
    this.player = vehicle(startDistance, 2.25);
    this.rivals = Array.from({ length: normalizeCars(cars) - 1 }, (_, i) => {
      const gap = i === 0 ? 4.5 : i === 1 ? 8.5 : 14 + Math.floor((i - 2) / 2) * 6;
      return vehicle(startDistance - gap, RIVAL_LANES[i]);
    });
    // 功能：重赛重新布置交通，交通参与接触但不计入赛车名次。时间：2026-11-21 | 作者：lq。
    this.traffic = this.trafficEnabled ? planTraffic(startDistance) : [];
    const field = [this.player, ...this.rivals, ...this.traffic];
    this.collisionPairs = field.flatMap((a, i) => field.slice(i + 1).map((b) => [a, b]));
    this.status = 'menu';
    this.countdown = 3;
    this.elapsed = 0;
    this.finishTime = 0;
    // 功能：锁定冲线名次，巡航超车不再改变成绩。时间：2026-11-21 | 作者：lq。
    this.finishRank = null;
    this.impact = 0;
  }

  get rank() {
    return this.finishRank ?? 1 + this.rivals.filter((rival) => rival.distance > this.player.distance).length;
  }

  get carCount() {
    return this.rivals.length + 1;
  }

  get progress() {
    return this.status === 'finish' ? 1 : clamp((this.player.distance - this.startDistance) / (LAP * this.laps), 0, 1);
  }

  get currentLap() {
    return Math.min(this.laps, this.completedLaps + 1);
  }

  step(dt, input) {
    if (this.status === 'countdown') {
      this.countdown = Math.max(0, this.countdown - dt);
      if (!this.countdown) this.status = 'race';
      return;
    }
    // 功能：完赛后全场交给自动驾驶，忽略操作且不再累计圈数、计时。时间：2026-11-21 | 作者：lq。
    if (this.status === 'finish') {
      this.updateTraffic(dt);
      this.autopilot(this.player, -1, dt);
      this.rivals.forEach((rival, i) => this.autopilot(rival, i, dt));
      if (this.traffic.length) this.resolveContacts();
      return;
    }
    if (this.status !== 'race') return;
    const player = this.player;
    const previous = player.distance;
    const road = sample(previous);
    // 功能：湿地降低制动和转向响应，弯道更容易向外滑，离地操控独立计算。时间：2026-11-20 | 作者：lq。
    const wet = this.weather === 'rain';
    const groundGrip = wet ? 0.66 : 1;
    const traction = player.airborne ? 0.22 : groundGrip;
    const driveGrip = player.airborne ? traction : wet ? 0.87 : 1;
    const steering = clamp(Number(Boolean(input.right)) - Number(Boolean(input.left)) + (input.steering ?? 0), -1, 1);
    // 功能：临检停车期间暂停驱动及氮气消耗。时间：2026-11-21 | 作者：lq。
    const throttle = Number(Boolean(input.accelerate && !input.brake && !player.checkHold));
    const usingBoost = throttle && input.boost && player.boost > 0.01 && player.velocity > 6;
    player.boosting = Boolean(usingBoost);
    player.boost = clamp(player.boost + (usingBoost ? -0.38 : input.boost ? 0 : 0.11) * dt, 0, 1);
    const limit = TOP_SPEED + (usingBoost ? 15 : 0);
    const acceleration = driveGrip * throttle * (usingBoost ? 20 : 13.8) - 0.019 * player.velocity - 0.0026 * player.velocity ** 2;
    const gradeDrag = player.airborne ? 0 : road.grade * 9.8;
    player.velocity = clamp(player.velocity + (acceleration - gradeDrag - (input.brake ? 23 * traction : 0)) * dt, 0, Math.max(limit, player.velocity - dt * 12));
    const laneSpeed = Math.min(player.velocity * 0.28, 12);
    const bend = sample(player.distance + 5).turn;
    const outward = bend * Math.max(0, player.velocity - (wet ? 37 : 46)) * 0.16 / groundGrip;
    player.lateral += (steering * laneSpeed - outward - player.lateral) * (1 - Math.exp(-6.5 * traction * dt));
    player.offset += player.lateral * dt;
    player.heading += (steering * Math.min(0.21, player.velocity * 0.012) - player.heading) * (1 - Math.exp(-8 * traction * dt));
    const limitOffset = laneLimit(player.heading);
    if (Math.abs(player.offset) > limitOffset) {
      player.velocity *= Math.exp(-dt * 2.45);
      player.offset = clamp(player.offset, -limitOffset, limitOffset);
      player.lateral = 0;
    }
    player.distance += player.velocity * dt / ((1 - road.turn * player.offset / RADIUS) * Math.hypot(1, road.grade));
    restrictRoadTravel(player, this.events, previous, dt);
    // 功能：累计沿坡面的行驶米数；暂停不累计，碰撞修正位置也不会让轮胎跳转。时间：2026-11-20 | 作者：lq。
    player.wheelTravel += player.velocity * dt;
    updateRide(player, road, previous, dt);
    this.updateTraffic(dt);
    this.rivals.forEach((rival, i) => this.autopilot(rival, i, dt));
    this.resolveContacts();
    // 功能：起跑线每次通过只累加一圈，只有目标圈数完成才截取冲线帧的计时。时间：2026-11-20 | 作者：lq。
    this.completedLaps = Math.max(this.completedLaps, clamp(Math.floor((player.distance - this.startDistance) / LAP), 0, this.laps));
    const finish = this.startDistance + LAP * this.laps;
    if (player.distance >= finish) {
      const fraction = clamp((finish - previous) / Math.max(player.distance - previous, Number.EPSILON), 0, 1);
      this.elapsed += fraction * dt;
      player.distance = finish;
      this.completedLaps = this.laps;
      this.finishTime = this.elapsed;
      this.finishRank = this.rank;
      this.status = 'finish';
      player.boosting = false;
    } else {
      this.elapsed += dt;
    }
  }

  // 功能：仅在驾驶和完赛巡航时推进交通，使用相同的固定时步。时间：2026-11-21 | 作者：lq。
  updateTraffic(dt) {
    if (this.traffic.length) advanceTraffic(this.traffic, this.events, this.player.distance, this.weather === 'rain', dt);
  }

  // 功能：参赛车和道路使用者共用碰撞求解器，玩家接触沿用撞击音效。时间：2026-11-21 | 作者：lq。
  resolveContacts() {
    for (let pass = 0; pass < 3; pass++) {
      let touched = false;
      for (const [a, b] of this.collisionPairs) {
        const hit = collide(a, b);
        if (hit === null) continue;
        touched = true;
        if (a === this.player) this.impact = Math.max(this.impact, hit);
      }
      if (!touched) break;
    }
  }

  // 功能：复用对手驾驶逻辑巡航，保留弯道减速、并道、坡面与车轮动画。时间：2026-11-21 | 作者：lq。
  autopilot(rival, i, dt) {
    const wet = this.weather === 'rain';
    const groundGrip = wet ? 0.66 : 1;
    const previous = rival.distance;
    const road = sample(previous);
    const nearbyBend = sample(rival.distance + 26).turn;
    // 功能：对手在湿地提前减速，制动、起步和回到行车线也受抓地力影响。时间：2026-11-20 | 作者：lq。
    const freeSpeed = (RIVAL_SPEEDS[i] ?? 56) - (wet ? 4 : 0) - nearbyBend * (wet ? 19 : 15) + Math.sin(rival.distance * 0.024 + i) * 2;
    const approach = eventApproach(rival, this.events, wet);
    // 功能：AI 合并施工指引和交通避让，沿选定车道减速或超车。时间：2026-11-21 | 作者：lq。
    const preferred = (approach?.offset ?? (RIVAL_LANES[i] ?? 2.25)) + Math.sin(rival.distance * 0.017 + i * 3) * 0.42;
    const traffic = this.traffic.length ? trafficApproach(rival, this.traffic, preferred, Math.sign(approach?.offset ?? 0), wet) : null;
    const target = Math.min(freeSpeed, approach?.speed ?? Infinity, traffic?.speed ?? Infinity);
    const acceleration = (i === 0 ? 10.3 : 9.5) * (wet ? 0.87 : 1);
    rival.velocity += rival.airborne ? -0.0026 * rival.velocity ** 2 * dt : clamp(target - rival.velocity, -12 * groundGrip * dt, acceleration * dt);
    rival.distance += rival.velocity * dt / ((1 - road.turn * rival.offset / RADIUS) * Math.hypot(1, road.grade));
    restrictRoadTravel(rival, this.events, previous, dt);
    rival.wheelTravel += rival.velocity * dt;
    updateRide(rival, road, previous, dt);
    const targetOffset = traffic?.offset ?? preferred;
    // 被侧撞后先受冲量横移，再回到行车线，位置不会在下一帧跳回去。
    const steer = clamp((targetOffset - rival.offset) * 3.7, -5, 5);
    rival.lateral += (steer - rival.lateral) * (1 - Math.exp(-(rival.airborne ? 2 : 9 * groundGrip) * dt));
    rival.heading += (clamp(rival.lateral * 0.03, -0.16, 0.16) - rival.heading) * (1 - Math.exp(-8 * dt));
    const limit = laneLimit(rival.heading);
    rival.offset = clamp(rival.offset + rival.lateral * dt, -limit, limit);
    if (Math.abs(rival.offset) === limit) rival.lateral = 0;
  }

  takeImpact() {
    const impact = this.impact;
    this.impact = 0;
    return impact;
  }
}

export function formatTime(seconds) {
  const ms = Math.max(0, Math.floor(seconds * 1000));
  return `${Math.floor(ms / 60000).toString().padStart(2, '0')}:${Math.floor(ms / 1000 % 60).toString().padStart(2, '0')}.${(ms % 1000).toString().padStart(3, '0')}`;
}
