# Agent Implementation Rules — deeds-web-app

> Canonical hard rules for Codex, Claude, OpenCode, and all agentic coding sessions.
> These rules are non-negotiable and must be checked before any new file or function is created.

---

## Rule 0 — Search First, Always

Before writing any new code:

```
1. Search lane-to-function-map.json for matching lane + symbols.
2. rg -l "<keyword>" sveltekit-frontend/src/lib/server/retrieval/
3. rg -l "<keyword>" sveltekit-frontend/src/lib/server/ace/
4. rg -l "<keyword>" scripts/atlas/
5. If match covers ≥60% of the job → REUSE. Do not duplicate.
6. Only create new code for missing glue or orchestration logic.
```

---

## Rule 1 — Column Semantics for `atlas_retrieval_eval_times`

| Column | Meaning | Example |
|---|---|---|
| `feature_id` | Stable capability/function identity | `retrieval.hyperrag.packet_rpc` |
| `domain_class` | Knowledge domain bucket | `retrieval_pipeline`, `graph_topology`, `runtime_evidence` |
| `ontology_label` | Ontology classification | `hyperrag_fusion`, `som_cluster`, `ace_context` |
| `topology_label` | Structural graph role | `core_search_entrypoint`, `cache_mirror`, `graph_neighbor` |
| `source_ref` | Exact evidence anchor (file + line range) | `src/lib/server/retrieval/hyperrag-packet-rpc.ts#L40-L130` |
| `packet_key` | Pointer to packet in Postgres/Qdrant | `hyperrag:src/lib/server/db/schema/case_notes.ts` |
| `query_hash` | First 16 hex chars of sha256(query) | `79a9f0bfcf88a326` |

> `feature_id` ≠ domain classification. `domain_class` is the domain bucket.

---

## Rule 2 — Layer-to-Domain Mapping

Every file and eval-times row must be classifiable into one lane:

| Lane | `domain_class` | `ontology_label` | `topology_label` |
|---|---|---|---|
| PACKET_LAYER | `packet_identity` | `parent_atlas_packet` | `packet_store` |
| RETRIEVAL_LAYER | `retrieval_pipeline` | `hyperrag_fusion` | `core_search_entrypoint` |
| GRAPH_TOPOLOGY_LAYER | `graph_topology` | `neo4j_gds` | `graph_index` |
| QDRANT_LAYER | `vector_store` | `qdrant_mirror` | `cache_mirror` |
| SOM_CLUSTER_LAYER | `som_clustering` | `som_cluster` | `cluster_node` |
| RUNTIME_EVIDENCE_LAYER | `runtime_evidence` | `route_packet` | `evidence_collector` |
| ACE_AGENT_LAYER | `ace_context` | `ace_assembly` | `context_planner` |

---

## Rule 3 — Pointer-Only Storage

Never store full packet JSON in:
- `atlas_retrieval_eval_times` rows
- Redis index/cache keys
- B-tree index pages

Store only: `packet_key` + `source_ref` + tiny hot fields (`fusion_score`, `rank`, `packet_type`).
Dereference the full payload from Postgres (`atlas_packets`) or Qdrant at read time.

---

## Rule 4 — Reuse Checklist

Before writing a new retrieval function, check these existing surfaces:

### Retrieval
- `hyperrag-packet-rpc.ts` → `hyperragPacketRpc()` — main packet RPC entrypoint
- `rrf-integration.ts` → `multiLaneRetrievalWithRRF()` — RRF lane fusion
- `hyperrag-fusion-service.ts` → full fusion service
- `bm25-search.ts` → BM25/FTS search
- `neo4j-graph-signal.ts` → graph signal lane
- `turbovec-prefilter.ts` → TurboVec ANN prefilter
- `topological-search.ts` → topology-aware search

### ACE / Context
- `context-assembler.ts` → context packet assembly
- `context-cache-planner.ts` → cache planning
- `kag-dag-runner.ts` → KAG DAG execution
- `ace-packet-store.ts` → ACE packet CRUD
- `parent-atlas-packet-assembler.ts` → parent atlas assembly

### Packets
- `parent-atlas-packet-assembler.ts` — packet assembly
- `nes-chrom-card-store.ts` — NES/CHROM card store
- `ace-packet-store.ts` — ACE packet store
- `som-packet-store.ts` — SOM packet store

### Graph / Topology
- `seed-neo4j-used-concept-edges.mjs` — concept edges
- `sync-gds-centrality-to-postgres.mjs` — GDS → Postgres sync
- `backfill-topology-index.ts` — topology backfill

---

## Rule 5 — Missing Surface: `collect-runtime-evidence.mjs`

This is the **only confirmed missing script** in the RUNTIME_EVIDENCE_LAYER.

Before creating it, check:
- `report-route-runtime-packets.mjs` (exists)
- `route-runtime-packet-recommendations.mjs` (exists)

`collect-runtime-evidence.mjs` should be a thin orchestrator calling these two, not a rewrite.

---

## Rule 6 — Anti-Duplication Index

The canonical index file is:

```
sveltekit-frontend/docs/atlas/lane-to-function-map.json
```

Refresh it with:
```bash
node scripts/atlas/build-function-registry.mjs
```

Every agentic session should read this file before creating new code.
