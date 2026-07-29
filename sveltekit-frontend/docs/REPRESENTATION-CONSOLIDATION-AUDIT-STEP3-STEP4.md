# STEP 3-4: CONSOLIDATED REGISTRY + ALIAS AUDIT

## STEP 3: Enhanced Canonical Registry (COMPLETE)

**File Modified**: `packages/semantic-contracts/src/vector-manifest.ts`

### Changes Applied

1. **Extended VectorManifestSchema** with lifecycle tracking:
   - `status: VectorStatusEnum` (ACTIVE | REFERENCE_ONLY | MIGRATION_SOURCE | SUPERSEDED | ARCHIVED)
   - `activatedAt, deprecatedAt, supersededAt, archivedAt` (ISO-8601 timestamps)
   - `supersededBy: VectorName?` (points to replacement vector)
   - `postgresColumn: string?` (source Postgres column)
   - `qdrantVectorSlot: string?` (Qdrant named vector slot)

2. **Populated VECTOR_MANIFESTS** with full metadata:
   - **dense_384**: ACTIVE (canonical semantic), postgres: `content_embedding_384`, qdrant: `dense_384`
   - **dense_768_legacy**: REFERENCE_ONLY (superseded by dense_384), activatedAt: 2026-06-01, deprecatedAt: 2026-07-15, supersededAt: 2026-08-01
   - **title_384**: ACTIVE (experimental routing), activatedAt: 2026-08-01
   - **latent_64**: ACTIVE (topology), postgres: `latent_64`, qdrant: `latent_64`
   - **bm42_sparse**: ACTIVE (Phase 108E), postgres: `embedding_sparse`, qdrant: `bm42_sparse`

3. **Added Lookup Functions**:
   - `getVectorManifest(vectorName)`: Look up any vector by name
   - `getVectorRegistryJSON()`: Export full registry as JSON for Go embedding at build time

### Why This Matters

**Before**: Go services hardcoded `semantic_768`, TypeScript used `dense_384`, with no sync mechanism.
**After**: Single source of truth with explicit mapping to Postgres columns and Qdrant slots.

---

## STEP 4: Compatibility Alias Audit

### Alias Categories

#### A. **Non-Canonical String Aliases (Must Remove)**

| **Alias** | **Location** | **Should Be** | **Fix Level** | **Timeline** |
|-----------|---|---|---|---|
| `semantic_768` | `services/go-embedding-service/main.go:410` | Embed canonical registry from TS | **CRITICAL** | Immediate (Step 4a) |
| `semantic_768` | `services/go-retrieval-service/main.go:117,120` (env fallback) | Read from embedded registry | **CRITICAL** | Immediate (Step 4a) |
| `dense_768` | `tests/rust-backend-integration.spec.ts` (11 fixtures) | `dense_384` or `dense_768_legacy` | **HIGH** | Step 4b (testing) |

#### B. **Collection Name (Needs Clarity, Not Removal)**

| **Name** | **Location** | **Issue** | **Fix** | **Timeline** |
|----------|---|---|---|---|
| `codebase_chunks_768` | Drizzle + Go + TypeScript | Confused with vector name | Document as COLLECTION_NAME in semantic-contracts | Step 4c |

#### C. **Dead Columns (Mark Deprecated, Archive Later)**

| **Column** | **Location** | **Status** | **Rows** | **Action** | **Timeline** |
|-----------|---|---|---|---|---|
| `content_embedding` | `codebase_chunk_index` | NULL in all rows (61K) | 0 populated | Mark deprecated in migration comment | Step 4d |
| `embedding_768d` | Drizzle schema | Never used | 0 populated | Delete or archive | Step 4d |

#### D. **Test Fixtures (Safe to Update)**

| **Fixture** | **Location** | **Count** | **Action** | **Timeline** |
|-----------|---|---|---|---|
| `vectorName: 'dense_768'` | `tests/rust-backend-integration.spec.ts` | 11 | Replace with `dense_384` | Step 4b |
| `workflow_embedding_768` | `workflow-trace-logger.ts` | 1 usage | Document or delete | Step 4d |

---

### STEP 4A: Fix Go Services (Synchronize with Canonical Registry)

**Problem**: Go hardcodes `semantic_768`, TypeScript defines `dense_384` in semantic-contracts.

**Solution**: Export canonical registry from TypeScript, embed in Go binary at build time.

#### Implementation Plan

1. **Add build script** in `packages/semantic-contracts`:
   ```bash
   # scripts/export-registry-for-go.mjs
   const registry = require('./src/vector-manifest.ts').getVectorRegistryJSON();
   console.log(JSON.stringify(registry, null, 2));
   # Or: save to `vector-registry.json` for Go embedding
   ```

2. **Go code generation**:
   ```go
   // services/go-retrieval-service/generated_vector_registry.go
   package main
   
   var VectorRegistry = map[string]VectorManifest{
     "dense_384": {
       VectorName: "dense_384",
       Model: "embeddinggemma:latest",
       Dimensions: 384,
       // ... embedded from canonical TS registry
     },
     // ... all vectors from VECTOR_MANIFESTS
   }
   
   func getDefaultVectorName() string {
     return "dense_384"  // Read from VectorRegistry["dense_384"], not hardcoded
   }
   ```

