# Parent Atlas Svelte LSP and CPU Clustering Diagnostic

## Live Large-Source Replay and Bounded Continuation

After explicit approval, restarted only the 8095 sidecar. The live `/ast/chunk` request for the exact 239,212-byte `route-feature-map.ts` returned HTTP 200, 10 chunks, the expected source SHA-256, and in-bounds byte spans. The bounded page was rerun with the admitted snapshot root explicitly set: 7 sources completed, while `route-feature-map.ts` remained PARTIAL because NLP still skips inputs over 50,000 bytes. Four failures from the first retry came from reading the working tree instead of the admitted snapshot; the corrected run had no failures.

The next page and two continuation pages passed page-level independent receipt checks: 24 additional sources completed, all providers completed, and no datastore writes. Latest cursor is `sveltekit-frontend/src/lib/server/atlas/runtime/trtllm-pytorch-runtime.spec.ts`. Continuation receipt `.tmp/atlas/indexed-source-continuation-1792604683974.json`; pages `.tmp/atlas/indexed-source-batch-1792604677962.json`, `.tmp/atlas/indexed-source-batch-1792604705154.json`, and `.tmp/atlas/indexed-source-batch-1792604722278.json`. This does not establish full frozen-corpus coverage or indexed AST evidence. Keep the large-file NLP partial in the denominator.

An additional eight bounded pages independently verified 64 sources with all providers complete, zero failures, and zero datastore writes. Cursor `sveltekit-frontend/src/lib/server/atlas/tensors/semantic-corpus-bundle-v1.ts`; continuation receipt `.tmp/atlas/indexed-source-continuation-1792604776945.json`. This advances only the selected `src/lib/server` scan. The frozen corpus is not exhausted and the prior large-file NLP partial is unresolved.

The next bounded continuation verified 120 additional sources, then safely stopped at `sveltekit-frontend/src/lib/server/data/legal-seed-data.ts` (158,852 bytes), where NLP returned `SKIPPED_SOURCE_OVER_50000_BYTES`. The incomplete page was not counted as verified; latest verified cursor remains `sveltekit-frontend/src/lib/server/config/service-urls.ts`. Stop receipt `.tmp/atlas/indexed-source-continuation-1792604906008.json`; page `.tmp/atlas/indexed-source-batch-1792605272403.json`. The scan is incomplete, and this file plus the earlier `route-feature-map.ts` partial remain in the denominator.

**Status:** Diagnostic only. No production admission or durable AST/vector/ACE writes.

## Svelte LSP

- The four-file frozen fixture covers Svelte 5 runes, module/instance TypeScript, Unicode, and CRLF. It returned stable symbol sets on two runs and showed embedded-TypeScript definitions beyond the small Tree-sitter chunk set. Three synthetic LSP symbols had invalid spans and were rejected. Receipt: `.tmp/atlas/svelte-lsp-fixture-v1/probe-receipt-run2.json`.
- The full-project control copied 25,544 files / 473,214,507 bytes with zero hash mismatches, linked the installed Svelte dependencies, and generated `.svelte-kit/tsconfig.json`. The TypeScript-plugin `documentSymbol` request timed out after 306,864 ms and again after 60,015 ms on the same server. Receipt: `.tmp/atlas/prepared-svelte-lsp-warm-1792554994675.json`.
- The separate 35-symbol minimal-project result is not full-workspace semantic qualification. The full project has no frozen package lock; Vite config resolution also fails on `unocss/vite`, but this has not been proven to cause the LSP timeout.
- The existing resolver exposes document symbols and definition requests, but no references request. Span-correct fixture symbols do not establish repository-wide definitions/references.
- Result: `SVELTE_LSP_SNAPSHOT_QUALIFIED` remains unmet. Embedded TypeScript extraction and NLP receipts keep their independent diagnostic status.

## Read-Only Cohort Check

- `codebase_chunk_index`: 274,465 rows; 274,428 vectors; zero populated `source_revision`, `workspace_revision`, or `representation_revision` fields. No chunk qualifies through those columns.
- A separate `atlas_source_refs` sample of 4,000 rows matched 3,352 current-disk hashes and mismatched 648. This sample is not a frozen-snapshot/revision proof and is not an eligible cohort.
- Receipts: `.tmp/atlas/corpus-clustering-v1/p1-revision-counts-current.txt` and `.tmp/atlas/corpus-clustering-v1/p1-lineage-probe-current.json`.

## CPU Stability Sweep

The experiment verifies and uses the existing frozen 19,990 × 768 F32 matrix; no vector export or database query occurs during fitting. Matrix checksum: `sha256:5aa0f499139195390738a95d920fcd421b6e9626fc5c1f23f23432bd7e25eb3e`. Cohort remains `UNQUALIFIED_COMPARISON`.

Settings: CPU-only; CUDA disabled; KMeans and MiniBatchKMeans plus a custom spherical KMeans implementation; `k = 16, 32, 64, 128`; seeds 42, 7, 123; five initializations per seed; max 100 iterations. Silhouette uses the same deterministic 2,000-row subset; neighbor retention uses 2,000 query rows and exact top-10 cosine neighbors.

