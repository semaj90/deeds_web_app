-- PROPOSAL ONLY. Not a Drizzle migration and not approved for database application.
-- Rehearse only in a verified disposable PostgreSQL 18 database after reconciling
-- the canonical evidence identity and running the migration through its owner.
--
-- PostgreSQL 18.4 scratch inspection found public.evidence, but not evidence_items.
-- The existing evidence_vectors/evidence_vector_projection_outbox lane is text-only.
-- This additive candidate keeps that contract unchanged.

CREATE TABLE public.evidence_multimodal_vectors (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    evidence_id uuid NOT NULL
        REFERENCES public.evidence(id) ON DELETE RESTRICT,
    source_revision text NOT NULL,
    analysis_revision text NOT NULL,
    modality text NOT NULL,
    source_locator jsonb NOT NULL,
    source_locator_sha256 text NOT NULL,
    embedding vector(768) NOT NULL,
    embedding_type text NOT NULL DEFAULT 'evidence_multimodal_semantic_768',
    model text NOT NULL,
    model_artifact_sha256 text NOT NULL,
    preprocessing_revision text NOT NULL,
    input_sha256 text NOT NULL,
    output_sha256 text NOT NULL,
    metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
    created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
    updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),

    CONSTRAINT evidence_multimodal_vectors_source_revision_ck
        CHECK (source_revision ~ '^sha256:[0-9a-f]{64}$'),
    CONSTRAINT evidence_multimodal_vectors_analysis_revision_ck
        CHECK (length(btrim(analysis_revision)) > 0),
    CONSTRAINT evidence_multimodal_vectors_modality_ck
        CHECK (modality IN ('image', 'video_frame', 'audio_segment', 'video_window')),
    CONSTRAINT evidence_multimodal_vectors_locator_ck
        CHECK (jsonb_typeof(source_locator) = 'object'),
    CONSTRAINT evidence_multimodal_vectors_locator_sha_ck
        CHECK (source_locator_sha256 ~ '^[0-9a-f]{64}$'),
    CONSTRAINT evidence_multimodal_vectors_embedding_type_ck
        CHECK (embedding_type = 'evidence_multimodal_semantic_768'),
    CONSTRAINT evidence_multimodal_vectors_model_ck
        CHECK (length(btrim(model)) > 0),
    CONSTRAINT evidence_multimodal_vectors_model_sha_ck
        CHECK (model_artifact_sha256 ~ '^sha256:[0-9a-f]{64}$'),
    CONSTRAINT evidence_multimodal_vectors_preprocessing_ck
        CHECK (length(btrim(preprocessing_revision)) > 0),
    CONSTRAINT evidence_multimodal_vectors_input_sha_ck
        CHECK (input_sha256 ~ '^sha256:[0-9a-f]{64}$'),
    CONSTRAINT evidence_multimodal_vectors_output_sha_ck
        CHECK (output_sha256 ~ '^sha256:[0-9a-f]{64}$'),
    CONSTRAINT evidence_multimodal_vectors_identity_uq
        UNIQUE (evidence_id, source_revision, analysis_revision, modality,
                source_locator_sha256, model_artifact_sha256, preprocessing_revision)
);

CREATE INDEX evidence_multimodal_vectors_hnsw_idx
    ON public.evidence_multimodal_vectors
    USING hnsw (embedding vector_cosine_ops);

CREATE INDEX evidence_multimodal_vectors_evidence_revision_idx
    ON public.evidence_multimodal_vectors
       (evidence_id, source_revision, analysis_revision, modality);

