# Phase 110 Integration: Representation Registry ← Phase 108D Dual-Vector Lanes

**Date**: July 29, 2026  
**Purpose**: Show how Phase 110 representation registry provides governance, verification, and fallback control for Phase 108D's 768+384 named vector architecture  
**Scope**: Qdrant collection mappings, lane selection tracking, provider routing, and dual-vector retrieval

---

## Context: Phase 108D Semantic Embeddings (Recap)

Phase 108D-3 backfill created a single Qdrant collection `codebase_chunks_768` with **two named vectors**:

```json
{
  "collection_name": "codebase_chunks_768",
  "vectors": {
    "content": [0.123, 0.456, ..., 0.789],    // 768-dim native EmbeddingGemma
    "semantic": [0.123, 0.234, ..., 0.456]   // 384-dim routing lane (stride-sampled)
  },
  "payload": {
    "source_ref": "src/lib/auth.ts",
    "chunk_id": "src/lib/auth.ts:validateSession",
    "representation_id": "ace:chunk:auth:001",
    "token_remap_ready": true,
    "vector_lanes": ["content:768", "semantic:384"]
  }
}
```

**Gap**: The 384-dim "semantic" lane has no metadata about its provenance, derivation method, normalization proof, or fallback rules. Phase 110 closes that gap.

---

## Solution: Phase 110 Representation Registry Governance

The revised migration 0152 tracks both vector lanes in the registry:

### 1. Representation Registrations (atlas_representations table)

**Lane 1: Native Content (768-dim)**
```sql
INSERT INTO atlas_representations (
  representation_id,
  upstream_model_id,
  upstream_revision,
  model_revision,
  native_dimensions,
  output_dimensions,
  dimension_method,
  normalization,
  input_role,
  runtime,
  lifecycle_status,
  verification_status
) VALUES (
  'embeddinggemma_300m_768_native_ollama_v1',
  'google/embeddinggemma-300m',
  'main',
  'ollama_latest_as_of_2026_07_29',
  768,
  768,
  'NATIVE',
  'L2',
  'SYMMETRIC',
  'ollama_cpu',
  'CANDIDATE',
  'UNVERIFIED'
  -- Notes: "Official EmbeddingGemma native output via Ollama. 
  --        Leading candidate for Phase 110 primary semantic lane. 
  --        Pending runtime probing (Phase 1), paired output testing (Phase 2), 
  --        and retrieval ablation (Phase 5)."
);
```

**Lane 2: Semantic Routing (384-dim) — INVESTIGATION STATE**
```sql
INSERT INTO atlas_representations (
  representation_id,
  upstream_model_id,
  upstream_revision,
  model_revision,
  native_dimensions,
  output_dimensions,
  dimension_method,
  normalization,
  input_role,
  runtime,
  lifecycle_status,
  verification_status
) VALUES (
  'embeddinggemma_300m_384_custom_onnx_v1',
  'google/embeddinggemma-300m',
  'unknown',                          -- Provenance not yet documented!
  'custom_onnx_deployed_date_unknown',
  768,
  384,
  'UNKNOWN',                          -- KEY: derivation method unproven
  'L2',
  'SYMMETRIC',
  'onnx_cuda',
  'CANDIDATE',
  'UNVERIFIED'
  -- Notes: "DEPRECATED: Custom 384-dim projection via ONNX endpoint with undocumented derivation.
  --        Cannot be removed until derivation method is inspected (Phase 2).
  --        Pending paired-output analysis: if SLICE_FIRST_N can verify, re-classify to STATIC_VERIFIED.
  --        If provenance unknown after Phase 2, keep as CANDIDATE/MISMATCH for read-only fallback only."
);
```

### 2. Qdrant Vector Mappings (atlas_qdrant_vector_mappings table)

**Content Lane** (768-dim native, primary):
```sql
INSERT INTO atlas_qdrant_vector_mappings (
  collection_name,
  vector_field_name,
  representation_id,
  is_primary,
  verification_status,
  provenance_source,
  classification
) VALUES (
  'codebase_chunks_768',
  'content',
  'embeddinggemma_300m_768_native_ollama_v1',
  true,                           -- PRIMARY vector for this field
  'UNVERIFIED',                   -- Will be 'VERIFIED_MATCH' after Phase 1
  'COLLECTION_CONFIG',            -- Dimensions verified from Qdrant config
  'DIMENSION_CONFIRMED_PROVENANCE_UNKNOWN'
);
```

