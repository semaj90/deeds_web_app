# Transport/Worker + CHROM97 Glyph Layer Alignment

**Status**: ✅ DESIGN COMPLETE | Implementation ready for Sessions 112–114  
**Date**: July 6, 2026  
**Scope**: How canonical envelopes flow through transport layers, worker queues, and CHROM97 tile rendering

---

## High-Level Architecture

```
┌──────────────────────────────────────────────────────────────┐
│ CLIENT (Browser/Terminal)                                    │
│  - QUIC/UDP for fast app transport                           │
│  - SSE for streaming progress updates                        │
│  - WebSocket for real-time dashboard updates                 │
└────────────────────┬─────────────────────────────────────────┘
                     │
┌────────────────────▼─────────────────────────────────────────┐
│ INTERNAL SERVICES (Typed via gRPC)                          │
│  - go-retrieval :8100 — RRF ranking (7 lanes)               │
│  - Gemma4 :8090 — Synthesis & HMM policy decisions          │
│  - TurboVec :8791 — Fast vector prefilter                   │
│  - Neo4j :7687 — Graph topology & PageRank                  │
└────────────────────┬─────────────────────────────────────────┘
                     │
┌────────────────────▼─────────────────────────────────────────┐
│ CANONICAL ENVELOPE VALIDATOR                                │
│  - Input: messy packets from any source                     │
│  - Normalize field names (source_ref / sourceRef / source-ref)
│  - Validate Tier 1 identity (packet_key, source_ref, feature_id)
│  - Output: CanonicalEnvelope or ValidationError             │
└────────────────────┬─────────────────────────────────────────┘
                     │
┌────────────────────▼─────────────────────────────────────────┐
│ RABBITQ WORKER QUEUES (Durable Distributed Work)            │
│  ├─ queue.packet.validate — structural validation           │
│  ├─ queue.feature.extract — ast-grep, lexical, entities     │
│  ├─ queue.embedding.encode — 384-dim embedding vectors      │
│  ├─ queue.topology.compute — SOM, K-Means, PageRank         │
│  ├─ queue.glyph.pack — bitpacking & CHROM97 tile creation   │
│  ├─ queue.qdrant.sync — mirror payload to Qdrant            │
│  ├─ queue.neo4j.sync — create/update graph edges            │
│  └─ queue.dashboard.refresh — update UI tiles               │
└────────────────────┬─────────────────────────────────────────┘
                     │
┌────────────────────▼─────────────────────────────────────────┐
│ DURABLE STORAGE (Source of Truth)                           │
│  - Postgres atlas_packets (canonical envelope JSONB)         │
│  - Postgres glyph_records (CHROM97 bitpack + display)       │
│  - Qdrant codebase_chunks_768 (vector mirror)               │
│  - Neo4j graph (topology mirror)                            │
│  - Redis (ephemeral cache, BitFrost L1/L2)                  │
└────────────────────┬─────────────────────────────────────────┘
                     │
┌────────────────────▼─────────────────────────────────────────┐
│ DASHBOARD / CARTRIDGE VIEW (CHROM97 Rendering)              │
│  - Tiles: bitpack hex → human-readable fields                │
│  - Sort/filter by authority, cluster, confidence            │
│  - Real-time updates via SSE → glyph refresh                │
│  - Search box → query RRF → update tile scores              │
└──────────────────────────────────────────────────────────────┘
```

---

## Part 1: Transport Layer Mapping

### QUIC/UDP (App Transport)
**Purpose**: Fast, low-latency application traffic  
**Use Case**: Search queries, tile clicks, dashboard interactions  
**Protocol**: HTTP/3 over QUIC (if available; fallback HTTP/2)  
**Payload**: JSON API requests/responses

```typescript
// Client → Server (query)
POST /api/retrieval/unified HTTP/3
{
  "query": "authentication session",
  "topK": 10,
  "includeSummary": true,
  "filters": { "domain_class": "authentication" }
}

// Server → Client (results)
{
  "results": [
    {
      "id": "ace:packet:auth:001",
      "combinedScore": 0.892,
      "sources": ["postgres_trigram", "som_topology"],
      "glyphTile": { "bitpack": "1A5F8C", "title": "Session Validation" }
    }
  ],
  "glyphBatch": [ /* 10 GlyphRecord JSONB objects */ ],
  "durationMs": 245
}
```

