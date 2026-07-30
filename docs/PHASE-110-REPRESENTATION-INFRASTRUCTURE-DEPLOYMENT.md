# Phase 110 Representation Infrastructure — Deployment & Validation Guide

**Status**: 🔧 **STATIC COMPONENTS IMPLEMENTED — DEPLOYMENT AND RUNTIME VALIDATION PENDING**  
**Date**: July 29, 2026  
**Purpose**: Registry schema and validation framework for embedding representation lifecycle

---

## Overview

Four interconnected components provide infrastructure for explicit representation contract authority over Phase 110 semantic lane indexing. **Important**: This document establishes the mechanism. The actual canonical representation decision requires runtime proof before production commitment.

1. **atlas_representations Registry** — Postgres schema migration (0152) — schema complete, seed data requires verification
2. **Representation Contract Validator** — TypeScript module for runtime verification — implementation complete, gates pending execution
3. **Qdrant Collection Audit Script** — Provenance classification and recommendations — implementation complete, audit pending
4. **Phase 110 Updated Spec** — Updated to require explicit representation requirements — specification revised, implementation gates deferred

**Core Principle**: No embedding dimension or derivation method can be assumed. Every representation must be **registered** (schema), **verified** (runtime probes), and **tracked** (across storage layers). This document is the mechanism. The proof states are the gates.

---

## Component 1: Registry Migration (`0152_atlas_representations_registry.sql`)

**Location**: `sveltekit-frontend/drizzle/0152_atlas_representations_registry.sql`  
**Lines**: 240  
**Status**: ✅ Complete and syntactically valid

### What It Creates

#### Master Registry Table: `atlas_representations`
- **representation_id** (PK) — Unique stable identifier
- **model_id** / **model_revision** / **model_source** — Model identity
- **native_dimensions** / **output_dimensions** — Dimension contract
- **dimension_method** — How output is derived (NATIVE, MRL_TRUNCATE, LINEAR_PROJECTION, AUTOENCODER, CUSTOM_MODEL_HEAD, SLICE_FIRST_N, UNKNOWN)
- **normalization** — L2 or NONE
- **runtime** — ollama_cpu, onnx_cuda, grpc_service, etc.
- **endpoint_url** — Where this representation lives
- **verified_at** / **verified_by** / **verified_method** — Audit trail (HEALTH_CHECK, SAMPLE_ROUND_TRIP, PRODUCTION_LIVE, UNVERIFIED)
- **is_active** — Whether currently in use
- **metadata** / **notes** — JSONB for extensibility

**Indexes**:
- `atlas_repr_active_idx` — Filter active representations
- `atlas_repr_model_idx` — Model identity lookups
- `atlas_repr_output_dim_idx` — Dimension-based queries
- `atlas_repr_runtime_idx` — Runtime filtering

#### Fallback Eligibility Table: `atlas_representation_fallbacks` (Requires Restructuring)

**Current schema is incorrect.** The table conflates three distinct concepts:

1. **Provider fallback** (same vector space, different endpoint) — Same representation served from Ollama or ONNX
2. **Lane fallback** (dimensional switch) — Requires a separate collection and reranking
3. **Migration path** (reindexing) — Creating a new collection, not a runtime fallback

**Correction needed**: Split into three tables:
- `atlas_representation_provider_fallbacks` — Same semantic identity, different runtime/endpoint
- `atlas_retrieval_lane_fallbacks` — Cross-dimensional fallback (requires separate collection + compatibility proof)
- `atlas_representation_migrations` — Reindexing plans (384 → 768, etc.)

For provider fallback: **Do not assume metadata matching is sufficient.** Two models can both output 768-dim L2-normalized vectors while producing completely incompatible coordinate spaces. Safe provider fallback requires **empirically proven vector space compatibility** (paired output correlation ≥ 0.99 across sampled inputs, retrieval evaluation within allowed regression threshold).

#### Qdrant Mapping Table: `atlas_qdrant_collection_mappings`
- Records which collections use which representations
- Tracks verification status (VERIFIED_MATCH, VERIFIED_MISMATCH, UNVERIFIED)
- Enables post-indexing audits to confirm Qdrant parity

### Seed Data (Initial Registration — Evidence Pending)

