# Implementation Roadmap — May 29, 2026

**Status:** Ready for execution  
**Duration:** 7-10 days (Day 1 = consolidations, Day 2-4 = Phase 3 USES_DB, Day 5-7 = Feature Graph + Polish)  
**Ownership:** James Woodard  

---

## Executive Summary

Building on **Phase 2 completion** (78 glyphs scored + 106,515 CALLS edges extracted), this roadmap consolidates fragmented cache patterns and wires the structural graph foundation for **runtime intent tracking**.

**Three parallel work streams:**
1. **Consolidations (Day 1)** — 5 cache/architecture unifications (5-15 hours)
2. **Phase 3 USES_DB (Day 2-4)** — Extract table dependencies (8-10 hours)
3. **Feature Graph (Day 5-7)** — Merge structural edges + validate (6-8 hours)

**Blockers:** None. All dependencies (Qdrant, Neo4j, Redis, PostgreSQL) are operational.

**Metrics to track:**
- Consolidation coverage: % of Redis operations using canonical utilities
- USES_DB edge count: Target 15,000+ (files × avg tables/file)
- Feature graph validation: 100% of 18 features resolved to Neo4j nodes

---

## Day 1: Consolidations (5-15 hours)

### Consolidation 1: Embedding Cache Schema Unification

**Current State:** 3 competing key formats across codebase
```
embed:${model}:${hash}          — embedding-cache.ts (99 hits)
embeddings:${id}                — citation-cache.ts (41 hits)
cache:embedding:${type}         — ai modules (18 hits)
```

**Goal:** Single canonical format with schema versioning

**Work:** (1.5 hours)
1. Create `src/lib/server/cache/embedding-cache-unified.ts`
   - Canonical: `embed:v2:${model}:${hash}` with version prefix
   - Zod schema: `{ model, input, embedding: Float32Array, ttl, createdAt }`
   - Functions: `getEmbedding(model, input)`, `setEmbedding(...)`, `deleteEmbeddingBatch(...)`
   - Fallback chain: unified → v1 legacy → Ollama `/api/embed`

2. Update 3 consumer files:
   - `embedding-cache.ts` → use unified cache
   - `citation-cache.ts` → use unified cache
   - `ai/context-compression.ts` → use unified cache

3. Add Redis key migration script:
   - `scripts/migrate-embedding-cache-keys.mjs` (safe, adds new keys, marks old as deprecated)
   - Incremental: lazily rehashes old keys on read

**Success Criteria:**
- ✅ No `embed:` / `embeddings:` / `cache:embedding:` keys created after migration
- ✅ All 3 consumers pass existing unit tests without modification
- ✅ Migration script runs without Redis data loss

**Estimated Time:** 1.5 hours

---

### Consolidation 2: Authority Scoring Unification

**Current State:** 4 different authority scoring implementations
```
authority-chain.ts              — statute/case authority (0.4·PR + 0.3·attn + 0.3·auth)
karpathy-gpu-enrich.mjs         — gpu blend (hardcoded weights)
ace-context-pack-cache.ts       — soft authority boost (+0.15 flat)
recommendation-metrics.ts       — user feedback weighting (custom formula)
```

**Goal:** Single canonical Karpathy blend with weight configuration

**Work:** (2 hours)
1. Create `src/lib/server/scoring/authority-scorer.ts`
   - Input: { pageRank, attentionScore, authorityScore } (all 0-1 normalized)
   - Config: { prWeight: 0.4, attWeight: 0.3, authWeight: 0.3 } (Zod schema)
   - Output: composite score 0-1
   - Error handling: if any input missing, linear fallback on available inputs

2. Update 4 consumers:
   - `authority-chain.ts` → call `authorityScorer.blend(...)`
   - `karpathy-gpu-enrich.mjs` → same weights
   - `ace-context-pack-cache.ts` → replace +0.15 boost with `blend(pr=0, attn=0, auth=1)`
   - `recommendation-metrics.ts` → add "user confidence" as separate track

3. Add Redis cache for blend results:
   - Key: `authority:blend:${fileId}` (24h TTL)
   - Async update on page rank rebuild

**Success Criteria:**
- ✅ Authority blend produces consistent scores for same inputs across all consumers
- ✅ All 4 consumers pass existing tests
- ✅ karpathy GPU enrichment runs with new weights (same output structure)

**Estimated Time:** 2 hours

---

### Consolidation 3: Case-Timeline Query Builder

**Current State:** 5 files duplicate case timeline queries
```
case-timeline.ts                — DB query + sorting
context-assembler.ts            — partial query (missing some joins)
case-graph.ts                   — Neo4j query (incomplete)
deep-research.ts                — hardcoded ORDER BY
entity-extraction.ts            — embedded query string
```

