/**
 * 功能：以一批 GPU 雨线模拟随风落下的雨滴，并在相机周围循环利用粒子。
 * 时间：2026-11-20 | 作者：lq
 */
import * as T from 'three';
import { random } from './geometry.js';

export function makeRain(scene) {
  const count = 4400;
  const rng = random(506);
  const seeds = new Float32Array(count * 2 * 3);
  const tips = new Float32Array(count * 2);
  for (let i = 0; i < count; i++) {
    const seed = [rng() * 64, rng() * 24, rng() * 64];
    seeds.set(seed, i * 6);
    seeds.set(seed, i * 6 + 3);
    tips[i * 2 + 1] = 1;
  }

  const geometry = new T.BufferGeometry();
  geometry.setAttribute('position', new T.BufferAttribute(seeds, 3));
  geometry.setAttribute('tip', new T.BufferAttribute(tips, 1));
  const uniforms = { uTime: { value: 0 }, uNight: { value: 0 } };
  const surface = new T.ShaderMaterial({
    uniforms,
    transparent: true,
    depthWrite: false,
    vertexShader: `
      attribute float tip;
      uniform float uTime;
      varying float vAlpha;
      void main() {
        vec3 span = vec3(64.0, 24.0, 64.0);
        vec3 fall = vec3(2.9, -16.0, 1.7) * mix(0.83, 1.15, fract(position.x * 2.41));
        vec3 relative = mod(position + fall * uTime - cameraPosition + span * 0.5, span) - span * 0.5;
        vec3 world = cameraPosition + relative + fall * tip * mix(0.025, 0.049, fract(position.z));
        float distanceToEye = length(relative);
        float edge = 1.0 - smoothstep(9.5, 11.8, abs(relative.y));
        vAlpha = smoothstep(0.7, 3.2, distanceToEye) * (1.0 - smoothstep(13.0, 29.0, distanceToEye)) * edge;
        vAlpha *= mix(0.05, 0.32, tip);
        gl_Position = projectionMatrix * viewMatrix * vec4(world, 1.0);
      }
    `,
    fragmentShader: `
      uniform float uNight;
      varying float vAlpha;
      void main() {
        gl_FragColor = vec4(mix(vec3(0.71, 0.84, 0.95), vec3(0.37, 0.60, 0.83), uNight), vAlpha);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }
    `,
  });
  const drops = new T.LineSegments(geometry, surface);
  drops.frustumCulled = false;
  drops.renderOrder = 2;
  drops.visible = false;
  scene.add(drops);

  return {
    setWeather(wet, night) {
      drops.visible = wet;
      uniforms.uNight.value = Number(night);
    },
    update(dt, moving, reduceMotion) {
      if (drops.visible && moving && !reduceMotion) uniforms.uTime.value += dt;
    },
  };
}
