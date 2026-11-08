"""Generate an original, small, textured, rigged character fixture for Parent Atlas.

Run with:
  blender --background --python scripts/blender/procedural-humanoid-v1.py -- \
    --output-dir .tmp/atlas/procedural-humanoid-v1

The output is synthetic and demonstrative. It contains one 21-bone rig, one
single-atlas skinned mesh, and a deterministic three-second 24 fps arm-wave
action. No external character or motion assets are read.
"""
import argparse
import hashlib
import json
import math
import sys
from pathlib import Path

import bpy
from mathutils import Vector


ROOT = Path(__file__).resolve().parents[2]
DEFAULT_OUT = ROOT / ".tmp" / "atlas" / "procedural-humanoid-v1-fixed-time"
FPS = 24
FRAME_START = 0
FRAME_END = 72  # 72 intervals = exactly 3 seconds at 24 fps and glTF time 0..3.
PALETTE = [
    ("coat", "#1F3A5F"),
    ("skin", "#D99B72"),
    ("accent", "#17A6A1"),
    ("trim", "#E7B84B"),
    ("trousers", "#27364A"),
    ("boots", "#6A4638"),
]


def parse_args():
    argv = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else []
    parser = argparse.ArgumentParser()
    parser.add_argument("--output-dir", default=str(DEFAULT_OUT))
    return parser.parse_args(argv)


def clear_scene():
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete(use_global=False)
    for datablocks in (bpy.data.meshes, bpy.data.curves, bpy.data.materials, bpy.data.images, bpy.data.armatures, bpy.data.cameras, bpy.data.lights):
        for datablock in list(datablocks):
            if datablock.users == 0:
                datablocks.remove(datablock)


def hex_rgb(value):
    value = value.lstrip("#")
    return tuple(int(value[i : i + 2], 16) / 255.0 for i in (0, 2, 4))


def linear(value):
    return value / 12.92 if value <= 0.04045 else ((value + 0.055) / 1.055) ** 2.4


