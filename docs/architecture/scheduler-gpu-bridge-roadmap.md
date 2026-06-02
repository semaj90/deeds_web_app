# Scheduler-GPU Bridge Roadmap

This note compares the current repo scheduler against the proposed CUDA/N-API bridge direction and defines the boundary between:

- TypeScript scheduler logic
- N-API / C++ bridge logic
- LibTorch / CUDA kernel logic
- later-phase CUDA Graph / RAFT / TensorRT-LLM work

The goal is to keep the control plane in TypeScript, keep the numeric hot path in the native bridge, and avoid moving scheduler semantics into CUDA too early.

---

## 1. Current Scheduler Responsibilities

The current scheduler is already a TypeScript control plane. It owns routing, provenance, cache policy, orchestration, and report generation.

### Core entry points

- `sveltekit-frontend/src/lib/server/retrieval/orchestrator.ts`
  - canonical retrieval pipeline entry point
  - composes embedding, Qdrant search, corrective RAG, DAG ordering, graph context, authority scoring, and graph expansion
- `sveltekit-frontend/src/lib/server/features/ai/ace/context-assembler.ts`
  - ACE context assembly and packet construction
  - drives retrieval lanes, KAG/graph context, packet cache, and ACE persistence
- `sveltekit-frontend/src/lib/server/features/ai/ace/kag-dag-runner.ts`
  - DAG run orchestration, node execution order, cache short-circuiting, persistence of DAG nodes/edges
- `sveltekit-frontend/src/lib/server/tasks/task-semantic-packet-tuple.ts`
  - deterministic task packet tuple and report snapshot writer
- `sveltekit-frontend/src/lib/server/tasks/semantic-packets.ts`
  - task semantic packet workflow, Qdrant attachment, agent pickup, and packet hydration
- `sveltekit-frontend/src/lib/server/admin/subagent-orchestrator.ts`
  - tool-calling subagent loop with mission trace and outcome ledger
- `sveltekit-frontend/src/mcp-gpu-orchestrator.ts`
  - task dispatcher for GPU-labeled work, protocol selection, and service routing
- `sveltekit-frontend/src/lib/server/features/ai/ace/nes-chrom-packet-service.ts`
  - compact packet persistence and KAG DAG hit recording

### What the scheduler currently decides

- which retrieval lane to run
- whether to use cache or recompute
- whether to call the native addon or fall back to CPU
- how to serialize packets and provenance
- how to persist task/ACE/NES chrom/engram outputs
- when to emit timeline, audit, and report artifacts

### What the scheduler should keep owning

- sourceRef / feature_id / alias_id provenance
- task and packet policy
- Redis cache keys and TTLs
- report generation
- route and tool dispatch
- fallback behavior
- replay determinism

---

## 2. Current N-API / C++ Bridge Responsibilities

The native bridge is already present and should remain a math and memory boundary, not a scheduler.

### Current bridge files

- `sveltekit-frontend/src/lib/server/gpu/libtorch-bridge.ts`
  - loads `tensorrt_bridge.node`
  - exposes CPU fallback and CUDA readiness checks
  - marshals typed arrays into native calls
- `sveltekit-frontend/src/lib/server/gpu/cuda-bridge.ts`
  - convenience wrapper around the LibTorch bridge
- `sveltekit-frontend/src/lib/server/ai/libtorch-reranker.ts`
  - attention reranking wrapper with CUDA Graph warmup intent
- `sveltekit-frontend/src/lib/server/ai/cuda-graph-manager.ts`
  - CUDA Graph capture/replay wrapper
- `sveltekit-frontend/src/native/libtorch_inference.cc`
  - example N-API addon code for LibTorch / CUDA / typed array bridging
- `simd-bridge/cpp/...`
  - native implementation target for `tensorrt_bridge.node`

### Current native responsibilities

- consume `Float32Array` / typed arrays
- compute batch cosine similarity
- cluster embeddings
- compute weighted embeddings
- perform attention / reward scoring
- expose CUDA readiness
- support CPU fallback when native code is unavailable
- optionally capture/replay CUDA graphs when explicitly enabled

### What the bridge should not own

- queue routing
- tool-calling loops
- schema changes
- packet provenance policy
- Redis/Postgres/Qdrant/Neo4j orchestration
- user-facing prompt logic
- report generation

### Practical boundary rule

If a function decides *what to do next*, it belongs in TypeScript.

If a function computes *numbers from vectors*, it belongs in C++/CUDA.

---

## 3. Current CUDA / LibTorch Kernels

The repo already has a usable CUDA-native lane. The safe interpretation is: this lane is the ALU.

