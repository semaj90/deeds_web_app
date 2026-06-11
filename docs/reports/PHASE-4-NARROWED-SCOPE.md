# Phase 4 — Narrowed Scope: Observability, Governance, Measurement

**Date**: 2026-06-11  
**Status**: ACTIVE  
**Authority**: Frozen Phase 3 architecture (PASS 66/0/0)

---

## One-Sentence Summary

You have finished the storage, topology, and retrieval architecture. The highest-leverage work now is observability, governance, and measurement so you can prove retrieval quality, automate lifecycle decisions, and keep Parent Atlas healthy as it grows.

---

## Phase 4A — Retrieval Telemetry

**Goal**: Measure retrieval quality instead of adding more retrieval.

### What to Build

`atlas_retrieval_telemetry` table:

| Column | Type | Purpose |
|--------|------|---------|
| `query_id` | uuid | Request identifier |
| `timestamp` | timestamptz | Query execution time |
| `query` | text | Search query (2000 char max) |
| `vector_hits` | int | Qdrant HNSW results returned |
| `fts_hits` | int | Full-text search results |
| `trigram_hits` | int | pg_trgm trigram results |
| `fusion_score` | real | Blended ranking score (0.0-1.0) |
| `latency_ms` | int | Wall-clock query time |
| `selected_packets` | jsonb | Ranked result set `[{packet_key, score, rank}]` |
| `feature_ids` | uuid[] | Feature IDs in result |
| `som_clusters` | text[] | SOM cluster IDs |

### Where to Wire

1. `src/lib/server/ace/context-assembler.ts` — after packet ranking, before response
2. `src/lib/server/search/hybrid-search.ts` — record vector/fts/trigram hit counts
3. `src/lib/server/rag-pipeline.ts` — record fusion_score and latency_ms
4. `/api/ai/agent` — record tool invocation signals

**Pattern** (fire-and-forget, non-blocking):

```typescript
await recordRetrievalTelemetry({
  queryId: context.requestId,
  query: userQuery,
  vectorHits: qdrantResults.length,
  ftsHits: pgResults.length,
  trigramHits: trigramResults.length,
  fusionScore: finalScore,
  latencyMs: Date.now() - startTime,
  selectedPackets: topK.map(p => ({
    packetKey: p.key,
    score: p.rankScore,
    rank: topK.indexOf(p)
  })),
  featureIds: topK.map(p => p.featureId),
  somClusters: topK.map(p => p.somCluster),
});
```

### Success Criteria

- ✅ >1,000 queries captured within first week
- ✅ 95th percentile latency measured
- ✅ Top-k lane contribution breakdown (vector vs fts vs trigram)
- ✅ Fusion win rate calculated (% of queries where fusion beats single-lane)
- ✅ Cache hit ratio tracked (for Phase 4B)

### Output Reports

**`docs/reports/retrieval-telemetry-summary.json`**:
```json
{
  "period": "last_7_days",
  "queries": 1247,
  "latency": {
    "p50_ms": 124,
    "p95_ms": 847,
    "p99_ms": 2341,
    "mean_ms": 189
  },
  "lane_contribution": {
    "vector_only": 0.18,
    "fts_only": 0.08,
    "trigram_only": 0.02,
    "fusion_2lane": 0.15,
    "fusion_3lane": 0.57
  },
  "fusion_win_rate": 0.74,
  "cache_hit_ratio": null,
  "top_packets_queried": [
    {"key": "...", "hit_count": 42, "avg_rank": 2.1}
  ]
}
```

**`docs/reports/retrieval-quality-report.md`**:
```markdown
# Retrieval Quality Report — Week 1 (June 11–18, 2026)

## Executive Summary
- **Queries**: 1,247
- **Mean Latency**: 189ms (baseline)
- **P95 Latency**: 847ms
- **Fusion Effectiveness**: 74% of queries use all three lanes
- **Cache Hit Ratio**: TBD (pending implementation)

## Latency Breakdown
- Vector-only: 145ms (18% of queries)
- FTS-only: 92ms (8% of queries)
- Fusion: 201ms (74% of queries) — 40% slower but 25% higher recall

## Lane Contribution
- Vector (semantic): 57% of top results
- FTS (keyword): 18% of top results
- Trigram (fuzzy): 8% of top results
- Blended: 17% of top results

## Top Issues
- 3 queries with P99 latency (2341ms) — investigate topology-heavy neighborhoods
- 12 queries with low fusion_score (<0.3) — verify som_cluster derivation
```

---

## Phase 4B — Temperature-Driven Cache Policy

**Goal**: Use packet temperature classification to automate caching decisions.

### What You Have

From Phase 3C:
- **HOT**: 9,484 packets (accessed last 7 days, feature_count > 5)
- **WARM**: 427 packets (accessed 7–30 days ago)
- **COLD**: 0 packets (no 30+ day stale packets currently)