| Algorithm | k | Mean pairwise ARI | Mean cosine silhouette | Same-cluster top-10 rate | Minimum cluster size | Fit time |
|---|---:|---:|---:|---:|---:|---:|
| KMeans | 16 | 0.621 | 0.065 | 0.741 | 287 | 0.7 min |
| KMeans | 32 | 0.625 | 0.071 | 0.705 | 120 | 1.3 min |
| KMeans | 64 | 0.625 | 0.075 | 0.666 | 44 | 1.6 min |
| KMeans | 128 | 0.529 | 0.069 | 0.618 | 20 | 3.3 min |
| MiniBatchKMeans | 16 | 0.448 | 0.068 | 0.720 | 301 | 0.1 min |
| MiniBatchKMeans | 32 | 0.414 | 0.060 | 0.684 | 122 | 0.2 min |
| MiniBatchKMeans | 64 | 0.475 | 0.069 | 0.643 | 7 | 0.3 min |
| MiniBatchKMeans | 128 | 0.429 | 0.059 | 0.601 | 4 | 0.9 min |
| SphericalKMeans | 16 | 0.649 | 0.079 | 0.735 | 166 | 4.6 min |
| SphericalKMeans | 32 | 0.733 | 0.073 | 0.703 | 125 | 3.5 min |
| SphericalKMeans | 64 | 0.600 | 0.082 | 0.666 | 20 | 3.5 min |
| SphericalKMeans | 128 | 0.538 | 0.073 | 0.622 | 1 | 3.8 min |

Peak process RSS was approximately 446 MiB; total fit time was 23.7 minutes. No empty clusters were observed. Spherical `k=32` was most stable in this comparison, but silhouettes remain low (0.059–0.082); this is not evidence for semantic domains, taxonomy labels, or improved judged-query Recall@10. Receipt: `.tmp/atlas/corpus-clustering-v1/kmeans-stability-sweep-v2-1792557216.json` (`sha256:9b18c971c0aed0f7305f6adab7a41214ebc5babcd1f085baddb538b678aacf1f`); reproducible runner: `.tmp/atlas/corpus-clustering-v1/k-sweep-stability-v2.py`.

## ACE Boundary

The existing clustering adapter proposed 50 diagnostic packets and found zero revision-qualified or ACE-admission-eligible rows; it performed zero writes. This does not constitute a Svelte-feature-specific `ContextManifest`. No production manifest or DAG was built because the source/representation cohort remains unqualified. Existing receipt: `.tmp/atlas/corpus-clustering-v1/d4-diagnostic-run-receipt.json`.

## Next Gates

1. Diagnose why full-project Svelte TypeScript-plugin requests time out; keep the 35-symbol minimal control and four-file fixture diagnostic-only.
2. Finish the frozen source scan against its corrected 2,682-row eligible manifest. Latest independent checkpoint: 1,088 processed, 1,594 remaining, 427 explicit exclusions, zero failures or writes; `.tmp/atlas/indexed-source-server-coverage-chain-v1.json` (page 136, `.tmp/atlas/indexed-source-batch-1792559106451.json`).
3. Resolve source/workspace/representation provenance through its authoritative writer or independently verified receipts; do not infer it from current disk byte matches.
4. Only then build a source-qualified query-to-ContextManifest slice and evaluate cluster-filtered retrieval on judged queries.

**Stores:** no PostgreSQL, Qdrant, cache, Neo4j, or production embedding writes. No CUDA resource window, Graphify promotion, or QLoRA training was used.

## Span-Filtered Svelte LSP Pilot (2026-10-21)

A deterministic 20-file pilot was selected from the 933 Svelte rows classified NO_DECLARATIONS by symbol-coverage v2. All 933 current source files matched their frozen per-file source hashes; the selected 20 were copied byte-for-byte into a disposable narrow workspace. The workspace used copied package.json, svelte.config.js, and tsconfig.json, with node_modules linked to the installed app dependencies. Environment: Node 22.23.3, Svelte 5.53.3, Svelte Language Server 0.18.3, SvelteKit 2.59.1, adapter-node 5.4.0, and vite-plugin-svelte 5.1.1. The three copied configuration hashes and exact per-source hashes are in .tmp/atlas/svelte-lsp-fixture-v1/span-filtered-real-pilot-receipt.json.

All 20 LSP requests returned OBSERVED (45.7 seconds summed per-file elapsed time). Across 2,760 flattened symbols, 1,738 had an identifier name present in the mapped original-source byte span, 1,016 did not, and six had invalid mappings (including inverted synthetic $$ComponentProps ranges and range-less bind:value symbols). This is a useful span filter, not proof that every accepted name is a TypeScript declaration or semantically correct LSP symbol. The pilot has no admitted workspace revision, does not establish project-wide module resolution, and does not qualify the remaining 913 Svelte files.

