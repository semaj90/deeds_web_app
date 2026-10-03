## Why

Parent Atlas already has separate owners for source lineage, AST/CST extraction, PostgreSQL retrieval, Go Retrieval, semantic embeddings, classifiers, GPU execution, residency, and llama-server synthesis. The remaining risk is cross-lane drift: an executor, index, cache, or model upgrade can appear healthy while consuming an unqualified cohort or silently becoming a second authority. TensorRT-RTX 1.6 now has an official CUDA 13.4 package, but CUDA 13.4 must be proven in an isolated compatibility lane rather than replacing the existing WSL2/RAPIDS environment.

## What Changes

- Add a planning and proof contract that coordinates existing retrieval, AST, semantic, classifier, GPU, residency, and llama-server owners.
- Define a source-revision-qualified compatibility receipt for PostgreSQL lexical search, pgvector semantic search, AST/CST evidence, Go Retrieval, PyTorch/XGBoost, NetworkX/cuGraph, cuTile/SIMT, TensorRT-RTX, and llama-server.
- Add a TensorRT-RTX CUDA 13.4 proof ladder: prerequisite census, isolated AOT engine build, device JIT, runtime-cache identity, CPU/PyTorch/ONNX parity, and rollback evidence.
- Add cross-lane tests for identity propagation, single logical-lane fusion, executor capability separation, cache-swap safety, and model-server endpoint compatibility.
- Add an OpenSpec workboard mapping existing changes to dependency gates; this change does not claim to complete every existing OpenSpec task.
- Keep all canonical database, packet, Qdrant, Valkey, GPU-cache, model, and source mutations closed until their owning change authorizes them.
- Add a bounded `analyze this` diagnostic coordinator that composes dirty-worktree `rg`/AST-grep evidence with existing Go Retrieval and PostgreSQL lanes without promoting worktree results.
- Make the ACE/BitFrost cache boundary explicit: cache revisioned packets, manifests, candidates, centroids, and residency descriptors; never persist model KV state, hidden state, or raw tensors.
- Reconcile provider ownership so llama-server `:8090` is the only synthesis lane and Ollama `:11434` is EmbeddingGemma-only.
- Capture TurboVec installation status and Python worker/free-threading evidence without assuming a wheel, Python 3.14, or free-threaded execution is active.

## Capabilities

### New Capabilities

- `retrieval-executor-compatibility`: Cross-lane compatibility receipts and proof gates for canonical retrieval, derived executors, GPU runtimes, residency, and synthesis service boundaries.

### Modified Capabilities

- None. Existing retrieval, lineage, identity, and runtime requirements remain owned by their current OpenSpec changes.

## Impact

- Planning artifacts under `openspec/changes/parent-atlas-retrieval-executor-compatibility-convergence/`.
- Read-only proof scripts and focused tests for existing owners; no new canonical store or retrieval authority.
- TensorRT-RTX documentation and compatibility evidence for CUDA 13.4 and Ampere SM86.
- Existing `:8090` llama-server wiring remains pinned until live `/health`, `/v1/models`, `/props`, model checksum, and API compatibility are verified.
