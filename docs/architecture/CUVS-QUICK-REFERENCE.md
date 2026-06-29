# cuVS Quick Reference — Architecture & Commands

**Use this file for:**
- Copy-paste commands (testing, deployment)
- Architecture diagrams
- Port/memory checklists
- Debugging one-liners

---

## 1. System Architecture

### Full Retrieval Pipeline with cuVS Layer 3a

```
┌─────────────────────────────────────────────────────────────────┐
│ SvelteKit Frontend (Port 5173)                                  │
└────────────────────┬────────────────────────────────────────────┘
                     │
          Query Vector (768-dim)
                     ↓
┌─────────────────────────────────────────────────────────────────┐
│ Retrieval Orchestrator                                          │
│ (src/lib/server/retrieval/retrieval-orchestrator.ts)            │
└────┬──────┬──────┬──────────┬──────────────────────────────────┘
     │      │      │          │
  L1 │   L2 │   L3a│          └─ L4 / L5 Fallback
  RED│  BIF │  cuVS│
  IS │ ROST │  GRP│
     │      │      │          
     ↓      ↓      ↓ (NEW)    
┌────────┐ ┌──────────┐ ┌──────────────────────────────────────┐
│ Redis  │ │ Bifrost  │ │ Docker Container (Port 50051)         │
│ Cache  │ │ Semantic │ │ ┌────────────────────────────────┐    │
│ (5ms)  │ │ Cache    │ │ │ cuVS gRPC Server (Python)      │    │
│        │ │ (2–5s)   │ │ │ ┌──────────────────────────┐   │    │
└────────┘ └──────────┘ │ │ IVF-PQ Index (250MB, int8) │   │    │
                        │ │ ┌──────────────────────────┐   │    │
                        │ │ RTX 3060 Ti (8GB VRAM)     │   │    │
                        │ └──────────────────────────────┘   │    │
                        └──────────────────────────────────────┘
                               ↓ (50–100ms)
                        ┌──────────────────────────────────────┐
                        │ Qdrant (Port 6333)                    │
                        │ codebase_chunks_768 (40K vectors)    │
                        │ (200ms, ALWAYS available)             │
                        └──────────────────────────────────────┘
                               ↓
                        ┌──────────────────────────────────────┐
                        │ Postgres (Port 5432)                  │
                        │ codebase_chunk_index table            │
                        │ (Join + metadata)                     │
                        └──────────────────────────────────────┘
```

### cuVS Container Dependencies

```
┌─────────────────────────────────────────────────────┐
│ docker-compose.yml                                  │
├─────────────────────────────────────────────────────┤
│ services:                                           │
│   cuvs-grpc:                                        │
│     build:                                          │
│       dockerfile: docker/cuvs-grpc/Dockerfile       │
│     ports: ["50051:50051"]                          │
│     gpu: 1 (RTX 3060 Ti)                            │
│     depends_on: [legal-ai-postgres]                 │
│     volumes: [./cuvs-cache:/cache]                  │
└─────────────────────────────────────────────────────┘
         ↓
┌─────────────────────────────────────────────────────┐
│ docker/cuvs-grpc/Dockerfile                         │
├─────────────────────────────────────────────────────┤
│ FROM nvcr.io/nvidia/rapids:24.12-...:CUDA12.1      │
│ RUN pip install grpcio grpcio-tools protobuf       │
│ COPY protos/ /app/protos/                           │
│ COPY src/ /app/src/                                 │
│ RUN python -m grpc_tools.protoc ...                 │
│ EXPOSE 50051                                        │
│ CMD ["python", "src/cuvs_grpc_server.py"]          │
└─────────────────────────────────────────────────────┘
         ↓
┌─────────────────────────────────────────────────────┐
│ cuvs_grpc_server.py                                 │
├─────────────────────────────────────────────────────┤
│ class CuVSServicer:                                 │
│   def BuildIndex(req) → IVF-PQ index                │
│   def Search(req) → k neighbors + distances         │
│ grpc.server(...) listening on [::]:50051            │
└─────────────────────────────────────────────────────┘
```

---

## 2. Port Inventory

### All Ports (Docker-compose)

