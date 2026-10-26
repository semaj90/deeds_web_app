-- DRAFT ONLY: do not apply without operator approval and migration rehearsal.
-- Procedure catalog records are versioned advisory instructions, never executable authority.
CREATE TABLE IF NOT EXISTS public.atlas_procedural_sequences_v1 (
  sequence_id text NOT NULL,
  sequence_revision text NOT NULL,
  feature_id text NOT NULL,
  feature_label text NOT NULL,
  sequence_kind text NOT NULL,
  admission_status text NOT NULL DEFAULT 'PROPOSED'
    CHECK (admission_status IN ('PROPOSED', 'REVIEWED', 'ADMITTED', 'REJECTED', 'RETIRED')),
  source_ref text NOT NULL,
  source_revision text,
  workspace_revision text,
  evidence_refs text[] NOT NULL DEFAULT '{}',
  steps jsonb NOT NULL CHECK (jsonb_typeof(steps) = 'array'),
  sequence_checksum text NOT NULL CHECK (sequence_checksum ~ '^sha256:[0-9a-f]{64}$'),
  canonical_authority boolean NOT NULL DEFAULT false CHECK (canonical_authority = false),
  execution_allowed boolean NOT NULL DEFAULT false CHECK (execution_allowed = false),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (sequence_id, sequence_revision),
  CHECK (length(btrim(sequence_id)) > 0),
  CHECK (length(btrim(sequence_revision)) > 0),
  CHECK (length(btrim(feature_id)) > 0),
  CHECK (length(btrim(feature_label)) > 0),
  CHECK (length(btrim(sequence_kind)) > 0),
  CHECK (length(btrim(source_ref)) > 0),
  CHECK (admission_status <> 'ADMITTED' OR (
    source_revision IS NOT NULL AND workspace_revision IS NOT NULL AND cardinality(evidence_refs) > 0
  ))
);

CREATE INDEX IF NOT EXISTS atlas_procedural_sequences_v1_feature_admission_idx
  ON public.atlas_procedural_sequences_v1 (feature_id, admission_status, sequence_id);
CREATE INDEX IF NOT EXISTS atlas_procedural_sequences_v1_label_admission_idx
  ON public.atlas_procedural_sequences_v1 (lower(feature_label), admission_status, sequence_id);
