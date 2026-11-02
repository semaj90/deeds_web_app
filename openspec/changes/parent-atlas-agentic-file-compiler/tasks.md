# Tasks
 [x] AFC-00 Audit current owners; preserve existing context/action/hypergraph contracts[x] AFC-01 Add QueryClassificationV1 FileMutationIntentV1 contracts [x] AFC-02 Add CandidateFeatureRowV1 ExactPromotionV1 contracts [x] AFC-03 Add ContextManifestV1 contract view without a new table [x] AFC-04 Add PromptPlanV1 and PrefillArtifactV1 contracts [x] AFC-04A Bind PromptPlanV1 to the verified llama-server budget: 65,536-token physical context, 8,192-token output reserve, and 57,344-token maximum admitted input; over-budget plans fail closed. Live read-only proof: `scripts/atlas/prove-llama-context-capacity-v1.mjs` → `docs/reports/langgraph-llama-context-capacity-v1.json` (`LIVE_CONTEXT_CAPACITY_PROVEN`, one slot, `ornith-1.5-9b`). LangGraph remains orchestration-only and the plan carries references/checksums, not canonical evidence bytes [ ] AFC-04B Wire the LangGraph synthesis adapter to the existing `ContextManifestV1`/`ContextManifestV2` → `PromptPlanV1` → shared Ornith llama-server resolver path; prove a bounded multi-turn execution without hidden-state persistence, ad-hoc prompt bypass, or datastore writes [x] AFC-04B-01 Add the no-write Ornith PromptPlan adapter seam and fixture proof; it validates admitted segment checksums/budget, resolves the exact expected model via `/v1/models`, and sends only compiled plan messages. Full LangGraph graph wiring and live multi-turn proof remain part of AFC-04B [x] AFC-04B-01A Verify endpoint selection against the live Ornith server: `/v1/completions` is reachable for plain prompts but returned a `<think>` marker even with `reasoning_effort: none` and `reasoning_format: none`; it is therefore not eligible for the canonical agent/tool path. Canonical synthesis remains `/v1/chat/completions` with the model Jinja template and per-request thinking disabled [x] AFC-04B-02 Route the existing LangGraph synthesis node through the bounded Ornith adapter when a compiled prompt plan is supplied; fixture proof covers successful model discovery/generation content-drift rejection before POST [x] AFC-04B-03 Execute one bounded live adapter smoke against `http://127.0.0.1:8090`: `/v1/models` resolved `ornith-1.5-9b`, `/v1/chat/completions` returned `LIVE_ORNITH_ADAPTER_OK`, and the adapter receipt reported `modelCalls: 1`, `datastoreWrites: false`, `canonicalWrites: false`, and `hiddenStatePersisted: false`. This proves the adapter/service boundary only; the AFC-04B multi-turn LangGraph graph proof remains open [x] AFC-04B-04 Repair the actual LangGraph worker import path by aligning the installed `@langchain/core` package with the existing lockfile resolution (`1.2.1`), which satisfies `@langchain/langgraph-checkpoint`'s `uuid6` requirement; runtime import now passes without changing the LangGraph source API [x] AFC-04B-05 Prove a bounded two-turn LangGraph execution graph using only compiled PromptPlans: exactly two `/v1/models` + `/v1/chat/completions` pairs execute with deterministic controls, while content drift stops before any model request or second turn. The production worker graph's full multi-turn/checkpoint proof remains part of AFC-04B [x] AFC-04B-06 Verify the compiled `PromptPlanV1.checksumSha256` against the existing Atlas canonical encoding before model discovery/generation; preserve `tokenizerRevision` and reject field tampering before any POST. Focused adapter, worker, and bounded-graph tests pass (8/8) [x] AFC-04B-07 Repair the existing Kanban LangGraph builder's typed node-edge construction so the installed LangGraph runtime can typecheck through the exported index; behavior and datastore ownership are unchanged [x] AFC-04B-08 Separate the unused legacy block-reference planner from the canonical revisioned `atlas.prompt-plan.v1` wire contract; retain a deprecated builder alias, but emit `atlas.agentic-file-compiler.block-plan.v1` so unresolved block references cannot masquerade as executable PromptPlan evidence [x] AFC-TOOL-BOUNDARY-01A Retire the generic `shell.run` TRACE MCP registration and remove it from the tool-audit execution categories. A source-level regression test passes 2/2 and the runtime discovery gate now rejects `shell.run` if it reappears. Typed, operator-gated `ops.*` executors remain; this does not expose arbitrary commands [ ] AFC-TOOL-BOUNDARY-01B Reload the active TRACE MCP process under the controlled runtime workflow and verify `tools/list` omits `shell.run`; source edits and static tests alone do not prove the live advertised tool surface changed. Read-only check on 2026-09-27 found `:8788` still advertises 177 tools including `shell.run`; the listener is a local Node process using `scripts/node-ts-loader.mjs`, with an established client connection. No restart was attempted; runtime cutover remains open [x] AFC-LANGGRAPH-RESULT-ADMISSION-01 Rename the bridge's simulated `invokeTool` API to `applyToolResult`; middleware executes the original handler exactly once, then admits its result with call identity into bounded dispatcher state. The adapter does not claim tool execution. Focused optionalization suite passes 9/9; broader Headroom byte/reference-pruning and durable-state ownership remain separate gates LangGraph runtime recheck (read-only, 2026-09-19): the installed StateGraph replay matched the local adapter, and the failure/retry/cancellation/replay fixture passed with deterministic output Receipts: `docs/reports/langgraph-readonly-adapter-replay-v1.json` docs/reports/langgraph-failure-retry-replay-v1.json`. These are process-local fixture proofs; they do not close AFC-04B's production worker/checkpoint gate or authorize durable state Production wiring recheck (read-only, 2026-09-19):
`node scripts/tests/test-langgraph-wiring.mjs --langgraph http://127.0.0.1:8091`
confirmed the SvelteKit JSON synthesis proxy is reachable, but the direct LangGraph service on `:8091` is unavailable and the SSE proxy run emitted no `complete` event (`3` events, `0` chunks). AFC-04B remains open; no container was started no datastore/model state was changed  [x] AFC-05 Add DagNodePlanV1 and AtlasWorkflowSpecV1 contracts [x] AFC-06 Add WorkflowActionEventV1 persistence envelope [x] AFC-07 Add MastraWorkflowGraphV1 runtime-dialect contract [x] AFC-08 Add FileMutationPlan/ValidationObservation/Receipt/Failure contracts [x] AFC-09 Add GraphProjectionRequestV1 and SearchRuntimePolicyV1 contracts [x] AFC-10 Wire query classifier to the live request front door. Evidence: `sveltekit-frontend/src/routes/api/search/hyperrag/+server.ts` classifies every validated request, compiles a retrieval plan only for revision-qualified requests, and applies its
  bounded candidate budget to SearchRuntime; `server.route.test.ts` proves both the control
  metadata and budget propagation. Exact promotion remains AFC-11 [x] AFC-10-01 Wire deterministic `QueryClassificationV1` observation into `/api/search/hyperrag` after request validation; return it as control metadata while preserving SearchRuntime as the retrieval/fusion owner. Route proof asserts the stable classification contract; full classification-to-retrieval-plan execution remains open. 2026-10-22 additive shadow hints now expose ordered exact terms, bounded bigrams, recognized package candidates, and only explicitly written `repo:` scope candidates through the existing classifier/workflow metadata. They are checksummed diagnostic hints and are not yet consumed as retrieval filters, ontology matches, clustering input, or ranking features; this does not close the execution gate [x] AFC-10-02 Compile the existing `RetrievalPlanV1` only for revision-qualified HyperRAG requests, apply its bounded candidate budget to the SearchRuntime call, and return the plan as control metadata; unqualified requests remain plan-less rather than receiving a synthetic workspace revision  [ ] AFC-11 Wire exact promotion to the live retrieval owner [ ] AFC-12 Extend existing context manifest persistence with revision/evidence refs through a migration only after compatibility proof  [x] AFC-13 Persist WorkflowActionEventV1 through the existing action/outbox writer. The compiler now converts supported lifecycle events through `workflowEventToCanonicalActionWriterRequest` and delegates to `writeCanonicalWorkflowActionAtomically`; compiler-only kinds fail closed. Adapter proof passes 5/5 and existing action/outbox writer proof passes 11/11. No live database write/readback was run in this tranche [x] AFC-14 Install/verify a real Mastra runtime before replacing the current passthrough shim. The existing `@deeds/atlas-orchestrator` owner now pins `@mastra/core@1.71.0`, its PostgreSQL and Redis adapters, and an isolated LangChain/Deep Agents dependency set satisfying the Deep Agents peer ranges. A checksum-verified portable Node `v22.23.3` import smoke loads `Mastra`, `createDurableAgent`, `PostgresStore`, `WorkflowsPG`, `RedisServerCache`, `createDeepAgent`, LangChain `tool`, and LangGraph `StateGraph`; TypeScript check passes. The repo `.npmrc` disables workspaces, so install required explicit `--workspaces=true --workspace=@deeds/atlas-orchestrator --install-strategy=nested`. No agent was instantiated, no database connection or write occurred, and the SvelteKit shim was not replaced. See `docs/reports/mastra-deepagents-install-20260926.md`. AFC-15 restart/suspend parity remains open.
- [x] AFC-14B-01 Wire the authenticated SvelteKit Mastra route to accept only the existing `AceContextManifestAdmissionV1` + `PromptPlanV1` + checksum-bound segment content; revalidate manifest/plan checksums and packet-key/evidence membership, resolve the loaded model through the existing llama-server resolver, and execute with a request-scoped tool-free Mastra Agent. The route does not retrieve/build candidates, write stores, persist durable state, or accept an ad-hoc prompt. Fixture route and executor tests pass (6/6); package type-check passes. This is wiring/fixture proof only, not a live same-snapshot inference proof; immutable model artifact revision remains unavailable. See route `sveltekit-frontend/src/routes/api/atlas/mastra-agent/+server.ts` and executor `packages/atlas-orchestrator/src/models/prompt-plan-agent.ts` [x] AFC-14B-01A Rehome the route fixture spec outside the reserved SvelteKit `+` route directory to `sveltekit-frontend/src/lib/server/atlas/mastra-agent-route.spec.ts`. Under PATH Node `v22.23.3`, the focused route suite passes 3/3 and the orchestrator import/typecheck smoke passes. The initial 8-GiB-heap check reported 36 errors / 291 warnings; the 2026-09-26 remediation rerun now reports 0 errors / 291 warnings across 100 files. AFC-17 remains open pending the required Tree-sitter and test-barrier proof. No live inference or datastore operation was performed. Details: `docs/reports/svelte-check-error-remediation-20260926.md` [ ] AFC-14B-02 Prove one authenticated live request using an owner-produced packet-key CandidateOrdinal snapshot, admitted ContextManifestV2, and PromptPlanV1 through the Mastra route; preserve the exact loaded model ID and record immutable model-artifact provenance if the endpoint exposes it. No candidate selection or identity interpretation may move into Mastra. Until this receipt exists, application runtime execution is not live-proven [ ] AFC-15 Prove suspend/resume restart parity using Mastra snapshots [ ] AFC-16 Wire bounded filesystem mutation behind authorization and human-approval policy [ ] AFC-17 Prove Tree-sitter/typecheck/test validation barrier. The pure barrier contract now has pass/fail, warning-admission, required-validator ordering, deterministic replay tests (`validation-barrier.spec.ts`, 5/5); live repository Tree-sitter/typecheck/test execution is still required before this task can close. The app-wide typecheck subgate now passes with 0 errors / 291 warnings across 100 files; the remaining Tree-sitter and required test-barrier gates are not yet proven Live barrier recheck (read-only, 2026-09-19): the structured-value runtime probe is ready with 'tree-sitter 0.25.1`, `tree-sitter-typescript 0.23.2`, `treesitter-chunker 4.0.0`, Python 3.13.5, `pyarrow 21.0.0`; the four barrier tests pass. The SvelteKit `typecheck:native` check at that time exited with 62 TypeScript errors. This historical baseline is superseded by the fresh 2026-09-26
8-GiB-heap check below; it is retained as history, not current status. The barrier contract was hardened to fail closed on duplicate validator observations; focused coverage
passes 5/5. Fresh 2026-09-26 verification is recorded in docs/reports/svelte-check-error-remediation-20260926.md`: the full frontend `npm run check` with NODE_OPTIONS=--max-old-space-size=8192` now reports 0 errors and 291 warnings across 100 files This closes the app-wide typecheck subgate only. AFC-17 remains OPEN pending Tree-sitter and full
required test-barrier execution. No model inference, canonical datastore mutation, or Graphify run was performed Warning/barrier diagnosis (2026-09-26): machine census confirms 0 errors / 291 Svelte warnings (233 accessibility, 58 unused CSS selectors). AFC-17's pure aggregator has no live runner callsite; no repository Tree-sitter receipt or selected test-suite receipt is bound into a
`ValidationBarrierResultV1`. The current aggregator trusts caller-supplied validators/statuses and
does not bind PASS to exit codes/output evidence or warning-code/count admission. Keep AFC-17 OPEN
until these proof/contract gaps are closed; see `docs/reports/svelte-check-error-remediation-20260926.md` [ ] AFC-18 Wire incremental AST/semantic_768/graph refresh and cache invalidation  [ ] AFC-19 Run CPU/GPU semantic executor parity confirm one-vote-per-lane behavior [ ] AFC-20 Retire the fake Mastra `defineWorkflow` shim only after AFC-14/AFC-15 pass.

## Helper-routing tranche — reviewed and frozen, not yet built (2026-09-27)
An external review proposed a query-classification → helper-eligibility →
retrieval-plan routing layer (HelperRegistryV1, keyword/radix vocabulary,
tri-state eligibility, phased cost-bounded scheduling). Audited against real
code before recording anything, since the proposal implicitly reads as if
extending a mostly-empty spine — it is not:
**Already real (verified by direct read, not assumed)**:
- `src/lib/server/atlas/agentic-file-compiler/query-expansion-v1.ts` —
  `QueryExpansionBundleV1`/`QueryExpansionTermV1` already exist, already carry
  a `source: TaxonomySourceV1` provenance field (the proposal's
  `ExpandedTermV1.source` idea), already checksum via a deterministic
  sorted-key `stable()` preimage (matching `reduction-router-v1.ts`'s existing
  convention), already dedupe by `(normalized, source)` and cap via
  `scope.maxExpansionTerms`.
- `src/lib/server/atlas/agentic-file-compiler/retrieval-plan.ts` —
  `RetrievalPlanV1` already exists and already implements the proposal's
  "checksum-linked chain" idea: it carries `taxonomyScopeRef`+
  `taxonomyScopeChecksum`, `queryExpansionRef`+`queryExpansionChecksum`,
  `queryFingerprintRef`+`queryFingerprintChecksum`, each checksum computed
  over the *whole* upstream artifact (not just its own body), and the plan's
  own `checksum` covers all of it via `sha256Stable`. This is the same
  pattern the proposal describes as new (`QueryClassificationV1 → checksum A
  → TaxonomyScopeV1 → checksum B → ...`) — already live, just with a flatter
  `lanes: RetrievalLane[]` (4 lanes: lexical/ast/semantic/graph) instead of
  the proposal's phased/cost-bounded scheduling.
- `QueryClassificationV1`, `TaxonomyScopeV1`, `QueryFingerprintV1` all exist
  (imported as real types by `retrieval-plan.ts`) and are wired live —
  `AFC-10`/`AFC-10-01`/`AFC-10-02` (this file, checked off) already route
  `/api/search/hyperrag` through a compiled `RetrievalPlanV1` for
  revision-qualified requests.

**Genuinely new, does not exist yet** (verified via targeted grep, zero
matches): `HelperRegistryV1`, `HelperCapabilitySnapshotV1`,
`HelperEligibilityV1` (tri-state ELIGIBLE/INELIGIBLE/BLOCKED),
`KeywordRecognitionV1`, any vocabulary/radix/normalization module,
`ParameterBindingV1`'s `resolution: EXACT|DERIVED|DEFAULTED` mode,
`HelperCandidateV1` (the executor≠lane normalization layer), and the
phased/cost-bounded `RetrievalPlanPhaseV1` scheduling model. `retrieval-plan.ts`'s
4-lane list is the closest existing analog to "lane" but has no helper-level
eligibility, no capability registry, no phases.

**Frozen tranche** (task IDs below are new; they do not collide with
AFC-00..20 above). The bounded initial helper-routing slice is implemented
and fixture-proven; remaining items below stay open unless specifically marked:

- [ ] AFC-HELPER-01 `HelperRegistryV1` — static capability registry (languages,
  intents, requires, produces, executor kind/owner, costClass, mutationClass).
  Describes executable reality only; does not encode runtime up/down state.
- [ ] AFC-HELPER-02 `HelperCapabilitySnapshotV1` — runtime availability
  snapshot, separate from the static registry (per-helper `available`,
  `executorRevision`/`serviceRevision`, `observedAt`, checksum). Avoids
  mutating the registry every time a service cycles.
- [ ] AFC-KW-01 `KeywordRecognitionV1` contract (bounded exact-token matching;
  vocabulary remains fixture-supplied; no radix/prefix expansion).
- [x] AFC-KW-02 Versioned vocabulary + normalization contract (case folding,
  Unicode normalization, camelCase/snake_case/kebab-case splitting, dot/path
  segmentation, package-name preservation) — separate revision domain from
  the classifier/taxonomy revisions already in use. `agentic-file-compiler/
  token-normalization-v1.ts` (+ `.spec.ts`, 8 tests passing) implements
  `normalizeAndSplitTokenV1()` (NFC + lowercase + camelCase/PascalCase
  splitting + dot/slash/hyphen/underscore segmentation + scoped
  `@scope/pkg-name` preservation) under a distinct
  `TOKEN_NORMALIZATION_REVISION_V1` — a test asserts this revision id is
  never equal to `KEYWORD_NORMALIZATION_REVISION_V1` (the existing exact-
  token NFC+lowercase-only normalization AFC-KW-03/QUERY-RADIX-01 already
  depend on), so this broader splitting policy cannot silently invalidate
  that narrower, already-shipped revision. Not wired into
  `keyword-recognition-v1.ts`'s vocabulary matching — that wiring decision
  is separate, deliberately deferred work (see the note below).
