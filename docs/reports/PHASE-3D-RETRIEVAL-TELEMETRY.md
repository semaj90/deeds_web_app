# Phase 3D — Retrieval Telemetry & Lifecycle Management

**Date**: 2026-06-11  
**Status**: ACTIVE  
**Authority**: Frozen Phase 3A/B/C (PASS 66/0/0)

---

## Strategic Context

**Phase 3C gave us structural temperature**: packets marked HOT because they live in frequently-accessed directories.

**Phase 3D captures behavioral temperature**: packets proven HOT because users and agents retrieve them repeatedly.

**Why this matters**: You cannot automate caching policy, feature lifecycle decisions, or SeaweedFS archival until you know what users *actually* retrieve—not what the structure suggests they retrieve.

---

## Deliverable 1: Retrieval Telemetry Pipeline

### Create

**File**: `scripts/atlas/capture-retrieval-telemetry.mjs`

**Purpose**: Wire telemetry recording into the retrieval system (non-blocking, fire-and-forget)

### Database Schema

**Table**: `retrieval_telemetry`

```sql
CREATE TABLE retrieval_telemetry (
  id BIGSERIAL PRIMARY KEY,
  created_at timestamptz DEFAULT now(),
  query text NOT NULL,
  query_hash text NOT NULL,
  latency_ms integer NOT NULL,
  vector_hits integer NOT NULL DEFAULT 0,
  trigram_hits integer NOT NULL DEFAULT 0,
  fts_hits integer NOT NULL DEFAULT 0,
  selected_packet_key text,
  selected_feature_id text,
  fusion_score double precision,
  cache_hit boolean DEFAULT false,
  surface text NOT NULL,
  environment text NOT NULL
);

CREATE INDEX idx_retrieval_telemetry_created_at ON retrieval_telemetry(created_at DESC);
CREATE INDEX idx_retrieval_telemetry_query_hash ON retrieval_telemetry(query_hash);
CREATE INDEX idx_retrieval_telemetry_surface ON retrieval_telemetry(surface);
CREATE INDEX idx_retrieval_telemetry_environment ON retrieval_telemetry(environment);
CREATE INDEX idx_retrieval_telemetry_packet_key ON retrieval_telemetry(selected_packet_key);
CREATE INDEX idx_retrieval_telemetry_feature_id ON retrieval_telemetry(selected_feature_id);
```

**Column Rationale**:

| Column | Type | Why |
|--------|------|-----|
| `id` | BIGSERIAL | Auto-increment for ordering |
| `created_at` | timestamptz | When the query ran |
| `query` | text | Original search text (2000 char max) |
| `query_hash` | text | SHA-256 hash for deduplication |
| `latency_ms` | integer | Wall-clock retrieval time |
| `vector_hits` | integer | Qdrant HNSW results |
| `trigram_hits` | integer | pg_trgm results |
| `fts_hits` | integer | Full-text search results |
| `selected_packet_key` | text | Top result packet (if any) |
| `selected_feature_id` | text | Top result feature_id |
| `fusion_score` | double precision | Blended ranking score |
| `cache_hit` | boolean | Was this from Redis cache? |
| `surface` | text | "vscode" / "claudecode" / "opencode" / "codex" / "ci" |
| `environment` | text | "phase-3d-retrieval-telemetry" (for future analysis) |

### Instrumentation Points

**1. ACE Context Assembler** (`src/lib/server/ace/context-assembler.ts`):

```typescript
// After final packet ranking, before response
const telemetry = {
  query: userQuery,
  queryHash: sha256(userQuery),
  latencyMs: Date.now() - startTime,
  vectorHits: qdrantResults.length,
  trigramHits: trigramResults.length,
  ftsHits: ftSearchResults.length,
  selectedPacketKey: topResult?.packetKey || null,
  selectedFeatureId: topResult?.featureId || null,
  fusionScore: finalScore,
  cacheHit: wasCached,
  surface: detectSurface(), // (see Deliverable 2)
  environment: 'phase-3d-retrieval-telemetry'
};

recordRetrievalTelemetry(telemetry);
```

**2. Hybrid Search** (`src/lib/server/search/hybrid-search.ts`):

```typescript
// Record vector/trigram/fts hit counts
const results = await hybridSearch(query);
recordSearchHits({
  query,
  vectorHits: results.vector.length,
  trigramHits: results.trigram.length,
  ftsHits: results.fts.length
});
```

**3. RAG Pipeline** (`src/lib/server/rag-pipeline.ts`):

```typescript
// Record fusion_score and latency after ranking
const startMs = Date.now();
const rankedPackets = await rankPackets(candidates);
recordLatency({
  query,
  latencyMs: Date.now() - startMs,
  fusionScore: rankedPackets[0]?.score || 0
});
```

