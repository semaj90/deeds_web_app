"""Create a synthetic rounded, subdivided cube material proof.

This bakes geometry density in Blender before export; it does not use hardware
tessellation. The GLB contains UVs and a glTF metallic-roughness material, not a
baked texture atlas. It reads no case assets and writes only to --output-dir.
"""
import bpy
import hashlib
import json
import runpy
import sys
from pathlib import Path
from mathutils import Vector

ROOT = Path(__file__).resolve().parents[2]
HELPERS = runpy.run_path(str(ROOT / "scripts" / "blender" / "material-preset-swatch.py"))


def options():
    args = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else []
    result = {"--output-dir": ".tmp/atlas/tessellated-cube-material-v1"}
    i = 0
    while i < len(args):
        if args[i] not in result or i + 1 >= len(args):
            raise ValueError(f"Unknown or incomplete argument: {args[i]}")
        result[args[i]] = args[i + 1]
        i += 2
    return result


def digest(path):
    h = hashlib.sha256()
    with path.open("rb") as f:
        for block in iter(lambda: f.read(1024 * 1024), b""):
            h.update(block)
    return h.hexdigest()


def main():
    out = (ROOT / options()["--output-dir"]).resolve()
    out.mkdir(parents=True, exist_ok=True)
    preset_doc = json.loads((ROOT / "scripts/blender/material-presets-v1.json").read_text(encoding="utf-8"))
    preset = next(p for p in preset_doc["presets"] if p["id"] == "atlas.hypothesis.amber.v1")

    HELPERS["clear_scene"]()
    scene = bpy.context.scene
    scene.render.engine = "BLENDER_EEVEE_NEXT"
    scene.render.resolution_x = 800
    scene.render.resolution_y = 600
    scene.render.resolution_percentage = 100
    scene.render.image_settings.file_format = "PNG"
    scene.view_settings.view_transform = "AgX"
    scene.world.color = (0.025, 0.035, 0.055)

    bpy.ops.mesh.primitive_cube_add(size=2.0, location=(0, 0, 1.0))
    cube = bpy.context.object
    cube.name = "Synthetic_Rounded_Grid_Cube"
    cube.data.name = "Synthetic_Rounded_Grid_Cube_Mesh"
    bevel = cube.modifiers.new("Baked_Rounded_Edges", "BEVEL")
    bevel.width = 0.3
    bevel.segments = 8
    bevel.limit_method = "NONE"
    bpy.context.view_layer.objects.active = cube
    bpy.ops.object.modifier_apply(modifier=bevel.name)
    # Bevel the original cube edges first. Beveling after a dense subdivision
    # would bevel every grid edge, producing the artifacts found in the first render.
    bpy.ops.object.mode_set(mode="EDIT")
    bpy.ops.mesh.select_all(action="SELECT")
    bpy.ops.mesh.subdivide(number_cuts=5)
    bpy.ops.object.mode_set(mode="OBJECT")
    bpy.ops.object.select_all(action="DESELECT")
    cube.select_set(True)
    bpy.context.view_layer.objects.active = cube
    bpy.ops.object.mode_set(mode="EDIT")
    bpy.ops.mesh.select_all(action="SELECT")
    bpy.ops.uv.smart_project(island_margin=0.02)
    bpy.ops.object.mode_set(mode="OBJECT")
    for polygon in cube.data.polygons:
        polygon.use_smooth = True
    cube.data.materials.append(HELPERS["make_material"](preset))

    bpy.ops.mesh.primitive_plane_add(size=200, location=(0, 0, 0))
    floor = bpy.context.object
    floor.name = "Neutral_Floor"
    floor_mat = bpy.data.materials.new("Neutral_Floor_Material")
    floor_mat.diffuse_color = (0.09, 0.11, 0.15, 1)
    floor_mat.use_nodes = True
    floor_mat.node_tree.nodes["Principled BSDF"].inputs["Base Color"].default_value = (0.09, 0.11, 0.15, 1)
    floor_mat.node_tree.nodes["Principled BSDF"].inputs["Roughness"].default_value = 0.9
    floor.data.materials.append(floor_mat)

    bpy.ops.object.light_add(type="AREA", location=(-3, -4, 7))
    key = bpy.context.object
    key.data.energy = 1100
    key.data.shape = "DISK"
    key.data.size = 5
    key.rotation_euler = (0.35, 0, -0.55)
    bpy.ops.object.light_add(type="AREA", location=(4, 2, 4))
    fill = bpy.context.object
    fill.data.energy = 420
    fill.data.color = (0.55, 0.72, 1.0)
    fill.data.size = 4
    fill.rotation_euler = (0.5, 0, 2.4)
    bpy.ops.object.camera_add(location=(4.2, -6.5, 4.3))
    camera = bpy.context.object
    direction = Vector((0, 0, 0.9)) - camera.location
    camera.rotation_euler = direction.to_track_quat("-Z", "Y").to_euler()
    camera.data.type = "ORTHO"
    camera.data.ortho_scale = 5.2
    scene.camera = camera

    render_path = out / "rounded-grid-cube.png"
    blend_path = out / "rounded-grid-cube.blend"
    glb_path = out / "rounded-grid-cube.glb"
    scene.render.filepath = str(render_path)
    bpy.ops.render.render(write_still=True)
    bpy.ops.wm.save_as_mainfile(filepath=str(blend_path))
    bpy.ops.export_scene.gltf(filepath=str(glb_path), export_format="GLB", use_selection=False)

    expected_vertices = len(cube.data.vertices)
    expected_triangles = sum(max(0, len(p.vertices) - 2) for p in cube.data.polygons)
    expected_uv_channels = len(cube.data.uv_layers)
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=str(glb_path))
    meshes = [obj for obj in bpy.context.scene.objects if obj.type == "MESH"]
    imported_cube = next((obj for obj in meshes if obj.name.startswith("Synthetic_Rounded_Grid_Cube")), None)
    if imported_cube is None or not imported_cube.data.materials:
        raise RuntimeError("GLB readback did not preserve the cube mesh and material")
    if not imported_cube.data.uv_layers:
        raise RuntimeError("GLB readback did not preserve cube UVs")

    receipt = {
        "schema": "atlas.blender-primitive-material-receipt.v1",
        "status": "SYNTHETIC_PRIMITIVE_RENDER_EXPORT_READBACK_PASS",
        "classification": "SYNTHETIC_DEMONSTRATIVE_PRESET",
        "blenderVersion": bpy.app.version_string,
        "renderer": "BLENDER_EEVEE_NEXT",
        "materialModel": "Principled BSDF / glTF METALLIC_ROUGHNESS",
        "presetId": preset["id"],
        "baseColorSrgb": preset["baseColorSrgb"],
        "metallic": preset["metallic"],
        "roughness": preset["roughness"],
        "geometry": {"vertices": expected_vertices, "triangles": expected_triangles, "uvChannels": expected_uv_channels, "textureAtlasBaked": False, "subdivision": "geometry baked offline in Blender; no runtime hardware tessellation"},
        "glbReadback": {"meshCount": len(meshes), "cubeMaterial": imported_cube.data.materials[0].name, "cubeUvChannels": len(imported_cube.data.uv_layers), "status": "PASS"},
        "outputs": {key: {"path": str(path), "bytes": path.stat().st_size, "sha256": digest(path)} for key, path in (("blend", blend_path), ("glb", glb_path), ("render", render_path))},
        "datastoreWrites": "NONE",
        "modelTraining": "NONE",
    }
    (out / "receipt.json").write_text(json.dumps(receipt, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(receipt, indent=2))


if __name__ == "__main__":
    main()
