# Codebase Map — 20-Gate Deep Audit
> Generated: 2026-05-13T18:24:17.858Z
> Mode: `fast-ast` · CPU-only · No GPU required
> Regenerate: `npm run index:codebase:fast:plan`

---

## Summary
| Metric | Count |
|--------|-------|
| Files scanned | 4961 |
| Directories analysed | 451 |
| Route files | 1011 |
| Svelte components | 884 |
| API handlers | 703 |
| API routes without auth | 9 |
| API routes without Zod | 0 |
| SSR-unsafe files | 0 |
| Svelte 4 legacy patterns | 0 |
| Hardcoded localhost refs | 127 |
| Routes without test pairing | 2 |
| Cyclic import pairs | 0 |
| Drizzle table refs | 473 |
| TODO/FIXME markers | 49 |

---

## 20-Gate Audit Summary

| Gate | Check | Pass | Fail |
|------|-------|------|------|
| G4  | Auth guard on API routes | 773 | 0 |
| G5  | Zod validation on API routes | 536 | 0 |
| G11 | No hardcoded localhost (excl env.server) | 4834 | 127 |
| G14a | No `export let` (Svelte 4 props) | 4961 | 0 |
| G14b | No `$:` reactive declarations | 4961 | 0 |
| G14c | No `on:event=` directives | 4961 | 0 |
| G14d | No `createEventDispatcher()` | 4961 | 0 |
| G14e | No runes in plain `.ts` files | 4951 | 10 |
| G15 | No SSR-unsafe globals (unguarded) | 4961 | 0 |
| G16 | Server routes have test pairing | 712 | 2 |
| G17 | Server routes have error handling | 686 | 96 |
| G20 | Cyclic import pairs | — | 0 |

---

## Directory Scorecard (451 dirs · lowest score = most attention needed)

**Score factors**: Auth/API coverage 25pts · Zod coverage 15pts · Drizzle ref 10pts · No TODOs 15pts · SSR-safe 10pts · No Svelte4 10pts · No localhost 5pts · Error handling 5pts · Non-empty 5pts

**Flags**: 🔴ssr = SSR-unsafe globals · 🟡sv4 = Svelte4 legacy · 🟠lh = localhost hardcoded · ⬜notest = routes lack tests