### Policy to Implement

| Temperature | Retrieval Lane | Storage | TTL | Eviction |
|-------------|----------------|---------|----|----------|
| **HOT** | Priority (top-k) | Redis + Qdrant | 30 days | LRU |
| **WARM** | Secondary (tail-k) | Qdrant only | 90 days | Manual |
| **COLD** | Archived (offline) | SeaweedFS manifest | 365 days | Explicit |

### What to Build

**`cache_policy` table**:

| Column | Type | Purpose |
|--------|------|---------|
| `packet_key` | text | Packet identifier |
| `temperature` | enum | HOT / WARM / COLD |
| `redis_cached` | bool | In Redis hot cache? |
| `last_accessed` | timestamptz | Last query timestamp |
| `access_frequency` | int | Queries last 7 days |
| `policy_tier` | enum | Priority / Secondary / Archived |
| `ttl_days` | int | Retention window |

### Implementation

1. **Ingest Phase 3C temperature data** into `cache_policy`
2. **Wire into ACE ranking**: if `temperature='HOT'`, boost packet rank by 1.2×
3. **Eviction logic**: background job removes `temperature='WARM'` packets after 90 days
4. **Archive logic**: move `temperature='COLD'` to SeaweedFS manifest (none currently, prepare path)

### Success Criteria

- ✅ 9,484 HOT packets in Redis with <5ms access latency
- ✅ 427 WARM packets eviction scheduled at 90-day boundary
- ✅ Archive path ready for future COLD packets
- ✅ Cache policy explicitly documented

### Deliverables

**`docs/reports/cache-policy-report.json`**:
```json
{
  "date": "2026-06-11",
  "temperature_distribution": {
    "hot": 9484,
    "warm": 427,
    "cold": 0
  },
  "redis_status": {
    "cached_packets": 9484,
    "memory_footprint_mb": 2341,
    "avg_access_latency_ms": 4.2
  },
  "policy_enforcement": {
    "hot_ttl_days": 30,
    "warm_ttl_days": 90,
    "cold_archive_ready": true,
    "eviction_schedule": "daily at 02:00 UTC"
  }
}
```

**`docs/reports/packet-lifecycle-policy.md`**:
```markdown
# Packet Lifecycle & Cache Policy

## Temperature-Driven Tiers

### HOT (9,484 packets)
- **Definition**: Accessed in last 7 days; feature_count > 5
- **Storage**: Redis (in-memory) + Qdrant (disk-backed)
- **TTL**: 30 days
- **Access Pattern**: Expected sub-10ms retrieval
- **Eviction**: LRU when Redis exceeds 2GB threshold
- **Cost**: High (Redis memory)

### WARM (427 packets)
- **Definition**: Accessed 7–30 days ago
- **Storage**: Qdrant only (no Redis cache)
- **TTL**: 90 days
- **Access Pattern**: Expected <200ms retrieval (disk-backed Qdrant)
- **Eviction**: Automatic at 90-day boundary
- **Cost**: Medium (Qdrant disk)

### COLD (0 packets currently)
- **Definition**: Accessed 30+ days ago
- **Storage**: SeaweedFS manifest + CouchDB snapshot
- **TTL**: 365 days
- **Access Pattern**: Expected multi-second retrieval (requires manifest fetch)
- **Eviction**: Manual review before 365-day expiry
- **Cost**: Low (object storage)

## Lifecycle Workflow

```
New Packet (ingest) → HOT (7 days)
                        ↓ (no queries)
                      WARM (90 days)
                        ↓ (no queries)
                      COLD (365 days)
                        ↓ (expiry)
                      DELETE or ARCHIVE
```
```

---

## Phase 4C — Feature Quality Governance

**Goal**: Audit feature_id lifecycle; identify dead, duplicate, and oversized features.

### What to Build

**`atlas_feature_quality` analysis**:

| Column | Type | Purpose |
|--------|------|---------|
| `feature_id` | uuid | Feature identifier |
| `feature_label` | text | Human-readable label |
| `packet_count` | int | Packets in this feature |
| `retrieval_frequency` | int | Queries last 7 days |
| `orphan_rate` | real | % of packets with no packets in last 90 days |
| `quality_tier` | enum | HEALTHY / AT_RISK / DEAD |

### Analysis Queries

**Dead Features** (0 queries, 0 packets):
```sql
SELECT feature_id, feature_label, packet_count
FROM atlas_feature_quality
WHERE retrieval_frequency = 0 AND packet_count = 0
ORDER BY feature_id;
```

**Oversized Features** (>500 packets):
```sql
SELECT feature_id, feature_label, packet_count, retrieval_frequency
FROM atlas_feature_quality
WHERE packet_count > 500
ORDER BY packet_count DESC;
```

