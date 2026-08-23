# Parent Atlas Workstation TODO

## Gap sweep: 3 real regressions found + fixed in atlas contract tests — 2026-08-23

Prompted by the GRAPH_SNAPSHOT_PARITY regression below, ran a targeted vitest
pass over the ~21 `src/lib/server/atlas/**` files that share the same
`...input` spread-into-`.strict().parse()` pattern as the parity bug, to see
if the same class of bug exists elsewhere. Found and fixed three unrelated,
real gaps (commits `8fa9443a89`, `057cf8d5b5`, `439e412abc`):

1. **`api-contract-observation-v1.ts` was completely unparseable** (esbuild
   transform failure) since commit `a2e4dab329`
   ("wip(atlas): restore orphaned root src tree...") — a bad merge produced
   duplicate schema keys (`treeNodeId`, `handlerSymbol`, `workspaceRevision`,
   `sourceRevision`), a helper function body spliced mid-statement with a
   second schema's tail fields, and a duplicate `export type
   ApiContractObservationV1`. Both `buildApiContractObservationV1()` and
   `compileApiContractObservationV1()`, plus their sole downstream consumer
   (`sveltekit-api-contract-observer-v1.ts`), were silently broken —
   TypeScript's own diagnostics correctly reported missing exports (initially
   mistook this for a stale/false diagnostic; it was not). Reconstructed as
   one unified base object schema shared by both observation paths
   (build-path fields optional, compile-path fields optional, joined by a
   `.superRefine()` coordinate-consistency check that's skipped when
   `coordinate` is absent). All three affected suites now pass: 5/5, 3/3, 6/6.
2. **Same commit also broke `api-contract-observation-v1.spec.ts`**: a second
   test suite's leading `import` statement had been spliced mid-body of the
   first suite's last test instead of hoisted to the top of the file,
   breaking the whole spec file's parse (0 tests could even load).
3. **A real determinism bug this corruption had been hiding**:
   `observationId()`'s hash included `inputSchemaRefs`/`outputSchemaRefs`
   sorted but not deduped, so two nominations with the same logical evidence
   set (one with duplicate refs, one pre-deduped) hashed differently —
   contradicting the function's own determinism contract. The actual
   returned object already deduped via `[...new Set(...)]`; the hash input
   didn't match.
4. **`atlas-skill-admission.spec.ts`** used `'RUN_ANALYZER'` as a
   `declaredHostRequests` value in two tests — never a valid member of
   `AtlasKernelHostRequestKindSchema`'s enum. Both tests' actual intent
   (skill-review gating, external-service allowlisting) is orthogonal to
   which host-request kind is declared; swapped to `'RETRIEVE'`.

Not pursued further this pass: `api-contract-observation-v1.spec.ts` sat
undetected for the same reason the parity bug did — nobody had re-run its
suite since the corrupting commit landed (same day, `2026-08-23`). Did not
exhaustively check all ~21 candidate files' logic beyond running their
existing test suites; only failures surfaced by the existing tests were
investigated. A fuller audit of that file list (or a repo-wide `vitest run`)
would be a separate, larger task.

## GRAPH_SNAPSHOT_PARITY regression found + fixed; reproduction confirms determinism — 2026-08-23

**Correction to an earlier draft of this entry**: this is NOT a first-time
proof. `GRAPH_SNAPSHOT_PARITY` was already closed on 2026-08-12 (see
`openspec/changes/parent-atlas-graph-validation-fabric/tasks.md`, commit
`647627d7a8`) with a committed `receipt.json` at
`sveltekit-frontend/docs/reports/graph-snapshot-parity/receipt.json` showing
the identical `status: "PASS"`, `pagerankTopKOverlap: 1`,
`pagerankCorrelation: 1`, `pagerankMaxDelta≈4.89e-9`, and
`louvainCommunityAgreement: 1` on this same frozen snapshot
(`382c8dc6-a115-40d9-a3a5-034fa44d2e71`, `nodeCount=162234`,
`edgeCount=108156`). The 2026-08-11 receipt predates `edgeProjectionDiagnostics`
being added to the schema/oracles.

Attempted to re-run `sveltekit-frontend/scripts/atlas/validate-graph-snapshot-parity.mts
--manifest docs/reports/graph-snapshot-parity/manifest.json --run-networkx
--run-cugraph` against the live-confirmed WSL2 `atlas-rapids-cu13` environment
(booted WSL2 Ubuntu, confirmed `torch.cuda.is_available()=True`, RTX 3060 Ti
visible, `cugraph 26.06.00`, `cuvs` importable) to see whether the closed
gate still reproduces. **It did not run cleanly — found a real regression**:
`buildGraphSnapshotParityReceipt()` in
`sveltekit-frontend/src/lib/server/atlas/graph/graph-snapshot-parity-contract.ts`
spread its full `input` object — including `edgeProjectionDiagnostics`, a
field used only for status derivation — into a `.strict()`
`GraphSnapshotParityReceiptSchema.parse()` call whose top-level schema only
declares that field nested under `networkx`/`cugraph`, not at the top level.
Confirmed live: both oracles had already completed real PageRank + Louvain
compute over all 162,234 nodes before the crash (four NDJSON output files,
162,234 lines each, written and gitignored under
`sveltekit-frontend/docs/reports/graph-snapshot-parity/`) — the bug only
discarded the receipt object, not the compute. Fixed by destructuring
`edgeProjectionDiagnostics` out of `input` before the spread (commit
`8fa9443a89`).

Re-run after the fix reproduced the closed gate's numbers exactly (new
`generatedAt: "2026-08-23T10:52:38.342Z"`, not yet written back over the
committed Aug-11 `receipt.json`):

- `status: "PASS"`; componentCount exact match `54078` (both backends)
- `pagerankTopKOverlap: 1`, `pagerankCorrelation: 1`,
  `pagerankMaxDelta: 4.888482368395049e-9` — identical to the 2026-08-12 receipt
- Louvain: `ARI=1.000000`, `NMI=1.000000`, community counts exact match
  (`54078` both sides), modularity agrees to ~14 significant digits
- `edgeProjectionDiagnostics` (new field, not present in the Aug-11 receipt):
  zero duplicate/reciprocal/unordered-pair issues on both backends

Net effect: confirms the 2026-08-12 closure is reproducible/deterministic,
and catches+fixes a schema regression that would have silently broken any
future re-run of this validator (e.g. CI or a scheduled re-proof) without
anyone noticing the underlying compute was still fine. Did not overwrite the
committed `receipt.json` — that is a separate decision (whether to promote
this reproduction as the new canonical receipt, or leave the Aug-11 one as
the record-of-first-proof and treat this as a regression-test artifact).
Governance note preserved from the script's own docstring: no canonical
PageRank/Louvain values were written back to Postgres/Qdrant/Neo4j by this
run, and this does not unblock FANOUT-01 or any canonical write on its own.

## TRACE / ACE / PageRank alignment recheck — 2026-08-23

The local atlas-tools MCP smoke passed `10/10`: initialization, tool listing,
descriptions, intent classification, non-destructive classification,
agentic-context assembly, and recommendation generation. The TRACE MCP smoke
passed `7/8`: health, required tool listing (`175` tools), KAG search,
context packet assembly, graph neighborhood expansion, simdjson status, and
Streamable HTTP all passed. `graph.pagerank_top` timed out and remains the
active live blocker.

The bounded NetworkX oracle was then run explicitly against the six-node
fixture and returned `NETWORKX_REFERENCE_PROVEN` with the frozen config
`alpha=0.85`, `max_iter=100`, `tol=1e-8`, and `weight=weight`. This is the CPU
reference only. The next PageRank gate is to run the matching Neo4j GDS
stream-only fixture against an isolated disposable Neo4j target, then compare
the revisioned topology/config/result receipt. Do not run the broad live
`graph.pagerank_top` path or write scores while that fixture gate is open.

PageRank next-step order:

1. Keep the six-node NetworkX receipt as the deterministic oracle.
2. Run Neo4j GDS stream mode with the same fixture and config.
3. If available, run cuGraph in the activated WSL2 `atlas-rapids-cu13`
   environment against the same logical node/edge ordinals.
4. Compare node/edge/config checksums, normalized scores, rank correlation,
   and top-k overlap.
5. Only after parity, admit bounded Qdrant-to-graph fanout and derived feature
materialization. No canonical PageRank writes are authorized yet.

ACE/agentic error-fixing remains a read/plan lane: atlas-tools can assemble
the context packet and produce a safe recommendation, while TRACE can search
KAG and expand bounded graph context. The durable `error_logs` audit and
temporal execution receipt still require an explicitly scoped database target;
no automatic patch or apply path is enabled by these MCP smokes.

The Neo4j GDS runner passes JavaScript syntax validation but was not invoked,
because it creates temporary Neo4j fixture data. A fresh activated WSL2
RAPIDS import probe produced no output and was stopped after the bounded
timeout; this does not replace the earlier successful cuVS smoke receipt.
cuGraph parity therefore remains unproven until the WSL command responds and
the same frozen graph fixture is supplied.

The attached migration-remediation note is stale relative to this checkout:
the current `20260822_graphify_revision_authority_v2.sql` contains one valid
constraint `DO $$` block and the current source-inventory writer is the v2
materializer. No v3 writer was found. A bounded dry-run of that writer was
stopped after it produced no output, so the manifest census remains unproven;
no migration was applied and no report was promoted.

The v2 writer's `--source` flag is not a bounded manifest mode: it still
constructs the complete workspace revision first and filters the selected
binding afterward. A one-file dry run therefore also exceeded the bounded
window. Treat this as a performance/observability gap in the proof harness,
not as permission to bypass the complete-manifest invariant. The next safe
implementation is a separate manifest-census mode or progress/timeout receipt
that preserves the full-manifest requirement.

Added opt-in progress callbacks to the workspace revision materializer and
wired `ATLAS_WORKSPACE_REVISION_PROGRESS=1` into the Graphify writer. Progress
reports every 250 files and at completion without changing the manifest,
identity, or apply semantics. The workspace source-binding contract tests pass
`8/8`; full-corpus materialization remains unproven until the progress-enabled
run completes. The first progress-enabled census measured `23,152` candidate
source files and reached `250/23,152` before the bounded diagnostic was
stopped. The cost is dominated by per-file content and Git hashing, not an
opaque deadlock. Keep the full-manifest invariant; optimize this path only with
an explicitly reviewed batch-hashing/progress implementation.

## OpenCode / llama-server facade alignment — 2026-08-23

The root `opencode.json` now explicitly maps `llama-server` to
`http://127.0.0.1:8090/v1` and declares `hforf.gguf` in that provider's model
map with tool calling enabled. JSON parsing and a focused configuration check
pass. This proves configuration alignment only; it does not prove that
llama-server is running or that a live tool call/receipt completed.

The local read-only llama smoke now passes `5/5`: health, model listing,
basic chat completion, tool-call response shape, and three tool-call parser
formats. This proves the `hforf.gguf` facade is reachable and emits a usable
tool-call shape. It does not prove MCP dispatch, DAG execution, durable
receipts, or production promotion.

## Fanout admission / provider alignment recheck — 2026-08-23

The read-only fanout admission command was executed from the current main
proof checkout and failed closed before opening a database connection:
`DATABASE_URL_REQUIRED`. This is configuration gating, not evidence of a
revision-owner result. No Postgres, Qdrant, Neo4j, or migration operation was
performed.

The referenced `scripts/atlas/audit-agent-runtime-alignment.mjs` and
`docs/reports/fanout-end-to-end-gap-audit-20260823.md` are not present in this
checkout. The available fanout probe is
`sveltekit-frontend/scripts/atlas/prove-fanout-admission-readonly.mts`.
Report references must not claim a generated receipt until the script and its
output exist in this repository.

Current end-to-end gate order remains:

1. Provide an explicitly scoped disposable `DATABASE_URL`.
2. Apply source-inventory and graph-snapshot migrations only there.
3. Prove the `graphify_files` writer and one-row readback.
4. Prove snapshot, node, and edge revision binding.
5. Verify `codebase_chunks_768_v2` payload lineage.
6. Build one checksummed `CandidateOrdinal` map across executors.
7. Run bounded Qdrant-to-Neo4j stream-only fanout.
8. Join the result to Postgres and emit one fusion receipt.
9. Replay to prove deterministic reuse and no duplicate work.
10. Only then persist derived graph, latent-128, or latent-64 features.

The provider alignment audit remains unchanged: server retrieval uses the Go
EmbeddingGemma `semantic_768` service; browser-local ONNX Runtime Web is a
utility lane; older helpers still use Ollama; no active FastEmbed or DirectML
server owner was found. AST-grep/Tree-sitter, Rust/N-API, Python sidecar,
simdjson/C++, PyTorch/LibTorch, Neo4j, Qdrant, TurboVec, and RAPIDS are
separate executor or challenger lanes. Their common fanout contract still
requires revision-qualified identity and CandidateOrdinal checksums.

The AST corpus remains `CORPUS_PARITY_MISMATCH` with provider-level semantic
and chunk-span disagreements. UTF-8 source bytes are frozen, but the Node
provider's JavaScript string offsets required conversion to UTF-8 byte spans.
That coordinate defect is now repaired and covered by a CRLF/non-ASCII
regression test; Node structural promotion remains gated on the remaining
provider-neutral parity decision.

Current bounded rerun after the coordinate repair is: runtime `66/66`, source
bytes `66/66`, Node span self-validity `66/66`, sidecar span self-validity
`66/66`, named-symbol coverage `44/66`, semantic-kind parity `42/66`, exact
span parity `2/66`, and full parity `2/66`. Mismatches now include `606
EXACT_SPAN_MISMATCH`, `18 NAMED_SYMBOL_MISSING_LEFT`, `61
NAMED_SYMBOL_MISSING_RIGHT`, and `6 SEMANTIC_KIND_MISMATCH`. This is now a
provider extraction/chunk-boundary blocker before semantic promotion; do not
use the older 57/66 semantic result for planning.

## Main fanout package-boundary check — 2026-08-23

The bounded main-worktree fanout run passed `22/22` assertions across graph
snapshot identity, Qdrant CandidateOrdinal adaptation, dense executor mapping,
and graph/Qdrant alignment. The combined snapshot-revision, source-binding,
fanout, identity, and Qdrant-adapter lane now passes `26/26`.
After declaring and installing the local
`@deeds/parent-atlas` runtime dependency, the fanout-admission suite also passes
`7/7`. Its fixture now uses canonical `sha256:<64-hex>` workspace and source
inventory revisions. This is fixture proof only: dependency build health,
persisted snapshot readback, and live fanout admission remain separate gates.
No migration or live fanout admission is authorized.

The rebuilt SvelteKit consumer lane now passes `60/60` across graph snapshot
revision/source binding, fanout admission, CandidateOrdinal Qdrant mapping,
graph expansion, typed incidence, semantic graph evidence, hypergraph
retrieval, RAPIDS PageRank client contracts, and bounded BFS parity. This is
consumer fixture proof against the rebuilt package boundary; it does not
authorize live Neo4j, Qdrant, or Postgres operations.

The read-only graph snapshot materialization/parity lane also passes `18/18`
across snapshot materialization, parity contract/export, and authority
feature-flag tests. These are deterministic fixture proofs; they do not prove
live Postgres snapshot persistence, Neo4j reachability, or canonical graph
promotion.

The graph-expansion and semantic/hypergraph contract lane initially lacked the
declared `neo4j-driver` runtime dependency. After adding `neo4j-driver` and
installing the SvelteKit dependencies, the bounded expansion, algorithm
policy, incidence, semantic evidence, hypergraph retrieval, and spectral-plan
tests pass `28/28`. This proves module and fixture wiring only; no Neo4j
connection or graph mutation was performed.

The graph-authority contract sweep also passed `6/6` for the RAPIDS PageRank
client and BFS parity lane. The PageRank parity spec had a duplicate fixture
declaration; that was removed, and its child runner passes syntax validation.
The root `package.json` now declares `neo4j-driver` because the PageRank runner
executes from the repository root. Full PageRank parity remains pending on an
isolated disposable Neo4j target because its runner creates fixture graph data;
it was not run against the shared instance.

The main-repo package boundary is now freshly buildable: `@deeds/atlas-core`
and `@deeds/parent-atlas` both compile from source. The complete rebuilt
Parent Atlas Node suite passes `250/250` with zero failures, skips, or todos.
This closed package-level regressions in canonical exports, ACE checksum
normalization, insufficient-evidence receipt retention, retrieval-cache
defaults, and temporal plan identity. It is package/fixture proof only; live
Postgres temporal receipts, Graphify revision-owner readback, Neo4j PageRank
parity, Qdrant population, and production dispatch remain unproven.

The package source boundary remains explicit: `packages/atlas-core` owns pure
canonical contracts and `packages/parent-atlas` owns Atlas orchestration and
adapters. SvelteKit consumes those packages and does not become a second
Parent Atlas source. No migration, canonical-store write, or production
promotion was performed.

The current read-only revision-owner canary was attempted from
`sveltekit-frontend/scripts/atlas/prove-code-revision-owner-canary.mts` and
failed closed with `DATABASE_URL_REQUIRED`. Therefore the historical
`REVISION_OWNER_NOT_READY` observation is not refreshed by this run. A named
isolated database URL is still required before the canary or temporal durable
round-trip can be executed; no fallback URL was inferred and no database write
was attempted.

The local Postgres proxy transport is reachable on `127.0.0.1:5434`, but that
does not establish database identity or authorization. The canary must receive
an explicitly scoped non-production `DATABASE_URL`; it must not infer
credentials from the proxy or embed a fallback URL.

## Embedding / AST / native-runtime alignment — 2026-08-23

The repository currently has three distinct EmbeddingGemma paths, not one
proven replacement:

- Server retrieval uses the dedicated Go embedding service at `:8097`, with
  `semantic_768` and Qdrant as the downstream projection.
- Browser-local EmbeddingGemma uses `onnxruntime-web` with
  `WebGPU -> WASM -> CPU`; this is a client utility lane and is not the server
  embedding authority.
- SvelteKit helper code and older retrieval fallbacks still call Ollama
  `embeddinggemma:latest` at `:11434`.

The audit found no active FastEmbed registration. A DirectML branch does exist
in `sveltekit-frontend/src/lib/server/ai/onnx-server.ts`, but it is opt-in via
`EMBEDDING_BACKEND=onnx_directml` on Windows and is not the configured server
authority. `:8090` is the local chat/synthesis llama-server lane, not the
canonical embedding endpoint. Native LibTorch/N-API
and Rust SIMD/N-API sources exist, while AST-grep/Tree-sitter Python/Node
providers and C++/CUDA GEMM sources are present as separate adapters or
challengers. Their runtime parity and production ownership remain distinct
proof gates.

Latent `128/64` values appear as derived routing/cache representations. They
must remain revision-qualified features and never be treated as replacements
for the canonical EmbeddingGemma representation or as independent retrieval
votes. The remaining alignment work is to produce one embedding runtime
receipt (model, prompt, dimension, provider, normalization, checksum) and
bind all server writers to it before any Neo4j/Qdrant fanout or latent index
promotion.

The receipt contract already accepts `onnxruntime`, `fastembed`, and
`DIRECTML`, but that is contract capability rather than provider evidence:
there is no focused receipt-spec file and no active FastEmbed registration was
found. The next implementation should add a fixture-only provider matrix
test, then emit receipts for the actual Go/Ollama server path and the optional
ONNX/DirectML path. It must not mark the browser ONNX utility or a declared
FastEmbed executor as the canonical server owner without parity and writer
readback evidence.

The fixture-only provider matrix now passes `6/6` for llama.cpp/CUDA,
ONNX Runtime/CUDA, ONNX Runtime/DirectML, and FastEmbed/CPU receipt shapes,
including rejection of non-768 output and non-L2 normalization. This proves
receipt validation only; it does not prove any provider is installed, active,
or authorized to write canonical embeddings.

## Hardware specialization reconciliation — 2026-08-22

The stale hardware branch was not merged wholesale. Its eight relevant commits
were selectively carried onto a clean local `main` proof worktree. The SM86
contract, profile materializer, estimator identity, and promotion tests are
present. Focused validation passed `5/5`, and TypeScript emitted no diagnostics.

Status is `SM86_ESTIMATOR_CONTRACT_PROVEN` but
`HARDWARE_SPECIALIZATION_WRITTEN_UNPROVEN`: no real RTX 3060 Ti benchmark,
KernelPerfReceiptV1, cuTile autotuning receipt, CUTLASS profiler receipt, or
TARGET_VALIDATED promotion exists. CUTLASS analytical heuristics remain
unsupported for `sm_86`; learned SM86 models remain estimates only. See
`docs/reports/hardware-specialization-sm86-proof-20260822.md`.

## Current execution-proof reconciliation — 2026-08-21

The active worktree is `C:\Users\james\Videos\deeds-web-app`. This section
records verified state for this checkout; reports from other worktrees are not
treated as proof here.

- Canonical Parent Atlas source: `packages/parent-atlas`.
- Parent Atlas package build passes with the package-local command
  `npm --workspaces=false run build`; the plain `npm run build` wrapper is
  incompatible with the repository’s root `.npmrc` setting
  `workspaces=false`.
- Parent Atlas temporal package specifications pass `51/51` across ledger,
  sequence reservation, Postgres repository fixtures, alternative selection,
  recommendation history, workflow adaptation, and outcome receipt contracts.
  These remain fixture/package proofs, not live Postgres durability proof.
- SvelteKit temporal adapter and LangGraph control-plane fixtures now pass
  `29/29`: boundary/recorder tests `19/19`, tool-shim and closed-loop tests
  `6/6`, and DAG success/persistence-disabled tests `4/4`. A transient
  `.svelte-kit` missing-file warning appeared during the DAG run, but the
  targeted suites completed successfully.
- Ran `npx svelte-kit sync` successfully. The subsequent full
  `svelte-check --tsconfig ./tsconfig.json` still produced no diagnostics after
  90 seconds and was stopped as a bounded environment check; it is not marked
  passed or failed. Targeted temporal tests remain the current SvelteKit proof.
- The separate SvelteKit script check (`check:scripts:stable`) fails on a broad
  pre-existing workspace baseline with more than 1,000 diagnostics, including
  missing database exports, Redis typing mismatches, legacy TurboVec scripts,
  Qdrant nullable-payload types, and old 512-dimension code. This does not
  invalidate the focused Graphify/temporal suites, but it blocks a clean
  workspace-wide typecheck.
- Restored the missing `GraphifyWorkspaceManifestReceiptV1` source/spec that
  the materializer imports. Its focused tests pass `2/2`, and a one-file
  read-only materializer run now completes with `DRY_RUN_PROVEN` and
  `sourceCount=1`; no row persistence was attempted.
- `GraphSnapshotRevisionV1` now owns workspace/source/graph lineage at snapshot
  level; node and edge projections remain bound through `snapshot_id`.
- Graph snapshot revision fixture tests pass 3/3.
- The explicit six-node NetworkX/Neo4j PageRank fixture passes with top-k
  overlap `1`, Spearman `1`, and max score delta `2.7548415493239276e-9`.
- FANOUT-01 remains blocked pending persisted snapshot readback, selected
  node/edge binding, canonical identity agreement, and Qdrant `semantic_768`
  lineage.
- Code revision compatibility semantics are now fixture-proven: exact source
  bytes may be selected as `content_hash` authority while preserving legacy
  Git `source_revision`; this does not bind a durable writer or unlock FANOUT.
- The Graphify source-inventory write plan now freezes the authority column,
  preserves legacy `source_revision`, and remains explicitly non-authorizing
  until a readback canary succeeds.
- Added the read-only code revision owner canary. It compares historical
  `graphify_files` rows to current repository bytes and Git provenance when
  that table exists; absence or mismatch remains a hard block.
- Main-checkout canary result: `REVISION_OWNER_NOT_READY`; `graphify_files` is
  absent, so no historical source-inventory owner is available. Git HEAD was
  observed, but no canonical writer or persistence target was inferred.
- Main-checkout graph snapshot readback result:
  `SNAPSHOT_OWNER_READBACK_PROVEN_REVISION_BLOCKED`. The snapshot, node, and
  edge tables read back successfully for snapshot
  `382c8dc6-a115-40d9-a3a5-034fa44d2e71` with `162234` nodes and `108156`
  edges, but workspace/source/graph/producer revisions are missing from the
  manifest. `revisionOwnerProven=false` and canonical writes remain false.
- Added unapplied manual migration
  `drizzle/manual/20260821_graphify_source_inventory.sql` with explicit
  workspace/source indexes and constraints. Applying it remains a separate
  non-production operation; it does not authorize row population or FANOUT.
- Rollback-only migration proof passed: the temporary `graphify_files` table,
  columns, constraints, and indexes were validated in one transaction and
  rolled back. Durable `graphify_files` state remains absent.
- Migration safety audit found an older repository-only `drizzle/001_graphify_lineage.sql`
  definition with incompatible columns and constraints. The manual migration
  now fails closed if `graphify_files` already exists; it never drops, deletes,
  truncates, or rewrites existing rows.
- The owner canary now requires the complete source-inventory schema and
  reports an incompatible legacy table separately instead of treating three
  legacy columns as a canonical-owner signal.
- The actual read-only fanout admission proof now loads the shared Atlas
  environment and reaches its database/Qdrant gates. Current result is
  `GRAPH_SNAPSHOT_REVISION_MIGRATION_REQUIRED`: all six required snapshot
  revision columns are absent and the node source-revision column is absent.
  The proof attempted zero Postgres, Qdrant, or Neo4j writes.
- The two existing 2026-08-22 revision-owner migrations now have documented
  rollback-only proofs. Snapshot migration proof observed the existing graph
  snapshot/node tables; Graphify authority proof observed temporary
  `graphify_runs`/`graphify_files` tables. Both rolled back with durable state
  unchanged. Neither migration has been applied.
- Added `GraphifyWorkspaceManifestReceiptV1` to distinguish one-row writer
  evidence from full workspace completeness. It requires expected/persisted
  source counts plus exact source-revision and content-digest counts before a
  manifest can be marked complete; it remains observational and non-authoritative.
- Updated the source-inventory dry-run materializer to derive logical
  `workspaceRevision` from the exact source manifest and per-file
  `sourceRevision` from exact content SHA-256. A bounded `--source` run now
  explicitly reports `workspaceManifestComplete=false` rather than using Git
  HEAD as canonical lineage.
- Full read-only inventory pass completed for `4996` source files with zero
  read failures. The pass is correctly classified as `BOUNDED_LIMIT` and
  `workspaceManifestComplete=false` because the configured 5000-source cap was
  reached; Git blob provenance is now loaded once from `git ls-tree` instead of
  spawning one subprocess per file.
- Uncapped read-only candidate pass completed for `24612` source files with
  zero read failures. It produced `WORKSPACE_CANDIDATE`,
  `workspaceManifestComplete=true`, and a complete manifest receipt. This is
  still an observation/dry run only; no Graphify rows were persisted. The
  materializer now excludes its own generated plan from the candidate set;
  two consecutive uncapped runs reproduced the same `24612` count and
  workspace-manifest checksum.
