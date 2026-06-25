# Codebase Map — 20-Gate Deep Audit
> Generated: 2026-06-25T22:25:52.680Z
> Mode: `fast-ast` · CPU-only · No GPU required
> Regenerate: `npm run index:codebase:fast:plan`

---

## Summary
| Metric | Count |
|--------|-------|
| Files scanned | 68250 |
| Directories analysed | 750 |
| Route files | 182 |
| Svelte components | 5719 |
| API handlers | 7139 |
| API routes without auth | 6 |
| API routes without Zod | 2 |
| SSR-unsafe files | 0 |
| Svelte 4 legacy patterns | 28 |
| Hardcoded localhost refs | 2951 |
| Routes without test pairing | 35 |
| Cyclic import pairs | 3 |
| Drizzle table refs | 5721 |
| TODO/FIXME markers | 1121 |

---

## 20-Gate Audit Summary

| Gate | Check | Pass | Fail |
|------|-------|------|------|
| G4  | Auth guard on API routes | 148 | 7 |
| G5  | Zod validation on API routes | 107 | 2 |
| G11 | No hardcoded localhost (excl env.server) | 65299 | 2951 |
| G14a | No `export let` (Svelte 4 props) | 68245 | 5 |
| G14b | No `$:` reactive declarations | 68238 | 12 |
| G14c | No `on:event=` directives | 68233 | 17 |
| G14d | No `createEventDispatcher()` | 68250 | 0 |
| G14e | No runes in plain `.ts` files | 68175 | 75 |
| G15 | No SSR-unsafe globals (unguarded) | 68250 | 0 |
| G16 | Server routes have test pairing | 107 | 35 |
| G17 | Server routes have error handling | 146 | 12 |
| G20 | Cyclic import pairs | — | 3 |

---

## Directory Scorecard (750 dirs · lowest score = most attention needed)

**Score factors**: Auth/API coverage 25pts · Zod coverage 15pts · Drizzle ref 10pts · No TODOs 15pts · SSR-safe 10pts · No Svelte4 10pts · No localhost 5pts · Error handling 5pts · Non-empty 5pts

**Flags**: 🔴ssr = SSR-unsafe globals · 🟡sv4 = Svelte4 legacy · 🟠lh = localhost hardcoded · ⬜notest = routes lack tests


