# Phase 23+ — Client Gemma 4 / LiteRT-LM / EmbeddingGemma 2 evaluation crosswalk

Status: **planning and evidence gates only** (2026-10-08). Do not claim browser model tested, do not replace the :8090 Ornith runtime, and do not delete Gemma3 270M.

## Research comparison: meeting-summarizer
Upstream: https://github.com/vieenrose/meeting-summarizer
Model release described by operator: Gemma 4 E2B meeting-agent zh-TW (v3, v5, v8, v11, mobile-v1). Validate release checksums, license and upstream git revision before downloading/deriving anything.

Professional pipeline lessons to reproduce:
1. Version dataset splits and provenance (IVOD/AliMeeting, zh-TW meeting examples); prevent cross-meeting train/eval leakage.
2. Freeze task protocol, exact system prompt, citations, structured classes (DECISION/ACTION/PROPOSAL/OPEN_ISSUE/FIGURE) and deterministic parser.
3. Create a base/QAT/LoRA/SFT/DPO and distilled-mobile ablation table. Document actual training recipe, teacher distributions, gold labels, adapter revision, merges and quantization re-projection.
4. Compare across tasks: transcript-window notes, notes-to-summary, notes-to-title; report coverage, contradiction, citation precision, abstention, hallucination.
5. Compare native LiteRT-LM against forked fused-attention and GGUF, including fresh sessions, prefill/decode, cold/warm RSS, kv/context constraints and exact token parity under deterministic decoding.
6. Hardware-specific acceptance: observed phone CPU results don't transfer to browser WebGPU, CUDA RTX3060Ti, or laptop. Report device, runtime, model hash and backend separately.
7. Distilled/modified model is not guaranteed to load in stock Web LiteRT-LM. Browser-compatible .litertlm artifact must be verified; Android/phone .litertlm is not sufficient.

## Repository owner census (read before implementation)
- `LITERT-DEV-GPU-USAGE.md`: `DEV_GPU_LLM_BACKEND=llama-server` :8090 default; `litert` Python server :8070 optional.
- `scripts/startup/litert-dev-startup.mjs`: launches Python LiteRT backend and opens external LiteRT.js-Mocap workspace; **not** browser text LLM proof; `DEV_GPU_ENABLE_MTP=false`.
- `GEMMA4-E2B-SETUP-GUIDE.md`: ONNX E2B experiment, old Gemma3 270M fallback and provisional performance claims; requires audit before use.
- `scripts/launch-gemma4-mtp-benchmark.ps1` and `scripts/launch-gemma4-mtp-canonical.ps1`: existing **server** MTP launchers. Do not infer browser LiteRT MTP support.
- `docs/experiments/phase23-reap-cerebras-quantization.md`: REAP, streaming and quantization research; independent from browser generation.
- `scripts/experiments/phase23_tensor_map_audit.py`: GGUF tensor map audit, not evaluation of LiteRT graph.

## Runtime boundaries
- **LiteRT.js** `@litertjs/core`: general `.tflite` WebGPU/WASM execution; use the official model-tester for op compatibility.
- **LiteRT-LM Web** `@litert-lm/core`: LLM `.litertlm` browser engine; supported model/asset list is limited and version-specific. Canonical reference: https://developers.google.com/edge/litert-lm/js ; implementation: https://github.com/google-ai-edge/LiteRT-LM/tree/main/js
- **LiteRT-LM Python/native backend** :8070: separate server execution.
- **llama.cpp** :8090: keep Ornith as canonical server path. MTP on Gemma 4 or Ornith requires measured draft/verify support for *that specific model and runtime*. Do not label a flag as proof.
- Browser SLM and server inference share structured task/evidence schema, **not** KV cache or tensor handles.

