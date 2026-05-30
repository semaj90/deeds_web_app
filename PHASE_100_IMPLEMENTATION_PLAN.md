# Phase 100: Parent Atlas Indexing, MapReduce Joins & GPU-Ready Architecture
**Status**: Planning  
**Started**: 2026-05-30  
**Priority**: P0 (Blocks comprehensive codebase analysis)

---

## Overview

This phase consolidates the codebase for comprehensive parent atlas indexing with:
1. **MapReduce joins** for efficient JSON/JSONB document consolidation
2. **PostgreSQL 18 upgrade** with pgvector compatibility verification
3. **UUID standardization** across all Drizzle-ORM schemas
4. **KMeans clustering** for Qdrant collections tied to Neo4j
5. **GPU CUDA analysis** preparation (RTX 3060 Ti tensors)
6. **File consolidation** into proper directory structure
7. **Static + dynamic virtual memory mapping** for deep imports
8. **Documentation reranking** without knowledge graph deletion

---

## Architecture Layers

```
Layer 1: File System Organization (Foundation)
├── Consolidate documents by feature/domain
├── Map static imports (src/lib/*, drizzle/*)
├── Map dynamic imports (@vite-ignore, lazy-load)
├── Build UUID canonical reference
└── Validate pgvector compatibility

Layer 2: PostgreSQL 18 Upgrade (Database)
├── Test pgvector with PG 18
├── Drizzle-ORM 0.45+ compatibility check
├── UUID migration (20/44 FK columns)
├── Create parent atlas schema tables
└── Build MapReduce pipeline

Layer 3: MapReduce Joins (Data Processing)
├── File metadata consolidation
├── Static import graph joins
├── Dynamic import resolution
├── Semantic tagging (keywords from docs)
├── Parent atlas JSON/JSONB document generation

Layer 4: Qdrant + Neo4j Wiring (Knowledge Graph)
├── KMeans clustering on codebase_chunks_768
├── Cluster → Neo4j BELONGS_TO_CLUSTER edges
├── Qdrant collection tagging by directory/feature
├── HyperRAG trust-tier alignment
└── Feature discovery recommendations

Layer 5: GPU Analysis (Optional, Post-Consolidation)
├── PyTorch tensor analysis of embeddings
├── Attention weight analysis across features
├── Latency profiling (RTX 3060 Ti)
└── Optimization recommendations
```

---

## Phase Breakdown

### PHASE 100.1: File System Consolidation (Week 1)

**Goal**: Organize files into feature/domain-aware directory structure

| Task | Status | Owner | ETA |
|------|--------|-------|-----|
| **1.1 Directory audit** | Pending | Script | 2h |
| 1.1.1 Scan all 3000 files, classify by domain | - | audit-filesystem.mjs | - |
| 1.1.2 Build file→feature mapping (JSON) | - | same | - |
| 1.1.3 Generate recommendation matrix | - | same | - |
| **1.2 Safe consolidation** | Pending | Manual | 6h |
| 1.2.1 Create new dirs: /src/lib/features/{auth,rag,graph,vector,llm,ui,cache,admin} | - | - | - |
| 1.2.2 Move files (git mv, preserve git history) | - | - | - |
| 1.2.3 Update import paths in ~500 files | - | script + manual | - |
| 1.2.4 Verify tsconfig paths aliases | - | - | - |
| **1.3 Build reference graphs** | Pending | Script | 4h |
| 1.3.1 Static imports: src/**/*.ts → src/**/*.ts (3000 nodes, ~8000 edges) | - | build-import-graph.mjs | - |
| 1.3.2 Dynamic imports: map @vite-ignore, lazy-load, await import() | - | same | - |
| 1.3.3 Export CouchDB JSON for MapReduce | - | same | - |

**Deliverable**: `docs/phase100/file-consolidation-audit.json` (file→feature mapping)

---

### PHASE 100.2: PostgreSQL 18 Upgrade & UUID Standardization (Week 1-2)