| Status | Directory | Score | Files | Lines | APIs | Auth/Zod | TODOs | Flags |
|--------|-----------|-------|-------|-------|------|----------|-------|-------|
| ⚠️ | `scripts/api-cleanup/reports` | 45 | 4 | 191488 | 2442 | 262/384 | 668 | 🟠lh |
| ⚠️ | `scripts/api-cleanup/reports/backup-2025-12-14T20-51-26-276Z` | 45 | 2610 | 180612 | 2436 | 258/380 | 664 | 🟠lh |
| ⚠️ | `.claude/worktrees/agent-a38668f2/src` | 51 | 214 | 11128 | 35 | 5/30 | 16 | 🟡sv4 |
| ⚠️ | `docker/langgraph-synthesis/.venv/Lib` | 65 | 60 | 300052 | 0 | 0/4 | 44 | 🔴ssr |
| ⚠️ | `sveltekit-frontend/src/routes/.well-known` | 65 | 2 | 371 | 2 | 0/2 | 0 | — |
| ⚠️ | `.claude/worktrees/agent-a87590c9/src` | 68 | 12 | 1396 | 1 | 0/1 | 1 | — |
| ✅ | `llama-cpp-turboquant-gemma4/tools/server` | 70 | 1 | 60689 | 0 | 2/24 | 3 | 🟠lh |
| ✅ | `scripts/verify` | 70 | 16 | 3594 | 0 | 0/8 | 8 | 🟠lh |
| ✅ | `scripts/api-cleanup/reports/backup-2025-12-14T21-11-49-641Z` | 72 | 6 | 224 | 6 | 4/4 | 4 | — |
| ✅ | `llama-cpp-turboquant-gemma4/tools/server/webui` | 78 | 435 | 57041 | 0 | 1/18 | 1 | 🟠lh |
| ✅ | `packages/parent-atlas` | 78 | 3 | 4461 | 0 | 0/5 | 1 | 🟠lh |
| ✅ | `packages/parent-atlas/src` | 78 | 3 | 4086 | 0 | 0/5 | 1 | 🟠lh |
| ✅ | `sveltekit-frontend/src/lib/server` | 80 | 352 | 91211 | 0 | 3/114 | 3 | 🟠lh |
| ✅ | `llama-cpp-turboquant-gemma4/tools/server/public_legacy` | 83 | 5 | 1474 | 0 | 0/2 | 2 | — |
| ✅ | `packages/parent-atlas/src/core` | 83 | 1 | 613 | 0 | 0/0 | 1 | — |
| ✅ | `scripts/benchmark` | 83 | 2 | 774 | 0 | 0/2 | 2 | — |
| ✅ | `sveltekit-frontend/sveltekit-frontend/sveltekit-frontend/src` | 83 | 1 | 143 | 1 | 1/1 | 1 | — |
| ✅ | `.claude/worktrees/agent-a38668f2/tests` | 85 | 28 | 4214 | 0 | 0/7 | 0 | 🟠lh |
| ✅ | `scripts/startup` | 85 | 19 | 3456 | 0 | 0/2 | 0 | 🟠lh |
| ✅ | `sveltekit-frontend/scripts/startup` | 85 | 7 | 1559 | 0 | 0/1 | 0 | 🟠lh |
| ✅ | `claude-mem/src/npx-cli` | 85 | 3 | 3852 | 0 | 0/4 | 0 | 🟠lh |
| ✅ | `claude-mem/src/npx-cli/commands` | 85 | 6 | 2903 | 0 | 0/2 | 0 | 🟠lh |
| ✅ | `llama-cpp-turboquant-gemma4/tools/server/bench` | 85 | 1 | 163 | 0 | 0/1 | 0 | 🟠lh |
| ✅ | `llama-cpp-turboquant-gemma4/tools/server/public_simplechat` | 85 | 3 | 1409 | 0 | 0/1 | 0 | 🟠lh |
| ✅ | `packages/parent-atlas/src/pipelines` | 85 | 17 | 2427 | 0 | 0/3 | 0 | 🟠lh |
| ✅ | `scripts/agent` | 85 | 4 | 1044 | 0 | 0/4 | 0 | 🟠lh |
| ✅ | `scripts/agentic` | 85 | 10 | 2886 | 0 | 0/10 | 0 | 🟠lh |
| ✅ | `scripts/atlas/ingester` | 85 | 6 | 1534 | 0 | 0/4 | 0 | 🟠lh |
| ✅ | `scripts/audit` | 85 | 2 | 860 | 0 | 0/2 | 0 | 🟠lh |
| ✅ | `scripts/docs` | 85 | 2 | 830 | 0 | 0/0 | 0 | 🟠lh |
| ✅ | `scripts/graph` | 85 | 4 | 1104 | 0 | 0/4 | 0 | 🟠lh |
| ✅ | `scripts/graphify-audit` | 85 | 8 | 2208 | 0 | 0/4 | 0 | 🟠lh |
| ✅ | `scripts/operator` | 85 | 4 | 936 | 0 | 0/4 | 0 | 🟠lh |
| ✅ | `scripts/smoke` | 85 | 18 | 2666 | 0 | 0/10 | 0 | 🟠lh |
| ✅ | `sveltekit-frontend/drizzle` | 85 | 4 | 480248 | 0 | 0/0 | 4 | — |
| ✅ | `sveltekit-frontend/drizzle/introspected` | 85 | 2 | 20357 | 0 | 0/0 | 4 | — |
| ✅ | `sveltekit-frontend/public/js` | 85 | 1 | 571 | 0 | 0/0 | 0 | 🟠lh |
| ✅ | `sveltekit-frontend/scripts/diagnose` | 85 | 2 | 379 | 0 | 0/0 | 0 | 🟠lh |
| ✅ | `sveltekit-frontend/scripts/diagnostics` | 85 | 3 | 291 | 0 | 0/2 | 0 | 🟠lh |
| ✅ | `sveltekit-frontend/scripts/kag` | 85 | 1 | 308 | 0 | 0/1 | 0 | 🟠lh |
| ✅ | `sveltekit-frontend/scripts/lib` | 85 | 6 | 1194 | 0 | 0/3 | 0 | 🟠lh |
| ✅ | `sveltekit-frontend/scripts/scenarios` | 85 | 1 | 38 | 0 | 0/0 | 0 | 🟠lh |
| ✅ | `sveltekit-frontend/src/lib/utils` | 85 | 4 | 235 | 0 | 0/0 | 0 | 🟠lh |
| ✅ | `sveltekit-frontend/src/routes/dev` | 85 | 2 | 524 | 0 | 1/1 | 0 | 🟠lh ⬜notest |
| ✅ | `sveltekit-frontend/sveltekit-frontend/sveltekit-frontend/sveltekit-frontend` | 85 | 2 | 262 | 0 | 0/0 | 0 | 🟠lh |
| ✅ | `sveltekit-frontend/tests/helpers` | 85 | 3 | 374 | 0 | 1/1 | 0 | 🟠lh |
| ✅ | `sveltekit-frontend/tmp` | 85 | 14 | 162199 | 0 | 0/0 | 0 | 🟠lh |
| ✅ | `sveltekit-frontend/scripts/atlas` | 88 | 145 | 38157 | 0 | 1/64 | 1 | 🟠lh |
| ✅ | `$lib/utils` | 90 | 6 | 90 | 0 | 0/0 | 0 | — |
| ✅ | `.claude/worktrees/agent-a38668f2/.github` | 90 | 6 | 60 | 0 | 0/0 | 0 | — |
| ✅ | `.claude/worktrees/agent-a38668f2/.vscode` | 90 | 16 | 45414 | 0 | 0/0 | 0 | — |
| ✅ | `.claude/worktrees/agent-a38668f2/audit` | 90 | 5 | 65 | 0 | 0/0 | 0 | — |
| ✅ | `.claude/worktrees/agent-a38668f2/crates` | 90 | 52 | 4242 | 0 | 0/0 | 0 | — |
| ✅ | `.claude/worktrees/agent-a38668f2/data` | 90 | 5 | 35 | 0 | 0/0 | 0 | — |
| ✅ | `.claude/worktrees/agent-a38668f2/docker` | 90 | 12 | 772 | 0 | 0/0 | 0 | — |
| ✅ | `.claude/worktrees/agent-a38668f2/docs` | 90 | 1052 | 6945740 | 0 | 0/0 | 0 | — |
| ✅ | `.claude/worktrees/agent-a38668f2/memory` | 90 | 379 | 6156442 | 0 | 0/0 | 0 | — |
| ✅ | `.claude/worktrees/agent-a38668f2/next_steps` | 90 | 5 | 1160875 | 0 | 0/0 | 0 | — |
| ✅ | `.claude/worktrees/agent-a38668f2/simd-bridge` | 90 | 137 | 5103 | 0 | 0/12 | 0 | — |
| ✅ | `.claude/worktrees/agent-a87590c9/.vscode` | 90 | 1 | 11375 | 0 | 0/0 | 0 | — |
| ✅ | `.claude/worktrees/agent-a87590c9/configs` | 90 | 1 | 60 | 0 | 0/0 | 0 | — |
| ✅ | `.claude/worktrees/agent-a87590c9/crates` | 90 | 2 | 27 | 0 | 0/0 | 0 | — |
| ✅ | `.claude/worktrees/agent-a87590c9/docs` | 90 | 180 | 289610 | 0 | 0/0 | 0 | — |
| ✅ | `docs/reports` | 90 | 277 | 3703624 | 0 | 0/0 | 0 | — |
| ✅ | `docs/reports/proof-of-truth` | 90 | 12 | 596 | 0 | 0/0 | 0 | — |
| ✅ | `.claude/worktrees/agent-a87590c9/memory` | 90 | 4 | 96268 | 0 | 0/0 | 0 | — |
| ✅ | `memory/exports` | 90 | 52 | 388011 | 0 | 0/0 | 0 | — |
| ✅ | `scripts/semantic-valkey` | 90 | 3 | 243 | 0 | 0/0 | 0 | — |
| ✅ | `scripts/skills` | 90 | 3 | 708 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/docs/atlas-index` | 90 | 6 | 122786 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/docs/reports` | 90 | 87 | 818736 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/memory/atlas` | 90 | 4 | 4 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/memory/docstore` | 90 | 2 | 44 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/memory/graphify/deep` | 90 | 7 | 980192 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/memory/kag-notes` | 90 | 2 | 32 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/scripts/cards` | 90 | 2 | 474 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/scripts/index` | 90 | 2 | 108 | 0 | 0/0 | 0 | — |
| ✅ | `packages/parent-atlas-retrieval` | 90 | 1 | 6919 | 0 | 0/4 | 0 | — |
| ✅ | `packages/parent-atlas-retrieval/src` | 90 | 1 | 5786 | 0 | 0/4 | 0 | — |
| ✅ | `packages/parent-atlas-retrieval/src/gpu` | 90 | 8 | 4606 | 0 | 0/2 | 0 | — |
| ✅ | `sveltekit-frontend/src/routes/api` | 90 | 134 | 28095 | 134 | 127/99 | 0 | 🟠lh ⬜notest |
| ✅ | `.claude/worktrees/agent-a87590c9/tests` | 90 | 2 | 501 | 0 | 0/1 | 0 | — |
| ✅ | `.gemini/antigravity/scratch` | 90 | 3 | 132 | 0 | 0/0 | 0 | — |
| ✅ | `.python311/lib/python3.11/site-packages` | 90 | 2 | 2 | 0 | 0/0 | 0 | — |
| ✅ | `.vscode/tasks` | 90 | 1 | 11 | 0 | 0/0 | 0 | — |
| ✅ | `claude-mem/.agents/plugins` | 90 | 1 | 21 | 0 | 0/0 | 0 | — |
| ✅ | `claude-mem/.claude` | 90 | 1 | 11 | 0 | 0/0 | 0 | — |
| ✅ | `claude-mem/.claude-plugin` | 90 | 3 | 69 | 0 | 0/0 | 0 | — |
| ✅ | `claude-mem/.codex-plugin` | 90 | 1 | 47 | 0 | 0/0 | 0 | — |
| ✅ | `claude-mem/cursor-hooks` | 90 | 1 | 35 | 0 | 0/0 | 0 | — |
| ✅ | `claude-mem/docker/e2e` | 90 | 1 | 303 | 0 | 0/1 | 0 | — |
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
| ✅ | `crates/atlas_packet_parser` | 90 | 6 | 796 | 0 | 0/0 | 0 | — |
| ✅ | `crates/atlas_packet_parser/target/debug` | 90 | 220 | 220 | 0 | 0/0 | 0 | — |
| ✅ | `crates/atlas_packet_parser/target/release` | 90 | 167 | 167 | 0 | 0/0 | 0 | — |
| ✅ | `crates/omni-bridge/target/debug` | 90 | 10 | 10 | 0 | 0/0 | 0 | — |
| ✅ | `crates/turbovec-napi` | 90 | 6 | 929 | 0 | 0/0 | 0 | — |
| ✅ | `crates/turbovec-napi/target/debug` | 90 | 147 | 147 | 0 | 0/0 | 0 | — |
| ✅ | `crates/turbovec-napi/target/release` | 90 | 137 | 137 | 0 | 0/0 | 0 | — |
| ✅ | `crates/turbovec-napi/target/x86_64-pc-windows-msvc` | 90 | 113 | 113 | 0 | 0/0 | 0 | — |
| ✅ | `docker/seaweedfs` | 90 | 2 | 82 | 0 | 0/0 | 0 | — |
| ✅ | `docs/atlas` | 90 | 2 | 46762 | 0 | 0/0 | 0 | — |
| ✅ | `docs/graph` | 90 | 25 | 981126 | 0 | 0/0 | 0 | — |
| ✅ | `docs/packets` | 90 | 1 | 532 | 0 | 0/0 | 0 | — |
| ✅ | `docs/phase100` | 90 | 7 | 29520 | 0 | 0/0 | 0 | — |
| ✅ | `docs/profile-cards/data` | 90 | 23 | 716 | 0 | 0/0 | 0 | — |
| ✅ | `docs/reports/atlas` | 90 | 4 | 174 | 0 | 0/0 | 0 | — |
| ✅ | `docs/reports/replay` | 90 | 40 | 11334 | 0 | 0/0 | 0 | — |
| ✅ | `llama-cpp-turboquant-gemma4/.gemini` | 90 | 1 | 2 | 0 | 0/0 | 0 | — |
| ✅ | `llama-cpp-turboquant-gemma4/benches/dgx-spark` | 90 | 2 | 2902 | 0 | 0/0 | 0 | — |
| ✅ | `llama-cpp-turboquant-gemma4/docs/backend/snapdragon` | 90 | 1 | 62 | 0 | 0/0 | 0 | — |
| ✅ | `llama-cpp-turboquant-gemma4/examples/gguf-hash/deps` | 90 | 4 | 53 | 0 | 0/0 | 0 | — |
| ✅ | `llama-cpp-turboquant-gemma4/examples/llama.swiftui/llama.swiftui` | 90 | 2 | 21 | 0 | 0/0 | 0 | — |
| ✅ | `llama-cpp-turboquant-gemma4/scripts` | 90 | 1 | 111 | 0 | 0/0 | 0 | — |
| ✅ | `llama-cpp-turboquant-gemma4/tests` | 90 | 1 | 11 | 0 | 0/1 | 0 | — |
| ✅ | `llama-cpp-turboquant-gemma4/tools/server/public` | 90 | 1 | 470 | 0 | 1/1 | 0 | — |
| ✅ | `memory/agent-runs` | 90 | 1 | 146 | 0 | 0/0 | 0 | — |
| ✅ | `memory/exports/atlas` | 90 | 1 | 91651 | 0 | 0/0 | 0 | — |
| ✅ | `memory/exports/parent-atlas` | 90 | 1 | 131565 | 0 | 0/0 | 0 | — |
| ✅ | `memory/graph` | 90 | 1 | 4320 | 0 | 0/0 | 0 | — |
| ✅ | `memory/graphify/deep` | 90 | 1 | 663970 | 0 | 0/0 | 0 | — |
| ✅ | `memory/knowledge` | 90 | 5 | 1395 | 0 | 0/0 | 0 | — |
| ✅ | `memory/manifests` | 90 | 3 | 140 | 0 | 0/0 | 0 | — |
| ✅ | `memory/packets` | 90 | 1 | 105 | 0 | 0/0 | 0 | — |
| ✅ | `memory/reports` | 90 | 1 | 195667 | 0 | 0/0 | 0 | — |
| ✅ | `memory/rewards` | 90 | 2 | 52 | 0 | 0/0 | 0 | — |
| ✅ | `minio-data/.minio.sys` | 90 | 1 | 1 | 0 | 0/0 | 0 | — |
| ✅ | `neschrom97/cards` | 90 | 8170 | 166304 | 0 | 0/0 | 0 | — |
| ✅ | `neschrom97/index` | 90 | 5 | 74105 | 0 | 0/0 | 0 | — |
| ✅ | `neschrom97/packets` | 90 | 2 | 46 | 0 | 0/0 | 0 | — |
| ✅ | `next_steps/active` | 90 | 2 | 464350 | 0 | 0/0 | 0 | — |
| ✅ | `packages/parent-atlas/src/adapters` | 90 | 5 | 366 | 0 | 0/1 | 0 | — |
| ✅ | `packages/parent-atlas/src/gates` | 90 | 6 | 316 | 0 | 0/1 | 0 | — |
| ✅ | `packages/parent-atlas-core` | 90 | 1 | 111 | 0 | 0/0 | 0 | — |
| ✅ | `packages/parent-atlas-core/src` | 90 | 1 | 67 | 0 | 0/0 | 0 | — |
| ✅ | `packages/parent-atlas-ingest` | 90 | 2 | 374 | 0 | 0/0 | 0 | — |
| ✅ | `packages/parent-atlas-ingest/src` | 90 | 1 | 318 | 0 | 0/0 | 0 | — |
| ✅ | `packages/parent-atlas-ingest/src/scanner` | 90 | 2 | 304 | 0 | 0/0 | 0 | — |
| ✅ | `packages/parent-atlas-opencode` | 90 | 1 | 47 | 0 | 0/0 | 0 | — |
| ✅ | `packages/parent-atlas-retrieval/src/bifrost` | 90 | 8 | 1150 | 0 | 0/2 | 0 | — |
| ✅ | `packages/parent-atlas-retrieval/tests/bifrost` | 90 | 3 | 1071 | 0 | 0/0 | 0 | — |
| ✅ | `scratch/index-checkpoints` | 90 | 2 | 196384 | 0 | 0/0 | 0 | — |
| ✅ | `scratch/obsidian_vault/.obsidian/plugins` | 90 | 2 | 59245 | 0 | 1/1 | 0 | — |
| ✅ | `scripts/agents` | 90 | 2 | 16 | 0 | 0/0 | 0 | — |
| ✅ | `scripts/analysis_reports` | 90 | 24 | 10410 | 0 | 0/0 | 0 | — |
| ✅ | `scripts/atlas/out` | 90 | 8 | 6782 | 0 | 0/0 | 0 | — |
| ✅ | `scripts/bench` | 90 | 2 | 266 | 0 | 0/2 | 0 | — |
| ✅ | `scripts/cache` | 90 | 6 | 750 | 0 | 0/4 | 0 | — |
| ✅ | `scripts/case_data/_cache` | 90 | 292 | 292 | 0 | 0/0 | 0 | — |
| ✅ | `scripts/court_data/constitutions` | 90 | 18 | 2360 | 0 | 0/0 | 0 | — |
| ✅ | `scripts/dev` | 90 | 2 | 252 | 0 | 0/2 | 0 | — |
| ✅ | `scripts/evals` | 90 | 2 | 800 | 0 | 0/0 | 0 | — |
| ✅ | `scripts/lib` | 90 | 2 | 314 | 0 | 0/0 | 0 | — |
| ✅ | `scripts/memory/graphify/gds` | 90 | 16 | 573596 | 0 | 0/0 | 0 | — |
| ✅ | `scripts/native` | 90 | 2 | 874 | 0 | 0/2 | 0 | — |
| ✅ | `scripts/phase-3d` | 90 | 2 | 348 | 0 | 0/0 | 0 | — |
| ✅ | `scripts/sidecars` | 90 | 2 | 512 | 0 | 0/0 | 0 | — |
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
| ✅ | `scripts/unsloth-training/COLAB_PACKAGE/training-datasets` | 90 | 2 | 198 | 0 | 0/0 | 0 | — |
| ✅ | `scripts/workers` | 90 | 4 | 984 | 0 | 0/2 | 0 | — |
| ✅ | `simd-bridge/cpp` | 90 | 4 | 1372 | 0 | 0/2 | 0 | — |
| ✅ | `simd-bridge/rust/graph-engine` | 90 | 4 | 228 | 0 | 0/0 | 0 | — |
| ✅ | `simd-bridge/rust/graph-engine/target` | 90 | 164 | 164 | 0 | 0/0 | 0 | — |
| ✅ | `simd-bridge/rust/hmm-repair` | 90 | 4 | 208 | 0 | 0/0 | 0 | — |
| ✅ | `simd-bridge/rust/hmm-repair/target` | 90 | 144 | 144 | 0 | 0/0 | 0 | — |
| ✅ | `simd-bridge/rust-simdjson/target/debug` | 90 | 42 | 42 | 0 | 0/0 | 0 | — |
| ✅ | `simd-bridge/rust-simdjson/target/release` | 90 | 108 | 108 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/.claude` | 90 | 1 | 45 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/.okf` | 90 | 1 | 20 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/.venv/Lib/python3.9` | 90 | 5 | 2421 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/.venv_turbovec/Lib/site-packages` | 90 | 1 | 7857 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/.vscode` | 90 | 4 | 4167 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/docs/atlas` | 90 | 1 | 5156 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/docs/graph` | 90 | 17 | 6809673 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/docs/obsidian-vault` | 90 | 2 | 108 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/docs/profile-cards/data` | 90 | 20 | 1588 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/docs_readme/deeds_labs_archive` | 90 | 84 | 2997942 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/docs_readme/deeds_labs_archive/components` | 90 | 1 | 445 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/drizzle/introspected/meta` | 90 | 2 | 17338 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/drizzle/meta` | 90 | 21 | 426580 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/drizzle/meta_backup_20260101` | 90 | 10 | 32129 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/memory/agents-dag` | 90 | 34 | 2433 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/memory/codebase` | 90 | 1 | 38787 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/memory/exports` | 90 | 5 | 1758 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/memory/exports/atlas` | 90 | 1 | 20 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/memory/exports/xgboost-hotness` | 90 | 1 | 393 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/memory/features` | 90 | 3 | 623 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/memory/graphify/gds` | 90 | 90 | 2014017 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/memory/kb/cards` | 90 | 2 | 87451 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/memory/kb/notecards` | 90 | 1 | 203 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/memory/kb/weights` | 90 | 1 | 13 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/memory/knowledge` | 90 | 1 | 17 | 0 | 0/0 | 0 | — |
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
| ✅ | `sveltekit-frontend/memory/runs/2026-05-07T01-05-54` | 90 | 53 | 1717669 | 0 | 0/0 | 0 | — |
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
| ✅ | `sveltekit-frontend/memory/runs/2026-06-01T22-22-15` | 90 | 15 | 36866 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/memory/runs/2026-06-03T15-49-43` | 90 | 3 | 2942 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/memory/runs/2026-06-03T15-49-51` | 90 | 3 | 2942 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/memory/runs/2026-06-06` | 90 | 1 | 19 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/memory/runs/2026-06-06T01-36-20` | 90 | 1 | 755 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/memory/runs/2026-06-06T01-50-52` | 90 | 1 | 755 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/memory/runs/2026-06-06T02-04-19` | 90 | 1 | 755 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/memory/runs/2026-06-11T03-27-26` | 90 | 4 | 1640 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/memory/runs/2026-06-11T03-27-27` | 90 | 4 | 34440 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/memory/synthesis` | 90 | 1 | 10 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/mini_active_nvme_cache` | 90 | 1 | 1 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/reports` | 90 | 6 | 304025 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/reports/deep-audit` | 90 | 4 | 303959 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/reports/deep-audit/encoded` | 90 | 29 | 139362 | 0 | 0/0 | 0 | — |
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
| ✅ | `sveltekit-frontend/scripts/ace` | 90 | 3 | 434 | 0 | 0/2 | 0 | — |
| ✅ | `sveltekit-frontend/scripts/atlas/lib` | 90 | 1 | 42 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/scripts/backup-consolidation` | 90 | 17 | 4382 | 0 | 0/10 | 0 | — |
| ✅ | `sveltekit-frontend/scripts/backup-consolidation/tests` | 90 | 4 | 999 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/scripts/cache` | 90 | 3 | 546 | 0 | 0/3 | 0 | — |
| ✅ | `sveltekit-frontend/scripts/comfyui` | 90 | 2 | 282 | 0 | 0/1 | 0 | — |
| ✅ | `sveltekit-frontend/scripts/comfyui/workflows` | 90 | 2 | 84 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/scripts/daily` | 90 | 1 | 78 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/scripts/dev` | 90 | 1 | 140 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/scripts/docs/reports` | 90 | 1 | 306 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/scripts/features` | 90 | 1 | 46 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/scripts/graph` | 90 | 9 | 1754 | 0 | 0/6 | 0 | — |
| ✅ | `sveltekit-frontend/scripts/health` | 90 | 1 | 243 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/scripts/ingest` | 90 | 1 | 108 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/scripts/knowledge` | 90 | 1 | 55 | 0 | 0/1 | 0 | — |
| ✅ | `sveltekit-frontend/scripts/llms` | 90 | 3 | 714 | 0 | 0/2 | 0 | — |
| ✅ | `sveltekit-frontend/scripts/opencode` | 90 | 14 | 3459 | 0 | 0/4 | 0 | — |
| ✅ | `sveltekit-frontend/scripts/qdrant` | 90 | 3 | 384 | 0 | 0/2 | 0 | — |
| ✅ | `sveltekit-frontend/scripts/reconstruction` | 90 | 4 | 439 | 0 | 0/1 | 0 | — |
| ✅ | `sveltekit-frontend/scripts/rg-atlas` | 90 | 1 | 42 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/scripts/sidecars` | 90 | 3 | 14 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/scripts/synth` | 90 | 1 | 113 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/scripts/tests/nes-arch` | 90 | 1 | 76 | 0 | 0/1 | 0 | — |
| ✅ | `sveltekit-frontend/scripts/tests/probes` | 90 | 3 | 88 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/scripts/tools` | 90 | 2 | 205 | 0 | 0/1 | 0 | — |
| ✅ | `sveltekit-frontend/scripts/turboquant` | 90 | 1 | 82 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/scripts/validate` | 90 | 1 | 260 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/scripts/wiki` | 90 | 10 | 2818 | 0 | 0/5 | 0 | — |
| ✅ | `sveltekit-frontend/scripts/__fixtures__` | 90 | 1 | 28 | 0 | 0/1 | 0 | — |
| ✅ | `sveltekit-frontend/src/lib/agent` | 90 | 9 | 977 | 0 | 0/2 | 0 | — |
| ✅ | `sveltekit-frontend/src/lib/ai` | 90 | 1 | 49 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/src/lib/client` | 90 | 1 | 104 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/src/lib/components` | 90 | 11 | 1040 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/src/lib/config` | 90 | 1 | 311 | 0 | 1/1 | 0 | — |
| ✅ | `sveltekit-frontend/src/lib/generated` | 90 | 10 | 24980 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/src/lib/shims` | 90 | 1 | 426 | 0 | 0/1 | 0 | — |
| ✅ | `sveltekit-frontend/src/mcp/tools` | 90 | 1 | 409 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/src/routes/(analysis)` | 90 | 9 | 3078 | 0 | 6/0 | 0 | ⬜notest |
| ✅ | `sveltekit-frontend/src/routes/(analysis)@` | 90 | 3 | 2471 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/sveltekit-frontend/.docker-build` | 90 | 2 | 14 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/sveltekit-frontend/docs/reports` | 90 | 2 | 368 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/sveltekit-frontend/scripts/atlas` | 90 | 5 | 650 | 0 | 0/2 | 0 | — |
| ✅ | `sveltekit-frontend/sveltekit-frontend/src/lib` | 90 | 1 | 371 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/sveltekit-frontend/sveltekit-frontend/docs` | 90 | 2 | 98 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/sveltekit-frontend/sveltekit-frontend/scripts` | 90 | 3 | 556 | 0 | 0/1 | 0 | — |
| ✅ | `sveltekit-frontend/test` | 90 | 1 | 63 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/test-results` | 90 | 2 | 366 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/tests/accessibility` | 90 | 1 | 106 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/tests/e2e` | 90 | 18 | 5799 | 0 | 10/3 | 0 | — |
| ✅ | `sveltekit-frontend/tests/e2e/route-forensic` | 90 | 35 | 1750 | 0 | 4/0 | 0 | — |
| ✅ | `sveltekit-frontend/tests/fixtures` | 90 | 1 | 46 | 0 | 1/0 | 0 | — |
| ✅ | `sveltekit-frontend/tests/intent` | 90 | 2 | 472 | 0 | 0/1 | 0 | — |
| ✅ | `sveltekit-frontend/tests/mapreduce` | 90 | 1 | 217 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/tests/opencode` | 90 | 1 | 294 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/tests/reports` | 90 | 1 | 26 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/tests/routes/api` | 90 | 1 | 126 | 0 | 1/0 | 0 | — |
| ✅ | `sveltekit-frontend/tests/runes` | 90 | 1 | 230 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/tests/sw` | 90 | 1 | 97 | 0 | 0/1 | 0 | — |
| ✅ | `sveltekit-frontend/tests/unit` | 90 | 10 | 1484 | 0 | 0/2 | 0 | — |
| ✅ | `sveltekit-frontend/tests/utils` | 90 | 1 | 134 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/tmp/ace-context-snapshots` | 90 | 2 | 115 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/tmp/hypergraph` | 90 | 1 | 77108 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/tmp/uscode-extracted` | 90 | 1 | 83 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/uploads/transcriptions` | 90 | 2 | 1388 | 0 | 0/0 | 0 | — |
| ✅ | `tests/integration` | 90 | 2 | 324 | 0 | 0/0 | 0 | — |
| ✅ | `tests/opencode` | 90 | 2 | 678 | 0 | 0/2 | 0 | — |
| ✅ | `tmp/ace-context-snapshots` | 90 | 3 | 54 | 0 | 0/0 | 0 | — |
| ✅ | `turbovec/benchmarks/results` | 90 | 23 | 328 | 0 | 0/0 | 0 | — |
| ✅ | `turbovec/target` | 90 | 1 | 155 | 0 | 0/0 | 0 | — |
| ✅ | `turbovec/target/release/.fingerprint` | 90 | 154 | 154 | 0 | 0/0 | 0 | — |
| ✅ | `.claude/worktrees/agent-a6ea9982/sveltekit-frontend` | 95 | 3 | 24756 | 0 | 0/3 | 0 | 🟠lh |
| ✅ | `sveltekit-frontend/scripts/semantic-valkey` | 95 | 3 | 631 | 0 | 1/0 | 0 | 🟠lh |
| ✅ | `sveltekit-frontend/src/mcp` | 95 | 3 | 17169 | 0 | 0/3 | 0 | 🟠lh |
| ✅ | `sveltekit-frontend/src/routes/(app)` | 95 | 39 | 10565 | 0 | 39/4 | 0 | 🟠lh ⬜notest |
| ✅ | `claude-mem/plugin` | 95 | 2 | 24717 | 0 | 2/10 | 0 | 🟠lh |
| ✅ | `claude-mem/plugin/scripts` | 95 | 9 | 23096 | 0 | 2/8 | 0 | 🟠lh |
| ✅ | `scripts/docs-atlas` | 95 | 20 | 2462 | 0 | 0/8 | 0 | 🟠lh |
| ✅ | `scripts/ingest` | 95 | 24 | 5498 | 0 | 0/22 | 0 | 🟠lh |
| ✅ | `scripts/opencode` | 95 | 58 | 10786 | 0 | 0/50 | 0 | 🟠lh |
| ✅ | `scripts/qdrant` | 95 | 2 | 322 | 0 | 0/2 | 0 | 🟠lh |
| ✅ | `scripts/tests` | 95 | 66 | 77846 | 0 | 4/14 | 0 | 🟠lh |
| ✅ | `sveltekit-frontend/.docker-build` | 95 | 1 | 33663 | 0 | 2/21 | 0 | 🟠lh |
| ✅ | `sveltekit-frontend/.docker-build/scripts/atlas` | 95 | 38 | 3937 | 0 | 2/21 | 0 | 🟠lh |
| ✅ | `sveltekit-frontend/scratch` | 95 | 54 | 7233 | 0 | 0/7 | 0 | 🟠lh |
| ✅ | `sveltekit-frontend/scripts/mcp` | 95 | 7 | 2911 | 0 | 0/6 | 0 | 🟠lh |
| ✅ | `sveltekit-frontend/scripts/smoke` | 95 | 28 | 3747 | 0 | 0/9 | 0 | 🟠lh |
| ✅ | `sveltekit-frontend/scripts/tests` | 95 | 52 | 9386 | 0 | 2/14 | 0 | 🟠lh |
| ✅ | `sveltekit-frontend/src` | 98 | 1 | 183128 | 136 | 178/228 | 3 | 🟠lh ⬜notest |
| ✅ | `.claude/hooks` | 100 | 2 | 164 | 0 | 0/2 | 0 | — |
| ✅ | `.claude/worktrees/agent-a38668f2` | 100 | 292 | 88732304 | 4520 | 10507/11715 | 363 | 🟡sv4 🟠lh |
| ✅ | `.claude/worktrees/agent-a38668f2/.claude` | 100 | 24 | 3532 | 0 | 0/10 | 0 | — |
| ✅ | `.claude/worktrees/agent-a38668f2/drizzle` | 100 | 21 | 16268 | 0 | 0/0 | 0 | — |
| ✅ | `.claude/worktrees/agent-a38668f2/scripts` | 100 | 6324 | 2678621 | 64 | 10/2607 | 42 | 🟠lh |
| ✅ | `.claude/worktrees/agent-a38668f2/sveltekit-frontend` | 100 | 37827 | 71692183 | 4421 | 10492/9043 | 305 | 🟡sv4 🟠lh |
| ✅ | `.claude/worktrees/agent-a87590c9` | 100 | 2 | 5347735 | 33 | 37/257 | 5 | 🟠lh |
| ✅ | `.claude/worktrees/agent-a87590c9/scripts` | 100 | 335 | 88693 | 1 | 0/129 | 0 | 🟠lh |
| ✅ | `scripts/atlas` | 100 | 1645 | 434048 | 4 | 0/715 | 18 | 🟠lh |
| ✅ | `.claude/worktrees/agent-a87590c9/sveltekit-frontend` | 100 | 347 | 4859372 | 31 | 37/125 | 4 | 🟠lh |
| ✅ | `sveltekit-frontend/scripts` | 100 | 223 | 129494 | 1 | 11/232 | 1 | 🟠lh |
| ✅ | `sveltekit-frontend/scripts/agents` | 100 | 4 | 1430 | 0 | 1/2 | 0 | — |
| ✅ | `sveltekit-frontend/tests` | 100 | 152 | 102739 | 2 | 720/40 | 0 | 🟠lh |
| ✅ | `scripts/atlas/lib` | 100 | 24 | 3703 | 0 | 0/11 | 0 | — |
| ✅ | `scripts/db-tests` | 100 | 8 | 236 | 0 | 0/0 | 0 | — |
| ✅ | `scripts/graphify` | 100 | 6 | 590 | 0 | 0/4 | 0 | — |
| ✅ | `scripts/packets` | 100 | 40 | 8372 | 0 | 0/26 | 0 | — |
| ✅ | `scripts/postgres` | 100 | 2 | 694 | 0 | 0/0 | 0 | — |
| ✅ | `scripts/promotion` | 100 | 14 | 3746 | 0 | 0/10 | 0 | — |
| ✅ | `sveltekit-frontend/scripts/agents/skills` | 100 | 5 | 546 | 0 | 1/1 | 0 | — |
| ✅ | `sveltekit-frontend/scripts/audit` | 100 | 1 | 522 | 0 | 0/1 | 0 | — |
| ✅ | `sveltekit-frontend/scripts/kb` | 100 | 8 | 1020 | 0 | 0/4 | 0 | — |
| ✅ | `sveltekit-frontend/scripts/mapreduce` | 100 | 2 | 549 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/scripts/phase104-backups/src` | 100 | 6 | 243 | 0 | 0/1 | 0 | — |
| ✅ | `sveltekit-frontend/scripts/screenshots` | 100 | 2 | 319 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/src/routes/atlas` | 100 | 2 | 432 | 0 | 0/1 | 0 | ⬜notest |
| ✅ | `sveltekit-frontend/sveltekit-frontend` | 100 | 2 | 2643 | 1 | 1/4 | 1 | 🟠lh |
| ✅ | `sveltekit-frontend/tests/routes` | 100 | 20 | 55577 | 1 | 700/6 | 0 | — |
| ✅ | `sveltekit-frontend/tests/routes/auto` | 100 | 700 | 48931 | 0 | 695/0 | 0 | — |

