# KERNEL-REAL-02 Read-Only Policy Implementation

Status: `BLOCKED_ZERO_WRITE_PROOF`

## Registration and handler trace

- Listener owner: `sveltekit-frontend/src/mcp/trace-mcp-server.ts`; it serves Streamable HTTP and optional stdio from the same MCP server registry.
- Live listener: PID `10660`, `127.0.0.1:8788`, healthy; process started `2026-10-04 07:48:29` local time.
- Registration source: `registerNewTools(...)` is invoked by the listener.
- `atlas.query` registration: `sveltekit-frontend/src/mcp/new_tools.ts`.
- Resolved handler: `atlas.query` and `kb.trace_search` currently wrap the same `handleTraceSearch`, which calls embedding generation and `traceRerank`. This is the interim TRACE-backed path, not proof of unified `atlas_context` ownership.
- Live `tools/list`: HTTP 200, 188 tools; canonicalized tool-surface checksum/revision `sha256:ad5edd60b920052c05340142e9b47a3d0fa01e13755dc3f47ba4c72cb25af8bb`. This is a registry snapshot, not a source/build revision.
- The running process predates the edited source files (`new_tools.ts`, `dispatcher-middleware.ts`, and `embedding-client.ts` were modified at about 18:xx local time). Therefore its `tools/list` confirms current registry identity, but its runtime cannot prove this patch.

## Implemented boundary

- Added `QueryExecutionModeV1` with `READ_ONLY`, `OBSERVED_READ_ONLY`, and `MUTATING`; the `atlas.query` MCP registration assigns strict `READ_ONLY` server-side.
- Strict mode allows embedding-cache lookup but suppresses population; query embedding misses still compute without cache writes.
- Strict embedding cache behavior has a dedicated write-spy test: cache lookup and embedding computation occur, Redis population does not.
- Strict mode suppresses dispatcher Postgres audit, Engram observations, and LangGraph middleware execution. The receipt identifies suppressed hooks.
- TRACE Qdrant searches use cache bypass, bypass cross-invocation capability memoization and in-flight deduplication, and suppress Langfuse persistence for this call only.
- `ReadOnlySideEffectReceiptV1` records the known cache, audit, Engram, and Langfuse suppressions. Its zero-commit field is implementation telemetry, not independent live readback.

## Proof status

- Registry/listener resolution: **PASS** for listener identity, registration source, resolved handler, and observed live tool-surface checksum. The checksum is not an implementation revision, and the server process is stale relative to this source patch.
- Canonical orchestrator: **NOT PROVEN**; the registered handler is the TRACE alias.
- Policy propagation: verified in the current MCP handler → embedding → TRACE reranker → Qdrant path; no tRPC `atlas.query` procedure exists in the inspected router.
- Focused Vitest: 4 files / 7 tests passed, including strict dispatcher suppression, policy/receipt behavior, Qdrant no-cache/no-Langfuse propagation, and embedding-cache lookup-only behavior.
- `svelte-check`: stopped after the process exceeded 4.5 GB resident memory without diagnostics; classify as `INCOMPLETE_RESOURCE_LIMIT`, not failed.
- TypeScript transpile syntax: pass for 12 changed source/test files.
- `git diff --check`: pass for tracked changes.
- Live query and before/after persistent-state counters: **NOT RUN** because PID `10660` is running pre-patch code. No service restart or duplicate writer-capable server was launched. No claim of `ZERO_COMMITTED_WRITES` or KERNEL-REAL-02 completion.

## Remaining gates

1. Build/restart the approved server from this exact source revision in a controlled window; do not use the stale listener for runtime proof.
2. Establish the actual unified `atlas_context` registration/handler without replacing the interim route prematurely.
3. Run the canonical route with independent before/after database, Redis, Qdrant, and observability readback/counters.
4. Pass only when the exact query/workspace/service/registry/orchestrator receipts prove zero committed writes.
