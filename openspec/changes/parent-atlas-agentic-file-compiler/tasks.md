# Tasks

- [x] AFC-00 Audit current owners; preserve existing context/action/hypergraph contracts.
- [x] AFC-01 Add QueryClassificationV1 and FileMutationIntentV1 contracts.
- [x] AFC-02 Add CandidateFeatureRowV1 and ExactPromotionV1 contracts.
- [x] AFC-03 Add ContextManifestV1 contract view without a new table.
- [x] AFC-04 Add PromptPlanV1 and PrefillArtifactV1 contracts.
- [x] AFC-04A Bind PromptPlanV1 to the verified llama-server budget: 65,536-token physical context, 8,192-token output reserve, and 57,344-token maximum admitted input; over-budget plans fail closed. Live read-only proof: `scripts/atlas/prove-llama-context-capacity-v1.mjs` → `docs/reports/langgraph-llama-context-capacity-v1.json` (`LIVE_CONTEXT_CAPACITY_PROVEN`, one slot, `ornith-1.5-9b`). LangGraph remains orchestration-only and the plan carries references/checksums, not canonical evidence bytes.
- [ ] AFC-04B Wire the LangGraph synthesis adapter to the existing `ContextManifestV1`/`ContextManifestV2` → `PromptPlanV1` → shared Ornith llama-server resolver path; prove a bounded multi-turn execution without hidden-state persistence, ad-hoc prompt bypass, or datastore writes.
- [x] AFC-04B-01 Add the no-write Ornith PromptPlan adapter seam and fixture proof; it validates admitted segment checksums/budget, resolves the exact expected model via `/v1/models`, and sends only compiled plan messages. Full LangGraph graph wiring and live multi-turn proof remain part of AFC-04B.
- [x] AFC-04B-01A Verify endpoint selection against the live Ornith server: `/v1/completions` is reachable for plain prompts but returned a `<think>` marker even with `reasoning_effort: none` and `reasoning_format: none`; it is therefore not eligible for the canonical agent/tool path. Canonical synthesis remains `/v1/chat/completions` with the model Jinja template and per-request thinking disabled.
- [x] AFC-04B-02 Route the existing LangGraph synthesis node through the bounded Ornith adapter when a compiled prompt plan is supplied; fixture proof covers successful model discovery/generation and content-drift rejection before POST.
- [x] AFC-04B-03 Execute one bounded live adapter smoke against `http://127.0.0.1:8090`: `/v1/models` resolved `ornith-1.5-9b`, `/v1/chat/completions` returned `LIVE_ORNITH_ADAPTER_OK`, and the adapter receipt reported `modelCalls: 1`, `datastoreWrites: false`, `canonicalWrites: false`, and `hiddenStatePersisted: false`. This proves the adapter/service boundary only; the AFC-04B multi-turn LangGraph graph proof remains open.
- [x] AFC-04B-04 Repair the actual LangGraph worker import path by aligning the installed `@langchain/core` package with the existing lockfile resolution (`1.2.1`), which satisfies `@langchain/langgraph-checkpoint`'s `uuid6` requirement; runtime import now passes without changing the LangGraph source API.
- [x] AFC-04B-05 Prove a bounded two-turn LangGraph execution graph using only compiled PromptPlans: exactly two `/v1/models` + `/v1/chat/completions` pairs execute with deterministic controls, while content drift stops before any model request or second turn. The production worker graph's full multi-turn/checkpoint proof remains part of AFC-04B.
- [x] AFC-04B-06 Verify the compiled `PromptPlanV1.checksumSha256` against the existing Atlas canonical encoding before model discovery/generation; preserve `tokenizerRevision` and reject field tampering before any POST. Focused adapter, worker, and bounded-graph tests pass (8/8).
- [x] AFC-04B-07 Repair the existing Kanban LangGraph builder's typed node-edge construction so the installed LangGraph runtime can typecheck through the exported index; behavior and datastore ownership are unchanged.
- [x] AFC-04B-08 Separate the unused legacy block-reference planner from the canonical revisioned `atlas.prompt-plan.v1` wire contract; retain a deprecated builder alias, but emit `atlas.agentic-file-compiler.block-plan.v1` so unresolved block references cannot masquerade as executable PromptPlan evidence.

