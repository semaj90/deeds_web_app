# Codebase Map — 20-Gate Deep Audit
> Generated: 2026-05-07T04:00:07.590Z
> Mode: `fast-ast` · CPU-only · No GPU required
> Regenerate: `npm run index:codebase:fast:plan`

---

## Summary
| Metric | Count |
|--------|-------|
| Files scanned | 3616 |
| Directories analysed | 386 |
| Route files | 937 |
| Svelte components | 863 |
| API handlers | 630 |
| API routes without auth | 32 |
| API routes without Zod | 4 |
| SSR-unsafe files | 1 |
| Svelte 4 legacy patterns | 0 |
| Hardcoded localhost refs | 56 |
| Routes without test pairing | 13 |
| Cyclic import pairs | 0 |
| Drizzle table refs | 425 |
| TODO/FIXME markers | 16 |

---

## 20-Gate Audit Summary

| Gate | Check | Pass | Fail |
|------|-------|------|------|
| G4  | Auth guard on API routes | 685 | 32 |
| G5  | Zod validation on API routes | 486 | 4 |
| G11 | No hardcoded localhost (excl env.server) | 3560 | 56 |
| G14a | No `export let` (Svelte 4 props) | 3616 | 0 |
| G14b | No `$:` reactive declarations | 3616 | 0 |
| G14c | No `on:event=` directives | 3616 | 0 |
| G14d | No `createEventDispatcher()` | 3616 | 0 |
| G14e | No runes in plain `.ts` files | 3616 | 0 |
| G15 | No SSR-unsafe globals (unguarded) | 3615 | 1 |
| G16 | Server routes have test pairing | 640 | 13 |
| G17 | Server routes have error handling | 628 | 89 |
| G20 | Cyclic import pairs | — | 0 |

---

## Directory Scorecard (386 dirs · lowest score = most attention needed)

**Score factors**: Auth/API coverage 25pts · Zod coverage 15pts · Drizzle ref 10pts · No TODOs 15pts · SSR-safe 10pts · No Svelte4 10pts · No localhost 5pts · Error handling 5pts · Non-empty 5pts

**Flags**: 🔴ssr = SSR-unsafe globals · 🟡sv4 = Svelte4 legacy · 🟠lh = localhost hardcoded · ⬜notest = routes lack tests


