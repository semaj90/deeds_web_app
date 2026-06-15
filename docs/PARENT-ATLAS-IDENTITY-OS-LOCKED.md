# Parent Atlas Identity OS — Locked Design (June 15, 2026)

## Executive Summary

This document freezes the canonical Parent Atlas architecture before Phase 2A implementation.

**Core principle:** Postgres is identity spine. Everything else mirrors or caches.

**Next milestone:** Fix Qdrant transport, freeze baseline, create Phase 2A-2D tables, backfill lineage.

---

## 1. Immediate Lockdowns

### 1.1 Qdrant Transport (Fix First)

**Rule:** REST-only by default, gRPC optional with graceful degradation.

```env
# .env (canonical)
QDRANT_TRANSPORT=rest
QDRANT_URL=http://127.0.0.1:6333
QDRANT_USE_GRPC=false

QDRANT_GRPC_HOST=127.0.0.1
QDRANT_GRPC_PORT=6334
```

**Behavior:**
- Transport=REST: Use HTTP :6333 (fast, proven)
- If :6333 fails and gRPC enabled: Try :6334 (optional)
- If both fail: Degrade gracefully (cache hit, skip ANN)

**Logs:**
```
[qdrant] Using REST transport: http://127.0.0.1:6333
[qdrant] gRPC optional, fallback to :6334 disabled
```

**Test:**
```bash
npm run atlas:qdrant:connectivity
# Output: REST transport healthy
```

---

### 1.2 Canonical Packet Table

**Freeze as identity spine:**

```sql
CREATE TABLE atlas_codebase_packets (
  -- Identity (immutable)
  packet_key      VARCHAR(255) PRIMARY KEY,
  source_ref      VARCHAR(512) NOT NULL,
  feature_id      VARCHAR(255) NOT NULL,
  feature_label   TEXT,
  file_path       VARCHAR(1024),

  -- Topology (mutable, derived)
  community_id    BIGINT,
  som_cluster     INT,
  tree_node_id    UUID,

  -- Metadata (flexible)
  metadata        JSONB DEFAULT '{}',
  payload         JSONB DEFAULT '{}',

  -- Lineage (audit)
  created_at      TIMESTAMP DEFAULT NOW(),
  updated_at      TIMESTAMP DEFAULT NOW(),
  lineage_version VARCHAR(50) DEFAULT 'packet-identity-v2'
);

-- Indexes (load-bearing)
CREATE INDEX idx_packet_key ON atlas_codebase_packets(packet_key);
CREATE INDEX idx_source_ref ON atlas_codebase_packets(source_ref);
CREATE INDEX idx_feature_id ON atlas_codebase_packets(feature_id);
CREATE INDEX idx_file_path ON atlas_codebase_packets(file_path);
CREATE INDEX idx_community ON atlas_codebase_packets(community_id);
CREATE INDEX idx_som ON atlas_codebase_packets(som_cluster);
CREATE INDEX idx_tree_node ON atlas_codebase_packets(tree_node_id);

CREATE INDEX idx_metadata_gin ON atlas_codebase_packets USING GIN(metadata);
CREATE INDEX idx_payload_gin ON atlas_codebase_packets USING GIN(payload);
CREATE INDEX idx_created_brin ON atlas_codebase_packets USING BRIN(created_at);
```

**Contract:**
- Every row = one packet (code fragment, document chunk, feature card)
- packet_key = globally unique identifier
- source_ref = file origin (never changes after creation)
- Topology fields (community_id, som_cluster) = derived, mutable
- metadata/payload = flexible JSONB for extensibility

---

## 2. Missing Tables (Phase 2A–2D)

### 2.1 Phase 2A: Tree Nodes (Load-Bearing)

**Document/page/section/file/chunk hierarchy.**

```sql
CREATE TABLE atlas_tree_nodes (
  -- Identity
  node_id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  packet_key      VARCHAR(255) NOT NULL,
  source_ref      VARCHAR(512),

  -- Hierarchy
  parent_id       UUID,
  root_id         UUID,
  depth           INT,
  node_type       VARCHAR(50),  -- document, page, section, file, chunk
  label           TEXT,

  -- Content
  start_offset    INT,
  end_offset      INT,
  text_preview    TEXT,

  -- Metadata
  metadata        JSONB DEFAULT '{}',

  created_at      TIMESTAMP DEFAULT NOW(),
  FOREIGN KEY (parent_id) REFERENCES atlas_tree_nodes(node_id)
);

CREATE INDEX idx_tree_packet_key ON atlas_tree_nodes(packet_key);
CREATE INDEX idx_tree_parent ON atlas_tree_nodes(parent_id);
CREATE INDEX idx_tree_root ON atlas_tree_nodes(root_id);
CREATE INDEX idx_tree_type ON atlas_tree_nodes(node_type);
```