LangGraph runtime recheck (read-only, 2026-09-19): the installed StateGraph replay matched the
local adapter, and the failure/retry/cancellation/replay fixture passed with deterministic output.
Receipts: `docs/reports/langgraph-readonly-adapter-replay-v1.json` and
`docs/reports/langgraph-failure-retry-replay-v1.json`. These are process-local fixture proofs;
they do not close AFC-04B's production worker/checkpoint gate or authorize durable state.

Production wiring recheck (read-only, 2026-09-19):
`node scripts/tests/test-langgraph-wiring.mjs --langgraph http://127.0.0.1:8091`
confirmed the SvelteKit JSON synthesis proxy is reachable, but the direct LangGraph
service on `:8091` is unavailable and the SSE proxy run emitted no `complete` event
(`3` events, `0` chunks). AFC-04B remains open; no container was started and no
datastore/model state was changed.
- [x] AFC-05 Add DagNodePlanV1 and AtlasWorkflowSpecV1 contracts.
- [x] AFC-06 Add WorkflowActionEventV1 persistence envelope.
- [x] AFC-07 Add MastraWorkflowGraphV1 runtime-dialect contract.
- [x] AFC-08 Add FileMutationPlan/ValidationObservation/Receipt/Failure contracts.
- [x] AFC-09 Add GraphProjectionRequestV1 and SearchRuntimePolicyV1 contracts.
- [x] AFC-10 Wire query classifier to the live request front door. Evidence:
  `sveltekit-frontend/src/routes/api/search/hyperrag/+server.ts` classifies every validated
  request, compiles a retrieval plan only for revision-qualified requests, and applies its
  bounded candidate budget to SearchRuntime; `server.route.test.ts` proves both the control
  metadata and budget propagation. Exact promotion remains AFC-11.