### SSE (Server-Sent Events, Browser Progress)
**Purpose**: Stream long-running operations (indexing, synthesis) to browser  
**Use Case**: Feature extraction progress, topology computation, tile updates  
**Semantics**: Browser connects once, server pushes updates

```typescript
// Browser connects
GET /api/progress/glyph-pack-batch HTTP/1.1
Accept: text/event-stream

// Server streams
event: progress
data: {"phase": "feature_extract", "processed": 1200, "total": 40754, "percent": 2.94}

event: progress
data: {"phase": "glyph_pack", "processed": 1200, "total": 40754, "percent": 2.94}

event: complete
data: {"success": true, "glyphsCreated": 1200, "durationMs": 34567}
```

### gRPC (Internal Service Calls)
**Purpose**: Type-safe, efficient internal service communication  
**Use Case**: go-retrieval ↔ Gemma4, Qdrant client calls, Neo4j queries  
**Semantics**: Stateless RPC; retries on transient failure

```protobuf
service RetrievalService {
  rpc Search(SearchRequest) returns (SearchResponse);
  rpc ValidateEnvelope(CanonicalEnvelope) returns (ValidationResult);
  rpc PackGlyph(GlyphPackRequest) returns (GlyphRecord);
  rpc RecommendTool(AgentState) returns (ToolRecommendation);
}

message SearchRequest {
  string query = 1;
  int32 topK = 2;
  repeated string filters = 3;
}

message SearchResponse {
  repeated Candidate results = 1;
  int32 durationMs = 2;
}
```

### RabbitMQ (Durable Worker Queue)
**Purpose**: Reliable, distributed, long-running work  
**Use Case**: Feature extraction, topology computation, Qdrant/Neo4j sync  
**Semantics**: At-least-once delivery; workers ack after commit

```javascript
// Publisher
await rabbitmq.publish('queue.feature.extract', {
  packet_key: 'ace:packet:auth:001',
  source_ref: 'src/lib/server/auth.ts',
  feature_id: 'auth.sessions',
  body: `function validateSession(token) { ... }`
});

// Worker (consumes, processes, commits)
await rabbitmq.consume('queue.feature.extract', async (msg) => {
  const packet = JSON.parse(msg.content);
  
  try {
    const features = await extractFeatures(packet);
    await postgres.updateAtlasPacket(packet.packet_key, { features });
    await rabbitmq.ack(msg);  // Durable commit
  } catch (err) {
    console.error(`Feature extraction failed: ${err.message}`);
    await rabbitmq.nack(msg, false, true);  // Requeue
  }
});
```

### Arrow/mmap (Batch Tensor Files)
**Purpose**: Efficient batch I/O for GPU tensor operations  
**Use Case**: Feeding large vector batches to embedding encoder, SOM, K-Means  
**Semantics**: Memory-mapped, zero-copy read access

```typescript
// Serialize 40K embeddings to Arrow
const embeddings: Float32Array[] = [...];  // 40K vectors, 384-dim each
const table = arrow.tableFromJSON(embeddings.map((e, i) => ({
  packet_id: i,
  embedding: Array.from(e)
})));
await fs.writeFile('embeddings.arrow', table.toBuffer());

// Worker reads with zero-copy
const buffer = await fs.readFile('embeddings.arrow');
const table = arrow.tableFromBuffer(buffer);
const embedding = table.getColumn(0).get(packet_id);  // Direct access
```

---

## Part 2: Canonical Envelope Validator + Normalizer

### Validation Pipeline

