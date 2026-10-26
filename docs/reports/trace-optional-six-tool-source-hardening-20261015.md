# TRACE Optional Six-Tool Source Hardening

Status: `SOURCE_HARDENED / TEST_UNVERIFIED / LIVE_NOT_ENABLED`

## Findings

The six names absent from the current TRACE `tools/list` already have source registrations:

- `codebase.rg_search` — `sveltekit-frontend/src/mcp/codebase_tools.ts`
- `kb.rg_atlas_search` — `sveltekit-frontend/src/mcp/rg_atlas_tools.ts`
- `research.deep_analyze`, `research.synthesize`, `research.web_search` — `sveltekit-frontend/src/mcp/research_tools.ts`
- `trace.bifrost_dispatch` — `sveltekit-frontend/src/mcp/bifrost_tools.ts`

`trace-mcp-server.ts` registers all four families only when `MCP_OPTIONAL_REGISTRIES=true`. The gate remains unchanged and TRACE was not restarted.

## Source changes

- All six dispatcher wrappers now use `READ_ONLY` policy.
- RG-Atlas tool input excludes `persist`; its handler forces `persist: false` regardless of future caller input. Search paths, arrays, query size, and blend weights are validated and bounded.
- Research inputs use strict schemas and bounded query/output controls. Descriptions now distinguish direct generation/search from evidence-grounded synthesis; exhaustive deep analysis adds two bounded facets.
- Bifrost rejects non-JSON/oversized payloads, applies request timeouts, and reads responses through the existing bounded JSON reader.

## Validation

- `npx vitest run src/mcp/optional-search-tool-contract.spec.ts src/mcp/read-tool-bounds.spec.ts` — existing bounds spec reported **43 passed**; the new registration spec did not report before interruption and remains **unverified**.
- `openspec validate parent-atlas-ace-rlm-bitfrost-integration --strict` — valid.
- Scoped `git diff --check` for the modified source and ledger paths — passed.
- Repository-wide `git diff --check` is blocked by unrelated trailing whitespace in the generated `simd-bridge/cpp/build-x64-cuda/CMakeFiles/CMakeConfigureLog.yaml`; no generated build artifact was edited for this task.
- No Svelte check, service restart, live MCP tool call, database/cache/GPU write, or live registry change.

## Next gates

1. Resolve why the focused registration spec stalls and obtain a passing result.
2. Review handler contracts and MCP annotations against the current runtime version.
3. Decide separately whether to expose any of the six; never enable the whole optional family implicitly.
4. If approved, restart TRACE under the operator's normal process and verify `tools/list` only; execute no external/generation tools without a separate test plan.
