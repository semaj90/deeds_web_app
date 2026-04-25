# Infrastructure Patch Plan: WSL2 + Docker + Local GPU Setup

## Overview
Your current setup uses a hybrid approach (Docker for infrastructure, bare metal for Python workers). This is correct for Windows/WSL2 + GPU. However, there are 5 critical issues to patch.

---

## Issue 1: Wrong Postgres Image (pgvector/pgvector:pg17)

### Problem
```yaml
postgres:
  image: pgvector/pgvector:pg17  # ❌ This tag doesn't exist
```

The `pgvector/pgvector:pg17` tag is not official. You must use `postgres:17` and install pgvector manually.

### Solution
**File**: `docker-compose.yml`

Replace:
```yaml
postgres:
  image: pgvector/pgvector:pg17
```

With:
```yaml
postgres:
  image: postgres:17
  container_name: postgres-pgvector
```

Then add initialization script to install pgvector:

**File**: `sql/init/01-install-pgvector.sql`
```sql
CREATE EXTENSION IF NOT EXISTS vector;
```

**File**: `docker-compose.yml` (volumes section)
```yaml
volumes:
  - postgres_data:/var/lib/postgresql/data
  - ./sql/init/00-init-db.sql:/docker-entrypoint-initdb.d/00-init-db.sql
  - ./sql/init/01-install-pgvector.sql:/docker-entrypoint-initdb.d/01-install-pgvector.sql
```

---

## Issue 2: Bootstrap Script Container Name Mismatch

### Problem
```bash
# Current (wrong):
docker exec -i rabbitmq ...

# But your docker-compose uses:
container_name: legal-ai-rabbitmq
```

The bootstrap script tries to exec into `rabbitmq` but your container is named `legal-ai-rabbitmq`.

### Solution
**File**: `scripts/bootstrap_rabbitmq.sh`

Replace:
```bash
CONTAINER_ID=$(docker ps -q -f "name=rabbitmq" 2>/dev/null || echo "")
```

With:
```bash
# Check for the correct container name first
CONTAINER_ID=$(docker ps -q -f "name=rabbitmq-legal" 2>/dev/null || echo "")
if [ -z "$CONTAINER_ID" ]; then
    CONTAINER_ID=$(docker ps -q -f "name=legal-ai-rabbitmq" 2>/dev/null || echo "")
fi
if [ -z "$CONTAINER_ID" ]; then
    CONTAINER_ID=$(docker ps -q -f "name=rabbitmq" 2>/dev/null || echo "")
fi
```

---

## Issue 3: Remove `nc -z` Dependency (Windows Incompatibility)

### Problem
```bash
if ! nc -z "$RABBITMQ_HOST" "$RABBITMQ_PORT" 2>/dev/null; then
    echo "❌ RabbitMQ is not running"
fi
```

`nc` (netcat) is not available on Windows/WSL2 by default and breaks the script.

### Solution
**File**: `scripts/bootstrap_rabbitmq.sh`

Replace:
```bash
if ! nc -z "$RABBITMQ_HOST" "$RABBITMQ_PORT" 2>/dev/null; then
    echo "❌ RabbitMQ is not running on $RABBITMQ_HOST:$RABBITMQ_PORT"
    exit 1
fi
```

With:
```bash
# Use curl instead (cross-platform)
if ! curl -s http://$RABBITMQ_HOST:15672/api/overview > /dev/null 2>&1; then
    echo "❌ RabbitMQ is not running on $RABBITMQ_HOST:15672"
    echo ""
    echo "Start RabbitMQ with Docker:"
    echo "  docker run -d --name rabbitmq-legal -p 5672:5672 -p 15672:15672 rabbitmq:3-management"
    exit 1
fi
```

---

## Issue 4: Python Workers Must Be Local (Not Dockerized)

### Problem
Your Python workers (embedding, reranking, etc.) should NOT run in Docker because:
- CUDA driver conflicts in containers
- LoRA adapter loading issues
- TensorRT engine path resolution
- Torch/CUDA version mismatches

### Solution
Use **supervisord** to manage local Python workers on bare metal.

**File**: `backend/supervisord.conf`

