CREATE TABLE "lora_training_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"run_id" text NOT NULL,
	"model_id" text NOT NULL,
	"base_model" text,
	"dataset_uri" text,
	"checkpoint_uri" text,
	"seaweed_object_key" text,
	"status" text DEFAULT 'planned' NOT NULL,
	"metrics_json" jsonb DEFAULT '{}'::jsonb,
	"config_json" jsonb DEFAULT '{}'::jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "scenario_cache" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"query_hash" text NOT NULL,
	"pipeline_key" varchar(255) NOT NULL,
	"qdrant_collection" varchar(200),
	"qdrant_point_ids" jsonb DEFAULT '[]'::jsonb,
	"context_chunks" jsonb DEFAULT '[]'::jsonb,
	"cached_result" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"ttl_seconds" integer DEFAULT 3600 NOT NULL,
	"expires_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "case_chunks" ALTER COLUMN "id" SET DATA TYPE serial;--> statement-breakpoint
ALTER TABLE "case_chunks" ALTER COLUMN "id" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "agent_memory_observations" ALTER COLUMN "source" SET DATA TYPE text;--> statement-breakpoint
ALTER TABLE "agent_memory_observations" ALTER COLUMN "source" SET DEFAULT 'claude-mem';--> statement-breakpoint
ALTER TABLE "agent_memory_observations" ALTER COLUMN "ide" SET DATA TYPE text;--> statement-breakpoint
ALTER TABLE "agent_memory_observations" ALTER COLUMN "ide" SET DEFAULT 'opencode';--> statement-breakpoint
ALTER TABLE "agent_memory_observations" ALTER COLUMN "embedding_model" SET DATA TYPE text;--> statement-breakpoint
ALTER TABLE "agent_memory_observations" ALTER COLUMN "embedding_model" SET DEFAULT 'embeddinggemma:latest';--> statement-breakpoint
ALTER TABLE "chat_embeddings" ALTER COLUMN "id" SET DATA TYPE serial;--> statement-breakpoint
ALTER TABLE "chat_embeddings" ALTER COLUMN "id" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "chat_embeddings" ALTER COLUMN "embedding" SET DATA TYPE vector(384);--> statement-breakpoint
ALTER TABLE "document_chunks" ALTER COLUMN "document_id" SET DATA TYPE text;--> statement-breakpoint
ALTER TABLE "intent_synthesis" ALTER COLUMN "reward_score" SET DATA TYPE numeric;--> statement-breakpoint
ALTER TABLE "persons_of_interest" ALTER COLUMN "created_by" SET DATA TYPE integer;--> statement-breakpoint
ALTER TABLE "case_chunks" ADD COLUMN "chunk_text" text NOT NULL;--> statement-breakpoint
ALTER TABLE "case_chunks" ADD COLUMN "chunk_source" text NOT NULL;--> statement-breakpoint
ALTER TABLE "case_chunks" ADD COLUMN "chunk_embedding_id" integer;--> statement-breakpoint
ALTER TABLE "case_chunks" ADD COLUMN "chunk_embedding" vector(384);--> statement-breakpoint
ALTER TABLE "case_chunks" ADD COLUMN "chunk_metadata" jsonb;--> statement-breakpoint
ALTER TABLE "chunk_hit_log" ADD COLUMN "promotion_state" text;--> statement-breakpoint
ALTER TABLE "chunk_hit_log" ADD COLUMN "promotion_boost" real;--> statement-breakpoint
ALTER TABLE "chunk_hit_log" ADD COLUMN "base_score" real;--> statement-breakpoint
ALTER TABLE "chat_embeddings" ADD COLUMN "text" text NOT NULL;--> statement-breakpoint
ALTER TABLE "cluster_cards" ADD COLUMN "source_refs" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "cluster_cards" ADD COLUMN "method_anchors" text[] DEFAULT '{}'::text[] NOT NULL;--> statement-breakpoint
ALTER TABLE "cluster_cards" ADD COLUMN "summary_hints" text[] DEFAULT '{}'::text[] NOT NULL;--> statement-breakpoint
ALTER TABLE "document_chunks" ADD COLUMN "embedding" vector(384);--> statement-breakpoint
ALTER TABLE "glyph_records" ADD COLUMN "source_ref" text;--> statement-breakpoint
ALTER TABLE "glyph_records" ADD COLUMN "glyph_kind" text;--> statement-breakpoint
ALTER TABLE "glyph_records" ADD COLUMN "embedding_model" text DEFAULT 'embeddinggemma:latest' NOT NULL;--> statement-breakpoint
ALTER TABLE "glyph_records" ADD COLUMN "batch_id" text;--> statement-breakpoint
ALTER TABLE "llm_synthesis_events" ADD COLUMN "routing_hints" jsonb DEFAULT '{}'::jsonb NOT NULL;--> statement-breakpoint
CREATE INDEX "chunk_hit_promotion_state_idx" ON "chunk_hit_log" USING btree ("promotion_state","hit_at");--> statement-breakpoint
CREATE INDEX "glyph_records_source_ref_idx" ON "glyph_records" USING btree ("source_ref");--> statement-breakpoint
CREATE INDEX "glyph_records_glyph_kind_idx" ON "glyph_records" USING btree ("glyph_kind");--> statement-breakpoint
CREATE INDEX "glyph_records_batch_id_idx" ON "glyph_records" USING btree ("batch_id");--> statement-breakpoint
ALTER TABLE "case_chunks" DROP COLUMN "chunk_index";--> statement-breakpoint
ALTER TABLE "case_chunks" DROP COLUMN "section_type";--> statement-breakpoint
ALTER TABLE "case_chunks" DROP COLUMN "section_subtype";--> statement-breakpoint
ALTER TABLE "case_chunks" DROP COLUMN "text";--> statement-breakpoint
ALTER TABLE "case_chunks" DROP COLUMN "embedding";--> statement-breakpoint
ALTER TABLE "case_chunks" DROP COLUMN "token_start";--> statement-breakpoint
ALTER TABLE "case_chunks" DROP COLUMN "token_end";--> statement-breakpoint
ALTER TABLE "case_chunks" DROP COLUMN "created_at";--> statement-breakpoint
ALTER TABLE "chat_embeddings" DROP COLUMN "rag_message_id";--> statement-breakpoint
ALTER TABLE "chat_embeddings" DROP COLUMN "model";