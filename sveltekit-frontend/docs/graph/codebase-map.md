# Codebase Map — 20-Gate Deep Audit
> Generated: 2026-05-18T14:47:09.748Z
> Mode: `fast-ast` · CPU-only · No GPU required
> Regenerate: `npm run index:codebase:fast:plan`

---

## Summary
| Metric | Count |
|--------|-------|
| Files scanned | 32890 |
| Directories analysed | 1321 |
| Route files | 1045 |
| Svelte components | 5339 |
| API handlers | 5501 |
| API routes without auth | 11 |
| API routes without Zod | 1 |
| SSR-unsafe files | 0 |
| Svelte 4 legacy patterns | 119 |
| Hardcoded localhost refs | 1427 |
| Routes without test pairing | 65 |
| Cyclic import pairs | 1 |
| Drizzle table refs | 2614 |
| TODO/FIXME markers | 7697 |

---

## 20-Gate Audit Summary

| Gate | Check | Pass | Fail |
|------|-------|------|------|
| G4  | Auth guard on API routes | 800 | 2 |
| G5  | Zod validation on API routes | 551 | 1 |
| G11 | No hardcoded localhost (excl env.server) | 31463 | 1427 |
| G14a | No `export let` (Svelte 4 props) | 32851 | 39 |
| G14b | No `$:` reactive declarations | 32875 | 15 |
| G14c | No `on:event=` directives | 32835 | 55 |
| G14d | No `createEventDispatcher()` | 32857 | 33 |
| G14e | No runes in plain `.ts` files | 32256 | 634 |
| G15 | No SSR-unsafe globals (unguarded) | 32890 | 0 |
| G16 | Server routes have test pairing | 677 | 65 |
| G17 | Server routes have error handling | 705 | 106 |
| G20 | Cyclic import pairs | — | 1 |

---

## Directory Scorecard (1321 dirs · lowest score = most attention needed)

**Score factors**: Auth/API coverage 25pts · Zod coverage 15pts · Drizzle ref 10pts · No TODOs 15pts · SSR-safe 10pts · No Svelte4 10pts · No localhost 5pts · Error handling 5pts · Non-empty 5pts

**Flags**: 🔴ssr = SSR-unsafe globals · 🟡sv4 = Svelte4 legacy · 🟠lh = localhost hardcoded · ⬜notest = routes lack tests


