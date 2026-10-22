# Tasks: Parent Atlas source-qualified corpus admission

Latest continuation (2026-10-21): operator-approved 8095 restart activated the 1,000,000-character AST request bound. Live replay of the exact 239,212-byte `route-feature-map.ts` returned 10 chunks with matching revision and in-bounds spans. The bounded scan was pinned to the admitted snapshot; its page contained 7 completed sources and one partial because NLP still skips files over 50,000 bytes. The next page and two continuation pages verified 24 more sources, all providers complete, zero failures, and zero datastore writes. Latest cursor `sveltekit-frontend/src/lib/server/atlas/runtime/trtllm-pytorch-runtime.spec.ts`; receipt `.tmp/atlas/indexed-source-continuation-1792604683974.json`. Keep frozen-corpus completion and admission open.

Eight subsequent bounded pages verified 64 additional sources with every provider complete, zero failures, and zero datastore writes. Cursor `sveltekit-frontend/src/lib/server/atlas/tensors/semantic-corpus-bundle-v1.ts`; receipt `.tmp/atlas/indexed-source-continuation-1792604776945.json`. The earlier large-file NLP partial remains outstanding and must be included in the final per-provider coverage denominator.

The next continuation verified 120 more sources, then stopped at `sveltekit-frontend/src/lib/server/data/legal-seed-data.ts` (158,852 bytes), with NLP status `SKIPPED_SOURCE_OVER_50000_BYTES`. The continuation runner left that page unverified and did not advance its verified cursor past `sveltekit-frontend/src/lib/server/config/service-urls.ts`. Stop receipt `.tmp/atlas/indexed-source-continuation-1792604906008.json`; partial page `.tmp/atlas/indexed-source-batch-1792605272403.json`. Do not treat the source as complete or omit it; resolve the provider size contract or retain an explicit partial-stage record before advancing.

Rules for every task: no production DDL, database writes, vector writes, cache promotion, or model training without separate authorization. Do not commit or push. Do not rerun completed parsing experiments unless a gate needs it.

## Phase 0 — Inventory and reconcile existing work

- [ ] 0.1 Read the existing OpenSpec changes, `docs/repo-analysis/atlas.md`, the AST V2 contract, feature-identity drafts, corpus manifests, writer receipts, and retrieval contracts.
- [ ] 0.2 Build an implementation matrix: task → source path → proof receipt → status. Status vocabulary: TESTED, DIAGNOSTIC, DRY_RUN, APPLIED, READBACK_PROVEN, ADMITTED.
- [ ] 0.3 Mark prior work DONE only where its own acceptance criteria are met.
- [ ] 0.4 Inventory runtime-imported dependencies across Node, Python, Rust, Node-API, PyO3, CUDA, RAPIDS, and PostgreSQL, with native transitive libraries. Record other installed packages in a separate lightweight manifest without scanning all of `node_modules`.

Gate: EXISTING_WORK_RECONCILED

## Phase 1 — Svelte LSP qualification of the frozen snapshot

- [x] 1.1 Verify all 161 files against the pinned external-dependency manifest: installed `@sveltejs/kit` 2.59.1 has zero hash/byte-length mismatches. Receipt `.tmp/atlas/sveltekit2-code-analysis/manifest-hash-verification-v1.json`. This is a separate external-dependency corpus, not selected workspace evidence.
- [ ] 1.2 Preserve the 159 supported non-empty AST results and 6,310 chunks. Record `package.json` (unsupported), the empty `conflict.js`, and the two recoverable syntax diagnostics separately.
- [x] 1.3 Inspect the Svelte config, declared and installed dependencies, TypeScript config, workspace resolution, and language-server initialization. The frozen copy has no package lock; its source/config hashes were verified across 25,544 files. After linking installed dependencies and generating `.svelte-kit/tsconfig.json`, the full-project TypeScript-plugin `documentSymbol` still timed out after 60 seconds. A later cold request timed out after 306.9 seconds, and a repeated request on the same server timed out after 60 seconds (`.tmp/atlas/prepared-svelte-lsp-warm-1792554994675.json`). The 35-symbol result came from a smaller isolated control, not the frozen project. An isolated Vite config load failed resolving `unocss/vite`, but the Svelte config subsequently loaded; this is not proven to cause the symbol timeout. No root cause is established.
- [ ] 1.4 Create an isolated disposable environment that matches the frozen project. Keep hashes and configuration identical.
- [ ] 1.5 Reproduce the 35-symbol result on exact component bytes under a dependency- and project-qualified frozen configuration. The existing 35-symbol control is diagnostic only; full-project plugin probes timed out. Record initialization, project diagnostics, symbols, source revisions, original-file spans, timeouts, and elapsed time.
- [ ] 1.6 Test failure behaviour when required dependencies are absent.
- [ ] 1.7 Keep embedded TypeScript and NLP results independently valid if LSP fails.
- [ ] 1.8 Do not mark the original snapshot LSP-qualified until it passes in the frozen environment.

Gate: SVELTE_LSP_SNAPSHOT_QUALIFIED

## Phase 2 — Bounded source and documentation inventory

