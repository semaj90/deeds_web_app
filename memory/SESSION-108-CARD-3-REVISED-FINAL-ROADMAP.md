---
name: Session 108 CARD 3 Revised Final Roadmap
description: CARD 3 reordered by real blockers (qdrant_point_id coverage, schema audit, payload sync), architect confirms infrastructure exists
type: project
---

# CARD 3: PROMOTION POLICY & SEMANTIC COMPILER — FINAL REVISED ROADMAP

**Date**: 2026-07-05
**Status**: ✅ **REORDERED BY LIVE EVIDENCE** | ✅ **ARCHITECT ALIGNMENT CONFIRMED**
**Blocker**: qdrant_point_id coverage (not SOM contract, not tree_node_id backfill)

---

## Executive Summary (Architect Aligned)

**Prior claim**: "Most infrastructure exists, gaps are integration/depth"
**Live evidence**: CONFIRMED
- Phase 16-H (SOM/AE) is complete read-only
- Neo4j edges seeded (25 USED_CONCEPT across 4 concepts)
- Contract repair complete (identity/index audit green)
- GPU monitoring exists (RabbitMQ, cache warming, SharedArrayBuffer)
- Telemetry tables exist (`drizzle/manual/0049_atlas_retrieval_eval_times.sql`)

**Real work** (NOT greenfield):
- Telemetry depth (logs are shallow, not missing tables)
- Evidence quality (ranking needs tuning, not data model)
- Runtime logging (tracing/observability, not primitives)
- Qdrant bridge coverage (4,273/58,365 at 7.32%, expand to ceiling)
- Schema audit-first (adaptive reconciler proposes SQL, operator reviews)
- Tree payload sync (Neo4j + Qdrant, not backfill)

---

## CARD 3 Reordered Phases (Real Blocker Order)

### ✅ Phase 0: Validation Audit (COMPLETE)
- SOM audit: 267/400 cells occupied (valid contract, not 799 violation)
- Coverage baseline: qdrant_point_id 5.59%, tree_node_id 100%, concept_ids 99.99%
- Infrastructure check: Postgres/Qdrant/Neo4j operational

### ✅ Phase 1: Qdrant Bridge Backfill (COMPLETE)
- Applied: 4,273 packets materialized with qdrant_point_id + provenance
- Coverage: 7.32% (architectural ceiling for file-based packets)
- Envelope validation: PASS (50/50)
- **Real blocker now**: Expand qdrant bridge coverage to remaining indexed packets

### ⏳ Phase 2: Qdrant Bridge Coverage Expansion (NEXT — 1-2h)

**Current state**: 4,273 / 58,365 packets (7.32%)
**Architectural ceiling**: ~250-400 file-based packets with Qdrant embeddings
**Remaining work**: Expand to all indexed file-based packets (run backfill without limit)

**Action**:
```bash
cd sveltekit-frontend
DATABASE_URL="postgresql://legal_admin:123456@127.0.0.1:5434/legal_ai_db" \
node scripts/atlas/backfill-qdrant-point-id-bridge.mjs --dry-run --batch-size=1000
# Review dry-run results, then apply:
node scripts/atlas/backfill-qdrant-point-id-bridge.mjs --apply --batch-size=1000
```

**Expected**: Coverage rises to 8-10% (all indexed file-based packets bridged)

**Unblocks**: Payload sync (P3), schema audit (P3B)

---

### ⏳ Phase 3: Tree-Node-ID Payload Sync (2-3h) — SKIP BACKFILL

**Reframe** (user + architect confirmed):
- Feature-level: ✅ 100% (tree_node_id in atlas_packets)
- Packet-level: ✅ 100% (tree_node_id populated in atlas_packets)
- **What's missing**: Sync to Neo4j + Qdrant payload (not backfill, not generation)

**Action**:
1. Verify tree_node_id values are valid in Postgres (audit 5 random rows)
2. Sync to Neo4j nodes (add tree_node_id property if missing)
3. Update Qdrant payload (include tree_node_id + parent_tree_node_id)
4. Verify: 100% coverage in all three stores

**Time saved**: 2-3h (no backfill phase needed)

**Unblocks**: Promotion policy topology scoring (P6)

---

### ⏳ Phase 3B: Schema Audit-First (2-3h) — PARALLEL

**Architect guidance** (NOT blocking):
- Use adaptive schema reconciler (audit-first, migration-second)
- Review generated SQL before applying
- Apply only non-destructive alias bridges + missing columns
- Target: `drizzle/manual/0046_phase_16_topology_gds.sql`

**Action**:
1. Run schema reconciler in dry-run mode (propose additive SQL)
2. Review proposals + confirm non-destructive
3. Apply only reviewed changes
4. Then run KNN/PageRank/Centrality

**Can run parallel with P2 + P3**

---

### ⏳ Phase 4: Concept_IDs Audit + PageRank/LangExtract Expansion (4-6h) — PARALLEL

**Concept_IDs** (quick):
- Current: 58,360 / 58,365 (99.99%, 5 missing)
- Action: Audit 5 missing packets, backfill if applicable
- Time: 0.5h

