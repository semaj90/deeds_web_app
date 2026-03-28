CREATE TYPE "public"."activity_status" AS ENUM('pending', 'in_progress', 'completed', 'cancelled', 'postponed');--> statement-breakpoint
CREATE TYPE "public"."case_priority" AS ENUM('low', 'medium', 'high', 'critical', 'urgent');--> statement-breakpoint
CREATE TYPE "public"."case_risk_level" AS ENUM('low', 'medium', 'high', 'critical', 'urgent');--> statement-breakpoint
CREATE TYPE "public"."case_status" AS ENUM('open', 'in_progress', 'pending_review', 'closed', 'archived');--> statement-breakpoint
CREATE TYPE "public"."confidentiality_level" AS ENUM('public', 'standard', 'confidential', 'restricted', 'classified');--> statement-breakpoint
CREATE TYPE "public"."document_status" AS ENUM('queued', 'processing', 'processed', 'failed', 'pending_ocr', 'ocr_completed', 'pending_embedding', 'embedding_completed', 'pending_summary', 'summary_completed');--> statement-breakpoint
CREATE TYPE "public"."document_type" AS ENUM('case_law', 'statute', 'regulation', 'brief', 'contract', 'evidence', 'report', 'precedent');--> statement-breakpoint
CREATE TYPE "public"."evidence_type" AS ENUM('document', 'photo', 'video', 'audio', 'physical', 'digital', 'witness_statement', 'forensic');--> statement-breakpoint
CREATE TYPE "public"."report_status" AS ENUM('draft', 'review', 'approved', 'published', 'archived');--> statement-breakpoint
CREATE TYPE "public"."summary_type" AS ENUM('legal_analysis', 'executive_summary', 'key_facts');--> statement-breakpoint
CREATE TYPE "public"."threat_level" AS ENUM('low', 'medium', 'high', 'critical');--> statement-breakpoint
CREATE TYPE "public"."user_role" AS ENUM('prosecutor', 'detective', 'admin', 'analyst', 'paralegal');--> statement-breakpoint
CREATE TYPE "public"."verification_status" AS ENUM('pending', 'verified', 'rejected', 'needs_review');--> statement-breakpoint
CREATE TABLE "ai_reports" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"case_id" uuid,
	"created_by" uuid,
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
	"verified_by" uuid,
	"status" "verification_status",
	"verification_date" timestamp,
	"notes" text,
	"created_at" timestamp DEFAULT now(),
	"updatedAt" timestamp DEFAULT now()
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
	"confirmed_by" uuid,
	"confirmed_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "canvas_annotations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"canvas_state_id" uuid,
	"created_by" uuid,
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
	"case_id" uuid,
	"user_id" uuid,
	"state_data" jsonb NOT NULL,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "case_activities" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"case_id" uuid,
	"assigned_to" uuid,
	"created_by" uuid,
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
CREATE TABLE "case_scores" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"calculated_by" uuid,
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
CREATE TABLE "chat_embeddings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"rag_message_id" uuid NOT NULL,
	"embedding" text NOT NULL,
	"model" varchar(100) NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
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
CREATE TABLE "email_verification_codes" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"email" varchar(255) NOT NULL,
	"code" varchar(8) NOT NULL,
	"expires_at" timestamp with time zone NOT NULL
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
	"verified_by" uuid,
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
	"user_id" uuid NOT NULL,
	"case_id" uuid,
	"analysis_type" varchar(100) NOT NULL,
	"input_data" jsonb,
	"output_summary" text,
	"status" varchar(50) DEFAULT 'pending' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
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
	"created_by" uuid NOT NULL,
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
	"content" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "rag_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
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
CREATE TABLE "saved_reports" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"report_id" uuid NOT NULL,
	"case_id" uuid,
	"saved_at" timestamp DEFAULT now() NOT NULL,
	"notes" text,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "statutes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"title" varchar(255) NOT NULL,
	"content" text NOT NULL,
	"jurisdiction" varchar(100),
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
	"user_id" uuid NOT NULL,
	"name" varchar(100) NOT NULL,
	"config" jsonb NOT NULL,
	"is_default" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "user_ai_queries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
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
	"embedding" text NOT NULL,
	"model" varchar(100) NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
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
ALTER TABLE "ai_history" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "code_embeddings" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "document_processing_tasks" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "knowledge_base" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "legal_analysis_cache" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "messages" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "profile" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "rag_documents" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "vector_similarity_queries" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP TABLE "ai_history" CASCADE;--> statement-breakpoint
DROP TABLE "code_embeddings" CASCADE;--> statement-breakpoint
DROP TABLE "document_processing_tasks" CASCADE;--> statement-breakpoint
DROP TABLE "knowledge_base" CASCADE;--> statement-breakpoint
DROP TABLE "legal_analysis_cache" CASCADE;--> statement-breakpoint
DROP TABLE "messages" CASCADE;--> statement-breakpoint
DROP TABLE "profile" CASCADE;--> statement-breakpoint
DROP TABLE "rag_documents" CASCADE;--> statement-breakpoint
DROP TABLE "vector_similarity_queries" CASCADE;--> statement-breakpoint
ALTER TABLE "cases" DROP CONSTRAINT "cases_case_number_unique";--> statement-breakpoint
ALTER TABLE "users" DROP CONSTRAINT "users_username_unique";--> statement-breakpoint
ALTER TABLE "cases" DROP CONSTRAINT "cases_user_id_users_id_fk";
--> statement-breakpoint
ALTER TABLE "citations" DROP CONSTRAINT "citations_case_id_cases_id_fk";
--> statement-breakpoint
ALTER TABLE "citations" DROP CONSTRAINT "citations_document_id_documents_id_fk";
--> statement-breakpoint
ALTER TABLE "document_chunks" DROP CONSTRAINT "document_chunks_document_id_documents_id_fk";
--> statement-breakpoint
ALTER TABLE "document_chunks" DROP CONSTRAINT "document_chunks_evidence_id_evidence_id_fk";
--> statement-breakpoint
ALTER TABLE "documents" DROP CONSTRAINT "documents_case_id_cases_id_fk";
--> statement-breakpoint
ALTER TABLE "documents" DROP CONSTRAINT "documents_user_id_users_id_fk";
--> statement-breakpoint
ALTER TABLE "evidence" DROP CONSTRAINT "evidence_case_id_cases_id_fk";
--> statement-breakpoint
ALTER TABLE "evidence" DROP CONSTRAINT "evidence_user_id_users_id_fk";
--> statement-breakpoint
DROP INDEX "cases_user_id_idx";--> statement-breakpoint
DROP INDEX "cases_status_idx";--> statement-breakpoint
DROP INDEX "cases_case_number_idx";--> statement-breakpoint
DROP INDEX "documents_case_id_idx";--> statement-breakpoint
DROP INDEX "documents_user_id_idx";--> statement-breakpoint
DROP INDEX "documents_file_type_idx";--> statement-breakpoint
DROP INDEX "documents_embedding_idx";--> statement-breakpoint
DROP INDEX "evidence_case_id_idx";--> statement-breakpoint
DROP INDEX "evidence_user_id_idx";--> statement-breakpoint
DROP INDEX "evidence_type_idx";--> statement-breakpoint
DROP INDEX "evidence_embedding_idx";--> statement-breakpoint
DROP INDEX "embedding_idx";--> statement-breakpoint
DROP INDEX "document_type_idx";--> statement-breakpoint
DROP INDEX "practice_area_idx";--> statement-breakpoint
DROP INDEX "case_id_idx";--> statement-breakpoint
DROP INDEX "client_id_idx";--> statement-breakpoint
DROP INDEX "created_at_idx";--> statement-breakpoint
DROP INDEX "document_hash_idx";--> statement-breakpoint
DROP INDEX "users_email_idx";--> statement-breakpoint
DROP INDEX "users_username_idx";--> statement-breakpoint
ALTER TABLE "cases" ALTER COLUMN "title" SET DATA TYPE varchar(255);--> statement-breakpoint
ALTER TABLE "cases" ALTER COLUMN "status" SET DATA TYPE "public"."case_status" USING "status"::"public"."case_status";--> statement-breakpoint
ALTER TABLE "cases" ALTER COLUMN "status" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "cases" ALTER COLUMN "status" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "cases" ALTER COLUMN "case_number" SET DATA TYPE varchar(100);--> statement-breakpoint
ALTER TABLE "cases" ALTER COLUMN "jurisdiction" SET DATA TYPE varchar(100);--> statement-breakpoint
ALTER TABLE "cases" ALTER COLUMN "practice_area" SET DATA TYPE varchar(100);--> statement-breakpoint
ALTER TABLE "cases" ALTER COLUMN "priority" SET DATA TYPE "public"."case_priority" USING "priority"::"public"."case_priority";--> statement-breakpoint
ALTER TABLE "cases" ALTER COLUMN "priority" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "cases" ALTER COLUMN "priority" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "cases" ALTER COLUMN "created_at" SET DATA TYPE timestamp with time zone;--> statement-breakpoint
ALTER TABLE "cases" ALTER COLUMN "created_at" SET DEFAULT now();--> statement-breakpoint
ALTER TABLE "cases" ALTER COLUMN "updated_at" SET DATA TYPE timestamp with time zone;--> statement-breakpoint
ALTER TABLE "cases" ALTER COLUMN "updated_at" SET DEFAULT now();--> statement-breakpoint
ALTER TABLE "cases" ALTER COLUMN "metadata" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "citations" ALTER COLUMN "document_id" SET DATA TYPE uuid;--> statement-breakpoint
ALTER TABLE "citations" ALTER COLUMN "created_at" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "citations" ALTER COLUMN "updated_at" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "document_chunks" ALTER COLUMN "document_id" SET DATA TYPE uuid;--> statement-breakpoint
ALTER TABLE "document_chunks" ALTER COLUMN "document_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "document_chunks" ALTER COLUMN "embedding" SET DATA TYPE text;--> statement-breakpoint
ALTER TABLE "document_chunks" ALTER COLUMN "embedding" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "document_chunks" ALTER COLUMN "metadata" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "documents" ALTER COLUMN "id" SET DATA TYPE uuid;--> statement-breakpoint
ALTER TABLE "documents" ALTER COLUMN "id" SET DEFAULT gen_random_uuid();--> statement-breakpoint
ALTER TABLE "documents" ALTER COLUMN "user_id" SET DATA TYPE uuid;--> statement-breakpoint
ALTER TABLE "documents" ALTER COLUMN "user_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "documents" ALTER COLUMN "file_size" SET DATA TYPE bigint;--> statement-breakpoint
ALTER TABLE "documents" ALTER COLUMN "file_size" SET NOT NULL;--> statement-breakpoint
/* 
    Unfortunately in current drizzle-kit version we can't automatically get name for primary key.
    We are working on making it available!

    Meanwhile you can:
        1. Check pk name in your database, by running
            SELECT constraint_name FROM information_schema.table_constraints
            WHERE table_schema = 'public'
                AND table_name = 'embedding_cache'
                AND constraint_type = 'PRIMARY KEY';
        2. Uncomment code below and paste pk name manually
        
    Hope to release this update as soon as possible
*/