---

## API Routes (136 total · top 60)

| Route [params] | Methods | Auth | Zod | Error handling |
|----------------|---------|------|-----|----------------|
| `sveltekit-frontend/api/cases/+server.ts` | GET, POST, PATCH, DELETE | ✅ | ✅ | ✅ |
| `sveltekit-frontend/api/cases/+server.ts` | GET, POST, PATCH, DELETE | ✅ | ✅ | ✅ |
| `sveltekit-frontend/api/analytics/deep-research/+server.ts` | GET, POST, DELETE | ✅ | ✅ | ✅ |
| `sveltekit-frontend/api/cases/[id]/authorities/+server.ts [id]` | GET, POST, DELETE | ✅ | ✅ | ✅ |
| `sveltekit-frontend/api/cases/[id]/notes/[noteId]/+server.ts [id, noteId]` | GET, PATCH, DELETE | ✅ | ✅ | ✅ |
| `sveltekit-frontend/api/cases/[id]/persons/+server.ts [id]` | GET, POST, DELETE | ✅ | ✅ | ✅ |
| `sveltekit-frontend/api/citations/[citationId]/tags/+server.ts [citationId]` | GET, POST, DELETE | ✅ | ✅ | ✅ |
| `sveltekit-frontend/api/fictional-cases/[id]/+server.ts [id]` | GET, PATCH, DELETE | ✅ | ✅ | ✅ |
| `sveltekit-frontend/api/library/documents/[documentId]/+server.ts [documentId]` | GET, PUT, DELETE | ✅ | ✅ | ❌ |
| `sveltekit-frontend/api/persons-of-interest/[id]/+server.ts [id]` | GET, PATCH, DELETE | ✅ | ✅ | ✅ |
| `sveltekit-frontend/api/embed/+server.ts` | POST, GET | ✅ | ✅ | ✅ |
| `sveltekit-frontend/api/ace/packets/+server.ts` | POST, GET | ✅ | ✅ | ✅ |
| `sveltekit-frontend/api/admin/observability/+server.ts` | GET, POST | ✅ | ✅ | ✅ |
| `sveltekit-frontend/api/agent/rpc/+server.ts` | POST, GET | ✅ | ❌ | ✅ |
| `sveltekit-frontend/api/ai/policy/+server.ts` | POST, GET | ✅ | ❌ | ✅ |
| `sveltekit-frontend/api/analytics/research-summaries/[id]/+server.ts [id]` | GET, DELETE | ✅ | ❌ | ✅ |
| `sveltekit-frontend/api/cases/[id]/canvas/+server.ts [id]` | POST, GET | ✅ | ✅ | ✅ |
| `sveltekit-frontend/api/cases/[id]/chat/+server.ts [id]` | POST, GET | ✅ | ✅ | ✅ |
| `sveltekit-frontend/api/codebase-index/agents-write/+server.ts` | POST, GET | ✅ | ✅ | ✅ |
| `sveltekit-frontend/api/codebase-index/wiki/+server.ts` | GET, POST | ✅ | ✅ | ✅ |
| `sveltekit-frontend/api/embed/+server.ts` | POST, GET | ✅ | ✅ | ✅ |
| `sveltekit-frontend/api/evidence/[id]/versions/+server.ts [id]` | GET, POST | ✅ | ✅ | ✅ |
| `sveltekit-frontend/api/indexing/queue/+server.ts` | POST, GET | ✅ | ✅ | ✅ |
| `sveltekit-frontend/api/persons-of-interest/[id]/risk/+server.ts [id]` | GET, POST | ✅ | ✅ | ✅ |
| `sveltekit-frontend/api/persons-of-interest/[id]/summary/+server.ts [id]` | GET, POST | ✅ | ✅ | ✅ |
| `sveltekit-frontend/api/recommendations/[userId]/+server.ts [userId]` | GET, POST | ✅ | ✅ | ✅ |
| `sveltekit-frontend/api/reports/preview/[id]/+server.ts [id]` | GET, POST | ✅ | ✅ | ✅ |
| `sveltekit-frontend/api/reports/[id]/export/+server.ts [id]` | GET, POST | ✅ | ✅ | ✅ |
| `sveltekit-frontend/api/reports/[id]/publish/+server.ts [id]` | POST, DELETE | ✅ | ❌ | ✅ |
| `sveltekit-frontend/api/routes/[routeId]/errors/+server.ts [routeId]` | POST, GET | ✅ | ✅ | ✅ |
| `sveltekit-frontend/api/routes/[routeId]/health-event/+server.ts [routeId]` | POST, GET | ✅ | ✅ | ✅ |
| `sveltekit-frontend/api/routes/[routeId]/interactions/+server.ts [routeId]` | POST, GET | ✅ | ✅ | ✅ |
| `sveltekit-frontend/api/simulation/[sessionId]/keyframes/+server.ts [sessionId]` | GET, POST | ✅ | ✅ | ✅ |
| `sveltekit-frontend/api/tasks/agent-pickup/+server.ts` | GET, POST | ✅ | ✅ | ✅ |
| `sveltekit-frontend/api/tasks/hmm-diagnosis/+server.ts` | GET, POST | ❌ | ✅ | ✅ |
| `sveltekit-frontend/api/tasks/packets/+server.ts` | GET, POST | ✅ | ✅ | ✅ |
| `sveltekit-frontend/api/tasks/packets/workflow/+server.ts` | GET, POST | ✅ | ✅ | ✅ |
| `sveltekit-frontend/api/tasks/[id]/+server.ts [id]` | PATCH, DELETE | ✅ | ✅ | ✅ |
| `sveltekit-frontend/api/hyperrag/packet-rpc/+server.ts` | POST | ✅ | ✅ | ✅ |
| `sveltekit-frontend/.well-known/llms-full.txt/+server.ts` | GET | ❌ | ✅ | ✅ |
| `sveltekit-frontend/.well-known/llms.txt/+server.ts` | GET | ❌ | ✅ | ✅ |
| `sveltekit-frontend/api/ace/stage-5-policy/+server.ts` | POST | ✅ | ✅ | ✅ |
| `sveltekit-frontend/api/admin/ai-chat/[sessionId]/+server.ts [sessionId]` | GET | ✅ | ❌ | ❌ |
| `sveltekit-frontend/api/admin/atlas/hyperrag/+server.ts` | POST | ✅ | ✅ | ✅ |
| `sveltekit-frontend/api/admin/atlas/query/+server.ts` | POST | ✅ | ✅ | ✅ |
| `sveltekit-frontend/api/agent/rpc/test/+server.ts` | GET | ✅ | ✅ | ✅ |
| `sveltekit-frontend/api/agents/chat/+server.ts` | POST | ✅ | ✅ | ✅ |
| `sveltekit-frontend/api/ai/agent/+server.ts` | POST | ✅ | ✅ | ✅ |
| `sveltekit-frontend/api/ai/analyze/[scope]/+server.ts [scope]` | POST | ✅ | ✅ | ✅ |
| `sveltekit-frontend/api/ai/analyze-evidence/+server.ts` | POST | ✅ | ✅ | ✅ |
| `sveltekit-frontend/api/ai/ask/+server.ts` | POST | ✅ | ✅ | ✅ |
| `sveltekit-frontend/api/ai/bifrost/+server.ts` | POST | ✅ | ✅ | ✅ |
| `sveltekit-frontend/api/ai/case-prediction/+server.ts` | POST | ✅ | ✅ | ✅ |
| `sveltekit-frontend/api/ai/chat/stream/+server.ts` | POST | ✅ | ✅ | ✅ |
| `sveltekit-frontend/api/ai/chat-direct/+server.ts` | POST | ✅ | ✅ | ✅ |
| `sveltekit-frontend/api/ai/contextual-chat/+server.ts` | POST | ✅ | ✅ | ✅ |
| `sveltekit-frontend/api/ai/cross-exam/+server.ts` | POST | ✅ | ✅ | ✅ |
| `sveltekit-frontend/api/ai/error-agent/+server.ts` | POST | ✅ | ✅ | ✅ |
| `sveltekit-frontend/api/ai/generate-report/[scope]/+server.ts [scope]` | POST | ✅ | ✅ | ✅ |
| `sveltekit-frontend/api/ai/judge/+server.ts` | POST | ✅ | ✅ | ✅ |

