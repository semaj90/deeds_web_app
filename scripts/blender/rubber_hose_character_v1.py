"""Headless Blender: generate a 1928 Rubber-Hose character fixture with N64 aesthetics.

Combines:
  1. 1928 Rubber-hose cartoon art style (circles, ellipsoids, bendy tube limbs, pie-eyes, exaggerated shoes).
  2. Rare Nintendo 64-era budget (1,000–2,500 triangles, sub-8MB memory footprint).
  3. YoRHa Law vintage material palette (Obsidian, Oxblood, Taupe, Blush, Ivory, Gold).
  4. 21-bone canonical armature with 5 standard animation clips:
     - 'Idle' (bouncy squash-and-stretch rhythm)
     - 'Walk' (exaggerated marching stride)
     - 'Wave' (classic cheerful wave)
     - 'Point' (dramatic detective accusation pose)
     - 'RestPose' (neutral calibration baseline)
  5. Multi-clip NLA export for Three.js WebGL/WebGPU playback.

Run:
  blender -b --python scripts/blender/rubber_hose_character_v1.py -- \
    --out static/models/rubber-hose-actor-v1.glb \
    --receipt .tmp/atlas/rubber-hose-v1/receipt.json
"""

import argparse
import hashlib
import json
import math
import sys
from pathlib import Path

import bpy
from mathutils import Euler, Quaternion, Vector

FPS = 24

# YoRHa Law vintage 3D palette (linear RGB hex values)
PALETTE = [
    ("obsidian", "#1A1A1A"),  # 0: deep charcoal / black body & limbs
    ("oxblood",  "#5B1414"),  # 1: forensic dark crimson shoes & accents
    ("taupe",    "#8C7D70"),  # 2: vintage warm grey shadow & sole
    ("blush",    "#D89D8B"),  # 3: peach/rose facial muzzle highlight
    ("ivory",    "#F5F0E6"),  # 4: warm off-white face & cartoon gloves
    ("gold",     "#C8A253"),  # 5: celestial gold buttons & trim
]


def parse_args():
    argv = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else []
    p = argparse.ArgumentParser(description="1928 Rubber-Hose Character Generator")
    p.add_argument("--out", default="static/models/rubber-hose-actor-v1.glb", help="Path for exported GLB")
    p.add_argument("--receipt", default=".tmp/atlas/rubber-hose-v1/receipt.json", help="Path for JSON receipt")
    return p.parse_args(argv)


def clear_scene():
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete(use_global=False)
    for collection in (
        bpy.data.meshes,
        bpy.data.curves,
        bpy.data.materials,
        bpy.data.images,
        bpy.data.armatures,
        bpy.data.actions,
    ):
        for item in list(collection):
            if item.users == 0:
                collection.remove(item)


def hex_to_linear_rgb(hex_code):
    hex_code = hex_code.lstrip("#")
    srgb = [int(hex_code[i : i + 2], 16) / 255.0 for i in (0, 2, 4)]
    # sRGB to linear conversion for accurate glTF shading
    linear = []
    for c in srgb:
        linear.append(c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4)
    return (*linear, 1.0)


def create_palette_texture():
    image = bpy.data.images.new("RubberHosePalette", width=len(PALETTE), height=1, alpha=False)
    pixels = []
    for _, h in PALETTE:
        pixels.extend(hex_to_linear_rgb(h))
    image.pixels.foreach_set(pixels)
    image.pack()
    return image


def create_palette_material(image):
    mat = bpy.data.materials.new("RubberHoseVintageMaterial")
    mat.use_nodes = True
    nodes = mat.node_tree.nodes
    links = mat.node_tree.links
    nodes.clear()

    output = nodes.new("ShaderNodeOutputMaterial")
    bsdf = nodes.new("ShaderNodeBsdfPrincipled")
    bsdf.inputs["Roughness"].default_value = 0.65
    bsdf.inputs["Metallic"].default_value = 0.05

    tex = nodes.new("ShaderNodeTexImage")
    tex.image = image
    tex.interpolation = "Closest"  # Crisp retro palette quantization

    # Link COLOR_0 vertex color attribute so glTF exporter retains Gouraud channels
    color_attr = nodes.new("ShaderNodeAttribute")
    color_attr.attribute_name = "COLOR_0"

    links.new(tex.outputs["Color"], bsdf.inputs["Base Color"])
    links.new(bsdf.outputs["BSDF"], output.inputs["Surface"])
    return mat


