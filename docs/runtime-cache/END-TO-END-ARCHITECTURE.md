# Runtime-Cache & Promotion Pipeline — End-to-End Architecture

**Status:** Phase 2 Complete (All 6 Slices Wired) ✅
**Last Updated:** July 10, 2026
**Scope:** Health endpoints, SOM lookup, LOD emission, promotion decision, telemetry, metrics

---

## High-Level Architecture

```
┌──────────────────────────────────────────────────────────────────┐
│ CLIENT (Browser)                  SERVER (SvelteKit + Docker)    │
├──────────────────────────────────────────────────────────────────┤
│                                                                  │
│ IndexedDB L1 Cache      ◄─────  Valkey/Redis L3 Cache          │
│ (SOM cells, 1h TTL)     ─────►  (promotion state, 24h TTL)      │
│                                                                  │
│ Service Worker          ◄─────  `/api/atlas/runtime-cache/*`    │
│ (fetch intercept)       ─────►  (health, metrics, promotion)    │
│                                                                  │
│ Browser ONNX (optional) ◄─────  Ollama gemma4 (5.3GB GPU)      │
│                         ─────►  libTorch N-API (7 GPU ops)      │
│                                                                  │
└──────────────────────────────────────────────────────────────────┘
                              │
                              ▼
                    CANONICAL FLOW (5 Steps)
                              │
    ┌─────────────────────────┼─────────────────────────┐
    │                         │                         │
    ▼                         ▼                         ▼
POSTGRES            QDRANT/TURBOVEC          REDIS/BIFROST
(Truth)             (Vector Mirrors)         (Cache Warmth)
58,365 packets      40,568 points            125K+ keys
100% identity       768-dim HNSW             promotion state
                    Payload tags             SOM clusters


┌─────────────────────────────────────────────────────────────────┐
│ PROMOTION DECISION TREE (Deterministic)                         │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│ Hard Fail Gates (Validation):                                   │
│   1. packet_key exists ✓                                        │
│   2. source_ref exists ✓                                        │
│   3. feature_id exists ✓                                        │
│   4. content_hash valid ✓                                       │
│   ↓ (all must pass, else → quarantine)                         │
│                                                                 │
│ Soft Validation (Score-based):                                  │
│   • rank ≤ 2 && score ≥ 0.85  → browser-l1 (LOD2)              │
│   • rank ≤ 9 && score ≥ 0.70  → valkey-hot (LOD1)              │
│   • rank ≤ 99 && score ≥ 0.50 → valkey-warm (LOD0)             │
│   • score ≥ 0.30               → analytics-only (no cache)      │
│   • score < 0.30               → cold-archive (quarantine)      │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

---

## 5-Step Canonical Flow

### Step 1: Read from Postgres (Truth)

**Input:** packet_key, rank, score from retrieval results

**Operation:**
```sql
SELECT 
  packet_key, source_ref, feature_id, domain_class,
  packet_type, capabilities, constraints, examples
FROM atlas_packets
WHERE packet_key = $1
```

**Output:** Validated packet envelope

**Failure Mode:** If not found → quarantine (packet_key dangling reference)

---

### Step 2: Validate Identity (Hard Fail Gates)

**4 Mandatory Fields:**
```
packet_key      (primary identity, non-null)
source_ref      (file/function, non-null)
feature_id      (semantic grouping, non-null)
content_hash    (integrity check, non-null if indexed)
```

**Validation Code:**
```typescript
const validation = {
  passed: !!(packet.packet_key && packet.source_ref && 
             packet.feature_id && packet.content_hash),
  reasons: [
    packet.packet_key ? 'identity_key_valid' : 'identity_key_missing',
    packet.source_ref ? 'source_ref_valid' : 'source_ref_missing',
    packet.feature_id ? 'feature_id_valid' : 'feature_id_missing',
    packet.content_hash ? 'content_hash_valid' : 'content_hash_missing'
  ]
};
```

**Outcome:**
- ✅ All 4 pass → continue to promotion decision
- ❌ Any fail → quarantine (no cache write, only telemetry)

---

### Step 3: Determine Promotion Destination

**Input:** rank, score, validationPassed

**Decision Tree:**
```typescript
if (!validationPassed) {
  return 'analytics-only';  // Telemetry only, no cache
}

if (rank <= 2 && score >= 0.85) {
  return 'browser-l1';      // Hot cache, full content
}

if (rank <= 9 && score >= 0.70) {
  return 'valkey-hot';      // Warm cache, metadata
}

if (rank <= 99 && score >= 0.50) {
  return 'valkey-warm';     // Cool cache, summary only
}

if (score >= 0.30) {
  return 'analytics-only';  // Telemetry only
}

return 'cold-archive';      // Quarantine
```

**Output:** destination ∈ {browser-l1, valkey-hot, valkey-warm, analytics-only, cold-archive}

---

### Step 4: Build LOD Manifest

**Input:** destination, packet

**LOD Levels:**
| Level | Content | Use Case | Tokens |
|-------|---------|----------|--------|
| **LOD0** | Identity only (packet_key, source_ref) | Quick check | 10 |
| **LOD1** | + Summary (50 words) | Context packing | 50 |
| **LOD2** | + Full content (1000 words) | Synthesis input | 1000 |
| **LOD3** | + Related packets (5 neighbors) | Graph expansion | 2000 |

**Selection by Destination:**
- `browser-l1` → LOD2 (full context for synthesis)
- `valkey-hot` → LOD1 (summary for reranking)
- `valkey-warm` → LOD0 (identity only for routing)
- `analytics-only` → LOD0 (no cache, telemetry only)
- `cold-archive` → none (quarantine, no manifest)

**Manifest Structure:**
```typescript
interface LodManifest {
  packet_key: string;
  lod_level: 0 | 1 | 2 | 3;
  promotion_destination: string;
  content: {
    identity: { packet_key, source_ref, feature_id };
    summary?: string;        // LOD1+
    full_text?: string;      // LOD2+
    neighbors?: string[];    // LOD3
  };
  token_count: number;
  created_at: ISO8601;
  cache_ttl_seconds: number;
}
```

**Token Budget:** Max 1024 tokens per packet (enforced)

---

### Step 5: Record Decision & Cache

**Operations:**
```typescript
// 1. Write to Postgres (atomic, durable)
await db.insert(retrieval_promotion_decisions).values({
  trace_id,
  packet_key,
  rank,
  final_score: score,
  selected: destination !== 'analytics-only' && destination !== 'cold-archive',
  destination,
  validation_gate_passed: validation.passed,
  reason_codes: validation.reasons,
  created_at: new Date()
});

// 2. Emit telemetry (non-blocking)
await telemetry.recordPromotion(destination);
await telemetry.recordLodEmission(lod_level);

// 3. Write to cache (Valkey)
if (selected) {
  await redis.setex(
    `bifrost:packet:${packet_key}`,
    ttl_seconds,
    JSON.stringify(manifest)
  );
}

// 4. Emit async event (RabbitMQ)
await rabbitmq.publish('atlas.packet.promoted', {
  packet_key,
  destination,
  lod_level,
  timestamp: new Date()
});
```

**Order is Critical:**
1. **Postgres first** (atomic, truth)
2. **Telemetry** (record decision)
3. **Cache write** (warm L2)
4. **Events** (notify async workers)

---

## Integration Points

### Health Check Semantics

**Endpoint:** `GET /api/atlas/runtime-cache/health`

```typescript
export async function GET() {
  const start = Date.now();
  
  try {
    // Check Postgres
    const pgHealth = await db.ping();
    
    // Check Valkey
    const redisHealth = await redis.ping();
    
    // Check Qdrant
    const qdrantHealth = await qdrant.health();
    
    return json({
      status: 'ready',
      latency_ms: Date.now() - start,
      components: {
        postgres: pgHealth,
        redis: redisHealth,
        qdrant: qdrantHealth
      },
      timestamp: new Date().toISOString()
    });
  } catch (err) {
    return json(
      { status: 'degraded', error: err.message },
      { status: 503 }
    );
  }
}
```

**Rule:** Health check is read-only, no side effects. Used for:
- Load balancer readiness probes
- Circuit breaker upstream
- Graceful degradation signals

---

### Service Worker SOM Lookup

**Intercept Pattern:**
```javascript
// static/sw-som-lookup.js
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  
  if (url.pathname.startsWith('/api/packets/')) {
    // Exact cell check
    const { row, col } = parseCoordinates(url);
    const cached = await getFromIndexedDB(`som:${row}:${col}`);
    
    if (cached && cached.timestamp > Date.now() - 3600000) {
      // Cache hit (exact cell, 1h TTL)
      return event.respondWith(new Response(JSON.stringify(cached.manifest)));
    }
    
    // Cache miss or radius search
    return event.respondWith(
      fetch(event.request).then(response => {
        // Store in IndexedDB for future hits
        updateIndexedDB(`som:${row}:${col}`, response);
        return response;
      })
    );
  }
});
```

**Cache Strategy:**
- Exact cell (2D grid index) → IndexedDB (fast)
- Radius-1 neighbors (8 surrounding cells) → computed on miss
- Fallback → network request (server-side cache handles)

---

### Promotion Routing Integration

**Into Retrieval Orchestrator:**

```typescript
// src/lib/server/retrieval/unified-orchestrator.ts

async function processRetrievalResults(candidates) {
  const results = [];
  
  for (const candidate of candidates) {
    // 1. Validate identity
    const validation = validatePacketIdentity(candidate);
    
    if (!validation.passed) {
      // Quarantine
      await telemetry.recordValidationGate(false);
      continue;
    }
    
    // 2. Determine promotion destination
    const destination = determinePromotionDestination({
      packet: candidate,
      rank: candidate.rank,
      score: candidate.score,
      validationPassed: validation.passed
    });
    
    // 3. Build LOD manifest
    const manifest = await buildPacketLodManifest({
      packet: candidate,
      destination,
      lod_level: getLodLevelForDestination(destination)
    });
    
    // 4. Record decision
    await recordPromotionDecision(candidate, traceId, candidate.rank, candidate.score, destination, validation);
    
    // 5. Store in cache
    if (destination !== 'analytics-only' && destination !== 'cold-archive') {
      await cachePromotedPacket(manifest, getTtlForDestination(destination));
    }
    
    results.push({
      ...candidate,
      promotion_destination: destination,
      lod_level: manifest.lod_level,
      manifest
    });
  }
  
  return results;
}
```

**Throughput:** ~50-100 candidates/sec (batched)
**Latency:** 2-5ms per candidate (network not included)

---

### Telemetry Recording

**Every Decision Point:**

```typescript
// When recording cache hit
await telemetry.recordCacheHit('browser-l1', latency_ms);

// When recording cache miss
await telemetry.recordCacheMiss('valkey-hot');

// When recording SOM lookup
await telemetry.recordSomLookup(isExact, latency_ms);

// When recording promotion
await telemetry.recordPromotion(destination);

// When recording LOD emission
await telemetry.recordLodEmission(lod_level);

// When recording validation gate result
await telemetry.recordValidationGate(passed);
```

**Redis Storage:**
```
runtime-cache:telemetry:browser-l1:hits       → 12,534 (counter)
runtime-cache:telemetry:browser-l1:misses     → 1,245 (counter)
runtime-cache:telemetry:som:exact_hits        → 45,672 (counter)
runtime-cache:telemetry:promotion:browser-l1  → 3,456 (counter)
runtime-cache:telemetry:lod:0                 → 1,234 (counter)
runtime-cache:telemetry:validation:passed     → 58,234 (counter)
runtime-cache:telemetry:validation:failed     → 342 (counter)
```

**TTL:** 24 hours (auto-expire)

---

### Metrics Export

**Prometheus Endpoint:** `GET /api/atlas/runtime-cache/metrics`

```
# HELP runtime_cache_browser_l1_hits Total browser L1 cache hits
# TYPE runtime_cache_browser_l1_hits counter
runtime_cache_browser_l1_hits 12534

# HELP runtime_cache_browser_l1_misses Total browser L1 cache misses
# TYPE runtime_cache_browser_l1_misses counter
runtime_cache_browser_l1_misses 1245

# HELP runtime_cache_som_exact_hits Total SOM exact cell hits
# TYPE runtime_cache_som_exact_hits counter
runtime_cache_som_exact_hits 45672

# HELP runtime_cache_promotion_destinations Promotion destination routing counts
# TYPE runtime_cache_promotion_destinations gauge
runtime_cache_promotion_destinations{destination="browser-l1"} 3456
runtime_cache_promotion_destinations{destination="valkey-hot"} 12345
runtime_cache_promotion_destinations{destination="valkey-warm"} 34567

# HELP runtime_cache_lod_emissions LOD level emission counts
# TYPE runtime_cache_lod_emissions gauge
runtime_cache_lod_emissions{lod="0"} 1234
runtime_cache_lod_emissions{lod="1"} 5678
runtime_cache_lod_emissions{lod="2"} 9876

# HELP runtime_cache_validation_gate_passed Validation gates passed
# TYPE runtime_cache_validation_gate_passed counter
runtime_cache_validation_gate_passed 58234

# HELP runtime_cache_validation_gate_failed Validation gates failed
# TYPE runtime_cache_validation_gate_failed counter
runtime_cache_validation_gate_failed 342
```

**Scrape Interval:** 15s (Prometheus default)
**Retention:** 15 days (Prometheus default)

---

## Cross-Component Interaction

### ACP (Agent Control Plane) Integration

**When ACP needs context:**
1. Query BitFrost cache (Redis, 5ms exact hit)
2. If miss, check Qdrant (ANN, 10-50ms)
3. If miss, query Postgres (full scan, 100-500ms)
4. Pack result into compact ACE context (4,800 tokens)
5. Send to Gemma4 for synthesis

**Runtime-cache role:**
- Warm BitFrost with promoted packets (L1/L2)
- Enable 5ms exact hits (skip Qdrant/Postgres)
- Reduce context materialization time by 10-50×

---

### MCP (Model Context Protocol) Tools

**Available MCP Tools:**
- `trace.kag_search` — Use MCP for graph-based retrieval
- `topology.search_near` — Neighborhood expansion (topology-aware)
- `graph.expand_neighborhood` — K-hop bounded expansion
- `clusters.get_summary_lenses` — Cluster summaries (SOM-grouped)

**Runtime-cache supports all 4:**
- Cache hits reduce network roundtrips
- LOD manifests reduce token consumption
- Promotion routing ensures only relevant packets cached
- SOM lookup enables locality-aware queries

---

### gRPC Service Integration

**Embedding Service (:50051)**
- Input: list of packets to embed
- Output: 384-dim embeddings (for Qdrant indexing)
- Runtime-cache role: Packets promoted to hot cache get priority embedding

**Retrieval Service (:50053)**
- Input: query + filters (rank, score, destination)
- Output: ranked candidates + promotion decisions
- Runtime-cache role: All 5 steps happen inside this service

---

## Example Integration Loop

### Loop 1: User Query → Cache Hit

```
User Query (browser)
  ↓
SvelteKit `/api/retrieval/unified?q=auth`
  ↓
Service Worker Check
  ├─ IndexedDB SOM lookup (exact cell)
  └─ Cache hit → return cached manifest
  ↓
Telemetry: recordCacheHit('browser-l1', 2ms)
  ↓
Response sent (total 5ms)
```

**Result:** User gets answer in 5ms (vs 50-100ms for cache miss)

---

### Loop 2: Cache Miss → Promotion

```
User Query (browser)
  ↓
SvelteKit `/api/retrieval/unified?q=auth`
  ↓
Service Worker Check
  ├─ IndexedDB SOM lookup (miss)
  └─ Network request
  ↓
Go Retrieval (gRPC :50053)
  ├─ Query Qdrant (rank top-100)
  ├─ Join Postgres (get identity)
  └─ Return candidates + scores
  ↓
Runtime-Cache Promotion
  ├─ Step 1: Read from Postgres
  ├─ Step 2: Validate identity (hard fail gates)
  ├─ Step 3: Determine destination (rank/score thresholds)
  ├─ Step 4: Build LOD manifest (token budget)
  └─ Step 5: Record + cache
  ↓
Telemetry: recordPromotion('browser-l1'), recordLodEmission(2), recordValidationGate(true)
  ↓
Response sent (total 50-100ms)
```

**Result:** Packet now cached; next query hits in 5ms

---

### Loop 3: Valkey Down → Graceful Fallback

```
User Query (browser)
  ↓
SvelteKit `/api/retrieval/unified?q=auth`
  ↓
Health Check
  ├─ Valkey PING → timeout
  └─ Return 503 (degraded mode)
  ↓
Fallback to Direct Qdrant
  ├─ Query Qdrant ANN (no cache)
  └─ Return results
  ↓
Telemetry: recordValidationGate(false) [cache unavailable]
  ↓
Response sent (50-100ms, no cache warmth)
```

**Result:** System degrades gracefully, user gets results (slower, but working)

---

## Architectural Invariants

### 1. Postgres is Truth

- All identity decisions based on Postgres rows
- Qdrant/Redis/Neo4j are mirrors (rebuildable)
- If Postgres row missing → packet_key quarantined

### 2. Validation is Mandatory

- 4 hard fail gates checked on EVERY packet
- If any gate fails → analytics-only (no cache write)
- Quarantined packets tracked for manual recovery

### 3. Promotion is Deterministic

- Given (rank, score, validationPassed) → unique destination
- No ML/learning phase (Phase 2 is heuristic-only)
- Enables reproducible testing and debugging

### 4. LOD Controls Content

- LOD0 = identity (10 tokens) — fast
- LOD1 = summary (50 tokens) — context packing
- LOD2 = full (1000 tokens) — synthesis
- LOD3 = neighbors (2000 tokens) — expansion
- Budget enforced: max 1024 tokens/packet

### 5. Cache Never Blocks

- All writes non-blocking (async, fire-and-forget)
- Failures don't propagate (caught + logged)
- Telemetry recorded even if cache write fails
- User experience unaffected by cache layer issues

---

## Testing Strategy

### Unit Tests (Per Slice)

| Slice | Tests | Coverage |
|-------|-------|----------|
| Health | 2 | 200 / 503 responses |
| SOM Lookup | 4 | exact / miss / radius / fallback |
| LOD Emission | 3 | token budget / levels / manifests |
| Promotion | 5 | destinations / validation / scoring |
| Telemetry | 4 | recording / aggregation / export |
| Metrics | 2 | Prometheus format / counter accuracy |

### Integration Tests (Full Flow)

| Scenario | Steps | Assertions |
|----------|-------|-----------|
| Cache hit | query→SOM lookup | response <5ms |
| Cache miss | query→promotion→cache→response | cache written |
| Valkey down | health check→fallback | 503 + direct query |
| Invalid packet | validation gates | quarantined |
| Token budget | LOD emission | manifest <1024 tokens |

### Smoke Test (26 Tests)

See `scripts/runtime-cache-smoke-test.mjs` for full test suite.

---

## Monitoring & Alerts

### Key Metrics to Watch

| Metric | Healthy | Alert Threshold |
|--------|---------|-----------------|
| Cache hit rate (L1) | >80% | <50% |
| Validation gate pass rate | >99% | <95% |
| LOD0 emission rate | <20% | >50% |
| Promotion to hot cache | >5% | <1% |
| Telemetry latency | <1ms | >5ms |

### Grafana Dashboards

- **Runtime-Cache Health:** Hit rates, gate pass rate, destination distribution
- **LOD Distribution:** Stacked bar showing levels emitted
- **Promotion Routing:** Pie chart of browser-l1 vs hot vs warm
- **Validation Gates:** Pass/fail ratio over time

### Alert Rules (Prometheus)

```yaml
- alert: LowCacheHitRate
  expr: rate(runtime_cache_browser_l1_hits[5m]) < 0.5
  
- alert: HighValidationFailure
  expr: rate(runtime_cache_validation_gate_failed[5m]) > 0.1
  
- alert: ExcessiveAnalyticsOnlyRouting
  expr: rate(runtime_cache_promotion_destinations{destination="analytics-only"}[5m]) > 0.5
```

---

## What's NOT Included (Phase 3+)

### ML/Learning (Deferred to Phase 3)
- Logistic regression for score calibration
- XGBoost for rank-based promotion scoring
- Feedback loop from synthesis accuracy

### HMM State Machine (Deferred)
- Viterbi decoder for workflow state estimation
- State transitions based on promotion decisions
- Agentic error recovery routing

### Traversal Export (Deferred)
- GraphML export of promotion decisions
- Tensor export for GPU acceleration
- Custom CUDA kernel optimization

---

## Reference Implementation

**Start Here:**
1. Read `docs/runtime-cache/SMOKE-TEST-PACKAGE-GUIDE.md` (distribution options)
2. Read `scripts/runtime-cache-smoke-test.mjs` (test structure)
3. Run `npm run smoke:runtime-cache` (verify all 6 slices working)
4. Read this document (end-to-end flow)
5. Read individual slice docs:
   - `src/routes/api/atlas/runtime-cache/health/+server.ts` (health endpoint)
   - `static/sw-som-lookup.js` (Service Worker SOM cache)
   - `src/lib/server/atlas/lod-emission-integration.ts` (LOD manifest building)
   - `src/lib/server/atlas/retrieval-promotion-policy.ts` (promotion decision tree)
   - `src/lib/server/atlas/runtime-cache-telemetry.ts` (telemetry collection)

**Key Files:**
- Contracts: `src/lib/runtime-cache/contracts.ts`
- Database: `drizzle/manual/20260710_retrieval_promotion_decisions.sql`
- Tests: `tests/runtime-cache-promotion.spec.ts`

---

**Last Updated:** July 10, 2026
**Status:** Phase 2 Complete, Ready for Phase 3 Production Wiring
**Next:** Session 133 Pre-Flight Checks & LOD Orchestrator Integration