_…and 76 more. See `codebase-graph.json` for full list._

---

## G4 — API Routes Missing Auth Guard (6)
- `sveltekit-frontend/src/routes/api/atlas/index-doc/+server.ts` · POST
- `sveltekit-frontend/src/routes/api/atlas/phase-e/health/+server.ts` · GET
- `sveltekit-frontend/src/routes/api/atlas/search/+server.ts` · POST
- `sveltekit-frontend/src/routes/api/mcp/select-tools/+server.ts` · POST
- `sveltekit-frontend/src/routes/api/search/rrf/+server.ts` · POST
- `sveltekit-frontend/src/routes/api/tasks/hmm-diagnosis/+server.ts` · GET/POST

---

## G5 — API Routes Missing Zod Validation (2)
- `sveltekit-frontend/src/routes/api/agent/rpc/+server.ts` · POST/GET
- `sveltekit-frontend/src/routes/api/ai/policy/+server.ts` · POST/GET

---

## G14 — Svelte 4 Legacy Patterns (28 files)
- `.claude/worktrees/agent-a38668f2/src/routes/admin/cache/+page.svelte` · export-let
- `.claude/worktrees/agent-a38668f2/src/routes/atlas/studio/+page.svelte` · on:event
- `.claude/worktrees/agent-a38668f2/sveltekit-frontend/temp_upload.svelte` · on:event
- `.claude/worktrees/agent-a38668f2/sveltekit-frontend/test-errors-validation.svelte` · $:reactive, on:event
- `.claude/worktrees/agent-a38668f2/sveltekit-frontend/test-errors.svelte` · $:reactive
- `.claude/worktrees/agent-a38668f2/src/routes/admin/cache/+page.svelte` · export-let
- `.claude/worktrees/agent-a38668f2/src/routes/atlas/studio/+page.svelte` · on:event
- `.claude/worktrees/agent-a38668f2/sveltekit-frontend/temp_upload.svelte` · on:event
- `.claude/worktrees/agent-a38668f2/sveltekit-frontend/test-errors-validation.svelte` · $:reactive, on:event
- `.claude/worktrees/agent-a38668f2/sveltekit-frontend/test-errors.svelte` · $:reactive
- `.claude/worktrees/agent-a38668f2/src/routes/admin/cache/+page.svelte` · export-let
- `.claude/worktrees/agent-a38668f2/src/routes/atlas/studio/+page.svelte` · on:event
- `.claude/worktrees/agent-a38668f2/sveltekit-frontend/temp_upload.svelte` · on:event
- `.claude/worktrees/agent-a38668f2/sveltekit-frontend/test-errors-validation.svelte` · $:reactive, on:event
- `.claude/worktrees/agent-a38668f2/sveltekit-frontend/test-errors.svelte` · $:reactive
- `.claude/worktrees/agent-a38668f2/src/routes/admin/cache/+page.svelte` · export-let
- `.claude/worktrees/agent-a38668f2/src/routes/atlas/studio/+page.svelte` · on:event
- `.claude/worktrees/agent-a38668f2/sveltekit-frontend/temp_upload.svelte` · on:event
- `.claude/worktrees/agent-a38668f2/sveltekit-frontend/test-errors-validation.svelte` · $:reactive, on:event
- `.claude/worktrees/agent-a38668f2/sveltekit-frontend/test-errors.svelte` · $:reactive

