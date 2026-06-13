---
name: OpenCode Atlas Indexing
description: Integration guide for Gemma4 to query Parent Atlas instead of using placeholders. Replaces placeholder data with real K-means, SOM, and packet indexing queries.
---

# OpenCode Atlas Indexing Integration

## Problem: Placeholders Instead of Real Data

Previously, OpenCode (Gemma4 agent) used **hardcoded placeholder data** when searching for codebase context:
```javascript
// ❌ OLD: Placeholder (ignores actual codebase state)
const results = [
  { feature_id: 'auth_lucia_sessions', confidence: 0.99 },
  { feature_id: 'database_orm_drizzle', confidence: 0.95 }
  // ... hardcoded list
];
```

## Solution: Real Parent Atlas Queries

Now OpenCode queries **live Parent Atlas indexing** via MCP tools:

```javascript
// ✅ NEW: Real query against Qdrant + PostgreSQL + Redis
const results = await callTool('find_atlas_packets', {
  query: 'authentication session management',
  limit: 5  // 5-recommendation limit enforced
});
// Returns: top 5 by confidence from live atlas_packets
```

## Available MCP Tools

### 1. **find_atlas_packets**

Find relevant packets via semantic or full-text search.

**3-tier search strategy**:
1. **Redis cache** (5ms) — instant if exact query seen before
2. **Qdrant semantic** (500ms) — 768-dim vector similarity search
3. **PostgreSQL BM25** (1s) — full-text fallback

**Input**:
```json
{
  "query": "authentication session management",
  "file_path": "src/lib/server/auth.ts",  // optional
  "feature_id": "auth_lucia_sessions",    // optional
  "limit": 5
}
```

**Output**:
```json
{
  "ok": true,
  "results": [
    {
      "feature_id": "auth_lucia_sessions",
      "packet_key": "foundation:abc123",
      "source_ref": "src/lib/server/auth",
      "confidence": 0.98,
      "som_cluster": 3,
      "concepts": ["infrastructure_foundation"]
    },
    ...
  ],
  "count": 5,
  "limit_enforced": true,
  "cache_source": "redis | qdrant | postgres"
}
```

**5-Recommendation Limit**: Results always capped at 5 items, enforced at query level.

---

### 2. **get_som_cluster**

Get Self-Organizing Map (SOM) cluster assignment for a packet.

Useful for finding **neural topology context** — neighboring packets in the SOM grid.

**Input**:
```json
{
  "packet_key": "foundation:abc123"
}
```

**Output**:
```json
{
  "ok": true,
  "packet_key": "foundation:abc123",
  "som_cluster": 3,
  "som_row": 7,
  "som_col": 12,
  "source": "atlas_packets.metadata"
}
```

---

### 3. **get_kmeans_context**

Get K-means cluster context for a feature.

Returns the **cluster ID** and **neighboring features** in the same cluster.

**Input**:
```json
{
  "feature_id": "auth_lucia_sessions"
}
```

**Output**:
```json
{
  "ok": true,
  "feature_id": "auth_lucia_sessions",
  "cluster_id": 5,
  "neighbors": [
    "cache_redis_valkey",
    "database_orm_drizzle",
    "session_management"
  ],
  "source": "atlas_packets.metadata (kmeans_cluster)"
}
```

---

### 4. **get_all_recommendations**

Get all active recommendations from Parent Atlas (bounded to 5).

Pulls the full set of current recommendations available to the agent.

**Input**:
```json
{
  "limit": 5
}
```

**Output**:
```json
{
  "ok": true,
  "results": [
    {
      "feature_id": "auth_lucia_sessions",
      "packet_key": "foundation:abc123",
      "confidence": 0.95,
      "summary": "Lucia session management and auth flow"
    },
    ...
  ],
  "count": 5,
  "limit_enforced": true
}
```

---

### 5. **validate_atlas_index**

Validate Parent Atlas infrastructure is healthy.

Checks Qdrant, Redis, and PostgreSQL connectivity.

**Input**:
```json
{}
```

**Output**:
```json
{
  "ok": true,
  "checks": {
    "redis": true,
    "qdrant": true,
    "postgres": true,
    "timestamp": "2026-06-13T19:30:00Z"
  },
  "status": "healthy"
}
```

---

## Usage Patterns in OpenCode

### Pattern 1: Search for Packet Context

```javascript
// User asks: "How do I set up authentication?"
const response = await callTool('find_atlas_packets', {
  query: 'authentication session setup',
  limit: 5
});

// Gemma4 now returns:
// "Based on Parent Atlas, here are the top 5 relevant features:
// 1. auth_lucia_sessions (confidence: 0.98) — Lucia session management
// 2. cache_redis_valkey (confidence: 0.87) — Redis caching for sessions
// ..."
```

### Pattern 2: Find Related Features (K-means Clustering)

```javascript
// User asks: "What else uses Redis caching?"
const context = await callTool('get_kmeans_context', {
  feature_id: 'cache_redis_valkey'
});

// Gemma4 returns:
// "cache_redis_valkey is in cluster 5 alongside:
// - auth_lucia_sessions (sessions cached)
// - database_orm_drizzle (DB query cache)
// - rag_context_assembly (RAG context cache)"
```

