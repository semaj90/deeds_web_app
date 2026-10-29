# Parent Atlas Hardening AST and Rank Replay

Date: 2026-10-28

## Result

Replayed the existing inventory-bound Svelte compiler/TypeScript and ast-grep fact producer into unique `.tmp/atlas/*-20261028-v3` artifacts. Then ran the existing DuckDB directory rank query through a temporary SQL copy, preserving the prior rank and ticket artifacts. No new Neo4j graph, daily board mutation, model call, database write, or service call was made.

## Evidence

- Input inventory: `.tmp/atlas/source_file_inventory-local-snapshot-20261027-v1.parquet`, SHA-256 `a0142e66fd137ce013e462103a78483aa470207b84b7ad8dad2ae553af10920b`.
- Fact receipt: `.tmp/atlas/file_ast_facts-20261028-v3.receipt.json`; 6,789 inventory records, 6,681 analyzed, 103 current-source digest mismatches, 5 UTF-8 round-trip mismatches, 0 missing files, 7,896 facts, 505 ast-grep agreements, 0 disagreements, 0 workspace-bound files.
- Fact JSONL SHA-256: `9c294c096870ac8d170f61e482e96f6a7de2737de71d05b45954db0aef996610`.
- Summary JSONL SHA-256: `66c44054f262b7fe5b8f527f4b8a89245ccccf6f8e33d584296d9e133cd8c77c`.
- Rank replay inputs: existing `.tmp/atlas/directory-wide-v2-local-snapshot-20261027-v1.parquet`, current `docs/CODEBASE_DIRECTORY_MAP.md`, the new fact summary, an empty PageRank input, and an empty workspace-binding CSV. Graph and workspace-revision evidence were deliberately omitted rather than inferred.
- Rank output: `.tmp/atlas/directory_remediation_rank-20261028-v3.parquet`, SHA-256 `d7ee46f8eb5bdd1ceb7798de076b7cc2b7c16471451672acf32b4423a9ca8e09`.
- Dry-run tickets: `.tmp/atlas/directory_remediation_tickets-20261028-v3.jsonl`, SHA-256 `fe8693e9d8e43482668793bb5a7692dd95c7940c7163a3be0ec07f25b55f2782`.
- Rank population: 1,605 directories; 209 have AST-derived review debt, including 97 with request-body validation requiring review, 92 with URL-literal observations, and 40 with TODO observations. No AST parse-error directories were reported. These are triage signals, not confirmed defects.
- Top 12 by the diagnostic `rank_ast`: `lib/server/retrieval` (43.0), `lib/server/ai` (40.0), `lib/components/ai` (37.3), `lib/server` (34.3), `lib/components/ui/gaming/n64` (33.7), `lib/components/yorha` (32.3), `lib/server/ace` (31.0), `lib/components/yorha/_simulations` (30.8), `lib/components/yorha/evidence` (30.6), `routes/api/cache/som` (30.1), `routes/api/graph/glyph-atlas` (30.1), and `lib/server/atlas` (29.0). The top directory signals combine review observations with backup/duplicate/size terms; they are not a confirmed-defect list.
- No directories had admitted PageRank metrics or exact workspace bindings in this replay. The top `rank_ast` entries are therefore unbound, local analysis priorities, not canonical Graphify priorities.
- The SQL emits `score_ast`/`rank_ast` for comparison, but its current ticket selection still orders by the legacy `score`. Do not publish this ticket file as an AST-prioritized daily board until that owner is deliberately updated and its schema/receipt tests cover the selected score.
- Focused pipeline checks: `node --test scripts/atlas/file-ast-facts-v1.test.mjs scripts/atlas/run-agentic-error-fixing-kanban-v1.test.mjs` passed 9/9. The available route-hardening and courtroom unit suites passed 59/59 across 15 files. These do not constitute live DB, service, or browser-animation proof.

## Remaining Gates

1. Refresh the source inventory and directory-wide features from a single frozen current workspace snapshot; the replay had 108 files that could not be analyzed against the old inventory digest or UTF-8 round-trip contract.
2. Supply and verify a legitimate admitted workspace-binding artifact before attaching workspace revisions.
3. Supply admitted, revision-qualified graph metrics if graph centrality is to affect ranking; otherwise keep the deterministic non-graph ranking.
4. Review AST observations against route/helper semantics before converting them into confirmed findings. Do not turn the 127 button candidates or request-validation review signals into defects automatically.
5. Decide whether `score_ast` should become the rank used for the proposal preview. If so, update the existing SQL owner and its tests; do not create a second Neo4j graph or taskboard.
6. Keep source edits separately reviewed and approved. Courtroom playback remains a separate runtime verification task.

## Authority and Side Effects

All output is local analysis evidence with `canonicalAuthority=false`. The run wrote only uniquely named `.tmp/atlas` artifacts and this report. It did not write PostgreSQL, Neo4j, Qdrant, Redis/Valkey, SeaweedFS, or the daily Graphify board; it did not run Graphify, invoke Ollama or llama-server, or alter source files.

`likely_cause`: The old inventory and unbound graph inputs prevent this replay from establishing current, revision-qualified production priorities.

`evidence`: The fact receipt and hashes above; DuckDB rank output with 1,605 directories and zero bound revisions/graph metrics; 9/9 focused tests.

`patch_targets`: None; review `scripts/atlas/file-ast-facts-v1.mjs`, `scripts/atlas/directory-remediation-rank-v1.sql`, and the existing error-fixing/Kanban owners before enabling these rankings.

`safe_next_command`: `node --test scripts/atlas/file-ast-facts-v1.test.mjs scripts/atlas/run-agentic-error-fixing-kanban-v1.test.mjs`

