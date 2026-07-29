# STEP 2: OWNER MATRIX & CONSUMER GRAPH

## Canonical Owners (Single Source of Truth)

### 1. **dense_384** (384-dimensional semantic)
- **Canonical Owner**: `packages/semantic-contracts/src/vector-manifest.ts` (line 5, enum + VECTOR_MANIFESTS)
- **Type**: Dense, cosine distance, normalized, embeddinggemma:latest
- **Consumers** (Direct):
  - `src/mcp/trace-mcp-server.ts:5295` (routing_provenance.embedding_lane = 'dense_384')
  - `src/lib/schemas/packet-canonical.ts:79` (Zod optional field)
  - `src/lib/server/vector/lane-registry.ts` (lane definition)
  - `src/lib/server/telemetry/retrieval-event-schema.ts:21,86` (enum in Zod, query_embedding_lane default)
  - `src/lib/server/telemetry/retrieval-event-schema.spec.ts:15,20,40,49,77` (test fixtures)
  - `src/lib/server/vector/embeddinggemma-prefix384.ts:48` (column reference: content_embedding_384)
- **Persistence Layers**:
  - Postgres: `codebase_chunk_index.content_embedding_384` (HNSW indexed, 40.5K rows populated)
  - Qdrant: `codebase_chunks_768` collection, named vector `dense_384`
  - Redis: Cache key pattern `bifrost:packet:*:dense_384`
- **Status**: ✅ CANONICAL, ACTIVE, PRODUCTION

---

### 2. **dense_768_legacy** (768-dimensional semantic, deprecated)
- **Canonical Owner**: `packages/semantic-contracts/src/vector-manifest.ts` (line 6, enum + VECTOR_MANIFESTS)
- **Type**: Dense, cosine distance, normalized, embeddinggemma:native
- **Consumers** (Direct):
  - `src/lib/server/telemetry/retrieval-event-schema.ts:21,86` (enum in Zod, optional fallback)
  - `tests/rust-backend-integration.spec.ts` (via vectorName property, obsolete)
- **Persistence Layers**:
  - Postgres: `codebase_chunk_index.content_embedding_768` (read-only, legacy)
  - Qdrant: Named vector in `codebase_chunks_768` (read-only, migration source)
- **Status**: ⚠️ LEGACY, READ-ONLY, PHASE 108E SUPERSEDED BY dense_384

---

### 3. **latent_64** (64-dimensional topology)
- **Canonical Owner**: `packages/semantic-contracts/src/vector-manifest.ts` (implied, no explicit entry yet)
- **Type**: Latent space (autoencoder 768→64), topology routing
- **Consumers** (Direct):
  - `src/mcp/atlas_embedding_tools.ts:233` (vector_lane = 'latent_64')
  - `src/lib/schemas/packet-canonical.ts:79` (Zod array, optional)
  - `src/lib/gpu/autoencoder-compression.ts:6,89,207,234` (encode/decode/store/retrieve)
  - `src/lib/server/vector/lane-registry.ts:63` (vectorName definition)
  - `src/lib/server/vector/encoder-validation-pipeline.ts:359-429` (SQL queries, format detection)
  - `src/lib/server/serialization/packet-msgpack-codec.ts:40,9` (MsgPack tag 12, FP16 tensor)
- **Persistence Layers**:
  - Postgres: `codebase_chunk_index.latent_64` (bytea or JSON array, HNSW indexed)
  - Qdrant: Optional named vector in `codebase_chunks_768` (topology routing only)
  - Redis: Cache key pattern `bifrost:packet:*:latent_64`
  - MsgPack: Binary serialization (tag 12, FP16 encoding)
- **Status**: ✅ CANONICAL, ACTIVE, PRODUCTION (experimental for routing)

---

### 4. **bm42_sparse** (8192-dimensional sparse)
- **Canonical Owner**: `packages/semantic-contracts/src/vector-manifest.ts` (line 7, enum + VECTOR_MANIFESTS)
- **Type**: Sparse, dot product, Phase 108E canonical
- **Consumers** (Direct):
  - `src/lib/server/telemetry/retrieval-event-schema.ts:21,86` (enum in Zod)
- **Persistence Layers**:
  - Postgres: `atlas_packets.embedding_sparse` or similar (Phase 108E backfill)
  - Qdrant: Named vector in `codebase_chunks_768` (sparse retrieval lane)
