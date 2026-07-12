# P2E GPU Topology Enrichment — Execution Checklist

**Target**: Enrich 4,725 Qdrant-indexed packets with GPU-accelerated KMeans/SOM/PageRank  
**Duration**: 35-45 minutes total (13s + 8s + 7s compute + I/O overhead)  
**Environment**: WSL2 Ubuntu 24.04.3 LTS, Miniforge3, conda env `atlas-rapids-cu13`

---

## Pre-Flight Verification (5 min)

### Windows Terminal

```powershell
# 1. Verify Postgres is running
docker ps | Select-String "legal-ai-postgres"
# Expected: Container UP ✓

# 2. Verify RabbitMQ is running
docker ps | Select-String "legal-ai-rabbitmq"
# Expected: Container UP ✓

# 3. Verify Qdrant is running
docker ps | Select-String "legal-ai-qdrant"
# Expected: Container UP ✓

# 4. Check RabbitMQ queue status (jobs should be queued from Session 138)
curl -s http://localhost:15672/api/queues -u guest:guest | jq '.[] | select(.name | contains("topology")) | {name, messages}'
# Expected: topology.kmeans (2 messages), topology.som (2 messages), topology.pagerank (2 messages)
```

### WSL2 Ubuntu Terminal

```bash
# 1. Verify conda environment
conda list -n atlas-rapids-cu13 | grep torch
# Expected: torch 2.13.0+cu130 ✓

# 2. Verify CUDA accessibility
nvidia-smi | grep -E "RTX|NVIDIA"
# Expected: NVIDIA GeForce RTX 3060 Ti ✓

# 3. Quick GPU test
conda activate atlas-rapids-cu13
python << 'EOF'
import torch
assert torch.cuda.is_available(), "CUDA not available"
assert torch.version.cuda == "13.0", f"Wrong CUDA version: {torch.version.cuda}"
print(f"✓ PyTorch {torch.__version__}")
print(f"✓ GPU: {torch.cuda.get_device_name(0)}")
print(f"✓ VRAM: {torch.cuda.get_device_properties(0).total_memory / 1e9:.1f} GB")
EOF
# Expected: All assertions pass ✓
```

---

## Execution (30 min)

### Terminal 1: KMeans GPU Consumer

```bash
# WSL2 Ubuntu terminal
cd /home/james/deeds-web-app
conda activate atlas-rapids-cu13

# Start KMeans consumer (will block, listening for messages)
python python-workers/consumer_topology_kmeans.py

# Expected output:
# ✓ Connected to RabbitMQ at 127.0.0.1:5672
# ✓ GPU: NVIDIA GeForce RTX 3060 Ti, VRAM: 8.0 GB
# 📨 Message received: run_id=p2e-kmeans-001
# ✓ Fetched 4725 embeddings (768-dim) from Qdrant
# ✓ Running KMeans: k=10, max_iter=50
#   Iteration 1/50: delta=0.0142
#   ...
#   Iteration 48/50: delta=0.000098 → CONVERGED
# ✓ KMeans complete: 10 clusters
# 📝 Updated 4725 rows in Postgres (kmeans_centroid_key)
# ✅ Message acknowledged

# Total time: ~13 seconds (GPU-accelerated)
```

### Terminal 2: SOM GPU Consumer

```bash
# WSL2 Ubuntu terminal (new window/tab)
cd /home/james/deeds-web-app
conda activate atlas-rapids-cu13

# Start SOM consumer
python python-workers/consumer_topology_som.py

# Expected output:
# ✓ Connected to RabbitMQ
# 📨 Message received: run_id=p2e-som-001
# ✓ Training SOM: 10×10 grid, 20 epochs
#   Epoch 1/20: BMU update complete
#   ...
#   Epoch 20/20: learning_rate=0.1 → final adjustment
# ✓ SOM training complete
# 📝 Updated 4725 rows in Postgres (som_centroid_key)
# ✅ Message acknowledged

# Total time: ~8 seconds
```

### Terminal 3: PageRank GPU Consumer

```bash
# WSL2 Ubuntu terminal (new window/tab)
cd /home/james/deeds-web-app
conda activate atlas-rapids-cu13

# Start PageRank consumer
python python-workers/consumer_topology_pagerank.py

# Expected output:
# ✓ Connected to RabbitMQ
# 📨 Message received: run_id=p2e-pagerank-001
# ✓ Running PageRank: 30 iterations, damping=0.85
#   Iteration 1/30: delta=0.0234
#   ...
#   Iteration 30/30: converged
# ✓ PageRank complete
# 📝 Updated 4725 rows in Postgres (pagerank score)
# ✅ Message acknowledged

# Total time: ~7 seconds
```

### Terminal 4: Monitor Progress (parallel with consumers)

```bash
# Windows PowerShell (real-time progress)
# Run every 5-10 seconds to watch enrichment progress

while ($true) {
  docker exec legal-ai-postgres psql -U legal_admin -d legal_ai_db -c "
    SELECT 
      COUNT(*) as total,
      COUNT(CASE WHEN kmeans_centroid_key IS NOT NULL THEN 1 END) as with_kmeans,
      COUNT(CASE WHEN som_centroid_key IS NOT NULL THEN 1 END) as with_som,
      COUNT(CASE WHEN pagerank IS NOT NULL THEN 1 END) as with_pagerank
    FROM atlas_feature_envelopes
    WHERE qdrant_point_id IS NOT NULL;
  "
  Start-Sleep -Seconds 5
}

# Expected progression:
# Time    | Total | KMeans | SOM   | PageRank
# --------|-------|--------|-------|----------
# 0 min   | 4725  | 0      | 0     | 0
# 5 min   | 4725  | 2500   | 0     | 0      (KMeans 50% done)
# 13 min  | 4725  | 4725   | 0     | 0      (KMeans complete)
# 21 min  | 4725  | 4725   | 4725  | 0      (SOM complete)
# 28 min  | 4725  | 4725   | 4725  | 4725   (PageRank complete)
```

