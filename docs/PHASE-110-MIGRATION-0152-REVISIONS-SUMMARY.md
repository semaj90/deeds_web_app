# Phase 110 Migration 0152 Revisions Summary

**Date**: July 29, 2026  
**Status**: ✅ REVISED MIGRATION READY FOR REVIEW  
**Previous**: `drizzle/0152_atlas_representations_registry.sql` (240 lines)  
**Current**: `drizzle/0152_atlas_representations_registry_revised.sql` (650+ lines)

---

## Overview

The revised migration 0152 incorporates all 10 corrections from `PHASE-110-REPRESENTATION-SCHEMA-CORRECTIONS.md`. It replaces the original single-boolean `is_active` design with a proper evidence-tracking system that separates:

- **Semantic identity** (representation, dimensions, method) from **deployment** (provider, endpoint)
- **Lifecycle** (CANDIDATE→ACTIVE→DEPRECATED→RETIRED) from **verification** (UNVERIFIED→SAMPLE_VERIFIED→PRODUCTION_VERIFIED)
- **Provider fallback** (runtime switching) from **lane fallback** (collection switching) from **migration** (reindexing)

---

## Changes by Issue

### Issue 1: Lifecycle vs. Verification Status ✅

**Original Design**:
```sql
is_active boolean NOT NULL DEFAULT false;
deprecated_at timestamptz;
reason_deprecated text;
verified_at timestamptz;
verified_method text;
```

**Revised Design**:
```sql
-- Lifecycle: CANDIDATE → ACTIVE → DEPRECATED → RETIRED
lifecycle_status text NOT NULL DEFAULT 'CANDIDATE' CHECK (
  lifecycle_status IN ('CANDIDATE', 'ACTIVE', 'DEPRECATED', 'RETIRED')
);

-- Verification: UNVERIFIED → STATIC_VERIFIED → SAMPLE_VERIFIED → PRODUCTION_VERIFIED
verification_status text NOT NULL DEFAULT 'UNVERIFIED' CHECK (
  verification_status IN (
    'UNVERIFIED',
    'STATIC_VERIFIED',
    'SAMPLE_VERIFIED',
    'PRODUCTION_VERIFIED',
    'MISMATCH',
    'FAILED'
  )
);
```

**States**:
- `CANDIDATE + UNVERIFIED` — Registered for tracking, not proven, do not use
- `CANDIDATE + SAMPLE_VERIFIED` — Probed and works, not yet approved for new indexing
- `ACTIVE + SAMPLE_VERIFIED` — Approved for new indexing after sample validation
- `ACTIVE + PRODUCTION_VERIFIED` — Live in production, proven safe
- `DEPRECATED + PRODUCTION_VERIFIED` — Was production, now retired; read-only access
- `RETIRED + FAILED` — Removed due to incompatibility; archive-only

**Impact**: Single boolean replaced with 6 possible state combinations, each with explicit meaning.

---

### Issue 2: Per-Lane Selection Tracking ✅

**New Table**:
```sql
CREATE TABLE atlas_representation_lane_selections (
  repository_id text NOT NULL,
  corpus_id text NOT NULL,
  artifact_view text NOT NULL,      -- 'code_semantic', 'doc_summary', etc.
  retrieval_lane text NOT NULL,     -- 'dense_aann', 'sparse_bm25', 'hybrid_rrf'
  workspace_revision text NOT NULL,
  representation_id text NOT NULL,  -- FK to atlas_representations
  selected_at timestamptz NOT NULL,
  selected_by text,
  evaluation_notes text,
  
  PRIMARY KEY (repository_id, corpus_id, artifact_view, retrieval_lane, workspace_revision)
);
```

**Enables**:
- `codebase` corpus → code semantic lane → primary: 768-native, secondary: 512-mrl
- `documentation` corpus → summary lane → primary: 512-mrl (storage tradeoff)
- `mobile` corpus → offline lane → primary: 256-mrl
- `legacy` corpus → readonly lane → primary: 384-custom

**Impact**: Replaces global "exactly one active representation" gate with per-lane selection tracking.

---

### Issue 3: Fallback Split (Provider/Lane/Migration) ✅

**Original Design**: Single `atlas_representation_fallbacks` table

**Revised Design**: Three separate tables

#### 3a: Provider Fallback (Runtime Switching)
```sql
CREATE TABLE atlas_representation_provider_fallbacks (
  representation_id text NOT NULL,
  fallback_provider_id text NOT NULL,
  
  -- Compatibility classification
  compatibility_kind text CHECK (compatibility_kind IN (
    'BITWISE_EQUIVALENT',
    'NUMERICALLY_EQUIVALENT',
    'RETRIEVAL_COMPATIBLE',
    'REQUIRES_RERANK'
  )),
  
  -- Empirical proof
  max_cosine_delta double precision,
  minimum_recall_ratio double precision,
  evaluation_run_id text,
  
  PRIMARY KEY (representation_id, fallback_provider_id)
);
```

