# Phase 110 Representation Specification Update

**Status**: CRITICAL REFINEMENT (Pre-Implementation)  
**Date**: July 29, 2026  
**Supersedes**: Phase 110 spec generic "dense embeddings" references

---

## Problem Statement

The Phase 110 spec references "dense embeddings" and "versioned dense embeddings" without specifying:
- Which model produces them
- What dimensions they should have
- How representation changes are tracked
- How fallback chains are validated

Current state: 384-dimensional custom projections exist in production without documented provenance. Assuming 384 is canonical violates the spec's principle that "Postgres is authority."

---

## Solution: Explicit Representation ID Registration

All embedding representations used in Phase 110 indexing **must** be registered in `atlas_representations` with:

1. **representation_id** (unique stable key)
2. **model_id** (e.g., "embeddinggemma")
3. **model_revision** (specific pinned version)
4. **native_dimensions** (what the model outputs before projection)
5. **output_dimensions** (what we actually use)
6. **dimension_method** (NATIVE, MRL_TRUNCATE, LINEAR_PROJECTION, AUTOENCODER, UNKNOWN)
7. **normalization** (L2, NONE)
8. **runtime** (ollama_cpu, onnx_cuda, grpc_service, etc.)
9. **endpoint_url** (where this representation lives)
10. **verified_at** (proof this representation actually works)
11. **verified_method** (HEALTH_CHECK, SAMPLE_ROUND_TRIP, PRODUCTION_LIVE)
12. **is_active** (whether it's currently in use)

---

## Updated Phase 110 Semantic Lane Specification

### Before (Vague)

> Use versioned dense embeddings over controlled views:
> - symbol signature + bounded body
> - symbol card
> - file/module summary
> - documentation section
> - error/test description

### After (Explicit)

> Use registered dense embeddings from `atlas_representations` where `is_active = true`.
>
> **Representation Contract (Mandatory)**:
> 1. Declare which representation_id your indexing lane uses
> 2. Verify representation status via `/api/admin/representations/{representation_id}/health`
> 3. Confirm dimensions, normalization, and runtime match the registered contract
> 4. If using a fallback representation, verify via `atlas_representation_fallbacks` that primary and fallback produce identical output contracts
> 5. After indexing completion, run `scripts/atlas/audit-qdrant-representations.mjs` to verify all Qdrant collections match their registered representations
>
> **Approved Representations for Phase 110** (as of July 29, 2026):
>
> | ID | Model | Output Dims | Method | Status | Notes |
> |---|---|---|---|---|---|
> | `embeddinggemma_300m_768_native_ollama_v1` | EmbeddingGemma | 768 | NATIVE | ACTIVE | Official native output via Ollama (canonical) |
> | `embeddinggemma_300m_512_mrl_ollama_v1` | EmbeddingGemma | 512 | MRL_TRUNCATE | CANDIDATE | Official Matryoshka truncation (not yet deployed) |
> | `embeddinggemma_300m_256_mrl_ollama_v1` | EmbeddingGemma | 256 | MRL_TRUNCATE | CANDIDATE | Official Matryoshka truncation (not yet deployed) |
> | `embeddinggemma_300m_128_mrl_ollama_v1` | EmbeddingGemma | 128 | MRL_TRUNCATE | CANDIDATE | Official Matryoshka truncation (not yet deployed) |
> | ~~`embeddinggemma_300m_384_custom_onnx_v1`~~ | EmbeddingGemma | 384 | UNKNOWN | DEPRECATED | Custom projection with unproven derivation (do not use) |
>
> **Recommended for Phase 110**: Use `embeddinggemma_300m_768_native_ollama_v1` as primary with `embeddinggemma_300m_512_mrl_ollama_v1` as fallback once Ollama supports MRL truncation.

---

## Updated Phase 110 Proof Gates

### Gate: Semantic Lane Representation Proof

**Requirement**: Before retrieving from the semantic lane, prove representation contract:

```typescript
// Phase 110 pre-retrieval validation
async function validateSemanticLaneContract() {
  const activeRep = await db.query(`
    SELECT representation_id, output_dimensions, runtime, verified_at
    FROM atlas_representations
    WHERE representation_id IN (
      SELECT representation_id FROM atlas_qdrant_collection_mappings
      WHERE is_primary = true
    )
    AND is_active = true
  `);

  if (!activeRep) {
    throw new Error('No active semantic representation registered');
  }

  // Verify health
  const health = await validateRepresentation(activeRep);
  if (!health.isValid) {
    throw new Error(`Semantic representation health check failed: ${health.checks.contractMismatches}`);
  }

  return activeRep;
}
```

**Success Criteria**:
- ✅ Exactly one active representation registered
- ✅ Representation endpoint is healthy and responsive
- ✅ Actual output dimensions match claimed dimensions
- ✅ Normalization and runtime match registry
- ✅ All Qdrant collections using this representation have verified_status = 'VERIFIED_MATCH'

### Gate: Fallback Eligibility Proof

**Requirement**: If using representation fallbacks, prove they produce identical output contracts:

```typescript
async function validateFallbackChain() {
  const fallbacks = await db.query(`
    SELECT primary_representation_id, fallback_representation_id
    FROM atlas_representation_fallbacks
    WHERE verified_at IS NOT NULL
  `);

  for (const { primary, fallback } of fallbacks) {
    const primaryContract = /* load from atlas_representations */;
    const fallbackContract = /* load from atlas_representations */;

    if (!canFallback(primaryContract, fallbackContract)) {
      throw new Error(`Fallback ${fallback} incompatible with primary ${primary}`);
    }
  }
}
```

**Success Criteria**:
- ✅ All fallback pairs have output_dimensions, normalization, dimension_method identical
- ✅ All fallback pairs have been tested (verified_at is not null)
- ✅ At least 2 fallbacks exist for high-availability representation lanes

---

## Updated Phase 110 Execution Order

**New Step 1 (Pre-indexing)**: Establish representation registry and prove contracts

```bash
# Apply schema migration for atlas_representations
npm run drizzle:migrate -- 0152_atlas_representations_registry.sql

# Validate all registered representations
node scripts/atlas/validate-all-representations.mjs

# Audit current Qdrant collections
node scripts/atlas/audit-qdrant-representations.mjs

# Fix any representation mismatches before proceeding
```

**Updated Step 5 (Dense Projections)**: Now requires explicit representation ID

```bash
# Ensure semantic lane uses registered representation
npm run phase110:index:semantic -- \
  --representation-id embeddinggemma_300m_768_native_ollama_v1 \
  --verify-contract
```

**Updated Step 10 (Proof Gates)**: Add representation proof gates

```bash
npm run phase110:prove:representations
npm run phase110:prove:fallback-chains
npm run phase110:prove:qdrant-representation-parity
```

---

## Migration Path for Existing 384-dim Collections

If you have existing Qdrant collections using the deprecated 384-dim custom projection:

### Option A: Upgrade to 768-dim (Recommended)
1. Register `embeddinggemma_300m_768_native_ollama_v1` as active
2. Create new Qdrant collection with 768-dim embeddings
3. Re-index all content with 768-dim representations
4. Validate parity (count, hash verification)
5. Update Postgres atlas_qdrant_collection_mappings
6. Archive old 384-dim collection

### Option B: Keep 384-dim as Custom Representation
1. Update `embeddinggemma_300m_384_custom_onnx_v1` status to ACTIVE (not DEPRECATED)
2. Document exactly how 384 is derived (e.g., "truncate native 768 to first 384 dims")
3. Update dimension_method from UNKNOWN to actual method (e.g., SLICE_FIRST_N)
4. Verify health endpoint returns matching contract
5. Register fallback chain (768 → 384) if fallback is needed
6. Add explicit notes explaining why custom 384 is necessary

**Recommendation**: Option A is strongly preferred to avoid representation drift and simplify Phase 110 implementation.

---

## Implementation Checklist

Before Phase 110 production indexing:

- [ ] `atlas_representations` table created and seeded
- [ ] All active representations validated via health checks
- [ ] Qdrant audit completed (`audit-qdrant-representations.mjs` output reviewed)
- [ ] 384-dim collections either upgraded to 768 or explicitly re-registered
- [ ] Representation contract validator tests pass (100% pass rate)
- [ ] Fallback chain proof gates pass (if fallbacks configured)
- [ ] Phase 110 spec updated with active representation IDs
- [ ] Indexing scripts wire `--representation-id` parameter
- [ ] Post-indexing validation confirms all Qdrant collections match registry

---

## Summary

Phase 110 **cannot assume** embedding dimensions or derivation methods. Every representation must be:

1. **Registered** in `atlas_representations` with complete metadata
2. **Verified** via health check before indexing begins
3. **Tracked** across all Qdrant collections and fallback chains
4. **Audited** after indexing to confirm representation parity

This enforces Postgres authority (registry is source of truth) and prevents the representation drift that allowed 384-dim custom projections to be treated as canonical.

**Canonical representation for Phase 110**: `embeddinggemma_300m_768_native_ollama_v1` (official native output, no projection, L2-normalized).

**Deprecated**: Any 384-dim representation without explicit provenance documentation.
