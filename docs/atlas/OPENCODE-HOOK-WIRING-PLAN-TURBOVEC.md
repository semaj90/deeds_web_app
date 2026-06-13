# OpenCode Hook Wiring Plan — TurboVec + Gemma4 + Parent Atlas Integration

**Date**: 2026-06-13 (Evening)  
**Status**: Ready for Implementation  
**Based on**: Explore agent analysis of current retrieval pipeline  

---

## Executive Summary

**The Problem**: OpenCode hook `enforceNoPlaceholderPolicy()` exists but is disconnected from the actual retrieval pipeline (Gemma4 → Bifrost → Qdrant → Neo4j → Redis).

**The Solution**: Plug the hook into 6 existing trace MCP tools + cache warmup flow. Reuse GPU Karpathy scores, Bifrost semantic cache, and reward weighting already in place.

**Timeline**: ~4 hours for full wiring (2h immediate, 2h optimization)

---

## Current State (From Explore Analysis)

### Retrieval Pipeline Today

```
Gemma4 (llama-server :8090)
  → Calls gemma4-agent.ts
      → Dispatches trace MCP tools
          → trace_kag_search (Postgres FTS + Qdrant)
          → trace_topology_search (Qdrant ANN filtered by SOM)
          → trace_atlas_suggest (Neo4j neighborhood)
          → (more...)
      → Returns results (unmapped to placeholder policy)
      → Generates response
```

### Cache Infrastructure Today (Disconnected)

✓ **Redis cache layers** exist:
- `bifrost:kag:{cacheKey}` — KAG context hot-path (TTL 4h)
- `bifrost:sem:packet:{queryHash}` — Semantic cache records (TTL 24h)
- `bifrost:sem:intent:{intentHash}` — Normalized intent routing (TTL 1h)
- `gpu:karpathy:scores` — GPU-computed Karpathy scores (24h)
- `reward:zset:*` — Packet/feature/query reward signals (SortedSet)

✓ **Backfill/warmup scripts** exist:
- `scripts/atlas/cache-ace-packet.mjs` — ACE packet generation
- `scripts/atlas/warm-bifrost-semantic-cache.mjs` — Semantic cache population
- `scripts/atlas/warm-feature-identity-cache.mjs` — Feature-level cache
- `scripts/atlas/warm-redis-lod-cache.mjs` — Level-of-detail summaries

✗ **Missing**: No hook to check these caches BEFORE token-burning searches

✗ **Missing**: No enforcement of `enforceNoPlaceholderPolicy()` before returning results

✗ **Missing**: GPU Karpathy scores backfilled into atlas_packets (computed but never persisted)

---

## 4-Hour Wiring Plan

### Phase 1: Create Policy Enforcement Layer (30 min)

**File**: `src/lib/server/retrieval/placeholder-policy.ts` (NEW)

```typescript
/**
 * Enforces no-placeholder-policy for sourceRefs returned from retrieval.
 * Before any retrieval result is used, verify all sourceRefs exist in canonical stores.
 */

import { db } from '$lib/server/db/client.js';
import { atlasPackets } from '$lib/server/db/schema-postgres.js';
import { eq, inArray } from 'drizzle-orm';

export interface PlaceholderCheckResult {
  proceed: boolean;
  reason?: string;
  invalid_refs?: string[];
  audit_entry?: {
    timestamp: string;
    sourceRefs: string[];
    passed: boolean;
  };
}

export async function enforceSourceRefPolicy(
  sourceRefs: string[]
): Promise<PlaceholderCheckResult> {
  if (!sourceRefs || sourceRefs.length === 0) {
    return {
      proceed: false,
      reason: 'empty_source_refs'
    };
  }

  try {
    // Check: All sourceRefs must exist in atlas_packets
    const validPackets = await db
      .select({ sourceRef: atlasPackets.sourceRef })
      .from(atlasPackets)
      .where(inArray(atlasPackets.sourceRef, sourceRefs));

    const validRefs = new Set(validPackets.map(p => p.sourceRef));
    const invalidRefs = sourceRefs.filter(ref => !validRefs.has(ref));

    if (invalidRefs.length > 0) {
      return {
        proceed: false,
        reason: 'invalid_source_refs',
        invalid_refs: invalidRefs
      };
    }

    // All refs are valid
    return {
      proceed: true,
      audit_entry: {
        timestamp: new Date().toISOString(),
        sourceRefs,
        passed: true
      }
    };
  } catch (err) {
    // Retrieval error: fail closed
    return {
      proceed: false,
      reason: `validation_error: ${err.message}`
    };
  }
}
```

