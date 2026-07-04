# Canonical Packet Wiring Blueprint — Lane Separation Enforced

**Date**: July 4, 2026  
**Status**: PRODUCTION WIRING SPEC  
**Scope**: One canonical semantic packet envelope with multiple physical encodings + strict lane separation (JSON/Parse, TurboVec/ANN, Neo4j/Graph, BitFrost/Cache)

---

## Core Principle

**One canonical semantic packet envelope, multiple physical encodings. Parse, retrieval, graph, and GPU lanes are SEPARATED.**

```
JSON / NDJSON input
  → UTF-8 normalize (SIMD)
  → parse (simdjson native addon)
  → validate canonical envelope (Zod)
  → fingerprint packet_key (SHA256)
  → DuckDB MapReduce joins (identity)
  → write Postgres (canonical truth)
  ├─ mirror to Qdrant (vector)
  ├─ mirror to Neo4j (graph)
  └─ mirror to Redis (cache)
  → pack MsgPack envelope
  → mmap columnar arrays (hot routing state)
  → ACP worker loop consumes packet_key
  → HyperRAG RPC retrieves bounded set
  → ACE prompt assembly
  → Gemma4/RotorQuant (inference only, NOT storage)
```

**Hard rule**: packet_key and title_id are determined BEFORE any TurboVec/GPU/ANN work. Never let retrieval acceleration alter identity.

---

## 1. Canonical Ownership (Multiple Stores, One Truth)

| Store | Role | Authority | Rebuild Path |
|-------|------|-----------|--------------|
| **Postgres** | Canonical packet registry + identity | ✅ TRUTH | N/A (source) |
| **DuckDB** | Batch MapReduce joins (identity phase) | ✅ READ-ONLY JOINS | From Postgres |
| **MsgPack** | Compact cache envelope (transport) | ❌ MIRROR | From Postgres |
| **mmap arrays** | Open-memory routing state (hot) | ❌ MIRROR | From Postgres |
| **Protobuf/gRPC** | Typed transport boundary | ❌ TRANSPORT | From Postgres |
| **Redis BitFrost** | Hot packet/title/community cache | ❌ CACHE | From Postgres |
| **Qdrant** | Dense vector mirror (ANN acceleration) | ❌ MIRROR | From Postgres (rebuild via embeddings) |
| **Neo4j** | Graph/KAG/DAG projection (topology only) | ❌ MIRROR | From Postgres (rebuild via edges) |
| **ACP loop** | Async packet processing | ❌ CONTROLLER | Consumes packet_key from Postgres |
| **RabbitMQ** | Work queue (async notifications) | ❌ EVENT STREAM | Non-blocking, no authority |
| **SSE** | UI telemetry (browser push) | ❌ TELEMETRY | Non-blocking, no authority |
| **OpenAI facade** | Compatible request/response shell | ❌ ADAPTER | Reads from Postgres + HyperRAG |

**Rule**: Postgres write succeeds → then cache invalidation → then mirrors rebuild → then events emit. Never write cache before Postgres.

---

## 2. Lane-Separated Packet Route

### Lane A: JSON Parse → Canonical Envelope → Postgres Identity
```
1. Input: JSON / NDJSON payload (from upload, webhook, feed)
2. UTF-8 normalize (native addon)
3. SIMD JSON parse (simdjson native addon)
   ├─ Extract: source_ref, directory_path, file_path, function_symbol
   ├─ Extract: summary, embedding (if present)
   └─ Validate structure (reject malformed)
4. Zod validate (CanonicalSemanticPacketSchema)
   ├─ Hard-fail on missing: packet_key, title_id, feature_id
   ├─ Soft-warn on missing: summary, embedding
   └─ Strict mode: no extra fields
5. Fingerprint packet_key
   ├─ content_hash = SHA256(summary + source_ref)
   ├─ source_hash = SHA256(source_ref)
   ├─ envelope_hash = SHA256(canonical JSON)
   └─ Store fingerprints in Postgres
6. DuckDB MapReduce joins (identity phase, CPU only)
   ├─ Join source_ref → directory_path (immutable mapping)
   ├─ Join feature_id → feature_label (semantic grouping)
   ├─ Deduplicate by packet_key (one row per packet)
   └─ Output: canonical identity tuple (packet_key, title_id, feature_id, source_ref)
7. Write to Postgres (atomic, single INSERT or UPDATE)
   ├─ atlas_packets canonical row
   ├─ Set created_at, updated_at
   ├─ Store encoding field (json / ndjson / msgpack / protobuf)
   └─ Store canonical_version = "packet.v1"
8. Emit event: "packet.canonical.accepted"
   ├─ payload: { packet_key, title_id, feature_id }
   └─ route: RabbitMQ subject "atlas.identity.canonical"
```

