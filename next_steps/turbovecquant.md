# TurboVecQuant Inference Architecture

**Date**: 2026-05-17
**Status**: design
**Scope**: SvelteKit 2 app wiring for merged Gemma4 legal chat, embeddings, KV cache policy, TurboVec retrieval acceleration, and BitFrost/Redis app caching.

## Related

- [`inference.md`](./inference.md) - directory map and KAG/contextual graph dependency layout.

## Goal

Define a buildable inference stack where the merged legal Gemma4 model handles generation, `embeddinggemma` handles embeddings, llama.cpp runtime KV caching stays isolated in the launcher, and TurboVec acts as a local retrieval accelerator before Qdrant/Postgres fallback.

## Canonical env and runtime map

| Key | Canonical value | Notes |
|-----|-----------------|-------|
| `TURBO_PROFILE` | `stock` | default until patched llama-server is validated |
| `TURBO_CTX` | `16384` | working baseline for this session |
| `OLLAMA_BASE_URL` | `http://localhost:11434` | legacy/fallback Ollama lane |
| `OLLAMA_URL` | `http://localhost:11434` | older code/docs alias |
| `PUBLIC_APP_URL` | `http://localhost:5173` | frontend origin in dev |
| `DATABASE_URL` | `postgresql://legal_admin:123456@127.0.0.1:5434/legal_ai_db` | app DB proxy |
| `REDIS_URL` | `redis://127.0.0.1:6379` | BitFrost / hot cache |
| `QDRANT_URL` | `http://127.0.0.1:6333` | durable vector store |

## Canonical model and process rules

- 8 GB VRAM stays effectively single-GPU-process territory.
- `llama-server` owns runtime KV cache only.
- BitFrost / Redis stores app cache only.
- Embeddings stay on the embedding lane; do not merge them into the Gemma4 chat lane.
- `turbo3` / `turbo4` stay disabled until the patched binary is confirmed.
- MTP drafter is generation speed only and never picks sourceRefs.

## Service endpoint map

| Service | Canonical endpoint | Notes |
|---------|--------------------|-------|
| TurboQuant llama-server | `http://localhost:8090` | primary text + vision lane |
| TensorRT-LLM | `http://localhost:8099` | optional accelerator |
| Triton | `http://localhost:8000` | optional accelerator |
| HF VLM Server | `http://localhost:8085` | vision fallback |
| LiteRT-LM | `http://localhost:8070` | CPU fallback |
| Ollama | `http://localhost:11434` | fallback LLM / embeddings legacy lane |
| Bifrost proxy | `http://localhost:3040` | semantic cache L2 lane |
| Langfuse UI | `http://localhost:3030` | traces / observability |
| Inference router | `http://localhost:5173/api/inference/route` | route selection entrypoint |
| Inference status | `http://localhost:5173/api/inference/status` | router health + VRAM |

## Env alias map

| Env key | Canonical target | Notes |
|---------|------------------|-------|
| `TURBOQUANT_BASE_URL` | `http://127.0.0.1:8090` | preferred launcher/runtime URL |
| `BIFROST_URL` | `http://127.0.0.1:3040` | semantic cache / L2 cache |
| `LANGFUSE_URL` | `http://127.0.0.1:3030` | traces UI |
| `TURBO_PORT` | `8090` | deployment docs still use this for the host port |
| `TURBO_PROFILE` | `stock` | default KV profile until patched binary is validated |
| `TURBO_CTX` | `16384` | working baseline |
| `LLAMACP_URL` | local llama.cpp lane | appears in repo-root atlas env inventory |
| `OLLAMA_BASE_URL` | `http://localhost:11434` | fallback LLM / embeddings lane |
| `PUBLIC_APP_URL` | `http://localhost:5173` | frontend origin for local requests |
| `DATABASE_URL` | `postgresql://legal_admin:123456@127.0.0.1:5434/legal_ai_db` | canonical app DB |
| `REDIS_URL` | `redis://127.0.0.1:6379` | BitFrost / hot cache |
| `QDRANT_URL` | `http://127.0.0.1:6333` | durable vector store |
| `NEO4J_URI` | `bolt://localhost:7687` | graph store |
| `SEAWEED_ENDPOINT` | `localhost:8888` | filer metadata gateway |
| `MINIO_ENDPOINT` | `localhost:8333` | S3 asset gateway legacy name |

