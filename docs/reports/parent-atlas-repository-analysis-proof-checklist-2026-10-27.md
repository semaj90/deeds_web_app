# Parent Atlas repository-analysis proof checklist — 2026-10-27

This is a bounded evidence snapshot, not a project-completion percentage. OpenSpec task checkboxes are not proof by themselves; each gate needs owner-specific, revision-bound evidence and readback.

## Current read-only evidence

| Gate | Result | Evidence / boundary |
|---|---|---|
| Canonical gate V2 | `FAIL`; 2/9 predicates pass (22.2% for this run only) | Latest run `.tmp/atlas/canonical-gate-runs/2026-10-27T23-05-28.567Z-fb3dfe9d-6be4-4195-8a4a-e23d589c51b5/canonical-gate-receipt-v2.json`; file SHA-256 `sha256:0069e35ac6c0e7dfad61aa5f58a2ca03b0fc019b870d5c21c70782c38c4d25a6`; embedded checksum `sha256:fa0d4e939ef2ade17cc26cef7cd5b7fae0c420c761fcc655e7a87e65294fb989`. First blocker `PACKET_IDENTITY/BLOCKED: GRAPHIFY_EXECUTION_NOT_CANONICAL`; graph integrity/ontology fail, graph/repository coverage are partial, and projection admission is unknown. Authority/writes are false. This ratio is not overall completion. |
| Neo4j census/export | Census is diagnostic; export/coverage partial | Latest gate reports selected node/relationship classes only, unresolved endpoints and unproven canonical lineage. Do not use census counts to authorize enrichment. |
| OKF profile reconciliation | `INCOMPLETE`; 743 inventoried, 387 rejected by broad v0.2 profile, 356 excluded, zero unclassified | Latest receipt `.tmp/atlas/okf-profile-reconciliation-followup-20261027T1635.json`; file SHA-256 `sha256:0190b2a30fbe97415a05b8be7362911df7a8eb97339be671f2251ca2cab13ecd`; embedded checksum `sha256:ce0ac53a1cb625c40df52536229d7e076311f1704b2da601950f8e320cdb00a3`. It preserves applied-profile vs declared-document identity and verifies two validator-code digests. Counts: 674 snapshot-only, 35 intended-profile validated, 10 schema self-validated, 21 owner validations missing, and 3 profile rejections pending review. |
| Human domain labels | No candidates in the reported 150-row cohort have human labels | The 44-row HTML sheet is for manual labeling. Path-regex suggestions are not gold labels. Evaluator requires reviewer identity and timezone-qualified timestamp; second distinct reviewer on at least 10% before `SCORED`. Reviewer strings are not authenticated. |
| Domain evaluation | `INSUFFICIENT_SAMPLE` until human labels meet per-class floor | Do not claim learned-model accuracy from the self-labeled/path-regex test export. Current trust floor is 200 total and 30 per class; 17 classes require at least 510 reviewed rows. |
| Canonical retrieval dimension | `semantic_768` / EmbeddingGemma, 768 dimensions | Canonical retrieval baseline. 4,096-dimensional hidden states remain an experimental feature representation, not a replacement or canonical index. |
| NLP middleware | Import/package presence only; no source-to-ACE extraction trace proven here | LangExtract and `:8095` may produce bounded, source-grounded proposal summaries/extractions. Preserve source digest, exact byte spans, extractor/model revision and evidence references. They cannot create human labels, packet identity, canonical relations, or write canonical stores. |
| Python/runtime | Sidecar inventory only | `miniforge-nlp-sidecar` reported Pydantic 2.13.5 and LangExtract 1.6.0. Windows Python 3.14.7 lacked Pydantic. Do not conflate these runtimes or infer a working end-to-end NLP workflow. |
| Orchestration imports | Import smoke only | DeepAgents/LangChain/LangGraph import success is not agent workflow execution, datastore access, or production readiness. |

## Review checklist

