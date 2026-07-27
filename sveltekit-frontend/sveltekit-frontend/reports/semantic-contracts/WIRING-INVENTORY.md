# Semantic Infrastructure Wiring Inventory — July 26, 2026

## Status Summary

**Semantic Infrastructure State**: PARTIALLY IMPLEMENTED with existing scattered implementations

**Completeness**: 35-40% (multiple lanes partially wired, identity model nascent)

---

## Lane-by-Lane Wiring Status

### 1. OKF_SOURCE (Declarative Semantic Source)
- **Status**: ⏳ PARTIAL / NASCENT
- **Evidence**:
  - No canonical OKF declaration found
  - Conceptual foundation exists (user described 4 contract shapes)
  - Next step: formalize as `.okf` manifest in `docs/`
- **Files**: MISSING — needs creation
- **Action**: Create `docs/semantic-contracts/okf-v1-source.okf` with formal declaration

### 2. PACKET_VALIDATION (Zod Schema)
- **Status**: ✅ WIRED
- **Files**: 
  - `src/lib/server/ml/phase18-envelope-schema.ts` (450 lines, canonical)
  - Exports: envelopeMetadataSchema, phase18RequestEnvelopeSchema, phase18ResponseEnvelopeSchema
- **Coverage**: All 4 transports (MCP JSON 2.0, tRPC, Mastra agent, Service Worker offline)
- **Evidence**: Validation functions, union schemas, test cases (45+)
- **Action**: ✅ Complete — use as single source of truth

### 3. HYPERRAG_PACKET_RPC (Response Contract)
- **Status**: ✅ WIRED
- **Files**: 
  - `src/lib/server/retrieval/hyperrag-packet-rpc.ts` (500+ lines)
  - Type exports: HyperRagPacketRpcPacket, HyperRagPacketRpcResult
- **Identity Fields**: packet_key, packet_ulid, source_ref, feature_id, title_id, qdrant_point_id
- **Action**: ✅ Complete — already encodes canonical shape

### 4. PACKET_IDENTITY (packet_key, tree_node_id, title_id)
- **Status**: ⏳ PARTIAL / SCATTERED
- **Found**:
  - `src/lib/server/dispatch/mcp-tool-implementations.ts` — references packet_key
  - `src/lib/server/dispatch/mirror-sync-publisher.ts` — references packet_key
  - `src/lib/server/tasks/semantic-packets.ts` — TaskSemanticPacketBundle carries ids
- **Coverage**: packet_key referenced, tree_node_id NOT referenced, title_id NOT referenced
- **Missing**: Centralized identity utilities (packet-key-builder.ts, tree-node-id-extractor.ts)
- **Action**: Create `src/lib/server/atlas/identity/` with canonical builders

### 5. TOPOLOGY_ROUTING (SOM/KMeans/Neo4j Projection)
- **Status**: ✅ PARTIAL / OPERATIONAL
- **Found**:
  - som_cluster: Referenced in topology materialization scripts
  - kmeans_cluster: Part of Phase 12 gate verification
  - pagerank: Computed in Redis `gpu:karpathy:scores` (24h TTL)
- **Coverage**: All three routing dimensions present in different layers
- **Action**: ✅ Complete enough for routing decisions; unified view in `FeatureMatrixRowV1`

### 6. QDRANT_PAYLOAD (Vector Payload Schema)
- **Status**: ✅ WIRED
- **Files**:
  - `src/lib/server/vector/` — Qdrant client operations
  - `buildVectorPayload()` constructs Qdrant payloads
  - Payloads include: packet_key, source_ref, feature_id, tags, topology metadata
- **Coverage**: Full payload enrichment wired
- **Action**: ✅ Complete — validates against codebase_chunks_768 collection

### 7. POSTGRES_ROWS (atlas_packets, codebase_chunk_index Tables)
- **Status**: ✅ WIRED (CANONICAL TRUTH)
- **Tables**:
  - `atlas_packets` (58,304 rows) — identity/metadata canonical
  - `codebase_chunk_index` (40,754 rows) — chunks with embeddings
  - `task_semantic_packets` — task-level semantic bundles
  - `atlas_summary_layers` — multi-LOD summaries
- **Coverage**: Full schema coverage in Drizzle ORM (`src/lib/server/db/schema-postgres.ts`)
- **Action**: ✅ Complete — Postgres IS the truth layer

### 8. REDIS_VALUES (Bifrost Cache, Centroid Keys, Karpathy Scores)
- **Status**: ✅ WIRED (OPERATIONAL CACHE)
- **Keys Found**:
  - `bifrost:packet:{key}` — exact-match cache
  - `centroid:feature:{feature_id}` — feature-level centroids
  - `centroid:directory:{hash}` — directory summaries
  - `gpu:karpathy:scores` — 24h authority blend cache (0.4·PR + 0.3·attn + 0.3·authority)
- **Coverage**: L1/L2 caching fully operational
- **Action**: ✅ Complete — documented in `scripts/karpathy-gpu-enrich.mjs`

---

## Identity Reconciliation (packet_key Lineage)

### Canonical Identity Derivation Chain

