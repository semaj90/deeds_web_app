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

The existing behavior is split across owners:

- `sveltekit-frontend/scripts/index-codebase-fast.mjs` discovers `.svelte` files and marks a file as a component when a `<script>` tag is present. Its route/component metadata and regex-based scans are not equivalent to parsing the script body as TypeScript.
- `scripts/atlas/ast-chunk-keyed-map-v1.mjs` delegates language recognition to the 8095 capability map. Its AST-grep adapter explicitly skips Svelte; the sidecar can still take the Svelte Tree-sitter path.
- `scripts/atlas/svelte-dom-splitter-v1.mjs` already uses `svelte/compiler` to parse instance and module scripts, template nodes, event handlers, and runes. It converts original UTF-16 parser offsets to UTF-8 byte spans and records the original file digest. Its script-block spans include the surrounding tags.
- `scripts/atlas/svelte-rune-crosscheck-v1.mjs` already extracts the first script's contents, runs AST-grep with the TypeScript grammar, and adds the content's byte offset back to rune matches. This is a specific rune cross-check: it changes dollar signs to underscores in a temporary copy and does not provide general TypeScript analysis of every script block. It has no PostgreSQL persistence path.
- `scripts/atlas/lib/indexed-source-lsp-v1.mjs` and `indexed-source-nlp-v1.mjs` map TS/JS extensions, but do not map `.svelte`. The LSP helper uses `typescript-language-server`, not a Svelte-aware embedded-language projection. The NLP helper therefore labels `.svelte` input as `unknown`.
- The exact-source provider in `scripts/atlas/audit-indexed-source-providers-v1.mjs` reads one already indexed source under a read-only PostgreSQL transaction, verifies its bytes against the bound source revision, and invokes AST/LSP/NLP diagnostics. It writes a local diagnostic receipt only; it does not persist provider output to PostgreSQL or admit it to ACE.

**Review correction:** The embedded-script groundwork exists. Reuse the Svelte compiler splitter and the existing offset-remapping pattern. The remaining work is a reusable, general bridge for every instance/module script, explicit TypeScript versus JavaScript dispatch, comment extraction, and callers in the indexed-source analysis path. It needs fixtures for multiple script blocks, `context="module"`, `lang="ts"`, CRLF, Unicode, empty scripts, and malformed markup before any persisted use. The current AST-grep rune cross-check does not cover all of those cases.

An in-memory smoke check with the installed Svelte compiler 5.53.3 parsed both module and instance TypeScript scripts containing Unicode and CRLF and retained both type annotations. This checks parser capability; it does not exercise the full cross-check, 8095, LSP, or PostgreSQL admission.

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

The automatic connection still needs a caller that takes a qualified batch, invokes the Svelte/AST/LSP/NLP providers, and forwards validated observations to the existing evidence owner. The reviewed helpers and queue consumers do not prove that connection today.

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
| Svelte compiler script/template analysis | `OWNER_PRESENT_SMOKE_CHECKED` | Parser smoke accepted module/instance TS, Unicode, and CRLF; splitter maps original offsets. |
| AST-grep on embedded Svelte TypeScript | `PARTIAL_DIAGNOSTIC` | Separate first-script rune cross-check exists; generic indexed-source AST-grep still skips Svelte. |
| LSP/NLP on `.svelte` source | `NOT_WIRED` | Current helper language maps omit `.svelte`. |
| Shared CPU worker pool and batch writers | `OWNER_PRESENT` | Shared worker threads and bounded batch pipeline exist; no production pipeline caller found in the inspected source search. |
| RabbitMQ post-index AST/LSP/NLP batches | `NOT_PROVEN` | Existing embedding and downstream audit consumers have different responsibilities. |
| Persisted AST/NLP observations for every indexed source | `NOT_PROVEN` | No full-corpus producer-to-owner/readback proof established here. |
| Production admission/ACE | `BLOCKED` | Requires source-qualified evidence and a current admitted manifest. |

`likely_cause`: File discovery, language-aware parsing, revision qualification, and PostgreSQL evidence admission are separate owners without a proven corpus-wide orchestration path.

`evidence`: Source paths listed above; tracked extension inventory; dated pipeline status snapshot.

`patch_targets`: `docs/repo-analysis/atlas.md` (documentation only).

`safe_next_command`: Run the existing exact-source diagnostic only for a selected, already bound source; do not start a full-corpus pass.

`smoke_command`: `node scripts/atlas/audit-indexed-source-providers-v1.mjs <exact-source-ref> <sha256-workspace-revision> --sidecar=http://127.0.0.1:8095` (diagnostic receipt only; validate service/hash before running).

`report_path`: `docs/repo-analysis/atlas.md`.

### Review Validation

2026-10-20: indexed-source provider, PostgreSQL subhelper, and Svelte source-path suites passed 10/10 tests. The Svelte compiler smoke described above passed in memory. No live broker, 8095, database, Graphify, cache, or GPU work was invoked in this review.
