BEGIN;

CREATE TABLE public.evidence_vector_projection_outbox (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  evidence_vector_id uuid NOT NULL,
  qdrant_point_id uuid NOT NULL,
  projection_lane text NOT NULL CHECK (projection_lane = 'evidence_semantic_768'),
  projection_contract_revision text NOT NULL CHECK (length(btrim(projection_contract_revision)) > 0),
  source_revision text NOT NULL CHECK (source_revision ~ '^sha256:[0-9a-f]{64}$'),
  chunk_index integer NOT NULL CHECK (chunk_index >= 0),
  output_sha256 text NOT NULL CHECK (output_sha256 ~ '^sha256:[0-9a-f]{64}$'),
  model_artifact_sha256 text NOT NULL CHECK (model_artifact_sha256 ~ '^sha256:[0-9a-f]{64}$'),
  input_recipe_revision text NOT NULL CHECK (length(btrim(input_recipe_revision)) > 0),
  input_sha256 text NOT NULL CHECK (input_sha256 ~ '^sha256:[0-9a-f]{64}$'),
  status varchar(24) NOT NULL DEFAULT 'PENDING'
    CHECK (status IN ('PENDING', 'PROCESSING', 'RETRY', 'COMPLETED', 'DEAD_LETTER')),
  attempt_count integer NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
  max_attempts integer NOT NULL DEFAULT 8 CHECK (max_attempts > 0),
  available_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  lease_token uuid,
  lease_expires_at timestamptz,
  last_error text,
  verification_receipt jsonb,
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  CONSTRAINT evidence_vector_projection_outbox_identity_uq
    UNIQUE (evidence_vector_id, projection_lane, projection_contract_revision),
  CONSTRAINT evidence_vector_projection_outbox_vector_fk
    FOREIGN KEY (evidence_vector_id) REFERENCES public.evidence_vectors(id) ON DELETE RESTRICT,
  CONSTRAINT evidence_vector_projection_outbox_lease_ck CHECK (
    (status = 'PROCESSING' AND lease_token IS NOT NULL AND lease_expires_at IS NOT NULL)
    OR (status <> 'PROCESSING' AND lease_token IS NULL AND lease_expires_at IS NULL)
  ),
  CONSTRAINT evidence_vector_projection_outbox_completion_ck CHECK (
    (status = 'COMPLETED' AND completed_at IS NOT NULL AND verification_receipt IS NOT NULL)
    OR (status <> 'COMPLETED' AND completed_at IS NULL AND verification_receipt IS NULL)
  )
);

CREATE INDEX evidence_vector_projection_outbox_dispatch_idx
  ON public.evidence_vector_projection_outbox (available_at, created_at, id)
  WHERE status IN ('PENDING', 'RETRY');

CREATE INDEX evidence_vector_projection_outbox_lease_idx
  ON public.evidence_vector_projection_outbox (lease_expires_at, id)
  WHERE status = 'PROCESSING';

COMMENT ON TABLE public.evidence_vector_projection_outbox IS
  'Reference-only durable delivery for canonical PostgreSQL evidence_vectors to Qdrant; never stores vector arrays.';

COMMIT;