**Goal:** Single `CaseTimelineBuilder` class with SQL/Neo4j dual-mode

**Work:** (2 hours)
1. Create `src/lib/server/cases/timeline-builder.ts`
   ```typescript
   class CaseTimelineBuilder {
     constructor(caseId: string, options?: { limit, offset, includeDisputed })
     sql(): Promise<TimelineEvent[]>  // Postgres query
     neo4j(): Promise<TimelineEvent[]> // Neo4j traversal
     staticMerge(): Promise<TimelineEvent[]> // Merge both (removes duplicates)
     invalidateCache(): Promise<void>
   }
   ```
   - Consistent sorting: (date ASC, confidence DESC, id)
   - Schema: { id, time, location, who[], what, evidenceIds[], confidence, disputed }

2. Update 5 consumers to use builder:
   - All 5 → `new CaseTimelineBuilder(caseId).sql()`
   - Remove embedded queries

3. Add Redis caching layer:
   - Key: `case:timeline:${caseId}` (2h TTL, invalidated on evidence upload)
   - Indexed by time for range queries

**Success Criteria:**
- ✅ All 5 consumers produce identical timeline output for same caseId
- ✅ Existing tests pass without modification
- ✅ Single query point = consistent performance

**Estimated Time:** 2 hours

---

### Consolidation 4: Entity Extraction De-Duplication

**Current State:** 3 entity extractors (regex + LLM + NER patterns)
```
entity-extraction.ts            — EMAIL, PHONE, DATE, CITATION, STATUTE, MONEY
forensics.ts                     — PII-focused (SSN, CC, contact density)
langextract-reranker.ts          — named entity extraction (PERSON, ORG, LOC, MISC)
```

**Goal:** Single `EntityExtractor` with pluggable pattern registry

**Work:** (2 hours)
1. Create `src/lib/server/analysis/entity-extractor-unified.ts`
   - Registry: Map<EntityKind, Pattern | LLMFn>
   - Input: text
   - Output: { kind, value, span, confidence }
   - Patterns: EMAIL, PHONE, DATE, SSN, CC, STATUTE, MONEY, PERSON, ORG, LOC

2. Refactor 3 consumers:
   - `entity-extraction.ts` → use unified extractor
   - `forensics.ts` → call `extract(text, { kind: 'PII' })`
   - `langextract-reranker.ts` → call `extract(text, { kind: 'NER' })`

3. Cache entity extraction results:
   - Key: `entities:${contentHash}` (7d TTL, rarely changes)
   - Batch: 100 texts at a time

**Success Criteria:**
- ✅ All 3 extractors produce same entities for same text (normalized)
- ✅ PII extraction still works in forensics pipeline
- ✅ NER still tags documents in langextract

**Estimated Time:** 2 hours

---

### Consolidation 5: Cache Invalidation Patterns Unification

**Current State:** 4 different invalidation approaches
```
cache-invalidation.ts           — Manual `redis.del(pattern)` calls (fragile, pattern-based)
retrieval/qlora-boost.ts        — Event-driven invalidation (RabbitMQ message)
cache/cache-invalidation.ts      — Cascade invalidation (follows dependency graph)
feature-context-cache.ts         — TTL-only (no explicit invalidation)
```

**Goal:** Single event-driven invalidation registry with cascade support

**Work:** (2.5 hours)
1. Create `src/lib/server/cache/invalidation-registry.ts`
   ```typescript
   class InvalidationRegistry {
     register(event: CacheEvent, affectedKeys: string[] | ((ev) => string[]))
     invalidate(event: CacheEvent): Promise<void>
     cascade(rootKey: string): Promise<Set<string>>  // Find all dependent keys
   }
   ```
   - Events: `schema_change`, `code_change`, `reward_retrain`, `cache_clear`
   - Storage: Redis for registry (computed at startup)

2. Migrate 4 consumers:
   - `cache-invalidation.ts` → publish `schema_change` events
   - `qlora-boost.ts` → publish `reward_retrain` events
   - `cache-invalidation.ts` (old) → use registry.invalidate()
   - `feature-context-cache.ts` → add event listener

3. Document invalidation dependency graph:
   - `docs/CACHE-INVALIDATION-GRAPH-2026-05-29.md`
   - Diagram: schema_change → glyph_records → gpu:karpathy:* → ace:lane:routing_policy

**Success Criteria:**
- ✅ All 4 old approaches decommissioned
- ✅ Single `registry.invalidate()` call removes all affected keys
- ✅ Cascade testing: schema change clears 100% of dependent caches

