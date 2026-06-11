# Phase 4 Documentation Index

**Status**: ACTIVE  
**Decision Date**: 2026-06-11  
**Authority**: Phase 3 FROZEN (PASS 66/0/0), Phase 4 NARROWED SCOPE

---

## Core Documents

| Document | Purpose | Audience |
|----------|---------|----------|
| [PHASE-3-FINAL-FREEZE.md](PHASE-3-FINAL-FREEZE.md) | Lock Phase 3 architecture; prevent scope creep | Architects, PMs |
| [PHASE-4-NARROWED-SCOPE.md](PHASE-4-NARROWED-SCOPE.md) | Define Phase 4A/B/C/D specifics; implementation roadmap | Engineers |
| [ATLAS-PHASE-3-TO-4-TRANSITION.md](ATLAS-PHASE-3-TO-4-TRANSITION.md) | Strategic context; why the shift; timeline | All stakeholders |

---

## Phase 4A: Retrieval Telemetry

**Goal**: Measure retrieval quality instead of adding more retrieval.

**Spec**: [PHASE-4-NARROWED-SCOPE.md#phase-4a](PHASE-4-NARROWED-SCOPE.md)

**Table Schema**:
```sql
atlas_retrieval_telemetry (
  query_id, query, timestamp,
  vector_hits, fts_hits, trigram_hits,
  fusion_score, latency_ms,
  selected_packets, feature_ids, som_clusters
)
```

**Instrumentation Points**:
- `src/lib/server/ace/context-assembler.ts` — after packet ranking
- `src/lib/server/search/hybrid-search.ts` — hit count recording
- `src/lib/server/rag-pipeline.ts` — latency + fusion_score
- `/api/ai/agent` — tool invocation signals

**Success Criteria**:
- ✅ >1,000 queries captured
- ✅ 95th percentile latency measured
- ✅ Top-k lane contribution breakdown (vector vs fts vs trigram)
- ✅ Fusion win rate calculated (% where fusion beats single-lane)
- ✅ Cache hit ratio tracked

**Output Reports**:
- `docs/reports/retrieval-telemetry-summary.json` — metrics snapshot
- `docs/reports/retrieval-quality-report.md` — analysis + recommendations

**Timeline**: 1-2 weeks

---

## Phase 4B: Temperature-Driven Cache Policy

**Goal**: Use packet temperature (HOT: 9,484 / WARM: 427 / COLD: 0) to automate caching.

**Spec**: [PHASE-4-NARROWED-SCOPE.md#phase-4b](PHASE-4-NARROWED-SCOPE.md)

**Policy**:
```
HOT  (9,484)  → Redis + Qdrant    / 30-day TTL
WARM (427)    → Qdrant only       / 90-day TTL
COLD (0)      → SeaweedFS manifest / 365-day TTL
```

**Table Schema**:
```sql
cache_policy (
  packet_key, temperature,
  redis_cached, last_accessed,
  access_frequency, policy_tier, ttl_days
)
```

**Implementation**:
1. Ingest Phase 3C temperature data
2. Wire into ACE ranking (boost HOT packets by 1.2×)
3. Implement WARM eviction at 90-day boundary
4. Prepare archive path for future COLD packets

**Success Criteria**:
- ✅ 9,484 HOT packets in Redis with <5ms access latency
- ✅ 427 WARM packets eviction scheduled at 90-day boundary
- ✅ Archive path ready for future COLD packets
- ✅ Cache policy explicitly documented

**Output Reports**:
- `docs/reports/cache-policy-report.json` — Redis footprint, eviction schedule
- `docs/reports/packet-lifecycle-policy.md` — lifecycle workflow, cost analysis

**Timeline**: 1 week (after 4A)

---

## Phase 4C: Feature Quality Governance

**Goal**: Audit feature_id lifecycle; identify dead/oversized/underused features.

**Spec**: [PHASE-4-NARROWED-SCOPE.md#phase-4c](PHASE-4-NARROWED-SCOPE.md)

**Analysis Table**:
```sql
atlas_feature_quality (
  feature_id, feature_label,
  packet_count, retrieval_frequency,
  orphan_rate, quality_tier
)
```

**Find**:
- Dead features: 0 queries, 0 packets
- Oversized features: >500 packets
- Underused features: <5 queries/week
- At-risk features: low retrieval_frequency, high packet_count

**Queries**:
```sql
-- Dead features
SELECT * FROM atlas_feature_quality
WHERE retrieval_frequency = 0 AND packet_count = 0;

-- Oversized
SELECT * FROM atlas_feature_quality
WHERE packet_count > 500
ORDER BY packet_count DESC;

-- Underused
SELECT * FROM atlas_feature_quality
WHERE retrieval_frequency < 5 AND packet_count > 0
ORDER BY retrieval_frequency ASC;
```

**Success Criteria**:
- ✅ Quality metrics calculated for all 4,209 features
- ✅ Dead features identified + marked for archival
- ✅ Oversized features ranked by packet count
- ✅ Underused features ranked by query frequency
- ✅ Decomposition recommendations generated

**Output Reports**:
- `docs/reports/feature-quality-audit.json` — full audit with recommendations

**Timeline**: 1 week (after 4B)

---

## Phase 4D: Retrieval Evaluation Harness

**Goal**: Repeatable benchmarks to catch regressions + measure continuous improvement.

**Spec**: [PHASE-4-NARROWED-SCOPE.md#phase-4d](PHASE-4-NARROWED-SCOPE.md)

**5 Benchmark Suites**:

**B1: Feature Lookup**
- Query: find feature_id by name (e.g., "auth_middleware")
- Metrics: latency, recall

**B2: Source Ref Lookup**
- Query: find all packets for source_ref (e.g., "src/lib/server/auth.ts")
- Metrics: latency, completeness

**B3: Directory Lookup**
- Query: list all features in directory (e.g., "src/lib/server/")
- Metrics: latency, coverage

**B4: Multi-hop Lookup**
- Query: traverse directory → feature → som_cluster → related features
- Metrics: latency, chain integrity

**B5: Packet Reconstruction**
- Query: given som_cluster, reconstruct original packet
- Metrics: latency, fidelity

**Success Criteria**:
- ✅ All 5 benchmarks runnable on command
- ✅ Baseline metrics established
- ✅ Weekly automated run (Monday 02:00 UTC)
- ✅ Regression alerts on 10%+ slowdown or accuracy drop
- ✅ Trend analysis over 4-week period

**Output Reports**:
- `docs/reports/retrieval-benchmarks.json` — timestamped results, trend analysis, regression alerts

**Timeline**: 1 week (after 4C)

---

## Implementation Order

```
Week 1:    Phase 4A (Retrieval Telemetry)
           → Wire capture, establish baselines

Week 2:    Phase 4A (continued) + Phase 4B (Cache Policy)
           → Hit 1,000+ queries, implement HOT/WARM/COLD

Week 3:    Phase 4B (continued) + Phase 4C (Feature Quality)
           → Validate policy under load, audit lifecycle

Week 4:    Phase 4C (continued) + Phase 4D (Evaluation Harness)
           → Archive dead features, build benchmarks

Week 5+:   Phase 4D (Regression Detection)
           → Weekly automated benchmarks, continuous improvement
```

---

## NPM Commands (Ready for Implementation)

**Phase 4A — Telemetry**:
```bash
npm run atlas:phase4a:telemetry-wire          # Wire instrumentation
npm run atlas:phase4a:telemetry-summary       # Generate JSON report
npm run atlas:phase4a:quality-report          # Generate markdown report
```

**Phase 4B — Cache Policy**:
```bash
npm run atlas:phase4b:cache-policy-ingest     # Load temperature data
npm run atlas:phase4b:cache-policy-report     # Generate JSON report
npm run atlas:phase4b:lifecycle-policy        # Generate markdown report
```

**Phase 4C — Feature Quality**:
```bash
npm run atlas:phase4c:feature-quality-audit   # Analyze all features
npm run atlas:phase4c:dead-features           # List candidates for archival
npm run atlas:phase4c:oversized-features      # List candidates for decomposition
npm run atlas:phase4c:underused-features      # List candidates for consolidation
```

**Phase 4D — Evaluation**:
```bash
npm run atlas:phase4d:run-benchmarks          # Run all 5 benchmarks
npm run atlas:phase4d:baseline                # Establish baseline metrics
npm run atlas:phase4d:regression-check        # Check for regressions
npm run atlas:phase4d:trend-report            # Generate weekly trend report
```

---

## Success Criteria for Phase 4 Completion

By end of Phase 4:

| Lane | Metric | Target | Status |
|------|--------|--------|--------|
| 4A | Queries captured | >5,000 | Pending |
| 4A | Baseline latency | <250ms p95 | Pending |
| 4A | Fusion win rate | >70% | Pending |
| 4B | Cache policy | Explicit TTL per tier | Pending |
| 4B | Redis eviction | Automated, tested | Pending |
| 4C | Dead features | Identified + archived | Pending |
| 4C | Oversized features | Decomposition plan | Pending |
| 4D | Benchmarks | Weekly automated | Pending |
| 4D | Regressions | Caught <1 week | Pending |

---

## Key Documents (Reference)

**Phase 3 (Frozen)**:
- [PHASE-3-FINAL-FREEZE.md](PHASE-3-FINAL-FREEZE.md) — Architecture lock, baseline metrics

**Phase 4 (Active)**:
- [PHASE-4-NARROWED-SCOPE.md](PHASE-4-NARROWED-SCOPE.md) — Full specification, 4A/B/C/D details
- [ATLAS-PHASE-3-TO-4-TRANSITION.md](ATLAS-PHASE-3-TO-4-TRANSITION.md) — Strategic context, timeline

**Kanban**:
- [parent-atlas-open-lanes-todo.md](../../../reports/parent-atlas-open-lanes-todo.md) — Live board

---

## One-Sentence Summary

Phase 4 transforms Parent Atlas from a built system to a measured, governed, continuously improving platform.
