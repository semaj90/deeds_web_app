# P2E Quick Start — WSL2 Ubuntu (5 min setup → 35-45 min execution)

**Status**: ✅ Ready to execute immediately  
**Environment**: WSL2 Ubuntu 24.04.3 LTS, conda `atlas-rapids-cu13`, PyTorch 2.13.0+cu130  
**Target**: Enrich 4,725 packets with GPU KMeans/SOM/PageRank topology

---

## Pre-Flight (30 seconds)

### Verify Services Running

```powershell
# Windows: Open PowerShell
docker ps | Select-String "postgres|rabbitmq|qdrant"

# Should show 3 healthy containers ✓
```

### Verify RabbitMQ Has Jobs (from Session 138)

```powershell
# Check queue status
curl -s http://localhost:15672/api/queues -u guest:guest | jq '.[] | select(.name | contains("topology")) | {name, messages}'

# Expected:
# topology.kmeans: 2 messages
# topology.som: 2 messages
# topology.pagerank: 2 messages

# If empty, republish:
cd sveltekit-frontend
node scripts/atlas/p2e-rabbitmq-job-publish.mjs --limit=4725
```

---

## Execution (3 terminals, ~40 min)

### Terminal 1: KMeans (WSL2 Ubuntu)

```bash
wsl.exe -d Ubuntu

cd /home/james/deeds-web-app
conda activate atlas-rapids-cu13

python python-workers/consumer_topology_kmeans.py

# Watch for:
# ✓ Connected to RabbitMQ
# 📨 Message received
# 🔄 Running KMeans...
# ✓ KMeans complete: 10 clusters
# 📝 Updated 4725 rows in Postgres
# ✅ Message acknowledged

# Time: ~13 seconds
# Then exits cleanly (job done)
```

### Terminal 2: SOM (WSL2 Ubuntu — new terminal)

```bash
wsl.exe -d Ubuntu

cd /home/james/deeds-web-app
conda activate atlas-rapids-cu13

python python-workers/consumer_topology_som.py

# Similar output, SOM training
# Time: ~8 seconds
```

### Terminal 3: PageRank (WSL2 Ubuntu — new terminal)

```bash
wsl.exe -d Ubuntu

cd /home/james/deeds-web-app
conda activate atlas-rapids-cu13

python python-workers/consumer_topology_pagerank.py

# Similar output, PageRank computation
# Time: ~7 seconds
```

### Terminal 4: Monitor (Windows PowerShell — parallel)

```powershell
# Run every 5-10 seconds to watch progress
while ($true) {
  Write-Host "=== $(Get-Date -Format 'HH:mm:ss') ===" -ForegroundColor Cyan
  docker exec legal-ai-postgres psql -U legal_admin -d legal_ai_db -c "
    SELECT 
      COUNT(*) as total,
      COUNT(CASE WHEN kmeans_centroid_key IS NOT NULL THEN 1 END) as kmeans,
      COUNT(CASE WHEN som_centroid_key IS NOT NULL THEN 1 END) as som,
      COUNT(CASE WHEN pagerank IS NOT NULL THEN 1 END) as pagerank
    FROM atlas_feature_envelopes
    WHERE qdrant_point_id IS NOT NULL;
  "
  Start-Sleep -Seconds 10
}

# Watch these columns increment:
# total | kmeans | som | pagerank
# 4725  | 0      | 0   | 0     (start)
# 4725  | 4725   | 0   | 0     (KMeans done, 13 min)
# 4725  | 4725   | 4725| 0     (SOM done, 21 min)
# 4725  | 4725   | 4725| 4725  (PageRank done, 28 min)
```

---

## Post-Execution (2 min)

### Verify Enrichment Complete

```bash
# WSL2 Ubuntu (after consumers finish)
conda activate atlas-rapids-cu13

python << 'EOF'
import psycopg2

conn = psycopg2.connect(
    host='127.0.0.1',
    port=5432,
    user='legal_admin',
    password='123456',
    database='legal_ai_db'
)
cursor = conn.cursor()

cursor.execute("""
  SELECT
    COUNT(*) as total,
    COUNT(CASE WHEN kmeans_centroid_key IS NOT NULL THEN 1 END) as kmeans,
    COUNT(CASE WHEN som_centroid_key IS NOT NULL THEN 1 END) as som,
    COUNT(CASE WHEN pagerank IS NOT NULL THEN 1 END) as pagerank
  FROM atlas_feature_envelopes
  WHERE qdrant_point_id IS NOT NULL;
""")

row = cursor.fetchone()
print(f"Total enriched: {row[0]}/4725")
print(f"  KMeans: {row[1]} ✓" if row[1] == 4725 else f"  KMeans: {row[1]} ✗")
print(f"  SOM: {row[2]} ✓" if row[2] == 4725 else f"  SOM: {row[2]} ✗")
print(f"  PageRank: {row[3]} ✓" if row[3] == 4725 else f"  PageRank: {row[3]} ✗")

if row[1] == 4725 and row[2] == 4725 and row[3] == 4725:
    print("\n✅ P2E TOPOLOGY ENRICHMENT COMPLETE!")
else:
    print("\n⚠️ Some enrichment incomplete, check consumer logs")

conn.close()
EOF
```