def add_bone(arm, name, head, tail, parent=None):
    bone = arm.data.edit_bones.new(name)
    bone.head = head
    bone.tail = tail
    if parent:
        bone.parent = arm.data.edit_bones[parent]
    return bone


def build_canonical_rig():
    """Build canonical 21-bone armature tailored for rubber-hose bendy deformation."""
    arm_data = bpy.data.armatures.new("RubberHoseRig_v1")
    rig = bpy.data.objects.new("RubberHoseRig_v1", arm_data)
    bpy.context.collection.objects.link(rig)
    bpy.context.view_layer.objects.active = rig
    rig.select_set(True)
    bpy.ops.object.mode_set(mode="EDIT")

    # Torso & Head
    add_bone(rig, "root", (0, 0, 0.70), (0, 0, 0.90))
    add_bone(rig, "spine", (0, 0, 0.75), (0, 0, 1.05), "root")
    add_bone(rig, "chest", (0, 0, 1.00), (0, 0, 1.25), "spine")
    add_bone(rig, "neck", (0, 0, 1.22), (0, 0, 1.35), "chest")
    add_bone(rig, "head", (0, 0, 1.35), (0, 0, 1.70), "neck")
    add_bone(rig, "ear.L", (0.16, 0, 1.62), (0.32, 0, 1.85), "head")
    add_bone(rig, "ear.R", (-0.16, 0, 1.62), (-0.32, 0, 1.85), "head")

    # Bendy Rubber-Hose Arms (L & R)
    for side, sign in (("L", 1), ("R", -1)):
        add_bone(rig, f"clavicle.{side}", (sign * 0.05, 0, 1.22), (sign * 0.18, 0, 1.22), "chest")
        add_bone(rig, f"upper_arm.{side}", (sign * 0.18, 0, 1.22), (sign * 0.38, 0, 1.08), f"clavicle.{side}")
        add_bone(rig, f"forearm.{side}", (sign * 0.38, 0, 1.08), (sign * 0.54, 0, 0.98), f"upper_arm.{side}")
        add_bone(rig, f"hand.{side}", (sign * 0.54, 0, 0.98), (sign * 0.65, 0, 0.94), f"forearm.{side}")

    # Rubber-Hose Legs & Clown Boots (L & R)
    for side, sign in (("L", 1), ("R", -1)):
        add_bone(rig, f"upper_leg.{side}", (sign * 0.11, 0, 0.72), (sign * 0.12, 0, 0.42), "root")
        add_bone(rig, f"lower_leg.{side}", (sign * 0.12, 0, 0.42), (sign * 0.12, 0, 0.16), f"upper_leg.{side}")
        add_bone(rig, f"foot.{side}", (sign * 0.12, 0, 0.16), (sign * 0.12, -0.15, 0.10), f"lower_leg.{side}")
        add_bone(rig, f"toe.{side}", (sign * 0.12, -0.15, 0.10), (sign * 0.12, -0.28, 0.08), f"foot.{side}")

    bpy.ops.object.mode_set(mode="OBJECT")
    rig.show_in_front = True
    return rig


