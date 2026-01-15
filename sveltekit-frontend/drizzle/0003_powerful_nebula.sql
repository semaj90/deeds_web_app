ALTER TABLE "documents" ALTER COLUMN "title" SET DATA TYPE varchar(255);--> statement-breakpoint
ALTER TABLE "documents" ALTER COLUMN "file_size" SET DATA TYPE integer;--> statement-breakpoint
ALTER TABLE "documents" ALTER COLUMN "file_size" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "documents" ALTER COLUMN "file_size" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "documents" ALTER COLUMN "status" SET DATA TYPE varchar(50);--> statement-breakpoint
ALTER TABLE "documents" ALTER COLUMN "status" SET DEFAULT 'pending';--> statement-breakpoint
ALTER TABLE "documents" ALTER COLUMN "status" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "documents" ALTER COLUMN "created_at" SET DATA TYPE timestamp with time zone;--> statement-breakpoint
ALTER TABLE "documents" ALTER COLUMN "created_at" SET DEFAULT now();--> statement-breakpoint
ALTER TABLE "documents" ALTER COLUMN "updated_at" SET DATA TYPE timestamp with time zone;--> statement-breakpoint
ALTER TABLE "documents" ALTER COLUMN "updated_at" SET DEFAULT now();--> statement-breakpoint
ALTER TABLE "evidence" ALTER COLUMN "file_type" SET DATA TYPE varchar(100);--> statement-breakpoint
ALTER TABLE "evidence" ALTER COLUMN "updated_at" SET DATA TYPE timestamp with time zone;--> statement-breakpoint
ALTER TABLE "evidence" ALTER COLUMN "updated_at" SET DEFAULT now();--> statement-breakpoint
ALTER TABLE "documents" ADD COLUMN "description" text;--> statement-breakpoint
ALTER TABLE "documents" ADD COLUMN "file_path" varchar(500);--> statement-breakpoint
ALTER TABLE "documents" ADD COLUMN "file_type" varchar(100);--> statement-breakpoint
ALTER TABLE "documents" ADD COLUMN "summary" text;--> statement-breakpoint
ALTER TABLE "documents" ADD COLUMN "embedding_id" varchar(255);--> statement-breakpoint
ALTER TABLE "documents" ADD COLUMN "metadata" jsonb;--> statement-breakpoint
ALTER TABLE "evidence" ADD COLUMN "file_path" varchar(500);--> statement-breakpoint
ALTER TABLE "evidence" ADD COLUMN "file_size" integer;--> statement-breakpoint
ALTER TABLE "evidence" ADD COLUMN "hash" varchar(255);--> statement-breakpoint
ALTER TABLE "evidence" ADD COLUMN "source" varchar(255);--> statement-breakpoint
ALTER TABLE "evidence" ADD COLUMN "date_obtained" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "evidence" ADD COLUMN "chain_of_custody" jsonb;--> statement-breakpoint
ALTER TABLE "evidence" ADD COLUMN "metadata" jsonb;--> statement-breakpoint
ALTER TABLE "evidence" ADD COLUMN "created_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "documents" DROP COLUMN "s3_key";--> statement-breakpoint
ALTER TABLE "documents" DROP COLUMN "s3_bucket";--> statement-breakpoint
ALTER TABLE "documents" DROP COLUMN "original_name";--> statement-breakpoint
ALTER TABLE "documents" DROP COLUMN "mime_type";--> statement-breakpoint
ALTER TABLE "documents" DROP COLUMN "user_id";--> statement-breakpoint
ALTER TABLE "evidence" DROP COLUMN "criminal_id";--> statement-breakpoint
ALTER TABLE "evidence" DROP COLUMN "evidence_type";--> statement-breakpoint
ALTER TABLE "evidence" DROP COLUMN "sub_type";--> statement-breakpoint
ALTER TABLE "evidence" DROP COLUMN "file_url";--> statement-breakpoint
ALTER TABLE "evidence" DROP COLUMN "file_name";--> statement-breakpoint
ALTER TABLE "evidence" DROP COLUMN "canvas_position";--> statement-breakpoint
ALTER TABLE "evidence" DROP COLUMN "uploaded_by";--> statement-breakpoint
ALTER TABLE "evidence" DROP COLUMN "uploaded_at";