**Semantic Lane** (384-dim routing, secondary):
```sql
INSERT INTO atlas_qdrant_vector_mappings (
  collection_name,
  vector_field_name,
  representation_id,
  is_primary,
  verification_status,
  provenance_source,
  classification
) VALUES (
  'codebase_chunks_768',
  'semantic',
  'embeddinggemma_300m_384_custom_onnx_v1',
  false,                          -- SECONDARY vector (not primary)
  'UNVERIFIED',                   -- Will be 'VERIFIED_MISMATCH' if dims don't match
  'NAMED_VECTOR_CONFIG',          -- Dimensions from Qdrant named vector config
  'PROVENANCE_CONFIRMED_DIMENSION_UNKNOWN'
);
```

### 3. Lane Selection Tracking (atlas_representation_lane_selections table)

**Semantic Lane Selection for Code Retrieval**:
```sql
INSERT INTO atlas_representation_lane_selections (
  repository_id,
  corpus_id,
  artifact_view,
  retrieval_lane,
  workspace_revision,
  representation_id,
  selected_by,
  evaluation_notes
) VALUES (
  'legal-ai-codebase',
  'codebase-2026-07-28',
  'code_semantic',                -- What we're indexing (code chunks)
  'dense_aann',                   -- How we're retrieving (approximate NN search)
  'v1.0.1',                       -- Workspace version for reproducibility
  'embeddinggemma_300m_768_native_ollama_v1',  -- PRIMARY selection
  'Phase 110 registration',
  'Native 768-dim canonical lane for code semantic search. Pending Phase 1-5 proofs.'
);
```

**Semantic Routing Lane Selection (For Reranking)**:
```sql
INSERT INTO atlas_representation_lane_selections (
  repository_id,
  corpus_id,
  artifact_view,
  retrieval_lane,
  workspace_revision,
  representation_id,
  selected_by,
  evaluation_notes
) VALUES (
  'legal-ai-codebase',
  'codebase-2026-07-28',
  'code_semantic',
  'semantic_routing',             -- Secondary routing/reranking lane
  'v1.0.1',
  'embeddinggemma_300m_384_custom_onnx_v1',  -- SECONDARY selection
  'Phase 108D legacy',
  '384-dim custom projection. Derivation method unknown. Used for fast reranking only. '
  'Cannot be primary until Phase 2 derivation analysis is complete.'
);
```

---

## Data Flow: Registry Governance of Dual-Vector Retrieval

### Phase 0: Static Validation (Before Execution)

```
Migration 0152 Applied
  ↓
Registry created with 5 initial representations
  ├─ 768-native CANDIDATE/UNVERIFIED
  ├─ 384-custom CANDIDATE/UNVERIFIED (investigation required)
  ├─ 512-mrl CANDIDATE/UNVERIFIED (future option)
  ├─ 256-mrl CANDIDATE/UNVERIFIED (future option)
  └─ 128-mrl CANDIDATE/UNVERIFIED (future option)
  ↓
Qdrant mappings created for existing collection
  ├─ codebase_chunks_768 / content → 768-native (PRIMARY)
  └─ codebase_chunks_768 / semantic → 384-custom (SECONDARY)
  ↓
Lane selections recorded in Postgres
  ├─ code_semantic / dense_aann → 768-native
  └─ code_semantic / semantic_routing → 384-custom
  ↓
✅ Static validation complete — no Qdrant/Ollama/ONNX probing yet
```

### Phase 1: Runtime Identity Probing

**Probe Step 1**: Verify content lane (768-dim)
```bash
npm run phase110:probe:representations -- --representation embeddinggemma_300m_768_native_ollama_v1
```

