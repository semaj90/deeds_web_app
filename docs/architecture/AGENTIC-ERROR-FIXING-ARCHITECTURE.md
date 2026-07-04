# Agentic Error-Fixing Architecture: Gaps Analysis & Concrete Wiring

## Current State vs Gaps

### ✅ What Exists
- Canonical envelope (Zod schema, packet_key identity, lineage)
- gRPC/Protobuf surfaces + TurboVec bridge
- Phase 8 deduplication gate (packet_key as truth)
- Memory registries (metadata only)
- Analytics/logs pipeline (RabbitMQ)

### ⏳ What's Missing
1. **Binary serialization landing zone** — gRPC/protobuf → msgpack blob store (temporary DAG-hit packets)
2. **MapReduce grouping** — error signals clustered by (task_id, packet_key, error_class, model_name)
3. **HMM error classifier** — picks failure mode from grouped evidence
4. **ACE packet swap** — replaces current packet with recovery packet for worker loop
5. **Cache-driven repair dispatch** — BitFrost hot clusters feed ACP repair queue

---

## Proposed Schema Additions (Postgres)

### 1. Error Signal Ingestion (from logs/analytics)
```sql
CREATE TABLE error_signal_stream (
  id SERIAL PRIMARY KEY,
  packet_key TEXT NOT NULL,
  task_id TEXT NOT NULL,
  error_class TEXT NOT NULL,
  model_name TEXT NOT NULL,
  evidence JSONB NOT NULL,
  ingested_at TIMESTAMP NOT NULL DEFAULT NOW(),
  INDEX ON (packet_key, task_id, error_class),
  INDEX ON (ingested_at DESC)
);
```

### 2. MapReduce Grouping Output (reduced state)
```sql
CREATE TABLE error_cluster_groups (
  id SERIAL PRIMARY KEY,
  error_class TEXT NOT NULL,
  model_name TEXT NOT NULL,
  task_id TEXT NOT NULL,
  packet_keys TEXT[] NOT NULL,
  failure_count INT NOT NULL,
  last_seen TIMESTAMP NOT NULL,
  recovery_packet_key TEXT,
  recovery_confidence REAL,
  INDEX ON (error_class, model_name, last_seen DESC)
);
```

### 3. Binary DAG-Hit Landing Zone (temporary)
```sql
CREATE TABLE dag_hit_envelope_cache (
  packet_key TEXT PRIMARY KEY,
  binary_payload BYTEA NOT NULL,
  packet_shape_hash TEXT NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMP NOT NULL,
  source TEXT NOT NULL,
  INDEX ON (expires_at)
);
```

### 4. Memory Registry Extension (metadata + blob pointer)
```sql
ALTER TABLE memory_registry ADD COLUMN IF NOT EXISTS
  dag_hit_blob_key TEXT REFERENCES dag_hit_envelope_cache(packet_key);
```

---

## Flow: Error Signal → Repair Dispatch

```
1. User Analytics / Logs
   ↓
2. Extract error signals (HMM preprocess)
   → error_signal_stream INSERT
   ↓
3. MapReduce grouping (CPU, not GPU)
   GROUP BY (error_class, model_name, task_id)
   → error_cluster_groups INSERT / UPDATE
   ↓
4. HMM classifier picks failure mode
   → error_cluster_groups.recovery_packet_key UPDATE
   ↓
5. BitFrost hot cluster cache
   bifrost:repair:{error_class}:{model_name} → recovery_packet_key
   ↓
6. ACE packet swap (runtime)
   Worker sees error → looks up repair in BitFrost → swap packet_key
   ↓
7. Repair action emission
   RabbitMQ: atlas.repair.dispatch
```

---

## Binary Serialization Bridge (gRPC → Blob Store)

### New Landing Zone

