# Pass 1 + Glyph Alignment — Packet Identity + Memory Envelope Bridge

**Date**: June 26, 2026  
**Session**: 82 (continuation)  
**Status**: Pass 1 foundation complete, alignment specification ready

---

## Core Problem Addressed

**User's Requirement** (from Session 82 feedback):

> The glyph pipeline already has GlyphRecord, tile engine, dataset generator, LoRA script, Atlas phase lanes, and ACE packet infrastructure, but the missing gap is durable storage, reward writing, training-pair assembly, LoRA versioning, and active sampling.

> **The clean mapping**:
> ```
> User / ACP path
>   ↓
> HyperRAG RPC packet
>   ↓
> packet_key + source_ref + feature_id
>   ↓
> Postgres atlas_packets truth
>   ↓
> glyph_records derived memory
>   ↓
> Redis BitFrost hot keys
>   ↓
> Qdrant vector mirror
>   ↓
> SOM / centroid / cluster_id
>   ↓
> training JSONL / LoRA / adapter registry
> ```

---

## Solution: AtlasMemoryEnvelope

Created `packages/atlas-core/src/types/index.ts` with canonical envelope that flows through ALL lanes:

### Type Definition

```typescript
export interface AtlasMemoryEnvelope {
  trace_id: string;              // Runtime loop ID
  packet_key: string;             // Canonical packet identity
  source_ref: string;             // Source file/location
  feature_id: string;             // Feature lane
  glyph_id?: string;              // Compressed symbolic memory row
  centroid_id?: number;           // Semantic cluster
  som_cluster?: number;           // Topology cluster
  batch_id?: string;              // Training batch
  payload_kind: "packet" | "glyph" | "reward" | "training_pair";
  payload_encoding: "json" | "msgpack" | "hex";
  payload: unknown;               // Actual data
  timestamp?: number;             // Milliseconds since epoch
}
```

### Bridge: GlyphRecord Schema

```typescript
export interface GlyphRecord {
  glyph_id: string;              // Primary key
  packet_key: string;            // Foreign key → atlas_packets
  source_ref: string;            // Foreign key → atlas_source_refs
  feature_id: string;            // Foreign key → atlas_feature_labels
  trace_id: string;              // Last update trace
  qdrant_point_id?: string;      // Vector DB reference
  centroid_id?: number;          // Semantic cluster
  som_cluster?: number;          // Topology cluster
  batch_id?: string;             // Training batch
  grpo_reward_score?: number;    // Reward signal
  confidence: number;            // Encoding confidence
  created_at: number;            // Timestamp
  updated_at: number;            // Timestamp
}
```

---

## How Each Lane Uses the Envelope

### Lane 1: User Query → RPC Packet

**Flow**:
```
1. User types query
2. ACP creates trace_id (UUID)
3. HyperRAG RPC builds AtlasMemoryEnvelope:
   {
     trace_id: "550e8400-e29b-41d4-a716-446655440000",
     packet_key: "ace:packet:auth:001",
     source_ref: "src/lib/server/auth.ts",
     feature_id: "auth.sessions",
     payload_kind: "packet",
     payload_encoding: "json",
     payload: { /* full packet content */ }
   }
4. Envelope sent to Postgres → Redis → Qdrant → Neo4j
```

**Canonical Check**:
```typescript
// Verify packet triple (HARD REQUIREMENT)
const verified = verifyPacketTriple(
  envelope.packet_key,
  envelope.source_ref,
  envelope.feature_id,
  fromPostgres // atlas_packets row
);
if (!verified) throw new Error('Packet identity mismatch');
```

### Lane 2: Packet → Glyph Record

**Flow**:
```
1. Postgres atlas_packets row exists (truth)
2. GlyphRecord created/updated:
   {
     glyph_id: "glyph:550e8400-e29b-41d4-a716-446655440000:001",
     packet_key: "ace:packet:auth:001",  // ← JOIN KEY
     source_ref: "src/lib/server/auth.ts",
     feature_id: "auth.sessions",
     trace_id: "550e8400-e29b-41d4-a716-446655440000",
     qdrant_point_id: "qdrant:auth:001",
     centroid_id: 42,
     som_cluster: 15,
     batch_id: "batch:2026-06-26:batch-001",
     grpo_reward_score: 0.87,
     confidence: 0.95,
     created_at: 1719428400000,
     updated_at: 1719428400000
   }
3. Written to Postgres glyph_records table
```

**Hard Constraints**:
- ✅ `glyph_records.packet_key` NOT NULL (foreign key)
- ✅ `glyph_records.source_ref + feature_id` match `atlas_packets` row
- ✅ Every write updates `trace_id` (audit trail)
- ✅ No `glyph_id` without `packet_key`

### Lane 3: Glyph → BitFrost Cache Keys

