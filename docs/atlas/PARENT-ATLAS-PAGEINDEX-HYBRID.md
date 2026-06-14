# Parent Atlas × PageIndex Hybrid Architecture

**Date**: June 14, 2026  
**Purpose**: Preserve document hierarchy (PageIndex tree nodes) while keeping HyperRAG dense retrieval  
**Status**: Design & Implementation Plan

---

## The Core Problem

**Blind chunking destroys hierarchy**: A 100-page SEC filing split into 1000 chunks loses section relationships. When answering "compare FY2023 vs FY2024," the LLM can't navigate the document tree to find related sections in different areas.

**PageIndex solution**: Store documents as tree nodes (document → page → section → subsection → chunk) so the LLM can:
1. Understand document structure at query time
2. Navigate to related sections efficiently
3. Reason across multi-step queries without losing context

**Parent Atlas solution**: Extend packet identity to include tree structure + keep HyperRAG for fast recall.

---

## Hybrid Architecture

### Layer 1: Document Tree Nodes (PageIndex Style)

```sql
CREATE TABLE atlas_tree_nodes (
  node_id UUID PRIMARY KEY,
  parent_id UUID REFERENCES atlas_tree_nodes(node_id),
  root_id UUID NOT NULL,
  
  -- Tree structure
  page_index_path TEXT NOT NULL,        -- "doc:123/page:5/section:2/subsection:3"
  node_type VARCHAR(50) NOT NULL,       -- 'document' | 'page' | 'section' | 'subsection' | 'chunk'
  tree_depth INT NOT NULL,              -- 0=document, 1=page, 2=section, ..., N=chunk
  
  -- Content identity
  source_ref VARCHAR NOT NULL,          -- canonical file path
  file_path VARCHAR NOT NULL,           -- full file path
  file_url VARCHAR,                     -- S3/SeaweedFS URL
  packet_key VARCHAR NOT NULL,          -- atlas identity
  feature_id VARCHAR,                   -- semantic feature (if extracted)
  
  -- Content summary
  title TEXT,                           -- node title/heading
  summary TEXT,                         -- 100-300 char summary
  content_preview TEXT,                 -- first 500 chars
  page_start INT,                       -- start page (if paginated)
  page_end INT,                         -- end page
  
  -- Enrichment
  keywords TEXT[],                      -- extracted keywords
  tags TEXT[],                          -- semantic tags
  ontology JSONB,                       -- domain ontology mapping
  domain VARCHAR,                       -- semantic domain
  som_cluster INT,                      -- SOM grid cell
  community_id INT,                     -- community partition
  
  -- Lineage
  metadata JSONB,                       -- flexible metadata
  ledger_type VARCHAR,                  -- 'canonical' | 'legacy' | 'synthetic'
  lineage_version VARCHAR,              -- 'tree-nodes-v1'
  created_at TIMESTAMP DEFAULT now(),
  updated_at TIMESTAMP DEFAULT now(),
  
  CONSTRAINT valid_tree_path CHECK (page_index_path LIKE 'doc:%'),
  CONSTRAINT parent_depth_check CHECK (
    (parent_id IS NULL AND tree_depth = 0) OR
    (parent_id IS NOT NULL AND tree_depth > 0)
  )
);

-- Indexes: Identity joins + tree navigation
CREATE INDEX idx_atlas_tree_nodes_source_ref ON atlas_tree_nodes(source_ref);
CREATE INDEX idx_atlas_tree_nodes_packet_key ON atlas_tree_nodes(packet_key);
CREATE INDEX idx_atlas_tree_nodes_feature_id ON atlas_tree_nodes(feature_id);
CREATE INDEX idx_atlas_tree_nodes_parent_id ON atlas_tree_nodes(parent_id);
CREATE INDEX idx_atlas_tree_nodes_page_index_path ON atlas_tree_nodes(page_index_path);
CREATE INDEX idx_atlas_tree_nodes_file_path ON atlas_tree_nodes(file_path);
CREATE INDEX idx_atlas_tree_nodes_root_id ON atlas_tree_nodes(root_id);
CREATE INDEX idx_atlas_tree_nodes_som_cluster ON atlas_tree_nodes(som_cluster, community_id);

-- Indexes: Flexible metadata + search
CREATE INDEX idx_atlas_tree_nodes_metadata_gin ON atlas_tree_nodes USING GIN(metadata);
CREATE INDEX idx_atlas_tree_nodes_tags_gin ON atlas_tree_nodes USING GIN(tags);
CREATE INDEX idx_atlas_tree_nodes_keywords_gin ON atlas_tree_nodes USING GIN(keywords);

-- Index: Hot metadata keys for direct access
CREATE INDEX idx_atlas_tree_nodes_qdrant_collection ON atlas_tree_nodes((metadata->>'qdrant_collection'));
CREATE INDEX idx_atlas_tree_nodes_neo4j_node_id ON atlas_tree_nodes((metadata->>'neo4j_node_id'));
CREATE INDEX idx_atlas_tree_nodes_server_path ON atlas_tree_nodes((metadata->>'server_path'));
```