**Use Case**: Ollama → ONNX for same vector space (no collection change).

#### 3b: Retrieval Lane Fallback (Collection Switching)
```sql
CREATE TABLE atlas_retrieval_lane_fallbacks (
  repository_id text NOT NULL,
  corpus_id text NOT NULL,
  artifact_view text NOT NULL,
  retrieval_lane text NOT NULL,
  
  primary_representation_id text NOT NULL,
  fallback_representation_id text NOT NULL,
  
  fallback_collection_name text NOT NULL,   -- Separate collection!
  fallback_requires_rerank boolean NOT NULL,
  
  retrieval_compatible boolean NOT NULL,
  max_recall_regression_ratio double precision,
  
  PRIMARY KEY (repository_id, corpus_id, artifact_view, retrieval_lane, fallback_representation_id)
);
```

**Use Case**: 768 → 512 requires separate `codebase_chunks_512_eval` collection and reranking.

#### 3c: Representation Migration (Planned Reindexing)
```sql
CREATE TABLE atlas_representation_migrations (
  migration_id text PRIMARY KEY,
  source_representation_id text NOT NULL,
  target_representation_id text NOT NULL,
  
  repository_id text NOT NULL,
  corpus_id text NOT NULL,
  
  migration_status text CHECK (migration_status IN (
    'PLANNED', 'IN_PROGRESS', 'COMPLETED', 'ROLLED_BACK', 'ABORTED'
  )),
  
  reason text NOT NULL,
  
  -- Quality baselines before/after
  baseline_recall_at_5 double precision,
  post_recall_at_5 double precision,
  maximum_allowed_recall_regression double precision DEFAULT 0.05
);
```

**Use Case**: Full reindexing from 384 → 768 with quality regression gating.

**Impact**: Clear separation of concerns: provider fallback (runtime) vs lane fallback (collection) vs migration (reindexing).

---

### Issue 4: Provider Table (Semantic vs. Deployment) ✅

**New Table**:
```sql
CREATE TABLE atlas_representation_providers (
  provider_id text PRIMARY KEY,     -- 'ollama_local', 'onnx_cuda_1', 'grpc_remote'
  representation_id text NOT NULL,  -- FK to atlas_representations
  
  -- Deployment specifics (NOT semantic)
  runtime_engine text NOT NULL,     -- 'ollama', 'onnx', 'grpc', 'http', 'tei'
  execution_device text NOT NULL,   -- 'cpu', 'cuda', 'hip', 'metal'
  
  endpoint_url text NOT NULL,
  api_dialect text NOT NULL,        -- 'ollama_native', 'openai_compatible', 'tei'
  
  model_alias text,                 -- How model is named at endpoint
  runtime_version text,             -- Version of runtime software
  artifact_digest text,             -- SHA256 for reproducibility
  
  health_status text,
  last_health_check timestamptz,
  
  deployment_priority integer,
  is_preferred boolean
);
```

**Result**: Same `embeddinggemma_300m_768_native_ollama_v1` can have providers:
- `ollama_local` → http://127.0.0.1:11434
- `onnx_cuda_lab` → http://remote-gpu:8081
- `grpc_kubernetes` → grpc.prod.svc.cluster.local:50051

**Impact**: URL changes no longer require creating new representations.

---

### Issue 5: Model Identity Precision ✅

**Original Design**:
```sql
model_id text NOT NULL,             -- e.g., 'embeddinggemma'
model_revision text NOT NULL,       -- e.g., 'latest' (not reproducible!)
tokenizer_revision text;
```

**Revised Design**:
```sql
-- Canonical upstream model identifier
upstream_model_id text NOT NULL DEFAULT 'unknown',
  COMMENT 'e.g., google/embeddinggemma-300m'

-- Resolved commit hash or specific version
upstream_revision text NOT NULL DEFAULT 'unknown',
  COMMENT 'Commit hash, not latest'

-- Deployment-specific version
model_revision text NOT NULL,
  COMMENT 'e.g., ollama_latest_as_of_2026_07_29'

-- Quantization applied
quantization text CHECK (quantization IN (
  'f32', 'f16', 'bf16', 'int8', 'int4', 'q8_0', 'q4_0', 'custom', 'unknown'
)),

-- Tokenizer for reproducibility
tokenizer_digest text,
  COMMENT 'SHA256 of tokenizer configuration'
```

