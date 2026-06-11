# Phase 4A — Retrieval Telemetry & Quality

**Date**: 2026-06-11  
**Status**: ACTIVE  
**Authority**: Parent Atlas Kanban (production readiness PASS 66/0/0)

---

## Strategic Shift

**Phase 3 (Closed)**: Building infrastructure
- Multi-lane retrieval (Dense + Lexical + Structural)
- Directory topology spine
- Cold storage manifests
- Provenance chains

**Phase 4 (Active)**: Measuring and improving
- Retrieval telemetry (query signals)
- Quality audits (feature utilization)
- Memory governance (lifecycle policy)
- Evaluation benchmarks (repeatability)

**One-line summary**: You are no longer building Parent Atlas. You are now observing, measuring, and continuously improving it.

---

## Phase 4A Scope

### 1. Retrieval Telemetry Table

**Purpose**: Capture query-level signals for quality measurement and caching policy optimization.

**Schema** (`atlas_retrieval_telemetry`):

| Column | Type | Purpose |
|--------|------|---------|
| `id` | uuid | Primary key |
| `query_id` | uuid | ACE context request ID (foreign key to tracking table) |
| `query_text` | text | Search query (truncated to 2000 chars) |
| `timestamp` | timestamptz | Query execution time |
| `feature_ids` | uuid[] | Feature IDs in result set |
| `som_clusters` | text[] | SOM cluster identifiers for packets |
| `selected_packets` | jsonb | Ranked packet list: `[{packet_key, score, reason}]` |
| `vector_hits` | int | Qdrant HNSW results returned |
| `fts_hits` | int | Full-text search results |
| `trigram_hits` | int | pg_trgm trigram results |
| `fusion_score` | real | Blended ranking score (0.0-1.0) |
| `latency_ms` | int | Wall-clock query time |
| `user_id` | integer | User context (nullable, may be anonymous) |
| `case_id` | uuid | Case context (nullable) |
| `pipeline_version` | text | ACE_PIPELINE_VERSION snapshot |
| `confidence_rank` | char(1) | A/B/C/D confidence tier of top result |
| `notes` | text | Optional diagnostic notes |
| `created_at` | timestamptz | Record insertion time |

**Indexes**:
- `(timestamp DESC)` — for time-range queries
- `(feature_id)` — for feature utilization analysis
- `(fusion_score DESC)` — for quality distribution reports
- `(latency_ms DESC)` — for latency outlier detection
- `(user_id, timestamp DESC)` — for per-user quality audit

### 2. Instrumentation Points

**Where to Wire**:
1. `src/lib/server/ace/context-assembler.ts` — after final packet ranking, before response
2. `src/lib/server/search/hybrid-search.ts` — record vector/fts/trigram hit counts
3. `src/lib/server/rag-pipeline.ts` — record fusion_score and latency_ms
4. `/api/ai/agent` — record tool_call signals and agent decision points
5. `/api/cartridge/search` — record cartridge tensor similarity results

**Fire-and-Forget Pattern** (non-blocking):

```typescript
// After ranking completes
recordRetrievalTelemetry({
  queryId: context.requestId,
  queryText: query,
  featureIds: selectedPackets.map(p => p.featureId),
  somClusters: selectedPackets.map(p => p.somCluster),
  selectedPackets: selectedPackets.map(p => ({
    packetKey: p.key,
    score: p.rankScore,
    reason: p.rankReason // 'vector_sim' | 'fts_match' | 'structural' | 'fusion'
  })),
  vectorHits: qdrantResults.length,
  ftsHits: pgResults.length,
  trigramHits: trigramResults.length,
  fusionScore: finalScore,
  latencyMs: Date.now() - startTime,
  userId: locals.user?.id,
  caseId: caseContext?.id,
  confidenceRank: topResult.confidence // 'A' | 'B' | 'C' | 'D'
});
```

### 3. Telemetry Reporting

**Report 1: `docs/reports/retrieval-telemetry-summary.json`**

