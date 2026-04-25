# Phase Scripts Reference — Full Audit (March 22, 2026)

This document catalogs ALL phase-specific scripts found in `sveltekit-frontend/scripts/` and their status (USEFUL/ARCHIVED). Created during the full codebase audit before archiving dead scripts.

---

## Revival Candidates (Missing Features Worth Rebuilding)

These scripts never existed on disk but represent features that could add value if rebuilt:

| Script | Feature | Priority | Notes |
|--------|---------|----------|-------|
| `phase76-acp-cli.mjs` | MCP/ACP tool CLI tester | **HIGH** | MCP server has 36 tools but no CLI to test/invoke them interactively |
| `phase79-agentic-indexer.mjs` | Error indexing to Qdrant | **HIGH** | Would feed the Phase 78-79 repair pipeline with searchable error history |
| `phase77-extract-*.mjs` (4) | Training data extraction | MEDIUM | Useful if fine-tuning gemma3-legal on codebase patterns |
| `phase89-copilot-integrator.mjs` | IDE copilot integration | LOW | VS Code extension or MCP bridge for copilot workflows |
| `phase89-context7-server.mjs` | Context7 MCP server | LOW | Context7 references exist in codebase but unclear if still needed |

---

## Phase 2 — Route Scanner (ARCHIVED)

| Script | Purpose | Status |
|--------|---------|--------|
| `phase2-route-scanner-clean.mts` | Scans SvelteKit routes, populates `route_metadata` table | ARCHIVED — one-time migration |

---

## Phase 6 — Core Focus (MISSING)

| Script | Purpose | Status |
|--------|---------|--------|
| `phase6-core-focus.mjs` | Referenced in package.json | MISSING — file never existed on disk |

---

## Phase 72 — Route AST Graph & Topology

| Script | Purpose | Status |
|--------|---------|--------|
| `phase72-route-ast-graph-simple.mts` | Fast directory-based route graph → `static/phase72/route-ast-graph.json` | **KEPT** — `npm run phase72:build` |
| `phase72-route-ast-graph.mts` | Full ts-morph AST graph (heavy) | ARCHIVED — superseded by simple variant |
| `phase72-kag-populate.ps1` | KAG population wrapper | ARCHIVED — references missing .mjs |
| `phase72-kag-quickstart.ps1` | KAG quickstart | ARCHIVED — one-time setup |
| `phase72-ripgrep-scanner.ps1` | ripgrep codebase scanner | ARCHIVED — replaced by AST analysis |
| `phase72-ripgrep-scanner.sh` | Shell variant of above | ARCHIVED |
| `phase72-verify-prerequisites.ps1` | Phase 72 prereq check | ARCHIVED — one-time validation |

**Missing npm script targets (dead references):**
- `phase72-dev-wrapper.mjs`, `phase72-watch-dev.mjs`, `phase72-watch-dev-logs.mjs`, `phase72-test.mjs`
- `phase72_gpu_vectorizer.py`, `phase72-topology-scan.mjs`, `phase72-topology-manager.mjs`
- `phase72-gpu-pipeline.mjs`, `phase72-cluster-ingest.mjs`, `phase72-auto-iterate.mjs`
- `phase72-demo.mjs`, `phase72-with-progress.mjs`, `phase72-iterate-test.mjs`
- `phase72-test-pipeline.mjs`, `phase72-quick-test.mjs`, `phase72-detect-libtorch.mjs`
- `phase72-fast-scanner.mjs`, `phase72-topology-store.mjs`

---

## Phase 76 — RAG/KAG Stack Setup (ALL ARCHIVED)

| Script | Purpose | Status |
|--------|---------|--------|
| `phase76-87-full-deployment.ps1` | 7-step RAG+KAG stack deployment | ARCHIVED — Phases 86-87 inactive |
| `phase76-87-quickstart.ps1` | 20-min quickstart to 100% readiness | ARCHIVED — one-time checklist |
| `phase76-run-kb-ingest.ps1` | KB ingestion wrapper | ARCHIVED — refs missing `phase76-kb-update.mjs` |
| `phase76-verify.ps1` | ACP Tool Registry verification | ARCHIVED — ACP may be archived |
| `phase76-verify-simple.ps1` | Simplified ACP check | ARCHIVED |

