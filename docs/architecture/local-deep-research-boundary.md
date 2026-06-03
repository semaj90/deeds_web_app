# Local Deep Research Boundary

Date: 2026-06-01

## Scope

This note applies to the current Windows 10 Home + WSL2 deployment used in this repo, including:

- the `local-deep-research` compose project in `C:\Users\james\Downloads\Hermes-Ollama\local-deep-research-docker-desktop`
- the host-side OpenCode / Gemma4 runtime
- the backend stores and GPU addons in `C:\Users\james\Videos\deeds-web-app`

It does not define a new runtime by itself. It documents the boundary that the repo should follow while the Phase 101C lane is implemented.

## Purpose

This document defines the boundary between:

- the `local-deep-research` app and its local SQLite state,
- the canonical backend stores in this repo,
- and the GPU / WSL2 deployment split on Windows 10 Home.

The goal is to keep research execution flexible while preserving a single source of truth for parent atlas, ACE packets, and retrieval provenance.

## Core rule

- `local-deep-research` is a research backend.
- OpenCode + Gemma4 remains the user-facing assistant path.
- SQLite on the research side is operational state, not canonical memory.
- Canonical memory and indexing live in the backend stores.

## Current state

- The local-deep-research compose currently points at host Ollama and SearXNG.
- The compose does not declare GPU passthrough yet.
- The backend already has MCP/tool dispatch, OpenCode permissions, and a registered `ldr_research` tool handler.
- The repo already has canonical backend paths for Postgres 18, pgvector, Qdrant, Neo4j, Redis/Bitfrost, SeaweedFS, DuckDB, and ACE packet generation.

## Boundary matrix

| Layer | Role | What lives here | What does not live here |
| --- | --- | --- | --- |
| Windows host | OpenCode, Gemma4, native addons, host model server | assistant orchestration, N-API addons, local model runtime, user-facing tools | canonical research truth, long-lived research state |
| WSL2 / Docker Linux | optional GPU containers, research workers, model servers | CUDA containers, cuDNN-enabled workers, cuVS experiments, local-deep-research GPU override | browser state, UI caches, canonical DB truth |
| Browser / Service Worker | client cache and offline UX | request cache, IndexedDB, ephemeral UI state | Postgres indexing, canonical vectors, graph truth |
| Research sidecar SQLite | transient LDR state | task status, local history, research scratch state | durable atlas rows, ACE canonical packets, vector truth |
| Backend stores | canonical memory and retrieval | Postgres 18, pgvector, Qdrant, Redis/Bitfrost, Neo4j, SeaweedFS, DuckDB | temporary UI state |

## Storage roles

### Postgres 18

Use Postgres 18 for the durable structured layer:

- `sourceRef`
- `feature_id`
- `alias_id`
- deep research tables
- summary rows
- JSONB metadata
- GIN indexes
- pgvector for transactional / metadata-bound vectors

Postgres is the canonical row store.

### Qdrant

Use Qdrant for high-throughput ANN retrieval:

- codebase chunk vectors
- payload filtering
- heavy search fan-out

Qdrant is the fast vector memory, not the authoritative row store.

### Qdrant ANN / cuVS lane

Default position:

- Qdrant remains the canonical ANN service for this repo.
- cuVS is a future WSL2 / RAPIDS-backed ANN experiment lane, not the default runtime.
- If cuVS is introduced, it should sit behind an adapter so the caller still receives the same retrieval contract.

Current adapter surface:

- `sveltekit-frontend/src/lib/server/search/qdrant-search.ts`
- `sveltekit-frontend/src/lib/server/retrieval/orchestrator.ts`
- `sveltekit-frontend/src/lib/server/features/ai/ace/context-assembler.ts`

Recommended boundary:

- Node / SvelteKit calls a search service or MCP tool.
- The search service decides whether to route to Qdrant HNSW or a cuVS-backed ANN worker.
- The result contract stays the same: `sourceRef`, payload metadata, scores, and provenance.

Use cuVS only when:

- WSL2/Docker GPU is available,
- RAPIDS conda is installed,
- the ANN workload is large enough that the switch is worth the operational cost.

### Redis / Bitfrost

Use Redis / Bitfrost for:

- hot packets
- short TTL cache
- prompt-facing ACE packets
- session and routing hints

Keep this layer compact and replaceable.

### Neo4j

Use Neo4j for explicit relationships:

- context trees
- neighbor expansion
- graph joins
- provenance edges

