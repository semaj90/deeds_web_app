-- Search Analytics Migration (0011)
-- Tables for the Search Intelligence dashboard + QLoRA training pipeline.
--
-- All statements use CREATE TABLE IF NOT EXISTS because chunk_hit_log,
-- query_variance_pairs, and rag_query_log may already exist from
-- drizzle/manual/rag_query_analytics.sql.
--
-- Safe to run multiple times (idempotent).

--> statement-breakpoint
CREATE EXTENSION IF NOT EXISTS pg_trgm;

--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "chunk_hit_log" (
	"id"            bigserial PRIMARY KEY NOT NULL,
	"chunk_id"      text NOT NULL,
	"relative_path" text NOT NULL DEFAULT '',
	"gpu_cluster"   integer,
	"som_cluster"   integer,
	"pipeline"      text NOT NULL,
	"query_hash"    varchar(16) NOT NULL,
	"score"         real,
	"rerank_score"  real,
	"user_id"       uuid,
	"case_id"       uuid,
	"hit_at"        timestamp with time zone NOT NULL DEFAULT now()
);

--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "query_variance_pairs" (
	"id"           bigserial PRIMARY KEY NOT NULL,
	"query_hash_a" varchar(16) NOT NULL,
	"query_hash_b" varchar(16) NOT NULL,
	"query_a"      text NOT NULL,
	"query_b"      text NOT NULL,
	"similarity"   real NOT NULL,
	"hit_count"    integer NOT NULL DEFAULT 1,
	"pipeline"     text,
	"last_seen"    timestamp with time zone NOT NULL DEFAULT now()
);

--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "rag_query_log" (
	"id"                  uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id"             uuid,
	"case_id"             uuid,
	"query"               text NOT NULL,
	"query_hash"          varchar(16) NOT NULL,
	"entity_statutes"     jsonb NOT NULL DEFAULT '[]'::jsonb,
	"entity_cases"        jsonb NOT NULL DEFAULT '[]'::jsonb,
	"total_entity_tags"   integer NOT NULL DEFAULT 0,
	"total_found"         integer NOT NULL DEFAULT 0,
	"search_time_ms"      integer,
	"rerank_time_ms"      integer,
	"rerank_l0_hit"       boolean NOT NULL DEFAULT false,
	"rerank_l1_hits"      integer NOT NULL DEFAULT 0,
	"rerank_fresh_scored" integer NOT NULL DEFAULT 0,
	"top_chunk_id"        varchar(255),
	"top_chunk_score"     real,
	"top_rerank_score"    real,
	"dag_enabled"         boolean NOT NULL DEFAULT true,
	"dag_status"          varchar(20),
	"hybrid_search"       boolean NOT NULL DEFAULT false,
	"created_at"          timestamp with time zone NOT NULL DEFAULT now()
);

--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "qlora_examples" (
	"id"               uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"query_hash"       varchar(16) NOT NULL,
	"instruction"      text NOT NULL,
	"context_chunks"   jsonb NOT NULL DEFAULT '[]'::jsonb,
	"graph_summary"    text,
	"response"         text NOT NULL,
	"quality_tier"     varchar(20),
	"response_score"   real,
	"avg_rerank_score" real,
	"gpu_clusters"     jsonb NOT NULL DEFAULT '[]'::jsonb,
	"pipeline_hits"    jsonb NOT NULL DEFAULT '{}'::jsonb,
	"created_at"       timestamp with time zone NOT NULL DEFAULT now()
);

--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "response_feedback" (
	"id"         uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"query_hash" text NOT NULL,
	"user_id"    uuid,
	"rating"     varchar(4) NOT NULL,
	"pipeline"   text,
	"chunk_ids"  text[],
	"created_at" timestamp with time zone NOT NULL DEFAULT now()
);

--> statement-breakpoint
DO $$ BEGIN
 CREATE INDEX IF NOT EXISTS "chunk_hit_pipeline_cluster_idx"
   ON "chunk_hit_log" ("pipeline", "gpu_cluster", "hit_at" DESC);
EXCEPTION WHEN duplicate_table THEN null;
END $$;

