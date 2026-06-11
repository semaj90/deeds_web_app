-- Phase 3D Retrieval Telemetry Tables
-- Created: 2026-06-11

-- Concept Records (metadata for semantic cards + lifecycle tracking)
-- Phase 3E: Engram-like memory system for compressed abstractions
CREATE TABLE IF NOT EXISTS "concept_records" (
	"concept_id" text PRIMARY KEY NOT NULL,
	"label" text,
	"evidence_cards" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"feature_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"packet_keys" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"success_count" integer DEFAULT 0 NOT NULL,
	"failure_count" integer DEFAULT 0 NOT NULL,
	"evidence" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"som_clusters" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"retrieval_count" integer DEFAULT 0 NOT NULL,
	"repair_success" double precision DEFAULT 1 NOT NULL,
	"retrieval_strategy" text DEFAULT 'fusion',
	"last_retrieved_at" timestamp with time zone,
	"concept_temperature" double precision DEFAULT 0.5,
	"strategy_distribution" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

-- Retrieval Telemetry (behavioral evidence for retrieval quality)
CREATE TABLE IF NOT EXISTS "retrieval_telemetry" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"query" text NOT NULL,
	"query_hash" text NOT NULL,
	"latency_ms" integer NOT NULL,
	"vector_hits" integer NOT NULL DEFAULT 0,
	"trigram_hits" integer NOT NULL DEFAULT 0,
	"fts_hits" integer NOT NULL DEFAULT 0,
	"selected_packet_key" text,
	"selected_packet_keys" jsonb NOT NULL DEFAULT '[]'::jsonb,
	"selected_feature_id" text,
	"feature_ids" jsonb NOT NULL DEFAULT '[]'::jsonb,
	"fusion_score" double precision,
	"cache_hit" boolean NOT NULL DEFAULT false,
	"surface" text NOT NULL,
	"environment" text NOT NULL,
	"retrieval_strategy" text NOT NULL DEFAULT 'fusion'
);

-- Indexes for retrieval_telemetry (descending createdAt for recent-first queries)
CREATE INDEX IF NOT EXISTS "idx_retrieval_telemetry_created_at"
ON "retrieval_telemetry"("created_at" DESC);

CREATE INDEX IF NOT EXISTS "idx_retrieval_telemetry_query_hash"
ON "retrieval_telemetry"("query_hash");

CREATE INDEX IF NOT EXISTS "idx_retrieval_telemetry_selected_packet_keys_gin"
ON "retrieval_telemetry" USING GIN("selected_packet_keys");

CREATE INDEX IF NOT EXISTS "idx_retrieval_telemetry_feature_ids_gin"
ON "retrieval_telemetry" USING GIN("feature_ids");

CREATE INDEX IF NOT EXISTS "idx_retrieval_telemetry_latency_ms"
ON "retrieval_telemetry"("latency_ms");

CREATE INDEX IF NOT EXISTS "idx_retrieval_telemetry_strategy"
ON "retrieval_telemetry"("retrieval_strategy");

CREATE INDEX IF NOT EXISTS "idx_retrieval_telemetry_surface"
ON "retrieval_telemetry"("surface");

CREATE INDEX IF NOT EXISTS "idx_retrieval_telemetry_environment"
ON "retrieval_telemetry"("environment");

-- Composite index for common retrieval_strategy + created_at queries
CREATE INDEX IF NOT EXISTS "idx_retrieval_telemetry_strategy_created"
ON "retrieval_telemetry"("retrieval_strategy", "created_at" DESC);

-- Indexes for concept_records lifecycle fields
CREATE INDEX IF NOT EXISTS "idx_concept_records_retrieval_strategy"
ON "concept_records"("retrieval_strategy");

CREATE INDEX IF NOT EXISTS "idx_concept_records_last_retrieved"
ON "concept_records"("last_retrieved_at" DESC);

CREATE INDEX IF NOT EXISTS "idx_concept_records_temperature"
ON "concept_records"("concept_temperature" DESC);

-- GIN index for strategy_distribution (JSONB key searching)
CREATE INDEX IF NOT EXISTS "idx_concept_records_strategy_dist_gin"
ON "concept_records" USING GIN("strategy_distribution");

-- Composite index for active concepts (temperature > 0.5, recently retrieved)
CREATE INDEX IF NOT EXISTS "idx_concept_records_active"
ON "concept_records"("concept_temperature" DESC, "last_retrieved_at" DESC);
