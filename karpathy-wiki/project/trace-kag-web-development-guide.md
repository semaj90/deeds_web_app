# TRACE/Karpathy Web Development Guide

## 1. Goals
Build a SvelteKit 2 app that supports legal/evidence workflows, AI retrieval, uploads, graph analysis, and durable memory.

## 2. Runtime Split
Reference `trace-runtime-split.md`.

## 3. RAG / HyperRAG / KAG / DAG / TRACE
- **RAG**: Retrieve chunks from Qdrant, then answer with Gemma4.
- **HyperRAG**: Retrieve across many memory types: chunks, summaries, wiki notes, research notes, prior answers, topology regions.
- **KAG (Knowledge-Augmented Generation)**: vectors + graph facts + ontology + audit gates + AGENTS.md + research provenance.
- **DAG (Directed Acyclic Graph)**: safe ordered execution plan with no loops.
- **TRACE**: Triage → Retrieve → Align → Compose → Encode. Each stage is distinct:
  - **Triage**: intent, domain, risk, required tools
  - **Retrieve**: Redis exact cache → Qdrant dense/sparse → Postgres structured facts → Neo4j topology/wiki notecards
  - **Align**: identity resolution, source_ref validation, provenance reranking, contradiction checks
  - **Compose**: build bounded ACE context packet, prompt schema, route to Gemma4 or MCP
  - **Encode**: result envelope → provenance → outcome event → validated memory candidate

## 4. SvelteKit Route Pattern
- Zod validate input
- Auth guard
- Assign request trace ID
- Call TypeScript service
- Service writes metadata via Postgres transaction + outbox event
- Background jobs do heavy work

## 5. Drizzle + Postgres
Use Postgres for canonical app state and JSONB metadata envelopes via Drizzle ORM.
Postgres is the mutation authority for all durable state. All writes pass through:
validate → authorize → Postgres transaction → outbox event → mirror to Qdrant/Neo4j/Redis.

## 6. Object Storage
SeaweedFS is the canonical local object store, exposing an S3-compatible interface on port 8333.
Application code uses a generic S3 adapter. `MINIO_*` environment variables are compatibility
aliases pointing at SeaweedFS — they are not storage authority. SeaweedFS services:
- Master: `:9333` (metadata)
- Volume: `:8380` (blobs)
- Filer: `:8382` (POSIX-style API)
- S3 Gateway: `:8333` (canonical S3 endpoint for application code)

## 7. Qdrant Collections

Distinguish canonical, derived, and legacy collections.

### Canonical (active retrieval lanes)
| Collection | Dim | Points | Named Vectors | Purpose |
|---|---|---|---|---|
| `codebase_chunks_384_hybrid` | 384 | 57,395 | `content`, `summary` | Primary codebase semantic lane |
| `codebase_chunks_384` | 384 | 30 | `content`, `summary` | Smaller test set |
| `evidence_items` | 768 | 0 | `content` | Evidence evidence chunks |

### Derived / routing (topology only, not evidence retrieval)
| Collection | Dim | Points | Purpose |
|---|---|---|---|
| `codebase_topology_64` | 64 | 0 | AE latent — cluster routing, SOM assignment, coarse candidate selection |
| `codebase_topology_128` | 128 | 0 | AE latent — wider routing index |

The 64-dim and 128-dim latent vectors support cluster routing and approximate topology grouping.
They must **not** replace the canonical 384-dim vector for legal evidence retrieval unless
recall evaluation proves that replacement safe.

### Legacy (do not route new work here)
| Collection | Status |
|---|---|
| `codebase_chunks_768` | 55,119 pts — pre-migration 768-dim, legacy |
| `summary_lenses_768` | legacy |
| `synthesis_memory_768` | legacy |
| `research_memory_768` | legacy |
| `directory_summaries_768` | no longer listed (removed) |

`codebase_chunks_canonical` (0 pts) is a placeholder for the next canonical migration target.
`codebase_chunks_384_v2` (1 pt) carries a four-vector schema including `latent64` — not yet populated.

## 8. Neo4j Graph Model
- `File`, `Directory`, `Route`
- `Evidence`, `ResearchNote`
- `Cluster`, `SynthesisMemory`
- Relationships: `IMPORTS`, `DEPENDS_ON`, `MEMBER_OF`, `BELONGS_TO`, `SIMILAR_TOPOLOGY`, `HAS_COMMUNITY`

## 9. Redis Cache Keys
- `wiki:note:*`
- `rag:exact:*`
- `tensor:embedding:*`
- `similarity:query:*`
- `centroid:members:*`
- `ace:trace:*`
- `gpu:karpathy:scores` — Karpathy authority blend (hash, 24h TTL)
- `ace:topo:{class}:{hash}` — topology prefilter cache (300s TTL)

