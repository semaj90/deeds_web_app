# Topology Derivation Contract — Canonical Reference

**Date**: July 2, 2026
**Status**: ✅ **SCHEMA DEFINED, PIPELINE SEQUENCED**

---

## Core Principle

**Topology is not one thing. It is a set of derived coordinates.**

All topology derives from canonical truth (identity + embedding), not before.

---

## Canonical Truth Layer (Identity + Embedding)

### Immutable Schema

```sql
packet_id uuid PRIMARY KEY,
source_ref text NOT NULL,        -- src/lib/server/auth.ts
feature_id text NOT NULL,        -- auth.sessions
file_path text,                  -- normalized path
ast_node text,                   -- function name or class
symbol text,                     -- canonical symbol
kind text,                        -- function | class | module | constant
embedding vector(384) NOT NULL,  -- embeddinggemma canonical 384-dim
qdrant_point_id text,            -- mirror for vector search
created_at timestamp,
updated_at timestamp
```

**What this layer provides**:
- ✅ Packet identity (packet_id, source_ref, feature_id)
- ✅ Semantic position (embedding_384, 768→384 canonical)
- ✅ No derived coordinates here (topology is downstream)

**Cardinality**: 58,304 packets (atlas_packets canonical)

---

## Derived Topology Layer (Coordinates Only)

### Derived Schema

```sql
packet_id uuid PRIMARY KEY,
source_ref text NOT NULL,        -- reference to canonical
feature_id text NOT NULL,        -- reference to canonical

-- Compression tier (nonlinear routing)
latent_128 vector(128),          -- autoencoder compressed
latent_64 vector(64),            -- routing/cache only

-- Map tier (spatial neighborhoods)
som_row integer,                 -- SOM grid row (0-19)
som_col integer,                 -- SOM grid col (0-19)
som_cluster text,                -- cluster ID for pre-filter
som_index integer,               -- flattened BMU index

-- Partition tier (grouping)
kmeans_cluster integer,          -- k-means partition
pca_cluster integer,             -- PCA-based partition

-- Relationship tier (graph analytics)
pagerank_score real,             -- Neo4j PageRank (centrality)
community_id integer,            -- Neo4j Louvain (modularity)

-- Metadata
semantic_tags text[],            -- LangExtract concepts
metadata jsonb
```

