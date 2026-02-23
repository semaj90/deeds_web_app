CREATE TABLE IF NOT EXISTS "analysis_jobs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"evidence_id" uuid,
	"job_type" varchar(100) NOT NULL,
	"status" varchar(50) DEFAULT 'pending' NOT NULL,
	"result" jsonb,
	"error" text,
	"started_at" timestamp,
	"completed_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "case_timeline" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"case_id" uuid NOT NULL,
	"evidence_id" uuid,
	"event_type" varchar(100) NOT NULL,
	"event_date" timestamp NOT NULL,
	"description" text,
	"metadata" jsonb DEFAULT '{}'::jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "cases" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"case_number" varchar(255) NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"status" varchar(50) DEFAULT 'open' NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "cases_case_number_unique" UNIQUE("case_number")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "embeddings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"evidence_id" uuid NOT NULL,
	"vector" vector(768) NOT NULL,
	"model" varchar(255) NOT NULL,
	"chunk_index" integer DEFAULT 0,
	"text_snippet" text,
	"metadata" jsonb DEFAULT '{}'::jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "evidences" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"case_id" uuid,
	"file_name" varchar(512) NOT NULL,
	"file_size" integer,
	"mime_type" varchar(255),
	"storage_path" text NOT NULL,
	"ocr_text" text,
	"summary" text,
	"entities" jsonb DEFAULT '[]'::jsonb,
	"forensic_flags" jsonb DEFAULT '[]'::jsonb,
	"status" varchar(50) DEFAULT 'pending' NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "analysis_jobs" ADD CONSTRAINT "analysis_jobs_evidence_id_evidences_id_fk" FOREIGN KEY ("evidence_id") REFERENCES "public"."evidences"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "case_timeline" ADD CONSTRAINT "case_timeline_case_id_cases_id_fk" FOREIGN KEY ("case_id") REFERENCES "public"."cases"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "case_timeline" ADD CONSTRAINT "case_timeline_evidence_id_evidences_id_fk" FOREIGN KEY ("evidence_id") REFERENCES "public"."evidences"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "embeddings" ADD CONSTRAINT "embeddings_evidence_id_evidences_id_fk" FOREIGN KEY ("evidence_id") REFERENCES "public"."evidences"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "evidences" ADD CONSTRAINT "evidences_case_id_cases_id_fk" FOREIGN KEY ("case_id") REFERENCES "public"."cases"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "job_evidence_id_idx" ON "analysis_jobs" USING btree ("evidence_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "job_status_idx" ON "analysis_jobs" USING btree ("status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "job_type_idx" ON "analysis_jobs" USING btree ("job_type");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "timeline_case_id_idx" ON "case_timeline" USING btree ("case_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "timeline_event_date_idx" ON "case_timeline" USING btree ("event_date");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "case_number_idx" ON "cases" USING btree ("case_number");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "status_idx" ON "cases" USING btree ("status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "embedding_evidence_id_idx" ON "embeddings" USING btree ("evidence_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "embedding_vector_idx" ON "embeddings" USING hnsw ("vector" vector_cosine_ops);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "evidence_case_id_idx" ON "evidences" USING btree ("case_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "evidence_status_idx" ON "evidences" USING btree ("status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "file_name_idx" ON "evidences" USING btree ("file_name");