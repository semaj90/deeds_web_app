CREATE TYPE "public"."audit_operation" AS ENUM('CREATE', 'UPDATE', 'DELETE');--> statement-breakpoint
CREATE TYPE "public"."audit_resource_type" AS ENUM('Evidence', 'Tag', 'EvidenceTag', 'RAGIndex');--> statement-breakpoint
CREATE TYPE "public"."chat_message_role" AS ENUM('user', 'assistant', 'system');--> statement-breakpoint
CREATE TYPE "public"."jurisdiction" AS ENUM('CA', 'NY', 'TX', 'Fed-US', 'Other');--> statement-breakpoint
CREATE TYPE "public"."activity_status" AS ENUM('pending', 'in_progress', 'completed', 'cancelled', 'postponed');--> statement-breakpoint
CREATE TYPE "public"."case_priority" AS ENUM('low', 'medium', 'high', 'critical', 'urgent');--> statement-breakpoint
CREATE TYPE "public"."case_risk_level" AS ENUM('low', 'medium', 'high', 'critical', 'urgent');--> statement-breakpoint
CREATE TYPE "public"."case_status" AS ENUM('open', 'in_progress', 'pending_review', 'closed', 'archived');--> statement-breakpoint
CREATE TYPE "public"."confidentiality_level" AS ENUM('public', 'standard', 'confidential', 'restricted', 'classified');--> statement-breakpoint
CREATE TYPE "public"."document_status" AS ENUM('queued', 'processing', 'processed', 'failed', 'pending_ocr', 'ocr_completed', 'pending_embedding', 'embedding_completed', 'pending_summary', 'summary_completed');--> statement-breakpoint
CREATE TYPE "public"."document_type" AS ENUM('case_law', 'statute', 'regulation', 'brief', 'contract', 'evidence', 'report', 'precedent');--> statement-breakpoint
CREATE TYPE "public"."error_kind" AS ENUM('typescript', 'svelte', 'lint', 'build', 'runtime', 'api', 'other');--> statement-breakpoint
CREATE TYPE "public"."error_severity" AS ENUM('info', 'warn', 'error', 'fatal');--> statement-breakpoint
CREATE TYPE "public"."evidence_relationship_strength" AS ENUM('low', 'medium', 'high');--> statement-breakpoint
CREATE TYPE "public"."evidence_relationship_type" AS ENUM('supports', 'contradicts', 'same_person', 'timeline', 'chain_of_custody');--> statement-breakpoint
CREATE TYPE "public"."evidence_type" AS ENUM('document', 'photo', 'video', 'audio', 'physical', 'digital', 'witness_statement', 'forensic');--> statement-breakpoint
CREATE TYPE "public"."patch_status" AS ENUM('suggested', 'applied', 'rejected');--> statement-breakpoint
CREATE TYPE "public"."report_status" AS ENUM('draft', 'review', 'approved', 'published', 'archived');--> statement-breakpoint
CREATE TYPE "public"."route_health_state" AS ENUM('healthy', 'flaky', 'broken');--> statement-breakpoint
CREATE TYPE "public"."suggestion_state" AS ENUM('pending', 'applied', 'dismissed', 'snoozed');--> statement-breakpoint
CREATE TYPE "public"."summary_type" AS ENUM('legal_analysis', 'executive_summary', 'key_facts');--> statement-breakpoint
CREATE TYPE "public"."threat_level" AS ENUM('low', 'medium', 'high', 'critical');--> statement-breakpoint
CREATE TYPE "public"."user_role" AS ENUM('prosecutor', 'detective', 'admin', 'analyst', 'paralegal');--> statement-breakpoint
CREATE TYPE "public"."verification_status" AS ENUM('pending', 'verified', 'rejected', 'needs_review');--> statement-breakpoint
CREATE TABLE "chat_messages" (
	"id" varchar(255) PRIMARY KEY NOT NULL,
	"chat_id" varchar(255) NOT NULL,
	"user_id" uuid,
	"role" "chat_message_role" NOT NULL,
	"content" text NOT NULL,
	"timestamp" timestamp with time zone DEFAULT now() NOT NULL,
	"migrated_from" varchar(255),
	"metadata" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "chat_metadata" (
	"chat_id" varchar(255) PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"title" varchar(500),
	"case_id" varchar(255),
	"message_count" varchar(50) DEFAULT '0',
	"last_message_at" timestamp with time zone,
	"is_archived" varchar(10) DEFAULT 'false',
	"tags" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "citation_tags" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(255) NOT NULL,
	"jurisdiction" "jurisdiction" NOT NULL,
	"description" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "citation_tags_name_jurisdiction_unique" UNIQUE("name","jurisdiction")
);
--> statement-breakpoint
CREATE TABLE "evidence_tags" (
	"evidence_id" uuid NOT NULL,
	"tag_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "evidence_tags_evidence_id_tag_id_pk" PRIMARY KEY("evidence_id","tag_id")
);
--> statement-breakpoint
CREATE TABLE "rag_index_metadata" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"chunk_id" uuid NOT NULL,
	"evidence_id" uuid NOT NULL,
	"tags" text[] DEFAULT '{}'::text[] NOT NULL,
	"tag_weight" real DEFAULT 1 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ai_reports" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"case_id" uuid,
	"created_by" integer,
	"report_type" varchar(100) NOT NULL,
	"summary" text,
	"full_report" text,
	"generated_at" timestamp DEFAULT now() NOT NULL,
	"metadata" jsonb,
	"created_at" timestamp DEFAULT now(),
	"updatedAt" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "attachment_verifications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"attachment_id" uuid,
	"verified_by" integer,
	"status" "verification_status",
	"verification_date" timestamp,
	"notes" text,
	"created_at" timestamp DEFAULT now(),
	"updatedAt" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "audit_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"action" varchar(100) NOT NULL,
	"resource_type" varchar(100) NOT NULL,
	"resource_id" varchar(255) NOT NULL,
	"details" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "auto_tags" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"entity_id" uuid NOT NULL,
	"entity_type" varchar(50) NOT NULL,
	"tag" varchar(100) NOT NULL,
	"confidence" real NOT NULL,
	"source" varchar(100) NOT NULL,
	"model" varchar(100),
	"is_confirmed" boolean DEFAULT false NOT NULL,
	"confirmed_by" integer,
	"confirmed_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "canvas_annotations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"canvas_state_id" uuid,
	"created_by" integer,
	"annotation_data" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp DEFAULT now(),
	"updatedAt" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "canvas_autosaves" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"canvas_state_id" uuid,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "canvas_states" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"case_id" uuid NOT NULL,
	"name" varchar(255) DEFAULT 'Untitled Board' NOT NULL,
	"canvas_data" jsonb NOT NULL,
	"version" integer DEFAULT 1,
	"is_default" boolean DEFAULT false,
	"created_by" uuid,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "case_activities" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"case_id" uuid,
	"assigned_to" integer,
	"created_by" integer,
	"activity_type" varchar(100),
	"description" text,
	"status" "activity_status",
	"due_date" timestamp,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "case_embeddings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"case_id" uuid NOT NULL,
	"embedding" text NOT NULL,
	"model" varchar(100) NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "case_note_evidence_refs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"note_id" uuid NOT NULL,
	"evidence_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "case_note_refs_unique" UNIQUE("note_id","evidence_id")
);
--> statement-breakpoint
CREATE TABLE "case_notes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"case_id" uuid NOT NULL,
	"title" varchar(255),
	"content" text NOT NULL,
	"is_ai" boolean DEFAULT false,
	"is_pinned" boolean DEFAULT false,
	"created_by" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "case_reports" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"case_id" uuid NOT NULL,
	"version" integer NOT NULL,
	"is_current" boolean DEFAULT true NOT NULL,
	"summary_text" text NOT NULL,
	"citations" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"holding" text,
	"created_by" varchar(255),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "case_scores" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"calculated_by" integer,
	"case_id" uuid NOT NULL,
	"score" numeric(5, 2) NOT NULL,
	"risk_level" "case_risk_level" NOT NULL,
	"breakdown" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"criteria" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"recommendations" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"calculated_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "cases" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"title" varchar(255) NOT NULL,
	"description" text,
	"case_number" varchar(100),
	"priority" "case_priority" NOT NULL,
	"practice_area" varchar(100),
	"jurisdiction" varchar(100),
	"court" varchar(200),
	"client_name" varchar(200),
	"opposing_party" varchar(200),
	"assigned_attorney" uuid,
	"filing_date" timestamp with time zone,
	"due_date" timestamp with time zone,
	"closed_date" timestamp with time zone,
	"qdrant_id" uuid,
	"qdrant_collection" varchar(100),
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"status" "case_status" NOT NULL
);
--> statement-breakpoint
CREATE TABLE "chat_embeddings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"rag_message_id" uuid NOT NULL,
	"embedding" text NOT NULL,
	"model" varchar(100) NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "citations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"document_id" uuid,
	"case_id" uuid,
	"citation_text" text NOT NULL,
	"source_url" text,
	"page_number" integer,
	"confidence" real,
	"created_by" integer,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "content_embeddings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"document_id" uuid NOT NULL,
	"embedding" text NOT NULL,
	"model" varchar(100) NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
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
	"fingerprints" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"threat_level" "threat_level" DEFAULT 'low' NOT NULL,
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
	"chunk_index" integer NOT NULL,
	"content" text NOT NULL,
	"embedding" text,
	"metadata" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "document_processing" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"document_id" uuid NOT NULL,
	"status" "document_status" DEFAULT 'queued' NOT NULL,
	"processor" varchar(100),
	"metadata" jsonb,
	"error" text,
	"started_at" timestamp,
	"completed_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "document_summaries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"document_id" uuid NOT NULL,
	"summary_type" "summary_type" NOT NULL,
	"summary_text" text NOT NULL,
	"model" varchar(100),
	"metadata" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "documents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"title" text NOT NULL,
	"content" text,
	"s3_key" text NOT NULL,
	"s3_bucket" text DEFAULT 'legal-documents' NOT NULL,
	"original_name" text NOT NULL,
	"mime_type" text NOT NULL,
	"file_size" bigint DEFAULT 0 NOT NULL,
	"case_id" uuid,
	"user_id" uuid,
	"status" "document_status" DEFAULT 'queued' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "email_verification_codes" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"email" varchar(255) NOT NULL,
	"code" varchar(8) NOT NULL,
	"expires_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "embedding_cache" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"text_hash" text NOT NULL,
	"model" varchar(100) NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"embedding" text NOT NULL,
	CONSTRAINT "embedding_cache_text_hash_unique" UNIQUE("text_hash")
);
--> statement-breakpoint
CREATE TABLE "error_clusters" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"kind" "error_kind" NOT NULL,
	"severity" "error_severity" DEFAULT 'warn' NOT NULL,
	"pattern" text NOT NULL,
	"error_count" integer DEFAULT 1 NOT NULL,
	"route_paths" text[],
	"radius" numeric,
	"last_updated" timestamp DEFAULT now() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "error_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"route_path" varchar(255) NOT NULL,
	"file" varchar(500),
	"kind" "error_kind" DEFAULT 'other' NOT NULL,
	"severity" "error_severity" DEFAULT 'warn' NOT NULL,
	"ts_code" varchar(50),
	"message" text NOT NULL,
	"stack" text,
	"line_number" integer,
	"column_number" integer,
	"cluster_id" uuid,
	"collected_at" timestamp DEFAULT now() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "error_feedback" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"suggestion_id" uuid NOT NULL,
	"route_path" varchar(255) NOT NULL,
	"helpful" boolean,
	"accurate" boolean,
	"works_soon" boolean,
	"feedback" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "error_suggestion_states" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"suggestion_id" uuid NOT NULL,
	"route_path" varchar(255) NOT NULL,
	"user_id" uuid,
	"state" "suggestion_state" DEFAULT 'pending' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "uq_error_suggestion_states_suggestion_route_user" UNIQUE("suggestion_id","route_path","user_id")
);
--> statement-breakpoint
CREATE TABLE "error_suggestions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"cluster_id" uuid NOT NULL,
	"title" varchar(255) NOT NULL,
	"explanation" text NOT NULL,
	"patch" text,
	"confidence" numeric,
	"hints" text[],
	"generated_at" timestamp DEFAULT now() NOT NULL,
	"applied_count" integer DEFAULT 0 NOT NULL,
	"success_count" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "error_timeline" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"route_path" varchar(255) NOT NULL,
	"event_type" varchar(50) NOT NULL,
	"description" text,
	"metadata" jsonb,
	"occurred_at" timestamp DEFAULT now() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "evidence" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"case_id" uuid,
	"criminal_id" uuid,
	"title" varchar(255) NOT NULL,
	"description" text,
	"evidence_type" "evidence_type" NOT NULL,
	"type" varchar(50),
	"evidence_number" integer,
	"summary" text,
	"pos_x" double precision,
	"pos_y" double precision,
	"collected_at" timestamp,
	"collected_by" uuid,
	"verified_at" timestamp,
	"verified" boolean,
	"created_at" timestamp,
	"file_size" integer,
	"mime_type" varchar(100),
	"hash" varchar(255),
	"tags" jsonb,
	"ai_analysis" jsonb,
	"ai_tags" jsonb,
	"ai_summary" text,
	"file_type" varchar(50),
	"sub_type" varchar(50),
	"file_url" text,
	"file_name" varchar(255),
	"canvas_position" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"uploaded_by" uuid,
	"uploaded_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "evidence_board_connections" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"case_id" uuid NOT NULL,
	"from_evidence_id" uuid NOT NULL,
	"to_evidence_id" uuid NOT NULL,
	"connection_type" varchar(50) DEFAULT 'related' NOT NULL,
	"notes" text,
	"strength" real DEFAULT 1,
	"is_visible" boolean DEFAULT true,
	"created_by" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "evidence_relationships" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"case_id" uuid NOT NULL,
	"from_evidence_id" uuid NOT NULL,
	"to_evidence_id" uuid NOT NULL,
	"relationship_type" "evidence_relationship_type" NOT NULL,
	"label" text,
	"strength" "evidence_relationship_strength" DEFAULT 'medium' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "evidence_vectors" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"evidence_id" uuid NOT NULL,
	"vector" text NOT NULL,
	"model" varchar(100) NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "hash_verifications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"evidence_id" uuid NOT NULL,
	"verified_by" integer,
	"hash_value" text NOT NULL,
	"algorithm" varchar(50) NOT NULL,
	"status" "verification_status" DEFAULT 'pending' NOT NULL,
	"verification_date" timestamp DEFAULT now() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "legal_analysis_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" integer NOT NULL,
	"case_id" uuid,
	"analysis_type" varchar(100) NOT NULL,
	"input_data" jsonb,
	"output_summary" text,
	"status" varchar(50) DEFAULT 'pending' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "legal_documents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"title" text NOT NULL,
	"content" text,
	"s3_key" text NOT NULL,
	"s3_bucket" text DEFAULT 'legal-documents' NOT NULL,
	"original_name" text NOT NULL,
	"mime_type" text NOT NULL,
	"file_size" bigint DEFAULT 0 NOT NULL,
	"case_id" uuid,
	"user_id" uuid,
	"evidence_id" uuid,
	"created_by" uuid,
	"status" "document_status" DEFAULT 'queued' NOT NULL,
	"document_type" "document_type",
	"practice_area" varchar(100),
	"metadata" jsonb,
	"content_embedding" text,
	"qdrant_id" uuid,
	"qdrant_collection" varchar(100),
	"last_synced_to_qdrant" timestamp with time zone,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "legal_precedents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"case_id" uuid,
	"title" varchar(255) NOT NULL,
	"summary" text NOT NULL,
	"citation" varchar(255),
	"court" varchar(200),
	"decision_date" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "legal_research" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"case_id" uuid,
	"created_by" integer NOT NULL,
	"query" text NOT NULL,
	"results" jsonb,
	"status" varchar(50) DEFAULT 'completed' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "password_reset_tokens" (
	"token_hash" varchar(63) PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"expires_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "persons" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"case_id" uuid,
	"created_by" uuid,
	"name" text NOT NULL,
	"aliases" jsonb DEFAULT '[]'::jsonb,
	"threat_level" varchar DEFAULT 'low' NOT NULL,
	"status" varchar DEFAULT 'surveillance' NOT NULL,
	"description" text DEFAULT '',
	"last_seen" varchar,
	"last_location" text,
	"cases" jsonb DEFAULT '[]'::jsonb,
	"photos" jsonb DEFAULT '[]'::jsonb,
	"photo_url" text,
	"ai" jsonb DEFAULT 'null'::jsonb,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "poi_photos" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"poi_id" uuid NOT NULL,
	"minio_key" text NOT NULL,
	"thumbnail_key" text,
	"url" text NOT NULL,
	"thumbnail_url" text,
	"original_name" text NOT NULL,
	"mime_type" text NOT NULL,
	"size" bigint NOT NULL,
	"ai_caption" text,
	"ai_tags" jsonb DEFAULT '[]'::jsonb,
	"exif_data" jsonb,
	"forensic_data" jsonb,
	"face_embedding" text,
	"uploaded_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "rag_messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"session_id" uuid NOT NULL,
	"role" varchar(50) NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "rag_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" integer NOT NULL,
	"case_id" uuid,
	"title" varchar(255),
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "reports" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"case_id" uuid,
	"created_by" uuid,
	"title" varchar(255) NOT NULL,
	"content" text,
	"status" "report_status" DEFAULT 'draft' NOT NULL,
	"generated_at" timestamp DEFAULT now() NOT NULL,
	"metadata" jsonb,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "route_error_patches" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"route_path" varchar(255) NOT NULL,
	"route_file" varchar(500),
	"error_code" varchar(64) NOT NULL,
	"suggestion_title" varchar(255),
	"patch_text" text NOT NULL,
	"patch_explanation" text,
	"confidence" numeric DEFAULT 0.50 NOT NULL,
	"hints" text[],
	"status" "patch_status" DEFAULT 'suggested' NOT NULL,
	"source" varchar(64) DEFAULT 'phase78' NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_by" uuid,
	"applied_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "route_health" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"route_path" varchar(255) NOT NULL,
	"file" varchar(500),
	"state" "route_health_state" DEFAULT 'healthy' NOT NULL,
	"recent_error_count" integer DEFAULT 0 NOT NULL,
	"total_error_count" integer DEFAULT 0 NOT NULL,
	"last_error_at" timestamp,
	"last_error_cluster_id" uuid,
	"last_error_message_short" text,
	"route_cluster" varchar(100),
	"route_owner" varchar(100),
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "route_health_route_path_unique" UNIQUE("route_path")
);
--> statement-breakpoint
CREATE TABLE "saved_reports" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" integer NOT NULL,
	"report_id" uuid NOT NULL,
	"case_id" uuid,
	"saved_at" timestamp DEFAULT now() NOT NULL,
	"notes" text,
	"export_format" varchar(50),
	"version" integer,
	"word_count" integer,
	"tags" jsonb,
	"metadata" jsonb,
	"shared_with" jsonb,
	"last_exported" timestamp,
	"created_by" uuid,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"expires_at" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "statute_chunks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"statute_id" uuid NOT NULL,
	"chunk_index" integer NOT NULL,
	"content" text NOT NULL,
	"embedding" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "statutes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"title" varchar(255) NOT NULL,
	"content" text NOT NULL,
	"jurisdiction" varchar(100),
	"section" varchar(100),
	"category" varchar(100),
	"source_url" text,
	"effective_date" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "storage_files" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"key" text NOT NULL,
	"original_name" text,
	"bucket" text NOT NULL,
	"user_id" uuid,
	"size" bigint NOT NULL,
	"mime" text,
	"uploaded_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "themes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" integer NOT NULL,
	"name" varchar(100) NOT NULL,
	"config" jsonb NOT NULL,
	"is_default" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "user_ai_queries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" integer NOT NULL,
	"case_id" uuid,
	"query" text NOT NULL,
	"response" text NOT NULL,
	"model" varchar(100) NOT NULL,
	"query_type" varchar(50) NOT NULL,
	"confidence" numeric(3, 2),
	"processing_time" integer,
	"context_used" jsonb DEFAULT '[]'::jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_embeddings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"content" text,
	"metadata" jsonb,
	"embedding" text NOT NULL,
	"model" varchar(100) NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" varchar(255) NOT NULL,
	"password_hash" varchar(255) NOT NULL,
	"name" varchar(255),
	"first_name" varchar(255),
	"last_name" varchar(255),
	"role" "user_role" DEFAULT 'prosecutor' NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"avatar_url" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "vector_jobs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"status" varchar NOT NULL,
	"progress" integer DEFAULT 0 NOT NULL,
	"result" jsonb,
	"error" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "vector_metadata" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"document_id" text NOT NULL,
	"collection_name" varchar(100) NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"content_hash" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now(),
	CONSTRAINT "vector_metadata_document_id_unique" UNIQUE("document_id")
);
--> statement-breakpoint
CREATE TABLE "vector_outbox" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_type" varchar(256) NOT NULL,
	"owner_id" varchar(256) NOT NULL,
	"event" varchar(256) NOT NULL,
	"vector" text,
	"payload" jsonb NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "workspace_citations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"message_id" uuid,
	"citation_text" text NOT NULL,
	"citation_type" varchar(50) DEFAULT 'statute',
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "workspace_evidence" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"evidence_id" uuid NOT NULL,
	"relevance_score" real DEFAULT 0,
	"added_by" varchar(50) DEFAULT 'user',
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "workspace_notes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"content" text NOT NULL,
	"is_ai" boolean DEFAULT false,
	"embedding" text,
	"created_by" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "workspace_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"session_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "workspace_statutes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"statute_id" uuid,
	"statute_text" text,
	"relevance_score" real DEFAULT 0,
	"source" varchar(50) DEFAULT 'user',
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "workspaces" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"case_id" uuid,
	"created_by" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
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
ALTER TABLE "chat_messages" ADD CONSTRAINT "chat_messages_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_metadata" ADD CONSTRAINT "chat_metadata_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "evidence_tags" ADD CONSTRAINT "evidence_tags_evidence_id_evidence_id_fk" FOREIGN KEY ("evidence_id") REFERENCES "public"."evidence"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "evidence_tags" ADD CONSTRAINT "evidence_tags_tag_id_citation_tags_id_fk" FOREIGN KEY ("tag_id") REFERENCES "public"."citation_tags"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rag_index_metadata" ADD CONSTRAINT "rag_index_metadata_evidence_id_evidence_id_fk" FOREIGN KEY ("evidence_id") REFERENCES "public"."evidence"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_reports" ADD CONSTRAINT "ai_reports_case_id_cases_id_fk" FOREIGN KEY ("case_id") REFERENCES "public"."cases"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_reports" ADD CONSTRAINT "ai_reports_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "canvas_states" ADD CONSTRAINT "canvas_states_case_id_cases_id_fk" FOREIGN KEY ("case_id") REFERENCES "public"."cases"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "case_note_evidence_refs" ADD CONSTRAINT "case_note_evidence_refs_note_id_case_notes_id_fk" FOREIGN KEY ("note_id") REFERENCES "public"."case_notes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "case_note_evidence_refs" ADD CONSTRAINT "case_note_evidence_refs_evidence_id_evidence_id_fk" FOREIGN KEY ("evidence_id") REFERENCES "public"."evidence"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "case_notes" ADD CONSTRAINT "case_notes_case_id_cases_id_fk" FOREIGN KEY ("case_id") REFERENCES "public"."cases"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "case_notes" ADD CONSTRAINT "case_notes_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "case_scores" ADD CONSTRAINT "case_scores_case_id_cases_id_fk" FOREIGN KEY ("case_id") REFERENCES "public"."cases"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "case_scores" ADD CONSTRAINT "case_scores_calculated_by_users_id_fk" FOREIGN KEY ("calculated_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "error_feedback" ADD CONSTRAINT "error_feedback_suggestion_id_error_suggestions_id_fk" FOREIGN KEY ("suggestion_id") REFERENCES "public"."error_suggestions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "error_suggestion_states" ADD CONSTRAINT "error_suggestion_states_suggestion_id_error_suggestions_id_fk" FOREIGN KEY ("suggestion_id") REFERENCES "public"."error_suggestions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "error_suggestions" ADD CONSTRAINT "error_suggestions_cluster_id_error_clusters_id_fk" FOREIGN KEY ("cluster_id") REFERENCES "public"."error_clusters"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "evidence_board_connections" ADD CONSTRAINT "evidence_board_connections_case_id_cases_id_fk" FOREIGN KEY ("case_id") REFERENCES "public"."cases"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "evidence_board_connections" ADD CONSTRAINT "evidence_board_connections_from_evidence_id_evidence_id_fk" FOREIGN KEY ("from_evidence_id") REFERENCES "public"."evidence"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "evidence_board_connections" ADD CONSTRAINT "evidence_board_connections_to_evidence_id_evidence_id_fk" FOREIGN KEY ("to_evidence_id") REFERENCES "public"."evidence"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "evidence_board_connections" ADD CONSTRAINT "evidence_board_connections_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "route_error_patches" ADD CONSTRAINT "route_error_patches_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "statute_chunks" ADD CONSTRAINT "statute_chunks_statute_id_statutes_id_fk" FOREIGN KEY ("statute_id") REFERENCES "public"."statutes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workspace_citations" ADD CONSTRAINT "workspace_citations_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workspace_citations" ADD CONSTRAINT "workspace_citations_message_id_rag_messages_id_fk" FOREIGN KEY ("message_id") REFERENCES "public"."rag_messages"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workspace_evidence" ADD CONSTRAINT "workspace_evidence_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workspace_evidence" ADD CONSTRAINT "workspace_evidence_evidence_id_evidence_id_fk" FOREIGN KEY ("evidence_id") REFERENCES "public"."evidence"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workspace_notes" ADD CONSTRAINT "workspace_notes_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workspace_notes" ADD CONSTRAINT "workspace_notes_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workspace_sessions" ADD CONSTRAINT "workspace_sessions_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workspace_sessions" ADD CONSTRAINT "workspace_sessions_session_id_rag_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."rag_sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workspace_statutes" ADD CONSTRAINT "workspace_statutes_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workspace_statutes" ADD CONSTRAINT "workspace_statutes_statute_id_statutes_id_fk" FOREIGN KEY ("statute_id") REFERENCES "public"."statutes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workspaces" ADD CONSTRAINT "workspaces_case_id_cases_id_fk" FOREIGN KEY ("case_id") REFERENCES "public"."cases"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workspaces" ADD CONSTRAINT "workspaces_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_chat_messages_chat_id" ON "chat_messages" USING btree ("chat_id");--> statement-breakpoint
CREATE INDEX "idx_chat_messages_user_id" ON "chat_messages" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "idx_chat_messages_timestamp" ON "chat_messages" USING btree ("timestamp");--> statement-breakpoint
CREATE INDEX "idx_chat_messages_migrated_from" ON "chat_messages" USING btree ("migrated_from");--> statement-breakpoint
CREATE INDEX "idx_chat_metadata_user_id" ON "chat_metadata" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "idx_chat_metadata_case_id" ON "chat_metadata" USING btree ("case_id");--> statement-breakpoint
CREATE INDEX "idx_chat_metadata_last_message" ON "chat_metadata" USING btree ("last_message_at");--> statement-breakpoint
CREATE INDEX "citation_tags_jurisdiction_idx" ON "citation_tags" USING btree ("jurisdiction");--> statement-breakpoint
CREATE INDEX "citation_tags_name_idx" ON "citation_tags" USING btree ("name");--> statement-breakpoint
CREATE INDEX "evidence_tags_evidence_id_idx" ON "evidence_tags" USING btree ("evidence_id");--> statement-breakpoint
CREATE INDEX "evidence_tags_tag_id_idx" ON "evidence_tags" USING btree ("tag_id");--> statement-breakpoint
CREATE INDEX "rag_index_metadata_chunk_id_idx" ON "rag_index_metadata" USING btree ("chunk_id");--> statement-breakpoint
CREATE INDEX "rag_index_metadata_evidence_id_idx" ON "rag_index_metadata" USING btree ("evidence_id");--> statement-breakpoint
CREATE INDEX "rag_index_metadata_tags_idx" ON "rag_index_metadata" USING gin ("tags");--> statement-breakpoint
CREATE INDEX "case_note_refs_note_id_idx" ON "case_note_evidence_refs" USING btree ("note_id");--> statement-breakpoint
CREATE INDEX "case_note_refs_evidence_id_idx" ON "case_note_evidence_refs" USING btree ("evidence_id");--> statement-breakpoint
CREATE INDEX "case_notes_case_id_idx" ON "case_notes" USING btree ("case_id");--> statement-breakpoint
CREATE INDEX "case_notes_is_pinned_idx" ON "case_notes" USING btree ("is_pinned");--> statement-breakpoint
CREATE INDEX "case_notes_created_at_idx" ON "case_notes" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "idx_error_clusters_kind" ON "error_clusters" USING btree ("kind");--> statement-breakpoint
CREATE INDEX "idx_error_clusters_severity" ON "error_clusters" USING btree ("severity");--> statement-breakpoint
CREATE INDEX "idx_error_events_route" ON "error_events" USING btree ("route_path");--> statement-breakpoint
CREATE INDEX "idx_error_events_kind" ON "error_events" USING btree ("kind");--> statement-breakpoint
CREATE INDEX "idx_error_events_cluster" ON "error_events" USING btree ("cluster_id");--> statement-breakpoint
CREATE INDEX "idx_error_events_collected" ON "error_events" USING btree ("collected_at");--> statement-breakpoint
CREATE INDEX "idx_error_feedback_suggestion" ON "error_feedback" USING btree ("suggestion_id");--> statement-breakpoint
CREATE INDEX "idx_error_feedback_route" ON "error_feedback" USING btree ("route_path");--> statement-breakpoint
CREATE INDEX "idx_error_suggestion_states_suggestion_route" ON "error_suggestion_states" USING btree ("suggestion_id","route_path");--> statement-breakpoint
CREATE INDEX "idx_error_suggestions_cluster" ON "error_suggestions" USING btree ("cluster_id");--> statement-breakpoint
CREATE INDEX "idx_error_timeline_route" ON "error_timeline" USING btree ("route_path");--> statement-breakpoint
CREATE INDEX "idx_error_timeline_event" ON "error_timeline" USING btree ("event_type");--> statement-breakpoint
CREATE INDEX "evidence_board_connections_case_id_idx" ON "evidence_board_connections" USING btree ("case_id");--> statement-breakpoint
CREATE INDEX "evidence_board_connections_from_evidence_id_idx" ON "evidence_board_connections" USING btree ("from_evidence_id");--> statement-breakpoint
CREATE INDEX "evidence_board_connections_to_evidence_id_idx" ON "evidence_board_connections" USING btree ("to_evidence_id");--> statement-breakpoint
CREATE INDEX "evidence_board_connections_type_idx" ON "evidence_board_connections" USING btree ("connection_type");--> statement-breakpoint
CREATE INDEX "idx_route_patches_route" ON "route_error_patches" USING btree ("route_path");--> statement-breakpoint
CREATE INDEX "idx_route_patches_status" ON "route_error_patches" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_route_patches_error_code" ON "route_error_patches" USING btree ("error_code");--> statement-breakpoint
CREATE INDEX "idx_route_health_path" ON "route_health" USING btree ("route_path");--> statement-breakpoint
CREATE INDEX "idx_route_health_state" ON "route_health" USING btree ("state");--> statement-breakpoint
CREATE INDEX "idx_route_health_updated" ON "route_health" USING btree ("updated_at");--> statement-breakpoint
CREATE INDEX "idx_route_health_cluster" ON "route_health" USING btree ("route_cluster");--> statement-breakpoint
CREATE INDEX "statute_chunks_statute_id_idx" ON "statute_chunks" USING btree ("statute_id");--> statement-breakpoint
CREATE INDEX "statute_chunks_chunk_index_idx" ON "statute_chunks" USING btree ("chunk_index");--> statement-breakpoint
CREATE INDEX "workspace_citations_workspace_id_idx" ON "workspace_citations" USING btree ("workspace_id");--> statement-breakpoint
CREATE INDEX "workspace_citations_message_id_idx" ON "workspace_citations" USING btree ("message_id");--> statement-breakpoint
CREATE INDEX "workspace_evidence_workspace_id_idx" ON "workspace_evidence" USING btree ("workspace_id");--> statement-breakpoint
CREATE INDEX "workspace_evidence_evidence_id_idx" ON "workspace_evidence" USING btree ("evidence_id");--> statement-breakpoint
CREATE INDEX "workspace_notes_workspace_id_idx" ON "workspace_notes" USING btree ("workspace_id");--> statement-breakpoint
CREATE INDEX "workspace_notes_is_ai_idx" ON "workspace_notes" USING btree ("is_ai");--> statement-breakpoint
CREATE INDEX "workspace_sessions_workspace_id_idx" ON "workspace_sessions" USING btree ("workspace_id");--> statement-breakpoint
CREATE INDEX "workspace_sessions_session_id_idx" ON "workspace_sessions" USING btree ("session_id");--> statement-breakpoint
CREATE INDEX "workspace_statutes_workspace_id_idx" ON "workspace_statutes" USING btree ("workspace_id");--> statement-breakpoint
CREATE INDEX "workspace_statutes_statute_id_idx" ON "workspace_statutes" USING btree ("statute_id");--> statement-breakpoint
CREATE INDEX "workspaces_case_id_idx" ON "workspaces" USING btree ("case_id");--> statement-breakpoint
CREATE INDEX "workspaces_created_by_idx" ON "workspaces" USING btree ("created_by");--> statement-breakpoint
CREATE INDEX "yorha_cases_case_number_idx" ON "yorha_cases" USING btree ("case_number");--> statement-breakpoint
CREATE INDEX "yorha_cases_created_by_idx" ON "yorha_cases" USING btree ("created_by");--> statement-breakpoint
CREATE INDEX "yorha_cases_status_idx" ON "yorha_cases" USING btree ("status");--> statement-breakpoint
CREATE INDEX "yorha_chat_messages_session_id_idx" ON "yorha_chat_messages" USING btree ("session_id");--> statement-breakpoint
CREATE INDEX "yorha_chat_messages_role_idx" ON "yorha_chat_messages" USING btree ("role");--> statement-breakpoint
CREATE INDEX "yorha_chat_messages_created_at_idx" ON "yorha_chat_messages" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "yorha_chat_sessions_case_id_idx" ON "yorha_chat_sessions" USING btree ("case_id");--> statement-breakpoint
CREATE INDEX "yorha_chat_sessions_user_id_idx" ON "yorha_chat_sessions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "yorha_chat_sessions_status_idx" ON "yorha_chat_sessions" USING btree ("status");--> statement-breakpoint
CREATE INDEX "yorha_evidence_connections_case_id_idx" ON "yorha_evidence_connections" USING btree ("case_id");--> statement-breakpoint
CREATE INDEX "yorha_evidence_connections_source_idx" ON "yorha_evidence_connections" USING btree ("source_node_id");--> statement-breakpoint
CREATE INDEX "yorha_evidence_connections_target_idx" ON "yorha_evidence_connections" USING btree ("target_node_id");--> statement-breakpoint
CREATE INDEX "yorha_evidence_connections_type_idx" ON "yorha_evidence_connections" USING btree ("connection_type");--> statement-breakpoint
CREATE INDEX "yorha_evidence_nodes_case_id_idx" ON "yorha_evidence_nodes" USING btree ("case_id");--> statement-breakpoint
CREATE INDEX "yorha_evidence_nodes_type_idx" ON "yorha_evidence_nodes" USING btree ("evidence_type");--> statement-breakpoint
CREATE INDEX "yorha_evidence_nodes_created_by_idx" ON "yorha_evidence_nodes" USING btree ("created_by");--> statement-breakpoint
CREATE INDEX "yorha_system_metrics_recorded_at_idx" ON "yorha_system_metrics" USING btree ("recorded_at");