`smoke_command`: Same focused test command; passed 9/9 in this replay.

`report_path`: `docs/reports/parent-atlas-hardening-ast-rank-replay-2026-10-28.md`

## Follow-up validation attempt (2026-10-28)

- A fresh `npm run check` was attempted after the replay. It remained at `Getting Svelte diagnostics...`; system free memory fell below 1 GiB, so this invocation was interrupted before diagnostics or a successful exit code were produced. This is `NOT_VERIFIED`, not a pass and not evidence of a source error.
- A separate `svelte-check --output machine --threshold error` process was already active; its ownership and result could not be established from this session. It was left untouched to avoid disrupting concurrent work.
- A 60-second status wait confirmed that separate checker is still active; it had used about 5.8 GiB working memory while the workstation had about 327 MiB free. No completion output or diagnostics were available, so the requested fresh `0 errors / 0 warnings` result remains unverified here.
- A second 60-second wait still found the same process active (about 6.4 GiB working memory; about 1.1 GiB free). It remains a live, unowned run with no captured completion output; do not launch another full check concurrently.
- After that wait, the checker terminated and its existing artifact `.tmp/atlas/svelte-check-full-20261028k.txt` was found: `COMPLETED 16339 FILES 0 ERRORS 0 WARNINGS 0 FILES_WITH_PROBLEMS`. It began at 14:06:34 and completed at 14:11:43 local time, after the latest app-source edit at 14:06:28. This verifies clean diagnostics for that source state, but this artifact does not contain an explicit exit code. The earlier 14:02 run recorded `EXIT=0` but predates those latest edits.
- A separate fresh `npm run check` was then attempted with an in-repository log path. It was interrupted when free memory dropped below 1 GiB; no diagnostics or checker exit code were captured. The 0/0 completion above remains the latest completed diagnostic result, while an explicit exit code for that latest source state is still missing.

## Current hardening-route evidence (2026-10-28)

- Generated a current local inventory from `rg --files sveltekit-frontend/src`: 7,314 unique paths, 51,543,869 bytes, zero malformed SHA-256 values. JSONL SHA-256: `b71212f0ecc6e31f201485fd5400d1e8868369e7e54cc976b97a75e674e1757d`; Parquet SHA-256: `f51ab719624cf6390b65b62eb511d436a89325374477a667bfcecc2d4c09d8ff`. These are ignored local analysis artifacts, not canonical inventory records.
- The 13 named H1/H2 route files all occur in the current inventory. Exact comparison against the older `sha256:c63620c4…` binding CSV found **0/13 exact bindings**; 9 have changed content and 4 have no binding row. The current observations therefore carry exact per-file content digests but no admitted workspace revision; do not promote them as canonical Graphify findings.
- Replayed the AST/ast-grep producer on those 13 files. Receipt: `.tmp/atlas/hardening-routes-receipt-20261028-v2.json`; 13/13 analyzed, zero digest/UTF-8/missing-file errors, 11 body reads, all 11 matched validator calls, zero unresolved reads, 11 ast-grep agreements, zero uncovered selectors or disagreements, and zero workspace-bound files. Receipt `canonical_authority=false`, `canonical_store_writes_performed=false`.
- This replay exposed an analyzer false positive: it failed to associate `let body; body = await request.json()` with a later `schema.safeParse(body)`. The producer now recognizes simple identifier assignments containing the request read; it still records only a bounded validator-call observation, not proof that the parsed result controls the response. Added a regression fixture for that pattern. The AST producer plus existing Kanban bridge suites pass **9/9**.
- Re-ran the 13 named route regression suites with process-level `DEV_BYPASS_AUTH=false`: **13 files, 40 tests passed**. This is mocked route behavior, not proof of live deployment authentication or database persistence.
- Latest full Svelte diagnostic artifact remains `.tmp/atlas/svelte-check-full-20261028k.txt`: 16,339 files, zero errors and zero warnings; the separate explicit `EXIT=0` artifact predates the last source edits. The subsequent `npm run check` attempt was stopped at the low-memory safeguard before diagnostics, so an exact exit code for the latest clean diagnostic artifact is not available.
- No route handler, database, Graphify, Neo4j, queue, service, model, GPU, S3, or canonical datastore was changed or called. The only tracked-source edits from this follow-up are the AST analyzer’s bounded assignment handling and its regression test.

`likely_cause`: The route hardening was present, but the AST analyzer missed validation flows that assign `request.json()` into a previously declared local variable.

`evidence`: `.tmp/atlas/hardening-routes-receipt-20261028-v2.json`; the fresh inventory and binding comparison; AST/Kanban tests 9/9; route suites 40/40; full Svelte diagnostics artifact with exit-code caveat.

`patch_targets`: `scripts/atlas/file-ast-facts-v1.mjs`; `scripts/atlas/file-ast-facts-v1.test.mjs`.

`safe_next_command`: Review the AST assignment-flow change and preserve the 13-route suite command with `DEV_BYPASS_AUTH=false` for repeat validation.

`smoke_command`: `node --test scripts/atlas/file-ast-facts-v1.test.mjs scripts/atlas/run-agentic-error-fixing-kanban-v1.test.mjs`; route tests: the 13 Vitest files listed in the run command, with `DEV_BYPASS_AUTH=false`.

`report_path`: `docs/reports/parent-atlas-hardening-ast-rank-replay-2026-10-28.md`
- The attempt's temporary log was accidentally placed under `C:\Users\james\Videos\.tmp\atlas` rather than the repository `.tmp`; only that exact temporary log was removed. No repository source, database, model service, or canonical store was changed by the check attempt.