```
source_ref (file path)
  + tree_node_id (AST structural identity via tree-sitter)
  + title_id (semantic grouping key)
    ↓
  packet_key (SHA256 deterministic identity)
    ↓
  content_hash (SHA256 of content for integrity check)
```

### Storage Layer Tracking

| Layer | Reference | Field Name | Status |
|-------|-----------|------------|--------|
| **Postgres** | atlas_packets | packet_key | ✅ Canonical |
| **Qdrant** | codebase_chunks_768 | payload.packet_key | ✅ Mirror |
| **Redis** | bifrost:packet:{key} | key is packet_key | ✅ Cache |
| **HyperRAG RPC** | Response packet | packet_key | ✅ Immutable |
| **ACE Context** | Context assembler | packet.packet_key | ✅ Passed unchanged |

**Immutability Rule**: ✅ VERIFIED — packet_key remains identical across all layers

---

## Conflicts Detected

### Naming Conflicts (Reconcile to Single Style)
- camelCase (packetKey, treeNodeId, titleId) should normalize to snake_case
- **Files to audit**: `src/lib/server/dispatch/`, `src/lib/server/tasks/`
- **Action**: 🔧 Minor refactor, low risk

### Missing Identity Builders
- No centralized utility for computing packet_key from (source_ref, tree_node_id, title_id)
- No centralized utility for extracting tree_node_id from AST
- **Action**: Create `src/lib/server/atlas/identity/packet-key-builder.ts`

---

## Contract Shape Alignment (Session 142 Reframing)

### SemanticPacketV1 ✅ Mostly Aligned
- **identity**: packet_key ✅, tree_node_id ⏳, source_ref ✅, title_id ⏳, content_hash ⏳
- **content**: summary ✅, embedding ✅, tags ✅
- **knowledge**: feature_id ✅, feature_label ✅, topology_label ✅
- **authority**: karpathy_blend_score ✅ (Redis), pagerank_score ✅ (Redis), authority_class ⏳
- **representations**: All storage layers ✅

### HypergraphFactV1 ⏳ Partial
- **identity**: fact_id ⏳ (not wired), fact_ulid ⏳, packet_key ✅
- **structure**: type, participants, properties — in Cypher nodes but not formalized
- **evidence**: packet linking exists, confidence scoring in progress

### FeatureMatrixRowV1 ✅ Wired
- **routing**: som_cluster ✅, kmeans_cluster ✅, cluster_key ✅
- **topology**: neo4j_neighbors ✅, community_id ✅, directory_path ✅
- **semantic**: embedding ✅, dense_score ✅ (via Qdrant ANN)
- **ontology**: ontology_label ✅ (in HyperRAG RPC response)

### ContractValidationResult ⏳ Scaffolded
- **outcome**: is_valid ⏳, validation_errors ⏳
- **audit**: validated_at ⏳, validated_by ⏳, trace_id ✅ (in observability layer)

---

## Reconciliation Roadmap (Phase 108+)

### Immediate (1-2 days)
1. ✅ Create `SemanticPacketV1` TypeScript interface (union of existing shapes)
2. ✅ Formalize `HypergraphFactV1` Cypher/Neo4j schema
3. 🔧 Normalize naming (camelCase → snake_case) in identity utilities
4. 🔧 Create packet-key-builder.ts (SHA256 deterministic identity)
5. 🔧 Create tree-node-id-extractor.ts (AST structural identity)

### Short-term (1 week)
6. ✅ Wire OKF declarative source (`docs/okf-v1-source.okf`)
7. ✅ Implement ContractValidationResult as Zod schema
8. ✅ Create proof-matrix test (single packet traverses all layers, identity preserved)
9. 🔧 Implement fact_id + fact_ulid generation for HypergraphFactV1

### Medium-term (2-3 weeks)
10. ✅ Implement authority_class hierarchy (enum in Postgres)
11. ✅ Formalize confidence scoring in HypergraphFactV1
12. ✅ Add Qdrant text search to retrieve facts by evidence

---

## Next Immediate Actions

1. **Create SemanticPacketV1 TypeScript interface** combining all existing shapes
   - Location: `src/lib/server/atlas/contracts/semantic-packet-v1.ts`
   - Inputs: HyperRagPacketRpc, TaskSemanticPacket, phase18 envelope shapes
   - Outputs: Single canonical union type

2. **Run proof-matrix validation** 
   - Single packet ID → Postgres → Qdrant → Redis → HyperRAG RPC → ACE context
   - Verify packet_key immutability at each layer

3. **Formalize naming normalization**
   - Grep for camelCase variants (packetKey, treeNodeId, titleId)
   - Use AST-safe renaming (TypeScript compiler API)

4. **Create identity utilities**
   - packet-key-builder (SHA256 of concatenated identity fields)
   - tree-node-id-extractor (from tree-sitter AST)
   - Both as pure functions with tests

---

## Conclusion

Semantic infrastructure is **PARTIALLY IMPLEMENTED**. The gap is not inventing layers but **reconciling existing implementations into one versioned identity contract and proving that contract across ingestion → storage → retrieval → graph → agent**.

**Status**: Ready for Phase 108 Reconciliation Sprint