**Helper Function** (new file: `src/lib/server/telemetry/retrieval-recorder.ts`):

```typescript
import { db } from '$lib/server/db/client';
import { retrievalTelemetry } from '$lib/server/db/schema-postgres';
import crypto from 'node:crypto';

export async function recordRetrievalTelemetry(signal: {
  query: string;
  latencyMs: number;
  vectorHits: number;
  trigramHits: number;
  ftsHits: number;
  selectedPacketKey?: string;
  selectedFeatureId?: string;
  fusionScore?: number;
  cacheHit?: boolean;
  surface: string;
  environment: string;
}): Promise<void> {
  // Fire-and-forget: non-blocking, log errors but don't throw
  try {
    const queryHash = crypto
      .createHash('sha256')
      .update(signal.query)
      .digest('hex');

    await db.insert(retrievalTelemetry).values({
      query: signal.query.slice(0, 2000),
      queryHash,
      latencyMs: signal.latencyMs,
      vectorHits: signal.vectorHits,
      trigramHits: signal.trigramHits,
      ftsHits: signal.ftsHits,
      selectedPacketKey: signal.selectedPacketKey || null,
      selectedFeatureId: signal.selectedFeatureId || null,
      fusionScore: signal.fusionScore || null,
      cacheHit: signal.cacheHit || false,
      surface: signal.surface,
      environment: signal.environment,
    }).run();
  } catch (err) {
    // Telemetry failure should not block queries
    console.error('[Telemetry] Failed to record signal:', err);
  }
}
```

---

## Deliverable 2: Runtime Context Correlation

### Purpose

Attach environment metadata to every telemetry record so you can compare retrieval behavior across:
- VS Code (native editor)
- Claude Code (web IDE)
- OpenCode (slash commands)
- Codex (integration point TBD)
- CI (automated evaluation)

### Implementation

**File**: `scripts/lib/environment-detector.mjs` (already exists, extend it)

```typescript
export function detectSurface() {
  // Heuristics based on request origin, user agent, etc.
  if (process.env.OPENCODE_MODE === 'true') return 'opencode';
  if (process.env.CI === 'true') return 'ci';
  if (process.env.CODEX_API_KEY) return 'codex';
  // Check request headers in middleware
  const userAgent = this.req?.headers['user-agent'] || '';
  if (userAgent.includes('VSCode')) return 'vscode';
  if (userAgent.includes('Claude')) return 'claudecode';
  return 'unknown';
}
```

**Attach to Every Record**:

```typescript
const telemetry = {
  // ...existing fields...
  surface: detectSurface(),
  environment: 'phase-3d-retrieval-telemetry'
};
```

**Later Use**: Compare metrics like:
- "Average latency in OpenCode vs VS Code?" (surface filtering)
- "Which surface triggers the most orphan retrievals?" (anomaly detection)
- "Is CI retrieval behavior different from user behavior?" (evaluation debugging)

---

## Deliverable 3: Quality Reports

### Report 1: `docs/reports/retrieval-telemetry-summary.json`

**Generated by**: `npm run atlas:phase3d:telemetry-summary`

```json
{
  "timestamp": "2026-06-18T14:30:00Z",
  "period": "last_7_days",
  "query_count": 1247,
  "unique_queries": 642,
  "metrics": {
    "latency": {
      "p50_ms": 124,
      "p95_ms": 847,
      "p99_ms": 2341,
      "mean_ms": 189
    },
    "cache_hit_ratio": 0.34,
    "lane_contribution": {
      "vector_only": 0.18,
      "trigram_only": 0.08,
      "fts_only": 0.06,
      "fusion_2lane": 0.22,
      "fusion_3lane": 0.46
    },
    "top_retrieved_features": [
      {"feature_id": "...", "name": "auth_middleware", "hit_count": 47, "avg_rank": 1.2},
      {"feature_id": "...", "name": "database_pool", "hit_count": 34, "avg_rank": 2.1},
      {"feature_id": "...", "name": "cache_wrapper", "hit_count": 28, "avg_rank": 3.4}
    ],
    "top_retrieved_directories": [
      {"dir": "src/lib/server/", "hit_count": 123, "unique_features": 8},
      {"dir": "src/lib/ai/", "hit_count": 87, "unique_features": 6}
    ],
    "orphan_retrievals": {
      "count": 12,
      "definition": "queries with zero hits across all lanes",
      "examples": ["very specific query A", "very specific query B"]
    }
  },
  "surface_breakdown": {
    "vscode": {"query_count": 456, "mean_latency_ms": 178},
    "opencode": {"query_count": 678, "mean_latency_ms": 195},
    "ci": {"query_count": 113, "mean_latency_ms": 205}
  },
  "behavioral_temperature": {
    "hot_packets": {
      "definition": "retrieved >5 times in last 7 days",
      "count": 87,
      "total_retrievals": 612
    },
    "warm_packets": {
      "definition": "retrieved 1-5 times in last 7 days",
      "count": 234,
      "total_retrievals": 487
    },
    "cold_packets": {
      "definition": "retrieved 0 times in last 7 days",
      "count": 9427,
      "note": "These are candidates for archival"
    }
  }
}
```

