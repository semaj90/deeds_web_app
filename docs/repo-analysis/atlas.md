# Repository Analysis: Source Inventory, AST, NLP, and PostgreSQL

**Reviewed:** 2026-10-20

**Status:** Architecture/evidence review; no service, database, cache, Graphify, or GPU writes performed.

## Summary

The repository has file discovery, semantic-indexing, PostgreSQL, Tree-sitter/8095, AST-grep, LSP, and NLP components. They are not one automatic, revision-qualified pipeline. In particular, a file being indexed or recognized by extension does not mean its embedded languages were parsed, its observations were admitted to PostgreSQL, or its derived labels are canonical.

The safe sequence is:

```text
admitted workspace source inventory
  -> canonical repo-relative source reference + exact source/workspace revisions
  -> file-type and embedded-language dispatch
  -> bounded Tree-sitter / AST-grep / LSP / NLP observations
  -> schema-validated, revision-bound evidence receipt
  -> existing PostgreSQL owner and independent readback
  -> derived retrieval/graph/taxonomy projections
```

PostgreSQL remains the canonical owner for identity, revisions, eligibility, and admitted evidence. Parsers and NLP produce observations or proposals; they do not promote identities or classifications by themselves.

## Tracked File-Ending Inventory

This count was generated from `git ls-files` and grouped by final path extension. It is a repository inventory, not a claim that every path is source code or indexed. It excludes the contents of nested Git submodules and does not include untracked or ignored files.

| Ending | Tracked paths |
|---|---:|
| `.md` | 9,735 |
| `.ts` | 8,549 |
| `.json` | 6,643 |
| `.mjs` | 4,979 |
| `.svelte` | 946 |
| `.py` | 942 |
| `.sql` | 731 |
| `.mts` | 727 |
| `.html` | 346 |
| `.ps1` | 317 |
| `.js` | 125 |
| `.cjs` | 104 |
| `.yaml` / `.yml` | 128 |
| `.go` | 33 |
| `.cpp` / `.cu` | 48 |
| Other endings | Present; inspect the complete tracked inventory before expanding parser coverage. |

The current fast codebase indexer has a narrower discovery policy: `.ts`, `.svelte`, `.js`, `.mjs`, `.cjs`, and `.json`. It excludes generated, dependency, archive, and data directories. That is a useful application graph scope, not a comprehensive multilingual repository inventory.

## Svelte and Embedded TypeScript

**Source-qualified admission alignment (2026-10-20):** the coordinating change is `openspec/changes/parent-atlas-source-qualified-corpus-admission`. A fresh read-only feature review manifest covers all 319 multi-source IDs (94 dotted IDs prioritized individually) and seven product candidates with complete occurrence lists and independent checksum/readback verification; all remain unmapped. The existing V2 canonical-concept label declaration and admin query are aligned; a disposable PostgreSQL 18.4 run passed 19 migration/lifecycle/concurrency/rollback checks. These proofs do not establish reviewed live identity population or source-analysis persistence. See `docs/reports/parent-atlas-corpus-admission-acceptance-20261020.md` for the acceptance matrix and exact receipts.

The existing behavior is split across owners:

- `sveltekit-frontend/scripts/index-codebase-fast.mjs` discovers `.svelte` files and marks a file as a component when a `<script>` tag is present. Its route/component metadata and regex-based scans are not equivalent to parsing the script body as TypeScript.
- `scripts/atlas/ast-chunk-keyed-map-v1.mjs` delegates language recognition to the 8095 capability map. Its AST-grep adapter explicitly skips Svelte; the sidecar can still take the Svelte Tree-sitter path.
- `scripts/atlas/svelte-dom-splitter-v1.mjs` already uses `svelte/compiler` to parse instance and module scripts, template nodes, event handlers, and runes. It converts original UTF-16 parser offsets to UTF-8 byte spans and records the original file digest. Its script-block spans include the surrounding tags.
- `scripts/atlas/svelte-rune-crosscheck-v1.mjs` already extracts the first script's contents, runs AST-grep with the TypeScript grammar, and adds the content's byte offset back to rune matches. This is a specific rune cross-check: it changes dollar signs to underscores in a temporary copy and does not provide general TypeScript analysis of every script block. It has no PostgreSQL persistence path.
- `scripts/atlas/lib/indexed-source-lsp-v1.mjs` dispatches supported source languages through the existing `compiler-semantic-resolver-v1.mjs` and converts LSP UTF-16 ranges to original-source UTF-8 byte spans. Svelte host-only LSP is the default; the Svelte TypeScript plugin is opt-in because it timed out on a 25,544-file snapshot even after dependencies were linked. The embedded-TypeScript provider remains separate and continues to produce source-byte-mapped facts. A narrow-root host-only request has completed, but this does not establish project-level definitions or corpus coverage. The Svelte NLP helper uses the 8095 POS-only path and remains advisory. The indexed-source AST-grep adapter now accepts only the repository root or a materialized snapshot root, reads the source from that root, checks its expected SHA-256, and verifies the returned AST diagnostic hash; this prevents a working-tree/snapshot mismatch from silently suppressing structural analysis.
- The exact-source provider in `scripts/atlas/audit-indexed-source-providers-v1.mjs` reads one already indexed source under a read-only PostgreSQL transaction, verifies its bytes against the bound source revision, and invokes AST/LSP/NLP diagnostics. It writes a local diagnostic receipt only; it does not persist provider output to PostgreSQL or admit it to ACE.

