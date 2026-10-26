# Parent Atlas progress — 2026-10-23

Index of the work from this session, with its status and the files that carry it. Source of truth for each item is the OpenSpec ledger named in its row; this page only points at them.

## Status

| Area | Status | Evidence |
|---|---|---|
| NS-7 source-class split | Classification only; committed | `098abc79a1`; `docs/reports/source-class-split-v1.json` |
| Git-index path identity | Decided: index spelling; applied to scratch set only | ledger `canonical-directory-ingestion-fabric/tasks.md` |
| Domain vocabulary owner | Decided: `atlas_domain_ontology` (decision recorded, no migration) | `.okf/domains/atlas-domain-taxonomy.yaml`, `.okf/manifest.yaml` |
| Tournament admission (WSR-09a, WSR-13) | Bindings enforced; live receipt replaced | `workspace-snapshot-runtime/tasks.md`; `docs/reports/workspace-revision-tournament-admission-v1.json` |
| Current-workspace currency | **Not current**: 7 sources changed since the admitted snapshot | `scripts/atlas/lib/current-workspace-frame-selector-v1.mjs` |
| Canonical writers | Blocked by the write guard (no write scope granted) | `scripts/atlas/lib/admission-write-guard-v1.mjs` |
| Frame flags | Corrected: canonical/promotion require live currency | `current-workspace-frame-selector-v1.state.spec.mjs` |
| Gate2 tasks 2.1–2.3 | Checked off with evidence | `gate2-chunk-lineage-convergence/tasks.md` |

## Relevant files

**Admission chain (scratch-first, receipt-only)**
- `scripts/atlas/capture-scratch-workspace-snapshot-v1.mts` — stable capture plus byte readback
- `scripts/atlas/audit-canonical-source-inventory-hygiene-v1.mts` — hygiene stage
- `scripts/atlas/plan-graphify-source-selection-from-snapshot-v1.mts` — source-selection plan
- `scripts/atlas/derive-workspace-revision-from-sealed-multi-repo-snapshot-v1.mts` — derivation
- `scripts/atlas/audit-workspace-revision-tournament-source-authority-v1.mts` — preflight (records `manifestSha256`)
- `scripts/atlas/admit-workspace-revision-tournament-v1.mts` — gate (requires expected manifest and validation hashes)
- `.tmp/atlas/workspace-snapshot-scratch-v1/probe/chain-v2.sh` — fail-closed runner for the whole chain (scratch)

**Write guard and canonical writers**
- `scripts/atlas/lib/admission-write-guard-v1.mjs` (+ `.test.mjs`, 7 tests)
- `scripts/atlas/apply-admitted-workspace-source-bindings-content-reconciled-v1.mjs`
- `scripts/atlas/apply-file-level-source-refs-content-reconciled-v1.mjs`
- `scripts/atlas/apply-current-execution-workspace-bindings-v1.mjs`

**Frame authority**
- `scripts/atlas/lib/current-workspace-frame-selector-v1.mjs` (+ `.state.spec.mjs`)

**NS-7 source-class split**
- `scripts/atlas/lib/source-class-split-v1.mts` (+ `.test.mts`), `build-source-class-split-v1.mts`, `audit-source-class-split-v1.mts`

**Domain taxonomy tie**
- `.okf/schemas/domain-taxonomy-v1.schema.json`, `.okf/domains/atlas-domain-taxonomy.yaml`, `scripts/atlas/lib/okf-domain-taxonomy-tie.test.mjs`
- `.okf/schemas/tensor-kv-rpc-packet-v1.schema.json` (draft)

**Archives (never deleted)**
- `.tmp/atlas/tournament-admission-archive/` — prior live receipts
- `.tmp/atlas/source-class-split-v1/superseded/` — superseded NS-7 runs and reports

**Ledgers**
- `openspec/changes/parent-atlas-workspace-snapshot-runtime/tasks.md`
- `openspec/changes/parent-atlas-gate2-chunk-lineage-convergence/tasks.md`
- `openspec/changes/parent-atlas-canonical-directory-ingestion-fabric/tasks.md`

## Scope limits (apply to every item above)

- No PostgreSQL writes, no canonical AST or symbol writes, no Graphify execution, no production projection.
- Tournament admission is source authority only. It does not authorize current-workspace graph use or canonical writes.
