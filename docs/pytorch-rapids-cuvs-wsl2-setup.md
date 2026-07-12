# PyTorch + RAPIDS + cuVS Setup for WSL2 Ubuntu

**Last Updated:** July 11, 2026  
**Target:** P2E GPU Topology Enrichment (KMeans, SOM, PageRank)  
**Hardware:** RTX 3060 Ti, 8GB VRAM, Windows 10 + WSL2 Ubuntu

---

## Overview

This guide covers three GPU acceleration stacks for WSL2 Ubuntu:

1. **PyTorch** (primary for P2E) — CPU/GPU tensor operations
2. **RAPIDS** (optional) — GPU-accelerated DataFrame operations
3. **cuVS** (optional future) — GPU vector search (CAGRA, IVF-Flat)

The **hard rule** from the project CLAUDE.md: PyTorch + Qdrant + TurboVec is the current stack. cuVS is a future research lane (Phase TODO), not part of P2E.

**For P2E execution:** Only PyTorch is required. RAPIDS/cuVS are documented for reference.

---

## Part 1: PyTorch CUDA 13.0 Setup (P2E Required)

### Step 1: Open WSL2 Ubuntu Terminal

```bash
# From PowerShell on Windows:
wsl.exe -d Ubuntu

# Or from Windows Terminal: Select Ubuntu profile
```

### Step 2: Verify CUDA in WSL2

```bash
# Check if CUDA is accessible (should show RTX 3060 Ti)
nvidia-smi

# Expected output:
# +-----------------------------------------------------------------------------+
# | NVIDIA-SMI 555.99  Driver Version: 555.99  CUDA Version: 12.5              |
# +-----------------------------------------------------------------------------+
# | GPU  Name        Persistence-M | Bus-Id    Disp.A | Volatile Uncorr. ECC   |
# | No.  Name        Persistence-M | Bus-Id    Disp.A | Volatile Uncorr. ECC   |
# |   0  NVIDIA RTX 3060 Ti        Off | 00:1F.0     Off |                  N/A |
# | N/A   58°C    P8    30W /  420W |      0MiB /  8192MiB |      0%   Default |
# +-----------------------------------------------------------------------------+
```

If `nvidia-smi` fails, ensure:
- Docker Desktop on Windows has "Use the WSL 2 based engine" enabled
- GPU device passthrough (`/dev/dxgkrnl`) is working
- NVIDIA driver on Windows is up-to-date (555.99 or later)

### Step 3: Create Python Virtual Environment

```bash
cd ~/deeds-web-app/python-workers

# Create venv with CUDA support naming
python3.11 -m venv .venv-cu130

# Activate it
source .venv-cu130/bin/activate

# Verify Python
python --version  # Should be 3.11.x or 3.10.x
```

### Step 4: Install PyTorch with CUDA 13.0 Support

```bash
# Install PyTorch 2.6+ with CUDA 13.x wheels
pip install torch torchvision torchaudio --index-url https://download.pytorch.org/whl/cu130

# Verify PyTorch install
python verify-gpu.py

# Expected output:
# PyTorch: 2.6.0+cu130
# CUDA Available: True
# GPU: NVIDIA RTX 3060 Ti
# VRAM: 8.0 GB
```

### Step 5: Install Dependencies for GPU Workers

```bash
# RabbitMQ client (AMQP message consumer)
pip install pika==1.3.2

# Postgres client
pip install psycopg2-binary==2.9.9

# NumPy (used by PyTorch)
pip install numpy==1.24.3

# Additional utilities
pip install python-dotenv==1.0.0

# Verify all imports work
python -c "import torch, pika, psycopg2, numpy; print('✓ All imports successful')"
```

### Step 6: Create `.env` for Python Workers

