# Docker Stack Live Docs

Generated from the live compose stack on 2026-06-27.

## Source Of Truth

- Compose file: [`docker-compose.yml`](C:\Users\james\Videos\deeds-web-app\docker-compose.yml)
- Shared env helper: [`scripts/atlas/connection-config.mjs`](C:\Users\james\Videos\deeds-web-app\scripts\atlas\connection-config.mjs)
- Startup wrapper using shared env precedence: [`run-graphify-daily-startup.mjs`](C:\Users\james\Videos\deeds-web-app\sveltekit-frontend\scripts\startup\run-graphify-daily-startup.mjs)

## Live Containers

### Core live stack

| Container | Status | Role |
|---|---:|---|
| `legal-ai-postgres` | healthy | Canonical packet/data truth, Postgres 18 + pgvector |
| `legal-ai-valkey` | healthy | Redis-compatible hot cache / semantic cache |
| `legal-ai-qdrant` | healthy | Dense vector mirror / ANN retrieval |
| `legal-ai-rabbitmq` | healthy | Async job fabric / event broker |
| `legal-ai-caddy` | healthy | HTTP front door / reverse proxy |
| `legal-ai-seaweed-master` | healthy | SeaweedFS metadata / volume assignment |
| `legal-ai-seaweed-volume` | running | SeaweedFS blob volume storage |
| `legal-ai-seaweed-filer` | running | SeaweedFS filer metadata index |
| `legal-ai-seaweed-s3` | healthy | SeaweedFS S3-compatible gateway |

### Full-profile services present in compose but not currently running

| Container | Intended role |
|---|---|
| `legal-ai-couchdb` | optional document archive |
| `legal-ai-neo4j` | graph mirror / GDS layer |
| `legal-ai-searxng` | metasearch service |
| `legal-ai-nats` | message transport |
| `legal-ai-bifrost` | OpenAI-compatible semantic gateway/cache |
| `legal-ai-docling-vlm` | document understanding / OCR |
| `legal-ai-image-synthesis` | GPU media generation |
| `langfuse-clickhouse` | Langfuse trace OLAP store |
| `langfuse-worker` | Langfuse async processing |
| `langfuse-server` | Langfuse UI/API |
| `legal-ai-go-search` | Go search sidecar |
| `legal-ai-go-embedding` | Go embedding sidecar |
| `legal-ai-go-retrieval` | Go retrieval sidecar |
| `legal-ai-tensorrt-llm` | GPU inference lane |
| `legal-ai-langgraph` | GPU synthesis lane |

## Service Documentation Links

These are the external docs that match the containers currently wired in the stack:

- Postgres / pgvector: [pgvector](https://github.com/pgvector/pgvector)
- Valkey: [Valkey docs](https://valkey.io/docs/)
- Qdrant: [Qdrant docs](https://qdrant.tech/documentation/)
- RabbitMQ: [RabbitMQ docs](https://www.rabbitmq.com/docs)
- Caddy: [Caddy docs](https://caddyserver.com/docs/)
- Neo4j: [Neo4j docs](https://neo4j.com/docs/)
- NATS: [NATS docs](https://docs.nats.io/)
- SeaweedFS: [SeaweedFS GitHub](https://github.com/seaweedfs/seaweedfs)

## Repo Entry Points Already Using The Shared Stack

- Redis / Valkey helper: [`scripts/atlas/lib/redis-valkey.mjs`](C:\Users\james\Videos\deeds-web-app\scripts\atlas\lib\redis-valkey.mjs)
- BitFrost semantic cache audit: [`scripts/atlas/audit-bitfrost-semantic-cache.mjs`](C:\Users\james\Videos\deeds-web-app\scripts\atlas\audit-bitfrost-semantic-cache.mjs)
- BitFrost warm path: [`scripts/atlas/warm-bitfrost-semantic-cache.mjs`](C:\Users\james\Videos\deeds-web-app\scripts\atlas\warm-bitfrost-semantic-cache.mjs)
- Redis centroid mirror: [`scripts/atlas/wire-redis-centroid-mirror.mjs`](C:\Users\james\Videos\deeds-web-app\scripts\atlas\wire-redis-centroid-mirror.mjs)
- Qdrant mirror reconciliation: [`scripts/atlas/qdrant-postgres-mirror-reconciliation.mjs`](C:\Users\james\Videos\deeds-web-app\scripts\atlas\qdrant-postgres-mirror-reconciliation.mjs)
- Go retrieval smoke: [`npm run atlas:go-retrieval:smoke`](C:\Users\james\Videos\deeds-web-app\package.json)

## Notes

- The live SeaweedFS volumes are mounted and healthy, but the data directory is currently sparse.
- The stack is using the root compose file as the canonical runtime definition, not `sveltekit-frontend/docker-compose.full.yml`.
- `.env` is primary and `.env.local` is the local override through the shared Atlas helper.