- Read-only EMB3A Qdrant lineage audit sampled 250 points from
  `codebase_chunks_768_v2` and remains `EMB3A_BLOCKED_BY_UPSTREAM_LINEAGE`;
  no projection or vector mutation was attempted.
- Drizzle/sidecar audit recognizes the repository’s manual-sidecar inventory;
  the live database still has no `graphify_files` owner. The broader audit
  reports 75 live undeclared active tables and 998 column-drift findings, so
  those findings remain a separate schema-reconciliation lane and do not
  authorize applying this migration or promoting FANOUT.
- PostgreSQL 18.4 runtime proof is now confirmed against the shared
  `DATABASE_URL`: `io_method=worker`, `io_workers=3`, and the read-only Atlas
  workload census reports `61660` packets and `52417` codebase chunks, of
  which `52380` have embeddings. AIO/bitmap workload benchmarking and
  `pg_stat_io` evidence remain open; this is capability evidence only.
- Host-side PostgreSQL references in the active architecture/audit paths now
  use `127.0.0.1:5434`; container-internal `5432` references remain explicitly
  labeled as the Docker target. This sweep did not change unrelated archived
  or isolated-database references.
- Application-facing readiness check passes against PostgreSQL `127.0.0.1:5434`,
  Redis `6379`, RabbitMQ `5672`, Qdrant `6333`, and optional Bifrost `3040`.
  Service reachability does not promote any schema, graph, vector, or receipt
  lane.
- Read-only target identity is `legal_ai_db` / `legal_admin`, server address
  `172.18.0.21`, internal port `5432`, data directory
  `/var/lib/postgresql/18/docker`, and `pg_is_in_recovery=false`. The runtime is
  Docker-backed through a host-side proxy on `5434`; it is explicitly not a
  disposable migration target. `deploymentRole=PROXY`,
  `migrationAllowed=false`, and all Graphify migrations remain unapplied.
- No production Postgres, Qdrant, Neo4j, or Valkey writes were performed.

### Next gates

- [x] Run the snapshot revision/readback proof: tables and selected node/edge
  bindings read back, but manifest revisions remain incomplete.
- [x] Run the code revision owner canary: correctly blocked because
  `graphify_files` is absent.
- [x] Run the one-file source-inventory dry run and verify exact-byte hashing.
- [ ] Apply the source-inventory migration only in a named non-production
  database; do not apply it to production.
- [x] Prove the migration in a rollback-only transaction with
  `prove-graphify-source-inventory-migration.mts` before any durable apply.
- [ ] Rerun the owner canary and require the table/schema gates to pass.
- [ ] Run one explicit non-production `--apply --source <one-file>` operation
  with both confirmation gates enabled, then verify persisted row readback.
- [ ] Bind graph snapshot manifest revisions to the verified source-inventory
  record and rebuild only in the non-production proof database.
- [ ] Prove Qdrant `semantic_768` candidate identity and graph revision agree.
- [ ] Only then enable FANOUT-01 CandidateOrdinal normalization.

### Remaining lane gaps

| Lane | Current gap | Promotion condition |
|---|---|---|
| Source/revision owner | `graphify_files` absent; no durable writer bound | Migration, one-row readback, then bounded writer proof |
| Graph snapshot | Snapshot/node/edge readback works; manifest lacks workspace/source/graph/producer revisions | Revision-qualified manifest readback |
| FANOUT | CandidateOrdinal normalization still blocked | Snapshot identity + Qdrant `semantic_768` lineage agreement |
| PageRank | Six-node NetworkX/Neo4j fixture proven; full-scale NetworkX/cuGraph PageRank+Louvain parity (`GRAPH_SNAPSHOT_PARITY`, 162,234-node frozen snapshot) closed 2026-08-12, reproduced 2026-08-23 after fixing a schema regression (see above) | Neo4j GDS stream-mode leg of the six-node fixture still open; no canonical writes |
| Temporal DRY | Fixture contracts pass; durable PostgreSQL round trip open | Manual migrations plus first-dispatch/reuse readback |
| Qdrant dense | Historical v2 identity/revision population incomplete | Active writer census and bounded identity readback |
| Sparse | Runtime owner and relevance labels absent | Ground-truth evaluation and explicit sparse owner |
| cuVS/CAGRA/TurboVec | Executor capability exists; production parity not closed | Same-corpus exact oracle, identity, recall, and memory receipts |
| BitFrost compression | Hot bitmap path must remain raw/zero-copy | Benchmark-only compression lane; no hot-path Huffman promotion |
- [ ] Only after migration + canary approval, run the explicitly confirmed
  non-production `--apply` path and verify one-row readback.

---

**Status**: LAYER 1 🟡 FIELDS POPULATED, IDENTITY MODEL NOT YET PROVEN (see corrected section below, 2026-08-02) | EXPORT STACK ✅ READY | LANE ALIGNMENT ⏳ IN PROGRESS

---

## Current near-term TODO snapshot — 2026-08-12

This snapshot keeps the user-facing board short and separates created/wired from proven.

### High Priority

- [ ] Fix template generation endpoint
- [ ] Add audit logging
- [ ] Redis-valkey connection pooling
- [ ] Wire Qdrant reranking
- [ ] Wire Neo4j expansion

### Medium Priority

- [ ] MCP report tools
- [ ] Evidence version history
- [ ] Report streaming AI
- [ ] Template marketplace
- [ ] Evidence bulk upload

### Low Priority

- [x] Implement concept extraction — local Tree-sitter / POS / domain classifier logic is live; durable write / feedback proof is still open.
- [x] Wire LangExtract integration — code evidence synthesis is wired through the worker lane; end-to-end durable write is still open.
- [ ] Add TurboVec sync
- [ ] Integrate openai-compatible `8090` llama-server summary pipeline

**Proven / wired but not done**:

- `feature_matrix_5` writer is now wired as the first code lane receipt surface.
- `code_evidence_synthesizer` now builds a durable receipt from the POS / concept packet.
- `code_feature_registry` now threads that receipt through the worker path.
- The durable Postgres / outbox plane is still the gating failure for `DONE`.

---

## Event Plane

PostgreSQL is the canonical task, gate, checkpoint, and outbox store for Atlas work. RabbitMQ handles durable async dispatch, Redis / Valkey holds hot context and leases, Arrow + `mmap` hold immutable batch snapshots, and gRPC / Protobuf carries typed sidecar commands. Browser-local work stays in Web Workers, IndexedDB, Service Workers, and SharedArrayBuffer; those are compute or cache lanes only, not canonical state.

Current lane map:

- Postgres: canonical identity, packet spine, provenance, and recommendation log.
- Qdrant: main codebase chunk retrieval lane, retrieval mirror, and named-vector / multivector semantic analysis lane.
- Neo4j: CPU/JVM topology lane for PageRank, graph expansion, and multi-hop context; not GPU-enabled by Docker passthrough.
- Redis / BitFrost: hot packet cache, centroid routing, and short-lived replay state.
- cuVS / GPU: ANN staging, rerank input, batch graph analysis, and benchmark lanes in a separate analytics service.
- Token cache: exact model-state reuse only; key on model/tokenizer/prefix/config revisions, not on query similarity.
- Inference: embeddings and generation compute only; do not let it decide identity or promotion.
- Retrieval: candidate gathering and reranking only; no canonical truth or schema ownership.
- Feature / geometry: numeric evidence, routing scores, and 4D metric-tensor diagnostics only.
- Graph: PageRank / communities / k-core / betweenness / bounded traversal evidence.
- Hypergraph: n-ary relation and event structure lane for joint facts, not a second retrieval owner.
- GNN / graph-message passing: graph evidence and neighborhood expansion for recommendation inputs, not truth.
- exact kNN: canonical `semantic_768` nearest-neighbor retrieval and replay proof.
- KMeans / SOM: coarse cache-hint routing only; never canonical truth.
- Ewin Tang / low-rank: approximation and shadow-reduction lane only.
- HyperLogLog: breadth telemetry projection only; never policy or identity.
- Kanban task board: execution receipts and next-action surface, not a canonical owner of truth.
- Recommendation: deterministic baseline + exact oracle + shadow promotion, with outputs attached to the task board.
- `embeddinggemma`: canonical embedding family at `768`; any `384`-dimensional artifacts are migration evidence only, not an active retrieval lane.
- `768`: main codebase chunk lane.
- `384`: legacy migration / projection evidence only; never an active retrieval lane.
- `64`: routing / clustering lane only.
- `okf` YAML: declarative contract lane for LDR, semantic labeling, and workflow metadata.
- Firecrawl / Pydantic: research ingestion, validation, and schema-gated extraction lane.
- PyTorch / TorchInductor: GPU training, reranking, compiled numeric kernels, and sidecar analytics.
- atlas-tools: query-context preamble lane for intent, retrieval hints, and compact RAG injection.
- ACE packet: assembly / materialization lane for compact synthesis output and packet persistence.
- ACE packet: compact synthesis and semantic labeling output, not raw corpus state.
- TileKey / LOD memory hierarchy: design-only memory management model; 4D coordinates map to logical TileKey, never a GPU pointer directly.

### Current live owners discovered in this review

| Lane | Status | Owner files | Notes |
|---|---|---|---|
| MCP transport / `/mcp` / `/sse` | created + wired; proof pending | `sveltekit-frontend/src/routes/api/mcp/+server.ts`, `sveltekit-frontend/src/routes/api/sse/chat/+server.ts`, `sveltekit-frontend/src/lib/server/mcp/trace-http.ts` | The route handlers and HTTP client exist; keep TRACE core enabled and sidecars opt-in until transport matches are confirmed live. |
| Claude-Mem export/import | created + wired; export-path alignment pending | `sveltekit-frontend/src/lib/server/memory/claude-mem.ts`, `sveltekit-frontend/src/lib/server/memory/claude-mem-ingest.ts` | Dynamic import plus ingest pipeline exist; importer runs stay blocked until the export path is aligned. |
| Engram ingestion | created + wired; deferred | `sveltekit-frontend/src/lib/server/ai/engram-memory.ts`, `sveltekit-frontend/src/lib/server/memory/local-engram-memory-adapter.ts` | The memory lane is present, but the persistent ingestion lane stays deferred until transport and importer paths are stable. |
| Redis 8 eval cache | created + wired; eval-only | `sveltekit-frontend/src/lib/server/cache/*`, `sveltekit-frontend/src/lib/server/ace/ace-context-pack-cache.ts` | Keep Redis 8 isolated as an eval lane and compare it only after the current ACE context cache lane is stable. |
| Feature-gap registry | created + wired; live scan pending | `sveltekit-frontend/src/lib/server/atlas/master-feature-map.ts`, `sveltekit-frontend/src/lib/server/atlas/route-feature-map.ts`, `sveltekit-frontend/src/lib/server/atlas/runtime-registry.ts` | Current inventory exists, but the bootstrap registry still needs a live app workspace scan. |
| OKF / taxonomy / ontology / linked tuples | created + wired; schema and navigation live | `docs/.okf/schema.yaml`, `docs/.okf/registry.yaml`, `docs/.okf/README.md`, `sveltekit-frontend/src/lib/server/atlas/domain-taxonomy.ts`, `sveltekit-frontend/src/lib/server/ontology/ontology-extractor.ts`, `sveltekit-frontend/src/lib/server/atlas/contracts/ontology-linked-tuple-v1.ts`, `sveltekit-frontend/src/lib/server/atlas/pos-concept-tagging-lane.ts` | `schema.yaml` is the schema source of truth, `registry.yaml` is the navigation layer, and the live runtime contracts stay in their existing owners; use this lane for codebase topology classification, domain classification, POS / concept tagging, and ontology linking, but not semantic truth or identity ownership. |
| ClusterCard / GlyphRecord / CHR97 | created; mapping pending | `sveltekit-frontend/src/lib/server/retrieval/cluster-card-contract.ts`, `sveltekit-frontend/src/lib/server/cartridge/glyph-record.ts`, `sveltekit-frontend/src/lib/server/cartridge/chr97-builder.ts` | Keep this downstream of transport proof and registry proof. |

### OKF / telemetry / ontology-linked tuple boundary

This is a contract block, not a new owner.

- `timestamp`: provenance only. Use it to order or compare events, not to define identity.
- `HyperLogLog`: telemetry only. Use it for approximate breadth counts such as distinct workflows,
  symbols, users, packets, and retrieval neighborhoods. Do not use it to decide eviction or
  canonical cache truth.
- `OntologyLinkedTuple`: evidence layer only. Keep it as `subject / predicate / object / evidenceRef`
  with explicit `sourceRevision`, `representationRevision`, and producer revision fields. It is a
  linked evidence record, not semantic truth.
- `DomainClassification`: OKF / taxonomy lane. Use it for domain labels and ontology navigation.
- `Low-rank sampling`: retrieval / approximation experiment only. Keep Tang-style sketching with the
  retrieval LOD / algorithm taxonomy lane, not the ontology lane.

Suggested field list:

```ts
type OntologyLinkedTuple = {
  subject: string;
  predicate: string;
  object: string;
  evidenceRef: string;
  timestamp: string;
  sourceRevision: string;
  representationRevision: string;
  producerId: string;
  producerRevision: string;
  domainClass?: string;
};

type TelemetryBreadth = {
  packetKey: string;
  workflowHllKey?: string;
  symbolHllKey?: string;
  userHllKey?: string;
  neighborhoodHllKey?: string;
  countedAt: string;
};
```

Ownership boundaries:

- OKF / ontology owns classification and linked-evidence navigation.
- Workstation telemetry owns HyperLogLog breadth counters.
- Retrieval / approximation owns low-rank sampling experiments.
- Neither HyperLogLog nor low-rank sampling may rewrite canonical packet identity or semantic truth.

### Current Proven Stop State — 2026-08-10

This is the durable sequencing record. T6c is complete as an experiment and must not be reopened
as if KMeans still needs first proof.

T6c proven
↓
KMeans routing experiment stays CACHE_HINT_ONLY
↓
SOM 20×20 remains a separate cache-hint experiment
↓
Arrow mmap → pinned host → exact GPU tile
↓
ACE / BitFrost / Valkey residency
↓
GA8 wide ablation
↓
GA9 feature promotion
↓
deterministic HMM + linear policy baseline
↓
DSPy program contract
↓
GEPA reflective optimization
↓
4D geometry / Jacobian experiments
↓
HyperGraphRAG GPU experiments
↓
QLoRA / SFT
↓
DPO
↓
PPO only if still justified

## ACE / RLM / BitFrost / simdjson ownership boundary

This is a deferred workstation integration lane, not a new retrieval or truth
owner. The ownership contract is:

```text
Postgres       canonical packet, playbook, revision, and receipt truth
SearchRuntime  retrieval lanes, canonical identity resolution, and RRF fusion
RLM            bounded recursive evidence decomposition above SearchRuntime
ContextManifest exact selected-context boundary for model execution
ACE            Generator/Reflector/Curator policy feedback from receipts
Valkey         BitFrost hot cache and invalidation acceleration only
C simdjson     optional JSON/JSONL parsing accelerator behind PERF0
```

Required stop conditions:

- RLM cannot introduce a second fusion algorithm or canonical identity.
- BitFrost cache misses, expiry, eviction, and Valkey outages must fail open to
  canonical sources.
- ACE playbook changes require receipt-backed review and Postgres persistence.
- simdjson cannot replace Zod/Pydantic semantic validation.
- Qdrant, cuVS, CAGRA, and any future Valkey vector experiment remain one
  logical dense lane under SearchRuntime/RF5 semantics.

Detailed deferred tasks are tracked as `ACE-RLM-01..08`, `BF-01..06`, and
`SIMD-01..04` in `docs/parent-atlas-workstation-gpu-runtime-backlog.md` and
the GPU sidecar OpenSpec.

## T6c current proven stop state

1. Canonical source representation is frozen `semantic_768`.
2. KMeans artifacts were produced for `K ∈ {64, 128, 256}` with centroid, membership, and provenance artifacts persisted.
3. Each clustering configuration was evaluated against the already-proven T3a exact cosine oracle.
4. KMeans achieved useful corpus reduction but did not preserve perfect Recall@10, so it is `KMEANS_ROUTING_EXPERIMENT_PROVEN` and `CACHE_HINT_ONLY`.
5. SOM remains a separate 20×20, 400-cell topology experiment and must be evaluated with the same exact-oracle methodology before any promotion.
6. Do not rerun T6c to increase coverage, and do not use KMeans membership as canonical packet identity.
7. Do not start AE, RRF, Neo4j projection, or GA8/GA9 promotion from this lane.
8. Do not silently substitute 384-dimensional vectors; future compressed latents must be separately revisioned experiments.

## Phase 3 canonical 768-dim note

Phase 3 uses the frozen `semantic_768` representation everywhere in the live path.
`384`-dim references are legacy or derived lanes only; they do not become canonical writers,
canonical retrieval truth, or new owner boundaries.

- Stage 3B: community_id propagation and AST symbol extraction.
- Stage 3C: SOM 20×20 as a separate 400-cell topology experiment over `semantic_768`.
- Stage 3D: reranker feature preparation from packet evidence.

`latent_64` is legacy routing compatibility only. Any future latent compression work should be a
separately revisioned experiment, with `latent_128` the more plausible candidate if one is needed.
The phrase `kmeans 20x20` is not the correct terminology; KMeans uses `K ∈ {64, 128, 256}` and SOM
is the separate 20×20 topology experiment.

## Separate lane: Kafka / CDC / Rust sidecar analysis

This workstream is design-only until explicitly opened as its own task.

- Kafka / CDC is not part of the current T6c or Graphify sequence.
- PostgreSQL 18 specifics are not a canonical owner here; they are an integration target only if a
  separate ingestion lane proves they matter.
- Rust sidecar analysis is a separate infrastructure lane, not a replacement for the current
  Python / SvelteKit / GPU split.
- Do not let bitmap / aio / CDC ideas redefine the `semantic_768` routing proof.
- If this lane is ever opened, it should start from evidence of a real producer / consumer gap,
  not from the KMeans or SOM evaluation path.

## Sequencing and Gate Order

### P2 transport and ingestion gates

1. Finish the MCP / `/mcp` / `/sse` diagnostics.
2. Keep TRACE core enabled and optional sidecars opt-in until transport matches are confirmed.
3. Resolve Claude-Mem export path alignment before any importer run.
4. Keep the persistent Engram ingestion lane deferred until the transport and importer path are stable.
5. Keep Redis 8 isolated as an eval lane and compare it only after the current ACE context cache lane is stable.

### P2 registry and retrieval policy

1. Replace the bootstrap feature-gap registry with a live app workspace scan when the mounted codebase is available.
2. Ingest the current feature inventory into the registry and mark each lane as implemented, partial, missing, or eval-only.
3. Keep the retrieval policy explicit: exact cache first, then semantic cache, then retrieval, then packet assembly.
4. Keep single-fact lookups on vector search, code navigation on agentic search, and graph-heavy data on graph lanes.

### P3 storage, cards, and synthesis

1. Build ClusterCard flow from reviewed sourceRefs and table contracts.
2. Keep the semantic cache policy split between Redis exact-card lookup and Qdrant dense retrieval.
3. Add graph refresh manifest discipline with version/hash and promotion state.
4. Wire synthesis consumers only after the packet/version contract stays stable.

### P3 validation and structural promotion

1. Stabilize the 768d -> 64d latent -> cluster -> JSON graph path.
2. Define the canonical ClusterCard -> GlyphRecord -> CHR97 mapping.
3. Keep manifold4 as a later analytical lane, not a correctness gate.
4. Treat the ACE Context Pack Cache / NES Cartridge Cache as Redis-hot-pointer plus Postgres-durable storage only; large snapshot storage stays open.

### P4 semantic memory and checklist mining

1. Keep the semantic indexer as a first-class lane.
2. Keep its outputs consumable by the feature-gap registry without rereading whole corpora.
3. Keep the semantic lane aligned with the ACE/NES packet contract and version field.
4. Add smoke/report outputs to registry rows for retrieval lanes and feature-map lanes.
5. Use LangChain later only as an optional organizer for messy `.md` / `.json` after LangExtract.

### Token remapping and geometry lanes

1. `autoencoder`: default lane for token remapping, latent projection, and route compression.
2. `decoder-upscale`: optional reconstruction / upscaling lane; do not make it the identity owner.
3. `bvh-geometry`: spatial traversal and visualization lane only.
4. `riemannian-geometry`: metric-tensor and distortion diagnostics lane only.
5. `kmeans-64-128-256`: centroid routing topology lane; do not label it `kmeans-20x20`.
6. `som-20x20`: separate 400-cell cache-hint topology experiment, not KMeans.
7. `glyph-animation`: NES / CHR97 / sprite visualization lane; never the canonical retrieval lane.

### Optional downstream phases

1. Phase 10B TurboVec + Qdrant optimization.
2. Phase 11 cuVS / CUDA sidecar benchmark.
3. Phase 12 CUDA streams / tensor bridge / RNN experiments.
4. Phase 13 graph synthesis + feature MapReduce.
5. Phase 14 DuckDB + LangGraph + Langfuse.
6. Phase 15 feature labeling + pruning.
7. Phase 16 implement missing features.
8. Phase 17 optional LangChain organizer after LangExtract.
9. Phase 18 WebGPU TypeScript MapReduce matrix and CUDA/libtorch experiments.
10. Phase 19 deterministic HMM + linear policy baseline.
11. Phase 20 DSPy program contract for Atlas agent programs.
12. Phase 21 GEPA reflective prompt/program optimization on RouteTrace and eval traces.
13. Phase 22 XGBoost / gradient boosting / reinforcement-learning experiments.
14. Phase 23 QLoRA / SFT.
15. Phase 24 DPO.
16. Phase 25 PPO only if still justified.

Phase 18 and Phase 22 overlap conceptually for boosting-based work; treat Phase 18 as the current
evaluation surface and Phase 22 as any later learned-policy experimentation, or you create two
owners for the same capability.

### Conservative phase-status snapshot

| Phase | Status |
|---|---|
| Phase 11 Engram/Gemma4 memory wiring | partial |
| Phase 12 Parent Atlas codebase index | partial |
| Phase 13 feature-gap registry completion | partial |
| Phase 14 Redis exact-card cache policy | implemented |
| Phase 15 Qdrant semantic lane | implemented |
| Phase 16 Graph/KAG/DAG refresh manifest | partial |
| Phase 17 PyTorch feature extraction lane | partial |
| Phase 18 XGBoost / gradient tree boosting reranker | partial / evaluation surface |
| Phase 19 deterministic HMM + linear policy baseline | partial |
| Phase 20 DSPy program contract | planned |
| Phase 21 GEPA reflective program optimization | planned |
| Phase 22 XGBoost / gradient boosting / reinforcement-learning experiments | later experimental lane |
| Phase 23 QLoRA / SFT | eval-only |
| Phase 24 DPO | eval-only |
| Phase 25 PPO | eval-only / not yet graded |

### Evidence artifacts

- `.tmp/parent-atlas-workstation-todo.json`
- `reports/parent-atlas-workstation-todo.md`
- `docs/reports/parent-atlas-workstation-status.md`
- `docs/reports/parent-atlas-workstation-status.json`
- `docs/reports/parent-atlas-workstation-openspec-task-board.md`
- `docs/reports/parent-atlas-workstation-openspec-task-board.json`
- `reports/parent-atlas-open-lanes-todo.md`
- `docs/reports/parent-atlas-open-lanes-todo.md`

The gate model is executable state: task created -> PostgreSQL row written -> outbox event emitted -> RabbitMQ worker claimed -> gates evaluated -> task transitions READY / CLAIMED / RUNNING / AWAITING_GATE / COMPLETED / FAILED. LLMs may recommend the next transition, but smoke and authorization outcomes must be recorded by the worker and gate evaluator.

## LAYER 1A: Canonical Packet Identity (✅ COMPLETE, corrected 2026-08-02)

**Current packet contract**

| Field | Status | Notes |
|-------|--------|-------|
| packet_key | PASS | canonical packet identifier |
| source_ref | PASS | canonical source identity reference |
| feature_id | PASS | canonical feature identifier |
| domain_class | PASS | classification only, not identity |
| title_id | PASS | stable packet metadata |
| canonical_source_ref | PASS | canonical source reference alias |

**Packet identity coverage**

| Surface | Status | Notes |
|---------|--------|-------|
| packet identity coverage | PASS | packet_key, source_ref, feature_id, title_id, canonical_source_ref |
| tree_node_id population | PASS | present on all packets, but provisional linkage only |
| qdrant_point_id population | PARTIAL | mirror coverage, not canonical identity |
| concept_ids population | PASS_WITH_GAPS | annotations present, provenance still incomplete |
| domain_class lineage | NOT_PROVEN | classification lineage only, not identity |

## LAYER 1B: Parse and Stable Symbol Identity (IN PROGRESS)

> **Correction**: `tree_node_id` is present everywhere, but that does not make it canonical.
> The live evidence says it is a provisional structural linkage, not a stable symbol identity.
> See `openspec/changes/parent-atlas-graph-retrieval-proof/tasks.md` (GS1.9–GS1.11) for the current
> proof split:
> - `atlas_tree_nodes.node_id` is populated as a content-version / parse-occurrence hash, not a stable symbol id.
> - `scripts/atlas/phase1-tree-node-derivation.mjs` and `scripts/atlas/backfill-tree-nodes.mjs` still backfill
>   `tree_node_id` via heuristics and write it back to packets.
> - `graphify_symbols` is the better stable-symbol candidate, but it is not yet the live canonical owner.
> - Do not relax `atlas_graph_nodes_v2_tree_node_unique` or promote graph persistence until separate
>   `parse_node_id`, `symbol_id`, `symbol_version_id`, `chunk_id`, `packet_key`, and `graph_node_key`
>   contracts are live.
> - `concept_ids` are annotations, not identity links.

**Provisional linkage coverage**

| Surface | Status | Notes |
|---------|--------|-------|
| tree_node_id population | PASS | linkage exists on every packet |
| tree_node_id stable identity | FAIL | not proven canonical |
| symbol_id coverage | NOT_PROVEN | stable symbol contract not fully live |
| parse_node_id contract | NOT_DEFINED | separate parse occurrence contract still missing |
| concept_ids provenance | NOT_PROVEN | annotations present, provenance incomplete |
| qdrant_point_id coverage | PARTIAL | mirror only, not canonical truth |

**Current correction**

Do not present the chain as `packet_key → source_ref → feature_id → tree_node_id → domain_class`.
The safer chain is:

`source_ref` → `source_revision` → `parse_node_id` → `symbol_id` → `symbol_version_id` → `chunk_id` → `packet_key` → `graph_node_key`

`domain_class` and `concept_ids` are annotations, not identity links.

**Identity surface inventory**