| Status | Directory | Score | Files | Lines | APIs | Auth/Zod | TODOs | Flags |
|--------|-----------|-------|-------|-------|------|----------|-------|-------|
| ⚠️ | `src/routes/.well-known/agent.json` | 45 | 1 | 119 | 1 | 0/0 | 0 | — |
| ⚠️ | `src/routes/.well-known/appspecific` | 45 | 1 | 22 | 1 | 0/0 | 0 | — |
| ⚠️ | `scripts/phase104-backups/src/routes` | 45 | 2 | 301 | 2 | 0/0 | 0 | 🟠lh |
| ⚠️ | `scripts/phase104-backups/src/routes_parked` | 48 | 13 | 3874 | 11 | 1/4 | 3 | 🟠lh |
| ⚠️ | `src/lib/server/middleware` | 58 | 4 | 693 | 2 | 0/1 | 0 | — |
| ⚠️ | `src/routes/.well-known/llms-full.txt` | 65 | 1 | 103 | 1 | 0/1 | 0 | — |
| ⚠️ | `src/routes/.well-known/llms.txt` | 65 | 1 | 262 | 1 | 0/1 | 0 | — |
| ✅ | `src/routes/api/metrics` | 70 | 1 | 84 | 1 | 1/0 | 0 | — |
| ✅ | `src/routes/api/ping` | 70 | 1 | 14 | 1 | 1/0 | 0 | — |
| ✅ | `src/routes/api/queue` | 70 | 1 | 27 | 1 | 1/0 | 0 | — |
| ✅ | `src/lib/components/ui` | 75 | 245 | 24174 | 0 | 0/1 | 3 | — |
| ✅ | `src/routes/api/couchdb` | 75 | 1 | 69 | 1 | 1/0 | 0 | — |
| ✅ | `src/routes/api/ingest-constitution` | 75 | 1 | 47 | 1 | 1/0 | 0 | — |
| ✅ | `src/routes/api/observability` | 75 | 1 | 35 | 1 | 1/0 | 0 | — |
| ✅ | `src/routes/api/security` | 75 | 1 | 45 | 1 | 1/0 | 0 | — |
| ✅ | `src/routes/minio/[...path]` | 75 | 1 | 57 | 1 | 1/0 | 0 | — |
| ✅ | `src/routes/api/code-intel` | 79 | 21 | 553 | 21 | 21/5 | 0 | — |
| ✅ | `src/lib/components` | 80 | 56 | 174412 | 0 | 0/47 | 6 | 🟠lh |
| ✅ | `src/routes/api/auth` | 80 | 10 | 759 | 10 | 5/5 | 0 | — |
| ✅ | `src/routes/api/topology` | 80 | 3 | 267 | 3 | 3/1 | 0 | — |
| ✅ | `scripts/phase104-backups/src/lib` | 80 | 381 | 37143 | 0 | 9/91 | 32 | 🟠lh |
| ✅ | `src/lib/ai` | 83 | 15 | 5178 | 0 | 0/1 | 1 | — |
| ✅ | `src/lib/ai/onnx` | 83 | 2 | 340 | 0 | 0/0 | 1 | — |
| ✅ | `src/lib/components/yorha` | 83 | 72 | 20756 | 0 | 0/5 | 1 | — |
| ✅ | `src/lib/workers` | 83 | 8 | 1737 | 0 | 0/1 | 2 | — |
| ✅ | `src/routes/api/codebase-graph` | 83 | 2 | 317 | 2 | 2/1 | 0 | — |
| ✅ | `src/routes/api/comfyui` | 83 | 2 | 74 | 2 | 2/1 | 0 | — |
| ✅ | `src/routes/api/health` | 83 | 17 | 1967 | 17 | 17/3 | 0 | 🟠lh |
| ✅ | `src/routes/api/phase89` | 83 | 24 | 2425 | 24 | 24/13 | 0 | — |
| ✅ | `src/routes/api/cache` | 84 | 14 | 1427 | 14 | 14/8 | 0 | — |
| ✅ | `src/routes/api/wiki` | 84 | 8 | 481 | 8 | 8/5 | 0 | — |
| ✅ | `src/lib/components/ai` | 85 | 46 | 19723 | 0 | 0/11 | 0 | 🟠lh |
| ✅ | `src/lib/utils` | 85 | 44 | 7273 | 0 | 2/7 | 0 | 🟠lh |
| ✅ | `src/routes/(app)/couchdb-analytics` | 85 | 5 | 1833 | 0 | 5/0 | 0 | 🟠lh |
| ✅ | `src/routes/api/consolidation` | 85 | 1 | 42 | 1 | 1/0 | 0 | — |
| ✅ | `src/routes/api/dashboard` | 85 | 1 | 111 | 1 | 1/0 | 0 | — |
| ✅ | `src/routes/api/db` | 85 | 1 | 30 | 1 | 1/0 | 0 | — |
| ✅ | `src/routes/api/dev` | 85 | 1 | 63 | 1 | 1/0 | 0 | — |
| ✅ | `src/routes/api/docs` | 85 | 1 | 57 | 1 | 1/1 | 0 | — |
| ✅ | `src/routes/api/engagement` | 85 | 2 | 75 | 2 | 2/2 | 0 | — |
| ✅ | `src/routes/api/infrastructure` | 85 | 1 | 339 | 1 | 1/0 | 0 | — |
| ✅ | `scripts/diagnose` | 85 | 2 | 379 | 0 | 0/0 | 0 | 🟠lh |
| ✅ | `scripts/diagnostics` | 85 | 4 | 323 | 0 | 0/2 | 0 | 🟠lh |
| ✅ | `scripts/mcp` | 85 | 10 | 2489 | 0 | 0/4 | 0 | 🟠lh |
| ✅ | `scripts/tools` | 85 | 2 | 126 | 0 | 0/0 | 0 | 🟠lh |
| ✅ | `tests/e2e` | 85 | 28 | 8644 | 0 | 10/3 | 0 | 🟠lh |
| ✅ | `tests/e2e/route-forensic` | 85 | 31 | 1744 | 0 | 4/0 | 0 | 🟠lh |
| ✅ | `tests/e2e/route-forensic/fixtures` | 85 | 3 | 226 | 0 | 1/0 | 0 | 🟠lh |
| ✅ | `tests/e2e/route-forensic/helpers` | 85 | 1 | 100 | 0 | 0/0 | 0 | 🟠lh |
| ✅ | `tests/fixtures` | 85 | 2 | 89 | 0 | 1/0 | 0 | 🟠lh |
| ✅ | `tests/helpers` | 85 | 3 | 353 | 0 | 1/1 | 0 | 🟠lh |
| ✅ | `tests/scripts` | 85 | 3 | 104 | 0 | 0/0 | 0 | 🟠lh |
| ✅ | `src/routes/api/hypergraph` | 86 | 4 | 312 | 4 | 4/3 | 0 | — |
| ✅ | `src/routes/api/knowledge` | 86 | 8 | 1697 | 8 | 8/6 | 0 | — |
| ✅ | `src/routes/api/test` | 86 | 8 | 791 | 8 | 8/6 | 0 | — |
| ✅ | `src/routes/(app)/demos` | 88 | 104 | 19979 | 0 | 104/5 | 1 | 🟠lh ⬜notest |
| ✅ | `src/routes/api/cartridge` | 88 | 6 | 669 | 6 | 6/5 | 0 | — |
| ✅ | `src/routes/api/system` | 88 | 6 | 715 | 6 | 6/1 | 0 | — |
| ✅ | `src/lib/ai/e2b` | 90 | 2 | 524 | 0 | 0/0 | 0 | — |
| ✅ | `src/lib/cache` | 90 | 5 | 1046 | 0 | 0/1 | 0 | — |
| ✅ | `src/lib/client` | 90 | 6 | 1019 | 0 | 0/4 | 0 | — |
| ✅ | `src/lib/client/db` | 90 | 1 | 91 | 0 | 0/0 | 0 | — |
| ✅ | `src/lib/client/ui` | 90 | 2 | 184 | 0 | 0/0 | 0 | — |
| ✅ | `src/lib/collaboration` | 90 | 1 | 267 | 0 | 0/1 | 0 | — |
| ✅ | `src/lib/components/admin` | 90 | 11 | 4086 | 0 | 0/2 | 0 | — |
| ✅ | `src/lib/components/agent` | 90 | 1 | 392 | 0 | 0/0 | 0 | — |
| ✅ | `src/lib/components/agentic` | 90 | 2 | 514 | 0 | 0/0 | 0 | — |
| ✅ | `src/lib/components/analysis` | 90 | 3 | 2809 | 0 | 0/1 | 0 | — |
| ✅ | `src/lib/components/analytics` | 90 | 2 | 1163 | 0 | 0/1 | 0 | — |
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
| ✅ | `src/lib/components/dashboard` | 90 | 15 | 3190 | 0 | 0/0 | 0 | — |
| ✅ | `src/lib/components/demos` | 90 | 1 | 359 | 0 | 0/0 | 0 | — |
| ✅ | `src/lib/components/detective` | 90 | 6 | 1884 | 0 | 0/2 | 0 | — |
| ✅ | `src/lib/components/document` | 90 | 1 | 401 | 0 | 0/0 | 0 | — |
| ✅ | `src/lib/components/editor` | 90 | 7 | 2398 | 0 | 0/0 | 0 | — |
| ✅ | `src/lib/components/editors` | 90 | 1 | 55 | 0 | 0/0 | 0 | — |
| ✅ | `src/lib/components/evidence` | 90 | 44 | 16451 | 0 | 0/6 | 0 | — |
| ✅ | `src/lib/components/forms` | 90 | 7 | 4163 | 0 | 0/2 | 0 | — |
| ✅ | `src/lib/components/glyph` | 90 | 1 | 784 | 0 | 0/0 | 0 | — |
| ✅ | `src/lib/components/graph` | 90 | 3 | 2287 | 0 | 0/0 | 0 | — |
| ✅ | `src/lib/components/intent` | 90 | 1 | 75 | 0 | 0/0 | 0 | — |
| ✅ | `src/lib/components/layout` | 90 | 1 | 399 | 0 | 0/0 | 0 | — |
| ✅ | `src/lib/components/legal` | 90 | 33 | 11235 | 0 | 0/5 | 0 | — |
| ✅ | `src/lib/components/legal-ai` | 90 | 18 | 7563 | 0 | 0/0 | 0 | — |
| ✅ | `src/lib/components/legal-corpus` | 90 | 8 | 2918 | 0 | 0/0 | 0 | — |
| ✅ | `src/lib/components/library` | 90 | 1 | 70 | 0 | 0/0 | 0 | — |
| ✅ | `src/lib/components/modals` | 90 | 2 | 1074 | 0 | 0/0 | 0 | — |
| ✅ | `src/lib/components/monitoring` | 90 | 3 | 843 | 0 | 0/0 | 0 | — |
| ✅ | `src/lib/components/nes` | 90 | 1 | 185 | 0 | 0/0 | 0 | — |
| ✅ | `src/lib/components/onboarding` | 90 | 1 | 1050 | 0 | 0/0 | 0 | — |
| ✅ | `src/lib/components/phase78` | 90 | 4 | 776 | 0 | 0/0 | 0 | — |
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
| ✅ | `src/lib/components/webgpu` | 90 | 2 | 492 | 0 | 0/0 | 0 | — |
| ✅ | `src/lib/config` | 90 | 8 | 1506 | 0 | 1/1 | 0 | — |
| ✅ | `src/lib/courtroom` | 90 | 4 | 1560 | 0 | 0/0 | 0 | — |
| ✅ | `src/lib/env` | 90 | 2 | 27 | 0 | 0/0 | 0 | — |
| ✅ | `src/lib/features/evidence-command-center` | 90 | 5 | 419 | 0 | 0/0 | 0 | — |
| ✅ | `src/lib/features/poi` | 90 | 1 | 124 | 0 | 0/0 | 0 | — |
| ✅ | `src/lib/gpu` | 90 | 17 | 4873 | 0 | 0/2 | 0 | — |
| ✅ | `src/lib/graph` | 90 | 1 | 54 | 0 | 0/0 | 0 | — |
| ✅ | `src/lib/icons/yorha` | 90 | 15 | 572 | 0 | 0/0 | 0 | — |
| ✅ | `src/lib/machines` | 90 | 11 | 4069 | 0 | 0/1 | 0 | — |
| ✅ | `src/lib/messaging` | 90 | 1 | 168 | 0 | 0/0 | 0 | — |
| ✅ | `src/lib/models` | 90 | 1 | 1389 | 0 | 0/1 | 0 | — |
| ✅ | `src/lib/phase72` | 90 | 1 | 148 | 0 | 0/1 | 0 | — |
| ✅ | `src/lib/schemas` | 90 | 5 | 1049 | 0 | 0/5 | 0 | — |
| ✅ | `src/lib/schemas/tools` | 90 | 8 | 486 | 0 | 0/0 | 0 | — |
| ✅ | `src/lib/server/acp` | 90 | 2 | 807 | 0 | 0/1 | 0 | — |
| ✅ | `src/lib/server/agents-md` | 90 | 3 | 439 | 0 | 0/2 | 0 | — |
| ✅ | `src/lib/server/api` | 90 | 1 | 195 | 0 | 0/0 | 0 | — |
| ✅ | `src/lib/server/ast` | 90 | 1 | 313 | 0 | 0/0 | 0 | — |
| ✅ | `src/lib/server/atlas` | 90 | 4 | 1002 | 0 | 0/4 | 0 | — |
| ✅ | `src/lib/server/auth` | 90 | 1 | 41 | 0 | 0/0 | 0 | — |
| ✅ | `src/lib/server/cache` | 90 | 14 | 4545 | 0 | 0/9 | 0 | — |
| ✅ | `src/lib/server/cartridge` | 90 | 5 | 1614 | 0 | 0/2 | 0 | — |
| ✅ | `src/lib/server/chrrom` | 90 | 3 | 408 | 0 | 0/0 | 0 | — |
| ✅ | `src/lib/server/clients` | 90 | 1 | 8 | 0 | 0/0 | 0 | — |
| ✅ | `src/lib/server/comfyui` | 90 | 1 | 238 | 0 | 0/1 | 0 | — |
| ✅ | `src/lib/server/config` | 90 | 6 | 750 | 0 | 0/1 | 0 | — |
| ✅ | `src/lib/server/connections` | 90 | 1 | 347 | 0 | 0/0 | 0 | — |
| ✅ | `src/lib/server/couchdb` | 90 | 3 | 524 | 0 | 0/0 | 0 | — |
| ✅ | `src/lib/server/data` | 90 | 2 | 459 | 0 | 0/0 | 0 | — |
| ✅ | `src/lib/server/env` | 90 | 1 | 10 | 0 | 0/0 | 0 | — |
| ✅ | `src/lib/server/ff1` | 90 | 9 | 1821 | 0 | 0/5 | 0 | — |
| ✅ | `src/lib/server/fixer` | 90 | 1 | 329 | 0 | 0/1 | 0 | — |
| ✅ | `src/lib/server/glyph` | 90 | 2 | 170 | 0 | 0/0 | 0 | — |
| ✅ | `src/lib/server/grpc` | 90 | 10 | 4341 | 0 | 0/4 | 0 | — |
| ✅ | `src/lib/server/helpers` | 90 | 2 | 334 | 0 | 0/1 | 0 | — |
| ✅ | `src/lib/server/hypergraph` | 90 | 5 | 969 | 0 | 0/0 | 0 | — |
| ✅ | `src/lib/server/image` | 90 | 1 | 88 | 0 | 0/0 | 0 | — |
| ✅ | `src/lib/server/inference` | 90 | 4 | 2102 | 0 | 0/4 | 0 | — |
| ✅ | `src/lib/server/init` | 90 | 1 | 105 | 0 | 0/0 | 0 | — |
| ✅ | `src/lib/server/integrations` | 90 | 1 | 279 | 0 | 0/0 | 0 | — |
| ✅ | `src/lib/server/kag` | 90 | 1 | 67 | 0 | 0/1 | 0 | — |
| ✅ | `src/lib/server/langextract` | 90 | 3 | 566 | 0 | 0/1 | 0 | — |
| ✅ | `src/lib/server/mcp` | 90 | 5 | 863 | 0 | 0/1 | 0 | — |
| ✅ | `src/lib/server/memory` | 90 | 1 | 154 | 0 | 0/0 | 0 | — |
| ✅ | `src/lib/server/minio` | 90 | 2 | 314 | 0 | 0/0 | 0 | — |
| ✅ | `src/lib/server/nlp` | 90 | 1 | 140 | 0 | 0/1 | 0 | — |
| ✅ | `src/lib/server/notifications` | 90 | 1 | 210 | 0 | 0/0 | 0 | — |
| ✅ | `src/lib/server/observability` | 90 | 3 | 1042 | 0 | 0/0 | 0 | — |
| ✅ | `src/lib/server/obsidian` | 90 | 2 | 384 | 0 | 0/0 | 0 | — |
| ✅ | `src/lib/server/ocr` | 90 | 3 | 551 | 0 | 0/0 | 0 | — |
| ✅ | `src/lib/server/optimize` | 90 | 1 | 42 | 0 | 0/0 | 0 | — |
| ✅ | `src/lib/server/orchestrators` | 90 | 1 | 39 | 0 | 0/0 | 0 | — |
| ✅ | `src/lib/server/pdf` | 90 | 2 | 314 | 0 | 0/0 | 0 | — |
| ✅ | `src/lib/server/pgai` | 90 | 3 | 69 | 0 | 0/0 | 0 | — |
| ✅ | `src/lib/server/phase72` | 90 | 3 | 185 | 0 | 0/0 | 0 | — |
| ✅ | `src/lib/server/phase78` | 90 | 1 | 402 | 0 | 0/0 | 0 | — |
| ✅ | `src/lib/server/pipeline` | 90 | 1 | 211 | 0 | 0/0 | 0 | — |
| ✅ | `src/lib/server/rag` | 90 | 7 | 535 | 0 | 0/1 | 0 | — |
| ✅ | `src/lib/server/rate-limit` | 90 | 2 | 318 | 0 | 0/0 | 0 | — |
| ✅ | `src/lib/server/reconstruction` | 90 | 5 | 1090 | 0 | 0/4 | 0 | — |
| ✅ | `src/lib/server/redis` | 90 | 1 | 26 | 0 | 0/0 | 0 | — |
| ✅ | `src/lib/server/rg-atlas` | 90 | 9 | 706 | 0 | 0/3 | 0 | — |
| ✅ | `src/lib/server/routing` | 90 | 1 | 203 | 0 | 0/1 | 0 | — |
| ✅ | `src/lib/server/search` | 90 | 13 | 2279 | 0 | 0/2 | 0 | — |
| ✅ | `src/lib/server/security` | 90 | 1 | 131 | 0 | 0/0 | 0 | — |
| ✅ | `src/lib/server/simulation` | 90 | 2 | 477 | 0 | 0/1 | 0 | — |
| ✅ | `src/lib/server/startup` | 90 | 1 | 114 | 0 | 0/0 | 0 | — |
| ✅ | `src/lib/server/storage` | 90 | 2 | 568 | 0 | 0/0 | 0 | — |
| ✅ | `src/lib/server/streaming` | 90 | 2 | 364 | 0 | 0/1 | 0 | — |
| ✅ | `src/lib/server/tools` | 90 | 9 | 1508 | 0 | 0/3 | 0 | — |
| ✅ | `src/lib/server/topology` | 90 | 1 | 329 | 0 | 0/0 | 0 | — |
| ✅ | `src/lib/server/training` | 90 | 1 | 111 | 0 | 0/0 | 0 | — |
| ✅ | `src/lib/server/utils` | 90 | 13 | 926 | 0 | 0/2 | 0 | — |
| ✅ | `src/lib/server/validation` | 90 | 2 | 402 | 0 | 0/1 | 0 | — |
| ✅ | `src/lib/services` | 90 | 5 | 701 | 0 | 0/0 | 0 | — |
| ✅ | `src/lib/shared` | 90 | 3 | 284 | 0 | 0/1 | 0 | — |
| ✅ | `src/lib/shared/schemas` | 90 | 1 | 32 | 0 | 0/0 | 0 | — |
| ✅ | `src/lib/shared/types` | 90 | 1 | 14 | 0 | 0/0 | 0 | — |
| ✅ | `src/lib/stores` | 90 | 17 | 5101 | 0 | 0/6 | 0 | — |
| ✅ | `src/lib/stores/dashboard` | 90 | 3 | 654 | 0 | 0/1 | 0 | — |
| ✅ | `src/lib/stores/unified` | 90 | 7 | 1328 | 0 | 0/1 | 0 | — |
| ✅ | `src/lib/test-utils` | 90 | 1 | 11 | 0 | 0/0 | 0 | — |
| ✅ | `src/lib/webgpu` | 90 | 20 | 5784 | 0 | 0/0 | 0 | — |
| ✅ | `src/mcp/tools` | 90 | 8 | 2321 | 0 | 0/7 | 0 | — |
| ✅ | `src/mcp/zod-to-json-schema-bridge` | 90 | 2 | 93 | 0 | 0/1 | 0 | — |
| ✅ | `src/routes/(admin)/error-brain` | 90 | 2 | 484 | 0 | 2/0 | 0 | — |
| ✅ | `src/routes/(analysis)` | 90 | 4 | 3236 | 0 | 8/0 | 0 | ⬜notest |
| ✅ | `src/routes/(analysis)/audio-analysis` | 90 | 3 | 985 | 0 | 2/0 | 0 | ⬜notest |
| ✅ | `src/routes/(analysis)/document-analysis` | 90 | 3 | 990 | 0 | 2/0 | 0 | ⬜notest |
| ✅ | `src/routes/(analysis)/video-analysis` | 90 | 3 | 1103 | 0 | 2/0 | 0 | ⬜notest |
| ✅ | `src/routes/(analysis)@/audio-analysis` | 90 | 1 | 782 | 0 | 0/0 | 0 | — |
| ✅ | `src/routes/(analysis)@/document-analysis` | 90 | 1 | 746 | 0 | 0/0 | 0 | — |
| ✅ | `src/routes/(analysis)@/video-analysis` | 90 | 1 | 943 | 0 | 0/0 | 0 | — |
| ✅ | `src/routes/(app)/ai-dashboard` | 90 | 1 | 6 | 0 | 1/0 | 0 | ⬜notest |
| ✅ | `src/routes/(app)/all-routes` | 90 | 1 | 6 | 0 | 1/0 | 0 | ⬜notest |
| ✅ | `src/routes/(app)/analytics` | 90 | 2 | 2388 | 0 | 2/0 | 0 | — |
| ✅ | `src/routes/(app)/cache-monitor` | 90 | 1 | 146 | 0 | 1/0 | 0 | — |
| ✅ | `src/routes/(app)/chat` | 90 | 4 | 873 | 0 | 4/1 | 0 | ⬜notest |
| ✅ | `src/routes/(app)/citations` | 90 | 10 | 2393 | 0 | 10/0 | 0 | ⬜notest |
| ✅ | `src/routes/(app)/code-intel` | 90 | 17 | 2964 | 0 | 17/0 | 0 | ⬜notest |
| ✅ | `src/routes/(app)/codebase-graph` | 90 | 5 | 995 | 0 | 5/1 | 0 | ⬜notest |
| ✅ | `src/routes/(app)/codebase-wiki` | 90 | 1 | 25 | 0 | 1/0 | 0 | — |
| ✅ | `src/routes/(app)/error-brain` | 90 | 1 | 6 | 0 | 1/0 | 0 | ⬜notest |
| ✅ | `src/routes/(app)/fictional-cases` | 90 | 4 | 1011 | 0 | 4/0 | 0 | ⬜notest |
| ✅ | `src/routes/(app)/global-search` | 90 | 1 | 2392 | 0 | 1/0 | 0 | — |
| ✅ | `src/routes/(app)/gpu-evidence-graph` | 90 | 1 | 6 | 0 | 1/0 | 0 | ⬜notest |
| ✅ | `src/routes/(app)/indexing` | 90 | 1 | 960 | 0 | 1/0 | 0 | — |
| ✅ | `src/routes/(app)/knowledge` | 90 | 1 | 575 | 0 | 1/0 | 0 | — |
| ✅ | `src/routes/(app)/legal-corpus-premium` | 90 | 1 | 1155 | 0 | 1/0 | 0 | — |
| ✅ | `src/routes/(app)/library` | 90 | 13 | 4516 | 0 | 13/0 | 0 | ⬜notest |
| ✅ | `src/routes/(app)/rag-search` | 90 | 2 | 376 | 0 | 2/0 | 0 | — |
| ✅ | `src/routes/(app)/recommendations` | 90 | 2 | 734 | 0 | 2/0 | 0 | — |
| ✅ | `src/routes/(app)/system-configuration` | 90 | 1 | 838 | 0 | 1/1 | 0 | — |
| ✅ | `src/routes/(app)/webgpu-similarity` | 90 | 1 | 12 | 0 | 1/0 | 0 | — |
| ✅ | `src/routes/(dev)/cache-demo` | 90 | 1 | 261 | 0 | 0/0 | 0 | — |
| ✅ | `src/routes/(dev)/demo` | 90 | 3 | 538 | 0 | 0/1 | 0 | — |
| ✅ | `src/routes/(dev)/intent-chat` | 90 | 1 | 146 | 0 | 0/0 | 0 | — |
| ✅ | `src/routes/(dev)/odin` | 90 | 2 | 323 | 0 | 1/0 | 0 | ⬜notest |
| ✅ | `src/routes/(dev)/test-source-validation` | 90 | 1 | 381 | 0 | 0/0 | 0 | — |
| ✅ | `src/routes/(dev)/tts-demo` | 90 | 2 | 84 | 0 | 0/0 | 0 | — |
| ✅ | `src/routes/(dev)/voice-chat-demo` | 90 | 2 | 329 | 0 | 0/0 | 0 | — |
| ✅ | `src/routes/api/acp` | 90 | 2 | 114 | 2 | 2/2 | 0 | — |
| ✅ | `src/routes/api/agents` | 90 | 1 | 295 | 1 | 1/1 | 0 | — |
| ✅ | `src/routes/api/audit` | 90 | 2 | 200 | 2 | 2/2 | 0 | — |
| ✅ | `src/routes/api/browser-context` | 90 | 1 | 116 | 1 | 1/1 | 0 | — |
| ✅ | `src/routes/api/case-theory` | 90 | 1 | 170 | 1 | 1/1 | 0 | — |
| ✅ | `src/routes/api/charges` | 90 | 1 | 45 | 1 | 1/1 | 0 | — |
| ✅ | `src/routes/api/chrrom` | 90 | 3 | 169 | 3 | 3/3 | 0 | — |
| ✅ | `src/routes/api/collaboration` | 90 | 1 | 56 | 1 | 1/1 | 0 | — |
| ✅ | `src/routes/api/detective` | 90 | 2 | 434 | 2 | 2/2 | 0 | — |
| ✅ | `src/routes/api/embed` | 90 | 1 | 125 | 1 | 1/1 | 0 | — |
| ✅ | `src/routes/api/feedback` | 90 | 1 | 41 | 1 | 1/1 | 0 | — |
| ✅ | `src/routes/api/gpu` | 90 | 3 | 277 | 3 | 3/3 | 0 | — |
| ✅ | `src/routes/api/gpu-wasm-integration` | 90 | 1 | 288 | 1 | 1/1 | 0 | — |
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
| ✅ | `src/routes/api/reconstruction` | 90 | 2 | 198 | 2 | 2/2 | 0 | — |
| ✅ | `src/routes/api/research` | 90 | 7 | 938 | 7 | 7/7 | 0 | — |
| ✅ | `src/routes/api/rg-atlas` | 90 | 1 | 44 | 1 | 1/1 | 0 | — |
| ✅ | `src/routes/api/route-operations` | 90 | 1 | 49 | 1 | 1/1 | 0 | — |
| ✅ | `src/routes/api/summarize` | 90 | 3 | 217 | 3 | 3/3 | 0 | — |
| ✅ | `src/routes/api/tags` | 90 | 3 | 151 | 3 | 3/1 | 0 | — |
| ✅ | `src/routes/api/tools` | 90 | 4 | 296 | 4 | 4/4 | 0 | — |
| ✅ | `src/routes/api/trace` | 90 | 1 | 35 | 1 | 1/1 | 0 | — |
| ✅ | `src/routes/api/user` | 90 | 1 | 91 | 1 | 1/1 | 0 | — |
| ✅ | `src/routes/api/vector-search` | 90 | 1 | 110 | 1 | 1/1 | 0 | — |
| ✅ | `src/routes/api/video` | 90 | 1 | 105 | 1 | 1/1 | 0 | — |
| ✅ | `src/routes/api/vision` | 90 | 1 | 233 | 1 | 1/1 | 0 | — |
| ✅ | `src/routes/api/web` | 90 | 2 | 181 | 2 | 2/2 | 0 | — |
| ✅ | `src/routes/api/websearch` | 90 | 1 | 63 | 1 | 1/1 | 0 | — |
| ✅ | `src/routes/api/whisper` | 90 | 1 | 370 | 1 | 1/1 | 0 | — |
| ✅ | `src/routes/api/worker` | 90 | 1 | 186 | 1 | 1/1 | 0 | — |
| ✅ | `src/routes/api/workflow-events` | 90 | 1 | 133 | 1 | 1/1 | 0 | — |
| ✅ | `src/stores` | 90 | 1 | 47 | 0 | 0/0 | 0 | — |
| ✅ | `src/tests` | 90 | 1 | 10 | 0 | 0/0 | 0 | — |
| ✅ | `src/wasm` | 90 | 2 | 524 | 0 | 0/0 | 0 | — |
| ✅ | `src/workers` | 90 | 3 | 241 | 0 | 0/0 | 0 | — |
| ✅ | `scripts/activity` | 90 | 1 | 72 | 0 | 0/0 | 0 | — |
| ✅ | `scripts/agents` | 90 | 5 | 1472 | 0 | 0/3 | 0 | — |
| ✅ | `scripts/backup-consolidation` | 90 | 17 | 4382 | 0 | 0/10 | 0 | — |
| ✅ | `scripts/backup-consolidation/tests` | 90 | 4 | 999 | 0 | 0/0 | 0 | — |
| ✅ | `scripts/comfyui` | 90 | 2 | 282 | 0 | 0/1 | 0 | — |
| ✅ | `scripts/comfyui/workflows` | 90 | 2 | 84 | 0 | 0/0 | 0 | — |
| ✅ | `scripts/dev` | 90 | 1 | 140 | 0 | 0/0 | 0 | — |
| ✅ | `scripts/diff` | 90 | 3 | 721 | 0 | 0/2 | 0 | — |
| ✅ | `scripts/features` | 90 | 2 | 172 | 0 | 0/1 | 0 | — |
| ✅ | `scripts/health` | 90 | 1 | 237 | 0 | 0/0 | 0 | — |
| ✅ | `scripts/qdrant` | 90 | 1 | 179 | 0 | 0/0 | 0 | — |
| ✅ | `scripts/reconstruction` | 90 | 4 | 439 | 0 | 0/1 | 0 | — |
| ✅ | `scripts/rg-atlas` | 90 | 2 | 103 | 0 | 0/0 | 0 | — |
| ✅ | `scripts/skills` | 90 | 1 | 510 | 0 | 0/1 | 0 | — |
| ✅ | `scripts/synth` | 90 | 3 | 929 | 0 | 0/2 | 0 | — |
| ✅ | `scripts/tests/nes-arch` | 90 | 2 | 187 | 0 | 0/1 | 0 | — |
| ✅ | `scripts/tests/probes` | 90 | 3 | 88 | 0 | 0/0 | 0 | — |
| ✅ | `scripts/tests/screenshots/langgraph-subagents` | 90 | 1 | 1 | 0 | 0/0 | 0 | — |
| ✅ | `scripts/turboquant` | 90 | 3 | 568 | 0 | 0/2 | 0 | — |
| ✅ | `scripts/wiki` | 90 | 11 | 2964 | 0 | 0/6 | 0 | — |
| ✅ | `scripts/__fixtures__` | 90 | 1 | 28 | 0 | 0/1 | 0 | — |
| ✅ | `tests/accessibility` | 90 | 2 | 557 | 0 | 0/0 | 0 | — |
| ✅ | `tests/e2e/utils` | 90 | 3 | 505 | 0 | 0/0 | 0 | — |
| ✅ | `tests/intent` | 90 | 2 | 472 | 0 | 0/1 | 0 | — |
| ✅ | `tests/mapreduce` | 90 | 1 | 217 | 0 | 0/0 | 0 | — |
| ✅ | `tests/reports` | 90 | 2 | 64 | 0 | 0/0 | 0 | — |
| ✅ | `tests/routes/api/ai` | 90 | 1 | 126 | 0 | 1/0 | 0 | — |
| ✅ | `tests/routes/auto/.well-known` | 90 | 4 | 228 | 0 | 4/0 | 0 | — |
| ✅ | `tests/routes/auto/admin` | 90 | 3 | 203 | 0 | 3/0 | 0 | — |
| ✅ | `tests/routes/auto/app` | 90 | 1 | 44 | 0 | 1/0 | 0 | — |
| ✅ | `tests/routes/auto/minio` | 90 | 1 | 57 | 0 | 1/0 | 0 | — |
| ✅ | `tests/runes` | 90 | 1 | 230 | 0 | 0/0 | 0 | — |
| ✅ | `tests/setup` | 90 | 1 | 226 | 0 | 0/0 | 0 | — |
| ✅ | `tests/sw` | 90 | 1 | 97 | 0 | 0/1 | 0 | — |
| ✅ | `tests/unit` | 90 | 6 | 1248 | 0 | 0/3 | 0 | — |
| ✅ | `tests/utils` | 90 | 1 | 134 | 0 | 0/0 | 0 | — |
| ✅ | `src/routes/api/synthesis` | 91 | 7 | 1855 | 7 | 7/6 | 1 | — |
| ✅ | `src/routes/api/codeintel` | 92 | 9 | 1042 | 9 | 9/4 | 0 | — |
| ✅ | `src/routes/api/document` | 93 | 2 | 148 | 2 | 2/1 | 0 | — |
| ✅ | `src/routes/api/graph` | 93 | 19 | 2914 | 19 | 19/16 | 0 | 🟠lh |
| ✅ | `src/routes/api/internal` | 93 | 2 | 114 | 2 | 2/1 | 0 | — |
| ✅ | `src/routes/api/stream` | 93 | 2 | 102 | 2 | 2/1 | 0 | — |
| ✅ | `src/routes/api/library` | 94 | 21 | 2864 | 21 | 21/12 | 0 | — |
| ✅ | `src/routes/api/admin` | 95 | 32 | 3357 | 32 | 32/22 | 0 | — |
| ✅ | `src/routes/api/errors` | 95 | 3 | 253 | 3 | 3/2 | 0 | — |
| ✅ | `scripts/graph` | 95 | 10 | 2608 | 0 | 1/7 | 0 | 🟠lh |
| ✅ | `scripts/smoke` | 95 | 16 | 2749 | 0 | 0/9 | 0 | 🟠lh |
| ✅ | `scripts/startup` | 95 | 2 | 449 | 0 | 0/1 | 0 | 🟠lh |
| ✅ | `scripts/tests` | 95 | 57 | 12995 | 0 | 4/17 | 0 | 🟠lh |
| ✅ | `src/routes/api/audio` | 96 | 4 | 520 | 4 | 4/3 | 0 | — |
| ✅ | `src/routes/api/canon` | 96 | 4 | 574 | 4 | 4/3 | 0 | — |
| ✅ | `src/routes/api/evidence` | 96 | 32 | 6237 | 32 | 32/24 | 0 | — |
| ✅ | `src/routes/api/persons-of-interest` | 96 | 14 | 2737 | 14 | 14/10 | 0 | — |
| ✅ | `src/routes/api/phase78` | 96 | 4 | 198 | 4 | 4/3 | 0 | — |
| ✅ | `src/routes/api/yorha` | 96 | 4 | 510 | 4 | 4/3 | 0 | — |
| ✅ | `src/routes/api/ace` | 98 | 9 | 1822 | 9 | 9/8 | 0 | — |
| ✅ | `src/routes/api/analytics` | 98 | 30 | 4156 | 30 | 30/25 | 0 | ⬜notest |
| ✅ | `src/routes/api/cases` | 98 | 25 | 4737 | 25 | 25/21 | 0 | — |
| ✅ | `src/routes/api/codebase` | 98 | 12 | 1912 | 12 | 12/10 | 0 | — |
| ✅ | `src/routes/api/codebase-index` | 98 | 47 | 13254 | 46 | 46/39 | 0 | — |
| ✅ | `src/routes/api/reports` | 98 | 9 | 2311 | 9 | 9/8 | 0 | — |
| ✅ | `src/routes/api/routes` | 98 | 9 | 1005 | 9 | 9/8 | 0 | — |
| ✅ | `src/routes/api/ai` | 99 | 33 | 3467 | 33 | 33/31 | 0 | — |
| ✅ | `src/routes/api/rag` | 99 | 11 | 2493 | 10 | 10/9 | 0 | — |
| ✅ | `src/routes/api/v1` | 99 | 19 | 1584 | 19 | 19/18 | 0 | — |
| ✅ | `src/lib` | 100 | 11 | 428905 | 3 | 13/305 | 9 | 🟠lh |
| ✅ | `src/lib/data` | 100 | 5 | 1682 | 0 | 0/0 | 0 | — |
| ✅ | `src/lib/db` | 100 | 4 | 2892 | 0 | 0/1 | 0 | — |
| ✅ | `src/lib/db/queries` | 100 | 2 | 881 | 0 | 0/0 | 0 | — |
| ✅ | `src/lib/db/schema` | 100 | 6 | 890 | 0 | 0/0 | 0 | — |
| ✅ | `src/lib/intent` | 100 | 1 | 137 | 0 | 0/0 | 0 | — |
| ✅ | `src/lib/server` | 100 | 63 | 195527 | 3 | 10/214 | 0 | — |
| ✅ | `src/lib/server/ace` | 100 | 38 | 14218 | 0 | 0/18 | 0 | — |
| ✅ | `src/lib/server/adapters` | 100 | 1 | 650 | 0 | 0/1 | 0 | — |
| ✅ | `src/lib/server/admin` | 100 | 8 | 1064 | 0 | 0/5 | 0 | — |
| ✅ | `src/lib/server/agent` | 100 | 10 | 3931 | 0 | 0/7 | 0 | — |
| ✅ | `src/lib/server/agents` | 100 | 23 | 3285 | 0 | 0/7 | 0 | — |
| ✅ | `src/lib/server/ai` | 100 | 80 | 17885 | 0 | 3/23 | 0 | — |
| ✅ | `src/lib/server/analysis` | 100 | 14 | 3344 | 0 | 0/6 | 0 | — |
| ✅ | `src/lib/server/analytics` | 100 | 15 | 6771 | 0 | 0/10 | 0 | — |
| ✅ | `src/lib/server/audit` | 100 | 4 | 1415 | 0 | 0/1 | 0 | — |
| ✅ | `src/lib/server/cases` | 100 | 1 | 189 | 0 | 0/0 | 0 | — |
| ✅ | `src/lib/server/codeintel` | 100 | 1 | 498 | 0 | 0/1 | 0 | — |
| ✅ | `src/lib/server/concurrency` | 100 | 3 | 741 | 0 | 0/1 | 0 | — |
| ✅ | `src/lib/server/db` | 100 | 122 | 18876 | 0 | 0/4 | 0 | — |
| ✅ | `src/lib/server/embedding` | 100 | 9 | 1122 | 0 | 0/1 | 0 | — |
| ✅ | `src/lib/server/engagement` | 100 | 1 | 367 | 0 | 0/0 | 0 | — |
| ✅ | `src/lib/server/error-brain` | 100 | 11 | 1158 | 0 | 1/2 | 0 | — |
| ✅ | `src/lib/server/evidence` | 100 | 15 | 1230 | 0 | 0/2 | 0 | — |
| ✅ | `src/lib/server/features` | 100 | 8 | 926 | 0 | 0/1 | 0 | — |
| ✅ | `src/lib/server/gpu` | 100 | 17 | 5379 | 0 | 0/3 | 0 | — |
| ✅ | `src/lib/server/graph` | 100 | 23 | 9984 | 0 | 1/7 | 0 | — |
| ✅ | `src/lib/server/indexer` | 100 | 26 | 7329 | 1 | 0/5 | 0 | — |
| ✅ | `src/lib/server/kb` | 100 | 9 | 1569 | 0 | 0/5 | 0 | — |
| ✅ | `src/lib/server/legal` | 100 | 9 | 2766 | 0 | 0/0 | 0 | — |
| ✅ | `src/lib/server/llm` | 100 | 6 | 1643 | 0 | 0/2 | 0 | — |
| ✅ | `src/lib/server/ml` | 100 | 8 | 2974 | 0 | 0/0 | 0 | — |
| ✅ | `src/lib/server/queue` | 100 | 8 | 4061 | 0 | 0/3 | 0 | — |
| ✅ | `src/lib/server/reports` | 100 | 1 | 112 | 0 | 0/1 | 0 | — |
| ✅ | `src/lib/server/research` | 100 | 16 | 1604 | 0 | 0/3 | 0 | — |
| ✅ | `src/lib/server/retrieval` | 100 | 37 | 8304 | 0 | 0/6 | 0 | — |
| ✅ | `src/lib/server/services` | 100 | 33 | 9962 | 0 | 0/3 | 0 | — |
| ✅ | `src/lib/server/tensor` | 100 | 2 | 461 | 0 | 0/1 | 0 | — |
| ✅ | `src/lib/server/trace` | 100 | 1 | 344 | 0 | 0/0 | 0 | — |
| ✅ | `src/lib/server/types` | 100 | 11 | 1204 | 0 | 0/0 | 0 | — |
| ✅ | `src/lib/server/unified` | 100 | 1 | 284 | 0 | 0/0 | 0 | — |
| ✅ | `src/lib/server/vector` | 100 | 14 | 3629 | 0 | 0/2 | 0 | — |
| ✅ | `src/lib/server/wiki` | 100 | 9 | 2153 | 0 | 0/1 | 0 | — |
| ✅ | `src/lib/server/workers` | 100 | 5 | 1771 | 0 | 0/4 | 0 | — |
| ✅ | `src/lib/shims` | 100 | 11 | 1235 | 0 | 0/1 | 0 | — |
| ✅ | `src/lib/types` | 100 | 53 | 7093 | 0 | 0/5 | 0 | — |
| ✅ | `src/mcp` | 100 | 14 | 14086 | 0 | 1/19 | 0 | — |
| ✅ | `src/routes` | 100 | 6 | 221517 | 680 | 1106/565 | 2 | 🟠lh ⬜notest |
| ✅ | `src/routes/(app)` | 100 | 2 | 108036 | 4 | 424/44 | 1 | 🟠lh ⬜notest |
| ✅ | `src/routes/(app)/acp` | 100 | 1 | 615 | 0 | 1/1 | 0 | — |
| ✅ | `src/routes/(app)/active-cases` | 100 | 2 | 1155 | 0 | 2/0 | 0 | ⬜notest |
| ✅ | `src/routes/(app)/admin` | 100 | 140 | 28746 | 3 | 140/15 | 0 | 🟠lh ⬜notest |
| ✅ | `src/routes/(app)/analysis-center` | 100 | 4 | 1576 | 0 | 4/2 | 0 | ⬜notest |
| ✅ | `src/routes/(app)/cases` | 100 | 39 | 10602 | 0 | 39/10 | 0 | ⬜notest |
| ✅ | `src/routes/(app)/command-center` | 100 | 11 | 3456 | 0 | 11/0 | 0 | ⬜notest |
| ✅ | `src/routes/(app)/dashboard` | 100 | 2 | 2059 | 0 | 2/1 | 0 | ⬜notest |
| ✅ | `src/routes/(app)/evidence` | 100 | 17 | 3885 | 1 | 17/5 | 0 | ⬜notest |
| ✅ | `src/routes/(app)/evidence-library` | 100 | 2 | 356 | 0 | 2/0 | 0 | ⬜notest |
| ✅ | `src/routes/(app)/legal-corpus` | 100 | 6 | 3369 | 0 | 6/0 | 0 | ⬜notest |
| ✅ | `src/routes/(app)/persons-of-interest` | 100 | 7 | 3090 | 0 | 7/1 | 0 | ⬜notest |
| ✅ | `src/routes/(app)/reports` | 100 | 7 | 2151 | 0 | 7/0 | 0 | — |
| ✅ | `src/routes/(app)/simulation` | 100 | 2 | 1308 | 0 | 2/0 | 0 | — |
| ✅ | `src/routes/(app)/terminal` | 100 | 2 | 1121 | 0 | 2/1 | 0 | ⬜notest |
| ✅ | `src/routes/api/agent` | 100 | 1 | 453 | 1 | 1/1 | 0 | — |
| ✅ | `src/routes/api/analysis` | 100 | 1 | 240 | 1 | 1/1 | 0 | — |
| ✅ | `src/routes/api/analyze-file` | 100 | 1 | 295 | 1 | 1/1 | 0 | — |
| ✅ | `src/routes/api/analyze-tag` | 100 | 1 | 185 | 1 | 1/1 | 0 | — |
| ✅ | `src/routes/api/chat` | 100 | 7 | 1333 | 7 | 7/7 | 0 | — |
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
| ✅ | `src/routes/api/search` | 100 | 6 | 1394 | 6 | 6/6 | 0 | — |
| ✅ | `src/routes/api/simulation` | 100 | 4 | 1098 | 4 | 4/4 | 0 | — |
| ✅ | `src/routes/api/sse` | 100 | 2 | 2783 | 2 | 2/2 | 0 | — |
| ✅ | `src/routes/api/statutes` | 100 | 4 | 585 | 4 | 4/4 | 0 | — |
| ✅ | `src/routes/api/sync` | 100 | 1 | 49 | 1 | 1/1 | 0 | — |
| ✅ | `src/routes/api/tasks` | 100 | 2 | 204 | 2 | 2/2 | 0 | — |
| ✅ | `src/routes/login` | 100 | 3 | 462 | 0 | 1/2 | 0 | — |
| ✅ | `src/routes/register` | 100 | 3 | 627 | 0 | 1/2 | 0 | — |
| ✅ | `src/types` | 100 | 23 | 890 | 0 | 0/1 | 0 | — |
| ✅ | `scripts/kb` | 100 | 11 | 2211 | 0 | 1/7 | 0 | — |
| ✅ | `scripts/lib` | 100 | 11 | 1664 | 1 | 0/4 | 0 | 🟠lh |
| ✅ | `scripts/mapreduce` | 100 | 2 | 549 | 0 | 0/0 | 0 | — |
| ✅ | `scripts/phase104-backups/src` | 100 | 7 | 44852 | 13 | 10/97 | 36 | 🟠lh |
| ✅ | `scripts/screenshots` | 100 | 3 | 695 | 0 | 0/0 | 0 | — |
| ✅ | `scripts/validate` | 100 | 2 | 1518 | 0 | 1/1 | 0 | — |
| ✅ | `tests/routes` | 100 | 31 | 54348 | 2 | 650/9 | 0 | — |
| ✅ | `tests/routes/auto` | 100 | 1 | 44324 | 0 | 643/0 | 0 | — |
| ✅ | `tests/routes/auto/api` | 100 | 638 | 43703 | 0 | 633/0 | 0 | — |