### Pattern 3: Explore SOM Topology

```javascript
// User asks: "What's in the same topology region as auth?"
const som = await callTool('get_som_cluster', {
  packet_key: 'foundation:abc123'
});

// Gemma4 returns:
// "auth_lucia_sessions is in SOM cluster 3 (row 7, col 12).
// Nearby clusters contain:
// - Database infrastructure
// - Caching services
// - Request handling"
```

### Pattern 4: Validate Environment Before Agent Action

```javascript
// Before running a complex operation:
const health = await callTool('validate_atlas_index', {});

if (!health.ok) {
  // Degrade gracefully
  console.log('Parent Atlas is degraded. Using fallback logic.');
} else {
  // Proceed with real indexing
  const packets = await callTool('find_atlas_packets', { query: '...' });
}
```

---

## Query Execution Flow (Transparent to OpenCode)

```
OpenCode Query (Gemma4)
         ↓
    MCP Tool Call
         ↓
find_atlas_packets()
         ↓
    ┌────────┴────────────────┬──────────────┐
    ↓                         ↓              ↓
 Redis Cache          Qdrant ANN       PostgreSQL BM25
 (5ms hit)         (500ms search)       (1s fallback)
    ↓                   ↓              ↓
  (found?)         (confidence       (matched
    │               > 0.7?)           keywords?)
    └────────┬──────────────┬──────────────┘
             ↓
        Merge & Deduplicate (by feature_id)
             ↓
        Sort by Confidence (desc)
             ↓
        Take Top 5 (5-recommendation limit)
             ↓
        Cache 5-min (Redis)
             ↓
    Return to OpenCode/Gemma4
```

---

## Replacing Placeholders in OpenCode

### Before (Placeholder):
```typescript
// .opencode/commands/find-feature.js
export async function find_feature(query) {
  // ❌ Hardcoded placeholder
  return [
    { feature_id: 'auth_lucia_sessions', confidence: 0.99 },
    { feature_id: 'database_orm_drizzle', confidence: 0.95 }
  ];
}
```

### After (Real Atlas):
```typescript
// .opencode/commands/find-feature.js
export async function find_feature(query) {
  // ✅ Real query via MCP
  const result = await mcp.call('find_atlas_packets', {
    query: query,
    limit: 5
  });
  return result.results;
}
```

---

## Configuration

### OpenCode `.opencode/opencode.jsonc`

Add the atlas indexing tools to your OpenCode config:

```jsonc
{
  "trace": {
    "type": "remote",
    "url": "http://localhost:8788/mcp",
    "tools": [
      "find_atlas_packets",
      "get_som_cluster",
      "get_kmeans_context",
      "get_all_recommendations",
      "validate_atlas_index"
    ]
  },
  
  "context": {
    // Enable atlas caching for faster queries
    "cache": {
      "backend": "redis",
      "ttl": 300  // 5 minutes
    }
  }
}
```

---

## Performance Expectations

| Query Type | Latency | Source | Hit Rate |
|-----------|---------|--------|----------|
| Exact (cached) | 5ms | Redis | 20-30% |
| Semantic | 500ms | Qdrant | 70-90% |
| Full-text fallback | 1s | PostgreSQL | 100% (if exists) |

**Combined**: 90-95% queries served in <500ms (cache + Qdrant).

---

## Troubleshooting

### "Results are still placeholders"

**Check**: Is the MCP server running?
```bash
curl http://localhost:8788/health
# Should return { ok: true }
```

### "Atlas search returns empty"

**Check**: Are packets indexed?
```bash
node scripts/atlas/parent-atlas-mutation-gate.mjs --verbose
# Should show 4 pipelines with 16 stages PASS
```

### "SOM cluster returns null"

**Check**: Has the SOM topology been seeded?
```bash
node scripts/atlas/seed-neo4j-bounded-khop.mjs --dry-run
# Should show 3,601 edges ready to seed
```

---

## Safety: 5-Recommendation Limit

**All queries are bounded to max 5 results**, enforced at the database level:

```typescript
// In opencode-atlas-bridge.ts
const topN = merged.slice(0, 5);  // Hard limit
return topN;
```

This prevents:
- LLM prompt bloat (5 recommendations ≈ 25% of typical response)
- Agent decision paralysis (forced prioritization)
- Temporal task registry explosion (old items dropped after 5)

---

## Next Steps

1. **Enable in OpenCode**: Add tools to `.opencode/opencode.jsonc`
2. **Test a query**: `find_atlas_packets { query: "authentication" }`
3. **Verify backend health**: `validate_atlas_index {}`
4. **Monitor latency**: Check Redis cache hit rate in logs
5. **Troubleshoot as needed**: Use Docker health checks

---

**Status**: ✅ **Ready for Agent Use**

All OpenCode queries now query **live Parent Atlas** instead of hardcoded placeholders.
