# Codebase Map — 20-Gate Deep Audit
> Generated: 2026-08-10T03:33:05.657Z
> Mode: `fast-ast` · CPU-only · No GPU required
> Regenerate: `npm run index:codebase:fast:plan`

---

## Summary
| Metric | Count |
|--------|-------|
| Files scanned | 9697 |
| Directories analysed | 258 |
| Route files | 1190 |
| Svelte components | 922 |
| API handlers | 2052 |
| API routes without auth | 38 |
| API routes without Zod | 20 |
| SSR-unsafe files | 0 |
| Svelte 4 legacy patterns | 0 |
| Hardcoded localhost refs | 747 |
| Routes without test pairing | 797 |
| Cyclic import pairs | 13 |
| Drizzle table refs | 711 |
| TODO/FIXME markers | 485 |

---

## 20-Gate Audit Summary

| Gate | Check | Pass | Fail |
|------|-------|------|------|
| G4  | Auth guard on API routes | 890 | 39 |
| G5  | Zod validation on API routes | 630 | 20 |
| G11 | No hardcoded localhost (excl env.server) | 8950 | 747 |
| G14a | No `export let` (Svelte 4 props) | 9697 | 0 |
| G14b | No `$:` reactive declarations | 9697 | 0 |
| G14c | No `on:event=` directives | 9697 | 0 |
| G14d | No `createEventDispatcher()` | 9697 | 0 |
| G14e | No runes in plain `.ts` files | 9690 | 7 |
| G15 | No SSR-unsafe globals (unguarded) | 9697 | 0 |
| G16 | Server routes have test pairing | 21 | 797 |
| G17 | Server routes have error handling | 818 | 125 |
| G20 | Cyclic import pairs | — | 13 |

---

## Directory Scorecard (258 dirs · lowest score = most attention needed)

**Score factors**: Auth/API coverage 25pts · Zod coverage 15pts · Drizzle ref 10pts · No TODOs 15pts · SSR-safe 10pts · No Svelte4 10pts · No localhost 5pts · Error handling 5pts · Non-empty 5pts

**Flags**: 🔴ssr = SSR-unsafe globals · 🟡sv4 = Svelte4 legacy · 🟠lh = localhost hardcoded · ⬜notest = routes lack tests


