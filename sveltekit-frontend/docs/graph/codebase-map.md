# Codebase Map — 20-Gate Deep Audit
> Generated: 2026-05-12T17:13:20.251Z
> Mode: `fast-ast` · CPU-only · No GPU required
> Regenerate: `npm run index:codebase:fast:plan`

---

## Summary
| Metric | Count |
|--------|-------|
| Files scanned | 3966 |
| Directories analysed | 414 |
| Route files | 1002 |
| Svelte components | 883 |
| API handlers | 680 |
| API routes without auth | 11 |
| API routes without Zod | 0 |
| SSR-unsafe files | 2 |
| Svelte 4 legacy patterns | 0 |
| Hardcoded localhost refs | 19 |
| Routes without test pairing | 46 |
| Cyclic import pairs | 1 |
| Drizzle table refs | 465 |
| TODO/FIXME markers | 11 |

---

## 20-Gate Audit Summary

| Gate | Check | Pass | Fail |
|------|-------|------|------|
| G4  | Auth guard on API routes | 763 | 11 |
| G5  | Zod validation on API routes | 531 | 0 |
| G11 | No hardcoded localhost (excl env.server) | 3947 | 19 |
| G14a | No `export let` (Svelte 4 props) | 3966 | 0 |
| G14b | No `$:` reactive declarations | 3966 | 0 |
| G14c | No `on:event=` directives | 3966 | 0 |
| G14d | No `createEventDispatcher()` | 3966 | 0 |
| G14e | No runes in plain `.ts` files | 3966 | 0 |
| G15 | No SSR-unsafe globals (unguarded) | 3964 | 2 |
| G16 | Server routes have test pairing | 664 | 46 |
| G17 | Server routes have error handling | 679 | 95 |
| G20 | Cyclic import pairs | — | 1 |

---

## Directory Scorecard (414 dirs · lowest score = most attention needed)

**Score factors**: Auth/API coverage 25pts · Zod coverage 15pts · Drizzle ref 10pts · No TODOs 15pts · SSR-safe 10pts · No Svelte4 10pts · No localhost 5pts · Error handling 5pts · Non-empty 5pts

**Flags**: 🔴ssr = SSR-unsafe globals · 🟡sv4 = Svelte4 legacy · 🟠lh = localhost hardcoded · ⬜notest = routes lack tests

**Cluster**: dominant hypergraph k-means cluster (from `hypergraph-clusters.json`) — `C<id>: <inferredTopic>`. Run `npm run hypergraph:digest` to refresh.

