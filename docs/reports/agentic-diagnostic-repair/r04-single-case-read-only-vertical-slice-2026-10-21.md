# R04 Single-Case Read-Only Vertical Slice

**Status:** `PARTIAL_GROUNDED_RECOMMENDATION_BLOCKED_CONTEXT_ADMISSION`
**Scope:** one captured `svelte-check` diagnostic in `src/service-worker.ts`; no model call, source edit, or datastore write.

## Result

The existing review-only proposal is grounded to the exact current source bytes and a complete 8095 Tree-sitter evidence span. The local TypeScript WebWorker declarations support the proposed event-type hypothesis. This is enough for a human-review recommendation, but not enough to build an admitted ContextManifest or hand off a repair-ready task: the proposal has no `workspaceRevision`, and the compiler-context/root-cause hypothesis has not been independently reproduced in the maintained worker project configuration.

## Evidence chain

| Stage | Evidence | Result |
|---|---|---|
| Baseline | `.tmp/atlas/diagnostic-repair-proposals/svelte-check-waituntil-proposal-2026-10-21.json`; complete baseline, capture/input log checksums match; 2,189 errors + 15 warnings = 2,204 parsed diagnostics | `BASELINE_RECEIPT_MATCHED` (the run used a temporary expanded-source config, not the normal project check) |
| Diagnostic | `src/service-worker.ts:641:10`, TS2339 `MessageEvent<any>` has no `waitUntil` | `DIAGNOSTIC_IDENTIFIED` |
| Source identity | Current HEAD `3376feb172cdb41c86c764f6c6cbcb153f199889`; source file is clean; current SHA-256 `1340575e8cd0b9f0322ca516837e44329d816b038d3a77218ab64cfcb2307c7e`; 20,710 bytes, matching the proposal | `SOURCE_BYTES_MATCHED` |
| AST | 8095 response says `COMPLETE`/`CLEAN`; enclosing arrow-function bytes `[17947,18751)` hash to `01c15247630f2552cc194ac3bdc541b06a683d038913c538dacc8a7e17bb4aaf`, matching the proposal; diagnostic byte offset 18,526 falls within the span | `AST_SPAN_MATCHED` |
| Type evidence | Installed TypeScript 5.9.3 `lib.webworker.d.ts`, SHA-256 `6d08cde2bfb6ff909efbf7cb7d6d55be412cf4b9f48fd0430185986973fa91f5`; declares `ServiceWorkerGlobalScopeEventMap["message"]` as `ExtendableMessageEvent`, which extends `ExtendableEvent` | `HYPOTHESIS_SUPPORTED_NOT_ROOT_CAUSE_PROVEN` |
| Recommendation | The captured proposal suggests removing the explicit `MessageEvent` annotation or using `ExtendableMessageEvent`; it includes no patch and requires human review | `ADVISORY_ONLY` |
| Context admission | Proposal has no workspace revision and no maintained worker-config reproduction; existing repair evidence adapter rejects missing workspace revision | `BLOCKED_MISSING_WORKSPACE_REVISION_AND_WORKER_CONFIG_PROOF` |
| Side effects | No source changes, model calls, database/cache/projection writes, or GPU work | `ZERO` |

### Workspace-binding lookup (read-only follow-up)

Queried `public.atlas_workspace_source_bindings` in a `BEGIN READ ONLY` transaction, matching the exact canonical source ref `sveltekit-frontend/src/service-worker.ts` and exact source revision `sha256:1340575e8cd0b9f0322ca516837e44329d816b038d3a77218ab64cfcb2307c7e`. The exact lookup returned **zero rows**. A bounded same-path discovery query found two bindings, both for a different source revision (`sha256:b13b1a67f06b81ad8673a102ca986dd394927c275bb46b29cd94bbc4da17a4c9`) and different workspace revisions. The transaction was rolled back. These rows do not qualify the captured source bytes; no revision was inferred or substituted.

Result: `WORKSPACE_BINDING_NOT_FOUND_FOR_CAPTURED_BYTES`. Context admission remains blocked. A genuine workspace snapshot/binding for the captured bytes is required; the two other revisions are not candidates for substitution.

