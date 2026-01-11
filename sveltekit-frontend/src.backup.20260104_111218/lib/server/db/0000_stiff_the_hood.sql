-- Current sql file was generated after introspecting the database
-- If you want to run this migration please uncomment this code before executing migrations
/*
CREATE TABLE "reports" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"case_id" uuid,
	"title" varchar(255) NOT NULL,
	"content" text,
	"report_type" varchar(50) DEFAULT 'case_summary',
	"status" varchar(50) DEFAULT 'draft' NOT NULL,
	"is_public" boolean DEFAULT false,
	"tags" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "citations" (
	"id" uuid PRIMARY KEY DEFAULT uuid_generate_v4() NOT NULL,
	"case_id" uuid,
	"citation_text" text NOT NULL,
	"citation_type" varchar(100),
	"source" varchar(500),
	"page_number" integer,
	"relevance_score" numeric(3, 2),
	"context" text,
	"verified" boolean DEFAULT false,
	"created_at" timestamp DEFAULT CURRENT_TIMESTAMP,
	"updated_at" timestamp DEFAULT CURRENT_TIMESTAMP,
	"metadata" jsonb DEFAULT '{}'::jsonb
);
--> statement-breakpoint
CREATE TABLE "document_vectors" (
	"id" uuid PRIMARY KEY DEFAULT uuid_generate_v4() NOT NULL,
	"document_id" uuid NOT NULL,
	"document_type" varchar(50) NOT NULL,
	"chunk_index" integer DEFAULT 0,
	"content" text NOT NULL,
	"embedding" vector(768),
	"metadata" jsonb DEFAULT '{}'::jsonb,
	"created_at" timestamp DEFAULT CURRENT_TIMESTAMP
);
--> statement-breakpoint
CREATE TABLE "user_sessions" (
	"id" uuid PRIMARY KEY DEFAULT uuid_generate_v4() NOT NULL,
	"user_id" uuid,
	"session_token" varchar(255) NOT NULL,
	"expires_at" timestamp NOT NULL,
	"created_at" timestamp DEFAULT CURRENT_TIMESTAMP,
	"ip_address" "inet",
	"user_agent" text,
	CONSTRAINT "user_sessions_session_token_key" UNIQUE("session_token")
);
--> statement-breakpoint
CREATE TABLE "activity_logs" (
	"id" uuid PRIMARY KEY DEFAULT uuid_generate_v4() NOT NULL,
	"user_id" uuid,
	"action" varchar(100) NOT NULL,
	"entity_type" varchar(50),
	"entity_id" uuid,
	"details" jsonb DEFAULT '{}'::jsonb,
	"ip_address" "inet",
	"user_agent" text,
	"created_at" timestamp DEFAULT CURRENT_TIMESTAMP
);
--> statement-breakpoint
CREATE TABLE "search_cache" (
	"id" uuid PRIMARY KEY DEFAULT uuid_generate_v4() NOT NULL,
	"query_hash" varchar(64) NOT NULL,
	"query_text" text NOT NULL,
	"results" jsonb NOT NULL,
	"expires_at" timestamp NOT NULL,
	"created_at" timestamp DEFAULT CURRENT_TIMESTAMP,
	CONSTRAINT "search_cache_query_hash_key" UNIQUE("query_hash")
);
--> statement-breakpoint
CREATE TABLE "auto_tags" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"entity_id" uuid NOT NULL,
	"entity_type" varchar(50) NOT NULL,
	"tag" varchar(100) NOT NULL,
	"confidence" numeric(3, 2) NOT NULL,
	"source" varchar(50) DEFAULT 'ai_analysis' NOT NULL,
	"model" varchar(100),
	"extracted_at" timestamp DEFAULT now() NOT NULL,
	"is_confirmed" boolean DEFAULT false NOT NULL,
	"confirmed_by" uuid,
	"confirmed_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "vector_metadata" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"document_id" uuid NOT NULL,
	"collection_name" varchar(100) NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"content_hash" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "legal_documents" (
	"id" serial PRIMARY KEY NOT NULL,
	"filename" varchar(255) NOT NULL,
	"original_path" text,
	"s3_bucket" varchar(100),
	"s3_key" text,
	"file_size" bigint,
	"mime_type" varchar(100),
	"upload_date" timestamp DEFAULT CURRENT_TIMESTAMP,
	"document_type" varchar(50),
	"title" text,
	"content_preview" text,
	"full_text" text,
	"metadata" jsonb,
	"processing_status" varchar(20) DEFAULT 'uploaded',
	"error_message" text,
	"created_at" timestamp DEFAULT CURRENT_TIMESTAMP,
	"updated_at" timestamp DEFAULT CURRENT_TIMESTAMP
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT uuid_generate_v4() NOT NULL,
	"email" varchar(255) NOT NULL,
	"hashed_password" varchar(255),
	"username" varchar(100),
	"first_name" varchar(100),
	"last_name" varchar(100),
	"role" varchar(50) DEFAULT 'user' NOT NULL,
	"department" varchar(100),
	"jurisdiction" varchar(100),
	"permissions" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"email_verified" boolean DEFAULT false NOT NULL,
	"avatar_url" varchar(500),
	"last_login_at" timestamp with time zone,
	"practice_areas" jsonb DEFAULT '[]'::jsonb,
	"bar_number" varchar(50),
	"firm_name" varchar(200),
	"profile_embedding" vector(384),
	"metadata" jsonb DEFAULT '{}'::jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"id" varchar(255) PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"ip_address" varchar(45),
	"user_agent" text,
	"session_context" jsonb DEFAULT '{}'::jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "evidence" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"case_id" uuid,
	"title" varchar(255) NOT NULL,
	"description" text,
	"evidence_type" varchar(50) NOT NULL,
	"file_url" text,
	"created_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
	"updated_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
	"user_id" uuid,
	"title_embedding" vector(384),
	"content_embedding" vector(384),
	"sub_type" varchar(50),
	"file_name" varchar(255),
	"file_size" integer,
	"mime_type" varchar(100),
	"hash" varchar(128),
	"collected_at" timestamp,
	"collected_by" varchar(255),
	"location" varchar(255),
	"chain_of_custody" jsonb DEFAULT '[]'::jsonb,
	"tags" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"is_admissible" boolean DEFAULT true,
	"confidentiality_level" varchar(50) DEFAULT 'internal',
	"ai_analysis" jsonb DEFAULT '{}'::jsonb,
	"ai_tags" jsonb DEFAULT '[]'::jsonb,
	"ai_summary" text,
	"summary" text,
	"summary_type" varchar(50),
	"board_position" jsonb DEFAULT '{}'::jsonb
);
--> statement-breakpoint
CREATE TABLE "cases" (
	"id" uuid PRIMARY KEY DEFAULT uuid_generate_v4() NOT NULL,
	"title" varchar(500) NOT NULL,
	"description" text,
	"case_number" varchar(100),
	"status" varchar(50) DEFAULT 'active' NOT NULL,
	"priority" varchar(20) DEFAULT 'medium' NOT NULL,
	"practice_area" varchar(100),
	"jurisdiction" varchar(100),
	"court" varchar(200),
	"client_name" varchar(200),
	"opposing_party" varchar(200),
	"assigned_attorney" uuid,
	"filing_date" timestamp with time zone,
	"due_date" timestamp with time zone,
	"closed_date" timestamp with time zone,
	"case_embedding" vector(384),
	"qdrant_id" uuid,
	"qdrant_collection" varchar(100) DEFAULT 'cases',
	"metadata" jsonb DEFAULT '{}'::jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "canvas_states" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"case_id" uuid,
	"name" varchar(255) NOT NULL,
	"canvas_data" jsonb NOT NULL,
	"version" integer DEFAULT 1,
	"is_default" boolean DEFAULT false,
	"created_by" uuid,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "case_scores" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"case_id" uuid NOT NULL,
	"score" numeric(5, 2) NOT NULL,
	"risk_level" varchar(20) NOT NULL,
	"breakdown" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"criteria" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"recommendations" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"calculated_by" uuid,
	"calculated_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "criminals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"first_name" varchar(100) NOT NULL,
	"last_name" varchar(100) NOT NULL,
	"middle_name" varchar(100),
	"aliases" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"date_of_birth" timestamp,
	"place_of_birth" varchar(200),
	"address" text,
	"phone" varchar(20),
	"email" varchar(255),
	"ssn" varchar(11),
	"drivers_license" varchar(50),
	"height" integer,
	"weight" integer,
	"eye_color" varchar(20),
	"hair_color" varchar(20),
	"distinguishing_marks" text,
	"photo_url" text,
	"fingerprints" jsonb DEFAULT '{}'::jsonb,
	"threat_level" varchar(20) DEFAULT 'low' NOT NULL,
	"status" varchar(20) DEFAULT 'active' NOT NULL,
	"notes" text,
	"ai_summary" text,
	"ai_tags" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_by" uuid,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "document_chunks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"document_id" uuid NOT NULL,
	"document_type" varchar(50) NOT NULL,
	"chunk_index" integer NOT NULL,
	"content" text NOT NULL,
	"embedding" vector(768) NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "embedding_cache" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"text_hash" text NOT NULL,
	"embedding" vector(768) NOT NULL,
	"model" varchar(100) NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "legal_analysis_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"case_id" uuid,
	"user_id" uuid,
	"session_type" varchar(50) DEFAULT 'case_analysis',
	"analysis_prompt" text,
	"analysis_result" text,
	"confidence_level" numeric(3, 2),
	"sources_used" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"model" varchar(100) DEFAULT 'gemma3-legal',
	"processing_time" integer,
	"is_active" boolean DEFAULT true,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "keys" (
	"id" varchar(255) PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"hashed_password" varchar(255),
	"provider_id" varchar(255),
	"provider_user_id" varchar(255),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "persons_of_interest" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"case_id" uuid,
	"name" varchar(255) NOT NULL,
	"aliases" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"relationship" varchar(100),
	"threat_level" varchar(20) DEFAULT 'low',
	"status" varchar(20) DEFAULT 'active',
	"profile_data" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"tags" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"position" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_by" uuid,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "rag_messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"session_id" varchar(255) NOT NULL,
	"message_index" integer NOT NULL,
	"role" varchar(20) NOT NULL,
	"content" text NOT NULL,
	"retrieved_sources" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"source_count" integer DEFAULT 0 NOT NULL,
	"retrieval_score" varchar(10),
	"processing_time" integer,
	"model" varchar(100),
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "rag_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"session_id" varchar(255) NOT NULL,
	"user_id" uuid,
	"title" varchar(255),
	"model" varchar(100),
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "statutes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"title" varchar(255) NOT NULL,
	"code" varchar(100) NOT NULL,
	"description" text,
	"category" varchar(100),
	"jurisdiction" varchar(100),
	"is_active" boolean DEFAULT true,
	"penalties" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_ai_queries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"case_id" uuid,
	"query" text NOT NULL,
	"response" text NOT NULL,
	"model" varchar(100) DEFAULT 'gemma3-legal' NOT NULL,
	"query_type" varchar(50) DEFAULT 'general',
	"confidence" numeric(3, 2),
	"tokens_used" integer,
	"processing_time" integer,
	"context_used" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"embedding" vector(768),
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"is_successful" boolean DEFAULT true NOT NULL,
	"error_message" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_profiles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"bio" text,
	"phone" varchar(20),
	"address" text,
	"preferences" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"permissions" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"specializations" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"certifications" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"experience_level" varchar(20) DEFAULT 'junior',
	"work_patterns" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "citations" ADD CONSTRAINT "citations_case_id_fkey" FOREIGN KEY ("case_id") REFERENCES "public"."cases"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_sessions" ADD CONSTRAINT "user_sessions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "activity_logs" ADD CONSTRAINT "activity_logs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "keys" ADD CONSTRAINT "keys_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_reports_case_id" ON "reports" USING btree ("case_id" uuid_ops);--> statement-breakpoint
CREATE INDEX "idx_reports_type" ON "reports" USING btree ("report_type" text_ops);--> statement-breakpoint
CREATE INDEX "idx_citations_case_id" ON "citations" USING btree ("case_id" uuid_ops);--> statement-breakpoint
CREATE INDEX "idx_citations_relevance" ON "citations" USING btree ("relevance_score" numeric_ops);--> statement-breakpoint
CREATE INDEX "idx_citations_text_fts" ON "citations" USING gin (to_tsvector('english'::regconfig, citation_text) tsvector_ops);--> statement-breakpoint
CREATE INDEX "idx_citations_type" ON "citations" USING btree ("citation_type" text_ops);--> statement-breakpoint
CREATE INDEX "idx_document_vectors_document_id" ON "document_vectors" USING btree ("document_id" uuid_ops);--> statement-breakpoint
CREATE INDEX "idx_document_vectors_embedding" ON "document_vectors" USING ivfflat ("embedding" vector_cosine_ops);--> statement-breakpoint
CREATE INDEX "idx_document_vectors_type" ON "document_vectors" USING btree ("document_type" text_ops);--> statement-breakpoint
CREATE INDEX "idx_user_sessions_expires" ON "user_sessions" USING btree ("expires_at" timestamp_ops);--> statement-breakpoint
CREATE INDEX "idx_user_sessions_token" ON "user_sessions" USING btree ("session_token" text_ops);--> statement-breakpoint
CREATE INDEX "idx_user_sessions_user_id" ON "user_sessions" USING btree ("user_id" uuid_ops);--> statement-breakpoint
CREATE INDEX "idx_activity_logs_action" ON "activity_logs" USING btree ("action" text_ops);--> statement-breakpoint
CREATE INDEX "idx_activity_logs_created_at" ON "activity_logs" USING btree ("created_at" timestamp_ops);--> statement-breakpoint
CREATE INDEX "idx_activity_logs_user_id" ON "activity_logs" USING btree ("user_id" uuid_ops);--> statement-breakpoint
CREATE INDEX "vector_metadata_document_id_idx" ON "vector_metadata" USING btree ("document_id" uuid_ops);--> statement-breakpoint
CREATE INDEX "users_active_idx" ON "users" USING btree ("is_active" bool_ops);--> statement-breakpoint
CREATE INDEX "users_email_idx" ON "users" USING btree ("email" text_ops);--> statement-breakpoint
CREATE INDEX "users_role_idx" ON "users" USING btree ("role" text_ops);--> statement-breakpoint
CREATE INDEX "users_username_idx" ON "users" USING btree ("username" text_ops);--> statement-breakpoint
CREATE INDEX "sessions_expires_at_idx" ON "sessions" USING btree ("expires_at" timestamptz_ops);--> statement-breakpoint
CREATE INDEX "sessions_user_id_idx" ON "sessions" USING btree ("user_id" uuid_ops);--> statement-breakpoint
CREATE INDEX "idx_evidence_case_id" ON "evidence" USING btree ("case_id" uuid_ops);--> statement-breakpoint
CREATE INDEX "idx_evidence_tags" ON "evidence" USING gin ("tags" jsonb_ops);--> statement-breakpoint
CREATE INDEX "idx_evidence_title_fts" ON "evidence" USING gin (to_tsvector('english'::regconfig, (title)::text) tsvector_ops);--> statement-breakpoint
CREATE INDEX "idx_evidence_type" ON "evidence" USING btree ("evidence_type" text_ops);--> statement-breakpoint
CREATE INDEX "idx_cases_created_at" ON "cases" USING btree ("created_at" timestamptz_ops);--> statement-breakpoint
CREATE INDEX "idx_cases_description_fts" ON "cases" USING gin (to_tsvector('english'::regconfig, description) tsvector_ops);--> statement-breakpoint
CREATE INDEX "idx_cases_metadata" ON "cases" USING gin ("metadata" jsonb_ops);--> statement-breakpoint
CREATE INDEX "idx_cases_status" ON "cases" USING btree ("status" text_ops);--> statement-breakpoint
CREATE INDEX "idx_cases_title_fts" ON "cases" USING gin (to_tsvector('english'::regconfig, (title)::text) tsvector_ops);
*/