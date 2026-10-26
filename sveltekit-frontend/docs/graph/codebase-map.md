# Codebase Map — 20-Gate Deep Audit
> Generated: 2026-10-17T10:26:30.931Z
> Mode: `fast-ast` · CPU-only · No GPU required
> Regenerate: `npm run index:codebase:fast:plan`

---

## Summary
| Metric | Count |
|--------|-------|
| Files scanned | 34183 |
| Directories analysed | 1668 |
| Route files | 1220 |
| Svelte components | 1171 |
| API handlers | 3336 |
| API routes without auth | 29 |
| API routes without Zod | 4 |
| SSR-unsafe files | 0 |
| Svelte 4 legacy patterns | 3 |
| Hardcoded localhost refs | 1773 |
| Routes without test pairing | 76 |
| Cyclic import pairs | 16 |
| Drizzle table refs | 1678 |
| TODO/FIXME markers | 991 |

---

## 20-Gate Audit Summary

| Gate | Check | Pass | Fail |
|------|-------|------|------|
| G4  | Auth guard on API routes | 926 | 30 |
| G5  | Zod validation on API routes | 661 | 4 |
| G11 | No hardcoded localhost (excl env.server) | 32410 | 1773 |
| G14a | No `export let` (Svelte 4 props) | 34183 | 0 |
| G14b | No `$:` reactive declarations | 34181 | 2 |
| G14c | No `on:event=` directives | 34181 | 2 |
| G14d | No `createEventDispatcher()` | 34183 | 0 |
| G14e | No runes in plain `.ts` files | 34158 | 25 |
| G15 | No SSR-unsafe globals (unguarded) | 34183 | 0 |
| G16 | Server routes have test pairing | 812 | 76 |
| G17 | Server routes have error handling | 833 | 137 |
| G20 | Cyclic import pairs | — | 16 |

---

## Directory Scorecard (1668 dirs · lowest score = most attention needed)

**Score factors**: Auth/API coverage 25pts · Zod coverage 15pts · Drizzle ref 10pts · No TODOs 15pts · SSR-safe 10pts · No Svelte4 10pts · No localhost 5pts · Error handling 5pts · Non-empty 5pts

**Flags**: 🔴ssr = SSR-unsafe globals · 🟡sv4 = Svelte4 legacy · 🟠lh = localhost hardcoded · ⬜notest = routes lack tests


