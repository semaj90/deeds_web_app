DROP TABLE IF EXISTS "citations";
CREATE TABLE "citations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"case_id" uuid,
	"document_id" text,
	"citation_text" text NOT NULL,
	"citation_type" text,
	"source" text,
	"page_number" integer,
	"relevance_score" numeric(3, 2),
	"context" text,
	"verified" boolean DEFAULT false,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"metadata" jsonb DEFAULT '{}'
);
--> statement-breakpoint
DROP TABLE IF EXISTS "code_embeddings";
CREATE TABLE "code_embeddings" (
	"id" serial PRIMARY KEY NOT NULL,
	"path" text NOT NULL,
	"content_hash" text NOT NULL,
	"embedding" vector(768),
	"metadata" jsonb DEFAULT '{}',
	"error_patterns" text[],
	"repair_suggestions" text[],
	"confidence_score" real,
	"last_updated" timestamp DEFAULT now(),
	CONSTRAINT "code_embeddings_path_unique" UNIQUE("path")
);
--> statement-breakpoint
DROP TABLE IF EXISTS "document_processing_tasks";
CREATE TABLE "document_processing_tasks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"document_id" uuid NOT NULL,
	"task_type" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"requested_at" timestamp with time zone DEFAULT now() NOT NULL,
	"started_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"results" jsonb,
	"error" text,
	"model_used" text,
	"processing_time" integer,
	"tokens_used" integer,
	"confidence_score" real,
	"requested_options" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DROP TABLE IF EXISTS "embedding_cache";
