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

## 2026-10-08 follow-up owner audit / implementation receipt
- [x] P23-EDGE-01 partial: source owners located (Gemma4 ONNX session, admin test page, LiteRT startup and MTP launchers). Still need bundle/version/deployed artifact inventory.
- [x] P23-EDGE-02 partial: ONNX GPU test page now queries an actual WebGPU adapter and storage quota. These are only capability indicators, not a LiteRT-LM inference test.
- [ ] P23-EDGE-03 unproven: browser `.litertlm` text generation; don't substitute Python :8070.
- [ ] P23-EDGE-04 unproven: executor-specific tokenization and generation parity.
- [ ] P23-EDGE-05 unproven: cancel, unload, tabs and isolation.
- **Correction:** the launcher lives under `sveltekit-frontend/scripts/startup/dev-gpu-runtime.mjs`; root-path 404 was a location error. See owner-resolution follow-up below. The `gemma4-e2b-session.ts` currently reports historical speed estimates; no actual generated-token measurement surfaced during this review.
- **Source finding:** `sveltekit-frontend/src/routes/(app)/admin/onnx-gpu-test/+page.svelte` previously marked a model-load success with a speed claim; changed to NOT_MEASURED. The new explicit browser LiteRT and browser MTP tests SKIP/NOT_PROVEN rather than presenting successful inference.
- **Do not** delete legacy Gemma3 models, install weights, enable auto fallback, enable browser MTP or touch Ornith :8090 or EmbeddingGemma :8081 based on this UI-only progress.
- **Next minimum code gate:** add a browser-engine wrapper behind an explicit experimental selection, with exact pinned package version, web-compatible model manifest, verified tokenizer, abort/dispose, and a response validator that only admits measured generated tokens; expose new PASS receipt after browser execution is reproducible.

## 2026-10-08 owner-resolution follow-up (source-verified)
**Correction:** The live dev:gpu entry is `sveltekit-frontend/scripts/startup/dev-gpu-runtime.mjs`, not repository-root `scripts/startup/dev-gpu-runtime.mjs`. `sveltekit-frontend/package.json` binds `dev:gpu` to `node scripts/startup/dev-gpu-runtime.mjs`. The earlier root-path 404 is now RESOLVED; it was a path mistake, not a missing launcher.

**Important implementation gaps established by reading files:**
1. `sveltekit-frontend/src/lib/ai/onnx/gemma4-e2b-session.ts` only returns an ONNX InferenceSession; the function named `isGemma4E2BAvailable` actually attempts to load model weights. No generation/tokenization proof in that module; its published 120-255 tok/s figure is unaudited.
2. `sveltekit-frontend/src/lib/ai/onnx/session.ts` caches sessions by URL and buffers in memory, handles WebGPU to WASM fallback, and has `invalidateGPUDevice()`; the browser cannot assume resetting a GPU device clears every cached model/promise/buffer. Add explicit per-model dispose/abort/eviction tests before promotion.
3. `sveltekit-frontend/src/lib/ai/onnx/inference.ts` retains the Gemma3 270M ONNX inference path and tokenizer. It is an actual legacy owner, not safe for deletion based on a setup guide.
4. `sveltekit-frontend/scripts/ensure-dev-runtime.mjs` still checks Gemma3, EmbeddingGemma 300M and local asset paths, while documenting remote Gemma4 ONNX behavior. Investigate discrepancy with the local `/gemma4_e2b_onnx/model.onnx` session path.
5. `sveltekit-frontend/src/routes/(app)/admin/onnx-gpu-test/+page.svelte` is the real browser test route; existing tests load sessions but are not full autoregressive generation benchmarks.
6. `scripts/litert-serve.py` implements the **Python native** FastAPI :8070 LiteRT-LM engine; it is not the browser LiteRT-LM JS backend.
7. `scripts/launch-gemma4-mtp-canonical.ps1` targets **server** :8090 with model-specific atomic-mtp assets. Its existence doesn't establish browser MTP support, and launcher use must not replace Ornith default.
8. Current `dev-gpu-runtime.mjs` documents **Ollama :11434 as default embedding backend** with dedicated :8081 as opt-in. Previous statements that :8081 always runs on dev:gpu were incorrect: verify the runtime selector/actual health per configuration.

**Additional actionable gates**
- [ ] P23-EDGE-01A Record exact path, owner, revision and consumer for the eight files above in a machine-checkable manifest.
- [ ] P23-EDGE-01B Prove E2B local ONNX URL resolves, tokenizer exists and autoregressive decode works; a successful InferenceSession alone cannot PASS this.
- [ ] P23-EDGE-01C Implement explicit model asset lifecycle audit (session promises/buffers/GPU device after unload/device lost); fail closed on retained leaks.
- [ ] P23-EDGE-01D Reconcile `ensure-dev-runtime.mjs` with E2B session asset resolution and pin E2B vs Gemma3 fallback.
- [ ] P23-EDGE-01E Verify deployment mode/configured embedding owner (Ollama, dedicated :8081, or DirectML) and record actual base URL/provider.
- [ ] P23-EDGE-01F Read exact LiteRT-LM JS API against pinned package before implementing web adapter. Python `litert_lm.Engine` is not equivalent.
- [ ] P23-EDGE-01G Collect cold/warm generated-token timings and dedicated browser memory/use, *not* model-load timings.

## Phase 23 EDGE scaffold / focused tests (2026-10-08)
Files:
- `sveltekit-frontend/src/lib/ai/edge/phase23-edge-model-harness.ts`: backend-neutral typed identity, load/generate/cancel/dispose states and generation receipt. **Experimental; not imported by production routing.**
- `sveltekit-frontend/src/lib/ai/edge/phase23-edge-model-harness.spec.ts`: Vitest identity, ordering, empty output, load failure and cancellation tests.

Run from `sveltekit-frontend`:
```bash
npx vitest run src/lib/ai/edge/phase23-edge-model-harness.spec.ts
```

TODO before attaching to `dev:gpu`:
- [ ] EDGE-HARNESS-01 Test the above fixture locally/CI (tests were committed, not executed by GitHub connector).
- [ ] EDGE-HARNESS-02 Support safe abort/dispose races, in-flight GPU synchronization, retry and multiple concurrent calls. Existing scaffold is single request only.
- [ ] EDGE-HARNESS-03 Pin and inspect the real `@litert-lm/core` browser API and compatible E2B asset; implement real `EdgeEngine`.
- [ ] EDGE-HARNESS-04 Add tokenizer/model revision hashes, model input asset availability and integrity proof without eager huge downloads.
- [ ] EDGE-HARNESS-05 Add streaming token callbacks, usage token counts from actual runtime, cold/warm metrics and hardware/device receipt.
- [ ] EDGE-HARNESS-06 Validate JSON/citations and factual grounding against a fixed Eval Gym dataset; model-generated strings alone do not prove grounding.
- [ ] EDGE-HARNESS-07 Add isolated versioned IndexedDB cache with expiry, quota and privacy policy.
- [ ] EDGE-HARNESS-08 Connect through a feature-flagged UI experiment only after runtime-specific tests pass.
- [ ] EDGE-HARNESS-09 Preserve default Ornith :8090, optional native LiteRT :8070, and actual current embedding backend.
- [ ] EDGE-HARNESS-10 Record NOT_PROVEN for LiteRT-LM, browser MTP, EmbeddingGemma 2, and end-to-end RAG until live tests.
