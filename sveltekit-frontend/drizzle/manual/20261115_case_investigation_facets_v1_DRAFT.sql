-- DRAFT (not applied). Case investigation layer: WHO / WHAT / WHY / HOW facets,
-- evidence links per facet, and append-only AI analysis summary exports.
-- Reuses existing owners: cases, evidence, case_persons (WHO subjects), evidence_analysis_cache.
-- Scene geometry stays in scene_assets / scene_markers / scene_document_revisions (separate candidates).
-- Rehearse in BEGIN ... ROLLBACK before any apply. All statements are IF NOT EXISTS / idempotent.

CREATE TABLE IF NOT EXISTS case_investigation_facets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id uuid NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
  facet_kind text NOT NULL,
  claim_text text NOT NULL,
  status text NOT NULL DEFAULT 'HYPOTHESIS',
  confidence real,
  person_id uuid,
  revision integer NOT NULL DEFAULT 1,
  created_by integer,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT case_investigation_facets_kind_ck CHECK (facet_kind IN ('WHO', 'WHAT', 'WHY', 'HOW')),
  CONSTRAINT case_investigation_facets_status_ck CHECK (status IN ('HYPOTHESIS', 'SUPPORTED', 'REFUTED')),
  CONSTRAINT case_investigation_facets_confidence_ck CHECK (confidence IS NULL OR (confidence >= 0 AND confidence <= 1)),
  CONSTRAINT case_investigation_facets_revision_ck CHECK (revision >= 1),
  CONSTRAINT case_investigation_facets_claim_nonblank_ck CHECK (length(btrim(claim_text)) > 0)
);
CREATE INDEX IF NOT EXISTS case_investigation_facets_case_kind_idx ON case_investigation_facets (case_id, facet_kind);

CREATE TABLE IF NOT EXISTS investigation_facet_evidence (
  facet_id uuid NOT NULL REFERENCES case_investigation_facets(id) ON DELETE CASCADE,
  evidence_id uuid NOT NULL REFERENCES evidence(id) ON DELETE RESTRICT,
  analysis_cache_id uuid REFERENCES evidence_analysis_cache(id) ON DELETE SET NULL,
  relevance real NOT NULL DEFAULT 1,
  note text,
  linked_by integer,
  linked_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (facet_id, evidence_id),
  CONSTRAINT investigation_facet_evidence_relevance_ck CHECK (relevance >= 0 AND relevance <= 1)
);
CREATE INDEX IF NOT EXISTS investigation_facet_evidence_evidence_idx ON investigation_facet_evidence (evidence_id);

CREATE TABLE IF NOT EXISTS case_ai_summary_exports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id uuid NOT NULL REFERENCES cases(id) ON DELETE RESTRICT,
  revision integer NOT NULL,
  command_id uuid NOT NULL,
  input_manifest_sha256 text NOT NULL,
  facet_snapshot_sha256 text NOT NULL,
  summary_sha256 text NOT NULL,
  model_id text NOT NULL,
  summary_markdown text NOT NULL,
  citations jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_by integer NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT case_ai_summary_exports_revision_uq UNIQUE (case_id, revision),
  CONSTRAINT case_ai_summary_exports_command_uq UNIQUE (command_id),
  CONSTRAINT case_ai_summary_exports_sha_ck CHECK (
    input_manifest_sha256 ~ '^[0-9a-f]{64}$' AND facet_snapshot_sha256 ~ '^[0-9a-f]{64}$' AND summary_sha256 ~ '^[0-9a-f]{64}$'
  ),
  CONSTRAINT case_ai_summary_exports_revision_ck CHECK (revision >= 1)
);
CREATE INDEX IF NOT EXISTS case_ai_summary_exports_head_idx ON case_ai_summary_exports (case_id, revision DESC);

CREATE OR REPLACE FUNCTION reject_case_ai_summary_export_mutation()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'case_ai_summary_exports is append-only';
END;
$$;
DROP TRIGGER IF EXISTS case_ai_summary_exports_immutable_trg ON case_ai_summary_exports;
CREATE TRIGGER case_ai_summary_exports_immutable_trg
  BEFORE UPDATE OR DELETE ON case_ai_summary_exports
  FOR EACH ROW EXECUTE FUNCTION reject_case_ai_summary_export_mutation();