def make_palette_image():
    width, height = 256, 32
    image = bpy.data.images.new("Atlas_OriginalHumanoid_Palette_v1", width=width, height=height, alpha=False)
    image.colorspace_settings.name = "sRGB"
    pixels = []
    colors = [tuple(linear(c) for c in hex_rgb(color)) for _, color in PALETTE]
    for _y in range(height):
        for x in range(width):
            idx = min(len(colors) - 1, (x * len(colors)) // width)
            pixels.extend((*colors[idx], 1.0))
    image.pixels.foreach_set(pixels)
    image.pack()
    return image


def make_material(image):
    mat = bpy.data.materials.new("Atlas Original Humanoid · Palette PBR")
    mat.use_nodes = True
    nodes = mat.node_tree.nodes
    links = mat.node_tree.links
    nodes.clear()
    output = nodes.new("ShaderNodeOutputMaterial")
    principled = nodes.new("ShaderNodeBsdfPrincipled")
    principled.inputs["Metallic"].default_value = 0.0
    principled.inputs["Roughness"].default_value = 0.72
    tex = nodes.new("ShaderNodeTexImage")
    tex.image = image
    tex.interpolation = "Closest"
    links.new(tex.outputs["Color"], principled.inputs["Base Color"])
    links.new(principled.outputs["BSDF"], output.inputs["Surface"])
    mat.diffuse_color = (0.12, 0.22, 0.38, 1.0)
    return mat


def add_bone(arm, name, head, tail, parent=None):
    bone = arm.data.edit_bones.new(name)
    bone.head = head
    bone.tail = tail
    if parent:
        bone.parent = arm.data.edit_bones[parent]
    return bone


def build_rig():
    arm_data = bpy.data.armatures.new("AtlasHumanoidRig_v1")
    rig = bpy.data.objects.new("AtlasHumanoidRig_v1", arm_data)
    bpy.context.collection.objects.link(rig)
    bpy.context.view_layer.objects.active = rig
    rig.select_set(True)
    bpy.ops.object.mode_set(mode="EDIT")

    add_bone(rig, "root", (0, 0, 0.72), (0, 0, 0.94))
    add_bone(rig, "spine", (0, 0, 0.88), (0, 0, 1.18), "root")
    add_bone(rig, "chest", (0, 0, 1.15), (0, 0, 1.43), "spine")
    add_bone(rig, "neck", (0, 0, 1.40), (0, 0, 1.57), "chest")
    add_bone(rig, "head", (0, 0, 1.54), (0, 0, 1.82), "neck")

    for side, sign in (("L", 1), ("R", -1)):
        add_bone(rig, f"clavicle.{side}", (sign * 0.05, 0, 1.40), (sign * 0.22, 0, 1.40), "chest")
        add_bone(rig, f"upper_arm.{side}", (sign * 0.20, 0, 1.40), (sign * 0.43, 0, 1.27), f"clavicle.{side}")
        add_bone(rig, f"forearm.{side}", (sign * 0.43, 0, 1.27), (sign * 0.62, 0, 1.28), f"upper_arm.{side}")
        add_bone(rig, f"hand.{side}", (sign * 0.62, 0, 1.28), (sign * 0.72, 0, 1.28), f"forearm.{side}")
        add_bone(rig, f"upper_leg.{side}", (sign * 0.09, 0, 0.86), (sign * 0.10, 0, 0.48), "root")
        add_bone(rig, f"lower_leg.{side}", (sign * 0.10, 0, 0.48), (sign * 0.10, 0, 0.13), f"upper_leg.{side}")
        add_bone(rig, f"foot.{side}", (sign * 0.10, 0, 0.13), (sign * 0.10, -0.12, 0.08), f"lower_leg.{side}")
        add_bone(rig, f"toe.{side}", (sign * 0.10, -0.10, 0.08), (sign * 0.10, -0.20, 0.08), f"foot.{side}")

    bpy.ops.object.mode_set(mode="OBJECT")
    rig.show_in_front = True
    return rig


def add_part(parts, bone_name, palette_name, kind, location, scale, end=None):
    if kind == "sphere":
        bpy.ops.mesh.primitive_uv_sphere_add(segments=12, ring_count=8, radius=1.0, location=location)
    elif kind == "cylinder":
        a, b = Vector(location), Vector(end)
        direction = b - a
        bpy.ops.mesh.primitive_cylinder_add(vertices=10, radius=scale[0], depth=direction.length, location=(a + b) / 2)
        obj = bpy.context.object
        obj.rotation_mode = "QUATERNION"
        obj.rotation_quaternion = Vector((0, 0, 1)).rotation_difference(direction.normalized())
    else:
        raise ValueError(kind)

    obj = bpy.context.object
    obj.name = f"Part_{bone_name}_{len(parts):02d}"
    if kind == "sphere":
        obj.scale = scale
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    group = obj.vertex_groups.new(name=bone_name)
    group.add(list(range(len(obj.data.vertices))), 1.0, "REPLACE")
    tile = next(i for i, (name, _) in enumerate(PALETTE) if name == palette_name)
    u = (tile + 0.5) / len(PALETTE)
    uv = obj.data.uv_layers.active
    if uv is None:
        uv = obj.data.uv_layers.new(name="UVMap")
    for loop in uv.data:
        loop.uv = (u, 0.5)
    parts.append(obj)


def build_character(rig, palette_image):
    parts = []
    add_part(parts, "root", "trousers", "sphere", (0, 0, 0.91), (0.17, 0.105, 0.15))
    add_part(parts, "spine", "coat", "sphere", (0, 0, 1.12), (0.16, 0.105, 0.20))
    add_part(parts, "chest", "coat", "sphere", (0, 0, 1.34), (0.24, 0.13, 0.22))
    add_part(parts, "chest", "trim", "sphere", (0, -0.125, 1.35), (0.045, 0.018, 0.16))
    add_part(parts, "neck", "skin", "cylinder", (0, 0, 1.47), (0.06,), (0, 0, 1.60))
    add_part(parts, "head", "skin", "sphere", (0, 0, 1.70), (0.13, 0.12, 0.16))
    add_part(parts, "head", "accent", "sphere", (0, -0.105, 1.72), (0.07, 0.025, 0.045))

    for side, sign in (("L", 1), ("R", -1)):
        add_part(parts, f"clavicle.{side}", "coat", "sphere", (sign * 0.22, 0, 1.40), (0.09, 0.11, 0.10))
        add_part(parts, f"upper_arm.{side}", "coat", "cylinder", (sign * 0.21, 0, 1.40), (0.065,), (sign * 0.43, 0, 1.27))
        add_part(parts, f"forearm.{side}", "accent", "cylinder", (sign * 0.43, 0, 1.27), (0.052,), (sign * 0.62, 0, 1.28))
        add_part(parts, f"hand.{side}", "skin", "sphere", (sign * 0.68, 0, 1.28), (0.065, 0.055, 0.06))
        add_part(parts, f"upper_leg.{side}", "trousers", "cylinder", (sign * 0.10, 0, 0.83), (0.085,), (sign * 0.10, 0, 0.48))
        add_part(parts, f"lower_leg.{side}", "trousers", "cylinder", (sign * 0.10, 0, 0.48), (0.06,), (sign * 0.10, 0, 0.13))
        add_part(parts, f"foot.{side}", "boots", "sphere", (sign * 0.10, -0.09, 0.10), (0.07, 0.14, 0.07))
        add_part(parts, f"toe.{side}", "boots", "sphere", (sign * 0.10, -0.19, 0.08), (0.065, 0.09, 0.05))

    bpy.ops.object.select_all(action="DESELECT")
    for obj in parts:
        obj.select_set(True)
    bpy.context.view_layer.objects.active = parts[0]
    bpy.ops.object.join()
    mesh = bpy.context.object
    mesh.name = "AtlasOriginalHumanoidMesh_v1"
    mesh.data.name = "AtlasOriginalHumanoidGeometry_v1"
    mat = make_material(palette_image)
    mesh.data.materials.clear()
    mesh.data.materials.append(mat)
    for poly in mesh.data.polygons:
        poly.material_index = 0
        poly.use_smooth = True

    arm = mesh.modifiers.new("AtlasHumanoidSkin_v1", "ARMATURE")
    arm.object = rig
    mesh.parent = rig
    return mesh


def build_animation(rig, scene):
    scene.render.fps = FPS
    scene.frame_start = FRAME_START
    scene.frame_end = FRAME_END
    scene.frame_set(FRAME_START)
    rig.animation_data_create()
    action = bpy.data.actions.new("atlas.wave.original.v1")
    rig.animation_data.action = action
    for pose_bone in rig.pose.bones:
        pose_bone.rotation_mode = "XYZ"

    # Fixed-frame, authored arm raise and two small hand waves, then return.
    keys = {
        0:   {"upper_arm.L": (0, 0, 0), "forearm.L": (0, 0, 0), "hand.L": (0, 0, 0), "head": (0, 0, 0)},
        24:  {"upper_arm.L": (0, -0.12, -1.05), "forearm.L": (0, 0, -0.32), "hand.L": (0, 0, 0), "head": (0, 0, 0.04)},
        36:  {"upper_arm.L": (0, -0.12, -1.05), "forearm.L": (0, 0, -0.55), "hand.L": (0, 0, 0.35), "head": (0, 0, 0.04)},
        42:  {"upper_arm.L": (0, -0.12, -1.05), "forearm.L": (0, 0, -0.55), "hand.L": (0, 0, -0.35), "head": (0, 0, 0.04)},
        48:  {"upper_arm.L": (0, -0.12, -1.05), "forearm.L": (0, 0, -0.55), "hand.L": (0, 0, 0.35), "head": (0, 0, 0.04)},
        72:  {"upper_arm.L": (0, 0, 0), "forearm.L": (0, 0, 0), "hand.L": (0, 0, 0), "head": (0, 0, 0)},
    }
    for frame, bone_values in keys.items():
        scene.frame_set(frame)
        for bone_name, euler in bone_values.items():
            pose_bone = rig.pose.bones[bone_name]
            pose_bone.rotation_euler = euler
            pose_bone.keyframe_insert(data_path="rotation_euler", frame=frame, group=bone_name)

    if action.fcurves:
        for curve in action.fcurves:
            for key in curve.keyframe_points:
                key.interpolation = "BEZIER"
                key.handle_left_type = "AUTO_CLAMPED"
                key.handle_right_type = "AUTO_CLAMPED"
    action["atlas_classification"] = "SYNTHETIC_DEMONSTRATIVE"
    action["fps"] = FPS
    action["duration_seconds"] = 3
    scene.frame_set(FRAME_START)
    return action


def add_render_setup(scene):
    scene.render.engine = "BLENDER_EEVEE_NEXT"
    scene.render.resolution_x = 720
    scene.render.resolution_y = 720
    scene.render.resolution_percentage = 100
    scene.render.image_settings.file_format = "PNG"
    scene.render.film_transparent = False
    scene.view_settings.view_transform = "AgX"
    scene.render.image_settings.color_mode = "RGBA"
    world = bpy.data.worlds.new("AtlasHumanoidWorld")
    scene.world = world
    world.use_nodes = True
    world.node_tree.nodes["Background"].inputs["Color"].default_value = (0.035, 0.045, 0.07, 1)
    world.node_tree.nodes["Background"].inputs["Strength"].default_value = 0.4

    bpy.ops.object.light_add(type="AREA", location=(2.5, -4, 4.0))
    key = bpy.context.object
    key.name = "Preview_Key"
    key.data.energy = 420
    key.data.shape = "DISK"
    key.data.size = 4
    key.rotation_euler = (math.radians(25), 0, math.radians(25))
    bpy.ops.object.light_add(type="AREA", location=(-3, -1, 2.3))
    fill = bpy.context.object
    fill.name = "Preview_Fill"
    fill.data.energy = 120
    fill.data.size = 3
    fill.rotation_euler = (math.radians(20), 0, math.radians(-45))
    bpy.ops.object.camera_add(location=(3.1, -5.2, 2.1))
    camera = bpy.context.object
    camera.name = "Preview_Camera"
    camera.data.type = "ORTHO"
    camera.data.ortho_scale = 2.55
    direction = Vector((0, 0, 0.95)) - camera.location
    camera.rotation_euler = direction.to_track_quat("-Z", "Y").to_euler()
    scene.camera = camera

    bpy.ops.mesh.primitive_plane_add(size=4, location=(0, 0, 0))
    floor = bpy.context.object
    floor.name = "Preview_Floor"
    floor_mat = bpy.data.materials.new("Preview_Floor_Matte")
    floor_mat.diffuse_color = (0.045, 0.06, 0.08, 1)
    floor_mat.use_nodes = True
    floor_mat.node_tree.nodes["Principled BSDF"].inputs["Base Color"].default_value = (0.045, 0.06, 0.08, 1)
    floor_mat.node_tree.nodes["Principled BSDF"].inputs["Roughness"].default_value = 0.9
    floor.data.materials.append(floor_mat)


def sha256(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def main():
    args = parse_args()
    out = Path(args.output_dir).resolve()
    out.mkdir(parents=True, exist_ok=True)
    clear_scene()
    scene = bpy.context.scene
    scene.render.fps = FPS
    scene.frame_start = FRAME_START
    scene.frame_end = FRAME_END

    palette_image = make_palette_image()
    rig = build_rig()
    mesh = build_character(rig, palette_image)
    action = build_animation(rig, scene)
    add_render_setup(scene)

    preview = out / "atlas-original-humanoid.png"
    scene.render.filepath = str(preview)
    scene.frame_set(36)
    bpy.context.view_layer.update()
    bpy.ops.render.render(write_still=True)
    scene.frame_set(FRAME_START)

    blend_path = out / "atlas-original-humanoid.blend"
    glb_path = out / "atlas-original-humanoid.glb"
    bpy.ops.wm.save_as_mainfile(filepath=str(blend_path))

    bpy.ops.object.select_all(action="DESELECT")
    rig.select_set(True)
    mesh.select_set(True)
    bpy.context.view_layer.objects.active = rig
    bpy.ops.export_scene.gltf(
        filepath=str(glb_path),
        export_format="GLB",
        use_selection=True,
        export_animations=True,
        export_skins=True,
        export_apply=False,
        export_force_sampling=True,
    )
    action_name = action.name

    # Independent round trip in a fresh empty Blender scene.
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=str(glb_path))
    imported_armatures = [o for o in bpy.context.scene.objects if o.type == "ARMATURE"]
    imported_meshes = [o for o in bpy.context.scene.objects if o.type == "MESH"]
    imported_actions = [a for a in bpy.data.actions if len(a.fcurves) > 0]
    bone_count = sum(len(o.data.bones) for o in imported_armatures)
    texture_images = [img for img in bpy.data.images if img.source == "FILE"]
    clip_names = [a.name for a in imported_actions]
    if bone_count != 21:
        raise RuntimeError(f"Expected 21 bones after GLB readback, got {bone_count}")
    if not imported_meshes:
        raise RuntimeError("GLB readback contained no mesh")
    if not imported_actions:
        raise RuntimeError("GLB readback contained no animation action")
    if not texture_images:
        raise RuntimeError("GLB readback contained no external/embedded palette image")

    # Sample the imported animation at endpoints to catch a missing/broken clip.
    arm = imported_armatures[0]
    readback_scene = bpy.context.scene
    readback_scene.render.fps = FPS
    readback_scene.frame_set(1)
    readback_scene.frame_set(36)
    bpy.context.view_layer.update()
    mid_pose = [round(v, 6) for v in arm.pose.bones["upper_arm.L"].rotation_quaternion]
    readback_scene.frame_set(72)
    bpy.context.view_layer.update()
    end_pose = [round(v, 6) for v in arm.pose.bones["upper_arm.L"].rotation_quaternion]
    if abs(mid_pose[0] - 1.0) + sum(abs(v) for v in mid_pose[1:]) < 0.1:
        raise RuntimeError("Imported arm-wave animation did not change the upper arm at frame 37")
    if abs(end_pose[0] - 1.0) + sum(abs(v) for v in end_pose[1:]) > 0.01:
        raise RuntimeError("Imported arm-wave animation did not restore the upper arm by frame 73")
    readback_blend = out / "atlas-original-humanoid-readback.blend"
    bpy.ops.wm.save_as_mainfile(filepath=str(readback_blend))

    receipt = {
        "schema": "atlas.procedural-humanoid-fixture.v1",
        "status": "SYNTHETIC_FIXTURE_ROUNDTRIP_PASS",
        "classification": "SYNTHETIC_DEMONSTRATIVE",
        "rights": {"origin": "ORIGINAL_PROCEDURAL", "thirdPartyAssets": False, "training": "NOT_USED"},
        "blenderVersion": bpy.app.version_string,
        "rig": {"name": "AtlasHumanoidRig_v1", "boneCount": bone_count, "meshCount": len(imported_meshes), "vertexCount": sum(len(o.data.vertices) for o in imported_meshes), "triangleCount": sum(sum(len(p.vertices) - 2 for p in o.data.polygons) for o in imported_meshes)},
        "texture": {"count": len(texture_images), "names": [image.name for image in texture_images], "sourcePalette": PALETTE},
        "animation": {"name": action_name, "readbackNames": clip_names, "fps": FPS, "frameStart": FRAME_START, "frameEnd": FRAME_END, "durationSeconds": 3, "keyPoseFrame": 36, "midUpperArmQuaternion": mid_pose, "endUpperArmQuaternion": end_pose},
        "coordinateFrame": {"status": "LOCAL_UNCALIBRATED", "units": "BLENDER_SCENE_UNITS", "heightMetersClaim": None},
        "outputs": {"blend": {"path": blend_path.name, "bytes": blend_path.stat().st_size, "sha256": sha256(blend_path)}, "glb": {"path": glb_path.name, "bytes": glb_path.stat().st_size, "sha256": sha256(glb_path)}, "preview": {"path": preview.name, "bytes": preview.stat().st_size, "sha256": sha256(preview)}, "readbackBlend": {"path": readback_blend.name, "bytes": readback_blend.stat().st_size, "sha256": sha256(readback_blend)}},
        "datastoreWrites": "NONE",
    }
    (out / "receipt.json").write_text(json.dumps(receipt, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(receipt, indent=2))


if __name__ == "__main__":
    main()