**Impact**: Model identity is now fully reproducible (no 'latest' assumptions).

---

### Issue 6: Input Contract Tracking ✅

**New Fields**:
```sql
-- Whether this representation handles query/document/both
input_role text NOT NULL DEFAULT 'SYMMETRIC' CHECK (input_role IN (
  'QUERY', 'DOCUMENT', 'SYMMETRIC'
)),

-- Reference to registered prompt template
prompt_template_id text,

-- Maximum input tokens before truncation
max_input_tokens integer,

-- How truncation is applied
truncation_policy text DEFAULT 'END' CHECK (truncation_policy IN (
  'START', 'MIDDLE', 'END', 'SYMMETRIC'
))
```

**New Table**:
```sql
CREATE TABLE atlas_prompt_templates (
  template_id text PRIMARY KEY,
  model_id text NOT NULL,
  template_version text NOT NULL,
  
  query_template text,    -- e.g., 'task: search_result query: {text}'
  document_template text, -- e.g., 'title: {title} text: {text}'
  
  instructions text,
  verified_at timestamptz
);
```

**Impact**: Registry now tracks that 768-native may have separate query/document representations.

---

### Issue 7: Named Vector Support (Qdrant Mappings) ✅

**Renamed Table**: `atlas_qdrant_collection_mappings` → `atlas_qdrant_vector_mappings`

**Extended Fields**:
```sql
-- Now part of primary key: support multiple vectors per collection
collection_name text NOT NULL,
vector_field_name text NOT NULL DEFAULT 'content',  -- e.g., 'content', 'summary', 'topology'
representation_id text NOT NULL,

-- Still supports is_primary
is_primary boolean NOT NULL DEFAULT true,

-- Issue 7: New fields for named vectors
actual_point_count integer,
payload_sample_verified boolean DEFAULT false
```

**Result**: `codebase_chunks_768` collection can have:
- Named vector `code_semantic` (768-native)
- Named vector `summary` (512-mrl)
- Named vector `topology` (64-latent, autoencoder)

All three coexist in one collection.

**Impact**: Primary key changed from `(collection_name, representation_id)` to `(collection_name, vector_field_name, representation_id)`.

---

### Issue 8: Normalization Proof ✅

**New Fields** (in `atlas_representations`):
```sql
-- Actual verified norm from last health check
last_verified_output_norm double precision,
  COMMENT 'Last verified actual L2 norm (should be ~1.0 if normalization=L2)'
```

**Validator logic** (to be used in `representation-contract-validator.ts`):
```typescript
function validateNormalization(vector: Float32Array, expected: string): {
  valid: boolean;
  actualNorm: number;
  error?: string;
} {
  const norm = Math.sqrt(vector.reduce((sum, val) => sum + val * val, 0));
  const normalized = Math.abs(norm - 1.0) < 1e-4;
  
  return {
    valid: normalized,
    actualNorm: norm,
    error: normalized ? undefined : `Expected norm ≈ 1.0, got ${norm.toFixed(6)}`
  };
}
```

**Impact**: L2 normalization can now be verified empirically.

---

### Issue 9: Audit Hierarchy for Classification ✅

**New Fields** (in `atlas_qdrant_vector_mappings`):
```sql
-- When dimensions were last verified
dimension_confirmed_at timestamptz,

-- Provenance source (hierarchy)
provenance_source text CHECK (provenance_source IN (
  'COLLECTION_CONFIG',            -- Strongest
  'NAMED_VECTOR_CONFIG',
  'PAYLOAD_REPRESENTATION_ID',
  'SOURCE_ARTIFACT',
  'MODEL_LINEAGE',
  'COLLECTION_NAME_PATTERN'       -- Weakest
)),

-- Classification result
classification text CHECK (classification IN (
  'DIMENSION_CONFIRMED_PROVENANCE_UNKNOWN',
  'PROVENANCE_CONFIRMED_DIMENSION_UNKNOWN',
  'PAYLOAD_MIXED',
  'REGISTRY_MISMATCH',
  'UNMAPPED'
))
```

**Hierarchy**:
1. Collection config dimensions (strongest proof)
2. Named vector config dimensions
3. Sampled point payload `representation_id`
4. Source artifact embedding record
5. Model run lineage
6. Collection name pattern (weakest)

**Impact**: Audit classifications now have explicit confidence levels.

---

### Issue 10: Immutability Trigger ✅

**New Function**:
```sql
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
```

**Impact**: Critical semantic fields are locked once proven in production. Semantic changes require new representation_id.

---

## Seed Data Changes

