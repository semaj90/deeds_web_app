CREATE TABLE "ace_error_embeddings" (
	"id" serial PRIMARY KEY NOT NULL,
	"error_id" text,
	"embedding" jsonb,
	"metadata" jsonb,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "cpg_edges" (
	"id" serial PRIMARY KEY NOT NULL,
	"source_id" integer,
	"target_id" integer,
	"edge_type" text,
	"properties" jsonb,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "cpg_nodes" (
	"id" serial PRIMARY KEY NOT NULL,
	"node_type" text,
	"file_path" text,
	"name" text,
	"properties" jsonb,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "document_embeddings" (
	"id" serial PRIMARY KEY NOT NULL,
	"document_id" text,
	"embedding" jsonb,
	"metadata" jsonb,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "error_topk_index" (
	"id" serial PRIMARY KEY NOT NULL,
	"error_code" text,
	"file_path" text,
	"count" integer,
	"rank" integer,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "file_index" (
	"id" serial PRIMARY KEY NOT NULL,
	"file_path" text,
	"file_type" text,
	"size" integer,
	"hash" text,
	"metadata" jsonb,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "kg_nodes" (
	"id" serial PRIMARY KEY NOT NULL,
	"node_type" text,
	"label" text,
	"properties" jsonb,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "multi_db_transactions" (
	"id" serial PRIMARY KEY NOT NULL,
	"transaction_id" text,
	"status" text,
	"metadata" jsonb,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "phase89_agentic_calls" (
	"id" serial PRIMARY KEY NOT NULL,
	"call_id" text,
	"tool_name" text,
	"input" jsonb,
	"output" jsonb,
	"duration" integer,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "phase89_ast_signatures" (
	"id" serial PRIMARY KEY NOT NULL,
	"file_path" text,
	"signature" text,
	"node_type" text,
	"metadata" jsonb,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "phase89_cache_hits" (
	"id" serial PRIMARY KEY NOT NULL,
	"cache_key" text,
	"hit_count" integer,
	"last_hit" timestamp,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "phase89_collection_summaries" (
	"id" serial PRIMARY KEY NOT NULL,
	"collection_name" text,
	"summary" text,
	"metadata" jsonb,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "phase89_cosine_rankings" (
	"id" serial PRIMARY KEY NOT NULL,
	"query_hash" text,
	"rankings" jsonb,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "phase89_edit_comparisons" (
	"id" serial PRIMARY KEY NOT NULL,
	"before_hash" text,
	"after_hash" text,
	"diff" jsonb,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "phase89_edit_log" (
	"id" serial PRIMARY KEY NOT NULL,
	"file_path" text,
	"edit_type" text,
	"details" jsonb,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "phase89_embeddings" (
	"id" serial PRIMARY KEY NOT NULL,
	"error_hash" text,
	"embedding" jsonb,
	"metadata" jsonb,
	"dimensions" integer,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "phase89_error_clusters" (
	"id" serial PRIMARY KEY NOT NULL,
	"cluster_id" text,
	"centroid" jsonb,
	"member_count" integer,
	"metadata" jsonb,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "phase89_error_instances" (
	"id" serial PRIMARY KEY NOT NULL,
	"error_hash" text,
	"file_path" text,
	"line" integer,
	"column" integer,
	"message" text,
	"code" text,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "phase89_file_timeline" (
	"id" serial PRIMARY KEY NOT NULL,
	"file_path" text,
	"events" jsonb,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "phase89_fix_attempts" (
	"id" serial PRIMARY KEY NOT NULL,
	"error_hash" text,
	"fix_code" text,
	"success" boolean,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "phase89_import_edges" (
	"id" serial PRIMARY KEY NOT NULL,
	"source_file" text,
	"target_file" text,
	"import_type" text,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "phase89_kb_cards" (
	"id" serial PRIMARY KEY NOT NULL,
	"title" text,
	"content" text,
	"tags" jsonb,
	"metadata" jsonb,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "phase89_ripgrep_cache" (
	"id" serial PRIMARY KEY NOT NULL,
	"query" text,
	"results" jsonb,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "phase89_tag_mirror" (
	"id" serial PRIMARY KEY NOT NULL,
	"tag_name" text,
	"metadata" jsonb,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "phase89_timeline" (
	"id" serial PRIMARY KEY NOT NULL,
	"event_type" text,
	"event_data" jsonb,
	"timestamp" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "phase89_unit_index" (
	"id" serial PRIMARY KEY NOT NULL,
	"unit_type" text,
	"unit_name" text,
	"file_path" text,
	"metadata" jsonb,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "phase89_vector_events" (
	"id" serial PRIMARY KEY NOT NULL,
	"event_type" text,
	"vector_data" jsonb,
	"metadata" jsonb,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "phase89_vector_events_vlm" (
	"id" serial PRIMARY KEY NOT NULL,
	"event_type" text,
	"vector_data" jsonb,
	"metadata" jsonb,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "raw_error_embeddings" (
	"id" serial PRIMARY KEY NOT NULL,
	"error_hash" text,
	"embedding" jsonb,
	"metadata" jsonb,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "ts_errors" (
	"id" serial PRIMARY KEY NOT NULL,
	"file_path" text,
	"line" integer,
	"column" integer,
	"error_code" text,
	"message" text,
	"severity" text,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
ALTER TABLE "evidence" ADD COLUMN "user_id" uuid;