- **Status**: ✅ CANONICAL, PHASE 108E COMPLETE, PRODUCTION

---

### 5. **title_384, summary_384, symbol_384, ontology_384** (Section-specific routing)
- **Canonical Owner**: `packages/semantic-contracts/src/vector-manifest.ts` (lines 8-10, enum entries only)
- **Type**: Dense, 384-dim, routing vectors (experimental)
- **Consumers**: 
  - No live consumers yet (Phase 17+ work)
- **Persistence Layers**:
  - None yet (transient, generated on demand)
- **Status**: ⚠️ EXPERIMENTAL, NOT WIRED, PHASE 17+ DEFERRED

---

### 6. **late_interaction** (RFF projection)
- **Canonical Owner**: `packages/semantic-contracts/src/vector-manifest.ts` (line 11, enum only)
- **Type**: Hybrid search routing vector (variable dimension)
- **Consumers**:
  - No live consumers yet
- **Persistence Layers**:
  - None yet
- **Status**: ⚠️ EXPERIMENTAL, NOT WIRED, DEFER TO PHASE 17C

---

## Non-Canonical References (Compatibility Aliases & Dead Code)

### 1. **semantic_768** (Go hardcoded string)
- **Location**: 
  - `services/go-embedding-service/main.go:410` (hardcoded)
  - `services/go-retrieval-service/main.go:117,120` (env default fallback)
- **Issue**: Not registered in semantic-contracts; conflicts with dense_768_legacy
- **Consumers**:
  - `go-retrieval-service`: Reads from env var `QDRANT_VECTOR_NAME` (default: "semantic_768")
  - `go-embedding-service`: Hardcoded string in response payload
- **Type**: COMPATIBILITY ALIAS (should reference semantic-contracts)
- **Action**: 
  - ✅ Step 3: Create `VECTOR_NAMES_GO.rs` mapping
  - ✅ Step 4: Update Go services to read from canonical registry (via HTTP or embedded)
  - **Recommended Fix**: Export JSON from semantic-contracts, embed in Go binary at build time

---

### 2. **codebase_chunks_768** (Collection name, not vector name)
- **Location**: 
  - `drizzle/schema.ts:772` (default value)
  - `services/go-search-service/main.go:1092,1118,1140,1157` (search functions)
  - `services/go-retrieval-service/main.go:116` (config)
  - `sveltekit-frontend/src/lib/server/vector/lane-registry.ts` (collection reference)
  - `scripts/agentic/atlas-langgraph-startup.mjs:137` (health check)
  - Many test files
- **Issue**: Collection name, NOT a vector name; confusion with semantic vector identity
- **Type**: REFERENCE (correct use, but needs clear separation from vector names)
- **Action**:
  - ✅ Document as COLLECTION_NAME in canonical contracts
  - ✅ Create separate enum `QdrantCollectionName` in semantic-contracts if needed

---

### 3. **content_embedding** (Legacy NULL column)
- **Location**: `drizzle/schema.ts` (dead column definition)
- **Issue**: Never populated in production; all 61K rows have NULL
- **Consumers**: None (query filtering only)
- **Type**: DEAD CODE
- **Action**:
  - ✅ Step 8: Mark as deprecated in migration comments
  - ✅ Plan removal in Phase 110 cleanup

---

### 4. **embedding_768d** (Dead column)
- **Location**: `drizzle/schema.ts:794` (unused)
- **Issue**: Never used; exists in schema only
- **Type**: DEAD CODE
- **Action**:
  - ✅ Step 8: Delete or move to cold storage

---

### 5. **dense_768** (Go test fixtures)
- **Location**: `tests/rust-backend-integration.spec.ts` (vectorName property in 11 test cases)
- **Issue**: Test-only, conflicts with dense_768_legacy
- **Type**: TEST FIXTURE (should use dense_384 or dense_768_legacy)
- **Action**:
  - ✅ Step 6: Update all test fixtures to use dense_384

---

### 6. **workflow_embedding_768, workflow_latent64** (Trace logging only)
- **Location**: `src/lib/server/telemetry/workflow-trace-logger.ts:76-77`
- **Issue**: Test/debugging only; not production
- **Type**: TEST FIXTURE / DOCUMENTATION
- **Action**:
  - ✅ Step 7: Document in compliance matrix or delete if unused

---

