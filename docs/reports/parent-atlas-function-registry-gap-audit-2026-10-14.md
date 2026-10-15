# Parent Atlas Function Registry Gap Audit — 2026-10-14

## Scope and safety

Read-only source audit of existing function/symbol, AST, retrieval, graph, and MCP owners, followed by a pure TypeScript qualification scaffold. No database, Qdrant, Neo4j, cache, or service writes; no migrations or index rebuilds.

## Owner matrix

| Stage | Existing owner | Evidence and state | Missing handoff |
|---|---|---|---|
| Canonical symbol identity/version | `atlas_symbol_registry` / `atlas_symbol_versions` | Drizzle schema and manual migration define `stable_symbol_id`, `symbol_version_id`, `source_revision`, `workspace_revision`, upstream chunk/node IDs, byte bounds, signatures, calls/imports, and producer revision. `OWNER_PRESENT`. | No proof in this source audit that each record resolves to a canonical packet and current source bytes. |
| Callable lookup projection | `atlas_callable_search` | Drizzle schema has FTS, calls/imports arrays, packet key, optional tree node ID, source/workspace revisions, and producer/projection revisions. The manual materializer left-joins AST nodes and allows `n.source_revision IS NULL`; tree-node linkage can therefore be absent or revision-ambiguous. `OWNER_PRESENT`, projection only. | Tight revision-qualified join and independent live readback; no MCP/retrieval consumer found by source search. |
| AST/chunk extraction | `ast-chunker.ts`, Tree-sitter/AST language owners, ast-grep search modules | Existing chunker emits exact UTF-8 byte bounds for supported TypeScript paths; tests cover Unicode/CRLF. Other language owners are separate. `OWNER_PRESENT`, local contract tests only. | No demonstrated producer-to-symbol-version join preserving parser/source/workspace revisions for one real function. |
| Older function catalogue | `scripts/atlas/build-function-registry.mjs`, `docs/atlas/function-registry.md` | Heuristic file/lane inventory using exported-name regexes; generated Markdown/JSON are documentation projections, not function-level canonical records. | Not suitable as FunctionRegistryV1 identity, AST proof, or callable-capability authority. |
| `repo_function_registry` | Drizzle schema and `scripts/opencode/backfill-repo-function-registry.mjs` | File/tool metadata table keyed by `source_ref` and `feature_id`; backfill has an explicit `--apply` UPSERT path. | Not revision-qualified function identity. Do not reuse or run its apply path for this task. |
| Code archaeology graph | `atlas/code-archaeology/code-asset-graph.ts` | Existing non-destructive function/file graph; IDs derive from normalized path, kind, and qualified name. `canonicalWritesAllowed=false`. | Reusable discovery projection only; its path-derived `assetId` is not canonical symbol or packet identity; spans are line coordinates. |
| Retrieval/fusion | SearchRuntime/orchestrator, Qdrant dense retriever, `combineViaRRF` | Existing retrieval lanes and single fusion owner. Qdrant payload aliases may include symbol-version IDs; no callable-search table consumer found in searched server/retrieval callers. | No proven function-level candidate normalization, stable function Top-K or exact one-vote lane receipt. |
| Graph relations | `atlas_symbol_versions.calls/imports`, structural-reference resolution tables, NetworkX/cuGraph owners | Relation storage and graph executors exist separately. | No demonstrated revision-bound resolved call-edge projection joined into function candidates; no graph revision in the new scaffold. |
| MCP | Existing MCP server/tool registries and MCP handler classification | Many MCP tools exist; classification logic explicitly treats AST-only discovery as a hypothesis when live registration is unverified. | No FunctionRegistry search/inspect tool or approved function-invocation capability proven. |

## First failure and status

The first failing boundary is **canonical symbol version → exact packet/source/tree-node evidence**: the DB owners contain these fields in separate records/projections, but the AST-to-owner handoff and strict live readback are not proven. The existing callable projection's nullable AST join is not sufficient evidence by itself.

