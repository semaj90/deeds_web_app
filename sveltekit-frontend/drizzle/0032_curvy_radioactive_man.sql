CREATE TABLE "concept_records" (
	"concept_id" text PRIMARY KEY NOT NULL,
	"evidence" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"feature_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"som_clusters" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"retrieval_count" integer DEFAULT 0 NOT NULL,
	"repair_success" double precision DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
