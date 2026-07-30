-- Atlas Representations Registry
-- Bounded schema for semantic representations and their immediate evidence contracts.

BEGIN;

CREATE TABLE IF NOT EXISTS public.atlas_representations (
  representation_id text PRIMARY KEY,
  schema_version text NOT NULL DEFAULT 'atlas_representation_registry_v3',
  upstream_model_id text NOT NULL DEFAULT 'unknown',
  upstream_revision text NOT NULL DEFAULT 'unknown',
  tokenizer_revision text NOT NULL DEFAULT 'unknown',
  artifact_digest text NOT NULL DEFAULT 'unknown',
  native_dimensions integer NOT NULL CHECK (native_dimensions > 0),
  output_dimensions integer NOT NULL CHECK (output_dimensions > 0 AND output_dimensions <= native_dimensions),
  dimension_method text NOT NULL CHECK (dimension_method IN (
    'NATIVE',
    'MRL_TRUNCATE',
    'LINEAR_PROJECTION',
    'AUTOENCODER',
    'CUSTOM_MODEL_HEAD',
    'SLICE_FIRST_N',
    'UNKNOWN'
  )),
  normalization text NOT NULL CHECK (normalization IN ('L2', 'NONE')),
  pooling text NOT NULL DEFAULT 'UNKNOWN' CHECK (pooling IN ('MEAN', 'CLS', 'MAX', 'LAST', 'SUM', 'NONE', 'UNKNOWN')),
  quantization text NOT NULL DEFAULT 'UNKNOWN' CHECK (quantization IN ('f32', 'f16', 'bf16', 'int8', 'int4', 'q8_0', 'q4_0', 'UNKNOWN')),
  input_role text NOT NULL DEFAULT 'SYMMETRIC' CHECK (input_role IN ('QUERY', 'DOCUMENT', 'SYMMETRIC')),
  prompt_template_id text NOT NULL DEFAULT 'unknown',
  prompt_template_revision text NOT NULL DEFAULT 'unknown',
  max_input_tokens integer NOT NULL DEFAULT 0 CHECK (max_input_tokens >= 0),
  truncation_policy text NOT NULL DEFAULT 'END' CHECK (truncation_policy IN ('START', 'MIDDLE', 'END', 'SYMMETRIC')),
  lifecycle_status text NOT NULL DEFAULT 'CANDIDATE' CHECK (lifecycle_status IN ('CANDIDATE', 'ACTIVE', 'DEPRECATED', 'RETIRED')),
  verification_status text NOT NULL DEFAULT 'UNVERIFIED' CHECK (verification_status IN (
    'UNVERIFIED',
    'STATIC_VERIFIED',
    'SAMPLE_VERIFIED',
    'PRODUCTION_VERIFIED',
    'MISMATCH',
    'FAILED'
  )),
  created_at timestamptz NOT NULL DEFAULT now(),
  verified_at timestamptz,
  supersedes_representation_id text REFERENCES public.atlas_representations (representation_id) ON DELETE SET NULL,
  notes text,
  CONSTRAINT atlas_representation_not_self_superseding
    CHECK (supersedes_representation_id IS NULL OR supersedes_representation_id <> representation_id)
);

CREATE INDEX IF NOT EXISTS atlas_repr_lifecycle_verification_idx
  ON public.atlas_representations (lifecycle_status, verification_status);

CREATE INDEX IF NOT EXISTS atlas_repr_model_idx
  ON public.atlas_representations (upstream_model_id, upstream_revision);

CREATE INDEX IF NOT EXISTS atlas_repr_output_dim_idx
  ON public.atlas_representations (output_dimensions);

CREATE INDEX IF NOT EXISTS atlas_repr_supersedes_idx
  ON public.atlas_representations (supersedes_representation_id);

