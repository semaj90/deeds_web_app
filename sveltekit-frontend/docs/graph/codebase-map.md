# Codebase Map — 20-Gate Deep Audit
> Generated: 2026-06-13T22:33:35.326Z
> Mode: `fast-ast` · CPU-only · No GPU required
> Regenerate: `npm run index:codebase:fast:plan`

---

## Summary
| Metric | Count |
|--------|-------|
| Files scanned | 40553 |
| Directories analysed | 815 |
| Route files | 3026 |
| Svelte components | 2743 |
| API handlers | 4785 |
| API routes without auth | 17 |
| API routes without Zod | 3 |
| SSR-unsafe files | 0 |
| Svelte 4 legacy patterns | 13 |
| Hardcoded localhost refs | 1521 |
| Routes without test pairing | 208 |
| Cyclic import pairs | 1 |
| Drizzle table refs | 2964 |
| TODO/FIXME markers | 904 |

---

## 20-Gate Audit Summary

| Gate | Check | Pass | Fail |
|------|-------|------|------|
| G4  | Auth guard on API routes | 2295 | 18 |
| G5  | Zod validation on API routes | 1634 | 3 |
| G11 | No hardcoded localhost (excl env.server) | 39032 | 1521 |
| G14a | No `export let` (Svelte 4 props) | 40551 | 2 |
| G14b | No `$:` reactive declarations | 40547 | 6 |
| G14c | No `on:event=` directives | 40545 | 8 |
| G14d | No `createEventDispatcher()` | 40553 | 0 |
| G14e | No runes in plain `.ts` files | 40509 | 44 |
| G15 | No SSR-unsafe globals (unguarded) | 40553 | 0 |
| G16 | Server routes have test pairing | 1933 | 208 |
| G17 | Server routes have error handling | 2032 | 320 |
| G20 | Cyclic import pairs | — | 1 |

---

## Directory Scorecard (815 dirs · lowest score = most attention needed)

**Score factors**: Auth/API coverage 25pts · Zod coverage 15pts · Drizzle ref 10pts · No TODOs 15pts · SSR-safe 10pts · No Svelte4 10pts · No localhost 5pts · Error handling 5pts · Non-empty 5pts

**Flags**: 🔴ssr = SSR-unsafe globals · 🟡sv4 = Svelte4 legacy · 🟠lh = localhost hardcoded · ⬜notest = routes lack tests


