-- Evidence Audit Log (chain of custody compliance)
CREATE TABLE IF NOT EXISTS evidence_audit_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    evidence_id UUID NOT NULL REFERENCES evidence(id) ON DELETE CASCADE,
    user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    action VARCHAR(50) NOT NULL,
    changes JSONB,
    ip_address VARCHAR(45),
    user_agent TEXT,
    timestamp TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS evidence_audit_log_evidence_id_idx ON evidence_audit_log(evidence_id);
CREATE INDEX IF NOT EXISTS evidence_audit_log_user_id_idx ON evidence_audit_log(user_id);
CREATE INDEX IF NOT EXISTS evidence_audit_log_timestamp_idx ON evidence_audit_log(timestamp);
CREATE INDEX IF NOT EXISTS evidence_audit_log_action_idx ON evidence_audit_log(action);

-- Evidence Versions (metadata change tracking)
CREATE TABLE IF NOT EXISTS evidence_versions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    evidence_id UUID NOT NULL REFERENCES evidence(id) ON DELETE CASCADE,
    version INTEGER NOT NULL,
    title VARCHAR(255),
    description TEXT,
    metadata JSONB,
    changed_by UUID REFERENCES users(id) ON DELETE SET NULL,
    change_reason TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS evidence_versions_evidence_id_idx ON evidence_versions(evidence_id);
CREATE INDEX IF NOT EXISTS evidence_versions_version_idx ON evidence_versions(evidence_id, version);

-- Performance indexes on evidence table (from next_steps)
CREATE INDEX IF NOT EXISTS idx_evidence_case_id_created ON evidence(case_id, created_at);
CREATE INDEX IF NOT EXISTS idx_evidence_metadata_gin ON evidence USING GIN (metadata);
