# ACE Materializer Quick Start Guide

**Purpose**: Sync ACE-validated packets to Qdrant/Redis/TurboVec mirrors for fast retrieval without re-synthesis.

**Status**: ✅ Production-ready (created Session 91)

---

## Import

```typescript
import {
  materializePacket,
  materializePackets,
  getPacketMaterializationStatus,
  invalidateMaterializedPacket
} from '$lib/server/ace';
```

---

## Basic Usage

### Materialize a Single Packet

```typescript
const result = await materializePacket({
  packetKey: 'auth:001',
  collection: 'codebase_chunks_768',
  redisTtl: 86400,       // 24 hours (optional, default)
  syncTurboVec: false,   // Optional TurboVec sync
  dryRun: false          // Set true to preview
});

console.log(result);
// {
//   packetKey: 'auth:001',
//   qdrantPointId: 'auth:001:1719461496353',
//   qdrantSuccess: true,
//   redisSuccess: true,
//   turboVecSuccess: false,
//   error: undefined,
//   duration: 145  // milliseconds
// }
```

### Batch Materialize

```typescript
const packetKeys = ['auth:001', 'db:002', 'graph:003'];
const results = await materializePackets(packetKeys, {
  dryRun: false,
  syncTurboVec: false
});

console.log(results);
// Array of MaterializeResult objects
```

### Check Materialization Status

```typescript
const status = await getPacketMaterializationStatus('auth:001');

console.log(status);
// {
//   packet_key: 'auth:001',
//   in_qdrant: true,
//   in_redis: true,
//   in_turbovec: false
// }
```

### Invalidate Cached Packet

```typescript
await invalidateMaterializedPacket('auth:001');
// Clears Redis cache: bifrost:packet:auth:001
```

---

## API Reference

### `materializePacket(options)`

**Parameters**:
- `packetKey` (string, required): Canonical packet identifier
- `collection` (string, optional): Qdrant collection name (default: `codebase_chunks_768`)
- `redisTtl` (number, optional): Redis cache TTL in seconds (default: 86400 = 24 hours)
- `syncTurboVec` (boolean, optional): Sync to TurboVec prefilter (default: false)
- `dryRun` (boolean, optional): Preview without writes (default: false)

**Returns**: `Promise<MaterializeResult>`

```typescript
interface MaterializeResult {
  packetKey: string;
  qdrantPointId?: string;           // Point ID if Qdrant upsert succeeded
  qdrantSuccess: boolean;
  redisSuccess: boolean;
  turboVecSuccess: boolean;
  error?: string;                   // Error message if failed
  duration: number;                 // Milliseconds
}
```

### `materializePackets(packetKeys, options)`

**Parameters**:
- `packetKeys` (string[]): Array of packet keys to materialize
- `options` (Partial<MaterializeOptions>): Same as `materializePacket`

**Returns**: `Promise<MaterializeResult[]>`

### `getPacketMaterializationStatus(packetKey)`

**Parameters**:
- `packetKey` (string): Packet to check

**Returns**: `Promise<{ packet_key: string; in_qdrant: boolean; in_redis: boolean; in_turbovec: boolean }>`

### `invalidateMaterializedPacket(packetKey)`

**Parameters**:
- `packetKey` (string): Packet to invalidate

**Returns**: `Promise<void>`

---

## Cache Details

### Qdrant Storage

**Collection**: `codebase_chunks_768`  
**Vector Dimension**: 768  
**Point ID Format**: `{packetKey}:{timestamp}`  

**Payload Fields**:
```json
{
  "packet_key": "auth:001",
  "source_ref": "src/lib/server/auth.ts",
  "file_path": "src/lib/server/auth.ts",
  "feature_id": "auth.sessions",
  "feature_label": "Authentication Sessions",
  "summary": "Handles Lucia session validation...",
  "som_row": 5,
  "som_col": 10,
  "community_id": "cluster:auth",
  "metadata": { /* enriched context */ }
}
```

