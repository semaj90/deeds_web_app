CREATE TABLE "kanban_tasks" (
	"task_id" text PRIMARY KEY NOT NULL,
	"feature_id" text NOT NULL,
	"feature_label" text NOT NULL,
	"source_refs" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"lane" text DEFAULT 'todo' NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"validation_command" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "agent_traces" (
	"trace_id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"task_id" text NOT NULL,
	"prompt" text NOT NULL,
	"retrieved_packets" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"tool_calls" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"commands" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"outcome" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DROP INDEX "idx_retrieval_telemetry_packet_key";--> statement-breakpoint
DROP INDEX "idx_retrieval_telemetry_packet_keys_gin";--> statement-breakpoint
DROP INDEX "idx_retrieval_telemetry_feature_id";--> statement-breakpoint
ALTER TABLE "retrieval_telemetry" ALTER COLUMN "id" SET DATA TYPE bigserial;--> statement-breakpoint
ALTER TABLE "retrieval_telemetry" ALTER COLUMN "id" DROP IDENTITY;--> statement-breakpoint
ALTER TABLE "retrieval_telemetry" ALTER COLUMN "fusion_score" SET DATA TYPE double precision;--> statement-breakpoint
ALTER TABLE "retrieval_telemetry" ALTER COLUMN "retrieval_strategy" SET DEFAULT 'fusion';--> statement-breakpoint
ALTER TABLE "concept_records" ADD COLUMN "label" text;--> statement-breakpoint
ALTER TABLE "concept_records" ADD COLUMN "evidence_cards" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "concept_records" ADD COLUMN "packet_keys" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "concept_records" ADD COLUMN "success_count" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "concept_records" ADD COLUMN "failure_count" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
CREATE INDEX "idx_retrieval_telemetry_selected_packet_keys_gin" ON "retrieval_telemetry" USING gin ("selected_packet_keys");