```json
{
  "timestamp": "2026-06-11T14:30:00Z",
  "period": "last_7_days",
  "query_count": 2847,
  "metrics": {
    "latency": {
      "p50_ms": 124,
      "p95_ms": 847,
      "p99_ms": 2341,
      "mean_ms": 189
    },
    "fusion_effectiveness": {
      "fusion_score_mean": 0.742,
      "fusion_score_stddev": 0.156,
      "queries_with_fusion": 2341,
      "fusion_vs_vector_latency_ratio": 1.08
    },
    "hit_distribution": {
      "vector_hits_mean": 47.3,
      "fts_hits_mean": 12.1,
      "trigram_hits_mean": 8.2
    },
    "confidence_distribution": {
      "A_direct": 0.68,
      "B_derived": 0.21,
      "C_sibling": 0.08,
      "D_unresolved": 0.03
    },
    "feature_coverage": {
      "unique_features_queried": 3420,
      "mean_features_per_query": 5.2,
      "max_features_per_query": 89
    }
  },
  "outliers": {
    "slow_queries_p99": [
      {
        "query": "...",
        "latency_ms": 2341,
        "feature_count": 45,
        "reason": "topology_heavy_neighborhood"
      }
    ],
    "low_score_queries": [
      {
        "query": "...",
        "fusion_score": 0.24,
        "vector_hits": 0,
        "fts_hits": 2,
        "confidence": "D"
      }
    ]
  },
  "recommendations": [
    "Vector index drift detected (p99 latency +23% vs baseline) — reindex HNSW",
    "12 queries with confidence D — verify som_cluster derivation rules",
    "Feature X underrepresented in retrieval — check packet_temperature distribution"
  ]
}
```

**Report 2: `docs/reports/retrieval-quality-report.md`**

```markdown
# Retrieval Quality Report
## Period: Last 7 Days (2847 queries)

### Executive Summary
- **Mean Latency**: 189ms (target: <200ms)
- **Fusion Effectiveness**: 74.2% of queries use all three lanes
- **Confidence Distribution**: 68% direct (A), 21% derived (B), 8% sibling (C), 3% unresolved (D)

### Latency Analysis
- P50: 124ms (within budget)
- P95: 847ms (2 high outliers in topology-heavy neighborhoods)
- P99: 2341ms (one query with 45 features — investigate)

### Fusion Lane Effectiveness
- **Vector-only**: 18% of queries (precision good, recall limited)
- **Lexical-only**: 8% of queries (high precision, low recall)
- **Fusion (all three)**: 74% of queries (best recall + precision balance)
- **Latency comparison**: Fusion adds ~8% vs vector-only (acceptable cost for 25% recall gain)

### Feature Quality Signals
- **Top 10 queried features**: [list with frequency]
- **Underused features** (<5 queries/week): [10 candidates for archival]
- **Overloaded features** (>500 packets): [5 candidates for decomposition]

### Confidence Tier Breakdown
- **A (Direct)**: 1,923 queries — Qdrant som_cluster direct match
- **B (Derived)**: 597 queries — som_cluster inferred from lexical results
- **C (Sibling)**: 228 queries — som_cluster from sibling directory
- **D (Unresolved)**: 99 queries — no som_cluster available (gaps in coverage)

### Next Actions
1. **Investigate P99 outliers**: Rerun queries with explain plans
2. **Close confidence D gaps**: Extend som_cluster derivation rules
3. **Temperature-driven caching**: Use telemetry to refine HOT/WARM/COLD boundaries
4. **Fusion tuning**: Adjust blend weights based on per-feature effectiveness
```

### 4. Implementation Steps

**Step 1** — Create migration:
```sql
CREATE TABLE atlas_retrieval_telemetry (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  query_id uuid NOT NULL,
  query_text text NOT NULL,
  timestamp timestamptz DEFAULT now() NOT NULL,
  feature_ids uuid[] NOT NULL DEFAULT '{}',
  som_clusters text[] NOT NULL DEFAULT '{}',
  selected_packets jsonb NOT NULL DEFAULT '[]',
  vector_hits int NOT NULL DEFAULT 0,
  fts_hits int NOT NULL DEFAULT 0,
  trigram_hits int NOT NULL DEFAULT 0,
  fusion_score real NOT NULL DEFAULT 0.0,
  latency_ms int NOT NULL DEFAULT 0,
  user_id integer,
  case_id uuid,
  pipeline_version text NOT NULL DEFAULT 'ACE_3.0',
  confidence_rank char(1),
  notes text,
  created_at timestamptz DEFAULT now() NOT NULL
);

CREATE INDEX idx_retrieval_telemetry_timestamp ON atlas_retrieval_telemetry(timestamp DESC);
CREATE INDEX idx_retrieval_telemetry_feature_id ON atlas_retrieval_telemetry USING GIN(feature_ids);
CREATE INDEX idx_retrieval_telemetry_fusion_score ON atlas_retrieval_telemetry(fusion_score DESC);
CREATE INDEX idx_retrieval_telemetry_latency ON atlas_retrieval_telemetry(latency_ms DESC);
CREATE INDEX idx_retrieval_telemetry_user_time ON atlas_retrieval_telemetry(user_id, timestamp DESC);
```