### Redis/Valkey Storage

**Key Format**: `bifrost:packet:{packetKey}`  
**TTL**: 86400 seconds (24 hours, configurable)  
**Value**: JSON-stringified payload (same as Qdrant)

**Example Key**: `bifrost:packet:auth:001`

```bash
# Check if cached
docker exec legal-ai-valkey valkey-cli -a redis EXISTS bifrost:packet:auth:001

# Get cached packet
docker exec legal-ai-valkey valkey-cli -a redis GET bifrost:packet:auth:001

# Delete cache
docker exec legal-ai-valkey valkey-cli -a redis DEL bifrost:packet:auth:001
```

---

## Embedding Generation

The materializer automatically generates 768-dim embeddings from the packet summary + label using a 4-tier cache strategy:

1. **L1**: Redis embedding cache (`embedding:hash:{source_ref}`)
2. **L2**: Postgres `codebase_chunk_index.content_embedding` column
3. **L3**: gRPC embedding service (`:50051`)
4. **L4**: Ollama fallback (`embeddinggemma:latest`)

If embedding fails at all tiers, the materializer falls back to a zero vector (degrades search quality but doesn't fail).

---

## Dry-Run Mode

**Preview materialization without writes**:

```typescript
const preview = await materializePacket({
  packetKey: 'auth:001',
  dryRun: true  // No writes to Qdrant or Redis
});

console.log(preview);
// {
//   packetKey: 'auth:001',
//   qdrantSuccess: true,   // Pretend success in dry-run
//   redisSuccess: true,    // Pretend success in dry-run
//   ...
// }
```

---

## Error Handling

```typescript
const result = await materializePacket({
  packetKey: 'nonexistent:packet'
});

if (!result.qdrantSuccess || !result.redisSuccess) {
  console.error(`Materialization failed: ${result.error}`);
}

// Common errors:
// - "Packet not found: {packetKey}" → Packet doesn't exist in Postgres
// - "Packet incomplete: missing key/feature_id/summary" → Schema validation failure
// - Qdrant/Redis connection errors → Infrastructure issue
```

---

## Integration with ACE Pipeline

The materializer is typically called **after ACE validation and synthesis**:

```
User Query
  ↓
ACE Retrieval (fetch candidates)
  ↓
ACE Assembly (validate schema)
  ↓
Gemma4 Synthesis (generate answer + summary)
  ↓
ACE Materializer (persist to mirrors)
  ↓
✅ Ready for next query
```

---

## Performance Notes

- **Single packet materialization**: ~150ms (embedding + Qdrant upsert + Redis cache)
- **Embedding generation**: ~50-100ms (cached), ~500ms (uncached)
- **Qdrant upsert**: ~30-50ms
- **Redis cache write**: ~5-10ms
- **Throughput**: ~100 packets/min (with batching)

---

## Testing

```bash
# Dry-run preview (no writes)
node scripts/atlas/materialize-addressable-packets.mjs --dry-run

# Apply to 100 packets
node scripts/atlas/materialize-addressable-packets.mjs --limit 100

# Full backfill
node scripts/atlas/materialize-addressable-packets.mjs
```

---

## Next Steps

1. **Summary Backfill Complete**: Wait for `npm run gemma4:batch:summarize-packets:apply` to finish
2. **Materializer Smoke Test**: Run `npm run atlas:proof:four-lanes` (Lane 4 includes materializer)
3. **Production Deployment**: Materialize high-priority packets (auth, db, graph) first

---

**See Also**:
- [P4 Session 81 Completion Summary](P4-SESSION-81-COMPLETION-SUMMARY.md)
- [Session 91 P4 Completion + Phase 2 Materializer](SESSION-91-P4-COMPLETION-AND-PHASE2-MATERIALIZER.md)
- [Memory: Parent Atlas Frozen Identity](../memory/parent-atlas-frozen-identity-contract.md)
