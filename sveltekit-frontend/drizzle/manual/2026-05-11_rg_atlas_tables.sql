-- drizzle/manual/2026-05-11_rg_atlas_tables.sql
-- Manual migration for RG-Atlas search pipeline tables.
-- Idempotent, includes GIN indexes for JSONB fields.

CREATE TABLE IF NOT EXISTS "rg_search_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"run_key" varchar(64) NOT NULL UNIQUE,
	"query" text NOT NULL,
	"args" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"diagnostics" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"cluster_count" integer,
	"user_id" integer REFERENCES "users"("id") ON DELETE SET NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "rg_runs_user_created" ON "rg_search_runs" ("user_id", "created_at");
CREATE INDEX IF NOT EXISTS "rg_runs_runkey" ON "rg_search_runs" ("run_key");

CREATE TABLE IF NOT EXISTS "rg_search_hits" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"run_id" uuid NOT NULL REFERENCES "rg_search_runs"("id") ON DELETE CASCADE,
	"file_path" text NOT NULL,
	"line_number" integer,
	"snippet" text,
	"source" varchar(16) NOT NULL,
	"scores" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"final_score" real DEFAULT 0 NOT NULL,
	"cluster_id" integer,
	"entities" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"rank" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "rg_hits_run_rank" ON "rg_search_hits" ("run_id", "rank");
CREATE INDEX IF NOT EXISTS "rg_hits_final_score" ON "rg_search_hits" ("final_score");
CREATE INDEX IF NOT EXISTS "rg_hits_cluster" ON "rg_search_hits" ("cluster_id");

-- GIN indexes for JSONB search/audit (Drizzle cannot natively express GIN on JSONB easily)
CREATE INDEX IF NOT EXISTS "rg_hits_scores_gin" ON "rg_search_hits" USING GIN ("scores");
CREATE INDEX IF NOT EXISTS "rg_hits_entities_gin" ON "rg_search_hits" USING GIN ("entities");
