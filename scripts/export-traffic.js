/**
 * 功能：将游戏的四种原生几何交通底模导出为可在 Blender 中复用的 GLB。
 * 时间：2026-11-21 | 作者：lq
 */
import { mkdir, writeFile } from 'node:fs/promises';
import { GLTFExporter } from 'three/addons/exporters/GLTFExporter.js';
import { makeTrafficModels, trafficAnimation } from '../src/traffic-models.js';

// 功能：为 GLTFExporter 提供 Node 环境所需的二进制 Blob 读取接口。时间：2026-11-21 | 作者：lq。
globalThis.FileReader ??= class {
  async readAsArrayBuffer(blob) {
    try {
      this.result = await blob.arrayBuffer();
      this.onloadend?.();
    } catch (error) {
      this.onerror?.(error);
    }
  }
};

const output = new URL('../public/traffic/', import.meta.url);
await mkdir(output, { recursive: true });
for (const [kind, create] of Object.entries(makeTrafficModels())) {
  const model = create();
  trafficAnimation(model, kind)(0);
  const glb = await new GLTFExporter().parseAsync(model, { binary: true });
  await writeFile(new URL(`${kind}.glb`, output), Buffer.from(glb));
}