- [x] AFC-10-01 Wire deterministic `QueryClassificationV1` observation into `/api/search/hyperrag` after request validation; return it as control metadata while preserving SearchRuntime as the retrieval/fusion owner. Route proof asserts the stable classification contract; full classification-to-retrieval-plan execution remains open.
- [x] AFC-10-02 Compile the existing `RetrievalPlanV1` only for revision-qualified HyperRAG requests, apply its bounded candidate budget to the SearchRuntime call, and return the plan as control metadata; unqualified requests remain plan-less rather than receiving a synthetic workspace revision.
- [ ] AFC-11 Wire exact promotion to the live retrieval owner.
- [ ] AFC-12 Extend existing context manifest persistence with revision/evidence refs through a migration only after compatibility proof.
- [x] AFC-13 Persist WorkflowActionEventV1 through the existing action/outbox writer. The compiler now converts supported lifecycle events through `workflowEventToCanonicalActionWriterRequest` and delegates to `writeCanonicalWorkflowActionAtomically`; compiler-only kinds fail closed. Adapter proof passes 5/5 and existing action/outbox writer proof passes 11/11. No live database write/readback was run in this tranche.
- [x] AFC-14 Install/verify a real Mastra runtime before replacing the current passthrough shim. The existing `@deeds/atlas-orchestrator` owner now pins `@mastra/core@1.71.0`, its PostgreSQL and Redis adapters, and an isolated LangChain/Deep Agents dependency set satisfying the Deep Agents peer ranges. A checksum-verified portable Node `v22.23.3` import smoke loads `Mastra`, `createDurableAgent`, `PostgresStore`, `WorkflowsPG`, `RedisServerCache`, `createDeepAgent`, LangChain `tool`, and LangGraph `StateGraph`; TypeScript check passes. The repo `.npmrc` disables workspaces, so install required explicit `--workspaces=true --workspace=@deeds/atlas-orchestrator --install-strategy=nested`. No agent was instantiated, no database connection or write occurred, and the SvelteKit shim was not replaced. See `docs/reports/mastra-deepagents-install-20260926.md`. AFC-15 restart/suspend parity remains open.
- [x] AFC-14B-01 Wire the authenticated SvelteKit Mastra route to accept only the existing `AceContextManifestAdmissionV1` + `PromptPlanV1` + checksum-bound segment content; revalidate manifest/plan checksums and packet-key/evidence membership, resolve the loaded model through the existing llama-server resolver, and execute with a request-scoped tool-free Mastra Agent. The route does not retrieve/build candidates, write stores, persist durable state, or accept an ad-hoc prompt. Fixture route and executor tests pass (6/6); package type-check passes. This is wiring/fixture proof only, not a live same-snapshot inference proof; immutable model artifact revision remains unavailable. See route `sveltekit-frontend/src/routes/api/atlas/mastra-agent/+server.ts` and executor `packages/atlas-orchestrator/src/models/prompt-plan-agent.ts`.
- [x] AFC-14B-01A Rehome the route fixture spec outside the reserved SvelteKit `+` route directory to `sveltekit-frontend/src/lib/server/atlas/mastra-agent-route.spec.ts`. Under PATH Node `v22.23.3`, the focused route suite passes 3/3 and the orchestrator import/typecheck smoke passes. The initial 8-GiB-heap check reported 36 errors / 291 warnings; the 2026-09-26 remediation rerun now reports 0 errors / 291 warnings across 100 files. AFC-17 remains open pending the required Tree-sitter and test-barrier proof. No live inference or datastore operation was performed. Details: `docs/reports/svelte-check-error-remediation-20260926.md`.
- [ ] AFC-14B-02 Prove one authenticated live request using an owner-produced packet-key CandidateOrdinal snapshot, admitted ContextManifestV2, and PromptPlanV1 through the Mastra route; preserve the exact loaded model ID and record immutable model-artifact provenance if the endpoint exposes it. No candidate selection or identity interpretation may move into Mastra. Until this receipt exists, application runtime execution is not live-proven.
- [ ] AFC-15 Prove suspend/resume restart parity using Mastra snapshots.
- [ ] AFC-16 Wire bounded filesystem mutation behind authorization and human-approval policy.
- [ ] AFC-17 Prove Tree-sitter/typecheck/test validation barrier. The pure barrier contract now
  has pass/fail, warning-admission, required-validator ordering, and deterministic replay tests
  (`validation-barrier.spec.ts`, 5/5); live repository Tree-sitter/typecheck/test execution is
  still required before this task can close. The app-wide typecheck subgate now passes with
  0 errors / 291 warnings across 100 files; the remaining Tree-sitter and required test-barrier
  gates are not yet proven.

Live barrier recheck (read-only, 2026-09-19): the structured-value runtime probe is ready with
`tree-sitter 0.25.1`, `tree-sitter-typescript 0.23.2`, `treesitter-chunker 4.0.0`, Python 3.13.5,
and `pyarrow 21.0.0`; the four barrier tests pass. The SvelteKit `typecheck:native` check at that
time exited with 62 TypeScript errors. This historical baseline is superseded by the fresh 2026-09-26
8-GiB-heap check below; it is retained as history, not current status.

The barrier contract was hardened to fail closed on duplicate validator observations; focused coverage
passes 5/5. Fresh 2026-09-26 verification is recorded in
`docs/reports/svelte-check-error-remediation-20260926.md`: the full frontend `npm run check` with
`NODE_OPTIONS=--max-old-space-size=8192` now reports 0 errors and 291 warnings across 100 files.
This closes the app-wide typecheck subgate only. AFC-17 remains OPEN pending Tree-sitter and full
required test-barrier execution. No model inference, canonical datastore mutation, or Graphify run
was performed.

