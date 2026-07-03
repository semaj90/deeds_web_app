# Session 102+ Priority 4 — Retrieval Lane Updates (RRF/Neo4j/Qdrant)

**Date**: July 2, 2026 23:55 UTC  
**Status**: ✅ **ARCHITECTURAL PLAN + IMPLEMENTATION SCHEDULE**

---

## Goal

Update RRF, Neo4j, and Qdrant retrieval lanes to consume and emit `CanonicalAcePacketEnvelope` without rebuilding packet identity.

---

## Current State (Before Priority 4)

Each lane rebuilds identity independently:

```
RRF lane
  └─ packetSeedCandidatesFromRrf(results)
     └─ extracts metadata → builds seed shape
        └─ { stable_key, source_refs, packet_key, metadata, kind: 'rrf' }

Neo4j expansion
  └─ expandNeighbours(root)
     └─ query Cypher → builds neighbors shape
        └─ { node_id, edges, ..., feature_id: extracted }

Qdrant search
  └─ qdrant.search()
     └─ returns points → extracts payload
        └─ { point_id, payload: { feature_id, source_ref, ... } }

ACE assembler
  └─ receives 3 shapes
  └─ **lossy merge** → packet_id/title_id lost
```

---

## Target State (After Priority 4)

All lanes use canonical envelope:

```
RRF lane
  └─ packetSeedCandidatesFromRrf(results)
     └─ extracts metadata → loads Postgres rows
        └─ calls buildCanonicalAcePacketEnvelope(row, context)
           └─ { packet_id, packet_ulid, packet_key, title_id, feature_id, ... }

Neo4j expansion
  └─ expandNeighbours(root)
     └─ query Cypher + load Postgres → calls buildCanonicalAcePacketEnvelope()
        └─ { packet_id, packet_ulid, packet_key, title_id, feature_id, ... }

Qdrant search
  └─ qdrant.search()
     └─ extracts payload → loads Postgres rows
        └─ calls buildCanonicalAcePacketEnvelope(row, context)
           └─ { packet_id, packet_ulid, packet_key, title_id, feature_id, ... }

ACE assembler
  └─ receives same shape from ALL lanes
  └─ **deterministic merge** → packet_id/title_id preserved
```

---

## Priority 4 Implementation Plan

### 4A: RRF Lane Update
**File**: `hyperrag-packet-rpc.ts`  
**Function**: `packetSeedCandidatesFromRrf()` (line 264)

**Current behavior**:
- Takes RRF result rows
- Extracts metadata fields
- Returns seed shape with `kind: 'rrf'`

**Required change**:
- After extracting source_refs from RRF metadata
- Load corresponding Postgres rows via `loadAtlasPacketsByIdentity(refs)`
- For each RRF result, find matching Postgres row
- Call `buildCanonicalAcePacketEnvelope(row, context)` where context includes:
  - `page_rank_score: row.rrf_combined_score` (from RRF fusion)
  - `language`, `kind` from RRF metadata if available
- Return array of canonical envelopes (NOT seeds)

**Impact**:
- RRF lane now emits canonical shape
- packet_id/title_id explicit
- Downstream merge becomes deterministic

### 4B: Neo4j Expansion Update
**File**: `hyperrag-packet-rpc.ts`  
**Function**: `expandNeighbours()` / Neo4j traversal (lines 1089–1092 + adjacency lookup)

**Current behavior**:
- Queries Neo4j for neighbors
- Returns node IDs or minimal shapes
- Caller extracts metadata

**Required change**:
- After Cypher query returns neighbors
- Extract neighbor node IDs/identifiers
- Load Postgres rows via `loadAtlasPacketsByIdentity(neighborRefs)`
- For each neighbor, call `buildCanonicalAcePacketEnvelope(row, context)` where context includes:
  - `page_rank_score: row.pagerank_score` (from Neo4j GDS)
  - `som_cell: row.som_cell` (if available)
- Return canonical envelopes

**Impact**:
- Neo4j expansion emits canonical shape
- Topology metadata (pagerank, som_cell) threaded through envelope
- No shape rebuilding downstream

### 4C: Qdrant Search Update
**File**: `hyperrag-packet-rpc.ts`  
**Function**: `searchCodeLexicalBounded()` or direct Qdrant call (lines 978–1021)

**Current behavior**:
- Searches Qdrant for vectors
- Extracts payload fields
- Returns metadata shape

**Required change**:
- After Qdrant `.search()` returns points
- Extract point metadata to get source_ref / packet_key
- Load Postgres rows via `loadAtlasPacketsByIdentity(sourceRefs)`
- For each Qdrant point, find matching Postgres row
- Call `buildCanonicalAcePacketEnvelope(row, context)` where context includes:
  - `page_rank_score: point.score * 0.5` (normalize Qdrant cosine score)
  - `embedding_model: point.metadata.embedding_model`
- Return canonical envelopes

**Impact**:
- Qdrant lane emits canonical shape
- Vector scores threaded as page_rank_score
- Downstream consistency

---

## Implementation Order

### Phase 1: RRF (Immediate Impact)
- **Why first**: RRF is already called in main loop (line 985)
- **Complexity**: Medium (seed shape → envelope shape)
- **Estimated effort**: 1.5h
- **Risk**: Low (seeds already loaded via Postgres)