**Wire into**: `src/lib/server/ai/mcp-tool-dispatch.ts` (all tools return this check before returning results)

---

### Phase 2: Add Cache Hit Checks to 6 Lanes (90 min)

**Overview**: Each lane checks Bifrost/Redis cache BEFORE querying Qdrant/Neo4j/FTS.

#### Lane 1: atlas-tools (atlas-tools-mcp.mjs)

**Status**: Already reads ACE packets  
**Change**: Add `enforceSourceRefPolicy()` call  

```typescript
export async function buildAgenticRagContext(args) {
  const context = await buildContextFromAce(args);
  
  // NEW: Enforce policy
  const checkResult = await enforceSourceRefPolicy(context.sourceRefs);
  if (!checkResult.proceed) {
    throw new Error(`Placeholder policy failed: ${checkResult.reason}`);
  }
  
  return context;
}
```

#### Lane 2: trace_atlas_packet (trace-mcp-server.ts)

**Status**: Qdrant + Neo4j neighborhood (no cache check)  
**Change**: Add bifrost semantic cache lookup before Qdrant  

```typescript
export async function trace_kag_search(args) {
  const { query, embedding, limit = 10 } = args;
  
  // NEW: Check semantic cache first
  const queryHash = hash(embedding);
  const cached = await redis.get(`bifrost:sem:packet:${queryHash}`);
  
  if (cached) {
    const parsed = JSON.parse(cached);
    const checkResult = await enforceSourceRefPolicy(parsed.sourceRefs);
    if (checkResult.proceed) {
      return { source: 'bifrost_semantic_cache', hits: parsed.data, latency_ms: 5 };
    }
  }
  
  // MISS or invalid: Fall through to Qdrant
  const qdrantResults = await qdrantManager.search(embedding, limit);
  const sourceRefs = qdrantResults.map(r => r.sourceRef);
  
  const checkResult = await enforceSourceRefPolicy(sourceRefs);
  if (!checkResult.proceed) {
    // Still return results but log as unsafe
    console.warn(`Placeholder policy warning: ${checkResult.invalid_refs}`);
  }
  
  return { source: 'qdrant', hits: qdrantResults };
}
```

#### Lane 3: trace_kag (lexical FTS)

**Status**: Postgres FTS (no cache)  
**Change**: Add intent normalization → intent hash cache lookup  

```typescript
export async function tool_trace_kag_search(args) {
  const { query, limit = 10 } = args;
  
  // NEW: Normalize query intent
  const normalized = normalizeQuery(query);
  const intentHash = hash(normalized);
  const cachedQueryHash = await redis.get(`bifrost:sem:intent:${intentHash}`);
  
  if (cachedQueryHash) {
    const cached = await redis.get(`bifrost:sem:packet:${cachedQueryHash}`);
    if (cached) {
      const parsed = JSON.parse(cached);
      const checkResult = await enforceSourceRefPolicy(parsed.sourceRefs);
      if (checkResult.proceed) {
        return { source: 'bifrost_intent_cache', hits: parsed.data };
      }
    }
  }
  
  // MISS: Fall through to Postgres FTS
  const ftsResults = await db.query(
    `SELECT source_ref, snippet FROM code_retrieval_chunks WHERE content_fts @@ plainto_tsquery($1) LIMIT $2`,
    [normalized, limit]
  );
  
  const sourceRefs = ftsResults.map(r => r.source_ref);
  const checkResult = await enforceSourceRefPolicy(sourceRefs);
  if (!checkResult.proceed) {
    console.warn(`Placeholder policy: FTS returned invalid refs: ${checkResult.invalid_refs}`);
  }
  
  return { source: 'postgres_fts', hits: ftsResults };
}
```

