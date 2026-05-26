# Vector Semantic Cache — Redis Stack + Qdrant (free OSS options)

This concise guide shows free, open-source options for building a two-tier semantic cache: Redis Stack (L1 exact/fast cache + optional vector via RediSearch) and Qdrant (L2 vector store). It includes Docker commands, `redis-cli` checks, curl/web-fetch examples, and maintenance tips.

Overview
- L1: Redis Stack (free) — fast exact-match cache, TTLs, Pub/Sub, Streams. Redis Stack includes RediSearch for vector similarity (HNSW) if you prefer a single-store approach.
- L2: Qdrant (OSS) — purpose-built vector DB with HNSW, payloads, HTTP/gRPC API. Good for semantic nearest-neighbor at scale.

Why two-tier?
- L1 (Redis) gives millisecond exact hits and can act as a short-lived semantic cache for recent queries.
- L2 (Qdrant) stores the canonical vector index for recall and heavy rerank.

Docker quickstarts

Redis Stack (single container)

```bash
docker run -d --name redis-stack -p 6379:6379 redis/redis-stack:latest
```

Qdrant (single container)

```bash
docker run -d --name qdrant -p 6333:6333 qdrant/qdrant:latest
```

Minimal docker-compose (example)

```yaml
version: '3.8'
services:
  redis:
    image: redis/redis-stack:latest
    ports: ['6379:6379']
    restart: unless-stopped

  qdrant:
    image: qdrant/qdrant:latest
    ports: ['6333:6333']
    restart: unless-stopped

# Run: docker-compose -f docker-compose.vector.yml up -d
```

redis-cli useful commands

```bash
# Ping
redis-cli PING

# Pub/Sub publish
redis-cli PUBLISH claude-mem:new '{"observation_id":"abc","text":"hi"}'

# Streams (durable pattern)
redis-cli XADD claude-mem-stream * observation_id abc text "hello world"

# Check keys / TTL
redis-cli KEYS "cache:*"
redis-cli TTL cache:user:123
```

RediSearch vector index example (Redis Stack)

1. Create index with a vector field (HNSW)

```bash
redis-cli --raw FT.CREATE idx:docs ON HASH PREFIX 1 doc: SCHEMA title TEXT body TEXT vec VECTOR HNSW 768 TYPE FLOAT32 DIM 768 DISTANCE_METRIC COSINE
```

2. Add a document with a binary vector parameter (client-side you pass a BLOB parameter when searching)

FT.ADD is not ideal for vectors — prefer client libraries. Search uses KNN syntax:

```bash
# Example FT.SEARCH with PARAMS $vec
redis-cli --raw FT.SEARCH idx:docs "*=>[KNN 10 @vec $BLOB]" PARAMS 2 BLOB <base64-or-binary> RETURN 2 title body
```

Qdrant basics (HTTP)

1. Create collection

```bash
curl -sS -X PUT "http://localhost:6333/collections/documents" -H 'Content-Type: application/json' -d '{"vectors":{"size":768,"distance":"Cosine"}}'
```

2. Upsert point (vector + payload)

```bash
curl -sS -X PUT "http://localhost:6333/collections/documents/points" -H 'Content-Type: application/json' -d '{"points":[{"id":1,"vector":[0.01,0.02,...],"payload":{"title":"A doc","text":"..."}}]}'
```

3. Search

```bash
curl -sS -X POST "http://localhost:6333/collections/documents/points/search" -H 'Content-Type: application/json' -d '{"vector":[0.01,0.02,...],"limit":10}'
```

Node/web fetch examples

Fetch Qdrant search (Node ESM)

```js
const res = await fetch('http://localhost:6333/collections/documents/points/search', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ vector: queryVec, limit: 10 })
})
const json = await res.json()
```

Redis publisher (ioredis)

```js
import Redis from 'ioredis'
const r = new Redis(process.env.REDIS_URL || 'redis://localhost:6379')
await r.publish('claude-mem:new', JSON.stringify(obs))
```

Free tooling and alternatives

- Redis Stack (OSS) — includes RediSearch and vector support; good L1 and small-scale vector searches.
- Qdrant (OSS) — best-in-class free vector DB; HTTP API and Python/TS clients.
- Milvus (OSS) — alternative vector DB with ANN engines.
- FAISS (local Python) — embed + search in-memory for experimentation (no HTTP server).

Maintenance & production notes

- Persistence: enable Redis persistence for L1 if you need warm cache after restarts, but TTL semantics are often enough.
- Backups: snapshot Qdrant collection data or use export tools.
- Monitoring: expose Redis INFO, Qdrant /health endpoints; hook into Prometheus if needed.
- Security: never expose Redis or Qdrant publicly; run behind private VPC or firewall.

Next steps you can pick
- I can add a `docker-compose.vector.yml` in the repo with Redis Stack + Qdrant and a small seed script.
- I can add an example Node service that demonstrates L1 hit -> L2 fallback -> re-populate L1 (a small langcache proof-of-concept).
- I can implement a Redis Streams consumer in the poller (durable, restart-safe) instead of Pub/Sub.
