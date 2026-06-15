# Phase 17 Graph Wiring Gaps — Scope Clarification

**Date**: June 15, 2026  
**Status**: Phase 17 GPU Packaging COMPLETE; Graph wiring belongs to Phase 16/18

## What Phase 17 Completed

✅ **GPU Acceleration Library Packaging**
- 4 npm packages created and documented
- 32 GPU acceleration files consolidated
- Public API surface with 24 exports
- OpenCode CLI skills (3 skills)
- All services verified operational

## What Phase 17 Did NOT Include

Phase 17 scope was **library packaging**, not **graph data wiring**. The following are Phase 16/18 work:

### 1. Neo4j GDS Integration ❌

**File**: `src/lib/server/graph/neo4j-gds.ts` (1,307 lines, 19 functions)

**Status**: Code exists, 7 import locations

**Missing**: 
- Direct wiring from GPU `batchCosineSimilarity()` output to GDS KNN graph creation
- GDS algorithm calls integrated into retrieval pipeline

**Phase**: Phase 16 (Graph Refresh Manifest binding)

---

### 2. SOM Clustering → Neo4j Attribution ✓ PARTIAL

**File**: `src/lib/server/gpu/pytorch-graph.ts` (578 lines)

**Status**: ✓ Functions exist + actively used (27 call sites)

**Already wired**:
- `trainSOM()` — GPU K-means on RTX 3060 Ti
- `pcaProject()` — 768→64 latent compression
- SOM outputs: `som_cluster` index + centroids

**Missing**:
- Neo4j node property attribution (`HAS_SOM_CLUSTER` edge)
- 4D projection payload for visualization

**Phase**: Phase 16 (topology refresh) + Phase 18 (enrichment)

---

### 3. NES-CHROM 4D Domain Ontology ❌

**File**: `src/lib/server/gpu/topology-projection.ts` (347 lines)

**Status**: Code exists, 10 call sites, FUNCTIONAL

**Missing**:
- Wiring 4D projection to Neo4j node payload
- Domain class → packet_4d mapping in database
- Visualization integration (frontend chart)

**Phase**: Phase 16 (4D graph refresh) + Phase 18 (rendering)

---

### 4. HyperRAG Scalar Indexing (Linked Deque) ❌

**Files**: 16 files reference HyperRAG (trust-tiers.ts, ace-search.ts, etc.)

**Status**: Code references exist, database schema TBD

**Missing**:
- `linked_deque` or similar ordered index for scalar scores
- Database sort key wiring
- RRF (Reciprocal Rank Fusion) persistence

**Phase**: Phase 18 (Reranker Contract) + Phase 19 (Database indexing)

---

### 5. SOM → Qdrant Payload Tag ❌

**Expected**: `som_cluster` field in `codebase_chunks_768` payload

**Status**: SOM clustering exists; Qdrant upsert payload missing

**Missing**:
- Backfill existing points with `som_cluster` ID
- Upsert pipeline writes `som_cluster` on new vectors

**Phase**: Phase 16 (payload reconciliation) + Phase 17B (enrichment backfill)

---

## Wiring Dependency Graph

```
GPU Library (Phase 17) ✅
  ├─ batchCosineSimilarity() ✓ EXPORTED
  ├─ trainSOM() ✓ USED (27 sites)
  └─ pcaProject() ✓ USED (10 sites)
    ↓
Graph Refresh (Phase 16) ⏳
  ├─ Neo4j GDS KNN graph ✗ MISSING
  ├─ SOM → Neo4j attribution ✗ MISSING
  ├─ 4D projection payload ✗ MISSING
  └─ som_cluster → Qdrant ✗ MISSING
    ↓
Enrichment & Indexing (Phase 18+) ⏳
  ├─ HyperRAG scalar sorting ✗ MISSING
  ├─ Domain ontology mapping ✗ MISSING
  └─ RRF persistence ✗ MISSING
```

## Phase 17 vs Phase 16 Boundary

| Aspect | Phase 17 (GPU) | Phase 16 (Graph) |
|--------|---|---|
| **GPU bridge** | ✓ Library + API | Uses library |
| **GPU→GDS wiring** | ✗ Out of scope | ✓ Responsibility |
| **SOM computation** | ✓ trainSOM() | Uses result |
| **Neo4j sync** | ✗ Out of scope | ✓ Responsibility |
| **Qdrant enrichment** | ✓ Core payload | ✗ Tags/enrichment |

## Recommendation

**Phase 17 is COMPLETE** for packaging scope.

**Graph wiring gaps are NOT Phase 17 failures** — they are Phase 16 (refresh) and Phase 18 (enrichment) work.

### Option A: Mark Phase 17 Done
- ✅ 4 npm packages
- ✅ Documentation
- ✅ Services verified
- ⏳ Graph wiring deferred to Phase 16

### Option B: Wire SOM→Neo4j Now (Quick Win)
Estimated: 2-3 hours
```sql
-- Create HAS_SOM_CLUSTER edges
MATCH (p:Packet {packet_key: $key})
SET p.som_cluster = $cluster_id
CREATE (p)-[:HAS_SOM_CLUSTER {centroid: $centroid}]->(c:SOMCluster {id: $cluster_id})
```

### Option C: Wire All Graph Lanes (Comprehensive)
Estimated: 1-2 days
- Neo4j GDS KNN graph
- SOM cluster attribution
- 4D projection upsert
- HyperRAG scalar schema
- Qdrant payload enrichment

## Next Action

**Recommend**: Option A (Mark Phase 17 complete, continue with npm build)

**Rationale**:
1. Phase 17 packaging is functionally complete
2. Graph wiring is Phase 16 responsibility (per workstation TODO)
3. Service dependencies are satisfied
4. Library can be built and tested independently
5. Graph wiring can proceed in parallel (Phase 16 lane)

---

## Files Reference

- [PARENT-ATLAS-PACKAGE-INTEGRATION.md](PARENT-ATLAS-PACKAGE-INTEGRATION.md) — Package wiring
- [GPU-ACCELERATION-WIRING-CHECKLIST.md](GPU-ACCELERATION-WIRING-CHECKLIST.md) — GPU stage verification
- [phase-10b-to-16-todo.txt](../next_steps/phase-10b-to-16-todo.txt) — Phase 16 graph refresh plan
- [parent-atlas-workstation-todo.md](../memory/parent-atlas-workstation-todo.md) — Master workstation status

---

**Status**: Phase 17 GPU Packaging ✅ COMPLETE  
**Deferred**: Phase 16 Graph Wiring (separate lane)  
**Ready**: npm install && npm run build --workspaces
