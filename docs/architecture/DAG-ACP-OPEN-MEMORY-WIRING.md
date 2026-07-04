# DAG Agentic Workflow — Open Memory Wiring

**Date**: July 4, 2026  
**Status**: CONCRETE IMPLEMENTATION SPEC  
**Scope**: JSON → MsgPack → mmap → gRPC/Protobuf + CouchDB NDJSON mirror + Rust simdjson parse + semantic key RPC + HyperRAG/BitFrost joins for re-indexing

---

## Architectural Contract (Non-Negotiable)

```
Postgres          = canonical truth (never mutated by ACP loop)
Open Memory       = derived routing state (temporary, rebuildable)
ACP               = control loop (orchestrates, does not own data)
Manifold tuples   = search/routing metadata (not identity)
Tricubic/SOM      = local expansion accelerator (not identity)
CouchDB           = NDJSON document mirror + replay store (NOT canonical)
```

**Stable join keys (use everywhere, nothing else):**

| Key | Type | Role |
|-----|------|------|
| `packet_key` | SHA256 text | Cross-system identity |
| `packet_id` | UUID | Postgres row identity |
| `title_id` | text | Semantic grouping (immutable) |
| `feature_id` | text | Feature grouping (immutable) |
| `source_ref` | text | Lineage (immutable) |
| `som_row`, `som_col`, `som_cluster` | int/text | Topology routing labels |
| `community_id` | int | Graph community label |
| `task_id` | text | ACP loop task identity |
| `error_class` | text | HMM classification key |

Do NOT join on: raw summary text, log lines, embedding vectors, or model names alone.

---

## 1. Physical Storage Shape (Per Tier)

### Canonical Truth — Postgres
```sql
-- atlas_packets: one row per canonical packet
packet_key      TEXT PRIMARY KEY
packet_id       UUID
title_id        TEXT
feature_id      TEXT
source_ref      TEXT
som_row         INT
som_col         INT
som_cluster     TEXT
community_id    INT
kmeans_cluster  INT
latent_64       BYTEA   -- packed f32[64], not vector(64)
summary         TEXT
metadata        JSONB
```

### NDJSON Mirror — CouchDB (replay/export, not truth)
```json
{ "_id": "{packet_key}", "packet_key": "...", "title_id": "...", "feature_id": "...",
  "source_ref": "...", "som_row": 12, "som_col": 7, "community_id": 4,
  "latent_64": [...], "neighbors": [...], "summary": "...",
  "_rev": "1-abc123" }
```
- Written after every Postgres commit (async, non-blocking)
- Used for: NDJSON export, batch replay, DuckDB join input
- Never used for: canonical reads, identity joins, cache invalidation

### Compact Cache — MsgPack (BitFrost / Redis)
```
bifrost:packet:{packet_key}  → MsgPack bytes (~500-800 bytes)
bifrost:feature:{feature_id}:packets → MsgPack array of packet_keys
bifrost:repair:{error_class}:{model_name} → MsgPack repair target
```
Fields packed: identity + latent_64 + neighbors subset + som coords.  
Null fields omitted. Fixed tag enum (0–31, 1-byte overhead).

### Columnar Open Memory — mmap (local read-only)
```
Offset 0:       epoch_counter   u64   (coherence clock)
Offset 8:       packet_count    u32
Offset 12:      pad             u32
Offset 16:      packet_keys[]   string table (length-prefixed UTF-8)
Offset N:       packet_ids[]    u32   (Postgres row ref)
Offset N+4k:    som_cell_index  u16[] (row×20+col)
Offset N+8k:    community_id    i32[]
Offset N+12k:   kmeans_cluster  i32[]
Offset N+16k:   latent_64       f32[] (N×64, row-major)
Offset N+Mk:    neighbors_row_offsets u32[]  (CSR format)
Offset N+Mk+4k: neighbors_col_indices u32[]
Offset N+Mk+8k: pagerank_score  f32[]
```
Query primitives already defined:
- `getNeighbors(idx)` → CSR row slice O(degree)
- `getSomNeighborhood(row, col, radius)` → Chebyshev scan O(N)
- Cosine rerank: `latent_64[i]` dot `query_latent` O(K×64)

### Typed RPC Transport — gRPC / Protobuf
```protobuf
message SemanticPacket {
  string packet_key    = 1;
  string title_id      = 2;
  string feature_id    = 3;
  string source_ref    = 4;
  int32  som_row       = 5;
  int32  som_col       = 6;
  int32  community_id  = 7;
  repeated float latent_64 = 8 [packed=true];
  repeated string neighbors = 9;
  bytes  msgpack_envelope   = 40;  // full MsgPack blob, optional
  string encoding           = 41;  // "json" | "msgpack" | "protobuf"
  string canonical_version  = 42;  // "packet.v1"
}
```