CREATE TABLE IF NOT EXISTS public.atlas_representation_providers (
  provider_id text PRIMARY KEY,
  representation_id text NOT NULL REFERENCES public.atlas_representations (representation_id) ON DELETE CASCADE,
  runtime_engine text NOT NULL CHECK (runtime_engine IN ('OLLAMA', 'ONNX', 'GRPC', 'HTTP', 'TEI', 'CUSTOM')),
  runtime_version text NOT NULL DEFAULT 'unknown',
  endpoint_url text NOT NULL,
  health_endpoint text NOT NULL DEFAULT '/health',
  api_dialect text NOT NULL CHECK (api_dialect IN (
    'OLLAMA_NATIVE',
    'OPENAI_COMPATIBLE',
    'ONNX_CUSTOM',
    'TEI',
    'GRPC',
    'CUSTOM'
  )),
  model_alias text NOT NULL DEFAULT 'unknown',
  runtime_artifact_digest text NOT NULL DEFAULT 'unknown',
  execution_device text NOT NULL CHECK (execution_device IN ('CPU', 'CUDA', 'HIP', 'METAL', 'MIXED', 'UNKNOWN')),
  priority integer NOT NULL DEFAULT 0 CHECK (priority >= 0),
  health_status text NOT NULL DEFAULT 'UNKNOWN' CHECK (health_status IN ('UNKNOWN', 'HEALTHY', 'DEGRADED', 'UNHEALTHY')),
  verified_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (representation_id, runtime_engine, endpoint_url, api_dialect)
);

CREATE INDEX IF NOT EXISTS atlas_provider_representation_idx
  ON public.atlas_representation_providers (representation_id);

CREATE INDEX IF NOT EXISTS atlas_provider_health_idx
  ON public.atlas_representation_providers (health_status);

CREATE TABLE IF NOT EXISTS public.atlas_representation_lane_selections (
  repository_id text NOT NULL,
  corpus_id text NOT NULL,
  artifact_view text NOT NULL,
  retrieval_lane text NOT NULL,
  workspace_revision text NOT NULL,
  representation_id text NOT NULL REFERENCES public.atlas_representations (representation_id) ON DELETE RESTRICT,
  is_primary boolean NOT NULL DEFAULT false,
  selected_at timestamptz NOT NULL DEFAULT now(),
  selected_by text,
  selection_reason text,
  evidence_jsonb jsonb,
  notes text,
  PRIMARY KEY (repository_id, corpus_id, artifact_view, retrieval_lane, workspace_revision, representation_id)
);

CREATE UNIQUE INDEX IF NOT EXISTS atlas_lane_selection_primary_scope_idx
  ON public.atlas_representation_lane_selections (repository_id, corpus_id, artifact_view, retrieval_lane, workspace_revision)
  WHERE is_primary = true;

CREATE INDEX IF NOT EXISTS atlas_lane_selection_repr_idx
  ON public.atlas_representation_lane_selections (representation_id);

CREATE TABLE IF NOT EXISTS public.atlas_representation_provider_fallbacks (
  provider_id text NOT NULL REFERENCES public.atlas_representation_providers (provider_id) ON DELETE CASCADE,
  fallback_provider_id text NOT NULL REFERENCES public.atlas_representation_providers (provider_id) ON DELETE CASCADE,
  compatibility_kind text NOT NULL CHECK (compatibility_kind IN (
    'BITWISE_EQUIVALENT',
    'NUMERICALLY_EQUIVALENT',
    'RETRIEVAL_COMPATIBLE',
    'REINDEX_REQUIRED'
  )),
  evaluation_run_id text,
  proof_jsonb jsonb,
  requires_reindex boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (provider_id, fallback_provider_id),
  CONSTRAINT atlas_provider_fallback_not_self CHECK (provider_id <> fallback_provider_id)
);

CREATE INDEX IF NOT EXISTS atlas_provider_fallback_provider_idx
  ON public.atlas_representation_provider_fallbacks (provider_id);