**Lane A Output**: Postgres row with immutable identity (packet_key, title_id, feature_id). No GPU, no ANN, no graph work.

---

### Lane B: TurboVec/ANN → Vector Retrieval → Ranking (SEPARATE)
```
1. Input: packet_key from Postgres (from Lane A)
2. Read embedding: Postgres pgvector or Qdrant (mirror)
   ├─ 768-dim or 384-dim (project canonical)
   └─ Never parse JSON here; use existing row
3. TurboVec narrowing
   ├─ 768-dim → 64-dim transform (GPU, via tensorrt_bridge.node)
   ├─ 4-bit quantization
   └─ Output: compact latent representation
4. ANN search (optional)
   ├─ Qdrant dense vector search (top-K candidates)
   ├─ TurboVec vector similarity ranking
   └─ Filter by: community_id, som_cell_index (routing hints, not identity)
5. Rerank candidate search
   ├─ Cosine similarity on latent_64
   ├─ Top-K selection
   └─ Attach: similarity_score, authority_score (from Neo4j or Redis)
6. Emit: "packet.retrieval.ranked"
   ├─ payload: { packet_key, candidates[], scores[] }
   └─ route: "atlas.retrieval.ranked"
```

**Lane B Input**: packet_key + embedding (already stored in Postgres or Qdrant)  
**Lane B Output**: Ranked candidates (packet_key[], scores[])  
**Hard rule**: Do NOT parse JSON or decode MsgPack inside TurboVec. Read pre-parsed packets from Postgres.

---

### Lane C: Neo4j GDS → Graph Authority → Topology (SEPARATE)
```
1. Input: packet_key from Postgres (from Lane A)
2. Read graph edges
   ├─ Neo4j SIMILAR_TOPOLOGY relationships
   ├─ Neo4j USED_CONCEPT edges
   └─ Never parse JSON; use existing graph
3. PageRank compute (Neo4j GDS, cache in Redis / CouchDB)
   ├─ gds.pagerank.stream() on SIMILAR_TOPOLOGY
   ├─ TTL: 6h (stored in couchdb:pagerank_scores)
   └─ Output: authority_score per packet
4. Louvain community detection
   ├─ gds.louvain.stream()
   ├─ Assign community_id
   └─ Update atlas_packets.community_id
5. Graph neighbors (k-hop bounded)
   ├─ Cypher: MATCH (n:Packet {packet_key: $key})-[:SIMILAR_TOPOLOGY*0..2]->(m)
   ├─ Limit: k=2 hops max (prevent unbounded traversal)
   └─ Output: neighbor packet_keys
6. Emit: "packet.topology.updated"
   ├─ payload: { packet_key, community_id, neighbors[], authority_score }
   └─ route: "atlas.topology.updated"
```

**Lane C Input**: packet_key (graph vertex reference)  
**Lane C Output**: community_id, authority_score, neighbor packet_keys  
**Hard rule**: Graph work is derived state only. Do NOT write graph as source of truth for identity.

---

### Lane D: BitFrost Cache → Hot Packet Access (SEPARATE)
```
1. Input: packet_key + canonical envelope (from Lane A)
2. Pack MsgPack envelope
   ├─ Encode: packet_key, packet_ulid, title_id, feature_id, source_ref
   ├─ Encode: latent_64 (if computed), neighbors (if computed)
   ├─ Omit: full ER graphs, Qdrant payloads (too large)
   └─ Size: ~500–800 bytes per packet (vs 5KB+ JSON)
3. Write to Redis BitFrost (L1 cache)
   ├─ Key: bifrost:packet:{packet_key}
   ├─ TTL: 1 hour (configurable)
   └─ Value: MsgPack envelope
4. Write feature index (L2 cache)
   ├─ Key: bifrost:feature:{feature_id}:packets
   ├─ Value: list of packet_keys in this feature
   ├─ TTL: 1 hour
   └─ Purpose: fast feature-level retrieval
5. Write community index (L3 cache)
   ├─ Key: bifrost:community:{community_id}:packets
   ├─ Value: list of packet_keys in this community
   ├─ TTL: 1 hour
   └─ Purpose: graph-local ranking
6. Emit: "packet.cache.warmed"
   ├─ payload: { packet_key, cache_keys_written }
   └─ route: "atlas.cache.warmed"
```