## Observed TurboQuant profiles

| Profile | KV / mode | Notes |
|---------|-----------|-------|
| `stock` | `q8_0/q8_0` | default until patched binary is validated |
| `turboquant` | turbo KV mode | appears in launcher and profile docs |
| `turboquant-safe` | guarded turbo KV mode | used when parity is uncertain |
| `atomicbot` | launcher-specific profile | appears in rover/rotor docs |

## Cluster ingestion notes

- TurboQuant `:8090` is also the summarization backend for codebase cluster ingestion.
- Stage 6 summary runs with `cache_prompt:true` and feeds `cluster_summaries` plus Redis `summary:cluster:*`.
- Ollama is fallback only when the TurboQuant lane is unhealthy.

## Canonical lanes

```
User request
  |
  v
SvelteKit 2 route / API handler
  |
  +--> Zod validation
  |
  +--> BitFrost / Redis hot cache lookup
  |
  +--> TurboVec local retrieval fast-path
  |        |
  |        +--> Qdrant / Postgres / graph fallback
  |
  +--> embeddinggemma for query vectors
  |
  +--> merged legal Gemma4 chat model
           |
           +--> stock KV cache or turbo3/turbo4 KV mode
           +--> optional MTP drafter for generation speed only
```

## What each layer owns

| Layer | Role |
|------|------|
| SvelteKit 2 | UI shell, API routes, admin surfaces |
| Zod | request validation boundary |
| Drizzle | database contract and persistence |
| Postgres | source of truth for metadata |
| Qdrant | durable vector store |
| Redis / BitFrost | hot answers, hot retrieval context, short TTL cache |
| TurboVec | local compressed vector short-circuit |
| embeddinggemma | embeddings only |
| merged legal Gemma4 | answer generation and multimodal input |
| llama.cpp KV | runtime attention cache only |
| MTP drafter | speculative decode / generation acceleration only |

## Runtime rules

1. The merged legal Gemma4 model is the only chat/generation model.
2. The model server does not own embeddings.
3. TurboQuant is runtime-only and only affects llama.cpp KV behavior.
4. BitFrost caches application artifacts, not model KV state.
5. TurboVec never replaces Qdrant or Postgres; it only reduces retrieval latency.
6. The server may advertise `multimodal`, but that only means the multimodal path is available if the loaded build includes the projector.
7. The merged legal model is the generation model; it is not automatically a true VLM unless the build actually includes vision weights.

## Notes: model and modalities

- Merged legal model: `gemma4-legal-iq4xs-direct.gguf`.
- LoRA merged: yes.
- Multimodal / VLM: `capabilities: ["completion", "multimodal"]` means the server can accept multimodal inputs.
- True VLM still requires a vision encoder plus projector in the model/export.
- Practical rule: text-only GGUF works for chat; image inputs work only if the build includes the vision stack.

## Recommended wiring

### Generation

- Load the merged legal GGUF in the llama-server lane.
- Keep `TURBO_PROFILE=stock` as the default.
- Enable `turbo3` or `turbo4` only after the patched binary is confirmed.
- Keep KV cache settings separate from model weights and LoRA merge status.
- Treat KV cache as internal llama.cpp state, not as an app cache.
- KV modes: `q8_0/q8_0` for stock, `turbo3` / `turbo4` only after validation.

### Embeddings

- Use `embeddinggemma:latest` as the primary embedding lane.
- Keep browser-local `embeddinggemma_300m_onnx` as fallback only.
- Do not route embeddings through the Gemma4 chat server.

### Retrieval

- Check Redis/BitFrost first for hot hits.
- Use TurboVec for local compressed recall.
- Fall back to Qdrant and then graph/Postgres expansion.
- Store the chosen sourceRefs and trace events alongside the answer.
- Treat BitFrost as the external cache layer for hot answers, ACE packets, and retrieval artifacts.

## Cache split

### KV cache (llama.cpp)

- Internal attention memory.
- Per-request, lives inside the server.
- Controlled by launch flags and profile.

### BitFrost / Redis (external)

