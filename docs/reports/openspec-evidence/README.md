# OpenSpec Evidence Reports

This directory holds generated, run-scoped OpenSpec evidence. Treat these files as
derived observations, not canonical task state or proof of promotion. The task
ledger remains `openspec/changes/*/tasks.md`; every claim requires its own
revision-bound evidence and independent verification.

## Inventory and disposition

- Snapshot manifest: [`../openspec-evidence-disposition-v1.json`](../openspec-evidence-disposition-v1.json)
- 2026-10-03 review: [`../openspec-evidence-disposition-20261003.md`](../openspec-evidence-disposition-20261003.md)
- Inventory generator: [`../../../scripts/atlas/audit-openspec-report-disposition-v1.mjs`](../../../scripts/atlas/audit-openspec-report-disposition-v1.mjs)

The snapshot inventories all files under this directory and top-level
`docs/reports/openspec-*` files. It records SHA-256, bytes, Git status, limited
source metadata, and an explicit disposition. It does not parse complete report
contents, establish reproducibility, or assess source-content sensitivity.
Those limits are recorded per file; no existing source report is approved for
promotion by the inventory alone.

Raw evidence is preserved at its current location. The date-scoped ignore rules
cover only 2026-10-03 pipeline outputs verified to contain no tracked files;
they do not authorize moving or deleting evidence. Keep future run output out of
commits unless a reviewed, reproducible summary has a separate promotion gate.

## Safe refresh

From the repository root, run:

```powershell
node scripts/atlas/audit-openspec-report-disposition-v1.mjs
```

The generator hashes the complete inventory but reads at most the first 64 KiB
for selected metadata. It writes the manifest only and does not modify source
reports or task ledgers.
