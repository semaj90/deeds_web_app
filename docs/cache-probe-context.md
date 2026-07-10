# Retrieval Router Architecture and Design

## System Overview

The runtime-cache system implements a five-layer promotion decision flow that routes retrieval results through deterministic gates and caches. This document serves as a stable reference for cache prefix testing.

### Architecture Principles

**Canonical Truth**: Postgres holds the authoritative packet metadata. All caches (Redis/Valkey, Qdrant, Neo4j, mmap) are rebuildable mirrors.

**Deterministic Routing**: Promotion decisions follow a strict 5-step flow:
1. Read from Postgres (canonical source)
2. Validate identity (4 hard-fail gates)
3. Determine destination (rank/score thresholds)
4. Build LOD manifest (token budget enforcement)
5. Record decision + invalidate caches + emit events

**Non-Blocking Writes**: Cache writes are fire-and-forget. If Redis is unavailable, the response is still sent; the cache miss is logged non-blockingly.

### Five-Destination Promotion Policy

Packets are routed to exactly one of these destinations:

**browser-l1** (rank ≤ 2 AND score ≥ 0.85)
- Client-side IndexedDB cache (1-hour TTL)
- Exact-match lookup for repeated queries
- Service Worker intercepts SOM cell reads

**valkey-hot** (rank 3-5 AND score ≥ 0.75)
- Redis/Valkey hot tier (5-minute TTL)
- Fast repeated-query cache
- Used by retrieval orchestrator for warm queries

**valkey-warm** (rank 6-10 AND score ≥ 0.60)
- Redis/Valkey warm tier (24-hour TTL)
- Longer-lived cache for occasional queries
- Slower than hot but faster than Postgres

**analytics-only** (validation gate FAILED)
- No cache; packet sent to analytics pipeline
- Used for tracking cache misses and failures
- Never served to end users

**cold-archive** (rank > 10 OR score < 0.60)
- SeaweedFS cold storage
- Not served in real-time; used for batch analysis
- Restored on-demand if needed

### Level-of-Detail (LOD) Emission

Each promotion produces a manifest with one of four LOD levels:

**LOD0** (Identity, ~10 tokens)
- packet_key + feature_id + source_ref
- Fastest path for known packets
- Used when cache hit is certain

**LOD1** (Identity + Summary, ~50 tokens)
- packet_key + feature_id + summary
- Default for browser-l1 and valkey-hot
- Sufficient for most retrieval queries

**LOD2** (Identity + Full Content, ~1000 tokens)
- packet_key + source_ref + full_content
- Used for detailed analysis
- Respects token budget (max 1024/packet)

**LOD3** (Identity + Neighbors, ~2000 tokens)
- packet_key + source_ref + full_content + SOM neighbors
- Topology expansion for graph queries
- Token budget enforced per packet

### Service Worker SOM Lookup

The static Service Worker (sw-som-lookup.js) caches Self-Organizing Map (SOM) cells in IndexedDB:

**Cell Cache** (1-hour TTL per cell)
- Key: `som:cell:{row}:{col}`
- Value: Cell centroid + member packet_ids
- Exact hit: 2-5ms

**Radius-1 Neighborhood** (8-neighbor connectivity)
- When exact cell misses, fetch neighboring cells
- Generate candidate set from adjacent cells
- Network fallback if neighborhood also misses

**TTL Invalidation**
- Cells expire after 1 hour
- Manual invalidation on SOM recompute
- Non-blocking; expired entries return 404

### Validation Gates (Hard Fail Conditions)

Four mandatory gates determine if a packet may be cached:

**Gate 1: Identity Validation**
- packet_key must be present and non-empty
- source_ref must be present
- HARD FAIL: packet routed to analytics-only

**Gate 2: Source Integrity**
- source_ref must match a known directory_path
- feature_id must be present in atlas_packets
- HARD FAIL: packet quarantined, not cached

**Gate 3: Embedding Availability**
- Packet must have a valid embedding in Qdrant
- Embedding dimension must match project canonical (384-dim)
- SOFT WARN: packet cached anyway, but logged as degraded

**Gate 4: Summary Quality**
- Summary length must be between 30 and 5000 characters
- Summary must not contain training-trace contamination markers
- SOFT WARN: packet cached, contamination logged for remediation

### Telemetry Collection

Telemetry is recorded non-blockingly in Redis (24-hour TTL):

**Per-Query Signals**
- cache_hit (exact match, semantic match, miss)
- som_exact_cells (exact cell hits)
- som_radius_searches (fallback neighborhood searches)
- promotion_destination (which of 5 destinations)
- lod_level_emitted (0, 1, 2, or 3)
- validation_gate_passed (true/false)
- validation_gate_failure_reason (if false)

**Prometheus Export**
- 13 core metrics exported at GET /api/atlas/runtime-cache/metrics
- Dynamic labels for destination + LOD level
- Cache-Control: no-cache (immediate refresh)

### GPU Acceleration (Phase 4)

Optional NetworkX topology acceleration via nx-cugraph backend:

**PageRank** (14× speedup on RTX 3060 Ti)
- Community detection via Louvain
- Authority scoring for packet ranking

**K-Core Decomposition** (14× speedup)
- Core number assignment for structural analysis
- Used in topology-aware promotion decisions

**Disabled in Phase 2** — Phase 3 production wiring only.

---

## Integration Points

### Retrieval Orchestrator

The unified-orchestrator.ts route handler:
1. Receives query + context
2. Calls promotion-policy.ts to determine destination
3. Calls lod-emission-integration.ts to build manifest
4. Records decision to retrieval_promotion_decisions table
5. Fires non-blocking cache writes
6. Returns manifest to client

### Service Worker Registration

Client-side sw-register.ts:
1. Checks browser support (ServiceWorker API)
2. Registers static/sw-som-lookup.js
3. Scope: /api/packets/*
4. IndexedDB namespace: som-cache-v1
5. TTL enforcement: 1-hour expiry per cell

### Telemetry Pipeline

Async telemetry writes via runtime-cache-telemetry.ts:
1. Record cache operation (hit/miss)
2. Pipeline to Redis pipelined batch
3. Return immediately (non-blocking)
4. Metrics export aggregates over 24h window

---

## Performance Baselines (Verified)

| Metric | Value | Status |
|--------|-------|--------|
| Health check latency | 2-15ms | ✅ Fast (read-only) |
| Cache miss latency | 50-100ms | ✅ Acceptable |
| Cache hit latency | <5ms (exact) | ✅ Target met |
| Valkey down latency | 50-100ms (degraded) | ✅ Graceful fallback |
| GPU topology speedup | 14-15× | ✅ Proven on RTX 3060 Ti |
| Test coverage | 26/26 | ✅ 100% |

---

This document is frozen for cache-probe experiments. Do not modify for at least 48 hours to ensure stable prefix hashing.
