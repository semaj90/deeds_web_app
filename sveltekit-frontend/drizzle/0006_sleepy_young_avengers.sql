CREATE TYPE "public"."audit_table" AS ENUM('Evidence', 'Tag', 'EvidenceTag', 'RAGIndex');--> statement-breakpoint
CREATE TYPE "public"."relation_type" AS ENUM('supports', 'contradicts', 'same_person', 'timeline', 'chain_of_custody', 'corroborates', 'alibi', 'motive', 'opportunity', 'means', 'witness_statement', 'physical_evidence', 'digital_evidence', 'circumstantial', 'direct_evidence', 'hearsay', 'privileged', 'inadmissible');--> statement-breakpoint
CREATE TABLE "warden_audit_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"prosecutor_id" uuid NOT NULL,
	"case_id" uuid,
	"evidence_id" uuid,
	"action" varchar(50) NOT NULL,
	"details" jsonb,
	"sha256" varchar(64),
	"timestamp" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "warden_cases" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"prosecutor_id" uuid NOT NULL,
	"title" varchar(512) DEFAULT 'Untitled Case',
	"description" text,
	"case_number" varchar(255),
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "warden_chunks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"evidence_id" uuid NOT NULL,
	"case_id" uuid NOT NULL,
	"seq" integer,
	"section" varchar(100),
	"text" text NOT NULL,
	"token_length" integer,
	"embedding" vector(768),
	"latent128" vector(128),
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "warden_citation_graph" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"case_id" varchar(128) NOT NULL,
	"cited_case_id" varchar(128) NOT NULL,
	"weight" real DEFAULT 1,
	"source" varchar(64) DEFAULT 'ai',
	"approved" boolean DEFAULT false,
	"approved_by" uuid,
	"approved_at" timestamp,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "warden_citations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"evidence_id" uuid NOT NULL,
	"case_id" uuid NOT NULL,
	"chunk_id" uuid,
	"type" varchar(50),
	"citation_text" text,
	"citation_normalized" varchar(255),
	"page" integer,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "warden_evidence" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"case_id" uuid NOT NULL,
	"prosecutor_id" uuid NOT NULL,
	"file_name" varchar(512) NOT NULL,
	"sha256" varchar(64) NOT NULL,
	"mime_type" varchar(100),
	"file_size" integer,
	"minio_path" varchar(512) NOT NULL,
	"minio_bucket" varchar(100) NOT NULL,
	"document_type" varchar(100),
	"document_subtype" varchar(100),
	"inference_confidence" real,
	"status" varchar(50) DEFAULT 'pending',
	"reviewed_at" timestamp,
	"reviewed_by" uuid,
	"rejection_reason" text,
	"metadata" jsonb,
	"prev_sha256" varchar(64),
	"created_at" timestamp DEFAULT now(),
	CONSTRAINT "warden_evidence_sha256_unique" UNIQUE("sha256")
);
--> statement-breakpoint
CREATE TABLE "warden_evidence_summaries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"evidence_id" uuid NOT NULL,
	"holding" text NOT NULL,
	"reasoning" text,
	"citations" jsonb,
	"keywords" text[],
	"suggested_at" timestamp DEFAULT now(),
	"approved" boolean DEFAULT false,
	"approved_by" uuid,
	"approved_at" timestamp,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "warden_file_locks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"sha256" varchar(64) NOT NULL,
	"locked_at" timestamp DEFAULT now(),
	"expires_at" timestamp,
	"locked_by" uuid NOT NULL,
	CONSTRAINT "warden_file_locks_sha256_unique" UNIQUE("sha256")
);
--> statement-breakpoint
CREATE TABLE "warden_hmm_topics" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"chunk_id" uuid NOT NULL,
	"topic_label" varchar(100),
	"probability" real,
	"sequence" integer,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "warden_holdings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"case_id" uuid NOT NULL,
	"evidence_id" uuid NOT NULL,
	"chunk_id" uuid,
	"issue" text,
	"holding" text NOT NULL,
	"reasoning" text,
	"references" jsonb,
	"confidence" real,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "warden_ocr" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"evidence_id" uuid NOT NULL,
	"raw_text" text,
	"cleaned_text" text,
	"confidence" real,
	"page_count" integer,
	"extracted_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "warden_users" (
	"id" uuid PRIMARY KEY NOT NULL,
	"email" varchar(255) NOT NULL,
	"password_hash" varchar(255) NOT NULL,
	"created_at" timestamp DEFAULT now(),
	CONSTRAINT "warden_users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
