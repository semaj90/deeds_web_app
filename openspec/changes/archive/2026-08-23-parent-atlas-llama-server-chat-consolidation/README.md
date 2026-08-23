# Parent Atlas — llama-server Chat Consolidation

**Status**: COMPLETE (2026-08-09) — all confirmed genuine raw-Ollama-chat call
sites converted; remaining `ollamaFetch(...)` sites verified already-safe via
a built-in intercept (see below); `supports_system_role` verified live TRUE.

## Problem

`sveltekit-frontend/CLAUDE.md` states a hard rule (added 2026-07-30, "Ollama vs
llama-server Boundary"): Ollama (`:11434`) is embeddings-only; all chat/synthesis
goes through `llama-server.exe` (`:8090`). That doc lists 20 files as needing the
sweep and is stale — this change tracks the actual audit + patch work end to end.

## Live server ground truth (confirmed 2026-08-09)

```
PID 33536: C:\Users\james\Desktop\llama-server-cuda\llama-server.exe
  -m C:\Users\james\Videos\deeds-web-app\models\hfor\hforf.gguf
  --host 127.0.0.1 --port 8090
  -ngl 99 -fa on -ctk q8_0 -ctv q8_0 -c 65536 -t 6 --parallel 1
  --reasoning off --reasoning-format deepseek --jinja
  --cache-prompt --cache-reuse 256 --metrics --perf
  --batch-size 512 --ubatch-size 128 --threads-batch 8
```

Key facts this corrects vs. prior doc assumptions:
- **Not the TurboQuant fork.** Binary is `llama-server-cuda\llama-server.exe`
  (stock CUDA build) — NOT `test1111…/llama-cpp-turboquant-gemma4`. KV cache is
  `-ctk q8_0 -ctv q8_0` (stock profile), not `turbo3`/`turbo4`.
- **Not `gemma4-rotorquant:latest`.** That string is an *Ollama* model tag used
  only for the embeddings lane on `:11434`. It is not loaded on `:8090` and is
  not what any llama-server request actually hits.
- **Model file is `hforf.gguf`**, an alias/copy of `gemma4-legal-iq4xs-direct.gguf`
  (confirmed via `/v1/models`: same 8.95B params, 4096 n_embd, 262144 n_ctx_train).
  `/v1/models` returns id `"hforf.gguf"`.
- **`--chat-template-file` is NOT passed, and it doesn't need to be.** Verified
  live: `supports_system_role` is `true` (now nested under
  `chat_template_caps.supports_system_role` — this llama-server build
  restructured `/props` since CLAUDE.md's doc was written, which listed it
  top-level). Confirmed end-to-end with the exact sanity curl from CLAUDE.md's
  "OpenCode + llama-server Config" section: `system: "Reply exactly:
  SYSTEM_OK"` → clean `content: "SYSTEM_OK"`, no template/reasoning leakage.
  The embedded GGUF template already handles system role correctly. Also
  confirmed `modalities: {vision:false, audio:false}` — no vision support on
  this instance, which is why VLM/image calls are deliberately left on Ollama
  (see below).
- **`model` field in requests is cosmetic.** llama-server ignores it and serves
  whatever GGUF is loaded; it only echoes the string back. No response-side
  model-id equality checks exist anywhere in the codebase (verified by grep),
  so any mismatched model string in a request body is harmless.

## The key architectural finding: `ollamaFetch()` already self-heals

`sveltekit-frontend/src/lib/server/ollama.ts` exports `ollamaFetch(url, init)`,
which is **not** a raw Ollama-only fetch. It contains a "TurboQuant Intercept"
(`ollama.ts` ~line 321-349, `tryTurboQuantIntercept`): any call to `/api/chat`
or `/api/generate` is transparently rewritten and routed through llama-server
`:8090` first, falling back to real Ollama only if llama-server is unhealthy.
TurboQuant/llama-server is confirmed healthy live, so **every file that calls
`ollamaFetch(...)` (rather than raw `fetch(...)`) was already correct at
runtime**, even though the source text still says `/api/chat` / `OLLAMA_URL`.

This means the actual violation surface is much narrower than a naive grep
suggests: only call sites using **raw `fetch()`** directly against an Ollama
URL — bypassing `ollamaFetch()` and its intercept entirely — are genuine
offenders. `assertDirectOllamaAllowed()` + `DIRECT_OLLAMA_ALLOWLIST` (same
file, ~line 140) is a separate, narrower allowlist gate for 3 specific callers
that have a documented reason to require real Ollama (tool-calling / JSON
schema reliability), unrelated to the general `ollamaFetch` safety net.

## Full sweep results (2026-08-09)

Went through every file matching Ollama-chat-shaped grep patterns across
`sveltekit-frontend/src` in 4 batches (~64 files) plus a final broad
re-verification pass that surfaced ~15 more files missed by the first regex
pass (different variable names: `getOllamaEndpoint()`, `base`,
`CONFIG.endpoints.ollama`, etc.). Final classification:

| Bucket | Count (approx) | Action |
|---|---|---|
| Own-repo `/api/...` route path text collisions (false positives) | ~15 | none |
| Already call `ollamaFetch()` — safe via intercept | ~50 | none |
| Ollama `/api/embeddings` calls (correctly embeddings-only) | ~10 | none |
| Ollama model-lifecycle (`keep_alive: 0` unload, `/api/tags` list) | 3 | none — legitimate, no llama-server equivalent |
| VLM/vision (`images` field, Ollama-native multimodal) | 2 | none — **deliberately left on Ollama**, live `:8090` has no `--mmproj` |
| **Genuine raw-fetch chat/generate offenders** | **21** | **fixed → `bifrostChat()` or SSE-streaming llama-server equivalent** |

### Files fixed (raw fetch → llama-server)

- `src/lib/server/services/couchdb-client.ts` (`aceLLM.summarize`)
- `src/lib/server/llm-router.ts` (`streamOllama` → `streamLlamaServer`, SSE)
- `src/mcp/server.ts` (2 sites: `inference:route` fallback, ACE `ask` tool)
- `src/lib/gpu/gemma4-decomposition-planner.ts` (`decomposeQueryWithOllama` — name kept, backend swapped)
- `src/routes/(app)/analysis-center/+page.server.ts`
- `src/routes/api/codeintel/clusters/[id]/+server.ts`
- `src/routes/api/codebase-index/karpathy-tag/backfill/+server.ts`
- `src/routes/api/codebase-index/karpathy-tag/+server.ts`
- `src/routes/api/ai/tensorrt/+server.ts`
- `src/routes/api/ai/tensorrt/stream/+server.ts` (SSE, llama-server OpenAI format)
- `src/routes/api/phase109/tag-chunks/+server.ts`
- `src/lib/server/services/knowledge-search/KnowledgeIndexer.ts`
- `src/lib/server/services/error-analysis/OllamaService.ts` (orphaned, fixed anyway)
- `src/lib/server/ollama-cached.ts` (`ollamaCachedChat` — L1-cache-bypass variant, now hits llama-server `/v1/chat/completions` directly)
- `src/lib/server/pgai/compare.ts`
- `src/lib/server/pgai/analysis.ts`
- `src/lib/server/workers/video-vlm-processor.ts` (`generateVLMSummary` text-only path only — vision path left on Ollama, see below)
- `src/lib/server/workers/audio-processor.ts` (`analyzeWithACE`)
- `src/lib/server/services/knowledge-search/KnowledgeSearcher.ts` (`callOllama`)
- `src/lib/server/services/knowledge-search/ACPToolRegistry.ts` (`llmGenerate`)
- `src/lib/server/llm/ollamaClient.ts` (orphaned, fixed anyway — distinct file from `llm/ollama-client.ts`)
- `src/lib/server/langextract/google-langextract.ts` (`extractKeywordsLegacy`, orphaned, fixed anyway)
- `src/lib/server/research/web-research-ingester.ts` (`tagChunkAsync`)

Also earlier this session: `src/lib/server/adapters/service-integrations.ts`,
`src/lib/server/ai/auto-fix.ts`, `src/lib/server/retrieval/orchestrator.ts`,
`src/routes/api/ai/chat-direct/+server.ts` — confirmed clean (re-verified, no
raw offending pattern remains).

### Deliberately left on Ollama (not bugs — real exceptions)

1. **VLM/vision multimodal calls** (`images: [base64]` field, Ollama-native
   format): `src/lib/ai/emotion-context.ts` (`analyzeWebcamFrame`, also
   orphaned — zero callers) and `src/lib/server/workers/video-vlm-processor.ts`
   (`analyzeFrameWithGemma4`). The live `:8090` launch command has no
   `--mmproj` flag — CLAUDE.md documents VLM mode as a separate launch
   profile. Converting these to `bifrostChat` would silently drop the image
   input. Left on Ollama with an in-code comment explaining why.
2. **Ollama model-lifecycle management** (`keep_alive: 0` to unload a model,
   `/api/tags` to list loaded models): `src/lib/server/inference/gpu-arbiter.ts`
   (`unloadOllamaModels`), `src/lib/server/inference/vlm-lifecycle.ts`
   (`unloadOllamaModel`). llama-server has no equivalent HTTP API for this —
   it only ever serves the one GGUF it was launched with. This is legitimate
   Ollama-specific model management, not a chat/synthesis call.
3. **`ollamaFetch()`-wrapped calls** (~50 files) — not exceptions exactly, just
   already correct at runtime via the TurboQuant intercept described above.
   No source change needed, though the `/api/chat`/`/api/generate` literal
   strings in those files are slightly misleading to read cold.

## Next steps

None. Everything load-bearing plus the optional naming cleanup is done:
`decomposeQueryWithOllama` → `decomposeQueryFallback`, `ollamaCachedChat` →
`llamaServerCachedChat`, and `llm-router.ts`'s `provider` union
(`'ollama' | 'tensorrt'` → `'llama-server' | 'tensorrt'`, including both
external callers). Verified with `npx tsgo --noEmit` — zero new errors.

## Cross-references

- Root `CLAUDE.md` §"Ollama vs llama-server Boundary" (stale 20-file list,
  superseded by this doc's real findings)
- Root `CLAUDE.md` §"OpenCode + llama-server Config" (chat-template-file
  requirement, `supports_system_role` check)
- Root `CLAUDE.md` §"Gemma4 LLM Call Rules" (canonical SSE streaming pattern
  this change's `streamLlamaServer` / `tensorrt/stream` fix follows)
- `sveltekit-frontend/src/lib/server/ollama.ts` — canonical `bifrostChat()` /
  `turboQuantChat()` wrapper + the `ollamaFetch()` TurboQuant intercept