**Lane D Input**: Canonical envelope from Postgres  
**Lane D Output**: Redis cache keys (hot memory for millisecond retrieval)  
**Hard rule**: Cache is optional. If miss, rebuild from Postgres. Never write cache before Postgres succeeds.

---

### Lane Integration: ACP Worker Loop
```typescript
// 1. Load canonical packet from Postgres
const packet = await db.select().from(atlas_packets)
  .where(eq(atlas_packets.packet_key, packet_key))
  .limit(1);

// Validate against canonical schema
const canonical = CanonicalSemanticPacketSchema.parse(packet);

// 2. Resolve semantic identity (Lane A complete)
const titleId = canonical.title_id;
const featureId = canonical.feature_id;
await rabbit.publish("packet.acp.accepted", { packet_key: canonical.packet_key });

// 3. Lookup manifold neighborhood (Lane B + D)
const neighborhood = await lookupMmapNeighborhood({
  somCell: canonical.som_row * 20 + canonical.som_col,
  communityId: canonical.community_id,
  featureId: canonical.feature_id,
  radius: 1
});

// 4. Retrieve candidates from HyperRAG (Lane B)
const candidates = await hyperragPacketRpc({
  packet_key: canonical.packet_key,
  title_id: canonical.title_id,
  feature_id: canonical.feature_id,
  neighborhood,
  maxCandidates: 50
});

// 5. Rank candidates (Lane B + C)
const ranked = candidates
  .map((c) => ({
    ...c,
    score: 
      0.4 * (pageRankScores[c.packet_key] ?? 0) +
      0.3 * c.similarity_score +
      0.3 * c.authority_score
  }))
  .sort((a, b) => b.score - a.score)
  .slice(0, 10);

// 6. Assemble ACE prompt
const ace = assembleAcePacket({
  packet_key: canonical.packet_key,
  title_id: canonical.title_id,
  candidates: ranked,
  context: neighborhood
});

// 7. Send to inference (never from here; only summary assembled)
await emitTraceEvent("ace.assembled", { packet_key: canonical.packet_key });

// (Gemma4 synthesis happens in OpenAI facade, NOT in ACP loop)
```

**Lane Integration**: Each lane runs independently. ACP loop orchestrates them sequentially.

---

## 3. Zod Gate: Canonical Semantic Packet Schema

