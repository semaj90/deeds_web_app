# Spec-Driven Kanban Task Board

**Date**: July 4, 2026 | **Status**: Ready for execution | **Format**: [JSON manifest](spec-driven-kanban-task-board.json)

---

## TL;DR

**Current Slice**: Phase 8.5 — Materialization & Transport  
**Tasks**: 7 (concrete, bounded, executable)  
**Strategy**: Dry-run first, bounded batches, Postgres canonical  
**Duration**: ~4.7 hours  
**Unblocks**: Phase 8.6 (Neo4j GDS) + Phase 9 (Benchmark)

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

## Current Slice: Phase 8.5 Tasks (Priority Order)

### 1️⃣ Qdrant Point ID Bridge (15 min)
Materialize `qdrant_point_id` for all 54,650 points. Bridge from Qdrant's native scroll (using `next_page_offset`) to Postgres `atlas_packets.qdrant_point_id`.

**Acceptance**: `SELECT COUNT(DISTINCT qdrant_point_id) FROM atlas_packets` returns 54,650  
**Dry-run**: `npm run atlas:qdrant-point-id:bridge --dry-run`  
**Apply**: `npm run atlas:qdrant-point-id:bridge --apply`

---

### 2️⃣ Tree Node ID Propagation (20 min)
Propagate `tree_node_id` from atlas_packets → feature envelopes → recommendation cards → Neo4j. Ensures Neo4j topology identity chain is preserved.

**Acceptance**: `SELECT COUNT(*) FROM atlas_feature_envelopes WHERE tree_node_id IS NOT NULL` returns 58,365  
**Dry-run**: `npm run atlas:envelope:propagate-tree-node --dry-run`  
**Apply**: `npm run atlas:envelope:propagate-tree-node --apply`

---

### 3️⃣ Title ID Propagation (20 min)
Propagate `title_id` through envelopes, cards, and ACE context. Ensures consistent feature grouping downstream.

**Acceptance**: All envelopes have title_id; distinct count matches identity layer  
**Dry-run**: `npm run atlas:envelope:propagate-title-id --dry-run`  
**Apply**: `npm run atlas:envelope:propagate-title-id --apply`

---

### 4️⃣ Arrow Batch Transport (45 min)
Wire Arrow columnar serialization for batch-only packet transport. Enables zero-copy mmap and GPU tensor hand-off. **Batch-only**: no streaming single packets.

**Acceptance**: 100 packets round-trip Postgres → Arrow → Postgres with zero divergence  
**Dry-run**: `npm run atlas:arrow:batch:export --batch-size 5000 --dry-run`  
**Apply**: `npm run atlas:arrow:batch:export --batch-size 5000 --apply`

---

### 5️⃣ mmap Registry Payloads (60 min)
Wire memory-mapped registry for Parent Atlas 0-latency lookups. Enables L0 cache tier before Redis L1.

**Acceptance**: L0 latency < 1ms after warm-up, mmap hit rate > 95%  
**Dry-run**: `npm run atlas:mmap-registry:build --output /tmp/test-registry.mmap --dry-run`  
**Apply**: `npm run atlas:mmap-registry:build --output sveltekit-frontend/.cache/packet-registry.mmap --apply`

---

### 6️⃣ ACP Routing Fan-Out (90 min)
Wire ACP (Agent Control Plane) routing for keyword/query/error fan-out. Enables agentic error-fixing MapReduce clustering.

**Acceptance**: Keyword query routes < 5ms, error clustering is repeatable  
**Dry-run**: `npm run acp:routing:validate --verbose --dry-run`  
**Apply**: `npm run acp:routing:wire --apply`

---

### 7️⃣ Stub/Mock Cleanup (30 min)
Remove all @mock/@todo/@stubbed code from Phase 8 live paths. Ensure all code uses real services (Postgres, Qdrant, Redis).

**Acceptance**: `grep -r '@mock\|stubbed' sveltekit-frontend/src/lib/server/acp/` returns 0 hits  
**Audit**: `npm run audit:stubs:find -- sveltekit-frontend/src/lib/server/acp`  
**Cleanup**: `npm run audit:stubs:cleanup -- --apply`

---

## Validation Gates (Must Pass)

| Gate | Check | Expected | Rationale |
|------|-------|----------|-----------|
| **G1** | `SELECT COUNT(DISTINCT qdrant_point_id) FROM atlas_packets WHERE qdrant_point_id IS NOT NULL` | 54,650 | All points have stable IDs |
| **G2** | `SELECT packet_id, qdrant_point_id, tree_node_id, title_id FROM atlas_feature_envelopes LIMIT 1` | All four populated | Identity chain preserved |
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

**Phase 8.5 Complete** when:
- ✅ All 7 tasks PASS
- ✅ All 6 validation gates GREEN
- ✅ Total duration: ~4.7 hours

**Unblocks**:
- Phase 8.6 (Neo4j GDS suite: PageRank, CheiRank, Louvain, K-core)
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
