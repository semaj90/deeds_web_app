"""Build an original, rigid-skinned Detective Mode guide using Blender 4.3+.

Run with Blender in background mode. Pass the output directory after --.
"""

import math
import sys
from pathlib import Path

import bpy


OUT = Path(sys.argv[sys.argv.index("--") + 1]).resolve()
OUT.mkdir(parents=True, exist_ok=True)
NAME = "detective-actor-v1"
PALETTE = [
    (39, 57, 62), (61, 81, 83), (25, 34, 40), (118, 125, 113),
    (231, 218, 187), (114, 42, 53), (215, 166, 86), (173, 112, 80),
    (209, 151, 108), (83, 54, 47), (47, 37, 35), (225, 230, 212),
    (40, 44, 41), (113, 156, 150), (184, 114, 90), (27, 27, 29),
]

bpy.ops.wm.read_factory_settings(use_empty=True)
scene = bpy.context.scene
scene.render.fps = 24
scene.frame_end = 49

bones = {
    "hips": (None, (0, 0, .87), (0, 0, 1.05)),
    "chest": ("hips", (0, 0, 1.05), (0, 0, 1.39)),
    "head": ("chest", (0, 0, 1.39), (0, 0, 1.73)),
}
for side, sign in [("L", 1), ("R", -1)]:
    bones.update({
        f"upper_arm.{side}": ("chest", (sign * .225, 0, 1.31), (sign * .285, 0, 1.03)),
        f"forearm.{side}": (f"upper_arm.{side}", (sign * .285, 0, 1.03), (sign * .306, -.012, .81)),
        f"hand.{side}": (f"forearm.{side}", (sign * .306, -.012, .81), (sign * .31, -.018, .69)),
        f"thigh.{side}": ("hips", (sign * .10, 0, .88), (sign * .10, -.007, .52)),
        f"shin.{side}": (f"thigh.{side}", (sign * .10, -.007, .52), (sign * .105, 0, .11)),
        f"foot.{side}": (f"shin.{side}", (sign * .105, 0, .11), (sign * .105, -.15, .045)),
    })

rig = bpy.data.objects.new("Detective Guide Rig", bpy.data.armatures.new("Detective Guide Bones"))
scene.collection.objects.link(rig)
bpy.context.view_layer.objects.active = rig
rig.select_set(True)
bpy.ops.object.mode_set(mode="EDIT")
for name, (parent, head, tail) in bones.items():
    bone = rig.data.edit_bones.new(name)
    bone.head, bone.tail = head, tail
    if parent:
        bone.parent = rig.data.edit_bones[parent]
bpy.ops.object.mode_set(mode="OBJECT")
rig.show_in_front = True
rig["purpose"] = "Illustrative case workspace guide"

vertices, faces, colors, weights = [], [], [], []


def piece(points, polygons, bone, ink):
    offset = len(vertices)
    vertices.extend(points)
    weights.extend([bone] * len(points))
    faces.extend(tuple(offset + index for index in polygon) for polygon in polygons)
    colors.extend([ink] * len(polygons))


def rings(bone, ink, sections, sides=8):
    points = [
        (x + rx * math.cos(math.tau * i / sides + math.pi / sides),
         y + ry * math.sin(math.tau * i / sides + math.pi / sides), z)
        for x, y, z, rx, ry in sections for i in range(sides)
    ]
    top = (len(sections) - 1) * sides
    polygons = [tuple(reversed(range(sides))), tuple(range(top, top + sides))]
    polygons.extend((base + i, base + (i + 1) % sides, base + sides + (i + 1) % sides, base + sides + i)
                    for base in range(0, top, sides) for i in range(sides))
    piece(points, polygons, bone, ink)


def box(bone, ink, x, y, z, width, depth, height):
    rings(bone, ink, [
        (x, y, z - height / 2, width / math.sqrt(2), depth / math.sqrt(2)),
        (x, y, z + height / 2, width / math.sqrt(2), depth / math.sqrt(2)),
    ], sides=4)


def chest_panel(ink, points):
    piece([(x, y, z) for x, z, y in points], [tuple(range(len(points)))], "chest", ink)


# Long coat, tucked cream shirt, oxblood tie and brass lapel badge.
rings("hips", 0, [(0, .015, .73, .23, .135), (0, 0, .86, .205, .125), (0, 0, 1.06, .198, .125)])
rings("chest", 0, [(0, 0, 1.04, .20, .126), (0, 0, 1.26, .247, .137), (0, .01, 1.37, .214, .111)])
chest_panel(4, [(-.089, 1.36, -.108), (-.042, 1.11, -.134), (.048, 1.11, -.134), (.092, 1.36, -.108)])
chest_panel(5, [(-.028, 1.335, -.118), (-.019, 1.17, -.139), (.00, 1.139, -.139), (.020, 1.17, -.139), (.026, 1.335, -.118)])
for sign in (-1, 1):
    chest_panel(1, [(sign * .09, 1.35, -.115), (sign * .044, 1.125, -.135),
                    (sign * .128, 1.26, -.139), (sign * .151, 1.31, -.129)])