- [x] 2.1 Rebuild and verify the five-page documentation manifest, 233 chunk records, and corpus checksum `sha256:54b90ff6a5ed735ce054d024eee073a5917ed3bc2b18953b58f90d50263a2b77`. Receipt `.tmp/atlas/sveltekit2-docs-corpus-analysis/manifest.json` remains `MANIFEST_VALID`, with no page-coverage gaps and zero datastore writes. This covers only that pinned manifest.
- [x] 2.2 Resume the `src/lib/server` diagnostic scan from the last independently verified cursor. Verified the checkpoint checksum, then completed eight more exact-snapshot sources. Receipt `.tmp/atlas/indexed-source-batch-1792552543568.json`; independent source/checksum readback `.tmp/atlas/indexed-source-batch-1792552543568-independent-readback.json`. Next cursor: `sveltekit-frontend/src/lib/server/analysis/entity-extraction.ts`; task 2.4 remains open.
- [x] 2.3 Reconcile every saved page against actual receipts and source bytes. The continuous chain has 49 pages / 392 unique sources through the latest receipt, including its eight new sources. All matching saved successful reports are accounted for; the previously accumulated 400/50 and 408/51 totals were manual overcounts. Artifact: `.tmp/atlas/indexed-source-server-coverage-chain-v1.json`, generated by `scripts/atlas/audit-indexed-source-coverage-chain-v1.mjs`. This proves diagnostics/readback of local receipts, not durable AST admission or exhausted scope.
- [ ] 2.4 Continue bounded pages until the frozen inventory is exhausted.
  - 2026-10-20 continuation: seven additional clean pages and a successful one-worker retry of the eighth page bring the independently verified chain to 57 pages / 456 unique sources. Latest receipt `.tmp/atlas/indexed-source-batch-1792554039014.json`; next cursor `sveltekit-frontend/src/lib/server/api/response-helper.ts`. The original eighth page stopped on an NLP timeout for `api-registry.ts`; `.tmp/atlas/api-registry-nlp-bounded-retry-v1.json` independently completed all four revision-bound passes in 46.9 seconds, then the whole page passed at concurrency 1. The earlier failed receipt is preserved and no gap was skipped. Reusable continuation: `scripts/atlas/continue-indexed-source-batches-v1.mjs <verified-report> <max-pages> <workers:1..2>`.
- [ ] 2.5 Keep per-file source hashes, language, parser status, diagnostics, chunk counts, and receipts.
- [ ] 2.6 Keep datastore writes at zero during the scan.
- [ ] 2.7 Do not merge dependency, workspace, and documentation evidence into one admission class.
- [x] 2.8 Freeze the complete directory denominator from the frozen source files plus every source-binding row in one repeatable-read, read-only transaction. Corrected manifest `.tmp/atlas/indexed-source-frozen-cohort-1792556680378.json`: 3,109 snapshot files and 3,109 source references have bindings; 2,682 meet the exact Graphify source match and are scan-eligible; 427 are explicitly excluded because no exact Graphify match exists; zero snapshot-only files, binding-only files, or duplicate identities. The older `.tmp/atlas/indexed-source-frozen-cohort-1792555861461.json` is preserved but superseded: its inner Graphify join omitted the 427 unmatched bindings from its denominator. Historical completed pages are reconciled against the corrected eligible subset. The new snapshot capture occurred during the scan, not at the original scan start.
- [x] 2.9 Add exact frozen-manifest pagination and independently verified receipt reuse on incomplete-page retries. Live receipt `.tmp/atlas/indexed-source-batch-1792556001276.json` reused all eight successes with no provider executions. Cache reuse rejects changed source bytes, revisions, snapshot, provider status, checksum, or Svelte profile. New continuation invocations accept the frozen cohort as their optional fifth argument.
- [ ] 2.10 Emit the final exhausted-cohort outcomes manifest and consolidated totals, then stop. The implemented coverage audit already emits intermediate per-file outcomes and clean/recoverable/unknown parse counts; completion remains open until all 2,682 selected sources are verified. The active continuation predates the new frozen-manifest flag; verify its output against the frozen cohort and use the flag on its next resume.
- [x] 2.11 Read-only source/lineage cohort check: across all 274,465 `codebase_chunk_index` rows, `source_revision`, `workspace_revision`, and `representation_revision` are all absent; 274,428 rows have vectors. Thus no chunk row currently qualifies through those fields. A separate non-random 4,000-row `atlas_source_refs` sample had 3,352 current-disk byte matches and 648 mismatches; those matches are not frozen-snapshot or revision qualification and do not create an eligible cohort. Receipts: `.tmp/atlas/corpus-clustering-v1/p1-revision-counts-current.txt` and `.tmp/atlas/corpus-clustering-v1/p1-lineage-probe-current.json`. Read-only transaction; zero writes.