---

## API Routes (680 total · top 60)

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
| `api/browser-context/snapshot/+server.ts` | POST, GET, DELETE | ✅ | ✅ | ✅ |
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
| `api/health/ocr/+server.ts` | GET, POST, HEAD | ✅ | ✅ | ✅ |
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
| `api/admin/weights/+server.ts` | GET, POST | ✅ | ✅ | ✅ |
| `api/agent/investigate/+server.ts` | POST, GET | ✅ | ✅ | ✅ |
| `api/analytics/context-timeline/+server.ts` | GET, POST | ✅ | ✅ | ✅ |
| `api/analytics/events/+server.ts` | POST, GET | ✅ | ✅ | ✅ |
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

_…and 620 more. See `codebase-graph.json` for full list._

---

## G4 — API Routes Missing Auth Guard (9)
- `src/routes/.well-known/agent.json/+server.ts` · GET
- `src/routes/.well-known/appspecific/com.chrome.devtools.json/+server.ts` · GET
- `src/routes/.well-known/llms-full.txt/+server.ts` · GET
- `src/routes/.well-known/llms.txt/+server.ts` · GET
- `src/routes/api/auth/login/+server.ts` · POST
- `src/routes/api/auth/logout/+server.ts` · POST/GET
- `src/routes/api/auth/register/+server.ts` · POST
- `src/routes/api/auth/reset-password/+server.ts` · POST
- `src/routes/api/auth/session/+server.ts` · GET

