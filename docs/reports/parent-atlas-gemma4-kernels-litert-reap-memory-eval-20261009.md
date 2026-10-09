# Parent Atlas Gemma 4 WebGPU kernel / LiteRT / REAP / memory evaluation crosswalk

Status: **research + offline evaluation gates only**. Do not import upstream model code, weights, or licenses without independent inspection and review.

## Source inspected
- https://huggingface.co/spaces/webml-community/gemma-4-webgpu-kernels/tree/main — static Space by Xenova; code files `gemma-4-e2b.js`, `index.html`, `landing.js`. README links `google/gemma-4-E2B-it-qat-mobile-transformers`.
- https://huggingface.co/spaces/webml-community/gemma-4-webgpu-kernels/blob/main/index.html — claims Fable 5 authored/optimized WGSL kernels; tuned on Apple M4 Max, **not** proof on RTX 3060 Ti.
- https://www.cerebras.ai/blog/reap — REAP router-weighted expert activation pruning is for **MoE expert pruning**, not a generic dense Gemma E2B compression pass.
- https://research.google/blog/titans-miras-helping-ai-have-long-term-memory/ — Titans neural test-time memory; MIRAS framework. Neither is a drop-in KV cache compression method or an existing Gemma4 kernel.

## TODO (reuse current repository owners)
- [ ] **KERNEL-01** Pin the Space commit and audit `gemma-4-e2b.js` for WGSL kernels, tensor layout, decoder, loading and cache ownership; record license and third-party provenance. Do not copy wholesale.
- [ ] **KERNEL-02** Freeze three model+runtime+tokenizer/graph identities separately: Transformers.js ONNX, browser LiteRT-LM, Xenova/Fable QAT Mobile. Check each artifact and external tensors for complete hashes; missing weights -> typed unavailable.
- [ ] **KERNEL-03** Inspect browser support on Windows 10 Chrome+RTX3060Ti; WebGPU device limits are *not* free VRAM. Record adapter, device, browser version, driver and allocation errors.
- [ ] **KERNEL-04** Implement offline kernel metadata + shape fixture tests. Compare WGSL kernel outputs to deterministic CPU oracle first (matmul, quant/dequant, RMSNorm, rotary positions, attention/cache). Gate quantization-specific tolerances.
- [ ] **KERNEL-05** Before model loads, preserve the shared fixtures in `scripts/atlas/fixtures/gemma4-browser-paired-eval-v1.json`, same task inputs, prompt templates, stop tokens, max tokens and deterministic decoding; tokenizer IDs may be different.
- [ ] **KERNEL-06** Add independent receipts for all three engines: TTFT, prefill/decode tok/s, total latency, available memory estimates, browser responsiveness, exact revisions and output checksums. Do not make claims from upstream Apple benchmarks.
- [ ] **LITERT-01** Probe the existing :8070 LiteRT service separately from browser LiteRT-LM Web; a healthy Python server is not browser execution evidence.
- [ ] **MTP-01** Keep E2B-it-assistant as speculative drafter only. Require target compatibility, cache rollback and exact target acceptance parity; no browser MTP promotion without runtime proof.
- [ ] **REAP-01** Check dense-vs-MoE architecture *before* scheduling router-weighted expert pruning. REAP is inapplicable to a dense FFN without MoE experts. Benchmark accepted pruning challengers separately from original weights.
- [ ] **MEMORY-01** Treat Titans/MIRAS as **experimental memory-policy analogies** for ACE/BitFrost; any test-time model-weight updates are a separate neural architecture experiment, not an implicit Gemma 4 enhancement.
- [ ] **KAFKA-01** Send only bounded **server-validated** performance/evidence event descriptors through existing Kafka/outbox owners. Do not send raw browser GPU pointers, model weights, unredacted prompts, or self-asserted admission receipts.
- [ ] **ATLAS-01** Keep browser results candidate/diagnostic only until server verifies source spans, model evidence, authorized receipt and ContextManifest. PostgreSQL/Drizzle/pgvector identities remain server-owned.
- [ ] **GPU-01** Measure available device-global VRAM independently before starting a GPU comparison; running Ornith :8090 can occupy most RTX3060Ti memory. Never auto-start/stop models.
- [ ] **EVAL-01** Add negative fixtures: missing external weights, incomplete local model, unsupported shader feature, altered tokenizer, stale prompt/source revision, nonfinite output, mismatched EOS, cancellation, kernel mismatch, wrong receipt checksum.

## Current artifact status
- Existing `scripts/atlas/prove-gemma4-browser-paired-eval-preflight-v1.mjs` is **offline fixture only**.
- Existing `sveltekit-frontend/src/lib/ai/gemma4-browser-mtp-readiness-v1.ts` returns **runtimeEligible:false** until independent verification.
- No inference, LiteRT browser call, Kafka event, database write or GPU kernel proof was performed as part of this crosswalk.