**Current provider state:** `scripts/atlas/lib/indexed-source-svelte-typescript-v1.mjs` parses every Svelte module/instance script using Svelte compiler spans plus the TypeScript compiler, supports JavaScript/TypeScript language attributes, maps compiler UTF-16 offsets to original UTF-8 byte spans, and rejects source-byte/revision mismatches. Its nine fixtures cover module/instance TS and JS, Unicode, CRLF, comments, empty/no-script components, malformed TS/host markup, stale source bytes, and unsupported script languages. The indexed-source driver invokes it for `.svelte`; this remains diagnostic-only, not a persistence/readback owner or proof of full-project Svelte LSP semantics.

A prior bounded diagnostic used one exact-bound TypeScript source and one exact-bound Svelte source from the admitted materialized snapshot. Both source hashes matched their PostgreSQL bindings and workspace revision. `src/routes/api/admin/demo-list/route.ts` completed Tree-sitter/AST-grep, LSP (11 byte-ranged symbols), and 8095 NLP. `src/routes/admin/cache/+page.svelte` completed Svelte compiler/embedded-TypeScript, LSP (36 byte-ranged symbols), and advisory 8095 POS. Both receipts were `DIAGNOSTIC_COMPLETE_NOT_ADMITTED` with `indexingOutcome: DRY_RUN_VALIDATED_NOT_INDEXED`; they were local diagnostic artifacts only, with zero canonical rows written. The bounded directory orchestrator independently verified each provider-receipt checksum and reported 1/1 completed for each selected one-source cohort. This was not directory-wide or corpus-wide coverage. Historical batch receipts: `.tmp/atlas/indexed-source-batch-1792541794607.json` (TypeScript) and `.tmp/atlas/indexed-source-batch-1792541805938.json` (Svelte); their provider receipts are `.tmp/atlas/indexed-source-provider-diagnostic-1792541794583.json` and `.tmp/atlas/indexed-source-provider-diagnostic-1792541805910.json`.

**Frozen source-analysis denominator (read-only, 2026-10-20):** admitted workspace `sha256:e24bb97187ea6394eeba457dd849915f570045b7a1867780fdc7aa9ea62b9acc`, snapshot `sha256:6288726b73626ae58905b5ebdea42e709cb1af67b3e16186bcd8b2b88a89d98b`, membership checksum `sha256:dccaf9f6e84b1d3b1c49f2b6f110b9b9946b895703ac0987cbb70a3608223efb`. The stdout-only source-authority audit returned `CURRENT_SOURCE_AUTHORITY_PROVEN` for 25,542/25,542 manifest sources; the manifest contains 13,608 nonempty SHA-256-qualified files in the currently supported TS/JS/Svelte language set (8,062 `.ts`, 17 `.tsx`, 141 `.js`, 3,817 `.mjs`, 539 `.mts`, 98 `.cjs`, 934 `.svelte`). A read-only join from the admitted Graphify execution membership to `codebase_chunk_index.source_ref` found 12,200 supported-language files with 121,709 distinct chunks, plus 7,815 other-language/document files with 58,346 chunks. All 180,055 joined chunks have `content_embedding_768`; all 180,055 have blank/null chunk-owned source and workspace revisions. This is a frozen manifest and join denominator, not proof that provider analysis has run on the corpus, nor proof that chunk evidence is qualified. The source registry has 24,456 exact bindings and 1,086 absent bindings; source-authority proof uses the admitted snapshot/membership and independent checksum, not that partial secondary registry count.

A fresh PostgreSQL 18.4 catalog check confirms `atlas_ast_nodes` is still the only durable AST table; it lacks a workspace-snapshot revision column and retains legacy nullable lineage/identity constraints. A separate V2 contract is now migration-owner-reviewable but unapplied: its DDL and rollback-only canary passed, while independent catalog readback confirmed `atlas_ast_nodes_v2` remains absent. The live authority census has zero `SELECTED` rows, and both diagnostic sources resolve to `LEGACY_IMPORTED`; therefore no persisted AST write or production admission is justified. See `docs/reports/atlas-ast-nodes-v2-writer-contract-review-20261020.md`.

**Svelte LSP profile follow-up (2026-10-20):** the exact-snapshot Svelte provider completes with Svelte compiler/embedded-TypeScript, host-only Svelte LSP, and 8095 POS. A bounded batch over `sveltekit-frontend/src/lib/client/ui` returned 2/2 bound sources, not truncated: `POIPhotoModal.svelte` produced 5 embedded-TypeScript facts, 2 host symbols, and 614 verified POS spans; `POIPhotoUploader.svelte` produced 8 embedded-TypeScript facts, 17 host symbols, and 1,613 verified POS spans. The `src/lib/client` directory completed for the frozen binding query (8 + 7 = 15 bound rows), not repository-wide coverage. Full Svelte TypeScript-plugin mode timed out on a 25,544-file byte-identical snapshot copy even with dependencies linked; host-only mode completed on the original snapshot, which lacks generated `.svelte-kit/tsconfig.json`. A separate 35-symbol isolated-project probe shows the server can produce richer symbols in a smaller configured project, but it does not prove the frozen snapshot's full-project semantic context. The plugin is now opt-in, not default; embedded TypeScript continues through its separate compiler-based provider. The exact-snapshot outputs remain `DRY_RUN_VALIDATED_NOT_INDEXED`, with zero canonical writes. Paired TypeScript LSP remains independently tested. Receipts: `.tmp/atlas/indexed-source-batch-1792548873394.json`, `.tmp/atlas/indexed-source-batch-1792548972489.json`, `.tmp/atlas/indexed-source-batch-1792549127812.json`, and `.tmp/atlas/svelte-lsp-dependency-isolation-v1.json`.

