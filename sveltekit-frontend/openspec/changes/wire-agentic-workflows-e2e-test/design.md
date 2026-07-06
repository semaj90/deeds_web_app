## Context

**Current State:**
- LangGraph dispatcher (9 nodes) wired for identity recovery, cache validation, topology routing (Sessions 113-114)
- MCP server (:8788) registers 42 tools, callable from Hermes/Claude Code/OpenCode
- Phase 1 RRF complete; 0.744 NDCG@5 on reference queries
- ACP telemetry collector (`acp-mcp-telemetry.ts`) records routing decisions + gRPC traces (not yet wired into dispatcher)
- A2A agent card (`/.well-known/agent.json`) exists but untested for discovery

**Stakeholders:** Agent framework team (sessions 119+), production operations, OpenCode/IDE integration team

**Constraints:**
- Telemetry must not block dispatcher execution (async emit to Redis/Postgres)
- Subagent invocation must preserve state isolation (no mutation during parallel execution)
- MCP tools already implemented; no new tool code needed
- Performance baseline must measure production-realistic queries (20+ reference queries)

## Goals / Non-Goals

**Goals:**
1. Validate subagent orchestration: parent node invokes ≥2 worker nodes in parallel, merges results deterministically
2. Wire ACP telemetry into dispatcher: all 9 nodes emit routing decisions, tool timing, success/error counts
3. Verify A2A discovery: `/.well-known/agent.json` returns valid metadata, consumable by agent routers
4. Test OpenCode MCP integration: invoke tool from OpenCode, verify streaming SSE response + telemetry recorded
5. Establish performance baseline: measure latency (p50/p95/p99), tool success rate, cache hit rate, error distribution
6. Document patterns: runbook for when to use subagents, supervision strategies, telemetry interpretation

**Non-Goals:**
- Do NOT modify dispatcher business logic (routing decisions remain unchanged)
- Do NOT add new MCP tools (use existing 42)
- Do NOT change Postgres/Qdrant/Redis schemas
- Do NOT implement Netflix Headroom integration (optional future work)
- Do NOT change packet identity or canonical flow

## Decisions

**Decision 1: Telemetry Emission Pattern (Async + Non-Blocking)**

**Choice:** Emit telemetry to Redis (fast, <5ms) + Postgres (audit, eventual consistency). Use `queueMicrotask()` to defer Postgres writes and prevent blocking.

**Rationale:** Dispatcher nodes must return quickly (<100ms total). Redis is fast (L1 cache); Postgres audit is non-critical path. Deferring Postgres writes avoids cascading latency.

**Alternatives:**
- Synchronous emit (REJECTED: blocks dispatcher, violates <100ms SLA)
- Message queue only (RabbitMQ) (CONSIDERED: more resilient but adds complexity; Redis queue sufficient for test phase)
- No telemetry during test (REJECTED: loses visibility into subagent behavior)

---

**Decision 2: Subagent Invocation (Promise.allSettled + Merge)**

**Choice:** Parent node invokes subagents via `Promise.allSettled()` (parallel, fail-safe). Merge results: if ≥1 succeeds, composite result is valid; if all fail, parent fails. Metadata from highest-confidence subagent wins.

**Rationale:** Robustness: allows partial failures. Dispatcher already uses this pattern (sessions 113-114); proven safe. Deterministic merge (sorted by confidence score) ensures reproducibility.

**Alternatives:**
- Promise.all() (REJECTED: one failure fails entire workflow)
- Sequential execution (REJECTED: O(n) latency, defeats parallelism)
- Soft fail + default (CONSIDERED: acceptable but less data-rich)

---

**Decision 3: Performance Baseline Measurement (Percentile Tracking)**

**Choice:** Measure latency as p50/p95/p99 across 20+ reference queries. Track tool success rate (%), cache hit rate (L1 Bifrost + Postgres), error distribution by error class.

