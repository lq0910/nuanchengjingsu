/**
 * 功能：在 RS5 双排气口渲染氮气喷焰、亮核和随喷流飞出的火星。
 * 时间：2026-11-20 | 作者：lq
 */
import * as T from 'three';

export function attachNitro(car, modelOffsetY) {
  const effect = new T.Group();
  effect.name = 'RS5 nitro exhaust';
  effect.visible = false;
  car.add(effect);

  // 模型车头朝 +Z；两枚喷嘴都从后包围的椭圆排气口向 -Z 喷射。
  const nozzle = { x: 0.63, y: 0.30 + modelOffsetY, z: -2.21 };
  const uniforms = { clock: { value: 0 }, strength: { value: 0 } };
  const plume = new T.LatheGeometry([
    [0.079, 0], [0.112, 0.12], [0.121, 0.27], [0.092, 0.51], [0.057, 0.74], [0.024, 0.90], [0, 1],
  ].map(([radius, y]) => new T.Vector2(radius, y)), 16);
  const flameMaterial = (inner) => new T.ShaderMaterial({
    uniforms: { ...uniforms, inner: { value: inner } },
    transparent: true, blending: T.AdditiveBlending, depthWrite: false, side: T.DoubleSide, forceSinglePass: true,
    vertexShader: `
      uniform float clock, strength;
      varying float axial, ripple;
      varying vec3 eyeNormal, eyeRay;
      void main() {
        axial = position.y;
        float angle = atan(position.z, position.x + 0.00001);
        ripple = sin(angle * 3.0 + axial * 23.0 - clock * 34.0);
        vec3 p = position;
        p.xz *= 1.0 + axial * 0.23 * ripple;
        p.x += 0.065 * axial * axial * sin(clock * 22.0 + axial * 9.0);
        p.y *= mix(0.30, 1.0, strength);
        vec4 eye = modelViewMatrix * vec4(p, 1.0);
        eyeNormal = normalMatrix * normal;
        eyeRay = -eye.xyz;
        gl_Position = projectionMatrix * eye;
      }`,
    fragmentShader: `
      uniform float clock, strength, inner;
      varying float axial, ripple;
      varying vec3 eyeNormal, eyeRay;
      void main() {
        vec3 tint = mix(vec3(0.16, 0.76, 1.0), vec3(0.21, 0.32, 1.0), smoothstep(0.19, 0.93, axial));
        vec3 core = mix(vec3(0.91, 1.0, 1.0), vec3(0.26, 0.75, 1.0), smoothstep(0.10, 0.73, axial));
        float fade = 1.0 - smoothstep(0.22, 1.0, axial);
        float rim = smoothstep(0.0, 0.46, abs(dot(normalize(eyeNormal), normalize(eyeRay))));
        float flicker = 0.87 + 0.10 * ripple + 0.07 * sin(clock * 36.0 - axial * 24.0);
        gl_FragColor = vec4(mix(tint, core, inner), fade * strength * mix(0.67, 0.94, inner) * flicker * rim);
      }`,
  });
  const outerMaterial = flameMaterial(0);
  const innerMaterial = flameMaterial(1);
  const jets = [-1, 1].map((side) => {
    const jet = new T.Group();
    jet.position.set(side * nozzle.x, nozzle.y, nozzle.z);
    jet.rotation.set(-Math.PI / 2, 0, 0);
    const outer = new T.Mesh(plume, outerMaterial);
    const inner = new T.Mesh(plume, innerMaterial);
    inner.scale.set(0.52, 0.64, 0.56);
    jet.add(outer, inner);
    effect.add(jet);
    return jet;
  });

  // 火星只在实际增压时出现；顶点着色器复用点池，不在帧循环中分配粒子。
  const sparkGeometry = new T.BufferGeometry();
  const seeds = [];
  for (let i = 0; i < 24; i++) seeds.push(i < 12 ? -1 : 1, (i * 0.618) % 1, (i * 0.371) % 1);
  sparkGeometry.setAttribute('position', new T.Float32BufferAttribute(seeds, 3));
  const sparks = new T.Points(sparkGeometry, new T.ShaderMaterial({
    uniforms,
    transparent: true, blending: T.AdditiveBlending, depthWrite: false,
    vertexShader: `
      uniform float clock, strength;
      varying float life;
      void main() {
        float phase = fract(clock * mix(2.4, 3.8, position.z) + position.y);
        float spread = (0.045 + phase * 0.19) * strength;
        float angle = position.y * 60.0;
        vec3 p = vec3(position.x * ${nozzle.x} + cos(angle) * spread,
          ${nozzle.y} + sin(angle) * spread, ${nozzle.z} - 0.28 - phase * (1.0 + 1.35 * position.z) * strength);
        vec4 eye = modelViewMatrix * vec4(p, 1.0);
        life = (1.0 - phase) * strength;
        gl_PointSize = clamp(20.0 * (0.45 + life) / -eye.z, 1.0, 5.0);
        gl_Position = projectionMatrix * eye;
      }`,
    fragmentShader: `
      varying float life;
      void main() {
        float falloff = 1.0 - smoothstep(0.04, 0.5, length(gl_PointCoord - 0.5));
        gl_FragColor = vec4(0.57, 0.86, 1.0, life * falloff);
      }`,
  }));
  sparks.frustumCulled = false;
  effect.add(sparks);

  return (boosting, dt, clock, reducedMotion) => {
    const intensity = uniforms.strength;
    intensity.value = T.MathUtils.damp(intensity.value, boosting ? 1 : 0, boosting ? 55 : 30, dt);
    effect.visible = intensity.value > 0.035;
    if (!effect.visible) return;
    uniforms.clock.value = reducedMotion ? 0 : clock;
    sparks.visible = boosting && !reducedMotion;
    jets.forEach((jet, i) => {
      jet.scale.y = (reducedMotion ? 1 : 1 + 0.11 * Math.sin(clock * 34 + i * 2)) * 1.39;
    });
  };
}
