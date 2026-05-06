# INVERTED Features — Build Order by Dependency

**Source**: `reports/deep-audit/d9-vs-next-steps.json` — 28 actionable INVERTED entries (planner expects these files; they don't exist).

Files are layered so each layer only depends on the layer above it. **Build top-down** to avoid circular implementation gaps.

---

## Layer 0 — Foundations (no INVERTED deps)

### 0.1 `src/lib/ai/prompts.ts`
**Purpose**: Canonical prompt templates referenced by all AI surfaces (ACE, gemma4-agent, RAG synthesis, evidence analysis).
**Why first**: Every Layer 1+ file imports prompts; building this last forces hardcoded prompts everywhere.
**Effort**: ~2 hr — collect existing inline prompts from `gemma4-agent.ts`, `ace/context-assembler.ts`, `rag-pipeline-stub.ts`, factor into named constants.
**Wire test**: `npm run audit:d9` — graduates Layer 1 files that already import a prompts.ts they assumed existed.

### 0.2 `src/lib/server/cache-config.ts`
**Purpose**: Per-collection cache TTL + key-prefix policy (mirrors what's hardcoded in `redis-exact-match.ts`, `code-llm-index.ts`, `dag-cache.ts`).
**Why first**: All cache writers/readers should pull policy from one source.
**Effort**: ~1.5 hr — extract scattered TTL constants, expose `getCachePolicy(domain)`.

### 0.3 `src/lib/server/cache-invalidation.ts`
**Purpose**: Cross-cache invalidation broadcaster (Redis + LokiJS + IndexedDB + Bifrost L2).
**Depends on**: `cache-config.ts` (Layer 0.2)
**Effort**: ~2 hr — RabbitMQ `cache.invalidate` queue already exists; this wraps the publisher + consumer with type-safe domain enum.

---

## Layer 1 — AI plumbing (depends on Layer 0)

### 1.1 `src/lib/server/ai/model-loader.ts`
**Purpose**: Lazy-load + warm Ollama / TurboQuant / Bifrost model handles with VRAM coordination.
**Depends on**: `cache-config.ts` (caches model warmup state)
**Effort**: ~3 hr — consolidate `inference-router.ts:warmModel()`, `gemma4-agent.ts:getPreferredBackend()`, ENV.OLLAMA_BASE_URL probing.

### 1.2 `src/lib/server/ai/model-router.ts`
**Purpose**: Pick the right model+backend per query (legal vs general, VLM vs text, latency budget).
**Depends on**: `model-loader.ts`
**Effort**: ~2 hr — extract the routing decision tree from `inference-router.ts` into a pure function.

### 1.3 `src/lib/server/ai/ab-test.ts`
**Purpose**: Bucket users to model variants, log win rates to RL pipeline.
**Depends on**: `model-router.ts` + `cache-invalidation.ts`
**Effort**: ~3 hr — Redis ZSET for variant scores, percentage rollout, Langfuse trace tag.

---

## Layer 2 — RAG/document services (depends on Layer 1)

### 2.1 `src/lib/server/document-processor.ts`
**Purpose**: Unified entry for OCR/PDF/Granite-Docling/png-embed pipelines.
**Depends on**: `model-router.ts` (chooses VLM vs text path)
**Effort**: ~3 hr — caller-facing facade over the existing extractors in `evidence/upload/+server.ts`.
**Note**: png-embed-extractor.ts (now wired) will be one of its tributaries.

### 2.2 `src/lib/server/vlm-document-analyzer.ts`
**Purpose**: VLM-specific document analysis (mmproj path) — extracted from monolithic upload route.
**Depends on**: `model-router.ts`, `document-processor.ts`
**Effort**: ~2 hr — lift the VLM branch from `evidence/upload/+server.ts`.

### 2.3 `src/lib/server/rag-pipeline.ts`
**Purpose**: End-to-end RAG entry point (already exists at `$lib/server/ai/rag-pipeline.ts` — this INVERTED ref is a path drift).
**Action**: Either move `ai/rag-pipeline.ts` → `rag-pipeline.ts` OR fix the planner's reference.
**Effort**: ~30 min decision + 15 min path fix.

---

## Layer 3 — Workers (depends on Layer 2)

### 3.1 `src/workers/embedding-worker.ts`
**Purpose**: Async embedding worker consuming `document.embed` queue (already wired publisher-side; consumer is the gap).
**Depends on**: `rag-pipeline.ts`, RabbitMQ infra (already live)
**Effort**: ~3 hr — Node worker_threads boilerplate + RabbitMQ consumer (`channel.consume('document.embed', handler)`).
**Note**: Top-level `src/workers/` is unusual — verify path against existing `src/lib/server/workers/audio-processor.ts` pattern.

---

## Layer 4 — Domain services (depends on Layer 3)

### 4.1 `src/lib/server/evidence/audit.ts`
**Purpose**: Evidence audit-trail helpers (chain-of-custody log, hash verification).
**Depends on**: `cache-invalidation.ts`, evidence pipeline (live)
**Effort**: ~2 hr — extract audit calls scattered across `evidence/upload/+server.ts` into a named module.

### 4.2 `src/lib/services/report-auto-populator.ts`
**Purpose**: Auto-fill report fields from case context using RAG.
**Depends on**: `rag-pipeline.ts`, `prompts.ts`
**Effort**: ~3 hr — single function per template field, RAG call, structured JSON return.

### 4.3 `src/lib/messaging/rabbitmq-xstate-integration.ts`
**Purpose**: Bridge XState v5 actor lifecycle ↔ RabbitMQ queue events.
**Depends on**: existing `rabbitmq-manager-fixed.ts`
**Effort**: ~4 hr — define actor protocol, fromPromise wrappers per queue, ack/nack on machine state transition.

### 4.4 `src/lib/phase72/routeGraphAdapter.ts`
**Purpose**: Adapter between phase72 route discovery and the codebase graph.
**Depends on**: codebase-graph.json (live)
**Effort**: ~2 hr — read graph JSON, expose graph-shaped query API.

---

## Layer 5 — UI (depends on Layer 4)

### 5.1 `src/lib/collaboration/yjs-provider.ts` ⚠️ **SSE not WebSocket**
**Purpose**: Per the deplan in `next_steps/01-reports-next-steps.md`, YJS state sync over SSE.
**Depends on**: `cache-invalidation.ts` (broadcast yjs updates), `rabbitmq-xstate-integration.ts` (queue updates for offline clients)
**Effort**: ~4 hr — SSE GET stream serves the YJS update log; POST endpoint accepts client-to-server YJS update messages; reconnection uses Last-Event-ID against state vector.

### 5.2 `src/lib/client/ui/POIPhotoModal.svelte`
**Purpose**: Photo viewer for person-of-interest profiles.
**Depends on**: existing POI components (live)
**Effort**: ~2 hr — bits-ui Dialog + image viewer + zoom.

---

## Layer 6 — Tests (depends on everything)

| File | Effort | Notes |
|------|--------|-------|
| `tests/e2e/reports.spec.ts` | 1 hr | Playwright spec for report flow |
| `tests/unit/templates.test.ts` | 1 hr | Template rendering unit |
| `scripts/tests/test-agent-investigate.mjs` | 1 hr | smoke for agent endpoint |
| `scripts/tests/test-ai.mjs` | 1 hr | AI plumbing smoke |
| `scripts/tests/test-cases.mjs` | 1 hr | Cases CRUD smoke |
| `scripts/tests/test-citations.mjs` | 1 hr | Citations CRUD smoke |
| `scripts/tests/test-evidence.mjs` | 1 hr | Evidence pipeline smoke |
| `scripts/tests/test-screenshots.mjs` | exists at different path? | Verify before creating |

---

## Layer 7 — Deplan / fix references (no implementation needed)

These INVERTED entries should be removed or fixed in `next_steps/`, not implemented:

| File | Why deplan |
|------|-----------|
| `src/lib/machines/evidence-lifecycle-machine.ts` | Already archived to `deeds_labs/unwired-features-archive-2026-05-05/` — `hasDeedsLabsSibling` filter in triage now classifies as noise |
| `drizzle/0002_flaky_midnight.sql` | Wrong filename — actual file shipped as `drizzle/0002_calm_human_cannonball.sql` (drizzle-kit auto-generates random suffixes). Migration is in journal and applied. |
| `scripts/test-migration.ts` | Never built — drop from plan or implement as a thin wrapper around `drizzle-kit migrate --dry-run` |
| `scripts/tests/test-screenshots.mjs` | Was always local-only; CLAUDE.md ref dropped in 506d3d907d. Use Playwright `tests/e2e/*.spec.ts` instead. |
| `scripts/unsloth-training/DETECTIVE_MODE_ENHANCED.md` | Training-mode doc referenced from older session notes — drop unless training is being revisited |

---

## Total estimated effort

| Layer | Hours | Critical path |
|-------|------:|---------------|
| 0 (foundations) | 5.5 | Yes — blocks everything else |
| 1 (AI plumbing) | 8 | Yes — blocks RAG + workers |
| 2 (RAG) | 5.5 | Yes — blocks domain services |
| 3 (workers) | 3 | Partial — can ship without if inline embedding works |
| 4 (domain) | 11 | No — independent of each other |
| 5 (UI) | 6 | No — depends only on Layer 4 |
| 6 (tests) | 8 | No — written alongside as you build |
| 7 (deplan) | 1 | Now |

**Total**: ~48 hr. Critical path (0→1→2→3): ~22 hr. Layer 4+ can parallelize across 2-3 days.

## Suggested commit order

```
1. chore(plan): deplan stale INVERTED references           — Layer 7, 1hr, immediate
2. feat(ai): add prompts.ts canonical template registry    — Layer 0.1, 2hr
3. feat(cache): add cache-config + cache-invalidation      — Layer 0.2-0.3, 3.5hr
4. feat(ai): model-loader + model-router                    — Layer 1.1-1.2, 5hr
5. feat(rag): document-processor + vlm-document-analyzer    — Layer 2.1-2.2, 5hr
6. feat(rag): consolidate rag-pipeline path                 — Layer 2.3, 1hr
7. feat(workers): embedding-worker async consumer           — Layer 3.1, 3hr
8. feat(evidence): audit.ts chain-of-custody helpers        — Layer 4.1, 2hr
9. feat(reports): report-auto-populator                     — Layer 4.2, 3hr
10. feat(messaging): rabbitmq-xstate-integration            — Layer 4.3, 4hr
11. feat(phase72): routeGraphAdapter                        — Layer 4.4, 2hr
12. feat(ai): ab-test rollout framework                     — Layer 1.3, 3hr (deferrable)
13. feat(collab): SSE-based yjs-provider                    — Layer 5.1, 4hr
14. feat(ui): POIPhotoModal                                 — Layer 5.2, 2hr
15. test: tier-1 smokes for evidence/cases/citations/agent  — Layer 6, 5hr
```

## Verification after each commit

```bash
npm run check                           # type-check
npm run audit:d9:full-chain             # confirms file moves out of INVERTED
npm run audit:wiki-enrich               # refreshes karpathy wiki audit signals
```

The INVERTED count should drop by 1 with each commit; when it hits 0, the planner's TODO list is fully realized.
