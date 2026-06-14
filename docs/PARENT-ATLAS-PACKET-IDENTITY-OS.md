# Parent Atlas: Packet Identity Operating System

**Status**: Architecture Contract Locked  
**Date**: June 14, 2026  
**Scope**: UTF-8 ingestion → packet identity → JSONB metadata → embeddings → 4D topology → retrieval

---

## Core Pipeline

```
User Prompt / SVG / UTF-8 Document
  ↓
ACE Packet Reader (normalize UTF-8)
  ↓
Extract Glyphs / Text / Tree Nodes
  ↓
Packet Identity (packet_key + source_ref)
  ↓
JSONB Metadata Envelope
  ↓
Embeddings / Latent64 / SOM
  ↓
Qdrant Tags + Vectors
  ↓
Redis/Bifrost Hot Cache
  ↓
DuckDB Offline Joins
  ↓
Neo4j Bounded Topology
  ↓
Gemma4 Synthesis / Tool Calls
```

## Tier 0 Canonical Identity

This is the frozen packet contract.

- `packet_key` never changes.
- `source_ref` stays canonical provenance.
- `feature_id` may be enriched, but not reassigned as a new identity.
- `feature_label` is human-readable ownership, not a substitute key.
- `metadata` may grow.
- `file_path` and `file_url` are location hints.
- `community_id` is a derived grouping field.
- `lineage_version` and `ledger_type` belong to the stable envelope.

Do not invent new packet fields until the derived tables exist and the live contract needs them.

---

## Storage Layer Contract

### What Gets Encoded

**STORE IN JSONB (Postgres, GIN-indexed)**:
- Searchable metadata
- Tags, ontology, domain
- Lineage, provenance
- Decision paths
- Error traces
- Summary text (bounded)

**DO NOT STORE IN JSONB**:
- Attention heads
- Hidden states
- Chain-of-thought thinking
- Raw embeddings (use Qdrant vectors)
- Large binary tensors (use MinIO)

**Observable Artifacts Only**:
- Prompt (user input)
- Tool call (action taken)
- Retrieved packet IDs
- Summary (human-readable)
- Scores (ranking metrics)
- Reward (quality signal)
- Errors (what failed)
- Decision path (breadcrumb trail)

---

## Schema: Atlas Tables

### 1. atlas_packets (Core Identity)

```sql
CREATE TABLE atlas_packets (
  -- Identity (immutable)
  packet_key TEXT PRIMARY KEY,
  source_ref TEXT NOT NULL UNIQUE,
  file_path TEXT,
  
  -- Classification
  feature_id TEXT,
  feature_label TEXT,
  group_id TEXT,
  packet_universe TEXT DEFAULT 'atlas',
  
  -- Topology
  page_index_path TEXT,
  som_cluster TEXT,
  community_id TEXT,
  kmeans_cluster INTEGER,
  
  -- Ranking
  karpathy_blend DOUBLE PRECISION,
  authority_score DOUBLE PRECISION,
  reward_prior DOUBLE PRECISION,
  
  -- Metadata (JSONB, GIN-indexed)
  metadata JSONB DEFAULT '{}',
  
  -- Lifecycle
  created_at TIMESTAMP,
  updated_at TIMESTAMP,
  
  -- Indexes
  INDEX idx_packet_key (packet_key),
  INDEX idx_source_ref (source_ref),
  INDEX idx_feature_id (feature_id),
  INDEX idx_file_path (file_path),
  INDEX idx_som_cluster (som_cluster),
  INDEX idx_community_id (community_id),
  INDEX idx_metadata_gin (metadata) USING gin,
  INDEX idx_metadata_tags ((metadata->'tags')) USING gin,
  INDEX idx_metadata_ontology ((metadata->'ontology')) USING gin
);
```

### 2. atlas_tree_nodes (PageIndex Hierarchy)

```sql
CREATE TABLE atlas_tree_nodes (
  -- Identity
  node_id TEXT PRIMARY KEY,
  parent_id TEXT,
  root_id TEXT,
  
  -- Classification
  node_type TEXT, -- 'directory' | 'file' | 'section' | 'chunk'
  title TEXT,
  
  -- References
  source_ref TEXT,
  file_path TEXT,
  file_url TEXT,
  page_index_path TEXT,
  
  -- Linkage
  packet_key TEXT REFERENCES atlas_packets(packet_key),
  feature_id TEXT,
  feature_label TEXT,
  
  -- Content (text-safe only)
  text TEXT,
  summary TEXT,
  
  -- Metadata
  metadata JSONB DEFAULT '{}',
  
  -- Lifecycle
  created_at TIMESTAMP,
  updated_at TIMESTAMP,
  
  -- Indexes
  INDEX idx_node_id (node_id),
  INDEX idx_parent_id (parent_id),
  INDEX idx_root_id (root_id),
  INDEX idx_packet_key (packet_key),
  INDEX idx_source_ref (source_ref),
  INDEX idx_feature_id (feature_id),
  INDEX idx_page_index_path (page_index_path),
  CONSTRAINT fk_parent CHECK (parent_id IS NULL OR EXISTS (SELECT 1 FROM atlas_tree_nodes WHERE node_id = parent_id))
);
```

