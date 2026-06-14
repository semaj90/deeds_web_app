# Parent Atlas Contract — One Page Summary

**What Gets Encoded Where**

```
Document / Prompt / SVG / UTF-8
↓
Normalize UTF-8 (atlas_glyph_records: svg_text, utf8_text, unicode_codepoints)
↓
Extract Tree (atlas_tree_nodes: hierarchy, parent_id, page_index_path)
↓
Packet Identity (atlas_packets: packet_key, source_ref, feature_id)
↓
JSONB Metadata (metadata: identity, topology, ranking, provenance)
↓
Embeddings (Qdrant vectors: content, summary_feature, summary_system)
↓
4D Topology (atlas_topology_index: x_cosine, y_graph, z_som, w_authority)
↓
Redis Cache (bifrost:packet:{key}: blend, authority, scores)
↓
Neo4j Graph (bounded 3-hop SIMILAR_TOPOLOGY + USES_CONCEPT)
↓
Gemma4 Synthesis (reasoning + tool calls + MCP)
```

---

## Core Rule: Observable Artifacts Only

**Store in JSONB**:
- Searchable metadata
- Tags, ontology, domain
- Prompt (user input)
- Tool calls (actions)
- Retrieved packet IDs
- Summary (bounded text)
- Scores (ranking metrics)
- Reward (quality signal)
- Errors (what failed)
- Decision path (breadcrumb)

**DO NOT Store**:
- Attention heads
- Hidden states
- Chain-of-thought thinking
- Raw embeddings (→ use Qdrant)
- Tensor data (→ use MinIO)

---

## Tables (6 Total)

| Table | Purpose | Identity | Indexes | Size |
|-------|---------|----------|---------|------|
| `atlas_packets` | Core packet metadata | packet_key | source_ref, feature_id, metadata gin | ~17K rows |
| `atlas_tree_nodes` | PageIndex hierarchy | node_id | parent_id, packet_key, source_ref | ~1M rows |
| `atlas_tree_edges` | Tree relationships | (source_id, target_id, edge_type) | source_id, target_id | ~2M rows |
| `atlas_glyph_records` | UTF-8 / SVG / glyphs | glyph_id | packet_key, node_id | ~100K rows |
| `atlas_topology_index` | 4D coordinates | packet_key | som_cluster, w_authority, x_cosine | ~17K rows |
| `atlas_summary_layers` | Hierarchical summaries | (packet_key, layer_type) | packet_key, layer_type | ~85K rows |

---

## Storage Layer Mapping

| What | Where | Format | Indexed | Query |
|-----|-------|--------|---------|-------|
| Searchable metadata | Postgres JSONB | JSON | GIN | SQL WHERE |
| Vectors + similarity | Qdrant | float32[768] | HNSW | Vector search |
| Hot cache | Redis | JSON | Hash | `GET` / `HGETALL` |
| Cold blobs | MinIO | Binary | Path | S3 API |
| IPC between sidecars | gRPC / Protobuf | Protobuf | - | Request/response |
| Offline analytics | DuckDB | Parquet | B-tree | SQL |
| Graph topology | Neo4j | Cypher | Index | Cypher MATCH |

---

## Qdrant Collections (6 Total)

All 768-dim, all share canonical payload schema:

```json
{
  "packet_key": "...",
  "source_ref": "...",
  "node_id": "...",
  "feature_id": "...",
  "file_path": "...",
  "som_cluster": "...",
  "community_id": "...",
  "x_cosine": 0.85,
  "y_graph": 2.5,
  "z_som": 0.45,
  "w_authority": 0.687,
  "metadata": {...}
}
```

1. `codebase_chunks_768` — text chunks + metadata
2. `tree_nodes_768` — page-index nodes
3. `feature_cards_768` — feature summaries
4. `summaries_768` — layer summaries (chunk/file/folder/feature/system)
5. `memory_cards_768` — agent episodic memory
6. `glyphs_768` — glyph vectors (SVG/UTF-8)

---

## 4D Topology Coordinates

Store in `atlas_topology_index`:

| Axis | Name | Range | Source | Meaning |
|------|------|-------|--------|---------|
| x | x_cosine | [0, 1] | Qdrant cosine | Semantic relevance |
| y | y_graph | [0, ∞) | Neo4j hops | Graph distance from root |
| z | z_som | [0, 1] | SOM grid | Topological cluster position |
| w | w_authority | [0, 1] | Karpathy blend | Ranking importance |

