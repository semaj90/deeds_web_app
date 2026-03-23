-- APPLIED 2025-07 -- DO NOT RE-RUN: contains DROP TABLE and DROP COLUMN statements that will destroy production data
-- Tables dropped: account, case_law_links, content_embeddings, export_history, law_paragraphs, report_templates, verificationToken
CREATE TABLE "attachment_verifications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"attachment_id" uuid NOT NULL,
	"verified_by" uuid NOT NULL,
	"verification_status" varchar(50) DEFAULT 'pending' NOT NULL,
	"verification_notes" text,
	"verified_at" timestamp DEFAULT now() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "canvas_layouts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"case_id" uuid,
	"theme_id" uuid,
	"layout_data" jsonb NOT NULL,
	"components" jsonb NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb,
	"is_template" boolean DEFAULT false NOT NULL,
	"created_by" uuid,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "case_criminals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"case_id" uuid NOT NULL,
	"criminal_id" uuid NOT NULL,
	"role" varchar(50) DEFAULT 'suspect' NOT NULL,
	"charges" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"conviction" boolean DEFAULT false NOT NULL,
	"sentencing" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"notes" text,
	"added_by" uuid,
	"added_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "hash_verifications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"evidence_id" uuid NOT NULL,
	"verified_hash" varchar(64) NOT NULL,
	"stored_hash" varchar(64),
	"result" boolean NOT NULL,
	"verification_method" varchar(50) DEFAULT 'manual' NOT NULL,
	"verified_by" uuid NOT NULL,
	"notes" text,
	"verified_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "layout_components" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(100) NOT NULL,
	"type" varchar(50) NOT NULL,
	"html_content" text NOT NULL,
	"css_styles" text,
	"js_interactions" text,
	"position" jsonb NOT NULL,
	"theme_id" uuid,
	"is_public" boolean DEFAULT false NOT NULL,
	"created_by" uuid,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "legal_documents" (
	"id" text PRIMARY KEY NOT NULL,
	"case_id" uuid,
	"user_id" uuid,
	"title" varchar(255) NOT NULL,
	"content" text NOT NULL,
	"document_type" varchar(50) DEFAULT 'brief' NOT NULL,
	"status" varchar(20) DEFAULT 'draft' NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"metadata" jsonb DEFAULT '{"keywords":[],"customFields":{},"confidentialityLevel":"restricted"}'::jsonb NOT NULL,
	"citations" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"auto_save_data" jsonb DEFAULT '{"content":"","citations":[],"autoSavedAt":"2025-07-19T03:49:24.432Z","isDirty":false}'::jsonb NOT NULL,
	"collaborators" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"word_count" integer DEFAULT 0 NOT NULL,
	"reading_time" integer DEFAULT 0 NOT NULL,
	"ai_summary" text,
	"ai_tags" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"title_embedding" vector(1536),
	"content_embedding" vector(1536),
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"published_at" timestamp,
	"archived_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "notes" (
	"id" text PRIMARY KEY NOT NULL,
	"case_id" uuid,
	"user_id" uuid,
	"title" varchar(255),
	"content" text NOT NULL,
	"note_type" varchar(50) DEFAULT 'general' NOT NULL,
	"priority" varchar(20) DEFAULT 'medium' NOT NULL,
	"tags" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"related_evidence_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"related_criminal_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"ai_summary" text,
	"sentiment" varchar(20),
	"is_private" boolean DEFAULT false NOT NULL,
	"shared_with" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"reminder_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "persons_of_interest" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"case_id" uuid NOT NULL,
	"name" varchar(256) NOT NULL,
	"aliases" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"profile_image_url" text,
	"profile_data" jsonb DEFAULT '{"who":"","what":"","why":"","how":""}'::jsonb NOT NULL,
	"pos_x" numeric(10, 2) DEFAULT '100' NOT NULL,
	"pos_y" numeric(10, 2) DEFAULT '100' NOT NULL,
	"relationship" varchar(100),
	"threat_level" varchar(20) DEFAULT 'low' NOT NULL,
	"status" varchar(20) DEFAULT 'active' NOT NULL,
	"tags" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_by" uuid NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "saved_citations" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" uuid,
	"citation_point_id" uuid,
	"title" varchar(255),
	"description" text,
	"citation_data" jsonb NOT NULL,
	"tags" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"category" varchar(50) DEFAULT 'general' NOT NULL,
	"is_favorite" boolean DEFAULT false NOT NULL,
	"is_archived" boolean DEFAULT false NOT NULL,
	"usage_count" integer DEFAULT 0 NOT NULL,
	"last_used_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "search_tags" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"entity_type" varchar(20) NOT NULL,
	"entity_id" uuid NOT NULL,
	"tag" varchar(100) NOT NULL,
	"category" varchar(50),
	"confidence" numeric(5, 4),
	"source" varchar(50),
	"created_by" uuid,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "themes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(100) NOT NULL,
	"description" text,
	"css_variables" jsonb NOT NULL,
	"font_config" jsonb NOT NULL,
	"color_palette" jsonb NOT NULL,
	"spacing" jsonb NOT NULL,
	"border_radius" jsonb NOT NULL,
	"shadows" jsonb NOT NULL,
	"is_system" boolean DEFAULT false NOT NULL,
	"is_public" boolean DEFAULT false NOT NULL,
	"created_by" uuid,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_themes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"theme_id" uuid NOT NULL,
	"is_active" boolean DEFAULT false NOT NULL,
	"custom_overrides" jsonb DEFAULT '{}'::jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "case_embeddings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"case_id" uuid NOT NULL,
	"field_name" varchar(100) NOT NULL,
	"content" text NOT NULL,
	"embedding" jsonb NOT NULL,
	"metadata" jsonb,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "chat_embeddings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"conversation_id" uuid NOT NULL,
	"role" varchar(20) NOT NULL,
	"content" text NOT NULL,
	"embedding" jsonb NOT NULL,
	"metadata" jsonb,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "document_embeddings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"document_id" uuid NOT NULL,
	"document_type" varchar(50) NOT NULL,
	"chunk_text" text NOT NULL,
	"embedding" jsonb NOT NULL,
	"metadata" jsonb,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "evidence_vectors" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"evidence_id" uuid NOT NULL,
	"content" text NOT NULL,
	"embedding" jsonb NOT NULL,
	"metadata" jsonb,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "semantic_search_cache" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"query_hash" varchar(64) NOT NULL,
	"query" text NOT NULL,
	"results" jsonb NOT NULL,
	"embedding" jsonb NOT NULL,
	"metadata" jsonb,
	"created_at" timestamp DEFAULT now(),
	"expires_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "user_embeddings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"content_type" varchar(50) NOT NULL,
	"content" text NOT NULL,
	"embedding" jsonb NOT NULL,
	"metadata" jsonb,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "vector_similarity" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"source_id" uuid NOT NULL,
	"target_id" uuid NOT NULL,
	"source_type" varchar(50) NOT NULL,
	"target_type" varchar(50) NOT NULL,
	"similarity" real NOT NULL,
	"metadata" jsonb,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
ALTER TABLE "account" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "case_law_links" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "content_embeddings" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "export_history" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "law_paragraphs" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "report_templates" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "verificationToken" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP TABLE "account" CASCADE;--> statement-breakpoint
DROP TABLE "case_law_links" CASCADE;--> statement-breakpoint
DROP TABLE "content_embeddings" CASCADE;--> statement-breakpoint
DROP TABLE "export_history" CASCADE;--> statement-breakpoint
DROP TABLE "law_paragraphs" CASCADE;--> statement-breakpoint
DROP TABLE "report_templates" CASCADE;--> statement-breakpoint
DROP TABLE "verificationToken" CASCADE;--> statement-breakpoint
ALTER TABLE "ai_analyses" DROP CONSTRAINT "ai_analyses_report_id_reports_id_fk";
--> statement-breakpoint
ALTER TABLE "ai_analyses" DROP CONSTRAINT "ai_analyses_citation_id_citation_points_id_fk";
--> statement-breakpoint
ALTER TABLE "ai_analyses" DROP CONSTRAINT "ai_analyses_case_id_cases_id_fk";
--> statement-breakpoint
ALTER TABLE "ai_analyses" ALTER COLUMN "tokens" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "ai_analyses" ALTER COLUMN "processing_time" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "ai_analyses" ALTER COLUMN "confidence" SET DATA TYPE numeric(5, 4);--> statement-breakpoint
ALTER TABLE "ai_analyses" ALTER COLUMN "confidence" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "ai_analyses" ALTER COLUMN "created_by" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "canvas_states" ALTER COLUMN "id" SET DATA TYPE serial;--> statement-breakpoint
ALTER TABLE "canvas_states" ALTER COLUMN "id" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "canvas_states" ALTER COLUMN "report_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "canvas_states" ALTER COLUMN "canvas_data" SET DATA TYPE text;--> statement-breakpoint
ALTER TABLE "canvas_states" ALTER COLUMN "metadata" SET DATA TYPE text;--> statement-breakpoint
ALTER TABLE "canvas_states" ALTER COLUMN "metadata" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "canvas_states" ALTER COLUMN "metadata" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "canvas_states" ALTER COLUMN "created_by" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "cases" ALTER COLUMN "case_number" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "citation_points" ALTER COLUMN "created_by" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "evidence" ALTER COLUMN "file_type" SET DATA TYPE varchar(50);--> statement-breakpoint
ALTER TABLE "reports" ALTER COLUMN "content" SET DATA TYPE jsonb;--> statement-breakpoint
ALTER TABLE "reports" ALTER COLUMN "case_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "reports" ALTER COLUMN "status" SET DEFAULT 'pending';--> statement-breakpoint
ALTER TABLE "reports" ALTER COLUMN "created_by" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "ai_analyses" ADD COLUMN "entity_type" varchar(20) NOT NULL;--> statement-breakpoint
ALTER TABLE "ai_analyses" ADD COLUMN "entity_id" uuid NOT NULL;--> statement-breakpoint
ALTER TABLE "ai_analyses" ADD COLUMN "prompt" text;--> statement-breakpoint
ALTER TABLE "ai_analyses" ADD COLUMN "response" jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "ai_analyses" ADD COLUMN "version" varchar(20);--> statement-breakpoint
ALTER TABLE "ai_analyses" ADD COLUMN "cost" numeric(8, 6);--> statement-breakpoint
ALTER TABLE "canvas_states" ADD COLUMN "case_id" uuid NOT NULL;--> statement-breakpoint
ALTER TABLE "canvas_states" ADD COLUMN "image_preview" text;--> statement-breakpoint
ALTER TABLE "cases" ADD COLUMN "title_embedding" vector(1536);--> statement-breakpoint
ALTER TABLE "cases" ADD COLUMN "description_embedding" vector(1536);--> statement-breakpoint
ALTER TABLE "cases" ADD COLUMN "full_text_embedding" vector(1536);--> statement-breakpoint
ALTER TABLE "criminals" ADD COLUMN "place_of_birth" varchar(200);--> statement-breakpoint
ALTER TABLE "criminals" ADD COLUMN "ssn" varchar(11);--> statement-breakpoint
ALTER TABLE "criminals" ADD COLUMN "drivers_license" varchar(50);--> statement-breakpoint
ALTER TABLE "criminals" ADD COLUMN "fingerprints" jsonb DEFAULT '{}'::jsonb;--> statement-breakpoint
ALTER TABLE "evidence" ADD COLUMN "evidence_type" varchar(50) NOT NULL;--> statement-breakpoint
ALTER TABLE "evidence" ADD COLUMN "sub_type" varchar(50);--> statement-breakpoint
ALTER TABLE "evidence" ADD COLUMN "mime_type" varchar(100);--> statement-breakpoint
ALTER TABLE "evidence" ADD COLUMN "hash" varchar(128);--> statement-breakpoint
ALTER TABLE "evidence" ADD COLUMN "chain_of_custody" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "evidence" ADD COLUMN "collected_at" timestamp;--> statement-breakpoint
ALTER TABLE "evidence" ADD COLUMN "collected_by" varchar(255);--> statement-breakpoint
ALTER TABLE "evidence" ADD COLUMN "location" text;--> statement-breakpoint
ALTER TABLE "evidence" ADD COLUMN "lab_analysis" jsonb DEFAULT '{}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "evidence" ADD COLUMN "ai_analysis" jsonb DEFAULT '{}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "evidence" ADD COLUMN "ai_tags" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "evidence" ADD COLUMN "is_admissible" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "evidence" ADD COLUMN "confidentiality_level" varchar(20) DEFAULT 'standard' NOT NULL;--> statement-breakpoint
ALTER TABLE "evidence" ADD COLUMN "canvas_position" jsonb DEFAULT '{}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "evidence" ADD COLUMN "pos_x" numeric(10, 2) DEFAULT '100' NOT NULL;--> statement-breakpoint
ALTER TABLE "evidence" ADD COLUMN "pos_y" numeric(10, 2) DEFAULT '100' NOT NULL;--> statement-breakpoint
ALTER TABLE "evidence" ADD COLUMN "width" numeric(10, 2) DEFAULT '400' NOT NULL;--> statement-breakpoint
ALTER TABLE "evidence" ADD COLUMN "height" numeric(10, 2) DEFAULT '300' NOT NULL;--> statement-breakpoint
ALTER TABLE "evidence" ADD COLUMN "z_index" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "evidence" ADD COLUMN "canvas_state" jsonb DEFAULT '{}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "evidence" ADD COLUMN "title_embedding" vector(1536);--> statement-breakpoint
ALTER TABLE "evidence" ADD COLUMN "description_embedding" vector(1536);--> statement-breakpoint
ALTER TABLE "evidence" ADD COLUMN "content_embedding" vector(1536);--> statement-breakpoint
ALTER TABLE "evidence" ADD COLUMN "summary_embedding" vector(1536);--> statement-breakpoint
ALTER TABLE "reports" ADD COLUMN "type" varchar(50) NOT NULL;--> statement-breakpoint
ALTER TABLE "reports" ADD COLUMN "entity_type" varchar(20);--> statement-breakpoint
ALTER TABLE "reports" ADD COLUMN "entity_id" uuid;--> statement-breakpoint
ALTER TABLE "reports" ADD COLUMN "template" varchar(50);--> statement-breakpoint
ALTER TABLE "reports" ADD COLUMN "format" varchar(10) DEFAULT 'pdf' NOT NULL;--> statement-breakpoint
ALTER TABLE "reports" ADD COLUMN "pos_x" numeric(10, 2) DEFAULT '50' NOT NULL;--> statement-breakpoint
ALTER TABLE "reports" ADD COLUMN "pos_y" numeric(10, 2) DEFAULT '50' NOT NULL;--> statement-breakpoint
ALTER TABLE "reports" ADD COLUMN "width" numeric(10, 2) DEFAULT '650' NOT NULL;--> statement-breakpoint
ALTER TABLE "reports" ADD COLUMN "height" numeric(10, 2) DEFAULT '450' NOT NULL;--> statement-breakpoint
ALTER TABLE "reports" ADD COLUMN "z_index" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "reports" ADD COLUMN "version" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "reports" ADD COLUMN "is_dirty" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "reports" ADD COLUMN "last_modified_by" uuid;--> statement-breakpoint
ALTER TABLE "reports" ADD COLUMN "file_url" text;--> statement-breakpoint
ALTER TABLE "reports" ADD COLUMN "parameters" jsonb DEFAULT '{}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "reports" ADD COLUMN "generated_by" uuid;--> statement-breakpoint
ALTER TABLE "reports" ADD COLUMN "generated_at" timestamp DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "reports" ADD COLUMN "expires_at" timestamp;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "settings" jsonb DEFAULT '{"theme":"system","notifications":true,"language":"en","timezone":"UTC","preferences":{"defaultDocumentType":"brief","dateFormat":"US"}}'::jsonb;--> statement-breakpoint
ALTER TABLE "attachment_verifications" ADD CONSTRAINT "attachment_verifications_verified_by_users_id_fk" FOREIGN KEY ("verified_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "canvas_layouts" ADD CONSTRAINT "canvas_layouts_case_id_cases_id_fk" FOREIGN KEY ("case_id") REFERENCES "public"."cases"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "canvas_layouts" ADD CONSTRAINT "canvas_layouts_theme_id_themes_id_fk" FOREIGN KEY ("theme_id") REFERENCES "public"."themes"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "canvas_layouts" ADD CONSTRAINT "canvas_layouts_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "case_criminals" ADD CONSTRAINT "case_criminals_case_id_cases_id_fk" FOREIGN KEY ("case_id") REFERENCES "public"."cases"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "case_criminals" ADD CONSTRAINT "case_criminals_criminal_id_criminals_id_fk" FOREIGN KEY ("criminal_id") REFERENCES "public"."criminals"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "case_criminals" ADD CONSTRAINT "case_criminals_added_by_users_id_fk" FOREIGN KEY ("added_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hash_verifications" ADD CONSTRAINT "hash_verifications_evidence_id_evidence_id_fk" FOREIGN KEY ("evidence_id") REFERENCES "public"."evidence"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hash_verifications" ADD CONSTRAINT "hash_verifications_verified_by_users_id_fk" FOREIGN KEY ("verified_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "layout_components" ADD CONSTRAINT "layout_components_theme_id_themes_id_fk" FOREIGN KEY ("theme_id") REFERENCES "public"."themes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "layout_components" ADD CONSTRAINT "layout_components_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "legal_documents" ADD CONSTRAINT "legal_documents_case_id_cases_id_fk" FOREIGN KEY ("case_id") REFERENCES "public"."cases"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "legal_documents" ADD CONSTRAINT "legal_documents_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notes" ADD CONSTRAINT "notes_case_id_cases_id_fk" FOREIGN KEY ("case_id") REFERENCES "public"."cases"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notes" ADD CONSTRAINT "notes_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "persons_of_interest" ADD CONSTRAINT "persons_of_interest_case_id_cases_id_fk" FOREIGN KEY ("case_id") REFERENCES "public"."cases"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "persons_of_interest" ADD CONSTRAINT "persons_of_interest_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "saved_citations" ADD CONSTRAINT "saved_citations_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "saved_citations" ADD CONSTRAINT "saved_citations_citation_point_id_citation_points_id_fk" FOREIGN KEY ("citation_point_id") REFERENCES "public"."citation_points"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "search_tags" ADD CONSTRAINT "search_tags_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "themes" ADD CONSTRAINT "themes_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_themes" ADD CONSTRAINT "user_themes_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_themes" ADD CONSTRAINT "user_themes_theme_id_themes_id_fk" FOREIGN KEY ("theme_id") REFERENCES "public"."themes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "legal_documents_title_embedding_idx" ON "legal_documents" USING hnsw ("title_embedding" vector_cosine_ops);--> statement-breakpoint
CREATE INDEX "legal_documents_content_embedding_idx" ON "legal_documents" USING hnsw ("content_embedding" vector_cosine_ops);--> statement-breakpoint
CREATE INDEX "legal_documents_case_id_idx" ON "legal_documents" USING btree ("case_id");--> statement-breakpoint
CREATE INDEX "legal_documents_user_id_idx" ON "legal_documents" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "legal_documents_type_idx" ON "legal_documents" USING btree ("document_type");--> statement-breakpoint
CREATE INDEX "legal_documents_status_idx" ON "legal_documents" USING btree ("status");--> statement-breakpoint
CREATE INDEX "notes_case_id_idx" ON "notes" USING btree ("case_id");--> statement-breakpoint
CREATE INDEX "notes_user_id_idx" ON "notes" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "notes_type_idx" ON "notes" USING btree ("note_type");--> statement-breakpoint
CREATE INDEX "notes_priority_idx" ON "notes" USING btree ("priority");--> statement-breakpoint
CREATE INDEX "notes_reminder_idx" ON "notes" USING btree ("reminder_at");--> statement-breakpoint
CREATE INDEX "saved_citations_user_id_idx" ON "saved_citations" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "saved_citations_category_idx" ON "saved_citations" USING btree ("category");--> statement-breakpoint
CREATE INDEX "saved_citations_favorite_idx" ON "saved_citations" USING btree ("is_favorite");--> statement-breakpoint
CREATE INDEX "saved_citations_usage_idx" ON "saved_citations" USING btree ("usage_count");--> statement-breakpoint
ALTER TABLE "canvas_states" ADD CONSTRAINT "canvas_states_case_id_cases_id_fk" FOREIGN KEY ("case_id") REFERENCES "public"."cases"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reports" ADD CONSTRAINT "reports_last_modified_by_users_id_fk" FOREIGN KEY ("last_modified_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reports" ADD CONSTRAINT "reports_generated_by_users_id_fk" FOREIGN KEY ("generated_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "cases_title_embedding_idx" ON "cases" USING hnsw ("title_embedding" vector_cosine_ops);--> statement-breakpoint
CREATE INDEX "cases_description_embedding_idx" ON "cases" USING hnsw ("description_embedding" vector_cosine_ops);--> statement-breakpoint
CREATE INDEX "cases_fulltext_embedding_idx" ON "cases" USING hnsw ("full_text_embedding" vector_cosine_ops);--> statement-breakpoint
CREATE INDEX "cases_status_idx" ON "cases" USING btree ("status");--> statement-breakpoint
CREATE INDEX "cases_priority_idx" ON "cases" USING btree ("priority");--> statement-breakpoint
CREATE INDEX "cases_category_idx" ON "cases" USING btree ("category");--> statement-breakpoint
CREATE INDEX "cases_case_number_idx" ON "cases" USING btree ("case_number");--> statement-breakpoint
CREATE INDEX "evidence_title_embedding_idx" ON "evidence" USING hnsw ("title_embedding" vector_cosine_ops);--> statement-breakpoint
CREATE INDEX "evidence_content_embedding_idx" ON "evidence" USING hnsw ("content_embedding" vector_cosine_ops);--> statement-breakpoint
CREATE INDEX "evidence_summary_embedding_idx" ON "evidence" USING hnsw ("summary_embedding" vector_cosine_ops);--> statement-breakpoint
CREATE INDEX "evidence_case_id_idx" ON "evidence" USING btree ("case_id");--> statement-breakpoint
CREATE INDEX "evidence_type_idx" ON "evidence" USING btree ("evidence_type");--> statement-breakpoint
CREATE INDEX "evidence_admissible_idx" ON "evidence" USING btree ("is_admissible");--> statement-breakpoint
ALTER TABLE "ai_analyses" DROP COLUMN "report_id";--> statement-breakpoint
ALTER TABLE "ai_analyses" DROP COLUMN "citation_id";--> statement-breakpoint
ALTER TABLE "ai_analyses" DROP COLUMN "case_id";--> statement-breakpoint
ALTER TABLE "ai_analyses" DROP COLUMN "input_data";--> statement-breakpoint
ALTER TABLE "ai_analyses" DROP COLUMN "result";--> statement-breakpoint
ALTER TABLE "ai_analyses" DROP COLUMN "status";--> statement-breakpoint
ALTER TABLE "ai_analyses" DROP COLUMN "error_message";--> statement-breakpoint
ALTER TABLE "cases" DROP COLUMN "summary";--> statement-breakpoint
ALTER TABLE "cases" DROP COLUMN "date_opened";--> statement-breakpoint
ALTER TABLE "cases" DROP COLUMN "verdict";--> statement-breakpoint
ALTER TABLE "cases" DROP COLUMN "court_dates";--> statement-breakpoint
ALTER TABLE "cases" DROP COLUMN "linked_criminals";--> statement-breakpoint
ALTER TABLE "cases" DROP COLUMN "linked_crimes";--> statement-breakpoint
ALTER TABLE "cases" DROP COLUMN "notes";--> statement-breakpoint
ALTER TABLE "criminals" DROP COLUMN "priors";--> statement-breakpoint
ALTER TABLE "criminals" DROP COLUMN "convictions";--> statement-breakpoint
ALTER TABLE "criminals" DROP COLUMN "ai_analysis";--> statement-breakpoint
ALTER TABLE "criminals" DROP COLUMN "name";--> statement-breakpoint
ALTER TABLE "criminals" DROP COLUMN "conviction_status";--> statement-breakpoint
ALTER TABLE "criminals" DROP COLUMN "sentence_length";--> statement-breakpoint
ALTER TABLE "criminals" DROP COLUMN "conviction_date";--> statement-breakpoint
ALTER TABLE "criminals" DROP COLUMN "escape_attempts";--> statement-breakpoint
ALTER TABLE "criminals" DROP COLUMN "gang_affiliations";--> statement-breakpoint
ALTER TABLE "reports" DROP COLUMN "created_at";--> statement-breakpoint
ALTER TABLE "sessions" DROP COLUMN "created_at";--> statement-breakpoint
ALTER TABLE "statutes" DROP COLUMN "name";--> statement-breakpoint
ALTER TABLE "statutes" DROP COLUMN "section_number";--> statement-breakpoint
ALTER TABLE "users" DROP COLUMN "title";--> statement-breakpoint
ALTER TABLE "users" DROP COLUMN "department";--> statement-breakpoint
ALTER TABLE "users" DROP COLUMN "phone";--> statement-breakpoint
ALTER TABLE "users" DROP COLUMN "office_address";--> statement-breakpoint
ALTER TABLE "users" DROP COLUMN "avatar";--> statement-breakpoint
ALTER TABLE "users" DROP COLUMN "bio";--> statement-breakpoint
ALTER TABLE "users" DROP COLUMN "specializations";--> statement-breakpoint
ALTER TABLE "users" DROP COLUMN "username";--> statement-breakpoint
ALTER TABLE "users" DROP COLUMN "image";--> statement-breakpoint
ALTER TABLE "users" DROP COLUMN "provider";--> statement-breakpoint
ALTER TABLE "users" DROP COLUMN "profile";--> statement-breakpoint
ALTER TABLE "cases" ADD CONSTRAINT "cases_case_number_unique" UNIQUE("case_number");