CREATE TABLE IF NOT EXISTS public.atlas_retrieval_lane_fallbacks (
  repository_id text NOT NULL,
  corpus_id text NOT NULL,
  artifact_view text NOT NULL,
  retrieval_lane text NOT NULL,
  workspace_revision text NOT NULL,
  primary_representation_id text NOT NULL REFERENCES public.atlas_representations (representation_id) ON DELETE RESTRICT,
  fallback_representation_id text NOT NULL REFERENCES public.atlas_representations (representation_id) ON DELETE RESTRICT,
  fallback_collection_name text NOT NULL,
  fallback_vector_name text NOT NULL,
  fallback_requires_rerank boolean NOT NULL DEFAULT true,
  compatibility_kind text NOT NULL CHECK (compatibility_kind IN (
    'BITWISE_EQUIVALENT',
    'NUMERICALLY_EQUIVALENT',
    'RETRIEVAL_COMPATIBLE',
    'REINDEX_REQUIRED'
  )),
  evaluation_run_id text,
  proof_jsonb jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (repository_id, corpus_id, artifact_view, retrieval_lane, workspace_revision, fallback_representation_id),
  CONSTRAINT atlas_lane_fallback_not_self CHECK (primary_representation_id <> fallback_representation_id)
);

CREATE INDEX IF NOT EXISTS atlas_lane_fallback_primary_idx
  ON public.atlas_retrieval_lane_fallbacks (primary_representation_id, fallback_representation_id);

CREATE INDEX IF NOT EXISTS atlas_lane_fallback_scope_idx
  ON public.atlas_retrieval_lane_fallbacks (artifact_view, retrieval_lane, workspace_revision);

CREATE TABLE IF NOT EXISTS public.atlas_representation_migrations (
  migration_id text PRIMARY KEY,
  repository_id text NOT NULL,
  corpus_id text NOT NULL,
  workspace_revision text NOT NULL,
  source_representation_id text NOT NULL REFERENCES public.atlas_representations (representation_id) ON DELETE RESTRICT,
  target_representation_id text NOT NULL REFERENCES public.atlas_representations (representation_id) ON DELETE RESTRICT,
  migration_status text NOT NULL DEFAULT 'PLANNED' CHECK (migration_status IN ('PLANNED', 'IN_PROGRESS', 'COMPLETED', 'ROLLED_BACK', 'ABORTED')),
  reason text NOT NULL,
  dataset_revision text NOT NULL DEFAULT 'unknown',
  planned_at timestamptz NOT NULL DEFAULT now(),
  started_at timestamptz,
  completed_at timestamptz,
  requires_reindex boolean NOT NULL DEFAULT true,
  notes text,
  CONSTRAINT atlas_representation_migration_not_self CHECK (source_representation_id <> target_representation_id)
);

CREATE INDEX IF NOT EXISTS atlas_representation_migration_pair_idx
  ON public.atlas_representation_migrations (source_representation_id, target_representation_id);

CREATE INDEX IF NOT EXISTS atlas_representation_migration_status_idx
  ON public.atlas_representation_migrations (migration_status);

CREATE TABLE IF NOT EXISTS public.atlas_qdrant_collection_mappings (
  collection_name text NOT NULL,
  vector_name text NOT NULL,
  representation_id text NOT NULL REFERENCES public.atlas_representations (representation_id) ON DELETE RESTRICT,
  dimensions integer NOT NULL CHECK (dimensions > 0),
  distance_metric text NOT NULL CHECK (distance_metric IN ('Cosine', 'Dot', 'Euclid')),
  payload_schema_version text NOT NULL,
  workspace_revision text NOT NULL,
  is_primary boolean NOT NULL DEFAULT true,
  verification_status text NOT NULL DEFAULT 'UNMAPPED' CHECK (verification_status IN (
    'DIMENSION_CONFIRMED_PROVENANCE_UNKNOWN',
    'PROVENANCE_CONFIRMED',
    'PAYLOAD_MIXED',
    'REGISTRY_MISMATCH',
    'UNMAPPED',
    'SOURCE_PARITY_MISMATCH'
  )),
  verified_at timestamptz,
  verified_dimensions integer,
  payload_sample_verified boolean NOT NULL DEFAULT false,
  provenance_source text CHECK (provenance_source IN (
    'COLLECTION_CONFIG',
    'NAMED_VECTOR_CONFIG',
    'PAYLOAD_REPRESENTATION_ID',
    'SOURCE_ARTIFACT',
    'MODEL_LINEAGE',
    'COLLECTION_NAME_PATTERN'
  )),
  details_jsonb jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (collection_name, vector_name),
  UNIQUE (collection_name, vector_name)
);