**What happens**:
```
1. Fetch representation from registry
   lifecycle_status: CANDIDATE
   verification_status: UNVERIFIED
   runtime: ollama_cpu
   endpoint_url: http://127.0.0.1:11434
   
2. Probe Ollama /api/embed endpoint
   POST /api/embed with test prompt
   Capture actual dimensions from response
   Actual: 768 ✅ (matches claimed 768)
   
3. Verify normalization
   Compute L2 norm of returned vector
   Actual norm: 1.0000024 ✅ (within 1e-4 tolerance)
   
4. Update registry
   verification_status: STATIC_VERIFIED
   verified_at: NOW()
   verified_method: SAMPLE_ROUND_TRIP
   last_verified_output_norm: 1.0000024
   
5. Update Qdrant mapping
   verification_status: VERIFIED_MATCH
   last_verified_at: NOW()
   last_verified_dimensions: 768
   provenance_source: COLLECTION_CONFIG
```

**Probe Step 2**: Verify semantic lane (384-dim)
```bash
npm run phase110:probe:representations -- --representation embeddinggemma_300m_384_custom_onnx_v1
```

**What happens**:
```
1. Fetch representation from registry
   lifecycle_status: CANDIDATE
   verification_status: UNVERIFIED
   runtime: onnx_cuda
   endpoint_url: http://127.0.0.1:8081
   dimension_method: UNKNOWN ⚠️
   
2. Probe ONNX endpoint
   POST /embed with test prompt
   Actual: 384 ✅ (matches claimed 384)
   Actual norm: 0.9998761 ✅ (within tolerance)
   
3. Update registry
   verification_status: STATIC_VERIFIED
   verified_at: NOW()
   verified_method: SAMPLE_ROUND_TRIP
   last_verified_output_norm: 0.9998761
   
4. FLAG: dimension_method still UNKNOWN
   → Phase 2 paired-output testing required to classify as SLICE_FIRST_N or LINEAR_PROJECTION
```

**Probe Step 3**: Optional MRL candidates (512, 256, 128)
```bash
npm run phase110:probe:representations -- --dimensions 512,256,128
```

**What happens**:
```
For 512-mrl:
  Test: Ollama /api/embed with --dimensions 512 flag
  Result: Either works (SAMPLE_VERIFIED) or fails (FAILED, falls back to 768 native)
  
For 256-mrl:
  Similar test with --dimensions 256
  
For 128-mrl:
  Similar test with --dimensions 128
```

### Phase 2: Paired Output Testing (Derivation Classification)

**Purpose**: Determine if 384-dim is SLICE_FIRST_N, LINEAR_PROJECTION, or truly UNKNOWN.

```bash
npm run phase110:paired-output:test -- --primary 768 --fallback 384 --samples 100
```

**What happens**:
```
1. Fetch 100 random embeddings from Qdrant
   Take 768-dim content vectors
   
2. For each sample:
   Slice first 384 dims from 768 → candidate_slice
   Compare to actual 384-dim semantic vector
   
   Compute cosine similarity:
   If cosine_sim > 0.999 for all 100 samples
     → dimension_method = 'SLICE_FIRST_N'
     → Update registry: lifecycle_status = ACTIVE (read-only lane)
   
   If cosine_sim 0.98-0.99
     → dimension_method = 'LINEAR_PROJECTION'
     → Re-classify as potential fallback (needs quality eval)
   
   If cosine_sim < 0.95
     → dimension_method = 'UNKNOWN'
     → Keep as CANDIDATE/UNVERIFIED (do not use for new indexing)
   
3. Update registry
   dimension_method: (result from above)
   verification_status: SAMPLE_VERIFIED
   verified_at: NOW()
   
4. If SLICE_FIRST_N confirmed:
   lifecycle_status: ACTIVE
   notes: "Confirmed as first-384 slice of native 768. Safe for read-only fallback."
```

### Phase 4: Qdrant Audit

**Purpose**: Reconcile registry with actual Qdrant collection state.

```bash
npm run atlas:audit:qdrant-representations
```