**Purpose:** Enables PageIndex extraction and hierarchical traversal before chunking.

---

### 2.2 Phase 2B: Topology Index (4D Routing Space)

**Store coordinates for multi-dimensional search.**

```sql
CREATE TABLE atlas_topology_index (
  -- Identity
  packet_key      VARCHAR(255) PRIMARY KEY,

  -- 4D routing space
  x_cosine        REAL,           -- Qdrant semantic
  y_graph         INT,            -- Neo4j depth
  z_som           INT,            -- SOM cluster
  w_authority     REAL,           -- Karpathy score

  -- Metadata
  som_source      VARCHAR(50),    -- gpu-kmeans, directory-fallback
  karpathy_score  REAL,           -- 0.4*PR + 0.3*attn + 0.3*auth
  latent_64       BYTEA,          -- Compressed 64-dim representation

  -- Lineage
  community_id    BIGINT,
  tree_node_id    UUID,

  created_at      TIMESTAMP DEFAULT NOW(),
  updated_at      TIMESTAMP DEFAULT NOW(),
  FOREIGN KEY (packet_key) REFERENCES atlas_codebase_packets(packet_key)
);

CREATE INDEX idx_topo_x ON atlas_topology_index(x_cosine);
CREATE INDEX idx_topo_y ON atlas_topology_index(y_graph);
CREATE INDEX idx_topo_z ON atlas_topology_index(z_som);
CREATE INDEX idx_topo_w ON atlas_topology_index(w_authority);
```

**Purpose:** Unified 4D routing space for Bifrost + ACE + retrieval ranking.

---

### 2.3 Phase 2C: SVG Glyphs (Multimodal Retrieval)

**Store visual + text representation for rendering + search.**

```sql
CREATE TABLE atlas_svg_glyphs (
  -- Identity
  glyph_id        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  packet_key      VARCHAR(255) NOT NULL,
  source_ref      VARCHAR(512),
  file_path       VARCHAR(1024),

  -- Visual
  svg_xml         TEXT,           -- Rendered glyph
  utf8_text       TEXT,           -- Plaintext fallback
  bbox            JSONB,          -- {"x": 0, "y": 0, "w": 100, "h": 100}

  -- Embedding
  embedding_768   vector(768),    -- pgvector for visual search

  -- Metadata
  metadata        JSONB DEFAULT '{}',

  created_at      TIMESTAMP DEFAULT NOW(),
  FOREIGN KEY (packet_key) REFERENCES atlas_codebase_packets(packet_key)
);

CREATE INDEX idx_glyph_packet ON atlas_svg_glyphs(packet_key);
CREATE INDEX idx_glyph_embedding ON atlas_svg_glyphs USING HNSW(embedding_768 vector_cosine_ops);
```

**Purpose:** Multimodal (visual + semantic) retrieval layer for glyph-based UI.

---

### 2.4 Phase 2D: Summary Layers (Offline Synthesis)

**Pre-computed summaries at multiple levels. Never generated synchronously.**

```sql
CREATE TABLE atlas_summary_layers (
  -- Identity
  summary_id      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  packet_key      VARCHAR(255) NOT NULL,

  -- Level (hierarchy)
  summary_level   VARCHAR(50),  -- chunk, file, folder, feature, community, system
  summary_text    TEXT,

  -- Search
  embedding       vector(768),
  keywords        TEXT[],
  metadata        JSONB DEFAULT '{}',

  -- Generated (offline only)
  generated_at    TIMESTAMP,
  model_name      VARCHAR(100),

  created_at      TIMESTAMP DEFAULT NOW(),
  FOREIGN KEY (packet_key) REFERENCES atlas_codebase_packets(packet_key)
);

CREATE INDEX idx_summary_packet ON atlas_summary_layers(packet_key);
CREATE INDEX idx_summary_level ON atlas_summary_layers(summary_level);
CREATE INDEX idx_summary_embedding ON atlas_summary_layers USING HNSW(embedding vector_cosine_ops);
CREATE INDEX idx_summary_keywords ON atlas_summary_layers USING GIN(keywords);
```

**Rule:** Summaries generated offline (npm run atlas:summary:generate). Never block user requests.

