# Adapter Ranking System

This document describes the lightweight adapter-ranking system used by the platform.

## Goals

- Maintain a ranked list of LLM adapters (fine-tuned LoRA adapters, model variants) in Redis for fast selection.
- Store per-adapter metrics (latency, positive/negative feedback counts) in Redis HASHes.
- Record user-level usage/feedback edges in Neo4j for analytics and offline training signals.
- Periodically compute scores in a Python ranker and update Redis ZSET `adapters:rank`.

## Redis schema

- ZSET: `adapters:rank` — members: adapterId, score: floating number (higher = better)
- HASH: `adapter:<id>` — fields:
  - `latency_ms` — recent average latency
  - `pos` — positive feedback count
  - `neg` — negative feedback count
  - `last_updated` — timestamp

Examples:

ZADD adapters:rank 123.45 adapter-xyz
HSET adapter:adapter-xyz latency_ms 120 pos 5 neg 1 last_updated 1690000000000

## Neo4j

- Nodes: `User`, `Adapter`
- Edges: `(:User)-[:USED]->(:Adapter)` with `lastUsed` timestamp
- Feedback: `(:User)-[:RATED]->(:Adapter)` with `score` and `timestamp`

## Environment

- REDIS_URL (e.g. redis://:password@localhost:6379)
- NEO4J_URI, NEO4J_USERNAME, NEO4J_PASSWORD
- LLM_ORCHESTRATOR_URL — optional; endpoint the contextual-chat endpoint forwards to if present

## Components

- `scripts/adapter_ranker.py` — Python periodic ranker; reads per-adapter HASH data, computes scores, updates ZSET `adapters:rank`, and optionally notifies a model server (Triton) to refresh adapters.
- `scripts/train_adapter.py` — example LoRA/PEFT training script that stores adapters under `adapters/<name>`.
- `sveltekit-frontend/src/lib/server/adapter-ranking.ts` — TS helper exposing `getTopAdapter()` and `recordAdapterUsage()` used by the `/api/ai/contextual-chat` route.

## Running the ranker (systemd example)

[Unit]
Description=Adapter Ranker
After=network.target

[Service]
User=deeds
WorkingDirectory=/srv/deeds-web-app
Environment=REDIS_URL=redis://:redis@localhost:6379
Environment=NEO4J_URI=bolt://localhost:7687
ExecStart=/usr/bin/python3 scripts/adapter_ranker.py
Restart=on-failure

[Install]
WantedBy=multi-user.target

## Docker-compose snippet

services:
  redis:
    image: redis:7
    ports: [6379:6379]
  neo4j:
    image: neo4j:5
    environment:
      NEO4J_AUTH: neo4j/password
  adapter-ranker:
    build: .
    command: python3 scripts/adapter_ranker.py
    environment:
      REDIS_URL: redis://:redis@redis:6379
      NEO4J_URI: bolt://neo4j:7687

## Smoke-test steps

1. Populate Redis with sample adapters:
   - ZADD adapters:rank 100 adapter-a 80 adapter-b
   - HSET adapter:adapter-a latency_ms 120 pos 10 neg 2 last_updated <ts>
2. Run `scripts/adapter_ranker.py` once and observe `ZREVRANGE adapters:rank 0 10 WITHSCORES` to see updated scores.
3. Call the server endpoint POST /api/ai/contextual-chat with `{ "input": "Hello", "userId": "u1" }` — the endpoint will call `getTopAdapter()` and return the adapter chosen.

## Notes and safety

- The ranker should start in a dry-run mode when first enabled on production data.
- Training adapters (LoRA) must be tested on small datasets before any production rollout.
