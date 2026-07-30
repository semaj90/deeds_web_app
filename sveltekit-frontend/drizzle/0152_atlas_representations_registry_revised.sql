-- Phase 110 Representation Infrastructure Registry (Revised)
--
-- Canonical source of truth for all embedding representations with complete lifecycle,
-- verification, and deployment tracking. Separates semantic identity from runtime deployment
-- and distinguishes lifecycle status (CANDIDATE→ACTIVE→DEPRECATED→RETIRED) from verification
-- status (UNVERIFIED→STATIC_VERIFIED→SAMPLE_VERIFIED→PRODUCTION_VERIFIED).
--
-- This revised migration includes all 10 corrections from PHASE-110-REPRESENTATION-SCHEMA-CORRECTIONS.md
--
-- Issue 1: Split is_active into lifecycle_status + verification_status
-- Issue 2: Add per-lane selection tracking
-- Issue 3: Split fallbacks into three tables (provider/lane/migration)
-- Issue 4: Move endpoint_url to separate provider table
-- Issue 5: Extend model identity precision
-- Issue 6: Add input contract tracking
-- Issue 7: Support named vectors in Qdrant mappings
-- Issue 8: Add normalization proof validation
-- Issue 9: Add audit hierarchy for classification
-- Issue 10: Add immutability trigger for PRODUCTION_VERIFIED representations

BEGIN;

