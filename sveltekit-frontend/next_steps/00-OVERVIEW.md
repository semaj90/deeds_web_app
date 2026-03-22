# Next Steps - Complete Overview

**Generated:** March 1, 2026 | **Updated:** March 22, 2026
**Project:** Deeds Legal AI Platform
**Status:** svelte-check 0 errors, 46/46 Playwright+Screenshots, 16/17 Kiro features at 100%

---

## 📊 Summary

This directory contains categorized TODO items organized by feature area and priority. All items include effort estimates, implementation details, and code examples.

**Total Work Identified:** ~204 hours across 7 categories

---

## 📁 File Organization

### [01-reports-next-steps.md](01-reports-next-steps.md)
**Focus:** Report generation, templates, and collaboration
**Items:** 20
**Effort:** 65-75 hours
**Priorities:**
- 🔥 Critical (3 items, 4.5 hours): Fix template generation endpoint, add audit logging, streaming AI
- 🚀 High (6 items, 20 hours): Version history, collaboration, analytics, timeline integration
- 📋 Medium (11 items, 40 hours): Template marketplace, suggestions, batch generation, mobile

**Key Highlights:**
- Template generation endpoint returns 500 (blocking AI-powered reports)
- Report audit logging required for legal compliance
- SSE streaming for better UX on long AI generations

---

### [02-mcp-integration.md](02-mcp-integration.md)
**Focus:** MCP server tools for AI agents
**Items:** 10 tool categories (20+ individual tools)
**Effort:** 22 hours
**Priorities:**
- 🔥 Critical (3 items, 5.5 hours): Report tools, citation tools, case management tools
- 🚀 High (3 items, 4.5 hours): Timeline, RAG enhancements, health monitoring
- 📋 Medium (4 items, 12 hours): Batch operations, document generation, analytics, collaboration

**Key Highlights:**
- ✅ Current: **36 tools** (expanded from 11 — evidence, multimodal, AST, graph, health, cache, batch, agentic)
- Proposed: 40+ total tools
- Remaining gap: Report/case/citation tools for AI agents

---

### [03-evidence-improvements.md](03-evidence-improvements.md)
**Focus:** Evidence upload, analysis, and management
**Items:** 10
**Effort:** 29.5 hours
**Priorities:**
- 🔥 Critical (3 items, 6.5 hours): Audit logging, version history, tagging workflow
- 🚀 High (3 items, 9 hours): Relationship graph, export pipeline, OCR improvements
- 📋 Medium (4 items, 14 hours): Search filters, redaction, thumbnails, bulk upload

**Key Highlights:**
- ✅ Evidence audit logging DONE (`evidenceAuditLog` + `evidenceVersions` tables + `evidence-audit.ts` helper)
- ✅ Evidence version history DONE
- Existing evidence_relationships table has no UI visualization
- OCR confidence scoring implemented (Session 93r28), needs preprocessing + retry

---

### [04-ai-integration.md](04-ai-integration.md)
**Focus:** LLM, embeddings, and inference improvements
**Items:** 10
**Effort:** 16.5 hours
**Priorities:**
- 🔥 Critical (3 items, 4.5 hours): Embedding cache persistence, LLM response caching, health monitoring
- 🚀 High (3 items, 5.5 hours): SSE improvements, model auto-loader, ONNX warmup
- 📋 Medium (4 items, 6.5 hours): Multi-model support, token tracking, prompt templates

**Key Highlights:**
- ✅ Embedding cache persistence DONE (`embedding_cache` table + pgvector + gRPC Redis cache)
- ✅ LLM response caching DONE (LiteLLM Redis semantic cache — 28x speedup on repeated queries)
- ✅ Ollama health monitoring DONE (`/api/infrastructure/status` endpoint)
- ONNX warmup implemented but not triggered on app start

---

### [05-infrastructure.md](05-infrastructure.md)
**Focus:** Redis, caching, testing, performance
**Items:** 10
**Effort:** 28.5 hours
**Priorities:**
- 🔥 Critical (3 items, 4.5 hours): Redis connection pooling, TTL strategy, cache invalidation
- 🚀 High (3 items, 13 hours): API caching middleware, test coverage expansion, performance monitoring
- 📋 Medium (4 items, 11 hours): Query optimization, Docker health checks, error tracking, backups

**Key Highlights:**
- ✅ Cache invalidation DONE (`cache-invalidation.ts` + RabbitMQ `cache.invalidate` queue)
- ✅ Cache TTL strategy DONE (L0-L3 tiered TTL hierarchy)
- ✅ pgvector halfvec HNSW indexes on 6 tables (50% memory savings)
- Test coverage: 46/46 Playwright screenshots + Vitest regression suite
- Redis uses ioredis singleton (connection pooling built-in)

