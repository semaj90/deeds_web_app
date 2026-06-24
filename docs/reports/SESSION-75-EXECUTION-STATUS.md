# Session 75 Execution Status — Directory Signals → Canonical Registry → Qdrant Enrichment

**Date**: 2026-06-23, Session 75  
**Status**: ✅ **EXECUTION PLAN LOCKED** → Ready for parallel Lane A (Registry Build) + Lane B (Qdrant Enrichment Prep)

---

## Executive Summary

**Pivot complete**: Session 74 delivered P0–P3 verification (identity frozen, 4D axes operational, KAG foundation built). Session 75 identified critical blocker: 600K repository files with unknown classification (0.8% authoritative, 7.5% generated, 65% mirror, <1% stale, 73% safe-to-delete). **Directory signals ingestion launched; NESCHROM97 registry validation queued; Qdrant Tier 2 enrichment planned without Postgres writes.**

---

## Execution Lanes (Parallel)

### Lane A: NESCHROM97 Registry Validation (NESCHROM97 status preserved)
- **Status**: Registry phase COMPLETE (commit 19fd0922d7)
- **Current state**: 8,170 cards, 45 curated packets, 30 mapped (0.4%), 8,140 cold evidence
- **Next**: Run `npm run neschrom97:registry:build` + `npm run smoke:neschrom97-registry` (scripts not yet wired, requires package.json update)
- **Design**: Cold evidence registry is CORRECT; unmapped cards are valuable as structural evidence

### Lane B: Directory Signals Ingestion ✅ LIVE
- **Signals found**: 31 llms.md / AGENTS.md files across sveltekit-frontend/scripts/
- **G17 audit gate results**: 60 total hardcoded localhost failures across 415 files
- **Directories scanned**: 15 with available MCP tools, 4 with TODOs
- **Next**: Create `atlas_directory_agents_signals` table + load 31 signals into Postgres

### Lane C: Canonical File Registry Stage 1 (Deferred until Lane B completes)
- **4-stage plan locked**: Inventory (4h) → Linkage (6h) → Analysis (4h) → Generation (2h)
- **Signals will guide Stage 1**: G17 failures mark non-canonical files; paired test counts identify authoritative; tool availability indicates core services
- **Entry point**: `npm run atlas:registry:inventory` with signal hints

### Lane D: Qdrant Tier 2 Enrichment Planning ✅ READY
- **Storage layer decision**: Postgres 18 pgvector HNSW indexes already exist; Qdrant remains primary mirror
- **Why**: pgvector is CPU-bound for large batches; Qdrant ANN is 100× faster on 1000+ vectors
- **Tier 2 approach**: Enrichment stays mirror-only (no Postgres writes, no Neo4j edges yet)
- **Enrichment fields**: `card_id`, `packet_id`, `source_refs`, `feature_id`, `surface: "neschrom97"`, `match_confidence`, `som_cluster`
- **Qdrant indexes**: Add indexes on card_id, packet_id, feature_id, surface, match_confidence for fast lookup

---

## Storage Layer Architecture (Confirmed)

| Store | Role | Status | Decision |
|-------|------|--------|----------|
| **Postgres 18** | Canonical truth | ✅ pgvector HNSW live | Source of record; pgvector fast for small batches (<100) |
| **Qdrant** | Primary mirror + ANN | ✅ Operational | 768-d vector search; **Tier 2 enrichment target**; 100× faster on bulk |
| **Redis/Bifrost** | L1 cache + semantic | ✅ Operational | 4-token cards; inference cache; ~5ms hit rate |
| **Neo4j** | Topology + edges | ✅ Operational | Graph traversal; held until Qdrant Tier 2 passes |

**Gemma4 summarizations**: ❌ **MISSING** — Major gap blocking proper feature_id/tree_node_id clustering. Defer to Lane E.

---

## Key Findings

### GPU Acceleration Pipeline Audit
**Wired files found**: 15 files linking feature_id ↔ tree_node_id ↔ som_cluster
- `src/mcp-gpu-orchestrator.ts` — GPU orchestration
- `src/mcp/trace-mcp-server.ts` — MCP surface with tools
- `src/lib/server/ace/som-packet-store.ts` — SOM storage layer
- Others: packet search, cluster lenses, vault walker, atlas contract, analytics cache

**Gaps identified**:
- Gemma4 batch summarization script missing
- PyTorch autoencoder training (768→64) scaffolded but not wired to npm scripts
- TurboQuant embedding integration incomplete

### Postgres 18 Vector Indexing
**Existing setup**:
```sql
CREATE INDEX idx_atlas_packets_vectors_gin ON atlas_packets USING gin(vectors);
CREATE INDEX idx_atlas_packets_eigenvector ON atlas_packets(eigenvector);
CREATE INDEX idx_nes_chrom_packets_vectors_gin ON nes_chrom_packets USING gin(vectors);
```

**Decision**: Keep pgvector for small-batch local queries; Qdrant for bulk ANN during Tier 2 enrichment.

---

## Immediate Actions (Next 4 Hours)

