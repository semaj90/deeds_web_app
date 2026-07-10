# Runtime-Cache Architecture Audit (July 10, 2026)

**Status**: ✅ **FOUNDATION WIRED** | ⚠️ **HEALTH SEMANTICS NEED REFINEMENT** | ❌ **LOD MANIFESTS & SOM LOOKUP MISSING**

---

## Current Wiring (VERIFIED ✅)

### Request Flow
```
POST /api/atlas/runtime-cache/redis  (authenticated)
  ↓
Key validation (allowlist: sw:*, runtime:*, bitfrost:*, ace:*, atlas:*, taxonomy:*, query:*)
  ↓
Valkey (127.0.0.1:6379, password: redis)
  ↓
JSON serialization + EX TTL (900s default, max 24h)
  ↓
Response: { ok, key, ttl }
```

**Endpoints**:
- `GET /api/atlas/runtime-cache/redis?key=<key>` → exact lookup or prefix scan
- `GET /api/atlas/runtime-cache/redis?prefix=sw:&limit=100` → enumerate cache
- `POST /api/atlas/runtime-cache/redis` → write cache entry
- `GET /api/atlas/runtime-cache/som?key=<key>` → SOM-specific lookup
- `POST /api/atlas/runtime-cache/som` → SOM-specific write

**Service Worker Integration** (static/sw.js):
- ✅ Registered at `/sw.js` with scope `/`
- ✅ Skip registration in VS Code webview context
- ✅ Telemetry staging to IndexedDB (yorha-telemetry)
- ✅ Message handlers: `ping`, `chat-health`, `analytics-queue-depth`, `analytics-flush-now`, `log-telemetry`
- ✅ Cache versioning (v1.6.0, Phase D)
- ⚠️ **Missing**: runtime-cache integration (Redis lookup from SW)

**Cache Strategy**:
- SHELL_CACHE: App shell (static routes: /, /evidence, /cases, etc.)
- STATIC_CACHE: Offline fallback
- WASM_CACHE: WASM modules (vector-ops.wasm, etc.)
- API_CACHE: API responses
- WEBGPU_CACHE: WebGPU resources

**Telemetry Persistence**:
- ✅ Staged to IndexedDB in SW
- ✅ Drainable via `analytics-flush-now` message
- ❌ **Missing**: Async upload to `/api/admin/telemetry`

---

## ⚠️ ISSUE 1: Health Probe Not Following Contract

**Current State** (redis/+server.ts:16-36):
```typescript
export const GET: RequestHandler = async ({ url, locals }) => {
  // Requires authentication
  if (!locals.user) return json({ ok: false, error: 'Unauthorized' }, { status: 401 });

  const key = url.searchParams.get('key');
  const prefix = url.searchParams.get('prefix') ?? 'sw:';
  
  // Full Redis operation (LIST keys + GET)
  if (key) {
    const raw = await redis.get(key);  // ← Can hit network if not in cache
    return json({ ok: true, key, data: raw ? JSON.parse(raw) : null, hit: Boolean(raw) });
  }
  if (prefix) {
    const keys = await redis.keys(`${prefix}*`).slice(0, limit);  // ← Scans all keys matching pattern
    return json({ ok: true, keys });
  }
};
```

**Problems**:
1. ✅ Requires auth — good for write, bad for health (uptime probes are unauthenticated)
2. ❌ Performs expensive lookup (SCAN/KEYS) — slow, blocks other requests
3. ❌ Returns real data — hides cache unavailability from packet absence
4. ❌ No idempotency contract — repeated calls with same key have different results (cache expires)

**Verdict**: Not suitable as health endpoint. Mixes operational readiness with cache lookup semantics.

---

## ✅ RECOMMENDATION 1: Add Explicit Health Endpoints

**New Endpoints**:

```typescript
// HEAD /api/atlas/runtime-cache/health
// GET /api/atlas/runtime-cache/health?format=json

export const HEAD: RequestHandler = async () => {
  try {
    const redis = getRedis();
    const canConnect = await redis.ping();
    return new Response(null, {
      status: canConnect === 'PONG' ? 204 : 503
    });
  } catch {
    return new Response(null, { status: 503 });
  }
};

export const GET: RequestHandler = async ({ url }) => {
  try {
    const redis = getRedis();
    const canConnect = await redis.ping();
    
    return json({
      ready: canConnect === 'PONG',
      backend: 'valkey',
      timestamp: Date.now(),
      // Do NOT include real data (not a cache lookup)
    }, {
      status: canConnect === 'PONG' ? 200 : 503
    });
  } catch (err) {
    return json({
      ready: false,
      error: 'backend_unavailable',
      backend: 'valkey'
    }, { status: 503 });
  }
};
```

**Contract**:
- `200 { ready: true }` → Valkey is healthy
- `503 { ready: false, error: 'backend_unavailable' }` → Valkey is down
- Never mutates state, never performs lookup
- No authentication required (uptime monitoring)
- Response < 100 bytes

