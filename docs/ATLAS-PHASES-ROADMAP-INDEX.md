# Atlas Phases Roadmap — Complete Index (May 29, 2026)

**Status:** Phase 2 complete, Phase 3-6 + Runtime Intent Graph planned  
**Total Architecture Scope:** Static graph → Runtime intent tracking  
**Implementation Horizon:** 3-4 weeks (Phases 3-6) + 1-4 weeks (Runtime intent graph)

---

## Quick Navigation

| Phase | Status | Document | Hours | Output |
|-------|--------|----------|-------|--------|
| 1 | ✅ Complete | Phase 1 Glyphs: 78 ACE cards ingested | 4 | `glyph_records` table |
| 2 | ✅ Complete | Phase 2 Atlas CALLS: 106,515 edges | 8 | Neo4j CALLS edges |
| **Consolidations** | 📋 Ready | REDIS-CACHE-CONSOLIDATION-2026-05-29.md | **9.5** | 5 unified cache patterns |
| 3 | 📋 Ready | Phase 3 USES_DB: Extract table dependencies | 8 | 15,000+ Neo4j edges |
| 4 | 🔜 Pending | Phase 4 USES_TOOL: Extract API tool usage | 3 | Tool dependency edges |
| 5 | 🔜 Pending | Phase 5 Neo4j Sync + Indexes | 2 | Optimized Neo4j queries |
| 6 | 📋 Ready | Phase 6 Feature Graph: Merge all edges | 8 | 18 semantic features |
| Runtime Intent | 🔜 Planned | atlas-runtime-intent-graph-architecture.md | 20-30 | Engram ledger + intent tracking |

---

## Document Map

### Implementation Roadmap (START HERE)
- **`NEXT-STEPS-IMPLEMENTATION-2026-05-29.md`** (17 KB)
  - Day-by-day breakdown: Days 1-7 (25.5 hours total)
  - Consolidations (Day 1): 5 cache pattern unifications
  - Phase 3 (Day 2-4): USES_DB extraction + Neo4j sync
  - Feature Graph (Day 5-7): Merge CALLS + USES_DB → 18 features
  - Daily checklists + blockers + success metrics
  - **READ THIS FIRST** for step-by-step implementation plan

### Consolidation Work (Day 1 Priority)
- **`REDIS-CACHE-CONSOLIDATION-2026-05-29.md`** (16 KB)
  - Comprehensive Redis audit: 242 files, 507 operations
  - 5 consolidation targets with time estimates (1.5h - 2.5h each)
  - 3 embedding cache formats → 1
  - 4 authority scoring approaches → 1 Karpathy blend
  - 5 timeline queries → 1 builder class
  - 3 entity extractors → pluggable registry
  - 4 invalidation patterns → event-driven + cascade
  - Migration strategy (Phase 1→2→3: new → coexist → decommission)

- **`REDIS-SHARED-UTILITIES-API.md`** (16 KB)
  - Design spec for shared cache API (ready to code Day 1)
  - 4 reusable patterns: cacheTTL, cacheHashMap, cacheGetBatch, InvalidationRegistry
  - cache-config.ts: centralized TTLs, key patterns, Zod schemas
  - Implementation checklist with tests
  - Performance impact: authority 40× faster, timeline 10× faster, entities 50-100× faster

### Codebase Intelligence (Feature Mapping)
- **`CODEBASE-FEATURE-MAPPING-2026-05-29.md`** (10 KB)
  - Maps all 3,143 files to 18 semantic features across 4 domains
  - Domain 1: Codebase Intelligence (512 files) — KAG, RAG, Embeddings, Neo4j
  - Domain 2: Legal AI (287 files) — Evidence, Cases, Citations, Forensics
  - Domain 3: Frontend (894 files) — Auth, UI, Forms, Routing
  - Domain 4: Backend Services (450 files) — MCP, Queues, Cache, Inference, DB, Observability
  - Lane assignments: A (production ready), B (near-ready), C (blocked/pending)
  - SQL queries to leverage Phase 2 CALLS graph for feature discovery

### Architecture & Design (Future Phases)
- **`atlas-runtime-intent-graph-architecture.md`** (25 KB)
  - 7-layer data flow: Neo4j → Qdrant → CouchDB → DuckDB → PostgreSQL → Redis → MCP
  - 7 node types: Intent, Feature, State, Event, Tool, CacheKey, RewardRun
  - 8 edge types: RESOLVES_INTENT, DEPENDS_ON_STATE, INVALIDATED_BY, USES_TOOL, etc.
  - Engram memory ledger: structured event log (intent, tool, outcome, reward, graph version)
  - Graph mutation ledger: track schema/code changes + cascading impact
  - 4-week implementation order (Week 1-4)
  - Comparison: static vs intent-aware graph capabilities