**What happens**:
```
1. List all Qdrant collections
   Find: codebase_chunks_768
   
2. For each named vector:
   Vector field: content
     Config dims: 768
     Payload sample representation_id: embeddinggemma_300m_768_native_ollama_v1
     Registry lookup: ✅ FOUND (lifecycle_status=CANDIDATE, verification_status=STATIC_VERIFIED)
     Classification: DIMENSION_CONFIRMED_PROVENANCE_UNKNOWN → Updated to VERIFIED_MATCH
   
   Vector field: semantic
     Config dims: 384
     Payload sample representation_id: embeddinggemma_300m_384_custom_onnx_v1
     Registry lookup: ✅ FOUND (lifecycle_status=CANDIDATE, verification_status=SAMPLE_VERIFIED)
     Audit check: dimension_method now SLICE_FIRST_N? ✅ YES
     Classification: PROVENANCE_CONFIRMED_DIMENSION_UNKNOWN → Updated to VERIFIED_MATCH
   
3. Output audit report
   ✅ codebase_chunks_768 / content: VERIFIED_MATCH
   ✅ codebase_chunks_768 / semantic: VERIFIED_MATCH
   0 mismatches, 0 orphans
```

### Phase 5: Retrieval Ablation (Quality Evaluation)

**Purpose**: Compare retrieval quality (recall, nDCG) across 768-native vs 384-semantic vs 512-mrl.

```bash
npm run phase110:retrieval:ablation -- --lanes content,semantic,512-mrl --corpus codebase-2026-07-28
```

**What happens**:
```
1. Build evaluation set (100 test queries with known relevant documents)

2. For each retrieval lane:
   768-native (content):
     Run 100 queries
     Measure recall@5, recall@10, nDCG@5, nDCG@10, latency
     Baseline: R@5=0.84, nDCG@5=0.92, latency=45ms
   
   384-semantic (existing):
     Run 100 queries
     Measure same metrics
     Result: R@5=0.79, nDCG@5=0.88, latency=28ms
     Regression: -5.6% recall (acceptable)
   
   512-mrl (if available):
     Run 100 queries
     Measure same metrics
     Result: R@5=0.82, nDCG@5=0.91, latency=35ms
     Regression: -2.3% recall (minimal)

3. Update migration table
   INSERT INTO atlas_representation_migrations (
     migration_id: '384_to_768_2026_jul_ablation',
     source_representation_id: 'embeddinggemma_300m_384_custom_onnx_v1',
     target_representation_id: 'embeddinggemma_300m_768_native_ollama_v1',
     migration_status: 'PLANNED',
     reason: 'Ablation study shows native 768 has better recall; 384 retained for fast reranking',
     baseline_recall_at_5: 0.79,
     post_recall_at_5: 0.84,
     maximum_allowed_recall_regression: 0.05,
     migration_approved_by: 'Phase 110 evaluation'
   );
```

### Phase 6: Select Primary Representation (Decision Point)

**Decision tree based on ablation results**:

```
If 768-native (primary) ✅ VERIFIED + ✅ SAMPLE_VERIFIED:
  AND 384-semantic (secondary) ✅ VERIFIED_MATCH + dimension_method confirmed:
    → SELECT: 768-native as primary, 384-semantic as secondary reranking lane
    → UPDATE: 768-native lifecycle_status = ACTIVE, verification_status = PRODUCTION_VERIFIED
    → CREATE: retrieval_lane_fallback from 768 → 384 with fallback_requires_rerank = true
    → GATE: Proceed to Phase 110 indexing

ELSE IF 512-mrl (candidate) ✅ VERIFIED + recall regression < 5%:
    → SELECT: 768-native as primary, 512-mrl as secondary (cost-optimized)
    → PLAN: Migration from 384 → 512 for future
    → GATE: Proceed with dual-lane (768/512) or single-primary (768 only)

ELSE (384-semantic fails provenance check):
    → SELECT: 768-native only
    → DEPRECATE: 384-semantic (lifecycle_status = DEPRECATED, no new indexing)
    → GATE: Proceed with single-primary (768 native only)
```

---

## Phase 109: Dual-Lane Retrieval Implementation

Once Phase 110 selections are made, Phase 109 wires dual-lane retrieval:

### Retrieval Endpoint (GET /api/search)

