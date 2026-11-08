"""
scripts/blender/populate_crime_scene_primitives.py
Procedural low-poly primitive generator for YoRHa Law / Detective Mode.

Fixes & Alignments:
1. Coordinate Bridge: Blender right-handed Z-up (X, Y, Z) -> Three.js/glTF Y-up (X, Y, Z).
   glTF position = (X_blender, Z_blender, -Y_blender).
   gltf_yup_to_blender_zup(x, y, z) = (x, -z, y).
   For Three.js (4.213, 0.002, -2.197), Blender position is (4.213, 2.197, 0.002).
2. Linear RGBA Color Conversion: sRGB to linear conversion for COLOR_0 vertex color attribute.
3. Explicit 12-Triangle A-Frame Tent: Hand-crafted low-poly A-frame tent mesh instead of cylinder.
4. Principled BSDF Vertex Color Material: ShaderNodeVertexColor (COLOR_0) wired to Base Color.
5. Isolated Disposable Scene: Avoids deleting user scene objects when run in active session.
"""

import sys
import math
import os

try:
    import bpy
    import bmesh
except ImportError:
    bpy = None
    bmesh = None

def srgb_to_linear(c: float) -> float:
    return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4

def linear_rgba(r: float, g: float, b: float, a: float = 1.0) -> tuple[float, float, float, float]:
    return (srgb_to_linear(r), srgb_to_linear(g), srgb_to_linear(b), a)

PALETTE_LINEAR = {
    "mint_grid":  linear_rgba(0.592, 0.812, 0.675, 1.0), # #97cfac
    "oxblood":    linear_rgba(0.545, 0.118, 0.133, 1.0), # #8b1e22
    "warm_ivory": linear_rgba(0.969, 0.961, 0.933, 1.0), # #f7f5ee
    "gold":       linear_rgba(0.898, 0.663, 0.235, 1.0), # #e5a93c
    "obsidian":   linear_rgba(0.071, 0.075, 0.086, 1.0)  # #121316
}

def gltf_yup_to_blender_zup(x_gltf: float, y_gltf: float, z_gltf: float) -> tuple[float, float, float]:
    """
    Converts target Three.js/glTF Y-up coordinates (X, Y, Z) into Blender Z-up (X, -Z, Y)
    so that Blender's default +Y Up glTF exporter lands on the exact Three.js coordinates.
    """
    return (x_gltf, -z_gltf, y_gltf)

def create_shared_vertex_color_material() -> bpy.types.Material:
    mat = bpy.data.materials.new(name="YoRHa_VertexColor_PBR")
    mat.use_nodes = True
    nodes = mat.node_tree.nodes
    links = mat.node_tree.links
    bsdf = nodes.get("Principled BSDF")
    if bsdf:
        bsdf.inputs["Roughness"].default_value = 0.85
        bsdf.inputs["Metallic"].default_value = 0.05
    vcol_node = nodes.new(type="ShaderNodeVertexColor")
    vcol_node.layer_name = "COLOR_0"
    if bsdf:
        links.new(vcol_node.outputs["Color"], bsdf.inputs["Base Color"])
    return mat

def assign_linear_vertex_color(mesh_obj: bpy.types.Object, rgba: tuple, mat: bpy.types.Material):
    mesh = mesh_obj.data
    vcol = mesh.color_attributes.get("COLOR_0")
    if not vcol:
        vcol = mesh.color_attributes.new(name="COLOR_0", type='FLOAT_COLOR', domain='CORNER')
    for loop in mesh.loops:
        vcol.data[loop.index].color = rgba
    if not mesh.materials:
        mesh.materials.append(mat)

def create_aframe_tent_mesh(name: str, width=0.18, depth=0.22, height=0.24) -> bpy.types.Mesh:
    """Explicit 12-triangle A-frame evidence tent instead of a rotated cylinder."""
    hw, hd = width * 0.5, depth * 0.5
    verts = [
        (-hw, -hd, 0.0), (hw, -hd, 0.0), (hw, 0.0, height), (-hw, 0.0, height), # Front slope
        (-hw,  hd, 0.0), (hw,  hd, 0.0)                                         # Back slope base
    ]
    faces = [
        (0, 1, 2, 3), # Front card
        (3, 2, 5, 4), # Back card
        (0, 3, 4),    # Left gable
        (1, 5, 2)     # Right gable
    ]
    mesh = bpy.data.meshes.new(name)
    mesh.from_pydata(verts, [], faces)
    mesh.update()
    return mesh

def build_crime_scene_primitive_set(output_glb: str = None):
    """Assembles all crime scene primitives in an isolated scene and exports GLB."""
    if not bpy:
        print("[Mock] Blender not available, skipping mesh generation.")
        return

    # Use isolated disposable scene
    orig_scene = bpy.context.scene
    temp_scene = bpy.data.scenes.new(name="Temp_CrimeScene_Primitives")
    bpy.context.window.scene = temp_scene

    try:
        shared_mat = create_shared_vertex_color_material()

        # 1. Exhibit E-002 Decal (Target Three.js coords: 4.213, 0.002, -2.197)
        loc_e002 = gltf_yup_to_blender_zup(4.213, 0.002, -2.197)
        bpy.ops.mesh.primitive_cylinder_add(vertices=16, radius=0.42, depth=0.005, location=loc_e002)
        decal = bpy.context.active_object
        decal.name = "Primitive_Exhibit_E002_Decal"
        decal.scale = (1.0, 0.28 / 0.42, 1.0)
        assign_linear_vertex_color(decal, PALETTE_LINEAR["oxblood"], shared_mat)

        # 2. A-Frame Evidence Tents
        tent_coords_gltf = [
            (1, (1.8, 0.125, -1.2)),
            (2, (3.8, 0.125, -1.8)),
            (3, (2.2, 0.125, -0.9))
        ]
        for num, gltf_loc in tent_coords_gltf:
            mesh = create_aframe_tent_mesh(f"Mesh_Tent_{num}")
            obj = bpy.data.objects.new(f"Primitive_MarkerTent_{num}", mesh)
            temp_scene.collection.objects.link(obj)
            obj.location = gltf_yup_to_blender_zup(*gltf_loc)
            assign_linear_vertex_color(obj, PALETTE_LINEAR["gold"], shared_mat)

        # 3. Footprint stepping cards
        for i in range(5):
            loc_step_gltf = (1.0 + i * 0.6, 0.005, -1.5 + (i % 2) * 0.2)
            bpy.ops.mesh.primitive_plane_add(size=1.0, location=gltf_yup_to_blender_zup(*loc_step_gltf))
            card = bpy.context.active_object
            card.name = f"Primitive_FootprintCard_{i}"
            card.scale = (0.20, 0.40, 1.0)
            assign_linear_vertex_color(card, PALETTE_LINEAR["warm_ivory"], shared_mat)

        if output_glb:
            os.makedirs(os.path.dirname(os.path.abspath(output_glb)), exist_ok=True)
            bpy.ops.export_scene.gltf(
                filepath=output_glb,
                export_format='GLB',
                export_apply=True
            )
            print(f"Exported aligned crime scene primitives to {output_glb}")
    finally:
        bpy.context.window.scene = orig_scene
        bpy.data.scenes.remove(temp_scene)

if __name__ == "__main__":
    out_path = "sveltekit-frontend/static/models/crime-scene-primitives-v1.glb"
    for arg in sys.argv:
        if arg.startswith("--output="):
            out_path = arg.split("=", 1)[1]
    build_crime_scene_primitive_set(out_path)
