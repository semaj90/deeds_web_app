# Valkey Feature Cache Contract

**Version**: 1.0  
**Status**: Active (written 2026-06-09)  
**Warmer**: `scripts/atlas/warm-feature-identity-cache.mjs`

---

## Purpose

Provides sub-millisecond identity resolution between the four cross-system identities:
- **Qdrant** point IDs and payload `feature_id`
- **Neo4j** `canonicalSourceRef` / `sourceRefHash` properties  
- **Karpathy** Valkey `gpu:karpathy:scores` hash keys
- **Atlas** `task_semantic_packets.feature_id` (Postgres)

Without this cache, cross-system joins require Qdrant scroll + Neo4j Cypher + Postgres query — ~500ms. With the cache, O(1) Valkey lookups.

---

## Key Schema

| Key Pattern | Type | TTL | Content |
|-------------|------|-----|---------|
| `feature:{id}:sourceRefs` | set | 24h | All canonical sourceRef strings for this feature_id |
| `feature:{id}:qdrantPoints` | set | 24h | Qdrant point UUIDs for this feature_id |
| `sourceRef:{hash}:featureIds` | set | 24h | feature_id values that map to this canonicalSourceRef |
| `sourceRef:{hash}:qdrantPoints` | set | 24h | Qdrant point UUIDs for this canonicalSourceRef hash |

Where `{hash}` = `sourceRefHash(canonicalSourceRef)` — 12-char sha256 prefix.

---

## Population Source

The warmer reads:
1. **Qdrant scroll** — `codebase_chunks_768` collection, payload fields `feature_id` + all path fields
2. **Neo4j** — `CodebaseFile` nodes with `canonicalSourceRef` + `sourceRefHash`

All path values normalised via `scripts/lib/canonical-source-ref.mjs::normalizeSourceRef`.

---

## Usage Pattern

```javascript
// Resolve feature_id → all Qdrant point IDs
const points = await redis.smembers(`feature:${featureId}:qdrantPoints`);

// Resolve canonicalSourceRef → feature_ids
const hash = sourceRefHash('src/lib/server/db/client.ts');
const featureIds = await redis.smembers(`sourceRef:${hash}:featureIds`);

// Resolve canonicalSourceRef → Qdrant points
const points2 = await redis.smembers(`sourceRef:${hash}:qdrantPoints`);
```

---

## Freshness

- Warm after every `npm run karpathy:gpu` or `npm run graphify:semantic`
- TTL: 24h — stale cache degrades to cache-miss (callers fall back to direct Qdrant/Neo4j)
- Warmer npm alias: `npm run identity:warm` (dry-run: `npm run identity:warm:dry`)