---

### [06-database-migrations.md](06-database-migrations.md)
**Focus:** Safe additive-only database changes (no data drops)
**Items:** 7 new tables + 3 columns + 10+ indexes
**Effort:** ~2 hours
**Priorities:**
- 🔥 Critical (2 tables, 30 min): report_audit_log, evidence_audit_log (legal compliance)
- 🚀 High (2 tables, 30 min): report_versions, evidence_versions (history tracking)
- 📋 Medium (3 tables + indexes, 1 hour): ai_usage_log, report_permissions, template_marketplace + performance indexes

**Key Highlights:**
- **ZERO DATA LOSS** — All additive operations (CREATE TABLE, ADD COLUMN, CREATE INDEX)
- Dangerous DROP statements identified in old migrations (DO NOT RUN)
- Safe migration workflow with rollback plan
- 70+ existing tables documented (schema-postgres.ts)

---

### [07-ml-training.md](07-ml-training.md)
**Focus:** Model fine-tuning, evaluation, deployment
**Items:** 10
**Effort:** 46 hours
**Priorities:**
- 🔥 Critical (3 items, 13 hours): Model evaluation suite, production deployment, A/B testing infrastructure
- 🚀 High (3 items, 13 hours): Training data augmentation, continuous training pipeline, TensorRT optimization
- 📋 Medium/Low (4 items, 20 hours): VLM fine-tuning, monitoring dashboard, dataset versioning, model distillation

**Key Highlights:**
- 4 Colab notebooks + 38 JSONL datasets (102K+ examples, ~2.1 MB)
- Multimodal Phase 1 COMPLETE (YOLO, Whisper, CLIP on RTX 3060 Ti)
- Missing: Evaluation metrics, production deployment, A/B testing
- TensorRT could provide 3-5x inference speedup (15 → 50-75 tokens/sec)

---

### [08-detective-mode-integration.md](08-detective-mode-integration.md)
**Focus:** Enhanced detective mode training integration
**Items:** 5 scenario categories (500 new training examples)
**Effort:** N/A (training pipeline)
**Training Options:**
- Option A: Full QLoRA (103.5K examples, 6-8 hours)
- Option B: ACE Synthesis (2K examples, 1-2 hours)

**Key Highlights:**
- TODO management (25%) — Aggregate → estimate → roadmap
- Database safety (25%) — Detect DROP TABLE → safe migrations
- ML inventory (20%) — Dataset count → gap analysis → optimization
- API mapping (15%) — Endpoint health → broken routes
- Infrastructure (15%) — Redis/embeddings/Docker → health check
- Connects session investigation workflow → training examples

---

### [09-agent-investigate-endpoint.md](09-agent-investigate-endpoint.md)
**Focus:** Production API endpoint for autonomous investigations
**Endpoint:** `POST /api/agent/investigate`
**Architecture:** ReAct (Reasoning + Acting) with 14 FastMCP tools
**Status:** ✅ Live (waiting for trained model deployment)

**Key Highlights:**
- 6 detective mode tools (ripgrep, find_files, analyze_file, extract_pattern, analyze_imports, web_search)
- 5 multimodal tools (YOLO, Whisper, CLIP analysis)
- 9 example queries (4 base + 5 enhanced scenarios)
- Test suite: `scripts/tests/test-agent-investigate.mjs`
- After training: Autonomous TODO aggregation, DB safety, ML audit, API mapping, infrastructure health

---

## 🎯 Top 10 Priorities (Cross-Cutting)

1. **Fix Template Generation Endpoint (Reports)** — Blocking AI-powered report creation
   *Effort: 30 minutes | Impact: HIGH | File: api/reports/generate-from-template/+server.ts*

2. **Embedding Cache Persistence (AI)** — Redundant embedding generation
   *Effort: 2 hours | Impact: HIGH | File: workers/embedding-worker.ts line 146*

3. **Evidence Audit Logging (Evidence)** — Legal compliance requirement
   *Effort: 2 hours | Impact: CRITICAL | New table: evidence_audit_log*

4. **Report Audit Logging (Reports)** — Legal compliance requirement
   *Effort: 1 hour | Impact: CRITICAL | New table: report_audit_log*

5. **Redis Connection Pooling (Infrastructure)** — Prevent connection exhaustion
   *Effort: 1 hour | Impact: HIGH | File: lib/server/redis.ts*

6. **MCP Report Tools (MCP)** — Enable AI agents to create/export reports
   *Effort: 2 hours | Impact: HIGH | File: mcp/server.ts*

7. **LLM Response Caching (AI)** — Reduce Ollama load, faster responses
   *Effort: 1.5 hours | Impact: HIGH | New Qdrant collection: llm_cache*