| Status | Directory | Score | Files | Lines | APIs | Auth/Zod | TODOs | Flags |
|--------|-----------|-------|-------|-------|------|----------|-------|-------|
| ⚠️ | `src/routes/.well-known/agent.json` | 45 | 1 | 119 | 1 | 0/0 | 0 | — |
| ⚠️ | `src/routes/.well-known/appspecific` | 45 | 1 | 22 | 1 | 0/0 | 0 | — |
| ⚠️ | `src/routes/api/ping` | 45 | 1 | 13 | 1 | 0/0 | 0 | — |
| ⚠️ | `src/lib/server/middleware` | 58 | 4 | 693 | 2 | 0/1 | 0 | — |
| ⚠️ | `src/routes/api/db` | 60 | 1 | 29 | 1 | 0/0 | 0 | — |
| ⚠️ | `src/routes/api/docs` | 60 | 1 | 56 | 1 | 0/1 | 0 | — |
| ⚠️ | `src/routes/api/infrastructure` | 60 | 1 | 335 | 1 | 0/0 | 0 | — |
| ⚠️ | `src/routes/api/health` | 61 | 16 | 1879 | 16 | 2/3 | 0 | 🟠lh |
| ⚠️ | `src/routes/.well-known/llms-full.txt` | 65 | 1 | 103 | 1 | 0/1 | 0 | — |
| ⚠️ | `src/routes/.well-known/llms.txt` | 65 | 1 | 262 | 1 | 0/1 | 0 | — |
| ✅ | `src/routes/api/engagement` | 70 | 2 | 61 | 2 | 2/0 | 0 | — |
| ✅ | `src/routes/api/metrics` | 70 | 1 | 84 | 1 | 1/0 | 0 | — |
| ✅ | `src/routes/api/queue` | 70 | 1 | 27 | 1 | 1/0 | 0 | — |
| ✅ | `src/lib/components/ui` | 75 | 245 | 24174 | 0 | 0/1 | 3 | — |
| ✅ | `src/routes/api/ingest-constitution` | 75 | 1 | 47 | 1 | 1/0 | 0 | — |
| ✅ | `src/routes/api/observability` | 75 | 1 | 35 | 1 | 1/0 | 0 | — |
| ✅ | `src/routes/api/security` | 75 | 1 | 45 | 1 | 1/0 | 0 | — |
| ✅ | `src/routes/api/system` | 75 | 6 | 719 | 6 | 3/1 | 0 | — |
| ✅ | `src/routes/api/trace` | 75 | 1 | 28 | 1 | 1/0 | 0 | — |
| ✅ | `src/routes/minio/[...path]` | 75 | 1 | 57 | 1 | 1/0 | 0 | — |
| ✅ | `src/routes/api/code-intel` | 77 | 21 | 542 | 21 | 21/3 | 0 | ⬜notest |
| ✅ | `src/lib/ai` | 78 | 14 | 5099 | 0 | 0/1 | 1 | 🟠lh |
| ✅ | `src/lib/components/yorha` | 78 | 72 | 20740 | 0 | 0/5 | 1 | 🟠lh |
| ✅ | `src/routes/api/auth` | 78 | 10 | 758 | 10 | 4/5 | 0 | — |
| ✅ | `src/lib/components` | 80 | 56 | 170786 | 0 | 0/46 | 6 | 🟠lh |
| ✅ | `src/lib/ai/onnx` | 83 | 2 | 340 | 0 | 0/0 | 1 | — |
| ✅ | `src/lib/workers` | 83 | 6 | 1516 | 0 | 0/0 | 2 | — |
| ✅ | `src/routes/(app)/chat` | 83 | 4 | 865 | 0 | 4/1 | 1 | ⬜notest |
| ✅ | `src/routes/api/codebase-graph` | 83 | 2 | 317 | 2 | 2/1 | 0 | — |
| ✅ | `src/routes/api/phase89` | 83 | 24 | 2425 | 24 | 24/13 | 0 | — |
| ✅ | `src/routes/api/topology` | 83 | 2 | 215 | 2 | 2/1 | 0 | — |
| ✅ | `src/routes/api/cache` | 84 | 14 | 1426 | 14 | 14/8 | 0 | — |
| ✅ | `src/lib/components/ai` | 85 | 46 | 19715 | 0 | 0/11 | 0 | 🟠lh |
| ✅ | `src/lib/config` | 85 | 8 | 1504 | 0 | 1/1 | 0 | 🟠lh |
| ✅ | `src/lib/gpu` | 85 | 17 | 4763 | 0 | 0/2 | 0 | 🟠lh |
| ✅ | `src/lib/machines` | 85 | 11 | 4068 | 0 | 0/1 | 0 | 🟠lh |
| ✅ | `src/lib/server/chrrom` | 85 | 3 | 412 | 0 | 0/0 | 0 | 🟠lh |
| ✅ | `src/lib/server/clients` | 85 | 1 | 17 | 0 | 0/0 | 0 | 🟠lh |
| ✅ | `src/lib/server/env` | 85 | 1 | 14 | 0 | 0/0 | 0 | 🟠lh |
| ✅ | `src/lib/server/grpc` | 85 | 10 | 4250 | 0 | 0/4 | 0 | 🟠lh |
| ✅ | `src/lib/server/helpers` | 85 | 2 | 330 | 0 | 0/1 | 0 | 🟠lh |
| ✅ | `src/lib/server/utils` | 85 | 13 | 941 | 0 | 0/2 | 0 | 🟠lh |
| ✅ | `src/lib/services/error-analysis` | 85 | 17 | 4788 | 0 | 0/1 | 0 | 🟠lh |
| ✅ | `src/lib/utils` | 85 | 42 | 7082 | 0 | 2/7 | 0 | 🟠lh |
| ✅ | `src/lib/webgpu` | 85 | 19 | 5518 | 0 | 0/0 | 0 | 🟠lh |
| ✅ | `src/mcp/tools` | 85 | 5 | 561 | 0 | 0/5 | 0 | 🟠lh |
| ✅ | `src/routes/(app)/code-intel` | 85 | 17 | 2553 | 0 | 17/0 | 0 | 🟠lh ⬜notest |
| ✅ | `src/routes/(app)/couchdb-analytics` | 85 | 5 | 1833 | 0 | 5/0 | 0 | 🟠lh |
| ✅ | `src/routes/api/consolidation` | 85 | 1 | 42 | 1 | 1/0 | 0 | — |
| ✅ | `src/routes/api/dashboard` | 85 | 1 | 111 | 1 | 1/0 | 0 | — |
| ✅ | `src/routes/api/dev` | 85 | 1 | 63 | 1 | 1/0 | 0 | — |
| ✅ | `src/routes/api/websearch` | 85 | 1 | 63 | 1 | 1/1 | 0 | 🟠lh |
| ✅ | `src/routes/api/wiki` | 85 | 3 | 309 | 3 | 3/2 | 0 | — |
| ✅ | `tests/fixtures` | 85 | 2 | 89 | 0 | 1/0 | 0 | 🟠lh |
| ✅ | `tests/helpers` | 85 | 3 | 353 | 0 | 1/1 | 0 | 🟠lh |
| ✅ | `tests/scripts` | 85 | 3 | 104 | 0 | 0/0 | 0 | 🟠lh |
| ✅ | `src/routes/api/knowledge` | 86 | 8 | 1697 | 8 | 8/6 | 0 | — |
| ✅ | `src/routes/api/test` | 86 | 8 | 782 | 8 | 8/6 | 0 | — |
| ✅ | `src/routes/api/research` | 87 | 5 | 808 | 5 | 5/4 | 0 | — |
| ✅ | `src/routes/(app)/demos` | 88 | 102 | 19317 | 0 | 102/4 | 1 | 🟠lh ⬜notest |
| ✅ | `src/routes/api/cartridge` | 88 | 6 | 669 | 6 | 6/5 | 0 | — |
| ✅ | `src/lib/ai/e2b` | 90 | 2 | 524 | 0 | 0/0 | 0 | — |
| ✅ | `src/lib/cache` | 90 | 5 | 1046 | 0 | 0/1 | 0 | — |
| ✅ | `src/lib/client` | 90 | 4 | 823 | 0 | 0/4 | 0 | — |
| ✅ | `src/lib/client/db` | 90 | 1 | 91 | 0 | 0/0 | 0 | — |
| ✅ | `src/lib/client/ui` | 90 | 2 | 183 | 0 | 0/0 | 0 | — |
| ✅ | `src/lib/collaboration` | 90 | 1 | 267 | 0 | 0/1 | 0 | — |
| ✅ | `src/lib/components/admin` | 90 | 5 | 2560 | 0 | 0/2 | 0 | — |
| ✅ | `src/lib/components/agent` | 90 | 1 | 391 | 0 | 0/0 | 0 | — |
| ✅ | `src/lib/components/agentic` | 90 | 2 | 498 | 0 | 0/0 | 0 | — |
| ✅ | `src/lib/components/analysis` | 90 | 3 | 2809 | 0 | 0/1 | 0 | — |
| ✅ | `src/lib/components/analytics` | 90 | 2 | 1161 | 0 | 0/1 | 0 | — |
| ✅ | `src/lib/components/audio` | 90 | 1 | 631 | 0 | 0/0 | 0 | — |
| ✅ | `src/lib/components/cache` | 90 | 3 | 1005 | 0 | 0/0 | 0 | — |
| ✅ | `src/lib/components/canvas` | 90 | 6 | 2338 | 0 | 0/2 | 0 | — |
| ✅ | `src/lib/components/case` | 90 | 3 | 670 | 0 | 0/0 | 0 | — |
| ✅ | `src/lib/components/cases` | 90 | 11 | 3154 | 0 | 0/1 | 0 | — |
| ✅ | `src/lib/components/charges` | 90 | 1 | 211 | 0 | 0/0 | 0 | — |
| ✅ | `src/lib/components/chat` | 90 | 4 | 768 | 0 | 0/1 | 0 | — |
| ✅ | `src/lib/components/citations` | 90 | 5 | 2030 | 0 | 0/0 | 0 | — |
| ✅ | `src/lib/components/codebase` | 90 | 12 | 5497 | 0 | 0/0 | 0 | — |
| ✅ | `src/lib/components/courtroom` | 90 | 2 | 1505 | 0 | 0/0 | 0 | — |
| ✅ | `src/lib/components/dashboard` | 90 | 15 | 3181 | 0 | 0/0 | 0 | — |
| ✅ | `src/lib/components/demos` | 90 | 1 | 359 | 0 | 0/0 | 0 | — |
| ✅ | `src/lib/components/detective` | 90 | 6 | 1884 | 0 | 0/2 | 0 | — |
| ✅ | `src/lib/components/document` | 90 | 1 | 401 | 0 | 0/0 | 0 | — |
| ✅ | `src/lib/components/editor` | 90 | 7 | 2398 | 0 | 0/0 | 0 | — |
| ✅ | `src/lib/components/editors` | 90 | 1 | 55 | 0 | 0/0 | 0 | — |
| ✅ | `src/lib/components/evidence` | 90 | 41 | 14687 | 0 | 0/5 | 0 | — |
| ✅ | `src/lib/components/forms` | 90 | 7 | 4163 | 0 | 0/2 | 0 | — |
| ✅ | `src/lib/components/glyph` | 90 | 1 | 784 | 0 | 0/0 | 0 | — |
| ✅ | `src/lib/components/graph` | 90 | 3 | 2287 | 0 | 0/0 | 0 | — |
| ✅ | `src/lib/components/layout` | 90 | 1 | 399 | 0 | 0/0 | 0 | — |
| ✅ | `src/lib/components/legal` | 90 | 33 | 11235 | 0 | 0/5 | 0 | — |
| ✅ | `src/lib/components/legal-ai` | 90 | 18 | 7563 | 0 | 0/0 | 0 | — |
| ✅ | `src/lib/components/legal-corpus` | 90 | 8 | 2918 | 0 | 0/0 | 0 | — |
| ✅ | `src/lib/components/library` | 90 | 1 | 70 | 0 | 0/0 | 0 | — |
| ✅ | `src/lib/components/modals` | 90 | 2 | 1074 | 0 | 0/0 | 0 | — |
| ✅ | `src/lib/components/monitoring` | 90 | 3 | 843 | 0 | 0/0 | 0 | — |
| ✅ | `src/lib/components/nes` | 90 | 1 | 185 | 0 | 0/0 | 0 | — |
| ✅ | `src/lib/components/onboarding` | 90 | 1 | 1050 | 0 | 0/0 | 0 | — |
| ✅ | `src/lib/components/phase78` | 90 | 5 | 1086 | 0 | 0/0 | 0 | — |
| ✅ | `src/lib/components/poi` | 90 | 10 | 2460 | 0 | 0/1 | 0 | — |
| ✅ | `src/lib/components/rag` | 90 | 4 | 1259 | 0 | 0/0 | 0 | — |
| ✅ | `src/lib/components/recommendations` | 90 | 2 | 661 | 0 | 0/0 | 0 | — |
| ✅ | `src/lib/components/reports` | 90 | 1 | 244 | 0 | 0/0 | 0 | — |
| ✅ | `src/lib/components/research` | 90 | 1 | 585 | 0 | 0/0 | 0 | — |
| ✅ | `src/lib/components/shells` | 90 | 4 | 832 | 0 | 0/0 | 0 | — |
| ✅ | `src/lib/components/source-validation` | 90 | 4 | 1091 | 0 | 0/0 | 0 | — |
| ✅ | `src/lib/components/subcomponents` | 90 | 1 | 67 | 0 | 0/0 | 0 | — |
| ✅ | `src/lib/components/terminal` | 90 | 1 | 235 | 0 | 0/0 | 0 | — |
| ✅ | `src/lib/components/video` | 90 | 1 | 891 | 0 | 0/0 | 0 | — |
| ✅ | `src/lib/components/visualization` | 90 | 1 | 102 | 0 | 0/0 | 0 | — |
| ✅ | `src/lib/courtroom` | 90 | 4 | 1560 | 0 | 0/0 | 0 | — |
| ✅ | `src/lib/env` | 90 | 2 | 27 | 0 | 0/0 | 0 | — |
| ✅ | `src/lib/features/evidence-command-center` | 90 | 5 | 419 | 0 | 0/0 | 0 | — |
| ✅ | `src/lib/features/poi` | 90 | 1 | 124 | 0 | 0/0 | 0 | — |
| ✅ | `src/lib/graph` | 90 | 1 | 54 | 0 | 0/0 | 0 | — |
| ✅ | `src/lib/icons/yorha` | 90 | 15 | 572 | 0 | 0/0 | 0 | — |
| ✅ | `src/lib/messaging` | 90 | 1 | 168 | 0 | 0/0 | 0 | — |
| ✅ | `src/lib/models` | 90 | 1 | 1389 | 0 | 0/1 | 0 | — |
| ✅ | `src/lib/phase72` | 90 | 1 | 148 | 0 | 0/1 | 0 | — |
| ✅ | `src/lib/schemas` | 90 | 5 | 1049 | 0 | 0/5 | 0 | — |
| ✅ | `src/lib/schemas/tools` | 90 | 8 | 486 | 0 | 0/0 | 0 | — |
| ✅ | `src/lib/server/acp` | 90 | 2 | 807 | 0 | 0/1 | 0 | — |
| ✅ | `src/lib/server/agents-md` | 90 | 3 | 439 | 0 | 0/2 | 0 | — |
| ✅ | `src/lib/server/api` | 90 | 1 | 195 | 0 | 0/0 | 0 | — |
| ✅ | `src/lib/server/ast` | 90 | 1 | 313 | 0 | 0/0 | 0 | — |
| ✅ | `src/lib/server/auth` | 90 | 1 | 41 | 0 | 0/0 | 0 | — |
| ✅ | `src/lib/server/cache` | 90 | 13 | 4368 | 0 | 0/9 | 0 | — |
| ✅ | `src/lib/server/cartridge` | 90 | 5 | 1614 | 0 | 0/2 | 0 | — |
| ✅ | `src/lib/server/config` | 90 | 4 | 701 | 0 | 0/1 | 0 | — |
| ✅ | `src/lib/server/connections` | 90 | 1 | 346 | 0 | 0/0 | 0 | — |
| ✅ | `src/lib/server/couchdb` | 90 | 3 | 521 | 0 | 0/0 | 0 | — |
| ✅ | `src/lib/server/data` | 90 | 2 | 459 | 0 | 0/0 | 0 | — |
| ✅ | `src/lib/server/ff1` | 90 | 9 | 1817 | 0 | 0/5 | 0 | — |
| ✅ | `src/lib/server/glyph` | 90 | 2 | 170 | 0 | 0/0 | 0 | — |
| ✅ | `src/lib/server/image` | 90 | 1 | 88 | 0 | 0/0 | 0 | — |
| ✅ | `src/lib/server/inference` | 90 | 4 | 2067 | 0 | 0/4 | 0 | — |
| ✅ | `src/lib/server/init` | 90 | 1 | 105 | 0 | 0/0 | 0 | — |
| ✅ | `src/lib/server/integrations` | 90 | 1 | 279 | 0 | 0/0 | 0 | — |
| ✅ | `src/lib/server/kb` | 90 | 2 | 143 | 0 | 0/0 | 0 | — |
| ✅ | `src/lib/server/langextract` | 90 | 3 | 565 | 0 | 0/1 | 0 | — |
| ✅ | `src/lib/server/legal` | 90 | 7 | 2618 | 0 | 0/0 | 0 | — |
| ✅ | `src/lib/server/mcp` | 90 | 3 | 394 | 0 | 0/0 | 0 | — |
| ✅ | `src/lib/server/memory` | 90 | 1 | 154 | 0 | 0/0 | 0 | — |
| ✅ | `src/lib/server/minio` | 90 | 2 | 321 | 0 | 0/0 | 0 | — |
| ✅ | `src/lib/server/nlp` | 90 | 1 | 140 | 0 | 0/1 | 0 | — |
| ✅ | `src/lib/server/notifications` | 90 | 1 | 210 | 0 | 0/0 | 0 | — |
| ✅ | `src/lib/server/observability` | 90 | 3 | 970 | 0 | 0/0 | 0 | — |
| ✅ | `src/lib/server/obsidian` | 90 | 2 | 384 | 0 | 0/0 | 0 | — |
| ✅ | `src/lib/server/ocr` | 90 | 3 | 392 | 0 | 0/0 | 0 | — |
| ✅ | `src/lib/server/optimize` | 90 | 1 | 42 | 0 | 0/0 | 0 | — |
| ✅ | `src/lib/server/orchestrators` | 90 | 1 | 39 | 0 | 0/0 | 0 | — |
| ✅ | `src/lib/server/pdf` | 90 | 2 | 314 | 0 | 0/0 | 0 | — |
| ✅ | `src/lib/server/pgai` | 90 | 3 | 69 | 0 | 0/0 | 0 | — |
| ✅ | `src/lib/server/phase72` | 90 | 3 | 185 | 0 | 0/0 | 0 | — |
| ✅ | `src/lib/server/phase78` | 90 | 1 | 402 | 0 | 0/0 | 0 | — |
| ✅ | `src/lib/server/pipeline` | 90 | 1 | 211 | 0 | 0/0 | 0 | — |
| ✅ | `src/lib/server/rag` | 90 | 7 | 535 | 0 | 0/1 | 0 | — |
| ✅ | `src/lib/server/rate-limit` | 90 | 2 | 318 | 0 | 0/0 | 0 | — |
| ✅ | `src/lib/server/redis` | 90 | 1 | 26 | 0 | 0/0 | 0 | — |
| ✅ | `src/lib/server/search` | 90 | 9 | 1298 | 0 | 0/2 | 0 | — |
| ✅ | `src/lib/server/security` | 90 | 1 | 131 | 0 | 0/0 | 0 | — |
| ✅ | `src/lib/server/services` | 90 | 2 | 724 | 0 | 0/0 | 0 | — |
| ✅ | `src/lib/server/simulation` | 90 | 2 | 477 | 0 | 0/1 | 0 | — |
| ✅ | `src/lib/server/startup` | 90 | 1 | 114 | 0 | 0/0 | 0 | — |
| ✅ | `src/lib/server/storage` | 90 | 2 | 568 | 0 | 0/0 | 0 | — |
| ✅ | `src/lib/server/streaming` | 90 | 2 | 364 | 0 | 0/1 | 0 | — |
| ✅ | `src/lib/server/tools` | 90 | 9 | 1508 | 0 | 0/3 | 0 | — |
| ✅ | `src/lib/server/topology` | 90 | 1 | 329 | 0 | 0/0 | 0 | — |
| ✅ | `src/lib/server/training` | 90 | 1 | 111 | 0 | 0/0 | 0 | — |
| ✅ | `src/lib/server/validation` | 90 | 2 | 402 | 0 | 0/1 | 0 | — |
| ✅ | `src/lib/shared` | 90 | 3 | 284 | 0 | 0/1 | 0 | — |
| ✅ | `src/lib/shared/schemas` | 90 | 1 | 32 | 0 | 0/0 | 0 | — |
| ✅ | `src/lib/shared/types` | 90 | 1 | 14 | 0 | 0/0 | 0 | — |
| ✅ | `src/lib/shims` | 90 | 11 | 1235 | 0 | 0/1 | 0 | 🔴ssr |
| ✅ | `src/lib/stores` | 90 | 14 | 4489 | 0 | 0/5 | 0 | — |
| ✅ | `src/lib/stores/dashboard` | 90 | 3 | 654 | 0 | 0/1 | 0 | — |
| ✅ | `src/lib/stores/unified` | 90 | 6 | 1212 | 0 | 0/0 | 0 | — |
| ✅ | `src/lib/test-utils` | 90 | 1 | 11 | 0 | 0/0 | 0 | — |
| ✅ | `src/routes/(admin)/error-brain` | 90 | 1 | 170 | 0 | 1/0 | 0 | — |
| ✅ | `src/routes/(analysis)` | 90 | 4 | 3236 | 0 | 8/0 | 0 | ⬜notest |
| ✅ | `src/routes/(analysis)/audio-analysis` | 90 | 3 | 985 | 0 | 2/0 | 0 | ⬜notest |
| ✅ | `src/routes/(analysis)/document-analysis` | 90 | 3 | 990 | 0 | 2/0 | 0 | ⬜notest |
| ✅ | `src/routes/(analysis)/video-analysis` | 90 | 3 | 1103 | 0 | 2/0 | 0 | ⬜notest |
| ✅ | `src/routes/(analysis)@/audio-analysis` | 90 | 1 | 782 | 0 | 0/0 | 0 | — |
| ✅ | `src/routes/(analysis)@/document-analysis` | 90 | 1 | 746 | 0 | 0/0 | 0 | — |
| ✅ | `src/routes/(analysis)@/video-analysis` | 90 | 1 | 943 | 0 | 0/0 | 0 | — |
| ✅ | `src/routes/(app)/ai-dashboard` | 90 | 1 | 6 | 0 | 1/0 | 0 | ⬜notest |
| ✅ | `src/routes/(app)/all-routes` | 90 | 1 | 6 | 0 | 1/0 | 0 | ⬜notest |
| ✅ | `src/routes/(app)/analytics` | 90 | 2 | 2385 | 0 | 2/0 | 0 | — |
| ✅ | `src/routes/(app)/cache-monitor` | 90 | 1 | 146 | 0 | 1/0 | 0 | — |
| ✅ | `src/routes/(app)/citations` | 90 | 10 | 2390 | 0 | 10/0 | 0 | ⬜notest |
| ✅ | `src/routes/(app)/codebase-graph` | 90 | 5 | 969 | 0 | 5/1 | 0 | ⬜notest |
| ✅ | `src/routes/(app)/codebase-wiki` | 90 | 1 | 25 | 0 | 1/0 | 0 | — |
| ✅ | `src/routes/(app)/dashboard` | 90 | 1 | 1995 | 0 | 1/1 | 0 | — |
| ✅ | `src/routes/(app)/error-brain` | 90 | 1 | 6 | 0 | 1/0 | 0 | ⬜notest |
| ✅ | `src/routes/(app)/evidence-library` | 90 | 2 | 281 | 0 | 2/0 | 0 | ⬜notest |
| ✅ | `src/routes/(app)/fictional-cases` | 90 | 4 | 1011 | 0 | 4/0 | 0 | ⬜notest |
| ✅ | `src/routes/(app)/global-search` | 90 | 1 | 2392 | 0 | 1/0 | 0 | — |
| ✅ | `src/routes/(app)/gpu-evidence-graph` | 90 | 1 | 6 | 0 | 1/0 | 0 | ⬜notest |
| ✅ | `src/routes/(app)/indexing` | 90 | 1 | 960 | 0 | 1/0 | 0 | — |
| ✅ | `src/routes/(app)/knowledge` | 90 | 1 | 517 | 0 | 1/0 | 0 | — |
| ✅ | `src/routes/(app)/legal-corpus-premium` | 90 | 1 | 1155 | 0 | 1/0 | 0 | — |
| ✅ | `src/routes/(app)/library` | 90 | 13 | 4358 | 0 | 13/0 | 0 | ⬜notest |
| ✅ | `src/routes/(app)/rag-search` | 90 | 2 | 370 | 0 | 2/0 | 0 | — |
| ✅ | `src/routes/(app)/recommendations` | 90 | 2 | 734 | 0 | 2/0 | 0 | — |
| ✅ | `src/routes/(app)/system-configuration` | 90 | 1 | 838 | 0 | 1/1 | 0 | — |
| ✅ | `src/routes/(app)/webgpu-similarity` | 90 | 1 | 12 | 0 | 1/0 | 0 | — |
| ✅ | `src/routes/(dev)/cache-demo` | 90 | 1 | 261 | 0 | 0/0 | 0 | — |
| ✅ | `src/routes/(dev)/demo` | 90 | 3 | 538 | 0 | 0/1 | 0 | — |
| ✅ | `src/routes/(dev)/odin` | 90 | 2 | 323 | 0 | 1/0 | 0 | ⬜notest |
| ✅ | `src/routes/(dev)/test-source-validation` | 90 | 1 | 381 | 0 | 0/0 | 0 | — |
| ✅ | `src/routes/(dev)/tts-demo` | 90 | 2 | 84 | 0 | 0/0 | 0 | — |
| ✅ | `src/routes/(dev)/voice-chat-demo` | 90 | 2 | 329 | 0 | 0/0 | 0 | — |
| ✅ | `src/routes/api/acp` | 90 | 2 | 114 | 2 | 2/2 | 0 | — |
| ✅ | `src/routes/api/agents` | 90 | 1 | 295 | 1 | 1/1 | 0 | — |
| ✅ | `src/routes/api/audit` | 90 | 2 | 200 | 2 | 2/2 | 0 | — |
| ✅ | `src/routes/api/case-theory` | 90 | 1 | 170 | 1 | 1/1 | 0 | — |
| ✅ | `src/routes/api/charges` | 90 | 1 | 45 | 1 | 1/1 | 0 | — |
| ✅ | `src/routes/api/chrrom` | 90 | 3 | 169 | 3 | 3/3 | 0 | — |
| ✅ | `src/routes/api/detective` | 90 | 2 | 434 | 2 | 2/2 | 0 | — |
| ✅ | `src/routes/api/embed` | 90 | 1 | 125 | 1 | 1/1 | 0 | — |
| ✅ | `src/routes/api/feedback` | 90 | 1 | 41 | 1 | 1/1 | 0 | — |
| ✅ | `src/routes/api/gpu` | 90 | 3 | 277 | 3 | 3/3 | 0 | — |
| ✅ | `src/routes/api/gpu-wasm-integration` | 90 | 1 | 288 | 1 | 1/1 | 0 | — |
| ✅ | `src/routes/api/hypergraph` | 90 | 1 | 149 | 1 | 1/1 | 0 | — |
| ✅ | `src/routes/api/indexing` | 90 | 1 | 547 | 1 | 1/1 | 0 | — |
| ✅ | `src/routes/api/ingest` | 90 | 2 | 349 | 2 | 2/2 | 0 | — |
| ✅ | `src/routes/api/investigate` | 90 | 1 | 179 | 1 | 1/1 | 0 | — |
| ✅ | `src/routes/api/kb` | 90 | 2 | 251 | 2 | 2/2 | 0 | — |
| ✅ | `src/routes/api/mcp` | 90 | 1 | 119 | 1 | 1/1 | 0 | — |
| ✅ | `src/routes/api/ml` | 90 | 1 | 132 | 1 | 1/1 | 0 | — |
| ✅ | `src/routes/api/nlp` | 90 | 2 | 60 | 2 | 2/2 | 0 | — |
| ✅ | `src/routes/api/obsidian` | 90 | 1 | 147 | 1 | 1/1 | 0 | — |
| ✅ | `src/routes/api/ollama` | 90 | 2 | 175 | 2 | 2/2 | 0 | — |
| ✅ | `src/routes/api/orchestrator` | 90 | 1 | 79 | 1 | 1/1 | 0 | — |
| ✅ | `src/routes/api/pgai` | 90 | 3 | 104 | 3 | 3/3 | 0 | — |
| ✅ | `src/routes/api/phase109` | 90 | 2 | 259 | 2 | 2/2 | 0 | — |
| ✅ | `src/routes/api/pipeline` | 90 | 2 | 124 | 2 | 2/2 | 0 | — |
| ✅ | `src/routes/api/playwright` | 90 | 1 | 44 | 1 | 1/1 | 0 | — |
| ✅ | `src/routes/api/rabbitmq` | 90 | 1 | 134 | 1 | 1/1 | 0 | — |
| ✅ | `src/routes/api/route-operations` | 90 | 1 | 49 | 1 | 1/1 | 0 | — |
| ✅ | `src/routes/api/summarize` | 90 | 3 | 217 | 3 | 3/3 | 0 | — |
| ✅ | `src/routes/api/tags` | 90 | 3 | 151 | 3 | 3/1 | 0 | — |
| ✅ | `src/routes/api/tools` | 90 | 4 | 296 | 4 | 4/4 | 0 | — |
| ✅ | `src/routes/api/user` | 90 | 1 | 91 | 1 | 1/1 | 0 | — |
| ✅ | `src/routes/api/vector-search` | 90 | 1 | 110 | 1 | 1/1 | 0 | — |
| ✅ | `src/routes/api/video` | 90 | 1 | 105 | 1 | 1/1 | 0 | — |
| ✅ | `src/routes/api/vision` | 90 | 1 | 233 | 1 | 1/1 | 0 | — |
| ✅ | `src/routes/api/web` | 90 | 2 | 181 | 2 | 2/2 | 0 | — |
| ✅ | `src/routes/api/whisper` | 90 | 1 | 417 | 1 | 1/1 | 0 | — |
| ✅ | `src/routes/api/worker` | 90 | 1 | 186 | 1 | 1/1 | 0 | — |
| ✅ | `src/routes/api/workflow-events` | 90 | 1 | 133 | 1 | 1/1 | 0 | — |
| ✅ | `src/routes/register` | 90 | 1 | 542 | 0 | 0/0 | 0 | — |
| ✅ | `src/stores` | 90 | 1 | 47 | 0 | 0/0 | 0 | — |
| ✅ | `src/tests` | 90 | 1 | 10 | 0 | 0/0 | 0 | — |
| ✅ | `src/wasm` | 90 | 2 | 524 | 0 | 0/0 | 0 | — |
| ✅ | `src/workers` | 90 | 3 | 241 | 0 | 0/0 | 0 | — |
| ✅ | `tests/accessibility` | 90 | 2 | 557 | 0 | 0/0 | 0 | — |
| ✅ | `tests/e2e` | 90 | 21 | 6134 | 0 | 3/1 | 0 | — |
| ✅ | `tests/e2e/utils` | 90 | 3 | 505 | 0 | 0/0 | 0 | — |
| ✅ | `tests/reports` | 90 | 2 | 64 | 0 | 0/0 | 0 | — |
| ✅ | `tests/routes/auto` | 90 | 1 | 38447 | 0 | 595/0 | 0 | — |
| ✅ | `tests/routes/auto/.well-known` | 90 | 4 | 212 | 0 | 4/0 | 0 | — |
| ✅ | `tests/routes/auto/admin` | 90 | 3 | 191 | 0 | 3/0 | 0 | — |
| ✅ | `tests/routes/auto/api` | 90 | 586 | 37906 | 0 | 586/0 | 0 | — |
| ✅ | `tests/routes/auto/minio` | 90 | 1 | 53 | 0 | 1/0 | 0 | — |
| ✅ | `tests/runes` | 90 | 1 | 230 | 0 | 0/0 | 0 | — |
| ✅ | `tests/setup` | 90 | 1 | 226 | 0 | 0/0 | 0 | — |
| ✅ | `tests/unit` | 90 | 6 | 1248 | 0 | 0/3 | 0 | — |
| ✅ | `tests/utils` | 90 | 1 | 134 | 0 | 0/0 | 0 | — |
| ✅ | `src/routes/api/audio` | 91 | 4 | 519 | 4 | 4/3 | 0 | 🟠lh |
| ✅ | `src/routes/api/synthesis` | 91 | 7 | 1854 | 7 | 7/6 | 1 | — |
| ✅ | `src/routes/api/codeintel` | 92 | 9 | 1042 | 9 | 9/4 | 0 | — |
| ✅ | `src/routes/api/graph` | 92 | 17 | 2610 | 17 | 17/14 | 0 | 🟠lh ⬜notest |
| ✅ | `src/routes` | 93 | 6 | 212048 | 623 | 1007/513 | 7 | 🟠lh ⬜notest |
| ✅ | `src/routes/api/document` | 93 | 2 | 148 | 2 | 2/1 | 0 | — |
| ✅ | `src/routes/api/internal` | 93 | 2 | 114 | 2 | 2/1 | 0 | — |
| ✅ | `src/routes/api/stream` | 93 | 2 | 102 | 2 | 2/1 | 0 | — |
| ✅ | `src/routes/api/ai` | 94 | 30 | 3086 | 30 | 30/28 | 0 | 🟠lh |
| ✅ | `src/routes/api/library` | 94 | 21 | 2860 | 21 | 21/12 | 0 | — |
| ✅ | `src/lib/server/agent` | 95 | 11 | 4178 | 0 | 0/8 | 0 | 🟠lh |
| ✅ | `src/lib/server/ai` | 95 | 39 | 11104 | 0 | 2/15 | 0 | 🟠lh |
| ✅ | `src/lib/server/db` | 95 | 111 | 18077 | 0 | 0/4 | 0 | 🟠lh |
| ✅ | `src/lib/server/gpu` | 95 | 11 | 4321 | 0 | 0/2 | 0 | 🟠lh |
| ✅ | `src/lib/server/graph` | 95 | 21 | 9682 | 0 | 1/7 | 0 | 🟠lh |
| ✅ | `src/lib/server/ml` | 95 | 8 | 2973 | 0 | 0/0 | 0 | 🟠lh |
| ✅ | `src/lib/server/vector` | 95 | 10 | 2839 | 0 | 0/1 | 0 | 🟠lh |
| ✅ | `src/lib/services` | 95 | 8 | 9875 | 0 | 0/3 | 0 | 🟠lh |
| ✅ | `src/lib/services/knowledge-search` | 95 | 11 | 3966 | 0 | 0/2 | 0 | 🟠lh |
| ✅ | `src/mcp` | 95 | 4 | 6753 | 0 | 1/7 | 0 | 🟠lh |
| ✅ | `src/routes/api/errors` | 95 | 3 | 253 | 3 | 3/2 | 0 | — |
| ✅ | `src/routes/api/canon` | 96 | 4 | 574 | 4 | 4/3 | 0 | — |
| ✅ | `src/routes/api/persons-of-interest` | 96 | 14 | 2737 | 14 | 14/10 | 0 | — |
| ✅ | `src/routes/api/phase78` | 96 | 4 | 198 | 4 | 4/3 | 0 | — |
| ✅ | `src/routes/api/yorha` | 96 | 4 | 510 | 4 | 4/3 | 0 | — |
| ✅ | `src/routes/api/admin` | 97 | 11 | 1922 | 11 | 11/9 | 0 | — |
| ✅ | `src/routes/api/analytics` | 97 | 26 | 4130 | 26 | 25/22 | 0 | — |
| ✅ | `src/routes/api/codebase-index` | 97 | 47 | 13238 | 46 | 46/38 | 0 | — |
| ✅ | `src/routes/api/evidence` | 97 | 27 | 5622 | 27 | 27/21 | 0 | — |
| ✅ | `src/routes/api/ace` | 98 | 8 | 1706 | 8 | 8/7 | 0 | — |
| ✅ | `src/routes/api/cases` | 98 | 25 | 4737 | 25 | 25/21 | 0 | — |
| ✅ | `src/routes/api/codebase` | 98 | 12 | 1912 | 12 | 12/10 | 0 | — |
| ✅ | `src/routes/api/rag` | 98 | 10 | 2267 | 9 | 9/8 | 0 | — |
| ✅ | `src/routes/api/reports` | 98 | 9 | 2311 | 9 | 9/8 | 0 | — |
| ✅ | `src/routes/api/routes` | 98 | 9 | 1005 | 9 | 9/8 | 0 | — |
| ✅ | `src/routes/api/v1` | 99 | 19 | 1584 | 19 | 19/18 | 0 | — |
| ✅ | `src/lib` | 100 | 11 | 394598 | 3 | 12/251 | 9 | 🔴ssr 🟠lh |
| ✅ | `src/lib/data` | 100 | 5 | 1682 | 0 | 0/0 | 0 | — |
| ✅ | `src/lib/db` | 100 | 4 | 2892 | 0 | 0/1 | 0 | — |
| ✅ | `src/lib/db/queries` | 100 | 2 | 881 | 0 | 0/0 | 0 | — |
| ✅ | `src/lib/db/schema` | 100 | 6 | 890 | 0 | 0/0 | 0 | — |
| ✅ | `src/lib/server` | 100 | 62 | 157454 | 3 | 9/162 | 0 | 🟠lh |
| ✅ | `src/lib/server/ace` | 100 | 29 | 10820 | 0 | 0/15 | 0 | — |
| ✅ | `src/lib/server/adapters` | 100 | 1 | 638 | 0 | 0/1 | 0 | — |
| ✅ | `src/lib/server/agents` | 100 | 4 | 316 | 0 | 0/0 | 0 | — |
| ✅ | `src/lib/server/analysis` | 100 | 12 | 2988 | 0 | 0/4 | 0 | — |
| ✅ | `src/lib/server/analytics` | 100 | 15 | 6753 | 0 | 0/10 | 0 | — |
| ✅ | `src/lib/server/audit` | 100 | 4 | 1415 | 0 | 0/1 | 0 | — |
| ✅ | `src/lib/server/cases` | 100 | 1 | 189 | 0 | 0/0 | 0 | — |
| ✅ | `src/lib/server/codeintel` | 100 | 1 | 498 | 0 | 0/1 | 0 | — |
| ✅ | `src/lib/server/concurrency` | 100 | 3 | 741 | 0 | 0/1 | 0 | — |
| ✅ | `src/lib/server/embedding` | 100 | 9 | 1122 | 0 | 0/1 | 0 | — |
| ✅ | `src/lib/server/engagement` | 100 | 1 | 367 | 0 | 0/0 | 0 | — |
| ✅ | `src/lib/server/error-brain` | 100 | 11 | 1156 | 0 | 1/2 | 0 | — |
| ✅ | `src/lib/server/evidence` | 100 | 15 | 1229 | 0 | 0/2 | 0 | — |
| ✅ | `src/lib/server/indexer` | 100 | 23 | 6805 | 1 | 0/5 | 0 | — |
| ✅ | `src/lib/server/llm` | 100 | 6 | 1643 | 0 | 0/2 | 0 | — |
| ✅ | `src/lib/server/queue` | 100 | 8 | 3812 | 0 | 0/3 | 0 | — |
| ✅ | `src/lib/server/reports` | 100 | 1 | 112 | 0 | 0/1 | 0 | — |
| ✅ | `src/lib/server/research` | 100 | 16 | 1604 | 0 | 0/3 | 0 | — |
| ✅ | `src/lib/server/retrieval` | 100 | 28 | 7359 | 0 | 0/5 | 0 | — |
| ✅ | `src/lib/server/tensor` | 100 | 2 | 461 | 0 | 0/1 | 0 | — |
| ✅ | `src/lib/server/trace` | 100 | 1 | 344 | 0 | 0/0 | 0 | — |
| ✅ | `src/lib/server/types` | 100 | 10 | 1109 | 0 | 0/0 | 0 | — |
| ✅ | `src/lib/server/unified` | 100 | 1 | 284 | 0 | 0/0 | 0 | — |
| ✅ | `src/lib/server/wiki` | 100 | 7 | 1940 | 0 | 0/1 | 0 | — |
| ✅ | `src/lib/server/workers` | 100 | 5 | 1771 | 0 | 0/4 | 0 | — |
| ✅ | `src/lib/types` | 100 | 52 | 7126 | 0 | 0/3 | 0 | — |
| ✅ | `src/routes/(app)` | 100 | 2 | 103438 | 4 | 407/40 | 6 | 🟠lh ⬜notest |
| ✅ | `src/routes/(app)/acp` | 100 | 1 | 613 | 0 | 1/1 | 0 | — |
| ✅ | `src/routes/(app)/active-cases` | 100 | 2 | 1154 | 0 | 2/0 | 0 | ⬜notest |
| ✅ | `src/routes/(app)/admin` | 100 | 130 | 25946 | 3 | 130/12 | 4 | 🟠lh ⬜notest |
| ✅ | `src/routes/(app)/analysis-center` | 100 | 4 | 1574 | 0 | 4/2 | 0 | ⬜notest |
| ✅ | `src/routes/(app)/cases` | 100 | 39 | 10476 | 0 | 39/10 | 0 | ⬜notest |
| ✅ | `src/routes/(app)/command-center` | 100 | 11 | 3456 | 0 | 11/0 | 0 | ⬜notest |
| ✅ | `src/routes/(app)/evidence` | 100 | 14 | 3793 | 1 | 14/5 | 0 | ⬜notest |
| ✅ | `src/routes/(app)/legal-corpus` | 100 | 5 | 3362 | 0 | 5/0 | 0 | ⬜notest |
| ✅ | `src/routes/(app)/persons-of-interest` | 100 | 7 | 3090 | 0 | 7/1 | 0 | ⬜notest |
| ✅ | `src/routes/(app)/reports` | 100 | 7 | 2148 | 0 | 7/0 | 0 | — |
| ✅ | `src/routes/(app)/simulation` | 100 | 2 | 1305 | 0 | 2/0 | 0 | — |
| ✅ | `src/routes/(app)/terminal` | 100 | 2 | 1043 | 0 | 2/1 | 0 | ⬜notest |
| ✅ | `src/routes/api/agent` | 100 | 1 | 453 | 1 | 1/1 | 0 | — |
| ✅ | `src/routes/api/analysis` | 100 | 1 | 240 | 1 | 1/1 | 0 | — |
| ✅ | `src/routes/api/analyze-file` | 100 | 1 | 295 | 1 | 1/1 | 0 | — |
| ✅ | `src/routes/api/analyze-tag` | 100 | 1 | 185 | 1 | 1/1 | 0 | — |
| ✅ | `src/routes/api/chat` | 100 | 7 | 1334 | 7 | 7/7 | 0 | — |
| ✅ | `src/routes/api/citations` | 100 | 10 | 1739 | 10 | 10/10 | 0 | — |
| ✅ | `src/routes/api/contextual` | 100 | 4 | 708 | 4 | 4/4 | 0 | — |
| ✅ | `src/routes/api/conversations` | 100 | 1 | 141 | 1 | 1/1 | 0 | — |
| ✅ | `src/routes/api/courtroom` | 100 | 1 | 153 | 1 | 1/1 | 0 | — |
| ✅ | `src/routes/api/documents` | 100 | 3 | 342 | 3 | 3/3 | 0 | — |
| ✅ | `src/routes/api/error-brain` | 100 | 11 | 2490 | 11 | 11/11 | 0 | — |
| ✅ | `src/routes/api/fictional-cases` | 100 | 2 | 295 | 2 | 2/2 | 0 | — |
| ✅ | `src/routes/api/generate-cluster-summaries` | 100 | 1 | 379 | 1 | 1/1 | 0 | — |
| ✅ | `src/routes/api/glossary` | 100 | 3 | 526 | 3 | 3/3 | 0 | — |
| ✅ | `src/routes/api/glyph` | 100 | 3 | 487 | 3 | 3/3 | 0 | — |
| ✅ | `src/routes/api/onboarding` | 100 | 1 | 120 | 1 | 1/1 | 0 | — |
| ✅ | `src/routes/api/persons` | 100 | 2 | 437 | 2 | 2/2 | 0 | — |
| ✅ | `src/routes/api/phase72` | 100 | 3 | 381 | 3 | 3/3 | 0 | — |
| ✅ | `src/routes/api/phase82` | 100 | 2 | 90 | 2 | 2/2 | 0 | — |
| ✅ | `src/routes/api/precedents` | 100 | 2 | 342 | 2 | 2/2 | 0 | — |
| ✅ | `src/routes/api/push` | 100 | 2 | 185 | 2 | 2/2 | 0 | — |
| ✅ | `src/routes/api/qlora` | 100 | 1 | 167 | 1 | 1/1 | 0 | — |
| ✅ | `src/routes/api/recommendations` | 100 | 5 | 1178 | 5 | 5/5 | 0 | — |
| ✅ | `src/routes/api/search` | 100 | 6 | 1359 | 6 | 6/6 | 0 | — |
| ✅ | `src/routes/api/simulation` | 100 | 4 | 1098 | 4 | 4/4 | 0 | — |
| ✅ | `src/routes/api/sse` | 100 | 2 | 2783 | 2 | 2/2 | 0 | — |
| ✅ | `src/routes/api/statutes` | 100 | 4 | 585 | 4 | 4/4 | 0 | — |
| ✅ | `src/routes/api/sync` | 100 | 1 | 49 | 1 | 1/1 | 0 | — |
| ✅ | `src/routes/api/tasks` | 100 | 2 | 204 | 2 | 2/2 | 0 | — |
| ✅ | `src/routes/login` | 100 | 3 | 462 | 0 | 1/2 | 0 | — |
| ✅ | `src/types` | 100 | 23 | 890 | 0 | 0/1 | 0 | — |
| ✅ | `tests/routes` | 100 | 30 | 48178 | 2 | 600/9 | 0 | — |

