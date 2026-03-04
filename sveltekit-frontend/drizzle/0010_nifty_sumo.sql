ALTER TYPE "public"."evidence_type" ADD VALUE 'documentary';--> statement-breakpoint
ALTER TYPE "public"."evidence_type" ADD VALUE 'testimonial';--> statement-breakpoint
ALTER TYPE "public"."evidence_type" ADD VALUE 'demonstrative';--> statement-breakpoint
ALTER TYPE "public"."evidence_type" ADD VALUE 'real';--> statement-breakpoint
ALTER TYPE "public"."evidence_type" ADD VALUE 'circumstantial';--> statement-breakpoint
ALTER TYPE "public"."evidence_type" ADD VALUE 'hearsay';--> statement-breakpoint
ALTER TYPE "public"."evidence_type" ADD VALUE 'expert';--> statement-breakpoint
ALTER TYPE "public"."evidence_type" ADD VALUE 'scientific';--> statement-breakpoint
CREATE TABLE "case_note_versions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"note_id" uuid NOT NULL,
	"title" varchar(255),
	"content" text NOT NULL,
	"version_number" integer NOT NULL,
	"edited_by" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "citation_collections" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"name" varchar(255) NOT NULL,
	"description" text,
	"color" varchar(7) DEFAULT '#8B2332',
	"is_public" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "collection_citations" (
	"collection_id" uuid NOT NULL,
	"citation_id" uuid NOT NULL,
	"added_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "collection_citations_collection_id_citation_id_pk" PRIMARY KEY("collection_id","citation_id")
);
--> statement-breakpoint
CREATE TABLE "document_topics" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"document_id" uuid NOT NULL,
	"topic_id" integer NOT NULL,
	"membership_probability" real NOT NULL,
	"centroid_distance" real NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "document_topics_document_id_topic_id_unique" UNIQUE("document_id","topic_id")
);
--> statement-breakpoint
CREATE TABLE "report_audit_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"report_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"action" varchar(50) NOT NULL,
	"changes" jsonb,
	"ip_address" varchar(45),
	"user_agent" text,
	"timestamp" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_interaction_history" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"recommendation_id" uuid,
	"document_id" uuid,
	"case_id" uuid,
	"interaction_type" varchar(50) NOT NULL,
	"duration_seconds" integer,
	"search_context" text,
	"topic_preferences" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "case_note_versions" ADD CONSTRAINT "case_note_versions_note_id_case_notes_id_fk" FOREIGN KEY ("note_id") REFERENCES "public"."case_notes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "case_note_versions" ADD CONSTRAINT "case_note_versions_edited_by_users_id_fk" FOREIGN KEY ("edited_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "citation_collections" ADD CONSTRAINT "citation_collections_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "collection_citations" ADD CONSTRAINT "collection_citations_collection_id_citation_collections_id_fk" FOREIGN KEY ("collection_id") REFERENCES "public"."citation_collections"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "collection_citations" ADD CONSTRAINT "collection_citations_citation_id_citations_id_fk" FOREIGN KEY ("citation_id") REFERENCES "public"."citations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "report_audit_log" ADD CONSTRAINT "report_audit_log_report_id_reports_id_fk" FOREIGN KEY ("report_id") REFERENCES "public"."reports"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "report_audit_log" ADD CONSTRAINT "report_audit_log_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "case_note_versions_note_id_idx" ON "case_note_versions" USING btree ("note_id");--> statement-breakpoint
CREATE INDEX "case_note_versions_version_idx" ON "case_note_versions" USING btree ("note_id","version_number");--> statement-breakpoint
CREATE INDEX "citation_collections_user_id_idx" ON "citation_collections" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "collection_citations_collection_id_idx" ON "collection_citations" USING btree ("collection_id");--> statement-breakpoint
CREATE INDEX "collection_citations_citation_id_idx" ON "collection_citations" USING btree ("citation_id");--> statement-breakpoint
CREATE INDEX "document_topics_document_id_idx" ON "document_topics" USING btree ("document_id");--> statement-breakpoint
CREATE INDEX "document_topics_topic_id_idx" ON "document_topics" USING btree ("topic_id");--> statement-breakpoint
CREATE INDEX "report_audit_log_report_id_idx" ON "report_audit_log" USING btree ("report_id");--> statement-breakpoint
CREATE INDEX "report_audit_log_user_id_idx" ON "report_audit_log" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "report_audit_log_timestamp_idx" ON "report_audit_log" USING btree ("timestamp");--> statement-breakpoint
CREATE INDEX "user_interaction_history_user_id_idx" ON "user_interaction_history" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "user_interaction_history_document_id_idx" ON "user_interaction_history" USING btree ("document_id");--> statement-breakpoint
CREATE INDEX "user_interaction_history_case_id_idx" ON "user_interaction_history" USING btree ("case_id");--> statement-breakpoint
CREATE INDEX "user_interaction_history_created_at_idx" ON "user_interaction_history" USING btree ("created_at");