---

## 3. Qdrant Collections (Split)

**Stop putting everything in one collection. Split by retrieval intent.**

```
codebase_chunks_768
  Named vectors: content, signature, summary, keyword, encoded_64
  NOT: error, authority (those are metadata)

tree_nodes_768
  New collection for hierarchical traversal

feature_cards_768
  New collection for feature-level search

summary_layers_768
  New collection for multi-level summaries

glyph_vectors_768
  New collection for visual retrieval

memory_cards_768
  New collection for cached context (Engram)
```

### Payload Contract (Standardized)

Every Qdrant point MUST have:

```json
{
  "packet_key": "ace:packet:auth:001",
  "source_ref": "src/lib/server/auth.ts",
  
  "feature_id": "auth.sessions",
  "feature_label": "Authentication Sessions",
  
  "node_id": "uuid-...",
  "parent_id": "uuid-...",
  "root_id": "uuid-...",
  
  "file_path": "src/lib/server/auth.ts",
  "file_url": "file:///...",
  
  "community_id": 5,
  "som_cluster": 12,
  
  "karpathy_score": 0.75,
  "authority_score": 0.6,
  
  "tags": ["auth", "session", "lucia"],
  "keywords": ["validation", "token", "refresh"],
  "ontology": ["FEATURE", "SECURITY", "IDENTITY"],
  
  "lineage_version": "packet-identity-v2"
}
```

**Rule:** Every field is queryable. Authority and errors are metadata, NOT vector dimensions.

---

## 4. Redis / Bifrost Cache Hierarchy

**TTL-based cache levels.**

```
ace:context:*           5m    Query-specific context
ace:summary:*           1h    File/feature summaries
ace:feature:*           1d    Feature cards
ace:tree:*              1d    Tree node hierarchy
ace:ontology:*          7d    Concept ontology
ace:memory:*            30d   Long-term memory

bifrost:sem:packet:*    4h    Semantic cache hits (exact)
bifrost:sem:feature:*   4h    Feature-level semantic
```

**Rules:**
- Query context expires fast (user-specific)
- Summaries are durable (reuse across sessions)
- Ontology is stable (semantic cores)
- Memory is long-lived (learning across projects)

---

## 5. Neo4j Graph (Identity-Free)

**Neo4j contains topology + relationships ONLY, never identity.**

```cypher
-- Node types (no identity, just labels + properties)
CREATE CONSTRAINT unique_feature ON (f:Feature) ASSERT f.feature_id IS UNIQUE;
CREATE CONSTRAINT unique_packet ON (p:Packet) ASSERT p.packet_key IS UNIQUE;
CREATE CONSTRAINT unique_glyph ON (g:Glyph) ASSERT g.glyph_id IS UNIQUE;

-- Relationships (edges only)
FEATURE_CONTAINS_PACKET       (Feature) -[r]-> (Packet)
FEATURE_DEPENDS_ON            (Feature) -[r]-> (Feature)
FEATURE_HAS_SUMMARY           (Feature) -[r]-> (Summary)
FEATURE_SIMILAR_TO            (Feature) -[r]-> (Feature)  [similarity: 0.8]

TREE_PARENT                   (TreeNode) -[r]-> (TreeNode)
TREE_CHILD                    (TreeNode) -[r]-> (TreeNode)

USED_CONCEPT                  (Packet) -[r]-> (OntologyConcept)
                              [frequency, confidence]
```

**Rules:**
- Neo4j is derived from Postgres (read-only for traversal)
- No Postgres data lives in Neo4j exclusively
- Relationships = topology analysis, not identity

---

## 6. What NOT to Implement

**Avoid these permanently:**

```
❌ Store attention heads in JSONB
❌ Store hidden reasoning in JSONB
❌ Store chain-of-thought in Postgres
❌ Store transformer tensors in JSONB
❌ Store glyphs as vectors (store SVG + 768-dim embedding separately)
❌ Store authority vectors (store score scalar only)
```

**Instead:**

```
✅ Observable: prompt, tool_calls, packet_ids, retrieval_ids
✅ Observable: scores, rewards, errors, decision_path
✅ Storage: .pt files → MinIO/NVMe (not Postgres)
✅ Storage: images/PDFs → SeaweedFS (not Postgres)
```

---

## 7. Startup: Ollama + TurboQuant Sequencing

**Load order matters for 8GB GPU.**