**Missing npm script targets (dead references):**
- `phase76-acp-cli.mjs`, `phase76-acp-server.mjs`, `phase76-audit-stores.mjs`
- `phase76-svelte5-migration-agent.mjs`, `phase76-ast-graph-auditor.mjs`, `phase76-couchdb-graph-sync.mjs`
- `workers/ai-processor.ts`

---

## Phase 77 — Training Data Extraction (ALL MISSING)

| Script | Purpose | Status |
|--------|---------|--------|
| `phase77-extract-svelte-docs.mjs` | Extract Svelte docs for training | MISSING |
| `phase77-extract-typescript-enhanced.mjs` | Extract TS docs for training | MISSING |
| `phase77-extract-multilang.mjs` | Multi-language extraction | MISSING |
| `phase77-generate-master.mjs` | Generate master training dataset | MISSING |

All 4 scripts referenced in package.json but never existed on disk.

---

## Phase 78 — Error Analysis Pipeline (ACTIVE)

| Script | Purpose | Status |
|--------|---------|--------|
| `phase78-collect-errors.mts` | Collects TS/JS errors from logs → DB | **KEPT** — `npm run phase78:collect-errors` |
| `phase78-insert-errors.mts` | Inserts errors into `error_events` + `route_health` | **KEPT** — `npm run phase78:insert` |
| `phase78-cluster-errors.mts` | K-means clustering via Ollama embeddings | **KEPT** — `npm run phase78:cluster` |
| `phase78-generate-suggestions.mts` | LLM fix suggestions ranked by risk | **KEPT** — `npm run phase78:suggest` |
| `phase78-embed-clusters.mts` | Semantic embeddings for clusters (pgvector + Qdrant) | **KEPT** — `npm run phase78:embed-clusters` |
| `phase78-ast-aware-ranker.mts` | AST-based error ranking by blast radius | **KEPT** — `npm run phase78:ast-rank` |
| `phase78-check-results.mts` | One-time clustering verification | ARCHIVED |
| `phase78-delta-verify.ps1` | One-time delta validation | ARCHIVED |
| `phase78-deploy.ps1` | One-time deployment | ARCHIVED |
| `phase78-diagnostic.ps1` | One-time diagnostics | ARCHIVED |

**Pipeline:** `collect → insert → cluster → suggest → embed → rank` (`npm run phase78:full`)

---

## Phase 79 — Agentic Repair (ACTIVE)

| Script | Purpose | Status |
|--------|---------|--------|
| `phase79-agentic-repair.mts` | Autonomous repair agent (fetch suggestion → apply → verify) | **KEPT** — `npm run phase79:agent` |
| `phase79-agentic-repair-enhanced.mts` | Enhanced with Redis/Qdrant/pgvector/FastMCP/Gemini | **KEPT** — `npm run phase79:enhanced` |
| `phase79-cognitive-ultimate.mts` | Safety-gated agent with model routing + self-healing | **KEPT** — `npm run phase79:ultimate` |
| `phase79-code-validator.mts` | Validates LLM patches are code (not prose) | **KEPT** — module used by repair scripts |
| `phase79-safety-gate.mts` | Patch safety validation | **KEPT** — module used by cognitive-ultimate |
| `phase79-batch-process.ps1` | Batch error processor with validation | **KEPT** — `npm run phase79:batch-process` |
| `phase79-diagnostics.mts` | One-time diagnostics | ARCHIVED |
| `phase79-enhanced.mts` | Early enhanced variant (incomplete) | ARCHIVED — superseded by enhanced-agent |
| `phase79-enhanced-agent.mts` | Early enhanced agent variant | ARCHIVED — superseded by agentic-repair-enhanced |
| `phase79-start-stack.ps1` | One-time stack startup | ARCHIVED |

**Missing npm script targets:**
- `phase79-safety-gate.mjs` (exists as `.mts`, npm ref uses `.mjs`)
- `phase79-cognitive-engine.mjs`, `phase79-cognitive-engine-complete.mjs`
- `check-phase79-status.mjs`, `test-phase79-policy-first.mjs`
- `demo-policy-first-retrieval.mjs`, `demo-prompt-builder.mjs`
- `phase79-agentic-indexer.mjs`, `phase79-agentic-demo.mjs`
- `phase79-rag-kag-middleware.py`