| representation_id | Model | Output Dims | Method | Lifecycle | Verification | Notes |
|---|---|---|---|---|---|---|
| `embeddinggemma_300m_768_native_ollama_v1` | EmbeddingGemma | 768 | NATIVE | CANDIDATE | UNVERIFIED | Google-documented native output. Ollama endpoint `/api/embed` with `dimensions: 768`. **Runtime proof pending**: dimension validation, normalization check, prompt contract verification. |
| `embeddinggemma_300m_512_mrl_ollama_v1` | EmbeddingGemma | 512 | MRL_TRUNCATE | CANDIDATE | UNVERIFIED | Google-documented MRL truncation. Requires re-normalization after truncation. **Runtime proof pending**: MRL truncation behavior, normalization, retrieval parity with 768. |
| `embeddinggemma_300m_256_mrl_ollama_v1` | EmbeddingGemma | 256 | MRL_TRUNCATE | CANDIDATE | UNVERIFIED | Google-documented MRL truncation. **Runtime proof pending**. |
| `embeddinggemma_300m_128_mrl_ollama_v1` | EmbeddingGemma | 128 | MRL_TRUNCATE | CANDIDATE | UNVERIFIED | Google-documented MRL truncation. **Runtime proof pending**. |
| `embeddinggemma_300m_384_custom_onnx_v1` | EmbeddingGemma | 384 | UNKNOWN | CANDIDATE | UNVERIFIED | **Not a documented official MRL size.** Google publishes 768, 512, 256, 128 only. ONNX endpoint at `:8081` exists. **Derivation proof pending**: inspect ONNX graph, compare paired outputs with 768 native, classify as slice-first-N / trained-projection / autoencoder / other. **Quality gate pending**: current system uses 384-dim; replacement must not degrade retrieval quality. |

**Critical Distinction**: Candidate + Unverified means "registered for tracking and probing, not approved for new indexing." The 384-dim lane is neither canonical nor deprecated—it is gated pending investigation.

---

## Component 2: Contract Validator (`representation-contract-validator.ts`)

**Location**: `sveltekit-frontend/src/lib/server/embeddings/representation-contract-validator.ts`  
**Lines**: 284  
**Status**: ✅ Complete with full test patterns

### What It Does

#### Zod Schemas
```typescript
export const DimensionMethodSchema = z.enum([
  'NATIVE', 'MRL_TRUNCATE', 'LINEAR_PROJECTION', 'AUTOENCODER', 
  'CUSTOM_MODEL_HEAD', 'SLICE_FIRST_N', 'UNKNOWN'
]);

export const EmbeddingBackendContractSchema = z.object({
  representationId: z.string(),
  modelId: z.string(),
  nativeDimensions: z.number().int().positive(),
  outputDimensions: z.number().int().positive(),
  dimensionMethod: DimensionMethodSchema,
  normalization: z.enum(['L2', 'NONE']),
  runtime: z.enum([...]),
  endpointUrl: z.string().url(),
  // ... more fields
});
```

#### Validator Functions

**`validateOllamaContract(contract, testPrompt?)`**
- Sends test prompt to Ollama `/api/embeddings`
- Measures actual vector dimensions
- Compares against claimed `outputDimensions`
- Returns: `{ isValid, actualDimensions, claimedDimensions, error? }`

**`validateONNXHealthContract(contract)`**
- Queries `/health` endpoint
- Verifies native_dimensions, output_dimensions, dimension_method, normalization, model_id
- Returns: `{ isValid, health?, mismatchReasons, error? }`

**`canFallback(primary, fallback)`**
- Checks if two representations produce identical output contracts
- Requirements: dimensions match, normalization match, dimension_method match
- Returns: boolean

**`validateFallbackChain(primary, fallbacks)`**
- Validates all fallbacks in sequence
- Ensures no incompatible fallbacks in chain
- Returns: `{ isValid, reasons[] }`

**`validateRepresentation(contract)`**
- Complete validation suite
- Runs ONNX health check + Ollama embedding test (as applicable)
- Returns comprehensive result with all check outcomes

### Usage Example

