Telemetry consumer & producer
============================

Quick notes for the telemetry consumer and producer scripts included in this repo.

Files
- `telemetry-consumer.mjs` - Node ESM consumer. BRPOP from Redis list `telemetry:events` and writes Metric nodes to Neo4j.
- `telemetry-producer.mjs` - Simple test producer that LPUSHes synthetic telemetry JSON messages into Redis.

Requirements
- Node 18+
- Redis running and reachable via `REDIS_URL` (defaults to `redis://localhost:6379`).
- Neo4j running and reachable via `NEO4J_URL`/`NEO4J_USER`/`NEO4J_PASSWORD` (defaults: `bolt://localhost:7687`, `neo4j`, `password`).

Example run

1. Start Redis and Neo4j.
2. Run the consumer:

   REDIS_URL=redis://localhost:6379 NEO4J_URL=bolt://localhost:7687 NEO4J_USER=neo4j NEO4J_PASSWORD=pass node scripts/telemetry-consumer.mjs

3. In another terminal, run the producer to push sample events:

   REDIS_URL=redis://localhost:6379 node scripts/telemetry-producer.mjs

4. Inspect Neo4j (Browser or cypher) for created `Metric` nodes and relationships.

Notes
- The consumer uses BRPOP with a 5s timeout to allow graceful shutdown polling.
- On connection or runtime errors the consumer will retry with exponential backoff up to 30s.
Telemetry Consumer (Redis → Neo4j)
=================================

Files
- `telemetry-consumer.mjs` — Node script that BRPOP's `telemetry:events` and writes Metric nodes to Neo4j.
- `telemetry-producer.mjs` — Lightweight test harness to LPUSH sample telemetry messages.

Environment variables
- `REDIS_URL` — e.g. `redis://localhost:6379`
- `NEO4J_URL` or `NEO4J_URI` — e.g. `bolt://localhost:7687`
- `NEO4J_USER` — Neo4j username (default: `neo4j`)
- `NEO4J_PASSWORD` — Neo4j password

Run locally (example)

1. Start Redis and Neo4j locally (or adjust env vars):

   Set the env vars in your shell or prefix commands.

2. Start consumer:

   node scripts/telemetry-consumer.mjs

3. In another terminal, send samples:

   node scripts/telemetry-producer.mjs

Replay stored JSONL
- You can replay JSON lines into Redis using:

  cat samples.jsonl | while read l; do redis-cli lpush telemetry:events "$l"; done

Notes
- The consumer writes `Metric` nodes and attaches them to `Device` and `Graph` nodes.
- The script uses a small batch timeout (BRPOP with 5s) so it can be shutdown cleanly with Ctrl+C.
- For production, consider adding:
  - Batch writes and backoff on Neo4j errors
  - Authentication and TLS for Redis/Neo4j
  - Idempotency keys if replaying logs
