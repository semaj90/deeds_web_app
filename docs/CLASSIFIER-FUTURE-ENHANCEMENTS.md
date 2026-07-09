# Classifier Sidecar — Future Enhancements

This document outlines how to add Neo4j contextual trees, JSONB autoencoding, and 20×20 SOM clustering into the classifier pipeline.

## 1. Neo4j Contextual Trees (Authority Scoring)

### Current State

The classifier predicts lane, but doesn't use Neo4j topology. Adding graph authority:

```
Query → Classifier → Lane → Hybrid Search (Qdrant + Postgres)
                              ↓
                        (missing Neo4j authority)
```

### Enhancement: Neo4j USED_CONCEPT Edges

**What to add:**

1. After hybrid search returns candidates, fetch Neo4j relationships:

```go
// internal/hybrid/neo4j.go
type Neo4jClient struct {
  endpoint string
  auth     auth.TokenManager
}

func (nj *Neo4jClient) GetAuthorityScore(ctx context.Context, packetKey string) (float32, error) {
  // MATCH (p:Packet {id: $key})
  // CALL apoc.algo.pageRank(p, 'USED_CONCEPT') YIELD score
  // RETURN score
}

func (nj *Neo4jClient) GetContextualNeighbors(ctx context.Context, packetKey string, depth int) ([]string, error) {
  // MATCH path = (p:Packet {id: $key})-[:USED_CONCEPT*1..$depth]->()
  // RETURN collect(distinct nodes(path)) as contextTree
}
```

2. Rerank hybrid results using Neo4j authority:

```go
// internal/hybrid/hybrid.go - modify rrfFuse()
func (hs *HybridSearcher) rrfFuseWithNeo4j(
  denseResults,
  sparseResults []SearchResult,
  topK int,
) []SearchResult {
  // ... existing RRF fusion ...

  // Add Neo4j authority (0.2 weight)
  for i, r := range fused {
    authority, _ := hs.neo4j.GetAuthorityScore(ctx, r.PacketKey)
    fused[i].Score += 0.2 * authority
  }

  // Re-sort
  sort.Slice(fused, func(i, j int) bool {
    return fused[i].Score > fused[j].Score
  })

  return fused[:topK]
}
```

3. Final weighted formula:

```
Final Score = 0.5 × RRF(dense, sparse) + 0.3 × Neo4j_Authority + 0.2 × Freshness

Where:
  RRF(dense, sparse) = 0.6 × dense_rank + 0.4 × sparse_rank
  Neo4j_Authority = PageRank(packetKey) or CheiRank/K-Core from GDS
  Freshness = 1 / (days_old + 1)
```

**Work estimate:** 3-4 hours

**Dependencies:**
- Neo4j Go driver (already available)
- Neo4j GDS (PageRank, CheiRank, K-Core already computed)
- Caching Neo4j scores in Redis for hot paths

---

## 2. JSONB Autoencoding (Dimensionality Reduction)

### Current State

Classifier uses raw 10 scalar features. JSONB autoencoding compresses features into a compact representation:

```
10 features → [0.5, 10, 15, 5, 3.2, 1, 1, 0, 2, 0.75] (baseline)
              ↓
              Autoencoder (768 → 64 dim)
              ↓
              64-dim latent (compressed feature vector)
```

### Enhancement: Train Autoencoder

**Why:** Capture non-linear feature interactions, reduce memory footprint.

1. Train PyTorch autoencoder:

