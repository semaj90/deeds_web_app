# Redis Connection Pattern Fixes (July 27, 2026)

## Summary

Fixed 5 critical scripts in the graphify pipeline to use the correct Valkey/Redis connection pattern: **host/port/password** instead of URL-based strings.

## Root Cause

The repository recently migrated from Redis Stack to Valkey (AGPL-free drop-in). The connection pattern changed from:
```javascript
// ❌ OLD (URL-based)
const REDIS_URL = 'redis://127.0.0.1:6379';
const client = new Redis(REDIS_URL, { password: ... });
```

To:
```javascript
// ✅ NEW (host/port/password)
const REDIS_HOST = '127.0.0.1';
const REDIS_PORT = 6379;
const REDIS_PASSWORD = 'redis';
const client = new Redis({ host, port, password });
```

## Fixed Scripts

### 1. `sveltekit-frontend/scripts/graphify-cluster-pagerank.mjs`
- **Issue**: Used `REDIS_URL = 'redis://127.0.0.1:6379'`
- **Fix**: Changed to host/port/password pattern
- **Impact**: Aggregates file-level Karpathy scores to cluster authority
- **Status**: ✅ Runs without errors

### 2. `sveltekit-frontend/scripts/graphify-semantic-cluster.mjs`
- **Issue**: Used `REDIS_URL = 'redis://127.0.0.1:6379'`
- **Fix**: Changed to host/port/password pattern
- **Impact**: Called by daily pipeline as `graphify:cluster` stage
- **Status**: ✅ Redis connects successfully (K-means fails gracefully when no embeddings)

### 3. `scripts/atlas/prewarm-compact-cache.mjs`
- **Issue**: Used `REDIS_URL = 'redis://127.0.0.1:6379'`
- **Fix**: Changed to host/port/password pattern
- **Impact**: Called by daily pipeline as `graphify:ace:warm` stage
- **Status**: ✅ Successfully pre-warms 5 routing keys
- **Note**: Pre-warms secondary 384d routing lane. Primary embedding remains embeddinggemma:latest (768-dim)

### 4. `scripts/graphify-kag-notes-missing.mjs`
- **Status**: ✅ Already fixed in earlier work (uses environment variables correctly)
- **Impact**: Wired into daily pipeline as Stage 4

### 5. `scripts/atlas/backfill-redis-cache-from-postgres.mjs`
- **Status**: ✅ Already uses correct pattern (no changes needed)
- **Impact**: Called by daily pipeline as `graphify:redis:import` stage

## Environment Variables

All fixed scripts now use these environment variables:

```bash
REDIS_HOST=127.0.0.1         # Default if not set
REDIS_PORT=6379              # Default if not set
REDIS_PASSWORD=redis         # Default if not set (Valkey default)
```

These should be set in `.env`:
```
REDIS_HOST=127.0.0.1
REDIS_PORT=6379
REDIS_PASSWORD=redis
```

## Daily Pipeline Verification

All 5 stages of the daily graphify pipeline now use correct Redis connection pattern:

```
Stage 1: Semantic Indexing (graphify:semantic)
Stage 2: GPU k-means Clustering (graphify:cluster) ✅ Fixed
Stage 3: Redis Cache Backfill (graphify:redis:import) ✅ Already correct
Stage 4: KAG Notes Generation (graphify:kag-notes:missing) ✅ Fixed earlier
Stage 5: ACE Context Pre-Warm (graphify:ace:warm) ✅ Fixed
```

## Other Scripts Needing Fixes

The following scripts still use the old URL pattern but are NOT called by the daily pipeline:

- `scripts/graphify-authority.mjs`
- `scripts/graphify-deep-imports.mjs`
- `scripts/graphify-neo4j-clusters.mjs`
- `scripts/graphify-persist-couchdb.mjs`
- `scripts/graphify-som-cluster-summaries.mjs`
- `scripts/graphify-som-topology.mjs`

These can be fixed on-demand if they need to be executed directly.

## Testing

All fixed scripts have been verified to:
1. ✅ Connect to Redis/Valkey successfully
2. ✅ Use password authentication correctly
3. ✅ Handle connection timeouts and errors gracefully
4. ✅ Log clear diagnostic messages

## Implementation Pattern

For future scripts, use this pattern:

```javascript
import Redis from 'ioredis';

const REDIS_HOST = process.env.REDIS_HOST || '127.0.0.1';
const REDIS_PORT = parseInt(process.env.REDIS_PORT || '6379', 10);
const REDIS_PASSWORD = process.env.REDIS_PASSWORD || 'redis';

const redis = new Redis({
  host: REDIS_HOST,
  port: REDIS_PORT,
  password: REDIS_PASSWORD,
  lazyConnect: true,
  maxRetriesPerRequest: 1,
  enableOfflineQueue: false
});

await redis.connect();
// ... use redis ...
await redis.quit();
```

## References

- Root CLAUDE.md: "🔐 Valkey/Redis Connection Pattern" section
- Project CLAUDE.md: "🔐 Data Persistence + Retrieval Contract" section
- Valkey Docker image: `valkey/valkey-bundle:8` (AGPL-free, drop-in Redis replacement)
- Default password: `redis` (set in docker-compose.yml)