box("chest", 6, .137, -.136, 1.267, .042, .013, .053)
box("hips", 9, -.18, -.09, .85, .11, .077, .17)
box("hips", 6, -.18, -.134, .877, .04, .008, .021)

# Face, swept hair, ears, glasses, pupils, nose and mouth.
rings("head", 7, [(0, 0, 1.33, .055, .058), (0, 0, 1.44, .061, .06)])
rings("head", 8, [(0, -.016, 1.417, .074, .072), (0, -.015, 1.47, .116, .099),
                 (0, 0, 1.592, .126, .104), (0, .006, 1.685, .103, .085)])
rings("head", 10, [(0, .036, 1.563, .128, .083), (0, .011, 1.663, .132, .106),
                  (.022, .017, 1.747, .088, .071), (.034, .026, 1.765, .058, .044)])
rings("head", 9, [(-.057, -.071, 1.626, .043, .016), (-.052, -.064, 1.707, .061, .052)])
for sign in (-1, 1):
    rings("head", 7, [(sign * .115, .004, 1.497, .018, .028), (sign * .118, .004, 1.564, .025, .026)], 6)
    box("head", 10, sign * .052, -.100, 1.568, .077, .017, .038)
    box("head", 13, sign * .052, -.110, 1.568, .061, .006, .024)
    box("head", 12, sign * .052, -.114, 1.566, .017, .005, .020)
box("head", 10, 0, -.107, 1.57, .027, .014, .012)
rings("head", 7, [(0, -.102, 1.513, .027, .021), (0, -.103, 1.55, .014, .014)], 6)
box("head", 9, 0, -.098, 1.475, .041, .010, .009)

for side, sign in [("L", 1), ("R", -1)]:
    arm, forearm, hand = (f"{joint}.{side}" for joint in ("upper_arm", "forearm", "hand"))
    thigh, shin, foot = (f"{joint}.{side}" for joint in ("thigh", "shin", "foot"))
    rings(arm, 0, [(sign * .285, 0, 1.015, .063, .063), (sign * .233, 0, 1.288, .083, .080), (sign * .214, 0, 1.34, .077, .061)])
    rings(forearm, 1, [(sign * .306, -.012, .812, .051, .049), (sign * .281, 0, 1.048, .066, .065)])
    box(forearm, 4, sign * .305, -.011, .825, .098, .089, .025)
    rings(hand, 3, [(sign * .31, -.018, .702, .037, .030), (sign * .31, -.016, .749, .053, .038),
                    (sign * .306, -.012, .805, .046, .041)], 6)
    box(hand, 3, sign * .271, -.043, .751, .035, .037, .069)
    rings(thigh, 2, [(sign * .10, -.007, .497, .082, .084), (sign * .10, 0, .905, .099, .101)])
    rings(shin, 2, [(sign * .105, 0, .10, .062, .059), (sign * .10, -.007, .535, .080, .076)])
    rings(foot, 15, [(sign * .105, -.052, .014, .080, .143), (sign * .105, -.047, .056, .078, .136),
                    (sign * .105, -.015, .122, .067, .091)])
# Pocket lens and notebook identify both hands in the inspection pose.
box("hand.R", 12, -.307, -.066, .755, .09, .085, .114)
box("hand.R", 13, -.307, -.114, .765, .069, .010, .063)
box("hand.L", 9, .31, -.061, .747, .106, .027, .129)
box("hand.L", 4, .31, -.063, .809, .092, .018, .012)

mesh = bpy.data.meshes.new("Detective Guide Mesh")
mesh.from_pydata(vertices, [], faces)
mesh.update()
actor = bpy.data.objects.new("Detective Guide", mesh)
scene.collection.objects.link(actor)
actor.parent = rig
actor["classification"] = "ILLUSTRATIVE_GUIDE"
for name in bones:
    actor.vertex_groups.new(name=name).add([i for i, joint in enumerate(weights) if joint == name], 1.0, "REPLACE")
actor.modifiers.new("Rigid joint skin", "ARMATURE").object = rig