| Status | Directory | Score | Files | Lines | APIs | Auth/Zod | TODOs | Flags |
|--------|-----------|-------|-------|-------|------|----------|-------|-------|
| ⚠️ | `scripts/api-cleanup/reports/backup-2025-12-14T21-11-49-641Z` | 44 | 554 | 22692 | 452 | 48/54 | 68 | 🟠lh |
| ⚠️ | `scripts/api-cleanup` | 45 | 40 | 201206 | 2444 | 262/388 | 664 | 🟠lh |
| ⚠️ | `scripts/api-cleanup/reports` | 45 | 6 | 191646 | 2436 | 262/384 | 662 | 🟠lh |
| ⚠️ | `scripts/api-cleanup/reports/backup-2025-12-14T20-51-26-276Z` | 45 | 2148 | 158294 | 1984 | 214/330 | 594 | 🟠lh |
| ⚠️ | `scripts/graphify/lib` | 50 | 8 | 1014 | 2 | 0/0 | 0 | — |
| ⚠️ | `sveltekit-frontend/src/routes/.well-known` | 58 | 4 | 541 | 4 | 0/2 | 0 | — |
| ⚠️ | `tools/agentic-research/src/local-deep-research` | 68 | 906 | 290768 | 0 | 0/74 | 2 | 🔴ssr 🟠lh |
| ✅ | `llama-cpp-turboquant-gemma4/tools/server` | 70 | 1 | 60689 | 0 | 2/24 | 3 | 🟠lh |
| ✅ | `scripts/verify` | 70 | 20 | 4466 | 0 | 0/12 | 8 | 🟠lh |
| ✅ | `atlas-openspec-awareness-v2/src/routes/atlas` | 75 | 3 | 277 | 1 | 1/0 | 0 | — |
| ✅ | `packages/parent-atlas-core` | 75 | 2 | 1351 | 0 | 0/0 | 5 | — |
| ✅ | `packages/parent-atlas-core/src` | 75 | 3 | 1287 | 0 | 0/0 | 5 | — |
| ✅ | `sveltekit-frontend/scripts/topology` | 75 | 1 | 207 | 0 | 0/0 | 9 | — |
| ✅ | `sveltekit-frontend/src/lib/ai` | 75 | 80 | 7944 | 0 | 0/4 | 9 | — |
| ✅ | `sveltekit-frontend/src/routes/api` | 75 | 863 | 126466 | 833 | 800/638 | 9 | 🟠lh ⬜notest |
| ✅ | `llama-cpp-turboquant-gemma4/tools/server/webui` | 78 | 435 | 57041 | 0 | 1/18 | 1 | 🟠lh |
| ✅ | `packages/atlas-core/src/langgraph` | 78 | 13 | 2555 | 0 | 0/6 | 2 | 🟠lh |
| ✅ | `packages/parent-atlas-retrieval/src/crossencoder` | 78 | 6 | 797 | 0 | 1/2 | 1 | 🟠lh |
| ✅ | `sveltekit-frontend/src/mcp` | 78 | 51 | 29682 | 0 | 5/43 | 1 | 🔴ssr 🟠lh |
| ✅ | `packages/atlas-core/src/evidence` | 80 | 15 | 1177 | 1 | 0/2 | 0 | — |
| ✅ | `scripts/agent` | 80 | 22 | 5030 | 0 | 0/10 | 4 | 🟠lh |
| ✅ | `sveltekit-frontend/src/mcp/tools` | 80 | 11 | 3593 | 0 | 0/8 | 0 | 🔴ssr |
| ✅ | `llama-cpp-turboquant-gemma4/tools/server/public_legacy` | 83 | 5 | 1474 | 0 | 0/2 | 2 | — |
| ✅ | `scripts/benchmark` | 83 | 2 | 774 | 0 | 0/2 | 2 | — |
| ✅ | `scripts/executive` | 83 | 2 | 1126 | 0 | 0/2 | 2 | — |
| ✅ | `sveltekit-frontend/src/lib/workers` | 83 | 10 | 2076 | 0 | 0/1 | 2 | — |
| ✅ | `claude-mem/src/npx-cli` | 85 | 3 | 3852 | 0 | 0/4 | 0 | 🟠lh |
| ✅ | `claude-mem/src/npx-cli/commands` | 85 | 6 | 2903 | 0 | 0/2 | 0 | 🟠lh |
| ✅ | `llama-cpp-turboquant-gemma4/tools/server/bench` | 85 | 1 | 163 | 0 | 0/1 | 0 | 🟠lh |
| ✅ | `llama-cpp-turboquant-gemma4/tools/server/public_simplechat` | 85 | 3 | 1409 | 0 | 0/1 | 0 | 🟠lh |
| ✅ | `packages/parent-atlas/src/pipelines` | 85 | 11 | 1603 | 0 | 0/1 | 0 | 🟠lh |
| ✅ | `packages/parent-atlas-runtime` | 85 | 2 | 1569 | 0 | 0/0 | 7 | — |
| ✅ | `packages/parent-atlas-runtime/src` | 85 | 2 | 1520 | 0 | 0/0 | 7 | — |
| ✅ | `packages/parent-atlas-runtime/src/facade` | 85 | 1 | 277 | 0 | 0/0 | 6 | — |
| ✅ | `scripts/agentic` | 85 | 12 | 3050 | 0 | 0/12 | 0 | 🟠lh |
| ✅ | `scripts/ai` | 85 | 8 | 584 | 0 | 0/8 | 0 | 🟠lh |
| ✅ | `scripts/atlas/ingester` | 85 | 22 | 2496 | 0 | 0/14 | 0 | 🟠lh |
| ✅ | `scripts/atlas/knowledge-layer` | 85 | 20 | 2452 | 0 | 0/0 | 0 | 🟠lh |
| ✅ | `scripts/audit` | 85 | 6 | 2078 | 0 | 0/2 | 0 | 🟠lh |
| ✅ | `scripts/cache` | 85 | 14 | 1494 | 0 | 0/8 | 0 | 🟠lh |
| ✅ | `scripts/docs` | 85 | 2 | 830 | 0 | 0/0 | 0 | 🟠lh |
| ✅ | `scripts/eval` | 85 | 2 | 810 | 0 | 0/0 | 0 | 🟠lh |
| ✅ | `scripts/gpu` | 85 | 22 | 3630 | 0 | 0/4 | 0 | 🟠lh |
| ✅ | `scripts/graph` | 85 | 10 | 2282 | 0 | 0/8 | 0 | 🟠lh |
| ✅ | `scripts/operator` | 85 | 6 | 1388 | 0 | 0/4 | 0 | 🟠lh |
| ✅ | `scripts/phase-b` | 85 | 2 | 778 | 0 | 0/2 | 0 | 🟠lh |
| ✅ | `scripts/skills` | 85 | 4 | 1616 | 0 | 0/2 | 0 | 🟠lh |
| ✅ | `scripts/startup` | 85 | 44 | 9090 | 0 | 2/14 | 0 | 🟠lh |
| ✅ | `scripts/vector` | 85 | 2 | 246 | 0 | 0/0 | 0 | 🟠lh |
| ✅ | `scripts/workers` | 85 | 6 | 1190 | 0 | 0/4 | 0 | 🟠lh |
| ✅ | `sveltekit-frontend/.vscode` | 85 | 14 | 6167 | 0 | 0/1 | 0 | 🟠lh |
| ✅ | `sveltekit-frontend/drizzle` | 85 | 8 | 1021865 | 0 | 0/0 | 24 | — |
| ✅ | `sveltekit-frontend/drizzle/introspected` | 85 | 2 | 20357 | 0 | 0/0 | 4 | — |
| ✅ | `sveltekit-frontend/public` | 85 | 1 | 572 | 0 | 0/0 | 0 | 🟠lh |
| ✅ | `sveltekit-frontend/public/js` | 85 | 1 | 571 | 0 | 0/0 | 0 | 🟠lh |
| ✅ | `sveltekit-frontend/scripts/ace` | 85 | 17 | 1410 | 0 | 0/7 | 0 | 🟠lh |
| ✅ | `sveltekit-frontend/scripts/diagnose` | 85 | 2 | 379 | 0 | 0/0 | 0 | 🟠lh |
| ✅ | `sveltekit-frontend/scripts/diagnostics` | 85 | 8 | 571 | 0 | 0/4 | 0 | 🟠lh |
| ✅ | `sveltekit-frontend/scripts/evaluation` | 85 | 1 | 269 | 0 | 0/1 | 0 | 🟠lh |
| ✅ | `sveltekit-frontend/scripts/kag` | 85 | 1 | 308 | 0 | 0/1 | 0 | 🟠lh |
| ✅ | `sveltekit-frontend/scripts/scenarios` | 85 | 4 | 359 | 0 | 0/3 | 0 | 🟠lh |
| ✅ | `sveltekit-frontend/src/lib/components` | 85 | 665 | 168873 | 0 | 0/47 | 7 | — |
| ✅ | `sveltekit-frontend/src/lib/gpu` | 85 | 31 | 8498 | 0 | 0/5 | 0 | 🟠lh |
| ✅ | `sveltekit-frontend/src/lib/utils` | 85 | 52 | 7957 | 0 | 2/7 | 0 | 🟠lh |
| ✅ | `sveltekit-frontend/src/routes/dev` | 85 | 2 | 524 | 0 | 1/1 | 0 | 🟠lh ⬜notest |
| ✅ | `sveltekit-frontend/tests/helpers` | 85 | 4 | 440 | 0 | 1/1 | 0 | 🟠lh |
| ✅ | `sveltekit-frontend/tests/scripts` | 85 | 3 | 104 | 0 | 0/0 | 0 | 🟠lh |
| ✅ | `sveltekit-frontend/tmp` | 85 | 14 | 162199 | 0 | 0/0 | 0 | 🟠lh |
| ✅ | `triton-trt-llm/scripts` | 85 | 2 | 738 | 0 | 0/1 | 0 | 🟠lh |
| ✅ | `packages/parent-atlas/src` | 88 | 3 | 43673 | 0 | 0/233 | 1 | 🟠lh |
| ✅ | `packages/parent-atlas/src/core` | 88 | 295 | 40283 | 0 | 0/229 | 1 | 🟠lh |
| ✅ | `packages/parent-atlas-retrieval` | 88 | 2 | 9090 | 0 | 1/8 | 1 | 🟠lh |
| ✅ | `packages/parent-atlas-retrieval/src` | 88 | 1 | 7940 | 0 | 1/8 | 1 | 🟠lh |
| ✅ | `scripts/phase85` | 88 | 54 | 15402 | 0 | 0/14 | 2 | 🟠lh |
| ✅ | `.archive/2026-10-06-workspace-reseal-historical` | 90 | 1 | 15 | 0 | 0/0 | 0 | — |
| ✅ | `.archive/duplicates-2026-10-13` | 90 | 1 | 33 | 0 | 0/0 | 0 | — |
| ✅ | `.archive/production-hardening-2026-10-12` | 90 | 1 | 307409 | 0 | 0/0 | 0 | — |
| ✅ | `.archive/production-hardening-2026-10-12/docs/reports` | 90 | 1 | 307336 | 0 | 0/0 | 0 | — |
| ✅ | `.gemini/antigravity/scratch` | 90 | 3 | 132 | 0 | 0/0 | 0 | — |
| ✅ | `.okf/corpora` | 90 | 1 | 79 | 0 | 0/0 | 0 | — |
| ✅ | `.okf/docs/dspy` | 90 | 2 | 44 | 0 | 0/0 | 0 | — |
| ✅ | `.okf/docs/dspy/snapshots` | 90 | 6 | 10 | 0 | 0/0 | 0 | — |
| ✅ | `.okf/languages` | 90 | 1 | 1503 | 0 | 0/0 | 0 | — |
| ✅ | `.okf/schemas` | 90 | 5 | 393 | 0 | 0/0 | 0 | — |
| ✅ | `.proofs/four-lanes` | 90 | 5 | 170 | 0 | 0/0 | 0 | — |
| ✅ | `.proofs/p4` | 90 | 1 | 126 | 0 | 0/0 | 0 | — |
| ✅ | `.vscode/extensions/mcp-context7-assistant/src` | 90 | 1 | 1 | 0 | 0/0 | 0 | — |
| ✅ | `.vscode/tasks` | 90 | 2 | 12 | 0 | 0/0 | 0 | — |
| ✅ | `ace-vector-selection-slice/src/lib/server` | 90 | 6 | 519 | 0 | 0/0 | 0 | — |
| ✅ | `atlas-openspec-awareness-v2/src/lib/components` | 90 | 1 | 102 | 0 | 0/0 | 0 | — |
| ✅ | `atlas-openspec-awareness-v2/tests` | 90 | 4 | 123 | 0 | 0/3 | 0 | — |
| ✅ | `backups/qdrant-upgrade-20260825-211412` | 90 | 2 | 29 | 0 | 0/0 | 0 | — |
| ✅ | `claude-mem/.agents/plugins` | 90 | 1 | 21 | 0 | 0/0 | 0 | — |
| ✅ | `claude-mem/.claude` | 90 | 1 | 11 | 0 | 0/0 | 0 | — |
| ✅ | `claude-mem/.claude-plugin` | 90 | 2 | 44 | 0 | 0/0 | 0 | — |
| ✅ | `claude-mem/.codex-plugin` | 90 | 1 | 47 | 0 | 0/0 | 0 | — |
| ✅ | `claude-mem/cursor-hooks` | 90 | 1 | 35 | 0 | 0/0 | 0 | — |
| ✅ | `claude-mem/docs/context` | 90 | 1 | 114 | 0 | 0/0 | 0 | — |
| ✅ | `claude-mem/docs/i18n` | 90 | 1 | 146 | 0 | 0/0 | 0 | — |
| ✅ | `claude-mem/docs/public` | 90 | 1 | 160 | 0 | 0/0 | 0 | — |
| ✅ | `claude-mem/install` | 90 | 1 | 37 | 0 | 0/0 | 0 | — |
| ✅ | `claude-mem/install/public` | 90 | 1 | 14 | 0 | 0/0 | 0 | — |
| ✅ | `claude-mem/openclaw` | 90 | 4 | 2459 | 0 | 1/2 | 0 | — |
| ✅ | `claude-mem/openclaw/src` | 90 | 2 | 2212 | 0 | 1/2 | 0 | — |
| ✅ | `claude-mem/plugin/.claude-plugin` | 90 | 1 | 25 | 0 | 0/0 | 0 | — |
| ✅ | `claude-mem/plugin/.codex-plugin` | 90 | 1 | 47 | 0 | 0/0 | 0 | — |
| ✅ | `claude-mem/plugin/hooks` | 90 | 2 | 163 | 0 | 0/0 | 0 | — |
| ✅ | `claude-mem/plugin/modes` | 90 | 35 | 1250 | 0 | 0/0 | 0 | — |
| ✅ | `claude-mem/plugin/skills/version-bump` | 90 | 1 | 35 | 0 | 0/1 | 0 | — |
| ✅ | `claude-mem/plugin/ui` | 90 | 1 | 66 | 0 | 0/1 | 0 | — |
| ✅ | `claude-mem/ragtime` | 90 | 1 | 232 | 0 | 0/0 | 0 | — |
| ✅ | `claude-mem/scripts` | 90 | 23 | 6581 | 0 | 0/12 | 0 | — |
| ✅ | `claude-mem/scripts/anti-pattern-test` | 90 | 1 | 476 | 0 | 0/0 | 0 | — |
| ✅ | `claude-mem/scripts/bug-report` | 90 | 3 | 846 | 0 | 0/1 | 0 | — |
| ✅ | `claude-mem/scripts/translate-readme` | 90 | 3 | 783 | 0 | 0/1 | 0 | — |
| ✅ | `claude-mem/src/adapters/claude-code` | 90 | 1 | 69 | 0 | 0/1 | 0 | — |
| ✅ | `claude-mem/src/adapters/generic-rest` | 90 | 1 | 43 | 0 | 0/0 | 0 | — |
| ✅ | `claude-mem/src/bin` | 90 | 2 | 427 | 0 | 0/1 | 0 | — |
| ✅ | `claude-mem/src/cli` | 90 | 4 | 2394 | 0 | 0/2 | 0 | — |
| ✅ | `claude-mem/src/cli/adapters` | 90 | 9 | 604 | 0 | 0/0 | 0 | — |
| ✅ | `claude-mem/src/cli/handlers` | 90 | 8 | 866 | 0 | 0/0 | 0 | — |
| ✅ | `claude-mem/src/core/schemas` | 90 | 8 | 313 | 0 | 0/7 | 0 | — |
| ✅ | `claude-mem/src/hooks` | 90 | 1 | 5 | 0 | 0/0 | 0 | — |
| ✅ | `claude-mem/src/integrations/opencode-plugin` | 90 | 1 | 298 | 0 | 0/1 | 0 | — |
| ✅ | `claude-mem/src/npx-cli/install` | 90 | 1 | 288 | 0 | 0/1 | 0 | — |
| ✅ | `claude-mem/src/npx-cli/utils` | 90 | 2 | 250 | 0 | 0/1 | 0 | — |
| ✅ | `claude-mem/src/sdk` | 90 | 2 | 423 | 0 | 0/1 | 0 | — |
| ✅ | `claude-mem/src/server/auth` | 90 | 3 | 184 | 0 | 0/1 | 0 | — |
| ✅ | `claude-mem/src/server/compat` | 90 | 2 | 341 | 0 | 0/2 | 0 | — |
| ✅ | `claude-mem/src/server/generation` | 90 | 8 | 1964 | 0 | 0/1 | 0 | — |
| ✅ | `claude-mem/src/server/jobs` | 90 | 4 | 877 | 0 | 0/1 | 0 | — |
| ✅ | `claude-mem/src/server/mcp` | 90 | 4 | 141 | 0 | 0/0 | 0 | — |
| ✅ | `claude-mem/src/server/middleware` | 90 | 3 | 367 | 0 | 0/0 | 0 | — |
| ✅ | `claude-mem/src/server/queue` | 90 | 3 | 802 | 0 | 1/0 | 0 | — |
| ✅ | `claude-mem/src/server/routes` | 90 | 2 | 2068 | 0 | 0/2 | 0 | — |
| ✅ | `claude-mem/src/server/runtime` | 90 | 7 | 1763 | 0 | 0/1 | 0 | — |
| ✅ | `claude-mem/src/server/services` | 90 | 2 | 430 | 0 | 0/0 | 0 | — |
| ✅ | `claude-mem/src/servers` | 90 | 1 | 1048 | 0 | 0/0 | 0 | — |
| ✅ | `claude-mem/src/services` | 90 | 4 | 31700 | 0 | 23/37 | 0 | — |
| ✅ | `claude-mem/src/services/context` | 90 | 12 | 1301 | 0 | 0/1 | 0 | — |
| ✅ | `claude-mem/src/services/domain` | 90 | 2 | 262 | 0 | 0/1 | 0 | — |
| ✅ | `claude-mem/src/services/hooks` | 90 | 3 | 695 | 0 | 0/2 | 0 | — |
| ✅ | `claude-mem/src/services/infrastructure` | 90 | 6 | 1420 | 0 | 0/2 | 0 | — |
| ✅ | `claude-mem/src/services/install` | 90 | 1 | 39 | 0 | 0/0 | 0 | — |
| ✅ | `claude-mem/src/services/integrations` | 90 | 9 | 2896 | 0 | 0/5 | 0 | — |
| ✅ | `claude-mem/src/services/queue` | 90 | 1 | 159 | 0 | 0/0 | 0 | — |
| ✅ | `claude-mem/src/services/server` | 90 | 6 | 452 | 0 | 0/0 | 0 | — |
| ✅ | `claude-mem/src/services/smart-file-read` | 90 | 2 | 1346 | 0 | 0/1 | 0 | — |
| ✅ | `claude-mem/src/services/sqlite` | 90 | 32 | 7268 | 0 | 3/3 | 0 | — |
| ✅ | `claude-mem/src/services/sync` | 90 | 3 | 1903 | 0 | 0/3 | 0 | — |
| ✅ | `claude-mem/src/services/transcripts` | 90 | 7 | 1192 | 0 | 1/4 | 0 | — |
| ✅ | `claude-mem/src/services/worker` | 90 | 58 | 11147 | 0 | 18/15 | 0 | — |
| ✅ | `claude-mem/src/shared` | 90 | 16 | 2175 | 0 | 2/7 | 0 | — |
| ✅ | `claude-mem/src/supervisor` | 90 | 5 | 1171 | 0 | 0/3 | 0 | — |
| ✅ | `claude-mem/src/types` | 90 | 3 | 89 | 0 | 0/0 | 0 | — |
| ✅ | `claude-mem/src/ui/viewer` | 90 | 18 | 905 | 0 | 0/1 | 0 | — |
| ✅ | `claude-mem/src/utils` | 90 | 10 | 1225 | 0 | 0/4 | 0 | — |
| ✅ | `claude-mem/tests` | 90 | 31 | 31702 | 0 | 16/25 | 0 | — |
| ✅ | `claude-mem/tests/adapters` | 90 | 1 | 56 | 0 | 0/0 | 0 | — |
| ✅ | `claude-mem/tests/cli` | 90 | 3 | 831 | 0 | 0/1 | 0 | — |
| ✅ | `claude-mem/tests/cli/adapters` | 90 | 2 | 173 | 0 | 0/0 | 0 | — |
| ✅ | `claude-mem/tests/cli/handlers` | 90 | 2 | 312 | 0 | 0/1 | 0 | — |
| ✅ | `claude-mem/tests/compat` | 90 | 1 | 359 | 0 | 0/0 | 0 | — |
| ✅ | `claude-mem/tests/context` | 90 | 2 | 842 | 0 | 0/0 | 0 | — |
| ✅ | `claude-mem/tests/context/formatters` | 90 | 1 | 463 | 0 | 0/0 | 0 | — |
| ✅ | `claude-mem/tests/core/schemas` | 90 | 1 | 89 | 0 | 0/1 | 0 | — |
| ✅ | `claude-mem/tests/hooks` | 90 | 3 | 640 | 0 | 0/1 | 0 | — |
| ✅ | `claude-mem/tests/infrastructure` | 90 | 9 | 2334 | 0 | 0/5 | 0 | — |
| ✅ | `claude-mem/tests/integration` | 90 | 4 | 970 | 0 | 0/0 | 0 | — |
| ✅ | `claude-mem/tests/scripts` | 90 | 2 | 298 | 0 | 0/1 | 0 | — |
| ✅ | `claude-mem/tests/sdk` | 90 | 3 | 350 | 0 | 0/0 | 0 | — |
| ✅ | `claude-mem/tests/server` | 90 | 6 | 4831 | 0 | 0/1 | 0 | — |
| ✅ | `claude-mem/tests/server/generation` | 90 | 4 | 898 | 0 | 0/0 | 0 | — |
| ✅ | `claude-mem/tests/server/jobs` | 90 | 4 | 828 | 0 | 0/1 | 0 | — |
| ✅ | `claude-mem/tests/server/middleware` | 90 | 1 | 76 | 0 | 0/0 | 0 | — |
| ✅ | `claude-mem/tests/server/runtime` | 90 | 6 | 1444 | 0 | 0/0 | 0 | — |
| ✅ | `claude-mem/tests/servers` | 90 | 1 | 120 | 0 | 0/0 | 0 | — |
| ✅ | `claude-mem/tests/services` | 90 | 4 | 3585 | 0 | 2/1 | 0 | — |
| ✅ | `claude-mem/tests/services/queue` | 90 | 4 | 1190 | 0 | 0/1 | 0 | — |
| ✅ | `claude-mem/tests/services/sqlite` | 90 | 8 | 1509 | 0 | 1/0 | 0 | — |
| ✅ | `claude-mem/tests/services/sync` | 90 | 3 | 364 | 0 | 0/0 | 0 | — |
| ✅ | `claude-mem/tests/services/worker` | 90 | 2 | 228 | 0 | 1/0 | 0 | — |
| ✅ | `claude-mem/tests/shared` | 90 | 5 | 1001 | 0 | 1/1 | 0 | — |
| ✅ | `claude-mem/tests/sqlite` | 90 | 6 | 1216 | 0 | 1/0 | 0 | — |
| ✅ | `claude-mem/tests/supervisor` | 90 | 5 | 975 | 0 | 0/2 | 0 | — |
| ✅ | `claude-mem/tests/transcripts` | 90 | 3 | 414 | 0 | 0/0 | 0 | — |
| ✅ | `claude-mem/tests/utils` | 90 | 7 | 2199 | 0 | 0/2 | 0 | — |
| ✅ | `claude-mem/tests/viewer` | 90 | 1 | 63 | 0 | 0/0 | 0 | — |
| ✅ | `claude-mem/tests/worker` | 90 | 4 | 4804 | 0 | 7/0 | 0 | — |
| ✅ | `claude-mem/tests/worker/agents` | 90 | 3 | 1096 | 0 | 1/0 | 0 | — |
| ✅ | `claude-mem/tests/worker/http` | 90 | 4 | 749 | 0 | 3/0 | 0 | — |
| ✅ | `claude-mem/tests/worker/middleware` | 90 | 1 | 185 | 0 | 0/0 | 0 | — |
| ✅ | `claude-mem/tests/worker/search` | 90 | 5 | 1961 | 0 | 3/0 | 0 | — |
| ✅ | `crates/atlas_packet_parser` | 90 | 6 | 538 | 0 | 0/0 | 0 | — |
| ✅ | `crates/atlas_packet_parser/target` | 90 | 1 | 129 | 0 | 0/0 | 0 | — |
| ✅ | `crates/atlas_packet_parser/target/debug` | 90 | 64 | 64 | 0 | 0/0 | 0 | — |
| ✅ | `crates/atlas_packet_parser/target/release` | 90 | 64 | 64 | 0 | 0/0 | 0 | — |
| ✅ | `crates/omni-bridge/target` | 90 | 1 | 34 | 0 | 0/0 | 0 | — |
| ✅ | `crates/omni-bridge/target/debug` | 90 | 33 | 33 | 0 | 0/0 | 0 | — |
| ✅ | `crates/turbovec-napi` | 90 | 6 | 999 | 0 | 0/0 | 0 | — |
| ✅ | `crates/turbovec-napi/target` | 90 | 1 | 454 | 0 | 0/0 | 0 | — |
| ✅ | `crates/turbovec-napi/target/debug` | 90 | 170 | 170 | 0 | 0/0 | 0 | — |
| ✅ | `crates/turbovec-napi/target/release` | 90 | 170 | 170 | 0 | 0/0 | 0 | — |
| ✅ | `crates/turbovec-napi/target/x86_64-pc-windows-msvc` | 90 | 113 | 113 | 0 | 0/0 | 0 | — |
| ✅ | `cypress/e2e` | 90 | 1 | 51 | 0 | 0/0 | 0 | — |
| ✅ | `data/atlas-ml` | 90 | 5 | 330 | 0 | 0/0 | 0 | — |
| ✅ | `deeds-web-app/temp_poc_amqp_test` | 90 | 1 | 106 | 0 | 0/0 | 0 | — |
| ✅ | `docs/.okf` | 90 | 4 | 51864 | 0 | 0/0 | 0 | — |
| ✅ | `docs/.okf/ast-grep/raw` | 90 | 16 | 1761 | 0 | 0/0 | 0 | — |
| ✅ | `docs/.okf/dev` | 90 | 18 | 36394 | 0 | 0/0 | 0 | — |
| ✅ | `docs/.okf/dev/.publications` | 90 | 10 | 25339 | 0 | 0/0 | 0 | — |
| ✅ | `docs/.okf/dev/context-engineering-docs-v1` | 90 | 34 | 1777 | 0 | 0/0 | 0 | — |
| ✅ | `docs/.okf/dev/raw` | 90 | 88 | 5242 | 0 | 0/0 | 0 | — |
| ✅ | `docs/.okf/embeddinggemma2` | 90 | 2 | 28 | 0 | 0/0 | 0 | — |
| ✅ | `docs/.okf/langextract` | 90 | 1 | 316 | 0 | 0/0 | 0 | — |
| ✅ | `docs/.okf/langextract/raw` | 90 | 7 | 161 | 0 | 0/0 | 0 | — |
| ✅ | `docs/.okf/legacy/deeds_lab` | 90 | 1 | 54 | 0 | 0/0 | 0 | — |
| ✅ | `docs/.okf/library-docs/runs` | 90 | 40 | 4896 | 0 | 0/0 | 0 | — |
| ✅ | `docs/.okf/library-module-index` | 90 | 1 | 403 | 0 | 0/0 | 0 | — |
| ✅ | `docs/.okf/oaklib/raw` | 90 | 17 | 920 | 0 | 0/0 | 0 | — |
| ✅ | `docs/.okf/pinned` | 90 | 1 | 3613 | 0 | 0/0 | 0 | — |
| ✅ | `docs/.okf/pinned/bits-ui` | 90 | 5 | 435 | 0 | 0/0 | 0 | — |
| ✅ | `docs/.okf/pinned/drizzle-kit` | 90 | 3 | 410 | 0 | 0/0 | 0 | — |
| ✅ | `docs/.okf/pinned/drizzle-orm` | 90 | 5 | 666 | 0 | 0/0 | 0 | — |
| ✅ | `docs/.okf/pinned/pgvector` | 90 | 2 | 264 | 0 | 0/0 | 0 | — |
| ✅ | `docs/.okf/pinned/postgresql-18` | 90 | 6 | 768 | 0 | 0/0 | 0 | — |
| ✅ | `docs/.okf/pinned/svelte5-runes` | 90 | 4 | 502 | 0 | 0/0 | 0 | — |
| ✅ | `docs/.okf/pinned/sveltekit` | 90 | 5 | 567 | 0 | 0/0 | 0 | — |
| ✅ | `docs/.okf/registries` | 90 | 1 | 79 | 0 | 0/0 | 0 | — |
| ✅ | `docs/.okf/research/deltanet-swiglu` | 90 | 6 | 333 | 0 | 0/0 | 0 | — |
| ✅ | `docs/.okf/schemas` | 90 | 1 | 167 | 0 | 0/0 | 0 | — |
| ✅ | `docs/.okf/topics/langchain` | 90 | 3 | 103 | 0 | 0/0 | 0 | — |
| ✅ | `docs/.okf/trpc/raw` | 90 | 9 | 536 | 0 | 0/0 | 0 | — |
| ✅ | `docs/.okf/trpc-beautifulsoup-r2/raw` | 90 | 9 | 527 | 0 | 0/0 | 0 | — |
| ✅ | `docs/.okf/trpc-firecrawl-r1` | 90 | 1 | 574 | 0 | 0/0 | 0 | — |
| ✅ | `docs/.okf/trpc-firecrawl-r1/raw` | 90 | 9 | 477 | 0 | 0/0 | 0 | — |
| ✅ | `docs/.okf/ts-morph/raw` | 90 | 15 | 718 | 0 | 0/0 | 0 | — |
| ✅ | `docs/ai-os` | 90 | 1 | 4 | 0 | 0/0 | 0 | — |
| ✅ | `docs/architecture` | 90 | 3 | 679 | 0 | 0/0 | 0 | — |
| ✅ | `docs/archive/2026-10-15` | 90 | 1 | 16 | 0 | 0/0 | 0 | — |
| ✅ | `docs/archive/legacy-source-alias-fixture` | 90 | 1 | 15 | 0 | 0/0 | 0 | — |
| ✅ | `docs/atlas` | 90 | 6 | 55638 | 0 | 0/0 | 0 | — |
| ✅ | `docs/contracts` | 90 | 3 | 344 | 0 | 0/0 | 0 | — |
| ✅ | `docs/graph` | 90 | 27 | 1725597 | 0 | 0/0 | 0 | — |
| ✅ | `docs/okf` | 90 | 1 | 175 | 0 | 0/0 | 0 | — |
| ✅ | `docs/packets` | 90 | 1 | 532 | 0 | 0/0 | 0 | — |
| ✅ | `docs/phase-110-agentic-indexing/schemas` | 90 | 2 | 254 | 0 | 0/0 | 0 | — |
| ✅ | `docs/phase100` | 90 | 7 | 29520 | 0 | 0/0 | 0 | — |
| ✅ | `docs/phase107-operations` | 90 | 1 | 68 | 0 | 0/0 | 0 | — |
| ✅ | `docs/profile-cards/data` | 90 | 23 | 716 | 0 | 0/0 | 0 | — |
| ✅ | `docs/reports` | 90 | 3254 | 168720487 | 0 | 0/0 | 0 | — |
| ✅ | `docs/reports/.openspec-final-wire-20261003` | 90 | 3 | 6 | 0 | 0/0 | 0 | — |
| ✅ | `docs/reports/admission-readback-current-20261004` | 90 | 1 | 411 | 0 | 0/0 | 0 | — |
| ✅ | `docs/reports/analysis-pass-staging` | 90 | 4 | 156 | 0 | 0/0 | 0 | — |
| ✅ | `docs/reports/architecture-temporal-snapshots` | 90 | 1 | 1778 | 0 | 0/0 | 0 | — |
| ✅ | `docs/reports/atlas` | 90 | 5 | 1003 | 0 | 0/0 | 0 | — |
| ✅ | `docs/reports/atlas-canonical-projection-fabric-audit-followup-20260929` | 90 | 1 | 393 | 0 | 0/0 | 0 | — |
| ✅ | `docs/reports/atlas-canonical-projection-fabric-deep-audit-20260929` | 90 | 1 | 393 | 0 | 0/0 | 0 | — |
| ✅ | `docs/reports/atlas-canonical-projection-fabric-post-ordinal-query-rewrite-20260929` | 90 | 1 | 393 | 0 | 0/0 | 0 | — |
| ✅ | `docs/reports/atlas-canonical-projection-fabric-post-symbol-batch-20260929` | 90 | 1 | 393 | 0 | 0/0 | 0 | — |
| ✅ | `docs/reports/atlas-canonical-projection-fabric-post-symbol-batch-after-hang-20260929` | 90 | 1 | 393 | 0 | 0/0 | 0 | — |
| ✅ | `docs/reports/atlas-canonical-projection-fabric-post-symbol-batch-fifth-20260929` | 90 | 1 | 393 | 0 | 0/0 | 0 | — |
| ✅ | `docs/reports/atlas-canonical-projection-fabric-post-symbol-batch-fourth-20260929` | 90 | 1 | 393 | 0 | 0/0 | 0 | — |
| ✅ | `docs/reports/atlas-canonical-projection-fabric-post-symbol-batch-next-20260929` | 90 | 1 | 393 | 0 | 0/0 | 0 | — |
| ✅ | `docs/reports/atlas-canonical-projection-fabric-post-symbol-batch-partial-20260929` | 90 | 1 | 393 | 0 | 0/0 | 0 | — |
| ✅ | `docs/reports/atlas-canonical-projection-fabric-post-symbol-batch-repaired-20260929` | 90 | 1 | 393 | 0 | 0/0 | 0 | — |
| ✅ | `docs/reports/atlas-canonical-projection-fabric-post-symbol-batch-sixth-20260929` | 90 | 1 | 393 | 0 | 0/0 | 0 | — |
| ✅ | `docs/reports/atlas-canonical-projection-fabric-post-symbol-batch-third-20260929` | 90 | 1 | 393 | 0 | 0/0 | 0 | — |
| ✅ | `docs/reports/atlas-canonical-projection-fabric-post-symbol-batch1000-20260929` | 90 | 1 | 393 | 0 | 0/0 | 0 | — |
| ✅ | `docs/reports/atlas-canonical-projection-fabric-post-symbol-canary-20260929` | 90 | 1 | 393 | 0 | 0/0 | 0 | — |
| ✅ | `docs/reports/atlas-canonical-projection-fabric-post-symbol-hung-batch-20260929` | 90 | 1 | 393 | 0 | 0/0 | 0 | — |
| ✅ | `docs/reports/current-structural-graph-artifact-v2` | 90 | 2 | 25478 | 0 | 0/0 | 0 | — |
| ✅ | `docs/reports/dry-run-tests` | 90 | 2 | 180 | 0 | 0/0 | 0 | — |
| ✅ | `docs/reports/embedding-tile-artifacts` | 90 | 1 | 24 | 0 | 0/0 | 0 | — |
| ✅ | `docs/reports/fixtures` | 90 | 6 | 117 | 0 | 0/0 | 0 | — |
| ✅ | `docs/reports/goal-refresh-20261001` | 90 | 2 | 623 | 0 | 0/0 | 0 | — |
| ✅ | `docs/reports/graphify-current-source-membership-v1-reapply` | 90 | 1 | 32 | 0 | 0/0 | 0 | — |
| ✅ | `docs/reports/graphify-projection-blocker-deep-audit-20260929/current-continuation` | 90 | 1 | 402 | 0 | 0/0 | 0 | — |
| ✅ | `docs/reports/graphify-projection-blocker-deep-audit-20260929/goal-refresh-20260930` | 90 | 5 | 2010 | 0 | 0/0 | 0 | — |
| ✅ | `docs/reports/graphify-projection-blocker-deep-audit-20260929/live-after-symbol-1000` | 90 | 1 | 402 | 0 | 0/0 | 0 | — |
| ✅ | `docs/reports/graphify-projection-blocker-deep-audit-20260929/live-after-symbol-50` | 90 | 1 | 402 | 0 | 0/0 | 0 | — |
| ✅ | `docs/reports/graphify-projection-blocker-deep-audit-20260929/live-after-symbol-500` | 90 | 1 | 402 | 0 | 0/0 | 0 | — |
| ✅ | `docs/reports/graphify-projection-blocker-deep-audit-20260929/live-identity-cohort-audit` | 90 | 1 | 402 | 0 | 0/0 | 0 | — |
| ✅ | `docs/reports/graphify-projection-blocker-deep-audit-20260929/live-identity-cohort-audit-v2` | 90 | 1 | 402 | 0 | 0/0 | 0 | — |
| ✅ | `docs/reports/graphify-projection-blocker-deep-audit-20260929/live-refresh` | 90 | 1 | 394 | 0 | 0/0 | 0 | — |
| ✅ | `docs/reports/graphify-projection-blocker-deep-audit-20260929/live-refresh-after-symbol-canary-2` | 90 | 1 | 394 | 0 | 0/0 | 0 | — |
| ✅ | `docs/reports/graphify-projection-blocker-deep-audit-20260929/live-refresh-current` | 90 | 1 | 402 | 0 | 0/0 | 0 | — |
| ✅ | `docs/reports/graphify-symbol-baseline-report-1790785706923` | 90 | 2 | 86982 | 0 | 0/0 | 0 | — |
| ✅ | `docs/reports/graphify-workflow` | 90 | 1 | 24 | 0 | 0/0 | 0 | — |
| ✅ | `docs/reports/graphify_928-audit` | 90 | 1 | 360 | 0 | 0/0 | 0 | — |
| ✅ | `docs/reports/graphify_928-audit-cache` | 90 | 1 | 367 | 0 | 0/0 | 0 | — |
| ✅ | `docs/reports/graphify_928-audit-live-20260929T` | 90 | 1 | 381 | 0 | 0/0 | 0 | — |
| ✅ | `docs/reports/graphify_928-audit-live-ace-store-fix` | 90 | 1 | 381 | 0 | 0/0 | 0 | — |
| ✅ | `docs/reports/graphify_928-audit-scoped` | 90 | 1 | 365 | 0 | 0/0 | 0 | — |
| ✅ | `docs/reports/openspec-evidence` | 90 | 23 | 67381039 | 0 | 0/0 | 0 | — |
| ✅ | `docs/reports/openspec-evidence/20261001170333076-b45a8aca0bd7` | 90 | 2 | 91798 | 0 | 0/0 | 0 | — |
| ✅ | `docs/reports/openspec-evidence/20261001173816702-b45a8aca0bd7` | 90 | 2 | 92438 | 0 | 0/0 | 0 | — |
| ✅ | `docs/reports/openspec-evidence/20261001174451244-b45a8aca0bd7` | 90 | 2 | 91563 | 0 | 0/0 | 0 | — |
| ✅ | `docs/reports/openspec-evidence/20261015193714990-cd8858b116da` | 90 | 4 | 2514831 | 0 | 0/0 | 0 | — |
| ✅ | `docs/reports/openspec-evidence/ace-assembler-behavior-1791572399962-b06523a64d7a` | 90 | 1 | 124 | 0 | 0/0 | 0 | — |
| ✅ | `docs/reports/openspec-evidence/ace-assembler-behavior-1791572465347-b3f95c01ee66` | 90 | 1 | 124 | 0 | 0/0 | 0 | — |
| ✅ | `docs/reports/openspec-evidence/ace-assembler-behavior-1791572562650-b3f95c01ee66` | 90 | 1 | 146 | 0 | 0/0 | 0 | — |
| ✅ | `docs/reports/openspec-evidence/ace-assembler-behavior-1791573283770-1512b3f38919` | 90 | 1 | 146 | 0 | 0/0 | 0 | — |
| ✅ | `docs/reports/openspec-evidence/ace-assembler-behavior-1791573604792-015fd4b541b6` | 90 | 1 | 146 | 0 | 0/0 | 0 | — |
| ✅ | `docs/reports/openspec-evidence/ace-assembler-behavior-1791577888959-c8a30fd2f6bc` | 90 | 1 | 146 | 0 | 0/0 | 0 | — |
| ✅ | `docs/reports/openspec-evidence/ace-assembler-behavior-1791578022963-a9186fcddb6c` | 90 | 1 | 146 | 0 | 0/0 | 0 | — |
| ✅ | `docs/reports/openspec-evidence/ace-assembler-behavior-1791578112708-e8dda1daaef1` | 90 | 1 | 146 | 0 | 0/0 | 0 | — |
| ✅ | `docs/reports/openspec-evidence/ace-assembler-behavior-1791578205398-4e83a6a75ced` | 90 | 1 | 146 | 0 | 0/0 | 0 | — |
| ✅ | `docs/reports/openspec-evidence/ace-assembler-behavior-1791583036211-ed3d48750357` | 90 | 1 | 146 | 0 | 0/0 | 0 | — |
| ✅ | `docs/reports/openspec-evidence/ace-assembler-behavior-1791583387199-e11249230043` | 90 | 1 | 146 | 0 | 0/0 | 0 | — |
| ✅ | `docs/reports/openspec-evidence/ace-assembler-behavior-1791584001793-5241e11b23b3` | 90 | 1 | 146 | 0 | 0/0 | 0 | — |
| ✅ | `docs/reports/openspec-evidence/ace-assembler-behavior-1791584100925-cadcdc3d2483` | 90 | 1 | 146 | 0 | 0/0 | 0 | — |
| ✅ | `docs/reports/openspec-evidence/ace-assembler-behavior-1791585307648-3f14cefe7fe9` | 90 | 1 | 146 | 0 | 0/0 | 0 | — |
| ✅ | `docs/reports/openspec-evidence/ace-assembler-behavior-1791585377280-593612d526dc` | 90 | 1 | 146 | 0 | 0/0 | 0 | — |
| ✅ | `docs/reports/openspec-evidence/ace-assembler-behavior-1791585497490-6e09ac835908` | 90 | 1 | 146 | 0 | 0/0 | 0 | — |
| ✅ | `docs/reports/openspec-evidence/ace-assembler-behavior-1791585589489-7dee92300cb5` | 90 | 1 | 146 | 0 | 0/0 | 0 | — |
| ✅ | `docs/reports/openspec-evidence/ace-assembler-behavior-1791585851163-2ff9314c5e89` | 90 | 1 | 146 | 0 | 0/0 | 0 | — |
| ✅ | `docs/reports/openspec-evidence/ace-assembler-behavior-1791585905928-9a8e9a7f7eeb` | 90 | 1 | 146 | 0 | 0/0 | 0 | — |
| ✅ | `docs/reports/openspec-evidence/ace-assembler-behavior-1791586250984-a48553093b2f` | 90 | 1 | 146 | 0 | 0/0 | 0 | — |
| ✅ | `docs/reports/openspec-evidence/ace-assembler-behavior-1791586467561-91d7b6592ab9` | 90 | 1 | 146 | 0 | 0/0 | 0 | — |
| ✅ | `docs/reports/openspec-evidence/ace-assembler-behavior-1791586583032-e7d895f1850e` | 90 | 1 | 146 | 0 | 0/0 | 0 | — |
| ✅ | `docs/reports/openspec-evidence/ace-assembler-behavior-1791586894694-0825c5526b65` | 90 | 1 | 146 | 0 | 0/0 | 0 | — |
| ✅ | `docs/reports/openspec-evidence/ace-assembler-behavior-1791587216539-83291a5a0a1b` | 90 | 1 | 146 | 0 | 0/0 | 0 | — |
| ✅ | `docs/reports/openspec-evidence/ace-assembler-behavior-1791587328222-f6ada210b408` | 90 | 1 | 146 | 0 | 0/0 | 0 | — |
| ✅ | `docs/reports/openspec-evidence/ace-assembler-behavior-1791587526210-0a97e65fdb53` | 90 | 1 | 146 | 0 | 0/0 | 0 | — |
| ✅ | `docs/reports/openspec-evidence/ace-assembler-behavior-1791594524265-47c3925e29d1` | 90 | 1 | 146 | 0 | 0/0 | 0 | — |
| ✅ | `docs/reports/openspec-evidence/ace-assembler-behavior-1791596255962-fc27a68f4a0c` | 90 | 1 | 146 | 0 | 0/0 | 0 | — |
| ✅ | `docs/reports/openspec-evidence/ace-assembler-behavior-1791596322982-a58dbdd44052` | 90 | 1 | 146 | 0 | 0/0 | 0 | — |
| ✅ | `docs/reports/openspec-evidence/ace-assembler-behavior-1791597439239-4a614b88d471` | 90 | 1 | 146 | 0 | 0/0 | 0 | — |
| ✅ | `docs/reports/openspec-evidence/ace-assembler-behavior-1791597557226-f738ff121b2c` | 90 | 1 | 146 | 0 | 0/0 | 0 | — |
| ✅ | `docs/reports/openspec-evidence/ace-assembler-behavior-1791598070941-b1fec9d6bbd7` | 90 | 1 | 146 | 0 | 0/0 | 0 | — |
| ✅ | `docs/reports/openspec-evidence/ace-assembler-behavior-1791598155303-8e32aa57c6bc` | 90 | 1 | 146 | 0 | 0/0 | 0 | — |
| ✅ | `docs/reports/openspec-evidence/ace-assembler-behavior-1791598313669-23d7bba2afc3` | 90 | 1 | 146 | 0 | 0/0 | 0 | — |
| ✅ | `docs/reports/openspec-evidence/ace-assembler-behavior-1791598586874-a445d652e531` | 90 | 1 | 146 | 0 | 0/0 | 0 | — |
| ✅ | `docs/reports/openspec-evidence/ace-assembler-behavior-1791599177523-4067f1fb6df1` | 90 | 1 | 146 | 0 | 0/0 | 0 | — |
| ✅ | `docs/reports/openspec-evidence/ace-assembler-behavior-1791599300022-2b55c1786a0d` | 90 | 1 | 146 | 0 | 0/0 | 0 | — |
| ✅ | `docs/reports/openspec-evidence/ace-assembler-behavior-1791599353398-b1c9b9921b96` | 90 | 1 | 146 | 0 | 0/0 | 0 | — |
| ✅ | `docs/reports/openspec-evidence/ace-assembler-behavior-1791599590698-b189484b0f99` | 90 | 1 | 146 | 0 | 0/0 | 0 | — |
| ✅ | `docs/reports/openspec-evidence/ace-assembler-behavior-1791599698390-1b36f70b048a` | 90 | 1 | 146 | 0 | 0/0 | 0 | — |
| ✅ | `docs/reports/openspec-evidence/ace-assembler-behavior-1791599875917-072dc8e9f637` | 90 | 1 | 146 | 0 | 0/0 | 0 | — |
| ✅ | `docs/reports/openspec-evidence/ace-assembler-behavior-1791599986099-cee8fd6814a5` | 90 | 1 | 146 | 0 | 0/0 | 0 | — |
| ✅ | `docs/reports/openspec-evidence/ace-assembler-behavior-1791600214026-b06004539f01` | 90 | 1 | 146 | 0 | 0/0 | 0 | — |
| ✅ | `docs/reports/openspec-evidence/ace-assembler-behavior-1791600408705-40fb6dd04861` | 90 | 1 | 146 | 0 | 0/0 | 0 | — |
| ✅ | `docs/reports/openspec-evidence/ace-assembler-behavior-1791600451095-01c73db04039` | 90 | 1 | 146 | 0 | 0/0 | 0 | — |
| ✅ | `docs/reports/openspec-evidence/ace-assembler-behavior-1791600693503-476028c5f72f` | 90 | 1 | 146 | 0 | 0/0 | 0 | — |
| ✅ | `docs/reports/openspec-evidence/ace-assembler-behavior-1791600731049-1cf40604a7f2` | 90 | 1 | 146 | 0 | 0/0 | 0 | — |
| ✅ | `docs/reports/openspec-evidence/ace-assembler-behavior-1791600844371-6a0505a4dd03` | 90 | 1 | 146 | 0 | 0/0 | 0 | — |
| ✅ | `docs/reports/openspec-evidence/ace-assembler-behavior-1791601133084-fe00a9b7ddba` | 90 | 1 | 146 | 0 | 0/0 | 0 | — |
| ✅ | `docs/reports/openspec-evidence/ace-assembler-behavior-1791601229580-82130f65254f` | 90 | 1 | 146 | 0 | 0/0 | 0 | — |
| ✅ | `docs/reports/openspec-evidence/ace-assembler-behavior-1791601281234-dd636aa85485` | 90 | 1 | 146 | 0 | 0/0 | 0 | — |
| ✅ | `docs/reports/openspec-evidence/ace-assembler-behavior-1791601312720-1ae2a92daf8a` | 90 | 1 | 146 | 0 | 0/0 | 0 | — |
| ✅ | `docs/reports/openspec-evidence/ace-assembler-behavior-1791601986851-f357b6421d62` | 90 | 1 | 146 | 0 | 0/0 | 0 | — |
| ✅ | `docs/reports/openspec-evidence/ace-assembler-behavior-1791602153461-a937ae55392d` | 90 | 1 | 146 | 0 | 0/0 | 0 | — |
| ✅ | `docs/reports/openspec-evidence/ace-assembler-behavior-1791602446394-3934ad828085` | 90 | 1 | 146 | 0 | 0/0 | 0 | — |
| ✅ | `docs/reports/openspec-evidence/ace-assembler-behavior-1791705900566-03e03901575c` | 90 | 1 | 146 | 0 | 0/0 | 0 | — |
| ✅ | `docs/reports/openspec-evidence/ace-assembler-behavior-1791706447416-354fcc799d04` | 90 | 1 | 146 | 0 | 0/0 | 0 | — |
| ✅ | `docs/reports/openspec-evidence/ace-assembler-behavior-1791706509329-cf0e7f095015` | 90 | 1 | 146 | 0 | 0/0 | 0 | — |
| ✅ | `docs/reports/openspec-evidence/ace-assembler-behavior-1791706798305-321656e3172a` | 90 | 1 | 146 | 0 | 0/0 | 0 | — |
| ✅ | `docs/reports/openspec-evidence/ace-assembler-behavior-1791706848746-7679077f3df2` | 90 | 1 | 146 | 0 | 0/0 | 0 | — |
| ✅ | `docs/reports/openspec-evidence/ace-assembler-behavior-1791706889489-54f20b6a9235` | 90 | 1 | 146 | 0 | 0/0 | 0 | — |
| ✅ | `docs/reports/openspec-evidence/ace-assembler-behavior-1791706935462-5e3363b83cb7` | 90 | 1 | 146 | 0 | 0/0 | 0 | — |
| ✅ | `docs/reports/openspec-evidence/ace-assembler-behavior-1791708869481-88deb9748834` | 90 | 1 | 146 | 0 | 0/0 | 0 | — |
| ✅ | `docs/reports/openspec-evidence/ace-assembler-behavior-1791709019870-4a12c5e9dc94` | 90 | 1 | 146 | 0 | 0/0 | 0 | — |
| ✅ | `docs/reports/openspec-evidence/ace-assembler-behavior-1791709079400-fed1679481a7` | 90 | 1 | 146 | 0 | 0/0 | 0 | — |
| ✅ | `docs/reports/openspec-evidence/ace-assembler-behavior-1791709242327-8a52ad1f17a5` | 90 | 1 | 146 | 0 | 0/0 | 0 | — |
| ✅ | `docs/reports/openspec-evidence/ace-assembler-behavior-1791709547725-4c4a017d1824` | 90 | 1 | 146 | 0 | 0/0 | 0 | — |
| ✅ | `docs/reports/openspec-evidence/ace-assembler-behavior-1791709982237-86b4d9d17ec4` | 90 | 1 | 146 | 0 | 0/0 | 0 | — |
| ✅ | `docs/reports/openspec-evidence/ace-assembler-behavior-1791710227363-27c7750d14bf` | 90 | 1 | 146 | 0 | 0/0 | 0 | — |
| ✅ | `docs/reports/openspec-evidence/ace-assembler-behavior-1791710866729-3db2dda03300` | 90 | 1 | 146 | 0 | 0/0 | 0 | — |
| ✅ | `docs/reports/openspec-evidence/ace-assembler-behavior-1791711007357-88aee9607b92` | 90 | 1 | 146 | 0 | 0/0 | 0 | — |
| ✅ | `docs/reports/openspec-evidence/ace-assembler-behavior-1791711486052-c6d960fc18e2` | 90 | 1 | 146 | 0 | 0/0 | 0 | — |
| ✅ | `docs/reports/openspec-evidence/ace-assembler-behavior-1791711828223-8f1673f19d82` | 90 | 1 | 146 | 0 | 0/0 | 0 | — |
| ✅ | `docs/reports/openspec-evidence/ace-assembler-behavior-1791711978487-4e5e5cfc7815` | 90 | 1 | 146 | 0 | 0/0 | 0 | — |
| ✅ | `docs/reports/openspec-evidence/ace-assembler-behavior-1791712285876-4cb0196811a8` | 90 | 1 | 146 | 0 | 0/0 | 0 | — |
| ✅ | `docs/reports/openspec-evidence/ace-assembler-behavior-1791712409911-49d5f5d75eb5` | 90 | 1 | 146 | 0 | 0/0 | 0 | — |
| ✅ | `docs/reports/openspec-evidence/ace-assembler-behavior-1791712754936-8c6d8138590f` | 90 | 1 | 146 | 0 | 0/0 | 0 | — |
| ✅ | `docs/reports/openspec-evidence/ace-assembler-behavior-1791713067066-b5737deb2003` | 90 | 1 | 146 | 0 | 0/0 | 0 | — |
| ✅ | `docs/reports/openspec-evidence/ace-assembler-behavior-1791713211509-fb48120b17fc` | 90 | 1 | 146 | 0 | 0/0 | 0 | — |
| ✅ | `docs/reports/openspec-evidence/ace-assembler-behavior-1791739015881-670286dcea17` | 90 | 1 | 146 | 0 | 0/0 | 0 | — |
| ✅ | `docs/reports/openspec-evidence/ace-assembler-behavior-1791739104897-801d4a9387be` | 90 | 1 | 146 | 0 | 0/0 | 0 | — |
| ✅ | `docs/reports/openspec-evidence/current-reconciliation-20261002` | 90 | 1 | 435 | 0 | 0/0 | 0 | — |
| ✅ | `docs/reports/openspec-evidence/current-reconciliation-20261002-r2` | 90 | 1 | 435 | 0 | 0/0 | 0 | — |
| ✅ | `docs/reports/openspec-evidence/current-reconciliation-20261002-r3` | 90 | 1 | 435 | 0 | 0/0 | 0 | — |
| ✅ | `docs/reports/openspec-evidence/current-reconciliation-20261002-r4` | 90 | 1 | 435 | 0 | 0/0 | 0 | — |
| ✅ | `docs/reports/openspec-evidence/current-reconciliation-20261002-r5` | 90 | 1 | 435 | 0 | 0/0 | 0 | — |
| ✅ | `docs/reports/openspec-evidence/current-reconciliation-20261002-r6` | 90 | 1 | 435 | 0 | 0/0 | 0 | — |
| ✅ | `docs/reports/openspec-evidence/current-reconciliation-20261002-r7` | 90 | 1 | 435 | 0 | 0/0 | 0 | — |
| ✅ | `docs/reports/openspec-evidence/followup-20261001-9f4d993d` | 90 | 3 | 142 | 0 | 0/0 | 0 | — |
| ✅ | `docs/reports/openspec-evidence/followup-20261001-9f4d993d-idblock-v2` | 90 | 2 | 137 | 0 | 0/0 | 0 | — |
| ✅ | `docs/reports/openspec-evidence/followup-20261001-9f4d993d-idblock-v3` | 90 | 2 | 137 | 0 | 0/0 | 0 | — |
| ✅ | `docs/reports/openspec-evidence/followup-20261001-b45a8aca` | 90 | 11 | 709 | 0 | 0/0 | 0 | — |
| ✅ | `docs/reports/openspec-evidence/gs1-10-1790893329085-8968abd86620` | 90 | 2 | 191 | 0 | 0/0 | 0 | — |
| ✅ | `docs/reports/openspec-evidence/gs1-10-current-20261008` | 90 | 2 | 192 | 0 | 0/0 | 0 | — |
| ✅ | `docs/reports/openspec-evidence/gs1-10-current-after-evidence-ledger-20261008` | 90 | 2 | 192 | 0 | 0/0 | 0 | — |
| ✅ | `docs/reports/openspec-evidence/gs1-10-goal-20261009a` | 90 | 2 | 192 | 0 | 0/0 | 0 | — |
| ✅ | `docs/reports/openspec-evidence/gs1-10-goal-20261009b` | 90 | 2 | 192 | 0 | 0/0 | 0 | — |
| ✅ | `docs/reports/openspec-evidence/nlp-symbol-span-1791569700906-9dfc88fe7982` | 90 | 2 | 123 | 0 | 0/0 | 0 | — |
| ✅ | `docs/reports/openspec-evidence/nlp-symbol-span-1791569826412-e5b004021949` | 90 | 2 | 123 | 0 | 0/0 | 0 | — |
| ✅ | `docs/reports/openspec-evidence/nlp-symbol-span-1791569999312-2925c717f1b9` | 90 | 2 | 123 | 0 | 0/0 | 0 | — |
| ✅ | `docs/reports/openspec-evidence/nlp-symbol-span-1791570138494-e710967ffd95` | 90 | 2 | 123 | 0 | 0/0 | 0 | — |
| ✅ | `docs/reports/openspec-evidence/nlp-symbol-span-1791570230981-0e4fe2d41536` | 90 | 2 | 123 | 0 | 0/0 | 0 | — |
| ✅ | `docs/reports/openspec-evidence/nlp-symbol-span-1791570554835-94a9e3e37549` | 90 | 2 | 123 | 0 | 0/0 | 0 | — |
| ✅ | `docs/reports/openspec-evidence/pipeline-20261001175638253-23548` | 90 | 2 | 91563 | 0 | 0/0 | 0 | — |
| ✅ | `docs/reports/openspec-evidence/pipeline-20261001180038825-10060` | 90 | 2 | 91563 | 0 | 0/0 | 0 | — |
| ✅ | `docs/reports/openspec-evidence/pipeline-20261001180213625-38192` | 90 | 2 | 91563 | 0 | 0/0 | 0 | — |
| ✅ | `docs/reports/openspec-evidence/pipeline-20261001180307615-61080` | 90 | 2 | 91563 | 0 | 0/0 | 0 | — |
| ✅ | `docs/reports/openspec-evidence/pipeline-20261001181825826-42108` | 90 | 2 | 91563 | 0 | 0/0 | 0 | — |
| ✅ | `docs/reports/openspec-evidence/pipeline-20261001182712088-2460` | 90 | 2 | 91290 | 0 | 0/0 | 0 | — |
| ✅ | `docs/reports/openspec-evidence/pipeline-20261001183112014-55360` | 90 | 2 | 91310 | 0 | 0/0 | 0 | — |
| ✅ | `docs/reports/openspec-evidence/pipeline-20261001183311550-43416` | 90 | 2 | 91310 | 0 | 0/0 | 0 | — |
| ✅ | `docs/reports/openspec-evidence/pipeline-20261001184222203-33888` | 90 | 2 | 91310 | 0 | 0/0 | 0 | — |
| ✅ | `docs/reports/openspec-evidence/pipeline-20261001184822504-14884` | 90 | 2 | 91310 | 0 | 0/0 | 0 | — |
| ✅ | `docs/reports/openspec-evidence/pipeline-20261001185057972-36556` | 90 | 2 | 91310 | 0 | 0/0 | 0 | — |
| ✅ | `docs/reports/openspec-evidence/pipeline-20261001185752038-9880` | 90 | 2 | 91310 | 0 | 0/0 | 0 | — |
| ✅ | `docs/reports/openspec-evidence/pipeline-20261001190220947-21412` | 90 | 2 | 91310 | 0 | 0/0 | 0 | — |
| ✅ | `docs/reports/openspec-evidence/pipeline-20261001190604633-55656` | 90 | 2 | 91310 | 0 | 0/0 | 0 | — |
| ✅ | `docs/reports/openspec-evidence/pipeline-20261001191119618-50632` | 90 | 2 | 91352 | 0 | 0/0 | 0 | — |
| ✅ | `docs/reports/openspec-evidence/pipeline-20261001191332948-29440` | 90 | 2 | 91310 | 0 | 0/0 | 0 | — |
| ✅ | `docs/reports/openspec-evidence/pipeline-20261001191958283-48412` | 90 | 2 | 91427 | 0 | 0/0 | 0 | — |
| ✅ | `docs/reports/openspec-evidence/pipeline-20261001192714392-56932` | 90 | 2 | 91427 | 0 | 0/0 | 0 | — |
| ✅ | `docs/reports/openspec-evidence/pipeline-20261001193002197-5384` | 90 | 2 | 92012 | 0 | 0/0 | 0 | — |
| ✅ | `docs/reports/openspec-evidence/pipeline-20261001195620747-13108` | 90 | 2 | 92012 | 0 | 0/0 | 0 | — |
| ✅ | `docs/reports/openspec-evidence/pipeline-20261001200315567-2860` | 90 | 2 | 92032 | 0 | 0/0 | 0 | — |
| ✅ | `docs/reports/openspec-evidence/pipeline-20261001200947742-17308` | 90 | 2 | 91741 | 0 | 0/0 | 0 | — |
| ✅ | `docs/reports/openspec-evidence/pipeline-20261001201937250-44228` | 90 | 2 | 91741 | 0 | 0/0 | 0 | — |
| ✅ | `docs/reports/openspec-evidence/pipeline-20261001210012888-15556` | 90 | 2 | 91741 | 0 | 0/0 | 0 | — |
| ✅ | `docs/reports/openspec-evidence/pipeline-20261001212600524-9f4d993d48f2` | 90 | 2 | 91739 | 0 | 0/0 | 0 | — |
| ✅ | `docs/reports/openspec-evidence/pipeline-20261001224808608-50892` | 90 | 4 | 3394 | 0 | 0/0 | 0 | — |
| ✅ | `docs/reports/openspec-evidence/pipeline-20261001224952905-31792` | 90 | 6 | 16731 | 0 | 0/0 | 0 | — |
| ✅ | `docs/reports/openspec-evidence/pipeline-20261001225204696-25348` | 90 | 8 | 16983 | 0 | 0/0 | 0 | — |
| ✅ | `docs/reports/openspec-evidence/pipeline-20261001232010241-12376` | 90 | 8 | 17039 | 0 | 0/0 | 0 | — |
| ✅ | `docs/reports/openspec-evidence/pipeline-20261001232949546-30860` | 90 | 10 | 18168 | 0 | 0/0 | 0 | — |
| ✅ | `docs/reports/openspec-evidence/pipeline-20261001233309503-2960` | 90 | 10 | 18208 | 0 | 0/0 | 0 | — |
| ✅ | `docs/reports/openspec-evidence/pipeline-20261001234154797-4820` | 90 | 11 | 18451 | 0 | 0/0 | 0 | — |
| ✅ | `docs/reports/openspec-evidence/pipeline-20261001234832307-44308` | 90 | 11 | 18459 | 0 | 0/0 | 0 | — |
| ✅ | `docs/reports/openspec-evidence/pipeline-20261001235234200-25880` | 90 | 13 | 18771 | 0 | 0/0 | 0 | — |
| ✅ | `docs/reports/openspec-evidence/pipeline-20261001235818170-44112` | 90 | 13 | 18824 | 0 | 0/0 | 0 | — |
| ✅ | `docs/reports/openspec-evidence/pipeline-20261002031606139-7352` | 90 | 13 | 18896 | 0 | 0/0 | 0 | — |
| ✅ | `docs/reports/openspec-evidence/pipeline-20261002041056514-23308` | 90 | 13 | 18960 | 0 | 0/0 | 0 | — |
| ✅ | `docs/reports/openspec-evidence/pipeline-20261002042046122-21560` | 90 | 13 | 19024 | 0 | 0/0 | 0 | — |
| ✅ | `docs/reports/openspec-evidence/pipeline-20261002044610126-60936` | 90 | 13 | 19088 | 0 | 0/0 | 0 | — |
| ✅ | `docs/reports/openspec-evidence/pipeline-20261002175348361-48448` | 90 | 13 | 19152 | 0 | 0/0 | 0 | — |
| ✅ | `docs/reports/openspec-evidence/pipeline-20261002180747691-56888` | 90 | 13 | 19204 | 0 | 0/0 | 0 | — |
| ✅ | `docs/reports/openspec-evidence/pipeline-20261002182608302-30652` | 90 | 13 | 19256 | 0 | 0/0 | 0 | — |
| ✅ | `docs/reports/openspec-evidence/pipeline-20261002183455662-8848` | 90 | 13 | 19308 | 0 | 0/0 | 0 | — |
| ✅ | `docs/reports/openspec-evidence/pipeline-20261002184726519-30032` | 90 | 13 | 19360 | 0 | 0/0 | 0 | — |
| ✅ | `docs/reports/openspec-evidence/pipeline-20261002185249362-62020` | 90 | 13 | 19412 | 0 | 0/0 | 0 | — |
| ✅ | `docs/reports/openspec-evidence/pipeline-20261002185700370-28172` | 90 | 13 | 19464 | 0 | 0/0 | 0 | — |
| ✅ | `docs/reports/openspec-evidence/pipeline-20261002233841677-13108` | 90 | 13 | 19615 | 0 | 0/0 | 0 | — |
| ✅ | `docs/reports/openspec-evidence/pipeline-20261002234848998-17184` | 90 | 13 | 19667 | 0 | 0/0 | 0 | — |
| ✅ | `docs/reports/openspec-evidence/pipeline-20261003000036157-47868` | 90 | 18 | 2943673 | 0 | 0/0 | 0 | — |
| ✅ | `docs/reports/openspec-evidence/pipeline-20261003002738225-54844` | 90 | 18 | 2944612 | 0 | 0/0 | 0 | — |
| ✅ | `docs/reports/openspec-evidence/pipeline-20261003004045185-40612` | 90 | 18 | 2945136 | 0 | 0/0 | 0 | — |
| ✅ | `docs/reports/openspec-evidence/pipeline-20261003013051018-30232` | 90 | 18 | 2946352 | 0 | 0/0 | 0 | — |
| ✅ | `docs/reports/openspec-evidence/pipeline-20261003014918714-3344` | 90 | 18 | 2946876 | 0 | 0/0 | 0 | — |
| ✅ | `docs/reports/openspec-evidence/pipeline-20261003020401049-13256` | 90 | 18 | 2947400 | 0 | 0/0 | 0 | — |
| ✅ | `docs/reports/openspec-evidence/pipeline-20261003020840635-41136` | 90 | 14 | 2940757 | 0 | 0/0 | 0 | — |
| ✅ | `docs/reports/openspec-evidence/pipeline-20261003021055537-29096` | 90 | 19 | 2943646 | 0 | 0/0 | 0 | — |
| ✅ | `docs/reports/openspec-evidence/pipeline-20261003022429579-61740` | 90 | 21 | 3479019 | 0 | 0/0 | 0 | — |
| ✅ | `docs/reports/openspec-evidence/pipeline-20261003022758395-22872` | 90 | 21 | 3479345 | 0 | 0/0 | 0 | — |
| ✅ | `docs/reports/openspec-evidence/pipeline-20261003025714297-46572` | 90 | 21 | 3481612 | 0 | 0/0 | 0 | — |
| ✅ | `docs/reports/openspec-evidence/pipeline-20261003030938485-58344` | 90 | 21 | 3481969 | 0 | 0/0 | 0 | — |
| ✅ | `docs/reports/openspec-evidence/pipeline-20261003032303421-52364` | 90 | 21 | 3482324 | 0 | 0/0 | 0 | — |
| ✅ | `docs/reports/openspec-evidence/pipeline-20261003032721079-55200` | 90 | 21 | 3482650 | 0 | 0/0 | 0 | — |
| ✅ | `docs/reports/openspec-evidence/pipeline-20261003035756399-19156` | 90 | 21 | 3482992 | 0 | 0/0 | 0 | — |
| ✅ | `docs/reports/openspec-evidence/pipeline-20261003040356046-47360` | 90 | 21 | 3483318 | 0 | 0/0 | 0 | — |
| ✅ | `docs/reports/openspec-evidence/pipeline-20261003044903838-24208` | 90 | 21 | 3483644 | 0 | 0/0 | 0 | — |
| ✅ | `docs/reports/openspec-evidence/pipeline-20261003045614698-40368` | 90 | 22 | 3484212 | 0 | 0/0 | 0 | — |
| ✅ | `docs/reports/openspec-evidence/pipeline-20261003045919683-49160` | 90 | 22 | 3484538 | 0 | 0/0 | 0 | — |
| ✅ | `docs/reports/openspec-evidence/pipeline-attempt-20261003T0129Z` | 90 | 1 | 435 | 0 | 0/0 | 0 | — |
| ✅ | `docs/reports/ordinal-map-readback-20261016` | 90 | 1 | 411 | 0 | 0/0 | 0 | — |
| ✅ | `docs/reports/packet-admission-v1/16ff03a9fa23ad31fcae3753089e0eda20000b79a183c1b3f13efc40b9e94c21` | 90 | 6 | 107257 | 0 | 0/0 | 0 | — |
| ✅ | `docs/reports/packet-admission-v1/64122168e998c85c3ac0bd6a97621cd090a7a94938f9029699d584884a1b61da` | 90 | 6 | 106673 | 0 | 0/0 | 0 | — |
| ✅ | `docs/reports/packet-admission-v1/bf302e0b656d28c009e73842b628ea76a084464f1bdc51b1fdadac237edf6b03` | 90 | 2 | 39 | 0 | 0/0 | 0 | — |
| ✅ | `docs/reports/packet-key-v2-admission-v1/14b73680764a86af143b602043f59aa0dac4630cce934dcfff94ee72e655cdad` | 90 | 5 | 10 | 0 | 0/0 | 0 | — |
| ✅ | `docs/reports/packet-key-v2-admission-v1/6d8fc6e36d36d9de3c70868671a47b37dde3dfd07319bb2a99c628a901069f6a` | 90 | 5 | 10 | 0 | 0/0 | 0 | — |
| ✅ | `docs/reports/packet-source-revision-repair-v1/298539da60fa7bb6feedacbc12835c7d9e2d36487d81749cd347c2cf60c7dc91` | 90 | 1 | 32 | 0 | 0/0 | 0 | — |
| ✅ | `docs/reports/packet-source-revision-repair-v1/9d329c88275df8a78a0f8ceeeabe0b490493cc953fe0bc65b142e68d2038fb0c` | 90 | 1 | 38 | 0 | 0/0 | 0 | — |
| ✅ | `docs/reports/packet-source-revision-repair-v1/bcb44c72d3cb2232e4068c8543c6bcb6aeb229c32f7afc31bba8075c148ab1eb` | 90 | 1 | 38 | 0 | 0/0 | 0 | — |
| ✅ | `docs/reports/packet-source-revision-repair-v1/e254d42d4bf7b285351ae7c07e53c55cdb3d56c330f0df0b6bb0479f0c12e4c3` | 90 | 25 | 582334 | 0 | 0/0 | 0 | — |
| ✅ | `docs/reports/parent-atlas` | 90 | 59 | 204380 | 0 | 0/0 | 0 | — |
| ✅ | `docs/reports/proof-of-truth` | 90 | 11 | 543 | 0 | 0/0 | 0 | — |
| ✅ | `docs/reports/replay` | 90 | 40 | 11334 | 0 | 0/0 | 0 | — |
| ✅ | `docs/reports/schema` | 90 | 5 | 172525 | 0 | 0/0 | 0 | — |
| ✅ | `docs/reports/semantic-contracts` | 90 | 2 | 1500 | 0 | 0/0 | 0 | — |
| ✅ | `docs/reports/semantic768` | 90 | 1 | 1 | 0 | 0/0 | 0 | — |
| ✅ | `docs/reports/smoke-tests` | 90 | 15 | 52868 | 0 | 0/0 | 0 | — |
| ✅ | `docs/reports/staging` | 90 | 17 | 17611386 | 0 | 0/0 | 0 | — |
| ✅ | `docs/reports/staging/.execution-controller-12204-1789926671229` | 90 | 7 | 394418 | 0 | 0/0 | 0 | — |
| ✅ | `docs/reports/staging/.execution-controller-1648-1789926362189` | 90 | 7 | 394418 | 0 | 0/0 | 0 | — |
| ✅ | `docs/reports/staging/.execution-controller-19028-1789928784825` | 90 | 7 | 394418 | 0 | 0/0 | 0 | — |
| ✅ | `docs/reports/staging/.execution-controller-19576-1789896573419` | 90 | 7 | 394418 | 0 | 0/0 | 0 | — |
| ✅ | `docs/reports/staging/.execution-controller-26052-1789897564519` | 90 | 7 | 394418 | 0 | 0/0 | 0 | — |
| ✅ | `docs/reports/staging/.execution-controller-26088-1789948900359` | 90 | 7 | 395354 | 0 | 0/0 | 0 | — |
| ✅ | `docs/reports/staging/.execution-controller-26272-1789929216540` | 90 | 7 | 394418 | 0 | 0/0 | 0 | — |
| ✅ | `docs/reports/staging/.execution-controller-26532-1789926925463` | 90 | 7 | 394418 | 0 | 0/0 | 0 | — |
| ✅ | `docs/reports/staging/.execution-controller-32136-1789929415383` | 90 | 7 | 394418 | 0 | 0/0 | 0 | — |
| ✅ | `docs/reports/staging/.execution-controller-34468-1789926158284` | 90 | 7 | 394418 | 0 | 0/0 | 0 | — |
| ✅ | `docs/reports/staging/.execution-controller-35036-1790442393160` | 90 | 7 | 1393275 | 0 | 0/0 | 0 | — |
| ✅ | `docs/reports/staging/.execution-controller-37644-1789896519792` | 90 | 7 | 394418 | 0 | 0/0 | 0 | — |
| ✅ | `docs/reports/staging/.execution-controller-41960-1789896754212` | 90 | 7 | 394418 | 0 | 0/0 | 0 | — |
| ✅ | `docs/reports/staging/.execution-controller-42376-1789897028204` | 90 | 7 | 394418 | 0 | 0/0 | 0 | — |
| ✅ | `docs/reports/staging/.execution-controller-46652-1790442517192` | 90 | 7 | 1393192 | 0 | 0/0 | 0 | — |
| ✅ | `docs/reports/staging/.execution-controller-49052-1789928128198` | 90 | 7 | 394418 | 0 | 0/0 | 0 | — |
| ✅ | `docs/reports/staging/.execution-controller-55472-1789930791188` | 90 | 7 | 394418 | 0 | 0/0 | 0 | — |
| ✅ | `docs/reports/staging/.execution-controller-55884-1789930359099` | 90 | 7 | 394418 | 0 | 0/0 | 0 | — |
| ✅ | `docs/reports/staging/.execution-controller-56008-1789927967742` | 90 | 7 | 394418 | 0 | 0/0 | 0 | — |
| ✅ | `docs/reports/staging/.execution-controller-58364-1790441829402` | 90 | 7 | 1392169 | 0 | 0/0 | 0 | — |
| ✅ | `docs/reports/staging/.execution-controller-58668-1789930548554` | 90 | 7 | 394418 | 0 | 0/0 | 0 | — |
| ✅ | `docs/reports/staging/.execution-controller-58988-1789926158282` | 90 | 7 | 394418 | 0 | 0/0 | 0 | — |
| ✅ | `docs/reports/staging/.execution-controller-60540-1789952754791` | 90 | 7 | 546418 | 0 | 0/0 | 0 | — |
| ✅ | `docs/reports/staging/.execution-controller-61468-1789929634786` | 90 | 7 | 394418 | 0 | 0/0 | 0 | — |
| ✅ | `docs/reports/staging/.execution-controller-62176-1790294934806` | 90 | 7 | 547419 | 0 | 0/0 | 0 | — |
| ✅ | `docs/reports/staging/.execution-controller-8068-1790441553437` | 90 | 7 | 1392169 | 0 | 0/0 | 0 | — |
| ✅ | `docs/reports/staging/.execution-controller-9068-1789896855540` | 90 | 7 | 394418 | 0 | 0/0 | 0 | — |
| ✅ | `docs/reports/staging/openspec-pivot-20260926T1656Z` | 90 | 7 | 1392721 | 0 | 0/0 | 0 | — |
| ✅ | `docs/reports/staging/staging` | 90 | 7 | 394418 | 0 | 0/0 | 0 | — |
| ✅ | `docs/reports/tool-invocation` | 90 | 1 | 50 | 0 | 0/0 | 0 | — |
| ✅ | `docs/reports/vector-lineage` | 90 | 2 | 234 | 0 | 0/0 | 0 | — |
| ✅ | `docs/reports/workspace-source-snapshots` | 90 | 93 | 23102274 | 0 | 0/0 | 0 | — |
| ✅ | `docs/stage1` | 90 | 1 | 25805 | 0 | 0/0 | 0 | — |
| ✅ | `docs/stage4b` | 90 | 1 | 22 | 0 | 0/0 | 0 | — |
| ✅ | `docs/stage5` | 90 | 1 | 118 | 0 | 0/0 | 0 | — |
| ✅ | `docs/vector-governance` | 90 | 3 | 329 | 0 | 0/0 | 0 | — |
| ✅ | `drizzle/meta` | 90 | 4 | 4562 | 0 | 0/0 | 0 | — |
| ✅ | `experiments/atlas-helper-proofs` | 90 | 2 | 2 | 0 | 0/0 | 0 | — |
| ✅ | `llama-cpp-turboquant-gemma4/.gemini` | 90 | 1 | 2 | 0 | 0/0 | 0 | — |
| ✅ | `llama-cpp-turboquant-gemma4/benches/dgx-spark` | 90 | 2 | 2902 | 0 | 0/0 | 0 | — |
| ✅ | `llama-cpp-turboquant-gemma4/docs/backend/snapdragon` | 90 | 1 | 62 | 0 | 0/0 | 0 | — |
| ✅ | `llama-cpp-turboquant-gemma4/examples/gguf-hash/deps` | 90 | 4 | 53 | 0 | 0/0 | 0 | — |
| ✅ | `llama-cpp-turboquant-gemma4/examples/llama.swiftui/llama.swiftui` | 90 | 2 | 21 | 0 | 0/0 | 0 | — |
| ✅ | `llama-cpp-turboquant-gemma4/scripts` | 90 | 1 | 111 | 0 | 0/0 | 0 | — |
| ✅ | `llama-cpp-turboquant-gemma4/tests` | 90 | 1 | 11 | 0 | 0/1 | 0 | — |
| ✅ | `llama-cpp-turboquant-gemma4/tools/server/public` | 90 | 1 | 470 | 0 | 1/1 | 0 | — |
| ✅ | `log/artifacts/phase108d` | 90 | 8 | 287 | 0 | 0/0 | 0 | — |
| ✅ | `log/artifacts/phase109` | 90 | 2 | 2972 | 0 | 0/0 | 0 | — |
| ✅ | `log/artifacts/semantic-contract` | 90 | 10 | 584 | 0 | 0/0 | 0 | — |
| ✅ | `log/artifacts/semantic-embeddings` | 90 | 3 | 98 | 0 | 0/0 | 0 | — |
| ✅ | `mcp-server-mcp/.changeset` | 90 | 1 | 12 | 0 | 0/0 | 0 | — |
| ✅ | `mcp-server-mcp/.claude-plugin` | 90 | 1 | 23 | 0 | 0/0 | 0 | — |
| ✅ | `mcp-server-mcp/.cursor-plugin` | 90 | 1 | 14 | 0 | 0/0 | 0 | — |
| ✅ | `mcp-server-mcp/.vscode` | 90 | 1 | 11 | 0 | 0/0 | 0 | — |
| ✅ | `mcp-server-mcp/apps/mcp-remote` | 90 | 4 | 186 | 0 | 0/0 | 0 | — |
| ✅ | `mcp-server-mcp/apps/mcp-remote/src` | 90 | 6 | 70 | 0 | 0/0 | 0 | — |
| ✅ | `mcp-server-mcp/packages/mcp-server` | 90 | 1 | 3651 | 0 | 0/4 | 0 | — |
| ✅ | `mcp-server-mcp/packages/mcp-server/scripts` | 90 | 2 | 252 | 0 | 0/0 | 0 | — |
| ✅ | `mcp-server-mcp/packages/mcp-server/src` | 90 | 38 | 3355 | 0 | 0/4 | 0 | — |
| ✅ | `mcp-server-mcp/packages/mcp-stdio` | 90 | 5 | 221 | 0 | 0/2 | 0 | — |
| ✅ | `mcp-server-mcp/packages/mcp-stdio/scripts` | 90 | 1 | 15 | 0 | 0/1 | 0 | — |
| ✅ | `mcp-server-mcp/packages/mcp-stdio/src` | 90 | 2 | 75 | 0 | 0/1 | 0 | — |
| ✅ | `mcp-server-mcp/packages/opencode` | 90 | 6 | 581 | 0 | 0/1 | 0 | — |
| ✅ | `mcp-server-mcp/packages/opencode/scripts` | 90 | 1 | 61 | 0 | 0/0 | 0 | — |
| ✅ | `mcp-server-mcp/plugins/claude/svelte` | 90 | 2 | 27 | 0 | 0/0 | 0 | — |
| ✅ | `mcp-server-mcp/plugins/cursor/svelte` | 90 | 2 | 19 | 0 | 0/0 | 0 | — |
| ✅ | `mcp-server-mcp/scripts` | 90 | 7 | 716 | 0 | 0/1 | 0 | — |
| ✅ | `memory/agent-runs` | 90 | 1 | 146 | 0 | 0/0 | 0 | — |
| ✅ | `memory/atlas` | 90 | 1 | 970675 | 0 | 0/0 | 0 | — |
| ✅ | `memory/clusters` | 90 | 2 | 2 | 0 | 0/0 | 0 | — |
| ✅ | `memory/exports` | 90 | 53 | 387935 | 0 | 0/0 | 0 | — |
| ✅ | `memory/exports/atlas` | 90 | 1 | 91651 | 0 | 0/0 | 0 | — |
| ✅ | `memory/exports/parent-atlas` | 90 | 1 | 131565 | 0 | 0/0 | 0 | — |
| ✅ | `memory/graph` | 90 | 1 | 4320 | 0 | 0/0 | 0 | — |
| ✅ | `memory/graphify/deep` | 90 | 1 | 663970 | 0 | 0/0 | 0 | — |
| ✅ | `memory/knowledge` | 90 | 6 | 1441 | 0 | 0/0 | 0 | — |
| ✅ | `memory/manifests` | 90 | 3 | 145 | 0 | 0/0 | 0 | — |
| ✅ | `memory/packets` | 90 | 2 | 181 | 0 | 0/0 | 0 | — |
| ✅ | `memory/reports` | 90 | 1 | 195667 | 0 | 0/0 | 0 | — |
| ✅ | `memory/rewards` | 90 | 5 | 55 | 0 | 0/0 | 0 | — |
| ✅ | `minio-data/.minio.sys` | 90 | 1 | 1 | 0 | 0/0 | 0 | — |
| ✅ | `native/ace-radix-01` | 90 | 1 | 8 | 0 | 0/0 | 0 | — |
| ✅ | `native/atlas_core/napi` | 90 | 1 | 55 | 0 | 0/0 | 0 | — |
| ✅ | `next_steps/active` | 90 | 2 | 464350 | 0 | 0/0 | 0 | — |
| ✅ | `openspec/changes/parent-atlas-prefill-routing-residency-convergence` | 90 | 1 | 81 | 0 | 0/0 | 0 | — |
| ✅ | `openwiki/.claims` | 90 | 1 | 2075 | 0 | 0/0 | 0 | — |
| ✅ | `openwiki/.claims/architecture` | 90 | 3 | 901 | 0 | 0/0 | 0 | — |
| ✅ | `openwiki/.claims/concepts` | 90 | 3 | 713 | 0 | 0/0 | 0 | — |
| ✅ | `openwiki/.claims/evidence` | 90 | 1 | 169 | 0 | 0/0 | 0 | — |
| ✅ | `openwiki/.claims/integrations` | 90 | 1 | 181 | 0 | 0/0 | 0 | — |
| ✅ | `openwiki/.claims/operations` | 90 | 1 | 49 | 0 | 0/0 | 0 | — |
| ✅ | `openwiki/.claims/testing` | 90 | 1 | 31 | 0 | 0/0 | 0 | — |
| ✅ | `packages/atlas` | 90 | 1 | 241 | 0 | 0/0 | 0 | — |
| ✅ | `packages/atlas/contracts` | 90 | 2 | 50 | 0 | 0/0 | 0 | — |
| ✅ | `packages/atlas/lib` | 90 | 2 | 179 | 0 | 0/0 | 0 | — |
| ✅ | `packages/atlas-core/events` | 90 | 1 | 114 | 0 | 0/0 | 0 | — |
| ✅ | `packages/atlas-core/src/events` | 90 | 2 | 393 | 0 | 0/1 | 0 | — |
| ✅ | `packages/atlas-core/src/identity` | 90 | 6 | 533 | 0 | 0/2 | 0 | — |
| ✅ | `packages/atlas-core/src/nats` | 90 | 1 | 140 | 0 | 0/0 | 0 | — |
| ✅ | `packages/atlas-core/src/packet` | 90 | 2 | 141 | 0 | 0/1 | 0 | — |
| ✅ | `packages/atlas-core/src/ranking` | 90 | 1 | 295 | 0 | 0/0 | 0 | — |
| ✅ | `packages/atlas-core/src/telemetry` | 90 | 2 | 406 | 0 | 0/0 | 0 | — |
| ✅ | `packages/atlas-core/src/tools` | 90 | 1 | 255 | 0 | 0/1 | 0 | — |
| ✅ | `packages/atlas-core/src/types` | 90 | 2 | 201 | 0 | 0/2 | 0 | — |
| ✅ | `packages/atlas-duckdb` | 90 | 2 | 2100 | 0 | 0/0 | 0 | — |
| ✅ | `packages/atlas-duckdb/src` | 90 | 12 | 2030 | 0 | 0/0 | 0 | — |
| ✅ | `packages/atlas-orchestrator` | 90 | 2 | 303 | 0 | 0/2 | 0 | — |
| ✅ | `packages/atlas-orchestrator/scripts` | 90 | 1 | 41 | 0 | 0/0 | 0 | — |
| ✅ | `packages/atlas-orchestrator/src/steps` | 90 | 1 | 98 | 0 | 0/1 | 0 | — |
| ✅ | `packages/atlas-orchestrator/src/workflows` | 90 | 1 | 82 | 0 | 0/1 | 0 | — |
| ✅ | `packages/parent-atlas/docs/reports` | 90 | 1 | 126 | 0 | 0/0 | 0 | — |
| ✅ | `packages/parent-atlas/fixtures/structured-value` | 90 | 2 | 68 | 0 | 0/0 | 0 | — |
| ✅ | `packages/parent-atlas/src/adapters` | 90 | 5 | 910 | 0 | 0/2 | 0 | — |
| ✅ | `packages/parent-atlas/src/gates` | 90 | 6 | 316 | 0 | 0/1 | 0 | — |
| ✅ | `packages/parent-atlas-client` | 90 | 3 | 1756 | 0 | 0/2 | 0 | — |
| ✅ | `packages/parent-atlas-client/src` | 90 | 2 | 1247 | 0 | 0/2 | 0 | — |
| ✅ | `packages/parent-atlas-client/src/a2a` | 90 | 1 | 239 | 0 | 0/1 | 0 | — |
| ✅ | `packages/parent-atlas-client/src/grpc` | 90 | 1 | 380 | 0 | 0/0 | 0 | — |
| ✅ | `packages/parent-atlas-client/src/http` | 90 | 1 | 134 | 0 | 0/0 | 0 | — |
| ✅ | `packages/parent-atlas-client/src/mcp` | 90 | 1 | 306 | 0 | 0/1 | 0 | — |
| ✅ | `packages/parent-atlas-client/test` | 90 | 1 | 81 | 0 | 0/0 | 0 | — |
| ✅ | `packages/parent-atlas-core/src/contracts` | 90 | 5 | 400 | 0 | 0/0 | 0 | — |
| ✅ | `packages/parent-atlas-core/src/schemas` | 90 | 2 | 63 | 0 | 0/0 | 0 | — |
| ✅ | `packages/parent-atlas-ingest` | 90 | 2 | 476 | 0 | 0/0 | 0 | — |
| ✅ | `packages/parent-atlas-ingest/src` | 90 | 1 | 420 | 0 | 0/0 | 0 | — |
| ✅ | `packages/parent-atlas-ingest/src/scanner` | 90 | 3 | 406 | 0 | 0/0 | 0 | — |
| ✅ | `packages/parent-atlas-opencode` | 90 | 2 | 82 | 0 | 0/0 | 0 | — |
| ✅ | `packages/parent-atlas-opencode/src` | 90 | 1 | 15 | 0 | 0/0 | 0 | — |
| ✅ | `packages/parent-atlas-retrieval/src/bifrost` | 90 | 9 | 1158 | 0 | 0/2 | 0 | — |
| ✅ | `packages/parent-atlas-retrieval/tests` | 90 | 1 | 1069 | 0 | 0/0 | 0 | — |
| ✅ | `packages/parent-atlas-retrieval/tests/bifrost` | 90 | 5 | 637 | 0 | 0/0 | 0 | — |
| ✅ | `packages/parent-atlas-retrieval/tests/gpu` | 90 | 1 | 75 | 0 | 0/0 | 0 | — |
| ✅ | `packages/parent-atlas-workstation-integration-kit` | 90 | 3 | 594 | 0 | 0/0 | 0 | — |
| ✅ | `packages/parent-atlas-workstation-integration-kit/src` | 90 | 8 | 547 | 0 | 0/0 | 0 | — |
| ✅ | `packages/semantic-contracts` | 90 | 2 | 3069 | 0 | 0/13 | 0 | — |
| ✅ | `packages/semantic-contracts/schemas` | 90 | 7 | 1105 | 0 | 0/0 | 0 | — |
| ✅ | `packages/semantic-contracts/src` | 90 | 17 | 1907 | 0 | 0/13 | 0 | — |
| ✅ | `parent-atlas-ampere-quantization-proof-kit/sveltekit-frontend/src/lib` | 90 | 2 | 335 | 0 | 0/2 | 0 | — |
| ✅ | `parent-atlas-capability-census-v5/src/lib/components` | 90 | 1 | 22 | 0 | 0/0 | 0 | — |
| ✅ | `parent-atlas-capability-census-v5/src/lib/server` | 90 | 1 | 7 | 0 | 0/0 | 0 | — |
| ✅ | `parent-atlas-capability-census-v5/tests` | 90 | 1 | 12 | 0 | 0/0 | 0 | — |
| ✅ | `parent-atlas-gpu-math-bundle/scripts/phase85` | 90 | 2 | 68 | 0 | 0/0 | 0 | — |
| ✅ | `parent-atlas-gpu-math-bundle/sveltekit-frontend/scripts/graphify` | 90 | 3 | 61 | 0 | 0/0 | 0 | — |
| ✅ | `parent-atlas-gpu-math-bundle/sveltekit-frontend/src/lib` | 90 | 2 | 83 | 0 | 0/0 | 0 | — |
| ✅ | `parent-atlas-graph-revision-fix-v1/docs/reports` | 90 | 1 | 23 | 0 | 0/0 | 0 | — |
| ✅ | `parent-atlas-graph-revision-fix-v1/scripts/atlas` | 90 | 1 | 376 | 0 | 0/0 | 0 | — |
| ✅ | `parent-atlas-graph-revision-fix-v1/scripts/atlas/lib` | 90 | 1 | 202 | 0 | 0/0 | 0 | — |
| ✅ | `parent-atlas-graph-revision-fix-v1/sveltekit-frontend/src/lib` | 90 | 2 | 139 | 0 | 0/0 | 0 | — |
| ✅ | `parent-atlas-graph-runtime-enhancement/src/cache` | 90 | 1 | 11 | 0 | 0/0 | 0 | — |
| ✅ | `parent-atlas-graph-runtime-enhancement/src/events` | 90 | 1 | 24 | 0 | 0/0 | 0 | — |
| ✅ | `parent-atlas-graph-runtime-enhancement/src/graph` | 90 | 3 | 96 | 0 | 0/0 | 0 | — |
| ✅ | `parent-atlas-qas-bundle/scripts/atlas/qas` | 90 | 2 | 167 | 0 | 0/1 | 0 | — |
| ✅ | `parent-atlas-qas-bundle/sveltekit-frontend/src/lib` | 90 | 3 | 321 | 0 | 0/0 | 0 | — |
| ✅ | `parent-atlas-rel-01a-current-ontology-cohort/packages/parent-atlas/test` | 90 | 1 | 152 | 0 | 0/0 | 0 | — |
| ✅ | `parent-atlas-rel-01a-current-ontology-cohort/scripts/atlas` | 90 | 1 | 447 | 0 | 0/1 | 0 | — |
| ✅ | `parent-atlas-rel-01a-current-ontology-cohort/scripts/atlas/lib` | 90 | 1 | 166 | 0 | 0/0 | 0 | — |
| ✅ | `parent-atlas-rel-01a3-explicit-alias-review/packages/parent-atlas/test` | 90 | 1 | 64 | 0 | 0/0 | 0 | — |
| ✅ | `parent-atlas-rel-01a3-explicit-alias-review/scripts/atlas` | 90 | 1 | 312 | 0 | 0/1 | 0 | — |
| ✅ | `parent-atlas-rel-01a3-explicit-alias-review/scripts/atlas/lib` | 90 | 1 | 107 | 0 | 0/0 | 0 | — |
| ✅ | `parent-atlas-tensor-residency-integration/examples` | 90 | 3 | 89 | 0 | 0/0 | 0 | — |
| ✅ | `parent-atlas-tensor-residency-integration/sveltekit-frontend/src/lib` | 90 | 22 | 621 | 0 | 0/2 | 0 | — |
| ✅ | `parent-atlas-tensor-residency-integration/sveltekit-frontend/tests/atlas` | 90 | 4 | 58 | 0 | 0/0 | 0 | — |
| ✅ | `parent_atlas_tensor_residency_integration_v2/examples` | 90 | 4 | 109 | 0 | 0/0 | 0 | — |
| ✅ | `parent_atlas_tensor_residency_integration_v2/sveltekit-frontend/src/lib` | 90 | 30 | 837 | 0 | 0/2 | 0 | — |
| ✅ | `parent_atlas_tensor_residency_integration_v2/sveltekit-frontend/tests/atlas` | 90 | 8 | 100 | 0 | 0/0 | 0 | — |
| ✅ | `python/atlas_compute` | 90 | 4 | 224 | 0 | 0/0 | 0 | — |
| ✅ | `python/atlas_compute/gpu_mini_fabric/fixtures` | 90 | 4 | 30 | 0 | 0/0 | 0 | — |
| ✅ | `reports/semantic-contracts` | 90 | 3 | 524 | 0 | 0/0 | 0 | — |
| ✅ | `scratch/index-checkpoints` | 90 | 2 | 196384 | 0 | 0/0 | 0 | — |
| ✅ | `scratch/obsidian_vault/.obsidian/plugins` | 90 | 2 | 59245 | 0 | 1/1 | 0 | — |
| ✅ | `scripts/agents` | 90 | 4 | 234 | 0 | 0/2 | 0 | — |
| ✅ | `scripts/ai-os` | 90 | 6 | 186 | 0 | 0/4 | 0 | — |
| ✅ | `scripts/analysis` | 90 | 8 | 398 | 0 | 0/0 | 0 | — |
| ✅ | `scripts/analysis_reports` | 90 | 24 | 10410 | 0 | 0/0 | 0 | — |
| ✅ | `scripts/atlas/ace-radix-01` | 90 | 14 | 1358 | 0 | 0/2 | 0 | — |
| ✅ | `scripts/atlas/bitfrost-l2-01` | 90 | 2 | 362 | 0 | 0/2 | 0 | — |
| ✅ | `scripts/atlas/fixtures` | 90 | 10 | 292 | 0 | 0/0 | 0 | — |
| ✅ | `scripts/atlas/helpers` | 90 | 12 | 2334 | 0 | 0/6 | 0 | — |
| ✅ | `scripts/atlas/out` | 90 | 8 | 6782 | 0 | 0/0 | 0 | — |
| ✅ | `scripts/atlas/sparse` | 90 | 2 | 610 | 0 | 0/0 | 0 | — |
| ✅ | `scripts/atlas/sparse/lib` | 90 | 4 | 292 | 0 | 0/0 | 0 | — |
| ✅ | `scripts/atlas/taxonomy` | 90 | 8 | 1226 | 0 | 0/2 | 0 | — |
| ✅ | `scripts/bench` | 90 | 4 | 678 | 0 | 0/2 | 0 | — |
| ✅ | `scripts/case_data/_cache` | 90 | 292 | 292 | 0 | 0/0 | 0 | — |
| ✅ | `scripts/consolidate` | 90 | 10 | 2882 | 0 | 0/6 | 0 | — |
| ✅ | `scripts/court_data/constitutions` | 90 | 18 | 2360 | 0 | 0/0 | 0 | — |
| ✅ | `scripts/dev` | 90 | 8 | 690 | 0 | 0/4 | 0 | — |
| ✅ | `scripts/docs-atlas/lib` | 90 | 22 | 1844 | 0 | 0/6 | 0 | — |
| ✅ | `scripts/engram` | 90 | 2 | 8 | 0 | 0/0 | 0 | — |
| ✅ | `scripts/env` | 90 | 2 | 386 | 0 | 0/0 | 0 | — |
| ✅ | `scripts/error-resolution` | 90 | 8 | 10336 | 0 | 0/4 | 0 | — |
| ✅ | `scripts/error-resolution/services` | 90 | 12 | 3876 | 0 | 0/4 | 0 | — |
| ✅ | `scripts/error-resolution/tests` | 90 | 12 | 5436 | 0 | 0/0 | 0 | — |
| ✅ | `scripts/eval/data` | 90 | 2 | 328 | 0 | 0/0 | 0 | — |
| ✅ | `scripts/evals` | 90 | 2 | 800 | 0 | 0/0 | 0 | — |
| ✅ | `scripts/graphify` | 90 | 8 | 2682 | 2 | 0/4 | 0 | — |
| ✅ | `scripts/graphify/stages` | 90 | 4 | 840 | 0 | 0/0 | 0 | — |
| ✅ | `scripts/mapreduce` | 90 | 4 | 176 | 0 | 0/0 | 0 | — |
| ✅ | `scripts/memory/graphify/gds` | 90 | 16 | 573596 | 0 | 0/0 | 0 | — |
| ✅ | `scripts/native` | 90 | 6 | 1676 | 0 | 0/4 | 0 | — |
| ✅ | `scripts/nats` | 90 | 6 | 1350 | 0 | 0/2 | 0 | — |
| ✅ | `scripts/ontology` | 90 | 10 | 1686 | 0 | 0/4 | 0 | — |
| ✅ | `scripts/openspec` | 90 | 2 | 442 | 0 | 0/0 | 0 | — |
| ✅ | `scripts/phase-3d` | 90 | 2 | 348 | 0 | 0/0 | 0 | — |
| ✅ | `scripts/phase-c` | 90 | 8 | 1542 | 0 | 0/0 | 0 | — |
| ✅ | `scripts/phase-d` | 90 | 2 | 510 | 0 | 0/0 | 0 | — |
| ✅ | `scripts/phase-d-plus-1` | 90 | 2 | 472 | 0 | 0/0 | 0 | — |
| ✅ | `scripts/phase-d-plus-2` | 90 | 2 | 444 | 0 | 0/0 | 0 | — |
| ✅ | `scripts/phase-e` | 90 | 2 | 648 | 0 | 0/0 | 0 | — |
| ✅ | `scripts/redis` | 90 | 2 | 266 | 0 | 0/2 | 0 | — |
| ✅ | `scripts/reports` | 90 | 8 | 456 | 0 | 0/4 | 0 | — |
| ✅ | `scripts/semantic-valkey` | 90 | 2 | 274 | 0 | 0/0 | 0 | — |
| ✅ | `scripts/sidecars` | 90 | 4 | 1400 | 0 | 0/0 | 0 | — |
| ✅ | `scripts/simd` | 90 | 28 | 2310 | 0 | 0/20 | 0 | — |
| ✅ | `scripts/simdtest` | 90 | 6 | 384 | 0 | 0/6 | 0 | — |
| ✅ | `scripts/startup/lib` | 90 | 4 | 408 | 0 | 0/4 | 0 | — |
| ✅ | `scripts/sync-labels` | 90 | 4 | 136 | 0 | 0/0 | 0 | — |
| ✅ | `scripts/test/evaluation` | 90 | 6 | 732 | 0 | 0/0 | 0 | — |
| ✅ | `scripts/tests/agent-investigate-results` | 90 | 22 | 1992 | 0 | 0/0 | 0 | — |
| ✅ | `scripts/tests/performance-results` | 90 | 44 | 828 | 0 | 0/0 | 0 | — |
| ✅ | `scripts/tests/screenshots/2026-02-21T20-52-49` | 90 | 2 | 374 | 0 | 0/0 | 0 | — |
| ✅ | `scripts/tests/screenshots/2026-02-21T21-06-55` | 90 | 2 | 374 | 0 | 0/0 | 0 | — |
| ✅ | `scripts/tests/screenshots/2026-02-22T00-35-12` | 90 | 2 | 374 | 0 | 0/0 | 0 | — |
| ✅ | `scripts/tests/screenshots/2026-02-22T00-49-32` | 90 | 2 | 374 | 0 | 0/0 | 0 | — |
| ✅ | `scripts/tests/screenshots/2026-02-22T00-49-46` | 90 | 2 | 374 | 0 | 0/0 | 0 | — |
| ✅ | `scripts/tests/screenshots/2026-02-22T17-28-20` | 90 | 2 | 374 | 0 | 0/0 | 0 | — |
| ✅ | `scripts/tests/screenshots/2026-04-04T03-39-00` | 90 | 2 | 2934 | 0 | 0/0 | 0 | — |
| ✅ | `scripts/tests/screenshots/2026-04-06T05-26-41` | 90 | 2 | 2312 | 0 | 0/0 | 0 | — |
| ✅ | `scripts/tests/screenshots/2026-04-06T06-27-46` | 90 | 2 | 7728 | 0 | 0/0 | 0 | — |
| ✅ | `scripts/tests/screenshots/2026-04-06T07-29-27` | 90 | 2 | 82 | 0 | 0/0 | 0 | — |
| ✅ | `scripts/tests/screenshots/2026-04-06T17-02-55` | 90 | 2 | 128 | 0 | 0/0 | 0 | — |
| ✅ | `scripts/tests/screenshots/2026-04-06T17-03-31` | 90 | 2 | 80 | 0 | 0/0 | 0 | — |
| ✅ | `scripts/tests/screenshots/2026-04-06T17-03-45` | 90 | 2 | 80 | 0 | 0/0 | 0 | — |
| ✅ | `scripts/tests/screenshots/2026-04-06T17-55-27` | 90 | 2 | 2372 | 0 | 0/0 | 0 | — |
| ✅ | `scripts/tests/screenshots/2026-04-06T20-26-24` | 90 | 2 | 74 | 0 | 0/0 | 0 | — |
| ✅ | `scripts/tests/screenshots/2026-04-06T20-26-58` | 90 | 2 | 566 | 0 | 0/0 | 0 | — |
| ✅ | `scripts/tests/screenshots/2026-04-07T00-47-54` | 90 | 2 | 74 | 0 | 0/0 | 0 | — |
| ✅ | `scripts/tests/screenshots/2026-04-07T00-48-09` | 90 | 2 | 3238 | 0 | 0/0 | 0 | — |
| ✅ | `scripts/tests/screenshots/2026-04-07T00-58-34` | 90 | 2 | 74 | 0 | 0/0 | 0 | — |
| ✅ | `scripts/tests/screenshots/2026-04-07T01-07-53` | 90 | 2 | 2336 | 0 | 0/0 | 0 | — |
| ✅ | `scripts/tests/screenshots/2026-04-08T21-29-20` | 90 | 2 | 3726 | 0 | 0/0 | 0 | — |
| ✅ | `scripts/tests/screenshots/2026-04-09T02-36-04` | 90 | 2 | 1846 | 0 | 0/0 | 0 | — |
| ✅ | `scripts/tests/screenshots/2026-04-09T02-37-53` | 90 | 2 | 1834 | 0 | 0/0 | 0 | — |
| ✅ | `scripts/tests/screenshots/2026-04-09T02-39-16` | 90 | 2 | 1834 | 0 | 0/0 | 0 | — |
| ✅ | `scripts/tests/screenshots/2026-04-09T02-39-46` | 90 | 2 | 1834 | 0 | 0/0 | 0 | — |
| ✅ | `scripts/tests/screenshots/2026-04-09T02-43-33` | 90 | 2 | 2332 | 0 | 0/0 | 0 | — |
| ✅ | `scripts/tests/screenshots/2026-04-09T02-43-44` | 90 | 2 | 2322 | 0 | 0/0 | 0 | — |
| ✅ | `scripts/tests/screenshots/2026-04-11T20-13-43` | 90 | 2 | 2330 | 0 | 0/0 | 0 | — |
| ✅ | `scripts/tests/screenshots/2026-04-11T21-23-55` | 90 | 2 | 2344 | 0 | 0/0 | 0 | — |
| ✅ | `scripts/tests/screenshots/2026-04-11T23-15-43` | 90 | 2 | 80 | 0 | 0/0 | 0 | — |
| ✅ | `scripts/tests/screenshots/2026-04-12T23-17-00` | 90 | 2 | 82 | 0 | 0/0 | 0 | — |
| ✅ | `scripts/tests/screenshots/2026-04-12T23-17-32` | 90 | 2 | 80 | 0 | 0/0 | 0 | — |
| ✅ | `scripts/tests/screenshots/2026-04-12T23-21-09` | 90 | 2 | 120 | 0 | 0/0 | 0 | — |
| ✅ | `scripts/tests/screenshots/2026-04-12T23-21-29` | 90 | 2 | 120 | 0 | 0/0 | 0 | — |
| ✅ | `scripts/tests/screenshots/2026-04-12T23-23-34` | 90 | 2 | 120 | 0 | 0/0 | 0 | — |
| ✅ | `scripts/tests/screenshots/2026-04-12T23-25-33` | 90 | 2 | 80 | 0 | 0/0 | 0 | — |
| ✅ | `scripts/tests/screenshots/2026-04-12T23-26-56` | 90 | 2 | 80 | 0 | 0/0 | 0 | — |
| ✅ | `scripts/tests/screenshots/2026-04-12T23-32-42` | 90 | 2 | 80 | 0 | 0/0 | 0 | — |
| ✅ | `scripts/tests/screenshots/2026-04-12T23-37-35` | 90 | 2 | 82 | 0 | 0/0 | 0 | — |
| ✅ | `scripts/tests/screenshots/2026-04-12T23-39-11` | 90 | 2 | 80 | 0 | 0/0 | 0 | — |
| ✅ | `scripts/tests/screenshots/2026-04-12T23-39-46` | 90 | 2 | 80 | 0 | 0/0 | 0 | — |
| ✅ | `scripts/tests/screenshots/2026-04-12T23-39-48` | 90 | 2 | 80 | 0 | 0/0 | 0 | — |
| ✅ | `scripts/tests/screenshots/2026-04-12T23-43-53` | 90 | 2 | 70 | 0 | 0/0 | 0 | — |
| ✅ | `scripts/tests/screenshots/2026-04-12T23-45-38` | 90 | 2 | 82 | 0 | 0/0 | 0 | — |
| ✅ | `scripts/tests/screenshots/2026-04-12T23-46-11` | 90 | 2 | 82 | 0 | 0/0 | 0 | — |
| ✅ | `scripts/tests/screenshots/2026-04-12T23-46-15` | 90 | 2 | 80 | 0 | 0/0 | 0 | — |
| ✅ | `scripts/tests/screenshots/2026-04-12T23-46-19` | 90 | 2 | 80 | 0 | 0/0 | 0 | — |
| ✅ | `scripts/tests/screenshots/2026-04-12T23-46-34` | 90 | 2 | 80 | 0 | 0/0 | 0 | — |
| ✅ | `scripts/tests/screenshots/2026-04-12T23-47-31` | 90 | 2 | 80 | 0 | 0/0 | 0 | — |
| ✅ | `scripts/tests/screenshots/2026-04-12T23-47-33` | 90 | 2 | 80 | 0 | 0/0 | 0 | — |
| ✅ | `scripts/tests/screenshots/2026-04-12T23-47-35` | 90 | 2 | 80 | 0 | 0/0 | 0 | — |
| ✅ | `scripts/tests/screenshots/2026-04-15T03-37-52` | 90 | 2 | 360 | 0 | 0/0 | 0 | — |
| ✅ | `scripts/tests/screenshots/2026-04-15T04-06-50` | 90 | 2 | 2338 | 0 | 0/0 | 0 | — |
| ✅ | `scripts/tests/screenshots/2026-04-17T04-16-10` | 90 | 2 | 122 | 0 | 0/0 | 0 | — |
| ✅ | `scripts/tests/screenshots/2026-04-17T04-17-15` | 90 | 2 | 80 | 0 | 0/0 | 0 | — |
| ✅ | `scripts/tests/screenshots/2026-04-17T04-19-14` | 90 | 2 | 4492 | 0 | 0/0 | 0 | — |
| ✅ | `scripts/tests/screenshots/2026-04-17T04-40-11` | 90 | 2 | 2324 | 0 | 0/0 | 0 | — |
| ✅ | `scripts/tests/screenshots/2026-04-17T04-45-07` | 90 | 2 | 2346 | 0 | 0/0 | 0 | — |
| ✅ | `scripts/tests/screenshots/2026-04-18T01-11-27` | 90 | 2 | 126 | 0 | 0/0 | 0 | — |
| ✅ | `scripts/tests/screenshots/2026-04-18T01-12-20` | 90 | 2 | 126 | 0 | 0/0 | 0 | — |
| ✅ | `scripts/tests/screenshots/2026-04-18T02-59-52` | 90 | 2 | 80 | 0 | 0/0 | 0 | — |
| ✅ | `scripts/tests/screenshots/cases-ui` | 90 | 2 | 112 | 0 | 0/0 | 0 | — |
| ✅ | `scripts/tests/screenshots/glossary` | 90 | 2 | 140 | 0 | 0/0 | 0 | — |
| ✅ | `scripts/tests/screenshots/latest` | 90 | 2 | 80 | 0 | 0/0 | 0 | — |
| ✅ | `scripts/tests/screenshots/production-proof` | 90 | 2 | 2344 | 0 | 0/0 | 0 | — |
| ✅ | `scripts/tests/vlm-tests` | 90 | 12 | 12 | 0 | 0/0 | 0 | — |
| ✅ | `scripts/unsloth-training/COLAB_PACKAGE/training-datasets` | 90 | 2 | 198 | 0 | 0/0 | 0 | — |
| ✅ | `scripts/validate` | 90 | 2 | 1164 | 0 | 0/2 | 0 | — |
| ✅ | `scripts/valkey` | 90 | 6 | 474 | 0 | 0/6 | 0 | — |
| ✅ | `services/embedding-onnx-webgpu` | 90 | 8 | 2610 | 0 | 0/0 | 0 | — |
| ✅ | `simd-bridge/build-x64-cuda/.cmake/api` | 90 | 68 | 15820 | 0 | 0/0 | 0 | — |
| ✅ | `simd-bridge/build-x64-cuda/CMakeFiles` | 90 | 2 | 18 | 0 | 0/0 | 0 | — |
| ✅ | `simd-bridge/build-x64-cuda/cpp/CMakeFiles` | 90 | 2 | 16 | 0 | 0/0 | 0 | — |
| ✅ | `simd-bridge/cpp` | 90 | 4 | 1538 | 0 | 0/2 | 0 | — |
| ✅ | `simd-bridge/cpp/build-verify-2026-05-31T08-06-57-567Z/CMakeFiles` | 90 | 2 | 16 | 0 | 0/0 | 0 | — |
| ✅ | `simd-bridge/cpp/build-x64-cuda/CMakeFiles` | 90 | 4 | 34 | 0 | 0/0 | 0 | — |
| ✅ | `simd-bridge/cpp/build-x64-cuda-cublas/CMakeFiles` | 90 | 4 | 32 | 0 | 0/0 | 0 | — |
| ✅ | `simd-bridge/cpp/build-x64-cuda-cuvs/CMakeFiles` | 90 | 4 | 32 | 0 | 0/0 | 0 | — |
| ✅ | `simd-bridge/cpp/build-x64-fallback/CMakeFiles` | 90 | 2 | 18 | 0 | 0/0 | 0 | — |
| ✅ | `simd-bridge/examples` | 90 | 4 | 60 | 0 | 0/0 | 0 | — |
| ✅ | `simd-bridge/rust/graph-engine` | 90 | 6 | 176 | 0 | 0/0 | 0 | — |
| ✅ | `simd-bridge/rust/graph-engine/target` | 90 | 110 | 110 | 0 | 0/0 | 0 | — |
| ✅ | `simd-bridge/rust/hmm-repair` | 90 | 6 | 268 | 0 | 0/0 | 0 | — |
| ✅ | `simd-bridge/rust/hmm-repair/target` | 90 | 202 | 202 | 0 | 0/0 | 0 | — |
| ✅ | `simd-bridge/rust-simdjson/target` | 90 | 2 | 332 | 0 | 0/0 | 0 | — |
| ✅ | `simd-bridge/rust-simdjson/target/debug` | 90 | 152 | 152 | 0 | 0/0 | 0 | — |
| ✅ | `simd-bridge/rust-simdjson/target/release` | 90 | 178 | 178 | 0 | 0/0 | 0 | — |
| ✅ | `simd-bridge/simd-bridge/build-x64-cuda/.cmake` | 90 | 68 | 15820 | 0 | 0/0 | 0 | — |
| ✅ | `simd-bridge/simd-bridge/build-x64-cuda/CMakeFiles` | 90 | 2 | 18 | 0 | 0/0 | 0 | — |
| ✅ | `simd-bridge/simd-bridge/build-x64-cuda/cpp` | 90 | 2 | 16 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/.claude` | 90 | 1 | 45 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/.okf` | 90 | 1 | 20 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/artifacts` | 90 | 4 | 4724 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/artifacts/evaluations/quantization-recall` | 90 | 1 | 3455 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/classifier-models` | 90 | 3 | 71 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/colab-export` | 90 | 1 | 12 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/config` | 90 | 1 | 140 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/data` | 90 | 1 | 27097 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/data/atlas-tensor-proof` | 90 | 6 | 10081 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/docs` | 90 | 1 | 15473191 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/docs/atlas` | 90 | 2 | 51874 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/docs/atlas-index` | 90 | 3 | 162 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/docs/contracts` | 90 | 1 | 165 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/docs/graph` | 90 | 20 | 7371911 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/docs/graph/.build` | 90 | 5 | 55 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/docs/obsidian-vault` | 90 | 2 | 108 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/docs/performance` | 90 | 2 | 39566 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/docs/profile-cards/data` | 90 | 20 | 1588 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/docs/reports` | 90 | 160 | 8007668 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/docs/reports/atlas` | 90 | 1 | 216 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/docs/reports/benchmarks` | 90 | 1 | 49 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/docs/reports/current-structural-graph-artifact-v1` | 90 | 2 | 143 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/docs/reports/graph-ordinal-parity-fixture-v1` | 90 | 1 | 10 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/docs/reports/graph-probes` | 90 | 7 | 5861957 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/docs/reports/graph-snapshot-parity` | 90 | 11 | 287 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/docs/reports/ontology-linked-tuple-cugraph-algorithm-fixture-v1` | 90 | 1 | 19 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/docs/reports/ontology-linked-tuple-cugraph-fixture-v1` | 90 | 1 | 12 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/docs/reports/parent-atlas` | 90 | 2 | 3563 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/docs/reports/sessions` | 90 | 3 | 1925 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/docs/trace-mcp` | 90 | 1 | 65 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/docs_readme/deeds_labs_archive` | 90 | 85 | 2999318 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/docs_readme/deeds_labs_archive/components` | 90 | 3 | 1820 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/drizzle/introspected/meta` | 90 | 2 | 17338 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/drizzle/meta` | 90 | 38 | 958941 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/drizzle/meta_backup_20260101` | 90 | 10 | 32129 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/master-pipeline-results` | 90 | 1 | 67 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/memory/agent-runs` | 90 | 1 | 73 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/memory/agents-dag` | 90 | 34 | 2433 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/memory/atlas` | 90 | 3 | 3 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/memory/cards` | 90 | 2 | 8999 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/memory/codebase` | 90 | 2 | 38788 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/memory/datasets/legal-contracts` | 90 | 2 | 12 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/memory/docstore` | 90 | 1 | 22 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/memory/exports` | 90 | 5 | 1758 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/memory/exports/atlas` | 90 | 1 | 20 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/memory/exports/xgboost-hotness` | 90 | 1 | 393 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/memory/features` | 90 | 3 | 623 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/memory/graph` | 90 | 1 | 3480 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/memory/graphify/deep` | 90 | 5 | 946127 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/memory/graphify/gds` | 90 | 165 | 5028657 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/memory/index` | 90 | 6 | 1672 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/memory/kag-notes` | 90 | 1 | 16 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/memory/kb` | 90 | 1 | 88473 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/memory/kb/cards` | 90 | 2 | 87451 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/memory/kb/notecards` | 90 | 2 | 963 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/memory/kb/weights` | 90 | 1 | 13 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/memory/knowledge` | 90 | 2 | 29 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/memory/reconstruction` | 90 | 2 | 273 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/memory/runs/01cb725b540e` | 90 | 4 | 211 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/memory/runs/2026-05-06` | 90 | 12 | 312 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/memory/runs/2026-05-07` | 90 | 1 | 19 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/memory/runs/2026-05-07-16-41-16` | 90 | 1 | 92 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/memory/runs/2026-05-07-16-42-38` | 90 | 1 | 92 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/memory/runs/2026-05-07-16-44-09` | 90 | 1 | 92 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/memory/runs/2026-05-07-16-59-57` | 90 | 1 | 92 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/memory/runs/2026-05-07-17-00-51` | 90 | 1 | 92 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/memory/runs/2026-05-07-17-03-48` | 90 | 1 | 92 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/memory/runs/2026-05-07T01-05-54` | 90 | 6 | 69302 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/memory/runs/2026-05-07T02-21-01` | 90 | 6 | 69302 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/memory/runs/2026-05-07T02-21-04` | 90 | 6 | 69302 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/memory/runs/2026-05-07T02-24-29` | 90 | 6 | 71504 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/memory/runs/2026-05-07T02-26-55` | 90 | 6 | 71505 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/memory/runs/2026-05-07T02-28-15` | 90 | 6 | 71505 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/memory/runs/2026-05-07T02-28-20` | 90 | 6 | 71505 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/memory/runs/2026-05-07T02-33-56` | 90 | 6 | 71505 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/memory/runs/2026-05-07T02-45-52` | 90 | 6 | 71505 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/memory/runs/2026-05-07T02-47-24` | 90 | 6 | 71505 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/memory/runs/2026-05-07T02-47-34` | 90 | 6 | 71505 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/memory/runs/2026-05-07T02-52-31` | 90 | 6 | 71505 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/memory/runs/2026-05-07T02-53-22` | 90 | 6 | 71505 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/memory/runs/2026-05-07T02-59-42` | 90 | 6 | 71545 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/memory/runs/2026-05-07T03-00-05` | 90 | 6 | 71545 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/memory/runs/2026-05-07T03-00-30` | 90 | 6 | 71545 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/memory/runs/2026-05-07T03-07-59` | 90 | 6 | 71545 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/memory/runs/2026-05-07T03-08-03` | 90 | 6 | 71545 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/memory/runs/2026-05-07T03-08-06` | 90 | 6 | 71545 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/memory/runs/2026-05-07T03-08-18` | 90 | 6 | 71545 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/memory/runs/2026-05-07T03-08-46` | 90 | 6 | 71545 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/memory/runs/2026-05-07T03-14-40` | 90 | 6 | 71545 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/memory/runs/2026-05-07T03-28-02` | 90 | 6 | 71545 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/memory/runs/2026-05-07T03-28-08` | 90 | 6 | 71545 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/memory/runs/2026-05-07T04-00-48` | 90 | 6 | 71545 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/memory/runs/2026-05-07T04-07-10` | 90 | 6 | 79844 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/memory/runs/2026-05-07T04-08-11` | 90 | 6 | 79844 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/memory/runs/2026-05-07T04-08-31` | 90 | 6 | 79844 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/memory/runs/2026-05-07T04-39-46` | 90 | 6 | 80052 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/memory/runs/2026-05-07T04-40-45` | 90 | 6 | 80052 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/memory/runs/2026-05-07T04-44-14` | 90 | 6 | 80052 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/memory/runs/2026-05-07T04-47-36` | 90 | 6 | 80052 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/memory/runs/2026-05-07T05-05-54` | 90 | 6 | 80046 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/memory/runs/2026-05-07T05-06-12` | 90 | 6 | 80046 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/memory/runs/2026-05-07T05-08-08` | 90 | 6 | 80046 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/memory/runs/2026-05-07T05-33-38` | 90 | 6 | 80046 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/memory/runs/2026-05-07T05-40-07` | 90 | 6 | 80046 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/memory/runs/2026-05-07T05-41-09` | 90 | 6 | 80046 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/memory/runs/2026-05-07T05-41-24` | 90 | 6 | 80046 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/memory/runs/2026-05-07T05-41-29` | 90 | 6 | 80046 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/memory/runs/2026-05-07T06-47-46` | 90 | 6 | 80046 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/memory/runs/2026-05-07T06-48-10` | 90 | 6 | 80046 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/memory/runs/2026-05-07T06-56-03` | 90 | 6 | 80046 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/memory/runs/2026-05-07T09-04-38` | 90 | 6 | 80046 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/memory/runs/2026-05-07T09-05-35` | 90 | 6 | 80046 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/memory/runs/2026-05-07T09-07-52` | 90 | 6 | 80046 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/memory/runs/2026-05-07T09-08-12` | 90 | 6 | 80046 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/memory/runs/2026-05-07T09-12-17` | 90 | 6 | 80046 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/memory/runs/2026-05-07T09-12-49` | 90 | 6 | 80046 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/memory/runs/2026-05-07T09-41-43` | 90 | 6 | 80046 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/memory/runs/2026-05-07T09-42-15` | 90 | 6 | 80046 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/memory/runs/2026-05-07T14-55-56` | 90 | 10 | 81252 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/memory/runs/2026-05-07T15-55-50` | 90 | 6 | 80046 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/memory/runs/2026-05-07T15-56-22` | 90 | 9 | 80748 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/memory/runs/2026-05-07T16-01-36` | 90 | 9 | 80748 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/memory/runs/2026-05-07T16-02-09` | 90 | 6 | 80046 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/memory/runs/2026-05-07T16-06-18` | 90 | 6 | 80046 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/memory/runs/2026-05-07T16-07-29` | 90 | 6 | 80046 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/memory/runs/2026-05-07T16-08-31` | 90 | 6 | 80046 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/memory/runs/2026-05-07T16-09-00` | 90 | 6 | 80046 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/memory/runs/2026-05-07T16-11-51` | 90 | 7 | 80269 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/memory/runs/2026-05-07T16-13-19` | 90 | 6 | 80046 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/memory/runs/2026-05-07T16-17-06` | 90 | 6 | 80046 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/memory/runs/2026-05-07T16-17-56` | 90 | 6 | 80046 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/memory/runs/2026-05-07T16-18-50` | 90 | 6 | 80046 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/memory/runs/2026-05-07T16-19-09` | 90 | 6 | 80046 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/memory/runs/2026-05-07T16-21-48` | 90 | 6 | 80046 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/memory/runs/2026-05-07T16-22-48` | 90 | 10 | 80775 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/memory/runs/2026-05-07T16-45-33` | 90 | 6 | 80046 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/memory/runs/2026-05-07T16-45-39` | 90 | 6 | 80046 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/memory/runs/2026-05-07T16-46-33` | 90 | 10 | 82811 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/memory/runs/2026-05-07T17-03-59` | 90 | 9 | 82755 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/memory/runs/2026-05-07T17-11-51` | 90 | 11 | 82845 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/memory/runs/2026-05-07T18-56-43` | 90 | 13 | 82950 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/memory/runs/2026-05-07T19-11-14` | 90 | 12 | 82283 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/memory/runs/2026-05-07T20-53-22` | 90 | 12 | 82335 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/memory/runs/2026-05-07T21-08-58` | 90 | 1 | 21 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/memory/runs/2026-05-07T23-01-22` | 90 | 1 | 209 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/memory/runs/2026-05-07T23-33-32` | 90 | 1 | 209 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/memory/runs/2026-05-07T23-40-33` | 90 | 1 | 215 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/memory/runs/2026-05-08` | 90 | 1 | 19 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/memory/runs/2026-05-08T00-13-11` | 90 | 1 | 215 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/memory/runs/2026-05-08T00-34-05` | 90 | 1 | 215 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/memory/runs/2026-05-08T04-32-51` | 90 | 1 | 215 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/memory/runs/2026-05-08T05-48-00` | 90 | 1 | 251 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/memory/runs/2026-05-08T05-57-38` | 90 | 1 | 275 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/memory/runs/2026-05-08T06-35-00` | 90 | 1 | 275 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/memory/runs/2026-05-08T06-44-04` | 90 | 1 | 275 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/memory/runs/2026-05-08T06-53-45` | 90 | 2 | 318 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/memory/runs/2026-05-08T09-50-21` | 90 | 1 | 702 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/memory/runs/2026-05-08T10-17-48` | 90 | 1 | 731 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/memory/runs/2026-05-08T10-19-05` | 90 | 1 | 875 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/memory/runs/2026-05-08T10-20-46` | 90 | 1 | 948 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/memory/runs/2026-05-08T10-41-26` | 90 | 1 | 727 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/memory/runs/2026-05-08T10-41-57` | 90 | 1 | 727 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/memory/runs/2026-05-08T10-43-19` | 90 | 1 | 727 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/memory/runs/2026-05-08T10-47-29` | 90 | 1 | 1098 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/memory/runs/2026-05-08T21-31-02` | 90 | 1 | 275 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/memory/runs/2026-05-08T22-19-38` | 90 | 1 | 299 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/memory/runs/2026-05-08T22-46-17` | 90 | 1 | 299 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/memory/runs/2026-05-08T22-49-24` | 90 | 1 | 299 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/memory/runs/2026-05-08T22-50-33` | 90 | 1 | 299 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/memory/runs/2026-05-09` | 90 | 1 | 19 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/memory/runs/2026-05-09T03-10-32` | 90 | 1 | 317 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/memory/runs/2026-05-09T03-17-37` | 90 | 1 | 317 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/memory/runs/2026-05-09T03-23-23` | 90 | 1 | 317 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/memory/runs/2026-05-09T03-39-46` | 90 | 1 | 287 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/memory/runs/2026-05-09T03-42-33` | 90 | 1 | 275 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/memory/runs/2026-05-09T04-08-49` | 90 | 1 | 46 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/memory/runs/2026-05-09T04-09-49` | 90 | 1 | 45 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/memory/runs/2026-05-09T04-10-42` | 90 | 1 | 45 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/memory/runs/2026-05-12T19-48-04` | 90 | 1 | 45 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/memory/runs/2026-05-13T06-03-16` | 90 | 5 | 4527 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/memory/runs/2026-05-13T06-06-14` | 90 | 5 | 4527 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/memory/runs/2026-05-13T06-06-59` | 90 | 11 | 90578 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/memory/runs/2026-05-15T21-39-17` | 90 | 16 | 92032 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/memory/runs/2026-05-17T00-26-41` | 90 | 14 | 91944 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/memory/runs/2026-05-17T01-26-59` | 90 | 6 | 90377 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/memory/runs/2026-05-17T01-27-03` | 90 | 6 | 90377 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/memory/runs/2026-05-17T05-29-33` | 90 | 6 | 90377 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/memory/runs/2026-05-17T05-30-37` | 90 | 6 | 90377 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/memory/runs/2026-05-17T05-33-51` | 90 | 6 | 90377 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/memory/runs/2026-05-17T05-34-44` | 90 | 6 | 90377 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/memory/runs/2026-05-17T05-39-25` | 90 | 6 | 90377 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/memory/runs/2026-05-17T05-41-01` | 90 | 6 | 90377 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/memory/runs/2026-05-17T05-41-54` | 90 | 6 | 90377 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/memory/runs/2026-05-17T05-42-53` | 90 | 6 | 90377 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/memory/runs/2026-05-17T05-46-02` | 90 | 6 | 90377 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/memory/runs/2026-05-17T05-46-57` | 90 | 6 | 90377 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/memory/runs/2026-05-17T05-54-07` | 90 | 6 | 90377 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/memory/runs/2026-05-17T05-54-58` | 90 | 6 | 90377 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/memory/runs/2026-05-17T09-23-56` | 90 | 6 | 90377 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/memory/runs/2026-05-17T09-25-25` | 90 | 6 | 90377 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/memory/runs/2026-05-17T09-30-23` | 90 | 6 | 90377 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/memory/runs/2026-05-17T09-31-18` | 90 | 9 | 90493 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/memory/runs/2026-05-17T09-44-19` | 90 | 6 | 90377 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/memory/runs/2026-05-17T09-45-13` | 90 | 6 | 90377 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/memory/runs/2026-05-17T09-57-05` | 90 | 6 | 90377 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/memory/runs/2026-05-17T09-57-57` | 90 | 6 | 90377 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/memory/runs/2026-05-17T15-22-43` | 90 | 6 | 90377 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/memory/runs/2026-05-17T15-24-39` | 90 | 6 | 90377 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/memory/runs/2026-05-17T15-27-34` | 90 | 6 | 90377 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/memory/runs/2026-05-17T15-28-36` | 90 | 9 | 90493 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/memory/runs/2026-05-17T15-40-55` | 90 | 6 | 90377 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/memory/runs/2026-05-17T15-43-52` | 90 | 6 | 90377 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/memory/runs/2026-05-17T15-44-23` | 90 | 6 | 90377 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/memory/runs/2026-05-17T15-45-53` | 90 | 6 | 90377 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/memory/runs/2026-05-17T16-05-51` | 90 | 6 | 90377 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/memory/runs/2026-05-17T16-53-53` | 90 | 6 | 90377 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/memory/runs/2026-05-17T16-54-38` | 90 | 6 | 90377 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/memory/runs/2026-05-17T16-58-52` | 90 | 6 | 90377 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/memory/runs/2026-05-17T16-59-44` | 90 | 6 | 90377 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/memory/runs/2026-05-17T17-04-24` | 90 | 6 | 90377 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/memory/runs/2026-05-17T17-05-17` | 90 | 6 | 90377 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/memory/runs/2026-05-17T17-09-56` | 90 | 6 | 90377 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/memory/runs/2026-05-17T17-10-45` | 90 | 6 | 90377 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/memory/runs/2026-05-17T17-14-59` | 90 | 6 | 90377 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/memory/runs/2026-05-17T17-15-45` | 90 | 6 | 90377 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/memory/runs/2026-05-17T17-24-02` | 90 | 6 | 90377 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/memory/runs/2026-05-17T17-24-49` | 90 | 6 | 90377 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/memory/runs/2026-05-17T20-14-54` | 90 | 6 | 90377 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/memory/runs/2026-05-17T20-15-49` | 90 | 6 | 90377 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/memory/runs/2026-05-17T20-19-55` | 90 | 6 | 90377 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/memory/runs/2026-05-17T20-24-07` | 90 | 6 | 90377 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/memory/runs/2026-05-17T20-30-24` | 90 | 6 | 90377 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/memory/runs/2026-05-17T20-33-50` | 90 | 6 | 90377 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/memory/runs/2026-05-17T22-05-28` | 90 | 6 | 90377 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/memory/runs/2026-05-17T22-06-54` | 90 | 6 | 90377 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/memory/runs/2026-05-17T22-16-53` | 90 | 6 | 90377 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/memory/runs/2026-05-17T22-17-52` | 90 | 9 | 90498 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/memory/runs/2026-05-18T18-04-46` | 90 | 14 | 92051 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/memory/runs/2026-05-19T19-10-37` | 90 | 14 | 92045 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/memory/runs/2026-05-20` | 90 | 1 | 19 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/memory/runs/2026-05-20T02-36-07` | 90 | 6 | 90378 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/memory/runs/2026-05-20T02-37-24` | 90 | 9 | 90499 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/memory/runs/2026-05-20T20-59-02` | 90 | 6 | 90378 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/memory/runs/2026-05-20T21-00-02` | 90 | 9 | 90499 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/memory/runs/2026-05-20T21-17-02` | 90 | 1 | 737 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/memory/runs/2026-05-20T21-28-24` | 90 | 14 | 92070 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/memory/runs/2026-05-21T22-17-08` | 90 | 6 | 90378 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/memory/runs/2026-05-21T22-18-05` | 90 | 9 | 90499 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/memory/runs/2026-05-22T01-44-37` | 90 | 14 | 92061 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/memory/runs/2026-05-22T13-23-31` | 90 | 6 | 90378 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/memory/runs/2026-05-22T13-24-30` | 90 | 6 | 90378 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/memory/runs/2026-05-23T02-44-53` | 90 | 14 | 92168 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/memory/runs/2026-05-24T16-28-25` | 90 | 14 | 92247 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/memory/runs/2026-05-24T23-07-15` | 90 | 6 | 90378 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/memory/runs/2026-05-24T23-09-00` | 90 | 9 | 90645 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/memory/runs/2026-05-26T17-32-25` | 90 | 5 | 1732 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/memory/runs/2026-05-26T17-32-26` | 90 | 10 | 90696 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/memory/runs/2026-05-27T19-37-18` | 90 | 15 | 92420 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/memory/runs/2026-05-29T02-00-27` | 90 | 6 | 90378 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/memory/runs/2026-05-29T02-01-53` | 90 | 6 | 90378 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/memory/runs/2026-05-29T02-16-15` | 90 | 6 | 90378 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/memory/runs/2026-05-29T02-17-36` | 90 | 6 | 90378 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/memory/runs/2026-05-29T04-09-19` | 90 | 6 | 90378 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/memory/runs/2026-05-29T04-11-06` | 90 | 6 | 90378 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/memory/runs/2026-05-29T04-14-58` | 90 | 6 | 90378 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/memory/runs/2026-05-29T04-15-48` | 90 | 6 | 90378 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/memory/runs/2026-05-29T05-38-52` | 90 | 6 | 90378 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/memory/runs/2026-05-29T05-40-05` | 90 | 6 | 90378 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/memory/runs/2026-05-29T05-46-36` | 90 | 6 | 90378 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/memory/runs/2026-05-29T05-47-57` | 90 | 6 | 90378 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/memory/runs/2026-05-29T05-59-03` | 90 | 6 | 90378 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/memory/runs/2026-05-29T06-00-23` | 90 | 6 | 90378 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/memory/runs/2026-05-29T06-05-46` | 90 | 6 | 90378 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/memory/runs/2026-05-29T06-07-17` | 90 | 6 | 90378 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/memory/runs/2026-05-29T06-15-45` | 90 | 6 | 90378 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/memory/runs/2026-05-29T06-17-33` | 90 | 6 | 90378 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/memory/runs/2026-05-29T15-30-49` | 90 | 14 | 92123 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/memory/runs/2026-05-30T08-33-59` | 90 | 6 | 90378 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/memory/runs/2026-05-30T08-35-01` | 90 | 6 | 90378 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/memory/runs/2026-05-30T17-12-06` | 90 | 6 | 90378 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/memory/runs/2026-05-30T17-12-13` | 90 | 6 | 90378 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/memory/runs/2026-05-30T17-18-43` | 90 | 6 | 90378 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/memory/runs/2026-05-30T17-19-54` | 90 | 9 | 90465 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/memory/runs/2026-05-30T20-02-16` | 90 | 14 | 92085 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/memory/runs/2026-05-31T20-36-25` | 90 | 14 | 92045 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/memory/runs/2026-06-01T22-22-15` | 90 | 14 | 92051 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/memory/runs/2026-06-03T15-49-43` | 90 | 6 | 90384 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/memory/runs/2026-06-03T15-49-51` | 90 | 6 | 90384 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/memory/runs/2026-06-06` | 90 | 1 | 19 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/memory/runs/2026-06-06T01-36-20` | 90 | 1 | 755 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/memory/runs/2026-06-06T01-50-52` | 90 | 1 | 755 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/memory/runs/2026-06-06T02-04-19` | 90 | 1 | 755 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/memory/runs/2026-06-11T03-27-26` | 90 | 5 | 1693 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/memory/runs/2026-06-11T03-27-27` | 90 | 6 | 90384 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/memory/runs/2026-07-25` | 90 | 1 | 19 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/memory/runs/2026-07-27T01-57-07` | 90 | 6 | 205831 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/memory/runs/2026-08-25T17-24-26` | 90 | 6 | 205831 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/memory/runs/2026-08-25T17-31-18` | 90 | 6 | 205831 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/memory/runs/2026-08-25T17-31-24` | 90 | 6 | 205831 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/memory/runs/2026-09-06T04-04-21` | 90 | 6 | 205831 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/memory/runs/2026-09-06T04-04-36` | 90 | 6 | 205831 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/memory/runs/2026-09-06T07-16-58` | 90 | 6 | 205831 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/memory/runs/2026-09-06T07-19-08` | 90 | 6 | 205831 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/memory/runs/2026-09-12T19-04-58` | 90 | 1 | 45 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/memory/runs/2026-09-12T19-05-22` | 90 | 1 | 45 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/memory/runs/2026-09-12T19-05-43` | 90 | 1 | 45 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/memory/runs/2026-09-12T19-08-23` | 90 | 1 | 45 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/memory/runs/2026-10-15T00-53-09` | 90 | 6 | 205831 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/memory/runs/2026-10-15T01-16-17` | 90 | 6 | 205831 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/memory/synthesis` | 90 | 1 | 10 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/mini_active_nvme_cache` | 90 | 1 | 1 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/openspec` | 90 | 1 | 68 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/openspec/changes/phase-2f1-real-evaluation-corpus` | 90 | 1 | 18 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/phase110_ground_truth` | 90 | 3 | 24662 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/phase110_proof_reports` | 90 | 5 | 250 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/phase110_qdrant_baseline` | 90 | 1 | 20 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/phase110_snapshot` | 90 | 1 | 14 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/phase3-pipeline-results` | 90 | 1 | 64 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/phase6-synthesis-results` | 90 | 2 | 44 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/phase7-ace-results` | 90 | 2 | 65 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/reports` | 90 | 7 | 289343 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/reports/batch-a` | 90 | 1 | 41 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/reports/batch-b` | 90 | 1 | 42 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/reports/batch-c` | 90 | 1 | 55 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/reports/deep-audit` | 90 | 4 | 288683 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/reports/deep-audit/encoded` | 90 | 31 | 171518 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/reports/phase5-ab-test` | 90 | 1 | 71 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/reports/semantic-contracts` | 90 | 2 | 215 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/schemas/atlas/embedding-contract` | 90 | 1 | 61 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/schemas/atlas/feature-envelope` | 90 | 1 | 76 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/schemas/atlas/qdrant-projection` | 90 | 1 | 33 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/schemas/atlas/source-ref` | 90 | 1 | 99 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/scratch/synthesis-runs/2026-05-09T18-23-55` | 90 | 4 | 33 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/scratch/synthesis-runs/2026-05-09T18-49-48` | 90 | 4 | 33 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/scratch/synthesis-runs/2026-05-09T18-52-33` | 90 | 4 | 31 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/scratch/synthesis-runs/2026-05-09T22-39-57` | 90 | 4 | 33 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/scratch/synthesis-runs/2026-05-09T23-15-14` | 90 | 4 | 33 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/scratch/synthesis-runs/2026-05-09T23-28-37` | 90 | 4 | 31 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/scratch/synthesis-runs/2026-05-09T23-31-59` | 90 | 4 | 31 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/scratch/synthesis-runs/2026-05-09T23-32-06` | 90 | 4 | 31 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/scratch/synthesis-runs/2026-05-09T23-33-12` | 90 | 4 | 82 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/scratch/synthesis-runs/2026-05-09T23-35-06` | 90 | 4 | 93 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/scratch/synthesis-runs/2026-05-09T23-37-55` | 90 | 4 | 82 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/scratch/synthesis-runs/2026-05-09T23-43-00` | 90 | 4 | 99 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/scratch/synthesis-runs/2026-05-09T23-48-27` | 90 | 4 | 48 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/scratch/synthesis-runs/2026-05-09T23-58-13` | 90 | 4 | 120 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/scratch/synthesis-runs/2026-05-09T23-58-21` | 90 | 4 | 120 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/scratch/synthesis-runs/2026-05-10T00-10-13` | 90 | 4 | 131 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/scratch/synthesis-runs/2026-05-10T00-15-53` | 90 | 4 | 144 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/scratch/synthesis-runs/2026-05-10T00-31-09` | 90 | 4 | 129 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/scratch/synthesis-runs/2026-05-10T00-36-44` | 90 | 4 | 123 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/scratch/synthesis-runs/2026-05-10T00-37-41` | 90 | 4 | 123 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/scratch/synthesis-runs/2026-05-10T00-37-58` | 90 | 4 | 129 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/scratch/synthesis-runs/2026-05-10T00-39-05` | 90 | 4 | 129 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/scratch/synthesis-runs/2026-05-10T00-39-33` | 90 | 4 | 140 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/scratch/synthesis-runs/2026-05-10T00-41-49` | 90 | 4 | 140 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/scratch/synthesis-runs/2026-05-10T00-55-47` | 90 | 4 | 120 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/scratch/synthesis-runs/2026-05-10T01-10-06` | 90 | 4 | 368 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/scratch/synthesis-runs/2026-05-10T01-10-42` | 90 | 4 | 387 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/scratch/synthesis-runs/2026-05-10T01-37-08` | 90 | 4 | 239 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/scratch/synthesis-runs/2026-05-10T01-37-35` | 90 | 4 | 256 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/scratch/synthesis-runs/2026-05-10T01-41-33` | 90 | 4 | 228 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/scratch/synthesis-runs/2026-05-10T01-41-52` | 90 | 4 | 254 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/scratch/synthesis-runs/2026-05-10T01-42-12` | 90 | 4 | 255 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/scratch/synthesis-runs/2026-05-10T01-45-56` | 90 | 4 | 244 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/scratch/synthesis-runs/2026-05-10T01-46-47` | 90 | 4 | 269 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/scratch/synthesis-runs/2026-05-10T01-47-55` | 90 | 4 | 270 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/scratch/synthesis-runs/2026-05-10T02-42-37` | 90 | 4 | 190 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/scratch/synthesis-runs/2026-05-10T03-11-12` | 90 | 4 | 188 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/scratch/synthesis-runs/2026-05-10T03-13-21` | 90 | 4 | 178 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/scratch/synthesis-runs/2026-05-12T07-53-27` | 90 | 4 | 110 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/scratch/synthesis-runs/2026-05-12T07-56-43` | 90 | 4 | 298 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/scripts/activity` | 90 | 1 | 123 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/scripts/atlas/control-snapshot-1k` | 90 | 3 | 963 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/scripts/atlas/fixtures` | 90 | 1 | 459 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/scripts/atlas/identity-resolution-results` | 90 | 1 | 42 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/scripts/atlas/sparse` | 90 | 26 | 1666 | 0 | 0/9 | 0 | — |
| ✅ | `sveltekit-frontend/scripts/atlas/workers` | 90 | 1 | 146 | 0 | 0/1 | 0 | — |
| ✅ | `sveltekit-frontend/scripts/authority` | 90 | 1 | 277 | 0 | 0/1 | 0 | — |
| ✅ | `sveltekit-frontend/scripts/backup-consolidation` | 90 | 17 | 4382 | 0 | 0/10 | 0 | — |
| ✅ | `sveltekit-frontend/scripts/backup-consolidation/tests` | 90 | 4 | 999 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/scripts/bifrost` | 90 | 2 | 587 | 0 | 0/2 | 0 | — |
| ✅ | `sveltekit-frontend/scripts/cache` | 90 | 6 | 802 | 0 | 0/4 | 0 | — |
| ✅ | `sveltekit-frontend/scripts/cards` | 90 | 7 | 1407 | 0 | 0/4 | 0 | — |
| ✅ | `sveltekit-frontend/scripts/ci` | 90 | 1 | 62 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/scripts/comfyui` | 90 | 3 | 282 | 0 | 0/1 | 0 | — |
| ✅ | `sveltekit-frontend/scripts/comfyui/workflows` | 90 | 1 | 42 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/scripts/daily` | 90 | 1 | 78 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/scripts/datasets` | 90 | 1 | 32 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/scripts/db` | 90 | 3 | 294 | 0 | 0/1 | 0 | — |
| ✅ | `sveltekit-frontend/scripts/dev` | 90 | 6 | 451 | 0 | 0/3 | 0 | — |
| ✅ | `sveltekit-frontend/scripts/diff` | 90 | 3 | 721 | 0 | 0/2 | 0 | — |
| ✅ | `sveltekit-frontend/scripts/docs/reports` | 90 | 1 | 306 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/scripts/duckdb` | 90 | 3 | 449 | 0 | 0/3 | 0 | — |
| ✅ | `sveltekit-frontend/scripts/engram` | 90 | 1 | 47 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/scripts/export` | 90 | 1 | 112 | 0 | 0/1 | 0 | — |
| ✅ | `sveltekit-frontend/scripts/features` | 90 | 6 | 358 | 0 | 0/4 | 0 | — |
| ✅ | `sveltekit-frontend/scripts/gpu` | 90 | 3 | 257 | 0 | 0/2 | 0 | — |
| ✅ | `sveltekit-frontend/scripts/health` | 90 | 1 | 277 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/scripts/ingest` | 90 | 2 | 245 | 0 | 0/1 | 0 | — |
| ✅ | `sveltekit-frontend/scripts/legal` | 90 | 2 | 135 | 0 | 0/1 | 0 | — |
| ✅ | `sveltekit-frontend/scripts/llms` | 90 | 5 | 1465 | 0 | 0/3 | 0 | — |
| ✅ | `sveltekit-frontend/scripts/mega-audit` | 90 | 4 | 619 | 0 | 0/3 | 0 | — |
| ✅ | `sveltekit-frontend/scripts/memory` | 90 | 2 | 102 | 0 | 0/2 | 0 | — |
| ✅ | `sveltekit-frontend/scripts/observability` | 90 | 1 | 20 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/scripts/opencode` | 90 | 16 | 3664 | 0 | 0/4 | 0 | — |
| ✅ | `sveltekit-frontend/scripts/operator` | 90 | 1 | 169 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/scripts/phase85` | 90 | 1 | 113 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/scripts/phase9` | 90 | 1 | 41 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/scripts/prompt-cache` | 90 | 1 | 49 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/scripts/qdrant` | 90 | 3 | 384 | 0 | 0/2 | 0 | — |
| ✅ | `sveltekit-frontend/scripts/reconstruction` | 90 | 4 | 439 | 0 | 0/1 | 0 | — |
| ✅ | `sveltekit-frontend/scripts/redis` | 90 | 2 | 93 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/scripts/reports` | 90 | 4 | 203 | 0 | 0/1 | 0 | — |
| ✅ | `sveltekit-frontend/scripts/rg-atlas` | 90 | 2 | 169 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/scripts/sidecars` | 90 | 3 | 14 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/scripts/skills` | 90 | 2 | 726 | 0 | 0/1 | 0 | — |
| ✅ | `sveltekit-frontend/scripts/synth` | 90 | 3 | 922 | 0 | 0/2 | 0 | — |
| ✅ | `sveltekit-frontend/scripts/tests/nes-arch` | 90 | 2 | 191 | 0 | 0/1 | 0 | — |
| ✅ | `sveltekit-frontend/scripts/tests/probes` | 90 | 3 | 88 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/scripts/tests/screenshots` | 90 | 1 | 1 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/scripts/tools` | 90 | 3 | 275 | 0 | 0/1 | 0 | — |
| ✅ | `sveltekit-frontend/scripts/turboquant` | 90 | 5 | 1501 | 0 | 0/4 | 0 | — |
| ✅ | `sveltekit-frontend/scripts/wiki` | 90 | 11 | 2999 | 0 | 0/6 | 0 | — |
| ✅ | `sveltekit-frontend/scripts/workers` | 90 | 3 | 472 | 0 | 0/1 | 0 | — |
| ✅ | `sveltekit-frontend/scripts/__fixtures__` | 90 | 1 | 28 | 0 | 0/1 | 0 | — |
| ✅ | `sveltekit-frontend/src/lib/agent` | 90 | 17 | 1579 | 0 | 0/2 | 0 | — |
| ✅ | `sveltekit-frontend/src/lib/cache` | 90 | 5 | 1046 | 0 | 0/1 | 0 | — |
| ✅ | `sveltekit-frontend/src/lib/canvas` | 90 | 1 | 15 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/src/lib/client` | 90 | 15 | 1772 | 0 | 0/5 | 0 | — |
| ✅ | `sveltekit-frontend/src/lib/collaboration` | 90 | 1 | 267 | 0 | 0/1 | 0 | — |
| ✅ | `sveltekit-frontend/src/lib/config` | 90 | 9 | 1803 | 0 | 1/2 | 0 | — |
| ✅ | `sveltekit-frontend/src/lib/courtroom` | 90 | 4 | 1561 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/src/lib/env` | 90 | 2 | 27 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/src/lib/features` | 90 | 6 | 546 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/src/lib/generated` | 90 | 10 | 38220 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/src/lib/graph` | 90 | 1 | 54 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/src/lib/icons` | 90 | 15 | 572 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/src/lib/machines` | 90 | 11 | 4094 | 0 | 0/1 | 0 | — |
| ✅ | `sveltekit-frontend/src/lib/mcp` | 90 | 2 | 11 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/src/lib/messaging` | 90 | 1 | 168 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/src/lib/runtime-cache` | 90 | 6 | 458 | 0 | 0/4 | 0 | — |
| ✅ | `sveltekit-frontend/src/lib/schemas` | 90 | 17 | 2264 | 0 | 0/9 | 0 | — |
| ✅ | `sveltekit-frontend/src/lib/services` | 90 | 6 | 763 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/src/lib/shared` | 90 | 5 | 284 | 0 | 0/1 | 0 | — |
| ✅ | `sveltekit-frontend/src/lib/state` | 90 | 1 | 8 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/src/lib/stores` | 90 | 27 | 5137 | 0 | 0/6 | 0 | — |
| ✅ | `sveltekit-frontend/src/lib/test-utils` | 90 | 1 | 11 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/src/lib/webgpu` | 90 | 28 | 6811 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/src/mcp/zod-to-json-schema-bridge` | 90 | 2 | 99 | 0 | 0/1 | 0 | — |
| ✅ | `sveltekit-frontend/src/routes/(admin)` | 90 | 3 | 634 | 0 | 3/0 | 0 | — |
| ✅ | `sveltekit-frontend/src/routes/(analysis)` | 90 | 8 | 2992 | 0 | 4/0 | 0 | ⬜notest |
| ✅ | `sveltekit-frontend/src/routes/(analysis)@` | 90 | 8 | 2719 | 0 | 4/0 | 0 | ⬜notest |
| ✅ | `sveltekit-frontend/src/routes/(dev)` | 90 | 13 | 2337 | 0 | 1/1 | 0 | ⬜notest |
| ✅ | `sveltekit-frontend/src/routes/debug` | 90 | 1 | 198 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/src/routes/minio` | 90 | 1 | 8 | 0 | 0/0 | 0 | ⬜notest |
| ✅ | `sveltekit-frontend/src/routes/seaweed` | 90 | 1 | 7 | 0 | 0/0 | 0 | ⬜notest |
| ✅ | `sveltekit-frontend/src/shims` | 90 | 1 | 1 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/src/stores` | 90 | 1 | 47 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/src/tests` | 90 | 1 | 10 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/src/wasm` | 90 | 2 | 524 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/src/workers` | 90 | 3 | 282 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/test` | 90 | 1 | 63 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/test-results` | 90 | 1 | 4 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/tests/accessibility` | 90 | 2 | 557 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/tests/agent` | 90 | 1 | 154 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/tests/atlas/graph` | 90 | 1 | 87 | 0 | 0/1 | 0 | — |
| ✅ | `sveltekit-frontend/tests/atlas/identity` | 90 | 14 | 1933 | 0 | 0/7 | 0 | — |
| ✅ | `sveltekit-frontend/tests/atlas/tensor-residency` | 90 | 8 | 104 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/tests/e2e/route-forensic` | 90 | 35 | 1750 | 0 | 4/0 | 0 | — |
| ✅ | `sveltekit-frontend/tests/e2e/utils` | 90 | 3 | 505 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/tests/fixtures` | 90 | 2 | 100 | 0 | 1/0 | 0 | — |
| ✅ | `sveltekit-frontend/tests/fixtures/repo-summary-ace` | 90 | 2 | 10 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/tests/gpu` | 90 | 5 | 1334 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/tests/hyperrag` | 90 | 1 | 166 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/tests/intent` | 90 | 3 | 498 | 0 | 0/1 | 0 | — |
| ✅ | `sveltekit-frontend/tests/mapreduce` | 90 | 1 | 217 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/tests/okf` | 90 | 1 | 300 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/tests/opencode` | 90 | 1 | 294 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/tests/reports` | 90 | 2 | 64 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/tests/retrieval` | 90 | 5 | 1005 | 0 | 0/1 | 0 | — |
| ✅ | `sveltekit-frontend/tests/routes/api` | 90 | 2 | 185 | 0 | 2/0 | 0 | — |
| ✅ | `sveltekit-frontend/tests/runes` | 90 | 1 | 230 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/tests/setup` | 90 | 1 | 226 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/tests/sw` | 90 | 1 | 97 | 0 | 0/1 | 0 | — |
| ✅ | `sveltekit-frontend/tests/telemetry` | 90 | 5 | 1727 | 0 | 0/5 | 0 | — |
| ✅ | `sveltekit-frontend/tests/utils` | 90 | 1 | 134 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/tmp/ace-context-snapshots` | 90 | 2 | 115 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/tmp/hypergraph` | 90 | 1 | 77108 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/tmp/uscode-extracted` | 90 | 1 | 83 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/uploads/audio` | 90 | 1 | 1 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/uploads/transcriptions` | 90 | 2 | 1388 | 0 | 0/0 | 0 | — |
| ✅ | `target/debug/.fingerprint/aho-corasick-bc86c200794d681e` | 90 | 1 | 1 | 0 | 0/0 | 0 | — |
| ✅ | `target/debug/.fingerprint/allocator-api2-4f80817a93fbc96a` | 90 | 1 | 1 | 0 | 0/0 | 0 | — |
| ✅ | `target/debug/.fingerprint/atlas-packet-parser-84d43970e8d34365` | 90 | 1 | 1 | 0 | 0/0 | 0 | — |
| ✅ | `target/debug/.fingerprint/atlas-packet-parser-99713ddf4c53dd73` | 90 | 1 | 1 | 0 | 0/0 | 0 | — |
| ✅ | `target/debug/.fingerprint/atlas-packet-parser-c060d2978a37fee2` | 90 | 1 | 1 | 0 | 0/0 | 0 | — |
| ✅ | `target/debug/.fingerprint/autocfg-ee0b183a9794409b` | 90 | 1 | 1 | 0 | 0/0 | 0 | — |
| ✅ | `target/debug/.fingerprint/bitflags-018eb6a8769f28ef` | 90 | 1 | 1 | 0 | 0/0 | 0 | — |
| ✅ | `target/debug/.fingerprint/cc-0d39c8a4fb8b6ce8` | 90 | 1 | 1 | 0 | 0/0 | 0 | — |
| ✅ | `target/debug/.fingerprint/cfg-if-4012590917ed07b2` | 90 | 1 | 1 | 0 | 0/0 | 0 | — |
| ✅ | `target/debug/.fingerprint/convert_case-1e19143595c88312` | 90 | 1 | 1 | 0 | 0/0 | 0 | — |
| ✅ | `target/debug/.fingerprint/crossbeam-deque-8584df8d9125e092` | 90 | 1 | 1 | 0 | 0/0 | 0 | — |
| ✅ | `target/debug/.fingerprint/crossbeam-deque-8a104f478b217722` | 90 | 1 | 1 | 0 | 0/0 | 0 | — |
| ✅ | `target/debug/.fingerprint/crossbeam-deque-d1ac1ce12bde2b1c` | 90 | 1 | 1 | 0 | 0/0 | 0 | — |
| ✅ | `target/debug/.fingerprint/crossbeam-epoch-6137687cad5d8faf` | 90 | 1 | 1 | 0 | 0/0 | 0 | — |
| ✅ | `target/debug/.fingerprint/crossbeam-epoch-737390b74c87aa81` | 90 | 1 | 1 | 0 | 0/0 | 0 | — |
| ✅ | `target/debug/.fingerprint/crossbeam-epoch-96e292bf6196e586` | 90 | 1 | 1 | 0 | 0/0 | 0 | — |
| ✅ | `target/debug/.fingerprint/crossbeam-utils-474aeeaec568f18f` | 90 | 1 | 1 | 0 | 0/0 | 0 | — |
| ✅ | `target/debug/.fingerprint/crossbeam-utils-96d119fc0e9bb4a9` | 90 | 1 | 1 | 0 | 0/0 | 0 | — |
| ✅ | `target/debug/.fingerprint/crossbeam-utils-e2181e3276d8e595` | 90 | 1 | 1 | 0 | 0/0 | 0 | — |
| ✅ | `target/debug/.fingerprint/ctor-ad21f856acc2b4f0` | 90 | 1 | 1 | 0 | 0/0 | 0 | — |
| ✅ | `target/debug/.fingerprint/either-72c737255a12e846` | 90 | 1 | 1 | 0 | 0/0 | 0 | — |
| ✅ | `target/debug/.fingerprint/equivalent-f9867ec3b95f0550` | 90 | 1 | 1 | 0 | 0/0 | 0 | — |
| ✅ | `target/debug/.fingerprint/find-msvc-tools-fe4c5cc8ad09b83d` | 90 | 1 | 1 | 0 | 0/0 | 0 | — |
| ✅ | `target/debug/.fingerprint/float-cmp-62b81d20b3358d8f` | 90 | 1 | 1 | 0 | 0/0 | 0 | — |
| ✅ | `target/debug/.fingerprint/foldhash-23722432d1bbb6c0` | 90 | 1 | 1 | 0 | 0/0 | 0 | — |
| ✅ | `target/debug/.fingerprint/halfbrown-57247b0c95545b87` | 90 | 1 | 1 | 0 | 0/0 | 0 | — |
| ✅ | `target/debug/.fingerprint/hashbrown-89c99b7de4c63a60` | 90 | 1 | 1 | 0 | 0/0 | 0 | — |
| ✅ | `target/debug/.fingerprint/itoa-2671aa452abccd39` | 90 | 1 | 1 | 0 | 0/0 | 0 | — |
| ✅ | `target/debug/.fingerprint/libloading-4d1f46c8a12dbd41` | 90 | 1 | 1 | 0 | 0/0 | 0 | — |
| ✅ | `target/debug/.fingerprint/memchr-3307b706fd845c51` | 90 | 1 | 1 | 0 | 0/0 | 0 | — |
| ✅ | `target/debug/.fingerprint/napi-afd0464026489978` | 90 | 1 | 1 | 0 | 0/0 | 0 | — |
| ✅ | `target/debug/.fingerprint/napi-build-5a4f30ff7b389a69` | 90 | 1 | 1 | 0 | 0/0 | 0 | — |
| ✅ | `target/debug/.fingerprint/napi-d728cfb0cc0c9a0b` | 90 | 1 | 1 | 0 | 0/0 | 0 | — |
| ✅ | `target/debug/.fingerprint/napi-derive-03641936c3c1130a` | 90 | 1 | 1 | 0 | 0/0 | 0 | — |
| ✅ | `target/debug/.fingerprint/napi-derive-backend-d2da1bcf04ef60e8` | 90 | 1 | 1 | 0 | 0/0 | 0 | — |
| ✅ | `target/debug/.fingerprint/napi-sys-1d899085bfd23929` | 90 | 1 | 1 | 0 | 0/0 | 0 | — |
| ✅ | `target/debug/.fingerprint/napi-sys-f0c6a4980feca819` | 90 | 1 | 1 | 0 | 0/0 | 0 | — |
| ✅ | `target/debug/.fingerprint/num-traits-04c98397ed078858` | 90 | 1 | 1 | 0 | 0/0 | 0 | — |
| ✅ | `target/debug/.fingerprint/num-traits-1509a42175fe9272` | 90 | 1 | 1 | 0 | 0/0 | 0 | — |
| ✅ | `target/debug/.fingerprint/num-traits-31e06e834ae438fd` | 90 | 1 | 1 | 0 | 0/0 | 0 | — |
| ✅ | `target/debug/.fingerprint/num-traits-43283f708094b5bc` | 90 | 1 | 1 | 0 | 0/0 | 0 | — |
| ✅ | `target/debug/.fingerprint/num-traits-b191203b188409b8` | 90 | 1 | 1 | 0 | 0/0 | 0 | — |
| ✅ | `target/debug/.fingerprint/num-traits-ca4b2dc13b8bffcb` | 90 | 1 | 1 | 0 | 0/0 | 0 | — |
| ✅ | `target/debug/.fingerprint/once_cell-2565311cad9f2da9` | 90 | 1 | 1 | 0 | 0/0 | 0 | — |
| ✅ | `target/debug/.fingerprint/pin-project-lite-f7bef5802155e12f` | 90 | 1 | 1 | 0 | 0/0 | 0 | — |
| ✅ | `target/debug/.fingerprint/proc-macro2-1ee42b6c742a59e7` | 90 | 1 | 1 | 0 | 0/0 | 0 | — |
| ✅ | `target/debug/.fingerprint/proc-macro2-ca58a38ba27dfb31` | 90 | 1 | 1 | 0 | 0/0 | 0 | — |
| ✅ | `target/debug/.fingerprint/proc-macro2-f9487b91b7e570b0` | 90 | 1 | 1 | 0 | 0/0 | 0 | — |
| ✅ | `target/debug/.fingerprint/quote-34a3a0f4e7c216e9` | 90 | 1 | 1 | 0 | 0/0 | 0 | — |
| ✅ | `target/debug/.fingerprint/quote-665e78b465b28693` | 90 | 1 | 1 | 0 | 0/0 | 0 | — |
| ✅ | `target/debug/.fingerprint/quote-954c5d7ad37e79b1` | 90 | 1 | 1 | 0 | 0/0 | 0 | — |
| ✅ | `target/debug/.fingerprint/rayon-90958d1a3a2ce81c` | 90 | 1 | 1 | 0 | 0/0 | 0 | — |
| ✅ | `target/debug/.fingerprint/rayon-core-0e1fca6e04198194` | 90 | 1 | 1 | 0 | 0/0 | 0 | — |
| ✅ | `target/debug/.fingerprint/rayon-core-19a82fea4249ea90` | 90 | 1 | 1 | 0 | 0/0 | 0 | — |
| ✅ | `target/debug/.fingerprint/rayon-core-4c9162099a852180` | 90 | 1 | 1 | 0 | 0/0 | 0 | — |
| ✅ | `target/debug/.fingerprint/ref-cast-3a54d1b8f0e1fce4` | 90 | 1 | 1 | 0 | 0/0 | 0 | — |
| ✅ | `target/debug/.fingerprint/ref-cast-94fd31f070f698a7` | 90 | 1 | 1 | 0 | 0/0 | 0 | — |
| ✅ | `target/debug/.fingerprint/ref-cast-e1d9bb021b908de6` | 90 | 1 | 1 | 0 | 0/0 | 0 | — |
| ✅ | `target/debug/.fingerprint/ref-cast-impl-0142c891e0ae2cca` | 90 | 1 | 1 | 0 | 0/0 | 0 | — |
| ✅ | `target/debug/.fingerprint/regex-48f72b56f33c402b` | 90 | 1 | 1 | 0 | 0/0 | 0 | — |
| ✅ | `target/debug/.fingerprint/regex-automata-1646e34df9e8ee6a` | 90 | 1 | 1 | 0 | 0/0 | 0 | — |
| ✅ | `target/debug/.fingerprint/regex-syntax-edf6ca3983062f0c` | 90 | 1 | 1 | 0 | 0/0 | 0 | — |
| ✅ | `target/debug/.fingerprint/rmp-970fc617b1a1ee0e` | 90 | 1 | 1 | 0 | 0/0 | 0 | — |
| ✅ | `target/debug/.fingerprint/rmp-serde-9e9e37d748d7f1cd` | 90 | 1 | 1 | 0 | 0/0 | 0 | — |
| ✅ | `target/debug/.fingerprint/ryu-b98bae970ed73c83` | 90 | 1 | 1 | 0 | 0/0 | 0 | — |
| ✅ | `target/debug/.fingerprint/semver-916a15b4720e667e` | 90 | 1 | 1 | 0 | 0/0 | 0 | — |
| ✅ | `target/debug/.fingerprint/serde-1b47b788d9fda1d3` | 90 | 1 | 1 | 0 | 0/0 | 0 | — |
| ✅ | `target/debug/.fingerprint/serde-357d3b5b4b9ed41c` | 90 | 1 | 1 | 0 | 0/0 | 0 | — |
| ✅ | `target/debug/.fingerprint/serde-3d9793cf71552ad4` | 90 | 1 | 1 | 0 | 0/0 | 0 | — |
| ✅ | `target/debug/.fingerprint/serde-e550357d72c60d01` | 90 | 1 | 1 | 0 | 0/0 | 0 | — |
| ✅ | `target/debug/.fingerprint/serde_core-39f4109a74a177d2` | 90 | 1 | 1 | 0 | 0/0 | 0 | — |
| ✅ | `target/debug/.fingerprint/serde_core-4bee13a9cd518e92` | 90 | 1 | 1 | 0 | 0/0 | 0 | — |
| ✅ | `target/debug/.fingerprint/serde_core-6d72a86fbc029849` | 90 | 1 | 1 | 0 | 0/0 | 0 | — |
| ✅ | `target/debug/.fingerprint/serde_derive-bf02fca308021c20` | 90 | 1 | 1 | 0 | 0/0 | 0 | — |
| ✅ | `target/debug/.fingerprint/serde_derive-dbefb4bc99897b0c` | 90 | 1 | 1 | 0 | 0/0 | 0 | — |
| ✅ | `target/debug/.fingerprint/serde_json-263474a6bf72c81a` | 90 | 1 | 1 | 0 | 0/0 | 0 | — |
| ✅ | `target/debug/.fingerprint/serde_json-c243626af514ec1f` | 90 | 1 | 1 | 0 | 0/0 | 0 | — |
| ✅ | `target/debug/.fingerprint/serde_json-fed635937294a5b9` | 90 | 1 | 1 | 0 | 0/0 | 0 | — |
| ✅ | `target/debug/.fingerprint/shlex-1e06b1397622c812` | 90 | 1 | 1 | 0 | 0/0 | 0 | — |
| ✅ | `target/debug/.fingerprint/simd-json-89b8319116ef6bd7` | 90 | 1 | 1 | 0 | 0/0 | 0 | — |
| ✅ | `target/debug/.fingerprint/simdutf8-32528fc05f49967d` | 90 | 1 | 1 | 0 | 0/0 | 0 | — |
| ✅ | `target/debug/.fingerprint/simd_bridge_rs-6fa10773e4154e27` | 90 | 1 | 1 | 0 | 0/0 | 0 | — |
| ✅ | `target/debug/.fingerprint/simd_bridge_rs-a6d5dc3b475e1b51` | 90 | 1 | 1 | 0 | 0/0 | 0 | — |
| ✅ | `target/debug/.fingerprint/simd_bridge_rs-d61224ec69911ec9` | 90 | 1 | 1 | 0 | 0/0 | 0 | — |
| ✅ | `target/debug/.fingerprint/syn-52ed5a54e9c9ae8b` | 90 | 1 | 1 | 0 | 0/0 | 0 | — |
| ✅ | `target/debug/.fingerprint/syn-5fc9dbda8ed1fae0` | 90 | 1 | 1 | 0 | 0/0 | 0 | — |
| ✅ | `target/debug/.fingerprint/syn-cb577d60aea957ee` | 90 | 1 | 1 | 0 | 0/0 | 0 | — |
| ✅ | `target/debug/.fingerprint/tokio-224a61548954722c` | 90 | 1 | 1 | 0 | 0/0 | 0 | — |
| ✅ | `target/debug/.fingerprint/unicode-ident-c4d59c830f3cfbb4` | 90 | 1 | 1 | 0 | 0/0 | 0 | — |
| ✅ | `target/debug/.fingerprint/unicode-segmentation-b118d1ba020d2b37` | 90 | 1 | 1 | 0 | 0/0 | 0 | — |
| ✅ | `target/debug/.fingerprint/value-trait-9b9ab2c01a8ede4a` | 90 | 1 | 1 | 0 | 0/0 | 0 | — |
| ✅ | `target/debug/.fingerprint/windows-link-d2f160bb0547be5e` | 90 | 1 | 1 | 0 | 0/0 | 0 | — |
| ✅ | `target/debug/.fingerprint/zmij-23e62730429d0958` | 90 | 1 | 1 | 0 | 0/0 | 0 | — |
| ✅ | `target/debug/.fingerprint/zmij-3cf01cd5a3363f72` | 90 | 1 | 1 | 0 | 0/0 | 0 | — |
| ✅ | `target/debug/.fingerprint/zmij-728d2819a489644a` | 90 | 1 | 1 | 0 | 0/0 | 0 | — |
| ✅ | `target/release/.fingerprint/aho-corasick-2983681f72861fff` | 90 | 1 | 1 | 0 | 0/0 | 0 | — |
| ✅ | `target/release/.fingerprint/allocator-api2-10b63ad371e629ae` | 90 | 1 | 1 | 0 | 0/0 | 0 | — |
| ✅ | `target/release/.fingerprint/approx-f96a71c61308ca0d` | 90 | 1 | 1 | 0 | 0/0 | 0 | — |
| ✅ | `target/release/.fingerprint/autocfg-dffea52b2fef0de4` | 90 | 1 | 1 | 0 | 0/0 | 0 | — |
| ✅ | `target/release/.fingerprint/bitflags-7db5a06aede74825` | 90 | 1 | 1 | 0 | 0/0 | 0 | — |
| ✅ | `target/release/.fingerprint/bytemuck-dcf4dcdded1e53ac` | 90 | 1 | 1 | 0 | 0/0 | 0 | — |
| ✅ | `target/release/.fingerprint/byteorder-ad1b4350d3041e28` | 90 | 1 | 1 | 0 | 0/0 | 0 | — |
| ✅ | `target/release/.fingerprint/cfg-if-167e7ae76158a6d7` | 90 | 1 | 1 | 0 | 0/0 | 0 | — |
| ✅ | `target/release/.fingerprint/cfg-if-60c5f5237e319146` | 90 | 1 | 1 | 0 | 0/0 | 0 | — |
| ✅ | `target/release/.fingerprint/coe-rs-140500361319daec` | 90 | 1 | 1 | 0 | 0/0 | 0 | — |
| ✅ | `target/release/.fingerprint/convert_case-0bf34efbf8436e3d` | 90 | 1 | 1 | 0 | 0/0 | 0 | — |
| ✅ | `target/release/.fingerprint/crossbeam-deque-658192342e828385` | 90 | 1 | 1 | 0 | 0/0 | 0 | — |
| ✅ | `target/release/.fingerprint/crossbeam-deque-734101998450c379` | 90 | 1 | 1 | 0 | 0/0 | 0 | — |
| ✅ | `target/release/.fingerprint/crossbeam-deque-bc0636378321967a` | 90 | 1 | 1 | 0 | 0/0 | 0 | — |
| ✅ | `target/release/.fingerprint/crossbeam-epoch-2e17923fcdd13022` | 90 | 1 | 1 | 0 | 0/0 | 0 | — |
| ✅ | `target/release/.fingerprint/crossbeam-epoch-6ae7351e11f1007f` | 90 | 1 | 1 | 0 | 0/0 | 0 | — |
| ✅ | `target/release/.fingerprint/crossbeam-epoch-acdde96ad1daf855` | 90 | 1 | 1 | 0 | 0/0 | 0 | — |
| ✅ | `target/release/.fingerprint/crossbeam-utils-4b9882eb757a3f77` | 90 | 1 | 1 | 0 | 0/0 | 0 | — |
| ✅ | `target/release/.fingerprint/crossbeam-utils-9524e36e504c87fc` | 90 | 1 | 1 | 0 | 0/0 | 0 | — |
| ✅ | `target/release/.fingerprint/crossbeam-utils-eecd485bce9a7214` | 90 | 1 | 1 | 0 | 0/0 | 0 | — |
| ✅ | `target/release/.fingerprint/ctor-036a98cef1119827` | 90 | 1 | 1 | 0 | 0/0 | 0 | — |
| ✅ | `target/release/.fingerprint/dbgf-777f1a0e65e55698` | 90 | 1 | 1 | 0 | 0/0 | 0 | — |
| ✅ | `target/release/.fingerprint/dyn-stack-19f2cc33cb7cf40f` | 90 | 1 | 1 | 0 | 0/0 | 0 | — |
| ✅ | `target/release/.fingerprint/dyn-stack-4401d7992b482ab6` | 90 | 1 | 1 | 0 | 0/0 | 0 | — |
| ✅ | `target/release/.fingerprint/dyn-stack-macros-156446c181357059` | 90 | 1 | 1 | 0 | 0/0 | 0 | — |
| ✅ | `target/release/.fingerprint/either-65a6e504f07e829a` | 90 | 1 | 1 | 0 | 0/0 | 0 | — |
| ✅ | `target/release/.fingerprint/equator-732975220bca3e64` | 90 | 1 | 1 | 0 | 0/0 | 0 | — |
| ✅ | `target/release/.fingerprint/equator-9381d2457ff4dd5f` | 90 | 1 | 1 | 0 | 0/0 | 0 | — |
| ✅ | `target/release/.fingerprint/equator-macro-3be3d57b293d38bc` | 90 | 1 | 1 | 0 | 0/0 | 0 | — |
| ✅ | `target/release/.fingerprint/equator-macro-48d5eecc0315924a` | 90 | 1 | 1 | 0 | 0/0 | 0 | — |
| ✅ | `target/release/.fingerprint/equivalent-6b36a1a246234fb3` | 90 | 1 | 1 | 0 | 0/0 | 0 | — |
| ✅ | `target/release/.fingerprint/faer-3d13c6e71526269d` | 90 | 1 | 1 | 0 | 0/0 | 0 | — |
| ✅ | `target/release/.fingerprint/faer-entity-c48dcca96653cf9f` | 90 | 1 | 1 | 0 | 0/0 | 0 | — |
| ✅ | `target/release/.fingerprint/float-cmp-c7c0a3d7947332d1` | 90 | 1 | 1 | 0 | 0/0 | 0 | — |
| ✅ | `target/release/.fingerprint/foldhash-0a2997dcca70d199` | 90 | 1 | 1 | 0 | 0/0 | 0 | — |
| ✅ | `target/release/.fingerprint/gemm-40fa23769b292699` | 90 | 1 | 1 | 0 | 0/0 | 0 | — |
| ✅ | `target/release/.fingerprint/gemm-c32-42f8ee365df8e944` | 90 | 1 | 1 | 0 | 0/0 | 0 | — |
| ✅ | `target/release/.fingerprint/gemm-c64-7fd3172e66b8dc4d` | 90 | 1 | 1 | 0 | 0/0 | 0 | — |
| ✅ | `target/release/.fingerprint/gemm-common-525906e7b9628190` | 90 | 1 | 1 | 0 | 0/0 | 0 | — |
| ✅ | `target/release/.fingerprint/gemm-f32-1ae2d54318212109` | 90 | 1 | 1 | 0 | 0/0 | 0 | — |
| ✅ | `target/release/.fingerprint/gemm-f64-e848958c543fb506` | 90 | 1 | 1 | 0 | 0/0 | 0 | — |
| ✅ | `target/release/.fingerprint/generativity-2d6a55a7d18b7e57` | 90 | 1 | 1 | 0 | 0/0 | 0 | — |
| ✅ | `target/release/.fingerprint/getrandom-dbfa14490e47c3e9` | 90 | 1 | 1 | 0 | 0/0 | 0 | — |
| ✅ | `target/release/.fingerprint/halfbrown-24763e6682cf44d5` | 90 | 1 | 1 | 0 | 0/0 | 0 | — |
| ✅ | `target/release/.fingerprint/hashbrown-3ae2328bf07ee6bb` | 90 | 1 | 1 | 0 | 0/0 | 0 | — |
| ✅ | `target/release/.fingerprint/itoa-ac49bc49c0e35dc8` | 90 | 1 | 1 | 0 | 0/0 | 0 | — |
| ✅ | `target/release/.fingerprint/libloading-3b0e23855926f89b` | 90 | 1 | 1 | 0 | 0/0 | 0 | — |
| ✅ | `target/release/.fingerprint/libm-09461ba1f39eb432` | 90 | 1 | 1 | 0 | 0/0 | 0 | — |
| ✅ | `target/release/.fingerprint/libm-30f6387f5269ca87` | 90 | 1 | 1 | 0 | 0/0 | 0 | — |
| ✅ | `target/release/.fingerprint/libm-3508b0f9a6e79f97` | 90 | 1 | 1 | 0 | 0/0 | 0 | — |
| ✅ | `target/release/.fingerprint/matrixcompare-47ab2ff256a57603` | 90 | 1 | 1 | 0 | 0/0 | 0 | — |
| ✅ | `target/release/.fingerprint/matrixcompare-core-401a42e71e8dbbaf` | 90 | 1 | 1 | 0 | 0/0 | 0 | — |
| ✅ | `target/release/.fingerprint/matrixmultiply-8df0f65a15b15ac8` | 90 | 1 | 1 | 0 | 0/0 | 0 | — |
| ✅ | `target/release/.fingerprint/matrixmultiply-8ef4281dcec05c93` | 90 | 1 | 1 | 0 | 0/0 | 0 | — |
| ✅ | `target/release/.fingerprint/matrixmultiply-e5d723dab857c523` | 90 | 1 | 1 | 0 | 0/0 | 0 | — |
| ✅ | `target/release/.fingerprint/memchr-7c2f0518e0b47927` | 90 | 1 | 1 | 0 | 0/0 | 0 | — |
| ✅ | `target/release/.fingerprint/memchr-82ae25b86da6e69b` | 90 | 1 | 1 | 0 | 0/0 | 0 | — |
| ✅ | `target/release/.fingerprint/nalgebra-69abc5ef8c1b8ccf` | 90 | 1 | 1 | 0 | 0/0 | 0 | — |
| ✅ | `target/release/.fingerprint/nalgebra-macros-853b7ba91b534245` | 90 | 1 | 1 | 0 | 0/0 | 0 | — |
| ✅ | `target/release/.fingerprint/nano-gemm-84dbeb6c05c48588` | 90 | 1 | 1 | 0 | 0/0 | 0 | — |
| ✅ | `target/release/.fingerprint/nano-gemm-c32-721197a46ddd9aa5` | 90 | 1 | 1 | 0 | 0/0 | 0 | — |
| ✅ | `target/release/.fingerprint/nano-gemm-c32-7b736b175aa1a8e3` | 90 | 1 | 1 | 0 | 0/0 | 0 | — |
| ✅ | `target/release/.fingerprint/nano-gemm-c32-a8d5ed8681906acf` | 90 | 1 | 1 | 0 | 0/0 | 0 | — |
| ✅ | `target/release/.fingerprint/nano-gemm-c64-7a92dcc797b4874c` | 90 | 1 | 1 | 0 | 0/0 | 0 | — |
| ✅ | `target/release/.fingerprint/nano-gemm-c64-bc37478a9cf6dbcb` | 90 | 1 | 1 | 0 | 0/0 | 0 | — |
| ✅ | `target/release/.fingerprint/nano-gemm-c64-bea09232cad7d073` | 90 | 1 | 1 | 0 | 0/0 | 0 | — |
| ✅ | `target/release/.fingerprint/nano-gemm-codegen-2d52a92c6eecf0d5` | 90 | 1 | 1 | 0 | 0/0 | 0 | — |
| ✅ | `target/release/.fingerprint/nano-gemm-core-b24cd808dc8fde58` | 90 | 1 | 1 | 0 | 0/0 | 0 | — |
| ✅ | `target/release/.fingerprint/nano-gemm-f32-1508a81e6c443034` | 90 | 1 | 1 | 0 | 0/0 | 0 | — |
| ✅ | `target/release/.fingerprint/nano-gemm-f32-b39df7c5e72ef620` | 90 | 1 | 1 | 0 | 0/0 | 0 | — |
| ✅ | `target/release/.fingerprint/nano-gemm-f32-fa4a95ab0303cfab` | 90 | 1 | 1 | 0 | 0/0 | 0 | — |
| ✅ | `target/release/.fingerprint/nano-gemm-f64-9af305e2c9a66a89` | 90 | 1 | 1 | 0 | 0/0 | 0 | — |
| ✅ | `target/release/.fingerprint/nano-gemm-f64-d9814cdd33ad3d42` | 90 | 1 | 1 | 0 | 0/0 | 0 | — |
| ✅ | `target/release/.fingerprint/nano-gemm-f64-e43290bcd199c32a` | 90 | 1 | 1 | 0 | 0/0 | 0 | — |
| ✅ | `target/release/.fingerprint/napi-build-d7332897cde4a984` | 90 | 1 | 1 | 0 | 0/0 | 0 | — |
| ✅ | `target/release/.fingerprint/napi-derive-07f9583271126062` | 90 | 1 | 1 | 0 | 0/0 | 0 | — |
| ✅ | `target/release/.fingerprint/napi-derive-backend-bf34f865c286b300` | 90 | 1 | 1 | 0 | 0/0 | 0 | — |
| ✅ | `target/release/.fingerprint/napi-e42e09e5663f1fd4` | 90 | 1 | 1 | 0 | 0/0 | 0 | — |
| ✅ | `target/release/.fingerprint/napi-sys-ce65ac434e4b315c` | 90 | 1 | 1 | 0 | 0/0 | 0 | — |
| ✅ | `target/release/.fingerprint/ndarray-1c6e294a7f51433d` | 90 | 1 | 1 | 0 | 0/0 | 0 | — |
| ✅ | `target/release/.fingerprint/npyz-19bb8b2980abb302` | 90 | 1 | 1 | 0 | 0/0 | 0 | — |
| ✅ | `target/release/.fingerprint/num-bigint-3c6b9349d90b0d4e` | 90 | 1 | 1 | 0 | 0/0 | 0 | — |
| ✅ | `target/release/.fingerprint/num-complex-0e77abebc9d87a3e` | 90 | 1 | 1 | 0 | 0/0 | 0 | — |
| ✅ | `target/release/.fingerprint/num-integer-92b651f086e614bb` | 90 | 1 | 1 | 0 | 0/0 | 0 | — |
| ✅ | `target/release/.fingerprint/num-rational-8d3ae59537190fff` | 90 | 1 | 1 | 0 | 0/0 | 0 | — |
| ✅ | `target/release/.fingerprint/num-traits-0d209c6ed7adbb9c` | 90 | 1 | 1 | 0 | 0/0 | 0 | — |
| ✅ | `target/release/.fingerprint/num-traits-8dfac53448569d4c` | 90 | 1 | 1 | 0 | 0/0 | 0 | — |
| ✅ | `target/release/.fingerprint/num-traits-97f665724ea1c900` | 90 | 1 | 1 | 0 | 0/0 | 0 | — |
| ✅ | `target/release/.fingerprint/once_cell-2afcbd1daf9e3394` | 90 | 1 | 1 | 0 | 0/0 | 0 | — |
| ✅ | `target/release/.fingerprint/once_cell-bbfd4f2bce8f4e0e` | 90 | 1 | 1 | 0 | 0/0 | 0 | — |
| ✅ | `target/release/.fingerprint/ordered-float-72dd62de075cacb6` | 90 | 1 | 1 | 0 | 0/0 | 0 | — |
| ✅ | `target/release/.fingerprint/paste-0b1dd46db813601e` | 90 | 1 | 1 | 0 | 0/0 | 0 | — |
| ✅ | `target/release/.fingerprint/paste-43c355f4a40038cf` | 90 | 1 | 1 | 0 | 0/0 | 0 | — |
| ✅ | `target/release/.fingerprint/paste-c001bbdca7909880` | 90 | 1 | 1 | 0 | 0/0 | 0 | — |
| ✅ | `target/release/.fingerprint/pest-82ff8766ce5b9f9c` | 90 | 1 | 1 | 0 | 0/0 | 0 | — |
| ✅ | `target/release/.fingerprint/pest-cc3f6f5a862c6a7c` | 90 | 1 | 1 | 0 | 0/0 | 0 | — |
| ✅ | `target/release/.fingerprint/pest_derive-32187d31c4c8f588` | 90 | 1 | 1 | 0 | 0/0 | 0 | — |
| ✅ | `target/release/.fingerprint/pest_generator-fbe084b7dc63edf3` | 90 | 1 | 1 | 0 | 0/0 | 0 | — |
| ✅ | `target/release/.fingerprint/pest_meta-d0fcb87e41680317` | 90 | 1 | 1 | 0 | 0/0 | 0 | — |
| ✅ | `target/release/.fingerprint/pin-project-lite-bc3b7cfa74d7bcd3` | 90 | 1 | 1 | 0 | 0/0 | 0 | — |
| ✅ | `target/release/.fingerprint/ppv-lite86-41574960b8c10422` | 90 | 1 | 1 | 0 | 0/0 | 0 | — |
| ✅ | `target/release/.fingerprint/proc-macro2-357114fa3fffe789` | 90 | 1 | 1 | 0 | 0/0 | 0 | — |
| ✅ | `target/release/.fingerprint/proc-macro2-8545f974460e59e4` | 90 | 1 | 1 | 0 | 0/0 | 0 | — |
| ✅ | `target/release/.fingerprint/proc-macro2-8aa96fa60b3665c0` | 90 | 1 | 1 | 0 | 0/0 | 0 | — |
| ✅ | `target/release/.fingerprint/pulp-17ab1b6f864f937d` | 90 | 1 | 1 | 0 | 0/0 | 0 | — |
| ✅ | `target/release/.fingerprint/pulp-4984c96a6783c969` | 90 | 1 | 1 | 0 | 0/0 | 0 | — |
| ✅ | `target/release/.fingerprint/pulp-8cd1b5dd85727b1b` | 90 | 1 | 1 | 0 | 0/0 | 0 | — |
| ✅ | `target/release/.fingerprint/pulp-e85da758134ed01c` | 90 | 1 | 1 | 0 | 0/0 | 0 | — |
| ✅ | `target/release/.fingerprint/py_literal-326c6e663200a5ae` | 90 | 1 | 1 | 0 | 0/0 | 0 | — |
| ✅ | `target/release/.fingerprint/quote-48548cb77534fb77` | 90 | 1 | 1 | 0 | 0/0 | 0 | — |
| ✅ | `target/release/.fingerprint/quote-56986d9daf06a1a9` | 90 | 1 | 1 | 0 | 0/0 | 0 | — |
| ✅ | `target/release/.fingerprint/quote-667dac9dbf021bf1` | 90 | 1 | 1 | 0 | 0/0 | 0 | — |
| ✅ | `target/release/.fingerprint/rand-6952b937864d8e50` | 90 | 1 | 1 | 0 | 0/0 | 0 | — |
| ✅ | `target/release/.fingerprint/rand_chacha-69e12c056217b535` | 90 | 1 | 1 | 0 | 0/0 | 0 | — |
| ✅ | `target/release/.fingerprint/rand_core-f43b8dd4df806092` | 90 | 1 | 1 | 0 | 0/0 | 0 | — |
| ✅ | `target/release/.fingerprint/rand_distr-2edd46b53b18a0be` | 90 | 1 | 1 | 0 | 0/0 | 0 | — |
| ✅ | `target/release/.fingerprint/raw-cpuid-0abf27446cf1b8a0` | 90 | 1 | 1 | 0 | 0/0 | 0 | — |
| ✅ | `target/release/.fingerprint/rawpointer-6611d9244f9d8527` | 90 | 1 | 1 | 0 | 0/0 | 0 | — |
| ✅ | `target/release/.fingerprint/rayon-core-13e6fde9a41f3709` | 90 | 1 | 1 | 0 | 0/0 | 0 | — |
| ✅ | `target/release/.fingerprint/rayon-core-1c18410a8d54787f` | 90 | 1 | 1 | 0 | 0/0 | 0 | — |
| ✅ | `target/release/.fingerprint/rayon-core-88eee42ec080f75f` | 90 | 1 | 1 | 0 | 0/0 | 0 | — |
| ✅ | `target/release/.fingerprint/rayon-dd089f12b0cc9f46` | 90 | 1 | 1 | 0 | 0/0 | 0 | — |
| ✅ | `target/release/.fingerprint/reborrow-4396c07a03ba5b2e` | 90 | 1 | 1 | 0 | 0/0 | 0 | — |
| ✅ | `target/release/.fingerprint/ref-cast-2ddd9cc480b34b26` | 90 | 1 | 1 | 0 | 0/0 | 0 | — |
| ✅ | `target/release/.fingerprint/ref-cast-4c85ea0626e9633f` | 90 | 1 | 1 | 0 | 0/0 | 0 | — |
| ✅ | `target/release/.fingerprint/ref-cast-dea9530db3fe6177` | 90 | 1 | 1 | 0 | 0/0 | 0 | — |
| ✅ | `target/release/.fingerprint/ref-cast-impl-87c95567c18ec35d` | 90 | 1 | 1 | 0 | 0/0 | 0 | — |
| ✅ | `target/release/.fingerprint/regex-4df14b9e980bf94d` | 90 | 1 | 1 | 0 | 0/0 | 0 | — |
| ✅ | `target/release/.fingerprint/regex-automata-eedb146b74153a04` | 90 | 1 | 1 | 0 | 0/0 | 0 | — |
| ✅ | `target/release/.fingerprint/regex-syntax-a286c4780aee4796` | 90 | 1 | 1 | 0 | 0/0 | 0 | — |
| ✅ | `target/release/.fingerprint/rmp-6a262f34f7134261` | 90 | 1 | 1 | 0 | 0/0 | 0 | — |
| ✅ | `target/release/.fingerprint/rmp-serde-27059f3a6e16a8e8` | 90 | 1 | 1 | 0 | 0/0 | 0 | — |
| ✅ | `target/release/.fingerprint/rustc-hash-3e6410de95d3cd50` | 90 | 1 | 1 | 0 | 0/0 | 0 | — |
| ✅ | `target/release/.fingerprint/ryu-e91df3175f362de8` | 90 | 1 | 1 | 0 | 0/0 | 0 | — |
| ✅ | `target/release/.fingerprint/safe_arch-78b6663923afb5f8` | 90 | 1 | 1 | 0 | 0/0 | 0 | — |
| ✅ | `target/release/.fingerprint/semver-501a42469de523e3` | 90 | 1 | 1 | 0 | 0/0 | 0 | — |
| ✅ | `target/release/.fingerprint/seq-macro-d25230b2641043a0` | 90 | 1 | 1 | 0 | 0/0 | 0 | — |
| ✅ | `target/release/.fingerprint/serde-a58757e1669c87d4` | 90 | 1 | 1 | 0 | 0/0 | 0 | — |
| ✅ | `target/release/.fingerprint/serde-a907d0c0ec011b0e` | 90 | 1 | 1 | 0 | 0/0 | 0 | — |
| ✅ | `target/release/.fingerprint/serde-af81eaad7752f696` | 90 | 1 | 1 | 0 | 0/0 | 0 | — |
| ✅ | `target/release/.fingerprint/serde_core-7eb8588ce3b569eb` | 90 | 1 | 1 | 0 | 0/0 | 0 | — |
| ✅ | `target/release/.fingerprint/serde_core-c5c76166a63fcb61` | 90 | 1 | 1 | 0 | 0/0 | 0 | — |
| ✅ | `target/release/.fingerprint/serde_core-c8ca852287a2d045` | 90 | 1 | 1 | 0 | 0/0 | 0 | — |
| ✅ | `target/release/.fingerprint/serde_derive-f184aac7db6cf52c` | 90 | 1 | 1 | 0 | 0/0 | 0 | — |
| ✅ | `target/release/.fingerprint/serde_json-0dcb0d6b153c67c4` | 90 | 1 | 1 | 0 | 0/0 | 0 | — |
| ✅ | `target/release/.fingerprint/serde_json-109ec29587a82e18` | 90 | 1 | 1 | 0 | 0/0 | 0 | — |
| ✅ | `target/release/.fingerprint/serde_json-234518261557c5f3` | 90 | 1 | 1 | 0 | 0/0 | 0 | — |
| ✅ | `target/release/.fingerprint/simba-61448c9b0870f44e` | 90 | 1 | 1 | 0 | 0/0 | 0 | — |
| ✅ | `target/release/.fingerprint/simd-json-2a622b58db900fd1` | 90 | 1 | 1 | 0 | 0/0 | 0 | — |
| ✅ | `target/release/.fingerprint/simdutf8-fa2cd73e6fd82227` | 90 | 1 | 1 | 0 | 0/0 | 0 | — |
| ✅ | `target/release/.fingerprint/static_assertions-faa57ca076a987f2` | 90 | 1 | 1 | 0 | 0/0 | 0 | — |
| ✅ | `target/release/.fingerprint/statrs-5f74206b467c73b3` | 90 | 1 | 1 | 0 | 0/0 | 0 | — |
| ✅ | `target/release/.fingerprint/syn-1b5f392ff902fc7d` | 90 | 1 | 1 | 0 | 0/0 | 0 | — |
| ✅ | `target/release/.fingerprint/syn-1cd211e45d97038e` | 90 | 1 | 1 | 0 | 0/0 | 0 | — |
| ✅ | `target/release/.fingerprint/tokio-469a936b0958abda` | 90 | 1 | 1 | 0 | 0/0 | 0 | — |
| ✅ | `target/release/.fingerprint/turbovec-b1ca5a96abf42e0d` | 90 | 1 | 1 | 0 | 0/0 | 0 | — |
| ✅ | `target/release/.fingerprint/turbovec-napi-006d80527eee553a` | 90 | 1 | 1 | 0 | 0/0 | 0 | — |
| ✅ | `target/release/.fingerprint/turbovec-napi-02cc996fae4fe6c5` | 90 | 1 | 1 | 0 | 0/0 | 0 | — |
| ✅ | `target/release/.fingerprint/turbovec-napi-71d2b65563028ea9` | 90 | 1 | 1 | 0 | 0/0 | 0 | — |
| ✅ | `target/release/.fingerprint/twox-hash-05669293d921c089` | 90 | 1 | 1 | 0 | 0/0 | 0 | — |
| ✅ | `target/release/.fingerprint/typenum-25a796fb673a0662` | 90 | 1 | 1 | 0 | 0/0 | 0 | — |
| ✅ | `target/release/.fingerprint/ucd-trie-cd12669c157b8f23` | 90 | 1 | 1 | 0 | 0/0 | 0 | — |
| ✅ | `target/release/.fingerprint/ucd-trie-da144abb713fcef7` | 90 | 1 | 1 | 0 | 0/0 | 0 | — |
| ✅ | `target/release/.fingerprint/unicode-ident-3d2a4a9b90a2399a` | 90 | 1 | 1 | 0 | 0/0 | 0 | — |
| ✅ | `target/release/.fingerprint/unicode-segmentation-a6c6c41ac1c98328` | 90 | 1 | 1 | 0 | 0/0 | 0 | — |
| ✅ | `target/release/.fingerprint/value-trait-26b73468bd55224a` | 90 | 1 | 1 | 0 | 0/0 | 0 | — |
| ✅ | `target/release/.fingerprint/version_check-75290a5d21a10a3b` | 90 | 1 | 1 | 0 | 0/0 | 0 | — |
| ✅ | `target/release/.fingerprint/wide-71a0cf468c24f552` | 90 | 1 | 1 | 0 | 0/0 | 0 | — |
| ✅ | `target/release/.fingerprint/windows-link-6f10eec86472b1f5` | 90 | 1 | 1 | 0 | 0/0 | 0 | — |
| ✅ | `target/release/.fingerprint/zerocopy-3b392b3ad3dbe5df` | 90 | 1 | 1 | 0 | 0/0 | 0 | — |
| ✅ | `target/release/.fingerprint/zerocopy-57d6957500d0caa6` | 90 | 1 | 1 | 0 | 0/0 | 0 | — |
| ✅ | `target/release/.fingerprint/zerocopy-c66bb89332bea0e1` | 90 | 1 | 1 | 0 | 0/0 | 0 | — |
| ✅ | `target/release/.fingerprint/zmij-1f0dde67289876cf` | 90 | 1 | 1 | 0 | 0/0 | 0 | — |
| ✅ | `target/release/.fingerprint/zmij-42e1ded69cee9bbd` | 90 | 1 | 1 | 0 | 0/0 | 0 | — |
| ✅ | `target/release/.fingerprint/zmij-9d1ebc0b8399b450` | 90 | 1 | 1 | 0 | 0/0 | 0 | — |
| ✅ | `test/services` | 90 | 2 | 356 | 0 | 0/2 | 0 | — |
| ✅ | `tests/atlas` | 90 | 18 | 1984 | 0 | 0/4 | 0 | — |
| ✅ | `tests/fixtures` | 90 | 2 | 118 | 0 | 0/0 | 0 | — |
| ✅ | `tests/hmm` | 90 | 2 | 128 | 0 | 0/2 | 0 | — |
| ✅ | `tests/integration` | 90 | 2 | 324 | 0 | 0/0 | 0 | — |
| ✅ | `tests/opencode` | 90 | 2 | 678 | 0 | 0/2 | 0 | — |
| ✅ | `tests/retrieval` | 90 | 10 | 2560 | 0 | 0/0 | 0 | — |
| ✅ | `tmp/ace-context-snapshots` | 90 | 3 | 54 | 0 | 0/0 | 0 | — |
| ✅ | `tmp/atlas/discovery` | 90 | 1 | 867 | 0 | 0/0 | 0 | — |
| ✅ | `tmp/ort-probe-1.29` | 90 | 3 | 282 | 0 | 0/0 | 0 | — |
| ✅ | `tools/agentic-research/node` | 90 | 4 | 346 | 0 | 0/0 | 0 | — |
| ✅ | `tools/agentic-research/scaffolds` | 90 | 2 | 34 | 0 | 0/0 | 0 | — |
| ✅ | `tools/parent-atlas-qdrant-postgres-toolkit/scripts/qdrant` | 90 | 2 | 244 | 0 | 0/2 | 0 | — |
| ✅ | `triton-trt-llm/reports` | 90 | 1 | 66 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/src/routes` | 91 | 6 | 269352 | 842 | 1306/700 | 11 | 🟠lh ⬜notest |
| ✅ | `packages/parent-atlas-runtime/src/adapters` | 93 | 6 | 1187 | 0 | 0/0 | 1 | — |
| ✅ | `claude-mem/plugin` | 95 | 2 | 24742 | 0 | 2/10 | 0 | 🟠lh |
| ✅ | `claude-mem/plugin/scripts` | 95 | 9 | 23096 | 0 | 2/8 | 0 | 🟠lh |
| ✅ | `packages/atlas-core/src/retrieval` | 95 | 5 | 2227 | 0 | 0/1 | 0 | 🟠lh |
| ✅ | `scripts/docs-atlas` | 95 | 36 | 7086 | 0 | 0/24 | 0 | 🟠lh |
| ✅ | `scripts/graphify-audit` | 95 | 8 | 2830 | 0 | 0/6 | 0 | 🟠lh |
| ✅ | `scripts/ingest` | 95 | 50 | 6996 | 0 | 0/36 | 0 | 🟠lh |
| ✅ | `scripts/memory` | 95 | 10 | 574892 | 0 | 0/4 | 0 | 🟠lh |
| ✅ | `scripts/opencode` | 95 | 158 | 22520 | 0 | 0/132 | 0 | 🟠lh |
| ✅ | `scripts/qdrant` | 95 | 6 | 604 | 0 | 0/2 | 0 | 🟠lh |
| ✅ | `scripts/smoke` | 95 | 30 | 4814 | 0 | 0/12 | 0 | 🟠lh |
| ✅ | `sveltekit-frontend/.docker-build` | 95 | 2 | 40309 | 0 | 1/39 | 0 | 🟠lh |
| ✅ | `sveltekit-frontend/.docker-build/scripts` | 95 | 1 | 9033 | 0 | 1/39 | 0 | 🟠lh |
| ✅ | `sveltekit-frontend/.docker-build/scripts/atlas` | 95 | 54 | 8853 | 0 | 1/39 | 0 | 🟠lh |
| ✅ | `sveltekit-frontend/scratch` | 95 | 54 | 7233 | 0 | 0/7 | 0 | 🟠lh |
| ✅ | `sveltekit-frontend/scripts/index` | 95 | 10 | 806 | 0 | 0/7 | 0 | 🟠lh |
| ✅ | `sveltekit-frontend/scripts/mcp` | 95 | 25 | 8267 | 0 | 0/17 | 0 | 🟠lh |
| ✅ | `sveltekit-frontend/scripts/semantic-valkey` | 95 | 2 | 467 | 0 | 1/0 | 0 | 🟠lh |
| ✅ | `sveltekit-frontend/scripts/smoke` | 95 | 32 | 4361 | 0 | 0/11 | 0 | 🟠lh |
| ✅ | `sveltekit-frontend/scripts/startup` | 95 | 17 | 3742 | 0 | 0/4 | 0 | 🟠lh |
| ✅ | `sveltekit-frontend/scripts/tests` | 95 | 78 | 15958 | 0 | 4/26 | 0 | 🟠lh |
| ✅ | `sveltekit-frontend/sveltekit-frontend/scripts` | 95 | 1 | 431 | 0 | 0/1 | 0 | 🟠lh |
| ✅ | `.claude/hooks` | 100 | 2 | 163 | 0 | 0/2 | 0 | — |
| ✅ | `atlas-openspec-awareness-v2/scripts/atlas` | 100 | 11 | 1166 | 0 | 0/10 | 0 | — |
| ✅ | `atlas-openspec-awareness-v2/scripts/atlas/lib` | 100 | 7 | 316 | 0 | 0/1 | 0 | — |
| ✅ | `atlas-openspec-awareness-v2/src/lib/server` | 100 | 7 | 759 | 0 | 0/2 | 0 | — |
| ✅ | `drizzle/migrations` | 100 | 2 | 76 | 0 | 0/0 | 0 | — |
| ✅ | `drizzle/schema` | 100 | 2 | 50 | 0 | 0/0 | 0 | — |
| ✅ | `gsd_archives/phase-2f1-baseline` | 100 | 1 | 7170 | 0 | 0/4 | 0 | — |
| ✅ | `gsd_archives/phase-2f1-baseline/schema-backup` | 100 | 113 | 6898 | 0 | 0/4 | 0 | — |
| ✅ | `packages/atlas-core` | 100 | 4 | 15478 | 1 | 0/21 | 2 | 🟠lh |
| ✅ | `packages/atlas-core/src` | 100 | 6 | 15182 | 1 | 0/21 | 2 | 🟠lh |
| ✅ | `packages/atlas-core/src/classification` | 100 | 10 | 2677 | 0 | 0/2 | 0 | — |
| ✅ | `packages/atlas-core/src/queue` | 100 | 2 | 300 | 0 | 0/1 | 0 | — |
| ✅ | `packages/atlas-core/src/validation` | 100 | 11 | 2913 | 0 | 0/2 | 0 | — |
| ✅ | `packages/parent-atlas` | 100 | 2 | 55764 | 1 | 0/283 | 1 | 🟠lh |
| ✅ | `packages/parent-atlas/scripts` | 100 | 2 | 520 | 0 | 0/0 | 0 | — |
| ✅ | `packages/parent-atlas/test` | 100 | 113 | 11180 | 1 | 0/50 | 0 | — |
| ✅ | `packages/parent-atlas-retrieval/src/gpu` | 100 | 19 | 5975 | 0 | 0/4 | 0 | — |
| ✅ | `parent-atlas-capability-census-v5/scripts/atlas` | 100 | 1 | 136 | 0 | 0/0 | 0 | — |
| ✅ | `parent-atlas-capability-census-v5/scripts/atlas/lib` | 100 | 1 | 58 | 0 | 0/0 | 0 | — |
| ✅ | `scripts/atlas` | 100 | 4790 | 1041500 | 8 | 6/2346 | 42 | 🟠lh |
| ✅ | `scripts/atlas/lib` | 100 | 780 | 69136 | 4 | 0/96 | 24 | 🟠lh |
| ✅ | `scripts/atlas/schema` | 100 | 12 | 2918 | 0 | 0/8 | 0 | — |
| ✅ | `scripts/db-tests` | 100 | 12 | 560 | 0 | 0/0 | 0 | — |
| ✅ | `scripts/lib` | 100 | 6 | 654 | 0 | 0/0 | 0 | — |
| ✅ | `scripts/packets` | 100 | 42 | 8664 | 0 | 0/26 | 0 | — |
| ✅ | `scripts/postgres` | 100 | 2 | 694 | 0 | 0/0 | 0 | — |
| ✅ | `scripts/promotion` | 100 | 14 | 3746 | 0 | 0/10 | 0 | — |
| ✅ | `scripts/tests` | 100 | 178 | 91020 | 2 | 4/36 | 0 | 🟠lh |
| ✅ | `sveltekit-frontend/drizzle/schema` | 100 | 1 | 311 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/scripts` | 100 | 410 | 382901 | 17 | 34/629 | 48 | 🟠lh |
| ✅ | `sveltekit-frontend/scripts/agents` | 100 | 5 | 1403 | 0 | 1/2 | 0 | — |
| ✅ | `sveltekit-frontend/scripts/agents/skills` | 100 | 5 | 546 | 0 | 1/1 | 0 | — |
| ✅ | `sveltekit-frontend/scripts/atlas` | 100 | 423 | 165269 | 1 | 5/189 | 3 | 🟠lh |
| ✅ | `sveltekit-frontend/scripts/atlas/lib` | 100 | 15 | 2171 | 0 | 0/5 | 0 | — |
| ✅ | `sveltekit-frontend/scripts/atlas/mapreduce` | 100 | 1 | 121 | 0 | 0/1 | 0 | — |
| ✅ | `sveltekit-frontend/scripts/audit` | 100 | 1 | 522 | 0 | 0/1 | 0 | — |
| ✅ | `sveltekit-frontend/scripts/docs` | 100 | 1 | 530 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/scripts/graph` | 100 | 12 | 2868 | 0 | 1/8 | 0 | — |
| ✅ | `sveltekit-frontend/scripts/kb` | 100 | 16 | 3802 | 0 | 1/10 | 0 | — |
| ✅ | `sveltekit-frontend/scripts/knowledge` | 100 | 20 | 3142 | 0 | 0/19 | 0 | — |
| ✅ | `sveltekit-frontend/scripts/lib` | 100 | 18 | 2926 | 1 | 0/8 | 0 | 🟠lh |
| ✅ | `sveltekit-frontend/scripts/mapreduce` | 100 | 2 | 549 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/scripts/phase104-backups/src` | 100 | 399 | 43970 | 13 | 10/96 | 36 | 🟠lh |
| ✅ | `sveltekit-frontend/scripts/screenshots` | 100 | 3 | 670 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/scripts/validate` | 100 | 2 | 1554 | 0 | 1/1 | 0 | — |
| ✅ | `sveltekit-frontend/src` | 100 | 18 | 1245205 | 851 | 1334/2228 | 85 | 🔴ssr 🟠lh ⬜notest |
| ✅ | `sveltekit-frontend/src/lib` | 100 | 11 | 939564 | 9 | 22/1481 | 73 | 🟠lh |
| ✅ | `sveltekit-frontend/src/lib/data` | 100 | 5 | 1687 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/src/lib/db` | 100 | 12 | 2562 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/src/lib/intent` | 100 | 1 | 239 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/src/lib/phase72` | 100 | 1 | 394 | 0 | 0/1 | 0 | — |
| ✅ | `sveltekit-frontend/src/lib/server` | 100 | 3850 | 661612 | 9 | 19/1373 | 55 | 🟠lh |
| ✅ | `sveltekit-frontend/src/lib/shims` | 100 | 11 | 1248 | 0 | 0/1 | 0 | — |
| ✅ | `sveltekit-frontend/src/lib/types` | 100 | 57 | 7435 | 0 | 0/6 | 0 | — |
| ✅ | `sveltekit-frontend/src/routes/(app)` | 100 | 486 | 125240 | 4 | 486/50 | 2 | 🟠lh ⬜notest |
| ✅ | `sveltekit-frontend/src/routes/admin` | 100 | 4 | 2707 | 0 | 2/2 | 0 | ⬜notest |
| ✅ | `sveltekit-frontend/src/routes/atlas` | 100 | 5 | 786 | 1 | 1/1 | 0 | ⬜notest |
| ✅ | `sveltekit-frontend/src/routes/dashboard` | 100 | 2 | 351 | 0 | 0/0 | 0 | ⬜notest |
| ✅ | `sveltekit-frontend/src/routes/login` | 100 | 3 | 506 | 0 | 1/3 | 0 | — |
| ✅ | `sveltekit-frontend/src/routes/register` | 100 | 3 | 627 | 0 | 1/2 | 0 | — |
| ✅ | `sveltekit-frontend/src/types` | 100 | 27 | 947 | 0 | 0/1 | 0 | — |
| ✅ | `sveltekit-frontend/tests` | 100 | 298 | 173991 | 5 | 818/94 | 1 | 🟠lh |
| ✅ | `sveltekit-frontend/tests/atlas` | 100 | 32 | 6619 | 0 | 0/12 | 0 | — |
| ✅ | `sveltekit-frontend/tests/e2e` | 100 | 35 | 10110 | 0 | 10/5 | 0 | — |
| ✅ | `sveltekit-frontend/tests/lane-contracts` | 100 | 4 | 397 | 0 | 0/1 | 0 | — |
| ✅ | `sveltekit-frontend/tests/routes` | 100 | 33 | 67859 | 2 | 785/14 | 0 | — |
| ✅ | `sveltekit-frontend/tests/routes/auto` | 100 | 791 | 57245 | 0 | 777/4 | 0 | — |
| ✅ | `sveltekit-frontend/tests/unit` | 100 | 15 | 2417 | 0 | 0/3 | 0 | — |
| ✅ | `tests/classifier` | 100 | 8 | 1854 | 0 | 0/0 | 0 | — |
| ✅ | `tools/agentic-research/src/firecrawl` | 100 | 1314 | 358196 | 2 | 0/332 | 82 | 🟠lh |
| ✅ | `tools/parent-atlas-qdrant-postgres-toolkit/scripts/postgres` | 100 | 2 | 94 | 0 | 0/0 | 0 | — |