### DAG-Hit Temporary Blob — Postgres (TTL)
```sql
dag_hit_envelope_cache (
  packet_key        TEXT PRIMARY KEY,
  binary_payload    BYTEA NOT NULL,   -- MsgPack bytes
  packet_shape_hash TEXT NOT NULL,    -- SHA256(canonical fields)
  created_at        TIMESTAMP NOT NULL DEFAULT NOW(),
  expires_at        TIMESTAMP NOT NULL,
  source            TEXT NOT NULL     -- 'dag_hit'|'cache_swap'|'repair'
)
```
TTL: 5 minutes. Evict via `DELETE WHERE expires_at < NOW()`.

---

## 2. Re-Index Flow (Concrete Steps)

```
Postgres (canonical truth)
  ↓ COPY TO STDOUT (NDJSON rows)
Rust/simdjson parser
  ↓ parse → normalize → validate canonical fields
DuckDB (batch joins, MapReduce grouping)
  ↓ GROUP BY packet_key, title_id, feature_id, source_ref, som_row, som_col
  ↓ JOIN error_cluster_groups ON packet_key
  ↓ AGGREGATE neighbors, latent_64
Emit grouped envelopes
  ├─ MsgPack blobs → Redis/BitFrost (hot envelopes)
  ├─ Protobuf bytes → gRPC / HyperRAG RPC
  ├─ NDJSON rows → CouchDB mirror (async replay store)
  ├─ mmap rebuild → columnar arrays (epoch bump on completion)
  └─ Qdrant upsert → vector mirror (from canonical embeddings)
```

**Script**: `scripts/atlas/reindex-canonical-export.mjs`  
**npm**: `npm run atlas:reindex:dry` / `npm run atlas:reindex:apply`

### Rust simdjson Parse Step

```rust
// parse-ndjson-packets/src/main.rs
use simd_json::BorrowedValue;

fn parse_packet_line(line: &mut [u8]) -> Option<PacketTuple> {
    let v = simd_json::to_borrowed_value(line).ok()?;
    Some(PacketTuple {
        packet_key:   v["packet_key"].as_str()?.to_owned(),
        title_id:     v["title_id"].as_str()?.to_owned(),
        feature_id:   v["feature_id"].as_str()?.to_owned(),
        source_ref:   v["source_ref"].as_str()?.to_owned(),
        som_row:      v["som_row"].as_i64()? as i32,
        som_col:      v["som_col"].as_i64()? as i32,
        community_id: v["community_id"].as_i64().unwrap_or(0) as i32,
    })
}
```

Hard rule: extract only semantic keys. Do NOT parse or store raw summary text in the join step.

### DuckDB MapReduce Join

```sql
-- Load NDJSON from Postgres export
CREATE OR REPLACE TABLE packets AS
SELECT * FROM read_ndjson_auto('postgres_export.ndjson');

-- Group by semantic keys, aggregate topology
CREATE OR REPLACE TABLE packet_groups AS
SELECT
  title_id,
  feature_id,
  ANY_VALUE(source_ref)     AS source_ref,
  array_agg(packet_key)     AS packet_keys,
  AVG(som_row)              AS som_row_centroid,
  AVG(som_col)              AS som_col_centroid,
  MODE(community_id)        AS dominant_community,
  COUNT(*)                  AS packet_count
FROM packets
GROUP BY title_id, feature_id;

-- Join error clusters for repair targets
CREATE OR REPLACE TABLE enriched_groups AS
SELECT g.*, e.recovery_packet_key, e.recovery_confidence
FROM packet_groups g
LEFT JOIN error_cluster_groups e
  ON e.error_class = 'default' AND e.task_id = g.title_id;
```

---

## 3. ACP Worker Loop Order (Concrete)

