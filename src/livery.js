/**
 * 功能：在 Audi 原始车漆表面投射赛用涂装、编号和可更换的前后牌照。
 * 时间：2026-11-20 | 作者：lq
 */
import * as T from 'three';
import { LIVERIES } from './customization.js';

function makeCanvas(width, height) {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const texture = new T.CanvasTexture(canvas);
  texture.colorSpace = T.SRGBColorSpace;
  texture.anisotropy = 8;
  return { texture, ctx: canvas.getContext('2d') };
}

// 左右车门共享同一构图，但分别绘制字标，避免另一侧的字成为镜像。
function paintSide(ctx, palette, index, opposite) {
  const { width, height } = ctx.canvas;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, width, height);
  if (!index) return;
  ctx.save();
  ctx.scale(width / 1200, height / 340);
  const polygon = (color, points) => {
    ctx.fillStyle = color;
    ctx.beginPath();
    points.forEach(([x, y], i) => i ? ctx.lineTo(x, y) : ctx.moveTo(x, y));
    ctx.closePath();
    ctx.fill();
  };
  if (index === 1) {
    polygon(palette.ink, [[0, 195], [210, 197], [355, 264], [867, 268], [1062, 148], [1200, 152], [1200, 340], [0, 340]]);
    polygon(palette.light, [[0, 187], [222, 190], [366, 250], [860, 253], [1070, 133], [1200, 137], [1200, 147], [1069, 145], [866, 264], [361, 261], [219, 200], [0, 197]]);
    polygon(palette.accent, [[0, 255], [212, 257], [308, 303], [850, 304], [1070, 179], [1200, 186], [1200, 216], [1080, 211], [863, 328], [304, 326], [206, 277], [0, 275]]);
    polygon(palette.accent, [[850, 139], [870, 139], [813, 209], [793, 209]]);
    polygon(palette.light, [[878, 139], [888, 140], [831, 209], [821, 209]]);
  } else if (index === 2) {
    polygon(palette.ink, [[0, 250], [1200, 250], [1200, 340], [0, 340]]);
    polygon(palette.accent, [[0, 198], [260, 199], [482, 255], [721, 255], [955, 170], [1200, 170], [1200, 182], [959, 182], [724, 269], [479, 269], [257, 211], [0, 210]]);
    polygon(palette.ink, [[0, 220], [251, 222], [475, 279], [726, 279], [962, 192], [1200, 192], [1200, 197], [963, 197], [727, 285], [473, 285], [249, 228], [0, 226]]);
  } else {
    polygon(palette.ink, [[0, 142], [261, 155], [389, 251], [839, 251], [1083, 112], [1200, 106], [1200, 340], [0, 340]]);
    polygon(palette.accent, [[0, 132], [264, 146], [393, 243], [834, 243], [1081, 103], [1200, 97], [1200, 107], [1084, 114], [837, 253], [390, 253], [260, 156], [0, 142]]);
    for (let i = 0; i < 4; i++) {
      const x = 781 + i * 24;
      polygon(palette.accent, [[x, 286], [x + 10, 286], [x - 17, 315], [x - 27, 315]]);
    }
  }

  ctx.save();
  ctx.translate(586, 183);
  if (opposite) ctx.scale(-1, 1);
  polygon(palette.ink, [[-69, -60], [69, -60], [60, 54], [-69, 54]]);
  polygon(palette.light, [[-64, -54], [63, -54], [55, 48], [-64, 48]]);
  polygon(palette.accent, [[-64, -54], [63, -54], [62, -33], [-64, -33]]);
  ctx.fillStyle = palette.ink;
  ctx.textAlign = 'center';
  ctx.font = '800 14px system-ui';
  // 功能：车门号码牌显示暖城竞速字标。时间：2026-11-21 | 作者：lq。
  ctx.fillText('暖城竞速', -2, -39);
  ctx.font = 'italic 900 70px system-ui';
  ctx.fillText(palette.number, -3, 30);
  ctx.font = '800 10px system-ui';
  ctx.fillText(`RS5 / ${String(index).padStart(2, '0')}`, -4, 43);
  ctx.restore();
  ctx.restore();
}

function paintPlate(ctx, plate) {
  const { width, height } = ctx.canvas;
  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = '#12346c';
  ctx.fillRect(0, 0, width, height);
  ctx.strokeStyle = '#dcecfb';
  ctx.lineWidth = 3;
  ctx.strokeRect(6, 6, width - 12, height - 12);
  ctx.fillStyle = '#f1f7ff';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = '800 59px system-ui, sans-serif';
  ctx.fillText(plate, width / 2, height / 2 + 2, width - 31);
}