- [ ] A human labels the current review-sheet batch; retain reviewer and review timestamp per row.
- [ ] Obtain an independently labeled second-review sample covering at least 10%; resolve disagreements without using model/path output as truth.
- [ ] Add candidates for compiler, GPU, graph, cache and retrieval; current path-signal cohort does not cover them.
- [ ] Reconcile domain taxonomy IDs and aliases against the authoritative, versioned taxonomy/OAK owner; preserve abstentions and unknown labels.
- [ ] Confirm the predictor emits calibrated confidence before defining confidence thresholds; otherwise report calibration as unavailable.
- [ ] Keep learned classification deferred until the stated total/per-class sample floor is met on reviewed labels.
- [ ] Keep labels and summaries proposal-only; require source/revision and canonical identity admission before any persistent enrichment.
- [ ] Prove one source-bound NLP/LangExtract observation through canonical resolution, retrieval and ACE `ContextManifest` readback before claiming pipeline integration.
- [ ] Re-run the canonical gate after any relevant changes; do not treat a passing health/import/test check as projection authorization.

## Validation commands and status

- Domain evaluator tests: `python -m unittest test_atlas_domain_classifier_eval_v1 -v` — 14/14 passed.
- OKF reconciliation tests: `node --test scripts/validate/okf-reconciliation-core.test.mjs` — 9/9 passed, including proof that syntax success alone cannot satisfy profile readiness.
- Declaration metadata: 74 files have parsed document declarations; includes two `atlas.local-doc-corpus-source.v1` JSON configs whose existing capture script only performs a partial config check. No full schema validator was found for that ID.
- Scope/registry focused tests: `node --test scripts/atlas/lib/graphify-scope-admission-v1.test.mjs scripts/atlas/lib/graphify-scope-repository-map-v1.test.mjs scripts/atlas/lib/packet-key-v2-admission-v1.test.mjs` — 16/16 passed.
- Orchestrator runtime-import smoke — passed; imports only.
- Strict OpenSpec validation — passed.
- Broad scripts TypeScript check — failed with repository-wide ambient type/module diagnostics; not a clean typecheck.
- Full read-only canonical gate — `FAIL`; receipt above. Receipt and evidence integrity verified; service health/source snapshot pass; packet identity/execution authority blocked; graph integrity/ontology fail; coverage partial; projection admission unknown. No authority or writes.
- No human labels were created. No database, Neo4j, Qdrant, Valkey, Graphify, or GPU writes/execution were performed for this checklist.
- Syntax-only probes on all 743 files report 14 Markdown-frontmatter parses, 41 YAML parses, 19 JSON parses, 332 plain Markdown files with no schema assertion, and 337 files not applicable to these syntax probes; no parse errors were reported. This does not establish semantic profile validity.
- Fresh audit `.tmp/atlas/okf-v02-audit-goal-20261027T154801973.json` reproduces 743 files and the inventory digest `sha256:e2d95a26f20c20f7b3219376ac6d9e095e8e357de1513afc81aa916cde22b981`; manifest domain filename accounting has no missing or undeclared domain files. The unresolved owner/profile list and exact schema errors are in the reconciliation receipt. The three domain documents are structurally different from the currently assigned domain-taxonomy schema; do not repair them or change the binding without their profile owner.

## Status interpretation

Use per-gate states (`PASS`, `PARTIAL`, `BLOCKED`, `FAIL`, `UNKNOWN`) and evidence references. Do not calculate a portfolio completion percentage until the owner-approved scope, denominator, and proof criteria are stable. The 2/9 gate ratio is only a diagnostic for the cited gate run.

`likely_cause`: Human-reviewed labels, source-qualified NLP evidence, and canonical packet/graph admission are separate missing proof boundaries; generated suggestions cannot substitute for them.

`evidence`: Canonical gate receipt and OKF profile receipt listed above; evaluator 14/14 and scope/registry tests 16/16; runtime import smoke; strict OpenSpec validation.

`patch_targets`: `codex.md`; `python/atlas_domain_classifier_eval_v1.py`; `python/test_atlas_domain_classifier_eval_v1.py`; this report; `openspec/changes/atlas-directory-first-analysis-v1/tasks.md`; `docs/master_feature_todo_1011.md`.

`safe_next_command`: Open `.tmp/atlas/domain-review-v3/review-sheet-batch-1.html` and label candidates manually; do not use path-regex suggestions as gold.

`smoke_command`: `python -m unittest test_atlas_domain_classifier_eval_v1 -v` from `python/`.

`report_path`: `docs/reports/parent-atlas-repository-analysis-proof-checklist-2026-10-27.md`.