-- ALTER TABLE "embedding_cache" DROP CONSTRAINT "<constraint_name>";--> statement-breakpoint
ALTER TABLE "embedding_cache" ALTER COLUMN "embedding" SET DATA TYPE text;--> statement-breakpoint
ALTER TABLE "embedding_cache" ALTER COLUMN "model" SET DATA TYPE varchar(100);--> statement-breakpoint
ALTER TABLE "evidence" ALTER COLUMN "case_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "evidence" ALTER COLUMN "title" SET DATA TYPE varchar(255);--> statement-breakpoint
ALTER TABLE "evidence" ALTER COLUMN "evidence_type" SET DATA TYPE "public"."evidence_type" USING "evidence_type"::"public"."evidence_type";--> statement-breakpoint
ALTER TABLE "evidence" ALTER COLUMN "evidence_type" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "legal_documents" ALTER COLUMN "content" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "legal_documents" ALTER COLUMN "document_type" SET DATA TYPE "public"."document_type" USING "document_type"::"public"."document_type";--> statement-breakpoint
ALTER TABLE "legal_documents" ALTER COLUMN "document_type" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "legal_documents" ALTER COLUMN "practice_area" SET DATA TYPE varchar(100);--> statement-breakpoint
ALTER TABLE "legal_documents" ALTER COLUMN "case_id" SET DATA TYPE uuid;--> statement-breakpoint
ALTER TABLE "legal_documents" ALTER COLUMN "file_size" SET DATA TYPE bigint;--> statement-breakpoint
ALTER TABLE "legal_documents" ALTER COLUMN "file_size" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "legal_documents" ALTER COLUMN "mime_type" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "legal_documents" ALTER COLUMN "created_at" SET DATA TYPE timestamp with time zone;--> statement-breakpoint
ALTER TABLE "legal_documents" ALTER COLUMN "created_at" SET DEFAULT now();--> statement-breakpoint
ALTER TABLE "legal_documents" ALTER COLUMN "created_at" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "legal_documents" ALTER COLUMN "updated_at" SET DATA TYPE timestamp with time zone;--> statement-breakpoint
ALTER TABLE "legal_documents" ALTER COLUMN "updated_at" SET DEFAULT now();--> statement-breakpoint
ALTER TABLE "legal_documents" ALTER COLUMN "updated_at" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "sessions" ALTER COLUMN "id" SET DATA TYPE uuid;--> statement-breakpoint
ALTER TABLE "sessions" ALTER COLUMN "id" SET DEFAULT gen_random_uuid();--> statement-breakpoint
ALTER TABLE "sessions" ALTER COLUMN "user_id" SET DATA TYPE uuid;--> statement-breakpoint
ALTER TABLE "sessions" ALTER COLUMN "expires_at" SET DATA TYPE timestamp;--> statement-breakpoint
ALTER TABLE "users" ALTER COLUMN "id" SET DATA TYPE uuid;--> statement-breakpoint
ALTER TABLE "users" ALTER COLUMN "id" SET DEFAULT gen_random_uuid();--> statement-breakpoint
ALTER TABLE "users" ALTER COLUMN "email" SET DATA TYPE varchar(255);--> statement-breakpoint
ALTER TABLE "users" ALTER COLUMN "first_name" SET DATA TYPE varchar(255);--> statement-breakpoint
ALTER TABLE "users" ALTER COLUMN "last_name" SET DATA TYPE varchar(255);--> statement-breakpoint
ALTER TABLE "users" ALTER COLUMN "role" SET DEFAULT 'prosecutor'::"public"."user_role";--> statement-breakpoint
ALTER TABLE "users" ALTER COLUMN "role" SET DATA TYPE "public"."user_role" USING "role"::"public"."user_role";--> statement-breakpoint
ALTER TABLE "users" ALTER COLUMN "role" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ALTER COLUMN "created_at" SET DATA TYPE timestamp with time zone;--> statement-breakpoint
ALTER TABLE "users" ALTER COLUMN "created_at" SET DEFAULT now();--> statement-breakpoint
ALTER TABLE "users" ALTER COLUMN "updated_at" SET DATA TYPE timestamp with time zone;--> statement-breakpoint
ALTER TABLE "users" ALTER COLUMN "updated_at" SET DEFAULT now();--> statement-breakpoint
ALTER TABLE "cases" ADD COLUMN "court" varchar(200);--> statement-breakpoint
ALTER TABLE "cases" ADD COLUMN "client_name" varchar(200);--> statement-breakpoint
ALTER TABLE "cases" ADD COLUMN "opposing_party" varchar(200);--> statement-breakpoint
ALTER TABLE "cases" ADD COLUMN "assigned_attorney" uuid;--> statement-breakpoint
ALTER TABLE "cases" ADD COLUMN "filing_date" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "cases" ADD COLUMN "due_date" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "cases" ADD COLUMN "closed_date" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "cases" ADD COLUMN "qdrant_id" uuid;--> statement-breakpoint
ALTER TABLE "cases" ADD COLUMN "qdrant_collection" varchar(100);--> statement-breakpoint
ALTER TABLE "citations" ADD COLUMN "source_url" text;--> statement-breakpoint
ALTER TABLE "citations" ADD COLUMN "confidence" real;--> statement-breakpoint
ALTER TABLE "citations" ADD COLUMN "created_by" uuid;--> statement-breakpoint
ALTER TABLE "document_chunks" ADD COLUMN "content" text NOT NULL;--> statement-breakpoint
ALTER TABLE "documents" ADD COLUMN "content" text;--> statement-breakpoint
ALTER TABLE "documents" ADD COLUMN "s3_key" text NOT NULL;--> statement-breakpoint
ALTER TABLE "documents" ADD COLUMN "s3_bucket" text DEFAULT 'legal-documents' NOT NULL;--> statement-breakpoint
ALTER TABLE "documents" ADD COLUMN "original_name" text NOT NULL;--> statement-breakpoint
ALTER TABLE "documents" ADD COLUMN "mime_type" text NOT NULL;--> statement-breakpoint
ALTER TABLE "documents" ADD COLUMN "status" "document_status" DEFAULT 'queued' NOT NULL;--> statement-breakpoint
ALTER TABLE "embedding_cache" ADD COLUMN "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL;--> statement-breakpoint
ALTER TABLE "evidence" ADD COLUMN "criminal_id" uuid;--> statement-breakpoint
ALTER TABLE "evidence" ADD COLUMN "file_type" varchar(50);--> statement-breakpoint
ALTER TABLE "evidence" ADD COLUMN "sub_type" varchar(50);--> statement-breakpoint
ALTER TABLE "evidence" ADD COLUMN "file_name" varchar(255);--> statement-breakpoint
ALTER TABLE "evidence" ADD COLUMN "canvas_position" jsonb DEFAULT '{}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "evidence" ADD COLUMN "uploaded_by" uuid;--> statement-breakpoint
ALTER TABLE "evidence" ADD COLUMN "uploaded_at" timestamp DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "legal_documents" ADD COLUMN "s3_key" text NOT NULL;--> statement-breakpoint
ALTER TABLE "legal_documents" ADD COLUMN "s3_bucket" text DEFAULT 'legal-documents' NOT NULL;--> statement-breakpoint
ALTER TABLE "legal_documents" ADD COLUMN "original_name" text NOT NULL;--> statement-breakpoint
ALTER TABLE "legal_documents" ADD COLUMN "user_id" uuid;--> statement-breakpoint
ALTER TABLE "legal_documents" ADD COLUMN "evidence_id" uuid;--> statement-breakpoint
ALTER TABLE "legal_documents" ADD COLUMN "created_by" uuid;--> statement-breakpoint
ALTER TABLE "legal_documents" ADD COLUMN "status" "document_status" DEFAULT 'queued' NOT NULL;--> statement-breakpoint
ALTER TABLE "legal_documents" ADD COLUMN "metadata" jsonb;--> statement-breakpoint
ALTER TABLE "legal_documents" ADD COLUMN "content_embedding" text;--> statement-breakpoint
ALTER TABLE "legal_documents" ADD COLUMN "qdrant_id" uuid;--> statement-breakpoint
ALTER TABLE "legal_documents" ADD COLUMN "qdrant_collection" varchar(100);--> statement-breakpoint
ALTER TABLE "legal_documents" ADD COLUMN "last_synced_to_qdrant" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "legal_documents" ADD COLUMN "deleted_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "hashed_password" varchar(255) NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "name" varchar(255);--> statement-breakpoint
ALTER TABLE "case_scores" ADD CONSTRAINT "case_scores_case_id_cases_id_fk" FOREIGN KEY ("case_id") REFERENCES "public"."cases"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "case_scores" ADD CONSTRAINT "case_scores_calculated_by_users_id_fk" FOREIGN KEY ("calculated_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cases" DROP COLUMN "user_id";--> statement-breakpoint
ALTER TABLE "citations" DROP COLUMN "citation_type";--> statement-breakpoint
ALTER TABLE "citations" DROP COLUMN "source";--> statement-breakpoint
ALTER TABLE "citations" DROP COLUMN "relevance_score";--> statement-breakpoint
ALTER TABLE "citations" DROP COLUMN "context";--> statement-breakpoint
ALTER TABLE "citations" DROP COLUMN "verified";--> statement-breakpoint
ALTER TABLE "citations" DROP COLUMN "metadata";--> statement-breakpoint
ALTER TABLE "document_chunks" DROP COLUMN "evidence_id";--> statement-breakpoint
ALTER TABLE "document_chunks" DROP COLUMN "chunk_text";--> statement-breakpoint
ALTER TABLE "document_chunks" DROP COLUMN "token_count";--> statement-breakpoint
ALTER TABLE "documents" DROP COLUMN "description";--> statement-breakpoint
ALTER TABLE "documents" DROP COLUMN "content_text";--> statement-breakpoint
ALTER TABLE "documents" DROP COLUMN "file_path";--> statement-breakpoint
ALTER TABLE "documents" DROP COLUMN "file_type";--> statement-breakpoint
ALTER TABLE "documents" DROP COLUMN "embedding";--> statement-breakpoint
ALTER TABLE "documents" DROP COLUMN "tags";--> statement-breakpoint
ALTER TABLE "documents" DROP COLUMN "metadata";--> statement-breakpoint
ALTER TABLE "embedding_cache" DROP COLUMN "dimensions";--> statement-breakpoint
ALTER TABLE "evidence" DROP COLUMN "user_id";--> statement-breakpoint
ALTER TABLE "evidence" DROP COLUMN "source";--> statement-breakpoint
ALTER TABLE "evidence" DROP COLUMN "date_collected";--> statement-breakpoint
ALTER TABLE "evidence" DROP COLUMN "relevance_score";--> statement-breakpoint
ALTER TABLE "evidence" DROP COLUMN "confidentiality_level";--> statement-breakpoint
ALTER TABLE "evidence" DROP COLUMN "embedding";--> statement-breakpoint
ALTER TABLE "evidence" DROP COLUMN "created_at";--> statement-breakpoint
ALTER TABLE "evidence" DROP COLUMN "metadata";--> statement-breakpoint
ALTER TABLE "legal_documents" DROP COLUMN "embedding";--> statement-breakpoint
ALTER TABLE "legal_documents" DROP COLUMN "jurisdiction";--> statement-breakpoint
ALTER TABLE "legal_documents" DROP COLUMN "client_id";--> statement-breakpoint
ALTER TABLE "legal_documents" DROP COLUMN "confidentiality_level";--> statement-breakpoint
ALTER TABLE "legal_documents" DROP COLUMN "document_status";--> statement-breakpoint
ALTER TABLE "legal_documents" DROP COLUMN "processing_time_ms";--> statement-breakpoint
ALTER TABLE "legal_documents" DROP COLUMN "model_version";--> statement-breakpoint
ALTER TABLE "legal_documents" DROP COLUMN "document_hash";--> statement-breakpoint
ALTER TABLE "legal_documents" DROP COLUMN "original_filename";--> statement-breakpoint
ALTER TABLE "legal_documents" DROP COLUMN "last_accessed_at";--> statement-breakpoint
ALTER TABLE "sessions" DROP COLUMN "created_at";--> statement-breakpoint
ALTER TABLE "sessions" DROP COLUMN "updated_at";--> statement-breakpoint
ALTER TABLE "sessions" DROP COLUMN "message_count";--> statement-breakpoint
ALTER TABLE "users" DROP COLUMN "username";--> statement-breakpoint
ALTER TABLE "users" DROP COLUMN "password_hash";--> statement-breakpoint
ALTER TABLE "users" DROP COLUMN "is_active";--> statement-breakpoint
ALTER TABLE "embedding_cache" ADD CONSTRAINT "embedding_cache_text_hash_unique" UNIQUE("text_hash");