```typescript
export type PacketValidationResult = {
  ok: boolean;
  packet_key: string;
  source_ref: string;
  errors: string[];
  warnings: string[];
  normalized?: CanonicalEnvelope;
};

async function validateAndNormalizePacket(
  input: unknown,
  options?: { strict?: boolean }
): Promise<PacketValidationResult> {
  const errors: string[] = [];
  const warnings: string[] = [];
  
  if (!input || typeof input !== 'object') {
    return { ok: false, packet_key: '', source_ref: '', errors: ['Input is not an object'], warnings: [] };
  }

  const raw = input as Record<string, unknown>;

  // Step 1: Extract & normalize Tier 1 identity fields
  const packet_key = normalizeField(raw, 'packet_key', ['packetId', 'packet_id', 'id']);
  const source_ref = normalizeField(raw, 'source_ref', ['sourceRef', 'source-ref', 'filePath', 'file_path']);
  const feature_id = normalizeField(raw, 'feature_id', ['featureId', 'feature-id']);

  // Hard fails on identity
  if (!packet_key) errors.push('Missing packet_key');
  if (!source_ref) errors.push('Missing source_ref');
  if (!feature_id) errors.push('Missing feature_id');

  if (errors.length > 0) {
    return { ok: false, packet_key: packet_key || '', source_ref: source_ref || '', errors, warnings };
  }

  // Step 2: Extract Tier 2–4 fields (nullable but must exist)
  const tree_node_id = normalizeField(raw, 'tree_node_id', ['treeNodeId']);
  const domain_class = normalizeField(raw, 'domain_class', ['domainClass']);
  const title_id = normalizeField(raw, 'title_id', ['titleId']);
  const topolog_cluster = normalizeNumField(raw, 'topolog_cluster', ['topologyCluster', 'som_cluster']);
  const som_cluster = normalizeField(raw, 'som_cluster', ['somCluster']);
  const community_id = normalizeNumField(raw, 'community_id', ['communityId']);
  const qdrant_point_id = normalizeField(raw, 'qdrant_point_id', ['qdrantPointId']);
  const retrieval_strategy = normalizeField(raw, 'retrieval_strategy', ['retrievalStrategy']);

  // Soft warnings on missing optional fields
  if (!tree_node_id) warnings.push('Missing tree_node_id (Tier 2)');
  if (!domain_class) warnings.push('Missing domain_class (Tier 2)');
  if (!topolog_cluster) warnings.push('Missing topolog_cluster (Tier 3)');

  // Step 3: Construct normalized envelope
  const normalized: CanonicalEnvelope = {
    packet_key,
    source_ref,
    feature_id,
    tree_node_id: tree_node_id || null,
    domain_class: domain_class || null,
    title_id: title_id || null,
    topolog_cluster: topolog_cluster || null,
    som_cluster: som_cluster || null,
    community_id: community_id || null,
    qdrant_point_id: qdrant_point_id || null,
    retrieval_strategy: retrieval_strategy || null,
  };

  // Step 4: Validate against Zod schema (if strict mode)
  if (options?.strict) {
    try {
      await CanonicalPacketSchema.parseAsync(normalized);
    } catch (err) {
      errors.push(`Zod validation failed: ${err.message}`);
      return { ok: false, packet_key, source_ref, errors, warnings };
    }
  }

  return {
    ok: true,
    packet_key,
    source_ref,
    errors: [],
    warnings,
    normalized
  };
}

function normalizeField(
  obj: Record<string, unknown>,
  preferred: string,
  aliases: string[]
): string | null {
  const value = obj[preferred] ?? aliases.find(alias => alias in obj && obj[alias] !== null && obj[alias] !== undefined);
  return value ? String(value).trim() || null : null;
}

function normalizeNumField(
  obj: Record<string, unknown>,
  preferred: string,
  aliases: string[]
): number | null {
  const key = preferred in obj ? preferred : aliases.find(a => a in obj);
  if (!key) return null;
  const val = obj[key];
  const num = typeof val === 'number' ? val : parseInt(String(val), 10);
  return isNaN(num) ? null : num;
}
```

---

## Part 3: RabbitMQ Worker Queues

### Queue Definitions

| Queue | Purpose | Input | Output | Worker Type |
|-------|---------|-------|--------|------------|
| `queue.packet.validate` | Structural validation | Messy packet JSON | Valid CanonicalEnvelope or error | Synchronous |
| `queue.feature.extract` | AST/lexical analysis | Source code + packet_key | ast_symbols[], lexical_features[] | CPU (ast-grep, regex) |
| `queue.embedding.encode` | Vector embedding | Text chunk | 384-dim float32 | GPU (Ollama) |
| `queue.topology.compute` | SOM/K-Means training | 384-dim embeddings batch | topolog_cluster, community_id | GPU (PyTorch) |
| `queue.glyph.pack` | CHROM97 bitpacking | CanonicalEnvelope + features | GlyphRecord (bitpack + display) | Synchronous |
| `queue.qdrant.sync` | Vector mirror sync | GlyphRecord + embedding | Qdrant point upsert | Synchronous |
| `queue.neo4j.sync` | Graph mirror sync | CanonicalEnvelope + topology | Neo4j edges created/updated | Synchronous |
| `queue.dashboard.refresh` | UI tile updates | GlyphRecord update event | SSE broadcast to connected browsers | Async broadcast |

