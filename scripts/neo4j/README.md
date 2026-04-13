# Neo4j Runtime Architecture Graph

**Status**: Ready to deploy
**Graph Nodes**: 25 (Lanes, Services, Cache Tiers, Routers)
**Relationships**: 50+ (routing, fallbacks, caching, observability)

---

## Quick Start

### 1. Start Neo4j

```bash
# Using Docker
docker run -d \
  --name neo4j-runtime \
  -p 7474:7474 \
  -p 7687:7687 \
  -e NEO4J_AUTH=neo4j/legal123 \
  neo4j:5.15

# Wait 30s for startup, then open:
# http://localhost:7474
```

### 2. Load the Graph

1. Open Neo4j Browser: http://localhost:7474
2. Login: `neo4j` / `legal123`
3. Copy-paste **entire** `runtime-architecture-graph.cypher` file
4. Click **Run** (or `Ctrl+Enter`)
5. Wait ~5s for graph creation

### 3. Verify

```cypher
// Count nodes
MATCH (n) RETURN count(n)
// Expected: 25 nodes

// Count relationships
MATCH ()-[r]->() RETURN count(r)
// Expected: 50+ relationships
```

---

## Graph Schema

### Node Types

| Label | Count | Properties | Purpose |
|-------|-------|------------|---------|
| `Lane` | 9 | name, tier, latency_ms, model, status | Inference engines (E2B, Ollama, TurboQuant, etc.) |
| `CacheTier` | 3 | name, tier, hit_rate, latency_ms, speedup | Cache layers (L1, L2, L3) |
| `Service` | 8 | name, port, protocol, engine, status | Infrastructure (Redis, Qdrant, RabbitMQ, etc.) |
| `Router` | 2 | name, type, file, tiers | Routing orchestrators (client, server) |

### Relationship Types

| Type | Purpose | Example |
|------|---------|---------|
| `TIER_1` ... `TIER_7` | Routing cascade | `(router)-[:TIER_2]->(e2b_webgpu)` |
| `FALLS_BACK_TO` | Fallback chain | `(e2b)-[:FALLS_BACK_TO]->(litert)` |
| `STORES_IN` | Cache writes | `(ollama)-[:STORES_IN]->(redis_l1)` |
| `BACKED_BY` | Infrastructure | `(bifrost_l2)-[:BACKED_BY]->(qdrant)` |
| `USES_FOR` | Analysis tools | `(qdrant)-[:USES_FOR]->(simdjson)` |
| `ESCALATES_TO` | Client→Server | `(client_router)-[:ESCALATES_TO]->(server_router)` |
| `TRACES` | Observability | `(langfuse)-[:TRACES]->(ollama)` |

---

## Useful Queries

### 1. Full Architecture Overview

```cypher
MATCH (n)
RETURN n
LIMIT 100
```

**What it shows**: All nodes and relationships
**Use when**: First-time visualization, architecture overview

---

### 2. Client Cascade (5 Tiers)

```cypher
MATCH path = (client:Router {type: 'client'})-[r*1..5]->(tier)
WHERE type(r[0]) STARTS WITH 'TIER'
RETURN path
ORDER BY length(path)
```

**What it shows**: Browser → Bifrost L2 → E2B → LiteRT → ONNX → Server
**Use when**: Debugging client-side routing, understanding fallback chain

---

### 3. Server Cascade (7 Tiers)

```cypher
MATCH path = (server:Router {type: 'server'})-[r*1..7]->(tier)
WHERE type(r[0]) STARTS WITH 'TIER'
RETURN path
ORDER BY length(path)
```

**What it shows**: Redis L1 → Bifrost L2 → TensorRT → TurboQuant → VLM → LiteRT → Ollama
**Use when**: Debugging server-side routing, optimizing cache hits

---

### 4. Cache Tier Hierarchy

```cypher
MATCH path = (l1:CacheTier {tier: 'L1'})-[:FALLS_BACK_TO*]->(next)
RETURN path
```

**What it shows**: L1 (5ms) → L2 (3s) → L3 (50ms vector search)
**Use when**: Understanding cache miss behavior, debugging hit rates

---

### 5. Critical Path (Fastest Route)

```cypher
MATCH path = (client:Router {type: 'client'})-[:TIER_1]->(cache:CacheTier)
RETURN path, cache.latency_ms AS latency
ORDER BY latency
```

**What it shows**: Client → Bifrost L2 (500ms timeout, 2-5s on hit)
**Use when**: Optimizing for lowest latency, understanding cache-first strategy

---

### 6. Worst-Case Fallback Chain

