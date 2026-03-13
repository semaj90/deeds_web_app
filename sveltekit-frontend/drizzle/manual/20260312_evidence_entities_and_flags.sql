-- Evidence Entities: Normalized entity extraction results
-- Replaces JSONB blob storage in evidence.metadata.entities (capped at 200)
-- Enables cross-evidence entity search ("all docs mentioning PERSON X")
CREATE TABLE IF NOT EXISTS evidence_entities (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    evidence_id UUID NOT NULL REFERENCES evidence(id) ON DELETE CASCADE,
    case_id UUID REFERENCES cases(id) ON DELETE SET NULL,
    entity_text TEXT NOT NULL,
    entity_label VARCHAR(50) NOT NULL,
    confidence REAL,
    start_offset INTEGER,
    end_offset INTEGER,
    source VARCHAR(20) DEFAULT 'llm',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS evidence_entities_evidence_id_idx ON evidence_entities(evidence_id);
CREATE INDEX IF NOT EXISTS evidence_entities_case_id_idx ON evidence_entities(case_id);
CREATE INDEX IF NOT EXISTS evidence_entities_label_idx ON evidence_entities(entity_label);
CREATE INDEX IF NOT EXISTS evidence_entities_text_label_idx ON evidence_entities(entity_text, entity_label);

-- Evidence Forensic Flags: Normalized forensic detection results
-- Replaces JSONB blob storage in evidence.metadata.forensicFlags
-- Enables cross-evidence forensic queries ("all docs with SSN detected")
CREATE TABLE IF NOT EXISTS evidence_forensic_flags (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    evidence_id UUID NOT NULL REFERENCES evidence(id) ON DELETE CASCADE,
    case_id UUID REFERENCES cases(id) ON DELETE SET NULL,
    flag_type VARCHAR(50) NOT NULL,
    description TEXT NOT NULL,
    severity VARCHAR(10) NOT NULL,
    metadata JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS evidence_forensic_flags_evidence_id_idx ON evidence_forensic_flags(evidence_id);
CREATE INDEX IF NOT EXISTS evidence_forensic_flags_case_id_idx ON evidence_forensic_flags(case_id);
CREATE INDEX IF NOT EXISTS evidence_forensic_flags_type_idx ON evidence_forensic_flags(flag_type);
CREATE INDEX IF NOT EXISTS evidence_forensic_flags_severity_idx ON evidence_forensic_flags(severity);