---

## Phase 82 — Svelte Codemod (MISSING)

| Script | Purpose | Status |
|--------|---------|--------|
| `phase82-svelte-runes-codemod.mjs` | Auto-migrate Svelte 4 → 5 runes | MISSING — file never existed on disk |

---

## Phase 89 — Infrastructure & Monitoring

### KEPT (8 scripts)
| Script | Purpose |
|--------|---------|
| `phase89-check-status.ps1` | System health check |
| `phase89-quick-status.ps1` | Fast status check |
| `phase89-continuous-monitor.ps1` | Ongoing monitoring loop |
| `phase89-monitor-progress.ps1` | Track long-running jobs |
| `phase89-monitor-reembed.ps1` | Monitor re-embedding progress |
| `phase89-monitor-topk.ps1` | Monitor top-k search quality |
| `phase89-corruption-recovery.ps1` | Restore corrupted XState from git |
| `phase89-requirements.txt` | Python dependency list |

### ARCHIVED (26+ scripts)
| Script | Reason |
|--------|--------|
| `phase89-quick-start.ps1` | One-time init |
| `phase89-setup.ps1` | One-time init |
| `phase89-setup-cuda.ps1` | One-time CUDA setup |
| `phase89-setup-topology.ps1` | One-time topology setup |
| `phase89-build-qdrant-safe.ps1` | One-time build safeguard |
| `phase89-safe-build.ps1` | One-time build |
| `phase89-safeguards.ps1` | One-time safeguards |
| `phase89-safe-model-management.ps1` | One-time model management |
| `phase89-optimize-and-integrate.ps1` | One-time optimization |
| `phase89-kb-grounded-fix.ps1` | One-time KB fix |
| `phase89-deploy-event-schema.ps1` | One-time schema deploy |
| `phase89-status.ps1` | Duplicate of check-status |
| `phase89-test-pipeline.ps1` | One-time test |
| `phase89-verify-complete-system.ps1` | One-time verification |
| `phase89-verify-cuda-system.ps1` | One-time CUDA verification |
| `phase89-verify-integration.ps1` | One-time integration check |
| `phase89-verify-system.ps1` | One-time system check |
| `phase89-verify-wiring.ps1` | One-time wiring check |
| `phase89-edit-log-schema.sql` | One-time schema |
| `phase89-enhanced-kb-schema.sql` | One-time schema |
| `phase89-error-graph-schema.sql` | One-time schema |
| `phase89-qdrant-events-schema.sql` | One-time schema |
| `phase89-schema-init.sql` | One-time schema |
| `phase89-schema-migration.sql` | One-time schema |

**Missing npm script targets:**
- `phase89-gpu-streaming-cluster.py`, `phase89-copilot-integrator.mjs`, `phase89-context7-server.mjs`

---

## Phase 90 — Migration Safety (ACTIVE)

| Script | Purpose | Status |
|--------|---------|--------|
| `phase90-fix-ts1005-corruption.ps1` | Auto-fixes TS1005 syntax corruption | **KEPT** — used in preflight pipeline |
| `phase90-migration-check.sql` | Pre/post-migration snapshot validation | **KEPT** — used in `phase90:full-migration` |
| `phase90-backfill-content-hash.ts` | Backfill content hashes | **KEPT** — `npm run phase90:backfill` |
| `phase90-migration-safety.ps1` | DB migration safety wrapper | **KEPT** — `npm run db:*` pipeline |

---

## Summary

| Category | Scripts | Kept | Archived | Missing |
|----------|---------|------|----------|---------|
| Phase 2 | 1 | 0 | 1 | 0 |
| Phase 6 | 1 | 0 | 0 | 1 |
| Phase 72 | 7+19 | 1 | 6 | 19 |
| Phase 76 | 5+7 | 0 | 5 | 7 |
| Phase 77 | 4 | 0 | 0 | 4 |
| Phase 78 | 10 | 6 | 4 | 0 |
| Phase 79 | 10+10 | 6 | 4 | 10 |
| Phase 82 | 1 | 0 | 0 | 1 |
| Phase 89 | 32+ | 8 | 24+ | 3 |
| Phase 90 | 4 | 4 | 0 | 0 |
| **Total** | **~100** | **25** | **~44** | **~45** |
