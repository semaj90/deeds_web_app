# Architecture Implementation Board

**Status**: ACTIVE  
**Updated**: July 10, 2026  
**Scope**: browser/server/cache/feedback-loop architecture turned into concrete file targets

---

## Board Goal

Convert the current architecture summary into a file-by-file implementation board.

The system is already split into browser, server, cache, and feedback-loop lanes. The missing work is to align each lane to a concrete set of files, tests, and validation gates.

---

## Dependency Baseline

### Already installed in `sveltekit-frontend/package.json`

- `@langchain/community@1.0.2`
- `@langchain/core@1.0.4`
- `@langchain/langgraph-checkpoint-postgres@1.0.1`
- `@langchain/langgraph@1.4.7`
- `@langchain/ollama@1.0.1`
- `@langchain/openai@1.1.0`
- `@langchain/textsplitters@1.0.0`
- `langchain@1.0.4` (extraneous)
- `langfuse-core@3.38.6` (extraneous)
- `langfuse@3.38.6` (extraneous)

### Missing for the Phase 9 telemetry rollout

- `@opentelemetry/api`
- `@opentelemetry/sdk-node`
- `@opentelemetry/auto-instrumentations-node`

### Optional acceleration path

- `nx-cugraph` backend for NetworkX GPU dispatch

### Relevant official contract points

- LangGraph checkpointers persist thread-scoped graph state and use `thread_id` in config
- OpenTelemetry JavaScript requires SDK initialization for traces and metrics
- NetworkX uses backend dispatch, so GPU acceleration is a backend install rather than a code rewrite

---

## Browser Lane

### Gemma4 E2B 2.3B (WebGPU)

Files to keep aligned:

- `sveltekit-frontend/src/lib/client/`
- `sveltekit-frontend/src/routes/api/synthesis/generate/+server.ts`
- `sveltekit-frontend/src/routes/api/sse/chat/+server.ts`

Implementation tasks:

- [ ] Keep browser synthesis bounded to the current token budget
- [ ] Keep browser fallback separate from server synthesis
- [ ] Keep browser-side cache reads deterministic

### Gemma3 270M ONNX (WASM)

Files to keep aligned:

- `sveltekit-frontend/src/lib/client/`
- `sveltekit-frontend/src/lib/server/ai/`

Implementation tasks:

- [ ] Keep lightweight fallback inference isolated from server GPU lanes
- [ ] Verify browser fallback does not mutate canonical packet identity

### EmbeddingGemma 300M ONNX

Files to keep aligned:

- `sveltekit-frontend/src/lib/server/embedding/`
- `sveltekit-frontend/src/lib/server/embeddings/`
- `sveltekit-frontend/src/routes/api/embed/+server.ts`

Implementation tasks:

- [ ] Keep embedding generation on the canonical embedding lane
- [ ] Ensure embedding coverage feeds the JEPA promotion gate
- [ ] Keep embedding outputs traceable to `packet_key` and `source_ref`

---

## Server Lane

### Ollama gemma4-rotorquant:latest

Files to keep aligned:

- `sveltekit-frontend/src/lib/server/llm/`
- `sveltekit-frontend/src/lib/server/ai/`
- `sveltekit-frontend/src/lib/server/observability/langfuse.ts`

Implementation tasks:

- [ ] Keep synthesis and reranking explicitly separated
- [ ] Keep trace spans on every synthesis call
- [ ] Keep long-context behavior bounded by the current workspace contract

### Ollama embeddinggemma

Files to keep aligned:

- `sveltekit-frontend/src/lib/server/embedding/`
- `sveltekit-frontend/src/lib/server/embeddings/`

Implementation tasks:

- [ ] Keep embeddings canonical for retrieval and JEPA evaluation
- [ ] Do not let fallback paths overwrite the canonical vector surface

### LibTorch N-API CUDA lane

Files to keep aligned:

- `sveltekit-frontend/src/lib/server/gpu/`
- `sveltekit-frontend/src/lib/server/telemetry/`
- `scripts/atlas/`

Implementation tasks:

- [ ] Keep CUDA work on the GPU lane only
- [ ] Use it for matrix ops, inference, and reranking, not identity storage
- [ ] Keep PyTorch topology compression separate from TensorRT deployment concerns
- [ ] Keep SOM/KMeans and Neo4j classification fed from derived metrics, not raw packets
- [ ] Keep `.pt` / Torch export tied to a concrete training script, not ad hoc conversion

### Worker Threads / RabbitMQ

Files to keep aligned:

- `sveltekit-frontend/src/lib/server/workers/`
- `sveltekit-frontend/src/lib/server/queue/`
- `scripts/workers/`

Implementation tasks:

- [ ] Keep worker jobs bounded and observable
- [ ] Keep queue payloads schema-valid
- [ ] Keep fan-out jobs separate from canonical writes

---

## Cache Lane

### 7-layer cache

Files to keep aligned:

- `sveltekit-frontend/src/lib/runtime-cache/`
- `sveltekit-frontend/src/routes/api/atlas/runtime-cache/`
- `sveltekit-frontend/src/service-worker.ts`
- `scripts/atlas/warm-redis-lod-cache.mjs`

Implementation tasks:

- [ ] Keep L0-L6 semantics explicit
- [ ] Keep exact hits, near hits, and losers separate
- [ ] Keep health checks side-effect free
- [ ] Keep promotion records durable

### Redis exact / Bifrost semantic / Embedding Redis / CouchDB DAG

Files to keep aligned:

- `sveltekit-frontend/src/lib/server/cache/`
- `sveltekit-frontend/src/lib/server/features/ai/cache/`
- `scripts/atlas/`

Implementation tasks:

- [ ] Keep cache promotion policy deterministic
- [ ] Keep semantic cache warming tied to validated winners
- [ ] Keep archive tiers out of the hot lane

---

## Feedback Loop

### Wiki -> Timeline -> RL Weights -> QLoRA -> Cache Warm -> Hypergraph4D

Files to keep aligned:

- `scripts/atlas/`
- `sveltekit-frontend/src/lib/server/analysis/`
- `sveltekit-frontend/src/lib/server/retrieval/`
- `next_steps/active/`

Implementation tasks:

- [ ] Keep RL/QLoRA work downstream of stable retrieval
- [ ] Keep replay and evaluation data separate from canonical truth
- [ ] Keep cache warm steps bounded and validated

---

## Validation Gates

Use these gates to move work from planned to proven:

- [ ] Runtime-cache promotion smoke test passes
- [ ] OTel spans are emitted for retrieval and ACP
- [ ] JEPA beats the 384d baseline on held-out `MRR` and `NDCG@10`
- [ ] Cache promotion records persist to Postgres
- [ ] Worker batches remain bounded and traceable

---

## Recommended Order

1. Finish the runtime-cache promotion path.
2. Add the OTel bootstrap and spans.
3. Raise canonical packet embedding coverage.
4. Re-run JEPA on the real 384d cohort.
5. Wire only the winning signals into reranking.
6. Keep the feedback loop below the canonical truth layer.

---

## Notes

This board is intentionally file-oriented.

The goal is to reduce ambiguity about which lane owns which behavior before adding new model work or new promotion logic.