```powershell
# 1. Start TurboQuant (llama-server.exe, chat-only)
npm run turbo:start:detached
# Waits 2s for Ollama to free memory (keep_alive:0)

# 2. TurboQuant loads legal GGUF (4.8GB)
# Polls http://127.0.0.1:8090/health until ready

# 3. Start Ollama (embeddinggemma, 500MB)
# Lighter, can coexist with TurboQuant

# 4. Both services up on startup
# No manual coordination needed
```

**Code pattern:**

```typescript
// src/lib/server/startup/initialize-inference-stack.ts
export async function initializeStack() {
  // 1. TurboQuant (primary, must succeed)
  const turbo = await waitForService('http://127.0.0.1:8090/health', 30000);
  if (!turbo) throw new Error('TurboQuant startup failed');

  // 2. Ollama (secondary, graceful degrade)
  const ollama = await waitForService('http://127.0.0.1:11434/api/tags', 30000)
    .catch(() => null);  // Optional
  
  console.log('[startup] TurboQuant ready, Ollama ' + (ollama ? 'ready' : 'degraded'));
  
  return { turbo: true, ollama: !!ollama };
}
```

---

## 8. Next Concrete Milestone

**Before implementing any Phase 2 features, run these commands:**

```bash
# 1. Fix Qdrant transport
npm run atlas:qdrant:connectivity
# Output: REST transport healthy, gRPC optional

# 2. Freeze baseline
npm run atlas:clustering:health
# Output: Current SOM coverage, identity stability

# 3. Create Phase 2A-2D tables
npx drizzle-kit migrate

# 4. Backfill lineage
npm run atlas:backfill:tree-nodes
npm run atlas:backfill:topology-index
npm run atlas:backfill:summary-layers
npm run atlas:backfill:glyph-stubs

# 5. Verify
npm run atlas:lineage:verify
# Output: All packets linked to tree nodes, topology coords, summaries
```

**At that point, you have:**

```
Document
  ↓
PageIndex Tree (atlas_tree_nodes)
  ↓
Summary Layers (atlas_summary_layers)
  ↓
Feature Cards (Qdrant collection)
  ↓
Ontology (Neo4j concepts + relationships)
  ↓
Qdrant Multivector (5 named vectors)
  ↓
Neo4j Bounded Graph (topology only)
  ↓
Bifrost Cache (L1/L2)
  ↓
ACE Planner (MCP tools)
  ↓
Gemma4 Synthesis (legal reasoning)
```

**This is substantially stronger than flat-chunk architecture.**

---

## 9. Implementation Sequence

**Strict order (no skipping):**

### P0 (Done)
- ✅ Identity frozen (Postgres spine)
- ✅ Directory stability verified

### P1 (Current)
- 🚀 Fix Qdrant transport
- 🚀 Freeze baseline clustering
- ⏳ Create Phase 2A-2D tables
- ⏳ Backfill lineage

### P2 (Next)
- Rust parser N-API (for tree extraction)

### P3 (After)
- Qdrant v2 payload normalization

### P4+
- Higher-hop enrichment
- GPU acceleration
- QLoRA/PPO export

---

## 10. Decision Log

### Why This Design?

**Postgres identity spine:**
- Single source of truth
- Transactional consistency
- Audit trail built-in
- JSONB flexibility

**Qdrant mirrors (not truth):**
- Vector retrieval only
- Graceful degradation
- Optional gRPC
- REST-first architecture

**Phase 2A-2D tables:**
- Hierarchical retrieval (PageIndex)
- Multi-dimensional routing (4D space)
- Multimodal search (SVG + text)
- Offline summaries (no user-request blocking)

**Why not flat chunks?**
- Lost document structure
- No hierarchy for traversal
- Authority mixed with vectors
- Hard to extract PageIndex retroactively

**Why Postgres → Qdrant → Neo4j (not the other way)?**
- Postgres = authoritative state
- Qdrant = derived vectors (can rebuild)
- Neo4j = derived topology (can rebuild)
- If Qdrant/Neo4j fails, Postgres survives

---

## Summary

This document is the locked blueprint for Parent Atlas. Before Phase 2A:

1. ✅ Fix Qdrant transport (REST-only, gRPC optional)
2. ✅ Freeze canonical packet table (identity spine)
3. ⏳ Create Phase 2A-2D tables (tree, topology, glyphs, summaries)
4. ⏳ Backfill lineage (connect every packet to tree, topology, summaries)
5. ⏳ Split Qdrant collections (not one big collection)
6. ⏳ Verify lineage end-to-end

At that point, you have a real Packet Identity OS, not a flat-chunk RAG system.