| Entity | Current ID / Key | Derivation | Revision-bound | Current owner / role | Status |
|--------|------------------|------------|----------------|----------------------|--------|
| `graphify_files` | `file_id` | `workspace_id + source_ref` with revision-scoped versioning | Yes | source file identity candidate | PARTIAL |
| `graphify_symbols` | `symbol_id`, `stable_symbol_key` | stable symbol candidate within file context | Yes | stable symbol candidate | PARTIAL |
| `graphify_edges` | `edge_id` | `subject_symbol_id → object_symbol_id` | Yes | edge row identity / symbol relationship ledger | PASS |
| `atlas_packets` | `packet_key` | canonical packet registry key | Yes | packet truth / canonical packet row | PASS |
| `atlas_tree_nodes` | `node_id` | canonical document/chunk tree identity | Yes | canonical tree lineage / structural inventory | PROVEN for canonical tree lineage |
| `codebase_chunk_index` | `id`, `chunk_id`, `source_ref` | chunk mirror keyed by source/span | Yes | retrieval chunk mirror | PARTIAL |
| `atlas_packet_registry` | `packet_key` | packet registry backfill from canonical rows | Yes | hot packet registry / projection | PARTIAL |
| `atlas_representation_records` | `packet_id`, `representation_id`, `representation_revision` | representation lineage record | Yes | representation lineage ledger | PARTIAL |
| `atlas_topology_index` | `packet_key` | packet-level topology projection | Yes | topology / PageRank / SOM projection | PARTIAL (canonical packet coverage proven; synthetic rows remain) |

**Inventory notes**

- `tree_node_id` is now proven for the canonical packet→tree lineage path, but still acts as a linkage field rather than the stable graph identity.
- `graphify_files.file_id` is not yet proven to be a stable cross-revision file identity; treat it as a source identity candidate until the derivation is inspected.
- `graphify_symbols.symbol_id` exists, but cross-revision stability and `stable_symbol_key` formula are not yet proven.
- `graphify_edges` has valid row identity, but endpoint continuity still depends on the symbol identity proof.
- `symbol_id` is the best stable-symbol candidate visible in the repo, but the `symbol_version_id` contract is still missing.
- `concept_ids` are annotations attached to packets, not identity keys.
- `atlas_packet_registry` and `atlas_topology_index` are projections or mirrors, not canonical truth. Canonical packet coverage in `atlas_topology_index` is now proven; extra synthetic rows remain noncanonical.
- `codebase_chunk_index` is the bridge surface for retrieval and backfill, not the canonical packet owner.

**Identity status summary**

| Gate | Status | Notes |
|------|--------|-------|
| `GRAPHIFY_FILE_IDENTITY` | PARTIAL | source identity candidate only |
| `CROSS_REVISION_FILE_ID` | NOT_PROVEN | file identity across source revisions not yet proven |
| `GRAPHIFY_SYMBOL_ID_EXISTS` | PASS | symbol rows and IDs exist |
| `GRAPHIFY_SYMBOL_ID_CROSS_REVISION` | NOT_PROVEN | symbol identity stability across revisions not yet proven |
| `STABLE_SYMBOL_KEY_FORMULA` | NOT_PROVEN | formula still needs audit |
| `GRAPHIFY_EDGE_ROW_IDENTITY` | PASS | edge rows exist and are keyed |
| `GRAPHIFY_EDGE_ENDPOINT_STABILITY` | NOT_PROVEN | continuity depends on symbol identity proof |
| `TREE_NODE_VERSION_IDENTITY` | PROVEN | `tree_node_id` is revision-bound / occurrence-bound |
| `PACKET_TREE_LINK_SEMANTICS` | PROVEN | packet-to-tree linkage exists for all canonical packets |
| `IDENTITY_DERIVATION_PROOF` | IN_PROGRESS | read-only derivation audit not yet complete |
| `IDENTITY_OWNER_ASSIGNMENT` | IN_PROGRESS | source/symbol owners still need confirmation |
| `IDENTITY_SURFACE_INVENTORY` | PARTIAL | tables and roles inventoried, formulas still under audit |

---

## Export Stack: Canonical Packet Serialization + Cache Materialization

**Status**: ✅ READY (Scripts created, npm aliases added)

### Phase 1: Arrow Batch Export

**Purpose**: Serialize 58K packets to Apache Arrow IPC format for fast ingest
- **Script**: `npm run atlas:export:arrow:dry` / `--apply`
- **Output**: `packets-batch-*.arrow` + `offset-index.json` (O(1) lookup by packet_key)
- **Coverage**: All 58,365 canonical identity packets
- **Keywords**: `packet_key` → `title_id` → `feature_id` → `source_ref` → `page_rank_score`

### Phase 2: GIN Index Acceleration

**Purpose**: Create full-text search + vector similarity indexes
- **Script**: `npm run atlas:export:gin-index:dry` / `--apply`
- **Indexes Created**:
  - `atlas_packets.summary` (trigram for LIKE similarity)
  - `atlas_packets.metadata` (JSONB containment)
  - `codebase_chunk_index.content` (trigram for FTS)
  - `codebase_chunk_index.content_embedding` (HNSW pgvector cosine_ops)
- **Keywords**: `summary` → `metadata` → `content_embedding` → `cosine_ops`

### Phase 3: MsgPack Envelope Materialization

**Purpose**: Binary cache format for hot layer (5-20ms retrieval)
- **Script**: `npm run atlas:export:msgpack:dry` / `--apply`
- **Schema**: packet_key, title_id, feature_id, som_row/col, page_rank, community_id, domain_class, concept_ids, canonical boolean
- **Batching**: 1000 packets/file with batch-index.json
- **Keywords**: `som_cluster` → `msgpack_offset` → `packet_key` → `cache_hit`

### Phase 4: GPU + Research Runtime Prep

**Purpose**: Prepare the runtime lanes for LDR ingestion, GPU reranking, and semantic labeling
- **Script**: `npm run atlas:export:qlora:analyze` (coverage stats)
- **Script**: `npm run atlas:export:qlora:prepare` (full dataset, 58K records)
- **Script**: `npm run atlas:export:qlora:prepare:sample` (1K sample for testing)
- **CRITICAL**: DO NOT include qdrant_point_id, packet_key, or mmap offsets as training features
- **Input**: embedding_768, embedding_512, domain_class, topology (som_row/col, pagerank), features (ast_symbols, lexical, entities)
- **Keywords**: `embedding_768` → `embedding_512` → `domain_class` → `used_concepts`

**Naive Bayes Domain Fallback v3**
- **Purpose**: Provide a deterministic lexical fallback for domain classification when the semantic classifier is underconfident.
- **Stack**: split train/validation/test rows, multinomial Naive Bayes baseline, calibrated abstention gate, immutable prediction ledger.
- **Rules**: never write predictions back to canonical truth by `source_ref` alone; persist by `packet_key` with model/version lineage.
- **Keywords**: `naive_bayes_v3` → `abstain_threshold` → `packet_key` → `prediction_ledger` → `domain_class`

**LDR / OKF Lane**
- **Purpose**: Use local deep research to build evidence bundles, not canonical truth.
- **Stack**: `okf` YAML + Pydantic validation + Firecrawl fetch/extract + text normalization.
- **Output**: OKF topic bundles, citations, screenshots, and compact ACE packets.
- **Keywords**: `okf` → `pydantic` → `firecrawl` → `citations` → `ace_packet`

**atlas-tools Query Context Lane**
- **Purpose**: Build compact query context and intent preambles for ACE and chat routes.
- **Stack**: `atlas-tools_classify_intent` → `atlas-tools_build_agentic_rag_context` → `atlas-tools_build_recommendation` → `atlas-tools_record_outcome`.
- **Rules**: query context is not canonical truth and does not replace ACE packet assembly or LDR evidence. Do not invent a generic task agent hop or non-catalog tool names.
- **Keywords**: `atlas-tools_classify_intent` → `atlas-tools_build_agentic_rag_context` → `atlas-tools_build_recommendation` → `atlas-tools_record_outcome`
- **Flow**:
  - classify intent and domain first
  - build bounded ACE context from retrieved evidence
  - synthesize recommendation only after the packet exists
  - record outcome after success or failure is known

**ACE Packet Assembly Lane**
- **Purpose**: Materialize validated evidence into compact ACE packets for synthesis and persistence.
- **Stack**: ACE materializer + packet store + stream/packet routes + trace-backed tool context.
- **Rules**: ACE packets consume canonical and validated evidence; they do not establish source identity by themselves. A packet must reference authoritative packet keys, source refs, content hashes, and revision lineage before synthesis.
- **Keywords**: `ace_materializer` → `packet_store` → `packet_persistence` → `synthesis_output`

**Packet Wiring Audit**
- **Assembler / packetize**: `sveltekit-frontend/src/lib/server/ace/context-assembler.ts` and `sveltekit-frontend/src/lib/server/ace/parent-atlas-packet-assembler.ts` are wired into live ACE routes; `sveltekit-frontend/src/lib/server/features/ai/ace/context-assembler.ts` is the bridge that pulls the packet assembler into the larger feature path.
- **Validator**: `sveltekit-frontend/src/lib/server/acp/packet-assembler.ts` and `sveltekit-frontend/src/lib/server/acp/packet-envelope-validator.ts` are live ACP validation paths.
- **Materializer**: `sveltekit-frontend/src/lib/server/ace/ace-materializer.ts`, `sveltekit-frontend/src/lib/server/atlas/packet-parser.ts`, and `sveltekit-frontend/src/lib/server/hyperrag/hyperrag-packet-pipeline.ts` are defined, but their full runtime caller chain still needs one last proof pass before treating them as fully wired.
- **Audit rule**: do not promote packet materialization as complete until the caller trace is confirmed end to end.

| File | Status | Phase / lane | Evidence |
| --- | --- | --- | --- |
| `sveltekit-frontend/src/lib/server/ace/context-assembler.ts` | LIVE | ACE Packet Assembly Lane / Phase 4D | Imported by live query, synthesis, agent, and router paths. |
| `sveltekit-frontend/src/lib/server/ace/parent-atlas-packet-assembler.ts` | LIVE BRIDGE | ACE Packet Assembly Lane / Phase 4D | Imported by `indexed-source-packet.ts` and dynamically by the larger ACE feature assembler. |
| `sveltekit-frontend/src/lib/server/acp/packet-assembler.ts` | LIVE | ACP packet assembly / validation lane | Self-validates envelopes before return; used as an ACP packet assembly path. |
| `sveltekit-frontend/src/lib/server/acp/packet-envelope-validator.ts` | LIVE | ACP validation lane / Phase 4A adjacent | Used by ACP validation helpers and hyperRAG packet RPC validation. |
| `sveltekit-frontend/src/lib/server/ace/ace-materializer.ts` | TESTED / NO LIVE CALLER FOUND | ACE materializer lane | Imported by tests; no runtime importer found in the current scan. |
| `sveltekit-frontend/src/lib/server/atlas/packet-parser.ts` | DEFINES MATERIALIZE API / NO LIVE CALLER FOUND | Atlas packet parsing / materialization lane | Exports `profileArtifact` and `materializePackets`; no runtime importer found in the current scan. |
| `sveltekit-frontend/src/lib/server/hyperrag/hyperrag-packet-pipeline.ts` | DEFINED / REGISTRY-REFERENCED | HyperRAG packet pipeline lane | Present in runtime registry; no source import caller found in the current scan. |
| `sveltekit-frontend/src/lib/server/acp/packet-materializer-pipeline.ts` | ORPHAN UNTIL PROVEN | ACP materializer pipeline | No runtime importer found in the current scan. |

**Semantic Labeling / Recommendation Lane**
- **Purpose**: Turn validated packets into semantic labels, recommendation logs, and bounded candidate sets.
- **Stack**: PageRank + Neo4j projection updates + Qdrant RRF + PyTorch/TorchInductor rerank.
- **Output**: recommendation log rows, candidate summaries, and potential recommendation tasks.
- **Keywords**: `pagerank` → `neo4j` → `rrf` → `recommendation_log` → `potential_recommendations`

**Multivector Semantic Analysis Lane**
- **Purpose**: Keep dense, sparse, and late-interaction representations separate, then fuse them at query time.
- **Stack**: EmbeddingGemma query/document prompts + Qdrant named vectors + sparse vectors + multivector payloads + RRF fusion.
- **Rules**: do not collapse semantic, lexical, and late-interaction vectors into one unnamed embedding; preserve model/version lineage for each lane.
- **Output**: multivector packets, fusion scores, retrieval explanations, and analysis-ready semantic labels.
- **Keywords**: `embeddinggemma` → `named_vectors` → `sparse_vectors` → `multivector` → `rrf`

**GPU Graph Analysis Lane**
- **Purpose**: Export graph snapshots and batch metrics to a separate GPU analytics service.
- **Stack**: Postgres authority → Arrow / Parquet / NumPy export → cuGraph / cuML / cuVS / PyTorch sidecar → versioned projection import.
- **Rules**: GPU results are projections until written back through a versioned analysis run; Neo4j stays the topology projection store, not the authority.
- **Keywords**: `graph_revision` → `pagerank_alpha` → `cugraph` → `cuml` → `projection_import`

**Current Coverage**:
- Embeddings: 99.7% ✅ READY
- Topology: 21.6% (SOM 4.6%, PageRank 21.6%, community 21.6%)
- Features: 0.9% (ast_symbols), 2.4% (lexical), 0% (entities)

## Graph Retrieval / RTX Status

**Current verified status**

- `REPRESENTATION_LINEAGE_COLUMNS`: `PASS`
- `REPRESENTATION_READ_VALIDATION`: `PASS`
- `SEMANTIC_768_ENDPOINT`: `PASS`
- `SEMANTIC_768_REPAIR_ALIAS`: `PASS`
- `LEGACY_384_ACTIVE_WRITES`: `MIGRATION_SOURCE_ONLY`

**Keep separated**

- Representation lineage columns: `source_representation_id`, `source_dimension`, `projection_representation_id`, `projection_dimension`, `encoder_revision`, `som_revision`
- Analytical lineage: `graph_revision`, `pagerank_revision`, `pagerank_score`, `community_revision`, `community_id`, `kmeans_revision`, `kmeans_cluster_id`, `centroid_distance`

**Counts to preserve**

- `atlas_packets`: `61,659`
- `atlas_packet_registry`: `58,324`
- `atlas_summary_layers`: `18,437`
- `packet summaries`: `7,061`
- `populated summary layers`: `7,061`
- `codebase_chunk_index`: `52,417`
- `atlas_feature_envelopes`: `58,365`

- Summary storage proof is live and PASS; chunk-to-summary promotion is wired, but only rows with packet context are promotable.
- Next summary gate is producer ownership: the app-side `summary_embedding_384` path must be treated as legacy-only, not a canonical writer. Canonical summary embeddings must use `semantic_768` / `dimension=768` with provenance, or be explicitly labeled derived/compatibility.

**Latest launch states**

- `PATCH_TOURNAMENT_SPEC`: `RECEIVED_NOT_STARTED`
- `PATCH_TOURNAMENT_BOUNDED_SEAM`: `QUEUED`
- `GRAPHIFY_RECOVERY_PROOF_LADDER`: `PASS`
- `GRAPHIFY_DAILY_STARTED`: `PARTIAL`
- `GRAPHIFY_DAILY_COMPLETED`: `NOT_PROVEN`
- `GRAPH_SNAPSHOT_FRESH`: `PASS`
- `DEEP_AUDIT`: `NOT_PROVEN`

**Rejected / retiring**

- `content_embedding_768`: flagged dead
- `error_embedding`: flagged dead
- `REFERENCE_AUDIT`: not run
- `DROP_APPROVAL`: blocked


## Graph Identity Audit Next Steps

**Status**: BLOCKED until the identity model is separated from the provisional structural snapshot.

**Latest live audit (2026-08-10)**: `atlas_tree_nodes` row_count `269,972`; canonical document rows `61,658`; canonical chunk rows `61,659`; canonical `source_ref` uniqueness `PASS`; canonical `page_index_path` uniqueness `PASS`; `atlas_packets → atlas_tree_nodes` packet linking `61,659/61,659`; orphan count `0`; max depth `2`; gate result `PACKET_TREE_LINEAGE_PROVEN`.

### Immediate Checklist

- [ ] Inventory identity fields across `atlas_tree_nodes`, `atlas_packets`, `graphify_files`, `graphify_symbols`, `graphify_edges`, and the topology tables.
- [x] Eliminate the 125 canonical `page_index_path` collisions by making the path stable-hash based on canonical `source_ref` rather than lossy slug text.
- [ ] Add or confirm canonical uniqueness invariants for document roots by `source_ref` and packet chunks by `packet_key` before any topology-ranking work consumes tree lineage.
- [ ] Define separate contracts for `parse_node_id`, `symbol_id`, `chunk_id`, `packet_key`, `concept_id`, and `graph_node_key`.
- [ ] Split `tree_node_id` from stable symbol identity: add or confirm `symbol_version_id` for version-bound occurrences and keep `symbol_id` as the stable cross-revision key.
- [ ] Inventory the parser manifest vs runtime implementation: declared `tree-sitter typescript v1` vs actual regex/heuristic extraction.
- [ ] Reclassify the current graph artifact as a provisional structural snapshot until the enrichment chain is proven. Canonical tree lineage is now proven; topology and summary projections remain separate.
- [ ] Keep `tree_node_id` uniqueness intact for now; do not relax or drop the constraint yet.
- [ ] Confirm whether `page_index_path` is still being used as a catch-all identity in any remaining ETL or backfill script.
- [ ] Prove the retrieval chain in order: `semantic_768` coverage, KNN top-k, KMeans, 20x20 SOM, then PageRank.
- [ ] Revisit graph snapshot apply behavior only after the identity and enrichment gates pass.

### Proof Gates

**Completeness scale**: `0` = blocked / not proven, `100` = proven end state.

| Gate | Status | Completeness | Notes |
|------|--------|--------------|-------|
| PARSE_NODE_IDENTITY | PARTIAL_PROVEN | 60 | parser-backed occurrence identity is live, but page-index collisions still need cleanup |
| STABLE_SYMBOL_IDENTITY | NOT_PROVEN | 5 | stable cross-revision symbol identity not yet proven live |
| SYMBOL_VERSION_IDENTITY | NOT_PROVEN | 0 | revision-bound symbol version contract still missing |
| PACKET_TO_SYMBOL_LINEAGE | PARTIAL_PROVEN | 20 | packets link to canonical tree nodes, but not all packets have tree coverage yet |
| DOMAIN_CLASSIFICATION | PARTIAL_PROVEN | 55 | current class population exists, lineage/proof ledger incomplete |
| CONCEPT_EXTRACTION | PARTIAL_PROVEN | 50 | concept rows exist, provenance and edge ledger still incomplete |
| PARSER_MANIFEST_ALIGNMENT | FAIL | 10 | runtime still mismatches the declared parser story |
| TREE_NODE_ID_STABILITY | FAIL | 0 | tree node identity is still provisional |
| SYMBOL_SEMANTIC_768 | NOT_PROVEN | 0 | symbol-version semantic lane not proven |
| KNN_TOPK_RETRIEVAL | NOT_PROVEN | 0 | retrieval lane not yet proven against canonical identities |
| KMEANS_ASSIGNMENTS | PARTIAL / STALE | 35 | assignments exist, run lineage and freshness are incomplete |
| SOM_20X20_ASSIGNMENTS | PARTIAL / STALE | 30 | SOM coverage exists, current run lineage is incomplete |
| PAGERANK_PERSISTENCE | NOT_PROVEN | 0 | graph authority persistence still blocked from canonical identity proof |
| PROVISIONAL_STRUCTURAL_SNAPSHOT | DRY_RUN_PASS | 100 | provisional artifact materializes successfully in dry-run form |
| CANONICAL_GRAPH_SNAPSHOT | NOT_PROVEN | 0 | canonical graph snapshot still gated on identity separation |
| GRAPH_SNAPSHOT_APPLY | ROLLED_BACK | 0 | apply was correctly stopped |
| TREE_NODE_UNIQUENESS_CHANGE | BLOCKED | 0 | uniqueness constraint remains intact |

## Repository-First Search Checklist

**Status**: PARTIAL - owner surfaces located; runtime proof still pending.

The next bounded step is to reuse the existing owners instead of wiring a second implementation. Static search has already located several likely entrypoints, but that does not prove runtime behavior.

| Surface | Current owner candidates found in repo | Evidence status |
|---------|----------------------------------------|-----------------|
| Diff context / patch context | `scripts/ace-diff-sniffer.mjs`, `sveltekit-frontend/src/lib/server/atlas/context-for-file.ts`, `sveltekit-frontend/src/mcp/trace-mcp-server.ts` | PARTIAL_PROVEN |
| Recommendation record / supersession | `sveltekit-frontend/src/lib/server/ace/recommendation-record.ts`, `sveltekit-frontend/src/lib/server/mcp/phase109a-mcp-tools.ts`, `sveltekit-frontend/src/lib/server/retrieval/feature-record.ts`, `sveltekit-frontend/src/lib/server/retrieval/promote-results-outbox.ts` | PARTIAL |
| Validation receipts / proof gates | `sveltekit-frontend/src/lib/server/atlas/contracts/validation-result-v1.ts`, `sveltekit-frontend/src/lib/server/agent/execution-review.ts`, `scripts/opencode/validation-gate.mjs` | PARTIAL |
| Hot / warm / cold storage | `sveltekit-frontend/src/mcp/engram_tools.ts`, `sveltekit-frontend/src/lib/server/cache/*`, `sveltekit-frontend/src/lib/server/retrieval/*` | PARTIAL |
| Tensor / gRPC / protobuf | `sveltekit-frontend/src/lib/server/atlas/go-retrieval-grpc-client.ts`, `sveltekit-frontend/src/mcp/server.ts`, `sveltekit-frontend/src/lib/server/atlas/atlas-semantic-tools.ts` | PARTIAL |
| SOM / KMeans / topology | `sveltekit-frontend/src/mcp/server.ts`, `sveltekit-frontend/src/lib/server/atlas/atlas_embedding_tools.ts`, `scripts/agents/som-cluster-cards.mjs` | PARTIAL |
| NLP / LDR sidecar | `sveltekit-frontend/src/mcp/trace-mcp-server.ts`, `sveltekit-frontend/src/mcp/ldr-research-tools.ts` | PARTIAL |
| Graph retrieval / projection | `sveltekit-frontend/src/lib/server/retrieval/*`, `sveltekit-frontend/src/lib/server/atlas/graph/*`, `sveltekit-frontend/src/lib/server/atlas/board/daily-graphify-board.ts` | PARTIAL |

### Checklist to keep bounded

- [ ] Reuse the existing diff-context owner instead of adding a second diff parser.
- [ ] Reuse the existing recommendation/supersession path instead of inventing a new status ledger.
- [ ] Reuse the existing validation receipt path instead of storing proof in logs only.
- [ ] Reuse the existing storage tier split: hot cache, canonical Postgres, cold object storage.
- [ ] Reuse the existing tensor/gRPC path instead of sending large tensors through ad hoc JSON.
- [ ] Reuse the existing SOM/KMeans lane only after its runtime proof is explicit.
- [ ] Reuse the existing NLP / LDR sidecar only after its runtime path is proven, not just referenced.
- [ ] Reuse the existing graph retrieval path only after the owner, entrypoint, and tests are located.
- [ ] Record runtime proof separately from static owner discovery.

**Runtime proof captured**

- `tests/routes/auto/api/ace/recommendations.test.ts` now proves the HTTP wrapper around `contextForFile()` returns the expected packet shape and stable unauthorized envelope.
- The direct `contextForFile()` invocation still needs a lighter smoke path if we want proof of the heavy atlas-load branch specifically.

**Do not** wire new implementations until the owner file, runtime entrypoint, and tests are all located.

## Telemetry and packet provenance ladder

This section records the remaining measurement gaps only. It does not create new owners or
replace any existing transport, resource, or packet contracts.

### Layer 2: RPC / Transport telemetry

**Status**: PARTIAL

- gRPC clients already exist; HTTP fallbacks are already wired.
- Remaining telemetry must measure protobuf encode latency, protobuf decode latency, JSON
  stringify overhead, and JSON parse overhead.
- Transport provenance must record the live protocol version used for each trace event
  (`grpc` vs `http`).
- Keep transport validation separate from the canonical tensor / gRPC / protobuf boundary.

### Layer 3: Resource telemetry

**Status**: PARTIAL

- GPU work already exists; the missing piece is per-operation timing and kernel identity.
- Record per-kernel telemetry for embedding, GEMM, cosine similarity, top-k, cross-encoder,
  autoencoder, and SOM lookup.
- Record Redis, Qdrant, and Neo4j operation telemetry separately instead of folding them into
  parent tool timing.

### Layer 4: Packet-centric provenance

**Status**: NOT YET

- Add `packet_id`, `feature_id`, `source_ref`, and `som_cell` to every trace event.
- Track `schema_version`, `embedding_version`, `tool_version`, `gpu_kernel_version`, and
  `rpc_transport` on every packet-producing or packet-consuming event.
- Keep the provenance trail complete from ACP decision to final result; do not rely on logs only.

### Session 84 / 85 work order

1. Wire transport telemetry first: encode, decode, JSON stringify / parse, protocol version.
2. Wire resource telemetry next: GPU kernels, Redis, Qdrant, Neo4j.
3. Add packet-centric provenance fields to every trace event.
4. Keep proof separate from promotion; the presence of telemetry does not imply a new owner.

### Phase 5: Go Sidecar (Optional)

**Purpose**: Standalone search service (no Python dependency)
- Status: Not yet integrated
- Keywords: `search_query` → `go_retrieval` → `ranked_packets` → `union_blend`

### Phase 23: QUIC / UDP / gRPC Transport Validation

**Purpose**: Validate unordered UDP datagrams through QUIC packet-number / AEAD checks, then
reassemble per-stream results for typed gRPC/HTTP3 fixtures. This is a proof lane, not a new
transport owner.
- Status: not started
- Status: wired in code; proof in progress
- Keywords: `udp_datagram` → `packet_number` → `aead_tag` → `stream_reassembly` → `grpc_http3`
- Do not globally sort transport packets; validate and reassemble by QUIC connection / stream.
- Keep the canonical tensor / gRPC / protobuf path as the app-side typed transport boundary.
- Validate duplicate / replay / malformed-packet rejection before any RPC smoke is promoted.

### Phase 24: RTX Embeddings + Vector LOD Ladder

**Purpose**: Use RTX for embeddings and matrix scoring, then split vector search into exact,
hot ANN, and cold ANN tiers with clear ownership. Valkey stays cache / lightweight lookup only;
it does not own Vamana or RTX search.
- Status: not started
- Keywords: `semantic_768` → `PyTorch` → `cuBLAS` / `cuBLASLt` → `cuVS brute_force`
  → `cuVS CAGRA` → `cuVS Vamana` → `DiskANN`
- Embeddings: PyTorch / TorchInductor on RTX, with cuBLAS / cuBLASLt underneath for GEMM-heavy
  work.
- Exact oracle: cuVS brute_force.
- Hot ANN: cuVS CAGRA on the active RTX working set.
- Cold ANN build: cuVS Vamana serialization into DiskANN-compatible files; CPU DiskANN serves
  queries.
- Optional cache lane: Valkey / RedisVL vector lookup may be used as a hot cache / lightweight
  retrieval helper, but it is not the ANN owner.
