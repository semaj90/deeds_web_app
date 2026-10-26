## ADDED Requirements

### Requirement: Agent adapters preserve retrieval identity and fusion ownership
Agent-framework integrations SHALL consume retrieval through the existing SearchRuntime and canonical identity/context owners. Candidate results SHALL preserve canonical identity, source/workspace revisions, evidence references, and logical lane. Multiple executors for one logical lane SHALL contribute no more than one fusion vote after existing normalization and deduplication.

#### Scenario: Same semantic lane served by multiple executors
- **WHEN** Qdrant, cuVS, or another executor returns the same canonical candidate for one semantic lane
- **THEN** SearchRuntime SHALL normalize and deduplicate those results as one logical lane before fusion

#### Scenario: Agent adapter receives an unresolved candidate
- **WHEN** a retrieval candidate lacks unambiguous canonical identity or revision-qualified source evidence
- **THEN** the adapter SHALL preserve its degraded/unresolved status and SHALL NOT present it as qualified context

### Requirement: Context injection remains admission-gated across frameworks
LangChain/LangGraph, Deep Agents, Mastra, Hermes, ACP/A2A clients, and MCP handlers SHALL receive only the existing admitted ACE/ContextManifest representation when constructing model context. Raw retrieval hits, framework memory, LUT codes, and OpenWiki text SHALL NOT bypass canonical evidence selection and admission.

#### Scenario: Framework prepares model context
- **WHEN** an adapter assembles context from Atlas retrieval
- **THEN** it SHALL use the admitted ContextManifest contract and retain its source evidence/revision references

#### Scenario: Framework memory contains stale evidence
- **WHEN** a framework memory item does not match the current admitted identity/revision snapshot
- **THEN** it SHALL be excluded or explicitly marked stale before context injection