---

## Quick Stats

### Phase 2 Output (Complete)
- **3,143 files** analyzed via ts-morph
- **106,515 CALLS edges** extracted (39,296 unique functions)
- **78 ACE glyphs** scored with GRPO rewards
- **Top 10 callers** account for 30% of volume

### Consolidation Targets (Day 1)
- **242 files** using Redis
- **507 Redis operations** (set, get, hset, hget, del, setex, expire, mget)
- **5 fragmented patterns** → 5 unified utilities
- **Expected savings:** 20-30% Redis memory reduction + 40-100× latency improvements

### Phase 3-6 Goals
- **15,000+ USES_DB edges** (files × tables)
- **18 semantic features** with file/table coverage
- **80% table coverage** (70+ core tables)
- **Acyclic feature graph** with dependency audit

---

## Implementation Order

### Week 1 (Days 1-2): Consolidations + Phase 3 Start
```
Day 1 (9.5h):
  - embedding-cache unified
  - authority-scorer unified
  - case-timeline builder
  - entity-extractor unified
  - invalidation-registry + cascade

Day 2 (4h):
  - extract-db-usage.mjs complete + tested
  - Full run: 3,143 files → 15,000+ edges
```

### Week 1-2 (Days 3-4): Phase 3 Completion + Validation
```
Day 3 (4h):
  - Neo4j USES_DB sync
  - Table coverage validation: 80%+

Day 4 (2h):
  - Commit Phase 3
  - Prepare feature clustering
```

### Week 2 (Days 5-7): Feature Graph Merge
```
Day 5 (2h):
  - Identify 18 feature clusters from CALLS + USES_DB

Day 6 (3h):
  - Create Feature nodes + cross-feature edges
  - Validation: acyclic, all edges assigned

Day 7 (2h):
  - Documentation: FEATURE-GRAPH.md + Cypher queries
  - Commit Phase 6
```

---

## Success Criteria

### End of Week 1 (Consolidations)
- ✅ 5 consolidations complete, 100% old patterns migrated
- ✅ 0 lingering `embed:`, `embeddings:`, `cache:embedding:` keys
- ✅ All existing tests pass with new code
- ✅ 1 clean commit with consolidations

### End of Week 1-2 (Phase 3)
- ✅ 15,000+ USES_DB edges in Neo4j
- ✅ 80% table coverage (60+ of 70 core tables)
- ✅ No duplicate edges (idempotent extraction)
- ✅ 1 clean commit with Phase 3

