# Parent Atlas Phase Proof Validation and Repository Analysis — 2026-10-13

## Purpose

Define a receipt-backed way to validate phase claims and report honest progress for the 1–24 roadmap audit. This is a repository analysis and validation plan, not a live service audit, phase redefinition, schema migration, or execution authorization.

## Current conclusion

- The companion phase audit lists 24 rows, but phase numbers overlap between the master roadmap, Graphify, workstation, and tensor-residency scopes.
- Therefore the portfolio's single implementation percentage remains **NOT_COMPUTABLE** until phase namespaces, owners, accepted gates, and denominators are approved.
- The prior audit found **0/24 phases verified DONE by that audit**. This is a proof status, not a claim that zero implementation exists.
- Historical percentages are scoped to their dated reports and must not be averaged into a current portfolio score.
- The receipt is an input to verification, not authority by itself. A receipt that merely says `PASS`, is stale, hashes different inputs, or lacks an independent owner readback does not close a gate.

## Evidence review

### Receipt-based gate proof

For each accepted atomic gate, record the exact owner and acceptance predicate, command or live read, exit/result, receipt path and SHA-256, source/workspace/model revisions as applicable, input artifact checksums, evidence class, freshness rule, independent readback, and reviewer/acceptance decision. Recompute receipt checksums from the referenced bytes. Verify that the tested code revision and inputs match the claimed phase. Keep fixture, unit-test, offline, live-read, and production-write evidence distinct.

GAN state is derived per gate and per phase:

| State | Required proof |
| --- | --- |
| `CREATED` | Contract, code, test, or artifact exists at the named owner. |
| `WIRED` | The declared production path reaches that owner with validated inputs. |
| `PROVEN` | The relevant check passes on the stated evidence class; production claims require current, owner-backed evidence and independent readback. |
| `DONE` | Accepted finite gates are all wired and proven, dependencies are satisfied, and the owner accepts the result. |

A test receipt may prove its tested behavior, but does not silently become live-service proof. A task checkbox, package installation, file existence, row count, generated report, or self-attested receipt status is not proof of the next boundary.

### Phase score and percentage rules

1. Freeze a phase namespace and stable ID (for example `PA-MASTER-17` versus `TENSOR-RESIDENCY-17`); bare phase numbers are display labels only.
2. The owner accepts a finite set of atomic, independently verifiable gates and dependencies before scoring. If that set is missing, report `N/A — denominator not approved`.
3. Report implementation state separately from proof coverage. `proof coverage = 100 × accepted gates with current qualifying evidence / accepted gates`. A gate is in the numerator only when its required GAN state is met and its evidence is current; failed, blocked, stale, missing, fixture-only-for-live, or unreviewed evidence is not proven.
4. Use equal gate weights by default. Use weights only when an owner records and approves them before the results are observed; never retroactively tune the denominator.
5. Report `DONE` only when all accepted gates meet the declared completion predicate. Do not average unrelated phase percentages into a portfolio percentage. Publish both numerator and denominator, excluded gates, evidence class, as-of time, and blocker list.

### Existing repository owners and limits