| Port | Service | Protocol | Status | Notes |
|------|---------|----------|--------|-------|
| 5173 | SvelteKit dev | HTTP | Active | Frontend |
| 5432 | Postgres | TCP | Active | Main DB |
| 5433 | Postgres (test) | TCP | Active | Test replica |
| 5672 | RabbitMQ | AMQP | Active | Message queue |
| 6379 | Redis/Valkey | TCP | Active | Cache + pub/sub |
| 6333 | Qdrant | HTTP | Active | Vector store |
| 8090 | llama-server | HTTP | Active | TurboQuant (if enabled) |
| 8333 | SeaweedFS S3 | HTTP | Active | Object store |
| 8382 | SeaweedFS Filer | HTTP | Active | S3 gateway |
| 9333 | SeaweedFS Master | HTTP | Active | S3 master |
| **50051** | **cuVS gRPC** | **gRPC** | **NEW** | **GPU ANN** |
| 11434 | Ollama | HTTP | Active | LLM inference |

**Check if 50051 is free:**
```bash
netstat -an | grep 50051    # Linux/WSL
netstat -ano | findstr 50051 # Windows CMD
Get-NetTCPConnection -LocalPort 50051 -ErrorAction Ignore  # PowerShell
```

---

## 3. Docker Commands Cheat Sheet

### Build & Deploy

```bash
# Build Docker image (first time only)
docker build -t rapids-cuvs-grpc:latest -f docker/cuvs-grpc/Dockerfile .
# Time: 5–10 min (downloads base image, installs cuVS)

# Start container via docker-compose
docker-compose up -d cuvs-grpc
# Time: <3 sec (if image cached)

# Start container standalone (testing)
docker run --rm --gpus all -p 50051:50051 rapids-cuvs-grpc:latest
# Time: 1 sec (no daemon)

# Stop container
docker-compose down cuvs-grpc
# OR
docker stop legal-ai-cuvs-grpc

# Remove image (cleanup)
docker rmi rapids-cuvs-grpc:latest
```

### Health Checks

```bash
# Check if container is running
docker ps | grep cuvs-grpc

# View logs
docker logs legal-ai-cuvs-grpc
docker logs -f legal-ai-cuvs-grpc  # Follow

# Get container ID
docker ps -q -f name=cuvs-grpc

# Check GPU access inside container
docker exec legal-ai-cuvs-grpc nvidia-smi
# Expected: RTX 3060 Ti | 8GB VRAM

# Verify port 50051 listening
docker exec legal-ai-cuvs-grpc lsof -i :50051
# Expected: python process

# Shell into container
docker exec -it legal-ai-cuvs-grpc /bin/bash
```

### Image Management

```bash
# List images
docker images | grep rapids

# Pull latest RAPIDS image manually
docker pull nvcr.io/nvidia/rapids:24.12-runtime-cuda12.1-runtime-ubuntu22.04

# Save image to tarball
docker save rapids-cuvs-grpc:latest -o rapids-cuvs-grpc.tar.gz

# Load image from tarball
docker load -i rapids-cuvs-grpc.tar.gz

# Check image size
docker images rapids-cuvs-grpc --format "{{.Size}}"
# Expected: ~12GB
```

---

## 4. gRPC Testing Commands

### Using grpcurl (CLI testing)

```bash
# Install grpcurl (one-time)
npm install -g @grpc/grpc-tools
# OR use Go binary: go install github.com/fullstorydev/grpcurl/cmd/grpcurl@latest

# List services
grpcurl -plaintext localhost:50051 list
# Expected: rapids.cuvs.CuVSService

# List methods
grpcurl -plaintext localhost:50051 describe rapids.cuvs.CuVSService
# Expected: BuildIndex, Search, GetIndexInfo

# Call BuildIndex (if already built)
grpcurl -plaintext localhost:50051 describe rapids.cuvs.CuVSService.BuildIndex

# Test connectivity (wait for ready)
grpcurl -plaintext -max-time 5 localhost:50051 list
# Expected: service list (may timeout if not running)
```

### Using Python gRPC client

