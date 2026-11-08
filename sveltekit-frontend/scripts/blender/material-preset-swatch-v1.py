"""Create, render, export, and re-import a synthetic Blender material swatch scene.

Run with:
  blender --background --factory-startup --python scripts/blender/material-preset-swatch-v1.py -- --output-dir .tmp/atlas/material-swatches

This only writes new local artifacts. It does not access evidence, PostgreSQL, or object storage.
"""
import argparse
import hashlib
import json
import math
import os
import sys
from pathlib import Path

import bpy


def args_after_separator():
    argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    parser = argparse.ArgumentParser()
    parser.add_argument("--output-dir", default=".tmp/atlas/material-swatches")
    return parser.parse_args(argv)


def srgb_channel_to_linear(value):
    value = value / 255.0
    return value / 12.92 if value <= 0.04045 else ((value + 0.055) / 1.055) ** 2.4


def color_from_hex(value):
    value = value.lstrip("#")
    return tuple(srgb_channel_to_linear(int(value[i:i + 2], 16)) for i in (0, 2, 4))


def sha256(path):
    digest = hashlib.sha256()
    with open(path, "rb") as stream:
        for block in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def make_material(preset):
    mat = bpy.data.materials.new(preset["name"])
    mat.diffuse_color = (*color_from_hex(preset["baseColorSrgb"]), preset["alpha"])
    mat.use_nodes = True
    nodes = mat.node_tree.nodes
    principled = nodes.get("Principled BSDF")
    if principled is None:
        principled = nodes.new("ShaderNodeBsdfPrincipled")
        output = nodes.get("Material Output") or nodes.new("ShaderNodeOutputMaterial")
        mat.node_tree.links.new(principled.outputs["BSDF"], output.inputs["Surface"])
    principled.inputs["Base Color"].default_value = (*color_from_hex(preset["baseColorSrgb"]), preset["alpha"])
    principled.inputs["Metallic"].default_value = preset["metallic"]
    principled.inputs["Roughness"].default_value = preset["roughness"]
    return mat


def make_cube(name, location, material, bevel=0.08):
    bpy.ops.mesh.primitive_cube_add(size=1.0, location=location)
    obj = bpy.context.object
    obj.name = name
    obj.dimensions = (1.1, 1.1, 1.1)
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    obj.data.materials.append(material)
    if bevel:
        modifier = obj.modifiers.new("Demonstrative_Edge_Bevel", "BEVEL")
        modifier.width = bevel
        modifier.segments = 3
        bpy.context.view_layer.objects.active = obj
        bpy.ops.object.modifier_apply(modifier=modifier.name)
    for polygon in obj.data.polygons:
        polygon.use_smooth = True
    return obj