---

## Post-Execution Verification (5 min)

### Verify All Rows Enriched

```bash
# WSL2 Ubuntu
conda activate atlas-rapids-cu13

python << 'EOF'
import psycopg2

conn = psycopg2.connect(
    host='127.0.0.1',
    port=5432,  # Container port (or 5434 if accessing via Windows)
    user='legal_admin',
    password='123456',
    database='legal_ai_db'
)
cursor = conn.cursor()

cursor.execute("""
  SELECT
    COUNT(*) as total,
    COUNT(CASE WHEN kmeans_centroid_key IS NOT NULL THEN 1 END) as with_kmeans,
    COUNT(CASE WHEN som_centroid_key IS NOT NULL THEN 1 END) as with_som,
    COUNT(CASE WHEN pagerank IS NOT NULL THEN 1 END) as with_pagerank,
    COUNT(DISTINCT SPLIT_PART(kmeans_centroid_key, ':', 2)::int) as kmeans_clusters,
    COUNT(DISTINCT SPLIT_PART(som_centroid_key, ':', 2)::int) as som_cells
  FROM atlas_feature_envelopes
  WHERE qdrant_point_id IS NOT NULL;
""")

result = cursor.fetchone()
print(f"✓ Total packets enriched: {result[0]} / 4725")
print(f"✓ KMeans: {result[1]} packets with cluster assignments (expected 10 clusters: {result[4]})")
print(f"✓ SOM: {result[2]} packets with grid positions (expected 100 cells: {result[5]})")
print(f"✓ PageRank: {result[3]} packets with authority scores")

if result[1] == 4725 and result[2] == 4725 and result[3] == 4725:
    print("\n✅ P2E TOPOLOGY ENRICHMENT COMPLETE")
else:
    print("\n⚠️ Enrichment incomplete, check consumer logs")

conn.close()
EOF
```

### Sample Results Row

```sql
-- Verify a single enriched row
SELECT packet_key, kmeans_centroid_key, som_centroid_key, pagerank
FROM atlas_feature_envelopes
WHERE qdrant_point_id IS NOT NULL
LIMIT 1;

-- Expected output:
-- packet_key             | kmeans_centroid_key  | som_centroid_key | pagerank
-- packet:000001          | kmeans_centroid:3    | som_cell:7:2     | 0.0847
```

---

## Troubleshooting

### Issue: RabbitMQ Queue Empty (No Messages)

**Symptom**: Consumers start but immediately exit waiting for messages

**Fix**:
```bash
# Republish jobs from Windows Terminal:
cd sveltekit-frontend
node scripts/atlas/p2e-rabbitmq-job-publish.mjs --limit=4725

# Verify queues repopulated:
curl -s http://localhost:15672/api/queues -u guest:guest | jq '.[] | select(.name | contains("topology")) | {name, messages}'
```

### Issue: CUDA Out of Memory

**Symptom**: RuntimeError: CUDA out of memory

**Fix**:
```bash
# Reduce batch size in consumer script:
# Edit: python-workers/consumer_topology_kmeans.py
# Change: BATCH_SIZE = 512 → 256
# Change: MAX_VECTORS_GPU = 4725 → 4000

# Restart consumer
python consumer_topology_kmeans.py
```

### Issue: Connection Refused on 127.0.0.1:5432

**Symptom**: psycopg2.OperationalError: could not connect

**Fix**:
```bash
# From WSL2, use Docker network IP instead:
# Edit .env or consumer script:
POSTGRES_HOST=host.docker.internal  # or use: ip route show default | awk '{print $3}'

# From Windows, verify port mapping:
docker ps | grep postgres
# Expected: 5432 mapped to 5434 (or similar)
```

---

## Timeline & Metrics

| Phase | Component | Expected Time | GPU Speedup | VRAM Used |
|-------|-----------|---------------|-------------|-----------|
| KMeans | 4,725 vectors, k=10, 50 iter | 13 sec | 10-14× | ~2.5 GB |
| SOM | 10×10 grid, 20 epochs | 8 sec | 5-8× | ~1.8 GB |
| PageRank | 30 iterations | 7 sec | 2-3× | ~1.2 GB |
| **Total** | **All 3 workers parallel** | **28 sec compute** | — | **Peak: 2.5 GB** |
| **With I/O** | RabbitMQ + Postgres writes | 35-45 min | — | — |

**Note**: Wall-clock time is 35-45 min because:
- Consumers run sequentially (one job at a time, not parallel)
- I/O overhead (Qdrant fetch, Postgres updates) adds 30-40 sec per job
- RabbitMQ message acknowledgment + retry logic adds latency

---

## Success Criteria

✅ **P2E Complete When:**
1. All 3 consumers finish without errors
2. Postgres shows 4,725 rows with `kmeans_centroid_key` (values like `kmeans_centroid:0` to `kmeans_centroid:9`)
3. Postgres shows 4,725 rows with `som_centroid_key` (values like `som_cell:0:0` to `som_cell:9:9`)
4. Postgres shows 4,725 rows with `pagerank` scores (0.0-1.0 range)
5. All consumers acknowledge messages and exit gracefully

---

## Next Phase

After P2E completion:
- **P2F** — Concept extraction (XGBoost domain classification)
- **P2G-P2H** — Ontology alignment (semantic relationship extraction)
- **P2I-P2J** — Qdrant mirror sync + retrieval pipeline integration