The existing admitted workspace receipt points to snapshot `sha256:6288726b73626ae58905b5ebdea42e709cb1af67b3e16186bcd8b2b88a89d98b` / workspace revision `sha256:e24bb97187ea6394eeba457dd849915f570045b7a1867780fdc7aa9ea62b9acc`. Its exact `service-worker.ts` entry has source/content digest `b13b1a67f06b81ad8673a102ca986dd394927c275bb46b29cd94bbc4da17a4c9` and byte length 19,654, while the captured current file is 20,710 bytes with digest `1340575e8cd0b9f0322ca516837e44329d816b038d3a77218ab64cfcb2307c7e`. The older snapshot therefore cannot qualify this diagnostic; reconciling by path alone would be incorrect.

Writer review found only explicit apply paths, not a read-only binding producer for this case. `apply-current-workspace-source-bindings-v1.mjs` is guarded for a separate 111-row current-Graphify plan; `apply-admitted-workspace-source-bindings-content-reconciled-v1.mjs` consumes the older admitted snapshot and its recorded dry run had zero candidates. Neither is applicable to the captured bytes. No apply script was invoked and no binding was written.

### Maintained compiler configuration check

The current `sveltekit-frontend/tsconfig.json` extends `.svelte-kit/tsconfig.json`, sets `lib` to `es2024`, `esnext.disposable`, `dom`, and `dom.iterable`, and includes `src/**/*.ts`; however, its `exclude` list explicitly contains `**/service-worker.ts`. The generated `.svelte-kit/tsconfig.json` also excludes `../src/service-worker.ts`. The source itself has a `/// <reference lib="webworker" />` directive and annotates the `message` callback parameter as `MessageEvent` at the captured site. No dedicated worker-specific `tsconfig` was found among the frontend TypeScript configs.

The actual `npm run check` completed with 0 errors and 0 warnings, but this does **not** validate the service worker: both configs exclude it. The targeted TypeScript program bypassed project file selection by explicitly supplying the source and its declaration roots, while retaining compiler options from the maintained `tsconfig.json`; this is why it reproduced TS2339. There is no maintained worker-specific check configuration yet. Treat the targeted result as strong type-level evidence, not a full project-check or runtime proof.

### Targeted compiler reproduction and in-memory challenger

Using the compiler options parsed from the maintained `tsconfig.json`, with `src/service-worker.ts` and the existing `src/lib/types/service-worker.d.ts` as targeted roots, TypeScript 5.9.3 reproduced TS2339 at line 641: `MessageEvent<any>` has no `waitUntil`. An in-memory-only replacement of that callback annotation with `ExtendableMessageEvent` removed all diagnostics in `src/service-worker.ts` in the same targeted program. The compiler host served the modified text from memory; the worktree source was not changed. The existing declaration maps the service-worker `message` listener to `ExtendableMessageEvent`, which extends the local `ExtendableEvent` interface that defines `waitUntil`.

This is strong, narrowly scoped compile-time evidence for the annotation recommendation. It is not a full `svelte-check` run, a browser/runtime behavior test, an independently reviewed patch, or workspace-revision qualification. The repository search found no test that directly exercises `handlePhase18OfflineMessage` or this message-event handler.

### Dependency and caller trace

The worker imports `handlePhase18OfflineMessage` from `src/lib/client/phase18-offline-sync.ts` and passes `event.data` to it for `phase18:sync-offline`. The helper's documented message contract lists five actions (`store-request`, `store-response`, `get-pending`, `update-sync`, `cleanup`) and returns a success/data or failure/error result. `PHASE-18-ENVELOPE-WIRING-COMPLETE.md` documents an example `postMessage` shape and a task to wire the listener, but repository search found no concrete executable sender of this message type and no direct handler test. Thus the docs establish intended use, not active runtime use. The type repair is locally grounded, but user impact remains unknown; do not rank it as high impact until a real sender/use is established.

The AST range/hash and source digest were independently recomputed against the current files during this run. The type declaration proves the relevant library mapping exists; it does not prove the complete application compiler configuration selected that library for the captured diagnostic.

## Focused tests

Ran with Vitest 3.2.4, one thread worker, no file parallelism:

