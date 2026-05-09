# Vault Walker Smoke — 2026-05-08T17:19:07.238Z

**Result:** 14/14 passed (1019ms total)

## Per-tool latencies

| Tool | Result | Latency | Highlight |
|------|--------|---------|-----------|
| `vault.search:qdrant` | ✓ | 841ms | 3504 hits |
| `vault.search:risk-high` | ✓ | 21ms | 12 hits |
| `vault.read:db-client` | ✓ | 0ms | qdrant://codebase_chunks_768/src/lib/server/db/cli |
| `vault.read:cluster-7` | ✓ | 1ms | ok |
| `vault.followLinks:cluster-contains` | ✓ | 0ms | 1 nodes |
| `vault.followLinks:file-up` | ✓ | 0ms | 1 nodes |
| `vault.resolveEmbedding:vault-path` | ✓ | 1ms | qdrant://codebase_chunks_768/src/lib/server/db/cli |
| `vault.resolveEmbedding:repo-path` | ✓ | 0ms | qdrant://codebase_chunks_768/src/lib/server/db/cli |
| `retrieval.qdrantLookup` | ✓ | 84ms | ok |
| `agent.explainCluster:7` | ✓ | 1ms | 6 members |
| `agent.proposeFix:db-client` | ✓ | 60ms | qdrant://codebase_chunks_768/src/lib/server/db/cli |
| `hypergraph.searchByLane:A` | ✓ | 2ms | 0 hits |
| `hypergraph.searchByLane:B` | ✓ | 4ms | 5 hits |
| `hypergraph.searchByLane:C` | ✓ | 3ms | 1 hits |

**JSON report:** [vault-walker-smoke.json](./vault-walker-smoke.json)