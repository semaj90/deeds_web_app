-- Append-only validation evidence for derived PacketClassLutV1 artifacts.
-- This table does not own vocabulary, packet identity, or LUT assignments.
-- Apply only through the reviewed migration procedure; do not use drizzle-kit push.

CREATE TABLE IF NOT EXISTS public.atlas_packet_class_lut_validation_receipts (
  receipt_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  schema_name text NOT NULL CHECK (schema_name = 'atlas.packet-class-lut.v1'),
  lut_kind text NOT NULL CHECK (length(btrim(lut_kind)) > 0),
  encoding_revision text NOT NULL CHECK (encoding_revision ~ '^sha256:[a-f0-9]{64}$'),
  source_label_set_checksum text NOT NULL CHECK (source_label_set_checksum ~ '^sha256:[a-f0-9]{64}$'),
  validator_revision text NOT NULL CHECK (length(btrim(validator_revision)) > 0),
  workspace_revision text,
  source_revision text,
  source_ref text,
  input_checksum text NOT NULL CHECK (input_checksum ~ '^[a-f0-9]{64}$'),
  outcome text NOT NULL CHECK (outcome IN ('PASS', 'REJECT', 'ERROR')),
  entry_count smallint NOT NULL CHECK (entry_count BETWEEN 1 AND 256),
  analysis_text text NOT NULL DEFAULT '',
  evidence jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(evidence) = 'object'),
  search_document tsvector GENERATED ALWAYS AS (
    setweight(to_tsvector('simple'::regconfig, coalesce(lut_kind, '')), 'A') ||
    setweight(to_tsvector('simple'::regconfig, coalesce(analysis_text, '')), 'B') ||
    setweight(to_tsvector('simple'::regconfig, coalesce(source_ref, '')), 'C')
  ) STORED,
  recorded_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS atlas_packet_class_lut_validation_revision_idx
  ON public.atlas_packet_class_lut_validation_receipts
  (workspace_revision, source_revision, encoding_revision, validator_revision, recorded_at DESC);

CREATE INDEX IF NOT EXISTS atlas_packet_class_lut_validation_outcome_idx
  ON public.atlas_packet_class_lut_validation_receipts (outcome, recorded_at DESC);

CREATE INDEX IF NOT EXISTS atlas_packet_class_lut_validation_search_gin
  ON public.atlas_packet_class_lut_validation_receipts USING gin (search_document);

CREATE INDEX IF NOT EXISTS atlas_packet_class_lut_validation_evidence_gin
  ON public.atlas_packet_class_lut_validation_receipts USING gin (evidence jsonb_path_ops);

CREATE OR REPLACE FUNCTION public.atlas_packet_class_lut_validation_receipts_immutable()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'atlas_packet_class_lut_validation_receipts is append-only; % is not permitted', TG_OP;
END;
$$;

DROP TRIGGER IF EXISTS atlas_packet_class_lut_validation_receipts_reject_update
  ON public.atlas_packet_class_lut_validation_receipts;
CREATE TRIGGER atlas_packet_class_lut_validation_receipts_reject_update
  BEFORE UPDATE ON public.atlas_packet_class_lut_validation_receipts
  FOR EACH ROW EXECUTE FUNCTION public.atlas_packet_class_lut_validation_receipts_immutable();

DROP TRIGGER IF EXISTS atlas_packet_class_lut_validation_receipts_reject_delete
  ON public.atlas_packet_class_lut_validation_receipts;
CREATE TRIGGER atlas_packet_class_lut_validation_receipts_reject_delete
  BEFORE DELETE ON public.atlas_packet_class_lut_validation_receipts
  FOR EACH ROW EXECUTE FUNCTION public.atlas_packet_class_lut_validation_receipts_immutable();

COMMENT ON TABLE public.atlas_packet_class_lut_validation_receipts IS
  'Append-only validation receipts for derived packet-class LUT encodings; not canonical vocabulary or packet identity.';

COMMENT ON COLUMN public.atlas_packet_class_lut_validation_receipts.evidence IS
  'Bounded, schema-validated validation metadata; must not contain source contents, hidden thoughts, tensors, or credentials.';
