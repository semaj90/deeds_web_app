## 1. Highest severity — fix first

- [ ] 1.1 `embedding-service.ts:221` — fix the `dense_768` lane's provider/baseUrl default mismatch. Either default `provider` based on which URL env var is actually set (not unconditionally `'ollama'`), or require `EMBEDDING_PROVIDER` to be explicit when `LLAMA_SERVER_URL` is the only URL present. Add a test asserting the dense_768 lane never builds an Ollama-shaped path against a llama-server baseUrl.

## 2. Regression in this session's own prior fix — fix second

- [ ] 2.1 `ollama.ts:969` — add the same `reasoning_content` fallback to `fetchStreamedChatCompletion()` that the two non-streaming paths (~458, ~635) already have, so a launcher reasoning-format drift degrades the same way in both streaming and non-streaming paths instead of silently producing empty content only when streaming.

## 3. Telemetry correctness

- [ ] 3.1 `openai-facade.ts:836` — reassign `rawInferenceLane` when the TurboQuant branch is actually taken, so `selectedLane`/`inferenceLane` telemetry reflects the real serving backend.

## 4. Dead parameter / silent override loss

- [ ] 4.1 `go-retrieval-coordinator.ts:263` — either wire `gemma4Url` through to `gemma4AnswerSynthesis()`, or remove the parameter and document that the endpoint is always resolved internally (don't leave a parameter that looks configurable but isn't).

## 5. GPU probe fail-open (bounded risk, still worth closing)

- [ ] 5.1 `libtorch-bridge.ts:360` — revert `gpuHasRoom()` to fail closed (return `false`) when both free and total VRAM report `0`, unless there's a confirmed legitimate 0/0-with-success case this was changed to accommodate — check the commit that introduced this change for its own stated reason first.

## 6. Latent async-init footgun

- [ ] 6.1 `supervisor.ts:431` — make `getTopology()` await the same init chain (`graphPromise`/`ensureGraph()`) that `investigate()`/`stream()` already await, for consistency even though no live caller currently hits the gap.

## 7. Duplication cleanup (lower priority, do last)

- [ ] 7.1 `ollama.ts:1417` — collapse the Bifrost-gateway branch's hand-rolled SSE loop into `fetchStreamedChatCompletion()`, adding `bifrostCacheDebug` capture as an optional callback/field on the shared helper.
- [ ] 7.2 `supervisor.ts:115` + `subagents.ts` + `autonomous-agent.ts` — extract the shared `initializeXxxLlm()` pattern into one `createLocalLlamaChatModel(temperature)` helper, per `sveltekit-frontend/CLAUDE.md`'s own documented canonical `ChatOpenAI`/`getLlamaSessionDescriptor()` pattern.

## 8. Investigated, no code change needed

- [x] 8.1 `ACPToolRegistry.ts` duplicate `miniforgeAnalyze`/`miniforgeExtract` handlers — confirmed real by the review pass but not itemized in the 8-finding cap. Still open, just not detailed here; revisit if doing a registry cleanup pass.
- [x] 8.2 Claimed `legal-skills.tool.ts` empty-content crash — refuted by the review pass (already try/catch-wrapped, degrades gracefully). No action.