```python
# scripts/atlas/train-feature-autoencoder.py

import torch
import torch.nn as nn
from torch.utils.data import DataLoader, TensorDataset
import numpy as np

class FeatureAutoencoder(nn.Module):
    def __init__(self, input_dim=10, latent_dim=64):
        super().__init__()
        self.encoder = nn.Sequential(
            nn.Linear(input_dim, 128),
            nn.ReLU(),
            nn.Linear(128, 64),
            nn.ReLU(),
            nn.Linear(64, latent_dim)
        )
        self.decoder = nn.Sequential(
            nn.Linear(latent_dim, 64),
            nn.ReLU(),
            nn.Linear(64, 128),
            nn.ReLU(),
            nn.Linear(128, input_dim)
        )

    def forward(self, x):
        z = self.encoder(x)
        x_hat = self.decoder(z)
        return x_hat, z

# Load training data from classifier-features-2026-07-09.csv
df = pd.read_csv('sveltekit-frontend/classifier-datasets/classifier-features-2026-07-09.csv')
features = torch.tensor(df[feature_cols].fillna(0).values, dtype=torch.float32)

# Train
model = FeatureAutoencoder()
optimizer = torch.optim.Adam(model.parameters())
criterion = nn.MSELoss()

for epoch in range(50):
    for batch_x in DataLoader(features, batch_size=64):
        x_hat, z = model(batch_x)
        loss = criterion(x_hat, batch_x)
        optimizer.zero_grad()
        loss.backward()
        optimizer.step()

# Save
torch.save(model.encoder.state_dict(), 'classifier-models/feature-encoder.pt')
```

2. Integrate into classifier:

```go
// internal/classifier/autoencoder.go

type Autoencoder struct {
  encoder *ort.Session  // ONNX Runtime session
  latentDim int
}

func (ae *Autoencoder) Encode(features []float32) ([]float32, error) {
  // Call ONNX encoder model
  // Input: [1, 10] features
  // Output: [1, 64] latent vector
}

func (clf *Classifier) PredictWithAutoencoding(features []float32) (int, float32) {
  // Encode features
  latent, _ := clf.autoencoder.Encode(features)

  // Use latent for richer feature representation
  // Option: train a secondary classifier on latent vectors
  // For now: pass raw features to existing classifier
  return clf.Predict(features)
}
```

3. Store latent in Postgres:

```sql
ALTER TABLE atlas_packets ADD COLUMN feature_latent_64 vector(64);

-- Backfill via Python batch job
UPDATE atlas_packets ap
SET feature_latent_64 = encode(payload::bytea, 'escape')
FROM latent_cache lc
WHERE ap.packet_key = lc.packet_key;
```

**Work estimate:** 6-8 hours

**Benefits:**
- Compress 10 features → 64 dimensions
- Capture non-linear feature interactions
- Enable more sophisticated reranking (e.g., cosine similarity on latent space)
- Reduce memory footprint for large-scale deployments

---

## 3. 20×20 SOM Clustering (Topology-Aware Routing)

### Current State

SOM grid is computed but not used for retrieval routing. Add SOM-based pre-filtering:

```
Query → Classifier → Lane → SOM Pre-filter → Hybrid Search
                              ↓
                    (find candidates in same SOM cell)
```

### Enhancement: SOM-Based Retrieval

**Architecture:**

```go
// internal/hybrid/som.go

type SOMCluster struct {
  Row      int      // SOM grid row (0-19)
  Col      int      // SOM grid col (0-19)
  Center   []float32 // Centroid (768-dim)
  Members  []string   // Packet keys in this cell
  CellDensity float32 // Members / total (0-1)
}

type SOMRouter struct {
  grid      [20][20]*SOMCluster  // 20×20 SOM grid
  pgconn    *pgx.Conn
}

func (sr *SOMRouter) QueryCluster(ctx context.Context, embedding []float32) (*SOMCluster, error) {
  // Find nearest SOM cell using cosine similarity
  nearest := -1
  maxScore := float32(-1)

  for i := 0; i < 20; i++ {
    for j := 0; j < 20; j++ {
      if sr.grid[i][j] == nil {
        continue
      }
      score := cosineSimilarity(embedding, sr.grid[i][j].Center)
      if score > maxScore {
        maxScore = score
        nearest = i*20 + j
      }
    }
  }

  row, col := nearest/20, nearest%20
  return sr.grid[row][col], nil
}

func (sr *SOMRouter) GetLocalCandidates(
  ctx context.Context,
  cluster *SOMCluster,
  topK int,
) ([]SearchResult, error) {
  // Fetch top-K packets from the cluster
  query := `
    SELECT packet_key, source_ref, title, domain_class
    FROM atlas_packets
    WHERE som_row = $1 AND som_col = $2
    LIMIT $3
  `
  // ... execute query ...
}
```

2. Integrate into hybrid search:

