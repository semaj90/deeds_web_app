# To Do List - Stubbed Methods, E2E Mapping, and Policy Env Gates

## Goal
- Build an end-to-end task list for missing/stubbed methods.
- Define feature mapping and policy/env gates before changing smoke warning behavior.

## Scope
- Included: active code paths in `sveltekit-frontend/src` and smoke/pipeline control in `sveltekit-frontend/scripts`.
- Excluded from this list: vendor/venv code, generated diagnostic blobs, and backup archives unless explicitly promoted.

## End-to-End Feature Map (Current Lane)
- Request path: `POST /api/v1/chat/completions` -> OpenAI facade -> ACE/HMM -> smoke contract (`smoke-trace-full-loop.mjs`).
- Smoke output currently shows no runtime errors but policy warnings (`missing_memory_gain_score`, `missing_memory_decision`, `agents_md_miss_with_filepath`).
- Policy decision required: treat these as informational by default, and enforce only when env gates are enabled.

## Stub Inventory (Actionable)

### 1) ONNX inference fallback is intentionally stubbed
- File: `sveltekit-frontend/src/lib/ai/onnx/inference.ts`
- Evidence:
  - `// Simple text generation (this is a stub...)`
  - `// TODO: Implement actual ONNX inference with tokenizer`
- Impact:
  - ONNX path always returns `null`; fallback works but does not generate text.
- Tasks:
  - [ ] Implement tokenizer -> model run -> detokenizer path.
  - [ ] Add deterministic test for non-null generation when model + tokenizer are present.
  - [ ] Keep `isOnnxAvailable()` lightweight and separate from full-run health.

### 2) Benchmark suite contains placeholder result
- File: `sveltekit-frontend/src/lib/server/optimize/benchmark.ts`
- Evidence:
  - `// stub` inside `benchmarkVectorQuantization()`
- Impact:
  - Reported benchmark numbers are synthetic and can mislead optimization decisions.
- Tasks:
  - [ ] Replace synthetic return with real quantization benchmark execution.
  - [ ] Add dataset fixture + reproducible seed for regression comparisons.
  - [ ] Persist benchmark artifacts (json) with timestamp and model/profile metadata.

## Potentially Stub-Like Areas to Triage (Do Not Auto-Edit)
- File: `sveltekit-frontend/src/lib/server/mcp/mcp-internal.ts`
- Notes:
  - Returns `null`/`[]` for no result; this may be valid degraded behavior, not a missing method.
- Tasks:
  - [ ] Confirm degraded contract for internal MCP bridge.
  - [ ] If needed, replace `null` fallback with typed envelope to reduce downstream ambiguity.

## Policy/Env Gating Plan (Before Changing Smoke Semantics)

### Warning-to-policy mapping
- `missing_memory_gain_score`
  - Producer: smoke validator (`validateResult`)
  - Upstream source currently unset: `memory.gainScore`
  - Policy: optional/aspirational unless explicitly enforced.
- `missing_memory_decision`
  - Producer: smoke validator (`validateResult`)
  - Upstream source currently unset: `memory.decision`
  - Policy: optional/aspirational unless explicitly enforced.
- `agents_md_miss_with_filepath`
  - Producer: smoke normalizer when `filePath` is set and `yorha.agentsMd === false`
  - Policy: optional quality signal; enforce only in indexing/memory readiness runs.

### Env gates to add before policy changes
- [ ] Add `TRACE_SMOKE_ENFORCE_MEMORY_SIGNALS` (`0` default).
- [ ] Add `TRACE_SMOKE_ENFORCE_AGENTS_MD` (`0` default).
- [ ] Add `TRACE_SMOKE_WARN_ON_EMPTY_CONTENT` (`1` default) so content fallback remains visible but non-blocking.
- [ ] Document these gates in script header usage block and startup docs.

### Acceptance criteria for policy env work
- [ ] Default run (`npm run smoke:trace:full`) does not fail on aspirational policy warnings.
- [ ] Enforced run (`TRACE_SMOKE_ENFORCE_MEMORY_SIGNALS=1 TRACE_SMOKE_ENFORCE_AGENTS_MD=1`) fails when signals are absent.
- [ ] `latest.json` always includes explicit summary counts and stable warning codes.

## Execution Order
1. Finalize policy defaults (env gates) in smoke script.
2. Implement ONNX inference stub replacement.
3. Replace benchmark placeholder with real measurements.
4. Re-run smoke with default and enforced env profiles.
5. Update this file with completion timestamps and linked artifacts.

## Notes
- Current smoke lane status (latest observed): `0 err`, warnings only, non-strict exit code `0`.
- Port conflicts (`8788`, `11434`) are operational and separate from stub-method completion work.