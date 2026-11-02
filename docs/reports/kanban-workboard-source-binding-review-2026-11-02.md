# Kanban Workboard Source-Binding Review — 2026-11-02

## Result

The checked-in workboard projection was stale relative to its OpenSpec source files. A baseline-aware candidate was reviewed, then published to the shared JSON and Markdown projections. Existing fixed-name backups were preserved under dated names before the builder ran.

| Artifact | Generated | Task rows | Source files | Source-binding result |
| --- | --- | ---: | ---: | --- |
| Previous shared workboard | 2026-10-26T18:40:22.459Z | 13,345 | 107 | 9,879 current; 3,466 stale digest bindings |
| Current shared `docs/reports/openspec-workboard-v1.json` | 2026-11-02T02:19:52.274Z | 13,619 | 111 | 13,619 current; 0 stale or malformed references |

The audit validates that each task row's source path is under `openspec/changes/<change>/tasks.md`, the file digest matches `sourceFileHashes`, and the specified line contains the same checklist task text. It rejects path traversal and reports stale/missing references rather than treating them as current.

## Evidence

- Candidate workboard SHA-256: `sha256:7df76e2c0120c431c2b78c546be83075a78215ff3abd93a8d119e5984634ee2c`.
- Candidate source-binding receipt: `.tmp/atlas/workboard-source-binding-audit-final-20261102.json`; SHA-256 `c93b38885ea2c2b5f8011eb84d163f20ff38e94c2cb8659c59fbe97251f20f8e`.
- Candidate audit verdict: `VERIFIED`; 13,619 `SOURCE_REFERENCE_CURRENT`; `writesPerformed: false`; `canonicalAuthority: false`.
- Compared with the shared board, the candidate has 277 added stable keys, 3 removed stable keys, and 392 rows with changed text/source/line/state.
- Final published workboard SHA-256: `sha256:c52b7b02aa6cf4684f08330dc1416a41cb5e62eaf12405c5b7fd21f990283fff`.
- Final published source-binding receipt: `.tmp/atlas/workboard-source-binding-audit-final-ledger-20261102.json`; SHA-256 `14f931a729a94e005ac4be8c74050383ead79bcae6deda315b4d847353723735`; verdict `VERIFIED` with all 13,619 references current.
- The initial publication used the old shared JSON as the completion-tracking baseline. After OpenSpec task 8.4 was checked with a passing strict validation, the second refresh recorded exactly 1 newly completed task, 0 reopened, 0 vanished, and 0 added-already-done; total is 8,014 completed of 13,619 (58.844%). ETA remains `UNKNOWN` because no receipt-linked throughput exists.
- The 392 matched-row changes are source line/reference shifts, not task text or state changes. The 277 added keys come from current OpenSpec task rows; three prior keys were replaced by updated source text in `visual-element-rendering` and `parent-atlas-okf-knowledge-layers`.
- Previous ignored backups were preserved as `docs/reports/openspec-workboard-v1.pre-refresh-20261102.json.bak` and `docs/OPENSPEC-WORKBOARD.pre-refresh-20261102.md.bak`; the pre-second-refresh outputs were preserved as `docs/reports/openspec-workboard-v1.pre-ledger-refresh-20261102.json.bak` and `docs/OPENSPEC-WORKBOARD.pre-ledger-refresh-20261102.md.bak`. The builder's fixed-name `.bak` files now contain the outputs immediately preceding the second refresh. Both shared projections are current; no database or service writes occurred.

## Interpretation and Next Steps

Source-reference freshness is verified for the published projection. This does not establish canonical feature IDs, packet identity, taxonomy admission, or authorization for a Kanban importer canary. Task 10.4 remains open.

The remaining review gate is canonical feature/packet identity and any future Kanban importer canary. No migration, datastore write, or service action was performed.

## Reproduction

```powershell
node scripts/atlas/build-openspec-workboard-v1.mjs
node scripts/atlas/audit-workboard-source-bindings-readonly-v1.mjs --workboard=docs/reports/openspec-workboard-v1.json --receipt=.tmp/atlas/workboard-source-binding-audit-published-20261102.json
node --test scripts/atlas/lib/workboard-source-binding-audit-v1.test.mjs
```