```bash
cat > ~/deeds-web-app/python-workers/.env << 'EOF'
# RabbitMQ connection
RABBITMQ_HOST=127.0.0.1
RABBITMQ_PORT=5672
RABBITMQ_USER=guest
RABBITMQ_PASSWORD=guest

# Postgres connection (via Windows host or Docker bridge)
POSTGRES_HOST=127.0.0.1
POSTGRES_PORT=5434
POSTGRES_USER=legal_admin
POSTGRES_PASSWORD=123456
POSTGRES_DB=legal_ai_db

# GPU settings
CUDA_VISIBLE_DEVICES=0
TORCH_DTYPE=float32
BATCH_SIZE=512

# Logging
LOG_LEVEL=INFO
EOF

# Verify Docker bridge access from WSL2
# Windows host → Docker Desktop → WSL2 containers
# Use 127.0.0.1:5434 (host port-mapped from container 5432)
```

### Step 7: Test GPU Worker Locally

```bash
# Verify KMeans consumer can import and connect
cd ~/deeds-web-app/python-workers
source .venv-cu130/bin/activate

# Dry-run: Connect to RabbitMQ (will fail if not accessible yet)
python consumer_topology_kmeans.py --dry-run --limit=10

# Or test GPU directly:
python << 'PYEOF'
import torch
print(f"PyTorch: {torch.__version__}")
print(f"CUDA available: {torch.cuda.is_available()}")
print(f"GPU: {torch.cuda.get_device_name(0)}")

# Test KMeans on GPU
from torch.nn.functional import normalize
X = torch.randn(1000, 768, device='cuda')  # 1000 vectors, 768-dim
kmeans = torch.nn.functional.normalize(X, p=2, dim=1)
print(f"✓ GPU tensor ops working (norm shape: {kmeans.shape})")
PYEOF
```

---

## Part 2: Verify WSL2 ↔ Docker Networking

The challenge: RabbitMQ and Postgres run in Docker containers on the WSL2 kernel. Python in WSL2 Ubuntu needs to access them.

### Networking Setup

```bash
# From WSL2 Ubuntu terminal:

# 1. Test Docker bridge connectivity
# Windows 10 exposes container ports via 127.0.0.1 (localhost)
nc -zv 127.0.0.1 5672  # RabbitMQ
nc -zv 127.0.0.1 5434  # Postgres (Windows port-mapped)

# 2. If nc fails, install netcat:
apt-get update && apt-get install -y netcat-openbsd

# 3. Test with Python
python << 'EOF'
import socket
import sys

def test_port(host, port, name):
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        s.settimeout(2)
        result = s.connect_ex((host, port))
        s.close()
        if result == 0:
            print(f"✓ {name:30} {host}:{port} accessible")
            return True
        else:
            print(f"✗ {name:30} {host}:{port} NOT accessible (timeout)")
            return False
    except Exception as e:
        print(f"✗ {name:30} {host}:{port} ERROR: {e}")
        return False

# Test container accessibility
test_port('127.0.0.1', 5672, 'RabbitMQ')
test_port('127.0.0.1', 5434, 'Postgres')
test_port('127.0.0.1', 6379, 'Valkey/Redis')
test_port('127.0.0.1', 6333, 'Qdrant')
test_port('127.0.0.1', 7687, 'Neo4j')
EOF
```

### If Connectivity Fails

**Option A: Docker desktop settings**
- Windows 10: Settings → Docker Desktop → Resources → WSL Integration → Enable Ubuntu

**Option B: Use WSL2 host IP instead of 127.0.0.1**
```bash
# Get WSL2 host IP from inside Ubuntu:
grep -m 1 nameserver /etc/resolv.conf | awk '{print $2}'
# Typically 172.31.x.x or similar

# Test connectivity:
nc -zv <WSL2_HOST_IP> 5672

# Update .env:
RABBITMQ_HOST=<WSL2_HOST_IP>
POSTGRES_HOST=<WSL2_HOST_IP>
```