```typescript
import { z } from 'zod';

// Fingerprint / transport metadata
export const PacketFingerprintSchema = z.object({
  content_hash: z.string()
    .regex(/^sha256:[a-f0-9]{64}$|^[a-f0-9]{64}$/),
  source_hash: z.string().optional(),
  envelope_hash: z.string().optional(),
  encoding: z.enum(["json", "ndjson", "msgpack", "protobuf"])
    .default("json"),
  canonical_version: z.string().default("packet.v1")
}).strict();

// Core packet identity (immutable)
export const PacketIdentitySchema = z.object({
  packet_id: z.string().uuid(),
  packet_ulid: z.string().optional(),
  packet_key: z.string()
    .regex(/^[a-f0-9]{64}$|^[a-z0-9:]{20,}/), // SHA256 or ULID
  title_id: z.string().min(1),
  feature_id: z.string().min(1),
  source_ref: z.string().min(1),
  directory_path: z.string().optional()
}).strict();

// Topology routing hints (NOT identity)
export const PacketTopologySchema = z.object({
  community_id: z.number().int().nonnegative().optional(),
  som_row: z.number().int().min(0).max(19).optional(),
  som_col: z.number().int().min(0).max(19).optional(),
  som_cell_index: z.number().int().min(0).max(399).optional(),
  som_cluster: z.string().optional(),
  kmeans_cluster_id: z.number().int().nonnegative().optional()
}).strict();

// Latent / manifold geometry
export const PacketLatentSchema = z.object({
  latent_64: z.array(z.number()).length(64).optional(),
  manifold_4d: z.object({
    x: z.number(),
    y: z.number(),
    z: z.number(),
    timestamp_unix_ms: z.number().optional(),
    timestamp_iso8601: z.string().optional()
  }).optional()
}).strict();

// Mirrors (read-only, rebuildable)
export const PacketMirrorsSchema = z.object({
  qdrant_point_id: z.string().optional(),
  neo4j_neighbors: z.array(z.string()).default([]),
  page_rank_score: z.number().nonnegative().optional()
}).strict();

// Enrichment (derived state)
export const PacketEnrichmentSchema = z.object({
  summary: z.string().optional(),
  lexical_nouns: z.array(z.string()).default([]),
  lexical_verbs: z.array(z.string()).default([]),
  lexical_adverbs_ly: z.array(z.string()).default([]),
  routing_hints: z.array(z.string()).default([]),
  used_concepts: z.array(z.string()).default([]),
  dag_hits: z.array(z.string()).default([]),
  kag_hits: z.array(z.string()).default([]),
  ace_tags: z.array(z.string()).default([])
}).strict();

// NES glyph encoding (visualization only)
export const PacketNesGlyphSchema = z.object({
  glyph_id: z.string(),
  bitmask: z.string(), // hex bitmask
  pixel_ref: z.string().optional() // e.g., "tile:16x16:0,0"
}).nullable().optional();

// Lineage (immutable append-only)
export const PacketLineageSchema = z.object({
  supersedes: z.array(z.string()).default([]),
  superseded_by: z.string().optional(),
  created_at: z.string().datetime(),
  updated_at: z.string().datetime().optional()
}).strict();

// CANONICAL SEMANTIC PACKET (composite)
export const CanonicalSemanticPacketSchema = z.object({
  ...PacketIdentitySchema.shape,
  ...PacketTopologySchema.shape,
  ...PacketLatentSchema.shape,
  ...PacketMirrorsSchema.shape,
  ...PacketEnrichmentSchema.shape,
  ...PacketLineageSchema.shape,
  fingerprint: PacketFingerprintSchema.optional(),
  nes_glyph: PacketNesGlyphSchema
}).strict();

// Validators per boundary
export function validateCanonicalEnvelope(input: unknown) {
  return CanonicalSemanticPacketSchema.parse(input);
}

export function tryValidateCanonicalEnvelope(input: unknown) {
  return CanonicalSemanticPacketSchema.safeParse(input);
}
```

---

## 4. Protobuf Shape (gRPC Transport Boundary)

```protobuf
syntax = "proto3";
package acp.packet.semantic;

message SemanticPacket {
  // Identity (immutable)
  string packet_id = 1;
  string packet_ulid = 2;
  string packet_key = 3;
  string title_id = 4;
  string feature_id = 5;
  string source_ref = 6;

  // Topology routing (NOT identity)
  int32 community_id = 10;
  uint32 som_cell_index = 11;  // row * 20 + col (0–399)
  int32 som_row = 12;
  int32 som_col = 13;
  int32 kmeans_cluster_id = 14;

  // Latent / geometry
  repeated float latent_64 = 20 [packed = true];  // 64-dim vector
  repeated uint32 neighbors = 21 [packed = true];  // CSR adjacency

  // Mirrors (read-only)
  string qdrant_point_id = 30;
  repeated string neo4j_neighbors = 31;
  float page_rank_score = 32;

  // Enrichment
  repeated string kag_hits = 33;
  repeated string dag_hits = 34;
  repeated string ace_tags = 35;

  // Transport
  bytes msgpack_envelope = 40;  // Compact MsgPack-encoded canonical packet
  string encoding = 41;  // "json" | "msgpack" | "protobuf"

  // Lineage
  int64 created_at_unix_ms = 50;
  int64 updated_at_unix_ms = 51;
}

message SemanticPacketBatch {
  repeated SemanticPacket packets = 1;
  int32 batch_id = 2;
  int64 timestamp_unix_ms = 3;
}

service SemanticPacketService {
  rpc GetPacket(GetPacketRequest) returns (SemanticPacket);
  rpc GetPacketBatch(GetPacketBatchRequest) returns (SemanticPacketBatch);
  rpc ValidateEnvelope(SemanticPacket) returns (ValidationResult);
  rpc StreamPackets(StreamPacketsRequest) returns (stream SemanticPacket);
}

message GetPacketRequest {
  string packet_key = 1;
}

message GetPacketBatchRequest {
  repeated string packet_keys = 1;
}

message StreamPacketsRequest {
  string query = 1;
  int32 chunk_size = 2;
  bool include_mirrors = 3;
}

message ValidationResult {
  bool valid = 1;
  repeated string errors = 2;
}
```

