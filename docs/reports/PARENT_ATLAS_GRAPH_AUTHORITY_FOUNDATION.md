# Parent Atlas Graph Authority Foundation

**Status:** `FIXTURE_PROVEN`  
**Scope:** fixture-only validation milestone. No ranking promotion occurred.

## Result

| Gate | Status | Evidence |
| --- | --- | --- |
| `PREFLIGHT_COMPLETE` | `PROVEN` | `PARENT_ATLAS_GRAPH_AUTHORITY_PREFLIGHT.md` records legacy writers and baseline witnesses. |
| `OKF_SCHEMA_PROVEN` | `PROVEN` | Existing `.okf/manifest.yaml` extended and validated; unknown relationships, invalid confidence, invalid hops, empty extensions, and inconsistent PageRank policies fail. |
| `GRAPH_IDENTITY_PROVEN` | `PROVEN` | Stable node keys, packet-node identity, tree collisions, endpoint existence, relation-participant identity, and deterministic topology hashes are tested. |
| `NETWORKX_REFERENCE_PROVEN` | `PROVEN` | NetworkX fixture: 6 nodes, 5 included weighted directed edges, stable result hash. |
| `NEO4J_GDS_PROVEN` | `PROVEN` | Neo4j GDS `2.13.10`; temporary Cypher projection, weighted stream mode only, converged in 4 iterations. |
| `PAGERANK_PARITY_PROVEN` | `PROVEN` | Top-3 overlap `1.0`; Spearman `1.0`; maximum L1-normalized score delta `2.7548415493239276e-9`. |
| `PRODUCTION_SCORE_UNCHANGED` | `PROVEN` | PostgreSQL PageRank/authority witnesses and Valkey Karpathy witness matched before and after. |

## Authority Isolation

`ATLAS_GRAPH_AUTHORITY_V2_ENABLED` defaults to `false`.

`ATLAS_GRAPH_AUTHORITY_V2_PROMOTION_ENABLED` defaults to `false`. A promotion request without a `PAGERANK_PARITY_PROVEN` artifact is rejected; a request with one is also rejected because promotion/canary work is explicitly out of scope for this milestone.

Neither flag is wired into the active reranker.

## Fixture Evidence

| Field | Value |
| --- | --- |
| Snapshot ID | `11111111-1111-4111-8111-111111111111` |
| Topology hash | `33586a9976159cc7a4fcb7f290c62da7e5508b8c4938f6f3d196dec97101dcae` |
| NetworkX run ID | `4b920b42-350b-5f8d-9046-b8bd95bf760d` |
| NetworkX result hash | `37ceeb856f68a9363e0e563c8c2eb7df20388d946e3afb7f07525740b78836e5` |
| Neo4j run ID | `556b46bd-86bc-4d4b-b43d-7fcd0456f0cf` |
| Neo4j result hash | `07e4117077a14c185f8949fd6a5209ba0616613b8886171bd605053632f42055` |
| Projection graph name | `atlas_authority_fixture_556b46bd_86bc_4d4b_b43d_7fcd0456f0cf` (dropped after execution) |
| Projection nodes / edges | `6 / 5` |
| Included edges | `IMPORTS`, `CALLS`, `REFERENCES`, `DEPENDS_ON` |
| Excluded edge | `SEMANTIC_SIMILAR` |

`MATERIALIZES` remains in the fixture as contextual-tree evidence but is excluded from both PageRank engines.

## Production Witnesses

The before and after PostgreSQL witness was identical:

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

Valkey `gpu:karpathy:scores` remained empty (`HLEN = 0`; SHA-256 of the empty witness: `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855`).

## Files

Created:

- `.okf` graph projection policy in the existing manifest
- `sveltekit-frontend/src/lib/server/atlas/graph/okf-schema.ts`
- `sveltekit-frontend/src/lib/server/atlas/graph/graph-snapshot.ts`
- fixture and four focused TypeScript tests
- `python/parent_atlas_networkx_pagerank.py` and its pytest
- `scripts/atlas/compute-pagerank-neo4j-v2.mjs`

Modified:

- `scripts/atlas/compute-pagerank-neo4j.mjs`: removed unsupported GDS L1 normalization and gated compatibility writes
- `sveltekit-frontend/src/lib/server/env.server.ts`: V2 flags only
- `sveltekit-frontend/vitest.lane-contracts.config.ts`: graph test inclusion

## Next Milestone

Build the deterministic PostgreSQL contextual-tree snapshot materializer. Do not start traversal, fusion, Qdrant/Valkey caching, authority promotion, or Karpathy scoring until that snapshot materializer has its own identity and replay gate.
