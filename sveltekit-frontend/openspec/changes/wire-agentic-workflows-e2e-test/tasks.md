## 1. Telemetry Instrumentation in Dispatcher (Session 119a)

- [ ] 1.1 Create `src/lib/server/telemetry/dispatcher-telemetry-wrapper.ts` with telemetry emission logic
- [ ] 1.2 Add `emitDispatcherTelemetry()` function: Redis write (sync) + Postgres write (deferred via queueMicrotask)
- [ ] 1.3 Wrap all 9 dispatcher node handlers in telemetry collector (identity, cache, topology, etc.)
- [ ] 1.4 Capture routing decision metadata: decision type, confidence, alternatives, selected path
- [ ] 1.5 Capture gRPC call traces: service, method, duration, status, error_class
- [ ] 1.6 Wrap MCP tool implementations with telemetry (name, params_hash, duration, success/failure)
- [ ] 1.7 Verify telemetry flows to Redis keys: `telemetry:dispatcher:{node_id}:{timestamp}`
- [ ] 1.8 Verify Postgres writes are deferred and non-blocking (<1ms node overhead)
- [ ] 1.9 Add unit tests for telemetry wrapper: async emission, Redis write, Postgres eventual consistency
- [ ] 1.10 Commit: `feat(telemetry): instrument dispatcher nodes with routing and tool call telemetry`

## 2. Subagent Orchestration Implementation (Session 119b)

- [ ] 2.1 Create `src/lib/server/langgraph/subagent-orchestrator.ts` with parent-child invocation logic
- [ ] 2.2 Implement `invokeSubagents(subagentConfigs, sharedContext)` function
- [ ] 2.3 Use `Promise.allSettled()` to invoke subagents in parallel (no sequential execution)
- [ ] 2.4 Pass shared `NodeContext` (Postgres, Redis, gRPC clients) to each subagent
- [ ] 2.5 Implement result merging: deduplicate by hit ID, sum scores, take metadata from highest confidence
- [ ] 2.6 Add timeout protection: 30s max per subagent invocation
- [ ] 2.7 Implement partial failure handling: if ≥1 succeeds, composite result is valid
- [ ] 2.8 Verify state isolation: concurrent subagent queries don't corrupt or mix data
- [ ] 2.9 Add unit tests: parallel invocation, result merging, timeout, partial failure
- [ ] 2.10 Add integration test: dispatcher parent node invokes 2 sample subagents, verifies merge
- [ ] 2.11 Commit: `feat(langgraph): implement subagent orchestration with parallel invocation and merging`

## 3. A2A Agent Discovery Implementation (Session 119c)

- [ ] 3.1 Verify `src/routes/.well-known/agent.json/+server.ts` exists and returns valid JSON
- [ ] 3.2 Ensure response includes: name, tools array, capabilities array, endpoint URL
- [ ] 3.3 Populate tools array from MCP server registration (auto-sync or manual refresh on startup)
- [ ] 3.4 Populate capabilities array from dispatcher nodes (9+ capability names)
- [ ] 3.5 Create `tests/a2a-discovery.spec.ts`: GET `/.well-known/agent.json`, validate schema
- [ ] 3.6 Add test: validate tools list matches MCP server tool count (set equality)
- [ ] 3.7 Add test: validate endpoint is reachable (HTTP POST to endpoint works)
- [ ] 3.8 Document A2A agent metadata in `docs/agentic-workflow-patterns.md`
- [ ] 3.9 Add npm script: `npm run test:a2a-discovery`
- [ ] 3.10 Commit: `feat(a2a): implement agent discovery endpoint validation`

## 4. OpenCode MCP Integration Test (Session 119c)

- [ ] 4.1 Create `tests/opencode-mcp-integration.spec.ts` test harness
- [ ] 4.2 Implement test: simulate OpenCode client, send HTTP POST to MCP server (:8788)
- [ ] 4.3 Implement streaming response capture: listen for SSE messages, collect full response
- [ ] 4.4 Verify tool implementation is invoked (reads Postgres, validates, writes, invalidates, emits)
- [ ] 4.5 Add test: measure MCP overhead vs tool execution latency
- [ ] 4.6 Verify telemetry is recorded for tool call (with source: 'opencode')
- [ ] 4.7 Test error handling: tool failure returns error response via SSE
- [ ] 4.8 Add test: invoke 5+ different tools, verify all succeed
- [ ] 4.9 Add npm script: `npm run test:opencode-mcp-integration`
- [ ] 4.10 Commit: `feat(opencode): add MCP integration test with streaming response validation`

## 5. End-to-End Workflow Test Harness (Session 119d)

- [ ] 5.1 Create `tests/agentic-workflows-e2e.spec.ts` test harness
- [ ] 5.2 Implement workflow execution: query → dispatcher → routing → subagents → merge → response
- [ ] 5.3 Load 20+ reference queries from benchmark data (Sessions 115-118)
- [ ] 5.4 Execute each query through full dispatcher pipeline
- [ ] 5.5 Validate results: packet metadata, RRF ranking, score range [0,1]
- [ ] 5.6 Implement test isolation: separate test database, clean state between queries
- [ ] 5.7 Handle partial failures: one subagent fails, others provide partial data
- [ ] 5.8 Verify all queries complete successfully (PASS threshold: 100%)
- [ ] 5.9 Add npm script: `npm run test:agentic-e2e:reference-queries`
- [ ] 5.10 Commit: `feat(e2e): implement end-to-end agentic workflow test with 20+ reference queries`