atlas = bpy.data.images.new("Detective 64x64 Atlas", width=64, height=64)
pixels = []
dither_inks = {0: 2, 1: 0, 2: 15, 3: 1, 4: 11, 8: 7, 9: 10}
for y in range(64):
    for x in range(64):
        index = (y // 16) * 4 + x // 16
        if (x * 3 + y * 7) % 17 == 0:
            index = dither_inks.get(index, index)
        pixels.extend([channel / 255 for channel in PALETTE[index]] + [1])
atlas.pixels = pixels
atlas.filepath_raw = str(OUT / f"{NAME}-atlas.png")
atlas.file_format = "PNG"
atlas.save()
atlas.pack()
material = bpy.data.materials.new("Detective Palette")
material.use_nodes = True
shader = material.node_tree.nodes.get("Principled BSDF")
shader.inputs["Roughness"].default_value = .87
texture = material.node_tree.nodes.new("ShaderNodeTexImage")
texture.image, texture.interpolation = atlas, "Closest"
material.node_tree.links.new(texture.outputs["Color"], shader.inputs["Base Color"])
mesh.materials.append(material)
uv = mesh.uv_layers.new(name="Detective Atlas")
for polygon, ink in zip(mesh.polygons, colors):
    center_x, center_y = (ink % 4 * 16 + 8) / 64, (ink // 4 * 16 + 8) / 64
    for index, loop in enumerate(polygon.loop_indices):
        angle = math.tau * index / len(polygon.loop_indices)
        uv.data[loop].uv = center_x + .087 * math.cos(angle), center_y + .087 * math.sin(angle)


def clip(name, frame_poses):
    rig.animation_data_create()
    action = bpy.data.actions.new(name)
    action.use_fake_user = True
    rig.animation_data.action = action
    for frame, transforms in frame_poses:
        for bone in rig.pose.bones:
            bone.rotation_mode = "XYZ"
            bone.rotation_euler = tuple(math.radians(value) for value in transforms.get(bone.name, (0, 0, 0)))
            bone.keyframe_insert(data_path="rotation_euler", frame=frame, group=bone.name)
        hips = rig.pose.bones["hips"]
        hips.location = (0, transforms.get("hip_lift", 0), 0)
        hips.keyframe_insert(data_path="location", frame=frame, group="hips")
    return action


idle = clip("Idle", [(1, {}), (25, {"chest": (2, 0, -2), "head": (-3, 2, 2)}), (49, {})])
walk_a = {"thigh.L": (-26, 0, 0), "thigh.R": (28, 0, 0), "shin.L": (12, 0, 0),
          "upper_arm.L": (18, 0, 0), "upper_arm.R": (-18, 0, 0), "forearm.R": (-15, 0, 0)}
walk_b = {name[:-1] + ("R" if name.endswith("L") else "L"): pose for name, pose in walk_a.items()}
clip("Walk", [(1, walk_a), (7, {"shin.R": (18, 0, 0), "hip_lift": .035}),
              (13, walk_b), (19, {"shin.L": (18, 0, 0), "hip_lift": .035}), (25, walk_a)])
kneel = {"hip_lift": -.23, "chest": (29, 0, 0), "head": (14, 0, -8),
         "thigh.L": (-64, 0, 0), "shin.L": (48, 0, 0), "foot.L": (9, 0, 0),
         "thigh.R": (17, 0, 0), "shin.R": (62, 0, 0),
         "upper_arm.R": (-35, 0, 0), "forearm.R": (-38, 0, 0), "forearm.L": (-42, 0, 0)}
clip("Inspect", [(1, {}), (15, kneel), (34, {**kneel, "head": (19, 0, 7)}), (49, {})])
reach = {"chest": (9, 0, 4), "head": (9, 0, 8), "upper_arm.R": (-56, 0, 0),
         "forearm.R": (-41, 0, 0), "hand.R": (-10, 0, 0), "forearm.L": (-47, 0, 0)}
clip("Interact", [(1, {}), (14, reach), (26, reach), (41, {})])

rig.animation_data.action = idle
scene.frame_set(1)
bpy.ops.wm.save_as_mainfile(filepath=str(OUT / f"{NAME}.blend"))
bpy.ops.export_scene.gltf(
    filepath=str(OUT / f"{NAME}.glb"), export_format="GLB", export_extras=True,
    export_animation_mode="ACTIONS", export_anim_slide_to_zero=True, export_frame_range=False,
)
bpy.ops.export_scene.fbx(
    filepath=str(OUT / f"{NAME}.fbx"), object_types={"ARMATURE", "MESH"},
    bake_anim=True, bake_anim_use_all_actions=True, bake_anim_use_nla_strips=False,
    add_leaf_bones=False, path_mode="COPY", embed_textures=True,
)
mesh.calc_loop_triangles()
print(f"DETECTIVE_ACTOR vertices={len(vertices)} triangles={len(mesh.loop_triangles)} joints={len(bones)}")
