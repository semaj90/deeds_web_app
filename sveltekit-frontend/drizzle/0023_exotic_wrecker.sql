ALTER TABLE "documents_atlas_entries" DROP CONSTRAINT "documents_atlas_entries_relative_path_unique";--> statement-breakpoint
ALTER TABLE "feature_index_entries" DROP CONSTRAINT "feature_index_entries_file_path_unique";--> statement-breakpoint
ALTER TABLE "documents_atlas_entries" ALTER COLUMN "tags" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "documents_atlas_entries" ALTER COLUMN "tags" SET DATA TYPE jsonb USING to_jsonb("tags");--> statement-breakpoint
ALTER TABLE "documents_atlas_entries" ALTER COLUMN "tags" SET DEFAULT '[]'::jsonb;--> statement-breakpoint
ALTER TABLE "documents_atlas_entries" ALTER COLUMN "languages" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "documents_atlas_entries" ALTER COLUMN "languages" SET DATA TYPE jsonb USING to_jsonb("languages");--> statement-breakpoint
ALTER TABLE "documents_atlas_entries" ALTER COLUMN "languages" SET DEFAULT '[]'::jsonb;--> statement-breakpoint
ALTER TABLE "documents_atlas_entries" ADD COLUMN "source_ref" text;--> statement-breakpoint
ALTER TABLE "documents_atlas_entries" ADD COLUMN "path" text;--> statement-breakpoint
ALTER TABLE "documents_atlas_entries" ADD COLUMN "keywords" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "documents_atlas_entries" ADD COLUMN "protocols" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "documents_atlas_entries" ADD COLUMN "libraries" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "documents_atlas_entries" ADD COLUMN "feature_families" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "feature_index_entries" ADD COLUMN "stable_key" text;--> statement-breakpoint
ALTER TABLE "feature_index_entries" ADD COLUMN "path" text;--> statement-breakpoint
ALTER TABLE "feature_index_entries" ADD COLUMN "programming_language" text;--> statement-breakpoint
ALTER TABLE "feature_index_entries" ADD COLUMN "feature_family" text;--> statement-breakpoint
ALTER TABLE "feature_index_entries" ADD COLUMN "labels" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "feature_index_entries" ADD COLUMN "protocol_detected" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "feature_index_entries" ADD COLUMN "route_kind" text;--> statement-breakpoint
ALTER TABLE "feature_index_entries" ADD COLUMN "sveltekit_route" text;--> statement-breakpoint
ALTER TABLE "feature_index_entries" ADD COLUMN "owning_library" text;--> statement-breakpoint
ALTER TABLE "feature_index_entries" ADD COLUMN "exported_symbols" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "feature_index_entries" ADD COLUMN "imported_symbols" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "feature_index_entries" ADD COLUMN "ast_relations" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "feature_index_entries" ADD COLUMN "cache_signals" jsonb DEFAULT '{}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "feature_index_entries" ADD COLUMN "recommendation" jsonb DEFAULT '{}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "retrieval_cache_traces" ADD COLUMN "run_id" text NOT NULL;--> statement-breakpoint
ALTER TABLE "retrieval_cache_traces" ADD COLUMN "query_hash" text NOT NULL;--> statement-breakpoint
ALTER TABLE "retrieval_cache_traces" ADD COLUMN "packet_id" text;--> statement-breakpoint
ALTER TABLE "retrieval_cache_traces" ADD COLUMN "hits" jsonb DEFAULT '{}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "retrieval_cache_traces" ADD COLUMN "selected" jsonb DEFAULT '{}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "retrieval_cache_traces" ADD COLUMN "token_estimate" integer;--> statement-breakpoint
ALTER TABLE "retrieval_cache_traces" ADD COLUMN "toon_bytes" integer;--> statement-breakpoint
ALTER TABLE "retrieval_cache_traces" ADD COLUMN "bifrost_model_id" text;--> statement-breakpoint
ALTER TABLE "retrieval_cache_traces" ADD COLUMN "latency_ms" integer;--> statement-breakpoint
ALTER TABLE "retrieval_cache_traces" ADD COLUMN "metadata" jsonb DEFAULT '{}'::jsonb NOT NULL;--> statement-breakpoint
UPDATE "documents_atlas_entries"
SET
	"source_ref" = COALESCE("relative_path", "absolute_path", "file_url", CONCAT('doc:', "id"::text)),
	"path" = COALESCE("relative_path", "absolute_path", "file_url", CONCAT('doc:', "id"::text));--> statement-breakpoint
