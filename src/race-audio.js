/**
 * 功能：合成 V6 风格引擎、倒计时轰油、菜单反馈及赛事混音。
 * 时间：2026-11-20 | 作者：lq
 */
import soundtrack from '../studiokolomna-motor-sport-632661.mp3?url';

const clamp01 = (value) => Math.max(0, Math.min(1, value));
const shiftSpeeds = [0, 15, 28, 41, 55, 68, 86];
// 功能：提高配乐电平，全油门时只小幅让位给引擎声。时间：2026-11-21 | 作者：lq。
const musicMix = { countdown: 0.27, race: 0.40, throttleDuck: 0.035 };
const menuTones = {
  select: [[415, 625, 0, 0.085, 0.09]],
  open: [[290, 420, 0, 0.10, 0.10], [545, 740, 0.055, 0.13, 0.07]],
  back: [[540, 375, 0, 0.09, 0.08], [330, 235, 0.04, 0.13, 0.08]],
  confirm: [[340, 495, 0, 0.09, 0.10], [600, 830, 0.05, 0.15, 0.09]],
  // 功能：首次进入事件预警范围时播放短促提示音。时间：2026-11-21 | 作者：lq。
  roadEvent: [[410, 560, 0, 0.13, 0.12], [460, 650, 0.13, 0.13, 0.10]],
};

// 三段油门包络跟随模拟倒计时，掉帧、重赛和静音都不会堆积独立音轨。
function launchLoad(remaining, pedal) {
  const elapsed = Math.max(0, 3 - remaining);
  const pulse = (start, rise, fall) => Math.max(0, Math.min((elapsed - start) / rise, (start + rise + fall - elapsed) / fall));
  const automatic = 0.70 * pulse(0.16, 0.29, 0.49) + 0.90 * pulse(1.17, 0.35, 0.43)
    + 0.89 * clamp01((elapsed - 2.19) / 0.71);
  return pedal ? Math.max(automatic, 0.66 + 0.12 * Math.sin(elapsed * 11)) : automatic;
}

