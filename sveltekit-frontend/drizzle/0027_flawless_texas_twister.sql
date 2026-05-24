CREATE TABLE "synthesis_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"run_id" text NOT NULL,
	"query_hash" text,
	"source_stage" text NOT NULL,
	"selected_nodes" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"selected_edges" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"selected_clusters" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"path_mapping" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"dynamic_imports" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"protocols" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"cache_trace" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"manifold4" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"summary" text,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
