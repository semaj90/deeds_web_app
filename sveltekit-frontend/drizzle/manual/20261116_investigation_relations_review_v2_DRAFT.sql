-- DRAFT v2 (additive): investigation relations, append-only export lineage and review ledger,
-- analysis review status, and multi-column indexes.
-- Pre-image: 20261115_case_investigation_facets_v1 tables exist; evidence_analysis_cache has no review columns;
-- case_reports is intentionally NOT modified (0 rows, no readers); case_notes stays the summary table.
-- Rehearse in BEGIN ... ROLLBACK before apply. Idempotent (IF NOT EXISTS / guarded constraints).

-- 1. Facet -> person of interest (was an unconstrained uuid).
DO $$ BEGIN
  ALTER TABLE case_investigation_facets
    ADD CONSTRAINT case_investigation_facets_person_fk
    FOREIGN KEY (person_id) REFERENCES persons_of_interest(id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 2. Facet <-> case note (summaries). Junction keeps case_notes a separate table.
CREATE TABLE IF NOT EXISTS investigation_facet_notes (
  facet_id uuid NOT NULL REFERENCES case_investigation_facets(id) ON DELETE CASCADE,
  case_note_id uuid NOT NULL REFERENCES case_notes(id) ON DELETE CASCADE,
  linked_by integer,
  linked_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (facet_id, case_note_id)
);
CREATE INDEX IF NOT EXISTS investigation_facet_notes_note_facet_idx ON investigation_facet_notes (case_note_id, facet_id);

-- 3. Export lineage: which facet and evidence each immutable export was built from.
CREATE TABLE IF NOT EXISTS case_ai_summary_export_sources (
  export_id uuid NOT NULL REFERENCES case_ai_summary_exports(id) ON DELETE RESTRICT,
  facet_id uuid NOT NULL REFERENCES case_investigation_facets(id) ON DELETE RESTRICT,
  evidence_id uuid NOT NULL REFERENCES evidence(id) ON DELETE RESTRICT,
  relevance real NOT NULL CHECK (relevance >= 0 AND relevance <= 1),
  PRIMARY KEY (export_id, facet_id, evidence_id)
);
CREATE INDEX IF NOT EXISTS case_ai_summary_export_sources_evidence_idx ON case_ai_summary_export_sources (evidence_id, export_id);

CREATE OR REPLACE FUNCTION reject_append_only_mutation()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION '% is append-only', TG_TABLE_NAME;
END;
$$;
DROP TRIGGER IF EXISTS case_ai_summary_export_sources_immutable_trg ON case_ai_summary_export_sources;
CREATE TRIGGER case_ai_summary_export_sources_immutable_trg
  BEFORE UPDATE OR DELETE ON case_ai_summary_export_sources
  FOR EACH ROW EXECUTE FUNCTION reject_append_only_mutation();

-- 4. Review ledger for exports. Exports are immutable, so status is the latest review row.
CREATE TABLE IF NOT EXISTS case_ai_summary_export_reviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  export_id uuid NOT NULL REFERENCES case_ai_summary_exports(id) ON DELETE RESTRICT,
  decision text NOT NULL CHECK (decision IN ('APPROVED', 'REJECTED')),
  reviewed_by integer NOT NULL,
  note text CHECK (note IS NULL OR length(note) <= 1000),
  reviewed_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS case_ai_summary_export_reviews_export_idx ON case_ai_summary_export_reviews (export_id, reviewed_at DESC);
DROP TRIGGER IF EXISTS case_ai_summary_export_reviews_immutable_trg ON case_ai_summary_export_reviews;
CREATE TRIGGER case_ai_summary_export_reviews_immutable_trg
  BEFORE UPDATE OR DELETE ON case_ai_summary_export_reviews
  FOR EACH ROW EXECUTE FUNCTION reject_append_only_mutation();

-- 5. Analysis ledger review status (additive; existing rows become UNREVIEWED).
ALTER TABLE evidence_analysis_cache
  ADD COLUMN IF NOT EXISTS review_status text NOT NULL DEFAULT 'UNREVIEWED',
  ADD COLUMN IF NOT EXISTS reviewed_by integer,
  ADD COLUMN IF NOT EXISTS reviewed_at timestamptz;
DO $$ BEGIN
  ALTER TABLE evidence_analysis_cache
    ADD CONSTRAINT evidence_analysis_cache_review_status_ck
    CHECK (review_status IN ('UNREVIEWED', 'ACCEPTED', 'REJECTED'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
CREATE INDEX IF NOT EXISTS evidence_analysis_cache_evidence_review_idx ON evidence_analysis_cache (evidence_id, review_status);

-- 6. Multi-column indexes on the new filter and join paths.
CREATE INDEX IF NOT EXISTS case_investigation_facets_case_status_kind_idx ON case_investigation_facets (case_id, status, facet_kind);
CREATE INDEX IF NOT EXISTS case_investigation_facets_person_idx ON case_investigation_facets (person_id) WHERE person_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS investigation_facet_evidence_evidence_facet_idx ON investigation_facet_evidence (evidence_id, facet_id);
CREATE INDEX IF NOT EXISTS scene_markers_evidence_case_scene_idx ON scene_markers (evidence_id, case_id, scene_key) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS scene_assets_case_scene_format_idx ON scene_assets (case_id, scene_id, format);
CREATE INDEX IF NOT EXISTS case_ai_summary_exports_case_created_idx ON case_ai_summary_exports (case_id, created_at DESC);

-- Post-check (read-only): new tables present, 3 triggers present, 0 rows in new tables on first apply.