**Flow**:
```
1. After glyph_records write, populate Redis:
   {
     bitfrost:packet:{packet_key}
       → { packet_key, source_ref, feature_id, qdrant_point_id, som_cluster }
     bitfrost:glyph:{glyph_id}
       → { glyph_id, centroid_id, som_cluster, grpo_reward_score }
     bitfrost:centroid:{centroid_id}
       → { centroid: [768-dim vector], som_cluster, members: [...] }
     bitfrost:som:{som_cluster}
       → { cluster_id, grid_x, grid_y, centroid_id, members: [...] }
     bitfrost:batch:{batch_id}
       → { batch_id, packets: [...], status, training_pairs_count }
   }
2. All keys carry the trace_id for logging
3. TTL: 24h for hot lookups
```

**No Embedding Vectors in BitFrost**:
- ✅ Store `centroid_id` (foreign key)
- ✅ Fetch full vector from Qdrant on demand
- ✅ Saves VRAM, prevents stale vectors

### Lane 4: SOM + GPU Processing

**Flow**:
```
1. Read bitfrost:som:{som_cluster}
   → { centroid_id, members: [packet_key, ...] }
2. Fetch Qdrant vectors for members
3. GPU:
   - Cosine similarity (scoreAttention)
   - Reranking (cosineSimilarity)
   - Reward scoring (GRPO)
   - Autoencoder (768→64 latent)
4. Write results back to glyph_records:
   { 
     grpo_reward_score: [GPU output],
     updated_at: now()
   }
```

**Key Contract**:
- GPU reads from Qdrant (vector DB)
- GPU writes reward_score to Postgres
- Postgres write triggers Redis invalidation
- No GPU writes directly to Redis or Qdrant

### Lane 5: Training Pipeline

**Flow**:
```
1. Read glyph_records WHERE batch_id = 'batch:2026-06-26:batch-001'
2. For each glyph:
   {
     "trace_id": "550e8400-e29b-41d4-a716-446655440000",
     "packet_key": "ace:packet:auth:001",
     "source_ref": "src/lib/server/auth.ts",
     "feature_id": "auth.sessions",
     "glyph_id": "glyph:550e8400-e29b-41d4-a716-446655440000:001",
     "centroid_id": 42,
     "som_cluster": 15,
     "grpo_reward": 0.87,
     "latent_64": [float32 × 64],  // NOT full 768-dim
     "batch_id": "batch:2026-06-26:batch-001"
   }
3. Write to JSONL training file
4. LoRA training reads JSONL
5. LoRA adapter saved with version:
   - adapter:glyph:2026-06-26:v001 (Postgres adapter_registry)
   - Metadata: batch_id, packet_count, reward_avg
```

**JSONL Rules**:
- ✅ One line per training pair
- ✅ Include trace_id for traceability
- ✅ Include packet_key for validation
- ✅ Use centroid_id (not full vector)
- ✅ Use latent_64 (not 768-dim)
- ✅ NO embedding768 (too large, breaks streaming)

---

## Postgres Schema Additions (Deferred, but Specify Now)

### New Tables Needed

**1. glyph_records** (derives atlas_packets)
```sql
CREATE TABLE glyph_records (
  glyph_id TEXT PRIMARY KEY,
  packet_key TEXT NOT NULL REFERENCES atlas_packets(packet_key),
  source_ref TEXT NOT NULL,
  feature_id TEXT NOT NULL,
  trace_id UUID NOT NULL,
  qdrant_point_id TEXT,
  centroid_id INT,
  som_cluster INT,
  batch_id TEXT,
  grpo_reward_score REAL,
  confidence REAL,
  created_at BIGINT NOT NULL,
  updated_at BIGINT NOT NULL,
  
  UNIQUE(packet_key, batch_id),
  FOREIGN KEY(source_ref, feature_id) REFERENCES atlas_packets(source_ref, feature_id)
);
```

**2. adapter_registry** (LoRA versions)
```sql
CREATE TABLE adapter_registry (
  adapter_id TEXT PRIMARY KEY,
  adapter_kind TEXT,  -- 'lora' | 'qlora' | 'prefix'
  version TEXT,       -- '2026-06-26:v001'
  batch_id TEXT,
  packet_count INT,
  reward_avg REAL,
  training_pair_count INT,
  ckpt_path TEXT,
  created_at BIGINT,
  metadata JSONB
);
```

**3. training_pair_log** (audit trail)
```sql
CREATE TABLE training_pair_log (
  id BIGSERIAL PRIMARY KEY,
  trace_id UUID,
  glyph_id TEXT,
  packet_key TEXT,
  batch_id TEXT,
  reward_score REAL,
  used_in_training BOOLEAN,
  created_at BIGINT
);
```

### Join Rules

**Verify Glyph→Packet Alignment**:
```sql
SELECT 
  g.glyph_id,
  g.packet_key,
  p.source_ref,
  p.feature_id,
  CASE 
    WHEN g.source_ref = p.source_ref AND g.feature_id = p.feature_id THEN 'OK'
    ELSE 'MISMATCH' 
  END as alignment
FROM glyph_records g
JOIN atlas_packets p ON g.packet_key = p.packet_key
WHERE g.batch_id = 'batch:2026-06-26:batch-001';
```