### 3. atlas_tree_edges (Hierarchy Relationships)

```sql
CREATE TABLE atlas_tree_edges (
  source_id TEXT NOT NULL,
  target_id TEXT NOT NULL,
  edge_type TEXT, -- 'CONTAINS' | 'NEXT' | 'PARENT_OF'
  weight DOUBLE PRECISION DEFAULT 1.0,
  created_at TIMESTAMP,
  
  PRIMARY KEY (source_id, target_id, edge_type),
  FOREIGN KEY (source_id) REFERENCES atlas_tree_nodes(node_id),
  FOREIGN KEY (target_id) REFERENCES atlas_tree_nodes(node_id),
  INDEX idx_source (source_id),
  INDEX idx_target (target_id)
);
```

### 4. atlas_glyph_records (UTF-8 / SVG / Glyphs)

```sql
CREATE TABLE atlas_glyph_records (
  glyph_id TEXT PRIMARY KEY,
  
  -- Content encoding
  svg_text TEXT,
  utf8_text TEXT,
  unicode_codepoints TEXT,
  
  -- References
  source_ref TEXT,
  packet_key TEXT REFERENCES atlas_packets(packet_key),
  feature_id TEXT,
  node_id TEXT REFERENCES atlas_tree_nodes(node_id),
  
  -- Position
  x_page INTEGER,
  y_page INTEGER,
  width INTEGER,
  height INTEGER,
  
  -- Classification
  glyph_type TEXT, -- 'text' | 'symbol' | 'icon' | 'diagram'
  language TEXT DEFAULT 'en',
  
  -- Metadata
  metadata JSONB DEFAULT '{}',
  
  created_at TIMESTAMP,
  INDEX idx_packet_key (packet_key),
  INDEX idx_source_ref (source_ref),
  INDEX idx_feature_id (feature_id),
  INDEX idx_node_id (node_id)
);
```

### 5. atlas_topology_index (4D Coordinates)

```sql
CREATE TABLE atlas_topology_index (
  packet_key TEXT PRIMARY KEY,
  
  -- 4D coordinates
  x_cosine DOUBLE PRECISION,        -- Dense semantic (Qdrant cosine)
  y_graph DOUBLE PRECISION,          -- Graph distance (Neo4j hops)
  z_som DOUBLE PRECISION,            -- SOM/topology grid position
  w_authority DOUBLE PRECISION,      -- Karpathy authority score
  
  -- SOM details
  som_row INTEGER,
  som_col INTEGER,
  som_cluster TEXT,
  community_id TEXT,
  
  -- References
  feature_id TEXT,
  source_ref TEXT,
  
  updated_at TIMESTAMP,
  INDEX idx_packet_key (packet_key),
  INDEX idx_som_cluster (som_cluster),
  INDEX idx_x_cosine (x_cosine),
  INDEX idx_w_authority (w_authority),
  FOREIGN KEY (packet_key) REFERENCES atlas_packets(packet_key)
);
```

### 6. atlas_summary_layers (Hierarchical Summaries)

```sql
CREATE TABLE atlas_summary_layers (
  packet_key TEXT,
  layer_type TEXT, -- 'chunk' | 'file' | 'folder' | 'feature' | 'system'
  
  summary TEXT,
  keywords TEXT[],
  entities TEXT[],
  
  embedding_model TEXT DEFAULT 'embeddinggemma:latest',
  vector_dim INTEGER DEFAULT 768,
  
  created_at TIMESTAMP,
  
  PRIMARY KEY (packet_key, layer_type),
  FOREIGN KEY (packet_key) REFERENCES atlas_packets(packet_key),
  INDEX idx_layer_type (layer_type)
);
```

---

## Qdrant Collections Contract

### Collections (6 total, 768-dim)

```
codebase_chunks_768      → text chunks + metadata
tree_nodes_768           → page-index nodes
feature_cards_768        → feature summaries
summaries_768            → layer summaries (chunk/file/folder/feature/system)
memory_cards_768         → agent episodic memory
glyphs_768               → glyph vectors (SVG/UTF-8)
```

### Canonical Payload Schema

Every point in all collections must have:

```json
{
  "packet_key": "ace:packet:auth:001",
  "source_ref": "src/lib/server/auth.ts",
  "node_id": "node:abc123",
  "parent_id": "node:parent456",
  "root_id": "node:root789",
  "file_path": "src/lib/server/auth.ts",
  "file_url": "vscode://file/...",
  "feature_id": "auth.sessions",
  "feature_label": "Authentication Sessions",
  "keywords": ["session", "lucia", "auth"],
  "tags": ["infrastructure", "security"],
  "ontology": ["system.auth", "feature.sessions"],
  "domain": "infrastructure.security",
  "som_cluster": "cluster:5:12",
  "community_id": "legal:auth",
  
  "x_cosine": 0.85,
  "y_graph": 2.5,
  "z_som": 0.45,
  "w_authority": 0.687,
  
  "ledger_type": "atlas",
  "lineage_version": 1,
  "metadata": {
    "identity": {...},
    "topology": {...},
    "ranking": {...},
    "provenance": {...}
  }
}
```

### Strict Rules

- ✅ JSONB for searchable metadata
- ✅ Qdrant for vectors + tags
- ❌ No raw embeddings in JSONB
- ❌ No hidden states
- ❌ No attention heads

---

## Storage by Purpose

| Purpose | Storage | Format | Indexed | TTL |
|---------|---------|--------|---------|-----|
| Searchable metadata | Postgres JSONB | JSON | GIN | Persistent |
| Vectors + similarity | Qdrant | float32[768] | HNSW | Persistent |
| Hot cache | Redis | JSON | Hash/Sorted | 24h |
| Cold raw blobs | MinIO | Binary | Path | 90d |
| IPC between sidecars | gRPC/Protobuf | Protobuf | - | Transient |
| Offline analytics | DuckDB | Parquet | B-tree | Session |
| Graph topology | Neo4j | Cypher nodes/edges | Index | Persistent |

---

## UTF-8 / Glyph / SVG Handling

### Glyph Lane

Extract from documents:
- SVG elements (vector graphics)
- Unicode codepoints (text rendering)
- Glyph boundaries (position + size)

Store in `atlas_glyph_records`:
```
svg_text        → <svg>...</svg> XML
utf8_text       → "Hello"
unicode_codepoints → [0x0048, 0x0065, ...]
glyph_id        → deterministic hash
coordinates     → (x, y, width, height)
```

### Rendering

- **Text**: Use UTF-8 directly (browser native)
- **SVG**: Embed in Qdrant payload, render in UI
- **Glyphs**: Position + metadata for precise layout in 3D/WebGL

---

## Binary / Tensor Lane

### Model Artifacts (`.pt`, `.safetensors`, `.gguf`)

**Storage**:
- Raw binary → MinIO (cold blob store)
- Metadata → JSONB (checkpoint version, hash, provenance)

**Do NOT store in JSONB**:
- Tensor data
- Attention weights
- Hidden states

**Metadata example**:
```json
{
  "model_artifact": {
    "checkpoint_type": "gemma4-rotorquant",
    "hash": "sha256:abc123",
    "size_bytes": 5_300_000_000,
    "location": "minio://models/gemma4-legal-iq4xs.gguf",
    "loaded_at": "2026-06-14T...",
    "version": 1
  }
}
```

### IPC Between Sidecars

Use Protocol Buffers or MessagePack:
- Fast serialization for gRPC
- No Postgres roundtrip
- Ephemeral (not persisted)

---

## Ingestion Queue

### RabbitMQ / BullMQ Pipeline

```
ingest.raw
  ↓ (normalize UTF-8, detect encoding)
normalize.utf8
  ↓ (extract tree, glyphs, sections)
extract.tree
  ↓ (extract glyph SVG/codepoints)
extract.glyphs
  ↓ (Gemma4 summarize each layer)
summarize.gemma4
  ↓ (embed summaries → Qdrant)
embed.qdrant
  ↓ (write to Redis cache)
cache.redis
  ↓ (load into DuckDB for offline joins)
index.duckdb
  ↓ (graph relationships to Neo4j)
graph.neo4j
  ↓
Complete
```

### Parallel Lanes (Independent)

- **Lane A**: Text extraction → summarization → embedding
- **Lane B**: Glyph extraction → SVG storage → positioning
- **Lane C**: Tree structure → parent linkage → hierarchy validation

---

## 4D Topology: Coordinates

Store in `atlas_topology_index`:

