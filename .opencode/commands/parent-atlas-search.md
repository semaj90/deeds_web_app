# Command: parent-atlas-search

## Purpose
Find the canonical Parent Atlas identity for a file, symbol, or feature name. Runs L0–L5 of the agentic workflow (read-only — no patching, no card creation).

## Usage
```
/parent-atlas-search <query>
```

Examples:
```
/parent-atlas-search atlas_higher_hop_index
/parent-atlas-search src/lib/server/ace/context-assembler.ts
/parent-atlas-search qdrant discovery phase 16
```

## Behavior

1. **L1 — Local**: `rg "<query>"` across `src/` and `scripts/atlas/`. Show top 5 matches.

2. **L2 — Identity**:
   - `atlas.source_refs` — find source_ref by path fragment
   - `kag.feature_lookup` — find feature_id + feature_label
   - `atlas.packet_search` — confirm packet_key, identity_lane, community_id, qdrant_point_id

3. **L4 — Hybrid retrieval** (parallel):
   - `kag.multi_lane_search` (bm25 + pg_trgm)
   - `ace.compact_search` (dense ANN)
   - `graph.expand_neighborhood` (Neo4j, depth 1)

4. **L5 — Rerank**: `turbovec.rank_chunks` on all hits

5. **Output**: Structured identity card:

```json
{
  "query": "...",
  "source_ref": "...",
  "feature_id": "...",
  "feature_label": "...",
  "packet_key": "...",
  "identity_lane": "qdrant_chunk | schema_stub | mcp_tool_stub | unregistered",
  "community_id": null,
  "qdrant_point_id": "...",
  "rerank_score": 0.87,
  "top_neighbors": ["packet_key_1", "packet_key_2"],
  "suggested_decision": "patch_existing | ask_permission | create_card"
}
```

## Rules
- Read-only. Never patches, never creates cards.
- If identity is unregistered, say so explicitly. Do not invent a `feature_id`.
- Print the raw `atlas.packet_search` response before summarizing.