```typescript
// src/lib/server/serialization/dag-hit-envelope-persist.ts
import { db } from '$lib/server/db/client';
import { encodePacketToMsgpack } from './packet-msgpack-codec';

export async function persistDagHitEnvelope(
  packet: PacketTopologyEnvelope,
  source: 'dag_hit' | 'cache_swap' | 'repair',
  ttlSeconds: number = 300
): Promise<string> {
  const binary = encodePacketToMsgpack(packet);
  const hash = sha256(JSON.stringify(packet));
  
  await db.insert(dag_hit_envelope_cache).values({
    packet_key: packet.packet_key,
    binary_payload: binary,
    packet_shape_hash: hash,
    created_at: new Date(),
    expires_at: new Date(Date.now() + ttlSeconds * 1000),
    source
  }).onConflictDoUpdate({
    target: [dag_hit_envelope_cache.packet_key],
    set: { binary_payload: binary, expires_at: new Date(...) }
  });
  
  return packet.packet_key;
}

export async function retrieveDagHitEnvelope(
  packetKey: string
): Promise<PacketTopologyEnvelope | null> {
  const row = await db
    .select()
    .from(dag_hit_envelope_cache)
    .where(eq(dag_hit_envelope_cache.packet_key, packetKey))
    .limit(1);
  
  if (!row[0]) return null;
  
  return decodePacketFromMsgpack(row[0].binary_payload);
}
```

---

## MapReduce Job (Concrete Script)

```typescript
// scripts/atlas/agentic-error-mapreduce.mjs
// Runs every 5 minutes, groups error signals, reduces to clusters

async function mapReduceErrorSignals() {
  // MAP: Read error signals from last 5 minutes
  const signals = await pool.query(`
    SELECT packet_key, task_id, error_class, model_name, COUNT(*) as count
    FROM error_signal_stream
    WHERE ingested_at > NOW() - INTERVAL '5 minutes'
    GROUP BY packet_key, task_id, error_class, model_name
  `);

  // REDUCE: Group by (error_class, model_name, task_id)
  const clusters = new Map();
  for (const sig of signals.rows) {
    const key = `${sig.error_class}:${sig.model_name}:${sig.task_id}`;
    if (!clusters.has(key)) {
      clusters.set(key, { packet_keys: [], count: 0 });
    }
    const cluster = clusters.get(key);
    cluster.packet_keys.push(sig.packet_key);
    cluster.count += sig.count;
  }

  // WRITE: Upsert into error_cluster_groups
  for (const [key, cluster] of clusters) {
    const [error_class, model_name, task_id] = key.split(':');
    await pool.query(`
      INSERT INTO error_cluster_groups (error_class, model_name, task_id, packet_keys, failure_count, last_seen)
      VALUES ($1, $2, $3, $4, $5, NOW())
      ON CONFLICT (error_class, model_name, task_id) 
      DO UPDATE SET packet_keys = $4, failure_count = $5, last_seen = NOW()
    `, [error_class, model_name, task_id, cluster.packet_keys, cluster.count]);
  }

  // WARM BitFrost cache with repair targets
  for (const [key, cluster] of clusters) {
    const redis = getRedis();
    const cacheKey = `bifrost:repair:${key}`;
    await redis.setex(cacheKey, 300, JSON.stringify({
      packet_keys: cluster.packet_keys,
      failure_count: cluster.count,
      last_seen: new Date()
    }));
  }
}
```

---

## HMM Classifier (Error State Pick)

```typescript
// src/lib/server/analysis/hmm-error-classifier.ts

export async function classifyAndPickRecovery(
  errorClass: string,
  modelName: string,
  evidence: Record<string, unknown>
): Promise<{ recoveryPacketKey: string; confidence: number } | null> {
  // 1. Load error_cluster_groups
  const cluster = await db
    .select()
    .from(error_cluster_groups)
    .where(
      and(
        eq(error_cluster_groups.error_class, errorClass),
        eq(error_cluster_groups.model_name, modelName)
      )
    )
    .orderBy(desc(error_cluster_groups.failure_count))
    .limit(1);

  if (!cluster[0]) return null;

  // 2. HMM state transition
  const hmmTransition = computeHmmTransition(
    errorClass,
    cluster[0].packet_keys,
    evidence
  );

  // 3. Find best recovery packet
  const recoveryPacketKey = await selectRecoveryPacket(
    cluster[0].packet_keys,
    hmmTransition.likely_recovery_state
  );

  // 4. Update recovery target
  await db
    .update(error_cluster_groups)
    .set({
      recovery_packet_key: recoveryPacketKey,
      recovery_confidence: hmmTransition.confidence
    })
    .where(eq(error_cluster_groups.id, cluster[0].id));

  return { recoveryPacketKey, confidence: hmmTransition.confidence };
}

function computeHmmTransition(
  currentError: string,
  packetKeys: string[],
  evidence: Record<string, unknown>
): { likely_recovery_state: string; confidence: number } {
  const mapping: Record<string, string> = {
    timeout: 'cached_retrieval',
    oom: 'compressed_context',
    semantic_drift: 'similar_feature',
    cache_miss: 'fallback_postgres'
  };

  return {
    likely_recovery_state: mapping[currentError] || 'noop',
    confidence: 0.8
  };
}
```