---

## G15 — SSR-Unsafe Globals (0 files · unguarded window/document/localStorage)
_No unguarded SSR-unsafe globals. ✅_

---

## G16 — Routes Without Test Pairing (35)
- `sveltekit-frontend/src/routes/api/admin/ai-chat/[sessionId]/+server.ts` · GET
- `sveltekit-frontend/src/routes/api/agent/rpc/test/+server.ts` · GET
- `sveltekit-frontend/src/routes/api/ai/analyze/[scope]/+server.ts` · POST
- `sveltekit-frontend/src/routes/api/ai/generate-report/[scope]/+server.ts` · POST
- `sveltekit-frontend/src/routes/api/analytics/research-summaries/[id]/+server.ts` · GET/DELETE
- `sveltekit-frontend/src/routes/api/atlas/cards/[id]/+server.ts` · GET
- `sveltekit-frontend/src/routes/api/atlas/memory-address/[source_ref_id]/+server.ts` · GET
- `sveltekit-frontend/src/routes/api/audio/analysis/[evidenceId]/+server.ts` · GET
- `sveltekit-frontend/src/routes/api/canon/chunks/[chunkId]/+server.ts` · GET
- `sveltekit-frontend/src/routes/api/cases/[id]/notes/[noteId]/+server.ts` · GET/PATCH/DELETE
- `sveltekit-frontend/src/routes/api/code-intel/clusters/[clusterKey]/+server.ts` · GET
- `sveltekit-frontend/src/routes/api/code-intel/research-provenance/[id]/+server.ts` · GET
- `sveltekit-frontend/src/routes/api/code-intel/retrieval-runs/[id]/+server.ts` · GET
- `sveltekit-frontend/src/routes/api/code-intel/topology/node/[stableKey]/+server.ts` · GET
- `sveltekit-frontend/src/routes/api/document/analysis/[evidenceId]/+server.ts` · GET
- `sveltekit-frontend/src/routes/api/evidence/tags/[id]/+server.ts` · GET
- `sveltekit-frontend/src/routes/api/fictional-cases/[id]/+server.ts` · GET/PATCH/DELETE
- `sveltekit-frontend/src/routes/api/files/[id]/+server.ts` · DELETE
- `sveltekit-frontend/src/routes/api/hypergraph/edge/[id]/+server.ts` · GET
- `sveltekit-frontend/src/routes/api/knowledge/document/[id]/+server.ts` · GET
- `sveltekit-frontend/src/routes/api/library/document/[id]/node/[nodeId]/+server.ts` · GET
- `sveltekit-frontend/src/routes/api/library/documents/[documentId]/+server.ts` · GET/PUT/DELETE
- `sveltekit-frontend/src/routes/api/library/ingest/[jobId]/+server.ts` · GET
- `sveltekit-frontend/src/routes/api/persons-of-interest/[id]/+server.ts` · GET/PATCH/DELETE
- `sveltekit-frontend/src/routes/api/persons-of-interest/[id]/associates/[associateId]/+server.ts` · DELETE
- `sveltekit-frontend/src/routes/api/phase89/related/[id]/+server.ts` · GET
- `sveltekit-frontend/src/routes/api/pipeline/status/[jobId]/+server.ts` · GET
- `sveltekit-frontend/src/routes/api/recommendations/jobs/[jobId]/+server.ts` · GET
- `sveltekit-frontend/src/routes/api/recommendations/[userId]/+server.ts` · GET/POST
- `sveltekit-frontend/src/routes/api/reports/preview/[id]/+server.ts` · GET/POST