### Worker Implementation Pattern

```typescript
// Worker: queue.feature.extract
const channel = await rabbitmq.createChannel();
await channel.assertQueue('queue.feature.extract', { durable: true });
await channel.prefetch(1);  // Fair dispatch

await channel.consume('queue.feature.extract', async (msg) => {
  if (!msg) return;

  const packet = JSON.parse(msg.content.toString());
  console.log(`[feature-extract] Processing ${packet.packet_key}`);

  try {
    // Extract features (CPU work, no GPU)
    const astSymbols = await extractAstSymbols(packet.body);
    const lexicalFeatures = await extractLexicalFeatures(packet.body);
    const entities = await extractEntities(packet.body);

    // Write to Postgres
    await db.query(
      `UPDATE atlas_packet_features SET ast_symbols=$1, lexical_features=$2, entities=$3 WHERE packet_key=$4`,
      [astSymbols, lexicalFeatures, entities, packet.packet_key]
    );

    // Publish downstream event
    await rabbitmq.publish('queue.glyph.pack', {
      packet_key: packet.packet_key,
      feature_id: packet.feature_id,
      features: { astSymbols, lexicalFeatures, entities }
    });

    // Acknowledge durable commit
    await channel.ack(msg);
    console.log(`[feature-extract] ✅ ${packet.packet_key}`);

  } catch (err) {
    console.error(`[feature-extract] ❌ ${packet.packet_key}:`, err.message);
    
    // Requeue for retry (exponential backoff via retry count)
    const retryCount = (packet.retryCount ?? 0) + 1;
    if (retryCount < 3) {
      await rabbitmq.publish('queue.feature.extract', {
        ...packet,
        retryCount
      });
    } else {
      // Dead-letter after 3 retries
      await rabbitmq.publish('queue.dead_letter', {
        ...packet,
        error: err.message
      });
    }
    
    await channel.nack(msg, false, false);  // No requeue; we handle it above
  }
});
```

---

## Part 4: CHROM97 Glyph Layer Storage & Rendering

### Storage Schema (Corrected)

```sql
-- Layer 1: Canonical envelope (JSONB in atlas_packets)
ALTER TABLE atlas_packets ADD COLUMN IF NOT EXISTS envelope JSONB;

-- Layer 2: Feature extraction results
CREATE TABLE IF NOT EXISTS atlas_packet_features (
  packet_key TEXT PRIMARY KEY REFERENCES atlas_packets(packet_key),
  ast_symbols TEXT[],
  lexical_features TEXT[],
  entities TEXT[],
  imports TEXT[], exports TEXT[], functions TEXT[], classes TEXT[],
  domain_patterns JSONB,
  complexity_score NUMERIC(5,2)
);
CREATE INDEX IF NOT EXISTS idx_ast_symbols ON atlas_packet_features USING GIN (ast_symbols);

-- Layer 4: CHROM97 Glyph records (bitpack as BIGINT, not hex)
CREATE TABLE IF NOT EXISTS glyph_records (
  id TEXT PRIMARY KEY,
  packet_key TEXT NOT NULL UNIQUE REFERENCES atlas_packets(packet_key),
  title TEXT NOT NULL,
  label TEXT NOT NULL,
  
  bitpack BIGINT NOT NULL,          -- Raw 64-bit packed fields
  bitpack_fields JSONB NOT NULL,    -- Human-readable copy (JSON API transport)
  
  tags TEXT[] NOT NULL,
  semantic_tags TEXT[],
  glyph_version TEXT NOT NULL,
  created_at TIMESTAMP NOT NULL,
  
  -- Sortable indexes
  CONSTRAINT glyph_version_valid CHECK (glyph_version IN ('1.0', '1.1'))
);
CREATE INDEX IF NOT EXISTS idx_glyph_authority ON glyph_records
  ((CAST(bitpack_fields->>'authority' AS INT)) DESC);
CREATE INDEX IF NOT EXISTS idx_glyph_tags ON glyph_records USING GIN (tags);
```

### Bitpacking (TypeScript, Corrected)