---

## API Routes (842 total · top 60)

| Route [params] | Methods | Auth | Zod | Error handling |
|----------------|---------|------|-----|----------------|
| `sveltekit-frontend/api/admin/audit/+server.ts` | GET, POST, PUT, PATCH, DELETE | ✅ | ✅ | ✅ |
| `sveltekit-frontend/api/cases/+server.ts` | GET, POST, PATCH, DELETE | ✅ | ✅ | ✅ |
| `sveltekit-frontend/api/cases/[id]/connections/+server.ts [id]` | GET, POST, PATCH, DELETE | ✅ | ✅ | ❌ |
| `sveltekit-frontend/api/citations/+server.ts` | GET, POST, PATCH, DELETE | ✅ | ✅ | ✅ |
| `sveltekit-frontend/api/error-brain/diagnosis-history/+server.ts` | GET, POST, PATCH, DELETE | ✅ | ✅ | ✅ |
| `sveltekit-frontend/api/reports/+server.ts` | GET, POST, PATCH, DELETE | ✅ | ✅ | ✅ |
| `sveltekit-frontend/api/analytics/codebase-research/+server.ts` | GET, POST, DELETE | ✅ | ✅ | ✅ |
| `sveltekit-frontend/api/analytics/deep-research/+server.ts` | GET, POST, DELETE | ✅ | ✅ | ✅ |
| `sveltekit-frontend/api/analytics/generate-todos/+server.ts` | POST, GET, PATCH | ✅ | ✅ | ✅ |
| `sveltekit-frontend/api/analytics/mapreduce-matrix/+server.ts` | GET, POST, DELETE | ✅ | ✅ | ✅ |
| `sveltekit-frontend/api/analytics/unified-research/+server.ts` | GET, POST, DELETE | ✅ | ✅ | ✅ |
| `sveltekit-frontend/api/browser-context/snapshot/+server.ts` | POST, GET, DELETE | ✅ | ✅ | ✅ |
| `sveltekit-frontend/api/cache/+server.ts` | GET, POST, DELETE | ✅ | ✅ | ✅ |
| `sveltekit-frontend/api/cache/som/+server.ts` | GET, POST, PUT | ✅ | ✅ | ✅ |
| `sveltekit-frontend/api/cases/[id]/+server.ts [id]` | GET, PATCH, DELETE | ✅ | ✅ | ✅ |
| `sveltekit-frontend/api/cases/[id]/authorities/+server.ts [id]` | GET, POST, DELETE | ✅ | ✅ | ✅ |
| `sveltekit-frontend/api/cases/[id]/citations/+server.ts [id]` | GET, POST, DELETE | ✅ | ✅ | ✅ |
| `sveltekit-frontend/api/cases/[id]/notes/[noteId]/+server.ts [id, noteId]` | GET, PATCH, DELETE | ✅ | ✅ | ✅ |
| `sveltekit-frontend/api/cases/[id]/notes/[noteId]/evidence/+server.ts [id, noteId]` | GET, POST, DELETE | ✅ | ✅ | ✅ |
| `sveltekit-frontend/api/cases/[id]/persons/+server.ts [id]` | GET, POST, DELETE | ✅ | ✅ | ✅ |
| `sveltekit-frontend/api/chat/memory/settings/+server.ts` | GET, DELETE, PATCH | ✅ | ✅ | ✅ |
| `sveltekit-frontend/api/citations/collections/[collectionId]/+server.ts [collectionId]` | GET, DELETE, PATCH | ✅ | ✅ | ✅ |
| `sveltekit-frontend/api/citations/collections/[collectionId]/citations/+server.ts [collectionId]` | POST, DELETE, GET | ✅ | ✅ | ✅ |
| `sveltekit-frontend/api/citations/saved/+server.ts` | GET, POST, DELETE | ✅ | ✅ | ✅ |
| `sveltekit-frontend/api/citations/[citationId]/tags/+server.ts [citationId]` | GET, POST, DELETE | ✅ | ✅ | ✅ |
| `sveltekit-frontend/api/codebase-index/cluster-summary/+server.ts` | POST, GET, PUT | ✅ | ✅ | ✅ |
| `sveltekit-frontend/api/codebase-index/llm-output/+server.ts` | GET, POST, DELETE | ✅ | ✅ | ✅ |
| `sveltekit-frontend/api/evidence/[id]/+server.ts [id]` | GET, PATCH, DELETE | ✅ | ✅ | ✅ |
| `sveltekit-frontend/api/fictional-cases/[id]/+server.ts [id]` | GET, PATCH, DELETE | ✅ | ✅ | ✅ |
| `sveltekit-frontend/api/glyph/tile-atlas/+server.ts` | GET, POST, DELETE | ✅ | ✅ | ✅ |
| `sveltekit-frontend/api/gpu/lease/+server.ts` | GET, POST, DELETE | ✅ | ✅ | ✅ |
| `sveltekit-frontend/api/graph/hypergraph/+server.ts` | GET, POST, DELETE | ✅ | ✅ | ✅ |
| `sveltekit-frontend/api/health/ocr/+server.ts` | GET, POST, HEAD | ✅ | ✅ | ✅ |
| `sveltekit-frontend/api/knowledge/+server.ts` | POST, GET, PATCH | ✅ | ✅ | ✅ |
| `sveltekit-frontend/api/library/documents/[documentId]/+server.ts [documentId]` | GET, PUT, DELETE | ✅ | ✅ | ❌ |
| `sveltekit-frontend/api/persons-of-interest/[id]/+server.ts [id]` | GET, PATCH, DELETE | ✅ | ✅ | ✅ |
| `sveltekit-frontend/api/persons-of-interest/[id]/photos/+server.ts [id]` | GET, POST, DELETE | ✅ | ✅ | ✅ |
| `sveltekit-frontend/api/push/+server.ts` | GET, POST, DELETE | ✅ | ✅ | ✅ |
| `sveltekit-frontend/api/simulation/[sessionId]/+server.ts [sessionId]` | GET, POST, DELETE | ✅ | ✅ | ✅ |
| `sveltekit-frontend/api/statutes/[id]/+server.ts [id]` | GET, PUT, DELETE | ✅ | ✅ | ✅ |
| `sveltekit-frontend/api/wiki/watch/+server.ts` | GET, POST, DELETE | ✅ | ❌ | ❌ |
| `sveltekit-frontend/(app)/admin/api-testing/agentic-loop/+server.ts` | POST, GET | ✅ | ✅ | ✅ |
| `sveltekit-frontend/(app)/evidence/+server.ts` | GET, POST | ✅ | ✅ | ✅ |
| `sveltekit-frontend/api/ace/packet/+server.ts` | POST, GET | ✅ | ✅ | ✅ |
| `sveltekit-frontend/api/ace/packets/+server.ts` | POST, GET | ✅ | ✅ | ✅ |
| `sveltekit-frontend/api/ace/policy-orchestrator/+server.ts` | POST, GET | ✅ | ✅ | ✅ |
| `sveltekit-frontend/api/ace/stream/+server.ts` | POST, GET | ✅ | ✅ | ✅ |
| `sveltekit-frontend/api/admin/atlas/cache/+server.ts` | GET, DELETE | ✅ | ✅ | ✅ |
| `sveltekit-frontend/api/admin/atlas/ontology-resolution/+server.ts` | GET, POST | ❌ | ❌ | ✅ |
| `sveltekit-frontend/api/admin/atlas/registry/search/+server.ts` | GET, POST | ❌ | ✅ | ✅ |
| `sveltekit-frontend/api/admin/atlas/taxonomy-candidates/+server.ts` | GET, POST | ❌ | ✅ | ✅ |
| `sveltekit-frontend/api/admin/grpo/flush/+server.ts` | GET, POST | ✅ | ✅ | ❌ |
| `sveltekit-frontend/api/admin/model/validate-checkpoint/+server.ts` | POST, GET | ✅ | ✅ | ✅ |
| `sveltekit-frontend/api/admin/observability/+server.ts` | GET, POST | ✅ | ✅ | ✅ |
| `sveltekit-frontend/api/admin/packets/enrich-labels/+server.ts` | GET, POST | ✅ | ❌ | ✅ |
| `sveltekit-frontend/api/admin/qlora/+server.ts` | GET, POST | ✅ | ✅ | ✅ |
| `sveltekit-frontend/api/admin/retrieval/search/+server.ts` | GET, POST | ❌ | ✅ | ✅ |
| `sveltekit-frontend/api/admin/retrieval/stream/+server.ts` | GET, POST | ✅ | ✅ | ✅ |
| `sveltekit-frontend/api/admin/seed-knowledge/+server.ts` | POST, GET | ✅ | ✅ | ✅ |
| `sveltekit-frontend/api/admin/summaries/scan-quality/+server.ts` | GET, POST | ✅ | ✅ | ✅ |