## Cross-Runtime Sync Points (Critical)

### Sync Point 1: Go Services ↔ TypeScript Canonical
```
PROBLEM:
  Go reads env var: QDRANT_VECTOR_NAME (default: "semantic_768")
  TypeScript canonical: semantic-contracts/vector-manifest.ts (defines "dense_384", "dense_768_legacy", etc.)
  
CONSEQUENCE:
  - Go always defaults to "semantic_768" (not in TypeScript enum)
  - Mismatch if TypeScript renames "semantic_768" → "dense_384" without updating Go
  
SOLUTION:
  1. Export JSON from semantic-contracts at build time
  2. Embed canonical enum in Go binary
  3. Initialize QDRANT_VECTOR_NAME from embedded registry (not hardcoded default)
```

### Sync Point 2: Postgres ↔ Qdrant Named Vectors
```
PROBLEM:
  Postgres columns (content_embedding_384, content_embedding_768, latent_64) 
  Qdrant named vectors (dense_384, dense_768_legacy, latent_64, bm42_sparse)
  
  Mapping is implicit (no explicit contract):
  - content_embedding_384 → dense_384 (canonical)
  - content_embedding_768 → dense_768_legacy (legacy)
  - latent_64 → latent_64 (topology)
  
CONSEQUENCE:
  If Qdrant payload adds a new named vector, there's no audit trail of which Postgres column it came from
  
SOLUTION:
  1. Add Postgres column metadata table: column_to_qdrant_mapping
  2. Store (table_name, column_name, vector_name, dimension, representation, status)
  3. Audit on every backfill operation
```

### Sync Point 3: Representation Lifecycle (ACTIVE → DEPRECATED → ARCHIVED)
```
CURRENT STATE:
  dense_384: ACTIVE (default, all new queries)
  dense_768_legacy: ACTIVE (fallback, migration source)
  bm42_sparse: ACTIVE (Phase 108E)
  latent_64: ACTIVE (topology routing)
  
  NO lifecycle tracking in semantic-contracts
  
CONSEQUENCE:
  Can't automatically invalidate queries against deprecated vectors
  No audit trail of when a vector became read-only
  
SOLUTION:
  1. Add status enum to VectorManifest: ACTIVE | REFERENCE_ONLY | MIGRATION_SOURCE | SUPERSEDED
  2. Add lifecycle dates: activated_at, deprecated_at, superseded_at, archived_at
  3. Implement deprecation warnings in retrieval code
```

---

## Step 2 Summary: Owner Matrix & Sync Points

| **Representation** | **Canonical Owner** | **Consumers (Count)** | **Persistence Layers** | **Sync Status** |
|---|---|---|---|---|
| `dense_384` | semantic-contracts/vector-manifest.ts | 8 (direct) | Postgres, Qdrant, Redis | ✅ CANONICAL |
| `dense_768_legacy` | semantic-contracts/vector-manifest.ts | 2 (direct) | Postgres, Qdrant | ⚠️ LEGACY |
| `latent_64` | semantic-contracts/vector-manifest.ts (implicit) | 7 (direct) | Postgres, Qdrant, MsgPack | ✅ CANONICAL |
| `bm42_sparse` | semantic-contracts/vector-manifest.ts | 1 (direct) | Postgres, Qdrant | ✅ CANONICAL |
| `semantic_768` | Go services (hardcoded) | 2 (Go env defaults) | Runtime config | ❌ NON-CANONICAL |
| `codebase_chunks_768` | Drizzle schema / Go config | 10+ (collection ref) | Qdrant collection | ⚠️ NEEDS CLARITY |
| `content_embedding_384` | Drizzle schema | 1 (Postgres column) | Postgres | ✅ CANONICAL |
| `content_embedding_768` | Drizzle schema | 0 (legacy NULL) | Postgres | ⚠️ LEGACY |
| `dense_768` | Test fixtures | 11 (test only) | Test only | ⚠️ TEST ONLY |

---

## Next Steps (Step 3-4)

**Step 3**: Create consolidated registry with dual-export:
  - `semantic-contracts/vector-manifest.ts` → TypeScript enum (single source)
  - Export JSON at build time for Go binary embedding

**Step 4**: Update all Go services to use canonical registry instead of hardcoded defaults

**Step 5**: Implement lifecycle tracking (ACTIVE → DEPRECATED → SUPERSEDED)
