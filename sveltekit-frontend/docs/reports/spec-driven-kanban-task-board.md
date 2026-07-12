# Spec-Driven Kanban Task Board

**Date**: July 4, 2026 | **Status**: Ready for execution | **Format**: [JSON manifest](spec-driven-kanban-task-board.json)

---

## TL;DR

**Current Slice**: Phase 8.6 — Identity & Topology Bridges  
**Tasks**: 8 (concrete, bounded, executable)  
**Strategy**: Dry-run first, bounded batches, Postgres canonical  
**Duration**: ~5.2 hours  
**Unblocks**: Phase 8.7 (Neo4j GDS / topology math) + Phase 9 (Benchmark)

---

## Execution Model

| Aspect | Rule |
|--------|------|
| **Strategy** | Bounded batches only (default 5000 packets) |
| **Validation** | Dry-run first, inspect output, then apply |
| **Canonical Store** | Postgres (atlas_packets is truth) |
| **Derived Layers** | Arrow transport, mmap registry, ACP routing, Qdrant mirror |
| **Resumability** | Each task is independent; restart any failed task |

---

## Wired This Slice

1. **Semantic topK rerank storage**
   - Persist per-query candidate sets and rerank evidence into `atlas_packet_metrics.semantic_topk_*`
   - Keep canonical identity in Postgres and keep derived topK state separate from `atlas_packets`
   - Use `chunk_hit_log.rerank_breakdown` / search analytics as the per-query evidence sink and `atlas_packet_metrics` as the durable per-feature projection

## Current Confirmed Gaps

Summary embedding is now complete for the canonical summary classes. The remaining work is bridge propagation and topology/materialization:

1. **Qdrant point ID bridge**
   - Materialize `packet_key -> qdrant_point_id` deterministically from `codebase_chunk_index`
   - Validate duplicates and orphans before updating `atlas_packets`

2. **Concrete source-ref propagation**
   - Resolve `source_ref`, `file_path`, `directory_path`, and `source_ref_key` from canonical joins
   - Reject synthetic or ambiguous provenance

3. **Tree-node propagation audit**
   - Verify `tree_node_id` on the owning packet/envelope tables before writing any fan-out lanes
   - Keep summary-layer propagation only as a mirror path

4. **Concept coverage backfill**
   - Populate `used_concepts` in the feature-envelope lane, not as a direct identity field
   - Use LangExtract plus lexical fallback in bounded batches

5. **SOM 20x20 contract repair**
   - Normalize row/col values and re-run topology validation
   - Require deterministic occupancy and repeatable mapping

6. **Arrow batch import**
   - Add resumable batch import to the existing export lane
   - Keep Arrow as batch transport only

7. **mmap hot registry writer**
   - Serialize only validated packets into MsgPack
   - Persist offset / length / checksum in Postgres

8. **ACP routing fan-out**
   - Route HMM-classified failures into repair actions
   - Keep execution, scoring, and evidence separate

---

## Current Slice: Phase 8.6 Tasks (Priority Order)

### 1️⃣ Qdrant Point ID Bridge (15 min)
Materialize `qdrant_point_id` for all addressable packets. Bridge from `codebase_chunk_index.relative_path` / canonical source joins to Postgres `atlas_packets.qdrant_point_id`.

**Acceptance**: `SELECT COUNT(DISTINCT qdrant_point_id) FROM atlas_packets` returns 54,650  
**Dry-run**: `npm run atlas:qdrant-point-id:bridge --dry-run`  
**Apply**: `npm run atlas:qdrant-point-id:bridge --apply`

---

### 2️⃣ Tree Node ID Propagation Audit (20 min)
Propagate `tree_node_id` through the owning packet/envelope path and validate the mirror tables separately. Preserve the canonical identity chain before Neo4j fan-out.

**Acceptance**: `SELECT COUNT(*) FROM atlas_feature_envelopes WHERE tree_node_id IS NOT NULL` returns 58,365  
**Dry-run**: `npm run atlas:envelope:propagate-tree-node --dry-run`  
**Apply**: `npm run atlas:envelope:propagate-tree-node --apply`

---

### 3️⃣ Concrete Source-Ref Propagation (20 min)
Backfill `source_ref`, `file_path`, `directory_path`, and `source_ref_key` from canonical joins. Reject synthetic or ambiguous provenance.

**Acceptance**: `source_ref`, `file_path`, and `source_ref_key` are populated deterministically for the canonical packet set  
**Dry-run**: `npm run atlas:envelope:propagate-source-ref --dry-run`  
**Apply**: `npm run atlas:envelope:propagate-source-ref --apply`

---

### 4️⃣ Concept Coverage Backfill (30 min)
Populate `used_concepts` in the feature-envelope lane with LangExtract plus lexical fallback. Keep it separate from canonical identity.

**Acceptance**: `used_concepts` reaches the target coverage threshold with no identity drift  
**Dry-run**: `npm run atlas:concepts:backfill --dry-run`  
**Apply**: `npm run atlas:concepts:backfill --apply`

