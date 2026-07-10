# OpenTelemetry Phase 9 Plan

**Status**: ACTIVE  
**Updated**: July 10, 2026  
**Scope**: Phase 9 instrumentation for Atlas routing, ACP loops, retrieval attempts, and packet materialization

---

## Current State

### Confirmed in `sveltekit-frontend/package.json`

- `@langchain/langgraph`
- `@langchain/langgraph-checkpoint-postgres`
- `@modelcontextprotocol/sdk`
- `ai`

### Not currently present

- no `@opentelemetry/*` packages in `dependencies`
- no explicit OTLP exporter package
- no Jaeger/Tempo/Zipkin exporter package
- no Prometheus metrics exporter package

This means the repo has orchestration and local telemetry surfaces, but not a real OpenTelemetry export layer yet.

## Current Pipeline Health Snapshot

- SSE streaming chat: `97%` | `14-step pipeline`
- ACE context assembly: `95%` | `RAG + KAG + DAG + topology + web`
- Qdrant vector search: `95%` | `INT8 quantized, BM42 hybrid`
- Redis cache: `95%` | `Dual-tier memory+Redis`
- GPU utilization: `60%` | `LibTorch CUDA active, no Triton`
- Langfuse observability: `70%` | `42 files instrumented, not enabled`

---

## Design Rule

OpenTelemetry is for:

- traces
- spans
- timings
- correlation ids
- lane attribution
- ACP attempt lineage

It is **not**:

- canonical packet storage
- cache state
- ranking truth
- identity derivation

Canonical truth stays in Postgres.

---

## What Phase 9 Should Instrument

### 1. Retrieval path

Instrument the full retrieval attempt chain:

`query -> lexical -> dense -> topology -> fusion -> rerank -> winner`

Per-attempt trace fields:

- `trace_id`
- `attempt_id`
- `packet_key`
- `source_ref`
- `feature_id`
- `domain_class`
- `retrieval_lane`
- `latency_ms`
- `candidate_count`
- `winner_rank`

### 2. ACP routing path

Instrument:

`HMM state -> router decision -> tool execution -> validation -> next state`

Per-step fields:

- `hmm_state`
- `repair_lane`
- `tool_id`
- `policy_source`
- `validation_status`
- `retry_count`

### 3. Packet materialization path

Instrument:

`canonical row -> envelope validation -> msgpack encode -> registry write -> cache promote`

Per-step fields:

- `packet_key`
- `validation_status`
- `registry_status`
- `cache_state`
- `msgpack_bytes`
- `mmap_offset`

### 4. Fan-out workers

Instrument bounded worker jobs:

- LangExtract
- ast-grep
- embedding backfill
- Qdrant bridge
- topology passes

Per-job fields:

- `job_type`
- `batch_size`
- `rows_read`
- `rows_written`
- `rows_rejected`
- `duration_ms`

---

## Recommended Dependency Slice

Do this in one bounded package install, not ad hoc.

Core:

- `@opentelemetry/api`
- `@opentelemetry/sdk-node`
- `@opentelemetry/auto-instrumentations-node`

Then choose one exporter path first:

- OTLP HTTP/GRPC exporter for a collector-based setup

Avoid installing multiple competing exporters in the first pass unless a collector target already exists.

---

## Bounded Rollout Order

### P0 — bootstrap only

- [ ] Add OpenTelemetry bootstrap module under `sveltekit-frontend/src/lib/server/telemetry/`
- [ ] Initialize trace provider once at server startup
- [ ] Emit service name, service version, environment
- [ ] Keep instrumentation disabled behind env flag by default

### P1 — retrieval spans

- [ ] Wrap unified retrieval entrypoints
- [ ] Add span attributes for lane, candidate count, latency, winner
- [ ] Add trace propagation into retrieval attempts persistence

### P2 — ACP/HMM spans

- [ ] Wrap HMM routing
- [ ] Wrap tool-router execution
- [ ] Attach `hmm_state`, `repair_lane`, `tool_id`

### P3 — packet/materializer spans

- [ ] Wrap HyperRAG packet materializer
- [ ] Wrap packet validation
- [ ] Wrap MsgPack/mmap registry writes

### P4 — worker spans

- [ ] Wrap LangExtract worker batches
- [ ] Wrap ast-grep batches
- [ ] Wrap embedding backfill batches
- [ ] Wrap Qdrant bridge batches

### P5 — dashboards and gates

- [ ] Verify spans are emitted end to end
- [ ] Add smoke test for trace bootstrap
- [ ] Add one report showing trace correlation through retrieval and ACP

---

## Integration Boundaries

### Keep these separated

- Postgres = canonical packet truth
- Qdrant = vector mirror
- Neo4j = topology mirror
- Valkey = hot cache
- OpenTelemetry = execution evidence

### Do not conflate them

- OTel should not hold packet payloads
- OTel should not become a retry ledger
- OTel should not replace `retrieval_attempts`
- OTel should not replace `atlas_packet_registry`

---

## File Targets

Likely implementation points:

- `sveltekit-frontend/src/lib/server/telemetry/`
- `sveltekit-frontend/src/lib/server/hmm/`
- `sveltekit-frontend/src/lib/server/router/`
- `sveltekit-frontend/src/lib/server/retrieval/`
- `scripts/atlas/hyperrag-packet-materializer.mjs`
- worker entrypoints under `sveltekit-frontend/scripts/atlas/` and `scripts/atlas/`

---

## Smoke Gate

Phase 9 is only considered wired when all are true:

- server boots with telemetry enabled
- one retrieval request creates a root trace
- child spans appear for lane selection and candidate generation
- one ACP loop carries the same trace id across routing and validation
- one packet materialization run emits bounded registry-write spans

---

## Recommendation

Do not start with full auto-instrument everything.

Start with:

1. explicit bootstrap
2. explicit retrieval spans
3. explicit ACP/HMM spans
4. explicit packet materializer spans

That gives you useful execution evidence without drowning the repo in noisy traces.
