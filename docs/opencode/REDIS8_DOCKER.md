# Redis 8 (Docker) — Eval Lane Guide

This guide shows how to run the isolated Redis 8 eval lane, verify connectivity, and compare it to the current Redis 7 production hot cache.

Keep the split:

- Redis 7 `legal-ai-redis` = current production hot cache
- Redis 8 eval = experimental agent-memory / vector-set lane
- do not replace the current Redis 7 stack yet

1) Run Redis 8 with Docker (quick)

```bash
docker run -d --name deeds-redis8-eval -p 6380:6379 redis:8
```

2) Docker Compose (persist data)

```yaml
version: '3.8'
services:
  redis8-eval:
    image: redis:8-alpine
    container_name: deeds-redis8-eval
    ports:
      - '6380:6379'
    volumes:
      - redis8-eval-data:/data
    command: ["redis-server", "--appendonly", "yes"]

volumes:
  redis8-eval-data:
```

3) Connectivity checks

From host using redis-cli inside container:

```bash
docker exec -it deeds-redis8-eval redis-cli ping
# → PONG
```

From Node, set `REDIS_URL=redis://localhost:6380` and run the eval smoke.

Optional Redis Agent Memory Server eval ports:

- `8010` = REST eval port
- `9010` = MCP eval port

4) Pub/Sub vs Streams vs Keyspace notifications

- Pub/Sub: simplest. Producer publishes JSON to the `claude-mem:new` channel; monitor subscribes and indexes immediately.
- Streams: durable with consumer groups (use `XADD` + `XREADGROUP`) — recommended for production.
- Keyspace notifications: requires server config `notify-keyspace-events` — useful for watching key changes but less common for event ingest.

5) Redis config notes

- To enable keyspace notifications adjust `redis.conf` with `notify-keyspace-events Ex` if needed.
- For production enable persistence and set appropriate `maxmemory`/eviction policies.

6) Security

- Do not expose 6380 to the public internet. Use network-level protections or run Redis on a private network.
- Use ACLs / AUTH and TLS for production deployments.

7) Example publisher (Node + ioredis)

```js
import Redis from 'ioredis'
const r = new Redis(process.env.REDIS_URL)
const obs = { observation_id: 'abc123', text: '...' }
await r.publish('claude-mem:new', JSON.stringify(obs))
```

8) Next steps

- Test the eval lane with `docker compose -f sveltekit-frontend/docker/docker-compose.redis8-eval.yml up -d`
- Verify `INFO server`, `PING`, and vector-set command availability if the module is present
- Compare Redis 8 vector-set and agent-memory behavior against Qdrant and the current Redis 7 hot cache before any promotion
