# Vault Walker Smoke — 2026-05-08T17:47:31.910Z

**Result:** 15/15 passed (1150ms total)

## Per-tool latencies

| Tool | Result | Latency | Highlight |
|------|--------|---------|-----------|
| `vault.search:qdrant` | ✓ | 872ms | 3504 hits |
| `vault.search:risk-high` | ✓ | 24ms | 12 hits |
| `vault.read:db-client` | ✓ | 1ms | qdrant://codebase_chunks_768/src/lib/server/db/cli |
| `vault.read:cluster-7` | ✓ | 1ms | ok |
| `vault.followLinks:cluster-contains` | ✓ | 1ms | 1 nodes |
| `vault.followLinks:file-up` | ✓ | 1ms | 1 nodes |
| `vault.resolveEmbedding:vault-path` | ✓ | 1ms | qdrant://codebase_chunks_768/src/lib/server/db/cli |
| `vault.resolveEmbedding:repo-path` | ✓ | 1ms | qdrant://codebase_chunks_768/src/lib/server/db/cli |
| `retrieval.qdrantLookup` | ✓ | 70ms | ok |
| `agent.explainCluster:7` | ✓ | 1ms | 6 members |
| `agent.proposeFix:db-client` | ✓ | 164ms | qdrant://codebase_chunks_768/src/lib/server/db/cli |
| `hypergraph.searchByLane:A` | ✓ | 2ms | 0 hits |
| `hypergraph.searchByLane:B` | ✓ | 4ms | 5 hits |
| `hypergraph.searchByLane:C` | ✓ | 2ms | 1 hits |
| `hypergraph.searchByLane:D` | ✓ | 4ms | 5 hits |

**JSON report:** [vault-walker-smoke.json](./vault-walker-smoke.json)