| Status | Directory | Score | Files | Lines | APIs | Auth/Zod | TODOs | Flags |
|--------|-----------|-------|-------|-------|------|----------|-------|-------|
| ⚠️ | `scripts/api-cleanup` | 45 | 80 | 210624 | 2458 | 262/392 | 672 | 🟠lh |
| ⚠️ | `scripts/api-cleanup/reports` | 45 | 8 | 191504 | 2442 | 262/384 | 668 | 🟠lh |
| ⚠️ | `scripts/api-cleanup/reports/backup-2025-12-14T20-51-26-276Z` | 45 | 2610 | 180612 | 2436 | 258/380 | 664 | 🟠lh |
| ⚠️ | `src/routes/api/atlas` | 50 | 8 | 466 | 8 | 0/0 | 0 | ⬜notest |
| ⚠️ | `sveltekit-frontend/src/routes/.well-known` | 58 | 12 | 1518 | 12 | 0/6 | 0 | — |
| ⚠️ | `src/routes/api/ace` | 60 | 2 | 64 | 2 | 0/2 | 0 | — |
| ⚠️ | `docker/langgraph-synthesis/.venv/Lib` | 65 | 60 | 300052 | 0 | 0/4 | 44 | 🔴ssr |
| ✅ | `.claude/worktrees/agent-a7203461/src` | 70 | 12 | 532 | 4 | 2/2 | 0 | 🟡sv4 |
| ✅ | `scripts/api-cleanup/reports/backup-2025-12-14T21-11-49-641Z` | 72 | 6 | 224 | 6 | 4/4 | 4 | — |
| ✅ | `sveltekit-frontend/src/lib/workers` | 75 | 30 | 5619 | 0 | 0/3 | 6 | — |
| ✅ | `sveltekit-frontend/src/routes/api` | 76 | 2022 | 294631 | 2004 | 1981/1564 | 3 | 🟠lh ⬜notest |
| ✅ | `src/routes/atlas/studio` | 80 | 2 | 260 | 0 | 0/0 | 0 | 🟡sv4 |
| ✅ | `scripts/benchmark` | 83 | 2 | 774 | 0 | 0/2 | 2 | — |
| ✅ | `scripts/ai` | 85 | 16 | 1428 | 0 | 0/16 | 0 | 🟠lh |
| ✅ | `scripts/atlas/ingester` | 85 | 38 | 3802 | 0 | 0/24 | 0 | 🟠lh |
| ✅ | `scripts/audit` | 85 | 6 | 2052 | 0 | 0/2 | 0 | 🟠lh |
| ✅ | `scripts/graph` | 85 | 14 | 2976 | 0 | 0/10 | 0 | 🟠lh |
| ✅ | `scripts/operator` | 85 | 8 | 1788 | 0 | 0/4 | 0 | 🟠lh |
| ✅ | `scripts/smoke` | 85 | 26 | 4262 | 0 | 0/14 | 0 | 🟠lh |
| ✅ | `scripts/vector` | 85 | 4 | 492 | 0 | 0/0 | 0 | 🟠lh |
| ✅ | `src/lib/server` | 85 | 4 | 2824 | 0 | 0/6 | 8 | — |
| ✅ | `src/lib/server/labels` | 85 | 2 | 504 | 0 | 0/0 | 8 | — |
| ✅ | `sveltekit-frontend/.vscode` | 85 | 36 | 11912 | 0 | 0/3 | 0 | 🟠lh |
| ✅ | `sveltekit-frontend/drizzle` | 85 | 16 | 1382585 | 0 | 0/0 | 4 | — |
| ✅ | `sveltekit-frontend/scripts/ace` | 85 | 48 | 3825 | 0 | 0/21 | 0 | 🟠lh |
| ✅ | `sveltekit-frontend/scripts/diagnostics` | 85 | 18 | 1131 | 0 | 0/8 | 0 | 🟠lh |
| ✅ | `sveltekit-frontend/scripts/lib` | 85 | 8 | 1298 | 0 | 0/6 | 0 | 🟠lh |
| ✅ | `sveltekit-frontend/scripts/scenarios` | 85 | 10 | 1001 | 0 | 0/9 | 0 | 🟠lh |
| ✅ | `sveltekit-frontend/src/lib/components` | 85 | 2049 | 526078 | 0 | 0/141 | 21 | — |
| ✅ | `sveltekit-frontend/src/lib/utils` | 85 | 132 | 21825 | 0 | 6/21 | 0 | 🟠lh |
| ✅ | `sveltekit-frontend/tests/scripts` | 85 | 9 | 312 | 0 | 0/0 | 0 | 🟠lh |
| ✅ | `claude-mem/src/npx-cli` | 85 | 3 | 3852 | 0 | 0/4 | 0 | 🟠lh |
| ✅ | `claude-mem/src/npx-cli/commands` | 85 | 6 | 2903 | 0 | 0/2 | 0 | 🟠lh |
| ✅ | `scripts/agentic` | 85 | 4 | 1498 | 0 | 0/4 | 0 | 🟠lh |
| ✅ | `scripts/docs` | 85 | 2 | 830 | 0 | 0/0 | 0 | 🟠lh |
| ✅ | `sveltekit-frontend/drizzle/introspected` | 85 | 2 | 20357 | 0 | 0/0 | 4 | — |
| ✅ | `sveltekit-frontend/public/js` | 85 | 1 | 571 | 0 | 0/0 | 0 | 🟠lh |
| ✅ | `sveltekit-frontend/scripts/diagnose` | 85 | 2 | 379 | 0 | 0/0 | 0 | 🟠lh |
| ✅ | `sveltekit-frontend/src/routes/dev` | 85 | 2 | 524 | 0 | 1/1 | 0 | 🟠lh ⬜notest |
| ✅ | `sveltekit-frontend/tests/helpers` | 85 | 3 | 374 | 0 | 1/1 | 0 | 🟠lh |
| ✅ | `sveltekit-frontend/tmp` | 85 | 14 | 162199 | 0 | 0/0 | 0 | 🟠lh |
| ✅ | `$lib/utils` | 90 | 3 | 45 | 0 | 0/0 | 0 | — |
| ✅ | `.github/hooks` | 90 | 3 | 30 | 0 | 0/0 | 0 | — |
| ✅ | `.claude/worktrees/agent-a7203461/audit` | 90 | 2 | 26 | 0 | 0/0 | 0 | — |
| ✅ | `.claude/worktrees/agent-a7203461/crates` | 90 | 16 | 1692 | 0 | 0/0 | 0 | — |
| ✅ | `crates/atlas_packet_parser` | 90 | 4 | 400 | 0 | 0/0 | 0 | — |
| ✅ | `crates/atlas_packet_parser/target` | 90 | 3 | 18 | 0 | 0/0 | 0 | — |
| ✅ | `crates/turbovec-napi` | 90 | 6 | 931 | 0 | 0/0 | 0 | — |
| ✅ | `crates/turbovec-napi/target` | 90 | 3 | 399 | 0 | 0/0 | 0 | — |
| ✅ | `.claude/worktrees/agent-a7203461/data` | 90 | 2 | 14 | 0 | 0/0 | 0 | — |
| ✅ | `docker/bifrost` | 90 | 4 | 324 | 0 | 0/0 | 0 | — |
| ✅ | `.claude/worktrees/agent-a7203461/docker` | 90 | 2 | 82 | 0 | 0/0 | 0 | — |
| ✅ | `docs/ai-os` | 90 | 3 | 12 | 0 | 0/0 | 0 | — |
| ✅ | `docs/atlas` | 90 | 15 | 306855 | 0 | 0/0 | 0 | — |
| ✅ | `.claude/worktrees/agent-a7203461/docs` | 90 | 362 | 2463846 | 0 | 0/0 | 0 | — |
| ✅ | `docs/graph` | 90 | 31 | 987572 | 0 | 0/0 | 0 | — |
| ✅ | `docs/reports` | 90 | 217 | 3698436 | 0 | 0/0 | 0 | — |
| ✅ | `drizzle/meta` | 90 | 8 | 9124 | 0 | 0/0 | 0 | — |
| ✅ | `.vscode/extensions/mcp-context7-assistant/src` | 90 | 143 | 143 | 0 | 0/0 | 0 | — |
| ✅ | `.claude/worktrees/agent-a7203461/memory` | 90 | 136 | 2499008 | 0 | 0/0 | 0 | — |
| ✅ | `memory/clusters` | 90 | 17 | 17 | 0 | 0/0 | 0 | — |
| ✅ | `memory/exports` | 90 | 54 | 386567 | 0 | 0/0 | 0 | — |
| ✅ | `memory/knowledge` | 90 | 8 | 1530 | 0 | 0/0 | 0 | — |
| ✅ | `.claude/worktrees/agent-a7203461/next_steps` | 90 | 2 | 464350 | 0 | 0/0 | 0 | — |
| ✅ | `scripts/agents` | 90 | 6 | 452 | 0 | 0/4 | 0 | — |
| ✅ | `scripts/ai-os` | 90 | 12 | 364 | 0 | 0/8 | 0 | — |
| ✅ | `scripts/analysis` | 90 | 16 | 796 | 0 | 0/0 | 0 | — |
| ✅ | `scripts/cache` | 90 | 18 | 1294 | 0 | 0/8 | 0 | — |
| ✅ | `scripts/dev` | 90 | 14 | 1128 | 0 | 0/6 | 0 | — |
| ✅ | `scripts/engram` | 90 | 4 | 16 | 0 | 0/0 | 0 | — |
| ✅ | `scripts/error-resolution` | 90 | 16 | 20672 | 0 | 0/8 | 0 | — |
| ✅ | `scripts/error-resolution/services` | 90 | 24 | 7752 | 0 | 0/8 | 0 | — |
| ✅ | `scripts/error-resolution/tests` | 90 | 24 | 10872 | 0 | 0/0 | 0 | — |
| ✅ | `scripts/eval/data` | 90 | 4 | 656 | 0 | 0/0 | 0 | — |
| ✅ | `scripts/lib` | 90 | 6 | 734 | 0 | 0/0 | 0 | — |
| ✅ | `scripts/mapreduce` | 90 | 8 | 352 | 0 | 0/0 | 0 | — |
| ✅ | `scripts/native` | 90 | 6 | 1638 | 0 | 0/2 | 0 | — |
| ✅ | `scripts/redis` | 90 | 4 | 532 | 0 | 0/4 | 0 | — |
| ✅ | `scripts/reports` | 90 | 16 | 912 | 0 | 0/8 | 0 | — |
| ✅ | `scripts/simd` | 90 | 56 | 4620 | 0 | 0/40 | 0 | — |
| ✅ | `scripts/simdtest` | 90 | 12 | 768 | 0 | 0/12 | 0 | — |
| ✅ | `scripts/sync-labels` | 90 | 8 | 272 | 0 | 0/0 | 0 | — |
| ✅ | `scripts/tests/vlm-tests` | 90 | 24 | 24 | 0 | 0/0 | 0 | — |
| ✅ | `scripts/valkey` | 90 | 12 | 936 | 0 | 0/12 | 0 | — |
| ✅ | `simd-bridge/cpp` | 90 | 4 | 1628 | 0 | 0/2 | 0 | — |
| ✅ | `simd-bridge/cpp/build-verify-2026-05-31T08-06-57-567Z/CMakeFiles` | 90 | 4 | 32 | 0 | 0/0 | 0 | — |
| ✅ | `simd-bridge/cpp/build-x64-cuda/CMakeFiles` | 90 | 8 | 64 | 0 | 0/0 | 0 | — |
| ✅ | `simd-bridge/cpp/build-x64-cuda-cublas/CMakeFiles` | 90 | 8 | 64 | 0 | 0/0 | 0 | — |
| ✅ | `simd-bridge/cpp/build-x64-cuda-cuvs/CMakeFiles` | 90 | 8 | 64 | 0 | 0/0 | 0 | — |
| ✅ | `simd-bridge/cpp/build-x64-fallback/CMakeFiles` | 90 | 4 | 32 | 0 | 0/0 | 0 | — |
| ✅ | `.claude/worktrees/agent-a7203461/simd-bridge` | 90 | 12 | 1500 | 0 | 0/2 | 0 | — |
| ✅ | `simd-bridge/examples` | 90 | 8 | 120 | 0 | 0/0 | 0 | — |
| ✅ | `simd-bridge/rust/graph-engine` | 90 | 4 | 232 | 0 | 0/0 | 0 | — |
| ✅ | `simd-bridge/rust/graph-engine/target` | 90 | 168 | 168 | 0 | 0/0 | 0 | — |
| ✅ | `simd-bridge/rust/hmm-repair` | 90 | 4 | 212 | 0 | 0/0 | 0 | — |
| ✅ | `simd-bridge/rust/hmm-repair/target` | 90 | 148 | 148 | 0 | 0/0 | 0 | — |
| ✅ | `simd-bridge/rust-simdjson/target` | 90 | 4 | 118 | 0 | 0/0 | 0 | — |
| ✅ | `src/lib/server/ace` | 90 | 6 | 98 | 0 | 0/2 | 0 | — |
| ✅ | `src/lib/server/ai` | 90 | 22 | 900 | 0 | 0/0 | 0 | — |
| ✅ | `src/lib/server/gateway` | 90 | 4 | 158 | 0 | 0/0 | 0 | — |
| ✅ | `src/lib/server/mcp` | 90 | 4 | 192 | 0 | 0/0 | 0 | — |
| ✅ | `src/lib/server/observability` | 90 | 4 | 108 | 0 | 0/0 | 0 | — |
| ✅ | `src/lib/server/utils` | 90 | 2 | 260 | 0 | 0/2 | 0 | — |
| ✅ | `src/lib/services` | 90 | 2 | 166 | 0 | 0/2 | 0 | — |
| ✅ | `src/routes/api/chat` | 90 | 2 | 36 | 0 | 0/0 | 0 | — |
| ✅ | `src/tests` | 90 | 2 | 170 | 0 | 0/0 | 0 | — |
| ✅ | `src/tests/gateway` | 90 | 2 | 138 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/config` | 90 | 3 | 420 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/docs` | 90 | 3 | 8401231 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/docs/atlas-index` | 90 | 10 | 61778 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/docs/graph` | 90 | 27 | 8304999 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/docs/reports` | 90 | 79 | 32572 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/drizzle/meta` | 90 | 56 | 1325719 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/memory/agent-runs` | 90 | 3 | 219 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/memory/atlas` | 90 | 6 | 6 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/memory/cards` | 90 | 6 | 26997 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/memory/codebase` | 90 | 4 | 38790 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/memory/datasets/legal-contracts` | 90 | 6 | 36 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/memory/graph` | 90 | 3 | 10440 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/memory/graphify/gds` | 90 | 102 | 2150037 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/memory/index` | 90 | 18 | 5016 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/memory/kb` | 90 | 3 | 90085 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/memory/kb/notecards` | 90 | 4 | 2483 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/memory/knowledge` | 90 | 4 | 53 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/memory/runs/2026-05-07T01-05-54` | 90 | 65 | 1717681 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/scripts/activity` | 90 | 3 | 369 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/scripts/authority` | 90 | 3 | 831 | 0 | 0/3 | 0 | — |
| ✅ | `sveltekit-frontend/scripts/bifrost` | 90 | 6 | 1761 | 0 | 0/6 | 0 | — |
| ✅ | `sveltekit-frontend/scripts/cache` | 90 | 11 | 1064 | 0 | 0/5 | 0 | — |
| ✅ | `sveltekit-frontend/scripts/cards` | 90 | 21 | 4122 | 0 | 0/12 | 0 | — |
| ✅ | `sveltekit-frontend/scripts/ci` | 90 | 3 | 186 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/scripts/datasets` | 90 | 3 | 96 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/scripts/db` | 90 | 9 | 882 | 0 | 0/3 | 0 | — |
| ✅ | `sveltekit-frontend/scripts/dev` | 90 | 16 | 1073 | 0 | 0/9 | 0 | — |
| ✅ | `sveltekit-frontend/scripts/diff` | 90 | 9 | 2163 | 0 | 0/6 | 0 | — |
| ✅ | `sveltekit-frontend/scripts/duckdb` | 90 | 9 | 1341 | 0 | 0/9 | 0 | — |
| ✅ | `sveltekit-frontend/scripts/engram` | 90 | 3 | 141 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/scripts/export` | 90 | 3 | 336 | 0 | 0/3 | 0 | — |
| ✅ | `sveltekit-frontend/scripts/features` | 90 | 16 | 982 | 0 | 0/12 | 0 | — |
| ✅ | `sveltekit-frontend/scripts/health` | 90 | 3 | 723 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/scripts/ingest` | 90 | 4 | 518 | 0 | 0/3 | 0 | — |
| ✅ | `sveltekit-frontend/scripts/legal` | 90 | 6 | 405 | 0 | 0/3 | 0 | — |
| ✅ | `sveltekit-frontend/scripts/llms` | 90 | 9 | 2988 | 0 | 0/5 | 0 | — |
| ✅ | `sveltekit-frontend/scripts/mega-audit` | 90 | 12 | 1857 | 0 | 0/9 | 0 | — |
| ✅ | `sveltekit-frontend/scripts/memory` | 90 | 6 | 306 | 0 | 0/6 | 0 | — |
| ✅ | `sveltekit-frontend/scripts/observability` | 90 | 3 | 60 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/scripts/opencode` | 90 | 18 | 3726 | 0 | 0/3 | 0 | — |
| ✅ | `sveltekit-frontend/scripts/operator` | 90 | 3 | 507 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/scripts/phase9` | 90 | 3 | 123 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/scripts/prompt-cache` | 90 | 3 | 147 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/scripts/redis` | 90 | 6 | 279 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/scripts/reports` | 90 | 12 | 609 | 0 | 0/3 | 0 | — |
| ✅ | `sveltekit-frontend/scripts/rg-atlas` | 90 | 4 | 402 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/scripts/skills` | 90 | 6 | 2250 | 0 | 0/3 | 0 | — |
| ✅ | `sveltekit-frontend/scripts/synth` | 90 | 7 | 2561 | 0 | 0/6 | 0 | — |
| ✅ | `sveltekit-frontend/scripts/tests/nes-arch` | 90 | 4 | 421 | 0 | 0/1 | 0 | — |
| ✅ | `sveltekit-frontend/scripts/tools` | 90 | 5 | 415 | 0 | 0/1 | 0 | — |
| ✅ | `sveltekit-frontend/scripts/turboquant` | 90 | 13 | 4279 | 0 | 0/12 | 0 | — |
| ✅ | `sveltekit-frontend/scripts/wiki` | 90 | 13 | 3361 | 0 | 0/8 | 0 | — |
| ✅ | `sveltekit-frontend/src/lib/ai` | 90 | 57 | 16116 | 0 | 0/3 | 0 | — |
| ✅ | `sveltekit-frontend/src/lib/cache` | 90 | 15 | 3138 | 0 | 0/3 | 0 | — |
| ✅ | `sveltekit-frontend/src/lib/canvas` | 90 | 3 | 45 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/src/lib/client` | 90 | 31 | 3035 | 0 | 0/12 | 0 | — |
| ✅ | `sveltekit-frontend/src/lib/collaboration` | 90 | 3 | 801 | 0 | 0/3 | 0 | — |
| ✅ | `sveltekit-frontend/docs_readme/deeds_labs_archive` | 90 | 84 | 3003442 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/docs_readme/deeds_labs_archive/components` | 90 | 9 | 5945 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/src/lib/config` | 90 | 22 | 3986 | 0 | 1/1 | 0 | — |
| ✅ | `sveltekit-frontend/src/lib/courtroom` | 90 | 12 | 4683 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/src/lib/env` | 90 | 6 | 81 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/src/lib/features` | 90 | 18 | 1638 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/src/lib/gpu` | 90 | 51 | 14628 | 0 | 0/6 | 0 | — |
| ✅ | `sveltekit-frontend/src/lib/graph` | 90 | 3 | 162 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/src/lib/icons` | 90 | 45 | 1716 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/src/lib/machines` | 90 | 33 | 12279 | 0 | 0/3 | 0 | — |
| ✅ | `sveltekit-frontend/src/lib/messaging` | 90 | 3 | 504 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/src/lib/phase72` | 90 | 3 | 444 | 0 | 0/3 | 0 | — |
| ✅ | `sveltekit-frontend/src/lib/schemas` | 90 | 39 | 3150 | 0 | 0/15 | 0 | — |
| ✅ | `sveltekit-frontend/src/lib/services` | 90 | 21 | 2316 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/src/lib/shared` | 90 | 15 | 852 | 0 | 0/3 | 0 | — |
| ✅ | `sveltekit-frontend/src/lib/state` | 90 | 3 | 24 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/src/lib/stores` | 90 | 81 | 15327 | 0 | 0/18 | 0 | — |
| ✅ | `sveltekit-frontend/src/lib/test-utils` | 90 | 3 | 33 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/src/lib/webgpu` | 90 | 60 | 17358 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/src/mcp/tools` | 90 | 22 | 6934 | 0 | 0/21 | 0 | — |
| ✅ | `sveltekit-frontend/src/mcp/zod-to-json-schema-bridge` | 90 | 6 | 282 | 0 | 0/3 | 0 | — |
| ✅ | `sveltekit-frontend/src/routes/(admin)` | 90 | 6 | 1455 | 0 | 6/0 | 0 | — |
| ✅ | `sveltekit-frontend/src/routes/(analysis)` | 90 | 21 | 3564 | 0 | 12/0 | 0 | ⬜notest |
| ✅ | `sveltekit-frontend/src/routes/(dev)` | 90 | 39 | 7008 | 0 | 3/3 | 0 | ⬜notest |
| ✅ | `sveltekit-frontend/src/routes/debug` | 90 | 3 | 594 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/src/routes/minio` | 90 | 3 | 24 | 0 | 0/0 | 0 | ⬜notest |
| ✅ | `sveltekit-frontend/src/routes/seaweed` | 90 | 3 | 21 | 0 | 0/0 | 0 | ⬜notest |
| ✅ | `sveltekit-frontend/src/stores` | 90 | 3 | 141 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/src/tests` | 90 | 3 | 30 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/src/wasm` | 90 | 6 | 1572 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/src/workers` | 90 | 9 | 846 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/tests/accessibility` | 90 | 4 | 1459 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/tests/e2e` | 90 | 54 | 15654 | 0 | 10/3 | 0 | — |
| ✅ | `sveltekit-frontend/tests/e2e/utils` | 90 | 9 | 1515 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/tests/fixtures` | 90 | 4 | 178 | 0 | 1/0 | 0 | — |
| ✅ | `sveltekit-frontend/tests/intent` | 90 | 5 | 550 | 0 | 0/1 | 0 | — |
| ✅ | `sveltekit-frontend/tests/reports` | 90 | 4 | 140 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/tests/routes/api` | 90 | 4 | 303 | 0 | 4/0 | 0 | — |
| ✅ | `sveltekit-frontend/tests/setup` | 90 | 3 | 678 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/uploads/audio` | 90 | 3 | 3 | 0 | 0/0 | 0 | — |
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
| ✅ | `simd-bridge/rust-simdjson/target/release` | 90 | 114 | 114 | 0 | 0/0 | 0 | — |
| ✅ | `crates/atlas_packet_parser/target/release` | 90 | 15 | 15 | 0 | 0/0 | 0 | — |
| ✅ | `crates/turbovec-napi/target/release` | 90 | 283 | 283 | 0 | 0/0 | 0 | — |
| ✅ | `crates/turbovec-napi/target/x86_64-pc-windows-msvc` | 90 | 113 | 113 | 0 | 0/0 | 0 | — |
| ✅ | `docker/seaweedfs` | 90 | 2 | 82 | 0 | 0/0 | 0 | — |
| ✅ | `docs/packets` | 90 | 1 | 532 | 0 | 0/0 | 0 | — |
| ✅ | `docs/phase100` | 90 | 7 | 29520 | 0 | 0/0 | 0 | — |
| ✅ | `docs/profile-cards/data` | 90 | 23 | 716 | 0 | 0/0 | 0 | — |
| ✅ | `docs/reports/atlas` | 90 | 4 | 174 | 0 | 0/0 | 0 | — |
| ✅ | `memory/agent-runs` | 90 | 1 | 146 | 0 | 0/0 | 0 | — |
| ✅ | `memory/exports/atlas` | 90 | 1 | 90349 | 0 | 0/0 | 0 | — |
| ✅ | `memory/exports/parent-atlas` | 90 | 1 | 131565 | 0 | 0/0 | 0 | — |
| ✅ | `memory/graph` | 90 | 1 | 782 | 0 | 0/0 | 0 | — |
| ✅ | `memory/graphify/deep` | 90 | 1 | 663970 | 0 | 0/0 | 0 | — |
| ✅ | `memory/manifests` | 90 | 3 | 140 | 0 | 0/0 | 0 | — |
| ✅ | `memory/packets` | 90 | 1 | 105 | 0 | 0/0 | 0 | — |
| ✅ | `memory/reports` | 90 | 1 | 195667 | 0 | 0/0 | 0 | — |
| ✅ | `memory/rewards` | 90 | 2 | 52 | 0 | 0/0 | 0 | — |
| ✅ | `minio-data/.minio.sys` | 90 | 1 | 1 | 0 | 0/0 | 0 | — |
| ✅ | `neschrom97/cards` | 90 | 8170 | 166304 | 0 | 0/0 | 0 | — |
| ✅ | `neschrom97/index` | 90 | 5 | 74105 | 0 | 0/0 | 0 | — |
| ✅ | `neschrom97/packets` | 90 | 2 | 46 | 0 | 0/0 | 0 | — |
| ✅ | `next_steps/active` | 90 | 2 | 464350 | 0 | 0/0 | 0 | — |
| ✅ | `packages/parent-atlas` | 90 | 3 | 1704 | 0 | 0/2 | 0 | — |
| ✅ | `packages/parent-atlas/src` | 90 | 3 | 1337 | 0 | 0/2 | 0 | — |
| ✅ | `packages/parent-atlas/src/adapters` | 90 | 5 | 366 | 0 | 0/1 | 0 | — |
| ✅ | `packages/parent-atlas/src/gates` | 90 | 6 | 312 | 0 | 0/1 | 0 | — |
| ✅ | `packages/parent-atlas/src/pipelines` | 90 | 4 | 295 | 0 | 0/0 | 0 | — |
| ✅ | `scratch/index-checkpoints` | 90 | 2 | 196384 | 0 | 0/0 | 0 | — |
| ✅ | `scratch/obsidian_vault/.obsidian/plugins` | 90 | 2 | 59245 | 0 | 1/1 | 0 | — |
| ✅ | `scripts/analysis_reports` | 90 | 24 | 10410 | 0 | 0/0 | 0 | — |
| ✅ | `scripts/atlas/out` | 90 | 8 | 6782 | 0 | 0/0 | 0 | — |
| ✅ | `scripts/bench` | 90 | 2 | 266 | 0 | 0/2 | 0 | — |
| ✅ | `scripts/case_data/_cache` | 90 | 292 | 292 | 0 | 0/0 | 0 | — |
| ✅ | `scripts/court_data/constitutions` | 90 | 18 | 2360 | 0 | 0/0 | 0 | — |
| ✅ | `scripts/evals` | 90 | 2 | 800 | 0 | 0/0 | 0 | — |
| ✅ | `scripts/memory/graphify/gds` | 90 | 16 | 573596 | 0 | 0/0 | 0 | — |
| ✅ | `scripts/phase-3d` | 90 | 2 | 348 | 0 | 0/0 | 0 | — |
| ✅ | `scripts/sidecars` | 90 | 2 | 512 | 0 | 0/0 | 0 | — |
| ✅ | `scripts/startup` | 90 | 10 | 1650 | 0 | 0/2 | 0 | — |
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
| ✅ | `sveltekit-frontend/.claude` | 90 | 1 | 45 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/.venv/Lib/python3.9` | 90 | 5 | 2421 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/.venv_turbovec/Lib/site-packages` | 90 | 1 | 7857 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/docs/obsidian-vault` | 90 | 2 | 108 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/docs/profile-cards/data` | 90 | 20 | 1588 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/drizzle/introspected/meta` | 90 | 2 | 17338 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/drizzle/meta_backup_20260101` | 90 | 10 | 32129 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/memory/agents-dag` | 90 | 34 | 2433 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/memory/docstore` | 90 | 1 | 34 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/memory/exports` | 90 | 5 | 1758 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/memory/exports/atlas` | 90 | 1 | 20 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/memory/exports/xgboost-hotness` | 90 | 1 | 393 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/memory/features` | 90 | 3 | 623 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/memory/graphify/deep` | 90 | 5 | 346749 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/memory/kag-notes` | 90 | 1 | 16 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/memory/kb/cards` | 90 | 2 | 87451 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/memory/kb/weights` | 90 | 1 | 13 | 0 | 0/0 | 0 | — |
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
| ✅ | `sveltekit-frontend/scripts/backup-consolidation` | 90 | 17 | 4382 | 0 | 0/10 | 0 | — |
| ✅ | `sveltekit-frontend/scripts/backup-consolidation/tests` | 90 | 4 | 999 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/scripts/comfyui` | 90 | 2 | 282 | 0 | 0/1 | 0 | — |
| ✅ | `sveltekit-frontend/scripts/comfyui/workflows` | 90 | 2 | 84 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/scripts/daily` | 90 | 1 | 78 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/scripts/qdrant` | 90 | 3 | 384 | 0 | 0/2 | 0 | — |
| ✅ | `sveltekit-frontend/scripts/reconstruction` | 90 | 4 | 439 | 0 | 0/1 | 0 | — |
| ✅ | `sveltekit-frontend/scripts/sidecars` | 90 | 3 | 14 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/scripts/tests/probes` | 90 | 3 | 88 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/scripts/__fixtures__` | 90 | 1 | 28 | 0 | 0/1 | 0 | — |
| ✅ | `sveltekit-frontend/src/lib/agent` | 90 | 8 | 672 | 0 | 0/2 | 0 | — |
| ✅ | `sveltekit-frontend/src/lib/generated` | 90 | 10 | 24980 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/src/routes/(analysis)@` | 90 | 3 | 2471 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/sveltekit-frontend` | 90 | 2 | 179 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/sveltekit-frontend/.docker-build` | 90 | 2 | 14 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/test` | 90 | 1 | 63 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/test-results` | 90 | 2 | 2503 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/tests/e2e/route-forensic` | 90 | 35 | 1750 | 0 | 4/0 | 0 | — |
| ✅ | `sveltekit-frontend/tests/mapreduce` | 90 | 1 | 217 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/tests/opencode` | 90 | 1 | 294 | 0 | 0/0 | 0 | — |
| ✅ | `tests/atlas` | 90 | 1 | 341 | 0 | 0/1 | 0 | — |
| ✅ | `sveltekit-frontend/tests/runes` | 90 | 1 | 230 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/tests/sw` | 90 | 1 | 97 | 0 | 0/1 | 0 | — |
| ✅ | `sveltekit-frontend/tests/utils` | 90 | 1 | 134 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/tmp/ace-context-snapshots` | 90 | 2 | 115 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/tmp/hypergraph` | 90 | 1 | 77108 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/tmp/uscode-extracted` | 90 | 1 | 83 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/uploads/transcriptions` | 90 | 2 | 1388 | 0 | 0/0 | 0 | — |
| ✅ | `tests/opencode` | 90 | 2 | 678 | 0 | 0/2 | 0 | — |
| ✅ | `tmp/ace-context-snapshots` | 90 | 3 | 54 | 0 | 0/0 | 0 | — |
| ✅ | `turbovec/benchmarks/results` | 90 | 23 | 328 | 0 | 0/0 | 0 | — |
| ✅ | `turbovec/target` | 90 | 1 | 155 | 0 | 0/0 | 0 | — |
| ✅ | `turbovec/target/release/.fingerprint` | 90 | 154 | 154 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/src/routes` | 93 | 18 | 646270 | 2028 | 3234/1725 | 3 | 🟠lh ⬜notest |
| ✅ | `scripts/agent` | 95 | 8 | 1272 | 0 | 0/4 | 0 | 🟠lh |
| ✅ | `scripts/docs-atlas` | 95 | 28 | 5046 | 0 | 0/12 | 0 | 🟠lh |
| ✅ | `scripts/ingest` | 95 | 72 | 8132 | 0 | 0/46 | 0 | 🟠lh |
| ✅ | `scripts/memory` | 95 | 20 | 576188 | 0 | 0/8 | 0 | 🟠lh |
| ✅ | `scripts/opencode` | 95 | 226 | 27038 | 0 | 0/188 | 0 | 🟠lh |
| ✅ | `scripts/qdrant` | 95 | 10 | 886 | 0 | 0/2 | 0 | 🟠lh |
| ✅ | `sveltekit-frontend/.docker-build` | 95 | 4 | 62034 | 0 | 2/126 | 0 | 🟠lh |
| ✅ | `sveltekit-frontend/.docker-build/scripts` | 95 | 3 | 27658 | 0 | 2/126 | 0 | 🟠lh |
| ✅ | `sveltekit-frontend/.docker-build/scripts/atlas` | 95 | 155 | 27118 | 0 | 2/126 | 0 | 🟠lh |
| ✅ | `sveltekit-frontend/scripts/atlas` | 95 | 137 | 25460 | 0 | 0/74 | 0 | 🟠lh |
| ✅ | `sveltekit-frontend/scripts/graph` | 95 | 18 | 5189 | 0 | 3/12 | 0 | 🟠lh |
| ✅ | `sveltekit-frontend/scripts/index` | 95 | 30 | 2421 | 0 | 0/21 | 0 | 🟠lh |
| ✅ | `sveltekit-frontend/scripts/mcp` | 95 | 34 | 10186 | 0 | 0/18 | 0 | 🟠lh |
| ✅ | `sveltekit-frontend/scripts/smoke` | 95 | 40 | 5514 | 0 | 0/15 | 0 | 🟠lh |
| ✅ | `sveltekit-frontend/scripts/startup` | 95 | 27 | 4891 | 0 | 0/10 | 0 | 🟠lh |
| ✅ | `sveltekit-frontend/scripts/tests` | 95 | 118 | 27977 | 0 | 8/47 | 0 | 🟠lh |
| ✅ | `sveltekit-frontend/src/mcp` | 95 | 44 | 38502 | 0 | 3/59 | 0 | 🟠lh |
| ✅ | `claude-mem/plugin` | 95 | 2 | 24717 | 0 | 2/10 | 0 | 🟠lh |
| ✅ | `claude-mem/plugin/scripts` | 95 | 9 | 23096 | 0 | 2/8 | 0 | 🟠lh |
| ✅ | `sveltekit-frontend/scratch` | 95 | 54 | 7233 | 0 | 0/7 | 0 | 🟠lh |
| ✅ | `sveltekit-frontend/scripts/semantic-valkey` | 95 | 2 | 370 | 0 | 1/0 | 0 | 🟠lh |
| ✅ | `.claude/hooks` | 100 | 2 | 164 | 0 | 0/2 | 0 | — |
| ✅ | `.claude/worktrees/agent-a7203461` | 100 | 12 | 30189054 | 204 | 1618/1342 | 16 | 🟡sv4 🟠lh |
| ✅ | `.claude/worktrees/agent-a7203461/.claude` | 100 | 8 | 648 | 0 | 0/4 | 0 | — |
| ✅ | `.claude/worktrees/agent-a7203461/scripts` | 100 | 1280 | 876002 | 4 | 4/584 | 4 | 🟠lh |
| ✅ | `scripts/atlas` | 100 | 1258 | 332193 | 11 | 0/705 | 2 | 🟠lh |
| ✅ | `scripts/atlas/lib` | 100 | 67 | 9850 | 7 | 0/24 | 0 | 🟠lh |
| ✅ | `scripts/db-tests` | 100 | 16 | 884 | 0 | 0/0 | 0 | — |
| ✅ | `scripts/graphify` | 100 | 10 | 1010 | 0 | 0/4 | 0 | — |
| ✅ | `scripts/packets` | 100 | 44 | 8956 | 0 | 0/26 | 0 | — |
| ✅ | `scripts/tests` | 100 | 262 | 101476 | 4 | 4/34 | 0 | 🟠lh |
| ✅ | `src/lib/schema` | 100 | 2 | 34 | 0 | 0/0 | 0 | — |
| ✅ | `src/lib/server/graph` | 100 | 4 | 306 | 0 | 0/0 | 0 | — |
| ✅ | `.claude/worktrees/agent-a7203461/sveltekit-frontend` | 100 | 5240 | 23880244 | 196 | 1612/750 | 12 | 🟠lh |
| ✅ | `sveltekit-frontend/drizzle/schema` | 100 | 3 | 933 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/scripts` | 100 | 693 | 453930 | 43 | 64/972 | 108 | 🟠lh |
| ✅ | `sveltekit-frontend/scripts/agents` | 100 | 11 | 1747 | 0 | 1/2 | 0 | — |
| ✅ | `sveltekit-frontend/scripts/atlas/mapreduce` | 100 | 3 | 363 | 0 | 0/3 | 0 | — |
| ✅ | `sveltekit-frontend/scripts/docs` | 100 | 3 | 672 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/scripts/kb` | 100 | 32 | 9366 | 0 | 3/22 | 0 | — |
| ✅ | `sveltekit-frontend/scripts/knowledge` | 100 | 58 | 9304 | 0 | 0/55 | 0 | — |
| ✅ | `sveltekit-frontend/scripts/phase104-backups/src` | 100 | 1191 | 133434 | 39 | 30/289 | 108 | 🟠lh |
| ✅ | `sveltekit-frontend/scripts/screenshots` | 100 | 5 | 1447 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/scripts/validate` | 100 | 4 | 4097 | 0 | 3/3 | 0 | — |
| ✅ | `sveltekit-frontend/src` | 100 | 51 | 2103420 | 2040 | 3278/2842 | 32 | 🟠lh ⬜notest |
| ✅ | `sveltekit-frontend/src/lib` | 100 | 33 | 1399544 | 12 | 38/1046 | 29 | 🟠lh |
| ✅ | `sveltekit-frontend/src/lib/data` | 100 | 15 | 5061 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/src/lib/db` | 100 | 36 | 7626 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/src/lib/intent` | 100 | 3 | 717 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/src/lib/server` | 100 | 3127 | 675265 | 12 | 31/781 | 2 | 🟠lh |
| ✅ | `sveltekit-frontend/src/lib/shims` | 100 | 31 | 2892 | 0 | 0/1 | 0 | — |
| ✅ | `sveltekit-frontend/src/lib/types` | 100 | 162 | 21789 | 0 | 0/15 | 0 | — |
| ✅ | `sveltekit-frontend/src/routes/(app)` | 100 | 1213 | 313892 | 12 | 1213/129 | 0 | 🟠lh ⬜notest |
| ✅ | `sveltekit-frontend/src/routes/admin` | 100 | 12 | 8106 | 0 | 6/6 | 0 | ⬜notest |
| ✅ | `sveltekit-frontend/src/routes/dashboard` | 100 | 3 | 516 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/src/routes/login` | 100 | 9 | 1506 | 0 | 3/9 | 0 | — |
| ✅ | `sveltekit-frontend/src/routes/register` | 100 | 9 | 1881 | 0 | 3/6 | 0 | — |
| ✅ | `sveltekit-frontend/src/types` | 100 | 69 | 2646 | 0 | 0/3 | 0 | — |
| ✅ | `sveltekit-frontend/tests` | 100 | 409 | 221713 | 11 | 726/97 | 0 | 🟠lh |
| ✅ | `sveltekit-frontend/tests/routes` | 100 | 56 | 65633 | 4 | 668/18 | 0 | — |
| ✅ | `sveltekit-frontend/tests/routes/auto` | 100 | 668 | 47698 | 0 | 654/3 | 0 | — |
| ✅ | `sveltekit-frontend/tests/unit` | 100 | 19 | 2857 | 0 | 0/5 | 0 | — |
| ✅ | `scripts/postgres` | 100 | 2 | 694 | 0 | 0/0 | 0 | — |
| ✅ | `scripts/promotion` | 100 | 14 | 3746 | 0 | 0/10 | 0 | — |
| ✅ | `sveltekit-frontend/scripts/agents/skills` | 100 | 5 | 546 | 0 | 1/1 | 0 | — |
| ✅ | `sveltekit-frontend/scripts/audit` | 100 | 1 | 522 | 0 | 0/1 | 0 | — |
| ✅ | `sveltekit-frontend/scripts/mapreduce` | 100 | 2 | 549 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/src/routes/atlas` | 100 | 2 | 432 | 0 | 0/1 | 0 | ⬜notest |