| Status | Directory | Score | Files | Lines | APIs | Auth/Zod | TODOs | Flags |
|--------|-----------|-------|-------|-------|------|----------|-------|-------|
| ❌ | `deeds_labs/projects/legacy-projects/svelte_ui` | 33 | 6 | 2205 | 1 | 0/0 | 1 | 🟡sv4 |
| ❌ | `deeds_labs/routes-parked-full` | 37 | 1 | 73289 | 251 | 43/50 | 90 | 🟡sv4 🟠lh |
| ❌ | `deeds_labs/api-legacy/api/phase72` | 38 | 3 | 202 | 3 | 0/0 | 1 | 🟠lh |
| ❌ | `deeds_labs/api-legacy/api/phase82` | 38 | 2 | 75 | 2 | 0/0 | 1 | — |
| ❌ | `deeds_labs/routes-parked-full/api/phase72` | 38 | 3 | 202 | 3 | 0/0 | 1 | 🟠lh |
| ❌ | `deeds_labs/routes-parked-full/api/phase82` | 38 | 2 | 75 | 2 | 0/0 | 1 | — |
| ⚠️ | `deeds_labs/api-legacy/api/ai` | 42 | 34 | 1823 | 25 | 1/2 | 9 | 🟠lh |
| ⚠️ | `deeds_labs/frontend/svelte4-archive/routes` | 42 | 15 | 1780 | 12 | 2/0 | 1 | 🟠lh |
| ⚠️ | `deeds_labs/routes-parked-full/api/ai` | 42 | 34 | 1823 | 25 | 1/2 | 9 | 🟠lh |
| ⚠️ | `deeds_labs/api-legacy/api/phase78` | 43 | 3 | 116 | 3 | 0/0 | 2 | — |
| ⚠️ | `deeds_labs/frontend/sveltekit-frontend-archive/dirs` | 43 | 5442 | 634106 | 708 | 152/845 | 2926 | 🔴ssr 🟡sv4 🟠lh |
| ⚠️ | `deeds_labs/routes-parked-full/api/phase78` | 43 | 3 | 116 | 3 | 0/0 | 2 | — |
| ⚠️ | `deeds_labs/services/archived-apis/stubs` | 43 | 2 | 64 | 2 | 0/0 | 1 | — |
| ⚠️ | `deeds_labs/api-legacy/api` | 44 | 1 | 22013 | 246 | 27/25 | 36 | 🟠lh |
| ⚠️ | `deeds_labs/routes-parked-full/api` | 44 | 1 | 22013 | 246 | 27/25 | 36 | 🟠lh |
| ⚠️ | `deeds_labs/api-legacy/api/agents` | 45 | 1 | 160 | 1 | 0/0 | 0 | 🟠lh |
| ⚠️ | `deeds_labs/api-legacy/api/analytics` | 45 | 1 | 10 | 1 | 0/0 | 0 | — |
| ⚠️ | `deeds_labs/api-legacy/api/brain` | 45 | 1 | 7 | 1 | 0/0 | 0 | — |
| ⚠️ | `deeds_labs/api-legacy/api/chat-test` | 45 | 1 | 93 | 1 | 0/0 | 0 | 🟠lh |
| ⚠️ | `deeds_labs/api-legacy/api/debug` | 45 | 2 | 5 | 1 | 0/0 | 0 | — |
| ⚠️ | `deeds_labs/api-legacy/api/document` | 45 | 1 | 10 | 1 | 0/0 | 6 | — |
| ⚠️ | `deeds_labs/api-legacy/api/embeddings` | 45 | 3 | 217 | 3 | 0/0 | 0 | 🟠lh |
| ⚠️ | `deeds_labs/api-legacy/api/metrics` | 45 | 5 | 6 | 1 | 0/0 | 0 | — |
| ⚠️ | `deeds_labs/api-legacy/api/native` | 45 | 1 | 31 | 1 | 0/0 | 0 | — |
| ⚠️ | `deeds_labs/api-legacy/api/orchestrator` | 45 | 1 | 59 | 1 | 0/0 | 0 | — |
| ⚠️ | `deeds_labs/api-legacy/api/pgai` | 45 | 1 | 5 | 1 | 0/0 | 0 | — |
| ⚠️ | `deeds_labs/api-legacy/api/security` | 45 | 1 | 11 | 1 | 0/0 | 0 | — |
| ⚠️ | `deeds_labs/api-legacy/api/websearch` | 45 | 1 | 26 | 1 | 0/0 | 0 | — |
| ⚠️ | `deeds_labs/archived-dead-code/dev-routes/test` | 45 | 2 | 12 | 1 | 0/0 | 0 | — |
| ⚠️ | `deeds_labs/projects/legacy-projects/commas-previews` | 45 | 20 | 304 | 7 | 0/0 | 0 | — |
| ⚠️ | `deeds_labs/routes-parked-full/api/agents` | 45 | 1 | 160 | 1 | 0/0 | 0 | 🟠lh |
| ⚠️ | `deeds_labs/routes-parked-full/api/analytics` | 45 | 1 | 10 | 1 | 0/0 | 0 | — |
| ⚠️ | `deeds_labs/routes-parked-full/api/brain` | 45 | 1 | 7 | 1 | 0/0 | 0 | — |
| ⚠️ | `deeds_labs/routes-parked-full/api/chat-test` | 45 | 1 | 93 | 1 | 0/0 | 0 | 🟠lh |
| ⚠️ | `deeds_labs/routes-parked-full/api/debug` | 45 | 2 | 5 | 1 | 0/0 | 0 | — |
| ⚠️ | `deeds_labs/routes-parked-full/api/document` | 45 | 1 | 10 | 1 | 0/0 | 6 | — |
| ⚠️ | `deeds_labs/routes-parked-full/api/embeddings` | 45 | 3 | 217 | 3 | 0/0 | 0 | 🟠lh |
| ⚠️ | `deeds_labs/routes-parked-full/api/metrics` | 45 | 5 | 6 | 1 | 0/0 | 0 | — |
| ⚠️ | `deeds_labs/routes-parked-full/api/native` | 45 | 1 | 31 | 1 | 0/0 | 0 | — |
| ⚠️ | `deeds_labs/routes-parked-full/api/orchestrator` | 45 | 1 | 59 | 1 | 0/0 | 0 | — |
| ⚠️ | `deeds_labs/routes-parked-full/api/pgai` | 45 | 1 | 5 | 1 | 0/0 | 0 | — |
| ⚠️ | `deeds_labs/routes-parked-full/api/security` | 45 | 1 | 11 | 1 | 0/0 | 0 | — |
| ⚠️ | `deeds_labs/routes-parked-full/api/websearch` | 45 | 1 | 26 | 1 | 0/0 | 0 | — |
| ⚠️ | `deeds_labs/routes-parked-full/websocket` | 45 | 1 | 54 | 1 | 0/0 | 0 | — |
| ⚠️ | `deeds_labs/snapshots/2026-03-10/bucket-c-stale` | 45 | 5681 | 838520 | 702 | 163/881 | 3247 | 🔴ssr 🟡sv4 🟠lh |
| ⚠️ | `deeds_labs/snapshots/2026-03-15-root/deeds-web-app-subdir` | 45 | 1 | 89 | 1 | 0/0 | 0 | 🟠lh |
| ⚠️ | `deeds_labs/snapshots/2026-03-15-root/ts` | 45 | 24 | 5530 | 1 | 0/0 | 0 | 🟠lh |
| ⚠️ | `deeds_labs/snapshots/2026-03-15-v2/ts-root` | 45 | 22 | 5390 | 1 | 0/0 | 0 | 🟠lh |
| ⚠️ | `scripts/api-cleanup` | 45 | 40 | 203800 | 2492 | 284/388 | 674 | 🟠lh |
| ⚠️ | `scripts/api-cleanup/reports` | 45 | 6 | 194240 | 2484 | 284/384 | 672 | 🟠lh |
| ⚠️ | `scripts/api-cleanup/reports/backup-2025-12-14T20-51-26-276Z` | 45 | 2186 | 160730 | 2020 | 228/330 | 598 | 🟠lh |
| ⚠️ | `scripts/api-cleanup/reports/backup-2025-12-14T21-11-49-641Z` | 45 | 568 | 22850 | 464 | 56/54 | 74 | 🟠lh |
| ⚠️ | `deeds_labs/api-legacy/api/legal` | 47 | 7 | 732 | 6 | 1/0 | 1 | — |
| ⚠️ | `deeds_labs/routes-parked-full/api/legal` | 47 | 7 | 732 | 6 | 1/0 | 1 | — |
| ⚠️ | `deeds_labs/frontend/svelte4-archive` | 49 | 1 | 60884 | 22 | 5/34 | 31 | 🔴ssr 🟡sv4 🟠lh |
| ⚠️ | `deeds_labs/api-legacy/api/ace` | 50 | 5 | 209 | 5 | 0/0 | 0 | — |
| ⚠️ | `deeds_labs/api-legacy/api/attention` | 50 | 1 | 235 | 1 | 0/0 | 0 | — |
| ⚠️ | `deeds_labs/api-legacy/api/audit` | 50 | 2 | 172 | 2 | 0/0 | 0 | — |
| ⚠️ | `deeds_labs/api-legacy/api/cache` | 50 | 1 | 6 | 1 | 0/0 | 0 | — |
| ⚠️ | `deeds_labs/api-legacy/api/chat` | 50 | 1 | 96 | 1 | 0/0 | 0 | — |
| ⚠️ | `deeds_labs/api-legacy/api/consolidation` | 50 | 1 | 101 | 1 | 0/0 | 0 | — |
| ⚠️ | `deeds_labs/api-legacy/api/dashboard` | 50 | 2 | 90 | 2 | 0/0 | 0 | — |
| ⚠️ | `deeds_labs/api-legacy/api/dev` | 50 | 1 | 90 | 1 | 0/0 | 0 | — |
| ⚠️ | `deeds_labs/api-legacy/api/dimensional-cache` | 50 | 1 | 95 | 1 | 0/0 | 0 | — |
| ⚠️ | `deeds_labs/api-legacy/api/docling` | 50 | 1 | 49 | 1 | 0/0 | 0 | — |
| ⚠️ | `deeds_labs/api-legacy/api/documents` | 50 | 6 | 818 | 6 | 0/0 | 0 | — |
| ⚠️ | `deeds_labs/api-legacy/api/embed` | 50 | 2 | 147 | 2 | 0/0 | 0 | — |
| ⚠️ | `deeds_labs/api-legacy/api/error-brain` | 50 | 2 | 813 | 1 | 0/0 | 0 | — |
| ⚠️ | `deeds_labs/api-legacy/api/errors` | 50 | 2 | 288 | 2 | 0/0 | 0 | — |
| ⚠️ | `deeds_labs/api-legacy/api/evidence-canvas` | 50 | 2 | 8 | 1 | 0/0 | 0 | — |
| ⚠️ | `deeds_labs/api-legacy/api/gpu-test-simple` | 50 | 1 | 26 | 1 | 0/0 | 0 | — |
| ⚠️ | `deeds_labs/api-legacy/api/ibm-vision` | 50 | 1 | 54 | 1 | 0/0 | 0 | — |
| ⚠️ | `deeds_labs/api-legacy/api/ingestion` | 50 | 1 | 49 | 1 | 0/0 | 0 | — |
| ⚠️ | `deeds_labs/api-legacy/api/jobs` | 50 | 2 | 46 | 1 | 0/0 | 0 | — |
| ⚠️ | `deeds_labs/api-legacy/api/laws` | 50 | 7 | 282 | 7 | 2/0 | 1 | — |
| ⚠️ | `deeds_labs/api-legacy/api/legal-ai` | 50 | 2 | 903 | 1 | 0/0 | 0 | — |
| ⚠️ | `deeds_labs/api-legacy/api/mcp` | 50 | 3 | 124 | 3 | 0/0 | 0 | — |
| ⚠️ | `deeds_labs/api-legacy/api/ocr` | 50 | 1 | 50 | 1 | 0/0 | 0 | — |
| ⚠️ | `deeds_labs/api-legacy/api/ollama` | 50 | 3 | 161 | 3 | 0/1 | 0 | 🟠lh |
| ⚠️ | `deeds_labs/api-legacy/api/onnx` | 50 | 1 | 54 | 1 | 0/0 | 0 | — |
| ⚠️ | `deeds_labs/api-legacy/api/persons` | 50 | 2 | 133 | 2 | 0/0 | 0 | — |
| ⚠️ | `deeds_labs/api-legacy/api/realtime` | 50 | 1 | 7 | 1 | 0/0 | 0 | — |
| ⚠️ | `deeds_labs/api-legacy/api/redis-orchestrator` | 50 | 1 | 7 | 1 | 0/0 | 0 | — |
| ⚠️ | `deeds_labs/api-legacy/api/route-operations` | 50 | 1 | 109 | 1 | 0/0 | 0 | — |
| ⚠️ | `deeds_labs/api-legacy/api/setup-database` | 50 | 1 | 123 | 1 | 0/0 | 0 | — |
| ⚠️ | `deeds_labs/api-legacy/api/sse` | 50 | 2 | 14 | 2 | 0/0 | 0 | — |
| ⚠️ | `deeds_labs/api-legacy/api/system` | 50 | 3 | 65 | 3 | 0/0 | 0 | — |
| ⚠️ | `deeds_labs/api-legacy/api/test` | 50 | 3 | 51 | 3 | 0/0 | 0 | — |
| ⚠️ | `deeds_labs/api-legacy/api/upload-analyze` | 50 | 1 | 46 | 1 | 0/0 | 0 | — |
| ⚠️ | `deeds_labs/api-legacy/api/vector` | 50 | 4 | 21 | 2 | 0/0 | 0 | — |
| ⚠️ | `deeds_labs/api-legacy/api/wasm` | 50 | 1 | 28 | 1 | 0/0 | 0 | — |
| ⚠️ | `deeds_labs/api-routes/health/search` | 50 | 1 | 62 | 1 | 0/0 | 0 | — |
| ⚠️ | `deeds_labs/routes-parked-full/api/ace` | 50 | 5 | 209 | 5 | 0/0 | 0 | — |
| ⚠️ | `deeds_labs/routes-parked-full/api/attention` | 50 | 1 | 235 | 1 | 0/0 | 0 | — |
| ⚠️ | `deeds_labs/routes-parked-full/api/audit` | 50 | 2 | 172 | 2 | 0/0 | 0 | — |
| ⚠️ | `deeds_labs/routes-parked-full/api/cache` | 50 | 1 | 6 | 1 | 0/0 | 0 | — |
| ⚠️ | `deeds_labs/routes-parked-full/api/chat` | 50 | 1 | 96 | 1 | 0/0 | 0 | — |
| ⚠️ | `deeds_labs/routes-parked-full/api/consolidation` | 50 | 1 | 101 | 1 | 0/0 | 0 | — |
| ⚠️ | `deeds_labs/routes-parked-full/api/dashboard` | 50 | 2 | 90 | 2 | 0/0 | 0 | — |
| ⚠️ | `deeds_labs/routes-parked-full/api/dev` | 50 | 1 | 90 | 1 | 0/0 | 0 | — |
| ⚠️ | `deeds_labs/routes-parked-full/api/dimensional-cache` | 50 | 1 | 95 | 1 | 0/0 | 0 | — |
| ⚠️ | `deeds_labs/routes-parked-full/api/docling` | 50 | 1 | 49 | 1 | 0/0 | 0 | — |
| ⚠️ | `deeds_labs/routes-parked-full/api/documents` | 50 | 6 | 818 | 6 | 0/0 | 0 | — |
| ⚠️ | `deeds_labs/routes-parked-full/api/embed` | 50 | 2 | 147 | 2 | 0/0 | 0 | — |
| ⚠️ | `deeds_labs/routes-parked-full/api/error-brain` | 50 | 2 | 813 | 1 | 0/0 | 0 | — |
| ⚠️ | `deeds_labs/routes-parked-full/api/errors` | 50 | 2 | 288 | 2 | 0/0 | 0 | — |
| ⚠️ | `deeds_labs/routes-parked-full/api/evidence-canvas` | 50 | 2 | 8 | 1 | 0/0 | 0 | — |
| ⚠️ | `deeds_labs/routes-parked-full/api/gpu-test-simple` | 50 | 1 | 26 | 1 | 0/0 | 0 | — |
| ⚠️ | `deeds_labs/routes-parked-full/api/ibm-vision` | 50 | 1 | 54 | 1 | 0/0 | 0 | — |
| ⚠️ | `deeds_labs/routes-parked-full/api/ingestion` | 50 | 1 | 49 | 1 | 0/0 | 0 | — |
| ⚠️ | `deeds_labs/routes-parked-full/api/jobs` | 50 | 2 | 46 | 1 | 0/0 | 0 | — |
| ⚠️ | `deeds_labs/routes-parked-full/api/laws` | 50 | 7 | 282 | 7 | 2/0 | 1 | — |
| ⚠️ | `deeds_labs/routes-parked-full/api/legal-ai` | 50 | 2 | 903 | 1 | 0/0 | 0 | — |
| ⚠️ | `deeds_labs/routes-parked-full/api/mcp` | 50 | 3 | 124 | 3 | 0/0 | 0 | — |
| ⚠️ | `deeds_labs/routes-parked-full/api/ocr` | 50 | 1 | 50 | 1 | 0/0 | 0 | — |
| ⚠️ | `deeds_labs/routes-parked-full/api/ollama` | 50 | 3 | 161 | 3 | 0/1 | 0 | 🟠lh |
| ⚠️ | `deeds_labs/routes-parked-full/api/onnx` | 50 | 1 | 54 | 1 | 0/0 | 0 | — |
| ⚠️ | `deeds_labs/routes-parked-full/api/persons` | 50 | 2 | 133 | 2 | 0/0 | 0 | — |
| ⚠️ | `deeds_labs/routes-parked-full/api/realtime` | 50 | 1 | 7 | 1 | 0/0 | 0 | — |
| ⚠️ | `deeds_labs/routes-parked-full/api/redis-orchestrator` | 50 | 1 | 7 | 1 | 0/0 | 0 | — |
| ⚠️ | `deeds_labs/routes-parked-full/api/route-operations` | 50 | 1 | 109 | 1 | 0/0 | 0 | — |
| ⚠️ | `deeds_labs/routes-parked-full/api/setup-database` | 50 | 1 | 123 | 1 | 0/0 | 0 | — |
| ⚠️ | `deeds_labs/routes-parked-full/api/sse` | 50 | 2 | 14 | 2 | 0/0 | 0 | — |
| ⚠️ | `deeds_labs/routes-parked-full/api/system` | 50 | 3 | 65 | 3 | 0/0 | 0 | — |
| ⚠️ | `deeds_labs/routes-parked-full/api/test` | 50 | 3 | 51 | 3 | 0/0 | 0 | — |
| ⚠️ | `deeds_labs/routes-parked-full/api/upload-analyze` | 50 | 1 | 46 | 1 | 0/0 | 0 | — |
| ⚠️ | `deeds_labs/routes-parked-full/api/vector` | 50 | 4 | 21 | 2 | 0/0 | 0 | — |
| ⚠️ | `deeds_labs/routes-parked-full/api/wasm` | 50 | 1 | 28 | 1 | 0/0 | 0 | — |
| ⚠️ | `deeds_labs/routes-parked-full/auth/test-relay` | 50 | 1 | 5 | 1 | 0/0 | 0 | — |
| ⚠️ | `deeds_labs/routes-parked-full/healthz` | 50 | 1 | 26 | 1 | 0/0 | 0 | — |
| ⚠️ | `deeds_labs/services/archived-apis/phase78` | 50 | 1 | 47 | 1 | 0/0 | 0 | — |
| ⚠️ | `deeds_labs/api-legacy/api/rag` | 51 | 3 | 415 | 2 | 0/1 | 2 | — |
| ⚠️ | `deeds_labs/projects/legacy-projects/sveltekit-evidence` | 51 | 29 | 11577 | 4 | 0/3 | 13 | 🟠lh |
| ⚠️ | `deeds_labs/routes-parked-full/api/rag` | 51 | 3 | 415 | 2 | 0/1 | 2 | — |
| ⚠️ | `deeds_labs/api-legacy/api/bench` | 53 | 5 | 72 | 5 | 0/1 | 0 | — |
| ⚠️ | `deeds_labs/api-legacy/api/cases` | 53 | 8 | 436 | 8 | 0/0 | 1 | — |
| ⚠️ | `deeds_labs/api-legacy/api/internal` | 53 | 11 | 633 | 11 | 0/0 | 1 | — |
| ⚠️ | `deeds_labs/docs/reference/api-backups` | 53 | 8 | 56 | 7 | 1/2 | 3 | — |
| ⚠️ | `deeds_labs/routes-parked-full/api/bench` | 53 | 5 | 72 | 5 | 0/1 | 0 | — |
| ⚠️ | `deeds_labs/routes-parked-full/api/cases` | 53 | 8 | 436 | 8 | 0/0 | 1 | — |
| ⚠️ | `deeds_labs/routes-parked-full/api/internal` | 53 | 11 | 633 | 11 | 0/0 | 1 | — |
| ⚠️ | `deeds_labs/api-legacy/api/v1` | 54 | 40 | 3647 | 34 | 11/13 | 9 | 🟠lh |
| ⚠️ | `deeds_labs/routes-parked-full/api/v1` | 54 | 40 | 3647 | 34 | 11/13 | 9 | 🟠lh |
| ⚠️ | `deeds_labs/api-legacy/api/search` | 55 | 5 | 352 | 5 | 1/0 | 0 | — |
| ⚠️ | `deeds_labs/api-legacy/api/trt-llm` | 55 | 3 | 183 | 3 | 0/1 | 0 | — |
| ⚠️ | `deeds_labs/api-legacy/api/yorha` | 55 | 4 | 923 | 3 | 0/0 | 0 | 🟠lh |
| ⚠️ | `deeds_labs/docs/reference` | 55 | 9 | 2100 | 7 | 1/3 | 3 | — |
| ⚠️ | `deeds_labs/projects/legacy-projects/src` | 55 | 192 | 31583 | 23 | 6/28 | 4 | 🟡sv4 🟠lh |
| ⚠️ | `deeds_labs/routes-parked-full/api/search` | 55 | 5 | 352 | 5 | 1/0 | 0 | — |
| ⚠️ | `deeds_labs/routes-parked-full/api/trt-llm` | 55 | 3 | 183 | 3 | 0/1 | 0 | — |
| ⚠️ | `deeds_labs/routes-parked-full/api/yorha` | 55 | 4 | 923 | 3 | 0/0 | 0 | 🟠lh |
| ⚠️ | `deeds_labs/services/ts-consolidation-archive/phase72-adapters-orphans-2026-03-09` | 55 | 3 | 697 | 1 | 0/0 | 0 | 🟠lh |
| ⚠️ | `deeds_labs/api-legacy/api/citations` | 56 | 8 | 425 | 8 | 2/0 | 0 | — |
| ⚠️ | `deeds_labs/routes-parked-full/api/citations` | 56 | 8 | 425 | 8 | 2/0 | 0 | — |
| ⚠️ | `deeds_labs/api-legacy/api/evidence` | 57 | 10 | 349 | 7 | 2/1 | 1 | 🟠lh |
| ⚠️ | `deeds_labs/routes-parked-full/api/evidence` | 57 | 10 | 349 | 7 | 2/1 | 1 | 🟠lh |
| ⚠️ | `deeds_labs/api-legacy/api/doc` | 58 | 1 | 37 | 1 | 0/1 | 1 | — |
| ⚠️ | `deeds_labs/routes-parked-full/api/doc` | 58 | 1 | 37 | 1 | 0/1 | 1 | — |
| ⚠️ | `sveltekit-frontend/src/routes/.well-known` | 58 | 4 | 506 | 4 | 0/2 | 0 | — |
| ⚠️ | `deeds_labs/frontend/svelte4-archive/api-routes` | 59 | 9 | 1385 | 9 | 1/2 | 2 | — |
| ⚠️ | `.svelte-error-fixes-backup/sveltekit-frontend/src/lib` | 60 | 516 | 235866 | 0 | 0/45 | 45 | 🔴ssr 🟡sv4 🟠lh |
| ⚠️ | `.svelte-error-fixes-backup/sveltekit-frontend/src/routes` | 60 | 115 | 51846 | 0 | 2/7 | 7 | 🔴ssr 🟡sv4 🟠lh |
| ⚠️ | `deeds_labs/api-legacy/api/admin` | 60 | 4 | 280 | 4 | 1/1 | 0 | — |
| ⚠️ | `deeds_labs/api-legacy/api/canvas` | 60 | 1 | 87 | 1 | 0/0 | 0 | — |
| ⚠️ | `deeds_labs/api-legacy/api/database-test` | 60 | 1 | 104 | 1 | 0/0 | 0 | — |
| ⚠️ | `deeds_labs/api-legacy/api/db-test` | 60 | 1 | 38 | 1 | 0/0 | 0 | — |
| ⚠️ | `deeds_labs/api-legacy/api/dev-auth` | 60 | 1 | 8 | 1 | 0/0 | 0 | — |
| ⚠️ | `deeds_labs/api-legacy/api/fix-schema` | 60 | 1 | 5 | 1 | 0/0 | 0 | — |
| ⚠️ | `deeds_labs/api-legacy/api/graph` | 60 | 4 | 98 | 4 | 0/0 | 0 | — |
| ⚠️ | `deeds_labs/api-legacy/api/poi` | 60 | 1 | 25 | 1 | 0/0 | 0 | — |
| ⚠️ | `deeds_labs/api-legacy/api/routes` | 60 | 23 | 3483 | 13 | 0/0 | 0 | — |
| ⚠️ | `deeds_labs/api-legacy/api/search-pgvector-optimized` | 60 | 1 | 6 | 1 | 0/0 | 0 | — |
| ⚠️ | `deeds_labs/api-legacy/api/ws` | 60 | 1 | 343 | 1 | 0/1 | 0 | 🟠lh |
| ⚠️ | `deeds_labs/frontend/svelte4-archive/components` | 60 | 408 | 50792 | 0 | 2/18 | 28 | 🔴ssr 🟡sv4 🟠lh |
| ⚠️ | `deeds_labs/frontend/svelte4-archive/routes-test-archive` | 60 | 2 | 18 | 1 | 0/1 | 0 | — |
| ⚠️ | `deeds_labs/routes-parked-full/api/admin` | 60 | 4 | 280 | 4 | 1/1 | 0 | — |
| ⚠️ | `deeds_labs/routes-parked-full/api/canvas` | 60 | 1 | 87 | 1 | 0/0 | 0 | — |
| ⚠️ | `deeds_labs/routes-parked-full/api/database-test` | 60 | 1 | 104 | 1 | 0/0 | 0 | — |
| ⚠️ | `deeds_labs/routes-parked-full/api/db-test` | 60 | 1 | 38 | 1 | 0/0 | 0 | — |
| ⚠️ | `deeds_labs/routes-parked-full/api/dev-auth` | 60 | 1 | 8 | 1 | 0/0 | 0 | — |
| ⚠️ | `deeds_labs/routes-parked-full/api/fix-schema` | 60 | 1 | 5 | 1 | 0/0 | 0 | — |
| ⚠️ | `deeds_labs/routes-parked-full/api/graph` | 60 | 4 | 98 | 4 | 0/0 | 0 | — |
| ⚠️ | `deeds_labs/routes-parked-full/api/poi` | 60 | 1 | 25 | 1 | 0/0 | 0 | — |
| ⚠️ | `deeds_labs/routes-parked-full/api/routes` | 60 | 23 | 3483 | 13 | 0/0 | 0 | — |
| ⚠️ | `deeds_labs/routes-parked-full/api/search-pgvector-optimized` | 60 | 1 | 6 | 1 | 0/0 | 0 | — |
| ⚠️ | `deeds_labs/routes-parked-full/api/ws` | 60 | 1 | 343 | 1 | 0/1 | 0 | 🟠lh |
| ⚠️ | `deeds_labs/snapshots/2026-03-10/root-stale` | 61 | 738 | 386041 | 76 | 32/54 | 27 | 🟠lh |
| ⚠️ | `.venv/Lib/site-packages/torch` | 65 | 3 | 696 | 0 | 0/0 | 14 | 🔴ssr |
| ⚠️ | `deeds_labs/api-legacy/api/document-processing` | 65 | 1 | 52 | 1 | 0/1 | 0 | — |
| ⚠️ | `deeds_labs/api-legacy/api/yolo` | 65 | 1 | 50 | 1 | 0/1 | 0 | — |
| ⚠️ | `deeds_labs/dead-routes/error-brain/escalations` | 65 | 1 | 116 | 1 | 0/1 | 0 | — |
| ⚠️ | `deeds_labs/dead-routes/error-brain/experience` | 65 | 1 | 109 | 1 | 0/1 | 0 | — |
| ⚠️ | `deeds_labs/dead-routes/error-brain/metrics` | 65 | 1 | 76 | 1 | 0/1 | 0 | — |
| ⚠️ | `deeds_labs/dead-routes/error-brain/pipeline` | 65 | 1 | 101 | 1 | 0/1 | 0 | — |
| ⚠️ | `deeds_labs/routes-parked-full/api/document-processing` | 65 | 1 | 52 | 1 | 0/1 | 0 | — |
| ⚠️ | `deeds_labs/routes-parked-full/api/yolo` | 65 | 1 | 50 | 1 | 0/1 | 0 | — |
| ⚠️ | `docker/langgraph-synthesis/.venv/Lib` | 65 | 62 | 298388 | 0 | 0/6 | 52 | 🔴ssr |
| ⚠️ | `deeds_labs/api-legacy/api/contextual` | 67 | 3 | 262 | 3 | 2/0 | 0 | — |
| ⚠️ | `deeds_labs/routes-parked-full/api/contextual` | 67 | 3 | 262 | 3 | 2/0 | 0 | — |
| ⚠️ | `deeds_labs/infra/tensorrt-archive/sveltekit-legacy` | 68 | 20 | 1186 | 0 | 0/6 | 1 | 🔴ssr 🟠lh |
| ✅ | `deeds_labs/api-legacy/api/bits-ui` | 70 | 1 | 12 | 1 | 1/0 | 0 | — |
| ✅ | `deeds_labs/api-legacy/api/chrrom` | 70 | 1 | 14 | 1 | 1/0 | 0 | — |
| ✅ | `deeds_labs/projects/agentic-error-resolution/scripts` | 70 | 4 | 841 | 0 | 0/2 | 3 | 🟠lh |
| ✅ | `deeds_labs/routes-parked-full/api/bits-ui` | 70 | 1 | 12 | 1 | 1/0 | 0 | — |
| ✅ | `deeds_labs/routes-parked-full/api/chrrom` | 70 | 1 | 14 | 1 | 1/0 | 0 | — |
| ✅ | `deeds_labs/services/archived-dead-files/orphan-components-2026-03` | 70 | 34 | 6909 | 0 | 0/1 | 4 | 🟠lh |
| ✅ | `deeds_labs/services/archived-dead-workers` | 70 | 6 | 1045 | 0 | 0/2 | 20 | 🟠lh |
| ✅ | `deeds_labs/services/ts-consolidation-archive/api-orphans-2026-03-09` | 70 | 18 | 938 | 0 | 0/1 | 17 | 🟠lh |
| ✅ | `deeds_labs/routes-parked-full/(tools)_disabled` | 73 | 1 | 1442 | 0 | 0/1 | 1 | 🟡sv4 |
| ✅ | `deeds_labs/api-legacy/api/summarize` | 75 | 1 | 40 | 1 | 1/0 | 0 | — |
| ✅ | `deeds_labs/api-legacy/api/user` | 75 | 1 | 27 | 1 | 1/0 | 0 | — |
| ✅ | `deeds_labs/archived-dead-code/dead-lib-dirs/evidence-canvas` | 75 | 6 | 1826 | 0 | 0/0 | 3 | — |
| ✅ | `deeds_labs/frontend/features-archive/workflows` | 75 | 11 | 1711 | 0 | 0/0 | 4 | — |
| ✅ | `deeds_labs/frontend/orphaned-components` | 75 | 6 | 7688 | 0 | 0/4 | 7 | — |
| ✅ | `deeds_labs/frontend-cjs-scripts` | 75 | 56 | 7631 | 1 | 0/2 | 0 | 🟠lh |
| ✅ | `deeds_labs/lib-dead-directories/batch-2026-03-16-orphans/state` | 75 | 1 | 86 | 0 | 0/0 | 4 | — |
| ✅ | `deeds_labs/projects/legacy-projects/ingestion-phase66` | 75 | 17 | 4277 | 0 | 0/1 | 0 | 🟡sv4 🟠lh |
| ✅ | `deeds_labs/routes-parked-full/api/summarize` | 75 | 1 | 40 | 1 | 1/0 | 0 | — |
| ✅ | `deeds_labs/routes-parked-full/api/user` | 75 | 1 | 27 | 1 | 1/0 | 0 | — |
| ✅ | `deeds_labs/routes-parked-full/archive/demos` | 75 | 18 | 3194 | 0 | 1/0 | 3 | — |
| ✅ | `deeds_labs/routes-parked-full/logout` | 75 | 3 | 120 | 1 | 1/0 | 0 | — |
| ✅ | `deeds_labs/services/archived-dead-files/cache` | 75 | 14 | 3902 | 0 | 1/5 | 8 | — |
| ✅ | `deeds_labs/services/development-tools/dead-cache` | 75 | 16 | 5275 | 0 | 1/6 | 7 | — |
| ✅ | `deeds_labs/snapshots/2026-03-15-root/node-tests` | 75 | 64 | 9966 | 0 | 0/7 | 0 | 🔴ssr 🟠lh |
| ✅ | `docker/langgraph-synthesis/.venv/share` | 75 | 12 | 126 | 0 | 0/2 | 8 | — |
| ✅ | `sveltekit-frontend/src/routes/minio` | 75 | 1 | 57 | 1 | 1/0 | 0 | ⬜notest |
| ✅ | `deeds_labs/lib-dead-directories/tracking` | 78 | 7 | 467 | 0 | 0/0 | 2 | 🟠lh |
| ✅ | `deeds_labs/orphan-consolidation-2026-03-29/server-helpers` | 78 | 2 | 153 | 0 | 0/0 | 1 | 🟠lh |
| ✅ | `deeds_labs/routes-parked-full/cases_disabled/[id]` | 78 | 2 | 216 | 0 | 1/1 | 1 | 🟠lh |
| ✅ | `deeds_labs/routes-parked-full/dashboard_disabled` | 78 | 1 | 644 | 0 | 0/1 | 1 | 🟠lh |
| ✅ | `deeds_labs/routes-parked-full/dashboard_disabled/legal-progress` | 78 | 1 | 325 | 0 | 0/0 | 1 | 🟠lh |
| ✅ | `deeds_labs/routes-parked-full/monitor` | 78 | 1 | 420 | 0 | 0/0 | 1 | 🟠lh |
| ✅ | `deeds_labs/services/development-tools/cuda-grpc-stubs` | 78 | 28 | 5663 | 0 | 0/8 | 1 | 🟠lh |
| ✅ | `deeds_labs/services/python-middleware/python_codebase` | 78 | 1944 | 109589 | 203 | 48/436 | 244 | 🟠lh |
| ✅ | `.venv/Lib/site-packages/matplotlib` | 80 | 3 | 993 | 0 | 0/1 | 0 | 🔴ssr |
| ✅ | `deeds_labs/archived-dead-code/dead-lib-dirs` | 80 | 7 | 28185 | 0 | 0/9 | 3 | 🟠lh |
| ✅ | `deeds_labs/routes-parked-full/(tools)_disabled/report-builder` | 80 | 2 | 329 | 0 | 0/0 | 0 | 🟡sv4 |
| ✅ | `deeds_labs/routes-parked-full/reports-generator` | 80 | 1 | 306 | 0 | 0/0 | 0 | 🟡sv4 |
| ✅ | `deeds_labs/routes-reference/report-builder` | 80 | 2 | 329 | 0 | 0/0 | 0 | 🟡sv4 |
| ✅ | `deeds_labs/services/archived-dead-files` | 80 | 1 | 15571 | 0 | 1/15 | 17 | 🟠lh |
| ✅ | `sveltekit-frontend/src/lib/components` | 80 | 652 | 166389 | 0 | 0/45 | 6 | 🟠lh |
| ✅ | `deeds_labs/archived-server-modules/simd` | 83 | 1 | 167 | 0 | 0/1 | 1 | — |
| ✅ | `deeds_labs/dead_code/src-lib/auth` | 83 | 4 | 147 | 0 | 1/2 | 1 | — |
| ✅ | `deeds_labs/dead_code/src-lib/integrations` | 83 | 6 | 1410 | 0 | 0/0 | 1 | — |
| ✅ | `deeds_labs/frontend/corrupted-demos` | 83 | 3 | 594 | 0 | 0/0 | 1 | — |
| ✅ | `deeds_labs/frontend/orphaned-components/ai-stubs` | 83 | 4 | 66 | 0 | 0/0 | 1 | — |
| ✅ | `deeds_labs/frontend/orphaned-components/chat-variants` | 83 | 7 | 1346 | 0 | 0/0 | 2 | — |
| ✅ | `deeds_labs/frontend/orphaned-components/ui-dead-2026-03-08` | 83 | 35 | 3816 | 0 | 0/2 | 2 | — |
| ✅ | `deeds_labs/infra/wasm-archive` | 83 | 2 | 360 | 0 | 0/0 | 1 | — |
| ✅ | `deeds_labs/lib-dead-directories/auth` | 83 | 4 | 147 | 0 | 1/2 | 1 | — |
| ✅ | `deeds_labs/lib-dead-directories/integrations` | 83 | 6 | 1410 | 0 | 0/0 | 1 | — |
| ✅ | `deeds_labs/lib-dead-directories/wasm` | 83 | 7 | 1474 | 0 | 0/3 | 1 | — |
| ✅ | `deeds_labs/routes-parked-full/(ai)_disabled/orchestrator` | 83 | 1 | 435 | 0 | 0/0 | 1 | — |
| ✅ | `deeds_labs/routes-parked-full/(demo)_disabled` | 83 | 1 | 1022 | 0 | 0/0 | 1 | — |
| ✅ | `deeds_labs/routes-parked-full/(demo)_disabled/showcase` | 83 | 1 | 443 | 0 | 0/0 | 1 | — |
| ✅ | `deeds_labs/routes-parked-full/(legal)_disabled` | 83 | 2 | 1540 | 0 | 1/1 | 2 | — |
| ✅ | `deeds_labs/routes-parked-full/(legal)_disabled/legal-cases` | 83 | 4 | 1053 | 0 | 1/1 | 2 | — |
| ✅ | `deeds_labs/routes-parked-full/(tools)_disabled/search` | 83 | 2 | 298 | 0 | 0/1 | 1 | — |
| ✅ | `deeds_labs/routes-parked-full/admin/redis` | 83 | 2 | 558 | 0 | 0/0 | 1 | — |
| ✅ | `deeds_labs/routes-parked-full/ai-test` | 83 | 1 | 435 | 0 | 0/0 | 1 | — |
| ✅ | `deeds_labs/routes-parked-full/archive/dev-playground` | 83 | 8 | 1576 | 0 | 0/0 | 2 | — |
| ✅ | `deeds_labs/routes-parked-full/archive/tests` | 83 | 12 | 1879 | 0 | 0/3 | 2 | — |
| ✅ | `deeds_labs/routes-parked-full/auth/logout` | 83 | 1 | 435 | 0 | 0/0 | 1 | — |
| ✅ | `deeds_labs/routes-parked-full/auth/test` | 83 | 1 | 436 | 0 | 0/0 | 1 | — |
| ✅ | `deeds_labs/routes-parked-full/authenticated-crud-test` | 83 | 1 | 435 | 0 | 0/0 | 1 | — |
| ✅ | `deeds_labs/routes-parked-full/brain` | 83 | 1 | 435 | 0 | 0/0 | 1 | — |
| ✅ | `deeds_labs/routes-parked-full/command-center_disabled` | 83 | 1 | 197 | 0 | 0/1 | 1 | — |
| ✅ | `deeds_labs/routes-parked-full/cuda-streaming` | 83 | 2 | 649 | 0 | 0/0 | 1 | — |
| ✅ | `deeds_labs/routes-parked-full/export` | 83 | 1 | 435 | 0 | 0/0 | 1 | — |
| ✅ | `deeds_labs/routes-parked-full/gallery` | 83 | 1 | 444 | 0 | 0/0 | 1 | — |
| ✅ | `deeds_labs/routes-parked-full/import` | 83 | 1 | 444 | 0 | 0/0 | 1 | — |
| ✅ | `deeds_labs/routes-parked-full/legal-ai-suite` | 83 | 1 | 412 | 0 | 0/0 | 1 | — |
| ✅ | `deeds_labs/routes-parked-full/mcp` | 83 | 1 | 443 | 0 | 0/0 | 1 | — |
| ✅ | `deeds_labs/routes-parked-full/memory-dashboard` | 83 | 1 | 435 | 0 | 0/0 | 1 | — |
| ✅ | `deeds_labs/routes-parked-full/memory-palace` | 83 | 1 | 199 | 0 | 0/0 | 1 | — |
| ✅ | `deeds_labs/routes-parked-full/nier-showcase` | 83 | 1 | 435 | 0 | 0/0 | 1 | — |
| ✅ | `deeds_labs/routes-parked-full/perf` | 83 | 1 | 444 | 0 | 0/0 | 1 | — |
| ✅ | `deeds_labs/routes-parked-full/persons-of-interest_disabled` | 83 | 1 | 207 | 0 | 0/0 | 1 | — |
| ✅ | `deeds_labs/routes-parked-full/routes` | 83 | 2 | 444 | 0 | 0/0 | 1 | — |
| ✅ | `deeds_labs/routes-parked-full/search.bak` | 83 | 1 | 435 | 0 | 0/0 | 1 | — |
| ✅ | `deeds_labs/routes-parked-full/shader_search` | 83 | 1 | 585 | 0 | 0/0 | 1 | — |
| ✅ | `deeds_labs/routes-parked-full/simple` | 83 | 1 | 435 | 0 | 0/0 | 1 | — |
| ✅ | `deeds_labs/routes-parked-full/yorha` | 83 | 2 | 1558 | 0 | 0/0 | 1 | — |
| ✅ | `deeds_labs/routes-parked-full/yorha/detective` | 83 | 4 | 593 | 0 | 0/0 | 1 | — |
| ✅ | `deeds_labs/routes-reference/mcp` | 83 | 1 | 443 | 0 | 0/0 | 1 | — |
| ✅ | `deeds_labs/routes-reference/memory-palace` | 83 | 1 | 199 | 0 | 0/0 | 1 | — |
| ✅ | `deeds_labs/routes-reference/nier-showcase` | 83 | 1 | 435 | 0 | 0/0 | 1 | — |
| ✅ | `deeds_labs/services/archived-dead-files/crewai-xstate` | 83 | 2 | 535 | 0 | 0/0 | 1 | — |
| ✅ | `deeds_labs/services/archived-dead-files/stubs-ai` | 83 | 7 | 371 | 0 | 0/0 | 1 | — |
| ✅ | `deeds_labs/services/archived-machines` | 83 | 7 | 1585 | 0 | 0/2 | 1 | — |
| ✅ | `sveltekit-frontend/src/lib/ai` | 83 | 19 | 5189 | 0 | 0/1 | 1 | — |
| ✅ | `sveltekit-frontend/src/lib/workers` | 83 | 8 | 1739 | 0 | 0/1 | 2 | — |
| ✅ | `sveltekit-frontend/src/routes/api` | 84 | 691 | 103621 | 687 | 680/526 | 1 | 🟠lh ⬜notest |
| ✅ | `.venv/Lib/site-packages/litellm` | 85 | 32 | 18675 | 0 | 0/12 | 0 | 🟠lh |
| ✅ | `deeds_labs/archived-dead-code/dead-lib-dirs/simd` | 85 | 3 | 752 | 0 | 0/2 | 0 | 🟠lh |
| ✅ | `deeds_labs/archived-dead-code/dead-lib-dirs/systems` | 85 | 1 | 563 | 0 | 0/1 | 0 | 🟠lh |
| ✅ | `deeds_labs/frontend/svelte4-archive/moogle` | 85 | 1 | 840 | 0 | 0/0 | 0 | 🟠lh |
| ✅ | `deeds_labs/lib-dead-directories/batch-2026-03-16/constants` | 85 | 1 | 57 | 0 | 0/0 | 0 | 🟠lh |
| ✅ | `deeds_labs/lib-dead-directories/batch-2026-03-16/json` | 85 | 1 | 261 | 0 | 0/1 | 0 | 🟠lh |
| ✅ | `deeds_labs/lib-dead-directories/batch-2026-03-16/moogle` | 85 | 1 | 839 | 0 | 0/0 | 0 | 🟠lh |
| ✅ | `deeds_labs/lib-dead-directories/batch-2026-03-16/ocr` | 85 | 1 | 86 | 0 | 0/0 | 0 | 🟠lh |
| ✅ | `deeds_labs/lib-dead-directories/constants` | 85 | 1 | 116 | 0 | 0/0 | 0 | 🟠lh |
| ✅ | `deeds_labs/lib-dead-directories/constants/constants` | 85 | 1 | 58 | 0 | 0/0 | 0 | 🟠lh |
| ✅ | `deeds_labs/lib-dead-directories/json` | 85 | 1 | 458 | 0 | 0/2 | 0 | 🟠lh |
| ✅ | `deeds_labs/lib-dead-directories/json/json` | 85 | 1 | 229 | 0 | 0/1 | 0 | 🟠lh |
| ✅ | `deeds_labs/lib-dead-directories/ocr` | 85 | 1 | 172 | 0 | 0/0 | 0 | 🟠lh |
| ✅ | `deeds_labs/lib-dead-directories/ocr/ocr` | 85 | 1 | 86 | 0 | 0/0 | 0 | 🟠lh |
| ✅ | `deeds_labs/lib-dead-directories/optimization` | 85 | 4 | 914 | 0 | 0/6 | 0 | 🟠lh |
| ✅ | `deeds_labs/lib-dead-directories/optimization/optimization` | 85 | 4 | 457 | 0 | 0/3 | 0 | 🟠lh |
| ✅ | `deeds_labs/lib-dead-directories/server-orphans` | 85 | 2 | 469 | 0 | 0/1 | 0 | 🟠lh |
| ✅ | `deeds_labs/lib-dead-directories/workers` | 85 | 3 | 797 | 0 | 0/0 | 0 | 🟠lh |
| ✅ | `deeds_labs/projects/auto-solve-demo` | 85 | 1 | 1467 | 0 | 0/0 | 0 | 🟠lh |
| ✅ | `deeds_labs/routes-parked-full/(ai)_disabled/chat` | 85 | 1 | 483 | 0 | 0/1 | 0 | 🟠lh |
| ✅ | `deeds_labs/routes-parked-full/(ai)_disabled/chat-simple` | 85 | 1 | 40 | 0 | 0/0 | 0 | 🟠lh |
| ✅ | `deeds_labs/routes-parked-full/(ai)_disabled/enhanced-mcp` | 85 | 1 | 438 | 0 | 0/0 | 0 | 🟠lh |
| ✅ | `deeds_labs/routes-parked-full/(ai)_disabled/modular` | 85 | 1 | 44 | 0 | 0/0 | 0 | 🟠lh |
| ✅ | `deeds_labs/routes-parked-full/admin` | 85 | 3 | 1648 | 0 | 2/1 | 15 | — |
| ✅ | `deeds_labs/routes-parked-full/admin/users` | 85 | 4 | 399 | 0 | 2/1 | 13 | — |
| ✅ | `deeds_labs/routes-reference/chat` | 85 | 1 | 483 | 0 | 0/1 | 0 | 🟠lh |
| ✅ | `deeds_labs/routes-reference/chat-simple` | 85 | 1 | 40 | 0 | 0/0 | 0 | 🟠lh |
| ✅ | `deeds_labs/services/archived-dead-files/superseded-services` | 85 | 7 | 1380 | 0 | 0/4 | 3 | — |
| ✅ | `deeds_labs/services/development-tools/ast-analysis` | 85 | 16 | 2806 | 1 | 0/2 | 0 | 🟠lh |
| ✅ | `deeds_labs/services/development-tools/error-analysis` | 85 | 65 | 19338 | 0 | 4/4 | 5 | — |
| ✅ | `deeds_labs/services/orphan-services-20260320` | 85 | 4 | 536 | 0 | 0/0 | 0 | 🟠lh |
| ✅ | `deeds_labs/services/ts-consolidation-archive/broken-import-orphans-2026-03-09` | 85 | 7 | 1140 | 0 | 0/0 | 0 | 🟡sv4 🟠lh |
| ✅ | `deeds_labs/services/ts-consolidation-archive/config-orphans-2026-03-09` | 85 | 6 | 1682 | 0 | 0/1 | 0 | 🟠lh |
| ✅ | `deeds_labs/services/ts-consolidation-archive/ollama-duplicates-2026-03-09` | 85 | 9 | 910 | 0 | 0/1 | 0 | 🟠lh |
| ✅ | `deeds_labs/services/ts-consolidation-archive/qdrant-duplicates-2026-03-09` | 85 | 5 | 1124 | 0 | 0/0 | 0 | 🟠lh |
| ✅ | `deeds_labs/services/ts-consolidation-archive/server-orphans-2026-03-09` | 85 | 18 | 1509 | 0 | 0/1 | 0 | 🟠lh |
| ✅ | `deeds_labs/services/ts-consolidation-archive/services-orphans-2026-03-09` | 85 | 17 | 3727 | 0 | 0/4 | 6 | — |
| ✅ | `scripts/audit` | 85 | 4 | 1456 | 0 | 0/2 | 0 | 🟠lh |
| ✅ | `scripts/operator` | 85 | 6 | 1362 | 0 | 0/4 | 0 | 🟠lh |
| ✅ | `sveltekit-frontend/.vscode` | 85 | 14 | 6068 | 0 | 0/1 | 0 | 🟠lh |
| ✅ | `sveltekit-frontend/drizzle` | 85 | 6 | 230843 | 0 | 0/0 | 6 | — |
| ✅ | `sveltekit-frontend/drizzle/introspected` | 85 | 2 | 20357 | 0 | 0/0 | 4 | — |
| ✅ | `sveltekit-frontend/public` | 85 | 1 | 572 | 0 | 0/0 | 0 | 🟠lh |
| ✅ | `sveltekit-frontend/public/js` | 85 | 1 | 571 | 0 | 0/0 | 0 | 🟠lh |
| ✅ | `sveltekit-frontend/scripts/diagnose` | 85 | 2 | 379 | 0 | 0/0 | 0 | 🟠lh |
| ✅ | `sveltekit-frontend/scripts/diagnostics` | 85 | 4 | 323 | 0 | 0/2 | 0 | 🟠lh |
| ✅ | `sveltekit-frontend/scripts/mcp` | 85 | 10 | 2489 | 0 | 0/4 | 0 | 🟠lh |
| ✅ | `sveltekit-frontend/src/lib/utils` | 85 | 44 | 7275 | 0 | 2/7 | 0 | 🟠lh |
| ✅ | `sveltekit-frontend/static` | 85 | 17 | 7328246 | 0 | 0/6 | 0 | 🟠lh |
| ✅ | `sveltekit-frontend/static/workers` | 85 | 13 | 9339 | 0 | 0/0 | 0 | 🟠lh |
| ✅ | `sveltekit-frontend/tests/helpers` | 85 | 3 | 374 | 0 | 1/1 | 0 | 🟠lh |
| ✅ | `sveltekit-frontend/tests/scripts` | 85 | 3 | 104 | 0 | 0/0 | 0 | 🟠lh |
| ✅ | `vscode-extension/out` | 85 | 8 | 854 | 0 | 0/4 | 0 | 🟠lh |
| ✅ | `vscode-extension/src` | 85 | 8 | 1054 | 0 | 0/4 | 0 | 🟠lh |
| ✅ | `deeds_labs/routes-parked-full/(ai)_disabled` | 88 | 2 | 4464 | 0 | 2/2 | 2 | 🟠lh |
| ✅ | `deeds_labs/services/archived-client-lib/sdk` | 88 | 4 | 723 | 0 | 0/0 | 1 | 🟠lh |
| ✅ | `deeds_labs/services/python-middleware/backend` | 88 | 26 | 4911 | 0 | 0/3 | 1 | 🟠lh |
| ✅ | `deeds_labs/services/ts-consolidation-archive/server-root-orphans-2026-03-09` | 88 | 45 | 6123 | 0 | 4/9 | 2 | 🟠lh |
| ✅ | `deeds_labs/services/ts-consolidation-archive/server-subdirs-orphans-2026-03-09` | 88 | 38 | 5963 | 0 | 0/5 | 1 | 🟠lh |
| ✅ | `.python311/lib/python3.11/site-packages` | 90 | 2 | 2 | 0 | 0/0 | 0 | — |
| ✅ | `.svelte-error-fixes-backup/sveltekit-frontend/src/types` | 90 | 1 | 53 | 0 | 0/0 | 0 | — |
| ✅ | `.venv/Lib/site-packages/boto3` | 90 | 16 | 22128 | 0 | 0/0 | 0 | — |
| ✅ | `.venv/Lib/site-packages/botocore` | 90 | 853 | 113032 | 0 | 0/0 | 0 | — |
| ✅ | `.venv/Lib/site-packages/CouchDB-1.2.dist-info` | 90 | 1 | 1 | 0 | 0/0 | 0 | — |
| ✅ | `.venv/Lib/site-packages/crewai` | 90 | 2 | 2528 | 0 | 0/1 | 0 | — |
| ✅ | `.venv/Lib/site-packages/cupy` | 90 | 2 | 2 | 0 | 0/0 | 0 | — |
| ✅ | `.venv/Lib/site-packages/datasets` | 90 | 4 | 8066 | 0 | 0/0 | 0 | — |
| ✅ | `.venv/Lib/site-packages/debugpy` | 90 | 2 | 4516 | 0 | 0/0 | 0 | — |
| ✅ | `.venv/Lib/site-packages/decorator-5.2.1.dist-info` | 90 | 1 | 1 | 0 | 0/0 | 0 | — |
| ✅ | `.venv/Lib/site-packages/google` | 90 | 11 | 3534 | 0 | 0/0 | 0 | — |
| ✅ | `.venv/Lib/site-packages/googleapiclient` | 90 | 568 | 2472506 | 0 | 0/0 | 0 | — |
| ✅ | `.venv/Lib/site-packages/hf_xet-1.4.3.dist-info` | 90 | 1 | 12617 | 0 | 0/0 | 0 | — |
| ✅ | `.venv/Lib/site-packages/jsonschema` | 90 | 1 | 2654 | 0 | 0/0 | 0 | — |
| ✅ | `.venv/Lib/site-packages/jsonschema_specifications` | 90 | 6 | 746 | 0 | 0/0 | 0 | — |
| ✅ | `.venv/Lib/site-packages/onnx` | 90 | 9 | 9 | 0 | 0/0 | 0 | — |
| ✅ | `.venv/Lib/site-packages/pre_commit` | 90 | 1 | 5 | 0 | 0/0 | 0 | — |
| ✅ | `.venv/Lib/site-packages/pypdfium2` | 90 | 1 | 11 | 0 | 0/0 | 0 | — |
| ✅ | `.venv/Lib/site-packages/pypdfium2_raw` | 90 | 1 | 10 | 0 | 0/0 | 0 | — |
| ✅ | `.venv/Lib/site-packages/ratelimiter-1.2.0.post0.dist-info` | 90 | 1 | 1 | 0 | 0/0 | 0 | — |
| ✅ | `.venv/Lib/site-packages/retry-0.9.2.dist-info` | 90 | 2 | 2 | 0 | 0/0 | 0 | — |
| ✅ | `.venv/Lib/site-packages/schemas` | 90 | 25 | 711 | 0 | 0/0 | 0 | — |
| ✅ | `.venv/Lib/site-packages/scipy` | 90 | 1 | 1499 | 0 | 0/0 | 0 | — |
| ✅ | `.venv/Lib/site-packages/sklearn` | 90 | 1 | 43 | 0 | 0/0 | 0 | — |
| ✅ | `.venv/Lib/site-packages/urllib3` | 90 | 1 | 111 | 0 | 0/0 | 0 | — |
| ✅ | `.venv/Lib/site-packages/werkzeug` | 90 | 1 | 345 | 0 | 0/0 | 0 | — |
| ✅ | `.venv/Lib/site-packages/whisper` | 90 | 1 | 1741 | 0 | 0/0 | 0 | — |
| ✅ | `.venv/Lib/site-packages/win32com` | 90 | 2 | 47 | 0 | 0/0 | 0 | — |
| ✅ | `.venv/Lib/site-packages/yt_dlp` | 90 | 3 | 389 | 0 | 0/1 | 0 | — |
| ✅ | `.venv/share/jupyter/kernels` | 90 | 1 | 15 | 0 | 0/0 | 0 | — |
| ✅ | `.vscode/extensions/mcp-context7-assistant/src` | 90 | 1 | 1 | 0 | 0/0 | 0 | — |
| ✅ | `.vscode/tasks` | 90 | 2 | 12 | 0 | 0/0 | 0 | — |
| ✅ | `deeds_labs/api-legacy/api/enhanced-rag` | 90 | 1 | 1 | 0 | 0/0 | 0 | — |
| ✅ | `deeds_labs/api-legacy/api/gpu-error-processor` | 90 | 1 | 305 | 0 | 0/0 | 0 | — |
| ✅ | `deeds_labs/api-legacy/api/gpu-final-processing` | 90 | 1 | 50 | 0 | 0/0 | 0 | — |
| ✅ | `deeds_labs/api-legacy/api/ingest` | 90 | 2 | 2 | 0 | 0/0 | 0 | — |
| ✅ | `deeds_labs/api-legacy/api/integrated` | 90 | 1 | 1 | 0 | 0/0 | 0 | — |
| ✅ | `deeds_labs/api-legacy/api/phase14` | 90 | 3 | 12 | 0 | 0/0 | 0 | — |
| ✅ | `deeds_labs/api-legacy/api/png` | 90 | 1 | 1 | 0 | 0/0 | 0 | — |
| ✅ | `deeds_labs/api-legacy/api/precedents` | 90 | 1 | 1 | 0 | 0/0 | 0 | — |
| ✅ | `deeds_labs/api-legacy/api/predictor` | 90 | 1 | 15 | 0 | 0/0 | 0 | — |
| ✅ | `deeds_labs/api-legacy/api/process-legal-document` | 90 | 1 | 4 | 0 | 0/0 | 0 | — |
| ✅ | `deeds_labs/api-legacy/api/queue` | 90 | 1 | 1 | 0 | 0/0 | 0 | — |
| ✅ | `deeds_labs/api-legacy/api/webgpu` | 90 | 1 | 6 | 0 | 0/0 | 0 | — |
| ✅ | `deeds_labs/api-legacy/api/workers` | 90 | 8 | 19 | 0 | 0/0 | 0 | — |
| ✅ | `deeds_labs/archived-components` | 90 | 2 | 316 | 0 | 0/0 | 0 | — |
| ✅ | `deeds_labs/archived-dead-code/dead-lib-dirs/binary` | 90 | 1 | 27 | 0 | 0/1 | 0 | — |
| ✅ | `deeds_labs/archived-dead-code/dead-lib-dirs/compression` | 90 | 1 | 521 | 0 | 0/0 | 0 | — |
| ✅ | `deeds_labs/archived-dead-code/dead-lib-dirs/demo` | 90 | 1 | 113 | 0 | 0/0 | 0 | — |
| ✅ | `deeds_labs/archived-dead-code/dead-lib-dirs/detective-mode` | 90 | 1 | 107 | 0 | 0/0 | 0 | — |
| ✅ | `deeds_labs/archived-dead-code/dead-lib-dirs/diagnostics` | 90 | 4 | 1614 | 0 | 0/0 | 0 | — |
| ✅ | `deeds_labs/archived-dead-code/dead-lib-dirs/engines` | 90 | 1 | 4 | 0 | 0/0 | 0 | — |
| ✅ | `deeds_labs/archived-dead-code/dead-lib-dirs/generated` | 90 | 8 | 16640 | 0 | 0/0 | 0 | — |
| ✅ | `deeds_labs/archived-dead-code/dead-lib-dirs/ingest` | 90 | 4 | 4 | 0 | 0/0 | 0 | — |
| ✅ | `deeds_labs/archived-dead-code/dead-lib-dirs/phase14` | 90 | 1 | 9 | 0 | 0/0 | 0 | — |
| ✅ | `deeds_labs/archived-dead-code/dead-lib-dirs/proto` | 90 | 2 | 34 | 0 | 0/0 | 0 | — |
| ✅ | `deeds_labs/archived-dead-code/dead-lib-dirs/push` | 90 | 1 | 112 | 0 | 0/0 | 0 | — |
| ✅ | `deeds_labs/archived-dead-code/dead-lib-dirs/stories` | 90 | 1 | 18 | 0 | 0/0 | 0 | — |
| ✅ | `deeds_labs/archived-dead-code/dead-lib-dirs/taxonomy` | 90 | 1 | 112 | 0 | 0/0 | 0 | — |
| ✅ | `deeds_labs/archived-dead-code/dead-lib-dirs/telemetry` | 90 | 3 | 538 | 0 | 0/0 | 0 | — |
| ✅ | `deeds_labs/archived-dead-code/dead-lib-dirs/templates` | 90 | 1 | 18 | 0 | 0/0 | 0 | — |
| ✅ | `deeds_labs/archived-dead-code/dead-lib-dirs/ui` | 90 | 55 | 3671 | 0 | 0/0 | 0 | — |
| ✅ | `deeds_labs/archived-dead-code/dead-lib-dirs/vendor` | 90 | 2 | 43 | 0 | 0/0 | 0 | — |
| ✅ | `deeds_labs/archived-dead-code/dead-lib-dirs/vision` | 90 | 1 | 75 | 0 | 0/0 | 0 | — |
| ✅ | `deeds_labs/archived-dead-code/dead-lib-dirs/websocket` | 90 | 1 | 129 | 0 | 0/1 | 0 | — |
| ✅ | `deeds_labs/archived-dead-code/dead-lib-dirs/websocket-client` | 90 | 1 | 177 | 0 | 0/1 | 0 | — |
| ✅ | `deeds_labs/archived-dead-code/dev-routes/dashboard-phase14` | 90 | 2 | 154 | 0 | 2/0 | 0 | — |
| ✅ | `deeds_labs/archived-dead-code/dev-routes/phase89` | 90 | 1 | 572 | 0 | 0/0 | 0 | — |
| ✅ | `deeds_labs/archived-dead-code/dev-routes/test-user-store` | 90 | 1 | 41 | 0 | 0/0 | 0 | — |
| ✅ | `deeds_labs/archived-dead-code/headless` | 90 | 2 | 32 | 0 | 0/0 | 0 | — |
| ✅ | `deeds_labs/archived-dead-code/orchestrated` | 90 | 1 | 109 | 0 | 0/0 | 0 | — |
| ✅ | `deeds_labs/archived-dead-code/phase99-stubs/canvas` | 90 | 3 | 150 | 0 | 0/0 | 0 | — |
| ✅ | `deeds_labs/archived-dead-code/phase99-stubs/enhanced-bits` | 90 | 5 | 90 | 0 | 0/0 | 0 | — |
| ✅ | `deeds_labs/archived-dead-code/phase99-stubs/headless` | 90 | 6 | 104 | 0 | 0/0 | 0 | — |
| ✅ | `deeds_labs/archived-dead-code/phase99-stubs/orchestrated` | 90 | 1 | 109 | 0 | 0/0 | 0 | — |
| ✅ | `deeds_labs/archived-dead-code/route-stubs/health` | 90 | 1 | 13 | 0 | 0/0 | 0 | — |
| ✅ | `deeds_labs/archived-dead-code/route-stubs/studio` | 90 | 1 | 14 | 0 | 0/0 | 0 | — |
| ✅ | `deeds_labs/archived-lib/contracts` | 90 | 1 | 230 | 0 | 0/0 | 0 | — |
| ✅ | `deeds_labs/archived-lib/validation` | 90 | 1 | 19 | 0 | 0/1 | 0 | — |
| ✅ | `deeds_labs/archived-server-modules/actions` | 90 | 1 | 33 | 0 | 0/0 | 0 | — |
| ✅ | `deeds_labs/archived-server-modules/connections` | 90 | 1 | 346 | 0 | 0/0 | 0 | — |
| ✅ | `deeds_labs/archived-server-modules/context` | 90 | 1 | 191 | 0 | 0/0 | 0 | — |
| ✅ | `deeds_labs/archived-server-modules/json` | 90 | 1 | 146 | 0 | 0/1 | 0 | — |
| ✅ | `deeds_labs/archived-server-modules/log-adapters` | 90 | 1 | 17 | 0 | 0/0 | 0 | — |
| ✅ | `deeds_labs/archived-server-modules/logging` | 90 | 1 | 382 | 0 | 0/1 | 0 | — |
| ✅ | `deeds_labs/archived-server-modules/messaging` | 90 | 1 | 134 | 0 | 0/0 | 0 | — |
| ✅ | `deeds_labs/archived-shims/lucide-shim` | 90 | 2 | 128 | 0 | 0/0 | 0 | — |
| ✅ | `deeds_labs/archived-tsconfig-audits` | 90 | 7 | 1732 | 0 | 0/0 | 0 | — |
| ✅ | `deeds_labs/archived-type-shims` | 90 | 3 | 219 | 0 | 0/0 | 0 | — |
| ✅ | `deeds_labs/community-refs/gemma4-ocr/test_pdf` | 90 | 1 | 1696 | 0 | 0/0 | 0 | — |
| ✅ | `deeds_labs/components` | 90 | 1 | 234 | 0 | 0/0 | 0 | — |
| ✅ | `deeds_labs/components/headless` | 90 | 2 | 194 | 0 | 0/0 | 0 | — |
| ✅ | `deeds_labs/components-backup/.svelte-kit_generated` | 90 | 1 | 18 | 0 | 0/0 | 0 | — |
| ✅ | `deeds_labs/dead-barrels` | 90 | 1 | 1039 | 0 | 0/0 | 0 | — |
| ✅ | `deeds_labs/dead-barrels/components-ai-CaseScoringDashboard` | 90 | 1 | 4 | 0 | 0/0 | 0 | — |
| ✅ | `deeds_labs/dead-barrels/components-ai-PatternDetectionInterface` | 90 | 1 | 4 | 0 | 0/0 | 0 | — |
| ✅ | `deeds_labs/dead-barrels/components-Dialog` | 90 | 1 | 4 | 0 | 0/0 | 0 | — |
| ✅ | `deeds_labs/dead-barrels/components-subcomponents` | 90 | 1 | 15 | 0 | 0/0 | 0 | — |
| ✅ | `deeds_labs/dead-barrels/components-ui-bits` | 90 | 1 | 23 | 0 | 0/0 | 0 | — |
| ✅ | `deeds_labs/dead-barrels/components-ui-core` | 90 | 1 | 6 | 0 | 0/0 | 0 | — |
| ✅ | `deeds_labs/dead-barrels/components-ui-enhanced` | 90 | 1 | 64 | 0 | 0/0 | 0 | — |
| ✅ | `deeds_labs/dead-barrels/components-ui-enhanced-bits` | 90 | 1 | 8 | 0 | 0/0 | 0 | — |
| ✅ | `deeds_labs/dead-barrels/components-ui-EvidenceCard` | 90 | 1 | 4 | 0 | 0/0 | 0 | — |
| ✅ | `deeds_labs/dead-barrels/components-ui-form` | 90 | 1 | 15 | 0 | 0/0 | 0 | — |
| ✅ | `deeds_labs/dead-barrels/components-ui-layout` | 90 | 1 | 116 | 0 | 0/0 | 0 | — |
| ✅ | `deeds_labs/dead-barrels/components-ui-modern` | 90 | 1 | 113 | 0 | 0/0 | 0 | — |
| ✅ | `deeds_labs/dead-barrels/components-ui-modular` | 90 | 1 | 37 | 0 | 0/0 | 0 | — |
| ✅ | `deeds_labs/dead-barrels/components-ui-QuickActionButton` | 90 | 1 | 4 | 0 | 0/0 | 0 | — |
| ✅ | `deeds_labs/dead-barrels/components-ui-select` | 90 | 1 | 6 | 0 | 0/0 | 0 | — |
| ✅ | `deeds_labs/dead-barrels/components-ui-StatsCard` | 90 | 1 | 4 | 0 | 0/0 | 0 | — |
| ✅ | `deeds_labs/dead-barrels/components-ui-wrappers-bits` | 90 | 1 | 3 | 0 | 0/0 | 0 | — |
| ✅ | `deeds_labs/dead-barrels/lib-components` | 90 | 1 | 44 | 0 | 0/0 | 0 | — |
| ✅ | `deeds_labs/dead-barrels/lib-db` | 90 | 1 | 9 | 0 | 0/0 | 0 | — |
| ✅ | `deeds_labs/dead-barrels/lib-features-evidence-command-center` | 90 | 1 | 8 | 0 | 0/0 | 0 | — |
| ✅ | `deeds_labs/dead-barrels/lib-schemas` | 90 | 1 | 4 | 0 | 0/0 | 0 | — |
| ✅ | `deeds_labs/dead-barrels/server-pgai` | 90 | 1 | 7 | 0 | 0/0 | 0 | — |
| ✅ | `deeds_labs/dead-barrels/stores-machines` | 90 | 1 | 25 | 0 | 0/0 | 0 | — |
| ✅ | `deeds_labs/dead-barrels/utils-syntax-repair` | 90 | 1 | 53 | 0 | 0/0 | 0 | — |
| ✅ | `deeds_labs/dead-barrels/utils-syntax-repair-patterns` | 90 | 1 | 129 | 0 | 0/0 | 0 | — |
| ✅ | `deeds_labs/dead-barrels/yorha` | 90 | 2 | 178 | 0 | 0/0 | 0 | — |
| ✅ | `deeds_labs/dead-proto/src-proto` | 90 | 5 | 23176 | 0 | 0/0 | 0 | — |
| ✅ | `deeds_labs/dead-scripts/src-mjs` | 90 | 4 | 4 | 0 | 0/0 | 0 | — |
| ✅ | `deeds_labs/dead-scripts/storybook` | 90 | 7 | 537 | 0 | 0/0 | 0 | — |
| ✅ | `deeds_labs/dead-scripts/zombie-barrels` | 90 | 2 | 192 | 0 | 0/0 | 0 | — |
| ✅ | `deeds_labs/dead-ui-components/alert` | 90 | 6 | 219 | 0 | 0/0 | 0 | — |
| ✅ | `deeds_labs/dead-ui-components/checkbox` | 90 | 3 | 168 | 0 | 0/0 | 0 | — |
| ✅ | `deeds_labs/dead-ui-components/command` | 90 | 10 | 476 | 0 | 0/0 | 0 | — |
| ✅ | `deeds_labs/dead-ui-components/context-menu` | 90 | 7 | 305 | 0 | 0/0 | 0 | — |
| ✅ | `deeds_labs/dead-ui-components/drawer` | 90 | 12 | 586 | 0 | 0/0 | 0 | — |
| ✅ | `deeds_labs/dead-ui-components/dropdown-menu` | 90 | 9 | 253 | 0 | 0/0 | 0 | — |
| ✅ | `deeds_labs/dead-ui-components/scroll-area` | 90 | 2 | 59 | 0 | 0/0 | 0 | — |
| ✅ | `deeds_labs/dead-ui-components/separator` | 90 | 2 | 27 | 0 | 0/0 | 0 | — |
| ✅ | `deeds_labs/dead-ui-components/slider` | 90 | 3 | 372 | 0 | 0/0 | 0 | — |
| ✅ | `deeds_labs/dead-ui-components/switch` | 90 | 2 | 181 | 0 | 0/0 | 0 | — |
| ✅ | `deeds_labs/dead-ui-components/toast` | 90 | 4 | 235 | 0 | 0/0 | 0 | — |
| ✅ | `deeds_labs/dead-ui-components/tooltip` | 90 | 8 | 454 | 0 | 0/0 | 0 | — |
| ✅ | `deeds_labs/dead_code/contradictionEngine` | 90 | 2 | 718 | 0 | 0/2 | 0 | — |
| ✅ | `deeds_labs/dead_code/contradictionEngine/extractors` | 90 | 3 | 91 | 0 | 0/1 | 0 | — |
| ✅ | `deeds_labs/dead_code/contradictionEngine/integration` | 90 | 2 | 52 | 0 | 0/0 | 0 | — |
| ✅ | `deeds_labs/dead_code/contradictionEngine/llm` | 90 | 2 | 78 | 0 | 0/0 | 0 | — |
| ✅ | `deeds_labs/dead_code/contradictionEngine/mcp` | 90 | 1 | 29 | 0 | 0/0 | 0 | — |
| ✅ | `deeds_labs/dead_code/contradictionEngine/semantic` | 90 | 2 | 63 | 0 | 0/0 | 0 | — |
| ✅ | `deeds_labs/dead_code/contradictionEngine/timeline` | 90 | 5 | 174 | 0 | 0/1 | 0 | — |
| ✅ | `deeds_labs/dead_code/duplicate-vector-files` | 90 | 2 | 237 | 0 | 0/0 | 0 | — |
| ✅ | `deeds_labs/dead_code/src-lib/icons` | 90 | 3 | 69 | 0 | 0/0 | 0 | — |
| ✅ | `deeds_labs/dead_code/src-lib/logging` | 90 | 2 | 78 | 0 | 0/0 | 0 | — |
| ✅ | `deeds_labs/dead_code/src-lib/validation` | 90 | 1 | 329 | 0 | 0/1 | 0 | — |
| ✅ | `deeds_labs/dead_code/src-lib/yorha` | 90 | 3 | 524 | 0 | 0/0 | 0 | — |
| ✅ | `deeds_labs/docs/enhanced-reference` | 90 | 3 | 572 | 0 | 0/0 | 0 | — |
| ✅ | `deeds_labs/embedding-duplicates-2026-03-09` | 90 | 1 | 217 | 0 | 0/0 | 0 | — |
| ✅ | `deeds_labs/frontend/command-center-original` | 90 | 2 | 1366 | 0 | 0/0 | 0 | — |
| ✅ | `deeds_labs/frontend/features-archive/demos` | 90 | 1 | 112 | 0 | 0/0 | 0 | — |
| ✅ | `deeds_labs/frontend/features-archive/memory` | 90 | 1 | 423 | 0 | 0/0 | 0 | — |
| ✅ | `deeds_labs/frontend/features-archive/search` | 90 | 3 | 300 | 0 | 0/1 | 0 | — |
| ✅ | `deeds_labs/frontend/orphaned-components/chat-stubs` | 90 | 6 | 108 | 0 | 0/0 | 0 | — |
| ✅ | `deeds_labs/frontend/orphaned-components/evidence-card-variants` | 90 | 3 | 842 | 0 | 0/0 | 0 | — |
| ✅ | `deeds_labs/frontend/orphaned-components/rag-stubs` | 90 | 2 | 32 | 0 | 0/0 | 0 | — |
| ✅ | `deeds_labs/frontend/orphaned-components/root-stubs` | 90 | 5 | 86 | 0 | 0/0 | 0 | — |
| ✅ | `deeds_labs/frontend/ssr-disable-archive` | 90 | 3 | 34 | 0 | 0/0 | 0 | — |
| ✅ | `deeds_labs/frontend/svelte4-archive/cache` | 90 | 1 | 34 | 0 | 0/0 | 0 | — |
| ✅ | `deeds_labs/frontend/svelte4-archive/client` | 90 | 2 | 360 | 0 | 0/2 | 0 | — |
| ✅ | `deeds_labs/frontend/svelte4-archive/db` | 90 | 1 | 436 | 0 | 0/0 | 0 | — |
| ✅ | `deeds_labs/frontend/svelte4-archive/features` | 90 | 1 | 26 | 0 | 0/0 | 0 | — |
| ✅ | `deeds_labs/frontend/svelte4-archive/forms` | 90 | 1 | 422 | 0 | 0/1 | 0 | — |
| ✅ | `deeds_labs/frontend/svelte4-archive/routing` | 90 | 1 | 188 | 0 | 0/0 | 0 | — |
| ✅ | `deeds_labs/frontend/svelte4-archive/services` | 90 | 1 | 183 | 0 | 0/0 | 0 | — |
| ✅ | `deeds_labs/frontend/svelte4-archive/shims` | 90 | 2 | 21 | 0 | 0/0 | 0 | — |
| ✅ | `deeds_labs/frontend/svelte4-archive/utils` | 90 | 1 | 337 | 0 | 0/0 | 0 | — |
| ✅ | `deeds_labs/frontend/xstate-archive` | 90 | 4 | 920 | 0 | 0/1 | 0 | — |
| ✅ | `deeds_labs/infra/cuda-binaries/cmake-cuda-qlora-trainer` | 90 | 1 | 18 | 0 | 0/0 | 0 | — |
| ✅ | `deeds_labs/infra/cuda-binaries/cpp-ast-exporter` | 90 | 1 | 27 | 0 | 0/0 | 0 | — |
| ✅ | `deeds_labs/infra/cuda-binaries/wasm` | 90 | 2 | 220 | 0 | 0/0 | 0 | — |
| ✅ | `deeds_labs/infra/tensorrt-archive/root-misc` | 90 | 1 | 37 | 0 | 0/0 | 0 | — |
| ✅ | `deeds_labs/infra/tensorrt-archive/tensorrt-build-scripts` | 90 | 1 | 46 | 0 | 0/0 | 0 | — |
| ✅ | `deeds_labs/lib-archive/component-wrappers-feb-9-2026/select` | 90 | 16 | 821 | 0 | 0/0 | 0 | — |
| ✅ | `deeds_labs/lib-dead-directories/3d` | 90 | 1 | 127 | 0 | 0/0 | 0 | — |
| ✅ | `deeds_labs/lib-dead-directories/actions` | 90 | 1 | 51 | 0 | 0/0 | 0 | — |
| ✅ | `deeds_labs/lib-dead-directories/agents-tests` | 90 | 2 | 662 | 0 | 0/0 | 0 | — |
| ✅ | `deeds_labs/lib-dead-directories/animations` | 90 | 1 | 46 | 0 | 0/0 | 0 | — |
| ✅ | `deeds_labs/lib-dead-directories/animations/animations` | 90 | 1 | 23 | 0 | 0/0 | 0 | — |
| ✅ | `deeds_labs/lib-dead-directories/ast` | 90 | 4 | 1454 | 0 | 0/2 | 0 | — |
| ✅ | `deeds_labs/lib-dead-directories/batch-2026-03-16/animations` | 90 | 1 | 23 | 0 | 0/0 | 0 | — |
| ✅ | `deeds_labs/lib-dead-directories/batch-2026-03-16/compat` | 90 | 1 | 120 | 0 | 0/0 | 0 | — |
| ✅ | `deeds_labs/lib-dead-directories/batch-2026-03-16/core` | 90 | 2 | 103 | 0 | 0/0 | 0 | — |
| ✅ | `deeds_labs/lib-dead-directories/batch-2026-03-16/errors` | 90 | 1 | 285 | 0 | 0/0 | 0 | — |
| ✅ | `deeds_labs/lib-dead-directories/batch-2026-03-16/middleware` | 90 | 4 | 1152 | 0 | 1/0 | 0 | — |
| ✅ | `deeds_labs/lib-dead-directories/batch-2026-03-16/optimization` | 90 | 2 | 117 | 0 | 0/0 | 0 | — |
| ✅ | `deeds_labs/lib-dead-directories/batch-2026-03-16/orchestration` | 90 | 2 | 401 | 0 | 0/0 | 0 | — |
| ✅ | `deeds_labs/lib-dead-directories/batch-2026-03-16/rabbitmq` | 90 | 1 | 91 | 0 | 0/1 | 0 | — |
| ✅ | `deeds_labs/lib-dead-directories/batch-2026-03-16/registry` | 90 | 1 | 291 | 0 | 0/0 | 0 | — |
| ✅ | `deeds_labs/lib-dead-directories/batch-2026-03-16/routing` | 90 | 2 | 164 | 0 | 0/0 | 0 | — |
| ✅ | `deeds_labs/lib-dead-directories/batch-2026-03-16/text` | 90 | 1 | 340 | 0 | 0/0 | 0 | — |
| ✅ | `deeds_labs/lib-dead-directories/batch-2026-03-16/vector` | 90 | 1 | 365 | 0 | 0/0 | 0 | — |
| ✅ | `deeds_labs/lib-dead-directories/batch-2026-03-16-audit/phase72` | 90 | 1 | 5 | 0 | 0/0 | 0 | — |
| ✅ | `deeds_labs/lib-dead-directories/batch-2026-03-16-audit/shared` | 90 | 4 | 325 | 0 | 0/1 | 0 | — |
| ✅ | `deeds_labs/lib-dead-directories/batch-2026-03-16-orphans/actions` | 90 | 1 | 51 | 0 | 0/0 | 0 | — |
| ✅ | `deeds_labs/lib-dead-directories/batch-2026-03-16-orphans/client` | 90 | 2 | 217 | 0 | 0/1 | 0 | — |
| ✅ | `deeds_labs/lib-dead-directories/batch-2026-03-16-orphans/client-ui` | 90 | 1 | 61 | 0 | 0/0 | 0 | — |
| ✅ | `deeds_labs/lib-dead-directories/batch-2026-03-16-orphans/components` | 90 | 4 | 227 | 0 | 0/0 | 0 | — |
| ✅ | `deeds_labs/lib-dead-directories/batch-2026-03-16-orphans/messaging` | 90 | 2 | 811 | 0 | 0/2 | 0 | — |
| ✅ | `deeds_labs/lib-dead-directories/cache-orphans` | 90 | 2 | 223 | 0 | 0/0 | 0 | — |
| ✅ | `deeds_labs/lib-dead-directories/client-orphans` | 90 | 2 | 217 | 0 | 0/1 | 0 | — |
| ✅ | `deeds_labs/lib-dead-directories/compat` | 90 | 1 | 120 | 0 | 0/0 | 0 | — |
| ✅ | `deeds_labs/lib-dead-directories/components-orphans` | 90 | 22 | 3705 | 0 | 0/0 | 0 | — |
| ✅ | `deeds_labs/lib-dead-directories/core/logic` | 90 | 2 | 103 | 0 | 0/0 | 0 | — |
| ✅ | `deeds_labs/lib-dead-directories/dashboard` | 90 | 1 | 68 | 0 | 0/0 | 0 | — |
| ✅ | `deeds_labs/lib-dead-directories/error-brain` | 90 | 3 | 277 | 0 | 0/1 | 0 | — |
| ✅ | `deeds_labs/lib-dead-directories/error-brain/transport` | 90 | 4 | 80 | 0 | 0/0 | 0 | — |
| ✅ | `deeds_labs/lib-dead-directories/errors` | 90 | 1 | 286 | 0 | 0/0 | 0 | — |
| ✅ | `deeds_labs/lib-dead-directories/icons` | 90 | 3 | 69 | 0 | 0/0 | 0 | — |
| ✅ | `deeds_labs/lib-dead-directories/logging` | 90 | 2 | 78 | 0 | 0/0 | 0 | — |
| ✅ | `deeds_labs/lib-dead-directories/middleware` | 90 | 1 | 74 | 0 | 0/2 | 0 | — |
| ✅ | `deeds_labs/lib-dead-directories/middleware/middleware` | 90 | 1 | 37 | 0 | 0/1 | 0 | — |
| ✅ | `deeds_labs/lib-dead-directories/modules` | 90 | 2 | 1234 | 0 | 0/4 | 0 | — |
| ✅ | `deeds_labs/lib-dead-directories/modules/modules` | 90 | 2 | 617 | 0 | 0/2 | 0 | — |
| ✅ | `deeds_labs/lib-dead-directories/moogle` | 90 | 1 | 72 | 0 | 0/0 | 0 | — |
| ✅ | `deeds_labs/lib-dead-directories/moogle/moogle` | 90 | 1 | 36 | 0 | 0/0 | 0 | — |
| ✅ | `deeds_labs/lib-dead-directories/orchestration` | 90 | 3 | 116 | 0 | 0/0 | 0 | — |
| ✅ | `deeds_labs/lib-dead-directories/orchestration/orchestration` | 90 | 3 | 58 | 0 | 0/0 | 0 | — |
| ✅ | `deeds_labs/lib-dead-directories/rabbitmq` | 90 | 1 | 92 | 0 | 0/1 | 0 | — |
| ✅ | `deeds_labs/lib-dead-directories/registry` | 90 | 1 | 291 | 0 | 0/0 | 0 | — |
| ✅ | `deeds_labs/lib-dead-directories/routing` | 90 | 2 | 818 | 0 | 0/0 | 0 | — |
| ✅ | `deeds_labs/lib-dead-directories/routing/routing` | 90 | 2 | 409 | 0 | 0/0 | 0 | — |
| ✅ | `deeds_labs/lib-dead-directories/schema-orphans` | 90 | 3 | 241 | 0 | 0/3 | 0 | — |
| ✅ | `deeds_labs/lib-dead-directories/state` | 90 | 1 | 603 | 0 | 0/0 | 0 | — |
| ✅ | `deeds_labs/lib-dead-directories/storage` | 90 | 1 | 30 | 0 | 0/0 | 0 | — |
| ✅ | `deeds_labs/lib-dead-directories/storage/storage` | 90 | 1 | 15 | 0 | 0/0 | 0 | — |
| ✅ | `deeds_labs/lib-dead-directories/text` | 90 | 1 | 340 | 0 | 0/0 | 0 | — |
| ✅ | `deeds_labs/lib-dead-directories/themes` | 90 | 2 | 916 | 0 | 0/1 | 0 | — |
| ✅ | `deeds_labs/lib-dead-directories/themes/retro-console-palettes` | 90 | 1 | 95 | 0 | 0/0 | 0 | — |
| ✅ | `deeds_labs/lib-dead-directories/validation` | 90 | 1 | 329 | 0 | 0/1 | 0 | — |
| ✅ | `deeds_labs/lib-dead-directories/vector` | 90 | 1 | 365 | 0 | 0/0 | 0 | — |
| ✅ | `deeds_labs/lib-dead-directories/vite` | 90 | 2 | 435 | 0 | 0/4 | 0 | — |
| ✅ | `deeds_labs/lib-dead-directories/vite/vite` | 90 | 2 | 19 | 0 | 0/2 | 0 | — |
| ✅ | `deeds_labs/lib-dead-directories/yorha` | 90 | 3 | 524 | 0 | 0/0 | 0 | — |
| ✅ | `deeds_labs/orphan-consolidation-2026-03-29/legal-ai-tests` | 90 | 6 | 995 | 0 | 0/0 | 0 | — |
| ✅ | `deeds_labs/orphan-consolidation-2026-03-29/server-adapters` | 90 | 2 | 105 | 0 | 0/0 | 0 | — |
| ✅ | `deeds_labs/orphan-consolidation-2026-03-29/ui-bits-wrappers` | 90 | 4 | 975 | 0 | 0/0 | 0 | — |
| ✅ | `deeds_labs/orphan-consolidation-2026-03-29/ui-dead-barrels` | 90 | 1 | 76 | 0 | 0/0 | 0 | — |
| ✅ | `deeds_labs/phantom-code-lab` | 90 | 8 | 2545 | 0 | 0/3 | 0 | — |
| ✅ | `deeds_labs/projects/agentic-error-resolution/errors` | 90 | 2 | 14 | 0 | 0/0 | 0 | — |
| ✅ | `deeds_labs/projects/agentic-error-resolution/logs` | 90 | 2 | 21 | 0 | 0/0 | 0 | — |
| ✅ | `deeds_labs/projects/agentic-error-resolution/reports` | 90 | 2 | 31 | 0 | 0/0 | 0 | — |
| ✅ | `deeds_labs/projects/evidence-service/drizzle` | 90 | 2 | 664 | 0 | 0/0 | 0 | — |
| ✅ | `deeds_labs/projects/legacy-projects/ace_runs` | 90 | 1 | 1118 | 0 | 0/0 | 0 | — |
| ✅ | `deeds_labs/projects/legacy-projects/archive` | 90 | 2 | 46 | 0 | 0/0 | 0 | — |
| ✅ | `deeds_labs/projects/legacy-projects/config` | 90 | 1 | 1 | 0 | 0/0 | 0 | — |
| ✅ | `deeds_labs/projects/legacy-projects/context7` | 90 | 1 | 120 | 0 | 0/1 | 0 | — |
| ✅ | `deeds_labs/projects/legacy-projects/context7-docs` | 90 | 10 | 732 | 0 | 0/1 | 0 | — |
| ✅ | `deeds_labs/projects/legacy-projects/data` | 90 | 1 | 1 | 0 | 0/0 | 0 | — |
| ✅ | `deeds_labs/projects/legacy-projects/datasets` | 90 | 1 | 6 | 0 | 0/0 | 0 | — |
| ✅ | `deeds_labs/projects/legacy-projects/error-analysis` | 90 | 1 | 25743 | 0 | 0/0 | 0 | — |
| ✅ | `deeds_labs/projects/legacy-projects/granite-docling-worker` | 90 | 1 | 21 | 0 | 0/0 | 0 | — |
| ✅ | `deeds_labs/projects/legacy-projects/langextract-go` | 90 | 6 | 1288 | 0 | 0/0 | 0 | — |
| ✅ | `deeds_labs/projects/legacy-projects/legal_ai_output` | 90 | 1 | 3132 | 0 | 0/0 | 0 | — |
| ✅ | `deeds_labs/projects/legacy-projects/monitoring` | 90 | 1 | 131 | 0 | 0/0 | 0 | — |
| ✅ | `deeds_labs/projects/legacy-projects/orchestrator` | 90 | 1 | 1 | 0 | 0/0 | 0 | — |
| ✅ | `deeds_labs/projects/legacy-projects/perf` | 90 | 1 | 1 | 0 | 0/0 | 0 | — |
| ✅ | `deeds_labs/projects/legacy-projects/q4km_test_results` | 90 | 1 | 28 | 0 | 0/0 | 0 | — |
| ✅ | `deeds_labs/projects/legacy-projects/reports` | 90 | 5 | 3414 | 0 | 0/0 | 0 | — |
| ✅ | `deeds_labs/projects/legacy-projects/svelte-check-errors-index` | 90 | 3 | 3 | 0 | 0/0 | 0 | — |
| ✅ | `deeds_labs/projects/legacy-projects/test-reports` | 90 | 2 | 15 | 0 | 0/0 | 0 | — |
| ✅ | `deeds_labs/projects/legacy-projects/test-results` | 90 | 1 | 4 | 0 | 0/0 | 0 | — |
| ✅ | `deeds_labs/projects/legacy-projects/todolist_2025-08-04T05-23-51` | 90 | 2 | 65 | 0 | 0/0 | 0 | — |
| ✅ | `deeds_labs/projects/legacy-projects/windows-service` | 90 | 1 | 68 | 0 | 0/0 | 0 | — |
| ✅ | `deeds_labs/projects/legacy-projects/workers` | 90 | 2 | 2 | 0 | 0/0 | 0 | — |
| ✅ | `deeds_labs/root-archive-20260315/misc` | 90 | 5 | 508 | 0 | 0/0 | 0 | — |
| ✅ | `deeds_labs/routes-parked-full/(admin)_disabled` | 90 | 1 | 83 | 0 | 0/0 | 0 | — |
| ✅ | `deeds_labs/routes-parked-full/(ai)_disabled/ai-dashboard` | 90 | 2 | 708 | 0 | 1/0 | 0 | — |
| ✅ | `deeds_labs/routes-parked-full/(ai)_disabled/assistant` | 90 | 1 | 485 | 0 | 0/1 | 0 | — |
| ✅ | `deeds_labs/routes-parked-full/(ai)_disabled/case-scoring` | 90 | 1 | 18 | 0 | 0/0 | 0 | — |
| ✅ | `deeds_labs/routes-parked-full/(ai)_disabled/document-drafting` | 90 | 1 | 23 | 0 | 0/0 | 0 | — |
| ✅ | `deeds_labs/routes-parked-full/(ai)_disabled/gpu-chat` | 90 | 1 | 17 | 0 | 0/0 | 0 | — |
| ✅ | `deeds_labs/routes-parked-full/(ai)_disabled/pattern-detection` | 90 | 1 | 23 | 0 | 0/0 | 0 | — |
| ✅ | `deeds_labs/routes-parked-full/(ai)_disabled/processing` | 90 | 1 | 301 | 0 | 0/0 | 0 | — |
| ✅ | `deeds_labs/routes-parked-full/(ai)_disabled/recommendations` | 90 | 1 | 18 | 0 | 0/0 | 0 | — |
| ✅ | `deeds_labs/routes-parked-full/(ai)_disabled/summarize` | 90 | 1 | 311 | 0 | 0/0 | 0 | — |
| ✅ | `deeds_labs/routes-parked-full/(ai)_disabled/summary` | 90 | 1 | 88 | 0 | 0/0 | 0 | — |
| ✅ | `deeds_labs/routes-parked-full/(ai)_disabled/vector-search` | 90 | 1 | 469 | 0 | 0/0 | 0 | — |
| ✅ | `deeds_labs/routes-parked-full/(auth)_disabled/sessions` | 90 | 1 | 227 | 0 | 0/0 | 0 | — |
| ✅ | `deeds_labs/routes-parked-full/(demo)_disabled/[slug]` | 90 | 1 | 313 | 0 | 0/0 | 0 | — |
| ✅ | `deeds_labs/routes-parked-full/(dev)_disabled` | 90 | 1 | 119 | 0 | 0/0 | 0 | — |
| ✅ | `deeds_labs/routes-parked-full/(legal)_disabled/citations` | 90 | 1 | 207 | 0 | 0/0 | 0 | — |
| ✅ | `deeds_labs/routes-parked-full/(public)_disabled` | 90 | 2 | 229 | 0 | 0/0 | 0 | — |
| ✅ | `deeds_labs/routes-parked-full/(tools)_disabled/cuda-search` | 90 | 1 | 217 | 0 | 0/0 | 0 | — |
| ✅ | `deeds_labs/routes-parked-full/(tools)_disabled/editor` | 90 | 1 | 338 | 0 | 0/0 | 0 | — |
| ✅ | `deeds_labs/routes-parked-full/agent-demo` | 90 | 2 | 106 | 0 | 0/0 | 0 | — |
| ✅ | `deeds_labs/routes-parked-full/ai` | 90 | 2 | 53 | 0 | 0/0 | 0 | — |
| ✅ | `deeds_labs/routes-parked-full/aichat` | 90 | 1 | 281 | 0 | 0/0 | 0 | — |
| ✅ | `deeds_labs/routes-parked-full/all-routes-ace` | 90 | 1 | 537 | 0 | 0/0 | 0 | — |
| ✅ | `deeds_labs/routes-parked-full/api/enhanced-rag` | 90 | 1 | 1 | 0 | 0/0 | 0 | — |
| ✅ | `deeds_labs/routes-parked-full/api/gpu-error-processor` | 90 | 1 | 305 | 0 | 0/0 | 0 | — |
| ✅ | `deeds_labs/routes-parked-full/api/gpu-final-processing` | 90 | 1 | 50 | 0 | 0/0 | 0 | — |
| ✅ | `deeds_labs/routes-parked-full/api/ingest` | 90 | 2 | 2 | 0 | 0/0 | 0 | — |
| ✅ | `deeds_labs/routes-parked-full/api/integrated` | 90 | 1 | 1 | 0 | 0/0 | 0 | — |
| ✅ | `deeds_labs/routes-parked-full/api/phase14` | 90 | 3 | 12 | 0 | 0/0 | 0 | — |
| ✅ | `deeds_labs/routes-parked-full/api/png` | 90 | 1 | 1 | 0 | 0/0 | 0 | — |
| ✅ | `deeds_labs/routes-parked-full/api/precedents` | 90 | 1 | 1 | 0 | 0/0 | 0 | — |
| ✅ | `deeds_labs/routes-parked-full/api/predictor` | 90 | 1 | 15 | 0 | 0/0 | 0 | — |
| ✅ | `deeds_labs/routes-parked-full/api/process-legal-document` | 90 | 1 | 4 | 0 | 0/0 | 0 | — |
| ✅ | `deeds_labs/routes-parked-full/api/queue` | 90 | 1 | 1 | 0 | 0/0 | 0 | — |
| ✅ | `deeds_labs/routes-parked-full/api/webgpu` | 90 | 1 | 6 | 0 | 0/0 | 0 | — |
| ✅ | `deeds_labs/routes-parked-full/api/workers` | 90 | 8 | 19 | 0 | 0/0 | 0 | — |
| ✅ | `deeds_labs/routes-parked-full/ast_graph_error_analysis` | 90 | 2 | 400 | 0 | 0/0 | 0 | — |
| ✅ | `deeds_labs/routes-parked-full/chat-standalone` | 90 | 1 | 390 | 0 | 0/0 | 0 | — |
| ✅ | `deeds_labs/routes-parked-full/command` | 90 | 1 | 8 | 0 | 0/0 | 0 | — |
| ✅ | `deeds_labs/routes-parked-full/command/routes` | 90 | 1 | 4 | 0 | 0/0 | 0 | — |
| ✅ | `deeds_labs/routes-parked-full/crud-dashboard` | 90 | 1 | 27 | 0 | 0/0 | 0 | — |
| ✅ | `deeds_labs/routes-parked-full/demos` | 90 | 1 | 1 | 0 | 0/0 | 0 | — |
| ✅ | `deeds_labs/routes-parked-full/detective` | 90 | 1 | 29 | 0 | 0/0 | 0 | — |
| ✅ | `deeds_labs/routes-parked-full/dev/webgl-fallback-test` | 90 | 1 | 562 | 0 | 0/0 | 0 | — |
| ✅ | `deeds_labs/routes-parked-full/docs/[docId]` | 90 | 1 | 203 | 0 | 0/0 | 0 | — |
| ✅ | `deeds_labs/routes-parked-full/enhanced` | 90 | 1 | 207 | 0 | 0/1 | 0 | — |
| ✅ | `deeds_labs/routes-parked-full/error-brain` | 90 | 2 | 568 | 0 | 0/1 | 0 | — |
| ✅ | `deeds_labs/routes-parked-full/error-brain/runs` | 90 | 2 | 361 | 0 | 0/1 | 0 | — |
| ✅ | `deeds_labs/routes-parked-full/evidence-board` | 90 | 2 | 474 | 0 | 0/0 | 0 | — |
| ✅ | `deeds_labs/routes-parked-full/evidence-editor` | 90 | 1 | 32 | 0 | 0/0 | 0 | — |
| ✅ | `deeds_labs/routes-parked-full/evidenceboard` | 90 | 1 | 17 | 0 | 0/0 | 0 | — |
| ✅ | `deeds_labs/routes-parked-full/field-demo` | 90 | 1 | 37 | 0 | 0/0 | 0 | — |
| ✅ | `deeds_labs/routes-parked-full/graph` | 90 | 1 | 45 | 0 | 0/0 | 0 | — |
| ✅ | `deeds_labs/routes-parked-full/graph-mode` | 90 | 1 | 474 | 0 | 0/0 | 0 | — |
| ✅ | `deeds_labs/routes-parked-full/help` | 90 | 2 | 902 | 0 | 0/0 | 0 | — |
| ✅ | `deeds_labs/routes-parked-full/icon-demo` | 90 | 1 | 21 | 0 | 0/0 | 0 | — |
| ✅ | `deeds_labs/routes-parked-full/investigation` | 90 | 1 | 381 | 0 | 0/0 | 0 | — |
| ✅ | `deeds_labs/routes-parked-full/law` | 90 | 1 | 62 | 0 | 0/0 | 0 | — |
| ✅ | `deeds_labs/routes-parked-full/laws/[slug]` | 90 | 1 | 23 | 0 | 0/0 | 0 | — |
| ✅ | `deeds_labs/routes-parked-full/legal-report-compare` | 90 | 1 | 315 | 0 | 0/0 | 0 | — |
| ✅ | `deeds_labs/routes-parked-full/machines-integration-example` | 90 | 1 | 294 | 0 | 0/0 | 0 | — |
| ✅ | `deeds_labs/routes-parked-full/mcp-demo` | 90 | 1 | 79 | 0 | 0/0 | 0 | — |
| ✅ | `deeds_labs/routes-parked-full/metrics` | 90 | 1 | 82 | 0 | 0/0 | 0 | — |
| ✅ | `deeds_labs/routes-parked-full/nes-dialog-demo` | 90 | 1 | 76 | 0 | 0/0 | 0 | — |
| ✅ | `deeds_labs/routes-parked-full/optimization-dashboard` | 90 | 1 | 230 | 0 | 0/0 | 0 | — |
| ✅ | `deeds_labs/routes-parked-full/original-home` | 90 | 1 | 69 | 0 | 0/0 | 0 | — |
| ✅ | `deeds_labs/routes-parked-full/persons` | 90 | 1 | 680 | 0 | 0/0 | 0 | — |
| ✅ | `deeds_labs/routes-parked-full/phase-74` | 90 | 1 | 489 | 0 | 0/0 | 0 | — |
| ✅ | `deeds_labs/routes-parked-full/phase72-chat` | 90 | 1 | 284 | 0 | 0/0 | 0 | — |
| ✅ | `deeds_labs/routes-parked-full/phase72-demo` | 90 | 1 | 323 | 0 | 0/0 | 0 | — |
| ✅ | `deeds_labs/routes-parked-full/prosecutor` | 90 | 1 | 20 | 0 | 0/0 | 0 | — |
| ✅ | `deeds_labs/routes-parked-full/protected` | 90 | 2 | 50 | 0 | 1/0 | 0 | — |
| ✅ | `deeds_labs/routes-parked-full/proxy` | 90 | 5 | 54 | 0 | 0/0 | 0 | — |
| ✅ | `deeds_labs/routes-parked-full/rag` | 90 | 3 | 421 | 0 | 0/2 | 0 | — |
| ✅ | `deeds_labs/routes-parked-full/rag-demo` | 90 | 1 | 224 | 0 | 0/0 | 0 | — |
| ✅ | `deeds_labs/routes-parked-full/rag-test` | 90 | 1 | 31 | 0 | 0/0 | 0 | — |
| ✅ | `deeds_labs/routes-parked-full/register` | 90 | 2 | 630 | 0 | 1/2 | 0 | — |
| ✅ | `deeds_labs/routes-parked-full/reports` | 90 | 1 | 220 | 0 | 0/0 | 0 | — |
| ✅ | `deeds_labs/routes-parked-full/search-main` | 90 | 1 | 378 | 0 | 0/0 | 0 | — |
| ✅ | `deeds_labs/routes-parked-full/search-standalone` | 90 | 1 | 443 | 0 | 0/0 | 0 | — |
| ✅ | `deeds_labs/routes-parked-full/security` | 90 | 1 | 45 | 0 | 0/0 | 0 | — |
| ✅ | `deeds_labs/routes-parked-full/settings` | 90 | 1 | 56 | 0 | 0/0 | 0 | — |
| ✅ | `deeds_labs/routes-parked-full/showcase-standalone` | 90 | 2 | 35 | 0 | 0/0 | 0 | — |
| ✅ | `deeds_labs/routes-parked-full/simple-test` | 90 | 1 | 69 | 0 | 0/0 | 0 | — |
| ✅ | `deeds_labs/routes-parked-full/simple-upload-test` | 90 | 1 | 141 | 0 | 0/0 | 0 | — |
| ✅ | `deeds_labs/routes-parked-full/spa` | 90 | 1 | 329 | 0 | 0/0 | 0 | — |
| ✅ | `deeds_labs/routes-parked-full/status` | 90 | 1 | 286 | 0 | 0/0 | 0 | — |
| ✅ | `deeds_labs/routes-parked-full/storage/admin` | 90 | 1 | 17 | 0 | 0/0 | 0 | — |
| ✅ | `deeds_labs/routes-parked-full/summarize-standalone` | 90 | 1 | 683 | 0 | 0/0 | 0 | — |
| ✅ | `deeds_labs/routes-parked-full/system-status` | 90 | 1 | 190 | 0 | 0/0 | 0 | — |
| ✅ | `deeds_labs/routes-parked-full/terminal.old` | 90 | 1 | 130 | 0 | 0/0 | 0 | — |
| ✅ | `deeds_labs/routes-parked-full/terminal_disabled` | 90 | 1 | 17 | 0 | 0/0 | 0 | — |
| ✅ | `deeds_labs/routes-parked-full/test` | 90 | 1 | 30 | 0 | 0/0 | 0 | — |
| ✅ | `deeds_labs/routes-parked-full/test-case-notes` | 90 | 1 | 34 | 0 | 0/0 | 0 | — |
| ✅ | `deeds_labs/routes-parked-full/test-grey-balance` | 90 | 1 | 258 | 0 | 0/0 | 0 | — |
| ✅ | `deeds_labs/routes-parked-full/test-rag` | 90 | 1 | 19 | 0 | 0/0 | 0 | — |
| ✅ | `deeds_labs/routes-parked-full/test-route-discovery` | 90 | 1 | 158 | 0 | 0/0 | 0 | — |
| ✅ | `deeds_labs/routes-parked-full/text-editor` | 90 | 1 | 363 | 0 | 0/0 | 0 | — |
| ✅ | `deeds_labs/routes-parked-full/trt-llm-demo` | 90 | 1 | 415 | 0 | 0/0 | 0 | — |
| ✅ | `deeds_labs/routes-parked-full/ui-preview` | 90 | 1 | 687 | 0 | 0/0 | 0 | — |
| ✅ | `deeds_labs/routes-parked-full/ui-test` | 90 | 1 | 88 | 0 | 0/0 | 0 | — |
| ✅ | `deeds_labs/routes-parked-full/upload` | 90 | 2 | 485 | 0 | 0/1 | 0 | — |
| ✅ | `deeds_labs/routes-parked-full/upload-test` | 90 | 2 | 87 | 0 | 0/2 | 0 | — |
| ✅ | `deeds_labs/routes-parked-full/validation` | 90 | 1 | 19 | 0 | 0/0 | 0 | — |
| ✅ | `deeds_labs/routes-parked-full/w1` | 90 | 1 | 890 | 0 | 0/0 | 0 | — |
| ✅ | `deeds_labs/routes-parked-full/webgpu-test` | 90 | 1 | 222 | 0 | 0/0 | 0 | — |
| ✅ | `deeds_labs/routes-parked-full/yorha-detective` | 90 | 1 | 220 | 0 | 0/0 | 0 | — |
| ✅ | `deeds_labs/routes-parked-full/_archive-command-center` | 90 | 1 | 11 | 0 | 0/0 | 0 | — |
| ✅ | `deeds_labs/routes-parked-full/_archive-terminal` | 90 | 2 | 992 | 0 | 0/1 | 0 | — |
| ✅ | `deeds_labs/routes-parked-full/_yorha_legacy` | 90 | 1 | 598 | 0 | 0/0 | 0 | — |
| ✅ | `deeds_labs/routes-parked-full/_yorha_legacy/command_disabled` | 90 | 1 | 141 | 0 | 0/0 | 0 | — |
| ✅ | `deeds_labs/routes-parked-full/_yorha_legacy/evidence_disabled` | 90 | 2 | 62 | 0 | 0/0 | 0 | — |
| ✅ | `deeds_labs/routes-parked-full/_yorha_legacy/graph_disabled` | 90 | 2 | 30 | 0 | 0/0 | 0 | — |
| ✅ | `deeds_labs/routes-parked-full/_yorha_legacy/poi` | 90 | 1 | 238 | 0 | 0/0 | 0 | — |
| ✅ | `deeds_labs/routes-parked-full/_yorha_legacy/sentencing` | 90 | 1 | 12 | 0 | 0/0 | 0 | — |
| ✅ | `deeds_labs/routes-parked-full/_yorha_legacy/terminal` | 90 | 1 | 72 | 0 | 0/0 | 0 | — |
| ✅ | `deeds_labs/routes-parked-full/_yorha_legacy/timeline` | 90 | 2 | 30 | 0 | 0/0 | 0 | — |
| ✅ | `deeds_labs/routes-reference/agent-demo` | 90 | 2 | 106 | 0 | 0/0 | 0 | — |
| ✅ | `deeds_labs/routes-reference/cuda-search` | 90 | 1 | 217 | 0 | 0/0 | 0 | — |
| ✅ | `deeds_labs/routes-reference/mcp-demo` | 90 | 1 | 79 | 0 | 0/0 | 0 | — |
| ✅ | `deeds_labs/routes-reference/summarize` | 90 | 1 | 311 | 0 | 0/0 | 0 | — |
| ✅ | `deeds_labs/services/archived-client-lib/machines-tests` | 90 | 4 | 181 | 0 | 0/0 | 0 | — |
| ✅ | `deeds_labs/services/archived-client-lib/shims-superforms` | 90 | 1 | 18 | 0 | 0/0 | 0 | — |
| ✅ | `deeds_labs/services/archived-dead-files/phase1-consolidation` | 90 | 3 | 499 | 0 | 0/1 | 0 | — |
| ✅ | `deeds_labs/services/archived-dead-files/stubs-legal` | 90 | 5 | 80 | 0 | 0/0 | 0 | — |
| ✅ | `deeds_labs/services/archived-dead-files/stubs-rag` | 90 | 4 | 70 | 0 | 0/0 | 0 | — |
| ✅ | `deeds_labs/services/archived-dead-files/zero-importer-server` | 90 | 6 | 1672 | 0 | 0/4 | 0 | — |
| ✅ | `deeds_labs/services/archived-machines/xstate-dead` | 90 | 2 | 464 | 0 | 0/1 | 0 | — |
| ✅ | `deeds_labs/services/archived-unreachable` | 90 | 1 | 1897 | 0 | 0/2 | 0 | — |
| ✅ | `deeds_labs/services/archived-unreachable/machines` | 90 | 3 | 1871 | 0 | 0/2 | 0 | — |
| ✅ | `deeds_labs/services/development-tools/vite-tooling` | 90 | 2 | 418 | 0 | 0/2 | 0 | — |
| ✅ | `deeds_labs/services/ts-consolidation-archive/ai` | 90 | 5 | 527 | 0 | 0/0 | 0 | — |
| ✅ | `deeds_labs/services/ts-consolidation-archive/cache` | 90 | 1 | 8 | 0 | 0/0 | 0 | — |
| ✅ | `deeds_labs/services/ts-consolidation-archive/database` | 90 | 1 | 180 | 0 | 0/0 | 0 | — |
| ✅ | `deeds_labs/services/ts-consolidation-archive/dead-stores-2026-03-09` | 90 | 12 | 1536 | 0 | 0/0 | 0 | — |
| ✅ | `deeds_labs/services/ts-consolidation-archive/machines-orphans-2026-03-09` | 90 | 4 | 1520 | 0 | 0/1 | 0 | — |
| ✅ | `deeds_labs/services/ts-consolidation-archive/ollama` | 90 | 1 | 41 | 0 | 0/0 | 0 | — |
| ✅ | `deeds_labs/services/ts-consolidation-archive/queue` | 90 | 2 | 387 | 0 | 0/0 | 0 | — |
| ✅ | `deeds_labs/services/ts-consolidation-archive/schema` | 90 | 1 | 4 | 0 | 0/0 | 0 | — |
| ✅ | `deeds_labs/services/ts-consolidation-archive/types-orphans-2026-03-09` | 90 | 31 | 4785 | 0 | 0/1 | 0 | — |
| ✅ | `deeds_labs/services/ts-consolidation-archive/vector` | 90 | 3 | 1221 | 0 | 0/0 | 0 | — |
| ✅ | `deeds_labs/snapshots/2026-03-15-root/configs` | 90 | 46 | 16530 | 0 | 0/0 | 0 | — |
| ✅ | `deeds_labs/snapshots/2026-03-15-v1/types-dead` | 90 | 31 | 3903 | 0 | 0/0 | 0 | — |
| ✅ | `deeds_labs/stores-reference/svelte4_stores` | 90 | 28 | 3362 | 0 | 0/5 | 0 | — |
| ✅ | `deeds_labs/unwired-features-archive-2026-05-05` | 90 | 1 | 548 | 0 | 0/1 | 0 | — |
| ✅ | `deeds_labs/vite-plugins` | 90 | 1 | 141 | 0 | 0/1 | 0 | — |
| ✅ | `docker/bifrost` | 90 | 2 | 108 | 0 | 0/0 | 0 | — |
| ✅ | `docker/seaweedfs` | 90 | 2 | 82 | 0 | 0/0 | 0 | — |
| ✅ | `docs/graph` | 90 | 20 | 642550 | 0 | 0/0 | 0 | — |
| ✅ | `docs/reports` | 90 | 27 | 25085 | 0 | 0/0 | 0 | — |
| ✅ | `drizzle/meta` | 90 | 4 | 4562 | 0 | 0/0 | 0 | — |
| ✅ | `minio-data/.minio.sys` | 90 | 1 | 1 | 0 | 0/0 | 0 | — |
| ✅ | `models/embeddinggemma_300m` | 90 | 9 | 2431175 | 0 | 0/0 | 0 | — |
| ✅ | `models/embeddinggemma_300m/1_Pooling` | 90 | 1 | 10 | 0 | 0/0 | 0 | — |
| ✅ | `models/embeddinggemma_300m/2_Dense` | 90 | 1 | 6 | 0 | 0/0 | 0 | — |
| ✅ | `models/embeddinggemma_300m/3_Dense` | 90 | 1 | 6 | 0 | 0/0 | 0 | — |
| ✅ | `models/embeddinggemma_300m_onnx` | 90 | 5 | 2431089 | 0 | 0/0 | 0 | — |
| ✅ | `models/gemma3-client-onnx` | 90 | 5 | 2431005 | 0 | 0/0 | 0 | — |
| ✅ | `models/gemma3-legal` | 90 | 1 | 12 | 0 | 0/0 | 0 | — |
| ✅ | `models/gemma3-legal-q4km` | 90 | 1 | 14 | 0 | 0/0 | 0 | — |
| ✅ | `models/gemma3-legal-q4km-hf` | 90 | 1 | 29 | 0 | 0/0 | 0 | — |
| ✅ | `models/gemma3_270m` | 90 | 6 | 2431058 | 0 | 0/0 | 0 | — |
| ✅ | `next_steps/active` | 90 | 2 | 464350 | 0 | 0/0 | 0 | — |
| ✅ | `qdrant-windows/qdrant_storage` | 90 | 1 | 2 | 0 | 0/0 | 0 | — |
| ✅ | `qdrant-windows/qdrant_storage/aliases` | 90 | 1 | 1 | 0 | 0/0 | 0 | — |
| ✅ | `qdrant-windows/storage` | 90 | 1 | 38 | 0 | 0/0 | 0 | — |
| ✅ | `qdrant-windows/storage/aliases` | 90 | 1 | 1 | 0 | 0/0 | 0 | — |
| ✅ | `qdrant-windows/storage/collections/legal_evidence` | 90 | 36 | 36 | 0 | 0/0 | 0 | — |
| ✅ | `scratch/index-checkpoints` | 90 | 2 | 179205 | 0 | 0/0 | 0 | — |
| ✅ | `scratch/obsidian_vault/.obsidian/plugins` | 90 | 2 | 59245 | 0 | 1/1 | 0 | — |
| ✅ | `scripts/agents` | 90 | 2 | 16 | 0 | 0/0 | 0 | — |
| ✅ | `scripts/analysis_reports` | 90 | 24 | 10410 | 0 | 0/0 | 0 | — |
| ✅ | `scripts/case_data/_cache` | 90 | 292 | 292 | 0 | 0/0 | 0 | — |
| ✅ | `scripts/court_data/constitutions` | 90 | 18 | 2360 | 0 | 0/0 | 0 | — |
| ✅ | `scripts/error-resolution` | 90 | 8 | 10336 | 0 | 0/4 | 0 | — |
| ✅ | `scripts/error-resolution/services` | 90 | 12 | 3876 | 0 | 0/4 | 0 | — |
| ✅ | `scripts/error-resolution/tests` | 90 | 12 | 5436 | 0 | 0/0 | 0 | — |
| ✅ | `scripts/eval/data` | 90 | 2 | 328 | 0 | 0/0 | 0 | — |
| ✅ | `scripts/graphify` | 90 | 4 | 202 | 0 | 0/0 | 0 | — |
| ✅ | `scripts/logs/task-output/pipeline-test` | 90 | 18 | 21648 | 0 | 0/0 | 0 | — |
| ✅ | `scripts/memory/graphify/gds` | 90 | 16 | 573596 | 0 | 0/0 | 0 | — |
| ✅ | `scripts/tests/agent-investigate-results` | 90 | 22 | 1992 | 0 | 0/0 | 0 | — |
| ✅ | `scripts/tests/logs` | 90 | 2 | 1098 | 0 | 0/0 | 0 | — |
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
| ✅ | `simd-bridge/cpp` | 90 | 4 | 896 | 0 | 0/2 | 0 | — |
| ✅ | `simd-bridge/examples` | 90 | 4 | 60 | 0 | 0/0 | 0 | — |
| ✅ | `simd-bridge/rust/graph-engine` | 90 | 6 | 176 | 0 | 0/0 | 0 | — |
| ✅ | `simd-bridge/rust/graph-engine/target` | 90 | 110 | 110 | 0 | 0/0 | 0 | — |
| ✅ | `simd-bridge/rust/hmm-repair` | 90 | 6 | 268 | 0 | 0/0 | 0 | — |
| ✅ | `simd-bridge/rust/hmm-repair/target` | 90 | 202 | 202 | 0 | 0/0 | 0 | — |
| ✅ | `storage/aliases` | 90 | 1 | 1 | 0 | 0/0 | 0 | — |
| ✅ | `storage/collections/phase72_evidence_embeddings` | 90 | 2 | 36 | 0 | 0/0 | 0 | — |
| ✅ | `storage/collections/phase72_evidence_embeddings/0` | 90 | 34 | 34 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/.cache/d9-verifier` | 90 | 18 | 18 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/.cache/llm-synthesis` | 90 | 1 | 14 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/.claude` | 90 | 1 | 45 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/.tmp/audits` | 90 | 2 | 450 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/.tmp/audits/archive` | 90 | 2 | 291 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/.venv_turbovec/Lib/site-packages` | 90 | 1 | 7857 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/config` | 90 | 1 | 130 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/deeds_labs/archived/phase72` | 90 | 1 | 41 | 0 | 0/1 | 0 | — |
| ✅ | `sveltekit-frontend/docs/atlas-index` | 90 | 2 | 143955 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/docs/graph` | 90 | 17 | 3325272 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/docs/obsidian-vault` | 90 | 2 | 108 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/docs/reports` | 90 | 1 | 122 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/docs_readme/deeds_labs_archive` | 90 | 85 | 2999318 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/docs_readme/deeds_labs_archive/components` | 90 | 3 | 1820 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/drizzle/introspected/meta` | 90 | 2 | 17338 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/drizzle/meta` | 90 | 15 | 174088 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/drizzle/meta_backup_20260101` | 90 | 10 | 32129 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/logs` | 90 | 1 | 57447 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/logs/audit` | 90 | 1 | 20 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/logs/hyperrag-stream` | 90 | 12 | 486 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/logs/mcp` | 90 | 6 | 235 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/logs/pentagon-search` | 90 | 1 | 12 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/logs/task-output` | 90 | 4 | 54502 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/logs/task-output/pipeline-test` | 90 | 252 | 50834 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/logs/trace-full-loop` | 90 | 5 | 1186 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/logs/turboquant` | 90 | 13 | 991 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/memory/agents-dag` | 90 | 34 | 2433 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/memory/atlas` | 90 | 3 | 3 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/memory/codebase` | 90 | 2 | 18036 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/memory/docstore` | 90 | 1 | 22 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/memory/features` | 90 | 3 | 623 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/memory/graphify/deep` | 90 | 5 | 490983 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/memory/graphify/gds` | 90 | 56 | 1180286 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/memory/kag-notes` | 90 | 1 | 16 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/memory/kb` | 90 | 1 | 279726 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/memory/kb/cards` | 90 | 2 | 87451 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/memory/kb/notecards` | 90 | 3 | 192216 | 0 | 0/0 | 0 | — |
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
| ✅ | `sveltekit-frontend/memory/runs/2026-05-17T22-17-52` | 90 | 9 | 90493 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/memory/synthesis` | 90 | 1 | 10 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/mini_active_nvme_cache` | 90 | 1 | 1 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/reports` | 90 | 1 | 172183 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/reports/deep-audit` | 90 | 4 | 172172 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/reports/deep-audit/encoded` | 90 | 17 | 31440 | 0 | 0/0 | 0 | — |
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
| ✅ | `sveltekit-frontend/scripts/backup-consolidation` | 90 | 17 | 4382 | 0 | 0/10 | 0 | — |
| ✅ | `sveltekit-frontend/scripts/backup-consolidation/tests` | 90 | 4 | 999 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/scripts/comfyui` | 90 | 3 | 282 | 0 | 0/1 | 0 | — |
| ✅ | `sveltekit-frontend/scripts/comfyui/workflows` | 90 | 1 | 42 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/scripts/dev` | 90 | 1 | 140 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/scripts/diff` | 90 | 3 | 721 | 0 | 0/2 | 0 | — |
| ✅ | `sveltekit-frontend/scripts/features` | 90 | 2 | 172 | 0 | 0/1 | 0 | — |
| ✅ | `sveltekit-frontend/scripts/health` | 90 | 1 | 237 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/scripts/llms` | 90 | 5 | 1472 | 0 | 0/3 | 0 | — |
| ✅ | `sveltekit-frontend/scripts/operator` | 90 | 1 | 169 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/scripts/qdrant` | 90 | 1 | 179 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/scripts/reconstruction` | 90 | 4 | 439 | 0 | 0/1 | 0 | — |
| ✅ | `sveltekit-frontend/scripts/rg-atlas` | 90 | 2 | 162 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/scripts/skills` | 90 | 1 | 510 | 0 | 0/1 | 0 | — |
| ✅ | `sveltekit-frontend/scripts/synth` | 90 | 3 | 929 | 0 | 0/2 | 0 | — |
| ✅ | `sveltekit-frontend/scripts/tests/nes-arch` | 90 | 2 | 191 | 0 | 0/1 | 0 | — |
| ✅ | `sveltekit-frontend/scripts/tests/probes` | 90 | 3 | 88 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/scripts/tests/screenshots` | 90 | 1 | 1 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/scripts/tools` | 90 | 2 | 126 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/scripts/turboquant` | 90 | 3 | 570 | 0 | 0/2 | 0 | — |
| ✅ | `sveltekit-frontend/scripts/wiki` | 90 | 11 | 2964 | 0 | 0/6 | 0 | — |
| ✅ | `sveltekit-frontend/scripts/__fixtures__` | 90 | 1 | 28 | 0 | 0/1 | 0 | — |
| ✅ | `sveltekit-frontend/src/lib/cache` | 90 | 5 | 1046 | 0 | 0/1 | 0 | — |
| ✅ | `sveltekit-frontend/src/lib/client` | 90 | 10 | 1041 | 0 | 0/4 | 0 | — |
| ✅ | `sveltekit-frontend/src/lib/collaboration` | 90 | 1 | 267 | 0 | 0/1 | 0 | — |
| ✅ | `sveltekit-frontend/src/lib/config` | 90 | 8 | 1506 | 0 | 1/1 | 0 | — |
| ✅ | `sveltekit-frontend/src/lib/courtroom` | 90 | 4 | 1561 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/src/lib/env` | 90 | 2 | 27 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/src/lib/features` | 90 | 6 | 546 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/src/lib/gpu` | 90 | 17 | 4876 | 0 | 0/2 | 0 | — |
| ✅ | `sveltekit-frontend/src/lib/graph` | 90 | 1 | 54 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/src/lib/icons` | 90 | 15 | 572 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/src/lib/machines` | 90 | 11 | 4093 | 0 | 0/1 | 0 | — |
| ✅ | `sveltekit-frontend/src/lib/messaging` | 90 | 1 | 168 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/src/lib/models` | 90 | 1 | 1390 | 0 | 0/1 | 0 | — |
| ✅ | `sveltekit-frontend/src/lib/phase72` | 90 | 1 | 148 | 0 | 0/1 | 0 | — |
| ✅ | `sveltekit-frontend/src/lib/schemas` | 90 | 13 | 1050 | 0 | 0/5 | 0 | — |
| ✅ | `sveltekit-frontend/src/lib/services` | 90 | 5 | 704 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/src/lib/shared` | 90 | 5 | 284 | 0 | 0/1 | 0 | — |
| ✅ | `sveltekit-frontend/src/lib/stores` | 90 | 27 | 5109 | 0 | 0/6 | 0 | — |
| ✅ | `sveltekit-frontend/src/lib/test-utils` | 90 | 1 | 11 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/src/lib/webgpu` | 90 | 20 | 5786 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/src/mcp/tools` | 90 | 8 | 2321 | 0 | 0/7 | 0 | — |
| ✅ | `sveltekit-frontend/src/mcp/zod-to-json-schema-bridge` | 90 | 2 | 94 | 0 | 0/1 | 0 | — |
| ✅ | `sveltekit-frontend/src/routes/(admin)` | 90 | 3 | 634 | 0 | 3/0 | 0 | — |
| ✅ | `sveltekit-frontend/src/routes/(analysis)` | 90 | 8 | 2992 | 0 | 4/0 | 0 | ⬜notest |
| ✅ | `sveltekit-frontend/src/routes/(analysis)@` | 90 | 8 | 2719 | 0 | 4/0 | 0 | ⬜notest |
| ✅ | `sveltekit-frontend/src/routes/(dev)` | 90 | 13 | 2336 | 0 | 1/1 | 0 | ⬜notest |
| ✅ | `sveltekit-frontend/src/routes/debug` | 90 | 1 | 198 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/src/shims` | 90 | 1 | 1 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/src/stores` | 90 | 1 | 47 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/src/tests` | 90 | 1 | 10 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/src/wasm` | 90 | 2 | 524 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/src/workers` | 90 | 3 | 282 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/static/dev-graphs/validation` | 90 | 1 | 36 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/static/embeddinggemma_300m_onnx` | 90 | 5 | 2431089 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/static/examples/embed-worker` | 90 | 2 | 30 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/static/gemma3_270m_onnx` | 90 | 5 | 2431005 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/static/models` | 90 | 1 | 2431582 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/static/models/embeddinggemma_300m_onnx` | 90 | 5 | 2431089 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/static/ort` | 90 | 3 | 353 | 0 | 0/2 | 0 | — |
| ✅ | `sveltekit-frontend/static/phase72` | 90 | 1 | 17044 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/static/wasm` | 90 | 8 | 1123 | 0 | 0/1 | 0 | — |
| ✅ | `sveltekit-frontend/test-results` | 90 | 2 | 875 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/tests/accessibility` | 90 | 2 | 557 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/tests/e2e` | 90 | 29 | 8978 | 0 | 10/3 | 0 | — |
| ✅ | `sveltekit-frontend/tests/e2e/route-forensic` | 90 | 35 | 1750 | 0 | 4/0 | 0 | — |
| ✅ | `sveltekit-frontend/tests/e2e/utils` | 90 | 3 | 505 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/tests/fixtures` | 90 | 2 | 90 | 0 | 1/0 | 0 | — |
| ✅ | `sveltekit-frontend/tests/intent` | 90 | 2 | 472 | 0 | 0/1 | 0 | — |
| ✅ | `sveltekit-frontend/tests/mapreduce` | 90 | 1 | 217 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/tests/reports` | 90 | 2 | 64 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/tests/routes/api` | 90 | 1 | 126 | 0 | 1/0 | 0 | — |
| ✅ | `sveltekit-frontend/tests/runes` | 90 | 1 | 230 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/tests/setup` | 90 | 1 | 226 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/tests/sw` | 90 | 1 | 97 | 0 | 0/1 | 0 | — |
| ✅ | `sveltekit-frontend/tests/utils` | 90 | 1 | 134 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/tmp` | 90 | 7 | 161594 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/tmp/hypergraph` | 90 | 1 | 77108 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/uploads/audio` | 90 | 1 | 1 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/uploads/transcriptions` | 90 | 2 | 1388 | 0 | 0/0 | 0 | — |
| ✅ | `turbovec/benchmarks/results` | 90 | 46 | 656 | 0 | 0/0 | 0 | — |
| ✅ | `turbovec/target` | 90 | 2 | 310 | 0 | 0/0 | 0 | — |
| ✅ | `turbovec/target/release/.fingerprint` | 90 | 308 | 308 | 0 | 0/0 | 0 | — |
| ✅ | `vscode-extension/media` | 90 | 1 | 391 | 0 | 0/0 | 0 | — |
| ✅ | `vscode-extension/workers` | 90 | 1 | 51 | 0 | 0/1 | 0 | — |
| ✅ | `deeds_labs/archived-corrupted-phase99` | 93 | 4 | 441 | 0 | 0/1 | 2 | — |
| ✅ | `deeds_labs/dead_code` | 93 | 1 | 7500 | 0 | 1/10 | 2 | — |
| ✅ | `deeds_labs/routes-parked-full/(ai)_disabled/ai-rag` | 93 | 2 | 64 | 0 | 1/0 | 1 | — |
| ✅ | `deeds_labs/routes-parked-full/auth` | 93 | 2 | 1635 | 2 | 2/2 | 2 | — |
| ✅ | `deeds_labs/routes-parked-full/interactive-canvas` | 93 | 2 | 124 | 0 | 1/0 | 1 | — |
| ✅ | `deeds_labs/routes-reference/interactive-canvas` | 93 | 2 | 124 | 0 | 1/0 | 1 | — |
| ✅ | `deeds_labs/services/ts-consolidation-archive/stubs-orphans-2026-03-09` | 93 | 9 | 587 | 0 | 0/0 | 1 | — |
| ✅ | `deeds_labs/dead-configs` | 95 | 14 | 273 | 0 | 0/0 | 0 | 🟠lh |
| ✅ | `deeds_labs/dead-scripts/root-scripts` | 95 | 73 | 7536 | 0 | 0/6 | 0 | 🟠lh |
| ✅ | `deeds_labs/frontend/features-archive/ai` | 95 | 9 | 2137 | 0 | 0/5 | 0 | 🟠lh |
| ✅ | `deeds_labs/frontend/svelte4-archive/lib-archives` | 95 | 27 | 2667 | 0 | 0/7 | 0 | 🟠lh |
| ✅ | `deeds_labs/lib-archive/corrupted-files-feb-8-2026` | 95 | 13 | 3868 | 0 | 0/3 | 0 | 🟠lh |
| ✅ | `deeds_labs/projects/evidence-service` | 95 | 4 | 8665 | 0 | 1/8 | 0 | 🟠lh |
| ✅ | `deeds_labs/projects/evidence-service/src` | 95 | 29 | 2804 | 0 | 1/8 | 0 | 🟠lh |
| ✅ | `deeds_labs/projects/legacy-projects/jstests` | 95 | 4 | 1324 | 0 | 0/0 | 0 | 🟠lh |
| ✅ | `deeds_labs/services/ts-consolidation-archive/embedding-duplicates-2026-03-09` | 95 | 3 | 475 | 0 | 0/0 | 0 | 🟠lh |
| ✅ | `deeds_labs/snapshots/2026-03-15-v1/services-dead` | 95 | 3 | 382 | 0 | 0/0 | 0 | 🟠lh |
| ✅ | `scripts/docs-atlas` | 95 | 24 | 3754 | 0 | 0/10 | 0 | 🟠lh |
| ✅ | `sveltekit-frontend/scratch` | 95 | 44 | 7020 | 0 | 0/2 | 0 | 🟠lh |
| ✅ | `sveltekit-frontend/scripts/atlas` | 95 | 45 | 7416 | 0 | 1/32 | 0 | 🟠lh |
| ✅ | `sveltekit-frontend/scripts/graph` | 95 | 10 | 2619 | 0 | 1/7 | 0 | 🟠lh |
| ✅ | `sveltekit-frontend/scripts/smoke` | 95 | 19 | 2977 | 0 | 0/9 | 0 | 🟠lh |
| ✅ | `sveltekit-frontend/scripts/startup` | 95 | 2 | 502 | 0 | 0/1 | 0 | 🟠lh |
| ✅ | `sveltekit-frontend/scripts/tests` | 95 | 60 | 13337 | 0 | 4/19 | 0 | 🟠lh |
| ✅ | `sveltekit-frontend/src/mcp` | 95 | 15 | 15174 | 0 | 1/20 | 0 | 🟠lh |
| ✅ | `.claude/hooks` | 100 | 2 | 164 | 0 | 0/2 | 0 | — |
| ✅ | `deeds_labs/archived-dead-code` | 100 | 17 | 34057 | 1 | 5/12 | 5 | 🟠lh |
| ✅ | `deeds_labs/archived-dead-code/auth` | 100 | 6 | 411 | 0 | 2/0 | 0 | — |
| ✅ | `deeds_labs/archived-dead-code/db` | 100 | 3 | 260 | 0 | 0/0 | 0 | — |
| ✅ | `deeds_labs/archived-dead-code/dead-lib-dirs/phase78` | 100 | 1 | 48 | 0 | 0/0 | 0 | — |
| ✅ | `deeds_labs/archived-dead-code/dev-routes/verify-drizzle` | 100 | 2 | 35 | 0 | 0/0 | 0 | — |
| ✅ | `deeds_labs/archived-dead-code/sprint2-2026-03-15` | 100 | 7 | 652 | 0 | 1/0 | 0 | — |
| ✅ | `deeds_labs/db-schema-archive` | 100 | 19 | 1307 | 0 | 0/0 | 0 | — |
| ✅ | `deeds_labs/dead-orphans-2026-04-06` | 100 | 5 | 1234 | 0 | 0/1 | 0 | — |
| ✅ | `deeds_labs/dead-scripts` | 100 | 26 | 184062 | 10 | 11/219 | 48 | 🟠lh |
| ✅ | `deeds_labs/dead-scripts/phase-scripts` | 100 | 724 | 167588 | 9 | 9/199 | 47 | 🟠lh |
| ✅ | `deeds_labs/dead-scripts/syntax-repair` | 100 | 6 | 5813 | 0 | 0/0 | 0 | — |
| ✅ | `deeds_labs/dead-scripts/syntax-repair/patterns` | 100 | 9 | 3368 | 0 | 0/0 | 0 | — |
| ✅ | `deeds_labs/dead-scripts/utils-mjs` | 100 | 92 | 101 | 1 | 2/13 | 1 | — |
| ✅ | `deeds_labs/dead-server-files` | 100 | 6 | 978 | 0 | 0/1 | 0 | — |
| ✅ | `deeds_labs/dead_code/dead-chains` | 100 | 4 | 2820 | 0 | 0/4 | 0 | — |
| ✅ | `deeds_labs/dead_code/dead-chains/workflows` | 100 | 5 | 1281 | 0 | 0/1 | 0 | — |
| ✅ | `deeds_labs/dead_code/duplicate-embedding-auth` | 100 | 13 | 1130 | 0 | 0/1 | 0 | — |
| ✅ | `deeds_labs/frontend/svelte4-archive/server` | 100 | 5 | 988 | 0 | 0/2 | 0 | — |
| ✅ | `deeds_labs/lib-dead-directories/batch-2026-03-16/performance` | 100 | 1 | 138 | 0 | 0/1 | 0 | — |
| ✅ | `deeds_labs/lib-dead-directories/performance` | 100 | 1 | 34 | 0 | 0/2 | 0 | — |
| ✅ | `deeds_labs/lib-dead-directories/performance/performance` | 100 | 1 | 17 | 0 | 0/1 | 0 | — |
| ✅ | `deeds_labs/projects/agentic-error-resolution/fixed` | 100 | 243 | 102256 | 1 | 0/28 | 23 | 🟡sv4 🟠lh |
| ✅ | `deeds_labs/routes-parked-full/(auth)_disabled` | 100 | 2 | 936 | 0 | 1/0 | 0 | — |
| ✅ | `deeds_labs/routes-parked-full/(auth)_disabled/profile` | 100 | 2 | 557 | 0 | 1/0 | 0 | — |
| ✅ | `deeds_labs/routes-parked-full/auth/login` | 100 | 5 | 382 | 1 | 1/1 | 0 | — |
| ✅ | `deeds_labs/routes-parked-full/auth/register` | 100 | 2 | 232 | 0 | 1/0 | 0 | — |
| ✅ | `deeds_labs/routes-parked-full/laws` | 100 | 5 | 525 | 0 | 0/0 | 0 | — |
| ✅ | `deeds_labs/routes-parked-full/legal-ai` | 100 | 1 | 146 | 0 | 0/0 | 0 | — |
| ✅ | `deeds_labs/routes-parked-full/login` | 100 | 2 | 219 | 0 | 0/1 | 0 | — |
| ✅ | `deeds_labs/routes-parked-full/saved-citations` | 100 | 2 | 33 | 0 | 1/1 | 0 | — |
| ✅ | `deeds_labs/routes-parked-full/system-dashboard` | 100 | 2 | 51 | 0 | 1/0 | 0 | — |
| ✅ | `deeds_labs/services/development-tools/syntax-repair` | 100 | 17 | 5939 | 0 | 0/0 | 0 | — |
| ✅ | `deeds_labs/services/ts-consolidation-archive` | 100 | 50 | 66316 | 3 | 6/69 | 47 | 🟡sv4 🟠lh |
| ✅ | `deeds_labs/services/ts-consolidation-archive/dead-types-2026-03-09` | 100 | 6 | 1223 | 0 | 0/0 | 0 | — |
| ✅ | `deeds_labs/services/ts-consolidation-archive/superseded-2026-03-09` | 100 | 98 | 21986 | 1 | 1/25 | 9 | 🟠lh |
| ✅ | `deeds_labs/snapshots/2026-03-15-root/node-scripts` | 100 | 80 | 11619 | 1 | 3/8 | 1 | 🟠lh |
| ✅ | `scripts/atlas` | 100 | 146 | 35530 | 4 | 0/68 | 2 | 🟠lh |
| ✅ | `scripts/atlas/lib` | 100 | 22 | 3328 | 2 | 0/8 | 0 | 🟠lh |
| ✅ | `scripts/db-tests` | 100 | 12 | 560 | 0 | 0/0 | 0 | — |
| ✅ | `scripts/tests` | 100 | 124 | 85718 | 2 | 4/14 | 0 | 🟠lh |
| ✅ | `sveltekit-frontend/drizzle/schema` | 100 | 1 | 311 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/scripts` | 100 | 318 | 170004 | 16 | 26/324 | 36 | 🟠lh |
| ✅ | `sveltekit-frontend/scripts/kb` | 100 | 15 | 3482 | 0 | 1/9 | 0 | — |
| ✅ | `sveltekit-frontend/scripts/lib` | 100 | 11 | 1664 | 1 | 0/4 | 0 | 🟠lh |
| ✅ | `sveltekit-frontend/scripts/mapreduce` | 100 | 2 | 549 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/scripts/phase104-backups/src` | 100 | 403 | 44852 | 13 | 10/97 | 36 | 🟠lh |
| ✅ | `sveltekit-frontend/scripts/screenshots` | 100 | 3 | 695 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/scripts/validate` | 100 | 2 | 1518 | 0 | 1/1 | 0 | — |
| ✅ | `sveltekit-frontend/src` | 100 | 17 | 697466 | 702 | 1178/927 | 11 | 🟠lh ⬜notest |
| ✅ | `sveltekit-frontend/src/lib` | 100 | 11 | 437564 | 3 | 13/319 | 9 | 🟠lh |
| ✅ | `sveltekit-frontend/src/lib/data` | 100 | 5 | 1687 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/src/lib/db` | 100 | 12 | 2897 | 0 | 0/1 | 0 | — |
| ✅ | `sveltekit-frontend/src/lib/intent` | 100 | 1 | 137 | 0 | 0/0 | 0 | — |
| ✅ | `sveltekit-frontend/src/lib/server` | 100 | 907 | 211982 | 3 | 10/230 | 0 | — |
| ✅ | `sveltekit-frontend/src/lib/shims` | 100 | 11 | 1238 | 0 | 0/1 | 0 | — |
| ✅ | `sveltekit-frontend/src/lib/types` | 100 | 54 | 7224 | 0 | 0/5 | 0 | — |
| ✅ | `sveltekit-frontend/src/routes` | 100 | 6 | 238407 | 699 | 1163/584 | 2 | 🟠lh ⬜notest |
| ✅ | `sveltekit-frontend/src/routes/(app)` | 100 | 464 | 118857 | 7 | 464/48 | 1 | 🟠lh ⬜notest |
| ✅ | `sveltekit-frontend/src/routes/admin` | 100 | 4 | 2649 | 0 | 2/2 | 0 | ⬜notest |
| ✅ | `sveltekit-frontend/src/routes/login` | 100 | 3 | 502 | 0 | 1/3 | 0 | — |
| ✅ | `sveltekit-frontend/src/routes/register` | 100 | 3 | 627 | 0 | 1/2 | 0 | — |
| ✅ | `sveltekit-frontend/src/types` | 100 | 23 | 882 | 0 | 0/1 | 0 | — |
| ✅ | `sveltekit-frontend/tests` | 100 | 222 | 129714 | 4 | 683/51 | 0 | 🟠lh |
| ✅ | `sveltekit-frontend/tests/routes` | 100 | 31 | 55437 | 2 | 651/9 | 0 | — |
| ✅ | `sveltekit-frontend/tests/routes/auto` | 100 | 649 | 45375 | 0 | 644/0 | 0 | — |
| ✅ | `sveltekit-frontend/tests/unit` | 100 | 13 | 1939 | 0 | 0/3 | 0 | — |