-- ============================================================================
-- CORE: Master Registry for Embedding Representations (Revised)
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.atlas_representations (
  representation_id text PRIMARY KEY,

  -- ========================================================================
  -- Model Identity (Issue 5: Precision)
  -- ========================================================================

  -- Canonical upstream model identifier (e.g., 'google/embeddinggemma-300m')
  upstream_model_id text NOT NULL DEFAULT 'unknown',

  -- Resolved model revision (commit hash, not 'latest')
  upstream_revision text NOT NULL DEFAULT 'unknown',

  -- Deployment-specific model version (e.g., 'ollama_latest_as_of_2026_07_29')
  model_revision text NOT NULL,

  model_source text NOT NULL CHECK (model_source IN (
    'huggingface', 'google', 'anthropic', 'custom', 'unknown'
  )),

  -- Quantization applied to the model weights
  quantization text DEFAULT 'f32' CHECK (quantization IN (
    'f32', 'f16', 'bf16', 'int8', 'int4', 'q8_0', 'q4_0', 'custom', 'unknown'
  )),

  -- SHA256 of tokenizer configuration for reproducibility
  tokenizer_digest text,

  -- ========================================================================
  -- Dimension Contract
  -- ========================================================================

  native_dimensions integer NOT NULL CHECK (native_dimensions > 0),
  output_dimensions integer NOT NULL CHECK (output_dimensions > 0),

  -- How we got from native to output
  dimension_method text NOT NULL CHECK (dimension_method IN (
    'NATIVE',              -- No transformation
    'MRL_TRUNCATE',        -- Official Matryoshka Representation Learning truncation
    'LINEAR_PROJECTION',   -- Matrix projection
    'AUTOENCODER',         -- Neural network compression
    'CUSTOM_MODEL_HEAD',   -- Custom output layer
    'SLICE_FIRST_N',       -- Slice first N dimensions
    'UNKNOWN'              -- Provenance not yet established
  )),

  normalization text NOT NULL CHECK (normalization IN ('L2', 'NONE')),

  -- ========================================================================
  -- Input Contract (Issue 6)
  -- ========================================================================

  -- Whether this representation handles query/document/both
  input_role text NOT NULL DEFAULT 'SYMMETRIC' CHECK (input_role IN (
    'QUERY',      -- Optimized for query embedding
    'DOCUMENT',   -- Optimized for document embedding
    'SYMMETRIC'   -- Same representation for both
  )),

  -- Reference to registered prompt template (see atlas_prompt_templates)
  prompt_template_id text,

  -- Maximum input tokens before truncation
  max_input_tokens integer,

  -- How truncation is applied
  truncation_policy text DEFAULT 'END' CHECK (truncation_policy IN (
    'START', 'MIDDLE', 'END', 'SYMMETRIC'
  )),

  -- ========================================================================
  -- Runtime (Semantic, not Deployment)
  -- ========================================================================

  runtime text NOT NULL CHECK (runtime IN (
    'ollama_cpu',
    'ollama_gpu',
    'onnx_cpu',
    'onnx_cuda',
    'onnx_tensorrt',
    'grpc_service',
    'http_service',
    'unknown'
  )),

  -- ========================================================================
  -- Lifecycle & Verification Status (Issue 1: Separated)
  -- ========================================================================

  -- Semantic lifecycle: CANDIDATE (registered, unproven) → ACTIVE (approved for use)
  -- → DEPRECATED (retired, read-only) → RETIRED (removed, archive-only)
  lifecycle_status text NOT NULL DEFAULT 'CANDIDATE' CHECK (lifecycle_status IN (
    'CANDIDATE', 'ACTIVE', 'DEPRECATED', 'RETIRED'
  )),

  -- Verification level: UNVERIFIED → STATIC_VERIFIED → SAMPLE_VERIFIED
  -- → PRODUCTION_VERIFIED (or MISMATCH/FAILED on failure)
  verification_status text NOT NULL DEFAULT 'UNVERIFIED' CHECK (verification_status IN (
    'UNVERIFIED',
    'STATIC_VERIFIED',        -- Schema/config consistency checked
    'SAMPLE_VERIFIED',        -- Empirically tested on sample data
    'PRODUCTION_VERIFIED',    -- Proven in production use
    'MISMATCH',               -- Contract mismatch detected (e.g., actual dims ≠ claimed)
    'FAILED'                  -- Evaluation failed or quality regression
  )),

  -- ========================================================================
  -- Verification Audit Trail
  -- ========================================================================

  registered_at timestamptz NOT NULL DEFAULT now(),

  verified_at timestamptz,
  verified_by text,
  verified_method text CHECK (verified_method IN (
    'HEALTH_CHECK',        -- /health endpoint returned matching contract
    'SAMPLE_ROUND_TRIP',   -- Embedded sample and verified dimensions/normalization
    'PRODUCTION_LIVE',     -- Currently serving production traffic
    'STATIC_ONLY'          -- Schema validation only
  )),

  -- ========================================================================
  -- Metadata & Audit
  -- ========================================================================

  metadata jsonb,
  notes text,

  -- Immutability tracking (used by trigger)
  locked_after_production_verification boolean DEFAULT false,
  last_verified_output_norm double precision
    COMMENT 'Last verified actual L2 norm (should be ~1.0 if normalization=L2)'
);

-- Indexes for common queries
CREATE INDEX CONCURRENTLY IF NOT EXISTS atlas_repr_lifecycle_verification_idx
  ON public.atlas_representations (lifecycle_status, verification_status)
  WHERE lifecycle_status = 'ACTIVE' AND verification_status != 'UNVERIFIED';

CREATE INDEX CONCURRENTLY IF NOT EXISTS atlas_repr_model_idx
  ON public.atlas_representations (upstream_model_id, upstream_revision);

CREATE INDEX CONCURRENTLY IF NOT EXISTS atlas_repr_output_dim_idx
  ON public.atlas_representations (output_dimensions);

CREATE INDEX CONCURRENTLY IF NOT EXISTS atlas_repr_runtime_idx
  ON public.atlas_representations (runtime, lifecycle_status);

CREATE INDEX CONCURRENTLY IF NOT EXISTS atlas_repr_input_role_idx
  ON public.atlas_representations (input_role);