---

## API Routes (623 total · top 60)

| Route [params] | Methods | Auth | Zod | Error handling |
|----------------|---------|------|-----|----------------|
| `api/admin/audit/+server.ts` | GET, POST, PUT, PATCH, DELETE | ✅ | ✅ | ✅ |
| `api/cases/+server.ts` | GET, POST, PATCH, DELETE | ✅ | ✅ | ✅ |
| `api/cases/[id]/connections/+server.ts [id]` | GET, POST, PATCH, DELETE | ✅ | ✅ | ❌ |
| `api/citations/+server.ts` | GET, POST, PATCH, DELETE | ✅ | ✅ | ✅ |
| `api/error-brain/diagnosis-history/+server.ts` | GET, POST, PATCH, DELETE | ✅ | ✅ | ✅ |
| `api/reports/+server.ts` | GET, POST, PATCH, DELETE | ✅ | ✅ | ✅ |
| `api/analytics/codebase-research/+server.ts` | GET, POST, DELETE | ✅ | ✅ | ✅ |
| `api/analytics/deep-research/+server.ts` | GET, POST, DELETE | ✅ | ✅ | ✅ |
| `api/analytics/generate-todos/+server.ts` | POST, GET, PATCH | ✅ | ✅ | ✅ |
| `api/analytics/mapreduce-matrix/+server.ts` | GET, POST, DELETE | ✅ | ✅ | ✅ |
| `api/analytics/unified-research/+server.ts` | GET, POST, DELETE | ✅ | ✅ | ✅ |
| `api/cache/+server.ts` | GET, POST, DELETE | ✅ | ✅ | ✅ |
| `api/cache/som/+server.ts` | GET, POST, PUT | ✅ | ✅ | ✅ |
| `api/cases/[id]/+server.ts [id]` | GET, PATCH, DELETE | ✅ | ✅ | ✅ |
| `api/cases/[id]/authorities/+server.ts [id]` | GET, POST, DELETE | ✅ | ✅ | ✅ |
| `api/cases/[id]/citations/+server.ts [id]` | GET, POST, DELETE | ✅ | ✅ | ✅ |
| `api/cases/[id]/notes/[noteId]/+server.ts [id, noteId]` | GET, PATCH, DELETE | ✅ | ✅ | ✅ |
| `api/cases/[id]/notes/[noteId]/evidence/+server.ts [id, noteId]` | GET, POST, DELETE | ✅ | ✅ | ✅ |
| `api/cases/[id]/persons/+server.ts [id]` | GET, POST, DELETE | ✅ | ✅ | ✅ |
| `api/chat/memory/settings/+server.ts` | GET, DELETE, PATCH | ✅ | ✅ | ✅ |
| `api/citations/collections/[collectionId]/+server.ts [collectionId]` | GET, DELETE, PATCH | ✅ | ✅ | ✅ |
| `api/citations/collections/[collectionId]/citations/+server.ts [collectionId]` | POST, DELETE, GET | ✅ | ✅ | ✅ |
| `api/citations/saved/+server.ts` | GET, POST, DELETE | ✅ | ✅ | ✅ |
| `api/citations/[citationId]/tags/+server.ts [citationId]` | GET, POST, DELETE | ✅ | ✅ | ✅ |
| `api/codebase-index/cluster-summary/+server.ts` | POST, GET, PUT | ✅ | ✅ | ✅ |
| `api/codebase-index/llm-output/+server.ts` | GET, POST, DELETE | ✅ | ✅ | ✅ |
| `api/evidence/[id]/+server.ts [id]` | GET, PATCH, DELETE | ✅ | ✅ | ✅ |
| `api/fictional-cases/[id]/+server.ts [id]` | GET, PATCH, DELETE | ✅ | ✅ | ✅ |
| `api/glyph/tile-atlas/+server.ts` | GET, POST, DELETE | ✅ | ✅ | ✅ |
| `api/gpu/lease/+server.ts` | GET, POST, DELETE | ✅ | ✅ | ✅ |
| `api/graph/hypergraph/+server.ts` | GET, POST, DELETE | ✅ | ❌ | ✅ |
| `api/health/ocr/+server.ts` | GET, POST, HEAD | ❌ | ✅ | ✅ |
| `api/knowledge/+server.ts` | POST, GET, PATCH | ✅ | ✅ | ✅ |
| `api/library/documents/[documentId]/+server.ts [documentId]` | GET, PUT, DELETE | ✅ | ✅ | ❌ |
| `api/persons-of-interest/[id]/+server.ts [id]` | GET, PATCH, DELETE | ✅ | ✅ | ✅ |
| `api/persons-of-interest/[id]/photos/+server.ts [id]` | GET, POST, DELETE | ✅ | ✅ | ✅ |
| `api/push/+server.ts` | GET, POST, DELETE | ✅ | ✅ | ✅ |
| `api/simulation/[sessionId]/+server.ts [sessionId]` | GET, POST, DELETE | ✅ | ✅ | ✅ |
| `api/statutes/[id]/+server.ts [id]` | GET, PUT, DELETE | ✅ | ✅ | ✅ |
| `api/wiki/watch/+server.ts` | GET, POST, DELETE | ✅ | ❌ | ❌ |
| `(app)/admin/api-testing/agentic-loop/+server.ts` | POST, GET | ✅ | ✅ | ✅ |
| `(app)/evidence/+server.ts` | GET, POST | ✅ | ✅ | ✅ |
| `api/admin/model/validate-checkpoint/+server.ts` | POST, GET | ✅ | ✅ | ✅ |
| `api/admin/qlora/+server.ts` | GET, POST | ✅ | ✅ | ✅ |
| `api/admin/seed-knowledge/+server.ts` | POST, GET | ✅ | ✅ | ✅ |
| `api/agent/investigate/+server.ts` | POST, GET | ✅ | ✅ | ✅ |
| `api/analytics/context-timeline/+server.ts` | GET, POST | ✅ | ✅ | ✅ |
| `api/analytics/events/+server.ts` | POST, GET | ✅ | ✅ | ✅ |
| `api/analytics/feedback/+server.ts` | POST, GET | ✅ | ✅ | ✅ |
| `api/analytics/qlora-dataset/+server.ts` | POST, GET | ✅ | ✅ | ✅ |
| `api/analytics/research-graph/+server.ts` | GET, POST | ✅ | ✅ | ✅ |
| `api/analytics/research-index/+server.ts` | GET, POST | ✅ | ✅ | ✅ |
| `api/analytics/research-summaries/+server.ts` | GET, POST | ✅ | ✅ | ✅ |
| `api/analytics/research-summaries/[id]/+server.ts [id]` | GET, DELETE | ✅ | ❌ | ✅ |
| `api/analytics/research-topics/+server.ts` | GET, POST | ✅ | ✅ | ✅ |
| `api/analytics/web-research/+server.ts` | GET, POST | ✅ | ✅ | ✅ |
| `api/audit/gpu/+server.ts` | POST, GET | ✅ | ✅ | ✅ |
| `api/audit/planner/+server.ts` | POST, GET | ✅ | ✅ | ✅ |
| `api/auth/demo-login/+server.ts` | POST, GET | ✅ | ✅ | ✅ |
| `api/auth/logout/+server.ts` | POST, GET | ❌ | ❌ | ✅ |