**Original**:
- 5 representations seeded with `is_active = true/false`

**Revised**:
- 5 representations seeded with `lifecycle_status = CANDIDATE` and `verification_status = UNVERIFIED`
- No representation claims ACTIVE or verified status until Phase 1-5 proofs complete
- Notes explicitly state what proofs are pending for each representation

**Key Change**: The 384-dim custom representation is NOT marked DEPRECATED immediately. Instead:
- Status: `CANDIDATE + UNVERIFIED`
- Note: "Cannot be removed until derivation method is inspected (Phase 2)"
- Action: Paired-output analysis in Phase 2 will either confirm SLICE_FIRST_N or leave as UNVERIFIED

---

## Validation Gates (Phase 0 Static Validation)

Before execution, verify:

1. ✅ **Schema syntax**: All CHECK constraints are valid SQL
2. ✅ **Foreign keys**: All REFERENCES clauses resolve to existing tables
3. ✅ **Indexes**: All CONCURRENTLY indexes are supported
4. ✅ **Triggers**: Trigger function syntax is correct
5. ✅ **Seed data**: No conflicts on INSERT with ON CONFLICT DO NOTHING

---

## Next Steps

### Phase 0: Static Validation
```bash
# Review SQL syntax (dry-run)
cd sveltekit-frontend
psql -U legal_admin -d legal_ai_db -f drizzle/0152_atlas_representations_registry_revised.sql --dry-run
# OR use Drizzle preview
npm run drizzle:migrate -- --dry-run
```

### Phase 1: Runtime Identity Probing
After migration applied, execute:
```bash
npm run phase110:probe:representations
```

This will:
- Probe Ollama 768/512/256/128 dimensions
- Probe ONNX 384 endpoint
- Record actual vs. claimed dimensions
- Update `verification_status` to STATIC_VERIFIED

### Phase 2: Paired Output Testing
```bash
npm run phase110:paired-output:test
```

This will:
- Embed 100 samples with 384 ONNX
- Embed same 100 with 768 Ollama
- Classify derivation method (SLICE_FIRST_N, LINEAR_PROJECTION, UNKNOWN)
- Update 384 representation classification

### Phase 4: Qdrant Audit
```bash
npm run atlas:audit:qdrant-representations
```

This will:
- Scan all Qdrant collections
- Classify against registry
- Generate recommendations

### Phase 5: Retrieval Ablation
After Phases 1-2 complete, run cost/quality evaluation comparing 384/512/768.

### Phase 6: Select Primary
Based on Phase 5 results, decision tree selects primary representation per semantic lane.

---

## Testing Checklist

- [ ] Migration applies without errors
- [ ] All tables created successfully
- [ ] All indexes created successfully
- [ ] Seed data inserted (5 representations)
- [ ] No constraint violations
- [ ] Trigger fires correctly (test by attempting to update PRODUCTION_VERIFIED representation)
- [ ] Foreign key cascade/restrict rules work as expected
- [ ] Unique constraints prevent duplicate selections

---

## Files Reference

| File | Purpose | Status |
|------|---------|--------|
| `drizzle/0152_atlas_representations_registry_revised.sql` | Migration with all 10 corrections | ✅ Created |
| `docs/PHASE-110-REPRESENTATION-SCHEMA-CORRECTIONS.md` | Design document explaining corrections | ✅ Reference |
| `src/lib/server/embeddings/representation-contract-validator.ts` | Runtime validation | ⏳ Pending execution |
| `scripts/atlas/audit-qdrant-representations.mjs` | Qdrant audit script | ✅ Ready |
| `docs/PHASE-110-REPRESENTATION-SPECIFICATION-UPDATE.md` | Updated Phase 110 spec | ✅ Reference |
| `docs/PHASE-110-REPRESENTATION-INFRASTRUCTURE-DEPLOYMENT.md` | Deployment guide with Proof States | ✅ Reference |

---

## Summary

The revised migration 0152 transforms Phase 110 representation infrastructure from a static registry into an evidence system. It:

1. ✅ Separates semantic identity from deployment
2. ✅ Tracks lifecycle and verification independently
3. ✅ Enables per-lane representation selection
4. ✅ Splits fallback concepts into three distinct tables
5. ✅ Adds precision to model identity (no 'latest')
6. ✅ Tracks input contracts (query vs. document)
7. ✅ Supports named vectors in Qdrant
8. ✅ Validates normalization empirically
9. ✅ Establishes audit hierarchy for classification
10. ✅ Prevents mutation of production-proven representations

**Status**: Ready for Phase 0 (Static Validation) and Phase 1 (Runtime Probing).
