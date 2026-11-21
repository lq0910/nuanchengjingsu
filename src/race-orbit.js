/**
 * 功能：比赛中用鼠标右键绕玩家车辆环视，松开后沿最近方向回正。
 * 时间：2026-11-21 | 作者：lq
 */
import { MathUtils, Vector3 } from 'three';

const TAU = Math.PI * 2;
const RADIANS_PER_PIXEL = 0.008;
const isControl = (target) => target.closest('button, a, input, select, textarea, dialog');

export function makeRaceOrbit(surface, canLook) {
  const offset = new Vector3();
  const target = new Vector3();
  let drag = null;
  let yaw = 0;
  let pitch = 0;

  // 功能：离开可驾驶状态或丢失指针时结束拖动，避免镜头卡在环视状态。时间：2026-11-21 | 作者：lq。
  function release() {
    if (!drag) return;
    const { id } = drag;
    drag = null;
    delete surface.dataset.orbiting;
    if (surface.hasPointerCapture(id)) surface.releasePointerCapture(id);
  }

  surface.addEventListener('contextmenu', (event) => {
    if (canLook() && !isControl(event.target)) event.preventDefault();
  });
  surface.addEventListener('pointerdown', (event) => {
    if (event.pointerType !== 'mouse' || event.button !== 2 || !canLook() || isControl(event.target)) return;
    event.preventDefault();
    surface.setPointerCapture(event.pointerId);
    drag = { id: event.pointerId, x: event.clientX, y: event.clientY };
    surface.dataset.orbiting = '';
  });
  surface.addEventListener('pointermove', (event) => {
    if (event.pointerId !== drag?.id) return;
    if (!(event.buttons & 2) || !canLook()) return release();
    yaw = MathUtils.euclideanModulo(yaw - (event.clientX - drag.x) * RADIANS_PER_PIXEL + Math.PI, TAU) - Math.PI;
    pitch = MathUtils.clamp(pitch + (event.clientY - drag.y) * RADIANS_PER_PIXEL, -0.23, 0.88);
    drag.x = event.clientX;
    drag.y = event.clientY;
  });
  for (const eventName of ['pointerup', 'pointercancel', 'lostpointercapture']) {
    surface.addEventListener(eventName, (event) => { if (event.pointerId === drag?.id) release(); });
  }
  // 同时按住其他鼠标键时，松开右键也要回正，此时浏览器不一定派发 pointerup。
  window.addEventListener('mouseup', (event) => { if (event.button === 2) release(); });
  window.addEventListener('blur', release);

  return {
    release,
    reset() {
      release();
      yaw = pitch = 0;
    },
    // 功能：只改变渲染机位，不写回跟车镜头的平滑状态；回正沿圆弧而非穿过车身。时间：2026-11-21 | 作者：lq。
    apply(camera, pivot, eye, aim, dt, reducedMotion) {
      if (!drag) {
        const decay = reducedMotion ? 0 : Math.exp(-dt * 9);
        yaw *= decay;
        pitch *= decay;
      }
      const amount = Math.hypot(yaw, pitch);
      if (amount < 0.001) return;

      offset.subVectors(eye, pivot);
      const horizontal = Math.hypot(offset.x, offset.z);
      const radius = Math.hypot(horizontal, offset.y);
      const baseElevation = Math.atan2(offset.y, horizontal);
      const azimuth = Math.atan2(offset.x, offset.z) + yaw;
      const elevation = MathUtils.lerp(baseElevation,
        MathUtils.clamp(baseElevation + pitch, 0.05, 1.16), MathUtils.smoothstep(amount, 0, 0.23));
      const reach = radius * Math.cos(elevation);
      camera.position.set(pivot.x + Math.sin(azimuth) * reach,
        pivot.y + Math.sin(elevation) * radius, pivot.z + Math.cos(azimuth) * reach);
      target.copy(aim).lerp(pivot, MathUtils.smoothstep(amount, 0, 0.65));
      camera.lookAt(target);
    },
  };
}