_…and 782 more. See `codebase-graph.json` for full list._

---

## G4 — API Routes Missing Auth Guard (29)
- `sveltekit-frontend/src/routes/api/acp/rpc/+server.ts` · POST
- `sveltekit-frontend/src/routes/api/acp/service-ports/+server.ts` · GET
- `sveltekit-frontend/src/routes/api/admin/atlas/docs-corpus/+server.ts` · GET
- `sveltekit-frontend/src/routes/api/admin/atlas/docs-corpus/local-snapshot/+server.ts` · GET
- `sveltekit-frontend/src/routes/api/admin/atlas/docs-corpus/search/+server.ts` · GET
- `sveltekit-frontend/src/routes/api/admin/atlas/graph/projection/load/+server.ts` · POST
- `sveltekit-frontend/src/routes/api/admin/atlas/graph/traverse/+server.ts` · POST
- `sveltekit-frontend/src/routes/api/admin/atlas/graph-views/+server.ts` · GET
- `sveltekit-frontend/src/routes/api/admin/atlas/ontology-resolution/+server.ts` · GET/POST
- `sveltekit-frontend/src/routes/api/admin/atlas/ontology-resolution/oak-search/+server.ts` · POST
- `sveltekit-frontend/src/routes/api/admin/atlas/registry/search/+server.ts` · GET/POST
- `sveltekit-frontend/src/routes/api/admin/atlas/synthesize/+server.ts` · POST
- `sveltekit-frontend/src/routes/api/admin/atlas/taxonomy-candidates/+server.ts` · GET/POST
- `sveltekit-frontend/src/routes/api/admin/batch-embeddings/packets/+server.ts` · GET
- `sveltekit-frontend/src/routes/api/admin/retrieval/clusters/+server.ts` · GET
- `sveltekit-frontend/src/routes/api/admin/retrieval/search/+server.ts` · GET/POST
- `sveltekit-frontend/src/routes/api/ai/emotion/+server.ts` · POST
- `sveltekit-frontend/src/routes/api/atlas/studio/redis/+server.ts` · GET
- `sveltekit-frontend/src/routes/api/batch-summary/jobs/+server.ts` · GET
- `sveltekit-frontend/src/routes/api/dispatcher/audit/+server.ts` · GET
- `sveltekit-frontend/src/routes/api/graphify/status/+server.ts` · GET
- `sveltekit-frontend/src/routes/api/metrics/retrieval/+server.ts` · GET
- `sveltekit-frontend/src/routes/api/phase102/retrieval-pipeline/+server.ts` · GET
- `sveltekit-frontend/src/routes/api/retrieval/cache-layers/health/+server.ts` · GET
- `sveltekit-frontend/src/routes/api/retrieval/cache-layers/metrics/+server.ts` · GET
- `sveltekit-frontend/src/routes/api/retrieval/dual-lane/+server.ts` · GET
- `sveltekit-frontend/src/routes/api/telemetry/implementation-clusters/+server.ts` · GET
- `sveltekit-frontend/src/routes/api/trpc/[...procedure]/+server.ts` · GET/POST
- `sveltekit-frontend/src/routes/atlas/studio/openspec/events/+server.ts` · GET