CREATE TABLE public.evidence_multimodal_vector_projection_outbox (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    evidence_multimodal_vector_id uuid NOT NULL
        REFERENCES public.evidence_multimodal_vectors(id) ON DELETE RESTRICT,
    qdrant_point_id uuid NOT NULL,
    projection_lane text NOT NULL,
    projection_contract_revision text NOT NULL,
    source_revision text NOT NULL,
    analysis_revision text NOT NULL,
    modality text NOT NULL,
    source_locator_sha256 text NOT NULL,
    model_artifact_sha256 text NOT NULL,
    preprocessing_revision text NOT NULL,
    input_sha256 text NOT NULL,
    output_sha256 text NOT NULL,
    status varchar(24) NOT NULL DEFAULT 'PENDING',
    attempt_count integer NOT NULL DEFAULT 0,
    max_attempts integer NOT NULL DEFAULT 8,
    available_at timestamptz NOT NULL DEFAULT clock_timestamp(),
    lease_token uuid,
    lease_expires_at timestamptz,
    last_error text,
    verification_receipt jsonb,
    completed_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
    updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),

    CONSTRAINT evidence_multimodal_vector_outbox_lane_ck
        CHECK (projection_lane = 'evidence_multimodal_semantic_768'),
    CONSTRAINT evidence_multimodal_vector_outbox_contract_ck
        CHECK (length(btrim(projection_contract_revision)) > 0),
    CONSTRAINT evidence_multimodal_vector_outbox_source_revision_ck
        CHECK (source_revision ~ '^sha256:[0-9a-f]{64}$'),
    CONSTRAINT evidence_multimodal_vector_outbox_analysis_revision_ck
        CHECK (length(btrim(analysis_revision)) > 0),
    CONSTRAINT evidence_multimodal_vector_outbox_modality_ck
        CHECK (modality IN ('image', 'video_frame', 'audio_segment', 'video_window')),
    CONSTRAINT evidence_multimodal_vector_outbox_locator_sha_ck
        CHECK (source_locator_sha256 ~ '^[0-9a-f]{64}$'),
    CONSTRAINT evidence_multimodal_vector_outbox_model_sha_ck
        CHECK (model_artifact_sha256 ~ '^sha256:[0-9a-f]{64}$'),
    CONSTRAINT evidence_multimodal_vector_outbox_preprocessing_ck
        CHECK (length(btrim(preprocessing_revision)) > 0),
    CONSTRAINT evidence_multimodal_vector_outbox_input_sha_ck
        CHECK (input_sha256 ~ '^sha256:[0-9a-f]{64}$'),
    CONSTRAINT evidence_multimodal_vector_outbox_output_sha_ck
        CHECK (output_sha256 ~ '^sha256:[0-9a-f]{64}$'),
    CONSTRAINT evidence_multimodal_vector_outbox_status_ck
        CHECK (status IN ('PENDING', 'PROCESSING', 'RETRY', 'COMPLETED', 'DEAD_LETTER')),
    CONSTRAINT evidence_multimodal_vector_outbox_attempts_ck
        CHECK (attempt_count >= 0 AND max_attempts > 0),
    CONSTRAINT evidence_multimodal_vector_outbox_lease_ck
        CHECK ((status = 'PROCESSING' AND lease_token IS NOT NULL AND lease_expires_at IS NOT NULL)
            OR (status <> 'PROCESSING' AND lease_token IS NULL AND lease_expires_at IS NULL)),
    CONSTRAINT evidence_multimodal_vector_outbox_completion_ck
        CHECK ((status = 'COMPLETED' AND completed_at IS NOT NULL AND verification_receipt IS NOT NULL)
            OR (status <> 'COMPLETED' AND completed_at IS NULL AND verification_receipt IS NULL)),
    CONSTRAINT evidence_multimodal_vector_outbox_identity_uq
        UNIQUE (evidence_multimodal_vector_id, projection_lane, projection_contract_revision)
);

CREATE INDEX evidence_multimodal_vector_outbox_dispatch_idx
    ON public.evidence_multimodal_vector_projection_outbox (available_at, created_at, id)
    WHERE status IN ('PENDING', 'RETRY');

CREATE INDEX evidence_multimodal_vector_outbox_lease_idx
    ON public.evidence_multimodal_vector_projection_outbox (lease_expires_at, id)
    WHERE status = 'PROCESSING';

-- Required writer invariant: insert/read back evidence_multimodal_vectors and its
-- outbox row in one PostgreSQL transaction. Qdrant publication is a later leased
-- projection step; never upsert directly from a media-analysis request/worker.
