# Inference Path Map

**Date**: 2026-05-17
**Status**: design

## Related

- [`turbovecquant.md`](./turbovecquant.md) - runtime architecture, cache split, and request flow.

## Goal

Map the inference stack by directory, dependency, and merge boundary so the library layers, KAG context graph, retrieval cache, and generation runtime stay separated.

## Canonical docs

- `docs/status/INFERENCE_INFRASTRUCTURE.md` - current inference tier order, ports, and health routes.
- `docs/status/INFERENCE_INFRASTRUCTURE_SESSION_COMPLETE.md` - VLM cascade and upload-route integration points.
- `docs/status/GPU_UTILIZATION_REPORT_2026-04-11.md` - current GPU/process state and 8 GB VRAM constraints.
- `docs/status/GPU_ACCELERATION_IMPLEMENTATION_MAP.md` - app DB, fallback model, and route/service mapping.
- `docs/operator/DEPLOYMENT.md` - deployment ports and env matrix.
- `docs/visualization-stack.md` - route/component map for graph and GPU visualization surfaces.
- `docs/graph/repo-root-atlas.md` - workspace and env key inventory.

## Canonical path and URL map

| Surface | Canonical value | Legacy or fallback |
|---------|-----------------|-------------------|
| Dev app URL | `http://localhost:5173` | - |
| Preview app URL | `http://localhost:4173` | - |
| Production app URL | `http://localhost:3000` | - |
| App database | `postgresql://legal_admin:123456@127.0.0.1:5434/legal_ai_db` | `5432` sandbox / legacy docs |
| Redis | `127.0.0.1:6379` | - |
| Qdrant | `http://127.0.0.1:6333` | - |
| Neo4j | `bolt://localhost:7687` | - |
| TurboQuant llama-server | `http://localhost:8090` | primary inference lane |
| TensorRT-LLM | `http://localhost:8099` | optional accelerator |
| Triton | `http://localhost:8000` | optional accelerator |
| Bifrost / LiteLLM | `http://localhost:3040` | Docker-to-Docker semantic cache lane |
| Ollama fallback | `http://localhost:11434` | `OLLAMA_URL` / `OLLAMA_BASE_URL` legacy names |
| Langfuse UI | `http://localhost:3030` | inference traces / observability |
| SeaweedFS filer | `http://localhost:8888` | primary S3 gateway |
| SeaweedFS S3 | `http://localhost:8333` | asset endpoint |

## Visualization path map

| Component | Route |
|-----------|-------|
| `RAGPipelineChart.svelte` | `admin/error-brain` |
| `ClusterVisualization.svelte` | `admin/kag-notebook` |
| `DependencyChart.svelte` | `/couchdb-analytics` |
| `ErrorPropagationGraph.svelte` | `/couchdb-analytics` |
| `RouteGraph.svelte` | `/demos/codebase-graph`, `/admin/codebase-graph` |
| `EvidenceGraphPane.svelte` | `/command-center` |
| `ProvenanceGraph.svelte` | source-validation flows |

## Service and route map

| Service | Port | Health / route |
|---------|------|----------------|
| TensorRT-LLM | `8099` | `GET /v2/health/ready` |
| Triton | `8000` | `GET /v2/health/ready` |
| TurboQuant | `8090` | `GET /health`, `GET /props` |
| HF VLM Server | `8085` | `GET /health` |
| LiteRT-LM | `8070` | `GET /health` |
| Ollama | `11434` | `GET /api/tags` |
| Inference router | `5173` | `/api/inference/route`, `/api/inference/status`, `/api/infrastructure/status` |

## Env alias map

| Env key | Canonical target | Notes |
|---------|------------------|-------|
| `TURBOQUANT_BASE_URL` | `http://127.0.0.1:8090` | preferred inference base URL in runtime docs |
| `BIFROST_URL` | `http://127.0.0.1:3040` | semantic cache / L2 cache |
| `LANGFUSE_URL` | `http://127.0.0.1:3030` | traces UI |
| `OLLAMA_BASE_URL` | `http://localhost:11434` | fallback LLM lane |
| `OLLAMA_URL` | `http://localhost:11434` | legacy alias for older scripts |
| `SEAWEED_ENDPOINT` | filer host on `:8888` | primary SeaweedFS metadata filer |
| `MINIO_ENDPOINT` | S3 host on `:8333` | asset endpoint; legacy name kept in docs |
| `SEARXNG_PORT` | `8889` | reserved away from filer port `8888` |
| `DATABASE_URL` | `postgresql://legal_admin:123456@127.0.0.1:5434/legal_ai_db` | canonical app DB |
| `REDIS_URL` | `redis://127.0.0.1:6379` | app cache / hot state |
| `QDRANT_URL` | `http://127.0.0.1:6333` | vector store |
| `NEO4J_URI` | `bolt://localhost:7687` | graph store |

