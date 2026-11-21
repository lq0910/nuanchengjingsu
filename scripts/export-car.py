"""功能：将项目内 Audi RS5 源模型导出为网页使用的 GLB。时间：2026-11-20。作者：lq。"""
from pathlib import Path
import bpy

# 评估镜像等 Blender 修改器，保留实际车身和四轮几何，不写回源文件。
output = Path(__file__).resolve().parents[1] / "public" / "audi-rs5.glb"
output.parent.mkdir(parents=True, exist_ok=True)
for obj in bpy.context.scene.objects:
    for modifier in obj.modifiers:
        if modifier.type == "SUBSURF":
            modifier.levels = min(modifier.levels, 1)
            modifier.render_levels = min(modifier.render_levels, 1)

bpy.ops.export_scene.gltf(
    filepath=str(output), export_format="GLB", export_apply=True,
    export_meshopt_compression_enable=True,
)
