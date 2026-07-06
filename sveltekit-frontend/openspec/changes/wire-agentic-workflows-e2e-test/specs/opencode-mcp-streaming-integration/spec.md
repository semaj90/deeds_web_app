## ADDED Requirements

### Requirement: OpenCode MCP tool invocation
The system SHALL allow OpenCode (IDE) to invoke MCP tools registered at `:8788` and receive streaming responses via Server-Sent Events (SSE).

#### Scenario: Invoke tool from OpenCode
- **WHEN** user types `/tool_identity_recover` in OpenCode and provides params
- **THEN** OpenCode sends tool invocation request to MCP server at `:8788`
- **AND** MCP server routes to tool implementation
- **AND** tool implementation executes (reads Postgres, validates Zod, writes Postgres, invalidates Redis, emits event)
- **AND** tool returns result to MCP server
- **AND** result is streamed back to OpenCode via SSE

#### Scenario: Streaming response received incrementally
- **WHEN** tool execution produces multi-step output (e.g., status updates: "querying...", "validating...", "writing...")
- **THEN** OpenCode receives SSE stream with incremental updates
- **AND** updates are displayed in real-time in the IDE
- **AND** final result is complete and valid

#### Scenario: Error handling in MCP tool
- **WHEN** tool invocation fails (e.g., packet not found, validation error)
- **THEN** MCP server sends error response via SSE
- **AND** error includes: `{ error: 'packet_not_found', message: '...', code: 'E_NOT_FOUND' }`
- **AND** OpenCode displays error message to user

### Requirement: Telemetry recorded for OpenCode tool calls
The system SHALL emit telemetry whenever a tool is invoked from OpenCode, capturing invocation source and telemetry details.

#### Scenario: Tool call telemetry includes OpenCode source
- **WHEN** user invokes tool from OpenCode
- **THEN** telemetry includes: `{ source: 'opencode', tool: 'tool_identity_recover', timestamp, duration_ms, success }`
- **AND** telemetry is emitted to Redis + Postgres (same as dispatcher node telemetry)
- **AND** telemetry is available for performance baseline analysis

#### Scenario: MCP server latency captured
- **WHEN** tool invocation takes 150ms (includes MCP overhead + tool execution)
- **THEN** telemetry includes total latency and breakdown: `{ mcp_overhead_ms: 10, tool_execution_ms: 140 }`
- **AND** breakdown helps identify bottlenecks (MCP vs. tool)

### Requirement: OpenCode MCP integration test
The system SHALL provide a test that validates OpenCode ↔ MCP ↔ dispatcher pipeline.

#### Scenario: End-to-end OpenCode MCP test
- **WHEN** test harness runs `npm run test:opencode-mcp-integration`
- **THEN** test simulates OpenCode tool invocation (HTTP POST to MCP server)
- **AND** captures streaming response via SSE
- **AND** validates response is well-formed and complete
- **AND** validates telemetry was recorded
- **AND** test reports PASS

#### Scenario: Test measures OpenCode MCP latency
- **WHEN** test invokes 10 tools from simulated OpenCode client
- **THEN** test measures latency for each (p50/p95/p99 across 10 samples)
- **AND** reports latency breakdown: MCP overhead vs. tool execution
- **AND** verifies latency is acceptable (<500ms p99)