At initial audit: **OWNER_PRESENT / QUALIFICATION_LOADER_AND_CANDIDATE_BRIDGE_CONTRACT_TESTED / CONCRETE_PROVIDER_NOT_WIRED / SEARCH_RUNTIME_CALLER_NOT_PROVEN / LIVE_VERTICAL_NOT_VERIFIED / MCP_INVOCATION_BLOCKED**. The source audit did not query PostgreSQL, Qdrant, Neo4j, or live MCP discovery.

## Provider implementation update (2026-10-14)

Implemented `function-registry-postgres-snapshot-loader-v1.ts` over the current canonical owners. It uses one repeatable-read, read-only PostgreSQL transaction, parameterized bounded queries, a 12-second statement timeout, and rollback on exit. It resolves the symbol's explicit `upstream_node_id` to the native AST node, binds packet and workspace source rows by exact identity/revision, reads bytes only under the selected repository root, enforces a 16 MiB cap, and checks the requested source digest before qualification. It derives `astPath` only by walking same-revision native parent links; an incomplete chain, absent native node, mismatched span, or ambiguous owner row does not qualify.

Focused tests cover the filesystem safety/readback helper and the existing registry contracts: **28/28 tests passed across seven spec files**, command exit 0. Symlink-escape assertions run when the host permits symlink creation. Strict OpenSpec validation and scoped whitespace checks are recorded separately below. These tests did not connect to PostgreSQL, so there is still no live source/packet/symbol proof or runtime caller. SearchRuntime and MCP are not wired; function invocation remains disabled.

Updated state: **PROVIDER_IMPLEMENTED / FIXTURE_TESTED / LIVE_READBACK_NOT_ATTEMPTED / SEARCH_RUNTIME_NOT_WIRED / MCP_NOT_WIRED**. Next gate: independently authorize and select one bounded real symbol version, then verify the resulting load receipt against direct source and owner readback. Do not run materializers, rebuild projections, or write database state as part of that proof.

## SearchRuntime seam update (2026-10-14)

The generic `RetrievalInput` now carries optional `workspaceRevision`, and SearchRuntime forwards the query's revision to injected retrievers. The qualified function-registry retriever requires an exact configured/request revision match before discovery or loading and emits only the existing `ast` lane. Validation: retriever contract **4/4 passed**; existing SearchRuntime revision-propagation case **1/1 passed** (targeted name filter; 16 unrelated cases skipped); exit 0. This establishes a DI seam, not production registration or live function retrieval. Current state: **SEARCH_RUNTIME_DI_SEAM_TESTED / PRODUCTION_CALLER_NOT_WIRED / LIVE_READBACK_NOT_ATTEMPTED / MCP_NOT_WIRED**.

Added `createPostgresFunctionRegistryRetrieverV1` as an opt-in composition of candidate discovery plus the verified loader. Candidate discovery searches only `atlas_callable_search.search_vector` and exact `qualified_name`, binds the exact expected workspace revision, uses a parameterized limit capped at 64, and treats returned symbol-version/source revisions only as hints. It runs in a repeatable-read, read-only transaction; each nomination must still pass the canonical symbol/registry/packet/source-binding/source-bytes/native-AST checks. The projection's packet key and tree-node fields are deliberately ignored. The factory is not installed in production callers.

Targeted tests: candidate discovery and registry retriever **7/7 passed**, exit 0; command: `cd sveltekit-frontend && npx vitest run --config vitest.lane-contracts.config.ts --pool=threads --maxWorkers=1 src/lib/server/atlas/function-registry/function-registry-postgres-snapshot-loader-v1.spec.ts src/lib/server/atlas/function-registry/function-registry-retriever-v1.spec.ts`. This verifies query parameterization, workspace scoping, bounded candidate count, and fail-closed qualification behavior using fixtures/mocks—not SQL execution against live PostgreSQL. Updated state: **READ_ONLY_CANDIDATE_FACTORY_IMPLEMENTED / SQL_CONTRACT_TESTED / LIVE_POSTGRES_NOT_ATTEMPTED / PRODUCTION_REGISTRATION_NOT_WIRED / MCP_NOT_WIRED**.

