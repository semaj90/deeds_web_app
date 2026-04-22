CREATE TABLE "agent_sessions" (
	"id" serial PRIMARY KEY NOT NULL,
	"session_id" varchar(255) NOT NULL,
	"lane" varchar(64) NOT NULL,
	"task_type" varchar(64) NOT NULL,
	"status" varchar(32) DEFAULT 'active' NOT NULL,
	"outcome" text,
	"metadata" jsonb DEFAULT '{}'::jsonb,
	"start_time" timestamp with time zone DEFAULT now() NOT NULL,
	"end_time" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "agent_sessions_session_id_unique" UNIQUE("session_id")
);
--> statement-breakpoint
CREATE TABLE "ast_edges" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"repo_id" text DEFAULT 'default' NOT NULL,
	"source_node_id" uuid NOT NULL,
	"target_node_id" uuid NOT NULL,
	"edge_type" text NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ast_file_features" (
	"repo_id" text DEFAULT 'default' NOT NULL,
	"file_path" text NOT NULL,
	"language" text,
	"extension" text,
	"import_count" integer DEFAULT 0 NOT NULL,
	"export_count" integer DEFAULT 0 NOT NULL,
	"function_count" integer DEFAULT 0 NOT NULL,
	"class_count" integer DEFAULT 0 NOT NULL,
	"call_count" integer DEFAULT 0 NOT NULL,
	"semantic_tags" text[] DEFAULT ARRAY[]::text[] NOT NULL,
	"domain" text,
	"parser" text DEFAULT 'heuristic' NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ast_file_features_repo_id_file_path_pk" PRIMARY KEY("repo_id","file_path")
);
--> statement-breakpoint
CREATE TABLE "ast_nodes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"repo_id" text DEFAULT 'default' NOT NULL,
	"file_path" text NOT NULL,
	"symbol" text,
	"kind" text NOT NULL,
	"start_line" integer,
	"end_line" integer,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "context_buffers" (
	"buffer_key" text PRIMARY KEY NOT NULL,
	"repo_id" text DEFAULT 'default' NOT NULL,
	"content" text NOT NULL,
	"token_count" integer,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"expires_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "web_search_index" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"query" text NOT NULL,
	"cluster_id" integer,
	"url" text NOT NULL,
	"title" text,
	"content" text NOT NULL,
	"snippet" text,
	"provider" text DEFAULT 'searxng' NOT NULL,
	"content_hash" varchar(16) NOT NULL,
	"embedding" vector(768),
	"relevance_score" real DEFAULT 0 NOT NULL,
	"run_id" text,
	"indexed_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "wsi_content_hash_unique" UNIQUE("content_hash")
);
--> statement-breakpoint
ALTER TABLE "codebase_chunk_index" ADD COLUMN "som_bmu_row" integer;--> statement-breakpoint
ALTER TABLE "codebase_chunk_index" ADD COLUMN "som_bmu_col" integer;--> statement-breakpoint
ALTER TABLE "codebase_chunk_index" ADD COLUMN "cluster_summary" jsonb DEFAULT '{}'::jsonb;--> statement-breakpoint
CREATE INDEX "idx_agent_sessions_id" ON "agent_sessions" USING btree ("session_id");--> statement-breakpoint
CREATE INDEX "idx_agent_sessions_lane" ON "agent_sessions" USING btree ("lane");--> statement-breakpoint
CREATE INDEX "idx_agent_sessions_status" ON "agent_sessions" USING btree ("status");--> statement-breakpoint
CREATE INDEX "ast_edges_source_idx" ON "ast_edges" USING btree ("source_node_id");--> statement-breakpoint
CREATE INDEX "ast_edges_target_idx" ON "ast_edges" USING btree ("target_node_id");--> statement-breakpoint
CREATE INDEX "ast_edges_type_repo_idx" ON "ast_edges" USING btree ("edge_type","repo_id");--> statement-breakpoint
CREATE INDEX "ast_file_features_lang_idx" ON "ast_file_features" USING btree ("language");--> statement-breakpoint
CREATE INDEX "ast_file_features_domain_idx" ON "ast_file_features" USING btree ("domain");--> statement-breakpoint
CREATE INDEX "ast_nodes_file_path_idx" ON "ast_nodes" USING btree ("file_path");--> statement-breakpoint
CREATE INDEX "ast_nodes_kind_idx" ON "ast_nodes" USING btree ("kind");--> statement-breakpoint
CREATE INDEX "ast_nodes_repo_file_idx" ON "ast_nodes" USING btree ("repo_id","file_path");--> statement-breakpoint
CREATE INDEX "wsi_cluster_score" ON "web_search_index" USING btree ("cluster_id","relevance_score");--> statement-breakpoint
CREATE INDEX "wsi_indexed_at" ON "web_search_index" USING btree ("indexed_at");--> statement-breakpoint
CREATE INDEX "wsi_run_id" ON "web_search_index" USING btree ("run_id");