# Tasks: AST-grep chunk → symbol → summary lineage pipeline

Status vocabulary follows CLAUDE.md: CREATED, WIRED, PARTIAL, PROVEN, BLOCKED, DONE. A passing unit test does not prove integration. Each DONE item needs its exact command, a revision-qualified input, and an output receipt.

## 0. Owner audit (before any build)

- [ ] 0.1 Confirm the `:8095` `/ast/chunk` route is the only chunker owner: `rg -n "ast/chunk" python sveltekit-frontend/src scripts`.
- [ ] 0.2 Classify each existing helper in `scripts/atlas/lib/` (symbol extraction, chunk source path, LSP, shape, lineage) as CANONICAL_OWNER, BACKEND, ADAPTER, EXPERIMENT, or DEAD.
- [ ] 0.3 Record the owner table in `docs/architecture/runtime-ownership-registry.json` only if an entry is missing. Do not add a second owner.

## 1. Chunking (ast-grep / Tree-sitter)

- [ ] 1.1 Run `:8095 /ast/chunk` on a bounded sample (≥3 languages, including `.svelte` and `.ts`). Record chunk count, byte spans, and `scan_completeness`.
- [ ] 1.2 Verify every chunk span round-trips to the exact source bytes (`UTF8_PARSER_BUFFER_V1`).
- [ ] 1.3 Record a `PARTIAL_AST_FAILED` receipt for an unsupported language. Do not fill the gap with a regex chunker.

## 2. Symbol extraction

- [ ] 2.1 Map each chunk to zero or more symbols with `stableSymbolId` (or the existing equivalent). A symbol without a native span is `UNRESOLVED`.
- [ ] 2.2 Keep AST-grep matches as observations. They are not identity.

## 3. LSP language facts (evidence only)

- [ ] 3.1 Use `indexed-source-lsp-v1.mjs` to attach definition and reference facts to symbols. Record the language server version.
- [ ] 3.2 Tag each fact `NOT_RUN` when the server is unavailable. Do not infer a missing fact.

## 4. Canonical payload (sourceRef-keyed)

- [ ] 4.1 Define one payload per chunk: `sourceRef`, `sourceRevision` (whole-file SHA-256 of the exact bytes), chunk byte span, symbol IDs, LSP facts, and `feature_label`.
- [ ] 4.2 Join only on `packet_key` + `source_ref`, or `source_ref` + `sourceRevision`. Never join on `feature_id` alone.
- [ ] 4.3 Validate with Zod at the boundary. Hard-fail on a missing `sourceRef`, `sourceRevision`, or `feature_id`.

## 5. Linked structures and hyperparameter index (Python)

- [ ] 5.1 Store chunk lookups as a dict keyed by `(source_ref, chunk_ordinal)` tuples. Use a linked list only for ordered traversal (for example, parent → child spans).
- [ ] 5.2 Build the hyperparameter index (chunk size, overlap, grammar version, chunker version) as a tuple key, so any run can be reproduced from its key.
- [ ] 5.3 Test that the same input and hyperparameters give the same key and the same output checksum.

## 6. feature_label tie-in (OpenSpec)

- [ ] 6.1 Link each payload to its `feature_label` through the existing feature-labels table (`drizzle/manual/20261020_atlas_feature_labels_v1.sql`). Do not create a new label table.
- [ ] 6.2 Record unlabeled chunks as `UNRESOLVED`, not as a default label.

## 7. Summaries (last step)

- [ ] 7.1 Generate summaries with Ornith on `:8090` only from the payload in §4. Pass the spans and symbols, not raw files.
- [ ] 7.2 Reject any summary containing a reasoning marker (`<think>`, `<|channel>`, `chainOfThought`, `hiddenThoughts`) before storage.
- [ ] 7.3 Store `summary_model` and the payload checksum with each summary. A summary with no model provenance is not admitted.
- [ ] 7.4 Do not backfill the existing 40,306 summaries in this change. Their provenance is unproven, so they stay on hold.

## 8. Gates and verification

- [ ] 8.1 Unit tests for each stage, run with `PYTHONPATH=python` for Python and `npm run test:run` (scoped) for TypeScript.
- [ ] 8.2 An end-to-end receipt for one `sourceRef` through all seven stages, with each step's output checksum.
- [ ] 8.3 OpenSpec strict validation: `openspec validate parent-atlas-ast-summary-lineage-pipeline --strict`.

## 9. Gated (needs explicit approval)

- [ ] 9.1 Any Postgres write, including the summary backfill and the `summary_model` column (the column is missing on rows that already have summaries).
- [ ] 9.2 Any index DDL on `codebase_chunk_index` (write-amplified table).
- [ ] 9.3 Starting or stopping llama-server `:8090`. Lifecycle stays with the operator.