-- ============================================================================
-- ISSUE 6: Prompt Templates
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.atlas_prompt_templates (
  template_id text PRIMARY KEY,
  model_id text NOT NULL,
  template_version text NOT NULL,

  query_template text
    COMMENT 'Template for query embedding (e.g., "task: search_result query: {text}")' ,
  document_template text
    COMMENT 'Template for document embedding (e.g., "title: {title} text: {text}")' ,

  instructions text
    COMMENT 'Explanation of why these templates are used' ,
  verified_at timestamptz,

  UNIQUE (model_id, template_version)
);

-- ============================================================================
-- ISSUE 2: Per-Lane Selection Tracking
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.atlas_representation_lane_selections (
  repository_id text NOT NULL,
  corpus_id text NOT NULL,
  artifact_view text NOT NULL,      -- 'code_semantic', 'doc_summary', 'topology_latent', etc.
  retrieval_lane text NOT NULL,     -- 'dense_aann', 'sparse_bm25', 'hybrid_rrf'
  workspace_revision text NOT NULL,

  representation_id text NOT NULL REFERENCES public.atlas_representations (representation_id)
    ON DELETE RESTRICT,

  selected_at timestamptz NOT NULL DEFAULT now(),
  selected_by text,                 -- operator name or decision rationale
  evaluation_notes text,

  PRIMARY KEY (repository_id, corpus_id, artifact_view, retrieval_lane, workspace_revision),
  UNIQUE (repository_id, corpus_id, artifact_view, retrieval_lane, workspace_revision)
);

CREATE INDEX CONCURRENTLY IF NOT EXISTS atlas_lane_selection_repr_idx
  ON public.atlas_representation_lane_selections (representation_id);

CREATE INDEX CONCURRENTLY IF NOT EXISTS atlas_lane_selection_view_idx
  ON public.atlas_representation_lane_selections (artifact_view, retrieval_lane);

-- ============================================================================
-- ISSUE 4: Provider Table (Runtime Deployment, Not Semantic)
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.atlas_representation_providers (
  provider_id text PRIMARY KEY,     -- e.g., 'ollama_local', 'onnx_cuda_1', 'grpc_remote'

  representation_id text NOT NULL REFERENCES public.atlas_representations (representation_id)
    ON DELETE CASCADE,

  -- Deployment specifics (NOT semantic identity)
  runtime_engine text NOT NULL CHECK (runtime_engine IN (
    'ollama', 'onnx', 'grpc', 'http', 'tei', 'custom'
  )),

  execution_device text NOT NULL CHECK (execution_device IN (
    'cpu', 'cuda', 'hip', 'metal', 'mixed', 'unknown'
  )),

  endpoint_url text NOT NULL,

  -- API dialect at this endpoint
  api_dialect text NOT NULL CHECK (api_dialect IN (
    'ollama_native', 'openai_compatible', 'tei', 'custom'
  )),

  -- Model name as referenced at this endpoint
  model_alias text,

  -- Runtime software version
  runtime_version text,

  -- SHA256 of model artifact for reproducibility
  artifact_digest text,

  -- Health & availability
  health_status text DEFAULT 'UNKNOWN' CHECK (health_status IN (
    'HEALTHY', 'UNHEALTHY', 'UNKNOWN'
  )),

  last_health_check timestamptz,
  health_check_failure_count integer DEFAULT 0,

  -- Deployment metadata
  deployment_priority integer DEFAULT 0,   -- Higher priority tried first
  is_preferred boolean DEFAULT false,

  created_at timestamptz NOT NULL DEFAULT now(),
  retired_at timestamptz,

  UNIQUE (representation_id, provider_id)
);

CREATE INDEX CONCURRENTLY IF NOT EXISTS atlas_provider_representation_idx
  ON public.atlas_representation_providers (representation_id);

CREATE INDEX CONCURRENTLY IF NOT EXISTS atlas_provider_health_idx
  ON public.atlas_representation_providers (health_status)
  WHERE health_status != 'UNKNOWN';