2026-10-21 verified checkpoint: `.tmp/atlas/indexed-source-batch-1792559106451.json` extends the continuous chain to 136 pages / 1,088 eligible sources. The corrected cohort reconciliation reports 1,084 clean parses, four recoverable diagnostics, zero unknown parse states, 427 explicit exclusions, and 1,594 eligible sources remaining. Independent coverage receipt `.tmp/atlas/indexed-source-server-coverage-chain-v1.json` reports no issues and zero production writes; the checksummed per-file JSONL records source/provider details. Earlier failures remain preserved; the recovered classifier page passed before continuation. Focused tests pass 39/39; OpenSpec strict validation passes. The active diagnostic continuation remains in progress; full completion and admission remain open.

Gate: FROZEN_CORPUS_DIAGNOSTICS_COMPLETE

## Phase 3 — AST V2 persistence ownership

- [ ] 3.1 Read the approved AST V2 identity and writer contract.
- [ ] 3.2 Freeze deterministic node IDs, parent constraints, source revisions, workspace revisions, and conflict rules.
- [ ] 3.3 Verify existing PostgreSQL schema ownership and migration dependencies.
- [ ] 3.4 Test the writer transaction in a disposable PostgreSQL 18.4 instance.
- [ ] 3.5 Prove exact source readback and checksum equality.
- [ ] 3.6 Verify rollback, retries, idempotency, tombstones, and revision conflicts.
- [ ] 3.7 Require explicit authorization before any production persistence.
- [ ] 3.8 Keep external-dependency AST facts separate from workspace-qualified facts.

Gate: AST_V2_WRITER_READBACK_PROVEN

## Phase 4 — Ontology, domains, capabilities, and feature labels

- [ ] 4.1 Inventory the nine technical domains, observed source-domain strings, ontology groups, entities, linked tuples, concept IDs, and product capability labels. Count each directly in the live database. Do not assume the reported 70,140 terms form one vocabulary.
- [ ] 4.2 Record each vocabulary's owner, revision, and meaning.
- [ ] 4.3 Keep `normalizeDomainLabel` as a closed-vocabulary technical-domain normalizer. Do not treat its fallback as semantic classification.
- [ ] 4.4 Propose typed crosswalks between domain, capability, ontology concept, and source feature. Keep them advisory until reviewed.
- [ ] 4.5 Reconcile existing structural, product, ontology, alias, and mapping owners. The operator approved the existing V2 local/canonical/crosswalk design for drafting and disposable validation; production application remains gated. Do not introduce another canonical registry.
- [x] 4.6 Align the feature-label Drizzle declaration with V2: `canonical_feature_id` references `atlas_feature_concepts`; checks and indexes are declared in Drizzle. The admin read path selects the V2 canonical ID with an explicit output alias.
- [x] 4.7 Test identity collisions, crosswalk and label revisions, concurrent inserts, withdrawal/restoration, transaction rollback, rollback refusal with populated tables, and empty-schema rollback in disposable PostgreSQL 18.4. Receipt: `.tmp/atlas/feature-identity-v2-disposable-proof-v1.json` (19 checks). This does not prove an application-level review writer or production deployment.
- [ ] 4.8 Keep unreviewed mappings and labels advisory.

Gate: FEATURE_ONTOLOGY_IDENTITY_QUALIFIED

## Phase 5 — Embedding provenance

- [ ] 5.1 Trace every writer of `content_embedding_768`, including dynamic SQL and non-TypeScript writers.
- [ ] 5.2 Reconcile the 274,428 vector census with narrower historical cohorts using exact SQL predicates.
- [ ] 5.3 Inspect writer receipts and model recipes.
- [ ] 5.4 Expand the bounded raw-versus-title-and-text reproduction audit.
- [ ] 5.5 Detect repeated vectors, placeholders, invalid norms, and missing revisions.
- [ ] 5.6 Record encoder identity, model digest, source revision, input recipe, and representation revision where they exist. Keep historical unknowns as UNKNOWN; never fabricate provenance.
- [ ] 5.7 Prove a newly qualified embedding path alongside the legacy corpus. Do not replace the legacy corpus.

Gate: SEMANTIC_768_PROVENANCE_QUALIFIED

## Phase 6 — Retrieval and canonical evidence

- [ ] 6.1 Verify the running MCP dense-search path and its timeout behaviour.
- [ ] 6.2 Preserve canonical candidate identity through PostgreSQL, Qdrant reranking, and ContextManifest.
- [ ] 6.3 Report NULL or UNKNOWN identity comparisons separately from proven mismatches.
- [ ] 6.4 Test exact vector and candidate identity readback.
- [ ] 6.5 Count one semantic logical lane as one vote, regardless of executor count.
- [ ] 6.6 Verify bounded fallback and evidence references.
- [ ] 6.7 Prove one complete canonical retrieval vertical slice.
- [ ] 6.8 Do not populate production Qdrant mirrors without separate approval.

Gate: CANONICAL_RETRIEVAL_SLICE_PROVEN

## Phase 7 — Admission and operations

- [ ] 7.1 Validate deployed service versions and capabilities.
- [ ] 7.2 Establish health checks, request budgets, structured errors, and monitoring.
- [ ] 7.3 Verify Graphify lifecycle receipts independently of snapshot execution status.
- [ ] 7.4 Require authorized production writes with independent readback.
- [ ] 7.5 Verify replay, rollback, and stale-revision rejection.
- [ ] 7.6 Produce a ContextManifest with canonical evidence identity and checksum.
- [ ] 7.7 Keep ACE, GPU tensor caches, QLoRA, and downstream training gated until their own criteria pass.