## Initial implementation

Added a pure, fail-closed `FunctionRegistryV1` qualification helper. It reuses caller-supplied `stableSymbolId` and `symbolVersionId` and requires exact packet key, tree node, source/workspace revision, qualified name, byte span, expected source digest, and source-byte slice equality. It records absent graph edges, summaries, and capabilities as absent; output is advisory, non-authoritative, and write-disabled. This does not read PostgreSQL, mint IDs, materialize a registry, or prove live lineage.

Added a deterministic `FunctionRegistrySnapshotV1` composition contract over those qualified entries. The snapshot references existing symbol-version IDs and binds relationships to source/target revisions, capabilities to an observed tool-registry revision, and semantic representations to their source hash and model/representation revisions. It stores references rather than vectors or projection IDs, keeps invocation disabled, and marks the snapshot advisory/non-authoritative/write-disabled. A canonicalized checksum detects snapshot tampering. This is a pure composition scaffold: it does not fetch owner rows, prove relationship resolution, register MCP tools, or authorize invocation.

## Next gates

1. Build a read-only adapter over the existing symbol-version/callable owners with exact revision predicates; reject missing packet/tree/source bindings.
2. Prove one AST chunk against reopened source bytes and an independently read-back symbol-version row.
3. Add function-level retrieval through the existing SearchRuntime lane and `combineViaRRF`; test same-lane deduplication and stable Top-K.
4. Resolve call references only through existing structural-reference resolution evidence; keep unresolved references explicit and graph features advisory until bound to a qualified graph snapshot.
5. Add MCP search/inspect only after an actual registered caller and permission contract are verified. Do not make discovered functions executable by default.

## Integration definition

### Authority and read path

Use `atlas_symbol_versions` as the only function-version identity owner. Preserve its `symbol_version_id`, `stable_symbol_id`, `source_ref`, `source_revision`, `workspace_revision`, `upstream_node_id`, `upstream_chunk_id`, `qualified_name`, declaration hash, byte span, and producer revision as owner fields; never derive replacements from file paths, graph IDs, Qdrant point IDs, ordinals, or names. A `FunctionRegistrySnapshotV1` is an in-memory/read-model composition over those owner rows, not another registry table.

Use `atlas_callable_search` only to find candidate `symbol_version_id` values. Before returning a qualified function, join each candidate back to `atlas_symbol_versions` by exact `symbol_version_id`, then enforce exact source/workspace revision and a uniquely resolved, non-null `tree_node_id`. Require the AST node's exact source reference, source revision, and byte span to match the symbol-version row. Reopen the bound source bytes and verify the source digest and byte slice; resolve `packet_key` through the existing canonical packet/source binding owner rather than copying a projection value as proof. A missing or ambiguous link is a typed non-result, never a fallback identity.

### Projection quarantine

There are two distinct paths and they must not be conflated. The standalone `20260824_atlas_callable_search_v1.sql` backfill matches AST rows using `source_revision = symbol.source_revision OR source_revision IS NULL` and permits null `tree_node_id`; it is unsuitable as the proof path for a qualified function registry. The bounded `scripts/atlas/materialize-ast-symbol-versions.mjs` path validates symbol source/workspace revisions and classifies AST matches by exact source, revision, byte span, and optional upstream node; it leaves unresolved/ambiguous `tree_node_id` null and records `identity_bridge_outcome`. It is a reviewed write path, not a live read adapter and not permission to apply/rebuild it. Keep the permissive legacy backfill quarantined from qualified function lookup; any future materializer change requires a reviewed migration/promotion decision and readback.

### Retrieval and MCP wiring

`function-registry-retriever-v1.ts` now adapts a checksum-verified `FunctionRegistrySnapshotV1` into the existing `Retriever` interface with lane `ast`. It requires an exact expected workspace revision, ranks only on deterministic query-token overlap against qualified name/signature/source reference, and emits the existing `symbolVersionId`, packet key, source revisions, tree node, exact byte span, and snapshot/evidence checksums. It does not query PostgreSQL, emit unqualified projection rows, or turn summaries/graph signals into another vote. Because lane `ast` already exists, this composes as one structural lane rather than adding an additional fusion lane. Three focused adapter tests pass.