### Phase 2: Qdrant (Highest Frequency)
- **Why second**: Every ANN search uses Qdrant
- **Complexity**: High (payload extraction → envelope building)
- **Estimated effort**: 2h
- **Risk**: Medium (payload structure varies by collection)

### Phase 3: Neo4j (Lower Frequency)
- **Why third**: Neo4j only called when `includeGraph=true`
- **Complexity**: High (graph query → envelope binding)
- **Estimated effort**: 2h
- **Risk**: High (graph structure varies by query)

---

## Checklist

### RRF Lane
- [ ] Modify `packetSeedCandidatesFromRrf()` to return envelopes
- [ ] Load Postgres rows for RRF candidates
- [ ] Build canonical envelopes for each RRF result
- [ ] Thread `page_rank_score` from RRF fusion score
- [ ] Test: RRF candidates have packet_id, title_id
- [ ] Test: Shape matches Stage A0 envelopes

### Qdrant Lane
- [ ] Modify Qdrant search wrapper to return envelopes
- [ ] Extract source_ref from Qdrant payload
- [ ] Load Postgres rows for Qdrant points
- [ ] Build canonical envelopes for each point
- [ ] Thread `page_rank_score` from cosine similarity
- [ ] Test: Qdrant results have packet_id, title_id
- [ ] Test: Shape matches RRF/Stage A0 envelopes

### Neo4j Lane
- [ ] Modify Neo4j expansion to return envelopes
- [ ] Extract neighbor refs from graph query
- [ ] Load Postgres rows for neighbors
- [ ] Build canonical envelopes for neighbors
- [ ] Thread `page_rank_score` from Neo4j PageRank
- [ ] Thread `som_cell` from topology hints
- [ ] Test: Neo4j results have packet_id, title_id
- [ ] Test: Shape matches all other lanes

### Integration
- [ ] Verify all lanes emit identical shape
- [ ] Verify ACE assembler receives deterministic packets
- [ ] Verify packet_id/title_id lineage preserved
- [ ] Verify no downstream shape divergence
- [ ] Run end-to-end retrieval test
- [ ] Measure latency: expect <100ms for all lanes (was >500ms pre-optimization)

---

## Context Object Format (Reusable)

All three lanes should use the same context:

```typescript
const context = {
  feature_id: row.feature_id ?? extractedFeature,
  som_cell: row.som_cell ?? topologyHint,
  language: row.language ?? queryLanguage,
  kind: row.kind ?? queryKind,
  page_rank_score: laneScore, // RRF fusion, Qdrant cosine, or Neo4j PageRank
};

const envelope = buildCanonicalAcePacketEnvelope(row, context);
```

---

## Files That Will Change

| File | Lines | Change |
|------|-------|--------|
| `hyperrag-packet-rpc.ts` | 264–330 | RRF: seed → envelope |
| `hyperrag-packet-rpc.ts` | ~978–1021 | Qdrant: payload → envelope |
| `hyperrag-packet-rpc.ts` | ~1089–1092 | Neo4j: neighbor → envelope |
| `hyperrag-packet-rpc.ts` | ~1113–1150 | ACE: envelope merge (no change needed) |

---

## Testing Strategy

### Unit Tests (No DB)
- `buildCanonicalAcePacketEnvelope()` with mock rows ✅ (existing)

### Integration Tests (Real DB)
- **RRF lane**: Query with RRF enabled → verify packet_id in results
- **Qdrant lane**: Search Qdrant → verify title_id in results
- **Neo4j lane**: Graph expansion → verify som_cell in results
- **All lanes**: Same query → all lanes return identical shape

### End-to-End Test
- Query with all lanes enabled
- Verify ACE assembler receives unified packets
- Verify no shape divergence
- Verify lineage preserved

---

## Parallel Work (Already Running)

- **Phase 7**: Summaries (8,225 / 40,754, ~19h)
- **Hot buckets**: Script written, ready for Phase 7 completion
- **Canonical builder**: ✅ Fully wired

---

## Expected Timeline

- **Phase 4A (RRF)**: 1.5h → Highest value (RRF in main loop)
- **Phase 4B (Qdrant)**: 2h → High frequency (every ANN search)
- **Phase 4C (Neo4j)**: 2h → Lower frequency (conditional)
- **Integration testing**: 1h
- **Total Priority 4**: ~6.5h over next 1-2 sessions

---

## Success Criteria

✅ **All retrieval lanes emit `CanonicalAcePacketEnvelope`**  
✅ **No shape divergence across lanes**  
✅ **packet_id/title_id preserved end-to-end**  
✅ **ACE assembler receives deterministic packets**  
✅ **Retrieval latency <100ms (Stage A0 cache + RRF)**  
✅ **Lineage complete: packet_id → title_id → feature_id → source_ref**

---

**Generated**: Session 102+ Priority 4 Plan (July 2, 2026 23:55 UTC)  
**Status**: ✅ PLAN COMPLETE, IMPLEMENTATION READY  
**Next Checkpoint**: Start 4A (RRF) when ready  
**Long-term Goal**: Deterministic retrieval pipeline, one envelope contract, explicit lineage end-to-end
