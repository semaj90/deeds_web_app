# Language, profile, and cheat-sheet alignment (2026-10-22)

## 1. Language profiles
20 profile files; 60 extensions mapped; 0 ambiguous. Source: `.okf/languages/*.yaml`.

| Language | Extensions |
|---|---|
| binary | .a .bin .dll .dylib .exe .gguf .lib .node .o .obj .onnx .pdb .pt .pth .pyc .pyd .so .wasm |
| bash | .bash .sh |
| c | .c |
| cpp | .cc .cpp .cu .cxx .hh .hpp |
| typescript | .cjs .cts .js .jsx .mjs .mts .svelte .svelte.ts .ts .tsx |
| css | .css |
| go | .go |
| html | .htm .html |
| java | .java |
| json | .json .jsonc |
| ndjson | .jsonl .ndjson |
| markdown | .markdown .md |
| proto | .proto |
| powershell | .ps1 .psd1 .psm1 |
| python | .py .pyi |
| rust | .rs |
| sql | .sql |
| toml | .toml |
| text | .txt |
| yaml | .yaml .yml |

**Unmapped on purpose:** `.h` (shared by C and C++; needs a decision). `.git` directory (metadata).

## 2. Cheat-sheet alignment
All 15 packages document TypeScript declarations, so each maps to the `typescript` profile. Import counts come from `rg` over `sveltekit-frontend/src`, `sveltekit-frontend/scripts`, `scripts`, `packages`, `services`, `tools`, and `python`.

| Package | Version | Entries | Top importing directories |
|---|---|---|---|
| zod | 4.4.3 | 60 | sveltekit-frontend/src (1358), scripts (117), tools (67) |
| @sveltejs/kit | 2.59.1 | 60 | scripts (1173), sveltekit-frontend/src (939), sveltekit-frontend/scripts (17) |
| pg | 8.16.3 | 31 | scripts (1302), sveltekit-frontend/scripts (486), sveltekit-frontend/src (90) |
| vitest | 3.2.4 | 0 | sveltekit-frontend/src (1270), sveltekit-frontend/tests (1129), tools (68) |
| drizzle-orm | 0.45.2 | 60 | sveltekit-frontend/src (717), scripts (265), sveltekit-frontend/scripts (123) |
| ioredis | 5.8.2 | 60 | scripts (288), sveltekit-frontend/scripts (208), sveltekit-frontend/src (96) |
| dotenv | 17.4.2 | 11 | scripts (388), sveltekit-frontend/scripts (206), tools (55) |
| svelte | 5.53.3 | 60 | sveltekit-frontend/src (321), scripts (83), sveltekit-frontend/scripts (74) |
| neo4j-driver | 6.2.0 | 0 | scripts (116), sveltekit-frontend/scripts (49), sveltekit-frontend/src (28) |
| node-fetch | 3.3.2 | 15 | scripts (105), sveltekit-frontend/scripts (60), sveltekit-frontend/src (12) |
| @qdrant/js-client-rest | 1.19.0 | 21 | scripts (65), sveltekit-frontend/scripts (36), sveltekit-frontend/src (11) |
| postgres | 3.4.7 | 0 | sveltekit-frontend/src (123), scripts (123), sveltekit-frontend/scripts (77) |
| bits-ui | 2.16.2 | 60 | sveltekit-frontend/src (59), scripts (12), sveltekit-frontend/scripts (4) |
| fast-check | 4.4.0 | 60 | sveltekit-frontend/scripts (37), scripts (6), sveltekit-frontend/tests (2) |
| ts-morph | 27.0.2 | 60 | sveltekit-frontend/src (13), sveltekit-frontend/scripts (11), scripts (11) |

**Empty sheets (need rebuild):** vitest, neo4j-driver, postgres.

## 3. Directories by dominant language (bytecode and binaries excluded)
Dominance uses the top six extensions per directory from the directory map. Binary artifacts do not vote.

| Language | Directories |
|---|---|
| typescript | .tmp, sveltekit-frontend, node_modules, deeds_labs, claude-mem, packages, mcp-server-mcp, sites, scripts, .opencode |
| unmapped | .git |
| python | tools, .venv, docker, .venv-cu130, .python311, .venv-gemma4, python |
| json | docs, neschrom97, simd-bridge, crates, target, turbovec, logs, models, qdrant-windows, storage |
| cpp | llama-cpp-turboquant-gemma4 |
| markdown | openspec, .okf, next_steps |
| ndjson | memory |
| sql | drizzle |

## 4. Gaps
- Directory map was built without pruning (the walk still enters `node_modules`, `.venv`, `.git`), so counts include dependency trees.
- `neo4j-driver`, `vitest`, and `postgres` cheat sheets have zero entries.
- `ndjson` has no grammar in the catalog; treated as line-oriented.
- `.h` needs a C-or-C++ decision.
- Import-count alignment is a regex over JS and TS sources; it is approximate.