| Status | Directory | Score | Files | Lines | APIs | Auth/Zod | TODOs | Flags |
|--------|-----------|-------|-------|-------|------|----------|-------|-------|
| ⚠️ | `scripts/api-cleanup/reports/backup-2025-12-14T21-11-49-641Z` | 44 | 277 | 11309 | 226 | 24/27 | 37 | 🟠lh |
| ⚠️ | `scripts/api-cleanup` | 45 | 20 | 100566 | 1222 | 131/194 | 335 | 🟠lh |
| ⚠️ | `scripts/api-cleanup/reports` | 45 | 3 | 95786 | 1218 | 131/192 | 334 | 🟠lh |
| ⚠️ | `scripts/api-cleanup/reports/backup-2025-12-14T20-51-26-276Z` | 45 | 1074 | 79147 | 992 | 107/165 | 297 | 🟠lh |
| ⚠️ | `sveltekit-frontend/src/routes/.well-known` | 58 | 4 | 512 | 4 | 0/2 | 0 | ⬜notest |
| ⚠️ | `tools/agentic-research/src/local-deep-research` | 68 | 453 | 145384 | 0 | 0/37 | 1 | 🔴ssr 🟠lh |
| ✅ | `scripts/verify` | 70 | 10 | 2233 | 0 | 0/6 | 4 | 🟠lh |
| ✅ | `sveltekit-frontend/src/routes/api` | 75 | 822 | 122271 | 810 | 766/606 | 9 | 🟠lh ⬜notest |
| ✅ | `sveltekit-frontend/src/mcp` | 78 | 27 | 26167 | 0 | 3/30 | 1 | 🔴ssr 🟠lh |
| ✅ | `sveltekit-frontend/src/mcp/tools` | 80 | 10 | 3577 | 0 | 0/8 | 0 | 🔴ssr |
| ✅ | `sveltekit-frontend/src/lib/workers` | 83 | 10 | 1873 | 0 | 0/1 | 2 | — |
| ✅ | `scripts/benchmark` | 83 | 1 | 387 | 0 | 0/1 | 1 | — |
| ✅ | `scripts/executive` | 83 | 1 | 563 | 0 | 0/1 | 1 | — |
| ✅ | `sveltekit-frontend/src/lib/components` | 85 | 663 | 168771 | 0 | 0/47 | 7 | — |
| ✅ | `sveltekit-frontend/src/lib/gpu` | 85 | 30 | 8321 | 0 | 0/4 | 0 | 🟠lh |
| ✅ | `sveltekit-frontend/src/lib/utils` | 85 | 49 | 7636 | 0 | 2/7 | 0 | 🟠lh |
| ✅ | `sveltekit-frontend/src/routes/dev` | 85 | 2 | 524 | 0 | 1/1 | 0 | 🟠lh ⬜notest |
| ✅ | `scripts/agentic` | 85 | 5 | 1443 | 0 | 0/5 | 0 | 🟠lh |
| ✅ | `scripts/ai` | 85 | 4 | 357 | 0 | 0/4 | 0 | 🟠lh |
| ✅ | `scripts/atlas/ingester` | 85 | 11 | 1248 | 0 | 0/7 | 0 | 🟠lh |
| ✅ | `scripts/atlas/knowledge-layer` | 85 | 9 | 1115 | 0 | 0/0 | 0 | 🟠lh |
| ✅ | `scripts/audit` | 85 | 3 | 1039 | 0 | 0/1 | 0 | 🟠lh |
| ✅ | `scripts/cache` | 85 | 7 | 731 | 0 | 0/4 | 0 | 🟠lh |
| ✅ | `scripts/consolidate` | 85 | 5 | 1451 | 0 | 0/3 | 0 | 🟠lh |
| ✅ | `scripts/docs` | 85 | 1 | 415 | 0 | 0/0 | 0 | 🟠lh |
| ✅ | `scripts/eval` | 85 | 1 | 405 | 0 | 0/0 | 0 | 🟠lh |
| ✅ | `scripts/gpu` | 85 | 6 | 1165 | 0 | 0/1 | 0 | 🟠lh |
| ✅ | `scripts/graph` | 85 | 5 | 1141 | 0 | 0/4 | 0 | 🟠lh |
| ✅ | `scripts/operator` | 85 | 3 | 681 | 0 | 0/2 | 0 | 🟠lh |
| ✅ | `scripts/phase-b` | 85 | 1 | 417 | 0 | 0/1 | 0 | 🟠lh |
| ✅ | `scripts/skills` | 85 | 2 | 808 | 0 | 0/1 | 0 | 🟠lh |
| ✅ | `scripts/startup` | 85 | 19 | 3733 | 0 | 1/5 | 0 | 🟠lh |
| ✅ | `scripts/vector` | 85 | 1 | 123 | 0 | 0/0 | 0 | 🟠lh |
| ✅ | `scripts/workers` | 85 | 3 | 595 | 0 | 0/2 | 0 | 🟠lh |
| ✅ | `scripts/agent` | 88 | 9 | 2328 | 0 | 0/4 | 2 | 🟠lh |
| ✅ | `scripts/phase85` | 88 | 27 | 7701 | 0 | 0/7 | 1 | 🟠lh |
| ✅ | `sveltekit-frontend/src/lib/agent` | 90 | 16 | 1550 | 0 | 0/2 | 0 | — |
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
| ✅ | `sveltekit-frontend/src/lib/mcp` | 90 | 2 | 11 | 0 | 0/0 | 0 | — |
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
| ✅ | `sveltekit-frontend/src/routes/(admin)` | 90 | 3 | 634 | 0 | 3/0 | 0 | — |
| ✅ | `sveltekit-frontend/src/routes/(analysis)` | 90 | 8 | 2992 | 0 | 4/0 | 0 | ⬜notest |
| ✅ | `sveltekit-frontend/src/routes/(analysis)@` | 90 | 8 | 2719 | 0 | 4/0 | 0 | ⬜notest |
| ✅ | `sveltekit-frontend/src/routes/(dev)` | 90 | 13 | 2336 | 0 | 1/1 | 0 | ⬜notest |
| ✅ | `sveltekit-frontend/src/routes/debug` | 90 | 1 | 198 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/src/routes/minio` | 90 | 1 | 8 | 0 | 0/0 | 0 | ⬜notest |
| ✅ | `sveltekit-frontend/src/routes/seaweed` | 90 | 1 | 7 | 0 | 0/0 | 0 | ⬜notest |
| ✅ | `sveltekit-frontend/src/shims` | 90 | 1 | 1 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/src/stores` | 90 | 1 | 47 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/src/tests` | 90 | 1 | 10 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/src/wasm` | 90 | 2 | 524 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/src/workers` | 90 | 3 | 282 | 0 | 0/0 | 0 | — |
| ✅ | `scripts/agents` | 90 | 2 | 117 | 0 | 0/1 | 0 | — |
| ✅ | `scripts/ai-os` | 90 | 3 | 91 | 0 | 0/2 | 0 | — |
| ✅ | `scripts/analysis` | 90 | 4 | 199 | 0 | 0/0 | 0 | — |
| ✅ | `scripts/analysis_reports` | 90 | 12 | 5205 | 0 | 0/0 | 0 | — |
| ✅ | `scripts/atlas/fixtures` | 90 | 3 | 74 | 0 | 0/0 | 0 | — |
| ✅ | `scripts/atlas/helpers` | 90 | 6 | 1167 | 0 | 0/3 | 0 | — |
| ✅ | `scripts/atlas/out` | 90 | 4 | 3391 | 0 | 0/0 | 0 | — |
| ✅ | `scripts/atlas/sparse` | 90 | 1 | 290 | 0 | 0/0 | 0 | — |
| ✅ | `scripts/atlas/sparse/lib` | 90 | 2 | 146 | 0 | 0/0 | 0 | — |
| ✅ | `scripts/bench` | 90 | 2 | 250 | 0 | 0/1 | 0 | — |
| ✅ | `scripts/case_data/_cache` | 90 | 146 | 146 | 0 | 0/0 | 0 | — |
| ✅ | `scripts/court_data/constitutions` | 90 | 9 | 1180 | 0 | 0/0 | 0 | — |
| ✅ | `scripts/dev` | 90 | 4 | 345 | 0 | 0/2 | 0 | — |
| ✅ | `scripts/engram` | 90 | 1 | 4 | 0 | 0/0 | 0 | — |
| ✅ | `scripts/env` | 90 | 1 | 193 | 0 | 0/0 | 0 | — |
| ✅ | `scripts/error-resolution` | 90 | 4 | 5168 | 0 | 0/2 | 0 | — |
| ✅ | `scripts/error-resolution/services` | 90 | 6 | 1938 | 0 | 0/2 | 0 | — |
| ✅ | `scripts/error-resolution/tests` | 90 | 6 | 2718 | 0 | 0/0 | 0 | — |
| ✅ | `scripts/eval/data` | 90 | 1 | 164 | 0 | 0/0 | 0 | — |
| ✅ | `scripts/evals` | 90 | 1 | 400 | 0 | 0/0 | 0 | — |
| ✅ | `scripts/graphify/lib` | 90 | 1 | 183 | 0 | 0/0 | 0 | — |
| ✅ | `scripts/graphify/stages` | 90 | 2 | 420 | 0 | 0/0 | 0 | — |
| ✅ | `scripts/lib` | 90 | 2 | 257 | 0 | 0/0 | 0 | — |
| ✅ | `scripts/mapreduce` | 90 | 2 | 88 | 0 | 0/0 | 0 | — |
| ✅ | `scripts/memory/graphify/gds` | 90 | 8 | 286798 | 0 | 0/0 | 0 | — |
| ✅ | `scripts/native` | 90 | 3 | 836 | 0 | 0/2 | 0 | — |
| ✅ | `scripts/nats` | 90 | 3 | 675 | 0 | 0/1 | 0 | — |
| ✅ | `scripts/ontology` | 90 | 5 | 843 | 0 | 0/2 | 0 | — |
| ✅ | `scripts/openspec` | 90 | 1 | 221 | 0 | 0/0 | 0 | — |
| ✅ | `scripts/phase-3d` | 90 | 1 | 174 | 0 | 0/0 | 0 | — |
| ✅ | `scripts/phase-c` | 90 | 4 | 771 | 0 | 0/0 | 0 | — |
| ✅ | `scripts/phase-d` | 90 | 1 | 255 | 0 | 0/0 | 0 | — |
| ✅ | `scripts/phase-d-plus-1` | 90 | 1 | 236 | 0 | 0/0 | 0 | — |
| ✅ | `scripts/phase-d-plus-2` | 90 | 1 | 222 | 0 | 0/0 | 0 | — |
| ✅ | `scripts/phase-e` | 90 | 1 | 324 | 0 | 0/0 | 0 | — |
| ✅ | `scripts/redis` | 90 | 1 | 133 | 0 | 0/1 | 0 | — |
| ✅ | `scripts/reports` | 90 | 4 | 228 | 0 | 0/2 | 0 | — |
| ✅ | `scripts/semantic-valkey` | 90 | 1 | 137 | 0 | 0/0 | 0 | — |
| ✅ | `scripts/sidecars` | 90 | 2 | 561 | 0 | 0/0 | 0 | — |
| ✅ | `scripts/simd` | 90 | 14 | 1155 | 0 | 0/10 | 0 | — |
| ✅ | `scripts/simdtest` | 90 | 3 | 192 | 0 | 0/3 | 0 | — |
| ✅ | `scripts/startup/lib` | 90 | 2 | 204 | 0 | 0/2 | 0 | — |
| ✅ | `scripts/sync-labels` | 90 | 2 | 68 | 0 | 0/0 | 0 | — |
| ✅ | `scripts/test/evaluation` | 90 | 3 | 366 | 0 | 0/0 | 0 | — |
| ✅ | `scripts/tests/agent-investigate-results` | 90 | 11 | 996 | 0 | 0/0 | 0 | — |
| ✅ | `scripts/tests/performance-results` | 90 | 22 | 414 | 0 | 0/0 | 0 | — |
| ✅ | `scripts/tests/screenshots/2026-02-21T20-52-49` | 90 | 1 | 187 | 0 | 0/0 | 0 | — |
| ✅ | `scripts/tests/screenshots/2026-02-21T21-06-55` | 90 | 1 | 187 | 0 | 0/0 | 0 | — |
| ✅ | `scripts/tests/screenshots/2026-02-22T00-35-12` | 90 | 1 | 187 | 0 | 0/0 | 0 | — |
| ✅ | `scripts/tests/screenshots/2026-02-22T00-49-32` | 90 | 1 | 187 | 0 | 0/0 | 0 | — |
| ✅ | `scripts/tests/screenshots/2026-02-22T00-49-46` | 90 | 1 | 187 | 0 | 0/0 | 0 | — |
| ✅ | `scripts/tests/screenshots/2026-02-22T17-28-20` | 90 | 1 | 187 | 0 | 0/0 | 0 | — |
| ✅ | `scripts/tests/screenshots/2026-04-04T03-39-00` | 90 | 1 | 1467 | 0 | 0/0 | 0 | — |
| ✅ | `scripts/tests/screenshots/2026-04-06T05-26-41` | 90 | 1 | 1156 | 0 | 0/0 | 0 | — |
| ✅ | `scripts/tests/screenshots/2026-04-06T06-27-46` | 90 | 1 | 3864 | 0 | 0/0 | 0 | — |
| ✅ | `scripts/tests/screenshots/2026-04-06T07-29-27` | 90 | 1 | 41 | 0 | 0/0 | 0 | — |
| ✅ | `scripts/tests/screenshots/2026-04-06T17-02-55` | 90 | 1 | 64 | 0 | 0/0 | 0 | — |
| ✅ | `scripts/tests/screenshots/2026-04-06T17-03-31` | 90 | 1 | 40 | 0 | 0/0 | 0 | — |
| ✅ | `scripts/tests/screenshots/2026-04-06T17-03-45` | 90 | 1 | 40 | 0 | 0/0 | 0 | — |
| ✅ | `scripts/tests/screenshots/2026-04-06T17-55-27` | 90 | 1 | 1186 | 0 | 0/0 | 0 | — |
| ✅ | `scripts/tests/screenshots/2026-04-06T20-26-24` | 90 | 1 | 37 | 0 | 0/0 | 0 | — |
| ✅ | `scripts/tests/screenshots/2026-04-06T20-26-58` | 90 | 1 | 283 | 0 | 0/0 | 0 | — |
| ✅ | `scripts/tests/screenshots/2026-04-07T00-47-54` | 90 | 1 | 37 | 0 | 0/0 | 0 | — |
| ✅ | `scripts/tests/screenshots/2026-04-07T00-48-09` | 90 | 1 | 1619 | 0 | 0/0 | 0 | — |
| ✅ | `scripts/tests/screenshots/2026-04-07T00-58-34` | 90 | 1 | 37 | 0 | 0/0 | 0 | — |
| ✅ | `scripts/tests/screenshots/2026-04-07T01-07-53` | 90 | 1 | 1168 | 0 | 0/0 | 0 | — |
| ✅ | `scripts/tests/screenshots/2026-04-08T21-29-20` | 90 | 1 | 1863 | 0 | 0/0 | 0 | — |
| ✅ | `scripts/tests/screenshots/2026-04-09T02-36-04` | 90 | 1 | 923 | 0 | 0/0 | 0 | — |
| ✅ | `scripts/tests/screenshots/2026-04-09T02-37-53` | 90 | 1 | 917 | 0 | 0/0 | 0 | — |
| ✅ | `scripts/tests/screenshots/2026-04-09T02-39-16` | 90 | 1 | 917 | 0 | 0/0 | 0 | — |
| ✅ | `scripts/tests/screenshots/2026-04-09T02-39-46` | 90 | 1 | 917 | 0 | 0/0 | 0 | — |
| ✅ | `scripts/tests/screenshots/2026-04-09T02-43-33` | 90 | 1 | 1166 | 0 | 0/0 | 0 | — |
| ✅ | `scripts/tests/screenshots/2026-04-09T02-43-44` | 90 | 1 | 1161 | 0 | 0/0 | 0 | — |
| ✅ | `scripts/tests/screenshots/2026-04-11T20-13-43` | 90 | 1 | 1165 | 0 | 0/0 | 0 | — |
| ✅ | `scripts/tests/screenshots/2026-04-11T21-23-55` | 90 | 1 | 1172 | 0 | 0/0 | 0 | — |
| ✅ | `scripts/tests/screenshots/2026-04-11T23-15-43` | 90 | 1 | 40 | 0 | 0/0 | 0 | — |
| ✅ | `scripts/tests/screenshots/2026-04-12T23-17-00` | 90 | 1 | 41 | 0 | 0/0 | 0 | — |
| ✅ | `scripts/tests/screenshots/2026-04-12T23-17-32` | 90 | 1 | 40 | 0 | 0/0 | 0 | — |
| ✅ | `scripts/tests/screenshots/2026-04-12T23-21-09` | 90 | 1 | 60 | 0 | 0/0 | 0 | — |
| ✅ | `scripts/tests/screenshots/2026-04-12T23-21-29` | 90 | 1 | 60 | 0 | 0/0 | 0 | — |
| ✅ | `scripts/tests/screenshots/2026-04-12T23-23-34` | 90 | 1 | 60 | 0 | 0/0 | 0 | — |
| ✅ | `scripts/tests/screenshots/2026-04-12T23-25-33` | 90 | 1 | 40 | 0 | 0/0 | 0 | — |
| ✅ | `scripts/tests/screenshots/2026-04-12T23-26-56` | 90 | 1 | 40 | 0 | 0/0 | 0 | — |
| ✅ | `scripts/tests/screenshots/2026-04-12T23-32-42` | 90 | 1 | 40 | 0 | 0/0 | 0 | — |
| ✅ | `scripts/tests/screenshots/2026-04-12T23-37-35` | 90 | 1 | 41 | 0 | 0/0 | 0 | — |
| ✅ | `scripts/tests/screenshots/2026-04-12T23-39-11` | 90 | 1 | 40 | 0 | 0/0 | 0 | — |
| ✅ | `scripts/tests/screenshots/2026-04-12T23-39-46` | 90 | 1 | 40 | 0 | 0/0 | 0 | — |
| ✅ | `scripts/tests/screenshots/2026-04-12T23-39-48` | 90 | 1 | 40 | 0 | 0/0 | 0 | — |
| ✅ | `scripts/tests/screenshots/2026-04-12T23-43-53` | 90 | 1 | 35 | 0 | 0/0 | 0 | — |
| ✅ | `scripts/tests/screenshots/2026-04-12T23-45-38` | 90 | 1 | 41 | 0 | 0/0 | 0 | — |
| ✅ | `scripts/tests/screenshots/2026-04-12T23-46-11` | 90 | 1 | 41 | 0 | 0/0 | 0 | — |
| ✅ | `scripts/tests/screenshots/2026-04-12T23-46-15` | 90 | 1 | 40 | 0 | 0/0 | 0 | — |
| ✅ | `scripts/tests/screenshots/2026-04-12T23-46-19` | 90 | 1 | 40 | 0 | 0/0 | 0 | — |
| ✅ | `scripts/tests/screenshots/2026-04-12T23-46-34` | 90 | 1 | 40 | 0 | 0/0 | 0 | — |
| ✅ | `scripts/tests/screenshots/2026-04-12T23-47-31` | 90 | 1 | 40 | 0 | 0/0 | 0 | — |
| ✅ | `scripts/tests/screenshots/2026-04-12T23-47-33` | 90 | 1 | 40 | 0 | 0/0 | 0 | — |
| ✅ | `scripts/tests/screenshots/2026-04-12T23-47-35` | 90 | 1 | 40 | 0 | 0/0 | 0 | — |
| ✅ | `scripts/tests/screenshots/2026-04-15T03-37-52` | 90 | 1 | 180 | 0 | 0/0 | 0 | — |
| ✅ | `scripts/tests/screenshots/2026-04-15T04-06-50` | 90 | 1 | 1169 | 0 | 0/0 | 0 | — |
| ✅ | `scripts/tests/screenshots/2026-04-17T04-16-10` | 90 | 1 | 61 | 0 | 0/0 | 0 | — |
| ✅ | `scripts/tests/screenshots/2026-04-17T04-17-15` | 90 | 1 | 40 | 0 | 0/0 | 0 | — |
| ✅ | `scripts/tests/screenshots/2026-04-17T04-19-14` | 90 | 1 | 2246 | 0 | 0/0 | 0 | — |
| ✅ | `scripts/tests/screenshots/2026-04-17T04-40-11` | 90 | 1 | 1162 | 0 | 0/0 | 0 | — |
| ✅ | `scripts/tests/screenshots/2026-04-17T04-45-07` | 90 | 1 | 1173 | 0 | 0/0 | 0 | — |
| ✅ | `scripts/tests/screenshots/2026-04-18T01-11-27` | 90 | 1 | 63 | 0 | 0/0 | 0 | — |
| ✅ | `scripts/tests/screenshots/2026-04-18T01-12-20` | 90 | 1 | 63 | 0 | 0/0 | 0 | — |
| ✅ | `scripts/tests/screenshots/2026-04-18T02-59-52` | 90 | 1 | 40 | 0 | 0/0 | 0 | — |
| ✅ | `scripts/tests/screenshots/cases-ui` | 90 | 1 | 56 | 0 | 0/0 | 0 | — |
| ✅ | `scripts/tests/screenshots/glossary` | 90 | 1 | 70 | 0 | 0/0 | 0 | — |
| ✅ | `scripts/tests/screenshots/latest` | 90 | 1 | 40 | 0 | 0/0 | 0 | — |
| ✅ | `scripts/tests/screenshots/production-proof` | 90 | 1 | 1172 | 0 | 0/0 | 0 | — |
| ✅ | `scripts/tests/vlm-tests` | 90 | 6 | 6 | 0 | 0/0 | 0 | — |
| ✅ | `scripts/unsloth-training/COLAB_PACKAGE/training-datasets` | 90 | 1 | 99 | 0 | 0/0 | 0 | — |
| ✅ | `scripts/validate` | 90 | 1 | 582 | 0 | 0/1 | 0 | — |
| ✅ | `scripts/valkey` | 90 | 3 | 234 | 0 | 0/3 | 0 | — |
| ✅ | `tests/atlas` | 90 | 9 | 932 | 0 | 0/2 | 0 | — |
| ✅ | `tests/fixtures` | 90 | 1 | 59 | 0 | 0/0 | 0 | — |
| ✅ | `tests/hmm` | 90 | 1 | 64 | 0 | 0/1 | 0 | — |
| ✅ | `tests/integration` | 90 | 1 | 162 | 0 | 0/0 | 0 | — |
| ✅ | `tests/opencode` | 90 | 1 | 339 | 0 | 0/1 | 0 | — |
| ✅ | `tests/retrieval` | 90 | 5 | 1280 | 0 | 0/0 | 0 | — |
| ✅ | `test/services` | 90 | 1 | 178 | 0 | 0/1 | 0 | — |
| ✅ | `simd-bridge/build-x64-cuda/.cmake/api` | 90 | 34 | 7910 | 0 | 0/0 | 0 | — |
| ✅ | `simd-bridge/build-x64-cuda/CMakeFiles` | 90 | 1 | 9 | 0 | 0/0 | 0 | — |
| ✅ | `simd-bridge/build-x64-cuda/cpp/CMakeFiles` | 90 | 1 | 8 | 0 | 0/0 | 0 | — |
| ✅ | `simd-bridge/cpp` | 90 | 2 | 750 | 0 | 0/1 | 0 | — |
| ✅ | `simd-bridge/cpp/build-verify-2026-05-31T08-06-57-567Z/CMakeFiles` | 90 | 1 | 8 | 0 | 0/0 | 0 | — |
| ✅ | `simd-bridge/cpp/build-x64-cuda/CMakeFiles` | 90 | 2 | 16 | 0 | 0/0 | 0 | — |
| ✅ | `simd-bridge/cpp/build-x64-cuda-cublas/CMakeFiles` | 90 | 2 | 16 | 0 | 0/0 | 0 | — |
| ✅ | `simd-bridge/cpp/build-x64-cuda-cuvs/CMakeFiles` | 90 | 2 | 16 | 0 | 0/0 | 0 | — |
| ✅ | `simd-bridge/cpp/build-x64-fallback/CMakeFiles` | 90 | 1 | 8 | 0 | 0/0 | 0 | — |
| ✅ | `simd-bridge/examples` | 90 | 2 | 30 | 0 | 0/0 | 0 | — |
| ✅ | `simd-bridge/rust/graph-engine` | 90 | 3 | 88 | 0 | 0/0 | 0 | — |
| ✅ | `simd-bridge/rust/graph-engine/target` | 90 | 55 | 55 | 0 | 0/0 | 0 | — |
| ✅ | `simd-bridge/rust/hmm-repair` | 90 | 3 | 134 | 0 | 0/0 | 0 | — |
| ✅ | `simd-bridge/rust/hmm-repair/target` | 90 | 101 | 101 | 0 | 0/0 | 0 | — |
| ✅ | `simd-bridge/rust-simdjson/target` | 90 | 1 | 166 | 0 | 0/0 | 0 | — |
| ✅ | `simd-bridge/rust-simdjson/target/debug` | 90 | 76 | 76 | 0 | 0/0 | 0 | — |
| ✅ | `simd-bridge/rust-simdjson/target/release` | 90 | 89 | 89 | 0 | 0/0 | 0 | — |
| ✅ | `simd-bridge/simd-bridge/build-x64-cuda/.cmake` | 90 | 34 | 7910 | 0 | 0/0 | 0 | — |
| ✅ | `simd-bridge/simd-bridge/build-x64-cuda/CMakeFiles` | 90 | 1 | 9 | 0 | 0/0 | 0 | — |
| ✅ | `simd-bridge/simd-bridge/build-x64-cuda/cpp` | 90 | 1 | 8 | 0 | 0/0 | 0 | — |
| ✅ | `drizzle/meta` | 90 | 2 | 2281 | 0 | 0/0 | 0 | — |
| ✅ | `tools/agentic-research/node` | 90 | 2 | 173 | 0 | 0/0 | 0 | — |
| ✅ | `tools/agentic-research/scaffolds` | 90 | 1 | 17 | 0 | 0/0 | 0 | — |
| ✅ | `tools/parent-atlas-qdrant-postgres-toolkit/scripts/qdrant` | 90 | 1 | 122 | 0 | 0/1 | 0 | — |
| ✅ | `next_steps/active` | 90 | 1 | 232175 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/src/routes` | 91 | 6 | 263446 | 818 | 1263/666 | 10 | 🟠lh ⬜notest |
| ✅ | `sveltekit-frontend/src` | 93 | 17 | 960430 | 824 | 1289/1339 | 90 | 🔴ssr 🟠lh ⬜notest |
| ✅ | `scripts/docs-atlas` | 95 | 12 | 1881 | 0 | 0/5 | 0 | 🟠lh |
| ✅ | `scripts/graphify-audit` | 95 | 4 | 1395 | 0 | 0/3 | 0 | 🟠lh |
| ✅ | `scripts/ingest` | 95 | 24 | 3415 | 0 | 0/17 | 0 | 🟠lh |
| ✅ | `scripts/memory` | 95 | 5 | 287446 | 0 | 0/2 | 0 | 🟠lh |
| ✅ | `scripts/opencode` | 95 | 75 | 10958 | 0 | 0/63 | 0 | 🟠lh |
| ✅ | `scripts/qdrant` | 95 | 3 | 302 | 0 | 0/1 | 0 | 🟠lh |
| ✅ | `scripts/smoke` | 95 | 15 | 2406 | 0 | 0/6 | 0 | 🟠lh |
| ✅ | `sveltekit-frontend/src/lib` | 100 | 11 | 664278 | 6 | 22/639 | 79 | 🟠lh |
| ✅ | `sveltekit-frontend/src/lib/data` | 100 | 5 | 1687 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/src/lib/db` | 100 | 12 | 2542 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/src/lib/intent` | 100 | 1 | 239 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/src/lib/phase72` | 100 | 1 | 394 | 0 | 0/1 | 0 | — |
| ✅ | `sveltekit-frontend/src/lib/server` | 100 | 1955 | 404035 | 6 | 19/536 | 70 | 🟠lh |
| ✅ | `sveltekit-frontend/src/lib/shims` | 100 | 11 | 1248 | 0 | 0/1 | 0 | — |
| ✅ | `sveltekit-frontend/src/lib/types` | 100 | 56 | 7347 | 0 | 0/5 | 0 | — |
| ✅ | `sveltekit-frontend/src/routes/(app)` | 100 | 478 | 123896 | 4 | 478/48 | 1 | 🟠lh ⬜notest |
| ✅ | `sveltekit-frontend/src/routes/admin` | 100 | 4 | 2707 | 0 | 2/2 | 0 | ⬜notest |
| ✅ | `sveltekit-frontend/src/routes/atlas` | 100 | 2 | 437 | 0 | 0/1 | 0 | ⬜notest |
| ✅ | `sveltekit-frontend/src/routes/dashboard` | 100 | 2 | 351 | 0 | 0/0 | 0 | ⬜notest |
| ✅ | `sveltekit-frontend/src/routes/login` | 100 | 3 | 506 | 0 | 1/3 | 0 | ⬜notest |
| ✅ | `sveltekit-frontend/src/routes/register` | 100 | 3 | 627 | 0 | 1/2 | 0 | ⬜notest |
| ✅ | `sveltekit-frontend/src/types` | 100 | 26 | 944 | 0 | 0/1 | 0 | — |
| ✅ | `scripts/atlas` | 100 | 1207 | 330657 | 3 | 0/492 | 6 | 🟠lh |
| ✅ | `scripts/atlas/lib` | 100 | 48 | 6357 | 1 | 0/13 | 0 | 🟠lh |
| ✅ | `scripts/atlas/schema` | 100 | 6 | 1365 | 0 | 0/4 | 0 | — |
| ✅ | `scripts/db-tests` | 100 | 6 | 280 | 0 | 0/0 | 0 | — |
| ✅ | `scripts/graphify` | 100 | 4 | 1003 | 0 | 0/2 | 0 | — |
| ✅ | `scripts/packets` | 100 | 21 | 4332 | 0 | 0/13 | 0 | — |
| ✅ | `scripts/postgres` | 100 | 1 | 347 | 0 | 0/0 | 0 | — |
| ✅ | `scripts/promotion` | 100 | 7 | 1873 | 0 | 0/5 | 0 | — |
| ✅ | `scripts/tests` | 100 | 83 | 45197 | 1 | 2/13 | 0 | 🟠lh |
| ✅ | `tests/classifier` | 100 | 4 | 927 | 0 | 0/0 | 0 | — |
| ✅ | `drizzle/migrations` | 100 | 1 | 38 | 0 | 0/0 | 0 | — |
| ✅ | `drizzle/schema` | 100 | 1 | 25 | 0 | 0/0 | 0 | — |
| ✅ | `tools/agentic-research/src/firecrawl` | 100 | 657 | 179098 | 1 | 0/166 | 41 | 🟠lh |
| ✅ | `tools/parent-atlas-qdrant-postgres-toolkit/scripts/postgres` | 100 | 1 | 47 | 0 | 0/0 | 0 | — |

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

## G14 — Svelte 4 Legacy Patterns (0 files)
_No Svelte 4 patterns found. ✅_

---

## G15 — SSR-Unsafe Globals (0 files · unguarded window/document/localStorage)
_No unguarded SSR-unsafe globals. ✅_

---

## G16 — Routes Without Test Pairing (797)
- `sveltekit-frontend/src/routes/(app)/admin/api-testing/agentic-events/+server.ts` · GET
- `sveltekit-frontend/src/routes/(app)/admin/api-testing/agentic-loop/+server.ts` · POST/GET
- `sveltekit-frontend/src/routes/(app)/admin/api-testing/ast-topology/+server.ts` · GET
- `sveltekit-frontend/src/routes/(app)/evidence/+server.ts` · GET/POST
- `sveltekit-frontend/src/routes/.well-known/agent.json/+server.ts` · GET
- `sveltekit-frontend/src/routes/.well-known/appspecific/com.chrome.devtools.json/+server.ts` · GET
- `sveltekit-frontend/src/routes/.well-known/llms-full.txt/+server.ts` · GET
- `sveltekit-frontend/src/routes/.well-known/llms.txt/+server.ts` · GET
- `sveltekit-frontend/src/routes/api/ace/agent/+server.ts` · POST
- `sveltekit-frontend/src/routes/api/ace/ask/+server.ts` · POST
- `sveltekit-frontend/src/routes/api/ace/context/+server.ts` · POST
- `sveltekit-frontend/src/routes/api/ace/error-kag/+server.ts` · POST
- `sveltekit-frontend/src/routes/api/ace/health/+server.ts` · GET
- `sveltekit-frontend/src/routes/api/ace/ingest/+server.ts` · POST
- `sveltekit-frontend/src/routes/api/ace/packet/+server.ts` · POST/GET
- `sveltekit-frontend/src/routes/api/ace/packets/+server.ts` · POST/GET
- `sveltekit-frontend/src/routes/api/ace/policy-orchestrator/+server.ts` · POST/GET
- `sveltekit-frontend/src/routes/api/ace/rank/+server.ts` · POST
- `sveltekit-frontend/src/routes/api/ace/recommendations/+server.ts` · GET
- `sveltekit-frontend/src/routes/api/ace/route/+server.ts` · POST
- `sveltekit-frontend/src/routes/api/ace/stage-5-policy/+server.ts` · POST
- `sveltekit-frontend/src/routes/api/ace/status/+server.ts` · GET
- `sveltekit-frontend/src/routes/api/ace/stream/+server.ts` · POST/GET
- `sveltekit-frontend/src/routes/api/ace/summarize/+server.ts` · POST
- `sveltekit-frontend/src/routes/api/acp/execute/+server.ts` · POST
- `sveltekit-frontend/src/routes/api/acp/kv-cache-stats/+server.ts` · GET
- `sveltekit-frontend/src/routes/api/acp/service-ports/+server.ts` · GET
- `sveltekit-frontend/src/routes/api/acp/tools/+server.ts` · GET
- `sveltekit-frontend/src/routes/api/admin/ace-metrics/+server.ts` · GET
- `sveltekit-frontend/src/routes/api/admin/agent/fix/+server.ts` · POST

---

## G11 — Hardcoded Localhost References (747 files)
- `sveltekit-frontend/src/lib/gpu/gemma4-decomposition-planner.ts` · http://127.0.0.1:8090
- `sveltekit-frontend/src/lib/gpu/gemma4-synthesis-generator.ts` · http://127.0.0.1:8090, http://127.0.0.1:8090
- `sveltekit-frontend/src/lib/gpu/policy-reranker-bridge.ts` · http://localhost:8334
- `sveltekit-frontend/src/lib/server/ace/gemma4-invocation.ts` · http://127.0.0.1:8090
- `sveltekit-frontend/src/lib/server/ace/hermes-mastra-orchestrator.ts` · http://127.0.0.1:8090, http://127.0.0.1:8788
- `sveltekit-frontend/src/lib/server/ace/multihop-contextual-tree.ts` · http://127.0.0.1:6333
- `sveltekit-frontend/src/lib/server/ace/phase110-end-to-end-retrieval-flow.ts` · http://127.0.0.1:8090
- `sveltekit-frontend/src/lib/server/ace/retrieval/evidence-lanes.ts` · http://127.0.0.1:6333
- `sveltekit-frontend/src/lib/server/ace/retrieval/hyperrag-retriever.ts` · http://127.0.0.1:8090
- `sveltekit-frontend/src/lib/server/ai/phase101-parent-atlas-packetizer.js` · http://127.0.0.1:8090, http://127.0.0.1:8090
- `sveltekit-frontend/src/lib/server/ai/prompt-router.ts` · http://127.0.0.1:11434
- `sveltekit-frontend/src/lib/server/ai/tool-selection.ts` · http://localhost:6333
- `sveltekit-frontend/src/lib/server/analysis/entity-extractor-unified.ts` · http://127.0.0.1:8090
- `sveltekit-frontend/src/lib/server/analysis/gemma4-nlp-reranker.ts` · http://127.0.0.1:8090
- `sveltekit-frontend/src/lib/server/analysis/kmeans-latent-progression.ts` · http://127.0.0.1:8791
- `sveltekit-frontend/src/lib/server/analysis/summarizer.ts` · http://127.0.0.1:8090
- `sveltekit-frontend/src/lib/server/atlas/ai/langextract-transport.ts` · http://127.0.0.1:8095
- `sveltekit-frontend/src/lib/server/atlas/feature-doc-enrichment.ts` · http://127.0.0.1:8090
- `sveltekit-frontend/src/lib/server/atlas/go-retrieval-grpc-client.ts` · http://localhost:8100, http://localhost:8100
- `sveltekit-frontend/src/lib/server/atlas/phase101-parent-atlas-packetizer.mjs` · http://127.0.0.1:3040, http://127.0.0.1:8090

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
| `$lib/server/db/client` | 567 |
| `$lib/server/env.server.js` | 471 |
| `$lib/server/redis.js` | 358 |
| `$lib/components/ui/Icon.svelte` | 260 |
| `$lib/types` | 234 |
| `$lib/server/db/schema-postgres.js` | 186 |
| `$lib/server/ollama.js` | 163 |
| `$lib/server/db` | 131 |
| `$lib/server/db/client.js` | 129 |
| `$lib/server/db/schema-postgres` | 125 |
| `$lib/server/middleware/cache-headers.js` | 110 |
| `$lib/server/vector/qdrant-manager.js` | 101 |
| `$lib/server/db/schema` | 100 |
| `$lib/components/ui/Button.svelte` | 95 |
| `$lib/server/validation.js` | 94 |
| `$lib/server/grpc/embedding-client.js` | 90 |
| `$lib/middleware/redis-orchestrator-middleware` | 60 |
| `$lib/server/ai/local-llama-provider.js` | 48 |
| `$lib/server/observability/langfuse.js` | 46 |
| `$lib/server/redis` | 46 |

---

## G20 — Cyclic Import Pairs (13 found · top 20)
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

## Svelte Components (60 shown of 922)
| File | Sub-components | Key `$lib` Imports |
|------|---------------|---------------------|
| `sveltekit-frontend/src/lib/client/ui/POIPhotoModal.svelte` | POIPhotoModalImpl | $lib/components/POIPhotoModal.svelte |
| `sveltekit-frontend/src/lib/client/ui/POIPhotoUploader.svelte` | Button |  |
| `sveltekit-frontend/src/lib/components/ActionPopup.svelte` |  |  |
| `sveltekit-frontend/src/lib/components/admin/AdminChatAssistant.svelte` | HTMLElement | $lib/utils/xstate-svelte5.svelte.js, $lib/stores/admin-chat-machine.js |
| `sveltekit-frontend/src/lib/components/admin/AdminMonitoringDashboard.svelte` | Icon | $lib/components/ui/Icon.svelte |
| `sveltekit-frontend/src/lib/components/admin/AiAnalysisPopup.svelte` | AiAnalysisPopup | $lib/components/admin/AiAnalysisPopup.svelte, $lib/stores/admin-chat-assistant.svelte.js, $lib/stores/admin-chat-assistant.svelte.js |
| `sveltekit-frontend/src/lib/components/admin/BatchSummaryUI.svelte` | SummaryJob | $lib/client/batch-summarizer |
| `sveltekit-frontend/src/lib/components/admin/BundlePreview.svelte` | BundleResponse |  |
| `sveltekit-frontend/src/lib/components/admin/CommandSuggestPanel.svelte` |  |  |
| `sveltekit-frontend/src/lib/components/admin/ContextualAssistantModal.svelte` |  | $lib/utils/xstate-svelte5.svelte.js, $lib/stores/admin-chat-machine.js, $lib/utils/ui-recon.js |
| `sveltekit-frontend/src/lib/components/admin/EvidenceDataGrid.svelte` |  |  |
| `sveltekit-frontend/src/lib/components/admin/EvidenceDrawer.svelte` |  |  |
| `sveltekit-frontend/src/lib/components/admin/PipelineProgress.svelte` |  |  |
| `sveltekit-frontend/src/lib/components/admin/RoutingExplanationPanel.svelte` |  | $lib/server/retrieval/routing-explanation |
| `sveltekit-frontend/src/lib/components/admin/SourceProvenancePanel.svelte` |  |  |
| `sveltekit-frontend/src/lib/components/admin/SummarizeButton.svelte` | SummarizeButton | $lib/stores/admin-chat-assistant.svelte.js |
| `sveltekit-frontend/src/lib/components/admin/TagSelector.svelte` |  |  |
| `sveltekit-frontend/src/lib/components/admin/TraceCopilotPanel.svelte` | HTMLDivElement, RoutingExplanationPanel, SourceProvenancePanel, CommandSuggestPanel |  |
| `sveltekit-frontend/src/lib/components/agent/AgentSpriteField.svelte` | HTMLCanvasElement | $lib/webgpu/init.js, $lib/utils/agent-visual-state.js, $lib/types/agent.js |
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
| `@sveltejs/kit` | 2169 |
| `zod` | 926 |
| `node:path` | 859 |
| `path` | 852 |
| `pg` | 781 |
| `drizzle-orm` | 752 |
| `node:fs` | 698 |
| `fs` | 627 |
| `node:url` | 626 |
| `$lib/server/db/client` | 492 |
| `$lib/server/env.server.js` | 445 |
| `node:crypto` | 380 |
| `crypto` | 349 |
| `url` | 342 |
| `dotenv` | 293 |
| `vitest` | 280 |
| `ioredis` | 272 |
| `$lib/components/ui/Icon.svelte` | 260 |
| `$lib/server/redis.js` | 257 |
| `svelte` | 257 |
| `$lib/types` | 234 |
| `node:child_process` | 205 |
| `child_process` | 198 |
| `node:fs/promises` | 185 |
| `drizzle-orm/pg-core` | 183 |
| `$lib/server/db/schema-postgres.js` | 166 |
| `fs/promises` | 165 |
| `$lib/server/ollama.js` | 148 |
| `$lib/server/db` | 129 |
| `$lib/server/db/schema-postgres` | 117 |

---

## Directories with TODO/FIXME
- `scripts/api-cleanup` — 335 marker(s), score 45
- `scripts/api-cleanup/reports` — 334 marker(s), score 45
- `scripts/api-cleanup/reports/backup-2025-12-14T20-51-26-276Z` — 297 marker(s), score 45
- `sveltekit-frontend/src` — 90 marker(s), score 93
- `sveltekit-frontend/src/lib` — 79 marker(s), score 100
- `sveltekit-frontend/src/lib/server` — 70 marker(s), score 100
- `tools/agentic-research/src/firecrawl` — 41 marker(s), score 100
- `scripts/api-cleanup/reports/backup-2025-12-14T21-11-49-641Z` — 37 marker(s), score 44
- `sveltekit-frontend/src/routes` — 10 marker(s), score 91
- `sveltekit-frontend/src/routes/api` — 9 marker(s), score 75
- `sveltekit-frontend/src/lib/components` — 7 marker(s), score 85
- `scripts/atlas` — 6 marker(s), score 100
- `scripts/verify` — 4 marker(s), score 70
- `sveltekit-frontend/src/lib/workers` — 2 marker(s), score 83
- `scripts/agent` — 2 marker(s), score 88

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
