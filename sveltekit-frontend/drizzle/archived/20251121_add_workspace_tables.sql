-- Create workspace tables for multi-panel contextual chat system
-- Workspaces group chat sessions with evidence, statutes, notes, and citations

-- Main workspaces table
CREATE TABLE IF NOT EXISTS "workspaces" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "title" text NOT NULL,
  "description" text,
  "case_id" uuid,
  "created_by" integer,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "workspaces_case_id_fk" FOREIGN KEY ("case_id") REFERENCES "cases"("id") ON DELETE CASCADE,
  CONSTRAINT "workspaces_created_by_fk" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE SET NULL
);

-- Link chat sessions to workspaces (one workspace can have multiple chat sessions)
CREATE TABLE IF NOT EXISTS "workspace_sessions" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "workspace_id" uuid NOT NULL,
  "session_id" uuid NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "workspace_sessions_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE,
  CONSTRAINT "workspace_sessions_session_id_fk" FOREIGN KEY ("session_id") REFERENCES "rag_sessions"("id") ON DELETE CASCADE
);

-- Evidence panel: link evidence items to workspaces
CREATE TABLE IF NOT EXISTS "workspace_evidence" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "workspace_id" uuid NOT NULL,
  "evidence_id" uuid NOT NULL,
  "relevance_score" real DEFAULT 0,
  "added_by" varchar(50) DEFAULT 'user',
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "workspace_evidence_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE,
  CONSTRAINT "workspace_evidence_evidence_id_fk" FOREIGN KEY ("evidence_id") REFERENCES "evidence"("id") ON DELETE CASCADE
);

-- Statute panel: link statutes/laws to workspaces
CREATE TABLE IF NOT EXISTS "workspace_statutes" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "workspace_id" uuid NOT NULL,
  "statute_id" uuid,
  "statute_text" text,
  "relevance_score" real DEFAULT 0,
  "source" varchar(50) DEFAULT 'user',
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "workspace_statutes_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE,
  CONSTRAINT "workspace_statutes_statute_id_fk" FOREIGN KEY ("statute_id") REFERENCES "statutes"("id") ON DELETE CASCADE
);

-- User notes and legal memos (searchable via vector embeddings)
CREATE TABLE IF NOT EXISTS "workspace_notes" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "workspace_id" uuid NOT NULL,
  "content" text NOT NULL,
  "is_ai" boolean DEFAULT false,
  "embedding" text,
  "created_by" integer,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "workspace_notes_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE,
  CONSTRAINT "workspace_notes_created_by_fk" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE SET NULL
);

-- Citations and references (links messages to legal sources)
CREATE TABLE IF NOT EXISTS "workspace_citations" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "workspace_id" uuid NOT NULL,
  "message_id" uuid,
  "citation_text" text NOT NULL,
  "citation_url" text,
  "citation_type" varchar(50) DEFAULT 'statute',
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "workspace_citations_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE,
  CONSTRAINT "workspace_citations_message_id_fk" FOREIGN KEY ("message_id") REFERENCES "rag_messages"("id") ON DELETE CASCADE
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS "workspaces_case_id_idx" ON "workspaces"("case_id");
CREATE INDEX IF NOT EXISTS "workspaces_created_by_idx" ON "workspaces"("created_by");

CREATE INDEX IF NOT EXISTS "workspace_sessions_workspace_id_idx" ON "workspace_sessions"("workspace_id");
CREATE INDEX IF NOT EXISTS "workspace_sessions_session_id_idx" ON "workspace_sessions"("session_id");

CREATE INDEX IF NOT EXISTS "workspace_evidence_workspace_id_idx" ON "workspace_evidence"("workspace_id");
CREATE INDEX IF NOT EXISTS "workspace_evidence_evidence_id_idx" ON "workspace_evidence"("evidence_id");

CREATE INDEX IF NOT EXISTS "workspace_statutes_workspace_id_idx" ON "workspace_statutes"("workspace_id");
CREATE INDEX IF NOT EXISTS "workspace_statutes_statute_id_idx" ON "workspace_statutes"("statute_id");

CREATE INDEX IF NOT EXISTS "workspace_notes_workspace_id_idx" ON "workspace_notes"("workspace_id");
CREATE INDEX IF NOT EXISTS "workspace_notes_is_ai_idx" ON "workspace_notes"("is_ai");

CREATE INDEX IF NOT EXISTS "workspace_citations_workspace_id_idx" ON "workspace_citations"("workspace_id");
CREATE INDEX IF NOT EXISTS "workspace_citations_message_id_idx" ON "workspace_citations"("message_id");
