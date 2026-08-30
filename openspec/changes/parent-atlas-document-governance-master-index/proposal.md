# Proposal: Parent Atlas Document Governance Master Index

## Why

Parent Atlas now has multiple overlapping documentation surfaces: root and scoped `CLAUDE.md` instruction files, architecture documents, dated reports, OpenSpec changes, generated receipts, operational TODOs, and historical migration notes. The repo already has useful pieces of supersession and agentic workflow logic, but no single canonical owner answers all of these questions together:

- Which document is current for a topic?
- Which older document is superseded, by what, and why?
- Does an implementation-changing recommendation have an OpenSpec change and `tasks.md`?
- Which workflow produced or modified the document, how much work is complete, and what is the ETA based on actual receipts?
- Is a document safe to archive, or is it still referenced by active instructions/specs?
- Can the Parent Atlas admin surface retrieve this state quickly without reparsing the whole repository in the browser?

Without one governance owner, future agents can read an old `CLAUDE.md`, dated architecture note, or migration report and recreate retired architecture. This is the same duplicate-owner failure mode Parent Atlas already avoids for vector identity, PageRank, and workflow events.

## What Changes

Introduce one canonical document-governance contract and one generated master index.

1. Add `DocumentGovernanceRecordV1` as the machine-readable current-state owner for document status, canonical topic ownership, supersession edges, OpenSpec binding, validation evidence, and archive eligibility.
2. Generate `docs/MASTER-TOC.md` from the registry. The Markdown file is a projection for humans, never a second source of truth.
3. Discover all root/scoped `CLAUDE.md` files and maintain a generated supersession map. Historical/original files remain intact by default; an explicit apply gate is required to edit or archive them.
4. Require implementation-changing consolidation work to bind to an OpenSpec change. `tasks.md` remains the implementation checklist and progress owner.
5. Reuse `WorkflowActionEventV1.progress` (`completedUnits`, `totalUnits`, `fraction`, `etaMs`, `confidence`) for workflow progress instead of inventing a new progress/ETA schema.
6. Extend the existing agentic-run/OpenSpec receipt work rather than creating another workflow receipt owner.
7. Add read-only document-governance data to `/admin/atlas` through SSR and a small Svelte 5/Bits UI panel.
8. Archive only after supersession, OpenSpec, reference, link, smoke, and validation gates pass.

## Existing Pieces Reused

- `scripts/atlas/git-diff-supersedes-reconcile-production.mjs`: useful stale-reference/supersession discovery logic, but it currently owns packet/cache reconciliation and must not become the document-registry authority.
- `WorkflowActionEventV1`: canonical workflow event owner; already includes structured progress/ETA/confidence.
- `openspec/changes/parent-atlas-agentic-run-receipt-binding/`: existing change for binding agentic work to OpenSpec; reuse and finish rather than defining another receipt schema.
- OpenSpec spec-driven lifecycle: proposal -> specs/design -> tasks -> apply -> archive.
- `/admin/atlas`: already SSR-backed, uses Svelte 5 runes and Bits UI, and is the correct operator surface.
- Tang-inspired low-rank shortlist: already recorded under `parent-atlas-memory-architecture-freeze` and has an `EXECUTED_UNPROVEN` receipt; document governance must surface it as an experimental challenger, not canonical architecture.

## Non-goals

- Do not delete historical documents automatically.
- Do not rewrite every `CLAUDE.md` in the first apply.
- Do not make LLM-extracted claims canonical without deterministic/source-backed validation.
- Do not make `docs/MASTER-TOC.md` hand-editable state.
- Do not create a second OpenSpec progress model or workflow-event schema.
- Do not promote Tang-inspired sampling, archived 384-vector guidance, or other experimental material merely because it appears in the master index.

## Success Criteria

A future agent can start from one generated master index/API response and determine the current canonical document for a topic, its superseded predecessors, the active OpenSpec change/tasks, validation state, workflow progress, and archive status without guessing from filenames or dates.