CREATE INDEX CONCURRENTLY IF NOT EXISTS atlas_provider_endpoint_idx
  ON public.atlas_representation_providers (endpoint_url);

-- ============================================================================
-- ISSUE 3a: Provider Fallback (Runtime Switching)
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.atlas_representation_provider_fallbacks (
  representation_id text NOT NULL REFERENCES public.atlas_representations (representation_id)
    ON DELETE CASCADE,
  fallback_provider_id text NOT NULL,   -- e.g., 'ollama_local', 'onnx_cuda', 'grpc_remote'

  -- Vector space compatibility classification
  compatibility_kind text NOT NULL CHECK (compatibility_kind IN (
    'BITWISE_EQUIVALENT',       -- Exact same coordinates (quantization can differ)
    'NUMERICALLY_EQUIVALENT',   -- Same vectors within precision
    'RETRIEVAL_COMPATIBLE',     -- Functionally equivalent for search (empirically proven)
    'REQUIRES_RERANK'           -- Must re-rank results due to subtle drift
  )),

  -- Empirical proof (required for RETRIEVAL_COMPATIBLE)
  max_cosine_delta double precision,              -- Max observed similarity delta
  minimum_recall_ratio double precision,          -- Minimum Recall@K vs primary (e.g., 0.95)

  -- Reference to evaluation that proved compatibility
  evaluation_run_id text,
  evaluation_timestamp timestamptz,
  evaluation_query_count integer,
  evaluation_corpus_snapshot text,

  verified_at timestamptz,
  verified_by text,

  PRIMARY KEY (representation_id, fallback_provider_id),

  CONSTRAINT valid_empirical CHECK (
    compatibility_kind IN ('BITWISE_EQUIVALENT', 'NUMERICALLY_EQUIVALENT')
    OR (max_cosine_delta IS NOT NULL AND minimum_recall_ratio IS NOT NULL)
  )
);

CREATE INDEX CONCURRENTLY IF NOT EXISTS atlas_provider_fallback_idx
  ON public.atlas_representation_provider_fallbacks (representation_id);

-- ============================================================================
-- ISSUE 3b: Retrieval Lane Fallback (Collection Switching)
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.atlas_retrieval_lane_fallbacks (
  repository_id text NOT NULL,
  corpus_id text NOT NULL,
  artifact_view text NOT NULL,
  retrieval_lane text NOT NULL,

  primary_representation_id text NOT NULL REFERENCES public.atlas_representations (representation_id)
    ON DELETE RESTRICT,
  fallback_representation_id text NOT NULL REFERENCES public.atlas_representations (representation_id)
    ON DELETE RESTRICT,

  -- Lane fallback requires a separate collection and reranking
  fallback_collection_name text NOT NULL,
  fallback_requires_rerank boolean NOT NULL DEFAULT true,

  -- Compatibility proof
  retrieval_compatible boolean NOT NULL DEFAULT false,
  max_recall_regression_ratio double precision,   -- (fallback / primary) ≥ threshold
  minimum_ncdg_threshold double precision,        -- Minimum acceptable nDCG@K

  evaluation_run_id text,
  evaluation_timestamp timestamptz,

  verified_at timestamptz,
  verified_by text,

  PRIMARY KEY (repository_id, corpus_id, artifact_view, retrieval_lane, fallback_representation_id),

  CONSTRAINT retrieval_compatible_requires_proof CHECK (
    NOT retrieval_compatible
    OR (max_recall_regression_ratio IS NOT NULL AND evaluation_run_id IS NOT NULL)
  )
);

CREATE INDEX CONCURRENTLY IF NOT EXISTS atlas_lane_fallback_repr_idx
  ON public.atlas_retrieval_lane_fallbacks (primary_representation_id, fallback_representation_id);

CREATE INDEX CONCURRENTLY IF NOT EXISTS atlas_lane_fallback_view_idx
  ON public.atlas_retrieval_lane_fallbacks (artifact_view, retrieval_lane);

