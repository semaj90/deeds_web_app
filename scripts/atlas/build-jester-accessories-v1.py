"""
Build the jester accessories (cap horns, halo, collar, both wings, staff, tail) as a GLB that hangs off Alice's bones.

Run (Blender 4.3, background):
  blender -b --python scripts/atlas/build-jester-accessories-v1.py -- <jester.obj> <alice.glb> <out.glb> <manifest.json> [preview.png]

The jester OBJ is a static prop at its own scale. This script (1) parses it by `o` order (the part identities were
render-verified on 2026-10-28, see sveltekit-frontend/src/lib/courtroom/jester-part-bone-table-v1.ts), (2) groups parts
into pivots that mirror JESTER_ACCESSORY_PIVOTS in jester-accessory-rig-v1.ts, (3) scales them to Alice and turns them 180
degrees about Y (the jester faces -z, Alice +z), and (4) anchors each group at the matching `J_Bip_*` bone of the given
Alice GLB. Each pivot node's geometry is local to its joint, so the scene can rotate the node about the joint. Chains
(cap horns, tail) are nested: link i is a child of link i-1.

The manifest lists, per root pivot, the Alice bone to parent it to and the offset from that bone. Alice's bone rest
rotations are measured here; if they are not near identity the offsets would need rotating, so the script prints the
deviation and the manifest records it.
"""
import json
import math
import struct
import sys

import bpy
import mathutils

argv = sys.argv[sys.argv.index("--") + 1 :]
OBJ, ALICE, OUT, MANIFEST = argv[:4]
PREVIEW = argv[4] if len(argv) > 4 else None

SCALE = 0.34  # jester head is 0.68 across; Alice's head is about 0.23
HEAD_CENTER_ABOVE_BONE = 0.09  # Alice head centre above the J_Bip_C_Head origin (metres)

# ---- parts -----------------------------------------------------------------------------------------------------------
V = []
parts = []
for line in open(OBJ):
    if line.startswith("v "):
        V.append(tuple(float(x) for x in line.split()[1:4]))
    elif line.startswith("o"):
        parts.append([])
    elif line.startswith("f ") and parts:
        parts[-1].append([int(t.split("/")[0]) - 1 for t in line.split()[1:]])
assert len(parts) == 81, len(parts)


def verts_of(i):
    return sorted({j for f in parts[i] for j in f})


def bbox_center(idx):
    pts = [V[j] for i in idx for j in verts_of(i)]
    return tuple((min(p[k] for p in pts) + max(p[k] for p in pts)) / 2 for k in range(3))


# ---- pivots (mirror of JESTER_ACCESSORY_PIVOTS) ----------------------------------------------------------------------
def chain(prefix, ps, bone, extra=()):
    return [
        {"id": f"{prefix}{i}", "bone": bone, "parts": ([p] + list(extra)) if i == 0 else [p], "follows": None if i == 0 else f"{prefix}{i-1}"}
        for i, p in enumerate(ps)
    ]


PIVOTS = (
    [{"id": "halo", "bone": "J_Bip_C_Head", "parts": [44], "follows": None}]
    + chain("capA", range(25, 32), "J_Bip_C_Head", extra=range(39, 44))
    + chain("capB", range(32, 39), "J_Bip_C_Head")
    + [
        {"id": "collar", "bone": "J_Bip_C_UpperChest", "parts": list(range(5, 21)), "follows": None},
        {"id": "wingAngel", "bone": "J_Bip_C_UpperChest", "parts": list(range(45, 55)), "follows": None},
        {"id": "wingDemon", "bone": "J_Bip_C_UpperChest", "parts": list(range(57, 65)), "follows": None},
        {"id": "staff", "bone": "J_Bip_R_Hand", "parts": [55, 56], "follows": None},
    ]
    + chain("tail", range(73, 81), "J_Bip_C_Hips")
)
assigned = [p for pv in PIVOTS for p in pv["parts"]]
assert len(assigned) == len(set(assigned)), "a part is in two pivots"

# ---- Alice bone world positions (glTF Y-up space) ----------------------------------------------------------------------
with open(ALICE, "rb") as fh:
    blob = fh.read()
jlen = struct.unpack("<I", blob[12:16])[0]
gltf = json.loads(blob[20 : 20 + jlen])
nodes = gltf["nodes"]
parent_of = {}
for i, n in enumerate(nodes):
    for c in n.get("children", []):
        parent_of[c] = i


