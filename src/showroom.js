/**
 * 功能：使用同一辆参赛车辆渲染全屏车库，支持前后视角和水平拖拽。
 * 时间：2026-11-20 | 作者：lq
 */
import * as T from 'three';

export function makeShowroom() {
  const scene = new T.Scene();
  // 功能：用中性展台衬托车漆，并与石墨界面统一。时间：2026-11-20 | 作者：lq。
  scene.background = new T.Color('#16171c');
  scene.fog = new T.FogExp2('#16171c', 0.085);
  const camera = new T.PerspectiveCamera(44, 1, 0.1, 120);
  scene.add(new T.HemisphereLight('#eceff5', '#575960', 2.45));
  const key = new T.DirectionalLight('#fff2dc', 2.75);
  key.position.set(-4, 7, 1);
  const rim = new T.DirectionalLight('#d9ecff', 1.45);
  rim.position.set(5, 3, -4);
  const front = new T.DirectionalLight('#e2ebf1', 0.65);
  front.position.set(-3, 1.3, -6);
  scene.add(key, rim, front);
  const floor = new T.Mesh(new T.PlaneGeometry(250, 250), new T.MeshStandardMaterial({ color: '#292b31', roughness: 0.87 }));
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = -0.018;
  scene.add(floor);
  const plinth = new T.Mesh(new T.CircleGeometry(3.45, 96), new T.MeshStandardMaterial({ color: '#353841', roughness: 0.59, metalness: 0.21 }));
  plinth.rotation.x = -Math.PI / 2;
  plinth.position.y = -0.008;
  scene.add(plinth);
  for (const [start, length, tint] of [[0, Math.PI * 2, '#6c707b'], [0.55, 0.84, '#f66a77'], [3.69, 0.84, '#f66a77']]) {
    const strip = new T.Mesh(new T.RingGeometry(3.42, 3.45, 100, 1, start, length), new T.MeshBasicMaterial({ color: tint }));
    strip.rotation.x = -Math.PI / 2;
    strip.position.y = start === 0 ? 0.002 : 0.005;
    scene.add(strip);
  }
  let target = -0.84;
  let yaw = target;
  return {
    scene, camera,
    align(view, instant = false) {
      // 功能：轮毂使用近侧视角，尾翼使用原有后视角。时间：2026-11-21 | 作者：lq。
      const selected = { front: -0.84, side: -1.50, rear: -2.59 }[view] ?? -0.84;
      target = instant ? selected : selected + Math.round((yaw - selected) / (Math.PI * 2)) * Math.PI * 2;
      if (instant) yaw = target;
    },
    rotate(delta) { target += delta * 0.011; },
    update(dt, width, height, reduce) {
      yaw += (target - yaw) * (reduce ? 1 : 1 - Math.exp(-dt * 12));
      const narrow = width <= 760;
      // 功能：窄屏侧视保留车头和车尾，方便同时对照前后轮毂。时间：2026-11-21 | 作者：lq。
      const distance = narrow ? Math.max(9.2, 6.65 * height / width) : 7.9;
      const x = Math.sin(yaw), z = Math.cos(yaw);
      camera.aspect = width / height;
      camera.position.set(distance * x, narrow ? 3.1 + distance * 0.14 : 3, distance * z);
      camera.lookAt(narrow ? 0 : -z * 1.62, narrow ? 0.76 - distance * 0.26 : 0.71, narrow ? 0 : x * 1.62);
      camera.updateProjectionMatrix();
    },
  };
}