| Status | Directory | Score | Files | Lines | APIs | Auth/Zod | TODOs | Flags | Cluster |
|--------|-----------|-------|-------|-------|------|----------|-------|-------|---------|
| ⚠️ | `src/routes/.well-known/agent.json` | 45 | 1 | 119 | 1 | 0/0 | 0 | — | — |
| ⚠️ | `src/routes/.well-known/appspecific` | 45 | 1 | 22 | 1 | 0/0 | 0 | — | — |
| ⚠️ | `src/lib/server/middleware` | 58 | 4 | 693 | 2 | 0/1 | 0 | — | — |
| ⚠️ | `src/routes/.well-known/llms-full.txt` | 65 | 1 | 103 | 1 | 0/1 | 0 | — | — |
| ⚠️ | `src/routes/.well-known/llms.txt` | 65 | 1 | 262 | 1 | 0/1 | 0 | — | — |
| ✅ | `src/routes/api/metrics` | 70 | 1 | 84 | 1 | 1/0 | 0 | — | — |
| ✅ | `src/routes/api/ping` | 70 | 1 | 14 | 1 | 1/0 | 0 | — | — |
| ✅ | `src/routes/api/queue` | 70 | 1 | 27 | 1 | 1/0 | 0 | — | — |
| ✅ | `src/routes/api/topology` | 72 | 3 | 254 | 3 | 2/1 | 0 | — | — |
| ✅ | `src/lib/components/ui` | 75 | 245 | 24174 | 0 | 0/1 | 3 | — | C34: component chunks in `src/routes/(app)/demos/celestial-icons` (tag: page) |
| ✅ | `src/routes/api/couchdb` | 75 | 1 | 69 | 1 | 1/0 | 0 | ⬜notest | — |
| ✅ | `src/routes/api/ingest-constitution` | 75 | 1 | 47 | 1 | 1/0 | 0 | — | — |
| ✅ | `src/routes/api/observability` | 75 | 1 | 35 | 1 | 1/0 | 0 | — | — |
| ✅ | `src/routes/api/security` | 75 | 1 | 45 | 1 | 1/0 | 0 | — | — |
| ✅ | `src/routes/minio/[...path]` | 75 | 1 | 57 | 1 | 1/0 | 0 | — | — |
| ✅ | `src/routes/api/code-intel` | 79 | 21 | 553 | 21 | 21/5 | 0 | ⬜notest | — |
| ✅ | `src/lib/components` | 80 | 56 | 165472 | 0 | 0/45 | 6 | 🟠lh | C92: component chunks in `src/lib/components/evidence` (tag: embedding) |
| ✅ | `src/routes/api/auth` | 80 | 10 | 759 | 10 | 5/5 | 0 | — | — |
| ✅ | `src/routes/api/health` | 81 | 17 | 1947 | 17 | 16/3 | 0 | 🟠lh ⬜notest | — |
| ✅ | `src/lib/ai` | 83 | 15 | 5178 | 0 | 0/1 | 1 | — | C14: function chunks in `src/lib/ai` (tag: ai) |
| ✅ | `src/lib/ai/onnx` | 83 | 2 | 340 | 0 | 0/0 | 1 | — | — |
| ✅ | `src/lib/components/yorha` | 83 | 39 | 11964 | 0 | 0/3 | 1 | — | C50: component chunks in `src/lib/components/ui/gaming/n64` (tag: page) |
| ✅ | `src/lib/workers` | 83 | 8 | 1737 | 0 | 0/1 | 2 | — | — |
| ✅ | `src/routes/api/codebase-graph` | 83 | 2 | 317 | 2 | 2/1 | 0 | — | — |
| ✅ | `src/routes/api/comfyui` | 83 | 2 | 74 | 2 | 2/1 | 0 | ⬜notest | — |
| ✅ | `src/routes/api/phase89` | 83 | 24 | 2425 | 24 | 24/13 | 0 | — | — |
| ✅ | `src/routes/api/cache` | 84 | 14 | 1427 | 14 | 14/8 | 0 | — | — |
| ✅ | `src/lib/components/ai` | 85 | 46 | 19723 | 0 | 0/11 | 0 | 🟠lh | C5: component chunks in `src/lib/components/ai` (tag: ai) |
| ✅ | `src/lib/config` | 85 | 8 | 1506 | 0 | 1/1 | 0 | 🟠lh | C75: function chunks in `src/lib/config` (tag: embedding) |
| ✅ | `src/lib/utils` | 85 | 44 | 7273 | 0 | 2/7 | 0 | 🟠lh | C1: type chunks in `src/lib/utils` (tag: page-component) |
| ✅ | `src/routes/(app)/couchdb-analytics` | 85 | 5 | 1833 | 0 | 5/0 | 0 | 🟠lh | — |
| ✅ | `src/routes/api/consolidation` | 85 | 1 | 42 | 1 | 1/0 | 0 | — | — |
| ✅ | `src/routes/api/dashboard` | 85 | 1 | 111 | 1 | 1/0 | 0 | — | — |
| ✅ | `src/routes/api/db` | 85 | 1 | 30 | 1 | 1/0 | 0 | — | — |
| ✅ | `src/routes/api/dev` | 85 | 1 | 63 | 1 | 1/0 | 0 | — | — |
| ✅ | `src/routes/api/docs` | 85 | 1 | 57 | 1 | 1/1 | 0 | — | — |
| ✅ | `src/routes/api/engagement` | 85 | 2 | 75 | 2 | 2/2 | 0 | — | — |
| ✅ | `src/routes/api/infrastructure` | 85 | 1 | 339 | 1 | 1/0 | 0 | — | — |
| ✅ | `src/routes/api/wiki` | 85 | 3 | 309 | 3 | 3/2 | 0 | — | — |
| ✅ | `tests/e2e` | 85 | 28 | 8644 | 0 | 10/3 | 0 | 🟠lh | — |
| ✅ | `tests/e2e/route-forensic` | 85 | 31 | 1744 | 0 | 4/0 | 0 | 🟠lh | — |
| ✅ | `tests/e2e/route-forensic/fixtures` | 85 | 3 | 226 | 0 | 1/0 | 0 | 🟠lh | — |
| ✅ | `tests/e2e/route-forensic/helpers` | 85 | 1 | 100 | 0 | 0/0 | 0 | 🟠lh | — |
| ✅ | `tests/fixtures` | 85 | 2 | 89 | 0 | 1/0 | 0 | 🟠lh | — |
| ✅ | `tests/helpers` | 85 | 3 | 353 | 0 | 1/1 | 0 | 🟠lh | — |
| ✅ | `tests/scripts` | 85 | 3 | 104 | 0 | 0/0 | 0 | 🟠lh | — |
| ✅ | `src/routes/api/hypergraph` | 86 | 4 | 312 | 4 | 4/3 | 0 | ⬜notest | — |
| ✅ | `src/routes/api/knowledge` | 86 | 8 | 1697 | 8 | 8/6 | 0 | — | — |
| ✅ | `src/routes/api/test` | 86 | 8 | 791 | 8 | 8/6 | 0 | — | — |
| ✅ | `src/routes/(app)/demos` | 88 | 186 | 28874 | 0 | 186/7 | 1 | 🟠lh ⬜notest | — |
| ✅ | `src/routes/api/cartridge` | 88 | 6 | 669 | 6 | 6/5 | 0 | — | — |
| ✅ | `src/routes/api/system` | 88 | 6 | 715 | 6 | 6/1 | 0 | — | — |
| ✅ | `src/lib/ai/e2b` | 90 | 2 | 524 | 0 | 0/0 | 0 | — | C21: component chunks in `src/lib/components/legal` (tag: auth) |
| ✅ | `src/lib/cache` | 90 | 5 | 1046 | 0 | 0/1 | 0 | — | C94: function chunks in `src/lib/server/cache` (tag: redis) |
| ✅ | `src/lib/client` | 90 | 6 | 1019 | 0 | 0/4 | 0 | — | — |
| ✅ | `src/lib/client/db` | 90 | 1 | 91 | 0 | 0/0 | 0 | — | — |
| ✅ | `src/lib/client/ui` | 90 | 2 | 184 | 0 | 0/0 | 0 | — | C92: component chunks in `src/lib/components/evidence` (tag: embedding) |
| ✅ | `src/lib/collaboration` | 90 | 1 | 267 | 0 | 0/1 | 0 | — | — |
| ✅ | `src/lib/components/admin` | 90 | 11 | 4086 | 0 | 0/2 | 0 | — | C7: component chunks in `src/lib/components/admin` |
| ✅ | `src/lib/components/agent` | 90 | 1 | 392 | 0 | 0/0 | 0 | — | — |
| ✅ | `src/lib/components/agentic` | 90 | 2 | 514 | 0 | 0/0 | 0 | — | — |
| ✅ | `src/lib/components/analysis` | 90 | 3 | 2809 | 0 | 0/1 | 0 | — | — |
| ✅ | `src/lib/components/analytics` | 90 | 2 | 1163 | 0 | 0/1 | 0 | — | — |
| ✅ | `src/lib/components/audio` | 90 | 1 | 631 | 0 | 0/0 | 0 | — | — |
| ✅ | `src/lib/components/cache` | 90 | 3 | 1005 | 0 | 0/0 | 0 | — | — |
| ✅ | `src/lib/components/canvas` | 90 | 6 | 2338 | 0 | 0/2 | 0 | — | — |
| ✅ | `src/lib/components/case` | 90 | 3 | 670 | 0 | 0/0 | 0 | — | — |
| ✅ | `src/lib/components/cases` | 90 | 11 | 3154 | 0 | 0/1 | 0 | — | C18: type chunks in `src/lib/types` (tag: embedding) |
| ✅ | `src/lib/components/charges` | 90 | 1 | 211 | 0 | 0/0 | 0 | — | — |
| ✅ | `src/lib/components/chat` | 90 | 4 | 768 | 0 | 0/1 | 0 | — | — |
| ✅ | `src/lib/components/citations` | 90 | 5 | 2030 | 0 | 0/0 | 0 | — | — |
| ✅ | `src/lib/components/codebase` | 90 | 12 | 5497 | 0 | 0/0 | 0 | — | — |
| ✅ | `src/lib/components/courtroom` | 90 | 2 | 1505 | 0 | 0/0 | 0 | — | — |
| ✅ | `src/lib/components/dashboard` | 90 | 15 | 3190 | 0 | 0/0 | 0 | — | C21: component chunks in `src/lib/components/legal` (tag: auth) |
| ✅ | `src/lib/components/demos` | 90 | 1 | 359 | 0 | 0/0 | 0 | — | — |
| ✅ | `src/lib/components/detective` | 90 | 6 | 1884 | 0 | 0/2 | 0 | — | — |
| ✅ | `src/lib/components/document` | 90 | 1 | 401 | 0 | 0/0 | 0 | — | — |
| ✅ | `src/lib/components/editor` | 90 | 7 | 2398 | 0 | 0/0 | 0 | — | — |
| ✅ | `src/lib/components/editors` | 90 | 1 | 55 | 0 | 0/0 | 0 | — | — |
| ✅ | `src/lib/components/evidence` | 90 | 44 | 16451 | 0 | 0/6 | 0 | — | C86: function chunks in `src/lib/components/evidence` (tag: embedding) |
| ✅ | `src/lib/components/forms` | 90 | 7 | 4163 | 0 | 0/2 | 0 | — | C1: type chunks in `src/lib/utils` (tag: page-component) |
| ✅ | `src/lib/components/glyph` | 90 | 1 | 784 | 0 | 0/0 | 0 | — | — |
| ✅ | `src/lib/components/graph` | 90 | 3 | 2287 | 0 | 0/0 | 0 | — | — |
| ✅ | `src/lib/components/intent` | 90 | 1 | 75 | 0 | 0/0 | 0 | — | — |
| ✅ | `src/lib/components/layout` | 90 | 1 | 399 | 0 | 0/0 | 0 | — | — |
| ✅ | `src/lib/components/legal` | 90 | 33 | 11235 | 0 | 0/5 | 0 | — | C35: component chunks in `src/lib/components/legal-ai` (tag: component) |
| ✅ | `src/lib/components/legal-ai` | 90 | 18 | 7563 | 0 | 0/0 | 0 | — | C35: component chunks in `src/lib/components/legal-ai` (tag: component) |
| ✅ | `src/lib/components/legal-corpus` | 90 | 8 | 2918 | 0 | 0/0 | 0 | — | C35: component chunks in `src/lib/components/legal-ai` (tag: component) |
| ✅ | `src/lib/components/library` | 90 | 1 | 70 | 0 | 0/0 | 0 | — | — |
| ✅ | `src/lib/components/modals` | 90 | 2 | 1074 | 0 | 0/0 | 0 | — | — |
| ✅ | `src/lib/components/monitoring` | 90 | 3 | 843 | 0 | 0/0 | 0 | — | — |
| ✅ | `src/lib/components/nes` | 90 | 1 | 185 | 0 | 0/0 | 0 | — | — |
| ✅ | `src/lib/components/onboarding` | 90 | 1 | 1050 | 0 | 0/0 | 0 | — | — |
| ✅ | `src/lib/components/phase78` | 90 | 3 | 628 | 0 | 0/0 | 0 | — | — |
| ✅ | `src/lib/components/poi` | 90 | 10 | 2460 | 0 | 0/1 | 0 | — | — |
| ✅ | `src/lib/components/rag` | 90 | 4 | 1259 | 0 | 0/0 | 0 | — | — |
| ✅ | `src/lib/components/recommendations` | 90 | 2 | 661 | 0 | 0/0 | 0 | — | — |
| ✅ | `src/lib/components/reports` | 90 | 1 | 244 | 0 | 0/0 | 0 | — | — |
| ✅ | `src/lib/components/research` | 90 | 1 | 585 | 0 | 0/0 | 0 | — | — |
| ✅ | `src/lib/components/shells` | 90 | 4 | 832 | 0 | 0/0 | 0 | — | — |
| ✅ | `src/lib/components/source-validation` | 90 | 4 | 1091 | 0 | 0/0 | 0 | — | — |
| ✅ | `src/lib/components/subcomponents` | 90 | 1 | 67 | 0 | 0/0 | 0 | — | — |
| ✅ | `src/lib/components/terminal` | 90 | 1 | 235 | 0 | 0/0 | 0 | — | — |
| ✅ | `src/lib/components/video` | 90 | 1 | 891 | 0 | 0/0 | 0 | — | — |
| ✅ | `src/lib/components/visualization` | 90 | 1 | 102 | 0 | 0/0 | 0 | — | — |
| ✅ | `src/lib/components/webgpu` | 90 | 2 | 492 | 0 | 0/0 | 0 | — | — |
| ✅ | `src/lib/courtroom` | 90 | 4 | 1560 | 0 | 0/0 | 0 | — | — |
| ✅ | `src/lib/env` | 90 | 2 | 27 | 0 | 0/0 | 0 | — | — |
| ✅ | `src/lib/features/evidence-command-center` | 90 | 5 | 419 | 0 | 0/0 | 0 | — | C5: component chunks in `src/lib/components/ai` (tag: ai) |
| ✅ | `src/lib/features/poi` | 90 | 1 | 124 | 0 | 0/0 | 0 | — | — |
| ✅ | `src/lib/gpu` | 90 | 17 | 4873 | 0 | 0/2 | 0 | — | C17: function chunks in `src/lib/services/error-analysis` (tag: embedding) |
| ✅ | `src/lib/graph` | 90 | 1 | 54 | 0 | 0/0 | 0 | — | — |
| ✅ | `src/lib/icons/yorha` | 90 | 15 | 572 | 0 | 0/0 | 0 | — | C4: type chunks in `src/lib/components/ui/dialog` (tag: vector) |
| ✅ | `src/lib/machines` | 90 | 11 | 4069 | 0 | 0/1 | 0 | — | C96: type chunks in `src/lib/server` (tag: embedding) |
| ✅ | `src/lib/messaging` | 90 | 1 | 168 | 0 | 0/0 | 0 | — | — |
| ✅ | `src/lib/models` | 90 | 1 | 1389 | 0 | 0/1 | 0 | — | — |
| ✅ | `src/lib/phase72` | 90 | 1 | 148 | 0 | 0/1 | 0 | — | — |
| ✅ | `src/lib/schemas` | 90 | 5 | 1049 | 0 | 0/5 | 0 | — | C29: const chunks in `src/lib/schemas` (tag: auth) |
| ✅ | `src/lib/schemas/tools` | 90 | 8 | 486 | 0 | 0/0 | 0 | — | C32: function chunks in `src/lib/server/services` (tag: api-route) |
| ✅ | `src/lib/server/acp` | 90 | 2 | 807 | 0 | 0/1 | 0 | — | — |
| ✅ | `src/lib/server/agents-md` | 90 | 3 | 439 | 0 | 0/2 | 0 | — | — |
| ✅ | `src/lib/server/api` | 90 | 1 | 195 | 0 | 0/0 | 0 | — | — |
| ✅ | `src/lib/server/ast` | 90 | 1 | 313 | 0 | 0/0 | 0 | — | — |
| ✅ | `src/lib/server/atlas` | 90 | 4 | 1002 | 0 | 0/4 | 0 | — | — |
| ✅ | `src/lib/server/auth` | 90 | 1 | 41 | 0 | 0/0 | 0 | — | — |
| ✅ | `src/lib/server/cache` | 90 | 14 | 4544 | 0 | 0/9 | 0 | — | C22: function chunks in `src/lib/server/cache` (tag: redis) |
| ✅ | `src/lib/server/cartridge` | 90 | 5 | 1614 | 0 | 0/2 | 0 | — | C12: function chunks in `src/lib/server/cartridge` (tag: embedding) |
| ✅ | `src/lib/server/chrrom` | 90 | 3 | 408 | 0 | 0/0 | 0 | — | — |
| ✅ | `src/lib/server/clients` | 90 | 1 | 8 | 0 | 0/0 | 0 | — | — |
| ✅ | `src/lib/server/comfyui` | 90 | 1 | 238 | 0 | 0/1 | 0 | — | — |
| ✅ | `src/lib/server/config` | 90 | 6 | 750 | 0 | 0/1 | 0 | — | C75: function chunks in `src/lib/config` (tag: embedding) |
| ✅ | `src/lib/server/connections` | 90 | 1 | 347 | 0 | 0/0 | 0 | — | — |
| ✅ | `src/lib/server/couchdb` | 90 | 3 | 524 | 0 | 0/0 | 0 | — | — |
| ✅ | `src/lib/server/data` | 90 | 2 | 459 | 0 | 0/0 | 0 | — | — |
| ✅ | `src/lib/server/embeddings` | 90 | 1 | 70 | 0 | 0/0 | 0 | — | C56: type chunks in `src/lib/server` (tag: embedding) |
| ✅ | `src/lib/server/env` | 90 | 1 | 10 | 0 | 0/0 | 0 | — | — |
| ✅ | `src/lib/server/ff1` | 90 | 9 | 1821 | 0 | 0/5 | 0 | — | — |
| ✅ | `src/lib/server/fixer` | 90 | 1 | 328 | 0 | 0/1 | 0 | — | — |
| ✅ | `src/lib/server/glyph` | 90 | 2 | 170 | 0 | 0/0 | 0 | — | — |
| ✅ | `src/lib/server/grpc` | 90 | 10 | 4357 | 0 | 0/4 | 0 | — | C82: function chunks in `src/lib/server/grpc` (tag: embedding) |
| ✅ | `src/lib/server/helpers` | 90 | 2 | 334 | 0 | 0/1 | 0 | — | — |
| ✅ | `src/lib/server/hypergraph` | 90 | 5 | 969 | 0 | 0/0 | 0 | — | — |
| ✅ | `src/lib/server/image` | 90 | 1 | 88 | 0 | 0/0 | 0 | — | C99: function chunks in `src/lib/server/image` (tag: embedding) |
| ✅ | `src/lib/server/inference` | 90 | 4 | 2102 | 0 | 0/4 | 0 | — | C58: type chunks in `src/lib/server/indexer` (tag: vector) |
| ✅ | `src/lib/server/init` | 90 | 1 | 105 | 0 | 0/0 | 0 | — | — |
| ✅ | `src/lib/server/integrations` | 90 | 1 | 279 | 0 | 0/0 | 0 | — | — |
| ✅ | `src/lib/server/kag` | 90 | 1 | 67 | 0 | 0/1 | 0 | — | — |
| ✅ | `src/lib/server/kb` | 90 | 7 | 939 | 0 | 0/4 | 0 | — | — |
| ✅ | `src/lib/server/langextract` | 90 | 3 | 566 | 0 | 0/1 | 0 | — | — |
| ✅ | `src/lib/server/mcp` | 90 | 5 | 863 | 0 | 0/1 | 0 | — | C82: function chunks in `src/lib/server/grpc` (tag: embedding) |
| ✅ | `src/lib/server/memory` | 90 | 1 | 154 | 0 | 0/0 | 0 | — | — |
| ✅ | `src/lib/server/minio` | 90 | 2 | 314 | 0 | 0/0 | 0 | — | — |
| ✅ | `src/lib/server/nlp` | 90 | 1 | 140 | 0 | 0/1 | 0 | — | — |
| ✅ | `src/lib/server/notifications` | 90 | 1 | 210 | 0 | 0/0 | 0 | — | — |
| ✅ | `src/lib/server/observability` | 90 | 3 | 1042 | 0 | 0/0 | 0 | — | C59: function chunks in `src/lib/server/observability` (tag: vector) |
| ✅ | `src/lib/server/obsidian` | 90 | 2 | 384 | 0 | 0/0 | 0 | — | — |
| ✅ | `src/lib/server/ocr` | 90 | 3 | 392 | 0 | 0/0 | 0 | — | — |
| ✅ | `src/lib/server/optimize` | 90 | 1 | 42 | 0 | 0/0 | 0 | — | — |
| ✅ | `src/lib/server/orchestrators` | 90 | 1 | 39 | 0 | 0/0 | 0 | — | — |
| ✅ | `src/lib/server/pdf` | 90 | 2 | 314 | 0 | 0/0 | 0 | — | C21: component chunks in `src/lib/components/legal` (tag: auth) |
| ✅ | `src/lib/server/pgai` | 90 | 3 | 69 | 0 | 0/0 | 0 | — | — |
| ✅ | `src/lib/server/phase72` | 90 | 3 | 185 | 0 | 0/0 | 0 | — | — |
| ✅ | `src/lib/server/phase78` | 90 | 1 | 402 | 0 | 0/0 | 0 | — | C58: type chunks in `src/lib/server/indexer` (tag: vector) |
| ✅ | `src/lib/server/pipeline` | 90 | 1 | 211 | 0 | 0/0 | 0 | — | — |
| ✅ | `src/lib/server/rag` | 90 | 7 | 535 | 0 | 0/1 | 0 | — | C43: type chunks in `src/lib/services/knowledge-search` (tag: embedding) |
| ✅ | `src/lib/server/rate-limit` | 90 | 2 | 318 | 0 | 0/0 | 0 | — | — |
| ✅ | `src/lib/server/reconstruction` | 90 | 5 | 1090 | 0 | 0/4 | 0 | — | — |
| ✅ | `src/lib/server/redis` | 90 | 1 | 26 | 0 | 0/0 | 0 | — | — |
| ✅ | `src/lib/server/rg-atlas` | 90 | 9 | 706 | 0 | 0/3 | 0 | — | — |
| ✅ | `src/lib/server/routing` | 90 | 1 | 203 | 0 | 0/1 | 0 | — | — |
| ✅ | `src/lib/server/search` | 90 | 13 | 2279 | 0 | 0/2 | 0 | — | — |
| ✅ | `src/lib/server/security` | 90 | 1 | 131 | 0 | 0/0 | 0 | — | — |
| ✅ | `src/lib/server/simulation` | 90 | 2 | 477 | 0 | 0/1 | 0 | — | — |
| ✅ | `src/lib/server/startup` | 90 | 1 | 114 | 0 | 0/0 | 0 | — | — |
| ✅ | `src/lib/server/storage` | 90 | 2 | 568 | 0 | 0/0 | 0 | — | — |
| ✅ | `src/lib/server/streaming` | 90 | 2 | 364 | 0 | 0/1 | 0 | — | — |
| ✅ | `src/lib/server/tools` | 90 | 9 | 1508 | 0 | 0/3 | 0 | — | C78: type chunks in `src/lib/types` (tag: vector) |
| ✅ | `src/lib/server/topology` | 90 | 1 | 329 | 0 | 0/0 | 0 | — | — |
| ✅ | `src/lib/server/training` | 90 | 1 | 111 | 0 | 0/0 | 0 | — | C82: function chunks in `src/lib/server/grpc` (tag: embedding) |
| ✅ | `src/lib/server/utils` | 90 | 13 | 926 | 0 | 0/2 | 0 | — | C19: type chunks in `src/lib/types` (tag: embedding) |
| ✅ | `src/lib/server/validation` | 90 | 2 | 402 | 0 | 0/1 | 0 | — | C43: type chunks in `src/lib/services/knowledge-search` (tag: embedding) |
| ✅ | `src/lib/services` | 90 | 5 | 701 | 0 | 0/0 | 0 | — | C43: type chunks in `src/lib/services/knowledge-search` (tag: embedding) |
| ✅ | `src/lib/shared` | 90 | 3 | 284 | 0 | 0/1 | 0 | — | C12: function chunks in `src/lib/server/cartridge` (tag: embedding) |
| ✅ | `src/lib/shared/schemas` | 90 | 1 | 32 | 0 | 0/0 | 0 | — | — |
| ✅ | `src/lib/shared/types` | 90 | 1 | 14 | 0 | 0/0 | 0 | — | C56: type chunks in `src/lib/server` (tag: embedding) |
| ✅ | `src/lib/shims` | 90 | 11 | 1235 | 0 | 0/1 | 0 | 🔴ssr | C57: const chunks in `src/lib/shims` (tag: embedding) |
| ✅ | `src/lib/stores` | 90 | 17 | 5081 | 0 | 0/6 | 0 | — | C52: const chunks in `src/lib/stores/unified` (tag: server-module) |
| ✅ | `src/lib/stores/dashboard` | 90 | 3 | 654 | 0 | 0/1 | 0 | — | C68: function chunks in `src/lib/stores/dashboard` (tag: server-module) |
| ✅ | `src/lib/stores/unified` | 90 | 7 | 1328 | 0 | 0/1 | 0 | — | C52: const chunks in `src/lib/stores/unified` (tag: server-module) |
| ✅ | `src/lib/test-utils` | 90 | 1 | 11 | 0 | 0/0 | 0 | — | — |
| ✅ | `src/lib/webgpu` | 90 | 20 | 5784 | 0 | 0/0 | 0 | — | C23: class chunks in `src/lib/webgpu` (tag: embedding) |
| ✅ | `src/mcp/tools` | 90 | 7 | 2174 | 0 | 0/7 | 0 | — | — |
| ✅ | `src/mcp/zod-to-json-schema-bridge` | 90 | 2 | 93 | 0 | 0/2 | 0 | — | — |
| ✅ | `src/routes/(admin)/error-brain` | 90 | 3 | 632 | 0 | 3/0 | 0 | — | — |
| ✅ | `src/routes/(analysis)` | 90 | 2 | 2990 | 0 | 4/0 | 0 | ⬜notest | — |
| ✅ | `src/routes/(analysis)/audio-analysis` | 90 | 2 | 929 | 0 | 1/0 | 0 | ⬜notest | — |
| ✅ | `src/routes/(analysis)/document-analysis` | 90 | 2 | 935 | 0 | 1/0 | 0 | ⬜notest | — |
| ✅ | `src/routes/(analysis)/video-analysis` | 90 | 2 | 1047 | 0 | 1/0 | 0 | ⬜notest | — |
| ✅ | `src/routes/(analysis)@` | 90 | 2 | 2717 | 0 | 4/0 | 0 | ⬜notest | C83: const chunks in `src/routes/(app)/admin/dev-tools` (tag: page-server) |
| ✅ | `src/routes/(analysis)@/audio-analysis` | 90 | 2 | 838 | 0 | 1/0 | 0 | ⬜notest | — |
| ✅ | `src/routes/(analysis)@/document-analysis` | 90 | 2 | 801 | 0 | 1/0 | 0 | ⬜notest | — |
| ✅ | `src/routes/(analysis)@/video-analysis` | 90 | 2 | 999 | 0 | 1/0 | 0 | ⬜notest | — |
| ✅ | `src/routes/(app)/ai-dashboard` | 90 | 1 | 6 | 0 | 1/0 | 0 | ⬜notest | — |
| ✅ | `src/routes/(app)/all-routes` | 90 | 1 | 6 | 0 | 1/0 | 0 | ⬜notest | — |
| ✅ | `src/routes/(app)/analytics` | 90 | 2 | 2388 | 0 | 2/0 | 0 | — | — |
| ✅ | `src/routes/(app)/cache-monitor` | 90 | 1 | 146 | 0 | 1/0 | 0 | — | — |
| ✅ | `src/routes/(app)/chat` | 90 | 4 | 873 | 0 | 4/1 | 0 | ⬜notest | — |
| ✅ | `src/routes/(app)/citations` | 90 | 9 | 2383 | 0 | 9/0 | 0 | ⬜notest | — |
| ✅ | `src/routes/(app)/code-intel` | 90 | 17 | 2964 | 0 | 17/0 | 0 | ⬜notest | — |
| ✅ | `src/routes/(app)/codebase-graph` | 90 | 5 | 995 | 0 | 5/1 | 0 | ⬜notest | — |
| ✅ | `src/routes/(app)/codebase-wiki` | 90 | 1 | 25 | 0 | 1/0 | 0 | — | — |
| ✅ | `src/routes/(app)/error-brain` | 90 | 1 | 6 | 0 | 1/0 | 0 | ⬜notest | — |
| ✅ | `src/routes/(app)/fictional-cases` | 90 | 4 | 1011 | 0 | 4/0 | 0 | ⬜notest | — |
| ✅ | `src/routes/(app)/global-search` | 90 | 2 | 2394 | 0 | 2/0 | 0 | — | — |
| ✅ | `src/routes/(app)/gpu-evidence-graph` | 90 | 1 | 6 | 0 | 1/0 | 0 | ⬜notest | — |
| ✅ | `src/routes/(app)/indexing` | 90 | 1 | 960 | 0 | 1/0 | 0 | — | — |
| ✅ | `src/routes/(app)/knowledge` | 90 | 1 | 517 | 0 | 1/0 | 0 | — | — |
| ✅ | `src/routes/(app)/legal-corpus-premium` | 90 | 1 | 1155 | 0 | 1/0 | 0 | — | — |
| ✅ | `src/routes/(app)/library` | 90 | 13 | 4516 | 0 | 13/0 | 0 | ⬜notest | — |
| ✅ | `src/routes/(app)/rag-search` | 90 | 2 | 376 | 0 | 2/0 | 0 | — | — |
| ✅ | `src/routes/(app)/recommendations` | 90 | 2 | 734 | 0 | 2/0 | 0 | — | — |
| ✅ | `src/routes/(app)/system-configuration` | 90 | 1 | 838 | 0 | 1/1 | 0 | — | — |
| ✅ | `src/routes/(app)/webgpu-similarity` | 90 | 1 | 12 | 0 | 1/0 | 0 | — | C28: component chunks in `src/routes/(app)/demos/cache` (tag: page) |
| ✅ | `src/routes/(dev)/cache-demo` | 90 | 1 | 261 | 0 | 0/0 | 0 | — | — |
| ✅ | `src/routes/(dev)/demo` | 90 | 3 | 538 | 0 | 0/1 | 0 | — | — |
| ✅ | `src/routes/(dev)/intent-chat` | 90 | 1 | 146 | 0 | 0/0 | 0 | — | — |
| ✅ | `src/routes/(dev)/odin` | 90 | 2 | 323 | 0 | 1/0 | 0 | ⬜notest | — |
| ✅ | `src/routes/(dev)/test-source-validation` | 90 | 1 | 381 | 0 | 0/0 | 0 | — | — |
| ✅ | `src/routes/(dev)/tts-demo` | 90 | 2 | 84 | 0 | 0/0 | 0 | — | — |
| ✅ | `src/routes/(dev)/voice-chat-demo` | 90 | 2 | 329 | 0 | 0/0 | 0 | — | — |
| ✅ | `src/routes/api/acp` | 90 | 2 | 114 | 2 | 2/2 | 0 | — | — |
| ✅ | `src/routes/api/agents` | 90 | 1 | 295 | 1 | 1/1 | 0 | — | — |
| ✅ | `src/routes/api/audit` | 90 | 2 | 200 | 2 | 2/2 | 0 | — | — |
| ✅ | `src/routes/api/browser-context` | 90 | 1 | 116 | 1 | 1/1 | 0 | ⬜notest | — |
| ✅ | `src/routes/api/case-theory` | 90 | 1 | 170 | 1 | 1/1 | 0 | — | — |
| ✅ | `src/routes/api/charges` | 90 | 1 | 45 | 1 | 1/1 | 0 | — | — |
| ✅ | `src/routes/api/chrrom` | 90 | 3 | 169 | 3 | 3/3 | 0 | — | — |
| ✅ | `src/routes/api/collaboration` | 90 | 1 | 56 | 1 | 1/1 | 0 | ⬜notest | — |
| ✅ | `src/routes/api/detective` | 90 | 2 | 434 | 2 | 2/2 | 0 | — | — |
| ✅ | `src/routes/api/embed` | 90 | 1 | 125 | 1 | 1/1 | 0 | — | — |
| ✅ | `src/routes/api/feedback` | 90 | 1 | 41 | 1 | 1/1 | 0 | — | — |
| ✅ | `src/routes/api/gpu` | 90 | 3 | 277 | 3 | 3/3 | 0 | — | — |
| ✅ | `src/routes/api/gpu-wasm-integration` | 90 | 1 | 288 | 1 | 1/1 | 0 | — | — |
| ✅ | `src/routes/api/indexing` | 90 | 1 | 547 | 1 | 1/1 | 0 | — | — |
| ✅ | `src/routes/api/ingest` | 90 | 2 | 349 | 2 | 2/2 | 0 | — | — |
| ✅ | `src/routes/api/investigate` | 90 | 1 | 179 | 1 | 1/1 | 0 | — | — |
| ✅ | `src/routes/api/kb` | 90 | 2 | 251 | 2 | 2/2 | 0 | — | — |
| ✅ | `src/routes/api/mcp` | 90 | 1 | 119 | 1 | 1/1 | 0 | — | — |
| ✅ | `src/routes/api/ml` | 90 | 1 | 132 | 1 | 1/1 | 0 | — | — |
| ✅ | `src/routes/api/nlp` | 90 | 2 | 60 | 2 | 2/2 | 0 | — | — |
| ✅ | `src/routes/api/obsidian` | 90 | 1 | 147 | 1 | 1/1 | 0 | — | — |
| ✅ | `src/routes/api/ollama` | 90 | 2 | 175 | 2 | 2/2 | 0 | — | — |
| ✅ | `src/routes/api/orchestrator` | 90 | 1 | 79 | 1 | 1/1 | 0 | — | — |
| ✅ | `src/routes/api/pgai` | 90 | 3 | 104 | 3 | 3/3 | 0 | — | — |
| ✅ | `src/routes/api/phase109` | 90 | 2 | 259 | 2 | 2/2 | 0 | — | — |
| ✅ | `src/routes/api/pipeline` | 90 | 2 | 124 | 2 | 2/2 | 0 | — | — |
| ✅ | `src/routes/api/playwright` | 90 | 1 | 44 | 1 | 1/1 | 0 | — | — |
| ✅ | `src/routes/api/rabbitmq` | 90 | 1 | 134 | 1 | 1/1 | 0 | — | — |
| ✅ | `src/routes/api/reconstruction` | 90 | 2 | 198 | 2 | 2/2 | 0 | ⬜notest | — |
| ✅ | `src/routes/api/research` | 90 | 7 | 938 | 7 | 7/7 | 0 | ⬜notest | — |
| ✅ | `src/routes/api/rg-atlas` | 90 | 1 | 44 | 1 | 1/1 | 0 | — | — |
| ✅ | `src/routes/api/route-operations` | 90 | 1 | 49 | 1 | 1/1 | 0 | — | — |
| ✅ | `src/routes/api/summarize` | 90 | 3 | 217 | 3 | 3/3 | 0 | — | — |
| ✅ | `src/routes/api/tags` | 90 | 3 | 151 | 3 | 3/1 | 0 | — | — |
| ✅ | `src/routes/api/tools` | 90 | 4 | 296 | 4 | 4/4 | 0 | — | — |
| ✅ | `src/routes/api/trace` | 90 | 1 | 35 | 1 | 1/1 | 0 | — | — |
| ✅ | `src/routes/api/user` | 90 | 1 | 91 | 1 | 1/1 | 0 | — | — |
| ✅ | `src/routes/api/vector-search` | 90 | 1 | 110 | 1 | 1/1 | 0 | — | — |
| ✅ | `src/routes/api/video` | 90 | 1 | 105 | 1 | 1/1 | 0 | — | — |
| ✅ | `src/routes/api/vision` | 90 | 1 | 233 | 1 | 1/1 | 0 | — | — |
| ✅ | `src/routes/api/web` | 90 | 2 | 181 | 2 | 2/2 | 0 | — | — |
| ✅ | `src/routes/api/websearch` | 90 | 1 | 63 | 1 | 1/1 | 0 | — | — |
| ✅ | `src/routes/api/whisper` | 90 | 1 | 370 | 1 | 1/1 | 0 | — | — |
| ✅ | `src/routes/api/worker` | 90 | 1 | 186 | 1 | 1/1 | 0 | — | — |
| ✅ | `src/routes/api/workflow-events` | 90 | 1 | 133 | 1 | 1/1 | 0 | — | — |
| ✅ | `src/shims` | 90 | 1 | 1 | 0 | 0/0 | 0 | — | — |
| ✅ | `src/stores` | 90 | 1 | 47 | 0 | 0/0 | 0 | — | — |
| ✅ | `src/tests` | 90 | 1 | 10 | 0 | 0/0 | 0 | — | — |
| ✅ | `src/wasm` | 90 | 2 | 524 | 0 | 0/0 | 0 | — | — |
| ✅ | `src/workers` | 90 | 3 | 241 | 0 | 0/0 | 0 | — | — |
| ✅ | `tests/accessibility` | 90 | 2 | 557 | 0 | 0/0 | 0 | — | — |
| ✅ | `tests/e2e/utils` | 90 | 3 | 505 | 0 | 0/0 | 0 | — | — |
| ✅ | `tests/intent` | 90 | 2 | 472 | 0 | 0/1 | 0 | — | — |
| ✅ | `tests/mapreduce` | 90 | 1 | 217 | 0 | 0/0 | 0 | — | — |
| ✅ | `tests/reports` | 90 | 2 | 64 | 0 | 0/0 | 0 | — | — |
| ✅ | `tests/routes/api/ai` | 90 | 1 | 126 | 0 | 1/0 | 0 | — | — |
| ✅ | `tests/routes/auto` | 90 | 1 | 40719 | 0 | 593/0 | 0 | — | — |
| ✅ | `tests/routes/auto/.well-known` | 90 | 4 | 228 | 0 | 4/0 | 0 | — | — |
| ✅ | `tests/routes/auto/admin` | 90 | 3 | 203 | 0 | 3/0 | 0 | — | — |
| ✅ | `tests/routes/auto/api` | 90 | 586 | 40142 | 0 | 584/0 | 0 | — | — |
| ✅ | `tests/routes/auto/minio` | 90 | 1 | 57 | 0 | 1/0 | 0 | — | — |
| ✅ | `tests/runes` | 90 | 1 | 230 | 0 | 0/0 | 0 | — | — |
| ✅ | `tests/setup` | 90 | 1 | 226 | 0 | 0/0 | 0 | — | — |
| ✅ | `tests/sw` | 90 | 1 | 97 | 0 | 0/1 | 0 | — | — |
| ✅ | `tests/unit` | 90 | 6 | 1248 | 0 | 0/3 | 0 | — | — |
| ✅ | `tests/utils` | 90 | 1 | 134 | 0 | 0/0 | 0 | — | — |
| ✅ | `src/routes/api/synthesis` | 91 | 7 | 1855 | 7 | 7/6 | 1 | — | — |
| ✅ | `src/routes` | 92 | 6 | 229283 | 673 | 1124/562 | 2 | 🔴ssr 🟠lh ⬜notest | — |
| ✅ | `src/routes/api/codeintel` | 92 | 9 | 1042 | 9 | 9/4 | 0 | — | — |
| ✅ | `src/routes/api/document` | 93 | 2 | 148 | 2 | 2/1 | 0 | — | — |
| ✅ | `src/routes/api/graph` | 93 | 19 | 2914 | 19 | 19/16 | 0 | 🟠lh ⬜notest | — |
| ✅ | `src/routes/api/internal` | 93 | 2 | 114 | 2 | 2/1 | 0 | — | — |
| ✅ | `src/routes/api/stream` | 93 | 2 | 102 | 2 | 2/1 | 0 | — | — |
| ✅ | `src/routes/api/library` | 94 | 21 | 2864 | 21 | 21/12 | 0 | — | — |
| ✅ | `src/lib/server/agent` | 95 | 10 | 3931 | 0 | 0/7 | 0 | 🟠lh | C74: type chunks in `src/lib/types` (tag: vector) |
| ✅ | `src/lib/server/ai` | 95 | 80 | 17673 | 0 | 3/23 | 0 | 🟠lh | C19: type chunks in `src/lib/types` (tag: embedding) |
| ✅ | `src/routes/api/admin` | 95 | 32 | 3350 | 32 | 32/21 | 0 | ⬜notest | — |
| ✅ | `src/routes/api/errors` | 95 | 3 | 253 | 3 | 3/2 | 0 | — | — |
| ✅ | `src/routes/api/audio` | 96 | 4 | 520 | 4 | 4/3 | 0 | — | — |
| ✅ | `src/routes/api/canon` | 96 | 4 | 574 | 4 | 4/3 | 0 | — | — |
| ✅ | `src/routes/api/evidence` | 96 | 32 | 6237 | 32 | 32/24 | 0 | ⬜notest | — |
| ✅ | `src/routes/api/persons-of-interest` | 96 | 14 | 2737 | 14 | 14/10 | 0 | — | — |
| ✅ | `src/routes/api/phase78` | 96 | 4 | 198 | 4 | 4/3 | 0 | — | — |
| ✅ | `src/routes/api/yorha` | 96 | 4 | 510 | 4 | 4/3 | 0 | — | — |
| ✅ | `src/routes/api/ace` | 98 | 9 | 1821 | 9 | 9/8 | 0 | — | — |
| ✅ | `src/routes/api/analytics` | 98 | 28 | 4038 | 28 | 28/24 | 0 | ⬜notest | — |
| ✅ | `src/routes/api/cases` | 98 | 25 | 4737 | 25 | 25/21 | 0 | — | — |
| ✅ | `src/routes/api/codebase` | 98 | 12 | 1912 | 12 | 12/10 | 0 | — | — |
| ✅ | `src/routes/api/codebase-index` | 98 | 47 | 13251 | 46 | 46/39 | 0 | — | — |
| ✅ | `src/routes/api/reports` | 98 | 9 | 2311 | 9 | 9/8 | 0 | — | C85: route-handler chunks in `src/routes/api/citations/collections/[collectionId]/citations` (tag: api) |
| ✅ | `src/routes/api/routes` | 98 | 9 | 1005 | 9 | 9/8 | 0 | — | — |
| ✅ | `src/routes/api/ai` | 99 | 33 | 3467 | 33 | 33/31 | 0 | ⬜notest | — |
| ✅ | `src/routes/api/rag` | 99 | 11 | 2493 | 10 | 10/9 | 0 | ⬜notest | — |
| ✅ | `src/routes/api/v1` | 99 | 19 | 1584 | 19 | 19/18 | 0 | — | — |
| ✅ | `src/lib` | 100 | 11 | 416274 | 3 | 13/300 | 9 | 🔴ssr 🟠lh | C57: const chunks in `src/lib/shims` (tag: embedding) |
| ✅ | `src/lib/data` | 100 | 5 | 1682 | 0 | 0/0 | 0 | — | C29: const chunks in `src/lib/schemas` (tag: auth) |
| ✅ | `src/lib/db` | 100 | 4 | 2892 | 0 | 0/1 | 0 | — | C91: type chunks in `src/lib/server/db` (tag: database) |
| ✅ | `src/lib/db/queries` | 100 | 2 | 881 | 0 | 0/0 | 0 | — | — |
| ✅ | `src/lib/db/schema` | 100 | 6 | 890 | 0 | 0/0 | 0 | — | C51: table-def chunks in `src/lib/db/schema` (tag: database) |
| ✅ | `src/lib/intent` | 100 | 1 | 137 | 0 | 0/0 | 0 | — | — |
| ✅ | `src/lib/server` | 100 | 63 | 191856 | 3 | 10/211 | 0 | 🟠lh | C90: function chunks in `src/lib/server` (tag: auth) |
| ✅ | `src/lib/server/ace` | 100 | 36 | 13505 | 0 | 0/18 | 0 | — | C72: function chunks in `src/lib/server/ace` (tag: vector) |
| ✅ | `src/lib/server/adapters` | 100 | 1 | 650 | 0 | 0/1 | 0 | — | — |
| ✅ | `src/lib/server/admin` | 100 | 8 | 1064 | 0 | 0/5 | 0 | — | — |
| ✅ | `src/lib/server/agents` | 100 | 23 | 3282 | 0 | 0/7 | 0 | — | — |
| ✅ | `src/lib/server/analysis` | 100 | 13 | 3146 | 0 | 0/5 | 0 | — | C54: function chunks in `src/lib/server/analysis` |
| ✅ | `src/lib/server/analytics` | 100 | 15 | 6771 | 0 | 0/10 | 0 | — | C60: function chunks in `src/lib/server/analytics` (tag: embedding) |
| ✅ | `src/lib/server/audit` | 100 | 4 | 1415 | 0 | 0/1 | 0 | — | C84: function chunks in `src/lib/server/audit` (tag: vector) |
| ✅ | `src/lib/server/cases` | 100 | 1 | 189 | 0 | 0/0 | 0 | — | — |
| ✅ | `src/lib/server/codeintel` | 100 | 1 | 498 | 0 | 0/1 | 0 | — | — |
| ✅ | `src/lib/server/concurrency` | 100 | 3 | 741 | 0 | 0/1 | 0 | — | C61: const chunks in `src/lib/server/concurrency` (tag: auth) |
| ✅ | `src/lib/server/db` | 100 | 120 | 18748 | 0 | 0/4 | 0 | — | C6: function chunks in `src/lib/server/db` (tag: embedding) |
| ✅ | `src/lib/server/embedding` | 100 | 8 | 1052 | 0 | 0/1 | 0 | — | C77: type chunks in `src/lib/types` (tag: embedding) |
| ✅ | `src/lib/server/engagement` | 100 | 1 | 367 | 0 | 0/0 | 0 | — | — |
| ✅ | `src/lib/server/error-brain` | 100 | 11 | 1158 | 0 | 1/2 | 0 | — | — |
| ✅ | `src/lib/server/evidence` | 100 | 15 | 1230 | 0 | 0/2 | 0 | — | C66: type chunks in `src/lib/server/services` (tag: types) |
| ✅ | `src/lib/server/gpu` | 100 | 17 | 5379 | 0 | 0/3 | 0 | — | C20: function chunks in `src/lib/webgpu` (tag: embedding) |
| ✅ | `src/lib/server/graph` | 100 | 22 | 9853 | 0 | 1/7 | 0 | — | C73: function chunks in `src/lib/server/retrieval` (tag: vector) |
| ✅ | `src/lib/server/indexer` | 100 | 26 | 7329 | 1 | 0/5 | 0 | — | C58: type chunks in `src/lib/server/indexer` (tag: vector) |
| ✅ | `src/lib/server/legal` | 100 | 9 | 2766 | 0 | 0/0 | 0 | — | C47: route-handler chunks in `src/lib/server/legal` (tag: api) |
| ✅ | `src/lib/server/llm` | 100 | 6 | 1643 | 0 | 0/2 | 0 | — | C44: route-handler chunks in `src/lib/server/llm` (tag: api) |
| ✅ | `src/lib/server/ml` | 100 | 8 | 2974 | 0 | 0/0 | 0 | — | C69: route-handler chunks in `src/routes/(app)/admin/api-testing/agentic-loop` (tag: api) |
| ✅ | `src/lib/server/queue` | 100 | 8 | 4092 | 0 | 0/3 | 0 | — | C96: type chunks in `src/lib/server` (tag: embedding) |
| ✅ | `src/lib/server/reports` | 100 | 1 | 112 | 0 | 0/1 | 0 | — | — |
| ✅ | `src/lib/server/research` | 100 | 16 | 1604 | 0 | 0/3 | 0 | — | C43: type chunks in `src/lib/services/knowledge-search` (tag: embedding) |
| ✅ | `src/lib/server/retrieval` | 100 | 37 | 8300 | 0 | 0/6 | 0 | — | C73: function chunks in `src/lib/server/retrieval` (tag: vector) |
| ✅ | `src/lib/server/services` | 100 | 33 | 9962 | 0 | 0/3 | 0 | — | C32: function chunks in `src/lib/server/services` (tag: api-route) |
| ✅ | `src/lib/server/tensor` | 100 | 2 | 461 | 0 | 0/1 | 0 | — | — |
| ✅ | `src/lib/server/trace` | 100 | 1 | 344 | 0 | 0/0 | 0 | — | — |
| ✅ | `src/lib/server/types` | 100 | 10 | 1126 | 0 | 0/0 | 0 | — | C73: function chunks in `src/lib/server/retrieval` (tag: vector) |
| ✅ | `src/lib/server/unified` | 100 | 1 | 284 | 0 | 0/0 | 0 | — | — |
| ✅ | `src/lib/server/vector` | 100 | 13 | 3335 | 0 | 0/2 | 0 | — | C18: type chunks in `src/lib/types` (tag: embedding) |
| ✅ | `src/lib/server/wiki` | 100 | 7 | 1942 | 0 | 0/1 | 0 | — | — |
| ✅ | `src/lib/server/workers` | 100 | 5 | 1771 | 0 | 0/4 | 0 | — | C24: class chunks in `src/lib/server/workers` (tag: redis) |
| ✅ | `src/lib/types` | 100 | 53 | 7093 | 0 | 0/5 | 0 | — | C77: type chunks in `src/lib/types` (tag: embedding) |
| ✅ | `src/mcp` | 100 | 14 | 13811 | 0 | 1/20 | 0 | — | — |
| ✅ | `src/routes/(app)` | 100 | 2 | 115988 | 4 | 450/46 | 1 | 🔴ssr 🟠lh ⬜notest | — |
| ✅ | `src/routes/(app)/acp` | 100 | 1 | 615 | 0 | 1/1 | 0 | — | — |
| ✅ | `src/routes/(app)/active-cases` | 100 | 2 | 1155 | 0 | 2/0 | 0 | ⬜notest | — |
| ✅ | `src/routes/(app)/admin` | 100 | 80 | 27852 | 3 | 80/15 | 0 | 🔴ssr 🟠lh ⬜notest | — |
| ✅ | `src/routes/(app)/analysis-center` | 100 | 5 | 1578 | 0 | 5/2 | 0 | ⬜notest | — |
| ✅ | `src/routes/(app)/cases` | 100 | 37 | 10574 | 0 | 37/10 | 0 | ⬜notest | — |
| ✅ | `src/routes/(app)/command-center` | 100 | 11 | 3456 | 0 | 11/0 | 0 | ⬜notest | C3: const chunks in `src/routes/(app)/demos/detective-command` |
| ✅ | `src/routes/(app)/dashboard` | 100 | 2 | 2059 | 0 | 2/1 | 0 | ⬜notest | — |
| ✅ | `src/routes/(app)/evidence` | 100 | 19 | 3913 | 1 | 19/5 | 0 | ⬜notest | C29: const chunks in `src/lib/schemas` (tag: auth) |
| ✅ | `src/routes/(app)/evidence-library` | 100 | 2 | 356 | 0 | 2/0 | 0 | ⬜notest | — |
| ✅ | `src/routes/(app)/legal-corpus` | 100 | 7 | 3379 | 0 | 7/0 | 0 | ⬜notest | C47: route-handler chunks in `src/lib/server/legal` (tag: api) |
| ✅ | `src/routes/(app)/persons-of-interest` | 100 | 8 | 3093 | 0 | 8/1 | 0 | ⬜notest | — |
| ✅ | `src/routes/(app)/reports` | 100 | 7 | 2151 | 0 | 7/0 | 0 | — | — |
| ✅ | `src/routes/(app)/simulation` | 100 | 2 | 1308 | 0 | 2/0 | 0 | — | C21: component chunks in `src/lib/components/legal` (tag: auth) |
| ✅ | `src/routes/(app)/terminal` | 100 | 3 | 1123 | 0 | 3/1 | 0 | ⬜notest | C5: component chunks in `src/lib/components/ai` (tag: ai) |
| ✅ | `src/routes/api/agent` | 100 | 1 | 453 | 1 | 1/1 | 0 | — | — |
| ✅ | `src/routes/api/analysis` | 100 | 1 | 240 | 1 | 1/1 | 0 | — | — |
| ✅ | `src/routes/api/analyze-file` | 100 | 1 | 295 | 1 | 1/1 | 0 | — | — |
| ✅ | `src/routes/api/analyze-tag` | 100 | 1 | 185 | 1 | 1/1 | 0 | — | — |
| ✅ | `src/routes/api/chat` | 100 | 7 | 1333 | 7 | 7/7 | 0 | — | — |
| ✅ | `src/routes/api/citations` | 100 | 10 | 1739 | 10 | 10/10 | 0 | — | — |
| ✅ | `src/routes/api/contextual` | 100 | 4 | 708 | 4 | 4/4 | 0 | — | — |
| ✅ | `src/routes/api/conversations` | 100 | 1 | 141 | 1 | 1/1 | 0 | — | — |
| ✅ | `src/routes/api/courtroom` | 100 | 1 | 153 | 1 | 1/1 | 0 | — | — |
| ✅ | `src/routes/api/documents` | 100 | 3 | 342 | 3 | 3/3 | 0 | — | — |
| ✅ | `src/routes/api/error-brain` | 100 | 11 | 2490 | 11 | 11/11 | 0 | — | — |
| ✅ | `src/routes/api/fictional-cases` | 100 | 2 | 295 | 2 | 2/2 | 0 | — | — |
| ✅ | `src/routes/api/generate-cluster-summaries` | 100 | 1 | 379 | 1 | 1/1 | 0 | — | — |
| ✅ | `src/routes/api/glossary` | 100 | 3 | 526 | 3 | 3/3 | 0 | — | — |
| ✅ | `src/routes/api/glyph` | 100 | 3 | 487 | 3 | 3/3 | 0 | — | — |
| ✅ | `src/routes/api/onboarding` | 100 | 1 | 120 | 1 | 1/1 | 0 | — | — |
| ✅ | `src/routes/api/persons` | 100 | 2 | 437 | 2 | 2/2 | 0 | — | — |
| ✅ | `src/routes/api/phase72` | 100 | 3 | 381 | 3 | 3/3 | 0 | — | — |
| ✅ | `src/routes/api/phase82` | 100 | 2 | 90 | 2 | 2/2 | 0 | — | — |
| ✅ | `src/routes/api/precedents` | 100 | 2 | 342 | 2 | 2/2 | 0 | — | — |
| ✅ | `src/routes/api/push` | 100 | 2 | 185 | 2 | 2/2 | 0 | — | — |
| ✅ | `src/routes/api/qlora` | 100 | 1 | 167 | 1 | 1/1 | 0 | — | — |
| ✅ | `src/routes/api/recommendations` | 100 | 5 | 1178 | 5 | 5/5 | 0 | — | — |
| ✅ | `src/routes/api/search` | 100 | 6 | 1394 | 6 | 6/6 | 0 | — | — |
| ✅ | `src/routes/api/simulation` | 100 | 4 | 1098 | 4 | 4/4 | 0 | — | — |
| ✅ | `src/routes/api/sse` | 100 | 2 | 2783 | 2 | 2/2 | 0 | — | — |
| ✅ | `src/routes/api/statutes` | 100 | 4 | 585 | 4 | 4/4 | 0 | — | — |
| ✅ | `src/routes/api/sync` | 100 | 1 | 49 | 1 | 1/1 | 0 | — | — |
| ✅ | `src/routes/api/tasks` | 100 | 2 | 204 | 2 | 2/2 | 0 | — | — |
| ✅ | `src/routes/login` | 100 | 3 | 462 | 0 | 1/2 | 0 | — | C83: const chunks in `src/routes/(app)/admin/dev-tools` (tag: page-server) |
| ✅ | `src/routes/register` | 100 | 3 | 627 | 0 | 1/2 | 0 | — | — |
| ✅ | `src/types` | 100 | 23 | 890 | 0 | 0/1 | 0 | — | — |
| ✅ | `tests/routes` | 100 | 31 | 50743 | 2 | 600/9 | 0 | — | — |

