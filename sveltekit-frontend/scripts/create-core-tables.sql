-- Phase 98: Create missing core tables
-- Run with: docker exec phase66-postgres psql -U legal_admin -d legal_ai_db -f /tmp/create-core-tables.sql

-- Cases table
CREATE TABLE IF NOT EXISTS "cases" (
    "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    "title" varchar(255) NOT NULL,
    "description" text,
    "case_number" varchar(100),
    "priority" varchar(50) DEFAULT 'medium',
    "practice_area" varchar(100),
    "jurisdiction" varchar(100),
    "court" varchar(255),
    "client_name" varchar(255),
    "opposing_party" varchar(255),
    "assigned_attorney" varchar(255),
    "filing_date" timestamp with time zone,
    "due_date" timestamp with time zone,
    "closed_date" timestamp with time zone,
    "qdrant_id" varchar(255),
    "qdrant_collection" varchar(255),
    "metadata" jsonb,
    "created_at" timestamp with time zone DEFAULT now() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
    "status" varchar(50) DEFAULT 'active'
);

-- Evidence table
CREATE TABLE IF NOT EXISTS "evidence" (
    "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    "case_id" uuid REFERENCES "cases"("id") ON DELETE CASCADE,
    "title" varchar(255) NOT NULL,
    "description" text,
    "file_path" varchar(500),
    "file_type" varchar(100),
    "file_size" integer,
    "hash" varchar(255),
    "source" varchar(255),
    "date_obtained" timestamp with time zone,
    "chain_of_custody" jsonb,
    "metadata" jsonb,
    "created_at" timestamp with time zone DEFAULT now() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

-- Sessions table
CREATE TABLE IF NOT EXISTS "sessions" (
    "id" varchar(255) PRIMARY KEY,
    "user_id" uuid REFERENCES "users"("id") ON DELETE CASCADE,
    "expires_at" timestamp with time zone NOT NULL
);

-- Documents table
CREATE TABLE IF NOT EXISTS "documents" (
    "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    "case_id" uuid REFERENCES "cases"("id") ON DELETE SET NULL,
    "title" varchar(255) NOT NULL,
    "description" text,
    "file_path" varchar(500),
    "file_type" varchar(100),
    "file_size" integer,
    "content" text,
    "summary" text,
    "embedding_id" varchar(255),
    "metadata" jsonb,
    "created_at" timestamp with time zone DEFAULT now() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
    "status" varchar(50) DEFAULT 'pending'
);

-- Create indexes
CREATE INDEX IF NOT EXISTS "cases_status_idx" ON "cases"("status");
CREATE INDEX IF NOT EXISTS "cases_assigned_attorney_idx" ON "cases"("assigned_attorney");
CREATE INDEX IF NOT EXISTS "evidence_case_id_idx" ON "evidence"("case_id");
CREATE INDEX IF NOT EXISTS "documents_case_id_idx" ON "documents"("case_id");
CREATE INDEX IF NOT EXISTS "sessions_user_id_idx" ON "sessions"("user_id");

-- Grant permissions
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO legal_admin;