def local_matrix(n):
    t = n.get("translation", [0, 0, 0])
    r = n.get("rotation", [0, 0, 0, 1])
    s = n.get("scale", [1, 1, 1])
    return mathutils.Matrix.LocRotScale(mathutils.Vector(t), mathutils.Quaternion((r[3], r[0], r[1], r[2])), mathutils.Vector(s))


def world_matrix(i):
    m = local_matrix(nodes[i])
    while i in parent_of:
        i = parent_of[i]
        m = local_matrix(nodes[i]) @ m
    return m


bone_world = {}
for i, n in enumerate(nodes):
    if n.get("name", "").startswith("J_Bip") and n["name"] not in bone_world:
        bone_world[n["name"]] = world_matrix(i)
deviation = {
    name: round(math.degrees(bone_world[name].to_quaternion().angle), 2)
    for name in ("J_Bip_C_Head", "J_Bip_C_UpperChest", "J_Bip_C_Hips", "J_Bip_R_Hand")
}
print("BONE_REST_ROTATION_DEG", deviation)


def bone_pos(name):
    return mathutils.Vector(bone_world[name].translation)


# ---- anchors: jester space -> Alice space ------------------------------------------------------------------------------
JESTER_HEAD = mathutils.Vector(bbox_center([21, 22]))
JESTER_CHEST = mathutils.Vector(bbox_center(range(5, 21)))
_torso = [V[j] for i in (0, 1) for j in verts_of(i)]
JESTER_HIPS = mathutils.Vector((sum(p[0] for p in _torso) / len(_torso), min(p[1] for p in _torso), sum(p[2] for p in _torso) / len(_torso)))
JESTER_STAFF = mathutils.Vector(bbox_center([55, 56]))

ANCHOR = {  # bone -> (jester anchor, alice anchor)
    "J_Bip_C_Head": (JESTER_HEAD, bone_pos("J_Bip_C_Head") + mathutils.Vector((0, HEAD_CENTER_ABOVE_BONE, 0))),
    "J_Bip_C_UpperChest": (JESTER_CHEST, bone_pos("J_Bip_C_UpperChest")),
    "J_Bip_C_Hips": (JESTER_HIPS, bone_pos("J_Bip_C_Hips")),
    "J_Bip_R_Hand": (JESTER_STAFF, bone_pos("J_Bip_R_Hand")),
}


def to_alice(bone, p):
    j, a = ANCHOR[bone]
    d = mathutils.Vector(p) - j
    return a + SCALE * mathutils.Vector((-d.x, d.y, -d.z))  # 180 degrees about Y