---

## G5 — API Routes Missing Zod Validation (4)
- `sveltekit-frontend/src/routes/api/admin/atlas/ontology-resolution/+server.ts` · GET/POST
- `sveltekit-frontend/src/routes/api/admin/atlas/ontology-resolution/oak-search/+server.ts` · POST
- `sveltekit-frontend/src/routes/api/ai/emotion/+server.ts` · POST
- `sveltekit-frontend/src/routes/api/codebase-index/couchdb-pagerank/+server.ts` · POST/GET

---

## G14 — Svelte 4 Legacy Patterns (3 files)
- `sveltekit-frontend/temp_upload.svelte` · on:event
- `sveltekit-frontend/test-errors-validation.svelte` · $:reactive, on:event
- `sveltekit-frontend/test-errors.svelte` · $:reactive

---

## G15 — SSR-Unsafe Globals (0 files · unguarded window/document/localStorage)
_No unguarded SSR-unsafe globals. ✅_

---

## G16 — Routes Without Test Pairing (76)
- `sveltekit-frontend/src/routes/api/admin/ai-chat/[sessionId]/+server.ts` · GET
- `sveltekit-frontend/src/routes/api/admin/atlas/docs-corpus/+server.ts` · GET
- `sveltekit-frontend/src/routes/api/admin/atlas/docs-corpus/local-snapshot/+server.ts` · GET
- `sveltekit-frontend/src/routes/api/admin/atlas/document-governance/+server.ts` · GET
- `sveltekit-frontend/src/routes/api/admin/atlas/graph/projection/load/+server.ts` · POST
- `sveltekit-frontend/src/routes/api/admin/atlas/graph/proof/+server.ts` · GET
- `sveltekit-frontend/src/routes/api/admin/atlas/graph-views/+server.ts` · GET
- `sveltekit-frontend/src/routes/api/admin/atlas/node/[id]/+server.ts` · GET
- `sveltekit-frontend/src/routes/api/admin/atlas/ontology-resolution/+server.ts` · GET/POST
- `sveltekit-frontend/src/routes/api/admin/atlas/ontology-resolution/oak-search/+server.ts` · POST
- `sveltekit-frontend/src/routes/api/admin/atlas/pass-fabric/boundary/+server.ts` · GET
- `sveltekit-frontend/src/routes/api/admin/atlas/pass-fabric/current/+server.ts` · GET
- `sveltekit-frontend/src/routes/api/admin/atlas/pass-fabric/live/+server.ts` · GET
- `sveltekit-frontend/src/routes/api/admin/atlas/pass-fabric/proof/+server.ts` · GET
- `sveltekit-frontend/src/routes/api/admin/atlas/phase-lanes/+server.ts` · GET
- `sveltekit-frontend/src/routes/api/admin/atlas/phase-lanes/proof/+server.ts` · GET
- `sveltekit-frontend/src/routes/api/admin/atlas/retrieval/proof/+server.ts` · GET
- `sveltekit-frontend/src/routes/api/admin/atlas/taxonomy-candidates/+server.ts` · GET/POST
- `sveltekit-frontend/src/routes/api/admin/retrieval/clusters/[id]/+server.ts` · GET
- `sveltekit-frontend/src/routes/api/agent-work-receipts/+server.ts` · POST
- `sveltekit-frontend/src/routes/api/ai/analyze/[scope]/+server.ts` · POST
- `sveltekit-frontend/src/routes/api/ai/emotion/+server.ts` · POST
- `sveltekit-frontend/src/routes/api/ai/generate-report/[scope]/+server.ts` · POST
- `sveltekit-frontend/src/routes/api/analytics/research-summaries/[id]/+server.ts` · GET/DELETE
- `sveltekit-frontend/src/routes/api/atlas/cards/[id]/+server.ts` · GET
- `sveltekit-frontend/src/routes/api/atlas/concept-tagging/+server.ts` · POST
- `sveltekit-frontend/src/routes/api/atlas/memory-address/[source_ref_id]/+server.ts` · GET
- `sveltekit-frontend/src/routes/api/atlas/studio/cards/[id]/+server.ts` · GET
- `sveltekit-frontend/src/routes/api/audio/analysis/[evidenceId]/+server.ts` · GET
- `sveltekit-frontend/src/routes/api/audio/progress/[evidenceId]/+server.ts` · GET