**Option C: Use Docker hostname**
```bash
# Instead of 127.0.0.1, try Docker DNS:
RABBITMQ_HOST=host.docker.internal  # May not work in WSL2
POSTGRES_HOST=docker.internal

# More reliable: Use Docker gateway
ip route show default | awk '{print $3}'  # Usually 172.17.0.1
```

---

## Part 3: Install & Test P2E GPU Workers

### Step 1: Verify Consumer Script

```bash
cd ~/deeds-web-app/python-workers
source .venv-cu130/bin/activate

# Check script exists
ls -la consumer_topology_kmeans.py

# Read first 50 lines to understand flow
head -50 consumer_topology_kmeans.py
```

### Step 2: Test Consumer Connection (Dry-Run)

```bash
# This will attempt to connect to RabbitMQ
# If it times out, fix networking first (Part 2 above)
python consumer_topology_kmeans.py --dry-run --limit=100

# Expected output:
# ✓ Connected to RabbitMQ
# ✓ Channel created
# ✓ Queue declared: topology.kmeans
# ✓ Waiting for messages (Press Ctrl+C to exit)...
```

### Step 3: Publish RabbitMQ Jobs (From Windows Terminal)

```powershell
cd sveltekit-frontend

# This runs on Windows (Node.js), publishes to RabbitMQ
node scripts/atlas/p2e-rabbitmq-job-publish.mjs --limit=4725

# Expected output:
# 📦 Phase 2E: RabbitMQ Job Publisher
# ✓ Generated 4725 sample packet keys
# ✓ Published 4725 jobs to topology.kmeans queue
# ✓ Published 4725 jobs to topology.som queue
# ✓ Published 4725 jobs to topology.pagerank queue
```

### Step 4: Start KMeans Consumer (WSL2 Ubuntu)

```bash
cd ~/deeds-web-app/python-workers
source .venv-cu130/bin/activate

# Start consumer (will wait for messages)
python consumer_topology_kmeans.py

# Expected flow:
# ✓ Connected to RabbitMQ at 127.0.0.1:5672
# ✓ GPU: NVIDIA RTX 3060 Ti, VRAM: 8.0 GB
# 📨 Message received: run_id=p2e-kmeans-001, job_type=kmeans_clustering
# ✓ Fetched 4725 embeddings (768-dim) from Qdrant
# ✓ Moving tensors to GPU...
# 🔄 Running KMeans: k=10, max_iter=50, tol=1e-4
#    Iteration  1/50: delta=0.0142
#    Iteration  2/50: delta=0.0089
#    ...
#    Iteration 48/50: delta=0.000098 (< 1e-4) → CONVERGED
# ✓ KMeans complete: 10 clusters
# 📝 Updated 4725 rows in Postgres (kmeans_centroid_key)
# ✅ Message acknowledged
```

### Step 5: Monitor Progress

**Terminal 1 (WSL2 - Consumer Running):**
- Watch KMeans output above

**Terminal 2 (Windows - Postgres Query):**
```powershell
# Monitor Postgres writes in real-time
docker exec legal-ai-postgres psql -U legal_admin -d legal_ai_db -c "
  SELECT 
    COUNT(*) as total,
    COUNT(CASE WHEN kmeans_centroid_key IS NOT NULL THEN 1 END) as with_kmeans,
    COUNT(CASE WHEN som_centroid_key IS NOT NULL THEN 1 END) as with_som,
    COUNT(CASE WHEN pagerank IS NOT NULL THEN 1 END) as with_pagerank
  FROM atlas_feature_envelopes
  WHERE qdrant_point_id IS NOT NULL;
" 

# Run this every 5-10 seconds to see progress
# Expected: with_kmeans count increases 100-200 per query
```

### Step 6: Start SOM & PageRank Consumers (New Terminals)

```bash
# Terminal 3 (WSL2 - SOM):
cd ~/deeds-web-app/python-workers
source .venv-cu130/bin/activate
python consumer_topology_som.py

# Terminal 4 (WSL2 - PageRank):
cd ~/deeds-web-app/python-workers
source .venv-cu130/bin/activate
python consumer_topology_pagerank.py
```