### Current kernel surface

From the bridge interface and native example code, the current GPU/math surface includes:

- `graphSimilarity` / `graphSimilarityHalf`
- `clusterEmbeddings`
- `computeCaseEmbedding`
- `lstmAdd`
- `somCache`
- `dotProduct`
- `scale`
- `relu`
- `batchCosineSimilarity`
- `attentionScoreGPU`
- `attentionScoreGPU_fp16`
- `rewardScoreGPU`
- `rewardScoreGPU_fp16`
- `batchCosineSimilarity_fp16`
- `pageRankGPU`
- `softmaxGPU`
- `topKIndicesGPU`
- `autoencoderEncode`
- `autoencoderDecode`
- `pcaProject`

### What these kernels should do

- cosine similarity
- clustering / centroid assignment
- SOM-style cache math
- attention/rerank scoring
- PageRank / authority scoring
- autoencoder encode/decode
- PCA / projection

### What they should not do

- parse repository files
- route jobs
- mutate DB schema
- manage task queues
- emit reports
- assemble ACE packets
- decide on fallback policy

### Current kernel use sites

- retrieval reranking
- codebase clustering
- ACE context authority scoring
- batch similarity / ranking
- packet warmup / graph replay planning

---

## 4. TypeScript vs C++ vs CUDA: What Belongs Where

| Layer | Owns | Does not own |
|---|---|---|
| TypeScript scheduler | task routing, provenance, packet assembly, cache policy, orchestration, fallbacks, report generation | heavy vector math, graph kernels |
| N-API / C++ bridge | typed-array marshaling, stable numeric APIs, memory guardrails, graph replay wrappers | repo semantics, DB logic, tool-calling |
| CUDA / LibTorch | cosine, clustering, PCA, attention, reward scoring, graph math | schema, queue routing, payload policy |

### Practical examples

- `task-semantic-packet-tuple.ts`
  - TypeScript
  - deterministic snapshot and replay tuple
- `libtorch-bridge.ts`
  - TypeScript wrapper over native addon
- `tensorrt_bridge.node`
  - C++ / CUDA execution lane
- `context-assembler.ts`
  - TypeScript
  - decides what to assemble and when to persist
- `libtorch-reranker.ts`
  - TypeScript wrapper over CUDA scoring

---

## 5. Where Task Semantic Packet Apply Fits

Task Semantic Packet apply is a scheduler-level responsibility.

### Files

- `sveltekit-frontend/src/lib/server/tasks/task-semantic-packet-tuple.ts`
- `sveltekit-frontend/src/lib/server/tasks/semantic-packets.ts`
- `sveltekit-frontend/src/lib/server/db/schema/tasks.ts`
- `sveltekit-frontend/src/routes/api/tasks/packets/+server.ts`

### What it does

- normalizes task state into a deterministic tuple
- preserves `sourceRef`
- preserves `feature_id`
- preserves Qdrant / cluster / queue identifiers
- snapshots the packet to JSON + markdown for replay
- attaches relevant files from Qdrant
- enqueues agent pickup
- hydrates and claims follow-up work

### Where it belongs

This lane stays in TypeScript because it is about:

- task semantics
- provenance
- replayability
- queue state
- schema mediation

Only the numeric scoring that ranks candidate packets should cross into the native lane.

---

## 6. Where Atlas Phase 6 Synthetic Trace Simulator Fits

The Phase 6 trace simulator is also a TypeScript control-plane lane.

### Repo-grounded sources

- `docs/engram-offline-processing-pipeline.md` — Phase 6 ACE packet assembly and enrichment
- `docs/reports/phase6e-contract-finding-triage.md`
- `docs/reports/phase-h2-cuda-streams-report.md`
- `docs/reports/pgvector-index-plan.md`
- `docs/atlas/phase-lanes.md`

### What the simulator should do

- build a synthetic trace batch
- feed it through the current scheduler
- preserve sourceRef and feature_id provenance
- emit replayable reports
- compare expected packet flow vs observed packet flow
- stress the packet cache / DAG ordering / retrieval lanes

### What it should not do yet

- own CUDA Graph conditional nodes
- replace the current scheduler
- depend on RAFT/cuVS
- replace the Ollama/GGUF smoke lane

### Best placement

The trace simulator belongs between:

1. scheduler routing
2. packet assembly
3. report emission

and only later, after the packet shape is stable, should it be used to motivate CUDA Graph capture/replay experiments.

---

## 7. Why CUDA Graph Conditional Nodes Are Later-Phase Only

