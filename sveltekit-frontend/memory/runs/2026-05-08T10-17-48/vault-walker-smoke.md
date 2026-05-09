# Vault Walker Smoke — 2026-05-08T17:17:51.287Z

**Result:** 14/14 passed (1822ms total)

## Per-tool latencies

| Tool | Result | Latency | Highlight |
|------|--------|---------|-----------|
| `vault.search:qdrant` | ✓ | 1693ms | 3504 hits |
| `vault.search:risk-high` | ✓ | 25ms | 12 hits |
| `vault.read:db-client` | ✓ | 0ms | qdrant://codebase_chunks_768/src/lib/server/db/cli |
| `vault.read:cluster-7` | ✓ | 0ms | ok |
| `vault.followLinks:cluster-contains` | ✓ | 1ms | 1 nodes |
| `vault.followLinks:file-up` | ✓ | 0ms | 1 nodes |
| `vault.resolveEmbedding:vault-path` | ✓ | 0ms | qdrant://codebase_chunks_768/src/lib/server/db/cli |
| `vault.resolveEmbedding:repo-path` | ✓ | 0ms | qdrant://codebase_chunks_768/src/lib/server/db/cli |
| `retrieval.qdrantLookup` | ✓ | 93ms | ok |
| `agent.explainCluster:7` | ✓ | 2ms | 6 members |
| `agent.proposeFix:db-client` | ✓ | 2ms | qdrant://codebase_chunks_768/src/lib/server/db/cli |
| `hypergraph.searchByLane:A` | ✓ | 1ms | 0 hits |
| `hypergraph.searchByLane:B` | ✓ | 0ms | 0 hits |
| `hypergraph.searchByLane:C` | ✓ | 0ms | 0 hits |

**JSON report:** [vault-walker-smoke.json](./vault-walker-smoke.json)