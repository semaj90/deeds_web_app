## ADDED Requirements

### Requirement: A2A agent discovery endpoint
The system SHALL expose an agent discovery endpoint at `/.well-known/agent.json` that returns valid A2A agent metadata.

#### Scenario: Retrieve agent metadata
- **WHEN** client sends GET request to `/.well-known/agent.json`
- **THEN** server responds with HTTP 200 and JSON body
- **AND** response includes: `{ name: string, tools: string[], capabilities: string[], endpoint: string }`
- **AND** response is valid JSON (parseable)
- **AND** Content-Type header is `application/json`

#### Scenario: Agent name is correct
- **WHEN** client retrieves agent metadata
- **THEN** response includes `name: 'yorha-legal-ai'` or similar identifier
- **AND** name is human-readable (no special characters except hyphens)

### Requirement: A2A tools list matches MCP registration
The system SHALL ensure the `tools` array in the agent card matches the current MCP tool registry (at :8788).

#### Scenario: Tools array is populated
- **WHEN** client retrieves agent metadata
- **THEN** response includes `tools: ['tool_identity_recover', 'tool_cache_validate', ...]`
- **AND** tools array has ≥ 35 entries (current MCP tool count)
- **AND** each tool name matches MCP tool registry names exactly

#### Scenario: Agent card tools match MCP server
- **WHEN** A2A agent card lists 42 tools and MCP server at :8788 exposes 42 tools
- **THEN** the two lists are identical (set equality)
- **AND** no tools are missing from agent card that exist in MCP
- **AND** no spurious tools are in agent card that don't exist in MCP

### Requirement: A2A capabilities list
The system SHALL include a `capabilities` array describing what the agent can do.

#### Scenario: Capabilities describe agent abilities
- **WHEN** client retrieves agent metadata
- **THEN** response includes `capabilities: ['packet-recovery', 'cache-validation', 'topology-enrichment', ...]`
- **AND** capabilities are human-readable (kebab-case or spaces)
- **AND** capabilities match the agent's actual dispatcher nodes (9+ capabilities)

### Requirement: A2A endpoint URL
The system SHALL include an `endpoint` field pointing to the agent's HTTP entry point.

#### Scenario: Endpoint is provided
- **WHEN** client retrieves agent metadata
- **THEN** response includes `endpoint: 'http://localhost:5173/api/ai/agent'` or similar
- **AND** endpoint is an absolute URL (starts with http:// or https://)
- **AND** endpoint is reachable (client can POST to it)

### Requirement: A2A discovery test harness
The system SHALL provide a test that validates A2A endpoint compliance.

#### Scenario: Validation test passes
- **WHEN** test harness runs `npm run test:a2a-discovery`
- **THEN** test retrieves `/.well-known/agent.json`
- **AND** validates response schema (required fields present, correct types)
- **AND** validates tools list matches MCP server
- **AND** validates endpoint is accessible
- **AND** test reports PASS

#### Scenario: Validation test detects missing tools
- **WHEN** A2A agent card lists 42 tools but MCP server has 50 tools
- **THEN** test detects the mismatch and reports FAIL
- **AND** test output shows which tools are missing from agent card