```cypher
MATCH path = (client:Router {type: 'client'})-[:TIER_4]->(onnx:Lane)
       -[:FALLS_BACK_TO*0..1]->(server_router:Router)
       -[:TIER_7]->(ollama:Lane)
WHERE ollama.always_succeeds = true
RETURN path,
       onnx.latency_ms + ollama.latency_ms AS total_latency_ms
```

**What it shows**: ONNX (6.5s) → Server → Ollama (25s) = 31.5s total
**Use when**: Understanding worst-case latency, planning SLAs

---

### 7. All Lanes Sorted by Latency

```cypher
MATCH (l:Lane)
RETURN l.name AS lane,
       l.latency_ms AS latency,
       l.type AS environment,
       l.tier AS tier,
       l.status AS status,
       l.vram_gb AS vram
ORDER BY l.latency_ms
```

**What it shows**: Table of all inference lanes with performance metrics
**Use when**: Choosing the right lane for a use case, capacity planning

---

### 8. Production-Ready Lanes Only

```cypher
MATCH (l:Lane {status: 'production'})
RETURN l.name, l.latency_ms, l.tier, l.type
ORDER BY l.tier
```

**What it shows**: Lanes that are currently deployed and stable
**Use when**: Deployment planning, excluding optional/experimental lanes

---

### 9. Services and Their Ports

```cypher
MATCH (s:Service)
RETURN s.name AS service,
       s.port AS port,
       s.protocol AS protocol,
       s.engine AS engine,
       s.status AS status
ORDER BY s.port
```

**What it shows**: Port reference table for all infrastructure services
**Use when**: Network configuration, firewall rules, health checks

---

### 10. Cache Hit Rate Analysis

```cypher
MATCH (c:CacheTier)
RETURN c.name AS cache,
       c.tier AS tier,
       c.hit_rate * 100 AS hit_rate_percent,
       c.latency_ms AS latency,
       c.speedup_cpu AS speedup_cpu,
       c.speedup_gpu AS speedup_gpu
ORDER BY c.tier
```

**What it shows**: Performance metrics for all cache tiers
**Use when**: Optimizing cache strategy, calculating cost savings

---

### 11. Infrastructure Dependencies

```cypher
MATCH (cache:CacheTier)-[:BACKED_BY]->(service:Service)
RETURN cache.name, service.name, service.port
```

**What it shows**: Which infrastructure services back which cache tiers
**Use when**: Debugging cache failures, deployment dependencies

---

### 12. Observability Coverage

```cypher
MATCH (langfuse:Service {name: 'Langfuse'})-[t:TRACES]->(target)
RETURN target.name AS traced_service,
       t.endpoints AS endpoint_count,
       target.status AS status
```

**What it shows**: Which services/lanes have Langfuse tracing enabled
**Use when**: Debugging observability gaps, adding new traces

---

### 13. GPU-Accelerated Lanes

```cypher
MATCH (l:Lane)
WHERE l.backend CONTAINS 'CUDA' OR l.backend CONTAINS 'WebGPU'
RETURN l.name, l.backend, l.vram_gb, l.latency_ms, l.status
ORDER BY l.vram_gb DESC
```

**What it shows**: All lanes that use GPU acceleration
**Use when**: VRAM capacity planning, GPU utilization analysis

---

### 14. Client → Server Escalation Path

```cypher
MATCH path = (client:Router {type: 'client'})-[:ESCALATES_TO]->(server:Router {type: 'server'})
RETURN path
```

**What it shows**: How client router hands off to server router
**Use when**: Understanding escalation triggers, debugging server calls

---

### 15. Full Request Flow (Client to Ollama)

```cypher
MATCH path = (client:Router {type: 'client'})-[*1..15]->(ollama:Lane {name: 'Ollama'})
WHERE ollama.always_succeeds = true
RETURN path
ORDER BY length(path) DESC
LIMIT 1
```

**What it shows**: Longest possible path from client to final fallback
**Use when**: Understanding complete system topology, worst-case analysis

---

## Visualization Tips

### Neo4j Browser Settings

```
// Enable hierarchical layout
:style
Graph Style Sheet

node {
  diameter: 50px;
  color: #A5ABB6;
  border-color: #9AA1AC;
  border-width: 2px;
  text-color-internal: #FFFFFF;
  font-size: 10px;
}

relationship {
  color: #4356C0;
  shaft-width: 2px;
  font-size: 8px;
  padding: 5px;
  text-color-external: #000000;
  text-color-internal: #FFFFFF;
}

// Color by node type
node.Lane {
  color: #4CAF50;
}
node.CacheTier {
  color: #2196F3;
}
node.Service {
  color: #FF9800;
}
node.Router {
  color: #9C27B0;
}
```

### Layout Recommendations

