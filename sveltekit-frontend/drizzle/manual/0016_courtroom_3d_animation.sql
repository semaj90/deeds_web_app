-- Courtroom 3D Animation System
-- Timeline-driven 3D reconstruction with Mixamo-rigged models

DO $$ BEGIN
  CREATE TYPE "public"."courtroom_anim_type" AS ENUM (
    'idle', 'speaking', 'objection', 'walk', 'gesture', 'point', 'sit', 'stand',
    'present_evidence', 'react_surprised', 'react_angry', 'react_sad', 'nod', 'shake_head'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS "courtroom_models" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "name" varchar(100) NOT NULL,
  "role" varchar(50) NOT NULL,
  "model_url" varchar(500) NOT NULL,
  "thumbnail_url" varchar(500),
  "skeleton_type" varchar(50) NOT NULL DEFAULT 'mixamo',
  "scale_x" real NOT NULL DEFAULT 1,
  "scale_y" real NOT NULL DEFAULT 1,
  "scale_z" real NOT NULL DEFAULT 1,
  "metadata" jsonb DEFAULT '{}',
  "created_at" timestamptz DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "courtroom_animations" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "name" varchar(100) NOT NULL,
  "anim_type" "courtroom_anim_type" NOT NULL,
  "animation_url" varchar(500) NOT NULL,
  "duration_ms" integer NOT NULL,
  "loop" boolean NOT NULL DEFAULT false,
  "blend_weight" real NOT NULL DEFAULT 1,
  "skeleton_type" varchar(50) NOT NULL DEFAULT 'mixamo',
  "metadata" jsonb DEFAULT '{}',
  "created_at" timestamptz DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "courtroom_keyframes" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "session_id" varchar(64) NOT NULL,
  "time_ms" integer NOT NULL,
  "character_role" varchar(50) NOT NULL,
  "anim_type" "courtroom_anim_type" NOT NULL,
  "animation_id" uuid REFERENCES "courtroom_animations"("id"),
  "pos_x" real,
  "pos_y" real,
  "pos_z" real,
  "rot_y" real,
  "camera_view" varchar(50),
  "dialogue_turn" integer,
  "effect" varchar(50),
  "evidence_url" varchar(500),
  "phase" varchar(50),
  "metadata" jsonb DEFAULT '{}',
  "created_at" timestamptz DEFAULT now() NOT NULL
);

-- Indexes
CREATE INDEX IF NOT EXISTS "courtroom_models_role_idx" ON "courtroom_models" ("role");
CREATE INDEX IF NOT EXISTS "courtroom_anims_type_idx" ON "courtroom_animations" ("anim_type");
CREATE INDEX IF NOT EXISTS "courtroom_kf_session_time_idx" ON "courtroom_keyframes" ("session_id", "time_ms");
CREATE INDEX IF NOT EXISTS "courtroom_kf_session_role_idx" ON "courtroom_keyframes" ("session_id", "character_role");