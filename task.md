# Phase Board Task List

> **Board rule**: The next work stays on the retrieval/mirror side.
> Schema lanes are closed. Do not reopen identity repair.
> The canonical join spine (`sourceRef + feature_id`) is the only key that matters.

---

## 🔥 ACTIVE

- none

---

## ⚡ READY

- **XGBoost supervised reranker** — train (npm run atlas:xgboost:train) + smoke (atlas:xgboost:serve + atlas:cascade:smoke)
- **Proto/RPC tool registry packetization** — audit-proto-registry.mjs → packetize gRPC services + RPC methods → embed tool manifests → Qdrant rpc retrieval → Neo4j rpc graph → MCP runtime selection
- **Reward prior backfill** — populate reward_prior on packets without traces; gates XGBoost label quality
- **PyTorch policy sidecar scaffold** — Stage 5 agent action selector (after XGBoost sidecar is proven); SOM Embedding(400,64) for topology context
- **Graph / KAG / DAG refresh invalidation binding** — complete: refresh-manifest invalidation now binds through atlas truth promotion

---

## ✅ DONE

- **Runtime Queue Layer — NATS / LangGraph**
  - **Status**: READY
  - **Evidence**:
    - Connected to NATS cluster at `127.0.0.1:4222`
    - Listening on `agent.task.execute`
    - Listening on `retrieval.turbovec.rerank`
    - Listening on `gpu.cuvs.search`
    - Listening on `gpu.cuda.rank`
    - Listening on `engram.feedback.async`
  - **Role**: NATS / LangGraph is the async task fabric. Routes: agent tasks, TurboVec rerank jobs, cuVS/GPU benchmark jobs, CUDA rank jobs, async engram feedback. It does not replace Postgres truth, Qdrant dense mirror, Valkey / Bitfrost cache, Neo4j graph mirror, or Go Retrieval fusion.
- **Quantized Codebase Vector realignment & Tool-GAN Traversal Loop**:
  - Re-indexed 52,606 points to default 64d flat vector collection `codebase_chunks_encoded64`.
  - Trained Spherical K-Means ($k=50$) on the 64d projections, populated Redis centroids, and updated payloads.
  - Updated python sidecar to support unnamed default vector scrolling and `/build` HTTP uploads.
  - Built core library `scripts/atlas/lib/agentic-toolgan-core.mjs` with normalized do-not-repeat keys generation.
  - Created 6 Tool-GAN scripts (plan, dedupe, execute, log-outcome, followups, replay) and successfully verified final gate.
- **Route chat completions, query reformulation, and tool detection to llama-server.exe (.gguf)**:
  - Modified `runToolDetectionPass` in `contextual-tools.ts` to support OpenAI `/v1/chat/completions` directly.
  - Modified corrective RAG query reformulation in `+server.ts` to use llama-server OpenAI endpoint.
  - Modified pre-stream tool detection call in `+server.ts` to pass llama-server URL & GGUF model.
  - Modified Tier 3 chat completion streaming fallback in `+server.ts` to stream from llama-server OpenAI endpoint.
  - Modified retry chat completion streaming fallback in `+server.ts` to stream from llama-server OpenAI endpoint.
  - Verified SvelteKit checks pass: `npm --prefix sveltekit-frontend run check` (COMPLETED).
- **Phase 3I canonical atlas_packets / concept spine / RRF validation**:
  - Populated `source_ref_key` for 100% database coverage.
  - Implemented heuristic and path-extracting card classifiers to backfill concept IDs for 12,145 packets.
  - Synced and verified 33,293 USED_CONCEPT edges to Neo4j.
  - Fixed ESM import crashes on Windows.
  - Ran validation, concept spine audit, RRF retrieval benchmark (avgNDCG@10 = 0.748), runtime-coverage, and production readiness checks. All gates passed with 0 errors.
- **MCP probe transport alignment**: Probe matrix is verified and honest.
- **LDR stdio health wrapper**: Implemented health gateways and wrappers.
- **opencode ldr-research registration**: Registered successfully.
- **LangExtract classified as SKIP**: classified skip, service-backed.
- **Phase 20.6 runtime evidence packetization**: Complete.
- **Redis/Valkey auth**: Connected and healthy under environment configurations.
- **Bitfrost warm path**: Verified exact-match cache hits transitioning latency down to ~15-30ms.
- **ACE planner cache**: Verification confirmed.
- **qdrant_point_id-preserving latent index**: Keyed strictly by physical Qdrant point IDs.
- **native CUDA SOM training**: Successfully trained 400 BMUs via native CUDA.
- **latent/SOM writeback for canonical packet vectors**: Complete with 100% writeback match rate.
