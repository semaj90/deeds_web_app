"""Build a deterministic, synthetic Blender PBR material swatch fixture.

Usage:
  blender --background --python scripts/blender/material-preset-swatch.py -- \
    --output-dir .tmp/blender-material-swatches

Writes a .blend, a GLB, a rendered PNG, and a JSON receipt. No network or case
data is read. Colors in the preset file are sRGB hex; Blender node colors are
converted to scene-linear values before assignment.
"""
import bpy
import hashlib
import json
import os
import sys
from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]
PRESETS_PATH = ROOT / "scripts" / "blender" / "material-presets-v1.json"


def args_after_double_dash():
    args = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else []
    values = {"--output-dir": ".tmp/blender-material-swatches"}
    i = 0
    while i < len(args):
        if args[i] in values and i + 1 < len(args):
            values[args[i]] = args[i + 1]
            i += 2
        else:
            raise ValueError(f"Unknown or incomplete argument: {args[i]}")
    return values


def srgb_channel_to_linear(value):
    value = value / 255.0
    return value / 12.92 if value <= 0.04045 else ((value + 0.055) / 1.055) ** 2.4


def hex_to_linear_rgba(value):
    raw = value.removeprefix("#")
    if len(raw) not in (6, 8):
        raise ValueError(f"Expected #RRGGBB or #RRGGBBAA: {value}")
    channels = [int(raw[i : i + 2], 16) for i in range(0, len(raw), 2)]
    rgba = [srgb_channel_to_linear(c) for c in channels[:3]]
    rgba.append((channels[3] / 255.0) if len(channels) == 4 else 1.0)
    return tuple(rgba)