---

## API Routes (673 total · top 60)

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

_…and 613 more. See `codebase-graph.json` for full list._

---

## G4 — API Routes Missing Auth Guard (11)
- `src/routes/.well-known/agent.json/+server.ts` · GET
- `src/routes/.well-known/appspecific/com.chrome.devtools.json/+server.ts` · GET
- `src/routes/.well-known/llms-full.txt/+server.ts` · GET
- `src/routes/.well-known/llms.txt/+server.ts` · GET
- `src/routes/api/auth/login/+server.ts` · POST
- `src/routes/api/auth/logout/+server.ts` · POST/GET
- `src/routes/api/auth/register/+server.ts` · POST
- `src/routes/api/auth/reset-password/+server.ts` · POST
- `src/routes/api/auth/session/+server.ts` · GET
- `src/routes/api/health/inference/+server.ts` · GET
- `src/routes/api/topology/centroids/+server.ts` · GET

---

## G5 — API Routes Missing Zod Validation (0)
_All API handlers use Zod. ✅_

---

## G14 — Svelte 4 Legacy Patterns (0 files)
_No Svelte 4 patterns found. ✅_

---

## G15 — SSR-Unsafe Globals (2 files · unguarded window/document/localStorage)
- `src/lib/shims/os-browser-shim.js`
- `src/routes/(app)/admin/document-search/+page.svelte`