- [x] AFC-KW-03 Exact map + radix compiler over normalized tokens, with
  `prefixPolicy: CONTROLLED` + explicit `allowedExpansions` per prefix entry
  (radix answers "which registered vocabulary entries share this prefix",
  never decides semantic relatedness).
- [x] QUERY-RADIX-01 Add a distinct CPU/in-process query-prefix index over a
  revisioned, caller-supplied vocabulary. Keep it separate from GPU
  `ACE-RADIX-01`; do not create a new agent/runtime or change SearchRuntime
  ownership.
- [ ] AFC-KW-04 Aho-Corasick bulk recognizer — DEFERRED (explicitly, per the
  review itself).
- [ ] AFC-HELPER-03 Tri-state `HelperEligibilityV1`
  (ELIGIBLE/INELIGIBLE/BLOCKED, with `positiveReasons`/`blockingReasons`,
  `matchedEvidenceRefs`, `estimatedCostClass`) — combines the static registry
  + query evidence + runtime capability snapshot. Separate revision fields
  per domain: `classifierRevision`, `taxonomyRevision`, `vocabularyRevision`,
  `normalizationRevision`, `helperRegistryRevision`, `expansionPolicyRevision`,
  `retrievalPolicyRevision` — explicitly never collapsed into one "routing
  revision" (a vocabulary alias change must not imply an executor-capability
  change).
- [x] AFC-PARAM-01 `ParameterBindingV1` resolution modes
  (`EXACT`/`DERIVED`/`DEFAULTED`), forbidding `DEFAULTED` for any identity/
  revision parameter (`canonicalId`, `packetKey`, `sourceRevision`,
  `workspaceRevision`, `symbolVersionId`, `candidateSnapshotRevision`,
  `ordinalMapChecksum`, `representationRevision`) — a planner may default
  `topK`/`timeoutMs`, never an identity or revision field. Contract-only, no
  wiring: `agentic-file-compiler/parameter-binding-v1.ts` (+ `.spec.ts`, 7
  tests passing) rejects `DEFAULTED` on every listed identity/revision name,
  requires `derivedFromRefs` for `DERIVED` and forbids it for `EXACT`, and
  seals bindings with a checksum. `ParameterBindingSetV1` dedupes/sorts by
  parameter name.
- [x] AFC-PLAN-01 Extend the existing (real, checked-off) `RetrievalPlanV1`
  with phased/cost-bounded scheduling (`RetrievalPlanPhaseV1`: cheap lexical
  → structural → expensive semantic/graph → extraction escalation, each
  phase with `continueWhen`/`minCandidates`/`minConfidence` stop conditions).
  This is additive to the existing lane list, not a replacement. Landed in
  `retrieval-plan.ts`: `buildRetrievalPlanPhasesV1()` groups the plan's
  existing `lanes` into 4 ordered tiers (never a second lane source of
  truth — `phases` is a scheduling view over the same `lanes` array,
  verified by a test asserting the two sets match); `buildRetrievalPlan()`
  now attaches `phases` whenever lanes are non-empty. 3 new tests + the 2
  pre-existing `retrieval-plan.spec.ts` tests all pass (5/5).
- [x] AFC-CAND-01 `HelperCandidateV1` — common output normalization
  (`lane`, `canonicalId?`, `packetKey?`, `sourceRef`, `identityResolution:
  CANONICAL_ID|PACKET_KEY|SOURCE_REF|UNRESOLVED`) so multiple executors of
  one logical lane (Qdrant/cuVS/CAGRA under `semantic`) produce one vote per
  lane, not N — preserving this repo's existing "executor != retrieval lane"
  invariant (already documented in root CLAUDE.md's Duplication Prevention
  section). `agentic-file-compiler/helper-candidate-v1.ts` (+ `.spec.ts`, 6
  tests passing) derives `identityResolution` from which field is actually
  populated (never caller-asserted) and `dedupeHelperCandidatesByLane()`
  collapses same-lane/same-identity candidates to one vote while keeping
  distinct identities and distinct lanes separate. Not yet wired into
  SearchRuntime — a normalization contract only, per this task's own scope.
- [x] AFC-CACHE-01 Stage-specific, revision-qualified caches (classification /
  keywordRecognition / queryExpansion / helperEligibility / retrievalPlan),
  each keyed on its own upstream checksum + its own revision fields — so a
  service-availability change invalidates eligibility/plan without forcing
  keyword recognition to recompute. Contract-only, no cache backend: `agentic-
  file-compiler/stage-cache-key-v1.ts` (+ `.spec.ts`, 5 tests passing) builds
  a deterministic `atlas:afc:cache:{stage}:{upstreamChecksum}:{revisionFingerprint}`
  key; tests prove determinism (order-independent revisionFields), revision-
  sensitivity, and stage independence (same revision fields under a
  different stage produce a different key). No Redis/Valkey read or write
  performed — wiring an actual backend behind this shape is separate work.
- [ ] AFC-PROOF-01 Positive + negative + blocked routing fixture (e.g. "explain
  CAGRA indexing parameters" → docs/postgres-fts/semantic-768 ELIGIBLE,
  lsp-references/ast-grep/langextract INELIGIBLE; and a deliberately-unavailable-LSP
  case proving `BLOCKED` with `reason=CAPABILITY_UNAVAILABLE` rather than
  silently omitting the helper).

**Bounded helper-routing proof (2026-09-27):** Added the static 12-helper
registry with explicit owner references and execution-surface labels; the
labels do not claim those owners are live request-time capabilities. Runtime
capability snapshots are separate checksum-sealed inputs. Exact-only keyword
recognition binds classifier, taxonomy, vocabulary, and registry checksums;
tri-state eligibility is deterministic and fail-closed on missing, stale,
duplicate, or checksum-tampered capability evidence. Six fixed queries cover
code references, CAGRA, cache/Graphify, ROS2, semanticRevision, and Postgres
HNSW; an LSP available/unavailable pair changes eligibility while leaving
keyword recognition unchanged. Focused fixture suite: 10/10 passed. No live
helper execution, datastore/cache writes, or `RetrievalPlanV1` changes were
performed. At that checkpoint, `AFC-KW-02/03`, planning, cache, parameters,
candidate normalization, and live capability probes remained open; see the
subsequent QUERY-RADIX-01 progress below for the radix increment.

**QUERY-RADIX-01 proof (2026-09-27):** Added a versioned vocabulary input
contract and deterministic compressed radix index. Prefix rules require
explicit `allowedExpansions`; each target must be a registered term beginning
with that prefix, and each rule is capped at eight expansions. There is no
implicit descendant search, semantic expansion, fuzzy matching, or default
vocabulary corpus; vocabulary placement/ownership remains unresolved. The
lookup can be converted to the existing `QueryExpansionTermV1` with
`source=KEYWORD_RADIX`, vocabulary revision, and lookup-checksum evidence.
`KEYWORD_RADIX` is not allowed by default in `TaxonomyScopeV1`; the caller must
opt in. Focused helper/radix/taxonomy/retrieval-plan suites pass 21/21.
No RLM runtime/SearchRuntime call site was wired, and no cache or datastore
writes occurred. `ACE-RADIX-01` remains the separate GPU residency sorter.

**QUERY-RADIX-01 current-worktree verification (2026-09-27):** Re-ran the
focused radix, exact keyword, taxonomy expansion, and retrieval-plan suites:
21/21 passed. This closes the implementation/fixture gate, not live request
integration. The radix lookup remains opt-in and caller-supplied; no
production vocabulary source/owner is approved yet. Next is an AFC-owned,
shadow-only compile/plan comparison after vocabulary ownership is resolved;
the live SearchRuntime input and RLM behavior must remain unchanged.

**Proposed physical layout** (extends the existing, real
`src/lib/server/atlas/agentic-file-compiler/` directory — matches what's
already there, not a new directory):
`helper-registry-v1.ts`, `helper-capability-snapshot-v1.ts`,
`keyword-recognition-v1.ts`, `vocabulary-v1.ts`, `radix-index-v1.ts`,
`helper-eligibility-v1.ts`, `parameter-binding-v1.ts`; `retrieval-plan.ts` and
`query-expansion-v1.ts` are extended in place, not replaced. Vocabulary data
placement (`docs/.okf/routing/*.yaml` vs. checked-in JSON next to the AFC
contracts) is explicitly left as an open question pending the existing `.okf`
namespace-ownership decision — not resolved here.

**Not started in this entry**: zero new files created, zero schema changes,
zero code written. This is a design-freeze + accuracy-correction entry only,
matching this session's established pattern for large external proposals.

## Concurrent-write collision on AFC-HELPER-01/02/03 + AFC-KW-01 — both preserved, reviewed (2026-09-27)

**What happened**: while this session's `helper-registry-v1.ts`/`keyword-recognition-v1.ts`/
`helper-eligibility-v1.ts` were mid-test, a second, independently-built
implementation of the same 4 contracts landed on those exact file paths
(source unconfirmed — no other session was reachable via `ListAgents` at
the time; possibly a separate window/process on the same machine working
the same OpenSpec board). Neither version was silently kept or discarded —
per explicit instruction, this session's original design was preserved
under a `-v2` suffix (`helper-registry-v2.ts`, `helper-capability-snapshot-v2.ts`,
`keyword-recognition-v2.ts`, `helper-eligibility-v2.ts`,
`helper-eligibility-v2.spec.ts`) rather than overwriting the file that
appeared. The orphaned original spec was archived (not deleted) to
`deeds_labs/archive/2026-09-27/`, manifest recorded.

**Both are real and both pass their own tests** (verified, not assumed):
this session's v2 set: 8/8 (`helper-eligibility-v2.spec.ts`, includes the
LSP-toggle invariant and a registry/snapshot revision-mismatch rejection
test). The other, `v1`-named set: 9/10 (`helper-routing-v1.spec.ts`; the one
failure is a minor error-code string mismatch — test expects
`CAPABILITY_REVISION_MISMATCH`, code throws `CAPABILITY_CHECKSUM_MISMATCH`
— cosmetic, not a design defect).

**Comparison**:

| Aspect | This session (`-v2`) | The other (`-v1`, currently at the canonical path) |
|---|---|---|
| Structure | `helpers` array, flat fields | `entries` array, similar shape |
| Cost/mutation classes | `CHEAP/MEDIUM/EXPENSIVE`, 3-way mutation class | `LOW/MEDIUM/HIGH`, mutation hardcoded `READ_ONLY` (literal, not enum) |
| Capability snapshot | Separate file, per-registry-revision batch snapshot (`observations[]`) | Merged into the registry file, **per-helper** snapshot with its own `registryChecksum` binding |
| Eligibility schema | 3 states, reasons, cost class | Same 3 states, **plus explicit `executionAuthorized/executionPerformed/writesPerformed/canonicalAuthority: literal(false)` fields baked into the schema itself** |
| Determinism | `sha256Stable` canonical JSON, same convention as existing `retrieval-plan.ts` | Same `sha256Stable` convention |
| Helper seed | 12 helpers, `ownerRef` as a single string per helper | Same 12 helpers, richer `ownerRef` (some helpers list multiple owning files, e.g. `graph-ppr`) |
| LSP handling | Registry entry + snapshot reports `available:false` honestly (grep-verified) | Not yet inspected for this specific case at this review depth |

**Honest assessment**: the other implementation's decision to bake
`executionAuthorized/executionPerformed/writesPerformed/canonicalAuthority: false`
directly into the `HelperEligibilityV1` schema (not just this session's
looser "authority" convention used elsewhere as a receipt-level field) is a
**stricter, more idiomatic match to this repo's own established governance
pattern** (see e.g. `MutationApprovalReceiptSchema` in the same
`contracts.ts` file) — arguably the better design choice on that one point.
This session's version is not worse overall, but that specific difference
is worth carrying forward regardless of which base implementation is kept.

**Not resolved here**: which implementation becomes canonical. Both are
real, tested, and mutually incompatible at the type level (different field
names/shapes). Reconciling them (or deliberately keeping one as a challenger)
was left for an operator decision in the collision review.

**Resolution after explicit bounded-slice direction (2026-09-27):** The user
selected the per-helper, exact-only, tri-state contract described above for
the initial slice. The canonical implementation is the `*-v1.ts` set; the
independent `*-v2.ts` set remains untouched as a comparison, not a second
runtime owner. Capability snapshot construction seals caller-observed facts
only and performs no service probes. This resolves the choice for this
bounded slice; it does not authorize live helper execution or complete the
rest of the frozen tranche.
nothing further built or deleted in this entry.

**Superseding ownership review (2026-09-27):** The above selection is historical
and is no longer an acceptance decision. New review evidence says the v1-named
helper files were concurrently written and must not be treated as the final
contract. Both source sets are preserved. In the current checkout, the v1
focused suite passes 10/10 and the v2 focused suite passes 8/8; this corrects
the older 9/10 note above but does not select either set as canonical.

| Contract area | v1 candidate | v2 candidate | Review decision |
|---|---|---|---|
| Static registry | `entries`, owner/surface metadata; no logical fusion lane | `helpers`, explicit lane and executor | Keep v2's separate `executor` and `logicalLane` fields, but type the lane from the existing `LogicalRetrievalLane` owner (`search-runtime.ts`). |
| Capability | Per-helper snapshot binds registry checksum; caller-observed only | Batch snapshot binds registry revision; observer also contains live probing/default-availability behavior | Keep batch observation shape, bind both registry revision and checksum plus per-helper revision, and keep the contract builder pure with no probes/default availability. |
| Keyword recognition | Binds classifier/taxonomy/vocabulary/registry; free-form domain strings | Binds query/vocabulary; domain/helper strings are not all owner-validated | Keep separate revision/checksum coordinates; domain outputs must come from `domain-taxonomy.ts`, and vocabulary domain refs must be canonical taxonomy labels. |
| Eligibility | Tri-state with free-form reasons and strict false side-effect fields | Tri-state with typed reasons, without the same strict false fields | Keep typed reasons and explicit `executionAuthorized=false`, `executionPerformed=false`, `writesPerformed=false`, `canonicalAuthority=false`. |
| Existing routing ownership | Does not encode the router signal separately | Lane/executor separation but no binding to the exact signal owner | `lexical_exact` remains a `router-matrix.ts` signal; no new lexical owner. SearchRuntime remains fusion owner. |

Review-only merged candidate created at
`src/lib/server/atlas/agentic-file-compiler/routing-review-v2/`. It is not
exported or wired into runtime. It deliberately has no default helper seed:
owner refs and actual request-time availability need separate evidence. The
candidate compiles and fixture tests cover static-vs-runtime separation,
executor-vs-lane identity, canonical domain filtering, tri-state behavior,
revision separation, and no-authority/no-write invariants. The query-radix
implementation is recorded above as implemented and fixture-proven, but still
has no production caller. Vocabulary placement/ownership remains unresolved,
and the competing helper-routing candidates are not promoted; this does not
authorize a live route, SearchRuntime, or RLM behavior change.

**AFC-ROUTING-REVIEW-01..05:** completed as an isolated contract comparison
and review-candidate selection only. The merged design candidate is the
`routing-review-v2` set; the existing v1/v2 files remain untouched. Promotion
of that candidate into stable contract paths, a verified default helper seed,
`HelperCandidateV1`, phased scheduling, and RLM/SearchRuntime integration
remain open and require their own review/proof.