-- ============================================================================
-- ISSUE 3c: Representation Migration (Planned Reindexing)
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.atlas_representation_migrations (
  migration_id text PRIMARY KEY,   -- e.g., '384_to_768_2026_jul'

  source_representation_id text NOT NULL REFERENCES public.atlas_representations (representation_id)
    ON DELETE RESTRICT,
  target_representation_id text NOT NULL REFERENCES public.atlas_representations (representation_id)
    ON DELETE RESTRICT,

  repository_id text NOT NULL,
  corpus_id text NOT NULL,

  migration_status text NOT NULL DEFAULT 'PLANNED' CHECK (migration_status IN (
    'PLANNED', 'IN_PROGRESS', 'COMPLETED', 'ROLLED_BACK', 'ABORTED'
  )),

  reason text NOT NULL,   -- 'Quality improvement', 'Cost reduction', 'Deprecation', etc.

  -- Timeline
  planned_start_date timestamptz,
  actual_start_timestamp timestamptz,
  actual_completion_timestamp timestamptz,

  -- Pre-migration quality baseline
  baseline_recall_at_5 double precision,
  baseline_recall_at_10 double precision,
  baseline_ncdg_at_5 double precision,
  baseline_latency_ms double precision,

  -- Post-migration quality
  post_recall_at_5 double precision,
  post_recall_at_10 double precision,
  post_ncdg_at_5 double precision,
  post_latency_ms double precision,

  -- Regression gating
  maximum_allowed_recall_regression double precision DEFAULT 0.05,  -- 5% drop acceptable
  migration_approved_at timestamptz,
  migration_approved_by text,

  notes text,

  CONSTRAINT valid_completed CHECK (
    migration_status != 'COMPLETED'
    OR actual_completion_timestamp IS NOT NULL
  )
);

CREATE INDEX CONCURRENTLY IF NOT EXISTS atlas_migration_status_idx
  ON public.atlas_representation_migrations (migration_status)
  WHERE migration_status IN ('PLANNED', 'IN_PROGRESS');

CREATE INDEX CONCURRENTLY IF NOT EXISTS atlas_migration_repr_idx
  ON public.atlas_representation_migrations (source_representation_id, target_representation_id);

-- ============================================================================
-- ISSUE 7: Qdrant Vector Mappings (Extended for Named Vectors)
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.atlas_qdrant_vector_mappings (
  collection_name text NOT NULL,

  -- Vector field within the collection (e.g., 'content', 'semantic', 'summary', 'topology')
  vector_field_name text NOT NULL DEFAULT 'content',

  representation_id text NOT NULL REFERENCES public.atlas_representations (representation_id)
    ON DELETE RESTRICT,

  -- Whether this is the primary or secondary representation for this vector field
  is_primary boolean NOT NULL DEFAULT true,

  created_at timestamptz NOT NULL DEFAULT now(),

  -- Readback verification (actual dimension check against live Qdrant)
  last_verified_at timestamptz,
  last_verified_dimensions integer,

  verification_status text CHECK (verification_status IN (
    'VERIFIED_MATCH',
    'VERIFIED_MISMATCH',
    'UNVERIFIED'
  )) DEFAULT 'UNVERIFIED',

  -- Issue 7: Named vector support
  actual_point_count integer
    COMMENT 'Verified count via Qdrant scroll API',

  payload_sample_verified boolean DEFAULT false
    COMMENT 'Have we sampled and verified payload structure?',

  -- Issue 9: Audit hierarchy for classification
  dimension_confirmed_at timestamptz
    COMMENT 'When config dimensions were last verified',

  provenance_source text CHECK (provenance_source IN (
    'COLLECTION_CONFIG',        -- Strongest: from Qdrant collection config
    'NAMED_VECTOR_CONFIG',      -- From Qdrant named vector config
    'PAYLOAD_REPRESENTATION_ID', -- From payload representation_id field
    'SOURCE_ARTIFACT',          -- From source embedding record
    'MODEL_LINEAGE',            -- From model run lineage
    'COLLECTION_NAME_PATTERN'   -- Weakest: inferred from name heuristic
  )),

  classification text CHECK (classification IN (
    'DIMENSION_CONFIRMED_PROVENANCE_UNKNOWN',
    'PROVENANCE_CONFIRMED_DIMENSION_UNKNOWN',
    'PAYLOAD_MIXED',
    'REGISTRY_MISMATCH',
    'UNMAPPED'
  )),

  PRIMARY KEY (collection_name, vector_field_name, representation_id),
  CONSTRAINT unique_primary_vector_per_field CHECK (
    NOT is_primary
    OR NOT EXISTS (
      SELECT 1 FROM public.atlas_qdrant_vector_mappings m2
      WHERE m2.collection_name = collection_name
        AND m2.vector_field_name = vector_field_name
        AND m2.is_primary = true
        AND m2.representation_id != representation_id
    )
  )
);