### Layer 2: Packet Identity (Parent Atlas)

**Keep existing `atlas_packets` model** but extend to support tree node references:

```sql
-- atlas_packets columns (unchanged)
packet_key (PK)
source_ref
feature_id
community_id
metadata JSONB

-- Link to tree nodes (new)
tree_node_id UUID REFERENCES atlas_tree_nodes(node_id)  -- nullable
```

**Rationale**: 
- Packets are leaf chunks (equivalent to tree node `node_type='chunk'`)
- Not all tree nodes have corresponding packets (e.g., pages, sections without full-text embedding)
- Keeps backward compatibility with Phase C/D enrichment flow

### Layer 3: Vector Search (HyperRAG + Multi-Vector)

**Qdrant collections** remain the dense retrieval backend, but with expanded payloads:

```json
{
  "collection": "codebase_chunks_768",
  "payload": {
    "node_id": "uuid",
    "parent_id": "uuid",
    "root_id": "uuid",
    "tree_path": "doc:456/page:2/section:1/chunk:3",
    "node_type": "chunk",
    
    "packet_key": "ace:packet:...",
    "source_ref": "src/lib/server/...",
    "file_path": "...",
    "file_url": "s3://...",
    "feature_id": "auth.sessions",
    "feature_label": "Authentication Sessions",
    
    "keywords": ["session", "lucia", "validation"],
    "tags": ["auth", "security"],
    "ontology": {"domain": "authentication", "layer": "middleware"},
    "domain": "authentication",
    
    "som_cluster": 5,
    "community_id": 3,
    "ledger_type": "canonical",
    "lineage_version": "tree-nodes-v1"
  },
  "vector": [... 768-dim embedding ...]
}
```

**Multi-vector search** (separate named vectors or collections):

| Vector | Purpose | Collection |
|--------|---------|-----------|
| content_vector (768-dim) | Dense semantic search | codebase_chunks_768 |
| summary_vector (384-dim) | Title + summary retrieval | feature_cards_768 |
| keyword_vector (sparse) | BM25-style exact matching | keyword_index (TurboVec) |
| title_vector (768-dim) | Page/section heading search | summaries_768 |

### Layer 4: DuckDB Offline Tables

```sql
-- DuckDB import from Qdrant
CREATE TABLE tree_nodes AS
SELECT 
  node_id, parent_id, root_id, page_index_path, node_type,
  source_ref, file_path, file_url,
  packet_key, feature_id, feature_label,
  title, summary, page_start, page_end,
  keywords, tags, domain, som_cluster, community_id,
  file_size, created_at
FROM read_parquet('s3://archive/tree_nodes/*.parquet');

-- Offline hierarchical joins
SELECT 
  n.node_id, n.title, n.page_index_path,
  COUNT(DISTINCT c.node_id) as child_count,
  COUNT(DISTINCT p.node_id) as grandchild_count
FROM tree_nodes n
LEFT JOIN tree_nodes c ON c.parent_id = n.node_id AND c.node_type = 'chunk'
LEFT JOIN tree_nodes p ON p.parent_id = c.node_id
WHERE n.root_id = $doc_id
GROUP BY n.node_id
ORDER BY n.tree_depth;
```

---

## Query Flow: PageIndex + HyperRAG Hybrid

### Example: "Compare FY2023 vs FY2024 revenue"

**Step 1: Keyword search + tree navigation (PageIndex-style)**
```cypher
1. Find document root: SELECT root_id FROM atlas_tree_nodes WHERE source_ref LIKE '%annual-report-2024.pdf%'
2. Locate section nodes: SELECT * FROM atlas_tree_nodes WHERE page_index_path LIKE 'doc:X/section:%' AND title LIKE '%Revenue%'
3. Result: [section:1/subsection:2 (FY2024 Revenue), section:3/subsection:1 (FY2023 Revenue)]
```

**Step 2: Dense vector retrieval (HyperRAG)**
```sql
-- Multi-vector: "revenue comparison"
-- Query vector is compared against content_vector, title_vector in parallel
SELECT node_id, page_index_path, distance 
FROM codebase_chunks_768 
WHERE parent_id IN (...section node IDs...)
ORDER BY distance DESC
LIMIT 20;
```