**Verified directory receipt chain (2026-10-20):** 57 bounded pages for `sveltekit-frontend/src/lib/server` cover 456 unique bound sources across Tree-sitter/AST-grep, TypeScript LSP, and 8095 NLP. The baseline was independently reconciled as 49 pages / 392 sources; the older manually accumulated 400/50 and 408/51 totals remain superseded. Eight additional pages now pass. The first attempt at the eighth page stopped on an NLP timeout for `api-registry.ts`; a bounded single-source retry passed four revision-bound NLP passes in 46.9 seconds, followed by a complete one-worker page retry. `.tmp/atlas/indexed-source-server-coverage-chain-v1.json` independently verifies all successful page/provider checksums, source hashes against frozen bytes, workspace revisions, and zero canonical writes. Latest receipt `.tmp/atlas/indexed-source-batch-1792554039014.json` has checksum `sha256:2a708e18b590bb04b1115fbd8958d38b3a321a43c5f144442ae39f82f3659ca1`; cursor `sveltekit-frontend/src/lib/server/api/response-helper.ts`. The failed receipt and continuation log `.tmp/atlas/indexed-source-continuation-1792553108840.json` are preserved. `continue-indexed-source-batches-v1.mjs` reuses the existing producer, verifies each page, and stops before advancing any incomplete page. This remains partial diagnostic coverage with no durable AST admission.

**Full-project Svelte follow-up:** generating `.svelte-kit/tsconfig.json` in the disposable copy succeeded, with all 25,544 original files unchanged before and after. Full TypeScript-plugin LSP still timed out on the 4,865-file project (922 Svelte files). The updated JSON-RPC client replies to server requests and rejects source edits, with a collision/handshake regression test; the real timeout had no server requests, so that fixed protocol gap is not its cause. The isolated Vite config load fails resolving `unocss/vite`, while Svelte config fallback loads. Exact receipts: `.tmp/atlas/frozen-svelte-project-lsp-1792553467665.json`, `.tmp/atlas/frozen-svelte-project-lsp-1792553869591.json`, and `.tmp/atlas/frozen-svelte-vite-config-load-v1.json`. Full project semantic qualification remains open. Focused transport/LSP/batch/embedded-script tests pass 23/23.

**Finite scan checkpoint (2026-10-21):** the corrected directory manifest `.tmp/atlas/indexed-source-frozen-cohort-1792556680378.json` covers all 3,109 supported source files in the frozen `src/lib/server` snapshot and all 3,109 exact source-reference bindings. Of these, 2,682 have exactly one Graphify file at the same source revision and are eligible for this scan; 427 lack that exact Graphify match and remain explicit exclusions. No snapshot-only files, binding-only paths, or duplicate identities were found. This corrects the earlier inner-join denominator in `.tmp/atlas/indexed-source-frozen-cohort-1792555861461.json`; that artifact is preserved but superseded. The continuous scan chain through `.tmp/atlas/indexed-source-batch-1792559106451.json` verifies 1,088 eligible sources across 136 pages, with 1,594 eligible sources remaining. The chain reconciles to the corrected manifest: 1,084 clean parses, four recoverable diagnostics, zero unknown parse states, and 427 explicit exclusions. `.tmp/atlas/indexed-source-server-outcomes-v1.jsonl` records each source identity/hash, language, parser status/diagnostic, AST stages/chunk count/match agreement, LSP symbol total, NLP exact-revision pass counts, provider statuses, and provider receipt checksums. Earlier pages are independently checked against the corrected eligible subset. Cursor exhaustion cannot hide missing sources. The ongoing scan is diagnostic, not indexed or admitted.

**Retry and stop contract:** the existing batch owner accepts `--cohort=<local-manifest>` for fixed membership and resumes strictly after a manifest cursor. Successful peers on a failed page can be reused only after provider checksum/status, exact source bytes, workspace/source revision, snapshot, and Svelte-profile checks. Live receipt `.tmp/atlas/indexed-source-batch-1792556001276.json` reused eight verified observations without executing providers. The continuation accepts the cohort path as its optional fifth argument and consolidates coverage before accepting exhaustion. The already-running older continuation must be checked against that cohort; its next resume should pass the flag. HTTP retries are bounded to one transient `fetch failed`, retaining the same deadline and request plus both attempt results; HTTP/JSON/schema failures are not promoted. Combined focused tests pass 38/38. Production datastore writes remain zero.

**Full semantic timeout remains unresolved:** same-server cold/repeated requests still timed out, including a bounded 300-second cold control followed by 60 seconds on the same server (`.tmp/atlas/prepared-svelte-lsp-warm-1792554994675.json`). The bounded CPU profile (`.tmp/atlas/prepared-svelte-lsp-cpu-1792554813784.json`) observed filesystem/module-loading work, not a proven root cause; no heap or model-state snapshot was persisted. Dependencies/config generation alone are therefore insufficient to claim full Svelte semantic qualification. Host-only LSP, embedded-script analysis, and NLP retain their independent diagnostic status.

**AST V2 proposal slice (2026-10-20):** `scripts/atlas/lib/atlas-ast-nodes-v2-proposal-contract-v1.mjs` validates exact UTF-8 source bytes/revision, repository/workspace identity inputs, UTF-8 byte boundaries, UTF-16/line coordinates, parent containment/cycles, paths, and deterministic revision/parser/extractor/span-aware node IDs. `scripts/atlas/lib/atlas-ast-nodes-v2-diagnostic-adapter-v1.mjs` maps complete TypeScript/Svelte provider diagnostics into dry-run proposals; the row-contract helper maps them to proposed V2 insert columns and compares independent readback, without database access. Saved provider receipts yielded 3 TypeScript nodes and 33 Svelte nodes, both `DRY_RUN_VALIDATED_NOT_INDEXED`; packet identity remains unresolved. The schema/canary contract is `SCHEMA_WRITER_CONTRACT_READY_NOT_APPLIED`, not indexed. The exact authority row is `LEGACY_IMPORTED`, and the live census found zero `SELECTED` rows. No production writer, applied migration, persisted row, or ACE admission exists; historical proposal artifacts were not modified.