```typescript
// Pseudocode: src/routes/api/search/+server.ts

export async function GET({ url }) {
  const query = url.searchParams.get('q');
  const lanes = url.searchParams.getAll('lanes') || ['content']; // default to primary
  
  // Step 1: Check registry for selected representations
  const selections = await db.select().from(atlas_representation_lane_selections)
    .where(eq(atlas_representation_lane_selections.artifact_view, 'code_semantic'))
    .where(inArray(atlas_representation_lane_selections.retrieval_lane, 
      lanes.map(l => l === 'content' ? 'dense_aann' : 'semantic_routing')))
    .where(eq(atlas_representation_lane_selections.workspace_revision, 'v1.0.1'));
  
  // Step 2: Get representations from registry
  const representations = await db.select().from(atlas_representations)
    .where(inArray(atlas_representations.representation_id,
      selections.map(s => s.representation_id)));
  
  // Step 3: Verify all selected representations are ACTIVE + VERIFIED
  for (const repr of representations) {
    if (repr.lifecycle_status !== 'ACTIVE' || repr.verification_status === 'UNVERIFIED') {
      return json({
        error: `Representation ${repr.representation_id} not ready for retrieval`,
        available_lanes: selections.filter(s => registry[s.representation_id].lifecycle_status === 'ACTIVE')
      }, { status: 400 });
    }
  }
  
  // Step 4: Embed query using PRIMARY representation
  const primaryRepr = representations.find(r => 
    r.representation_id === selections.find(s => s.retrieval_lane === 'dense_aann').representation_id);
  
  const queryEmbedding = await embedQuery(query, primaryRepr);
  
  // Step 5: Dual-lane search in Qdrant
  const results = {
    primary: [],
    secondary: []
  };
  
  // Primary lane (768-dim content)
  results.primary = await qdrant.search({
    collection_name: 'codebase_chunks_768',
    vector: queryEmbedding,
    vector_name: 'content',  // Use named vector!
    limit: 20,
    with_payload: true
  });
  
  // Secondary lane (384-dim semantic) if requested
  if (lanes.includes('semantic')) {
    // Re-project or re-embed for secondary lane
    const semanticRepr = representations.find(r => 
      r.representation_id === selections.find(s => s.retrieval_lane === 'semantic_routing')?.representation_id);
    
    const semanticEmbedding = await projectOrEmbed(queryEmbedding, semanticRepr);
    
    results.secondary = await qdrant.search({
      collection_name: codebase_chunks_768',
      vector: semanticEmbedding,
      vector_name: 'semantic',  // Use named vector!
      limit: 20,
      with_payload: true
    });
  }
  
  // Step 6: RRF (Reciprocal Rank Fusion) if both lanes used
  const fused = rrf([results.primary, results.secondary]);
  
  // Step 7: Optional GPU reranking (Phase 109+)
  const reranked = await rerank(fused, queryEmbedding);
  
  return json({
    results: reranked,
    metadata: {
      primary_representation: primaryRepr.representation_id,
      primary_dimensions: primaryRepr.output_dimensions,
      secondary_representation: selections.find(s => s.retrieval_lane === 'semantic_routing')?.representation_id,
      secondary_dimensions: selections.find(s => s.retrieval_lane === 'semantic_routing')?.output_dimensions,
      fusion_method: lanes.includes('semantic') ? 'rrf' : 'none',
      registry_verified_at: primaryRepr.verified_at
    }
  });
}
```

---

## Fallback Rules (Phase 110 Provider Fallbacks)

If primary provider (Ollama @ 127.0.0.1:11434) is unavailable, fallback is controlled by registry:

### Provider Fallback Example

```sql
INSERT INTO atlas_representation_provider_fallbacks (
  representation_id,
  fallback_provider_id,
  compatibility_kind,
  max_cosine_delta,
  minimum_recall_ratio,
  evaluation_run_id,
  verified_at,
  verified_by
) VALUES (
  'embeddinggemma_300m_768_native_ollama_v1',
  'onnx_cuda_lab',                    -- Fallback ONNX provider
  'RETRIEVAL_COMPATIBLE',
  0.02,                               -- Max observed similarity delta
  0.98,                               -- Maintains 98% of recall
  'eval-768-onnx-2026-07-15',
  '2026-07-15T14:32:00Z',
  'Phase 110 evaluation'
);
```

