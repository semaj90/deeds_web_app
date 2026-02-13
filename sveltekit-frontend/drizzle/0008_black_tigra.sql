CREATE TABLE "saved_citations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"case_id" text,
	"statute_code" text NOT NULL,
	"statute_title" text,
	"jurisdiction" text,
	"severity" text,
	"year" integer,
	"source_type" text DEFAULT 'manual',
	"highlighted_text" text,
	"notes" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