**Bounded batch follow-up (2026-10-20):** `scripts/atlas/audit-indexed-source-batch-v1.mjs src/routes/api sha256:e24bb97187ea6394eeba457dd849915f570045b7a1867780fdc7aa9ea62b9acc 2 1` ran read-only and returned 2/2 completed for `src/routes/api/ace/ask/+server.ts` and `src/routes/api/acp/service-ports/route.ts`; the overall result is correctly `PARTIAL_DIAGNOSTIC_NOT_ADMITTED` because the 2-row limit truncated the directory. The first pass exposed that `ast-chunk-keyed-map-v1.mjs` rejected SvelteKit `+server.ts` paths; `ast-chunk-source-path-v1.mjs` now allows `+` while still rejecting traversal, absolute paths, and unsupported extensions. Both providers then completed Tree-sitter/AST-grep, LSP, and 8095 NLP. These receipts report `sourceReadMode: WORKING_TREE` and `materializedSnapshotRevision: null`, although exact bytes match the bound source hashes. Treat as hash-verified diagnostics, not frozen-snapshot or selected-authority proof. No canonical datastore writes occurred.

The current-source authority audit was rerun with `--stdout-only` against the admitted workspace revision. It returned `CURRENT_SOURCE_AUTHORITY_PROVEN`: 25,542/25,542 source rows qualified, with zero missing revisions, mismatches, namespace ambiguities, or out-of-cohort rows. Independent source-selection checksum and admitted membership checksum both matched. Registry coverage was 24,456 exact and 1,086 absent; those absent bindings are not counted as revision failures by this audit. The working tree has 3,068 reported drift/exclusion/unavailable entries (1,967 changed, 1,086 nested-repository exclusions, 15 unavailable), so reads for this slice must continue to use the admitted materialized snapshot rather than silently substituting current disk. `--stdout-only` wrote no authority receipt.

The existing `apply-ast-declaration-canary-v1.mjs` is not a persistence owner for the new indexed-source provider facts; it consumes a separate AST declaration handoff and has explicit multi-flag write gates. Its on-disk proof receipt is not a fresh pass: `AST_BF_15_LINEAGE` is `FAIL`, `rawRevisionCoerced` is 14,633, and the saved apply gate has zero eligible rows. I added a fail-closed independent readback helper and wired it after the canary's explicitly gated commit; it joins the AST row through `atlas_repository_identity` to the exact `atlas_workspace_source_bindings` source and workspace revisions, rather than trusting a same-transaction readback. This is not a live persistence proof, and the provider dry-run still has no production writer caller. A fresh read-only census also found all 523,271 existing AST rows use the nil `repo_id`; only 294,405 of 511,998 path/source-revision joins matched the binding's file digest. Those legacy rows cannot prove the canonical repository mapping. Do not invoke the canary for the current TypeScript/Svelte slice: its saved lineage gate remains failed and has no eligible rows.

Do not run AST-grep against a detached script string and then treat its local offsets as source-file offsets. The extraction map and exact source-byte revision are required to ground the result.

## Directory Batches, RabbitMQ, and CPU Workers

Several reusable owners already exist:

| Component | Existing behavior | Integration limit |
|---|---|---|
| `scripts/atlas/lib/pg18-indexed-file-subhelpers-v1.mjs` | Read-only lineage queries/cohort reconciliation and Tree-sitter, AST-grep, LSP, and NLP observation adapters. | Adapters consume supplied results; they do not create a durable per-directory work queue. The AST-grep adapter sends Svelte to the separate splitter path. |
| `sveltekit-frontend/src/lib/server/indexer/workers/index-worker-pool.ts` | Uses the shared compute pool for hashing, line chunking, regex metadata, regex entity extraction, and Qdrant payload preparation. | These tasks are not the source-qualified 8095 AST/LSP/NLP workflow. |
| `sveltekit-frontend/src/lib/server/workers/compute-pool.ts` | Real Node worker threads with queue-count and payload-byte bounds; default size is at most four threads, or one in app cluster-worker mode. | Worker count is shared process capacity; creating another pool per directory would multiply threads and memory. |
| `sveltekit-frontend/src/lib/server/indexer/pipeline/chunk-stream-pipeline.ts` | Async file/chunk limits and batch callbacks for embedding, PostgreSQL metadata, and cache operations. | Current source search found its exported definition and documentation, but no production invocation of `runChunkStreamPipeline`. It does not call the indexed-source provider helper. |
| `scripts/workers/codebase-chunk-embed-worker.mjs` | RabbitMQ chunk-ID batches, prefetch 1, PostgreSQL update, then ACK; redelivery failure goes to the DLQ. | Dedicated embedding worker; no Svelte/AST/LSP/NLP dispatch. |
| `scripts/workers/graphify-audit-consumer.mjs` | RabbitMQ audit/cache/topology downstream handlers with prefetch 1. | Does not establish a revision-qualified indexed-file analysis consumer. |
| `sveltekit-frontend/src/lib/server/indexer/karpathy-hook.ts` | File/directory cards, summaries, and derived payload preparation; reachable through the Karpathy hook API route. | Input includes content hashes but lacks the explicit source/workspace revision tuple needed for admitted analysis. |
| `scripts/graphify/graphify-batch-karpathy-analysis.mjs` | Sequential subprocess stages for graph enrichment, Karpathy scores, and file/directory summaries. | Not a CPU worker pool. Its final report currently marks completion/OK unconditionally after stage calls in dry-run mode, so inspect stage outcomes independently. |