### Report 2: `docs/reports/retrieval-telemetry-summary.md`

**Generated by**: `npm run atlas:phase3d:telemetry-report`

```markdown
# Retrieval Telemetry Report — Week 1 (June 11–18, 2026)

## Executive Summary
- **Queries**: 1,247 total, 642 unique
- **Mean Latency**: 189ms (target: <200ms) ✅
- **Cache Hit Ratio**: 34% (indicates room for improvement)
- **Fusion Effectiveness**: 46% of queries use all three lanes (strong)

## Latency Breakdown
- **P50**: 124ms (sub-200ms) ✅
- **P95**: 847ms (acceptable for complex queries)
- **P99**: 2,341ms (3 outliers in topology-heavy queries)

## Lane Contribution
- **Fusion (all 3 lanes)**: 46% of queries (best precision + recall)
- **Vector-only**: 18% of queries (semantic search)
- **Trigram**: 8% of queries (typo tolerance)
- **FTS**: 6% of queries (keyword exact match)
- **Hybrid 2-lane**: 22% of queries (fallback for edge cases)

## Top Retrieved Features (Behavioral Temperature)
1. **auth_middleware** — 47 retrievals (genuinely HOT)
2. **database_pool** — 34 retrievals
3. **cache_wrapper** — 28 retrievals

These are NOT structural temperature (directory frequency). These are proven HOT by actual user/agent queries.

## Cache Hit Ratio Analysis
- **Current**: 34% (5ms mean latency when cached)
- **Potential**: 40%+ if Redis eviction policy is tuned
- **Action**: Use telemetry to refine HOT packet selection

## Orphan Retrievals (Red Flag)
- **Count**: 12 unique queries with zero hits
- **Examples**: [list]
- **Action**: Investigate gap analysis — are these queries searching for missing features?

## Surface Comparison (New Data)
- **VS Code**: 456 queries, 178ms mean latency (fastest)
- **OpenCode**: 678 queries, 195ms mean latency (heaviest usage)
- **CI**: 113 queries, 205ms mean latency (slower, more complex benchmarks?)

## Next Steps
1. Use this telemetry to redefine HOT/WARM/COLD (Phase 3G)
2. Feed into feature governance decisions (Phase 3F)
3. Identify orphan queries for feature gap analysis
4. Tune fusion weights based on lane contribution data
```

---

## Success Criteria

- ✅ `retrieval_telemetry` table created and indexed
- ✅ >1,000 queries captured within first week
- ✅ All three instruments (ACE, search, RAG) recording telemetry
- ✅ `detectSurface()` working for vscode / opencode / ci
- ✅ Both reports generating successfully
- ✅ Behavioral temperature visible (HOT packets by retrieval count, not structure)

---

## Why This Unblocks Phase 3E/F/G/H

**Phase 3E (Eval Harness)** — Needs telemetry to interpret precision/recall against real usage patterns  
**Phase 3F (Feature Governance)** — Decides which features to archive based on retrieval_count (from telemetry), not packet_count (from structure)  
**Phase 3G (Cache Policy)** — Redefines HOT/WARM/COLD as behavioral (retrieved >5 times/week) instead of structural (packet in freq directory)  
**Phase 3H (SeaweedFS Automation)** — Archives packets with 0 retrievals in 30 days (directly from telemetry)

---

## Critical Point

> A packet marked HOT in Phase 3C because it exists in a frequently-accessed directory is not the same as a packet proven HOT by Phase 3D because users retrieve it repeatedly.

**Phase 3D converts guesses into evidence.**

All downstream decisions (caching, archival, governance, cold storage) depend on this evidence.

---

## Timeline

**Week 1**: Implement instrumentation, wire telemetry capture  
**Week 2**: Collect 1,000+ queries, generate first reports  
**Week 3**: Analyze behavioral temperature, document findings  
**Week 4**: Hand off to Phase 3E (Eval Harness) with data foundation  

**Then**: Phase 3E, 3F, 3G, 3H proceed with evidence-based decisions