Gate: END_TO_END_ADMISSION_ELIGIBLE

## Deliverables

- [ ] D1 Task-to-existing-implementation crosswalk (Phase 0)
- [ ] D2 Runtime dependency and file-type inventory (Phase 0)
- [ ] D3 Svelte LSP qualification receipt (Phase 1)
- [ ] D4 Source documentation coverage receipt (Phase 2)
- [ ] D5 AST writer readback receipt (Phase 3)
- [ ] D6 Ontology and feature identity decision report (Phase 4)
- [ ] D7 Embedding provenance receipt (Phase 5)
- [ ] D8 Canonical retrieval vertical slice receipt (Phase 6)
- [ ] D9 Final admission matrix (Phase 7)
- [ ] D10 Update `docs/repo-analysis/atlas.md` with verified progress and receipt references
- [ ] D11 Run OpenSpec validation and focused tests

## Implementation sequence

1. Inventory and reconcile.
2. Repair the Svelte LSP qualification in a reproducible frozen environment.
3. Finish bounded source coverage.
4. Prove AST V2 persistence in isolation.
5. Resolve ontology and feature identity.

## 2026-10-20 acceptance follow-up

- [x] Generate and independently verify a complete read-only review manifest from one repeatable-read database snapshot: 4,748 mapping rows, all 319 multi-source IDs, 94 dotted IDs prioritized individually, and seven product-feature candidates. Complete occurrence lists replace sample-only references. All equivalence states remain UNKNOWN; no canonical IDs or mappings are minted. Inputs, query, manifest, and readback are checksummed under `.tmp/atlas/identity-review-*-v2.*`.
- [x] Harden the existing context assembler prototype against placeholder/malformed workspace revisions, empty evidence, and conflicting duplicate identities. Exact duplicate evidence is deduplicated deterministically. This remains pure proposal assembly; independent source/vector/identity joins and ContextManifest integration remain open.
- [ ] Complete authenticated admin Playwright, including non-admin denial and read-only behavior. Unit/static tests alone do not satisfy this acceptance criterion.
- [ ] Qualify full Svelte TypeScript-plugin LSP in the frozen project. Host-only LSP plus separate embedded-TypeScript parsing remains available; direct-provider and batch defaults now agree on host-only mode.
- [ ] Finish the frozen corpus cursor scan, embedding lineage audit, and one qualified retrieval-to-ContextManifest slice.

Acceptance report: `docs/reports/parent-atlas-corpus-admission-acceptance-20261020.md`. Production writes, P20 lifting, Qdrant repairs, cache promotion, training, commit, and push are outside this execution.

### Full Svelte project and LSP transport follow-up

The disposable project passed `svelte-kit sync` and before/after verification of 25,544 original files (473,214,507 bytes, zero hash mismatches). The full Svelte TypeScript-plugin request still timed out after loading a 4,865-file project, including 922 Svelte files. The source/config copy was not altered to reduce that project. Receipt `.tmp/atlas/frozen-svelte-project-lsp-1792553467665.json` preserves the initial generated-config control; `.tmp/atlas/frozen-svelte-project-lsp-1792553869591.json` preserves the repeat after the LSP transport fix. Both remain unresolved, diagnostic only.

Separately fixed the existing JSON-RPC transport: server requests now receive configuration/workspace replies, source-edit requests are rejected, and server/client IDs cannot accidentally resolve each other's pending requests. The fake-server regression and focused LSP/batch/Svelte tests pass 23/23. The real Svelte timeout recorded zero server requests, so this protocol defect is not claimed as its cause. Vite configuration import failure is recorded in `.tmp/atlas/frozen-svelte-vite-config-load-v1.json`; further full-project environment/TypeScript startup diagnosis remains necessary.
6. Prove embedding and retrieval lineage, connecting one canonical chunk through encoder, PostgreSQL, Qdrant, MCP, and ContextManifest.

## 2026-10-21 CPU clustering slice (unlabeled, advisory)