## Cluster ingestion map

| Surface | Path | Notes |
|---------|------|-------|
| Codebase orchestrator | `/api/codebase-index/orchestrate` | 10-stage SSE pipeline |
| Unified export bundle | `/api/codebase-index/export/bundle` | graph + clusters + wiki notes + manifold |
| Obsidian export | `/api/codebase-index/export/obsidian` | writes note files |
| Colab export | `/api/graph/colab-export` | notebook handoff |
| Cluster summarizer | `scripts/summarize-clusters-pg.ts` | TurboQuant-first, Ollama fallback |
| Stage 6 summary model | `TurboQuant :8090` | `cache_prompt:true`, `gemma4-legal-vlm` |

## Directory map

| Directory | Requirement | Depends on |
|-----------|-------------|------------|
| `sveltekit-frontend/src/routes/api/` | API entrypoints | Zod, server services |
| `sveltekit-frontend/src/lib/server/` | server orchestration | Drizzle, Redis, Qdrant, embeddings |
| `sveltekit-frontend/src/lib/server/ace/` | context assembly / ACE routing | embeddings, graph layer, cache layer |
| `sveltekit-frontend/src/lib/server/grpc/` | embedding service bridge | Go embed service, Ollama fallback |
| `sveltekit-frontend/src/lib/server/vector/` | vector search and scoring | Qdrant, embedding model |
| `sveltekit-frontend/src/lib/server/retrieval/` | graph + citation expansion | Postgres, Neo4j, CouchDB, KAG sources |
| `sveltekit-frontend/src/lib/cache/` | client cache layer | answer cache, retrieval cache |
| `sveltekit-frontend/src/lib/components/` | UI surface | API routes, stores |
| `drizzle/` | schema and migration source | Postgres |
| `next_steps/` | planning notes | architecture docs |

## Library merging boundaries

### Generation lane

- Merged legal Gemma4 GGUF.
- Runtime KV cache stays in llama.cpp.
- MTP drafter is optional and only speeds generation.

### Embedding lane

- `embeddinggemma:latest` is the server embedding model.
- Browser ONNX embedding is fallback only.
- Do not merge embedding code into the chat model lane.

### Retrieval lane

- TurboVec is a local accelerator.
- Qdrant is durable vector storage.
- Postgres stores metadata and authoritative records.
- Redis/BitFrost stores hot answers and hot context.

## KAG / contextual graph mapping

```
User query
  -> Zod validation
  -> ACE context assembly
  -> KAG lookup / graph expansion
  -> Redis hot-context check
  -> TurboVec fast-path
  -> Qdrant dense retrieval
  -> Postgres / Neo4j / CouchDB expansion
  -> ranked context packet
  -> Gemma4 synthesis
```

### KAG dependencies

- `src/lib/server/ace/context-assembler.ts`
- `src/lib/server/retrieval/graph-context.ts`
- `src/lib/server/retrieval/citation-graph.ts`
- `src/lib/server/retrieval/document-dag.ts`
- `src/lib/server/retrieval/legal-pagerank.ts`
- `src/lib/server/vector/qdrant-manager.ts`
- `src/lib/server/cache.ts`

## Path requirements

1. API routes validate every payload with Zod.
2. Server lanes never call the model server for embeddings.
3. Graph expansion never replaces vector retrieval.
4. Redis is a cache, not a source of truth.
5. KV cache remains internal to llama.cpp runtime.
6. Multimodal support only exists when the loaded export includes the projector.

## Dependency order

1. `drizzle` schema
2. `embeddinggemma` lane
3. Redis/BitFrost cache keys
4. Qdrant retrieval
5. KAG contextual graph expansion
6. Gemma4 synthesis
7. TurboVec fast-path
8. UI surfaces in SvelteKit

## Suggested key folders to wire next

- `sveltekit-frontend/src/lib/server/ace/`
- `sveltekit-frontend/src/lib/server/retrieval/`
- `sveltekit-frontend/src/lib/server/vector/`
- `sveltekit-frontend/src/routes/admin/atlas/`
- `sveltekit-frontend/src/routes/api/admin/atlas/`