**Estimated Time:** 2.5 hours

**Total Day 1: 9.5 hours**

---

## Day 2-4: Phase 3 USES_DB Extraction (8-10 hours)

### Phase 3: Extract Database Usage (USES_DB edges)

**Goal:** Identify all code→table dependencies (expect ~15,000+ edges)

**Work:**
1. **Finish extract-db-usage.mjs** (2 hours)
   - Fix current script: swap `db.select/insert/update/delete` detection logic
   - Add pattern: `sql\`` tagged templates → extract table names
   - Add pattern: `pool.query('SELECT * FROM ...')` → regex table extraction
   - Output: NDJSON format `{ source_file, line_num, operation, table, context }`

2. **Run full extraction** (1 hour on dev machine)
   ```bash
   node scripts/atlas/extract-db-usage.mjs --write
   ```
   - Expected: 3,143 files, ~15,000+ USES_DB edges
   - Validation: Spot-check 10 random edges (manual verification)

3. **Sync to Neo4j** (2 hours)
   - Script: `scripts/atlas/phase3-neo4j-sync.mjs`
   - Create edges: `:USES_DB` from File → Table nodes
   - Add metadata: operation type (SELECT, INSERT, UPDATE, DELETE), line number
   - Validation: `MATCH (f:File)-[r:USES_DB]->(t:Table) RETURN count(r)` should be ~15,000

4. **Validate coverage** (2 hours)
   - Query: Which tables are unused? (expect ~5-10 orphaned)
   - Query: Which files touch no tables? (expect ~500 pure utility files)
   - Query: Which tables have <3 callers? (expect ~20 low-use tables, candidates for consolidation)

5. **Commit Phase 3** (1 hour)
   ```bash
   git add scripts/atlas/extract-db-usage.mjs scripts/atlas/phase3-neo4j-sync.mjs
   git commit -m "Phase 3 Atlas: USES_DB extraction (15,000+ table dependencies)

   - TypeScript AST: identify db.select/insert/update/delete calls
   - Pattern matching: sql\`\` tagged templates, pool.query() strings
   - Output: NDJSON USES_DB edges to Neo4j
   - Validation: 3,143 files, 15,000+ edges, 70+ tables covered
   
   Co-Authored-By: Claude Haiku 4.5 <noreply@anthropic.com>"
   ```

**Success Criteria:**
- ✅ extract-db-usage.mjs runs without errors
- ✅ USES_DB edges visible in Neo4j
- ✅ Coverage ≥80% of core tables (users, cases, evidence, documents, etc.)
- ✅ No duplicate edges (idempotent run produces same graph)

**Estimated Time:** 8 hours

---

## Day 5-7: Feature Graph Merge + Validation (6-8 hours)

### Phase 6: Feature Graph (merge CALLS + USES_DB + USES_TOOL)

**Goal:** Build semantic Feature nodes by grouping related CALLS + USES_DB edges

**Work:**
1. **Identify feature clusters** (2 hours)
   - Start from 18 identified features in CODEBASE-FEATURE-MAPPING.md
   - For each feature, find all files with `CALLS` edges between them
   - For each feature, find all tables with `USES_DB` relationships
   - Create Feature node in Neo4j with properties:
     ```
     Feature {
       name: "RAG Pipeline"
       description: "Retrieve-augmented generation"
       files: [...15 files with CALLS edges]
       tables: [...6 tables with USES_DB edges]
       fileCount: 15
       tableCount: 6
       complexity: "high"  // inferred from edges
     }
     ```

2. **Create Feature edges** (2 hours)
   - Edge: Feature → File (100+ files per feature expected)
   - Edge: Feature → Table (5-15 tables per feature)
   - Edge: Feature → Feature (cross-feature dependencies)
     - Example: "Evidence Pipeline" DEPENDS_ON "Entity Extraction"
     - Based on transitive CALLS edges between features

3. **Validate feature graph** (2 hours)
   - Query: Load-bearing features (>50 dependents)
     - Expected: RAG, Evidence, Auth, Cache, Inference (top 5)
   - Query: Single-file features (consolidation candidates)
     - Examine manually
   - Query: Cross-feature imports (find architectural coupling)

4. **Create feature relationship documentation** (1 hour)
   - `docs/FEATURE-GRAPH-2026-05-29.md` with Cypher queries

5. **Commit Phase 6** (1 hour)
   ```bash
   git commit -m "Phase 6 Atlas: Feature graph integration

   - Merge CALLS (phase 2) + USES_DB (phase 3) into semantic features
   - Create 18 Feature nodes with file/table coverage
   - Validate cross-feature dependencies (RAG ← Evidence ← EntityExtraction)
   - Identify load-bearing features (50+ dependents)
   
   Co-Authored-By: Claude Haiku 4.5 <noreply@anthropic.com>"
   ```

