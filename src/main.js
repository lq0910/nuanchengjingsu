/**
 * 功能：启动 Three.js 赛车，管理桥梁预览、跟车镜头、界面、音效和输入。
 * 时间：2026-11-20 | 作者：lq
 */
import * as T from 'three';
import { buildTrack } from './track.js';
import { buildEnvironment } from './environment.js';
import { buildCars, pose } from './cars.js';
import { GRID, HILLS, LAP, RADIUS, SECTORS, point, sample } from './course.js';
import { DEFAULT_CARS, formatTime, MAX_CARS, MAX_LAPS, normalizeCars, normalizeLaps, normalizeWeather, Race } from './race.js';
import { makeRaceAudio } from './race-audio.js';
import { makeRain } from './rain.js';
import { readSettings } from './customization.js';
import { makeTilt, steeringAxis } from './steering.js';
import { makeShowroom } from './showroom.js';
import { bindGarage } from './garage.js';
import { makeRaceOrbit } from './race-orbit.js';
import { makeRoadEventScene } from './road-event-scene.js';
import { CHECK_SPEED, EVENT_NOTICE, normalizeEventMode, roadEventFor } from './road-events.js';
import { makeTrafficScene } from './traffic-scene.js';
// 功能：在驾驶视角中显示无人机，并挂接比赛直播画面。时间：2026-11-21 | 作者：lq。
import { DRONE_LAYER, makeRaceDrone } from './race-drone.js';
import droneIcon from 'lucide-static/icons/drone.svg?raw';
import sun from 'lucide-static/icons/sun.svg?raw';
import moon from 'lucide-static/icons/moon.svg?raw';
import arrowUpRight from 'lucide-static/icons/arrow-up-right.svg?raw';
import arrowLeft from 'lucide-static/icons/arrow-left.svg?raw';
import arrowRight from 'lucide-static/icons/arrow-right.svg?raw';
import pauseIcon from 'lucide-static/icons/pause.svg?raw';
import play from 'lucide-static/icons/play.svg?raw';
import retry from 'lucide-static/icons/rotate-ccw.svg?raw';
import settingsIcon from 'lucide-static/icons/sliders-horizontal.svg?raw';
import carIcon from 'lucide-static/icons/car-front.svg?raw';
import pipetteIcon from 'lucide-static/icons/pipette.svg?raw';
import closeIcon from 'lucide-static/icons/x.svg?raw';
import calibrateIcon from 'lucide-static/icons/crosshair.svg?raw';
import volumeOn from 'lucide-static/icons/volume-2.svg?raw';
import volumeOff from 'lucide-static/icons/volume-x.svg?raw';
import './style.css';
import './garage.css';

const $ = (selector) => document.querySelector(selector);
const stage = $('#stage');
const scene = new T.Scene();
const camera = new T.PerspectiveCamera(65, 1, 0.1, 1800);
const renderer = new T.WebGLRenderer({ canvas: $('#world'), antialias: true, powerPreference: 'high-performance' });
renderer.outputColorSpace = T.SRGBColorSpace;
renderer.toneMapping = T.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.1;
renderer.setPixelRatio(Math.min(devicePixelRatio, 1.45));

const track = buildTrack(scene);
const environment = buildEnvironment(scene);
const rain = makeRain(scene);
// 功能：复用动态事件场景，并缓存 HUD 的静态元素。时间：2026-11-21 | 作者：lq。
const updateRoadEventScene = makeRoadEventScene(scene);
const eventAlert = $('#event-alert');
const eventTitle = $('#event-title');
const eventAction = $('#event-action');
const eventMetric = $('#event-metric');
const eventPin = $('#mini-event');
let announcedEvent;
// 功能：正式比赛启用城市交通，交通实体随当前比赛同步。时间：2026-11-21 | 作者：lq。
const race = new Race(GRID, 1, DEFAULT_CARS, 'clear', 'off', true);
const updateTrafficScene = makeTrafficScene(scene);
const raceAudio = makeRaceAudio();
const keys = new Set();
const touches = new Map();
const preferences = readSettings();
const tilt = makeTilt();
const showroom = makeShowroom();
const stick = { pointer: null, axis: 0 };
let garageOpen = false;
const mobile = matchMedia('(max-width: 760px)');
const touchDriving = matchMedia('(max-width: 760px), (pointer: coarse)');
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
// 功能：主镜头可看见机身，航拍机位只渲染无人机以外的赛道场景。时间：2026-11-21 | 作者：lq。
const raceDrone = makeRaceDrone(scene, $('#drone-feed'), $('#drone-toggle'), $('#drone-screen'));
camera.layers.enable(DRONE_LAYER);
// 功能：环视仅在倒计时和比赛期间可用，不影响菜单或车库操作。时间：2026-11-21 | 作者：lq。
const racing = (mode) => mode === 'race' || mode === 'countdown';
const raceOrbit = makeRaceOrbit(stage, () => racing(race.status) && !$('#control-settings').open);
const aim = new T.Vector3();
const followEye = new T.Vector3();
const desiredAim = new T.Vector3();
const desiredEye = new T.Vector3();
const direction = new T.Vector3();
const up = new T.Vector3(0, 1, 0);
const chaseAnchor = new T.Vector3();
const chaseDelta = new T.Vector3();
const orbitPivot = new T.Vector3();
const options = [...document.querySelectorAll('[data-track]')];
let cars = [];
let activeTrack = 0;
let night = false;
let muted = false;
let selectedLaps = 1;
let selectedCars = DEFAULT_CARS;
let best = 0;
let previousFrame = 0;
let hudAt = 0;
let goUntil = 0;
let accumulator = 0;
const STEP = 1 / 120;

