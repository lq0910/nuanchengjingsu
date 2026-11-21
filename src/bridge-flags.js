/**
 * 功能：绘制双面五星红旗，并在 GPU 上模拟旗面随风起伏。
 * 时间：2026-11-21 | 作者：lq
 */
import * as T from 'three';
import { Batch, material } from './geometry.js';

// 功能：按国旗制法的 30×20 网格绘制一颗大星和四颗朝向大星的小星。时间：2026-11-21 | 作者：lq。
function flagTexture() {
  const canvas = document.createElement('canvas');
  const unit = 16;
  canvas.width = 30 * unit;
  canvas.height = 20 * unit;
  const ctx = canvas.getContext('2d');
  ctx.scale(unit, unit);
  ctx.fillStyle = '#ee1c25';
  ctx.fillRect(0, 0, 30, 20);
  ctx.fillStyle = '#ffff00';

  function star(x, y, radius, angle) {
    ctx.beginPath();
    for (let i = 0; i < 10; i++) {
      const a = angle + i * Math.PI / 5;
      const r = i % 2 ? radius * 0.381966 : radius;
      const vx = x + Math.cos(a) * r, vy = y + Math.sin(a) * r;
      if (i === 0) ctx.moveTo(vx, vy);
      else ctx.lineTo(vx, vy);
    }
    ctx.closePath();
    ctx.fill();
  }

  star(5, 5, 3, -Math.PI / 2);
  for (const [x, y] of [[10, 2], [12, 4], [12, 7], [10, 9]]) {
    star(x, y, 1, Math.atan2(5 - y, 5 - x));
  }
  const texture = new T.CanvasTexture(canvas);
  texture.colorSpace = T.SRGBColorSpace;
  texture.anisotropy = 4;
  return texture;
}

export function makeBridgeFlags() {
  const width = 1.5;
  const geometry = new T.PlaneGeometry(width, 1, 16, 5);
  geometry.translate(width / 2, 0, 0);
  // 功能：把顶点着色器最多 0.28 米的位移纳入视锥裁剪范围。时间：2026-11-21 | 作者：lq。
  geometry.computeBoundingSphere();
  geometry.boundingSphere.radius += 0.28;

  const map = flagTexture();
  const surface = material(0xffffff, { map, side: T.DoubleSide, roughness: 0.86 });
  const time = { value: 0 };
  // 功能：用两层波纹卷动旗布并同步更新表面法线，旗杆端的位移始终为零。时间：2026-11-21 | 作者：lq。
  surface.onBeforeCompile = (shader) => {
    shader.uniforms.uFlagTime = time;
    shader.vertexShader = shader.vertexShader.replace('#include <common>', `
      #include <common>
      uniform float uFlagTime;

      vec3 flagWave(vec3 p, float phase) {
        float u = p.x / ${width.toFixed(2)};
        float a = 8.2 * u + 1.4 * p.y - 5.1 * uFlagTime + phase;
        float b = 17.0 * u - 2.0 * p.y - 8.4 * uFlagTime + phase * 0.6;
        float wave = 0.22 * sin(a) + 0.06 * sin(b);
        float slopeA = 0.22 * cos(a), slopeB = 0.06 * cos(b);
        float dx = (2.0 * u * wave + u * u * (8.2 * slopeA + 17.0 * slopeB)) / ${width.toFixed(2)};
        float dy = u * u * (1.4 * slopeA - 2.0 * slopeB);
        return vec3(u * u * wave, dx, dy);
      }
    `).replace('#include <beginnormal_vertex>', `
      #include <beginnormal_vertex>
      // 功能：用旗杆位置错开各面旗的相位。时间：2026-11-21 | 作者：lq。
      vec3 wave = flagWave(position, dot(instanceMatrix[3].xz, vec2(0.14, 0.19)));
      objectNormal = normalize(vec3(-wave.y, -wave.z, 1.0));
    `).replace('#include <begin_vertex>', `
      #include <begin_vertex>
      transformed.z += wave.x;
    `);
  };

  const flags = new Batch(geometry, surface);
  return {
    add(position, yaw) {
      flags.add(position, [1, 1, 1], yaw);
    },
    finish(scene) {
      const mesh = flags.finish(scene);
      if (mesh) mesh.name = 'Bridge national flags';
    },
    update(dt, moving, reduceMotion) {
      if (moving && !reduceMotion) time.value += dt;
    },
  };
}
