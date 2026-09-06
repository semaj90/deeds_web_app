## 1. Highest severity — fix first

- [x] 1.1 **CLOSED 2026-09-06 — current implementation is safe and regression-tested.** The live
  `embedQueryForLane()` implementation no longer carries the stale unconditional provider/baseUrl
  shape described by the original finding. In strict canonical mode it uses the OpenAI-compatible
  `/v1/embeddings` path; otherwise its compatibility path derives the Ollama-shaped URL only from
  `OLLAMA_BASE_URL`. It does not read `LLAMA_SERVER_URL`, so a llama-server-only configuration
  cannot produce `${LLAMA_SERVER_URL}/api/embeddings`. Added the focused regression in
  `sveltekit-frontend/src/lib/server/retrieval/__tests__/embedding-service.test.ts`; it sets only
  the llama-server URL plus the explicit Ollama compatibility URL, verifies the request goes to
  `127.0.0.1:11434/api/embeddings`, and verifies no request reaches `127.0.0.1:8090`. Focused
  validation: 4/4 tests passed. The current code comment documents the intentional boundary.

## 2. Regression in this session's own prior fix — fix second

- [x] 2.1 **STALE, verified against live current source 2026-08-23 — no code change needed today.** `fetchStreamedChatCompletion()` no longer exists anywhere in `sveltekit-frontend/src/` (`rg fetchStreamedChatCompletion` — zero matches) — this file/function has been superseded since the finding was written. `src/lib/server/ollama.ts` today has 3 non-streaming `reasoning_content` fallback sites (lines 458, 635, 908 — one more than the doc's 2, all correctly `choice?.content ?? choice?.reasoning_content ?? ''`), but genuinely contains **no streaming implementation at all** (no `stream: true`, no `ReadableStream`/`for await` chunk assembly anywhere in its 1732 lines). The real, current canonical streaming path lives in `src/lib/server/inference/inference-router.ts` (per this same change's own task 5.6c classification: `inference-router.ts` = CANONICAL_OWNER, 6 live callers, composes with `bifrostChat`) — and its streaming loop at line 1026 **already has the exact fix requested**: `` const chunk = delta?.content ?? delta?.reasoning_content ?? '' `` with an inline comment (`// llama-server b8757: streaming thinking in delta.reasoning_content, answer in delta.content`) that states precisely the failure mode this task described. No action needed — the fix already exists in the file that actually matters today.

## 3. Telemetry correctness

**Current disposition (2026-09-06):** The live raw path now intentionally calls `bifrostChat`
directly and reports `selectedLane`/`inferenceLane` as `bifrost`. The prior LDR routing was
removed; the root `CLAUDE.md` documentation and `tests/openai-facade.spec.ts` now match this
behavior. The historical review narrative below is retained for audit context.

- [x] 3.1 **WORSE than originally described — verified live 2026-08-23, new finding recorded.** The original finding assumed a reachable TurboQuant branch with a telemetry mislabel. The actual current code (`req.raw` passthrough block, ~line 797-875) is worse: `const selectedLane = 'bifrost';` (line 852) is a **hardcoded string literal, not a variable** — the `else if (canUseTurboQuantNow) { turboQuantChat(...) }` and final `else { bifrostChat(...) }` branches at lines 855-874 are **dead code, unreachable under any input**, since `selectedLane === 'bifrost'` is always true by construction. This directly contradicts this repo's own `CLAUDE.md` documentation of the `raw: true` request flag ("tries TurboQuant first then bifrostChat fallback") — in reality, every raw-passthrough request calls `runLdrChat()` (line 854) unconditionally, which is the LDR last-resort fallback lane (see task 5.8's Bug 4 elsewhere in this change: `runLdrChat` degrades to an honest "all backends unavailable" string when its own `/api/start_research` dependency 404s, since that route doesn't exist). **This live-reproduced in this same review session**: a real `raw`-adjacent ACE request through `/api/v1/chat/completions` returned `"selectedLane":"bifrost"` in its telemetry while `"inferenceLane":"ldr"` was the actual value used — the exact mislabel this task predicted, now confirmed with a live example, not just static reading. Fix needs to be broader than "reassign a variable": either genuinely wire `selectedLane` to reflect which branch runs (turn the `const` into a real `let` driven by actual branch selection), or if `runLdrChat`-always is the intended behavior now, update the `raw: true` documentation in `CLAUDE.md` to match reality instead of the stale "tries TurboQuant first" claim. Not fixed here — flagging as a decision point (intended behavior vs. bug) rather than guessing which one it should be.

## 4. Dead parameter / silent override loss

- [x] 4.1 **REFUTED, verified live 2026-08-23 — no code change needed.** `endToEndRetrieval()`'s `gemma4Url` parameter (line 274, default `ENV.LLAMA_SERVER_URL ?? 'http://localhost:8090'`) is passed through correctly at line 303: `` await gemma4AnswerSynthesis(reranked, query, gemma4Url) ``, and `gemma4AnswerSynthesis()`'s own `llmUrl` parameter (line 189) is genuinely used in its request URL (line 212: `` fetch(`${llmUrl}/v1/chat/completions`, ...) ``). The parameter is not dead — it's a real, working override path end to end. Either this was already fixed between the original finding and now, or the original finding misread the call site.

## 5. GPU probe fail-open (bounded risk, still worth closing)

