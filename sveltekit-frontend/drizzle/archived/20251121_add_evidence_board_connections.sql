-- Create evidence_board_connections table for YoRHa Evidence Board
-- Tracks relationships between evidence items in a case

CREATE TABLE IF NOT EXISTS "evidence_board_connections" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "case_id" uuid NOT NULL,
  "from_evidence_id" uuid NOT NULL,
  "to_evidence_id" uuid NOT NULL,
  "connection_type" varchar(50) NOT NULL DEFAULT 'related',
  "label" varchar(255),
  "notes" text,
  "strength" real DEFAULT 1.0,
  "is_visible" boolean DEFAULT true,
  "created_by" integer,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "evidence_board_connections_case_id_fk" FOREIGN KEY ("case_id") REFERENCES "cases"("id") ON DELETE CASCADE,
  CONSTRAINT "evidence_board_connections_from_evidence_id_fk" FOREIGN KEY ("from_evidence_id") REFERENCES "evidence"("id") ON DELETE CASCADE,
  CONSTRAINT "evidence_board_connections_to_evidence_id_fk" FOREIGN KEY ("to_evidence_id") REFERENCES "evidence"("id") ON DELETE CASCADE,
  CONSTRAINT "evidence_board_connections_created_by_fk" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE SET NULL
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS "evidence_board_connections_case_id_idx" ON "evidence_board_connections"("case_id");
CREATE INDEX IF NOT EXISTS "evidence_board_connections_from_evidence_id_idx" ON "evidence_board_connections"("from_evidence_id");
CREATE INDEX IF NOT EXISTS "evidence_board_connections_to_evidence_id_idx" ON "evidence_board_connections"("to_evidence_id");
CREATE INDEX IF NOT EXISTS "evidence_board_connections_type_idx" ON "evidence_board_connections"("connection_type");