_…and 563 more. See `codebase-graph.json` for full list._

---

## G4 — API Routes Missing Auth Guard (32)
- `src/routes/.well-known/agent.json/+server.ts` · GET
- `src/routes/.well-known/appspecific/com.chrome.devtools.json/+server.ts` · GET
- `src/routes/.well-known/llms-full.txt/+server.ts` · GET
- `src/routes/.well-known/llms.txt/+server.ts` · GET
- `src/routes/api/analytics/health/+server.ts` · GET
- `src/routes/api/auth/health/+server.ts` · GET
- `src/routes/api/auth/login/+server.ts` · POST
- `src/routes/api/auth/logout/+server.ts` · POST/GET
- `src/routes/api/auth/register/+server.ts` · POST
- `src/routes/api/auth/reset-password/+server.ts` · POST
- `src/routes/api/auth/session/+server.ts` · GET
- `src/routes/api/db/health/+server.ts` · GET
- `src/routes/api/docs/+server.ts` · GET
- `src/routes/api/health/+server.ts` · GET
- `src/routes/api/health/capabilities/+server.ts` · GET
- `src/routes/api/health/circuit-breakers/+server.ts` · GET
- `src/routes/api/health/database/+server.ts` · GET
- `src/routes/api/health/gpu/+server.ts` · GET
- `src/routes/api/health/neo4j/+server.ts` · GET
- `src/routes/api/health/ocr/+server.ts` · GET/POST/HEAD
- `src/routes/api/health/ollama/+server.ts` · GET
- `src/routes/api/health/ready/+server.ts` · GET
- `src/routes/api/health/redis/+server.ts` · GET
- `src/routes/api/health/redis-pool/+server.ts` · GET
- `src/routes/api/health/services/+server.ts` · GET
- `src/routes/api/health/status/+server.ts` · GET
- `src/routes/api/health/system/+server.ts` · GET
- `src/routes/api/infrastructure/status/+server.ts` · GET
- `src/routes/api/ping/+server.ts` · GET
- `src/routes/api/system/env/+server.ts` · GET