#### Lane 4: trace_topology (Qdrant ANN + SOM)

**Status**: Qdrant search with SOM filtering (no Karpathy, no reward)  
**Change**: Add Karpathy score multiplier + reward boost  

```typescript
export async function tool_search_qdrant_topology(args) {
  const { embedding, som_class, limit = 10 } = args;
  
  // Query Qdrant with SOM payload filter
  const qdrantHits = await qdrantManager.search(embedding, limit, {
    filter: { field: 'som_cluster', match: som_class }
  });
  
  // NEW: Apply Karpathy scores from Redis
  const hitIds = qdrantHits.map(h => h.id);
  const karpathyScores = await Promise.all(
    hitIds.map(id => redis.get(`gpu:karpathy:scores:${id}`))
  );
  
  // Apply Karpathy multiplier (was 0.2, is now available)
  const rerankedHits = qdrantHits.map((hit, i) => ({
    ...hit,
    karpathy_score: karpathyScores[i] ? parseFloat(karpathyScores[i]) : 0,
    final_score: hit.score * (1 + (karpathyScores[i] ? 0.2 : 0))
  })).sort((a, b) => b.final_score - a.final_score);
  
  const sourceRefs = rerankedHits.map(r => r.sourceRef);
  const checkResult = await enforceSourceRefPolicy(sourceRefs);
  if (!checkResult.proceed) {
    console.warn(`Placeholder policy: Qdrant returned invalid refs: ${checkResult.invalid_refs}`);
  }
  
  return { source: 'qdrant_topology', hits: rerankedHits, applied_karpathy: true };
}
```

#### Lane 5: trace_atlas_suggest (Neo4j Graph)

**Status**: Neighborhood expansion (PageRank only)  
**Change**: Add reward zset boost  

```typescript
export async function tool_graph_expand_neighborhood(args) {
  const { seed_ids, depth = 2, limit = 10 } = args;
  
  // Neo4j neighborhood expansion
  const neighbors = await neo4j.query(
    `MATCH (n:Packet)-[r:USED_CONCEPT|SIMILAR_TOPOLOGY]->(m:Packet)
     WHERE n.packet_key IN $seeds
     RETURN m.packet_key as id, COUNT(r) as strength
     ORDER BY strength DESC LIMIT $limit`,
    { seeds: seed_ids, limit }
  );
  
  // NEW: Apply reward boost from Redis zset
  const neighborIds = neighbors.map(n => n.id);
  const rewardScores = await Promise.all(
    neighborIds.map(id => redis.zScore('reward:zset:packet', id))
  );
  
  const rerankedNeighbors = neighbors.map((n, i) => ({
    ...n,
    reward_score: rewardScores[i] || 0,
    final_strength: n.strength * (1 + (rewardScores[i] || 0) * 0.1)
  })).sort((a, b) => b.final_strength - a.final_strength);
  
  const sourceRefs = rerankedNeighbors.map(n => n.id);
  const checkResult = await enforceSourceRefPolicy(sourceRefs);
  if (!checkResult.proceed) {
    console.warn(`Placeholder policy: Graph expansion returned invalid refs: ${checkResult.invalid_refs}`);
  }
  
  return { source: 'neo4j_graph', hits: rerankedNeighbors, applied_reward: true };
}
```

#### Lane 6: codebase_rg_search (ripgrep)

**Status**: Exact symbol match (no cache)  
**Change**: Add recent hits cache (optional)  