- [x] A (partial) Frozen 19,990-row sample from `codebase_chunk_index` (deterministic md5 order, 768-d, L2-normalized float32, 10 content-hash duplicates removed). Cohort: UNQUALIFIED_COMPARISON, since 0 chunk rows carry source or workspace revisions. Receipt: `.tmp/atlas/corpus-clustering-v1/sample-receipt.json`.
- [x] B Bounded CPU KMeans (sklearn, k=32, seeds 42/7/123). Stability ARI 0.58–0.69. Neighbourhood same-cluster 0.709 vs random 0.037. Assignments are UNLABELED. Receipt: `.tmp/atlas/corpus-clustering-v1/kmeans-cpu-baseline-receipt.json`.
- [x] B2 Expanded CPU stability sweep on the exact 19,990 × 768 F32 matrix: KMeans, MiniBatchKMeans, and custom spherical KMeans; `k=16/32/64/128`; three seeds; `n_init=5`. No GPU or data-store writes. Spherical `k=32` had mean pairwise ARI 0.733; all cosine silhouettes were 0.059–0.082, so this is not taxonomy or retrieval-quality proof. Receipt `.tmp/atlas/corpus-clustering-v1/kmeans-stability-sweep-v2-1792557216.json`; report `docs/reports/parent-atlas-lsp-clustering-diagnostic-20261021.md`.
- [~] C GPU readiness probe is read-only: RESOURCE_BLOCKED (Windows nvidia-smi 1071 MiB free, :8090 held). No GPU fit. Receipt: `.tmp/atlas/corpus-clustering-v1/gpu-readiness-receipt.json`.
- [x] Symbol-registry coverage, application corpus: 4,584 of 6,640 files VALID_SYMBOLS = 69.04% (below 80/90). Receipt: `.tmp/atlas/symbol-coverage-app/summary.json`.
- [ ] D ACE JSON packets, not started.
- [ ] E typed DAG synthesis, not started.
- [ ] F MCP cluster lookup, not started.
- [ ] G proof and atlas.md update for D–F, not started.
- [ ] SOM 20×20 comparison, not rerun in this slice.
- Blockers: qualified cohort is empty (no revisions in chunk index); production admission needs independent receipts; GPU run needs a resource window.

## 2026-10-21 clustering diagnostic bridge (D1-D5)

- [x] D1 audit of the frozen experiment. Receipt: .tmp/atlas/corpus-clustering-v1/d1-audit-receipt.json. Caveat: generated run artifacts dominate part of the sample.
- [x] D2 CPU baselines and source-held-out evaluation. Receipt: .tmp/atlas/corpus-clustering-v1/d2-baselines-receipt.json. Cohort stays UNQUALIFIED_COMPARISON.
- [x] D3 symbol-registry classification. Receipt: .tmp/atlas/symbol-coverage-app/symbol-coverage-classification-v1.json. Finding: const declarators are kind fragment and not counted; projected coverage about 81.7% if the rule changes. Rule not changed; decision pending.
- [x] D4 diagnostic ACE proposal adapter. Module: scripts/atlas/clustering-ace-diagnostic-adapter-v1.mjs. Run on 50 real rows: 0 admission-eligible.
- [x] D5 tests: 11 of 11 pass. Report: docs/reports/clustering-ace-diagnostic-report-2026-10-21.md.
- [ ] Phase E DAG synthesis, not started.
- [ ] Phase F MCP cluster lookup, not started.
- [ ] Phase G proof update, partly done here; E and F still open.
- Blockers: no revision-qualified cohort; GPU needs a resource window; coverage rule and threshold decisions; production admission receipts.

## Handoff 2026-10-21 (session break)

Read this first. Nothing below is production admission.

### State at break
- Branch chore/parent-atlas-session-2026-10-17. Commit and push scope: files at or under 10 MB. Excluded: docs/reports/document-governance-registry-v2.json (11.0 MB, modified) and four submodule pointers (claude-mem, granite-docling-258M, models/embeddinggemma_300m, turbovec).
- Symbol coverage v2 finished on the full application corpus (6,640 files): 82.29% all-file, 82.49% parser-eligible. v1 remains 69.04%. Summary: .tmp/atlas/symbol-coverage-app-v2/summary.json. No run is in progress.
- Clustering diagnostic bridge D1-D5 done (CPU only). Adapter tests 11/11 pass.
- Svelte LSP: bounded fixture qualified (deterministic, CRLF-equivalent, valid spans for real declarations). Real application files show inverted synthetic spans on 3 of 5, so no full Svelte run yet.
- Source-byte cohort: 14,982 of 19,990 sample rows match current disk bytes. Byte verification only; UNQUALIFIED (no workspace revision, no admitted snapshot).

### Decisions waiting on you
1. Threshold: 80 or 90. v2 clears 80 but not 90.
2. Adopt v2 as the reported rule. It is lenient: it counts local variable declarators.
3. Approve a full Svelte LSP run with per-symbol span filtering (about 1 to 2 hours, read-only). This is the only route to the remaining 933 Svelte files.
4. GPU cuML window (requires stopping :8090). Not approved. Not needed for the CPU result.
5. Phase E (typed DAG) and Phase F (MCP cluster lookup) are not started.

### Resume
- Test the diagnostic adapter: node --test scripts/atlas/clustering-ace-diagnostic-adapter-v1.test.mjs
- Read the coverage result: .tmp/atlas/symbol-coverage-app-v2/summary.json
- Read the LSP fixture result: .tmp/atlas/svelte-lsp-fixture-v1/probe-receipt.json
- Next safe step: span-filtered Svelte LSP pilot on 20 files, then decide on the full run.

### Do not
- Restart or stop :8090, or allocate CUDA memory.
- Write to PostgreSQL, Qdrant, or any cache. Backfill source revisions (deferred until after Phase 20).
- Treat the clusters as a domain classifier or as ACE-admitted evidence.
- Treat the 82% figure as the registry gate without the threshold and rule decisions.
- Commit or push beyond the approved scope.

### Caveats for whoever picks this up
- Earlier notes said the chunk index has no revision fields. The columns exist, but all source, workspace, and representation revision values are null. file_content_hash is populated.
- The Svelte classifier counts markup elements and import bindings as definitions.
- Full-snapshot Svelte LSP probes time out at 60 s. The fixture does not.