The recommended scheduling unit is a bounded batch of admitted source references grouped by directory and workspace revision. Use shared helpers for all eligible source directories; separate helper code and a separate worker pool in every directory are unnecessary.

```text
discover changed source files
  -> commit and independently read back an eligible source batch
  -> queue batch references through the existing job/queue owner
  -> shared CPU pool: hash verification, Svelte split, AST/structural work
  -> bounded external-provider calls: 8095 NLP and language-server analysis
  -> validate original-file spans and revision-bound observations
  -> existing evidence admission/persistence owner + independent readback
  -> regenerate directory wiki/card from the verified results
```

Start analysis after each eligible batch is read back; there is no need to wait for an entire repository reindex. Scope discovery to source directories using the established exclusions and nested-repository identities. Include source/workspace revisions, producer revision, batch ID, and evidence references in queued descriptors. A worker must recheck source bytes before analysis and distinguish stale, unsupported, failed, and completed items.

RabbitMQ distributes durable work and supports retries. The compute pool supplies CPU parallelism inside a process. Async concurrency for 8095 calls is a separate service limit and should be measured; increasing Node thread count does not increase the sidecar's processing capacity. Reuse the current pool cap and bound both queued item count and queued bytes before increasing throughput.

A bounded diagnostic caller is now implemented in `scripts/atlas/audit-indexed-source-batch-v1.mjs` and registered as `analysis.indexed_source_batch` in TRACE's existing local job runner. It pages through exact indexed-source joins for TS/JS/Svelte extensions supported by the current provider chain, reuses the single-source provider owner, and independently verifies each local receipt. Unsupported extensions are excluded rather than passed to parsers that cannot handle them. Fourteen frozen-snapshot pages completed all providers on 200/200 selected JS/TS sources. One page then completed 15/16 because `scripts/atlas/audit-qdrant-noise.mjs` repeatedly timed out at `textDocument/documentSymbol`, including a retry with a 60-second limit; another page completed 15/16 because `scripts/atlas/compare-source-manifest-to-projections-v1.mjs` had `sidecar_ast_chunk:FAILED`, while LSP and NLP completed. The following four pages completed 64/64. Across these thirty-five pages, 534/536 selected sources completed all providers and two remain partial. Latest reports `.tmp/atlas/indexed-source-batch-1792544717834.json`, `.tmp/atlas/indexed-source-batch-1792544799838.json`, and `.tmp/atlas/indexed-source-batch-1792544856108.json`. The batch receipts remain `PARTIAL_DIAGNOSTIC_NOT_ADMITTED`, not directory-wide coverage. Pagination counts grouped source/revision bindings, and duplicate binding or Graphify matches remain explicit exclusions. The source registration is not yet loaded into the running TRACE service. The durable post-index/RabbitMQ connection and observation persistence through the evidence owner remain open. See [MCP tools and directory analysis](mcp-tools.md) for the tool inventory, limits, replay results, and remaining work.

## PostgreSQL and Admission Boundary

The repo contains indexing and embedding writers, plus separate diagnostic and audit scripts. Their presence does not prove they are connected to the daily file discovery path. The 8095 diagnostic helper is a per-source inspection path, not an automatic post-index enrichment worker. The code reviewed here does not show an admitted, durable chain that schedules every newly indexed PostgreSQL source through AST-grep, LSP, and NLP and then independently reads back those observations.

The pipeline-status snapshot dated 2026-10-20 reports 274,465 chunk rows and 219,998 populated 768-dimensional vectors, while chunk-owned source, workspace, and representation revision counts are zero. It separately records a five-source canary with readback proof; that limited canary does not qualify the full corpus. Treat those counts as that report's snapshot, not a fresh live census.

The required implementation gate is a bounded, read-only source canary that proves:

1. A PostgreSQL source row joins to the admitted workspace/source binding using the canonical source reference and exact revisions.
2. The physical bytes match the content digest and are valid UTF-8 before extracting spans.
3. The file/language registry chooses a parser explicitly; unsupported and polyglot files remain visible as unsupported/partial, not silently misclassified.
4. Tree-sitter, AST-grep, LSP, and NLP receipts identify their own producer/version and use spans mapped to the original source bytes.
5. Any persisted observation uses the existing authorized owner, with a precondition, bounded write, and independent readback. No new parallel canonical table or bulk backfill is implied by this analysis.

## Work Order

1. Freeze the repo-root-relative source-reference contract and validate existing aliases without rewriting stored values.
2. Produce a full extension inventory plus explicit extension-to-language-to-provider capability table. Include `.d.ts`/`.mts`/`.cts`, Svelte embedded scripts, Python, Go, Rust, C/C++, SQL, Markdown, JSON, YAML, shell, and protobuf only where a real provider exists.
3. Extend the existing Svelte splitter/cross-check groundwork into a reusable all-script adapter with exact byte-offset remapping; then add Svelte-aware LSP/NLP calls through their current owners.
4. Prove one source through the read-only provider path and inspect its receipt. Decide separately whether and how the existing persistence owner should admit the observations.
5. Only after source/revision admission is proven, consider a bounded worker for automatic post-index analysis. Preserve CPU output as the oracle before any GPU comparison.

The new diagnostic can be used to investigate eligible directory pages before adding that durable worker. Live Markdown pages currently return partial results: the code AST path rejects their extension, LSP skips them, and the 8095 NLP request returned HTTP 500. Those outcomes remain visible and do not authorize evidence admission.

## Evidence Paths