**Underused Features** (<5 queries/week):
```sql
SELECT feature_id, feature_label, packet_count, retrieval_frequency
FROM atlas_feature_quality
WHERE retrieval_frequency < 5 AND packet_count > 0
ORDER BY retrieval_frequency ASC;
```

### Success Criteria

- ✅ Feature quality metrics calculated
- ✅ Dead features identified
- ✅ Oversized features ranked by packet count
- ✅ Underused features ranked by query frequency
- ✅ Recommendations generated for archival/decomposition

### Deliverable

**`docs/reports/feature-quality-audit.json`**:
```json
{
  "date": "2026-06-11",
  "total_features": 4209,
  "quality_summary": {
    "healthy": 3847,
    "at_risk": 287,
    "dead": 75
  },
  "dead_candidates": [
    {"feature_id": "...", "label": "...", "reason": "0 queries, 0 packets"}
  ],
  "oversized_candidates": [
    {"feature_id": "...", "label": "...", "packet_count": 2341, "queries": 847}
  ],
  "underused_candidates": [
    {"feature_id": "...", "label": "...", "packet_count": 23, "queries": 1}
  ],
  "recommendations": [
    "Archive 75 dead features",
    "Decompose 12 oversized features (>1000 packets)",
    "Review 287 at-risk features for consolidation"
  ]
}
```

---

## Phase 4D — Retrieval Evaluation Harness

**Goal**: Run repeatable retrieval benchmarks to catch regressions.

### Benchmark Suite

**B1: Feature Lookup**
- Query: find feature_id by name (e.g., "auth_middleware")
- Metric: latency, recall (% of matches found)

**B2: Source Ref Lookup**
- Query: find all packets for source_ref (e.g., "src/lib/server/auth.ts")
- Metric: latency, completeness (% of expected packets)

**B3: Directory Lookup**
- Query: list all features in directory (e.g., "src/lib/server/")
- Metric: latency, coverage (% of directory features)

**B4: Multi-hop Lookup**
- Query: traverse directory → feature → som_cluster → related features
- Metric: latency, chain integrity (% of valid hops)

**B5: Packet Reconstruction**
- Query: given som_cluster, reconstruct original packet
- Metric: latency, fidelity (% of fields recoverable)

### Success Criteria

- ✅ All 5 benchmarks runnable on command
- ✅ Baseline metrics established
- ✅ Weekly automated run (Monday 02:00 UTC)
- ✅ Regression alerts on 10%+ slowdown or accuracy drop
- ✅ Trend analysis over 4-week period

### Deliverable

**`docs/reports/retrieval-benchmarks.json`** (timestamped):
```json
{
  "date": "2026-06-11",
  "benchmarks": {
    "feature_lookup": {
      "latency_ms": 45,
      "recall": 0.98,
      "tests": 100
    },
    "source_ref_lookup": {
      "latency_ms": 187,
      "completeness": 0.99,
      "tests": 50
    },
    "directory_lookup": {
      "latency_ms": 234,
      "coverage": 1.0,
      "tests": 50
    },
    "multi_hop_lookup": {
      "latency_ms": 512,
      "chain_integrity": 0.97,
      "tests": 25
    },
    "packet_reconstruction": {
      "latency_ms": 89,
      "fidelity": 0.99,
      "tests": 100
    }
  },
  "trend": {
    "vs_previous_week": "stable",
    "vs_baseline": "stable"
  },
  "alerts": []
}
```

---

## Implementation Order

1. **Phase 4A** (1-2 weeks) — Wire telemetry; establish baseline metrics
2. **Phase 4B** (1 week) — Implement cache policy; verify Redis eviction logic
3. **Phase 4C** (1 week) — Audit feature quality; generate recommendations
4. **Phase 4D** (1 week) — Build evaluation harness; run first benchmarks

**Total**: 4 weeks to full observability + governance stack

---

## Updated Kanban

```
DONE
✓ Phase 3A Retrieval Foundation (Dense + Lexical + Structural)
✓ Phase 3B Retrieval Integration (Fusion validated, 40% improvement)
✓ Phase 3C Directory Topology & Cold Storage (10,951 mappings, identity spine complete)

ACTIVE
→ Phase 4A Retrieval Telemetry (measure quality, establish baselines)

READY
→ Phase 4B Temperature-Driven Caching (automate HOT/WARM/COLD policy)
→ Phase 4C Feature Quality Governance (audit lifecycle, identify dead/oversized)
→ Phase 4D Retrieval Evaluation Harness (repeatable benchmarks, regression detection)
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

## One-Sentence Summary

Phase 4 transforms Parent Atlas from a built system to a measured, governed, continuously improving platform.
