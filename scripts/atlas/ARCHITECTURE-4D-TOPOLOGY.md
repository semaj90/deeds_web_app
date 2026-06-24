# 4D Topology Architecture — Linked-List Tuples + 4x6 Routing Matrix

## Overview

The Atlas retrieval system combines:
1. **Linked-list tuple chain** (packet provenance + supersession)
2. **4x6 routing matrix** (hybrid retrieval lane selection)
3. **SOM 2D grid + latent manifold** (spatial topology)
4. **RTX tensor ops** (dense similarity reranking)

## Linked-List Tuple Chain

Each packet carries a **temporal/provenance chain** that links it to versions and superseding packets.

```
packet_key (unique identity)
  ├─ packet_id (UUID, created_at timestamp)
  ├─ source_ref (canonical source: file/function/feature)
  ├─ embedding_768 (semantic vector)
  ├─ som_index / som_row / som_col (2D grid address)
  ├─ feature_id (ontology/domain axis)
  ├─ cluster_id (learned manifold axis)
  ├─ payload.supersedes → [prior_packet_key, prior_packet_key, ...]
  ├─ payload.superseded_by → newer_packet_key
  ├─ canonical (bool: is this the latest version?)
  └─ latent_64 (compressed 64-dim learned representation)
```

This creates a **4D topology**:
- **X axis**: som_col (SOM grid horizontal)
- **Y axis**: som_row (SOM grid vertical)
- **Z axis**: cluster_id / latent_64 (learned manifold axis)
- **T axis**: created_at + supersedes chain (temporal/lineage axis)

### Lineage Resolution Query

```sql
WITH RECURSIVE packet_lineage AS (
  SELECT packet_key, supersedes, superseded_by, created_at
  FROM atlas_packets WHERE packet_key = $1
  UNION ALL
  SELECT p.packet_key, p.supersedes, p.superseded_by, p.created_at
  FROM atlas_packets p
  JOIN packet_lineage pl ON p.packet_key = ANY(pl.supersedes)
)
SELECT * FROM packet_lineage ORDER BY created_at DESC;
```

## 4x6 Routing Matrix

Route queries to the optimal retrieval lane based on 6 signal strengths:

```
        Cosine  SOM_Dist  Feature  PageRank  Recency  Cache_Hit
        ───────────────────────────────────────────────────────
Semantic  0.60   0.10     0.10     0.10      0.05     0.05
SOM       0.10   0.60     0.15     0.10      0.03     0.02
Ontology  0.20   0.15     0.50     0.10      0.03     0.02
Lineage   0.10   0.10     0.15     0.30      0.25     0.10
```

### Lane Routing Decision

1. **Extract signals** from query context
2. **Compute 4x6 scores** (matrix multiplication)
3. **Select best lane** (highest score)
4. **Execute lane-specific retrieval**:
   - Postgres index narrowing (SOM grid or feature_id filter)
   - RTX batchCosineSimilarity rerank (if lane supports it)
   - Sort by pagerank / recency / lineage chain

### Lane Definitions

#### SEMANTIC Lane
- **When**: Query has strong embedding match (bifrost cache hit)
- **Retrieval**: Fetch 100-500 candidates, RTX cosine rerank, top-K
- **SQL**: `WHERE embedding IS NOT NULL AND som_index IS NOT NULL`
- **GPU**: Yes (RTX batchCosineSimilarity)

#### SOM Lane
- **When**: Query matches SOM grid neighborhood
- **Retrieval**: 8-neighbor Moore distance lookup, RTX rerank, top-K
- **SQL**: `WHERE som_row BETWEEN $1-1 AND $1+1 AND som_col BETWEEN $2-1 AND $2+1`
- **GPU**: Yes (dense similarity)

#### ONTOLOGY Lane
- **When**: Query targets specific feature_id / domain class
- **Retrieval**: Exact feature_id match, deterministic sort, no GPU
- **SQL**: `WHERE feature_id = $1 AND canonical = true`
- **GPU**: No (schema validation is deterministic)

#### LINEAGE Lane
- **When**: Query needs audit trail / supersession chain resolution
- **Retrieval**: Walk packet_lineage CTE, sort by created_at DESC
- **SQL**: Recursive CTE with supersedes chain traversal
- **GPU**: No (provenance tracing is logical, not semantic)

## Integration with ACE Stage A0 (Bifrost Pre-Filter)

```
Incoming Query
  ├─ Extract signals (cosine, som_distance, feature_overlap, pagerank, recency, cache_hit)
  ├─ Compute 4x6 routing scores
  ├─ Select best lane
  │
  └─ Execute lane (Postgres → RTX → Rerank)
      ├─ Postgres index scan (SOM grid or feature_id filter)
      │   └─ Returns 100-500 candidates with embeddings
      ├─ RTX batchCosineSimilarity (if lane supports GPU)
      │   └─ Rerank by cosine similarity to query embedding
      └─ Final sort (pagerank / recency / lineage)
          └─ Return top-K to ACE context assembler
```

## File References

- **Routing Matrix Implementation**: `scripts/atlas/ace-4x6-routing-matrix.ts`
  - `computeRoutingScores(signals)` — 4x6 matrix multiplication
  - `selectRoutingLane(signals)` — Pick best lane
  - `visualizeRoutingMatrix()` — Debug visualization

- **SOM Neighbor Queries**: `scripts/atlas/som-neighbor-query-4d.sql`
  - Pattern 1: Moore distance 8-neighbor lookup
  - Pattern 2: Feature-scoped SOM neighborhood
  - Pattern 3: Latent manifold (with latent_64)
  - Pattern 4: Lineage resolution (recursive CTE)
  - Pattern 5: 4D topology blend scoring

- **Postgres Indexes**: 
  - `idx_atlas_packets_som_index` — Single column SOM lookup
  - `idx_atlas_packets_som_row_col` — Composite (row, col) for neighbor range
  - `idx_atlas_packets_som_topology` — Composite (som_index, cluster_id, community_id)

- **Parent Atlas Sync**: `scripts/atlas/sync-parent-atlas-packets-to-postgres.mjs`
  - Ingests 239 packets from Rust parser output
  - Syncs SOM coordinates + embeddings to Postgres

## Token Remapping via 4x6 Lanes

For token-aware retrieval (e.g., rewrite queries across domains):

1. **Extract token signals** from query
2. **Route to best lane**:
   - If tokens match feature_id → ONTOLOGY lane (schema-aware)
   - If tokens are spread across SOM cells → SOM lane (cluster-aware)
   - If tokens appear in superseded packets → LINEAGE lane (history-aware)
   - Default → SEMANTIC lane (embedding-based fallback)

3. **Remapping**:
   - ONTOLOGY: Remap to canonical feature label
   - SOM: Remap to neighboring cell features
   - LINEAGE: Resolve to latest (non-superseded) packet
   - SEMANTIC: Use embedding similarity for fuzzy matching

## 4x4 vs 4x6 Decision

**4x4** = faster, fewer signals
- Rows: semantic, SOM, ontology, lineage
- Cols: cosine, som_distance, feature_overlap, pagerank

**4x6** = richer, token remapping aware (chosen)
- Added: recency (temporal freshness)
- Added: cache_hit (bifrost semantic cache confidence)
- Enables lineage + recency blending for audit/proof lanes

## Performance Targets

- **Postgres index scan**: <5ms (SOM grid + embedding filter)
- **RTX batchCosineSimilarity** (100 candidates): <50ms
- **Total E2E (ACE Stage A0)**: <100ms
- **Cache hit (Bifrost)**: <5ms, 70-90% rate