---

## G5 — API Routes Missing Zod Validation (0)
_All API handlers use Zod. ✅_

---

## G14 — Svelte 4 Legacy Patterns (0 files)
_No Svelte 4 patterns found. ✅_

---

## G15 — SSR-Unsafe Globals (0 files · unguarded window/document/localStorage)
_No unguarded SSR-unsafe globals. ✅_

---

## G16 — Routes Without Test Pairing (2)
- `src/routes/api/analytics/knowledge-triples/+server.ts` · GET
- `src/routes/api/analytics/knowledge-triples/prune/+server.ts` · POST

---

## G11 — Hardcoded Localhost References (127 files)
- `src/lib/components/ai/EnhancedLegalAIChatWithSynthesis.svelte` · http://localhost:11434
- `src/lib/utils/api-endpoints.ts` · http://localhost:8080, http://localhost:11434
- `src/lib/utils/simd-json-parser.ts` · http://localhost:8097
- `src/routes/(app)/admin/library/+page.svelte` · http://localhost:5173, http://localhost:5173
- `src/routes/(app)/couchdb-analytics/+page.svelte` · http://localhost:8001
- `src/routes/(app)/demos/crime-reconstruction/+page.svelte` · http://localhost:8092
- `src/routes/(app)/demos/yorha/components/YoRHaAIChat.svelte` · http://localhost:11434, http://localhost:8093
- `src/routes/api/graph/colab-export/+server.ts` · http://localhost:6333
- `src/routes/api/health/+server.ts` · http://127.0.0.1:8096, http://127.0.0.1:8096
- `scripts/agent-diagnose.mjs` · http://localhost:5173, http://localhost:5173
- `scripts/audit-parity.mjs` · http://127.0.0.1:6333
- `scripts/backfill-research-embeddings.mjs` · http://localhost:5173
- `scripts/check-all-tools.mjs` · http://127.0.0.1:5984
- `scripts/check-qdrant-counts.mjs` · http://127.0.0.1:6333
- `scripts/claude-context-plan.mjs` · http://127.0.0.1:8788, http://127.0.0.1:5173
- `scripts/cluster-summarize.ts` · http://localhost:6333, http://localhost:11434
- `scripts/deep-audit-ast.mjs` · http://localhost:8095
- `scripts/dev-everything.mjs` · http://127.0.0.1:11434, http://127.0.0.1:6333
- `scripts/diagnose/probe-tools-list-by-module.mjs` · http://localhost:0
- `scripts/diagnostics/playwright-live-recorder.mjs` · http://127.0.0.1:5173

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
| `api/evidence/[id]/analyze/stream/+server.ts` | 7 | `[id]` | GET |
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