---

## API Routes (699 total · top 60)

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
| `sveltekit-frontend/api/admin/atlas/cache/+server.ts` | GET, DELETE | ✅ | ✅ | ✅ |
| `sveltekit-frontend/api/admin/model/validate-checkpoint/+server.ts` | POST, GET | ✅ | ✅ | ✅ |
| `sveltekit-frontend/api/admin/observability/+server.ts` | GET, POST | ✅ | ✅ | ✅ |
| `sveltekit-frontend/api/admin/qlora/+server.ts` | GET, POST | ✅ | ✅ | ✅ |
| `sveltekit-frontend/api/admin/seed-knowledge/+server.ts` | POST, GET | ✅ | ✅ | ✅ |
| `sveltekit-frontend/api/admin/weights/+server.ts` | GET, POST | ✅ | ✅ | ✅ |
| `sveltekit-frontend/api/agent/investigate/+server.ts` | POST, GET | ✅ | ✅ | ✅ |
| `sveltekit-frontend/api/analytics/context-timeline/+server.ts` | GET, POST | ✅ | ✅ | ✅ |
| `sveltekit-frontend/api/analytics/events/+server.ts` | POST, GET | ✅ | ✅ | ✅ |
| `sveltekit-frontend/api/analytics/qlora-dataset/+server.ts` | POST, GET | ✅ | ✅ | ✅ |
| `sveltekit-frontend/api/analytics/research-graph/+server.ts` | GET, POST | ✅ | ✅ | ✅ |
| `sveltekit-frontend/api/analytics/research-index/+server.ts` | GET, POST | ✅ | ✅ | ✅ |
| `sveltekit-frontend/api/analytics/research-summaries/+server.ts` | GET, POST | ✅ | ✅ | ✅ |
| `sveltekit-frontend/api/analytics/research-summaries/[id]/+server.ts [id]` | GET, DELETE | ✅ | ❌ | ✅ |
| `sveltekit-frontend/api/analytics/research-topics/+server.ts` | GET, POST | ✅ | ✅ | ✅ |
| `sveltekit-frontend/api/analytics/web-research/+server.ts` | GET, POST | ✅ | ✅ | ✅ |
| `sveltekit-frontend/api/audit/gpu/+server.ts` | POST, GET | ✅ | ✅ | ✅ |

