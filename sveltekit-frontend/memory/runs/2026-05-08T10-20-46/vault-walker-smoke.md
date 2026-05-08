# Vault Walker Smoke — 2026-05-08T17:20:49.968Z

**Result:** 14/14 passed (2092ms total)

## Per-tool latencies

| Tool | Result | Latency | Highlight |
|------|--------|---------|-----------|
| `vault.search:qdrant` | ✓ | 1842ms | 3504 hits |
| `vault.search:risk-high` | ✓ | 30ms | 12 hits |
| `vault.read:db-client` | ✓ | 1ms | qdrant://codebase_chunks_768/src/lib/server/db/cli |
| `vault.read:cluster-7` | ✓ | 0ms | ok |
| `vault.followLinks:cluster-contains` | ✓ | 0ms | 1 nodes |
| `vault.followLinks:file-up` | ✓ | 1ms | 1 nodes |
| `vault.resolveEmbedding:vault-path` | ✓ | 0ms | qdrant://codebase_chunks_768/src/lib/server/db/cli |
| `vault.resolveEmbedding:repo-path` | ✓ | 0ms | qdrant://codebase_chunks_768/src/lib/server/db/cli |
| `retrieval.qdrantLookup` | ✓ | 83ms | ok |
| `agent.explainCluster:7` | ✓ | 2ms | 6 members |
| `agent.proposeFix:db-client` | ✓ | 124ms | qdrant://codebase_chunks_768/src/lib/server/db/cli |
| `hypergraph.searchByLane:A` | ✓ | 2ms | 0 hits |
| `hypergraph.searchByLane:B` | ✓ | 3ms | 5 hits |
| `hypergraph.searchByLane:C` | ✓ | 2ms | 1 hits |

**JSON report:** [vault-walker-smoke.json](./vault-walker-smoke.json)