"""
Blender script: batch convert FBX files to GLB for courtroom 3D simulation.
Run with: "C:/Program Files/Blender Foundation/Blender 4.3/blender.exe" --background --python scripts/convert-fbx-to-glb.py

Converts selected courtroom-relevant animations from:
  - MotionLibrary_EricJacobus: talking, gestures, pointing
  - WALK-RUN-CYCLES-MOCAP: walk cycles (Mixamo-rigged)
  - Rokoko Magic Pack: dramatic gestures

Output goes to: static/models/courtroom/
"""

import bpy
import os
import sys

# ── Configuration ──
DOWNLOADS = "C:/Users/james/Music/downlaods_openfolder"
OUTPUT_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "static", "models", "courtroom")

# Courtroom-relevant FBX files to convert
# Format: (source_path, output_name, anim_type)
FBX_FILES = [
    # Eric Jacobus Motion Library — talking and gestures
    (f"{DOWNLOADS}/MotionLibrary_EricJacobus (1)/20210714_s001_teaching_Guestures_tk01_ERJA-mvn001.fbx",
     "gesture_teaching.glb", "gesture"),
    (f"{DOWNLOADS}/MotionLibrary_EricJacobus (1)/20210714_s002_crossStage_Talk_tk01_ERJA-mvn222.fbx",
     "speaking_crossstage.glb", "speaking"),
    (f"{DOWNLOADS}/MotionLibrary_EricJacobus (1)/20210714_s003_fingerWave_atAudience_tk01_ERJA-mvn002.fbx",
     "point_audience.glb", "point"),

    # Walk/Run Cycles (Mixamo-rigged)
    (f"{DOWNLOADS}/WALK-RUN-CYCLES-MOCAP/WALK-RUN-CYCLES-MOCAP/09-SlowWalkForward_MIXAMO_769.fbx",
     "walk_slow.glb", "walk"),
    (f"{DOWNLOADS}/WALK-RUN-CYCLES-MOCAP/WALK-RUN-CYCLES-MOCAP/10-WalkCycle_01_MIXAMO_769.fbx",
     "walk_normal.glb", "walk"),
    (f"{DOWNLOADS}/WALK-RUN-CYCLES-MOCAP/WALK-RUN-CYCLES-MOCAP/12-WalkCycle_Pacing_MIXAMO_769.fbx",
     "walk_pacing.glb", "walk"),
    (f"{DOWNLOADS}/WALK-RUN-CYCLES-MOCAP/WALK-RUN-CYCLES-MOCAP/08-Loop_HappyWalk_MIXAMO_769_segment.fbx",
     "walk_confident.glb", "walk"),

    # Rokoko Magic Pack — dramatic gestures (objection-style)
    (f"{DOWNLOADS}/Rokoko-Wingardium-Leviosa-Magic-Mocap-Pack/MagicPack/Mixamo/WandSpells_mixamo.fbx",
     "objection_dramatic.glb", "objection"),
    (f"{DOWNLOADS}/Rokoko-Wingardium-Leviosa-Magic-Mocap-Pack/MagicPack/Mixamo/MagicSnaps_mixamo.fbx",
     "gesture_snap.glb", "gesture"),
    (f"{DOWNLOADS}/Rokoko-Wingardium-Leviosa-Magic-Mocap-Pack/MagicPack/Mixamo/DrStrangeMagic_mixamo.fbx",
     "gesture_dramatic.glb", "gesture"),
]

def clean_scene():
    """Remove all objects from the scene."""
    bpy.ops.object.select_all(action='SELECT')
    bpy.ops.object.delete(use_global=False)
    # Clear orphan data
    for block in bpy.data.meshes:
        if block.users == 0:
            bpy.data.meshes.remove(block)
    for block in bpy.data.armatures:
        if block.users == 0:
            bpy.data.armatures.remove(block)
    for block in bpy.data.actions:
        if block.users == 0:
            bpy.data.actions.remove(block)

def convert_fbx_to_glb(fbx_path, output_path):
    """Convert a single FBX file to GLB."""
    clean_scene()

    # Import FBX
    try:
        bpy.ops.import_scene.fbx(
            filepath=fbx_path,
            use_anim=True,
            anim_offset=1.0,
            use_custom_normals=True,
            force_connect_children=False,
            automatic_bone_orientation=True,
            primary_bone_axis='Y',
            secondary_bone_axis='X',
            ignore_leaf_bones=False,
        )
    except Exception as e:
        print(f"  ERROR importing {fbx_path}: {e}")
        return False

    # Export as GLB (binary glTF)
    try:
        bpy.ops.export_scene.gltf(
            filepath=output_path,
            export_format='GLB',
            export_animations=True,
            export_skins=True,
            export_morph=True,
            export_apply=False,
            export_texcoords=True,
            export_normals=True,
            export_cameras=False,
            export_lights=False,
            export_yup=True,
        )
        return True
    except Exception as e:
        print(f"  ERROR exporting {output_path}: {e}")
        return False

def main():
    os.makedirs(OUTPUT_DIR, exist_ok=True)

    print(f"\n{'='*60}")
    print(f"FBX → GLB Courtroom Animation Converter")
    print(f"Output: {OUTPUT_DIR}")
    print(f"{'='*60}\n")

    success = 0
    failed = 0
    skipped = 0

    for fbx_path, output_name, anim_type in FBX_FILES:
        output_path = os.path.join(OUTPUT_DIR, output_name)

        if not os.path.exists(fbx_path):
            print(f"SKIP  {output_name} — source not found: {fbx_path}")
            skipped += 1
            continue

        # Skip if already converted
        if os.path.exists(output_path):
            src_mtime = os.path.getmtime(fbx_path)
            dst_mtime = os.path.getmtime(output_path)
            if dst_mtime >= src_mtime:
                print(f"SKIP  {output_name} — already up to date")
                skipped += 1
                continue

        print(f"CONV  {output_name} ({anim_type}) ← {os.path.basename(fbx_path)}")

        if convert_fbx_to_glb(fbx_path, output_path):
            size_mb = os.path.getsize(output_path) / (1024 * 1024)
            print(f"  OK  {output_name} ({size_mb:.1f} MB)")
            success += 1
        else:
            failed += 1

    print(f"\n{'='*60}")
    print(f"Done: {success} converted, {failed} failed, {skipped} skipped")
    print(f"{'='*60}\n")

if __name__ == "__main__":
    main()