## 5. Package-reference candidate overlay
- Rechecked the package-surface-v3 map against the whole-repository path snapshot using `.tmp/atlas/directory-intelligence/package-refs-20261022t213700z/manifest.json` (`DERIVED_ADVISORY_CANDIDATES`, receipt SHA-256 `e6f8e8f16caba0d3e10bddc4c58978cb357fb15d79b2da27df2f052afd042a71`). The frozen map lists 9,601 files; 9,597 passed current-byte, UTF-8 and package-membership checks, while 4 were rejected.
- The Arrow artifact contains 13,570 import-reference candidates across 123 packages. Independent readback recomputed all referenced source digests and checked every UTF-8 byte span against its import specifier: 0 mismatches. Arrow SHA-256: `2498a92af495513cf1dd6f347c60393e66959deaed87da9ed20cf3e4f4f944c8`.
- Rejections are explicit: 3 sources failed strict UTF-8 decoding; 1 source's current package set differs from the frozen surface map (`vitest` expected; `vitest` and `zod` observed). These are not silently accepted.
- These rows are regex-derived syntax candidates, not AST/CST or runtime proof, public-export validation, canonical source identity, or workspace-revision evidence. They do not verify cheat-sheet declarations or authorize indexing, ranking, or projection writes. An initial run was superseded after independent checking exposed BOM-stripped byte offsets; the corrected decoder preserves the BOM and a regression test covers it.

## 6. Receipts
- Directory map: `docs/reports/language-coverage-directory-map-2026-10-22.json`
- Cheat-sheet alignment: `.tmp/atlas/library-cheatsheets/language-alignment-2026-10-22.json`
- Package-reference candidates: `.tmp/atlas/directory-intelligence/package-refs-20261022t213700z/manifest.json`
- Directory/package taxonomy candidates: `.tmp/atlas/directory-intelligence/dir-package-20261022t221500z/manifest.json`
- Canonical authority: none. Read-only analysis; no database or Valkey writes.

## 7. Directory/package taxonomy overlay
- Aggregated the checksummed package-reference candidate table through the existing directory hierarchy. The run at `.tmp/atlas/directory-intelligence/dir-package-20261022t221500z/manifest.json` emits 7,308 unique directory/ecosystem/package rows and 0 rejected references (receipt SHA-256 `2338f49f6debdd03af47b26f67794700afa931531ad116a1d39609c4c3bcab17`; Arrow SHA-256 `ca987d01b45475056277348ac743f90599fc53a1fd0d15efe67ba776317ef812`).
- Independent checks matched both input receipts, verified output checksums and unique row keys, and reconciled root subtree totals to all 13,570 input references. Language counts are copied from the existing profile rollup; they indicate extension/profile mapping only, not parser support.
- This is a derived taxonomy candidate overlay. Package imports remain regex evidence; version counts reflect installed inventory metadata, not API/export compatibility. No feature labels, reviewed domain labels, canonical identities, workspace revisions, Graphify edges, database/cache/projection writes, or GPU execution are claimed.

## 8. Sparse CPU feature baseline
- Built `.tmp/atlas/directory-intelligence/dir-features-20261022t222500z/manifest.json` from the frozen directory rollup and package taxonomy candidate overlay. It contains 143,367 run-local directory ordinals, 151 run-local feature ordinals, and 386,373 positive sparse count values. Receipt SHA-256: `d471a66d89de65ed29f9d0700415a44ecd1c720efbb1ceb403e47e6cdc0a96f7`.
- Feature families are kept distinct: profile-language counts, path-role counts, and advisory package-import-candidate counts. Independent readback verified all three artifact hashes, ordinal continuity, unique/sorted sparse coordinate pairs, positive values, and the root package total (13,570); no duplicate sparse entries were found.
- A second run under `.tmp/atlas/directory-intelligence/dir-features-20261022t223000z/` reproduced the same receipt and all three artifact hashes, confirming deterministic output for these frozen inputs.
- This is a CPU-created sparse metadata baseline, not a semantic embedding matrix, reviewed feature-label matrix, or GPU benchmark. Ordinals are local to this receipt and cannot be used as canonical IDs or production GPU ordinals. CUDA/cuDF parity and measured GPU memory/latency remain untested.

## 9. GPU executor preflight
- Read-only WSL preflight found the configured RAPIDS interpreter and versions: Python 3.14.6, cuDF 26.6.1, cuGraph/cuML/cuVS 26.6.0, PyArrow 24.0.0, PyTorch 2.13.0, and CuPy 14.1.1; `nvidia-smi` reports an RTX 3060 Ti.
- llama-server `/slots` reports `is_processing=false`, but its configured model has 99 GPU layers. This is not proof the GPU is free. No GPU kernels or benchmark ran; follow the workstation GPU-preparation procedure and obtain operator approval before stopping/restarting the model runtime.

## 10. Bounded CPU/cuDF parity benchmark
- With operator approval, ran the existing VS Code GPU preparation task after confirming llama-server slot 0 was idle. It gracefully stopped only the `:8090` llama-server and unloaded Ollama; the guard reported 6,366 MiB free (minimum 1,536 MiB). After the benchmark, the existing `TurboQuant: Start (vision, CPU projector, :8090)` task restored `ornith-1.5-9b`, verified through `/v1/models`.
- `scripts/atlas/benchmark-directory-feature-aggregation-v1.py` read the frozen Arrow sparse feature artifact from `dir-features-20261022t223000z` (SHA-256 `bae4e7f561eda5fed1ad2fb94ef743c63b035c3f25476c851b359540cdc6186c`; 386,373 rows, 151 features). It compares NumPy CPU sums with cuDF `groupby(featureOrdinal).sum()`; aggregate SHA-256 matches exactly (`6449c5ce57db2d05b40e641f2f30a54100ebe6c01c4acb2761d2b7666fd55651`).
- Receipt `.tmp/atlas/directory-intelligence/gpu-parity-20261022t230000z/receipt.json` is `PARITY_PASS_ADVISORY_BENCHMARK`, checksum `ceac6f4fc42b1333e0a6f239a7d06c3b0b092c2641d21c6b9096270da5009477`; independent canonical checksum recomputation passed. Five measured repetitions yielded CPU median 1.704 ms and GPU median 8.638 ms (GPU about 5.07x slower for this small aggregation). Device free memory changed from 7,120 to 7,098 MiB during the run; peak allocation was not instrumented. This is a CPU/GPU arithmetic parity result, not an acceleration win, semantic tensor proof, or production projection.
- No PostgreSQL, Qdrant, Neo4j, Valkey, Graphify, or canonical state was written. The benchmark receipt is the only run output; full-corpus GPU suitability remains unproven.