**Expected Timeline:**
- **0 min:** All 3 consumers running, RabbitMQ queues populated
- **13 min:** KMeans completes, 4725 rows have `kmeans_centroid_key`
- **21 min:** SOM completes, 4725 rows have `som_centroid_key`
- **28 min:** PageRank completes, 4725 rows have `pagerank` scores
- **35-45 min:** Total pipeline complete (including I/O)

---

## Part 4: RAPIDS Installation (Optional Future)

**Note:** Not required for P2E. This is for future phases that might use GPU DataFrames or cuML.

### Step 1: Install conda in WSL2

```bash
# Download Miniconda
cd ~
wget https://repo.anaconda.com/miniconda/Miniconda3-latest-Linux-x86_64.sh

# Install
bash Miniconda3-latest-Linux-x86_64.sh -b -p ~/miniconda3

# Add to PATH
echo "export PATH=$HOME/miniconda3/bin:$PATH" >> ~/.bashrc
source ~/.bashrc

# Verify
conda --version
```

### Step 2: Create RAPIDS Environment

```bash
# Create a separate conda env for RAPIDS (different from PyTorch venv)
conda create -n rapids-cu130 python=3.11 -y

# Activate it
conda activate rapids-cu130

# Install RAPIDS (this is a large download ~3GB)
conda install -c rapidsai -c conda-forge -c nvidia \
  rapids-cu130=26.04 \
  cuvs-cu130 \
  cuml-cu130 \
  cudf-cu130 \
  -y

# Verify
python -c "import cudf, cuml; print('✓ RAPIDS installed')"
```

### Step 3: Test cuVS CAGRA Index

```bash
python << 'EOF'
import numpy as np
from cuvs.neighbors import cagra

# Create 1000 768-dim vectors
X = np.random.randn(1000, 768).astype(np.float32)

# Build CAGRA index
index = cagra.build(X, metric='cosine', build_params=cagra.BuildParams(
    n_lists=200,      # Split into 200 clusters
    metric='cosine'
))

print(f"✓ CAGRA index built: {index.trained}")

# Search for nearest neighbors (k=10)
query = X[0:1]  # First vector
neighbors_k10, distances = cagra.search(index, query, k=10)

print(f"✓ Top-10 neighbors: {neighbors_k10[0]}")
print(f"  Distances: {distances[0]}")
EOF
```

### Why cuVS is NOT recommended for P2E:

From project CLAUDE.md:
> Qdrant + `attentionScoreGPU` rerank is the right stack for this hardware. Don't add cuVS.

**Reasons:**
- **Qdrant HNSW** is proven, 40.5K vectors indexed, production-ready
- **cuVS CAGRA** adds 3GB+ VRAM (~375 MB model + 2.6 GB index)
- **RTX 3060 Ti has only 8 GB VRAM total**
- **KMeans/SOM/PageRank already use ~2-3 GB during GPU execution**
- **Result:** OOM crash if both cuVS CAGRA + PyTorch workloads run in parallel

**Future Option:** cuVS is a research lane (Phase TODO). Migrate to RTX 4090 (24GB) or A6000 (48GB) if CAGRA becomes necessary.

---

## Part 5: Troubleshooting

### Issue: `CUDA out of memory` during KMeans

```
RuntimeError: CUDA out of memory. Tried to allocate 2.50 GiB
```

**Fix:** Reduce batch size in `consumer_topology_kmeans.py`:
```python
# Line ~60:
BATCH_SIZE = 256  # Reduce from 512 to 256
MAX_VECTORS_GPU = 4000  # Reduce from 4725 to 4000
```

### Issue: `Connection refused` on 127.0.0.1:5672

```
ConnectionError: Could not connect to 127.0.0.1:5672
```

