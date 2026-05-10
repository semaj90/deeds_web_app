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

## Boundary Rule (load-bearing)

Gemma4 must NOT call raw DB, raw search, raw Qdrant, raw Neo4j, or raw gRPC directly.

Gemma4 calls **named MCP tools only**.

Correct flow:

```
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
2. Add it to the allowlist as **read-only** unless explicitly required.
3. Tool handler calls a TypeScript service, **not** raw infra directly.
4. TypeScript service may call gRPC if a worker owns the operation.
5. Return a compact MCP response shape (no raw payloads, no 10k-line blobs).
6. Log tool usage in YorHA / TRACE metadata (`yorha.toolsUsed`).
7. Add a smoke test under `scripts/smoke/`.

## Hard Rules

- ❌ No direct Qdrant / Neo4j / Postgres calls from LLM tool surfaces.
- ❌ No write tools without explicit operator opt-in (default = read-only).
- ❌ No tools that return raw JSONL / 10k-line dumps. Tools return notecards or compact shapes.
- ❌ No CUDA Graphs on dynamic shapes — reserve for fixed-shape embedding/rerank batches.
- ❌ No Gemma4 calls during indexing/AST/chunking work. Gemma4 is synthesis-only.
- ❌ No bypassing the Karpathy blend on rerank — single source of truth for top-K ordering.
- ❌ **No Zod 3 single-arg `z.record(...)` in MCP tool schemas.** Use `z.record(z.string(), z.any())`. The single-arg form crashes MCP `tools/list` JSON-schema generation. Enforced by G34.
- ❌ **No module-scope `StreamableHTTPServerTransport({ sessionIdGenerator: undefined })` shared across requests.** In stateless mode the SDK throws `"Stateless transport cannot be reused across requests"` on every call after the first, and the throw is swallowed by the hono async chain into a silent HTTP 500 (no log, no `onerror`, no `uncaughtException`). Construct a fresh transport + `await server.connect(transport)` per request inside the HTTP handler. Enforced by G38.

## Cross-references

- `src/mcp/trace-mcp-server.ts` — tool registry + transport
- `scripts/ensure-mcp-server.mjs` — MCP startup health check + log capture
- §"FastMCP Agentic Tools" in project-root CLAUDE.md
- §"Karpathy GPU Authority Blend + Redis ACE Cache" in project-root CLAUDE.md
- `docs/architecture/trace-kag-web-development-guide.md` — practical web-app patterns built on this split
- `next_steps/active/2026-05-09_karpathy-chr97-wiring.md` — cartridge layer that ties retrieval into ACE