---

## G11 — Hardcoded Localhost References (1773 files)
- `backfill-neo4j-cell-id.mjs` · http://localhost:7474
- `backfill-qdrant-by-packet-key.mjs` · http://localhost:6333
- `backfill-qdrant-identity.mjs` · http://localhost:6333
- `backfill-qdrant-via-patch.mjs` · http://localhost:6333
- `claude-mem/plugin/scripts/worker-service.cjs` · http://localhost:8205
- `claude-mem/src/npx-cli/commands/install.ts` · http://localhost:4000
- `ecosystem.dev.config.cjs` · http://localhost:11434
- `ecosystem.prod.config.cjs` · http://localhost:11434
- `ingest-grpc-packets-to-qdrant.mjs` · http://127.0.0.1:6333, http://127.0.0.1:11434
- `llama-cpp-turboquant-gemma4/tools/server/bench/script.js` · http://localhost:8080
- `llama-cpp-turboquant-gemma4/tools/server/chat.mjs` · http://127.0.0.1:8080
- `llama-cpp-turboquant-gemma4/tools/server/public_simplechat/simplechat.js` · http://127.0.0.1:8080
- `llama-cpp-turboquant-gemma4/tools/server/webui/tests/stories/fixtures/ai-tutorial.ts` · http://localhost:5173, http://localhost:5173
- `llama-cpp-turboquant-gemma4/tools/server/webui/vite.config.ts` · http://localhost:8080, http://localhost:8080
- `packages/atlas-core/src/langgraph/example-usage.ts` · http://localhost:6333
- `packages/atlas-core/src/langgraph/kanban-error-fixing-agent.ts` · http://127.0.0.1:8788
- `packages/atlas-core/src/retrieval/feature-registry-search.ts` · http://127.0.0.1:5173, http://127.0.0.1:11434
- `packages/parent-atlas/src/core/service-contract.ts` · http://127.0.0.1:8090, http://127.0.0.1:8096
- `packages/parent-atlas/src/pipelines/test-qdrant-connectivity.ts` · http://127.0.0.1:6333
- `packages/parent-atlas-retrieval/src/crossencoder/crossencoder-client.ts` · http://127.0.0.1:8092