**What this layer provides**:
- ✅ Compression (latent_128, latent_64)
- ✅ Neighborhoods (som_row, som_col)
- ✅ Relationships (pagerank_score, community_id)
- ❌ NOT identity (that's canonical truth)

**Cardinality**: 58,304 rows (1:1 with canonical)

---

## Derivation Pipeline (Sequential Order)

### Step 1: Schema Match & Canonical Registry ✅

**Input**: Raw code files + LangExtract output + AST
**Output**: `canonical_packets` (identity table)
**Gate**: packet_id + source_ref + feature_id unique and non-null

```sql
CREATE TABLE canonical_packets (
  packet_id uuid PRIMARY KEY,
  source_ref text NOT NULL,
  feature_id text NOT NULL,
  file_path text,
  ast_node text,
  symbol text,
  kind text,
  created_at timestamp DEFAULT NOW()
);

CREATE UNIQUE INDEX ON canonical_packets (source_ref, feature_id, packet_id);
```

---

### Step 2: Semantic Enrichment

**Input**: canonical_packets
**Output**: LangExtract concepts, verbs, entities, relationships, summary, tags
**Tool**: LangExtract (C++ or Python subprocess)
**Storage**: metadata JSONB

```json
{
  "concepts": ["authentication", "session", "token"],
  "verbs": ["validate", "refresh", "revoke"],
  "entities": ["User", "Session", "Cookie"],
  "relationships": [
    {"source": "Session", "type": "HAS", "target": "User"},
    {"source": "Session", "type": "EXPIRES", "target": "Timestamp"}
  ],
  "summary": "Handles Lucia session validation...",
  "tags": ["auth", "security", "session-mgmt"]
}
```

---

### Step 3: Canonical Embedding (384-dim) ✅

**Input**: canonical_packets + source code
**Output**: embedding_384 (embeddinggemma)
**Command**: `npm run atlas:embed:canonical:384`
**Storage**: Update canonical_packets.embedding column

```sql
UPDATE canonical_packets
SET embedding = $1
WHERE packet_id = $2;
```

**Why 384**: embeddinggemma native dim, truncated from 768 for project standard.

---

### Step 4: PCA Baseline

**Input**: embedding_384 (all 58K packets)
**Output**: latent_pca_64 (sanity map + routing)
**Tool**: sklearn.decomposition.PCA(n_components=64)
**Command**: `npm run atlas:topology:pca`
**Storage**: Store as reference (not in main schema, cached in Redis)

**Why**: Fast 384→64 sanity check before expensive autoencoder training.

---

### Step 5: Autoencoder Training

**Input**: embedding_384 (full dataset)
**Output**: Trained autoencoder model (PyTorch .pt)
**Tool**: PyTorch + TensorRT
**Command**: `npm run atlas:topology:ae:train`
**Duration**: ~1–2 hours (GPU)
**Config**:
- Encoder: 384 → 256 → 128 → 64
- Decoder: 64 → 128 → 256 → 384
- Reconstruction loss < 0.01
- Validation split: 0.2

**Storage**: Save model to `models/autoencoder-384-to-64.pt`

---

### Step 6: Autoencoder Encode Pass

**Input**: embedding_384 + trained model
**Output**: latent_128, latent_64
**Command**: `npm run atlas:topology:ae:encode`
**Storage**: Update topology schema

```sql
UPDATE topology_packets
SET latent_128 = $1, latent_64 = $2
WHERE packet_id = $3;
```

**Parallelization**: Batch 1000 vectors per GPU call.

---

### Step 7: SOM Training

**Input**: latent_128 or embedding_384 (your choice)
**Output**: Trained SOM model (20×20 grid)
**Tool**: MiniSom or TensorRT custom kernel
**Command**: `npm run atlas:topology:som:train`
**Duration**: ~30 min (GPU) or ~5 min (TensorRT)
**Config**:
- Grid: 20×20 (400 neurons)
- Input: 128-dim or 384-dim
- Learning rate: 0.5 → 0.01 (decay)
- Iterations: 100 epochs

**Storage**: Save model to `models/som-20x20-dim128.pt`

---

### Step 8: SOM Assign BMU (Best Matching Unit)

**Input**: latent_128 + trained SOM
**Output**: som_row, som_col, som_index
**Command**: `npm run atlas:topology:som:assign`
**Storage**: Update topology schema

```sql
UPDATE topology_packets
SET som_row = $1, som_col = $2, som_cluster = $3, som_index = $4
WHERE packet_id = $5;
```

**Example**: Packet 0x123 → BMU (row=7, col=11) → cluster_label="auth.sessions"

**Validation**: All 58K packets have assigned BMU.

---

### Step 9: K-Means Clustering

**Input**: latent_64 or som coordinates
**Output**: kmeans_cluster (0-99)
**Command**: `npm run atlas:topology:kmeans`
**Config**: K=100 (tunable), algorithm=MiniBatch
**Storage**: Update topology_packets.kmeans_cluster

---

### Step 10: Neo4j Graph Build

**Input**: canonical_packets + AST edges + LangExtract relationships
**Output**: Neo4j nodes + relationships
**Command**: `npm run atlas:topology:neo4j:build`
**Relationships**:
- `Packet HAS_FEATURE Feature`
- `Packet IN_MODULE Module`
- `Packet CALLS Packet` (AST edges)
- `Packet IMPORTS Package`
- `Packet USED_CONCEPT Concept` (LangExtract)

**Storage**: Neo4j graph (separate database)

---

### Step 11: GDS PageRank + Louvain

**Input**: Neo4j graph (from Step 10)
**Output**: pagerank_score, community_id
**Command**: `npm run atlas:topology:gds`
**Algorithms**:
```cypher
-- PageRank
CALL gds.pageRank.write({ nodeProjection: 'Packet', relationshipProjection: 'CALLS|IMPORTS|USED_CONCEPT', writeProperty: 'pagerank' })

-- Louvain
CALL gds.louvain.write({ nodeProjection: 'Packet', relationshipProjection: 'CALLS|IMPORTS|USED_CONCEPT', writeProperty: 'community' })
```

**Storage**: Update topology_packets.pagerank_score, community_id

---

### Step 12: Postgres + Qdrant Upsert

**Input**: All topology columns (canonical + derived)
**Output**: Updated atlas_packets + enriched Qdrant payloads
**Command**: `npm run atlas:topology:upsert`

```sql
-- Upsert to topology_packets
INSERT INTO topology_packets (packet_id, latent_128, latent_64, som_row, som_col, som_cluster, kmeans_cluster, pagerank_score, community_id)
VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
ON CONFLICT (packet_id) DO UPDATE SET
  latent_128 = EXCLUDED.latent_128,
  latent_64 = EXCLUDED.latent_64,
  som_row = EXCLUDED.som_row,
  som_col = EXCLUDED.som_col,
  som_cluster = EXCLUDED.som_cluster,
  kmeans_cluster = EXCLUDED.kmeans_cluster,
  pagerank_score = EXCLUDED.pagerank_score,
  community_id = EXCLUDED.community_id;

-- Enrich Qdrant payloads
UPDATE qdrant_codebase_chunks_768 SET
  payload = jsonb_set(payload, '{som_row}', to_jsonb(topology_packets.som_row)),
  payload = jsonb_set(payload, '{som_col}', to_jsonb(topology_packets.som_col)),
  payload = jsonb_set(payload, '{pagerank}', to_jsonb(topology_packets.pagerank_score)),
  payload = jsonb_set(payload, '{community}', to_jsonb(topology_packets.community_id))
FROM topology_packets
WHERE qdrant_codebase_chunks_768.chunk_id = topology_packets.packet_id;
```

---

## Usage Patterns (How Topology Is Used)

### Neighborhood Query (SOM)

```sql
-- Find nearby packets in SOM grid
SELECT *
FROM topology_packets
WHERE ABS(som_row - 7) <= 2
  AND ABS(som_col - 11) <= 2
LIMIT 100;

-- Result: ~100 semantically related packets
```

### Compression Query (Autoencoder)

```sql
-- Use latent_64 for fast similarity
SELECT 
  t1.packet_id,
  t2.packet_id,
  l2_distance(t1.latent_64, t2.latent_64) AS distance
FROM topology_packets t1
CROSS JOIN topology_packets t2
WHERE l2_distance(t1.latent_64, t2.latent_64) < 0.5
LIMIT 50;

-- Result: Packets within Euclidean distance 0.5 in latent space
```

### Relationship Query (Neo4j + PageRank)

```cypher
MATCH (p:Packet)-[:CALLS|IMPORTS]->(related:Packet)
WHERE p.packet_id = '0x123'
RETURN related.packet_id, related.pagerank
ORDER BY related.pagerank DESC
LIMIT 10;

-- Result: Most important related packets
```

### Community Query (Louvain)

```sql
-- Find all packets in same community
SELECT packet_id, pagerank_score
FROM topology_packets
WHERE community_id = 7
ORDER BY pagerank_score DESC
LIMIT 20;

-- Result: Cohesive module group
```

---

## Do NOT Use (Anti-Patterns)

❌ **Do NOT use HMM for embedding topology**
- HMM is for workflow sequence prediction (agent state machines)
- Topology is spatial/graph, not temporal

❌ **Do NOT use latent_64 for retrieval**
- Use embedding_384 (Qdrant ANN)
- latent_64 is for routing/cache only

❌ **Do NOT mix topology layers**
- SOM is for neighborhoods (radius search)
- Kmeans is for partitions (hard clustering)
- Use the right tool for the right query

❌ **Do NOT train on full embedding_384 without PCA check**
- Run PCA first as sanity check
- If PCA reconstruction > 0.02, embedding quality is poor

---

## Execution Script (Single Entry Point)

**File**: `scripts/topology/derive-topology.mjs`

```bash
# Dry run (estimate only)
node scripts/topology/derive-topology.mjs --all --dry-run

# Full pipeline (12 steps, ~4 hours on GPU)
node scripts/topology/derive-topology.mjs --all --apply

# Individual steps
node scripts/topology/derive-topology.mjs --pca
node scripts/topology/derive-topology.mjs --ae-train
node scripts/topology/derive-topology.mjs --ae-encode
node scripts/topology/derive-topology.mjs --som-train
node scripts/topology/derive-topology.mjs --som-assign
node scripts/topology/derive-topology.mjs --kmeans
node scripts/topology/derive-topology.mjs --neo4j:build
node scripts/topology/derive-topology.mjs --gds
node scripts/topology/derive-topology.mjs --upsert
```

---

## Mental Model (The Key Insight)

```
Canonical Truth (Identity + Embedding)
  packet_id, source_ref, feature_id, embedding_384

    ↓ (PCA baseline)
    → latent_pca_64 (fast sanity check)

    ↓ (Autoencoder)
    → latent_128, latent_64 (compression)

    ↓ (SOM)
    → som_row, som_col, som_cluster (neighborhoods)

    ↓ (K-means)
    → kmeans_cluster (partitions)

    ↓ (Neo4j Graph)
    → pagerank_score, community_id (relationships)

Unified Retrieval Pipeline
  Query → embedding_384 → Qdrant ANN (20 candidates)
        → SOM pre-filter (radius search in grid)
        → Neo4j relationships (graph traversal)
        → RRF ranking (final fusion)
```

**Each coordinate answers a different question**:
- **embedding_384**: "What's most similar?"
- **latent_64**: "What's nearby in compressed space?"
- **som_row, som_col**: "What's in my neighborhood?"
- **kmeans_cluster**: "What partition am I in?"
- **pagerank_score**: "How important am I?"
- **community_id**: "Who's in my module group?"

---

## Conclusion

Topology is derived, not given. Start with canonical truth (identity + embedding), then layer coordinates on top. Each coordinate serves a specific retrieval or analysis pattern. Never go backwards (topology → embedding). Always go forwards (embedding → topology).