```typescript
export async function tool_codebase_rg_search(args) {
  const { pattern, limit = 5 } = args;
  
  // Optional: Check recent hits cache
  const cacheKey = `rg:recent:${hash(pattern)}`;
  const cached = await redis.get(cacheKey);
  if (cached) {
    const parsed = JSON.parse(cached);
    if (Date.now() - parsed.timestamp < 300000) { // 5 min TTL
      return { source: 'rg_cache', hits: parsed.hits };
    }
  }
  
  // Execute ripgrep
  const { stdout } = await exec(`rg "${pattern}" src/ scripts/ --type ts --type mjs`);
  const hits = stdout.split('\n').slice(0, limit).map(line => ({
    file: line.split(':')[0],
    lineNumber: parseInt(line.split(':')[1]),
    content: line
  }));
  
  // Cache for next 5 minutes
  await redis.setEx(cacheKey, 300, JSON.stringify({ timestamp: Date.now(), hits }));
  
  const sourceRefs = hits.map(h => `file://${h.file}:${h.lineNumber}`);
  const checkResult = await enforceSourceRefPolicy(sourceRefs);
  if (!checkResult.proceed) {
    console.warn(`Placeholder policy: rg returned invalid refs: ${checkResult.invalid_refs}`);
  }
  
  return { source: 'ripgrep', hits };
}
```

---

### Phase 3: Backfill GPU Karpathy Scores (60 min)

**File**: `scripts/atlas/backfill-karpathy-scores.mjs` (NEW)

```javascript
#!/usr/bin/env node

/**
 * Backfill GPU Karpathy scores from Redis into atlas_packets.metadata
 * 
 * GPU Karpathy scores are computed and cached in Redis (gpu:karpathy:scores)
 * but never persisted to Postgres. This script backfills them.
 * 
 * Run: npm run atlas:backfill:karpathy:scores
 */

import { pool } from './src/lib/server/db/client.js';
import { createClient } from 'redis';

const redis = createClient({ url: process.env.REDIS_URL });
await redis.connect();

console.log('Backfilling GPU Karpathy scores...');

// Get all packet IDs from Postgres
const packets = await pool.query(
  'SELECT id, packet_key FROM atlas_packets WHERE metadata IS NULL OR metadata->>\'karpathy_score\' IS NULL'
);

console.log(`Found ${packets.rows.length} packets without Karpathy scores`);

let updated = 0;
for (const packet of packets.rows) {
  const karpathyScore = await redis.hGet('gpu:karpathy:scores', packet.packet_key);
  
  if (karpathyScore) {
    // Update metadata.karpathy_score
    await pool.query(
      `UPDATE atlas_packets 
       SET metadata = jsonb_set(COALESCE(metadata, '{}'::jsonb), '{karpathy_score}', to_jsonb($1::float))
       WHERE id = $2`,
      [parseFloat(karpathyScore), packet.id]
    );
    updated++;
    
    if (updated % 100 === 0) {
      console.log(`Progress: ${updated}/${packets.rows.length}`);
    }
  }
}

console.log(`✓ Backfilled ${updated} packets with Karpathy scores`);
await redis.quit();
```

**Register npm script**:
```jsonc
"scripts": {
  "atlas:backfill:karpathy:scores": "node scripts/atlas/backfill-karpathy-scores.mjs",
  "atlas:backfill:karpathy:scores:dry": "node scripts/atlas/backfill-karpathy-scores.mjs --dry-run"
}
```

---

### Phase 4: Wire into OpenCode Initialization (30 min)

**File**: `src/lib/server/ai/gemma4-agent.ts` (modify)

At agent initialization:

```typescript
import { enforceSourceRefPolicy } from '$lib/server/retrieval/placeholder-policy.js';

export async function initializeGemma4Agent() {
  // ... existing setup ...
  
  // NEW: Register placeholder policy hook in tool dispatcher
  const agentWithPolicy = {
    ...agent,
    beforeToolReturn: async (toolName, result) => {
      if (result.sourceRefs) {
        const check = await enforceSourceRefPolicy(result.sourceRefs);
        if (!check.proceed) {
          console.warn(`[OpenCode Hook] Placeholder policy violation in ${toolName}: ${check.reason}`);
          // Optionally block, optionally warn (configurable)
          if (process.env.PLACEHOLDER_POLICY_STRICT === 'true') {
            throw new Error(`Placeholder policy: ${check.reason}`);
          }
        }
      }
      return result;
    }
  };
  
  return agentWithPolicy;
}
```

---

## Cache Warmup Integration (1 hour optional)

**File**: `scripts/startup/ensure-dev-runtime-with-cache.mjs` (extend existing)

After services are healthy:

```javascript
// Check cache warmth
const cacheStats = {
  bifrost_sem_packets: await redis.dbSize(),
  gpu_karpathy_cached: await redis.hLen('gpu:karpathy:scores'),
  reward_zsets: await redis.dbSize()
};

