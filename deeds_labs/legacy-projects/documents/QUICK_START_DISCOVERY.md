# Quick Start: Dynamic Service Discovery

## One-Minute Setup

```bash
# 1. Enable discovery
export DEV_DOCKER_DISCOVERY=true

# 2. Start your dev server
npm run dev

# Done! Services auto-discovered.
```

## Verify It's Working

```bash
# List all discovered services
node scripts/discover-services.mjs

# Check specific service
node scripts/discover-services.mjs minio

# Verify services are reachable
node scripts/discover-services.mjs --verify
```

## Use in Your Code

```typescript
import { getServiceDiscovery, COMMON_SERVICES } from '$lib/server/helpers/service-discovery';

// Single service
const discovery = getServiceDiscovery();
const minio = await discovery.getServiceUrl('minio', COMMON_SERVICES.minio);
console.log(minio.url);  // http://localhost:9000

// Multiple services
const services = await discovery.getMultipleServices({
  minio: COMMON_SERVICES.minio,
  ollama: COMMON_SERVICES.ollama,
  qdrant: COMMON_SERVICES.qdrant
});

// Bulk initialization
import { initializeCommonServices } from '$lib/server/helpers/service-discovery';
const allServices = await initializeCommonServices();
```

## How It Works

```
1. Check env var (highest priority)
   MINIO_ENDPOINT=http://custom:9000

2. Query Docker container (if enabled)
   DEV_DOCKER_DISCOVERY=true
   → Finds 'legal-ai-minio' container
   → Extracts mapped port automatically

3. Use fallback (lowest priority)
   http://localhost:9000
```

## Environment Variables

```bash
# Enable discovery (dev only, auto-disabled in production)
DEV_DOCKER_DISCOVERY=true

# Override specific services (optional, takes priority)
MINIO_ENDPOINT=http://custom:9000
OLLAMA_URL=http://custom:11434
QDRANT_URL=http://custom:6333
```

## Available Services

Pre-configured for:
- **Minio** (S3 storage) - port 9000
- **Ollama** (LLM) - port 11434
- **Qdrant** (Vector DB) - port 6333
- **Redis** - port 6379
- **Postgres** - port 5432
- **Neo4j** - port 7687
- **RabbitMQ** - port 5672

## Troubleshooting

### Docker not detected
- Ensure Docker Desktop is running
- Run `docker ps` to verify access
- Check if containers are actually running

### Container not found
- List containers: `docker ps`
- Verify container name matches config
- Check docker-compose.yml

### Port not found
- Inspect container: `docker inspect <container_id>`
- Verify port is exposed in docker-compose
- Use env var override as workaround: `MINIO_ENDPOINT=http://localhost:9000`

## Files

| File | Purpose |
|------|---------|
| `src/lib/server/helpers/docker-discovery.ts` | Docker API wrapper |
| `src/lib/server/helpers/service-discovery.ts` | High-level wrapper |
| `scripts/discover-services.mjs` | CLI to check services |
| `DYNAMIC_SERVICE_DISCOVERY.md` | Full documentation |

## That's It!

Services now auto-discover with zero configuration! 🎉
