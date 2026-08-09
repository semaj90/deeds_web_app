## ADDED Requirements

### Requirement: NLP sidecar capabilities are discoverable through ACP, not only direct HTTP
The system SHALL register a small number of coarse-grained ACP tools (e.g.
`analyze_structural`, `analyze_semantic_card`, `rerank_candidates`) in
`ACPToolRegistry.ts` that wrap the NLP sidecar's pass registry, and SHALL NOT
require agent callers to know the sidecar's raw HTTP contract to use its
capabilities.

#### Scenario: An agent needs structural facts about a file
- **WHEN** an agentic tool-calling loop (Ornith or otherwise) needs
  `AstUnit` facts about a source file
- **THEN** the system SHALL expose this via a registered ACP tool discoverable
  through `GET /api/acp/tools`, and SHALL NOT require the agent to construct
  a raw `POST http://localhost:8095/analyze` request directly

### Requirement: ACP tool registration stays coarse-grained, not one tool per pass
The system SHALL wrap multiple related sidecar passes behind each ACP tool's
`inputSchema` (e.g. a `passes` selector), and SHALL NOT register a separate
ACP tool for every individual pass name in the pass registry.

#### Scenario: A new pass is added to the sidecar's pass registry
- **WHEN** a new pass (e.g. a new rerank tier) is added to
  `PASS_REGISTRY`
- **THEN** the system SHALL make it selectable through an existing coarse
  ACP tool's input schema where appropriate, and SHALL NOT require adding a
  new ACP tool for every new pass by default