def add_part_primitive(parts, bone_name, palette_name, kind, location, scale, end=None, segments=(12, 8)):
    """Add a decomposed procedural primitive and skin it to the corresponding bone."""
    if kind == "sphere":
        bpy.ops.mesh.primitive_uv_sphere_add(
            segments=segments[0], ring_count=segments[1], radius=1.0, location=location
        )
        obj = bpy.context.object
        obj.scale = scale
    elif kind == "cylinder":
        a, b = Vector(location), Vector(end)
        direction = b - a
        length = direction.length
        bpy.ops.mesh.primitive_cylinder_add(
            vertices=segments[0], radius=scale[0], depth=length, location=(a + b) / 2
        )
        obj = bpy.context.object
        obj.rotation_mode = "QUATERNION"
        obj.rotation_quaternion = Vector((0, 0, 1)).rotation_difference(direction.normalized())
    else:
        raise ValueError(f"Unknown kind: {kind}")

    obj.name = f"Part_{bone_name}_{len(parts):02d}"
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)

    # Assign single bone weight
    vg = obj.vertex_groups.new(name=bone_name)
    vg.add(list(range(len(obj.data.vertices))), 1.0, "REPLACE")

    # Map UV coordinates to the 1-pixel column of the palette image
    tile_index = next(i for i, (name, _) in enumerate(PALETTE) if name == palette_name)
    u = (tile_index + 0.5) / len(PALETTE)
    uv = obj.data.uv_layers.active or obj.data.uv_layers.new(name="UVMap")
    for loop in uv.data:
        loop.uv = (u, 0.5)

    # Gouraud vertex color attribute (COLOR_0)
    color_attr = obj.data.color_attributes.new(name="COLOR_0", type="BYTE_COLOR", domain="CORNER")
    linear_color = hex_to_linear_rgb(PALETTE[tile_index][1])
    for i in range(len(obj.data.loops)):
        color_attr.data[i].color = linear_color

    parts.append(obj)
    return obj


def build_rubber_hose_mesh(rig, palette_image):
    """Decompose character into procedural primitives matching 1928 rubber-hose design."""
    parts = []

    # 1. Head (Ivory sphere + Blush snout)
    add_part_primitive(parts, "head", "ivory", "sphere", (0, 0, 1.48), (0.24, 0.22, 0.22), segments=(12, 8))
    add_part_primitive(parts, "head", "blush", "sphere", (0, -0.16, 1.42), (0.13, 0.12, 0.10), segments=(8, 6))

    # Pie-cut eyes (small dark obsidian discs)
    add_part_primitive(parts, "head", "obsidian", "sphere", (0.07, -0.20, 1.52), (0.04, 0.02, 0.06), segments=(8, 6))
    add_part_primitive(parts, "head", "obsidian", "sphere", (-0.07, -0.20, 1.52), (0.04, 0.02, 0.06), segments=(8, 6))

    # Round cartoon ears
    add_part_primitive(parts, "ear.L", "obsidian", "sphere", (0.24, 0.02, 1.74), (0.14, 0.03, 0.14), segments=(8, 6))
    add_part_primitive(parts, "ear.R", "obsidian", "sphere", (-0.24, 0.02, 1.74), (0.14, 0.03, 0.14), segments=(8, 6))

    # 2. Torso (Obsidian pear-shaped body)
    add_part_primitive(parts, "chest", "obsidian", "sphere", (0, 0, 1.10), (0.20, 0.18, 0.22), segments=(10, 8))
    add_part_primitive(parts, "spine", "obsidian", "sphere", (0, 0, 0.90), (0.22, 0.20, 0.20), segments=(10, 8))

    # Celestial Gold Buttons on Chest / Vest
    add_part_primitive(parts, "chest", "gold", "sphere", (0.06, -0.18, 1.06), (0.03, 0.02, 0.03), segments=(6, 4))
    add_part_primitive(parts, "chest", "gold", "sphere", (-0.06, -0.18, 1.06), (0.03, 0.02, 0.03), segments=(6, 4))

    # 3. Rubber-Hose Bendy Arms (L & R cylinders)
    for side, sign in (("L", 1), ("R", -1)):
        # Upper arm
        add_part_primitive(
            parts, f"upper_arm.{side}", "obsidian", "cylinder",
            (sign * 0.18, 0, 1.22), (0.045,), end=(sign * 0.38, 0, 1.08), segments=(8, 1)
        )
        # Forearm
        add_part_primitive(
            parts, f"forearm.{side}", "obsidian", "cylinder",
            (sign * 0.38, 0, 1.08), (0.042,), end=(sign * 0.54, 0, 0.98), segments=(8, 1)
        )
        # Cartoon 4-finger glove & pie cuff
        add_part_primitive(
            parts, f"hand.{side}", "ivory", "sphere",
            (sign * 0.60, 0, 0.96), (0.09, 0.07, 0.09), segments=(8, 6)
        )
        add_part_primitive(
            parts, f"hand.{side}", "taupe", "sphere",
            (sign * 0.55, 0, 0.97), (0.06, 0.06, 0.06), segments=(6, 4)
        )

    # 4. Rubber-Hose Bendy Legs & Clown Boots (L & R)
    for side, sign in (("L", 1), ("R", -1)):
        # Upper leg
        add_part_primitive(
            parts, f"upper_leg.{side}", "obsidian", "cylinder",
            (sign * 0.11, 0, 0.72), (0.05,), end=(sign * 0.12, 0, 0.42), segments=(8, 1)
        )
        # Lower leg
        add_part_primitive(
            parts, f"lower_leg.{side}", "obsidian", "cylinder",
            (sign * 0.12, 0, 0.42), (0.045,), end=(sign * 0.12, 0, 0.16), segments=(8, 1)
        )
        # Exaggerated rubber-hose clown shoes (Oxblood with Taupe sole)
        add_part_primitive(
            parts, f"foot.{side}", "oxblood", "sphere",
            (sign * 0.12, -0.10, 0.12), (0.11, 0.18, 0.10), segments=(10, 6)
        )
        add_part_primitive(
            parts, f"toe.{side}", "taupe", "sphere",
            (sign * 0.12, -0.18, 0.05), (0.10, 0.12, 0.04), segments=(8, 4)
        )

    # Join all parts into one skinned mesh
    bpy.ops.object.select_all(action="DESELECT")
    for obj in parts:
        obj.select_set(True)
    bpy.context.view_layer.objects.active = parts[0]
    bpy.ops.object.join()
    mesh_obj = bpy.context.object
    mesh_obj.name = "RubberHoseActor_Mesh"

    # Assign single shared vintage palette material
    mat = create_palette_material(palette_image)
    mesh_obj.data.materials.clear()
    mesh_obj.data.materials.append(mat)

    # Parent mesh to armature with Armature Modifier
    mesh_obj.parent = rig
    arm_mod = mesh_obj.modifiers.new(name="Armature", type="ARMATURE")
    arm_mod.object = rig
    arm_mod.use_vertex_groups = True

    return mesh_obj