**Step 2** — Drizzle schema:
```typescript
export const atlasRetrievalTelemetry = pgTable('atlas_retrieval_telemetry', {
  id: uuid('id').primaryKey().defaultRandom(),
  queryId: uuid('query_id').notNull(),
  queryText: text('query_text').notNull(),
  timestamp: timestamp('timestamp', { withTimezone: true }).notNull().defaultNow(),
  featureIds: uuid('feature_ids').array().notNull().default(sql`'{}'`),
  somClusters: text('som_clusters').array().notNull().default(sql`'{}'`),
  selectedPackets: jsonb('selected_packets').notNull().default(sql`'[]'`),
  vectorHits: integer('vector_hits').notNull().default(0),
  ftsHits: integer('fts_hits').notNull().default(0),
  trigramHits: integer('trigram_hits').notNull().default(0),
  fusionScore: real('fusion_score').notNull().default(0),
  latencyMs: integer('latency_ms').notNull().default(0),
  userId: integer('user_id'),
  caseId: uuid('case_id'),
  pipelineVersion: text('pipeline_version').notNull().default('ACE_3.0'),
  confidenceRank: char('confidence_rank', { length: 1 }),
  notes: text('notes'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});
```

**Step 3** — Instrumentation helper:
```typescript
// src/lib/server/telemetry/retrieval-recorder.ts
export async function recordRetrievalTelemetry(signal: {
  queryId: string;
  queryText: string;
  featureIds: string[];
  somClusters: string[];
  selectedPackets: Array<{ packetKey: string; score: number; reason: string }>;
  vectorHits: number;
  ftsHits: number;
  trigramHits: number;
  fusionScore: number;
  latencyMs: number;
  userId?: number;
  caseId?: string;
  confidenceRank?: 'A' | 'B' | 'C' | 'D';
  notes?: string;
}): Promise<void> {
  // Fire-and-forget: use job queue if available, else direct INSERT
  try {
    await db.insert(atlasRetrievalTelemetry).values({
      queryId: signal.queryId,
      queryText: signal.queryText.slice(0, 2000),
      featureIds: signal.featureIds,
      somClusters: signal.somClusters,
      selectedPackets: signal.selectedPackets,
      vectorHits: signal.vectorHits,
      ftsHits: signal.ftsHits,
      trigramHits: signal.trigramHits,
      fusionScore: signal.fusionScore,
      latencyMs: signal.latencyMs,
      userId: signal.userId,
      caseId: signal.caseId,
      confidenceRank: signal.confidenceRank,
      notes: signal.notes,
    }).run();
  } catch (err) {
    // Log but do not throw — telemetry should not block queries
    console.error('[Telemetry] Failed to record signal:', err);
  }
}
```

**Step 4** — Reporting scripts:
```bash
npm run atlas:phase4a:telemetry-summary   # Generate JSON report
npm run atlas:phase4a:quality-report       # Generate markdown report
npm run atlas:phase4a:feature-audit        # Cross-check with Phase 4B
```

---

## Success Criteria

| Criterion | Target |
|-----------|--------|
| Telemetry table wired and recording | ✅ Queries flowing, latency <1ms overhead |
| First 7-day report generated | ✅ >1,000 queries captured |
| Confidence distribution measured | ✅ A/B/C/D breakdown available |
| P50/P95/P99 latency baseline established | ✅ <200ms / <1s / <3s respectively |
| Fusion effectiveness quantified | ✅ Measured recall gain vs latency cost |
| Feature utilization visible | ✅ Per-feature query frequency tracked |

---

## Next Phase

**Phase 4B — Feature Quality Audit** (Ready, queued)

Takes telemetry signals from Phase 4A and audits feature_id lifecycle:
- Which features are queried frequently?
- Which are dead/orphaned?
- Which are overloaded and should be split?
- Which are underused and could be archived?

**Consumes**: `atlas_retrieval_telemetry` (query signals)  
**Produces**: `docs/reports/feature-quality-audit.json`

---

## Architecture Note

Phase 4A shifts Parent Atlas from **infrastructure work** (Phase 3) to **observability work** (Phase 4). The identity spine is complete. The retrieval stack is operational. The directory topology is mapped. Now we measure quality, identify optimization opportunities, and establish baselines for continuous improvement.

This is the gateway to Phase 4B, 4C, and 4D — which collectively form the feedback loop that makes Parent Atlas self-improving.
