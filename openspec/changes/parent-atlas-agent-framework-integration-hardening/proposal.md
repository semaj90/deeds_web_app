## Why

Parent Atlas has multiple agent and workflow integrations, but their ownership, availability, authorization, and evidence status are spread across code, MCP registration, OpenSpec, OpenWiki, and task-board projections. Operators need one production-hardening path that reuses those owners, makes unsupported or unverified integrations explicit, and prevents framework-specific workflows or UI state from becoming canonical Atlas authority.

## What Changes

- Define a framework-neutral integration registry/readiness contract for ACP, A2A, MCP, LangChain/LangGraph, Deep Agents, Mastra, Hermes, OpenWiki, and optional Paperclip surfaces.
- Align Firecrawl acquisition, BeautifulSoup parsing, Hugging Face/Ollama model distribution and execution, and EmbeddingGemma 2 model/licensing provenance with existing ingestion and embedding owners.
- Specify how existing tool schemas, allowlists, authorization checks, execution receipts, and canonical retrieval/context contracts are reused across adapters.
- Add a Parent Atlas Studio integration-readiness view backed by read-only, evidence-qualified status; distinguish configured, discovered, contract-tested, live-verified, degraded, and unavailable.
- Align integration concepts and links across the Master TOC, agent rules TOC, OpenWiki, MCP tool discovery, and Kanban/task-board projections without treating documentation keywords as permissions.
- Add production proof gates for protocol interoperability, tool authorization, replay, health/degradation, and operator UI parity. No new framework dependency or canonical registry store is presumed.

## Capabilities

### New Capabilities
- `atlas-studio-integration-readiness`: Read-only operator view of integration ownership, status, evidence, blockers, and next proof gates.
- `atlas-integration-provenance`: Versioned source/model/provider/license provenance for external acquisition, parsing, model distribution, and embedding execution.

### Modified Capabilities
- `parent-atlas-agentic-runtime`: Tighten framework/protocol adapter and tool-authorization boundaries for existing ACP, A2A, MCP, LangGraph, Mastra, Hermes, and optional Paperclip integration points.
- `atlas-retrieval-reconciliation`: Require shared canonical identity, revision, and evidence receipts when agent frameworks consume retrieval or context results; prohibit duplicate fusion votes.
- `atlas-kanban-materializer`: Link integration readiness to evidence-backed task state without allowing UI, OpenWiki, or manual task text to override canonical evidence.

## Impact

Existing ACP/A2A routes, MCP tool registry, SearchRuntime, ACE/ContextManifest, workflow adapters, OpenWiki evidence index, Kanban materializer, and Parent Atlas Studio. Expected documentation includes TOC/rules cross-links. No database schema, new runtime dependency, agent dispatch, cache hydration, or production mutation is included in this proposal unless a later task has an explicit proof and authorization gate.