### SeaweedFS

Use SeaweedFS for:

- raw documents
- large generated artifacts
- export archives
- intermediate blobs

Do not keep large artifacts as long-lived repo files if SeaweedFS can own them.

### DuckDB

Use DuckDB for:

- offline joins
- validation passes
- mapreduce rollups
- deterministic audit queries

DuckDB is the analysis lane, not the canonical source of truth.

## Serialization strategy

### JSON

Use JSON for:

- API requests and responses
- ACE packets
- audit reports
- tool outputs
- human-readable exports

### protobuf

Use protobuf when you need compact binary messages across services:

- worker RPC
- cross-process payloads
- large repeated structures

### FlatBuffers

Use FlatBuffers only if the worker mesh needs zero-copy reads and the payload shape is stable enough to justify it.

### FF1 binary packet

If you want a compact research packet format between local-deep-research and the backend, treat it as a small binary envelope for:

- sourceRef
- query
- summary
- citations
- artifact pointers
- cache keys

Prefer protobuf first unless a worker path proves FlatBuffers is materially better.

## GPU placement

### Windows native

Use the Windows host for:

- `tensorrt_bridge.node`
- cuBLAS / cuBLASLt-backed tensor ops
- fast JSON parsing
- host-side OpenCode + Gemma4 orchestration

### WSL2 / Docker

Use WSL2 containers when you need:

- cuDNN
- cuVS
- Linux-native CUDA workflows
- containerized GPU research jobs

The WSL2 GPU override is optional. Do not assume the research UI container itself needs direct GPU passthrough unless the deployment explicitly requires it.

### cuBLAS / cuDNN / cuVS summary

- cuBLAS and cuBLASLt are already used on the native addon side for tensor math and FP16 ops.
- cuDNN belongs to the WSL2/Docker container lane.
- cuVS belongs to the WSL2/Docker ANN lane.
- Qdrant remains the default ANN service until the cuVS path is benchmarked and wrapped behind the same retrieval contract.

## local-deep-research migration path

1. Keep the research app running as a local service.
2. Treat its SQLite store as scratch / operational state.
3. Export research results as compact JSON packets.
4. Canonicalize those packets in backend services.
5. Persist raw docs and large artifacts in SeaweedFS.
6. Persist structured rows and indexed metadata in Postgres 18.
7. Persist vectors in pgvector or Qdrant depending on retrieval role.
8. Warm Redis / Bitfrost for prompt-facing packets.
9. Emit ACE packets for OpenCode / Gemma4.

## Implementation checklist

1. Freeze the current boundary doc and link it from the roadmap/status files.
2. Verify the research container is still using host Ollama before changing GPU wiring.
3. Add the export/import bridge from local SQLite state into backend canonical rows.
4. Promote summaries and chunks into Postgres 18 deep-research tables.
5. Archive raw docs and large artifacts into SeaweedFS.
6. Feed compact packets into Redis / Bitfrost for OpenCode prompt injection.
7. Keep LangGraph at orchestration level only.
8. Recreate the research container with the WSL2 GPU override only if GPU execution must move into the container.
9. Re-run the assistant-path comparison after each boundary change.

## Gemini / Gemma4 / research split

- **Gemma4**: synthesis, summarization, tool-calling assistant
- **local-deep-research**: research backend, search, crawl, summarize, report
- **Hermes**: archived to the deeds_labs legacy surface; test-only unless a specific lane proves useful

## BM25 + LangExtract + graph fusion

Use the following order for the retrieval lane:

1. lexical pass with BM25
2. LangExtract for entity / provenance enrichment
3. vector retrieval in Qdrant or pgvector
4. graph expansion in Neo4j
5. score fusion
6. compact ACE packet generation

## What not to do

- Do not use browser service-worker storage as a canonical vector store.
- Do not use `better-sqlite3` as a substitute for Postgres JSONB + GIN.
- Do not let local SQLite become the long-term source of truth.
- Do not make LangGraph directly own DB writes.
- Do not mix Windows-native and WSL2 GPU assumptions without documenting the boundary.

## Recommendation

If the next step is implementation, build the boundary in this order:

1. export/import bridge from local SQLite research state
2. canonical Postgres 18 tables and JSONB/GIN indexes
3. SeaweedFS artifact storage
4. Redis / Bitfrost ACE packet cache
5. Qdrant adapter boundary with stable retrieval contract
6. optional WSL2 GPU override for the research container
7. OpenCode-facing tool dispatch
