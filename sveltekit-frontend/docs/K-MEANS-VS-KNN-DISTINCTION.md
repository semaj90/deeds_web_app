# K-Means vs KNN: Algorithmic Distinction

**Date**: July 30, 2026  
**Status**: CRITICAL SPECIFICATION  
**Author**: Session 153 Clarification

---

## TL;DR

| Algorithm | Purpose | Input | Output | Use Case |
|-----------|---------|-------|--------|----------|
| **K-Means** | Offline clustering | All vectors + K | K centroids + cluster assignments | Coarse routing, diversity selection, SOM input |
| **KNN** | Online retrieval | Query vector + K | K existing vectors (IDs) | Semantic search, topology expansion, similar items |

**K-means does NOT search.** It creates cluster centers.  
**KNN does NOT create clusters.** It retrieves existing items.

---

## K-Means (Offline Clustering Algorithm)

### What It Does

1. Choose K initial centroid positions (random or k-means++)
2. Assign every artifact to nearest centroid
3. Recompute centroid as mean of assigned points
4. Repeat until convergence (centroids stop moving)
5. Output: K clusters with representative centers

### Input

```
All N vectors in corpus
K (number of clusters to create)
Distance metric (usually Euclidean or Cosine)
```

### Output

```typescript
export interface KmeansResult {
  cluster_run_id: string;           // UUID
  timestamp: Date;
  k: number;
  algorithm_version: string;        // k-means-v3
  hyperparameters: {
    initialization: 'k-means++' | 'random';
    max_iterations: number;
    tolerance: number;
    random_seed?: number;
  };
  centroids: Float32Array[];        // K vectors (same dim as input)
  assignments: Array<{
    artifact_id: string;
    cluster_id: number;             // 0 to K-1
    distance_to_centroid: number;
  }>;
  inertia: number;                  // Sum of squared distances
  converged: boolean;
  iterations: number;
}
```

### Use Cases

1. **Coarse routing**: "Which K clusters is this query closest to?" → search only those clusters
2. **Corpus organization**: Divide codebase into K semantic neighborhoods
3. **Diversity selection**: Pick items from different clusters to avoid redundancy
4. **SOM input preparation**: K-means pre-clusters before SOM training
5. **Outlier identification**: Items far from all centroids are anomalous

### Computation Cost

- O(N*K*D*I) where N=vectors, K=clusters, D=dimensions, I=iterations
- For 40K vectors, 10 clusters, 768 dimensions: ~minutes on CPU, seconds on GPU

---

## KNN (K-Nearest Neighbors Search)

### What It Does

1. Compute distance from query vector to all stored vectors
2. Sort by distance (closest first)
3. Return top K closest items (by ID/reference)
4. Optionally apply distance weighting for ranking

### Input

```
Query vector (1 vector, same dim as corpus)
K (number of neighbors to return)
Stored vectors (corpus of N vectors)
Distance metric (usually Cosine similarity for embeddings)
```

### Output

```typescript
export interface KnnResult {
  query_vector_id: string;
  k: number;
  algorithm: string;                // qdrant-hnsw, faiss, brute-force
  results: Array<{
    artifact_id: string;            // ID of stored vector
    distance: number;               // Cosine similarity or L2 distance
    rank: number;                   // 1 to K
    score: number;                  // Normalized 0-1
  }>;
  search_time_ms: number;
}
```

### Use Cases

1. **Semantic search**: "Find 10 similar functions to this query"
2. **Topology neighbor expansion**: "Find 5-hop neighbors of this node"
3. **Similar code search**: "Show me other places with similar error handling"
4. **Graph construction**: "Build a neighborhood graph from KNN of all items"
5. **Retrieval-augmented generation (RAG)**: "Get context from 20 most relevant chunks"

### Computation Cost

- **Brute-force**: O(N*D) per query (search entire corpus)
- **HNSW (Qdrant)**: O(log N) to O(N) depending on graph connectivity
- For 40K vectors, K=10, 768 dims: ~10-50ms per query on GPU (Qdrant HNSW)

---

## Combined Usage Pattern

```
User Query
  ↓
Embed query (768-dim)
  ↓
Step 1: K-means soft assignment
  └─ Compute distance to all K centroids
  └─ Identify 2-3 closest clusters
  ↓
Step 2: KNN within clusters
  └─ Run KNN search inside selected clusters only
  └─ Return top-K neighbors
  ↓
Step 3: Fuse results
  └─ Combine with lexical search (BM25)
  └─ Combine with graph traversal (Neo4j)
  └─ Rank by RRF (Reciprocal Rank Fusion)
  ↓
Top-10 final results
```

**Why this works**: K-means prunes the search space (~10% of vectors), then KNN finds the best matches within that subset.

---

## At Current Scale (Recommendation)

**You have**: 40K vectors, Qdrant HNSW index, 768-dim embeddings

**Qdrant HNSW can search the entire collection directly** (~10-50ms per query).  
**K-means is optional** — use if you need even faster approximate results or coarse routing.

### Without K-means (Current Best Practice)
```
Query → Embed → Qdrant HNSW on entire collection → Top-10 results (10-50ms)
```
**Pro**: Simple, accurate, no clustering maintenance  
**Con**: Slightly slower than K-means pre-filter

