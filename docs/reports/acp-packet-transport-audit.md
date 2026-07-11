# ACP Packet Transport Audit

Generated: 2026-07-11T07:16:25.342Z

Verdict: **PASS_WITH_WARNINGS**

## What This Proves

- JSON-RPC 2.0 ACP request shape is validated before routing.
- Required analytics fields are normalized: `story_id`, `task_id`, `worker_id`, `trace_id`, `packet_key`, `source_ref`, `feature_id`.
- RabbitMQ, NATS, Langfuse, Go Retrieval, Qdrant, and Neo4j are classified separately.
- Postgres remains the proof/analytics store; queues and observability systems are not canonical truth.

## Services

| Service | Status | Detail |
|---|---|---|
| langfuse | READY | HTTP 200 |
| langfuse_otlp | READY_REQUIRES_AUTH | HTTP 401 |
| go_retrieval | READY | HTTP 200 |
| qdrant | READY | HTTP 200 |
| neo4j_http | READY | HTTP 200 |
| nats_http | READY | HTTP 200 |

## JSON-RPC

- valid sample: PASS
- adversarial rejected: 6/6

## Canonical Fields

- missing: none
- invalid: none

## Queue Proof

- RabbitMQ queues: 20
- RabbitMQ status: READY_WITH_QUEUES
- NATS status: BROKER_ONLY_HANDLERS_MISSING

## Analytics

- existing tables: ace_retrieval_hits, ace_retrieval_runs, agent_os_events, analytics_events, phase89_agentic_calls, task_registry, trace_events, trace_runs
- apply mode: false
- agent_os_events insert: SKIPPED

## Next Action

Start NATS handlers with `cd sveltekit-frontend; npm run nats:handlers`, then rerun `npm run nats:proof-of-life:all`.
