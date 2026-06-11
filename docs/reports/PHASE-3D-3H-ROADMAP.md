# Phase 3 Completion Roadmap: 3D → 3H

**Decision Date**: 2026-06-11  
**Principle**: Telemetry before policy  
**Authority**: Evidence-driven architecture

---

## Why This Order

See: [PHASE-3-LIFECYCLE-ORDERING.md](PHASE-3-LIFECYCLE-ORDERING.md)

**TL;DR**: Structural temperature (Phase 3C) is a model. Behavioral temperature (Phase 3D) is reality. All downstream phases depend on evidence from Phase 3D.

---

## Phase 3D: Retrieval Telemetry (ACTIVE NOW)

**Spec**: [PHASE-3D-RETRIEVAL-TELEMETRY.md](PHASE-3D-RETRIEVAL-TELEMETRY.md)

**Goal**: Capture behavioral telemetry to convert structural temperature (guess) into evidence

**Deliverables**:
1. `retrieval_telemetry` table (postgres)
   - Schema: query, query_hash, latency_ms, vector_hits, trigram_hits, fts_hits, selected_packet_key, selected_feature_id, fusion_score, cache_hit, surface, environment
2. Instrumentation in ACE context assembler + hybrid-search + rag-pipeline
3. Runtime context correlation via `detectSurface()`
4. Reports: `retrieval-telemetry-summary.json` + `.md`

**Success**:
- >1,000 queries captured
- Behavioral HOT/WARM/COLD identified (retrieved >5 / 1-5 / 0 times in 7 days)
- Orphan retrievals visible
- Surface breakdown (vscode vs opencode vs ci)

**Timeline**: 1-2 weeks

**Blockers**: None (independent)

**Outputs Used By**: 3E, 3F, 3G, 3H

---

## Phase 3E: Retrieval Evaluation Harness

**Status**: Ready (after 3D)

**Goal**: Establish ground-truth quality metrics (precision, recall, latency, fusion effectiveness)

**Deliverables**:
1. `scripts/atlas/run-retrieval-evals.mjs` with 5 test suites:
   - feature_lookup (find feature by name)
   - source_ref_lookup (find packets by source_ref)
   - directory_lookup (list features in directory)
   - packet_reconstruction (reconstruct packet from som_cluster)
   - multi_hop_lookup (traverse feature → som_cluster → related)
2. `docs/reports/retrieval-evals-baseline.json` (precision, recall, latency per test)

**Success**:
- All 5 tests passing
- Baseline metrics locked
- Metrics aligned with telemetry data from 3D

**Timeline**: 1 week (after 3D)

**Dependencies**: Phase 3D telemetry (to validate test results against real usage)

**Outputs Used By**: 3F, 3G

---

## Phase 3F: Feature Governance Audit

**Status**: Ready (after 3E)

**Goal**: Audit feature_id lifecycle using telemetry signals (behavioral, not structural)

**Deliverables**:
1. `atlas_feature_quality` analysis:
   - feature_id → {retrieval_count, orphan_rate, quality_tier}
   - Data source: retrieval_telemetry (3D), NOT packet_count
2. Find: dead features (0 retrievals in 30 days), oversized (>1000 retrievals/week), underused (<5 retrievals/week)
3. `docs/reports/feature-quality-audit.json` (archival + decomposition recommendations)

**Query Example** (data-driven):
```sql
SELECT feature_id, COUNT(*) as retrieval_count
FROM retrieval_telemetry
WHERE selected_feature_id IS NOT NULL
  AND created_at > NOW() - INTERVAL '7 days'
GROUP BY feature_id
ORDER BY retrieval_count DESC;
```

**Success**:
- Quality audit complete
- Dead features identified (0 retrievals)
- Candidates for archival marked
- Decomposition plan ready

**Timeline**: 1 week (after 3E)

**Dependencies**: Phase 3D telemetry, Phase 3E eval results

**Outputs Used By**: 3G, 3H

---

## Phase 3G: Temperature-Driven Cache Policy

**Status**: Ready (after 3F)

**Goal**: Automate HOT/WARM/COLD tiers using behavioral evidence (not structural guesses)

**Redefine Temperature** (from Phase 3C):

| Tier | Old Logic (Struct) | New Logic (Behavioral) |
|------|-------------------|------------------------|
| HOT | Packet in freq directory | Retrieved >5 times in 7 days |
| WARM | Packet in occasional directory | Retrieved 1-5 times in 7 days |
| COLD | Packet in rare directory | Retrieved 0 times in 30 days |