Latest continuation update (2026-10-21): page 139 / 1,112 eligible sources independently reconciled; 1,108 clean parses, four recoverable diagnostics, 1,570 remaining, zero failures or writes. Page receipt `.tmp/atlas/indexed-source-batch-1792559195346.json`; outcome checksum `sha256:843d8bf48b989c8f99a007599ed58c4ca65ef8a8f33058731995d25ede6423a1`. Keep task 2.4 open until the frozen eligible cohort is exhausted.

Latest live large-source replay (2026-10-21): optimized V2 AST enrichment to index Tree-sitter nodes once and search only matching node types/spans, instead of walking the complete syntax tree for every chunk. The sidecar was reloaded under the operator-approved 8095-only window; `/health` reports V2 revision `sha256:c19f7780f17db80c876f16ff260a2cb313009bde969dd0f6dd32630f52e723d1`. The exact admitted-snapshot `features/ai/ace/context-assembler.ts` bytes (328,372 bytes; source revision `sha256:c485b8289da7271b49518bb53e6eb87bd6a9e00f9582f0748c957c93bf2a4634`) now return 1,595 native chunks, 0 duplicate spans, 0 out-of-bounds spans, and 1,123 ast-grep matches; single-source provider receipt `.tmp/atlas/indexed-source-provider-diagnostic-1792609539529.json` verifies Tree-sitter/ast-grep and LSP completed. NLP remains `SKIPPED` because the source exceeds the existing 300,000-character limit, so the provider result and containing batch are still partial. AST summary receipt `.tmp/atlas/ast-chunk-keyed-map-v4-2026-10-21T19-02-57-822Z-context-assembler.ts.json`; no canonical writes. Do not advance the verified scan cursor past the last all-provider-complete page (`evidence/worker-ocr.ts`); resolve the large-source NLP contract and the existing predecessor-receipt gap before claiming continuous cohort coverage.

Large-source retry update (2026-10-21): optimized the nested AST-grep process, `/ast/chunk` request, and per-source batch timeouts after the initial bounded retry still hit the old 180-second child limit. The next page receipt `.tmp/atlas/indexed-source-batch-1792610390028.json` reports 7 completed, 1 partial, 0 failed, 0 excluded, and `datastoreWritesPerformed:false`. The 328,372-byte `context-assembler.ts` now completes Tree-sitter/ast-grep and LSP (1,595 native chunks; 1,123 ast-grep matches); NLP remains `SKIPPED_SOURCE_OVER_300000_CHARS`. The batch is truncated and its next candidate is `features/ai/ace/intent-synthesis-reward.ts`; keep the all-provider verified cursor at `evidence/worker-ocr.ts`, do not claim this page or the corpus complete, and retain the earlier missing-predecessor gap. Focused batch tests pass 12/12. Global `git diff --check` is not clean because unrelated generated `simd-bridge/cpp/build-x64-cuda/CMakeFiles/CMakeConfigureLog.yaml` contains trailing whitespace; no unrelated generated files were changed.

Large-source NLP and scan continuation correction (2026-10-21): aligned the client and 8095 `/analyze` contract at a 1,000,000-character maximum, sent the complete exact source with its original source/workspace revisions, and extended the bounded request timeout to 180 seconds. Added a Python request-model test for the cap. After the operator-approved 8095-only reload, the exact frozen `features/ai/ace/context-assembler.ts` (328,372 bytes, source revision `sha256:c485b8289da7271b49518bb53e6eb87bd6a9e00f9582f0748c957c93bf2a4634`) returned 4/4 NLP passes bound to that source revision; no classification proposal was present, authority stayed false, and no writes occurred. Combined batch `.tmp/atlas/indexed-source-batch-1792610928984.json` then verified 8/8 sources with AST, LSP, and NLP complete. Further bounded continuations verified 32 sources each through `.tmp/atlas/indexed-source-batch-1792611940760.json`, reaching `graph/phase109a-inverse-lookup.ts`; all four continuation segments reported zero production writes. Coverage audit `.tmp/atlas/indexed-source-server-coverage-chain-v1.json` independently read back 704 source receipts for this snapshot but remains `PARTIAL_RECEIPT_READBACK` due to a missing predecessor at `.tmp/atlas/indexed-source-batch-1792604677962.json`; the cohort is not exhausted. Latest continuation `.tmp/atlas/indexed-source-continuation-1792611804357.json`; cursor `sveltekit-frontend/src/lib/server/graph/phase109a-inverse-lookup.ts`. Keep task 2.4 open and do not infer whole-corpus completion or durable AST persistence.

Review update (2026-10-21): later reconciled checkpoint is page 141 / 1,128 eligible sources (1,124 clean, four recoverable, 1,554 remaining). The continuation stopped safely on the next page because `route-feature-map.ts` (239,212 bytes) receives 8095 `/ast/chunk` HTTP 422 at the 200,000-character request limit; NLP also skips inputs over 50,000 bytes. Do not skip it or call the cohort exhausted. Real-file LSP probing is diagnostic only: five convenience samples under a temporary fixture workspace; only two had all symbol ranges in bounds, and the check does not verify name-to-source span correspondence or preserve source hashes in the result rows. See `docs/reports/parent-atlas-lsp-clustering-diagnostic-20261021.md`.