---

## 5. mmap Layout (Hot Routing State, Columnar)

**File**: `atlas_state.mmap` (binary, memory-mapped)

```
╔════════════════════════════════════════════════════════════════╗
║ mmap Columnar Layout (Linked-List Semantics, Array Speed)     ║
╚════════════════════════════════════════════════════════════════╝

Offset    Field                Type        Size/Row    Purpose
────────────────────────────────────────────────────────────────
0         epoch_counter        u64         8 bytes     Cache coherence signal
8         reserved             u64         8 bytes     Future use

Header (fixed):
16        packet_count         u32         4 bytes     N = total packets
20        som_grid_width       u16         2 bytes     20 (for 20×20)
22        som_grid_height      u16         2 bytes     20

Column 1: packet_keys (offset table + string data)
────────────────────────────────────────────────────────────────
24        key_offsets_start    u32[]       N × 4       Offset of each key string
24 + 4N   key_data_start       u8[]        variable    ULID or SHA256 hex strings

Column 2: packet_ids (row indices)
────────────────────────────────────────────────────────────────
offset    packet_ids           u32[]       N × 4       Postgres row id

Column 3: som_cell_index (routing hint)
────────────────────────────────────────────────────────────────
offset    som_cell_index       u16[]       N × 2       0–399 (0xFFFF = unassigned)

Column 4: community_id (graph label)
────────────────────────────────────────────────────────────────
offset    community_id         i32[]       N × 4       -1 = no community

Column 5: kmeans_cluster (topology label)
────────────────────────────────────────────────────────────────
offset    kmeans_cluster       i32[]       N × 4       cluster assignment

Column 6: latent_64 (vector matrix)
────────────────────────────────────────────────────────────────
offset    latent_64            f32[]       N × 64 × 4  Dense 64-dim vectors
                                           (row-major)

Column 7: neighbors CSR format (sparse adjacency)
────────────────────────────────────────────────────────────────
offset    row_offsets          u32[]       (N + 1) × 4 CSR row offsets
offset    col_indices          u32[]       variable    Adjacency indices

Column 8: pagerank_score (authority)
────────────────────────────────────────────────────────────────
offset    pagerank_score       f32[]       N × 4       Authority score

Column 9: source_ref_hash (grouping)
────────────────────────────────────────────────────────────────
offset    source_ref_hash      u32[]       N × 4       Hash of source_ref (join key)

Cache coherence:
- epoch_counter incremented after any write
- All readers check epoch before trusting cached arrays
- Redis pub/sub broadcasts epoch change: "acp:topology:epoch" → { epoch: N+1, changed_components: ['som', 'kmeans'] }
```

**Query Example**: "Get neighbors of packet i"
```typescript
function getNeighbors(packetIndex: number): Uint32Array {
  const start = mmap.row_offsets[packetIndex];
  const end = mmap.row_offsets[packetIndex + 1];
  return mmap.col_indices.slice(start, end);
}
```

**Query Example**: "Get SOM neighborhood (row, col, radius)"
```typescript
function getSomNeighborhood(row: number, col: number, radius: number): Uint32Array {
  const targetCell = row * 20 + col;
  const results: number[] = [];
  
  for (let i = 0; i < mmap.som_cell_index.length; i++) {
    const cell = mmap.som_cell_index[i];
    if (cell === 0xFFFF) continue;
    
    const r = Math.floor(cell / 20);
    const c = cell % 20;
    const distance = Math.max(Math.abs(r - row), Math.abs(c - col));
    
    if (distance <= radius) results.push(i);
  }
  
  return Uint32Array.from(results);
}
```