An exploratory run against the full application root timed out on its first four files and was stopped. The narrow isolated workspace completed; this supports the bounded-workspace approach but does not justify a full-corpus run without an operator decision. No source, database, vector, cache, graph, or GPU writes occurred. Receipt status remains diagnostic and non-indexed.

## Large-Source AST Request Regression

The frozen `route-feature-map.ts` source is 239,212 bytes and its UTF-8 text is 239,212 characters. `AstChunkRequest.source` previously capped inputs at 200,000 characters, causing a FastAPI/Pydantic 422 before Tree-sitter ran. The model now uses `MAX_AST_SOURCE_CHARS = 1_000_000`; tests cover acceptance above the old cap, HTTP route acceptance in-process, and rejection above the new cap. The focused revision test file passes 6/6 in the mounted sidecar Python 3.13 environment.

A direct no-write call to the updated V2 AST function on the exact source bytes returned `CLEAN`, 10 chunks, the matching SHA-256 source revision, and all byte spans in bounds. An in-process FastAPI TestClient POST also returned HTTP 200 above the prior cap. Neither check exercised the already-running HTTP process: 8095 was not restarted, and no batch scan was resumed. NLP's independent 50,000-character cap is still in place, so the source-analysis batch may remain partial until that provider contract is handled explicitly. No datastore or production writes occurred.

A subsequent read-only request to the live `http://127.0.0.1:8095/ast/chunk` using the exact 239,212-byte source returned HTTP 422 and reported the old 200,000-character maximum. The patched model is therefore not loaded by the running process. The next gate is a controlled 8095 reload, followed by the same one-file live request; only then should the frozen scan resume. No service restart or data-store mutation was performed.

**Scan checkpoint refresh:** subsequent page 139 was independently reconciled against the frozen manifest: 1,112 / 2,682 eligible sources, 1,108 clean parses, four recoverable diagnostics, 1,570 remaining, zero failures or writes. Receipt `.tmp/atlas/indexed-source-batch-1792559195346.json`; outcome checksum `sha256:843d8bf48b989c8f99a007599ed58c4ca65ef8a8f33058731995d25ede6423a1`. This supersedes the earlier 1,088-source checkpoint above.

## Review: subsequent Svelte LSP probe and scan stop

- The synthetic fixture is useful diagnostic evidence: LSP responded for its files, repeated symbol sets were reported stable, and the run explicitly preserved invalid/synthetic wrapper symbols instead of claiming qualification. `LSP_OBSERVED_ALL_FILES` means responses arrived; it does not mean source spans or symbol semantics are all valid.
- The real-file probe sampled five Svelte files selected from the first `NO_DECLARATIONS` rows, returned 20–114 symbols per file, and marked only two files `spansValid=true`. Its check only verifies a nonempty in-bounds range; it does not verify that the range selects the symbol text. Although it computes a source hash, the result rows omit the hash and do not reconcile to a frozen source manifest. The LSP workspace root is the temporary fixture while source files are read from the application tree, so this is not application-project semantic qualification. Receipt `.tmp/atlas/svelte-lsp-fixture-v1/real-sample-receipt.json`; probe `.tmp/atlas/svelte-lsp-fixture-v1/real-sample-probe.mjs`.
- The continuation stopped safely at `route-feature-map.ts`: exact snapshot bytes are 239,212 bytes; LSP completed, 8095 AST chunking returned HTTP 422, and NLP was skipped by its >50,000-byte limit. A direct read-only replay returned FastAPI validation detail `string_too_long` (maximum 200,000 characters) from `/ast/chunk`. This is a request-size contract mismatch, not evidence of bad source revision. Batch `.tmp/atlas/indexed-source-batch-1792559315225.json`; provider receipt `.tmp/atlas/indexed-source-provider-diagnostic-1792559312344.json`; AST receipt `.tmp/atlas/ast-chunk-keyed-map-v4-2026-10-21T05-08-22-854Z-route-feature-map.ts.json`.
- Review verdict: fixture parser/LSP behavior is partially observed; real-file LSP source-span validity and project binding are incomplete; corpus diagnostic continuation is stopped at a reproducible sidecar input-size gate. Do not mark Svelte LSP qualified or skip this file. The next implementation decision is a bounded, source-preserving large-file analysis contract (or an explicit partial status that preserves the denominator), followed by span-content validation and source-hash-bearing receipts.

**Latest scan checkpoint:** page 141 / 1,128 of 2,682 eligible sources; 1,124 clean parses, four recoverable diagnostics, 1,554 remaining. The continuation then stopped at an unverified page, with zero datastore writes. Latest reconciled page `.tmp/atlas/indexed-source-batch-1792559273189.json`; coverage receipt `.tmp/atlas/indexed-source-server-coverage-chain-v1.json`; outcome checksum `sha256:f04d0ab6dd8a83d977f2c1bf49614e58a077779626aee5d35f31ebb21e79303a`.