---

## API Routes (2038 total · top 60)

| Route [params] | Methods | Auth | Zod | Error handling |
|----------------|---------|------|-----|----------------|
| `sveltekit-frontend/api/admin/audit/+server.ts` | GET, POST, PUT, PATCH, DELETE | ✅ | ✅ | ✅ |
| `sveltekit-frontend/api/admin/audit/+server.ts` | GET, POST, PUT, PATCH, DELETE | ✅ | ✅ | ✅ |
| `sveltekit-frontend/api/admin/audit/+server.ts` | GET, POST, PUT, PATCH, DELETE | ✅ | ✅ | ✅ |
| `sveltekit-frontend/api/cases/+server.ts` | GET, POST, PATCH, DELETE | ✅ | ✅ | ✅ |
| `sveltekit-frontend/api/cases/[id]/connections/+server.ts [id]` | GET, POST, PATCH, DELETE | ✅ | ✅ | ❌ |
| `sveltekit-frontend/api/citations/+server.ts` | GET, POST, PATCH, DELETE | ✅ | ✅ | ✅ |
| `sveltekit-frontend/api/error-brain/diagnosis-history/+server.ts` | GET, POST, PATCH, DELETE | ✅ | ✅ | ✅ |
| `sveltekit-frontend/api/reports/+server.ts` | GET, POST, PATCH, DELETE | ✅ | ✅ | ✅ |
| `sveltekit-frontend/api/cases/+server.ts` | GET, POST, PATCH, DELETE | ✅ | ✅ | ✅ |
| `sveltekit-frontend/api/cases/[id]/connections/+server.ts [id]` | GET, POST, PATCH, DELETE | ✅ | ✅ | ❌ |
| `sveltekit-frontend/api/citations/+server.ts` | GET, POST, PATCH, DELETE | ✅ | ✅ | ✅ |
| `sveltekit-frontend/api/error-brain/diagnosis-history/+server.ts` | GET, POST, PATCH, DELETE | ✅ | ✅ | ✅ |
| `sveltekit-frontend/api/reports/+server.ts` | GET, POST, PATCH, DELETE | ✅ | ✅ | ✅ |
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
| `sveltekit-frontend/api/cases/[id]/citations/+server.ts [id]` | GET, POST, DELETE | ✅ | ✅ | ✅ |
| `sveltekit-frontend/api/cases/[id]/notes/[noteId]/evidence/+server.ts [id, noteId]` | GET, POST, DELETE | ✅ | ✅ | ✅ |
| `sveltekit-frontend/api/chat/memory/settings/+server.ts` | GET, DELETE, PATCH | ✅ | ✅ | ✅ |
| `sveltekit-frontend/api/citations/collections/[collectionId]/+server.ts [collectionId]` | GET, DELETE, PATCH | ✅ | ✅ | ✅ |
| `sveltekit-frontend/api/citations/collections/[collectionId]/citations/+server.ts [collectionId]` | POST, DELETE, GET | ✅ | ✅ | ✅ |
| `sveltekit-frontend/api/citations/saved/+server.ts` | GET, POST, DELETE | ✅ | ✅ | ✅ |
| `sveltekit-frontend/api/codebase-index/cluster-summary/+server.ts` | POST, GET, PUT | ✅ | ✅ | ✅ |
| `sveltekit-frontend/api/codebase-index/llm-output/+server.ts` | GET, POST, DELETE | ✅ | ✅ | ✅ |
| `sveltekit-frontend/api/evidence/[id]/+server.ts [id]` | GET, PATCH, DELETE | ✅ | ✅ | ✅ |
| `sveltekit-frontend/api/glyph/tile-atlas/+server.ts` | GET, POST, DELETE | ✅ | ✅ | ✅ |
| `sveltekit-frontend/api/gpu/lease/+server.ts` | GET, POST, DELETE | ✅ | ✅ | ✅ |
| `sveltekit-frontend/api/graph/hypergraph/+server.ts` | GET, POST, DELETE | ✅ | ❌ | ✅ |
| `sveltekit-frontend/api/health/ocr/+server.ts` | GET, POST, HEAD | ✅ | ✅ | ✅ |
| `sveltekit-frontend/api/knowledge/+server.ts` | POST, GET, PATCH | ✅ | ✅ | ✅ |
| `sveltekit-frontend/api/persons-of-interest/[id]/photos/+server.ts [id]` | GET, POST, DELETE | ✅ | ✅ | ✅ |
| `sveltekit-frontend/api/push/+server.ts` | GET, POST, DELETE | ✅ | ✅ | ✅ |
| `sveltekit-frontend/api/simulation/[sessionId]/+server.ts [sessionId]` | GET, POST, DELETE | ✅ | ✅ | ✅ |
| `sveltekit-frontend/api/statutes/[id]/+server.ts [id]` | GET, PUT, DELETE | ✅ | ✅ | ✅ |
| `sveltekit-frontend/api/wiki/watch/+server.ts` | GET, POST, DELETE | ✅ | ❌ | ❌ |
| `sveltekit-frontend/api/analytics/codebase-research/+server.ts` | GET, POST, DELETE | ✅ | ✅ | ✅ |
| `sveltekit-frontend/api/analytics/deep-research/+server.ts` | GET, POST, DELETE | ✅ | ✅ | ✅ |
| `sveltekit-frontend/api/analytics/generate-todos/+server.ts` | POST, GET, PATCH | ✅ | ✅ | ✅ |
| `sveltekit-frontend/api/analytics/mapreduce-matrix/+server.ts` | GET, POST, DELETE | ✅ | ✅ | ✅ |
| `sveltekit-frontend/api/analytics/unified-research/+server.ts` | GET, POST, DELETE | ✅ | ✅ | ✅ |
| `sveltekit-frontend/api/browser-context/snapshot/+server.ts` | POST, GET, DELETE | ✅ | ✅ | ✅ |
| `sveltekit-frontend/api/cache/+server.ts` | GET, POST, DELETE | ✅ | ✅ | ✅ |
| `sveltekit-frontend/api/cache/som/+server.ts` | GET, POST, PUT | ✅ | ✅ | ✅ |
| `sveltekit-frontend/api/cases/[id]/+server.ts [id]` | GET, PATCH, DELETE | ✅ | ✅ | ✅ |
| `sveltekit-frontend/api/cases/[id]/citations/+server.ts [id]` | GET, POST, DELETE | ✅ | ✅ | ✅ |
| `sveltekit-frontend/api/cases/[id]/notes/[noteId]/evidence/+server.ts [id, noteId]` | GET, POST, DELETE | ✅ | ✅ | ✅ |
| `sveltekit-frontend/api/chat/memory/settings/+server.ts` | GET, DELETE, PATCH | ✅ | ✅ | ✅ |
| `sveltekit-frontend/api/citations/collections/[collectionId]/+server.ts [collectionId]` | GET, DELETE, PATCH | ✅ | ✅ | ✅ |
| `sveltekit-frontend/api/citations/collections/[collectionId]/citations/+server.ts [collectionId]` | POST, DELETE, GET | ✅ | ✅ | ✅ |