export function makeRaceAudio() {
  let context, master, musicLevel, engine, exhaust, intake, rumble, growl, tires, air, nitro, rain, noiseBuffer;
  let lastImpact = -Infinity;
  let gear, shiftUntil = 0;
  let muted = false;
  let mode = 'menu';
  // 功能：湿地声部与比赛和静音状态共享音频图。时间：2026-11-20 | 作者：lq。
  let wet = false;
  const music = new Audio();
  music.preload = 'none';
  music.loop = true;

  // 延迟到用户手势中创建音频图，允许浏览器正常授权播放。
  function unlock() {
    if (muted || document.hidden) return;
    if (context) {
      if (context.state !== 'running') void context.resume().catch(() => {});
      return;
    }
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (!AudioContext) return;
    try { context = new AudioContext(); } catch { return; }
    master = context.createGain();
    const limiter = context.createDynamicsCompressor();
    limiter.threshold.value = -11;
    limiter.knee.value = 12;
    limiter.ratio.value = 5;
    limiter.attack.value = 0.004;
    limiter.release.value = 0.16;
    master.connect(limiter).connect(context.destination);

    musicLevel = context.createGain();
    musicLevel.gain.value = musicMix.countdown;
    context.createMediaElementSource(music).connect(musicLevel).connect(master);
    music.src = soundtrack;

    // 分开排气脉冲、两组气缸低谐波和进气粗糙度，再轻饱和塑形。
    engine = context.createGain();
    engine.gain.value = 0;
    const drive = context.createWaveShaper();
    drive.curve = Float32Array.from({ length: 1024 }, (_, i) => Math.tanh((i / 1023 * 2 - 1) * 1.65));
    drive.oversample = '2x';
    intake = context.createBiquadFilter();
    intake.type = 'lowpass';
    intake.Q.value = 0.8;
    const body = context.createBiquadFilter();
    body.type = 'peaking';
    body.frequency.value = 155;
    body.gain.value = 4;
    body.Q.value = 0.8;
    engine.connect(drive).connect(intake).connect(body).connect(master);
    exhaust = context.createOscillator();
    const real = new Float32Array(20);
    const imag = new Float32Array(real.length);
    for (let h = 1; h < real.length; h++) {
      real[h] = (1 + 0.42 * Math.cos(h * 2.54)) / h ** 0.73;
      imag[h] = -0.42 * Math.sin(h * 2.54) / h ** 0.73;
    }
    exhaust.setPeriodicWave(context.createPeriodicWave(real, imag));
    const exhaustLevel = context.createGain();
    exhaustLevel.gain.value = 0.57;
    exhaust.connect(exhaustLevel).connect(engine);
    exhaust.start();
    rumble = context.createOscillator();
    rumble.type = 'triangle';
    const rumbleLevel = context.createGain();
    rumbleLevel.gain.value = 0.32;
    rumble.connect(rumbleLevel).connect(engine);
    rumble.start();

    // 轮胎摩擦和风切共用循环噪声，但分别塑形和控制响度。
    noiseBuffer = context.createBuffer(1, context.sampleRate * 2, context.sampleRate);
    const samples = noiseBuffer.getChannelData(0);
    for (let i = 0; i < samples.length; i++) samples[i] = Math.random() * 2 - 1;
    const noise = context.createBufferSource();
    noise.buffer = noiseBuffer;
    noise.loop = true;
    function noiseBand(type, frequency, resonance, output = master) {
      const filter = context.createBiquadFilter();
      filter.type = type;
      filter.frequency.value = frequency;
      filter.Q.value = resonance;
      const level = context.createGain();
      level.gain.value = 0;
      noise.connect(filter).connect(level).connect(output);
      return { level, filter };
    }
    tires = noiseBand('bandpass', 1350, 2.1);
    air = noiseBand('lowpass', 550, 0.65);
    nitro = noiseBand('bandpass', 2400, 0.72);
    rain = noiseBand('bandpass', 1750, 0.48);
    growl = noiseBand('bandpass', 290, 0.52, engine);
    noise.start();
    if (context.state !== 'running') void context.resume().catch(() => {});
  }

  // 功能：完赛巡航保留配乐、引擎和环境声。时间：2026-11-21 | 作者：lq。
  const active = () => !muted && !document.hidden && (mode === 'countdown' || mode === 'race' || mode === 'finish');

  // 功能：离地时关闭轮胎摩擦声，略抬高风声；触地后恢复路感。时间：2026-11-20 | 作者：lq。
  function update({ velocity = 0, boosting = false, airborne = false } = {}, { accelerate, brake, steering = 0 } = {}, countdown = 3) {
    if (!context) return;
    const driving = active();
    const staging = mode === 'countdown';
    const throttle = driving && accelerate && !brake;
    const speed = clamp01(velocity / 84);
    const t = context.currentTime;
    let nextGear = gear ?? 0;
    while (nextGear < shiftSpeeds.length - 2 && velocity >= shiftSpeeds[nextGear + 1]) nextGear++;
    while (nextGear > 0 && velocity < shiftSpeeds[nextGear] - 2.4) nextGear--;
    // 退挡保留速度滞回，升挡短暂收油并掉转速，不改变物理车速。
    if (driving && !staging && gear !== undefined && nextGear > gear && throttle) shiftUntil = t + 0.13;
    gear = driving && !staging ? nextGear : undefined;
    const rev = clamp01((velocity - shiftSpeeds[nextGear]) / (shiftSpeeds[nextGear + 1] - shiftSpeeds[nextGear]));
    const load = staging ? launchLoad(countdown, throttle) : throttle ? (t < shiftUntil ? 0.25 : 1) : 0;
    const rpm = staging ? 970 + 5650 * load : (nextGear === 0 ? 1010 : 3850) + rev * (nextGear === 0 ? 5800 : 3000) + 430 * load;
    const skid = mode === 'race' && !airborne ? Math.max(brake ? clamp01((velocity - 2) / 18) : 0,
      Math.abs(steering) * clamp01((velocity - 30) / 34) * 0.38) : 0;
    exhaust.frequency.setTargetAtTime(rpm * 3 / 60, t, 0.060);
    rumble.frequency.setTargetAtTime(rpm * 1.5 / 60, t, 0.067);
    growl.filter.frequency.setTargetAtTime(150 + rpm * 0.10, t, 0.05);
    growl.level.gain.setTargetAtTime(0.055 + load * 0.30, t, 0.045);
    intake.frequency.setTargetAtTime(370 + rpm * 0.13 + load * 1550, t, 0.057);
    // 功能：适当降低比赛引擎总响度，保留转速反馈并让配乐更清晰。时间：2026-11-21 | 作者：lq。
    engine.gain.setTargetAtTime(driving ? 0.09 + speed * 0.034 + load * 0.28 : 0, t, 0.035);
    musicLevel.gain.setTargetAtTime(staging ? musicMix.countdown : musicMix.race - load * musicMix.throttleDuck, t, 0.15);
    // 功能：下雨时混入持续雨声和接地轮胎的水声，离地时仅保留雨声。时间：2026-11-20 | 作者：lq。
    tires.filter.frequency.setTargetAtTime((wet ? 710 : 980) + speed * 1180, t, 0.08);
    tires.level.gain.setTargetAtTime(driving ? skid * (wet ? 0.28 : 0.39) : 0, t, 0.04);
    const spray = !staging && !airborne ? speed * 0.14 : 0;
    rain.level.gain.setTargetAtTime(driving && wet ? 0.13 + spray : 0, t, 0.10);
    air.filter.frequency.setTargetAtTime(280 + speed * 1200, t, 0.11);
    air.level.gain.setTargetAtTime(driving ? (airborne ? 0.19 : 0.11) * speed ** 1.4 : 0, t, 0.075);
    nitro.level.gain.setTargetAtTime(driving && !staging && boosting ? 0.24 : 0, t, 0.045);
  }

  // 暂停、后台和静音共用生命周期，重赛从曲首开始且只保留一条音乐轨。
  function sync() {
    if (!context) return;
    master.gain.setTargetAtTime(muted || document.hidden ? 0 : 1, context.currentTime, 0.018);
    if (active()) {
      if (music.paused) void music.play().catch(() => {});
    } else {
      music.pause();
      update();
    }
  }

  function setMode(next) {
    mode = next;
    if (next !== 'race') shiftUntil = 0;
    if (context && (next === 'countdown' || next === 'menu')) music.currentTime = 0;
    sync();
  }

  function setMuted(next) {
    muted = next;
    if (!muted) unlock();
    sync();
  }

  // 撞击由相对速度触发，短促低频冲击叠加摩擦声，同一次接触不连续爆响。
  function impact(speed) {
    if (!context || !active() || mode !== 'race' || speed < 1.8) return;
    const t = context.currentTime;
    if (t - lastImpact < 0.19) return;
    lastImpact = t;
    const force = clamp01(speed / 14);
    const crunch = context.createBufferSource();
    const filter = context.createBiquadFilter();
    const crunchLevel = context.createGain();
    crunch.buffer = noiseBuffer;
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(1250 + 1700 * force, t);
    filter.frequency.exponentialRampToValueAtTime(160, t + 0.17);
    crunchLevel.gain.setValueAtTime(0.2 + force * 0.44, t);
    crunchLevel.gain.exponentialRampToValueAtTime(0.0001, t + 0.24);
    crunch.connect(filter).connect(crunchLevel).connect(master);
    crunch.start(t, Math.random(), 0.24);
    const thump = context.createOscillator();
    const thumpLevel = context.createGain();
    thump.type = 'triangle';
    thump.frequency.setValueAtTime(105, t);
    thump.frequency.exponentialRampToValueAtTime(34, t + 0.14);
    thumpLevel.gain.setValueAtTime(0.09 + force * 0.21, t);
    thumpLevel.gain.exponentialRampToValueAtTime(0.0001, t + 0.18);
    thump.connect(thumpLevel).connect(master);
    thump.start(t);
    thump.stop(t + 0.19);
  }

  // 短促的上下行音色区分选择、打开和返回；比赛提示沿用独立声部。
  function tone(start, from, to, duration, gain, waveform) {
    const oscillator = context.createOscillator();
    const level = context.createGain();
    oscillator.type = waveform;
    oscillator.frequency.setValueAtTime(from, start);
    oscillator.frequency.exponentialRampToValueAtTime(to, start + duration * 0.80);
    level.gain.setValueAtTime(0.0001, start);
    level.gain.exponentialRampToValueAtTime(gain, start + 0.009);
    level.gain.exponentialRampToValueAtTime(0.0001, start + duration);
    oscillator.connect(level).connect(master);
    oscillator.start(start);
    oscillator.stop(start + duration + 0.01);
  }

  // 功能：以独立的低频短脉冲提示落地，不复用车辆撞击的刮擦声。时间：2026-11-20 | 作者：lq。
  function touchdown(strength) {
    if (!context || !active() || mode !== 'race' || strength < 0.1) return;
    tone(context.currentTime, 88, 36, 0.16, 0.26 * strength, 'triangle');
  }

  function cue(type) {
    if (!context || muted || document.hidden) return;
    const t = context.currentTime;
    if (menuTones[type]) {
      for (const [from, to, offset, duration, gain] of menuTones[type]) tone(t + offset, from, to, duration, gain, 'triangle');
    } else if (type === 'countdown') tone(t, 535, 435, 0.18, 0.18, 'sine');
    else if (type === 'go') tone(t, 710, 1110, 0.30, 0.20, 'triangle');
    else if (type === 'finish') tone(t, 400, 640, 0.29, 0.18, 'triangle');
  }

  return { unlock, setMode, setMuted, sync, update, cue, impact, touchdown, setWet: (value) => { wet = value; } };
}
