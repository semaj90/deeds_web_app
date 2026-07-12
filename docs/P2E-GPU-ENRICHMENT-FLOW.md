# Phase 2E: GPU Topology Enrichment Flow

**Date**: July 11, 2026  
**Architecture**: CPU Orchestrator (Node.js) → RabbitMQ → GPU Workers (PyTorch/.venv-cu130) → Postgres

---

## High-Level Architecture

```
┌──────────────────────────────────────────────────────────────────┐
│                         TOPOLOGY ENRICHMENT PIPELINE              │
└──────────────────────────────────────────────────────────────────┘

CPU LANE (Orchestration)          GPU LANE (Computation)      Postgres (Truth)
─────────────────────────────────────────────────────────────────────────

1. P2D Feature Envelopes
   (58,365 packets materialized)
         ↓
2. Query Qdrant-indexed subset
   (4,725 packets with qdrant_point_id)
         ↓
3. Publish 3 RabbitMQ jobs
   (KMeans, SOM, PageRank)
         │                                    
         ├─→ topology.kmeans queue ─────→ Consumer 1 (KMeans)
         │                                 ↓ PyTorch GPU
         │                                 Run KMeans clustering
         │                                 k=10, max_iter=50
         │                                 ↓
         │                                 Write kmeans_centroid_key
         │
         ├─→ topology.som queue ────────→ Consumer 2 (SOM)
         │                                 ↓ PyTorch GPU
         │                                 Train Self-Organizing Map
         │                                 grid_size=10×10
         │                                 ↓
         │                                 Write som_centroid_key
         │
         └─→ topology.pagerank queue ───→ Consumer 3 (PageRank)
                                           ↓ PyTorch GPU
                                           Compute PageRank scores
                                           iterations=30
                                           ↓
                                           Write pagerank score

         ↑─────────────────────────────────┘
         
4. Monitor Postgres writes
   atlas_feature_envelopes:
   - kmeans_centroid_key (cluster ID)
   - som_centroid_key (SOM cell assignment)
   - pagerank (authority score)
   
5. Emit completion event
   topology.results queue
   (optional monitoring)
```

---

## Phase 2E: KMeans GPU Enrichment (Example)

### 1. CPU Publishes Job to RabbitMQ

**Publisher**: `p2e-rabbitmq-job-publish.mjs`

```javascript
{
  run_id: "p2e-kmeans-1720700000000",
  job_type: "kmeans_clustering",
  packet_keys: [
    "packet:000001",
    "packet:000002",
    // ... 4,725 packets total
  ],
  metadata: {
    k: 10,                              // Number of clusters
    max_iter: 50,                        // Max iterations
    tol: 1e-4,                           // Convergence tolerance
    random_seed: 42,                     // Deterministic seed
    feature_schema_version: "feature-envelope-v1"
  },
  requested_at: "2026-07-11T..."
}
```

**Queue**: `topology.kmeans` (durable, persistent)

---

### 2. GPU Consumer Receives Job

**Consumer**: `python-workers/consumer_topology_kmeans.py`

**Flow**:

```
a) RabbitMQ Message Callback
   ├─ Receive message from topology.kmeans queue
   ├─ Parse JSON: extract run_id, packet_keys, metadata
   └─ Log: "📨 Message received"

b) Verify GPU Ready
   ├─ import torch
   ├─ Check torch.cuda.is_available() == True
   ├─ Get device name (RTX 3060 Ti)
   └─ Log: "PyTorch 2.13.0+cu130 | CUDA available | GPU: NVIDIA..."

c) Fetch Embeddings (CPU work)
   ├─ Query Qdrant /collections/{collection}/points/{point_ids}
   ├─ Retrieve embedding vectors (768-dim, one per packet)
   └─ Return: numpy array shape (4725, 768)

d) Run KMeans on GPU (GPU-accelerated)
   ├─ Convert embeddings to PyTorch tensor
   ├─ Move to GPU: tensor.cuda()
   ├─ Initialize centroids (random or kmeans++ seeding)
   ├─ Iterative refinement:
   │  Loop max_iter=50 times OR until convergence:
   │    ├─ Compute distances: ||x - centroid||²
   │    ├─ Assign points to nearest centroid (argmin)
   │    ├─ Update centroids (mean of assigned points)
   │    └─ Check convergence: ||delta_centroids|| < tol
   ├─ Return cluster assignments (per point)
   └─ Log: "✓ KMeans complete: {k} clusters"

e) Write Results to Postgres (CPU work)
   ├─ For each packet_key, cluster_id pair:
   │  UPDATE atlas_feature_envelopes
   │  SET kmeans_centroid_key = $1, updated_at = NOW()
   │  WHERE packet_key = $2
   ├─ Batch write (efficient)
   └─ Log: "📝 Updated {N} rows in Postgres"

f) Acknowledge Message (RabbitMQ)
   ├─ channel.basic_ack(delivery_tag=method.delivery_tag)
   └─ Log: "✅ Message acknowledged"

g) Emit Completion Event (optional)
   └─ Publish to topology.results queue for monitoring
```

---

## Computational Details: KMeans on GPU

### Algorithm (PyTorch CUDA)

**Input**: 
- Embeddings: tensor of shape (4725, 768) — 768-dim vectors from Qdrant
- k=10 clusters
- max_iter=50 iterations

**Initialization**:
```python
# Random initialization (or kmeans++)
centroids = embeddings[torch.randperm(embeddings.size(0))[:k]]  # k random vectors
# OR use kmeans++ for better initial placement
```

**Main Loop** (each iteration is GPU-accelerated):
```python
for iteration in range(max_iter):
    # 1. Compute distances: ||embedding - centroid||²
    distances = torch.cdist(embeddings, centroids)  # shape (4725, 10)
    
    # 2. Assign to nearest cluster
    cluster_assignments = torch.argmin(distances, dim=1)  # shape (4725,)
    
    # 3. Update centroids
    new_centroids = []
    for cluster_id in range(k):
        mask = (cluster_assignments == cluster_id)
        if mask.sum() > 0:
            new_centroids.append(embeddings[mask].mean(dim=0))
        else:
            # Keep old centroid if empty cluster (or reinitialize)
            new_centroids.append(centroids[cluster_id])
    new_centroids = torch.stack(new_centroids)
    
    # 4. Check convergence
    delta = torch.norm(new_centroids - centroids)
    if delta < tol:  # 1e-4
        break
    centroids = new_centroids
```

**Output**:
- `cluster_assignments`: array of shape (4725,) with values 0-9 (cluster IDs)
- `centroids`: final cluster centers, shape (10, 768)

**Performance**:
- CPU baseline: 2-3 minutes for 4,725 vectors
- GPU (RTX 3060 Ti): ~13 seconds
- **Speedup: 10-14×**

---

## Database Schema: Writing Results

### Table: `atlas_feature_envelopes`

**Columns Updated** (per packet):

```sql
UPDATE atlas_feature_envelopes
SET
  kmeans_centroid_key = 'kmeans_centroid:{cluster_id}',  -- e.g., 'kmeans_centroid:3'
  updated_at = NOW()
WHERE packet_key = $1;
```

**Example**:
```sql
UPDATE atlas_feature_envelopes
SET kmeans_centroid_key = 'kmeans_centroid:3', updated_at = NOW()
WHERE packet_key = 'packet:000001';
```

**Verification Query**:
```sql
SELECT
  COUNT(*) as total,
  COUNT(CASE WHEN kmeans_centroid_key IS NOT NULL THEN 1 END) as with_kmeans,
  COUNT(DISTINCT SPLIT_PART(kmeans_centroid_key, ':', 2)::int) as unique_clusters
FROM atlas_feature_envelopes
WHERE packet_key IN (
  SELECT packet_key FROM atlas_packets
  WHERE qdrant_point_id IS NOT NULL  -- Qdrant-indexed only
);
```