**Fix:** Follow Part 2 (Networking Setup). Most likely: Docker Desktop not exposing container ports to WSL2.

### Issue: `psycopg2.OperationalError: could not translate host name`

```
psycopg2.OperationalError: could not translate host name
```

**Fix:** Use Windows host IP instead of container name:
```bash
# In .env or consumer script:
POSTGRES_HOST=127.0.0.1
POSTGRES_PORT=5434  # Windows port-mapped to container 5432
```

### Issue: `torch.cuda.is_available() returns False`

```
PyTorch: 2.6.0+cu130
CUDA Available: False
```

**Fix:** Install CPU-only wheels by mistake. Reinstall with correct CUDA version:
```bash
pip uninstall torch -y
pip install torch torchvision torchaudio --index-url https://download.pytorch.org/whl/cu130 --force-reinstall
python verify-gpu.py
```

### Issue: `No module named 'torch'`

```
ModuleNotFoundError: No module named 'torch'
```

**Fix:** Virtual environment not activated:
```bash
source ~/.venv-cu130/bin/activate
which python  # Should show .venv-cu130 path
python -c "import torch; print(torch.__version__)"
```

---

## Part 6: Reference Commands

### Quick Test Script (run anytime)

```bash
cd ~/deeds-web-app/python-workers
source .venv-cu130/bin/activate

python << 'EOF'
import torch
import pika
import psycopg2
from os import getenv

# GPU
print(f"🖥️  PyTorch: {torch.__version__}")
print(f"🎮 CUDA: {torch.cuda.is_available()}")
if torch.cuda.is_available():
    print(f"   GPU: {torch.cuda.get_device_name(0)}")
    print(f"   VRAM: {torch.cuda.get_device_properties(0).total_memory / 1e9:.1f} GB")

# RabbitMQ
try:
    conn = pika.BlockingConnection(pika.ConnectionParameters(
        host=getenv('RABBITMQ_HOST', '127.0.0.1'),
        port=int(getenv('RABBITMQ_PORT', '5672'))
    ))
    conn.close()
    print(f"🐰 RabbitMQ: Connected")
except Exception as e:
    print(f"🐰 RabbitMQ: Failed - {e}")

# Postgres
try:
    pg = psycopg2.connect(
        host=getenv('POSTGRES_HOST', '127.0.0.1'),
        port=int(getenv('POSTGRES_PORT', '5434')),
        user=getenv('POSTGRES_USER', 'legal_admin'),
        password=getenv('POSTGRES_PASSWORD', '123456'),
        database=getenv('POSTGRES_DB', 'legal_ai_db')
    )
    cursor = pg.cursor()
    cursor.execute("SELECT COUNT(*) FROM atlas_packets;")
    count = cursor.fetchone()[0]
    pg.close()
    print(f"🐘 Postgres: Connected ({count} packets)")
except Exception as e:
    print(f"🐘 Postgres: Failed - {e}")
EOF
```

### Activate venv Shortcut

```bash
alias venv='source ~/deeds-web-app/python-workers/.venv-cu130/bin/activate'
```

Then: `venv && python consumer_topology_kmeans.py`

---

## Summary

**For P2E GPU Topology Enrichment:**
1. ✅ Set up `.venv-cu130` with PyTorch 2.6 + CUDA 13.0
2. ✅ Verify connectivity to RabbitMQ + Postgres
3. ✅ Publish 4,725 jobs via `p2e-rabbitmq-job-publish.mjs`
4. ✅ Start 3 consumers (KMeans, SOM, PageRank)
5. ✅ Monitor Postgres `atlas_feature_envelopes` for enriched rows

**RAPIDS/cuVS:**
- Not required for P2E
- Documented for future phases (GPU DataFrame operations)
- Not recommended for 8GB GPU due to memory constraints

**Next Phase:** After P2E completes (35-45 min), proceed to P2F (XGBoost domain classification) and P2G+ (ontology/synthesis).