- `agentic-dag-synthesis-v1.spec.ts`: 2/2 passed.
- `repair-evidence-adapter-v1.spec.ts`: 6/6 passed.
- `context-manifest-prompt-plan-v1.spec.ts`: 4/4 passed.
- `contextual-candidate-ranker-v1.spec.ts`: 3/3 passed.
- Total: 15/15 passed.

An initial unbounded worker run was interrupted after producing no completion summary. The bounded single-worker run produced the results above. These focused contract tests prove their respective helper behavior, not live ContextManifest assembly or end-to-end repair admission.

### 2026-10-21 continuation recheck

The focused recheck passed `dspy-repair-output-v1.test.ts` (4/4), `agentic-dag-synthesis-v1.spec.ts` (2/2), and `agentic-repair-context-replay.spec.ts` (2/2): 8/8 total. Strict OpenSpec validation for `parent-atlas-agentic-diagnostic-repair-v1` also passed. These are contract/fixture results only.

A fresh `BEGIN READ ONLY` exact lookup for `sveltekit-frontend/src/service-worker.ts` at source digest `sha256:1340575e8cd0b9f0322ca516837e44329d816b038d3a77218ab64cfcb2307c7e` still returned 0 rows. I also recomputed current byte hashes for the 10 distinct files in R02's 15-warning cohort and joined those exact `(canonical_source_ref, digest)` pairs against `atlas_workspace_source_bindings`; the result was 0 exact bindings. The workspace still cannot be inferred from path, file hash, Git revision, or unrelated historical binding. Both read-only transactions rolled back; no datastore writes occurred.

The admitted snapshot manifest at `docs/reports/workspace-source-snapshots/6288726b73626ae58905b5ebdea42e709cb1af67b3e16186bcd8b2b88a89d98b.json` records source hashes, not retrievable source bytes (`CAPTURE_VERIFIED_REQUIRES_PROCESSING_READBACK`). I checked all reachable Git history for the 10 historical R02 warning-file digests; none of the exact blobs was present. Thus replaying the old admitted bytes from this local repository is not currently possible. The safe next path is a newly authorized snapshot/binding for the actual diagnostic run, not reconstructing content from current files or promoting a path match.

The additional ContextManifest/PromptPlan contract suite was rerun with `vitest.lane-contracts.config.ts` after the default config stalled at startup: `context-manifest-v2.spec.ts` 6/6, `context-manifest-prompt-plan-v1.spec.ts` 4/4, `ace-context-prompt-plan-bridge-v1.spec.ts` 5/5, and `ace-context-manifest-admission-v1.spec.ts` 12/12 (27/27 total). This confirms isolated contract helpers only; it does not change the zero exact source-binding result or qualify R04/R05. No live MCP/model call or datastore write occurred.

### Current workspace preflight

Inspected the existing `sveltekit-frontend/scripts/atlas/plan-current-workspace-source-bindings-v1.mts` dry-run planner. It materializes a candidate workspace manifest, validates source hashes, then performs a PostgreSQL `REPEATABLE READ READ ONLY` check and writes a local `.tmp/atlas` receipt; it does not apply bindings. Attempted the planner to determine whether the diagnostic source could now be qualified, but `resolveDatabaseUrl` failed before connecting because this shell has neither `DATABASE_URL` nor `DB_PASSWORD` configured. No planner receipt was written and no database connection or mutation occurred. This is an execution-environment blocker, not evidence that the source has or lacks a binding. Resume only when the read-only database connection is available; inspect the planner receipt before any separate binding/admission decision.

Correction/recheck: the healthy PostgreSQL container was reachable through its existing local `psql` access, so host planner credentials were not required for a direct read-only check. Recomputed the current file digest (`sha256:1340575e8cd0b9f0322ca516837e44329d816b038d3a77218ab64cfcb2307c7e`), queried the exact canonical source ref and digest in `REPEATABLE READ READ ONLY`, and rolled back. Result: **0 exact bindings**. The controlling blocker is therefore missing admitted source binding, not database availability. No data or source files were changed.

### Alternate grounded diagnostic candidate

