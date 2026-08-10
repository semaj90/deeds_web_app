# Codebase Map — 20-Gate Deep Audit
> Generated: 2026-08-10T08:20:23.978Z
> Mode: `fast-ast` · CPU-only · No GPU required
> Regenerate: `npm run index:codebase:fast:plan`

---

## Summary
| Metric | Count |
|--------|-------|
| Files scanned | 23254 |
| Directories analysed | 1022 |
| Route files | 1190 |
| Svelte components | 1162 |
| API handlers | 3303 |
| API routes without auth | 38 |
| API routes without Zod | 20 |
| SSR-unsafe files | 0 |
| Svelte 4 legacy patterns | 3 |
| Hardcoded localhost refs | 1701 |
| Routes without test pairing | 100 |
| Cyclic import pairs | 16 |
| Drizzle table refs | 1531 |
| TODO/FIXME markers | 978 |

---

## 20-Gate Audit Summary

| Gate | Check | Pass | Fail |
|------|-------|------|------|
| G4  | Auth guard on API routes | 890 | 39 |
| G5  | Zod validation on API routes | 630 | 20 |
| G11 | No hardcoded localhost (excl env.server) | 21553 | 1701 |
| G14a | No `export let` (Svelte 4 props) | 23254 | 0 |
| G14b | No `$:` reactive declarations | 23252 | 2 |
| G14c | No `on:event=` directives | 23252 | 2 |
| G14d | No `createEventDispatcher()` | 23254 | 0 |
| G14e | No runes in plain `.ts` files | 23229 | 25 |
| G15 | No SSR-unsafe globals (unguarded) | 23254 | 0 |
| G16 | Server routes have test pairing | 762 | 100 |
| G17 | Server routes have error handling | 818 | 125 |
| G20 | Cyclic import pairs | — | 16 |

---

## Directory Scorecard (1022 dirs · lowest score = most attention needed)

**Score factors**: Auth/API coverage 25pts · Zod coverage 15pts · Drizzle ref 10pts · No TODOs 15pts · SSR-safe 10pts · No Svelte4 10pts · No localhost 5pts · Error handling 5pts · Non-empty 5pts

**Flags**: 🔴ssr = SSR-unsafe globals · 🟡sv4 = Svelte4 legacy · 🟠lh = localhost hardcoded · ⬜notest = routes lack tests


