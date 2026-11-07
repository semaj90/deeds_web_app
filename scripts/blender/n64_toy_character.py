"""Headless Blender: build an N64-budget toy character and export GLB for three.js.

Run:
  blender -b --python scripts/blender/n64_toy_character.py -- --out static/models/n64-toy.glb

N64-style constraints enforced here (documented hardware limits, not guesses):
  - Vertex-colour (Gouraud) shading, no PBR textures: palette baked to vertex colours.
  - Triangle budget per character (default 1200); script FAILS if exceeded.
  - Flat-ish look: low segment counts, no subdivision, normals auto-smoothed off.
  - Optional texture limit: 4 KB TMEM -> 32x32 RGBA16 max (not used by default).
Writes only the --out file. Never touches repo sources.
"""
import argparse
import sys

import bpy
import bmesh

TRI_BUDGET = 1200
PALETTE = {
    "body": (0.95, 0.55, 0.10, 1.0),   # toy orange
    "head": (0.98, 0.80, 0.60, 1.0),   # skin
    "eye": (0.05, 0.05, 0.05, 1.0),
    "boot": (0.35, 0.18, 0.08, 1.0),
    "cap": (0.85, 0.10, 0.10, 1.0),    # DK-style red accent
}


def parse():
    argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    p = argparse.ArgumentParser()
    p.add_argument("--out", required=True)
    p.add_argument("--budget", type=int, default=TRI_BUDGET)
    return p.parse_args(argv)


def paint(obj, rgba):
    """Bake one flat colour into a COLOR_0 vertex attribute (N64 Gouraud look)."""
    mesh = obj.data
    layer = mesh.color_attributes.new(name="Col", type="BYTE_COLOR", domain="CORNER")
    for i in range(len(mesh.loops)):
        layer.data[i].color = rgba


def prim(kind, loc, scale, color, **kw):
    getattr(bpy.ops.mesh, kind)(location=loc, **kw)
    o = bpy.context.active_object
    o.scale = scale
    bpy.ops.object.transform_apply(scale=True)
    paint(o, color)
    return o


def build():
    parts = [
        prim("primitive_uv_sphere_add", (0, 0, 1.0), (0.55, 0.45, 0.65), PALETTE["body"], segments=10, ring_count=6),
        prim("primitive_uv_sphere_add", (0, 0, 1.85), (0.45, 0.45, 0.45), PALETTE["head"], segments=10, ring_count=6),
        prim("primitive_cone_add", (0, 0, 2.2), (0.5, 0.5, 0.3), PALETTE["cap"], vertices=8),
        prim("primitive_uv_sphere_add", (-0.17, -0.40, 1.9), (0.07, 0.07, 0.09), PALETTE["eye"], segments=6, ring_count=4),
        prim("primitive_uv_sphere_add", (0.17, -0.40, 1.9), (0.07, 0.07, 0.09), PALETTE["eye"], segments=6, ring_count=4),
        prim("primitive_cube_add", (-0.25, 0, 0.2), (0.18, 0.28, 0.2), PALETTE["boot"]),
        prim("primitive_cube_add", (0.25, 0, 0.2), (0.18, 0.28, 0.2), PALETTE["boot"]),
        prim("primitive_uv_sphere_add", (-0.72, 0, 1.05), (0.2, 0.2, 0.2), PALETTE["head"], segments=6, ring_count=4),
        prim("primitive_uv_sphere_add", (0.72, 0, 1.05), (0.2, 0.2, 0.2), PALETTE["head"], segments=6, ring_count=4),
    ]
    for o in parts:
        o.select_set(True)
    bpy.context.view_layer.objects.active = parts[0]
    bpy.ops.object.join()
    obj = bpy.context.active_object
    obj.name = "N64ToyCharacter"
    bm = bmesh.new()
    bm.from_mesh(obj.data)
    bmesh.ops.triangulate(bm, faces=bm.faces[:])
    bm.to_mesh(obj.data)
    bm.free()
    for p in obj.data.polygons:
        p.use_smooth = False
    return obj


def main():
    a = parse()
    bpy.ops.wm.read_factory_settings(use_empty=True)
    obj = build()
    tris = len(obj.data.polygons)
    print(f"N64_TRIS={tris} budget={a.budget} verts={len(obj.data.vertices)}")
    if tris > a.budget:
        print("FAIL: over triangle budget", file=sys.stderr)
        sys.exit(2)
    bpy.ops.export_scene.gltf(
        filepath=a.out, export_format="GLB", use_selection=False,
        export_apply=True, export_vertex_color="ACTIVE", export_active_vertex_color_when_no_material=True,
        export_materials="NONE", export_yup=True,
    )
    print(f"WROTE {a.out}")


main()