```typescript
async function acpWorkerLoop(rawPacket: unknown): Promise<void> {
  // ── STEP 1: Validate (Lane A — JSON parse + Zod) ──────────────────
  const envelope = validateEnvelopeForWorkerLoop(rawPacket);
  // Hard fail on missing: packet_key, title_id, feature_id, source_ref

  // ── STEP 2: Check Open Memory (BitFrost L1) ───────────────────────
  const cached = await redis.get(`bifrost:packet:${envelope.packet_key}`);
  if (cached) {
    const hot = decodeMsgpack(cached);           // ← real msgpack decode
    return emitToAce(hot, 'bitfrost_hit');
  }

  // ── STEP 3: Resolve Manifold Neighborhood (mmap, O(N) scan) ───────
  const somNeighbors = getSomNeighborhood(
    envelope.som_row ?? 0,
    envelope.som_col ?? 0,
    1                                            // radius=1 Chebyshev
  );

  // ── STEP 4: Expand Candidate Tuples (CSR adjacency + community) ───
  const graphNeighbors = getNeighbors(envelope.packet_key);
  const communityMembers = getCommunityPackets(
    envelope.community_id ?? 0,
    50                                           // bounded, no unbounded walk
  );
  const candidates = deduplicate([...somNeighbors, ...graphNeighbors, ...communityMembers]);

  // ── STEP 5: Rank Locally (cosine on latent_64, O(K×64)) ───────────
  const query_latent = envelope.latent_64 ?? new Float32Array(64);
  const ranked = rankByCosine(candidates, query_latent).slice(0, 10);

  // ── STEP 6: HMM Error Check + ACE Swap (if error signal present) ──
  const final = await swapPacketIfRecoveryAvailable(envelope, hmmClassifier);

  // ── STEP 7: Pack MsgPack + Write BitFrost ─────────────────────────
  const msgpackBytes = encodeMsgpack(final);     // ← real msgpack encode
  await redis.setex(`bifrost:packet:${final.packet_key}`, 300, msgpackBytes);

  // ── STEP 8: Emit Bounded Packet Set to ACE ────────────────────────
  await emitToAce({ packet: final, candidates: ranked }, 'acp_loop');

  // ── NO INFERENCE HERE — Gemma4 is called in OpenAI facade only ────
}
```

---

## 4. What Needs to Be Wired (Priority Order)

### Priority 1 — Binary codec (blocks everything else)
| File | Change |
|------|--------|
| `src/lib/server/serialization/packet-msgpack-codec.ts` | Replace JSON fallback with `@msgpack/msgpack` encode/decode |
| `package.json` (sveltekit-frontend) | `npm install @msgpack/msgpack` |

Minimal change:
```typescript
import { encode, decode } from '@msgpack/msgpack';

export function encodePacketToMsgpack(envelope: PacketTopologyEnvelope): Uint8Array {
  const obj: Record<number, unknown> = {};
  if (envelope.packet_key)  obj[PacketMsgpackTags.packet_key]  = envelope.packet_key;
  if (envelope.title_id)    obj[PacketMsgpackTags.title_id]    = envelope.title_id;
  if (envelope.feature_id)  obj[PacketMsgpackTags.feature_id]  = envelope.feature_id;
  if (envelope.latent_64)   obj[PacketMsgpackTags.latent_64]   = envelope.latent_64;
  if (envelope.som_row != null) obj[PacketMsgpackTags.som_row] = envelope.som_row;
  if (envelope.som_col != null) obj[PacketMsgpackTags.som_col] = envelope.som_col;
  if (envelope.community_id != null) obj[PacketMsgpackTags.community_id] = envelope.community_id;
  if (envelope.neighbors)   obj[PacketMsgpackTags.neo4j_neighbors] = envelope.neighbors;
  return encode(obj);
}

export function decodePacketFromMsgpack(bytes: Uint8Array): Record<string, unknown> {
  return decode(bytes) as Record<string, unknown>;
}
```

### Priority 2 — Schema tables (blocks MapReduce + error-fixing)
```sql
-- scripts/atlas/create-agentic-error-tables.sql
CREATE TABLE IF NOT EXISTS error_signal_stream (
  id SERIAL PRIMARY KEY,
  packet_key   TEXT NOT NULL,
  task_id      TEXT NOT NULL,
  error_class  TEXT NOT NULL,
  model_name   TEXT NOT NULL,
  evidence     JSONB NOT NULL DEFAULT '{}',
  ingested_at  TIMESTAMP NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_ess_keys ON error_signal_stream (packet_key, task_id, error_class);
CREATE INDEX IF NOT EXISTS idx_ess_time ON error_signal_stream (ingested_at DESC);

CREATE TABLE IF NOT EXISTS error_cluster_groups (
  id                   SERIAL PRIMARY KEY,
  error_class          TEXT NOT NULL,
  model_name           TEXT NOT NULL,
  task_id              TEXT NOT NULL,
  packet_keys          TEXT[] NOT NULL DEFAULT '{}',
  failure_count        INT NOT NULL DEFAULT 0,
  last_seen            TIMESTAMP NOT NULL DEFAULT NOW(),
  recovery_packet_key  TEXT,
  recovery_confidence  REAL,
  UNIQUE (error_class, model_name, task_id)
);

CREATE TABLE IF NOT EXISTS dag_hit_envelope_cache (
  packet_key        TEXT PRIMARY KEY,
  binary_payload    BYTEA NOT NULL,
  packet_shape_hash TEXT NOT NULL,
  created_at        TIMESTAMP NOT NULL DEFAULT NOW(),
  expires_at        TIMESTAMP NOT NULL,
  source            TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_dhec_expires ON dag_hit_envelope_cache (expires_at);
```