8. **Cache Invalidation Strategy (Infrastructure)** — Data consistency
   *Effort: 2 hours | Impact: HIGH | New file: lib/server/cache-invalidation.ts*

9. **Evidence Version History (Evidence)** — Track metadata changes
   *Effort: 2.5 hours | Impact: MEDIUM-HIGH | New table: evidence_versions*

10. **Test Coverage Expansion (Infrastructure)** — 19 → 100+ tests
    *Effort: 8 hours | Impact: MEDIUM-HIGH | New test suites for evidence/cases/citations/AI*

---

## PHASE*.md Audit Summary (March 11, 2026)

**150+ PHASE*.md files** at project root, audited by category:

### Complete & Operational (86 files, 57%)
Core infrastructure phases fully implemented:
- Phases 1-2: Project setup, SvelteKit config
- Phase 3: Svelte 5 migration (runes, $state, $derived — app-wide)
- Phase 5-8: Database (Drizzle ORM 70+ tables, pgvector, 14 enums)
- Phase 10-15: AI integration (Ollama, ONNX, embeddings, RAG pipeline)
- Phase 20-30: Evidence pipeline (9-stage), MinIO, OCR, entity extraction
- Phase 40-50: Cache infrastructure (Redis, Qdrant, invalidation)
- Phase 60-72: Route health monitoring, AST graph, Phase 72 route analyzer
- Phase 78-89: Error remediation, auto-fix, orphan wiring
- Phase 93+: GPU pipeline, LibTorch/CUDA, RabbitMQ consumers, icon system

### In Progress (45 files, 30%)
- Phase 13: Agentic tools (~55% — 9 of planned 14 MCP tools)
- Phase 99: Svelte 5 auto-migration (ABANDONED — corrupted 83 files)
- Phase 107+: Ongoing error remediation cycles
- TRT-LLM/Triton deployment (planning complete, execution pending)

### Reference Documentation (19 files, 13%)
- Design docs, architecture decisions, historical notes
- No action needed — informational only

### Key Gaps Identified
1. **MCP tools incomplete** — 9/14 tools, missing report/case/citation tools
2. **TRT-LLM deployment** — Triton server config ready, engine build pending
3. **Test coverage** — 20 Playwright route tests, no unit test suite
4. **Phase 99 recovery** — 83 corrupted files (5 imported by active routes, rest archived)

---

## 📈 Implementation Roadmap

### Phase 1: Critical Fixes (Week 1)
**Effort:** ~12 hours

- [ ] Fix template generation endpoint (30 min)
- [ ] Add report audit logging (1 hour)
- [ ] Add evidence audit logging (2 hours)
- [ ] Implement Redis connection pooling (1 hour)
- [ ] Implement cache TTL strategy (1.5 hours)
- [ ] Add cache invalidation (2 hours)
- [ ] Persist embeddings to DB (2 hours)
- [ ] Add LLM response caching (1.5 hours)
- [ ] Ollama health monitoring (1 hour)

### Phase 2: High-Value Features (Week 2-3)
**Effort:** ~40 hours

- [ ] MCP report/case/citation tools (5.5 hours)
- [ ] Evidence version history (2.5 hours)
- [ ] Evidence tagging workflow UI (2 hours)
- [ ] Report version history (3 hours)
- [ ] Report streaming AI (2 hours)
- [ ] Evidence relationship graph (4 hours)
- [ ] Evidence export pipeline (3 hours)
- [ ] SSE improvements (2 hours)
- [ ] Model auto-loader (1.5 hours)
- [ ] Test coverage expansion (8 hours)
- [ ] Performance monitoring (3 hours)
- [ ] API response caching (2 hours)

### Phase 3: Polish & Scale (Week 4-6)
**Effort:** ~50 hours

- [ ] Report collaboration (6 hours)
- [ ] Report analytics (2 hours)
- [ ] Template marketplace (8 hours)
- [ ] Smart template suggestions (4 hours)
- [ ] Evidence search filters (2 hours)
- [ ] Evidence thumbnails (2 hours)
- [ ] Evidence bulk upload (3 hours)
- [ ] MCP batch operations (2 hours)
- [ ] MCP analytics tools (2 hours)
- [ ] Multi-model support (2 hours)
- [ ] Token usage tracking (1.5 hours)
- [ ] Query optimization (4 hours)
- [ ] Error tracking dashboard (3 hours)
- [ ] Backup & recovery (2 hours)

### Phase 4: Advanced Features (Week 7-8)
**Effort:** ~50 hours