**Retrieval**:
```
Qdrant ANN (x_cosine top-100)
  ↓
Neo4j bounded expansion (y_graph < 3)
  ↓
SOM neighborhood filter (z_som ±0.1)
  ↓
Karpathy rerank (sort by w_authority)
  ↓
Top-20 final results
```

---

## UTF-8 / Glyph / SVG Lane

Store in `atlas_glyph_records`:

```
svg_text       → <svg>...</svg> XML
utf8_text      → "Hello" 
unicode_codepoints → [0x0048, 0x0065, ...]
glyph_id       → deterministic hash
coordinates    → (x_page, y_page, width, height)
glyph_type     → 'text' | 'symbol' | 'icon' | 'diagram'
```

---

## Binary / Tensor Lane

**Raw models / tensors** → MinIO (cold storage):
```json
{
  "model_artifact": {
    "checkpoint_type": "gemma4-rotorquant",
    "hash": "sha256:abc123",
    "size_bytes": 5_300_000_000,
    "location": "minio://models/gemma4-legal-iq4xs.gguf"
  }
}
```

**IPC between sidecars** → gRPC / Protobuf (ephemeral)

---

## Ingestion Queue (RabbitMQ / BullMQ)

```
ingest.raw
  → normalize.utf8 (encoding detection)
  → extract.tree (hierarchy + page_index_path)
  → extract.glyphs (SVG + codepoints)
  → summarize.gemma4 (layer summaries)
  → embed.qdrant (768-dim vectors)
  → cache.redis (hot cache)
  → index.duckdb (offline joins)
  → graph.neo4j (topology edges)
```

**Parallel lanes**: Text extraction, Glyph extraction, Tree structure validation (independent)

---

## Tool Calling (MCP Surface)

**Read**:
- `atlas_packet_read(packet_key)` → metadata + vectors
- `atlas_tree_search(query)` → nodes by title/path
- `atlas_qdrant_search(query)` → vector search
- `atlas_topology_neighbors(packet_key)` → 4D neighbors
- `atlas_glyph_decode(glyph_id)` → SVG + coordinates
- `atlas_feature_card_read(feature_id)` → feature summary

**Write**:
- `atlas_packet_write(packet_key, metadata)` → metadata only (not identity)
- `atlas_tree_create(parent_id, node_type, title)` → add node
- `atlas_qdrant_tag(packet_key, tags=[])` → add tags
- `atlas_topology_update(packet_key, coords)` → update 4D position

**Do NOT expose**:
- Raw embeddings
- Hidden state access
- Model weight updates
- Direct cache manipulation

---

## Hard Rules (10 Total)

1. ✅ JSONB = canonical query metadata (not blobs)
2. ✅ Qdrant = vector storage (not document DB)
3. ✅ Redis = hot cache (24h TTL)
4. ✅ MinIO = cold artifacts (tensors, models, blobs)
5. ✅ Protobuf/MsgPack = IPC only (not persistent)
6. ✅ Do NOT store thinking / attention heads
7. ✅ Do NOT overwrite feature_id (immutable)
8. ✅ Preserve tree structure (chunks are leaves)
9. ✅ Glyphs are first-class (UTF-8 + SVG + coordinates)
10. ✅ 4D topology is canonical (x/y/z/w for all ranking)

---

## Implementation Checklist

- [ ] Apply `drizzle/manual/0029_parent_atlas_complete_schema.sql`
- [ ] Create `atlas_tree_nodes` + `atlas_tree_edges`
- [ ] Create `atlas_glyph_records` + extraction
- [ ] Create `atlas_topology_index` + 4D computation
- [ ] Create `atlas_summary_layers` + Gemma4 summarization
- [ ] Implement ingestion queue worker (6 stages)
- [ ] Implement Qdrant tag enrichment
- [ ] Implement Neo4j SIMILAR_TOPOLOGY + USES_CONCEPT edges
- [ ] Implement MCP tool surface (6 read, 4 write)
- [ ] Audit parent atlas contract (verify all tables, indexes, data)

---

**Status**: Parent Atlas Packet Identity OS contract locked. Ready for Phase E implementation.