- [x] AFC-ROUTING-REVIEW-01 Preserve both helper-routing candidates and create an isolated review namespace.
- [x] AFC-ROUTING-REVIEW-02 Compile and fixture-test the review candidate independently.
- [x] AFC-ROUTING-REVIEW-03 Compare the two candidate field/ownership choices above.
- [x] AFC-ROUTING-REVIEW-04 Test static/runtime separation, tri-state eligibility, executor/lane separation, revision domains, and no-write/no-authority invariants.
- [x] AFC-ROUTING-REVIEW-05 Select the isolated merged design candidate without promoting it into production paths.
- [x] AFC-ROUTING-REVIEW-06 Compare router signal, SearchRuntime fusion lane, and executor as three distinct axes; record the owner-backed review receipt.
- [x] AFC-OWNER-01 Verify all 12 helper declarations against source owners/call paths; record declared-owner mismatches without changing registry code.
- [x] AFC-OWNER-02 Classify every entry as LIVE, UNIT_PROVEN_NOT_LIVE, CONTRACT_ONLY, BLOCKED, or UNRESOLVED in the owner receipt.
- [x] AFC-OWNER-03 Record router-signal ownership separately from executor ownership; leave per-helper signal mappings unresolved where no owner evidence exists.
- [x] AFC-OWNER-04 Verify logical-fusion role/lane for the currently evidenced helpers and one-vote behavior. Proven contributors: `rg-exact` -> `rg`, `postgres-trigram` -> `lexical`, `semantic-768` -> `dense`; `AFC-LANE-PARITY-01` proves Qdrant/TurboVec/cuVS/CAGRA fixture identities collapse to one dense contribution. `postgres-fts`, docs search, graph-PPR, Tree-sitter chunking, and LangExtract are explicitly non-fusion/enrichment in their evidenced caller scopes. ast-grep/ts-morph are not proven request-time fusion executors; LSP remains blocked. This closes mapping for the evidenced surface only, not live GPU parity or unresolved capabilities. `AFC-OWNER-MAP-01` remains open for router-signal binding; `AFC-ROUTING-PROMOTE-01` remains open.
- [x] AFC-OWNER-05 Emit the initial `docs/reports/afc-helper-owner-verification-v1.json`; it is historical and superseded as the current control baseline by `docs/reports/afc-helper-owner-verification-v2.json`.
- [ ] AFC-ROUTING-PROMOTE-01 Owner-verify helper entries, then promote the reviewed contract to stable paths; keep this separate from the implemented query-radix component.
- [ ] AFC-OWNER-MAP-01 Resolve remaining per-helper router-signal and logical-fusion-lane mappings, including whether helpers outside SearchRuntime are orchestration-only; do not invent `docs` or `graph` fusion lanes. Read-only owner audit is recorded, but mapping/promotion remains open.
- [x] AFC-OWNER-VERIFY-01 Complete the read-only 12-helper caller/owner census using statuses PROVEN / PROVEN_WITH_ADAPTER / BLOCKED / UNRESOLVED / NOT_A_FUSION_LANE; keep unknown signal and fusion mappings explicit.
- [x] AFC-LANE-VERIFY-01 Extract the actual SearchRuntime `Candidate.scoreSource` and `LogicalRetrievalLane` vocabulary from its owner; do not substitute the router matrix's legacy target labels.
- [x] AFC-LANE-PARITY-01 Fixture one revision-qualified canonical candidate from Qdrant, TurboVec, cuVS, and CAGRA; retain four executor IDs and prove exactly one dense contribution. Fixture proof only: no live cuVS/CAGRA executor or GPU call was made.
- [x] AFC-GRAPH-LANE-01 Determine graph-PPR fusion role only after a live dispatcher/caller exists; do not invent a `graph` fusion lane. Read-only caller census found query-time PPR in the Admin Atlas synthesis route as a graph-revision/seed-bound candidate ranking feature, not a SearchRuntime fusion lane. The ordinary SearchRuntime graph expansion is a separate post-fusion `graphExpanded` result. No live GPU call was made.
- [x] AFC-DOC-LANE-01 Keep docs search non-fusion/admin-only unless an actual SearchRuntime adapter and candidate contract are demonstrated. Owner trace: the admin-only `/api/admin/atlas/docs-corpus/search` route calls `searchDocCorpus`, which returns canonical Postgres FTS hits when admitted rows exist and otherwise a local lexical fallback; neither result path is adapted into SearchRuntime candidates or an RRF lane.
- [x] AFC-STRUCT-WRITE-TRACE-01A Prove the negative producer/materializer fact: `graphify-structural-batch-v1.ts` only invokes its materialize port and emits a receipt; `GraphifyStructuralMaterializer` reports `persistence: NOT_ATTEMPTED`. The retrieval reader and SearchRuntime lane mapping are separately located; the separate indexer's input is not yet linked to this batch.
- [x] AFC-STRUCT-WRITE-TRACE-01 Classify the current Graphify-to-SearchRuntime structural path as DISCONNECTED. `graphify-structural-batch-v1.ts` only delegates to its materializer; `GraphifyStructuralMaterializer` returns `persistence: NOT_ATTEMPTED`. Its callers persist Graphify receipts/evidence and symbol-registry facts, not `codebase_chunk_index.metadata/output_meta`. The apparent legacy writer `ast-treesitter-facts.mjs` computes `primaryNodeId` but its UPDATE persists only AST symbols/imports/exports and timestamps. Separately, `retrieveASTMatches()` reads existing `metadata/output_meta.tree_node_id`, emits `scoreSource: ast_tree`, and SearchRuntime maps that to lane `ast`. This closes the reachability question negatively for the current Graphify path; it does not prove who populated historical JSONB values or claim live-row provenance. No live DB query or write was performed.
- [x] AFC-LEXICAL-LANE-01 Reconcile lexical routing and SearchRuntime fusion, and establish whether FTS has a SearchRuntime adapter. Read-only trace: SearchRuntime's `LogicalRetrievalLane` (`dense|lexical|exact|ast|schema|rg|bm42`) is a post-retrieval fusion vocabulary; `postgres_trigram` maps to `lexical`, `rg_keyword` to `rg`. No FTS adapter exists in SearchRuntime (`retrieve-candidates.ts` owns the `search_vector` FTS query separately). **Correction from AFC-LIVE-ROUTER-OWNER-RECHECK-01 (2026-09-27):** the earlier note incorrectly attributed the live ACE router to `retrieval/router-matrix.ts` and `retrieval/query-router-4x4.ts`. Actual production caller `features/ai/ace/context-assembler.ts` imports `routing/query-router-4x4.ts`, whose live signal shape is numeric `{semantic, lexical, graph, trustPressure}` and dispatch set is `{qdrant, postgres, neo4j, mcp}`. `retrieval/router-matrix.ts` is not found in production imports (only the isolated routing-review candidate uses it); `retrieval/query-router-4x4.ts` is a simulation stub and has no production import. Thus router-matrix `SignalType` is not proven to be the live router signal owner; helper-to-live-signal mapping stays open in `AFC-OWNER-MAP-01`, and promotion stays blocked on operator decisions 1-3. Receipt: `docs/reports/afc-live-router-owner-recheck-v1-20260927T202448Z.json`. No code, DB/cache writes, or inference.
- [x] AFC-RADIX-ACCEPT-01 Review QUERY-RADIX-01 acceptance semantics against required lookup behavior. Review complete (2026-09-27): retain the current V1 contract as an **explicit-prefix mapping**, not Patricia `prefix_match` longest-stored-key-prefix semantics and not implicit autocomplete/subtree enumeration. `allowedExpansions` is the authorization boundary; absent rules produce no expansion. Focused radix suite passed 7/7 and strict OpenSpec validation passed. Scope limits remain explicit: the fixture covers `qdr`, `cagr`, `postgr`, `hns`, and NFC/case normalization, but not the proposed `postg`, `tree-s`, or `langex` examples; current vocabulary validation and lookup accept only letters/digits/underscore, so hyphenated prefixes such as `tree-s` are unsupported. Do not silently broaden V1 normalization or claim those cases accepted; define and test a versioned compound-token/alias policy first. This closes the semantics review only: QUERY-RADIX remains a prototype, opt-in, without an approved vocabulary owner or live caller; no promotion or Patricia backend change is implied.
- [ ] AFC-RADIX-LIVE-01 Resolve the revisioned vocabulary source/owner, then compile QUERY-RADIX-01 at the AFC query-compilation seam in shadow mode only; do not alter SearchRuntime inputs or invoke radix from RLM directly.
- [ ] AFC-RADIX-PROOF-01 Emit a checksum-bound baseline-vs-radix plan-diff receipt (added/removed terms and helpers, latency, no writes); require deterministic results for the same input revisions.
- [ ] AFC-RLM-BRIDGE-01 After AFC shadow proof and helper-contract promotion, let RLM consume one immutable AFC routing artifact; do not reconstruct routing or call the radix index directly from RLM.

**AFC-ROUTING-REVIEW-06 receipt (2026-09-27):**
`docs/reports/afc-routing-contract-review-v1.json` compares both collided
registry/capability/eligibility candidates and the isolated merged review
candidate. The isolated review candidate is the only shape that explicitly
keeps `routerSignal` (`router-matrix.ts`), `logicalLane` (typed from
`SearchRuntime`), and executor identity separate. Decision is `MANUAL` for
promotion: the current SearchRuntime lane set is `dense`, `lexical`, `exact`,
`ast`, `schema`, `rg`, and `bm42`; it does not currently define conceptual `graph` or `docs`
fusion lanes, and `rg_keyword` maps to its own `rg` lane rather than `lexical`.
The existing one-vote-per-lane fixture proof directly covers Qdrant+TurboVec
as one `dense` contribution, not every proposed cuVS/CAGRA route. No helper
registry, SearchRuntime, or routing behavior was changed. QUERY-RADIX-01 was
not touched. Promotion requires owner-verified helper-to-signal/lane/executor
mappings or a separately reviewed change to the fusion-lane owner.

## SESSION NEXT STEPS (2026-09-27, end of session)

**Immediate, owner-proof-blocked:**
1. **Live routing integration remains open.** QUERY-RADIX-01 is implemented and fixture-proven, but the vocabulary source/owner is unresolved and no production caller exists. Keep the next AFC integration shadow-only. Helper v1/v2 candidates remain unpromoted; verify owner references, logical-lane mappings, and capability evidence before using helper eligibility in the request path.
2. **`PERSISTENCE-DECISION-01`** (`parent-atlas-repair-candidate-feature-matrix/tasks.md`) is now recorded as `FILES_ONLY_SEALED_ARTIFACT`. This authorizes local artifacts only; the full run remains gated on binding the exact embedded bytes and implementing/testing a resumable compiler-backed driver. The old ~32-minute estimate is not transferable.

**Ready to resume, not blocked:**
3. **Superseded 2026-09-27**: `AFC-KW-02` (full normalization: camelCase/snake_case/kebab-case splitting, dot/path segmentation, package-name preservation) is now closed — see the checked-off item above (`token-normalization-v1.ts`, 8 tests). Deliberately NOT wired into `keyword-recognition-v1.ts`'s exact-token matching: `AFC-RADIX-LIVE-01` still remains gated on approved vocabulary ownership and must stay shadow-only; wiring this broader normalization into the live matcher is a separate promotion decision, not implied by the contract existing.
4. **Superseded 2026-09-27**: `AFC-PLAN-01` (phased/cost-bounded `RetrievalPlanV1` extension), `AFC-CAND-01` (`HelperCandidateV1` executor-vs-lane normalization), `AFC-CACHE-01` (stage-specific caches), `AFC-PARAM-01` (`ParameterBindingV1` EXACT/DERIVED/DEFAULTED) are now closed as contract-only work — see the checked-off items above, all with passing focused tests. None are wired into a live request path; helper eligibility is still a review candidate, not a production caller input.
5. `SEM-INPUT-01`'s structural-selection coverage is ~79% by extension count (TS/JS/MTS/Markdown) — extending to `.py`/`.svelte`/`.sql`/config formats is real, bounded follow-on work, not blocked on anything.
6. `ORDINAL-VECTOR-01`/`ACE-V4-COMP-01` canaries (8/8 each) prove identity/vector and V4 composition patterns only. The 4,000-character canary cut and absent resumable driver must be resolved before scale-up; the earlier ~32-minute estimate is not a current full-run ETA.

**This session's full real-gate closures** (for a future session's orientation, read before re-deriving any of this): ASTG-01 (ast-grep version convergence), EMB-PROV-01 (embedding provenance + a real `.env` bug fixed), external-doc sidecar migration registration, `CandidateOrdinalMapV1` integrity re-verification (16,151/16,151, pre-existing), `ORDINAL-VECTOR-01` canary (8/8), `ACE-V4-COMP-01` canary (8/8, first real V4 packets ever produced), full-corpus throughput sizing (~32min/concurrency=4, 0 failures), `CONTENT-POLICY-01` design freeze, `SEM-INPUT-01`/`SEM-INPUT-02` (real compiler, real bug found+fixed, 8/8 mixed canary), the AFC helper-routing tranche design audit + first bounded slice (built twice, concurrently, both preserved for review).

## AFC HELPER OWNER VERIFICATION (2026-09-27)

The initial receipt `docs/reports/afc-helper-owner-verification-v1.json` is
superseded by `docs/reports/afc-helper-owner-verification-v2.json`. The wider
call-path census corrected two earlier misses: `retrieve-candidates.ts`
actually creates `rg_keyword` candidates consumed by SearchRuntime (logical
lane `rg`), and the Tree-sitter sidecar has SvelteKit callers. It also found
the LangExtract tool on the agentic proposal path. V2 distinguishes those
real execution paths from fusion membership: trigram maps to `lexical`,
semantic Qdrant to `dense`, while FTS, docs, chunking, and LangExtract are not
proven as independent SearchRuntime votes. The router matrix's signal targets
do not equal SearchRuntime's logical lane vocabulary, so individual
helper-to-signal bindings remain unresolved. No registry promotion, service
call, datastore write, or QUERY-RADIX change occurred.

`QUERY-RADIX-01` remains a tested prototype, not accepted/live-wired. Its
current explicit-prefix plus `allowedExpansions` behavior is intentionally
not equivalent to Patricia `prefix_match`'s longest stored-key-prefix lookup.
Patricia's stock operation is longest stored key that prefixes the query, not
autocomplete enumeration of longer vocabulary keys. The vocabulary owner,
desired prefix semantics, and shadow integration proof remain open; the radix
source was not modified in this audit.

## AFC-OWNER-MANUAL-MAPPING-01 (partial: 2/12 entries, 2026-09-27)

Bounded slice only — resolved the 2 `UNRESOLVED` entries from
`afc-helper-owner-verification-v1.json` by reading the real `SignalType`
union (`router-matrix.ts`) and `LogicalRetrievalLane`/`getFusionLogicalLane()`
(`search-runtime.ts`) directly. The other 10 entries are untouched.

- **`rg-exact`**: UNRESOLVED → **BLOCKED**. `LogicalRetrievalLane` genuinely
  includes a distinct `'rg'` value (`case 'rg_keyword': return 'rg'`),
  confirming rg is separate from lexical in the real fusion type — the
  lane/signal shape exists, only a live caller producing `rg_keyword`
  candidates is unproven. `lexical_exact` is a plausible (not owner-confirmed)
  signal candidate.
- **`langextract-grounding`**: UNRESOLVED → **BLOCKED_STRUCTURALLY_ABSENT** (a
  stronger finding than the original status implied). The full real
  `LogicalRetrievalLane` set is `{dense, lexical, exact, ast, schema, rg,
  bm42}` — there is no doc/grounding lane anywhere in the type, not merely an
  unproven one. Confirms the receipt's own cross-cutting finding. No
  `SignalType` match either; `evidence_source_ref_context` is flagged as the
  closest conceptual candidate only, explicitly not asserted as the answer.

Receipt: `docs/reports/afc-owner-manual-mapping-01-partial-v1.json`. No
registry promoted, no code wired, no runtime calls made. Remaining 10 entries
and the operator decisions this receipt surfaces (does langextract-grounding
need a new fusion lane, or is it a producer-only helper outside the fusion
model?) are still open.

## AFC-OWNER-MANUAL-MAPPING-01, slice 2: ast/exact lanes are live, but not via the registered helpers (2026-09-27)

Traced the real, non-test producers of the `'ast'`/`'exact'` fusion lanes:
`retrieve-candidates.ts` runs real, live Postgres queries reading
pre-backfilled `tree_node_id`/`metadata`/`output_meta` columns
(`scoreSource: 'exact_symbol'` / `'ast_tree'`) — these genuinely feed live
`getFusionLogicalLane()` branches. But this is **not** the registered
`ast-grep-structural`/`ts-morph-symbol` helpers executing at request time —
it's a Postgres read of columns some earlier offline backfill process
populated. Same pattern already found for `rg-exact`: the registry's
`ownerRef` names a real, tested capability module, not necessarily the
actual live lane executor.

`ast-grep-structural` and `ts-morph-symbol` stay `UNIT_PROVEN_NOT_LIVE`
(unchanged) — this slice adds precision, not a status change: the lanes
they're *associated with* are live, just not through them. `code_symbol_context`
is the plausible (not owner-confirmed) shared `routerSignal` candidate for
both. Receipt: `docs/reports/afc-owner-manual-mapping-01-partial-v2.json`.

**New operator question this surfaces**: should the registry's `ownerRef`
distinguish "capability owner" (the reusable module) from "live lane
executor" (whatever query/service actually runs at request time) as two
separate fields? Right now one field conflates both, which is exactly how
`rg-exact` and these two entries ended up looking more/less live than they
actually are.

Not touched in this slice: `lsp-definition`, `lsp-references`,
`tree-sitter-chunk`, `semantic-768`, `graph-ppr`. No registry promoted, no
code wired, no runtime calls made.

## AFC-OWNER-MANUAL-MAPPING-01, slice 3: all 12 entries now have direct-code evidence (2026-09-27)

Completes a full pass over the remaining entries. Key new finding:
`tree-sitter-chunk` reclassified `UNIT_PROVEN_NOT_LIVE` → `LIVE_VIA_OFFLINE_PIPELINE`
— it's real, wired into the Graphify offline structural-indexing pipeline
(`graphify-structural-batch-v1.ts`/`graphify-structural-materializer.ts`,
imported by `canonical-lifecycle-reconciler-v1.ts`), and its output plausibly
feeds the same `tree_node_id`/`metadata` Postgres columns `retrieve-candidates.ts`
reads live for the `'ast'`/`'exact'` lanes (connects directly to slice 2's
finding). **Caveat, not proven**: the specific column-write wasn't traced to
its exact INSERT/UPDATE statement — flagged as plausible-by-pipeline-shape,
not confirmed end-to-end.

`lsp-definition`/`lsp-references` stay `CONTRACT_ONLY` (stronger evidence: a
real code comment elsewhere explicitly says the LSP contract was deliberately
NOT reused). At the time of this census, `semantic-768`/`graph-ppr` were
classified `BLOCKED` from their absence in SearchRuntime; the graph-PPR
classification is superseded by the route-level caller evidence below.
Receipt: `docs/reports/afc-owner-manual-mapping-01-partial-v3.json`.

**AFC-GRAPH-LANE-01 caller-role correction (2026-09-27):** A later focused
trace found `routes/api/admin/atlas/synthesize/+server.ts` conditionally calls
`atlas-rapids-pagerank-client.ts` with the requested graph revision, seed
weights, candidate nodes, alpha/tolerance/iteration bounds, and a deadline.
Its scores populate `personalizedPageRank` on that route's candidate feature
rows and participate in that route's ranking. This proves a code-wired,
route-scoped PPR feature path, not that a live GPU request was executed.
Separately, `atlas/retrieval/search-runtime-adapter.ts` returns bounded graph
expansion in `graphExpanded` after `SearchRuntime.search()`; it is not an RRF
lane. Therefore `graph-ppr` has no independent SearchRuntime logical lane or
fusion vote. Updated owner evidence is in
`docs/reports/afc-helper-owner-verification-v2.json`.