_…and 1978 more. See `codebase-graph.json` for full list._

---

## G4 — API Routes Missing Auth Guard (17)
- `src/routes/api/ace/ask/+server.ts` · POST
- `src/routes/api/atlas/studio/cards/+server.ts` · GET
- `src/routes/api/atlas/studio/cards/[id]/+server.ts` · GET
- `src/routes/api/atlas/studio/redis/+server.ts` · GET
- `src/routes/api/atlas/studio/search/+server.ts` · GET
- `sveltekit-frontend/src/routes/api/atlas/search/+server.ts` · POST
- `src/routes/api/ace/ask/+server.ts` · POST
- `src/routes/api/atlas/studio/cards/+server.ts` · GET
- `src/routes/api/atlas/studio/cards/[id]/+server.ts` · GET
- `src/routes/api/atlas/studio/redis/+server.ts` · GET
- `src/routes/api/atlas/studio/search/+server.ts` · GET
- `sveltekit-frontend/src/routes/api/atlas/search/+server.ts` · POST
- `sveltekit-frontend/src/routes/api/atlas/index-doc/+server.ts` · POST
- `sveltekit-frontend/src/routes/api/atlas/search/+server.ts` · POST
- `sveltekit-frontend/src/routes/api/mcp/select-tools/+server.ts` · POST
- `sveltekit-frontend/src/routes/api/opencode/+server.ts` · GET/POST
- `sveltekit-frontend/src/routes/api/search/rrf/+server.ts` · POST