CREATE INDEX CONCURRENTLY IF NOT EXISTS atlas_qdrant_repr_idx
  ON public.atlas_qdrant_vector_mappings (representation_id);

CREATE INDEX CONCURRENTLY IF NOT EXISTS atlas_qdrant_collection_idx
  ON public.atlas_qdrant_vector_mappings (collection_name, vector_field_name);

CREATE INDEX CONCURRENTLY IF NOT EXISTS atlas_qdrant_verification_idx
  ON public.atlas_qdrant_vector_mappings (verification_status)
  WHERE verification_status != 'VERIFIED_MATCH';

CREATE INDEX CONCURRENTLY IF NOT EXISTS atlas_qdrant_provenance_idx
  ON public.atlas_qdrant_vector_mappings (provenance_source);

-- ============================================================================
-- ISSUE 10: Immutability Trigger (Prevent Semantic Field Mutation After Production Verified)
-- ============================================================================

CREATE OR REPLACE FUNCTION atlas_representations_immutable_check() RETURNS TRIGGER AS $$
BEGIN
  IF OLD.verification_status = 'PRODUCTION_VERIFIED' THEN
    IF OLD.model_revision != NEW.model_revision
       OR OLD.output_dimensions != NEW.output_dimensions
       OR OLD.dimension_method != NEW.dimension_method
       OR OLD.normalization != NEW.normalization
       OR OLD.quantization != NEW.quantization
       OR OLD.upstream_revision != NEW.upstream_revision
    THEN
      RAISE EXCEPTION
        'Cannot modify semantic fields of PRODUCTION_VERIFIED representation %s. '
        'Create a new representation_id for semantic changes.',
        OLD.representation_id;
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER atlas_representations_immutable_trigger
  BEFORE UPDATE ON public.atlas_representations
  FOR EACH ROW EXECUTE FUNCTION atlas_representations_immutable_check();

-- ============================================================================
-- SEED DATA: Initial Registrations (Issue 1: CANDIDATE + UNVERIFIED Status)
-- ============================================================================

INSERT INTO public.atlas_representations (
  representation_id,
  upstream_model_id,
  upstream_revision,
  model_revision,
  model_source,
  quantization,
  native_dimensions,
  output_dimensions,
  dimension_method,
  normalization,
  input_role,
  runtime,
  lifecycle_status,
  verification_status,
  notes
) VALUES
-- EmbeddingGemma 768-dim (native, canonical candidate)
(
  'embeddinggemma_300m_768_native_ollama_v1',
  'google/embeddinggemma-300m',
  'main',
  'ollama_latest_as_of_2026_07_29',
  'google',
  'q8_0',
  768,
  768,
  'NATIVE',
  'L2',
  'SYMMETRIC',
  'ollama_cpu',
  'CANDIDATE',
  'UNVERIFIED',
  'Official EmbeddingGemma native output via Ollama. '
  'Leading candidate for Phase 110 primary semantic lane. '
  'Pending runtime probing (Phase 1), paired output testing (Phase 2), and retrieval ablation (Phase 5). '
  'No canonical status claimed until PRODUCTION_VERIFIED.'
),