---

### 5️⃣ SOM 20x20 Contract Repair (45 min)
Normalize `som_row` / `som_col` values to the 20x20 contract and re-run topology validation. Fix contract drift before more clustering.

**Acceptance**: SOM occupancy and coordinate bounds pass the 20x20 validation gate  
**Dry-run**: `npm run atlas:som:20x20:validate --dry-run`  
**Apply**: `npm run atlas:som:20x20:repair --apply`

---

### 6️⃣ Arrow Batch Import (45 min)
Add the resumable import companion to the Arrow export lane. Keep Arrow batch-only and validate round-trip fidelity.

**Acceptance**: Arrow import/export round-trips a bounded sample with zero divergence  
**Dry-run**: `npm run atlas:arrow:batch:import --dry-run`  
**Apply**: `npm run atlas:arrow:batch:import --apply`

---

### 7️⃣ mmap Hot Registry Writer (60 min)
Serialize only validated packets into MsgPack and persist mmap offset / length / checksum in Postgres. Do not admit rejected packets into the hot registry.

**Acceptance**: Validated packets produce deterministic mmap offsets and checksum-backed registry rows  
**Dry-run**: `npm run atlas:mmap:registry:build --dry-run`  
**Apply**: `npm run atlas:mmap:registry:build --apply`

### 8️⃣ ACP Routing Fan-Out (90 min)
Wire ACP (Agent Control Plane) routing for keyword/query/error fan-out. Keep the HMM router separate from execution and scoring.

**Acceptance**: HMM classifications produce deterministic repair actions and stable traces across repeated runs  
**Dry-run**: `npm run acp:routing:validate --verbose --dry-run`  
**Apply**: `npm run acp:routing:wire --apply`

---

## Validation Gates (Must Pass)

| Gate | Check | Expected | Rationale |
|------|-------|----------|-----------|
| **G1** | `SELECT COUNT(DISTINCT qdrant_point_id) FROM atlas_packets WHERE qdrant_point_id IS NOT NULL` | 54,650 | All points have stable IDs |
| **G2** | `SELECT packet_key, qdrant_point_id, tree_node_id, title_id FROM atlas_feature_envelopes LIMIT 1` | All four populated | Identity chain preserved |
| **G3** | `npm run atlas:arrow:batch:validate` | 100/100 round-trip, sha256 match | Transport fidelity |
| **G4** | `npm run benchmark:l0-latency -- --iterations 1000` | p99 < 2ms | 0-latency requirement |
| **G5** | `npm run acp:routing:stability-test -- --runs 3` | 3 runs identical | Deterministic clustering |
| **G6** | `grep -r '@mock\|stubbed' sveltekit-frontend/src/lib/server/acp/` | 0 hits | No stubs in live paths |

---

## Risk Assessment

### 🔴 High Risk
- **Arrow Batch Transport**: Serialization format divergence  
  - *Mitigation*: Deterministic schema validation, sha256 tests
- **mmap Registry Payloads**: File corruption or out-of-sync with Postgres  
  - *Mitigation*: Version stamp, rebuild on startup, Redis fallback

### 🟡 Medium Risk
- **ACP Routing Fan-Out**: Routing divergence between keyword/query/error paths  
  - *Mitigation*: Unified router contract, audit trail

### 🟢 Low Risk
- **Tree/Title ID Propagation**: NULL propagation in envelopes  
  - *Mitigation*: Constraint checks, backfill
- **Stub Cleanup**: Accidental removal of legitimate test code  
  - *Mitigation*: Grep audit, manual review

---

## Success Criteria

- **Phase 8.6 Complete** when:
  - ✅ All 8 tasks PASS
  - ✅ All 6 validation gates GREEN
  - ✅ Total duration: ~5.2 hours

**Unblocks**:
- Phase 8.7 (Neo4j GDS suite: PageRank, CheiRank, Louvain, K-core)
- Phase 9 (Retrieval benchmark: precision@10, latency breakdown)

---

## How to Use This Board

1. **Reference the JSON manifest** for machine-readable task definitions, automation, and CI/CD integration
2. **Execute one task at a time** in priority order
3. **Dry-run first** before apply
4. **Monitor validation gates** after each task
5. **Pause if any gate fails** — diagnose before continuing

---

## Related Documentation

- [Canonical Packet Envelope System](../architecture/CANONICAL-PACKET-ENVELOPE-SYSTEM.md)
- [Agentic Error-Fixing Architecture](../architecture/AGENTIC-ERROR-FIXING-ARCHITECTURE.md)
- [Phase 8-9 Completion Plan](../architecture/phase-101-completion-plan.md)
- [Session 104 Final Operational](../../memory/SESSION-104-PHASE-8-FINAL-OPERATIONAL.md)

---

**Status**: Read-only, evidence-backed. Regenerated by kanban refresh script at end of each task completion.