CREATE TABLE "embedding_cache" (
	"text_hash" text PRIMARY KEY NOT NULL,
	"embedding" vector(1536) NOT NULL,
	"model" text NOT NULL,
	"dimensions" integer NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "evidence" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"case_id" uuid NOT NULL,
	"user_id" integer NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"evidence_type" text,
	"source" text,
	"date_collected" timestamp,
	"relevance_score" numeric(3, 2),
	"confidentiality_level" text DEFAULT 'standard',
	"file_url" text,
	"embedding" vector(384),
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"metadata" jsonb DEFAULT '{}'
);
--> statement-breakpoint
CREATE TABLE "knowledge_base" (
	"id" serial PRIMARY KEY NOT NULL,
	"chunk_id" text NOT NULL,
	"content" text NOT NULL,
	"embedding" vector(768),
	"metadata" jsonb DEFAULT '{}',
	"chunk_type" text NOT NULL,
	"source_file" text,
	"created_at" timestamp DEFAULT now(),
	CONSTRAINT "knowledge_base_chunk_id_unique" UNIQUE("chunk_id")
);
--> statement-breakpoint
CREATE TABLE "legal_analysis_cache" (
	"id" serial PRIMARY KEY NOT NULL,
	"input_hash" text NOT NULL,
	"prompt_text" text NOT NULL,
	"context_documents" jsonb,
	"analysis_type" text NOT NULL,
	"analysis_content" text NOT NULL,
	"analysis_embedding" vector(512),
	"model_version" text DEFAULT 'gemma3-legal:latest',
	"processing_time_ms" real,
	"token_count" real,
	"access_count" real DEFAULT 1,
	"last_accessed_at" timestamp DEFAULT now(),
	"expires_at" timestamp,
	"created_at" timestamp DEFAULT now(),
	CONSTRAINT "legal_analysis_cache_input_hash_unique" UNIQUE("input_hash")
);
--> statement-breakpoint
CREATE TABLE "legal_documents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"title" text NOT NULL,
	"content" text NOT NULL,
	"document_type" text NOT NULL,
	"embedding" vector(512) NOT NULL,
	"practice_area" text,
	"jurisdiction" text,
	"case_id" text,
	"client_id" text,
	"confidentiality_level" text DEFAULT 'standard',
	"document_status" text DEFAULT 'active',
	"processing_time_ms" real,
	"model_version" text DEFAULT 'gemma3-legal:latest',
	"document_hash" text,
	"original_filename" text,
	"file_size" real,
	"mime_type" text,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	"last_accessed_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "messages" (
	"id" text PRIMARY KEY NOT NULL,
	"session_id" text NOT NULL,
	"content" text NOT NULL,
	"role" text NOT NULL,
	"timestamp" timestamp with time zone DEFAULT now() NOT NULL,
	"embedding" jsonb,
	"metadata" jsonb,
	"model" text DEFAULT 'gemma3-legal' NOT NULL,
	"confidence" integer
);
--> statement-breakpoint
CREATE TABLE "profile" (
	"id" uuid PRIMARY KEY NOT NULL,
	"first_name" text NOT NULL,
	"last_name" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "rag_documents" (
	"id" serial PRIMARY KEY NOT NULL,
	"filename" text NOT NULL,
	"content_hash" text NOT NULL,
	"file_type" text,
	"file_size" integer,
	"content" text,
	"metadata" jsonb DEFAULT '{}',
	"embedding" vector(768),
	"processed_at" timestamp DEFAULT now(),
	"created_at" timestamp DEFAULT now(),
	CONSTRAINT "rag_documents_content_hash_unique" UNIQUE("content_hash")
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"message_count" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" serial PRIMARY KEY NOT NULL,
	"email" text NOT NULL,
	"username" text NOT NULL,
	"password_hash" text NOT NULL,
	"first_name" text,
	"last_name" text,
	"role" text DEFAULT 'user',
	"is_active" boolean DEFAULT true,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email"),
	CONSTRAINT "users_username_unique" UNIQUE("username")
);
--> statement-breakpoint
CREATE TABLE "vector_similarity_queries" (
	"id" serial PRIMARY KEY NOT NULL,
	"query_text" text NOT NULL,
	"query_embedding" vector(512) NOT NULL,
	"user_id" text,
	"session_id" text,
	"practice_area_filter" text,
	"document_type_filter" text,
	"response_time_ms" real NOT NULL,
	"results_count" real NOT NULL,
	"similarity_threshold" real DEFAULT 0.7,
	"top_results" jsonb,
	"query_intent" text,
	"user_satisfaction" real,
	"timestamp" timestamp DEFAULT now()
);
--> statement-breakpoint
ALTER TABLE "error_logs" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "indexed_files" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "ai_engine_status" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "gpu_inference_messages" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "gpu_inference_sessions" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "gpu_performance_metrics" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "extracted_entities" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "processing_jobs" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "rag_queries" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "rag_query_results" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "case_summary_vectors" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "document_vectors" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "evidence_vectors" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "knowledge_edges" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "knowledge_nodes" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "query_vectors" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "recommendation_cache" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP TABLE "error_logs" CASCADE;--> statement-breakpoint
DROP TABLE "indexed_files" CASCADE;--> statement-breakpoint
DROP TABLE "ai_engine_status" CASCADE;--> statement-breakpoint
DROP TABLE "gpu_inference_messages" CASCADE;--> statement-breakpoint
DROP TABLE "gpu_inference_sessions" CASCADE;--> statement-breakpoint
DROP TABLE "gpu_performance_metrics" CASCADE;--> statement-breakpoint
DROP TABLE "extracted_entities" CASCADE;--> statement-breakpoint
DROP TABLE "processing_jobs" CASCADE;--> statement-breakpoint
DROP TABLE "rag_queries" CASCADE;--> statement-breakpoint
DROP TABLE "rag_query_results" CASCADE;--> statement-breakpoint
DROP TABLE "case_summary_vectors" CASCADE;--> statement-breakpoint
DROP TABLE "document_vectors" CASCADE;--> statement-breakpoint
DROP TABLE "evidence_vectors" CASCADE;--> statement-breakpoint
DROP TABLE "knowledge_edges" CASCADE;--> statement-breakpoint
DROP TABLE "knowledge_nodes" CASCADE;--> statement-breakpoint
DROP TABLE "query_vectors" CASCADE;--> statement-breakpoint
DROP TABLE "recommendation_cache" CASCADE;--> statement-breakpoint
ALTER TABLE "cases" DROP CONSTRAINT "cases_uuid_unique";--> statement-breakpoint
ALTER TABLE "document_chunks" DROP CONSTRAINT "document_chunks_uuid_unique";--> statement-breakpoint
ALTER TABLE "documents" DROP CONSTRAINT "documents_uuid_unique";--> statement-breakpoint
ALTER TABLE "document_chunks" DROP CONSTRAINT "document_chunks_document_id_documents_id_fk";
--> statement-breakpoint
ALTER TABLE "documents" DROP CONSTRAINT "documents_case_id_cases_id_fk";
--> statement-breakpoint
ALTER TABLE "ai_history" ALTER COLUMN "user_id" SET DATA TYPE integer;--> statement-breakpoint
ALTER TABLE "ai_history" ALTER COLUMN "user_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "ai_history" ALTER COLUMN "prompt" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "ai_history" ALTER COLUMN "response" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "ai_history" ALTER COLUMN "created_at" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "cases" ALTER COLUMN "id" SET DATA TYPE uuid;--> statement-breakpoint
ALTER TABLE "cases" ALTER COLUMN "id" SET DEFAULT gen_random_uuid();--> statement-breakpoint
ALTER TABLE "cases" ALTER COLUMN "title" SET DATA TYPE text;--> statement-breakpoint
ALTER TABLE "cases" ALTER COLUMN "status" SET DATA TYPE text;--> statement-breakpoint
ALTER TABLE "cases" ALTER COLUMN "status" SET DEFAULT 'active';--> statement-breakpoint
ALTER TABLE "cases" ALTER COLUMN "status" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "cases" ALTER COLUMN "metadata" SET DEFAULT '{}';--> statement-breakpoint
ALTER TABLE "document_chunks" ALTER COLUMN "id" SET DATA TYPE uuid;--> statement-breakpoint
ALTER TABLE "document_chunks" ALTER COLUMN "id" SET DEFAULT gen_random_uuid();--> statement-breakpoint
ALTER TABLE "document_chunks" ALTER COLUMN "document_id" SET DATA TYPE text;--> statement-breakpoint
ALTER TABLE "document_chunks" ALTER COLUMN "document_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "document_chunks" ALTER COLUMN "embedding" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "document_chunks" ALTER COLUMN "metadata" SET DEFAULT '{}';--> statement-breakpoint
ALTER TABLE "documents" ALTER COLUMN "id" SET DATA TYPE text;--> statement-breakpoint
ALTER TABLE "documents" ALTER COLUMN "id" SET DEFAULT 'doc_1761377015078';--> statement-breakpoint
ALTER TABLE "documents" ALTER COLUMN "case_id" SET DATA TYPE uuid;--> statement-breakpoint
ALTER TABLE "documents" ALTER COLUMN "case_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "documents" ALTER COLUMN "file_size" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "documents" ALTER COLUMN "metadata" SET DEFAULT '{}';--> statement-breakpoint
ALTER TABLE "ai_history" ADD COLUMN "agent_type" text NOT NULL;--> statement-breakpoint
ALTER TABLE "ai_history" ADD COLUMN "interaction_type" text NOT NULL;--> statement-breakpoint
ALTER TABLE "ai_history" ADD COLUMN "model_used" text;--> statement-breakpoint
ALTER TABLE "ai_history" ADD COLUMN "tokens_used" integer;--> statement-breakpoint
ALTER TABLE "ai_history" ADD COLUMN "metadata" jsonb DEFAULT '{}';--> statement-breakpoint
ALTER TABLE "cases" ADD COLUMN "user_id" integer NOT NULL;--> statement-breakpoint
ALTER TABLE "cases" ADD COLUMN "case_number" text;--> statement-breakpoint
ALTER TABLE "cases" ADD COLUMN "jurisdiction" text;--> statement-breakpoint
ALTER TABLE "cases" ADD COLUMN "practice_area" text;--> statement-breakpoint
ALTER TABLE "cases" ADD COLUMN "priority" text DEFAULT 'medium';--> statement-breakpoint
ALTER TABLE "document_chunks" ADD COLUMN "evidence_id" uuid;--> statement-breakpoint
ALTER TABLE "document_chunks" ADD COLUMN "chunk_text" text NOT NULL;--> statement-breakpoint
ALTER TABLE "document_chunks" ADD COLUMN "token_count" integer;--> statement-breakpoint
ALTER TABLE "documents" ADD COLUMN "user_id" integer NOT NULL;--> statement-breakpoint
ALTER TABLE "documents" ADD COLUMN "title" text NOT NULL;--> statement-breakpoint
ALTER TABLE "documents" ADD COLUMN "description" text;--> statement-breakpoint
ALTER TABLE "documents" ADD COLUMN "content_text" text;--> statement-breakpoint
ALTER TABLE "documents" ADD COLUMN "file_path" text;--> statement-breakpoint
ALTER TABLE "documents" ADD COLUMN "file_type" text;--> statement-breakpoint
ALTER TABLE "documents" ADD COLUMN "embedding" vector(384);--> statement-breakpoint
ALTER TABLE "documents" ADD COLUMN "tags" text[];--> statement-breakpoint
ALTER TABLE "citations" ADD CONSTRAINT "citations_case_id_cases_id_fk" FOREIGN KEY ("case_id") REFERENCES "public"."cases"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "citations" ADD CONSTRAINT "citations_document_id_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."documents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_processing_tasks" ADD CONSTRAINT "document_processing_tasks_document_id_legal_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."legal_documents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "evidence" ADD CONSTRAINT "evidence_case_id_cases_id_fk" FOREIGN KEY ("case_id") REFERENCES "public"."cases"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "evidence" ADD CONSTRAINT "evidence_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_session_id_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."sessions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "code_embedding_idx" ON "code_embeddings" USING ivfflat ("embedding") WITH (lists=100);--> statement-breakpoint
CREATE INDEX "code_path_idx" ON "code_embeddings" USING btree ("path");--> statement-breakpoint
CREATE INDEX "code_content_hash_idx" ON "code_embeddings" USING btree ("content_hash");--> statement-breakpoint
CREATE INDEX "evidence_case_id_idx" ON "evidence" USING btree ("case_id");--> statement-breakpoint
CREATE INDEX "evidence_user_id_idx" ON "evidence" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "evidence_type_idx" ON "evidence" USING btree ("evidence_type");--> statement-breakpoint
CREATE INDEX "evidence_embedding_idx" ON "evidence" USING ivfflat ("embedding") WITH (lists=100);--> statement-breakpoint
CREATE INDEX "kb_embedding_idx" ON "knowledge_base" USING ivfflat ("embedding") WITH (lists=100);--> statement-breakpoint
CREATE INDEX "kb_chunk_type_idx" ON "knowledge_base" USING btree ("chunk_type");--> statement-breakpoint
CREATE INDEX "kb_source_file_idx" ON "knowledge_base" USING btree ("source_file");--> statement-breakpoint
CREATE INDEX "input_hash_idx" ON "legal_analysis_cache" USING btree ("input_hash");--> statement-breakpoint
CREATE INDEX "analysis_type_idx" ON "legal_analysis_cache" USING btree ("analysis_type");--> statement-breakpoint
CREATE INDEX "last_accessed_idx" ON "legal_analysis_cache" USING btree ("last_accessed_at");--> statement-breakpoint
CREATE INDEX "expires_at_idx" ON "legal_analysis_cache" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "embedding_idx" ON "legal_documents" USING btree ("embedding");--> statement-breakpoint
CREATE INDEX "document_type_idx" ON "legal_documents" USING btree ("document_type");--> statement-breakpoint
CREATE INDEX "practice_area_idx" ON "legal_documents" USING btree ("practice_area");--> statement-breakpoint
CREATE INDEX "case_id_idx" ON "legal_documents" USING btree ("case_id");--> statement-breakpoint
CREATE INDEX "client_id_idx" ON "legal_documents" USING btree ("client_id");--> statement-breakpoint
CREATE INDEX "created_at_idx" ON "legal_documents" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "document_hash_idx" ON "legal_documents" USING btree ("document_hash");--> statement-breakpoint
CREATE INDEX "rag_embedding_idx" ON "rag_documents" USING ivfflat ("embedding") WITH (lists=100);--> statement-breakpoint
CREATE INDEX "rag_content_hash_idx" ON "rag_documents" USING btree ("content_hash");--> statement-breakpoint
CREATE INDEX "users_email_idx" ON "users" USING btree ("email");--> statement-breakpoint
CREATE INDEX "users_username_idx" ON "users" USING btree ("username");--> statement-breakpoint
CREATE INDEX "user_id_idx" ON "vector_similarity_queries" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "session_id_idx" ON "vector_similarity_queries" USING btree ("session_id");--> statement-breakpoint
CREATE INDEX "timestamp_idx" ON "vector_similarity_queries" USING btree ("timestamp");--> statement-breakpoint
CREATE INDEX "query_intent_idx" ON "vector_similarity_queries" USING btree ("query_intent");--> statement-breakpoint
ALTER TABLE "ai_history" ADD CONSTRAINT "ai_history_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cases" ADD CONSTRAINT "cases_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_chunks" ADD CONSTRAINT "document_chunks_evidence_id_evidence_id_fk" FOREIGN KEY ("evidence_id") REFERENCES "public"."evidence"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_chunks" ADD CONSTRAINT "document_chunks_document_id_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."documents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "documents" ADD CONSTRAINT "documents_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "documents" ADD CONSTRAINT "documents_case_id_cases_id_fk" FOREIGN KEY ("case_id") REFERENCES "public"."cases"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "cases_user_id_idx" ON "cases" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "cases_status_idx" ON "cases" USING btree ("status");--> statement-breakpoint
CREATE INDEX "cases_case_number_idx" ON "cases" USING btree ("case_number");--> statement-breakpoint
CREATE INDEX "documents_case_id_idx" ON "documents" USING btree ("case_id");--> statement-breakpoint
CREATE INDEX "documents_user_id_idx" ON "documents" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "documents_file_type_idx" ON "documents" USING btree ("file_type");--> statement-breakpoint
CREATE INDEX "documents_embedding_idx" ON "documents" USING ivfflat ("embedding") WITH (lists=100);--> statement-breakpoint
ALTER TABLE "ai_history" DROP COLUMN "embedding";--> statement-breakpoint
ALTER TABLE "cases" DROP COLUMN "uuid";--> statement-breakpoint
ALTER TABLE "document_chunks" DROP COLUMN "uuid";--> statement-breakpoint
ALTER TABLE "document_chunks" DROP COLUMN "content";--> statement-breakpoint
ALTER TABLE "document_chunks" DROP COLUMN "word_count";--> statement-breakpoint
ALTER TABLE "documents" DROP COLUMN "uuid";--> statement-breakpoint
ALTER TABLE "documents" DROP COLUMN "filename";--> statement-breakpoint
ALTER TABLE "documents" DROP COLUMN "original_name";--> statement-breakpoint
ALTER TABLE "documents" DROP COLUMN "content_type";--> statement-breakpoint
ALTER TABLE "documents" DROP COLUMN "minio_path";--> statement-breakpoint
ALTER TABLE "documents" DROP COLUMN "extracted_text";--> statement-breakpoint
ALTER TABLE "documents" DROP COLUMN "processing_status";--> statement-breakpoint
ALTER TABLE "documents" DROP COLUMN "processing_error";--> statement-breakpoint
ALTER TABLE "cases" ADD CONSTRAINT "cases_case_number_unique" UNIQUE("case_number");