// 功能：保存赛事设置，为湿地成绩使用独立键，沿用历史晴天成绩。时间：2026-11-20 | 作者：lq。
const LAPS_KEY = 'river-circuit-laps';
const CARS_KEY = 'river-circuit-cars';
const WEATHER_KEY = 'river-circuit-weather';
// 功能：保存事件选项，按规则独立统计成绩，关闭事件时沿用原纪录。时间：2026-11-21 | 作者：lq。
const ROAD_EVENTS_KEY = 'river-circuit-road-events';
const eventNames = { mixed: '混合事件', checkpoint: '酒驾临检', work: '施工并道' };
const recordKey = () => {
  const carSuffix = race.carCount === DEFAULT_CARS ? '' : `-cars-${race.carCount}`;
  const weatherSuffix = race.weather === 'rain' ? '-rain' : '';
  const eventSuffix = race.eventMode === 'off' ? '' : `-events-${race.eventMode}`;
  // 功能：带交通比赛使用独立的最佳成绩，避免覆盖旧赛制记录。时间：2026-11-21 | 作者：lq。
  return `river-circuit-best-hills-v1-${activeTrack}-${race.laps}${carSuffix}${weatherSuffix}${eventSuffix}-traffic`;
};
const fieldSize = () => String(race.carCount).padStart(2, '0');
const resetGrid = () => {
  race.reset(SECTORS[activeTrack].start, selectedLaps, selectedCars, $('#race-weather').value, $('#road-events').value);
  announcedEvent = undefined;
};

// 功能：让赛道预览、比赛音效和湿地提醒跟随同一份发车路况。时间：2026-11-20 | 作者：lq。
function applyWeather() {
  const wet = race.weather === 'rain';
  environment.setWeather(night, wet);
  track.setWeather(night, wet);
  rain.setWeather(wet, night);
  raceAudio.setWet(wet);
  $('#wet-indicator').hidden = !wet;
}

function refreshRecord() {
  try { best = Number(localStorage.getItem(recordKey())); } catch { best = 0; }
  best = Number.isFinite(best) && best > 0 ? best : 0;
  $('#best-time').textContent = best ? formatTime(best) : '--:--.---';
}

function bindRaceSettings() {
  const laps = $('#lap-count');
  const count = $('#car-count');
  // 功能：赛前恢复并保存天气，比赛中锁定发车时的选择。时间：2026-11-20 | 作者：lq。
  const weather = $('#race-weather');
  const events = $('#road-events');
  for (let i = 1; i <= MAX_LAPS; i++) laps.add(new Option(`${i} 圈`, String(i)));
  for (let i = 1; i <= MAX_CARS; i++) count.add(new Option(`${i} 辆`, String(i)));
  try {
    selectedLaps = normalizeLaps(localStorage.getItem(LAPS_KEY));
    selectedCars = normalizeCars(localStorage.getItem(CARS_KEY));
    weather.value = normalizeWeather(localStorage.getItem(WEATHER_KEY));
    events.value = normalizeEventMode(localStorage.getItem(ROAD_EVENTS_KEY));
  } catch { /* 存储不可用时继续使用默认设置。 */ }
  laps.value = String(selectedLaps);
  count.value = String(selectedCars);
  const change = () => {
    if (race.status !== 'menu' || garageOpen) {
      weather.value = race.weather;
      events.value = race.eventMode;
      return;
    }
    selectedLaps = normalizeLaps(laps.value);
    selectedCars = normalizeCars(count.value);
    try {
      localStorage.setItem(LAPS_KEY, String(selectedLaps));
      localStorage.setItem(CARS_KEY, String(selectedCars));
      localStorage.setItem(WEATHER_KEY, normalizeWeather(weather.value));
      localStorage.setItem(ROAD_EVENTS_KEY, normalizeEventMode(events.value));
    } catch { /* 当前页面仍保留选择。 */ }
    resetGrid();
    applyWeather();
    refreshRecord();
    updateHUD();
  };
  laps.addEventListener('change', change);
  count.addEventListener('change', change);
  weather.addEventListener('change', change);
  events.addEventListener('change', change);
  $('#course-length').textContent = `${(LAP / 1000).toFixed(2)} KM`;
}

