CREATE TABLE "admin_model_weights" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"component" text NOT NULL,
	"version" text NOT NULL,
	"sha256" text NOT NULL,
	"status" text NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "admin_model_weights_comp_ver_uq" UNIQUE("component","version")
);
--> statement-breakpoint
CREATE TABLE "uploaded_files" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"original_name" text NOT NULL,
	"object_key" text NOT NULL,
	"bucket" text NOT NULL,
	"mime_type" text,
	"size_bytes" integer NOT NULL,
	"status" text DEFAULT 'uploaded' NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "uploaded_files_object_key_unique" UNIQUE("object_key")
);