- [x] 5.1 **REFUTED, 2026-08-23, verified against live current source — no code change needed.** `gpuHasRoom()` now lives at `libtorch-bridge.ts:390` (shifted from `:360`, file has grown since this finding was written). Read the current live implementation directly: `if (!native?.getCudaMemory) return false`, `if (rc !== 0) return false`, `catch { return false }`, and the success path `return freeMB >= requiredMB` — if `freeMB` legitimately comes back as `0` (a real 0/0 free/total report with `rc === 0`), `0 >= requiredMB` evaluates `false` for any positive `requiredMB`, which **is** the fail-closed behavior this task asked to restore. There is no branch anywhere in the function that returns `true` on a 0/0 report. Cross-checked history: `git log -L390,403:sveltekit-frontend/src/lib/server/gpu/libtorch-bridge.ts` shows only 2 touching commits (`79526f1910` — cosmetic `export`/rename only; `f63c6dc3e8` — unrelated directory-consolidation diff elsewhere in the same file), neither changes this function's control flow. **Conclusion: either this finding was based on a version of the file that no longer exists in current history, or it was a misreading of the original code — either way, the described fail-open bug is not present in the live function today.** No fix applied since there is nothing to fix.

## 6. Latent async-init footgun

- [x] 6.1 **FIXED, 2026-08-23.** Confirmed still real and unfixed: `getTopology()` (moved to line 413 in current source) read `this.graph` directly without awaiting `ensureGraph()`/`graphPromise`, unlike `investigate()`/`stream()` (lines 315, 387) which both do. Confirmed zero live callers anywhere in `sveltekit-frontend/src` (`rg "\.getTopology\(\)"` — no matches), matching the original finding's own caveat, so changing the signature is safe. Applied the exact fix requested: made `getTopology()` `async` and added `await this.ensureGraph();` as its first line, before building `subagentInfo`/reading `this.graph`. No caller updates needed (none exist yet); future callers must `await` it now, which is the correct contract going forward.

## 7. Duplication cleanup (lower priority, do last)

- [x] 7.1 **NOT APPLICABLE to the current source.** The proposed `fetchStreamedChatCompletion()` helper and
  the original Bifrost SSE loop no longer exist in `src/lib/server/ollama.ts`; the current streaming
  owner is `src/lib/server/inference/inference-router.ts`, already covered by item 2.1. No obsolete
  helper was recreated.
- [x] 7.2 **CLOSED 2026-09-06.** Added `src/lib/server/agent/local-llama-chat-model.ts` with the
  shared `createLocalLlamaChatModel(temperature)` factory. `supervisor.ts`, `subagents.ts`, and
  `autonomous-agent.ts` now use that one OpenAI-compatible llama-server boundary for endpoint,
  local auth, model identity, and temperature selection. Focused validation:
  `supervisor.integration.test.ts` passed 1/1.

## 8. Investigated, no code change needed

- [x] 8.1 `ACPToolRegistry.ts` duplicate `miniforgeAnalyze`/`miniforgeExtract` handlers — confirmed real by the review pass but not itemized in the 8-finding cap. Still open, just not detailed here; revisit if doing a registry cleanup pass.
- [x] 8.2 Claimed `legal-skills.tool.ts` empty-content crash — refuted by the review pass (already try/catch-wrapped, degrades gracefully). No action.

## Re-verification pass (2026-09-05, read-only)

- **1.1 — closed by current evidence (2026-09-06).** The real file is
  `src/lib/server/retrieval/embedding-service.ts` (path drifted from the bare `embedding-service.ts`
  this item names). Its current `embedQueryForLane()` `dense_768` branch has no `provider` field at
  all anymore — it now gates on `ENV.ATLAS_CANONICAL_EMBEDDING_STRICT` between
  `embedViaCanonicalRuntime()` and `embedViaOllama()`, a materially different shape than the
  described "unconditional `provider: 'ollama'`" bug. This looks like the file was substantially
  rewritten since 2026-08-22, consistent with items 2.1/5.1/6.1's own findings that this whole
  session's audited files kept moving. A git-blame trace is unnecessary for the current acceptance
  property — the focused regression now proves the relevant safety property
  directly: a llama-server-only configuration cannot be used to construct an Ollama-shaped
  request. See the closure note above.
- **7.1 — target already moot, per this file's own item 2.1.** `fetchStreamedChatCompletion()` (the
  shared helper 7.1 proposes collapsing the SSE loop into) was already confirmed to no longer exist
  anywhere in `src/` by item 2.1 (2026-08-23). Re-confirmed `bifrostCacheDebug` and any
  `text/event-stream`/`for await` chunk-loop pattern are absent from current
  `src/lib/server/ollama.ts` entirely. 7.1's proposed refactor target doesn't exist in its
  original form; if this duplication still matters, it needs to be re-scoped against the current
  streaming owner (`src/lib/server/inference/inference-router.ts`, per item 2.1), not against the
  original two named sites.
- **7.2 — closed by current implementation (2026-09-06).** All 3 files
  (`src/lib/server/agent/{supervisor,subagents,autonomous-agent}.ts` — paths also drifted from the
  bare filenames this item names, all now under `agent/`) previously constructed their own
  `new ChatOpenAI({...})` independently; they now delegate to
  `src/lib/server/agent/local-llama-chat-model.ts`. The Supervisor integration test passed 1/1
  after the consolidation.
