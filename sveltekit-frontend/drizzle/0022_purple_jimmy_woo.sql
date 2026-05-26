CREATE TABLE "documents_atlas_entries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"relative_path" text NOT NULL,
	"title" text NOT NULL,
	"absolute_path" text NOT NULL,
	"file_url" text NOT NULL,
	"size" integer NOT NULL,
	"lines" integer NOT NULL,
	"last_modified" timestamp with time zone NOT NULL,
	"headings" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"category" text NOT NULL,
	"tags" text[] DEFAULT '{}'::text[] NOT NULL,
	"summary" text,
	"languages" text[] DEFAULT '{}'::text[] NOT NULL,
	"ast_relations" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"rg_groups" text[] DEFAULT '{}'::text[] NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "documents_atlas_entries_relative_path_unique" UNIQUE("relative_path")
);
--> statement-breakpoint
CREATE TABLE "feature_index_entries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"file_path" text NOT NULL,
	"protocols" text[] DEFAULT '{}'::text[] NOT NULL,
	"nested_urls" text[] DEFAULT '{}'::text[] NOT NULL,
	"library_functions" text[] DEFAULT '{}'::text[] NOT NULL,
	"feature_subgraphs" text[] DEFAULT '{}'::text[] NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "feature_index_entries_file_path_unique" UNIQUE("file_path")
);
--> statement-breakpoint
CREATE TABLE "retrieval_cache_traces" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"query" text NOT NULL,
	"cache_hit" boolean NOT NULL,
	"cache_key" text,
	"trace_details" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