- Smallest concrete proof: Arrow mmap → pinned batch → async H2D → GPU tile → exact GEMM →
  top-k → compare against the already-proven exact-KNN oracle, with per-stage timing captured
  before expanding the ladder.
- DLSS-like reconstruction, if used at all, belongs after the exact GPU tile proof as an optional
  decoder-upscale consumer of the routed tile; it does not replace the Arrow → pinned host → GPU
  tile path and does not own representation identity.
- Keep Hilbert-space / manifold math as representation geometry only, not identity or transport.
- Keep the 20×20 SOM as a routing surface only; 4D topology / metric-tensor diagnostics stay
  experiment-only and do not redefine semantic truth.
- The full tile-cache / LOD hierarchy is design-only until the simpler vector proof is live.

### Phase 27: OKF Fit + HMM Router + Provenance Ladder

**Purpose**: Route between domain categories and agent states using a calibrated logistic fit
classifier plus HMM/Viterbi state decoding, while keeping rerankers, validators, and cache
residency separate from canonical truth.
- Status: not started
- Keywords: `NaiveBayes` → `LogisticRegression` → `HMM` / `Viterbi` → `Merkle`
  → `Arrow mmap` → `Valkey residency` → `TaskSignature`
- Naive Bayes: lexical-only baseline, not the canonical router.
- Logistic regression: canonical soft-fit classifier for OKF / domain routing.
- HMM / Viterbi: temporal state decoder over pass observations.
- MiniLM / MixedBread: reranker only, never the router.
- Deterministic validation: schema validity remains a validator, not a learned model.
- Evidence identity: use UUIDv7 for run/task/evidence IDs and SHA-256 / Merkle roots for bundle
  deduplication.
- Large tensors and replay artifacts: Arrow IPC / mmap, not Postgres or Valkey blobs.
- Cache ownership: Valkey stores hot metadata, leases, and residency state only.
- Keep coarse agent tools only (`classify_request`, `search_candidates`, `analyze_structure`,
  `traverse_graph`, `compile_evidence`, `synthesize_recommendation`, `execute_validation`).
- Current proof: `okf-fit` now computes separate naive Bayes and logistic scores inside the OKF
  packetizer path; focused vitest coverage is green and the packetizer runtime smoke resolves the
  new scores end to end; the packetizer now also emits a derived HMM observation/state hint in the
  NLP provenance blob. Broader workspace typecheck still needs a rerun before treating the lane as
  fully proven.

### Phase 28: Graph Hierarchy + Projection Distortion

**Purpose**: Keep graph hierarchy, geometric distortion, and routing surfaces separate so Louvain,
SOM, and projection-quality metrics do not collapse into one owner.
- Status: wired in code; proven by unit tests
- Keywords: `Louvain` → `community_level` → `hierarchy` → `Jacobian` → `singular_values`
  → `projection_distortion`
- Louvain / community hierarchy: graph structure and coarse topology only.
- Jacobian / singular values: local distortion / expansion of a learned projection.
- Matrix RTX math: fast projection, centroid scoring, and routing-measure computation.
- 2D SOM: routing surface / locality map only, not identity.
- Do not use cross-product magnitude as a routing scalar.
- 4D manifold / metric-tensor calculations remain diagnostic only; they can inform routing, but
  they do not become a canonical ownership layer.
- Contracts: `sveltekit-frontend/src/lib/server/atlas/graph/routing-manifest.ts`

### Phase 29: Routing Map + Distortion Metrics

**Purpose**: Emit typed routing manifests for graph hierarchy, SOM routing, and projection quality
so the workspace can compare locality experiments without changing canonical truth.
- Status: wired in code; proven by unit tests
- Keywords: `RoutingMapManifest` → `GraphHierarchyManifest` → `ProjectionDistortionStats`
  → `neighborhood_preservation`
- Graph hierarchy manifest: community level, community id, parent community, member count.
- Routing map manifest: SOM row/col, cluster id, route neighborhood, active revision.
- Distortion stats: Jacobian norm, singular value spread, neighborhood preservation score.
- All outputs are experimental projections until evaluated against replay / ablation.
- Contracts: `sveltekit-frontend/src/lib/server/atlas/graph/routing-manifest.ts`

### Phase 30: Hypergraph / Multi-hop Traversal Experiment

**Purpose**: Keep n-ary evidence and multi-hop traversal separate from the canonical retrieval
lane until the live API shape is inspected and the simpler vector / graph lanes are proven.
- Status: design-only
- Keywords: `hyperedge` → `ontology_tuple` → `multi_hop` → `HNSW` → `TileKey`
  → `IndexDB` → `shader_cache`
- Hypergraph facts: joint events, linked ontology tuples, and repair/evidence bundles only.
- Traversal facts: bounded multi-hop graph programs only; never expose raw endless traversal.
- Memory facts: TileKeys and LOD swaps remain a logical cache model, not a GPU pointer layout.
- 20×20 SOM and 4D manifold diagnostics can feed this lane later, but they are not the owner.
- Do not start hypergraph-RAG until the API inspection, backend classification, kmeans wiring,
  and live sidecar blockers are resolved.

**Minimal schema sketch**

```ts
type GraphHierarchyManifest = {
  graphRevision: string;
  projectionRevision: string;
  communityLevel: number;
  communityId: string;
  parentCommunityId: string | null;
  memberCount: number;
};

type RoutingMapManifest = {
  graphRevision: string;
  projectionRevision: string;
  somRevision: string;
  somRow: number;
  somCol: number;
  clusterId: string | null;
  routeNeighborhood: string[];
};

type ProjectionDistortionStats = {
  graphRevision: string;
  projectionRevision: string;
  jacobianNorm: number | null;
  singularValues: number[];
  neighborhoodPreservation: number | null;
};
```

---

## LAYER 2: Compiler Output Expansion (⏳ READY TO EXECUTE)

**Current State**: ast_symbols 0.9%, lexical_features 2.4%, entities 0%, used_concepts 100%

**Phase 2A: Fix ast-grep Integration** (canonical join path PROVEN; coverage still expanding)
- **Issue**: the canonical `packet_key` join is now wired on the write path; remaining work is widening coverage, not repairing identity
- **Action**: `node sveltekit-frontend/scripts/atlas/phase2a-ast-grep-synthetic-key-fix.mjs --dry-run --limit=100` → verify canonical packet_key readback → `--apply`
- **Receipt**: `docs/reports/phase2a-ast-grep-canonical-join-receipt.json`
- **Caller-chain receipt**: `docs/reports/phase2a-ast-grep-caller-chain-receipt.json`
- **Keywords**: `ast_symbols` → `tree_sitter` → canonical `packet_key` join

**Phase 2B: Lexical Feature Extraction** (proven; K-Means/topology still separate)
- **Script**: `npm run atlas:phase2b:lexical-kmeans:dry`
- **Receipt**: `docs/reports/phase2b-lexical-extraction-receipt.json`
- **Output**: lexical_features array (token-level features)
- **Keywords**: `lexical_features` → `language:ts` → `keywords` array

**Phase 2C: Entity Extraction** (proven on deterministic sample; corpus expansion still open)
- **Script**: `npm run atlas:phase2c:entity:report`
- **Receipt**: `docs/reports/phase2c-entity-extraction-receipt.json`
- **Keywords**: `entities` → `EMAIL|PHONE|ROUTE|FUNCTION` → `confidence`

**POS / Concept Tagging Lane** (proven on deterministic spec; corpus expansion still open)
- JSONL parser evidence → POS tagger → domain classification → ontology-linked tuples
- FeatureMatrixSetupV1: `semantic_dimension=768`, `static_packet.width=5`, `candidate_query.kmeans=[64,128,256]`, `candidate_query.som_grid=[20,20]`, `candidate_query.top_cluster_soft_cap=8`
- `mcpToolCalls` capped at `3` independent reads; BM25/BM42/PageRank stay ranking features, not identity
- **Keywords**: `jsonl_parsed_evidence` → `pos_tagger_output` → `domain_classification` → `ontology_linked_tuples`

**Parent Atlas lane split: classifier / linker / routing / fan-out**

| Lane | Lane owner | Storage owner | Proof gate | Next recommended command |
|---|---|---|---|---|
| Classifier / sorter | Postgres feature ledger + candidate matrix | `feature_implementations`, `feature_domain_facts`, `feature_structural_facts`, `feature_ontology_tuples` | deterministic label receipts + replay-safe row counts | `node scripts/atlas/audit-feature-layer-schema.mjs` |
| Multi-hop linker | Neo4j GDS projection + bounded traversal policy | Neo4j live graph, frozen graph snapshots, traversal receipts | bounded traversal proof, no unbounded expansion | `npm run atlas:graph:dispatch:proof` |
| KNN / top-k retrieval | Qdrant mirror + pgvector oracle | `codebase_chunks_768`, Qdrant collections, pgvector mirror | exact-vs-ANN parity on frozen candidates | `npm run atlas:retrieval:oracle:report` |
| KMeans / SOM 20×20 | topology router | `feature_implementations` routing fields, `som_row`, `som_col`, `som_cluster`, `kmeans_cluster` | frozen assignment receipt + freshness proof | `npm run atlas:topology:refresh:dry` |
| Fan-out / fusion | query-time orchestrator | retrieval candidate envelopes + ACE packet receipts | max 3 independent reads, deterministic merge receipt | `npm run atlas:agent:fork-join:report` |
| Rust JSON sidecar | TurboVec / N-API parser bridge | `crates/turbovec-napi`, JSONL pack/parse helpers | parse/pack parity + sidecar fallback proof | `node -e "import('./sveltekit-frontend/src/lib/server/packet-pipeline.ts').then(m=>console.log(m.turbovecNapiAvailable()))"` |
| `ae:train` | gated experimental lane | latent cache / training artifacts only | blocked until KMeans + SOM evidence is closed | do not enable yet |

**Storage map**

- Postgres canonical truth: `atlas_packets`, `feature_implementations`, `feature_domain_facts`, `feature_structural_facts`, `feature_ontology_tuples`, `AnalysisPassResult` / receipts.
- Qdrant mirror: `codebase_chunks_768` and other retrieval collections; store ANN payloads, not packet identity.
- pgvector oracle: exact SQL/vector fallback for bounded candidate sets and parity checks.
- Neo4j projection: live graph store, bounded traversal, Louvain/PageRank receipts, graph snapshots.
- TurboVec / Rust sidecar: JSONL parse, pack, dedupe, SOM helper math, and other CPU helpers only.
- `nes_chrom_packets`: compact durable packet layer between retrieval and summaries; it is a packet store, not the graph owner.
- Redis / Valkey: hot cache and ephemeral coordination only.

**Next executable gate order**

1. Close the classifier / sorter lane on Postgres receipts.
2. Close the multi-hop linker on bounded Neo4j traversal receipts.
3. Prove KNN / top-k retrieval against the pgvector oracle and Qdrant mirror.
4. Prove KMeans / SOM 20×20 routing as topology only, not identity.
5. Prove query-time fan-out and fusion with the max-3 independent-read cap.
6. Keep the Rust JSON sidecar as a helper lane for parse/pack parity, not storage truth.
7. Leave `ae:train` blocked until KMeans and SOM evidence is closed.

**Concrete proof checklist**

| Lane | Concrete proof command | Expected receipt / artifact |
|---|---|---|
| Classifier / sorter | `node scripts/atlas/audit-feature-layer-schema.mjs` | `docs/reports/phase2d-feature-layer-backfill-receipt-20000.json` |
| Multi-hop linker | `npm run atlas:graph:proof:report` | `docs/reports/graph-dispatcher-proof.json` |
| KNN / top-k retrieval | `npm run atlas:retrieval:e2e` | `docs/reports/retrieval-e2e-benchmark.json` |
| KMeans / SOM 20×20 | `node scripts/atlas/train-som-20x20.mjs` then `npm run atlas:som:audit` | `docs/reports/train-som-20x20-writeback.json` plus `sveltekit-frontend/models/som/som_20x20_codebook.json` and `sveltekit-frontend/models/som/som_assignments.json` |
| Fan-out / fusion | `node scripts/atlas/test-gpu-retrieval-summary-fanout.mjs` | `docs/reports/gpu-retrieval-summary-fanout-proof.json` |
| Rust JSON sidecar | `node -e "import('./sveltekit-frontend/src/lib/server/packet-pipeline.ts').then(m=>console.log(m.turbovecNapiAvailable()))"` | no durable receipt yet; this is a helper-lane availability check |
| `ae:train` | do not run | no artifact until the KMeans + SOM proof closes |

**Run order**

1. Classifier / sorter: rerun the feature-layer audit after each widening step.
2. Multi-hop linker: prove the graph-dispatcher receipt before touching traversal promotion.
3. KNN / top-k retrieval: run the exact retrieval benchmark before any ANN promotion.
4. KMeans / SOM 20×20: train or refresh SOM only after the retrieval and feature lanes are stable.
5. Fan-out / fusion: validate the query-time fork-join limit after the upstream lanes are steady.
6. Rust JSON sidecar: check availability only; do not use it as storage truth.
7. `ae:train`: keep blocked until KMeans and SOM evidence is closed.

**Executable command block**

```bash
# 1) Feature layer proof
node scripts/atlas/audit-feature-layer-schema.mjs
# receipt: docs/reports/phase2d-feature-layer-backfill-receipt-20000.json

# 2) Multi-hop linker proof
cd sveltekit-frontend
npm run atlas:graph:proof:report
# receipt: docs/reports/graph-dispatcher-proof.json

# 3) KNN / top-k retrieval proof
npm run atlas:retrieval:e2e
# receipt: docs/reports/retrieval-e2e-benchmark.json

# 4) KMeans / SOM 20×20 proof
node ../scripts/atlas/train-som-20x20.mjs
npm run atlas:som:audit
# receipt: docs/reports/train-som-20x20-writeback.json
# artifacts: sveltekit-frontend/models/som/som_20x20_codebook.json
# artifacts: sveltekit-frontend/models/som/som_assignments.json

# 5) Fan-out / fusion proof
node scripts/atlas/test-gpu-retrieval-summary-fanout.mjs
# receipt: docs/reports/gpu-retrieval-summary-fanout-proof.json

# 6) Rust JSON sidecar availability check
node -e "import('./sveltekit-frontend/src/lib/server/packet-pipeline.ts').then(m=>console.log(m.turbovecNapiAvailable()))"
```

`ae:train` remains blocked and should not be added to the command block yet.

**Phase 2D: Wire Remaining Extractors** (broader bounded proof proven; corpus expansion still open)
- **Script**: `node scripts/atlas/backfill-feature-layer-from-atlas-packets.mjs --apply --limit=10000 --offset=20000`
- **Receipt**: `docs/reports/phase2d-feature-layer-backfill-receipt-20000.json`
- **Audit**: `featureJoinReady=true` with `feature_implementations=20288`, `feature_file_edges=37690`, `feature_lexical_facts=34999`, `feature_domain_facts=91658`, `feature_structural_facts=34999`, `feature_ontology_tuples=90600`
- imports/exports, functions, classes, routes, permissions
- **Keywords**: `imports` → `exports` → `functions:[]` → `classes:[]` → `routes:[]` → `permissions:{}`

**Total LAYER 2 Effort**: 7-10h to >80% coverage on all 9 compiler output fields

---

## LAYER 3: Metrics & Topology (⏳ PLANNED)

**Current State**: SOM 4.6%, PageRank 21.6%, community 21.6%, k_core 17.5%

**Phase 3A: SOM Topology** (train 20×20 grid on latent vectors)
- **Keywords**: `som_row` → `som_col` → `som_cluster` → `routing_locality`

**Phase 3B: Neo4j GDS Suite** (PageRank, Louvain, CheiRank)
- **Keywords**: `page_rank_score` → `community_id` → `k_core` → `centrality`
- **Note**: Keep this on the JVM/CPU path; use the separate GPU analytics lane for batch experiments and projection refreshes.

**Phase 3C: Semantic Metrics**
- **Keywords**: `entropy` → `density` → `reachability` → `authority_score`

---

## LAYER 4: Runtime & Training (⏳ DESIGNED)

**Purpose**: Semantic classification, compiled GPU reranking, HMM error fixing, RL feedback

**Phase 4A: Pydantic + OKF Validation** (schema-gated research input)
- **Keywords**: `okf_yaml` → `pydantic` → `validation_error` → `evidence_bundle`

**Phase 4B: Firecrawl Ingestion** (web evidence extraction)
- **Keywords**: `firecrawl` → `source_snapshot` → `citation` → `research_bundle`

**Phase 4C: PyTorch / TorchInductor Reranker**
- **Keywords**: `rerank_score` → `torchinductor` → `compiled_kernel` → `gpu_batch`

**Phase 4D: ACE Packet Semantic Labeling**
- **Keywords**: `ace_packet` → `semantic_label` → `recommendation_log` → `bounded_candidates`

**Phase 4E: HMM Error Recovery**
- **Keywords**: `error_state` → `recovery_packet` → `confidence` → `fallback_adapter`

**Phase 4F: GPU Graph Analysis Export**
- **Keywords**: `postgraph_export` → `arrow_snapshot` → `cugraph` → `cuvs` → `projection_refresh`
- **Output**: graph metrics parquet, clusters parquet, centroids f16, and projection parity reports.

**Phase 4G: Research Lane Integration**
- **Keywords**: `firecrawl` → `pydantic` → `okf` → `ldr` → `ace_packet`
- **Output**: research bundles, semantic labels, and recommendation log entries with bounded evidence.

**Phase 4H: Multivector Retrieval**
- **Keywords**: `dense_vector` → `sparse_vector` → `late_interaction` → `named_vector` → `rrf`
- **Output**: hybrid candidate sets, per-lane scores, and packet-level semantic explanations.

---

## Review-derived missing items (2026-08-11)

This is the short execution list extracted from the current compiler / topology / runtime review. It stays aligned with the longer proof ladder below.

### Sequencing correction from the latest proof-spine review

- P0 canonical packet identity join remains the front-door blocker: do not advance PF4, graph dispatch, or runtime training on divergent packet keys.
- `packet-key-builder.ts` is still a grain-unproven V2 candidate; do not promote it to canonical identity until the source-ref grain test is explicit.
- `compute-packet-key.ts` remains a compatibility / scoped-address helper.
- `atlas_packet_identity_aliases` is the repair seam for legacy packet keys; resolve aliases first, do not rewrite historical PKs in place.
- Open gaps remain narrow and intentional:
  - historical PK migration stays deferred;
  - the live alias map is validated, not rewritten in place;
  - `packet-key-builder.ts` remains grain-unproven as a V2 candidate;
  - the broader `trace-mcp` runtime remains untouched beyond the export-shape fix that resolved the import/syntax failure.
- Feature Label Phase 1 is now proven at the unit level (`deriveFeatureIdentity` + punctuation-safe `titleCase`); keep ranker wiring additive and avoid introducing a second label owner.
- PF4A duplicate classification is sufficient to keep `analysis_pass_results` as append-only execution history; do **not** add hard uniqueness yet.
- PF4 proof surface is now wired as a guarded admin snapshot; the lane remains wired-not-proven until a live duplicate-classification receipt is added.
- PF4A live duplicate-classification receipt is now captured from the real ledger: 11,079 total rows, 1,272 duplicate groups, classified as `stochastic_history` 1,234 / `identical_retry` 20 / `ambiguous` 18 / `revision_mixed` 0.
- PF4B live current-materialization receipt is now captured from the real ledger: 11,079 raw rows, 6,903 current rows, 4,176 rows collapsed into `analysis_pass_current` by the live view.
- PF4C semantics are now confirmed from the live writer path: `pass_key` is execution metadata / idempotency key, while `pass_identity_hash` is the logical pass identity used for deterministic reuse.
- PF4G duplicate-delivery idempotency on deterministic writes is proven by focused unit test; repeat delivery reuses the existing deterministic receipt and does not insert a duplicate row.
- PF4H live boundary receipt is now captured from the real ledger: `analysis_pass_current` is view-only, `analysis_pass_results` remains the append-only history table, and there is no unique constraint on the current-materialization boundary.
- Graph dispatcher / Louvain / PageRank paths exist, and the dispatcher registry completeness proof now passes. The Louvain unresolved-seed lane is now seeded from the live run, the resolution receipt is live, and the remaining out-of-domain paths are classified as explicit exclusions; `replaySafe=true` on the latest report. The parity receipt now also records the frozen undirected projection diagnostics (`orderedDuplicateEdges`, `reciprocalEdgePairs`, `duplicateUnorderedPairs`) so the Louvain comparison can prove it is using the same weighted projection on both backends.
- Retrieval fusion now has the one-vote-per-lane proof route and regression test wired. The live fusion-owner matrix is still open before frozen replay can close.
- Rust structural worker promotion stays descriptive only until parity, idempotency, and replay receipts exist.

### Current source map

- `sveltekit-frontend/src/lib/server/analysis/ast-grep-extractor.ts` currently emits real AST features, but the packet identity mapping still needs proof on the write path.
- `sveltekit-frontend/src/lib/server/atlas/feature-doc-enrichment.ts` is the live reader for `feature_structural_facts`, `feature_lexical_facts`, and ontology tuples; its upstream writers must be proven against real packet keys.
- `sveltekit-frontend/src/lib/server/analysis/ast-langextract-bridge.ts` and `sveltekit-frontend/src/lib/server/services/langextract-service.ts` are the likely entity-extraction path for the missing `entities` lane.
- `sveltekit-frontend/src/lib/server/retrieval/unified-orchestrator.ts` still carries LangExtract TODOs, so the retrieval-side consumer is not yet fully wired to the new compiler outputs.

### Layer 2: Compiler output expansion

- [x] Fix `ast-grep` integration so `ast_symbols` write to real `atlas_packets` identities, not synthetic `packet_keys`.
- [x] Trace the current `ast-grep` caller chain from `analysis/worker.ts` through the live writer path and verify the packet-key join.
- [x] Keep `feature_structural_facts` backfill ownership separate; its writer is `scripts/atlas/backfill-feature-layer-from-atlas-packets.mjs`, not the analysis worker.
- [ ] Finish lexical feature extraction so `lexical_features` moves past the current partial coverage.
- [ ] Verify `feature_lexical_facts` is populated from a live extractor, not only from fallback keywords / identifiers / symbols on the read side.
- [x] Wire entity extraction through LangExtract so `entities` are no longer empty.
- [x] Prove the `entities` lane on a live extractor path with non-empty deterministic entities.
- [ ] Wire the remaining extractors for `imports`, `exports`, `functions`, `classes`, `routes`, and `permissions`.
- [ ] Decide whether `routes` and `permissions` belong in the AST lane or in a separate policy-enrichment lane.
- [ ] Verify all nine compiler-output fields against live packet evidence before any promotion.

### Layer 3: Metrics and topology

- [ ] Close the SOM 20×20 gate on latent vectors and record `som_row`, `som_col`, `som_cluster`, and `routing_locality`.
- [ ] Normalize PageRank authority into one canonical field before downstream use.
- [ ] Keep `community_id`, `k_core`, and centrality proofs on frozen snapshots before any GPU promotion.
- [ ] Keep NetworkX, Neo4j GDS, and cuGraph parity checks separate instead of merging them into one lane.
- [x] Add the graph-dispatcher registry and the Louvain persistence receipt to the proof ladder before treating any dispatcher claim as closed. Registry exact-match proof is live; Louvain replay safety is now closed via unresolved-seed seeding and explicit exclusion classification.

### Layer 4: Runtime and training

- [ ] Gate Pydantic / OKF validation on explicit schema evidence.
- [ ] Add Firecrawl ingestion only as a bounded evidence lane.
- [ ] Wire the TorchInductor reranker as a separate compiled inference path.
- [ ] Add ACE packet semantic labeling and HMM error recovery as explicit runtime gates.
- [ ] Add GPU graph analysis export with parity reports rather than treating it as a default writer.
- [ ] Keep `recommendation_log` and `semantic_label` as derived runtime artifacts, not source truth.
- [ ] Keep research-lane integration and multivector retrieval as later proofs, not current owners.
- [ ] Keep the Rust structural worker as a reference implementation until parity and replay receipts exist.

---

## Parent Atlas Pass Fabric (durable execution lane)

**Goal**: turn the current analysis queue into a durable, bounded, fork-join service fabric.

**Current fit**

- `analysis_jobs` is already the durable queue.
- `FOR UPDATE SKIP LOCKED` is already the right crash-recovery primitive.
- `worker.ts` already has stage-specific concurrency gates.
- `AnalysisPassResult` and `ExperimentFeatureMatrix` already carry the idempotency / provenance fields needed for unordered completion.

**Contract**

- Postgres is the canonical queue and pass ledger.
- CPU structural / lexical passes run on multi-core workers.
- NLP sidecar passes are bounded and optional.
- GPU concurrency stays bounded and sidecar-owned.
- Valkey is hot coordination cache only.
- Read-side query fanout is a fork-join executor capped at three independent read tools.
- Shared lane manifest: `sveltekit-frontend/src/lib/server/atlas/contracts/fabric-lanes.ts` for GNN, exact kNN, KMeans routing hints, Ewin Tang low-rank, HyperLogLog telemetry, Kanban, and recommendation policy receipts.
- Feature matrix setup stays three-tier: static packet `feature_matrix_5`, query-time `candidate_feature_matrix`, and canonical `semantic_768`; JSONL evidence, POS tagger output, and domain classification are derived contracts; the local Tree-sitter / domain classifier is proven live, and the code evidence synthesizer now builds a durable receipt and is threaded through the `code_feature_registry` worker path, but the durable Postgres / outbox plane is still degraded so the end-to-end receipt remains open. KMeans 64/128/256 plus SOM 20x20 remain routing hints only and the setup lives in `sveltekit-frontend/src/lib/server/atlas/contracts/feature-extraction-v1.ts`.
- Daily Graphify is the evidence producer for TaskCandidate rows; Kanban remains the canonical task-state owner.
- `scripts/atlas/graphify-langgraph-pipeline.mjs` now emits `graphify-task-candidates.jsonl` for the Kanban importer bridge; this is evidence, not task-state truth.
- `T6c` KMeans remains `CACHE_HINT_ONLY` and does not block daily Graphify resumption.
- Tang-style low-rank sampling is experimental routing only; exact cuVS / ANN ranking remains the final candidate oracle.
- OpenCode / ACP / A2A dispatch is transport only: the agent may request work through the typed tool registry, but the actual execution backend is a shell/Python worker (`bash`, `conda run`, or the repo’s equivalent wrapper). The agent must not write canonical state directly.

### Event fabric and control loop

Priority order:

1. `WorkCommand` asks a worker to do something.
2. `IntegrationEvent` reports canonical derived state changed.
3. `FailureObservation` records what failed without retrying by itself.
4. `AnalyticsEvent` records observed behavior for later aggregation.
5. `RecommendationSignal` carries derived policy suggestions only.
6. `PolicyDecisionReceipt` records accept / reject / apply outcomes.
7. `CheckpointCommit` freezes a Merkle-rooted population or artifact batch.

Operating split:

- RabbitMQ carries commands and integration delivery.
- Kafka carries analytics history, failure observations, and tensor-policy telemetry.
- NATS is for low-latency runtime dispatch only.
- Postgres stores canonical receipts and checkpoints.
- Valkey holds hot routing and policy state only.
- Merkle roots freeze the exact analytics population used for model or policy training.
- A failure observation never retries itself; only an explicit recovery command may do that.