function resize() {
  renderer.setSize(innerWidth, innerHeight, false);
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  // 功能：窗口或手机方向改变后重新定位航拍窗口。时间：2026-11-21 | 作者：lq。
  raceDrone.resize();
}

// 赛前使用可切换的岸边航拍机位；发车切换到后方追车机位。
function previewCamera(dt, instant = false) {
  // 功能：沿行驶方向取景，两桥的预览分别带出文化场馆和 CBD。时间：2026-11-21 | 作者：lq。
  if (activeTrack === 1) {
    if (mobile.matches) {
      desiredAim.set(69, 10, 77);
      desiredEye.set(159, 55, -104);
    } else {
      desiredAim.set(58, 21, 71);
      desiredEye.set(190, 61, -156);
    }
  } else if (mobile.matches) {
    desiredAim.set(-62, 5, -74);
    desiredEye.set(-158, 58, 110);
  } else {
    desiredAim.set(-49, 17, -67);
    desiredEye.set(-172, 64, 159);
  }
  updateCamera(dt, mobile.matches ? 65 : 58, instant);
}

// 功能：镜头随赛道前进，不因高速拉远；保留坡道、转向与落地的平滑运动。时间：2026-11-20 | 作者：lq。
function chaseCamera(dt, instant = false) {
  const car = race.player;
  const { x, y, z, dx, dz, grade } = sample(car.distance);
  const air = car.airborne ? Math.max(0, car.height - y) : 0;
  const anchorY = y + air;
  const px = x - dz * car.offset;
  const pz = z + dx * car.offset;
  const portrait = camera.aspect < 1;
  if (!instant) {
    chaseDelta.set(x, anchorY, z).sub(chaseAnchor);
    followEye.add(chaseDelta);
    aim.add(chaseDelta);
  }
  chaseAnchor.set(x, anchorY, z);
  const vertical = portrait ? 2.6 : 2.35;
  const followDistance = portrait ? 7.8 : 6.55;
  const rear = sample(car.distance - followDistance);
  const settling = reducedMotion.matches ? 0 : car.landing * 0.32;
  const eyeY = Math.max(rear.y + 1.4, y + (rear.y - y) * 0.68 + air * 0.88 + vertical - settling);
  desiredEye.set(px - dx * followDistance, eyeY, pz - dz * followDistance);
  direction.set(dx, 0, dz).applyAxisAngle(up, -car.heading * 0.43);
  const hudClearance = T.MathUtils.clamp((650 - innerHeight) * 0.006, 0, 1.4);
  desiredAim.set(px, y + air * 0.72 + grade * 4 - (portrait ? 1.3 : 0.75) - hudClearance, pz).addScaledVector(direction, 14 + car.velocity * 0.024);
  const speedFov = reducedMotion.matches ? 0 : T.MathUtils.clamp(car.velocity / 78, 0, 1) * 4 + (car.boosting ? 1.4 : 0);
  updateCamera(dt, (portrait ? 62 : 56) + speedFov, instant);
  // 功能：以玩家车身为环视轴，横向偏移和腾空时也不会转到空处。时间：2026-11-21 | 作者：lq。
  orbitPivot.set(px, anchorY + 0.85, pz);
  raceOrbit.apply(camera, orbitPivot, followEye, aim, dt, reducedMotion.matches);
}

function updateCamera(dt, fov, instant) {
  const blend = instant || reducedMotion.matches ? 1 : 1 - Math.exp(-dt * 7);
  followEye.lerp(desiredEye, blend);
  camera.position.copy(followEye);
  aim.lerp(desiredAim, blend);
  camera.lookAt(aim);
  camera.fov += (fov - camera.fov) * blend;
  camera.updateProjectionMatrix();
}

// 用和赛车一致的采样函数生成 SVG 路径与车辆标点，避免地图与赛道偏离。
// 功能：加长赛道仍能放入小地图，标记桥梁与两处飞跃坡。时间：2026-11-20 | 作者：lq。
function mapPoint(distance) {
  const [x, , z] = point(distance);
  return [100 + x * 0.34, 75 + z * 0.146];
}

