-- Diagnosis Events: Persisted AI diagnosis results from the error-brain pipeline
-- Safe to run idempotently (IF NOT EXISTS)

CREATE TABLE IF NOT EXISTS diagnosis_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    route_path VARCHAR(255),
    file_path VARCHAR(500),
    query TEXT NOT NULL,
    mode VARCHAR(20) NOT NULL DEFAULT 'route',
    probable_root_cause_type VARCHAR(50) NOT NULL DEFAULT 'unknown',
    risk_level VARCHAR(10) NOT NULL DEFAULT 'medium',
    diagnosis TEXT NOT NULL,
    likely_files JSONB NOT NULL DEFAULT '[]'::jsonb,
    impacted_files JSONB NOT NULL DEFAULT '[]'::jsonb,
    fix_plan JSONB NOT NULL DEFAULT '[]'::jsonb,
    evidence JSONB NOT NULL DEFAULT '[]'::jsonb,
    ranked_files JSONB NOT NULL DEFAULT '[]'::jsonb,
    suggested_tests JSONB NOT NULL DEFAULT '[]'::jsonb,
    sources JSONB NOT NULL DEFAULT '{}'::jsonb,
    needs_human_review BOOLEAN NOT NULL DEFAULT true,
    unsafe_to_auto_patch BOOLEAN NOT NULL DEFAULT false,
    cached BOOLEAN NOT NULL DEFAULT false,
    total_ms INTEGER,
    stages JSONB NOT NULL DEFAULT '{}'::jsonb,
    user_id UUID,
    feedback_accurate BOOLEAN,
    feedback_helpful BOOLEAN,
    created_at TIMESTAMP NOT NULL DEFAULT now()
);

-- Indexes for common query patterns
CREATE INDEX IF NOT EXISTS idx_diagnosis_events_route ON diagnosis_events (route_path);
CREATE INDEX IF NOT EXISTS idx_diagnosis_events_mode ON diagnosis_events (mode);
CREATE INDEX IF NOT EXISTS idx_diagnosis_events_root_cause ON diagnosis_events (probable_root_cause_type);
CREATE INDEX IF NOT EXISTS idx_diagnosis_events_created ON diagnosis_events (created_at);
