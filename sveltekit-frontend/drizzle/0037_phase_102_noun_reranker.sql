CREATE TABLE "deep_research_reports" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" integer NOT NULL,
	"query" text NOT NULL,
	"report_type" varchar(50) DEFAULT 'full' NOT NULL,
	"model_used" varchar(100) DEFAULT 'gemma4-rotorquant:latest',
	"markdown_content" text,
	"citations" jsonb,
	"recommendations" jsonb,
	"metadata" jsonb DEFAULT '{}',
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "atlas_artifacts" (
	"artifact_id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"packet_key" varchar(255) NOT NULL,
	"source_ref" varchar(512) NOT NULL,
	"feature_id" varchar(255),
	"artifact_type" varchar(50) NOT NULL,
	"content_hash" varchar(64),
	"generator" varchar(100) NOT NULL,
	"generator_version" varchar(100) NOT NULL,
	"generator_config" text,
	"storage_backend" varchar(50) NOT NULL,
	"storage_location" text,
	"gan_validated" timestamp,
	"gan_validation_score" real,
	"supersedes_artifact_id" uuid,
	"status" varchar(50) DEFAULT 'generated' NOT NULL,
	"trace_id" uuid,
	"git_commit" varchar(40),
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "atlas_semantic_diffs" (
	"diff_id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"packet_key" varchar(255) NOT NULL,
	"source_ref" varchar(512) NOT NULL,
	"similarity" real NOT NULL,
	"recommendation" varchar(50) NOT NULL,
	"action_taken" varchar(50),
	"regeneration_cost_saved" real,
	"trace_id" uuid,
	"notes" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "atlas_contract_fields" (
	"id" serial PRIMARY KEY NOT NULL,
	"raw_field" text NOT NULL,
	"canonical_field" text NOT NULL,
	"entity_type" text NOT NULL,
	"description" text,
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "retrieval_provenance" (
	"id" serial PRIMARY KEY NOT NULL,
	"story_id" text NOT NULL,
	"task_id" text NOT NULL,
	"worker_id" text NOT NULL,
	"trace_id" text,
	"query_hash" text NOT NULL,
	"packet_key" text NOT NULL,
	"source_ref" text NOT NULL,
	"source_ref_key" text,
	"feature_id" text NOT NULL,
	"feature_label" text,
	"cache_namespace" text,
	"cache_key" text,
	"cache_hit_source" text,
	"graph_stage_status" text,
	"traversal_path" jsonb,
	"fusion_score" double precision,
	"verdict" text,
	"retrieval_strategy" text,
	"retrieval_path" jsonb DEFAULT '[]'::jsonb,
	"created_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
DROP INDEX "idx_repo_function_source_ref";--> statement-breakpoint
DROP INDEX "idx_repo_function_kind";--> statement-breakpoint
DROP INDEX "idx_repo_function_keywords_gin";--> statement-breakpoint
DROP INDEX "idx_repo_function_workflow_lane_gin";--> statement-breakpoint
DROP INDEX "idx_repo_function_summary_fts_gin";--> statement-breakpoint
ALTER TABLE "repo_function_registry" ALTER COLUMN "symbol" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "repo_function_registry" ALTER COLUMN "created_at" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "repo_function_registry" ALTER COLUMN "updated_at" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "atlas_retrieval_eval_times" ADD COLUMN "route" text;--> statement-breakpoint
ALTER TABLE "atlas_retrieval_eval_times" ADD COLUMN "bm25_ms" real;--> statement-breakpoint
ALTER TABLE "atlas_retrieval_eval_times" ADD COLUMN "protocol" text;--> statement-breakpoint
ALTER TABLE "atlas_retrieval_eval_times" ADD COLUMN "accelerator" text;--> statement-breakpoint
ALTER TABLE "atlas_retrieval_eval_times" ADD COLUMN "cuda_available" boolean;--> statement-breakpoint
ALTER TABLE "atlas_retrieval_eval_times" ADD COLUMN "cuvs_enabled" boolean;--> statement-breakpoint
ALTER TABLE "atlas_retrieval_eval_times" ADD COLUMN "matmul_ms" real;--> statement-breakpoint
ALTER TABLE "atlas_retrieval_eval_times" ADD COLUMN "embedding_ms" real;--> statement-breakpoint
ALTER TABLE "atlas_retrieval_eval_times" ADD COLUMN "verdict" text;--> statement-breakpoint
ALTER TABLE "atlas_retrieval_eval_times" ADD COLUMN "result_count" integer;--> statement-breakpoint
ALTER TABLE "atlas_retrieval_eval_times" ADD COLUMN "error" text;--> statement-breakpoint
ALTER TABLE "repo_function_registry" ADD COLUMN "metadata" jsonb DEFAULT '{}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "deep_research_reports" ADD CONSTRAINT "deep_research_reports_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_deep_research_reports_user_id" ON "deep_research_reports" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "idx_deep_research_reports_created_at" ON "deep_research_reports" USING btree ("created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "idx_deep_research_reports_model" ON "deep_research_reports" USING btree ("model_used");--> statement-breakpoint
CREATE INDEX "idx_artifacts_packet_key" ON "atlas_artifacts" USING btree ("packet_key");--> statement-breakpoint
CREATE INDEX "idx_artifacts_source_ref" ON "atlas_artifacts" USING btree ("source_ref");--> statement-breakpoint
CREATE INDEX "idx_artifacts_feature_id" ON "atlas_artifacts" USING btree ("feature_id");--> statement-breakpoint
CREATE INDEX "idx_artifacts_generator" ON "atlas_artifacts" USING btree ("generator");--> statement-breakpoint
CREATE INDEX "idx_artifacts_generator_version" ON "atlas_artifacts" USING btree ("generator_version");--> statement-breakpoint
CREATE INDEX "idx_artifacts_type" ON "atlas_artifacts" USING btree ("artifact_type");--> statement-breakpoint
CREATE INDEX "idx_artifacts_status" ON "atlas_artifacts" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_artifacts_supersedes" ON "atlas_artifacts" USING btree ("supersedes_artifact_id");--> statement-breakpoint
CREATE INDEX "idx_artifacts_created_at" ON "atlas_artifacts" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "idx_artifacts_gan_validated" ON "atlas_artifacts" USING btree ("gan_validated");--> statement-breakpoint
CREATE INDEX "idx_artifacts_generator_status" ON "atlas_artifacts" USING btree ("generator","status");--> statement-breakpoint
CREATE INDEX "idx_acf_raw_field" ON "atlas_contract_fields" USING btree ("raw_field");--> statement-breakpoint
CREATE INDEX "idx_acf_canonical_field" ON "atlas_contract_fields" USING btree ("canonical_field");--> statement-breakpoint
CREATE INDEX "idx_rp_story_task" ON "retrieval_provenance" USING btree ("story_id","task_id");--> statement-breakpoint
CREATE INDEX "idx_rp_packet_key" ON "retrieval_provenance" USING btree ("packet_key");--> statement-breakpoint
CREATE INDEX "idx_rp_source_ref" ON "retrieval_provenance" USING btree ("source_ref");--> statement-breakpoint
CREATE INDEX "idx_rp_feature_id" ON "retrieval_provenance" USING btree ("feature_id");--> statement-breakpoint
CREATE INDEX "idx_rp_query_hash" ON "retrieval_provenance" USING btree ("query_hash");--> statement-breakpoint
CREATE INDEX "idx_eval_times_route" ON "atlas_retrieval_eval_times" USING btree ("route");--> statement-breakpoint
CREATE INDEX "idx_eval_times_result_count" ON "atlas_retrieval_eval_times" USING btree ("result_count");--> statement-breakpoint
CREATE INDEX "idx_eval_times_protocol" ON "atlas_retrieval_eval_times" USING btree ("protocol");--> statement-breakpoint
CREATE INDEX "idx_eval_times_accelerator" ON "atlas_retrieval_eval_times" USING btree ("accelerator");--> statement-breakpoint
CREATE INDEX "idx_eval_times_verdict" ON "atlas_retrieval_eval_times" USING btree ("verdict");--> statement-breakpoint
CREATE INDEX "idx_repo_function_registry_feature_id" ON "repo_function_registry" USING btree ("feature_id");--> statement-breakpoint
CREATE INDEX "idx_repo_function_registry_kind" ON "repo_function_registry" USING btree ("kind");--> statement-breakpoint
CREATE INDEX "idx_repo_function_registry_runtime_lane" ON "repo_function_registry" USING btree ("runtime_lane");--> statement-breakpoint
CREATE INDEX "idx_repo_function_registry_permission_lane" ON "repo_function_registry" USING btree ("permission_lane");--> statement-breakpoint
CREATE INDEX "idx_repo_function_registry_workflow_lane_gin" ON "repo_function_registry" USING gin ("workflow_lane");--> statement-breakpoint
CREATE INDEX "idx_repo_function_registry_keywords_gin" ON "repo_function_registry" USING gin ("keywords");--> statement-breakpoint
CREATE INDEX "idx_repo_function_registry_metadata_gin" ON "repo_function_registry" USING gin ("metadata");--> statement-breakpoint
CREATE INDEX "idx_repo_function_registry_updated_at" ON "repo_function_registry" USING btree ("updated_at" DESC);--> statement-breakpoint
ALTER TABLE "repo_function_registry" ADD CONSTRAINT "repo_function_registry_source_ref_unique" UNIQUE("source_ref");