### Priority 3 — CouchDB NDJSON mirror (async replay write)
```typescript
// src/lib/server/couchdb/packet-mirror.ts
export async function mirrorPacketToCouchDb(packet: PacketTopologyEnvelope): Promise<void> {
  const doc = {
    _id: packet.packet_key,
    packet_key: packet.packet_key,
    title_id: packet.title_id,
    feature_id: packet.feature_id,
    source_ref: packet.source_ref,
    som_row: packet.som_row,
    som_col: packet.som_col,
    community_id: packet.community_id,
    latent_64: Array.from(packet.latent_64 ?? []),
    neighbors: packet.neo4j_neighbors ?? [],
    mirrored_at: new Date().toISOString()
  };
  // Fire-and-forget, non-blocking
  fetch(`${COUCHDB_URL}/packets`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(doc)
  }).catch(() => { /* mirror failure is not fatal */ });
}
```

### Priority 4 — Re-index pipeline script
```
scripts/atlas/reindex-canonical-export.mjs
  1. COPY TO STDOUT from Postgres (packet_key, title_id, feature_id, source_ref, som_row, som_col, community_id, latent_64)
  2. Pipe to Rust simdjson parser (binary, not Node)
  3. Load into DuckDB :memory:
  4. Run semantic key joins + MapReduce grouping
  5. Emit MsgPack to Redis/BitFrost
  6. Emit NDJSON to CouchDB bulk insert
  7. Rebuild mmap arrays (epoch bump)
  8. Upsert protobuf payloads to HyperRAG RPC cache
```

### Priority 5 — gRPC binary ingress (packet-rpc)
```typescript
// src/routes/api/hyperrag/packet-rpc/+server.ts
// Add content-type negotiation before request.json()
const contentType = request.headers.get('content-type') ?? '';

let rawPacket: unknown;
if (contentType.includes('application/x-protobuf')) {
  const bytes = new Uint8Array(await request.arrayBuffer());
  rawPacket = decodeProtobufPacket(bytes);
} else if (contentType.includes('application/x-msgpack')) {
  const bytes = new Uint8Array(await request.arrayBuffer());
  rawPacket = decodePacketFromMsgpack(bytes);
} else {
  rawPacket = await request.json();
}
```

---

## 5. Hard Rules (Open Memory Boundaries)

| Rule | Why |
|------|-----|
| ACP loop reads mmap/BitFrost, never writes Postgres | Postgres mutation belongs to ingestion lane only |
| CouchDB mirror is async fire-and-forget | Mirror failure must not block canonical write |
| mmap epoch must increment on every rebuild | Readers detect stale state via epoch counter |
| DuckDB joins use semantic keys only | No joins on summary text, no joins on raw log strings |
| MsgPack encode/decode must be real binary | JSON fallback breaks gRPC binary transport |
| BitFrost TTL = 300s for hot envelopes | Derived state has TTL; canonical state does not |
| dag_hit_envelope_cache expires_at = 5 min | Temporary DAG-hit blobs do not persist beyond task |
| Tricubic/SOM neighborhood is bounded | radius ≤ 2, max 50 community members, k ≤ 2 graph hops |
| Postgres never reads from CouchDB | One-way mirror: Postgres → CouchDB only |

---

## 6. Files To Create / Modify (Session 104)

| Action | File | Change |
|--------|------|--------|
| **Modify** | `sveltekit-frontend/src/lib/server/serialization/packet-msgpack-codec.ts` | Replace JSON fallback with `@msgpack/msgpack` |
| **Create** | `scripts/atlas/create-agentic-error-tables.sql` | Schema for error_signal_stream, error_cluster_groups, dag_hit_envelope_cache |
| **Create** | `scripts/atlas/reindex-canonical-export.mjs` | Full re-index pipeline (Postgres → DuckDB → MsgPack + NDJSON + mmap) |
| **Create** | `sveltekit-frontend/src/lib/server/couchdb/packet-mirror.ts` | Async NDJSON mirror write |
| **Create** | `sveltekit-frontend/src/lib/server/serialization/dag-hit-envelope-persist.ts` | Binary blob persist + retrieve |
| **Modify** | `sveltekit-frontend/src/routes/api/hyperrag/packet-rpc/+server.ts` | Add protobuf + msgpack content-type ingress |
| **Create** | `scripts/atlas/agentic-error-mapreduce.mjs` | MapReduce grouping job (5-min cadence) |
| **Create** | `sveltekit-frontend/src/lib/server/analysis/hmm-error-classifier.ts` | HMM state transition + recovery pick |
| **Create** | `sveltekit-frontend/src/lib/server/acp/ace-packet-swap.ts` | ACE swap in worker loop |