## 11. Bounded typed multi-hop candidate graph
- `scripts/atlas/build-directory-package-graph-v1.mjs` joins the checksum-bound directory hierarchy and package-reference candidate artifact into a run-local graph. The run `.tmp/atlas/directory-intelligence/dir-graph-20261022t231500z/manifest.json` contains 13,352 nodes and 26,798 edges: 13,228 path-derived `CONTAINS` edges and 13,570 `USES_PACKAGE_CANDIDATE` edges. Receipt SHA-256 `81c86a8c8d44d24343d195d55ec9001341808607136dc18bfbe4b0028f21e219` independently verifies; Arrow output hashes are `e3d655eb8363c4823eb0ec80b8684ed151b23ebfa3ecdbac29314221ae22d48e` (nodes) and `1cbb066fbdd6e983c9a61b2db18a3cbbf4f0ebf66f1fbad801135b61eb1a856d` (typed edges).
- The bounded traversal from `packages/atlas-core/src/classification` reached the expected two-hop path `directory → external-lane.test.ts → npm:vitest`, with no fanout truncation. The import edge retains source SHA-256 and byte span; package-import evidence remains regex-derived and does not prove runtime usage.
- This is a scoped graph over files with package-reference candidates and their directory ancestors, not a whole-repository semantic graph. It has no AST symbols, calls, documentation links, reviewed feature labels, or canonical IDs. It does not establish broader multi-hop traversal quality or authorize cuGraph/Neo4j/Graphify projection. Three focused helper tests pass; no production stores were written.

## 12. Deterministic whole-tree directory summaries
- `scripts/atlas/build-directory-metadata-summaries-v1.mjs` emits exactly one deterministic metadata summary for each directory in the frozen inventory (143,367 total), using the sealed path rollup, sparse feature matrix, and direct package-reference aggregates. Run `.tmp/atlas/directory-intelligence/dir-summaries-20261022t235000z/manifest.json` binds the three input receipts and their artifacts; receipt SHA-256 `ec67ae3f546b14d67365e15b2200402c35a5a5d000ba030e254ddef8d33acc39` and 127,083,226-byte Arrow artifact SHA-256 `e2778c5b01b4f4ea3382f341946c1438c4fb4667df099e70930ba04a3cd6aecb` independently verify.
- Each row includes a deterministic text summary, explicit coverage status, missing-evidence list, per-row input digest, and summary checksum. Independent PyArrow readback confirmed all 143,367 rows, 12 columns, manifest/artifact checksums, and recomputed summary checksums for root, midpoint, and final path rows. Focused summary helper tests pass 2/2.
- Summary content is limited to inventory file/directory/byte counts, language-profile counts, path-role counts, and direct package-reference candidates. It does not summarize source text, declarations, AST symbols, runtime behavior, or reviewed domain labels; it is advisory context, not semantic source evidence or canonical authority. The whole filesystem denominator includes dependency/cache/generated trees and should remain role-aware in downstream retrieval.

## 13. Exact-revision AST observation overlay
- Reused `.tmp/atlas/admitted-snapshot-ast-prefill-20261016/cohort-8.jsonl` and its existing ast-grep receipt as an observation source. The receipt binds workspace revision `sha256:e24bb97187ea6394eeba457dd849915f570045b7a1867780fdc7aa9ea62b9acc`, materialized source snapshot `sha256:6288726b73626ae58905b5ebdea42e709cb1af67b3e16186bcd8b2b88a89d98b`, 8 source bindings, 111 rows, and `@ast-grep/napi@0.45.3`. A bounded independent audit confirmed all 111 spans decode within bounds and each current file and snapshot file matches its `source_revision`; all 8 files are current-byte matches. The existing `tree_node_occurrence_id` values are reused, not generated here.
- `scripts/atlas/build-ast-observation-graph-overlay-v1.mjs` extends the package candidate graph with directory→file containment and file→AST-observation edges. Run `.tmp/atlas/directory-intelligence/ast-overlay-20261023t001500z/manifest.json` has 13,478 nodes and 26,924 edges, including 111 `HAS_AST_OBSERVATION` edges. Receipt SHA-256 `3c0d0a5c9a288afdada529e31cbfa89206241e096e3e76727d617e4c1962ae44`; Arrow hashes independently verified by PyArrow. A bounded traversal reached 48 AST observations from the selected vector directory within two hops, with no fanout truncation.
- This does **not** resolve canonical symbols: the source receipt has zero canonical symbol IDs and zero symbol-registry resolutions. The graph labels these as `AST_OBSERVATION`, retains source/workspace revisions and exact spans, and forbids canonical promotion. It is a revision-bound syntax observation overlay, not `DEFINES`/`CALLS` truth or production Graphify evidence. Focused overlay and graph tests pass 5/5; no database, cache, Graphify, or projection writes occurred.

