## ADDED Requirements

### Requirement: Framework adapters preserve canonical execution contracts
ACP, A2A, MCP, LangChain/LangGraph, Deep Agents, Mastra, Hermes, and other adapters SHALL translate to existing framework-neutral Atlas request, evidence, authorization, and receipt contracts. An adapter SHALL NOT create a competing tool registry, canonical identity, retrieval fusion owner, or task authority. Optional frameworks SHALL remain absent/degraded when no verified owner is installed and registered.

#### Scenario: Same operation through multiple adapters
- **WHEN** the same read-only Atlas operation is called through two supported adapters
- **THEN** both SHALL preserve the same canonical request identity, source revisions, authorization result, and evidence references

#### Scenario: Optional framework has no live owner
- **WHEN** an optional framework is named in documentation but no usable runtime registration exists
- **THEN** it SHALL be reported as not present or unverified and SHALL NOT be invoked or required for startup

### Requirement: Tool discovery is separate from tool authorization
MCP discovery, A2A agent cards, ACP capabilities, OpenWiki pages, TOC keyword aliases, and Studio status SHALL be descriptive discovery surfaces only. Every dispatch SHALL resolve through the existing server-side tool registry, schema validation, caller authorization, capability policy, and bounded execution checks.

#### Scenario: Discovered tool is not authorized
- **WHEN** a client discovers a tool but its caller lacks the required permission
- **THEN** the server SHALL reject the call before invoking the handler

#### Scenario: Documentation mentions an executable capability
- **WHEN** a capability is present in OpenWiki or a TOC but absent from the runtime registry
- **THEN** it SHALL remain undispatchable

### Requirement: Cross-framework execution is traceable and replayable
Cross-framework calls that execute an Atlas operation SHALL preserve a bounded trace/request identifier, adapter and contract revisions, tool identity, authorization outcome, input/output checksums, evidence references, and terminal outcome. Receipts SHALL exclude credentials, hidden reasoning, and raw KV/tensor state.

#### Scenario: Replay a completed read-only run
- **WHEN** an operator replays a completed integration run from its receipt
- **THEN** the run SHALL identify the exact adapter/tool and evidence snapshot, and SHALL NOT depend on an old model KV cache