---

## G5 — API Routes Missing Zod Validation (3)
- `sveltekit-frontend/src/routes/api/agent/rpc/+server.ts` · POST/GET
- `sveltekit-frontend/src/routes/api/hyperrag/packet-rpc/+server.ts` · POST
- `sveltekit-frontend/src/routes/api/opencode/+server.ts` · GET/POST

---

## G14 — Svelte 4 Legacy Patterns (13 files)
- `.claude/worktrees/agent-a7203461/src/routes/admin/cache/+page.svelte` · export-let
- `src/routes/atlas/studio/+page.svelte` · on:event
- `sveltekit-frontend/temp_upload.svelte` · on:event
- `sveltekit-frontend/test-errors-validation.svelte` · $:reactive, on:event
- `sveltekit-frontend/test-errors.svelte` · $:reactive
- `.claude/worktrees/agent-a7203461/src/routes/admin/cache/+page.svelte` · export-let
- `src/routes/atlas/studio/+page.svelte` · on:event
- `sveltekit-frontend/temp_upload.svelte` · on:event
- `sveltekit-frontend/test-errors-validation.svelte` · $:reactive, on:event
- `sveltekit-frontend/test-errors.svelte` · $:reactive
- `sveltekit-frontend/temp_upload.svelte` · on:event
- `sveltekit-frontend/test-errors-validation.svelte` · $:reactive, on:event
- `sveltekit-frontend/test-errors.svelte` · $:reactive

