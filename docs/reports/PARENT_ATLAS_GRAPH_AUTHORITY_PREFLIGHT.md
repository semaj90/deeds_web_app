# Parent Atlas Graph Authority Preflight

**Status:** `PREFLIGHT_COMPLETE`  
**Captured:** 2026-07-23  
**Scope:** fixture-only graph authority validation. No production ranking promotion is authorized.

## Mandatory Classifications

| Path or surface | Classification | Evidence and rule |
| --- | --- | --- |
| `scripts/atlas/compute-pagerank-neo4j.mjs` | `BROKEN_CANDIDATE` | Preflight baseline used unsupported `scaler: 'L1Norm'`; the current repair removes it, but the script still projects a legacy graph and is not the V2 fixture runner. |
| `scripts/atlas/gate-1-pagerank-split.mts` | `ACTIVE_LEGACY_WRITER` | Writes min-max `authority_score` and uses `0.5` for a degenerate range. It remains audit-only and outside V2. |
| `sveltekit-frontend/src/lib/server/ace/multihop-contextual-tree.ts` | `LEGACY_ADAPTER` | No graph snapshot, canonical node key, edge allow-list, confidence threshold, or fan-out policy; hardcodes `codebase_chunks_768`. |
| `.okf/manifest.yaml` and `.okf/` registries | `EXTEND` | Existing OpenSpec Knowledge Framework registry is the only ontology format to extend. No parallel OKF parser or manifest may be created. |
| `hypergraph_edges` | `LEGACY_SUMMARY_OR_MIRROR` | Existing table is a broad summary/mirror with member arrays and no snapshot-safe relation-participant model. It cannot be used as V2 hyperedge authority without separate proof. |
| `atlas_graph_authority_scores` / `atlas_graph_authority_runs` | `SUPERSEDE` | Existing authority ledger is retained for audit; V2 fixture validation must not write it. |
| `sveltekit-frontend/src/lib/server/graph/graph-contract.ts` | `BROKEN_CANDIDATE` | Earlier generic contract exists, but V2 requires the explicit `atlas/graph` fixture contract and mandatory identity/witness gates below. |

## Read-only Production Witnesses

PostgreSQL `atlas_packets` before V2 fixture work:

```json
{
  "row_count": 61659,
  "pagerank_score_distinct": 2,
  "pagerank_score_min": 0,
  "pagerank_score_max": 0.5,
  "pagerank_score_sum": 29182.5,
  "authority_populated": 12616,
  "authority_sum": 19.140244,
  "page_rank_score_distinct": 1526,
  "page_rank_score_sum": 1458.4077
}
```

Valkey `gpu:karpathy:scores` before V2 fixture work:

```json
{
  "field_count": 0,
  "sha256": "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855"
}
```

## Infrastructure Audit

| Surface | Observation | Status |
| --- | --- | --- |
| Neo4j GDS | Version `2.13.10` | `AVAILABLE` |
| GDS graph catalog | No named projections listed | `CLEAN_FOR_FIXTURE` |
| Qdrant 768 collection | Referenced broadly by legacy code | `LEGACY_ONLY_FOR_V2` |
| `.okf` registry | `manifest.yaml`, language rules, systems and pipeline documentation exist | `EXTEND` |

## V2 Invariants

1. V2 does not update `atlas_packets.pagerank_score`, `atlas_packets.authority_score`, `atlas_packets.page_rank_score`, SOM, KMeans, or Karpathy data.
2. Fixture nodes use stable `node_key`; Neo4j IDs and paths are projection/traversal evidence only.
3. V2 uses GDS stream mode only. `write`, `mutate`, and `L1Norm` are prohibited.
4. Fixture graph names are uniquely scoped and cleaned up after each test.
5. An unavailable GDS service produces `NEO4J_GDS_UNAVAILABLE` and `LIVE_PARTIAL`, never `PASS`.