**Step 3: Hierarchical context assembly**
```sql
-- Get parent sections for cross-reference
SELECT DISTINCT n.node_id, n.title, n.page_index_path
FROM atlas_tree_nodes n
WHERE n.root_id = $doc_id
  AND n.node_type IN ('section', 'subsection')
  AND (n.page_start BETWEEN $fy2023_start AND $fy2023_end
       OR n.page_start BETWEEN $fy2024_start AND $fy2024_end)
ORDER BY n.page_index_path;
```

**Step 4: LLM reasoning (Gemma4 multi-step)**
```
Given the document structure:
- FY2024 Revenue: $X (section 1, page 5)
- FY2023 Revenue: $Y (section 3, page 12)
- Compare: ...
```

---

## Implementation: Phased Rollout

### Phase 0 (Now): Extend Postgres Schema

```bash
# Add tree_nodes table to atlas_packets schema
psql -U legal_admin -d legal_ai_db < drizzle/manual/0040_tree_nodes_pageindex.sql
```

### Phase 1 (Week of June 17): Ingest Tree Nodes

```bash
# For each document in SeaweedFS:
# 1. Parse document structure (PDF outline, markdown TOC, HTML hierarchy)
# 2. Create tree nodes with page_index_path
# 3. Embed summaries → Qdrant
# 4. Link packets → tree nodes

npm run atlas:ingest:tree-nodes --apply
```

### Phase 2 (Week of June 24): Multi-Vector Qdrant

```bash
# Create named vectors in Qdrant:
# - content_vector (existing, rename)
# - summary_vector (new)
# - title_vector (new)
# - keyword_vector (sparse, TurboVec)

npm run atlas:qdrant:create-named-vectors --apply
```

### Phase 3 (Week of July 1): DuckDB Offline Import

```bash
# Export tree_nodes + relationships to DuckDB
npm run atlas:duckdb:import-tree-nodes --apply
```

### Phase 4 (Week of July 8): ACE Integration

```
ACE (Adaptive Context Engine) adds:
1. PageIndex resolver: given query, select relevant tree nodes
2. HyperRAG fallback: if tree search is sparse, use dense vectors
3. Multi-step reasoning: iterate through parent sections for context
```

---

## Benefits Over Blind Chunking

| Aspect | Blind Chunks | PageIndex Tree | Hybrid |
|--------|--------------|----------------|--------|
| Multi-step reasoning | ❌ Each chunk isolated | ✅ Climb tree to parents | ✅✅ Navigate + retrieve |
| Duplicate handling | ❌ Chunks repeat content | ✅ Tree nodes are unique | ✅✅ No redundancy |
| Long-range queries | ❌ Need 100+ chunks | ✅ Follow page_index_path | ✅✅ Direct navigation |
| Vector search speed | ✅ Fast (but sparse) | ❌ Slower tree walk | ✅✅ Hybrid (fast + accurate) |
| Cold-storage archival | ❌ Can't archive partial docs | ✅ Archive by tree level | ✅✅ Granular archival |

---

## Backward Compatibility

- **Existing packets**: Keep in `atlas_packets`, optionally link to tree_node_id
- **Existing Qdrant**: Old points (no tree_path) still searchable; new points have tree metadata
- **Existing Neo4j**: Add `(:TreeNode)` nodes alongside `(:Packet)` nodes; new edges like `TREE_CONTAINS_PACKET`

---

## Known Limitations & Workarounds

| Issue | Reason | Workaround |
|-------|--------|-----------|
| Tree parsing fragile | PDF structure varies | Use Apache Tika / docling for robust extraction |
| Page number mismatch | Different renderers count differently | Store page_start/end + validate with OCR |
| Sparse metadata | Not all docs have sections | Use fallback heuristics (e.g., h1/h2 headings) |
| DuckDB sync lag | Offline tables rebuild monthly | Accept 24h staleness; provide cache invalidation |

---

## Success Criteria

- ✅ Tree nodes ingested for 80%+ of long-form documents (SEC filings, contracts, manuals)
- ✅ Multi-vector search 90%+ precision on document-structure queries
- ✅ ACE multi-step reasoning completes in <5s with tree navigation
- ✅ DuckDB offline joins match online Qdrant results within 1% error

---

## References

- **PageIndex paper**: "A Hierarchical Tree Index for Navigating Document Structures" (MIT)
- **Parent Atlas**: `docs/atlas/PARENT-ATLAS-OPERATING-SYSTEM.md`
- **Qdrant multi-vector**: https://qdrant.tech/documentation/concepts/vectors/
- **DuckDB Parquet**: https://duckdb.org/docs/data/parquet.html