---

## G19 — Top Module Fan-In (most imported `$lib` paths)
| Module | Import Count |
|--------|-------------|
| `$lib/server/db/client` | 574 |
| `$lib/server/env.server.js` | 466 |
| `$lib/server/redis.js` | 262 |
| `$lib/components/ui/Icon.svelte` | 257 |
| `$lib/server/ollama.js` | 183 |
| `$lib/types` | 180 |
| `$lib/server/db/schema-postgres.js` | 158 |
| `$lib/server/middleware/cache-headers.js` | 111 |
| `$lib/server/validation.js` | 95 |
| `$lib/server/grpc/embedding-client.js` | 89 |
| `$lib/components/ui/Button.svelte` | 87 |
| `$lib/server/vector/qdrant-manager.js` | 81 |
| `$lib/server/db/schema` | 61 |
| `$lib/server/observability/langfuse.js` | 48 |
| `$lib/server/db/schema-postgres` | 45 |
| `$lib/server/gpu/simdjson-bridge.js` | 40 |
| `$lib/server/gpu/libtorch-bridge.js` | 38 |
| `$lib/server/analytics/search-analytics.js` | 38 |
| `$lib/server/ace/context-assembler.js` | 33 |
| `$lib/server/ace/chat-memory.js` | 33 |

---