---

## ❌ ISSUE 2: No Local SOM Lookup (Service Worker)

**What's Missing**:
The service worker has telemetry staging + analytics queueing, but NO cache lookup. Every cache hit still requires a network call to `/api/atlas/runtime-cache/redis`.

**Recommended Next Slice**: Local SOM Cell + Neighbor Lookup

```typescript
// In service worker: fetch interceptor

self.addEventListener('fetch', (event) => {
  const { request } = event;
  
  // Intercept requests for packets
  if (request.url.includes('/api/packets/') || request.url.includes('/api/atlas/packet/')) {
    const packetKey = extractPacketKey(request);
    
    if (packetKey) {
      event.respondWith(
        lookupSomCacheFirst(packetKey)
          .then(cachedResponse => cachedResponse || fetch(request))
          .catch(() => fetch(request))
      );
    }
  }
});

async function lookupSomCacheFirst(packetKey: string) {
  // Query Valkey for SOM coordinates + cached manifest
  try {
    const somKey = `sw:som:${packetKey}`;
    const manifest = await fetch(
      `/api/atlas/runtime-cache/som?key=${encodeURIComponent(somKey)}`
    ).then(r => r.json());
    
    if (manifest?.data?.packetManifest) {
      // Cache hit: return early without fetching full packet
      return new Response(
        JSON.stringify(manifest.data.packetManifest),
        { 
          headers: { 'Content-Type': 'application/json', 'X-Cache': 'SW-SOM' },
          status: 200
        }
      );
    }
    
    // Cache miss: fall through to network
    return null;
  } catch {
    return null;  // Network error: fall through to main fetch
  }
}

function extractPacketKey(request: Request): string | null {
  const url = new URL(request.url);
  
  // Match patterns like /api/packets/ace:packet:abc123 or /api/atlas/packet/abc123
  const match = url.pathname.match(/\/(?:packets|packet)\/([^/?]+)/);
  return match?.[1] || null;
}
```

**Expected Behavior**:
1. POST body → stable cache key (MD5 or SHA-256)
2. SW checks local Valkey for SOM coordinates
3. If found: return LOD0/LOD1 manifest immediately (no network)
4. If missing: fetch from network, cache result

---

## ❌ ISSUE 3: No LOD Manifests from HyperRAG

**What's Missing**:
Packets are retrieved but no `PacketLodManifest` is emitted. Means all cache writes are "full content" with no level-of-detail.

**Recommended Next Slice**: Emit LOD Manifests

```typescript
// interface PacketLodManifest (in src/lib/types/packet-manifest.ts)

export interface PacketLodManifest {
  // Identity
  packetKey: string;
  sourceRef: string;
  featureId?: string;
  treeNodeId?: string;

  // Level of Detail (0=minimum, 3=full)
  lod: 0 | 1 | 2 | 3;
  cacheClass: 'hot' | 'warm' | 'cold';

  // Content Metadata
  contentHash: string;
  byteLength: number;
  tokenCount?: number;

  // SOM Topology
  somRow?: number;
  somCol?: number;
  neighborCells?: Array<[number, number]>;  // 8-neighbor offsets
  communityId?: number;

  // Lifecycle
  generatedAt: string;  // ISO 8601
  expiresAt?: string;   // Cache TTL
  promotionState?: 'winner' | 'near-winner' | 'loser' | 'cold-archive';
}

// Suggested LOD breakdown:
export const LOD_LEVELS = {
  0: {
    name: 'Identity',
    fields: ['packetKey', 'title', 'sourceRef'],
    use: 'search result list'
  },
  1: {
    name: 'Summary',
    fields: ['summary', 'keywords', 'domain', 'contentHash'],
    use: 'hover preview'
  },
  2: {
    name: 'Context',
    fields: ['ACE packet', 'graph neighbors', 'provenance'],
    use: 'selected result'
  },
  3: {
    name: 'Full',
    fields: ['complete content', 'document', 'evidence'],
    use: 'deep inspection'
  }
};
```

**Integration Point**: HyperRAG materializer

```typescript
// In retrieval pipeline after rank/select winner

async function promoteWinnerToCache(
  packet: Packet,
  rank: number,
  score: number,
  decision: RetrievalPromotionDecision
) {
  const manifest: PacketLodManifest = {
    packetKey: packet.packet_key,
    sourceRef: packet.source_ref,
    featureId: packet.feature_id,
    lod: determineLod(decision.destination),  // 0-3 based on cache tier
    cacheClass: decision.destination === 'browser-l1' ? 'hot' : 'warm',
    contentHash: sha256(JSON.stringify(packet)),
    byteLength: JSON.stringify(packet).length,
    tokenCount: estimateTokens(packet.summary),
    somRow: packet.som_row,
    somCol: packet.som_col,
    communityId: packet.community_id,
    generatedAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + 3600000).toISOString(),  // 1h
    promotionState: 'winner'
  };

  // Write manifest + LOD0 data to cache
  const cacheKey = `sw:packet:${packet.packet_key}`;
  await postToRuntimeCache(cacheKey, manifest, {
    ttl: 3600
  });
}

function determineLod(destination: string): 0 | 1 | 2 | 3 {
  switch (destination) {
    case 'browser-l1': return 2;    // Context level for hot
    case 'valkey-hot': return 1;    // Summary level
    case 'valkey-warm': return 0;   // Identity only
    default: return 0;
  }
}
```

