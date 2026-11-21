/**
 * 功能：定义车库涂装、转向偏好和车牌格式，校验本地设置。
 * 时间：2026-11-20 | 作者：lq
 */
export const LIVERIES = {
  river: { title: '江潮 GT', number: '07', body: '#325c8a', ink: '#102542', accent: '#f18a43', light: '#e6f4f9' },
  heritage: { title: '白翼经典', number: '84', body: '#e5e8e1', ink: '#182933', accent: '#d74334', light: '#ffffff' },
  midnight: { title: '墨夜拉力', number: '31', body: '#303c34', ink: '#111c1b', accent: '#bde078', light: '#ebf4d9' },
  solid: { title: '原厂纯色', number: '', body: '#a72b27', ink: '#1b252c', accent: '#e7c4a0', light: '#ffffff' },
};

// 功能：旧存档自动采用原厂尾翼与轮毂，校验新改装选项。时间：2026-11-21 | 作者：lq。
export const DEFAULTS = { livery: 'river', color: LIVERIES.river.body, plate: 'RS5·007', steering: 'stick', sensitivity: 1, spoiler: 'stock', rims: 'stock' };
export const SHOWCASE_COLORS = ['#325c8a', '#e5e8e1', '#303c34', '#a72b27', '#21252b', '#b4782c'];
const STORAGE_KEY = 'river-circuit-garage-v1';

export function normalizePlate(value) {
  return Array.from(String(value ?? '').normalize('NFKC').toUpperCase().replace(/[^\p{Script=Han}A-Z0-9·\- ]/gu, '').trim()).slice(0, 9).join('');
}

export function normalizeSettings(config = {}) {
  const livery = Object.hasOwn(LIVERIES, config?.livery) ? config.livery : DEFAULTS.livery;
  return {
    livery,
    color: /^#[0-9a-f]{6}$/i.test(config?.color) ? config.color.toLowerCase() : LIVERIES[livery].body,
    plate: normalizePlate(config?.plate) || DEFAULTS.plate,
    steering: ['stick', 'buttons', 'tilt'].includes(config?.steering) ? config.steering : DEFAULTS.steering,
    sensitivity: [0.75, 1, 1.25].includes(config?.sensitivity) ? config.sensitivity : 1,
    spoiler: ['lip', 'gt'].includes(config?.spoiler) ? config.spoiler : DEFAULTS.spoiler,
    rims: ['sport', 'split'].includes(config?.rims) ? config.rims : DEFAULTS.rims,
  };
}

export function readSettings() {
  try { return normalizeSettings(JSON.parse(localStorage.getItem(STORAGE_KEY))); } catch { return { ...DEFAULTS }; }
}

export function writeSettings(config) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(normalizeSettings(config))); } catch { /* 存储不可用时仍应用本次设置。 */ }
}