-- EmbeddingGemma 384-dim custom (deprecated, no provenance)
(
  'embeddinggemma_300m_384_custom_onnx_v1',
  'google/embeddinggemma-300m',
  'unknown',
  'custom_onnx_deployed_date_unknown',
  'custom',
  'unknown',
  768,
  384,
  'UNKNOWN',
  'L2',
  'SYMMETRIC',
  'onnx_cuda',
  'CANDIDATE',
  'UNVERIFIED',
  'DEPRECATED: Custom 384-dim projection via ONNX endpoint with undocumented derivation. '
  'Cannot be removed until derivation method is inspected (Phase 2). '
  'Pending paired-output analysis: if SLICE_FIRST_N can verify, re-classify to STATIC_VERIFIED. '
  'If provenance unknown after Phase 2, keep as CANDIDATE/MISMATCH for read-only fallback only.'
),

-- EmbeddingGemma 512-dim (MRL truncation, official but not deployed)
(
  'embeddinggemma_300m_512_mrl_ollama_v1',
  'google/embeddinggemma-300m',
  'main',
  'ollama_latest_as_of_2026_07_29',
  'google',
  'q8_0',
  768,
  512,
  'MRL_TRUNCATE',
  'L2',
  'SYMMETRIC',
  'ollama_cpu',
  'CANDIDATE',
  'UNVERIFIED',
  'Official Matryoshka Representation Learning truncation to 512 dimensions (not yet deployed). '
  'Candidate for cost-optimized fallback after retrieval ablation (Phase 5). '
  'Requires Ollama with MRL truncation support (flag: --dimensions 512).'
),

-- EmbeddingGemma 256-dim (MRL truncation, optional)
(
  'embeddinggemma_300m_256_mrl_ollama_v1',
  'google/embeddinggemma-300m',
  'main',
  'ollama_latest_as_of_2026_07_29',
  'google',
  'q8_0',
  768,
  256,
  'MRL_TRUNCATE',
  'L2',
  'SYMMETRIC',
  'ollama_cpu',
  'CANDIDATE',
  'UNVERIFIED',
  'Official Matryoshka Representation Learning truncation to 256 dimensions (not yet deployed). '
  'Optional for mobile/offline scenarios after ablation (Phase 5).'
),

-- EmbeddingGemma 128-dim (MRL truncation, aggressive)
(
  'embeddinggemma_300m_128_mrl_ollama_v1',
  'google/embeddinggemma-300m',
  'main',
  'ollama_latest_as_of_2026_07_29',
  'google',
  'q8_0',
  768,
  128,
  'MRL_TRUNCATE',
  'L2',
  'SYMMETRIC',
  'ollama_cpu',
  'CANDIDATE',
  'UNVERIFIED',
  'Official Matryoshka Representation Learning truncation to 128 dimensions (not yet deployed). '
  'Aggressive compression; use only if retrieval quality metrics permit.'
)
ON CONFLICT (representation_id) DO NOTHING;

-- ============================================================================
-- Optional: Seed Provider Entries (Deployment Configuration)
-- ============================================================================

INSERT INTO public.atlas_representation_providers (
  provider_id,
  representation_id,
  runtime_engine,
  execution_device,
  endpoint_url,
  api_dialect,
  model_alias,
  deployment_priority,
  is_preferred
) VALUES
(
  'ollama_local',
  'embeddinggemma_300m_768_native_ollama_v1',
  'ollama',
  'cpu',
  'http://127.0.0.1:11434',
  'ollama_native',
  'embeddinggemma:latest',
  10,
  true
)
ON CONFLICT DO NOTHING;

COMMIT;