To avoid stopping at the unbound service-worker example, I checked expanded-scan task `svelte-check:0008f5722a324846e3733ce` in `src/lib/server/atlas/policy/policy-pattern-extractor.spec.ts:57`. The local expanded-scan projection has `sourceLogSha256: null`; therefore this historical task is **not** ranking-eligible under the checksum-bound-baseline spec. I independently reproduced its current source error with a targeted TypeScript program, but did not capture that ad hoc run as a durable checksum-bound checker receipt; this remains a diagnostic probe and human-review recommendation only.

- Recomputed the test file digest: `sha256:9b139ed995d6daf2ef3f65c6a04674500eb5f83ec7721cd2fa3b2546fc5156e3` (2,631 bytes). An exact read-only query returned two `atlas_workspace_source_bindings` rows for this `(sourceRef, sourceRevision)`, under workspace revisions `sha256:322ed1a6f8ffc52576314fde9a33afd1faba015c3fc8cd60609052c5ca2dfbaf` and `sha256:e24bb97187ea6394eeba457dd849915f570045b7a1867780fdc7aa9ea62b9acc`.
- The current imported implementation `policy-pattern-extractor.ts` (`sha256:1ce875a35c316a2fb73bf9306dad33a05ac19f07c49595dc16576385fa2596cd`) and `policy-types.ts` (`sha256:97653a3b2e200b97acb654375418608893d106948af9c5eea2365a3534eafd1c`) also have exact binding rows under both same workspace revisions.
- A targeted TypeScript 5.9.3 program built with options parsed from maintained `tsconfig.json` reproduced five TS2345 diagnostics at the test's five `extractPolicyPattern(fixture, ...)` call sites. The project configuration digest is `sha256:6f1fcff10c32e0a25c806ef38f2174ff48f9430318fc3c66c2f50d7200a8c655`; no exact source-binding row exists for `sveltekit-frontend/tsconfig.json` at this digest, so the compile environment is recorded but not workspace-qualified.
- The live 8095 `/ast/chunk` response was `atlas.ast.evidence.v1`, engine `treesitter-chunker` 4.0.0, `scan_completeness=COMPLETE`, 16 chunks, with exact path/revision echo. The `fixture` declaration chunk spans bytes `[156,1065)`; the `hmmPosterior` property spans `[334,375)` and is currently `{ TRACE: 0.7, REPAIR: 0.2 }`.
- The imported Zod schema requires a value for every member of `HMM_STATES` (`LOCATE`, `UNDERSTAND`, `TRACE`, `REPAIR`, `VALIDATE`, `RECOVER`). The fixture supplies only `TRACE` and `REPAIR`. Running `policy-pattern-extractor.spec.ts` produced **5/5 failures**, each failing at input-schema parsing for missing keys. A grounded, review-only repair recommendation is to add the four absent keys while preserving existing values; the `bestHmmState` implementation defaults absent values to zero, so explicit zeroes preserve current state selection. No patch was applied.

This makes the source-level diagnosis and recommendation reproducible from currently bound source bytes and AST observations, but not yet an admitted repair candidate. It does **not** complete R04/R05: a durable checksum-bound targeted checker receipt is still missing, the TypeScript config/toolchain execution lacks a qualified workspace binding, no diagnostic source was joined to a canonical candidate snapshot/ordinal map, and no ContextManifest or live MCP/DSPy handoff was created. The original `service-worker.ts` candidate remains unbound. Both database queries used `REPEATABLE READ READ ONLY` and rolled back; no datastore writes occurred.

Correction/update: a durable focused capture now exists. I created a temporary target-only tsconfig, ran `npx svelte-check --tsconfig tsconfig.r04-diagnostic-probe.tmp.json --output machine-verbose --no-color`, and removed the temporary config afterward. The run completed with exit code 1 and final line `COMPLETED 357 FILES 5 ERRORS 0 WARNINGS 1 FILES_WITH_PROBLEMS`. The log at `.tmp/atlas/agentic-diagnostic-repair/r04-policy-pattern-targeted-machine-verbose.log` hashes to `sha256:ce7f9b2efa705edcf87356a1ebe00b0b1ad0be8ae081b016f9b50c514cc49272`. Existing `capture-typescript-error-evidence-v1.mjs` parsed 5 TS2345 errors, 0 malformed lines, and 2 protocol lines into `.tmp/atlas/agentic-diagnostic-repair/r04-policy-pattern-error-evidence.json`; its `input.artifactChecksum` matches the log checksum. The receipt deliberately carries null source/workspace revisions, `writesPerformed=false`, and `safeToApply=false`. Passing it to `evidenceReportToSnapshotV1` fails closed with `REPAIR_EVIDENCE_WORKSPACE_REVISION_MISSING`. Thus the baseline is now complete and checksummed for this bounded diagnostic run, but the repair candidate remains unqualified until the compiler config/toolchain and source binding are tied to a single authorized workspace revision and the candidate/ordinal identity is resolved.

