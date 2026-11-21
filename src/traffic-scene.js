/**
 * 功能：复用生成的交通模型并同步坡面、转向、轮轴和步态。
 * 时间：2026-11-21 | 作者：lq
 */
import * as T from 'three';
import { courseGap, sample } from './course.js';
import { shadowTexture } from './cars.js';
import { makeTrafficModels, trafficAnimation } from './traffic-models.js';

export function makeTrafficScene(scene) {
  const group = new T.Group();
  group.name = 'CityTraffic';
  scene.add(group);
  let traffic;
  let models;
  let entries = [];
  let shadowMaterial;
  const shadowPlane = new T.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);

  // 功能：首次发车才准备几何和材质，重赛克隆共享部件，避免首屏等待。时间：2026-11-21 | 作者：lq。
  function prepare(actor) {
    const model = models[actor.kind](actor.variant);
    const root = new T.Group();
    root.rotation.order = 'YXZ';
    const shadow = new T.Mesh(shadowPlane, shadowMaterial);
    shadow.scale.set(actor.collider.halfWidth * 2.7, 1, actor.collider.halfLength * 2.25);
    shadow.position.y = 0.055;
    root.add(shadow, model);
    group.add(root);
    return { actor, root, animate: trafficAnimation(model, actor.kind) };
  }

  return function updateTrafficScene(race) {
    group.visible = race.status !== 'menu';
    if (!group.visible || !race.traffic.length) return;
    if (!models) {
      models = makeTrafficModels();
      shadowMaterial = new T.MeshBasicMaterial({ map: shadowTexture(), transparent: true, depthWrite: false });
    }
    if (traffic !== race.traffic) {
      traffic = race.traffic;
      group.clear();
      entries = traffic.map(prepare);
    }

    // 功能：渲染跟车镜头附近的交通，道路远端仍继续模拟。时间：2026-11-21 | 作者：lq。
    for (const { actor, root, animate } of entries) {
      root.visible = Math.abs(courseGap(race.player.distance, actor.distance)) < 350;
      if (!root.visible) continue;
      const { x, y, z, dx, dz, grade } = sample(actor.distance);
      root.position.set(x - dz * actor.offset, y, z + dx * actor.offset);
      root.rotation.set(-Math.atan(grade), Math.atan2(dx, dz) - actor.heading, 0);
      animate(actor.travel, actor.id * 0.17);
    }
  };
}