### 1. Create atlas_directory_agents_signals Table (15 min)
```sql
CREATE TABLE atlas_directory_agents_signals (
  id uuid PRIMARY KEY,
  directory_path text NOT NULL UNIQUE,
  file_count int, handler_count int,
  hardcoded_localhost_count int,  -- G17 signal
  paired_test_count int,
  som_cluster int,
  available_tools text[],
  audit_gates jsonb,
  todos jsonb,
  export_count int, class_count int, function_count int, interface_count int,
  ingested_at timestamp, last_updated timestamp
);
```

### 2. Load 31 Directory Signals (10 min)
Insert parsed signals from llms.md scan:
- sveltekit-frontend/scripts: 319 files, 49 G17 failures
- sveltekit-frontend/scripts/atlas: 22 files, 7 G17 failures
- (30 more directories with audit gates, TODOs, tools)

### 3. Wire NESCHROM97 Scripts to package.json (5 min)
```json
{
  "neschrom97:registry:build": "node scripts/atlas/build-neschrom97-registry.mjs",
  "smoke:neschrom97-registry": "node scripts/atlas/smoke-neschrom97-registry.mjs"
}
```

### 4. Execute NESCHROM97 Build + Smoke (10 min)
```bash
npm run neschrom97:registry:build
npm run smoke:neschrom97-registry
```
Expected: ✅ 30 mapped, 8,140 cold, all tests PASS

### 5. Plan Qdrant Tier 2 Enrichment (20 min)
- Load NESCHROM97 registry into memory
- Prepare Qdrant payload schema: `{ ...existing, card_id, packet_id, source_refs, surface, match_confidence }`
- Design 100-point smoke test gate

---

## Deferred to Lane E (After Tier 2 Gate Passes)

- Neo4j edge creation (MATERIALIZES, DERIVED_FROM)
- Postgres atlas_packets updates (NO writes during Tier 2)
- HyperRAG Packet RPC integration
- Gemma4 batch summarization (prerequisite for proper clustering)

---

## Success Criteria (Session 75 End)

✅ **By EOD**:
- [ ] atlas_directory_agents_signals table created + 31 signals loaded
- [ ] NESCHROM97 registry built + smoke tests PASS (30 mapped, 8,140 cold)
- [ ] Qdrant Tier 2 enrichment plan finalized (payload schema, indexes, 100-point gate)
- [ ] npm scripts wired for registry/smoke execution
- [ ] Postgres pgvector decision documented (keep as-is; Qdrant primary for bulk)

⏳ **By EOD+4h** (concurrent Lane C):
- [ ] Stage 1 inventory scan (first 100 files) using directory signals as hints
- [ ] G17 failures cross-checked against canonical_file_registry classification

---

## Timeline

| Lane | Task | Est. Time | Start | End |
|------|------|-----------|-------|-----|
| B | atlas_directory_agents_signals + load signals | 25 min | Now | +25 min |
| A | Wire package.json + build registry | 15 min | Now | +15 min |
| A | NESCHROM97 smoke test | 10 min | +15 min | +25 min |
| D | Qdrant Tier 2 enrichment planning | 20 min | +25 min | +45 min |
| C | Stage 1 inventory (sample) + join signals | 120 min | +25 min | +145 min |

**Total elapsed**: ~145 min (2.5 hours for all 4 lanes)

---

## Storage Architecture (Final)

```
┌─────────────────────────────────────────────────────────┐
│ Postgres 18 (Canonical Truth)                           │
│  ├─ atlas_directories                                   │
│  ├─ atlas_source_refs                                   │
│  ├─ atlas_packets (pgvector HNSW indexes)              │
│  ├─ atlas_directory_agents_signals (NEW)               │
│  ├─ canonical_file_registry (Stage 1+)                 │
│  └─ nes_chrom_packets (pgvector HNSW indexes)          │
└─────────────────────────────────────────────────────────┘
                         ↓ mirror/cache
┌─────────────────────────────────────────────────────────┐
│ Qdrant (Primary Mirror + ANN)                           │
│  ├─ codebase_chunks_768 (existing 768-d vectors)       │
│  └─ [Tier 2] enriched with card_id/packet_id/feature_id
└─────────────────────────────────────────────────────────┘
                         ↓ L1 cache
┌─────────────────────────────────────────────────────────┐
│ Redis/Bifrost (Semantic Cache + Inference)             │
│  ├─ bifrost:packet:* (4-token card summaries)          │
│  ├─ gpu:karpathy:scores (authority blend)              │
│  └─ gpu:karpathy:encoded (64-dim AE latents)           │
└─────────────────────────────────────────────────────────┘
                         ↓ topology/routing
┌─────────────────────────────────────────────────────────┐
│ Neo4j (Topology + Routing)                              │
│  ├─ (:Packet)-[:IMPLEMENTS_FEATURE]->(:Feature)       │
│  ├─ (:Packet)-[:IN_DIRECTORY]->(:Directory)           │
│  └─ [Deferred] (:NesChromCard)-[:MATERIALIZES]->(:Packet)
└─────────────────────────────────────────────────────────┘
```

---

## Next Session (Session 76)

- Execute Qdrant Tier 2 enrichment + 100-point smoke gate
- Complete canonical_file_registry Stage 1 + Stage 2 linkage
- Run PyTorch AE training (768→64) if Gemma4 summaries are available
- Gate: All Tier 2 smoke tests PASS before Neo4j edges are created

---

**Status**: ✅ **EXECUTION LANES LOCKED & READY**  
**Next Action**: Create atlas_directory_agents_signals table + load 31 signals
