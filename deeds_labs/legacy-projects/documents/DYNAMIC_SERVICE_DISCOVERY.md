# Dynamic Docker Service Discovery Guide

## Overview

Your `deeds-web-app` now has **automatic Docker container discovery** for local development. No more manual port mapping or hardcoded endpoints!

### Key Benefits
- ✅ Auto-detects running Docker containers and their mapped ports
- ✅ Falls back to explicit env vars (highest priority)
- ✅ Graceful degradation to hardcoded defaults
- ✅ Opt-in via `DEV_DOCKER_DISCOVERY=true` (prod/CI unaffected)
- ✅ Smart caching to avoid repeated Docker API calls
- ✅ Works on Docker Desktop (Windows/Mac/Linux)

## Quick Start

### 1. Enable Discovery
```bash
# For development
DEV_DOCKER_DISCOVERY=true npm run dev

# Or set in .env.local
echo "DEV_DOCKER_DISCOVERY=true" >> .env.local
```

### 2. List All Discovered Services
```bash
# Show all services and their endpoints
node scripts/discover-services.mjs

# Check specific service
node scripts/discover-services.mjs minio

# Verify all services are reachable
node scripts/discover-services.mjs --verify
```

### 3. Use in Your Code
```typescript
import { getServiceDiscovery } from '$lib/server/helpers/service-discovery';

// Get Minio endpoint
const discovery = getServiceDiscovery();
const minio = await discovery.getServiceUrl('minio', {
  envVar: 'MINIO_ENDPOINT',
  fallback: 'http://localhost:9000',
  containerName: 'legal-ai-minio',
  port: 9000
});

console.log(minio.url);  // http://localhost:9000 (or discovered port)
console.log(minio.source);  // 'env' | 'discovery' | 'fallback'
```

## Architecture

### Discovery Priority (in order)

```
1. Environment Variable (highest priority)
   └─ MINIO_ENDPOINT=http://custom:9000

2. Docker Container Discovery (if DEV_DOCKER_DISCOVERY=true)
   └─ Finds 'legal-ai-minio' container
   └─ Returns mapped port (e.g., 127.0.0.1:9000)

3. Hardcoded Fallback (lowest priority)
   └─ http://localhost:9000
```

### Files Added

| File | Purpose |
|------|---------|
| `src/lib/server/helpers/docker-discovery.ts` | Low-level Docker API wrapper (dockerode) |
| `src/lib/server/helpers/service-discovery.ts` | High-level service discovery class |
| `scripts/discover-services.mjs` | CLI for discovering services |
| `scripts/discover-services.ts` | Discovery demo script |

## Features

### 1. Single Service Discovery
```typescript
import { getServiceDiscovery } from '$lib/server/helpers/service-discovery';

const discovery = getServiceDiscovery();

const result = await discovery.getServiceUrl('minio', {
  envVar: 'MINIO_ENDPOINT',
  fallback: 'http://localhost:9000',
  containerName: 'legal-ai-minio',
  port: 9000,
  verify: true  // Optional: verify endpoint is reachable
});

// Result: { url, source, verified }
console.log(result.url);      // http://localhost:9000
console.log(result.source);   // 'env' | 'discovery' | 'fallback'
console.log(result.verified); // true | false | undefined
```

### 2. Batch Discovery
```typescript
const services = await discovery.getMultipleServices({
  minio: { ... },
  ollama: { ... },
  qdrant: { ... }
});

// Returns: { minio: { url, source }, ollama: { ... }, ... }
```

### 3. Pre-defined Service Configs
```typescript
import { COMMON_SERVICES, initializeCommonServices } from '$lib/server/helpers/service-discovery';

// Use pre-defined configs for common services
const config = COMMON_SERVICES.minio;
// { envVar: 'MINIO_ENDPOINT', fallback: '...', port: 9000, ... }

// Initialize all common services at startup
const allServices = await initializeCommonServices();
```

### 4. Endpoint Verification
```typescript
import { verifyServiceEndpoint } from '$lib/server/helpers/docker-discovery';

const isReachable = await verifyServiceEndpoint('http://localhost:9000', 5000);
console.log(isReachable);  // true | false
```

### 5. Container Inspection
```typescript
import { listRunningContainers } from '$lib/server/helpers/docker-discovery';

const containers = await listRunningContainers();
// Returns: [{ name, image, ports: { 9000: { host, port } } }]

containers.forEach(c => {
  console.log(`${c.name} (${c.image})`);
  Object.entries(c.ports).forEach(([port, mapping]) => {
    console.log(`  ${port}/tcp -> ${mapping.host}:${mapping.port}`);
  });
});
```

## Pre-defined Services

All common services are pre-configured:

```typescript
COMMON_SERVICES = {
  minio: {
    envVar: 'MINIO_ENDPOINT',
    fallback: 'http://localhost:9000',
    containerName: 'legal-ai-minio',
    port: 9000,
    verify: true
  },

  ollama: {
    envVar: 'OLLAMA_URL',
    fallback: 'http://localhost:11434',
    containerName: 'ollama',
    port: 11434,
    verify: true
  },

  qdrant: {
    envVar: 'QDRANT_URL',
    fallback: 'http://localhost:6333',
    containerName: 'qdrant',
    port: 6333,
    verify: true
  },

  redis: {
    envVar: 'REDIS_HOST',
    fallback: 'redis://localhost:6379',
    containerName: 'redis',
    port: 6379,
    verify: false
  },

  postgres: {
    envVar: 'DATABASE_URL',
    fallback: 'postgresql://legal_admin:123456@localhost:5432/legal_ai_db',
    containerName: 'postgres',
    port: 5432,
    verify: false
  },

  // ... neo4j, rabbitmq, etc.
}
```

## Integration Examples

