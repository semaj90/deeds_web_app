CREATE TYPE "public"."packet_type" AS ENUM('code', 'test', 'doc', 'prompt', 'tool', 'schema', 'api', 'spec');--> statement-breakpoint
CREATE TABLE "tool_execution_log" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"tool_id" text NOT NULL,
	"query" text,
	"success" integer NOT NULL,
	"latency_ms" integer,
	"error_type" text,
	"timestamp" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tool_execution_stats_7d" (
	"tool_id" text PRIMARY KEY NOT NULL,
	"success_count" integer DEFAULT 0 NOT NULL,
	"failure_count" integer DEFAULT 0 NOT NULL,
	"avg_latency_ms" real DEFAULT 0,
	"timeout_count" integer DEFAULT 0 NOT NULL,
	"schema_mismatch_count" integer DEFAULT 0 NOT NULL,
	"rolling_success_rate" real DEFAULT 0,
	"last_refreshed_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "agent_action_results" (
	"result_id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"action_id" uuid NOT NULL,
	"output_packet" jsonb,
	"output_hash" text,
	"exit_code" integer,
	"error_code" text,
	"error_detail" jsonb,
	"duration_ms" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "agent_run_actions" (
	"action_id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"run_id" uuid NOT NULL,
	"sequence_no" bigint NOT NULL,
	"action_type" text NOT NULL,
	"input_packet" jsonb NOT NULL,
	"input_hash" text NOT NULL,
	"permission_scope" text[] DEFAULT '{}'::text[] NOT NULL,
	"risk_level" integer DEFAULT 0 NOT NULL,
	"status" text DEFAULT 'PROPOSED' NOT NULL,
	"idempotency_key" text NOT NULL,
	"causation_id" uuid,
	"started_at" timestamp with time zone,
	"finished_at" timestamp with time zone,
	CONSTRAINT "agent_run_actions_idempotency_key_unique" UNIQUE("idempotency_key"),
	CONSTRAINT "agent_run_actions_run_seq" UNIQUE("run_id","sequence_no")
);
--> statement-breakpoint
CREATE TABLE "agent_runs" (
	"run_id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workflow_name" text NOT NULL,
	"workflow_version" text NOT NULL,
	"status" text DEFAULT 'PROPOSED' NOT NULL,
	"tenant_id" uuid NOT NULL,
	"initiated_by" text NOT NULL,
	"state" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "deep_research_audit_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" integer NOT NULL,
	"task_id" uuid,
	"action" varchar(50) NOT NULL,
	"details" jsonb,
	"duration_ms" integer,
	"success" boolean DEFAULT true NOT NULL,
	"error_message" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ldr_research_results" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"task_id" uuid NOT NULL,
	"rank" integer NOT NULL,
	"candidate_id" varchar(255) NOT NULL,
	"source" varchar(20) NOT NULL,
	"title" varchar(500),
	"text" text NOT NULL,
	"url" varchar(2048),
	"upstream_score" real,
	"ml_score" real NOT NULL,
	"final_score" real NOT NULL,
	"metadata" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ldr_research_tasks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" integer NOT NULL,
	"case_id" uuid,
	"query" text NOT NULL,
	"query_hash" varchar(64) NOT NULL,
	"status" varchar(20) DEFAULT 'pending' NOT NULL,
	"rank_model" varchar(20) DEFAULT 'xgboost' NOT NULL,
	"include_web_search" boolean DEFAULT true NOT NULL,
	"include_ldr" boolean DEFAULT true NOT NULL,
	"top_k" integer DEFAULT 5 NOT NULL,
	"source_counts" jsonb,
	"total_candidates" integer,
	"ml_score" real,
	"synthesis_model" varchar(100),
	"synthesis_length" integer,
	"error_message" text,
	"duration_ms" integer,
	"started_at" timestamp DEFAULT now() NOT NULL,
	"completed_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "ldr_research_tasks_query_hash_unique" UNIQUE("query_hash")
);
--> statement-breakpoint
CREATE TABLE "ldr_synthesis" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"task_id" uuid NOT NULL,
	"synthesis_text" text NOT NULL,
	"model" varchar(100) NOT NULL,
	"confidence" real,
	"cited_result_ids" text,
	"key_findings" jsonb,
	"metadata" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "ldr_synthesis_task_id_unique" UNIQUE("task_id")
);
--> statement-breakpoint
CREATE TABLE "ml_clustering" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"task_id" uuid,
	"algorithm" varchar(30) NOT NULL,
	"n_clusters" integer NOT NULL,
	"vector_dim" integer NOT NULL,
	"n_vectors" integer NOT NULL,
	"cluster_ids" text NOT NULL,
	"centroids_json" jsonb,
	"inertia" real,
	"silhouette_score" real,
	"duration_ms" integer,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ml_ranking_cache" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"query_hash" varchar(64) NOT NULL,
	"query" text NOT NULL,
	"model" varchar(20) NOT NULL,
	"top_k_results" jsonb NOT NULL,
	"model_version" varchar(50),
	"accuracy" real,
	"cache_ttl_minutes" integer DEFAULT 1440 NOT NULL,
	"hit_count" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"expires_at" timestamp NOT NULL,
	CONSTRAINT "ml_ranking_cache_query_hash_unique" UNIQUE("query_hash")
);
--> statement-breakpoint
CREATE TABLE "outbox_events" (
	"outbox_id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"aggregate_type" text NOT NULL,
	"aggregate_id" uuid NOT NULL,
	"event_type" text NOT NULL,
	"payload" jsonb NOT NULL,
	"published_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "token_artifacts" (
	"artifact_id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"source_ref" text NOT NULL,
	"tokenizer_id" text NOT NULL,
	"tokenizer_hash" text NOT NULL,
	"content_hash" text NOT NULL,
	"token_count" integer NOT NULL,
	"snapshot_uri" text NOT NULL,
	"token_offset_start" bigint NOT NULL,
	"token_offset_end" bigint NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "token_artifacts_content_tokenizer" UNIQUE("content_hash","tokenizer_hash")
);
--> statement-breakpoint
CREATE TABLE "workflow_events" (
	"event_id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"run_id" uuid NOT NULL,
	"action_id" uuid,
	"event_type" text NOT NULL,
	"sequence_no" bigint NOT NULL,
	"payload" jsonb NOT NULL,
	"occurred_at" timestamp with time zone NOT NULL,
	"recorded_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "workflow_events_run_seq" UNIQUE("run_id","sequence_no")
);
--> statement-breakpoint
CREATE TABLE "packet_binary_registry" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"packet_key" text NOT NULL,
	"packet_id" uuid NOT NULL,
	"packet_ulid" text,
	"title_id" text NOT NULL,
	"feature_id" text NOT NULL,
	"source_ref" text NOT NULL,
	"community_id" integer,
	"som_row" integer,
	"som_col" integer,
	"transport_type" text DEFAULT 'grpc' NOT NULL,
	"payload_format" text DEFAULT 'protobuf' NOT NULL,
	"binary_payload" "bytea" NOT NULL,
	"payload_hash" text,
	"ttl_seconds" integer DEFAULT 3600 NOT NULL,
	"dag_hit_kind" text DEFAULT 'open_memory',
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_accessed_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "atlas_packets" ADD COLUMN "packet_ulid" text;--> statement-breakpoint
ALTER TABLE "atlas_packets" ADD COLUMN "canonical_source_ref" text;--> statement-breakpoint
ALTER TABLE "atlas_packets" ADD COLUMN "title_id" text;--> statement-breakpoint
ALTER TABLE "atlas_packets" ADD COLUMN "tree_node_id" uuid;--> statement-breakpoint
ALTER TABLE "retrieval_provenance" ADD COLUMN "packet_id" text;--> statement-breakpoint
ALTER TABLE "retrieval_provenance" ADD COLUMN "packet_ulid" text;--> statement-breakpoint
ALTER TABLE "retrieval_provenance" ADD COLUMN "canonical_source_ref" text;--> statement-breakpoint
ALTER TABLE "retrieval_provenance" ADD COLUMN "title_id" text;--> statement-breakpoint
ALTER TABLE "agent_action_results" ADD CONSTRAINT "agent_action_results_action_id_agent_run_actions_action_id_fk" FOREIGN KEY ("action_id") REFERENCES "public"."agent_run_actions"("action_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_run_actions" ADD CONSTRAINT "agent_run_actions_run_id_agent_runs_run_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."agent_runs"("run_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deep_research_audit_log" ADD CONSTRAINT "deep_research_audit_log_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deep_research_audit_log" ADD CONSTRAINT "deep_research_audit_log_task_id_ldr_research_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."ldr_research_tasks"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ldr_research_results" ADD CONSTRAINT "ldr_research_results_task_id_ldr_research_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."ldr_research_tasks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ldr_research_tasks" ADD CONSTRAINT "ldr_research_tasks_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ldr_research_tasks" ADD CONSTRAINT "ldr_research_tasks_case_id_cases_id_fk" FOREIGN KEY ("case_id") REFERENCES "public"."cases"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ldr_synthesis" ADD CONSTRAINT "ldr_synthesis_task_id_ldr_research_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."ldr_research_tasks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ml_clustering" ADD CONSTRAINT "ml_clustering_task_id_ldr_research_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."ldr_research_tasks"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workflow_events" ADD CONSTRAINT "workflow_events_run_id_agent_runs_run_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."agent_runs"("run_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_tool_exec_log_tool_id" ON "tool_execution_log" USING btree ("tool_id");--> statement-breakpoint
CREATE INDEX "idx_tool_exec_log_timestamp" ON "tool_execution_log" USING btree ("timestamp" DESC);--> statement-breakpoint
CREATE INDEX "idx_tool_exec_log_tool_timestamp" ON "tool_execution_log" USING btree ("tool_id","timestamp" DESC);--> statement-breakpoint
CREATE INDEX "idx_tool_exec_log_success" ON "tool_execution_log" USING btree ("success");--> statement-breakpoint
CREATE INDEX "idx_agent_run_actions_run" ON "agent_run_actions" USING btree ("run_id","sequence_no");--> statement-breakpoint
CREATE INDEX "idx_agent_run_actions_status" ON "agent_run_actions" USING btree ("status","started_at");--> statement-breakpoint
CREATE INDEX "idx_agent_runs_status" ON "agent_runs" USING btree ("status","started_at");--> statement-breakpoint
CREATE INDEX "idx_agent_runs_tenant" ON "agent_runs" USING btree ("tenant_id","started_at");--> statement-breakpoint
CREATE INDEX "idx_outbox_events_unpublished" ON "outbox_events" USING btree ("created_at") WHERE published_at IS NULL;--> statement-breakpoint
CREATE INDEX "idx_token_artifacts_source" ON "token_artifacts" USING btree ("source_ref");--> statement-breakpoint
CREATE INDEX "idx_workflow_events_run" ON "workflow_events" USING btree ("run_id","sequence_no");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_packet_binary_registry_packet_key" ON "packet_binary_registry" USING btree ("packet_key");--> statement-breakpoint
CREATE INDEX "idx_packet_binary_registry_packet_id" ON "packet_binary_registry" USING btree ("packet_id");--> statement-breakpoint
CREATE INDEX "idx_packet_binary_registry_title_id" ON "packet_binary_registry" USING btree ("title_id");--> statement-breakpoint
CREATE INDEX "idx_packet_binary_registry_feature_id" ON "packet_binary_registry" USING btree ("feature_id");--> statement-breakpoint
CREATE INDEX "idx_packet_binary_registry_source_ref" ON "packet_binary_registry" USING btree ("source_ref");--> statement-breakpoint
CREATE INDEX "idx_packet_binary_registry_community_id" ON "packet_binary_registry" USING btree ("community_id");--> statement-breakpoint
CREATE INDEX "idx_packet_binary_registry_som_cell" ON "packet_binary_registry" USING btree ("som_row","som_col");--> statement-breakpoint
CREATE INDEX "idx_packet_binary_registry_transport_type" ON "packet_binary_registry" USING btree ("transport_type");--> statement-breakpoint
CREATE INDEX "idx_packet_binary_registry_payload_format" ON "packet_binary_registry" USING btree ("payload_format");--> statement-breakpoint
CREATE INDEX "idx_packet_binary_registry_created_at" ON "packet_binary_registry" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "idx_packet_binary_registry_last_accessed_at" ON "packet_binary_registry" USING btree ("last_accessed_at");--> statement-breakpoint
ALTER TABLE "atlas_packets" ADD CONSTRAINT "atlas_packets_tree_node_id_atlas_tree_nodes_node_id_fk" FOREIGN KEY ("tree_node_id") REFERENCES "public"."atlas_tree_nodes"("node_id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_atlas_packets_packet_ulid" ON "atlas_packets" USING btree ("packet_ulid");--> statement-breakpoint
CREATE INDEX "idx_atlas_packets_title_id" ON "atlas_packets" USING btree ("title_id");--> statement-breakpoint
CREATE INDEX "idx_atlas_packets_canonical_source_ref" ON "atlas_packets" USING btree ("canonical_source_ref");--> statement-breakpoint
CREATE INDEX "idx_atlas_packets_tree_node_id" ON "atlas_packets" USING btree ("tree_node_id");--> statement-breakpoint
CREATE INDEX "idx_rp_packet_id" ON "retrieval_provenance" USING btree ("packet_id");--> statement-breakpoint
CREATE INDEX "idx_rp_packet_ulid" ON "retrieval_provenance" USING btree ("packet_ulid");--> statement-breakpoint
CREATE INDEX "idx_rp_canonical_source_ref" ON "retrieval_provenance" USING btree ("canonical_source_ref");--> statement-breakpoint
CREATE INDEX "idx_rp_title_id" ON "retrieval_provenance" USING btree ("title_id");