Redis centroid entries are rebuildable routing acceleration state, not canonical evidence truth.
A centroid entry should carry version identity:
```json
{
  "clusterId": 97,
  "embeddingModel": "embeddinggemma:384",
  "projectionModel": "atlas-ae-384x64-v3",
  "snapshotId": "2026-07-22T...",
  "dimension": 64,
  "memberCount": 418,
  "vectorEncoding": "f16-base64",
  "contentHash": "..."
}
```
Postgres retains the snapshot manifest and identity linkage. Redis centroid is rebuilt from there.

## 10. MCP Tool Boundary
Gemma4 calls MCP tools only. See `trace-mcp-server.ts`. Gemma4 does not talk to gRPC, Qdrant,
Neo4j, or Postgres directly.

## 11. Worker Threads
Use `worker_threads` for CPU-intensive tasks: chunking, hashing, extraction, metadata, and Qdrant payload generation.

## 12. GPU Rules
GPU only for dense math and bounded reranking/clustering (LibTorch/CUDA).

Embedding: separate ONNX CUDA service on `:8081`. Send explicit batches there.
Autoencoder/centroids: derived routing layer — versioned and rebuildable. Never canonical evidence truth.
Reranking: separate bounded CUDA worker. Send batches of candidates.

## 13. Gemma4 Rules
Gemma4 synthesizes from retrieved context; it does not browse raw infra.

### llama-server slot configuration
The server is running with `--parallel 1` and `n_ctx 65536`. That is the correct default
for long legal synthesis agents. One slot retains the full 65,536-token context budget.

Check the live slot allocation at any time:
```bash
curl http://127.0.0.1:8090/slots
```

Operating modes by workload:
| Workload | `--parallel` | Notes |
|---|---|---|
| Long legal synthesis / agent execution | 1 | Serialize. One slot holds full context. |
| Dashboard short summaries | 2 | Each slot gets ~half the context budget. Verify with `/slots`. |
| Many tiny classification jobs | 2–4 after measurement | Continuous batching only after measurement. |
| Embeddings | Separate ONNX service `:8081` | Never route embeddings through llama-server. |
| Reranking | Separate bounded CUDA worker | Batch candidates, not individual calls. |

For dashboard synthesis, ask Gemma4 for a structured envelope covering multiple cards
(`systemHealth`, `retrievalSummary`, `graphifyReadiness`, `recentAgentRuns`, `warnings`),
then fan the single response into UI components. Do not make one Gemma4 call per widget.

## 14. ACE / Bifrost Boundary
ACE builds the bounded, validated context packet.
Bifrost chooses or executes an inference tool lane.
Postgres records the durable run decision and outcome.

Rules:
- Bifrost **may** consume an ACE packet.
- Bifrost **may** emit a proposed action or synthesis.
- Bifrost **may not** directly mutate canonical identity or memory.
- All writes pass through: validate → authorize → Postgres transaction → outbox event → mirror Qdrant/Neo4j/Redis.

### NES/CHR97 Packet Contract
CHR97 packets are compact transport / memory envelope format — not model tensors.
Canonical packet shape:
```json
{
  "packetVersion": 1,
  "packetId": "<uuid>",
  "traceId": "<uuid>",
  "kind": "retrieval_context",
  "identity": {
    "packetKey": "atlas:<featureId>",
    "featureId": "<uuid>",
    "qdrantPointId": "<uuid>",
    "sourceRefs": ["src/lib/server/retrieval/unified-orchestrator.ts"]
  },
  "routing": {
    "somCell": 152,
    "kmeansCluster": 97,
    "communityId": 12,
    "centroidSnapshot": "atlas-ae-384x64-v3"
  },
  "evidence": {
    "text": "...",
    "contentHash": "...",
    "score": 0.84
  },
  "provenance": {
    "validation": "schema:passed,identity:passed",
    "authorization": "passed"
  }
}
```
`kmeansCluster: 97` is a routing coordinate, not semantic meaning permanently attached to the text.

### Canonical Semantic Representations (do not blend)
| Representation | Type | Purpose |
|---|---|---|
| EmbeddingGemma vector | float32\[384\] | Authoritative semantic retrieval. Stored in Qdrant named `content` vector. |
| Autoencoder latent | float16/32\[64\] | Topology routing index: cluster routing, SOM assignment, coarse candidate selection, visualization. Does not replace 384-dim for retrieval. |
| Redis centroid cache | routing metadata | Acceleration state. Rebuildable. Not canonical. |

## 15. Obsidian/Karpathy Memory
High-gain synthesis becomes wiki memory only after validation.

## 16. TurboVec Status
TurboVec is running on `:8791` (`indexed: 0`). It is pointed at `codebase_chunks_768` (legacy 768-dim collection). Once the canonical 384-dim lane (`codebase_chunks_384_hybrid`) is fully populated, retarget TurboVec there. Do not reindex TurboVec against the 768-dim collection for new work.

## 17. Testing
- `smoke:trace`: Basic connectivity
- `smoke:trace:full`: End-to-end loop
- `smoke:hyperrag-packet-rpc`: HyperRAG lane health (qdrant_hits, bm25_hits, neo4j_hits)
- `typecheck:native`: TS types
- `svelte-check`: Svelte 5 compliance
- Dashboard tests