---

## G16 — Routes Without Test Pairing (46)
- `src/routes/api/admin/ai-chat/subagent/launch/+server.ts` · POST
- `src/routes/api/admin/ai-chat/summarize-panel/+server.ts` · POST
- `src/routes/api/admin/ai-chat/[sessionId]/+server.ts` · GET
- `src/routes/api/admin/citations/discover/+server.ts` · POST
- `src/routes/api/admin/inference-lane/+server.ts` · GET
- `src/routes/api/admin/jobs/+server.ts` · GET
- `src/routes/api/admin/legal-strategy/+server.ts` · POST
- `src/routes/api/admin/model/promote-weights/+server.ts` · POST
- `src/routes/api/admin/model/upload-weights/+server.ts` · POST
- `src/routes/api/admin/observability/+server.ts` · GET
- `src/routes/api/admin/raptor-atlas/+server.ts` · GET
- `src/routes/api/admin/repair/+server.ts` · POST
- `src/routes/api/admin/topology/recompute/+server.ts` · POST
- `src/routes/api/admin/weights/+server.ts` · GET/POST
- `src/routes/api/ai/hermes-plan/+server.ts` · POST
- `src/routes/api/ai/hermes-run/+server.ts` · POST
- `src/routes/api/analytics/file-activity/+server.ts` · POST
- `src/routes/api/analytics/panel-activity/+server.ts` · POST
- `src/routes/api/browser-context/snapshot/+server.ts` · POST/GET/DELETE
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