**Success Criteria:**
- ✅ All 18 features mapped to Neo4j Feature nodes
- ✅ 100% of CALLS + USES_DB edges belong to ≥1 feature
- ✅ Feature graph acyclic (no circular dependencies)
- ✅ Dependency diagram matches CODEBASE-FEATURE-MAPPING.md

**Estimated Time:** 8 hours (includes validation + docs)

---

## Day 7+: Polish & Documentation (Optional, 2-4 hours)

### Documentation & Cleanup
1. **Create implementation summary**
   - `docs/ATLAS-PHASES-1-TO-6-COMPLETE.md`
   - Summary: 3,143 files, 106.5K CALLS edges, 15K+ USES_DB edges, 18 features, 52 tables
   - Metrics: graph density, feature interdependency, layer distribution

2. **Graphistry visualization** (optional, 2 hours)
   - Export Neo4j → Graphistry format
   - 3D visualization: nodes = files, edges = CALLS/USES_DB, color = feature
   - Interactive: hover → show file details

3. **Archive Phase 2 extraction logs**
   - `scripts/atlas/out/phase2-glyphs-grpo-rewards.log`
   - `scripts/atlas/out/phase2-calls-extraction.log`
   - `scripts/atlas/out/phase3-uses-db-extraction.log`

---

## Daily Checklist

### Day 1 (Consolidations)
- [ ] Embedding cache unified + migration script
- [ ] Authority scorer unified + 4 consumers migrated
- [ ] Case timeline builder + 5 consumers migrated
- [ ] Entity extractor unified + 3 consumers migrated
- [ ] Invalidation registry + cascade support
- [ ] Commit consolidations
- [ ] Git status: 0 uncommitted changes

### Day 2-4 (Phase 3)
- [ ] extract-db-usage.mjs complete and tested
- [ ] Full run: 3,143 files → 15,000+ edges
- [ ] Neo4j sync: USES_DB edges visible
- [ ] Validation: 80% table coverage
- [ ] Commit Phase 3

### Day 5-7 (Feature Graph)
- [ ] 18 Feature nodes created
- [ ] Feature edges: File, Table, Cross-feature
- [ ] Validation: acyclic, all edges assigned
- [ ] Documentation: FEATURE-GRAPH.md + queries
- [ ] Commit Phase 6

---

## Redis Caches Ready to Use

Post-consolidation, the following Redis caches are immediately available:

| Cache | Key Pattern | TTL | Size |
|-------|-------------|-----|------|
| Embedding | `embed:v2:${model}:${hash}` | 7d | Float32Array |
| Authority Blend | `authority:blend:${fileId}` | 24h | {pr, attn, auth, composite} |
| Case Timeline | `case:timeline:${caseId}` | 2h | TimelineEvent[] |
| Entity Extraction | `entities:${contentHash}` | 7d | Entity[] |
| Invalidation Registry | `cache:registry:${event}` | 1h | {affectedKeys: string[]} |

---

## Blockers & Risk Mitigation

| Risk | Mitigation |
|------|-----------|
| Qdrant unavailable during consolidations | Redis fallbacks in place; no hard dependency on Qdrant for Day 1 |
| Neo4j sync fails (Phase 3) | Run validation queries before committing; rollback transaction if >5% error |
| Feature graph has cycles | Tarjan's algorithm to detect + report; manual intervention required |
| Redis memory pressure during caching | Monitor via `/api/cache/exact-match/stats`; raise maxmemory if needed |

---

## Success Metrics (End of Day 7)

✅ **Consolidations**: 5/5 complete, 100% of old patterns migrated  
✅ **Phase 3**: 15,000+ USES_DB edges, 80% table coverage  
✅ **Feature Graph**: 18 features, acyclic dependency graph  
✅ **Code Quality**: svelte-check 0 errors, all tests pass  
✅ **Git**: 3 clean commits, no uncommitted changes  

---

## Next Phase: Runtime Intent Graph (Week 2+)

After structural graph is validated:
1. **Week 1**: Engram ledger + graph mutation ledger (PostgreSQL)
2. **Week 2**: Qdrant payload enrichment (intent, domain, graphNodeId)
3. **Week 3**: CouchDB views + DuckDB audit
4. **Week 4**: MCP tools (atlas-tools.find_intent_chain)

See `docs/atlas-runtime-intent-graph-architecture.md` for full specification.

---

**Ready to execute. Start with Day 1 consolidations — estimated 9.5 hours.**
