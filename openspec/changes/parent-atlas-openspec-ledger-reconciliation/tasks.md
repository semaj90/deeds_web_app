# Tasks: Parent Atlas OpenSpec Ledger Reconciliation

## 1. Establish the current ledger census

- [ ] 1.1 Locate and reuse the existing OpenSpec/document-governance inventory owner; document root and nested discovery behavior.
- [ ] 1.2 Produce a deterministic read-only census of all non-archived `tasks.md` files, including checksums, exact status counts, malformed lines, exclusions, and repository revision.
- [ ] 1.3 Add fixtures for nested roots, archived changes, partial/malformed checkboxes, duplicate projections, and concurrent content drift.
- [ ] 1.4 Compare the fresh census with historical totals, explicitly superseding stale figures without changing task states.

## 2. Reconcile the 384 representation ledgers

- [ ] 2.1 Build a claim-to-owner map for the root and frontend 384 retirement changes and directly dependent representation/retrieval changes.
- [ ] 2.2 For each claim, record acceptance condition, evidence path, evidence date/revision, evidence grade, and unresolved owner; do not infer completion from checkbox state.
- [ ] 2.3 Reconcile known writer/entrypoint containment against the guard's actual scan roots and test coverage; retain external/dynamic/runtime unknowns.
- [ ] 2.4 Correct stale counts and contradictory statements only in their owning ledgers; preserve historical evidence and keep unproven tasks unchecked.
- [ ] 2.5 Verify no ledger edit authorizes vector deletion, replacement, retraining, Qdrant mutation, or production promotion.

## 3. Validate and publish derived status

- [ ] 3.1 Run strict OpenSpec validation for this change and every directly edited owner change.
- [ ] 3.2 Re-run the census and verify deterministic receipt checksums with no concurrent source drift.
- [ ] 3.3 Run the existing document-governance/master-TOC check; report any projection drift without hand-editing generated output.
- [ ] 3.4 Publish a report distinguishing completed evidence, partial evidence, contradictions, and `NOT_PROVEN` gates.

## Diagnostic baseline (2026-10-12 local / 2026-10-13 UTC)

- The existing `scripts/atlas/audit-openspec-evidence-fabric-v1.mjs` completed read-only under run ID `20261012-ledger-reconciliation-final-v2` after the change files were finalized. Receipt set: `.tmp/atlas/openspec-ledger-reconciliation-final-v2-20261012/`.
- The source receipt records its Git commit and dirty-tree OpenSpec workspace checksum in `census-v1.json`; that checksum is intentionally not duplicated here because this `tasks.md` is itself an input to the checksum. It found 666 source files, 126 changes (116 active, 10 archived), and 12,543 parsed task checkboxes (7,717 checked, 4,826 unchecked). Parser checkbox coverage was 12,543/12,543; census status is `DIAGNOSTIC_ONLY_NOT_PROMOTABLE`.
- The auditor reports 7,717 checked tasks without a matched typed evidence receipt, 396 ambiguous task identities, 50 stale evidence matches, 98 stale owner-conflict candidates, and incomplete dependency resolution. These are evidence-fabric binding results; they do not prove that source evidence is absent from the repository. Keep the old 4,714 / 4,812 open counts historical until a scoped comparison explains the parser/root differences.
- This baseline does not complete tasks 1.1–1.4: root/archive semantics, deterministic receipt canonicalization, duplicate projection handling, and task-level claim verification still require review. No task boxes were changed by the audit.

