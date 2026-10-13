# Tasks: NLP sidecar to OKF alignment

Status vocabulary: CREATED, WIRED, DRY_RUN_PROVEN, APPLY_PROVEN, NOT_PROVEN, plus BLOCKED and DECISION_NEEDED.

## Decisions

- [ ] DEC-NLP-01 Confirm how `upstream_symbol_id` and `upstream_node_id` are derived in the sidecar before mapping them. Status: DECISION_NEEDED.
- [ ] DEC-NLP-02 Choose: add byte spans to lexical features, or refuse lexical admission. Status: DECISION_NEEDED.
- [ ] DEC-NLP-03 Add `source_revision` to the analyze response, or mark it non-admissible. Status: DECISION_NEEDED.

## Verification (read-only)

- [x] VER-NLP-01 AST v2 chunk fields checked against `docs/.okf/schema.yaml` structural fields. Evidence: `python/miniforge_nlp_sidecar_v2.py` lines 50–68. Status: VERIFIED_READ_ONLY.
- [x] VER-NLP-02 Lexical `Feature` model has no byte span. Evidence: `python/miniforge_nlp_sidecar.py` line 313. Status: VERIFIED_READ_ONLY.
- [x] VER-NLP-03 `AnalyzeResponse` has no top-level `source_revision`. Evidence: `python/miniforge_nlp_sidecar.py` line 494. Status: VERIFIED_READ_ONLY.
- [x] VER-NLP-04 Baseline run of the existing sidecar tests inside the `miniforge-nlp-sidecar` container (no code changed): 8 of 9 files pass (33 tests). `test_miniforge_nlp_sidecar_source_revision.py` fails: `test_explicit_source_revision_beats_model_id_in_ast_and_pass_receipts` expects non-empty `pass_results` and gets `[]`. This is an analyze-response contract gap, not yet diagnosed. Status: VERIFIED_READ_ONLY (test run).

## Drafts

- [ ] DRF-NLP-01 Write the identity mapping table into `docs/.okf/schema.yaml` after DEC-NLP-01. Status: BLOCKED.
- [ ] DRF-NLP-02 Write `atlas.nlp.lexical-feature.v1` as a schema file after DEC-NLP-02. Status: BLOCKED.
- [ ] DRF-NLP-03 Write `atlas.nlp.analyze.v1` as a schema file after DEC-NLP-03. Status: BLOCKED.

## Wiring

- [ ] WIR-NLP-01 Validate sidecar responses against the schemas in a test. Status: BLOCKED on DRF-NLP-02 and DRF-NLP-03.

## Diagnosis: pass_results empty (2026-10-13, read-only)

- [x] DIAG-NLP-01 Root cause: `AnalyzeRequest.source_ref` (`python/miniforge_nlp_sidecar.py`) has no alias, while its siblings use camelCase aliases (`sourceRevision`, `workspaceRevision`, `treeNodeId`). The test sends `sourceRef=`, which pydantic ignores. `source_ref` stays None, and `_build_pass_results` returns empty (guard at the top of that function). Status: VERIFIED_READ_ONLY.
- Proposed fix (not applied): change the field to `source_ref: Optional[str] = Field(default=None, alias="sourceRef")`. `populate_by_name` is already set, so snake_case callers keep working. Only camelCase `sourceRef` requests change behaviour: they start returning pass receipts instead of empty results. Status: DECISION_NEEDED.
- Verification needed after the change: the sidecar container runs its own copy of the code. Testing needs the edited file copied into the container or a restart, both of which need approval. Status: BLOCKED on approval.

## Applied fix: sourceRef alias (2026-10-13)

- [x] FIX-NLP-01 Added `alias="sourceRef"` to `AnalyzeRequest.source_ref` in `python/miniforge_nlp_sidecar.py`. Status: CREATED (repo edit).
- [x] TEST-NLP-01 Copied the sidecar directory into a scratch path inside the `miniforge-nlp-sidecar` container and ran all 9 test files against the edited module. All pass, including `source_revision` (previously 1 failed). Status: VERIFIED_READ_ONLY (scratch copy; service not touched).
- Correction: `/app/python` is a bind mount of the repo's `python` folder, so the edit is already visible inside the container. The earlier "live file unchanged" check was invalid (path conversion in Git Bash) and proves nothing.
- [ ] RESTART-NLP-01 The running sidecar started 2026-10-12 16:58 and still has the pre-edit code loaded. A restart is required before the alias takes effect in service. Status: BLOCKED on operator approval.
- [x] RESTART-NLP-01 Restarted `miniforge-nlp-sidecar` (started 2026-10-13 06:27 UTC). Health HTTP 200. One analyze request with `sourceRef` returns 1 pass result carrying the source revision. Status: APPLY_PROVEN (service restart and one live request; no data written).