def joint_of(pv, prev_joint):
    """Joint (jester space): centroid of the vertices of the pivot's first part closest to where it attaches."""
    j, _a = ANCHOR[pv["bone"]]
    target = prev_joint if prev_joint is not None else j
    pts = [mathutils.Vector(V[k]) for k in verts_of(pv["parts"][0])]
    pts.sort(key=lambda q: (q - target).length)
    n = max(3, len(pts) // 10)
    return sum(pts[:n], mathutils.Vector()) / n


# ---- build Blender objects ---------------------------------------------------------------------------------------------
bpy.ops.wm.read_factory_settings(use_empty=True)
sc = bpy.context.scene
by_id = {}
joint_world = {}  # pivot id -> Alice-space joint position (glTF Y-up)
joint_jester = {}
manifest = {"scale": SCALE, "boneRestRotationDeg": deviation, "pivots": []}


def blender_xyz(v):  # glTF Y-up -> Blender Z-up
    return (v[0], -v[2], v[1])


root = bpy.data.objects.new("jester_accessories", None)
sc.collection.objects.link(root)
palette = {}
for pv in PIVOTS:
    prev = joint_jester.get(pv["follows"]) if pv["follows"] else None
    jj = joint_of(pv, prev)
    joint_jester[pv["id"]] = jj
    jw = to_alice(pv["bone"], jj)
    joint_world[pv["id"]] = jw
    empty = bpy.data.objects.new(pv["id"], None)
    sc.collection.objects.link(empty)
    by_id[pv["id"]] = empty
    if pv["follows"]:
        empty.parent = by_id[pv["follows"]]
        rel = jw - joint_world[pv["follows"]]
    else:
        empty.parent = root
        rel = jw - bone_pos(pv["bone"])
    empty.location = blender_xyz(rel)
    if pv["follows"]:
        manifest["pivots"].append({"id": pv["id"], "bone": pv["bone"], "parent": pv["follows"], "offset": [round(c, 5) for c in rel]})
    else:
        # Alice's bones are not all world-aligned at rest (see BONE_REST_ROTATION_DEG), so a root pivot parented to its bone
        # needs the offset in the bone's own frame and a counter-rotation, so the accessory stands world-aligned at rest.
        rb = bone_world[pv["bone"]].to_quaternion()
        inv = rb.inverted()
        local = inv @ mathutils.Vector(rel)
        manifest["pivots"].append({
            "id": pv["id"], "bone": pv["bone"], "parent": None,
            "offset": [round(c, 5) for c in local],
            "baseRotation": [round(inv.x, 6), round(inv.y, 6), round(inv.z, 6), round(inv.w, 6)],
        })
    # mesh: all parts of the pivot, vertices local to the joint
    vs, fs = [], []
    for part in pv["parts"]:
        used = verts_of(part)
        remap = {j: len(vs) + k for k, j in enumerate(used)}
        for j in used:
            w = to_alice(pv["bone"], V[j]) - jw
            vs.append(blender_xyz(w))
        for f in parts[part]:
            fs.append([remap[j] for j in f][::-1])  # the 180 degree turn mirrors x and z (a proper rotation), keep winding
    me = bpy.data.meshes.new(pv["id"] + "_mesh")
    me.from_pydata(vs, [], [f[::-1] for f in fs])
    me.update()
    ob = bpy.data.objects.new(pv["id"] + "_mesh", me)
    sc.collection.objects.link(ob)
    ob.parent = empty
    color = {"halo": (1, .85, .2, 1), "collar": (.9, .9, .95, 1), "wingAngel": (.95, .95, 1, 1), "wingDemon": (.35, .05, .1, 1), "staff": (.3, .2, .1, 1)}.get(
        pv["id"], (.75, .15, .55, 1) if pv["id"].startswith("cap") else (.35, .05, .1, 1)
    )
    if color not in palette:
        m = bpy.data.materials.new(f"acc{len(palette)}")
        m.use_nodes = True
        b = m.node_tree.nodes.get("Principled BSDF")
        b.inputs["Base Color"].default_value = color
        b.inputs["Roughness"].default_value = 0.9
        m.diffuse_color = color
        palette[color] = m
    me.materials.append(palette[color])
    for p in me.polygons:
        p.use_smooth = False

with open(MANIFEST, "w") as fh:
    json.dump(manifest, fh, indent=1)

for ob in bpy.data.objects:
    ob.select_set(False)
bpy.ops.export_scene.gltf(filepath=OUT, export_format="GLB", export_yup=True, export_apply=False, export_animations=False, export_cameras=False, export_lights=False)
print("EXPORTED", OUT, len(PIVOTS), "pivots")

# ---- preview: Alice + accessories --------------------------------------------------------------------------------------
if PREVIEW:
    # Place the pivots' world transform: the empties are parented to `root` at the origin, with offsets relative to the bone;
    # for the preview, move each root pivot to its bone's world position.
    for pv in PIVOTS:
        if pv["follows"] is None:
            by_id[pv["id"]].location = blender_xyz(joint_world[pv["id"]])
    bpy.ops.import_scene.gltf(filepath=ALICE)
    sc.render.engine = "BLENDER_WORKBENCH"
    sc.display.shading.light = "FLAT"
    sc.display.shading.color_type = "MATERIAL"
    sc.render.resolution_x, sc.render.resolution_y = 700, 800
    cam = bpy.data.cameras.new("c")
    cam.type = "ORTHO"
    cam.ortho_scale = 2.0
    co = bpy.data.objects.new("c", cam)
    sc.collection.objects.link(co)
    sc.camera = co
    co.location = (0, -8, 0.95)
    co.rotation_euler = (1.5708, 0, 0)
    sc.render.filepath = PREVIEW
    bpy.ops.render.render(write_still=True)
    co.location = (8, 0, 0.95)
    co.rotation_euler = (1.5708, 0, 1.5708)
    sc.render.filepath = PREVIEW.replace(".png", "_side.png")
    bpy.ops.render.render(write_still=True)