---

## G15 — SSR-Unsafe Globals (0 files · unguarded window/document/localStorage)
_No unguarded SSR-unsafe globals. ✅_

---

## G16 — Routes Without Test Pairing (208)
- `src/routes/api/atlas/studio/cards/+server.ts` · GET
- `src/routes/api/atlas/studio/cards/[id]/+server.ts` · GET
- `sveltekit-frontend/src/routes/api/ace/packet/+server.ts` · POST/GET
- `sveltekit-frontend/src/routes/api/ace/route/+server.ts` · POST
- `sveltekit-frontend/src/routes/api/admin/ace-metrics/+server.ts` · GET
- `sveltekit-frontend/src/routes/api/admin/atlas/cluster-search/+server.ts` · POST
- `sveltekit-frontend/src/routes/api/admin/atlas/couchdb-rollback/+server.ts` · POST
- `sveltekit-frontend/src/routes/api/admin/atlas/couchdb-status/+server.ts` · GET
- `sveltekit-frontend/src/routes/api/admin/atlas/couchdb-synthesize/+server.ts` · POST
- `sveltekit-frontend/src/routes/api/admin/atlas/hyperrag/+server.ts` · POST
- `sveltekit-frontend/src/routes/api/admin/atlas/messy-routing/+server.ts` · GET
- `sveltekit-frontend/src/routes/api/admin/atlas/node/[id]/+server.ts` · GET
- `sveltekit-frontend/src/routes/api/admin/atlas/query/+server.ts` · POST
- `sveltekit-frontend/src/routes/api/admin/atlas/turbovec-prefilter/+server.ts` · POST
- `sveltekit-frontend/src/routes/api/admin/grpo/flush/+server.ts` · GET/POST
- `sveltekit-frontend/src/routes/api/admin/parents-atlas/actions/+server.ts` · POST
- `sveltekit-frontend/src/routes/api/admin/routes/+server.ts` · GET
- `sveltekit-frontend/src/routes/api/ai/analyze/[scope]/+server.ts` · POST
- `sveltekit-frontend/src/routes/api/ai/context/compact-search/+server.ts` · POST
- `sveltekit-frontend/src/routes/api/ai/generate-report/[scope]/+server.ts` · POST
- `sveltekit-frontend/src/routes/api/ai/scenario/+server.ts` · POST/GET
- `sveltekit-frontend/src/routes/api/analytics/knowledge-triples/+server.ts` · GET
- `sveltekit-frontend/src/routes/api/analytics/knowledge-triples/prune/+server.ts` · POST
- `sveltekit-frontend/src/routes/api/atlas/studio/cards/+server.ts` · GET
- `sveltekit-frontend/src/routes/api/atlas/studio/cards/[id]/+server.ts` · GET
- `sveltekit-frontend/src/routes/api/audio/progress/[evidenceId]/+server.ts` · GET
- `sveltekit-frontend/src/routes/api/cases/[id]/+server.ts` · GET/PATCH/DELETE
- `sveltekit-frontend/src/routes/api/citations/collections/[collectionId]/+server.ts` · GET/DELETE/PATCH
- `sveltekit-frontend/src/routes/api/clusters/cards/+server.ts` · GET/POST
- `sveltekit-frontend/src/routes/api/codeintel/chunks/[chunkId]/+server.ts` · GET

---