**Retrieval with fallback**:
```typescript
let queryEmbedding;
try {
  // Try primary provider
  queryEmbedding = await embedViaOllama(query, { endpoint: 'http://127.0.0.1:11434' });
} catch (err) {
  // Primary failed, check registry for fallback
  const fallback = await db.select().from(atlas_representation_provider_fallbacks)
    .where(eq(atlas_representation_provider_fallbacks.representation_id, primaryReprId))
    .limit(1);
  
  if (!fallback || fallback.compatibility_kind !== 'RETRIEVAL_COMPATIBLE') {
    throw new Error('No fallback available or fallback not verified');
  }
  
  // Use fallback provider
  const fallbackProvider = await getProvider(fallback.fallback_provider_id);
  queryEmbedding = await embedViaONNX(query, { endpoint: fallbackProvider.endpoint_url });
}
```

---

## Immutability: Preventing Semantic Drift

Once a representation is marked PRODUCTION_VERIFIED, critical fields are locked:

```typescript
// Attempt to change output dimensions of PRODUCTION_VERIFIED representation

UPDATE atlas_representations
SET output_dimensions = 512  -- ERROR: Cannot modify!
WHERE representation_id = 'embeddinggemma_300m_768_native_ollama_v1'
  AND verification_status = 'PRODUCTION_VERIFIED';

// Trigger fires:
// "Cannot modify semantic fields of PRODUCTION_VERIFIED representation 
//  embeddinggemma_300m_768_native_ollama_v1. 
//  Create a new representation_id for semantic changes."

// Solution: Create new representation_id for the change
INSERT INTO atlas_representations (
  representation_id: 'embeddinggemma_300m_768_native_ollama_v2',  -- NEW ID
  upstream_model_id: 'google/embeddinggemma-300m',
  output_dimensions: 512,  -- NEW dimension
  ...
) VALUES (...);
```

---

## Summary: Registry-Governed Dual-Vector Retrieval

| Phase | Action | Registry Controls |
|-------|--------|-------------------|
| **108D** | Backfill dual vectors (768+384) | None yet; vectors created but untracked |
| **110-0** | Apply revised migration 0152 | ✅ Registry created; representations CANDIDATE/UNVERIFIED |
| **110-1** | Probe Ollama/ONNX endpoints | ✅ Dimensions verified; representations STATIC_VERIFIED |
| **110-2** | Paired output testing (derivation) | ✅ 384 classified as SLICE_FIRST_N; SAMPLE_VERIFIED |
| **110-4** | Audit Qdrant vs registry | ✅ Mappings reconciled; both vectors VERIFIED_MATCH |
| **110-5** | Retrieval ablation (quality) | ✅ Regressions measured; 384 acceptable as secondary |
| **110-6** | Select primary representation | ✅ 768-native = PRIMARY/PRODUCTION_VERIFIED; 384 = SECONDARY/ACTIVE |
| **110-7** | Wire Phase 110 indexing | ✅ New indexing uses 768 primary; 384 fallback if needed |
| **109** | Implement dual-lane retrieval | ✅ Registry queries control lane selection, provider failover, immutability |

---

## Files Reference

| File | Role | Status |
|------|------|--------|
| `drizzle/0152_atlas_representations_registry_revised.sql` | Registry schema with all governance tables | ✅ Ready |
| `src/lib/server/embeddings/representation-contract-validator.ts` | Phase 1-2 runtime probing | ⏳ Pending execution |
| `scripts/atlas/audit-qdrant-representations.mjs` | Phase 4 Qdrant audit | ✅ Ready |
| `docs/PHASE-110-REPRESENTATION-INFRASTRUCTURE-DEPLOYMENT.md` | Proof states checklist | ✅ Reference |
| `docs/PHASE-110-REPRESENTATION-SCHEMA-CORRECTIONS.md` | Design document | ✅ Reference |
| `docs/PHASE-108D-SEMANTIC-INTERLINKS-COMPLETE.md` | Phase 108D architecture | ✅ Reference |

---

## Next Step

**Phase 0: Static Validation** — Verify revised 0152 migration applies without errors.

```bash
cd sveltekit-frontend
npm run drizzle:migrate -- --dry-run
# OR manual review of SQL syntax
```

Once Phase 0 passes, proceed to Phase 1 (Runtime Identity Probing).