def sha256(path):
    digest = hashlib.sha256()
    with open(path, "rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def clear_scene():
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete(use_global=False)
    for datablocks in (bpy.data.materials, bpy.data.meshes, bpy.data.cameras, bpy.data.lights):
        for datablock in list(datablocks):
            if datablock.users == 0:
                datablocks.remove(datablock)


def make_material(preset):
    material = bpy.data.materials.new(preset["name"])
    material.use_nodes = True
    nodes = material.node_tree.nodes
    principled = next((node for node in nodes if node.type == "BSDF_PRINCIPLED"), None)
    if principled is None:
        principled = nodes.new("ShaderNodeBsdfPrincipled")
    principled.inputs["Base Color"].default_value = hex_to_linear_rgba(preset["baseColorSrgb"])
    principled.inputs["Metallic"].default_value = preset["metallic"]
    principled.inputs["Roughness"].default_value = preset["roughness"]
    material.diffuse_color = hex_to_linear_rgba(preset["baseColorSrgb"])
    material["atlas_preset_id"] = preset["id"]
    material["atlas_classification"] = "SYNTHETIC_DEMONSTRATIVE_PRESET"
    return material


def main():
    options = args_after_double_dash()
    output_dir = (ROOT / options["--output-dir"]).resolve()
    output_dir.mkdir(parents=True, exist_ok=True)
    presets = json.loads(PRESETS_PATH.read_text(encoding="utf-8"))["presets"]
    if not presets:
        raise ValueError("No material presets are defined")

    clear_scene()
    scene = bpy.context.scene
    scene.render.engine = "BLENDER_EEVEE_NEXT"
    scene.render.resolution_x = 960
    scene.render.resolution_y = 480
    scene.render.resolution_percentage = 100
    scene.render.image_settings.file_format = "PNG"
    scene.render.film_transparent = False
    scene.view_settings.view_transform = "AgX"
    scene.world.color = (0.035, 0.045, 0.065)

    materials = [make_material(preset) for preset in presets]
    inventory = []
    spacing = 2.25
    for i, (preset, material) in enumerate(zip(presets, materials)):
        x = (i - (len(presets) - 1) / 2) * spacing
        bpy.ops.mesh.primitive_uv_sphere_add(segments=32, ring_count=20, radius=0.82, location=(x, 0, 0.82))
        obj = bpy.context.object
        obj.name = f"Swatch_{preset['id']}"
        obj.data.name = f"Mesh_{preset['id']}"
        obj.data.materials.append(material)
        for polygon in obj.data.polygons:
            polygon.use_smooth = True
        inventory.append({
            "object": obj.name,
            "material": material.name,
            "presetId": preset["id"],
            "vertexCount": len(obj.data.vertices),
            "triangleCount": sum(max(0, len(poly.vertices) - 2) for poly in obj.data.polygons),
            "baseColorSrgb": preset["baseColorSrgb"],
            "metallic": preset["metallic"],
            "roughness": preset["roughness"],
        })

    bpy.ops.mesh.primitive_plane_add(size=20, location=(0, 0, 0))
    floor = bpy.context.object
    floor.name = "Neutral_Swatch_Floor"
    floor_mat = bpy.data.materials.new("Neutral_Floor")
    floor_mat.diffuse_color = (0.11, 0.13, 0.17, 1.0)
    floor_mat.use_nodes = True
    floor_bsdf = next(node for node in floor_mat.node_tree.nodes if node.type == "BSDF_PRINCIPLED")
    floor_bsdf.inputs["Base Color"].default_value = (0.11, 0.13, 0.17, 1.0)
    floor_bsdf.inputs["Roughness"].default_value = 0.9
    floor.data.materials.append(floor_mat)

    bpy.ops.object.light_add(type="AREA", location=(0, -4, 7))
    key = bpy.context.object
    key.name = "Key_Area_Light"
    key.data.energy = 1150
    key.data.shape = "DISK"
    key.data.size = 6
    key.rotation_euler = (0.35, 0, 0)
    bpy.ops.object.light_add(type="AREA", location=(4, 2, 4))
    fill = bpy.context.object
    fill.name = "Fill_Area_Light"
    fill.data.energy = 500
    fill.data.color = (0.55, 0.72, 1.0)
    fill.data.size = 5
    fill.rotation_euler = (0.4, 0, 2.4)

    bpy.ops.object.camera_add(location=(0, -9.5, 5.0))
    camera = bpy.context.object
    camera.name = "Material_Swatch_Camera"
    camera.rotation_euler = (1.15, 0, 0)
    camera.data.type = "ORTHO"
    camera.data.ortho_scale = max(8.0, len(presets) * spacing + 2.0)
    scene.camera = camera

    render_path = output_dir / "material-swatches.png"
    scene.render.filepath = str(render_path)
    bpy.ops.render.render(write_still=True)

    blend_path = output_dir / "material-swatches.blend"
    bpy.ops.wm.save_as_mainfile(filepath=str(blend_path))
    glb_path = output_dir / "material-swatches.glb"
    bpy.ops.export_scene.gltf(filepath=str(glb_path), export_format="GLB", use_selection=False)
    render_engine = scene.render.engine
    color_management = scene.view_settings.view_transform

    # Independent Blender import pass verifies the exported GLB, not just the source scene.
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=str(glb_path))
    readback_meshes = [obj for obj in bpy.context.scene.objects if obj.type == "MESH"]
    readback_material_names = sorted({material.name for obj in readback_meshes for material in obj.data.materials if material})
    expected_material_names = sorted([preset["name"] for preset in presets] + ["Neutral_Floor"])
    if len(readback_meshes) != len(presets) + 1:
        raise RuntimeError(f"GLB readback mesh count mismatch: {len(readback_meshes)}")
    if readback_material_names != expected_material_names:
        raise RuntimeError(f"GLB material readback mismatch: {readback_material_names}")

    receipt = {
        "schema": "atlas.blender-material-swatch-receipt.v1",
        "status": "SYNTHETIC_RENDER_AND_GLTF_EXPORT_COMPLETED",
        "blenderVersion": bpy.app.version_string,
        "renderEngine": render_engine,
        "colorManagement": color_management,
        "classification": "SYNTHETIC_DEMONSTRATIVE_PRESET",
        "presetSource": str(PRESETS_PATH.relative_to(ROOT)).replace("\\", "/"),
        "materials": inventory,
        "glbReadback": {
            "status": "PASS",
            "meshCount": len(readback_meshes),
            "materialNames": readback_material_names,
            "expectedMaterialNames": expected_material_names,
        },
        "outputs": {
            "blend": {"path": str(blend_path), "bytes": blend_path.stat().st_size, "sha256": sha256(blend_path)},
            "glb": {"path": str(glb_path), "bytes": glb_path.stat().st_size, "sha256": sha256(glb_path)},
            "render": {"path": str(render_path), "bytes": render_path.stat().st_size, "sha256": sha256(render_path)},
        },
        "datastoreWrites": "NONE",
    }
    receipt_path = output_dir / "receipt.json"
    receipt_path.write_text(json.dumps(receipt, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(receipt, indent=2))


if __name__ == "__main__":
    main()
