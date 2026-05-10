-- Admin AI Skills + Subagent Runs
-- Wires the orphaned schema/admin-ai-skills.ts shard to the database.
-- Safe: IF NOT EXISTS guards prevent duplicate-run errors.

CREATE TABLE IF NOT EXISTS "admin_ai_skills" (
  "id"             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "name"           TEXT NOT NULL UNIQUE,
  "description"    TEXT,
  "system_prompt"  TEXT NOT NULL,
  "tool_allowlist" TEXT[],
  "input_schema"   JSONB,
  "created_at"     TIMESTAMPTZ DEFAULT NOW(),
  "updated_at"     TIMESTAMPTZ DEFAULT NOW(),
  "created_by"     UUID,
  "is_system"      BOOLEAN DEFAULT FALSE
);

CREATE TABLE IF NOT EXISTS "admin_ai_subagent_runs" (
  "id"           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "skill_id"     UUID REFERENCES "admin_ai_skills"("id") ON DELETE SET NULL,
  "session_id"   UUID,
  "status"       TEXT NOT NULL,
  "mission"      TEXT NOT NULL,
  "result"       TEXT,
  "trace"        JSONB NOT NULL DEFAULT '[]'::jsonb,
  "tokens_used"  INTEGER DEFAULT 0,
  "created_at"   TIMESTAMPTZ DEFAULT NOW(),
  "completed_at" TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS admin_ai_skills_name_idx ON "admin_ai_skills"("name");
CREATE INDEX IF NOT EXISTS admin_ai_subagent_runs_skill_idx ON "admin_ai_subagent_runs"("skill_id");
CREATE INDEX IF NOT EXISTS admin_ai_subagent_runs_status_idx ON "admin_ai_subagent_runs"("status");