### Compiler configuration lineage check

The configuration gap is independently verified in PostgreSQL. Current `sveltekit-frontend/tsconfig.json` hashes to `sha256:6f1fcff10c32e0a25c806ef38f2174ff48f9430318fc3c66c2f50d7200a8c655`. A read-only query for this canonical source ref returns only the older digest `sha256:82a3bc5e864a2556cd3abd75c4efc92c5df4e7c9ab64a7745d68d6280149cee2`, under both candidate workspace revisions `sha256:322ed1a6f8ffc52576314fde9a33afd1faba015c3fc8cd60609052c5ca2dfbaf` and `sha256:e24bb97187ea6394eeba457dd849915f570045b7a1867780fdc7aa9ea62b9acc`. The current config hash has no binding. Therefore the exact compiler configuration used by the focused receipt does not belong to either workspace revision that binds the source files; the adapter refusal is correct. The transaction was `REPEATABLE READ READ ONLY` and rolled back. No binding or source revision was inferred or written.

The exact historical config bytes were replayed from commit `578beeedc5891a864b84c80fe7a6433cc1f8a06e` in a temporary sibling config file, then the temporary file was removed. A scoped TypeScript compiler-API program using that config and the exact target source reproduced **five TS2345 diagnostics** at lines 33, 39, 45, 51, and 57. The config digest and target source/import digests are bound under the same two `atlas_workspace_source_bindings` workspace revisions, so this is source/config-bound diagnostic evidence. `package.json` has a historical binding only under the `e24...` candidate; no `package-lock.json` binding exists under either. Installed TypeScript is 5.9.3, but its environment provenance is not qualified. Receipt: `.tmp/atlas/agentic-diagnostic-repair/r04-policy-pattern-bound-config-reproduction.json`, SHA-256 `4a9f3af109b108fa4b3a009e92bd49f91ca4a69f1d3f083407ec1bd317d6cfa9`; status `DIAGNOSTIC_REPRODUCED_NOT_ADMITTED`, `workspaceRevision=null`. The historical config also exists in Git commits that predate the policy files; Git commit identity is not workspace-revision identity, and exact DB bindings—not those commit contents—establish the shared source/config workspace revisions. The three focused DAG/output/replay suites also passed 8/8; fixture success does not resolve unique run identity, toolchain, candidate ordinal, or ContextManifest gates.

### Candidate/ordinal lookup

A separate `REPEATABLE READ READ ONLY` PostgreSQL lookup found four `codebase_chunk_index` rows matching the exact target `file_content_hash`, with line ranges 1–26, 23–40, 38–56, and 52–64. Every row has NULL `workspace_revision`, `source_revision`, and `representation_revision`; the rows therefore cannot serve as canonical source-qualified candidates. No candidate snapshot/ordinal binding for this diagnostic was established. The transaction rolled back without writes.

A second read-only query against `atlas_packet_chunk_lineage`, by all four chunk-row UUIDs and the exact source path, returned zero rows. Existing packet lineage therefore does not bridge these legacy chunks to an eligible candidate. The repeatable-read transaction rolled back.

### MCP parameter discovery

A schema-only stdio MCP session to the existing `atlas-tools` server performed `initialize` and one `tools/list`, with `ATLAS_TOOLS_MOCK=1`; it issued **zero** `tools/call` requests. The server advertised 10 tools with input schemas. `build_agentic_rag_context` requires `query`; `classify_intent` requires `prompt`; `build_recommendation` requires `intent`, `domain`, `errorSummary`, `evidenceLines`, and `patchTargets`. `find_source_refs` declares no required fields, but was not called. `record_outcome` is advertised as writing a local NDJSON ledger and Neo4j relationships; it was not invoked. Receipt: `.tmp/atlas/agentic-diagnostic-repair/mcp-atlas-tools-list-receipt.json`, file SHA-256 `703bc8682e4c530809ce8f46879e7a3e1210b8730ec85e0c52ee608f47428c6c`. This establishes parameter discovery only, not live retrieval, DSPy invocation, or ACE injection.