_…and 639 more. See `codebase-graph.json` for full list._

---

## G4 — API Routes Missing Auth Guard (11)
- `sveltekit-frontend/src/routes/.well-known/agent.json/+server.ts` · GET
- `sveltekit-frontend/src/routes/.well-known/appspecific/com.chrome.devtools.json/+server.ts` · GET
- `sveltekit-frontend/src/routes/.well-known/llms-full.txt/+server.ts` · GET
- `sveltekit-frontend/src/routes/.well-known/llms.txt/+server.ts` · GET
- `sveltekit-frontend/src/routes/api/admin/parents-atlas/actions/+server.ts` · POST
- `sveltekit-frontend/src/routes/api/auth/login/+server.ts` · POST
- `sveltekit-frontend/src/routes/api/auth/logout/+server.ts` · POST/GET
- `sveltekit-frontend/src/routes/api/auth/register/+server.ts` · POST
- `sveltekit-frontend/src/routes/api/auth/reset-password/+server.ts` · POST
- `sveltekit-frontend/src/routes/api/auth/session/+server.ts` · GET
- `sveltekit-frontend/src/routes/api/v1/query/+server.ts` · POST

---

## G5 — API Routes Missing Zod Validation (1)
- `sveltekit-frontend/src/routes/api/vlm/switch-mode/+server.ts` · POST