---

## G5 — API Routes Missing Zod Validation (4)
- `src/routes/api/code-intel/claude-plan/+server.ts` · POST
- `src/routes/api/codebase-index/karpathy-hook/+server.ts` · POST
- `src/routes/api/research/encode/+server.ts` · POST
- `src/routes/api/trace/subagents/run/+server.ts` · POST

---

## G14 — Svelte 4 Legacy Patterns (0 files)
_No Svelte 4 patterns found. ✅_

---

## G15 — SSR-Unsafe Globals (1 files · unguarded window/document/localStorage)
- `src/lib/shims/os-browser-shim.js`

---

## G16 — Routes Without Test Pairing (13)
- `src/routes/api/code-intel/clusters/[clusterKey]/+server.ts` · GET
- `src/routes/api/code-intel/clusters/[clusterKey]/lenses/+server.ts` · GET
- `src/routes/api/code-intel/graph/impact/+server.ts` · GET
- `src/routes/api/code-intel/latest-index/+server.ts` · GET
- `src/routes/api/code-intel/memory-gain/+server.ts` · GET
- `src/routes/api/code-intel/memory-gain/rejected/+server.ts` · GET
- `src/routes/api/code-intel/research-memory/+server.ts` · GET
- `src/routes/api/code-intel/research-provenance/[id]/+server.ts` · GET
- `src/routes/api/code-intel/retrieval-runs/+server.ts` · GET
- `src/routes/api/code-intel/retrieval-runs/[id]/+server.ts` · GET
- `src/routes/api/code-intel/topology/node/[stableKey]/+server.ts` · GET
- `src/routes/api/code-intel/wiki-status/+server.ts` · GET
- `src/routes/api/graph/topology-neighbors/+server.ts` · GET