This is a contract-level integration point, not a production caller: no canonical snapshot loader is currently wired into the SearchRuntime factory or MCP. Do not configure a loader against `atlas_callable_search` until it implements the owner joins, source revision fence, packet/source binding, AST uniqueness, and source-byte readback described above. Function summaries remain nullable until grounded to the exact function span. Graph relations remain advisory unless independently resolved to revision-qualified symbol-version endpoints and a graph snapshot revision.

### Implemented read-only qualification boundary

Added `function-registry-read-adapter-v1.ts` with dependency-injected read ports rather than a new database or registry owner. It accepts the existing symbol-version, symbol-registry, AST-node, packet, workspace-source-binding, and source-byte owner rows. It rejects absent or duplicate symbol/AST/packet/binding matches; enforces active registry ownership, source/workspace revision parity, native non-null `tree_node_id`, matching relative path and qualified symbol, exact AST/source hash and UTF-8 byte-span text; then delegates to the existing pure qualifier and deterministic snapshot builder. It returns structured rejection codes and includes evidence references for admitted snapshots.

This closes only a local contract gap. The adapter intentionally has no concrete PostgreSQL port provider yet; no database was queried, no live symbol was qualified, and `atlas_callable_search` was not modified or rebuilt. The adapter’s fixture suite covers success, revision mismatch, missing/ambiguous AST, altered bytes, and duplicate packet evidence. The actual source/workspace/packet/AST schema still needs a concrete provider derived from the existing read-only proof scripts, with an explicitly bounded scope and transaction discipline.

Added `function-registry-snapshot-loader-v1.ts` as the typed `loadQualified(symbolVersionId, expectedWorkspaceRevision, expectedSourceRevision)` boundary over that qualifier. It emits `FunctionRegistryLoadReceiptV1` with packet/tree/source hash/snapshot checksum when qualified, structured rejection reason otherwise, and a deterministic receipt checksum; it never includes source text. The expected source revision is now enforced by the underlying qualifier, rather than relying on snapshot checksum verification alone. This loader is port-injected and fixture-tested; it is not a live PostgreSQL loader and does not discover candidates from `atlas_callable_search`.

Added a candidate-first adapter to `function-registry-retriever-v1.ts`. Its discovery callback returns only candidate symbol-version IDs and claimed source revisions; duplicate IDs are collapsed, every remaining candidate is requalified through the loader using the requested workspace revision, and rejected candidates are omitted. Successful results are projected to the existing `ast` lane, ordered deterministically, and collapsed to one packet candidate before returning. This is an injectable contract, not a registered SearchRuntime dependency or database query. Callable-search remains untrusted nomination only.

### Existing AST lane and fusion behavior

`postgres-ast-retriever.ts` already reports lane `ast`; `function-registry-retriever-v1.ts` also reports lane `ast`. The canonical `fuseSearchRuntimeCandidates` path documents one vote per logical lane and lane-local deduplication, with focused fusion tests in `fusion-lane-dedupe.spec.ts`. This establishes reusable same-lane mechanics, not production integration: the function registry retriever is not registered in the SearchRuntime caller, and no actual mixed-executor replay has demonstrated that two identical function candidates collapse to one vote. Keep both integration and replay gates open.

### Concrete-provider schema fit

The current `atlas_ast_nodes` Drizzle owner has `sourceRevision`, `sourceContentHash`, `relativePath`, `treeNodeId`, parser fields, `parentTreeNodeId`, and optional `sourceRefKey`, but no `workspaceRevision` or `astPath` column. Consequently, a provider must qualify workspace revision through the exact packet and `atlas_workspace_source_bindings` records plus whole-file hash equality; it must not invent workspace provenance on the AST row. The AST path required by the pure registry evidence contract must come from a native parent-chain/parser observation, or the contract must be reconciled to the actual owner before a database provider is implemented. `sourceRefKey` is nullable and must not serve as the only source identity. This is a concrete provider design gate, not permission to add columns or fabricate AST fields.

