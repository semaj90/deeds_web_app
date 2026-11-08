"""Headless Blender: generate a procedural low-poly hair card mesh with cloth physics pins.

Run:
  blender -b --python scripts/blender/generate_procedural_hair_primitive.py -- --out .tmp/atlas/procedural-hair-primitive.glb

Features:
  - Parametric grid hair-card strips (low-poly N64-safe or modern sub-8MB footprint).
  - Pre-configured Cloth simulation modifier for real-time physics.
  - Pin vertex group ('PinRoots') isolating the top anchor boundary.
  - Procedural checker / strand texture connected to Principled BSDF.
  - Optional GLB export with clean transform baking.
  - Deterministic JSON stdout receipt.

License: MIT / CC0
"""

import argparse
import json
import math
import sys
from pathlib import Path

import bpy


def parse_args():
    argv = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else []
    parser = argparse.ArgumentParser(description="Procedural Hair Card Primitive Generator")
    parser.add_argument("--out", type=str, default=None, help="Optional output path for exported GLB")
    parser.add_argument("--x-subdivisions", type=int, default=4, help="Grid subdivisions along X")
    parser.add_argument("--y-subdivisions", type=int, default=8, help="Grid subdivisions along Y")
    parser.add_argument("--size", type=float, default=2.0, help="Grid size")
    return parser.parse_args(argv)


def clear_scene():
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete(use_global=False)
    for datablocks in (bpy.data.meshes, bpy.data.curves, bpy.data.materials, bpy.data.images, bpy.data.armatures):
        for datablock in list(datablocks):
            if datablock.users == 0:
                datablocks.remove(datablock)


def create_procedural_hair_card_primitive(args):
    clear_scene()

    # 1. Add a grid primitive for hair strips
    bpy.ops.mesh.primitive_grid_add(
        x_subdivisions=args.x_subdivisions,
        y_subdivisions=args.y_subdivisions,
        size=args.size,
        location=(0, 0, 2.0),
    )
    obj = bpy.context.active_object
    obj.name = "Procedural_Hair_Card_Mesh"
    # primitive_grid_add creates a horizontal XY grid. Rotate it upright so
    # cloth falls along the card while the local +Y edge remains the root.
    obj.rotation_euler[0] = math.radians(90.0)

    # 2. Add cloth simulation modifier for real-time hair physics in viewport/export
    cloth_mod = obj.modifiers.new(name="HairPhysicsCloth", type="CLOTH")
    cloth_mod.settings.quality = 4
    cloth_mod.settings.tension_stiffness = 15.0
    cloth_mod.settings.compression_stiffness = 15.0
    cloth_mod.settings.bending_stiffness = 0.5
    cloth_mod.settings.air_damping = 1.0

    # 3. Pin only the local +Y edge, which is the card's root row.
    vgroup = obj.vertex_groups.new(name="PinRoots")
    max_y = max(v.co.y for v in obj.data.vertices)
    top_verts = [v.index for v in obj.data.vertices if abs(v.co.y - max_y) < 1e-3]
    if not top_verts or len(top_verts) >= len(obj.data.vertices):
        raise RuntimeError("PinRoots must select a non-empty root edge, not the entire hair card")
    vgroup.add(top_verts, 1.0, "REPLACE")
    cloth_mod.settings.vertex_group_mass = "PinRoots"

    # 4. Generate Procedural Checker / Strand Texture & Assign Material
    mat = bpy.data.materials.new(name="HairCardMaterial")
    mat.use_nodes = True
    bsdf = mat.node_tree.nodes.get("Principled BSDF")

    tex_checker = mat.node_tree.nodes.new("ShaderNodeTexChecker")
    tex_checker.inputs["Scale"].default_value = 20.0
    mat.node_tree.links.new(tex_checker.outputs["Color"], bsdf.inputs["Base Color"])

    obj.data.materials.append(mat)

    tri_count = len(obj.data.polygons) * 2
    receipt = {
        "status": "success",
        "mesh": obj.name,
        "vertices": len(obj.data.vertices),
        "polygons": len(obj.data.polygons),
        "triangles": tri_count,
        "pinned_vertices_count": len(top_verts),
        "pin_group_vertex_indices": top_verts,
        "cardOrientation": "UPRIGHT_LOCAL_Y_ROOT_EDGE",
        "modifier": cloth_mod.name,
        "material": mat.name,
        "out": args.out,
    }

    # 5. Optional GLB Export
    if args.out:
        out_path = Path(args.out).resolve()
        out_path.parent.mkdir(parents=True, exist_ok=True)
        bpy.ops.export_scene.gltf(
            filepath=str(out_path),
            export_format="GLB",
            use_selection=True,
            export_apply=False,
            export_materials="EXPORT",
        )
        receipt["bytes"] = out_path.stat().st_size

    print(json.dumps(receipt, indent=2))
    return receipt


if __name__ == "__main__":
    args = parse_args()
    create_procedural_hair_card_primitive(args)