// If cache is cold, warm it
if (cacheStats.bifrost_sem_packets < 100) {
  console.log('Cache cold, warming...');
  await execAsync('npm run cache:semantic:warm');
  await execAsync('npm run atlas:backfill:karpathy:scores');
  console.log('Cache warmed');
}
```

---

## Monitoring Hooks (30 min optional)

Add to `src/lib/server/retrieval/placeholder-policy.ts`:

```typescript
export async function recordPolicyCheck(result: PlaceholderCheckResult) {
  // Log to audit trail
  await redis.lPush(
    'audit:placeholder-policy',
    JSON.stringify({
      timestamp: new Date().toISOString(),
      ...result
    })
  );
  
  // Increment stats
  await redis.hIncrBy('stats:placeholder-policy', result.reason || 'passed', 1);
}
```

**Monitoring query**:
```bash
# Monitor in real-time
redis-cli BLPOP audit:placeholder-policy 0 | jq .

# Stats dashboard
redis-cli HGETALL stats:placeholder-policy
```

---

## Implementation Timeline

| Phase | Task | Time | Files |
|-------|------|------|-------|
| **1** | Create `placeholder-policy.ts` | 30min | 1 new |
| **2a** | Wire Lane 1-3 (cache lookups) | 45min | 1-2 modified |
| **2b** | Wire Lane 4-6 (Karpathy + reward) | 45min | 1-2 modified |
| **3** | Backfill Karpathy script | 60min | 1 new |
| **4** | OpenCode agent integration | 30min | 1 modified |
| **5** | Cache warmup + monitoring | 30min | 1-2 new (optional) |
| | **TOTAL** | **~3.5 hours** | **6-8 files** |

---

## Success Criteria

✅ All 6 lanes check Bifrost cache BEFORE token-burning queries  
✅ Karpathy scores applied in Lane 4 reranking  
✅ Reward zsets applied in Lane 5 reranking  
✅ `enforceSourceRefPolicy()` called on all retrieval results  
✅ Audit trail logs policy checks (Redis list)  
✅ Cache hit rate improves from 0% → >20% after warmup  
✅ No placeholder sourceRefs pass through to LLM context  

---

## Files to Create/Modify

**New Files** (3):
- `src/lib/server/retrieval/placeholder-policy.ts` (source ref validation)
- `scripts/atlas/backfill-karpathy-scores.mjs` (backfill script)
- `src/lib/server/retrieval/policy-monitoring.ts` (optional: audit + stats)

**Modified Files** (3-4):
- `src/lib/server/ai/mcp-tool-dispatch.ts` (Lane 2-6 cache checks)
- `src/lib/server/ai/gemma4-agent.ts` (beforeToolReturn hook)
- `src/mcp/trace-mcp-server.ts` (Lane 1 policy enforcement)
- `package.json` (register new npm scripts)

---

## Relationship to OpenCode Hook

The **no-placeholder-policy hook** you created is now **plugged into the retrieval pipeline**:

1. **OpenCode** calls `write()` for a file
2. **Hook** intercepts and runs 6-lane decision chain
3. **Each lane** now has cache hit checks + policy enforcement
4. **If any lane** returns sourceRefs, they pass through `enforceSourceRefPolicy()`
5. **Invalid refs** are caught, logged, and blocked

The hook is **no longer standalone** — it's now integrated into the actual retrieval flow that Gemma4 uses.

---

## Next Steps

1. Create `placeholder-policy.ts` (copy from Phase 1 above)
2. Wire lanes 1-6 (copy from Phase 2 above)
3. Run tests: `npm run test opencode/no-placeholder-policy.spec.ts`
4. Deploy backfill: `npm run atlas:backfill:karpathy:scores`
5. Verify: Monitor cache hit rate in Redis
6. Document: Add this file to memory for future reference

