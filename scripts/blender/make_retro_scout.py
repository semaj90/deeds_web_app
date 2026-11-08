"""Make an original low-poly robot and export a GLB.

Usage (Windows PowerShell):
  & $env:BLENDER_BIN --background --factory-startup --python blender/make_retro_scout.py -- --output public/retro-scout.glb

Does not need pip bpy: the script runs within the Blender executable.
"""
from __future__ import annotations
import argparse
import pathlib
import sys
import bpy


def parse_args():
    args = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
    parser = argparse.ArgumentParser()
    parser.add_argument('--output', default='public/retro-scout.glb')
    parser.add_argument('--save-blend', default=None)
    return parser.parse_args(args)


def material(name, color, roughness=0.62):
    m = bpy.data.materials.new(name)
    m.diffuse_color = (*color, 1.0)
    m.use_nodes = True
    bsdf = m.node_tree.nodes.get('Principled BSDF')
    bsdf.inputs['Base Color'].default_value = (*color, 1.0)
    bsdf.inputs['Metallic'].default_value = 0.0
    bsdf.inputs['Roughness'].default_value = roughness
    return m


def finish(obj, name, mat, position, scale):
    obj.name = name
    obj.location = position
    obj.scale = scale
    obj.data.materials.append(mat)
    # Transform applied so exported vertex geometry and normals are predictable.
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    for polygon in obj.data.polygons:
        polygon.use_smooth = False  # faceted triangles; toy shader can smooth through material choices later
    return obj


def ball(name, mat, position, scale, segments=12, rings=8):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=segments, ring_count=rings, location=(0, 0, 0))
    return finish(bpy.context.object, name, mat, position, scale)


def box(name, mat, position, scale):
    bpy.ops.mesh.primitive_cube_add(size=1, location=(0, 0, 0))
    return finish(bpy.context.object, name, mat, position, scale)


def cylinder(name, mat, position, scale, vertices=10):
    bpy.ops.mesh.primitive_cylinder_add(vertices=vertices, radius=0.5, depth=1.0, location=(0, 0, 0))
    return finish(bpy.context.object, name, mat, position, scale)


def make():
    bpy.ops.object.select_all(action='SELECT')
    bpy.ops.object.delete(use_global=False)
    for old in list(bpy.data.materials):
        bpy.data.materials.remove(old)

    navy = material('face_navy', (0.018, 0.085, 0.16))
    teal = material('body_turquoise', (0.015, 0.65, 0.58))
    cream = material('face_cream', (1.0, 0.76, 0.41))
    gold = material('trim_gold', (1.0, 0.42, 0.10))
    blush = material('cheek_coral', (1.0, 0.16, 0.24))
    white = material('eye_white', (0.95, 0.96, 0.85))
    parts = [
        ball('Body', teal, (0, 0, 1.12), (0.68, 0.48, 0.8)),
        ball('Helmet', cream, (0, 0, 2.06), (0.78, 0.62, 0.65)),
        box('Faceplate', navy, (0, -0.56, 2.06), (1.02, 0.16, 0.43)),
        ball('EyeLeft', white, (-0.24, -0.66, 2.13), (0.15, 0.09, 0.16)),
        ball('EyeRight', white, (0.24, -0.66, 2.13), (0.15, 0.09, 0.16)),
        ball('PupilLeft', navy, (-0.22, -0.74, 2.13), (0.065, 0.04, 0.08)),
        ball('PupilRight', navy, (0.26, -0.74, 2.13), (0.065, 0.04, 0.08)),
        cylinder('Antenna', gold, (0, 0, 2.71), (0.10, 0.10, 0.34)),
        ball('AntennaTip', blush, (0, 0, 2.92), (0.14, 0.14, 0.14), 10, 6),
        ball('ArmLeft', gold, (-0.78, 0, 1.22), (0.23, 0.23, 0.49), 10, 6),
        ball('ArmRight', gold, (0.78, 0, 1.22), (0.23, 0.23, 0.49), 10, 6),
        box('FootLeft', navy, (-0.34, -0.08, 0.36), (0.35, 0.57, 0.28)),
        box('FootRight', navy, (0.34, -0.08, 0.36), (0.35, 0.57, 0.28)),
        box('ChestBadge', cream, (0, -0.48, 1.12), (0.30, 0.08, 0.30)),
    ]
    bpy.ops.object.empty_add(type='PLAIN_AXES', location=(0, 0, 0))
    root = bpy.context.object
    root.name = 'RetroScout_Root'
    for part in parts:
        part.parent = root


def main():
    args = parse_args()
    make()
    dest = pathlib.Path(args.output).expanduser().resolve()
    dest.parent.mkdir(parents=True, exist_ok=True)
    if args.save_blend:
        blend = pathlib.Path(args.save_blend).expanduser().resolve()
        blend.parent.mkdir(parents=True, exist_ok=True)
        bpy.ops.wm.save_as_mainfile(filepath=str(blend))
    bpy.ops.export_scene.gltf(
        filepath=str(dest),
        export_format='GLB',
        export_cameras=False,
        export_lights=False,
        export_animations=False,
        export_yup=True,
    )
    print(f'PARENT_ATLAS_EXPORT_OK={dest}')


if __name__ == '__main__':
    main()
