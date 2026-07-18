# Architecture Reference

## Services (local)
| Service | Port | Role |
|---------|------|------|
| llama-server (Gemma4) | :8090 | Generation only — `stream: true` required |
| Ollama (embeddinggemma) | :11434 | Embeddings only (384-dim) |
| Qdrant | :6333 | ANN mirror — collection `codebase_chunks_384_hybrid` |
| TurboVec | :8791 | CUDA prefilter (64-dim routing) |
| Postgres | :5432 (Docker) / :5434 (host) | Canonical truth |
| Valkey/Redis | :6379 | BitFrost cache — password from REDIS_PASSWORD env |
| Neo4j | :7687 | Topology mirror |
| TRACE MCP | :8788 | Retrieval/KAG tools for agents |
| Go retrieval | :8100 | HTTP retrieval facade |

## Retrieval order (ACE pipeline)
```
Redis BitFrost exact (L1, <5ms)
→ Postgres packet_key/source_ref (canonical)
→ Qdrant ANN 384-dim (mirror)
→ Neo4j k-hop bounded (topology only)
→ Gemma4 synthesis (last)
```

## Dimension policy
- Embeddings: 384-dim (`embeddinggemma:latest` via Ollama)
- AE latent: 64-dim (routing cache only, NOT for ANN search)
- Never mix dimensions in the same Qdrant collection

## ACE packet shape (minimal, not a giant prompt)
Inject only:
- `task`: one sentence
- `canonical_contracts`: list of spec identifiers
- `relevant_files`: 2-5 paths, no full content
- `known_proofs`: what has been dry-run / smoke-tested
- `constraints`: hard rules for this task
- `required_validation`: test command + smoke command

## Active specs
Read from paths, don't embed content:
- `openspec/changes/<change>/proposal.md`
- `openspec/changes/<change>/tasks.md`
- `docs/architecture/canonical-contracts.md`
