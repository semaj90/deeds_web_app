## Why

Agentic workflows (LangGraph subagents, hierarchical tool invocation, MCP integration) are ready to test but lack end-to-end validation. Sessions 115-118 wired dispatcher + identity recovery; Phase 1 RRF completed with 0.744 NDCG@5. Now we need to: (1) validate subagent orchestration (parent invoking children, merging results), (2) wire telemetry collection into dispatcher nodes, (3) verify A2A agent discovery is operational, (4) test OpenCode ↔ MCP ↔ LangGraph ↔ telemetry pipeline, (5) establish performance baselines for production routing decisions. This blocks future agentic feature work and production deployment.

## What Changes

- Wire `AcpTelemetryCollector` into all 9 dispatcher nodes to record routing decisions, gRPC call traces, tool invocations, latency (p50/p95/p99)
- Create subagent test harness: parent node invokes N worker nodes in parallel via `Promise.allSettled()`, merges results back to state
- Implement A2A discovery test: verify `/.well-known/agent.json` returns valid agent metadata (name, tools, capabilities)
- Add OpenCode MCP integration test: invoke dispatcher tool from OpenCode, verify streaming response via SSE, confirm telemetry recorded
- Build end-to-end workflow test: query → dispatcher routing decision → subagent execution → cache validation → topology enrichment → telemetry export
- Add performance baseline measurement: track latency (p50/p95/p99), tool success rate (%), cache hit rate (%), error distribution
- Create runbook documentation for agentic patterns: when to use subagents, supervision strategies, telemetry interpretation, troubleshooting

## Capabilities

### New Capabilities

- `langgraph-subagent-orchestration`: Parent node can invoke multiple worker subagents in parallel, merge results deterministically, with context passing (Postgres client, Redis, gRPC routing)
- `acp-telemetry-instrumentation-in-dispatcher`: Dispatcher nodes emit routing decisions, tool calls, gRPC traces, and latency metrics to Redis + Postgres
- `a2a-agent-discovery-validation`: Agent card at `/.well-known/agent.json` is discoverable, contains valid metadata (tools list, capabilities, endpoint)
- `opencode-mcp-streaming-integration`: OpenCode can invoke MCP tools (registered at :8788), receive streaming responses via SSE, with telemetry recorded for each call
- `end-to-end-agentic-workflow-test-harness`: Query → dispatcher → subagents → cache/topology enrichment → telemetry → response test suite
- `agentic-performance-baseline-measurement`: Latency (p50/p95/p99), tool success rate, cache hit rate, error distribution tracking and reporting

### Modified Capabilities

- `dispatcher-9-node-state-machine`: Add telemetry instrumentation to existing 9 nodes (no behavioral changes, purely observability)
- `mcp-tool-service`: Wire existing 42 MCP tools to emit telemetry on invocation (timing, success/failure, params snapshot)

## Impact

- **New test files**: `tests/agentic-workflows-e2e.spec.ts`, `tests/subagent-orchestration.spec.ts`, `tests/a2a-discovery.spec.ts`, `tests/opencode-mcp-integration.spec.ts`
- **Modified files**: `src/lib/server/dispatcher/dispatcher-orchestrator.ts` (add telemetry), `src/mcp/server.ts` (add telemetry wrapping), `src/routes/.well-known/agent.json/+server.ts` (verify metadata)
- **New utility**: `src/lib/server/telemetry/agentic-workflow-baseline.ts` (performance measurement)
- **New documentation**: `docs/agentic-workflow-patterns.md` (runbook for subagents, supervision, telemetry)
- **Dependencies**: LangGraph (already in use), ioredis (already in use), Drizzle (already in use)
- **APIs unchanged**: No breaking changes to existing retrieval, cache, or packet identity APIs
