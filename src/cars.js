/**
 * 功能：载入项目自带 Audi RS5，建立玩家与对手的车身、材质和接地阴影。
 * 时间：2026-11-20 | 作者：lq
 */
import * as T from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { sample } from './course.js';
import { MAX_CARS } from './race.js';
import { attachPlayerCustomization } from './livery.js';
import { attachNitro } from './nitro-fx.js';
import { prepareWheels, rollWheels } from './wheels.js';
import { attachCarUpgrades } from './car-upgrades.js';

// 功能：赛车和随机交通共用柔边接地阴影。时间：2026-11-21 | 作者：lq。
export function shadowTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 64;
  const ctx = canvas.getContext('2d');
  const soft = ctx.createRadialGradient(32, 32, 9, 32, 32, 32);
  soft.addColorStop(0, 'rgba(3,9,15,.78)');
  soft.addColorStop(0.55, 'rgba(3,9,15,.52)');
  soft.addColorStop(1, 'rgba(3,9,15,0)');
  ctx.fillStyle = soft;
  ctx.fillRect(0, 0, 64, 64);
  return new T.CanvasTexture(canvas);
}

export async function buildCars(scene, renderer) {
  const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
  const gltf = await loader.loadAsync(`${import.meta.env.BASE_URL}audi-rs5.glb`);
  const bounds = new T.Box3().setFromObject(gltf.scene);
  // 功能：只拆分一次模型轮组，各赛车共用几何并各自驱动轮轴。时间：2026-11-20 | 作者：lq。
  const wheelNames = prepareWheels(gltf.scene);
  const ref = new RoomEnvironment();
  const pmrem = new T.PMREMGenerator(renderer);
  const reflection = pmrem.fromScene(ref, 0.045);
  pmrem.dispose();
  ref.dispose();
  const shade = shadowTexture();
  const shadowGeometry = new T.PlaneGeometry(3.45, 6.25);
  const shadeMaterial = new T.MeshBasicMaterial({ map: shade, transparent: true, depthWrite: false });
  // 功能：公用模型几何与反射，为八个发车位预备可区分的车漆。时间：2026-11-20 | 作者：lq。
  const colors = [0x517e91, 0xcf5141, 0xdfb760, 0xb8c1cb, 0x628951, 0x70468c, 0x3e68aa, 0xe39248];
  return Array.from({ length: MAX_CARS }, (_, i) => {
    const color = colors[i % colors.length];
    const group = new T.Group();
    const model = gltf.scene.clone(true);
    group.userData.wheels = wheelNames.map((name) => model.getObjectByName(name));
    const paints = new Map();
    model.traverse((object) => {
      if (!object.isMesh) return;
      const change = (source) => {
        if (paints.has(source)) return paints.get(source);
        const mat = source.clone();
        mat.envMap = reflection.texture;
        mat.envMapIntensity = 0.8;
        if (mat.name === 'Car Paint') {
          mat.color.set(color);
          mat.metalness = 0.54;
          mat.roughness = 0.32;
          mat.clearcoat = 0.46;
          mat.clearcoatRoughness = 0.3;
        }
        if (mat.transmission > 0) {
          mat.transmission = 0;
          mat.color.multiplyScalar(mat.name.toLowerCase().includes('red') ? 0.76 : 0.47);
          mat.opacity = 1;
          mat.transparent = false;
        }
        if (mat.name === 'Red glass' || mat.name === 'Red glass.001') {
          mat.color.set('#831d24');
          mat.roughness = 0.31;
          mat.metalness = 0.16;
          mat.emissive.set('#961829');
          mat.emissiveIntensity = 0.19;
        }
        if (mat.name === 'Tire') {
          mat.color.set('#17191c');
          mat.roughness = 0.88;
          mat.envMapIntensity = 0.26;
        }
        if (mat.name === 'Emission white') {
          mat.color.set('#94b2c2');
          mat.emissive.set('#c0ddff');
          mat.emissiveIntensity = 0.65;
        }
        paints.set(source, mat);
        return mat;
      };
      object.material = Array.isArray(object.material) ? object.material.map(change) : change(object.material);
    });
    model.position.y = -bounds.min.y + 0.027;
    // 功能：车身独立于贴地阴影，腾空后两者自然拉开。时间：2026-11-20 | 作者：lq。
    const chassis = new T.Group();
    chassis.rotation.order = 'YXZ';
    chassis.add(model);
    group.add(chassis);
    group.userData.chassis = chassis;
    const shadow = new T.Mesh(shadowGeometry, shadeMaterial.clone());
    shadow.rotation.x = -Math.PI / 2;
    shadow.position.y = 0.012;
    group.add(shadow);
    group.userData.shadow = shadow;
    if (i === 0) {
      const bodyPaint = [...paints.values()].find((surface) => surface.name === 'Car Paint');
      // 功能：车库与比赛共享同一套尾翼、轮毂及车身涂装。时间：2026-11-21 | 作者：lq。
      const applyLivery = attachPlayerCustomization(model, bodyPaint);
      const applyUpgrades = attachCarUpgrades(model, group.userData.wheels, reflection.texture);
      group.userData.customize = (config) => {
        applyLivery(config);
        applyUpgrades(config);
      };
      // 功能：仅玩家车挂载排气特效。时间：2026-11-20 | 作者：lq。
      group.userData.updateNitro = attachNitro(group, model.position.y);
      // 低照度下补齐前照灯和后方灯罩的辨识度。
      const target = new T.Object3D();
      target.position.set(0, 0.10, 24);
      const headlight = new T.SpotLight(0xd4e9ff, 0, 76, 0.39, 0.42, 1.65);
      headlight.position.set(0, 0.8, 2.15);
      headlight.target = target;
      group.userData.headlight = headlight;
      chassis.add(target, headlight);
    }
    scene.add(group);
    return group;
  });
}

export function pose(car, data, night) {
  const { x, y, z, dx, dz, grade, hill } = sample(data.distance);
  const altitude = data.airborne ? Math.max(0, data.height - y) : 0;
  const { chassis, shadow, wheels } = car.userData;
  rollWheels(wheels, data.wheelTravel);
  car.position.set(x - dz * data.offset, y, z + dx * data.offset);
  car.rotation.y = Math.atan2(dx, dz);
  chassis.position.y = altitude;
  chassis.rotation.set(-data.pitch, -data.heading, 0);
  shadow.position.y = hill ? 0.07 : 0.012;
  shadow.rotation.x = -Math.PI / 2 - Math.atan(grade);
  shadow.rotation.y = data.heading;
  shadow.material.opacity = 1 / (1 + altitude * 0.32);
  if (car.userData.headlight) car.userData.headlight.intensity = night ? 195 : 0;
}