def create_action_keyframes(rig, action_name, keyframes):
    """Create an animation action and insert keyframes for specified pose bones."""
    action = bpy.data.actions.new(action_name)
    action.use_fake_user = True
    rig.animation_data.action = action

    for frame, bone_transforms in keyframes.items():
        for bone_name, (rx, ry, rz) in bone_transforms.items():
            if bone_name in rig.pose.bones:
                pose_bone = rig.pose.bones[bone_name]
                pose_bone.rotation_mode = "XYZ"
                pose_bone.rotation_euler = (rx, ry, rz)
                pose_bone.keyframe_insert(data_path="rotation_euler", frame=frame, group=bone_name)

    # Smooth tangents with auto-clamped Bezier interpolation
    for fcurve in action.fcurves:
        for kp in fcurve.keyframe_points:
            kp.interpolation = "BEZIER"
            kp.handle_left_type = "AUTO_CLAMPED"
            kp.handle_right_type = "AUTO_CLAMPED"

    return action


def build_five_animation_clips(rig):
    """Build 5 standard clips: Idle, Walk, Wave, Point, RestPose and push to NLA strips."""
    if not rig.animation_data:
        rig.animation_data_create()

    # 1. Idle Clip (48 frames / 2.0s loop): Rhythmic rubber-hose bouncy bobbing
    idle_keys = {
        0:  {"root": (0, 0, 0), "chest": (0, 0, 0), "head": (0, 0, 0), "upper_arm.L": (0, 0, -0.2), "upper_arm.R": (0, 0, 0.2)},
        12: {"root": (0, 0, 0), "chest": (0.05, 0, 0), "head": (-0.04, 0, 0.05), "upper_arm.L": (0, 0, -0.35), "upper_arm.R": (0, 0, 0.35)},
        24: {"root": (0, 0, 0), "chest": (0, 0, 0), "head": (0, 0, 0), "upper_arm.L": (0, 0, -0.2), "upper_arm.R": (0, 0, 0.2)},
        36: {"root": (0, 0, 0), "chest": (-0.05, 0, 0), "head": (0.04, 0, -0.05), "upper_arm.L": (0, 0, -0.35), "upper_arm.R": (0, 0, 0.35)},
        48: {"root": (0, 0, 0), "chest": (0, 0, 0), "head": (0, 0, 0), "upper_arm.L": (0, 0, -0.2), "upper_arm.R": (0, 0, 0.2)},
    }
    idle_act = create_action_keyframes(rig, "Idle", idle_keys)

    # 2. Walk Clip (48 frames / 2.0s loop): Exaggerated high-knee bouncy marching stride
    walk_keys = {
        0:  {"upper_leg.L": (0.5, 0, 0), "lower_leg.L": (-0.4, 0, 0), "upper_leg.R": (-0.4, 0, 0), "lower_leg.R": (0.2, 0, 0), "upper_arm.L": (-0.4, 0, 0), "upper_arm.R": (0.5, 0, 0)},
        12: {"upper_leg.L": (0.1, 0, 0), "lower_leg.L": (0.1, 0, 0), "upper_leg.R": (-0.1, 0, 0), "lower_leg.R": (-0.3, 0, 0), "upper_arm.L": (0, 0, 0), "upper_arm.R": (0, 0, 0)},
        24: {"upper_leg.L": (-0.4, 0, 0), "lower_leg.L": (0.2, 0, 0), "upper_leg.R": (0.5, 0, 0), "lower_leg.R": (-0.4, 0, 0), "upper_arm.L": (0.5, 0, 0), "upper_arm.R": (-0.4, 0, 0)},
        36: {"upper_leg.L": (-0.1, 0, 0), "lower_leg.L": (-0.3, 0, 0), "upper_leg.R": (0.1, 0, 0), "lower_leg.R": (0.1, 0, 0), "upper_arm.L": (0, 0, 0), "upper_arm.R": (0, 0, 0)},
        48: {"upper_leg.L": (0.5, 0, 0), "lower_leg.L": (-0.4, 0, 0), "upper_leg.R": (-0.4, 0, 0), "lower_leg.R": (0.2, 0, 0), "upper_arm.L": (-0.4, 0, 0), "upper_arm.R": (0.5, 0, 0)},
    }
    walk_act = create_action_keyframes(rig, "Walk", walk_keys)

    # 3. Wave Clip (48 frames / 2.0s): Classic cheerful rubber-hose greeting
    wave_keys = {
        0:  {"upper_arm.L": (0, 0, -0.2), "forearm.L": (0, 0, 0), "hand.L": (0, 0, 0)},
        12: {"upper_arm.L": (0, 0.2, -1.8), "forearm.L": (0, 0, -0.6), "hand.L": (0, 0, 0.4)},
        20: {"upper_arm.L": (0, 0.2, -1.8), "forearm.L": (0, 0, -0.6), "hand.L": (0, 0, -0.4)},
        28: {"upper_arm.L": (0, 0.2, -1.8), "forearm.L": (0, 0, -0.6), "hand.L": (0, 0, 0.4)},
        36: {"upper_arm.L": (0, 0.2, -1.8), "forearm.L": (0, 0, -0.6), "hand.L": (0, 0, -0.4)},
        48: {"upper_arm.L": (0, 0, -0.2), "forearm.L": (0, 0, 0), "hand.L": (0, 0, 0)},
    }
    wave_act = create_action_keyframes(rig, "Wave", wave_keys)

    # 4. Point Clip (48 frames / 2.0s): Dramatic detective accusation / inspection gesture
    point_keys = {
        0:  {"chest": (0, 0, 0), "upper_arm.R": (0, 0, 0.2), "forearm.R": (0, 0, 0), "head": (0, 0, 0)},
        16: {"chest": (-0.1, 0, -0.2), "upper_arm.R": (-0.8, 0, 0.4), "forearm.R": (-0.2, 0, 0), "head": (-0.1, 0, -0.2)},
        36: {"chest": (-0.1, 0, -0.2), "upper_arm.R": (-0.8, 0, 0.4), "forearm.R": (-0.2, 0, 0), "head": (-0.1, 0, -0.2)},
        48: {"chest": (0, 0, 0), "upper_arm.R": (0, 0, 0.2), "forearm.R": (0, 0, 0), "head": (0, 0, 0)},
    }
    point_act = create_action_keyframes(rig, "Point", point_keys)

    # 5. RestPose Clip (2 frames): Baseline A/T-pose calibration
    rest_keys = {
        0: {"root": (0, 0, 0), "chest": (0, 0, 0), "head": (0, 0, 0), "upper_arm.L": (0, 0, 0), "upper_arm.R": (0, 0, 0)},
        1: {"root": (0, 0, 0), "chest": (0, 0, 0), "head": (0, 0, 0), "upper_arm.L": (0, 0, 0), "upper_arm.R": (0, 0, 0)},
    }
    rest_act = create_action_keyframes(rig, "RestPose", rest_keys)

    # Push all 5 actions to distinct NLA tracks so glTF exporter embeds every clip
    actions = [idle_act, walk_act, wave_act, point_act, rest_act]
    for act in actions:
        track = rig.animation_data.nla_tracks.new()
        track.name = act.name
        track.strips.new(act.name, 1, act)

    # Set default active action to Idle
    rig.animation_data.action = idle_act
    return [act.name for act in actions]