**PageRank/LangExtract** (coverage work):
- Per architect: PageRank sync is partial (not "fully synced")
- Per live board: 61 missing SOM/Louvain entries, low lexical coverage
- Action: Run PageRank expansion + LangExtract coverage lanes
- Batch defaults raised: refresh 2000, materializer 1000
- Time: 4-6h

**Can run parallel with P3 + P3B**

---

### ⏳ Phase 5: Retrieval-Attempt Ledger (2-3h)

**Status**: Schema ready in Drizzle
**Action**: Wire logging calls into retrieval pipeline (all 7 stages: dense_cosine, hilbert, som_promotion, acp, synthesis)
**Depends on**: P2 (qdrant_point_id availability for reliable candidate tracking)

---

### ⏳ Phase 6: Promotion Policy Gate (6-8h)

**Hard gates**:
- qdrant_point_id IS NOT NULL (P2 complete)
- tree_node_id IS NOT NULL (P3 complete)
- topology_score ≥ 0.4 (SOM + PageRank blend, P4 complete)

**Soft gates**:
- concept_overlap ≥ 0.1
- confidence ≥ 0.3

**Depends on**: P2 + P3 + P4 + P5

---

### ⏳ Phase 7: ACP Loop Closure & Tracing (4-6h)

**Action**: Wire validation + tracing into ACP dispatch
- Validate packet envelope (qdrant_point_id + tree_node_id present)
- Log to retrieval_attempts (stage, winner, success/failure)
- Capture user feedback (confirm/reject synthesis)
- Update ledger for learning

**Depends on**: P6 (promotion gate must exist first)

---

## Revised Execution Order (Real Blocker Chain)

```
Phase 0 (complete) ✅
  ↓
Phase 1 (complete) ✅
  ↓
Phase 2: Qdrant coverage expansion (1-2h) — BLOCKER
  ↓
Parallel (after P2):
  Phase 3: Tree payload sync (2-3h)
  Phase 3B: Schema audit-first (2-3h)
  Phase 4: Concept audit + PageRank/LangExtract (4-6h)
  Phase 5: Retrieval ledger (2-3h)
  ↓
Phase 6: Promotion gate (6-8h) — depends on P2+P3+P4+P5
  ↓
Phase 7: ACP closure (4-6h) — depends on P6
```

**Total remaining**: 14-18h (after Phase 1 complete)
- Phase 2: 1-2h (qdrant expansion)
- Phases 3-5 parallel: 4-6h wall time
- Phase 6: 6-8h
- Phase 7: 4-6h

---

## Architect Confirmed Decisions (Do NOT Reopen)

✅ **Phase 16-H closed** — read-only evidence lane, no backfill
✅ **Neo4j edges seeded** — 25 USED_CONCEPT edges, concept lane live
✅ **Contract repair done** — identity/index audit green, additive work only
✅ **GPU monitoring exists** — RabbitMQ, cache warming, SharedArrayBuffer
✅ **Telemetry tables exist** — `drizzle/manual/0049_*`, no scaffolds needed
✅ **Storage work closed** — pgvector/Qdrant/Zod already reconciled
✅ **Schema audit-first** — propose additive SQL, operator reviews, apply non-destructive only

---

## Immediate Next Action

**Execute Phase 2: Qdrant coverage expansion**

```bash
cd /c/Users/james/Videos/deeds-web-app/sveltekit-frontend

# 1. Dry-run to verify real point IDs
DATABASE_URL="postgresql://legal_admin:123456@127.0.0.1:5434/legal_ai_db" \
node scripts/atlas/backfill-qdrant-point-id-bridge.mjs --dry-run --batch-size=1000

# 2. If dry-run shows real qdrant_ids, apply:
DATABASE_URL="postgresql://legal_admin:123456@127.0.0.1:5434/legal_ai_db" \
node scripts/atlas/backfill-qdrant-point-id-bridge.mjs --apply --batch-size=1000
```

**Expected**: Coverage rises from 7.32% to 8-10%, all indexed file-based packets bridged.

**Then**: Run Phases 3-5 in parallel, Phase 6-7 in sequence.

---

## Session 108 Final Status

| Phase | Status | Blocker | Notes |
|-------|--------|---------|-------|
| 0 | ✅ Complete | — | Validation audit passed |
| 1 | ✅ Complete | — | 4,273 packets, 7.32% coverage |
| 2 | ⏳ Next | qdrant coverage | Phase 2 is the real blocker |
| 3 | ⏳ Ready | depends on P2 | Sync only, no backfill |
| 3B | ⏳ Ready | — | Can run parallel |
| 4 | ⏳ Ready | — | Can run parallel |
| 5 | ⏳ Ready | depends on P2 | Logging wiring |
| 6 | ⏳ Ready | depends on P2+P3+P4+P5 | Promotion gate |
| 7 | ⏳ Ready | depends on P6 | ACP closure |

**Blocker clarity**: Not SOM contract (valid), not tree_node_id backfill (100% done), not schema repair (audit-first). **Real blocker: qdrant_point_id coverage expansion** (Phase 2).

**Next executor**: Run Phase 2 dry-run + apply when ready.