## G11 — Hardcoded Localhost References (1521 files)
- `ecosystem.dev.config.cjs` · http://localhost:11434
- `ecosystem.prod.config.cjs` · http://localhost:11434
- `.claude/worktrees/agent-a7203461/playwright.config.js` · http://localhost:5173, http://localhost:5173
- `playwright.dev.config.js` · http://localhost:5173
- `.claude/worktrees/agent-a7203461/scripts/ace-startup-health.mjs` · http://localhost:5173
- `.claude/worktrees/agent-a7203461/scripts/agent/turbovec-search-memory.mjs` · http://127.0.0.1:11434
- `.claude/worktrees/agent-a7203461/scripts/agentic/atlas-langgraph-startup.mjs` · http://localhost:6333, http://localhost:7474
- `scripts/ai/cache_startup_prompt.mjs` · http://localhost:5173
- `scripts/ai/embed_and_index_scenarios.mjs` · http://127.0.0.1:6333, http://localhost:5173
- `scripts/ai/index_scenarios.mjs` · http://localhost:5173
- `.claude/worktrees/agent-a7203461/scripts/atlas/archive-to-couchdb.mjs` · http://localhost:5984
- `.claude/worktrees/agent-a7203461/scripts/atlas/atlas-live-reconciliation-audit.mjs` · http://127.0.0.1:5173, http://127.0.0.1:7474
- `.claude/worktrees/agent-a7203461/scripts/atlas/atlas-startup-intelligence.mjs` · http://localhost:6333
- `.claude/worktrees/agent-a7203461/scripts/atlas/audit-parent-atlas-consistency.mjs` · http://127.0.0.1:6333
- `.claude/worktrees/agent-a7203461/scripts/atlas/audit-proto-registry.mjs` · http://localhost:6333, http://127.0.0.1:5173
- `.claude/worktrees/agent-a7203461/scripts/atlas/audit-transport-pressure.mjs` · http://127.0.0.1:8791
- `.claude/worktrees/agent-a7203461/scripts/atlas/backfill-atlas-source-refs-via-qdrant.mjs` · http://localhost:6333
- `.claude/worktrees/agent-a7203461/scripts/atlas/backfill-som-community-id.mjs` · http://localhost:6333
- `.claude/worktrees/agent-a7203461/scripts/atlas/batch-offline-ingest.mjs` · http://localhost:6333, http://localhost:8090
- `scripts/atlas/bench-inference-backends.mjs` · http://127.0.0.1:8090, http://localhost:11434

---

## G18 — Deep Route Paths (parameterised, sorted by depth)

| Route [params] | Depth | Params | Methods |
|----------------|-------|--------|---------|
| `sveltekit-frontend/api/cases/[id]/notes/[noteId]/evidence/+server.ts` | 9 | `[id] [noteId]` | GET, POST, DELETE |
| `sveltekit-frontend/api/cases/[id]/notes/[noteId]/evidence/+server.ts` | 9 | `[id] [noteId]` | GET, POST, DELETE |
| `sveltekit-frontend/api/cases/[id]/notes/[noteId]/evidence/+server.ts` | 9 | `[id] [noteId]` | GET, POST, DELETE |
| `sveltekit-frontend/api/cases/[id]/notes/[noteId]/versions/+server.ts` | 9 | `[id] [noteId]` | GET |
| `sveltekit-frontend/api/library/document/[id]/node/[nodeId]/+server.ts` | 9 | `[id] [nodeId]` | GET |
| `sveltekit-frontend/(app)/admin/phase78/routes/[routePath]/+page.server.ts` | 8 | `[routePath]` |  |
| `sveltekit-frontend/(app)/cases/[id]/evidence/upload/+page.server.ts` | 8 | `[id]` |  |
| `sveltekit-frontend/api/admin/atlas/node/[id]/+server.ts` | 8 | `[id]` | GET |
| `sveltekit-frontend/api/atlas/studio/cards/[id]/+server.ts` | 8 | `[id]` | GET |
| `sveltekit-frontend/api/cases/[id]/analyze/stream/+server.ts` | 8 | `[id]` | POST |
| `sveltekit-frontend/api/cases/[id]/export/pdf/+server.ts` | 8 | `[id]` | POST |
| `sveltekit-frontend/api/cases/[id]/notes/search/+server.ts` | 8 | `[id]` | GET |
| `sveltekit-frontend/api/citations/collections/[collectionId]/citations/+server.ts` | 8 | `[collectionId]` | POST, DELETE, GET |
| `sveltekit-frontend/api/citations/collections/[collectionId]/export/+server.ts` | 8 | `[collectionId]` | GET, POST |
| `sveltekit-frontend/api/codebase/clusters/[id]/summary/+server.ts` | 8 | `[id]` | GET |
| `sveltekit-frontend/api/evidence/summary/[id]/approve/+server.ts` | 8 | `[id]` | POST |
| `sveltekit-frontend/api/evidence/[id]/analyze/stream/+server.ts` | 8 | `[id]` | GET |
| `sveltekit-frontend/api/library/documents/[documentId]/chunks/+server.ts` | 8 | `[documentId]` | GET |
| `sveltekit-frontend/api/library/documents/[documentId]/pdf/+server.ts` | 8 | `[documentId]` | GET |
| `sveltekit-frontend/api/library/documents/[documentId]/summary/+server.ts` | 8 | `[documentId]` | GET |
| `sveltekit-frontend/api/library/documents/[documentId]/toc/+server.ts` | 8 | `[documentId]` | GET |
| `sveltekit-frontend/api/routes/[routeId]/error-brain-patch/[patchId]/+server.ts` | 8 | `[routeId] [patchId]` | PUT |
| `sveltekit-frontend/(app)/admin/phase78/routes/[routePath]/+page.server.ts` | 8 | `[routePath]` |  |
| `sveltekit-frontend/(app)/cases/[id]/evidence/upload/+page.server.ts` | 8 | `[id]` |  |
| `sveltekit-frontend/api/admin/atlas/node/[id]/+server.ts` | 8 | `[id]` | GET |
| `sveltekit-frontend/api/atlas/studio/cards/[id]/+server.ts` | 8 | `[id]` | GET |
| `sveltekit-frontend/api/cases/[id]/analyze/stream/+server.ts` | 8 | `[id]` | POST |
| `sveltekit-frontend/api/cases/[id]/export/pdf/+server.ts` | 8 | `[id]` | POST |
| `sveltekit-frontend/api/cases/[id]/notes/search/+server.ts` | 8 | `[id]` | GET |
| `sveltekit-frontend/api/citations/collections/[collectionId]/citations/+server.ts` | 8 | `[collectionId]` | POST, DELETE, GET |

---

## G19 — Top Module Fan-In (most imported `$lib` paths)
| Module | Import Count |
|--------|-------------|
| `$lib/server/db/client` | 1836 |
| `$lib/server/env.server.js` | 1504 |
| `$lib/server/redis.js` | 981 |
| `$lib/types` | 974 |
| `$lib/components/ui/Icon.svelte` | 771 |
| `$lib/server/ollama.js` | 528 |
| `$lib/server/db/schema-postgres.js` | 508 |
| `$lib/server/middleware/cache-headers.js` | 330 |
| `$lib/server/db/schema-postgres` | 301 |
| `$lib/server/vector/qdrant-manager.js` | 295 |
| `$lib/server/db` | 293 |
| `$lib/server/grpc/embedding-client.js` | 282 |
| `$lib/server/validation.js` | 282 |
| `$lib/components/ui/Button.svelte` | 273 |
| `$lib/server/db/schema` | 257 |
| `$lib/server/redis` | 153 |
| `$lib/server/observability/langfuse.js` | 138 |
| `$lib/server/db/client.js` | 131 |
| `$lib/server/db/schema.js` | 130 |
| `$lib/server/gpu/simdjson-bridge.js` | 126 |

---

## G20 — Cyclic Import Pairs (1 found · top 20)
- `claude-mem/src/shared/paths.ts` ↔ `claude-mem/src/utils/logger.ts`

---