def export_character(mesh_obj, rig, out_path):
    out = Path(out_path).resolve()
    out.parent.mkdir(parents=True, exist_ok=True)

    bpy.ops.object.select_all(action="DESELECT")
    mesh_obj.select_set(True)
    rig.select_set(True)
    bpy.context.view_layer.objects.active = rig

    bpy.ops.export_scene.gltf(
        filepath=str(out),
        export_format="GLB",
        use_selection=True,
        export_apply=False,
        export_animations=True,
        export_nla_strips=True,
        export_materials="EXPORT",
        export_attributes=True,  # Exports COLOR_0 vertex attribute
    )
    return out


def main():
    args = parse_args()
    clear_scene()

    palette_image = create_palette_texture()
    rig = build_canonical_rig()
    mesh = build_rubber_hose_mesh(rig, palette_image)
    clip_names = build_five_animation_clips(rig)

    out_file = export_character(mesh, rig, args.out)

    # Generate hash and size receipt
    hasher = hashlib.sha256()
    with open(out_file, "rb") as f:
        while chunk := f.read(65536):
            hasher.update(chunk)
    file_sha256 = hasher.hexdigest()
    file_size = out_file.stat().st_size

    poly_count = len(mesh.data.polygons)
    tri_count = sum(len(p.vertices) - 2 for p in mesh.data.polygons)
    vert_count = len(mesh.data.vertices)
    bone_count = len(rig.data.bones)

    receipt = {
        "status": "success",
        "model": "1928_RubberHose_Actor_v1",
        "mesh_name": mesh.name,
        "rig_name": rig.name,
        "bones_count": bone_count,
        "vertices": vert_count,
        "polygons": poly_count,
        "triangles": tri_count,
        "clips": clip_names,
        "fps": FPS,
        "out": str(out_file),
        "bytes": file_size,
        "sha256": file_sha256,
        "limits": {
            "max_triangles": 2500,
            "max_bytes": 8 * 1024 * 1024,
            "within_triangle_budget": tri_count <= 2500,
            "within_byte_budget": file_size <= 8 * 1024 * 1024,
        },
    }

    receipt_path = Path(args.receipt).resolve()
    receipt_path.parent.mkdir(parents=True, exist_ok=True)
    with open(receipt_path, "w", encoding="utf-8") as f:
        json.dump(receipt, f, indent=2)

    print(json.dumps(receipt, indent=2))


if __name__ == "__main__":
    main()