---

## Validation Gates (Pass 1 → Pass 2)

**Gate 1: Canonical Identity**
- ✅ `packages/atlas-core/src/packet/identity.ts` created
- ✅ Exports: `PacketIdentity`, `PacketKey`, `SourceRef`, `FeatureId`
- ✅ Helpers: extract, validate, merge, branded type creators

**Gate 2: Memory Envelope**
- ✅ `packages/atlas-core/src/types/index.ts` created
- ✅ `AtlasMemoryEnvelope` schema complete
- ✅ `GlyphRecord` schema with foreign keys
- ✅ Helpers: `verifyPacketTriple()`, `bitfrostKey()`, `createMemoryEnvelope()`

**Gate 3: No Duplicate Packet Identity**
- ✅ Audit found 4 duplicates in 2 files
- ⏳ Consolidation deferred (atlas-core not yet in build system)
- ⏳ Note added to both files pointing to canonical location

**Gate 4: BitFrost Keying Convention**
- ✅ Unified `bitfrost:` prefix pattern
- ✅ All keys include immutable identifiers (packet_key, glyph_id, etc.)
- ✅ No stale vectors in cache (use centroid_id instead)

**Gate 5: Glyph→Packet Join Integrity**
- ⏳ Await glyph_records table creation
- ⏳ Add foreign key: `glyph_records(packet_key) → atlas_packets(packet_key)`
- ⏳ Add uniqueness: `UNIQUE(packet_key, batch_id)`

---

## Next Steps (Sessions 83+)

### Immediate (Session 83)

1. **Wire atlas-core into build system**
   - Add npm workspaces to root package.json
   - Update sveltekit-frontend to depend on `@deeds/atlas-core`
   - Merge PacketIdentity from packet-metadata-v1.ts → canonical

2. **Create glyph_records table**
   - Migration: `drizzle/manual/0048_glyph_records.sql`
   - Drizzle schema: `src/lib/server/db/schema/glyph-records.ts`

3. **Wire AtlasMemoryEnvelope into HyperRAG RPC**
   - Update `hyperrag-rpc-client.ts` to emit envelopes
   - Add validation gate: `verifyPacketTriple()`
   - Test: envelope flows through Postgres→Redis→Qdrant

### Phase 2 (Session 84)

1. **Connect Glyph Ingestion to Packet Registry**
   - Read from `atlas_packets`
   - Write to `glyph_records`
   - Populate BitFrost keys

2. **GPU Reward Scoring**
   - Read SOM clusters from Redis
   - Compute GRPO reward
   - Write back to `glyph_records.grpo_reward_score`

3. **Training Pair Assembly**
   - Export `glyph_records` → JSONL
   - Validate JSONL structure (no full 768-dim vectors)
   - Verify batch_id alignment

### Phase 3 (Session 85)

1. **LoRA Adapter Registry**
   - Create `adapter_registry` table
   - Version scheme: `adapter:glyph:YYYY-MM-DD:vNNN`
   - Checkpoint persistence

2. **Active Learning Sampler**
   - Query `glyph_records` by uncertainty
   - Fetch high-uncertainty glyphs
   - Prioritize for retraining

---

## Key Rules Going Forward

1. **Postgres is truth** — all derived tables (glyph_records, adapter_registry) are mirrors
2. **No feature_id-only joins** — always packet_key + source_ref
3. **Envelope serialization** — JSON for RPC, msgpack for RabbitMQ, hex for compact glyph ID
4. **No embedding vectors in BitFrost** — use centroid_id (foreign key)
5. **Audit trail** — trace_id on every envelope, written to glyph_records
6. **Immutable spine** — packet_key + source_ref + feature_id never change after creation

---

## Files Created This Session (Pass 1)

| File | Status | Purpose |
|------|--------|---------|
| `packages/atlas-core/src/packet/identity.ts` | ✅ | Canonical packet identity + branded types |
| `packages/atlas-core/src/packet/index.ts` | ✅ | Packet module barrel export |
| `packages/atlas-core/src/types/index.ts` | ✅ | Memory envelope + glyph record schemas |
| `packages/atlas-core/src/index.ts` | ✅ | Root barrel export |
| `scripts/atlas/pass1-audit-packet-identities.mjs` | ✅ | Audit for duplicate definitions |
| `docs/CONSOLIDATION-PASS-1-AUDIT.md` | ✅ | Consolidation strategy + timeline |
| `docs/PASS-1-ALIGNMENT-GLYPH-PACKETS.md` | ✅ | This file: glyph alignment blueprint |

---

**Status**: Foundation complete, ready for integration.  
**Next**: Wire atlas-core into build system (Session 83).
