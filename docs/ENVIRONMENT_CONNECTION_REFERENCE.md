# Environment & Connection Reference
**Last Updated**: June 28, 2026  
**Source Files**: 
- `.env` (git-tracked defaults)
- `.env.local` (local overrides, gitignored)
- `scripts/atlas/connection-config.mjs` (loader with fallbacks)

---

## Environment Loading Precedence

The canonical loader is `scripts/atlas/connection-config.mjs` with function `loadRepoEnv()`:

```javascript
loadEnv([
  `.env`              (repo root)
  `.env.local`        (repo root, gitignored)
  `.env`              (sveltekit-frontend)
  `.env.local`        (sveltekit-frontend, gitignored)
  process.env         (system environment)
])
```

**Precedence** (highest to lowest):
1. `process.env` (system environment variables)
2. `.env.local` in sveltekit-frontend
3. `.env` in sveltekit-frontend
4. `.env.local` in repo root
5. `.env` in repo root

Used by:
- `sveltekit-frontend/scripts/startup/run-graphify-daily-startup.mjs` (daily startup wrapper)
- All scripts in `scripts/atlas/` (audit, backfill, verification)
- SvelteKit app (via vite.config.ts / hooks.server.ts)

---

## PostgreSQL Connection

### Defaults (from connection-config.mjs)
```javascript
DEFAULT_POSTGRES = {
  host: '127.0.0.1',
  port: '5434',
  user: 'legal_admin',
  password: '123456',
  database: 'legal_ai_db',
}
```

### Environment Variables (Priority Order)
```bash
# Connection string (overrides host/port/user/password/database)
DATABASE_URL=postgresql://legal_admin:123456@localhost:5434/legal_ai_db

# Individual components
POSTGRES_HOST=localhost          # Defaults to 127.0.0.1
POSTGRES_PORT=5434              # Defaults to 5434
POSTGRES_USER=legal_admin        # Defaults to legal_admin
POSTGRES_PASSWORD=123456         # Defaults to 123456
POSTGRES_DB=legal_ai_db          # Defaults to legal_ai_db
POSTGRES_PASSWORD_ESCAPED=...    # For special characters (URL-encoded)
```

### Connection from Node.js
```javascript
// Via DATABASE_URL
const { Pool } = require('pg');
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

// Via individual vars
const pool = new Pool({
  host: process.env.POSTGRES_HOST || '127.0.0.1',
  port: parseInt(process.env.POSTGRES_PORT || '5434'),
  user: process.env.POSTGRES_USER || 'legal_admin',
  password: process.env.POSTGRES_PASSWORD || '123456',
  database: process.env.POSTGRES_DB || 'legal_ai_db',
});

await pool.query('SELECT 1');
```

### Connection from CLI
```bash
# From environment
psql $DATABASE_URL -c "SELECT 1;"

# Explicit
psql -h localhost -p 5434 -U legal_admin -d legal_ai_db -c "SELECT 1;"
psql postgresql://legal_admin:123456@localhost:5434/legal_ai_db
```

### Connection from Docker
```bash
# Inside container
docker exec legal-ai-postgres psql -U legal_admin -d legal_ai_db -c "SELECT COUNT(*) FROM atlas_packets;"

# Container-to-container (use service name)
docker exec legal-ai-rabbitmq psql -h postgres -U legal_admin -d legal_ai_db -c "SELECT 1;"
```

---

## Redis / Valkey Connection

### Defaults (from connection-config.mjs)
```javascript
DEFAULT_REDIS = {
  host: '127.0.0.1',
  port: '6379',
}
```

### Environment Variables (Priority Order)
```bash
# Connection string (overrides host/port/password/db)
REDIS_URL=redis://127.0.0.1:6379
REDIS_URL=redis://default:password@localhost:6379/0      # With auth
VALKEY_URL=...                                            # Alias

# Individual components
REDIS_HOST=127.0.0.1             # Defaults to 127.0.0.1
REDIS_PORT=6379                  # Defaults to 6379
REDIS_PASSWORD=redis             # Empty by default
REDIS_DB=0                        # Defaults to 0
REDIS_PASS=...                    # Alias for REDIS_PASSWORD
VALKEY_HOST=...                   # Alias
VALKEY_PORT=...                   # Alias
VALKEY_PASSWORD=...               # Alias
```

### Connection from Node.js (ioredis)
```javascript
import Redis from 'ioredis';

// Via URL
const redis = new Redis(process.env.REDIS_URL || 'redis://127.0.0.1:6379');

// Via individual vars
const redis = new Redis({
  host: process.env.REDIS_HOST || '127.0.0.1',
  port: parseInt(process.env.REDIS_PORT || '6379'),
  password: process.env.REDIS_PASSWORD || '',
  db: parseInt(process.env.REDIS_DB || '0'),
  lazyConnect: true,
  enableOfflineQueue: false,
  retryStrategy: () => null,
});

await redis.connect();
const pong = await redis.ping();
```