## 14. Whole-tree analysis-priority candidates
- `scripts/atlas/build-directory-analysis-priority-v1.mjs` applies a fixed, inspectable 0–100 **analysis-priority** rule to each file row in the frozen 1,367,024-path snapshot, emitting 1,218,191 file rows keyed only by the inventory ordinal. The Arrow artifact is `.tmp/atlas/directory-intelligence/analysis-priority/analysis-priority-20261022-pathmeta-v1/file-analysis-priority.arrow` (181,684,170 bytes; SHA-256 `c8efa6fc2ea5a9e5897b7f4f6a6e412fe09070d24a04dcc3ee7527679350096a`); manifest checksum `1057bacecb42a169cb2d619ec747427fab1b561721cd731d92c27e31bcd7f516`.
- Lane counts: 110,056 structural-analysis candidates, 308,417 dependency/package-metadata candidates, 7,781 metadata/document candidates, 18,920 other role-metadata candidates, and 773,017 audit-only paths. All dot paths remain audit-only; independent readback found zero dot-policy violations and matched every file ordinal to the source snapshot.
- This score is not probability, query relevance, a reviewed label, or a parser-support claim. All 1,218,191 rows remain `UNQUALIFIED_PATH_METADATA`, `sourceQualified=false`, and `editAllowed=false`. The snapshot has no workspace revision or Git-scope authority, so this artifact is only a prioritization proposal for analysis, not canonical ranking or production admission. Five deterministic/authority-boundary helper tests pass.

## 15. GPU feature-aggregation parity benchmark
- Compared a NumPy CPU oracle with cuDF aggregation over one derived row per file from the frozen analysis-priority Arrow artifact: 1,218,191 rows and five analysis lanes. Input checksum: `546547f4d45129192a5f771335e170f31f7f2716cf39c73130c124294cc73159`.
- CPU and GPU feature totals matched exactly (`parity=true`). Median aggregation times over five repeats were 14.904 ms CPU and 14.484 ms GPU (1.029x CPU/GPU). This is parity and a narrow microbenchmark only; it does not establish end-to-end acceleration because artifact loading, host/device transfer and peak GPU memory were not measured.
- Receipt `.tmp/atlas/directory-intelligence/gpu-parity/gpu-parity-dirprio-20261022-v2/result/receipt.json` passed independent canonical checksum verification (`82fafe79aa1385ea6d90f863e29e532ecd30764130d35180cde83aa8666ec8df`). Runtime: cuDF 26.6.1, NVIDIA GeForce RTX 3060 Ti. No production data or projections were written. The :8090 model service was restored and `/health` plus `/slots` returned healthy/idle.
- The first input serialization attempt is retained, not overwritten or deleted, under run `gpu-parity-dirprio-20261022-v1`; its Arrow file lacked a valid footer and the benchmark rejected it before executing. The successful retry used a fresh run directory.

## 16. Whole-filesystem inventory and Git membership overlay
- Refreshed the no-pruning physical path inventory at `.tmp/atlas/language-coverage/whole-repo-inclusive-20261022T204016Z/inventory.json`. Enumeration completed beneath the repository root without following links: 1,367,300 path rows, including 1,218,438 files, 143,396 directories including root, and 5,466 link-only entries. It includes dot paths, `.git`, dependency trees, generated/build output, caches, and model/binary artifacts. The path manifest contains 1,367,300 newline-terminated metadata rows (609,320,821 bytes; SHA-256 `2d7c8415b60f040eb3037e1cd4a2b911e3d5b9c6b6419822721bd8b6605a94af`). The inventory body checksum independently verifies as `6154c72b0e280996ddff8b57dc8ea2d5c8ac0071558bd31566d3c9d952b2437d`. No file contents were read or hashed by this inventory.
- Converted the frozen inventory through `scripts/atlas/build-directory-intelligence-snapshot-v1.mjs` to `.tmp/atlas/directory-intelligence/whole-repo-20261022t204016z/manifest.json`: 1,367,300 Arrow rows, 343,223,234 bytes, artifact SHA-256 `c277ea4449dc80ee6a80fcec78052a101f31f2f34ac9bd5ede3454642ef69bdf`, receipt SHA-256 `97a4c6db172c2e69604988cb04cb21966357caa2366c8d83fb9bec0e02d4c029`.
- Added a run-scoped Git membership overlay using the root repository and 11 discovered nested repository scopes. The overlay at `.tmp/atlas/directory-intelligence/git-scope/git-overlay-20261022-v5/manifest.json` joins all 1,367,300 frozen rows: 106,813 tracked, 190 untracked, 978,605 ignored, 132,830 repository-metadata, and 5,466 link-only rows; zero conflicts, unclassified rows, or unavailable nested scopes. Arrow SHA-256 `20f4e6df8ea869bbb259019e4ee1522af4667c685a11dacdb5c6f8b2931fee06`; receipt SHA-256 `f4f8e741d769e5c194a1fd080586db1e146226d6b502682ee5982cb29ed41050`.
- Git reported 785,178 paths not present in the frozen physical snapshot. Of these, 785,157 are behind inventory link entries, reflecting Git's traversal into linked targets while the inventory intentionally records links without following them. The remaining 21 are artifacts created after the frozen inventory (Graphify reports and prior run outputs); they are retained as post-snapshot deltas, not silently added to the frozen denominator. The inventory has no workspace revision and the Git overlay is not Graphify currentness evidence.
- The inventory maps 20 repository profiles and 371 grammar candidates, but parser-owner, fixture, span-validation, and compiler/LSP evidence remain unjoined (all zero verified in this inventory). Thus this establishes full path enumeration and Git-scope classification for the frozen snapshot, not parser support, source qualification, or production admission. Dot paths are recorded for audit and are never modified by this work.
- Focused Git-overlay helper tests pass 5/5; runner syntax check passes. Independent verification recomputed the inventory, snapshot, and overlay receipt checksums, the path-manifest checksum and row count, and both Arrow checksums/row counts. No datastore, cache, projection, Graphify, or source writes occurred.