ALTER TABLE "case_activities" ALTER COLUMN "status" SET DATA TYPE text;--> statement-breakpoint
DROP TYPE "public"."activity_status";--> statement-breakpoint
CREATE TYPE "public"."activity_status" AS ENUM('pending', 'in_progress', 'completed', 'cancelled');--> statement-breakpoint
ALTER TABLE "case_activities" ALTER COLUMN "status" SET DATA TYPE "public"."activity_status" USING "status"::"public"."activity_status";--> statement-breakpoint
ALTER TABLE "case_scores" ALTER COLUMN "risk_level" SET DATA TYPE text;--> statement-breakpoint
DROP TYPE "public"."case_risk_level";--> statement-breakpoint
CREATE TYPE "public"."case_risk_level" AS ENUM('low', 'medium', 'high', 'critical');--> statement-breakpoint
ALTER TABLE "case_scores" ALTER COLUMN "risk_level" SET DATA TYPE "public"."case_risk_level" USING "risk_level"::"public"."case_risk_level";--> statement-breakpoint
ALTER TABLE "document_processing" ALTER COLUMN "status" SET DATA TYPE text;--> statement-breakpoint
ALTER TABLE "document_processing" ALTER COLUMN "status" SET DEFAULT 'queued'::text;--> statement-breakpoint
ALTER TABLE "legal_documents" ALTER COLUMN "status" SET DATA TYPE text;--> statement-breakpoint
ALTER TABLE "legal_documents" ALTER COLUMN "status" SET DEFAULT 'queued'::text;--> statement-breakpoint
DROP TYPE "public"."document_status";--> statement-breakpoint
CREATE TYPE "public"."document_status" AS ENUM('queued', 'processing', 'completed', 'failed');--> statement-breakpoint
ALTER TABLE "document_processing" ALTER COLUMN "status" SET DEFAULT 'queued'::"public"."document_status";--> statement-breakpoint
ALTER TABLE "document_processing" ALTER COLUMN "status" SET DATA TYPE "public"."document_status" USING "status"::"public"."document_status";--> statement-breakpoint
ALTER TABLE "legal_documents" ALTER COLUMN "status" SET DEFAULT 'queued'::"public"."document_status";--> statement-breakpoint
ALTER TABLE "legal_documents" ALTER COLUMN "status" SET DATA TYPE "public"."document_status" USING "status"::"public"."document_status";--> statement-breakpoint
ALTER TABLE "legal_documents" ALTER COLUMN "document_type" SET DATA TYPE text;--> statement-breakpoint
DROP TYPE "public"."document_type";--> statement-breakpoint
CREATE TYPE "public"."document_type" AS ENUM('pleading', 'motion', 'brief', 'contract', 'evidence', 'correspondence', 'court_order', 'transcript', 'affidavit', 'other');--> statement-breakpoint
ALTER TABLE "legal_documents" ALTER COLUMN "document_type" SET DATA TYPE "public"."document_type" USING "document_type"::"public"."document_type";--> statement-breakpoint
ALTER TABLE "error_clusters" ALTER COLUMN "kind" SET DATA TYPE text;--> statement-breakpoint
ALTER TABLE "error_events" ALTER COLUMN "kind" SET DATA TYPE text;--> statement-breakpoint
ALTER TABLE "error_events" ALTER COLUMN "kind" SET DEFAULT 'other'::text;--> statement-breakpoint
DROP TYPE "public"."error_kind";--> statement-breakpoint
CREATE TYPE "public"."error_kind" AS ENUM('runtime', 'api', 'other');--> statement-breakpoint
ALTER TABLE "error_clusters" ALTER COLUMN "kind" SET DATA TYPE "public"."error_kind" USING "kind"::"public"."error_kind";--> statement-breakpoint
ALTER TABLE "error_events" ALTER COLUMN "kind" SET DEFAULT 'other'::"public"."error_kind";--> statement-breakpoint
ALTER TABLE "error_events" ALTER COLUMN "kind" SET DATA TYPE "public"."error_kind" USING "kind"::"public"."error_kind";--> statement-breakpoint
ALTER TABLE "error_clusters" ALTER COLUMN "severity" SET DATA TYPE text;--> statement-breakpoint
ALTER TABLE "error_clusters" ALTER COLUMN "severity" SET DEFAULT 'warn'::text;--> statement-breakpoint
ALTER TABLE "error_events" ALTER COLUMN "severity" SET DATA TYPE text;--> statement-breakpoint
ALTER TABLE "error_events" ALTER COLUMN "severity" SET DEFAULT 'warn'::text;--> statement-breakpoint
DROP TYPE "public"."error_severity";--> statement-breakpoint
CREATE TYPE "public"."error_severity" AS ENUM('info', 'warn', 'error', 'critical');--> statement-breakpoint
ALTER TABLE "error_clusters" ALTER COLUMN "severity" SET DEFAULT 'warn'::"public"."error_severity";--> statement-breakpoint
ALTER TABLE "error_clusters" ALTER COLUMN "severity" SET DATA TYPE "public"."error_severity" USING "severity"::"public"."error_severity";--> statement-breakpoint
ALTER TABLE "error_events" ALTER COLUMN "severity" SET DEFAULT 'warn'::"public"."error_severity";--> statement-breakpoint
ALTER TABLE "error_events" ALTER COLUMN "severity" SET DATA TYPE "public"."error_severity" USING "severity"::"public"."error_severity";--> statement-breakpoint
ALTER TABLE "reports" ALTER COLUMN "status" SET DATA TYPE text;--> statement-breakpoint
ALTER TABLE "reports" ALTER COLUMN "status" SET DEFAULT 'draft'::text;--> statement-breakpoint
DROP TYPE "public"."report_status";--> statement-breakpoint
CREATE TYPE "public"."report_status" AS ENUM('draft', 'pending', 'completed', 'published');--> statement-breakpoint
ALTER TABLE "reports" ALTER COLUMN "status" SET DEFAULT 'draft'::"public"."report_status";--> statement-breakpoint
ALTER TABLE "reports" ALTER COLUMN "status" SET DATA TYPE "public"."report_status" USING "status"::"public"."report_status";--> statement-breakpoint
ALTER TABLE "route_health" ALTER COLUMN "state" SET DATA TYPE text;--> statement-breakpoint
ALTER TABLE "route_health" ALTER COLUMN "state" SET DEFAULT 'healthy'::text;--> statement-breakpoint
DROP TYPE "public"."route_health_state";--> statement-breakpoint
CREATE TYPE "public"."route_health_state" AS ENUM('healthy', 'degraded', 'unhealthy');--> statement-breakpoint
ALTER TABLE "route_health" ALTER COLUMN "state" SET DEFAULT 'healthy'::"public"."route_health_state";--> statement-breakpoint
ALTER TABLE "route_health" ALTER COLUMN "state" SET DATA TYPE "public"."route_health_state" USING "state"::"public"."route_health_state";--> statement-breakpoint
ALTER TABLE "document_summaries" ALTER COLUMN "summary_type" SET DATA TYPE text;--> statement-breakpoint
DROP TYPE "public"."summary_type";--> statement-breakpoint
CREATE TYPE "public"."summary_type" AS ENUM('brief', 'detailed', 'executive', 'technical');--> statement-breakpoint
ALTER TABLE "document_summaries" ALTER COLUMN "summary_type" SET DATA TYPE "public"."summary_type" USING "summary_type"::"public"."summary_type";--> statement-breakpoint
ALTER TABLE "attachment_verifications" ALTER COLUMN "status" SET DATA TYPE text;--> statement-breakpoint
ALTER TABLE "hash_verifications" ALTER COLUMN "status" SET DATA TYPE text;--> statement-breakpoint
ALTER TABLE "hash_verifications" ALTER COLUMN "status" SET DEFAULT 'pending'::text;--> statement-breakpoint
DROP TYPE "public"."verification_status";--> statement-breakpoint
CREATE TYPE "public"."verification_status" AS ENUM('pending', 'verified', 'failed', 'rejected');--> statement-breakpoint
ALTER TABLE "attachment_verifications" ALTER COLUMN "status" SET DATA TYPE "public"."verification_status" USING "status"::"public"."verification_status";--> statement-breakpoint
ALTER TABLE "hash_verifications" ALTER COLUMN "status" SET DEFAULT 'pending'::"public"."verification_status";--> statement-breakpoint
ALTER TABLE "hash_verifications" ALTER COLUMN "status" SET DATA TYPE "public"."verification_status" USING "status"::"public"."verification_status";--> statement-breakpoint
ALTER TABLE "canvas_states" ALTER COLUMN "user_id" SET DATA TYPE uuid;--> statement-breakpoint
ALTER TABLE "evidence_relationships" ALTER COLUMN "relationship_type" SET DATA TYPE "public"."relation_type" USING "relationship_type"::text::"public"."relation_type";--> statement-breakpoint
ALTER TABLE "evidence_relationships" ALTER COLUMN "strength" SET DATA TYPE varchar(20);--> statement-breakpoint
ALTER TABLE "evidence_relationships" ALTER COLUMN "strength" SET DEFAULT 'medium';--> statement-breakpoint
ALTER TABLE "user_ai_queries" ALTER COLUMN "user_id" SET DATA TYPE uuid;--> statement-breakpoint
ALTER TABLE "cases" ADD COLUMN "user_id" uuid;--> statement-breakpoint
ALTER TABLE "warden_audit_log" ADD CONSTRAINT "warden_audit_log_prosecutor_id_warden_users_id_fk" FOREIGN KEY ("prosecutor_id") REFERENCES "public"."warden_users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "warden_audit_log" ADD CONSTRAINT "warden_audit_log_case_id_warden_cases_id_fk" FOREIGN KEY ("case_id") REFERENCES "public"."warden_cases"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "warden_audit_log" ADD CONSTRAINT "warden_audit_log_evidence_id_warden_evidence_id_fk" FOREIGN KEY ("evidence_id") REFERENCES "public"."warden_evidence"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "warden_cases" ADD CONSTRAINT "warden_cases_prosecutor_id_warden_users_id_fk" FOREIGN KEY ("prosecutor_id") REFERENCES "public"."warden_users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "warden_chunks" ADD CONSTRAINT "warden_chunks_evidence_id_warden_evidence_id_fk" FOREIGN KEY ("evidence_id") REFERENCES "public"."warden_evidence"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "warden_chunks" ADD CONSTRAINT "warden_chunks_case_id_warden_cases_id_fk" FOREIGN KEY ("case_id") REFERENCES "public"."warden_cases"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "warden_citation_graph" ADD CONSTRAINT "warden_citation_graph_approved_by_warden_users_id_fk" FOREIGN KEY ("approved_by") REFERENCES "public"."warden_users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "warden_citations" ADD CONSTRAINT "warden_citations_evidence_id_warden_evidence_id_fk" FOREIGN KEY ("evidence_id") REFERENCES "public"."warden_evidence"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "warden_citations" ADD CONSTRAINT "warden_citations_case_id_warden_cases_id_fk" FOREIGN KEY ("case_id") REFERENCES "public"."warden_cases"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "warden_citations" ADD CONSTRAINT "warden_citations_chunk_id_warden_chunks_id_fk" FOREIGN KEY ("chunk_id") REFERENCES "public"."warden_chunks"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "warden_evidence" ADD CONSTRAINT "warden_evidence_case_id_warden_cases_id_fk" FOREIGN KEY ("case_id") REFERENCES "public"."warden_cases"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "warden_evidence" ADD CONSTRAINT "warden_evidence_prosecutor_id_warden_users_id_fk" FOREIGN KEY ("prosecutor_id") REFERENCES "public"."warden_users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "warden_evidence" ADD CONSTRAINT "warden_evidence_reviewed_by_warden_users_id_fk" FOREIGN KEY ("reviewed_by") REFERENCES "public"."warden_users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "warden_evidence_summaries" ADD CONSTRAINT "warden_evidence_summaries_evidence_id_warden_evidence_id_fk" FOREIGN KEY ("evidence_id") REFERENCES "public"."warden_evidence"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "warden_evidence_summaries" ADD CONSTRAINT "warden_evidence_summaries_approved_by_warden_users_id_fk" FOREIGN KEY ("approved_by") REFERENCES "public"."warden_users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "warden_file_locks" ADD CONSTRAINT "warden_file_locks_locked_by_warden_users_id_fk" FOREIGN KEY ("locked_by") REFERENCES "public"."warden_users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "warden_hmm_topics" ADD CONSTRAINT "warden_hmm_topics_chunk_id_warden_chunks_id_fk" FOREIGN KEY ("chunk_id") REFERENCES "public"."warden_chunks"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "warden_holdings" ADD CONSTRAINT "warden_holdings_case_id_warden_cases_id_fk" FOREIGN KEY ("case_id") REFERENCES "public"."warden_cases"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "warden_holdings" ADD CONSTRAINT "warden_holdings_evidence_id_warden_evidence_id_fk" FOREIGN KEY ("evidence_id") REFERENCES "public"."warden_evidence"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "warden_holdings" ADD CONSTRAINT "warden_holdings_chunk_id_warden_chunks_id_fk" FOREIGN KEY ("chunk_id") REFERENCES "public"."warden_chunks"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "warden_ocr" ADD CONSTRAINT "warden_ocr_evidence_id_warden_evidence_id_fk" FOREIGN KEY ("evidence_id") REFERENCES "public"."warden_evidence"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "warden_audit_log_prosecutor_id_idx" ON "warden_audit_log" USING btree ("prosecutor_id");--> statement-breakpoint
CREATE INDEX "warden_audit_log_case_id_idx" ON "warden_audit_log" USING btree ("case_id");--> statement-breakpoint
CREATE INDEX "warden_audit_log_action_idx" ON "warden_audit_log" USING btree ("action");--> statement-breakpoint
CREATE INDEX "warden_chunks_evidence_id_idx" ON "warden_chunks" USING btree ("evidence_id");--> statement-breakpoint
CREATE INDEX "warden_chunks_case_id_idx" ON "warden_chunks" USING btree ("case_id");--> statement-breakpoint
CREATE INDEX "warden_citation_graph_case_id_idx" ON "warden_citation_graph" USING btree ("case_id");--> statement-breakpoint
CREATE INDEX "warden_citation_graph_cited_case_id_idx" ON "warden_citation_graph" USING btree ("cited_case_id");--> statement-breakpoint
CREATE INDEX "warden_citations_evidence_id_idx" ON "warden_citations" USING btree ("evidence_id");--> statement-breakpoint
CREATE INDEX "warden_citations_case_id_idx" ON "warden_citations" USING btree ("case_id");--> statement-breakpoint
CREATE INDEX "warden_evidence_case_id_idx" ON "warden_evidence" USING btree ("case_id");--> statement-breakpoint
CREATE INDEX "warden_evidence_sha256_idx" ON "warden_evidence" USING btree ("sha256");--> statement-breakpoint
CREATE INDEX "warden_evidence_status_idx" ON "warden_evidence" USING btree ("status");--> statement-breakpoint
DROP TYPE "public"."audit_resource_type";--> statement-breakpoint
DROP TYPE "public"."confidentiality_level";--> statement-breakpoint
DROP TYPE "public"."evidence_relationship_strength";--> statement-breakpoint
DROP TYPE "public"."evidence_relationship_type";