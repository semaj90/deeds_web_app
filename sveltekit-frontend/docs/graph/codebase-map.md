# Codebase Map — Directory Analysis
> Generated: 2026-05-03T23:54:32.382Z
> Mode: `fast-ast` · CPU-only · No GPU required
> Regenerate: `npm run index:codebase:fast:plan`

---

## Summary
| Metric | Count |
|--------|-------|
| Files scanned | 2576 |
| Directories analysed | 349 |
| Route files | 873 |
| Svelte components | 848 |
| API handlers | 1 |
| API routes without auth | 1 |
| Drizzle table refs | 407 |
| TODO/FIXME markers | 27 |

---

## Directory Scorecard (349 dirs · lowest score = most attention needed)

| Status | Directory | Score | Files | Lines | APIs | Auth | TODOs | Tags |
|--------|-----------|-------|-------|-------|------|------|-------|------|
| ⚠️ | `src/lib/utils` | 40 | 42 | 7054 | 0 | 2 | 7 | src, lib, utils, has-todo, auth |
| ⚠️ | `src/routes/api/hypergraph` | 45 | 1 | 151 | 1 | 0 | 0 | src, routes, api, route, api-handler |
| ⚠️ | `src/lib/ai` | 50 | 13 | 4966 | 0 | 0 | 1 | src, lib, ai, has-todo |
| ⚠️ | `src/lib/ai/onnx` | 50 | 2 | 340 | 0 | 0 | 1 | src, lib, ai, has-todo |
| ⚠️ | `src/lib/components/ui` | 50 | 245 | 24174 | 0 | 0 | 3 | src, lib, components, component, has-todo |
| ⚠️ | `src/lib/server/auth` | 50 | 1 | 42 | 0 | 0 | 1 | src, lib, server, has-todo |
| ⚠️ | `src/lib/services/error-analysis` | 50 | 17 | 4761 | 0 | 0 | 1 | src, lib, services, has-todo |
| ⚠️ | `src/lib/workers` | 50 | 4 | 1086 | 0 | 0 | 2 | mjs, src, lib, workers, has-todo |
| ⚠️ | `src/lib/server` | 55 | 57 | 129636 | 0 | 7 | 3 | src, lib, server, db-schema, auth, has-todo |
| ⚠️ | `src/lib/ai/e2b` | 60 | 2 | 524 | 0 | 0 | 0 | src, lib, ai |
| ⚠️ | `src/lib/cache` | 60 | 5 | 1046 | 0 | 0 | 0 | src, lib, cache |
| ⚠️ | `src/lib/client/db` | 60 | 1 | 91 | 0 | 0 | 0 | src, lib, client |
| ⚠️ | `src/lib/components/yorha` | 60 | 39 | 11961 | 0 | 0 | 1 | src, lib, components, component, has-todo |
| ⚠️ | `src/lib/config` | 60 | 8 | 1504 | 0 | 1 | 0 | src, lib, config, auth, json |
| ⚠️ | `src/lib/courtroom` | 60 | 4 | 1560 | 0 | 0 | 0 | src, lib, courtroom |
| ⚠️ | `src/lib/env` | 60 | 2 | 27 | 0 | 0 | 0 | src, lib, env |
| ⚠️ | `src/lib/features/poi` | 60 | 1 | 124 | 0 | 0 | 0 | src, lib, features |
| ⚠️ | `src/lib/gpu` | 60 | 16 | 4323 | 0 | 0 | 0 | src, lib, gpu |
| ⚠️ | `src/lib/models` | 60 | 1 | 1357 | 0 | 0 | 0 | src, lib, models |
| ⚠️ | `src/lib/schemas` | 60 | 5 | 1044 | 0 | 0 | 0 | src, lib, schemas, json |
| ⚠️ | `src/lib/schemas/tools` | 60 | 8 | 486 | 0 | 0 | 0 | json, src, lib, schemas |
| ⚠️ | `src/lib/server/acp` | 60 | 2 | 807 | 0 | 0 | 0 | src, lib, server |
| ⚠️ | `src/lib/server/api` | 60 | 1 | 195 | 0 | 0 | 0 | src, lib, server |
| ⚠️ | `src/lib/server/ast` | 60 | 1 | 313 | 0 | 0 | 0 | src, lib, server |
| ⚠️ | `src/lib/server/cache` | 60 | 8 | 2681 | 0 | 0 | 0 | src, lib, server |
| ⚠️ | `src/lib/server/cartridge` | 60 | 5 | 1614 | 0 | 0 | 0 | src, lib, server |
| ⚠️ | `src/lib/server/chrrom` | 60 | 3 | 412 | 0 | 0 | 0 | src, lib, server |
| ⚠️ | `src/lib/server/clients` | 60 | 1 | 17 | 0 | 0 | 0 | src, lib, server |
| ⚠️ | `src/lib/server/config` | 60 | 4 | 695 | 0 | 0 | 0 | src, lib, server |
| ⚠️ | `src/lib/server/connections` | 60 | 1 | 346 | 0 | 0 | 0 | src, lib, server |
| ⚠️ | `src/lib/server/data` | 60 | 2 | 459 | 0 | 0 | 0 | src, lib, server |
| ⚠️ | `src/lib/server/embeddings` | 60 | 1 | 70 | 0 | 0 | 0 | src, lib, server |
| ⚠️ | `src/lib/server/env` | 60 | 1 | 14 | 0 | 0 | 0 | src, lib, server |
| ⚠️ | `src/lib/server/glyph` | 60 | 2 | 170 | 0 | 0 | 0 | src, lib, server |
| ⚠️ | `src/lib/server/grpc` | 60 | 10 | 4100 | 0 | 0 | 0 | src, lib, server |
| ⚠️ | `src/lib/server/helpers` | 60 | 2 | 299 | 0 | 0 | 0 | src, lib, server |
| ⚠️ | `src/lib/server/image` | 60 | 1 | 88 | 0 | 0 | 0 | src, lib, server |
| ⚠️ | `src/lib/server/inference` | 60 | 4 | 2054 | 0 | 0 | 0 | src, lib, server |
| ⚠️ | `src/lib/server/init` | 60 | 1 | 105 | 0 | 0 | 0 | src, lib, server |
| ⚠️ | `src/lib/server/integrations` | 60 | 1 | 241 | 0 | 0 | 0 | src, lib, server |
| ⚠️ | `src/lib/server/kb` | 60 | 2 | 143 | 0 | 0 | 0 | src, lib, server |
| ⚠️ | `src/lib/server/langextract` | 60 | 1 | 132 | 0 | 0 | 0 | src, lib, server |
| ⚠️ | `src/lib/server/legal` | 60 | 7 | 2618 | 0 | 0 | 0 | src, lib, server |
| ⚠️ | `src/lib/server/mcp` | 60 | 3 | 394 | 0 | 0 | 0 | src, lib, server |
| ⚠️ | `src/lib/server/middleware` | 60 | 4 | 693 | 0 | 0 | 0 | src, lib, server |
| ⚠️ | `src/lib/server/minio` | 60 | 2 | 321 | 0 | 0 | 0 | src, lib, server |
| ⚠️ | `src/lib/server/nlp` | 60 | 1 | 140 | 0 | 0 | 0 | src, lib, server |
| ⚠️ | `src/lib/server/notifications` | 60 | 1 | 210 | 0 | 0 | 0 | src, lib, server |
| ⚠️ | `src/lib/server/observability` | 60 | 3 | 970 | 0 | 0 | 0 | src, lib, server |
| ⚠️ | `src/lib/server/ocr` | 60 | 3 | 392 | 0 | 0 | 0 | src, lib, server |
| ⚠️ | `src/lib/server/optimize` | 60 | 1 | 42 | 0 | 0 | 0 | src, lib, server |
| ⚠️ | `src/lib/server/orchestrators` | 60 | 1 | 39 | 0 | 0 | 0 | src, lib, server |
| ⚠️ | `src/lib/server/pdf` | 60 | 2 | 314 | 0 | 0 | 0 | src, lib, server |
| ⚠️ | `src/lib/server/pgai` | 60 | 3 | 69 | 0 | 0 | 0 | src, lib, server |
| ⚠️ | `src/lib/server/phase72` | 60 | 3 | 185 | 0 | 0 | 0 | src, lib, server |
| ⚠️ | `src/lib/server/phase78` | 60 | 1 | 402 | 0 | 0 | 0 | src, lib, server |
| ⚠️ | `src/lib/server/pipeline` | 60 | 1 | 211 | 0 | 0 | 0 | src, lib, server |
| ⚠️ | `src/lib/server/rag` | 60 | 7 | 527 | 0 | 0 | 0 | src, lib, server |
| ⚠️ | `src/lib/server/rate-limit` | 60 | 2 | 318 | 0 | 0 | 0 | src, lib, server |
| ⚠️ | `src/lib/server/search` | 60 | 1 | 241 | 0 | 0 | 0 | src, lib, server |
| ⚠️ | `src/lib/server/security` | 60 | 1 | 131 | 0 | 0 | 0 | src, lib, server |
| ⚠️ | `src/lib/server/services` | 60 | 2 | 703 | 0 | 0 | 0 | src, lib, server |
| ⚠️ | `src/lib/server/simulation` | 60 | 2 | 477 | 0 | 0 | 0 | src, lib, server |
| ⚠️ | `src/lib/server/startup` | 60 | 1 | 114 | 0 | 0 | 0 | src, lib, server |
| ⚠️ | `src/lib/server/storage` | 60 | 2 | 568 | 0 | 0 | 0 | src, lib, server |
| ⚠️ | `src/lib/server/streaming` | 60 | 2 | 364 | 0 | 0 | 0 | src, lib, server |
| ⚠️ | `src/lib/server/tools` | 60 | 9 | 1508 | 0 | 0 | 0 | src, lib, server |
| ⚠️ | `src/lib/server/training` | 60 | 1 | 111 | 0 | 0 | 0 | src, lib, server |
| ⚠️ | `src/lib/server/utils` | 60 | 13 | 941 | 0 | 0 | 0 | src, lib, server |
| ⚠️ | `src/lib/server/validation` | 60 | 2 | 402 | 0 | 0 | 0 | src, lib, server |
| ⚠️ | `src/lib/shared` | 60 | 3 | 284 | 0 | 0 | 0 | src, lib, shared |
| ⚠️ | `src/lib/shared/schemas` | 60 | 1 | 32 | 0 | 0 | 0 | src, lib, shared |
| ⚠️ | `src/lib/shared/types` | 60 | 1 | 14 | 0 | 0 | 0 | src, lib, shared |
| ⚠️ | `src/lib/stores` | 60 | 14 | 4488 | 0 | 0 | 0 | src, lib, stores |
| ⚠️ | `src/lib/stores/dashboard` | 60 | 3 | 654 | 0 | 0 | 0 | src, lib, stores |
| ⚠️ | `src/lib/stores/unified` | 60 | 6 | 1211 | 0 | 0 | 0 | src, lib, stores |
| ⚠️ | `src/lib/test-utils` | 60 | 1 | 11 | 0 | 0 | 0 | src, lib, test-utils |
| ⚠️ | `src/lib/webgpu` | 60 | 19 | 5518 | 0 | 0 | 0 | src, lib, webgpu |
| ⚠️ | `src/mcp/tools` | 60 | 1 | 195 | 0 | 0 | 0 | src, mcp, tools |
| ⚠️ | `src/shims` | 60 | 1 | 1 | 0 | 0 | 0 | mjs, src, shims, camelcase-compat.mjs |
| ⚠️ | `src/stores` | 60 | 1 | 47 | 0 | 0 | 0 | src, stores, user.ts |
| ⚠️ | `src/tests` | 60 | 1 | 10 | 0 | 0 | 0 | src, tests, setup.ts |
| ⚠️ | `src/wasm` | 60 | 2 | 524 | 0 | 0 | 0 | src, wasm, vector-operations-basic.ts, vector-operations.ts |
| ⚠️ | `src/workers` | 60 | 2 | 54 | 0 | 0 | 0 | src, workers, ingestion-worker.ts, kmeans-worker.js |
| ⚠️ | `src/lib` | 65 | 11 | 353632 | 0 | 10 | 20 | src, lib, ai, has-todo, ambient-events.d.ts, cache |
| ⚠️ | `src/lib/components` | 65 | 56 | 159240 | 0 | 0 | 6 | src, lib, components, component, db-schema, has-todo |
| ⚠️ | `src/lib/server/error-brain` | 65 | 11 | 1136 | 0 | 0 | 1 | src, lib, server, db-schema, has-todo |
| ⚠️ | `src/lib/services` | 65 | 7 | 9598 | 0 | 0 | 1 | src, lib, services, has-todo, db-schema |
| ✅ | `src/lib/client` | 70 | 4 | 766 | 0 | 0 | 0 | src, lib, client, component |
| ✅ | `src/lib/client/ui` | 70 | 1 | 126 | 0 | 0 | 0 | src, lib, client, component |
| ✅ | `src/lib/components/admin` | 70 | 5 | 2560 | 0 | 0 | 0 | src, lib, components, component |
| ✅ | `src/lib/components/agent` | 70 | 1 | 391 | 0 | 0 | 0 | src, lib, components, component |
| ✅ | `src/lib/components/agentic` | 70 | 2 | 498 | 0 | 0 | 0 | src, lib, components, component |
| ✅ | `src/lib/components/ai` | 70 | 46 | 19715 | 0 | 0 | 0 | src, lib, components, component |
| ✅ | `src/lib/components/analysis` | 70 | 3 | 2809 | 0 | 0 | 0 | src, lib, components, component |
| ✅ | `src/lib/components/analytics` | 70 | 2 | 1161 | 0 | 0 | 0 | src, lib, components, component |
| ✅ | `src/lib/components/audio` | 70 | 1 | 631 | 0 | 0 | 0 | src, lib, components, component |
| ✅ | `src/lib/components/cache` | 70 | 3 | 1005 | 0 | 0 | 0 | src, lib, components, component |
| ✅ | `src/lib/components/canvas` | 70 | 6 | 2338 | 0 | 0 | 0 | src, lib, components, component |
| ✅ | `src/lib/components/case` | 70 | 3 | 670 | 0 | 0 | 0 | src, lib, components, component |
| ✅ | `src/lib/components/cases` | 70 | 11 | 3154 | 0 | 0 | 0 | src, lib, components, component |
| ✅ | `src/lib/components/charges` | 70 | 1 | 211 | 0 | 0 | 0 | src, lib, components, component |
| ✅ | `src/lib/components/chat` | 70 | 4 | 768 | 0 | 0 | 0 | src, lib, components, component |
| ✅ | `src/lib/components/citations` | 70 | 5 | 2030 | 0 | 0 | 0 | src, lib, components, component |
| ✅ | `src/lib/components/codebase` | 70 | 12 | 5497 | 0 | 0 | 0 | src, lib, components, component |
| ✅ | `src/lib/components/courtroom` | 70 | 2 | 1505 | 0 | 0 | 0 | src, lib, components, component |
| ✅ | `src/lib/components/dashboard` | 70 | 15 | 3181 | 0 | 0 | 0 | src, lib, components, component |
| ✅ | `src/lib/components/demos` | 70 | 1 | 359 | 0 | 0 | 0 | src, lib, components, component |
| ✅ | `src/lib/components/detective` | 70 | 6 | 1884 | 0 | 0 | 0 | src, lib, components, component |
| ✅ | `src/lib/components/document` | 70 | 1 | 401 | 0 | 0 | 0 | src, lib, components, component |
| ✅ | `src/lib/components/editor` | 70 | 7 | 2398 | 0 | 0 | 0 | src, lib, components, component |
| ✅ | `src/lib/components/editors` | 70 | 1 | 55 | 0 | 0 | 0 | src, lib, components, component |
| ✅ | `src/lib/components/evidence` | 70 | 41 | 14655 | 0 | 0 | 0 | src, lib, components, component |
| ✅ | `src/lib/components/forms` | 70 | 7 | 4163 | 0 | 0 | 0 | src, lib, components, component |
| ✅ | `src/lib/components/glyph` | 70 | 1 | 784 | 0 | 0 | 0 | src, lib, components, component |
| ✅ | `src/lib/components/layout` | 70 | 1 | 399 | 0 | 0 | 0 | src, lib, components, component |
| ✅ | `src/lib/components/legal` | 70 | 33 | 11235 | 0 | 0 | 0 | src, lib, components, component |
| ✅ | `src/lib/components/legal-ai` | 70 | 18 | 7563 | 0 | 0 | 0 | src, lib, components, component |
| ✅ | `src/lib/components/legal-corpus` | 70 | 8 | 2918 | 0 | 0 | 0 | src, lib, components, component |
| ✅ | `src/lib/components/library` | 70 | 1 | 70 | 0 | 0 | 0 | src, lib, components, component |
| ✅ | `src/lib/components/modals` | 70 | 2 | 1074 | 0 | 0 | 0 | src, lib, components, component |
| ✅ | `src/lib/components/monitoring` | 70 | 3 | 843 | 0 | 0 | 0 | src, lib, components, component |
| ✅ | `src/lib/components/nes` | 70 | 1 | 185 | 0 | 0 | 0 | src, lib, components, component |
| ✅ | `src/lib/components/onboarding` | 70 | 1 | 1050 | 0 | 0 | 0 | src, lib, components, component |
| ✅ | `src/lib/components/phase78` | 70 | 3 | 628 | 0 | 0 | 0 | src, lib, components, component |
| ✅ | `src/lib/components/poi` | 70 | 10 | 2460 | 0 | 0 | 0 | src, lib, components, component |
| ✅ | `src/lib/components/rag` | 70 | 4 | 1259 | 0 | 0 | 0 | src, lib, components, component |
| ✅ | `src/lib/components/recommendations` | 70 | 2 | 661 | 0 | 0 | 0 | src, lib, components, component |
| ✅ | `src/lib/components/reports` | 70 | 1 | 244 | 0 | 0 | 0 | src, lib, components, component |
| ✅ | `src/lib/components/research` | 70 | 1 | 585 | 0 | 0 | 0 | src, lib, components, component |
| ✅ | `src/lib/components/shells` | 70 | 4 | 832 | 0 | 0 | 0 | src, lib, components, component |
| ✅ | `src/lib/components/source-validation` | 70 | 4 | 1091 | 0 | 0 | 0 | src, lib, components, component |
| ✅ | `src/lib/components/subcomponents` | 70 | 1 | 67 | 0 | 0 | 0 | src, lib, components, component |
| ✅ | `src/lib/components/terminal` | 70 | 1 | 235 | 0 | 0 | 0 | src, lib, components, component |
| ✅ | `src/lib/components/video` | 70 | 1 | 891 | 0 | 0 | 0 | src, lib, components, component |
| ✅ | `src/lib/components/visualization` | 70 | 1 | 102 | 0 | 0 | 0 | src, lib, components, component |
| ✅ | `src/lib/features/evidence-command-center` | 70 | 5 | 419 | 0 | 0 | 0 | src, lib, features, component |
| ✅ | `src/lib/icons/yorha` | 70 | 15 | 572 | 0 | 0 | 0 | src, lib, icons, component |
| ✅ | `src/lib/machines` | 70 | 12 | 4613 | 0 | 0 | 0 | src, lib, machines, component |
| ✅ | `src/routes/(admin)/error-brain` | 70 | 3 | 628 | 0 | 0 | 0 | src, routes, (admin), component |
| ✅ | `src/lib/data` | 75 | 5 | 1682 | 0 | 0 | 0 | json, src, lib, data, db-schema |
| ✅ | `src/lib/db` | 75 | 4 | 2892 | 0 | 0 | 0 | src, lib, db, db-schema |
| ✅ | `src/lib/db/queries` | 75 | 2 | 881 | 0 | 0 | 0 | src, lib, db, db-schema |
| ✅ | `src/lib/db/schema` | 75 | 6 | 890 | 0 | 0 | 0 | src, lib, db, db-schema |
| ✅ | `src/lib/server/ace` | 75 | 17 | 7046 | 0 | 0 | 0 | src, lib, server, db-schema |
| ✅ | `src/lib/server/adapters` | 75 | 1 | 638 | 0 | 0 | 0 | src, lib, server, db-schema |
| ✅ | `src/lib/server/agent` | 75 | 11 | 4178 | 0 | 0 | 0 | src, lib, server, db-schema |
| ✅ | `src/lib/server/ai` | 75 | 23 | 6195 | 0 | 1 | 0 | src, lib, server, db-schema, auth |
| ✅ | `src/lib/server/analysis` | 75 | 11 | 2781 | 0 | 0 | 0 | src, lib, server, db-schema |
| ✅ | `src/lib/server/analytics` | 75 | 15 | 6690 | 0 | 0 | 0 | src, lib, server, db-schema |
| ✅ | `src/lib/server/audit` | 75 | 4 | 1415 | 0 | 0 | 0 | src, lib, server, db-schema |
| ✅ | `src/lib/server/cases` | 75 | 1 | 189 | 0 | 0 | 0 | src, lib, server, db-schema |
| ✅ | `src/lib/server/codeintel` | 75 | 1 | 498 | 0 | 0 | 0 | src, lib, server, db-schema |
| ✅ | `src/lib/server/concurrency` | 75 | 3 | 741 | 0 | 0 | 0 | src, lib, server, db-schema |
| ✅ | `src/lib/server/db` | 75 | 106 | 17492 | 0 | 0 | 0 | src, lib, server, db-schema, json |
| ✅ | `src/lib/server/embedding` | 75 | 8 | 1052 | 0 | 0 | 0 | src, lib, server, db-schema |
| ✅ | `src/lib/server/engagement` | 75 | 1 | 367 | 0 | 0 | 0 | src, lib, server, db-schema |
| ✅ | `src/lib/server/evidence` | 75 | 14 | 1216 | 0 | 0 | 0 | src, lib, server, db-schema |
| ✅ | `src/lib/server/gpu` | 75 | 9 | 3515 | 0 | 0 | 0 | src, lib, server, db-schema, mjs |
| ✅ | `src/lib/server/graph` | 75 | 16 | 6577 | 0 | 1 | 0 | src, lib, server, auth, db-schema |
| ✅ | `src/lib/server/indexer` | 75 | 11 | 5089 | 0 | 0 | 0 | src, lib, server, db-schema |
| ✅ | `src/lib/server/llm` | 75 | 6 | 1643 | 0 | 0 | 0 | src, lib, server, db-schema |
| ✅ | `src/lib/server/ml` | 75 | 8 | 2973 | 0 | 0 | 0 | src, lib, server, db-schema |
| ✅ | `src/lib/server/queue` | 75 | 8 | 3812 | 0 | 0 | 0 | src, lib, server, db-schema |
| ✅ | `src/lib/server/reports` | 75 | 1 | 112 | 0 | 0 | 0 | src, lib, server, db-schema |
| ✅ | `src/lib/server/research` | 75 | 13 | 1380 | 0 | 0 | 0 | src, lib, server, db-schema |
| ✅ | `src/lib/server/retrieval` | 75 | 24 | 6342 | 0 | 0 | 0 | src, lib, server, db-schema |
| ✅ | `src/lib/server/types` | 75 | 10 | 1099 | 0 | 0 | 0 | src, lib, server, db-schema |
| ✅ | `src/lib/server/unified` | 75 | 1 | 284 | 0 | 0 | 0 | src, lib, server, db-schema |
| ✅ | `src/lib/server/vector` | 75 | 10 | 2831 | 0 | 0 | 0 | src, lib, server, db-schema |
| ✅ | `src/lib/server/workers` | 75 | 5 | 1759 | 0 | 0 | 0 | src, lib, server, db-schema |
| ✅ | `src/lib/services/knowledge-search` | 75 | 11 | 3965 | 0 | 0 | 0 | src, lib, services, db-schema |
| ✅ | `src/lib/shims` | 75 | 11 | 1235 | 0 | 0 | 0 | src, lib, shims, db-schema |
| ✅ | `src/lib/types` | 75 | 51 | 7019 | 0 | 0 | 0 | src, lib, types, db-schema |
| ✅ | `src/mcp` | 75 | 2 | 4428 | 0 | 0 | 0 | src, mcp, index.ts, server.ts, db-schema, tools |
| ✅ | `src/routes/(app)/ai-dashboard` | 75 | 1 | 6 | 0 | 0 | 0 | src, routes, (app), route |
| ✅ | `src/routes/(app)/all-routes` | 75 | 1 | 6 | 0 | 0 | 0 | src, routes, (app), route |
| ✅ | `src/routes/(app)/chat` | 75 | 4 | 865 | 0 | 2 | 1 | src, routes, (app), route, has-todo, auth |
| ✅ | `src/routes/(app)/error-brain` | 75 | 1 | 6 | 0 | 0 | 0 | src, routes, (app), route |
| ✅ | `src/routes/(app)/gpu-evidence-graph` | 75 | 1 | 6 | 0 | 0 | 0 | src, routes, (app), route |
| ✅ | `src/routes/.well-known/agent.json` | 75 | 1 | 119 | 0 | 0 | 0 | src, routes, .well-known, route |
| ✅ | `src/routes/.well-known/appspecific` | 75 | 1 | 22 | 0 | 0 | 0 | src, routes, .well-known, route |
| ✅ | `src/routes/api/acp` | 75 | 2 | 114 | 0 | 2 | 0 | src, routes, api, route, auth |
| ✅ | `src/routes/api/agents` | 75 | 1 | 295 | 0 | 1 | 0 | src, routes, api, route, auth |
| ✅ | `src/routes/api/audit` | 75 | 2 | 200 | 0 | 2 | 0 | src, routes, api, route, auth |
| ✅ | `src/routes/api/cache` | 75 | 14 | 1426 | 0 | 12 | 0 | src, routes, api, route, auth |
| ✅ | `src/routes/api/cartridge` | 75 | 6 | 669 | 0 | 6 | 0 | src, routes, api, route, auth |
| ✅ | `src/routes/api/case-theory` | 75 | 1 | 170 | 0 | 1 | 0 | src, routes, api, route, auth |
| ✅ | `src/routes/api/charges` | 75 | 1 | 45 | 0 | 1 | 0 | src, routes, api, route, auth |
| ✅ | `src/routes/api/chrrom` | 75 | 3 | 169 | 0 | 3 | 0 | src, routes, api, route, auth |
| ✅ | `src/routes/api/detective` | 75 | 2 | 434 | 0 | 2 | 0 | src, routes, api, route, auth |
| ✅ | `src/routes/api/docs` | 75 | 1 | 56 | 0 | 0 | 0 | src, routes, api, route |
| ✅ | `src/routes/api/embed` | 75 | 1 | 125 | 0 | 1 | 0 | src, routes, api, route, auth |
| ✅ | `src/routes/api/engagement` | 75 | 2 | 61 | 0 | 2 | 0 | src, routes, api, route, auth |
| ✅ | `src/routes/api/feedback` | 75 | 1 | 41 | 0 | 1 | 0 | src, routes, api, route, auth |
| ✅ | `src/routes/api/gpu` | 75 | 3 | 277 | 0 | 3 | 0 | src, routes, api, route, auth |
| ✅ | `src/routes/api/gpu-wasm-integration` | 75 | 1 | 288 | 0 | 1 | 0 | src, routes, api, route, auth |
| ✅ | `src/routes/api/indexing` | 75 | 1 | 547 | 0 | 1 | 0 | src, routes, api, route, auth |
| ✅ | `src/routes/api/ingest` | 75 | 2 | 349 | 0 | 2 | 0 | src, routes, api, route, auth |
| ✅ | `src/routes/api/ingest-constitution` | 75 | 1 | 47 | 0 | 1 | 0 | src, routes, api, route, auth |
| ✅ | `src/routes/api/investigate` | 75 | 1 | 179 | 0 | 1 | 0 | src, routes, api, route, auth |
| ✅ | `src/routes/api/kb` | 75 | 2 | 251 | 0 | 2 | 0 | src, routes, api, route, auth |
| ✅ | `src/routes/api/knowledge` | 75 | 8 | 1696 | 0 | 7 | 0 | src, routes, api, route, auth |
| ✅ | `src/routes/api/mcp` | 75 | 1 | 99 | 0 | 0 | 0 | src, routes, api, route |
| ✅ | `src/routes/api/metrics` | 75 | 1 | 84 | 0 | 1 | 0 | src, routes, api, route, auth |
| ✅ | `src/routes/api/ml` | 75 | 1 | 132 | 0 | 1 | 0 | src, routes, api, route, auth |
| ✅ | `src/routes/api/nlp` | 75 | 2 | 60 | 0 | 2 | 0 | src, routes, api, route, auth |
| ✅ | `src/routes/api/observability` | 75 | 1 | 35 | 0 | 1 | 0 | src, routes, api, route, auth |
| ✅ | `src/routes/api/obsidian` | 75 | 1 | 147 | 0 | 1 | 0 | src, routes, api, route, auth |
| ✅ | `src/routes/api/ollama` | 75 | 2 | 175 | 0 | 2 | 0 | src, routes, api, route, auth |
| ✅ | `src/routes/api/orchestrator` | 75 | 1 | 79 | 0 | 1 | 0 | src, routes, api, route, auth |
| ✅ | `src/routes/api/pgai` | 75 | 3 | 104 | 0 | 3 | 0 | src, routes, api, route, auth |
| ✅ | `src/routes/api/phase109` | 75 | 2 | 259 | 0 | 2 | 0 | src, routes, api, route, auth |
| ✅ | `src/routes/api/phase89` | 75 | 24 | 2425 | 0 | 24 | 0 | src, routes, api, route, auth |
| ✅ | `src/routes/api/ping` | 75 | 1 | 13 | 0 | 0 | 0 | src, routes, api, route |
| ✅ | `src/routes/api/pipeline` | 75 | 2 | 124 | 0 | 2 | 0 | src, routes, api, route, auth |
| ✅ | `src/routes/api/playwright` | 75 | 1 | 44 | 0 | 1 | 0 | src, routes, api, route, auth |
| ✅ | `src/routes/api/queue` | 75 | 1 | 26 | 0 | 0 | 0 | src, routes, api, route |
| ✅ | `src/routes/api/rabbitmq` | 75 | 1 | 134 | 0 | 1 | 0 | src, routes, api, route, auth |
| ✅ | `src/routes/api/research` | 75 | 4 | 729 | 0 | 4 | 0 | src, routes, api, route, auth |
| ✅ | `src/routes/api/route-operations` | 75 | 1 | 49 | 0 | 1 | 0 | src, routes, api, route, auth |
| ✅ | `src/routes/api/security` | 75 | 1 | 45 | 0 | 1 | 0 | src, routes, api, route, auth |
| ✅ | `src/routes/api/summarize` | 75 | 3 | 217 | 0 | 3 | 0 | src, routes, api, route, auth |
| ✅ | `src/routes/api/test` | 75 | 8 | 776 | 0 | 0 | 0 | src, routes, api, route |
| ✅ | `src/routes/api/tools` | 75 | 4 | 296 | 0 | 4 | 0 | src, routes, api, route, auth |
| ✅ | `src/routes/api/topology` | 75 | 2 | 215 | 0 | 2 | 0 | src, routes, api, route, auth |
| ✅ | `src/routes/api/user` | 75 | 1 | 91 | 0 | 1 | 0 | src, routes, api, route, auth |
| ✅ | `src/routes/api/vector-search` | 75 | 1 | 110 | 0 | 1 | 0 | src, routes, api, route, auth |
| ✅ | `src/routes/api/video` | 75 | 1 | 105 | 0 | 1 | 0 | src, routes, api, route, auth |
| ✅ | `src/routes/api/vision` | 75 | 1 | 233 | 0 | 1 | 0 | src, routes, api, route, auth |
| ✅ | `src/routes/api/web` | 75 | 2 | 181 | 0 | 2 | 0 | src, routes, api, route, auth |
| ✅ | `src/routes/api/websearch` | 75 | 1 | 63 | 0 | 1 | 0 | src, routes, api, route, auth |
| ✅ | `src/routes/api/whisper` | 75 | 1 | 417 | 0 | 1 | 0 | src, routes, api, route, auth |
| ✅ | `src/routes/api/worker` | 75 | 1 | 186 | 0 | 1 | 0 | src, routes, api, route, auth |
| ✅ | `src/routes/api/workflow-events` | 75 | 1 | 133 | 0 | 1 | 0 | src, routes, api, route, auth |
| ✅ | `src/routes/minio/[...path]` | 75 | 1 | 57 | 0 | 1 | 0 | src, routes, minio, route, auth |
| ✅ | `src/types` | 75 | 23 | 889 | 0 | 0 | 0 | src, types, ai-bridge.d.ts, ambient.d.ts, db-schema, cbor.d.ts |
| ✅ | `src/routes/(app)` | 80 | 2 | 109217 | 0 | 45 | 6 | src, routes, (app), auth, route, component |
| ✅ | `src/routes/(app)/admin` | 80 | 72 | 25781 | 0 | 7 | 4 | src, routes, (app), route, component, auth |
| ✅ | `src/routes/api/synthesis` | 80 | 7 | 1854 | 0 | 7 | 1 | src, routes, api, route, auth, has-todo |
| ✅ | `src/routes/(analysis)` | 85 | 2 | 2990 | 0 | 4 | 0 | src, routes, (analysis), auth, route, component |
| ✅ | `src/routes/(analysis)/audio-analysis` | 85 | 2 | 929 | 0 | 1 | 0 | src, routes, (analysis), route, auth, component |
| ✅ | `src/routes/(analysis)/document-analysis` | 85 | 2 | 935 | 0 | 1 | 0 | src, routes, (analysis), route, auth, component |
| ✅ | `src/routes/(analysis)/video-analysis` | 85 | 2 | 1047 | 0 | 1 | 0 | src, routes, (analysis), route, auth, component |
| ✅ | `src/routes/(analysis)@` | 85 | 2 | 2717 | 0 | 4 | 0 | src, routes, (analysis)@, auth, route, component |
| ✅ | `src/routes/(analysis)@/audio-analysis` | 85 | 2 | 838 | 0 | 1 | 0 | src, routes, (analysis)@, route, auth, component |
| ✅ | `src/routes/(analysis)@/document-analysis` | 85 | 2 | 801 | 0 | 1 | 0 | src, routes, (analysis)@, route, auth, component |
| ✅ | `src/routes/(analysis)@/video-analysis` | 85 | 2 | 999 | 0 | 1 | 0 | src, routes, (analysis)@, route, auth, component |
| ✅ | `src/routes/(app)/analytics` | 85 | 2 | 2385 | 0 | 0 | 0 | src, routes, (app), route, component |
| ✅ | `src/routes/(app)/cache-monitor` | 85 | 1 | 146 | 0 | 0 | 0 | src, routes, (app), route, component |
| ✅ | `src/routes/(app)/citations` | 85 | 9 | 2380 | 0 | 0 | 0 | src, routes, (app), route, component |
| ✅ | `src/routes/(app)/codebase-graph` | 85 | 3 | 583 | 0 | 0 | 0 | src, routes, (app), route, component |
| ✅ | `src/routes/(app)/codebase-wiki` | 85 | 1 | 25 | 0 | 0 | 0 | src, routes, (app), route, component |
| ✅ | `src/routes/(app)/couchdb-analytics` | 85 | 5 | 1833 | 0 | 0 | 0 | src, routes, (app), route, component |
| ✅ | `src/routes/(app)/dashboard` | 85 | 1 | 1995 | 0 | 0 | 0 | src, routes, (app), route, component |
| ✅ | `src/routes/(app)/evidence-library` | 85 | 2 | 281 | 0 | 1 | 0 | src, routes, (app), route, auth, component |
| ✅ | `src/routes/(app)/fictional-cases` | 85 | 4 | 1011 | 0 | 2 | 0 | src, routes, (app), route, auth, component |
| ✅ | `src/routes/(app)/global-search` | 85 | 2 | 2394 | 0 | 0 | 0 | src, routes, (app), route, component |
| ✅ | `src/routes/(app)/indexing` | 85 | 1 | 960 | 0 | 0 | 0 | src, routes, (app), route, component |
| ✅ | `src/routes/(app)/knowledge` | 85 | 1 | 517 | 0 | 0 | 0 | src, routes, (app), route, component |
| ✅ | `src/routes/(app)/legal-corpus-premium` | 85 | 1 | 1155 | 0 | 0 | 0 | src, routes, (app), route, component |
| ✅ | `src/routes/(app)/library` | 85 | 13 | 4358 | 0 | 3 | 0 | src, routes, (app), route, component, auth |
| ✅ | `src/routes/(app)/rag-search` | 85 | 2 | 370 | 0 | 0 | 0 | src, routes, (app), route, component |
| ✅ | `src/routes/(app)/recommendations` | 85 | 2 | 734 | 0 | 1 | 0 | src, routes, (app), route, auth, component |
| ✅ | `src/routes/(app)/system-configuration` | 85 | 1 | 838 | 0 | 0 | 0 | src, routes, (app), route, component |
| ✅ | `src/routes/(app)/webgpu-similarity` | 85 | 1 | 12 | 0 | 0 | 0 | src, routes, (app), route, component |
| ✅ | `src/routes/(dev)/cache-demo` | 85 | 1 | 261 | 0 | 0 | 0 | src, routes, (dev), route, component |
| ✅ | `src/routes/(dev)/demo` | 85 | 3 | 538 | 0 | 0 | 0 | src, routes, (dev), route, component |
| ✅ | `src/routes/(dev)/odin` | 85 | 2 | 323 | 0 | 1 | 0 | src, routes, (dev), route, auth, component |
| ✅ | `src/routes/(dev)/test-source-validation` | 85 | 1 | 381 | 0 | 0 | 0 | src, routes, (dev), route, component |
| ✅ | `src/routes/(dev)/tts-demo` | 85 | 2 | 84 | 0 | 0 | 0 | src, routes, (dev), route, component |
| ✅ | `src/routes/(dev)/voice-chat-demo` | 85 | 2 | 329 | 0 | 0 | 0 | src, routes, (dev), route, component |
| ✅ | `src/routes/register` | 85 | 1 | 542 | 0 | 0 | 0 | src, routes, register, route, component |
| ✅ | `src/routes/(app)/demos` | 90 | 184 | 28199 | 0 | 2 | 1 | src, routes, (app), route, component, db-schema |
| ✅ | `src/routes/api/ace` | 90 | 8 | 1706 | 0 | 8 | 0 | src, routes, api, route, auth, db-schema |
| ✅ | `src/routes/api/admin` | 90 | 10 | 1790 | 0 | 10 | 0 | src, routes, api, route, auth, db-schema |
| ✅ | `src/routes/api/agent` | 90 | 1 | 453 | 0 | 1 | 0 | src, routes, api, route, db-schema, auth |
| ✅ | `src/routes/api/ai` | 90 | 29 | 2965 | 0 | 28 | 0 | src, routes, api, route, auth, db-schema |
| ✅ | `src/routes/api/analysis` | 90 | 1 | 240 | 0 | 1 | 0 | src, routes, api, route, db-schema, auth |
| ✅ | `src/routes/api/analytics` | 90 | 26 | 4107 | 0 | 25 | 0 | src, routes, api, route, auth, db-schema |
| ✅ | `src/routes/api/analyze-file` | 90 | 1 | 295 | 0 | 1 | 0 | src, routes, api, route, db-schema, auth |
| ✅ | `src/routes/api/analyze-tag` | 90 | 1 | 185 | 0 | 1 | 0 | src, routes, api, route, db-schema, auth |
| ✅ | `src/routes/api/audio` | 90 | 4 | 506 | 0 | 4 | 0 | src, routes, api, route, auth, db-schema |
| ✅ | `src/routes/api/auth` | 90 | 10 | 758 | 0 | 3 | 0 | src, routes, api, route, auth, db-schema |
| ✅ | `src/routes/api/canon` | 90 | 4 | 574 | 0 | 4 | 0 | src, routes, api, route, db-schema, auth |
| ✅ | `src/routes/api/cases` | 90 | 25 | 4737 | 0 | 25 | 0 | src, routes, api, route, db-schema, auth |
| ✅ | `src/routes/api/chat` | 90 | 7 | 1334 | 0 | 7 | 0 | src, routes, api, route, auth, db-schema |
| ✅ | `src/routes/api/citations` | 90 | 10 | 1739 | 0 | 10 | 0 | src, routes, api, route, db-schema, auth |
| ✅ | `src/routes/api/codebase` | 90 | 12 | 1909 | 0 | 10 | 0 | src, routes, api, route, auth, db-schema |
| ✅ | `src/routes/api/codebase-index` | 90 | 43 | 12499 | 0 | 42 | 0 | src, routes, api, route, auth, db-schema |
| ✅ | `src/routes/api/codeintel` | 90 | 9 | 1035 | 0 | 9 | 0 | src, routes, api, route, auth, db-schema |
| ✅ | `src/routes/api/consolidation` | 90 | 1 | 42 | 0 | 1 | 0 | src, routes, api, route, db-schema, auth |
| ✅ | `src/routes/api/contextual` | 90 | 4 | 708 | 0 | 4 | 0 | src, routes, api, route, db-schema, auth |
| ✅ | `src/routes/api/conversations` | 90 | 1 | 141 | 0 | 1 | 0 | src, routes, api, route, db-schema, auth |
| ✅ | `src/routes/api/courtroom` | 90 | 1 | 153 | 0 | 1 | 0 | src, routes, api, route, db-schema, auth |
| ✅ | `src/routes/api/dashboard` | 90 | 1 | 111 | 0 | 1 | 0 | src, routes, api, route, db-schema, auth |
| ✅ | `src/routes/api/db` | 90 | 1 | 29 | 0 | 0 | 0 | src, routes, api, route, db-schema |
| ✅ | `src/routes/api/dev` | 90 | 1 | 63 | 0 | 1 | 0 | src, routes, api, route, db-schema, auth |
| ✅ | `src/routes/api/document` | 90 | 2 | 148 | 0 | 2 | 0 | src, routes, api, route, auth, db-schema |
| ✅ | `src/routes/api/documents` | 90 | 3 | 327 | 0 | 3 | 0 | src, routes, api, route, auth, db-schema |
| ✅ | `src/routes/api/error-brain` | 90 | 11 | 2490 | 0 | 11 | 0 | src, routes, api, route, db-schema, auth |
| ✅ | `src/routes/api/errors` | 90 | 3 | 253 | 0 | 3 | 0 | src, routes, api, route, auth, db-schema |
| ✅ | `src/routes/api/evidence` | 90 | 27 | 5594 | 0 | 26 | 0 | src, routes, api, route, db-schema, auth |
| ✅ | `src/routes/api/fictional-cases` | 90 | 2 | 295 | 0 | 2 | 0 | src, routes, api, route, db-schema, auth |
| ✅ | `src/routes/api/generate-cluster-summaries` | 90 | 1 | 379 | 0 | 1 | 0 | src, routes, api, route, db-schema, auth |
| ✅ | `src/routes/api/glossary` | 90 | 3 | 526 | 0 | 3 | 0 | src, routes, api, route, db-schema, auth |
| ✅ | `src/routes/api/glyph` | 90 | 3 | 487 | 0 | 3 | 0 | src, routes, api, route, auth, db-schema |
| ✅ | `src/routes/api/graph` | 90 | 11 | 1630 | 0 | 9 | 0 | src, routes, api, route, auth, db-schema |
| ✅ | `src/routes/api/health` | 90 | 15 | 1792 | 0 | 1 | 0 | src, routes, api, route, db-schema, auth |
| ✅ | `src/routes/api/infrastructure` | 90 | 1 | 335 | 0 | 0 | 0 | src, routes, api, route, db-schema |
| ✅ | `src/routes/api/internal` | 90 | 2 | 114 | 0 | 2 | 0 | src, routes, api, route, db-schema, auth |
| ✅ | `src/routes/api/library` | 90 | 21 | 2860 | 0 | 21 | 0 | src, routes, api, route, auth, db-schema |
| ✅ | `src/routes/api/onboarding` | 90 | 1 | 120 | 0 | 1 | 0 | src, routes, api, route, db-schema, auth |
| ✅ | `src/routes/api/persons` | 90 | 2 | 437 | 0 | 2 | 0 | src, routes, api, route, db-schema, auth |
| ✅ | `src/routes/api/persons-of-interest` | 90 | 14 | 2737 | 0 | 14 | 0 | src, routes, api, route, db-schema, auth |
| ✅ | `src/routes/api/phase72` | 90 | 3 | 381 | 0 | 3 | 0 | src, routes, api, route, db-schema, auth |
| ✅ | `src/routes/api/phase78` | 90 | 4 | 198 | 0 | 4 | 0 | src, routes, api, route, db-schema, auth |
| ✅ | `src/routes/api/phase82` | 90 | 2 | 90 | 0 | 2 | 0 | src, routes, api, route, db-schema, auth |
| ✅ | `src/routes/api/precedents` | 90 | 2 | 342 | 0 | 2 | 0 | src, routes, api, route, db-schema, auth |
| ✅ | `src/routes/api/push` | 90 | 2 | 185 | 0 | 2 | 0 | src, routes, api, route, db-schema, auth |
| ✅ | `src/routes/api/qlora` | 90 | 1 | 167 | 0 | 1 | 0 | src, routes, api, route, db-schema, auth |
| ✅ | `src/routes/api/rag` | 90 | 10 | 2244 | 0 | 9 | 0 | src, routes, api, route, db-schema, auth |
| ✅ | `src/routes/api/recommendations` | 90 | 5 | 1178 | 0 | 5 | 0 | src, routes, api, route, db-schema, auth |
| ✅ | `src/routes/api/reports` | 90 | 9 | 2311 | 0 | 9 | 0 | src, routes, api, route, db-schema, auth |
| ✅ | `src/routes/api/routes` | 90 | 9 | 1005 | 0 | 9 | 0 | src, routes, api, route, auth, db-schema |
| ✅ | `src/routes/api/search` | 90 | 6 | 1359 | 0 | 6 | 0 | src, routes, api, route, db-schema, auth |
| ✅ | `src/routes/api/simulation` | 90 | 4 | 1098 | 0 | 4 | 0 | src, routes, api, route, db-schema, auth |
| ✅ | `src/routes/api/sse` | 90 | 2 | 2744 | 0 | 2 | 0 | src, routes, api, route, db-schema, auth |
| ✅ | `src/routes/api/statutes` | 90 | 4 | 585 | 0 | 4 | 0 | src, routes, api, route, db-schema, auth |
| ✅ | `src/routes/api/stream` | 90 | 2 | 102 | 0 | 2 | 0 | src, routes, api, route, auth, db-schema |
| ✅ | `src/routes/api/sync` | 90 | 1 | 49 | 0 | 1 | 0 | src, routes, api, route, db-schema, auth |
| ✅ | `src/routes/api/system` | 90 | 6 | 719 | 0 | 3 | 0 | src, routes, api, route, db-schema, auth |
| ✅ | `src/routes/api/tags` | 90 | 3 | 151 | 0 | 3 | 0 | src, routes, api, route, db-schema, auth |
| ✅ | `src/routes/api/tasks` | 90 | 2 | 204 | 0 | 2 | 0 | src, routes, api, route, db-schema, auth |
| ✅ | `src/routes/api/v1` | 90 | 17 | 1466 | 0 | 17 | 0 | src, routes, api, route, auth, db-schema |
| ✅ | `src/routes/api/yorha` | 90 | 4 | 510 | 0 | 4 | 0 | src, routes, api, route, db-schema, auth |
| ✅ | `src/routes` | 100 | 6 | 214291 | 1 | 580 | 7 | src, routes, (admin), component, (analysis), auth |
| ✅ | `src/routes/(app)/acp` | 100 | 1 | 613 | 0 | 0 | 0 | src, routes, (app), route, component, db-schema |
| ✅ | `src/routes/(app)/active-cases` | 100 | 2 | 1154 | 0 | 1 | 0 | src, routes, (app), route, db-schema, auth |
| ✅ | `src/routes/(app)/analysis-center` | 100 | 5 | 1576 | 0 | 1 | 0 | src, routes, (app), route, component, db-schema |
| ✅ | `src/routes/(app)/cases` | 100 | 37 | 10448 | 0 | 13 | 0 | src, routes, (app), route, db-schema, auth |
| ✅ | `src/routes/(app)/command-center` | 100 | 11 | 3456 | 0 | 0 | 0 | src, routes, (app), route, db-schema, component |
| ✅ | `src/routes/(app)/evidence` | 100 | 16 | 3813 | 0 | 6 | 0 | src, routes, (app), route, component, db-schema |
| ✅ | `src/routes/(app)/legal-corpus` | 100 | 6 | 3372 | 0 | 0 | 0 | src, routes, (app), route, component, db-schema |
| ✅ | `src/routes/(app)/persons-of-interest` | 100 | 8 | 3093 | 0 | 1 | 0 | src, routes, (app), route, db-schema, component |
| ✅ | `src/routes/(app)/reports` | 100 | 7 | 2148 | 0 | 1 | 0 | src, routes, (app), route, component, db-schema |
| ✅ | `src/routes/(app)/simulation` | 100 | 2 | 1305 | 0 | 1 | 0 | src, routes, (app), route, db-schema, auth |
| ✅ | `src/routes/(app)/terminal` | 100 | 3 | 1045 | 0 | 1 | 0 | src, routes, (app), route, db-schema, auth |
| ✅ | `src/routes/login` | 100 | 3 | 462 | 0 | 1 | 0 | src, routes, login, route, db-schema, auth |