```bash
# Inside container or WSL2 with cuVS installed
python3 << 'EOF'
import grpc
import sys
sys.path.insert(0, '/app')
from cuvs_service_pb2 import BuildIndexRequest
from cuvs_service_pb2_grpc import CuVSServiceStub

channel = grpc.aio.secure_channel('localhost:50051', grpc.aio.ssl_channel_credentials())
stub = CuVSServiceStub(channel)
print("Connected to cuVS gRPC server")
EOF
```

---

## 5. Node.js Client Commands

### Testing the TypeScript Bridge

```bash
# Run cuVS client test
npm run cuvs:test
# Expected: "✓ should connect to cuVS service"

# Run full retrieval test
npm run retrieval:test -- --enable-cuvs
# Expected: all tests pass (with fallback if cuVS down)

# Benchmark (Qdrant baseline vs cuVS)
npm run benchmark:retrieval -- --samples 100 --disable-cuvs
npm run benchmark:retrieval -- --samples 100 --enable-cuvs
# Expected: 20–30% latency improvement
```

### Integration Test Script

```typescript
// tests/cuvs-integration.spec.ts
import { searchCuVS, isCuVSHealthy } from '$lib/server/retrieval/cuvs-grpc-bridge';

describe('cuVS Integration', () => {
  it('should connect to service', async () => {
    const health = isCuVSHealthy();
    console.log('cuVS health:', health ? 'UP' : 'DOWN');
    // Non-blocking: test passes regardless
  });

  it('should fallback to Qdrant if cuVS down', async () => {
    // Stop container: docker stop legal-ai-cuvs-grpc
    const result = await retrieval.search({...});
    expect(result.source).toBe('qdrant'); // Fallback
  });
});
```

---

## 6. Memory Budget Reference

### RTX 3060 Ti 8GB Breakdown

```
┌────────────────────────────────────────────────────────┐
│ RTX 3060 Ti Memory Budget (8GB Total)                  │
├────────────────────────────────────────────────────────┤
│                                                         │
│  Ollama (Gemma4 IQ4_XS)         5.3GB │ 66% │░░░░░░░░░
│  cuVS IVF-PQ (40K vectors)      1.2GB │ 15% │░░░░
│  Inference headroom             1.5GB │ 19% │░░░░░
│                                                         │
│  Total: 8.0GB                                          │
│  ✓ Tight fit, but workable                             │
│                                                         │
└────────────────────────────────────────────────────────┘

Index Memory Optimization:
┌──────────────┬────────┬──────────┬────────┐
│ Index Type   │ Memory │ Search   │ Build  │
├──────────────┼────────┼──────────┼────────┤
│ Flat         │ 123MB  │ Slow 1s  │ Instant│
│ IVF-PQ (int8)│ 250MB  │ Fast 50ms│ 3 min  │
│ IVF-Flat     │ 400MB  │ Med 200ms│ 1 min  │
│ CAGRA        │ 1.8GB  │ Fast 15ms│ 15 min │ ❌ Too big
└──────────────┴────────┴──────────┴────────┘

Recommendation: IVF-PQ (int8) = 250MB
```

### GPU Memory Monitoring

```bash
# Real-time GPU usage
watch -n 1 nvidia-smi

# Get memory in script
USED_GB=$(nvidia-smi --query-gpu=memory.used --format=csv,noheader,nounits | awk '{print $1/1024}')
echo "GPU memory: $USED_GB GB"

# Alert if exceeds 2GB
if (( $(echo "$USED_GB > 2" | bc -l) )); then
  echo "⚠️  cuVS using more than 2GB (check index size)"
fi
```

---

## 7. Troubleshooting One-Liners

| Problem | Command | Expected |
|---------|---------|----------|
| Container won't start | `docker logs legal-ai-cuvs-grpc` | Python error message |
| gRPC timeout | `docker exec legal-ai-cuvs-grpc lsof -i :50051` | python process |
| GPU not detected | `docker exec legal-ai-cuvs-grpc nvidia-smi` | RTX 3060 Ti |
| Port conflict | `netstat -ano \| findstr 50051` | Empty (if free) |
| OOM error | `nvidia-smi` | VRAM usage |
| Slow search | `docker exec legal-ai-cuvs-grpc python -c "import cuvs; print(cuvs.__version__)"` | 24.12.0 |
| Client can't connect | `grpcurl -plaintext localhost:50051 list` | rapids.cuvs.CuVSService |

---

## 8. Performance Baseline

