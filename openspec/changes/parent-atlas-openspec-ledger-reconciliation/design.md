# Design: OpenSpec Ledger Reconciliation

## Authority and flow

Each OpenSpec change's `tasks.md` remains the authority for its implementation tasks and state. Existing source artifacts, tests, runtime readbacks, and revision-qualified receipts establish evidence for a task; a checkbox, TOC, workboard, dated summary, or aggregate count does not establish that evidence by itself.

The reconciliation flow is:

```text
discover active task ledgers
  -> classify paths and checkbox syntax
  -> record content checksum and exact counts
  -> map claims to owning change and acceptance evidence
  -> compare claims with current evidence and time/revision scope
  -> propose narrow edits in the owning ledger
  -> validate the OpenSpec change and source-of-truth ledger
  -> rebuild derived workboards/TOC only through their existing owners
```

## Census contract

The census must be deterministic for a fixed repository tree and report the repository revision, included roots, archive/exclusion policy, each path and content digest, checkbox totals, malformed/unrecognized checkbox-like lines, and aggregate totals. Root and nested OpenSpec trees must be enumerated without counting archived changes or duplicate projections. Any concurrent ledger change invalidates the receipt and requires a fresh census.

Counts are descriptive only. The process must not infer semantic duplicates from similar prose, merge owners, or silently normalize task states. A task record should be treated as a claim with owner, acceptance condition, evidence reference, evidence date/revision, and status; missing fields are gaps to report, not defaults to invent.

## 384 retirement reconciliation

Start with `openspec/changes/parent-atlas-retire-384-lane/tasks.md` and `sveltekit-frontend/openspec/changes/parent-atlas-384-representation-retirement/tasks.md`. Cross-reference related representation, retrieval, model-authority, and lineage changes only when their tasks directly own a dependency. Classify each statement as `SOURCE_IMPLEMENTED`, `FIXTURE_TESTED`, `LIVE_READBACK`, `REVISION_QUALIFIED`, `PROMOTION_PROVEN`, `PARTIAL`, or `NOT_PROVEN`; these labels describe evidence grade and do not replace task checkboxes.

Historical 384 data and disabled writers remain distinct from active production reachability. A bounded guard test is evidence for the covered roots and patterns only. Per-row producer/model provenance, dynamic SQL/ORM, external callers, runtime processes, and source-revision admission remain separate proof requirements. Do not remove historical data or infer that 384 values are interchangeable with `semantic_768` or latent vectors.

## Edit and safety policy

The census and proposed reconciliation are read-only. Ledger edits are limited to the owning `tasks.md`, preserve historical evidence, explain superseded claims, and leave unresolved checkboxes open. The procedure must not write to canonical stores or modify generated projections. A data/store operation requires a separate owner-specific authorization and acceptance contract.

## Validation

- Re-run the census twice on an unchanged tree and compare canonical receipt checksums.
- Test nested/root discovery, archived exclusion, malformed checkbox syntax, partial states, filename and content drift, and concurrent edits.
- Run strict OpenSpec validation for this change and any directly edited owner change.
- Rebuild the existing document-governance projection in check mode only after source ledgers are stable.