**Scoring**: Auth coverage 30pts · Drizzle ref 15pts · No TODOs 20pts · Has components 10pts · Has routes 15pts · Non-empty 10pts

---

## API Routes (1 total)

| Route | Methods | Auth |
|-------|---------|------|
| `api/hypergraph/lookup/+server.ts` | GET, POST | ❌ |


---

## API Routes Missing Auth Guard (1)
- `src/routes/api/hypergraph/lookup/+server.ts` · GET/POST

---

## Svelte Components (60 shown of 848)
| File | Sub-components | Key `$lib` Imports |
|------|---------------|---------------------|
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
| `src/lib/components/analytics/LiveResearchPanel.svelte` | AbortController, Icon | $lib/components/ui/Icon.svelte |

---

## Top External Module Imports
| Module | Consumer Count |
|--------|----------------|
| `@sveltejs/kit` | 645 |
| `zod` | 462 |
| `$lib/server/db/client` | 387 |
| `drizzle-orm` | 311 |
| `$lib/server/env.server.js` | 283 |
| `$lib/components/ui/Icon.svelte` | 252 |
| `svelte` | 217 |
| `$lib/server/ollama.js` | 139 |
| `$lib/server/db/schema-postgres.js` | 125 |
| `$lib/server/redis.js` | 114 |
| `$lib/server/middleware/cache-headers.js` | 112 |
| `$lib/server/validation.js` | 93 |
| `$lib/components/ui/Button.svelte` | 88 |
| `$app/environment` | 75 |
| `crypto` | 73 |
| `drizzle-orm/pg-core` | 67 |
| `path` | 67 |
| `$app/navigation` | 63 |
| `svelte/transition` | 53 |
| `$lib/server/observability/langfuse.js` | 44 |
| `$lib/server/grpc/embedding-client.js` | 44 |
| `$lib/server/db/schema` | 44 |
| `bits-ui` | 41 |
| `$lib/server/analytics/search-analytics.js` | 36 |
| `fs` | 34 |
| `$lib/server/vector/qdrant-manager.js` | 33 |
| `ioredis` | 31 |
| `$lib/server/db/schema-postgres` | 30 |
| `$lib/types/enhanced-svelte5-types` | 27 |
| `$app/state` | 26 |