## G20 — Cyclic Import Pairs (0 found · top 20)
_No cyclic imports detected. ✅_

---

## Svelte Components (60 shown of 884)
| File | Sub-components | Key `$lib` Imports |
|------|---------------|---------------------|
| `src/lib/client/ui/POIPhotoModal.svelte` | POIPhotoModalImpl | $lib/components/POIPhotoModal.svelte |
| `src/lib/client/ui/POIPhotoUploader.svelte` | Button |  |
| `src/lib/components/ActionPopup.svelte` |  |  |
| `src/lib/components/admin/AdminChatAssistant.svelte` | HTMLElement | $lib/utils/xstate-svelte5.svelte.js, $lib/stores/admin-chat-machine.js |
| `src/lib/components/admin/AdminMonitoringDashboard.svelte` | Icon | $lib/components/ui/Icon.svelte |
| `src/lib/components/admin/AiAnalysisPopup.svelte` | AiAnalysisPopup | $lib/components/admin/AiAnalysisPopup.svelte, $lib/stores/admin-chat-assistant.svelte.js, $lib/stores/admin-chat-assistant.svelte.js |
| `src/lib/components/admin/BundlePreview.svelte` | BundleResponse |  |
| `src/lib/components/admin/ContextualAssistantModal.svelte` |  | $lib/utils/xstate-svelte5.svelte.js, $lib/stores/admin-chat-machine.js, $lib/utils/ui-recon.js |
| `src/lib/components/admin/EvidenceDataGrid.svelte` |  |  |
| `src/lib/components/admin/EvidenceDrawer.svelte` |  |  |
| `src/lib/components/admin/PipelineProgress.svelte` |  |  |
| `src/lib/components/admin/SummarizeButton.svelte` | SummarizeButton | $lib/stores/admin-chat-assistant.svelte.js |
| `src/lib/components/admin/TagSelector.svelte` |  |  |
| `src/lib/components/admin/TraceCopilotPanel.svelte` | HTMLDivElement |  |
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
| `src/lib/components/ai/EnhancedLegalAIChatWithSynthesis.svelte` | Date, Button, TypewriterResponse | $lib/components/ui/Button.svelte, $lib/components/ui/Icon.svelte, $lib/utils/ollama |
| `src/lib/components/ai/FloatingChatModal.svelte` | File, HTMLElement | $lib/models/ChatSession.svelte.js |
| `src/lib/components/ai/GamingAIButton.svelte` |  | $lib/components/ui/Icon.svelte |
| `src/lib/components/ai/Gemma270MWebAssembly.svelte` | File, Float32Array | $lib/ai/client-embed.js, $lib/ai/onnx/session.js, $lib/ai/client-cache.js |
| `src/lib/components/ai/GPUAIAssistant.svelte` | Icon, Button | $lib/components/ui/Icon.svelte, $lib/components/ui/Button.svelte |
| `src/lib/components/ai/IntelligentModelOrchestrator.svelte` |  |  |
| `src/lib/components/ai/LegalDocumentDrafting.svelte` | DocCategory, Icon, Button | $lib/components/ui/Icon.svelte, $lib/components/ui/Button.svelte |
| `src/lib/components/ai/LegalDocumentSummarizer.svelte` | SummarizationResponse, Button | $lib/components/ui/card/Card.svelte, $lib/components/ui/card/CardHeader.svelte, $lib/components/ui/card/CardTitle.svelte |
| `src/lib/components/ai/LLMSelector.svelte` | Icon, Button | $lib/components/ui/Icon.svelte, $lib/components/ui/Button.svelte, $lib/utils/ollama |
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

