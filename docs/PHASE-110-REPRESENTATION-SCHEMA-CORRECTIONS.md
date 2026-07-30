# Phase 110 Representation Schema — Corrections & Design Notes

**Date**: July 29, 2026  
**Status**: 🔧 MIGRATION 0152 REQUIRES REVISION BEFORE APPLICATION  
**Purpose**: Capture schema design corrections identified during review

---

## Issue 1: Lifecycle vs. Verification Status (Critical)

**Current Design**: Single `is_active` boolean (too weak)

**Problem**: 
- ACTIVE doesn't distinguish between verified representations and unproven candidates
- No way to mark something verified but deprecated
- Lifecycle transitions aren't tracked

**Correction**: Use two separate fields

```sql
ALTER TABLE atlas_representations ADD COLUMN lifecycle_status text NOT NULL DEFAULT 'CANDIDATE'
  CHECK (lifecycle_status IN ('CANDIDATE', 'ACTIVE', 'DEPRECATED', 'RETIRED'));

ALTER TABLE atlas_representations ADD COLUMN verification_status text NOT NULL DEFAULT 'UNVERIFIED'
  CHECK (verification_status IN ('UNVERIFIED', 'STATIC_VERIFIED', 'SAMPLE_VERIFIED', 'PRODUCTION_VERIFIED', 'MISMATCH', 'FAILED'));

-- Drop is_active (migrate data via: UPDATE ... SET lifecycle_status = 'ACTIVE' WHERE is_active = true)
```

**Meanings**:
- `CANDIDATE + UNVERIFIED` — Registered for tracking, not proven, do not use for new indexing
- `CANDIDATE + SAMPLE_VERIFIED` — Probed and works, but not yet in production use
- `ACTIVE + SAMPLE_VERIFIED` — Approved for new indexing after sample validation
- `ACTIVE + PRODUCTION_VERIFIED` — Live in production, proven safe
- `DEPRECATED + PRODUCTION_VERIFIED` — Was production, now retired; read-only access
- `RETIRED + FAILED` — Removed due to incompatibility or quality regression

---

## Issue 2: Global "One Active" vs. Per-Lane Selection

**Current Design**: Gate assumes "exactly one active representation registered globally"

**Problem**:
- Legitimate use case: code search (768), documentation search (512), mobile offline (256), legacy lane (384)
- Different corpus views may select different representations
- Semantic lane ≠ global singleton

**Correction**: Track selection per semantic lane per corpus revision

```sql
ALTER TABLE atlas_qdrant_collection_mappings ADD COLUMN is_primary boolean NOT NULL DEFAULT false;

-- New table for explicit selection tracking
CREATE TABLE atlas_representation_lane_selections (
  repository_id text NOT NULL,
  corpus_id text NOT NULL,
  artifact_view text NOT NULL,  -- 'code_semantic', 'doc_summary', 'topology_latent', etc.
  retrieval_lane text NOT NULL,  -- 'dense_aann', 'sparse_bm25', 'hybrid_rrf'
  workspace_revision text NOT NULL,
  representation_id text NOT NULL REFERENCES atlas_representations,
  selected_at timestamptz NOT NULL DEFAULT now(),
  selected_by text,  -- operator name or decision rationale
  evaluation_notes text,
  
  PRIMARY KEY (repository_id, corpus_id, artifact_view, retrieval_lane, workspace_revision),
  UNIQUE (repository_id, corpus_id, artifact_view, retrieval_lane, workspace_revision)
);
```

**This allows**:
- `codebase` corpus → code semantic lane → primary: 768-native, secondary: 512-mrl
- `documentation` corpus → summary lane → primary: 512-mrl (storage tradeoff)
- `mobile` corpus → offline lane → primary: 256-mrl
- `legacy` corpus → readonly lane → primary: 384-custom

---

## Issue 3: Fallback Confusion (Critical)

**Current Design**: Single `atlas_representation_fallbacks` table (conflates three concepts)

**Problems**:
- Provider fallback (Ollama → ONNX for same vector space) ≠ Lane fallback (768 → 512 requires separate collection) ≠ Migration (reindexing)
- Current rule "same dimensions" contradicts 768 → 384 fallback mentioned in docs
- No way to express empirical compatibility proof