### With K-means (If Latency Critical)
```
Query → Embed → K-means soft assign (2-3 clusters) → KNN within clusters → Top-10 results (5-20ms)
```
**Pro**: Faster (coarse filter reduces search space)  
**Con**: Maintenance overhead, risk of missing results in other clusters

---

## Storage & Versioning

### K-Means Results (Versioned Projection)

```sql
CREATE TABLE kmeans_projection_v1 (
  id UUID PRIMARY KEY,
  artifact_id VARCHAR,
  cluster_run_id VARCHAR,
  cluster_id INT,
  distance_to_centroid FLOAT8,
  algorithm_version VARCHAR,  -- k-means-v3
  hyperparameters JSONB,
  created_at TIMESTAMP
);

-- Centroids stored separately
CREATE TABLE kmeans_centroids_v1 (
  cluster_run_id VARCHAR,
  cluster_id INT,
  centroid VECTOR(768),
  inertia FLOAT8,
  algorithm_version VARCHAR,
  created_at TIMESTAMP
);
```

### KNN Query Log (Optional, for Analytics)

```sql
CREATE TABLE knn_query_log (
  id UUID PRIMARY KEY,
  query_vector_id VARCHAR,
  query_vector VECTOR(768),
  k INT,
  results JSONB,  -- artifact_ids + distances
  latency_ms FLOAT8,
  algorithm VARCHAR,  -- qdrant-hnsw, faiss
  created_at TIMESTAMP
);
```

---

## Hard Rules

| Rule | Reason |
|------|--------|
| **Don't treat cluster_id as a semantic label** | It's a routing token, not a feature |
| **Don't run KNN without corpus** | Need stored vectors to search against |
| **Don't skip K-means versioning** | Algorithm changes → stale results |
| **Don't mix K-means and KNN results directly** | Different distance semantics; use RRF |
| **Don't assume K-means is deterministic** | Random initialization → different clusters each run; use seed |

---

## Code Examples

### K-Means Training

```typescript
import { kmeans } from 'ml-kmeans';

async function trainKmeans(vectors: Float32Array[], k: number) {
  const result = kmeans(vectors, k, {
    initialization: 'kmeans++',
    maxIterations: 100,
    tolerance: 1e-6,
    seed: 42  // For reproducibility
  });

  const projection = {
    cluster_run_id: uuidv4(),
    algorithm_version: 'k-means-v3',
    k: k,
    hyperparameters: {
      initialization: 'kmeans++',
      max_iterations: 100,
      tolerance: 1e-6,
      random_seed: 42
    },
    centroids: result.centroids,
    assignments: vectors.map((v, i) => ({
      artifact_id: `artifact:${i}`,
      cluster_id: result.clusters[i],
      distance_to_centroid: euclideanDistance(v, result.centroids[result.clusters[i]])
    })),
    converged: result.iterations < 100
  };

  // Store in Postgres topology_projection_v1
  return projection;
}
```

### KNN Search (Qdrant)

```typescript
async function searchNearest(queryVector: Float32Array[], k: number) {
  const results = await qdrant.search('codebase_chunks_768', {
    vector: queryVector,
    limit: k,
    with_vectors: false,
    with_payload: ['source_ref', 'feature_id']
  });

  return results.map((hit, rank) => ({
    artifact_id: hit.payload.source_ref,
    distance: 1 - hit.score,  // Qdrant returns score; convert to distance
    rank: rank + 1,
    score: hit.score
  }));
}
```

### Combined K-Means + KNN

```typescript
async function hybridSearch(queryVector: Float32Array[], k: number) {
  // Step 1: K-means soft assign (find 2-3 closest clusters)
  const clusterDistances = kmeansCentroids.map((c, id) => ({
    cluster_id: id,
    distance: cosineDistance(queryVector, c)
  }));
  const closestClusters = clusterDistances
    .sort((a, b) => a.distance - b.distance)
    .slice(0, 3)
    .map(x => x.cluster_id);

  // Step 2: KNN within clusters
  const candidates = artifactAssignments.filter(a => 
    closestClusters.includes(a.cluster_id)
  );

  // Step 3: KNN on filtered candidates
  const results = candidates
    .map(a => ({
      artifact_id: a.artifact_id,
      distance: cosineDistance(queryVector, embeddingStore[a.artifact_id])
    }))
    .sort((a, b) => a.distance - b.distance)
    .slice(0, k);

  return results;
}
```

---

## Decision Tree

```
Do you need to find existing items similar to a query?
  ├─ Yes → Use KNN (Qdrant HNSW)
  └─ No → Continue
  
Do you need to organize vectors into K groups?
  ├─ Yes → Use K-Means
  └─ No → Continue
  
Do you need fast approximate search (sacrifice accuracy)?
  ├─ Yes → K-Means (coarse) + KNN (fine)
  └─ No → Just use KNN on full collection
```

---

## Reference

- K-Means: https://en.wikipedia.org/wiki/K-means_clustering
- KNN: https://en.wikipedia.org/wiki/K-nearest_neighbors_algorithm
- HNSW: https://arxiv.org/abs/1603.09320 (Qdrant implements this)
- RRF: https://www.researchgate.net/publication/11161272_Reciprocal_Rank_Fusion
