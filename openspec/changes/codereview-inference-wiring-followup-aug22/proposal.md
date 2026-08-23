## Why

A `/code-review` background pass (2026-08-22, ~1251s, 16 tool uses, forked from this session's context) audited the working tree's diff for inference-wiring correctness — a follow-up sweep after this session's own `inference-wiring-deep-audit-aug22` bug-fix pass. It found 8 confirmed findings (a 9th duplicate-handler finding was cut for the report cap; a claimed `legal-skills.tool.ts` crash was investigated and refuted — its `JSON.parse` calls are already try/catch-wrapped with graceful `isError` degradation, not a crash). Recording here, unfixed, so findings survive compaction.

## What Changes (record-only — nothing fixed yet)

**8 findings, as reported by the review agent (severity order per the agent's own ranking):**

1. **`sveltekit-frontend/src/lib/server/retrieval/embedding-service.ts:221`** — the `dense_768` embedding lane defaults `provider` to `'ollama'` while defaulting `baseUrl` to `LLAMA_SERVER_URL`. With `EMBEDDING_BASE_URL`/`EMBEDDING_PROVIDER` unset but `LLAMA_SERVER_URL` set (a normal always-on production config per root CLAUDE.md's Ollama-vs-llama-server boundary rule), `embedQueryForLane` builds Ollama-shaped endpoint paths (`/api/embed`, `/api/embeddings`) against llama-server's chat-only `:8090`, which rejects them (501, embeddings disabled). Every `dense_768` embed call would throw "Canonical semantic_768 embedding backend returned no vector."
2. **`sveltekit-frontend/src/lib/server/ollama.ts:969`** — the new streaming SSE assembler `fetchStreamedChatCompletion()` (added by this session's own `inference-wiring-deep-audit-aug22` fix) only accumulates `delta.content`, dropping the `reasoning_content` fallback that two non-streaming paths in the same file (~458, ~635) explicitly apply for Gemma4. If the launcher's reasoning-format config drifts (the file's own comments note it silently falls back rather than throwing on mismatch — see root CLAUDE.md's `TURBO_PROFILE` fallback semantics), streaming callers would silently get empty-string content with no error.
3. **`sveltekit-frontend/src/lib/server/ai/openai-facade.ts:836`** — `rawInferenceLane` is hardcoded to the literal `'bifrost'` and never reassigned, even though the branch below can route through `turboQuantChat()`. Telemetry/analytics that trust `selectedLane`/`inferenceLane` would misattribute TurboQuant-served requests as Bifrost.
4. **`sveltekit-frontend/src/lib/server/retrieval/go-retrieval-coordinator.ts:263`** — `endToEndRetrieval()` accepts and defaults a `gemma4Url` parameter that is never forwarded; `gemma4AnswerSynthesis()` always resolves its endpoint internally. Any caller overriding `gemma4Url` (test harness, staging pointer) has the override silently ignored.
5. **`packages/parent-atlas-retrieval/src/gpu/libtorch-bridge.ts:360`** — `gpuHasRoom()` now returns `true` when the CUDA memory probe reports both free and total VRAM as `0`, instead of failing closed as before. Bounded risk today (only caller `topology-projection.ts` wraps downstream calls in try/catch with CPU fallback), but that fallback assumes a throw, not a segfault — unverified.
6. **`sveltekit-frontend/src/lib/server/agent/supervisor.ts:431`** — `getTopology()` reads `this.subagents`/`this.graph` synchronously without awaiting the async init chain (`graphPromise`/`ensureGraph()`), unlike `investigate()`/`stream()` which do. Currently latent — no live caller found that invokes it before init resolves — but a footgun for future callers.
7. **`sveltekit-frontend/src/lib/server/ollama.ts:1417`** — the Bifrost-gateway branch of `bifrostChat()` reimplements a near-identical ~40-line SSE-assembly loop to the shared `fetchStreamedChatCompletion()` helper already used elsewhere in the same file (a third near-identical parser, per this session's own earlier duplication findings pattern). Only real divergence is capturing `bifrostCacheDebug`, addable to the shared helper as an optional callback.
8. **`sveltekit-frontend/src/lib/server/agent/supervisor.ts:115`** — `supervisor.ts`, `subagents.ts`, and `autonomous-agent.ts` each define a near-identical `initializeXxxLlm()` method (matches the exact `ChatOpenAI`/`getLlamaSessionDescriptor()` pattern documented as canonical in this project's `sveltekit-frontend/CLAUDE.md` "LangChain agents" section) — a shared `createLocalLlamaChatModel(temperature)` helper would collapse this to one call site each; as-is, any auth/provider config change must be copy-pasted into three files.

**Investigated and resolved without a code change:**
- A 9th candidate (duplicate `miniforgeAnalyze`/`miniforgeExtract` handlers in `ACPToolRegistry.ts`) was confirmed real but cut for the 8-item report cap — correctness findings ranked higher. Still real, just not itemized above.
- A claimed `legal-skills.tool.ts` empty-content crash was investigated and **refuted** — its `JSON.parse` calls are already try/catch-wrapped, degrading to an `isError` response rather than crashing. No action needed.

## Non-Goals

- This proposal does not fix any of the 8 findings. Zero code changed.
- Does not re-verify the review agent's findings independently (the agent's own report already includes a verification pass per its own findings ranking — see `outcome`/`verdict` semantics in the code-review skill).

## Impact

- **Code affected** (not yet changed): the 8 files/lines listed above.
- **Cross-reference**: finding #2 directly touches code this session's own `inference-wiring-deep-audit-aug22` change introduced (`fetchStreamedChatCompletion()`) — a regression risk in this session's own prior fix, not pre-existing debt. Should be prioritized accordingly.
- **Downstream risk if left unresolved**: finding #1 (embedding-service provider/baseUrl mismatch) is the most severe — a hard functional break on the `dense_768` lane under a normal production env-var configuration, not an edge case.