| Area | Repository evidence found | What it does not prove |
| --- | --- | --- |
| OpenWiki | Local generated `openwiki/testing/validation.md` describes smoke, integration, and ranking tests. `openwiki/evidence/status-and-gaps.md` explicitly separates proven, blocked, experimental, and unknown claims and says deployment state needs a fresh read-only audit. | No OpenWiki retrieval MCP tool was available in this session. Generated wiki prose is navigation/evidence context, not a current live receipt. Generic claims about service integration are not current proof. |
| Local `.okf` | `docs/.okf/schema.yaml` and `docs/.okf/registry.yaml` document repository-specific contracts, owners, and known alignment gaps. The header explicitly distinguishes the local convention from external OKF. | A schema declaration or registry entry does not prove every corpus file validates, is semantically admitted, or is indexed. |
| Evidence receipts | `packages/semantic-contracts/src/openspec-evidence-fabric-v1.ts` defines `EvidenceReceiptV1`, verifies canonical checksums/assertions, and derives one OpenSpec task proof state from source/workspace revisions. `scripts/atlas/audit-openspec-evidence-fabric-v1.mjs` also contains a receipt verifier. | The existing state derivation is task-level, not phase-level aggregation over an owner-approved finite gate denominator. The JS verifier previously permitted `verifier` as a fallback when `independentVerifier` was absent. This iteration aligns that check with the TypeScript schema and adds a regression test; phase aggregation remains unimplemented. |
| Python/Pydantic | `scripts/atlas/validate-okf-beautifulsoup-pydantic-v1.py` and `python/atlas_okf_domain_parity_oracle_v1.py` implement Pydantic validation boundaries; OAK-related Pydantic proposal validation exists in `python/parent_atlas_ontology/oak_agent_pydantic_boundary_v1.py`. | Validators do not prove a production caller invokes them or that ontology proposals were admitted. Pydantic shape validity is not ontology authority. |
| OAK/OAKlib | Existing Python OAK kernel/adapters and ontology tuple owners provide candidate resolution and semantic-validation paths. Existing OpenSpec work keeps tuple admission and current source binding as separate gates. | A resolved term, valid tuple, or graph edge is not automatically admitted canonical taxonomy/evidence. No new OAK store or writer is proposed here. |
| LangChain / DeepAgents | Repository package/adapter references and an isolated runtime-import smoke are present in repository evidence; the smoke did not instantiate an agent or open a database connection. | A dependency or import smoke does not prove a production workflow is wired, safe, or completed. Do not introduce a second orchestrator to score phases. |
| Phase source | `docs/reports/parent-atlas-master-phase-audit-2026-10-13.md` enumerates the current 24-row audit and its blockers. | Its rows do not yet define a canonical, owner-approved 24-phase denominator. |

## Recommended validation contract

Do not add a parallel receipt schema. Extend the existing OpenSpec evidence-fabric/report-manifest owner after reconciling its TypeScript and JavaScript receipt validators. The phase score needs an owner-approved gate manifest that maps stable `phaseId`/`gateId` and acceptance predicates to existing `changeId`/`taskId`/claim references:

```text
phaseId, gateId, acceptancePredicate
ownerPath, validatorCommand, validatorExitCode
evidenceClass: FIXTURE | UNIT | OFFLINE | LIVE_READ | LIVE_WRITE_READBACK
sourceRevision, workspaceRevision, inputChecksums[], receiptPath, receiptSha256
observedAt, freshnessPolicy, independentReadbackRef, reviewerDecision
ganState, blockerCodes[], mutationStatus
```

Requirements: keep receipt verification in the existing owner; require the same independent-verifier semantics in TS and JS; verify checksums against actual files; bind current task/workspace/source revisions; record exact command/exit and evidence class; require independent readback where persistence is claimed; represent `BLOCKED`, `STALE`, `MISSING`, and `NOT_APPLICABLE`; and derive phase coverage only from the frozen gate manifest. Do not trust a submitted GAN state or percentage. Preserve task-level `deriveOpenSpecProofState` behavior unless its owner approves a separate phase-aggregation contract.

### Validation checklist

- [ ] Assign a stable namespace and owner to every phase ID 1–24.
- [ ] Have each owner approve finite atomic gates, dependencies, weighting, and freshness policy.
- [ ] Map each gate to its authoritative producer, validator, and independent readback owner.
- [ ] Reconcile TypeScript and JavaScript `EvidenceReceiptV1` verifier rules; specifically require the same independent-verifier field for `PROVEN`.
- [ ] Keep task-level proof derivation distinct from phase-level aggregation over all accepted gates.
- [ ] Define allowed receipt formats and validate schema, checksum, revision, command, exit, and evidence class.
- [ ] Add negative cases for stale receipts, hash mismatch, missing revisions, fixture/live mismatch, fake `PASS`, missing readback, duplicate gates, and denominator drift.
- [ ] Test score reproducibility from the same frozen gate/evidence manifest.
- [ ] Test `N/A` for unapproved denominator and report blocked gates without converting them to zero implementation.
- [ ] Run fixture tests, then owner-specific read-only audits; label each result by evidence class.
- [ ] For any live write gate, require separate authorization and independently verified readback; do not enable writes through a report generator.
- [ ] Generate report outputs only after verification; include the evidence manifest digest, score formula, numerator/denominator, exclusions, and blocker list.
- [ ] Link the reviewed report from the owning master TOC through its established generated-document workflow; do not hand-edit generated OpenWiki pages.