```typescript
export interface GlyphBitpackFields {
  is_exported: 0 | 1;        // Bit 0
  is_async: 0 | 1;           // Bit 1
  complexity: 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7;  // Bits 2–4
  domain_class: number;      // Bits 5–8 (0–15, enum)
  latent_cluster: number;    // Bits 9–16 (0–255, SOM cell ID)
  authority: number;         // Bits 17–24 (0–255, scaled PageRank)
  confidence: number;        // Bits 25–32 (0–255, scaled confidence)
  freshness_days: number;    // Bits 33–40 (0–255, log-scaled age)
  // Bits 41–63 reserved for future extensions
}

export function packGlyphBits(fields: GlyphBitpackFields): bigint {
  let bits = 0n;
  
  bits |= BigInt(fields.is_exported & 1) << 0n;
  bits |= BigInt(fields.is_async & 1) << 1n;
  bits |= BigInt(fields.complexity & 7) << 2n;
  bits |= BigInt(fields.domain_class & 15) << 5n;
  bits |= BigInt(fields.latent_cluster & 255) << 9n;
  bits |= BigInt(fields.authority & 255) << 17n;
  bits |= BigInt(fields.confidence & 255) << 25n;
  bits |= BigInt(fields.freshness_days & 255) << 33n;
  
  return bits;
}

export function unpackGlyphBits(bits: bigint): GlyphBitpackFields {
  return {
    is_exported: Number((bits >> 0n) & 1n),
    is_async: Number((bits >> 1n) & 1n),
    complexity: Number((bits >> 2n) & 7n),
    domain_class: Number((bits >> 5n) & 15n),
    latent_cluster: Number((bits >> 9n) & 255n),
    authority: Number((bits >> 17n) & 255n),
    confidence: Number((bits >> 25n) & 255n),
    freshness_days: Number((bits >> 33n) & 255n),
  };
}

// JSON API transport (JS bigint safety)
export function glyphBitpackToJSON(bits: bigint): string {
  // Send as hex string for API transport
  return bits.toString(16).padStart(16, '0');
}

export function glyphBitpackFromJSON(hex: string): bigint {
  return BigInt(`0x${hex}`);
}
```

### CHROM97 Tile Rendering (Svelte 5)

```svelte
<script lang="ts">
import { unpackGlyphBits, type GlyphBitpackFields } from '$lib/server/glyph/bitpack';

interface Props {
  id: string;
  title: string;
  label: string;
  bitpackHex: string;  // "1A5F8C" from API
  tags: string[];
  selected?: boolean;
}

let { id, title, label, bitpackHex, tags, selected = false }: Props = $props();

// Unpack on demand
const fields = $derived(unpackGlyphBits(BigInt(`0x${bitpackHex}`)));

// Map complexity to NES color
const complexityColor = $derived.by(() => {
  const colors = ['#00FF00', '#00CC00', '#00AA00', '#008800', '#FFFF00', '#FF8800', '#FF0000', '#CC0000'];
  return colors[fields.complexity] || '#00FF00';
});

// Map domain class to icon
const domainIcon = $derived.by(() => {
  const icons = ['🔐', '🔍', '🤖', '📊', '⚙️', '🌐', '💾', '🎨', '📱', '🧪', '📖', '🔧', '🎯', '📈', '🚀', '🔬'];
  return icons[fields.domain_class] || '•';
});
</script>

<div
  class="glyph-tile"
  class:selected
  style="--complexity-color: {complexityColor}"
  role="button"
  tabindex="0"
>
  <!-- Title + Icon -->
  <div class="glyph-header">
    <span class="icon">{domainIcon}</span>
    <span class="title">{title}</span>
  </div>

  <!-- Metadata line -->
  <div class="glyph-meta">
    <span class="label">{label}</span>
    <span class="authority">Auth: {fields.authority}/255</span>
  </div>

  <!-- Tags -->
  <div class="glyph-tags">
    {#each tags.slice(0, 3) as tag}
      <span class="tag">{tag}</span>
    {/each}
    {#if tags.length > 3}
      <span class="tag-more">+{tags.length - 3}</span>
    {/if}
  </div>

  <!-- Status bar (confidence + freshness) -->
  <div class="glyph-status">
    <div class="bar confidence" style="width: {(fields.confidence / 255) * 100}%"></div>
    <div class="bar freshness" style="width: {(255 - fields.freshness_days) / 255 * 100}%"></div>
  </div>
</div>

<style>
.glyph-tile {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  padding: 0.75rem;
  border: 2px solid #00FF00;
  background: #001a00;
  border-radius: 2px;
  font-family: monospace;
  font-size: 0.875rem;
  transition: all 0.2s;
  cursor: pointer;
  
  --complexity-color: #00FF00;
}

.glyph-tile:hover {
  border-color: var(--complexity-color);
  background: #003300;
  box-shadow: 0 0 8px var(--complexity-color);
}

.glyph-tile.selected {
  border-color: #FF00FF;
  background: #330033;
  box-shadow: 0 0 12px #FF00FF;
}

.glyph-header {
  display: flex;
  gap: 0.5rem;
  align-items: center;
  color: #00FF00;
}

.icon {
  font-size: 1.2rem;
  width: 1.5rem;
  text-align: center;
}

.title {
  font-weight: bold;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.glyph-meta {
  display: flex;
  justify-content: space-between;
  font-size: 0.75rem;
  color: #00CC00;
}

.glyph-tags {
  display: flex;
  gap: 0.25rem;
  flex-wrap: wrap;
}

.tag {
  background: #004400;
  padding: 0.125rem 0.25rem;
  border-radius: 1px;
  font-size: 0.625rem;
  color: #00FF00;
}

.tag-more {
  color: #00CC00;
  font-size: 0.625rem;
}

.glyph-status {
  height: 0.5rem;
  display: flex;
  gap: 0.125rem;
  background: #002200;
  border-radius: 1px;
  overflow: hidden;
}

.bar {
  height: 100%;
  transition: width 0.2s;
}

.bar.confidence {
  background: #00FF00;
}

.bar.freshness {
  background: #00CCFF;
}
</style>
```

