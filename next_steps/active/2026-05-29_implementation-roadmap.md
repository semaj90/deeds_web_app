# Implementation Roadmap Summary — May 29, 2026

**Created:** 2026-05-29 (post-session summary)  
**Context:** Phase 2 complete (78 glyphs, 106.5K CALLS), now consolidating + Phase 3 planning  
**Duration:** 7-10 days  

---

## Three Parallel Work Streams

### 1. Day 1: Consolidations (5-15 hours)
Consolidate fragmented cache + architecture patterns into canonical utilities.

**5 Quick Wins:**
1. **Embedding Cache Unification** — 3 formats → 1 canonical format (1.5h)
2. **Authority Scoring Unification** — 4 approaches → single Karpathy blend (2h)
3. **Case Timeline Builder** — 5 duplicate queries → single class (2h)
4. **Entity Extractor Unification** — 3 implementations → pluggable registry (2h)
5. **Invalidation Registry** — 4 approaches → event-driven + cascade (2.5h)

**Files:** `docs/REDIS-CACHE-CONSOLIDATION-2026-05-29.md` (comprehensive audit + patterns)

---

### 2. Day 2-4: Phase 3 USES_DB (8-10 hours)
Extract database usage dependencies (USES_DB edges).

**Work:**
- Fix extract-db-usage.mjs (2h)
- Run full extraction: 3,143 files → 15,000+ edges (1h)
- Neo4j sync (2h)
- Validation: 80% table coverage (2h)
- Commit (1h)

**Expected Output:** USES_DB edges in Neo4j visible via `MATCH (f:File)-[r:USES_DB]->(t:Table) RETURN count(r)`

---

### 3. Day 5-7: Feature Graph (6-8 hours)
Merge CALLS (Phase 2) + USES_DB (Phase 3) into semantic features.

**Work:**
- Identify 18 feature clusters (2h)
- Create Feature nodes + edges (2h)
- Validate graph (2h)
- Documentation (2h)

**Expected Output:** 18 Feature nodes in Neo4j with file/table coverage

---

## Daily Checklist

```
Day 1 (Consolidations):
  [ ] embedding-cache-unified.ts + migration script
  [ ] authority-scorer.ts + 4 consumers migrated
  [ ] timeline-builder.ts + 5 consumers migrated
  [ ] entity-extractor-unified.ts + 3 consumers migrated
  [ ] invalidation-registry.ts + cascade support
  [ ] Commit consolidations

Day 2-4 (Phase 3):
  [ ] extract-db-usage.mjs complete + tested
  [ ] Full run: 15,000+ USES_DB edges
  [ ] Neo4j sync complete
  [ ] Validation: 80% table coverage
  [ ] Commit Phase 3

Day 5-7 (Feature Graph):
  [ ] 18 Feature nodes created
  [ ] Feature edges (File, Table, Cross-feature)
  [ ] Validation: acyclic, all edges assigned
  [ ] Documentation: FEATURE-GRAPH.md
  [ ] Commit Phase 6
```

---

## Key Documents

| File | Purpose |
|------|---------|
| `docs/NEXT-STEPS-IMPLEMENTATION-2026-05-29.md` | Day-by-day breakdown, 9.5h consolidations + 8h Phase 3 + 8h Feature Graph |
| `docs/REDIS-CACHE-CONSOLIDATION-2026-05-29.md` | Full Redis audit (242 files, 507 ops), 5 consolidation opportunities, reusable patterns |
| `docs/CODEBASE-FEATURE-MAPPING-2026-05-29.md` | 18 semantic features across 4 domains, 397 directories, lane assignments |
| `docs/atlas-runtime-intent-graph-architecture.md` | 7-layer architecture for next phase (Engram + mutation ledgers) |

---

## Quick Stats

**Structural Graph (Phase 2):**
- 3,143 files analyzed
- 106,515 CALLS edges extracted
- 39,296 unique functions
- Top 10 callers = 30% of volume

**Consolidation Savings:**
- Redis operations: 242 files, 507 calls
- Cache patterns: 3 embedding formats → 1
- Authority scoring: 4 approaches → 1
- Query duplication: 5 timeline queries → 1 builder
- Entity extraction: 3 implementations → 1

**Phase 3 Target:**
- 15,000+ USES_DB edges
- 70+ tables covered
- 80% coverage of core tables (users, cases, evidence, documents, etc.)

---

## Success Criteria (End of Day 7)

✅ **Consolidations**: 5/5 complete, 100% old patterns migrated  
✅ **Phase 3**: 15,000+ USES_DB edges, 80% table coverage  
✅ **Feature Graph**: 18 features, acyclic, all edges assigned  
✅ **Code Quality**: svelte-check 0 errors, all tests pass  
✅ **Git**: 3 clean commits, 0 uncommitted changes  

---

## Next Phase: Runtime Intent Graph (Week 2+)

After structural graph validated:
- **Week 1**: Engram ledger + Graph mutation ledger (PostgreSQL)
- **Week 2**: Qdrant payload enrichment (intent, domain, graphNodeId)
- **Week 3**: CouchDB views + DuckDB audit
- **Week 4**: MCP tools (atlas-tools.find_intent_chain)

See `docs/atlas-runtime-intent-graph-architecture.md`.

---

## Redis Caches Ready to Use (Post-Consolidation)

| Cache | Key Pattern | TTL | Size |
|-------|-------------|-----|------|
| Embedding | `embed:v2:${model}:${hash}` | 7d | Float32Array |
| Authority Blend | `authority:blend:${fileId}` | 24h | {pr, attn, auth, composite} |
| Case Timeline | `case:timeline:${caseId}` | 2h | TimelineEvent[] |
| Entity Extraction | `entities:${contentHash}` | 7d | Entity[] |
| Invalidation Registry | `cache:registry:${event}` | 1h | {affectedKeys: string[]} |

---

**Ready to execute. Start with Day 1 consolidations (9.5 hours).**