**Goal**: Upgrade to PG 18, verify pgvector, standardize UUIDs in FK columns

| Task | Status | Owner | ETA |
|------|--------|-------|-----|
| **2.1 PG 18 compatibility audit** | Pending | Manual + script | 3h |
| 2.1.1 Test current pgvector with PG 18 | - | docker-compose test | 30m |
| 2.1.2 Verify Drizzle-ORM 0.45+ support | - | grep + npm ls | 15m |
| 2.1.3 Check all current extensions (hnsw, btree_gist, pg_trgm) | - | psql query | 15m |
| 2.1.4 Review PG 18 breaking changes for our schema | - | docs + manual | 1.5h |
| **2.2 UUID standardization** | Pending | SQL migrations | 8h |
| 2.2.1 Audit: 44 FK columns across 20 tables currently mismatched (int/uuid/text) | - | schema-drift audit | 1h |
| 2.2.2 Design migration path (3 options: all-uuid, all-int, two-tier) | - | discussion | 1h |
| 2.2.3 Generate migration SQL (Path C: users.id=int, users.uuid=uuid, two-tier) | - | migration-generator.mjs | 2h |
| 2.2.4 Apply migration to test DB | - | drizzle-kit migrate | 2h |
| 2.2.5 Backfill data (uuid for legacy analytics tables) | - | backfill script | 1h |
| 2.2.6 Update Drizzle schema (schema-postgres.ts) | - | manual | 1h |
| **2.3 PostgreSQL 18 deployment** | Pending | Docker | 2h |
| 2.3.1 Build new Docker image (PG 18.1) | - | Dockerfile update | 30m |
| 2.3.2 Test docker-compose up with new image | - | docker-compose | 30m |
| 2.3.3 Run full test suite | - | npm test | 1h |

**Deliverable**: PG 18 running locally, all UUID migrations applied, Drizzle schema updated

---

### PHASE 100.3: MapReduce Joins for Parent Atlas (Week 2)

**Goal**: Build consolidated JSON/JSONB documents via MapReduce for efficient indexing

| Task | Status | Owner | ETA |
|------|--------|-------|-----|
| **3.1 MapReduce framework** | Pending | Script | 6h |
| 3.1.1 Design: File metadata + static imports + dynamic imports → unified JSON | - | design doc | 1h |
| 3.1.2 Implement map phase (per-file extraction) | - | mapreduce-joins.mjs | 2h |
| 3.1.3 Implement reduce phase (aggregation + join) | - | same | 2h |
| 3.1.4 Add semantic tagging from AGENTS.md + docs | - | same | 1h |
| **3.2 Test MapReduce pipeline** | Pending | Script | 3h |
| 3.2.1 Run on subset (100 files) | - | mapreduce-joins.mjs --limit 100 | 30m |
| 3.2.2 Verify JSON output shape | - | jq inspection | 30m |
| 3.2.3 Validate import graph joins (no dangling refs) | - | audit script | 1h |
| 3.2.4 Performance profile (time, memory) | - | node --inspect | 1h |
| **3.3 Full codebase run** | Pending | Script | 4h |
| 3.3.1 MapReduce on all 3000 files | - | mapreduce-joins.mjs | 2h |
| 3.3.2 Output: CouchDB consolidated docs JSON | - | same | - |
| 3.3.3 Export to PostgreSQL parent_atlas table | - | psql import script | 1h |
| 3.3.4 Commit consolidated index to repo (if <10MB) | - | git add + check size | 1h |

**Deliverable**: `sveltekit-frontend/docs/phase100/parent-atlas-consolidated.json` (or split into chunks if >10MB)

---

### PHASE 100.4: PostgreSQL Parent Atlas Schema (Week 2)

**Goal**: Create normalized schema for storing consolidated documents with semantic tags