---

## Part 5: Integration Flow (End-to-End)

```
1. FILE INGESTION
   ├─ glob files, read source
   └─ publish to queue.packet.validate

2. PACKET VALIDATION
   ├─ normalize fields (source_ref / sourceRef / source-ref)
   ├─ validate Tier 1 identity (hard-fail if missing)
   ├─ validate Tier 2–4 optional fields (warnings only)
   └─ publish validated packet to queue.feature.extract

3. FEATURE EXTRACTION
   ├─ ast-grep (ast_symbols)
   ├─ regex patterns (lexical_features)
   ├─ entity extraction (EMAIL, DATE, STATUTE)
   └─ publish to queue.embedding.encode

4. EMBEDDING
   ├─ call Ollama /api/embeddings
   ├─ store 384-dim float32 in postgres
   └─ publish to queue.topology.compute

5. TOPOLOGY
   ├─ SOM training on 384-dim batch
   ├─ K-Means clustering
   ├─ PageRank computation (Neo4j)
   └─ publish to queue.glyph.pack

6. GLYPH PACKING
   ├─ pack bitfields (8 bytes)
   ├─ create GlyphRecord
   ├─ write to postgres glyph_records
   └─ publish to queue.qdrant.sync + queue.neo4j.sync

7. MIRROR SYNC
   ├─ Qdrant: upsert payload with topolog_cluster, community_id
   ├─ Neo4j: create BELONGS_TO_CLUSTER, BELONGS_TO_COMMUNITY edges
   └─ publish to queue.dashboard.refresh

8. DASHBOARD REFRESH
   ├─ SSE broadcast to connected browsers
   └─ tiles update in real-time (NES palette, authority scores)

9. RETRIEVAL
   ├─ RRF 7-lane fusion ranks candidates
   ├─ HMM policy recommends next tool
   └─ CHROM97 tiles show top results (sortable by authority, cluster, confidence)
```

---

## Summary: Transport → Worker → CHROM97

| Layer | Purpose | Protocol | Durability |
|-------|---------|----------|------------|
| **QUIC** | Fast app traffic | HTTP/3 | None (request/response) |
| **SSE** | Browser progress | HTTP/1.1 streaming | None (best-effort) |
| **gRPC** | Internal service calls | Protocol Buffers | Transient (retries) |
| **RabbitMQ** | Durable worker queue | AMQP | ✅ At-least-once (ack/nack) |
| **Arrow/mmap** | Batch tensor I/O | Binary memory-mapped | Ephemeral (temp files) |
| **Canonical Envelope** | Single source of truth | JSONB in Postgres | ✅ Transactional |
| **CHROM97 Glyph** | UI tile rendering | Bitpacked BIGINT + JSONB | Cache (derived from canonical) |

**Key Rule**: Canonical Envelope (Postgres JSONB) is the source of truth. CHROM97 is a derived display layer (bitpack + tile rendering). RabbitMQ workers transform and enrich the envelope through the pipeline.

**Status**: ✅ Design complete, ready for implementation in Sessions 112–114.
