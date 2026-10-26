## Context

The repository already has ACP/A2A/MCP boundaries, a canonical SearchRuntime and ACE/ContextManifest path, LangChain/LangGraph dependencies and workflows, Mastra adapters, OpenWiki evidence indexing, Kanban projections, Firecrawl capture and BeautifulSoup parsing lanes, and EmbeddingGemma/Ollama/Hugging Face artifacts. The existing `parent-atlas-agentic-runtime`, `atlas-retrieval-reconciliation`, and `atlas-kanban-materializer` specs establish authority and optionality. This change composes those owners and adds an operator-facing readiness view; it does not assert that every named integration is installed, registered, healthy, licensed for every use, or production-proven.

## Goals / Non-Goals

**Goals:**
- Make each integration discoverable by its existing owner, protocol, capability, status, evidence receipt, and next proof gate.
- Keep tool invocation schema-validated, allowlisted, authorized, bounded, observable, and replayable across ACP/A2A/MCP and orchestration adapters.
- Show readiness and blockers in Parent Atlas Studio from read-only evidence, with explicit stale/unavailable states.
- Align Master TOC, agent rules, OpenWiki references, and Kanban/task links to the same integration identifiers without granting authority through documentation.
- Keep provider/runtime software licenses separate from model-weight and acquired-content terms; bind each execution to the exact model artifact/version and source provenance.

**Non-Goals:**
- Add a second tool registry, workflow engine, task authority, search index, or canonical evidence store.
- Add LangChain, LangGraph, Deep Agents, Mastra, Hermes, or Paperclip dependencies solely to satisfy this change.
- Infer the license of model weights from Ollama, Hugging Face, Transformers, or another serving/distribution runtime.
- Dispatch agents, execute tools, mutate canonical records, warm caches, or enable framework-specific production paths as part of status rendering.
- Treat a configured endpoint, package dependency, generated OpenWiki page, checklist, or UI badge as live proof.

## Decisions

1. **Use a framework-neutral integration descriptor and existing registries.** Build a read-only composition over current ACP/A2A/MCP registrations, workflow adapters, health checks, and receipts. Do not persist a parallel integration registry. An adapter may be shown as `NOT_PRESENT` when no owner is found.
2. **Separate status from evidence level.** Report `NOT_PRESENT`, `DISCOVERED`, `CONFIGURED`, `CONTRACT_TESTED`, `LIVE_VERIFIED`, `DEGRADED`, or `UNAVAILABLE`, with timestamp/revision/checksum and provenance. Only a matching live receipt can establish `LIVE_VERIFIED`; stale or missing evidence cannot pass.
3. **Keep protocol and framework roles distinct.** ACP is the client/IDE agent protocol, A2A is for independently deployed agents, and MCP is the tool/resource boundary. LangChain/LangGraph, Deep Agents, Mastra, and Hermes are optional orchestration/runtime adapters. Local calls stay local unless deployment isolation requires a protocol boundary.
4. **Keep retrieval and context authority in current owners.** Frameworks call registered tools that delegate to existing SearchRuntime, canonical identity resolution, ACE, and ContextManifest contracts. Search results from multiple executors are normalized and deduplicated by the existing fusion owner. No framework adds its own candidate vote or bypasses ContextManifest admission.
5. **Keep Studio, Paperclip, Kanban, and OpenWiki as projections.** Studio reads status/evidence; Kanban reflects canonical feature/evidence state; Paperclip remains optional; OpenWiki and TOCs provide discovery links. None can authorize a tool, mark a feature verified, or override canonical state.
6. **Degrade safely.** Missing services, integrations, permissions, or stale receipts produce stable-shaped status and actionable proof gates. The dashboard and MCP discovery remain read-only; execution requires separate authorized dispatch.
7. **Record model and source licensing at artifact granularity.** Firecrawl code/service, its SDK, BeautifulSoup, Hugging Face tooling, Ollama runtime, model weights, and fetched websites have separate terms. EmbeddingGemma 2 and the repository's existing EmbeddingGemma 1 (`google/embeddinggemma-300m`) are distinct artifacts with different license metadata; no model substitution is allowed without a new representation revision and parity evaluation.
8. **Separate acquisition from parsing and constrain egress.** The current `fetch_beautifulsoup.py` wrapper calls a Python `urlopen` helper as well as parsing. Keep direct fetch behind an explicit source allowlist, scheme/redirect checks, byte/time ceilings, and source-policy checks; the parser itself should consume already acquired bounded markup. Firecrawl capture remains a distinct provider path.

## Risks / Trade-offs

- [Many existing integrations have overlapping or stale labels] → Audit actual package, registration, endpoint, and consumer owners; classify unknowns as `NOT_PRESENT` or `UNVERIFIED`, not as configured.
- [Readiness aggregation can become a new authority] → Make it a derived view with source receipts and no writes; never let its status promote evidence or authorization.
- [A2A/MCP adapters may duplicate calls or votes] → Require request/trace IDs, logical lane identity, idempotency where relevant, and existing canonical deduplication before fusion.
- [Studio can expose sensitive operational details] → Reuse existing admin authorization and redact credentials, payloads, prompt state, and hidden reasoning.
- [Framework upgrades can break serialization] → Use versioned framework-neutral envelopes and contract tests, with a no-framework local execution baseline.

## Migration Plan

1. Inventory and classify the current owners; publish a baseline receipt without activating integrations.
2. Define the descriptor/readiness schema and adapt one existing MCP and one existing orchestration path in read-only or dry-run mode.
3. Add contract tests for authorization, bounded inputs, identity/revision preservation, replay, degraded output, and duplicate retrieval-vote prevention.
4. Add the Studio readiness view and TOC/agent-rule/OpenWiki/Kanban links.
5. Live-verify integrations individually. Production activation and any state mutation require separate authorization and promotion evidence.

Rollback is removal/disablement of the read-only adapter and Studio panel; existing protocol and canonical retrieval owners remain unchanged.

## Open Questions

- Which exact Hermes runtime/service is intended, and what existing local owner/endpoint exposes it?
- Is Deep Agents already present as a package/runtime, or should it remain a documented optional adapter until an owner is found?
- Which existing evidence receipt format should be composed for per-integration live health and replay proofs?
- Which agent rules TOC is the authoritative source file in this repository, and is it generated?
