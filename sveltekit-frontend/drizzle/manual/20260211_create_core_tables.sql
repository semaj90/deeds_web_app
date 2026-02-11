-- Manual migration: Create core legal AI tables + case_statute_links junction table
-- Date: 2026-02-11
-- Prerequisite tables for the legal AI API endpoints

-- Step 1: Create missing enums
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'case_status') THEN
    CREATE TYPE "public"."case_status" AS ENUM('open','in_progress','pending_review','closed','archived');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'case_priority') THEN
    CREATE TYPE "public"."case_priority" AS ENUM('low','medium','high','critical','urgent');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'case_link_type') THEN
    CREATE TYPE "public"."case_link_type" AS ENUM('CHARGED_UNDER','CITED_IN','RELATED_TO','OVERRULED_BY','AFFIRMED_BY');
  END IF;
END $$;

-- Step 2: Create users table
CREATE TABLE IF NOT EXISTS "users" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "email" varchar(255) UNIQUE NOT NULL,
  "hashed_password" varchar(255) NOT NULL,
  "name" varchar(255),
  "first_name" varchar(255),
  "last_name" varchar(255),
  "role" "user_role" NOT NULL DEFAULT 'prosecutor',
  "is_active" boolean NOT NULL DEFAULT true,
  "avatar_url" text,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);

-- Step 3: Create cases table
CREATE TABLE IF NOT EXISTS "cases" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "title" varchar(255) NOT NULL,
  "description" text,
  "case_number" varchar(100),
  "priority" "case_priority" NOT NULL,
  "practice_area" varchar(100),
  "jurisdiction" varchar(100),
  "court" varchar(200),
  "client_name" varchar(200),
  "opposing_party" varchar(200),
  "user_id" uuid,
  "assigned_attorney" uuid,
  "filing_date" timestamptz,
  "due_date" timestamptz,
  "closed_date" timestamptz,
  "qdrant_id" uuid,
  "qdrant_collection" varchar(100),
  "metadata" jsonb,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  "status" "case_status" NOT NULL
);

-- Step 4: Create statutes table
CREATE TABLE IF NOT EXISTS "statutes" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "title" varchar(255) NOT NULL,
  "content" text NOT NULL,
  "jurisdiction" varchar(100),
  "section" varchar(100),
  "category" varchar(100),
  "source_url" text,
  "effective_date" timestamp,
  "created_at" timestamp NOT NULL DEFAULT now(),
  "updated_at" timestamp NOT NULL DEFAULT now()
);

-- Step 5: Create citations table
CREATE TABLE IF NOT EXISTS "citations" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "document_id" uuid,
  "case_id" uuid,
  "citation_text" text NOT NULL,
  "source_url" text,
  "page_number" integer,
  "confidence" real,
  "created_by" integer,
  "created_at" timestamp DEFAULT now(),
  "updated_at" timestamp DEFAULT now()
);

-- Step 6: Create case_statute_links junction table
CREATE TABLE IF NOT EXISTS "case_statute_links" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "case_id" uuid NOT NULL,
  "statute_id" uuid,
  "citation_id" uuid,
  "link_type" "case_link_type" DEFAULT 'CITED_IN' NOT NULL,
  "notes" text,
  "created_by" uuid,
  "created_at" timestamp DEFAULT now() NOT NULL
);

-- Step 7: Add foreign keys
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'cases_user_id_users_id_fk') THEN
    ALTER TABLE "cases" ADD CONSTRAINT "cases_user_id_users_id_fk"
      FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE set null;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'case_statute_links_case_id_cases_id_fk') THEN
    ALTER TABLE "case_statute_links" ADD CONSTRAINT "case_statute_links_case_id_cases_id_fk"
      FOREIGN KEY ("case_id") REFERENCES "cases"("id") ON DELETE cascade;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'case_statute_links_statute_id_statutes_id_fk') THEN
    ALTER TABLE "case_statute_links" ADD CONSTRAINT "case_statute_links_statute_id_statutes_id_fk"
      FOREIGN KEY ("statute_id") REFERENCES "statutes"("id") ON DELETE set null;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'case_statute_links_citation_id_citations_id_fk') THEN
    ALTER TABLE "case_statute_links" ADD CONSTRAINT "case_statute_links_citation_id_citations_id_fk"
      FOREIGN KEY ("citation_id") REFERENCES "citations"("id") ON DELETE set null;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'case_statute_links_created_by_users_id_fk') THEN
    ALTER TABLE "case_statute_links" ADD CONSTRAINT "case_statute_links_created_by_users_id_fk"
      FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE set null;
  END IF;
END $$;

-- Step 8: Create indexes
CREATE INDEX IF NOT EXISTS "case_statute_links_case_id_idx" ON "case_statute_links" USING btree ("case_id");
CREATE INDEX IF NOT EXISTS "case_statute_links_statute_id_idx" ON "case_statute_links" USING btree ("statute_id");
CREATE INDEX IF NOT EXISTS "case_statute_links_citation_id_idx" ON "case_statute_links" USING btree ("citation_id");