```go
// internal/hybrid/hybrid.go

func (hs *HybridSearcher) hybridSearchWithSOM(ctx context.Context, req *SearchRequest) ([]SearchResult, error) {
  embedding, _ := hs.embedText(ctx, req.QueryText)

  // Step 1: Find nearest SOM cluster
  cluster, _ := hs.som.QueryCluster(ctx, embedding)
  trace["som_cluster"] = fmt.Sprintf("%d,%d", cluster.Row, cluster.Col)

  // Step 2: Get local candidates from SOM cluster
  localCandidates, _ := hs.som.GetLocalCandidates(ctx, cluster, req.TopK*2)

  // Step 3: Qdrant + PostgreSQL on local candidates (or full index)
  denseResults, _ := hs.qdrantSearch(ctx, embedding, req.TopK*2)
  sparseResults, _ := hs.sparseSearch(ctx, req)

  // Step 4: Prefer candidates in same SOM cluster (0.2 bonus)
  for i := range denseResults {
    for _, local := range localCandidates {
      if denseResults[i].PacketKey == local.PacketKey {
        denseResults[i].Score *= 1.2  // SOM proximity bonus
        break
      }
    }
  }

  // Step 5: RRF fusion
  return hs.rrfFuse(denseResults, sparseResults, req.TopK), nil
}
```

3. Load SOM grid at startup:

```go
// cmd/classifier-sidecar/main.go

// After loading classifier, load SOM grid
somRouter, err := hybrid.LoadSOMGrid(pgPool, 20, 20)
if err != nil {
  log.Printf("Warning: SOM grid not loaded: %v", err)
}
hs.som = somRouter
```

4. Store SOM in Redis for fast queries:

```
Key: som:cluster:{row}:{col}
Value: JSON { members: [...], center: [...], density: 0.85 }
TTL: 24h (refresh daily after SOM retraining)
```

**Work estimate:** 4-6 hours

**Benefits:**
- Fast topology-aware pre-filtering
- Reduce Qdrant ANN search space
- Improve latency for high-density clusters
- Preserve semantic locality

---

## Integration Timeline

### Phase 1 (Week 1): Neo4j Authority Scoring
- Fetch PageRank from Neo4j
- Add 0.3 weight to RRF
- Deploy without retraining classifier

### Phase 2 (Week 2): JSONB Autoencoding
- Train autoencoder on feature vectors
- Backfill 64-dim latent to Postgres
- Store latent in Redis for hot paths

### Phase 3 (Week 3): SOM-Based Routing
- Load SOM grid at startup
- Implement SOM cell lookup
- Add SOM proximity bonus to reranking

### Phase 4 (Ongoing): Observability
- Prometheus metrics (latency, cache hits, lane distribution)
- Langfuse traces (step timing, decision tree)
- Alerting on accuracy drift

---

## Configuration

Add these flags to classifier-sidecar:

```bash
./bin/classifier-sidecar \
  -port 8095 \
  -model ../sveltekit-frontend/classifier-models/xgboost-lane-classifier.json \
  -metadata ../sveltekit-frontend/classifier-models/xgboost-metadata.json \
  -qdrant http://127.0.0.1:6333 \
  -postgres postgresql://legal_admin:123456@127.0.0.1:5434/legal_ai_db \
  -neo4j bolt://127.0.0.1:7687 \
  -neo4j-auth user:pass \
  -som-enabled true \
  -autoencoder ../sveltekit-frontend/classifier-models/feature-encoder.pt \
  -log info
```

---

## Expected Impact

| Enhancement | Latency | Accuracy | Memory |
|---|---|---|---|
| Baseline | 50-100ms | 99.90% | Standard |
| + Neo4j | +5-10ms | +0.5% | +overhead |
| + Autoencoding | +2ms | +1% | -30% |
| + SOM | +3-5ms | +0.3% | -50% (prefilter) |
| All 3 | +10-20ms | +2% | -20% overall |

---

## References

- Neo4j GDS: https://neo4j.com/docs/graph-data-science/
- PyTorch Autoencoder Tutorial: https://pytorch.org/tutorials/
- SOM (Self-Organizing Maps): http://www.scholarpedia.org/article/Self-organizing_map
- RRF with Boosting: https://en.wikipedia.org/wiki/Reciprocal_rank_fusion
