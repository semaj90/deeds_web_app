"""
Blender script: batch convert ALL FBX files to GLB for courtroom 3D simulation.
Run with: "C:/Program Files/Blender Foundation/Blender 4.3/blender.exe" --background --python scripts/convert-fbx-to-glb.py

Converts all motion packs from downloads:
  - MotionLibrary_EricJacobus: talking, gestures, pointing, action mocap
  - MotionLibrary_WalkCycles: carry, reveal, limp, drunk, zombie walks
  - WALK-RUN-CYCLES-MOCAP: walk/run cycles (Mixamo-rigged)
  - Rokoko Magic Pack: dramatic gestures (objection-style)
  - alice.fbx: standalone character model
  - Amica room GLBs: courtroom environment bases

Output goes to: static/models/courtroom/
"""

import bpy
import os
import sys
import shutil

# ── Configuration ──
DOWNLOADS = "C:/Users/james/Music/downlaods_openfolder"
OUTPUT_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "static", "models", "courtroom")

# ALL FBX/GLB files to convert or copy
# Format: (source_path, output_name, anim_type)
FBX_FILES = [
    # ══════════════════════════════════════════════════════
    # Eric Jacobus Motion Library — talking, gestures, action
    # ══════════════════════════════════════════════════════
    (f"{DOWNLOADS}/MotionLibrary_EricJacobus (1)/20210714_s001_teaching_Guestures_tk01_ERJA-mvn001.fbx",
     "gesture_teaching.glb", "gesture"),
    (f"{DOWNLOADS}/MotionLibrary_EricJacobus (1)/20210714_s002_crossStage_Talk_tk01_ERJA-mvn222.fbx",
     "speaking_crossstage.glb", "speaking"),
    (f"{DOWNLOADS}/MotionLibrary_EricJacobus (1)/20210714_s003_fingerWave_atAudience_tk01_ERJA-mvn002.fbx",
     "point_audience.glb", "point"),
    (f"{DOWNLOADS}/MotionLibrary_EricJacobus (1)/20210714_s004_walk_assaultRiffle_tk01_ERJA-mvn225.fbx",
     "walk_rifle.glb", "walk"),
    (f"{DOWNLOADS}/MotionLibrary_EricJacobus (1)/20210714_s005_runBackward_assultRiffle1_tk01_ERJA-mvn227.fbx",
     "run_backward_1.glb", "walk"),
    (f"{DOWNLOADS}/MotionLibrary_EricJacobus (1)/20210714_s006_runBackward_assultRiffle2_tk01_ERJA-mvn226.fbx",
     "run_backward_2.glb", "walk"),
    (f"{DOWNLOADS}/MotionLibrary_EricJacobus (1)/20210714_s007_runForward_assultRiffle_tk01_ERJA-mvn228.fbx",
     "run_forward_1.glb", "walk"),
    (f"{DOWNLOADS}/MotionLibrary_EricJacobus (1)/20210714_s007_runForward_assultRiffle_tk02_ERJA-mvn229.fbx",
     "run_forward_2.glb", "walk"),
    (f"{DOWNLOADS}/MotionLibrary_EricJacobus (1)/20210714_s008_sprintForward_assultRiffle_tk01_ERJA-mvn230.fbx",
     "sprint_forward.glb", "walk"),
    (f"{DOWNLOADS}/MotionLibrary_EricJacobus (1)/20210714_s009_runToSprint_swordCarry_tk01_ERJA-mvn231.fbx",
     "run_sprint_sword.glb", "walk"),
    (f"{DOWNLOADS}/MotionLibrary_EricJacobus (1)/20210714_s010_runJump_overObstacle_tk01_ERJA-mvn232.fbx",
     "run_jump_obstacle_1.glb", "gesture"),
    (f"{DOWNLOADS}/MotionLibrary_EricJacobus (1)/20210714_s010_runJump_overObstacle_tk02_ERJA-mvn233.fbx",
     "run_jump_obstacle_2.glb", "gesture"),

    # ══════════════════════════════════════════════════════
    # MotionLibrary_WalkCycles — character walks
    # ══════════════════════════════════════════════════════
    (f"{DOWNLOADS}/MotionLibrary_WalkCycles/20210714_s165_walkCarry_leftShoulder_tk01_ERJA-mvn237.fbx",
     "walk_carry_left.glb", "walk"),
    (f"{DOWNLOADS}/MotionLibrary_WalkCycles/20210714_s166_walkCarry_rightShoulder_tk01_ERJA-mvn238.fbx",
     "walk_carry_right.glb", "walk"),
    (f"{DOWNLOADS}/MotionLibrary_WalkCycles/20210715_s040_walkUp_angle_35Degree_tk02_ERJA-mvn320.fbx",
     "walk_uphill.glb", "walk"),
    (f"{DOWNLOADS}/MotionLibrary_WalkCycles/20210715_s202_walk_track_tk01_ERJA-mvn325.fbx",
     "walk_track.glb", "walk"),
    (f"{DOWNLOADS}/MotionLibrary_WalkCycles/20210715_s211_walk_jumpOneHanded_tk01_ERJA-mvn329.fbx",
     "walk_jump_1.glb", "gesture"),
    (f"{DOWNLOADS}/MotionLibrary_WalkCycles/20210715_s211_walk_jumpOneHanded_tk04_ERJA-mvn332.fbx",
     "walk_jump_2.glb", "gesture"),
    (f"{DOWNLOADS}/MotionLibrary_WalkCycles/20210715_s213_walk_reveal_tk01_ERJA-mvn333.fbx",
     "walk_reveal_1.glb", "gesture"),
    (f"{DOWNLOADS}/MotionLibrary_WalkCycles/20210715_s213_walk_reveal_tk02_ERJA-mvn334.fbx",
     "walk_reveal_2.glb", "gesture"),
    (f"{DOWNLOADS}/MotionLibrary_WalkCycles/20210715_s219_walk_limpCycle_tk01_ERJA-mvn344.fbx",
     "walk_limp.glb", "walk"),
    (f"{DOWNLOADS}/MotionLibrary_WalkCycles/20210715_s229_walkDrunk_tk01_ERJA-mvn356.fbx",
     "walk_drunk_1.glb", "walk"),
    (f"{DOWNLOADS}/MotionLibrary_WalkCycles/20210715_s229_walkDrunk_tk02_ERJA-mvn357.fbx",
     "walk_drunk_2.glb", "walk"),
    (f"{DOWNLOADS}/MotionLibrary_WalkCycles/20210715_s230_walkZombie_tk01_ERJA-mvn358.fbx",
     "walk_zombie.glb", "walk"),

    # ══════════════════════════════════════════════════════
    # WALK-RUN-CYCLES-MOCAP — Mixamo-rigged walk/run
    # ══════════════════════════════════════════════════════
    (f"{DOWNLOADS}/WALK-RUN-CYCLES-MOCAP/WALK-RUN-CYCLES-MOCAP/01walkforward_walkspline.fbx",
     "walk_forward_spline.glb", "walk"),
    (f"{DOWNLOADS}/WALK-RUN-CYCLES-MOCAP/WALK-RUN-CYCLES-MOCAP/02-walkforward.fbx",
     "walk_forward.glb", "walk"),
    (f"{DOWNLOADS}/WALK-RUN-CYCLES-MOCAP/WALK-RUN-CYCLES-MOCAP/03-walkspline.fbx",
     "walk_spline.glb", "walk"),
    (f"{DOWNLOADS}/WALK-RUN-CYCLES-MOCAP/WALK-RUN-CYCLES-MOCAP/04-running-out-of-frame.fbx",
     "run_exit.glb", "walk"),
    (f"{DOWNLOADS}/WALK-RUN-CYCLES-MOCAP/WALK-RUN-CYCLES-MOCAP/05-running-treadmill.fbx",
     "run_treadmill.glb", "walk"),
    (f"{DOWNLOADS}/WALK-RUN-CYCLES-MOCAP/WALK-RUN-CYCLES-MOCAP/06-runninginjured-treadmill.fbx",
     "run_injured_treadmill.glb", "walk"),
    (f"{DOWNLOADS}/WALK-RUN-CYCLES-MOCAP/WALK-RUN-CYCLES-MOCAP/07-runninginjured.fbx",
     "run_injured.glb", "walk"),
    (f"{DOWNLOADS}/WALK-RUN-CYCLES-MOCAP/WALK-RUN-CYCLES-MOCAP/08-Loop_HappyWalk_MIXAMO_769_segment.fbx",
     "walk_confident.glb", "walk"),
    (f"{DOWNLOADS}/WALK-RUN-CYCLES-MOCAP/WALK-RUN-CYCLES-MOCAP/09-SlowWalkForward_MIXAMO_769.fbx",
     "walk_slow.glb", "walk"),
    (f"{DOWNLOADS}/WALK-RUN-CYCLES-MOCAP/WALK-RUN-CYCLES-MOCAP/10-WalkCycle_01_MIXAMO_769.fbx",
     "walk_normal.glb", "walk"),
    (f"{DOWNLOADS}/WALK-RUN-CYCLES-MOCAP/WALK-RUN-CYCLES-MOCAP/11-WalkCycle_Cool_MIXAMO_WHS_segment.fbx",
     "walk_cool.glb", "walk"),
    (f"{DOWNLOADS}/WALK-RUN-CYCLES-MOCAP/WALK-RUN-CYCLES-MOCAP/12-WalkCycle_Pacing_MIXAMO_769.fbx",
     "walk_pacing.glb", "walk"),
    (f"{DOWNLOADS}/WALK-RUN-CYCLES-MOCAP/WALK-RUN-CYCLES-MOCAP/13-WalkingIntoWind01_MIXAMO_769.fbx",
     "walk_wind_1.glb", "walk"),
    (f"{DOWNLOADS}/WALK-RUN-CYCLES-MOCAP/WALK-RUN-CYCLES-MOCAP/14-WalkingIntoWind02_MIXAMO_769.fbx",
     "walk_wind_2.glb", "walk"),
    (f"{DOWNLOADS}/WALK-RUN-CYCLES-MOCAP/WALK-RUN-CYCLES-MOCAP/15-WalkingIntoWind03_MIXAMO_769.fbx",
     "walk_wind_3.glb", "walk"),
    (f"{DOWNLOADS}/WALK-RUN-CYCLES-MOCAP/WALK-RUN-CYCLES-MOCAP/16-WalkingIntoWind04_MIXAMO_769.fbx",
     "walk_wind_4.glb", "walk"),

    # ══════════════════════════════════════════════════════
    # Rokoko Magic Pack — ALL Mixamo-rigged dramatic gestures
    # ══════════════════════════════════════════════════════
    (f"{DOWNLOADS}/Rokoko-Wingardium-Leviosa-Magic-Mocap-Pack/MagicPack/Mixamo/WandSpells_mixamo.fbx",
     "objection_dramatic.glb", "objection"),
    (f"{DOWNLOADS}/Rokoko-Wingardium-Leviosa-Magic-Mocap-Pack/MagicPack/Mixamo/MagicSnaps_mixamo.fbx",
     "gesture_snap.glb", "gesture"),
    (f"{DOWNLOADS}/Rokoko-Wingardium-Leviosa-Magic-Mocap-Pack/MagicPack/Mixamo/DrStrangeMagic_mixamo.fbx",
     "gesture_dramatic.glb", "gesture"),
    (f"{DOWNLOADS}/Rokoko-Wingardium-Leviosa-Magic-Mocap-Pack/MagicPack/Mixamo/Fireballs_mixamo.fbx",
     "gesture_fireball.glb", "objection"),
    (f"{DOWNLOADS}/Rokoko-Wingardium-Leviosa-Magic-Mocap-Pack/MagicPack/Mixamo/ForceLevitationProjectiles_mixamo.fbx",
     "gesture_levitate.glb", "gesture"),
    (f"{DOWNLOADS}/Rokoko-Wingardium-Leviosa-Magic-Mocap-Pack/MagicPack/Mixamo/GiantEnergyBlast_mixamo.fbx",
     "objection_blast.glb", "objection"),
    (f"{DOWNLOADS}/Rokoko-Wingardium-Leviosa-Magic-Mocap-Pack/MagicPack/Mixamo/MagicExplosion_mixamo.fbx",
     "gesture_explosion.glb", "gesture"),
    (f"{DOWNLOADS}/Rokoko-Wingardium-Leviosa-Magic-Mocap-Pack/MagicPack/Mixamo/MagicShields_mixamo.fbx",
     "gesture_shield.glb", "gesture"),

    # ══════════════════════════════════════════════════════
    # Standalone character — alice.fbx
    # ══════════════════════════════════════════════════════
    ("C:/Users/james/Documents/alice.fbx",
     "character_alice.glb", "idle"),
]