def main():
    options = args_after_separator()
    root = Path(__file__).resolve().parents[2]
    preset_path = root / "scripts" / "blender" / "material-presets-v1.json"
    presets_doc = json.loads(preset_path.read_text(encoding="utf-8"))
    presets = presets_doc["presets"]
    out = Path(options.output_dir).resolve()
    out.mkdir(parents=True, exist_ok=True)
    blend_path = out / "material-presets-v1.blend"
    glb_path = out / "material-presets-v1.glb"
    render_path = out / "material-presets-v1.png"
    receipt_path = out / "receipt.json"
    for target in (blend_path, glb_path, render_path, receipt_path):
        if target.exists():
            raise FileExistsError("Refusing to overwrite existing output: " + str(target))

    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete(use_global=False)
    scene = bpy.context.scene
    scene.render.engine = "BLENDER_EEVEE_NEXT"
    scene.render.resolution_x = 960
    scene.render.resolution_y = 320
    scene.render.resolution_percentage = 100
    scene.render.image_settings.file_format = "PNG"
    scene.render.filepath = str(render_path)
    scene.view_settings.view_transform = "AgX"

    for index, preset in enumerate(presets):
        material = make_material(preset)
        make_cube("Swatch_" + preset["id"], ((index - (len(presets) - 1) / 2) * 1.55, 0, 0.65), material)

    bpy.ops.mesh.primitive_plane_add(size=8, location=(0, 0, 0))
    floor = bpy.context.object
    floor.name = "Neutral_Stage"
    floor_mat = bpy.data.materials.new("Neutral_Stage_Material")
    floor_mat.diffuse_color = (0.18, 0.2, 0.24, 1)
    floor_mat.use_nodes = True
    floor_mat.node_tree.nodes["Principled BSDF"].inputs["Base Color"].default_value = (0.18, 0.2, 0.24, 1)
    floor_mat.node_tree.nodes["Principled BSDF"].inputs["Roughness"].default_value = 0.88
    floor.data.materials.append(floor_mat)

    bpy.ops.object.light_add(type="AREA", location=(0, -3, 5))
    bpy.context.object.name = "Softbox"
    bpy.context.object.data.energy = 700
    bpy.context.object.data.shape = "DISK"
    bpy.context.object.data.size = 5
    bpy.ops.object.camera_add(location=(0, -7.5, 4.2))
    camera = bpy.context.object
    camera.name = "Swatch_Camera"
    camera.rotation_euler = (math.radians(64), 0, 0)
    camera.data.type = "ORTHO"
    camera.data.ortho_scale = 7.3
    scene.camera = camera

    bpy.ops.wm.save_as_mainfile(filepath=str(blend_path))
    bpy.ops.render.render(write_still=True)
    bpy.ops.object.select_all(action="DESELECT")
    for obj in scene.objects:
        if obj.type in {"MESH", "CAMERA", "LIGHT"}:
            obj.select_set(True)
    bpy.context.view_layer.objects.active = next(obj for obj in scene.objects if obj.name.startswith("Swatch_"))
    bpy.ops.export_scene.gltf(filepath=str(glb_path), export_format="GLB", use_selection=True, export_materials="EXPORT")

    # Independently reimport into an empty scene and verify material presence.
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=str(glb_path))
    imported = [m for m in bpy.data.materials if m.name in {p["name"] for p in presets}]
    imported_names = sorted(m.name for m in imported)
    expected_names = sorted(p["name"] for p in presets)
    if imported_names != expected_names:
        raise RuntimeError("GLB material round-trip mismatch: " + repr(imported_names))

    mesh_objects = [obj for obj in bpy.context.scene.objects if obj.type == "MESH"]
    for obj in mesh_objects:
        obj.data.calc_loop_triangles()
    used_materials = {
        slot.material
        for obj in mesh_objects
        for slot in obj.material_slots
        if slot.material is not None
    }
    texture_images = {
        node.image.name
        for material in used_materials
        if material.use_nodes and material.node_tree
        for node in material.node_tree.nodes
        if node.type == "TEX_IMAGE" and node.image is not None
    }
    uv_channel_count = max((len(obj.data.uv_layers) for obj in mesh_objects), default=0)

    outputs = {"blend": blend_path, "glb": glb_path, "previewPng": render_path}
    receipt = {
        "schema": "atlas.blender-material-preset-proof.v1",
        "classification": "SYNTHETIC_DEMONSTRATIVE_PRESET",
        "blenderVersion": bpy.app.version_string,
        "renderEngine": "BLENDER_EEVEE_NEXT",
        "viewTransform": "AgX",
        "presetIds": [p["id"] for p in presets],
        "glbMaterialReadback": imported_names,
        "portableMaterialProperties": ["baseColor", "metallic", "roughness", "alpha"],
        "principledFeaturesNotUsedByThisFixture": ["procedural/custom node graphs", "subsurface", "sheen", "transmission", "volume"],
        "meshCountAfterReadback": len(mesh_objects),
        "vertexCountAfterReadback": sum(len(obj.data.vertices) for obj in mesh_objects),
        "triangleCountAfterReadback": sum(len(obj.data.loop_triangles) for obj in mesh_objects),
        "uvChannelCountAfterReadback": uv_channel_count,
        "materialCountAfterReadback": len(used_materials),
        "textureImageCountAfterReadback": len(texture_images),
        "outputs": {name: {"path": str(path), "bytes": path.stat().st_size, "sha256": sha256(path)} for name, path in outputs.items()},
        "datastoreWrites": False,
        "caseEvidence": False
    }
    receipt_path.write_text(json.dumps(receipt, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(receipt, indent=2))


if __name__ == "__main__":
    main()
