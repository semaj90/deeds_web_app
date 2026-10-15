# Parent Atlas OpenSpec Progress Evidence Review — 2026-10-14

## Finding

There is no defensible single “percent complete” for Parent Atlas from the current task projections. The familiar 61.6% value is stale checkbox accounting, not a capability-completion measure. A fresh scratch-only workboard projection reports 7,309 of 11,974 checklist rows checked (61.04%), but its scope is only top-level `openspec/changes/*/tasks.md` files. The evidence-fabric census traverses both root and SvelteKit OpenSpec change trees and includes archived changes; it reports 12,812 task rows across 128 changes (118 active, 10 archived). These denominators are not interchangeable.

## Fresh check-only evidence census

Command: `node scripts/atlas/audit-openspec-evidence-fabric-v1.mjs --check-only`  
Exit: `0`; `outputs: []`; no report artifacts were written.  
Run: `20261015010733427-82610febd68a`  
Workspace revision: `sha256:82610febd68a3a58a1c0e33d858dcc97595d4603b7529d8d30f7668a6969b811`

- Task rows: 12,812 total across 128 changes (118 active, 10 archived); 7,821 checked; 4,991 unchecked (61.06% checkbox ratio).
- Evidence binding: 0 checked rows resolve to `PROVEN`; all 7,821 checked rows remain without qualifying proof under the current census contract.
- Receipt diagnostics: 1,241 indexed artifacts; 137 typed receipts; 261 matched task bindings; 937 orphan/missing-task bindings; 1,147 missing-revision bindings; 52 stale-evidence candidates. These categories overlap and are not additive.
- Identity diagnostics: 7,427 task IDs missing; 398 ambiguous identities; 12,776 duplicate declared-ID groups; 153 duplicate derived keys; 30 unresolved dependency references.
- Result: `DIAGNOSTIC_ONLY_NOT_PROMOTABLE`, `promotionEligible=false`, `ownerConflictAuditCurrent=false`. The 61.06% checkbox ratio is not a capability-completion percentage.

The census is a diagnostic, not proof that evidence is absent from every task; it shows that the current parser/binding/freshness rules cannot promote checked rows as qualifying proof. Do not convert checkbox ratios into feature, service, or production completion claims.

The separate fixed graph/ontology/GPU/ACE proof checklist is `docs/reports/parent-atlas-graph-analysis-proof-gates-v1.json`: 3/9 gates are explicitly proven (33.3% of that scoped checklist), 1 is partial, and 5 are blocked or unproven. This second ratio also is not a portfolio completion score.

## Workboard scope comparison

The existing workboard was generated `2026-10-13T18:13:31.599Z` and reported 7,228/11,729 checked rows (61.625%). Its builder scans only root-level `openspec/changes/<change>/tasks.md`. A fresh build to `.tmp/atlas/openspec-workboard-refresh-20261014.json` reported 7,309/11,974 checked rows (61.041%) across 99 root-level change folders. The workboard generator is a projection based on checkboxes; it does not claim qualifying runtime proof. The evidence census additionally includes nested/frontend and archived change trees, so the 12,812-row count is broader.

## Next proof priority

Repair the proof substrate before refreshing a portfolio completion score: define a versioned task/receipt identity and freshness contract, then test exact task binding, current task revision, source-line evidence, and relevant-versus-unrelated ledger edits. Keep existing receipts non-promotional until independent readback qualifies them. After this gate, refresh the evidence census and calculate progress only for an explicitly scoped set of owner-qualified acceptance gates. Do not apply schema changes, promote graph snapshots, or alter database/cache state as part of this review.

## Validation

- `node scripts/atlas/build-openspec-workboard-v1.mjs .tmp/atlas/openspec-workboard-refresh-20261014.json .tmp/atlas/openspec-workboard-refresh-20261014.md` — exit 0, scratch outputs only.
- `node scripts/atlas/audit-openspec-evidence-fabric-v1.mjs --check-only` — exit 0, no outputs.
- No database, cache, graph, vector, GPU, or service state was changed.