---

## G18 — Deep Route Paths (parameterised, sorted by depth)

| Route [params] | Depth | Params | Methods |
|----------------|-------|--------|---------|
| `sveltekit-frontend/api/cases/[id]/notes/[noteId]/evidence/+server.ts` | 9 | `[id] [noteId]` | GET, POST, DELETE |
| `sveltekit-frontend/api/cases/[id]/notes/[noteId]/versions/+server.ts` | 9 | `[id] [noteId]` | GET |
| `sveltekit-frontend/api/library/document/[id]/node/[nodeId]/+server.ts` | 9 | `[id] [nodeId]` | GET |
| `sveltekit-frontend/(app)/admin/phase78/routes/[routePath]/+page.server.ts` | 8 | `[routePath]` |  |
| `sveltekit-frontend/(app)/cases/[id]/evidence/upload/+page.server.ts` | 8 | `[id]` |  |
| `sveltekit-frontend/(app)/command-center/codebase/clusters/[id]/+page.server.ts` | 8 | `[id]` |  |
| `sveltekit-frontend/(app)/command-center/codebase/components/[id]/+page.server.ts` | 8 | `[id]` |  |
| `sveltekit-frontend/(app)/library/[documentId]/node/[nodeId]/+page.server.ts` | 8 | `[documentId] [nodeId]` |  |
| `sveltekit-frontend/api/admin/atlas/node/[id]/+server.ts` | 8 | `[id]` | GET |
| `sveltekit-frontend/api/admin/retrieval/clusters/[id]/+server.ts` | 8 | `[id]` | GET |
| `sveltekit-frontend/api/atlas/studio/cards/[id]/+server.ts` | 8 | `[id]` | GET |
| `sveltekit-frontend/api/cases/[id]/analyze/stream/+server.ts` | 8 | `[id]` | POST |
| `sveltekit-frontend/api/cases/[id]/export/pdf/+server.ts` | 8 | `[id]` | POST |
| `sveltekit-frontend/api/cases/[id]/notes/search/+server.ts` | 8 | `[id]` | GET |
| `sveltekit-frontend/api/cases/[id]/notes/[noteId]/+server.ts` | 8 | `[id] [noteId]` | GET, PATCH, DELETE |
| `sveltekit-frontend/api/citations/collections/[collectionId]/citations/+server.ts` | 8 | `[collectionId]` | POST, DELETE, GET |
| `sveltekit-frontend/api/citations/collections/[collectionId]/export/+server.ts` | 8 | `[collectionId]` | GET, POST |
| `sveltekit-frontend/api/code-intel/clusters/[clusterKey]/lenses/+server.ts` | 8 | `[clusterKey]` | GET |
| `sveltekit-frontend/api/code-intel/topology/node/[stableKey]/+server.ts` | 8 | `[stableKey]` | GET |
| `sveltekit-frontend/api/codebase/clusters/[id]/summary/+server.ts` | 8 | `[id]` | GET |
| `sveltekit-frontend/api/evidence/summary/[id]/approve/+server.ts` | 8 | `[id]` | POST |
| `sveltekit-frontend/api/evidence/[id]/analyze/stream/+server.ts` | 8 | `[id]` | GET |
| `sveltekit-frontend/api/library/document/[id]/toc/+server.ts` | 8 | `[id]` | GET |
| `sveltekit-frontend/api/library/documents/[documentId]/chunks/+server.ts` | 8 | `[documentId]` | GET |
| `sveltekit-frontend/api/library/documents/[documentId]/pdf/+server.ts` | 8 | `[documentId]` | GET |
| `sveltekit-frontend/api/library/documents/[documentId]/summary/+server.ts` | 8 | `[documentId]` | GET |
| `sveltekit-frontend/api/library/documents/[documentId]/toc/+server.ts` | 8 | `[documentId]` | GET |
| `sveltekit-frontend/api/persons-of-interest/[id]/associates/[associateId]/+server.ts` | 8 | `[id] [associateId]` | DELETE |
| `sveltekit-frontend/api/phase89/node/[id]/docs/+server.ts` | 8 | `[id]` | GET |
| `sveltekit-frontend/api/phase89/node/[id]/similar/+server.ts` | 8 | `[id]` | GET |