### Pass Fabric steps

- [ ] Prove the current worker behavior with one real poll cycle and one real claimed batch.
- [x] Add the first first-class code evidence synthesizer writer so the live classifier can persist a durable receipt once Postgres / outbox health recovers; the builder now lives in `sveltekit-frontend/src/lib/server/analysis/code-evidence-synthesizer.ts`, is threaded through the `code_feature_registry` worker stage, and is now queued from the upload route for code-like uploads.
- [ ] Replace single-job claims with `claimBatch(jobType, freeSlots)` so gates fill immediately.
- [ ] Add `pg_notify` wakeups on enqueue and keep a slow fallback poll.
- [ ] Add durable `AnalysisPassResult` persistence as append-only execution history.
- [ ] Classify the existing duplicate population before adding any uniqueness constraint.
- [ ] Prove whether `pass_key` / `pass_revision` semantics are logical identity or execution metadata.
- [ ] Decide whether the history table needs a separate current-materialization view before any DB uniqueness enforcement.
- [ ] Capture a live PF4 duplicate-classification receipt from the real `analysis_pass_results` population.
- [ ] Keep the PF4 proof route wired for workstation review without claiming the ledger is fully proven.
- [ ] Decide whether PF4B should materialize a `analysis_pass_current` view or stay append-only history plus explicit replay selection, using the live PF4A counts as the baseline.
- [ ] Use the live PF4B materialization receipt to decide whether PF4C should formalize pass-key semantics or simply keep current-eligible replay selection on the view boundary.
- [ ] PF4H is now closed: no further uniqueness enforcement is needed on the current-materialization boundary beyond the view and application-level reuse path.
- [ ] Keep the new code-evidence receipt lane under the same proof rules: created + wired is not `DONE` until durable Postgres / outbox readback is healthy.
- [ ] Add a CPU worker pool for structural, lexical, entropy, and normalization passes.
- [ ] Keep NLP sidecar / GPU passes bounded and batched instead of launching one request per packet.
- [ ] Add Valkey batch helpers for hot metadata, result hints, and cache receipts only.
- [ ] Add `executeToolBatch` with `maxParallel = 3` for independent read-only tools; keep dependent or mutating calls sequential.
- [ ] Wire the fabric lane manifest into the recommendation / task-board flow and keep `semantic_768` explicit in every lane receipt.
- [ ] Wire daily Graphify to emit typed TaskCandidate JSONL and keep Kanban importer state separate from evidence production.
- [ ] Add a TaskCandidate contract for graphify evidence with explicit provenance, source_ref, and dedup_key fields.
- [ ] Keep recommendation routing and candidate sampling separate from canonical graph truth.
- [ ] Refresh the daily Graphify proof artifact before any GPU worker sequence and record the new graph revision / workspace revision / task count / manifest hash.
- [ ] Build incremental eligibility so only changed packets / stale revisions re-run.
- [ ] Add crash-restart replay tests: duplicate enqueue, worker crash, unchanged revision rerun, changed source rerun.

### PF4A duplicate classification gate

- [ ] Group duplicate `analysis_pass_results` rows by `packet_key`, `pass_name` / pass type, and `input_hash`.
- [ ] Compare `output_hash` multiplicity per duplicate group.
- [ ] Compare `producer_id`, `producer_revision`, `backend_version`, and `model_revision` multiplicity per duplicate group.
- [ ] Separate identical retries from distinct execution history before any deduplication or uniqueness rule.
- [ ] Keep nullable `source_revision` / `pass_revision` explicit until provenance can be reconstructed.

                                                    
### Step 7: Introduce RFF as an experimental projection

- [ ] Define a deterministic representation contract for RFF.
- [ ] Fix the source representation to `semantic_768`.
- [ ] Fix the output projection to a stable RFF dimension and seed.
- [ ] Evaluate RFF only on the final candidate set before adding any index or collection.

### Step 8: Keep RFF out of Qdrant until it proves value

- [ ] Compute RFF only on the final candidate shortlist.
- [ ] Measure whether RFF improves reranking discrimination rather than candidate recall.
- [ ] Do not create a new Qdrant collection for RFF until the ablation result justifies it.

### Step 9: Make Domain 10 the gatekeeper

- [ ] Promote the evaluation scripts into real ablation inputs.
- [ ] Run baseline, RRF, RFF, and combined variants on frozen lane rankings.
- [ ] Measure retrieval and repair metrics separately.

### Step 10: Defer latent128 until its BYTEA contract is proven

- [ ] Define exactly what the latent128 bytes encode.
- [ ] Add a decoder contract before any feature uses the bytes as an input.
- [ ] Treat latent128 as derived representation, not opaque truth.

### Step 11: Use NetworkX as the graph oracle

- [ ] Compare NetworkX PageRank against Neo4j GDS on a frozen snapshot.
- [ ] Measure overlap, rank correlation, and maximum difference.
- [ ] Prove the graph interpretation before GPU promotion.

#### GRAPH_SNAPSHOT_PARITY contract

- `Neo4j` remains the live graph store and projection owner.
- The frozen transport snapshot is a validation artifact, not a canonical store.
- Snapshot format:
  - `nodes.parquet`
  - `edges.parquet`
  - `manifest.json`
- Required node fields:
  - `gpu_node_id`
  - `graph_node_key`
  - `node_kind`
  - `source_ref`
  - `source_revision`
  - `packet_key`
  - `symbol_id`
  - `symbol_version_id`
- Required edge fields:
  - `src_gpu_node_id`
  - `dst_gpu_node_id`
  - `edge_type`
  - `weight`
- Required manifest fields:
  - `graph_revision`
  - `node_count`
  - `edge_count`
  - `producer_revision`
  - `node_table_hash`
  - `edge_table_hash`
  - `identity_contract_version`
  - `projection_revision`
- Parity receipts should record:
  - node count
  - edge count
  - component count
  - PageRank overlap / rank correlation / max delta
  - Louvain community size distribution agreement
  - exclusions and unresolved counts

`NetworkX` is the CPU oracle. `nx-cugraph` is the dispatch backend. `cuGraph` is the GPU execution lane.

### Step 12: Add cuGraph only after parity

- [ ] Use cuGraph as the GPU candidate after NetworkX and Neo4j parity are proven.
- [ ] Require same snapshot, same damping, same convergence policy.
- [ ] Promote only if runtime improvement is material.

### Step 13: Add cuVS only for vectors

- [ ] Use cuVS exact KNN as the semantic oracle.
- [ ] Compare Qdrant ANN against exact KNN before introducing CAGRA.
- [ ] Keep semantic localization separate from repair localization.

### Step 14: Close the loop on real failures

- [ ] Run the repair loop on actual failing tests.
- [ ] Record episode state, hypothesis, patch, verification, and outcome.
- [ ] Only then treat the repair spine as real production infrastructure.

### Step 15: Add community taxonomy only after the graph oracle ladder

- [ ] Keep Louvain live and Leiden experimental until taxonomy coherence is proven.
- [ ] Materialize community taxonomy records only from the chosen clustering lane.
- [ ] Treat community IDs as taxonomy metadata, not canonical identity.

### Step 16: Keep traversal and ranking variants explicitly separate

- [ ] Treat personalized PageRank as distinct from global PageRank.
- [ ] Keep weighted Dijkstra as the shortest-path baseline.
- [ ] Use semantic best-first search only as a later experiment, not a replacement.
- [ ] Keep external MoE routing as a later sparse-router layer.

### Step 17: Build a frozen repair replay corpus

- [ ] Record deterministic repair episodes with error fingerprint, beliefs, patch, verification, and outcome.
- [ ] Freeze the replay corpus before any learned promotion.
- [ ] Use the corpus for later evaluation of routing, ranking, and repair policies.

### Step 18: Block learned promotion until the replay corpus exists

- [ ] Do not allow learned policies to redefine canonical truth.
- [ ] Keep learned promotion blocked until the replay corpus and evaluation gates exist.
- [ ] Promote only after the replay corpus demonstrates value on frozen evidence.

### Step 19: Record the missing items audit

- [x] Canonical immutable graph snapshot materializer now has a Postgres-backed loader and focused tests; the frozen production parity run is still pending.
- [x] Frozen-snapshot NetworkX/GDS parity runner is wired to load loader-emitted frozen snapshot JSON; the recorded parity report is still pending.
- [x] Checked-in `GRAPH_SNAPSHOT_PARITY` contract and read-only validation stub now exist; the frozen parity run is still pending.
- [x] Frozen `nodes.parquet` / `edges.parquet` / `manifest.json` exporter now exists (`export-graph-snapshot-parity-parquet.mts`, pure mapping in `graph-snapshot-parity-exporter.ts`, 3/3 unit tests) and a live NetworkX oracle (`python/graph_snapshot_parity_networkx_oracle.py`) reads those parquet files and proves node/edge/component counts. Smoke-tested end to end against the small pagerank-parity fixture: exporter → parquet → oracle → receipt all ran live, `networkx.status: PROVEN`.
- [x] Full-corpus run against the live 486MB `graphify/frozen-graph-snapshot-v2.json` completed. `nodeCount=162234`, `edgeCount=108156`, `unresolvedEdgeCount=0`. The naive whole-file `JSON.parse` approach was correctly avoided for this size (see `export-graph-snapshot-parity-parquet.mts`'s `exportLargeFile()` — hands the file straight to DuckDB's native JSON reader via `read_json(..., maximum_object_size=...)` + array-path `json_extract_string` + `UNNEST`, never materializing the array bodies as a single JS string).
- [x] **cuGraph second backend now real, not UNAVAILABLE.** RAPIDS was already installed in a WSL2 miniforge env (`~/miniforge3/envs/atlas-rapids-cu13`, cugraph 26.06.00) but `import cugraph` failed at load with `libcublas.so.13: undefined symbol: cublasLtZZZMatmulAlgoGetHeuristicForStream` — a version-skew bug between the pip-installed `nvidia-cublas` wheel (13.1.1.3, missing the symbol) and the conda-toolkit's own `libcublasLt` (13.6.0.2, has it). Fixed with a single targeted `pip install --force-reinstall --no-deps nvidia-cublas` inside that env, which pulled 13.6.1.10 and resolved the symbol conflict. Verified both `import cugraph` and `import nx_cugraph` pass cleanly after the fix — no need to build a separate `atlas-graph-2606` conda env from scratch.
- [x] **Real cross-backend PageRank + component-count parity proven on the full corpus.** `python/graph_snapshot_parity_cugraph_oracle.py` (new, mirrors the NetworkX oracle's I/O contract) runs inside WSL2 via `wsl.exe -d Ubuntu -- <rapids-env-python> ...`. Both oracles now support `--scores-out <ndjson-path>` to avoid pushing large per-node arrays through stdout/exec (this repo's CLAUDE.md already documents the spawnSync-ENOBUFS failure mode that guards against). `validate-graph-snapshot-parity.mts --run-networkx --run-cugraph` reads both NDJSON score files and computes real top-K overlap / Spearman correlation / max L1-normalized delta. **Live result**: componentCount exact match (54078 both backends), `pagerankTopKOverlap: 1`, `pagerankCorrelation: 1`, `pagerankMaxDelta: 4.89e-9` (numerical noise). Full receipt: `sveltekit-frontend/docs/reports/graph-snapshot-parity/receipt.json`.
- [x] **GRAPH_SNAPSHOT_PARITY_CONTRACT closed — receipt status now `PASS`, real not fabricated.** Five bugs found and fixed in the cuGraph oracle before trusting the Louvain result: (1) the undirected graph used for `cugraph.louvain()` was missing `edge_attr='weight'` — Louvain was silently running unweighted while NetworkX ran weighted, which would have invalidated any ARI/NMI comparison; (2) `max_iter=100` alongside `max_level=100` raised `ValueError: max_iter is deprecated` — removed; (3) the `renumber=False` dense-ID proof was strengthened from `min==0 && max==count-1` (insufficient — `{0,1,1,3}` satisfies that with a duplicate and a gap) to an explicit `nunique()==count` check plus edge-endpoint bounds asserts; (4) the manual `+ isolated_count` correction in `run_components()` was removed now that `vertices=` is passed at graph-build time (cuGraph returns one label per vertex already, including isolates — the old code would have double-counted isolates on a future snapshot that actually has any; this corpus has 0 so the old answer was accidentally correct); (5) both oracles' top-level `status` renamed `PROVEN` → `EXECUTED` — an oracle successfully running Louvain proves `CUGRAPH_LOUVAIN_EXECUTED`/`NETWORKX_LOUVAIN_EXECUTED`, never cross-backend partition parity; only `validate-graph-snapshot-parity.mts`, after actually joining both outputs, is allowed to claim that. A preflight `edgeProjectionDiagnostics` check (ordered-duplicate-edges, reciprocal-edge-pairs, duplicate-unordered-pairs) was added and returned all-zero on this corpus, confirming no ambiguous edge-collapse policy was silently decided differently by each backend. **Live result** (full 162,234-node / 108,156-edge corpus, exact `gpu_node_id` join, 0 missing/duplicate rows on both sides): ARI=1.000000, NMI=1.000000, community counts 54078=54078, modularity matches to 10 decimal places (0.9999815081918709 vs 0.999981508191871). `louvainCommunityAgreement: 1`, receipt `status: PASS`. Full receipt: `sveltekit-frontend/docs/reports/graph-snapshot-parity/receipt.json`.
- Commands: `npm run atlas:graph-snapshot-parity:export -- --input-json ../graphify/frozen-graph-snapshot-v2.json --out-dir docs/reports/graph-snapshot-parity` then `npm run atlas:graph-snapshot-parity:validate -- --manifest docs/reports/graph-snapshot-parity/manifest.json --run-networkx --run-cugraph`.
- STOP here per the bounded parity gate — do not broaden into Leiden/HITS/BFS/SSSP or workstation compute-policy work without an explicit new ask. GPU results here are a validation benchmark, not canonical graph authority, until the separate identity gates (GS1_12, semantic vector ownership exceptions) close.
- [ ] Snapshot-aware bounded traversal contract remains unproven.
- [ ] Closed error-resolution loop remains partial.
- [ ] Frozen repair replay corpus remains absent.
- [ ] `latent_128` byte-contract proof remains absent.
- [ ] OpenWiki source lane is empty and needs content.
- [ ] Library-module source auto-discovery remains manual.
- [ ] DB-backed canonical registry for the library-module index does not exist yet.
- [ ] Conflict review queue for stale/partial library rows is missing.
- [ ] Shared PATH-based global tool resolver for `rg` / `jq` / other binaries is missing.
- [ ] `cuvs` authoritative source mapping is unresolved.

**Execution order**

1. Bundle copy into temporary area
2. Semantic `768` invariant
3. One real repair-loop proof
4. `trace_dynamic_context` integration
5. RRF ownership decision
6. `FeatureRowV1`
7. RFF projection
8. PageRank authority normalization
9. Domain 10 baseline and ablations
10. NetworkX parity
11. cuGraph parity
12. cuVS parity
13. Community taxonomy proof
14. Traversal variant separation
15. Closed-loop repair replay corpus
16. Learned promotion block
17. Missing items audit

**Do not**

- Do not turn on every lane at once.
- Do not make RFF the production fusion owner by accident.
- Do not add new graph traversal into production before the proof ladder is complete.
- Do not treat bundle-provided code as canonical without a Parent Atlas proof gate.
- Do not treat community clustering output as identity.
- Do not allow learned promotion before the frozen replay corpus exists.

---

## Export Stack Verification Checklist

- [ ] Phase 1: Arrow export 10K sample → verify offsets work
- [ ] Phase 2: GIN indexes created → verify query performance
- [ ] Phase 3: MsgPack batches materialized → verify binary decoding
- [ ] Phase 4: QLoRA dataset analysis → verify embedding coverage
- [ ] Phase 4: QLoRA prepare 1K sample → verify NDJSON format
- [ ] All phases end-to-end → verify retrieval latency <100ms

---

## npm Scripts Quick Reference

```bash
# Export Stack
npm run atlas:export:arrow:dry
npm run atlas:export:arrow:apply
npm run atlas:export:gin-index:dry
npm run atlas:export:gin-index:apply
npm run atlas:export:msgpack:dry
npm run atlas:export:msgpack:apply
npm run atlas:export:qlora:analyze
npm run atlas:export:qlora:prepare
npm run atlas:export:qlora:prepare:sample

# SLM Event Pub/Sub (for agentic workflows)
npm run atlas:slm:event-pubsub:listen
npm run atlas:slm:event-pubsub:demo

# TensorRT-LLM Batch Orchestrator (adapter swapping)
npm run atlas:orchestrator:triton:dry
npm run atlas:orchestrator:triton:start

# LAYER 2 Extraction (when ready)
npm run atlas:phase1:ast-grep:dry
npm run atlas:phase1.5:lexical:dry
```

---

## SIMD JSON Parser Ownership (FROZEN, 2026-08-09) — for later integration

**Status**: closed for now. Do not spend another session on parser architecture; this is
non-blocking hardening only until explicitly revisited.

| Role | File |
|------|------|
| CANONICAL | `sveltekit-frontend/src/lib/server/gpu/simdjson-bridge.ts` |
| COMPATIBILITY | `sveltekit-frontend/src/lib/utils/json-fast.ts` |
| LEGACY / NON-AUTHORITY | `sveltekit-frontend/src/lib/utils/simd-json-parser.ts` |
| ACTIVE CONSUMERS | `qdrant-parser.ts`, `tool-call-parser.ts` |
| GATE | `scripts/atlas/check-simd-json-runtime.mjs` |
| ORACLE / BENCH | `scripts/simd/*`, `parent-atlas-graph-runtime-enhancement/native/simdjson_edge_scan.cpp`, `avx2-simdjson-bridge.mjs` |

**Remaining non-blocking hardening** (do later, not now): parity corpus across the canonical vs.
legacy parsers, a consolidated smoke invocation covering all of the above, and eventual deletion
of `simd-json-parser.ts` only after proving no dynamic callers remain (do not delete on the
strength of static grep alone — check dynamic `import()` call sites too).

**Do not**: modify any of these parser files without a specific proven need; do not merge
CANONICAL and COMPATIBILITY into one file "for simplicity"; do not treat ORACLE/BENCH files as
production code paths.

## GR1 DuckDB Schema Drift — RESOLVED (2026-08-09)

`graphify:daily`'s offline DuckDB MapReduce stage (`scripts/atlas/offline-parent-atlas-mapreduce.sql`)
was failing every run. Root cause was schema drift, not a stale mirror or wrong DuckDB file — the
SQL referenced columns and a table that never existed in the live Postgres schema:

- `pad.workspace_id` / `pad.updated_at` — real columns on `atlas_packets`, never exposed by the
  `parent_atlas_documents` view. Fixed by widening the view (new tracked migration:
  `sveltekit-frontend/drizzle/manual/parent_atlas_documents_view_widen.sql` — no tracked source
  existed for this view before; it had been created ad hoc in an earlier session).
- `pad.file_ext` / `pad.alias_id` / `pad.ingest_source` — never existed anywhere. `file_ext` now
  derived from `rel_path`; the other two are explicit `NULL` placeholders.
- `afm.neo4j_node_id` / `afm.nes_card_id` / `afm.atlas_version` — never existed on
  `atlas_feature_map` (no writer anywhere populates them). Same `NULL` placeholder treatment.
- `pg_db.atlas_source_ref_synthesis` (aliased `asrs`) — never existed at all, not a rename.
  Degraded `cold_source_ref_rollups` to source from the real `atlas_topology_features` table,
  keeping only the 3 columns actually consumed downstream (`source_ref`, `pagerank_score`,
  `karpathy_blend`).
- `cold_hot_path_rollups` — was remapping real `route_runtime_packets` columns (`route`,
  `latency_ms`, `captured_at`, `source_refs`, `feature_ids`, `cache_hit`) to a stale output shape
  (`route_path`, `method`, `packet_count`, `avg_latency_ms`, `error_count`, `p95_latency_ms`) and
  omitting `qdrant_hits`/`cache_tier`. Rewritten to use the real column names directly.

Verified live end-to-end: all 5 tables build clean (`cold_parent_atlas_cards`: 8,019 rows;
`cold_source_ref_rollups`: 61,659; `cold_profile_card_candidates`: 8,019;
`cold_feature_rollups`/`cold_hot_path_rollups`: 0 rows each, both pre-existing empty-source
tables, not new bugs). Commits: `293cf2e85e`, `115c25df8e`.

**Not yet done**: a full `npm run graphify:daily` run through to completion with this fix in
place (only the DuckDB SQL stage was verified in isolation). Also see
`openspec/changes/parent-atlas-graph-runtime-enhancement/` for the GR0-GR10 graph-runtime ladder
this unblocks (GR1: fresh graph + revision freeze).

---

## Lane ownership — tightened phrasing (2026-08-10)

Consolidates the tensor-residency / geometry brainstorm threads (see
`openspec/changes/parent-atlas-tensor-residency-integration/tasks.md` for the live-verified
implementation status) into one canonical "use it for / not for" reference. This is vocabulary,
not new architecture — every row restates a boundary already enforced elsewhere in this file or
in the tensor-residency OpenSpec change.

| Thing | Use it for | Not for |
|---|---|---|
| `topology4` (4D routing coordinate: som_x, som_y, authority, entropy_utility) | routing coordinates, residency hints | identity |
| covector / scoring head (`wᵀx`) | scoring, policy head | storage |
| Jacobian / metric tensor | local distortion, expansion/compression diagnostics | truth — never decides what a packet means |
| quaternion rotation | 3D orientation, animation only | similarity scoring, routing truth |
| cosine similarity | ranking, nearest-neighbor score | geometry ownership |
| low-rank sampling / Ewin-Tang-style sketching | offline sketching, compression, candidate reduction | canonical retrieval |
| event hypergraph | n-ary symbolic events, evidence relations, participant roles | AST truth, canonical identity |
| DLSS-like decoder-upscale lane | optional reconstruction, strictly *after* exact tile selection | identity, never before exact proof |
| KMeans 20×20 / SOM | coarse routing, centroid map | final answer truth |
| multi-hop graph/hypergraph traversal | evidence expansion | dense embedding ownership |
| packet validator | schema + order + provenance gate | ranking |
| packet assembler | deterministic merge/materialization | semantic truth |
| packet materializer | emit the final ACE packet / selected context | retrieval ownership |
| Naive Bayes | cheap "did you mean" / lexical prior | canonical router |
| UUID / ULID | stable event, packet, artifact IDs (labels) | latent coordinates — never put an ID in latent space |
| latent space (`latent_128`) | compressed continuous representation | provenance |
| hypergraph coordinates | n-ary evidence layout / joint relations | raw ANN ownership (CAGRA/HNSW still own ANN) |
| feature-matrix distance tensor (RTX) | scoring, ranking, centroid routing, top-k | semantic ownership |
| rotation animation / RenderMan-like tracing | view-layer motion, scene rendering, debugging | canonical identity, retrieval truth |

**Router/ranker ladder** (cheapest → most expensive, each stage only invoked if the cheaper one
is insufficient): exact identity + packet validation → feature matrix → Naive Bayes (cheap prior)
→ logistic regression (first real router) → XGBoost/gradient boosting (stronger tabular ranker)
→ KMeans/SOM (coarse routing) → graph/hypergraph traversal (multi-hop evidence) → exact GPU tile
proof → optional DLSS-like reconstruction lane → only then AE/RL/GEPA/QLoRA-style experiments.

**Three corrections worth re-stating plainly**: quaternions are for 3D rotation, never routing
truth; Jacobian/metric-tensor diagnostics describe local distortion, never packet meaning; DLSS
is a reconstruction/upscale analogy that belongs strictly after exact tile selection, never
before it or as a substitute for it.

---

## Layered architecture (L0–L10) + terminology corrections (2026-08-10)

Consolidates the Kimi K3 / DeepSeek Engram comparison thread. **Not implemented** — a naming
and organizing scheme recorded so the actual implementation work (tensor-residency bundle,
graph-analysis-contract) has consistent vocabulary to grow into, not a new build.

```
L0  EXACT MEMORY      — DeepSeek-Engram-style: byte/AST/ontology n-gram exact lookup
L1  FEATURE TENSOR     — FeatureTensor[4,6], softcapped metrics (see below)
L2  TABULAR ROUTER     — logistic → XGBoost
L3  SEMANTIC           — semantic_768, Qdrant, cuVS
L4  STRUCTURAL         — Tree-sitter, Graphify
L5  GRAPH              — PageRank/HITS/communities: NetworkX oracle, Neo4j GDS operational,
                          cuGraph backend
L6  CACHE ROUTING      — KMeans centroid hints, SOM 20x20, Topology4, Hilbert2D (locality only)
L7  ACE                — prefetch / pin / resident / evict
L8  GPU                — PyTorch, cuVS, cuML, cuGraph, cuTile only where benchmarked
L9  EVIDENCE           — ontology-linked n-ary tuples
L10 AGENT              — HMM, DSPy/GEPA, Ornith/Gemma, event hypergraph recommendation runtime
                         packet-level NLP can proceed now; document-root /
                         tree-dependent promotion waits for duplicate-root /
                         idempotency closure in tree lineage work
```

**Terminology corrections** (apply wherever these terms appear in future design docs):
- The 6 scoring dimensions (relevance, confidence, authority, entropy/novelty, execution
  utility, memory/transfer cost) are **"six policy axes,"** not "six degrees of freedom" — 6DoF
  (x/y/z + pitch/yaw/roll) is a visualization-only concept and must not be conflated with the
  retrieval policy's scoring dimensions.
- **`semantic_768`'s "768" is a representation dimension, not an attention-head count.**
  Do not derive Atlas's embedding width from any model's internal architecture (Kimi K3's
  hidden width 7168 / 96 heads / head-dim 128 / LatentMoE dim 3584, or Gemma 4's internal
  widths, etc.) — `semantic_768` is a retrieval-representation contract independent of whatever
  LLM backend is in use.
- Quaternions remain visualization-only (camera/glyph/node rotation) — reaffirms the earlier
  correction, not a new rule.
- KMeans (K=64/128/256, discrete centroids) and SOM (20×20 grid cells) are **two separate
  concepts** — do not call the SOM "KMeans." Per T6c's live negative result (see
  `parent-atlas-tensor-residency-integration/tasks.md`), both remain non-restrictive cache/
  locality hints, never hard retrieval filters, until proven otherwise by the same recall
  methodology T6c already established.
- Hilbert curve locality applies only to the 2D SOM (`som_x, som_y`) — not a 4D Hilbert curve
  over the full Topology4. Carry `authority_bin`/`entropy_bin` as separate bins alongside the
  2D Hilbert cell key, e.g. `semantic:r42:h217:a5:e3`.
- `Topology4` remains a routing/cache/visualization coordinate, not a Riemannian manifold, until
  a decoder-induced local metric `g(z) = J(z)ᵀJ(z)` is actually built and evaluated (research-only
  for now, unchanged from the earlier correction).

