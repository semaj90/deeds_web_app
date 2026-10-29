"""
Export Alice from the artist's .blend as game-ready GLBs: full, N64-style and SNES-style.

Run (Blender 4.3, background, read-only on the .blend; nothing is saved back):
  blender -b <alice.blend> --python scripts/atlas/export-alice-variants-v1.py -- <full|n64|snes> <out.glb>

Why this exists: the earlier shipped GLB came from the plain glTF exporter, which dropped the VRM MToon textures and the
58 `Fcl_*` face shape keys, so Alice rendered white with no expressions. Here the MToon materials are rebuilt as plain
Principled materials (lit-colour texture or flat colour), the outline geometry-node modifiers are removed, the
spring-bone collider empties are dropped, and the `J_Bip_*` / `J_Sec_*` bone names are untouched (the retarget runtime,
idle pose and jester rig depend on them).

  full : original textures, all shape keys.
  n64  : ~1.8k triangles, no shape keys, 64x64 / 32x32 textures in 16 colours with 1-bit alpha, nearest filtering.
  snes : ~360 triangles, flat-shaded, 16x16 8-colour textures (32x32 for the face), nearest filtering. SNES hardware
         drew 3D characters with a handful of flat polygons (Star Fox style); this is that look, not a sprite sheet.
         A single flat colour per material was tried first and washed out (the atlases are mostly white).
"""
import sys
import bpy
import numpy as np

mode, out_path = sys.argv[sys.argv.index("--") + 1 : sys.argv.index("--") + 3]
assert mode in ("full", "n64", "snes"), mode

armature = next(o for o in bpy.data.objects if o.type == "ARMATURE")
meshes = [o for o in bpy.data.objects if o.type == "MESH"]

# 1. Drop MToon outline modifiers and collider empties (spring-bone helpers that are not part of the skinned model).
for o in meshes:
    for m in list(o.modifiers):
        if m.type == "NODES":
            o.modifiers.remove(m)
for o in [o for o in bpy.data.objects if o.type == "EMPTY"]:
    bpy.data.objects.remove(o, do_unlink=True)


# 2. Rebuild each MToon material as a plain Principled material.
def lit_image(mat):
    """The lit-colour texture: first image that is not a placeholder, matcap or the normal-map feed."""
    normals = set()
    for n in mat.node_tree.nodes:
        if n.bl_idname == "ShaderNodeGroup":
            for inp in n.inputs:
                if "Normal" in inp.name:
                    for l in inp.links:
                        if l.from_node.bl_idname == "ShaderNodeTexImage" and l.from_node.image:
                            normals.add(l.from_node.image.name)
    for n in mat.node_tree.nodes:
        if n.bl_idname == "ShaderNodeTexImage" and n.image:
            name = n.image.name
            if name.startswith(("Shader_", "Matcap")) or name in normals or name.endswith("_nml") or name.endswith("_out"):
                continue
            return n.image
    return None


def lit_color(mat):
    for n in mat.node_tree.nodes:
        if n.bl_idname == "ShaderNodeGroup":
            for inp in n.inputs:
                if "Lit Color" in inp.name and "Texture" not in inp.name and hasattr(inp, "default_value") and len(inp.default_value) == 4:
                    return tuple(inp.default_value)
    return (0.8, 0.8, 0.8, 1.0)


