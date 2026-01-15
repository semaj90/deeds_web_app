ALTER TABLE "documents" ADD COLUMN "s3_key" text;--> statement-breakpoint
ALTER TABLE "documents" ADD COLUMN "s3_bucket" text DEFAULT 'legal-documents';--> statement-breakpoint
ALTER TABLE "documents" ADD COLUMN "original_name" text;--> statement-breakpoint
ALTER TABLE "documents" ADD COLUMN "mime_type" text;--> statement-breakpoint
ALTER TABLE "documents" ADD COLUMN "user_id" uuid;--> statement-breakpoint
ALTER TABLE "evidence" ADD COLUMN "criminal_id" uuid;--> statement-breakpoint
ALTER TABLE "evidence" ADD COLUMN "evidence_type" "evidence_type";--> statement-breakpoint
ALTER TABLE "evidence" ADD COLUMN "sub_type" varchar(50);--> statement-breakpoint
ALTER TABLE "evidence" ADD COLUMN "file_url" text;--> statement-breakpoint
ALTER TABLE "evidence" ADD COLUMN "file_name" varchar(255);--> statement-breakpoint
ALTER TABLE "evidence" ADD COLUMN "canvas_position" jsonb DEFAULT '{}'::jsonb;--> statement-breakpoint
ALTER TABLE "evidence" ADD COLUMN "uploaded_by" uuid;--> statement-breakpoint
ALTER TABLE "evidence" ADD COLUMN "uploaded_at" timestamp;