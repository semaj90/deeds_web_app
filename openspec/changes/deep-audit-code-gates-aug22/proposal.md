## Why

A `/deep-audit` pass (2026-08-22, scope=all, gates=code, mode=report) ran the G1-G26 code-connectivity/Svelte5/test-pairing gate suite against `sveltekit-frontend/docs/graph/codebase-graph.json` (24,151 raw entries, indexed 2026-08-21T17:21Z — 33.9h stale at audit time, run anyway since a report-only pass is non-destructive). Recording findings here so they survive compaction; a `/code-review` pass and the `data`/`infra`/`tier-h` gate suites (G10-G12, G27-G55) were requested to run as follow-ups before any fixing.

## What Changes (record-only — nothing fixed yet)

**Index hygiene finding (new, not previously documented)**: 5,739 of 24,151 indexed entries are vendor/backup noise inflating raw gate counts if not filtered — `scripts/api-cleanup/` alone contributes 2,558 stale route-file backups (not `scripts/api-cleanup/reports/backup-*` specifically, the whole directory). Other noise sources: `llama-cpp-turboquant-gemma4/` (vendored fork), `tools/agentic-research/`, `scripts/phase104-backups/`, `granite-docling-258M/`. A future `graphify:daily` run or the indexer itself should exclude these paths so raw `f.rel` counts aren't misleading (e.g. raw D9 fanIn=0 was 19,609 before exclusion vs 14,943 after — still high, needs `audit:d9` verification, not a deletion list either way).

**Gate-schema drift finding (new)**: CLAUDE.md's deep-audit dispatch table documents G5 as reading `f.parsesBody` from the graph JSON. That field does not exist in the current `codebase-graph.json` schema (confirmed via direct key enumeration of a sample file object — actual keys are `rel, ext, tags, summary, imports, exports, dynImports, reExports, routeHandlers, drizzleRefs, todos, components, isRoute, isSvelteComp, isTest, lineCount, hasAuth, hasZod, ssrUnsafe, sv4Legacy, runeInTs, hasPairedTest, fanIn, routeParams, routeDepth, localhostRefs, localhostBreaks`). This session approximated G5 via `routeHandlers` matching mutating HTTP methods + `hasZod === false`, which produced 47 fails vs the graph's own precomputed `gateStats.routesWithoutZod: 23` — a real, unexplained gap, meaning either the approximation or the precomputed stat (or both) don't match what CLAUDE.md's G5 definition actually intends. Needs resolution before G5's fail list is trusted for fixing.

**Gate findings (G1-G26, scored against 18,412 live files after vendor/backup exclusion)**:
- G4 (auth on API routes): 47 `+server.ts` files missing `locals.user` guard (vs graph's own `gateStats.routesWithoutAuth: 42` — smaller, unexplained 5-route gap, not chased).
- G5 (Zod on mutating routes): 47 fails, see schema-drift finding above — count not trustworthy as-is.
- G8 (TODOs): 453 files, 977 TODOs total — informational backlog, not a hard gate.
- G11 (localhost refs unwrapped): 41 files with bare `localhost`/`127.0.0.1` not behind `ENV.*`.
- G14 (Svelte 4 legacy): 3 files, all scratch (`temp_upload.svelte`, `test-errors-validation.svelte`, `test-errors.svelte`) — likely safe to archive per repo's archive-not-delete convention, not decided here.
- G15 (SSR-unsafe): 1 file (`src/mcp/tools/legal-skills.tool.ts`) — likely a false positive (server-only MCP tool file), not independently verified.
- G16 (route/test pairing): 67 `+server.ts` without a paired test — matches graph's own `gateStats.routesWithoutTest: 67` exactly (the one gate where this session's filter and the precomputed stat agree).
- G20 (cyclic imports): 16 cyclic pairs per `gateStats`, not individually enumerated this pass.
- G21-24 (sv4 props/reactive/events/dispatch): 0 / 2 / 2 / 0 — near-clean.
- G25 (rune-in-plain-.ts): 25 files.
- G26 (test env directive): 4 of 824 `tests/routes/*.test.ts` missing `@vitest-environment node`: `all-routes-page.test.ts`, `cache-stats.test.ts`, `codebase-tags-rename.test.ts`, `phase109-tag-chunks.test.ts`.

## Non-Goals

- This proposal does not fix any of the above findings. Zero code changed.
- Does not resolve the G5 schema-drift ambiguity — flagged for investigation, not decided.
- Does not run or interpret `npm run audit:d9` (the D9 orphan-verification chain) — the raw fanIn=0 count (14,943) is explicitly flagged as unverified and NOT a deletion list per this repo's own deep-audit skill documentation.
- Does not yet cover gate suites `data` (G10-G12), `infra` (G27-G47), or `tier-h` (G48-G55) — those are the explicit next step of this same request, to be appended to this change once run.

## Impact

- **Code affected**: none yet — report-only.
- **Stale index caveat**: the graph JSON was 33.9h old at audit time (>24h freshness threshold the deep-audit skill itself flags). Findings here reflect that snapshot, not necessarily current HEAD state, especially given the heavy concurrent multi-worktree agent activity documented elsewhere this session (`inference-wiring-deep-audit-aug22` task 5.9).
