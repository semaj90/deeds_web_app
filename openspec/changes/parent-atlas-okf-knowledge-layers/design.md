# Parent Atlas OKF Knowledge Layers Design

## Goal

Keep canonical evidence, portable knowledge, documentation synthesis, and agent
runtime separated so none of them becomes a competing source of truth.

## Four layers

| Layer | Owner | Responsibility | Not responsible for |
|---|---|---|---|
| Canonical evidence and lineage | Parent Atlas / PostgreSQL | Packets, revisions, sources, symbols, proof, workflow runs, evidence receipts | Documentation synthesis, workflow planning, agent runtime state |
| Knowledge bundles | OKF | Human-reviewable Markdown + YAML bundles for concepts, gaps, decisions, playbooks, provenance, trust, lifecycle | Canonical persistence, vector storage, graph projection, runtime orchestration |
| Documentation synthesis | OpenWiki | Generate and refresh OKF pages from grounded Parent Atlas evidence | Writing canonical tables, inventing facts, bypassing proof gates |
| Agent runtime | Deep Agents / LangGraph | Bounded planning, delegation, checkpoints, approval, workflow steps | Acting as the authority on facts, identities, or persistence |

## Additional Parent Atlas ledgers

Parent Atlas should keep the accountable operational state in its own ledgers:

- Kanban issue ledger: gaps, bugs, blocked work, proof tasks
- Recommendation ledger: proposed actions backed by evidence
- Validation receipts: proof runs, test outcomes, runtime confirmations

These ledgers are still Parent Atlas state, not OKF state.

## Boundary rules

- OpenWiki may read Parent Atlas evidence and write generated OKF pages.
- OpenWiki may not write canonical packets, symbols, graph nodes, vectors, or cluster assignments.
- OKF is an interchange format, not a database schema and not a runtime service.
- Deep Agents and LangGraph may orchestrate workflows, but they may not become canonical stores.
- One workflow should use either Mastra or LangGraph, not both, unless a separate design explicitly proves the split.

## First bounded slice

Use `PARENT_ATLAS_KNOWLEDGE_GAP_AUDIT_V1` to prove the split before any broader rollout:

1. Validate existing `.okf/` files against OKF v0.2.
2. Export the six known gaps as OKF concept files with evidence links.
3. Run a read-only library integration scanner.
4. Detect mock/stub candidates with static plus AST context.
5. Draft `atlas_work_items` schema and a repository-only fixture.
6. Generate one Markdown and one JSON audit report.
7. Produce one Kanban issue and one recommendation per evidence-backed gap.
8. Let OpenWiki synthesize one review page from the grounded outputs.

## Non-goals

- Do not create a new canonical knowledge database.
- Do not let generated OKF pages outrank Parent Atlas evidence.
- Do not wire Deep Agents or LangGraph into canonical writes during this slice.
- Do not let OpenWiki scan secrets, model binaries, raw vectors, or unbounded logs.