| Task | Status | Owner | ETA |
|------|--------|-------|-----|
| **4.1 Schema design** | Pending | SQL + Drizzle | 2h |
| 4.1.1 Create parent_atlas_documents table | - | drizzle schema | 1h |
| 4.1.2 Create parent_atlas_semantic_tags table (JSONB) | - | same | 30m |
| 4.1.3 Design GIN indexes for efficient search | - | same | 30m |
| **4.2 Migration & ingestion** | Pending | Script | 4h |
| 4.2.1 Generate Drizzle migration | - | drizzle-kit generate | 30m |
| 4.2.2 Write ingest script (MapReduce → PostgreSQL) | - | ingest-consolidated.mjs | 2h |
| 4.2.3 Ingest all parent_atlas documents | - | same | 1h |
| 4.2.4 Verify row counts + checksums | - | psql query | 30m |

**Deliverable**: parent_atlas tables populated with 3000+ consolidated documents

---

### PHASE 100.5: KMeans Clustering & Qdrant Tagging (Week 3)

**Goal**: Cluster codebase_chunks_768 via GPU, tag by feature/directory, sync to Neo4j

| Task | Status | Owner | ETA |
|------|--------|-------|-----|
| **5.1 Qdrant collection audit** | Pending | Script | 2h |
| 5.1.1 Query codebase_chunks_768 stats (count, dimensions) | - | qdrant API | 30m |
| 5.1.2 Check existing payload tags (dir, feature, sem_tags) | - | same | 30m |
| 5.1.3 Identify missing tags (gaps in coverage) | - | audit script | 1h |
| **5.2 KMeans clustering (GPU)** | Pending | GPU script | 4h |
| 5.2.1 Fetch all 3000 embeddings from Qdrant | - | qdrant scroll | 1h |
| 5.2.2 Run GPU kmeans (k=20, RTX 3060 Ti) | - | pytorch-gpu-kmeans.py | 1.5h |
| 5.2.3 Assign cluster IDs to all points | - | same | 1h |
| 5.2.4 Store som_cluster + bmu_row/col in Qdrant payload | - | update script | 30m |
| **5.3 Neo4j sync** | Pending | Script | 3h |
| 5.3.1 Create CLUSTER nodes in Neo4j (k=20) | - | neo4j-sync.mjs | 1h |
| 5.3.2 Create BELONGS_TO_CLUSTER edges (3000 edges) | - | same | 1h |
| 5.3.3 Add cluster metrics (size, avg_score, keywords) | - | same | 1h |
| **5.4 Semantic tagging** | Pending | Script | 2h |
| 5.4.1 Tag chunks by parent file feature/domain | - | tag-by-feature.mjs | 1h |
| 5.4.2 Tag by directory path | - | same | 30m |
| 5.4.3 Add confidence scores + keyword extraction | - | same | 30m |

**Deliverable**: Qdrant collections tagged + Neo4j graph updated with BELONGS_TO_CLUSTER edges

---

### PHASE 100.6: Documentation Reranking (Week 3)

**Goal**: Surface missing features, create recommendations, append docs (no deletion)

| Task | Status | Owner | ETA |
|------|--------|-------|-----|
| **6.1 Feature gap analysis** | Pending | Script | 3h |
| 6.1.1 Query Neo4j: nodes with in-degree < 2 (isolated) | - | neo4j cypher | 30m |
| 6.1.2 Cross-reference with AGENTS.md vault_md_index | - | vault query | 1h |
| 6.1.3 Generate gap report (missing: auth-token-rotation, session-invalidation, etc.) | - | generate-gaps.mjs | 1.5h |
| **6.2 Recommendations & documentation** | Pending | Manual + Script | 4h |
| 6.2.1 For each gap, append recommendation to docs/phase100/feature-recommendations.md | - | manual | 2h |
| 6.2.2 Example: "MISSING: Proper UUID FK for analytics.user_id (currently uuid, FK broken to users.id=int) → RECOMMENDATION: Adopt Path C (two-tier identity), backfill UUID on users table" | - | same | - |
| 6.2.3 Link gaps to knowledge graph nodes (Neo4j stableKey) | - | same | 1h |
| 6.2.4 APPEND docs (never delete prior knowledge) | - | append-only script | 1h |
| **6.3 Commit & archive** | Pending | Git | 1h |
| 6.3.1 Commit gap report + recommendations | - | git commit | 30m |
| 6.3.2 Tag for Phase 101 (next phase picks these up) | - | git tag | 30m |