CUDA Graph conditional execution is a useful optimization, but only after the packet shape and call graph are stable.

### Why it is later-phase

- the current scheduler still changes more often than the kernel math
- packet and provenance contracts are still being normalized
- several paths still rely on CPU fallback
- the repo still has active work on packet/report shapes
- graph capture is only useful when the same shapes repeat frequently

### What has to be true first

- task packet shapes are stable
- ACE packet shapes are stable
- retrieval trace shapes are stable
- KAG / NES chrom packet shapes are stable
- the simulator can replay the same shape many times

### Existing preview point

`sveltekit-frontend/src/lib/server/ai/cuda-graph-manager.ts` already exists as a wrapper. That is the correct place to introduce graph replay later, not to move scheduler logic into CUDA now.

---

## 8. Why `cudaHostRegister` / Zero-Copy Is Benchmark-Only For Now

Pinned memory and zero-copy can help, but they are not the first optimization to make in this repo.

### Why not now

- JSON/JSONB and packet shape drift are still the larger cost
- the current bottleneck is often orchestration, not memcpy
- the repo is still standardizing provenance tuples and packet envelopes
- many flows are already small enough that the copy cost is secondary

### Correct near-term use

- benchmark only
- pinned host buffers for repeated large batches
- typed arrays for hot kernel paths
- do not replace current JSONB / tuple / cache contracts yet

### Rule of thumb

Use zero-copy only after:

- packet shape is stable
- the benchmark shows the copy is the limiting cost
- the data stays in the hot path long enough to amortize complexity

---

## 9. Why RAFT / cuVS Is Optional WSL2/Linux Experiment Work

RAFT / cuVS belongs behind the existing ANN adapter seam, not as a new default path.

### Current repo stance

- Qdrant remains the default ANN backend
- `searchCodebaseAnn(...)` is the seam
- cuVS/CAGRA is a future switchable backend
- WSL2/Docker is the appropriate home for the experiment lane

### Why it stays optional

- it is environment-sensitive
- it introduces another dependency stack
- it should not block current retrieval correctness
- the repo already has stable Qdrant-backed retrieval

### What to keep stable

- query shape
- result shape
- `sourceRef` provenance
- score semantics
- caller contract

### What can change later

- backend implementation
- ANN engine internals
- GPU indexing strategy

---

## 10. Why TensorRT-LLM Is a Future Serving Lane, Not the Ollama Smoke Lane

The current smoke and assistant path are still Ollama / GGUF based.

### Current lane

- host-side Ollama / llama-server
- GGUF models
- `embeddinggemma:latest`
- `gemma4-rotorquant:latest`
- deterministic fallback behavior

### TensorRT-LLM lane

- future serving optimization
- separate deployment path
- not the current smoke baseline
- not a replacement for the current assistant control plane

### Rule

Do not swap the smoke lane out from under the current scheduler until the new serving lane has a matching replay / provenance / fallback story.

---

## 11. Milestones

| Milestone | Scope | What must be true |
|---|---|---|
| P4 / P5 scheduler correctness | TypeScript scheduler and packet semantics | stable routing, cache policy, provenance, reportability |
| P5.5 N-API typed-array batch bridge | C++/N-API bridge for large typed arrays | deterministic typed-array marshaling, CPU fallback, no scheduler logic in native code |
| P6 synthetic trace simulator | trace replay / packet assembly / audit | replayable trace batches, packet provenance, report output |
| P6.3 CUDA Graph prototype | graph capture/replay wrapper | only after stable shapes and benchmark evidence |
| P7 optional RAFT / TensorRT experiments | experimental serving and ANN lanes | behind adapter seams, optional, non-blocking |

### Suggested gating order

1. P4 / P5 scheduler correctness
2. P5.5 typed-array bridge hardening
3. P6 synthetic trace simulator
4. P6.3 CUDA Graph prototype
5. P7 RAFT / TensorRT experiments

---

## 12. Repo-Explicit Conclusions

1. The scheduler is still the authority. Keep it in TypeScript.
2. The native bridge is the ALU. Keep it numeric and typed-array driven.
3. CUDA kernels should compute, not orchestrate.
4. Task Semantic Packet apply is a control-plane job.
5. Phase 6 trace simulation is a replay/report job.
6. CUDA Graphs are later-phase optimization work.
7. `cudaHostRegister` is a benchmark decision, not a default.
8. RAFT/cuVS is optional WSL2/Linux experiment work behind the ANN seam.
9. TensorRT-LLM is a future serving lane, not the current Ollama smoke lane.

This keeps the repo stable while still leaving a clean path for GPU acceleration where it actually matters.