---

## Directories with TODO/FIXME
- `src/lib` — 20 marker(s), score 65
- `src/lib/utils` — 7 marker(s), score 40
- `src/routes` — 7 marker(s), score 100
- `src/lib/components` — 6 marker(s), score 65
- `src/routes/(app)` — 6 marker(s), score 80
- `src/routes/(app)/admin` — 4 marker(s), score 80
- `src/lib/components/ui` — 3 marker(s), score 50
- `src/lib/server` — 3 marker(s), score 55
- `src/lib/workers` — 2 marker(s), score 50
- `src/lib/ai` — 1 marker(s), score 50
- `src/lib/ai/onnx` — 1 marker(s), score 50
- `src/lib/server/auth` — 1 marker(s), score 50
- `src/lib/services/error-analysis` — 1 marker(s), score 50
- `src/lib/components/yorha` — 1 marker(s), score 60
- `src/lib/server/error-brain` — 1 marker(s), score 65

---

## ACE / KAG Integration

**Fast-AST source** (score cap 0.07):
- Redis key `code:index:manifest` — manifest with mode, fileCount, etc.
- Redis keys `code:index:tag:{word}` — file paths per keyword tag
- Injected when codebase context is sparse (< 3 Qdrant chunks)

**KAG directory notes** (score cap 0.08):
- Redis keys `wiki:note:dir:{docId}` (24h TTL) — per-directory audit docs
- Read by `getDirectoryKAGContext(query)` in `community-graph.ts`
- Injected as `## KAG Directory Audit Notes` section in ACE `webSearchContext`
- Populated by this script **and** by `POST /api/codebase-index/directory-summaries`

**Full GPU pipeline** (replaces fast-ast with 768-dim embeddings):
```bash
npm run index:codebase:full          # full GPU pipeline
npm run test:prod-readiness:full-gpu # production readiness harness
```