---

## G14 — Svelte 4 Legacy Patterns (119 files)
- `.svelte-error-fixes-backup/sveltekit-frontend/src/lib/components/AdvancedRichTextEditor.svelte` · export-let, on:event
- `.svelte-error-fixes-backup/sveltekit-frontend/src/lib/components/agentic/AgenticController.svelte` · on:event
- `.svelte-error-fixes-backup/sveltekit-frontend/src/lib/components/ai/AIAssistantPanel.svelte` · on:event
- `.svelte-error-fixes-backup/sveltekit-frontend/src/lib/components/ai/AIChatInput.svelte` · export-let, $:reactive, on:event
- `.svelte-error-fixes-backup/sveltekit-frontend/src/lib/components/ai/AIChatInterface.svelte` · on:event
- `.svelte-error-fixes-backup/sveltekit-frontend/src/lib/components/ai/DocumentUploadSimulator.svelte` · on:event
- `.svelte-error-fixes-backup/sveltekit-frontend/src/lib/components/ai/EnhancedAIAssistant.simple.svelte` · export-let
- `.svelte-error-fixes-backup/sveltekit-frontend/src/lib/components/ai/EnhancedDocumentUploader.svelte` · export-let, on:event
- `.svelte-error-fixes-backup/sveltekit-frontend/src/lib/components/ai/EnhancedMCPIntegration.svelte` · export-let
- `.svelte-error-fixes-backup/sveltekit-frontend/src/lib/components/ai/EvidenceCanvas.svelte` · export-let
- `.svelte-error-fixes-backup/sveltekit-frontend/src/lib/components/ai/GamingAIInterface.svelte` · on:event
- `.svelte-error-fixes-backup/sveltekit-frontend/src/lib/components/ai/LegalDocumentDrafting.svelte` · on:event
- `.svelte-error-fixes-backup/sveltekit-frontend/src/lib/components/ai/LocalImageGenerator.svelte` · on:event
- `.svelte-error-fixes-backup/sveltekit-frontend/src/lib/components/ai/NeuralTopology3DDemo.svelte` · on:event
- `.svelte-error-fixes-backup/sveltekit-frontend/src/lib/components/ai/ProactivePrompt.svelte` · $:reactive
- `.svelte-error-fixes-backup/sveltekit-frontend/src/lib/components/ai/XStatePhase8Integration.svelte` · export-let
- `.svelte-error-fixes-backup/sveltekit-frontend/src/lib/components/AIAssistant.svelte` · on:event
- `.svelte-error-fixes-backup/sveltekit-frontend/src/lib/components/canvas/POINode.svelte` · on:event, dispatcher
- `.svelte-error-fixes-backup/sveltekit-frontend/src/lib/components/cases/CaseStats.svelte` · $:reactive
- `.svelte-error-fixes-backup/sveltekit-frontend/src/lib/components/citations/CitationsSaveButton.svelte` · export-let

