# Vault Walker Smoke — 2026-05-08T17:43:22.390Z

**Result:** 11/15 passed (1280ms total)

## Per-tool latencies

| Tool | Result | Latency | Highlight |
|------|--------|---------|-----------|
| `vault.search:qdrant` | ✓ | 1072ms | 3504 hits |
| `vault.search:risk-high` | ✓ | 37ms | 12 hits |
| `vault.read:db-client` | ✓ | 0ms | qdrant://codebase_chunks_768/src/lib/server/db/cli |
| `vault.read:cluster-7` | ✓ | 1ms | ok |
| `vault.followLinks:cluster-contains` | ✓ | 1ms | 1 nodes |
| `vault.followLinks:file-up` | ✓ | 1ms | 1 nodes |
| `vault.resolveEmbedding:vault-path` | ✓ | 0ms | qdrant://codebase_chunks_768/src/lib/server/db/cli |
| `vault.resolveEmbedding:repo-path` | ✓ | 1ms | qdrant://codebase_chunks_768/src/lib/server/db/cli |
| `retrieval.qdrantLookup` | ✓ | 64ms | ok |
| `agent.explainCluster:7` | ✓ | 1ms | 6 members |
| `agent.proposeFix:db-client` | ✓ | 88ms | qdrant://codebase_chunks_768/src/lib/server/db/cli |
| `hypergraph.searchByLane:A` | ✗ | 4ms | Connection terminated unexpectedly |
| `hypergraph.searchByLane:B` | ✗ | 3ms | Connection terminated unexpectedly |
| `hypergraph.searchByLane:C` | ✗ | 4ms | Connection terminated unexpectedly |
| `hypergraph.searchByLane:D` | ✗ | 3ms | Connection terminated unexpectedly |

**JSON report:** [vault-walker-smoke.json](./vault-walker-smoke.json)