# GLB files to copy directly (already in GLB format)
GLB_COPY = [
    ("C:/Users/james/Desktop/amica-master/public/room/bathroom.glb", "room_bathroom.glb"),
    ("C:/Users/james/Desktop/amica-master/public/room/myroom.glb", "room_myroom.glb"),
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
    print(f"FBX → GLB Full Motion Pack Converter")
    print(f"Output: {OUTPUT_DIR}")
    print(f"Total FBX files: {len(FBX_FILES)}")
    print(f"Total GLB copies: {len(GLB_COPY)}")
    print(f"{'='*60}\n")

    success = 0
    failed = 0
    skipped = 0

    # Convert FBX → GLB
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

    # Copy GLB files directly
    for src, dst_name in GLB_COPY:
        dst = os.path.join(OUTPUT_DIR, dst_name)
        if not os.path.exists(src):
            print(f"SKIP  {dst_name} — source not found: {src}")
            skipped += 1
            continue
        if os.path.exists(dst):
            print(f"SKIP  {dst_name} — already exists")
            skipped += 1
            continue
        shutil.copy2(src, dst)
        size_mb = os.path.getsize(dst) / (1024 * 1024)
        print(f"COPY  {dst_name} ({size_mb:.1f} MB)")
        success += 1

    print(f"\n{'='*60}")
    print(f"Done: {success} converted/copied, {failed} failed, {skipped} skipped")
    print(f"{'='*60}\n")

if __name__ == "__main__":
    main()
