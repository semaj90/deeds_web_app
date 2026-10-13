# Proposal: Parent Atlas OpenSpec Ledger Reconciliation

## Why

Parent Atlas work is distributed across many non-archived `tasks.md` files. Checkbox totals and dated summaries drift, repeated tasks can represent different owners or evidence levels, and a checked box alone does not prove current runtime or data-store behavior. The historical 4,714-open-task figure and earlier change-level counts are not a reliable current baseline.

The 384-representation retirement has additional risk: historical fields, writers, compatibility readers, disabled entrypoints, and still-open provenance questions are mixed across root and frontend ledgers. Agents need one repeatable, evidence-backed reconciliation process without replacing each change's own `tasks.md` as the implementation authority.

## What Changes

1. Define a read-only, repository-wide inventory of non-archived OpenSpec task ledgers, with exact file/checksum/count metadata and separately classified checkbox states.
2. Reconcile stale aggregate counts and cross-ledger references against current source files; never derive completion from counts or a generated workboard.
3. Audit the 384 retirement owner ledgers first, mapping each claim to its responsible change, evidence artifact, revision/time scope, and remaining gate.
4. Preserve each owning change's `tasks.md`; update only its own task wording/evidence, and change checkbox state only when the task's stated proof requirement is satisfied.
5. Reuse the existing document-governance registry and master TOC as projections; do not add a competing registry, progress model, or task writer.
6. Keep historical files and receipts. Any archival, deletion, data mutation, model retraining, or projection rebuild remains separately authorized.

## Non-goals

- Do not auto-check tasks, merge similar tasks, or treat checkbox counts as semantic progress.
- Do not claim all 384 writers/callers are contained from a bounded static test.
- Do not promote 384, 768, MRL, or latent representations based on dimension or name alone.
- Do not change PostgreSQL, Qdrant, Valkey, Docker, model weights, or live services.
- Do not hand-edit generated TOCs or workboards.

## Success Criteria

- A reproducible census identifies the current non-archived task files and distinguishes checked, unchecked, partial, malformed, and excluded/archived records.
- Every 384-retirement claim in scope is mapped to an owning ledger and evidence grade, or explicitly marked unresolved.
- Historical totals are labeled superseded when fresh source scans disagree.
- No task is marked complete without its own acceptance evidence; all remaining uncertainty stays visible.

