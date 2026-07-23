# Engram API Spec — Atlas

This document formalizes the Engram API: types, validation, and example MCP JSON-RPC calls.

Overview
- Engram is the session-memory coordinator. It does NOT replace Redis/Qdrant/Neo4j/Postgres.
- Responsibilities: Extract, reconcile, consolidate, promote, inject memories into model context.

Storage responsibilities
- Redis/Valkey: hot cache and streams (short TTLs). Do not rely on Redis as durable truth.
- Postgres (JSONB): durable truth and audit trail.
- Qdrant: vector storage for semantic search (embeddinggemma 768 dim canonical).
- Neo4j: relationship graphs (IMPORTS, CALLS, USES_DB, behavioral topology).

Core types (Zod schemas)
- See `src/lib/server/engram/engram-types.ts` for the full Zod + TypeScript definitions.

Rules (constraints)
- `sourceRefs` is required when `promotionState` is `active` or when promoting memory.
- `graphVersion` is required on all promoted objects and session contexts.
- `promotionState` must be one of: `active | superseded | archived | rejected`.

API endpoints (conceptual)
- `POST /api/engram/inject` — inject session context or memories (accepts dry/apply)
- `GET  /api/engram/kv_status?sessionId=...` — kv_cache_status lookup
- `POST /api/engram/outcome` — record an outcome trace
- `POST /api/engram/promote` — promote a memory (requires sourceRefs + graphVersion)
- `POST /api/engram/supersede` — supersede an existing promoted memory

Examples

1) session_context_inject (HTTP)

Request (JSON):

{
  "sessionId": "sess_abc123",
  "mode": "apply",
  "injectTo": "kv",
  "memories": [
    {
      "id": "m1",
      "sourceRef": "context-assembler.ts",
      "summary": "ACE retrieval policy tuned",
      "vector64": [0.001, ...],
      "graphVersion": "2026-05-29"
    }
  ]
}

Response:

{
  "requestId": "r_1",
  "sessionId": "sess_abc123",
  "injectedCount": 1,
  "injectedIds": ["m1"],
  "success": true
}

2) kv_cache_status (HTTP GET)

Request: `GET /api/engram/kv_status?sessionId=sess_abc123`

Response:

{
  "sessionId": "sess_abc123",
  "kvSlot": "kv:session:sess_abc123",
  "ttl": 3600,
  "items": ["m1","m2"]
}

3) record_outcome (HTTP POST)

Request:

{
  "timestamp": "2026-05-29T12:00:00Z",
  "action": "record_outcome",
  "details": {
    "queryHash": "q_123",
    "success": true,
    "tools": ["trace_tool_chain"]
  }
}

Response:

{ "ok": true, "traceId": "t_1" }

4) promote_memory

Request (requires `sourceRefs` and `graphVersion`):

{
  "memoryId": "m1",
  "memory": {
    "sourceRef": "context-assembler.ts",
    "summary": "Compact retrieval hint",
    "vector64": [ ...64 numbers... ],
    "graphVersion": "2026-05-29"
  },
  "promotedBy": "system:engram-worker",
  "promotionState": "active",
  "sourceRefs": ["context-assembler.ts"],
}

Response:

{ "ok": true, "memoryId": "m1", "promotionState": "active" }

5) supersede_memory

Request:

{
  "memoryId": "m1",
  "supersededBy": {
    "id": "m2",
    "sourceRef": "context-assembler.ts",
    "graphVersion": "2026-05-29"
  },
  "reason": "better compressed vector64 and updated authority",
  "promotedBy": "engram-batcher"
}

Response:

{ "ok": true, "superseded": true }

MCP JSON-RPC examples

The MCP (JSON-RPC 2.0) style lets models call Engram tools directly. Example requests below.

1) `engram.session_context_inject` (RPC)

Request:

{
  "jsonrpc": "2.0",
  "id": "rpc1",
  "method": "engram.session_context_inject",
  "params": {
    "sessionId": "sess_abc123",
    "mode": "dry",
    "memories": [ { "sourceRef": "context-assembler.ts", "summary": "...", "graphVersion": "2026-05-29" } ]
  }
}

Response:

{
  "jsonrpc": "2.0",
  "id": "rpc1",
  "result": { "injectedCount": 0, "mode": "dry", "success": true }
}

2) `engram.kv_cache_status` (RPC)

Request:

{
  "jsonrpc": "2.0",
  "id": "rpc2",
  "method": "engram.kv_cache_status",
  "params": { "sessionId": "sess_abc123" }
}

Result:

{
  "jsonrpc": "2.0",
  "id": "rpc2",
  "result": { "kvSlot": "kv:session:sess_abc123", "items": ["m1"] }
}

3) `engram.record_outcome` (RPC)

Request:

{
  "jsonrpc": "2.0",
  "id": "rpc3",
  "method": "engram.record_outcome",
  "params": { "action": "record_outcome", "details": { "queryHash": "q_123", "success": true } }
}

Result:

{ "jsonrpc": "2.0", "id": "rpc3", "result": { "ok": true, "traceId": "t_1001" } }

4) `engram.promote_memory` (RPC)

Request:

{
  "jsonrpc": "2.0",
  "id": "rpc4",
  "method": "engram.promote_memory",
  "params": { "memory": { "sourceRef": "context-assembler.ts", "vector64": [...], "graphVersion": "2026-05-29" }, "promotedBy": "engram-batcher" }
}

Result:

{ "jsonrpc": "2.0", "id": "rpc4", "result": { "ok": true, "memoryId": "m_new" } }

Tooling notes
- Validate all incoming RPC payloads with the Zod schemas in `engram-types.ts`.
- Enforce `sourceRefs` presence in promotion handlers and return a 400-like error if missing.
- Use Redis Streams for asynchronous promotion jobs and Postgres JSONB inserts for durable promotion audit rows.

Appendix: audit & observability
- Every promotion/ injection should emit an `EngramOutcomeTrace` record and persist to a JSONB audit table in Postgres.
- Emit lightweight Prometheus metrics: `engram_promotions_total`, `engram_injections_total`, `engram_injection_failures_total`.