---

## G11 — Hardcoded Localhost References (2951 files)
- `.claude/worktrees/agent-a38668f2/ecosystem.dev.config.cjs` · http://localhost:11434
- `.claude/worktrees/agent-a38668f2/ecosystem.prod.config.cjs` · http://localhost:11434
- `.claude/worktrees/agent-a38668f2/playwright.config.js` · http://localhost:5173, http://localhost:5173
- `.claude/worktrees/agent-a38668f2/playwright.dev.config.js` · http://localhost:5173
- `.claude/worktrees/agent-a38668f2/scripts/ace-startup-health.mjs` · http://localhost:5173
- `.claude/worktrees/agent-a38668f2/scripts/agent/turbovec-search-memory.mjs` · http://127.0.0.1:11434
- `.claude/worktrees/agent-a38668f2/scripts/agentic/atlas-langgraph-startup.mjs` · http://localhost:6333, http://localhost:7474
- `.claude/worktrees/agent-a38668f2/scripts/ai/cache_startup_prompt.mjs` · http://localhost:5173
- `.claude/worktrees/agent-a38668f2/scripts/ai/embed_and_index_scenarios.mjs` · http://127.0.0.1:6333, http://localhost:5173
- `.claude/worktrees/agent-a38668f2/scripts/ai/index_scenarios.mjs` · http://localhost:5173
- `.claude/worktrees/agent-a38668f2/scripts/atlas/archive-to-couchdb.mjs` · http://localhost:5984
- `.claude/worktrees/agent-a38668f2/scripts/atlas/atlas-live-reconciliation-audit.mjs` · http://127.0.0.1:5173, http://127.0.0.1:7474
- `.claude/worktrees/agent-a38668f2/scripts/atlas/atlas-startup-intelligence.mjs` · http://localhost:6333
- `.claude/worktrees/agent-a38668f2/scripts/atlas/audit-parent-atlas-consistency.mjs` · http://127.0.0.1:6333
- `.claude/worktrees/agent-a38668f2/scripts/atlas/audit-proto-registry.mjs` · http://localhost:6333, http://127.0.0.1:5173
- `.claude/worktrees/agent-a38668f2/scripts/atlas/audit-transport-pressure.mjs` · http://127.0.0.1:8791
- `.claude/worktrees/agent-a38668f2/scripts/atlas/backfill-atlas-source-refs-via-qdrant.mjs` · http://localhost:6333
- `.claude/worktrees/agent-a38668f2/scripts/atlas/backfill-som-community-id.mjs` · http://localhost:6333
- `.claude/worktrees/agent-a38668f2/scripts/atlas/batch-offline-ingest.mjs` · http://localhost:6333, http://localhost:8090
- `.claude/worktrees/agent-a38668f2/scripts/atlas/bench-inference-backends.mjs` · http://127.0.0.1:8090, http://localhost:11434

---

## G18 — Deep Route Paths (parameterised, sorted by depth)