function makeMap() {
  const d = Array.from({ length: 161 }, (_, i) => `${i ? 'L' : 'M'}${mapPoint(i / 160 * LAP).map((n) => n.toFixed(2)).join(',')}`).join(' ') + ' Z';
  document.querySelectorAll('.mini-map path').forEach((line) => line.setAttribute('d', d));
  const pins = [
    ...SECTORS.map((sector) => ({ s: sector.start + 135, type: 'bridge-pin' })),
    ...HILLS.map((hill) => ({ s: hill.start + hill.length / 2, type: 'hill-pin' })),
  ];
  pins.forEach(({ s, type }) => {
    const marker = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    const [x, y] = mapPoint(s);
    marker.setAttribute('cx', x);
    marker.setAttribute('cy', y);
    marker.setAttribute('r', type === 'hill-pin' ? 2.6 : 3.5);
    marker.classList.add(type);
    $('#mini-markers').append(marker);
  });
}

function updateHUD() {
  const speed = Math.round(race.player.velocity * 3.6);
  const boost = Math.round(race.player.boost * 100);
  const distance = Math.round(Math.max(0, race.player.distance - race.startDistance));
  $('#speed').textContent = String(speed).padStart(3, '0');
  $('#race-clock').textContent = formatTime(race.elapsed);
  $('#rank').textContent = `P${race.rank}`;
  $('#position-total').textContent = `/ ${fieldSize()}`;
  $('#boost-fill').style.width = `${boost}%`;
  $('#boost-value').textContent = `${boost}%`;
  $('#boost-state').classList.toggle('boost-active', race.player.boosting === true);
  $('#meter-fill').style.width = `${race.progress * 100}%`;
  $('#lap-indicator').textContent = `第 ${race.currentLap} / ${race.laps} 圈`;
  $('#lap-distance').textContent = `${distance} M`;
  const [x, y] = mapPoint(race.player.distance);
  $('#mini-car').setAttribute('cx', x);
  $('#mini-car').setAttribute('cy', y);
  const current = sample(race.player.distance);
  const bridge = SECTORS[current.x > 0 ? 1 : 0];
  $('#race-name').textContent = race.player.airborne ? '腾空' : current.hill?.name ?? (Math.abs(current.z) <= 135 ? bridge.name : current.turn ? '江岸弯道' : '江岸直道');
  $('#race-name').classList.toggle('is-airborne', race.player.airborne);
  updateEventHUD();
}

// 功能：显示前方距离、并道方向、临检停留与放行，扭转方向时无需额外按键。时间：2026-11-21 | 作者：lq。
function updateEventHUD() {
  const { player } = race;
  const next = roadEventFor(player, race.events);
  const checkpoint = player.lastCheckpoint;
  const gap = next ? next.distance - player.distance : Infinity;
  const justCleared = checkpoint && player.distance - checkpoint.distance < 50;
  const event = player.checkHold || justCleared ? checkpoint : gap <= EVENT_NOTICE ? next : null;
  eventAlert.hidden = race.status !== 'race' || !event;
  eventPin.setAttribute('visibility', eventAlert.hidden ? 'hidden' : 'visible');
  if (eventAlert.hidden) return;

  let phase = 'ahead';
  let action = event.kind === 'checkpoint' ? `提前刹车 · ${CHECK_SPEED} KM/H 以内通行` : `并入${event.openSide < 0 ? '左' : '右'}侧车道`;
  let metric = `${Math.max(0, Math.ceil(gap))} M`;
  if (event === checkpoint) {
    phase = player.checkHold ? 'hold' : 'clear';
    action = player.checkHold ? '超速停车 · 等待放行' : '检查完成 · 可以加速';
    metric = player.checkHold ? `${player.checkHold.toFixed(1)} S` : '放行';
  } else if (gap <= 0) {
    phase = 'inside';
    if (player.workContact) action = `驶入封闭区 · 请向${event.openSide < 0 ? '左' : '右'}并道`;
    metric = '施工区';
  }
  if (announcedEvent !== event) {
    announcedEvent = event;
    raceAudio.cue('roadEvent');
  }
  eventAlert.dataset.phase = phase;
  if (eventTitle.textContent !== eventNames[event.kind]) eventTitle.textContent = eventNames[event.kind];
  if (eventAction.textContent !== action) eventAction.textContent = action;
  if (eventMetric.textContent !== metric) eventMetric.textContent = metric;
  const [x, y] = mapPoint(event.distance);
  eventPin.setAttribute('cx', x);
  eventPin.setAttribute('cy', y);
}

function setCountdown(text) {
  const indicator = $('#countdown');
  indicator.textContent = text;
  indicator.classList.remove('hidden');
  if (reducedMotion.matches) return;
  indicator.getAnimations().forEach((animation) => animation.cancel());
  indicator.animate([
    { opacity: 0.35, scale: 1.45 }, { opacity: 1, scale: 1.04, offset: 0.25 }, { opacity: 0.45, scale: 0.96 },
  ], { duration: text === 'GO' ? 650 : 970, easing: 'ease-out' });
}