- Cross-request memory.
- Stores `ace:answer:*`, `ace:cartridge:*`, `ace:ctx:*`, and `bifrost:kv:stats` / hot cluster metadata.
- Stores hot answers, retrieved context, and cache telemetry.

## Suggested route surface

- `/app/chat` - primary chat UI
- `/admin/atlas` - retrieval and graph ops
- `/api/chat` - user chat entrypoint
- `/api/embed` - embedding gateway
- `/api/admin/atlas/query` - validated retrieval query
- `/api/admin/atlas/reindex` - controlled reindex entrypoint

## Build order

1. Lock the canonical model wiring in config: merged legal Gemma4 for chat, `embeddinggemma` for vectors.
2. Keep `TURBO_PROFILE=stock` as the default startup profile.
3. Add Zod-guarded SvelteKit routes for chat and atlas query flow.
4. Add Redis/BitFrost cache checks around retrieval and answer reuse.
5. Add a TurboVec sidecar or N-API module as the local fast-path.
6. Sync TurboVec with Qdrant/Postgres ingestion jobs.
7. Turn on `turbo3` / `turbo4` only after the patched llama-server binary passes startup checks.

## Open questions

1. Sidecar or N-API first for TurboVec.
2. Which Redis keys count as cacheable answer artifacts versus ephemeral trace state.
3. Whether MTP drafting is a launcher flag or a separate generation service.
4. Whether TurboVec indexes are per-source, per-topic, or per-run.

## Non-goals

- Replacing Qdrant.
- Folding embeddings into the Gemma4 chat server.
- Treating Redis as the primary vector store.
- Mixing runtime KV cache policy into the model weight artifact.
- Requiring true VLM vision weights just because the server advertises `multimodal`.

## Request flow

1. User (Chat UI / OpenCode / Cline / Hermes).
2. SvelteKit API.
3. Zod validation.
4. BitFrost (MoE router).
5. Redis ACE cache check for answer / context.
6. CHR97 / TurboVec fast-path.
7. Qdrant (`embeddinggemma` vectors).
8. Neo4j / Postgres / CouchDB expansion.
9. BitFrost scoring: cosine + pagerank + topology + hotness.
10. Gemma4 Legal (`:8090`) synthesis.
11. Return answer + sourceRefs.
12. Cache to Redis (`ace:answer`, `ace:ctx`, stats).

## Embeddings

- Not Gemma4.
- Primary: `embeddinggemma:latest` on `:11434`.
- Fallback: browser-local ONNX.
- All vector search paths (`Qdrant`, `TurboVec`) use 768-d embeddings.

## TurboQuant KV

- Runtime-only, no training or merging.
- Current default: `TURBO_PROFILE=stock` → `q8_0/q8_0`.
- To enable: patched llama-server + `TURBO_PROFILE=turbo3` or `turbo4`.
- Keep stock as the default until turbo modes are validated.

## MTP / speculative decoding

- Optional speed layer.
- Drafter is a small model.
- Verifier is Gemma4.
- Never touches retrieval or sourceRefs.

## Clean split

- Model weights: merged legal Gemma4.
- Generation lane: same merged legal Gemma4 model.
- Multimodal lane: available only if the server build actually includes it.
- Embeddings: `embeddinggemma`.
- KV cache: internal llama.cpp runtime state.
- BitFrost: external app cache.
- MTP drafter: optional generation accelerator only.

## Minimal working system

- Gemma4 Legal (RotorQuant IQ4_XS) - yes.
- `embeddinggemma` (768d) - yes.
- Qdrant retrieval - yes.
- Redis ACE cache - yes.
- CHR97 fast path - yes.
- HyperRAG fallback - yes.
- 4D topology rerank - yes.
- Rollback / orchestration - yes.

## What to do next

1. Fix `codebase_chunks_768` ingestion.
2. Lower CHR97 threshold to about `0.45`.
3. Build `/admin/atlas`.
4. Add runtime panel for model, KV profile, embedding model, Redis hit rate, and Qdrant hits.
5. Reuse embeddings once, everywhere.
6. Add `rg` fallback when Qdrant returns zero hits.

## Clean rules

- Model weights -> merged Gemma4.
- Embeddings -> `embeddinggemma`.
- KV cache -> llama-server runtime.
- BitFrost -> external Redis cache.
- MTP -> generation speed only.