---

## 6. ACP Worker Loop (Canonical Order)

```typescript
import { z } from 'zod';
import { CanonicalSemanticPacketSchema } from './canonical-packet-schema';

async function acpWorkerLoop(packet: unknown) {
  // ═══════════════════════════════════════════════════════════
  // LANE A: Validate canonical envelope (JSON → Zod)
  // ═══════════════════════════════════════════════════════════
  
  let canonical: z.infer<typeof CanonicalSemanticPacketSchema>;
  try {
    canonical = CanonicalSemanticPacketSchema.parse(packet);
  } catch (err) {
    console.error(`Envelope validation failed: ${err}`);
    await rabbit.publish("packet.rejected", { reason: "envelope_invalid", packet_key: (packet as any)?.packet_key });
    return;
  }
  
  const packetKey = canonical.packet_key;
  const titleId = canonical.title_id;
  const featureId = canonical.feature_id;
  
  await rabbit.publish("packet.acp.validated", { packet_key: packetKey });

  // ═══════════════════════════════════════════════════════════
  // LANE B: Lookup manifold neighborhood (mmap + topology)
  // ═══════════════════════════════════════════════════════════
  
  const somNeighbors = lookupMmapNeighborhood({
    somCell: canonical.som_row ? canonical.som_row * 20 + canonical.som_col! : 0,
    radius: 1
  });
  
  const communityPackets = lookupMmapCommunity({
    communityId: canonical.community_id ?? -1,
    limit: 50
  });

  // ═══════════════════════════════════════════════════════════
  // LANE C: Expand candidate tuples (Neo4j neighbors)
  // ═══════════════════════════════════════════════════════════
  
  const graphNeighbors = canonical.neo4j_neighbors ?? [];
  const allCandidates = new Set<string>([
    ...somNeighbors,
    ...communityPackets,
    ...graphNeighbors
  ]);

  // ═══════════════════════════════════════════════════════════
  // LANE B+D: Retrieve candidates (HyperRAG packet RPC)
  // ═══════════════════════════════════════════════════════════
  
  const retrievedCandidates = await hyperragPacketRpc({
    packet_key: packetKey,
    title_id: titleId,
    feature_id: featureId,
    neighborhood: Array.from(allCandidates),
    maxCandidates: 50
  });
  
  if (!retrievedCandidates || retrievedCandidates.length === 0) {
    await rabbit.publish("packet.retrieval.empty", { packet_key: packetKey });
    return;
  }

  // ═══════════════════════════════════════════════════════════
  // LANE B: Rank locally (cosine similarity + authority)
  // ═══════════════════════════════════════════════════════════
  
  const ranked = retrievedCandidates
    .map((c) => {
      const pageRankScore = (pageRankCache[c.packet_key] ?? 0);
      const blend = 
        0.4 * pageRankScore +
        0.3 * (c.similarity_score ?? 0) +
        0.3 * (c.authority_score ?? 0);
      
      return { ...c, blend_score: blend };
    })
    .sort((a, b) => b.blend_score - a.blend_score)
    .slice(0, 10);
  
  await rabbit.publish("packet.retrieval.ranked", {
    packet_key: packetKey,
    ranked_keys: ranked.map((c) => c.packet_key)
  });

  // ═══════════════════════════════════════════════════════════
  // LANE D: Emit ACE context (for OpenAI facade)
  // ═══════════════════════════════════════════════════════════
  
  const aceContext = assembleAcePacket({
    packet_key: packetKey,
    title_id: titleId,
    feature_id: featureId,
    candidates: ranked,
    neighborhood: {
      som: somNeighbors,
      community: communityPackets,
      graph: graphNeighbors
    }
  });
  
  await rabbit.publish("ace.context.assembled", {
    packet_key: packetKey,
    context_id: aceContext.context_id,
    token_count: aceContext.token_count
  });
  
  // ═══════════════════════════════════════════════════════════
  // TRACE: Complete (do NOT call Gemma4 from here)
  // ═══════════════════════════════════════════════════════════
  
  console.log(`✅ ACP loop complete: ${packetKey} → ${ranked.length} candidates → ACE context ready`);
}

/**
 * Lookup helpers (use mmap, never parse JSON)
 */
function lookupMmapNeighborhood(opts: { somCell: number; radius: number }): number[] {
  const { somCell, radius } = opts;
  const results: number[] = [];
  
  const row = Math.floor(somCell / 20);
  const col = somCell % 20;
  
  for (let i = 0; i < mmap.som_cell_index.length; i++) {
    const cell = mmap.som_cell_index[i];
    if (cell === 0xFFFF) continue;
    
    const r = Math.floor(cell / 20);
    const c = cell % 20;
    const distance = Math.max(Math.abs(r - row), Math.abs(c - col));
    
    if (distance <= radius) results.push(i);
  }
  
  return results;
}

function lookupMmapCommunity(opts: { communityId: number; limit: number }): number[] {
  const { communityId, limit } = opts;
  const results: number[] = [];
  
  for (let i = 0; i < mmap.community_id.length; i++) {
    if (mmap.community_id[i] === communityId) {
      results.push(i);
      if (results.length >= limit) break;
    }
  }
  
  return results;
}

/**
 * ACE assembly (context packing, no inference)
 */
function assembleAcePacket(opts: any) {
  // Combine canonical packet + candidates + neighborhood
  // Estimate token count for Gemma4 input
  // Return structured context (NOT synthesized answer)
  
  return {
    context_id: generateId(),
    packet_key: opts.packet_key,
    title_id: opts.title_id,
    candidates: opts.candidates,
    token_count: estimateTokens(JSON.stringify(opts))
  };
}

// Export for ACP runtime
export { acpWorkerLoop };
```