**All 12 helper entries now have at least one round of direct-code
verification** beyond the original audit. Remaining open work is the
end-to-end column-write trace for tree-sitter-chunk, and the operator
decisions already surfaced (registry `ownerRef` field split, langextract's
missing fusion lane, rg-exact's unconfirmed signal). No registry promoted,
no code wired, no runtime calls made across all three slices.

## SESSION HANDOFF (2026-09-27, end of session)

**Full owner-verification pass is complete.** All 12 registered helper
entries now have direct-code-verified status (3 slices,
`docs/reports/afc-owner-manual-mapping-01-partial-v{1,2,3}.json`, plus the
original `afc-helper-owner-verification-v1.json`). Final status:

| Status | Helpers |
|---|---|
| LIVE | postgres-fts, postgres-trigram, docs-corpus-search |
| LIVE_VIA_OFFLINE_PIPELINE | tree-sitter-chunk |
| UNIT_PROVEN_NOT_LIVE | ast-grep-structural, ts-morph-symbol |
| CONTRACT_ONLY | lsp-definition, lsp-references |
| BLOCKED | rg-exact, semantic-768, graph-ppr |
| BLOCKED_STRUCTURALLY_ABSENT | langextract-grounding |

**Best cross-cutting finding**: `tree-sitter-chunk` (Graphify offline
pipeline) plausibly feeds the same Postgres `tree_node_id`/metadata columns
that `retrieve-candidates.ts` reads live for the `'ast'`/`'exact'` fusion
lanes — three previously separate-looking entries (`tree-sitter-chunk`,
`ast-grep-structural`, `ts-morph-symbol`) turned out to describe one real
pipeline, not three independent gaps. The follow-up write trace below found
the exact gap: `graphify-structural-batch-v1.ts` only invokes its materialize
port and emits a receipt; `GraphifyStructuralMaterializer` explicitly
returns `persistence: NOT_ATTEMPTED`, and the lifecycle reconciler requires a
separate persistence owner. Earlier wording that a different full-repo indexer
writes `tree_node_id` into `codebase_chunk_index.metadata` was based on the
legacy `ast-treesitter-facts.mjs` header and computed `primaryNodeId`. Its SQL
does not persist that value. Current source review classifies the Graphify
output as disconnected from the JSONB field read by SearchRuntime; the producer
of any historical values in that JSONB field remains unidentified. See the
closed-negative result at `AFC-STRUCT-WRITE-TRACE-01` below; do not infer
lineage from matching field names.

**New, cheap forward option found** (not built, just recorded): ast-grep
ships its own official MCP server for AI-agent structural queries. This
repo has zero ast-grep MCP integration today (verified: no
`.opencode`/`.claude`/`.mcp.json` config, no registration in
`src/mcp/server.ts`). Adopting the official MCP server could be a smaller,
more standard path to make `ast-grep-structural` request-time-available
than hand-building a live wiring layer — worth evaluating against
`DEPENDENCY-CAPABILITY-GUARD-01` (root `CLAUDE.md`) before choosing it over
this session's own `semantic-input-compiler-v1.ts` in-process consumer.

**Operator decisions still open** (nothing here should be resolved
unilaterally by a future session without your input):
1. `v1` vs `v2` helper-eligibility/registry implementations — which becomes
   canonical (routing-review-v2 fork keeps the cleanest separation of
   `routerSignal`/`logicalLane`/`executor`; the `v1` schema's baked-in
   `executionAuthorized/executionPerformed/writesPerformed/canonicalAuthority: false`
   fields are worth carrying forward regardless of which base wins).
2. Should the registry's `ownerRef` split into "capability owner" (the
   reusable module) vs. "live lane executor" (the actual request-time
   caller)? Currently one field conflates both, which is what made
   `rg-exact`/`ast-grep-structural`/`ts-morph-symbol` look more or less live
   than they actually are.
3. Does `langextract-grounding` need a new `SearchRuntime` fusion lane +
   `SignalType` added, or is it a producer-only/evidence-attachment helper
   that should sit outside the fusion model entirely?
4. The former persistence-choice blocker is superseded by the user's
   `FILES_ONLY_SEALED_ARTIFACT` decision recorded in
   `parent-atlas-repair-candidate-feature-matrix/tasks.md`. The full run still
   requires a resumable, checksum-sealed materializer; the old ~32-minute
   estimate came from a different input path and is not a current runtime
   guarantee for the SemanticInputCompilerV1 pipeline.

**Do not promote, wire, or accept anything from this tranche** (the merged
helper contract, `QUERY-RADIX-01`, any registry) until decisions 1-3 above
are made — every receipt this session produced is explicitly
`canonicalAuthority: false` / `writesPerformed: false` for exactly this
reason.

**Where everything lives** (4 OpenSpec changes touched this session, read in
this order for full context): `parent-atlas-kv-cache-adaptation-research/tasks.md`
(ASTG-01, EMB-PROV-01, ordinal-vector/V4 canaries, throughput sizing) →
`parent-atlas-versioned-doc-intelligence/tasks.md` (sidecar migration
registration) → `parent-atlas-repair-candidate-feature-matrix/tasks.md`
(CONTENT-POLICY-01, SEM-INPUT-01/02, PERSISTENCE-DECISION-01) →
`parent-atlas-agentic-file-compiler/tasks.md` (this file — the
helper-routing/owner-verification tranche, most recently active).

All work this session was read-only against Postgres/Qdrant/Valkey/Neo4j/
RabbitMQ (0 writes throughout, verified per-receipt). Everything is
committed and pushed to `origin/handoff/summary-enrichment-lineage-20260925`
through commit `deae3a1bb5`.

## RECONCILIATION: afc-helper-owner-verification-v2 supersedes this session's v1 findings (2026-09-27)

A parallel Codex session (same operator, run concurrently, confirmed) produced
`docs/reports/afc-helper-owner-verification-v2.json`, which **supersedes**
this file's earlier `afc-helper-owner-verification-v1.json` +
`afc-owner-manual-mapping-01-partial-v{1,2,3}.json` receipts. Verified one
correction directly before accepting it: `src/routes/api/admin/atlas/synthesize/+server.ts`
genuinely references query-time PPR — my earlier `graph-ppr: BLOCKED`
conclusion (slice 3) was **incomplete**, not fabricated; a real caller exists
outside SearchRuntime's fusion path that I didn't find.

**Corrected final status (v2, richer vocabulary: PROVEN / PROVEN_WITH_ADAPTER
/ BLOCKED / UNRESOLVED / NOT_A_FUSION_LANE)**:

| Helper | v1 (this session) | v2 (corrected) |
|---|---|---|
| rg-exact | BLOCKED | PROVEN_WITH_ADAPTER → `rg` lane |
| postgres-fts | LIVE | **NOT_A_FUSION_LANE** |
| postgres-trigram | LIVE | PROVEN → `lexical` lane |
| tree-sitter-chunk | LIVE_VIA_OFFLINE_PIPELINE | NOT_A_FUSION_LANE (chunking isn't an RRF vote) |
| ast-grep-structural | UNIT_PROVEN_NOT_LIVE | UNRESOLVED |
| ts-morph-symbol | UNIT_PROVEN_NOT_LIVE | UNRESOLVED |
| lsp-definition/references | CONTRACT_ONLY | BLOCKED |
| docs-corpus-search | LIVE (admin-only) | NOT_A_FUSION_LANE (confirmed admin-only, no RRF conversion found) |
| semantic-768 | BLOCKED | PROVEN_WITH_ADAPTER → `dense` |
| graph-ppr | BLOCKED | **PROVEN_WITH_ADAPTER** (real caller in admin synthesis route; not a SearchRuntime fusion lane) |
| langextract-grounding | BLOCKED_STRUCTURALLY_ABSENT | NOT_A_FUSION_LANE |

**Key correction to this session's framing**: "not a SearchRuntime fusion
lane" (v2) is a distinct, legitimate category from "blocked"/"not live" (v1)
— several helpers (docs-corpus-search, tree-sitter-chunk, langextract-grounding,
now also postgres-fts) are real and used, just not as independent RRF votes.
v2's `AFC-LANE-PARITY-01` also closed with a real fixture: qdrant/turbovec/cuvs/cagra
hits on one candidate collapse to exactly one `dense` fusion contribution
(22/22 tests passing), proving the executor≠lane invariant this session
could only assert, not fixture-prove for all 4 executors.

**Authoritative going forward**: `docs/reports/afc-helper-owner-verification-v2.json`
is the corrected owner-census baseline; its `nextGates` array is a point-in-time
snapshot, not a live task controller. The current checkbox states below govern:
later ledger evidence closes `AFC-STRUCT-WRITE-TRACE-01` and
`AFC-LEXICAL-LANE-01`, while `AFC-OWNER-MAP-01` and promotion remain open. The
receipt's progress value ("43/73") is historical and is not used as the live
OpenSpec task count. This session's v1 receipts remain as historical evidence
of the audit methodology, not as the current status. Do not re-derive owner
status from the v1 files going forward — read v2 first.

## RECONCILIATION 2: flat status fields were hiding real distinctions (2026-09-27, external review)

Two more rounds of external review (same operator, reviewing this file's own
committed reconciliation above) found that a single flat status field was
conflating axes that need to stay separate — the same failure mode already
named in this file's own "operator decision 2" above (`ownerRef` conflating
capability owner vs. live lane executor), now shown to be more general than
just that one field.

**`semantic-768`**: labeling this `BLOCKED` (v1) or even `PROVEN_WITH_ADAPTER`
(v2) alone loses information this session already proved. Corrected view:

```
semantic-768
  producerCapability:      PROVEN        (EMB-PROV-01, strict :8081 executor,
                                           cross-executor parity 0.999988 — this
                                           session's own live proof)
  retrievalFusionAdapter:  PROVEN_WITH_ADAPTER → `dense` lane (per v2)
```

"Producer exists" and "producer is live in SearchRuntime's fusion path" are
different claims; this session's `EMB-PROV-01` proved only the former, v2
proved the latter. Neither receipt alone should be read as covering both.

**`tree-sitter-chunk`**: `LIVE_VIA_OFFLINE_PIPELINE` (this session's v3) and
`NOT_A_FUSION_LANE` (v2) are both true but at different grains, and
`AFC-STRUCT-WRITE-TRACE-01`'s negative proof (above) adds a third, sharper
axis neither receipt captured — whether the pipeline's own output reaches
persistence at all:

```
tree-sitter-chunk
  capabilityStatus:              PROVEN            (real, wired Graphify pipeline)
  producerPath:                  LOCATED           (graphify-structural-batch-v1.ts)
  persistenceBridge:              DISCONNECTED      (materializer reports
                                                     persistence: NOT_ATTEMPTED;
                                                     located callers persist other
                                                     artifacts, not the reader's JSONB)
  liveLaneExecutor:               retrieve-candidates.ts (Postgres-backed,
                                                     reads a column a DIFFERENT,
                                                     unrelated writer populates)
  provenanceLinkToTreeSitterBatch: DISCONNECTED_IN_CURRENT_PATH
  fusionRole (per v2):             NOT_A_FUSION_LANE
```

**The generalized lesson, worth stating once rather than re-discovering per
helper**: `capability owner ≠ materializer ≠ persistence owner ≠ live
candidate producer ≠ SearchRuntime lane`. A future registry promotion
(operator decision 2, above) should model these as distinct fields rather
than one status enum:

```
capabilityOwner    — the reusable module/contract that implements the capability
producerPath       — where that capability's output is actually generated at runtime (LOCATED / UNRESOLVED / ABSENT)
persistenceBridge  — whether that output is proven to reach durable storage (PROVEN / NOT_PROVEN / ABSENT)
liveLaneExecutor   — what actually runs at request time and produces candidates
routerSignal        — the router-matrix.ts SignalType this maps to, if any (often PLAUSIBLE_NOT_OWNER_CONFIRMED)
fusionRole          — FUSION_CONTRIBUTOR / EVIDENCE_ENRICHER / OFFLINE_PRODUCER / PLANNING_ONLY / NONE
logicalLane         — the SearchRuntime LogicalRetrievalLane, if fusionRole is FUSION_CONTRIBUTOR
```

This is documentation-only in this pass — no `HelperRegistryV1`/`-v2` TS file
was touched. Adopting this shape in code remains part of the still-open
`AFC-REGISTRY-OWNER-SPLIT-01`-equivalent work (operator decision 2).

**Gate board, using this file's actual task IDs** (an external review pass
proposed its own shorthand names for some of these — `AFC-DENSE-4X-PARITY-01`,
`AFC-SIGNAL-BINDING-01`, `AFC-REGISTRY-OWNER-SPLIT-01`,
`AFC-REGISTRY-PROMOTE-01`, `QUERY-RADIX-ACCEPT-01` — none of which are literal
task IDs in this file; mapped to the real ones below to avoid inventing new
checkboxes):