Expose MCP `search` and `inspect` only after a real tool registration and permission contract are found. Search/inspect are read-only evidence operations. Invocation is a separate allowlisted capability requiring an existing registered handler, authorization, argument schema, and execution receipt; `toolRegistrationStatus=VERIFIED` alone does not enable it. No live MCP caller or GraphRAG consumer was proven in this audit.

### Relevance calibration boundary

Keep current lexical/sparse/dense/AST candidate generation and canonical RRF as the baseline. Bayesian language, BM25, and probability calibration are not synonyms: the new adapter provides deterministic lexical candidate ordering only; it does not produce BM25 scores, relevance probabilities, or a trained model. Add logistic calibration only after a frozen query/candidate cohort has independently reviewed relevance labels, query/source-group leakage-safe splits, and an RRF baseline. Evaluate probability calibration (Brier score/calibration curve) separately from ranking (MRR/NDCG/Recall@K); fail open to RRF ordering, but never fail open around identity or source freshness checks. No supervised calibration data or production model caller was verified here.

### First vertical proof

1. Choose one existing, current symbol-version row with complete packet/source/workspace revisions and a uniquely resolved AST node.
2. In a read-only database snapshot, fetch the symbol-version row, exact AST node, and canonical packet/source binding; reject if any join is missing, stale, or non-unique.
3. Reopen source bytes and independently verify source hash, declaration byte span, and Tree-sitter/ast-grep observation against the same revisions.
4. Build the advisory snapshot entry, adding only independently qualified graph/capability/representation references; checksum and read back the serialized snapshot.
5. Run one read-only search caller and verify exact candidate identity, stable Top-K, and no cross-lane duplicate vote. Keep MCP invocation disabled.

Current classification: `OWNER_PRESENT` for symbol versions and callable lookup; `CONTRACT_TESTED` for the pure snapshot composer; `PARTIAL` for a prior single-symbol source/AST observation; `BLOCKED` for a generally proven exact packet/source/AST read path and production retrieval/MCP caller. Existing historical cohort receipts are narrow, workspace-specific evidence and must not be generalized to today's full registry.

### Derivation from existing read-only proof tooling

The integration can be derived without inventing a new owner. `scripts/atlas/prove-packet-ast-canonical-symbol-alignment-v1.mts` already demonstrates the needed read transaction: exact `atlas_packets` identity `(packet_key, source_ref, source_revision, workspace_revision_key)`, exact `atlas_workspace_source_bindings` tuple plus digest, and `atlas_symbol_versions` filtered by the same packet/source/source/workspace revisions. It rolls back the repeatable-read transaction, reopens the repository-contained source file, checks its SHA-256 against `source_revision` and the binding digest, then matches AST observations against canonical symbol names and exact byte spans. `scripts/atlas/prove-live-packet-symbol-ast-observation-v1.mts` provides the complementary bounded source parser and enforces symbol-to-packet revision equality before matching AST byte spans.

Derived runtime adapter shape: retain the existing queries' exact predicates and transaction fences; factor their bounded owner-row read and AST/source qualification into a read-only provider returning `FunctionRegistryOwnerEvidenceV1`, exactly one `FunctionRegistryAstEvidenceV1` per symbol version, and the binding's verified bytes/hash. Feed only those through `qualifyFunctionRegistryEvidenceV1` and `buildFunctionRegistrySnapshotV1`, then `createFunctionRegistryRetrieverV1` can be injected into SearchRuntime under the existing `ast` lane. If a source has zero or multiple AST matches, missing binding, stale workspace, or byte/hash mismatch, omit/block that function with a typed reason; do not substitute the callable projection's nullable tree node. This turn inspected and derived the path from source only; it did not execute either DB proof script, access live PostgreSQL, create a receipt, or change data.