## 17. Hierarchical Git-scope directory distribution
- Added `scripts/atlas/build-directory-git-rollup-v1.mjs` and its pure helper to combine the frozen path snapshot with the checksum-bound Git-scope overlay. The output is run-local and stores deterministic direct-child and subtree counts for tracked, untracked, ignored, repository-metadata, link-only, conflict, unclassified, and unavailable-nested-repository categories.
- Run `.tmp/atlas/directory-intelligence/git-rollup-20261022-v1/manifest.json` covers 1,367,300 source path rows, 143,396 directory rows, and 1,223,904 non-directory rows. Root totals equal the Git overlay: 106,813 tracked, 190 untracked, 978,605 ignored, 132,830 repository-metadata, and 5,466 link-only; no other category had rows. No unresolved parents. Artifact SHA-256 `7d5d95ed78bf89efd09302e25dca7b506101b66af8ce78e7022a955472c65fc1`; receipt SHA-256 `6eaf80927ae65d4de16271006dc2924b865274d6979c3c3f24bc466e533fa1d4`.
- Independent readback verified the receipt/artifact checksums, Arrow row count, root totals, and the direct-plus-child-subtree equation for all 143,396 directories (zero reconciliation errors). Eight focused Git overlay/rollup tests pass. The output remains `canonicalAuthority=false`, `sourceQualified=false`, with no workspace revision or Graphify qualification; this adds directory-level Git distribution, not source identity/currentness or parser coverage.

## 18. Physical-path embedding coverage and GPU parity
- The read-only embedding census at `.tmp/atlas/directory-intelligence/embedding-coverage-20261022-v3/manifest.json` joins the frozen physical path snapshot to PostgreSQL 18.4 in a repeatable-read, read-only transaction and rolls it back. It covers 1,218,438 physical files and 143,396 directories; 28,206 nonblank database paths were observed, 24,988 matched an exact normalized physical-file path, 3,216 remained unmatched, and two normalized database-path entries were ambiguous. Thirty-seven chunk rows had an empty path and were reported separately rather than assigned to a file.
- The database census found 274,465 chunk rows, 274,428 `content_embedding_768` rows, 57,243 `content_embedding` rows, zero row-owned `source_revision`, zero row-owned `workspace_revision`, and zero exact-proven packet-lineage/workspace-binding joins for either vector column. Therefore the result is `PATH_COVERAGE_WITH_LINEAGE_GAP`, not semantic-writer or source-coverage proof. The whole-tree path denominator includes dependency, generated, cache, model, and metadata files; the 2.05% root matching ratio must not be read as source-corpus parser/index quality.
- Manifest SHA-256 `f102557b6f381962ebefebf2475aad3c85eb175e809b5e1405bdacfdc02ee6d0` and the path Arrow, directory Arrow (143,396 rows), and JSONL artifact checksums independently verified. The path-level census reconciles to all nonblank-path DB chunks; unmatched and ambiguous paths do not contribute to directory totals.
- The existing six-node NetworkX/cuGraph PageRank fixture also passed in `.tmp/atlas/gpu-parity-20261022T211223109280Z/receipt.json`: identical rank order, maximum score delta `7.194331917148578e-7`, and `renumbered=false`. Receipt SHA-256 `cc9a71adc44ce860bf8f783e192a665acc79c4889d922aa7b1bb2b49f75566b9` independently verifies. This is fixture-only algorithm parity, not a production-graph benchmark or end-to-end speedup. The existing fixture bytes were restored, no persistent stores were written, and Ornith `ornith-1.5-9b` with vision was restarted and returned ready.
- Focused embedding coverage tests pass 3/3. The adapter explicitly withholds normalized-path collisions and excludes empty DB paths from physical attribution; neither behavior weakens revision qualification.