---

## Success Checklist

- [ ] All 3 consumers started without errors
- [ ] Monitor terminal shows all 3 columns incrementing
- [ ] KMeans completes in ~13 seconds
- [ ] SOM completes in ~8 seconds
- [ ] PageRank completes in ~7 seconds
- [ ] Final verification query shows 4725/4725 for all columns
- [ ] Consumers exit cleanly (no hanging processes)

---

## If Something Goes Wrong

### Consumers Won't Connect to RabbitMQ

```bash
# Check RabbitMQ is accessible from WSL2
nc -zv 127.0.0.1 5672

# If fails, Docker may not be bridging correctly
# Option 1: Restart Docker Desktop on Windows
# Option 2: Try WSL2 gateway IP instead:
ifconfig | grep "inet" | grep -v 127.0.0.1
# Use that IP in consumer script RABBITMQ_HOST
```

### CUDA Out of Memory

```bash
# Very unlikely on 8GB GPU for 4725×768 vectors
# But if it happens, reduce in consumer script:
# BATCH_SIZE = 256 (instead of 512)
# MAX_VECTORS_GPU = 4000 (instead of 4725)
```

### Postgres Connection Fails

```bash
# From WSL2, containers are on same Docker network
# Host should be 127.0.0.1 and port 5432
# If that fails, check Windows has port 5434 mapped:
docker port legal-ai-postgres | grep 5432
# Should show: 5432/tcp -> 0.0.0.0:5434
```

---

## Files Reference

| File | Purpose |
|------|---------|
| `python-workers/consumer_topology_kmeans.py` | KMeans GPU worker |
| `python-workers/consumer_topology_som.py` | SOM GPU worker |
| `python-workers/consumer_topology_pagerank.py` | PageRank GPU worker |
| `docs/P2E-GPU-ENRICHMENT-FLOW.md` | Architecture deep-dive |
| `docs/P2-PHASE-EXECUTION-SESSION-138.md` | Full execution details |
| `docs/P2E-EXECUTION-CHECKLIST.md` | Detailed checklist with troubleshooting |

---

## Timeline

| Activity | Time | Status |
|----------|------|--------|
| Pre-flight verification | 1 min | ✓ |
| Start KMeans consumer | 1 min | ✓ |
| Start SOM consumer | 1 min | ✓ |
| Start PageRank consumer | 1 min | ✓ |
| KMeans execution | 13 sec | GPU |
| SOM execution | 8 sec | GPU (parallel with KMeans I/O wait) |
| PageRank execution | 7 sec | GPU (parallel with SOM I/O wait) |
| Postgres writes & acknowledgments | 25-35 min | I/O |
| Post-execution verification | 2 min | ✓ |
| **Total** | **35-45 min** | **Ready now** |

---

## What Happens Next (P2F+)

After P2E completes:
- **P2F**: XGBoost domain classification (uses enriched topology as features)
- **P2G-P2H**: Ontology extraction (semantic relationship learning)
- **P2I-P2J**: Qdrant sync + retrieval pipeline wiring

But first: **Execute P2E and verify topology enrichment is live.**

---

## One Command to Rule Them All

Want to verify everything is ready? Run this from WSL2:

```bash
conda activate atlas-rapids-cu13 && python << 'EOF'
import torch, pika, psycopg2
print(f"✓ PyTorch {torch.__version__}")
print(f"✓ CUDA {torch.cuda.is_available()}")
print(f"✓ GPU {torch.cuda.get_device_name(0) if torch.cuda.is_available() else 'N/A'}")
pika.BlockingConnection(pika.ConnectionParameters('127.0.0.1', 5672)).close()
print(f"✓ RabbitMQ connected")
pg = psycopg2.connect(host='127.0.0.1', port=5432, user='legal_admin', password='123456', database='legal_ai_db')
print(f"✓ Postgres connected ({pg.get_dsn_parameters()['dbname']})")
pg.close()
print("\n✅ All systems ready for P2E execution!")
EOF
```

---

## Go Execute P2E! 🚀

Everything is ready. Start with Terminal 1 (KMeans), then Terminal 2 (SOM), Terminal 3 (PageRank), and keep Terminal 4 (Monitor) running.

Expected total time: **35-45 minutes to enrich 4,725 packets with GPU topology.**