- `sveltekit-frontend/scripts/index-codebase-fast.mjs` — current narrow extension scan and Svelte component heuristics.
- `scripts/atlas/ast-chunk-keyed-map-v1.mjs` — 8095 language authority and AST-grep dispatch/skip behavior.
- `scripts/atlas/svelte-dom-splitter-v1.mjs` and `scripts/atlas/svelte-rune-crosscheck-v1.mjs` — existing Svelte parser and first-script TypeScript rune cross-check.
- `scripts/atlas/lib/pg18-indexed-file-subhelpers-v1.mjs` — existing indexed-file lineage and observation adapters.
- `scripts/atlas/audit-indexed-source-providers-v1.mjs` — exact-source, read-only PostgreSQL + provider diagnostic.
- `scripts/atlas/lib/indexed-source-ast-grep-v1.mjs` — indexed-source AST/ast-grep diagnostic wrapper.
- `scripts/atlas/lib/indexed-source-lsp-v1.mjs` — current TS/JS LSP extension map.
- `scripts/atlas/lib/indexed-source-nlp-v1.mjs` — current TS/JS NLP language map and proposal-only output.
- `scripts/workers/codebase-chunk-embed-worker.mjs` — embedding writer owner; this is a separate worker, not proof of revision-qualified AST/NLP orchestration.
- `docs/reports/pipeline-status-v1.json` — dated status snapshot; do not treat as current live proof.

## Status

| Stage | Status | Evidence boundary |
|---|---|---|
| Repository file-ending inventory | `DIAGNOSTIC_COMPLETE` | Tracked paths only; no parser capability implied. |
| Fast codebase indexer discovery | `OWNER_PRESENT` | Six extensions; narrower than the repository inventory. |
| `.svelte` component recognition | `OWNER_PRESENT` | Script-tag presence/metadata; not embedded TypeScript AST proof. |
| 8095 Tree-sitter on a selected `.svelte` source | `AVAILABLE_PATH_NOT_CORPUS_PROOF` | Exact indexed-source diagnostic exists; not full-corpus scheduling. |
| Svelte compiler script/template analysis | `DRY_RUN_VALIDATED_NOT_INDEXED` | One admitted-snapshot Svelte source produced five embedded-TypeScript facts with original UTF-8 spans. No durable write/readback owner. |
| AST-grep on embedded Svelte TypeScript | `PARTIAL_DIAGNOSTIC` | General embedded TypeScript uses the TypeScript compiler; generic AST-grep still skips Svelte, with a separate first-script rune cross-check. |
| LSP/NLP on `.svelte` source | `DRY_RUN_VALIDATED_NOT_INDEXED` | `src/lib/client`: 15/15 bound sources across bounded pages, including two `.svelte` files. `src/lib/server`: 456 unique sources across 57 checksum- and source-verified pages; continuation remains. Host-only LSP, separate embedded-TypeScript facts, and verified 8095 POS spans. Full Svelte TypeScript-plugin mode still times out with dependencies and generated project config; no durable evidence admission. |
| Shared CPU worker pool and batch writers | `OWNER_PRESENT` | Shared worker threads and bounded batch pipeline exist; no production pipeline caller found in the inspected source search. |
| RabbitMQ post-index AST/LSP/NLP batches | `NOT_PROVEN` | Existing embedding and downstream audit consumers have different responsibilities. |
| Explicit directory diagnostic batches | `IMPLEMENTED_PARTIAL_LIVE_REPLAY` | Three consecutive frozen-snapshot pages completed all providers for 24/24 selected JS/TS sources; all pages are truncated, so this is not directory-wide coverage. Unsupported Markdown/PowerShell are excluded by source-only dispatch. MCP registration still requires runtime reload/replay. Receipts: `.tmp/atlas/indexed-source-batch-1792542481629.json`, `.tmp/atlas/indexed-source-batch-1792542763419.json`, `.tmp/atlas/indexed-source-batch-1792542825203.json`. |
| Persisted AST/NLP observations for every indexed source | `NOT_PROVEN` | No full-corpus producer-to-owner/readback proof established here. |
| Production admission/ACE | `BLOCKED` | Requires source-qualified evidence and a current admitted manifest. |

`likely_cause`: File discovery, language-aware parsing, revision qualification, and PostgreSQL evidence admission are separate owners without a proven corpus-wide orchestration path.

`evidence`: Source paths listed above; tracked extension inventory; dated pipeline status snapshot.

`patch_targets`: `docs/repo-analysis/atlas.md` (documentation only).

`safe_next_command`: Run the existing exact-source diagnostic only for a selected, already bound source; do not start a full-corpus pass.

`smoke_command`: `node scripts/atlas/audit-indexed-source-providers-v1.mjs <exact-source-ref> <sha256-workspace-revision> --sidecar=http://127.0.0.1:8095` (diagnostic receipt only; validate service/hash before running).

`report_path`: `docs/repo-analysis/atlas.md`.

### Review Validation

Earlier 2026-10-20 baseline: indexed-source provider, PostgreSQL subhelper, and Svelte source-path suites passed 10/10 tests; the Svelte compiler smoke passed in memory. That baseline did not invoke a live broker, 8095, database, Graphify, cache, or GPU. The later two-source dry run and its live, read-only 8095/PostgreSQL checks are recorded above.

Subsequent directory/MCP implementation: nineteen focused tests passed. Live TRACE tools/list returned 199 registrations; source now declares 125 literal registrations. Two bounded directory pages used read-only PostgreSQL source selection and provider diagnostics, with independent local receipt readback; both remained partial. No canonical or cache writes occurred. Details are in [mcp-tools.md](mcp-tools.md).

### Single-Source Provenance Check

