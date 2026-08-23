# Tasks — llama-server Chat Consolidation

## Done (2026-08-09) — sweep complete

- [x] Confirm live `:8090` process config via `Get-CimInstance Win32_Process`
      (binary path, flags, model file) — see README.md "Live server ground truth"
- [x] Discover `ollamaFetch()`'s TurboQuant intercept (`ollama.ts` ~line 321-349)
      — narrows the true violation surface to raw-`fetch()`-only call sites
- [x] Batch 1-4 audit of `candidate-list-raw-grep.txt` (64 files) — see README.md
      full results table
- [x] Final broad re-verification pass (caught ~15 more files the first regex
      missed: `getOllamaEndpoint()`, `base`, `CONFIG.endpoints.ollama` variable
      name variants)
- [x] Fixed 21 genuine raw-fetch chat/generate offenders (full list in README.md)
- [x] Identified and left alone 3 categories of legitimate non-offenders:
      VLM/vision multimodal (2 files), Ollama model-lifecycle management
      (2 files), `ollamaFetch()`-wrapped calls (~50 files, already safe)
- [x] Re-verified `service-integrations.ts`, `auto-fix.ts`,
      `retrieval/orchestrator.ts`, `api/ai/chat-direct/+server.ts` — clean,
      no raw offending pattern

## Remaining (not urgent, low-risk cleanup)

- [x] Verify `supports_system_role` live on `:8090` via `/props` (2026-08-09):
      **TRUE**. Field moved location in this llama-server build — it now lives
      at `chat_template_caps.supports_system_role`, not top-level (CLAUDE.md's
      "OpenCode + llama-server Config" section documents the older top-level
      shape and is stale on this point). Confirmed end-to-end with the exact
      sanity curl from that section (`system: "Reply exactly: SYSTEM_OK"` →
      response `content: "SYSTEM_OK"`, clean, no template/reasoning leakage).
      **No launcher fix needed** — the embedded GGUF template already handles
      system role correctly despite `--chat-template-file` not being passed.
      Also confirmed via `modalities: {vision:false, audio:false}` that this
      llama-server instance has no vision support live, validating the
      decision (README.md) to leave VLM/image calls on Ollama.
- [x] Ran `npx tsgo --noEmit` repo-wide (2026-08-09): 36 pre-existing errors,
      **zero** in any of the 21 files touched this session (verified by
      grepping the error log against the touched-file list)
- [x] Naming cleanup (2026-08-09, done at user request despite being optional):
      - `decomposeQueryWithOllama` → `decomposeQueryFallback`
        (`gemma4-decomposition-planner.ts`, 2 sites, both internal to that file)
      - `ollamaCachedChat` → `llamaServerCachedChat`
        (`ollama-cached.ts` definition + doc comment, `rg-atlas/multi-query.ts`,
        `routes/api/test/ollama-cached/+server.ts`)
      - `llm-router.ts`'s `provider?: 'ollama' | 'tensorrt'` →
        `provider?: 'llama-server' | 'tensorrt'`, default value updated, and
        both external callers (`routes/api/cases/[id]/analyze/stream`,
        `routes/api/evidence/[id]/analyze/stream`) updated to pass
        `provider: 'llama-server'`
      - Verified via `npx tsgo --noEmit`: zero new errors in any renamed file

## Verification commands used this session

```bash
# Confirm no raw-fetch offenders remain (chat/generate, excluding ollamaFetch)
rg -n "fetch\(\`?\$\{?(OLLAMA_URL|ollamaUrl|this\.config\.url)\}?.*api/(generate|chat)" src --type ts
# → 0 hits (couchdb-client.ts, llm-router.ts fixed)

rg -n "fetch\(\`?\$\{?(getOllamaEndpoint\(\)|getOllamaChatEndpoint\(\)|getOllamaGenerationEndpoint\(\)|OLLAMA_BASE_URL|OLLAMA_URL|ollamaUrl|ollamaBaseUrl|CONFIG\.endpoints\.ollama)\}?.*(api/generate|api/chat)" src --type ts | grep -v "ollamaFetch"
# → 4 hits, all confirmed legitimate exceptions (VLM x2, model-unload x2)
```

## Cross-references

- See README.md for live server findings, the `ollamaFetch()` intercept
  discovery, the full fixed-file list, and the legitimate-exception categories.