- [ ] Report template preview (2 hours)
- [ ] Report batch generation (3 hours)
- [ ] Mobile report editor (4 hours)
- [ ] WCAG 2.1 AA compliance (3 hours)
- [ ] Digital signatures (6 hours)
- [ ] Evidence redaction tool (5 hours)
- [ ] OCR preprocessing (2 hours)
- [ ] MCP document generation (3 hours)
- [ ] MCP collaboration tools (3 hours)
- [ ] Prompt template library (2 hours)

---

## 🗄️ Database Changes Summary

### New Tables (7)
1. `report_audit_log` (legal compliance)
2. `report_versions` (change tracking)
3. `report_permissions` (granular access)
4. `evidence_audit_log` (chain of custody)
5. `evidence_versions` (metadata history)
6. `ai_usage_log` (token tracking)
7. `template_marketplace` (custom templates)

### New Columns (1)
- `evidence.thumbnail_path` (visual browsing)

### New Indexes (5+)
- `idx_evidence_case_id_created`
- `idx_reports_case_id_status`
- `idx_evidence_title_trgm` (full-text)
- `idx_evidence_metadata_gin` (JSONB)
- `idx_reports_metadata_gin` (JSONB)

---

## 🧪 Testing Strategy

### Current
- **Report tests:** 19 tests, 89% pass rate
- **Coverage:** Reports only
- **Location:** `scripts/tests/test-reports.mjs`

### Goal
- **Total tests:** 100+
- **Coverage:** Reports, evidence, cases, citations, AI, auth
- **Pass rate:** 95%+

### New Test Suites
1. `test-evidence.mjs` (25 tests)
2. `test-cases.mjs` (20 tests)
3. `test-citations.mjs` (15 tests)
4. `test-ai.mjs` (20 tests)
5. `test-auth.mjs` (10 tests)

---

## 🔧 API Endpoints to Create

### Reports (4)
- `GET /api/reports/[id]/versions`
- `POST /api/reports/[id]/revert?version=3`
- `POST /api/reports/batch-generate`
- `GET /api/reports/[id]/diff?v1=1&v2=2`

### Evidence (6)
- `GET /api/evidence/[id]/versions`
- `POST /api/evidence/[id]/revert?version=2`
- `POST /api/evidence/[id]/tags`
- `DELETE /api/evidence/[id]/tags/[tag]`
- `GET /api/evidence/[id]/relationships`
- `POST /api/evidence/export`

### Cases (3)
- `POST /api/cases/[id]/citations`
- `POST /api/timeline/events`
- `POST /api/collaboration/tasks`

### Analytics (4)
- `GET /api/analytics/reports`
- `GET /api/analytics/performance`
- `GET /api/analytics/case-summary`
- `POST /api/analytics/predict-outcome`

### Documents (2)
- `POST /api/documents/motion`
- `POST /api/documents/brief`

---

## 📦 Qdrant Collections to Create

1. `llm_cache` (768-dim, Cosine) — Semantic LLM response caching
2. `topic_clusters` (768-dim, Cosine) — Already created in Session 93r28b

---

## 🎓 Key Learnings from Previous Work

### What Worked Well
- Template system architecture (10 professional templates, 1000+ lines)
- Automated test suite with screenshots
- Clean separation: template data vs generation logic
- Comprehensive documentation (5 markdown files)

### Gaps Identified
- Template generation endpoint returns 500 (import/runtime issue)
- No audit logging (legal compliance risk)
- Embeddings not persisted (redundant generation)
- Redis single connection (scalability risk)
- Limited test coverage (only reports tested)

### Patterns to Reuse
- TODO structure: Priority → Effort → Implementation → Code examples
- Test automation: Quick smoke test + full suite
- Documentation: Schema notes + implementation summary + status tracking
- Error handling: Safe wrappers, graceful degradation, timeout protection

---

## 🚀 Quick Wins (< 2 hours each)

1. Fix template generation endpoint (30 min)
2. Add report audit logging (1 hour)
3. Redis connection pooling (1 hour)
4. Ollama health monitoring (1 hour)
5. Cache TTL strategy (1.5 hours)
6. LLM response caching (1.5 hours)
7. Model auto-loader (1.5 hours)
8. Token usage tracking (1.5 hours)
9. Evidence thumbnails (2 hours)
10. Docker health checks (1 hour)

**Total Quick Wins:** 12.5 hours for 10 improvements

---

## 📞 Contact & Resources

- **Project Docs:** `CLAUDE.md`, `memory/` directory
- **Test Scripts:** `scripts/tests/`
- **Architecture:** `memory/architecture-reference.md`
- **Database:** `memory/drizzle-schema-reference.md`
- **Session History:** `memory/session-history.md`
- **Corruption Patterns:** `memory/corruption-patterns.md`

---

**Last Updated:** March 1, 2026
**Next Review:** After Phase 1 completion
**Maintainer:** Development Team