**Expected Result**:
```
total       | with_kmeans | unique_clusters
─────────────────────────────────────────────
4725        | 4725        | 10
```

---

## SOM (Self-Organizing Map) Enrichment

**Similar to KMeans, but**:

### Algorithm:
```
1. Initialize 10×10 grid of neurons (100 neurons total)
2. For 20 epochs (learn_rate decays from 0.5 → 0.1):
   For each embedding:
     a. Find Best Matching Unit (BMU) — nearest neuron
     b. Update BMU + neighborhood (Gaussian kernel)
     c. Decay learning rate and neighborhood radius
3. Output: grid_x, grid_y coordinates per packet
```

### Database Write:
```sql
UPDATE atlas_feature_envelopes
SET
  som_centroid_key = 'som_cell:{grid_x}:{grid_y}',  -- e.g., 'som_cell:3:7'
  som_row = grid_x,
  som_col = grid_y,
  updated_at = NOW()
WHERE packet_key = $1;
```

---

## PageRank Enrichment

**Different algorithm** (graph-based):

### Algorithm:
```
1. Build adjacency matrix from topology edges
2. Run PageRank iterations (30 iterations):
   rank(i) = (1-d)/N + d * Σ(rank(j) / out_degree(j))
   where d=0.85 (damping factor)
3. Output: PageRank score per node (0.0-1.0)
```

### Database Write:
```sql
UPDATE atlas_feature_envelopes
SET
  pagerank = score,  -- 0.0-1.0
  updated_at = NOW()
WHERE packet_key = $1;
```

---

## Monitoring & Verification

### Real-Time Monitoring

**RabbitMQ Queue Status**:
```bash
docker exec legal-ai-rabbitmq rabbitmqctl list_queues name messages consumers
```

Expected output during consumer execution:
```
topology.kmeans    | 0 | 1    (consumer is actively processing)
topology.som       | 1 | 0    (waiting for SOM consumer)
topology.pagerank  | 1 | 0    (waiting for PageRank consumer)
```

### Postgres Verification (Every 5-10 seconds)

```bash
docker exec legal-ai-postgres psql -U legal_admin -d legal_ai_db -c "
  SELECT
    COUNT(*) as total,
    COUNT(CASE WHEN kmeans_centroid_key IS NOT NULL THEN 1 END) as with_kmeans,
    COUNT(CASE WHEN som_centroid_key IS NOT NULL THEN 1 END) as with_som,
    COUNT(CASE WHEN pagerank IS NOT NULL THEN 1 END) as with_pagerank
  FROM atlas_feature_envelopes
  WHERE packet_key IN (SELECT packet_key FROM atlas_packets WHERE qdrant_point_id IS NOT NULL);
"
```

**Expected Progress**:
```
Time     | total | with_kmeans | with_som | with_pagerank
───────────────────────────────────────────────────────────
0 min    | 4725  |     0       |   0      |     0
5 min    | 4725  |  2500       |   0      |     0      (KMeans half-done)
13 min   | 4725  |  4725       |   0      |     0      (KMeans complete)
20 min   | 4725  |  4725       | 1500     |     0      (SOM in progress)
28 min   | 4725  |  4725       | 4725     |     0      (SOM complete)
35 min   | 4725  |  4725       | 4725     |  4725      (PageRank complete)
```

**Total Duration**: ~35-45 minutes for 4,725 packets on RTX 3060 Ti

---

## Error Handling & Retry

### Consumer Failure Handling

```python
def on_message_received(ch, method, properties, body):
    try:
        # ... GPU computation ...
        # ... Postgres write ...
        ch.basic_ack(delivery_tag=method.delivery_tag)  # Success
    except Exception as e:
        # Negative ACK = re-queue message (retry)
        ch.basic_nack(delivery_tag=method.delivery_tag, requeue=True)
        log(f"❌ Error: {str(e)} | Message re-queued", 'ERROR')
```