---

## G15 — SSR-Unsafe Globals (0 files · unguarded window/document/localStorage)
_No unguarded SSR-unsafe globals. ✅_

---

## G16 — Routes Without Test Pairing (65)
- `sveltekit-frontend/src/routes/(app)/admin/atlas/couchdb-rollback/+server.ts` · POST
- `sveltekit-frontend/src/routes/(app)/admin/atlas/couchdb-status/+server.ts` · GET
- `sveltekit-frontend/src/routes/(app)/admin/atlas/turbovec-prefilter/+server.ts` · POST
- `sveltekit-frontend/src/routes/api/admin/ai-chat/[sessionId]/+server.ts` · GET
- `sveltekit-frontend/src/routes/api/admin/atlas/hyperrag/+server.ts` · POST
- `sveltekit-frontend/src/routes/api/admin/atlas/node/[id]/+server.ts` · GET
- `sveltekit-frontend/src/routes/api/admin/atlas/query/+server.ts` · POST
- `sveltekit-frontend/src/routes/api/admin/parents-atlas/actions/+server.ts` · POST
- `sveltekit-frontend/src/routes/api/ai/analyze/[scope]/+server.ts` · POST
- `sveltekit-frontend/src/routes/api/ai/generate-report/[scope]/+server.ts` · POST
- `sveltekit-frontend/src/routes/api/analytics/knowledge-triples/+server.ts` · GET
- `sveltekit-frontend/src/routes/api/analytics/knowledge-triples/prune/+server.ts` · POST
- `sveltekit-frontend/src/routes/api/analytics/research-summaries/[id]/+server.ts` · GET/DELETE
- `sveltekit-frontend/src/routes/api/audio/analysis/[evidenceId]/+server.ts` · GET
- `sveltekit-frontend/src/routes/api/audio/progress/[evidenceId]/+server.ts` · GET
- `sveltekit-frontend/src/routes/api/canon/chunks/[chunkId]/+server.ts` · GET
- `sveltekit-frontend/src/routes/api/cases/[id]/+server.ts` · GET/PATCH/DELETE
- `sveltekit-frontend/src/routes/api/cases/[id]/notes/[noteId]/+server.ts` · GET/PATCH/DELETE
- `sveltekit-frontend/src/routes/api/citations/collections/[collectionId]/+server.ts` · GET/DELETE/PATCH
- `sveltekit-frontend/src/routes/api/code-intel/clusters/[clusterKey]/+server.ts` · GET
- `sveltekit-frontend/src/routes/api/code-intel/research-provenance/[id]/+server.ts` · GET
- `sveltekit-frontend/src/routes/api/code-intel/retrieval-runs/[id]/+server.ts` · GET
- `sveltekit-frontend/src/routes/api/code-intel/topology/node/[stableKey]/+server.ts` · GET
- `sveltekit-frontend/src/routes/api/codeintel/chunks/[chunkId]/+server.ts` · GET
- `sveltekit-frontend/src/routes/api/codeintel/clusters/[id]/+server.ts` · GET/POST
- `sveltekit-frontend/src/routes/api/codeintel/jobs/[jobId]/+server.ts` · GET
- `sveltekit-frontend/src/routes/api/conversations/[id]/+server.ts` · PUT/DELETE
- `sveltekit-frontend/src/routes/api/document/analysis/[evidenceId]/+server.ts` · GET
- `sveltekit-frontend/src/routes/api/document/[docId]/+server.ts` · GET
- `sveltekit-frontend/src/routes/api/documents/[id]/+server.ts` · GET/PUT

