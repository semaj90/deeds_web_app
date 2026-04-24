-- Seed courtroom_models and courtroom_animations tables
-- Run after: drizzle/0016_courtroom_3d_animation.sql
-- Usage: psql $DATABASE_URL -f scripts/seed-courtroom-models.sql
-- Idempotent: uses ON CONFLICT DO NOTHING, safe to re-run

BEGIN;

-- ══════════════════════════════════════════════════════
-- 1. Default courtroom character models
-- ══════════════════════════════════════════════════════

INSERT INTO courtroom_models (id, name, role, model_url, skeleton_type, scale_x, scale_y, scale_z, metadata)
VALUES
  (gen_random_uuid(), 'Prosecutor Default', 'prosecutor',
   '/models/courtroom/prosecutor_default.glb', 'mixamo', 1.0, 1.0, 1.0,
   '{"description": "Default prosecutor character", "fallback": "procedural"}'),
  (gen_random_uuid(), 'Defense Attorney Default', 'defense',
   '/models/courtroom/defense_default.glb', 'mixamo', 1.0, 1.0, 1.0,
   '{"description": "Default defense attorney character", "fallback": "procedural"}'),
  (gen_random_uuid(), 'Judge Default', 'judge',
   '/models/courtroom/judge_default.glb', 'mixamo', 1.0, 1.0, 1.0,
   '{"description": "Default judge character", "fallback": "procedural"}'),
  (gen_random_uuid(), 'Witness Default', 'witness',
   '/models/courtroom/witness_default.glb', 'mixamo', 1.0, 1.0, 1.0,
   '{"description": "Default witness character", "fallback": "procedural"}'),
  (gen_random_uuid(), 'Alice Character', 'witness',
   '/models/courtroom/character_alice.glb', 'mixamo', 1.0, 1.0, 1.0,
   '{"description": "Alice character model", "source": "alice.fbx"}')
ON CONFLICT DO NOTHING;

-- ══════════════════════════════════════════════════════
-- 2. Room / environment models
-- ══════════════════════════════════════════════════════

INSERT INTO courtroom_models (id, name, role, model_url, skeleton_type, scale_x, scale_y, scale_z, metadata)
VALUES
  (gen_random_uuid(), 'Room - Bathroom', 'environment',
   '/models/courtroom/room_bathroom.glb', 'static', 1.0, 1.0, 1.0,
   '{"description": "Bathroom environment from Amica", "source": "amica"}'),
  (gen_random_uuid(), 'Room - My Room', 'environment',
   '/models/courtroom/room_myroom.glb', 'static', 1.0, 1.0, 1.0,
   '{"description": "Room environment from Amica", "source": "amica"}')
ON CONFLICT DO NOTHING;

-- ══════════════════════════════════════════════════════
-- 3. Eric Jacobus Motion Library — gestures and talking
-- ══════════════════════════════════════════════════════

INSERT INTO courtroom_animations (id, name, anim_type, animation_url, duration_ms, loop, blend_weight, skeleton_type)
VALUES
  (gen_random_uuid(), 'Teaching Gestures', 'gesture',
   '/models/courtroom/gesture_teaching.glb', 5000, false, 1.0, 'mixamo'),
  (gen_random_uuid(), 'Cross-Stage Speaking', 'speaking',
   '/models/courtroom/speaking_crossstage.glb', 8000, false, 1.0, 'mixamo'),
  (gen_random_uuid(), 'Point at Audience', 'point',
   '/models/courtroom/point_audience.glb', 6000, false, 1.0, 'mixamo'),
  (gen_random_uuid(), 'Walk with Rifle', 'walk',
   '/models/courtroom/walk_rifle.glb', 3000, true, 1.0, 'mixamo'),
  (gen_random_uuid(), 'Run Backward 1', 'walk',
   '/models/courtroom/run_backward_1.glb', 2000, true, 1.0, 'mixamo'),
  (gen_random_uuid(), 'Run Backward 2', 'walk',
   '/models/courtroom/run_backward_2.glb', 2000, true, 1.0, 'mixamo'),
  (gen_random_uuid(), 'Run Forward 1', 'walk',
   '/models/courtroom/run_forward_1.glb', 2000, true, 1.0, 'mixamo'),
  (gen_random_uuid(), 'Run Forward 2', 'walk',
   '/models/courtroom/run_forward_2.glb', 2000, true, 1.0, 'mixamo'),
  (gen_random_uuid(), 'Sprint Forward', 'walk',
   '/models/courtroom/sprint_forward.glb', 1500, true, 1.0, 'mixamo'),
  (gen_random_uuid(), 'Run Sprint Sword', 'walk',
   '/models/courtroom/run_sprint_sword.glb', 2000, true, 1.0, 'mixamo'),
  (gen_random_uuid(), 'Run Jump Obstacle 1', 'gesture',
   '/models/courtroom/run_jump_obstacle_1.glb', 2500, false, 1.0, 'mixamo'),
  (gen_random_uuid(), 'Run Jump Obstacle 2', 'gesture',
   '/models/courtroom/run_jump_obstacle_2.glb', 2500, false, 1.0, 'mixamo')