Warning/barrier diagnosis (2026-09-26): machine census confirms 0 errors / 291 Svelte warnings
(233 accessibility, 58 unused CSS selectors). AFC-17's pure aggregator has no live runner callsite;
no repository Tree-sitter receipt or selected test-suite receipt is bound into a
`ValidationBarrierResultV1`. The current aggregator trusts caller-supplied validators/statuses and
does not bind PASS to exit codes/output evidence or warning-code/count admission. Keep AFC-17 OPEN
until these proof/contract gaps are closed; see `docs/reports/svelte-check-error-remediation-20260926.md`.
- [ ] AFC-18 Wire incremental AST/semantic_768/graph refresh and cache invalidation.
- [ ] AFC-19 Run CPU/GPU semantic executor parity and confirm one-vote-per-lane behavior.
- [ ] AFC-20 Retire the fake Mastra `defineWorkflow` shim only after AFC-14/AFC-15 pass.

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
- [ ] AFC-KW-02 Versioned vocabulary + normalization contract (case folding,
  Unicode normalization, camelCase/snake_case/kebab-case splitting, dot/path
  segmentation, package-name preservation) — separate revision domain from
  the classifier/taxonomy revisions already in use.
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
- [ ] AFC-PARAM-01 `ParameterBindingV1` resolution modes
  (`EXACT`/`DERIVED`/`DEFAULTED`), forbidding `DEFAULTED` for any identity/
  revision parameter (`canonicalId`, `packetKey`, `sourceRevision`,
  `workspaceRevision`, `symbolVersionId`, `candidateSnapshotRevision`,
  `ordinalMapChecksum`, `representationRevision`) — a planner may default
  `topK`/`timeoutMs`, never an identity or revision field.
- [ ] AFC-PLAN-01 Extend the existing (real, checked-off) `RetrievalPlanV1`
  with phased/cost-bounded scheduling (`RetrievalPlanPhaseV1`: cheap lexical
  → structural → expensive semantic/graph → extraction escalation, each
  phase with `continueWhen`/`minCandidates`/`minConfidence` stop conditions).
  This is additive to the existing lane list, not a replacement.
- [ ] AFC-CAND-01 `HelperCandidateV1` — common output normalization
  (`lane`, `canonicalId?`, `packetKey?`, `sourceRef`, `identityResolution:
  CANONICAL_ID|PACKET_KEY|SOURCE_REF|UNRESOLVED`) so multiple executors of
  one logical lane (Qdrant/cuVS/CAGRA under `semantic`) produce one vote per
  lane, not N — preserving this repo's existing "executor != retrieval lane"
  invariant (already documented in root CLAUDE.md's Duplication Prevention
  section).