**Deliverable**: `docs/phase100/feature-recommendations.md` + gap analysis JSON

---

## Critical Gates (No Breaking Changes)

| Gate | Check | Impact |
|------|-------|--------|
| **G1: pgvector with PG 18** | `SELECT pgvector_version()` returns 0.7.x+ | All vector queries fail if broken |
| **G2: Drizzle-ORM 0.45+** | `npm ls drizzle-orm` → 0.45.0+ | TypeScript compilation fails if <0.45 |
| **G3: UUID migration** | Foreign key constraints validate | Auth + case queries return 0 rows if broken |
| **G4: MapReduce validity** | No dangling refs in output JSON | Parent atlas indexing incomplete if invalid |
| **G5: Qdrant tagging** | `search(payload tag filter)` returns results | Retrieval degraded if missing tags |
| **G6: Neo4j cluster edges** | `MATCH (n)-[r:BELONGS_TO_CLUSTER]->() RETURN count(r)` ≥ 2900 | Graph authority scoring incomplete |

---

## File Size Constraints

**No files > 10MB committed:**
- Parent atlas JSON: split into chunks if necessary
  - `parent-atlas-[a-z].json.gz` (compressed, ~2MB each)
  - `MANIFEST.md` (index, <1KB)
- MapReduce output: stream to database, not file
- GPU analysis: save to PostgreSQL parent_atlas.analysis_json, not disk

---

## Dependencies & Prerequisites

| Tool | Version | Status |
|------|---------|--------|
| PostgreSQL | 18.1 | Pending upgrade |
| pgvector | 0.7.x | Verify compatibility |
| Drizzle-ORM | 0.45.0+ | npm install pending |
| Node.js | 20.x | Current: 20.11.0 ✅ |
| Python | 3.10+ (GPU) | Check locally |
| PyTorch | 2.2.x (CUDA 12.1) | Already installed ✅ |
| Qdrant | 0.12.x | Current ✅ |
| Neo4j | 5.x | Current ✅ |
| CouchDB | 3.x | Current ✅ |

---

## Success Criteria

- [x] Gemma4 function-calling committed (Phase 99 complete)
- [ ] All 3000 files consolidated into /src/lib/features/{8 domains}
- [ ] PostgreSQL 18 running, pgvector verified, UUID standardized
- [ ] MapReduce pipeline produces valid consolidated JSON (3000+ docs)
- [ ] Parent atlas tables populated, queryable via SQL
- [ ] Qdrant collections tagged by feature, KMeans k=20 clusters created
- [ ] Neo4j BELONGS_TO_CLUSTER edges present (2900+ edges)
- [ ] Feature gap report generated (50+ recommendations appended to docs)
- [ ] Zero breaking changes to existing routes/APIs
- [ ] All changes committed to main, tagged for Phase 101

---

## Timeline

| Week | Phase | ETA |
|------|-------|-----|
| 1 | 100.1 (file consolidation) + 100.2 (PG 18 + UUID) | 10h |
| 2 | 100.3 (MapReduce) + 100.4 (schema) | 15h |
| 3 | 100.5 (clustering) + 100.6 (docs) | 12h |
| **Total** | **Phase 100 complete** | **~37h** |

Next phase (Phase 101): Implement all 50+ feature recommendations, finalize GPU analysis pipeline.

---

## References

- CLAUDE.md § Drizzle Safety Rule, UUID Schema Mismatch
- docs/master_agents.md (65 gates, feature atlas)
- memory/architecture-reference.md (DB tiers, UUID patterns)
- scripts/atlas/unified-codebase-ingester.mjs (parent atlas foundation)
- CouchDB & MapReduce inspiration: Apache Spark SQL joins pattern
