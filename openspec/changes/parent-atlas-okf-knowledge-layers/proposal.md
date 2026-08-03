## Why

The repo has Parent Atlas (canonical evidence/lineage), OpenSpec (this
tracking format), and now proposed OKF (portable knowledge bundles),
OpenWiki (doc synthesis), and Deep Agents/LangGraph (agent runtime) all
converging on the same problem: recording facts about the codebase. Left
unbounded, each becomes another source of truth that drifts from Postgres
— exactly the failure pattern already documented in this repo for Redis
centroid keys (8 incompatible schemes, `session-159-followup-tasks.md`
Phase 11) and MCP tool status vocabulary
(`parent-atlas-runtime-ownership-precall`). This proposal fixes the
layering *before* any of OKF/OpenWiki/Deep Agents is installed or wired.

## Architecture — one owner per layer

| Layer | Owner | Purpose |
|---|---|---|
| Canonical identity & proof | PostgreSQL 18 | Packets, revisions, sources, symbols, evidence, workflow runs |
| Knowledge interchange | OKF bundle (Markdown + YAML frontmatter) | Human-reviewable domain concepts, decisions, gaps, playbooks |
| Documentation synthesis | OpenWiki | Builds/refreshes OKF pages from grounded Parent Atlas evidence — **read-only against canonical tables** |
| Agent runtime | Deep Agents / LangGraph | Plans, delegates, checkpoints, requests approval |
| Workflow definitions | OKF extensions + OpenSpec | Constraints, required evidence gates, outputs |
| Issue tracking | Parent Atlas issue ledger (Postgres) → Kanban UI | Missing library, mock, stale projection, unproven integration |
| Recommendations | Parent Atlas recommendation ledger | Proposed action backed by evidence |
| Execution | Mastra *or* LangGraph, never both per workflow | Deterministic DAG / agent steps |
| Observability | OTel + Langfuse | Infra spans + LLM/agent traces |

**Hard rule**: OpenWiki never writes directly into canonical packet, symbol, graph, vector, or clustering tables. It reads Parent Atlas evidence and writes only its own generated OKF pages.

## Known repository gaps this knowledge layer must report honestly

Per the standing repo audit, these are real absences, not to be smoothed over by confident-sounding generated docs:

- `atlas_packets.domain_class` exists; no domain-prediction **lineage** table (classifier id/revision/confidence) exists.
- `concept_records` exists; no canonical **concept edge ledger** exists.
- Representation records are fragmented across multiple tables/storage types.
- `atlas_topology_index` is live only outside Drizzle; `cluster_run_id` and `som_run_id` are both missing.
- `graphify_files` / `graphify_symbols` / `graphify_edges` are design candidates, not implemented canonical tables.

OKF concept status vocabulary for all of the above: `PROVEN | PARTIAL_PROVEN | NOT_PROVEN | CONTRADICTED | STALE | MOCK | STUB | MISSING | BLOCKED`.

## What Changes (first bounded slice only — `PARENT_ATLAS_KNOWLEDGE_GAP_AUDIT_V1`)

Everything else in the full proposal (concept/hyperedge modeling, synthesis-mapping ledger, recommendation engine, Kanban schema, full gap-detector matrix, OpenWiki install) is **deferred** — do not start it until this slice passes review.

1. Validate the existing `.okf/` files against the v0.2 OKF spec (provenance/trust/lifecycle fields) — read-only.
2. Export the 6 known gaps above into OKF concept files (`status: NOT_PROVEN`, evidence-linked to real file/line/table refs, no fabricated claims).
3. Read-only library-integration scanner: for each imported/claimed library, record `declared → resolved → imported → invoked → outputConsumed → outputPersisted` and one status (`WIRED | INSTALLED_UNUSED | IMPORTED_UNPROVEN | MISSING | MOCKED | STUBBED | BROKEN`).
4. Static + AST-context mock/stub candidate detector (no LLM-only verdicts — model may only *summarize* after static+runtime checks).
5. `atlas_work_items` Postgres schema — design + a repository-only fixture (no live table yet).
6. One Markdown + JSON audit report combining 1–4.
7. One Kanban issue per evidence-backed gap, one recommendation per issue.
8. OpenWiki used only to synthesize a single review page from the above — install and configure it with its generated-wiki directory kept separate from hand-authored OKF docs (`docs/okf/parent-atlas/` canonical vs. an `openwiki-generated/` directory). Do not let it scan secrets, `.env`, model binaries, raw Qdrant vectors, or unbounded logs.

Deep Agents integration is explicitly **out of scope** until this deterministic pipeline passes.

## Status dashboard (starting point — to be updated as work lands)

`OKF_FORMAT_SUPPORT: PARTIAL` · `OKF_V0_2_VALIDATOR: NOT_PROVEN` · `OPENWIKI_INTEGRATION: NOT_INSTALLED_OR_NOT_PROVEN` · `DEEP_AGENTS_INTEGRATION: NOT_PROVEN` · `LANGGRAPH_DURABLE_AUDIT: NOT_PROVEN` · `DOMAIN_CLASS_LINEAGE: NOT_PROVEN` · `CONCEPT_EDGE_LEDGER: NOT_PROVEN` · `REPRESENTATION_OWNERSHIP: FRAGMENTED` · `TOPOLOGY_SCHEMA_OWNERSHIP: FAIL` · `CLUSTER_RUN_LINEAGE: NOT_PROVEN` · `SOM_RUN_LINEAGE: NOT_PROVEN` · `LIBRARY_INTEGRATION_AUDIT: NOT_IMPLEMENTED` · `MOCK_STUB_AUDIT: NOT_IMPLEMENTED` · `RECOMMENDATION_LEDGER: NOT_IMPLEMENTED` · `KANBAN_WORK_ITEM_LEDGER: NOT_IMPLEMENTED` · `OKF_SYNTHESIS_MAPPING: NOT_IMPLEMENTED` · `AGENTIC_GAP_RESOLUTION_E2E: NOT_PROVEN`