CREATE INDEX IF NOT EXISTS atlas_qdrant_repr_idx
  ON public.atlas_qdrant_collection_mappings (representation_id);

CREATE INDEX IF NOT EXISTS atlas_qdrant_verification_idx
  ON public.atlas_qdrant_collection_mappings (verification_status);

CREATE TABLE IF NOT EXISTS public.atlas_representation_compatibility_evaluations (
  evaluation_run_id text PRIMARY KEY,
  source_representation_id text NOT NULL REFERENCES public.atlas_representations (representation_id) ON DELETE RESTRICT,
  target_representation_id text NOT NULL REFERENCES public.atlas_representations (representation_id) ON DELETE RESTRICT,
  compatibility_kind text NOT NULL CHECK (compatibility_kind IN (
    'BITWISE_EQUIVALENT',
    'NUMERICALLY_EQUIVALENT',
    'RETRIEVAL_COMPATIBLE',
    'REINDEX_REQUIRED'
  )),
  sample_count integer NOT NULL DEFAULT 0 CHECK (sample_count >= 0),
  max_cosine_delta double precision,
  mean_cosine_similarity double precision,
  minimum_recall_ratio double precision,
  ndcg_delta double precision,
  requires_reindex boolean NOT NULL DEFAULT false,
  dataset_revision text NOT NULL DEFAULT 'unknown',
  details_jsonb jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT atlas_compatibility_eval_not_self CHECK (source_representation_id <> target_representation_id)
);

CREATE INDEX IF NOT EXISTS atlas_compatibility_eval_pair_idx
  ON public.atlas_representation_compatibility_evaluations (source_representation_id, target_representation_id);