```
x = x_cosine
    Qdrant cosine similarity to query
    Range: [0, 1]
    Meaning: semantic relevance

y = y_graph
    Neo4j hop distance from root
    Range: [0, ∞)
    Meaning: graph distance

z = z_som
    SOM grid position (normalized)
    Range: [0, 1]
    Meaning: topological cluster

w = w_authority
    Karpathy authority score
    Range: [0, 1]
    Meaning: ranking importance
```

### Usage in Retrieval

```
Query vector
  ↓ (Qdrant ANN)
Get top-100 by x_cosine
  ↓ (Neo4j bounded expansion)
Expand to top-150 by y_graph
  ↓ (SOM neighborhood filter)
Filter by z_som neighborhood
  ↓ (Karpathy rerank)
Sort by w_authority
  ↓ (top-20 final results)
Return packets
```

---

## Tool Calling (MCP Surface)

Read/write packets, not raw state:

**Read Tools**:
- `atlas_packet_read(packet_key)` → packet metadata + vectors
- `atlas_tree_search(query)` → find nodes by title/path
- `atlas_qdrant_search(query, limit=10)` → vector search
- `atlas_topology_neighbors(packet_key, hops=3)` → 4D neighbors
- `atlas_glyph_decode(glyph_id)` → SVG + coordinates
- `atlas_feature_card_read(feature_id)` → feature summary

**Write Tools**:
- `atlas_packet_write(packet_key, metadata)` → update metadata only
- `atlas_tree_create(parent_id, node_type, title)` → add node
- `atlas_qdrant_tag(packet_key, tags=[])` → add tags
- `atlas_topology_update(packet_key, coordinates)` → update 4D position

**Do NOT expose**:
- Raw embedding vectors
- Hidden state access
- Model weight updates
- Direct cache manipulation

---

## Indexes (Comprehensive)

```sql
-- Packet identity
INDEX idx_packets_packet_key (packet_key);
INDEX idx_packets_source_ref (source_ref);
INDEX idx_packets_feature_id (feature_id);
INDEX idx_packets_file_path (file_path);

-- Topology
INDEX idx_packets_som_cluster (som_cluster);
INDEX idx_packets_community_id (community_id);
INDEX idx_packets_parent_id (parent_id);
INDEX idx_packets_root_id (root_id);

-- Ranking
INDEX idx_packets_authority (karpathy_blend);
INDEX idx_packets_reward (reward_prior);

-- JSONB queryable
INDEX idx_packets_metadata_gin (metadata) USING gin;
INDEX idx_packets_tags_gin ((metadata->'tags')) USING gin;
INDEX idx_packets_ontology_gin ((metadata->'ontology')) USING gin;

-- Tree structure
INDEX idx_tree_nodes_parent (parent_id);
INDEX idx_tree_nodes_root (root_id);
INDEX idx_tree_nodes_packet_key (packet_key);
INDEX idx_tree_nodes_page_index (page_index_path);

-- Glyphs
INDEX idx_glyphs_packet_key (packet_key);
INDEX idx_glyphs_node_id (node_id);
```

---

## Hard Rules (Non-Negotiable)

1. ✅ **JSONB is canonical query metadata** — not binary blobs
2. ✅ **Qdrant is vector storage** — not a general document DB
3. ✅ **Redis is hot cache** — 24h TTL, session-scoped
4. ✅ **MinIO is cold artifacts** — raw tensors, models, large blobs
5. ✅ **Protobuf/MsgPack only for IPC** — between sidecars, not persistent
6. ✅ **Do NOT store thinking or attention heads** — observable artifacts only
7. ✅ **Do NOT overwrite feature_id** — immutable classification
8. ✅ **Preserve tree structure** — chunks are leaves, not independent
9. ✅ **Glyphs are first-class** — UTF-8 + SVG + coordinates
10. ✅ **4D topology is canonical** — x/y/z/w for all retrieval ranking

---

## Implementation Commands

```bash
# Extract page-index tree nodes
npm run atlas:pageindex:extract

# Extract glyphs (SVG + UTF-8)
npm run atlas:glyphs:extract

# Embed tree nodes
npm run atlas:pageindex:embed

# Tag Qdrant points
npm run atlas:qdrant:tag

# Verify 4D topology
npm run atlas:topology:verify

# Run ingestion queue worker
npm run atlas:ingest:queue:worker

# Audit parent atlas contract
npm run atlas:parent-atlas:audit
```

---

## Next: Phase E (Parent Atlas Ingestion)

Implement:
1. `atlas_tree_nodes` + `atlas_tree_edges` ingestion
2. `atlas_glyph_records` extraction + storage
3. `atlas_topology_index` computation
4. RabbitMQ queue worker
5. Qdrant tag enrichment
6. Contract audit gate

---

**Status**: Parent Atlas Packet Identity OS architecture locked. Ready for Phase E implementation.