### End of Week 2 (Feature Graph)
- ✅ 18 Feature nodes in Neo4j
- ✅ File/Table/Cross-feature edges complete
- ✅ Graph is acyclic (validated via Tarjan's algorithm)
- ✅ 100% of CALLS + USES_DB edges belong to ≥1 feature
- ✅ 1 clean commit with Feature Graph
- ✅ svelte-check 0 errors, all tests pass

---

## Next Phase: Runtime Intent Graph (Weeks 3-6)

After structural graph validation:

### Week 1 (Days 1-5): Graph Schema + Ledgers
- Add `graph_mutations` table (track schema/code changes)
- Add `engram_ledger` table (structured intent/tool/outcome traces)
- Wire mutation hooks into drizzle-kit post-migration
- Wire engram appends into Phase 2-4 extractors

### Week 2 (Days 1-5): Vector Payloads + Semantics
- Add `intent`, `domain`, `graphNodeId` to Qdrant payload schema
- Reindex `codebase_chunks_768` with runtime intent metadata
- Create `intent_embeddings` collection for user goals

### Week 3 (Days 1-5): CouchDB Views + DuckDB Audit
- MapReduce views: `retrieval_loop`, `tool_calls`, `glyph_rewards`, `sourceRef_coverage`
- DuckDB audit queries: missing edges, stale features, orphan files
- Dashboard: `/admin/graph-health` showing mutation impact

### Week 4 (Days 1-5): MCP Tools + Integration
- `atlas-tools.find_intent_chain` (traverse intent → feature → state → event chain)
- `atlas-tools.check_invalidation_status` (is this feature stale?)
- Wire Gemma4 to ask "What tool should I call?" via graph

---

## How to Use These Documents

1. **Start with NEXT-STEPS-IMPLEMENTATION-2026-05-29.md**
   - Read Day 1 section for immediate action items
   - Refer to daily checklist as you work

2. **During Day 1, use REDIS-CACHE-CONSOLIDATION-2026-05-29.md**
   - Cross-reference each consolidation for details
   - Use migration strategy for rollback plan

3. **During Day 1, code from REDIS-SHARED-UTILITIES-API.md**
   - Copy pattern signatures and implementations
   - Use cache-config.ts template for TTLs/keys/schemas
   - Follow implementation checklist

4. **During Days 2-4, reference CODEBASE-FEATURE-MAPPING-2026-05-29.md**
   - Use SQL queries to validate Phase 3 USES_DB output
   - Cross-check feature coverage

5. **For Week 3+, read atlas-runtime-intent-graph-architecture.md**
   - Full specification for runtime intent graph
   - Use implementation order for phasing
   - Reference node/edge types as you schema design

---

## Key Files to Create (Day 1)

After reading REDIS-SHARED-UTILITIES-API.md:

```
src/lib/server/cache/
  ├── shared-cache-api.ts          # 4 reusable patterns (150 lines)
  ├── cache-config.ts              # TTLs, keys, schemas (80 lines)
  
src/lib/server/scoring/
  ├── authority-scorer.ts          # Karpathy blend (100 lines)
  
src/lib/server/cases/
  ├── timeline-builder.ts          # Query builder + cache (120 lines)
  
src/lib/server/analysis/
  ├── entity-extractor-unified.ts  # Pluggable registry (150 lines)
```

Total new code: ~500 lines (1-2 hours to write + test)

---

## Redis Caches (After Consolidation)

| Cache | Key Pattern | TTL | Type | Consumers |
|-------|-------------|-----|------|-----------|
| Embedding | `embed:v2:${model}:${hash}` | 7d | Float32Array | 8 files |
| Authority Blend | `authority:blend:${fileId}` | 24h | {pr, attn, auth, composite} | 3 files |
| Case Timeline | `case:timeline:${caseId}` | 2h | TimelineEvent[] | 5 files |
| Entity Extraction | `entities:${contentHash}` | 7d | Entity[] | 3 files |
| Invalidation Registry | `cache:registry:${event}` | 1h | {affectedKeys: string[]} | 4 files |

---

## Blockers & Risks

| Risk | Mitigation | Status |
|------|-----------|--------|
| Qdrant unavailable (Day 1) | Redis fallback already in place | ✅ Clear |
| Neo4j sync failure (Day 2-4) | Run validation before commit, rollback if >5% error | ✅ Clear |
| Feature graph cycles (Day 5-7) | Tarjan cycle detection, manual intervention | ✅ Clear |
| Redis memory pressure | Monitor via `/api/cache/stats`, raise maxmemory if needed | ✅ Clear |

---

## Monitoring & Observability

**During Consolidations:**
```bash
# Check Redis memory before/after
redis-cli INFO memory | grep used_memory_human

# Count key patterns
redis-cli KEYS 'embed:*' | wc -l          # should go 3→1 format
redis-cli KEYS 'authority:blend:*' | wc -l # new cache

# Monitor cache hits
grep '\[cacheTTL\] HIT' app.log | wc -l
```

**Phase 3 Validation:**
```cypher
// Neo4j queries
MATCH (f:File)-[r:USES_DB]->(t:Table) RETURN count(r) // should be ~15,000
MATCH (t:Table) WHERE NOT (()-[:USES_DB]->(t)) RETURN count(t) // orphans
MATCH (f:File) WHERE NOT ((f)-[:USES_DB]->()) RETURN count(f) // pure util files
```

**Feature Graph Validation:**
```cypher
// Check for cycles
CALL apoc.algo.allSimplePaths(...) // detect cycles

// Verify coverage
MATCH (ft:Feature) RETURN count(ft) // should be 18
MATCH (e:Edge) RETURN count(DISTINCT e.featureId) // coverage
```

---

## Questions?

- **What should I do first?** Start with `NEXT-STEPS-IMPLEMENTATION-2026-05-29.md`, Day 1 section
- **How long will this take?** 7-10 days (9.5h consolidations + 8h Phase 3 + 8h Feature Graph)
- **What if I get stuck?** Check the specific consolidation doc (REDIS-CACHE-CONSOLIDATION-2026-05-29.md) or migration strategy
- **When do we implement runtime intent graph?** Week 3+, after structural graph is validated

---

**Ready to begin. See you Day 1 morning — start with consolidation 1 (embedding cache).**