---

## G11 — Hardcoded Localhost References (1427 files)
- `.svelte-error-fixes-backup/sveltekit-frontend/src/lib/components/ai/AIChatInterface.svelte` · http://localhost:11434, http://localhost:8000
- `.svelte-error-fixes-backup/sveltekit-frontend/src/lib/components/ai/DocumentUploadSimulator.svelte` · http://localhost:8081, http://localhost:11434
- `.svelte-error-fixes-backup/sveltekit-frontend/src/lib/components/ai/Enhanced3DLegalAIInterface.svelte` · http://localhost:8000
- `.svelte-error-fixes-backup/sveltekit-frontend/src/lib/components/ai/EnhancedAIChatTest.svelte` · http://localhost:11434, http://localhost:11434
- `.svelte-error-fixes-backup/sveltekit-frontend/src/lib/components/ai/EnhancedLegalAIChatWithSynthesis.svelte` · http://localhost:11434, http://localhost:11434
- `.svelte-error-fixes-backup/sveltekit-frontend/src/lib/components/ai/LLMProviderSelector.svelte` · http://localhost:11434, http://localhost:8000
- `.svelte-error-fixes-backup/sveltekit-frontend/src/lib/components/ai/MultiLLMOrchestrator.svelte` · http://localhost:11434, http://localhost:8001
- `.svelte-error-fixes-backup/sveltekit-frontend/src/lib/components/ai/ollama-agent-shell.svelte` · http://localhost:11434, http://localhost:8081
- `.svelte-error-fixes-backup/sveltekit-frontend/src/lib/components/ai/rag/EnhancedRAGInterface.svelte` · http://localhost:11434
- `.svelte-error-fixes-backup/sveltekit-frontend/src/lib/components/ai/RecommendationEngine.svelte` · http://localhost:8095, http://localhost:8095
- `.svelte-error-fixes-backup/sveltekit-frontend/src/lib/components/ai/UnifiedAIAssistant.svelte` · http://localhost:8000, http://localhost:11434
- `.svelte-error-fixes-backup/sveltekit-frontend/src/lib/components/AIAssistant.svelte` · http://localhost:11434
- `.svelte-error-fixes-backup/sveltekit-frontend/src/lib/components/AIAssistantButton.svelte` · http://localhost:11434
- `.svelte-error-fixes-backup/sveltekit-frontend/src/lib/components/detective/ContextualDetectiveBoard.svelte` · http://localhost:3002
- `.svelte-error-fixes-backup/sveltekit-frontend/src/lib/components/EnhancedChat.svelte` · http://localhost:11434
- `.svelte-error-fixes-backup/sveltekit-frontend/src/lib/components/evidence/CaseEvidenceOrganizer.svelte` · http://localhost:3002, http://localhost:3002
- `.svelte-error-fixes-backup/sveltekit-frontend/src/lib/components/LegalAIChat.svelte` · http://localhost:11434
- `.svelte-error-fixes-backup/sveltekit-frontend/src/lib/components/navigation/DemoNavigation.svelte` · http://localhost:8081, http://localhost:8081
- `.svelte-error-fixes-backup/sveltekit-frontend/src/lib/components/redis/AdvancedRedisMonitoringDashboard.svelte` · http://localhost:3002, http://localhost:3002
- `.svelte-error-fixes-backup/sveltekit-frontend/src/lib/components/SearchBox.svelte` · http://localhost:8096

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
| `sveltekit-frontend/api/routes/[routeId]/error-brain-patch/[patchId]/+server.ts` | 8 | `[routeId] [patchId]` | PUT |
| `sveltekit-frontend/(app)/admin/codebase-index/[fileId]/+page.server.ts` | 7 | `[fileId]` |  |