## 19. External embedding-lineage and workspace-binding census
- The v5 read-only census at `.tmp/atlas/directory-intelligence/embedding-coverage-20261022-v5/manifest.json` extends the historical v3 path report with separate counts for external packet-lineage and workspace-binding joins. It used PostgreSQL 18.4 in a repeatable-read, read-only transaction (`6893499:6893499:`) and rolled back. The manifest remains `canonicalAuthority=false`, `sourceQualified=false`, and `productionAdmission=false`.
- Across 274,428 `content_embedding_768` rows, 127,927 have one distinct `PROVEN` packet-lineage identity; 125,971 also match the lineage source reference; 2,843 have one distinct external workspace/digest/checksum binding snapshot; 123,127 have multiple workspace bindings; one lacks a binding; zero have conflicting lineage identities. None of the vector rows carries row-owned source revision, workspace revision, representation revision, or lineage checksum. External joins are diagnostic only: no selected/current workspace authority or source-byte readback was established.
- After exact physical-path matching, the report attributes 235,335 embedding chunks to 24,988 repository files. This differs from database-wide totals because 3,216 paths do not match a unique physical file and two normalized paths are ambiguous. The whole-tree denominator includes dependencies, generated files, caches, model artifacts, and metadata; it is not source-language coverage.
- Manifest `receiptSha256` is `cf8a80888e60f4f1f8cdf34ec9f9a1038f67c5430ed6b6ec2547d22501e79628`. The path and directory Arrow artifacts and JSONL census passed independent checksum and row-count verification. This refines the v3 finding: zero **row-owned exact-proven** joins remains true, while v5 identifies external lineage/binding candidates that still do not satisfy admission.
- No writer ran and no persistent store changed. Semantic-writer ownership, selected workspace authority, exact source-byte/digest agreement, and projection admission remain unproven.

## 20. Current-byte comparison for external binding candidates
- A bounded follow-up compared the 150 physical paths in v5 with one unique external lineage/workspace/digest/checksum tuple per path, using PostgreSQL 18.4 repeatable-read/read-only snapshot `6893500:6893500:` and hashing only the named regular files beneath the repository root. The transaction rolled back; symlink paths, path escapes, missing files, and files over 25 MiB would fail closed rather than be read.
- Current SHA-256 matched the external `content_digest` for 111 paths; 39 differed (33 `.ts`, 5 `.mjs`, 1 `.py`). These are path-level byte comparisons, not a count of embedding chunks (the v5 path rows attribute 2,843 chunks to these unique-binding candidates). The mismatches may represent source drift, stale bindings, or a digest-contract difference; this audit does not determine which. Even a match does not select a workspace authority or qualify AST/embedding lineage.
- Receipt `.tmp/atlas/directory-intelligence/source-binding-bytes-20261022T212831Z/receipt.json` has SHA-256 `1bbaa2a3d1a26636cde34124553933c3d4b5895c0b7b37375a4ab98a6f7a692c`; independent canonical checksum verification passed and its 150 row statuses reconcile to 111 matches plus 39 mismatches. It is explicitly `DIAGNOSTIC_ONLY_NO_AUTHORITY_SELECTION`, `sourceQualified=false`, and `productionAdmission=false`.
- No source or dotfile was edited, no database rows were changed, and no projection/cache was written. The 39 mismatches and absent selected-workspace authority remain blockers; do not backfill or promote from this comparison.

## 21. Binding mismatch versus committed source bytes
- Compared the 39 mismatching working-tree files with their `HEAD` blobs using the Git object reader. All 39 were clean in `git status`; 18 `HEAD` blobs equal current disk bytes but differ from the external binding digest, while 21 differ from both the current bytes and the external digest. This rules out uncommitted edits as the explanation for these mismatches, but does not distinguish stale workspace bindings from a different digest/input contract or another historical source revision.
- Receipt `.tmp/atlas/directory-intelligence/source-binding-head-compare-20261022T212918Z/receipt.json` checksum `0da05d91a3b708a1f8df68bc1011a82a9a9af6962fdf7699507704cc7ea10578` passed independent canonical verification. It is diagnostic only; Git `HEAD` is not treated as selected workspace authority. No source changes or persistent writes occurred.

## 22. Reconcile candidates to the selected frozen snapshot
- The existing `docs/reports/current-source-selection-input-v1.json` is a real owner-selection/readback record (`CURRENT_SNAPSHOT_PROVEN`, `OWNER_SELECTION_APPLIED_READBACK_VERIFIED`) for workspace revision `sha256:e24bb97187ea6394eeba457dd849915f570045b7a1867780fdc7aa9ea62b9acc`, but it explicitly has `canonicalAuthority=false`. Its referenced snapshot is `CAPTURE_VERIFIED_REQUIRES_PROCESSING_READBACK`, also noncanonical. This is selected frozen-snapshot evidence, not canonical source admission.
- The reconciliation receipt `.tmp/atlas/directory-intelligence/source-binding-snapshot-20261022T213114Z/receipt.json` matched all 150 candidate source refs to the snapshot and selected-input records: 150/150 path, source-revision, and content-digest matches. Of these, 111 current files also match the snapshot digest; 39 do not. The snapshot contains digest/length metadata, not immutable source bytes, so the 39 cannot be replayed from that snapshot artifact as-is.
- Receipt checksum `204a810c7c249d746a234e00091ffd813a94bd00fe6df95b911226c44a4e2650`. This improves the lineage investigation: a selected frozen snapshot exists for these refs, correcting the earlier “no selected snapshot” gap. It does not satisfy canonical authority, processing/readback, AST-span qualification, semantic-writer provenance, or projection admission. No database or source writes occurred.