**Hard Rule**: ACP loop validates, retrieves, ranks, and assembles. It does NOT call Gemma4. Inference happens in the OpenAI facade (separate boundary).

---

## 7. Hard Rules (Enforced Separation)

### Parse Lane
- ✅ JSON/NDJSON → UTF-8 normalize → SIMD parse → Zod validate
- ✅ Fingerprint packet_key (SHA256)
- ✅ DuckDB MapReduce joins (CPU, identity phase only)
- ✅ Write Postgres (canonical truth)
- ❌ Do NOT embed TurboVec, GPU, or graph work inside parse lane
- ❌ Do NOT write to Redis/Qdrant before Postgres succeeds

### TurboVec Lane
- ✅ Read pre-parsed packets from Postgres or Qdrant (embedding already exists)
- ✅ 768-dim → 64-dim latent transform (GPU via tensorrt_bridge.node)
- ✅ ANN narrowing (Qdrant top-K)
- ✅ Cosine similarity reranking
- ✅ Filter by: community_id, som_cell_index (routing hints)
- ❌ Do NOT decode MsgPack inside TurboVec
- ❌ Do NOT parse JSON inside TurboVec
- ❌ Do NOT alter identity (packet_key, title_id, feature_id are immutable inputs)
- ❌ Do NOT write to graph or cache before retrieval complete

### Graph Lane
- ✅ Read Neo4j graph (SIMILAR_TOPOLOGY, USED_CONCEPT edges)
- ✅ PageRank compute (Neo4j GDS, cache in Redis/CouchDB)
- ✅ Louvain community detection (assign community_id)
- ✅ K-hop bounded traversal (k=2 max, prevent unbounded search)
- ✅ Authority scoring (PageRank or other graph metrics)
- ❌ Do NOT alter canonical identity
- ❌ Do NOT parse JSON or MsgPack inside graph lane
- ❌ Graph state is derived; never treat it as source of truth

### Cache Lane
- ✅ Read canonical envelope from Postgres
- ✅ Pack MsgPack envelope (compact, ~500–800 bytes)
- ✅ Write to Redis BitFrost (L1 hot cache, 1-hour TTL)
- ✅ Emit cache warmed events
- ❌ Do NOT write to cache before Postgres succeeds
- ❌ Cache is optional; always rebuild from Postgres on miss
- ❌ Do NOT treat cache as source of truth