**Latest slotting note from the vocabulary review** — keep these terms in the same L0–L10 ladder,
not as new owners:

| Term | Slot | Note |
|---|---|---|
| nibble / INT4 / INT8 packing | L8 cache tier | Quantized cache fidelity only; never encode packet_key / feature_id as the canonical identity. |
| tensor analysis / RTX matrix ops | L8 GPU | PyTorch / cuVS-style computation lane. |
| cuVS / RAPIDS | L3 / L8 | cuVS exact stays the oracle; RAPIDS KMeans belongs in L6. |
| HNSW | L3 (Qdrant only) | Qdrant ANN structure, not an Atlas implementation target. |
| 4D linked topology coordinates | L6 | Topology4 routing / cache coordinates only. |
| Hilbert (constrained dimensionality) | L6 | 2D SOM locality only, never a 4D curve over the whole topology. |
| ae:train | L1 / L8, gated | Deterministic AE only, blocked behind KMeans/SOM evidence. |
| KMeans 20×20 | no merge | KMeans and SOM are separate; do not conflate them. |
| domain classification | L1 (`domain_fit`) | Proven source, partial coverage only. |
| hyper-dimensional fanout | L9 | N-ary / hypergraph evidence lane. |
| simdjson-like GPU memory swapping | none | Category error; GPU tile swapping is L7 ACE, not simdjson. |
| Redis centroid caching | L7 / T5 | Pointers only; never raw tensors. |
| indexing already-computed tensor for RTX analysis | L7 / T3c | GPU-resident tile reuse, not proven live yet. |
| gradient checkpointing / N64-style memory | not applicable yet | Only relevant if L10-adjacent training work begins. |

**Consolidated live-status snapshot (2026-08-10)** — cross-check against
`openspec/changes/parent-atlas-tensor-residency-integration/tasks.md` for full evidence, this is
a summary only:
- Postgres 18 canonical storage, tensor-residency tables (T1): LIVE
- `semantic_768` Arrow artifact + deterministic mmap reload (T2b): PROVEN
- WSL2 RAPIDS Python sidecar (`atlas_rapids_sidecar.py`): LIVE
- cuVS exact top-k, real GPU, packet_key round-trip (T3a/T6): PROVEN
- KMeans K∈{64,128,256} coarse-routing sweep (T6c): EXPERIMENT_PROVEN as cache hint;
  **hard-filter use REJECTED** by live recall data
- CAGRA ephemeral endpoint (T6b-e): TESTED (recall 1.0, latency conflates build+search cost)
- Persistent CAGRA (T6b-p), pinned host transfer (T3b), GPU-resident tile reuse (T3c), ACE
  eviction (T4), Valkey residency metadata (T5), SOM 20×20: NOT_PROVEN / not started
- `FeatureVector5`/`FeatureTensor` (T2-lineage): BLOCKED — 2 of 5 sources have live data
  (`authority_norm`≈pagerank, `domain_fit`≈domain_confidence); `entropy_norm`/`ast_signal`/
  `execution_utility` still need real producers before any artifact is built
- OKF ingestion now threads a `feature_source_manifest` through `okf-topic-ingestion.ts`, so the
  live 3/5 state is carried with packets instead of staying only in the task note.
- Kafka/CDC tensor event path, Rust tensor-analysis sidecar, cuTile kernels, 4D Riemannian
  metric: architecture/idea only, not proven live anywhere in this repo

**Next mathematical artifact, per this thread's own explicit gating**: `feature_tensor_4x6_r1.
arrow` + `ace_policy_r1.json` (six softcaps + weights) — **gated on T2-lineage reaching 5/5
proven sources first.** T2-lineage remains the actual next actionable gate; it was not
advanced this pass.

---

---

**Session 2026-08-11 — Pass Fabric ledger reconciliation + archival sweep**

- `openspec/changes/parent-atlas-pass-fabric/` created: PF0-3 (queue/worker
  concurrency) confirmed already correctly implemented in
  `sveltekit-frontend/src/lib/server/analysis/{worker.ts,analysis-jobs.ts}`
  — no re-implementation needed. PF4 found `analysis_pass_results` live
  (11,076 rows) but **orphaned** (zero code callers) and holding real
  non-deterministic execution history (1,272 duplicate groups, 97% = repeated
  LLM summarization samples, not bugs — not deleted). Added
  `source_revision`/`pass_revision` columns + partial unique index (safe,
  additive) and `analysis_pass_current` view (PF4B — most-recent-wins
  materialization, flagged NOT_PROVEN as a semantic choice, not yet
  validated as "recent = correct" for non-deterministic outputs). PF4C-H
  (pass_key semantics, dependency DAG, invalidation engine, eligibility
  gate) remain undone — need a fresh session with full context.
- **PF-G0 confirmed as the real blocker**: no proven writer for
  `atlas_packets.packet_key` — reads exist everywhere, zero INSERT/UPSERT
  found. Converged independently from two separate audits (direct grep
  session 197, architecture review session 198) — high confidence this is
  the actual root gate ahead of any Pass Fabric scaling work.
- `docs/PHASE-3-GPU-ACCELERATION-ROADMAP.md`: fixed 7 stale 384-dim
  references (doc predated the 2026-07-27 canonical 768-dim policy by 8
  days). `openspec/changes/parent-atlas-768-dim-migration/` created as an
  inventory (90+ candidate files across `scripts/atlas/` and
  `sveltekit-frontend/src/lib/server/`, mostly unclassified — do NOT bulk
  edit, many are the legitimate secondary 384 routing lane per policy).
- Archival sweep (root CLAUDE.md Archival Rules — copy + manifest + remove,
  never delete): `train-som-384.mts`, `train-kmeans-384.mts` (explicitly
  confirmed legacy via `MASTER-FEATURE-TODO-2026-05-20.md:777` — "legacy
  migration evidence only; not an active representation lane"),
  `train-kmeans-768.mts` (superseded by live GPU `kmeans-chunk-cluster.py`
  pipeline, would've been a duplicate KMeans owner if wired), and a
  5,856-line self-marked-`.disabled` MCP server file. **One archival was a
  mistake and got reverted same session**: `phase101-parent-atlas-packetizer
  .{js,mjs}` — zero code callers, but `docs/atlas/parent-atlas-table-of-
  contents.md:115` lists "Phase 101 parent-atlas packetizer (dry-run
  first)" as active tracked work, not dead code. Restored to original
  location, manifest entry kept with `restored:` timestamp and the lesson
  recorded rather than erased. **Open follow-up**: this packetizer doesn't
  directly reference `atlas_packets`/`packet_key` in a quick grep — worth
  checking in a fresh session whether it's a *precursor* to the still-missing
  PF-G0 writer, since "Phase 101" + "packetizer" + "dry-run first" is
  suggestively close to what PF-G0 needs.

**Follow-up resolved same session**: checked
`phase101-parent-atlas-packetizer.js` exports (`packetizePhase101`,
`storeEngramPacket`, `buildContextPack`, `recommendNextOpenCodeTask`) — zero
Postgres calls, zero `atlas_packets` INSERT/UPSERT anywhere in the file. It's
an OpenCode task-recommendation/context-assembly tool that stores to the
Engram memory cache, unrelated to canonical packet identity despite the
name overlap. Restoring it was still correct (it's real active work), but
it does **not** answer PF-G0 — that gap remains genuinely open.

**MAJOR CORRECTION (same session)**: PF-G0's "zero writer" finding was
**wrong**. All prior audits (session 197 direct grep, session 198
architecture review) searched for literal SQL text (`"INSERT INTO
atlas_packets"`, `.insert\(atlasPackets\)` as a plain grep) but the actual
writer uses Drizzle ORM's query-builder syntax which those greps handled
inconsistently. Correct search — `\.insert\(atlasPackets\)` scoped to
`sveltekit-frontend/src` — finds:

- `sveltekit-frontend/src/lib/server/embedding/semantic-packet-writer.ts`
  — `persistCanonicalSemanticPacketEmbedding()`, does
  `db.insert(atlasPackets).values({ packetKey, ... })`. Has a real live
  caller: `src/routes/api/admin/batch-embeddings/embed/+server.ts` (an
  actual API route), plus its own `.spec.ts` test file.
- `sveltekit-frontend/src/lib/server/hyperrag/hyperrag-packet-pipeline.ts`
  — also does `.insert(atlasPackets)`, not yet checked for live callers.