**Correction**: Split into three tables

### Table 1: Provider Fallback (Runtime Switching)

```sql
CREATE TABLE atlas_representation_provider_fallbacks (
  representation_id text NOT NULL REFERENCES atlas_representations,
  fallback_provider_id text NOT NULL,  -- e.g., 'ollama_local', 'onnx_cuda', 'grpc_remote'
  
  -- Vector space compatibility
  compatibility_kind text NOT NULL CHECK (compatibility_kind IN (
    'BITWISE_EQUIVALENT',       -- Exact same coordinates (quantization can differ)
    'NUMERICALLY_EQUIVALENT',   -- Same vectors within precision (e.g., float32 vs float64)
    'RETRIEVAL_COMPATIBLE',     -- Functionally equivalent for search (empirically proven)
    'REQUIRES_RERANK'           -- Must re-rank results due to subtle drift
  )),
  
  -- Empirical proof (if compatibility_kind = RETRIEVAL_COMPATIBLE)
  max_cosine_delta double precision,              -- Max observed similarity delta (0.0–1.0)
  minimum_recall_ratio double precision,          -- Minimum Recall@K ratio vs primary (e.g., 0.95 = 95% of primary quality)
  
  evaluation_run_id text,                          -- Reference to evaluation that proved compatibility
  evaluation_timestamp timestamptz,
  evaluation_query_count integer,                  -- How many queries were tested
  evaluation_corpus_snapshot text,                -- Which corpus snapshot was used
  
  verified_at timestamptz,
  verified_by text,
  
  PRIMARY KEY (representation_id, fallback_provider_id),
  CONSTRAINT valid_empirical CHECK (
    compatibility_kind IN ('BITWISE_EQUIVALENT', 'NUMERICALLY_EQUIVALENT') 
    OR (max_cosine_delta IS NOT NULL AND minimum_recall_ratio IS NOT NULL)
  )
);

-- Index for quick fallback lookup
CREATE INDEX atlas_provider_fallback_idx ON atlas_representation_provider_fallbacks (representation_id);
```

**Rule**: Provider fallback is **NOT** recommended by default. Only use if `compatibility_kind` is proven empirically.

### Table 2: Retrieval Lane Fallback (Collection Switching)

```sql
CREATE TABLE atlas_retrieval_lane_fallbacks (
  repository_id text NOT NULL,
  corpus_id text NOT NULL,
  artifact_view text NOT NULL,
  retrieval_lane text NOT NULL,
  
  primary_representation_id text NOT NULL REFERENCES atlas_representations,
  fallback_representation_id text NOT NULL REFERENCES atlas_representations,
  
  -- Lane fallback is NOT a runtime switch; it requires a separate collection and reranking
  fallback_collection_name text NOT NULL,  -- e.g., 'codebase_chunks_512_eval'
  fallback_requires_rerank boolean NOT NULL DEFAULT true,
  
  -- Compatibility proof (same evaluation as provider fallback)
  retrieval_compatible boolean NOT NULL DEFAULT false,
  max_recall_regression_ratio double precision,   -- (fallback_recall / primary_recall) ≥ threshold
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
```

**Rule**: Lane fallback requires **reindexing or dual-write**. Not a runtime fallback.

### Table 3: Representation Migration (Planned Reindexing)