ON CONFLICT DO NOTHING;

-- ══════════════════════════════════════════════════════
-- 4. MotionLibrary_WalkCycles — character walks
-- ══════════════════════════════════════════════════════

INSERT INTO courtroom_animations (id, name, anim_type, animation_url, duration_ms, loop, blend_weight, skeleton_type)
VALUES
  (gen_random_uuid(), 'Walk Carry Left Shoulder', 'walk',
   '/models/courtroom/walk_carry_left.glb', 2500, true, 1.0, 'mixamo'),
  (gen_random_uuid(), 'Walk Carry Right Shoulder', 'walk',
   '/models/courtroom/walk_carry_right.glb', 2500, true, 1.0, 'mixamo'),
  (gen_random_uuid(), 'Walk Uphill', 'walk',
   '/models/courtroom/walk_uphill.glb', 2500, true, 1.0, 'mixamo'),
  (gen_random_uuid(), 'Walk Track', 'walk',
   '/models/courtroom/walk_track.glb', 2000, true, 1.0, 'mixamo'),
  (gen_random_uuid(), 'Walk Jump 1', 'gesture',
   '/models/courtroom/walk_jump_1.glb', 2000, false, 1.0, 'mixamo'),
  (gen_random_uuid(), 'Walk Jump 2', 'gesture',
   '/models/courtroom/walk_jump_2.glb', 2000, false, 1.0, 'mixamo'),
  (gen_random_uuid(), 'Walk Reveal 1', 'gesture',
   '/models/courtroom/walk_reveal_1.glb', 3000, false, 1.0, 'mixamo'),
  (gen_random_uuid(), 'Walk Reveal 2', 'gesture',
   '/models/courtroom/walk_reveal_2.glb', 3000, false, 1.0, 'mixamo'),
  (gen_random_uuid(), 'Walk Limp', 'walk',
   '/models/courtroom/walk_limp.glb', 2500, true, 1.0, 'mixamo'),
  (gen_random_uuid(), 'Walk Drunk 1', 'walk',
   '/models/courtroom/walk_drunk_1.glb', 3000, true, 1.0, 'mixamo'),
  (gen_random_uuid(), 'Walk Drunk 2', 'walk',
   '/models/courtroom/walk_drunk_2.glb', 3000, true, 1.0, 'mixamo'),
  (gen_random_uuid(), 'Walk Zombie', 'walk',
   '/models/courtroom/walk_zombie.glb', 3000, true, 1.0, 'mixamo')
ON CONFLICT DO NOTHING;

-- ══════════════════════════════════════════════════════
-- 5. WALK-RUN-CYCLES-MOCAP — Mixamo walk/run cycles
-- ══════════════════════════════════════════════════════

INSERT INTO courtroom_animations (id, name, anim_type, animation_url, duration_ms, loop, blend_weight, skeleton_type)
VALUES
  (gen_random_uuid(), 'Walk Forward Spline', 'walk',
   '/models/courtroom/walk_forward_spline.glb', 3000, true, 1.0, 'mixamo'),
  (gen_random_uuid(), 'Walk Forward', 'walk',
   '/models/courtroom/walk_forward.glb', 2000, true, 1.0, 'mixamo'),
  (gen_random_uuid(), 'Walk Spline', 'walk',
   '/models/courtroom/walk_spline.glb', 3000, true, 1.0, 'mixamo'),
  (gen_random_uuid(), 'Run Exit', 'walk',
   '/models/courtroom/run_exit.glb', 2000, false, 1.0, 'mixamo'),
  (gen_random_uuid(), 'Run Treadmill', 'walk',
   '/models/courtroom/run_treadmill.glb', 1500, true, 1.0, 'mixamo'),
  (gen_random_uuid(), 'Run Injured Treadmill', 'walk',
   '/models/courtroom/run_injured_treadmill.glb', 2000, true, 1.0, 'mixamo'),
  (gen_random_uuid(), 'Run Injured', 'walk',
   '/models/courtroom/run_injured.glb', 2000, true, 1.0, 'mixamo'),
  (gen_random_uuid(), 'Confident Walk', 'walk',
   '/models/courtroom/walk_confident.glb', 1600, true, 1.0, 'mixamo'),
  (gen_random_uuid(), 'Slow Walk Forward', 'walk',
   '/models/courtroom/walk_slow.glb', 2000, true, 1.0, 'mixamo'),
  (gen_random_uuid(), 'Normal Walk Cycle', 'walk',
   '/models/courtroom/walk_normal.glb', 1800, true, 1.0, 'mixamo'),
  (gen_random_uuid(), 'Cool Walk', 'walk',
   '/models/courtroom/walk_cool.glb', 2000, true, 1.0, 'mixamo'),
  (gen_random_uuid(), 'Pacing Walk', 'walk',
   '/models/courtroom/walk_pacing.glb', 2200, true, 1.0, 'mixamo'),
  (gen_random_uuid(), 'Walking into Wind 1', 'walk',
   '/models/courtroom/walk_wind_1.glb', 2500, true, 1.0, 'mixamo'),
  (gen_random_uuid(), 'Walking into Wind 2', 'walk',
   '/models/courtroom/walk_wind_2.glb', 2500, true, 1.0, 'mixamo'),
  (gen_random_uuid(), 'Walking into Wind 3', 'walk',
   '/models/courtroom/walk_wind_3.glb', 2500, true, 1.0, 'mixamo'),
  (gen_random_uuid(), 'Walking into Wind 4', 'walk',
   '/models/courtroom/walk_wind_4.glb', 2500, true, 1.0, 'mixamo')