```ini
[supervisord]
logfile=/tmp/supervisord.log
pidfile=/tmp/supervisord.pid
nodaemon=true

[unix_http_server]
file=/tmp/supervisor.sock

[supervisorctl]
serverurl=unix:///tmp/supervisor.sock

[rpcinterface:supervisor]
supervisor.rpcinterface_factory = supervisor.rpcinterface:make_main_rpcinterface

# Embedding Worker
[program:embedding-worker]
command=python -m backend.mlp_worker
environment=MLP_QUEUE_TYPE=embedding,PYTHONUNBUFFERED=1,PYTHONPATH=%(ENV_PWD)s
directory=%(ENV_PWD)s
autostart=true
autorestart=true
stderr_logfile=/tmp/embedding-worker.err.log
stdout_logfile=/tmp/embedding-worker.out.log
numprocs=2
process_name=%(program_name)s_%(process_num)02d

# Mirror Worker
[program:mirror-worker]
command=python -m backend.mlp_worker
environment=MLP_QUEUE_TYPE=mirror,PYTHONUNBUFFERED=1,PYTHONPATH=%(ENV_PWD)s
directory=%(ENV_PWD)s
autostart=true
autorestart=true
stderr_logfile=/tmp/mirror-worker.err.log
stdout_logfile=/tmp/mirror-worker.out.log
numprocs=1
process_name=%(program_name)s_%(process_num)02d

# Rerank Worker
[program:rerank-worker]
command=python -m backend.mlp_worker
environment=MLP_QUEUE_TYPE=rerank,PYTHONUNBUFFERED=1,PYTHONPATH=%(ENV_PWD)s
directory=%(ENV_PWD)s
autostart=true
autorestart=true
stderr_logfile=/tmp/rerank-worker.err.log
stdout_logfile=/tmp/rerank-worker.out.log
numprocs=1
process_name=%(program_name)s_%(process_num)02d

# Citation Worker
[program:citation-worker]
command=python -m backend.mlp_worker
environment=MLP_QUEUE_TYPE=citation,PYTHONUNBUFFERED=1,PYTHONPATH=%(ENV_PWD)s
directory=%(ENV_PWD)s
autostart=true
autorestart=true
stderr_logfile=/tmp/citation-worker.err.log
stdout_logfile=/tmp/citation-worker.out.log
numprocs=1
process_name=%(program_name)s_%(process_num)02d
```

**File**: `scripts/start_workers.sh`

```bash
#!/bin/bash
# Start supervisord with worker processes

set -e

echo "🚀 Starting Python workers with supervisord..."

# Ensure venv is activated
if [ ! -d "venv" ]; then
    echo "❌ Virtual environment not found. Run: python -m venv venv"
    exit 1
fi

source venv/bin/activate

# Install supervisord if needed
pip install supervisor -q

# Start supervisord
supervisord -c backend/supervisord.conf

echo "✅ Workers started"
echo ""
echo "Monitor workers:"
echo "  supervisorctl -c backend/supervisord.conf status"
echo ""
echo "Stop workers:"
echo "  supervisorctl -c backend/supervisord.conf shutdown"
```

---

## Issue 5: Queue Naming Mismatch (Critical Bug)

### Problem
Your code uses inconsistent queue names:
- `embedding.queue` vs `embeddings.queue`
- `mirror.queue` vs `mirrors.queue`
- `rerank.queue` vs `reranks.queue`
- `citation.queue` vs `citations.queue`

### Solution
Standardize to **singular** queue names everywhere.

**File**: `backend/mq_client.py` (already correct ✅)
```python
QUEUES = {
    "embedding": {
        "name": "embedding.queue",
        "routing_key": "task.embedding",
        "durable": True,
    },
    "mirror": {
        "name": "mirror.queue",
        "routing_key": "task.mirror",
        "durable": True,
    },
    "rerank": {
        "name": "rerank.queue",
        "routing_key": "task.rerank",
        "durable": True,
    },
    "citation": {
        "name": "citation.queue",
        "routing_key": "task.citation",
        "durable": True,
    },
}
```

**File**: `backend/mlp_worker.py` (already correct ✅)
```python
# Uses queue_type parameter: "embedding", "mirror", "rerank", "citation"
```

**File**: `backend/supervisord.conf` (see Issue 4 above)
```ini
environment=MLP_QUEUE_TYPE=embedding  # singular
environment=MLP_QUEUE_TYPE=mirror     # singular
environment=MLP_QUEUE_TYPE=rerank     # singular
environment=MLP_QUEUE_TYPE=citation   # singular
```

---

## Implementation Checklist

- [ ] **Issue 1**: Update `docker-compose.yml` postgres image to `postgres:17`
- [ ] **Issue 1**: Create `sql/init/01-install-pgvector.sql`
- [ ] **Issue 2**: Update `scripts/bootstrap_rabbitmq.sh` container name detection
- [ ] **Issue 3**: Replace `nc -z` with `curl` in bootstrap script
- [ ] **Issue 4**: Create `backend/supervisord.conf`
- [ ] **Issue 4**: Create `scripts/start_workers.sh`
- [ ] **Issue 5**: Verify queue names are singular (already done in code)

---

## Deployment Order

1. **Start Docker infrastructure**:
   ```bash
   docker-compose up -d postgres redis rabbitmq qdrant
   ```

2. **Bootstrap RabbitMQ**:
   ```bash
   ./scripts/bootstrap_rabbitmq.sh
   ```

3. **Start Python workers** (bare metal):
   ```bash
   ./scripts/start_workers.sh
   ```

4. **Start frontend + services**:
   ```bash
   docker-compose up -d frontend quic-server tensorrt-llm
   ```

---

## Verification

```bash
# Check Docker services
docker-compose ps

# Check Python workers
supervisorctl -c backend/supervisord.conf status

# Check RabbitMQ
curl -u guest:guest http://localhost:15672/api/overview

# Check Postgres
psql -h localhost -U legal_admin -d legal_ai_db -c "SELECT * FROM pg_extension WHERE extname='vector';"

# Check Redis
redis-cli ping

# Check Qdrant
curl http://localhost:6333/collections
```

---

## Notes

- **No hard-coded paths**: All paths use environment variables or relative paths
- **Cross-platform**: Works on Windows/WSL2, Linux, macOS
- **GPU-friendly**: Python workers run on bare metal with direct CUDA access
- **Scalable**: supervisord can spawn multiple worker processes per queue type