---

## ❌ ISSUE 4: No Promotion Policy Records

**What's Missing**:
Winners, losers, and near-winners are not tracked. No telemetry about cache effectiveness.

**Recommended Next Slice**: Winner/Loser Promotion Records

```typescript
// Interface for retrieval outcome tracking

export interface RetrievalPromotionDecision {
  traceId: string;
  packetKey: string;
  rank: number;              // rank in retrieval results (0, 1, 2, ...)
  finalScore: number;        // RRF blend score [0, 1]
  selected: boolean;         // true if winner, false if loser

  destination:
    | 'browser-l1'          // Hot cache: L1 memory + SW
    | 'valkey-hot'          // Hot Redis: TTL 3600s
    | 'valkey-warm'         // Warm Redis: TTL 86400s
    | 'analytics-only'      // Telemetry only, no cache
    | 'cold-archive';       // CouchDB/S3 for later replay

  reasonCodes: string[];    // ["identity_validated", "rrf_top_3", "lod2_available"]
  timestamp: string;        // ISO 8601
  validationGatePassed: boolean;  // Hard fail checks passed?
}

// Store in Postgres table for analytics
// CREATE TABLE retrieval_promotion_decisions (
//   id uuid PRIMARY KEY,
//   trace_id uuid,
//   packet_key text,
//   rank int,
//   final_score real,
//   selected bool,
//   destination text,
//   reason_codes text[],
//   validation_gate_passed bool,
//   created_at timestamp default now()
// );
```

**Integration Point**: After retrieval + ranking, before cache write

```typescript
async function recordPromotionDecision(
  packet: Packet,
  traceId: string,
  rank: number,
  score: number,
  destination: string,
  validation: { passed: boolean; reasons: string[] }
) {
  const decision: RetrievalPromotionDecision = {
    traceId,
    packetKey: packet.packet_key,
    rank,
    finalScore: score,
    selected: destination !== 'analytics-only' && destination !== 'cold-archive',
    destination: destination as any,
    reasonCodes: validation.reasons,
    timestamp: new Date().toISOString(),
    validationGatePassed: validation.passed
  };

  // Write to Postgres for analytics
  await db
    .insert(retrievalPromotionDecisions)
    .values(decision);

  // Telemetry
  logTelemetry('retrieval:promotion', {
    packet_key: packet.packet_key,
    destination,
    rank,
    score
  });
}
```

---

## 📋 Execution Order (Recommended)

| Slice | Task | Effort | Blocker | Status |
|-------|------|--------|---------|--------|
| 1 | Add health endpoints (HEAD + GET /api/atlas/runtime-cache/health) | 30m | None | ❌ READY |
| 2 | Add SW local SOM lookup (cache-first for packets) | 1.5h | Slice 1 | ❌ READY |
| 3 | Emit LOD manifests from retrieval pipeline | 1h | Slice 2 | ❌ READY |
| 4 | Record promotion decisions (winner/loser) | 45m | Slice 3 | ❌ READY |
| 5 | Add telemetry: browser hit, Valkey hit, SOM hit, promotion | 1h | Slices 1-4 | ❌ READY |
| 6 | End-to-end smoke test | 30m | All | ❌ READY |

**Total Effort**: ~5h

**Smoke Test Checklist**:
- ✅ Health endpoint returns 200 when Valkey up
- ✅ Health endpoint returns 503 when Valkey down (don't crash)
- ✅ Stable POST body → same cache key (MD5 invariant)
- ✅ SOM exact hit → packet returned from SW without network
- ✅ Retrieval winner → promoted to hot cache
- ✅ Retrieval loser → not written to hot cache
- ✅ Telemetry: promotion decision recorded
- ✅ IndexedDB telemetry queue drains on `analytics-flush-now`

---

## 🔗 Reference

- **Current**: Redis + SOM endpoints (GET/POST authenticated)
- **Service Worker**: Telemetry staging + analytics queueing (v1.6.0)
- **Missing**: Health, local SOM lookup, LOD manifests, promotion records

**Decision**: Runtime-cache **foundation is WIRED** ✅. Next work focuses on **readiness semantics** and **local lookup optimization** to avoid network round-trips on cache hits.