### Connection from CLI
```bash
# From environment
redis-cli -u $REDIS_URL ping

# Explicit
valkey-cli -h 127.0.0.1 -p 6379 ping
valkey-cli -h 127.0.0.1 -p 6379 -a redis ping  # With password
```

### Connection from Docker
```bash
# Inside container
docker exec legal-ai-valkey valkey-cli ping
docker exec legal-ai-valkey valkey-cli info server
docker exec legal-ai-valkey valkey-cli KEYS "*" | head -20
```

---

## Qdrant Connection

### Defaults
```javascript
// No explicit defaults; falls back to docker service name
QDRANT_URL=http://qdrant:6333
QDRANT_GRPC_HOST=qdrant
QDRANT_GRPC_PORT=6334
```

### Environment Variables
```bash
# HTTP endpoint (REST API)
QDRANT_URL=http://localhost:6333
QDRANT_API_KEY=...                           # Optional API key

# gRPC endpoint (binary protocol, faster)
QDRANT_GRPC_HOST=localhost
QDRANT_GRPC_PORT=6334

# Combined gRPC URL
QDRANT_GRPC_URL=grpc://localhost:6334
```

### Connection from Node.js
```javascript
import { QdrantClient } from '@qdrant/js-client-rest';

// HTTP (REST API)
const client = new QdrantClient({
  url: process.env.QDRANT_URL || 'http://localhost:6333',
  apiKey: process.env.QDRANT_API_KEY,
});

await client.healthCheck();
const collections = await client.getCollections();
```

### Connection from CLI
```bash
# REST API
curl http://localhost:6333/health
curl http://localhost:6333/collections | jq '.result'
curl http://localhost:6333/docs  # Swagger UI
```

### Connection from Docker
```bash
# Inside container
docker exec legal-ai-qdrant curl -s http://localhost:6333/health
docker exec legal-ai-qdrant curl -s http://localhost:6333/collections | jq '.result | length'
```

---

## RabbitMQ Connection

### Defaults
```bash
RABBITMQ_HOST=rabbitmq          # Docker service name
RABBITMQ_PORT=5672              # AMQP protocol
RABBITMQ_MANAGEMENT_PORT=15672  # Management UI
RABBITMQ_USER=guest
RABBITMQ_PASSWORD=guest
RABBITMQ_VHOST=/
```

### Environment Variables
```bash
# Connection string
RABBITMQ_URL=amqp://legal_admin:secret123@localhost:5672/

# Individual components
RABBITMQ_HOST=localhost
RABBITMQ_PORT=5672
RABBITMQ_USER=legal_admin
RABBITMQ_PASSWORD=secret123
RABBITMQ_VHOST=/
RABBITMQ_MANAGEMENT_PORT=15672
```

### Connection from Node.js (amqplib)
```javascript
import amqp from 'amqplib';

const url = process.env.RABBITMQ_URL || 'amqp://guest:guest@localhost:5672/';
const connection = await amqp.connect(url);
const channel = await connection.createChannel();

await channel.assertQueue('my-queue');
console.log('Connected to RabbitMQ');
```

### Connection from CLI
```bash
# Check server status (requires management API)
curl http://localhost:15672/api/overview -u legal_admin:secret123

# RabbitMQ control tool
sudo rabbitmq-ctl status
sudo rabbitmq-ctl list_queues
```

### Management UI
```
URL: http://localhost:15672/
User: legal_admin
Password: secret123
```

---

## Caddy Reverse Proxy Connection

### Defaults
```
CADDY_ADMIN=https://localhost:2019
CADDY_AUTO_HTTPS=off  (for localhost)
```

### Configuration
```
Upstreams:
  - SvelteKit: host.docker.internal:5173
  - Vector backend: host.docker.internal:8095

Exposed:
  - Port 80 → HTTP
  - Port 443 → HTTPS
  - Port 5178 → Dev/local HTTPS
```

### Connection from CLI
```bash
# Health check
curl -k https://localhost:5178/health

# Admin API
curl https://localhost:2019/config -u admin:password

# Logs
docker logs legal-ai-caddy
```

---

## SeaweedFS Connection (Optional Profile)

### S3 Gateway
```bash
SEAWEED_ENDPOINT=localhost
SEAWEED_S3_PORT=8333
SEAWEED_ACCESS_KEY=minio
SEAWEED_SECRET_KEY=minio123

# S3-compatible endpoint
http://localhost:8333/
```

### Filer (POSIX File API)
```bash
SEAWEED_FILER_PORT=8382

# REST API
http://localhost:8382/
```