| Real task ID | Status |
|---|---|
| `AFC-LANE-PARITY-01` (external review's "dense-4x-parity") | CLOSED |
| `AFC-GRAPH-LANE-01` | CLOSED |
| `AFC-DOC-LANE-01` | CLOSED |
| `AFC-STRUCT-WRITE-TRACE-01A` | CLOSED_NEGATIVE (Graphify batch does not persist; field-name coincidence is not lineage) |
| `AFC-STRUCT-WRITE-TRACE-01` | CLOSED_DISCONNECTED (current Graphify structural output is not persisted to the JSONB field read by SearchRuntime) |
| `AFC-LEXICAL-LANE-01` | CLOSED — the checkbox and read-only trace at line 390 already reconcile router signals with SearchRuntime lanes; no adapter or fusion behavior was added. |
| `AFC-OWNER-MAP-01` (external review's "signal-binding") | OPEN |
| `AFC-ROUTING-PROMOTE-01` (external review's "registry-owner-split" + "registry-promote") | OPEN — needs operator decisions 1-3 above first |
| `AFC-RADIX-ACCEPT-01` (external review's "query-radix-accept") | CLOSED — semantics review only; V1 remains explicit-prefix prototype, not live-accepted |

No registry code, SearchRuntime, or routing behavior changed in this pass —
documentation-only, reconciling two rounds of external review on top of the
in-progress local edit already in this file.

### AFC-OWNER-04 lane/fusion reconciliation (2026-09-27; source + fixture scope)

Closed only the per-helper role/lane mapping that current code and fixtures
support. SearchRuntime's logical lane vocabulary is
`dense|lexical|exact|ast|schema|rg|bm42`; the router's `SignalType` is a
separate pre-fusion vocabulary, and no helper-to-router-signal mapping is
inferred here.

| Helper/capability | Current fusion result | Evidence boundary |
|---|---|---|
| `rg-exact` | `rg` contributor | `retrieve-candidates.ts` emits `rg_keyword`; SearchRuntime maps it to `rg`. |
| `postgres-trigram` | `lexical` contributor | `postgres_trigram` normalizes to `lexical`. |
| `semantic-768` | `dense` contributor | Semantic search adapter; four-executor parity remains fixture-only. |
| Qdrant / TurboVec / cuVS / CAGRA | one `dense` vote | `AFC-LANE-PARITY-01` fixture retains executor identities while deduplicating the logical contribution. |
| `postgres-fts` | non-fusion helper | Current FTS owner path is not adapted to SearchRuntime candidates. |
| `tree-sitter-chunk` | evidence producer, not a fusion vote | Offline chunking capability; current Graphify persistence path is disconnected. |
| `ast-grep-structural`, `ts-morph-symbol` | no helper-owned live fusion mapping proven | Unit/capability evidence does not prove request-time execution; the `ast`/`exact` SearchRuntime candidates have separate owners. |
| `lsp-definition`, `lsp-references` | blocked; no lane assigned | Required live LSP executor/caller is not proven. |
| `docs-corpus-search` | non-fusion helper | Admin docs search results are not converted to SearchRuntime candidates. |
| `graph-ppr` | synthesis-ranking/enrichment, not SearchRuntime fusion | Admin synthesis caller is outside SearchRuntime fusion. |
| `langextract-grounding` | evidence enrichment, not a fusion vote | Proposal/grounding path does not emit an independent SearchRuntime lane. |

Validation: five focused Vitest files passed (47 tests), including helper
routing/eligibility/candidate contracts, the isolated v2 review fixture, and
SearchRuntime. This does not prove live service/GPU availability, actual
production FTS/AST row lineage, or router-signal binding. `AFC-OWNER-MAP-01`
and `AFC-ROUTING-PROMOTE-01` remain open; no registry or runtime behavior was
changed.

### AFC-STRUCT-WRITE-TRACE-01 source-only recheck (2026-09-27; closed as disconnected)

- `graphify-structural-batch-v1.ts` delegates to an injected `materialize` port
  and records the returned structural receipt; it contains no Postgres write.
- `GraphifyStructuralMaterializer.materialize()` calls the 8095 AST provider,
  normalizes its evidence, and returns `persistence: 'NOT_ATTEMPTED'`. Its
  contract does not write `codebase_chunk_index.metadata` or `output_meta`.
- The legacy `sveltekit-frontend/scripts/atlas/ast-treesitter-facts.mjs` is a
  plausible writer by its header and local `primaryNodeId` computation, but its
  actual `UPDATE codebase_chunk_index` persists only `ast_symbols`,
  `ast_imports`, `ast_exports`, and timestamps; it does not persist that ID or
  either JSONB field read below. It is not the missing producer edge.
- The request-time reader is real but proves only the read edge:
  `retrieveASTMatches()` selects existing rows from `codebase_chunk_index`,
  filters on `COALESCE(metadata->>'tree_node_id', output_meta->>'tree_node_id')`,
  and emits `scoreSource: 'ast_tree'`.
- Other located Graphify callers either emit a coordination receipt or, under
  explicit apply mode, persist evidence-ledger/symbol-registry records. Neither
  writes the `codebase_chunk_index` JSONB fields read by `retrieveASTMatches()`.
  The source-level outcome is therefore **DISCONNECTED_IN_CURRENT_PATH**, not
  producer-to-row lineage proven. Historical JSONB population/readback remains
  a separate owner question. No live database query or write was run.

## Orchestration and prompt-input follow-up

- [ ] AFC-ORCHESTRATION-01 Inventory installed and invoked Deep Agents/LangChain/Mastra/ACP/A2A/tRPC/MCP surfaces; assign each to existing routing, delegation, transport, or tool-registry owners, and add no parallel orchestrator. Pydantic validates bounded sidecar contracts; it does not confer source or ontology authority.
- [ ] AFC-PROMPT-01 Build ACE JSON/prompt inputs only from the existing admitted ContextManifest and PromptPlan owners; bind template, model, tool-schema and evidence revisions and test rejection of raw retrieval hits, cache-only hints, unadmitted summaries, and hidden-state persistence.
- [ ] AFC-TOOL-ROUTING-01 Verify MCP/Viterbi selection remains advisory and dispatch uses the existing allowlisted tool registry with schema/permission validation; ACP/A2A delegation and tRPC transport must preserve request, workspace, and evidence identities.

### 2026-10-11 read-only DAG structural refinement check

The existing `context-dag-handlers-v1.spec.ts` exercises lexical-dependent ast-grep refinement through the shared read-only DAG. Focused Vitest passed **30/30**. This proves the handler/DAG fixture path only; it does not prove a production caller, current Graphify evidence persistence/readback, ontology admission, or ranking promotion. Keep `AFC-ORCHESTRATION-01`, `AFC-PROMPT-01`, and `AFC-TOOL-ROUTING-01` open pending their own owner-level evidence.

## Priority-ranked parallel NLP / summarization / multi-hop helpers (2026-11-01)

**Status**: CREATED (planning only). Nothing here is built, wired or measured. Extends this change; adds no peer owner, no new container and no new sidecar. Related owners: `parent-atlas-gpu-compute-lanes-consolidation` (GPU/parallelism rules), `parent-atlas-nlp-sidecar-feature-compiler` (:8095), `parent-atlas-ast-summary-lineage-pipeline` (summary lineage).

**TL;DR**: Summarization is LLM inference on one shared GPU slot (concurrency 1). NLP extraction, ranking, joins and multi-hop traversal are CPU work and can run in bounded pools. Priority ranking is a CPU scheduler that decides *what* is summarized next; it never decides identity, never writes, and stays advisory (`CHALLENGER_ONLY`) until evaluated. The binding constraints today are RAM, free disk and VRAM, not CPU cores.

### Measured host facts (read-only, 2026-11-01)

| Resource | Measured | Implication |
|---|---|---|
| CPU | i7-11700F, 8 cores / 16 threads; WSL2 `.wslconfig` caps containers at **8 processors, 10 GB** | Containers see 8 CPUs, not 16 |
| RAM | 31.9 GB host, **1.3 GB free**; `vmmem` 3.5 GB, one `node` process 3.0 GB | RAM, not cores, limits parallelism |
| Disk | 1 TB NVMe (WDC WDS100T2B0C), **C: has 12 GB free** | Disk headroom is the first gate for any bulk run |
| GPU | RTX 3060 Ti 8 GiB, **6.57 GiB used / 1.45 GiB free** (Ornith on :8090) | No second GPU job while :8090 is up |
| LLM slots | llama-server `/slots`: **1 slot**, `n_ctx` 65536 | Summarization concurrency = 1 |
| Tight containers | clickhouse 1.6/2 GiB, filer 235/256 MiB, langfuse-worker 404/512 MiB, langfuse-server 663/1 GiB, postgres 573 MiB of 2 GiB | Do not add load without raising limits |

### Work classification (CPU vs GPU)

| Stage | Executor | Concurrency (proposed, bounded) | Why |
|---|---|---|---|
| Eligibility join (chunk has 768-d embedding, no summary, current revision) | CPU, Postgres read-only | pool 2-4 | Joins/filters are CPU work |
| Priority ranking | CPU, in-process | 1 (cheap) | Scoring a few hundred thousand rows; deterministic tie-break |
| Structural/NLP extraction (Tree-sitter, ast-grep, spaCy, LangExtract) | CPU, `:8095` container | 4 workers (RAM-bound; serial oracle first) | Evidence-only proposals |
| Multi-hop traversal | CPU, Neo4j Cypher or Postgres recursive CTE | k <= 3 hops, fan-out cap, per-query timeout | Unbounded traversal is forbidden |
| Embedding | CPU Go service `:8097` (device cpu) / Ollama `:11434` | 1-2 | GPU has 1.45 GiB free |
| **Summarization** | **GPU, Ornith `:8090`** | **1 (one slot)** | LLM inference; the only GPU stage in this lane |
| Graph tensor work (PageRank/cuVS/KMeans) | GPU, WSL RAPIDS | 1, only after the "Prepare cuVS" task frees :8090 | Cannot share VRAM with Ornith |
| Writes (Postgres/Valkey/Qdrant/Neo4j) | CPU | **serial, gated** | Existing rule: side effects stay serial |

### PriorityScoreV1 (advisory)

Hard filters first (not weights): chunk has a canonical 768-d embedding; revision-qualified; not already summarized. Then rank by: workboard critical-path rank and fan-out; `chunk_hit_log` / `ace:rank:demand` hit demand; `graph_node_metrics` PageRank (not `atlas_graph_authority_scores_v2`, which is degenerate); staleness. Weights are unset until an evaluation exists. Ties break by `stableKey`. Output is a ranked work list, never a write.

### Proposed floors before any bulk or parallel run (to be confirmed by AFC-SCHED-01)

| Resource | Proposed floor | Reason |
|---|---|---|
| Free disk on C: | >= 50 GB | 48 indexes on `codebase_chunk_index`, WAL, Qdrant, model files; only 12 GB free now |
| Free host RAM | >= 4 GB headroom | 1.3 GB free now; swap thrash risks Postgres and Docker |
| Free VRAM | >= 1.5 GiB for classifier-sized jobs; `:8090` stopped for RAPIDS | Ornith holds ~6.5 GiB |
| NVMe | Keep WAL/Postgres on NVMe; no spinning-disk tier | Random I/O for HNSW |
| CPU | 8C/16T is sufficient; pool of 4 | RAM binds first |

These are proposals, not measurements. A larger-RAM or larger-disk decision belongs to you.

### Containers, ports, protocols (existing; no new containers)

| Service | Port(s) | Protocol | Role for helpers |
|---|---|---|---|
| Postgres `legal-ai-postgres` | 5434 -> 5432 | PostgreSQL wire | Truth; read-only eligibility/ranking |
| Valkey `legal-ai-valkey` | 6379 | RESP3 (ioredis) | Hot demand/ranking cache |
| Qdrant `legal-ai-qdrant` | 6333 REST, 6334 gRPC | HTTP/JSON, gRPC | Dense mirror |
| Neo4j `legal-ai-neo4j` | 7474 HTTP, 7687 | HTTP, Bolt | Bounded multi-hop (mirror) |
| NLP sidecar `miniforge-nlp-sidecar` | 8095 | HTTP/JSON (FastAPI, Pydantic) | Extraction / analyze |
| Go retrieval `legal-ai-go-retrieval` | 8100, 50053 | HTTP, gRPC | Read-only retrieval executor |
| Go embedding `legal-ai-go-embedding` | 8097, 50051 | HTTP, gRPC | CPU embeddings |
| GPU executor `atlas-gpu-8098` | 8098 | HTTP/JSON | Graph/tile tensor work |
| Neural decoder `atlas-neural-decoder` | 8121 | HTTP/JSON | Prefill encoder |
| LangGraph `legal-ai-langgraph` | 8091 | HTTP/JSON | Orchestration only |
| RabbitMQ `legal-ai-rabbitmq` | 5673 -> 5672, 15673 mgmt | AMQP | Async job events |
| NATS `legal-ai-nats` | 4222, 8222 | NATS | LangGraph worker bus |
| Bifrost `legal-ai-bifrost` | 3040 -> 8080 | HTTP | Inference gateway cache |
| SeaweedFS | master 9333, volume 8080, filer 8888, S3 8333 | HTTP, S3 | Raw object store |
| Host: llama-server | 8090 | HTTP (OpenAI-compatible, SSE) | Summarization (GPU) |
| Host: TRACE MCP | 8788 (127.0.0.1) | MCP Streamable HTTP | Helper tool surface |
| Host: SvelteKit | 5173 | HTTP, SSE, tRPC | ACP `/api/acp/*`, A2A `/.well-known/agent.json` |
| Host: TurboVec | 8791 | HTTP | Challenger ANN |

Helpers are exposed as TRACE MCP tools and registered in `ACPToolRegistry` (`GET /api/acp/tools`), not as side-channel HTTP, and over MCP Streamable HTTP, not a new port.

### Tasks

- [x] AFC-SCHED-01 Read-only baseline receipt (done 2026-11-01; see "AFC-SCHED-01 findings" below): Ornith seconds-per-summary at representative chunk sizes; `:8095 /analyze` latency at pool 1/2/4; Postgres eligibility-query p50; host RAM/disk/VRAM at start and end. Confirm or revise the floors above.
- [x] AFC-SCHED-02 (done 2026-11-01; see "AFC-SCHED-02 findings" below) Audit `packages/parent-atlas/src/core/`, `packages/atlas-core/src/` and `scripts/atlas/` for an existing priority/scheduling contract before defining `PriorityScoreV1`; use a schema ID distinct from `atlas.parameter-artifact.v1` and add Zod/Pydantic parity to `check-e2e-contract-chain-v1.mjs`.
- [ ] AFC-SCHED-03 Dry-run-only summary work-queue builder: eligibility join + `PriorityScoreV1`, embedding-first filter, ranked list with counts; writes nothing. Summary writes remain a separate explicit authorization with pre-image and readback.
- [ ] AFC-SCHED-04 Read-only MCP tool `summary.rank_queue` in TRACE, registered in `ACPToolRegistry`, with an `ops.validate_tool_call` contract (today `kag.recall_similar_fix` has none).
- [ ] AFC-SCHED-05 Read-only MCP tool wrapping `:8095 /analyze` for bounded batches; close the gap where `miniforge.analyze` omits `sourceRevision`, `workspaceRevision`, `treeNodeId`, `sourceNamespace`, `passes` and `groundedExtractionRequired`.
- [ ] AFC-SCHED-06 Bounded multi-hop helper (k <= 3, fan-out cap, timeout) by extending the existing `graph.expand_neighborhood`, not a second traversal owner.
- [ ] AFC-SCHED-07 Parallel executor harness: serial oracle first, bounded pool, unique run-scoped outputs, ordered receipt recording concurrency; writes stay serial.
- [ ] AFC-SCHED-08 Resource preflight (free RAM, disk, VRAM via `nvidia-smi`, `:8090` `/slots` idle) that fails closed with BLOCKED, never a silent skip.
- [ ] AFC-SCHED-09 Any GPU stage needs a CPU-reference parity receipt (ordering, masks, dimensions, checksums, tolerance) before use.
- [ ] AFC-SCHED-10 Extend `check-e2e-contract-chain-v1.mjs` with a `helpers` stage covering the tools above.
- [ ] AFC-SCHED-11 Reconcile the container/port table against compose files; record collisions (host :8080 is SeaweedFS volume; SearXNG publishes :8889).
- [ ] AFC-SCHED-12 Consumer contract for a case-scoped assistant (`/cases/[caseId]/assistant`): retrieval scoped to authorized case records, citations carry evidence ID and revision plus page or timestamp; PostgreSQL stays the owner of case data. Source: an external design answer, not yet checked against this repo.

### AFC-SCHED-01 findings (2026-11-01; receipt `.tmp/atlas/sched-baseline-receipt-v1.json`, script `scripts/atlas/baseline-sched-helpers-v1.mjs`)

Read-only: no datastore writes; about 8 bounded inference requests to :8090 and 120 to :8095.

| Measurement | Result | Caveat |
|---|---|---|
| Ornith summary latency, unique prompts (prompt cache defeated) | 288 prompt tok / ~800 chars: **0.96 s**; 601 tok / ~2,000 chars: **1.37 s**; 1,338 tok / ~4,000 chars: **2.09 s** | Medians of 3 runs after warm-up. Prefill about 1,300-1,700 tok/s, generation about 56-58 tok/s |
| Ornith concurrency | 2 simultaneous requests finish in 1.9 s wall (about 2 x 0.96 s): **serialized, one slot** | Confirms concurrency 1 for the GPU stage |
| Prompt-cache effect | Identical prompts took 0.81 s with 4 new prompt tokens; unique prompts take 0.96 s and up | Any benchmark that resends one prompt understates cost |
| :8095 `/analyze` (1,080 chars, entities mode, 40 requests per level) | concurrency 1: 26.8 req/s; **2: 34.2 req/s (best)**; 4: 28.6 req/s with p50 34 -> 57 -> 136 ms | Two runs agree on the shape (c=2 best, c=4 worse). Spacy-style entities only; LangExtract/LLM extraction not measured |
| Postgres eligibility (`LIMIT 1000`, read-only) | p50 28 ms warm (128 ms cold) | |
| Chunk counts now | total 274,465; **embedded 274,428**; summarized 40,306; both 40,269; **eligible (embedded, no summary) 234,159** | The 2026-10-20 notes said 219,998 embedded and 560 with both; those are stale. Non-null does not prove a valid vector (a past placeholder-vector writer exists), so validity must be filtered before ranking |
| Host during runs | RAM free 1.3-6.3 GiB (volatile); disk free 11.9 GiB; **VRAM free 354-407 MiB** (6.57 GiB used at session start, 7.6 GiB after longer prompts) | |

**Projection (single slot, no overhead, chunk-size mix unmeasured)**: 234,159 eligible chunks take about 62 h if all are small, about 91 h if medium, about 136 h if large. Full coverage is days of continuous GPU time, so priority ranking decides which top N get summarized first (the top 10,000 is roughly 4 h at medium size).

**Floors**: the proposed floors are not met today. Free disk (11.9 GiB vs 50), free VRAM (about 0.4 GiB) and free RAM (below 4 GiB at times) all block bulk runs. AFC-SCHED-08 must report BLOCKED rather than proceed.

**Not measured**: chunk-size distribution, Postgres write cost, LangExtract latency, multi-hop traversal cost, Valkey cost.

### AFC-SCHED-02 findings (2026-11-01; read-only audit)

**Existing priority code (none is a generic work-queue ranker; none lives in `packages/`)**

| File | What it ranks | Label |
|---|---|---|
| `sveltekit-frontend/src/lib/server/atlas/board/daily-graphify-task-priority.ts` (`rankDailyGraphifyBoardTasks`) | Daily Graphify board tasks; imported by the ai-dashboard page | domain-specific, live |
| `sveltekit-frontend/src/lib/server/atlas/board/runtime-error-priorities.ts` (`loadRuntimeErrorPriorities`) | Error groups by `occurrences x (1 + ln n) x exp(-age_days/14)`; live in ai-dashboard | domain-specific, live; **reuse its recency-decay form** |
| `scripts/atlas/lib/directory-analysis-priority-v1.mjs` (`scoreDirectoryAnalysisPriorityV1`) | Directories, rule-based | script-only |
| `scripts/atlas/build-gpu-feature-kanban-ranking.mjs` | 0-100 feature consolidation ranking from `atlas_packets` / summary layers | script-only report |
| `scripts/atlas/rank-kanban-and-npm-inventory.mjs` | 5-dimension rubric over `docs/graph/kanban-board.json` (stale 2026-07-04 snapshot) | script-only, stale input |

`runtime-ownership-registry.json` has no priority or scheduling capability (only `rerank`). Conclusion: a chunk-level summary work-queue ranker is a new capability, so `PriorityScoreV1` is justified, but it must start in `scripts/atlas/lib/` (placement rule), borrow the recency-decay form above, stay `CHALLENGER_ONLY`/advisory, and be registered in the registry under one named owner (new task AFC-SCHED-13).

**Data gaps found in the workboard inputs (4,347 ticketed ACTIONABLE tasks)**
- `criticalPathRank` and `fanoutCount` are **absent** for all 4,347. The only usable field is `priority`, 8 discrete values (10-80; 1,142 tasks at 70, 925 at 40).
- Dependency edges: **2 in total**, both bare section numbers (`"8.6"`) resolving to no ticket. `kanban_task_dependencies` has 0 rows and cannot be populated from the workboard without inferring order.
- `schedulerPermission` is `NOT_SELECTED` for all 4,347. By `mutationClass`: DDL 239, DB_WRITE 498, GRAPHIFY_RUN 194, PROJECTION_WRITE 311, CACHE_WRITE 258 (**1,500 state-changing**), CODE_ONLY 1,781, LOCAL_ARTIFACT 552, READ_ONLY 514. The tickets created by `populate-kanban-from-openspec-workboard-v1.mjs` carry neither field (the table has no column; only `permissionMode: proposal_only` is in the `ticket_created` payload), and the claim path does not consult the workboard. Claiming only happens via the admin route or the ACP tool (no automatic loop; audit shows 0 agent/Hermes callers and no proven claim/heartbeat/reclaim), but an auto-mode worker would see all 4,347 as claimable.

**Not yet decided**: whether `priority` alone is an acceptable stopgap ordering key.

- [ ] AFC-SCHED-13 Register one named owner for work-queue priority in `runtime-ownership-registry.json` and build `PriorityScoreV1` in `scripts/atlas/lib/` first (reuse the recency-decay form); advisory only.
- [ ] AFC-SCHED-14 Claim gate: before any autonomous claim, resolve the ticket's `stableKey` to the workboard row and refuse unless `schedulerPermission` is SELECTED and `mutationClass` is allowed for the caller; fail closed, report BLOCKED. Do not enable auto mode before this exists.
- [ ] AFC-SCHED-15 Dependency edges: only declared dependencies may become `kanban_task_dependencies` rows. Order inferred from section numbering is a proposal for review, never written as an edge. Add `Depends:` metadata to high-fan-out changes first.
- [ ] AFC-SCHED-16 Relevance metrics for any learned ranker (MLP over a low-rank/SVD feature matrix, unsupervised clustering): tie-aware recall@k and nDCG@k against a REVIEWED gold set (floor 200 rows and 30 per class, as for the domain classifier); calibration (ECE) for any score used as a threshold; agreement with weak labels is a diagnostic, not accuracy. A learned ranker must beat the rule-based `PriorityScoreV1` and the serial CPU reference before it is a challenger. An RNN is not justified: the feature input is tabular (cuDF JSON batch -> feature matrix), and `kanban_task_attempts` has 0 rows, so there is no sequence signal yet.

### Summary-priority feature matrix and helper tool (2026-11-01; draft, advisory)

Built `scripts/atlas/build-summary-priority-matrix-v1.mjs` (read-only; raw F32LE + u8 mask + ids + checksummed descriptor, same conventions as `build-candidate-feature-matrix-v1.mjs`) and the read-only TRACE tool `atlas.summary_priority_matrix_describe` (`src/mcp/trace-mcp-server.ts`, copies the `atlas.packet_summary_census` registration pattern). The e2e check has a `helpers` stage. Latest run: **234,159 x 5**, raw files verify against their sha256.

| Column id | Name | Observed | Source |
|---|---|---|---|
| SPM_001 | log1p_content_chars | 100% | `content` length |
| SPM_002 | log1p_ast_symbol_count | 100% | `ast_symbols` array length |
| SPM_003 | file_authority_ga | **3.12%** | atlas index, exact `relative_path` join |
| SPM_004 | log1p_age_days_since_enriched | **0%** | `enriched_at` (1,155 rows in the whole table, none eligible) |
| SPM_005 | log1p_file_hits_168h | **0%** | atlas index; `chunk_hit_log` has 32 rows, all 2026-04-20 |

Column ids are append-only. Token remapping is a later stage (it follows the retrieval/recommendation audit); the descriptor reserves SPM_006 `token_count_exact` and SPM_007 `token_budget_fraction_of_admitted_input` and records `tokenRemap: NOT_COMPUTED` because `codebase_chunk_index.token_count` has **0 populated rows**.

**Corrected projection (chunk-size mix now measured)**: content length is p50 800, p90 800, p99 1,694 chars, so the "small" benchmark (about 0.96 s) is representative. 234,159 chunks take about **62-65 h** of continuous single-slot GPU time, not the 91-136 h upper range recorded in the AFC-SCHED-01 findings.

**Have vs missing**

| Area | Have | Missing |
|---|---|---|
| Matrix contract | Candidate matrix builder (6 file-level columns, 15 candidates), column-coverage audit (15,732 qualified rows), 16-column XGBoost retrieval schema (`ceac9232115d6e9a`), new chunk-level draft (5 columns) | Revision-qualified chunk cohort (chunks carry no source/workspace revision); a signal-bearing column set |
| Signals | Content length, AST symbol count, file authority (4,124 files) | Chunk PageRank (0 rows), community (0), enrichment age (none eligible), hit demand (32 stale rows), `token_count` (0), embedding validity guard, dependency edges (2 in the workboard), reviewed gold set |
| Tools (TRACE) | 204 tools incl. `turbovec.rank_chunks`, `search.rerank`, `karpathy.attention_rank_files`, `atlas.packet_summary_census`, `analysis.indexed_source_batch`, new matrix describe | `summary.rank_queue`, `nlp.extract_batch`, bounded multi-hop; ACP registration and `validate_tool_call` contracts for the new tool |
| Safety | Read-only builders, checksums, DRAFT_NOT_CANONICAL flag | Claim gate (AFC-SCHED-14); owner registration (AFC-SCHED-13) |

- [x] AFC-SCHED-17 Draft chunk-level summary-priority feature matrix + describe tool + e2e `helpers` stage (done 2026-11-01).
- [ ] AFC-SCHED-18 Populate `token_count` from the Ornith tokenizer (llama-server `/tokenize`), bounded and read-only first (report only); the write is a separate explicit authorization. Prerequisite for token remapping.
- [ ] AFC-SCHED-19 Embedding-validity guard (placeholder/duplicate-vector detection) before `content_embedding_768 IS NOT NULL` is trusted as an eligibility filter; `embedding_eligible` is true for only 52,416 rows and its meaning is unverified.
- [ ] AFC-SCHED-20 Register `atlas.summary_priority_matrix_describe` in `ACPToolRegistry` and add an `ops.validate_tool_call` contract for it (and for `kag.recall_similar_fix`).
- [ ] AFC-SCHED-21 Decide the real relevance signal: with SPM_003-005 empty, a ranker has only content length and AST count. Candidates: Postgres-side hit capture for chunks, graph_node_metrics PageRank per file, workboard priority per feature. Do not rank on length alone.

## End-to-end implementation plan: adaptive low-rank recommender, token-feature remapping, case intelligence (2026-11-01)

**Status**: CREATED (plan only). Extends this change; no peer owner, no new container. Existing owners to extend, not duplicate: `parent-atlas-pca-svd-representation-baseline`, `parent-atlas-repair-candidate-feature-matrix`, `parent-atlas-candidate-feature-execution-fabric`, `parent-atlas-compute-rank-cache-eval-dspy-gepa`, `parent-atlas-telemetry-lowrank-recommendation-okf-integration`, `parent-atlas-nlp-sidecar-feature-compiler`, `parent-atlas-gpu-compute-lanes-consolidation`.

**TL;DR**: The pipeline is data-starved, not framework-starved. We have the contracts, a draft matrix builder, a trained XGBoost reranker, a CPU/GPU split and a working tool surface. We lack the labels and signals that make any learned ranker meaningful (reviewed gold set, outcome receipts, token counts, hit demand, chunk revisions). So the order is: fix ground truth and signals, build a rule-based baseline with an evaluation harness, then low-rank features, then an adaptive MLP as a challenger, then tools and orchestration. Nothing here is promoted without its proof gate.

### Question 1: adaptive MLP low-rank recommender. Have vs missing

| Need | Have | Missing |
|---|---|---|
| Feature matrix | Draft chunk matrix `SPM_001..005` (234,159 rows); file-level candidate matrix (6 columns); XGBoost 16-column retrieval schema `ceac9232115d6e9a` | Signals for 3 of 5 columns; revision-qualified chunk cohort |
| Low-rank / SVD | `python/atlas_compute/low_rank.py` (experiment); cuML TruncatedSVD in WSL `atlas-rapids-cu13`; `parent-atlas-pca-svd-representation-baseline` | CPU-vs-GPU parity receipt; a chosen rank and a retained-variance rule |
| MLP trainer | PyTorch `2.8.0+cu128` on `py -3.13` (RTX 3060 Ti, sm_86); fail-closed `train_latent_autoencoder.py` pattern; `AtlasGemmaRankV1` experiment | A trainer for this task; `TRAINING_AUTHORITY_PROVEN` for it |
| Labels / relevance | Metric definitions (tie-aware recall@k, nDCG@k, ECE); reviewed-set floor (200 rows, 30 per class) | **Any reviewed gold set**; outcome receipts (`kanban_task_attempts` 0 rows; `chunk_hit_log` 32 stale rows) |
| "Adaptive" | `LearningOutcomeV1` / OaK / DSPy-GEPA shadow-mode plan | Sealed outcomes to learn from; shadow-mode harness |
| Baseline to beat | XGBoost reranker (model file Jun 24, `:8765`, 16 features) | A rule-based `PriorityScoreV1` and a serial CPU oracle |

### Question 2: token-feature remapping and tensor registry. Have vs missing

Token remapping is a later stage that follows the retrieval/recommendation audit (`docs/architecture/PARENT_ATLAS_RECOMMENDATION_AND_RETRIEVAL_POLICY.md`). Wire-format rule applies throughout: JSON/MessagePack describe, Arrow IPC or mmap carry bulk numbers, CUDA tensors compute; an ACE JSON packet carries references, never floats.

| Layer | Have | Missing |
|---|---|---|
| ACE packet | `AcePacketV3` descriptor builder (`packages/parent-atlas`), HyperRAG Packet RPC, bounded-descriptor rule | Token-feature descriptor fields (column ids, tensor refs, checksums) |
| Tensor registry | Matrix descriptor with checksums (`atlas.summary-priority-matrix.v1`); `TensorResidency` work in `parent-atlas-tensor-residency-integration` | `TensorRegistryV1`: named tensors with dtype, shape, device, residency, checksum, producer revision |
| Token counts | Ornith `/tokenize`; `PromptPlanV1` budget (65,536 context, 57,344 admitted input) | `codebase_chunk_index.token_count` is empty (0 rows) |
| Remap strategy | **Two diverging `TokenRemappingStrategy` copies exist**: `scripts/atlas/helpers/TokenRemappingStrategy.ts` (162 lines, 2026-07-23) and `sveltekit-frontend/src/lib/server/atlas/helpers/token-remapping-strategy.ts` (51 lines, 2026-10-09, `full`/`truncate`/`summarize`, one spec in `orchestration-helpers.spec.ts`). Both are context-budget remappers written for Gemma4, not feature-column remappers | One canonical owner; a budget strategy bound to the served Ornith budget and tokenizer revision; a separate column-level remap contract |
| Instruction sequences | Kernel DAG contracts (`KernelDagCandidate`, `agent-control-plane-v1.ts`); inverse-DAG TRACE tool | A procedure/sequence registry whose steps map to registered tools |
| IPC / fetch | Postgres truth, Valkey cache, Qdrant mirror, Arrow/mmap precedent, DuckDB offline reports | Arrow IPC path for the matrix; DAG-synthesis fetch contract |

### Tasks (E2E, ordered; each phase has a proof gate)

**Phase E0: ground truth and hygiene (no new features until done)**
- [x] AFC-E2E-01 (executed 2026-11-01, see "ClickHouse execution record" below) ClickHouse log retention: `docker-compose.yml:778` already mounts `docker/clickhouse/langfuse-config.d/log-retention.xml`, but the running `langfuse-clickhouse` container predates it (only the data and logs volumes are mounted). Recreate the container (operator action) so the config applies. The file removes the system log tables and keeps a 3-day `error_log` TTL (not 7 days). Measured 2026-11-01: system log tables hold **about 18.1 GiB** (`text_log` 7.6, `trace_log` 2.6, `asynchronous_metric_log` 1.7, `opentelemetry_span_log` 1.5, `processors_profile_log` 1.3, `query_log` 1.3, `metric_log` 1.1, `part_log` 1.0), oldest 2026-06-28. The config does not clean existing rows: dropping them is a separate, explicitly authorized step. These live in the Docker VHDX on C: (12 GiB free).
- [ ] AFC-E2E-02 Disk floor: after AFC-E2E-01 and the VHDX compaction procedure, re-measure free space on C: against the 50 GiB floor. Do not combine with artifact cleanup.
- [ ] AFC-E2E-03 Reconcile the Drizzle ledger (0 rows, 41 journal files, 56 applied sidecars) with the migration owner before any schema work. No baseline from name checks.
  - 2026-11-02 isolated read-only refresh: PostgreSQL 18.4 `legal_ai_db`; ledger 0 rows, 41/41 journal SQL files present, 114 sidecars / 56 labeled applied; no applied sidecar source missing and no required journal entry absent from the sidecar manifest. The parser finds one or more expected relations/indexes absent for 25 journal tags; this is an inventory signal only, not proof those migrations are unapplied or safe to replay. Receipt SHA-256 `6d2fd29abac2d303db39c4fe732af8d2e5ccecf0aaebd9cf3fb3a18a55f2bf07`, isolated under `%TEMP%\atlas-goal-refresh-969ca7783b7c4dde974876901052958a\DeedsWebApp\inventory\drizzle-history-readonly-latest.json`. PostgreSQL transaction was `BEGIN READ ONLY` / `ROLLBACK`; task remains open.
  - Owner-level refresh: `scripts/atlas/audit-atlas-migration-owners.mjs --output .tmp/atlas/migration-owner-goal-refresh-eea71e42186f4716b3702023ef0b7d54.json` reached the live catalog and intentionally exited 1 (`writes:false`). It confirms 8 journaled object groups absent, `graphify_file_search_projection` unapplied, 15 owner records history-unresolved, and `feature_registry_vectors` declaration-only. It classifies `atlas_svg_glyphs` as `LIVE_SHAPE_MISMATCH` (missing `updated_at`, `idx_svg_glyphs_source_ref`, and `idx_svg_glyphs_glyph_type`), correcting the earlier shape-aligned claim. Receipt SHA-256 `caf7d81b3637d41c5cc6bbf3808321910d73d403d8e9f89216d05ca84e2ce61f`. No DDL, schema, or row changes; do not repair from this audit alone.
- [ ] AFC-E2E-04 Repair the 8 legacy `kanban_tasks` rows that violate `KanbanTaskSchema` (1 empty `feature_id`, 1 lane `blocked`, 6 status `done`); explicit approval, pre-image, readback.
- [ ] AFC-E2E-05 Claim gate (AFC-SCHED-14) before any autonomous worker; 1,500 of 4,347 tickets are state-changing and `schedulerPermission` is NOT_SELECTED for all.
- [ ] AFC-E2E-06 Bounded cohort rule for LLM use: the kanban table (4,514 rows; one pasted estimate of about 1.2M tokens is unverified) is never loaded whole; selection is one change or one feature, top N by `PriorityScoreV1`, with a recorded cohort checksum.
- Gate E0: container recreated and logs bounded, free-disk floor met or recorded as BLOCKED, ledger owner decision recorded.

**Phase E1: identity and signals (read-only measurement first)**
- [ ] AFC-E2E-10 Chunk revision qualification: measure only. Writing `source_revision` is deferred until after Phase 20 (standing operator rule); no chunk revision write, backfill or propagation in this plan.
- [ ] AFC-E2E-11 = AFC-SCHED-18 tokenizer report (`token_count`), then AFC-SCHED-19 embedding-validity guard, in report-only mode.
- [ ] AFC-E2E-12 Hit-demand capture: find why `chunk_hit_log` has 32 rows (all 2026-04-20); verify the writer is wired to current retrieval. Fix only the producer; do not backfill.
- [ ] AFC-E2E-13 Per-file graph signal: join `graph_node_metrics` PageRank (not `atlas_graph_authority_scores_v2`) by exact path into a matrix column.
- Gate E1: every matrix column has an observed fraction and a named producer; dead columns are listed, not silently kept.

**Phase E2: baseline ranker and evaluation harness**
- [ ] AFC-E2E-20 = AFC-SCHED-13 (`PriorityScoreV1`, rule-based, serial CPU oracle, registered owner).
- [ ] AFC-E2E-21 Reviewed gold set for summary/recommendation relevance: sheet and rules like the domain review sheet; floor 200 rows and 30 per class; two reviewers on at least 10%; Tier A (revision-qualified) and Tier B (evaluation only) reported separately. This is the blocking human task for everything below.
- [ ] AFC-E2E-22 Eval harness: tie-aware recall@k and nDCG@k on the gold set, ECE for any thresholded score, per-class breakdown; agreement with weak labels is a diagnostic only.
- Gate E2: baseline metrics recorded; a challenger must beat them.

**Phase E3: tensor registry and token-feature remapping (after E1; follows the retrieval audit)**
- [ ] AFC-E2E-30 Audit `packages/parent-atlas/src/core/` and `packages/atlas-core/src/` for an existing tensor/residency registry before defining `TensorRegistryV1`; use a schema id distinct from `atlas.parameter-artifact.v1`; Zod/Pydantic parity enforced in the e2e check.
- [ ] AFC-E2E-31 `TensorRegistryV1` (descriptor JSON; bulk in Arrow IPC/mmap): name, dtype, shape, device, residency tier, checksum, producer revision. Registers matrix `X`/`mask`/`ids` first.
- [ ] AFC-E2E-32 Duplicate-owner reconciliation first: classify the two `TokenRemappingStrategy` copies (canonical vs duplicate, diff of 175 lines, importers: only the spec imports the frontend copy; none found for the scripts copy) and register one owner; archive, do not delete. Then bind the budget strategy to the served Ornith budget (65,536 context, 57,344 admitted input) and tokenizer revision from `/props`. Column-level remap is a separate contract named `FeatureColumnTensorRemapperV1` (not `TokenRemappingStrategy`): it appends `SPM_006+` and never edits `SPM_001..005`.
- [ ] AFC-E2E-33 ACE packet token-feature descriptor: references to registry entries and column ids only; a test fails any packet that inlines a float array.
- [ ] AFC-E2E-34 Procedure/sequence registry: map DAG steps to registered tools (ACP/TRACE), allowlist only, schema-validated arguments.
- Gate E3: packets round-trip with checksums verified; remap is reversible and revision-bound.

**Phase E4: low-rank features and the adaptive MLP (challenger only)**
- [ ] AFC-E2E-40 Extend `parent-atlas-pca-svd-representation-baseline`: CPU TruncatedSVD reference, then cuML GPU with a parity receipt (ordering, dimensions, checksums, tolerance); rank chosen by a stated retained-variance rule.
- [ ] AFC-E2E-41 NLP classification passes from the `:8095` sidecar (LangExtract grounded spans, spaCy, ast-grep) become feature columns through a bounded batch tool; outputs are evidence-only proposals and never mint identity; close the `miniforge.analyze` gap (`sourceRevision`, `workspaceRevision`, `treeNodeId`, `sourceNamespace`, `passes`, `groundedExtractionRequired`).
- [ ] AFC-E2E-42 PyTorch MLP reranker trainer over SVD features plus matrix columns: fail-closed until training authority is proven; GPU job under 1 GiB with `:8090` untouched, or CPU; seeded CPU-reference parity before any GPU result is used.
- [ ] AFC-E2E-43 "Adaptive": sealed `LearningOutcomeV1` receipts feed OaK / DSPy-GEPA in shadow mode only; no automatic weight promotion.
- [ ] AFC-E2E-44 DuckDB for offline evaluation and report joins over Arrow/Parquet exports; reports are non-blocking and never authoritative.
- Gate E4: the MLP beats both the rule baseline and the XGBoost reranker on the gold set with calibration within tolerance; otherwise it stays an experiment.

**Phase E5: MCP / ACP / A2A tools (read-only first)**
- [ ] AFC-E2E-50 TRACE tools, each with a Zod schema, an `ops.validate_tool_call` contract, ACP registration and an e2e stage: `summary.rank_queue` (dry-run), `nlp.extract_batch`, bounded multi-hop (extend `graph.expand_neighborhood`), token-remap preview, `atlas.summary_priority_matrix_describe` (built, AFC-SCHED-17).
- [ ] AFC-E2E-51 A2A skills in `/.well-known/agent.json` resolve to registered tools (5 skill ids currently match none).
- Gate E5: `check-e2e-contract-chain-v1.mjs` has no FAIL.

**Phase E6: DAG for ingestion, stateful graph for reasoning**
- [ ] AFC-E2E-60 Ingestion stays a deterministic DAG (retry, backfill, audit). Conversational reasoning that may retry retrieval, ask for clarification, compare evidence or return to a prior step uses a LangGraph stateful graph with checkpointing. They complement each other; no node writes to a datastore (durable changes go through the promotion queue).
- [ ] AFC-E2E-61 Replay, resume and permission-enforcement tests for the graph; negative security tests (prompt injection through source content).

### Case Workspace and Case Intelligence track (consumer; external design, not yet checked against this repo)

Two responsibilities. The Case Workspace owns upload, evidence inspection, notes, timelines, case-scoped chat history and citations; PostgreSQL 18 with Drizzle stays authoritative. The Case Intelligence Engine uses validated, case-scoped SQL tools, full-text search, EmbeddingGemma retrieval and later provenance-qualified graph reasoning. No generic SQL agent with access to the whole schema; no OpenSPG deployment before identity and lineage gates pass.

| Priority | Implementation | Proof required |
|---|---|---|
| P0 | Reconcile canonical evidence, case and Drizzle schema contracts | Live catalog comparison; zero unauthorized drift |
| P1 | Dedicated case assistant page | Case isolation, authorization, persistent threads |
| P2 | Unified media upload and viewer | Original-byte integrity, MIME safety, case linkage |
| P3 | Case-scoped SQL and full-text retrieval | Correct deterministic answers with citations |
| P4 | EmbeddingGemma + pgvector (canonical dense search; Qdrant is a rebuildable mirror) | Exact source and model revision lineage; recall tests |
| P5 | Neo4j / KAG-style multi-hop | Verified graph identities, grounded edges, contradiction evaluation |
| P6 | Stateful agent workflow | Replay, recovery, permission enforcement, negative security tests |

- [ ] AFC-E2E-70 Case-scoped evidence admission and retrieval contract shared by the upload page, evidence viewer and assistant (highest-value first step).
- [ ] AFC-E2E-71 The assistant must distinguish four outcomes and never collapse them: no matching evidence, index not ready, backend unavailable, access denied. A failed dense search must not silently become an empty result.
- [ ] AFC-E2E-72 Source content is evidence to analyze, never a privileged instruction channel; uploaded text cannot change tool permissions or prompts.

### Dependencies and order
E0 -> E1 -> E2 (gold set is the long pole) -> E3 and E4 in parallel where files do not overlap -> E5 -> E6. The case track (E2E-70..72) depends only on E0 and the P0 schema reconciliation. Writes to Postgres, Valkey, Qdrant or Neo4j stay serial and individually authorized.

## Review reconciliation: DAG-backed recommendation before adaptive learning (2026-11-01)

Two external review notes were reconciled against the repo. **Decision recorded: build the DAG-backed recommendation and execution-evidence system before the adaptive learning system.** The MLP recommends; the verified dependency engine admits; the fenced dispatcher executes; receipts prove completion. This reorders the earlier plan: a new Phase E1b (dispatcher and DAG proof) now gates Phase E4.

### Verified against the repo (read-only)

| Claim in the notes | Result |
|---|---|
| 4,514 task rows = 4,347 OpenSpec + 167 legacy | **Confirmed**: 4,347 rows with `feature_id LIKE 'openspec:%'` across 95 features, 167 others. The change from the earlier 167 is the `populate-kanban-from-openspec-workboard-v1.mjs` run (receipts in `.tmp/atlas/kanban-populate-receipt-v1-*.json`); no further bulk import is needed (dry-run reports `to create 0`) |
| 0 attempts, 0 dependency rows, runtime verdict NOT_PROVEN | Confirmed by `audit-kanban-runtime-ownership-v1.mjs` |
| 4,514 x 768 float32 is about 13.9 MB | Confirmed (13.87 MB): scoring the task cohort fits on the CPU; GPU is for the code/packet corpora and training experiments |
| ClickHouse retention config is "applied" via a patch to `docker/langfuse.yml` | **Partly wrong.** `docker/langfuse.yml:21` now has the mount, but the running `langfuse-clickhouse` container belongs to the root `docker-compose.yml` project (which already had the mount at line 778) and still mounts only its data and logs volumes. The patch cannot affect the running container; recreating it from the root compose file does |
| The pasted `TRUNCATE` command "reclaims the current ~18 GiB" | **Wrong.** It covers `query_log`, `trace_log`, `processors_profile_log`, `metric_log` = **6.31 of 18.13 GiB (35%)** and omits `text_log` (7.60 GiB), `asynchronous_metric_log` (1.68), `opentelemetry_span_log` (1.48) and `part_log` (1.03). It also uses `docker compose -f docker/langfuse.yml exec`, a different project from the running container |
| `AdaptiveLowRankReranker` and `python/atlas_compute/` head | Class does not exist yet. `packages/atlas-duckdb` exists (dist, queries) |
| Zero-copy `torch.from_dlpack(df.to_dlpack())` from the Windows toolchain | **Not possible across environments.** cuDF/cuML live in WSL2 `atlas-rapids-cu13` (torch `2.13.0+cu130` there); Windows PyTorch is `2.8.0+cu128`. DLPack zero-copy only works inside one process and CUDA context, so it applies in the WSL env, and only with `:8090` freed (about 0.35 GiB VRAM is free with Ornith up). The "import torch before cudf" invariant is unverified |
| `atlas.acp-kanban-error-task.v1` schema | Exists (`research_contracts.py`, `trace-mcp-server.ts`, and the script below) |

### Finding: existing script emits hardcoded evidence

`scripts/ops/verify-e2e-zod-pydantic-acp-kanban.mjs` (untracked, written by another session, referenced nowhere) builds its "DAG prefill" packet from **literals** (lines 233-240: `topoClass 'db_gateway'`, `graphAuthority 0.91`, `pagerank 0.82`, two error signatures, two prompt cards), not from tool output. Its `:8095 /extract` call sends `{relative_path, mode}` and gets **HTTP 422** (`text` required), so `sidecar8095` is null; its Postgres gate reports PASS while both anomaly probes say `table_missing`; its default `DATABASE_URL` is `127.0.0.1:5432/deeds_web_app` (the Windows-native server, not the app's `:5434` `legal_ai_db`). Under the agent-execution-integrity rules this is fabricated evidence and must not be cited as proof. It overlaps `check-e2e-contract-chain-v1.mjs` (different grain: that script is stage-based contract checks; this is a single-scenario flow).

### Tasks added or changed

- [ ] AFC-E2E-80 Owner decision for `verify-e2e-zod-pydantic-acp-kanban.mjs`: label it `FIXTURE_ONLY` (literals are acceptable only as an explicitly labeled fixture), or replace the literals with real `codebase.context_for_file` / `:8095 /analyze` output and fix the request body and database default. Archive, do not delete. Register one canonical owner for e2e contract verification (candidate: `check-e2e-contract-chain-v1.mjs`).
- [ ] AFC-E2E-81 Supersedes the commands in AFC-E2E-01 (steps only, nothing run): (1) recreate `langfuse-clickhouse` from the **root** `docker-compose.yml` project so the mount applies (the `profiles: ["full"]` service needs the matching profile); (2) with explicit authorization, truncate **all** large diagnostic tables (`text_log`, `trace_log`, `asynchronous_metric_log`, `opentelemetry_span_log`, `processors_profile_log`, `query_log`, `metric_log`, `part_log`) via `docker exec langfuse-clickhouse clickhouse-client` with credentials from the environment, never `docker compose -f docker/langfuse.yml`; (3) re-measure `system.parts` and free space on C:; (4) compact the Docker VHDX as a separate operator step. Keep the two compose files from drifting: record which one is canonical.
- [ ] AFC-E2E-82 **Phase E1b, dispatcher proof** in a disposable database: atomic claims, fencing tokens, lease expiry, heartbeat, reclaim, attempts, retries and idempotent completion under concurrent workers. Target 0 duplicate valid owners and 0 unsafe claims. Gates E4.
- **2026-11-01 implementation note (partial, not proof):** `claimKanbanTask` now includes an atomic SQL dependency fence: a child cannot be claimed while any declared parent is missing or not `(lane='done', status='completed')`. Its predicate is covered by the Kanban unit suite. The admin agent-cohort GET is read-only, requires `feature_id = openspec:<change>`, caps results at 5, and filters dependency-blocked rows; it explicitly returns `dispatchAllowed=false` / `BLOCKED_PERMISSION_AND_REVISION_PROOF`. Neither change authorizes autonomous claims. AFC-E2E-82, AFC-E2E-83, AFC-E2E-86 and AFC-SCHED-14 remain open pending disposable-DB concurrency/replay tests, explicit dependency metadata and task-ID reconciliation, and a real scheduler-permission/revision admission owner.
- [ ] AFC-E2E-83 **Phase E1b, dependency DAG**: extract only explicitly declared prerequisites (the workboard has 2 edges across 4,347 tasks); annotate AST/code-inferred edges separately as proposals; detect cycles; never auto-admit an uncertain edge; do not treat consecutive `tasks.md` lines as dependencies. Add `Depends:` metadata to the first approved change. Supersedes the plan item that would populate `kanban_task_dependencies` from `tasks.md` directly.
- [ ] AFC-E2E-84 Task-ID reconciliation map: `stableKey` is content-derived, so edited text yields a new ID. Record old-to-new mappings with explicit handling for duplicates, splits, merges and deletions; never silently orphan a ticket or claim.
- [ ] AFC-E2E-85 Namespace separation: `feature_id = openspec:<change>` is a planning identity, not a canonical feature-registry entry. Keep the namespace and store verified crosswalks in a separate table; never treat them as equal.
- [ ] AFC-E2E-86 Admission before ranking: implement `Eligible(t) = Dependencies(t) AND Ownership(t) AND RevisionValid(t) AND Permission(t)` as a hard gate; ineligible tasks get no execution rank regardless of any model score. Relevance fields stay separate, not one opaque number: goal similarity, dependency readiness, expected impact, evidence confidence, execution cost, failure risk, redundancy, freshness. A first deterministic baseline may use the proposed (untrained, unvalidated) weights 0.30 goal, 0.20 impact, 0.20 evidence, 0.15 freshness, 0.10 (1 - cost), 0.05 (1 - risk) for experiments only.
- [ ] AFC-E2E-87 Metrics and gates (proposed): retrieval Recall@20/@100 and MRR@10 against exact search; recommendation nDCG@5 and Precision@5 against the deterministic baseline on held-out judgments; compression recall loss, rank correlation, memory and p95 latency; dependency engine 0 cycles and 0 blocked-task claims; dispatcher 0 duplicate claims; verification 100% of completion receipts valid; efficiency tokens per verified completion. Labels are human judgments per goal plus verified completion utility; DONE vs PENDING is not a relevance label.
- [ ] AFC-E2E-88 Selection funnel and context budget: 4,514 candidates -> hard-eligible -> hybrid retrieval top 100 -> rerank top 20 -> cohort of 5 (illustrative limits, not observed). Each selected task fetches only revision-qualified spans, required dependency summaries and proof requirements, with per-section token budgets and explicit `CONTEXT_TRUNCATED` / `SOURCE_UNAVAILABLE` states.
- [ ] AFC-E2E-89 First autonomous canary milestone: one approved OpenSpec change, at most 5 dependency-verified tasks, strict patch-target allowlists, independent verification, operator authorization for any state-changing step. Schema migrations stay blocked while the Drizzle history owner is unresolved. Prerequisites: AFC-E2E-82, -83, -86, -14 (claim gate), and the `atlas.parameter-artifact.v1` collision resolved before cross-runtime ML or execution receipts are accepted as authoritative.

### Changes to earlier phases

- **Phase order is now** E0 -> E1 -> **E1b (AFC-E2E-82..86)** -> E2 -> E3 -> E4 -> E5 -> E6. E4 (SVD, adaptive MLP) starts only after E1b and E2 gold labels exist.
- **Defer** the GRU/RNN until verified attempt histories exist (`kanban_task_attempts` has 0 rows; the 4,507 event rows are not training examples). Use the deterministic state machine for scheduling; a GRU may later predict retry cost or failure risk, never dependency satisfaction.
- **Defer** the per-change cohort LoRA adapter: with 0 labels and 0 outcome receipts it adds a trainable surface with nothing to fit. Revisit after a base MLP beats the baseline.
- **SVD**: fit any projection on the training split only (no leakage); test 768 -> 256 and 768 -> 128 against the original embeddings; keep a saved projection artifact with source-model provenance; replace an existing lane (pgvector, TurboVec) only when measured accuracy and latency justify it.
- **GPU placement**: cuDF/cuML/cuVS jobs run in the WSL2 `atlas-rapids-cu13` environment after the "Prepare cuVS" task frees `:8090`; Windows PyTorch jobs stay under about 1 GiB. DLPack hand-off is intra-environment only.

### ClickHouse execution record (2026-11-01; operator-authorized)

Steps (1) and (2) of AFC-E2E-81 were executed; steps (3) and (4) are partly done.

| Step | Result |
|---|---|
| Pre-check | `docker compose --profile full config -q` valid; `default` database (Langfuse application data) = 12 tables, 601.84 MiB; langfuse-server healthy |
| (1) Recreate | `docker compose --profile full up -d --no-deps --force-recreate langfuse-clickhouse` from the repo root. Container healthy; `/etc/clickhouse-server/config.d/log-retention.xml` now mounted; same data and logs volumes; 12 application tables intact |
| (2) Truncate | `TRUNCATE TABLE IF EXISTS system.<t>` for `text_log`, `trace_log`, `asynchronous_metric_log`, `opentelemetry_span_log`, `processors_profile_log`, `query_log`, `metric_log`, `part_log` via `docker exec langfuse-clickhouse`. Only `system.*` diagnostic tables; nothing in `default` |
| (3) Re-measure | `system` database 18.13 GiB -> **24.05 MiB**; `default` 602.12 MiB (unchanged within growth); langfuse-server HTTP 200 on `:3030/api/public/health` |
| (4) Host disk | **C: free 11.5 GiB (was 12): not recovered.** The space is freed inside the Docker VHDX, which does not shrink by itself; reclaiming it needs the operator-run `wsl --shutdown` + elevated `diskpart compact vdisk` on `docker_data.vhdx` (Docker stopped). Not done |

Notes: the image layers re-pulled during the recreate (the service uses a digest-pinned image). The `docker/langfuse.yml` mount line added by another session is correct but the running container is governed by the root `docker-compose.yml`; keep both files in step or retire one (open under AFC-E2E-81).

### Runbook reconciliation: pasted six-gate ADR and operator commands (2026-11-01)

A pasted runbook proposed a six-gate decision record (AFC-GATE-01..06), ClickHouse commands, a schema-ID rename and a GPU proof script. It was reconciled against the repo; the decision is already recorded above, so **no second ADR block was appended** (it would have duplicated owners). Mapping:

| Pasted gate | Already tracked as |
|---|---|
| AFC-GATE-01 contract and storage | AFC-E2E-01 (done), AFC-E2E-81, AFC-E2E-90, AFC-E2E-32 |
| AFC-GATE-02 dependency DAG | AFC-E2E-83, AFC-E2E-84 |
| AFC-GATE-03 fenced dispatcher + claim gate | AFC-E2E-82, AFC-SCHED-14 |
| AFC-GATE-04 baseline + gold set | AFC-E2E-20..22, AFC-E2E-86, AFC-E2E-87 |
| AFC-GATE-05 tensor registry, SVD, MLP | AFC-E2E-30..33, AFC-E2E-40..42, AFC-E2E-92 |
| AFC-GATE-06 five-task canary | AFC-E2E-89 |

**Corrections to the pasted runbook**
- **ClickHouse**: already executed (see the execution record above) and covered 8 tables, not the 4-6 listed; the 18.1 GiB was freed inside the Docker VHDX, not on C: (11.5 GiB free), so the disk floor is **still unmet** and AFC-SCHED-08 still blocks.
- **Schema-ID rename**: the pasted regex targets `Literal["atlas.parameter-artifact.v1"] = ...`, which does not occur in the file, so it would have changed nothing. The rename had already been applied by another session (file modified 2026-11-01 12:33): `ResearchParameterArtifactV1` with id `atlas.research-parameter.v1`, a backward-compatible alias `ParameterArtifactV1 = ResearchParameterArtifactV1`, and new strict camelCase contracts `DagPrefillNodeV1` and `AcpKanbanErrorTaskV1`. `check-e2e-contract-chain-v1.mjs` was updated to read both ids: distinct ids pass, an identical id with different fields fails, unextractable stays NULL. Current e2e result: **0 FAIL, 0 NULL** (the previous single FAIL is resolved).
- **GPU proof script**: not saved as pasted. It feeds a zero tensor in place of the SVD basis and scores with a randomly initialised MLP (the numbers are meaningless, yet the receipt is named a challenger), and it uses a deprecated DataFrame DLPack call and a private pointer attribute. Replaced by `scripts/atlas/prove-rtx-dlpack-handoff-v1.py`, which proves only the zero-copy DLPack handoff (pointer equality plus a negative control), reports SVD and MLP as NOT_EXERCISED, and refuses to start below 1 GiB free VRAM. Not run on the GPU: Ornith holds the card (about 0.35 GiB free), so it needs the "Prepare cuVS KMeans" task first. `--check-only` (matrix checksum and shape, no GPU) passes.
- **Naming**: adopt `FeatureColumnTensorRemapperV1` for the column-to-tensor mapper; `TokenRemappingStrategy` stays the context-budget strategy (see AFC-E2E-32).

**Graphify currentness warning explained** (the Stop hook is in `.claude/settings.json`; it reads `docs/reports/graphify-daily-lifecycle-v1.json`)

| Clock | Value | What it actually is |
|---|---|---|
| Stop-hook receipt | completed 2026-10-26T03:25Z, about 9,700 min (6.7 days) | Gate `GRAPHIFY-SNAPSHOT-NATIVE-OPEN-01`, status `SNAPSHOT_NATIVE_EXECUTION_COMPLETED`: 30,327 source files in the snapshot, 30,105 selected, 30,105 membership-v2 rows; `projectionsWritten: false`, `canonicalAuthority: false`. A snapshot-open, not a projection |
| Daily-cycle stamp | 2026-10-31 13:52 (about 31 h) | Written when Karpathy enrichment passes even if Graphify was BLOCKED; it does not mean Graphify completed |
| `graphify_runs` table | latest COMPLETED 2026-09-15 (13 rows; older mechanism) | Legacy run history |
| Admission | `atlas-canonical-projection-fabric-audit-2026-10-31.json`: **NOT_SAFE_TO_PROJECT**, 10 of 11 predicates below PASS (IDENTITY_ALIGNED and REVISION_QUALIFIED NOT_PROVEN) | The gate that matters |

None of the three clocks establishes that the snapshot is current, admitted or safe to project; the hook warns on age only and says nothing about the admission verdict.

- [x] AFC-E2E-90 (done 2026-11-01: all four contracts now Literal[False]; contract tests 6/6 pass in the langgraph image via a pytest stand-in; the stale fixture input_checksum was changed to a 64-hex digest and two negative tests added) Pin the Python authority flags: `WebSearchEnvelopeV1` still types `canonical_authority` and `writes_performed` as plain `bool` (the e2e check WARNs on 2 flags); change to `Literal[False]` as the other contracts do, and run `docker/langgraph-synthesis/test_research_contracts.py` in the image (pydantic is not installed in the host Python, so the test has not been run; it still imports the old name through the alias).
- [ ] AFC-E2E-91 Unify Graphify currentness: one check that reports receipt age, the cycle-stamp semantics and the latest admission verdict together, so a stale-but-complete snapshot-open is not mistaken for a current admitted projection. Update the Stop hook only after that check exists.
- [ ] AFC-E2E-92 Run `prove-rtx-dlpack-handoff-v1.py` in the WSL RAPIDS environment after freeing `:8090` (operator step, check `/slots` idle first); restore the Ornith vision server afterwards. Record the receipt; SVD and MLP stay NOT_EXERCISED until a gold set exists.

### Adapter registry and ACE-packet binding (2026-11-01; planning, nothing built)

Question: can `adapter_config.json` be related to ACE packets, a function-strategy guide, DAG synthesis, agentic search recommendations and autocomplete? Answer: partly. `adapter_config.json` is PEFT metadata about weights (base model, rank, alpha, target modules, task type). It can anchor an adapter registry entry that packets and prompt plans reference as provenance. It is not a function-strategy guide; that is the procedure/tool registry (AFC-E2E-34).

Measured state: `vendor/models/lora/gemma4-legal-grpo/` (170 MB, 2026-04-04) and `gemma4-legal-text/` (147 MB, 2026-04-05) contain only `adapter_model.safetensors`, with **no `adapter_config.json`**. The served model is `ornith-1.5-9b`; the adapters are named for Gemma4, so base-model compatibility is unproven. `GET :8090/lora-adapters` returns `[]` (no adapter loaded). `scripts/launch-turboquant.ps1` can inject a GGUF adapter via `LEGAL_LORA_PATH` / `--lora-scaled` but deliberately skips safetensors adapters. No adapter registry exists in code (one test fixture carries `adapter_id: null`), and the ACE packet builder carries no model or adapter binding fields.

- [ ] AFC-E2E-93 `AdapterRegistryEntryV1` (schema id distinct from existing ids; Zod/Pydantic parity in the e2e check): `adapterId` = sha256 of the weights file, format, base-model binding (served alias, GGUF sha256, tokenizer revision), PEFT fields read from `adapter_config.json`, training-run provenance (dataset checksums, script revision), evaluation-receipt ref, scale, status (`CHALLENGER_ONLY` until promoted), `canonicalAuthority:false`. The two existing adapters cannot be registered until their missing config and training provenance are recovered from the run that produced them; do not infer rank or base model from file size.
- [ ] AFC-E2E-94 Compatibility proof, operator-gated: base-model match, safetensors-to-GGUF conversion, canary load through the existing `LEGAL_LORA_PATH` path with `/lora-adapters` readback and an idle-slot check. Changing `:8090` interrupts chat and synthesis, so it needs explicit authorization.
- [ ] AFC-E2E-95 Binding: ACE packets, `PromptPlanV1` and cache identities carry an `adapterRef` (id and checksum), never weights. The prompt-cache/KV identity must include the adapter id, otherwise cached context leaks across adapters. BitFrost/Valkey never stores adapter state (AGENTS.md rule).
- [ ] AFC-E2E-96 Promotion gate: held-out evaluation on the reviewed gold set (AFC-E2E-21), replay evidence, rollback metadata and an explicit promotion receipt before an adapter influences recommendations or autocomplete. An adapter shapes style and behavior; it never supplies facts or authorization. Search, recommendation and autocomplete routing stays registry- and evidence-driven, with the adapter id recorded as provenance only.

## Canonical dense search: PostgreSQL 18 + pgvector, not Qdrant (operator decision, 2026-11-01)

**Decision**: PostgreSQL 18 (async I/O, bitmap scans, JSONB) with pgvector is the canonical dense-search layer. Qdrant is a rebuildable mirror and challenger; TurboVec is a challenger. Wherever earlier text in this change says dense retrieval, vector search or "pgvector/Qdrant", read it as pgvector first, with Qdrant optional and never an authority or a hard dependency. This matches the standing rule (Postgres is truth; Qdrant/Redis/Neo4j are mirrors).

**Measured on the live server (read-only, 2026-11-01)**: PostgreSQL 18.4; pgvector 0.8.3; pg_search 0.25.1; `io_method=worker`, `io_workers=3`, `io_combine_limit=16`, `effective_io_concurrency=16`, `maintenance_io_concurrency=16`; `enable_bitmapscan=on`; `max_parallel_workers_per_gather=2`; `shared_buffers` 128 MB; `work_mem` 4 MB. The canonical HNSW is `codebase_chunk_index_content_hnsw` (halfvec 768, cosine); tie-aware recall 0.984 at `ef_search` 100, p50 about 48 ms (frozen 1,000-query set, from the project notes). AIO and bitmap scans are planner behavior, not an application abstraction: nothing may depend on a particular scan type for correctness, and performance claims must carry `EXPLAIN (ANALYZE, BUFFERS, SETTINGS)`.

**Function registry for agentic dense search: what exists**
- Builders already live in `scripts/atlas/`: `build-mcp-tool-manifest-packets.mjs` (887 lines; per-tool packets, Postgres first via `INSERT INTO atlas_packets ... summary, payload jsonb, source_kind`, then optional Qdrant/Neo4j with `--no-qdrant`), `build-mcp-tool-registry-index.mjs` (markdown index), `runtime-mcp-tool-selector.mjs` (query to top-K tools). Extend these; do not add a second registry builder.
- **Measured: the registry was never ingested.** `atlas_packets` has 0 rows with `source_kind='tool_manifest'`, and Qdrant has no tool-manifest points, so the selector falls back to the static registry. The selector currently reads the Qdrant mirror (`codebase_chunks_768` filtered to `source_kind='tool_manifest'`), which is the dependency this decision removes.
- `atlas_packets.embedding` is a legacy column (all NULL, deprecated), so tool vectors need a canonical pgvector home. Postgres already has registry-style tables to evaluate first: `atlas_vector_registry`, `registry_embedding_identity`, `registry_enrichment_projection`, `atlas_schema_registry`, `proposed_tool_calls`.

- [ ] AFC-E2E-97 Choose the pgvector home for tool-manifest embeddings (audit the registry-style tables above against `codebase_chunk_index`; prefer an existing owner). Schema work follows the migration discipline: a `drizzle/manual/*.sql` file with a pre-image note, a rehearsal in a transaction ending in ROLLBACK, explicit approval, readback. The Drizzle ledger is still empty, so no schema change before the migration owner reconciles it.
- [ ] AFC-E2E-98 Repoint `runtime-mcp-tool-selector.mjs` to pgvector: a bitmap-friendly prefilter on kind/domain (B-tree/JSONB), then HNSW cosine over the 768-d EmbeddingGemma vectors, with the static registry as the fail-closed fallback. Qdrant may remain as a labeled optional mirror. Report distinct outcomes (no match, index not ready, backend unavailable), never a silent empty result.
- [ ] AFC-E2E-99 Extend `build-mcp-tool-manifest-packets.mjs` (dry-run first, `--no-qdrant` as the default) to emit function summaries for dense search and to include adapter registry entries (AFC-E2E-93) as provenance-only records. Postgres write only with explicit authorization, upsert on `packet_id`, then readback.
- [ ] AFC-E2E-100 `atlas.packet_dense_search` currently pairs a Postgres bitmap prefilter with a Qdrant dense rerank. Move the rerank to pgvector and compare tie-aware recall and latency against the Qdrant path on the frozen 1,000-query set before cutover; keep the Qdrant path as a challenger.
- [ ] AFC-E2E-101 Adapter provenance (correction to my earlier statement that no training code exists): `scripts/train_lora_adapter.py` (TRL SFTTrainer, QLoRA, tool-calling data; default base `/workspace/gemma3-12b-finetuned-fp16`, default alpha 16), `scripts/merge_lora_adapter.py`, `scripts/generate-qlora-datasets.mjs`, `scripts/generate-graphify-grpo-dataset.mjs`, and Unsloth notebooks `scripts/unsloth-training/Gemma4_Legal_2B_Export*.ipynb` all exist. Which of them produced `vendor/models/lora/gemma4-legal-{grpo,text}/adapter_model.safetensors` is **not proven**; candidates only. Do not fill `adapter_config.json` from these defaults.

### AFC-E2E-97 audit findings: pgvector home for tool-manifest embeddings (2026-11-01; read-only)

| Candidate | Finding | Verdict |
|---|---|---|
| `atlas_vector_registry` (4,480 rows) | Identity ledger: `packet_key`, `qdrant_point_id`, `content_hash`, `exported_arrow`; no vector column | Qdrant mapping ledger, not a vector home |
| `registry_embedding_identity` | `qdrant_point_id`, `qdrant_collection`; no vector column | Qdrant mapping ledger |
| `registry_enrichment_projection` (61,660 rows) | Lexical arrays (symbols, keywords, bm25_terms); no vectors | Lexical projection |
| `atlas_packet_registry` (61,718 rows) | Has `embedding_768d` and `latent_384d` vector columns and an index `idx_packet_embedding_cosine`, but **0 rows populated** in either column | Empty |
| `atlas_packets.embedding` | vector(768), **61,659 rows populated** (status `success`; 59 pending), no vector index. **A 5,000-row sample has only 798 distinct vectors**: heavy duplication, consistent with the known placeholder-vector writer | Contaminated; not trustworthy. The project note saying it is "ALL NULL" is stale |
| `codebase_chunk_index.content_embedding_768` | Canonical owner (274,428 populated, HNSW) but 48 indexes on the table (write-amplified), shaped for source chunks | Workable but couples a 200-row registry to the hottest table |

**Recommendation (pending approval)**: a small dedicated additive table, e.g. `atlas_tool_manifest_vectors_v1`: `tool_name` primary key, `embedding vector(768)`, embedding model and recipe revision, `content_hash`, tool-schema checksum, nullable `adapter_ref`, JSONB payload, `canonical=false` by CHECK (the pattern of the other additive `*_v1` tables). With about 200 tools a pgvector exact scan is fast enough that no ANN index is needed; a bitmap-friendly prefilter on kind/domain plus exact cosine keeps it simple and recall-perfect. Migration discipline applies: a `drizzle/manual/*.sql` file, a rehearsal inside a transaction ending in ROLLBACK, explicit approval, readback; the Drizzle ledger is still empty, so no apply before the migration owner reconciles it.

**New measurement for AFC-SCHED-19 (embedding-validity guard)**: duplicate detection is needed on `atlas_packets.embedding` too (798 distinct of 5,000 sampled), not only on the chunk table. Do not use that column for retrieval or ranking until it passes the guard.

- [ ] AFC-E2E-97 (audit done; decision pending) Approve the dedicated table above, or name another owner. Nothing was created.

### Svelte 5 template parsing: alignment review of the tree-sitter-svelte notes (2026-11-01; read-only probes)

| Claim in the review | Verified result |
|---|---|
| `scripts/atlas/lib/svelte-script-scope-v1.mjs` isolates `<script>` blocks and hands them to tree-sitter-typescript 0.23.2 with Svelte 5 runes recognized | **True** (file dated 2026-10-27; `package.json` pins `tree-sitter-typescript` 0.23.2; `FREE_IDENTIFIER` rune names are reclassified as `GLOBAL_OR_BUILTIN_CANDIDATE`). It returns `templateAnalyzed: false`, so the helper says outright that it analyzes no template markup |
| 2024 grammars give ERROR nodes for `{#snippet}` / `{@render}` / `onclick={...}` | **Not observed in the live sidecar.** `:8095 /ast/chunk` (engine `treesitter-chunker` 4.0.0, language `svelte`) parsed a sample with `$props()`, `{#snippet}`, `{#each}`, `{@render}` and `onclick={...}` as `syntax_status: CLEAN`, `root_has_error: false`, 0 error nodes, 0 missing nodes. The grammar version in the sidecar was not identified |
| Pulling the 2026 grammar fixes ast-grep rules on `.svelte` | **ast-grep 0.45.3 does not support Svelte at all** (`svelte is not supported!`). It would need a custom language registered via a compiled grammar; today `.svelte` structural queries must go through the `:8095` sidecar |
| Upstream 2026 grammar adds `snippet_statement` and `render_statement` | **Unverified** (external claim, not checked) |

**Real gap**: the sidecar parses Svelte 5 cleanly but chunks it coarsely. The sample produced 2 chunks: the script, and one `template` fragment covering a single line. `{#snippet row(...)}` definitions and `{@render row(...)}` calls are not individually addressable, and 171 of 955 `.svelte` files in `src/` (18%) use snippets or `{@render}`. The `:8095` result also reported `helperAnalysis: null`, so the script-scope helper is not part of that response.

- [ ] AFC-E2E-102 Add a corpus probe (script, read-only) that sends a bounded set of the 171 snippet-using files to `:8095 /ast/chunk` and records `syntax_status`, error and missing node counts per file, so the clean result is measured on real files and not one sample. Record the grammar version the sidecar loads.
- [ ] AFC-E2E-103 Template-level evidence: extend the existing `:8095` Svelte path (do not add a second parser) so `{#snippet}` definitions, `{@render}` calls and event-attribute expressions become addressable spans with exact byte ranges. Cross-reference component and snippet call edges only as proposals.
- [ ] AFC-E2E-104 Wire `svelte-script-scope-v1.mjs` results into the `:8095` response or document why it stays a client-side helper (check its importers first; the importer search timed out and is unverified). Keep the rune list in one place.

### AFC-E2E-102 result and registry log (2026-11-01)

`scripts/atlas/probe-svelte-snippet-corpus-v1.mjs` (read-only; receipt `.tmp/atlas/svelte-snippet-corpus-probe-v1.json`) probed **173** `.svelte` files that use `{#snippet}` or `{@render}` against `:8095 /ast/chunk` (engine `treesitter-chunker` 4.0.0, concurrency 2): 173 parsed, 0 failed requests, **152 clean, 21 `RECOVERED_WITH_ERRORS` (one ERROR node each, 12%)**. Isolation with small samples: `{@render children?.()}` (optional call) triggers the ERROR node; `{@render children()}`, `{#snippet}`, typed snippet parameters and `onclick={...}` parse clean. 20 of the 21 dirty files contain `{@render children?.()}`; the construct in the 21st is not yet identified. The earlier single-sample CLEAN result was not representative.

**Logged to the diagnostic registry** through the TRACE tool `diagnostics.record_analysis` (rehearsed with `dry_run=true`, then applied): run id `afc-e2e-102-svelte-render-optional-call-20261101`; 20 AST facts (analyzer `tree-sitter`, node kind `ERROR`; 21 submitted, one deduplicated on the tool's identity key), 1 DAG run, 1 proposed recommendation (rank 1, method `ast`, `canonicalAuthority:false`). A second rehearsal reported 0 new rows, so the entry is durable and idempotent. Tables: `diagnostic_dag_runs`, `diagnostic_recommendations` (plus the AST-facts table).

**Status corrections for the reports pasted into this session**: the ClickHouse container was recreated from the root compose file at 2026-11-01T21:16Z and now mounts the retention config; the eight log tables were truncated (system database 18.13 GiB to 24 MiB). The retention TTL in the file is 3 days (`error_log`), not 7. The "reconcile config first, do not truncate or restart" recommendation was overtaken by that operator-authorized action. Docker has 40 anonymous (64-hex) volumes, 36 of them unattached; owner mapping is still open and none may be pruned (they can hold Postgres, Qdrant or Neo4j data).

**Derived next steps**
- [ ] AFC-E2E-103a Handle the optional-call render form: determine which `tree-sitter-svelte` revision the sidecar loads and whether a newer one parses `{@render x?.()}`; until then treat the form as a known grammar gap, not a source error. Identify the construct behind the 21st dirty file.
- [ ] AFC-E2E-105 Anonymous-volume owner map (read-only): for each of the 40 volumes, record size, creating container or image label, whether any container (running or stopped) mounts it, and a keep/archive/unknown verdict. No prune, no delete; archive-not-delete applies.
  - **2026-11-02 read-only volume audit:** `scripts/ops/audit-docker-volume-ownership-readonly.ps1` inspected all 60 volumes and all containers returned by `docker ps --all`: 40 anonymous hash-named volumes, 6 anonymous volumes mounted by current/stopped containers, and 34 anonymous volumes with no observed mount. Docker-reported sizes were available for all 60; total `50,516,938,833` decimal bytes (~47.05 GiB), an Engine-reported size sum, not NTFS allocation or VHDX reclaimable space. Volume metadata does not record creator identity; mounted entries expose current container/image labels, but unattached volumes remain unattributed. Verdicts remain preserve/unknown; no archive or prune candidate is authorized. Receipt: `%TEMP%/atlas-volume-owner-verified-e7ac862bbaa942a0a9a1184e7db1d1ed.json`. A parser defect that dropped empty trailing Docker labels was fixed before this receipt; validated result has 0 collection errors. Keep task open until creator/backup ownership and content disposition are resolved.
- [ ] AFC-E2E-106 MCP gaps found while doing this work (each becomes a typed tool or a contract, never raw shell): (1) no read-only MCP wrapper for `:8095 /ast/chunk` (only `miniforge.health/analyze/extract`), so the probe called the sidecar over HTTP directly; (2) no read-back tool for the diagnostic registry (`diagnostics.record_observations` and `record_analysis` only write), so persistence was proven by a second rehearsal and a direct catalog query; (3) `ops.validate_tool_call` returns `TOOL_CONTRACT_UNKNOWN` for `diagnostics.record_analysis`, so the writer has no registered contract; (4) the writer takes no operator token and returns no row ids or checksum to cite; (5) the new `AFC-E2E-*` tasks live only in this `tasks.md`, so the registry run is not linked to a kanban ticket (the kanban tickets come from the 2026-10-26 workboard snapshot; regenerate the workboard to include them).
- [x] AFC-E2E-107 Add a read-only, cohort-bounded `atlas.kanban_dag_snapshot` MCP tool and an `atlas-tools` DAG-prefill algorithm recommender. Use Kanban task rows and explicit same-cohort dependency edges; validate cycles, external prerequisites, truncation, statuses, and source refs; emit a deterministic proposal with snapshot hash, ready task IDs and refs; no writes, claims, dispatch, learned scores, or canonical authority.
  - Implementation evidence: focused Node MCP/selector tests pass 44/44; focused snapshot-reader Vitest suite previously passed 4/4. A current Vitest rerun was interrupted after waiting behind active dev servers, and scoped ESLint also did not complete. No full Svelte check or live TRACE tool invocation is claimed; those belong to AFC-E2E-108 / broader validation.
- [ ] AFC-E2E-108 Verify the new tools in the running TRACE/atlas-tools surfaces: discover both schemas, invoke a bounded OpenSpec cohort snapshot, validate DB identity/hash/rollback, and check the proposal output against the returned task/dependency rows. Do not restart an operator-owned MCP process without approval; do not mutate task rows.
  - 2026-11-01 read-only runtime discovery: TRACE `/health` returned HTTP 200, `ok:true`, `degraded:false`; an initialized Streamable HTTP handshake and `tools/list` returned 206 tools, but `atlas.kanban_dag_snapshot` was absent. A separately spawned local `atlas-tools` stdio process initialized and exposed 13 tools including `recommend_kanban_dag_prefill_algorithm`. Its downstream TRACE call was not invoked because the running TRACE surface has not loaded the required snapshot tool. Health probed service dependencies, but no cohort/task-row query or datastore write occurred. No service was restarted. Keep 108 open.
