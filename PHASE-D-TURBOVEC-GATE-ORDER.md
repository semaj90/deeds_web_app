# Phase D: TurboVec-First Gate Order (CORRECTED)

**Status**: Ready to Execute  
**Date**: June 14, 2026 (Revised)  
**Ship Gate**: TurboVec-first whole-codebase retrieval spine (no tree-node ingestion as main lane)

---

## Phase D = 7 Gates (No Embedding in Phase D)

Tree nodes are Phase E enrichment. Phase D ships when **Postgres → TurboVec → Qdrant → Redis path is verified**.

### Gate 1: Scope Audit (5 min)
```bash
npm run atlas:scope:whole
```
**Pass Criterion**: Whole repo scope audited; generated/vendor/binary excluded or metadata-only

### Gate 2: Packets Dry-Run (10 min)
```bash
npm run atlas:packets:whole:dry
```
**Pass Criterion**: **REVIEW THE REPORT** — packet_key derivations, feature_id assignments correct

### Gate 3: Packets Apply (15 min)
```bash
npm run atlas:packets:whole:apply
```
**Pass Criterion**: atlas_packets table updated from repo root

### Gate 4: TurboVec Export (5 min)
```bash
npm run atlas:turbovec:export
```
**Pass Criterion**: `.opencode/ndjson/turbovec-corpus.jsonl` created (10–50MB for 2000+ packets)

### Gate 5: TurboVec Smoke (2 min)
```bash
npm run atlas:turbovec:smoke
```
**Pass Criterion**: Sidecar responds with packet_key/source_ref/score

### Gate 6: Qdrant Sync Dry (10 min)
```bash
npm run atlas:qdrant:whole-sync:dry
```
**Pass Criterion**: Canonical payload fields present
- packet_key ✅
- source_ref ✅
- feature_id ✅
- feature_label ✅
- packet_universe ✅
- domain_class ✅
- community_id ✅
- tags ✅

### Gate 7: E2E Retrieval Audit (5 min)
```bash
npm run atlas:retrieval:e2e
```
**Pass Criterion**: Postgres → TurboVec → Qdrant → Redis path verified

---

## Phase D Ships When All 7 Gates Pass ✅

```
✓ whole repo scope audited
✓ generated/vendor/binary excluded or metadata-only
✓ atlas_packets updated from repo root
✓ TurboVec corpus exported
✓ TurboVec sidecar responds with packet_key/source_ref/score
✓ Qdrant mirror dry-run shows canonical payload fields
✓ Retrieval e2e shows Postgres → TurboVec → Qdrant → Redis path
```

---

## What's NOT in Phase D (Deferred to Phase E)

### ❌ Schema Migrations (Ready, Not Applied)
- `drizzle/manual/0028_packet_metadata_raw_sql_indexes.sql` — ready
- `drizzle/manual/0029_parent_atlas_complete_schema.sql` — ready
- **Why deferred**: Apply after TurboVec baseline passes (Phase D ship gate)

### ❌ Tree-Node Ingestion (Phase E Enrichment)
- `atlas_tree_nodes` table (in 0029 schema)
- `atlas_tree_edges` table (in 0029 schema)
- Tree extraction scripts
- **Why deferred**: Tree nodes are v2 context topology, not Phase D retrieval spine

### ❌ Glyph Extraction (Phase E Enrichment)
- `atlas_glyph_records` table (in 0029 schema)
- SVG/UTF-8 glyph lane
- Glyph coordinate computation
- **Why deferred**: Enrichment layer, not Phase D core

### ❌ Embedding (Phase E After Baseline)
- `scripts/atlas/embed-parent-atlas-to-qdrant.py`
- Ollama integration
- Qdrant payload indexes
- Batch upserts
- Coverage reports
- **Why deferred**: Embed after TurboVec baseline is verified (Phase D gates 1–7 pass)

---

## Phase D Command (Quick Start)

```bash
npm run atlas:scope:whole && \
npm run atlas:packets:whole:dry && \
npm run atlas:packets:whole:apply && \
npm run atlas:turbovec:export && \
npm run atlas:turbovec:smoke && \
npm run atlas:qdrant:whole-sync:dry && \
npm run atlas:retrieval:e2e
```

**Expected output**: All 7 gates pass, full retrieval path operational (~1 hour total)

---

## Phase E (After Phase D Ships)

### E1: Schema Migrations (Apply 0028 + 0029)
```bash
docker exec legal-ai-postgres psql -U legal_admin -d legal_ai_db < drizzle/manual/0028_packet_metadata_raw_sql_indexes.sql
docker exec legal-ai-postgres psql -U legal_admin -d legal_ai_db < drizzle/manual/0029_parent_atlas_complete_schema.sql
```

### E2: Embedding (Whole-Codebase)
```bash
python scripts/atlas/embed-parent-atlas-to-qdrant.py
```

### E3: Neo4j Topology Edges
Wire SIMILAR_TOPOLOGY edges from SOM adjacency

### E4: Gemma4 Summarization
Layer summaries (chunk/file/folder/feature/system)

### E5: Karpathy Authority Caching
Redis `gpu:karpathy:scores` from PageRank + attention

### E6: MCP Tool Surface
6 read + 4 write tools for ACE/KAG

---

## Why This Gate Order?

**TurboVec-first = retrieval baseline before enrichment**

1. Get whole-codebase packets indexed (atlas_packets)
2. Export corpus (TurboVec-ready JSONL)
3. Verify TurboVec sidecar is responsive
4. Mirror packets to Qdrant (dry-run only, no embeddings yet)
5. Verify E2E retrieval path (Postgres → TurboVec → Qdrant → Redis)
6. **SHIP PHASE D** ✅
7. Then enrich with embeddings, tree nodes, glyphs (Phase E)

**Rationale**: Phase D proves retrieval works WITHOUT embedding. Phase E adds semantic richness on top of a working retrieval baseline.

---

## Authority & Lock

**Locked by**: User explicit instruction (June 14, 2026)  
**Previous scope**: 7-phase with embedding  
**Corrected scope**: 7-gate TurboVec-first (no embedding in Phase D)  
**Status**: PRODUCTION READY

---

**Run the 7 gates in order. Phase D ships when gate 7 passes.**