export function attachPlayerCustomization(model, bodyPaint) {
  const sides = [makeCanvas(1200, 340), makeCanvas(1200, 340)];
  const plate = makeCanvas(512, 92);
  const labels = new T.MeshStandardMaterial({ map: plate.texture, roughness: 0.62, emissive: 0xffffff, emissiveMap: plate.texture, emissiveIntensity: 0.3 });
  const u = {
    kitIndex: { value: 0 },
    kitInk: { value: new T.Color() }, kitAccent: { value: new T.Color() }, kitLight: { value: new T.Color() },
    kitSideA: { value: sides[0].texture }, kitSideB: { value: sides[1].texture },
  };
  bodyPaint.customProgramCacheKey = () => 'river-player-livery-v1';
  bodyPaint.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, u);
    shader.vertexShader = shader.vertexShader.replace('#include <common>', `#include <common>
      varying vec3 vKitPosition;
      varying vec3 vKitNormal;`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        vKitPosition = position;
        vKitNormal = normal;`);
    shader.fragmentShader = shader.fragmentShader.replace('#include <common>', `#include <common>
      varying vec3 vKitPosition;
      varying vec3 vKitNormal;
      uniform int kitIndex;
      uniform vec3 kitInk, kitAccent, kitLight;
      uniform sampler2D kitSideA, kitSideB;`)
      .replace('#include <color_fragment>', `#include <color_fragment>
        if (kitIndex > 0) {
          vec3 p = vKitPosition;
          vec3 n = normalize(vKitNormal);
          float side = smoothstep(.37, .72, abs(n.x));
          vec2 uvSide = vec2((p.z + 2.36) / 4.72, (p.y - .12) / .85);
          if (uvSide.y > 0.0 && uvSide.y < 1.0) {
            vec4 decal = p.x < 0.0 ? texture2D(kitSideA, uvSide) : texture2D(kitSideB, uvSide);
            diffuseColor.rgb = mix(diffuseColor.rgb, decal.rgb, decal.a * side);
          }
          // 通长拉花沿引擎盖和车顶连续，保留窗、轮拱与饰件的原始材质。
          float upFace = smoothstep(.38, .69, n.y);
          float axle = abs(p.x + (kitIndex == 2 ? 0.0 : .13));
          float edge = max(fwidth(axle), .002);
          if (kitIndex == 1) {
            diffuseColor.rgb = mix(diffuseColor.rgb, kitInk, upFace * (1.0 - smoothstep(.225-edge,.225+edge,axle)));
            diffuseColor.rgb = mix(diffuseColor.rgb, kitAccent, upFace * (1.0 - smoothstep(.095-edge,.095+edge,axle)));
            diffuseColor.rgb = mix(diffuseColor.rgb, kitLight, upFace * (1.0-smoothstep(.249-edge,.249+edge,axle))*smoothstep(.235-edge,.235+edge,axle));
          } else if (kitIndex == 2) {
            diffuseColor.rgb = mix(diffuseColor.rgb, kitAccent, upFace * (1.0-smoothstep(.145-edge,.145+edge,axle))*smoothstep(.040-edge,.040+edge,axle));
            diffuseColor.rgb = mix(diffuseColor.rgb, kitInk, upFace * (1.0-smoothstep(.169-edge,.169+edge,axle))*smoothstep(.155-edge,.155+edge,axle));
          } else {
            diffuseColor.rgb = mix(diffuseColor.rgb, kitInk, upFace * (1.0-smoothstep(.36-edge,.36+edge,axle)));
            diffuseColor.rgb = mix(diffuseColor.rgb, kitAccent, upFace * (1.0-smoothstep(.37-edge,.37+edge,axle))*smoothstep(.349-edge,.349+edge,axle));
          }
        }`);
  };

  model.traverse((mesh) => {
    if (!mesh.isMesh || mesh.material.name !== 'NumberPlate') return;
    // 每块牌照独立复制几何，避免改动电脑对手共用的顶点和贴图坐标。
    mesh.geometry = mesh.geometry.clone();
    mesh.geometry.computeBoundingBox();
    const { min, max } = mesh.geometry.boundingBox;
    const attribute = mesh.geometry.getAttribute('position');
    const uv = new Float32Array(attribute.count * 2);
    for (let i = 0; i < attribute.count; i++) {
      uv[i * 2] = (max.x - attribute.getX(i)) / (max.x - min.x);
      uv[i * 2 + 1] = (attribute.getY(i) - min.y) / (max.y - min.y);
    }
    mesh.geometry.setAttribute('uv', new T.BufferAttribute(uv, 2));
    mesh.material = labels;
  });

  let lastDesign, lastPlate;
  return (config) => {
    bodyPaint.color.set(config.color);
    if (lastDesign !== config.livery) {
      lastDesign = config.livery;
      const chosen = LIVERIES[config.livery];
      const index = { solid: 0, river: 1, heritage: 2, midnight: 3 }[config.livery];
      u.kitIndex.value = index;
      u.kitInk.value.set(chosen.ink);
      u.kitAccent.value.set(chosen.accent);
      u.kitLight.value.set(chosen.light);
      sides.forEach(({ ctx, texture }, i) => {
        paintSide(ctx, chosen, index, i === 1);
        texture.needsUpdate = true;
      });
    }
    if (lastPlate !== config.plate) {
      lastPlate = config.plate;
      paintPlate(plate.ctx, config.plate);
      plate.texture.needsUpdate = true;
    }
  };
}