function activate(track, instant = false) {
  if (race.status !== 'menu') return;
  activeTrack = track;
  const sector = SECTORS[track];
  options.forEach((option, index) => {
    option.classList.toggle('selected', index === track);
    option.setAttribute('aria-pressed', String(index === track));
  });
  $('#sector-tag').textContent = `GRID ${String(track + 1).padStart(2, '0')} / 02`;
  $('#bridge-name').textContent = sector.name;
  $('#bridge-english').textContent = sector.english;
  resetGrid();
  refreshRecord();
  previewCamera(0, instant);
  updateHUD();
}

// 功能：比赛界面与配乐同步切换，按真实驾驶输入驱动引擎声。时间：2026-11-20 | 作者：lq。
function showMode(mode) {
  stage.dataset.mode = mode;
  if (!racing(mode)) raceOrbit.release();
  // 功能：同步直播窗口与比赛状态。时间：2026-11-21 | 作者：lq。
  raceDrone.setMode(mode);
  raceAudio.setMode(mode);
  $('#preflight').inert = mode !== 'menu';
  $('#preflight').classList.toggle('hidden', mode !== 'menu');
  const raceVisible = mode !== 'menu' && mode !== 'garage';
  $('#race-hud').inert = !raceVisible;
  $('#race-hud').classList.toggle('visible', raceVisible);
  // 功能：完赛自动驾驶时关闭暂停入口并清理驾驶输入。时间：2026-11-21 | 作者：lq。
  $('#pause-button').hidden = mode === 'finish';
  $('#race-phase').textContent = mode === 'finish' ? 'AUTO CRUISE' : 'RACE IN PROGRESS';
  $('#mobile-controls').inert = mode !== 'race' && mode !== 'countdown';
  $('#result').classList.toggle('hidden', mode !== 'finish');
  $('#pause').classList.toggle('hidden', mode !== 'paused');
  updateEventHUD();
}

function beginRace() {
  if (!cars.length || garageOpen || $('#control-settings').open || !['menu', 'finish'].includes(race.status)) return;
  raceOrbit.reset();
  resetGrid();
  // 功能：重赛时让无人机从新发车位开始跟拍。时间：2026-11-21 | 作者：lq。
  raceDrone.reset();
  if (preferences.steering === 'tilt') tilt.calibrate();
  race.status = 'countdown';
  goUntil = accumulator = 0;
  raceAudio.unlock();
  showMode('countdown');
  chaseCamera(0, true);
  updateHUD();
  setCountdown('3');
  raceAudio.cue('countdown');
}

function finishRace() {
  $('#result-time').textContent = formatTime(race.finishTime);
  // 功能：完赛页保留湿地标识，与当前赛事的成绩键一致。时间：2026-11-20 | 作者：lq。
  // 功能：完赛信息显示本场事件类型。时间：2026-11-21 | 作者：lq。
  $('#result-caption').textContent = `总用时 · ${race.laps} 圈${race.weather === 'rain' ? ' · 雨天' : ''}${eventNames[race.eventMode] ? ` · ${eventNames[race.eventMode]}` : ''}`;
  const record = !best || race.finishTime < best;
  if (record) {
    best = race.finishTime;
    try { localStorage.setItem(recordKey(), String(best)); } catch { /* 仍可显示本次成绩。 */ }
    $('#best-time').textContent = formatTime(best);
  }
  $('#new-record').classList.toggle('record-visible', record);
  $('#result-place').textContent = `P${race.rank} / ${fieldSize()}`;
  // 功能：冲线后释放踏板，保持自动巡航。时间：2026-11-21 | 作者：lq。
  clearInputs();
  $('#countdown').classList.add('hidden');
  goUntil = 0;
  showMode('finish');
  $('#retry').focus();
  raceAudio.cue('finish');
}

function clearInputs() {
  keys.clear();
  touches.clear();
  centerStick();
  document.querySelectorAll('[data-pressed]').forEach((button) => delete button.dataset.pressed);
}

function pause(resume = false) {
  if (resume ? race.status !== 'paused' : race.status !== 'race') return;
  clearInputs();
  race.status = resume ? 'race' : 'paused';
  if (resume) raceAudio.unlock();
  showMode(race.status);
  if (!resume) $('#resume').focus();
}

