CREATE TABLE "engram_cards" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"memory_id" text NOT NULL,
	"scope" text NOT NULL,
	"summary" text NOT NULL,
	"labels" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"related_paths" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"related_tools" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"did_you_mean" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"source_refs" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"embedding_id" text,
	"qdrant_point_id" text,
	"ttl_seconds" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "engram_cards_memory_id_uq" UNIQUE("memory_id")
);
--> statement-breakpoint
CREATE TABLE "intent_eval_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"run_id" text NOT NULL,
	"user_query" text NOT NULL,
	"predicted_intent" text NOT NULL,
	"confidence" real NOT NULL,
	"selected_cards" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"selected_clusters" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"cache_hit" boolean DEFAULT false NOT NULL,
	"user_accepted" boolean,
	"correction_label" text,
	"reward" real,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "memory_registry" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"source_id" text NOT NULL,
	"chunk_id" text,
	"summary_id" text,
	"embedding_id" text,
	"cluster_id" text,
	"packet_id" text,
	"memory_id" text,
	"feature_family" text NOT NULL,
	"user_intent" text NOT NULL,
	"tags" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"hotness" real DEFAULT 0 NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "idx_engram_cards_scope" ON "engram_cards" USING btree ("scope");--> statement-breakpoint
CREATE INDEX "idx_intent_eval_runs_run_id" ON "intent_eval_runs" USING btree ("run_id");--> statement-breakpoint
CREATE INDEX "idx_intent_eval_runs_predicted_intent" ON "intent_eval_runs" USING btree ("predicted_intent");--> statement-breakpoint
CREATE INDEX "idx_memory_registry_source_id" ON "memory_registry" USING btree ("source_id");--> statement-breakpoint
CREATE INDEX "idx_memory_registry_feature_family" ON "memory_registry" USING btree ("feature_family");--> statement-breakpoint
CREATE INDEX "idx_memory_registry_user_intent" ON "memory_registry" USING btree ("user_intent");--> statement-breakpoint
CREATE INDEX "idx_memory_registry_memory_id" ON "memory_registry" USING btree ("memory_id");