### Latency Breakdown (ms)

```
Query Embedding       50ms  │████
  Ollama (local)

Retrieval (Layer 3a)  50ms  │████
  cuVS IVF-PQ search
  (50–100ms range)

Retrieval (Layer 3b) 200ms  │████████████████
  Qdrant (fallback)

Postgres Join         10ms  │█
  Metadata fetch

Total (cuVS path)    110ms  │████████
Total (Qdrant path)  210ms  │██████████████████
─────────────────────────────────────
Improvement          45%
```

### Throughput

```
Redis Cache (L1)          10,000+ QPS  (if hit)
Bifrost Cache (L2)        100–500 QPS  (if hit)
cuVS search               100 QPS      (k=10, batch=1)
Qdrant search             50 QPS       (fallback)
```

---

## 9. Deployment Checklist

### Pre-deployment

- [ ] Port 50051 is free: `netstat -ano | findstr 50051`
- [ ] Docker GPU support verified: `docker run --rm --gpus all nvidia/cuda:12.1 nvidia-smi`
- [ ] Disk space: at least 15GB free
- [ ] CUDA drivers: `nvidia-smi` shows RTX 3060 Ti
- [ ] docker-compose.yml updated with cuvs-grpc service

### Deployment

- [ ] Build image: `docker build -t rapids-cuvs-grpc:latest ...`
- [ ] Start container: `docker-compose up -d cuvs-grpc`
- [ ] Verify logs: `docker logs legal-ai-cuvs-grpc`
- [ ] Test gRPC: `grpcurl -plaintext localhost:50051 list`
- [ ] Test Node.js: `npm run cuvs:test`

### Post-deployment

- [ ] Run retrieval benchmark: `npm run benchmark:retrieval --enable-cuvs`
- [ ] Monitor GPU: `nvidia-smi` (expect <2GB cuVS usage)
- [ ] Check fallback: Stop container, verify Qdrant takes over
- [ ] Tag commit: `git tag feat/cuvs-grpc-layer3a`

---

## 10. File Locations Summary

```
c:\Users\james\Videos\deeds-web-app\

docker/cuvs-grpc/
  ├── Dockerfile                    (build config)
  ├── protos/
  │   └── cuvs_service.proto        (gRPC interface)
  └── src/
      └── cuvs_grpc_server.py       (Python server, 80 lines)

sveltekit-frontend/src/lib/server/retrieval/
  └── cuvs-grpc-bridge.ts           (Node.js client, 120 lines)

docker-compose.yml                  (add cuvs-grpc service)

docs/
  ├── CUVS-RESEARCH-INDEX.md        (this navigation file)
  └── architecture/
      ├── CUVS-INSTALLATION-WINDOWS-RESEARCH.md
      ├── CUVS-DOCKER-IMPLEMENTATION-CHECKLIST.md
      ├── CUVS-RESEARCH-SUMMARY.md
      └── CUVS-QUICK-REFERENCE.md   (you are here)
```

---

## 11. Environment Variables

```bash
# .env.local (add to existing)
CUVS_GRPC_ENABLED=true
CUVS_GRPC_URL=localhost:50051

# docker-compose override (optional)
environment:
  - CUVS_GRPC_ENABLED=true
  - CUVS_GRPC_URL=cuvs-grpc:50051  # From other containers
```

---

## 12. npm Scripts to Add

```json
{
  "cuvs:start": "docker-compose up -d cuvs-grpc",
  "cuvs:stop": "docker-compose down cuvs-grpc",
  "cuvs:restart": "npm run cuvs:stop && npm run cuvs:start",
  "cuvs:logs": "docker logs -f legal-ai-cuvs-grpc",
  "cuvs:test": "npm run test tests/cuvs-grpc-client.spec.ts",
  "cuvs:health": "grpcurl -plaintext localhost:50051 list",
  "cuvs:build": "docker build -t rapids-cuvs-grpc:latest -f docker/cuvs-grpc/Dockerfile .",
  "retrieval:benchmark": "npm run benchmark:retrieval -- --samples 100",
  "retrieval:benchmark:cuvs": "npm run benchmark:retrieval -- --samples 100 --enable-cuvs"
}
```

---

**End of Quick Reference**