## Svelte Components (60 shown of 2743)
| File | Sub-components | Key `$lib` Imports |
|------|---------------|---------------------|
| `.claude/worktrees/agent-a7203461/src/routes/admin/cache/+page.svelte` |  | $lib/types/gpu-metrics |
| `src/routes/atlas/studio/+page.svelte` |  |  |
| `sveltekit-frontend/src/lib/client/ui/POIPhotoModal.svelte` | POIPhotoModalImpl | $lib/components/POIPhotoModal.svelte |
| `sveltekit-frontend/src/lib/client/ui/POIPhotoUploader.svelte` | Button |  |
| `sveltekit-frontend/src/lib/components/ActionPopup.svelte` |  |  |
| `sveltekit-frontend/src/lib/components/admin/AdminChatAssistant.svelte` | HTMLElement | $lib/utils/xstate-svelte5.svelte.js, $lib/stores/admin-chat-machine.js |
| `sveltekit-frontend/src/lib/components/admin/AdminMonitoringDashboard.svelte` | Icon | $lib/components/ui/Icon.svelte |
| `sveltekit-frontend/src/lib/components/admin/AiAnalysisPopup.svelte` | AiAnalysisPopup | $lib/components/admin/AiAnalysisPopup.svelte, $lib/stores/admin-chat-assistant.svelte.js, $lib/stores/admin-chat-assistant.svelte.js |
| `sveltekit-frontend/src/lib/components/admin/BundlePreview.svelte` | BundleResponse |  |
| `.claude/worktrees/agent-a7203461/sveltekit-frontend/src/lib/components/admin/CommandSuggestPanel.svelte` |  |  |
| `sveltekit-frontend/src/lib/components/admin/ContextualAssistantModal.svelte` |  | $lib/utils/xstate-svelte5.svelte.js, $lib/stores/admin-chat-machine.js, $lib/utils/ui-recon.js |
| `sveltekit-frontend/src/lib/components/admin/EvidenceDataGrid.svelte` |  |  |
| `sveltekit-frontend/src/lib/components/admin/EvidenceDrawer.svelte` |  |  |
| `sveltekit-frontend/src/lib/components/admin/PipelineProgress.svelte` |  |  |
| `sveltekit-frontend/src/lib/components/admin/RoutingExplanationPanel.svelte` |  | $lib/server/retrieval/routing-explanation |
| `.claude/worktrees/agent-a7203461/sveltekit-frontend/src/lib/components/admin/SourceProvenancePanel.svelte` |  |  |
| `sveltekit-frontend/src/lib/components/admin/SummarizeButton.svelte` | SummarizeButton | $lib/stores/admin-chat-assistant.svelte.js |
| `sveltekit-frontend/src/lib/components/admin/TagSelector.svelte` |  |  |
| `sveltekit-frontend/src/lib/components/admin/TraceCopilotPanel.svelte` | HTMLDivElement, RoutingExplanationPanel, SourceProvenancePanel, CommandSuggestPanel |  |
| `sveltekit-frontend/src/lib/components/agent/AutonomousInvestigator.svelte` | InvestigationResult, AgentCapabilities, Icon, Button | $lib/components/ui/Icon.svelte, $lib/components/ui/Button.svelte |
| `sveltekit-frontend/src/lib/components/agentic/AgentChat.svelte` |  | $lib/types/agent.js |
| `sveltekit-frontend/src/lib/components/agentic/AgenticController.svelte` | AgenticStatus, File |  |
| `sveltekit-frontend/src/lib/components/ai/ACEContextBubble.svelte` |  |  |
| `sveltekit-frontend/src/lib/components/ai/AIAssistantButton.svelte` | Badge | $lib/components/ui/badge/Badge.svelte, $lib/utils |
| `sveltekit-frontend/src/lib/components/ai/AIAssistantPanel.svelte` | Button | $lib/components/ui/Button.svelte, $lib/stores/unified/ai-assistant-store.svelte.js |
| `sveltekit-frontend/src/lib/components/ai/AIButton.svelte` | HTMLButtonElement |  |
| `sveltekit-frontend/src/lib/components/ai/AIChatWidget.svelte` | Button, Icon, SimpleWorkingChat | $lib/components/ui/Button.svelte, $lib/components/ui/Icon.svelte |
| `sveltekit-frontend/src/lib/components/ai/AIRecommendation.svelte` | Icon | $lib/ai/client-cache.js, $lib/components/ui/Icon.svelte |
| `sveltekit-frontend/src/lib/components/ai/AIStatusIndicator.svelte` |  |  |
| `sveltekit-frontend/src/lib/components/ai/AskAI.svelte` | HTMLTextAreaElement, HTMLDivElement |  |
| `sveltekit-frontend/src/lib/components/ai/AuditResults.svelte` | Icon, Button | $lib/components/ui/Icon.svelte, $lib/components/ui/Button.svelte |
| `sveltekit-frontend/src/lib/components/ai/AutomatedLegalResearch.svelte` |  |  |
| `sveltekit-frontend/src/lib/components/ai/BifrostProgressCanvas.svelte` |  | $lib/state/ai-os-state.svelte |
| `sveltekit-frontend/src/lib/components/ai/CachePerformanceDashboard.svelte` |  |  |
| `sveltekit-frontend/src/lib/components/ai/CaseScoringDashboard/CaseScoringDashboard.svelte` |  |  |
| `sveltekit-frontend/src/lib/components/ai/CaseScoringDashboard.svelte` | Icon | $lib/components/ui/Icon.svelte |
| `sveltekit-frontend/src/lib/components/ai/ChatFeedback.svelte` | Icon | $lib/components/ui/Icon.svelte |
| `sveltekit-frontend/src/lib/components/ai/ChatMessage.svelte` | HTMLDivElement, FeedbackButtons, Button | $lib/components/ui/Button.svelte, $lib/components/ui/FeedbackButtons.svelte |
| `sveltekit-frontend/src/lib/components/ai/ClientSideAIChat.svelte` | Badge |  |
| `sveltekit-frontend/src/lib/components/ai/ContextualChatDemo.svelte` | ContextualState | $lib/types/sharedTypes |
| `sveltekit-frontend/src/lib/components/ai/ContextualEvidenceChatModal.svelte` | File, FeedbackButtons | $lib/types/sharedTypes, $lib/components/ui/FeedbackButtons.svelte |
| `sveltekit-frontend/src/lib/components/ai/DeedAnalysis.svelte` | Icon | $lib/components/ui/Icon.svelte |
| `sveltekit-frontend/src/lib/components/ai/DocumentUploadSimulator.svelte` | Icon, Button | $lib/components/ui/Icon.svelte, $lib/components/ui/Button.svelte |
| `sveltekit-frontend/src/lib/components/ai/EnhancedAIChatTest.svelte` | DialogRoot, Button, DialogOverlay, DialogContent | $lib/types, $lib/types, $lib/components/ui/dialog |
| `sveltekit-frontend/src/lib/components/ai/EnhancedDocumentUploader.svelte` | UploadFile, HTMLInputElement, HTMLDivElement, Progress | $lib/components/ui/Button.svelte, $lib/components/ui/Progress.svelte |
| `sveltekit-frontend/src/lib/components/ai/EnhancedFileUpload.svelte` | WebSocket | $lib/types, $lib/machines/uploadMachine, $lib/types/upload |
| `sveltekit-frontend/src/lib/components/ai/EnhancedInlineEditor.svelte` | HTMLDivElement |  |
| `sveltekit-frontend/src/lib/components/ai/EnhancedLegalAIChatWithSynthesis.svelte` | Date, Button, TypewriterResponse | $lib/components/ui/Button.svelte, $lib/components/ui/Icon.svelte, $lib/utils/ollama |
| `sveltekit-frontend/src/lib/components/ai/FloatingChatModal.svelte` | File, HTMLElement | $lib/models/ChatSession.svelte.js |
| `sveltekit-frontend/src/lib/components/ai/GamingAIButton.svelte` |  | $lib/components/ui/Icon.svelte |
| `sveltekit-frontend/src/lib/components/ai/Gemma270MWebAssembly.svelte` | File, Float32Array | $lib/ai/client-embed.js, $lib/ai/onnx/session.js, $lib/ai/client-cache.js |
| `sveltekit-frontend/src/lib/components/ai/GPUAIAssistant.svelte` | Icon, Button | $lib/components/ui/Icon.svelte, $lib/components/ui/Button.svelte |
| `sveltekit-frontend/src/lib/components/ai/IntelligentModelOrchestrator.svelte` |  |  |
| `sveltekit-frontend/src/lib/components/ai/LegalDocumentDrafting.svelte` | DocCategory, Icon, Button | $lib/components/ui/Icon.svelte, $lib/components/ui/Button.svelte |
| `sveltekit-frontend/src/lib/components/ai/LegalDocumentSummarizer.svelte` | SummarizationResponse, Button | $lib/components/ui/card/Card.svelte, $lib/components/ui/card/CardHeader.svelte, $lib/components/ui/card/CardTitle.svelte |
| `sveltekit-frontend/src/lib/components/ai/LLMSelector.svelte` | Icon, Button | $lib/components/ui/Icon.svelte, $lib/components/ui/Button.svelte, $lib/utils/ollama |
| `sveltekit-frontend/src/lib/components/ai/LocalImageGenerator.svelte` | ImageResult, Icon, Button | $lib/components/ui/Icon.svelte, $lib/components/ui/Button.svelte |
| `sveltekit-frontend/src/lib/components/ai/ProactiveAIAssistant.svelte` | Icon | $lib/components/ui/Icon.svelte |
| `sveltekit-frontend/src/lib/components/ai/QLoRAMonitoringDashboard.svelte` | TrainingStatus, Icon, Button | $lib/components/ui/Icon.svelte, $lib/components/ui/Button.svelte |
| `sveltekit-frontend/src/lib/components/ai/RAGAssistantChat.svelte` | HTMLDivElement, Icon | $lib/components/ui/Icon.svelte, $lib/utils |

---

## Top External Module Imports
| Module | Consumer Count |
|--------|----------------|
| `@sveltejs/kit` | 5079 |
| `node:path` | 3454 |
| `node:fs` | 2946 |
| `vitest` | 2757 |
| `node:url` | 2494 |
| `path` | 2443 |
| `zod` | 2036 |
| `fs` | 1903 |
| `drizzle-orm` | 1830 |
| `pg` | 1557 |
| `$lib/server/db/client` | 1428 |
| `$lib/server/env.server.js` | 1396 |
| `node:crypto` | 1023 |
| `$lib/types` | 974 |
| `ioredis` | 872 |
| `crypto` | 867 |
| `node:child_process` | 791 |
| `url` | 786 |
| `$lib/components/ui/Icon.svelte` | 771 |
| `svelte` | 764 |
| `$lib/server/redis.js` | 699 |
| `dotenv` | 679 |
| `fs/promises` | 634 |
| `node:fs/promises` | 564 |
| `@playwright/test` | 503 |
| `drizzle-orm/pg-core` | 479 |
| `child_process` | 464 |
| `$lib/server/ollama.js` | 462 |
| `$lib/server/db/schema-postgres.js` | 442 |
| `$app/environment` | 405 |

---

## Directories with TODO/FIXME
- `scripts/api-cleanup` — 672 marker(s), score 45
- `scripts/api-cleanup/reports` — 668 marker(s), score 45
- `scripts/api-cleanup/reports/backup-2025-12-14T20-51-26-276Z` — 664 marker(s), score 45
- `sveltekit-frontend/scripts` — 108 marker(s), score 100
- `sveltekit-frontend/scripts/phase104-backups/src` — 108 marker(s), score 100
- `docker/langgraph-synthesis/.venv/Lib` — 44 marker(s), score 65
- `sveltekit-frontend/src` — 32 marker(s), score 100
- `sveltekit-frontend/src/lib` — 29 marker(s), score 100
- `sveltekit-frontend/src/lib/components` — 21 marker(s), score 85
- `.claude/worktrees/agent-a7203461` — 16 marker(s), score 100
- `.claude/worktrees/agent-a7203461/sveltekit-frontend` — 12 marker(s), score 100
- `src/lib/server` — 8 marker(s), score 85
- `src/lib/server/labels` — 8 marker(s), score 85
- `sveltekit-frontend/src/lib/workers` — 6 marker(s), score 75
- `scripts/api-cleanup/reports/backup-2025-12-14T21-11-49-641Z` — 4 marker(s), score 72

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