| Route [params] | Depth | Params | Methods |
|----------------|-------|--------|---------|
| `sveltekit-frontend/api/cases/[id]/notes/[noteId]/versions/+server.ts` | 9 | `[id] [noteId]` | GET |
| `sveltekit-frontend/api/library/document/[id]/node/[nodeId]/+server.ts` | 9 | `[id] [nodeId]` | GET |
| `sveltekit-frontend/(app)/command-center/codebase/clusters/[id]/+page.server.ts` | 8 | `[id]` |  |
| `sveltekit-frontend/(app)/command-center/codebase/components/[id]/+page.server.ts` | 8 | `[id]` |  |
| `sveltekit-frontend/(app)/library/[documentId]/node/[nodeId]/+page.server.ts` | 8 | `[documentId] [nodeId]` |  |
| `sveltekit-frontend/api/cases/[id]/notes/[noteId]/+server.ts` | 8 | `[id] [noteId]` | GET, PATCH, DELETE |
| `sveltekit-frontend/api/code-intel/clusters/[clusterKey]/lenses/+server.ts` | 8 | `[clusterKey]` | GET |
| `sveltekit-frontend/api/code-intel/topology/node/[stableKey]/+server.ts` | 8 | `[stableKey]` | GET |
| `sveltekit-frontend/api/library/document/[id]/toc/+server.ts` | 8 | `[id]` | GET |
| `sveltekit-frontend/api/persons-of-interest/[id]/associates/[associateId]/+server.ts` | 8 | `[id] [associateId]` | DELETE |
| `sveltekit-frontend/api/phase89/node/[id]/docs/+server.ts` | 8 | `[id]` | GET |
| `sveltekit-frontend/api/phase89/node/[id]/similar/+server.ts` | 8 | `[id]` | GET |
| `sveltekit-frontend/(app)/cases/[id]/notes/+page.server.ts` | 7 | `[id]` |  |
| `sveltekit-frontend/(app)/cases/[id]/overview/+page.server.ts` | 7 | `[id]` |  |
| `sveltekit-frontend/(app)/cases/[id]/reports/+page.server.ts` | 7 | `[id]` |  |
| `sveltekit-frontend/(app)/evidence/[id]/view/+page.server.ts` | 7 | `[id]` |  |
| `sveltekit-frontend/(app)/library/[documentId]/reader/+page.server.ts` | 7 | `[documentId]` |  |
| `sveltekit-frontend/api/admin/ai-chat/[sessionId]/+server.ts` | 7 | `[sessionId]` | GET |
| `sveltekit-frontend/api/ai/analyze/[scope]/+server.ts` | 7 | `[scope]` | POST |
| `sveltekit-frontend/api/ai/generate-report/[scope]/+server.ts` | 7 | `[scope]` | POST |
| `sveltekit-frontend/api/analytics/research-summaries/[id]/+server.ts` | 7 | `[id]` | GET, DELETE |
| `sveltekit-frontend/api/atlas/cards/[id]/+server.ts` | 7 | `[id]` | GET |
| `sveltekit-frontend/api/atlas/memory-address/[source_ref_id]/+server.ts` | 7 | `[source_ref_id]` | GET |
| `sveltekit-frontend/api/audio/analysis/[evidenceId]/+server.ts` | 7 | `[evidenceId]` | GET |
| `sveltekit-frontend/api/canon/chunks/[chunkId]/+server.ts` | 7 | `[chunkId]` | GET |
| `sveltekit-frontend/api/cases/[id]/authorities/+server.ts` | 7 | `[id]` | GET, POST, DELETE |
| `sveltekit-frontend/api/cases/[id]/canvas/+server.ts` | 7 | `[id]` | POST, GET |
| `sveltekit-frontend/api/cases/[id]/chat/+server.ts` | 7 | `[id]` | POST, GET |
| `sveltekit-frontend/api/cases/[id]/persons/+server.ts` | 7 | `[id]` | GET, POST, DELETE |
| `sveltekit-frontend/api/cases/[id]/similar/+server.ts` | 7 | `[id]` | GET |

---

## G19 — Top Module Fan-In (most imported `$lib` paths)
| Module | Import Count |
|--------|-------------|
| `$lib/server/db/client` | 3653 |
| `$lib/server/env.server.js` | 2991 |
| `$lib/server/redis.js` | 1975 |
| `$lib/types` | 1557 |
| `$lib/components/ui/Icon.svelte` | 1543 |
| `$lib/server/ollama.js` | 1088 |
| `$lib/server/db/schema-postgres.js` | 1016 |
| `$lib/server/middleware/cache-headers.js` | 660 |
| `$lib/server/vector/qdrant-manager.js` | 587 |
| `$lib/server/grpc/embedding-client.js` | 564 |
| `$lib/server/validation.js` | 564 |
| `$lib/components/ui/Button.svelte` | 547 |
| `$lib/server/db/schema-postgres` | 442 |
| `$lib/server/db/schema` | 422 |
| `$lib/server/db` | 326 |
| `$lib/server/observability/langfuse.js` | 276 |
| `$lib/server/redis` | 270 |
| `$lib/server/db/client.js` | 261 |
| `$lib/server/db/schema.js` | 257 |
| `$lib/server/gpu/simdjson-bridge.js` | 252 |

---

## G20 — Cyclic Import Pairs (3 found · top 20)
- `claude-mem/src/shared/paths.ts` ↔ `claude-mem/src/utils/logger.ts`
- `llama-cpp-turboquant-gemma4/tools/server/webui/src/lib/components/ui/dialog/index.ts` ↔ `llama-cpp-turboquant-gemma4/tools/server/webui/src/lib/components/ui/dialog/dialog-content.svelte`
- `llama-cpp-turboquant-gemma4/tools/server/webui/src/lib/components/ui/scroll-area/index.ts` ↔ `llama-cpp-turboquant-gemma4/tools/server/webui/src/lib/components/ui/scroll-area/scroll-area.svelte`

---