**Rationale:** Percentiles capture tail behavior (p99 ≠ average). 20+ queries provides statistical stability. Reference queries are production-realistic (from prior sessions' benchmark data).

**Alternatives:**
- Average latency only (REJECTED: hides tail latency)
- Synthetic micro-queries (REJECTED: unrealistic, won't find real bottlenecks)
- Live production telemetry (REJECTED: test phase only, can't instrument prod yet)

---

**Decision 4: A2A Discovery Validation (HTTP GET + Schema Check)**

**Choice:** A2A discovery test: GET `/.well-known/agent.json`, validate schema (name, tools array, capabilities, endpoint), verify tools list matches MCP server `:8788`.

**Rationale:** A2A is HTTP-based standard. Schema validation ensures agent routers can consume metadata. Tool list match confirms MCP registration is current.

**Alternatives:**
- Graphql introspection (REJECTED: A2A uses REST)
- Skip discovery test (REJECTED: blocks production deployment)

---

**Decision 5: OpenCode MCP Integration Test (SSE Streaming)**

**Choice:** OpenCode test: invoke tool via MCP tool call → MCP server routes to implementation → implementation calls dispatcher → response streams back via SSE. Telemetry recorded at each stage.

**Rationale:** Tests full pipeline: IDE → MCP → dispatcher → telemetry. SSE is OpenCode's standard response format. Telemetry at each stage provides visibility.

**Alternatives:**
- Direct HTTP POST (REJECTED: doesn't test MCP layer)
- CLI invocation (CONSIDERED: valid but doesn't test IDE integration)

## Risks / Trade-offs

| Risk | Mitigation |
|------|-----------|
| **Subagent deadlock** (child nodes waiting on parent, parent waiting on children) | Design parent-child handoff to avoid circular waits; test with timeout guards (5s); use `Signal.timeout()` |
| **Telemetry overwhelming Postgres** (high query volume → slow audit writes) | Defer Postgres writes to microtask queue; batch writes every 100ms; monitor Postgres write latency |
| **MCP tool timeout** (tool hangs, blocks OpenCode) | Test harness includes 30s timeout; MCP server enforces call deadline via gRPC context |
| **Performance baseline unrealistic** (reference queries don't match prod) | Use 20+ queries from Sessions 115-118 benchmark data; cross-validate with live dispatcher logs |
| **A2A discovery metadata stale** (tools added to MCP but not reflected in agent card) | Agent card is generated from MCP tool list at startup; requires restart if tools added; document this |

## Migration Plan

**Phase 1: Instrumentation (Session 119a, ~3-4h)**
1. Wrap dispatcher orchestrator nodes with telemetry collection
2. Wrap MCP tool implementations with telemetry wrapping
3. Verify telemetry flows to Redis/Postgres

**Phase 2: Subagent Testing (Session 119b, ~2-3h)**
1. Implement parent-child invocation pattern
2. Test with 2-3 sample subagent pairs
3. Verify result merging determinism

**Phase 3: A2A + OpenCode Testing (Session 119c, ~2-3h)**
1. Validate A2A discovery endpoint
2. Test OpenCode MCP tool invocation
3. Capture telemetry from OpenCode calls

**Phase 4: Performance Baseline (Session 119d, ~2-3h)**
1. Execute 20+ reference queries through dispatcher
2. Collect latency, success rate, cache hit rate metrics
3. Generate report (p50/p95/p99, error distribution)

**Phase 5: Documentation (Session 119e, ~1-2h)**
1. Write agentic workflow runbook
2. Capture patterns and guardrails
3. Commit everything

**Rollback:** All changes are additive (telemetry only; no dispatcher logic changes). Rollback = revert instrumentation code; dispatcher behavior unchanged.

## Open Questions

1. **Subagent supervision strategy:** Should parent use `StateGraph` for subagent invocation, or manual `Promise.allSettled()`? (Leaning toward manual for simplicity in test phase)
2. **Telemetry retention:** How long to keep Redis telemetry? (Suggested: 24h for performance debugging; Postgres keeps forever for audit)
3. **A2A tool list sync:** Should agent card refresh automatically when MCP tools change? (Suggested: manual refresh on startup; document this)
4. **Performance SLA:** What are acceptable p99 latencies for production? (Need to define target before Session 119)

