/**
 * 功能：计算摇杆死区和按屏幕方向转换的体感转向，并处理浏览器传感器权限。
 * 时间：2026-11-20 | 作者：lq
 */
export function steeringAxis(value, deadZone, sensitivity = 1) {
  const magnitude = Math.min(1, Math.max(0, (Math.abs(value) - deadZone) / (1 - deadZone)) * sensitivity);
  return magnitude ? Math.sign(value) * magnitude : 0;
}

// 按设备姿态计算重力在屏幕横向的投影，横竖屏使用同一符号约定。
export function screenTilt(beta, gamma, angle) {
  if (!Number.isFinite(beta) || !Number.isFinite(gamma)) return null;
  const deg = Math.PI / 180;
  const lateral = Math.sin(gamma * deg) * Math.cos(beta * deg) * Math.cos(angle * deg)
    + Math.sin(beta * deg) * Math.sin(angle * deg);
  return Math.asin(Math.max(-1, Math.min(1, lateral))) / deg;
}

export function makeTilt() {
  let latest = null;
  let neutral = null;
  let rotation;
  let handler;
  let pending = false;
  return {
    get ready() { return latest !== null && neutral !== null; },
    async enable() {
      if (this.ready) return;
      if (pending) throw new Error('正在等待传感器，请稍候。');
      if (!window.isSecureContext) throw new Error('体感需要 HTTPS 或本机 localhost，请改用摇杆或按键。');
      const api = window.DeviceOrientationEvent;
      if (!api) throw new Error('此浏览器没有提供体感传感器，请改用摇杆或按键。');
      pending = true;
      try {
        if (typeof api.requestPermission === 'function' && await api.requestPermission() !== 'granted') {
          throw new Error('未授权访问传感器，继续使用摇杆。');
        }
        await new Promise((resolve, reject) => {
          const timeout = setTimeout(() => {
            window.removeEventListener('deviceorientation', handler);
            handler = undefined;
            reject(new Error('未收到手机姿态数据，继续使用摇杆。'));
          }, 2400);
          handler = ({ beta, gamma }) => {
            const angle = screen.orientation?.angle ?? window.orientation ?? 0;
            const tilt = screenTilt(beta, gamma, angle);
            if (tilt === null) return;
            if (neutral === null || rotation !== angle) neutral = tilt;
            latest = tilt;
            rotation = angle;
            clearTimeout(timeout);
            resolve();
          };
          window.addEventListener('deviceorientation', handler);
        });
      } finally {
        pending = false;
      }
    },
    calibrate() { if (latest !== null) neutral = latest; },
    value(sensitivity) { return this.ready ? steeringAxis((latest - neutral) / 22, 0.09, sensitivity) : 0; },
  };
}
