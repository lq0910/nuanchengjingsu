/**
 * 功能：绑定实时车库定制和转向设置，并保存到当前浏览器。
 * 时间：2026-11-20 | 作者：lq
 */
import { DEFAULTS, LIVERIES, SHOWCASE_COLORS, normalizePlate, writeSettings } from './customization.js';

export function bindGarage(config, tilt, { change, view, open, close, openSettings }) {
  const $ = (name) => document.querySelector(name);
  const controls = $('#control-settings');
  const note = $('#control-note');
  const plate = $('#plate-input');
  const color = $('#body-color');
  const facing = [...document.querySelectorAll('[data-view]')];
  const modes = [...document.querySelectorAll('[data-steering-mode]')];
  const levels = [...document.querySelectorAll('[data-sensitivity]')];
  const liveryButtons = Object.entries(LIVERIES).map(([id, item]) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'livery-choice';
    button.dataset.livery = id;
    button.style.setProperty('--base', item.body);
    button.style.setProperty('--line', item.accent);
    button.style.setProperty('--ink', item.ink);
    button.innerHTML = `<span class="livery-sample" aria-hidden="true"></span><span>${item.title}</span>`;
    button.onclick = () => {
      Object.assign(config, { livery: id, color: item.body });
      sync();
    };
    $('#livery-options').append(button);
    return button;
  });
  const paints = SHOWCASE_COLORS.map((hex) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'paint-swatch';
    button.dataset.paint = hex;
    button.style.setProperty('--paint', hex);
    const label = { '#325c8a': '深海蓝', '#e5e8e1': '雪岩白', '#303c34': '松林绿', '#a72b27': '赛道红', '#21252b': '石墨黑', '#b4782c': '曜铜金' }[hex];
    button.title = label;
    button.setAttribute('aria-label', label);
    button.onclick = () => { config.color = hex; sync(); };
    $('#paint-swatches').append(button);
    return button;
  });

  function sync(save = true) {
    liveryButtons.forEach((item) => item.setAttribute('aria-pressed', item.dataset.livery === config.livery));
    paints.forEach((item) => item.setAttribute('aria-pressed', item.dataset.paint === config.color));
    modes.forEach((item) => item.setAttribute('aria-pressed', item.dataset.steeringMode === config.steering));
    levels.forEach((item) => item.setAttribute('aria-pressed', Number(item.dataset.sensitivity) === config.sensitivity));
    $('#tilt-calibrate').hidden = config.steering !== 'tilt';
    $('#tilt-calibrate').textContent = tilt.ready ? '校准体感中位' : '启用手机传感器';
    $('#plate-length').textContent = `${Array.from(plate.value).length} / 9`;
    if (color.value !== config.color) color.value = config.color;
    if (save) writeSettings(config);
    change();
  }

  function preview(which) {
    facing.forEach((button) => button.setAttribute('aria-pressed', button.dataset.view === which));
    view(which);
  }

  async function requestTilt() {
    modes.forEach((button) => { button.disabled = true; });
    $('#tilt-calibrate').disabled = true;
    try {
      await tilt.enable();
      tilt.calibrate();
      config.steering = 'tilt';
      note.textContent = '体感已校准';
    } catch (error) {
      if (config.steering === 'tilt') config.steering = 'stick';
      note.textContent = error.message || '体感不可用，请使用摇杆或按键。';
    } finally {
      modes.forEach((button) => { button.disabled = false; });
      $('#tilt-calibrate').disabled = false;
      note.hidden = false;
      sync();
    }
  }

  plate.value = config.plate;
  plate.addEventListener('focus', () => preview('rear'));
  const editPlate = (event) => {
    if (event.isComposing) return;
    const sanitized = normalizePlate(plate.value);
    if (sanitized !== plate.value) plate.value = sanitized;
    config.plate = sanitized || DEFAULTS.plate;
    sync();
  };
  plate.addEventListener('input', editPlate);
  plate.addEventListener('compositionend', editPlate);
  color.addEventListener('input', () => { config.color = color.value; sync(); });
  // 功能：选配时自动转到对应的车身视角，并沿用车库的本地保存。时间：2026-11-21 | 作者：lq。
  for (const [selector, key, angle] of [['#spoiler-style', 'spoiler', 'rear'], ['#rim-style', 'rims', 'side']]) {
    const select = $(selector);
    select.value = config[key];
    select.addEventListener('change', () => {
      config[key] = select.value;
      preview(angle);
      sync();
    });
  }
  facing.forEach((button) => button.onclick = () => preview(button.dataset.view));
  $('#garage-button').onclick = () => { open(); preview('front'); $('#garage-close').focus(); };
  $('#garage-close').onclick = close;
  for (const selector of ['#settings-button', '#pause-settings']) {
    $(selector).onclick = () => {
      openSettings();
      note.hidden = config.steering !== 'tilt' || tilt.ready;
      note.textContent = '当前使用摇杆，启用传感器后切换为体感。';
      if (!controls.open) controls.showModal();
    };
  }
  for (const button of modes) {
    button.onclick = () => {
      if (button.dataset.steeringMode === 'tilt') { void requestTilt(); return; }
      config.steering = button.dataset.steeringMode;
      note.hidden = true;
      sync();
    };
  }
  $('#tilt-calibrate').onclick = () => void requestTilt();
  levels.forEach((button) => button.onclick = () => { config.sensitivity = Number(button.dataset.sensitivity); sync(); });
  sync(false);
  return { clearView: () => facing.forEach((button) => button.setAttribute('aria-pressed', 'false')) };
}
