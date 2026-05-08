# Vault Walker Smoke — 2026-05-08T16:52:36.907Z

**Result:** 11/11 passed (947ms total)

## Per-tool latencies

| Tool | Result | Latency | Highlight |
|------|--------|---------|-----------|
| `vault.search:qdrant` | ✓ | 827ms | 3504 hits |
| `vault.search:risk-high` | ✓ | 19ms | 12 hits |
| `vault.read:db-client` | ✓ | 1ms | qdrant://codebase_chunks_768/src/lib/server/db/cli |
| `vault.read:cluster-7` | ✓ | 0ms | ok |
| `vault.followLinks:cluster-contains` | ✓ | 1ms | 1 nodes |
| `vault.followLinks:file-up` | ✓ | 1ms | 1 nodes |
| `vault.resolveEmbedding:vault-path` | ✓ | 0ms | qdrant://codebase_chunks_768/src/lib/server/db/cli |
| `vault.resolveEmbedding:repo-path` | ✓ | 1ms | qdrant://codebase_chunks_768/src/lib/server/db/cli |
| `retrieval.qdrantLookup` | ✓ | 94ms | ok |
| `agent.explainCluster:7` | ✓ | 2ms | 6 members |
| `agent.proposeFix:db-client` | ✓ | 1ms | qdrant://codebase_chunks_768/src/lib/server/db/cli |

**JSON report:** [vault-walker-smoke.json](./vault-walker-smoke.json)