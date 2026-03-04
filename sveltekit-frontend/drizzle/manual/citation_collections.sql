-- Manual migration for citation collections
-- Created: 2026-03-03
-- Purpose: Add citation_collections and collection_citations tables
-- Skips: Existing enums and tables from previous migrations

-- Create citation_collections table
CREATE TABLE IF NOT EXISTS "citation_collections" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"name" varchar(255) NOT NULL,
	"description" text,
	"color" varchar(7) DEFAULT '#8B2332',
	"is_public" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

-- Create collection_citations junction table
CREATE TABLE IF NOT EXISTS "collection_citations" (
	"collection_id" uuid NOT NULL,
	"citation_id" uuid NOT NULL,
	"added_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "collection_citations_collection_id_citation_id_pk" PRIMARY KEY("collection_id","citation_id")
);

-- Add foreign keys
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'citation_collections_user_id_users_id_fk'
  ) THEN
    ALTER TABLE "citation_collections" ADD CONSTRAINT "citation_collections_user_id_users_id_fk"
      FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'collection_citations_collection_id_citation_collections_id_fk'
  ) THEN
    ALTER TABLE "collection_citations" ADD CONSTRAINT "collection_citations_collection_id_citation_collections_id_fk"
      FOREIGN KEY ("collection_id") REFERENCES "public"."citation_collections"("id") ON DELETE cascade ON UPDATE no action;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'collection_citations_citation_id_citations_id_fk'
  ) THEN
    ALTER TABLE "collection_citations" ADD CONSTRAINT "collection_citations_citation_id_citations_id_fk"
      FOREIGN KEY ("citation_id") REFERENCES "public"."citations"("id") ON DELETE cascade ON UPDATE no action;
  END IF;
END $$;

-- Create indexes
CREATE INDEX IF NOT EXISTS "citation_collections_user_id_idx" ON "citation_collections" USING btree ("user_id");
CREATE INDEX IF NOT EXISTS "collection_citations_collection_id_idx" ON "collection_citations" USING btree ("collection_id");
CREATE INDEX IF NOT EXISTS "collection_citations_citation_id_idx" ON "collection_citations" USING btree ("citation_id");