const bindings = { left: ['ArrowLeft', 'KeyA'], right: ['ArrowRight', 'KeyD'], accelerate: ['ArrowUp', 'KeyW', 'Space'], brake: ['ArrowDown', 'KeyS'], boost: ['ShiftLeft', 'ShiftRight'] };
function getInput() {
  const input = Object.fromEntries(Object.entries(bindings).map(([action, codes]) => [action, codes.some((code) => keys.has(code)) || [...touches.values()].includes(action)]));
  const mode = $('#mobile-controls').dataset.steering;
  const buttons = Number(input.right) - Number(input.left);
  const analog = !touchDriving.matches ? 0 : mode === 'tilt' ? tilt.value(preferences.sensitivity)
    : mode === 'stick' ? steeringAxis(stick.axis, 0.10, preferences.sensitivity) : 0;
  const touchSteering = [...touches.values()].some((action) => action === 'left' || action === 'right');
  const digital = buttons * (touchSteering ? preferences.sensitivity * 0.8 : 1);
  return { ...input, left: false, right: false, steering: digital || analog };
}

// 功能：单帧绘制独立于动画循环，便于启动时确认第一帧已经渲染。时间：2026-11-20 | 作者：lq。
function drawFrame(now) {
  const dt = previousFrame ? Math.min((now - previousFrame) / 1000, 0.12) : 0;
  previousFrame = now;
  if (garageOpen) {
    showroom.update(dt, innerWidth, innerHeight, reducedMotion.matches);
    renderer.render(showroom.scene, showroom.camera);
    return;
  }
  const before = race.status;
  const countdown = Math.ceil(race.countdown);
  // 功能：完赛后继续推进车辆、音效和跟车镜头。时间：2026-11-21 | 作者：lq。
  if (before === 'countdown' || before === 'race' || before === 'finish') {
    const input = before === 'finish' ? { accelerate: true } : getInput();
    // 功能：只在离地到接地的那一帧播放落地声。时间：2026-11-20 | 作者：lq。
    const wasAirborne = race.player.airborne;
    accumulator += dt;
    while (accumulator >= STEP) {
      race.step(STEP, input);
      accumulator -= STEP;
    }
    // 功能：临检停车时使用引擎怠速反馈。时间：2026-11-21 | 作者：lq。
    raceAudio.update(race.player, race.player.checkHold ? { ...input, accelerate: false } : input, race.countdown);
    if (wasAirborne && !race.player.airborne) raceAudio.touchdown(race.player.landing);
    const impact = race.takeImpact();
    if (impact > 0) raceAudio.impact(impact);
  }
  if (before === 'countdown' && race.status === 'race') {
    setCountdown('GO');
    raceAudio.cue('go');
    showMode('race');
    goUntil = now + 650;
  } else if (race.status === 'countdown' && countdown !== Math.ceil(race.countdown)) {
    setCountdown(String(Math.ceil(race.countdown)));
    raceAudio.cue('countdown');
  }
  if (goUntil && now > goUntil) {
    $('#countdown').classList.add('hidden');
    goUntil = 0;
  }
  if (before === 'race' && race.status === 'finish') {
    updateHUD();
    finishRace();
  }
  if (race.status === 'menu') previewCamera(dt);
  if (['countdown', 'race', 'finish'].includes(race.status)) chaseCamera(dt);
  // 功能：只显示和更新参与当前比赛的车辆，换车型数量无需重新加载 GLB。时间：2026-11-20 | 作者：lq。
  cars.forEach((car, index) => {
    const state = index === 0 ? race.player : race.rivals[index - 1];
    car.visible = Boolean(state);
    if (state) pose(car, state, night);
  });
  // 功能：尾焰仅在真实增压时出现，暂停、结束和回到菜单时收掉。时间：2026-11-20 | 作者：lq。
  cars[0]?.userData.updateNitro(race.status === 'race' && race.player.boosting, dt, now / 1000, reducedMotion.matches);
  if (now >= hudAt && ['race', 'finish'].includes(race.status)) {
    updateHUD();
    hudAt = now + 66;
  }
  // 功能：将系统减少动态偏好同步到江面动画。时间：2026-11-20 | 作者：lq。
  environment.update(camera, now / 1000, reducedMotion.matches);
  // 功能：完赛巡航时雨滴和旗面继续运动，暂停仍冻结。时间：2026-11-21 | 作者：lq。
  const moving = race.status !== 'paused';
  rain.update(dt, moving, reducedMotion.matches);
  track.updateFlags(dt, moving, reducedMotion.matches);
  updateRoadEventScene(race, reducedMotion.matches);
  updateTrafficScene(race);
  // 功能：同一帧先画驾驶画面，再画与车辆同位置、同时刻的无人机直播。时间：2026-11-21 | 作者：lq。
  raceDrone.update(race.player, dt, reducedMotion.matches);
  renderer.render(scene, camera);
  raceDrone.render(renderer, environment, now / 1000, reducedMotion.matches);
}

function backToGrid() {
  clearInputs();
  resetGrid();
  $('#countdown').classList.add('hidden');
  showMode('menu');
  activate(activeTrack, true);
  $('#start-button').focus();
}