---

## G11 — Hardcoded Localhost References (19 files)
- `src/lib/components/ai/EnhancedLegalAIChatWithSynthesis.svelte` · http://localhost:11434
- `src/lib/config/mcp-context7-registration.json` · http://127.0.0.1:8095
- `src/lib/server/agent/tools/web-search.ts` · http://localhost:8888, http://localhost:8888
- `src/lib/server/ai/hermes/tools/registry.ts` · http://localhost:5173
- `src/lib/utils/api-endpoints.ts` · http://localhost:8080, http://localhost:11434
- `src/lib/utils/simd-json-parser.ts` · http://localhost:8097
- `src/routes/(app)/admin/library/+page.svelte` · http://localhost:5173, http://localhost:5173
- `src/routes/(app)/couchdb-analytics/+page.svelte` · http://localhost:8001
- `src/routes/(app)/demos/crime-reconstruction/+page.svelte` · http://localhost:8092
- `src/routes/(app)/demos/yorha/components/YoRHaAIChat.svelte` · http://localhost:11434, http://localhost:8093
- `src/routes/api/graph/colab-export/+server.ts` · http://localhost:6333
- `src/routes/api/health/+server.ts` · http://127.0.0.1:8096, http://127.0.0.1:8096
- `tests/e2e/route-forensic/fixtures/authed-page.ts` · http://127.0.0.1:5173
- `tests/e2e/route-forensic/helpers/forensic.ts` · http://127.0.0.1:5173
- `tests/e2e/route-forensic/_helpers.ts` · http://127.0.0.1:5173
- `tests/fixtures/demo-auth.ts` · http://localhost:5173, http://localhost:5173
- `tests/helpers/env-ports.ts` · http://127.0.0.1:5173, http://localhost:8090
- `tests/quick-ui-test.js` · http://localhost:5177
- `tests/scripts/verify-routes-quick.mjs` · http://localhost:5173

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
| `$lib/server/db/client` | 571 |
| `$lib/server/env.server.js` | 463 |
| `$lib/components/ui/Icon.svelte` | 257 |
| `$lib/server/redis.js` | 256 |
| `$lib/server/ollama.js` | 182 |
| `$lib/server/db/schema-postgres.js` | 158 |
| `$lib/server/middleware/cache-headers.js` | 112 |
| `$lib/server/validation.js` | 95 |
| `$lib/server/grpc/embedding-client.js` | 89 |
| `$lib/components/ui/Button.svelte` | 88 |
| `$lib/server/vector/qdrant-manager.js` | 78 |
| `$lib/server/db/schema` | 61 |
| `$lib/server/observability/langfuse.js` | 46 |
| `$lib/server/db/schema-postgres` | 40 |
| `$lib/server/gpu/simdjson-bridge.js` | 40 |
| `$lib/server/gpu/libtorch-bridge.js` | 38 |
| `$lib/server/analytics/search-analytics.js` | 38 |
| `$lib/server/ace/chat-memory.js` | 33 |
| `$lib/server/ace/context-assembler.js` | 32 |
| `$lib/server/ai/code-intel-service.js` | 31 |