## 6. Performance Baseline Measurement (Session 119d)

- [ ] 6.1 Create `src/lib/server/telemetry/agentic-baseline-collector.ts` performance measurement utility
- [ ] 6.2 Implement latency percentile calculation: p50, p95, p99 from Redis sorted sets
- [ ] 6.3 Implement tool success rate measurement: (successes / total) * 100
- [ ] 6.4 Implement cache hit rate measurement: L1 Bifrost and L2 Postgres
- [ ] 6.5 Implement error classification and distribution tracking (by error_class)
- [ ] 6.6 Create report generator: JSON output with all metrics
- [ ] 6.7 Add thresholds validation: p99 latency < 100ms, error rate < 5%, cache hit rate > 50%
- [ ] 6.8 Generate performance report to: `docs/reports/agentic-perf-baseline-{timestamp}.json`
- [ ] 6.9 Create `tests/agentic-performance-baseline.spec.ts` test that runs measurement
- [ ] 6.10 Add npm script: `npm run test:agentic-e2e:perf-baseline`
- [ ] 6.11 Commit: `feat(perf): implement agentic workflow performance baseline measurement`

## 7. Documentation and Runbook (Session 119e)

- [ ] 7.1 Create `docs/agentic-workflow-patterns.md` runbook (500+ lines)
- [ ] 7.2 Document subagent orchestration pattern: when to use, parent-child design, result merging
- [ ] 7.3 Document supervision strategies: error handling, partial failures, timeout protection
- [ ] 7.4 Document telemetry interpretation: how to read latency reports, identify bottlenecks
- [ ] 7.5 Document A2A discovery: how to update agent metadata, tool list sync
- [ ] 7.6 Document OpenCode integration: how to invoke tools, debug streaming issues
- [ ] 7.7 Document performance baseline: how to run, interpret results, identify regressions
- [ ] 7.8 Include troubleshooting section: common errors, recovery steps
- [ ] 7.9 Include examples: sample subagent code, sample telemetry output, sample performance report
- [ ] 7.10 Document future enhancements (Netflix Headroom, async telemetry batching, metric aggregation)
- [ ] 7.11 Commit: `docs(agentic): add comprehensive workflow patterns and runbook`

## 8. Validation and Integration (Session 119e)

- [ ] 8.1 Run all new tests: `npm run test:a2a-discovery && npm run test:opencode-mcp-integration && npm run test:agentic-e2e:reference-queries && npm run test:agentic-e2e:perf-baseline`
- [ ] 8.2 Verify no regressions: run full test suite `npm run test` (must not introduce new failures)
- [ ] 8.3 Type check: `npx svelte-check --threshold error` (0 new errors)
- [ ] 8.4 Verify telemetry flows: manually query Redis for `telemetry:dispatcher:*` keys (should have data)
- [ ] 8.5 Verify Postgres telemetry audit: check `acp_telemetry` table for records
- [ ] 8.6 Verify A2A endpoint: curl `http://localhost:5173/.well-known/agent.json` (valid JSON, tools array populated)
- [ ] 8.7 Verify OpenCode MCP invocation: manually invoke tool from OpenCode, check streaming response
- [ ] 8.8 Review performance baseline report: validate metrics (latency, success rate, cache hit rate)
- [ ] 8.9 Document any deviations or issues found during validation
- [ ] 8.10 Commit: `test(agentic): validation of all e2e tests and telemetry pipeline`

## 9. Final Review and Handoff (Session 119e)

- [ ] 9.1 Review all commits in this change: verify message quality, scope, clarity
- [ ] 9.2 Update MEMORY.md with session summary (agentic workflow testing complete, performance baseline achieved)
- [ ] 9.3 Create change status: `openspec status --change "wire-agentic-workflows-e2e-test"`
- [ ] 9.4 Verify change is marked complete (all artifacts done, all tasks checked)
- [ ] 9.5 Document next steps: future enhancements (Netflix Headroom, automated reranking, Claude agent loops)
- [ ] 9.6 Final commit: `docs(agentic): session 119 complete - agentic workflow testing e2e`
- [ ] 9.7 Tag release or create GitHub issue for tracking agentic workflows (open issues for future work)

## Acceptance Criteria

- ✅ All 9 dispatcher nodes emit telemetry (routing decisions, gRPC traces, tool calls)
- ✅ Subagent orchestration works: parent invokes 2+ children in parallel, merges results deterministically
- ✅ A2A discovery endpoint returns valid metadata, tools list matches MCP server
- ✅ OpenCode MCP integration test passes: tool invocation → streaming response → telemetry recorded
- ✅ End-to-end workflow test: 20+ reference queries execute successfully through dispatcher
- ✅ Performance baseline established: latency (p50/p95/p99), tool success rate, cache hit rate, error distribution
- ✅ Documentation complete: runbook with patterns, supervision strategies, telemetry interpretation, troubleshooting
- ✅ No regressions: full test suite passes, no new TypeScript errors
- ✅ All code committed with clear messages and docstrings

