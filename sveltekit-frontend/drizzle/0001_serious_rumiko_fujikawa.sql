ALTER TYPE "public"."evidence_relationship_type" ADD VALUE 'corroborates';--> statement-breakpoint
ALTER TYPE "public"."evidence_relationship_type" ADD VALUE 'alibi';--> statement-breakpoint
ALTER TYPE "public"."evidence_relationship_type" ADD VALUE 'motive';--> statement-breakpoint
ALTER TYPE "public"."evidence_relationship_type" ADD VALUE 'opportunity';--> statement-breakpoint
ALTER TYPE "public"."evidence_relationship_type" ADD VALUE 'means';--> statement-breakpoint
ALTER TYPE "public"."evidence_relationship_type" ADD VALUE 'witness_statement';--> statement-breakpoint
ALTER TYPE "public"."evidence_relationship_type" ADD VALUE 'physical_evidence';--> statement-breakpoint
ALTER TYPE "public"."evidence_relationship_type" ADD VALUE 'digital_evidence';--> statement-breakpoint
ALTER TYPE "public"."evidence_relationship_type" ADD VALUE 'circumstantial';--> statement-breakpoint
ALTER TYPE "public"."evidence_relationship_type" ADD VALUE 'direct_evidence';--> statement-breakpoint
ALTER TYPE "public"."evidence_relationship_type" ADD VALUE 'hearsay';--> statement-breakpoint
ALTER TYPE "public"."evidence_relationship_type" ADD VALUE 'privileged';--> statement-breakpoint
ALTER TYPE "public"."evidence_relationship_type" ADD VALUE 'inadmissible';--> statement-breakpoint
ALTER TABLE "canvas_states" DROP CONSTRAINT "canvas_states_case_id_cases_id_fk";
--> statement-breakpoint
ALTER TABLE "chat_messages" ALTER COLUMN "user_id" SET DATA TYPE uuid;--> statement-breakpoint
ALTER TABLE "chat_metadata" ALTER COLUMN "user_id" SET DATA TYPE uuid;--> statement-breakpoint
ALTER TABLE "chat_metadata" ALTER COLUMN "case_id" SET DATA TYPE uuid;--> statement-breakpoint
ALTER TABLE "canvas_states" ALTER COLUMN "case_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "canvas_states" ALTER COLUMN "created_at" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "canvas_states" ALTER COLUMN "updated_at" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "user_embeddings" ALTER COLUMN "user_id" SET DATA TYPE integer;--> statement-breakpoint
ALTER TABLE "canvas_states" ADD COLUMN "user_id" integer;--> statement-breakpoint
ALTER TABLE "canvas_states" ADD COLUMN "state_data" jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "evidence_board_connections" ADD COLUMN "label" varchar(255);--> statement-breakpoint
ALTER TABLE "rag_messages" ADD COLUMN "content" text NOT NULL;--> statement-breakpoint
ALTER TABLE "workspace_citations" ADD COLUMN "citation_url" text;--> statement-breakpoint
ALTER TABLE "canvas_states" DROP COLUMN "name";--> statement-breakpoint
ALTER TABLE "canvas_states" DROP COLUMN "canvas_data";--> statement-breakpoint
ALTER TABLE "canvas_states" DROP COLUMN "version";--> statement-breakpoint
ALTER TABLE "canvas_states" DROP COLUMN "is_default";--> statement-breakpoint
ALTER TABLE "canvas_states" DROP COLUMN "created_by";--> statement-breakpoint
ALTER TABLE "evidence" DROP COLUMN "type";--> statement-breakpoint
ALTER TABLE "evidence" DROP COLUMN "evidence_number";--> statement-breakpoint
ALTER TABLE "evidence" DROP COLUMN "summary";--> statement-breakpoint
ALTER TABLE "evidence" DROP COLUMN "pos_x";--> statement-breakpoint
ALTER TABLE "evidence" DROP COLUMN "pos_y";--> statement-breakpoint
ALTER TABLE "evidence" DROP COLUMN "collected_at";--> statement-breakpoint
ALTER TABLE "evidence" DROP COLUMN "collected_by";--> statement-breakpoint
ALTER TABLE "evidence" DROP COLUMN "verified_at";--> statement-breakpoint
ALTER TABLE "evidence" DROP COLUMN "verified";--> statement-breakpoint
ALTER TABLE "evidence" DROP COLUMN "created_at";--> statement-breakpoint
ALTER TABLE "evidence" DROP COLUMN "file_size";--> statement-breakpoint
ALTER TABLE "evidence" DROP COLUMN "mime_type";--> statement-breakpoint
ALTER TABLE "evidence" DROP COLUMN "hash";--> statement-breakpoint
ALTER TABLE "evidence" DROP COLUMN "tags";--> statement-breakpoint
ALTER TABLE "evidence" DROP COLUMN "ai_analysis";--> statement-breakpoint
ALTER TABLE "evidence" DROP COLUMN "ai_tags";--> statement-breakpoint
ALTER TABLE "evidence" DROP COLUMN "ai_summary";--> statement-breakpoint
ALTER TABLE "saved_reports" DROP COLUMN "export_format";--> statement-breakpoint
ALTER TABLE "saved_reports" DROP COLUMN "version";--> statement-breakpoint
ALTER TABLE "saved_reports" DROP COLUMN "word_count";--> statement-breakpoint
ALTER TABLE "saved_reports" DROP COLUMN "tags";--> statement-breakpoint
ALTER TABLE "saved_reports" DROP COLUMN "metadata";--> statement-breakpoint
ALTER TABLE "saved_reports" DROP COLUMN "shared_with";--> statement-breakpoint
ALTER TABLE "saved_reports" DROP COLUMN "last_exported";--> statement-breakpoint
ALTER TABLE "saved_reports" DROP COLUMN "created_by";--> statement-breakpoint
ALTER TABLE "user_embeddings" DROP COLUMN "content";--> statement-breakpoint
ALTER TABLE "user_embeddings" DROP COLUMN "metadata";