3. **Update initialization**:
   ```go
   // BEFORE (WRONG):
   QdrantVectorName: envOr("QDRANT_VECTOR_NAME", "semantic_768"),
   
   // AFTER (CORRECT):
   QdrantVectorName: envOr("QDRANT_VECTOR_NAME", VectorRegistry["dense_384"].VectorName),
   ```

**Status**: ⏳ NOT YET IMPLEMENTED (Step 4a pending)

---

### STEP 4B: Update Test Fixtures

**File**: `tests/rust-backend-integration.spec.ts`

**Current State**: 11 test cases reference `vectorName: 'dense_768'`

**Action**: Replace with `dense_384` (canonical) or `dense_768_legacy` (legacy fallback)

```typescript
// BEFORE (WRONG):
{
  vectorName: 'dense_768',
  // ...
}

// AFTER (CORRECT):
{
  vectorName: 'dense_384',  // canonical
  // ...
}
```

**Status**: ⏳ NOT YET IMPLEMENTED (Step 4b pending)

---

### STEP 4C: Clarify Collection Names

**Issue**: `codebase_chunks_768` appears to be a vector name, but it's actually a collection name.

**Solution**: 
1. Add `QdrantCollectionEnum` to semantic-contracts (separate from vector names)
2. Document collection → vector mapping in VectorManifest

```typescript
// Step 4c work:
export const QdrantCollectionEnum = z.enum([
  'codebase_chunks_768',    // Primary semantic collection
  'codebase_chunks_384',    // Legacy 384-dim collection
  'codebase_topology_64',   // Topology routing collection
  'evidence_items',         // Evidence chunks collection
]);

export type QdrantCollection = z.infer<typeof QdrantCollectionEnum>;

// Update VectorManifest to include:
qdrantCollection: QdrantCollectionEnum,  // which collection this vector lives in
```

**Status**: ⏳ NOT YET IMPLEMENTED (Step 4c pending)

---

### STEP 4D: Archive Dead Columns

**Columns to Handle**:

1. **`content_embedding`** (Postgres, NULL in all 61K rows)
   - Add migration comment: "DEPRECATED: Use content_embedding_384 instead"
   - Keep column (backward compatibility), mark read-only in app code
   - Plan removal in Phase 110

2. **`embedding_768d`** (Postgres, never used)
   - Delete or move to cold storage
   - No consumers found in codebase scan

3. **`workflow_embedding_768`** (TypeScript trace logging)
   - Document if used in active tracing
   - Delete if unused (appears to be test-only)

**Status**: ⏳ NOT YET IMPLEMENTED (Step 4d pending)

---

## Cross-Runtime Sync Matrix (Step 3-4 Validation)

After Step 3-4 changes, verify this matrix:

| **Component** | **semantic_768** | **dense_384** | **latent_64** | **bm42_sparse** | **Status** |
|---|---|---|---|---|---|
| TypeScript (semantic-contracts) | ❌ REMOVED | ✅ DEFINED | ✅ DEFINED | ✅ DEFINED | ⏳ Pending 4a |
| Go (embedding-service) | ❌ REMOVED | ✅ EMBEDDED | ✅ EMBEDDED | ✅ EMBEDDED | ⏳ Pending 4a |
| Go (retrieval-service) | ❌ REMOVED | ✅ ENV DEFAULT | ✅ ENV DEFAULT | ✅ ENV DEFAULT | ⏳ Pending 4a |
| Postgres (columns) | N/A | ✅ `content_embedding_384` | ✅ `latent_64` | ✅ `embedding_sparse` | ✅ CANONICAL |
| Qdrant (named vectors) | ❌ OBSOLETE | ✅ `dense_384` | ✅ `latent_64` | ✅ `bm42_sparse` | ✅ WIRED |
| Redis (cache keys) | N/A | ✅ `bifrost:packet:*:dense_384` | ✅ `bifrost:packet:*:latent_64` | ✅ `bifrost:packet:*:bm42_sparse` | ✅ WIRED |
| MsgPack (serialization) | N/A | (not serialized) | ✅ Tag 12 (FP16) | N/A | ✅ WIRED |
| Tests | ⏳ Pending 4b | ✅ `dense_384` | N/A | N/A | ⏳ Pending 4b |

---

## Next Steps (Step 5-6)

**Step 5**: Implement representation drift validator
- Watch for undeclared vectors in Qdrant payloads
- Flag Postgres columns not in canonical registry
- Audit Go env vars for deprecated strings

**Step 6**: Create runtime validation gates
- Startup check: All vectors in VECTOR_MANIFESTS exist in Qdrant
- Query gate: Reject queries against SUPERSEDED vectors (unless explicitly opted-in)
- Backfill gate: Only use ACTIVE vectors for new writes

**Step 7**: Document compatibility policy
- When is a vector REFERENCE_ONLY? (180+ days old, <5 QPS)
- When is it SUPERSEDED? (replacement exists + 90% migration complete)
- When is it ARCHIVED? (zero queries in 180 days)

**Step 8**: Migrate dead columns (Phase 110 cleanup)
