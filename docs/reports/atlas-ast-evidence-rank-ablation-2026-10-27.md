# Parent Atlas AST Evidence and Rank Ablation

**Status:** read-only, proposal-only; Canonical Gate V2 remains `FAIL`.

## Result

Built an inventory-bound fact extractor and ran the existing directory score beside an AST-review alternative. No source registration, datastore, queue, cache, S3, GPU, Kanban route, or source-file writes occurred. The existing score remains the ticket-selection baseline; the AST score is diagnostic only.

Input: `.tmp/atlas/source_file_inventory-local-snapshot-20261027-v1.parquet` (SHA-256 `a0142e66fd137ce013e462103a78483aa470207b84b7ad8dad2ae553af10920b`). The extractor considered only its 6,789 TypeScript/JavaScript/Svelte entries. All input file digests and byte lengths matched the inventory. It analyzed 6,784 files; five files with non-roundtrippable UTF-8 bytes were explicitly skipped rather than emitting suspect byte spans. Of the 8,139 JSONL rows, 2,234 have spans; independent readback confirmed every span hashes to the exact original source-byte slice.

## Evidence

- Fact table: `.tmp/atlas/file_ast_facts.jsonl`, SHA-256 `74896de309df7d3eb6ca6823688fe1c472af70b4b3c353cae66f6137114929a4`.
- Per-file summary: `.tmp/atlas/file_ast_summary.jsonl`, SHA-256 `8d7e54364d3b54e4fe6aed47470f2853c2c04171701e0ac710f179768d8fcfc6`.
- Receipt replay matched both outputs byte-for-byte. Receipt: `.tmp/atlas/ast-evidence-rank-ablation-20261027-v1.json`, SHA-256 `6d2be53b26070204b24c548a32c56b02ff63927eb5742ffb5e0b9ff0c44c723d`.
- 5,552 files join to the supplied admitted-binding snapshot by exact source path and digest. This records its workspace revision as provenance; it does not grant canonical authority. All facts set `canonical_authority=false` and `symbol_resolution=NOT_VERIFIED`.
- Request-body observations: 526 reads; 415 same-scope validator-call observations; 111 unresolved flows. The validator-call status is explicitly review-required and does not prove a guard or downstream use. Unresolved is not a vulnerability finding.
- Also observed 1,094 URL string/template literals, 88 TODO markers in actual comment nodes, zero compiler-confirmed legacy Svelte constructs, and zero Svelte compiler parse errors. URL observations are not automatically hardcoded-secret or defect findings.
- Ast-grep corroborated all 526 emitted request-read spans. No parser disagreements remained after the five invalid-UTF-8 files were skipped.

## Ranking Ablation

Variant A is the existing `score`: map debt, `.bak`, duplicate-content, size, and centrality terms. Variant B retains `.bak`, duplicate-content, size, and centrality, removes map debt, and adds only bounded unresolved-request review and compiler-confirmed legacy-Svelte review signals. The weights are unchanged. PageRank input was the existing empty CSV, so centrality contributed zero in this run.

- Top-10 overlap: 6/10. Top-50 overlap: 30/50. Mean absolute rank movement: 268.01 places across 1,605 directories.
- Neither top 50 contains an unresolved-request review candidate; the alternative’s movement is therefore not evidence that AST findings improved top recommendations.
- Revision-bound top 50: baseline 2; alternative 4. These are exact joins to the supplied non-canonical binding snapshot, not canonical admission.
- The prior bound-rank artifact and this baseline share 1,605 paths, have identical directory evidence digests, and overlap 10/10 and 50/50 at top 10/top 50. The rank inputs are reconciled for this snapshot; no claims are made about other receipts.
- The current SQL baseline does not include the separate “missing Zod” or URL-regex heuristics described in the earlier census. This ablation therefore does not measure removal of those heuristics. False-positive rate is `NOT_ESTIMATED` because there are no human-reviewed labels.
- The 50 generated ticket JSONL rows remain the baseline dry-run only. No AST-derived Kanban cards were created: unresolved flow and syntax observations are not corroborated actionable findings.

## Remaining Blockers

1. Add a byte-preserving decode/offset map for the five legacy-encoded files, or retain them as explicitly unanalysed until their encoding is established.
2. Improve request-body flow analysis to trace validator results through guards and downstream use; add recognized manual/framework validators. Preserve unresolved cases as review-only.
3. Resolve imports/references with the TypeScript checker/ts-morph and Svelte LSP; current symbol resolution is not verified.
4. Reconcile the separate Zod/URL heuristic owner if that is the intended baseline, then rerun the ablation against that exact score.
5. Obtain blinded human priority labels before estimating false-positive rates or claiming ranking quality. Keep ticket writes and file edits separately approved.

## Reproduction

From the repository root, run `node scripts/atlas/file-ast-facts-v1.mjs` with `ATLAS_WSB=.tmp/atlas/source-bindings-c63620-local-20261027-v1.csv`; compare the receipt digests across two runs. Then set `ATLAS_WIDE`, `ATLAS_MAP`, `ATLAS_PR`, `ATLAS_INV`, `ATLAS_WSB`, and `ATLAS_AST=.tmp/atlas/file_ast_summary.jsonl` to the paths recorded in the receipt and execute `duckdb -c ".read scripts/atlas/directory-remediation-rank-v1.sql"`. The SQL retains `score`/`rank` and adds `score_ast`/`rank_ast`; only baseline `score` selects the dry-run tickets.