```sql
CREATE TABLE atlas_representation_migrations (
  migration_id text PRIMARY KEY,  -- e.g., '384_to_768_2026_jul'
  
  source_representation_id text NOT NULL REFERENCES atlas_representations,
  target_representation_id text NOT NULL REFERENCES atlas_representations,
  
  repository_id text NOT NULL,
  corpus_id text NOT NULL,
  
  migration_status text NOT NULL DEFAULT 'PLANNED' CHECK (migration_status IN (
    'PLANNED', 'IN_PROGRESS', 'COMPLETED', 'ROLLED_BACK', 'ABORTED'
  )),
  
  reason text NOT NULL,  -- e.g., 'Quality improvement', 'Cost reduction', 'Deprecation', 'Compliance'
  
  -- Timeline
  planned_start_date timestamptz,
  actual_start_timestamp timestamptz,
  actual_completion_timestamp timestamptz,
  
  -- Pre-migration quality baseline (computed on source)
  baseline_recall_at_5 double precision,
  baseline_recall_at_10 double precision,
  baseline_ncdg_at_5 double precision,
  baseline_latency_ms double precision,
  
  -- Post-migration quality (computed on target)
  post_recall_at_5 double precision,
  post_recall_at_10 double precision,
  post_ncdg_at_5 double precision,
  post_latency_ms double precision,
  
  -- Regression gating
  maximum_allowed_recall_regression double precision DEFAULT 0.05,  -- 5% drop is acceptable
  migration_approved_at timestamptz,
  migration_approved_by text,
  
  notes text,
  
  CONSTRAINT valid_completed CHECK (
    migration_status != 'COMPLETED' 
    OR actual_completion_timestamp IS NOT NULL
  )
);
```

---

## Issue 4: Endpoint URL Belongs on Provider, Not Representation

**Current Design**: `endpoint_url` on `atlas_representations`

**Problem**:
- Same representation can be served from Ollama, ONNX, or gRPC without being different representations
- Endpoint is a deployment decision, not a semantic identity
- URL changes shouldn't create new semantic representations

**Correction**: 

```sql
-- Move endpoint to a separate provider table
CREATE TABLE atlas_representation_providers (
  provider_id text PRIMARY KEY,  -- e.g., 'ollama_local', 'onnx_cuda_1', 'grpc_remote'
  representation_id text NOT NULL REFERENCES atlas_representations,
  
  -- Deployment specifics (NOT semantic)
  runtime_engine text NOT NULL CHECK (runtime_engine IN ('ollama', 'onnx', 'grpc', 'http', 'tei', 'custom')),
  execution_device text NOT NULL CHECK (execution_device IN ('cpu', 'cuda', 'hip', 'metal', 'mixed', 'unknown')),
  
  endpoint_url text NOT NULL,
  api_dialect text NOT NULL,  -- 'ollama_native', 'openai_compatible', 'tei', 'custom'
  
  model_alias text,  -- How model is named at this endpoint (e.g., 'embeddinggemma:latest')
  runtime_version text,  -- Version of runtime software (e.g., Ollama v0.1.45)
  
  -- Health & availability
  health_status text DEFAULT 'UNKNOWN' CHECK (health_status IN ('HEALTHY', 'UNHEALTHY', 'UNKNOWN')),
  last_health_check timestamptz,
  health_check_failure_count integer DEFAULT 0,
  
  -- Deployment metadata
  artifact_digest text,  -- SHA256 of model artifact (for reproducibility)
  deployment_priority integer DEFAULT 0,  -- Higher priority tried first
  is_preferred boolean DEFAULT false,
  
  created_at timestamptz NOT NULL DEFAULT now(),
  retired_at timestamptz,
  
  UNIQUE (representation_id, provider_id)
);

CREATE INDEX atlas_provider_representation_idx ON atlas_representation_providers (representation_id);
CREATE INDEX atlas_provider_health_idx ON atlas_representation_providers (health_status);
```

**Result**: Same `embeddinggemma_300m_768_native_ollama_v1` can have providers:
- `ollama_local` → http://127.0.0.1:11434
- `onnx_cuda_lab` → http://remote-gpu:8081
- `grpc_kubernetes` → grpc.prod.svc.cluster.local:50051

---

## Issue 5: Model Identity Needs Precision

**Current Design**: `model_id: 'embeddinggemma'`, `model_revision: 'latest'`

**Problem**:
- 'latest' is not reproducible
- EmbeddingGemma has multiple sizes (384M, 1.1B, 7B); need to track which one
- Quantization affects reproducibility
- Tokenizer version can affect embeddings

**Correction**:

```sql
ALTER TABLE atlas_representations ADD COLUMN upstream_model_id text NOT NULL DEFAULT 'google/embeddinggemma-300m'
  COMMENT 'Canonical model name (e.g., huggingface model card)';

ALTER TABLE atlas_representations ADD COLUMN upstream_revision text NOT NULL DEFAULT 'unknown'
  COMMENT 'Model revision or commit hash (resolve from latest to commit SHA)';

ALTER TABLE atlas_representations ADD COLUMN quantization text DEFAULT 'f32'
  CHECK (quantization IN ('f32', 'f16', 'bf16', 'int8', 'int4', 'q8_0', 'q4_0', 'custom', 'unknown'));

ALTER TABLE atlas_representations ADD COLUMN tokenizer_digest text
  COMMENT 'SHA256 of tokenizer configuration or vocabulary';

-- Example: for Ollama deployment
-- upstream_model_id: 'google/embeddinggemma-300m'
-- upstream_revision: 'f70c2f4c5b...' (resolved from latest)
-- model_revision: 'ollama_latest_as_of_2026_07_29' (deployment version)
-- quantization: 'q8_0'
```

---

## Issue 6: Input Contract Belongs in Registry

**Current Design**: Input formatting is implicit

**Problem**:
- EmbeddingGemma distinguishes query vs. document prompts
- Different prompts = different embedding space
- Current system doesn't track this

**Correction**:

```sql
ALTER TABLE atlas_representations ADD COLUMN input_role text NOT NULL DEFAULT 'SYMMETRIC'
  CHECK (input_role IN ('QUERY', 'DOCUMENT', 'SYMMETRIC'));

ALTER TABLE atlas_representations ADD COLUMN prompt_template_id text
  COMMENT 'Reference to registered prompt template (see atlas_prompt_templates)';

ALTER TABLE atlas_representations ADD COLUMN max_input_tokens integer
  COMMENT 'Max tokens per input before truncation';

ALTER TABLE atlas_representations ADD COLUMN truncation_policy text DEFAULT 'END'
  CHECK (truncation_policy IN ('START', 'MIDDLE', 'END', 'SYMMETRIC'));

-- New table for prompt templates
CREATE TABLE atlas_prompt_templates (
  template_id text PRIMARY KEY,
  model_id text NOT NULL,
  template_version text NOT NULL,
  
  query_template text,    -- e.g., 'task: search_result query: {text}'
  document_template text, -- e.g., 'title: {title} text: {text}'
  
  instructions text,      -- Why these templates
  verified_at timestamptz,
  
  UNIQUE (model_id, template_version)
);
```

**Result**: Registry now tracks that 768-native may have separate query/document representations.

---

## Issue 7: Qdrant Mapping Needs Named Vector Support

**Current Design**: One vector per collection

**Problem**:
- Modern Qdrant supports named vectors (e.g., 'content_768', 'summary_512')
- Single collection can have multiple representations
- Current mapping table assumes one vector per collection

**Correction**:

```sql
-- Rename and extend
ALTER TABLE atlas_qdrant_collection_mappings RENAME TO atlas_qdrant_vector_mappings;

-- Ensure vector_field_name is part of the index
ALTER TABLE atlas_qdrant_vector_mappings 
  DROP CONSTRAINT atlas_qdrant_vector_mappings_pkey;
  
ALTER TABLE atlas_qdrant_vector_mappings 
  ADD PRIMARY KEY (collection_name, vector_field_name, representation_id);

-- Track actual point counts per vector field
ALTER TABLE atlas_qdrant_vector_mappings ADD COLUMN actual_point_count integer
  COMMENT 'Verified count via scroll API';

ALTER TABLE atlas_qdrant_vector_mappings ADD COLUMN payload_sample_verified boolean DEFAULT false
  COMMENT 'Have we sampled and verified payload structure?';
```

**Example result**: `codebase_chunks_768` collection can have:
- Named vector 'code_semantic' → 768-native
- Named vector 'summary' → 512-mrl
- Named vector 'topology' → 64-latent (autoencoder)

---

## Issue 8: No Normalization Proof

**Current Design**: Trust endpoint claims normalization

**Problem**:
- Ollama says it returns L2-normalized vectors
- Doesn't hurt to verify
- MRL truncations should re-normalize

**Correction**: Validator module should compute norm

