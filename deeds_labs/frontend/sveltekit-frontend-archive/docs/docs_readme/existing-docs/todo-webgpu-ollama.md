# WebGPU & Ollama Integration TODOs

## 1. Ship WebGPU Reranker
- [ ] Add `src/lib/client/ai/webgpu-reranker-worker.ts` (GPU cosine WGSL) and `webgpu-reranker.ts`.
- [ ] Wire `webgpuRerank` into the stream suggestion store (`streamSuggestions` completion handler).
- [ ] Log fallback events (`error` field from worker) to decide if we need a more robust WGSL/wasm embedding.

## 2. Remove Hard-Coded Ollama URLs
- [ ] Search `src/lib/server`, `src/lib/services`, `src/routes/api` for `http://localhost:11434`.
- [ ] Replace each with `getOllamaEndpoint()` or `OLLAMA_CONFIG.baseUrl`.
- [ ] Delete stale `.bak` / `.disabled` files once replacements land.
- [ ] Lint check (new ESLint rule) to confirm no literals remain.

## 3. Backend Registry for Future Inference Engines
- [ ] Extend `src/lib/services/providers/ollama/config.ts` with `registerBackend()` / `getBackend()` helpers.
- [ ] Add TODO comment enumerating planned Triton/TensorRT-LLM/PyTorch endpoints.
- [ ] Update services to request a backend by name when non-Ollama inference is desired.

## 4. TypeScript / Svelte Diagnostics Cleanup
- [ ] Remove the stray `svelte.config.js/` directory (keep file only).
- [ ] Run `NODE_OPTIONS="--max-old-space-size=8192" npx svelte-check --workspace sveltekit-frontend --output-file svelte-check.log`.
- [ ] Fix known syntax issues (incorrect `onTransaction` handler, missing commas/colons).
- [ ] Parse first 100 log entries to build a type-error punch list.
- [ ] Run `npx tsc --noEmit --skipLibCheck | tee ts-audit.log` and triage remaining errors.

## 5. CI Guardrails
- [x] ESLint `no-restricted-syntax` rule blocking `http://localhost:11434`.
- [ ] Add CI step invoking ESLint to enforce the rule.
- [ ] Optional: add a tiny unit/integration test instantiating `getOllamaEndpoint('generate')` to verify env overrides.

## 6. Optional Enhancements
- [ ] Investigate SSE + QUIC hybrid transport to improve rerank responsiveness.
- [ ] Consider upgrading the WebGPU fallback to load a small on-device embedding (WGSL or wasm SIMD).