function applyPreferences() {
  cars[0]?.userData.customize(preferences);
  const controls = $('#mobile-controls');
  const next = preferences.steering === 'tilt' && !tilt.ready ? 'stick' : preferences.steering;
  if (next !== controls.dataset.steering) clearInputs();
  controls.dataset.steering = next;
}

function openGarage() {
  if (!cars[0] || race.status !== 'menu' || garageOpen) return;
  garageOpen = true;
  showroom.scene.add(cars[0]);
  cars[0].position.set(0, 0, 0);
  cars[0].rotation.set(0, 0, 0);
  cars[0].userData.headlight.intensity = 0;
  showroom.align('front', true);
  $('#garage').hidden = false;
  showMode('garage');
}

function closeGarage() {
  if (!garageOpen) return;
  garageOpen = false;
  scene.add(cars[0]);
  pose(cars[0], race.player, night);
  $('#garage').hidden = true;
  showMode('menu');
  $('#garage-button').focus();
}

function centerStick() {
  stick.pointer = null;
  stick.axis = 0;
  $('#steer-stick').style.setProperty('--travel', '0px');
  delete $('#steer-stick').dataset.pressed;
}

// 左手摇杆和右手踏板分别捕获指针，允许同时转向、加速和使用氮气。
function bindStick() {
  const surface = $('#steer-stick');
  const move = (event) => {
    if (event.pointerId !== stick.pointer) return;
    const { left, width } = surface.getBoundingClientRect();
    const travel = width * 0.34;
    stick.axis = T.MathUtils.clamp((event.clientX - left - width / 2) / travel, -1, 1);
    surface.style.setProperty('--travel', `${stick.axis * travel}px`);
  };
  surface.addEventListener('pointerdown', (event) => {
    if (stick.pointer !== null || !['countdown', 'race'].includes(race.status)) return;
    event.preventDefault();
    stick.pointer = event.pointerId;
    surface.setPointerCapture(event.pointerId);
    surface.dataset.pressed = 'true';
    move(event);
  });
  surface.addEventListener('pointermove', move);
  ['pointerup', 'pointercancel', 'lostpointercapture'].forEach((name) => surface.addEventListener(name, (event) => {
    if (event.pointerId === stick.pointer) centerStick();
  }));
}