### Inference Lane (OpenAI Facade)
- ✅ Read ACE context (assembled by ACP loop, no inference yet)
- ✅ Call Gemma4/RotorQuant for synthesis only (no identity work, no retrieval)
- ✅ Return structured response (answer + metadata)
- ❌ Do NOT parse JSON or MsgPack inside inference
- ❌ Do NOT alter packet_key, title_id, or feature_id
- ❌ Inference is the LAST stage, after all other lanes complete

---

## 8. Verification Gates

### Lane A: Parse + Canonical Envelope
```bash
# Phase 7 progress (summaries being produced)
docker exec legal-ai-postgres psql -U legal_admin -d legal_ai_db -c "
SELECT COUNT(*) total,
       COUNT(*) FILTER (WHERE summary IS NOT NULL AND LENGTH(BTRIM(summary)) > 30) summarized
FROM codebase_chunk_index;"

# Clean summaries (no contamination markers)
docker exec legal-ai-postgres psql -U legal_admin -d legal_ai_db -c "
SELECT COUNT(*) contaminated
FROM codebase_chunk_index
WHERE summary LIKE '%<end_of_turn>%'
   OR summary LIKE '%<start_of_turn>%'
   OR summary LIKE '%<thinking>%';"

# Canonical packet identity
node scripts/atlas/phase8-deduplication-gate.mjs --audit
```

### Lane B: TurboVec + Retrieval
```bash
# Check for JSON parsing inside TurboVec
rg -n "JSON.parse|simdjson|decode" scripts/atlas/*turbovec* sveltekit-frontend/*turbovec*
# Should return 0 hits

# TurboVec references should only appear in retrieval lanes
rg -n "TurboVec|turbovec" scripts sveltekit-frontend | grep -v "retrieval\|vector\|rerank"
# Should have minimal hits outside retrieval context
```

### Lane C: Graph + Neo4j
```bash
# Verify k-hop bounded
rg -n "MATCH.*-\[\*\]" sveltekit-frontend/src  # unbounded match (should be rare)
rg -n "MATCH.*-\[\*0\.\." sveltekit-frontend/src  # should have bounds
```

### Lane D: Cache + BitFrost
```bash
# Check Valkey cache
docker exec legal-ai-valkey redis-cli -a redis DBSIZE
docker exec legal-ai-valkey redis-cli -a redis KEYS "bifrost:packet:*" | wc -l

# Verify cache written AFTER Postgres
rg -n "redis\|redis-cli" scripts/atlas/phase8*.mjs | grep -A5 "postgres\|db\.update"
```

### Lane Integration: ACP Loop Order
```bash
# Verify ACP worker validates before retrieval
rg -n "CanonicalSemanticPacketSchema.parse\|validateCanonical" sveltekit-frontend/src/lib/server/acp/worker.ts
# Should appear before hyperragPacketRpc call
```

---

## 9. Summary: One Canonical Packet, Four Lanes, One Truth

```
Canonical Semantic Packet
│
├─ Identity Layer (immutable, Postgres truth)
│  ├─ packet_key (SHA256)
│  ├─ title_id (semantic grouping)
│  ├─ feature_id (domain grouping)
│  └─ source_ref (file path)
│
├─ Lane A: Parse (JSON → Zod → Postgres)
│  └─ Validates canonical shape, rejects malformed
│
├─ Lane B: TurboVec (Embed → Latent → ANN)
│  └─ Retrieval acceleration (no identity change)
│
├─ Lane C: Graph (Neo4j GDS → PageRank → Louvain)
│  └─ Authority & topology (derived state only)
│
└─ Lane D: Cache (Postgres → MsgPack → Redis)
   └─ Hot memory (optional, rebuild from Postgres on miss)

Physical Encodings:
├─ JSON / NDJSON (input)
├─ MsgPack (cache envelope)
├─ mmap arrays (hot routing state)
└─ Protobuf (gRPC boundary)

Gate Order (Strict):
Postgres write → Cache invalidation → Mirrors rebuild → Events emit
            ↓
      ACP loop (orchestrate lanes)
            ↓
      HyperRAG packet RPC (bounded retrieval)
            ↓
      ACE context assembly (no inference yet)
            ↓
      OpenAI facade (Gemma4 synthesis only)
```

**Result**: One canonical packet identity, multiple physical representations, strict lane separation. Parse is isolated from GPU work. Identity is locked before any retrieval. Graph is topology-only, never identity.