---

## G19 — Top Module Fan-In (most imported `$lib` paths)
| Module | Import Count |
|--------|-------------|
| `$lib/types` | 4202 |
| `$lib/types/enhanced-svelte5-types` | 1924 |
| `$lib/server/db/client` | 682 |
| `$lib/server/db` | 630 |
| `$lib/server/env.server.js` | 513 |
| `$lib/components/ui/Button.svelte` | 443 |
| `$lib/server/db/schema-postgres` | 419 |
| `$lib/server/redis.js` | 319 |
| `$lib/components/ui/Icon.svelte` | 282 |
| `$lib/server/db/schema` | 275 |
| `$lib/middleware/redis-orchestrator-middleware` | 267 |
| `$lib/server/redis` | 202 |
| `$lib/server/ollama.js` | 187 |
| `$lib/server/db/schema-postgres.js` | 180 |
| `$lib/server/redis-client` | 175 |
| `$lib/stores/unified` | 158 |
| `$lib/server/db/index` | 135 |
| `$lib/components/ui/enhanced-bits` | 129 |
| `$lib/server/db/drizzle` | 128 |
| `$lib/server/cache/redis` | 120 |

---

## G20 — Cyclic Import Pairs (1 found · top 20)
- `deeds_labs/services/python-middleware/backend/pipeline/code_ingestion_pipeline.ts` ↔ `deeds_labs/services/python-middleware/backend/watchers/code_ingest_watcher.ts`

---

## Svelte Components (60 shown of 5339)
| File | Sub-components | Key `$lib` Imports |
|------|---------------|---------------------|
| `.svelte-error-fixes-backup/sveltekit-frontend/src/lib/components/AdvancedRichTextEditor.svelte` |  |  |
| `.svelte-error-fixes-backup/sveltekit-frontend/src/lib/components/agentic/AgenticController.svelte` |  |  |
| `.svelte-error-fixes-backup/sveltekit-frontend/src/lib/components/ai/AgentOrchestrator.svelte` | AutoGenConversation, CrewExecution, Badge, Brain | $lib/components/ErrorBoundary.svelte, $lib/components/ui/enhanced-bits, $lib/components/ui/enhanced-bits |
| `.svelte-error-fixes-backup/sveltekit-frontend/src/lib/components/ai/AIAssistantButton.svelte` | Brain, Badge, MicOff, Mic | $lib/utils, $lib/components/ui/badge/Badge.svelte |
| `.svelte-error-fixes-backup/sveltekit-frontend/src/lib/components/ai/AIAssistantPanel.svelte` | Card, CardHeader, CardTitle, Bot | $lib/components/ui/Button.svelte, $lib/components/ui/card/Card.svelte, $lib/components/ui/card/CardContent.svelte |
| `.svelte-error-fixes-backup/sveltekit-frontend/src/lib/components/ai/AIButton.svelte` | HTMLButtonElement |  |
| `.svelte-error-fixes-backup/sveltekit-frontend/src/lib/components/ai/AIChatInput.svelte` |  | $lib/utils/debounce |
| `.svelte-error-fixes-backup/sveltekit-frontend/src/lib/components/ai/AIChatInterface.svelte` | ChatSettings, HTMLDivElement, HTMLTextAreaElement | $lib/components/ErrorBoundary.svelte, $lib/utils/debounce |
| `.svelte-error-fixes-backup/sveltekit-frontend/src/lib/components/ai/AIChatMessage.svelte` |  | $lib/components/ErrorBoundary.svelte |
| `.svelte-error-fixes-backup/sveltekit-frontend/src/lib/components/ai/AIProcessingDashboard.svelte` | Badge, LLMProviderSelector, Progress, Button | $lib/services/aiServiceWorkerManager, $lib/types/llm |
| `.svelte-error-fixes-backup/sveltekit-frontend/src/lib/components/ai/AIServiceStatus.svelte` | ServiceStatus, Date, RefreshCw, CheckCircle | $lib/services/ai-pipeline-client |
| `.svelte-error-fixes-backup/sveltekit-frontend/src/lib/components/ai/AIStatusIndicator.svelte` |  |  |
| `.svelte-error-fixes-backup/sveltekit-frontend/src/lib/components/ai/AskAI.svelte` | AudioContext, ConversationMessage, Brain, MessageCircle | $lib/components/ErrorBoundary.svelte, $lib/utils/debounce, $lib/services/coquiTTS |
| `.svelte-error-fixes-backup/sveltekit-frontend/src/lib/components/ai/CachePerformanceDashboard.svelte` | RefreshCw, Target, Database, TrendingUp |  |
| `.svelte-error-fixes-backup/sveltekit-frontend/src/lib/components/ai/CaseScoringDashboard.svelte` | CaseScore |  |
| `.svelte-error-fixes-backup/sveltekit-frontend/src/lib/components/ai/ChatInterface.svelte` | ThinkingStyleToggle, Button, Bot, ChatMessage | $lib/components/ui/enhanced-bits, $lib/components/ui/textarea/index, $lib/stores/unified |
| `.svelte-error-fixes-backup/sveltekit-frontend/src/lib/components/ai/ChatMessage.svelte` | UserIcon, Bot, Clock, ToneIcon | $lib/components/ui/enhanced-bits, $lib/stores/unified |
| `.svelte-error-fixes-backup/sveltekit-frontend/src/lib/components/ai/ClientSideAIChat.svelte` | Brain, Badge, Zap, Cpu | $lib/adapters/webasm-ai-adapter, $lib/components/ui/enhanced-bits, $lib/components/ui/badge |
| `.svelte-error-fixes-backup/sveltekit-frontend/src/lib/components/ai/cognitive/NeuralPerformanceDashboard.svelte` | PerformanceMetrics |  |
| `.svelte-error-fixes-backup/sveltekit-frontend/src/lib/components/ai/ContextualChatDemo.svelte` | ContextualState | $lib/types/sharedTypes |
| `.svelte-error-fixes-backup/sveltekit-frontend/src/lib/components/ai/CudaSearch.svelte` | CudaSearch, CudaCapabilities, Card, CardTitle | $lib/components/ui/enhanced-bits |
| `.svelte-error-fixes-backup/sveltekit-frontend/src/lib/components/ai/DocumentUploadSimulator.svelte` |  |  |
| `.svelte-error-fixes-backup/sveltekit-frontend/src/lib/components/ai/Enhanced3DLegalAIInterface.svelte` |  | $lib/machines/idle-detection-rabbitmq-machine, $lib/services/enhanced-vllm-cuda-integration, $lib/services/simd-gpu-parser-integration |
| `.svelte-error-fixes-backup/sveltekit-frontend/src/lib/components/ai/EnhancedAIAssistant.simple.svelte` | Brain, Settings, Trash2, Quote |  |
| `.svelte-error-fixes-backup/sveltekit-frontend/src/lib/components/ai/EnhancedAIAssistant.svelte` | Bot, Settings, Download, MessageSquare | $lib/stores/unified, $lib/services/pgvector-semantic-search, $lib/types/ai-assistant |
| `.svelte-error-fixes-backup/sveltekit-frontend/src/lib/components/ai/EnhancedAIChatTest.svelte` | Button, MessageCircle, Bot, StatusIcon | $lib/components/ui/MeltDialog.svelte, $lib/components/ui/enhanced-bits, $lib/components/ui/Input.svelte |
| `.svelte-error-fixes-backup/sveltekit-frontend/src/lib/components/ai/EnhancedContextualChat.svelte` | ContextualState, LegalEntity | $lib/forms/contextual-chat-schema, $lib/types/sharedTypes |
| `.svelte-error-fixes-backup/sveltekit-frontend/src/lib/components/ai/EnhancedDocumentUploader.svelte` | Upload, AlertTriangle, Loader2, CheckCircle | $lib/components/ui/bitsbutton.svelte, $lib/components/ui/dialog, $lib/components/ui/Select |
| `.svelte-error-fixes-backup/sveltekit-frontend/src/lib/components/ai/EnhancedFileUpload.svelte` | WebSocket, Upload, FileText, Check | $lib/machines/uploadMachine, $lib/types/upload, $lib/utils/toast |
| `.svelte-error-fixes-backup/sveltekit-frontend/src/lib/components/ai/EnhancedInlineEditor.svelte` |  | $lib/stores/unified, $lib/stores/unified |
| `.svelte-error-fixes-backup/sveltekit-frontend/src/lib/components/ai/EnhancedLegalAIChatWithSynthesis.svelte` | Date, Brain, Button, Settings | $lib/types/global, $lib/types/global, $lib/stores/unified |
| `.svelte-error-fixes-backup/sveltekit-frontend/src/lib/components/ai/EnhancedMCPIntegration.svelte` |  |  |
| `.svelte-error-fixes-backup/sveltekit-frontend/src/lib/components/ai/EnhancedVectorSearch.svelte` | SearchResult, Search, Input, Loader2 | $lib/components/ui/bitsbutton.svelte, $lib/components/ui/MeltDialog.svelte, $lib/components/ui/MeltSelect.svelte |
| `.svelte-error-fixes-backup/sveltekit-frontend/src/lib/components/ai/EvidenceCanvas.svelte` | Upload, Loader, CheckCircle, AlertCircle | $lib/services/concurrency-orchestrator |
| `.svelte-error-fixes-backup/sveltekit-frontend/src/lib/components/ai/EvidenceTimelineCard.svelte` | Button, Badge, Separator | $lib/components/ui/enhanced-bits, $lib/components/ui/badge, $lib/components/ui/enhanced-bits |
| `.svelte-error-fixes-backup/sveltekit-frontend/src/lib/components/ai/FindModal.svelte` | MCPContextAnalysis, Sparkles, Brain, Target | $lib/components/ui/MeltDialog.svelte, $lib/utils/mcp-helpers, $lib/integrations/phase13-full-integration |
| `.svelte-error-fixes-backup/sveltekit-frontend/src/lib/components/ai/GamingAIButton.svelte` | Settings, ChevronUp, Bot |  |
| `.svelte-error-fixes-backup/sveltekit-frontend/src/lib/components/ai/GamingAIInterface.svelte` | GamingAIButton, Bot, Database, Settings |  |
| `.svelte-error-fixes-backup/sveltekit-frontend/src/lib/components/ai/Gemma270MWebAssembly.svelte` | CardContent, Alert, Button | $lib/components/ui/enhanced-bits |
| `.svelte-error-fixes-backup/sveltekit-frontend/src/lib/components/ai/GPUAIAssistant.svelte` | Card, CardHeader, Bot, CardTitle | $lib/services/gpu-ai-service, $lib/stores/unified, $lib/stores/unified |
| `.svelte-error-fixes-backup/sveltekit-frontend/src/lib/components/ai/GPUStreamingChat.svelte` | Cpu, HardDrive, Activity, Zap | $lib/services/gpu-llm-streaming-pipeline |
| `.svelte-error-fixes-backup/sveltekit-frontend/src/lib/components/ai/IntegratedAIChat.svelte` | Badge, Separator, Input, Button | $lib/components/ui/Button.svelte, $lib/components/ui/Input.svelte, $lib/components/ui/Badge.svelte |
| `.svelte-error-fixes-backup/sveltekit-frontend/src/lib/components/ai/IntelligentWebAnalysisDemo.svelte` |  | $lib/ai/intelligent-web-analyzer.js |
| `.svelte-error-fixes-backup/sveltekit-frontend/src/lib/components/ai/LegalAIPipelineDemo.svelte` |  | $lib/services/legal-ai-acceleration-pipeline |
| `.svelte-error-fixes-backup/sveltekit-frontend/src/lib/components/ai/LegalDocumentDrafting.svelte` | DocumentDraft |  |
| `.svelte-error-fixes-backup/sveltekit-frontend/src/lib/components/ai/LLMProviderSelector.svelte` | Badge | $lib/types/component-props.js |
| `.svelte-error-fixes-backup/sveltekit-frontend/src/lib/components/ai/LocalImageGenerator.svelte` | ImageGenerationResult | $lib/services/local-image-generation-service.js |
| `.svelte-error-fixes-backup/sveltekit-frontend/src/lib/components/ai/MultiAgentAnalysisCard.svelte` | Badge, Separator, Button | $lib/components/ui/enhanced-bits, $lib/components/ui/badge, $lib/components/ui/enhanced-bits |
| `.svelte-error-fixes-backup/sveltekit-frontend/src/lib/components/ai/MultiLLMOrchestrator.svelte` | WorkerStatus, WorkerPool, Button, RefreshCw | $lib/components/ui/badge, $lib/components/ui/enhanced-bits, $lib/components/ui/enhanced-bits |
| `.svelte-error-fixes-backup/sveltekit-frontend/src/lib/components/ai/NESTextureStreamer.svelte` | ArrayBuffer | $lib/services/n64-lod-manager, $lib/components/ui/enhanced-bits/SSRWebGPULoader.svelte |
| `.svelte-error-fixes-backup/sveltekit-frontend/src/lib/components/ai/NeuralTopology3DDemo.svelte` |  | $lib/caching/reinforcement-learning-cache, $lib/gpu/nes-gpu-memory-bridge, $lib/services/chr-rom-precomputation-service |
| `.svelte-error-fixes-backup/sveltekit-frontend/src/lib/components/ai/OCRTensorDemo.svelte` |  | $lib/client/ocr-tensor-processor.js |
| `.svelte-error-fixes-backup/sveltekit-frontend/src/lib/components/ai/ollama-agent-shell.svelte` | Terminal, Bot, User, Check | $lib/types/component-props.js, $lib/machines/agentShellMachine, $lib/utils |
| `.svelte-error-fixes-backup/sveltekit-frontend/src/lib/components/ai/PatternDetectionInterface.svelte` | DetectedPattern, AnalysisResult | $lib/components/ui/dialog, $lib/components/ui/enhanced-bits |
| `.svelte-error-fixes-backup/sveltekit-frontend/src/lib/components/ai/PersonOfInterestCard.svelte` | Badge | $lib/components/ui/badge |
| `.svelte-error-fixes-backup/sveltekit-frontend/src/lib/components/ai/Phase8Demo.svelte` |  | $lib/ui/matrix-compiler, $lib/ui/matrix-lod, $lib/ai/custom-reranker |
| `.svelte-error-fixes-backup/sveltekit-frontend/src/lib/components/ai/ProactiveAIAssistant.svelte` |  |  |
| `.svelte-error-fixes-backup/sveltekit-frontend/src/lib/components/ai/ProactivePrompt.svelte` | Sparkles, Clock, MessageCircle, Lightbulb | $lib/stores/unified |
| `.svelte-error-fixes-backup/sveltekit-frontend/src/lib/components/ai/rag/DocumentUpload.svelte` | Card, Button | $lib/components/ui/Button.svelte, $lib/components/ui/card |
| `.svelte-error-fixes-backup/sveltekit-frontend/src/lib/components/ai/rag/EnhancedRAGInterface.svelte` |  |  |

---

## Top External Module Imports
| Module | Consumer Count |
|--------|----------------|
| `@sveltejs/kit` | 5817 |
| `$lib/types` | 4202 |
| `$lib/types/enhanced-svelte5-types` | 1924 |
| `drizzle-orm` | 1608 |
| `path` | 1600 |
| `svelte` | 1597 |
| `fs` | 1338 |
| `vitest` | 1131 |
| `svelte/store` | 1025 |
| `zod` | 1015 |
| `$app/environment` | 945 |
| `crypto` | 764 |
| `url` | 699 |
| `$lib/server/db` | 607 |
| `node:path` | 560 |
| `$lib/server/db/client` | 543 |
| `xstate` | 538 |
| `lucide-svelte` | 534 |
| `child_process` | 513 |
| `$lib/server/env.server.js` | 473 |
| `node:fs` | 450 |
| `$lib/components/ui/Button.svelte` | 443 |
| `pg` | 442 |
| `fs/promises` | 437 |
| `ioredis` | 411 |
| `$lib/server/db/schema-postgres` | 402 |
| `svelte/transition` | 368 |
| `drizzle-orm/pg-core` | 347 |
| `node:url` | 294 |
| `fast-check` | 292 |

---

## Directories with TODO/FIXME
- `deeds_labs/snapshots/2026-03-10/bucket-c-stale` — 3247 marker(s), score 45
- `deeds_labs/frontend/sveltekit-frontend-archive/dirs` — 2926 marker(s), score 43
- `scripts/api-cleanup` — 674 marker(s), score 45
- `scripts/api-cleanup/reports` — 672 marker(s), score 45
- `scripts/api-cleanup/reports/backup-2025-12-14T20-51-26-276Z` — 598 marker(s), score 45
- `deeds_labs/services/python-middleware/python_codebase` — 244 marker(s), score 78
- `deeds_labs/routes-parked-full` — 90 marker(s), score 37
- `scripts/api-cleanup/reports/backup-2025-12-14T21-11-49-641Z` — 74 marker(s), score 45
- `docker/langgraph-synthesis/.venv/Lib` — 52 marker(s), score 65
- `deeds_labs/dead-scripts` — 48 marker(s), score 100
- `deeds_labs/dead-scripts/phase-scripts` — 47 marker(s), score 100
- `deeds_labs/services/ts-consolidation-archive` — 47 marker(s), score 100
- `.svelte-error-fixes-backup/sveltekit-frontend/src/lib` — 45 marker(s), score 60
- `deeds_labs/api-legacy/api` — 36 marker(s), score 44
- `deeds_labs/routes-parked-full/api` — 36 marker(s), score 44

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