---

## G11 — Hardcoded Localhost References (56 files)
- `src/lib/ai/model-ids.ts` · http://127.0.0.1:8070, http://127.0.0.1:8085
- `src/lib/ai/ollama-config.ts` · http://localhost:11434
- `src/lib/components/ai/EnhancedLegalAIChatWithSynthesis.svelte` · http://localhost:11434, http://localhost:11434
- `src/lib/components/ai/LLMSelector.svelte` · http://localhost:11434, http://localhost:11434
- `src/lib/components/HeadlessTypingListener.svelte` · http://localhost:3001
- `src/lib/components/SearchBox.svelte` · http://localhost:8096
- `src/lib/components/yorha/YoRHaAIChat.svelte` · http://localhost:11434, http://localhost:8093
- `src/lib/config/mcp-context7-registration.json` · http://localhost:8095
- `src/lib/config/pgvector-gpu-config.js` · http://localhost:11436, http://localhost:8097
- `src/lib/gpu/runtime-optimizations.ts` · http://localhost:8098, http://localhost:8097
- `src/lib/machines/userTypingStateMachine.ts` · http://localhost:3001
- `src/lib/server/agent/tools/web-search-searxng.ts` · http://localhost:8888
- `src/lib/server/ai/gemma4-tool-controller.ts` · http://localhost:8788
- `src/lib/server/ai/llama-tool-definitions.ts` · http://127.0.0.1:8090
- `src/lib/server/chrrom/patterns.ts` · http://localhost:8094, http://localhost:5174
- `src/lib/server/clients/ollama.ts` · http://localhost:11434
- `src/lib/server/config.ts` · http://localhost:4000, http://localhost:8000
- `src/lib/server/db/mirror-query.ts` · http://localhost:9000
- `src/lib/server/docling.ts` · http://localhost:8085
- `src/lib/server/endpoints.ts` · http://localhost:8094