## 23. AST lineage for current-byte-matching candidates
- The existing full-scope owner `scripts/atlas/audit-current-workspace-ast-lineage-v1.mjs` ran read-only against execution `74d50c86-8194-45ea-8c3d-61aab7ef83` and the exact scope/membership/repair-root receipts. It reconciled all 24,456 in-scope sources: 4,793 had any AST row, 2,295 had an exact workspace/source-revision/content-hash-qualified AST row, 19,663 lacked AST evidence, and the overall lineage gate remained `BLOCKED`.
- The focused follow-up for the 111 paths whose live bytes match the selected snapshot found 13 files with 46 AST rows by path, but zero with matching workspace ID, source revision, or source digest; zero files had an exact-qualified AST row. Observed rows are legacy/unbound path hits, not usable symbols. Receipt `.tmp/atlas/directory-intelligence/selected-source-ast-paths-20261022T213401Z/receipt.json` checksum `904ed5a5a133937a49147b38b0c43ca32fdc11382957ce1b13f8ab655da9352a` passed independent verification.
- This isolates the next production-hardening gap: the selected snapshot and current bytes can align, but persisted AST observations for these candidates do not. Do not join them into canonical symbols or generate qualified graph edges. A bounded fresh parse may produce advisory local spans; canonical persistence still requires its existing writer, provenance contract, and authorized readback. No database writes, Graphify refresh, or source edits occurred.

## 24. Live sidecar parser pass over matching source bytes
- The active `:8095` sidecar was healthy. A sequential local `/ast/chunk` pass handled the 111 current-byte-matching files: 100 returned complete results with all chunk spans within the original UTF-8 buffers; five Markdown/JSON inputs abstained before parsing; four YAML/SQL requests returned unsupported-language diagnostics; one TypeScript file returned a parser diagnostic; and `sveltekit-frontend/drizzle/schema.ts` timed out at 20 seconds. Thus 100/102 candidates advertised by the live extension vocabulary passed span validation. The two remaining advertised-language cases need separate timeout/diagnostic review.
- The live capability receipt advertises 14 extensions and eight languages—not the broader catalog or local profile count. It reports `treesitter-chunker` 4.0.0, `tree-sitter-language-pack` 0.9.0, and `ast-grep-py` 0.45.3; vocabulary revision is `sha256:4407f506bcdde65937a4a76c2239f49bea71a9df2be68687fa84de546be5c039`. `.sql` and `.yml` were not in the live vocabulary despite local mapping entries, so the runtime deployment/capability owner must be reconciled before claiming those languages are supported.
- Parse receipt `.tmp/atlas/directory-intelligence/nlp-parse-111-20261022T213643Z/receipt.json` checksum `a4cda29f0a8a5f26fe2db9769f562aa11869cc9a3eb88b4ae49a74cce79bb6f0`; capability reconciliation `.tmp/atlas/directory-intelligence/parser-capability-reconcile-20261022T213737Z/receipt.json` checksum `a8b9c391c45f6d2904dc7474413d9d9a5b831ddfc076baf55005ae4aa90b29ba`. The 8,196 chunks and 42,179 sidecar edges are advisory output; no edge resolution, canonical AST persistence, or symbol promotion is implied. No source or datastore writes occurred.

## 25. SIMDJSON bridge byte correctness and frozen JSONL parity
- Corrected the active SvelteKit `simdjson-bridge.ts` to enforce the 64 MiB input limit, native-path threshold, and byte telemetry using UTF-8 byte length rather than JavaScript UTF-16 code-unit count. This prevents multibyte inputs from bypassing the bound and makes telemetry reflect transport bytes.
- Added focused coverage for multiline Unicode JSON parity, byte telemetry, independently parsed JSONL records, malformed-record rejection, and a multibyte payload whose UTF-8 length exceeds the limit while its JS string length does not. With `SIMDJSON_REQUIRE_NATIVE=1`, all 5 bridge tests passed and the C++ native addon loaded from `simd-bridge/cpp/build/Release/tensorrt_bridge.node`.
- A frozen eight-row AST file-summary JSONL artifact (`.tmp/atlas/directory-intelligence/ast-summaries/ast-summaries-20261022-cohort8-v1/file-summaries.jsonl`, 38,251 bytes, SHA-256 `9bbca99474797b38656450cd82f04fa5c04096c92acb94f770667fdd0936ff85`) parsed with exact JSON-value parity through native SIMDJSON and `JSON.parse`. Across nine 30-pass measurements, median native bridge time was 12.109 ms versus 7.708 ms for `JSON.parse` (native/V8 speed ratio 1.571; 0.637 when expressed as V8/native). The bridge was slower on this small sample; it is not evidence of a speedup or production throughput.
- Independent receipt readback passed for `.tmp/atlas/simdjson-benchmarks/20261022T-simdjson-frozen-jsonl-parity-v2.json` (receipt SHA-256 `f8653532ff5d40c3481620ec070f4b94b7a2786d92acf6834c8a2382d3edbcfd`; input and addon hashes are recorded in the receipt). The v1 scratch receipt is retained but superseded because its shallow canonicalizer produced an invalid digest; v2 uses recursive key-sorted canonicalization. No database, cache, projection, model, or source-artifact writes occurred.
- This validates the bridge's bounded parser behavior and one local JSONL sample only. It does not prove the Rust N-API addon is wired into this owner, language coverage, full Graphify parsing, GPU acceleration, or semantic evidence admission. The GPU graph and feature-aggregation results remain the separate fixture/kernel-only parity evidence in sections 15 and 18.

