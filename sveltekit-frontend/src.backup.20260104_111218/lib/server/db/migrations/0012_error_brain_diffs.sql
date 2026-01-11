CREATE TABLE IF NOT EXISTS "error_brain_diffs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"run_id" text NOT NULL,
	"file_path" text NOT NULL,
	"diff_text" text NOT NULL,
	"before_sha256" text NOT NULL,
	"after_sha256" text NOT NULL,
	"after_text" text NOT NULL,
	"context_lines" integer DEFAULT 3 NOT NULL,
	"confidence" real NOT NULL,
	"reason" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