### Master (Metadata)
```bash
SEAWEED_MASTER_PORT=9333

# Health check
curl http://localhost:9333/cluster/status
```

---

## .env Template

Create `.env` in repo root with:

```bash
# ═══════════════════════════════════════════════════════════════
# Postgres
# ═══════════════════════════════════════════════════════════════
DATABASE_URL=postgresql://legal_admin:123456@localhost:5434/legal_ai_db
POSTGRES_HOST=localhost
POSTGRES_PORT=5434
POSTGRES_USER=legal_admin
POSTGRES_PASSWORD=123456
POSTGRES_DB=legal_ai_db

# ═══════════════════════════════════════════════════════════════
# Redis / Valkey
# ═══════════════════════════════════════════════════════════════
REDIS_URL=redis://127.0.0.1:6379
REDIS_HOST=127.0.0.1
REDIS_PORT=6379
REDIS_PASSWORD=redis
REDIS_ENABLED=true

# ═══════════════════════════════════════════════════════════════
# Qdrant
# ═══════════════════════════════════════════════════════════════
QDRANT_URL=http://localhost:6333
QDRANT_GRPC_HOST=localhost
QDRANT_GRPC_PORT=6334

# ═══════════════════════════════════════════════════════════════
# RabbitMQ
# ═══════════════════════════════════════════════════════════════
RABBITMQ_URL=amqp://legal_admin:secret123@localhost:5672/
RABBITMQ_HOST=localhost
RABBITMQ_PORT=5672
RABBITMQ_USER=legal_admin
RABBITMQ_PASSWORD=secret123
RABBITMQ_VHOST=/
RABBITMQ_MANAGEMENT_PORT=15672

# ═══════════════════════════════════════════════════════════════
# SeaweedFS (optional, full profile)
# ═══════════════════════════════════════════════════════════════
SEAWEED_ENDPOINT=localhost
SEAWEED_S3_PORT=8333
SEAWEED_MASTER_PORT=9333
SEAWEED_FILER_PORT=8382
SEAWEED_ACCESS_KEY=minio
SEAWEED_SECRET_KEY=minio123

# ═══════════════════════════════════════════════════════════════
# Bifrost (optional, full profile)
# ═══════════════════════════════════════════════════════════════
BIFROST_URL=http://localhost:3040

# ═══════════════════════════════════════════════════════════════
# Go Services (optional, full profile)
# ═══════════════════════════════════════════════════════════════
GO_SEARCH_SERVICE_URL=http://localhost:8096
GO_EMBEDDING_SERVICE_URL=http://localhost:8097
GO_RETRIEVAL_SERVICE_URL=http://localhost:8100

# ═══════════════════════════════════════════════════════════════
# Langfuse (optional, full profile)
# ═══════════════════════════════════════════════════════════════
LANGFUSE_URL=http://localhost:3030
LANGFUSE_API_KEY=...  # Set if using Langfuse

# ═══════════════════════════════════════════════════════════════
# Ollama (native, NOT in Docker)
# ═══════════════════════════════════════════════════════════════
OLLAMA_URL=http://127.0.0.1:11434

# ═══════════════════════════════════════════════════════════════
# SvelteKit Dev Server (native, NOT in Docker)
# ═══════════════════════════════════════════════════════════════
VITE_DEV_SERVER_URL=http://localhost:5173
```

---

## Verification Script

```bash
#!/bin/bash
# Verify all connections

echo "=== POSTGRES ==="
psql $DATABASE_URL -c "SELECT version();" && echo "✅ OK" || echo "❌ FAIL"

echo "=== REDIS ==="
redis-cli -u $REDIS_URL ping && echo "✅ OK" || echo "❌ FAIL"

echo "=== QDRANT ==="
curl -s $QDRANT_URL/health | jq . && echo "✅ OK" || echo "❌ FAIL"

echo "=== RABBITMQ ==="
curl -s http://localhost:15672/api/overview -u $RABBITMQ_USER:$RABBITMQ_PASSWORD | jq . && echo "✅ OK" || echo "❌ FAIL"

echo "=== CADDY ==="
curl -k https://localhost:5178/health && echo "✅ OK" || echo "❌ FAIL"
```

---

## Notes

- All `.env.local` files are **gitignored** (safe to commit secrets)
- Connection strings in URLs are URL-encoded (e.g., `@` becomes `%40`, `:` becomes `%3A`)
- `normalizeConnectionHost()` converts `0.0.0.0` and `::1` to `127.0.0.1` for localhost
- Docker service names (e.g., `postgres`, `qdrant`) are NOT used from root compose (only container names)
- WSL2 users may need `host.docker.internal` instead of `localhost` for access from inside containers