---

## Top External Module Imports
| Module | Consumer Count |
|--------|----------------|
| `vitest` | 833 |
| `@sveltejs/kit` | 782 |
| `zod` | 563 |
| `$lib/server/db/client` | 440 |
| `$lib/server/env.server.js` | 432 |
| `drizzle-orm` | 408 |
| `$lib/components/ui/Icon.svelte` | 257 |
| `node:path` | 240 |
| `svelte` | 236 |
| `path` | 200 |
| `$lib/types` | 180 |
| `$lib/server/redis.js` | 175 |
| `node:fs` | 171 |
| `$lib/server/ollama.js` | 155 |
| `@playwright/test` | 151 |
| `fs` | 142 |
| `node:url` | 142 |
| `crypto` | 141 |
| `pg` | 137 |
| `$lib/server/db/schema-postgres.js` | 137 |
| `$app/environment` | 117 |
| `$lib/server/middleware/cache-headers.js` | 110 |
| `node:crypto` | 106 |
| `ioredis` | 96 |
| `$lib/server/validation.js` | 95 |
| `drizzle-orm/pg-core` | 92 |
| `$lib/components/ui/Button.svelte` | 87 |
| `url` | 68 |
| `dotenv` | 66 |
| `$app/navigation` | 65 |

---

## Directories with TODO/FIXME
- `scripts/phase104-backups/src` — 36 marker(s), score 100
- `scripts/phase104-backups/src/lib` — 32 marker(s), score 80
- `src/lib` — 9 marker(s), score 100
- `src/lib/components` — 6 marker(s), score 80
- `scripts/phase104-backups/src/routes_parked` — 3 marker(s), score 48
- `src/lib/components/ui` — 3 marker(s), score 75
- `src/lib/workers` — 2 marker(s), score 83
- `src/routes` — 2 marker(s), score 100
- `src/lib/ai` — 1 marker(s), score 83
- `src/lib/ai/onnx` — 1 marker(s), score 83
- `src/lib/components/yorha` — 1 marker(s), score 83
- `src/routes/(app)/demos` — 1 marker(s), score 88
- `src/routes/api/synthesis` — 1 marker(s), score 91
- `src/routes/(app)` — 1 marker(s), score 100

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