Remaining prerequisites for production wiring: choose an explicit workspace/source scope; refactor rather than duplicate the two proof scripts' SQL and byte checks into an importable read-only provider; confirm current schema/runtime access to `atlas_workspace_source_bindings` and packet keys; prove one live source readback plus wrong-revision and ambiguous-match rejection; then register the provider in an actual SearchRuntime caller. Next, add GraphRAG relationships only with endpoint/revision proof, and expose read-only MCP discovery only through the qualified adapter. No calibrated relevance model can be trained or enabled until independently judged labels exist.

## Validation

- `npx vitest run src/lib/server/atlas/function-registry/function-registry-v1.spec.ts` — exit 0; 5/5 tests passed.
- `npx vitest run src/lib/server/atlas/function-registry/function-registry-snapshot-v1.spec.ts src/lib/server/atlas/function-registry/function-registry-v1.spec.ts` — exit 0; 10/10 tests passed.
- `npx vitest run src/lib/server/atlas/function-registry/function-registry-retriever-v1.spec.ts` — exit 0; 3/3 tests passed.
- `npx vitest run src/lib/server/atlas/function-registry/function-registry-snapshot-loader-v1.spec.ts src/lib/server/atlas/function-registry/function-registry-read-adapter-v1.spec.ts src/lib/server/atlas/function-registry/function-registry-retriever-v1.spec.ts src/lib/server/atlas/function-registry/function-registry-snapshot-v1.spec.ts src/lib/server/atlas/function-registry/function-registry-v1.spec.ts` — exit 0; 21/21 tests passed.
- `npx vitest run src/lib/server/retrieval/fusion-lane-dedupe.spec.ts` — exit 0; 5/5 tests passed for existing lane-level dedup behavior.
- Existing fusion implementation review: SearchRuntime groups by logical lane and deduplicates within a lane; function registry and PostgreSQL AST retrievers both declare `ast`. No combined live caller replay was executed.
- Schema fit review: `atlas_ast_nodes` does not store `workspaceRevision` or `astPath`; provider must join workspace binding and derive native AST ancestry or explicitly reconcile the evidence schema before database wiring.
- `npm run check` — interrupted after approximately one minute with no diagnostics; full Svelte type-check status remains unverified.
- Source review only: callable SQL backfill permits null AST revisions/IDs; bounded symbol materializer enforces exact AST revision/span matching but is a reviewed writer, not a reader. No services or stores queried in this turn.
- Scoped whitespace check over the function-registry TypeScript files, report, and OpenSpec ledger — PASS.
- Repository-wide `git diff --check` — exit 1 from unrelated pre-existing trailing whitespace in `docs/master_feature_todo_1011.md` and `simd-bridge/cpp/build-x64-cuda/CMakeFiles/CMakeConfigureLog.yaml`; no whitespace issues were found in the new files.
- Database/service side effects: attempted 0, committed 0.
- Proof level: **QUALIFICATION_AND_LOADER_CONTRACT_TESTED / LIVE_PROVIDER_NOT_WIRED / NO_LIVE_READBACK / SEARCH_RUNTIME_CALLER_NOT_WIRED**.

### ACE function residency proposal follow-up

Implemented `sveltekit-frontend/src/lib/server/atlas/function-registry/ace-function-warm-plan-v1.ts` as a pure proposal receipt over an already checksum-verified function registry snapshot. The caller must provide packet keys from an admitted ContextManifest; the builder filters the snapshot to those keys and emits only revision-bound identity/checksum references. The plan is capped at 32 candidates and 900 seconds, is not an `atlas.packet.v1`, and cannot write caches or add a retrieval vote.

Focused validation: **11/11 tests passed**, exit 0, covering admitted-key filtering, blocked context, invalid snapshot, TTL bounds, and receipt tampering along with the existing provider/retriever contract tests. This is fixture-backed only. No manifest parser, live ContextManifest admission, PostgreSQL readback, cache operation, MCP tool, or production caller was exercised. The new contract is not proof of ACE readiness or warm-cache parity.
