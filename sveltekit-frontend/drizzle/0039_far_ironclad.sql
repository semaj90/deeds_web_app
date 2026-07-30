CREATE TABLE "atlas_fact_arguments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"fact_id" uuid NOT NULL,
	"argument_index" integer,
	"argument_name" text,
	"argument_value" text,
	"argument_type" text
);
--> statement-breakpoint
CREATE TABLE "atlas_facts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"packet_key" text NOT NULL,
	"source_ref" text NOT NULL,
	"fact_text" text NOT NULL,
	"confidence" real,
	"reasoning_trace" text,
	"extracted_at" timestamp with time zone DEFAULT now(),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "atlas_packets" ADD COLUMN "workspace_revision" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "atlas_packets" ADD COLUMN "representation_revision" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "atlas_packets" ADD COLUMN "embedding_digest" text;--> statement-breakpoint
ALTER TABLE "atlas_fact_arguments" ADD CONSTRAINT "atlas_fact_arguments_fact_id_atlas_facts_id_fk" FOREIGN KEY ("fact_id") REFERENCES "public"."atlas_facts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_atlas_fact_arguments_fact_id" ON "atlas_fact_arguments" USING btree ("fact_id");--> statement-breakpoint
CREATE INDEX "idx_atlas_fact_arguments_name" ON "atlas_fact_arguments" USING btree ("argument_name");--> statement-breakpoint
CREATE INDEX "idx_atlas_fact_arguments_type" ON "atlas_fact_arguments" USING btree ("argument_type");--> statement-breakpoint
CREATE INDEX "idx_atlas_facts_packet_key" ON "atlas_facts" USING btree ("packet_key");--> statement-breakpoint
CREATE INDEX "idx_atlas_facts_source_ref" ON "atlas_facts" USING btree ("source_ref");--> statement-breakpoint
CREATE INDEX "idx_atlas_facts_confidence" ON "atlas_facts" USING btree ("confidence");--> statement-breakpoint
CREATE INDEX "idx_atlas_facts_extracted_at" ON "atlas_facts" USING btree ("extracted_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "idx_atlas_packets_workspace_revision" ON "atlas_packets" USING btree ("workspace_revision");--> statement-breakpoint
CREATE INDEX "idx_atlas_packets_representation_revision" ON "atlas_packets" USING btree ("representation_revision");--> statement-breakpoint
CREATE INDEX "idx_atlas_packets_embedding_digest" ON "atlas_packets" USING btree ("embedding_digest");