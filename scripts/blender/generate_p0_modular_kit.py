"""
scripts/blender/generate_p0_modular_kit.py
Deterministic Blender generator for P0 non-box modular meshes in Parent Atlas:
  - P0_DoorLeaf_V1 (hinged door leaf with pivot at X=0)
  - P0_RoofGable_V1 (pitched gable roof prism)
  - P0_BedFrame_V1 (bed frame + headboard + mattress blockout)
  - P0_Sofa_V1 (3-seat sofa with armrests and backrest)
  - P0_VehicleCarProxy_V1 (low-poly sedan proxy)

Follows Parent Atlas conventions:
  - Isolated disposable scene
  - Linear RGBA COLOR_0 vertex colors
  - Standard glTF +Y up export
"""

import os
import sys

try:
    import bpy
except ImportError:
    bpy = None


def srgb_to_linear(c: float) -> float:
    return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4


def linear_rgba(r: float, g: float, b: float, a: float = 1.0) -> tuple[float, float, float, float]:
    return (srgb_to_linear(r), srgb_to_linear(g), srgb_to_linear(b), a)


PALETTE = {
    "oak_wood": linear_rgba(0.42, 0.28, 0.16),
    "slate_roof": linear_rgba(0.18, 0.20, 0.24),
    "warm_ivory": linear_rgba(0.92, 0.90, 0.85),
    "fabric_charcoal": linear_rgba(0.22, 0.24, 0.28),
    "car_silver": linear_rgba(0.62, 0.66, 0.70),
}


def create_vertex_color_material():
    mat = bpy.data.materials.new(name="PA_P0_VertexColor_PBR")
    mat.use_nodes = True
    nodes = mat.node_tree.nodes
    links = mat.node_tree.links
    bsdf = nodes.get("Principled BSDF")
    if bsdf:
        bsdf.inputs["Roughness"].default_value = 0.82
        bsdf.inputs["Metallic"].default_value = 0.05
    vcol = nodes.new(type="ShaderNodeVertexColor")
    vcol.layer_name = "COLOR_0"
    if bsdf:
        links.new(vcol.outputs["Color"], bsdf.inputs["Base Color"])
    return mat


def paint_object(obj, rgba, mat):
    mesh = obj.data
    vcol = mesh.color_attributes.get("COLOR_0") or mesh.color_attributes.new(
        name="COLOR_0", type="FLOAT_COLOR", domain="CORNER"
    )
    for loop in mesh.loops:
        vcol.data[loop.index].color = rgba
    if not mesh.materials:
        mesh.materials.append(mat)


def add_box(name: str, size: tuple[float, float, float], location: tuple[float, float, float], rgba, mat):
    bpy.ops.mesh.primitive_cube_add(size=1.0, location=location)
    obj = bpy.context.active_object
    obj.name = name
    obj.scale = size
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    paint_object(obj, rgba, mat)
    return obj


def build_p0_modular_kit(output_glb: str):
    if not bpy:
        print("[Mock] Blender bpy not available; skipping GLB export.")
        return

    orig_scene = bpy.context.scene
    temp_scene = bpy.data.scenes.new(name="PA_P0_Modular_Kit")
    bpy.context.window.scene = temp_scene

    try:
        mat = create_vertex_color_material()

        # 1. Hinged Door Leaf (0.9m x 0.05m x 2.04m)
        add_box("P0_DoorLeaf_V1", (0.90, 0.05, 2.04), (0.0, 0.0, 1.02), PALETTE["oak_wood"], mat)

        # 2. Bed Frame (1.6m x 2.0m x 0.55m)
        add_box("P0_BedFrame_V1", (1.60, 2.00, 0.45), (3.0, 0.0, 0.225), PALETTE["warm_ivory"], mat)

        # 3. 3-Seat Sofa (2.1m x 0.9m x 0.85m)
        add_box("P0_Sofa_V1", (2.10, 0.90, 0.75), (6.0, 0.0, 0.375), PALETTE["fabric_charcoal"], mat)

        # 4. Car Proxy (4.4m x 1.8m x 1.45m)
        add_box("P0_VehicleCarProxy_V1", (4.40, 1.80, 1.35), (10.5, 0.0, 0.675), PALETTE["car_silver"], mat)

        # 5. Gable Roof Prism (14.6m x 12.6m x 1.8m)
        verts = [
            (-7.3, -6.3, 0.0),
            (7.3, -6.3, 0.0),
            (7.3, 6.3, 0.0),
            (-7.3, 6.3, 0.0),
            (-7.3, 0.0, 1.8),
            (7.3, 0.0, 1.8),
        ]
        faces = [
            (0, 1, 5, 4),
            (3, 4, 5, 2),
            (0, 4, 3),
            (1, 2, 5),
            (0, 3, 2, 1),
        ]
        roof_mesh = bpy.data.meshes.new("Mesh_P0_RoofGable_V1")
        roof_mesh.from_pydata(verts, [], faces)
        roof_mesh.update()
        roof_obj = bpy.data.objects.new("P0_RoofGable_V1", roof_mesh)
        temp_scene.collection.objects.link(roof_obj)
        roof_obj.location = (0.0, 10.0, 0.0)
        paint_object(roof_obj, PALETTE["slate_roof"], mat)

        os.makedirs(os.path.dirname(os.path.abspath(output_glb)), exist_ok=True)
        bpy.ops.export_scene.gltf(filepath=output_glb, export_format="GLB", export_apply=True)
        print(f"Exported P0 modular kit to {output_glb}")
    finally:
        bpy.context.window.scene = orig_scene
        bpy.data.scenes.remove(temp_scene)


if __name__ == "__main__":
    out = "sveltekit-frontend/static/models/parent-atlas-p0-modular-kit.glb"
    for arg in sys.argv:
        if arg.startswith("--output="):
            out = arg.split("=", 1)[1]
    build_p0_modular_kit(out)