---

## ACE Packet Swap (Worker Loop)

```typescript
// src/lib/server/acp/ace-packet-swap.ts

export async function swapPacketIfRecoveryAvailable(
  packet: PacketTopologyEnvelope,
  hmmClassifier: HmmClassifier
): Promise<PacketTopologyEnvelope> {
  // 1. Classify error
  const recovery = await hmmClassifier.classifyAndPickRecovery(
    packet.error_class || 'ok',
    packet.model_name,
    packet.error_evidence || {}
  );

  if (!recovery) return packet;

  // 2. Load recovery packet
  const recoveryPacket = await retrieveDagHitEnvelope(recovery.recoveryPacketKey)
    || await loadPacketFromPostgres(recovery.recoveryPacketKey);

  if (!recoveryPacket) return packet;

  // 3. Swap
  console.log(
    `[ACE Swap] ${packet.packet_key} → ${recoveryPacket.packet_key} (confidence: ${recovery.confidence})`
  );

  // 4. Emit repair action
  await emitRepairAction({
    task_id: packet.task_id || 'unknown',
    original_packet_key: packet.packet_key,
    recovery_packet_key: recoveryPacket.packet_key,
    action: 'repair'
  });

  return recoveryPacket;
}
```

---

## Key Invariants (DO NOT DO)

1. ❌ Make logs canonical — logs are evidence streams only
2. ❌ Key caches on raw log text — use (error_class, model_name, task_id)
3. ❌ Let HMM run retrieval ranking — HMM is error classification only
4. ❌ Let analytics mutate identity — packet_key is immutable
5. ❌ Join on error_class alone — always use (error_class, model_name) pair
6. ❌ Make memory registry the blob store — use dedicated dag_hit_envelope_cache table
7. ❌ Store binary payloads in JSON fields — use BYTEA blob columns

---

## Implementation Order (Sessions 104-106)

### Session 104 (Immediate)
- Create error_signal_stream, error_cluster_groups, dag_hit_envelope_cache tables
- Wire dag-hit-envelope-persist.ts with msgpack serialization
- Test protobuf ingress path (optional gRPC binary support)

### Session 105
- Implement MapReduce grouping job (agentic-error-mapreduce.mjs)
- Wire HMM error classifier (hmm-error-classifier.ts)
- Test cluster grouping on real error signals

### Session 106
- Integrate ACE packet swap into worker loop
- Wire BitFrost repair cache warmer
- End-to-end test: error signal → repair dispatch → ACE swap

---

## Files to Create/Modify

**Create:**
- `sveltekit-frontend/src/lib/server/serialization/dag-hit-envelope-persist.ts`
- `sveltekit-frontend/src/lib/server/analysis/hmm-error-classifier.ts`
- `sveltekit-frontend/src/lib/server/acp/ace-packet-swap.ts`
- `scripts/atlas/agentic-error-mapreduce.mjs`
- `scripts/atlas/warm-repair-cache.mjs`
- `sveltekit-frontend/drizzle/0NNN_error_signal_tables.sql`

**Modify:**
- `sveltekit-frontend/src/routes/api/hyperrag/packet-rpc/+server.ts` (add binary ingress)
- `sveltekit-frontend/src/lib/server/serialization/packet-msgpack-codec.ts` (wire real msgpack)
- `sveltekit-frontend/src/lib/server/acp/worker-loop.ts` (add packet swap before processing)

---

**Bottom Line**: Keep canonical identity in Postgres (packet_key, title_id, feature_id). All derived joins (error groups, repair targets, cache swaps) live in temporary tables with TTL. Binary DAG-hit envelopes have a dedicated blob store, separate from metadata registries. MapReduce groups evidence by semantic keys, HMM picks recovery mode, ACE swaps packets at runtime, BitFrost caches repair targets for instant lookup.