| Status | Directory | Score | Files | Lines | APIs | Auth/Zod | TODOs | Flags |
|--------|-----------|-------|-------|-------|------|----------|-------|-------|
| ⚠️ | `scripts/api-cleanup` | 45 | 40 | 201040 | 2444 | 262/388 | 670 | 🟠lh |
| ⚠️ | `scripts/api-cleanup/reports` | 45 | 6 | 191480 | 2436 | 262/384 | 668 | 🟠lh |
| ⚠️ | `scripts/api-cleanup/reports/backup-2025-12-14T20-51-26-276Z` | 45 | 2604 | 180596 | 2430 | 258/380 | 664 | 🟠lh |
| ⚠️ | `sveltekit-frontend/src/routes/.well-known` | 58 | 4 | 512 | 4 | 0/2 | 0 | — |
| ⚠️ | `tools/agentic-research/src/local-deep-research` | 68 | 906 | 290768 | 0 | 0/74 | 2 | 🔴ssr 🟠lh |
| ✅ | `llama-cpp-turboquant-gemma4/tools/server` | 70 | 1 | 60689 | 0 | 2/24 | 3 | 🟠lh |
| ✅ | `scripts/verify` | 70 | 20 | 4466 | 0 | 0/12 | 8 | 🟠lh |
| ✅ | `scripts/api-cleanup/reports/backup-2025-12-14T21-11-49-641Z` | 72 | 6 | 224 | 6 | 4/4 | 4 | — |
| ✅ | `packages/parent-atlas-client/src` | 75 | 2 | 790 | 0 | 0/1 | 5 | — |
| ✅ | `packages/parent-atlas-client/src/a2a` | 75 | 1 | 101 | 0 | 0/0 | 3 | — |
| ✅ | `packages/parent-atlas-core` | 75 | 1 | 1293 | 0 | 0/0 | 5 | — |
| ✅ | `packages/parent-atlas-core/src` | 75 | 3 | 1249 | 0 | 0/0 | 5 | — |
| ✅ | `sveltekit-frontend/scripts/topology` | 75 | 1 | 203 | 0 | 0/0 | 9 | — |
| ✅ | `sveltekit-frontend/src/routes/api` | 75 | 822 | 122252 | 810 | 766/606 | 9 | 🟠lh ⬜notest |
| ✅ | `llama-cpp-turboquant-gemma4/tools/server/webui` | 78 | 435 | 57041 | 0 | 1/18 | 1 | 🟠lh |
| ✅ | `packages/atlas-core/src/langgraph` | 78 | 7 | 1734 | 0 | 0/3 | 2 | 🟠lh |
| ✅ | `packages/parent-atlas-retrieval/src/crossencoder` | 78 | 3 | 565 | 0 | 1/0 | 1 | 🟠lh |
| ✅ | `sveltekit-frontend/src/mcp` | 78 | 27 | 26167 | 0 | 3/30 | 1 | 🔴ssr 🟠lh |
| ✅ | `packages/atlas-core/src/evidence` | 80 | 15 | 1177 | 1 | 0/2 | 0 | — |
| ✅ | `scripts/agent` | 80 | 18 | 4656 | 0 | 0/8 | 4 | 🟠lh |
| ✅ | `sveltekit-frontend/src/mcp/tools` | 80 | 10 | 3577 | 0 | 0/8 | 0 | 🔴ssr |
| ✅ | `llama-cpp-turboquant-gemma4/tools/server/public_legacy` | 83 | 5 | 1474 | 0 | 0/2 | 2 | — |
| ✅ | `packages/parent-atlas-client/src/grpc` | 83 | 1 | 64 | 0 | 0/0 | 2 | — |
| ✅ | `scripts/benchmark` | 83 | 2 | 774 | 0 | 0/2 | 2 | — |
| ✅ | `scripts/executive` | 83 | 2 | 1126 | 0 | 0/2 | 2 | — |
| ✅ | `sveltekit-frontend/src/lib/workers` | 83 | 10 | 1873 | 0 | 0/1 | 2 | — |
| ✅ | `claude-mem/src/npx-cli` | 85 | 3 | 3852 | 0 | 0/4 | 0 | 🟠lh |
| ✅ | `claude-mem/src/npx-cli/commands` | 85 | 6 | 2903 | 0 | 0/2 | 0 | 🟠lh |
| ✅ | `llama-cpp-turboquant-gemma4/tools/server/bench` | 85 | 1 | 163 | 0 | 0/1 | 0 | 🟠lh |
| ✅ | `llama-cpp-turboquant-gemma4/tools/server/public_simplechat` | 85 | 3 | 1409 | 0 | 0/1 | 0 | 🟠lh |
| ✅ | `packages/parent-atlas/src/pipelines` | 85 | 19 | 2721 | 0 | 0/3 | 0 | 🟠lh |
| ✅ | `packages/parent-atlas-runtime/src` | 85 | 1 | 1082 | 0 | 0/0 | 8 | — |
| ✅ | `packages/parent-atlas-runtime/src/facade` | 85 | 1 | 277 | 0 | 0/0 | 6 | — |
| ✅ | `scripts/agentic` | 85 | 10 | 2886 | 0 | 0/10 | 0 | 🟠lh |
| ✅ | `scripts/ai` | 85 | 8 | 714 | 0 | 0/8 | 0 | 🟠lh |
| ✅ | `scripts/atlas/ingester` | 85 | 22 | 2496 | 0 | 0/14 | 0 | 🟠lh |
| ✅ | `scripts/atlas/knowledge-layer` | 85 | 18 | 2230 | 0 | 0/0 | 0 | 🟠lh |
| ✅ | `scripts/audit` | 85 | 6 | 2078 | 0 | 0/2 | 0 | 🟠lh |
| ✅ | `scripts/cache` | 85 | 14 | 1462 | 0 | 0/8 | 0 | 🟠lh |
| ✅ | `scripts/consolidate` | 85 | 10 | 2902 | 0 | 0/6 | 0 | 🟠lh |
| ✅ | `scripts/docs` | 85 | 2 | 830 | 0 | 0/0 | 0 | 🟠lh |
| ✅ | `scripts/eval` | 85 | 2 | 810 | 0 | 0/0 | 0 | 🟠lh |
| ✅ | `scripts/gpu` | 85 | 12 | 2330 | 0 | 0/2 | 0 | 🟠lh |
| ✅ | `scripts/graph` | 85 | 10 | 2282 | 0 | 0/8 | 0 | 🟠lh |
| ✅ | `scripts/operator` | 85 | 6 | 1362 | 0 | 0/4 | 0 | 🟠lh |
| ✅ | `scripts/phase-b` | 85 | 2 | 834 | 0 | 0/2 | 0 | 🟠lh |
| ✅ | `scripts/skills` | 85 | 4 | 1616 | 0 | 0/2 | 0 | 🟠lh |
| ✅ | `scripts/startup` | 85 | 38 | 7466 | 0 | 2/10 | 0 | 🟠lh |
| ✅ | `scripts/vector` | 85 | 2 | 246 | 0 | 0/0 | 0 | 🟠lh |
| ✅ | `scripts/workers` | 85 | 6 | 1190 | 0 | 0/4 | 0 | 🟠lh |
| ✅ | `sveltekit-frontend/.vscode` | 85 | 14 | 6166 | 0 | 0/1 | 0 | 🟠lh |
| ✅ | `sveltekit-frontend/drizzle` | 85 | 8 | 922759 | 0 | 0/0 | 24 | — |
| ✅ | `sveltekit-frontend/drizzle/introspected` | 85 | 2 | 20357 | 0 | 0/0 | 4 | — |
| ✅ | `sveltekit-frontend/public/js` | 85 | 1 | 571 | 0 | 0/0 | 0 | 🟠lh |
| ✅ | `sveltekit-frontend/scripts/ace` | 85 | 17 | 1410 | 0 | 0/7 | 0 | 🟠lh |
| ✅ | `sveltekit-frontend/scripts/diagnose` | 85 | 2 | 379 | 0 | 0/0 | 0 | 🟠lh |
| ✅ | `sveltekit-frontend/scripts/diagnostics` | 85 | 8 | 571 | 0 | 0/4 | 0 | 🟠lh |
| ✅ | `sveltekit-frontend/scripts/evaluation` | 85 | 1 | 269 | 0 | 0/1 | 0 | 🟠lh |
| ✅ | `sveltekit-frontend/scripts/kag` | 85 | 1 | 308 | 0 | 0/1 | 0 | 🟠lh |
| ✅ | `sveltekit-frontend/scripts/lib` | 85 | 7 | 1261 | 0 | 0/4 | 0 | 🟠lh |
| ✅ | `sveltekit-frontend/scripts/scenarios` | 85 | 4 | 359 | 0 | 0/3 | 0 | 🟠lh |
| ✅ | `sveltekit-frontend/src/lib/components` | 85 | 697 | 177596 | 0 | 0/49 | 8 | — |
| ✅ | `sveltekit-frontend/src/lib/gpu` | 85 | 30 | 8321 | 0 | 0/4 | 0 | 🟠lh |
| ✅ | `sveltekit-frontend/src/lib/utils` | 85 | 49 | 7636 | 0 | 2/7 | 0 | 🟠lh |
| ✅ | `sveltekit-frontend/src/routes/dev` | 85 | 2 | 524 | 0 | 1/1 | 0 | 🟠lh ⬜notest |
| ✅ | `sveltekit-frontend/tests/helpers` | 85 | 3 | 374 | 0 | 1/1 | 0 | 🟠lh |
| ✅ | `sveltekit-frontend/tests/scripts` | 85 | 3 | 104 | 0 | 0/0 | 0 | 🟠lh |
| ✅ | `sveltekit-frontend/tmp` | 85 | 14 | 162199 | 0 | 0/0 | 0 | 🟠lh |
| ✅ | `triton-trt-llm/scripts` | 85 | 1 | 532 | 0 | 0/1 | 0 | 🟠lh |
| ✅ | `packages/parent-atlas` | 88 | 3 | 7274 | 0 | 0/16 | 1 | 🟠lh |
| ✅ | `packages/parent-atlas/src` | 88 | 3 | 6512 | 0 | 0/14 | 1 | 🟠lh |
| ✅ | `packages/parent-atlas/src/core` | 88 | 14 | 2117 | 0 | 0/9 | 1 | 🟠lh |
| ✅ | `packages/parent-atlas-retrieval` | 88 | 2 | 11919 | 0 | 1/6 | 1 | 🟠lh |
| ✅ | `packages/parent-atlas-retrieval/src` | 88 | 1 | 10766 | 0 | 1/6 | 1 | 🟠lh |
| ✅ | `scripts/phase85` | 88 | 54 | 15402 | 0 | 0/14 | 2 | 🟠lh |
| ✅ | `$lib/utils` | 90 | 1 | 15 | 0 | 0/0 | 0 | — |
| ✅ | `.gemini/antigravity/scratch` | 90 | 3 | 132 | 0 | 0/0 | 0 | — |
| ✅ | `.proofs/four-lanes` | 90 | 5 | 170 | 0 | 0/0 | 0 | — |
| ✅ | `.proofs/p4` | 90 | 1 | 126 | 0 | 0/0 | 0 | — |
| ✅ | `.vscode/extensions/mcp-context7-assistant/src` | 90 | 121 | 121 | 0 | 0/0 | 0 | — |
| ✅ | `.vscode/tasks` | 90 | 1 | 11 | 0 | 0/0 | 0 | — |
| ✅ | `claude-mem/.agents/plugins` | 90 | 1 | 21 | 0 | 0/0 | 0 | — |
| ✅ | `claude-mem/.claude` | 90 | 1 | 11 | 0 | 0/0 | 0 | — |
| ✅ | `claude-mem/.claude-plugin` | 90 | 3 | 69 | 0 | 0/0 | 0 | — |
| ✅ | `claude-mem/.codex-plugin` | 90 | 1 | 47 | 0 | 0/0 | 0 | — |
| ✅ | `claude-mem/cursor-hooks` | 90 | 1 | 35 | 0 | 0/0 | 0 | — |
| ✅ | `claude-mem/docs/context` | 90 | 1 | 114 | 0 | 0/0 | 0 | — |
| ✅ | `claude-mem/docs/i18n` | 90 | 1 | 146 | 0 | 0/0 | 0 | — |
| ✅ | `claude-mem/docs/public` | 90 | 1 | 160 | 0 | 0/0 | 0 | — |
| ✅ | `claude-mem/install` | 90 | 1 | 37 | 0 | 0/0 | 0 | — |
| ✅ | `claude-mem/install/public` | 90 | 1 | 14 | 0 | 0/0 | 0 | — |
| ✅ | `claude-mem/openclaw` | 90 | 4 | 2459 | 0 | 1/2 | 0 | — |
| ✅ | `claude-mem/openclaw/src` | 90 | 2 | 2212 | 0 | 1/2 | 0 | — |
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
| ✅ | `claude-mem/src/bin` | 90 | 2 | 425 | 0 | 0/1 | 0 | — |
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
| ✅ | `claude-mem/src/services` | 90 | 4 | 31699 | 0 | 23/37 | 0 | — |
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
| ✅ | `crates/atlas_packet_parser` | 90 | 6 | 797 | 0 | 0/0 | 0 | — |
| ✅ | `crates/atlas_packet_parser/target` | 90 | 1 | 388 | 0 | 0/0 | 0 | — |
| ✅ | `crates/atlas_packet_parser/target/debug` | 90 | 220 | 220 | 0 | 0/0 | 0 | — |
| ✅ | `crates/atlas_packet_parser/target/release` | 90 | 167 | 167 | 0 | 0/0 | 0 | — |
| ✅ | `crates/omni-bridge/target` | 90 | 3 | 13 | 0 | 0/0 | 0 | — |
| ✅ | `crates/omni-bridge/target/debug` | 90 | 10 | 10 | 0 | 0/0 | 0 | — |
| ✅ | `crates/turbovec-napi` | 90 | 6 | 930 | 0 | 0/0 | 0 | — |
| ✅ | `crates/turbovec-napi/target` | 90 | 1 | 398 | 0 | 0/0 | 0 | — |
| ✅ | `crates/turbovec-napi/target/debug` | 90 | 147 | 147 | 0 | 0/0 | 0 | — |
| ✅ | `crates/turbovec-napi/target/release` | 90 | 137 | 137 | 0 | 0/0 | 0 | — |
| ✅ | `crates/turbovec-napi/target/x86_64-pc-windows-msvc` | 90 | 113 | 113 | 0 | 0/0 | 0 | — |
| ✅ | `cypress/e2e` | 90 | 1 | 51 | 0 | 0/0 | 0 | — |
| ✅ | `deeds-web-app/temp_poc_amqp_test` | 90 | 1 | 106 | 0 | 0/0 | 0 | — |
| ✅ | `docs/.okf/dev` | 90 | 2 | 147 | 0 | 0/0 | 0 | — |
| ✅ | `docs/.okf/library-module-index` | 90 | 2 | 806 | 0 | 0/0 | 0 | — |
| ✅ | `docs/ai-os` | 90 | 1 | 4 | 0 | 0/0 | 0 | — |
| ✅ | `docs/architecture` | 90 | 2 | 133 | 0 | 0/0 | 0 | — |
| ✅ | `docs/atlas` | 90 | 6 | 55638 | 0 | 0/0 | 0 | — |
| ✅ | `docs/contracts` | 90 | 3 | 344 | 0 | 0/0 | 0 | — |
| ✅ | `docs/graph` | 90 | 26 | 660947 | 0 | 0/0 | 0 | — |
| ✅ | `docs/okf` | 90 | 1 | 175 | 0 | 0/0 | 0 | — |
| ✅ | `docs/packets` | 90 | 1 | 532 | 0 | 0/0 | 0 | — |
| ✅ | `docs/phase-110-agentic-indexing/schemas` | 90 | 2 | 254 | 0 | 0/0 | 0 | — |
| ✅ | `docs/phase100` | 90 | 7 | 29520 | 0 | 0/0 | 0 | — |
| ✅ | `docs/phase107-operations` | 90 | 1 | 68 | 0 | 0/0 | 0 | — |
| ✅ | `docs/profile-cards/data` | 90 | 23 | 716 | 0 | 0/0 | 0 | — |
| ✅ | `docs/reports` | 90 | 449 | 5101985 | 0 | 0/0 | 0 | — |
| ✅ | `docs/reports/atlas` | 90 | 4 | 174 | 0 | 0/0 | 0 | — |
| ✅ | `docs/reports/fixtures` | 90 | 4 | 4 | 0 | 0/0 | 0 | — |
| ✅ | `docs/reports/parent-atlas` | 90 | 3 | 4155 | 0 | 0/0 | 0 | — |
| ✅ | `docs/reports/proof-of-truth` | 90 | 11 | 543 | 0 | 0/0 | 0 | — |
| ✅ | `docs/reports/replay` | 90 | 40 | 11334 | 0 | 0/0 | 0 | — |
| ✅ | `docs/reports/schema` | 90 | 3 | 1061 | 0 | 0/0 | 0 | — |
| ✅ | `docs/reports/tool-invocation` | 90 | 1 | 50 | 0 | 0/0 | 0 | — |
| ✅ | `docs/reports/vector-lineage` | 90 | 2 | 234 | 0 | 0/0 | 0 | — |
| ✅ | `docs/stage1` | 90 | 1 | 25805 | 0 | 0/0 | 0 | — |
| ✅ | `docs/stage4b` | 90 | 1 | 22 | 0 | 0/0 | 0 | — |
| ✅ | `docs/stage5` | 90 | 1 | 118 | 0 | 0/0 | 0 | — |
| ✅ | `docs/vector-governance` | 90 | 1 | 121 | 0 | 0/0 | 0 | — |
| ✅ | `drizzle/meta` | 90 | 4 | 4562 | 0 | 0/0 | 0 | — |
| ✅ | `llama-cpp-turboquant-gemma4/.gemini` | 90 | 1 | 2 | 0 | 0/0 | 0 | — |
| ✅ | `llama-cpp-turboquant-gemma4/benches/dgx-spark` | 90 | 2 | 2902 | 0 | 0/0 | 0 | — |
| ✅ | `llama-cpp-turboquant-gemma4/docs/backend/snapdragon` | 90 | 1 | 62 | 0 | 0/0 | 0 | — |
| ✅ | `llama-cpp-turboquant-gemma4/examples/gguf-hash/deps` | 90 | 4 | 53 | 0 | 0/0 | 0 | — |
| ✅ | `llama-cpp-turboquant-gemma4/examples/llama.swiftui/llama.swiftui` | 90 | 2 | 21 | 0 | 0/0 | 0 | — |
| ✅ | `llama-cpp-turboquant-gemma4/scripts` | 90 | 1 | 111 | 0 | 0/0 | 0 | — |
| ✅ | `llama-cpp-turboquant-gemma4/tests` | 90 | 1 | 11 | 0 | 0/1 | 0 | — |
| ✅ | `llama-cpp-turboquant-gemma4/tools/server/public` | 90 | 1 | 470 | 0 | 1/1 | 0 | — |
| ✅ | `log/artifacts/phase108d` | 90 | 8 | 287 | 0 | 0/0 | 0 | — |
| ✅ | `log/artifacts/phase109` | 90 | 2 | 113 | 0 | 0/0 | 0 | — |
| ✅ | `log/artifacts/semantic-contract` | 90 | 10 | 584 | 0 | 0/0 | 0 | — |
| ✅ | `mcp-server-mcp/.changeset` | 90 | 1 | 12 | 0 | 0/0 | 0 | — |
| ✅ | `mcp-server-mcp/.claude-plugin` | 90 | 1 | 23 | 0 | 0/0 | 0 | — |
| ✅ | `mcp-server-mcp/.cursor-plugin` | 90 | 1 | 14 | 0 | 0/0 | 0 | — |
| ✅ | `mcp-server-mcp/.vscode` | 90 | 1 | 11 | 0 | 0/0 | 0 | — |
| ✅ | `mcp-server-mcp/apps/mcp-remote` | 90 | 4 | 185 | 0 | 0/0 | 0 | — |
| ✅ | `mcp-server-mcp/apps/mcp-remote/src` | 90 | 5 | 69 | 0 | 0/0 | 0 | — |
| ✅ | `mcp-server-mcp/packages/mcp-server` | 90 | 1 | 3651 | 0 | 0/4 | 0 | — |
| ✅ | `mcp-server-mcp/packages/mcp-server/scripts` | 90 | 2 | 252 | 0 | 0/0 | 0 | — |
| ✅ | `mcp-server-mcp/packages/mcp-server/src` | 90 | 38 | 3355 | 0 | 0/4 | 0 | — |
| ✅ | `mcp-server-mcp/packages/mcp-stdio` | 90 | 5 | 221 | 0 | 0/2 | 0 | — |
| ✅ | `mcp-server-mcp/packages/mcp-stdio/scripts` | 90 | 1 | 15 | 0 | 0/1 | 0 | — |
| ✅ | `mcp-server-mcp/packages/mcp-stdio/src` | 90 | 2 | 75 | 0 | 0/1 | 0 | — |
| ✅ | `mcp-server-mcp/packages/opencode` | 90 | 6 | 581 | 0 | 0/1 | 0 | — |
| ✅ | `mcp-server-mcp/packages/opencode/scripts` | 90 | 1 | 61 | 0 | 0/0 | 0 | — |
| ✅ | `mcp-server-mcp/plugins/claude/svelte` | 90 | 3 | 36 | 0 | 0/0 | 0 | — |
| ✅ | `mcp-server-mcp/plugins/cursor/svelte` | 90 | 1 | 10 | 0 | 0/0 | 0 | — |
| ✅ | `mcp-server-mcp/scripts` | 90 | 7 | 716 | 0 | 0/1 | 0 | — |
| ✅ | `memory/agent-runs` | 90 | 1 | 146 | 0 | 0/0 | 0 | — |
| ✅ | `memory/atlas` | 90 | 1 | 970675 | 0 | 0/0 | 0 | — |
| ✅ | `memory/clusters` | 90 | 7 | 7 | 0 | 0/0 | 0 | — |
| ✅ | `memory/exports` | 90 | 52 | 387826 | 0 | 0/0 | 0 | — |
| ✅ | `memory/exports/atlas` | 90 | 1 | 91651 | 0 | 0/0 | 0 | — |
| ✅ | `memory/exports/parent-atlas` | 90 | 1 | 131565 | 0 | 0/0 | 0 | — |
| ✅ | `memory/graph` | 90 | 1 | 4320 | 0 | 0/0 | 0 | — |
| ✅ | `memory/graphify/deep` | 90 | 1 | 663970 | 0 | 0/0 | 0 | — |
| ✅ | `memory/knowledge` | 90 | 6 | 1441 | 0 | 0/0 | 0 | — |
| ✅ | `memory/manifests` | 90 | 3 | 145 | 0 | 0/0 | 0 | — |
| ✅ | `memory/packets` | 90 | 1 | 105 | 0 | 0/0 | 0 | — |
| ✅ | `memory/reports` | 90 | 1 | 195667 | 0 | 0/0 | 0 | — |
| ✅ | `memory/rewards` | 90 | 2 | 52 | 0 | 0/0 | 0 | — |
| ✅ | `minio-data/.minio.sys` | 90 | 1 | 1 | 0 | 0/0 | 0 | — |
| ✅ | `next_steps/active` | 90 | 2 | 464350 | 0 | 0/0 | 0 | — |
| ✅ | `packages/atlas` | 90 | 1 | 241 | 0 | 0/0 | 0 | — |
| ✅ | `packages/atlas/contracts` | 90 | 2 | 50 | 0 | 0/0 | 0 | — |
| ✅ | `packages/atlas/lib` | 90 | 2 | 179 | 0 | 0/0 | 0 | — |
| ✅ | `packages/atlas-core/events` | 90 | 1 | 114 | 0 | 0/0 | 0 | — |
| ✅ | `packages/atlas-core/src/events` | 90 | 2 | 390 | 0 | 0/1 | 0 | — |
| ✅ | `packages/atlas-core/src/identity` | 90 | 2 | 73 | 0 | 0/0 | 0 | — |
| ✅ | `packages/atlas-core/src/nats` | 90 | 1 | 140 | 0 | 0/0 | 0 | — |
| ✅ | `packages/atlas-core/src/packet` | 90 | 6 | 324 | 0 | 0/3 | 0 | — |
| ✅ | `packages/atlas-core/src/ranking` | 90 | 1 | 295 | 0 | 0/0 | 0 | — |
| ✅ | `packages/atlas-core/src/telemetry` | 90 | 2 | 406 | 0 | 0/0 | 0 | — |
| ✅ | `packages/atlas-core/src/tools` | 90 | 1 | 255 | 0 | 0/1 | 0 | — |
| ✅ | `packages/atlas-core/src/types` | 90 | 4 | 383 | 0 | 0/4 | 0 | — |
| ✅ | `packages/atlas-duckdb` | 90 | 2 | 2100 | 0 | 0/0 | 0 | — |
| ✅ | `packages/atlas-duckdb/src` | 90 | 12 | 2030 | 0 | 0/0 | 0 | — |
| ✅ | `packages/atlas-orchestrator` | 90 | 2 | 245 | 0 | 0/2 | 0 | — |
| ✅ | `packages/atlas-orchestrator/src/steps` | 90 | 1 | 96 | 0 | 0/1 | 0 | — |
| ✅ | `packages/atlas-orchestrator/src/workflows` | 90 | 1 | 83 | 0 | 0/1 | 0 | — |
| ✅ | `packages/parent-atlas/docs/reports` | 90 | 1 | 126 | 0 | 0/0 | 0 | — |
| ✅ | `packages/parent-atlas/src/adapters` | 90 | 5 | 851 | 0 | 0/1 | 0 | — |
| ✅ | `packages/parent-atlas/src/gates` | 90 | 6 | 316 | 0 | 0/1 | 0 | — |
| ✅ | `packages/parent-atlas/test` | 90 | 3 | 252 | 0 | 0/2 | 0 | — |
| ✅ | `packages/parent-atlas-client/src/http` | 90 | 1 | 135 | 0 | 0/0 | 0 | — |
| ✅ | `packages/parent-atlas-client/src/mcp` | 90 | 1 | 311 | 0 | 0/1 | 0 | — |
| ✅ | `packages/parent-atlas-core/src/contracts` | 90 | 2 | 325 | 0 | 0/0 | 0 | — |
| ✅ | `packages/parent-atlas-core/src/schemas` | 90 | 2 | 102 | 0 | 0/0 | 0 | — |
| ✅ | `packages/parent-atlas-ingest` | 90 | 2 | 374 | 0 | 0/0 | 0 | — |
| ✅ | `packages/parent-atlas-ingest/src` | 90 | 1 | 318 | 0 | 0/0 | 0 | — |
| ✅ | `packages/parent-atlas-ingest/src/scanner` | 90 | 2 | 304 | 0 | 0/0 | 0 | — |
| ✅ | `packages/parent-atlas-opencode` | 90 | 2 | 82 | 0 | 0/0 | 0 | — |
| ✅ | `packages/parent-atlas-opencode/src` | 90 | 1 | 15 | 0 | 0/0 | 0 | — |
| ✅ | `packages/parent-atlas-retrieval/src/bifrost` | 90 | 8 | 1150 | 0 | 0/2 | 0 | — |
| ✅ | `packages/parent-atlas-retrieval/tests/bifrost` | 90 | 3 | 1071 | 0 | 0/0 | 0 | — |
| ✅ | `packages/parent-atlas-workstation-integration-kit` | 90 | 2 | 579 | 0 | 0/0 | 0 | — |
| ✅ | `packages/parent-atlas-workstation-integration-kit/src` | 90 | 8 | 547 | 0 | 0/0 | 0 | — |
| ✅ | `packages/semantic-contracts/schemas` | 90 | 4 | 731 | 0 | 0/0 | 0 | — |
| ✅ | `parent-atlas-gpu-math-bundle/scripts/phase85` | 90 | 2 | 68 | 0 | 0/0 | 0 | — |
| ✅ | `parent-atlas-gpu-math-bundle/sveltekit-frontend/scripts/graphify` | 90 | 3 | 61 | 0 | 0/0 | 0 | — |
| ✅ | `parent-atlas-gpu-math-bundle/sveltekit-frontend/src/lib` | 90 | 2 | 83 | 0 | 0/0 | 0 | — |
| ✅ | `parent-atlas-graph-runtime-enhancement/src/cache` | 90 | 1 | 11 | 0 | 0/0 | 0 | — |
| ✅ | `parent-atlas-graph-runtime-enhancement/src/events` | 90 | 1 | 24 | 0 | 0/0 | 0 | — |
| ✅ | `parent-atlas-graph-runtime-enhancement/src/graph` | 90 | 3 | 96 | 0 | 0/0 | 0 | — |
| ✅ | `parent-atlas-tensor-residency-integration/examples` | 90 | 6 | 178 | 0 | 0/0 | 0 | — |
| ✅ | `parent-atlas-tensor-residency-integration/sveltekit-frontend/src/lib` | 90 | 66 | 1863 | 0 | 0/6 | 0 | — |
| ✅ | `parent-atlas-tensor-residency-integration/sveltekit-frontend/tests/atlas` | 90 | 12 | 174 | 0 | 0/0 | 0 | — |
| ✅ | `parent_atlas_tensor_residency_integration_v2/examples` | 90 | 1 | 20 | 0 | 0/0 | 0 | — |
| ✅ | `parent_atlas_tensor_residency_integration_v2/sveltekit-frontend/src/lib` | 90 | 16 | 432 | 0 | 0/0 | 0 | — |
| ✅ | `parent_atlas_tensor_residency_integration_v2/sveltekit-frontend/tests/atlas` | 90 | 7 | 73 | 0 | 0/0 | 0 | — |
| ✅ | `reports/semantic-contracts` | 90 | 3 | 524 | 0 | 0/0 | 0 | — |
| ✅ | `scratch/index-checkpoints` | 90 | 2 | 196384 | 0 | 0/0 | 0 | — |
| ✅ | `scratch/obsidian_vault/.obsidian/plugins` | 90 | 2 | 59245 | 0 | 1/1 | 0 | — |
| ✅ | `scripts/agents` | 90 | 4 | 234 | 0 | 0/2 | 0 | — |
| ✅ | `scripts/ai-os` | 90 | 6 | 182 | 0 | 0/4 | 0 | — |
| ✅ | `scripts/analysis` | 90 | 8 | 398 | 0 | 0/0 | 0 | — |
| ✅ | `scripts/analysis_reports` | 90 | 24 | 10410 | 0 | 0/0 | 0 | — |
| ✅ | `scripts/atlas/fixtures` | 90 | 6 | 148 | 0 | 0/0 | 0 | — |
| ✅ | `scripts/atlas/helpers` | 90 | 12 | 2334 | 0 | 0/6 | 0 | — |
| ✅ | `scripts/atlas/out` | 90 | 8 | 6782 | 0 | 0/0 | 0 | — |
| ✅ | `scripts/atlas/sparse` | 90 | 2 | 580 | 0 | 0/0 | 0 | — |
| ✅ | `scripts/atlas/sparse/lib` | 90 | 4 | 292 | 0 | 0/0 | 0 | — |
| ✅ | `scripts/bench` | 90 | 4 | 500 | 0 | 0/2 | 0 | — |
| ✅ | `scripts/case_data/_cache` | 90 | 292 | 292 | 0 | 0/0 | 0 | — |
| ✅ | `scripts/court_data/constitutions` | 90 | 18 | 2360 | 0 | 0/0 | 0 | — |
| ✅ | `scripts/dev` | 90 | 8 | 690 | 0 | 0/4 | 0 | — |
| ✅ | `scripts/engram` | 90 | 2 | 8 | 0 | 0/0 | 0 | — |
| ✅ | `scripts/env` | 90 | 2 | 386 | 0 | 0/0 | 0 | — |
| ✅ | `scripts/error-resolution` | 90 | 8 | 10336 | 0 | 0/4 | 0 | — |
| ✅ | `scripts/error-resolution/services` | 90 | 12 | 3876 | 0 | 0/4 | 0 | — |
| ✅ | `scripts/error-resolution/tests` | 90 | 12 | 5436 | 0 | 0/0 | 0 | — |
| ✅ | `scripts/eval/data` | 90 | 2 | 328 | 0 | 0/0 | 0 | — |
| ✅ | `scripts/evals` | 90 | 2 | 800 | 0 | 0/0 | 0 | — |
| ✅ | `scripts/graphify/lib` | 90 | 2 | 366 | 0 | 0/0 | 0 | — |
| ✅ | `scripts/graphify/stages` | 90 | 4 | 840 | 0 | 0/0 | 0 | — |
| ✅ | `scripts/lib` | 90 | 4 | 514 | 0 | 0/0 | 0 | — |
| ✅ | `scripts/mapreduce` | 90 | 4 | 176 | 0 | 0/0 | 0 | — |
| ✅ | `scripts/memory/graphify/gds` | 90 | 16 | 573596 | 0 | 0/0 | 0 | — |
| ✅ | `scripts/native` | 90 | 6 | 1672 | 0 | 0/4 | 0 | — |
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
| ✅ | `scripts/sidecars` | 90 | 4 | 1122 | 0 | 0/0 | 0 | — |
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
| ✅ | `scripts/tests/screenshots/2026-04-18T02-59-52` | 90 | 4 | 160 | 0 | 0/0 | 0 | — |
| ✅ | `scripts/tests/screenshots/cases-ui` | 90 | 2 | 112 | 0 | 0/0 | 0 | — |
| ✅ | `scripts/tests/screenshots/glossary` | 90 | 2 | 140 | 0 | 0/0 | 0 | — |
| ✅ | `scripts/tests/screenshots/production-proof` | 90 | 2 | 2344 | 0 | 0/0 | 0 | — |
| ✅ | `scripts/tests/vlm-tests` | 90 | 12 | 12 | 0 | 0/0 | 0 | — |
| ✅ | `scripts/unsloth-training/COLAB_PACKAGE/training-datasets` | 90 | 2 | 198 | 0 | 0/0 | 0 | — |
| ✅ | `scripts/validate` | 90 | 2 | 1164 | 0 | 0/2 | 0 | — |
| ✅ | `scripts/valkey` | 90 | 6 | 468 | 0 | 0/6 | 0 | — |
| ✅ | `simd-bridge/build-x64-cuda/.cmake/api` | 90 | 104 | 21916 | 0 | 0/0 | 0 | — |
| ✅ | `simd-bridge/build-x64-cuda/CMakeFiles` | 90 | 2 | 18 | 0 | 0/0 | 0 | — |
| ✅ | `simd-bridge/build-x64-cuda/cpp/CMakeFiles` | 90 | 2 | 16 | 0 | 0/0 | 0 | — |
| ✅ | `simd-bridge/cpp` | 90 | 4 | 1500 | 0 | 0/2 | 0 | — |
| ✅ | `simd-bridge/cpp/build-verify-2026-05-31T08-06-57-567Z/CMakeFiles` | 90 | 2 | 16 | 0 | 0/0 | 0 | — |
| ✅ | `simd-bridge/cpp/build-x64-cuda/CMakeFiles` | 90 | 4 | 32 | 0 | 0/0 | 0 | — |
| ✅ | `simd-bridge/cpp/build-x64-cuda-cublas/CMakeFiles` | 90 | 4 | 32 | 0 | 0/0 | 0 | — |
| ✅ | `simd-bridge/cpp/build-x64-cuda-cuvs/CMakeFiles` | 90 | 4 | 32 | 0 | 0/0 | 0 | — |
| ✅ | `simd-bridge/cpp/build-x64-fallback/CMakeFiles` | 90 | 2 | 16 | 0 | 0/0 | 0 | — |
| ✅ | `simd-bridge/examples` | 90 | 4 | 60 | 0 | 0/0 | 0 | — |
| ✅ | `simd-bridge/rust/graph-engine` | 90 | 4 | 230 | 0 | 0/0 | 0 | — |
| ✅ | `simd-bridge/rust/graph-engine/target` | 90 | 166 | 166 | 0 | 0/0 | 0 | — |
| ✅ | `simd-bridge/rust/hmm-repair` | 90 | 4 | 210 | 0 | 0/0 | 0 | — |
| ✅ | `simd-bridge/rust/hmm-repair/target` | 90 | 146 | 146 | 0 | 0/0 | 0 | — |
| ✅ | `simd-bridge/rust-simdjson/target/debug` | 90 | 42 | 42 | 0 | 0/0 | 0 | — |
| ✅ | `simd-bridge/rust-simdjson/target/release` | 90 | 108 | 108 | 0 | 0/0 | 0 | — |
| ✅ | `simd-bridge/simd-bridge/build-x64-cuda/.cmake` | 90 | 32 | 9724 | 0 | 0/0 | 0 | — |
| ✅ | `simd-bridge/simd-bridge/build-x64-cuda/CMakeFiles` | 90 | 2 | 18 | 0 | 0/0 | 0 | — |
| ✅ | `simd-bridge/simd-bridge/build-x64-cuda/cpp` | 90 | 2 | 16 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/.claude` | 90 | 1 | 45 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/.okf` | 90 | 1 | 20 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/artifacts` | 90 | 4 | 4724 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/artifacts/evaluations/quantization-recall` | 90 | 1 | 3455 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/classifier-models` | 90 | 3 | 71 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/colab-export` | 90 | 1 | 12 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/config` | 90 | 1 | 140 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/data` | 90 | 1 | 17079 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/data/atlas-tensor-proof` | 90 | 3 | 63 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/docs` | 90 | 1 | 10908811 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/docs/atlas` | 90 | 2 | 51874 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/docs/atlas-index` | 90 | 4 | 163 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/docs/contracts` | 90 | 1 | 165 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/docs/graph` | 90 | 21 | 8261102 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/docs/graph/.build` | 90 | 1 | 11 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/docs/obsidian-vault` | 90 | 2 | 108 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/docs/performance` | 90 | 2 | 39566 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/docs/profile-cards/data` | 90 | 20 | 1588 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/docs/reports` | 90 | 127 | 2554096 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/docs/reports/atlas` | 90 | 2 | 432 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/docs/reports/benchmarks` | 90 | 1 | 49 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/docs/reports/graph-probes` | 90 | 1 | 426008 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/docs/reports/parent-atlas` | 90 | 2 | 3563 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/docs/reports/sessions` | 90 | 3 | 1925 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/docs/trace-mcp` | 90 | 1 | 65 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/docs_readme/deeds_labs_archive` | 90 | 84 | 3000692 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/docs_readme/deeds_labs_archive/components` | 90 | 5 | 3195 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/drizzle/introspected/meta` | 90 | 2 | 17338 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/drizzle/meta` | 90 | 36 | 860384 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/drizzle/meta_backup_20260101` | 90 | 10 | 32129 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/master-pipeline-results` | 90 | 1 | 67 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/memory/agent-runs` | 90 | 1 | 73 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/memory/agents-dag` | 90 | 34 | 2433 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/memory/atlas` | 90 | 2 | 2 | 0 | 0/0 | 0 | — |
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
| ✅ | `sveltekit-frontend/memory/graphify/gds` | 90 | 110 | 2580342 | 0 | 0/0 | 0 | — |
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
| ✅ | `sveltekit-frontend/memory/runs/2026-05-07T01-05-54` | 90 | 57 | 1717673 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/memory/runs/2026-05-07T02-21-01` | 90 | 3 | 619 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/memory/runs/2026-05-07T02-21-04` | 90 | 3 | 619 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/memory/runs/2026-05-07T02-24-29` | 90 | 28 | 4790 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/memory/runs/2026-05-07T02-26-55` | 90 | 3 | 2741 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/memory/runs/2026-05-07T02-28-15` | 90 | 3 | 2741 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/memory/runs/2026-05-07T02-28-20` | 90 | 3 | 2741 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/memory/runs/2026-05-07T02-33-56` | 90 | 3 | 2741 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/memory/runs/2026-05-07T02-45-52` | 90 | 3 | 2741 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/memory/runs/2026-05-07T02-47-24` | 90 | 3 | 2741 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/memory/runs/2026-05-07T02-47-34` | 90 | 3 | 2741 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/memory/runs/2026-05-07T02-52-31` | 90 | 3 | 2741 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/memory/runs/2026-05-07T02-53-22` | 90 | 3 | 2741 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/memory/runs/2026-05-07T02-59-42` | 90 | 3 | 2781 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/memory/runs/2026-05-07T03-00-05` | 90 | 3 | 2781 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/memory/runs/2026-05-07T03-00-30` | 90 | 3 | 2781 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/memory/runs/2026-05-07T03-07-59` | 90 | 3 | 2781 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/memory/runs/2026-05-07T03-08-03` | 90 | 3 | 2781 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/memory/runs/2026-05-07T03-08-06` | 90 | 3 | 2781 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/memory/runs/2026-05-07T03-08-18` | 90 | 3 | 2781 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/memory/runs/2026-05-07T03-08-46` | 90 | 3 | 2781 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/memory/runs/2026-05-07T03-14-40` | 90 | 3 | 2781 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/memory/runs/2026-05-07T03-28-02` | 90 | 3 | 2781 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/memory/runs/2026-05-07T03-28-08` | 90 | 3 | 2781 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/memory/runs/2026-05-07T04-00-48` | 90 | 3 | 2781 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/memory/runs/2026-05-07T04-07-10` | 90 | 99 | 3744574 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/memory/runs/2026-05-07T04-08-11` | 90 | 3 | 2860 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/memory/runs/2026-05-07T04-08-31` | 90 | 3 | 2860 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/memory/runs/2026-05-07T04-39-46` | 90 | 51 | 12879 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/memory/runs/2026-05-07T04-40-45` | 90 | 3 | 2943 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/memory/runs/2026-05-07T04-44-14` | 90 | 3 | 2943 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/memory/runs/2026-05-07T04-47-36` | 90 | 3 | 2943 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/memory/runs/2026-05-07T05-05-54` | 90 | 3 | 2937 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/memory/runs/2026-05-07T05-06-12` | 90 | 3 | 2937 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/memory/runs/2026-05-07T05-08-08` | 90 | 3 | 2937 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/memory/runs/2026-05-07T05-33-38` | 90 | 3 | 2937 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/memory/runs/2026-05-07T05-40-07` | 90 | 3 | 2937 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/memory/runs/2026-05-07T05-41-09` | 90 | 3 | 2937 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/memory/runs/2026-05-07T05-41-24` | 90 | 3 | 2937 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/memory/runs/2026-05-07T05-41-29` | 90 | 3 | 2937 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/memory/runs/2026-05-07T06-47-46` | 90 | 3 | 2937 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/memory/runs/2026-05-07T06-48-10` | 90 | 3 | 2937 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/memory/runs/2026-05-07T06-56-03` | 90 | 3 | 2937 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/memory/runs/2026-05-07T09-04-38` | 90 | 3 | 2937 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/memory/runs/2026-05-07T09-05-35` | 90 | 3 | 2937 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/memory/runs/2026-05-07T09-07-52` | 90 | 3 | 2937 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/memory/runs/2026-05-07T09-08-12` | 90 | 3 | 2937 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/memory/runs/2026-05-07T09-12-17` | 90 | 3 | 2937 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/memory/runs/2026-05-07T09-12-49` | 90 | 3 | 2937 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/memory/runs/2026-05-07T09-41-43` | 90 | 3 | 2937 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/memory/runs/2026-05-07T09-42-15` | 90 | 3 | 2937 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/memory/runs/2026-05-07T14-55-56` | 90 | 7 | 4143 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/memory/runs/2026-05-07T15-55-50` | 90 | 3 | 2937 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/memory/runs/2026-05-07T15-56-22` | 90 | 6 | 3639 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/memory/runs/2026-05-07T16-01-36` | 90 | 6 | 3639 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/memory/runs/2026-05-07T16-02-09` | 90 | 3 | 2937 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/memory/runs/2026-05-07T16-06-18` | 90 | 3 | 2937 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/memory/runs/2026-05-07T16-07-29` | 90 | 3 | 2937 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/memory/runs/2026-05-07T16-08-31` | 90 | 3 | 2937 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/memory/runs/2026-05-07T16-09-00` | 90 | 3 | 2937 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/memory/runs/2026-05-07T16-11-51` | 90 | 4 | 3160 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/memory/runs/2026-05-07T16-13-19` | 90 | 3 | 2937 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/memory/runs/2026-05-07T16-17-06` | 90 | 3 | 2937 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/memory/runs/2026-05-07T16-17-56` | 90 | 3 | 2937 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/memory/runs/2026-05-07T16-18-50` | 90 | 3 | 2937 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/memory/runs/2026-05-07T16-19-09` | 90 | 3 | 2937 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/memory/runs/2026-05-07T16-21-48` | 90 | 3 | 2937 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/memory/runs/2026-05-07T16-22-48` | 90 | 7 | 3666 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/memory/runs/2026-05-07T16-45-33` | 90 | 3 | 2937 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/memory/runs/2026-05-07T16-45-39` | 90 | 3 | 2937 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/memory/runs/2026-05-07T16-46-33` | 90 | 8 | 35750 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/memory/runs/2026-05-07T17-03-59` | 90 | 7 | 35694 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/memory/runs/2026-05-07T17-11-51` | 90 | 9 | 35784 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/memory/runs/2026-05-07T18-56-43` | 90 | 13 | 99985 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/memory/runs/2026-05-07T19-11-14` | 90 | 9 | 3174 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/memory/runs/2026-05-07T20-53-22` | 90 | 9 | 3226 | 0 | 0/0 | 0 | — |
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
| ✅ | `sveltekit-frontend/memory/runs/2026-05-13T06-03-16` | 90 | 9 | 8959 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/memory/runs/2026-05-13T06-06-14` | 90 | 1 | 95 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/memory/runs/2026-05-13T06-06-59` | 90 | 115 | 5887642 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/memory/runs/2026-05-15T21-39-17` | 90 | 68 | 47090 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/memory/runs/2026-05-17T00-26-41` | 90 | 41 | 980942 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/memory/runs/2026-05-17T01-26-59` | 90 | 3 | 2938 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/memory/runs/2026-05-17T01-27-03` | 90 | 3 | 2938 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/memory/runs/2026-05-17T05-29-33` | 90 | 3 | 2938 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/memory/runs/2026-05-17T05-30-37` | 90 | 3 | 2938 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/memory/runs/2026-05-17T05-33-51` | 90 | 3 | 2938 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/memory/runs/2026-05-17T05-34-44` | 90 | 3 | 2938 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/memory/runs/2026-05-17T05-39-25` | 90 | 3 | 2938 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/memory/runs/2026-05-17T05-41-01` | 90 | 3 | 2938 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/memory/runs/2026-05-17T05-41-54` | 90 | 3 | 2938 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/memory/runs/2026-05-17T05-42-53` | 90 | 3 | 2938 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/memory/runs/2026-05-17T05-46-02` | 90 | 3 | 2938 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/memory/runs/2026-05-17T05-46-57` | 90 | 3 | 2938 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/memory/runs/2026-05-17T05-54-07` | 90 | 3 | 2938 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/memory/runs/2026-05-17T05-54-58` | 90 | 3 | 2938 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/memory/runs/2026-05-17T09-23-56` | 90 | 3 | 2938 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/memory/runs/2026-05-17T09-25-25` | 90 | 3 | 2938 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/memory/runs/2026-05-17T09-30-23` | 90 | 3 | 2938 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/memory/runs/2026-05-17T09-31-18` | 90 | 6 | 3054 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/memory/runs/2026-05-17T09-44-19` | 90 | 3 | 2938 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/memory/runs/2026-05-17T09-45-13` | 90 | 3 | 2938 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/memory/runs/2026-05-17T09-57-05` | 90 | 3 | 2938 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/memory/runs/2026-05-17T09-57-57` | 90 | 3 | 2938 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/memory/runs/2026-05-17T15-22-43` | 90 | 3 | 2938 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/memory/runs/2026-05-17T15-24-39` | 90 | 3 | 2938 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/memory/runs/2026-05-17T15-27-34` | 90 | 3 | 2938 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/memory/runs/2026-05-17T15-28-36` | 90 | 6 | 3054 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/memory/runs/2026-05-17T15-40-55` | 90 | 3 | 2938 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/memory/runs/2026-05-17T15-43-52` | 90 | 3 | 2938 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/memory/runs/2026-05-17T15-44-23` | 90 | 3 | 2938 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/memory/runs/2026-05-17T15-45-53` | 90 | 3 | 2938 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/memory/runs/2026-05-17T16-05-51` | 90 | 35 | 1010874 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/memory/runs/2026-05-17T16-53-53` | 90 | 3 | 2938 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/memory/runs/2026-05-17T16-54-38` | 90 | 3 | 2938 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/memory/runs/2026-05-17T16-58-52` | 90 | 3 | 2938 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/memory/runs/2026-05-17T16-59-44` | 90 | 3 | 2938 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/memory/runs/2026-05-17T17-04-24` | 90 | 3 | 2938 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/memory/runs/2026-05-17T17-05-17` | 90 | 3 | 2938 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/memory/runs/2026-05-17T17-09-56` | 90 | 3 | 2938 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/memory/runs/2026-05-17T17-10-45` | 90 | 3 | 2938 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/memory/runs/2026-05-17T17-14-59` | 90 | 3 | 2938 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/memory/runs/2026-05-17T17-15-45` | 90 | 3 | 2938 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/memory/runs/2026-05-17T17-24-02` | 90 | 3 | 2938 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/memory/runs/2026-05-17T17-24-49` | 90 | 3 | 2938 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/memory/runs/2026-05-17T20-14-54` | 90 | 3 | 2938 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/memory/runs/2026-05-17T20-15-49` | 90 | 3 | 2938 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/memory/runs/2026-05-17T20-19-55` | 90 | 3 | 2938 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/memory/runs/2026-05-17T20-24-07` | 90 | 3 | 2938 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/memory/runs/2026-05-17T20-30-24` | 90 | 3 | 2938 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/memory/runs/2026-05-17T20-33-50` | 90 | 3 | 2938 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/memory/runs/2026-05-17T22-05-28` | 90 | 3 | 2938 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/memory/runs/2026-05-17T22-06-54` | 90 | 3 | 2938 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/memory/runs/2026-05-17T22-16-53` | 90 | 3 | 2938 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/memory/runs/2026-05-17T22-17-52` | 90 | 6 | 3059 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/memory/runs/2026-05-18T18-04-46` | 90 | 14 | 4910 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/memory/runs/2026-05-19T19-10-37` | 90 | 15 | 5561 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/memory/runs/2026-05-20` | 90 | 1 | 19 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/memory/runs/2026-05-20T02-36-07` | 90 | 3 | 2938 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/memory/runs/2026-05-20T02-37-24` | 90 | 6 | 3059 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/memory/runs/2026-05-20T20-59-02` | 90 | 3 | 2938 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/memory/runs/2026-05-20T21-00-02` | 90 | 6 | 3059 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/memory/runs/2026-05-20T21-17-02` | 90 | 1 | 737 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/memory/runs/2026-05-20T21-28-24` | 90 | 13 | 5184 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/memory/runs/2026-05-21T22-17-08` | 90 | 3 | 2938 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/memory/runs/2026-05-21T22-18-05` | 90 | 6 | 3059 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/memory/runs/2026-05-22T01-44-37` | 90 | 44 | 888292 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/memory/runs/2026-05-22T13-23-31` | 90 | 3 | 2938 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/memory/runs/2026-05-22T13-24-30` | 90 | 3 | 2938 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/memory/runs/2026-05-23T02-44-53` | 90 | 10 | 3805 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/memory/runs/2026-05-24T16-28-25` | 90 | 41 | 10837 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/memory/runs/2026-05-24T23-07-15` | 90 | 3 | 2938 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/memory/runs/2026-05-24T23-09-00` | 90 | 6 | 3205 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/memory/runs/2026-05-26T17-32-25` | 90 | 13 | 3439 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/memory/runs/2026-05-26T17-32-26` | 90 | 6 | 3255 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/memory/runs/2026-05-27T19-37-18` | 90 | 9 | 3538 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/memory/runs/2026-05-29T02-00-27` | 90 | 3 | 2938 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/memory/runs/2026-05-29T02-01-53` | 90 | 3 | 2938 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/memory/runs/2026-05-29T02-16-15` | 90 | 3 | 2938 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/memory/runs/2026-05-29T02-17-36` | 90 | 3 | 2938 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/memory/runs/2026-05-29T04-09-19` | 90 | 3 | 2938 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/memory/runs/2026-05-29T04-11-06` | 90 | 3 | 2938 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/memory/runs/2026-05-29T04-14-58` | 90 | 3 | 2938 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/memory/runs/2026-05-29T04-15-48` | 90 | 3 | 2938 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/memory/runs/2026-05-29T05-38-52` | 90 | 3 | 2938 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/memory/runs/2026-05-29T05-40-05` | 90 | 3 | 2938 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/memory/runs/2026-05-29T05-46-36` | 90 | 3 | 2938 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/memory/runs/2026-05-29T05-47-57` | 90 | 3 | 2938 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/memory/runs/2026-05-29T05-59-03` | 90 | 3 | 2938 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/memory/runs/2026-05-29T06-00-23` | 90 | 3 | 2938 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/memory/runs/2026-05-29T06-05-46` | 90 | 3 | 2938 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/memory/runs/2026-05-29T06-07-17` | 90 | 3 | 2938 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/memory/runs/2026-05-29T06-15-45` | 90 | 3 | 2938 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/memory/runs/2026-05-29T06-17-33` | 90 | 3 | 2938 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/memory/runs/2026-05-29T15-30-49` | 90 | 10 | 4630 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/memory/runs/2026-05-30T08-33-59` | 90 | 13 | 317918 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/memory/runs/2026-05-30T08-35-01` | 90 | 3 | 2938 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/memory/runs/2026-05-30T17-12-06` | 90 | 3 | 2938 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/memory/runs/2026-05-30T17-12-13` | 90 | 3 | 2938 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/memory/runs/2026-05-30T17-18-43` | 90 | 3 | 2938 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/memory/runs/2026-05-30T17-19-54` | 90 | 6 | 3025 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/memory/runs/2026-05-30T20-02-16` | 90 | 12 | 4996 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/memory/runs/2026-05-31T20-36-25` | 90 | 9 | 4549 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/memory/runs/2026-06-01T22-22-15` | 90 | 16 | 37069 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/memory/runs/2026-06-03T15-49-43` | 90 | 3 | 2942 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/memory/runs/2026-06-03T15-49-51` | 90 | 3 | 2942 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/memory/runs/2026-06-06` | 90 | 1 | 19 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/memory/runs/2026-06-06T01-36-20` | 90 | 1 | 755 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/memory/runs/2026-06-06T01-50-52` | 90 | 1 | 755 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/memory/runs/2026-06-06T02-04-19` | 90 | 1 | 755 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/memory/runs/2026-06-11T03-27-26` | 90 | 4 | 1640 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/memory/runs/2026-06-11T03-27-27` | 90 | 4 | 34440 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/memory/runs/2026-07-25` | 90 | 1 | 19 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/memory/runs/2026-07-27T01-57-07` | 90 | 5 | 205628 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/memory/synthesis` | 90 | 1 | 10 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/mini_active_nvme_cache` | 90 | 1 | 1 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/openspec` | 90 | 1 | 68 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/openspec/changes/phase-2f1-real-evaluation-corpus` | 90 | 1 | 18 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/packages/atlas-duckdb` | 90 | 1 | 642 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/packages/atlas-duckdb/src` | 90 | 7 | 624 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/packages/semantic-contracts` | 90 | 2 | 1129 | 0 | 0/6 | 0 | — |
| ✅ | `sveltekit-frontend/packages/semantic-contracts/schemas` | 90 | 3 | 422 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/packages/semantic-contracts/src` | 90 | 7 | 661 | 0 | 0/6 | 0 | — |
| ✅ | `sveltekit-frontend/phase110_ground_truth` | 90 | 3 | 24662 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/phase110_proof_reports` | 90 | 5 | 250 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/phase110_qdrant_baseline` | 90 | 1 | 20 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/phase110_snapshot` | 90 | 1 | 14 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/phase3-pipeline-results` | 90 | 1 | 64 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/phase6-synthesis-results` | 90 | 2 | 44 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/phase7-ace-results` | 90 | 2 | 65 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/reports` | 90 | 7 | 316293 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/reports/batch-a` | 90 | 1 | 41 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/reports/batch-b` | 90 | 1 | 42 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/reports/batch-c` | 90 | 1 | 55 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/reports/deep-audit` | 90 | 4 | 315633 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/reports/deep-audit/encoded` | 90 | 30 | 151033 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/reports/phase5-ab-test` | 90 | 1 | 71 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/reports/semantic-contracts` | 90 | 2 | 215 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/schemas/atlas/embedding-contract` | 90 | 1 | 61 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/schemas/atlas/feature-envelope` | 90 | 1 | 76 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/schemas/atlas/qdrant-projection` | 90 | 1 | 33 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/schemas/atlas/source-ref` | 90 | 1 | 99 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/scratch/synthesis-runs/2026-05-09T18-23-55` | 90 | 51 | 286 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/scratch/synthesis-runs/2026-05-09T18-49-48` | 90 | 1 | 16 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/scratch/synthesis-runs/2026-05-09T18-52-33` | 90 | 3 | 26 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/scratch/synthesis-runs/2026-05-09T22-39-57` | 90 | 2 | 21 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/scratch/synthesis-runs/2026-05-09T23-15-14` | 90 | 12 | 71 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/scratch/synthesis-runs/2026-05-09T23-28-37` | 90 | 1 | 14 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/scratch/synthesis-runs/2026-05-09T23-31-59` | 90 | 1 | 14 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/scratch/synthesis-runs/2026-05-09T23-32-06` | 90 | 1 | 14 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/scratch/synthesis-runs/2026-05-09T23-33-12` | 90 | 1 | 65 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/scratch/synthesis-runs/2026-05-09T23-35-06` | 90 | 2 | 81 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/scratch/synthesis-runs/2026-05-09T23-37-55` | 90 | 1 | 65 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/scratch/synthesis-runs/2026-05-09T23-43-00` | 90 | 2 | 89 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/scratch/synthesis-runs/2026-05-09T23-48-27` | 90 | 2 | 38 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/scratch/synthesis-runs/2026-05-09T23-58-13` | 90 | 2 | 110 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/scratch/synthesis-runs/2026-05-09T23-58-21` | 90 | 2 | 110 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/scratch/synthesis-runs/2026-05-10T00-10-13` | 90 | 3 | 126 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/scratch/synthesis-runs/2026-05-10T00-15-53` | 90 | 3 | 139 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/scratch/synthesis-runs/2026-05-10T00-31-09` | 90 | 3 | 124 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/scratch/synthesis-runs/2026-05-10T00-36-44` | 90 | 4 | 123 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/scratch/synthesis-runs/2026-05-10T00-37-41` | 90 | 2 | 113 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/scratch/synthesis-runs/2026-05-10T00-37-58` | 90 | 2 | 119 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/scratch/synthesis-runs/2026-05-10T00-39-05` | 90 | 3 | 124 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/scratch/synthesis-runs/2026-05-10T00-39-33` | 90 | 3 | 135 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/scratch/synthesis-runs/2026-05-10T00-41-49` | 90 | 3 | 135 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/scratch/synthesis-runs/2026-05-10T00-55-47` | 90 | 3 | 115 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/scratch/synthesis-runs/2026-05-10T01-10-06` | 90 | 3 | 363 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/scratch/synthesis-runs/2026-05-10T01-10-42` | 90 | 3 | 382 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/scratch/synthesis-runs/2026-05-10T01-37-08` | 90 | 3 | 234 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/scratch/synthesis-runs/2026-05-10T01-37-35` | 90 | 3 | 251 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/scratch/synthesis-runs/2026-05-10T01-41-33` | 90 | 3 | 223 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/scratch/synthesis-runs/2026-05-10T01-41-52` | 90 | 3 | 249 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/scratch/synthesis-runs/2026-05-10T01-42-12` | 90 | 3 | 250 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/scratch/synthesis-runs/2026-05-10T01-45-56` | 90 | 3 | 239 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/scratch/synthesis-runs/2026-05-10T01-46-47` | 90 | 3 | 264 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/scratch/synthesis-runs/2026-05-10T01-47-55` | 90 | 3 | 265 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/scratch/synthesis-runs/2026-05-10T02-42-37` | 90 | 3 | 185 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/scratch/synthesis-runs/2026-05-10T03-11-12` | 90 | 4 | 207 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/scratch/synthesis-runs/2026-05-10T03-13-21` | 90 | 2 | 149 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/scratch/synthesis-runs/2026-05-12T07-53-27` | 90 | 4 | 110 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/scratch/synthesis-runs/2026-05-12T07-56-43` | 90 | 4 | 298 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/scripts/activity` | 90 | 1 | 123 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/scripts/atlas/control-snapshot-1k` | 90 | 3 | 963 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/scripts/atlas/fixtures` | 90 | 1 | 459 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/scripts/atlas/identity-resolution-results` | 90 | 1 | 42 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/scripts/atlas/sparse` | 90 | 21 | 1166 | 0 | 0/1 | 0 | — |
| ✅ | `sveltekit-frontend/scripts/atlas/workers` | 90 | 1 | 146 | 0 | 0/1 | 0 | — |
| ✅ | `sveltekit-frontend/scripts/authority` | 90 | 1 | 277 | 0 | 0/1 | 0 | — |
| ✅ | `sveltekit-frontend/scripts/backup-consolidation` | 90 | 17 | 4382 | 0 | 0/10 | 0 | — |
| ✅ | `sveltekit-frontend/scripts/backup-consolidation/tests` | 90 | 4 | 999 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/scripts/bifrost` | 90 | 2 | 587 | 0 | 0/2 | 0 | — |
| ✅ | `sveltekit-frontend/scripts/cache` | 90 | 6 | 791 | 0 | 0/4 | 0 | — |
| ✅ | `sveltekit-frontend/scripts/cards` | 90 | 7 | 1407 | 0 | 0/4 | 0 | — |
| ✅ | `sveltekit-frontend/scripts/ci` | 90 | 1 | 62 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/scripts/comfyui` | 90 | 2 | 282 | 0 | 0/1 | 0 | — |
| ✅ | `sveltekit-frontend/scripts/comfyui/workflows` | 90 | 2 | 84 | 0 | 0/0 | 0 | — |
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
| ✅ | `sveltekit-frontend/scripts/llms` | 90 | 5 | 1472 | 0 | 0/3 | 0 | — |
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
| ✅ | `sveltekit-frontend/scripts/skills` | 90 | 2 | 750 | 0 | 0/1 | 0 | — |
| ✅ | `sveltekit-frontend/scripts/synth` | 90 | 3 | 929 | 0 | 0/2 | 0 | — |
| ✅ | `sveltekit-frontend/scripts/tests/nes-arch` | 90 | 2 | 191 | 0 | 0/1 | 0 | — |
| ✅ | `sveltekit-frontend/scripts/tests/probes` | 90 | 3 | 88 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/scripts/tools` | 90 | 3 | 275 | 0 | 0/1 | 0 | — |
| ✅ | `sveltekit-frontend/scripts/turboquant` | 90 | 5 | 1481 | 0 | 0/4 | 0 | — |
| ✅ | `sveltekit-frontend/scripts/wiki` | 90 | 11 | 2999 | 0 | 0/6 | 0 | — |
| ✅ | `sveltekit-frontend/scripts/workers` | 90 | 1 | 297 | 0 | 0/1 | 0 | — |
| ✅ | `sveltekit-frontend/scripts/__fixtures__` | 90 | 1 | 28 | 0 | 0/1 | 0 | — |
| ✅ | `sveltekit-frontend/src/lib/agent` | 90 | 15 | 1549 | 0 | 0/2 | 0 | — |
| ✅ | `sveltekit-frontend/src/lib/ai` | 90 | 20 | 5513 | 0 | 0/1 | 0 | — |
| ✅ | `sveltekit-frontend/src/lib/cache` | 90 | 5 | 1046 | 0 | 0/1 | 0 | — |
| ✅ | `sveltekit-frontend/src/lib/canvas` | 90 | 1 | 15 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/src/lib/client` | 90 | 14 | 1755 | 0 | 0/5 | 0 | — |
| ✅ | `sveltekit-frontend/src/lib/collaboration` | 90 | 1 | 267 | 0 | 0/1 | 0 | — |
| ✅ | `sveltekit-frontend/src/lib/config` | 90 | 9 | 1773 | 0 | 1/2 | 0 | — |
| ✅ | `sveltekit-frontend/src/lib/courtroom` | 90 | 4 | 1561 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/src/lib/env` | 90 | 2 | 27 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/src/lib/features` | 90 | 6 | 546 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/src/lib/generated` | 90 | 10 | 24980 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/src/lib/graph` | 90 | 1 | 54 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/src/lib/icons` | 90 | 15 | 572 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/src/lib/machines` | 90 | 11 | 4093 | 0 | 0/1 | 0 | — |
| ✅ | `sveltekit-frontend/src/lib/mcp` | 90 | 4 | 22 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/src/lib/messaging` | 90 | 1 | 168 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/src/lib/runtime-cache` | 90 | 6 | 458 | 0 | 0/4 | 0 | — |
| ✅ | `sveltekit-frontend/src/lib/schemas` | 90 | 17 | 2264 | 0 | 0/9 | 0 | — |
| ✅ | `sveltekit-frontend/src/lib/services` | 90 | 6 | 738 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/src/lib/shared` | 90 | 5 | 284 | 0 | 0/1 | 0 | — |
| ✅ | `sveltekit-frontend/src/lib/state` | 90 | 1 | 8 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/src/lib/stores` | 90 | 27 | 5137 | 0 | 0/6 | 0 | — |
| ✅ | `sveltekit-frontend/src/lib/test-utils` | 90 | 1 | 11 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/src/lib/webgpu` | 90 | 20 | 5786 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/src/mcp/zod-to-json-schema-bridge` | 90 | 2 | 99 | 0 | 0/1 | 0 | — |
| ✅ | `sveltekit-frontend/src/routes` | 90 | 6 | 253226 | 818 | 1226/664 | 9 | 🟠lh ⬜notest |
| ✅ | `sveltekit-frontend/src/routes/(admin)` | 90 | 2 | 485 | 0 | 2/0 | 0 | — |
| ✅ | `sveltekit-frontend/src/routes/(analysis)` | 90 | 13 | 3240 | 0 | 8/0 | 0 | ⬜notest |
| ✅ | `sveltekit-frontend/src/routes/(analysis)@` | 90 | 3 | 2471 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/src/routes/(dev)` | 90 | 13 | 2336 | 0 | 1/1 | 0 | ⬜notest |
| ✅ | `sveltekit-frontend/src/routes/debug` | 90 | 1 | 198 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/src/routes/minio` | 90 | 1 | 8 | 0 | 0/0 | 0 | ⬜notest |
| ✅ | `sveltekit-frontend/src/routes/seaweed` | 90 | 1 | 7 | 0 | 0/0 | 0 | ⬜notest |
| ✅ | `sveltekit-frontend/src/stores` | 90 | 1 | 47 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/src/tests` | 90 | 1 | 10 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/src/wasm` | 90 | 2 | 524 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/src/workers` | 90 | 3 | 282 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/test` | 90 | 1 | 63 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/test-results` | 90 | 2 | 366 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/tests/accessibility` | 90 | 2 | 557 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/tests/agent` | 90 | 1 | 154 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/tests/atlas/graph` | 90 | 1 | 87 | 0 | 0/1 | 0 | — |
| ✅ | `sveltekit-frontend/tests/atlas/identity` | 90 | 14 | 1938 | 0 | 0/7 | 0 | — |
| ✅ | `sveltekit-frontend/tests/atlas/tensor-residency` | 90 | 1 | 15 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/tests/e2e` | 90 | 31 | 9421 | 0 | 10/3 | 0 | — |
| ✅ | `sveltekit-frontend/tests/e2e/route-forensic` | 90 | 35 | 1750 | 0 | 4/0 | 0 | — |
| ✅ | `sveltekit-frontend/tests/e2e/utils` | 90 | 3 | 505 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/tests/fixtures` | 90 | 2 | 90 | 0 | 1/0 | 0 | — |
| ✅ | `sveltekit-frontend/tests/gpu` | 90 | 5 | 1316 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/tests/hyperrag` | 90 | 1 | 166 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/tests/intent` | 90 | 3 | 498 | 0 | 0/1 | 0 | — |
| ✅ | `sveltekit-frontend/tests/lane-contracts` | 90 | 1 | 80 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/tests/mapreduce` | 90 | 1 | 217 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/tests/okf` | 90 | 1 | 300 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/tests/opencode` | 90 | 1 | 294 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/tests/reports` | 90 | 2 | 64 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/tests/retrieval` | 90 | 7 | 1353 | 0 | 0/1 | 0 | — |
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
| ✅ | `test/services` | 90 | 2 | 356 | 0 | 0/2 | 0 | — |
| ✅ | `tests/atlas` | 90 | 18 | 1864 | 0 | 0/4 | 0 | — |
| ✅ | `tests/fixtures` | 90 | 2 | 118 | 0 | 0/0 | 0 | — |
| ✅ | `tests/hmm` | 90 | 2 | 128 | 0 | 0/2 | 0 | — |
| ✅ | `tests/integration` | 90 | 2 | 324 | 0 | 0/0 | 0 | — |
| ✅ | `tests/opencode` | 90 | 2 | 678 | 0 | 0/2 | 0 | — |
| ✅ | `tests/retrieval` | 90 | 8 | 2212 | 0 | 0/0 | 0 | — |
| ✅ | `tmp/ace-context-snapshots` | 90 | 3 | 54 | 0 | 0/0 | 0 | — |
| ✅ | `tmp/atlas/discovery` | 90 | 1 | 13 | 0 | 0/0 | 0 | — |
| ✅ | `tools/agentic-research/node` | 90 | 4 | 346 | 0 | 0/0 | 0 | — |
| ✅ | `tools/agentic-research/scaffolds` | 90 | 2 | 34 | 0 | 0/0 | 0 | — |
| ✅ | `tools/parent-atlas-qdrant-postgres-toolkit/scripts/qdrant` | 90 | 2 | 244 | 0 | 0/2 | 0 | — |
| ✅ | `triton-trt-llm/reports` | 90 | 1 | 66 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/src` | 92 | 17 | 949933 | 824 | 1252/1334 | 90 | 🔴ssr 🟠lh ⬜notest |
| ✅ | `packages/parent-atlas-runtime/src/adapters` | 93 | 4 | 766 | 0 | 0/0 | 2 | — |
| ✅ | `claude-mem/plugin` | 95 | 2 | 24717 | 0 | 2/10 | 0 | 🟠lh |
| ✅ | `claude-mem/plugin/scripts` | 95 | 9 | 23096 | 0 | 2/8 | 0 | 🟠lh |
| ✅ | `packages/atlas-core/src/retrieval` | 95 | 3 | 2068 | 0 | 0/1 | 0 | 🟠lh |
| ✅ | `scripts/docs-atlas` | 95 | 24 | 3762 | 0 | 0/10 | 0 | 🟠lh |
| ✅ | `scripts/graphify-audit` | 95 | 8 | 2790 | 0 | 0/6 | 0 | 🟠lh |
| ✅ | `scripts/ingest` | 95 | 48 | 6830 | 0 | 0/34 | 0 | 🟠lh |
| ✅ | `scripts/memory` | 95 | 10 | 574892 | 0 | 0/4 | 0 | 🟠lh |
| ✅ | `scripts/opencode` | 95 | 150 | 21916 | 0 | 0/126 | 0 | 🟠lh |
| ✅ | `scripts/qdrant` | 95 | 6 | 604 | 0 | 0/2 | 0 | 🟠lh |
| ✅ | `scripts/smoke` | 95 | 30 | 4812 | 0 | 0/12 | 0 | 🟠lh |
| ✅ | `sveltekit-frontend/.docker-build` | 95 | 2 | 44618 | 0 | 2/58 | 0 | 🟠lh |
| ✅ | `sveltekit-frontend/.docker-build/scripts` | 95 | 1 | 13342 | 0 | 2/58 | 0 | 🟠lh |
| ✅ | `sveltekit-frontend/.docker-build/scripts/atlas` | 95 | 81 | 13162 | 0 | 2/58 | 0 | 🟠lh |
| ✅ | `sveltekit-frontend/scratch` | 95 | 54 | 7233 | 0 | 0/7 | 0 | 🟠lh |
| ✅ | `sveltekit-frontend/scripts/graph` | 95 | 12 | 2899 | 0 | 1/8 | 0 | 🟠lh |
| ✅ | `sveltekit-frontend/scripts/index` | 95 | 10 | 806 | 0 | 0/7 | 0 | 🟠lh |
| ✅ | `sveltekit-frontend/scripts/mcp` | 95 | 16 | 5716 | 0 | 0/10 | 0 | 🟠lh |
| ✅ | `sveltekit-frontend/scripts/semantic-valkey` | 95 | 2 | 467 | 0 | 1/0 | 0 | 🟠lh |
| ✅ | `sveltekit-frontend/scripts/smoke` | 95 | 32 | 4360 | 0 | 0/11 | 0 | 🟠lh |
| ✅ | `sveltekit-frontend/scripts/startup` | 95 | 15 | 3571 | 0 | 0/4 | 0 | 🟠lh |
| ✅ | `sveltekit-frontend/scripts/tests` | 95 | 77 | 15883 | 0 | 4/26 | 0 | 🟠lh |
| ✅ | `sveltekit-frontend/sveltekit-frontend/scripts` | 95 | 1 | 431 | 0 | 0/1 | 0 | 🟠lh |
| ✅ | `.claude/hooks` | 100 | 2 | 164 | 0 | 0/2 | 0 | — |
| ✅ | `drizzle/migrations` | 100 | 2 | 76 | 0 | 0/0 | 0 | — |
| ✅ | `drizzle/schema` | 100 | 2 | 50 | 0 | 0/0 | 0 | — |
| ✅ | `gsd_archives/phase-2f1-baseline` | 100 | 1 | 13699 | 0 | 0/8 | 0 | — |
| ✅ | `gsd_archives/phase-2f1-baseline/schema-backup` | 100 | 222 | 13427 | 0 | 0/8 | 0 | — |
| ✅ | `packages/atlas-core` | 100 | 3 | 14144 | 1 | 0/20 | 2 | 🟠lh |
| ✅ | `packages/atlas-core/src` | 100 | 6 | 13864 | 1 | 0/20 | 2 | 🟠lh |
| ✅ | `packages/atlas-core/src/classification` | 100 | 9 | 2676 | 0 | 0/2 | 0 | — |
| ✅ | `packages/atlas-core/src/queue` | 100 | 2 | 300 | 0 | 0/1 | 0 | — |
| ✅ | `packages/atlas-core/src/validation` | 100 | 8 | 2681 | 0 | 0/2 | 0 | — |
| ✅ | `packages/parent-atlas-retrieval/src/gpu` | 100 | 29 | 9013 | 0 | 0/4 | 0 | — |
| ✅ | `scripts/atlas` | 100 | 2405 | 662256 | 7 | 0/987 | 12 | 🟠lh |
| ✅ | `scripts/atlas/lib` | 100 | 107 | 14378 | 3 | 0/30 | 0 | 🟠lh |
| ✅ | `scripts/atlas/schema` | 100 | 12 | 2730 | 0 | 0/8 | 0 | — |
| ✅ | `scripts/db-tests` | 100 | 12 | 560 | 0 | 0/0 | 0 | — |
| ✅ | `scripts/graphify` | 100 | 8 | 2006 | 0 | 0/4 | 0 | — |
| ✅ | `scripts/packets` | 100 | 42 | 8664 | 0 | 0/26 | 0 | — |
| ✅ | `scripts/postgres` | 100 | 2 | 694 | 0 | 0/0 | 0 | — |
| ✅ | `scripts/promotion` | 100 | 14 | 3746 | 0 | 0/10 | 0 | — |
| ✅ | `scripts/tests` | 100 | 166 | 90394 | 2 | 4/26 | 0 | 🟠lh |
| ✅ | `sveltekit-frontend/drizzle/schema` | 100 | 1 | 311 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/scripts` | 100 | 393 | 360323 | 16 | 33/564 | 48 | 🟠lh |
| ✅ | `sveltekit-frontend/scripts/agents` | 100 | 5 | 1365 | 0 | 1/2 | 0 | — |
| ✅ | `sveltekit-frontend/scripts/agents/skills` | 100 | 5 | 546 | 0 | 1/1 | 0 | — |
| ✅ | `sveltekit-frontend/scripts/atlas` | 100 | 354 | 151331 | 1 | 4/142 | 3 | 🟠lh |
| ✅ | `sveltekit-frontend/scripts/atlas/lib` | 100 | 10 | 1795 | 0 | 0/4 | 0 | — |
| ✅ | `sveltekit-frontend/scripts/atlas/mapreduce` | 100 | 1 | 121 | 0 | 0/1 | 0 | — |
| ✅ | `sveltekit-frontend/scripts/audit` | 100 | 1 | 522 | 0 | 0/1 | 0 | — |
| ✅ | `sveltekit-frontend/scripts/docs` | 100 | 1 | 530 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/scripts/kb` | 100 | 16 | 3802 | 0 | 1/10 | 0 | — |
| ✅ | `sveltekit-frontend/scripts/knowledge` | 100 | 20 | 3142 | 0 | 0/19 | 0 | — |
| ✅ | `sveltekit-frontend/scripts/mapreduce` | 100 | 2 | 549 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/scripts/phase104-backups/src` | 100 | 399 | 43970 | 13 | 10/96 | 36 | 🟠lh |
| ✅ | `sveltekit-frontend/scripts/screenshots` | 100 | 3 | 695 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/scripts/validate` | 100 | 2 | 1539 | 0 | 1/1 | 0 | — |
| ✅ | `sveltekit-frontend/src/lib` | 100 | 11 | 664002 | 6 | 22/636 | 80 | 🟠lh |
| ✅ | `sveltekit-frontend/src/lib/data` | 100 | 5 | 1687 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/src/lib/db` | 100 | 12 | 2542 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/src/lib/intent` | 100 | 1 | 239 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/src/lib/phase72` | 100 | 1 | 394 | 0 | 0/1 | 0 | — |
| ✅ | `sveltekit-frontend/src/lib/server` | 100 | 1832 | 394924 | 6 | 19/531 | 70 | 🟠lh |
| ✅ | `sveltekit-frontend/src/lib/shims` | 100 | 11 | 1248 | 0 | 0/1 | 0 | — |
| ✅ | `sveltekit-frontend/src/lib/types` | 100 | 56 | 7347 | 0 | 0/5 | 0 | — |
| ✅ | `sveltekit-frontend/src/routes/(app)` | 100 | 442 | 113844 | 4 | 442/46 | 0 | 🟠lh ⬜notest |
| ✅ | `sveltekit-frontend/src/routes/admin` | 100 | 4 | 2707 | 0 | 2/2 | 0 | ⬜notest |
| ✅ | `sveltekit-frontend/src/routes/atlas` | 100 | 2 | 437 | 0 | 0/1 | 0 | ⬜notest |
| ✅ | `sveltekit-frontend/src/routes/dashboard` | 100 | 2 | 351 | 0 | 0/0 | 0 | ⬜notest |
| ✅ | `sveltekit-frontend/src/routes/login` | 100 | 3 | 506 | 0 | 1/3 | 0 | — |
| ✅ | `sveltekit-frontend/src/routes/register` | 100 | 3 | 627 | 0 | 1/2 | 0 | — |
| ✅ | `sveltekit-frontend/src/types` | 100 | 26 | 944 | 0 | 0/1 | 0 | — |
| ✅ | `sveltekit-frontend/tests` | 100 | 280 | 165008 | 5 | 755/86 | 1 | 🟠lh |
| ✅ | `sveltekit-frontend/tests/atlas` | 100 | 20 | 5290 | 0 | 0/12 | 0 | — |
| ✅ | `sveltekit-frontend/tests/routes` | 100 | 33 | 62919 | 2 | 722/13 | 0 | — |
| ✅ | `sveltekit-frontend/tests/routes/auto` | 100 | 727 | 52310 | 0 | 714/3 | 0 | — |
| ✅ | `sveltekit-frontend/tests/unit` | 100 | 15 | 2401 | 0 | 0/3 | 0 | — |
| ✅ | `tests/classifier` | 100 | 8 | 1854 | 0 | 0/0 | 0 | — |
| ✅ | `tools/agentic-research/src/firecrawl` | 100 | 1312 | 358194 | 2 | 0/332 | 82 | 🟠lh |
| ✅ | `tools/parent-atlas-qdrant-postgres-toolkit/scripts/postgres` | 100 | 2 | 94 | 0 | 0/0 | 0 | — |

---

## API Routes (818 total · top 60)

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
| `sveltekit-frontend/api/graph/hypergraph/+server.ts` | GET, POST, DELETE | ✅ | ❌ | ✅ |
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
| `sveltekit-frontend/api/ace/policy-orchestrator/+server.ts` | POST, GET | ✅ | ❌ | ✅ |
| `sveltekit-frontend/api/ace/stream/+server.ts` | POST, GET | ✅ | ✅ | ✅ |
| `sveltekit-frontend/api/admin/atlas/cache/+server.ts` | GET, DELETE | ✅ | ✅ | ✅ |
| `sveltekit-frontend/api/admin/atlas/registry/search/+server.ts` | GET, POST | ❌ | ✅ | ✅ |
| `sveltekit-frontend/api/admin/grpo/flush/+server.ts` | GET, POST | ✅ | ✅ | ❌ |
| `sveltekit-frontend/api/admin/model/validate-checkpoint/+server.ts` | POST, GET | ✅ | ✅ | ✅ |
| `sveltekit-frontend/api/admin/observability/+server.ts` | GET, POST | ✅ | ✅ | ✅ |
| `sveltekit-frontend/api/admin/packets/enrich-labels/+server.ts` | GET, POST | ✅ | ❌ | ✅ |
| `sveltekit-frontend/api/admin/qlora/+server.ts` | GET, POST | ✅ | ✅ | ✅ |
| `sveltekit-frontend/api/admin/retrieval/search/+server.ts` | GET, POST | ❌ | ✅ | ✅ |
| `sveltekit-frontend/api/admin/retrieval/stream/+server.ts` | GET, POST | ✅ | ✅ | ✅ |
| `sveltekit-frontend/api/admin/seed-knowledge/+server.ts` | POST, GET | ✅ | ✅ | ✅ |
| `sveltekit-frontend/api/admin/summaries/scan-quality/+server.ts` | GET, POST | ✅ | ✅ | ✅ |
| `sveltekit-frontend/api/admin/weights/+server.ts` | GET, POST | ✅ | ✅ | ✅ |
| `sveltekit-frontend/api/agent/execute/+server.ts` | POST, GET | ✅ | ✅ | ✅ |

_…and 758 more. See `codebase-graph.json` for full list._

---

## G4 — API Routes Missing Auth Guard (38)
- `sveltekit-frontend/src/routes/api/acp/rpc/+server.ts` · POST
- `sveltekit-frontend/src/routes/api/acp/service-ports/+server.ts` · GET
- `sveltekit-frontend/src/routes/api/admin/atlas/registry/search/+server.ts` · GET/POST
- `sveltekit-frontend/src/routes/api/admin/batch-embeddings/packets/+server.ts` · GET
- `sveltekit-frontend/src/routes/api/admin/retrieval/clusters/+server.ts` · GET
- `sveltekit-frontend/src/routes/api/admin/retrieval/search/+server.ts` · GET/POST
- `sveltekit-frontend/src/routes/api/agent/trace/%5BtraceId%5D/+server.ts` · GET/DELETE
- `sveltekit-frontend/src/routes/api/atlas/studio/redis/+server.ts` · GET
- `sveltekit-frontend/src/routes/api/batch-summary/hints/+server.ts` · POST
- `sveltekit-frontend/src/routes/api/batch-summary/jobs/+server.ts` · GET
- `sveltekit-frontend/src/routes/api/cline/chat/+server.ts` · POST/GET
- `sveltekit-frontend/src/routes/api/dispatcher/audit/+server.ts` · GET
- `sveltekit-frontend/src/routes/api/embedding-lanes/test/+server.ts` · POST/GET
- `sveltekit-frontend/src/routes/api/evaluation/run-test-suite/+server.ts` · POST
- `sveltekit-frontend/src/routes/api/graphify/status/+server.ts` · GET
- `sveltekit-frontend/src/routes/api/mcp/select-tools/+server.ts` · POST
- `sveltekit-frontend/src/routes/api/metrics/retrieval/+server.ts` · GET
- `sveltekit-frontend/src/routes/api/phase102/retrieval-pipeline/+server.ts` · GET
- `sveltekit-frontend/src/routes/api/retrieval/cache-layers/+server.ts` · GET/POST
- `sveltekit-frontend/src/routes/api/retrieval/cache-layers/health/+server.ts` · GET
- `sveltekit-frontend/src/routes/api/retrieval/cache-layers/metrics/+server.ts` · GET
- `sveltekit-frontend/src/routes/api/retrieval/canonical-rerank/+server.ts` · POST
- `sveltekit-frontend/src/routes/api/retrieval/dual-lane/+server.ts` · GET
- `sveltekit-frontend/src/routes/api/retrieval/go/+server.ts` · POST/GET
- `sveltekit-frontend/src/routes/api/retrieval/multi-vector/+server.ts` · POST
- `sveltekit-frontend/src/routes/api/retrieval/reranked-search/+server.ts` · POST/GET
- `sveltekit-frontend/src/routes/api/retrieval/reranked-search/weights-tuning/+server.ts` · POST/GET
- `sveltekit-frontend/src/routes/api/retrieval/rrf/+server.ts` · POST/GET
- `sveltekit-frontend/src/routes/api/retrieval/semantic-rerank/+server.ts` · GET/POST
- `sveltekit-frontend/src/routes/api/retrieval/unified/+server.ts` · GET/POST

---

## G5 — API Routes Missing Zod Validation (20)
- `sveltekit-frontend/src/routes/api/ace/policy-orchestrator/+server.ts` · POST/GET
- `sveltekit-frontend/src/routes/api/agent/rpc/+server.ts` · POST/GET
- `sveltekit-frontend/src/routes/api/ai/policy/+server.ts` · POST/GET
- `sveltekit-frontend/src/routes/api/atlas/file-understanding/+server.ts` · GET/POST
- `sveltekit-frontend/src/routes/api/batch-summary/hints/+server.ts` · POST
- `sveltekit-frontend/src/routes/api/cline/chat/+server.ts` · POST/GET
- `sveltekit-frontend/src/routes/api/embedding-lanes/test/+server.ts` · POST/GET
- `sveltekit-frontend/src/routes/api/evaluation/run-test-suite/+server.ts` · POST
- `sveltekit-frontend/src/routes/api/ldr/research/+server.ts` · GET/POST
- `sveltekit-frontend/src/routes/api/rag/search/+server.ts` · GET/POST
- `sveltekit-frontend/src/routes/api/retrieval/multi-vector/+server.ts` · POST
- `sveltekit-frontend/src/routes/api/retrieval/reranked-search/+server.ts` · POST/GET
- `sveltekit-frontend/src/routes/api/retrieval/reranked-search/weights-tuning/+server.ts` · POST/GET
- `sveltekit-frontend/src/routes/api/retrieval/semantic-rerank/+server.ts` · GET/POST
- `sveltekit-frontend/src/routes/api/retrieval/unified/+server.ts` · GET/POST
- `sveltekit-frontend/src/routes/api/semantic-contracts/predictions/promote/+server.ts` · POST
- `sveltekit-frontend/src/routes/api/semantic-contracts/proposals/approve/+server.ts` · POST
- `sveltekit-frontend/src/routes/api/summarize/+server.ts` · POST
- `sveltekit-frontend/src/routes/api/test/tool-calls/+server.ts` · POST
- `sveltekit-frontend/src/routes/api/tools/search/+server.ts` · POST/GET

---

## G14 — Svelte 4 Legacy Patterns (3 files)
- `sveltekit-frontend/temp_upload.svelte` · on:event
- `sveltekit-frontend/test-errors-validation.svelte` · $:reactive, on:event
- `sveltekit-frontend/test-errors.svelte` · $:reactive

---

## G15 — SSR-Unsafe Globals (0 files · unguarded window/document/localStorage)
_No unguarded SSR-unsafe globals. ✅_

---

## G16 — Routes Without Test Pairing (100)
- `sveltekit-frontend/src/routes/api/ace/packet/+server.ts` · POST/GET
- `sveltekit-frontend/src/routes/api/ace/route/+server.ts` · POST
- `sveltekit-frontend/src/routes/api/acp/kv-cache-stats/+server.ts` · GET
- `sveltekit-frontend/src/routes/api/acp/service-ports/+server.ts` · GET
- `sveltekit-frontend/src/routes/api/admin/ace-metrics/+server.ts` · GET
- `sveltekit-frontend/src/routes/api/admin/ai-chat/[sessionId]/+server.ts` · GET
- `sveltekit-frontend/src/routes/api/admin/atlas/cluster-search/+server.ts` · POST
- `sveltekit-frontend/src/routes/api/admin/atlas/couchdb-rollback/+server.ts` · POST
- `sveltekit-frontend/src/routes/api/admin/atlas/couchdb-status/+server.ts` · GET
- `sveltekit-frontend/src/routes/api/admin/atlas/couchdb-synthesize/+server.ts` · POST
- `sveltekit-frontend/src/routes/api/admin/atlas/messy-routing/+server.ts` · GET
- `sveltekit-frontend/src/routes/api/admin/atlas/node/[id]/+server.ts` · GET
- `sveltekit-frontend/src/routes/api/admin/atlas/turbovec-prefilter/+server.ts` · POST
- `sveltekit-frontend/src/routes/api/admin/grpo/flush/+server.ts` · GET/POST
- `sveltekit-frontend/src/routes/api/admin/parents-atlas/actions/+server.ts` · POST
- `sveltekit-frontend/src/routes/api/admin/retrieval/clusters/[id]/+server.ts` · GET
- `sveltekit-frontend/src/routes/api/admin/routes/+server.ts` · GET
- `sveltekit-frontend/src/routes/api/agent/route/+server.ts` · POST
- `sveltekit-frontend/src/routes/api/agent/trace/%5BtraceId%5D/+server.ts` · GET/DELETE
- `sveltekit-frontend/src/routes/api/ai/analyze/[scope]/+server.ts` · POST
- `sveltekit-frontend/src/routes/api/ai/context/compact-search/+server.ts` · POST
- `sveltekit-frontend/src/routes/api/ai/generate-report/[scope]/+server.ts` · POST
- `sveltekit-frontend/src/routes/api/ai/hermes-run/+server.ts` · POST/GET
- `sveltekit-frontend/src/routes/api/ai/scenario/+server.ts` · POST/GET
- `sveltekit-frontend/src/routes/api/analytics/knowledge-triples/+server.ts` · GET
- `sveltekit-frontend/src/routes/api/analytics/knowledge-triples/prune/+server.ts` · POST
- `sveltekit-frontend/src/routes/api/analytics/research-summaries/[id]/+server.ts` · GET/DELETE
- `sveltekit-frontend/src/routes/api/atlas/cards/[id]/+server.ts` · GET
- `sveltekit-frontend/src/routes/api/atlas/cluster-cards/+server.ts` · POST/GET
- `sveltekit-frontend/src/routes/api/atlas/file-understanding/+server.ts` · GET/POST

---

## G11 — Hardcoded Localhost References (1701 files)
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
| `$lib/types` | 662 |
| `$lib/server/db/client` | 658 |
| `$lib/server/env.server.js` | 474 |
| `$lib/server/redis.js` | 370 |
| `$lib/server/db` | 271 |
| `$lib/components/ui/Icon.svelte` | 260 |
| `$lib/server/db/schema-postgres` | 212 |
| `$lib/server/db/schema-postgres.js` | 189 |
| `$lib/server/ollama.js` | 164 |
| `$lib/server/db/schema` | 147 |
| `$lib/server/db/client.js` | 137 |
| `$lib/middleware/redis-orchestrator-middleware` | 121 |
| `$lib/server/middleware/cache-headers.js` | 111 |
| `$lib/server/vector/qdrant-manager.js` | 106 |
| `$lib/components/ui/Button.svelte` | 95 |
| `$lib/server/validation.js` | 94 |
| `$lib/server/grpc/embedding-client.js` | 90 |
| `$lib/enums` | 88 |
| `$lib/server/redis` | 78 |
| `$lib/server/auth/lucia` | 76 |

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

## Svelte Components (60 shown of 1162)
| File | Sub-components | Key `$lib` Imports |
|------|---------------|---------------------|
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
| `llama-cpp-turboquant-gemma4/tools/server/webui/src/lib/components/app/chat/ChatSidebar/ChatSidebarActions.svelte` | Search, Input, Button, SquarePen | $lib/components/app, $lib/components/ui/button, $lib/components/ui/input |
| `llama-cpp-turboquant-gemma4/tools/server/webui/src/lib/components/app/chat/ChatSidebar/ChatSidebarConversationItem.svelte` | GitBranch, Loader2, Square, DropdownMenuActions | $lib/components/app, $lib/components/ui/tooltip, $lib/constants |

---

## Top External Module Imports
| Module | Consumer Count |
|--------|----------------|
| `@sveltejs/kit` | 3437 |
| `node:path` | 2223 |
| `path` | 2066 |
| `pg` | 1908 |
| `node:fs` | 1750 |
| `node:url` | 1643 |
| `fs` | 1552 |
| `vitest` | 1449 |
| `zod` | 1135 |
| `drizzle-orm` | 1123 |
| `url` | 862 |
| `node:crypto` | 729 |
| `dotenv` | 715 |
| `crypto` | 676 |
| `$lib/types` | 662 |
| `ioredis` | 654 |
| `$lib/server/db/client` | 519 |
| `node:child_process` | 514 |
| `node:fs/promises` | 506 |
| `child_process` | 461 |
| `$lib/server/env.server.js` | 447 |
| `fs/promises` | 386 |
| `drizzle-orm/pg-core` | 327 |
| `svelte` | 316 |
| `@playwright/test` | 299 |
| `$lib/server/db` | 267 |
| `$lib/server/redis.js` | 264 |
| `$lib/components/ui/Icon.svelte` | 260 |
| `node-fetch` | 255 |
| `express` | 223 |

---

## Directories with TODO/FIXME
- `scripts/api-cleanup` — 670 marker(s), score 45
- `scripts/api-cleanup/reports` — 668 marker(s), score 45
- `scripts/api-cleanup/reports/backup-2025-12-14T20-51-26-276Z` — 664 marker(s), score 45
- `sveltekit-frontend/src` — 90 marker(s), score 92
- `tools/agentic-research/src/firecrawl` — 82 marker(s), score 100
- `sveltekit-frontend/src/lib` — 80 marker(s), score 100
- `sveltekit-frontend/src/lib/server` — 70 marker(s), score 100
- `sveltekit-frontend/scripts` — 48 marker(s), score 100
- `sveltekit-frontend/scripts/phase104-backups/src` — 36 marker(s), score 100
- `sveltekit-frontend/drizzle` — 24 marker(s), score 85
- `scripts/atlas` — 12 marker(s), score 100
- `sveltekit-frontend/scripts/topology` — 9 marker(s), score 75
- `sveltekit-frontend/src/routes/api` — 9 marker(s), score 75
- `sveltekit-frontend/src/routes` — 9 marker(s), score 90
- `scripts/verify` — 8 marker(s), score 70

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