The verifier now pins the requested `source_ref` (default `src/routes/api/admin/knowledge/+server.ts`) and resolves repo-root and SvelteKit-root paths safely. A fresh read-only run matched disk bytes to PostgreSQL and Graphify source revisions, confirmed a 768-D PostgreSQL vector and packet/workspace bindings, but the expected point was absent from `codebase_chunks_768_v2`. Result: `PARTIAL`, blocked by `QDRANT_POINT_MISSING`; this is not a complete file-to-ACE acceptance proof. The verifier also requires the Qdrant payload `source_ref` to match before declaring the chain intact. No datastore writes occurred.


## Source-qualified admission status (2026-10-21)

Coordinating change: `openspec/changes/parent-atlas-source-qualified-corpus-admission/` (proposal, design, tasks, spec delta; validates).

| Workstream | Status | Receipt |
|---|---|---|
| SvelteKit 2.59.1 dependency AST (159 files, 6,310 chunks) | DIAGNOSTIC | `.tmp/atlas/sveltekit2-code-analysis/receipt.json` |
| SvelteKit docs corpus (5 pages, 233 chunks) | bounded complete, not global | `.tmp/atlas/sveltekit2-docs-corpus-analysis/manifest.json` |
| Svelte LSP on frozen snapshot | NOT QUALIFIED (dependency link + generated config did not resolve the full-project plugin timeout; isolated 35-symbol control is not snapshot qualification) | `.tmp/atlas/prepared-svelte-lsp-warm-1792554994675.json` |
| Feature identity V2 (disposable PG 18.4) | schema prototype; production blocked | `.tmp/atlas/feature-identity-v2-readiness-v1.json` |
| Embedding provenance (274,428 vectors) | readback reported; lineage UNKNOWN | `.tmp/atlas/embedding-provenance-readonly-classification-v1.json` |

No database writes, vector writes, or admissions were made in this entry. Not committed.


### Acceptance matrix (2026-10-21)

Receipt: `.tmp/atlas/source-qualified-acceptance-matrix-v1.json`.

| Item | Status |
|---|---|
| Identity V2 reconciliation | PARTIAL (label-revision race and rollback not run; V1 label Drizzle changed outside session) |
| Identity review manifest, 319 IDs | PASS (0 auto-mapped; manifest `.tmp/atlas/identity-review-manifest-v1.jsonl`) |
| Seven candidates unresolved | PASS (NOT_MAPPED, no canonical ID minted) |
| Authenticated /admin/feature-labels | BLOCKED (dev bypass auth) |
| Svelte LSP frozen-environment repair | BLOCKED (full-project TypeScript-plugin `documentSymbol` timed out after 306.9s, then 60s on the same server; no root cause proven) |
| Source inventory final cursor | UNKNOWN |
| Embedding writer and recipe audit | PARTIAL (encoder and source revision: 0 rows) |
| ContextEvidenceAssemblerV1 rejects unqualified evidence | PASS (4/4 tests) |

No production database, Qdrant, cache, or training writes. Not committed.

## CPU clustering baseline, unlabeled (2026-10-21)

Cohort: UNQUALIFIED_COMPARISON. The chunk index has no source or workspace revisions, so no row is revision-qualified. Advisory only; no domain labels attached.

| Item | Result | Receipt |
|---|---|---|
| Frozen sample | 19,990 rows, 768-d, L2-normalized float32 | `.tmp/atlas/corpus-clustering-v1/sample-receipt.json` |
| KMeans k=32, seeds 42/7/123 | inertia 9,434–9,459; ARI 0.58–0.69; same-cluster neighbours 0.709 vs random 0.037 | `kmeans-cpu-baseline-receipt.json` |
| k sweep (k=16…64) | best mean ARI at k=24 (0.673); silhouette 0.05–0.08 at every k | `kmeans-k-sweep-receipt.json` |
| GPU (cuML KMeans) | RESOURCE_BLOCKED; no fit run; `:8090` not stopped | `gpu-readiness-receipt.json` |
| Symbol coverage, app | 4,584 / 6,640 files = 69.04% (provisional threshold 90%) | `.tmp/atlas/symbol-coverage-app/summary.json` |

Reading: neighbourhood structure exists (0.71 against 0.04 random), but cluster boundaries are weak (silhouette ≤ 0.08). Treat clusters as a comparison, not as a taxonomy.

Open gates: qualified cohort (revision backfill deferred until after Phase 20); GPU run (needs an approved resource window); Phase D ACE packets, Phase E DAG, Phase F MCP lookup, and Phase G proof are not started. SOM 20×20 comparison not rerun.

## Clustering diagnostic bridge D1-D5 (2026-10-21)

Diagnostic component milestones. Not production admission. Report: docs/reports/clustering-ace-diagnostic-report-2026-10-21.md. Receipt: docs/reports/clustering-ace-diagnostic-receipt-v1.json.

| Milestone | Status | Evidence |
|---|---|---|
| D1 frozen-experiment audit | PASS_WITH_CAVEATS | rows and checksum match; generated artifacts dominate part of the sample |
| D2 CPU baselines (k sweep, MiniBatch, PCA-128 train-fit, source-held-out) | DIAGNOSTIC | kmeans-cpu-baseline and d2-baselines receipts |
| D3 symbol-registry classification | DIAGNOSTIC; rule decision pending | current 69.04%; node-type rule projects about 81.7% (sample) |
| D4 diagnostic ACE proposal adapter | IMPLEMENTED; 50 real rows, 0 admission-eligible | scripts/atlas/clustering-ace-diagnostic-adapter-v1.mjs |
| D5 tests | 11 of 11 pass | node --test scripts/atlas/clustering-ace-diagnostic-adapter-v1.test.mjs |
| GPU cuML KMeans | RESOURCE_BLOCKED | gpu-readiness-receipt |
| Phases E (DAG), F (MCP lookup), SOM comparison | NOT STARTED | |
| Production admission | BLOCKED | no revision-qualified cohort; independent receipts absent |