## 26. Frozen root-source parser and AST-lineage matrix
- Joined the exact 24,456-row `repo:root` membership in snapshot `sha256:6288726b73626ae58905b5ebdea42e709cb1af67b3e16186bcd8b2b88a89d98b` to the admitted source list, live `:8095` route census, and repeatable-read/read-only AST lineage export. Every source path occurs exactly once in all three inputs; each AST row's source revision and content digest match the frozen snapshot. The membership checksum is `sha256:59b3f07ead8d796fbef31da5946b2bc0fd678fa6ab175d10df0d49361a16ff81`; the scope binds workspace revision `sha256:e24bb97187ea6394eeba457dd849915f570045b7a1867780fdc7aa9ea62b9acc` and execution `74d50c86-8194-45ea-8c3d-61aab737ef83`.
- The route census reports 23,127 `ROUTED` entries and 1,329 `NO_PARSER_RULE`. `ROUTED` is only a route candidate, not proof that extraction ran or parsed successfully. The live sidecar authority revision is `sha256:4407f506bcdde65937a4a76c2239f49bea71a9df2be68687fa84de546be5c039`.
- AST lineage classes: 19,663 absent, 2,295 revision-qualified, 2,058 missing workspace binding, 389 source-mismatched, 46 stale-other-revision, and 5 revision-missing. The wired-provider capability census reports 10,903 eligible/not traversed, 1,861 parser unavailable, 882 legacy producer rows unqualified, 1,162 parsed but not revision-qualified, 10 revision-qualified AST, and 9,638 not AST eligible. These are distinct from parser-run outcomes: the lineage audit did not consult a parse-failure ledger and did not join symbol resolution.
- The matrix and independently checked run manifest are under `.tmp/atlas/parser-coverage/20261022T-parser-coverage-v2/matrix/`; manifest SHA-256 `695adc24f254fe677ed08f1509d08ec51ada56ad58ed5fae5e3466ddeb65dd68`; matrix rows SHA-256 `16f93656a4ff07cdd6083b084a15d6e93c4e5d18246954a0675911c83f1bc9ca`. The builder rejects duplicate/missing membership, stale source revision/digest, and input/row receipt checksum mismatches. Four focused tests pass.
- This is a derived advisory join, not a canonical source-admission receipt. The underlying snapshot remains `CAPTURE_VERIFIED_REQUIRES_PROCESSING_READBACK`, canonical authority is false, and 1,086 nested-repository sources are outside this root AST/route scope. No Graphify refresh, database mutation, cache/projection write, source edit, or parser-failure classification was performed. A route census was also emitted to the default `docs/reports/source-parser-route-census-2026-10-22.{json,md}` paths by an initial invocation that did not parse spaced CLI options; these untracked report copies are retained, not treated as authoritative inputs.

## 27. Revision-bound live parser sample
- The prior 111-file sidecar receipt was not reused because its embedded execution ID does not match the frozen scope. A fresh sequential `/ast/chunk` sample selected the first deterministic root source for each of ten live-routed extensions, after checking exact snapshot revision, SHA-256 content digest, and byte length against current disk bytes. The endpoint was the existing CPU NLP sidecar at `:8095`; its health response reports `torch=false`, `cugraph=false`, and `cuvs=false`, so this is not GPU parsing evidence.
- Six of ten samples returned no diagnostics and valid spans (`.go`, `.java`, `.js`, `.mjs`, `.mts`, `.rs`). Four returned parser diagnostics but still had valid spans (`.cjs`, `.py`, `.svelte`, `.ts`). Across all samples, 81 returned spans were replay-checked against the exact source bytes, with zero bounds or UTF-8-boundary errors. The four diagnostic-bearing results are not interpreted as source defects, and a one-file sample does not validate a language or its full extension population.
- The rerunnable-source details are recorded without retaining source text in `.tmp/atlas/parser-coverage/20261022T-parser-coverage-v2/live-parser-sample-v2.json`; checksum `33d63268291ee2442ab01ad8a8e1d94e7f2c3ab70c8dd93fe6807732566add3a`. Independent verification rehashed all ten source files, confirmed the snapshot/matrix bindings, checked the receipt checksum, and replayed all 81 spans. This remains a small advisory sample; complete per-language parse coverage, compiler/LSP checks, symbol resolution, and canonical AST persistence remain unproven.

## 28. Profile-to-source language validation join
- Reused the existing checksummed language inventory (`atlas.language-coverage-inventory.v2`) rather than adding a second profile catalog. `.tmp/atlas/parser-coverage/20261022T-parser-coverage-v2/language-validation-join-v1.json` binds that inventory, the 24,456-row source matrix, and the live parser sample; its `joinSha256` is `70bbe0141de0846259f95cd02332511f2b26089f4a5740b848581c7e3945ad3e`, with 20 profile rows and language-row export SHA-256 `c517ccef8a8b2a0db6c8268fb866496b9feb76e3eaa88b0b2f5413a10744cd55`.
- The join maps 24,453 root sources to a unique existing profile; three `.h` sources stay explicitly `UNMAPPED_PROFILE` rather than being guessed as C or C++. Counts conserve exactly to the frozen 24,456 root rows. Profile `fileCountInCorpus` values refer to the full physical inventory and are reported separately from this root-source denominator.
- It keeps grammar catalog candidate, route status, AST lineage/capability, and sampled parse outcome as separate dimensions. The ten live samples cover six diagnostic-free and four diagnostic-bearing files, not full language support. Parser owner/version is still `NOT_JOINED_TO_INVENTORY`; compiler/LSP evidence is `NOT_JOINED_TO_RUN_EVIDENCE`. All remain advisory, with no canonical IDs, source admission, or production writes.
- Four focused join tests pass, including ambiguous profile, unknown extension, stale sample revision, checksum tampering, and explicit grammar-candidate-versus-validation distinctions.
