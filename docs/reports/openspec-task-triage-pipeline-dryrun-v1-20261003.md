# OpenSpec Task Triage Pipeline Dry Run — 2026-10-03

## Result

Fresh task cards and report manifests were compiled in an isolated scratch directory and composed at the same workspace HEAD. The scratch outputs were read back for retrieval smoke testing and removed afterward.

| Stage | Records | Bytes | Result |
| --- | ---: | ---: | --- |
| TaskCard corpus | 10,455 | 8,330,159 | Same-HEAD source hashes verified; one current receipt |
| Report manifests | 1,263 | 879,795 | One exact task association; zero rejected current receipts/outputs |
| Joined triage corpus | 10,455 tasks + 1,263 reports | 9,210,758 | Under strict 10,000,000-byte limit |

Workspace HEAD: `9b15098c243234751cb57a5977be78aa35840e9a`  
Task population revision: `sha256:6c20859eb4b01e1e425de46d098dcc277f5ba93035bd131888ffbf77d7c0d885`
Workspace revision: `sha256:be02fd7e164b0242f026c010594dc705c86539072bc4a5529e67391a75454c20`

## Owner And Boundary

- Workboard snapshot and task identity: `build-openspec-workboard-v1.mjs` and `wfu-metadata.mjs`.
- TaskCard compilation: `build-openspec-task-cards-v1.mjs` and `openspec-task-card-v1.mjs`.
- Report inventory/manifests: `build-openspec-report-manifests-v1.mjs` and `openspec-report-manifest-v1.mjs`.
- Revision-bound corpus composition: `build-openspec-task-triage-corpus-v1.mjs`.
- Retrieval remains deterministic input order; no ranker, embedding, graph, cache, or model owner was added.

## Findings

- The card compiler reports 1,398 `CURRENT`, 352 `WAITING`, and 8,705 `REVIEW_REQUIRED` cards; 6,890 checked claims lack independent proof.
- The card compiler reports 10,415 `CLAIM_ONLY` and 40 `STALE` evidence states.
- Fresh TaskCards contain zero supersession review candidates; zero tasks are confirmed superseded.
- Report/task corpora compose at the shared workspace revision. Current per-report joins are gated on eligible receipts; the live census currently has none.
- Archive eligibility is zero. Every local source is retained; no SeaweedFS, Postgres, Qdrant, or Valkey writes occurred.
- Retrieval smoke returned five default cards with `canonicalAuthority:false` and `writesPerformed:false`. Explicit history retrieval remains opt-in and is covered by the focused contract test.

## Validation

- `node --check scripts/atlas/record-openspec-task-triage-validation-receipt-v1.mjs` — passed.
- Focused evidence-fabric, task-card, report-manifest, and triage contract tests — 34 passed, including receipt tamper and exact source-span rejection.
- End-to-end runner refreshed all three corpora, strict-validated the change, wrote a revision-qualified receipt, and independently read it back — passed.
- Rebuilt manifest joined exactly one report output; fresh file, receipt, and manifest checksums match with zero rejected current receipts/outputs.
- `node scripts/atlas/retrieve-openspec-task-triage-v1.mjs --limit=5` returned bounded current-corpus retrieval with history disabled and no ranker or writes.
- `openspec validate parent-atlas-openspec-task-triage-pipeline --type change --strict --json --no-interactive` — passed, 1/1 change valid.

## Gate Assessment

Proof level: `DRY_RUN_PROVEN` for same-HEAD corpus composition and retrieval; `NOT_PROVEN` for per-report task/evidence association, supersession confirmation, and archive eligibility. The previous persisted triage corpus failed current task-file hash verification, so shared outputs were not overwritten.

## Current Receipt-Output Join

The evidence-fabric owner carries output refs into TaskCards only for proof-eligible, source-current, workspace-current receipts. `EvidenceReceiptV1` does not define a `taskRef` property; the manifest join now validates its actual `changeId`, declared `taskId`, exact `sourceRefs` span, task/workspace revisions, output binding, and fresh output checksum. It never upgrades archive eligibility or rescans the full evidence census.

- Current receipt `receipt:parent-atlas-openspec-task-triage-pipeline:2.2:be02fd7e164b:20261003210423654` binds task block revision `sha256:dc4d24f8e6a88d19dba6aa2a4ee7fe6dc2306466f35b8e696926515f6e3a472f` to the workspace revision above.
- Receipt output `docs/reports/openspec-task-triage-validation-run-v1-be02fd7e164b-20261003210423654.json` has checksum `sha256:b41968662ce57d2bde066a16c19154f887691a5cc779defb865250eceffd6849`; the manifest's independent fresh hash is identical and associates it only to `parent-atlas-openspec-task-triage-pipeline:2.2`.
- Current corpus: one proven task receipt and one exact report association; zero confirmed superseded tasks, zero archive-eligible artifacts, and all 1,263 report artifacts remain local. No database, vector, graph, cache, or SeaweedFS writes occurred.
- Current revision-bound run report and receipt are listed above; corpus outputs remain at their standard `docs/reports/` paths, all below 10,000,000 bytes.

likely_cause: The report join required a non-schema receipt.taskRef instead of validating the canonical receipt task identity and exact source span.
evidence: Current PROVEN receipt readback; one fresh manifest association to the exact task; identical run-report, receipt, and manifest output checksums; 34 passing focused tests.
patch_targets: [`scripts/atlas/audit-openspec-evidence-fabric-v1.mjs`, `scripts/atlas/lib/openspec-task-card-v1.mjs`, `scripts/atlas/build-openspec-report-manifests-v1.mjs`, `scripts/atlas/lib/openspec-report-manifest-v1.mjs`, `scripts/atlas/lib/openspec-report-manifest-v1.test.mjs`, `scripts/atlas/lib/openspec-task-card-v1.test.mjs`, `scripts/atlas/record-openspec-task-triage-validation-receipt-v1.mjs`, `openspec/changes/parent-atlas-openspec-task-triage-pipeline/tasks.md`]
safe_next_command: `node scripts/atlas/build-openspec-task-cards-v1.mjs --check-only`
smoke_command: `node scripts/atlas/record-openspec-task-triage-validation-receipt-v1.mjs`
report_path: `docs/reports/openspec-task-triage-pipeline-dryrun-v1-20261003.md`
