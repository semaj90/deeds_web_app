CREATE TABLE IF NOT EXISTS "query_cache_metrics" (
	"query_hash" text PRIMARY KEY NOT NULL,
	"last_trace_id" text,
	"cache_namespace" text,
	"cache_hit_source" text,
	"access_count" integer DEFAULT 0 NOT NULL,
	"hit_count" integer DEFAULT 0 NOT NULL,
	"avg_latency_ms" double precision,
	"last_accessed" timestamp with time zone DEFAULT now() NOT NULL,
	"payload" jsonb DEFAULT '{}'::jsonb NOT NULL
);
--> statement-breakpoint
CREATE INDEX "idx_qcm_last_accessed" ON "query_cache_metrics" USING btree ("last_accessed");
--> statement-breakpoint
CREATE INDEX "idx_qcm_avg_latency" ON "query_cache_metrics" USING btree ("avg_latency_ms");
--> statement-breakpoint
CREATE INDEX "idx_qcm_namespace" ON "query_cache_metrics" USING btree ("cache_namespace");
--> statement-breakpoint
CREATE INDEX "idx_qcm_hit_source" ON "query_cache_metrics" USING btree ("cache_hit_source");