## Recommended order

1. Normalize phase IDs and owners; retain the existing 24-row report as historical reconciliation.
2. Freeze an owner-approved gate manifest for one bounded phase before applying the scoring model portfolio-wide.
3. Implement receipt validation in the existing evidence owner and add adversarial tests; first prove fixture behavior only.
4. Validate one read-only gate against its current authoritative owner and record the independent readback.
5. Calculate phase proof coverage from accepted gates; leave portfolio percentage unavailable while any phase denominator is unapproved.
6. Update the owning OpenSpec ledger only with actual evidence, then refresh generated TOC through its existing command.

## Safety and non-goals

This review did not call live OpenWiki, OAK, LangChain, DeepAgents, database, Redis/Valkey, Qdrant, Neo4j, GPU, or MCP services. It did not train a model, install dependencies, create database schema, write caches, dispatch agents, or regenerate the TOC. It proposes no automatic phase completion, ontology promotion, production writes, or new orchestration framework.

## Source references

- `docs/reports/parent-atlas-master-phase-audit-2026-10-13.md`
- `docs/master_feature_todo_1011.md`
- `openwiki/testing/validation.md` (generated; navigation only)
- `openwiki/evidence/status-and-gaps.md` (generated status, includes explicit unknowns)
- `docs/.okf/schema.yaml`
- `docs/.okf/registry.yaml`
- `docs/architecture/atlas-store-ownership-and-derived-representations-v1.md`
- `packages/semantic-contracts/src/openspec-evidence-fabric-v1.ts`
- `packages/semantic-contracts/src/openspec-evidence-fabric-v1.test.ts`
- `scripts/atlas/audit-openspec-evidence-fabric-v1.mjs`
- `scripts/atlas/audit-openspec-evidence-fabric-v1.test.mjs`
- `scripts/atlas/lib/workspace-snapshot-capture-v1.spec.mts`
- `sveltekit-frontend/src/lib/server/retrieval/topk-paginator.spec.ts`
- `scripts/atlas/validate-okf-beautifulsoup-pydantic-v1.py`
- `python/atlas_okf_domain_parity_oracle_v1.py`
- `python/parent_atlas_ontology/oak_agent_pydantic_boundary_v1.py`
- `openspec/changes/parent-atlas-ontology-oaklib-fanout-bitmap/tasks.md`
- `openspec/changes/parent-atlas-compute-rank-cache-eval-dspy-gepa/tasks.md`
- `openspec/changes/parent-atlas-gpu-sidecar-patch-tournament/tasks.md`

## Result

**Current overall progress: NOT_COMPUTABLE.** The validated output is the phase-by-phase GAN audit and its explicit proof gaps—not an invented numeric score. Next acceptance decision: approve stable phase namespaces and finite gate denominators, then validate receipts against the owning code/data path.

## Iteration note — receipt verifier alignment

The JS audit verifier now requires `independentVerifier` for `PROVEN`, matching the existing TypeScript `EvidenceReceiptV1` contract; the legacy `verifier` field no longer satisfies that assertion. Regression coverage passes **21/21** in `node --test scripts/atlas/audit-openspec-evidence-fabric-v1.test.mjs`. This is local contract/test evidence only. It does not create phase-level scoring, approve phase denominators, refresh live receipts, or change the portfolio result: **NOT_COMPUTABLE**.

## Iteration note — Phase 1 and Phase 7 quick-win tests

Added a Phase 1 regression in `scripts/atlas/lib/workspace-snapshot-capture-v1.spec.mts` to reject a tampered `snapshotRevision`; the complete snapshot suite passes **15/15**. Added a Phase 7 regression in `sveltekit-frontend/src/lib/server/retrieval/topk-paginator.spec.ts` asserting canonical result equality under reversed candidate input. The equivalent direct assertion against `canonicalTopKPaginate` passed (`TOPK_ORDER_INVARIANCE_PASS`), but Vitest repeatedly stalled after startup without diagnostics, so the spec-run result is **UNVERIFIED**. These are local unit/contract proofs only; no live source cohort, semantic retrieval, or phase completion is established.
