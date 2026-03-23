-- Report Versions (change tracking for legal compliance)
-- Mirrors evidence_versions pattern — snapshots report state before updates
CREATE TABLE IF NOT EXISTS report_versions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    report_id UUID NOT NULL REFERENCES reports(id) ON DELETE CASCADE,
    version INTEGER NOT NULL,
    title VARCHAR(255),
    content TEXT,
    metadata JSONB,
    changed_by UUID REFERENCES users(id) ON DELETE SET NULL,
    change_reason TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS report_versions_report_id_idx ON report_versions(report_id);
CREATE INDEX IF NOT EXISTS report_versions_version_idx ON report_versions(report_id, version);

-- Performance indexes on reports table
CREATE INDEX IF NOT EXISTS idx_reports_case_id_status ON reports(case_id, status);
CREATE INDEX IF NOT EXISTS idx_reports_metadata_gin ON reports USING GIN (metadata);