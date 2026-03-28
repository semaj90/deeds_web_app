-- Add statute_chunks table for RAG-optimized statute search
-- Stores chunked sections of statutes with embeddings

-- Add new columns to statutes table if they don't exist
ALTER TABLE "statutes" ADD COLUMN IF NOT EXISTS "section" varchar(100);
ALTER TABLE "statutes" ADD COLUMN IF NOT EXISTS "category" varchar(100);
ALTER TABLE "statutes" ADD COLUMN IF NOT EXISTS "source_url" text;

-- Create statute_chunks table
CREATE TABLE IF NOT EXISTS "statute_chunks" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "statute_id" uuid NOT NULL,
  "chunk_index" integer NOT NULL,
  "content" text NOT NULL,
  "embedding" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "statute_chunks_statute_id_fk" FOREIGN KEY ("statute_id") REFERENCES "statutes"("id") ON DELETE CASCADE
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS "statute_chunks_statute_id_idx" ON "statute_chunks"("statute_id");
CREATE INDEX IF NOT EXISTS "statute_chunks_chunk_index_idx" ON "statute_chunks"("chunk_index");
