/**
 * 功能：为比赛生成四旋翼，按玩家车辆的位置连续跟拍，并在同一 WebGL 画布上绘制直播小窗。
 * 时间：2026-11-21 | 作者：lq
 */
import * as T from 'three';
import { sample } from './course.js';

export const DRONE_LAYER = 1;

// 功能：搭建机身、云台、四组桨叶和航灯，供驾驶镜头观察赛道上方的无人机。时间：2026-11-21 | 作者：lq。
function makeAirframe() {
  const body = new T.Group();
  const shell = new T.MeshStandardMaterial({ color: 0xd4dbe2, metalness: 0.4, roughness: 0.39 });
  const carbon = new T.MeshStandardMaterial({ color: 0x262b36, roughness: 0.66 });
  const red = new T.MeshBasicMaterial({ color: 0xff4260 });
  const green = new T.MeshBasicMaterial({ color: 0x7bffc8 });
  const lens = new T.MeshStandardMaterial({ color: 0x34576f, metalness: 0.72, roughness: 0.2 });
  const box = new T.BoxGeometry();
  const motor = new T.CylinderGeometry(0.11, 0.12, 0.12, 12);
  const rotors = [];
  const addBox = (parent, material, x, y, z, width, height, depth) => {
    const mesh = new T.Mesh(box, material);
    mesh.position.set(x, y, z);
    mesh.scale.set(width, height, depth);
    parent.add(mesh);
    return mesh;
  };

  addBox(body, shell, 0, 0, 0, 0.49, 0.22, 0.76);
  addBox(body, carbon, 0, -0.084, 0, 0.43, 0.13, 0.63);
  const gimbal = new T.Group();
  gimbal.position.set(0, -0.21, -0.24);
  body.add(gimbal);
  addBox(gimbal, carbon, 0, 0, 0, 0.22, 0.19, 0.21);
  addBox(gimbal, lens, 0, 0, 0.11, 0.13, 0.12, 0.025);

  for (const side of [-1, 1]) {
    for (const end of [-1, 1]) {
      const x = side * 0.68;
      const z = end * 0.53;
      const arm = addBox(body, carbon, x / 2, 0, z / 2, 0.089, 0.076, Math.hypot(x, z));
      arm.rotation.y = Math.atan2(x, z);
      const hub = new T.Mesh(motor, shell);
      hub.position.set(x, 0.042, z);
      body.add(hub);
      addBox(body, end < 0 ? red : green, x, -0.043, z, 0.14, 0.038, 0.15);
      const rotor = new T.Group();
      rotor.position.set(x, 0.113, z);
      addBox(rotor, carbon, 0, 0, 0, 0.065, 0.025, 0.62);
      body.add(rotor);
      rotors.push({ rotor, spin: side * end });
    }
  }
  return { body, gimbal, rotors };
}

export function makeRaceDrone(scene, panel, toggle, screen) {
  const aircraft = new T.Group();
  const { body, gimbal, rotors } = makeAirframe();
  aircraft.add(body);
  aircraft.traverse((node) => node.layers.set(DRONE_LAYER));
  aircraft.visible = false;
  scene.add(aircraft);

  const camera = new T.PerspectiveCamera(39, 16 / 9, 0.1, 1800);
  const eye = new T.Vector3();
  const target = new T.Vector3();
  const aim = new T.Vector3();
  const mainViewport = new T.Vector4();
  let flying = false;
  let expanded = true;
  let placed = false;
  let viewport;

  // 功能：暂停时冻结机位并收起直播，回到比赛时恢复玩家选择。时间：2026-11-21 | 作者：lq。
  function syncPanel() {
    screen.hidden = !expanded;
    toggle.setAttribute('aria-expanded', String(expanded));
    viewport = undefined;
  }

  toggle.addEventListener('click', () => {
    expanded = !expanded;
    syncPanel();
  });

  return {
    setMode(mode) {
      flying = ['countdown', 'race', 'finish'].includes(mode);
      aircraft.visible = flying || mode === 'paused';
      panel.hidden = !flying;
      syncPanel();
    },
    reset() { placed = false; },
    resize() { viewport = undefined; },

    // 功能：在车辆前上方倒拍，保持双桥桥塔之间的净空，随飞跃坡和弯道平滑调整高度和取景。时间：2026-11-21 | 作者：lq。
    update(car, dt, reducedMotion) {
      if (!flying) return;
      const flight = sample(car.distance + 21);
      const shot = sample(car.distance - 2);
      const lateral = car.offset * 0.36 - 2.1;
      eye.set(flight.x - flight.dz * lateral, Math.max(flight.y + 8.4, car.height + 4), flight.z + flight.dx * lateral);
      target.set(shot.x - shot.dz * car.offset, car.height + 0.62, shot.z + shot.dx * car.offset);
      const blend = placed && !reducedMotion ? 1 - Math.exp(-dt * 12) : 1;
      aircraft.position.lerp(eye, blend);
      aim.lerp(target, blend);
      placed = true;
      aircraft.rotation.y = Math.atan2(flight.dx, flight.dz);
      body.rotation.z = reducedMotion ? 0 : -flight.turn * Math.min(car.velocity * 0.002, 0.15);
      for (const { rotor, spin } of rotors) {
        if (!reducedMotion) rotor.rotation.y += dt * 74 * spin;
      }
      camera.position.copy(aircraft.position);
      camera.lookAt(aim);
      gimbal.lookAt(aim);
    },

    // 功能：复用同一场景、天气和渲染器，以裁切限定直播区域；收起后跳过第二次渲染。时间：2026-11-21 | 作者：lq。
    render(renderer, environment, time, reducedMotion) {
      if (!flying || !expanded) return;
      if (!viewport) {
        const rect = screen.getBoundingClientRect();
        const canvas = renderer.domElement.getBoundingClientRect();
        viewport = {
          x: Math.round(rect.left - canvas.left),
          y: Math.round(canvas.bottom - rect.bottom),
          width: Math.round(rect.width),
          height: Math.round(rect.height),
        };
        if (!viewport.width || !viewport.height) {
          viewport = undefined;
          return;
        }
        camera.aspect = viewport.width / viewport.height;
        camera.updateProjectionMatrix();
      }
      const { x, y, width, height } = viewport;
      renderer.getViewport(mainViewport);
      renderer.setViewport(x, y, width, height);
      renderer.setScissor(x, y, width, height);
      renderer.setScissorTest(true);
      environment.update(camera, time, reducedMotion);
      renderer.render(scene, camera);
      renderer.setScissorTest(false);
      renderer.setViewport(mainViewport);
    },
  };
}