**PF-G0 status revised**: from "NOT_PROVEN, no writer found" to "a writer
exists and has a live API route caller — needs verification, not
construction from scratch." Next session should: (1) read
`semantic-packet-writer.ts` in full to confirm it does deterministic
`packet_key` generation from `AstUnit`/source identity (not just accepting
whatever `packetKey` the caller passes in — that distinction matters for
whether this actually satisfies PF-G0's requirement), (2) check whether
`/api/admin/batch-embeddings/embed` is actually invoked in production or
is an admin-only manual trigger (changes how "proven" this is), (3) check
`hyperrag-packet-pipeline.ts` for a second, possibly competing writer path
(would need Duplication Prevention triage per root CLAUDE.md if so).

**Lesson**: this session repeatedly found that "zero callers via grep" is a
claim about the *grep*, not about the code, unless the grep pattern is
verified to catch all real invocation syntaxes (raw SQL text, ORM builder
calls, dynamic imports). Re-verify any "NOT_PROVEN — no writer found" claim
in this codebase's history with an ORM-aware search before trusting it.

**Verification complete, same session**: read `semantic-packet-writer.ts`
in full. `persistCanonicalSemanticPacketEmbedding()` does a real
`db.insert(atlasPackets).values({...}).onConflictDoUpdate(...)` — genuine
upsert, correctly wired. **But it does not derive `packetKey`
deterministically** — line 46-47 accepts `input.packetKey` as-is, falling
back to a **random ULID** (`makePacketUlid()`) only if the caller sends
nothing. Traced the one live caller
(`/api/admin/batch-embeddings/embed/+server.ts`, line 27): `packetKey`
comes straight from the **HTTP request body** — no source-derived identity
logic anywhere in this path. It's a generic "persist whatever embedding
+ key you give me" admin endpoint, not the deterministic
`AstUnit + source span → packet_key` resolver PF-G0 actually requires.

**PF-G0 status, final for this session**: a *storage* writer exists and
works. The *identity resolution* layer that should feed it deterministic
keys does not — or does, somewhere else not yet found. This is a narrower,
more precise gap than "no writer exists" (session 197's original framing)
or "a writer exists, done" (this session's over-correction 10 minutes ago).
Both were wrong in different directions. The real open question: **does
anything in this codebase deterministically compute `packet_key` from
`(source_ref, byte_span, symbol_kind)` or equivalent, and if so, does it
call this writer** — or does every current caller (like the batch-embed
route) supply keys some other, possibly non-deterministic way?

**PF-G0 fully resolved, same session — found both halves, they're just not
connected**:

- Deterministic resolver **exists and is correct**:
  `sveltekit-frontend/src/lib/server/atlas/identity/compute-packet-key.ts`
  — `computePacketKey({ workspaceId, sourceRef, semanticAnchor })` →
  `pkt:<workspaceId>:<sha256_first_32_hex>`. Well-documented (deterministic,
  immutable, collision-free by design), has input validation, a matching
  `validatePacketKey()` verifier, and a sibling `packet-key-builder.ts` not
  yet read. Called by `dispatch/mcp-tool-implementations.ts` and
  `tasks/semantic-packets.ts`.
- Working writer **exists and is correct**: `semantic-packet-writer.ts`'s
  `persistCanonicalSemanticPacketEmbedding()` (verified above). Called by
  `/api/admin/batch-embeddings/embed/+server.ts`.
- **Neither calls the other.** The resolver's two callers don't write to
  `atlas_packets`; the writer's one caller takes `packetKey` from an HTTP
  request body instead of calling the resolver. Two independently correct
  pieces, never joined — this IS this session's own "Duplication Prevention
  / layered ownership" pattern, just inverted: not two competing owners,
  but two halves of one owner that never got wired to each other.

**This is almost certainly why every prior session concluded "no packet
writer" or "packet identity unproven"** — grepping for either piece alone
(without knowing the other existed) looks exactly like a missing writer if
you only check call sites of the resolver, or exactly like a missing
resolver if you only check the writer's caller.

**Next actionable gate, singular**: wire them together. Either (a) modify
`/api/admin/batch-embeddings/embed/+server.ts` (or a new canonical ingest
path) to call `computePacketKey()` and pass the result as `packetKey` into
`persistCanonicalSemanticPacketEmbedding()`, or (b) modify
`semantic-packet-writer.ts` itself to call `computePacketKey()` internally
when `input.packetKey` is absent, instead of falling back to a random ULID.
(b) is still the safer writer-level fix for existing callers, but only after
the canonical packet identity basis is frozen. Read `packet-key-builder.ts`
first (not yet read this session) in case it's a third, possibly
higher-level wrapper that already does this join and was simply never
switched on.

**REVISED, same session — this is bigger than "wire them together"**: read
`packet-key-builder.ts`. It exports a function with the **identical name**
`computePacketKey` but an **incompatible signature and algorithm**:

| | `compute-packet-key.ts` | `packet-key-builder.ts` |
|---|---|---|
| Signature | `({workspaceId, sourceRef, semanticAnchor})` | `(source_ref, tree_node_id, title_id)` |
| Formula | `sha256("pkt:v1:{ws}:{sourceRef}:{anchor}")`, 32-hex | `sha256("{source_ref}\|{tree_node_id}\|{title_id}")`, 64-hex |
| Output shape | `pkt:<workspaceId>:<32hex>` | raw 64-hex, no prefix |

**These produce different, incompatible keys for the same logical packet.**
Neither the earlier "resolver exists, just disconnected from writer"
framing nor the AGENT_TASK's "compare, define canonical, wire into both
writers" framing were wrong — but the comparison step surfaced that this is
an identity-contract collision (two independently-designed canonical
schemes), not just a missing connection. This is precisely what root
CLAUDE.md's Aug 9 2026 Duplication Prevention rule was written to catch:
"a second canonical `representation_id`... never implies... they can
legitimately coexist" — except here nothing suggests these are meant to
coexist as distinct representations; they're both trying to be *the*
canonical `packet_key`.

`packet-key-builder.ts` is also more architecturally complete — it ships
`validatePacketKeyImmutability()` and `validatePacketKeyLineageChain()`
(5-layer Postgres→Qdrant→Redis→RPC→ACE consistency check), which
`compute-packet-key.ts` lacks entirely. That's a point in favor of
`packet-key-builder.ts`'s scheme, but not proof — `compute-packet-key.ts`
has workspace-scoping (`workspaceId`) which the other lacks, and
multi-tenant workspace isolation may be a harder requirement to drop than
lineage-validation helpers are to port over.

**Current decision**: `packet-key-builder.ts` remains a grain-unproven V2
candidate and must not become write authority yet.

- `compute-packet-key.ts` stays scoped as a compatibility helper.
- `packet-key-builder.ts` stays provisional until the structural-grain
  question is proven live.
- `semantic-packet-writer.ts` must not invent packet keys or silently swap
  identity families.

The unresolved domain question is still whether the canonical packet basis is
`sourceRef + semanticAnchor + workspaceId` or
`sourceRef + tree_node_id + title_id`, and whether `tree_node_id` is stable
enough across re-parses to serve as canonical structural identity. That
question stays open until the source-revision audit below closes.

### GS1_12 — Source revision index safety

**Goal**: prove which indexed surfaces are safe to keep, which are resolvable,
which need migration, and which should be historical rebuilds only.

**Audit surfaces**

- `codebase_chunk_index`
- `atlas_tree_nodes`
- `graphify_symbols`
- `atlas_graph_nodes_v2`
- Qdrant `semantic_768` payloads
- Neo4j graph projection state
- packet vector bundle tables
- feature index rows currently keyed by `tree_node_id`

**Per-surface receipt**

- `rows_total`
- `source_ref_present`
- `source_revision_present`
- `tree_node_id_present`
- `parse_node_id_present`
- `symbol_id_present`
- `symbol_version_id_present`
- `chunk_id_present`
- `revision_resolvable`
- `revision_ambiguous`
- `revision_missing`
- `classification` = `SAFE` / `RESOLVABLE` / `MIGRATION_REQUIRED` /
  `HISTORICAL_REBUILD` / `NOT_VERSIONED`
- `reason`

**Rules**

- Do not migrate row-by-row if the source can be rebuilt from canonical
  source revision.
- Do not relax `atlas_graph_nodes_v2_tree_node_unique` during the audit.
- Do not treat `tree_node_id` as stable symbol identity.
- Keep packet identity alias replay separate from source-revision index safety.

**Acceptance**

- `SOURCE_REVISION_INDEX_SAFETY_PROVEN` is only true after the audit receipt
  exists for every listed surface and the rebuild vs migration decision is
  explicit.

**Next session, in order**: (1) get the human decision on which scheme
wins — or whether a new `PacketIdentityV1` type supersedes both by taking
the best of each (workspace scoping + tree_node_id + validation helpers),
(2) find every current caller of both `computePacketKey` variants (4 files
total per this session's grep) and migrate them to the chosen canonical
version, (3) wire the winning resolver into `semantic-packet-writer.ts` so
it stops accepting arbitrary caller-supplied `packetKey` / random-ULID
fallback, (4) THEN PF4C-H (pass_key semantics, dependency DAG,
invalidation, eligibility) — those were always downstream of PF-G0 landing
correctly, and landing it on the wrong identity scheme would make PF4's
work need redoing.

---

## Session 2026-08-11 (continued) — Parallel work discovered, cross-lane gap analysis, workstation completion plan

### Open gaps only

- P0 alias replay — PROVEN
  - historical PK migration stays deferred
  - resolved through the live alias seam
  - two identical replays returned the same canonical packet key
  - receipt: `docs/reports/packet-identity-alias-replay-receipt.json`

- PF4 pass fabric — PROVEN
  - execution history stays append-only
  - current-materialization / replay receipt seam is closed

- Graph lane — PROVEN
  - dispatcher registry completeness
  - Louvain persistence receipt
  - Louvain unresolved-seed ledger and resolution receipt wiring
  - live receipt: `docs/reports/graph-dispatcher-proof.json`
  - Louvain report command: `atlas:louvain:resolution:report`
  - Louvain apply command: `atlas:louvain:resolution:apply`
  - Louvain verify command: `atlas:louvain:resolution:verify`

- Retrieval lane
  - one-vote-per-lane receipt
  - live fusion-owner matrix
  - frozen replay

- Rust worker
  - parity
  - idempotency
  - replay receipts

- Daily Graphify / Kanban — PROVEN
  - TaskCandidate JSONL is emitted from the populated daily board
  - importer state stays separate from evidence production
  - proof receipts:
    - `docs/reports/graphify-task-candidates-receipt.json`
    - `docs/reports/task-candidate-replay-receipt.json`

- Layer 2 compiler output
  - ast-grep canonical join
  - stable AST / chunk identity writer proof (`source_ref`, `source_revision`, `tree_node_id`, `title_id`)
  - JSONL parsed-evidence batch lane and provenance receipt
  - lexical writer
  - entity writer
  - POS tagger writer + ontology-linked domain classification writer
  - source-to-packet adapter now wired through `analysis/source-pos-concept-packet.ts` and `code_feature_registry`; live receipt proof remains open
  - remaining extractor coverage

- Layer 3 metrics / topology
  - immutable graph snapshot proof
  - bounded traversal proof
  - PageRank / Louvain / KMeans receipts

- Layer 4 runtime / training
  - `FeatureMatrixSetupV1` / `feature_matrix_5` / `candidate_feature_matrix` convergence
  - ANN candidate generation vs rerank separation
  - GPU sidecar adapter proof for cuVS / cuGraph parity and batch synthesis
  - feature-row convergence
  - ranker shadow gates
  - replay corpus proof

**Immediate next session action**: prove alias replay on one live writer and record the receipt.

## Coordination update — 2026-08-13

The GPU/runtime work is now tracked in a separate backlog:
`docs/parent-atlas-workstation-gpu-runtime-backlog.md`.

Current GPU/runtime estimate: **58% planned/integrated**. This does not alter AST
supersession gates. The active order is:

1. P0: CHUNK0 → GPH-13 → GPH-14 → GPH-15 → GPH-16 → LX0.
2. P1: GPU owner receipt → reproducible Docker/Conda environment → CUDA/PyTorch/CuPy proof → Valkey proof.
3. P2: semantic_768 → cuVS exact oracle → Arrow/mmap if benchmarked → CAGRA evaluation → cuGraph parity.
4. P3: TensorRT/LibTorch audit → multithreading → simdjson PERF0 → Python 3.14/free-threading → RMM if justified.
5. New GPU hardening gates: filter parity, atomic index revision swap, CUDA
   resource ownership, VRAM arbitration, metric equivalence, degradation
   fallbacks, NVIDIA container proof, TensorRT lifecycle, observability, and
   Valkey eviction/rebuild behavior are tracked in
   `docs/parent-atlas-workstation-gpu-runtime-backlog.md` as GPU-21..GPU-32.

The 8095 AST sidecar is intentionally lightweight. PyTorch, cuVS, RAPIDS,
CAGRA, TensorRT, simdjson, and Python 3.14 are deferred integration lanes, not
deleted capabilities or AST correctness gates.

GPU-02 ownership receipt: `docs/reports/gpu-runtime-ownership-proof.json`.
Current control-plane result is `PROVEN`; the dedicated RAPIDS `:8098` runtime is
recorded separately as unreachable/deferred.
## XGBoost / AST-grep / NLP-sidecar lineage alignment — 2026-08-23

Status: `WIRED / FIXTURE-PROVEN / TRAINING-PROMOTION-BLOCKED`

- Added `xgboost-ranking-lineage-v1.ts`: revision-qualified LTR candidates,
  deterministic `queryId -> qid` grouping, candidate-ordinal ordering, mixed
  lineage rejection, and a stable evidence checksum.
- Added AST-grep provenance fields: `sourceRef`, `sourceRevision`, optional
  `graphRevision`, `providerRevision`, and a deterministic derived
  `evidenceKey`. These are evidence coordinates, not canonical identity.
- The NLP sidecar feature type now preserves the same optional provenance
  fields when the Python sidecar returns them. Tree-sitter chunk coordinates
  remain byte-based and the sidecar remains the structural/chunking evidence
  provider.
- Focused validation: 10/10 tests passed for AST structural/parity contracts,
  AST-grep provenance, and XGBoost ranking lineage preparation.
- `train-query-router-xgboost-v2.py` is a classification/router trainer, not an
  LTR reranker; its `hist` configuration has no qid groups. The older
  `train-xgboost-v2-with-domain.mts` still reports simulated `rank:ndcg`
  metrics and must not be used for promotion.
- Corrected the XGBoost router contract's stale v1 tensor binding to the
  current v2/234-column dataset tensor; this was a contract mismatch, not a
  model-quality result.
- Default SvelteKit typecheck is blocked in this checkout by missing
  `@sveltejs/adapter-node`; default Vitest is separately blocked by missing
  `@testing-library/svelte`. These are dependency-health failures, not proof
  of model or AST correctness.

Next gates:

1. Export AST/NLP observations into the new candidate contract only when
   `sourceRevision`, `featureRevision`, `providerRevision`, and evidence refs
   are present; otherwise quarantine the row.
2. Replace or quarantine the simulated domain-ranking script; implement real
   XGBoost LTR with grouped qid data and a revision-qualified GPU receipt.
3. The bounded file-based trainer now validates this seam; run its dry-run
   fixture first, then a synthetic CPU/GPU XGBoost parity fixture in the activated WSL RAPIDS
   environment; no live Postgres or canonical promotion.
4. Re-run the 66-file AST corpus and classify remaining differences as symbol,
   semantic-kind, or chunk-boundary policy before using them as ranking input.
## L2 normalization / vector-manifest authority alignment — 2026-08-23

Status: `CONTRACT-ALIGNED / RUNTIME-RECEIPT-PENDING`

- L2 means row-wise unit normalization: divide each coordinate by the
  positive Euclidean norm; zero/non-finite rows must fail closed.
- EmbeddingGemma native `semantic_768` and supported MRL prefixes remain L2;
  AST, graph, PageRank, domain, and XGBoost features are not appended to that
  vector and are not normalized into its geometry.
- Corrected `packages/semantic-contracts/src/vector-manifest.ts`: added active
  `semantic_768` (768 dimensions, cosine, normalized, Qdrant slot
  `semantic_768`, Postgres source `content_embedding_768`) and changed the
  old `dense_384` entry to `REFERENCE_ONLY` with `semantic_768` as successor.
- The package manifest now agrees with the SvelteKit embedding contract and
  retains latent/384 lanes as derived or reference lanes.
- Active browser-context embedding now defaults to the local EmbeddingGemma
  ONNX model and rejects outputs that are not exactly 768 dimensions.
- Active agent-memory Qdrant outbox writes now reject non-768 vectors and
  attach `semantic_768`, EmbeddingGemma, and L2 payload lineage. The separate
  `codebase_chunks_384_hybrid` projection worker remains explicitly legacy and
  was not silently repointed.
- Active error-experience grouping now defaults to 768; historical 384 vectors
  require an explicit reference-lane configuration.
- Parent Atlas packet types now expose `embedding_768` as the canonical typed
  alias; `embedding_384` remains only as a compatibility field.
- The active embedding contract now sets its minimum canonical dimension to
  `768`; legacy 384 validation must use a named reference-lane contract.
- Review update: the code contract now selects persisted `semantic_768` and
  Qdrant `codebase_chunks_768_v2`; `semantic_512` is reference-only. This is a
  repository contract change, not a live data migration or production proof.
- Corrected active embedding-lane configuration and CodeIntel Qdrant paths that
  still targeted `codebase_chunks_512`; primary indexing/search now targets
  `codebase_chunks_768_v2` with 768-wide vectors and centroids.
- Formalized the two-level representation contract: native `semantic_768` is
  the persisted/search authority; `semantic_512` is generated only by the
  deterministic MRL prefix plus L2-renormalization helper and has no canonical
  collection of its own.
- Updated router feature rows, cluster/topology projection lineage, and GPU
  residency comments to bind their semantic source to `semantic_768`; latent
  64/128 remains derived routing state rather than semantic identity.
- Remaining gate: apply the isolated Qdrant/Postgres migration, read back
  dimensions and lineage, then prove cuVS/Qdrant/cache/retrieval replay before
  marking the persisted swap runtime-proven.
- Corrected active Graphify payload metadata, evaluation-corpus metadata, and
  the tool-search ACE packet contract from 384 to canonical 768.
- Follow-up sweep corrected the Qdrant CandidateOrdinal fixture and payload-index
  documentation to `codebase_chunks_768_v2`, and repaired the isolated RAPIDS
  `semantic_512` client so its derived MRL vectors use an explicit 512 dimension
  instead of inheriting the active 768 constant. Native cuVS remains 768; latent
  128/64 and MRL 512 are derived lanes only.
- Focused representation, routing, Qdrant ordinal, RAPIDS native, and derived
  semantic_512 tests pass (`11/11` in the final derived/cross-lane run; `16/16`
  in the routing/Qdrant/native contract run). The default embedding-contract
  Vitest path remains environment-blocked by the pre-existing missing
  `@testing-library/svelte` package.
- Continued the runtime-default sweep: embedding configuration, vector alias,
  ACE search/materialization/context routes, ACP packet assembly, and ACE query
  defaults now target `codebase_chunks_768_v2`. Historical `codebase_chunks_768`,
  384 collections, and explicit 512 fallback/reference lanes remain named only
  where their compatibility or migration role is intentional.
- Qdrant ordinal adapter smoke remains green (`3/3`); no live collection
  migration or point rewrite was performed.
- Added additive structural evidence contracts:
  `StructuralObservationV2` keeps Node Tree-sitter symbols, Treesitter-chunker
  chunks, and ast-grep witnesses distinct; `StructuralSpanRelationV1` records
  exact, containment, overlap, or disjoint spans with deterministic
  revision-qualified evidence keys. This does not mint `tree_node_id` or any
  canonical identity.
- Added `SampleQueryMatrixV1` / `SamplingDecisionV1` as a measurement-only
  Tang-style lane. It supports candidate-feature, semantic-residual, and
  latent-routing matrices while hard-setting `canonicalIdentityAuthority=false`
  and `retrievalVoteAdded=false`. Row-L2 normalization is explicitly detected
  as a uniform-probability degeneration.
- The XGBoost router v2 contract is already aligned to tensor revision v2 and
  width 234. The real grouped LTR `QuantileDMatrix` CUDA receipt remains
  unproven and must use the existing trainer owner rather than a duplicate
  legacy reranker trainer.
- AST parity proof rerun on the bounded 66-file corpus remains
  `CORPUS_PARITY_MISMATCH`: runtime `66/66`, source bytes frozen `66/66`, Node
  span validity `66/66`, sidecar span validity `66/66`, named-symbol coverage
  `44/66`, semantic-kind parity `42/66`, exact-span parity `2/66`, full parity
  `2/66`. Mismatches are 606 exact-span, 18 left-only symbols, 61 right-only
  symbols, and 6 semantic-kind mismatches. Structural evidence contracts are
  therefore usable for diagnostics, but Node remains a challenger and FANOUT
  stays blocked on structural/provider reconciliation.
- Corpus mismatch classification is now explicit: Node-only observations are
  61 `variable_declarator:VARIABLE` rows, mostly destructuring locals; sidecar-
  only observations are 4 `internal_module:UNKNOWN`, 5
  `function_signature:FUNCTION`, and 9 `method_signature:METHOD` rows; the 6
  semantic mismatches are `FUNCTION -> VARIABLE`. Among 602 semantically
  matched span mismatches, the median combined boundary delta is 139 bytes and
  525 are materially large. This supports separating structural-symbol parity
  from chunk-boundary parity rather than adding coordinate heuristics.
- Added `StructuralObservationParityV1` and `ChunkBoundaryParityV1` gates. The
  first requires frozen source bytes, valid spans, complete named-symbol
  coverage, and semantic-kind agreement; the second reports exact segmentation
  parity plus median boundary deltas and span IoU. This enables a future
  structural challenger review without promoting Node as the canonical
  chunking owner. The current 66-file corpus remains blocked.
- Deliberately did not replace `ms-marco-MiniLM-L6-v2`: that is a cross-encoder
  reranker lane, not the dense embedding owner. The explicit
  `codebase_chunks_384_hybrid` projection worker and 384 migrations remain
  reference-only until a separate migration proof exists.
- The canonical packet schema/example now requires 768; historical migrations,
  archived schemas, and explicit 384 reference tests remain unchanged.
- Package TypeScript build passes. No database, Qdrant, or vector index writes
  occurred.

The pgvector rule is consistent with the official project guidance: normalized
vectors may use inner product for best performance, while cosine distance and
its cosine operator class remain valid. Parent Atlas keeps cosine as the
cross-executor semantic contract until an index-specific inner-product parity
receipt exists.

## Structural / hierarchical / dense provider alignment recheck — 2026-08-23

The repository has all four provider classes, but they are not yet a proven
end-to-end fanout pipeline:

- Structural evidence: ast-grep extraction, Node Tree-sitter challenger
  observations, and the 8095 Tree-sitter-chunker projection are present. Their
  common provider-neutral contracts and span relations are fixture-proven.
- Hierarchical evidence: graph snapshot, bounded graph expansion, PageRank,
  and community projection surfaces are present. They remain derived graph
  evidence; they do not own packet identity or semantic representation.
- Dense retrieval: Qdrant `codebase_chunks_768_v2`, semantic_768 CandidateOrdinal
  adaptation, and the dense executor contract are present. The adapter is
  fixture-proven and returns ordinals, not backend IDs as truth.
- Python execution: the NetworkX/RAPIDS and NLP sidecar surfaces are present,
  but runtime receipts are separate from TypeScript contract tests and must
  carry the same snapshot, source, graph, representation, and ordinal-map
  checksums before admission.
- Join point: `fanout-admission-v1.ts` is the existing fail-closed boundary.
  Do not add a second pre-fanout bundle or let ast-grep, Python, Qdrant,
  Neo4j, or a GPU executor mint identity.

Focused alignment validation on this checkout passed 21/21 tests across the
fanout admission, structural evidence/parity, structural observation, and
Qdrant CandidateOrdinal adapter contracts. This is fixture proof only.

Remaining end-to-end gaps:

1. Prove the persisted Graphify snapshot/source revision owner on the isolated
   database; shared `5434` remains observation-only.
2. Reconcile the 66-file structural corpus before promoting Node Tree-sitter;
   current semantic parity is 42/66 and exact span parity is 2/66.
3. Produce one Python graph/dense runtime receipt with the same frozen ordinal
   map and configuration checksums as the TypeScript admission receipt.
4. Read-only verify Qdrant v2 payload lineage, then perform bounded
   Qdrant-to-graph stream fanout and join back to Postgres without writes.
5. Replay the same request and prove deterministic reuse/no duplicate work.

Current status: `PROVIDER_CONTRACTS_FIXTURE_PROVEN` /
`FANOUT_RUNTIME_PROOF_BLOCKED`. No database, Qdrant, Neo4j, Valkey, or vector
index writes were performed.

## XGBoost CUDA runtime recheck — 2026-08-23

- Local Python imports XGBoost `3.2.0` and resolves an `XGBRanker` request to
  `device=cuda:0`; the wheel build metadata reports CUDA `[12, 9]`.
- This does not mean CUDA 12.9 is installed or that a training kernel has
  executed. The installed CUDA 12 runtime family can satisfy the wheel, while
  CUDA 13 remains a separate toolkit lane.
- Hardened the bounded LTR challenger to use `QuantileDMatrix`, preserve
  query-group ordering, fail closed if a CUDA request resolves to a non-CUDA
  device, and record resolved device/updater/build metadata in its receipt.
- Python syntax and CLI validation passed. No actual grouped CUDA training
  receipt was produced; ranker promotion remains blocked pending a real dataset,
  CPU/GPU parity, and an unpromoted `real_target` receipt.
- A four-row/two-query grouped smoke dataset then executed successfully with
  `device=cuda`: XGBoost `3.2.0`, `USE_CUDA=true`, resolved device `cuda:0`,
  50 trees, and an unpromoted local receipt under `.tmp`. This proves the
  bounded runtime path, not production ranker quality or promotion.

## Pre-fanout evidence bundle — 2026-08-23

- Added `ObservationCoordinateV2`: revision-qualified source byte coordinates
  for ast-grep, Tree-sitter, chunker, ts-morph, LangExtract, and Stanza
  observations. It is evidence identity only and cannot become canonical
  identity.
- Added `OntologyObservationTupleV1`: provenance-bound domain/ontology facts
  with checksum and explicit non-authority/non-write flags.
- Added `PreFanoutEvidenceBundleV1`: joins structural evidence references,
  ontology tuples, semantic_768 checksums, CandidateOrdinal maps, and gate
  results before graph fanout.
- Unproven domain classifiers may be carried only with zero influence until a
  frozen evaluation is available.
- Focused validation passed 14/14 tests across the new bundle, fanout
  admission, and Qdrant CandidateOrdinal adapter.
- Added a read-only bundle-to-admission join check. It rejects mismatched
  CandidateOrdinal, snapshot/source/representation revisions, and ordinal-map
  checksums without creating a second fanout authority. The combined focused
  validation now passes 15/15 tests.

This closes the missing contract seam but does not claim runtime fanout. The
remaining gates are isolated Graphify/Postgres revision-owner proof, Qdrant
payload lineage readback, Python graph/dense receipt parity, and a read-only
Qdrant-to-graph replay.

## Recommendation evidence bridge — 2026-08-23

- Added `RecommendationEvidenceBundleV1` and Zod validation for the missing
  join between EmbeddingGemma representation lineage, OKF/domain evidence,
  KNN top-k, PageRank/spectral/community receipts, and bounded synthesis
  parameters.
- Added `compileRecommendationEvidenceBundleV1()` with deterministic checksum
  materialization and `recommendationEvidenceFeatureWeightV1()` as a bounded
  feature compiler, not a new ranking or identity authority.
- Low-rank/Ewin-Tang-style sampling is explicitly measurement/routing evidence:
  it cannot add a retrieval vote or canonical write.
- `CHALLENGER_UNPROVEN` domain classification is accepted only with zero
  recommendation weight; frozen domain evaluations remain separately gated.
- Wired the optional bundle through the existing classification control-plane
  result without changing the existing retrieval or cross-encoder owner.
- Focused validation passed 19/19 tests. The full TypeScript check remains
  blocked by pre-existing syntax errors in
  `src/lib/server/atlas/language/api-contract-observation-v1.ts`.

Remaining end-to-end gates, in order:

1. Produce real revision-matched PageRank/KNN/spectral receipts and pass them
   through this bundle on one CandidateOrdinal snapshot.
2. Connect the bundle to the existing recommendation policy/ranker and emit a
   phase/temporal receipt; do not persist it as canonical truth yet.
3. Prove OKF taxonomy and domain classifier lineage on a frozen evaluation
   corpus; only then permit nonzero domain feature weight.
4. Run CPU/GPU feature parity for the bounded candidate matrix, then benchmark
   RTX execution; no low-rank estimate can promote GPU specialization.
5. Complete isolated Postgres, Qdrant payload, and read-only graph fanout
   replay before any derived feature persistence.

## RTX / spectral alignment fixture — 2026-08-23

- Added `SpectralRtxAlignmentFixtureV1` as a CPU-only deterministic double for
  the future RTX GEMM and spectral-clustering path.
- The fixture uses one sorted CandidateOrdinal space and requires matching
  workspace, source, representation, graph, and ordinal-map revisions.
- It emits explicit `MOCK_CPU_REFERENCE`, `FIXTURE_ONLY`,
  `canonicalWritesAllowed: false`, `identityAuthority: false`, and
  `promotionEligible: false` fields.
- Focused spectral/runtime validation passed 16/16 tests.
- This does not prove CUDA, cuBLAS, cuTile, cuGraph, CAGRA, or production
  spectral clustering. Those still require real-target receipts and CPU/GPU
  parity on the same frozen fixture.

### Python / native boundary alignment

- Added `python/atlas_compute/spectral_rtx_alignment_fixture.py` as the
  Python JSON receipt adapter for the TypeScript fixture.
- Python and TypeScript now share field names, sorted CandidateOrdinal rows,
  SHA-256 canonical JSON inputs, `sm_86`, and explicit non-authority flags.
- The existing Rust `turbovec-napi` addon remains a separate TurboVec/JSON
  utility; it does not currently own spectral projection or GEMM and was not
  incorrectly expanded to do so.
- N-API/C ABI spectral execution remains `NOT WIRED`; the next native seam is
  a versioned JSON/Arrow request and receipt parity test before adding an addon
  export or C ABI function.
- Python validation passed 1/1 and TypeScript spectral validation passed 7/7.

### Spectral sidecar endpoint — 2026-08-23

- Extended the existing non-mutating RAPIDS community sidecar with
  `/v1/community/spectral` using cuGraph spectral modularity maximization when
  the activated runtime exposes that API.
- Added bounded spectral parameters: cluster count, eigenvector count,
  eigensolver tolerance/iterations, k-means tolerance/iterations, and seed.
- Reused the existing revision-qualified undirected weighted projection and
  canonicalized backend assignments before returning them.
- Spectral quality is reported as `MODULARITY_MAXIMIZATION`; no fabricated
  modularity score is emitted when the cuGraph API does not return one.
- Capability discovery reports spectral availability dynamically. The sidecar
  remains `QUARANTINED` and non-mutating.
- Contract/parity validation passed 7/7 Python tests. Real WSL2 cuGraph
  spectral execution and CPU parity remain unproven.
- Alignment sweep report: `docs/reports/spectral-rtx-alignment-sweep-20260823.md`.
- The request validator now rejects spectral configurations where
  `numEigenvectors > numClusters` or `numClusters > node_count`.

### Session handoff — 2026-08-23 (openspec review + semantic-dimension resolution + XGBoost restore)

**Pushed to origin/main**: `d7d396b369` (parent `7fe3c52136`). All work below is live on `main`.

- **Restored 9 openspec change directories** that commit `a2e4dab329` deleted via raw `git rm`
  (bypassing this repo's archive-not-delete convention) into `deeds_labs/archive/2026-08-23/
  retired-openspec-changes-aug22/` with a proper `docs/archive-manifest.json` entry. 6 of the 9
  brought back to active `openspec/changes/` and substantively worked: `agent-branch-review-
  fanout-ace-centroid-aug22`, `codereview-inference-wiring-followup-aug22`, `codereview-semantic-
  dimension-regression-aug22`, `deep-audit-code-gates-aug22`, `inference-wiring-deep-audit-aug22`,
  `parent-atlas-xgboost-cuda-runtime-proof`. Archived 2 genuinely-complete unrelated changes via
  `openspec archive` (`parent-atlas-llama-server-chat-consolidation`, `phase-alignment-hmm-prefill-
  dag-20260822`).
- **RESOLVED — embedding dimension policy, operator-confirmed**: found a 5-round undocumented
  policy flip-flop across less than a month (Jul 27 → Aug 3 → Aug 11 → Aug 19 freeze to 512 →
  Aug 22 silent revert to 768 via commit `cdae3e454b`, zero commit-message justification). Live
  ground truth broke the tie: Postgres's own truth column (`codebase_chunk_index.content_embedding`)
  and a Qdrant mirror (`codebase_chunks_768_v2`) are both natively 768-dim and predate the Aug 19
  freeze by weeks — the freeze's own stated premise ("no production 768 corpus exists") didn't
  hold even when written. **`semantic_768` is now canonical**, with 512/384 remaining legitimate
  derived lanes only when produced from an already-indexed, already-validated 768d source, never
  speculatively. Propagated through root `claude.md` and all 3 stale docs (`parent-atlas-semantic-
  512-canonicalization` marked SUPERSEDED, `parent-atlas-semantic-768-canonical-contract` marked
  ACCEPTED, `parent-atlas-768-dim-migration` unblocked). Live code already matched the decision —
  no code revert needed there.
- **KNOWN OPEN — the `codebase_chunks_768` vs `codebase_chunks_768_v2` Qdrant split** (not resolved
  by the above): `_768` has 105,762 points with richer payload (`graphAuthorityScore`/`pagerank`/
  `community_id`/`tags`), `_768_v2` has 52,380 points (1:1 mirror of Postgres) with a leaner
  identity-only payload but is the one `embedding-contract-768.ts` declares canonical.
  `turbovec-search.ts` (8 sites) + `trace-mcp-server.ts` still hardcode `_768`; the ACP/
  `packet-assembler.ts` lane already defaults to `_768_v2`. Picking `_768_v2` everywhere today
  would silently drop PageRank/authority/tag ranking signals — needs a payload backfill or a
  reversed canonical pick, not a blind constant-propagation. See `codereview-semantic-dimension-
  regression-aug22/tasks.md` section 5.
- **RESTORED — XGBoost reranker collateral regression**: `a2e4dab329` reverted `scripts/atlas/
  train-xgboost-reranker.py` back to its pre-fix hardcoded `'device': 'cuda'  # falls back to cpu`
  state and deleted its 2 supporting Python modules (`prove_atlas_xgboost_gpu_runtime_v1.py`,
  `atlas_xgboost_grouped_ranking_v1.py`), while retiring unrelated Atlas v1 modules in the same
  commit. Independently corroborated by a separate external audit reaching the identical
  `COLLATERAL_REGRESSION` conclusion before restoring. Restored via `git restore --source=<exact
  historical commit>` for all 3 files (working-tree + committed this session, not squashed into
  the historical commits). **Not yet run**: the bounded synthetic GPU proof
  (`python python/prove_atlas_xgboost_gpu_runtime_v1.py --rows 100000 --cols 32 --rounds 64
  --device cuda:0`) — next session should run this before trusting the restore compiles-and-works,
  not just compiles.
- **Fixed `scripts/audit/backend-infrastructure-audit.sh`**: wrong container-name defaults
  (`deeds-redis-prod`/`phase66-rabbitmq` → `legal-ai-valkey`/`legal-ai-rabbitmq`) and missing
  Redis `-a` auth flag on all `redis-cli` calls (silent `NOAUTH` failures were masquerading as
  G1 SKIP / G3 FAIL). Now 11/4/3 pass/fail/skip out of the box, no env overrides needed.
- **Fixed `sveltekit-frontend/src/lib/server/agent/supervisor.ts`**: `getTopology()` read
  `this.graph` without awaiting the init chain `investigate()`/`stream()` already await — made it
  `async` + added `await this.ensureGraph()`. Zero live callers currently, safe change.
- **D9 orphan-verification chain run end to end** after unblocking a broken `glob` import in
  `deep-audit-ast.mjs` (assumed glob v9+ named-export API against an undeclared, incidentally-
  installed v7.2.3 transitive dependency — fixed via scoped `npm install --no-save glob@10`, not
  persisted to package.json; `D9_GLOB_COMPATIBILITY_PATCH.md` in the external recovery package at
  `Downloads/parent_atlas_recovery_review_2026-08-23/` has a more durable source-level shim if
  wanted). Result: 7,416 raw fanIn=0 candidates → 613 true-orphan after triage (91.7% resolved as
  dynamic-import-target/sibling-replaced/fanOut-without-fanIn — matches this repo's own documented
  ~95% false-positive-rate warning almost exactly). Cross-referenced against `next_steps/`: 37
  PLANNED (should wire, not archive), 3,964 DRIFT (archive candidates), 136 INVERTED (stale plans
  referencing nonexistent files). Reports are gitignored (`sveltekit-frontend/reports/`), not
  committed — regenerate via `node scripts/deep-audit-ast.mjs --gate=D9 && node scripts/triage-d9-
  shallow-dynamic.mjs && node scripts/triage-orphans-vs-next-steps.mjs` from `sveltekit-frontend/`.
- **Live-reproduced the ACE `.length` crash** (previously flagged in `inference-wiring-deep-audit-
  aug22` as unresolved with unreliable stack-trace line numbers). Repaired a completely broken dev
  environment first (12 missing/undeclared dependencies: `@babel/code-frame`, `@babel/parser`,
  `postcss-preset-env`, `@internationalized/date`, `class-variance-authority`, `marked`,
  `@tiptap/*` ×4, `bcryptjs`, `dexie`, plus a missing native `sharp` binary — all fixed via scoped
  `npm install --no-save`, not persisted). Confirmed the crash is real and path-dependent (2/4
  requests through `/api/v1/chat/completions` succeeded, 2/4 crashed with the same error), and
  confirmed the reported stack-trace file/line/function are unreliable under Vite's dev-mode SSR
  transform (checked both reported lines directly — one is a comment, one is an unrelated `await`
  call, neither has a `.length` read nearby). Root throw site still not located — needs breadcrumb
  instrumentation, not more static reading. Also found a real, separate, unrelated bug along the
  way: `telemetry-compressor.ts:29` fails with `column "source_ref_id" does not exist` (same
  schema-drift class as 2 previously-fixed bugs in that file).
- **Not investigated this session, flagged only**: root `main` currently shows an enormous number
  of modified files unrelated to any of the above work (likely CRLF/LF normalization noise, or
  concurrent-session activity) — worth a `git diff --stat` sanity pass before the next commit on
  this branch, to make sure nothing unexpected gets swept into a future broad `git add`.
- **External recovery package referenced this session**: `Downloads/parent_atlas_recovery_review_
  2026-08-23/` (README_REVIEW.md, RESTORE_XGBOOST_REGRESSION.ps1, D9_GLOB_COMPATIBILITY_PATCH.md,
  AUDIT_A2E4DAB329.md, NEXT_COMMANDS.ps1, MANIFEST.json) — independently reached the same XGBoost
  regression conclusion via a separate audit pass; its `AUDIT_A2E4DAB329.md` has a disciplined
  phase-by-phase classification framework (`INTENTIONAL_V1_RETIREMENT` / `REPLACED_BY_V2` /
  `COLLATERAL_REGRESSION` / `HISTORICAL_DOC_ONLY` / `UNKNOWN_NEEDS_OWNER_REVIEW`) worth reusing if
  auditing the rest of `a2e4dab329`'s 582 files beyond what this session already checked
  (`materialize-graphify-source-inventory-v3.mts`, `audit-agent-runtime-alignment.mjs`,
  `canonical-semantic-768-source-ref-v1.ts`, `texture-layout-v1.ts`/`texture-lod-residency-v1.ts`,
  `packet-domain-lineage-v1.ts` — all confirmed clean removals with zero dangling references).
- **Next session priority order** (per the external package's own recommendation, which this
  session's own findings independently agree with): (1) run the XGBoost bounded GPU proof to
  confirm the restore actually works, not just compiles; (2) instrument and re-trigger the ACE
  `.length` crash to find the real throw site; (3) resolve the `codebase_chunks_768` vs `_768_v2`
  split; (4) resume the Graphify revision-owner proof sequence → snapshot/Qdrant lineage → FANOUT,
  which was blocked all session on the semantic-dimension question that's now resolved.

**Addendum, same session — 129-file pile RESOLVED, was concurrent user commit, not abandoned
work.** The 129 uncommitted files flagged above were never mine to review — while this session's
handoff commit was in flight, the user landed their own commit **`806c0ed2fe` ("docker_audit_823")**
directly on `origin/main` in the same working directory, in between this session's `git fetch` and
`git push`. `git push origin main` succeeded but reported `806c0ed2fe..b8c9c9c2e9` instead of the
expected `7d3eb0f61f..b8c9c9c2e9` — a fast-forward, not a conflict, so nothing was lost. Verified
directly: `git show 806c0ed2fe --stat` is 125 files changed, 420,710 insertions / 247,677 deletions,
and includes every file this addendum had named as unreviewed — `docker-compose.yaml` (the exact
-313 lines flagged), `docker-compose.dev.yml`, `docker-compose.production.yml`, `docker-compose.test.yml`,
`docker-compose.yml`, `docker/docker-compose.gpu.yml`, `docker/omni-worker/docker-compose.omni.yml`,
`scripts/start_services.sh`, `sveltekit-frontend/scripts/mcp/atlas-tools-mcp.mjs`,
`sveltekit-frontend/scripts/atlas/prove-code-revision-owner-canary.mts`,
`sveltekit-frontend/scripts/atlas/observe-workspace-source-binding.mts`,
`sveltekit-frontend/scripts/atlas/workspace-revision-origin-runtime-v1.ts`,
`scripts/tests/smoke-outcome-ledger.mjs`. `docs/reports/graphify-source-inventory-plan.json`'s v1→v2
schema regen (the "246K deletions" false alarm) is also in this commit. **No review/commit action
needed from this addendum's original "next-session action" — it's done, by the user, not this
session.** Post-resolution `git status --short` is down to 11 entries, all unrelated new activity
(3 pre-existing submodule pointers, a couple of new graphify receipt files, `REVIEW_AND_NEXT_STEPS.md`,
`run-graphify-daily-startup.mjs` in two locations, `sveltekit-frontend/package.json`,
`sveltekit-frontend/docs/reports/graphify-bm25-index-plan.json`) — not reviewed this session, low
concern, small enough to review quickly whenever picked up next. The **docker-compose canonical-file
decision itself is still open** — `806c0ed2fe` edited multiple compose files but per its own audit
history did not declare a winner; `docker-compose-duplication-remediation/tasks.md`'s operator
decision is still pending regardless of this file-pile resolution.

### Session handoff — 2026-08-23 (second review package: `CURRENT_STATE_REVIEW.md`/`SAFE_NEXT_COMMANDS.ps1`)

A second external review package landed at repo root (`CURRENT_STATE_REVIEW.md`,
`SAFE_NEXT_COMMANDS.ps1` — the other 3 files it references, `EVIDENCE_MANIFEST.json`,
`WEB_VERIFICATION.md`, `workstation_handoff_20260822_192206.txt`, do not actually exist on disk;
their content was pasted inline in chat instead). Ran every read-only/proof command from
`SAFE_NEXT_COMMANDS.ps1` and verified each of the review's 7 numbered claims against live state:

1. **768 canonical / Valkey naming** — no contradicting evidence found; consistent with this
   session's earlier resolution (see the embedding-dimension entries above).
2. **AST corpus parity still structurally blocked — CONFIRMED, still live.** Ran
   `ATLAS_AST_PARITY_CORPUS_LIMIT=66 npx tsx scripts/atlas/prove-node-tree-sitter-corpus-parity-v2.mts`:
   `status: "CORPUS_PARITY_MISMATCH"`, `fullParity: "16/66"` (up from the 5/66 the external handoff
   cited — some improvement since, but still failing), `exactSpanParity: "17/66"`,
   `EXACT_SPAN_MISMATCH: 463`. Root cause matches the review's claim: current
   `python/miniforge_nlp_sidecar_v2.py` (line ~262) takes `byte_start`/`byte_end` from the chunker
   completely unvalidated — no CRLF/LF remap, no repair layer at all.
3. **CRLF/LF span-compat module deletion — CONFIRMED and PARTIALLY RESTORED.**
   `git show --diff-filter=D --name-only a2e4dab329...` confirms `python/atlas_treesitter_span_compat.py`
   and `python/test_atlas_treesitter_span_compat.py` were deleted by that commit. Inspected the
   restored-candidate content first (pure, self-contained, fail-closed, zero external deps beyond
   stdlib) before acting. Restored both files via `git restore --source=a2e4dab329^ --`, ran
   `python -m pytest python/test_atlas_treesitter_span_compat.py python/test_miniforge_nlp_sidecar_v2_bytes.py`
   → 7/7 pass. **NOT wired into the live sidecar** — found the old sidecar actually had *two*
   overlapping CRLF-repair layers (`atlas_treesitter_span_compat.py`'s `resolve_chunk_byte_span`,
   plus sidecar-local `_resolve_original_chunk_span`/`_span_matches_original`/
   `_lf_boundary_to_original_map`, both deleted, both doing similar-but-not-identical remapping).
   Wiring requires reconciling why two mechanisms existed and rewriting the live chunk-processing
   loop (`miniforge_nlp_sidecar_v2.py` lines ~260-330 in the old version) — a real architectural
   decision on a hot path of a running service, not a mechanical restore. **Deliberately stopped
   here** rather than rewrite a live service loop blind. Module + tests are staged
   (`python/atlas_treesitter_span_compat.py`, `python/test_atlas_treesitter_span_compat.py`), inert
   until wired (nothing imports them yet, so zero behavior change from this restore alone).
4. **XGBoost qid/QuantileDMatrix/device hardening — CONFIRMED ALREADY RESOLVED, review claim is
   stale.** The review's claim #4 describes the pre-restore state; this session had already fixed it
   earlier (commit `d7d396b369`). Re-verified live: `QuantileDMatrix` with `ref=dtrain`, `--device`
   CLI arg with fail-closed `_find_any_value_containing(resolved_config, 'cuda')` check, `qid`
   sorting/attachment via `prepare_grouped_ranking_dataset_v1()`. Updated
   `openspec/changes/parent-atlas-xgboost-cuda-runtime-proof/tasks.md` sections 2-4 to `[x]` with
   evidence. **Also found and restored a missed file**: the earlier XGBoost restore pass got the two
   production modules but missed `python/tests/test_atlas_xgboost_grouped_ranking_v1.py` (also
   deleted by `a2e4dab329`) — restored it, and **found+fixed a real, restore-independent bug**: its
   `importlib.util.spec_from_file_location(...) → exec_module()` pattern didn't register the module
   in `sys.modules` before exec, which fails under this machine's Python 3.13
   (`dataclasses` needs `sys.modules[cls.__module__]` for `ClassVar`/`KW_ONLY` resolution). Fixed
   with the standard `sys.modules[spec.name] = module` idiom; 4/4 pass after the fix. **Still open**:
   the bounded synthetic GPU proof run itself (task section 1, `XGBOOST_GPU_RUNTIME_PROVEN`) — not
   executed this pass either, same as noted in the earlier XGBoost restore entry above.
5. **`a2e4dab329` deserves targeted, not wholesale, audit** — agreed, consistent with this session's
   approach throughout (spot-checked, restored only what inspection confirmed safe).
6. **Graphify migration additive-only / DB-connected proofs both re-run, both still pass.**
   `audit-graphify-revision-migration-safety.mts` → `GRAPHIFY_REVISION_MIGRATION_ADDITIVE_ONLY_PROVEN`,
   zero destructive findings. `prove-graphify-revision-migration-preflight.mts` → connected to the
   real DB (read-only), `GRAPHIFY_REVISION_MIGRATION_PREFLIGHT_COMPATIBLE`, `v2Columns` already
   present live (`workspaceRevision`, `sourceManifestDigest`, `codeSourceRevision` all `true`),
   `baseSchemaConflicts: []`. No migration was applied; none needed applying — the v2 schema is
   already live. `fanoutMayConsumeAsCanonical: false` in both — FANOUT still not authorized by this
   proof pair alone.
7. **D9 tooling gap** — already found and fixed by this session earlier (glob v7→v10 shim, npm
   script wiring); not re-litigated this pass.
8. **384-dim stale-canonical grep** — `rg "codebase_chunks_384|384-dim|legal-ai-redis|legal_ai_redis"`
   across `AGENTS.md`/`CLAUDE.md`/`.cline*`/`.claude` → only hits frame 384 as legacy/compatibility,
   none claim it canonical. No stale-policy drift found.

**Committed this pass**: `python/atlas_treesitter_span_compat.py` (new),
`python/test_atlas_treesitter_span_compat.py` (new), `python/tests/test_atlas_xgboost_grouped_ranking_v1.py`
(restored + bugfixed), `openspec/changes/parent-atlas-xgboost-cuda-runtime-proof/tasks.md` (sections
2-4 marked done with evidence).

**Next-session priority, updated**: (1) decide + implement the CRLF span-compat wiring into
`miniforge_nlp_sidecar_v2.py` (requires reconciling the two historical repair layers — read both
old implementations first, in this doc's referenced scratch paths or via
`git show a2e4dab329^:python/miniforge_nlp_sidecar_v2.py`); (2) re-run the 66-file corpus parity
proof after wiring to see whether `fullParity` improves — that's the actual acceptance signal;
(3) run the bounded XGBoost GPU proof; (4) everything else already queued above (ACE crash
instrumentation, `codebase_chunks_768`/`_768_v2` split, Graphify FANOUT sequencing, docker-compose
canonical-file decision).

### Session handoff — 2026-08-23 (CRLF span-compat wiring completed, real measured fix)

Followed up on the deferred wiring decision from the previous entry. Reconstructed the exact
pre-deletion pipeline by diffing (with `--strip-trailing-cr` — CRLF line endings were making `diff`
report the whole 625-line file as one giant hunk) the historical `miniforge_nlp_sidecar_v2.py`
against current, and confirmed via grep that `_normalized_lf_to_source_byte_offsets`/
`_repair_raw_chunk_byte_span` had **zero callers even before the deletion commit** — genuinely dead
code, correctly left out. Restored and wired the two real, used layers:
`resolve_chunk_byte_span()` (from the module restored in the prior entry) + sidecar-local
`_resolve_original_chunk_span()`/`_span_matches_original()`/`_lf_boundary_to_original_map()`/
`_raw_chunk_content_bytes()`, plus `_structural_symbol_name()` and `_diagnostics_have_errors()`.

**Found and fixed a real, pre-existing bug independent of the restore.** Restored
`python/test_miniforge_nlp_sidecar_v2_multiline_crlf.py` (also deleted, the end-to-end regression
test for exactly this pipeline) and it failed. Verified — importantly — that this was **not**
something introduced by my restore: checked out the sidecar file completely unmodified at
`a2e4dab329^` (the actual pre-deletion state) via a throwaway `PYTHONPATH` sandbox and confirmed the
test already failed there too. Root cause: `_resolve_original_chunk_span()`'s first validation pass
required an exact byte match, but by the time it runs the span may already have been LF-remapped by
`resolve_chunk_byte_span()` — so it would re-interpret already-corrected original-byte coordinates
as still-LF-relative and attempt a second, incorrect remap (exactly what the test's docstring warns
against: "must not be interpreted as LF-relative twice"). Fixed with one line:
`allow_lf_normalized_content=True` on that first check — a strict superset of the exact-match case
(a no-op when no CRLF is present), so it only additionally accepts spans the old code wrongly
rejected. 8/8 relevant tests pass after the fix.

**Real infra gotcha hit along the way**: the corpus parity proof talks to the sidecar over HTTP
(`create8095AstProvider`), and the running `miniforge-nlp-sidecar` Docker container bakes
`python/` into the image at build time (`docker/miniforge-nlp-sidecar/docker-compose.yml`'s volume
mount is `../..:/workspace:ro` — NOT `/app`, where the code actually runs from) — a source edit
alone does nothing until the image is rebuilt. Ran `docker compose build` (~80s) then
`docker compose up -d` (recreated the container) before the fix showed up in the proof output.
**If touching this file again, remember: rebuild + recreate the container, don't just edit and
re-run the proof** — the first parity re-run after the initial restore-but-not-yet-rebuilt state
showed *zero change* and was momentarily confusing before this was root-caused.

**Measured, real result** (`ATLAS_AST_PARITY_CORPUS_LIMIT=66 npx tsx
scripts/atlas/prove-node-tree-sitter-corpus-parity-v2.mts`, same 66-file corpus, before rebuild vs.
after):

| Gate | Before | After |
|---|---|---|
| `EXACT_SPAN_MISMATCH` count | 463 | **0** |
| `exactSpanParity` | 17/66 | **45/66** |
| `fullParity` | 16/66 | **42/66** |

Still `CORPUS_PARITY_MISMATCH` overall — the CRLF/byte-coordinate class of mismatch is now fully
eliminated, but `namedSymbolCoverage` (45/66), `semanticKindParity` (42/66),
`NAMED_SYMBOL_MISSING_LEFT/RIGHT` (12/60), and `SEMANTIC_KIND_MISMATCH` (7) are untouched — a
separate, unrelated issue class (name/kind classification, not byte spans) that would need its own
investigation. Committed as `dd23db570b`.

**Next-session priority, updated**: (1) investigate the `NAMED_SYMBOL_MISSING_LEFT/RIGHT` and
`SEMANTIC_KIND_MISMATCH` gap now that byte-span noise is gone (this should be much easier to isolate
now that 463 spurious span mismatches aren't drowning out the signal); (2) run the bounded XGBoost
GPU proof; (3) resolve `codebase_chunks_768` vs `_768_v2` (94 vs 40 file references — confirmed
substantial, correctly scoped as its own investigation, not tackled this pass); (4) ACE crash
instrumentation; (5) Graphify FANOUT sequencing; (6) docker-compose canonical-file decision.

### Session handoff — 2026-08-23 (memory-architecture design proposal recorded, not implemented)

Received a large (14-part) inline architectural design proposal covering evidence/retrieval/
numerical-working-set/policy layering, an ast-grep-primary structural-authority hierarchy, a
7-level LOD residency contract, candidate-ordinal-indexed Valkey bitmap admission masking, a
wire-format layering rule (JSON/MessagePack for descriptors, Arrow/mmap/tensors for numeric bulk
data, never the reverse), `TANG_INSPIRED_LOW_RANK_SHORTLIST` naming, and a typed-packet-class DAG
synthesis model. **Did not implement any of it blind** — audited what already exists first, per
this repo's own Duplication Prevention rule, and found the overlap is much larger than the
proposal's framing suggested:

- `ContextManifest`/`ContextCandidate`/`ContextLane`/`compileContext()` already exist and work
  (`context-compiler.parent-atlas.ts`) — its own bridge file says "previously unwired, zero
  production callers", organized by retrieval-lane axis, not the proposal's evidence-type axis.
- `CandidateOrdinalMap`-equivalent (ordinal-addressed candidate feature matrices, GPU-resident
  leasing, Arrow readback) is already a real, fairly mature subsystem under
  `src/lib/server/atlas/features/candidate-feature-*` — further along than the proposal implied.
- A 4-level LOD scheme already exists (`packet-lod-manifest.ts`), keyed by cache destination, not
  the proposal's 7-level evidence-type axis — different axis, needs reconciliation, not silent
  duplication.
- A per-packet gate-flag bitmap already exists (`packet-bitmap.ts`) — different purpose from the
  proposal's per-category candidate-membership bitmaps (orthogonal indexing axes, genuinely safe
  to add the new one alongside without conflict).
- Tang-inspired low-rank sampling has no existing owner — genuinely new if built.
- Pinned-memory/CUDA-staging code exists in `python/parent_atlas_tensor/*` but wasn't read in
  detail this pass — unverified whether it already matches the proposed chain.

**Recorded as `openspec/changes/parent-atlas-memory-architecture-freeze/`** (proposal.md + tasks.md
+ specs/atlas-memory-architecture/spec.md) — the audit table above lives there in full, plus a
ranked list of what's actually novel and worth scoping vs. what needs an explicit operator
`CANONICAL_OWNER` decision before any code changes (the two highest-risk items: does the proposed
typed-packet-class model replace or layer onto the existing lane-axis `ContextManifest`, and does
the 7-level LOD scheme replace or layer onto the existing 4-level one — both are exactly the kind
of "two competing owners" mistake this repo's CLAUDE.md warns about, so deliberately left
undecided pending explicit sign-off rather than picked unilaterally).

**Also applied immediately**: the wire-format layering rule itself (JSON/MessagePack for
descriptors, Arrow/mmap/tensors for numeric arrays, never MessagePack for bulk numeric data) is
zero-cost governance with real value — added to `claude.md` as a new canonical section
("🧮 Wire Format Layering Rule") right before the existing Qdrant API Strategy section, since this
repo already hit exactly the failure mode this rule prevents once (the `ENOBUFS` JSON-serializing-
768-dim-vectors incident documented right below it).

**Next-session priority, unchanged from before** (this was a recording pass, not implementation —
none of the priority queue below was touched by it): (1) `NAMED_SYMBOL_MISSING_LEFT/RIGHT` +
`SEMANTIC_KIND_MISMATCH` gap investigation now that CRLF span noise is gone; (2) bounded XGBoost
GPU proof; (3) `codebase_chunks_768` vs `_768_v2` split (94 vs 40 file references); (4) ACE crash
instrumentation; (5) Graphify FANOUT sequencing; (6) docker-compose canonical-file decision. If the
operator wants to prioritize the memory-architecture proposal instead, the two decisions in
`parent-atlas-memory-architecture-freeze/tasks.md` 2.3/2.4 need answering first — everything else
in that change (2.1, 2.2, 2.5, 2.6, 3.1) can proceed independently without those answers.

### Session handoff — 2026-08-23 (memory-architecture proposal fleshed out — major finding: staged tensor-residency bundle)

Followed up on the "flesh it out" request. Read `docs/reports/sessions/MASTER-FEATURE-TODO-2026-05-20.md`
(confirmed genuinely authoritative per `sveltekit-frontend/CLAUDE.md`'s "OpenCode / Memory
Authority" section) looking for alignment — found the doc's own Phase 101B section referencing
`ace:telemetry:{id}:lod0` Redis replay, which led to discovering a **third, unrelated "LOD" naming
collision**: `parent_atlas_documents.summary_lod0/1/2` (real Postgres columns, Drizzle schema,
summary-verbosity axis) plus a single-tier `ace:telemetry:*:lod0` Redis key — neither matched by
the original audit's `\bLOD\b` grep pattern. Added to the proposal's comparison table; the LOD
reconciliation question in tasks.md 2.4 now needs to cover three existing systems, not two.

Completed task 2.2 (field-by-field `AcePacketV2` vs. live `CanonicalAcePacketEnvelope` diff) — the
existing envelope already has real SOM/domain/community routing and already keeps bulk vector data
out-of-band via `mmap_vector_refs` (independently matches the proposal's own "reference, don't
inline" rule). Real gaps: no numeric ordinal identity field, no residency/LOD field, no explicit
`hot`/`nextTopicProbability`/`historicalUtility` policy fields.

**Completed task 2.1 and found something much bigger than expected.** Read the pinned-memory/CUDA
staging code (`gpu_resident_executor.py`, `gpu_tile_cache.py`, `pytorch_gpu_helpers.py`) — the
proposal's exact `mmap → index_select → pin → async H2D` chain is already live code (`torch.empty(
..., pin_memory=True)` → `.to(device, non_blocking=True)` → `torch.index_select`). More
importantly, these files are part of a **much larger staged integration bundle checked into the
repo root**: `parent_atlas_tensor_residency_integration_v2/` (plus an earlier v1) — delivered from
an external working container, with its own `INTEGRATION_ORDER.md` defining gates T0-T9 that
**already cover most of this proposal's numerical-working-set and residency-state-machine scope**,
including a `COLD → MMAPPED → PINNED → GPU_RESIDENT → IN_USE → DEMOTED` state machine that's
effectively the proposal's LOD/residency contract, already named and staged. Gate T0 explicitly
uses this repo's own `CANONICAL_OWNER`/`BACKEND`/`ADAPTER`/etc. governance vocabulary.

**Verified live status directly** (not trusting the bundle's own claims, per this session's
established discipline): `docker exec legal-ai-postgres psql ... \dt atlas_tensor_*` confirms
Gate T1's migration (4 tables: `atlas_tensor_artifacts`, `atlas_tensor_tiles`,
`atlas_tensor_tile_members`, `atlas_tensor_residency_events`) **is applied but all 4 tables have
zero rows** — CREATED, not WIRED. This directly contradicts the bundle's own `CHECKS.json`, which
claims the migration is "unapplied" — another instance of a delivered package's self-reported
status not matching reality, same pattern as the two earlier external review packages this
session. `gpu_tile_cache.py`/`pytorch_gpu_helpers.py` are byte-identical between the bundle and the
live tree (already copied in), despite the bundle's `IMPORT_STATUS.md` saying copy status is
unverified.

**This substantially changes the recommended next step for the memory-architecture proposal's
numerical-working-set slice**: rather than designing pinned-staging/bitmap-admission from scratch,
the concrete next action is working through `parent_atlas_tensor_residency_integration_v2/
INTEGRATION_ORDER.md`'s gates T2 onward (Arrow tile artifact proof, then exact GPU parity proof)
against the live repo — T0/T1 are effectively done. Full writeup, including the exact governance
alignment (Gate T9's NES/LOD-as-debug-view-only warning independently echoes this proposal's own
NES-CHR/OAM analogy caveat) in `openspec/changes/parent-atlas-memory-architecture-freeze/proposal.md`.

**New follow-up task added**: reconcile `parent-atlas-tensor-residency-integration/` (v1) against
the v2 bundle before treating v2 as canonical, and decide whether v1 should be archived once
confirmed superseded (both are git-tracked, not gitignored noise).

**Next-session priority, updated**: (1) work through the tensor-residency bundle's Gate T2/T3
(Arrow artifact proof, exact GPU parity) — this is now the most concretely scoped, highest-signal
next step across all open threads this session has surfaced; (2) `NAMED_SYMBOL_MISSING_LEFT/RIGHT`
+ `SEMANTIC_KIND_MISMATCH` AST gap; (3) bounded XGBoost GPU proof; (4) `codebase_chunks_768` vs
`_768_v2` split; (5) ACE crash instrumentation; (6) Graphify FANOUT sequencing; (7) docker-compose
canonical-file decision; (8) the two remaining CANONICAL_OWNER decisions in the memory-architecture
proposal (typed-packet model vs. existing lane-axis ContextManifest; which of the now-four LOD
meanings survives).

### Session handoff — 2026-08-23 (Gates T2 and T3 actually run and PASS, real GPU proof)

Continued directly on the tensor-residency bundle finding. Correction first: a full diff of all 29
non-spec TypeScript files in `parent_atlas_tensor_residency_integration_v2/` against the live tree
found 26 byte-identical and the other 3 **live-ahead** of the bundle (e.g. `tensor-artifact-
contract.ts` is 124 lines live vs. 39 in the bundle) — this bundle isn't "unapplied," it's already
substantially merged and the live repo kept developing past its snapshot. So the real gap was
narrower than first framed: Gates T2/T3 existed as code but hadn't actually been *run and verified*.

Ran them for real:
- **Gate T2**: `python -m parent_atlas_tensor.cli build-feature` against a real 3-row JSONL fixture
  → produced a real `feature_matrix_5` Arrow IPC file, round-trip-read back via `pyarrow.ipc.open_file`
  and confirmed schema (`features5: fixed_size_list<float>[5]`, `topology4:
  fixed_size_list<float>[4]`) and content match exactly.
- **Gate T3**: called `GpuTileCache.promote()`/`.exact_cosine()` directly with a real 200×768
  float32 matrix — staged through the actual pinned-memory → async-H2D path, landed on `cuda:0`
  (confirmed live as the RTX 3060 Ti via `torch.cuda.get_device_name(0)`), computed exact cosine
  top-10 on GPU, compared against an independent from-scratch CPU numpy oracle. **Exact index
  match, max float-value diff 7.45e-9** (float32 rounding noise).

Receipt written to `docs/reports/tensor-residency-gate-t2-t3-proof-2026-08-23.json` with explicit
`notProven` scope (CAGRA/Gate T6 not attempted; used a synthetic fixture/matrix, not live packet
data — Gate T2's own wording allows a small test fixture; ACE residency-policy wiring/Gate T4 not
touched — the tile cache was called directly, not through `ace-residency-policy.ts`).

Updated `parent-atlas-memory-architecture-freeze/proposal.md` and `tasks.md` (2.7) with the
correction and the real results.

**Next-session priority, updated**: (1) Gate T4 — wire the actual `ace-residency-policy.ts` state
machine (`COLD → MMAPPED → PINNED → GPU_RESIDENT → IN_USE → DEMOTED`) and re-run an equivalent
proof through that layer instead of calling `GpuTileCache` directly; (2) re-run Gates T2/T3 against
real production packet data (real `semantic_768` rows from Postgres/Qdrant) instead of a synthetic
fixture, once T4 wiring exists; (3) `NAMED_SYMBOL_MISSING_LEFT/RIGHT` + `SEMANTIC_KIND_MISMATCH`
AST gap; (4) bounded XGBoost GPU proof; (5) `codebase_chunks_768` vs `_768_v2` split; (6) ACE crash
instrumentation; (7) Graphify FANOUT sequencing; (8) docker-compose canonical-file decision; (9)
the two remaining CANONICAL_OWNER decisions in the memory-architecture proposal.

### Session handoff — 2026-08-23 (Gate T4 run — real bug found and fixed same-day)

Continued directly to Gate T4 per the prior entry's stated next step. Wrote
`scripts/atlas/prove-tensor-residency-gate-t4.mts` (TS side — computes a real residency decision
via `ace-residency-policy.ts`'s actual `tileUtility()`/`rankEvictionCandidates()`, still zero other
production callers confirmed) and `python/parent_atlas_tensor/prove_gate_t4.py` (Python side —
drives the real `GpuTileCache` on the live RTX 3060 Ti with that decision).

**First run got the wrong answer.** Promoting tiles in ACE's natural utility-descending order
silently kept the *lowest*-utility tiles resident and evicted the highest-utility ones —
`GpuTileCache` is a plain LRU cache and its docstring says the caller must promote in
*ascending*-utility order for LRU recency to align with ACE's ranking; nothing enforced this except
the comment, and this module had **zero test coverage** before this pass. No exception, no
warning — just backwards residency.

Fixed it same-day rather than leaving it as a TODO: added `GpuTileCache.promote_ranked()` (does the
reversal internally, so a caller passing ACE's natural ranking can't get it backwards), and added
`python/parent_atlas_tensor/test_gpu_tile_cache.py` (3 tests — a regression guard pinning the old
footgun down, a permanent version of the Gate T3 exact-cosine-vs-CPU-oracle check, and a
`promote_ranked()` correctness test). All 12 tests in this Python package pass after the fix
(up from 9 before). Full receipt: `docs/reports/tensor-residency-gate-t4-proof-2026-08-23.json`
(both the failing and passing runs recorded, not just the final passing one).

Updated `parent-atlas-memory-architecture-freeze/proposal.md` and `tasks.md` (2.9, 2.10) with the
full writeup.

**Noted but not touched**: a pile of unrelated concurrent files appeared in `git status`
(`query-adaptive-sampling-proof.json`, `backfill-ast-symbols.mjs`, `go-retrieval-service/main.go`,
`go-retrieval-facade.ts`/`go-retrieval-orchestrator.ts`, new `audit-atlas-indexing-surfaces.mjs`,
`audit-graph-structural-quality.mjs`, `indexed-rpc-capability-v1.ts`,
`graph-structural-quality-v1.ts`, a new BM25/AST-symbol migration SQL file,
`graphify-daily-workflow-receipt.json`) — matches the pattern from the earlier `806c0ed2fe`
incident (concurrent user/background-hook activity in the same working directory, likely the
`graphify:daily` / GPU-Karpathy background hooks referenced in this session's own SessionStart
context). Left entirely alone per this session's git-safety discipline — only staged/committed the
files this pass actually authored.

**Next-session priority, updated**: (1) Gate T6 (CAGRA parity) — now the next concrete step for
the tensor-residency slice, T4 is solid; (2) re-run Gates T2-T4 against real production packet
data instead of synthetic fixtures; (3) `NAMED_SYMBOL_MISSING_LEFT/RIGHT` +
`SEMANTIC_KIND_MISMATCH` AST gap; (4) bounded XGBoost GPU proof; (5) `codebase_chunks_768` vs
`_768_v2` split; (6) ACE crash instrumentation; (7) Graphify FANOUT sequencing; (8) docker-compose
canonical-file decision; (9) the two remaining CANONICAL_OWNER decisions in the memory-architecture
proposal; (10) whatever the concurrent `audit-atlas-indexing-surfaces.mjs`/`audit-graph-structural-
quality.mjs`/BM25-AST-symbol activity turns out to be, once it's committed by whoever's running it
and shows up cleanly in `git log` instead of as loose working-tree files.

### Session handoff — 2026-08-23 (Gate T6 run — real negative result, CAGRA not ready)

Continued to Gate T6 per the prior entry's priority list. RAPIDS/cuVS is Linux-only on this
workstation, so ran under WSL2 (`atlas-rapids-cu13` conda env, cuVS 26.06.00 confirmed available).

Wrote `python/parent_atlas_tensor/prove_gate_t6.py`: Step 1 proves cuVS `brute_force` exact search
against an independent CPU numpy oracle (100% recall at both 5,000 and 15,000 rows — trustworthy).
Step 2 measures CAGRA's recall against that same brute-force result (never against itself, per
Gate T3/T6's "exact before approximate" rule). **Real result: CAGRA recall dropped from 77% at
5,000 rows to 45% at 15,000 rows — worse with more data, not better — and was slower than
brute-force at both scales.** VRAM was constrained during the run (~1.2GB free out of 8GB;
`llama-server.exe` held ~5.8GB), capping the test at 15,000 rows rather than real corpus scale
(40K-105K rows).

**This is a genuine, correctly-negative gate result**, not a failed proof attempt: per Gate T3/T6's
own stated precondition ("No CAGRA promotion before this passes"), CAGRA is correctly NOT cleared
for promotion with default parameters at the scales tested. Brute-force `exact_cosine`/
`exact_search` (both already proven in Gates T3 and T6-step-1) remain the trustworthy path.
Recorded a scoped follow-up (tasks.md 2.12) for whoever revisits CAGRA later: tune
`graph_degree`/`intermediate_graph_degree`/`itopk_size` instead of defaults, and re-test at real
corpus scale with the full GPU budget free — explicitly noted this finding should not be read as
"CAGRA doesn't work," only "not proven ready at the scales/params tested here."

Receipt: `docs/reports/tensor-residency-gate-t6-proof-2026-08-23.json` (first write attempt got
corrupted by stray WSL/cuVS log lines mixing into the stdout redirect — caught and fixed by
validating with `python -c "import json; json.load(...)"` before trusting the file, same discipline
as every other receipt this session).

**Tensor-residency bundle status after this pass**: T0 (implicit via this proposal's own audit),
T1 (migration applied, schema only), T2 (Arrow artifact — PASS), T3 (exact GPU parity — PASS), T4
(ACE residency wiring — PASS, plus a real bug found and fixed), T6 (CAGRA parity — correctly FAILS
at tested scale/params, real negative result recorded). T5 (Valkey/BitFrost metadata mirroring)
and T7-T9 remain unexercised.

**Next-session priority, updated**: (1) Gate T5 (Valkey/BitFrost residency-state metadata
mirroring) — the next unexercised gate in sequence; (2) re-run Gates T2-T4 against real production
packet data instead of synthetic fixtures now that the pipeline is proven end-to-end; (3)
`NAMED_SYMBOL_MISSING_LEFT/RIGHT` + `SEMANTIC_KIND_MISMATCH` AST gap; (4) bounded XGBoost GPU
proof; (5) `codebase_chunks_768` vs `_768_v2` split; (6) ACE crash instrumentation; (7) Graphify
FANOUT sequencing; (8) docker-compose canonical-file decision; (9) the two remaining
CANONICAL_OWNER decisions in the memory-architecture proposal; (10) CAGRA re-test per 2.12, once
GPU budget/tuning time is available.