**Deliverables**:
1. Update temperature model: query retrieval_telemetry for actual counts
2. Implement eviction:
   - HOT → Redis+Qdrant / 30-day TTL / LRU eviction
   - WARM → Qdrant only / 90-day TTL / auto-eviction
   - COLD → SeaweedFS manifest / 365-day TTL / manual review
3. `docs/reports/cache-policy-report.json` (behavioral temperature distribution)

**Query** (new temperature model):
```sql
WITH retrieval_counts AS (
  SELECT selected_feature_id,
         COUNT(*) as retrieval_count
  FROM retrieval_telemetry
  WHERE created_at > NOW() - INTERVAL '7 days'
  GROUP BY selected_feature_id
)
SELECT feature_id,
       CASE
         WHEN retrieval_count > 5 THEN 'HOT'
         WHEN retrieval_count BETWEEN 1 AND 5 THEN 'WARM'
         ELSE 'COLD'
       END as behavioral_temperature
FROM retrieval_counts;
```

**Success**:
- Temperature model driven by telemetry (not structure)
- HOT packets in Redis <5ms latency
- WARM packets eviction scheduled
- COLD archive path ready

**Timeline**: 1 week (after 3F)

**Dependencies**: Phase 3D telemetry, Phase 3F feature audit

**Outputs Used By**: 3H

---

## Phase 3H: Automated SeaweedFS Promotion

**Status**: Ready (after 3G)

**Goal**: Automate cold storage archival for genuinely unused packets

**Deliverables**:
1. Background job: detect COLD packets (0 retrievals in 30 days from Phase 3D telemetry)
2. Archive to SeaweedFS with manifest
3. Track archived packets for reconstruction
4. `docs/reports/seaweedfs-promotions.json` (archive events, cost savings)

**Query** (identify COLD candidates):
```sql
SELECT DISTINCT selected_packet_key
FROM retrieval_telemetry
WHERE selected_packet_key IS NOT NULL
  AND created_at > NOW() - INTERVAL '30 days'
UNION
SELECT packet_key FROM atlas_feature_map
  WHERE packet_key NOT IN (
    SELECT DISTINCT selected_packet_key FROM retrieval_telemetry
    WHERE created_at > NOW() - INTERVAL '30 days'
  );
```

**Success**:
- COLD packets automatically archived
- Manifests tracked for reconstruction
- Archive events logged

**Timeline**: 1 week (after 3G)

**Dependencies**: Phase 3D telemetry, Phase 3G cache policy

**No Further Dependencies**: 3H is terminal (end of Phase 3)

---

## Complete Timeline

```
Week 1–2:  Phase 3D (Retrieval Telemetry)
           → Wire instrumentation
           → Collect 1,000+ queries
           → Identify behavioral temperature

Week 3:    Phase 3E (Eval Harness) [parallel prep]
           → Implement 5 test suites
           → Run against telemetry data

Week 3–4:  Phase 3F (Feature Governance)
           → Audit 4,209 features
           → Identify dead/oversized/underused

Week 4–5:  Phase 3G (Cache Policy)
           → Redefine HOT/WARM/COLD from telemetry
           → Update Redis/Qdrant eviction

Week 5–6:  Phase 3H (SeaweedFS Automation)
           → Auto-archive COLD packets
           → Track manifests
           → Monitor cost savings

Week 6+:   Continuous observation
           → Telemetry flows continuously
           → Policy adjusts based on behavior
           → Lifecycle automation runs daily
```

---

## Outputs Summary

**After 3D**: Behavioral temperature visible  
**After 3E**: Quality metrics validated  
**After 3F**: Dead features identified  
**After 3G**: Cache policy evidence-based  
**After 3H**: Cold storage automated

---

## Key Documents

- [PHASE-3D-RETRIEVAL-TELEMETRY.md](PHASE-3D-RETRIEVAL-TELEMETRY.md) — Full 3D spec
- [PHASE-3-LIFECYCLE-ORDERING.md](PHASE-3-LIFECYCLE-ORDERING.md) — Why this order
- [parent-atlas-open-lanes-todo.md](../../../reports/parent-atlas-open-lanes-todo.md) — Kanban board

---

## One-Sentence Summary

Measure behavior before automating policy; all downstream decisions depend on telemetry evidence.