CREATE TABLE IF NOT EXISTS public.atlas_representation_validation_results (
  validation_result_id text PRIMARY KEY,
  representation_id text NOT NULL REFERENCES public.atlas_representations (representation_id) ON DELETE CASCADE,
  provider_id text REFERENCES public.atlas_representation_providers (provider_id) ON DELETE SET NULL,
  validation_kind text NOT NULL CHECK (validation_kind IN (
    'STATIC_SCHEMA',
    'PROVIDER_HEALTH',
    'MODEL_IDENTITY',
    'DIMENSION',
    'NORMALIZATION',
    'PAIRED_OUTPUT',
    'QDRANT_CONFIG',
    'QDRANT_PAYLOAD',
    'SOURCE_PARITY',
    'RETRIEVAL_EVALUATION'
  )),
  outcome text NOT NULL CHECK (outcome IN ('PASS', 'WARN', 'FAIL')),
  observed_dimensions integer CHECK (observed_dimensions IS NULL OR observed_dimensions > 0),
  observed_norm double precision,
  finite_values boolean NOT NULL DEFAULT true,
  model_identity text,
  runtime_version text,
  sample_count integer NOT NULL DEFAULT 0 CHECK (sample_count >= 0),
  details_jsonb jsonb,
  observed_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS atlas_validation_repr_kind_idx
  ON public.atlas_representation_validation_results (representation_id, validation_kind);

CREATE OR REPLACE FUNCTION public.atlas_representations_immutable_check()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD.verification_status = 'PRODUCTION_VERIFIED' THEN
    IF OLD.upstream_model_id IS DISTINCT FROM NEW.upstream_model_id
       OR OLD.upstream_revision IS DISTINCT FROM NEW.upstream_revision
       OR OLD.tokenizer_revision IS DISTINCT FROM NEW.tokenizer_revision
       OR OLD.output_dimensions IS DISTINCT FROM NEW.output_dimensions
       OR OLD.dimension_method IS DISTINCT FROM NEW.dimension_method
       OR OLD.normalization IS DISTINCT FROM NEW.normalization
       OR OLD.pooling IS DISTINCT FROM NEW.pooling
       OR OLD.prompt_template_id IS DISTINCT FROM NEW.prompt_template_id
       OR OLD.prompt_template_revision IS DISTINCT FROM NEW.prompt_template_revision
       OR OLD.input_role IS DISTINCT FROM NEW.input_role
       OR OLD.max_input_tokens IS DISTINCT FROM NEW.max_input_tokens
       OR OLD.truncation_policy IS DISTINCT FROM NEW.truncation_policy
    THEN
      RAISE EXCEPTION
        'Cannot mutate production-verified representation %',
        OLD.representation_id;
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS atlas_representations_immutable_trigger ON public.atlas_representations;

CREATE TRIGGER atlas_representations_immutable_trigger
  BEFORE UPDATE ON public.atlas_representations
  FOR EACH ROW EXECUTE FUNCTION public.atlas_representations_immutable_check();

INSERT INTO public.atlas_representations (
  representation_id,
  schema_version,
  upstream_model_id,
  upstream_revision,
  tokenizer_revision,
  artifact_digest,
  native_dimensions,
  output_dimensions,
  dimension_method,
  normalization,
  pooling,
  quantization,
  input_role,
  prompt_template_id,
  prompt_template_revision,
  max_input_tokens,
  truncation_policy,
  lifecycle_status,
  verification_status,
  notes
) VALUES
(
  'semantic_768',
  'atlas_representation_registry_v3',
  'google/embeddinggemma-300m',
  'unknown',
  'unknown',
  'unknown',
  768,
  768,
  'NATIVE',
  'L2',
  'MEAN',
  'UNKNOWN',
  'SYMMETRIC',
  'unknown',
  'unknown',
  0,
  'END',
  'CANDIDATE',
  'UNVERIFIED',
  'Canonical semantic lane; promotion must wait for runtime evidence.'
),
(
  'semantic_512',
  'atlas_representation_registry_v3',
  'google/embeddinggemma-300m',
  'unknown',
  'unknown',
  'unknown',
  768,
  512,
  'UNKNOWN',
  'L2',
  'MEAN',
  'UNKNOWN',
  'SYMMETRIC',
  'unknown',
  'unknown',
  0,
  'END',
  'CANDIDATE',
  'UNVERIFIED',
  'Candidate 512 lane; evidence for derivation is not yet recorded.'
),
(
  'semantic_384',
  'atlas_representation_registry_v3',
  'google/embeddinggemma-300m',
  'unknown',
  'unknown',
  'unknown',
  768,
  384,
  'UNKNOWN',
  'L2',
  'MEAN',
  'UNKNOWN',
  'SYMMETRIC',
  'unknown',
  'unknown',
  0,
  'END',
  'CANDIDATE',
  'UNVERIFIED',
  'Legacy routing lane retained as reference only.'
),
(
  'topology_128',
  'atlas_representation_registry_v3',
  'atlas/topology-features',
  'unknown',
  'unknown',
  'unknown',
  128,
  128,
  'UNKNOWN',
  'L2',
  'MEAN',
  'UNKNOWN',
  'SYMMETRIC',
  'unknown',
  'unknown',
  0,
  'END',
  'CANDIDATE',
  'UNVERIFIED',
  'Structural and graph lane for dependency, community, and routing features.'
),
(
  'latent_64',
  'atlas_representation_registry_v3',
  'atlas/latent-routing',
  'unknown',
  'unknown',
  'unknown',
  64,
  64,
  'UNKNOWN',
  'L2',
  'MEAN',
  'UNKNOWN',
  'SYMMETRIC',
  'unknown',
  'unknown',
  0,
  'END',
  'CANDIDATE',
  'UNVERIFIED',
  'Compressed latent routing lane for clustering and SOM routing.'
)
ON CONFLICT (representation_id) DO NOTHING;

COMMIT;