--> statement-breakpoint
DO $$ BEGIN
 CREATE INDEX IF NOT EXISTS "chunk_hit_query_hash_idx"
   ON "chunk_hit_log" ("query_hash", "hit_at" DESC);
EXCEPTION WHEN duplicate_table THEN null;
END $$;

--> statement-breakpoint
DO $$ BEGIN
 CREATE UNIQUE INDEX IF NOT EXISTS "query_variance_pairs_pair_idx"
   ON "query_variance_pairs" (LEAST("query_hash_a", "query_hash_b"), GREATEST("query_hash_a", "query_hash_b"));
EXCEPTION WHEN duplicate_table THEN null;
END $$;

--> statement-breakpoint
DO $$ BEGIN
 CREATE INDEX IF NOT EXISTS "query_variance_pairs_a_idx"
   ON "query_variance_pairs" ("query_hash_a");
EXCEPTION WHEN duplicate_table THEN null;
END $$;

--> statement-breakpoint
DO $$ BEGIN
 CREATE INDEX IF NOT EXISTS "rag_query_log_user_created_idx"
   ON "rag_query_log" ("user_id", "created_at" DESC);
EXCEPTION WHEN duplicate_table THEN null;
END $$;

--> statement-breakpoint
DO $$ BEGIN
 CREATE INDEX IF NOT EXISTS "rag_query_log_hash_idx"
   ON "rag_query_log" ("query_hash");
EXCEPTION WHEN duplicate_table THEN null;
END $$;

--> statement-breakpoint
DO $$ BEGIN
 CREATE INDEX IF NOT EXISTS "qlora_examples_query_hash_idx"
   ON "qlora_examples" ("query_hash");
EXCEPTION WHEN duplicate_table THEN null;
END $$;

--> statement-breakpoint
DO $$ BEGIN
 CREATE INDEX IF NOT EXISTS "qlora_examples_quality_idx"
   ON "qlora_examples" ("quality_tier", "response_score");
EXCEPTION WHEN duplicate_table THEN null;
END $$;

--> statement-breakpoint
DO $$ BEGIN
 CREATE INDEX IF NOT EXISTS "qlora_examples_created_idx"
   ON "qlora_examples" ("created_at" DESC);
EXCEPTION WHEN duplicate_table THEN null;
END $$;

--> statement-breakpoint
DO $$ BEGIN
 CREATE INDEX IF NOT EXISTS "response_feedback_hash_idx"
   ON "response_feedback" ("query_hash");
EXCEPTION WHEN duplicate_table THEN null;
END $$;

--> statement-breakpoint
DO $$ BEGIN
 CREATE INDEX IF NOT EXISTS "response_feedback_user_idx"
   ON "response_feedback" ("user_id");
EXCEPTION WHEN duplicate_table THEN null;
END $$;

--> statement-breakpoint
DO $$ BEGIN
 CREATE UNIQUE INDEX IF NOT EXISTS "response_feedback_hash_user_idx"
   ON "response_feedback" ("query_hash", "user_id");
EXCEPTION WHEN duplicate_table THEN null;
END $$;

--> statement-breakpoint
-- Analytics query performance: covering index for Search Intelligence dashboard
DO $$ BEGIN
 CREATE INDEX IF NOT EXISTS "idx_chunk_hit_log_analytics"
   ON "chunk_hit_log" ("hit_at" DESC, "pipeline", "gpu_cluster", "chunk_id")
   INCLUDE ("query_hash", "rerank_score", "score", "relative_path");
EXCEPTION WHEN duplicate_table THEN null;
END $$;

--> statement-breakpoint
-- GiST trigram indexes for "did you mean" similarity scan
DO $$ BEGIN
 CREATE INDEX IF NOT EXISTS "idx_qvp_query_a_trgm"
   ON "query_variance_pairs" USING GiST ("query_a" gist_trgm_ops);
EXCEPTION WHEN duplicate_table THEN null;
END $$;

--> statement-breakpoint
DO $$ BEGIN
 CREATE INDEX IF NOT EXISTS "idx_qvp_query_b_trgm"
   ON "query_variance_pairs" USING GiST ("query_b" gist_trgm_ops);
EXCEPTION WHEN duplicate_table THEN null;
END $$;
