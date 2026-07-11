# Parent Atlas Workstation Phase 133-134

**Status**: ACTIVE  
**Updated**: July 10, 2026  
**Scope**: install, wire, and spec-evaluate the parent atlas workstation stack

---

## Current Truth

- `@langchain/langgraph` is installed and already used.
- `@langchain/langgraph-checkpoint-postgres` is installed and is the right persistence lane for thread-scoped state.
- `@opentelemetry/*` is not installed yet.
- NetworkX GPU acceleration is a backend install problem, not a code rewrite problem.
- The server GPU lane is currently LibTorch/CUDA, not Triton.
- `gemma4-rotorquant:latest` remains the server synthesis model.
- `embeddinggemma` remains the canonical embedding lane.
- Apache Arrow 21.1.0 is installed in both the root Atlas owner and the SvelteKit app.
- The bounded Arrow IPC semantic batch is proven with stable train/eval/test splits and a packet-key row index.
- Packet-level `tree_node_id`, `feature_id`, `title_id`, and `domain_class` are complete in live Postgres.
- Canonical packet embedding, summary, AST-symbol, latent64, and SOM coverage remain below promotion thresholds.

---

## What To Install

### Required for Phase 133-134 wiring

- OpenTelemetry JS SDK packages
- any missing testing utilities for the new smoke specs
- any missing graph acceleration backend package if GPU backend dispatch is used in this repo

### Already present and should be reused

- LangGraph
- LangGraph Postgres checkpointer
- Langfuse
- MCP SDK
- AI SDK
- Qdrant client
- Redis/Valkey client
- RabbitMQ client
- PostgreSQL client

---

## Wiring Targets

### 1. LangGraph persistence

Use the existing checkpointer path and keep `thread_id` explicit in config.

Files to keep aligned:

- `sveltekit-frontend/src/lib/server/agent/supervisor.ts`
- `sveltekit-frontend/src/lib/server/ai/langgraph-client.ts`
- `sveltekit-frontend/src/routes/api/agent/investigate/+server.ts`
- `sveltekit-frontend/src/routes/api/research/concurrent-deep/+server.ts`

Tasks:

- [ ] Persist thread-scoped graph state
- [ ] Round-trip `thread_id`
- [ ] Add a smoke spec that restores a prior checkpoint

### 2. OpenTelemetry

Add SDK bootstrap, then emit spans in the hot path.

Files to keep aligned:

- `sveltekit-frontend/src/lib/server/telemetry/`
- `sveltekit-frontend/src/lib/server/observability/langfuse.ts`
- `sveltekit-frontend/src/lib/server/retrieval/`
- `sveltekit-frontend/src/lib/server/analysis/`

Tasks:

- [ ] Install and bootstrap OTel
- [ ] Emit retrieval spans
- [ ] Emit ACP/HMM spans
- [ ] Keep Langfuse as the existing app-level trace surface, but do not confuse it with OTel export

### 3. NetworkX acceleration

Keep the backend dispatch separate from graph logic.

Files to keep aligned:

- `scripts/atlas/`
- any graph processing script that already uses NetworkX

Tasks:

- [ ] Validate backend dispatch with a smoke test
- [ ] Keep GPU acceleration as an optional backend install
- [ ] Do not rewrite graph code to prove the backend path

### 4. GPU topology lane

Use GPU for topology compression and clustering, not for canonical identity or cache storage.

Files to keep aligned:

- `scripts/atlas/train-packet-jepa.py`
- `scripts/atlas/export-packet-jepa-training-pairs.mjs`
- `scripts/atlas/score-packet-jepa-similarity.mjs`
- `scripts/atlas/run-som-on-chunks.mjs`
- `scripts/atlas/gpu-kmeans-clustering.mts`

Tasks:

- [ ] Keep ONNX and browser lanes separate from server GPU lanes
- [ ] Keep any `.pt` / Torch export path tied to a concrete training script
- [ ] Keep SOM/KMeans writeback as derived metrics
- [ ] Benchmark gradient checkpointing as a trade-off, not a default
- [ ] Promote checkpointing only if peak VRAM drops by at least 20% and validation loss regression stays below 1%
- [ ] Record peak allocated VRAM, peak reserved VRAM, examples/second, step latency, epoch latency, gradient norm, NaN/Inf count, OOM count, and checkpoint size for every profile

### 5. Browser synthesis lane

Files to keep aligned:

- `sveltekit-frontend/src/lib/client/`
- `sveltekit-frontend/src/routes/api/synthesis/generate/+server.ts`
- `sveltekit-frontend/src/routes/api/sse/chat/+server.ts`

Tasks:

- [ ] Keep browser synthesis bounded
- [ ] Keep browser fallback separate from server synthesis
- [ ] Keep client-side cache reads deterministic

---

## Spec Eval Tests

These are the smoke/eval conditions that should pass before the lane is considered wired:

- LangGraph checkpoint restore passes with `thread_id`
- OTel bootstrap produces spans for retrieval and ACP
- NetworkX backend smoke passes with GPU backend dispatch enabled
- runtime-cache promotion smoke passes
- GPU topology smoke passes for SOM/KMeans output
- JEPA evaluation still beats baseline before promotion
- Arrow IPC replay has no duplicate packet keys, missing required columns, invalid splits, or malformed float buffers
- QLoRA/AE/JEPA promotion is blocked when the live coverage report is below threshold
- Gradient checkpointing stays off by default unless the benchmark matrix proves the trade-off

Current command: `npm run atlas:training:readiness`

Current result: `READY_WITH_BLOCKERS`. Arrow and bounded HyperRAG materialization pass; QLoRA, AE, JEPA promotion, and GPU topology remain blocked.

---

## Recommended Execution Order

1. Verify the LangGraph checkpointer smoke.
2. Install and bootstrap OTel.
3. Add the NetworkX backend smoke.
4. Wire the GPU topology lane to derived metrics.
5. Keep browser ONNX and server GPU lanes separated.
6. Re-run the JEPA gate only after the embedding coverage is real.
7. Run the gradient-checkpoint benchmark matrix before turning checkpointing on by default.

---

## Notes

- Do not collapse TensorRT, Triton, LibTorch, and PyTorch into one lane.
- Do not move model conversion into the hot runtime path.
- Do not let browser fallback mutate canonical truth.
