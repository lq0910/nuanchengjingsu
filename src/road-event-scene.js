/**
 * 功能：复用警车、临检牌和施工路锥，在赛道事件进入视野时显示实体场景。
 * 时间：2026-11-21 | 作者：lq
 */
import * as T from 'three';
import { sample } from './course.js';
import { CHECK_SPEED, EVENT_NOTICE, roadEventFor } from './road-events.js';

export function makeRoadEventScene(scene) {
  const boxGeometry = new T.BoxGeometry(1, 1, 1);
  const painted = (color, metalness = 0.08) => new T.MeshStandardMaterial({ color, roughness: 0.55, metalness });
  const marker = (color) => new T.MeshBasicMaterial({ color });
  const white = painted('#f0f2f2');
  const dark = painted('#1d2531', 0.28);
  const glass = painted('#31485d', 0.38);
  const tire = painted('#181a1e');
  const red = marker('#ff384f');
  const blue = marker('#299cff');
  const amber = marker('#ffae43');
  const dimRed = marker('#692636');
  const dimBlue = marker('#1c416e');
  const dimAmber = marker('#7e5125');
  const orange = painted('#f5732a');
  const coneGeometry = new T.CylinderGeometry(0.065, 0.26, 0.73, 10);
  const bandGeometry = new T.CylinderGeometry(0.124, 0.157, 0.125, 10, 1, true);
  const wheelGeometry = new T.CylinderGeometry(0.37, 0.37, 0.24, 12).rotateZ(Math.PI / 2);

  function box(root, material, size, position) {
    const mesh = new T.Mesh(boxGeometry, material);
    mesh.scale.set(...size);
    mesh.position.set(...position);
    root.add(mesh);
    return mesh;
  }

  // 功能：高对比反光牌与车道箭头在昼夜和雨天共用。时间：2026-11-21 | 作者：lq。
  function signMaterial(title, detail, accent) {
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 256;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#16191e';
    ctx.fillRect(0, 0, 512, 256);
    ctx.strokeStyle = accent;
    ctx.lineWidth = 12;
    ctx.strokeRect(10, 10, 492, 236);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#fdf6e8';
    ctx.font = '800 77px system-ui, sans-serif';
    ctx.fillText(title, 256, 91, 446);
    ctx.fillStyle = accent;
    ctx.font = '800 45px system-ui, sans-serif';
    ctx.fillText(detail, 256, 184, 446);
    const map = new T.CanvasTexture(canvas);
    map.colorSpace = T.SRGBColorSpace;
    return new T.MeshBasicMaterial({ map, side: T.DoubleSide, toneMapped: false });
  }

  function board(group, material, x, z) {
    const plane = new T.Mesh(new T.PlaneGeometry(2.8, 1.4), material);
    plane.rotation.y = Math.PI;
    plane.position.set(x, 1.72, z - 0.055);
    group.add(plane);
    box(group, dark, [2.85, 1.45, 0.10], [x, 1.72, z]);
    for (const leg of [-0.9, 0.9]) box(group, dark, [0.09, 1.25, 0.09], [x + leg, 0.64, z]);
  }

  function cone(group, x, z) {
    box(group, dark, [0.62, 0.08, 0.62], [x, 0.05, z]);
    const shape = new T.Mesh(coneGeometry, orange);
    shape.position.set(x, 0.41, z);
    const band = new T.Mesh(bandGeometry, white);
    band.position.set(x, 0.525, z);
    group.add(shape, band);
  }

  // 功能：用少量几何体搭建停靠警车和双侧检查牌，留出整幅行车空间。时间：2026-11-21 | 作者：lq。
  const police = new T.Group();
  const checkSign = signMaterial('酒驾临检', `限速 ${CHECK_SPEED} KM/H`, '#9ddcff');
  board(police, checkSign, -10.6, -9);
  board(police, checkSign, 10.6, -9);
  const car = new T.Group();
  car.position.set(-11.35, 0, 2.8);
  car.rotation.y = -0.1;
  police.add(car);
  box(car, dark, [2.07, 0.39, 4.6], [0, 0.52, 0]);
  box(car, white, [1.97, 0.47, 4.33], [0, 0.83, 0]);
  box(car, glass, [1.64, 0.53, 2.43], [0, 1.26, -0.14]);
  box(car, white, [1.73, 0.10, 2.45], [0, 1.52, -0.15]);
  box(car, blue, [2.00, 0.15, 3.85], [0, 0.77, 0]);
  const beacon = [-0.48, 0.48].map((side) => box(car, dark, [0.67, 0.14, 0.38], [side, 1.67, -0.14]));
  for (const side of [-1, 1]) {
    box(car, red, [0.48, 0.12, 0.06], [side * 0.66, 0.87, -2.18]);
    for (const z of [-1.45, 1.45]) {
      const wheel = new T.Mesh(wheelGeometry, tire);
      wheel.position.set(side * 0.91, 0.38, z);
      car.add(wheel);
    }
  }
  box(police, marker('#e6edf5'), [19.5, 0.019, 0.43], [0, 0.052, 0]);

  const amberBeacons = [];
  const work = new Map([-1, 1].map((side) => {
    const group = new T.Group();
    const closedX = side * 4.7;
    const arrow = side < 0 ? '向右并道' : '向左并道';
    board(group, signMaterial('前方施工', arrow, '#ffc462'), side * 10.6, -10);
    const barricade = signMaterial(side < 0 ? '→' : '←', '车道封闭', '#ffc462');
    for (const z of [1.2, 27]) {
      board(group, barricade, closedX, z);
      amberBeacons.push(box(group, amber, [0.31, 0.27, 0.31], [closedX, 2.56, z]));
    }
    for (let z = 0; z < 36; z += 4) cone(group, 0, z);
    for (const x of [2, 6.8, 8.6]) cone(group, side * x, 0.6);
    return [side, group];
  }));
  scene.add(police, ...work.values());

  // 功能：当前事件与刚过的临检保持可见，警灯按比赛计时运转，暂停时冻结。时间：2026-11-21 | 作者：lq。
  return function updateRoadEventScene(race, reduceMotion) {
    const active = ['race', 'paused', 'finish'].includes(race.status);
    const { player, events, elapsed } = race;
    const previous = events[player.eventIndex - 1];
    const upcoming = roadEventFor(player, events);
    const event = active && (previous && player.distance < previous.end + 32 ? previous : upcoming);
    const visible = event && event.distance - player.distance <= EVENT_NOTICE + 55;
    police.visible = Boolean(visible && event.kind === 'checkpoint');
    for (const [side, group] of work) group.visible = Boolean(visible && event.kind === 'work' && event.openSide === side);
    if (!visible) return;
    const group = event.kind === 'checkpoint' ? police : work.get(event.openSide);
    const { x, y, z, dx, dz } = sample(event.distance);
    group.position.set(x, y, z);
    group.rotation.y = Math.atan2(dx, dz);
    const phase = Math.floor(elapsed * 3) % 2;
    beacon[0].material = reduceMotion || phase === 0 ? red : dimRed;
    beacon[1].material = reduceMotion || phase === 1 ? blue : dimBlue;
    for (const light of amberBeacons) light.material = reduceMotion || phase === 0 ? amber : dimAmber;
  };
}