## Svelte LSP fixture qualification and source-byte cohort (2026-10-21)

Correction: an earlier entry said the chunk index has no revision fields. The columns exist. Live counts: source_revision 0, workspace_revision 0, representation_revision 0 of 274,465 rows. file_content_hash is populated on 270,766 rows (whole-file digest).

Svelte LSP, bounded fixture (.tmp/atlas/svelte-lsp-fixture-v1, production source untouched):
- Covers runes, module plus instance TypeScript, Unicode identifiers and strings, and CRLF.
- Observed on all four files in two runs with identical symbol sets. CRLF gives the same definitions as LF.
- Real declarations have valid byte spans whose source slice contains the name.
- Synthetic symbols ($$ComponentProps, "bind:value") have inverted spans and are classified INVALID_MAPPING.
- Tree-sitter returns 0-1 named chunks for these files. The LSP adds embedded TypeScript definitions.
- Caveats: the classifier counts markup elements (button, p) and import bindings as definitions. First-call warm-up is 21-72 s. The dependency-linked, generated-config full-project TypeScript-plugin request later timed out after 306.9 s, then 60 s on the same server; this qualifies the fixture only, not the frozen project.
- Receipts: .tmp/atlas/svelte-lsp-fixture-v1/probe-receipt.json and probe-receipt-run2.json.

Source-byte cohort (read-only): of 19,990 frozen sample rows, 14,982 match their whole-file hash against current disk bytes at read time. 2,155 mismatch, 2,566 files are missing, 287 have no hash. Classification SOURCE_BYTE_MATCH_AT_READ_TIME. Still UNQUALIFIED: no workspace revision and no admitted snapshot. Receipt: .tmp/atlas/corpus-clustering-v1/p1-source-byte-cohort.json.

**Svelte LSP and expanded CPU sweep (2026-10-21):** the LSP qualification remains open. The four-file Svelte fixture returned stable symbol sets across two runs and produced embedded-TypeScript definitions beyond the small Tree-sitter chunk set, but rejected synthetic symbols with invalid spans. The exact-byte 25,544-file project copy, dependency link, and generated `.svelte-kit/tsconfig.json` still timed out on TypeScript-plugin `documentSymbol` (306.9 s cold, 60.0 s repeat). The existing resolver does not expose a references request. Details and receipts: `docs/reports/parent-atlas-lsp-clustering-diagnostic-20261021.md`. A stricter CPU-only sweep of the frozen 19,990 × 768 matrix completed across KMeans, MiniBatchKMeans, and spherical KMeans, `k=16/32/64/128`, three seeds and five initializations. Spherical `k=32` had highest mean pairwise ARI (0.733), while cosine silhouettes remained 0.059–0.082. These unlabeled clusters are not taxonomy, admission, or judged-query retrieval evidence. No GPU or store writes occurred.

## Symbol coverage v2, measured on the full application corpus (2026-10-21)

Same corpus and sidecar as v1 (sveltekit-frontend/src, 6,640 files). v1 is unchanged. v2 adds an explicit node-type rule.

| Rule | Valid files | All-file % | Parser-eligible % (denominator 6,624) |
|---|---|---|---|
| v1 (kinds only) | 4,584 | 69.04 | n/a |
| v2 (v1 OR named declaration node types) | 5,464 | 82.29 | 82.49 |

- v2 counts variable_declarator, function, class, interface, type alias, enum and method declarations. It includes local variables, so it is lenient. It is not a top-level registry symbol count.
- Remaining uncovered: 933 of 934 .svelte files show NO_DECLARATIONS (the one empty file is separate); 222 .ts (mostly barrel or declaration-free modules); 5 .js. 12 sidecar size rejects. 4 empty.
- The Svelte gap is the whole remaining gap. Svelte LSP real-file check on 5 files: OBSERVED, 13-114 symbols each, but 3 of 5 contain inverted synthetic spans. A full Svelte run needs per-symbol span filtering first (about 1-2 hours of LSP time).
- Threshold: 82.3% clears 80% under v2 only. 90% is not reached. The threshold and rule still need a decision.
- Receipt: .tmp/atlas/symbol-coverage-app-v2/summary.json; per-file.jsonl alongside it.

## Frozen source scan and quantization evaluation boundary (2026-10-21)

The active diagnostic scan has an independently verified checkpoint of 1,088 / 2,682 eligible `src/lib/server` sources (page 136): 1,084 clean parses, four recoverable diagnostics, 1,594 remaining, 427 explicit exclusions, and zero failures, duplicates, or datastore writes. Latest page `.tmp/atlas/indexed-source-batch-1792559106451.json`; coverage receipt `.tmp/atlas/indexed-source-server-coverage-chain-v1.json`; per-file outcome checksum `sha256:35f40f476a1a8f7379732b8733ff7eaffb8a47dfce1929a00428d2548be37ca9`. This is an intermediate diagnostic checkpoint, not exhausted coverage or admission.

The existing `sveltekit-frontend/src/lib/server/vector/quantization-recall-eval.ts` exercises per-vector min/max uint8 quantization on deterministic synthetic vectors. It is not Qdrant TurboQuant/Turbo4, does not evaluate a frozen Qdrant copy, and ranks positional indices without an explicit stable-ID tie policy. It is not valid evidence for TurboQuant readiness. A separate comparison requires a frozen point/vector sample, stable IDs, exact cosine ground truth, tie-aware recall, and checksummed results. No Qdrant collection creation or mutation is authorized.