## Svelte Components (60 shown of 5719)
| File | Sub-components | Key `$lib` Imports |
|------|---------------|---------------------|
| `.claude/worktrees/agent-a38668f2/src/routes/admin/cache/+page.svelte` |  | $lib/types/gpu-metrics |
| `.claude/worktrees/agent-a38668f2/src/routes/atlas/studio/+page.svelte` |  |  |
| `.claude/worktrees/agent-a38668f2/sveltekit-frontend/src/lib/client/ui/POIPhotoModal.svelte` | POIPhotoModalImpl | $lib/components/POIPhotoModal.svelte |
| `.claude/worktrees/agent-a38668f2/sveltekit-frontend/src/lib/client/ui/POIPhotoUploader.svelte` | Button |  |
| `.claude/worktrees/agent-a38668f2/sveltekit-frontend/src/lib/components/ActionPopup.svelte` |  |  |
| `.claude/worktrees/agent-a38668f2/sveltekit-frontend/src/lib/components/admin/AdminChatAssistant.svelte` | HTMLElement | $lib/utils/xstate-svelte5.svelte.js, $lib/stores/admin-chat-machine.js |
| `.claude/worktrees/agent-a38668f2/sveltekit-frontend/src/lib/components/admin/AdminMonitoringDashboard.svelte` | Icon | $lib/components/ui/Icon.svelte |
| `.claude/worktrees/agent-a38668f2/sveltekit-frontend/src/lib/components/admin/AiAnalysisPopup.svelte` | AiAnalysisPopup | $lib/components/admin/AiAnalysisPopup.svelte, $lib/stores/admin-chat-assistant.svelte.js, $lib/stores/admin-chat-assistant.svelte.js |
| `.claude/worktrees/agent-a38668f2/sveltekit-frontend/src/lib/components/admin/BundlePreview.svelte` | BundleResponse |  |
| `.claude/worktrees/agent-a38668f2/sveltekit-frontend/src/lib/components/admin/CommandSuggestPanel.svelte` |  |  |
| `.claude/worktrees/agent-a38668f2/sveltekit-frontend/src/lib/components/admin/ContextualAssistantModal.svelte` |  | $lib/utils/xstate-svelte5.svelte.js, $lib/stores/admin-chat-machine.js, $lib/utils/ui-recon.js |
| `.claude/worktrees/agent-a38668f2/sveltekit-frontend/src/lib/components/admin/EvidenceDataGrid.svelte` |  |  |
| `.claude/worktrees/agent-a38668f2/sveltekit-frontend/src/lib/components/admin/EvidenceDrawer.svelte` |  |  |
| `.claude/worktrees/agent-a38668f2/sveltekit-frontend/src/lib/components/admin/PipelineProgress.svelte` |  |  |
| `.claude/worktrees/agent-a38668f2/sveltekit-frontend/src/lib/components/admin/RoutingExplanationPanel.svelte` |  | $lib/server/retrieval/routing-explanation |
| `.claude/worktrees/agent-a38668f2/sveltekit-frontend/src/lib/components/admin/SourceProvenancePanel.svelte` |  |  |
| `.claude/worktrees/agent-a38668f2/sveltekit-frontend/src/lib/components/admin/SummarizeButton.svelte` | SummarizeButton | $lib/stores/admin-chat-assistant.svelte.js |
| `.claude/worktrees/agent-a38668f2/sveltekit-frontend/src/lib/components/admin/TagSelector.svelte` |  |  |
| `.claude/worktrees/agent-a38668f2/sveltekit-frontend/src/lib/components/admin/TraceCopilotPanel.svelte` | HTMLDivElement, RoutingExplanationPanel, SourceProvenancePanel, CommandSuggestPanel |  |
| `.claude/worktrees/agent-a38668f2/sveltekit-frontend/src/lib/components/agent/AutonomousInvestigator.svelte` | InvestigationResult, AgentCapabilities, Icon, Button | $lib/components/ui/Icon.svelte, $lib/components/ui/Button.svelte |
| `.claude/worktrees/agent-a38668f2/sveltekit-frontend/src/lib/components/agentic/AgentChat.svelte` |  | $lib/types/agent.js |
| `.claude/worktrees/agent-a38668f2/sveltekit-frontend/src/lib/components/agentic/AgenticController.svelte` | AgenticStatus, File |  |
| `.claude/worktrees/agent-a38668f2/sveltekit-frontend/src/lib/components/ai/ACEContextBubble.svelte` |  |  |
| `.claude/worktrees/agent-a38668f2/sveltekit-frontend/src/lib/components/ai/AIAssistantButton.svelte` | Badge | $lib/components/ui/badge/Badge.svelte, $lib/utils |
| `.claude/worktrees/agent-a38668f2/sveltekit-frontend/src/lib/components/ai/AIAssistantPanel.svelte` | Button | $lib/components/ui/Button.svelte, $lib/stores/unified/ai-assistant-store.svelte.js |
| `.claude/worktrees/agent-a38668f2/sveltekit-frontend/src/lib/components/ai/AIButton.svelte` | HTMLButtonElement |  |
| `.claude/worktrees/agent-a38668f2/sveltekit-frontend/src/lib/components/ai/AIChatWidget.svelte` | Button, Icon, SimpleWorkingChat | $lib/components/ui/Button.svelte, $lib/components/ui/Icon.svelte |
| `.claude/worktrees/agent-a38668f2/sveltekit-frontend/src/lib/components/ai/AIRecommendation.svelte` | Icon | $lib/ai/client-cache.js, $lib/components/ui/Icon.svelte |
| `.claude/worktrees/agent-a38668f2/sveltekit-frontend/src/lib/components/ai/AIStatusIndicator.svelte` |  |  |
| `.claude/worktrees/agent-a38668f2/sveltekit-frontend/src/lib/components/ai/AskAI.svelte` | HTMLTextAreaElement, HTMLDivElement |  |
| `.claude/worktrees/agent-a38668f2/sveltekit-frontend/src/lib/components/ai/AuditResults.svelte` | Icon, Button | $lib/components/ui/Icon.svelte, $lib/components/ui/Button.svelte |
| `.claude/worktrees/agent-a38668f2/sveltekit-frontend/src/lib/components/ai/AutomatedLegalResearch.svelte` |  |  |
| `.claude/worktrees/agent-a38668f2/sveltekit-frontend/src/lib/components/ai/BifrostProgressCanvas.svelte` |  | $lib/state/ai-os-state.svelte |
| `.claude/worktrees/agent-a38668f2/sveltekit-frontend/src/lib/components/ai/CachePerformanceDashboard.svelte` |  |  |
| `.claude/worktrees/agent-a38668f2/sveltekit-frontend/src/lib/components/ai/CaseScoringDashboard/CaseScoringDashboard.svelte` |  |  |
| `.claude/worktrees/agent-a38668f2/sveltekit-frontend/src/lib/components/ai/CaseScoringDashboard.svelte` | Icon | $lib/components/ui/Icon.svelte |
| `.claude/worktrees/agent-a38668f2/sveltekit-frontend/src/lib/components/ai/ChatFeedback.svelte` | Icon | $lib/components/ui/Icon.svelte |
| `.claude/worktrees/agent-a38668f2/sveltekit-frontend/src/lib/components/ai/ChatMessage.svelte` | HTMLDivElement, FeedbackButtons, Button | $lib/components/ui/Button.svelte, $lib/components/ui/FeedbackButtons.svelte |
| `.claude/worktrees/agent-a38668f2/sveltekit-frontend/src/lib/components/ai/ClientSideAIChat.svelte` | Badge |  |
| `.claude/worktrees/agent-a38668f2/sveltekit-frontend/src/lib/components/ai/ContextualChatDemo.svelte` | ContextualState | $lib/types/sharedTypes |
| `.claude/worktrees/agent-a38668f2/sveltekit-frontend/src/lib/components/ai/ContextualEvidenceChatModal.svelte` | File, FeedbackButtons | $lib/types/sharedTypes, $lib/components/ui/FeedbackButtons.svelte |
| `.claude/worktrees/agent-a38668f2/sveltekit-frontend/src/lib/components/ai/DeedAnalysis.svelte` | Icon | $lib/components/ui/Icon.svelte |
| `.claude/worktrees/agent-a38668f2/sveltekit-frontend/src/lib/components/ai/DocumentUploadSimulator.svelte` | Icon, Button | $lib/components/ui/Icon.svelte, $lib/components/ui/Button.svelte |
| `.claude/worktrees/agent-a38668f2/sveltekit-frontend/src/lib/components/ai/EnhancedAIChatTest.svelte` | DialogRoot, Button, DialogOverlay, DialogContent | $lib/types, $lib/types, $lib/components/ui/dialog |
| `.claude/worktrees/agent-a38668f2/sveltekit-frontend/src/lib/components/ai/EnhancedDocumentUploader.svelte` | UploadFile, HTMLInputElement, HTMLDivElement, Progress | $lib/components/ui/Button.svelte, $lib/components/ui/Progress.svelte |
| `.claude/worktrees/agent-a38668f2/sveltekit-frontend/src/lib/components/ai/EnhancedFileUpload.svelte` | WebSocket | $lib/types, $lib/machines/uploadMachine, $lib/types/upload |
| `.claude/worktrees/agent-a38668f2/sveltekit-frontend/src/lib/components/ai/EnhancedInlineEditor.svelte` | HTMLDivElement |  |
| `.claude/worktrees/agent-a38668f2/sveltekit-frontend/src/lib/components/ai/EnhancedLegalAIChatWithSynthesis.svelte` | Date, Button, TypewriterResponse | $lib/components/ui/Button.svelte, $lib/components/ui/Icon.svelte, $lib/utils/ollama |
| `.claude/worktrees/agent-a38668f2/sveltekit-frontend/src/lib/components/ai/FloatingChatModal.svelte` | File, HTMLElement | $lib/models/ChatSession.svelte.js |
| `.claude/worktrees/agent-a38668f2/sveltekit-frontend/src/lib/components/ai/GamingAIButton.svelte` |  | $lib/components/ui/Icon.svelte |
| `.claude/worktrees/agent-a38668f2/sveltekit-frontend/src/lib/components/ai/Gemma270MWebAssembly.svelte` | File, Float32Array | $lib/ai/client-embed.js, $lib/ai/onnx/session.js, $lib/ai/client-cache.js |
| `.claude/worktrees/agent-a38668f2/sveltekit-frontend/src/lib/components/ai/GPUAIAssistant.svelte` | Icon, Button | $lib/components/ui/Icon.svelte, $lib/components/ui/Button.svelte |
| `.claude/worktrees/agent-a38668f2/sveltekit-frontend/src/lib/components/ai/IntelligentModelOrchestrator.svelte` |  |  |
| `.claude/worktrees/agent-a38668f2/sveltekit-frontend/src/lib/components/ai/LegalDocumentDrafting.svelte` | DocCategory, Icon, Button | $lib/components/ui/Icon.svelte, $lib/components/ui/Button.svelte |
| `.claude/worktrees/agent-a38668f2/sveltekit-frontend/src/lib/components/ai/LegalDocumentSummarizer.svelte` | SummarizationResponse, Button | $lib/components/ui/card/Card.svelte, $lib/components/ui/card/CardHeader.svelte, $lib/components/ui/card/CardTitle.svelte |
| `.claude/worktrees/agent-a38668f2/sveltekit-frontend/src/lib/components/ai/LLMSelector.svelte` | Icon, Button | $lib/components/ui/Icon.svelte, $lib/components/ui/Button.svelte, $lib/utils/ollama |
| `.claude/worktrees/agent-a38668f2/sveltekit-frontend/src/lib/components/ai/LocalImageGenerator.svelte` | ImageResult, Icon, Button | $lib/components/ui/Icon.svelte, $lib/components/ui/Button.svelte |
| `.claude/worktrees/agent-a38668f2/sveltekit-frontend/src/lib/components/ai/ProactiveAIAssistant.svelte` | Icon | $lib/components/ui/Icon.svelte |
| `.claude/worktrees/agent-a38668f2/sveltekit-frontend/src/lib/components/ai/QLoRAMonitoringDashboard.svelte` | TrainingStatus, Icon, Button | $lib/components/ui/Icon.svelte, $lib/components/ui/Button.svelte |
| `.claude/worktrees/agent-a38668f2/sveltekit-frontend/src/lib/components/ai/RAGAssistantChat.svelte` | HTMLDivElement, Icon | $lib/components/ui/Icon.svelte, $lib/utils |

---

## Top External Module Imports
| Module | Consumer Count |
|--------|----------------|
| `@sveltejs/kit` | 7694 |
| `node:path` | 6801 |
| `node:fs` | 5707 |
| `vitest` | 5584 |
| `node:url` | 4910 |
| `path` | 4759 |
| `zod` | 3941 |
| `fs` | 3570 |
| `pg` | 3474 |
| `drizzle-orm` | 3304 |
| `$lib/server/db/client` | 2837 |
| `$lib/server/env.server.js` | 2774 |
| `node:crypto` | 1983 |
| `ioredis` | 1800 |
| `url` | 1694 |
| `crypto` | 1642 |
| `svelte` | 1568 |
| `dotenv` | 1567 |
| `$lib/types` | 1557 |
| `$lib/components/ui/Icon.svelte` | 1543 |
| `node:child_process` | 1539 |
| `$lib/server/redis.js` | 1405 |
| `node:fs/promises` | 1205 |
| `fs/promises` | 1168 |
| `@playwright/test` | 1003 |
| `drizzle-orm/pg-core` | 973 |
| `$lib/server/ollama.js` | 956 |
| `$lib/server/db/schema-postgres.js` | 884 |
| `child_process` | 872 |
| `$app/environment` | 768 |

---

## Directories with TODO/FIXME
- `scripts/api-cleanup/reports` — 668 marker(s), score 45
- `scripts/api-cleanup/reports/backup-2025-12-14T20-51-26-276Z` — 664 marker(s), score 45
- `.claude/worktrees/agent-a38668f2` — 363 marker(s), score 100
- `.claude/worktrees/agent-a38668f2/sveltekit-frontend` — 305 marker(s), score 100
- `docker/langgraph-synthesis/.venv/Lib` — 44 marker(s), score 65
- `.claude/worktrees/agent-a38668f2/scripts` — 42 marker(s), score 100
- `scripts/atlas` — 18 marker(s), score 100
- `.claude/worktrees/agent-a38668f2/src` — 16 marker(s), score 51
- `scripts/verify` — 8 marker(s), score 70
- `.claude/worktrees/agent-a87590c9` — 5 marker(s), score 100
- `scripts/api-cleanup/reports/backup-2025-12-14T21-11-49-641Z` — 4 marker(s), score 72
- `sveltekit-frontend/drizzle` — 4 marker(s), score 85
- `sveltekit-frontend/drizzle/introspected` — 4 marker(s), score 85
- `.claude/worktrees/agent-a87590c9/sveltekit-frontend` — 4 marker(s), score 100
- `llama-cpp-turboquant-gemma4/tools/server` — 3 marker(s), score 70

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