---

## G18 — Deep Route Paths (parameterised, sorted by depth)

| Route [params] | Depth | Params | Methods |
|----------------|-------|--------|---------|
| `api/cases/[id]/notes/[noteId]/evidence/+server.ts` | 8 | `[id] [noteId]` | GET, POST, DELETE |
| `api/cases/[id]/notes/[noteId]/versions/+server.ts` | 8 | `[id] [noteId]` | GET |
| `api/library/document/[id]/node/[nodeId]/+server.ts` | 8 | `[id] [nodeId]` | GET |
| `(app)/admin/phase78/routes/[routePath]/+page.server.ts` | 7 | `[routePath]` |  |
| `(app)/cases/[id]/evidence/upload/+page.server.ts` | 7 | `[id]` |  |
| `(app)/command-center/codebase/clusters/[id]/+page.server.ts` | 7 | `[id]` |  |
| `(app)/command-center/codebase/components/[id]/+page.server.ts` | 7 | `[id]` |  |
| `(app)/library/[documentId]/node/[nodeId]/+page.server.ts` | 7 | `[documentId] [nodeId]` |  |
| `api/cases/[id]/analyze/stream/+server.ts` | 7 | `[id]` | POST |
| `api/cases/[id]/export/pdf/+server.ts` | 7 | `[id]` | POST |
| `api/cases/[id]/notes/search/+server.ts` | 7 | `[id]` | GET |
| `api/cases/[id]/notes/[noteId]/+server.ts` | 7 | `[id] [noteId]` | GET, PATCH, DELETE |
| `api/citations/collections/[collectionId]/citations/+server.ts` | 7 | `[collectionId]` | POST, DELETE, GET |
| `api/citations/collections/[collectionId]/export/+server.ts` | 7 | `[collectionId]` | GET, POST |
| `api/code-intel/clusters/[clusterKey]/lenses/+server.ts` | 7 | `[clusterKey]` | GET |
| `api/code-intel/topology/node/[stableKey]/+server.ts` | 7 | `[stableKey]` | GET |
| `api/codebase/clusters/[id]/summary/+server.ts` | 7 | `[id]` | GET |
| `api/evidence/summary/[id]/approve/+server.ts` | 7 | `[id]` | POST |
| `api/library/document/[id]/toc/+server.ts` | 7 | `[id]` | GET |
| `api/library/documents/[documentId]/chunks/+server.ts` | 7 | `[documentId]` | GET |
| `api/library/documents/[documentId]/pdf/+server.ts` | 7 | `[documentId]` | GET |
| `api/library/documents/[documentId]/summary/+server.ts` | 7 | `[documentId]` | GET |
| `api/library/documents/[documentId]/toc/+server.ts` | 7 | `[documentId]` | GET |
| `api/persons-of-interest/[id]/associates/[associateId]/+server.ts` | 7 | `[id] [associateId]` | DELETE |
| `api/phase89/node/[id]/docs/+server.ts` | 7 | `[id]` | GET |
| `api/phase89/node/[id]/similar/+server.ts` | 7 | `[id]` | GET |
| `api/routes/[routeId]/error-brain-patch/[patchId]/+server.ts` | 7 | `[routeId] [patchId]` | PUT |
| `(app)/admin/codebase-index/[fileId]/+page.server.ts` | 6 | `[fileId]` |  |
| `(app)/cases/[id]/ai/+page.server.ts` | 6 | `[id]` |  |
| `(app)/cases/[id]/board/+page.server.ts` | 6 | `[id]` |  |

---

## G19 — Top Module Fan-In (most imported `$lib` paths)
| Module | Import Count |
|--------|-------------|
| `$lib/server/db/client` | 528 |
| `$lib/server/env.server.js` | 328 |
| `$lib/components/ui/Icon.svelte` | 252 |
| `$lib/server/redis.js` | 228 |
| `$lib/server/ollama.js` | 168 |
| `$lib/server/db/schema-postgres.js` | 144 |
| `$lib/server/middleware/cache-headers.js` | 113 |
| `$lib/server/validation.js` | 93 |
| `$lib/components/ui/Button.svelte` | 88 |
| `$lib/server/grpc/embedding-client.js` | 83 |
| `$lib/server/vector/qdrant-manager.js` | 73 |
| `$lib/server/db/schema` | 57 |
| `$lib/server/observability/langfuse.js` | 45 |
| `$lib/server/gpu/simdjson-bridge.js` | 40 |
| `$lib/server/analytics/search-analytics.js` | 36 |
| `$lib/server/db/schema-postgres` | 34 |
| `$lib/server/ace/chat-memory.js` | 33 |
| `$lib/server/gpu/libtorch-bridge.js` | 32 |
| `$lib/server/ai/code-intel-service.js` | 31 |
| `$lib/server/ace/context-assembler.js` | 30 |

---

## G20 — Cyclic Import Pairs (0 found · top 20)
_No cyclic imports detected. ✅_

---