---

## G20 — Cyclic Import Pairs (1 found · top 20)
- `tests/e2e/route-forensic/fixtures/db.ts` ↔ `tests/e2e/route-forensic/fixtures/forensic-page.ts`

---

## Svelte Components (60 shown of 883)
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
| `vitest` | 777 |
| `@sveltejs/kit` | 755 |
| `zod` | 552 |
| `$lib/server/db/client` | 436 |
| `$lib/server/env.server.js` | 429 |
| `drizzle-orm` | 350 |
| `$lib/components/ui/Icon.svelte` | 257 |
| `svelte` | 235 |
| `$lib/server/redis.js` | 169 |
| `$lib/server/ollama.js` | 154 |
| `@playwright/test` | 148 |
| `$lib/server/db/schema-postgres.js` | 137 |
| `$lib/server/middleware/cache-headers.js` | 111 |
| `path` | 107 |
| `$lib/server/validation.js` | 95 |
| `crypto` | 93 |
| `$lib/components/ui/Button.svelte` | 88 |
| `drizzle-orm/pg-core` | 82 |
| `$app/environment` | 80 |
| `$app/navigation` | 63 |
| `svelte/transition` | 62 |
| `fs` | 59 |
| `node:path` | 53 |
| `node:crypto` | 52 |
| `$lib/server/db/schema` | 48 |
| `$lib/server/grpc/embedding-client.js` | 47 |
| `ioredis` | 45 |
| `$lib/server/observability/langfuse.js` | 45 |
| `pg` | 45 |
| `bits-ui` | 43 |

---

## Directories with TODO/FIXME
- `src/lib` — 9 marker(s), score 100
- `src/lib/components` — 6 marker(s), score 80
- `src/lib/components/ui` — 3 marker(s), score 75
- `src/lib/workers` — 2 marker(s), score 83
- `src/routes` — 2 marker(s), score 92
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
