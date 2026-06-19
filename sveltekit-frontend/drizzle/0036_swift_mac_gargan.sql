CREATE TABLE "error_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"error_category" varchar(100) NOT NULL,
	"severity" varchar(20) NOT NULL,
	"message" text NOT NULL,
	"stack" text,
	"context_key" varchar(255),
	"route_path" varchar(255),
	"file_path" varchar(512),
	"line_number" integer,
	"packet_key" varchar(255),
	"source_ref" varchar(255),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"fixed_at" timestamp with time zone,
	"resolved" boolean DEFAULT false NOT NULL,
	"fix_strategy" varchar(50),
	"fix_confidence" numeric(5, 2),
	"fix_notes" text,
	"audit_count" integer DEFAULT 1 NOT NULL,
	"last_audit_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "policy_reranker_metadata" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"model_version" varchar(50) DEFAULT '1.0' NOT NULL,
	"trained_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"metadata" jsonb NOT NULL,
	"git_commit_hash" varchar(40),
	"git_branch" varchar(255),
	"status" varchar(20) DEFAULT 'active' NOT NULL,
	"is_default" boolean DEFAULT true,
	"inference_stats" jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "atlas_packets" (
	"packet_id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"packet_key" text NOT NULL,
	"source_ref" text NOT NULL,
	"directory_path" text NOT NULL,
	"file_path" text,
	"function_symbol" text,
	"feature_id" text NOT NULL,
	"feature_label" text NOT NULL,
	"community_id" integer,
	"community_source" text,
	"community_confidence" double precision DEFAULT 0,
	"concept_ids" text[] DEFAULT '{}'::text[],
	"cluster_id" integer,
	"embedding" vector(768),
	"permissions" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"payload" jsonb DEFAULT '{}'::jsonb,
	"metadata" jsonb DEFAULT '{}'::jsonb,
	"topology" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"vectors" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"summary" text,
	"byte_start" bigint,
	"byte_end" bigint,
	"sha256" text,
	"source_kind" text DEFAULT 'codebase',
	"source_path" text,
	"source_ref_key" text,
	"reward_prior" double precision DEFAULT 0,
	"pagerank" real,
	"betweenness" real,
	"eigenvector" real,
	"neo4j_node_id" text,
	"redis_centroid_key" text,
	"domain_class" text,
	"tags" text[] DEFAULT '{}'::text[] NOT NULL,
	"lineage_version" text,
	"ledger_type" text,
	"canonical" boolean,
	"payload_backfilled_at" timestamp with time zone,
	"som_row" integer,
	"som_col" integer,
	"som_index" integer,
	"kmeans_cluster" integer,
	"latent_64" "bytea",
	"identity_lane" text DEFAULT 'qdrant_chunk',
	"qdrant_point_id" text,
	"qdrant_collection" text,
	"qdrant_vector_dim" integer,
	"identity_confidence" double precision DEFAULT 1,
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "atlas_retrieval_eval_times" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"query_hash" text,
	"packet_key" text,
	"feature_id" text,
	"domain_class" text,
	"ontology_label" text,
	"topology_label" text,
	"source_ref" text,
	"qdrant_ms" real,
	"pg_bm25_ms" real,
	"pgvector_ms" real,
	"redis_ms" real,
	"bitfrost_ms" real,
	"neo4j_ms" real,
	"turbovec_ms" real,
	"rerank_ms" real,
	"gemma4_ms" real,
	"total_ms" real,
	"cache_hit_source" text,
	"ttl_remaining" integer,
	"payload" jsonb DEFAULT '{}'::jsonb,
	"created_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "repo_function_registry" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"source_ref" text NOT NULL,
	"file_path" text,
	"symbol" text,
	"kind" text NOT NULL,
	"feature_id" text NOT NULL,
	"feature_label" text NOT NULL,
	"runtime_lane" text,
	"workflow_lane" text[] DEFAULT '{}'::text[] NOT NULL,
	"permission_lane" text,
	"keywords" text[] DEFAULT '{}'::text[] NOT NULL,
	"summary" text,
	"copy_merge_use" text,
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now(),
	CONSTRAINT "repo_function_registry_feature_id_unique" UNIQUE("feature_id")
);
--> statement-breakpoint
ALTER TABLE "nes_chrom_packets" ADD COLUMN "feature_label" text;--> statement-breakpoint
ALTER TABLE "nes_chrom_packets" ADD COLUMN "file_path" text;--> statement-breakpoint
ALTER TABLE "nes_chrom_packets" ADD COLUMN "community_id" integer;--> statement-breakpoint
ALTER TABLE "nes_chrom_packets" ADD COLUMN "community_confidence" real;--> statement-breakpoint
ALTER TABLE "nes_chrom_packets" ADD COLUMN "community_source" text;--> statement-breakpoint
ALTER TABLE "nes_chrom_packets" ADD COLUMN "domain_class" text;--> statement-breakpoint
ALTER TABLE "nes_chrom_packets" ADD COLUMN "permissions" jsonb DEFAULT '{}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "nes_chrom_packets" ADD COLUMN "topology" jsonb DEFAULT '{}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "nes_chrom_packets" ADD COLUMN "vectors" jsonb DEFAULT '{}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "nes_chrom_packets" ADD COLUMN "ledger_type" text;--> statement-breakpoint
ALTER TABLE "nes_chrom_packets" ADD COLUMN "lineage_version" text;--> statement-breakpoint
ALTER TABLE "nes_chrom_packets" ADD COLUMN "metadata" jsonb DEFAULT '{}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "nes_chrom_packets" ADD COLUMN "tags" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "nes_chrom_packets" ADD COLUMN "canonical" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "nes_chrom_packets" ADD COLUMN "identity_lane" text DEFAULT 'qdrant_chunk';--> statement-breakpoint
ALTER TABLE "nes_chrom_packets" ADD COLUMN "payload_backfilled_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "nes_chrom_packets" ADD COLUMN "pagerank" real;--> statement-breakpoint
ALTER TABLE "nes_chrom_packets" ADD COLUMN "betweenness" real;--> statement-breakpoint
ALTER TABLE "nes_chrom_packets" ADD COLUMN "eigenvector" real;--> statement-breakpoint
ALTER TABLE "nes_chrom_packets" ADD COLUMN "neo4j_node_id" text;--> statement-breakpoint
ALTER TABLE "nes_chrom_packets" ADD COLUMN "redis_centroid_key" text;--> statement-breakpoint
ALTER TABLE "nes_chrom_packets" ADD COLUMN "som_row" integer;--> statement-breakpoint
ALTER TABLE "nes_chrom_packets" ADD COLUMN "som_col" integer;--> statement-breakpoint
ALTER TABLE "nes_chrom_packets" ADD COLUMN "som_index" integer;--> statement-breakpoint
ALTER TABLE "nes_chrom_packets" ADD COLUMN "kmeans_cluster" integer;--> statement-breakpoint
ALTER TABLE "atlas_feature_map" ADD COLUMN "feature_label" text;--> statement-breakpoint
ALTER TABLE "atlas_feature_map" ADD COLUMN "canonical_name" text;--> statement-breakpoint
ALTER TABLE "atlas_feature_map" ADD COLUMN "community_id" integer;--> statement-breakpoint
ALTER TABLE "atlas_feature_map" ADD COLUMN "som_bmu_row" integer;--> statement-breakpoint
ALTER TABLE "atlas_feature_map" ADD COLUMN "som_bmu_col" integer;--> statement-breakpoint
ALTER TABLE "atlas_feature_map" ADD COLUMN "tree_node_id" uuid;--> statement-breakpoint
ALTER TABLE "atlas_feature_map" ADD COLUMN "qdrant_point_ids" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "atlas_feature_map" ADD COLUMN "neo4j_node_ids" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "atlas_feature_map" ADD COLUMN "packet_keys" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "atlas_feature_map" ADD COLUMN "file_path" text;--> statement-breakpoint
ALTER TABLE "atlas_feature_map" ADD COLUMN "source_refs" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "atlas_feature_map" ADD COLUMN "metadata" jsonb DEFAULT '{}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "atlas_feature_map" ADD COLUMN "summary" text;--> statement-breakpoint
ALTER TABLE "atlas_feature_map" ADD COLUMN "pagerank" text;--> statement-breakpoint
ALTER TABLE "atlas_feature_map" ADD COLUMN "centrality" text;--> statement-breakpoint
ALTER TABLE "atlas_feature_map" ADD COLUMN "updated_at" timestamp with time zone DEFAULT now();--> statement-breakpoint
ALTER TABLE "parent_atlas_documents" ADD COLUMN "tree_node_id" uuid;--> statement-breakpoint
ALTER TABLE "atlas_feature_map_synthesized" ADD COLUMN "tree_node_id" uuid;--> statement-breakpoint
ALTER TABLE "route_runtime_packets" ADD COLUMN "packet_key" text;--> statement-breakpoint
ALTER TABLE "route_runtime_packets" ADD COLUMN "source_ref" text;--> statement-breakpoint
ALTER TABLE "route_runtime_packets" ADD COLUMN "feature_label" text;--> statement-breakpoint
ALTER TABLE "route_runtime_packets" ADD COLUMN "community_id" integer;--> statement-breakpoint
ALTER TABLE "route_runtime_packets" ADD COLUMN "community_confidence" numeric;--> statement-breakpoint
ALTER TABLE "route_runtime_packets" ADD COLUMN "community_source" text;--> statement-breakpoint
ALTER TABLE "route_runtime_packets" ADD COLUMN "domain_class" text;--> statement-breakpoint
ALTER TABLE "route_runtime_packets" ADD COLUMN "ledger_type" text;--> statement-breakpoint
ALTER TABLE "route_runtime_packets" ADD COLUMN "lineage_version" text;--> statement-breakpoint
ALTER TABLE "route_runtime_packets" ADD COLUMN "metadata" jsonb DEFAULT '{}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "route_runtime_packets" ADD COLUMN "tags" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "route_runtime_packets" ADD COLUMN "canonical" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "route_runtime_packets" ADD COLUMN "payload_backfilled_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "route_runtime_packets" ADD COLUMN "som_row" integer;--> statement-breakpoint
ALTER TABLE "route_runtime_packets" ADD COLUMN "som_col" integer;--> statement-breakpoint
ALTER TABLE "route_runtime_packets" ADD COLUMN "som_index" integer;--> statement-breakpoint
ALTER TABLE "route_runtime_packets" ADD COLUMN "kmeans_cluster" integer;--> statement-breakpoint
ALTER TABLE "route_runtime_packets" ADD COLUMN "summary" text;--> statement-breakpoint
ALTER TABLE "route_runtime_packets" ADD COLUMN "raw" jsonb DEFAULT '{}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "route_runtime_packets" ADD COLUMN "tree_node_id" uuid;--> statement-breakpoint
ALTER TABLE "route_runtime_packets" ADD COLUMN "prompt_hash" text;--> statement-breakpoint
ALTER TABLE "route_runtime_packets" ADD COLUMN "reward" numeric;--> statement-breakpoint
ALTER TABLE "route_runtime_packets" ADD COLUMN "packet_uuid" uuid DEFAULT gen_random_uuid();--> statement-breakpoint
ALTER TABLE "route_runtime_packets" ADD COLUMN "route_state" text;--> statement-breakpoint
ALTER TABLE "route_runtime_packets" ADD COLUMN "feature_id" text;--> statement-breakpoint
ALTER TABLE "route_runtime_packets" ADD COLUMN "packet_version" integer;--> statement-breakpoint
ALTER TABLE "route_runtime_packets" ADD COLUMN "supersedes_packet_uuid" uuid;--> statement-breakpoint
ALTER TABLE "route_runtime_packets" ADD COLUMN "superseded_by" uuid;--> statement-breakpoint
ALTER TABLE "route_runtime_packets" ADD COLUMN "git_sha" text;--> statement-breakpoint
ALTER TABLE "route_runtime_packets" ADD COLUMN "git_diff_rank" numeric;--> statement-breakpoint
ALTER TABLE "route_runtime_packets" ADD COLUMN "source_ref_quality" numeric;--> statement-breakpoint
ALTER TABLE "route_runtime_packets" ADD COLUMN "repair_reason" text;--> statement-breakpoint
ALTER TABLE "route_runtime_packets" ADD COLUMN "repair_method" text;--> statement-breakpoint
CREATE INDEX "idx_error_logs_category" ON "error_logs" USING btree ("error_category");--> statement-breakpoint
CREATE INDEX "idx_error_logs_severity" ON "error_logs" USING btree ("severity");--> statement-breakpoint
CREATE INDEX "idx_error_logs_created" ON "error_logs" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "idx_error_logs_route" ON "error_logs" USING btree ("route_path");--> statement-breakpoint
CREATE INDEX "idx_error_logs_packet_key" ON "error_logs" USING btree ("packet_key");--> statement-breakpoint
CREATE INDEX "idx_error_logs_resolved" ON "error_logs" USING btree ("resolved");--> statement-breakpoint
CREATE INDEX "idx_error_logs_fix_strategy" ON "error_logs" USING btree ("fix_strategy");--> statement-breakpoint
CREATE INDEX "idx_policy_status_default" ON "policy_reranker_metadata" USING btree ("status","is_default");--> statement-breakpoint
CREATE INDEX "idx_policy_trained_at" ON "policy_reranker_metadata" USING btree ("trained_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "idx_atlas_packets_identity" ON "atlas_packets" USING btree ("packet_key","source_ref","feature_id","directory_path");--> statement-breakpoint
CREATE INDEX "idx_atlas_packets_source_feature" ON "atlas_packets" USING btree ("source_ref","feature_id");--> statement-breakpoint
CREATE INDEX "idx_atlas_packets_directory_path" ON "atlas_packets" USING btree ("directory_path");--> statement-breakpoint
CREATE INDEX "idx_atlas_packets_directory_feature" ON "atlas_packets" USING btree ("directory_path","feature_id");--> statement-breakpoint
CREATE INDEX "idx_atlas_packets_cluster_id" ON "atlas_packets" USING btree ("cluster_id");--> statement-breakpoint
CREATE INDEX "idx_atlas_packets_permissions_gin" ON "atlas_packets" USING gin ("permissions");--> statement-breakpoint
CREATE INDEX "idx_atlas_packets_payload_gin" ON "atlas_packets" USING gin ("payload");--> statement-breakpoint
CREATE INDEX "idx_atlas_packets_metadata_gin" ON "atlas_packets" USING gin ("metadata");--> statement-breakpoint
CREATE INDEX "idx_atlas_packets_topology_gin" ON "atlas_packets" USING gin ("topology");--> statement-breakpoint
CREATE INDEX "idx_atlas_packets_vectors_gin" ON "atlas_packets" USING gin ("vectors");--> statement-breakpoint
CREATE INDEX "idx_atlas_packets_identity_lane" ON "atlas_packets" USING btree ("identity_lane");--> statement-breakpoint
CREATE INDEX "idx_atlas_packets_qdrant_point_id" ON "atlas_packets" USING btree ("qdrant_point_id");--> statement-breakpoint
CREATE INDEX "idx_atlas_packets_pagerank" ON "atlas_packets" USING btree ("pagerank");--> statement-breakpoint
CREATE INDEX "idx_atlas_packets_betweenness" ON "atlas_packets" USING btree ("betweenness");--> statement-breakpoint
CREATE INDEX "idx_atlas_packets_eigenvector" ON "atlas_packets" USING btree ("eigenvector");--> statement-breakpoint
CREATE INDEX "idx_atlas_packets_neo4j_node_id" ON "atlas_packets" USING btree ("neo4j_node_id");--> statement-breakpoint
CREATE INDEX "idx_atlas_packets_redis_centroid_key" ON "atlas_packets" USING btree ("redis_centroid_key");--> statement-breakpoint
CREATE INDEX "idx_atlas_packets_reward_prior" ON "atlas_packets" USING btree ("reward_prior" DESC);--> statement-breakpoint
CREATE INDEX "idx_atlas_packets_community_confidence" ON "atlas_packets" USING btree ("community_confidence" DESC);--> statement-breakpoint
CREATE INDEX "idx_atlas_packets_updated_at" ON "atlas_packets" USING btree ("updated_at" DESC);--> statement-breakpoint
CREATE INDEX "idx_atlas_packets_created_at" ON "atlas_packets" USING btree ("created_at" DESC);--> statement-breakpoint
CREATE INDEX "idx_eval_times_query_hash" ON "atlas_retrieval_eval_times" USING btree ("query_hash");--> statement-breakpoint
CREATE INDEX "idx_eval_times_packet_key" ON "atlas_retrieval_eval_times" USING btree ("packet_key");--> statement-breakpoint
CREATE INDEX "idx_eval_times_feature_id" ON "atlas_retrieval_eval_times" USING btree ("feature_id");--> statement-breakpoint
CREATE INDEX "idx_eval_times_domain_class" ON "atlas_retrieval_eval_times" USING btree ("domain_class");--> statement-breakpoint
CREATE INDEX "idx_eval_times_ontology_label" ON "atlas_retrieval_eval_times" USING btree ("ontology_label");--> statement-breakpoint
CREATE INDEX "idx_eval_times_payload_gin" ON "atlas_retrieval_eval_times" USING gin ("payload");--> statement-breakpoint
CREATE INDEX "idx_repo_function_source_ref" ON "repo_function_registry" USING btree ("source_ref");--> statement-breakpoint
CREATE INDEX "idx_repo_function_kind" ON "repo_function_registry" USING btree ("kind");--> statement-breakpoint
CREATE INDEX "idx_repo_function_keywords_gin" ON "repo_function_registry" USING gin ("keywords");--> statement-breakpoint
CREATE INDEX "idx_repo_function_workflow_lane_gin" ON "repo_function_registry" USING gin ("workflow_lane");--> statement-breakpoint
CREATE INDEX "idx_repo_function_summary_fts_gin" ON "repo_function_registry" USING gin (to_tsvector('english', coalesce("summary", '')));--> statement-breakpoint
ALTER TABLE "atlas_feature_map" ADD CONSTRAINT "atlas_feature_map_tree_node_id_atlas_tree_nodes_node_id_fk" FOREIGN KEY ("tree_node_id") REFERENCES "public"."atlas_tree_nodes"("node_id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "parent_atlas_documents" ADD CONSTRAINT "parent_atlas_documents_tree_node_id_atlas_tree_nodes_node_id_fk" FOREIGN KEY ("tree_node_id") REFERENCES "public"."atlas_tree_nodes"("node_id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "atlas_feature_map_synthesized" ADD CONSTRAINT "atlas_feature_map_synthesized_tree_node_id_atlas_tree_nodes_node_id_fk" FOREIGN KEY ("tree_node_id") REFERENCES "public"."atlas_tree_nodes"("node_id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "route_runtime_packets" ADD CONSTRAINT "route_runtime_packets_tree_node_id_atlas_tree_nodes_node_id_fk" FOREIGN KEY ("tree_node_id") REFERENCES "public"."atlas_tree_nodes"("node_id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_nes_chrom_packets_source_ref" ON "nes_chrom_packets" USING btree ("source_ref");--> statement-breakpoint
CREATE INDEX "idx_nes_chrom_packets_source_ref_idx" ON "nes_chrom_packets" USING btree ("source_ref");--> statement-breakpoint
CREATE INDEX "idx_nes_chrom_packets_feature_id" ON "nes_chrom_packets" USING btree ("feature_id");--> statement-breakpoint
CREATE INDEX "idx_nes_chrom_packets_feature_id_idx" ON "nes_chrom_packets" USING btree ("feature_id");--> statement-breakpoint
CREATE INDEX "idx_nes_chrom_packets_feature_source" ON "nes_chrom_packets" USING btree ("feature_id","source_ref");--> statement-breakpoint
CREATE INDEX "idx_nes_chrom_packets_feature_label_idx" ON "nes_chrom_packets" USING btree ("feature_label");--> statement-breakpoint
CREATE INDEX "idx_nes_chrom_packets_community_id_idx" ON "nes_chrom_packets" USING btree ("community_id");--> statement-breakpoint
CREATE INDEX "idx_nes_chrom_packets_community_confidence_idx" ON "nes_chrom_packets" USING btree ("community_confidence");--> statement-breakpoint
CREATE INDEX "idx_nes_chrom_packets_community_source_idx" ON "nes_chrom_packets" USING btree ("community_source");--> statement-breakpoint
CREATE INDEX "idx_nes_chrom_packets_domain_class_idx" ON "nes_chrom_packets" USING btree ("domain_class");--> statement-breakpoint
CREATE INDEX "idx_nes_chrom_packets_pagerank" ON "nes_chrom_packets" USING btree ("pagerank");--> statement-breakpoint
CREATE INDEX "idx_nes_chrom_packets_betweenness" ON "nes_chrom_packets" USING btree ("betweenness");--> statement-breakpoint
CREATE INDEX "idx_nes_chrom_packets_eigenvector" ON "nes_chrom_packets" USING btree ("eigenvector");--> statement-breakpoint
CREATE INDEX "idx_nes_chrom_packets_neo4j_node_id" ON "nes_chrom_packets" USING btree ("neo4j_node_id");--> statement-breakpoint
CREATE INDEX "idx_nes_chrom_packets_redis_centroid_key" ON "nes_chrom_packets" USING btree ("redis_centroid_key");--> statement-breakpoint
CREATE INDEX "idx_nes_chrom_packets_ledger_type_idx" ON "nes_chrom_packets" USING btree ("ledger_type");--> statement-breakpoint
CREATE INDEX "idx_nes_chrom_packets_lineage_version_idx" ON "nes_chrom_packets" USING btree ("lineage_version");--> statement-breakpoint
CREATE INDEX "idx_nes_chrom_packets_permissions_gin" ON "nes_chrom_packets" USING gin ("permissions");--> statement-breakpoint
CREATE INDEX "idx_nes_chrom_packets_metadata_gin" ON "nes_chrom_packets" USING gin ("metadata");--> statement-breakpoint
CREATE INDEX "idx_nes_chrom_packets_topology_gin" ON "nes_chrom_packets" USING gin ("topology");--> statement-breakpoint
CREATE INDEX "idx_nes_chrom_packets_vectors_gin" ON "nes_chrom_packets" USING gin ("vectors");--> statement-breakpoint
CREATE INDEX "idx_nes_chrom_packets_tags_gin" ON "nes_chrom_packets" USING gin ("tags");--> statement-breakpoint
CREATE INDEX "idx_nes_chrom_packets_som_index_idx" ON "nes_chrom_packets" USING btree ("som_index");--> statement-breakpoint
CREATE INDEX "idx_nes_chrom_packets_kmeans_cluster_idx" ON "nes_chrom_packets" USING btree ("kmeans_cluster");--> statement-breakpoint
CREATE INDEX "idx_nes_chrom_packets_packet_key_idx" ON "nes_chrom_packets" USING btree ("packet_key");--> statement-breakpoint
CREATE INDEX "nes_chrom_packets_source_ref_trgm_idx" ON "nes_chrom_packets" USING gin ("source_ref" gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "nes_chrom_packets_norm_source_ref_trgm_idx" ON "nes_chrom_packets" USING gin (lower("source_ref") gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "nes_chrom_packets_summary_trgm_idx" ON "nes_chrom_packets" USING gin ("summary" gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "nes_chrom_packets_confidence_score_idx" ON "nes_chrom_packets" USING btree ("confidence_score");--> statement-breakpoint
CREATE INDEX "nes_chrom_packets_packet_zstd_idx" ON "nes_chrom_packets" USING btree ("packet_zstd");--> statement-breakpoint
CREATE INDEX "idx_atlas_feature_map_feature_id" ON "atlas_feature_map" USING btree ("feature_id");--> statement-breakpoint
CREATE INDEX "afm_feature_id_idx" ON "atlas_feature_map" USING btree ("feature_id");--> statement-breakpoint
CREATE INDEX "afm_community_id_idx" ON "atlas_feature_map" USING btree ("community_id");--> statement-breakpoint
CREATE INDEX "idx_atlas_feature_map_source_ref" ON "atlas_feature_map" USING btree ("source_ref");--> statement-breakpoint
CREATE INDEX "atlas_feature_map_packet_id_idx" ON "atlas_feature_map" USING btree ("packet_id") WHERE "atlas_feature_map"."packet_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "afm_pagerank_idx" ON "atlas_feature_map" USING btree ("pagerank");--> statement-breakpoint
CREATE INDEX "idx_atlas_feature_map_metadata_gin" ON "atlas_feature_map" USING gin ("metadata");--> statement-breakpoint
CREATE INDEX "idx_atlas_feature_map_qdrant_point_ids_gin" ON "atlas_feature_map" USING gin ("qdrant_point_ids");--> statement-breakpoint
CREATE INDEX "idx_atlas_feature_map_neo4j_node_ids_gin" ON "atlas_feature_map" USING gin ("neo4j_node_ids");--> statement-breakpoint
CREATE INDEX "idx_atlas_feature_map_packet_keys_gin" ON "atlas_feature_map" USING gin ("packet_keys");--> statement-breakpoint
CREATE INDEX "idx_atlas_feature_map_source_refs_gin" ON "atlas_feature_map" USING gin ("source_refs");--> statement-breakpoint
CREATE INDEX "atlas_feature_map_tree_node_id_idx" ON "atlas_feature_map" USING btree ("tree_node_id");--> statement-breakpoint
CREATE INDEX "idx_pad_tree_node_id" ON "parent_atlas_documents" USING btree ("tree_node_id");--> statement-breakpoint
CREATE INDEX "idx_afms_tree_node_id" ON "atlas_feature_map_synthesized" USING btree ("tree_node_id");--> statement-breakpoint
CREATE INDEX "idx_rrp_feature_cluster" ON "route_runtime_packets" USING btree ("feature_id","cluster_id");--> statement-breakpoint
CREATE INDEX "idx_rrp_raw_domain" ON "route_runtime_packets" USING gin ("raw" -> 'domain');--> statement-breakpoint
CREATE INDEX "idx_rrp_raw_feature_id" ON "route_runtime_packets" USING gin ("raw" -> 'feature_id');--> statement-breakpoint
CREATE INDEX "idx_rrp_raw_gin" ON "route_runtime_packets" USING gin ("raw");--> statement-breakpoint
CREATE INDEX "idx_route_runtime_packets_packet_key_idx" ON "route_runtime_packets" USING btree ("packet_key");--> statement-breakpoint
CREATE INDEX "idx_route_runtime_packets_source_ref_idx" ON "route_runtime_packets" USING btree ("source_ref");--> statement-breakpoint
CREATE INDEX "idx_route_runtime_packets_source_ref" ON "route_runtime_packets" USING btree ("source_ref");--> statement-breakpoint
CREATE INDEX "idx_route_runtime_packets_feature_label_idx" ON "route_runtime_packets" USING btree ("feature_label");--> statement-breakpoint
CREATE INDEX "idx_route_runtime_packets_community_id_idx" ON "route_runtime_packets" USING btree ("community_id");--> statement-breakpoint
CREATE INDEX "idx_route_runtime_packets_community_confidence_idx" ON "route_runtime_packets" USING btree ("community_confidence");--> statement-breakpoint
CREATE INDEX "idx_route_runtime_packets_community_source_idx" ON "route_runtime_packets" USING btree ("community_source");--> statement-breakpoint
CREATE INDEX "idx_route_runtime_packets_domain_class_idx" ON "route_runtime_packets" USING btree ("domain_class");--> statement-breakpoint
CREATE INDEX "idx_route_runtime_packets_ledger_type_idx" ON "route_runtime_packets" USING btree ("ledger_type");--> statement-breakpoint
CREATE INDEX "idx_route_runtime_packets_lineage_version_idx" ON "route_runtime_packets" USING btree ("lineage_version");--> statement-breakpoint
CREATE INDEX "idx_route_runtime_packets_metadata_gin" ON "route_runtime_packets" USING gin ("metadata");--> statement-breakpoint
CREATE INDEX "idx_route_runtime_packets_tags_gin" ON "route_runtime_packets" USING gin ("tags");--> statement-breakpoint
CREATE INDEX "idx_route_runtime_packets_som_row_idx" ON "route_runtime_packets" USING btree ("som_row");--> statement-breakpoint
CREATE INDEX "idx_route_runtime_packets_som_col_idx" ON "route_runtime_packets" USING btree ("som_col");--> statement-breakpoint
CREATE INDEX "idx_route_runtime_packets_som_index_idx" ON "route_runtime_packets" USING btree ("som_index");--> statement-breakpoint
CREATE INDEX "idx_route_runtime_packets_kmeans_cluster_idx" ON "route_runtime_packets" USING btree ("kmeans_cluster");--> statement-breakpoint
CREATE INDEX "idx_route_runtime_packets_feature_id" ON "route_runtime_packets" USING btree ("feature_id");--> statement-breakpoint
CREATE INDEX "idx_route_runtime_packets_feature_id_idx" ON "route_runtime_packets" USING btree ("feature_id");--> statement-breakpoint
CREATE INDEX "idx_route_runtime_packets_feature_ids_gin" ON "route_runtime_packets" USING gin ("feature_ids");--> statement-breakpoint
CREATE INDEX "idx_route_runtime_packets_source_refs_gin" ON "route_runtime_packets" USING gin ("source_refs");--> statement-breakpoint
CREATE INDEX "idx_route_runtime_packets_tree_node_id" ON "route_runtime_packets" USING btree ("tree_node_id");--> statement-breakpoint
CREATE INDEX "idx_route_runtime_packets_raw_gin" ON "route_runtime_packets" USING gin ("raw");--> statement-breakpoint
CREATE INDEX "idx_rrp_git_sha" ON "route_runtime_packets" USING btree ("git_sha");--> statement-breakpoint
CREATE INDEX "idx_rrp_packet_version" ON "route_runtime_packets" USING btree ("packet_version");--> statement-breakpoint
CREATE INDEX "idx_rrp_source_ref_quality" ON "route_runtime_packets" USING btree ("source_ref_quality");--> statement-breakpoint
CREATE INDEX "idx_rrp_superseded_by" ON "route_runtime_packets" USING btree ("superseded_by");--> statement-breakpoint
CREATE INDEX "rrp_raw_gin" ON "route_runtime_packets" USING gin ("raw");--> statement-breakpoint
CREATE INDEX "rrp_state_idx" ON "route_runtime_packets" USING btree ("route_state","captured_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "rrp_feature_idx" ON "route_runtime_packets" USING btree ("feature_id","captured_at" DESC NULLS LAST);--> statement-breakpoint
CREATE UNIQUE INDEX "rrp_packet_uuid_uidx" ON "route_runtime_packets" USING btree ("packet_uuid");