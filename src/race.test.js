/**
 * 功能：验证参考赛道的闭合和桥梁位置，以及比赛计时、转向、氮气和完赛规则。
 * 时间：2026-11-20 | 作者：lq
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { DECK, HILLS, LAP, ROAD, SECTORS, point, sample } from './course.js';
import { DEFAULT_CARS, formatTime, MAX_CARS, MAX_LAPS, normalizeCars, normalizeLaps, normalizeWeather, Race, TOP_SPEED } from './race.js';
import { collide, laneLimit } from './collision.js';
import { normalizePlate, normalizeSettings } from './customization.js';
import { screenTilt, steeringAxis } from './steering.js';
import { prepareWheels, rollWheels } from './wheels.js';
import { CHECK_SPEED, planRoadEvents } from './road-events.js';
import { planTraffic } from './traffic.js';
import { random } from './geometry.js';

// 功能：用实际车模验证独立四轮、静止卡钳、几何无丢失，并检查滚动在暂停时冻结。时间：2026-11-20 | 作者：lq。
test('实际 Audi 网格可拆成四组，在行驶时滚动且暂停时冻结', async () => {
  const bytes = await readFile(new URL('../public/audi-rs5.glb', import.meta.url));
  const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
  const { scene } = await loader.parseAsync(Uint8Array.from(bytes).buffer, '');
  const indexCount = (nodes) => {
    let count = 0;
    for (const node of nodes) node.traverse((part) => { if (part.isMesh) count += part.geometry.index.count; });
    return count;
  };
  const before = indexCount(scene.children.filter((node) => /^(Tire|Rims|BrakeDisk)_Front/.test(node.name)));
  const calipers = scene.children.filter((node) => node.name.startsWith('Caliper'));
  const wheels = prepareWheels(scene).map((name) => scene.getObjectByName(name));
  assert.equal(wheels.length, 4);
  assert.ok(before > 0);
  assert.equal(indexCount(wheels), before);
  assert.equal(calipers.length, 2);
  assert.ok(calipers.every(({ parent }) => parent === scene));
  assert.ok(wheels.every((wheel) => wheel.userData.radius > 0.3 && wheel.userData.radius < 0.4 && wheel.children.length === 4));
  const race = new Race(SECTORS[0].start);
  race.status = 'race';
  race.step(1 / 120, { accelerate: true });
  rollWheels(wheels, race.player.wheelTravel);
  assert.ok(wheels.every((wheel) => wheel.rotation.x > 0));
  assert.ok(race.rivals.every((rival) => rival.wheelTravel > 0));
  const angle = wheels[0].rotation.x;
  race.status = 'paused';
  race.step(1 / 120, { accelerate: true });
  rollWheels(wheels, race.player.wheelTravel);
  assert.equal(wheels[0].rotation.x, angle);
  assert.equal(scene.clone(true).getObjectByName(wheels[0].name).userData.radius, wheels[0].userData.radius);
});

// 功能：用同样的初速度和输入对比干湿地面，防止雨天退化成纯视觉效果。时间：2026-11-20 | 作者：lq。
test('雨天制动距离增加，转向变缓，电脑对手起步变慢', () => {
  const start = SECTORS[0].start;
  const clear = new Race(start, 1, 1);
  const rain = new Race(start, 1, 1, 'rain');
  assert.equal(clear.weather, 'clear');
  assert.equal(normalizeWeather('unknown'), 'clear');
  for (const race of [clear, rain]) {
    race.status = 'race';
    race.player.velocity = 42;
    for (let i = 0; i < 22; i++) race.step(1 / 120, { left: true });
  }
  assert.ok(Math.abs(rain.player.lateral) < Math.abs(clear.player.lateral));
  for (const race of [clear, rain]) {
    race.reset(start, 1, 1, race.weather);
    race.status = 'race';
    race.player.velocity = 42;
    for (let i = 0; i < 400 && race.player.velocity > 0; i++) race.step(1 / 120, { brake: true });
    assert.equal(race.player.velocity, 0);
  }
  assert.ok(rain.player.distance - start > (clear.player.distance - start) * 1.25);
  for (const race of [clear, rain]) {
    race.reset(start, 1, 2, race.weather);
    race.status = 'race';
    race.step(1 / 120, { accelerate: true });
  }
  assert.ok(rain.rivals[0].velocity < clear.rivals[0].velocity);
  rain.reset(start);
  assert.equal(rain.weather, 'clear');
});

test('两个起跑点在不同桥面，闭环前后坐标一致', () => {
  assert.deepEqual(point(LAP + 10), point(10));
  assert.deepEqual(point(-5), point(LAP - 5));
  assert.ok(sample(SECTORS[0].start).x < 0);
  assert.ok(sample(SECTORS[1].start).x > 0);
});

test('倒数和暂停期间位置、计时保持不变', () => {
  const race = new Race(SECTORS[0].start);
  race.status = 'countdown';
  race.step(2, { accelerate: true });
  assert.equal(race.countdown, 1);
  assert.equal(race.elapsed, 0);
  race.step(1, { accelerate: true });
  assert.equal(race.status, 'race');
  race.status = 'paused';
  race.step(1, { accelerate: true });
  assert.equal(race.player.distance, SECTORS[0].start);
  assert.equal(race.elapsed, 0);
});

test('两座桥的起跑点均可完赛，冲线后计时冻结', () => {
  for (const sector of SECTORS) {
    const race = new Race(sector.start);
    race.status = 'race';
    for (let i = 0; i < 120 * 60 && race.status === 'race'; i++) {
      race.step(1 / 120, { accelerate: true, boost: i > 1000 && i < 1200, right: i > 900 && i < 930 });
      assert.ok(Math.abs(race.player.offset) < ROAD);
    }
    assert.equal(race.status, 'finish');
    assert.equal(race.progress, 1);
    assert.equal(race.player.distance, sector.start + LAP);
    assert.ok(race.finishTime > 10);
    race.step(1, { accelerate: true });
    assert.equal(race.elapsed, race.finishTime);
  }
  assert.equal(formatTime(83.0125), '01:23.012');
});

// 功能：验证多圈结算、进度、重置与非法圈数。时间：2026-11-20 | 作者：lq。
test('中间圈不结束比赛，最后一圈冲线后才结算', () => {
  for (const [grid, laps] of [[0, 2], [1, MAX_LAPS]]) {
    const start = SECTORS[grid].start;
    const race = new Race(start, laps);
    race.status = 'race';
    let crossings = 0;
    for (let i = 0; i < 120 * 60 * laps && race.status === 'race'; i++) {
      race.step(1 / 120, { accelerate: true });
      if (race.completedLaps === crossings) continue;
      assert.equal(race.completedLaps, ++crossings);
      assert.equal(race.currentLap, Math.min(crossings + 1, laps));
      assert.ok(Math.abs(race.progress - crossings / laps) < 0.001);
      assert.equal(race.status, crossings === laps ? 'finish' : 'race');
    }
    assert.equal(crossings, laps);
    assert.equal(race.player.distance, start + laps * LAP);
    assert.equal(race.elapsed, race.finishTime);
    race.reset(start, laps);
    assert.equal(race.currentLap, 1);
    assert.equal(race.progress, 0);
  }
  for (const invalid of [null, 0, 1.5, MAX_LAPS + 1, 'nope']) assert.equal(normalizeLaps(invalid), 1);
  assert.equal(normalizeLaps('3'), 3);
});

// 功能：验证单车练习和满载发车不会产生非法对手、重叠或结算错误。时间：2026-11-20 | 作者：lq。
test('赛车数量包含玩家，单车和八车均能发车并完成比赛', () => {
  for (const count of [1, MAX_CARS]) {
    const race = new Race(SECTORS[0].start, 1, count);
    assert.equal(race.carCount, count);
    assert.equal(race.rivals.length, count - 1);
    assert.equal(race.collisionPairs.length, count * (count - 1) / 2);
    for (const [a, b] of race.collisionPairs) assert.equal(collide(a, b), null);
    race.status = 'race';
    for (let i = 0; i < 120 * 60 && race.status === 'race'; i++) {
      race.step(1 / 120, { accelerate: true });
      assert.ok(race.rank >= 1 && race.rank <= count);
      assert.ok(race.rivals.every((rival) => Number.isFinite(rival.distance) && Math.abs(rival.offset) < ROAD));
    }
    assert.equal(race.status, 'finish');
    assert.ok(race.rivals.every((rival) => rival.distance > SECTORS[0].start));
  }
  for (const invalid of [null, -1, 3.5, MAX_CARS + 1, 'nope']) assert.equal(normalizeCars(invalid), DEFAULT_CARS);
  assert.equal(normalizeCars('8'), MAX_CARS);
});

// 功能：检查两座坡的几何接触、慢速贴地和高速弹道回落。时间：2026-11-20 | 作者：lq。
test('坡面连续，低速贴地，高速越过坡顶后自然着陆', () => {
  assert.ok(LAP > 1900);
  for (const hill of HILLS) {
    const crest = hill.start + hill.length / 2;
    assert.equal(point(hill.start)[1], DECK);
    assert.equal(point(hill.start + hill.length)[1], DECK);
    assert.ok(sample(crest - 20).grade > 0);
    assert.ok(sample(crest + 20).grade < 0);
    assert.ok(Math.abs(sample(crest + LAP).y - (DECK + hill.rise)) < 1e-10);

    const drive = (speed, accelerate) => {
      const race = new Race(crest - 28);
      race.status = 'race';
      race.player.velocity = speed;
      let airborneFrames = 0, peak = 0, landed = false;
      for (let i = 0; i < 120 * 6 && race.player.distance < hill.start + hill.length; i++) {
        race.step(1 / 120, { accelerate });
        const altitude = race.player.height - sample(race.player.distance).y;
        if (race.player.airborne) {
          assert.ok(altitude >= -0.02);
          airborneFrames++;
          peak = Math.max(peak, altitude);
        } else if (race.player.landing > 0) {
          landed = true;
          assert.equal(altitude, 0);
        }
      }
      assert.ok(race.player.distance > crest + 25);
      return { airborneFrames, peak, landed };
    };
    assert.deepEqual(drive(24, false), { airborneFrames: 0, peak: 0, landed: false });
    const jump = drive(TOP_SPEED, true);
    assert.ok(jump.airborneFrames > 100 && jump.airborneFrames < 240);
    assert.ok(jump.peak > 2 && jump.peak < 10);
    assert.ok(jump.landed);
  }
});

test('氮气消耗并恢复，按下刹车时车速降低', () => {
  const race = new Race(SECTORS[0].start);
  race.status = 'race';
  for (let i = 0; i < 180; i++) race.step(1 / 120, { accelerate: true });
  for (let i = 0; i < 60; i++) race.step(1 / 120, { accelerate: true, boost: true });
  const { boost, velocity } = race.player;
  assert.ok(boost < 1);
  assert.ok(race.player.boosting);
  for (let i = 0; i < 60; i++) race.step(1 / 120, { brake: true });
  assert.ok(race.player.boost > boost);
  assert.ok(race.player.velocity < velocity);
});

// 功能：验证真实车身接触、双车冲量、护栏约束和跨赛道接缝。时间：2026-11-20 | 作者：lq。
const bodyAt = (distance, offset, velocity = 0, lateral = 0, heading = 0) => ({ distance, offset, velocity, lateral, heading });

test('玩家追尾时双方速度改变，车身分离，只上报一次撞击', () => {
  const race = new Race(40);
  race.status = 'race';
  Object.assign(race.player, bodyAt(40, -2.6, 30));
  Object.assign(race.rivals[0], bodyAt(44.6, -2.6, 14));
  race.step(1 / 120, { accelerate: true });
  assert.ok(race.player.velocity < 26);
  assert.ok(race.rivals[0].velocity > 18);
  assert.ok(race.rivals[0].distance - race.player.distance >= 4.64);
  assert.ok(race.takeImpact() > 10);
  assert.equal(race.takeImpact(), 0);
});

test('并排通过可以保持车速，斜向接触按车身转角检测', () => {
  const a = bodyAt(40, 0, 25);
  const b = bodyAt(42, 2.18, 25);
  assert.equal(collide(a, b), null);
  a.heading = 0.21;
  a.lateral = 4;
  assert.ok(collide(a, b) > 0);
  assert.ok(a.lateral < 4 && b.lateral > 0);
});

test('并排挤向护栏时双方分离且不越界', () => {
  const edge = laneLimit(0);
  const a = bodyAt(40, edge - 1.7, 25, 6);
  const b = bodyAt(40, edge, 25);
  assert.ok(collide(a, b) > 0);
  assert.equal(b.offset, edge);
  assert.equal(collide(a, b), null);
});

test('环线首尾相接，两辆相邻车仍能接触且不重复触发', () => {
  const a = bodyAt(LAP - 1.9, 2.25, 28);
  const b = bodyAt(2, 2.25, 15);
  assert.ok(collide(a, b) > 0);
  assert.equal(collide(a, b), null);
});

// 功能：排除高空车辆与下方车身的假碰撞。时间：2026-11-20 | 作者：lq。
test('高空越车不碰撞，落低后仍会接触', () => {
  const a = { ...bodyAt(40, 0, 28), airborne: true, height: DECK + 3 };
  const b = bodyAt(43, 0, 15);
  assert.equal(collide(a, b), null);
  a.height = DECK + 0.3;
  assert.ok(collide(a, b) > 0);
});

// 功能：验证随机交通的四类实体、无重叠发车、暂停冻结和重赛刷新。时间：2026-11-21 | 作者：lq。
test('四类交通按场次分布，运动和名次独立于场外计时', () => {
  const start = SECTORS[1].start;
  const first = planTraffic(start, random(1));
  const second = planTraffic(start, random(2));
  assert.notDeepEqual(first, second);
  assert.deepEqual(new Set(first.map(({ kind }) => kind)), new Set(['pedestrian', 'bicycle', 'bus', 'taxi']));
  assert.ok(first[0].distance - start >= 49 && first.at(-1).distance < start + LAP - 25);
  const race = new Race(start, 1, MAX_CARS, 'rain', 'mixed', true);
  assert.ok(race.collisionPairs.every(([a, b]) => collide(a, b) === null));
  const actor = race.traffic[0];
  const initial = actor.distance;
  race.status = 'countdown';
  race.step(1 / 120, {});
  assert.equal(actor.distance, initial);
  race.status = 'race';
  race.step(1 / 120, {});
  assert.ok(actor.distance > initial && actor.travel > 0);
  assert.equal(race.rank, 1);
  assert.equal(race.carCount, MAX_CARS);
  const moving = actor.distance;
  race.status = 'paused';
  race.step(1 / 120, {});
  assert.equal(actor.distance, moving);
  race.reset(start);
  assert.notEqual(race.traffic[0], actor);
  assert.ok(race.traffic.every(({ travel }) => travel === 0));
});

// 功能：在真实固定时步中让赛车分别追尾四种交通，并检查公交车顶与小轿车的差异。时间：2026-11-21 | 作者：lq。
test('四种交通按各自长宽碰撞，公交在高速腾空时仍能被撞到', () => {
  const dt = 1 / 120;
  for (const kind of ['pedestrian', 'bicycle', 'bus', 'taxi']) {
    const race = new Race(60, 1, 1, 'clear', 'off', true);
    const target = race.traffic.find((actor) => actor.kind === kind);
    const gap = target.collider.halfLength + 2.38;
    Object.assign(target, { distance: 60 + gap, offset: 2.25, laneOffset: 2.25 });
    race.player.velocity = 58;
    race.status = 'race';
    race.step(dt, { accelerate: true });
    assert.ok(race.takeImpact() > 25, kind);
    assert.ok(race.player.velocity < 56 && target.velocity > target.cruise, kind);
    assert.equal(collide(race.player, target), null, kind);
  }

  const bus = planTraffic(40, random(8)).find((actor) => actor.kind === 'bus');
  Object.assign(bus, { distance: 46, offset: 0, velocity: 15 });
  const jumper = { ...bodyAt(40, 0, 54), airborne: true, height: DECK + 3.3 };
  assert.equal(collide(jumper, bus), null);
  jumper.height = DECK + 2.0;
  assert.ok(collide(jumper, bus) > 0);

  const hill = HILLS[0];
  const uphill = hill.start + hill.length / 3;
  const climbing = bodyAt(uphill, 0, 48);
  Object.assign(bus, { distance: uphill + 7.8, offset: 0, velocity: 13 });
  assert.ok(sample(bus.distance).y - sample(uphill).y > 1.4);
  assert.ok(collide(climbing, bus) > 0);
});

// 功能：从日常驾驶入口验证 AI 能变线绕过同车道的慢速公交。时间：2026-11-21 | 作者：lq。
test('AI 发现前方公交后变线通过，再回到自己的行车线', () => {
  const race = new Race(60, 1, 2, 'clear', 'off', true);
  const [rival] = race.rivals;
  Object.assign(rival, { distance: 65, velocity: 49, offset: -2.55 });
  for (const actor of race.traffic) actor.distance = 600 + 54 * actor.id;
  const bus = race.traffic.find(({ kind }) => kind === 'bus');
  Object.assign(bus, { distance: 110, offset: -2.55, laneOffset: -2.55, velocity: 11, cruise: 11 });
  race.status = 'race';
  let shift = 0;
  for (let i = 0; i < 120 * 4; i++) {
    race.step(1 / 120, {});
    shift = Math.max(shift, Math.abs(rival.offset - bus.offset));
  }
  assert.ok(shift > 2.5);
  assert.ok(rival.distance > bus.distance + 50);
  assert.ok(Math.abs(rival.offset + 2.6) < 0.55);
});

test('车牌保留汉字和合法字符，设置过滤无效值', () => {
  assert.equal(normalizePlate(' 粤ｂ·ｒｓ5@-001 '), '粤B·RS5-00');
  // 功能：旧车库存档迁移到原厂改装选项。时间：2026-11-21 | 作者：lq。
  assert.deepEqual(normalizeSettings({ livery: 'heritage', color: '#FA4477', plate: '沪A12345' }), {
    livery: 'heritage', color: '#fa4477', plate: '沪A12345', steering: 'stick', sensitivity: 1,
    spoiler: 'stock', rims: 'stock',
  });
  assert.equal(normalizeSettings({ livery: 'constructor', plate: '<>', steering: 'bad' }).plate, 'RS5·007');
});

// 功能：验证两处桥头在多圈环线正确轮换，且事件不会挡在坡道或终点。时间：2026-11-21 | 作者：lq。
test('混合事件对两个发车点都按圈轮换', () => {
  for (const { start } of SECTORS) {
    const events = planRoadEvents(start, 2, 'mixed', () => 0.1);
    assert.deepEqual(events.map(({ kind }) => kind), ['work', 'checkpoint', 'checkpoint', 'work']);
    assert.equal(events[2].distance - events[0].distance, LAP);
    assert.ok(events.every(({ distance, end }, index) => distance > (events[index - 1]?.end ?? start)
      && end < start + 2 * LAP && !sample(end).hill && !sample(distance).turn));
    assert.deepEqual(planRoadEvents(start, 2, 'off'), []);
  }
});

// 功能：验证临检超速停车只触发一次，暂停保持余时，合规车速直接通过。时间：2026-11-21 | 作者：lq。
test('临检对合规和超速车辆分别放行', () => {
  const dt = 1 / 120;
  for (const shouldStop of [false, true]) {
    const race = new Race(SECTORS[0].start, 1, 1, 'clear', 'checkpoint');
    const line = race.events[0].distance;
    Object.assign(race.player, { distance: line - 0.03, velocity: CHECK_SPEED / 3.6 + (shouldStop ? 15 : -2) });
    race.status = 'race';
    race.step(dt, { accelerate: true });
    assert.equal(race.player.eventIndex, 1);
    assert.equal(race.player.checkHold > 0, shouldStop);
    if (!shouldStop) continue;
    assert.equal(race.player.distance, line);
    const remaining = race.player.checkHold;
    race.status = 'paused';
    race.step(dt, { accelerate: true });
    assert.equal(race.player.checkHold, remaining);
    race.status = 'race';
    for (let i = 0; i < 240; i++) race.step(dt, { accelerate: true });
    assert.equal(race.player.checkHold, 0);
    assert.ok(race.player.distance > line);
  }
});

// 功能：验证施工区左右封道均掉速，开放侧正常通过；AI 会提前并道。时间：2026-11-21 | 作者：lq。
test('施工封闭侧实际影响车速，开放侧与 AI 可以通过', () => {
  const dt = 1 / 120;
  for (const openSide of [-1, 1]) {
    for (const closed of [false, true]) {
      const race = new Race(SECTORS[0].start, 1, 2, 'rain', 'work');
      const [event] = race.events;
      event.openSide = openSide;
      Object.assign(race.player, { distance: event.distance - 0.1, velocity: 58, offset: openSide * (closed ? -4 : 4) });
      Object.assign(race.rivals[0], { distance: event.distance - 160, velocity: 54, offset: -openSide * 6 });
      race.status = 'race';
      race.step(dt, { accelerate: true });
      assert.equal(race.player.workContact, closed);
      assert.ok(closed ? race.player.velocity <= 19 : race.player.velocity > 50);
      for (let i = 0; i < 1000 && race.rivals[0].eventIndex === 0; i++) race.step(dt, { accelerate: true });
      assert.equal(race.player.eventIndex, 1);
      assert.equal(race.rivals[0].eventIndex, 1);
      assert.ok(race.rivals[0].offset * openSide > 2);
    }
  }
});

test('摇杆死区、灵敏度和手机横竖屏方向', () => {
  assert.equal(steeringAxis(0.05, 0.1), 0);
  assert.equal(steeringAxis(2, 0.1), 1);
  assert.ok(steeringAxis(-0.5, 0.1, 1.25) < steeringAxis(-0.5, 0.1, 0.75));
  assert.ok(screenTilt(0, 20, 0) > 0);
  assert.ok(screenTilt(20, 0, 90) > 0);
  assert.ok(screenTilt(20, 0, 270) < 0);
  assert.equal(screenTilt(null, 0, 0), null);
});

test('部分摇杆行程产生介于直行和全打方向之间的转向', () => {
  const drive = (steering) => {
    const race = new Race(SECTORS[0].start);
    race.status = 'race';
    for (let i = 0; i < 170; i++) race.step(1 / 120, { accelerate: true, steering });
    return race.player.heading;
  };
  const moderate = drive(0.35);
  assert.ok(moderate > drive(0) && moderate < drive(1));
});

// 功能：验证完赛后自动巡航、锁定成绩、忽略驾驶输入与重赛重置。时间：2026-11-21 | 作者：lq。
test('完赛后全场继续自动驾驶，计时名次不变且重赛清空结果', () => {
  for (const weather of ['clear', 'rain']) {
    const race = new Race(SECTORS[0].start, 2, MAX_CARS, weather, 'mixed');
    race.status = 'race';
    Object.assign(race.player, { distance: race.startDistance + LAP * 2 - 0.1, velocity: 60, boosting: true, eventIndex: race.events.length });
    race.step(1 / 120, { accelerate: true, boost: true });
    assert.equal(race.status, 'finish');
    const time = race.finishTime;
    const rank = race.rank;
    const field = [race.player, ...race.rivals];
    const distances = field.map((car) => car.distance);
    const wheels = field.map((car) => car.wheelTravel);
    for (let i = 0; i < 120 * 90; i++) race.step(1 / 120, { brake: true, left: true, boost: true });
    assert.ok(race.player.distance > distances[0] + LAP);
    field.forEach((car, i) => {
      assert.ok(car.distance > distances[i]);
      assert.ok(car.wheelTravel > wheels[i]);
      assert.ok(Math.abs(car.offset) < ROAD);
      assert.ok(Number.isFinite(car.height));
    });
    assert.equal(race.player.boosting, false);
    assert.equal(race.elapsed, time);
    assert.equal(race.finishTime, time);
    assert.equal(race.rank, rank);
    assert.equal(race.completedLaps, 2);
    assert.equal(race.progress, 1);
    race.rivals[0].distance = race.player.distance + LAP;
    assert.equal(race.rank, rank);
    race.reset(SECTORS[1].start);
    assert.equal(race.finishRank, null);
    assert.equal(race.finishTime, 0);
    assert.equal(race.status, 'menu');
  }
});