Svelte LSP pilot update (2026-10-21): diagnostic adapter tests passed 11/11. A deterministic 20-file span-filtered pilot from the 933 NO_DECLARATIONS Svelte cohort ran in an isolated workspace with copied app package/config files and linked installed dependencies. All 933 source hashes matched the frozen per-file manifest; all 20 selected LSP requests returned OBSERVED. Of 2,760 symbols, 1,738 had identifier names present in their mapped source spans, 1,016 did not, and six had invalid mappings. This does not prove semantic correctness, workspace-revision qualification, indexed persistence, or full-corpus coverage. The full app-root attempt timed out on the first four files and was stopped; the isolated bounded workspace completed. Receipt: `.tmp/atlas/svelte-lsp-fixture-v1/span-filtered-real-pilot-receipt.json`. Keep full Svelte LSP, AST persistence, and production admission gates open; no production writes or GPU work occurred.

Large-source continuation update (2026-10-21): raised the 8095 AST request model's explicit source limit from 200,000 to 1,000,000 characters and added boundary regression cases. Focused Python revision tests passed 6/6 in the mounted sidecar Python 3.13 environment, including an in-process FastAPI TestClient POST above the old limit. The exact 239,212-byte route-feature-map.ts source parsed through the updated V2 AST function as CLEAN with 10 chunks, matching source digest, and in-bounds spans. A read-only POST to the live 8095 service still returned 422 with the old 200,000-character limit. The local code fix is not active in the running process; do not resume the frozen scan until a controlled reload and successful live one-file replay. NLP's separate >50,000-character skip remains. See `docs/repo-analysis/atlas.md`; preserve the file in the denominator and keep source-scan completion pending.

Latest read-only checkpoint (2026-10-21): after the approved 8095 reload, the NLP client/model now accepts exact source up to 1,000,000 characters with a 180-second client timeout. The 328,372-byte frozen `features/ai/ace/context-assembler.ts` replay returned 4/4 revision-bound NLP passes. A subsequent 8-source page completed all providers, and bounded continuations advanced the receipt chain. Re-running `scripts/atlas/audit-indexed-source-coverage-chain-v1.mjs` against `.tmp/atlas/indexed-source-batch-1792612116163.json` reports `FROZEN_SNAPSHOT_DIAGNOSTIC_READBACK_PROVEN`, 142 continuous pages / 1,136 sources, no chain issues, and next source `sveltekit-frontend/src/lib/server/atlas/routing/route-mask-v1.ts`; the selected cohort is not exhausted. Latest receipt: `.tmp/atlas/indexed-source-server-coverage-chain-v1.json`. This supersedes the earlier 704-observation partial-receipt checkpoint, but remains diagnostic only: zero canonical/database/vector/cache/graph/ACE writes and no admission.

Continuation after that checkpoint: four receipt-backed pages advanced the same frozen cohort to 152 continuous pages / 1,216 sources, with no coverage-chain issues and next source `sveltekit-frontend/src/lib/server/atlas/tensors/packet-validator.ts`. The last page receipt is `.tmp/atlas/indexed-source-batch-1792612359691.json`; the independent coverage receipt was regenerated at `.tmp/atlas/indexed-source-server-coverage-chain-v1.json`. All four pages reported 8/8 complete, no failures, and no datastore writes. Task 2.4 remains open until `cohortExhausted` is true and all eligible source outcomes are reconciled.

Latest continuation checkpoint: the same frozen chain now has 176 continuous pages / 1,408 sources, no audit issues, and next source `sveltekit-frontend/src/lib/server/db/schema-evidence-crud.ts`. Four further pages each reported 8/8 complete; the eight latest pages are represented by `.tmp/atlas/indexed-source-batch-1792612424205.json` through `.tmp/atlas/indexed-source-batch-1792612430066.json`. Current independent receipt: `.tmp/atlas/indexed-source-server-coverage-chain-v1.json`. The selected cohort remains unexhausted; no canonical or datastore writes occurred.

Latest continuation: receipt-chain audit now verifies 192 pages / 1,536 sources with no issues; next source is `sveltekit-frontend/src/lib/server/db/schema/route_runtime_packets.ts`. Sixteen intervening pages each completed 8/8 without failures or datastore writes. Latest page `.tmp/atlas/indexed-source-batch-1792612500238.json`; current independent coverage receipt `.tmp/atlas/indexed-source-server-coverage-chain-v1.json`. Task 2.4 remains open; the snapshot cohort is not exhausted.

Latest continuation checkpoint: independent audit verifies 232 pages / 1,856 sources in the same frozen snapshot, with no continuity issues and next source `sveltekit-frontend/src/lib/server/grpc/generated/evidence_metadata.ts`. Eight pages completed 8/8 immediately before this checkpoint, and another eight pages before that; no datastore writes occurred. Latest page `.tmp/atlas/indexed-source-batch-1792612727477.json`; current coverage receipt `.tmp/atlas/indexed-source-server-coverage-chain-v1.json`. The cohort remains unexhausted; task 2.4 stays open.

