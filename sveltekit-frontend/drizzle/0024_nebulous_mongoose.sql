CREATE TABLE "evidence_board_edges" (
	"id" text PRIMARY KEY NOT NULL,
	"board_id" text,
	"from_node_id" text NOT NULL,
	"to_node_id" text NOT NULL,
	"relation_type" text NOT NULL,
	"citation_id" uuid,
	"annotation_id" text,
	"confidence" real DEFAULT 0.5 NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "saved_citation_annotations" (
	"id" text PRIMARY KEY NOT NULL,
	"citation_id" uuid NOT NULL,
	"user_id" text,
	"annotation_type" text DEFAULT 'comment' NOT NULL,
	"body" text NOT NULL,
	"logic" text DEFAULT 'add_comment_under_saved_citation' NOT NULL,
	"source_refs" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"chunk_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"llm_output" text,
	"token_map" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "agent_progress_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"run_id" text NOT NULL,
	"feature_key" text NOT NULL,
	"query" text NOT NULL,
	"attempted_fix" text,
	"result" text NOT NULL,
	"error_signature" text,
	"commands_run" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"files_changed" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"retry_query" text,
	"created_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "feature_registry" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"feature_key" text NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"status" text NOT NULL,
	"source_refs" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"code_refs" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"test_refs" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"cluster_id" integer,
	"trust_tier" text,
	"last_verified_at" timestamp with time zone DEFAULT now(),
	CONSTRAINT "feature_registry_feature_key_unique" UNIQUE("feature_key")
);
--> statement-breakpoint
CREATE TABLE "feature_tasks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"feature_key" text NOT NULL,
	"checkbox_text" text NOT NULL,
	"source_ref" text NOT NULL,
	"status" text NOT NULL,
	"priority" text,
	"suggested_command" text,
	"created_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
ALTER TABLE "evidence_board_edges" ADD CONSTRAINT "evidence_board_edges_citation_id_saved_citations_id_fk" FOREIGN KEY ("citation_id") REFERENCES "public"."saved_citations"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "evidence_board_edges" ADD CONSTRAINT "evidence_board_edges_annotation_id_saved_citation_annotations_id_fk" FOREIGN KEY ("annotation_id") REFERENCES "public"."saved_citation_annotations"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "saved_citation_annotations" ADD CONSTRAINT "saved_citation_annotations_citation_id_saved_citations_id_fk" FOREIGN KEY ("citation_id") REFERENCES "public"."saved_citations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "evidence_board_edges_citation_idx" ON "evidence_board_edges" USING btree ("citation_id");--> statement-breakpoint
CREATE INDEX "evidence_board_edges_annotation_idx" ON "evidence_board_edges" USING btree ("annotation_id");--> statement-breakpoint
CREATE INDEX "evidence_board_edges_board_idx" ON "evidence_board_edges" USING btree ("board_id");--> statement-breakpoint
CREATE INDEX "saved_citation_annotations_citation_idx" ON "saved_citation_annotations" USING btree ("citation_id");--> statement-breakpoint
CREATE INDEX "saved_citation_annotations_user_idx" ON "saved_citation_annotations" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "saved_citation_annotations_created_idx" ON "saved_citation_annotations" USING btree ("created_at");