```typescript
// In representation-contract-validator.ts
function validateNormalization(vector: Float32Array, expected: string): { valid: boolean; actualNorm: number; error?: string } {
  const norm = Math.sqrt(vector.reduce((sum, val) => sum + val * val, 0));
  const normalized = Math.abs(norm - 1.0) < 1e-4;
  
  return {
    valid: normalized,
    actualNorm: norm,
    error: normalized ? undefined : `Expected norm ≈ 1.0, got ${norm.toFixed(6)}`
  };
}
```

---

## Issue 9: Classification Needs Hierarchy

**Current Design**: Collection name is strong evidence

**Problem**:
- Name heuristics have false positives
- Collection named 'codebase_chunks_768' might contain mixed dimensions or wrong normalization

**Correction**: Audit hierarchy

```
Level 1: Collection config dimensions (strongest)
  → Named vector config dimensions
  → Sampled point payload representation_id
  → Source artifact embedding record
  → Model run lineage
  → Collection name pattern (weakest)
```

Classifications updated:
- `DIMENSION_CONFIRMED_PROVENANCE_UNKNOWN` — dimensions verified, source not
- `PROVENANCE_CONFIRMED_DIMENSION_UNKNOWN` — source traced, dimensions need check
- `PAYLOAD_MIXED` — collection contains points from multiple representations
- `REGISTRY_MISMATCH` — collection config ≠ registry claims
- `UNMAPPED` — collection exists but no mapping record

---

## Issue 10: Concurrency & Immutability Controls

**Current Design**: No constraints on semantic field mutation

**Problem**:
- Changing output_dimensions or dimension_method after indexing breaks Qdrant
- No way to prevent accidental mutations of critical fields

**Correction**:

```sql
-- Fields that should be effectively immutable after PRODUCTION_VERIFIED
ALTER TABLE atlas_representations ADD CONSTRAINT immutable_after_production CHECK (
  verification_status != 'PRODUCTION_VERIFIED' 
  OR pg_xmin IS NULL  -- Immutable if no updates after production verification
);

-- Better: use a trigger to prevent mutations
CREATE FUNCTION atlas_representations_immutable_check() RETURNS TRIGGER AS $$
BEGIN
  IF OLD.verification_status = 'PRODUCTION_VERIFIED' THEN
    IF OLD.model_revision != NEW.model_revision
       OR OLD.output_dimensions != NEW.output_dimensions
       OR OLD.dimension_method != NEW.dimension_method
       OR OLD.normalization != NEW.normalization
    THEN
      RAISE EXCEPTION 'Cannot modify semantic fields of PRODUCTION_VERIFIED representation';
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER atlas_representations_immutable_trigger
  BEFORE UPDATE ON atlas_representations
  FOR EACH ROW EXECUTE FUNCTION atlas_representations_immutable_check();
```

**Result**: Critical fields are immutable once proven in production. Create new representation ID for semantic changes.

---

## Revised Migration Order

**Do NOT apply 0152 as currently written.** Revise with:

1. Add `lifecycle_status` + `verification_status` fields (split from `is_active`)
2. Split `atlas_representation_fallbacks` into three tables
3. Create `atlas_representation_providers` table (move `endpoint_url`)
4. Extend `atlas_representations` with upstream model details, quantization, tokenizer, input contracts
5. Rename `atlas_qdrant_collection_mappings` → `atlas_qdrant_vector_mappings` (support named vectors)
6. Create `atlas_prompt_templates` table
7. Create `atlas_retrieval_lane_selections` table
8. Create `atlas_representation_migrations` table
9. Add immutability trigger on semantic fields
10. Seed initial registrations with `CANDIDATE + UNVERIFIED` status (not `ACTIVE`)

**Total scope**: ~500-600 lines revised SQL (vs. 240 current)

---

## Summary

The current 0152 migration provides good structural foundation but conflates evidence states with deployment decisions. The corrections above separate:

- **Semantic identity** (representation) from **deployment** (provider)
- **Lifecycle** (CANDIDATE→ACTIVE→DEPRECATED) from **verification** (UNVERIFIED→SAMPLE_VERIFIED→PRODUCTION_VERIFIED)
- **Provider fallback** (runtime switching) from **lane fallback** (collection switching) from **migration** (reindexing)
- **Global state** from **per-lane selection**

These corrections make the registry an evidence system suitable for real-world decision-making, not an assumption repository.
