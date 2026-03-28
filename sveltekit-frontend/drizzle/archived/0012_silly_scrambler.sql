CREATE TABLE "persons_of_interest" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"aliases" text[] DEFAULT '{}',
	"description" text NOT NULL,
	"threat_level" text DEFAULT 'low',
	"status" text DEFAULT 'active',
	"relationship" text DEFAULT 'person_of_interest',
	"ai_profile" jsonb,
	"who" jsonb,
	"what" jsonb,
	"why" jsonb,
	"how" jsonb,
	"risk" jsonb,
	"confidence" real,
	"model_version" text DEFAULT 'gemma3-legal',
	"generated_at" timestamp,
	"last_updated" timestamp DEFAULT now(),
	"case_ids" text[] DEFAULT '{}',
	"created_by" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "yorha_cases" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"case_number" varchar(100) NOT NULL,
	"title" varchar(500) NOT NULL,
	"description" text,
	"status" varchar(50) DEFAULT 'active' NOT NULL,
	"priority" varchar(20) DEFAULT 'medium' NOT NULL,
	"case_type" varchar(100),
	"jurisdiction" varchar(200),
	"filed_date" timestamp with time zone,
	"closed_date" timestamp with time zone,
	"created_by" uuid NOT NULL,
	"assigned_to" uuid,
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "yorha_cases_case_number_unique" UNIQUE("case_number")
);
--> statement-breakpoint
CREATE TABLE "yorha_chat_messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"session_id" uuid NOT NULL,
	"role" varchar(50) NOT NULL,
	"content" text NOT NULL,
	"message_type" varchar(50) DEFAULT 'text',
	"referenced_evidence" jsonb,
	"model_used" varchar(100),
	"tokens_used" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "yorha_chat_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"case_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"title" varchar(500),
	"context_type" varchar(100),
	"context_id" uuid,
	"status" varchar(50) DEFAULT 'active' NOT NULL,
	"message_count" integer DEFAULT 0,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_message_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "yorha_evidence_connections" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"case_id" uuid NOT NULL,
	"source_node_id" uuid NOT NULL,
	"target_node_id" uuid NOT NULL,
	"connection_type" varchar(100) NOT NULL,
	"strength" integer DEFAULT 50,
	"description" text,
	"ai_reasoning" text,
	"confidence_score" integer DEFAULT 0,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "yorha_evidence_nodes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"case_id" uuid NOT NULL,
	"title" varchar(500) NOT NULL,
	"description" text,
	"evidence_type" varchar(100) NOT NULL,
	"position_x" integer DEFAULT 0,
	"position_y" integer DEFAULT 0,
	"color" varchar(20) DEFAULT 'blue',
	"icon" varchar(100),
	"source" varchar(500),
	"date_collected" timestamp with time zone,
	"relevance_score" integer DEFAULT 0,
	"file_path" varchar(1000),
	"file_type" varchar(100),
	"file_size" integer,
	"ai_summary" text,
	"ai_tags" jsonb,
	"key_entities" jsonb,
	"status" varchar(50) DEFAULT 'active' NOT NULL,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "yorha_system_metrics" (
	"id" serial PRIMARY KEY NOT NULL,
	"cpu_usage" integer,
	"cpu_cores" integer,
	"memory_usage" integer,
	"memory_total_gb" integer,
	"memory_used_gb" integer,
	"gpu_usage" integer,
	"gpu_memory_usage" integer,
	"gpu_temperature" integer,
	"disk_usage" integer,
	"disk_total_gb" integer,
	"disk_used_gb" integer,
	"network_latency_ms" integer,
	"network_bandwidth_mbps" integer,
	"system_health" varchar(50) DEFAULT 'healthy',
	"active_cases" integer DEFAULT 0,
	"active_sessions" integer DEFAULT 0,
	"recorded_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "error_clusters" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "error_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"route_path" text NOT NULL,
	"file_path" text,
	"message" text NOT NULL,
	"stack_trace" text,
	"ts_code" text,
	"severity" text DEFAULT 'error' NOT NULL,
	"cluster_id" uuid,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "error_suggestions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"route_path" text NOT NULL,
	"summary" text NOT NULL,
	"patch" text NOT NULL,
	"risk_level" text DEFAULT 'medium',
	"source" text DEFAULT 'synthesized',
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "route_health" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"route_path" text NOT NULL,
	"file" text,
	"state" text DEFAULT 'healthy' NOT NULL,
	"recent_error_count" integer DEFAULT 0,
	"total_error_count" integer DEFAULT 0,
	"last_error_at" timestamp,
	"last_error_cluster_id" uuid,
	"last_error_message_short" text,
	"updated_at" timestamp DEFAULT now(),
	"created_at" timestamp DEFAULT now(),
	CONSTRAINT "route_health_route_path_unique" UNIQUE("route_path")
);
--> statement-breakpoint
CREATE TABLE "error_brain_analysis" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"route_id" varchar(255) NOT NULL,
	"suggestions" jsonb NOT NULL,
	"selected_suggestion_index" integer,
	"phase" varchar(50),
	"error_message" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"completed_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "error_brain_patch" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"analysis_id" uuid NOT NULL,
	"route_id" varchar(255) NOT NULL,
	"patch_content" text NOT NULL,
	"applied_at" timestamp,
	"verification_status" varchar(50),
	"verification_timestamp" timestamp,
	"verification_message" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "error_cluster" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"route_id" varchar(255) NOT NULL,
	"tool" varchar(100) NOT NULL,
	"code" varchar(100) NOT NULL,
	"message" text NOT NULL,
	"severity" varchar(50) NOT NULL,
	"count" integer DEFAULT 1 NOT NULL,
	"file_path" varchar(255),
	"raw_log_snippet" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"resolved_at" timestamp,
	"archived_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "route_health_event" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"route_id" varchar(255) NOT NULL,
	"old_status" varchar(50),
	"new_status" varchar(50) NOT NULL,
	"reason" varchar(255),
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "route_interaction_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"route_id" varchar(255) NOT NULL,
	"user_id" varchar(255),
	"interaction_type" varchar(50) NOT NULL,
	"metadata" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "route_metadata" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"route_id" varchar(255) NOT NULL,
	"path" varchar(255) NOT NULL,
	"kind" varchar(50) NOT NULL,
	"group" varchar(100),
	"status" varchar(50) DEFAULT 'healthy',
	"priority" integer DEFAULT 50,
	"badges" jsonb DEFAULT '[]'::jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"archived_at" timestamp,
	CONSTRAINT "route_metadata_route_id_unique" UNIQUE("route_id")
);
--> statement-breakpoint
ALTER TABLE "ai_history" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "cases" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "citations" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "code_embeddings" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "document_processing_tasks" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "document_chunks" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "documents" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "evidence" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "knowledge_base" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "legal_analysis_cache" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "messages" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "profile" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "rag_documents" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "sessions" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "users" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "vector_similarity_queries" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP TABLE "ai_history" CASCADE;--> statement-breakpoint
DROP TABLE "cases" CASCADE;--> statement-breakpoint
DROP TABLE "citations" CASCADE;--> statement-breakpoint
DROP TABLE "code_embeddings" CASCADE;--> statement-breakpoint
DROP TABLE "document_processing_tasks" CASCADE;--> statement-breakpoint
DROP TABLE "document_chunks" CASCADE;--> statement-breakpoint
DROP TABLE "documents" CASCADE;--> statement-breakpoint
DROP TABLE "evidence" CASCADE;--> statement-breakpoint
DROP TABLE "knowledge_base" CASCADE;--> statement-breakpoint
DROP TABLE "legal_analysis_cache" CASCADE;--> statement-breakpoint
DROP TABLE "messages" CASCADE;--> statement-breakpoint
DROP TABLE "profile" CASCADE;--> statement-breakpoint
DROP TABLE "rag_documents" CASCADE;--> statement-breakpoint
DROP TABLE "sessions" CASCADE;--> statement-breakpoint
DROP TABLE "users" CASCADE;--> statement-breakpoint
DROP TABLE "vector_similarity_queries" CASCADE;--> statement-breakpoint
DROP INDEX "embedding_idx";--> statement-breakpoint
ALTER TABLE "legal_documents" ALTER COLUMN "model_version" SET DEFAULT 'gemma3-legal, latest';--> statement-breakpoint
ALTER TABLE "yorha_cases" ADD CONSTRAINT "yorha_cases_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "yorha_cases" ADD CONSTRAINT "yorha_cases_assigned_to_users_id_fk" FOREIGN KEY ("assigned_to") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "yorha_chat_messages" ADD CONSTRAINT "yorha_chat_messages_session_id_yorha_chat_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."yorha_chat_sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "yorha_chat_sessions" ADD CONSTRAINT "yorha_chat_sessions_case_id_yorha_cases_id_fk" FOREIGN KEY ("case_id") REFERENCES "public"."yorha_cases"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "yorha_evidence_connections" ADD CONSTRAINT "yorha_evidence_connections_case_id_yorha_cases_id_fk" FOREIGN KEY ("case_id") REFERENCES "public"."yorha_cases"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "yorha_evidence_connections" ADD CONSTRAINT "yorha_evidence_connections_source_node_id_yorha_evidence_nodes_id_fk" FOREIGN KEY ("source_node_id") REFERENCES "public"."yorha_evidence_nodes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "yorha_evidence_connections" ADD CONSTRAINT "yorha_evidence_connections_target_node_id_yorha_evidence_nodes_id_fk" FOREIGN KEY ("target_node_id") REFERENCES "public"."yorha_evidence_nodes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "yorha_evidence_connections" ADD CONSTRAINT "yorha_evidence_connections_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "yorha_evidence_nodes" ADD CONSTRAINT "yorha_evidence_nodes_case_id_yorha_cases_id_fk" FOREIGN KEY ("case_id") REFERENCES "public"."yorha_cases"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "yorha_evidence_nodes" ADD CONSTRAINT "yorha_evidence_nodes_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "error_events" ADD CONSTRAINT "error_events_cluster_id_error_clusters_id_fk" FOREIGN KEY ("cluster_id") REFERENCES "public"."error_clusters"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "error_brain_analysis" ADD CONSTRAINT "error_brain_analysis_route_id_route_metadata_route_id_fk" FOREIGN KEY ("route_id") REFERENCES "public"."route_metadata"("route_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "error_brain_patch" ADD CONSTRAINT "error_brain_patch_analysis_id_error_brain_analysis_id_fk" FOREIGN KEY ("analysis_id") REFERENCES "public"."error_brain_analysis"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "error_brain_patch" ADD CONSTRAINT "error_brain_patch_route_id_route_metadata_route_id_fk" FOREIGN KEY ("route_id") REFERENCES "public"."route_metadata"("route_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "error_cluster" ADD CONSTRAINT "error_cluster_route_id_route_metadata_route_id_fk" FOREIGN KEY ("route_id") REFERENCES "public"."route_metadata"("route_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "route_health_event" ADD CONSTRAINT "route_health_event_route_id_route_metadata_route_id_fk" FOREIGN KEY ("route_id") REFERENCES "public"."route_metadata"("route_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "route_interaction_log" ADD CONSTRAINT "route_interaction_log_route_id_route_metadata_route_id_fk" FOREIGN KEY ("route_id") REFERENCES "public"."route_metadata"("route_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "poi_name_idx" ON "persons_of_interest" USING btree ("name");--> statement-breakpoint
CREATE INDEX "poi_threat_level_idx" ON "persons_of_interest" USING btree ("threat_level");--> statement-breakpoint
CREATE INDEX "poi_status_idx" ON "persons_of_interest" USING btree ("status");--> statement-breakpoint
CREATE INDEX "poi_relationship_idx" ON "persons_of_interest" USING btree ("relationship");--> statement-breakpoint
CREATE INDEX "poi_created_at_idx" ON "persons_of_interest" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "poi_case_ids_idx" ON "persons_of_interest" USING btree ("case_ids");--> statement-breakpoint
CREATE INDEX "idx_error_brain_analysis_route_id" ON "error_brain_analysis" USING btree ("route_id");--> statement-breakpoint
CREATE INDEX "idx_error_brain_analysis_created_at" ON "error_brain_analysis" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "idx_error_brain_patch_analysis_id" ON "error_brain_patch" USING btree ("analysis_id");--> statement-breakpoint
CREATE INDEX "idx_error_brain_patch_route_id" ON "error_brain_patch" USING btree ("route_id");--> statement-breakpoint
CREATE INDEX "idx_error_brain_patch_verification_status" ON "error_brain_patch" USING btree ("verification_status");--> statement-breakpoint
CREATE INDEX "idx_error_cluster_route_id" ON "error_cluster" USING btree ("route_id");--> statement-breakpoint
CREATE INDEX "idx_error_cluster_severity" ON "error_cluster" USING btree ("severity");--> statement-breakpoint
CREATE INDEX "idx_error_cluster_created_at" ON "error_cluster" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "idx_error_cluster_resolved_at" ON "error_cluster" USING btree ("resolved_at");--> statement-breakpoint
CREATE INDEX "idx_error_cluster_tool" ON "error_cluster" USING btree ("tool");--> statement-breakpoint
CREATE INDEX "idx_route_health_event_route_id" ON "route_health_event" USING btree ("route_id");--> statement-breakpoint
CREATE INDEX "idx_route_health_event_created_at" ON "route_health_event" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "idx_route_interaction_log_route_id" ON "route_interaction_log" USING btree ("route_id");--> statement-breakpoint
CREATE INDEX "idx_route_interaction_log_user_id" ON "route_interaction_log" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "idx_route_interaction_log_created_at" ON "route_interaction_log" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "idx_route_metadata_route_id" ON "route_metadata" USING btree ("route_id");--> statement-breakpoint
CREATE INDEX "idx_route_metadata_status" ON "route_metadata" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_route_metadata_archived_at" ON "route_metadata" USING btree ("archived_at");--> statement-breakpoint
CREATE INDEX "embedding_idx" ON "legal_documents" USING ivfflat ("embedding");