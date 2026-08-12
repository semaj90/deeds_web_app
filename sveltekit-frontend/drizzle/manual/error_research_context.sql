-- Durable research receipt for an error_logs failure population.
-- Written by scripts/atlas/research-error-fixes.mjs.
-- Postgres remains truth; nothing here is a cache-only projection.
--
-- Separation of concerns (do not collapse these into one table later):
--   error_logs             -- canonical failure observation
--   error_research_context -- research receipt (this table)
--   error_fix_plan          -- (not yet built) fix recommendation
--   fix_attempt / verification_receipt -- (not yet built) operator-gated execution
--
-- error_fingerprint dedupes identical failures (same class/message/source,
-- ignoring timestamps/line numbers/request IDs) so N identical errors become
-- one research population instead of N Firecrawl calls.

CREATE TABLE IF NOT EXISTS error_research_context (
    id BIGSERIAL PRIMARY KEY,
    error_log_id BIGINT NOT NULL REFERENCES error_logs(id),
    error_fingerprint TEXT NOT NULL,
    packet_key TEXT,
    source_ref TEXT,
    source_revision TEXT,
    workspace_revision TEXT,
    graph_revision TEXT,

    research_status TEXT NOT NULL DEFAULT 'PENDING' CHECK (research_status IN (
        'PENDING', 'LOCAL_ONLY', 'RESEARCH_REQUIRED', 'RESEARCH_RUNNING',
        'RESEARCH_COMPLETE', 'RESEARCH_FAILED', 'STALE', 'SUPERSEDED'
    )),
    research_disposition TEXT CHECK (research_disposition IN (
        'LOCAL_CONTEXT_SUFFICIENT', 'EXTERNAL_RESEARCH_REQUIRED',
        'DUPLICATE', 'STALE', 'UNSUPPORTED'
    )),

    local_context_digest TEXT,
    codebase_context JSONB,

    research_query TEXT,
    ldr_run_id TEXT,
    ldr_revision TEXT,
    research_synthesis TEXT,
    source_count INTEGER,
    sources_json JSONB NOT NULL DEFAULT '[]',
    research_confidence REAL,

    research_policy_revision TEXT NOT NULL DEFAULT 'research-error-fixes-v1',
    content_hash TEXT,

    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    completed_at TIMESTAMPTZ,

    UNIQUE (error_fingerprint, workspace_revision, research_policy_revision)
);

CREATE INDEX IF NOT EXISTS error_research_context_error_log_idx
ON error_research_context (error_log_id);

CREATE INDEX IF NOT EXISTS error_research_context_fingerprint_idx
ON error_research_context (error_fingerprint, workspace_revision);