For MCP argument discovery, `tools/list` uses empty protocol-level `params: {}` and returns `inputSchema`; it is not a `tools/call` with empty arguments. A `tools/call` argument object `{}` is valid only if that individual tool’s schema has no required parameters and permits an empty object. No empty-argument tool call was issued in this review.

The two pure helper tools were then called sequentially in mock mode: classifier returned `intent=repair`, `domain=frontend`; its result was passed to `build_recommendation` with the observed diagnostic/source/AST/lineage evidence and an empty patch-target list. The returned advisory carried evidence and the proposed four-key fixture correction. No output schema is advertised for any tool, the domain label is not an approved canonical technical domain, and the recommended checker command is generic. Receipt: `.tmp/atlas/agentic-diagnostic-repair/r04-mcp-advisory-recommendation-mock.json`. This exercises MCP parameter passing and an advisory formatter only; it is not live retrieval, DSPy, typed packet validation, or ACE injection. No model, retrieval, outcome, database, graph, cache, or filesystem source writes occurred.

### Schema-driven local MCP call follow-up

A later focused stdio probe called `tools/list` against the local `atlas-tools` server, read the advertised `inputSchema.required` arrays, validated its arguments, then called the pure `classify_intent` and `build_recommendation` handlers sequentially. The classifier's actual output (`intent=repair`, `domain=retrieval`, `subdomain=ace-pipeline`) was passed into the recommendation call rather than hard-coded. Both calls returned successfully. The resulting advisory preserved the known AST/config evidence and explicit unresolved lineage/toolchain blockers; it proposed no patch target. The call used no retrieval tool, DSPy, ACE ContextManifest, `record_outcome`, or persistence path. No source, database, graph, or cache writes occurred.

This confirms local schema discovery → argument validation → pure MCP classification → advisory formatting. Follow-up implementation now makes the local `atlas-tools-mcp.mjs` dispatcher enforce its advertised schemas before handler calls; the focused MCP test proves missing/extra fields are rejected and that an invalid `record_outcome` call is stopped before its handler. This does **not** authorize tools, qualify the recommendation for DSPy/ACE, or change validation behavior in the separate SvelteKit MCP dispatcher. The recommendation's `retrieval` domain remains heuristic, not a canonical technical classification. Focused Vitest rerun: 3 files / 8 tests passed (DAG synthesis 2, DSPy repair output 4, repair-context replay 2); the MCP Node test now passes 37/37.

The validator was then exercised through the actual local stdio MCP process with `ATLAS_TOOLS_MOCK=1`: initialization succeeded, `tools/list` returned 10 schemas, `classify_intent` with `{}` was rejected before its handler, and the valid `prompt` call returned an advisory classification. Receipt `.tmp/atlas/agentic-diagnostic-repair/r05-atlas-tools-stdio-schema-enforcement.json` (SHA-256 `39cb0aeefd0e716d46d69564ef77022d78536e6c20f7812ebd9ac779cd85f0ed`). Across the MCP test and compute-admission test, 38/38 tests pass. Mock mode performed no retrieval, model call, mutating tool call, or datastore/source writes; this proves protocol/argument behavior only.

The recommendation was tested without modifying the source: a disposable copy of the failing spec was created with `LOCATE`, `UNDERSTAND`, `VALIDATE`, and `RECOVER` set to zero while preserving `TRACE=0.7` and `REPAIR=0.2`. Its five tests passed 5/5, and the temporary copy was removed. This verifies the proposed test-fixture repair behavior, not a production patch or an admitted repair proposal.

### Project-command baseline pair recheck

