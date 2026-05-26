CREATE TABLE "token_map_cards" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"cache_key" text NOT NULL,
	"query" text NOT NULL,
	"model" text NOT NULL,
	"feature_key" text NOT NULL,
	"packet_state" text NOT NULL,
	"prompt_tokens" integer DEFAULT 0 NOT NULL,
	"completion_tokens" integer DEFAULT 0 NOT NULL,
	"total_tokens" integer DEFAULT 0 NOT NULL,
	"compressed_tokens" integer DEFAULT 0 NOT NULL,
	"bpe_waste_score" real DEFAULT 0 NOT NULL,
	"chunk_ids" text[] DEFAULT '{}'::text[] NOT NULL,
	"feature_keys" text[] DEFAULT '{}'::text[] NOT NULL,
	"graph_paths" text[] DEFAULT '{}'::text[] NOT NULL,
	"source_refs" text[] DEFAULT '{}'::text[] NOT NULL,
	"tool_policy" text DEFAULT 'read_only' NOT NULL,
	"answer_summary" text NOT NULL,
	"answer_hash" text,
	"qdrant_point_id" text,
	"turbovec_code" text,
	"next_actions" text[] DEFAULT '{}'::text[] NOT NULL,
	"cacheable" boolean DEFAULT true NOT NULL,
	"degraded" boolean DEFAULT false NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "token_map_cards_cache_key_uq" UNIQUE("cache_key")
);
--> statement-breakpoint
CREATE TABLE "agent_memory_observations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"source" varchar(100) DEFAULT 'claude-mem' NOT NULL,
	"ide" varchar(50) DEFAULT 'opencode',
	"session_id" text,
	"observation_id" text,
	"project_path" text,
	"summary" text NOT NULL,
	"tags" jsonb DEFAULT '[]'::jsonb,
	"source_refs" jsonb DEFAULT '[]'::jsonb,
	"tool_calls" jsonb DEFAULT '[]'::jsonb,
	"raw_json" jsonb DEFAULT '{}'::jsonb,
	"embedding" vector(768),
	"embedding_model" varchar(100) DEFAULT 'embeddinggemma:latest',
	"embedding_dim" integer DEFAULT 768,
	"qdrant_point_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "agent_observations" (
	"id" serial PRIMARY KEY NOT NULL,
	"session_type" text NOT NULL,
	"file_path" text,
	"observation_text" text NOT NULL,
	"char_interval_start" integer,
	"som_cluster_id" integer,
	"timestamp" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "intent_synthesis" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"query_hash" text,
	"context_pack_key" text,
	"authority" jsonb DEFAULT '{}'::jsonb,
	"source_refs" jsonb DEFAULT '[]'::jsonb,
	"chunk_ids" jsonb DEFAULT '[]'::jsonb,
	"summary_ids" jsonb DEFAULT '[]'::jsonb,
	"retrieval_trace" jsonb DEFAULT '{}'::jsonb,
	"cached_steps" jsonb DEFAULT '{}'::jsonb,
	"reward_score" real,
	"degraded" boolean DEFAULT false NOT NULL,
	"degraded_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "documents_atlas_entries" ADD COLUMN "som_bmu_row" integer;--> statement-breakpoint
ALTER TABLE "documents_atlas_entries" ADD COLUMN "som_bmu_col" integer;--> statement-breakpoint
ALTER TABLE "documents_atlas_entries" ADD COLUMN "audit_score" real;--> statement-breakpoint
ALTER TABLE "documents_atlas_entries" ADD COLUMN "dominant_tags" jsonb DEFAULT '[]'::jsonb;--> statement-breakpoint
ALTER TABLE "documents_atlas_entries" ADD COLUMN "toon" jsonb DEFAULT '{}'::jsonb;--> statement-breakpoint
ALTER TABLE "documents_atlas_entries" ADD COLUMN "source_refs" jsonb DEFAULT '[]'::jsonb;--> statement-breakpoint
ALTER TABLE "documents_atlas_entries" ADD COLUMN "chunk_ids" jsonb DEFAULT '[]'::jsonb;--> statement-breakpoint
ALTER TABLE "documents_atlas_entries" ADD COLUMN "cluster_tags" jsonb DEFAULT '[]'::jsonb;--> statement-breakpoint
ALTER TABLE "documents_atlas_entries" ADD COLUMN "parent_id" uuid;--> statement-breakpoint
ALTER TABLE "documents_atlas_entries" ADD COLUMN "feature_family" text;--> statement-breakpoint
ALTER TABLE "synthesis_logs" ADD COLUMN "cache_layer_used" text DEFAULT 'none' NOT NULL;--> statement-breakpoint
CREATE INDEX "idx_token_map_cards_query" ON "token_map_cards" USING btree ("query");--> statement-breakpoint
CREATE INDEX "idx_token_map_cards_model" ON "token_map_cards" USING btree ("model");--> statement-breakpoint
CREATE INDEX "idx_token_map_cards_feature_key" ON "token_map_cards" USING btree ("feature_key");--> statement-breakpoint
CREATE INDEX "idx_token_map_cards_packet_state" ON "token_map_cards" USING btree ("packet_state");--> statement-breakpoint
CREATE INDEX "agent_memory_observations_session_idx" ON "agent_memory_observations" USING btree ("session_id");--> statement-breakpoint
CREATE INDEX "agent_memory_observations_observation_idx" ON "agent_memory_observations" USING btree ("observation_id");--> statement-breakpoint
CREATE INDEX "agent_memory_observations_qdrant_idx" ON "agent_memory_observations" USING btree ("qdrant_point_id");--> statement-breakpoint
CREATE INDEX "agent_memory_observations_created_idx" ON "agent_memory_observations" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "agent_observations_som_idx" ON "agent_observations" USING btree ("som_cluster_id");--> statement-breakpoint
CREATE INDEX "agent_observations_ts_idx" ON "agent_observations" USING btree ("timestamp");