## Later gates: browser assistant (keep Phase 23 owner, no conflicting phase renumbering)
- [ ] P23-EDGE-01 Inventory real existing Gemma3 270M and Gemma4 E2B client modules, bundle/script owners, route, artifact manifests, tests; tag ACTIVE / LEGACY / ORPHAN / DOC-ONLY.
- [ ] P23-EDGE-02 Probe browser WebGPU, storage estimate, WASM CPU fallback and runtime capability; no auto-download until user action/consent.
- [ ] P23-EDGE-03 Pin `@litert-lm/core` API/version, test official E2B **web-compatible** .litertlm with true browser execution and WebGPU; record model digest, import and tokenizer.
- [ ] P23-EDGE-04 Separate ONNX, LiteRT-LM and LiteRT.js .tflite executors; same fixtures, separate asset/runtime caches and result labels.
- [ ] P23-EDGE-05 Verify streamed token output, cancel, unload, retry, tab lifecycle, concurrent requests, fresh context per task, no cross-user state.
- [ ] P23-EDGE-06 Introduce typed client tasks: pattern_extract, query_classify, quick_qa, rag_evidence_extract, kag_entity_link, dag_candidate_rank, hits_candidate_hint. Grounded outputs contain evidence IDs; never assert server canonical rank from client heuristics.
- [ ] P23-EDGE-07 Client-side IndexedDB versioned cache: model_id/revision + tokenizer_hash + task_schema + prompt_revision + source_revision + result_digest; cache only authorized non-sensitive data, quotas/eviction, TTL and consent/clear.
- [ ] P23-EDGE-08 Compare legacy Gemma3 270M vs Gemma4 E2B vs no-SLM baseline on same task fixtures; do not remove legacy until proven replacement.
- [ ] P23-EDGE-09 Eval Gym deterministic fixtures for code AST symbols, NLP grounding, legal citations, hallucination/abstain, parser JSON, Unicode zh-TW/English, and poisoned/stale source.
- [ ] P23-EDGE-10 Compare server :8090 Ornith answers and downstream retrieval/RRF/KAG/DAG/HITS outcomes, log route chosen and canonical evidence.
- [ ] P23-EDGE-11 Measure cold/warm startup, browser memory & GPU usage, first token, prefill/decode tok/s, energy/thermal proxy, browser frame responsiveness and mobile/desktop failure rates.
- [ ] P23-EDGE-12 Hard gates: no synthetic citations, no silent incorrect model fallback, server-only actions uncallable from client, prompt injection tests, isolation.
- [ ] P23-EDGE-13 Separate speculative decoding experiment: inspect MTP tensor/graph/backend capability, verify acceptance and target parity; no default MTP for LiteRT-LM browser.
- [ ] P23-EDGE-14 Create revision-bound JSON receipts `NOT_PROVEN|FAIL|PASS` including model, runtime, dataset, prompts, environment, metrics, code revision.
- [ ] P23-EDGE-15 Integrate experimental test panel into `npm run dev:gpu` without changing :8090 default or :8081 embedding service.

## EmbeddingGemma 2 / Sakura isolated challenger
- [ ] P23-EMB2-01 Verify release, tokenizer, embedding dimension(s), pooling, normalization, prompt prefixes and licensing; don't assume EmbeddingGemma 2 = existing embeddinggemma-300m at :8081.
- [ ] P23-EMB2-02 Verify LiteRT-LM `EmbeddingEngine` browser compatibility on exact asset/runtime; otherwise keep embeddings server-side.
- [ ] P23-EMB2-03 Use frozen labeled query→passage/doc chunks across code, legal, zh-TW & English; measure Recall@K, MRR@10, nDCG@10, overlap, p95 latency and memory.
- [ ] P23-EMB2-04 Create isolated versioned Qdrant collection/index for each embedding identity. 768 dimensions alone are not compatibility.
- [ ] P23-EMB2-05 Compare teacher EmbeddingGemma2, current :8081 baseline, client candidates, and Sakura distillation separately.
- [ ] P23-EMB2-06 Evaluate ANN index/retriever → RRF → reranker → ContextManifest → answer (grounded citation fidelity); observe source/representation revision lineage.
- [ ] P23-EMB2-07 Promotion only after end-to-end quality parity and rollback, no implicit dual writes or collection renaming.

## Gate order
1. Owner census, pinned manifests, **no network/weight download in default startup**.
2. Browser device and official E2B runtime smoke, repeated cold/warm tests.
3. Contract outputs and Eval Gym fixtures; dual model A/B test.
4. Isolated EmbeddingGemma2 index and retrieval eval.
5. Optional browser MTP/quantized fine-tune challengers.
6. Revisions, receipts, owner promotion; leave default unchanged until evidenced.

## Official references
- https://developers.google.com/edge/litert-lm/js
- https://github.com/google-ai-edge/LiteRT-LM/tree/main/js
- https://github.com/google-ai-edge/litert/tree/main/litert/js
- https://github.com/vieenrose/meeting-summarizer
