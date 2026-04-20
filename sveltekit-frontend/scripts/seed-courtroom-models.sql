-- Seed courtroom_models and courtroom_animations tables
-- Run after: drizzle/0016_courtroom_3d_animation.sql
-- Usage: psql $DATABASE_URL -f scripts/seed-courtroom-models.sql

BEGIN;

-- ══════════════════════════════════════════════════════
-- 1. Default courtroom character models (procedural fallback)
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
   '{"description": "Default witness character", "fallback": "procedural"}')
ON CONFLICT DO NOTHING;

-- ══════════════════════════════════════════════════════
-- 2. Converted animation clips (FBX → GLB via Blender)
-- ══════════════════════════════════════════════════════

-- Eric Jacobus Motion Library — gestures and talking
INSERT INTO courtroom_animations (id, name, anim_type, animation_url, duration_ms, loop, blend_weight, skeleton_type)
VALUES
  (gen_random_uuid(), 'Teaching Gestures', 'gesture',
   '/models/courtroom/gesture_teaching.glb', 5000, false, 1.0, 'mixamo'),

  (gen_random_uuid(), 'Cross-Stage Speaking', 'speaking',
   '/models/courtroom/speaking_crossstage.glb', 8000, false, 1.0, 'mixamo'),

  (gen_random_uuid(), 'Point at Audience', 'point',
   '/models/courtroom/point_audience.glb', 6000, false, 1.0, 'mixamo')
ON CONFLICT DO NOTHING;

-- Walk/Run Cycles (Mixamo-rigged)
INSERT INTO courtroom_animations (id, name, anim_type, animation_url, duration_ms, loop, blend_weight, skeleton_type)
VALUES
  (gen_random_uuid(), 'Slow Walk Forward', 'walk',
   '/models/courtroom/walk_slow.glb', 2000, true, 1.0, 'mixamo'),

  (gen_random_uuid(), 'Normal Walk Cycle', 'walk',
   '/models/courtroom/walk_normal.glb', 1800, true, 1.0, 'mixamo'),

  (gen_random_uuid(), 'Pacing Walk', 'walk',
   '/models/courtroom/walk_pacing.glb', 2200, true, 1.0, 'mixamo'),

  (gen_random_uuid(), 'Confident Walk', 'walk',
   '/models/courtroom/walk_confident.glb', 1600, true, 1.0, 'mixamo')
ON CONFLICT DO NOTHING;

-- Rokoko Magic Pack — dramatic gestures (objection-style)
INSERT INTO courtroom_animations (id, name, anim_type, animation_url, duration_ms, loop, blend_weight, skeleton_type)
VALUES
  (gen_random_uuid(), 'Dramatic Objection', 'objection',
   '/models/courtroom/objection_dramatic.glb', 3000, false, 1.0, 'mixamo'),

  (gen_random_uuid(), 'Snap Gesture', 'gesture',
   '/models/courtroom/gesture_snap.glb', 2000, false, 1.0, 'mixamo'),

  (gen_random_uuid(), 'Dramatic Gesture', 'gesture',
   '/models/courtroom/gesture_dramatic.glb', 4000, false, 1.0, 'mixamo')
ON CONFLICT DO NOTHING;

-- ══════════════════════════════════════════════════════
-- 3. Procedural animation placeholders (empty URL = procedural)
-- ══════════════════════════════════════════════════════

INSERT INTO courtroom_animations (id, name, anim_type, animation_url, duration_ms, loop, blend_weight, skeleton_type)
VALUES
  (gen_random_uuid(), 'Idle Stand', 'idle',
   '', 0, true, 1.0, 'mixamo'),

  (gen_random_uuid(), 'Sit Down', 'sit',
   '', 1500, false, 1.0, 'mixamo'),

  (gen_random_uuid(), 'Stand Up', 'stand',
   '', 1500, false, 1.0, 'mixamo'),

  (gen_random_uuid(), 'Present Evidence', 'present_evidence',
   '', 2000, false, 1.0, 'mixamo'),

  (gen_random_uuid(), 'Surprised Reaction', 'react_surprised',
   '', 1000, false, 1.0, 'mixamo'),

  (gen_random_uuid(), 'Angry Reaction', 'react_angry',
   '', 1200, false, 1.0, 'mixamo'),

  (gen_random_uuid(), 'Sad Reaction', 'react_sad',
   '', 1500, false, 1.0, 'mixamo'),

  (gen_random_uuid(), 'Nod', 'nod',
   '', 800, false, 0.8, 'mixamo'),

  (gen_random_uuid(), 'Shake Head', 'shake_head',
   '', 1000, false, 0.8, 'mixamo')
ON CONFLICT DO NOTHING;

COMMIT;

-- Verify
SELECT 'courtroom_models' AS tbl, count(*) FROM courtroom_models
UNION ALL
SELECT 'courtroom_animations', count(*) FROM courtroom_animations;