---

## G19 — Top Module Fan-In (most imported `$lib` paths)
| Module | Import Count |
|--------|-------------|
| `$lib/server/db/client` | 668 |
| `$lib/types` | 662 |
| `$lib/server/env.server.js` | 484 |
| `$lib/server/redis.js` | 370 |
| `$lib/server/db` | 271 |
| `$lib/components/ui/Icon.svelte` | 260 |
| `$lib/server/db/schema-postgres` | 212 |
| `$lib/server/db/schema-postgres.js` | 191 |
| `$lib/server/db/client.js` | 191 |
| `$lib/server/db/schema` | 147 |
| `$lib/server/ollama.js` | 139 |
| `$lib/server/llm/runtime-contract.js` | 134 |
| `$lib/middleware/redis-orchestrator-middleware` | 123 |
| `$lib/server/middleware/cache-headers.js` | 111 |
| `$lib/server/vector/qdrant-manager.js` | 106 |
| `$lib/server/grpc/embedding-client.js` | 99 |
| `$lib/components/ui/Button.svelte` | 95 |
| `$lib/server/validation.js` | 95 |
| `$lib/enums` | 88 |
| `$lib/server/redis` | 78 |

---

## G20 — Cyclic Import Pairs (16 found · top 20)
- `claude-mem/src/shared/paths.ts` ↔ `claude-mem/src/utils/logger.ts`
- `llama-cpp-turboquant-gemma4/tools/server/webui/src/lib/components/ui/dialog/index.ts` ↔ `llama-cpp-turboquant-gemma4/tools/server/webui/src/lib/components/ui/dialog/dialog-content.svelte`
- `llama-cpp-turboquant-gemma4/tools/server/webui/src/lib/components/ui/scroll-area/index.ts` ↔ `llama-cpp-turboquant-gemma4/tools/server/webui/src/lib/components/ui/scroll-area/scroll-area.svelte`
- `tools/agentic-research/src/firecrawl/apps/api/src/controllers/v1/types.ts` ↔ `tools/agentic-research/src/firecrawl/apps/api/src/scraper/scrapeURL/index.ts`
- `tools/agentic-research/src/firecrawl/apps/api/src/controllers/v2/types.ts` ↔ `tools/agentic-research/src/firecrawl/apps/api/src/lib/format-utils.ts`
- `tools/agentic-research/src/firecrawl/apps/api/src/lib/crawl-redis.ts` ↔ `tools/agentic-research/src/firecrawl/apps/api/src/scraper/scrapeURL/index.ts`
- `tools/agentic-research/src/firecrawl/apps/api/src/lib/robots-txt.ts` ↔ `tools/agentic-research/src/firecrawl/apps/api/src/scraper/scrapeURL/index.ts`
- `tools/agentic-research/src/firecrawl/apps/api/src/scraper/scrapeURL/engines/exchange.ts` ↔ `tools/agentic-research/src/firecrawl/apps/api/src/scraper/scrapeURL/engines/index.ts`
- `tools/agentic-research/src/firecrawl/apps/api/src/scraper/scrapeURL/engines/fire-engine/scrape.ts` ↔ `tools/agentic-research/src/firecrawl/apps/api/src/scraper/scrapeURL/lib/fetch.ts`
- `tools/agentic-research/src/firecrawl/apps/api/src/scraper/scrapeURL/engines/index/index.ts` ↔ `tools/agentic-research/src/firecrawl/apps/api/src/scraper/scrapeURL/engines/index.ts`
- `tools/agentic-research/src/firecrawl/apps/api/src/scraper/scrapeURL/error.ts` ↔ `tools/agentic-research/src/firecrawl/apps/api/src/scraper/scrapeURL/index.ts`
- `tools/agentic-research/src/firecrawl/apps/api/src/scraper/scrapeURL/error.ts` ↔ `tools/agentic-research/src/firecrawl/apps/api/src/scraper/scrapeURL/engines/index.ts`
- `tools/agentic-research/src/firecrawl/apps/api/src/scraper/scrapeURL/lib/extractSmartScrape.ts` ↔ `tools/agentic-research/src/firecrawl/apps/api/src/scraper/scrapeURL/transformers/llmExtract.ts`
- `tools/agentic-research/src/firecrawl/apps/api/src/scraper/scrapeURL/lib/urlSpecificParams.ts` ↔ `tools/agentic-research/src/firecrawl/apps/api/src/scraper/scrapeURL/index.ts`
- `tools/agentic-research/src/firecrawl/apps/api/src/scraper/scrapeURL/transformers/llmExtract.ts` ↔ `tools/agentic-research/src/firecrawl/apps/api/src/scraper/scrapeURL/index.ts`
- `tools/agentic-research/src/firecrawl/apps/api/src/scraper/WebScraper/crawler.ts` ↔ `tools/agentic-research/src/firecrawl/apps/api/src/scraper/WebScraper/sitemap.ts`

---

## Svelte Components (60 shown of 1171)
| File | Sub-components | Key `$lib` Imports |
|------|---------------|---------------------|
| `atlas-openspec-awareness-v2/src/lib/components/atlas/OpenSpecAwarenessPanel.svelte` |  | $lib/server/atlas/openspec-board/awareness |
| `atlas-openspec-awareness-v2/src/routes/atlas/studio/openspec/+page.svelte` | OpenSpecAwarenessPanel | $lib/components/atlas/OpenSpecAwarenessPanel.svelte |
| `llama-cpp-turboquant-gemma4/tools/server/webui/.storybook/ModeWatcherDecorator.svelte` | ModeWatcher, Component |  |
| `llama-cpp-turboquant-gemma4/tools/server/webui/.storybook/TooltipProviderDecorator.svelte` |  |  |
| `llama-cpp-turboquant-gemma4/tools/server/webui/src/lib/components/app/actions/ActionIcon.svelte` | Button, IconComponent | $lib/components/ui/button, $lib/components/ui/tooltip |
| `llama-cpp-turboquant-gemma4/tools/server/webui/src/lib/components/app/actions/ActionIconCopyToClipboard.svelte` | Copy | $lib/utils |
| `llama-cpp-turboquant-gemma4/tools/server/webui/src/lib/components/app/actions/ActionIconRemove.svelte` | Button | $lib/components/ui/button |
| `llama-cpp-turboquant-gemma4/tools/server/webui/src/lib/components/app/actions/ActionIconsCodeBlock.svelte` | ActionIconCopyToClipboard, Eye | $lib/components/app, $lib/enums |
| `llama-cpp-turboquant-gemma4/tools/server/webui/src/lib/components/app/badges/BadgeChatStatistic.svelte` | BadgeInfo, Icon | $lib/components/app, $lib/components/ui/tooltip, $lib/utils |
| `llama-cpp-turboquant-gemma4/tools/server/webui/src/lib/components/app/badges/BadgeInfo.svelte` |  | $lib/components/ui/utils |
| `llama-cpp-turboquant-gemma4/tools/server/webui/src/lib/components/app/badges/BadgeModality.svelte` | IconComponent | $lib/enums, $lib/constants, $lib/components/ui/utils |
| `llama-cpp-turboquant-gemma4/tools/server/webui/src/lib/components/app/chat/ChatAttachments/ChatAttachmentMcpPrompt.svelte` | ChatMessageMcpPromptContent, ActionIconRemove | $lib/components/app, $lib/types, $lib/enums |
| `llama-cpp-turboquant-gemma4/tools/server/webui/src/lib/components/app/chat/ChatAttachments/ChatAttachmentMcpResource.svelte` | Loader2, AlertCircle, ResourceIcon, ActionIconRemove | $lib/components/ui/utils, $lib/stores/mcp.svelte, $lib/types |
| `llama-cpp-turboquant-gemma4/tools/server/webui/src/lib/components/app/chat/ChatAttachments/ChatAttachmentMcpResources.svelte` | HorizontalScrollCarousel, ChatAttachmentMcpResource | $lib/stores/mcp.svelte, $lib/stores/mcp-resources.svelte, $lib/components/app |
| `llama-cpp-turboquant-gemma4/tools/server/webui/src/lib/components/app/chat/ChatAttachments/ChatAttachmentPreview.svelte` | Button, FileText, Eye, Info | $lib/components/ui/button, $lib/components/ui/alert, $lib/components/app |
| `llama-cpp-turboquant-gemma4/tools/server/webui/src/lib/components/app/chat/ChatAttachments/ChatAttachmentsList.svelte` | ChatAttachmentPreviewItem, DatabaseMessageExtraMcpResource, HorizontalScrollCarousel, ChatAttachmentMcpPrompt | $lib/components/app, $lib/components/ui/button, $lib/enums |
| `llama-cpp-turboquant-gemma4/tools/server/webui/src/lib/components/app/chat/ChatAttachments/ChatAttachmentsViewAll.svelte` | ChatAttachmentPreviewItem, ChatAttachmentThumbnailFile, ChatAttachmentThumbnailImage, DialogChatAttachmentPreview | $lib/components/app, $lib/utils |
| `llama-cpp-turboquant-gemma4/tools/server/webui/src/lib/components/app/chat/ChatAttachments/ChatAttachmentThumbnailFile.svelte` | ActionIconRemove | $lib/components/app, $lib/utils, $lib/enums |
| `llama-cpp-turboquant-gemma4/tools/server/webui/src/lib/components/app/chat/ChatAttachments/ChatAttachmentThumbnailImage.svelte` | ActionIconRemove | $lib/components/app |
| `llama-cpp-turboquant-gemma4/tools/server/webui/src/lib/components/app/chat/ChatForm/ChatForm.svelte` | ChatFormFileInputInvisible, ChatFormPromptPicker, ChatFormResourcePicker, ChatAttachmentsList | $lib/components/app, $lib/components/app/dialogs, $lib/constants |
| `llama-cpp-turboquant-gemma4/tools/server/webui/src/lib/components/app/chat/ChatForm/ChatFormActions/ChatFormActionAttachmentsDropdown.svelte` | Button, Plus, MessageSquare, McpLogo | $lib/components/ui/button, $lib/components/ui/dropdown-menu, $lib/components/ui/tooltip |
| `llama-cpp-turboquant-gemma4/tools/server/webui/src/lib/components/app/chat/ChatForm/ChatFormActions/ChatFormActionAttachmentsSheet.svelte` | Button, Plus, MessageSquare, McpLogo | $lib/components/ui/button, $lib/components/ui/sheet, $lib/constants |
| `llama-cpp-turboquant-gemma4/tools/server/webui/src/lib/components/app/chat/ChatForm/ChatFormActions/ChatFormActionRecord.svelte` | Button, Square, Mic | $lib/components/ui/button, $lib/components/ui/tooltip |
| `llama-cpp-turboquant-gemma4/tools/server/webui/src/lib/components/app/chat/ChatForm/ChatFormActions/ChatFormActions.svelte` | ChatFormActionAttachmentsSheet, ChatFormActionAttachmentsDropdown, McpServersSelector, ModelsSelectorSheet | $lib/components/ui/button, $lib/components/app, $lib/constants |
| `llama-cpp-turboquant-gemma4/tools/server/webui/src/lib/components/app/chat/ChatForm/ChatFormActions/ChatFormActionSubmit.svelte` | Button, ArrowUp | $lib/components/ui/button, $lib/components/ui/tooltip, $lib/components/ui/utils |
| `llama-cpp-turboquant-gemma4/tools/server/webui/src/lib/components/app/chat/ChatForm/ChatFormFileInputInvisible.svelte` |  |  |
| `llama-cpp-turboquant-gemma4/tools/server/webui/src/lib/components/app/chat/ChatForm/ChatFormHelperText.svelte` |  |  |
| `llama-cpp-turboquant-gemma4/tools/server/webui/src/lib/components/app/chat/ChatForm/ChatFormPicker/ChatFormPickerItemHeader.svelte` |  | $lib/types, $lib/stores/mcp.svelte |
| `llama-cpp-turboquant-gemma4/tools/server/webui/src/lib/components/app/chat/ChatForm/ChatFormPicker/ChatFormPickerList.svelte` | HTMLDivElement, SearchInput | $lib/components/app, $lib/components/ui/scroll-area/scroll-area.svelte, $lib/constants |
| `llama-cpp-turboquant-gemma4/tools/server/webui/src/lib/components/app/chat/ChatForm/ChatFormPicker/ChatFormPickerListItem.svelte` |  |  |
| `llama-cpp-turboquant-gemma4/tools/server/webui/src/lib/components/app/chat/ChatForm/ChatFormPicker/ChatFormPickerListItemSkeleton.svelte` |  |  |
| `llama-cpp-turboquant-gemma4/tools/server/webui/src/lib/components/app/chat/ChatForm/ChatFormPickerPopover.svelte` |  | $lib/components/ui/popover |
| `llama-cpp-turboquant-gemma4/tools/server/webui/src/lib/components/app/chat/ChatForm/ChatFormPromptPicker/ChatFormPromptPicker.svelte` | MCPPromptInfo, ChatFormPickerPopover, ChatFormPickerItemHeader, Badge | $lib/stores/conversations.svelte, $lib/stores/mcp.svelte, $lib/utils |
| `llama-cpp-turboquant-gemma4/tools/server/webui/src/lib/components/app/chat/ChatForm/ChatFormPromptPicker/ChatFormPromptPickerArgumentForm.svelte` | ChatFormPromptPickerArgumentInput, Button | $lib/types, $lib/components/ui/button |
| `llama-cpp-turboquant-gemma4/tools/server/webui/src/lib/components/app/chat/ChatForm/ChatFormPromptPicker/ChatFormPromptPickerArgumentInput.svelte` | Label, Input | $lib/types, $lib/components/ui/input, $lib/components/ui/label |
| `llama-cpp-turboquant-gemma4/tools/server/webui/src/lib/components/app/chat/ChatForm/ChatFormResourcePicker/ChatFormResourcePicker.svelte` | ChatFormPickerPopover, ChatFormPickerList, ChatFormPickerListItem, ChatFormPickerItemHeader | $lib/stores/conversations.svelte, $lib/stores/mcp.svelte, $lib/stores/mcp-resources.svelte |
| `llama-cpp-turboquant-gemma4/tools/server/webui/src/lib/components/app/chat/ChatForm/ChatFormTextarea.svelte` |  | $lib/utils |
| `llama-cpp-turboquant-gemma4/tools/server/webui/src/lib/components/app/chat/ChatMessages/ChatMessage.svelte` | ChatMessageSystem, ChatMessageMcpPrompt, ChatMessageUser, ChatMessageAssistant | $lib/contexts, $lib/stores/chat.svelte, $lib/stores/conversations.svelte |
| `llama-cpp-turboquant-gemma4/tools/server/webui/src/lib/components/app/chat/ChatMessages/ChatMessageActions.svelte` | ChatMessageBranchingControls, ActionIcon, Switch, DialogConfirmation | $lib/components/app, $lib/components/ui/switch, $lib/components/ui/checkbox |
| `llama-cpp-turboquant-gemma4/tools/server/webui/src/lib/components/app/chat/ChatMessages/ChatMessageAgenticContent.svelte` | MarkdownContent, CollapsibleContentBlock, Loader2, SyntaxHighlightedCode | $lib/components/app, $lib/stores/settings.svelte, $lib/enums |
| `llama-cpp-turboquant-gemma4/tools/server/webui/src/lib/components/app/chat/ChatMessages/ChatMessageAssistant.svelte` | Checkbox, Label, Button, Check | $lib/components/app, $lib/contexts, $lib/hooks/use-processing-state.svelte |
| `llama-cpp-turboquant-gemma4/tools/server/webui/src/lib/components/app/chat/ChatMessages/ChatMessageBranchingControls.svelte` | Button, ChevronLeft, ChevronRight | $lib/components/ui/button, $lib/components/ui/tooltip |
| `llama-cpp-turboquant-gemma4/tools/server/webui/src/lib/components/app/chat/ChatMessages/ChatMessageEditForm.svelte` | ChatForm, Switch, Button, DialogConfirmation | $lib/components/ui/button, $lib/components/ui/switch, $lib/components/app |
| `llama-cpp-turboquant-gemma4/tools/server/webui/src/lib/components/app/chat/ChatMessages/ChatMessageMcpPrompt.svelte` | ChatMessageEditForm, ChatMessageMcpPromptContent, ChatMessageActions | $lib/components/app, $lib/contexts, $lib/enums |
| `llama-cpp-turboquant-gemma4/tools/server/webui/src/lib/components/app/chat/ChatMessages/ChatMessageMcpPromptContent.svelte` | TruncatedText, Card | $lib/components/ui/card, $lib/types, $lib/stores/mcp.svelte |
| `llama-cpp-turboquant-gemma4/tools/server/webui/src/lib/components/app/chat/ChatMessages/ChatMessages.svelte` | ChatMessage | $lib/actions/fade-in-view.svelte, $lib/components/app, $lib/contexts |
| `llama-cpp-turboquant-gemma4/tools/server/webui/src/lib/components/app/chat/ChatMessages/ChatMessageStatistics.svelte` | BookOpenText, Sparkles, Wrench, Layers | $lib/components/app, $lib/components/ui/tooltip, $lib/enums |
| `llama-cpp-turboquant-gemma4/tools/server/webui/src/lib/components/app/chat/ChatMessages/ChatMessageSystem.svelte` | Button, Check, Card, MarkdownContent | $lib/components/ui/card, $lib/components/ui/button, $lib/components/app |
| `llama-cpp-turboquant-gemma4/tools/server/webui/src/lib/components/app/chat/ChatMessages/ChatMessageUser.svelte` | ChatMessageEditForm, ChatAttachmentsList, Card, MarkdownContent | $lib/components/ui/card, $lib/components/app, $lib/contexts |
| `llama-cpp-turboquant-gemma4/tools/server/webui/src/lib/components/app/chat/ChatScreen/ChatScreen.svelte` | ChatScreenDragOverlay, ChatScreenHeader, ChatMessages, ChatScreenProcessingInfo | $lib/components/app, $lib/components/ui/alert, $lib/components/ui/alert-dialog |
| `llama-cpp-turboquant-gemma4/tools/server/webui/src/lib/components/app/chat/ChatScreen/ChatScreenDragOverlay.svelte` | Upload |  |
| `llama-cpp-turboquant-gemma4/tools/server/webui/src/lib/components/app/chat/ChatScreen/ChatScreenForm.svelte` | ChatForm, ChatFormHelperText | $lib/components/app |
| `llama-cpp-turboquant-gemma4/tools/server/webui/src/lib/components/app/chat/ChatScreen/ChatScreenHeader.svelte` | Button, Settings | $lib/components/ui/button, $lib/components/ui/sidebar, $lib/contexts |
| `llama-cpp-turboquant-gemma4/tools/server/webui/src/lib/components/app/chat/ChatScreen/ChatScreenProcessingInfo.svelte` |  | $lib/constants, $lib/hooks/use-processing-state.svelte, $lib/stores/chat.svelte |
| `llama-cpp-turboquant-gemma4/tools/server/webui/src/lib/components/app/chat/ChatSettings/ChatSettings.svelte` | ChevronLeft, ChevronRight, ScrollArea, ChatSettingsImportExportTab | $lib/components/app, $lib/components/ui/scroll-area, $lib/stores/settings.svelte |
| `llama-cpp-turboquant-gemma4/tools/server/webui/src/lib/components/app/chat/ChatSettings/ChatSettingsFields.svelte` | Label, FlaskConical, ChatSettingsParameterSourceIndicator, Input | $lib/components/ui/checkbox, $lib/components/ui/input, $lib/components/ui/label/label.svelte |
| `llama-cpp-turboquant-gemma4/tools/server/webui/src/lib/components/app/chat/ChatSettings/ChatSettingsFooter.svelte` | Button, RotateCcw | $lib/components/ui/button, $lib/components/ui/alert-dialog, $lib/stores/settings.svelte |
| `llama-cpp-turboquant-gemma4/tools/server/webui/src/lib/components/app/chat/ChatSettings/ChatSettingsImportExportTab.svelte` | Button, Download, Upload, Trash2 | $lib/components/ui/button, $lib/components/app, $lib/utils |
| `llama-cpp-turboquant-gemma4/tools/server/webui/src/lib/components/app/chat/ChatSettings/ChatSettingsParameterSourceIndicator.svelte` | Badge, Wrench | $lib/components/ui/badge |
| `llama-cpp-turboquant-gemma4/tools/server/webui/src/lib/components/app/chat/ChatSidebar/ChatSidebar.svelte` | DatabaseConversation, ScrollArea, ChatSidebarActions, ChatSidebarConversationItem | $lib/components/app, $lib/components/ui/checkbox, $lib/components/ui/label/label.svelte |

---

## Top External Module Imports
| Module | Consumer Count |
|--------|----------------|
| `node:path` | 4615 |
| `node:fs` | 3615 |
| `@sveltejs/kit` | 3464 |
| `node:url` | 3015 |
| `node:crypto` | 2786 |
| `pg` | 2647 |
| `vitest` | 2599 |
| `path` | 2063 |
| `zod` | 1871 |
| `fs` | 1554 |
| `drizzle-orm` | 1144 |
| `node:fs/promises` | 1053 |
| `node:child_process` | 1003 |
| `url` | 863 |
| `dotenv` | 844 |
| `node:assert/strict` | 824 |
| `node:test` | 736 |
| `ioredis` | 689 |
| `crypto` | 680 |
| `$lib/types` | 662 |
| `$lib/server/db/client` | 525 |
| `$lib/server/env.server.js` | 458 |
| `child_process` | 456 |
| `fs/promises` | 384 |
| `drizzle-orm/pg-core` | 340 |
| `svelte` | 318 |
| `@playwright/test` | 303 |
| `$lib/server/db` | 267 |
| `$lib/server/redis.js` | 265 |
| `node-fetch` | 260 |

---

## Directories with TODO/FIXME
- `scripts/api-cleanup` — 664 marker(s), score 45
- `scripts/api-cleanup/reports` — 662 marker(s), score 45
- `scripts/api-cleanup/reports/backup-2025-12-14T20-51-26-276Z` — 594 marker(s), score 45
- `sveltekit-frontend/src` — 85 marker(s), score 100
- `tools/agentic-research/src/firecrawl` — 82 marker(s), score 100
- `sveltekit-frontend/src/lib` — 73 marker(s), score 100
- `scripts/api-cleanup/reports/backup-2025-12-14T21-11-49-641Z` — 68 marker(s), score 44
- `sveltekit-frontend/src/lib/server` — 55 marker(s), score 100
- `sveltekit-frontend/scripts` — 48 marker(s), score 100
- `scripts/atlas` — 42 marker(s), score 100
- `sveltekit-frontend/scripts/phase104-backups/src` — 36 marker(s), score 100
- `sveltekit-frontend/drizzle` — 24 marker(s), score 85
- `scripts/atlas/lib` — 24 marker(s), score 100
- `sveltekit-frontend/src/routes` — 11 marker(s), score 91
- `sveltekit-frontend/scripts/topology` — 9 marker(s), score 75

---

## ACE / KAG Integration

**Fast-AST source** (score cap 0.07):
- Redis key `code:index:manifest` — manifest with mode, fileCount, gateStats
- Redis keys `code:index:tag:{word}` — file paths per keyword tag
- Redis key `code:index:gate-stats` — live gate pass/fail counts
- Injected when codebase context is sparse (< 3 Qdrant chunks)

**KAG directory notes** (score cap 0.08):
- Redis keys `wiki:note:dir:{docId}` (24h TTL) — per-directory audit docs with warnings
- Injected as `## KAG Directory Audit Notes` section in ACE `webSearchContext`
- Populated by this script **and** by `POST /api/codebase-index/directory-summaries`

**Full GPU pipeline**:
```bash
npm run index:codebase:full
```
