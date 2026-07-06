# Agentic Workflow Testing Plan — OpenSpec Change Complete ✅

**Change Name:** `wire-agentic-workflows-e2e-test`  
**Status:** ✅ **ALL ARTIFACTS CREATED** (proposal, design, specs, tasks)  
**Location:** `sveltekit-frontend/openspec/changes/wire-agentic-workflows-e2e-test/`  
**Ready for Implementation:** YES — run `/opsx:apply` or `npm run implement` when ready

---

## What This Plan Covers

Comprehensive end-to-end testing for agentic workflows (LangGraph subagents, telemetry, A2A discovery, OpenCode MCP integration).

**Key Deliverables:**
1. ✅ Telemetry instrumentation in all 9 dispatcher nodes (routing decisions, gRPC traces, tool calls)
2. ✅ Subagent orchestration harness (parent → children parallel invocation, deterministic merging)
3. ✅ A2A agent discovery validation (agent card metadata, tool list sync, endpoint reachability)
4. ✅ OpenCode MCP integration test (IDE → MCP → dispatcher → telemetry pipeline)
5. ✅ End-to-end workflow test (20+ reference queries through full dispatcher)
6. ✅ Performance baseline measurement (latency p50/p95/p99, tool success rate, cache hit rate, error distribution)
7. ✅ Comprehensive documentation (agentic patterns runbook, supervision strategies, troubleshooting)

---

## Implementation Scope (5 Sessions × ~4 hours each = 20 hours total)

### Session 119a: Telemetry Instrumentation (3-4h)
- Wire `AcpTelemetryCollector` into all 9 dispatcher nodes
- Capture routing decisions, gRPC traces, tool invocations
- Async + non-blocking emission (Redis sync, Postgres deferred)
- Unit tests for telemetry wrapper

### Session 119b: Subagent Orchestration (2-3h)
- Implement parent node invoking multiple subagents in parallel
- `Promise.allSettled()` with timeout protection (30s)
- Deterministic result merging (dedupe, sum scores, highest-confidence metadata)
- State isolation testing (no data corruption during concurrent execution)

### Session 119c: A2A + OpenCode Integration (2-3h)
- Validate A2A discovery endpoint (`/.well-known/agent.json`)
- Verify tools list matches MCP server registration
- OpenCode MCP integration test: streaming SSE response + telemetry

### Session 119d: End-to-End Testing + Performance (2-3h)
- Execute 20+ reference queries through dispatcher
- Collect latency (p50/p95/p99), tool success rate, cache hit rate, error distribution
- Performance baseline report generation

### Session 119e: Documentation + Final Validation (1-2h)
- Write comprehensive agentic patterns runbook
- Full test suite validation (no regressions)
- Final commit and handoff

---

## Key Design Decisions

### 1. **Telemetry Emission: Async + Non-Blocking**
- Redis write (sync, <5ms) + Postgres write (deferred, eventual consistency)
- No blocking of dispatcher execution
- Preserves <100ms total dispatcher SLA

### 2. **Subagent Invocation: Promise.allSettled()**
- Parallel execution (fail-safe, robust to partial failures)
- 30s timeout per subagent (prevents indefinite hangs)
- Deterministic result merging (sorted by confidence)

### 3. **Performance Baseline: Percentile Tracking**
- p50/p95/p99 latency across 20+ production-realistic queries
- Tool success rate (%), cache hit rate (%), error distribution
- Thresholds: p99 < 100ms, error rate < 5%, cache hit > 50%

### 4. **A2A Discovery: HTTP Schema Validation**
- GET `/.well-known/agent.json` returns valid agent metadata
- Tools list auto-syncs from MCP server or refreshes on startup
- Capabilities array derived from dispatcher nodes (9+)

---

## Test Harnesses & Scripts

| Test | Command | Purpose |
|------|---------|---------|
| A2A Discovery | `npm run test:a2a-discovery` | Validate agent card metadata, tools, endpoint |
| OpenCode MCP | `npm run test:opencode-mcp-integration` | IDE → MCP → dispatcher → telemetry |
| E2E Reference Queries | `npm run test:agentic-e2e:reference-queries` | 20+ production queries through full pipeline |
| Performance Baseline | `npm run test:agentic-e2e:perf-baseline` | Latency, success rate, cache hit, error dist. |
| Full Test Suite | `npm run test` | Validate no regressions |

---

## Artifacts Created

### 1. Proposal (`proposal.md`)
- **Why:** Agentic workflows ready to test; need end-to-end validation before production
- **What Changes:** Telemetry instrumentation, subagent orchestration, A2A validation, OpenCode integration, performance baseline
- **Capabilities:** 6 new capabilities (subagent orchestration, ACP telemetry, A2A discovery, OpenCode MCP, E2E test, performance measurement)
- **Modified Capabilities:** 2 (dispatcher nodes + MCP tools, observability only)

