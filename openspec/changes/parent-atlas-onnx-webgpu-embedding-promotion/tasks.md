# Tasks: parent-atlas-onnx-webgpu-embedding-promotion

## Context

A prior session in this project reordered `embedding-client.ts`'s 5-tier fallback chain to try
ONNX-local first (was Tier 5/last-resort), per an explicit "ONNX primary, Ollama fallback"
instruction — but did this **before** running the standalone WebGPU proof script
(`services/embedding-onnx-webgpu/prove-embeddinggemma-onnx-readonly.mjs`) or checking the model's
actual token-capacity export. The code reorder is real; it should not be treated as a promotion
decision. This change freezes the corrected validation order before any further promotion happens.

## Corrected order (operator-specified, supersedes ad-hoc handoff notes)

- [ ] **1. Reload permissions.** `.claude/settings.local.json` env-read allow rules are JSON-valid
      (`jq -e` passed) but need `/hooks` or a session restart to take effect — not yet done.
- [ ] **2. Inspect real env routing.** Once readable: `EMBEDDING_BACKEND`, `DEV_GPU_EMBED_SERVER`,
      the ONNX model path var, `ORT_NODE_PACKAGE_DIR` (or equivalent) — confirm what
      `npm run dev:gpu` will actually select, don't assume.
- [ ] **3. Inspect `onnx-embed.ts` before starting the app.** Verify: `isOnnxEmbedAvailable()`
      checks real runtime/provider readiness (not just file existence);
      `batchEmbedOnnx()` uses the shared `EmbeddingContextPlanV1`/`semantic_768` validator;
      it reports the actual executor/provider used; it does not silently treat a WebGPU failure
      that fell back to WASM as a WebGPU success.
- [ ] **4. Harden the standalone proof to fail closed.** Current
      `prove-embeddinggemma-onnx-readonly.mjs` tries WebGPU, silently falls back to WASM on
      failure. Add a fail-closed variant: `requestedProvider: 'webgpu'`, `fallbackAllowed: false`,
      and check ORT package version, actual provider used, model checksum, tokenizer checksum,
      rendered-input checksum, token-tensor checksum, output dims == 768, all-finite, valid L2
      norm. Keep the existing fallback-tolerant script as a separate availability smoke test.
- [ ] **5. Resolve the 512 vs 2048 token-capacity export gate before claiming parity.**
      EmbeddingGemma's model card states 2048-token capacity; the local ONNX export's
      `model_info.json` reports `max_sequence_length: 512`. Inspect the selected model's real
      input metadata (`sequence` dim: dynamic-up-to-2048, or fixed-512). Prove: 512 tokens PASS,
      628 tokens PASS (a previously-identified failing case), 1024 PASS, 2048 PASS, 2049 rejected
      pre-inference. **Do not promote the 304MB QInt8 export merely because a short probe
      succeeds** if it's still the fixed-512 artifact.
- [ ] **6. Run the standalone WebGPU proof independently of SvelteKit**, fail-closed mode:
      `node services/embedding-onnx-webgpu/prove-embeddinggemma-onnx-readonly.mjs`. Acceptance:
      WebGPU-only load PASS, tokenization PASS, dims==768 PASS, all-finite PASS, normalization
      PASS, same-input-3x-repeatable PASS, writes==0.
- [ ] **7. ONNX CPU vs ONNX WebGPU parity** — identical model/tokenizer/input_ids/attention_mask/
      pooling contract, only the execution provider changes. Should be tight; establishes the
      execution-provider swap is safe before touching the representation-equivalence question.
- [ ] **8. Ollama vs ONNX-WebGPU 15-row parity gate.** Frozen candidate set, per-row: cosine
      min/mean/max, absolute delta, 15×15 pairwise geometry delta, query→candidate score rank,
      Top-5/Top-10 overlap, Spearman correlation. Ollama stays canonical `semantic_768` owner;
      ONNX-WebGPU is shadow challenger until this passes.
- [ ] **9. Only then restart `npm run dev:gpu`.** Make one real embed request, inspect the
      `attempts` array/response for evidence — strengthen the receipt to require
      `source: 'onnx-local'`, `provider: 'webgpu'`, `fallbackUsed: false`,
      `representationId: 'semantic_768'`, `executorRevision`. The Tier-0 code reorder alone is
      not evidence WebGPU handled the request.
- [ ] **10. Scale 15 → 128 → 768 row parity benchmark** before any eligibility/primary-lane
      change.
- [ ] **11. Promotion ladder (do not skip stages):**
      `UNTIL PARITY`: `semantic_768` owner = Ollama, `onnx_webgpu` = shadow challenger (no
      traffic). `AFTER 15-ROW PARITY`: `onnx_webgpu` = preferred canary, Ollama = fallback.
      `AFTER 128/768 PARITY + restart proof`: `onnx_webgpu` eligible as primary, Ollama fallback.
      **Do not deprecate Ollama in the same tranche as any of the above steps.**

## Explicitly deferred / out of scope for this change

- Refreshing the stale `codebase-graph.json` (currently 11,500+ min old per repo tooling) is
  **unrelated** to proving WebGPU embedding execution — do not couple them. Refresh Graphify only
  when resuming AST/graph/MCP-fanout/ACE-graph-evidence work, and bind that run to its own
  revision receipt.
- MCP/BitFrost/ACE query-synthesis optimization audit (queued as its own follow-up in
  `parent-atlas-ace-bitfrost-cache-correctness`) — happens *after* embedding promotion is settled,
  not concurrently.

## Status

Step 1 (settings edited, not yet reloaded) is the only step attempted so far. Steps 2-11 not
started. The Tier-0 reorder in `embedding-client.ts` remains in place as code but is **not**
validated — treat it as an unvalidated change, not a completed promotion.

## Future browser cache integration: IndexedDB + WebGPU Transformers.js

- [ ] **12. Define `ClientInferenceCacheEntryV1`** for browser-only chat and
      bounded preview inference results. Include model, representation,
      tokenizer, input checksum, schema version, expiry, and
      `canonicalAuthority: false`.
- [ ] **13. Add a typed IndexedDB adapter** for client chat transcripts, model
      load metadata, tokenizer metadata, and bounded inference hints. Use the
      existing `idb` dependency or Dexie; do not move canonical chats, source
      identity, embeddings, receipts, or hidden reasoning into browser storage.
- [ ] **14. Keep in-memory acceleration optional**. LokiJS/`Map` may serve as an
      L0 session cache; IndexedDB is the persistent browser cache. Cache misses,
      expiry, quota errors, and schema upgrades must fall back safely.
- [ ] **15. Cache model artifacts only through the Transformers.js/runtime
      cache contract**. Store local metadata and checksums; browser cache state
      is not model-promotion evidence.
- [ ] **16. Add client replay tests** for cache hit/miss, revision mismatch,
      expiry, reload persistence, deterministic input checksums, WebGPU
      unavailable fallback labeling, and explicit `fallbackUsed` reporting.
- [ ] **17. Promotion boundary**: browser WebGPU remains a challenger/preview
      lane. It cannot write canonical vectors, alter CandidateOrdinal, promote
      ontology tuples, or replace server retrieval/chat truth.
