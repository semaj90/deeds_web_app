---
name: TRACE/Karpathy Runtime Split
description: Which runtime layer owns which responsibility in the TRACE/Karpathy 4D topology stack
type: project
tags:
  - trace
  - karpathy
  - kag
  - runtime
  - mcp
  - gpu
  - qdrant
  - neo4j
  - gemma4
---

# TRACE/Karpathy Runtime Split

TRACE/Karpathy uses this runtime division:

- **TypeScript** = orchestration, APIs, MCP tools, `worker_threads`, JSONB metadata, route/service coordination
- **GPU / LibTorch** = dense tensor math, cosine rerank, k-means, SOM/BMU, topology clustering
- **Redis** = hot cache, tensor cache, similarity cache, retrieval traces, wiki notes such as `wiki:note:*`
- **Qdrant** = vector index and semantic retrieval, including `codebase_chunks_768`, `summary_lenses_768`, `synthesis_memory_768`, and `evidence_items`
- **Postgres** = JSONB truth store, retrieval traces, topology snapshots, `manifold4`, audit logs, memory-gain decisions
- **Neo4j / GDS** = graph analysis, PageRank, communities, shortest paths, `SIMILAR_TOPOLOGY` edges
- **Gemma4** = synthesis only after retrieval has already been narrowed by cache, graph, topology, and summary lenses
- **MCP** = safe model-facing tool surface, primarily `trace-mcp-server.ts` on port `8788`
- **gRPC** = typed worker/service boundary underneath MCP, not directly exposed to the LLM

## Boundary Rule

Gemma4 must not call raw DB, raw search, raw Qdrant, raw Neo4j, or raw gRPC directly.

Gemma4 calls named MCP tools only.

Correct flow:

```txt
Gemma4 / Claude
  ↓
MCP tool
  ↓
TypeScript tool handler
  ↓
TypeScript service
  ↓
optional gRPC client
  ↓
Go / TS retrieval, embedding, graph, or indexer service
```

## How to Add a New LLM Tool

1. Define the tool in `trace-mcp-server.ts`.
2. Add it to the allowlist as read-only unless explicitly required.
3. Tool handler calls a TypeScript service, not raw infra directly.
4. TypeScript service may call gRPC if a worker owns the operation.
5. Return a compact MCP response shape.
6. Log tool usage in YorHA / TRACE metadata.
7. Add a smoke test.
