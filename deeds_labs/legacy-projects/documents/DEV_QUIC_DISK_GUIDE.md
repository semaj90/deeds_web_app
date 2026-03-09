## dev:quic Disk & Cleanup Guide

### Overview
`npm run dev:quic` runs `scripts/start-quic-enhanced.mjs` which:
- Ensures Docker is up and network `legal-ai-network` exists
- Starts `docker-compose.dynamic.yml` (services: postgres, redis-stack, minio, frontend, caddy)
- Waits for Caddy HTTPS (QUIC/HTTP3) and frontend readiness

No model downloads or Context7 content are pulled in this path; primary disk consumers are Docker images, build layers, and node modules.

### Primary Disk Consumers
- Frontend image layer with `node_modules` (~6 GB)
- Redis-stack + Postgres + MinIO images (<2 GB combined)
- Caddy (≈75 MB)
- BuildKit cache (few hundred MB typical)

### Keep vs Remove
Keep running container images:
- `deeds-web-app-sveltekit-frontend:latest`
- `caddy:alpine`
- `rabbitmq:management-alpine` (if needed)
- `redis:alpine` or `redis/redis-stack:latest`
- `pgvector/pgvector:pg17`

Safe removals (examples):
- Unused older tags (e.g., `pgvector:pg16`)
- Unused variants (`caddy:latest` if only `caddy:alpine` used)
- Large experimental bases (e.g., `nvcr.io/nvidia/tensorrt:*` if not currently needed)

### Fast Status Snapshot
```powershell
docker system df
docker ps --format "table {{.Names}}\t{{.Image}}"
docker images --filter dangling=true
```

### Targeted Cleanup Commands
```powershell
# Remove specific unused heavy images
docker rmi nvcr.io/nvidia/tensorrt:24.12-py3
docker rmi pgvector/pgvector:pg16
docker rmi caddy:latest

# Prune dangling layers & build cache
docker image prune -f
docker builder prune -f

# Optional: prune unused volumes (ensure no needed data)
docker volume prune -f
```

### Full Reset (Aggressive)
```powershell
docker system prune -a --volumes
```
Only run if you accept re-pulling and rebuilding everything.

### Reduce Future Context Size
Add a `.dockerignore` in `sveltekit-frontend/`:
```
node_modules
dist
.svelte-kit
logs
*.log
coverage
.vitest
.DS_Store
.env*
```
This speeds up the "Sending build context" phase.

### Accelerate Rebuilds
Use cache mount for npm (edit `Dockerfile.dev`):
```
RUN --mount=type=cache,target=/root/.npm npm ci --legacy-peer-deps
```

Optional: switch to named volume in compose to explicitly manage node_modules:
```yaml
volumes:
  - node_modules_dynamic:/app/node_modules
```

### Inspect Buildx Builders
```powershell
docker buildx ls
docker buildx prune -f --verbose
```

### WSL Host Disk Hotspots (Run inside WSL)
```bash
du -h -d 1 ~ | sort -h
du -h -d 1 ~/.cache | sort -h
```
Look for: `~/.npm`, `~/.cache/pip`, `~/.cache/huggingface`, `.ollama`.

### Safe Cache Purges (WSL)
```bash
pip cache purge
rm -rf ~/.cache/huggingface/tmp/* 2>/dev/null || true
```

### When to Keep Large Images
- Actively iterating on GPU backends (TensorRT / CUDA)
- Benchmarking differences between Postgres versions

Otherwise reclaim them early to keep iteration fast.

### Quick Decision Checklist
| Question | Action |
|----------|--------|
| Still using TensorRT container today? | Keep image; else remove |
| Need multiple pgvector versions? | Usually no → remove old |
| Using both caddy tags? | Keep only one |
| Build cache >1–2GB & not rebuilding often? | Prune |

### Verification After Cleanup
```powershell
docker system df
```
Confirm reclaimed space and all required containers still running.

---
Last updated: 2025-09-17T00:00:00Z