Current status refresh (2026-10-21): after another eight-page bounded continuation, the verified chain is 248 pages / 1,984 of 2,682 eligible sources (74.0%), with no continuity issues and next source `sveltekit-frontend/src/lib/server/library-registry/resolve-library-identity.ts`. The selected snapshot contains 3,109 source refs; 427 remain explicitly excluded for lack of exact Graphify source match and are not silently counted as eligible. Latest page `.tmp/atlas/indexed-source-batch-1792613143473.json`; coverage receipt `.tmp/atlas/indexed-source-server-coverage-chain-v1.json`. A fresh read-only ontology tuple census on 2026-10-21 found 539,124 rows, all four tuple groups `UNRESOLVED`, and zero rows in `atlas_ontology_linked_tuples`; tuple-owned source/workspace revision columns are absent. Of the 539,124 packet joins, 24,311 join to packets with qualified packet revisions, but that does not establish chunk-owned revision or grounded tuple provenance. Receipt `.tmp/atlas/feature-ontology-tuple-admission-census-v1-2026-10-21T200708713Z.json`; no database/cache/model writes. Keep source analysis, chunk lineage, tuple grounding, taxonomy review, and admission as separate completion measures.

Continuation after that status refresh: the same source snapshot now verifies 272 continuous pages / 2,176 of 2,682 eligible sources (81.1%), no continuity issues, and next source `sveltekit-frontend/src/lib/server/redis-disposable.ts`. The eight-page continuation completed 8/8 per page with zero failures or datastore writes. Latest page `.tmp/atlas/indexed-source-batch-1792613847630.json`; independent coverage receipt `.tmp/atlas/indexed-source-server-coverage-chain-v1.json`. Task 2.4 remains open; source analysis is diagnostic, not indexed/admitted. Separately, the 2026-10-21 read-only taxonomy census reports 539,124 ontology tuples, all unresolved; this is not a label-review completion percentage. The nine technical domains, observed tuple strings, ontology groups/concepts, and product feature labels remain distinct vocabularies requiring typed, reviewed crosswalks. No unified taxonomy census denominator or reviewed-label coverage has been established.

Latest continuation: the same frozen cohort now independently verifies 280 pages / 2,240 of 2,682 eligible sources (83.5%), with zero receipt-chain issues and 442 remaining. Eight pages completed 8/8, no production writes. Next source: `sveltekit-frontend/src/lib/server/retrieval/citation-graph.ts`. Latest page `.tmp/atlas/indexed-source-batch-1792614083685.json`; continuation `.tmp/atlas/indexed-source-continuation-1792613939378.json`; coverage receipt `.tmp/atlas/indexed-source-server-coverage-chain-v1.json`. This remains diagnostic-only, not durable AST indexing, lineage qualification, or admission.

Latest continuation before prioritization change: independent receipt audit verifies 292 pages / 2,336 of 2,682 eligible sources (87.1%), zero chain issues, 346 remaining; 2,321 clean parses and 15 recoverable diagnostics. Next source `sveltekit-frontend/src/lib/server/retrieval/prompt-listener.ts`. Last reconciled page `.tmp/atlas/indexed-source-batch-1792614416499.json`; the following batch stopped on an incomplete source and is not included. Coverage `.tmp/atlas/indexed-source-server-coverage-chain-v1.json`; outcome manifest `.tmp/atlas/indexed-source-server-outcomes-v1.jsonl` (2,336 rows). Per user direction, do not exhaust this broad source scan as a prerequisite for the Svelte-check agentic error-fixing experiment; preserve it as partial diagnostic evidence. No production writes.

UTF-8 BOM replay correction (2026-10-21): `sveltekit-frontend/src/lib/server/db/schema/topology-eval-times.ts` begins with UTF-8 BOM bytes. Default `TextDecoder` behavior stripped the BOM, causing a false `SOURCE_UTF8_ROUNDTRIP_MISMATCH`; LSP validation repeated the same bug and classified the source stale. Added a shared BOM-preserving strict UTF-8 decoder and applied it to source loading and LSP source validation. Focused source-revision/LSP tests pass 9/9. Exact-source replay now reports `DRY_RUN_VALIDATED_NOT_INDEXED`, with AST/Tree-sitter, LSP, and NLP complete and zero canonical writes. Receipt: `.tmp/atlas/indexed-source-provider-diagnostic-1792607111581.json`. This is one repaired source, not page or cohort completion; resume only from the last independently verified cursor.

Subsequent bounded replay (2026-10-21): reran the failed page from the last verified cursor; checksum is valid and all 8 sources completed, with zero datastore writes (`.tmp/atlas/indexed-source-batch-1792607257669.json`). The next page yielded 7 completed observations and one failure: `db/schema/worktree-leases.ts` has a source binding of `sha256:90bd…`, while the only available working-tree bytes hash to `sha256:e379…`. No matching frozen snapshot root is configured or available. That page remains unverified; stop rather than use current bytes or skip the mismatch.