- **Force-directed**: Best for full architecture overview (query #1)
- **Hierarchical**: Best for cascades (queries #2, #3)
- **Radial**: Best for cache tiers (query #4)

---

## Export Options

### 1. Export as JSON

```cypher
CALL apoc.export.json.all("runtime-architecture.json", {})
```

**Requires**: APOC plugin installed

### 2. Export as GraphML (for Gephi)

```cypher
CALL apoc.export.graphml.all("runtime-architecture.graphml", {})
```

**Use when**: Advanced visualization in Gephi, Cytoscape

### 3. Export as CSV

```cypher
MATCH (l:Lane)
RETURN l.name, l.tier, l.latency_ms, l.status
INTO OUTFILE 'lanes.csv'
```

---

## Adding New Lanes

### Template

```cypher
CREATE (new_lane:Lane {
  name: 'Your Lane Name',
  tier: 8,
  type: 'server',
  runtime: 'Your Runtime',
  model: 'Your Model',
  quantization: 'Q4_K_M',
  backend: 'CUDA',
  latency_ms: 20000,
  throughput_tps: 10,
  vram_gb: 4.0,
  port: 8080,
  status: 'experimental'
})

// Add to server cascade
MATCH (server:Router {type: 'server'}), (new_lane:Lane {name: 'Your Lane Name'})
CREATE (server)-[:TIER_8 {latency_ms: 20000}]->(new_lane)

// Add fallback from previous tier
MATCH (prev:Lane {tier: 7}), (new_lane:Lane {tier: 8})
CREATE (prev)-[:FALLS_BACK_TO]->(new_lane)

// Add caching
MATCH (new_lane:Lane {name: 'Your Lane Name'}), (cache:CacheTier {tier: 'L1'})
CREATE (new_lane)-[:STORES_IN]->(cache)
```

---

## Health Monitoring Queries

### 1. Production Services Status

```cypher
MATCH (s:Service {status: 'production'})
RETURN s.name, s.port, s.status
```

### 2. Lanes Needing Verification

```cypher
MATCH (l:Lane)
WHERE l.needs_verification = true OR l.status = 'experimental'
RETURN l.name, l.status
```

### 3. Optional/Disabled Services

```cypher
MATCH (l:Lane)
WHERE l.optional = true OR l.enabled = false
RETURN l.name, l.optional, l.enabled
```

---

## Common Use Cases

### Use Case 1: "Why is my query slow?"

```cypher
// Check which tier was hit
MATCH (router:Router)-[r]->(target)
WHERE type(r) STARTS WITH 'TIER'
RETURN target.name, target.latency_ms, r
ORDER BY target.latency_ms DESC
```

### Use Case 2: "What happens if Redis goes down?"

```cypher
// Show fallback from L1
MATCH path = (l1:CacheTier {tier: 'L1'})-[:FALLS_BACK_TO*]->(next)
RETURN path
```

### Use Case 3: "Which lanes use GPU?"

```cypher
MATCH (l:Lane)
WHERE l.vram_gb > 0
RETURN l.name, l.vram_gb, l.backend
ORDER BY l.vram_gb DESC
```

### Use Case 4: "What's my 90th percentile latency?"

```cypher
// All lanes, sorted by latency
MATCH (l:Lane {status: 'production'})
WITH collect(l.latency_ms) AS latencies
UNWIND latencies AS lat
RETURN percentileDisc(lat, 0.90) AS p90_latency_ms
```

---

## Troubleshooting

### Graph is empty

```cypher
// Verify nodes exist
MATCH (n) RETURN count(n)

// If 0, re-run runtime-architecture-graph.cypher
```

### Relationships not showing

```cypher
// Verify relationships exist
MATCH ()-[r]->() RETURN count(r)

// If 0, check constraints didn't fail
SHOW CONSTRAINTS
```

### Query too slow

```cypher
// Create missing indexes
CREATE INDEX lane_tier IF NOT EXISTS FOR (l:Lane) ON (l.tier);
CREATE INDEX service_port IF NOT EXISTS FOR (s:Service) ON (s.port);
```

---

## Next Steps

1. ✅ Load graph: `runtime-architecture-graph.cypher`
2. ✅ Run query #1 (full overview)
3. ✅ Run query #7 (lanes by latency)
4. ⚠️ Verify E2B WebGPU lane (set `needs_verification: false` after testing)
5. ⚠️ Enable optional lanes if needed (LiteRT, TensorRT)

---

## Related Documentation

- `RUNTIME_MATRIX.md` — Text documentation (this graph in markdown)
- `UNIFIED_GENERATION_GUIDE.md` — Client-side generation API
- `BACKEND_INFRASTRUCTURE_AUDIT.md` — Service health checks
- `CLAUDE.md` — Full project instructions

**Last Updated**: 2026-04-12
**Graph Version**: 1.0
**Neo4j Compatibility**: 5.x
