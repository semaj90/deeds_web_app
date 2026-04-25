# Production GPU+SIMD Legal Processor

## Quick Start

```bash
# 1. Deploy complete system
DEPLOY-PRODUCTION-COMPLETE.bat

# 2. Verify services
npm run health:check

# 3. Start processing
curl -X POST http://localhost:8080/rag-enhanced \
  -H "Content-Type: application/json" \
  -d '{"query": "contract liability clauses", "useGPU": true, "llmProvider": "ollama"}'
```

## Architecture

- **Go Microservice**: GPU+SIMD processing (port 8080)
- **BullMQ Producer**: Job queue management (port 3001) 
- **Redis Windows**: Native cache/queue (port 6379)
- **SvelteKit**: Frontend with XState (port 5173)
- **Service Worker**: Background sync + offline support

## Performance Targets

- **10-100x** similarity search speedup (GPU vs CPU)
- **<200ms** response time for 10K document search
- **95%** cache hit rate for repeat queries
- **Background sync** for offline operations

## Monitoring

```bash
# System health
curl http://localhost:8080/health

# Queue status  
curl http://localhost:8080/metrics

# GPU utilization
nvidia-smi

# Redis stats
redis-windows/redis-cli.exe info
```

## Scaling

- **Horizontal**: Deploy multiple Go service instances
- **Vertical**: Increase GPU memory allocation
- **Queue**: Adjust worker pool size in ecosystem.config.js
- **Cache**: Tune Redis maxmemory policies

## Critical Paths

1. Query → XState machine → BullMQ → Go GPU processing → Redis cache → Response
2. User activity → Service worker → Background sync → SOM training
3. Recommendations → GPU similarity → Redis cache → Real-time updates

**Production ready.** Monitor GPU memory, tune worker pools, scale horizontally via load balancer.