function bind() {
  const icon = (selector, svg) => document.querySelectorAll(selector).forEach((node) => {
    node.innerHTML = svg;
    node.querySelector('svg').setAttribute('aria-hidden', 'true');
  });
  icon('.sun-symbol', sun);
  icon('#start-button .launch-icon, .track-arrow', arrowUpRight);
  icon('#pause-button', pauseIcon);
  // 功能：给航拍开关添加四旋翼图标。时间：2026-11-21 | 作者：lq。
  icon('.drone-icon', droneIcon);
  icon('#resume .launch-icon', play);
  icon('#retry .launch-icon', retry);
  icon('[data-control="left"]', arrowLeft);
  icon('[data-control="right"]', arrowRight);
  icon('#settings-button', settingsIcon);
  icon('.garage-icon', carIcon);
  icon('.custom-color-icon', pipetteIcon);
  icon('#garage-close, #settings-close', closeIcon);
  icon('#tilt-zero', calibrateIcon);
  icon('.sound-icon', volumeOn);
  // 功能：统一菜单操作反馈，捕获阶段可支持动态车库按钮及键盘激活，不给驾驶控件加按键声。时间：2026-11-20 | 作者：lq。
  const menuCue = (type) => { raceAudio.unlock(); raceAudio.cue(type); };
  stage.addEventListener('click', (event) => {
    const action = event.target.closest('button, .brand, #body-color');
    if (!action || action.disabled || action.matches('#mute-toggle, #start-button, #retry, #mobile-controls *')) return;
    const type = action.matches('#settings-button, #pause-settings, #garage-button, #pause-button') ? 'open'
      : action.matches('#settings-close, #garage-close, #restart, #pause-restart') ? 'back'
        : action.matches('#resume') ? 'confirm' : 'select';
    menuCue(type);
  }, true);
  // 功能：发车与改装选项切换使用相同操作音。时间：2026-11-21 | 作者：lq。
  stage.querySelectorAll('.race-setting select').forEach((select) => select.addEventListener('change', () => menuCue('select')));
  $('#control-settings').addEventListener('cancel', () => menuCue('back'));
  const garage = bindGarage(preferences, tilt, {
    change: applyPreferences,
    view: (angle) => showroom.align(angle),
    open: openGarage,
    close: closeGarage,
    openSettings: () => { if (race.status === 'race') pause(); },
  });
  let drag;
  const orbit = $('.garage-orbit');
  orbit.addEventListener('pointerdown', (event) => {
    drag = { id: event.pointerId, x: event.clientX };
    orbit.setPointerCapture(event.pointerId);
  });
  orbit.addEventListener('pointermove', (event) => {
    if (event.pointerId !== drag?.id || drag.x === event.clientX) return;
    showroom.rotate(event.clientX - drag.x);
    drag.x = event.clientX;
    garage.clearView();
  });
  orbit.addEventListener('lostpointercapture', () => { drag = undefined; });
  $('#tilt-zero').onclick = () => tilt.calibrate();
  bindStick();
  addEventListener('resize', resize);
  addEventListener('keydown', (event) => {
    if ($('#control-settings').open) return;
    if (garageOpen) {
      if (event.code === 'Escape' && !event.repeat) { menuCue('back'); closeGarage(); }
      return;
    }
    if (race.status === 'race' || race.status === 'countdown') {
      // 功能：键盘焦点在直播开关上时，空格执行按钮的原生操作。时间：2026-11-21 | 作者：lq。
      if (event.code === 'Space' && event.target.matches?.('#drone-toggle:focus-visible')) return;
      if (Object.values(bindings).some((codes) => codes.includes(event.code))) {
        event.preventDefault();
        keys.add(event.code);
      }
    }
    if (event.repeat) return;
    if (event.code === 'Enter' && race.status === 'menu' && !event.target.closest?.('button, a, select')) beginRace();
    if (event.code === 'Escape' && ['race', 'paused'].includes(race.status)) {
      const resume = race.status === 'paused';
      menuCue(resume ? 'confirm' : 'open');
      pause(resume);
    }
  });
  addEventListener('keyup', (event) => keys.delete(event.code));
  addEventListener('blur', () => { clearInputs(); pause(); });
  document.addEventListener('visibilitychange', raceAudio.sync);
  $('#start-button').addEventListener('click', beginRace);
  $('#retry').addEventListener('click', beginRace);
  $('#pause-button').addEventListener('click', () => pause());
  $('#resume').addEventListener('click', () => pause(true));
  $('#restart').addEventListener('click', backToGrid);
  $('#pause-restart').addEventListener('click', backToGrid);
  options.forEach((option, i) => option.addEventListener('click', () => activate(i)));
  $('#time-toggle').addEventListener('click', () => {
    night = !night;
    icon('.sun-symbol', night ? moon : sun);
    stage.classList.toggle('night-mode', night);
    $('#time-label').textContent = night ? '夜间' : '日间';
    $('#time-toggle').setAttribute('aria-pressed', String(night));
    $('#time-toggle').setAttribute('aria-label', night ? '切换到日间' : '切换到夜间');
    $('#time-toggle').title = night ? '切换到日间' : '切换到夜间';
    // 功能：日夜按键只改变光照，雨天及湿地驾驶规则继续生效。时间：2026-11-20 | 作者：lq。
    applyWeather();
  });
  $('#mute-toggle').addEventListener('click', () => {
    muted = !muted;
    $('#mute-toggle').setAttribute('aria-pressed', String(muted));
    $('#mute-toggle').setAttribute('aria-label', muted ? '开启声音' : '静音');
    $('#mute-toggle').title = muted ? '开启声音' : '静音';
    $('#sound-label').textContent = muted ? 'SOUND OFF' : 'SOUND ON';
    icon('.sound-icon', muted ? volumeOff : volumeOn);
    raceAudio.setMuted(muted);
    if (!muted) raceAudio.cue('confirm');
  });
  const touchControls = $('#mobile-controls');
  touchControls.addEventListener('pointerdown', (event) => {
    const button = event.target.closest('[data-control]');
    if (!button || !['countdown', 'race'].includes(race.status)) return;
    event.preventDefault();
    button.setPointerCapture(event.pointerId);
    touches.set(event.pointerId, button.dataset.control);
    button.dataset.pressed = 'true';
  });
  for (const eventName of ['pointerup', 'pointercancel', 'lostpointercapture']) {
    touchControls.addEventListener(eventName, (event) => {
      touches.delete(event.pointerId);
      const button = event.target.closest('[data-control]');
      if (button && ![...touches.values()].includes(button.dataset.control)) delete button.dataset.pressed;
    });
  }
}

// 功能：车模和首帧就绪后开放比赛与车库入口。时间：2026-11-20 | 作者：lq。
export async function startGame() {
  resize();
  makeMap();
  bindRaceSettings();
  showMode('menu');
  activate(0, true);
  // 功能：在首帧打开界面前渲染已保存的赛道天气。时间：2026-11-20 | 作者：lq。
  applyWeather();
  bind();
  cars = await buildCars(scene, renderer);
  applyPreferences();
  drawFrame(performance.now());
  $('#start-button').disabled = false;
  $('#garage-button').disabled = false;
  requestAnimationFrame(function frame(now) {
    drawFrame(now);
    requestAnimationFrame(frame);
  });
}