The exact project command `npm run check` was run twice sequentially in the current frontend checkout with `NODE_OPTIONS=--max-old-space-size=16384`. Both runs exited 0 and reported `svelte-check found 0 errors and 0 warnings`. Their complete captured logs are byte-identical (SHA-256 `aac4f4c8c26806d15e777501c0788d23ec5113318ec4d765d0f773aeadbfc43e`). Run 1 took 595,982 ms; run 2 took 444,714 ms. Receipt: `.tmp/atlas/r01-current-check-20261021T184307142/receipt.json`.

The receipt records Node `v22.23.3`, npm `11.6.2`, `svelte-check` 4.3.4, TypeScript 5.9.3, `package-lock` SHA-256 `cf0185a96d5b2f1299be7777ce2a4e0b8ea80a5b53d6dab9c97700c767bdc4b8`, `tsconfig` SHA-256 `6f1fcff10c32e0a25c806ef38f2174ff48f9430318fc3c66c2f50d7200a8c655`, and Git HEAD `3376feb172cdb41c86c764f6c6cbcb153f199889`. This is a reproducible project-command baseline for that current checkout, **not** proof that the broader expanded scan is clean or that this exact dirty checkout/config/lockfile is bound to the diagnostic's canonical workspace revision. It does not resolve the candidate/ordinal or ContextManifest gates. Receipt reports zero source and datastore writes.

### Ornith/DSPy metadata-only probe

Read-only GETs to `:8090/health`, `/props`, and `/v1/models` returned `health=ok`, model `ornith-1.5-9b`, default loaded context 65,536 tokens, model-reported training context 262,144, GGUF format, 8,953,803,264 reported parameters, and a loaded chat template whose capability metadata says tool calls are supported. Quantization was not reported. The compact receipt is `.tmp/atlas/agentic-diagnostic-repair/r07-ornith-dspy-readonly-probe-v4.json`, SHA-256 `79f01533c02ffb4c4e885242e1f49df4cae05e1888d0cabc83c2a521d39b5cce`.

The existing DSPy environment reports version 3.4.1 and successfully constructs `Predict(ComposeAcePacketProposal)` from `scripts/atlas/ace_packet_proposal_v1.py` without invoking an LM. This proves package/signature construction only. No generation, JSON-constrained output, live tool execution, admitted ContextManifest input, or ACE injection was exercised; R07 remains open. No source or datastore writes occurred.

### Live MCP retrieval boundary recheck

The real local stdio MCP process accepted a bounded `tools/call` for `build_agentic_rag_context` (`maxCards=2`, 4,096-byte response budget). Both observed attempts returned `LIVE_RETRIEVAL_UNAVAILABLE` with `TRACE_EMPTY_RESPONSE`, zero cards, and no fallback evidence. The handler therefore failed closed; this is a live failure receipt observed in the terminal, not a persisted run artifact. TRACE `/health` was healthy immediately before the call, which does not prove the `atlas.query`/`atlas.packet_search` tool path works. No model, DSPy, `record_outcome`, ACE assembly, or datastore write was invoked.

Transport isolation: direct TRACE `tools/list` returned HTTP 200 with a 142,026-byte SSE response; the read-only `runtime.sse_probe` returned HTTP 200 in 185 ms. The direct `atlas.query` call returned HTTP 200 but an empty SSE body after about 6 seconds. Source inspection found `trace-mcp-server.ts` waited at most 5 seconds for the response to finish after `transport.handleRequest`, then closed the server/transport; `atlas.query` performs embedding, reranking, and PostgreSQL join-back. This makes the 5-second response-handoff cap a strong timeout hypothesis, not a proven root cause (there is no persisted server trace tying the request to that timer). The source now uses a bounded 15-second response-finish helper, with finish/close/timeout cleanup covered by a focused test (4/4 pass). `npm run check` also passes with 0 errors and 0 warnings. The currently running service was not restarted, so live retrieval remains unverified and the upstream caller retains its 12-second timeout.

Source review confirms the successful retrieval shape would still be candidate-only: `buildLiveAtlasContext` sets `canonicalAuthority=false`, `proofUsable=false`, and `admissionStatus=UNADMITTED_RETRIEVAL_CANDIDATES`; it also returns a formatted `promptPacket`. Do not feed that field to DSPy or a model. Require the existing source/ContextManifest admission owner to resolve and authorize the exact evidence first; the live path currently lacks source revisions and does not apply `domainFilter`.