def average_color(img):
    """Dominant colour: largest of 3 k-means clusters over the opaque pixels (a plain mean washes out on atlases)."""
    px = np.array(img.pixels[:], dtype=np.float32).reshape(-1, 4)
    px = px[px[:, 3] > 0.5][:, :3]
    if len(px) == 0:
        return (0.8, 0.8, 0.8, 1.0)
    px = px[:: max(1, len(px) // 4096)]
    rng = np.random.default_rng(7)
    centers = px[rng.choice(len(px), size=min(3, len(px)), replace=False)]
    for _ in range(8):
        idx = np.argmin(((px[:, None, :] - centers[None]) ** 2).sum(-1), axis=1)
        for c in range(len(centers)):
            if (idx == c).any():
                centers[c] = px[idx == c].mean(0)
    idx = np.argmin(((px[:, None, :] - centers[None]) ** 2).sum(-1), axis=1)
    best = max(range(len(centers)), key=lambda c: (idx == c).sum())
    return (*centers[best], 1.0)


def kmeans_quantize(px, k, iters=8):
    rgb = px[:, :3]
    rng = np.random.default_rng(7)
    centers = rgb[rng.choice(len(rgb), size=min(k, len(rgb)), replace=False)]
    for _ in range(iters):
        idx = np.argmin(((rgb[:, None, :] - centers[None]) ** 2).sum(-1), axis=1)
        for c in range(len(centers)):
            sel = rgb[idx == c]
            if len(sel):
                centers[c] = sel.mean(0)
    idx = np.argmin(((rgb[:, None, :] - centers[None]) ** 2).sum(-1), axis=1)
    out = px.copy()
    out[:, :3] = centers[idx]
    out[:, 3] = (px[:, 3] >= 0.5).astype(np.float32)  # 1-bit alpha
    return out


def shrink(img, size, colors):
    """Resize to size x size, reduce to `colors` colours with 1-bit alpha, keep the result in memory and pack it."""
    img.scale(size, size)
    px = np.array(img.pixels[:], dtype=np.float32).reshape(-1, 4)
    px = kmeans_quantize(px, colors)
    img.pixels[:] = px.reshape(-1).tolist()
    img.pack()


face_main = None
alpha_materials = set()
used_images = {}
flat_colors = {}
for o in meshes:
    for slot in o.material_slots:
        mat = slot.material
        if mat is None or mat.name in used_images or mat.name in flat_colors:
            continue
        img = lit_image(mat)
        color = lit_color(mat)
        if img is None:
            flat_colors[mat.name] = color
        if img is not None:
            used_images[mat.name] = img
        if "Face_00_SKIN" in mat.name and img is not None:
            face_main = img

for o in meshes:
    for slot in o.material_slots:
        mat = slot.material
        if mat is None:
            continue
        img = used_images.get(mat.name)
        had_alpha = False
        if img is not None and mat.blend_method != "OPAQUE":
            had_alpha = float(np.array(img.pixels[:], dtype=np.float32)[3::4].min()) < 0.99  # real transparency only
        if had_alpha:
            alpha_materials.add(mat.name)
        mat.use_nodes = True
        nt = mat.node_tree
        for n in list(nt.nodes):
            nt.nodes.remove(n)
        out = nt.nodes.new("ShaderNodeOutputMaterial")
        bsdf = nt.nodes.new("ShaderNodeBsdfPrincipled")
        bsdf.inputs["Roughness"].default_value = 1.0
        bsdf.inputs["Specular IOR Level"].default_value = 0.0
        nt.links.new(bsdf.outputs["BSDF"], out.inputs["Surface"])
        if img is not None:
            tex = nt.nodes.new("ShaderNodeTexImage")
            tex.image = img
            if mode == "n64":
                tex.interpolation = "Closest"
            if mode == "snes":
                tex.interpolation = "Closest"
            nt.links.new(tex.outputs["Color"], bsdf.inputs["Base Color"])
            if had_alpha:
                nt.links.new(tex.outputs["Alpha"], bsdf.inputs["Alpha"])
                mat.blend_method = "CLIP"
                mat.alpha_threshold = 0.5
            else:
                mat.blend_method = "OPAQUE"
        else:
            bsdf.inputs["Base Color"].default_value = flat_colors.get(mat.name, (0.8, 0.8, 0.8, 1.0))
            mat.blend_method = "OPAQUE"

# 3. Variants.
def tri_count(o):
    return sum(len(p.vertices) - 2 for p in o.data.polygons)


def decimate(o, target_tris):
    arm_mods = [(m.object,) for m in o.modifiers if m.type == "ARMATURE"]
    for m in list(o.modifiers):
        o.modifiers.remove(m)
    if o.data.shape_keys:
        o.shape_key_clear()
    cur = tri_count(o)
    if cur > target_tris:
        d = o.modifiers.new("dec", "DECIMATE")
        d.ratio = max(0.001, target_tris / cur)
        bpy.context.view_layer.objects.active = o
        bpy.ops.object.modifier_apply(modifier=d.name)
    for (obj,) in arm_mods:
        a = o.modifiers.new("Armature", "ARMATURE")
        a.object = obj


if mode in ("n64", "snes"):
    targets = {"Body": 900, "Face": 450, "Hair": 450} if mode == "n64" else {"Body": 150, "Face": 80, "Hair": 70}
    for o in meshes:
        decimate(o, targets[o.name])
        if mode == "snes":
            for p in o.data.polygons:
                p.use_smooth = False
    size_for = lambda img: 64 if img.name in {i.name for i in used_images.values()} and img.size[0] >= 512 else 32
    for mat_name, img in list(used_images.items()):
        if mode == "n64":
            shrink(img, size_for(img), 16)
        else:
            shrink(img, 32 if img is face_main else 16, 8)

# 4. Export.
bpy.ops.object.select_all(action="DESELECT")
bpy.ops.export_scene.gltf(
    filepath=out_path,
    export_format="GLB",
    export_animations=False,
    export_skins=True,
    export_morph=(mode == "full"),
    export_morph_normal=False,
    export_image_format="AUTO",
    export_yup=True,
    export_apply=False,
    export_cameras=False,
    export_lights=False,
)
print("EXPORTED", mode, out_path, "tris", {o.name: tri_count(o) for o in meshes}, "images", sorted((i.name, tuple(i.size)) for i in used_images.values()))

# 5. The exporter writes alphaMode BLEND for every material that has an alpha link; cut-out materials should be MASK
#    (no sorting artefacts) and the rest OPAQUE. Patch the GLB JSON chunk in place.
import json, struct
with open(out_path, "rb") as fh:
    blob = bytearray(fh.read())
jlen, _ = struct.unpack("<II", blob[12:20])
doc = json.loads(blob[20 : 20 + jlen])
for m in doc.get("materials", []):
    name = m.get("name", "")
    if name in alpha_materials:
        m["alphaMode"] = "MASK"
        m["alphaCutoff"] = 0.5
    else:
        m.pop("alphaMode", None)
        m.pop("alphaCutoff", None)
new = json.dumps(doc, separators=(",", ":")).encode()
new += b" " * ((4 - len(new) % 4) % 4)
rest = blob[20 + jlen :]
total = 12 + 8 + len(new) + len(rest)
with open(out_path, "wb") as fh:
    fh.write(blob[:8] + struct.pack("<I", total) + struct.pack("<II", len(new), 0x4E4F534A) + new + rest)
print("ALPHA_MASK", sorted(alpha_materials))
