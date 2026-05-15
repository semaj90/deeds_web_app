-- Case Note Evidence References Migration
-- Links case notes to evidence files for better organization

CREATE TABLE IF NOT EXISTS case_note_evidence_refs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  note_id uuid NOT NULL REFERENCES case_notes(id) ON DELETE CASCADE,
  evidence_id uuid NOT NULL REFERENCES evidence(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (note_id, evidence_id)
);

CREATE INDEX idx_case_note_refs_note ON case_note_evidence_refs(note_id);
CREATE INDEX idx_case_note_refs_evidence ON case_note_evidence_refs(evidence_id);