ON CONFLICT DO NOTHING;

-- ══════════════════════════════════════════════════════
-- 6. Rokoko Magic Pack — ALL dramatic gestures
-- ══════════════════════════════════════════════════════

INSERT INTO courtroom_animations (id, name, anim_type, animation_url, duration_ms, loop, blend_weight, skeleton_type)
VALUES
  (gen_random_uuid(), 'Dramatic Objection', 'objection',
   '/models/courtroom/objection_dramatic.glb', 3000, false, 1.0, 'mixamo'),
  (gen_random_uuid(), 'Snap Gesture', 'gesture',
   '/models/courtroom/gesture_snap.glb', 2000, false, 1.0, 'mixamo'),
  (gen_random_uuid(), 'Dramatic Gesture', 'gesture',
   '/models/courtroom/gesture_dramatic.glb', 4000, false, 1.0, 'mixamo'),
  (gen_random_uuid(), 'Fireball Gesture', 'objection',
   '/models/courtroom/gesture_fireball.glb', 3000, false, 1.0, 'mixamo'),
  (gen_random_uuid(), 'Levitation Gesture', 'gesture',
   '/models/courtroom/gesture_levitate.glb', 4000, false, 1.0, 'mixamo'),
  (gen_random_uuid(), 'Energy Blast Objection', 'objection',
   '/models/courtroom/objection_blast.glb', 3000, false, 1.0, 'mixamo'),
  (gen_random_uuid(), 'Explosion Gesture', 'gesture',
   '/models/courtroom/gesture_explosion.glb', 3000, false, 1.0, 'mixamo'),
  (gen_random_uuid(), 'Shield Gesture', 'gesture',
   '/models/courtroom/gesture_shield.glb', 3500, false, 1.0, 'mixamo')
ON CONFLICT DO NOTHING;

-- ══════════════════════════════════════════════════════
-- 7. Procedural animation placeholders (no GLB needed)
-- ══════════════════════════════════════════════════════

INSERT INTO courtroom_animations (id, name, anim_type, animation_url, duration_ms, loop, blend_weight, skeleton_type)
VALUES
  (gen_random_uuid(), 'Idle Stand', 'idle', '', 0, true, 1.0, 'mixamo'),
  (gen_random_uuid(), 'Sit Down', 'sit', '', 1500, false, 1.0, 'mixamo'),
  (gen_random_uuid(), 'Stand Up', 'stand', '', 1500, false, 1.0, 'mixamo'),
  (gen_random_uuid(), 'Present Evidence', 'present_evidence', '', 2000, false, 1.0, 'mixamo'),
  (gen_random_uuid(), 'Surprised Reaction', 'react_surprised', '', 1000, false, 1.0, 'mixamo'),
  (gen_random_uuid(), 'Angry Reaction', 'react_angry', '', 1200, false, 1.0, 'mixamo'),
  (gen_random_uuid(), 'Sad Reaction', 'react_sad', '', 1500, false, 1.0, 'mixamo'),
  (gen_random_uuid(), 'Nod', 'nod', '', 800, false, 0.8, 'mixamo'),
  (gen_random_uuid(), 'Shake Head', 'shake_head', '', 1000, false, 0.8, 'mixamo')
ON CONFLICT DO NOTHING;

COMMIT;

-- Verify
SELECT 'courtroom_models' AS tbl, count(*) FROM courtroom_models
UNION ALL
SELECT 'courtroom_animations', count(*) FROM courtroom_animations;