### Update Environment Initialization
```typescript
// src/lib/server/init.ts
import { initializeCommonServices } from '$lib/server/helpers/service-discovery';

export async function initializeServer() {
  // Auto-discover all service endpoints
  const services = await initializeCommonServices();

  // Services now have correct endpoints:
  // - Respects env vars if set
  // - Falls back to Docker discovery if enabled
  // - Uses hardcoded defaults as last resort

  return services;
}
```

### Update Minio Configuration
```typescript
// src/lib/server/services/minio.ts
import { getServiceDiscovery, COMMON_SERVICES } from '$lib/server/helpers/service-discovery';

export async function getMinioEndpoint(): Promise<string> {
  const discovery = getServiceDiscovery();
  const result = await discovery.getServiceUrl('minio', COMMON_SERVICES.minio);
  return result.url;
}
```

### Update Ollama Resolution
```typescript
// src/lib/services/enhanced-rag-self-organizing.ts
import { getServiceDiscovery, COMMON_SERVICES } from '$lib/server/helpers/service-discovery';

private async getOllamaEndpoint(): Promise<string> {
  const discovery = getServiceDiscovery();
  const result = await discovery.getServiceUrl('ollama', COMMON_SERVICES.ollama);
  return result.url;
}
```

## Environment Variables

### Enable Discovery
```bash
# Enable Docker container discovery (dev only, auto-disables in production)
DEV_DOCKER_DISCOVERY=true

# Or set in .env.local / .env.development
echo "DEV_DOCKER_DISCOVERY=true" >> .env.local
```

### Override Specific Services
```bash
# Even with discovery enabled, explicit env vars take priority
MINIO_ENDPOINT=http://custom-minio:9000
OLLAMA_URL=http://custom-ollama:11434
QDRANT_URL=http://custom-qdrant:6333

# These will be used instead of discovered/default values
```

## Docker Desktop Specifics

### Windows / Docker Desktop
- Docker socket: `npipe:////./pipe/docker_engine`
- `dockerode` auto-detects automatically
- Discovery works the same as Mac/Linux

### Mac / Docker Desktop
- Docker socket: `/var/run/docker.sock`
- `dockerode` auto-detects automatically

### Linux with Docker
- Docker socket: `/var/run/docker.sock`
- Ensure user has docker permissions: `sudo usermod -aG docker $USER`

## Caching

Discovery results are cached for **5 minutes** to avoid repeated Docker API calls:

```typescript
// First call: queries Docker API
const result1 = await discovery.getServiceUrl('minio', config);

// Second call (within 5 mins): uses cache
const result2 = await discovery.getServiceUrl('minio', config);

// Clear cache manually if needed
discovery.clearCache();

// Check cache stats
const stats = discovery.getCacheStats();
console.log(stats.size);      // Number of cached entries
console.log(stats.entries);   // List of cache keys
```

## Troubleshooting

### Discovery Not Working

#### Problem: Docker Desktop not detected
```
Error: Docker Desktop not running or docker socket not accessible
```

**Solution:**
1. Ensure Docker Desktop is running
2. Check permissions: `docker ps` should work
3. Disable discovery if not needed: unset `DEV_DOCKER_DISCOVERY`

#### Problem: Container not found
```
[Docker Discovery] No container found matching pattern: minio
```

**Solution:**
1. Check container name: `docker ps`
2. Update container name in config
3. Verify container is running: `docker ps -a`

#### Problem: Port not found in container
```
[Docker Discovery] Port 9000 not found in container mappings
```

**Solution:**
1. Check container port mappings: `docker inspect <container_id>`
2. Verify port is exposed in docker-compose.yml
3. Use explicit `MINIO_ENDPOINT` env var as workaround

### Debugging

Enable detailed logging:
```typescript
// In your code
console.debug('[ServiceDiscovery]...');
console.log('[Docker Discovery]...');

// Or set env var
NODE_DEBUG=* npm run dev
```

List all discovered containers:
```typescript
import { listRunningContainers } from '$lib/server/helpers/docker-discovery';

const containers = await listRunningContainers();
console.table(containers);
```

## Performance

- **First Discovery Call**: ~50-100ms (Docker API)
- **Cached Calls**: ~1ms
- **Cache TTL**: 5 minutes (configurable)
- **Multiple Services**: Parallel discovery via `Promise.all()`

## Security

✅ **Production Safe:**
- Feature flag required: `DEV_DOCKER_DISCOVERY=true`
- Automatically disabled in production (`NODE_ENV !== 'development'`)
- Docker socket access only if enabled
- No docker commands exposed to clients
- All discovered endpoints validated

✅ **Dev Safe:**
- Only queries localhost/docker desktop
- Caches results to avoid excessive API calls
- Graceful fallback to env vars/defaults
- No sensitive data in logs

## Next Steps

1. **Install dockerode** (optional, but recommended):
   ```bash
   npm install dockerode
   ```

2. **Enable in development**:
   ```bash
   DEV_DOCKER_DISCOVERY=true npm run dev
   ```

3. **Test discovery**:
   ```bash
   node scripts/discover-services.mjs
   ```

4. **Integrate in your services**:
   - Update `src/lib/server/init.ts` to use `initializeCommonServices()`
   - Update `src/lib/server/services/minio.ts` to use discovery
   - Update `src/lib/services/enhanced-rag-self-organizing.ts` to use discovery

5. **Update docker-compose.yml**:
   ```yaml
   services:
     sveltekit-frontend:
       environment:
         DEV_DOCKER_DISCOVERY: "true"
         NODE_ENV: development
   ```

## References

- [dockerode npm package](https://www.npmjs.com/package/dockerode)
- [Docker API Documentation](https://docs.docker.com/engine/api/)
- [Docker Desktop Networking](https://docs.docker.com/desktop/networking/)
