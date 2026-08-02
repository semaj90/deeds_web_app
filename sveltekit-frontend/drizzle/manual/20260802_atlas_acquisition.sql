-- Parent Atlas acquisition plane — MVP identity chain per
-- openspec/changes/parent-atlas-graph-retrieval-proof/tasks.md GS1.19+.
-- research_run -> fetch -> fetch_attempt (many)
--                        -> source_revision (digest-deduped) -> extraction (many, one per extractor)

CREATE TABLE IF NOT EXISTS "atlas_research_runs" (
  "research_run_id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "workflow_run_id" text,
  "workspace_id" text NOT NULL,
  "workspace_revision" integer NOT NULL,
  "query" text NOT NULL,
  "status" text NOT NULL DEFAULT 'queued',
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE INDEX IF NOT EXISTS "idx_atlas_research_runs_workflow" ON "atlas_research_runs" USING btree ("workflow_run_id");
CREATE INDEX IF NOT EXISTS "idx_atlas_research_runs_status" ON "atlas_research_runs" USING btree ("status");

CREATE TABLE IF NOT EXISTS "atlas_fetches" (
  "fetch_id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "research_run_id" uuid NOT NULL REFERENCES "atlas_research_runs"("research_run_id"),
  "web_source_id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "requested_url" text NOT NULL,
  "normalized_url" text NOT NULL,
  "acquisition_mode" text NOT NULL DEFAULT 'auto',
  "cache_policy_mode" text NOT NULL DEFAULT 'default',
  "status" text NOT NULL DEFAULT 'pending',
  "max_attempts" integer NOT NULL DEFAULT 4,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "atlas_fetches_run_normalized_url_unique" UNIQUE("research_run_id", "normalized_url")
);
CREATE INDEX IF NOT EXISTS "idx_atlas_fetches_research_run" ON "atlas_fetches" USING btree ("research_run_id");

CREATE TABLE IF NOT EXISTS "atlas_source_revisions" (
  "source_revision_id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "web_source_id" uuid NOT NULL,
  "final_url" text NOT NULL,
  "content_digest" text NOT NULL,
  "content_type" text,
  "content_length" bigint,
  "storage_uri" text,
  "http_status" integer,
  "etag" text,
  "last_modified" text,
  "received_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "atlas_source_revisions_url_digest_unique" UNIQUE("final_url", "content_digest")
);
CREATE INDEX IF NOT EXISTS "idx_atlas_source_revisions_web_source" ON "atlas_source_revisions" USING btree ("web_source_id");

CREATE TABLE IF NOT EXISTS "atlas_fetch_attempts" (
  "fetch_attempt_id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "fetch_id" uuid NOT NULL REFERENCES "atlas_fetches"("fetch_id"),
  "research_run_id" uuid NOT NULL REFERENCES "atlas_research_runs"("research_run_id"),
  "attempt_number" integer NOT NULL,
  "requested_url" text NOT NULL,
  "normalized_url" text NOT NULL,
  "acquisition_mode" text NOT NULL,
  "cache_mode" text NOT NULL,
  "request_etag" text,
  "request_last_modified" text,
  "started_at" timestamp with time zone NOT NULL,
  "completed_at" timestamp with time zone,
  "http_status" integer,
  "final_url" text,
  "redirect_chain" jsonb,
  "response_etag" text,
  "response_last_modified" text,
  "cache_control" text,
  "vary" text,
  "content_type" text,
  "content_length" bigint,
  "content_digest" text,
  "source_revision_id" uuid REFERENCES "atlas_source_revisions"("source_revision_id"),
  "cache_decision" text,
  "retry_class" text,
  "error_code" text,
  "error_message" text,
  "trace_id" text,
  "span_id" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "atlas_fetch_attempts_fetch_attempt_unique" UNIQUE("fetch_id", "attempt_number")
);
CREATE INDEX IF NOT EXISTS "idx_atlas_fetch_attempts_fetch" ON "atlas_fetch_attempts" USING btree ("fetch_id", "attempt_number");
CREATE INDEX IF NOT EXISTS "idx_atlas_fetch_attempts_trace" ON "atlas_fetch_attempts" USING btree ("trace_id");

CREATE TABLE IF NOT EXISTS "atlas_extractions" (
  "extraction_id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "source_revision_id" uuid NOT NULL REFERENCES "atlas_source_revisions"("source_revision_id"),
  "fetch_id" uuid NOT NULL REFERENCES "atlas_fetches"("fetch_id"),
  "schema_version" text NOT NULL DEFAULT 'atlas.extraction.result.v1',
  "extractor_name" text NOT NULL,
  "extractor_version" text,
  "content_digest" text NOT NULL,
  "normalized_text_digest" text NOT NULL,
  "title" text,
  "language" text,
  "normalized_text" text,
  "metadata" jsonb,
  "warnings" jsonb,
  "trace_id" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "atlas_extractions_dedupe_unique" UNIQUE("source_revision_id", "extractor_name", "extractor_version", "normalized_text_digest")
);
CREATE INDEX IF NOT EXISTS "idx_atlas_extractions_source_revision" ON "atlas_extractions" USING btree ("source_revision_id");
