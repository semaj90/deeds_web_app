# Qdrant Tier 2 Enrichment Plan — NESCHROM97 Registry Integration

**Status**: Ready for execution  
**Date**: 2026-06-23, Session 75  
**Input**: NESCHROM97 registry (30 mapped, 8,140 unmapped)  
**Output**: Qdrant codebase_chunks_768 enriched with card_id/packet_id/feature_id  

---

## Tier 2 Enrichment Design (Mirror-Only, No Postgres Writes)

### Input Source
- **Registry**: `docs/reports/neschrom97-card-registry.json` (7.33 MB, 8,170 cards)
- **Mapped count**: 30 (high-confidence packet associations)
- **Unmapped count**: 8,140 (structural evidence)
- **Data shape**: card_id, source, tags, som_cluster, packet_id, feature_id, source_refs, route, confidence

### Qdrant Payload Enrichment Schema
```json
{
  "existing_fields": {
    "content": "...",
    "chunk_index": 0,
    "source_ref": "...",
    ...
  },
  "neschrom97_enrichment": {
    "card_id": "00f40d2dcdb83d70",
    "packet_id": "f0f0aa37-288b-4153-b13d-c1455ead8322",
    "source_refs": ["...", "..."],
    "feature_id": "graph-intelligence",
    "surface": "neschrom97",
    "match_confidence": 0.5,
    "som_cluster": 3
  }
}
```

### Qdrant Index Strategy
Add metadata indexes for fast filtering:
- `card_id` (exact lookup)
- `packet_id` (packet association)
- `feature_id` (feature-level search)
- `surface` (marker for NESCHROM97 origin)
- `match_confidence` (ranking)
- `som_cluster` (topology routing)

### Implementation Steps (4-phase)

**Phase 1: Load Registry (5 min)**
- Read `neschrom97-card-registry.json` into memory
- Build fast lookup map: card_id → {packet_id, feature_id, source_refs, confidence}
- Verify: 8,170 cards loaded, 30 have non-null packet_id

**Phase 2: Query Qdrant Batch (10 min)**
- Get all points from `codebase_chunks_768` collection
- Identify which points can be enriched (matched source_ref → card_id)
- Batch size: 100 points per update request (minimize API calls)

**Phase 3: Enrich Payloads (15 min)**
- For each point: check source_ref against registry
- If match found: add `neschrom97_enrichment` object to payload
- If no match: add `neschrom97_enrichment: null` (explicit unmapped marker)
- Preserve all existing payload fields

**Phase 4: Smoke Test (10 min)**
- Sample 100 random enriched points
- Verify:
  - [x] card_id field present (100% coverage expected)
  - [x] No invented packet_key (reject if found)
  - [x] Mapped count = 30 (no net change)
  - [x] Unmapped cards remain unmapped (cold evidence preserved)
  - [x] surface = "neschrom97" on all enriched entries
  - [x] match_confidence ∈ [0.0, 1.0]

---

## Hold Rules (Before Neo4j Edges)

✋ **DO NOT create Neo4j edges until**:
1. ✅ Qdrant Tier 2 smoke test passes (100-point sample)
2. ✅ Card_id coverage verified (no null/invalid IDs)
3. ✅ match_confidence distribution reviewed (ensure 0.5-0.9 range sensible)
4. ✅ Postgres truth layer untouched (confirm no atlas_packets writes)

---

## Success Criteria

| Gate | Expected | Status |
|------|----------|--------|
| Qdrant points enriched | 8,170 | ⏳ |
| Mapped with card_id | 30+ | ⏳ |
| Unmapped preserved | 8,140 | ⏳ |
| Surface marker added | 8,170 | ⏳ |
| No packet_key invented | 0 | ⏳ |
| Smoke test pass rate | 100% | ⏳ |

---

## Deferred to After Tier 2

- Neo4j MATERIALIZES edges (hold until smoke passes)
- Postgres atlas_packets updates (mirror-only)
- HyperRAG Packet RPC integration
- Gemma4 batch summarization (separate pipeline)

---

## Timeline

- **Phase 1-4 execution**: 40 minutes
- **100-point smoke test**: 10 minutes
- **Total Tier 2**: ~50 minutes
- **Gate pass → Neo4j edges approved**: Next 30 minutes
- **EOD Target**: Tier 2 complete + Neo4j Phase 3 queued

---

**Status**: ✅ Ready to execute  
**Next**: Implement Phase 1 (load registry) + Phase 2 (batch query Qdrant)