- [ ] AFC-CACHE-01 Stage-specific, revision-qualified caches (classification /
  keywordRecognition / queryExpansion / helperEligibility / retrievalPlan),
  each keyed on its own upstream checksum + its own revision fields — so a
  service-availability change invalidates eligibility/plan without forcing
  keyword recognition to recompute.
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
- [ ] AFC-OWNER-04 Verify each helper's logical-fusion-lane mapping and one-vote behavior; rg -> rg and trigram -> lexical are verified, FTS is not shown in SearchRuntime, and dense four-executor fixture coverage is incomplete.
- [x] AFC-OWNER-05 Emit `docs/reports/afc-helper-owner-verification-v1.json` with evidence refs and no-promotion/no-write declarations.
- [ ] AFC-ROUTING-PROMOTE-01 Owner-verify helper entries, then promote the reviewed contract to stable paths; keep this separate from the implemented query-radix component.
- [ ] AFC-OWNER-MAP-01 Resolve remaining per-helper router-signal and logical-fusion-lane mappings, including whether helpers outside SearchRuntime are orchestration-only; do not invent `docs` or `graph` fusion lanes. Read-only owner audit is recorded, but mapping/promotion remains open.
- [x] AFC-OWNER-VERIFY-01 Complete the read-only 12-helper caller/owner census using statuses PROVEN / PROVEN_WITH_ADAPTER / BLOCKED / UNRESOLVED / NOT_A_FUSION_LANE; keep unknown signal and fusion mappings explicit.
- [x] AFC-LANE-VERIFY-01 Extract the actual SearchRuntime `Candidate.scoreSource` and `LogicalRetrievalLane` vocabulary from its owner; do not substitute the router matrix's legacy target labels.
- [x] AFC-LANE-PARITY-01 Fixture one revision-qualified canonical candidate from Qdrant, TurboVec, cuVS, and CAGRA; retain four executor IDs and prove exactly one dense contribution. Fixture proof only: no live cuVS/CAGRA executor or GPU call was made.
- [x] AFC-GRAPH-LANE-01 Determine graph-PPR fusion role only after a live dispatcher/caller exists; do not invent a `graph` fusion lane. Read-only caller census found query-time PPR in the Admin Atlas synthesis route as a graph-revision/seed-bound candidate ranking feature, not a SearchRuntime fusion lane. The ordinary SearchRuntime graph expansion is a separate post-fusion `graphExpanded` result. No live GPU call was made.
- [x] AFC-DOC-LANE-01 Keep docs search non-fusion/admin-only unless an actual SearchRuntime adapter and candidate contract are demonstrated. Owner trace: the admin-only `/api/admin/atlas/docs-corpus/search` route calls `searchDocCorpus`, which returns canonical Postgres FTS hits when admitted rows exist and otherwise a local lexical fallback; neither result path is adapted into SearchRuntime candidates or an RRF lane.
- [ ] AFC-LEXICAL-LANE-01 Reconcile router `lexical_exact` targets with SearchRuntime's separate `rg` and `lexical` lanes; establish whether FTS has a SearchRuntime adapter.
- [ ] AFC-RADIX-ACCEPT-01 Review QUERY-RADIX-01 acceptance semantics against required lookup behavior. Current implementation remains an opt-in, tested prototype: it only expands explicitly configured prefixes via `allowedExpansions`; it does not implement Patricia `prefix_match` longest-stored-key-prefix fallback. No live caller or approved vocabulary owner exists yet.
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
2. **`PERSISTENCE-DECISION-01`** (`parent-atlas-repair-candidate-feature-matrix/tasks.md`) — decide where V4 packets live (new table? `atlas_packets`? files-only?) before running `SEM-MATERIALIZE-01`'s full 16,151-row job (~32 min, sized and safe, just currently pointless without a destination).

**Ready to resume, not blocked:**
3. `AFC-KW-02` (full normalization: camelCase/snake_case/kebab-case splitting, dot/path segmentation, package-name preservation) remains open. QUERY-RADIX-01's implemented normalization is narrower and does not close this broader contract. `AFC-RADIX-LIVE-01` remains gated on approved vocabulary ownership and must stay shadow-only.
4. `AFC-PLAN-01` (phased/cost-bounded `RetrievalPlanV1` extension), `AFC-CAND-01` (`HelperCandidateV1` executor-vs-lane normalization), `AFC-CACHE-01` (stage-specific caches), `AFC-PARAM-01` (`ParameterBindingV1` EXACT/DERIVED/DEFAULTED) remain open; helper eligibility is still a review candidate, not a production caller input.
5. `SEM-INPUT-01`'s structural-selection coverage is ~79% by extension count (TS/JS/MTS/Markdown) — extending to `.py`/`.svelte`/`.sql`/config formats is real, bounded follow-on work, not blocked on anything.
6. `ORDINAL-VECTOR-01`/`ACE-V4-COMP-01` canaries (8/8 each) are ready to scale once `PERSISTENCE-DECISION-01` lands — same throughput numbers apply (~32 min at concurrency=4).

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
pipeline, not three independent gaps. **Not fully proven**: the exact
INSERT/UPDATE statement writing `tree_node_id` was not traced — that's the
single concrete next step if someone wants this end-to-end, not a new
open-ended task.

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
4. `PERSISTENCE-DECISION-01` (`parent-atlas-repair-candidate-feature-matrix/tasks.md`)
   — still blocks `SEM-MATERIALIZE-01`'s full 16,151-row run (sized, safe,
   ~32min, just has nowhere to write yet).

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
and its own AFC ledger updates (progress tracked there as "43/73" — a
tracker this session's own work did not use/see the source of). This
session's v1 receipts remain as historical evidence of the audit
methodology, not as the current status. Do not re-derive owner status from
the v1 files going forward — read v2 first.