## Svelte Components (60 shown of 863)
| File | Sub-components | Key `$lib` Imports |
|------|---------------|---------------------|
| `src/lib/client/ui/POIPhotoModal.svelte` | POIPhotoModalImpl | $lib/components/POIPhotoModal.svelte |
| `src/lib/client/ui/POIPhotoUploader.svelte` | Button |  |
| `src/lib/components/ActionPopup.svelte` |  |  |
| `src/lib/components/admin/BundlePreview.svelte` | BundleResponse |  |
| `src/lib/components/admin/EvidenceDataGrid.svelte` |  |  |
| `src/lib/components/admin/EvidenceDrawer.svelte` |  |  |
| `src/lib/components/admin/PipelineProgress.svelte` |  |  |
| `src/lib/components/admin/TagSelector.svelte` |  |  |
| `src/lib/components/agent/AutonomousInvestigator.svelte` | InvestigationResult, AgentCapabilities, Icon, Button | $lib/components/ui/Icon.svelte, $lib/components/ui/Button.svelte |
| `src/lib/components/agentic/AgentChat.svelte` |  | $lib/types/agent.js |
| `src/lib/components/agentic/AgenticController.svelte` | AgenticStatus, File |  |
| `src/lib/components/ai/ACEContextBubble.svelte` |  |  |
| `src/lib/components/ai/AIAssistantButton.svelte` | Badge | $lib/components/ui/badge/Badge.svelte, $lib/utils |
| `src/lib/components/ai/AIAssistantPanel.svelte` | Button | $lib/components/ui/Button.svelte, $lib/stores/unified/ai-assistant-store.svelte.js |
| `src/lib/components/ai/AIButton.svelte` | HTMLButtonElement |  |
| `src/lib/components/ai/AIChatWidget.svelte` | Button, Icon, SimpleWorkingChat | $lib/components/ui/Button.svelte, $lib/components/ui/Icon.svelte |
| `src/lib/components/ai/AIRecommendation.svelte` | Icon | $lib/ai/client-cache.js, $lib/components/ui/Icon.svelte |
| `src/lib/components/ai/AIStatusIndicator.svelte` |  |  |
| `src/lib/components/ai/AskAI.svelte` | HTMLTextAreaElement, HTMLDivElement |  |
| `src/lib/components/ai/AuditResults.svelte` | Icon, Button | $lib/components/ui/Icon.svelte, $lib/components/ui/Button.svelte |
| `src/lib/components/ai/AutomatedLegalResearch.svelte` |  |  |
| `src/lib/components/ai/CachePerformanceDashboard.svelte` |  |  |
| `src/lib/components/ai/CaseScoringDashboard/CaseScoringDashboard.svelte` |  |  |
| `src/lib/components/ai/CaseScoringDashboard.svelte` | Icon | $lib/components/ui/Icon.svelte |
| `src/lib/components/ai/ChatFeedback.svelte` | Icon | $lib/components/ui/Icon.svelte |
| `src/lib/components/ai/ChatMessage.svelte` | HTMLDivElement, FeedbackButtons, Button | $lib/components/ui/Button.svelte, $lib/components/ui/FeedbackButtons.svelte |
| `src/lib/components/ai/ClientSideAIChat.svelte` | Badge |  |
| `src/lib/components/ai/ContextualChatDemo.svelte` | ContextualState | $lib/types/sharedTypes |
| `src/lib/components/ai/ContextualEvidenceChatModal.svelte` | File, FeedbackButtons | $lib/types/sharedTypes, $lib/components/ui/FeedbackButtons.svelte |
| `src/lib/components/ai/DeedAnalysis.svelte` | Icon | $lib/components/ui/Icon.svelte |
| `src/lib/components/ai/DocumentUploadSimulator.svelte` | Icon, Button | $lib/components/ui/Icon.svelte, $lib/components/ui/Button.svelte |
| `src/lib/components/ai/EnhancedAIChatTest.svelte` | DialogRoot, Button, DialogOverlay, DialogContent | $lib/types, $lib/types, $lib/components/ui/dialog |
| `src/lib/components/ai/EnhancedDocumentUploader.svelte` | UploadFile, HTMLInputElement, HTMLDivElement, Progress | $lib/components/ui/Button.svelte, $lib/components/ui/Progress.svelte |
| `src/lib/components/ai/EnhancedFileUpload.svelte` | WebSocket | $lib/types, $lib/machines/uploadMachine, $lib/types/upload |
| `src/lib/components/ai/EnhancedInlineEditor.svelte` | HTMLDivElement |  |
| `src/lib/components/ai/EnhancedLegalAIChatWithSynthesis.svelte` | Date, Button, TypewriterResponse | $lib/components/ui/Button.svelte, $lib/components/ui/Icon.svelte |
| `src/lib/components/ai/FloatingChatModal.svelte` | File, HTMLElement | $lib/models/ChatSession.svelte.js |
| `src/lib/components/ai/GamingAIButton.svelte` |  | $lib/components/ui/Icon.svelte |
| `src/lib/components/ai/Gemma270MWebAssembly.svelte` | File, Float32Array | $lib/ai/client-embed.js, $lib/ai/onnx/session.js, $lib/ai/client-cache.js |
| `src/lib/components/ai/GPUAIAssistant.svelte` | Icon, Button | $lib/components/ui/Icon.svelte, $lib/components/ui/Button.svelte |
| `src/lib/components/ai/IntelligentModelOrchestrator.svelte` |  |  |
| `src/lib/components/ai/LegalDocumentDrafting.svelte` | DocCategory, Icon, Button | $lib/components/ui/Icon.svelte, $lib/components/ui/Button.svelte |
| `src/lib/components/ai/LegalDocumentSummarizer.svelte` | SummarizationResponse, Button | $lib/components/ui/card/Card.svelte, $lib/components/ui/card/CardHeader.svelte, $lib/components/ui/card/CardTitle.svelte |
| `src/lib/components/ai/LLMSelector.svelte` | Icon, Button | $lib/components/ui/Icon.svelte, $lib/components/ui/Button.svelte |
| `src/lib/components/ai/LocalImageGenerator.svelte` | ImageResult, Icon, Button | $lib/components/ui/Icon.svelte, $lib/components/ui/Button.svelte |
| `src/lib/components/ai/ProactiveAIAssistant.svelte` | Icon | $lib/components/ui/Icon.svelte |
| `src/lib/components/ai/QLoRAMonitoringDashboard.svelte` | TrainingStatus, Icon, Button | $lib/components/ui/Icon.svelte, $lib/components/ui/Button.svelte |
| `src/lib/components/ai/RAGAssistantChat.svelte` | HTMLDivElement, Icon | $lib/components/ui/Icon.svelte, $lib/utils |
| `src/lib/components/ai/RAGPipelineChart.svelte` |  |  |
| `src/lib/components/ai/RecommendationEngine.svelte` | Recommendation |  |
| `src/lib/components/ai/SimpleWorkingChat.svelte` | ChatSession, CommandFeedback, Icon, TypewriterResponse | $lib/models/ChatSession.svelte.js, $lib/components/ai/TypewriterResponse.svelte, $lib/components/ai/ChatFeedback.svelte |
| `src/lib/components/ai/SmartSearchInterface.svelte` | Icon, Button | $lib/components/ui/Icon.svelte, $lib/components/ui/Button.svelte |
| `src/lib/components/ai/ThinkingStyleToggle.svelte` | Button, Icon | $lib/components/ui/Icon.svelte, $lib/components/ui/Button.svelte |
| `src/lib/components/ai/TypewriterResponse.svelte` |  |  |
| `src/lib/components/ai/VectorIntelligenceDemo.svelte` | SearchMetrics, SearchResult |  |
| `src/lib/components/ai/YorhaAIAssistant.svelte` | HTMLElement, WebSocket, AbortController, Button | $lib/components/ui/Button.svelte |
| `src/lib/components/AIChatAssistant.svelte` |  |  |
| `src/lib/components/analysis/AnalysisPanel.svelte` | Icon | $lib/components/ui/Icon.svelte, $lib/stores/analysis-panel.svelte.js, $lib/stores/analysis-panel.svelte.js |
| `src/lib/components/analysis/AnalysisToast.svelte` | Icon | $lib/components/ui/Icon.svelte |
| `src/lib/components/analysis/KeyboardShortcutsHelp.svelte` | Icon | $lib/components/ui/Icon.svelte |

---

## Top External Module Imports
| Module | Consumer Count |
|--------|----------------|
| `vitest` | 731 |
| `@sveltejs/kit` | 700 |
| `zod` | 489 |
| `$lib/server/db/client` | 400 |
| `drizzle-orm` | 322 |
| `$lib/server/env.server.js` | 297 |
| `$lib/components/ui/Icon.svelte` | 252 |
| `svelte` | 226 |
| `$lib/server/redis.js` | 153 |
| `$lib/server/ollama.js` | 144 |
| `$lib/server/db/schema-postgres.js` | 126 |
| `$lib/server/middleware/cache-headers.js` | 112 |
| `@playwright/test` | 102 |
| `path` | 100 |
| `$lib/server/validation.js` | 93 |
| `$lib/components/ui/Button.svelte` | 88 |
| `crypto` | 86 |
| `$app/environment` | 79 |
| `drizzle-orm/pg-core` | 73 |
| `$app/navigation` | 63 |
| `fs` | 55 |
| `svelte/transition` | 53 |
| `$lib/server/grpc/embedding-client.js` | 46 |
| `$lib/server/observability/langfuse.js` | 44 |
| `$lib/server/db/schema` | 44 |
| `bits-ui` | 41 |
| `$lib/server/vector/qdrant-manager.js` | 38 |
| `$lib/server/analytics/search-analytics.js` | 36 |
| `ioredis` | 35 |
| `$lib/server/db/schema-postgres` | 34 |

---

## Directories with TODO/FIXME
- `src/lib` — 9 marker(s), score 100
- `src/routes` — 7 marker(s), score 93
- `src/lib/components` — 6 marker(s), score 80
- `src/routes/(app)` — 6 marker(s), score 100
- `src/routes/(app)/admin` — 4 marker(s), score 100
- `src/lib/components/ui` — 3 marker(s), score 75
- `src/lib/workers` — 2 marker(s), score 83
- `src/lib/ai` — 1 marker(s), score 78
- `src/lib/components/yorha` — 1 marker(s), score 78
- `src/lib/ai/onnx` — 1 marker(s), score 83
- `src/routes/(app)/chat` — 1 marker(s), score 83
- `src/routes/(app)/demos` — 1 marker(s), score 88
- `src/routes/api/synthesis` — 1 marker(s), score 91

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