The MCP contract distinction is `tools/list` with empty params to fetch advertised schemas versus `tools/call` with an `arguments` object validated against the selected tool's `inputSchema`; `{}` is invalid for tools requiring fields. The local `atlas-tools` dispatcher now enforces its schemas, but this does not establish equivalent enforcement in the separate SvelteKit MCP dispatcher or authorize a call. `build_recommendation` is deterministic advisory formatting, not a DSPy invocation. The existing Python DSPy signature/validator is a separate proposal-only seam.

Identifier review: the RPC registry contract requires a UUIDv5-shaped `packet_key` and UUIDv7 `rpcCallId`; `titleId` is a semantic string. The existing title generator makes `title:<hash8>` from `packet_key` plus generator version. `deriveUUID` is a separate UUIDv8 helper. Keep source/workspace revisions distinct from all of these identifiers; do not reinterpret the NES/Pokemon metaphor as an identity or taxonomy authority.

## Flow checkpoint score

**Scope:** one TS2345 diagnostic and its proposed test-fixture correction; this is not a whole-repository or all-lanes score. **Proof coverage: 0% (raw 0/100; headline 0%, hard cap 10%).** The required evidence for each checkpoint must belong to one frozen run/snapshot. The current source/config facts span two candidate workspace revisions, the actual run revision is unknown, and the package lock/toolchain are not qualified. Existing fixture tests and the local MCP helper call are useful component evidence, but are not enumerated full-checkpoint subchecks and cannot be combined into an end-to-end score. Artifact/integration coverage is not represented by this proof percentage.

| Checkpoint | Weight | Status | Why no proof credit |
|---|---:|---|---|
| C0 owners and authority | 8% | PARTIAL, not scored | Separate owner inventory exists; no unified run binds every owner/caller result. |
| C1 frozen input/source qualification | 12% | BLOCKED | Two candidate workspace revisions; diagnostic execution revision, lockfile, and toolchain not qualified. |
| C2 event/FSM contracts | 10% | NOT RUN | Focused DAG tests do not cover end-to-end transitions, retries, cancellation, and receipts. |
| C3 bounded execution | 10% | NOT RUN | No serial-vs-parallel replay or resource measurements for this slice. |
| C4 aggregation/HLL | 8% | NOT RUN | No same-run MapReduce/HLL receipt for this diagnostic flow. |
| C5 NES/bit encoding/RPC | 8% | BLOCKED | NES vocabulary/palette unresolved; no validated descriptor round-trip. |
| C6 CPU matrix/ranker | 12% | BLOCKED | No qualified candidate/ordinal bijection or ranking receipt for this diagnostic. |
| C7 Arrow artifact round-trip | 8% | NOT RUN | No artifact writer/reader round-trip in this slice. |
| C8 CUDA challenger | 8% | NOT RUN | No GPU run or authorization in this slice. |
| C9 retrieval/citations/ACE | 10% | BLOCKED | No lineage-qualified candidate, ContextManifest readback, or ACE injection. |
| C10 outcome/security/operations | 6% | NOT RUN | No approved apply, independent readback, or attributable outcome loop. |

The 0% is a strict proof score, not a claim that no components or tests exist. The separate 10% hard cap is only a ceiling while C1 remains unqualified; it does not raise the raw score. No checkpoint percentages are combined across different receipts.

## First blocker and next proof

1. Resolve which of the two matching workspace revisions identifies the actual diagnostic execution, and qualify the installed TypeScript/toolchain (the package lock has no binding). Do not substitute Git HEAD or source hash for workspace revision.
2. Repeat the reproduction through the project's `svelte-check` command using the exact bound config and qualified toolchain; the compiler-API check is narrower than that project command.
3. Resolve a canonical candidate snapshot/ordinal for this diagnostic, then test the proposed advisory using the existing typed repair-proposal contract. The disposable fixture experiment passed 5/5 but does not establish candidate identity or proposal-contract admission.
4. Only after those gates pass, assemble a read-only ContextManifest candidate through the existing ACE owner and verify exact evidence-set/citation equality. Do not invoke Ornith or apply a patch in this slice.

Until then, preserve the current result as a source-grounded advisory, not a ContextManifest, repair-ready handoff, root-cause proof, or admitted fact.