### Retry Behavior:
- Failed message returns to queue (at end)
- Consumer can retry
- Max retries: Configurable (default: 3)
- After max retries: dead-letter queue (or discard)

---

## Canonical P2E Pipeline (Complete)

```
┌─────────────────────────────────────────────────────────────────────┐
│                    CANONICAL 12-STEP PIPELINE                        │
└─────────────────────────────────────────────────────────────────────┘

1. Identity (Postgres atlas_packets)
   ↓
2. AST (Deterministic symbol extraction)
   ↓
3. Lexical (BM25 token extraction)
   ↓
4. Embeddings (768-dim via Ollama embeddinggemma)
   ↓
5. Gemma4 (Semantic grounding summary)
   ↓
6. FeatureEnvelope (Unified materialization) ←— P2D COMPLETE ✓
   ↓
7. Topology Enrichment (GPU KMeans/SOM/PageRank) ←— P2E CURRENT
   │
   ├─ KMeans: k=10 clusters
   ├─ SOM: 10×10 grid mapping
   └─ PageRank: authority scores
   ↓
8. XGBoost (Domain classification)
   ↓
9. Ontology (Semantic relationships)
   ↓
10. Qdrant (Vector index mirror)
    ↓
11. Retrieval (BM25 + Vector ANN + Graph)
    ↓
12. Synthesis (Gemma4 + ACE context packing)
```

---

## Key Insights

### Why GPU?
- **KMeans**: 10-14× faster (13s vs 2-3 min)
- **SOM**: 5-10× faster (6s vs 30-60s)
- **PageRank**: 2-3× faster (3s vs 5-10s)

### Why RabbitMQ?
- Decouples CPU (publish) from GPU (compute)
- Allows parallel consumer threads
- Message persistence for reliability
- Dead-letter queues for failures

### Why Separate Consumers?
- Each worker runs one algorithm (KMeans, SOM, or PageRank)
- Can scale to multiple GPUs (one consumer per GPU)
- Independent retry logic per algorithm
- Monitor per-queue throughput

### Performance Target
- **Throughput**: 3,000-4,000 packets/hour on RTX 3060 Ti
- **4,725 packets**: 35-45 minutes total
- **Full corpus (58,365)**: 14-20 hours (if all indexed in Qdrant)

---

## Next Actions

1. **Start KMeans Consumer** (Foreground or Background)
   ```bash
   python python-workers/consumer_topology_kmeans.py
   ```

2. **Start SOM Consumer** (Separate Terminal)
   ```bash
   python python-workers/consumer_topology_som.py
   ```

3. **Start PageRank Consumer** (Separate Terminal)
   ```bash
   python python-workers/consumer_topology_pagerank.py
   ```

4. **Monitor Progress** (Every 5-10 seconds)
   ```bash
   docker exec legal-ai-postgres psql -U legal_admin -d legal_ai_db -c "
     SELECT COUNT(*) as total, COUNT(CASE WHEN kmeans_centroid_key IS NOT NULL THEN 1 END) as with_kmeans FROM atlas_feature_envelopes WHERE qdrant_point_id IS NOT NULL;
   "
   ```

5. **Verify Completion**
   - All 4,725 packets should have kmeans_centroid_key, som_centroid_key, pagerank populated
   - RabbitMQ queues should be empty (all messages processed)

---

## Canonical Identity Contract (P2E)

**Every enriched packet maintains**:
- `packet_key` (identity, never changes)
- `source_ref` (origin path)
- `qdrant_point_id` (embedding index)
- `kmeans_centroid_key` (NEW: cluster assignment)
- `som_centroid_key` (NEW: grid position)
- `pagerank` (NEW: authority score)

**All writes to Postgres** (truth source):
- Qdrant is mirror (not source)
- Redis is cache (not source)
- Neo4j is topology (not source)

---

**Status**: 🟢 **READY TO EXECUTE P2E GPU ENRICHMENT**

See `P2-PHASE-EXECUTION-SESSION-138.md` for full context.