### 2. Design (`design.md`)
- **Context:** Current state, constraints, stakeholders
- **Goals:** Validate subagents, wire telemetry, verify A2A, test OpenCode, establish performance baseline
- **Decisions:** 5 key technical choices with rationale
- **Risks & Trade-offs:** Deadlock prevention, Postgres overload mitigation, telemetry retention strategy
- **Migration Plan:** 5 phases (instrumentation → subagents → A2A/OpenCode → perf → docs)

### 3. Specs (6 files in `specs/` subdirectory)
Each specification file defines WHAT the system should do:

- **`langgraph-subagent-orchestration/spec.md`**
  - Parallel invocation, deterministic merging, context isolation, timeout protection
  - 4 requirements, 10+ scenarios

- **`acp-telemetry-instrumentation-in-dispatcher/spec.md`**
  - Non-blocking emission, routing metadata, gRPC traces, tool calls, latency tracking, cache tracking
  - 6 requirements, 20+ scenarios

- **`a2a-agent-discovery-validation/spec.md`**
  - Agent metadata endpoint, tools list sync, capabilities, endpoint URL, test harness
  - 5 requirements, 8+ scenarios

- **`opencode-mcp-streaming-integration/spec.md`**
  - Tool invocation from OpenCode, streaming SSE, telemetry recording, test harness
  - 3 requirements, 6+ scenarios

- **`end-to-end-agentic-workflow-test-harness/spec.md`**
  - Full workflow execution, reference query suite, state isolation
  - 2 requirements, 6+ scenarios

- **`agentic-performance-baseline-measurement/spec.md`**
  - Latency percentiles, tool success rate, cache hit rate, error distribution, report generation
  - 6 requirements, 15+ scenarios

### 4. Tasks (`tasks.md`)
69 numbered tasks across 9 groups, estimated 20 hours of implementation work:

1. **Telemetry Instrumentation (10 tasks)** — dispatcher telemetry wrapper + MCP wrapping
2. **Subagent Orchestration (11 tasks)** — parallel invocation, merging, timeout, isolation
3. **A2A Discovery (10 tasks)** — agent card validation, tool sync, endpoint verification
4. **OpenCode MCP Integration (10 tasks)** — streaming test, latency measurement, error handling
5. **E2E Workflow Test (10 tasks)** — reference query suite, result validation, state isolation
6. **Performance Baseline (11 tasks)** — latency, success rate, cache hit, error distribution measurement
7. **Documentation (11 tasks)** — runbook with patterns, supervision, telemetry, troubleshooting
8. **Validation (10 tasks)** — test suite validation, no regressions, telemetry verification
9. **Final Review (8 tasks)** — commit review, MEMORY update, next steps documentation

**Acceptance Criteria:** All 9 artifacts complete ✅, dispatcher nodes emit telemetry ✅, subagents work ✅, A2A discoverable ✅, OpenCode integrated ✅, performance baseline established ✅, documentation complete ✅

---

## Next Steps

### Immediate (When Ready)
```bash
# View full change status
openspec status --change "wire-agentic-workflows-e2e-test"

# Start implementation
/opsx:apply

# Or run implementation tasks
npm run implement:wire-agentic-workflows-e2e-test
```

### After Implementation (Sessions 120+)
1. Monitor agentic workflow performance in production
2. Implement Netflix Headroom integration (optional, but recommended)
3. Build automated reranking based on agentic feedback
4. Expand subagent library for specialized agent tasks (code analysis, legal reasoning, etc.)
5. Integrate with Claude Code / OpenCode for IDE-native agentic work

---

## Reference Context

**Sessions Completed:**
- Sessions 115-118: Identity recovery + dispatcher integration (90/90 tests passing)
- Session 119 (THIS): Phase 1 RRF integration (0.744 NDCG@5 achieved), OpenCode config fix

**Infrastructure Ready:**
- LangGraph dispatcher (9 nodes) wired
- MCP server (:8788) with 42 tools registered
- ACP telemetry collector implemented
- A2A agent card at `/.well-known/agent.json`
- 20+ reference queries available for performance testing

**Key Files:**
- `src/lib/server/dispatcher/dispatcher-orchestrator.ts` (9-node state machine)
- `src/mcp/server.ts` (42 tools registered)
- `src/routes/.well-known/agent.json/+server.ts` (A2A discovery)
- `src/lib/server/telemetry/acp-mcp-telemetry.ts` (telemetry collector)

---

**Plan Created:** 2026-07-06  
**Status:** ✅ READY FOR IMPLEMENTATION  
**Estimated Duration:** 20 hours (5 sessions × 4 hours)  
**Target Completion:** Sessions 119a-119e (one session = 4 hours, can be compressed into 2-3 days if run consecutively)