UPDATE "feature_index_entries"
SET
	"stable_key" = COALESCE("file_path", CONCAT('feature:', "id"::text)),
	"path" = COALESCE("file_path", CONCAT('feature:', "id"::text)),
	"programming_language" = CASE
		WHEN "file_path" ~* '\\.svelte$' THEN 'svelte'
		WHEN "file_path" ~* '\\.(ts|tsx|mts|cts)$' THEN 'typescript'
		WHEN "file_path" ~* '\\.(js|jsx|mjs|cjs)$' THEN 'javascript'
		WHEN "file_path" ~* '\\.py$' THEN 'python'
		WHEN "file_path" ~* '\\.rs$' THEN 'rust'
		WHEN "file_path" ~* '\\.go$' THEN 'go'
		ELSE 'unknown'
	END,
	"feature_family" = 'general';--> statement-breakpoint
ALTER TABLE "documents_atlas_entries" ALTER COLUMN "source_ref" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "documents_atlas_entries" ALTER COLUMN "path" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "feature_index_entries" ALTER COLUMN "stable_key" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "feature_index_entries" ALTER COLUMN "path" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "feature_index_entries" ALTER COLUMN "programming_language" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "feature_index_entries" ALTER COLUMN "feature_family" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "documents_atlas_entries" DROP COLUMN "relative_path";--> statement-breakpoint
ALTER TABLE "documents_atlas_entries" DROP COLUMN "absolute_path";--> statement-breakpoint
ALTER TABLE "documents_atlas_entries" DROP COLUMN "file_url";--> statement-breakpoint
ALTER TABLE "documents_atlas_entries" DROP COLUMN "size";--> statement-breakpoint
ALTER TABLE "documents_atlas_entries" DROP COLUMN "lines";--> statement-breakpoint
ALTER TABLE "documents_atlas_entries" DROP COLUMN "last_modified";--> statement-breakpoint
ALTER TABLE "documents_atlas_entries" DROP COLUMN "ast_relations";--> statement-breakpoint
ALTER TABLE "documents_atlas_entries" DROP COLUMN "rg_groups";--> statement-breakpoint
ALTER TABLE "feature_index_entries" DROP COLUMN "file_path";--> statement-breakpoint
ALTER TABLE "feature_index_entries" DROP COLUMN "protocols";--> statement-breakpoint
ALTER TABLE "feature_index_entries" DROP COLUMN "nested_urls";--> statement-breakpoint
ALTER TABLE "feature_index_entries" DROP COLUMN "library_functions";--> statement-breakpoint
ALTER TABLE "feature_index_entries" DROP COLUMN "feature_subgraphs";--> statement-breakpoint
ALTER TABLE "retrieval_cache_traces" DROP COLUMN "query";--> statement-breakpoint
ALTER TABLE "retrieval_cache_traces" DROP COLUMN "cache_hit";--> statement-breakpoint
ALTER TABLE "retrieval_cache_traces" DROP COLUMN "cache_key";--> statement-breakpoint
ALTER TABLE "retrieval_cache_traces" DROP COLUMN "trace_details";--> statement-breakpoint
ALTER TABLE "documents_atlas_entries" ADD CONSTRAINT "documents_atlas_entries_source_ref_unique" UNIQUE("source_ref");--> statement-breakpoint
ALTER TABLE "feature_index_entries" ADD CONSTRAINT "feature_index_entries_stable_key_unique" UNIQUE("stable_key");--> statement-breakpoint
ALTER TABLE "retrieval_cache_traces" ADD CONSTRAINT "retrieval_cache_traces_run_id_unique" UNIQUE("run_id");