```typescript
import { validateRepresentation } from '$lib/server/embeddings/representation-contract-validator';

const contract = {
  representationId: 'embeddinggemma_300m_768_native_ollama_v1',
  modelId: 'embeddinggemma',
  nativeDimensions: 768,
  outputDimensions: 768,
  dimensionMethod: 'NATIVE',
  normalization: 'L2',
  runtime: 'ollama_cpu',
  endpointUrl: 'http://127.0.0.1:11434'
};

const result = await validateRepresentation(contract);
if (!result.isValid) {
  console.error('Representation validation failed:', result.checks);
}
```

---

## Component 3: Qdrant Audit Script (`audit-qdrant-representations.mjs`)

**Location**: `scripts/atlas/audit-qdrant-representations.mjs`  
**Lines**: 269  
**Status**: ✅ Complete and ready for execution

### What It Does

1. **Connects to Qdrant** via `QDRANT_URL` environment variable (default: http://127.0.0.1:6333)
2. **Lists all collections** and inspects each
3. **Extracts vector dimensions** from collection config
4. **Classifies collections** based on:
   - Collection name patterns (contains "768", "384", etc.)
   - Actual vector dimensions from config
   - Matching against KNOWN_REPRESENTATIONS registry
5. **Generates recommendations** with severity levels (HIGH, MEDIUM, CRITICAL)
6. **Outputs JSON report** to `docs/reports/qdrant-representation-audit.json`

### Classification Levels

| Classification | Meaning | Action |
|---|---|---|
| CANDIDATE_768 | Name suggests 768-dim, not yet verified | Run health check, verify dimensions |
| CUSTOM_384_DEPRECATED | Explicitly 384-dim custom projection | Plan migration to 768-dim or explicit re-registration |
| LIKELY_768 | Name + dimensions confirm 768 | Register in atlas_representations |
| CUSTOM_384_CONFIRMED | Name + dimensions confirm 384 | Explicitly re-register with derivation method documented |
| UNCLASSIFIED | Cannot determine provenance | Inspect manually, update registry |

### Running the Audit

```bash
cd sveltekit-frontend
export QDRANT_URL=http://127.0.0.1:6333

node ../scripts/atlas/audit-qdrant-representations.mjs
```

### Expected Output Structure

```json
{
  "timestamp": "2026-07-29T...",
  "qdrantUrl": "http://127.0.0.1:6333",
  "totalCollections": 41,
  "byClassification": {
    "CANDIDATE_768": [...],
    "CUSTOM_384_DEPRECATED": [...],
    "LIKELY_768": [...],
    "UNCLASSIFIED": [...]
  },
  "recommendations": [
    {
      "severity": "HIGH",
      "issue": "Deprecated 384-dim custom projection in use",
      "affected": ["collection_name_1", "collection_name_2"],
      "action": "Migrate to canonical 768-dim or explicitly re-register...",
      "timeline": "Before Phase 110 production deployment"
    }
  ],
  "results": [
    {
      "collectionName": "...",
      "vectorDimensions": 768,
      "classification": "LIKELY_768",
      "representationId": "embeddinggemma_300m_768_native_ollama_v1",
      "confidence": 0.9,
      "pointCount": 40568,
      "notes": [...]
    }
  ]
}
```

---

## Component 4: Phase 110 Updated Specification

**Location**: `docs/PHASE-110-REPRESENTATION-SPECIFICATION-UPDATE.md`  
**Lines**: 235  
**Status**: ✅ Complete and implementation-ready

### Key Changes from Original Spec

#### 1. Explicit Representation ID Registration (Mandatory)

**Before (Vague)**:
> Use versioned dense embeddings over controlled views...

**After (Explicit)**:
> All indexing must declare which representation_id is used. That representation_id must exist in `atlas_representations` with `lifecycle_status = 'ACTIVE'` for new indexing. The decision to mark a representation ACTIVE is made **after** runtime verification gates pass, not before.

#### 2. New Pre-Indexing Step

**"New Step 1 (Pre-indexing): Establish representation registry and prove contracts"**

```bash
# Apply schema migration for atlas_representations
npm run drizzle:migrate -- 0152_atlas_representations_registry.sql

# Validate all registered representations
node scripts/atlas/validate-all-representations.mjs

# Audit current Qdrant collections
node scripts/atlas/audit-qdrant-representations.mjs

# Fix any representation mismatches before proceeding
```

#### 3. Updated Semantic Lane Specification

**Representation Contract (Mandatory Before Retrieval)**:
1. Declare which representation_id your indexing lane uses
2. Verify representation status via `/api/admin/representations/{representation_id}/health`
3. Confirm dimensions, normalization, runtime match registered contract
4. If using fallback: verify via `atlas_representation_fallbacks` table
5. After indexing: run `audit-qdrant-representations.mjs` to verify Qdrant matches registry

#### 4. New Proof Gates

**Gate: Semantic Lane Representation Proof**
- **One primary representation selected per semantic lane per corpus revision** (not globally)
- Representation endpoint is healthy and responsive
- Actual output dimensions match claimed dimensions
- Normalization validated via norm check: `|norm - 1.0| < 1e-4`
- Query vs. document prompt contracts verified (EmbeddingGemma distinguishes these)
- All Qdrant collections using this representation have `verification_status = 'VERIFIED_MATCH'`

**Gate: Provider Fallback Eligibility Proof (If Used)**
- Provider fallback (Ollama → ONNX for same representation) requires **empirically proven compatibility**:
  - Paired output correlation ≥ 0.99 across sampled query/document inputs
  - Retrieval evaluation shows ≤ 5% nDCG regression at K=5, 10
  - No cross-provider fallback without live retrieval testing

**Gate: Lane Fallback Planning (Future)**
- Dimensional lane switches (e.g., 768 → 512 fallback) require a **separate collection**, not runtime fallback
- Lane fallback requires reindexing, not provider swapping
- Plan as a migration, not a fallback

#### 5. Existing 384-dim Collection: Investigation Required

The 384-dimensional lane is currently in use and performs useful retrieval. **Before any migration, proof is required:**

**Investigation Gate 1: Derivation Proof**
1. Inspect ONNX graph at `:8081` — how is 384 produced from 768?
   - First-384 slice of native output?
   - Learned projection layer?
   - Autoencoder compression?
   - Other transformation?
2. Test paired outputs: same 100 queries, 384 ONNX vs. 768 Ollama
3. Classify `dimension_method` in registry: SLICE_FIRST_N, LINEAR_PROJECTION, AUTOENCODER, or UNKNOWN (if unknown after inspection)
4. Record findings in `atlas_representations.notes` and `metadata` JSONB

**Investigation Gate 2: Retrieval Quality Parity**
1. Build comparable eval collections:
   - `codebase_chunks_384_current` — existing system
   - `codebase_chunks_512_mrl_eval` — official MRL truncation
   - `codebase_chunks_768_native_eval` — native output
2. Run on your corpus with your query set, your reranker, your fusion weights
3. Measure: Recall@5/10/20, nDCG@5/10, MRR, latency, storage, index build time
4. Google's published benchmark shows 768 only slightly ahead of 512, so 512 may be a reasonable tradeoff. **Your corpus evaluation must decide.**

**Only after both gates pass**, choose one of:

**Path A: Adopt 768-native as primary**
- If 768 proves superior in your retrieval evaluation and derivation is a concern
- Create new collection, reindex, validate parity, switch aliases
- Archive 384 collection only after rollback window

**Path B: Keep 384-dim with documented derivation**
- If 384 retrieval quality is competitive or superior in your corpus
- Update registry with proven `dimension_method` (not UNKNOWN)
- Mark as ACTIVE if internal tests confirm it
- 384 remains valid choice for your use case

**Path C: Keep 384, adopt 768 as secondary**
- Dual-read strategy: write 768, read 384 initially
- Migrate gradually as 768 proves itself
- Maintain rollback capability

---

## Proof States (Use This Checklist Instead of "Complete")

Before marking any representation ACTIVE for new indexing, verify these gates:

- [ ] MIGRATION_STATIC_VALIDATION — Migration schema reviewed, no conflicts with existing tables
- [ ] MIGRATION_APPLIED — `npm run drizzle:migrate` succeeded, all tables created
- [ ] OLLAMA_MODEL_IDENTITY_PROBED — `curl http://127.0.0.1:11434/api/tags` confirms `embeddinggemma:latest` available
- [ ] OLLAMA_768_DIMENSION_PROVEN — `/api/embed` request with `dimensions: 768` returns 768-length vector
- [ ] OLLAMA_768_NORMALIZATION_PROVEN — Returned vector norm ≈ 1.0 (within 1e-4)
- [ ] OLLAMA_PROMPT_CONTRACT_VERIFIED — Query vs. document prompt formatting tested and documented
- [ ] OLLAMA_MRL_512_TESTED — `/api/embed` with `dimensions: 512` works, returns re-normalized vector
- [ ] OLLAMA_MRL_256_TESTED — `/api/embed` with `dimensions: 256` works, returns re-normalized vector
- [ ] OLLAMA_MRL_128_TESTED — `/api/embed` with `dimensions: 128` works, returns re-normalized vector
- [ ] ONNX_384_ENDPOINT_RESPONDS — `curl http://127.0.0.1:8081/health` returns 200
- [ ] ONNX_384_DERIVATION_INSPECTED — ONNX graph analyzed, derivation method identified or documented as UNKNOWN
- [ ] ONNX_384_PAIRED_OUTPUTS_TESTED — 384 ONNX vs. 768 Ollama on 100 samples, correlation computed
- [ ] QDRANT_DIMENSION_AUDIT_RUN — `audit-qdrant-representations.mjs` executed, collection classification confirmed
- [ ] QDRANT_PAYLOAD_AUDIT_RUN — Sampled collection points, verified payload structure and representation_id
- [ ] RETRIEVAL_ABLATION_PLANNED — 384, 512, 768 eval collections staged, ready for evaluation run
- [ ] RETRIEVAL_ABLATION_RUN — Corpus retrieval evaluation complete: 384 vs 512 vs 768 quality metrics recorded
- [ ] PHASE110_PRIMARY_REPRESENTATION_SELECTED — Based on proof gates + evaluation, one representation chosen as primary
- [ ] POSTGRES_QDRANT_PARITY_SAMPLED — Post-migration verification: Postgres artifact ID matches Qdrant payload
- [ ] PHASE110_PRODUCTION_READY — All gates pass, representation verified, new indexing can begin

---

## Deployment Sequence

### Phase 0: Static Validation (Before any runtime work)

```bash
# Review migration ordering
ls -la sveltekit-frontend/drizzle/ | tail -20

# Check for conflicts with existing tables
grep -E "atlas_representations|atlas_representation_fallbacks|atlas_qdrant_collection_mappings" \
  sveltekit-frontend/drizzle/*.sql | head -5

# Do NOT apply yet — schema review only
```

**Gate**: Migration adds 3 tables, no DROP, no ALTER existing tables. ✅

### Phase 1: Runtime Identity Probing (15-30 minutes)

**Goal**: Confirm Ollama 768, MRL truncations, and ONNX 384 actually work as claimed.

```bash
# 1. Probe Ollama capabilities
curl http://127.0.0.1:11434/api/tags | jq '.models[] | select(.name | contains("embeddinggemma")) | {name, digest}'

# 2. Test 768-native dimension
curl http://127.0.0.1:11434/api/embed \
  -H "Content-Type: application/json" \
  -d '{"model":"embeddinggemma","input":"test query","dimensions":768}' | jq '.embeddings[0] | length'
# Expected: 768

# 3. Test normalization
# Save response to file, compute norm in TypeScript (see validator module)

# 4. Test MRL truncations (512, 256, 128)
for dim in 512 256 128; do
  curl http://127.0.0.1:11434/api/embed \
    -H "Content-Type: application/json" \
    -d "{\"model\":\"embeddinggemma\",\"input\":\"test\",\"dimensions\":$dim}" \
    | jq ".embeddings[0] | length"
done
# Expected: 512, 256, 128 respectively

# 5. Probe ONNX health
curl http://127.0.0.1:8081/health | jq '.'

# Record findings for gate tracking
```

**Gate marked**: OLLAMA_MODEL_IDENTITY_PROBED ✓ (or note failures)

### Phase 2: Paired Output Testing (20-30 minutes)

**Goal**: Compare 384 ONNX derivation against 768 native to classify the 384 representation.

```bash
cd sveltekit-frontend

# Run paired output test (pseudocode — implement as npm script)
# For 100 fixed queries:
#   - Embed with Ollama 768 native
#   - Embed with ONNX 384
#   - Compute cosine similarity
#   - Test candidate derivations (slice-first-384, learned-projection, etc.)

# Expected output: JSON with similarities, inferred dimension_method, confidence
# Store in: docs/audits/384-derivation-probe-{timestamp}.json
```

**Gate marked**: ONNX_384_DERIVATION_INSPECTED, ONNX_384_PAIRED_OUTPUTS_TESTED

### Phase 3: Apply Registry Migration (5-10 minutes)

**Only after Phases 1-2 complete.** Migration adds schema without modifying existing data.

```bash
cd sveltekit-frontend

# Apply the migration
npm run drizzle:migrate

# Verify tables created
npx tsx -e "
  const { db } = await import('./src/lib/server/db/client.js');
  const result = await db.query.atlasRepresentations.findMany({ limit: 1 });
  console.log('Schema applied:', result.length >= 0);
"
```

**Gate marked**: MIGRATION_APPLIED

### Phase 4: Qdrant Audit (5-10 minutes)

**Goal**: Classify existing collections and identify any mismatches.

```bash
cd sveltekit-frontend
export QDRANT_URL=http://127.0.0.1:6333

# Run audit
node ../scripts/atlas/audit-qdrant-representations.mjs

# Review recommendations
jq '.recommendations | .[] | {severity, issue, affected}' \
  docs/reports/qdrant-representation-audit.json
```

**Gate marked**: QDRANT_DIMENSION_AUDIT_RUN, QDRANT_PAYLOAD_AUDIT_RUN

### Phase 5: Retrieval Ablation (1-2 hours)

**Goal**: Evaluate 384 current vs. 512 MRL vs. 768 native on your corpus.

```bash
# Stage eval collections (if not already present)
# - codebase_chunks_384_current (existing)
# - codebase_chunks_512_eval (re-embed with Ollama 512)
# - codebase_chunks_768_eval (re-embed with Ollama 768)

# Run your judgment query set against all three
# Measure: Recall@5/10/20, nDCG@5/10, MRR, latency, storage
# Record in: docs/audits/retrieval-ablation-{timestamp}.json

# Decision: Which representation best fits your use case?
```

**Gate marked**: RETRIEVAL_ABLATION_RUN

### Phase 6: Select Primary Representation (Decision Point)

Based on proof gates + evaluation results, decide:

- **Path A**: 768-native primary (if superior quality + derivation confidence)
- **Path B**: 384-custom primary (if retrieval quality competitive + derivation proven)
- **Path C**: Dual-read strategy (768 new, read 384 initially)

Update `atlas_representations`:
```sql
UPDATE atlas_representations
  SET lifecycle_status = 'ACTIVE'
  WHERE representation_id = 'embeddinggemma_300m_768_native_ollama_v1'
  AND verification_status = 'SAMPLE_VERIFIED';
  
-- Record the decision and rationale in notes
UPDATE atlas_representations
  SET notes = 'PRIMARY for Phase 110 semantic lane. Selected after retrieval ablation: ...'
  WHERE representation_id = 'embeddinggemma_300m_768_native_ollama_v1';
```

**Gate marked**: PHASE110_PRIMARY_REPRESENTATION_SELECTED

### Phase 7: Wire Phase 110 Indexing (Implementation)

**Only after Phase 6 decision is made.**

Update Phase 110 indexing to accept and verify the selected representation:

```bash
# Updated semantic lane indexing with representation verification
npm run phase110:index:semantic -- \
  --representation-id embeddinggemma_300m_768_native_ollama_v1 \
  --verify-contract
```

### Phase 8: Post-Indexing Validation (Spot Check)

After Phase 110 indexing completes:

```bash
# Verify sampled collection points match Postgres artifact records
# - Postgres artifact ID matches Qdrant payload
# - Dimensions correct (768)
# - Normalization correct
# - Workspace revision matched

# Update atlas_qdrant_collection_mappings with verification_status = 'VERIFIED_MATCH'
```

**Gate marked**: POSTGRES_QDRANT_PARITY_SAMPLED

---

## Validation Checklist

**Before Phase 110 production indexing**, all proof gates must pass (use "Proof States" section above):

- [ ] MIGRATION_STATIC_VALIDATION — Schema reviewed
- [ ] MIGRATION_APPLIED — Tables created
- [ ] OLLAMA_MODEL_IDENTITY_PROBED — Model available
- [ ] OLLAMA_768_DIMENSION_PROVEN — 768-length vectors returned
- [ ] OLLAMA_768_NORMALIZATION_PROVEN — Norm ≈ 1.0
- [ ] OLLAMA_PROMPT_CONTRACT_VERIFIED — Query/document formatting tested
- [ ] OLLAMA_MRL_512_TESTED, _256_TESTED, _128_TESTED — Truncations work
- [ ] ONNX_384_ENDPOINT_RESPONDS — Health check passes
- [ ] ONNX_384_DERIVATION_INSPECTED — Dimension method identified (or UNKNOWN + noted)
- [ ] ONNX_384_PAIRED_OUTPUTS_TESTED — Correlation computed
- [ ] QDRANT_DIMENSION_AUDIT_RUN — Collection classification complete
- [ ] QDRANT_PAYLOAD_AUDIT_RUN — Sample points verified
- [ ] RETRIEVAL_ABLATION_PLANNED — Eval collections staged
- [ ] RETRIEVAL_ABLATION_RUN — Quality metrics recorded (384 vs. 512 vs. 768)
- [ ] PHASE110_PRIMARY_REPRESENTATION_SELECTED — Decision made with evidence
- [ ] Indexing scripts wire `--representation-id` parameter
- [ ] POSTGRES_QDRANT_PARITY_SAMPLED — Post-indexing spot check passes

---

## Reference Architecture

```
Phase 110 Indexing Request
  ↓
Declare representation_id (e.g., embeddinggemma_300m_768_native_ollama_v1)
  ↓
Query atlas_representations → Load contract
  ↓
Validate health: /api/embeddings or /health endpoint
  ↓
Check Postgres atlas_qdrant_collection_mappings
  ↓
Verify Qdrant dimensions match claimed dimensions
  ↓
Index semantic lane with verified representation
  ↓
Write to Qdrant collection + atlas_qdrant_collection_mappings (VERIFIED_MATCH)
  ↓
Post-indexing audit: run audit-qdrant-representations.mjs
  ↓
All collections verified ✅
```

---

## Next Steps

1. **Apply registry migration**: `npm run drizzle:migrate`
2. **Run Qdrant audit**: Identify current collection states and mismatches
3. **Plan collection migrations**: Decide Option A (768-dim) or Option B (re-register 384)
4. **Validate representations**: Confirm health checks pass
5. **Wire Phase 110 scripts**: Add `--representation-id` parameter to indexing
6. **Execute Phase 110**: Index with representation contract verification
7. **Post-index validate**: Confirm all collections have VERIFIED_MATCH status

---

## Summary

**This document provides the registry infrastructure. The actual canonical representation for Phase 110 is determined by proof, not assumption.**

### What This Infrastructure Enables

1. **Register** all representations in `atlas_representations` with metadata (model, dimensions, derivation method, runtime, endpoint)
2. **Probe** runtime behavior (dimensions, normalization, prompt contracts) via validator module
3. **Audit** existing Qdrant collections to identify provenance and mismatches
4. **Evaluate** candidate representations (384 current, 512 MRL, 768 native) on your corpus
5. **Select** the primary representation based on proven quality + derivation confidence
6. **Track** representation lifecycle (CANDIDATE → ACTIVE → DEPRECATED) with evidence

### What This Infrastructure Does NOT Do

- ❌ Declare 768 canonical without runtime proof
- ❌ Mark 384 deprecated without investigation
- ❌ Force a migration before quality evaluation
- ❌ Assume metadata matching = vector space compatibility

### Evidence-Based Decision Making

**Starting point**: 768-native is the leading candidate (Google-documented output). 512 MRL is officially supported. 384-custom is undocumented and requires investigation.

**Decision point** (Phase 5 above): After running retrieval ablation on your corpus, one of these is selected as primary:
- **768-native primary** — if superior quality or 384 derivation is problematic
- **384-custom primary** — if retrieval quality is competitive and derivation is documented
- **Dual-read** — migrate gradually while maintaining rollback

**No representation becomes canonical until the proof gates in the "Proof States" section are marked ✓.**
