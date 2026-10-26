## 1. AR-01 — OAK client capability census + typed client

- [x] 1.1 Confirmed live capability of `:8095/oak/*` (health/lookup/search/traverse) — already
      done in `parent-atlas-ontology-oaklib-fanout-bitmap`'s tasks.md section 7; reused, not
      re-audited.
- [x] 1.2 Defined `OakResolutionEvidenceV1` contract (pure Zod, no I/O):
      `sveltekit-frontend/src/lib/server/atlas/agentic/contracts/oak-resolution-evidence-v1.ts`.
- [x] 1.3 Implemented the typed client:
      `sveltekit-frontend/src/lib/server/atlas/agentic/oak-resolution-evidence-client.ts` —
      bounded calls (`lookup`, `search`, `ancestors` via `/oak/traverse`), fail-closed to
      `RESOLUTION_UNAVAILABLE`, never synthesizes `concept:<raw-label>`.
- [x] 1.4 Unit-tested (mocked `fetch`) — reachable/resolved, unreachable/`RESOLUTION_UNAVAILABLE`,
      never-fabricates-on-error, `canonicalAuthority: false` always present.

## 2. AR-02 — Action/Workflow registry owner census

- [x] 2.1 Decided that the bounded 13-action registry remains code-defined for this change.
      Evidence: `scripts/atlas/audit-agentic-action-registry-owner-v1.mjs` and
      `docs/reports/agentic-action-registry-owner-v1.json`. PostgreSQL/BM25 is deferred until
      operator-managed action discovery, durable independent audit history, or a materially
      larger catalog is explicitly required. No migration, database write, or second owner was
      introduced.

## 3. AR-03 — AgenticActionV1 contract + seed registry

- [x] 3.1 Confirmed via grep no existing contract declares an action/tool vocabulary with
      `mutability`/`requiresHumanApproval` fields — genuinely new, not a duplicate.
- [x] 3.2 Defined `AgenticActionV1` contract:
      `sveltekit-frontend/src/lib/server/atlas/agentic/contracts/agentic-action-v1.ts`.
- [x] 3.3 Seeded a registry with the operator's example moves
      (`sveltekit-frontend/src/lib/server/atlas/agentic/agentic-action-registry-v1.ts`):
      `AST_EXPAND`, `RG_EXACT_SEARCH`, `BM25_SEARCH`, `SEMANTIC_SEARCH`, `OAK_RESOLVE`,
      `HYPERGRAPH_EXPAND`, `APPLY_SOURCE_PATCH`, `RUN_TYPECHECK`, `RUN_TESTS`,
      `AWAIT_OPERATOR`, `RETRY_WITH_MORE_CONTEXT`, `STOP_SUCCESS`, `STOP_BLOCKED`.
- [x] 3.4 Implemented lookup-by-id + filter-by-kind/mutability functions; unit-tested (13 seed
      actions present, mutation actions classified non-`READ_ONLY`, filter behavior verified).

## 4. AR-04 — HyperEdge action/member roles (NOT DONE)

- [x] 4.1 `AgenticHyperEdgeV1` uses a distinct additive contract with nullable `canonicalId` and
      per-member `resolutionState`; the existing canonical `HyperedgeV1` remains unchanged.
      Evidence: `sveltekit-frontend/src/lib/server/atlas/agentic/contracts/agentic-hyperedge-v1.ts`
      and focused tests prove unresolved members cannot claim canonical identity while resolved
      members require explicit canonical IDs and evidence.

## 5. AR-05 — bitencoded capability mask + CPU parity

- [x] 5.1 Added `agentic-capability-mask-v1.ts` with a deterministic 10-bit capability
      vocabulary aligned to the existing `AgenticActionKindV1` values. Encoding, decoding,
      membership, and invalid-input handling are pure and fail closed.
- [x] 5.2 Added focused CPU parity tests in `agentic-capability-mask-v1.spec.ts`. The mask is
      explicitly derived navigation metadata with `canonicalAuthority=false` and
      `writesPerformed=false`; no runtime route, datastore, or task-state mutation was added.
## 6. AR-06 — Go Retrieval → canonical candidate adapter (SUPERSEDED_BY_EXISTING_OWNER — see
      section 18.3: `query-classifier.ts` + `retrieval-plan.ts`, live in `/api/search/hyperrag`,
      already do this)
## 7. AR-07 — OAK evidence enrichment adapter

- [x] 7.1 Built `enrichQueryClassificationWithOakV1()`:
      `sveltekit-frontend/src/lib/server/atlas/agentic/oak-query-enrichment-v1.ts`. Takes an
      already-computed `QueryClassificationV1` (from the live `agentic-file-compiler/
      query-classifier.ts`), extracts distinct candidate labels from `domains`/`symbols`/
      `targetHints` (deduped, bounded by `maxLabels`, default 8), resolves each independently via
      AR-01's `resolveOakEvidenceV1()`. One label's failure never blocks the others (`Promise.all`
      over independently fail-closed calls, not a single all-or-nothing request).
      **Deliberately a standalone, additive module — not called from inside `classifyAtlasQuery`
      itself**, per last turn's finding: that function is synchronous and live on
      `/api/search/hyperrag/+server.ts`; forcing it async would be a breaking change to
      production code, not something to do as a drive-by edit.
- [x] 7.2 Unit-tested (mocked `fetch`) — 5/5 passing: resolves distinct labels independently,
      deduplicates across domains/symbols/targetHints, respects `maxLabels`, one failure doesn't
      block others, zero-candidate classification short-circuits without any fetch call.
- [x] 7.3 Wire the adapter into `/api/search/hyperrag/+server.ts` as an additive, fail-closed
      enrichment after synchronous classification. The route returns bounded `oakEvidence` while
      preserving SearchRuntime as retrieval/fusion owner; sidecar failure degrades to unavailable
      evidence and does not create canonical identity or writes. Focused adapter/client/route tests
      pass 17/17 (2026-09-19). No datastore or source mutation occurred.
## 8. AR-08 — HyperGraphRAG n-ary action expansion

- [x] 8.1 Added the pure `expandAgenticHyperEdgeV1()` projection. It consumes the AR-04
      action/member contract, uses only resolved canonical members, emits a bounded star fan-out,
      preserves evidence references, and explicitly excludes unresolved members. It cannot create
      canonical identity, add retrieval votes, or write graph state.
- [x] 8.2 Added focused tests for unresolved-member exclusion, deterministic ordinal ordering,
      bounded fan-out, and non-authoritative/read-only receipt flags.
## 9. AR-09 — CandidateFeatureMatrix action features

- [x] 9.1 Added `AgenticActionFeatureV1` as a derived sidecar keyed by the existing
      `candidateOrdinal`/`canonicalId`. It exposes the deterministic capability mask, action
      counts, approval count, feature revision, and evidence refs without creating a second
      CandidateFeatureMatrix owner or retrieval vote.
- [x] 9.2 Added focused tests for deterministic action ordering, capability-mask projection,
      evidence deduplication, and empty-candidate behavior. The sidecar remains
      `canonicalAuthority=false` and `writesPerformed=false`.
## 10. AR-10 — Tang low-rank recommendation challenger scaffold (CENSUS COMPLETE, REAL/LIVE —
      see also claude.md's "Correction: Ewin Tang recommendation" note)

- [x] 10.1 **Corrected an earlier same-session finding.** "Ewin Tang's recommendation algorithm
      doesn't exist anywhere in this repo" (recorded 2 turns ago) was based only on
      `rg "ewin tang"` returning zero hits — a literal-name search, not a mechanism search. The
      operator correctly flagged this: `git log --all --oneline` for
      `python/atlas_compute/low_rank.py` and `**/sample-query-matrix-v1.ts` returns real prior
      commits (`feat(atlas): add low-rank and Tang-inspired comparison receipts`,
      `feat(atlas): add sample query matrix and length squared sampler`,
      `feat(atlas): prove semantic low-rank parity lineage`,
      `Repair SampleQueryMatrixV1 merge corruption`), plus a whole branch
      (`agent/ast-xgb-tang-alignment-20260822`). Real, mechanism-named machinery
      (`SampleQueryMatrixV1`, squared-L2/length-square sampling) existed, gated
      `canonicalIdentityAuthority: false`/`retrievalVoteAdded: false` — exactly the challenger-
      only pattern this gate's own design already called for.
- [x] 10.2 **The "empty find" note in 10.2 (prior revision) was ITSELF WRONG — corrected same
      day.** Two `find`s for `*sample-query-matrix*`/`low_rank.py` had been reported empty; a
      direct `Read`/`git ls-files`/`git log -- <path>` check shows all three files exist on
      `main` right now: `python/atlas_compute/low_rank.py` (267 lines),
      `sveltekit-frontend/src/lib/server/atlas/sampling/sample-query-matrix-v1.ts` (58 lines),
      `sample-query-matrix-v1.spec.ts` (17 lines). The `find`s were run wrong, not the files
      absent.
- [x] 10.3 **`TANG-LOW-RANK-OWNER-CENSUS-01` — COMPLETE, run for real (2026-09-15).**
      - `literalNameHits`: 0 in current tree (name never appears in code, by design)
      - `mechanismHits`: the 3 current files above + the git-log commit trail from 10.1
      - `currentFiles` / `historicalFiles`: identical — present, tracked, no divergence
      - `currentCallers`: **real**. `recommendation-evidence-bundle-v1.ts:3` imports
        `SampleQueryMatrixV1Schema`, embeds as nullable `sample` field in
        `RecommendationEvidenceBundle`. `python/prove_atlas_compute.py:30` imports
        `compare_low_rank_recommendations` as a CLI proof-receipt generator (`--low-rank` flag).
        Neither is a retrieval hot path.
      - `tests`: real — `sample-query-matrix-v1.spec.ts`, 2 assertions (length-squared
        probability computation, row-L2 degeneracy detection)
      - `receipts`: `LowRankComparisonReceipt`/`CandidateShortlistReceipt` (Python,
        `canonical_authority: False`), `SamplingDecisionV1` (TS, `canonicalIdentityAuthority:
        false`, `retrievalVoteAdded: false`)
      - `productionCaller`: no — challenger/evidence-bundle-only
      - `canonicalAuthority` / `retrievalVoteAdded`: `false` everywhere, by design
      - **Verdict: real, current, tested, correctly classified as `EXPERIMENT`/challenger
        evidence. Do not build a second low-rank/length-squared-sampling module — this is the
        one, and it already declines canonical authority correctly.**
- [x] 10.4 **Separate finding: a stale, more-advanced unmerged branch exists — flagged, NOT
      merged.** `origin/agent/sample-query-matrix-ewintang-20260822` (fetched + diffed vs `main`,
      2026-09-15): NOT an ancestor of `main`, diverges heavily overall (~311KB whole-repo diff,
      dated 2026-08-22, predates ~3 weeks of unrelated `main` churn) — merging it wholesale would
      be reckless, not attempted. But its versions of these 3 files are a real, more mature
      evolution: revision/checksum-qualified (`workspaceRevision`, `sourceMatrixRevision`,
      `sourceMatrixChecksum`), integrates with the real canonical `candidateOrdinalMapV1Schema`
      (`features/canonical-candidate-v1.ts`, confirmed present on `main`), and adds a
      `samplingEvaluationV1Schema` (length-squared vs. uniform vs. top-k-row-norm recall
      measurement — `main` has no equivalent). It also **renames** fields
      (`canonicalIdentityAuthority`→`identityAuthority`, `retrievalVoteAdded`→
      `retrievalVoteProduced`, adds `canonicalWritesAttempted`/`producerRevision`) and
      restructures `rows` — a breaking contract change relative to `main`'s current shape, which
      `recommendation-evidence-bundle-v1.ts` already depends on by the old names. **Real
      architecture decision (port forward vs. leave superseded) — flagged for the operator, not
      resolved here.**
## 11. AR-11 — DSPy program/eval snapshot contract

- [x] 11.1 Added `OfflineProgramEvalSnapshotV1`, binding program/feature revisions, source
      revisions, input/output checksums, and explicit train/held-out splits. Duplicate examples
      fail closed; the snapshot is offline-only and non-authoritative.

## 12. AR-12 — GEPA offline optimization harness scaffold

- [x] 12.1 Added deterministic challenger ranking over held-out scores. The tournament is
      evidence-only, records deltas against a baseline, and always emits
      `promotionAuthorized=false` and `writesPerformed=false`; it does not perform online weight
      updates or alter task execution state.
## 13. AR-13 — Agentic DAG synthesis (PARTIAL; existing compiler remains owner)

- [x] 13.1 Added `synthesizeAgenticDagV1()` as a receipt wrapper around the existing
      `buildAtlasWorkflowSpec()`/`buildDagNode()` owner. It emits readiness metadata only and
      preserves the existing mutation-validator fail-closed rule.
- [x] 13.2 Added focused fixture tests. Live route wiring and execution remain separate gates.
## 14. AR-14 — ParameterResolver wiring (PARTIAL)

- [x] 14.1 Added a read-only `resolveParameterArtifactV1()` adapter over the existing
      `ParameterArtifactLookupV1` owner. It resolves exactly one proven match, returns
      `UNAVAILABLE` for no match, and fails closed with `AMBIGUOUS` for multiple matches. No
      artifact registration, download, cache write, or runtime wiring is claimed.
## 15. AR-15 — bounded repair-loop fixture (TS2345 deterministic fixture) (PARTIAL)

- [x] 15.1 Added a deterministic four-step TS2345 fixture using the existing registry:
      `RG_EXACT_SEARCH → OAK_RESOLVE → RUN_TYPECHECK → STOP_SUCCESS`.
- [x] 15.2 Added tests proving the fixture is read-only, bounded, fixture-only, and does not
      apply a source repair or claim canonical authority. Live tool execution remains separate.
## 16. AR-16 — ExecutionReceipt → HyperEdge projection (PARTIAL)

- [x] 16.1 Added a pure projection from the existing non-authoritative OAK execution receipt to
      `AgenticHyperEdgeV1`. Execution IDs remain evidence/member IDs; canonical IDs stay null and
      unresolved until an independent identity owner resolves them.
- [x] 16.2 Added tests for evidence preservation and rejection of authoritative receipts at this
      boundary. No graph, packet, source, or cache writes are performed.
## 17. AR-17 — ContextManifest/PromptPlan integration (PARTIALLY BUILT, DORMANT — see section
      18.3: `prompt-plan.ts` exists with zero live callers found outside its own directory)

### V2 bounded integration proof — 2026-09-21

- [x] Replayed the existing OAK evidence client/enrichment, HyperGraphRAG action
      expansion, derived action features, DAG synthesis, ParameterResolver,
      TS2345 repair fixture, and ExecutionReceipt→HyperEdge projection together
      through one focused read-only command. `npm run atlas:docs:agentic-repair:v2`
      passed 8 test files / 25 tests.
- [x] Receipt: `docs/reports/agentic-repair-fabric-v2-proof.json`.
      It records `canonicalAuthority=false`, `writesPerformed=false`,
      `promotionAuthorized=false`, `toolsExecuted=false`, and no source, database,
      cache, or graph writes.
- [ ] Live repair execution, live Go Retrieval adoption, live OAK availability,
      and ContextManifest/PromptPlan route adoption remain separate gates. The
      fixture proof must not be promoted to a production repair claim.
      **Read-only boundary probe (2026-10-01):** Go Retrieval `:8100/health` returned
      `healthy` / `READY_FULL` with PostgreSQL, Qdrant, and embedding service connected.
      OAK `:8095/oak/health` returned available in `READ_ONLY_SHADOW` mode with
      `canonicalAuthority=false`; a bounded `/oak/search` for `postgresql` returned
      zero matches. These establish service health only, not task/evidence resolution,
      route adoption, or repair execution. The existing `/api/atlas/mastra-agent`
      source route validates ContextManifest/PromptPlan bindings, but no live request
      or repair tool dispatch was performed. Keep this task open until independent
      route/readback receipts exist; no source, database, cache, graph, or checkbox
      mutation was performed for this probe.

### Live boundary reconciliation — 2026-09-21

- **OAK runtime:** live `:8095/health` and `/oak/health` are reachable. The OAK
  response reports `oaklib 0.7.4`, `adapterType=atlas-postgres`,
  `mode=READ_ONLY_SHADOW`, and `canonicalAuthority=false`. A bounded
  `/oak/search` for `TypeScript error` returned zero matches, so the remaining
  blocker is ontology population/fixture coverage, not client transport.
- **Go Retrieval runtime:** `/health` reports `READY_FULL`, and the bounded
  `/search/codebase` call succeeds. The current three-row identity audit reports
  packet/source/content-hash fields present, but `chunk_id` missing on `3/3`,
  `source_revision` missing on `3/3`, and one `semantic_768` row without
  `representation_revision`. These fields cannot be synthesized; Go Retrieval
  remains a read-only executor until the canonical source/chunk join supplies
  them. Receipt: `docs/reports/go-retrieval-identity-envelope-v1.json`.
- **Go implementation health:** `go test ./...` passes. The remaining issue is
  identity/lineage completeness in live results, not a Go service crash.

Items 5-17 above are recorded as explicit gates from the operator's own specification, not
attempted this pass. Each requires its own bounded design/implementation session — building them
without their prerequisite gates (especially AR-02's registry-owner decision and AR-04's
hyperedge-member-shape decision) would mean guessing architecture decisions the operator asked to
be made deliberately, not implied.

## 18. CRITICAL finding while running AR-01/AR-03's tests: a large, pre-existing
      `agentic-file-compiler/` directory was found, likely overlapping several later gates

- [x] 18.1 Running `vitest run src/lib/server/atlas/agentic` (to test AR-01/AR-03) picked up
      **23 test files, 65 passing tests**, almost all from
      `sveltekit-frontend/src/lib/server/atlas/agentic-file-compiler/` — a directory with **30+
      source files** not mentioned or found in any earlier audit this session:
      `query-classifier.ts`, `prompt-plan.ts`, `retrieval-plan.ts`, `mastra-workflow-compiler.ts`,
      `workflow-spec-builder.ts`, `mutation-approval-resolver.ts`, `exact-promotion.ts`,
      `governed-replay-admission-v1.ts`, `contracts.ts` (with a real `WorkflowActionEventV1`,
      `AtlasWorkflowSpecV1`), plus a canonical bridge to
      `@deeds/parent-atlas/core/workflow-action-event`.
- [x] 18.2 Checked the one directly-relevant overlap risk before finishing this pass:
      `contracts.ts`'s `WorkflowActionEventV1` has `actionId: z.string().min(1)` (an open string,
      no fixed catalog) and a `kind` enum that is a **lifecycle-status** vocabulary (scheduled/
      started/progress/blocked/retrying/completed/failed/...), not a **move-catalog** vocabulary
      like `AgenticActionV1`'s (AST_EXPAND/RG_EXACT_SEARCH/etc. with mutability/schema/approval).
      **Confirmed complementary, not duplicative** — `WorkflowActionEventV1` records that some
      action occurred and in what lifecycle state; `AgenticActionV1` (this pass) defines what
      actions legally exist and their mutability. No fix needed for AR-01/AR-03 specifically.
- [x] 18.3 **Follow-up audit completed (same day): confirmed which parts are live vs. dormant,
      not left as a vague "might overlap" flag.**
      - **`classifyAtlasQuery` (`query-classifier.ts`) + `buildRetrievalPlan` (`retrieval-plan.ts`)
        are LIVE** — real production caller confirmed: `src/routes/api/search/hyperrag/+server.ts`
        imports and calls both directly. **This means AR-06 ("Go Retrieval → canonical candidate
        adapter") is effectively already satisfied by this existing pipeline** — building a
        second adapter would be a direct duplicate, not a gap-fill. AR-06 is now reclassified
        `SUPERSEDED_BY_EXISTING_OWNER`, not `NOT_DONE`.
      - **`prompt-plan.ts`, `workflow-spec-builder.ts`, `mastra-workflow-compiler.ts` are built
        but NOT wired to any live HTTP route** — confirmed via `grep`: they're only referenced
        from within the directory itself (`index.ts` barrel, `invalidation-plan.ts`'s internal
        import), no external caller found. These partially satisfy AR-13 (DAG synthesis) and
        AR-17 (PromptPlan integration) in spirit, but as dormant code, same "well-built, not
        fully wired" pattern found repeatedly this session for other subsystems (OAK kernel,
        `OntologyLinkedTupleV1`, etc.).
      - **Found the natural AR-07 (OAK evidence enrichment) integration point, and why it wasn't
        wired this pass**: `QueryClassificationV1.domains` is populated by a tiny, hardcoded
        4-keyword regex check (`parent-atlas`/`cache`/`retrieval`/`workflow` — see
        `query-classifier.ts` lines ~43-47), unrelated to and much narrower than
        `atlas_domain_ontology`'s 17-concept vocabulary or the OAK kernel. It is a legitimately
        different, narrow purpose (retrieval-strategy routing hint, not a concept taxonomy) —
        not itself a duplicate needing reconciliation. But it IS where AR-07 would plug in.
        **Not wired this pass**: `classifyAtlasQuery` is fully synchronous (regex-only, no I/O);
        adding a real OAK/resolver call would force it async, a breaking change to a live,
        production hyperrag route with a caller (`+server.ts`) that currently calls it
        synchronously. Changing a live route's execution model is exactly the kind of action
        this session's evidence discipline says needs deliberate review, not a same-pass
        drive-by edit.
      - **Conclusion: do not touch `agentic-file-compiler/` further without a dedicated,
        carefully-scoped session** that (a) decides whether AR-07's OAK enrichment becomes an
        async post-classification step (not inside `classifyAtlasQuery` itself) and (b) decides
        whether to wire `prompt-plan.ts`/`mastra-workflow-compiler.ts` to a live caller or leave
        them for a future gate. Neither decision was made or acted on this pass.

## 19. NEXT STEPS (resume point — updated 2026-09-15, AR-07 adapter now built)

Current state in one line: **3/17 gates built and tested (AR-01, AR-03, AR-07's adapter), 1 gate
found already satisfied by existing live code (AR-06), 2 gates found partially built but dormant
(AR-13, AR-17), 11 gates genuinely untouched (AR-02, AR-04, AR-05, AR-08, AR-09, AR-10, AR-11,
AR-12, AR-14, AR-15, AR-16), plus 2 live-wiring decisions still open (AR-07's own adapter→route
wiring, and AR-13/17's dormant-code→route wiring).** Everything below is a real open decision, not
implied — pick up by asking the operator which to do first, don't guess.

**AR-07 status update: the adapter itself is now built and tested** (task 7.1/7.2,
`oak-query-enrichment-v1.ts`, 5/5 tests). What remains open is only the wiring decision:
1. Wire it into `/api/search/hyperrag/+server.ts` as a call AFTER `classifyAtlasQuery` returns
   (never inside it — that function must stay synchronous, it's live production code). Would call
   the now-built `enrichQueryClassificationWithOakV1()`
   (`sveltekit-frontend/src/lib/server/atlas/agentic/oak-query-enrichment-v1.ts`) on the
   classified query, producing `OakResolutionEvidenceV1[]` the route could optionally attach to
   its response — additive, not a replacement for the existing 4-keyword `domains` regex. Not
   done yet because touching a live production route's response shape needs explicit
   authorization, not a same-pass drive-by edit.
2. Decide whether to wire `prompt-plan.ts` + `mastra-workflow-compiler.ts` (AR-13/AR-17, built,
   tested, zero live callers) to an actual HTTP entry point, or leave them dormant until a
   specific caller needs them. This is an architecture decision for the operator, not something
   to infer.

**Untouched gates, in the order the operator's own spec implies dependency (do not start out of
order without a reason — e.g. AR-04 blocks AR-08, AR-11/12 block nothing else and can run
independently):**
- AR-02 — Postgres-vs-code-defined decision for the action registry (blocks nothing else
  immediately; `AGENTIC_ACTION_REGISTRY_V1_SEED` from AR-03 works fine code-defined for now).
- AR-04 — `AgenticHyperEdgeV1` shape decision (new contract vs. modifying `HyperedgeV1`) — blocks
  AR-08 (HyperGraphRAG n-ary action expansion).
- AR-05 — bitencoded capability mask + CPU parity proof — independent, can start anytime.
- AR-08 — HyperGraphRAG n-ary action expansion — blocked on AR-04.
- AR-09 — CandidateFeatureMatrix action features — likely depends on AR-05's bitmask shape.
- AR-10 — Tang low-rank recommendation challenger scaffold — independent research-adjacent gate;
  operator explicitly said no promotion without a CPU exact-scoring oracle comparison.
- AR-11/AR-12 — DSPy program contract + GEPA offline harness scaffold — independent of everything
  else; explicitly offline-only, never touches canonical identity.
- AR-14 — ParameterResolver wiring — depends on AR-09's feature-matrix shape existing first.
- AR-15 — bounded TS2345 repair-loop fixture — the integration test that exercises AR-01, AR-03,
  and whichever of AR-04/08/09/13 exist by the time it's attempted; natural gate to build once a
  handful of the others land, not first.
- AR-16 — ExecutionReceipt → HyperEdge projection — depends on AR-04's hyperedge shape decision.

**Do not, on resume:** re-run the `agentic-file-compiler/` audit (section 18 is complete and
current as of this commit); re-litigate the OAK-kernel-duplication correction (already resolved,
`parent-atlas-ontology-oaklib-fanout-bitmap` tasks.md section 7); re-implement AR-01 or AR-03
(done, tested, committed `03d08c3e95`).

## 20. AR-18 — Read-only replayable agent execution spine (CONTRACT FIXTURE ONLY)

- [x] 20.1 Resolve proposals through the existing `AGENTIC_ACTION_REGISTRY_V1_SEED` and ACE's
  admitted `ContextManifestV2`; the capability registry is a revision-qualified projection, not a
  second owner. Fixture evidence: `agent-execution-spine-v1.ts` and
  `agent-execution-spine-v1.spec.ts`.
- [x] 20.2 Bind one read-only executor call to a proposal checksum, policy authorization reference,
  exact tool revision, input/output checksums, and bounded observation; retain the existing
  `WorkflowActionEventV1` and `AgentWorkReceiptV1` owners for run/durable identity. The smoke emits
  only a non-authoritative step receipt; it does not write either durable owner.
- [x] 20.3 Prove a frozen one-step fixture and fail-closed cases with focused tests and an executable
  replay. Receipt: `docs/reports/agent-execution-spine-read-only-replay-v1.json`; the status is
  `READ_ONLY_REPLAY_PROVEN_FIXTURE_ONLY`. This does not establish production route/MCP/OpenCode
  wiring, live service health, or durable receipt readback; those remain separate gates.
- [x] 20.4 Keep RLM working state ephemeral/non-authoritative and keep source/database/cache/graph
  mutations, live MCP/OpenCode dispatch, production authorization, and replay-state persistence out
  of this tranche. Schema assertions, owner audit, smoke receipt, and fixture tests confirm no such
  writes or dispatch occurred.


## 15. AR-15 — ACE feature/proposal/outcome adapter and Kanban runtime ownership audit (2026-10-17)

Reviewed against the repo before building. Existing owners kept: `FeatureSignalAlignmentV1` (`packages/parent-atlas/src/core/feature-signal-alignment.ts`), `PromptPlanV1`/`ContextManifestV2` (AFC-04), `AceContextPacketV1` and `buildAceContextPacketV1` (NES-LUT sanitized, in `hermes-adaptive-pipeline-v1.ts`), AR-11 `OfflineProgramEvalSnapshotV1`, AR-12 GEPA challenger tournament, `python/parent_atlas_dspy_repair.py` (signatures, metric, optimizer builder, baseline-vs-optimized). The new code fills only the gaps and hands off to them.

- [x] 15.1 **ACE-FEATURE-01** CREATED. `scripts/atlas/ace_packet_proposal_v1.py`: positional tuples to canonical rows (sorted, duplicate-rejecting, missing values masked, never silently zero) to a payload accepted by the existing TS `featureSignalAlignmentSchema`. Evidence: 15/15 offline tests (`scripts/atlas/test_ace_packet_proposal_v1.py`) on Windows Python and on the WSL RAPIDS Python (torch 2.13: tensor bytes hash to the payload checksums); TS contract parses the payload and the TS `checksumFeatureSignalAlignment` equals the Python checksum.
- [x] 15.2 **ACE-PROMPT-01** CREATED (validator and DSPy signature only). `validate_ace_packet_proposal_v1` fails closed: exact field set, required revisions (never defaulted), evidence refs and packet key within the ContextManifest allowlist, manifest and alignment checksum match, `advisoryOnly`, hidden-state keys rejected recursively. `build_compose_program_v1` is a lazy DSPy `Predict`. DSPy 3.4.1 and GEPA 0.1.4 are installed only in `/home/james/.venvs/atlas-dspy-exp` (329 MB, no torch); `import dspy` does not load LiteLLM.
- [x] 15.3 **ACE-PROMPT-02** CREATED & TESTED (2026-10-18). Implemented `BifrostOrnithLM` in `scripts/atlas/ace_bifrost_lm_v1.py`: direct OpenAI-compatible chat completion caller to Bifrost (`:3040`, model id `openai/ornith-1.5-9b`), completely bypassing LiteLLM. 5/5 offline unit tests pass in `scripts/atlas/test_ace_bifrost_lm_v1.py`. Live smoke test against `:3040` returns `pong-bifrost-direct` in 1,069ms without loading LiteLLM.
- [ ] 15.4 **ACE-CONTEXT-01** PARTIAL (scope corrected 2026-10-18). `renderAceProposalContextAndPlanV1` has a tested contract path through `buildAceContextPacketV1` and `ContextManifestV2` -> `PromptPlanV1`, but no live producer-to-renderer-to-Bifrost caller has been demonstrated. Review found the renderer previously manufactured fallback evidence text, packet keys and confidence; it now requires explicit source-ref/packet-key/revision/content/checksum bindings, verifies revision and content checksum, and fails closed when bindings are missing. Its ACE packet uses confidence 0 and an advisory concept label. Focused Vitest suite passes 9/9. This is contract behavior only: caller identity binding, actual admitted evidence hydration, live Bifrost handoff/readback and synthesis outcome remain unproven. The separate zero-write view and procedural canary helper do not satisfy this task.
- [x] 15.5 **ACE-OUTCOME-01** CREATED (offline). Hash-chained `atlas.ace-outcome-receipt.v1`, `writesPerformed=false`, tamper and reorder detection tested. No persistence, no live caller.
- [x] 15.6 **KANBAN-RUNTIME-OWNERSHIP-01** audit CREATED, verdict **NOT_PROVEN**. `scripts/atlas/audit-kanban-runtime-ownership-v1.mjs` writes `docs/reports/kanban-runtime-ownership-v1.json` from verified evidence only (read-only).

- **Kanban population reconciliation (2026-10-18; fresh PostgreSQL READ ONLY transaction):** `public.kanban_tasks` contains 166 durable tasks (160 `pending`, 6 `done`), `kanban_task_events` contains 160 rows, and `kanban_task_dependencies` contains 0. This is distinct from `docs/reports/atlas/atlas-kanban-tasks.json`, which contains 13 `PROPOSED` diagnostic recommendations, and from the generated OpenSpec actionable-workboard snapshots (2,272 / 2,309 rows). These counts refer to different populations and must not be presented as deleted or interchangeable tasks. The daily proposal file is not the complete canonical task inventory; keep the live DB-backed board and diagnostic recommendations visibly separated, then reconcile their IDs/source lineage before claiming a unified board. Query used `BEGIN READ ONLY` and `ROLLBACK`; no database writes.

- **Cross-board/PostgreSQL source-index preflight (2026-10-18; read-only):** the OpenSpec evidence-fabric census found 132 changes (122 active), 13,731 task rows, 5,530 unchecked rows, and `promotionEligible=false` (`DIAGNOSTIC_ONLY_NOT_PROMOTABLE`). It found 7,762 missing task IDs, 440 ambiguous task identities, 13,578 duplicate declared-ID groups, and 153 duplicate derived keys. The generated actionable-workboard snapshot has 2,309 rows, but its task records have no `taskRef`, `sourceRef`, or canonical task key; its `changeId:number` IDs are a derived projection and are not safe import identities. Live PostgreSQL contains `kanban_tasks` (166 rows) but not `openspec_changes` or `openspec_tasks`; `kanban_tasks.source_refs` has no source-oriented index. The existing `openspec_tasks`/`task_ref` schema and identity-history migration are design-only and remain the intended OpenSpec owner—do not create a parallel task table or import 5,530 unchecked claims into the executable Kanban queue. Next gate: reconcile duplicate/derived identities, prove exact task-file source refs and workspace snapshot binding, then dry-run a bounded upsert into the existing OpenSpec ledger schema. `source_revision` remains deferred; never synthesize it. Evidence: `node scripts/atlas/audit-openspec-evidence-fabric-v1.mjs --check-only` and a PostgreSQL `BEGIN READ ONLY` schema/count probe; no database writes.

- **Correction / source index applied (2026-10-18):** the authorized objective was repository task discoverability, not canonical task admission. Applied the registered `manual/20261018_openspec_task_source_index_v1.sql` locator projection to PostgreSQL 18.4. Latest frozen workspace snapshot: `sha256:85550362bdd3d67d58dbdec218bfc34a3963989606710bacf49da1821890738d`; 5,582 open task locators read back with 5,582 distinct source refs and 0 invalid rows. Identity states are 3,001 `DECLARED_ID`, 2,391 `DERIVED_ID`, and 190 `AMBIGUOUS`; all ambiguous identities remain unpromoted. Canonical task promotions 0, executable Kanban writes 0, and independent PostgreSQL count confirms the separate durable Kanban remains 166 rows. Plan/importer validates the exact workspace snapshot, task block hashes, in-root paths, symlink escapes, and source refs. Focused importer tests: 4/4 pass. Latest readback receipt: `.tmp/atlas-daily-gate-20261018-continuation/source-index/apply-followup.json` (gitignored); migration registry remains the existing owner. `source_revision` remains intentionally deferred; this is a locator projection, not canonical task reconciliation or a unified Kanban queue.
- **Source-index freshness audit (2026-10-19; read-only):** live PostgreSQL 18.4 now contains later `COMPLETE` snapshots than the recorded `855503...` snapshot. The newest row is `sha256:3841be3f72d60a224aeaf1cb4d46adf8d988183ff65f6756bee079de9e7e303c`, created `2026-10-19 00:39:35 UTC`, with 5,582 rows, 5,582 distinct refs, and 0 missing refs. Twelve snapshots are present; counts range from 5,530 to 5,584. A search of `.tmp/` and `docs/reports/` found no receipt matching the newest snapshot ID. Therefore its row counts are live-verified, but its source manifest/checksum parity is NOT_VERIFIED; the earlier `855503...` receipt proves only that earlier snapshot. The Admin Atlas view selects by `created_at`, so the displayed current snapshot is not covered by the older receipt. Read-only transaction rolled back; no writes.
- **Source-index refresh and live UI validation (2026-10-19):** re-censused the current OpenSpec workspace (`13,869` task lines; `5,615` unchecked locators; `promotionEligible=false`) and dry-ran the bounded importer (`5,615` rows, `0` invalid). The registered locator-projection importer applied its expected snapshot transactionally, preserving ambiguous identities and performing `0` canonical promotions / `0` executable Kanban writes; the apply receipt with independent post-commit readback is under `.tmp/goal-continuation-20261019/source-index-apply-receipt.json`. Admin Atlas `/admin/atlas/task-sources` rendered `5,615` indexed rows and `5,615` results; searching `FI-ONTO-06` returned the exact source row. The view is read-only and explicitly not an executable Kanban queue. Because this ledger file is part of the source workspace manifest, run one final census/import refresh after this note before treating the displayed snapshot as current.
- **Refreshed source-index apply (2026-10-19):** after the prior note and receipt-verifier ledger update, generated a new diagnostic-only census (`13,876` tasks; `5,615` unchecked locators; `promotionEligible=false`) and dry-run (`5,615` rows, `0` invalid). Applied only the exact expected snapshot `sha256:d4d0c0cea71c0368f7a4d0e1078628f1a5bbb08e6bcb197df1feb9eaf7380a67` through the serializable bounded importer; it reported `SOURCE_INDEX_READBACK_PROVEN`, `5,615` post-commit rows and zero canonical/executable task promotions. Receipt: `.tmp/goal-continuation-20261019/current/source-index-apply.json`. This ledger note changes the workspace revision, so a final refresh must follow before treating that snapshot as current. Task identities remain locators/proposals only; ambiguous rows are preserved, not promoted.
- **Daily board responsive regression (2026-10-19):** the focused Playwright run found the 390px daily board's `.board-shell` at x=-11px because the mobile hub retained a negative margin. Removed that margin in `sveltekit-frontend/src/routes/(app)/admin/ai-dashboard/+page.svelte`; the 390px rerun passed. The full focused set had 3 passes and the one known mobile failure before the fix; Admin Atlas runtime-health and task-source interaction cases passed. Playwright global setup created and teardown removed its three test cases. This is UI-layout evidence, not Graphify promotion evidence.

- **Admin Atlas source-index view (2026-10-18):** added admin-only `/admin/atlas/task-sources`, using the existing Drizzle schema, PostgreSQL read-only queries, Bits UI v2 tabs, UnoCSS styling, snapshot metadata, identity-status filter, text/source-ref search, and 50-row pagination; linked it from `/admin/atlas`. Live Playwright run against Vite `:5173`: HTTP 200, page title and heading matched, 50 rows rendered, snapshot tab opened, search for `ACE-PROMPT-02` narrowed to one row, no page errors during interaction. Screenshot: `.tmp/parent-atlas-task-sources.png` (gitignored). `npm run check`: 0 errors, 10 pre-existing accessibility warnings in 8 other files. One initial full-page screenshot run emitted a transient `node.remove is not a function`; the subsequent interactive Playwright run reproduced no error. This view does not expose task mutation or imply canonical task identity.

- **Fresh :8095 helper deployment probe (2026-10-18):** `/health` returned `status=ok`, Tree-sitter/treesitter-chunker/ast-grep/NetworkX available, but `torch=false`, `nx_cugraph=false`, `cugraph=false`, `cuvs=false`; live `miniforge_nlp_sidecar_v2` digest `sha256:c4e447...` differs from this checkout. A bounded POST to `/ast/chunk?includeHelpers=true&includeTensorFeatures=true&maxHelperChunks=8` returned two valid Tree-sitter chunks with `diagnostics=[]` but `helperAnalysis` absent. Therefore local domain/key-value/procedural/PyTorch helper contracts are tested but not live-wired; no live GPU, tensor, or helper-analysis proof. Do not claim the runtime includes the local helper until deployment and readback match.

- **8095 `/ast/chunk` helpers (local code only; 2026-10-18):** added opt-in domain-routing proposal, typed key/value attributes, ordered procedural sequence links, and identity-aligned CPU PyTorch feature tensors. The helper does not create canonical identities, graph edges, database writes, or dispatchable routes; missing source refs and mismatched SHA-256 content remain blocked. Four helper contract tests were invoked in the WSL RAPIDS Python environment with CUDA disabled and passed; `py_compile` and `git diff --check` passed. The live `:8095` health/AST endpoint is healthy and Tree-sitter chunking works, but its module digests differ from the local edited files and its response ignores the helper query flags. Deployment/restart and a live helper response remain unproven; do not mark this production-ready until the sidecar is deployed and HTTP readback confirms `helperAnalysis`.

- **Correction / live helper deployment (2026-10-18):** the prior stale-process finding was resolved by restarting only Docker container `miniforge-nlp-sidecar` (no rebuild; `python/` is bind-mounted read-only). `/health` returned `ok`, container health became `healthy`, and its `runtimeSourceBindings.modules` SHA-256 values matched the current mounted Python files. A live POST to `/ast/chunk?includeHelpers=true&includeTensorFeatures=true&maxHelperChunks=8` returned `helperAnalysis` with exact `sourceContentSha256`, one source-bound chunk, ordered procedural sequence, typed attributes, and a `float32` feature descriptor of shape `[1,7]`. With a deliberately mismatched caller revision, routing was `BLOCKED_SOURCE_REVISION_MISMATCH`; with the exact UTF-8 SHA-256, status became `PROPOSAL_ONLY` and retained `DOMAIN_TAXONOMY_CROSSWALK_UNPROVEN`. Both responses had `writesPerformed=false` and `dispatchAllowed=false`. Runtime capability probe: Tree-sitter, treesitter-chunker, ast-grep, NetworkX, spaCy/POS, and LangExtract available; `torch`, Python SIMDJSON, cuGraph/cuVS, and CuPy unavailable in the Docker sidecar. Separately, the existing checksum-verified tensor conversion helper was executed with WSL RAPIDS Python 2.13.0+cu130 and produced an identity-aligned CPU `torch.float32` tensor of shape `[1,2]`; this proves the conversion function, not a live PyTorch service or GPU execution. NetworkX remains derived CPU graph analysis, not canonical graph persistence. `/ast/chunk` is HTTP/FastAPI, not gRPC; protobuf dynamic loading belongs to separate RPC clients. Helper route deployment and local Torch conversion are proven; GPU parity remains open.

- **Live NetworkX sidecar probe (2026-10-18):** imported the deployed `miniforge_nlp_sidecar` inside `miniforge-nlp-sidecar` and passed a two-edge `A -> B -> C` relationship fixture to its existing `_compute_entity_graph_metrics`; it returned `backend=networkx` and finite PageRank scores for all three nodes. This proves live per-document derived graph metric execution only. It does not prove the `/ast/chunk` helper creates canonical graph edges, multi-file graph admission, corpus-scale fanout, GPU/cuGraph parity, or persistence.

- **Go Retrieval gRPC caller repair and live lineage gate (2026-10-18):** replaced the mock `Channel`/undefined-client path in `sveltekit-frontend/src/lib/server/atlas/go-retrieval-grpc-client.ts` with dynamic loading of `proto/active/retrieval.proto` and the actual `RetrievalService.SearchCodebase` RPC at `ENV.RETRIEVAL_GRPC_URL` (default `127.0.0.1:50053`). The client now passes `AtlasRequestContextV2`, uses the protobuf `receipt.validationStatus`, and returns only candidates carrying packet/source/content identity, matching workspace revision, source revision, and candidate ID. Context assembly and packet validation remain PostgreSQL-backed because those RPC methods do not exist in the active proto. Live read-only gRPC health probe: service healthy at `127.0.0.1:50053`. Opt-in live Vitest proved dynamic proto loading and actual `SearchCodebase` transport; it returned 3 chunks with receipt `REVIEW_REQUIRED / NO_PROVEN_LINEAGE`, so the adapter correctly returned zero evidence rather than promoting them. PostgreSQL `BEGIN READ ONLY` census: `codebase_chunk_index` has 274,465 rows and 0 rows with `workspace_revision`, 0 with `source_revision`, and 0 with both. This is the current retrieval blocker; do not loosen admission or treat RPC health as lineage proof. Focused adapter contract tests passed (3/3); `npm run check` reported 0 errors and 10 existing warnings before the final correlation-ID refinement; repeat type checking after this change. The live integration test now asserts the gRPC path and permits empty evidence when lineage is unqualified; it does not claim retrieval-quality success.

| Gate | Proven? | Evidence |
|---|---|---|
| taskContractResolved | true | live board family (`kanban-task-board.ts`, `kanban-task-event-contracts.ts`, `board/daily-graphify-board.ts`) has production importers; the newer `workflow-action-event-v1.ts`/`task-run-contract-v1.ts` family has **none** (unwired scaffold, commits `ab11561789`, `d526695c60`) |
| uiReadModelProven | true | `admin/ai-dashboard/+page.server.ts` and `api/phase89/workflow/+server.ts` read the board; live store has 166 `kanban_tasks` (160 pending, 6 done) and 160 `kanban_task_events` (143 `file_feed_snapshot`, 11 `proof_run`, 5 `probe`, 1 `code_change`) |
| dispatcherCallerProven | false | `executeHermesAgentStepV1` and the LangGraph `kanban-error-fixing-agent` have **0** production callers (spec/cli only) |
| durableWriterProven | false | `workflow_events` has 0 rows |
| claimHeartbeatReclaimProven | false | no claim/heartbeat/reclaim events; `kanban_task_attempts` 0, `kanban_task_dependencies` 0, `agent_runs` 0, `hermes_dag_runs` 0; claim logic only in `python/prove_dag_*_v1.py` proofs; 2 rows in `workflow_action_leases` |
| timelineRevisionLinkProven | false | 0 task events carry a workspace revision |
| graphifyAdmissionProven | false | latest `atlas-canonical-projection-fabric-audit` is `NOT_SAFE_TO_PROJECT` |

- [x] 15.7 **HERMES-STAGE-EVIDENCE-01** (2026-10-18) Hardened tournament stage evaluation and backprop admission in `sveltekit-frontend/src/lib/server/atlas/agentic/hermes-adaptive-pipeline-v1.ts`. Added `HermesStageToolEventV1` (toolEventId, stage, toolName, toolVersion, exitCode, stdoutHash, durationMs, diagnostics/test counts, suiteReceiptRef, unresolvedNodesCount). Stages and tool versions are now derived strictly from actual tool events; missing or failing tool events reject tournament promotion (`canPromote: false`, throws `NO_ELIGIBLE_TOURNAMENT_WINNER`). Hardened `adaptRankerFromOutcomesV1` with `TournamentOutcomeTrainingInputV1`: requires `verifiedEvidenceRef` and `stageEventHashes`, rejecting fabricated or ungrounded tournament outcomes from adaptive weight updates. Clarified `buildAceContextPacketV1` documentation as a pure descriptor generator keyed for Redis (`ace:packet:{runId}`) without direct I/O. Vitest: 6/6 tests pass in 33ms; `npm run check`: 0 errors.
- [ ] 15.8 **KANBAN-RUNTIME-PROOF-01** OPEN. One read-only repair-diagnostic task on a fixture: dependency readiness, claim, lease, heartbeat, completion, immutable receipt, deterministic replay, `writesPerformed=false`; then a separate authorized worktree-edit gate. Decide which contract family is canonical (live board vs workflow-event) before any new writer.
- [ ] 15.9 **AWM-04-02 / ACE-GEPA-01** PARTIAL (scope corrected 2026-10-18). `python/prove_polyglot_aten_dspy_gepa_oak_v1.py` contains real PyTorch tensor operations and its preserved receipt records CUDA `[4,768]` contiguity/finite checks. Independent CPU byte readback matches the bank, four selected slices and concatenation checksums. However, Plane 4 only constructs strings/proposals and a local 0.6+0.4 score; it does not execute DSPy/GEPA, call OaK, run RLM swaps, or validate ContextManifest admission. Its vectors are seeded fixtures, the compression measure is heuristic bytes rather than tokenizer savings, hardware bandwidth/queue depth are constants, and PASS/timestamp are hardcoded. Actual framework execution, canonical lineage and promotion remain NOT_PROVEN. Historical receipt preserved unchanged; scope/readback evidence: `.tmp/atlas-daily-gate-20261018-continuation/polyglot-byte-readback.json` and `docs/reports/daily-gate-proposal-hardening-20261018.md`.
- [ ] 15.10 **ACE-MLP8-01** OPEN (P2, optional). No 8-node network exists; the only MLP is the policy reranker (in-128-64-32-1) and the FM Rank-4 model. "siglrelu" matches nothing in the repo. Any 8-8-1 challenger must beat both on frozen candidates (Recall@K, MRR, stability, latency).
- [ ] 15.11 **ACE-GRPO-01** OPEN (P3, offline only). Reward design for one task to N episodes needs a **strict checker** first: deterministic grader that re-runs real tools, forbids reward hacking (no model-reported success), and trains only on "edge" tasks the model sometimes solves. GRPO tooling (TRL) is not installed; no trainer, no episode store, no checker exist yet.
- [ ] 15.12 **ACE-HLL-01** OPEN. Distinct-candidate telemetry (HLL) with error checks; `breadth_score` feature currently has no producer.

- **Correction to the polyglot execution claim (2026-10-18):** the historical tensor receipt is not a five-plane live DSPy/GEPA/OaK proof. The four selected bank slices and concatenation bytes independently match; no GPU replay was performed in this scope audit. Local reference closure and generated OPTION/RLM strings do not establish canonical packet identity, source-qualified graph facts, NVMe throughput, double-buffer execution, semantic preservation or ContextManifest admission. Keep the useful fixture tensor evidence and the unmodified receipt, but do not train/admit from the simulated score or use its hardcoded timestamp as execution provenance.

- **76-Domain arithmetic & AST procedural memory routing (2026-10-18):** codified 17 `domain_taxonomy_v1` slugs + 40 `feature_domain` classes + 18 `codebase_chunk_index.domain` + 1 `UNRESOLVED` fallback (slot 255) into `python/atlas_compute/ast_chunk_routing_helpers.py` and `ast_chunk_routing_helpers_v2.py`. Rows structured with 32-float stride (128 bytes = 2x 64-byte AVX2/AVX-512 cache lines; cols 0..24 for AST/NES LUT/POS, cols 25..28 for Titans surprise, MIRAS retention gate, LoD tier, and kv_block_id). Added intrusive linked lists (`prev_ordinal`, `next_ordinal`) and zero-copy `ProceduralChunkMemoryMap` for PyTorch array creations via `pin_memory=True`. Unit tests pass 4/4 in `test_ast_chunk_routing_helpers.py` and 5/5 in `test_avx2_cutile_miras_fsm.py`.

- **8095 `/ast/chunk` live helper qualification (2026-10-18):** a read-only POST of the exact checked-out `python/atlas_ast_chunk_helpers_v1.py` source to `http://127.0.0.1:8095/ast/chunk?includeHelpers=true&includeTensorFeatures=true&maxHelperChunks=3` returned Tree-sitter Chunker 4.0.0, a matching content SHA-256, three helper rows and a `3x7` JSON feature descriptor. Routing remained `PROPOSAL_ONLY`; `canonicalAuthority=false`, `dispatchAllowed=false`, and `writesPerformed=false`. Live `/health` reports `torch=false`, so this proves endpoint/helper execution, not PyTorch tensor creation or GPU execution. The live route imports `atlas_ast_chunk_helpers_v1.py`; the separate `python/atlas_compute/ast_chunk_routing_helpers*.py` 32-float/NES-LUT/mmap prototypes are not this endpoint's implementation. Their NES LUT remains hard-coded rather than loaded from a governed `.okf` source. Focused pytest could not run in Windows Python 3.14 or the configured RAPIDS environment because `pytest` is not installed; no package was installed.

- **TurboVec 128-d MRL ANN sidecar deployment (2026-10-18):** port `:8791` active under Python 3.13 with 219,998 indexed vectors (`representationId: embeddinggemma_mrl128_l2_4bit_v1`, `turbovec: true`, `role: CHALLENGER_ONLY`, 0 RRF votes). Health endpoint verified green.

- **PostgreSQL 18 search trigger optimization & FTS benchmark (2026-10-18):** discovered that `trig_update_codebase_chunk_search_vector` on `codebase_chunk_index` lacked a column clause, causing every row update (including `domain_id`) to re-execute 8 expensive `to_tsvector()` calls across all chunks. Replaced with `BEFORE INSERT OR UPDATE OF relative_path, symbol, ast_symbols, ast_imports, ast_exports, summary, content, semantic_tags`. Update time dropped from $>10\text{ min}$ stall to $30\text{s}$ for 2,113 rows (`compiler` and `database` domain slots populated). Live `EXPLAIN ANALYZE` on native `tsvector` + GIN (`idx_codebase_chunk_bm25_search`) verified query execution in **14.23 ms** across 274,465 chunk rows.

Not found in the repo (searched): "logi" (any spelling); a Paperclip agent (only icons and one route comment: "Mastra/paperclip orchestration"); GRPO self-prompting loop. OaK here means Ontology-as-a-Kernel (`python/atlas_oak_kernel.py`, 8095 `/oak/*`).


### AR-15 suggestions by lane (1-3 each; grounded in what exists, nothing here is started)

**LangExtract / 8095 Python helpers**
1. Runtime visibility implementation is local: `python/miniforge_nlp_sidecar.py` now exposes requested/active LangExtract runtime and a mismatch flag; four local health-mode unit tests passed. Live `:8095/health` still lacks those fields, reports LangExtract 1.6.0 from `/usr/local/lib/python3.13/site-packages/langextract/__init__.py`, and its loaded sidecar digests differ from this checkout. Therefore local code is implemented but live deployment is NOT_PROVEN; do not restart the service from this audit. The same live response reports `torch=false`, `nx_cugraph=false`, `cugraph=false`, `cuvs=false`, and `cupy=false`, so no live accelerator claim is supported.
2. Error-to-source grounding helper: use the existing `/extract/file` and `/ast/chunk` endpoints to attribute each `error_logs` row (route plus message) to a source file and span, so `file_path`/`line_number` stop being null. Read-only; evidence only, no byte identity invented.
3. Register as a read-only helper only after parity vs the shim on a frozen sample (existing `helper-registry-v1.ts` owner; do not create a second registry).

**.okf / docs**
1. Wrap the crawl findings as a schema-validated `.okf` artifact (schema check, semantic check, canonical serialization, checksum) before agents read them, per the `.okf` rule in `AGENTS.md`; `.okf` output stays non-canonical.
2. Add one `.okf` topic entry for "route hardening" so `atlas_okf_topic_extractor.py` can route it, instead of a free-text note.

**NES LUT inverse (prompt-injection) sanitization**
1. Run `sanitizeContentViaNesLut` over every `error_logs.message` that can contain page text (console errors, uncaught errors) before it enters any prompt or ACE packet; add adversarial cases (directive-like strings) to its spec.
2. Make `buildAceContextPacketV1` input real evidence: today `rawEvidence` is one line (`Function X from Y`), so the sanitizer has almost nothing to sanitize. Feed it the grounded error plus source excerpt.

**DAG synthesis for agentic error fixing alignment**
1. Blocked on HERMES-STAGE-EVIDENCE-01: `synthesizeWorkflowDagV1` and the tournament may only consume stage results that come from tool events. Fix that first.
2. Then map each critical/high `error_logs` row (RH-01..RH-12) to one READ_ONLY + EXECUTE_TESTS DAG on the existing `synthesizeAgenticDagV1` wrapper (AR-13); execution stays a separate authorized gate.
3. Close the loop only through `kanban_tasks`/`kanban_task_events` (the live board owner): one task per distinct fingerprint, `idempotency_key` = fingerprint.

**DSPy / GEPA / GRPO / OaK use today**
- DSPy/GEPA code and the preserved polyglot tensor fixture are separate evidence classes: `prove_polyglot_aten_dspy_gepa_oak_v1.py` does not execute those frameworks or validate live OaK in Plane 4. Live Bifrost LM wiring (ACE-PROMPT-02), manifest admission (ACE-CONTEXT-01), independent framework evaluation (ACE-GEPA-01) and strict checking (ACE-GRPO-01) remain open. Resolve current versions/runtime readiness from their actual owners before claiming online conversational adaptation.

### Admin runtime health and storage verification — 2026-10-18

- [x] **AR-ADMIN-HEALTH-01** Replace the Atlas browser's hard-coded `:8099` TurboVec probe with authenticated, same-origin GET `/api/admin/atlas/turbovec-prefilter`, reusing the existing environment-backed TurboVec client. Validate upstream health, preserve source/collection/representation/role, use a stable `{ok,health,error}` response for success, unauthorized, and unavailable states, and disable response caching. Missing backend metadata renders as `UNREPORTED`. Seven focused route/client tests pass. Live GET reports 219,998 indexed, 128 dimensions, 4 bits, PostgreSQL source, `codebase_chunks_768_v2`, `embeddinggemma_mrl128_l2_4bit_v1`, and `CHALLENGER_ONLY`. This proves component reporting, not retrieval qualification or canonical promotion.
- [x] **AR-ADMIN-BROWSER-01** Prove live TurboVec panel values against the actual same-origin response and exercise the PostgreSQL OpenSpec source-index page, snapshot identity, and Bits UI tabs. Playwright: 2/2 pass in 19.9 seconds; screenshots and response attachments are retained in `.tmp/atlas-admin-health-20261018/playwright-verified/`. Initial runs exposed clicks before hydration, table headers announced as cells, and a false offline result from the old 500 ms health deadline. Tabs now wait for mount, headers declare column scope, and the health-only deadline is five seconds after a measured 2,866 ms cold health request (subsequent requests 2–25 ms). Retrieval request deadlines are unchanged. Earlier failed artifacts are retained in separate sibling directories. `npm run check`: zero errors and ten existing warnings in eight other files. Source-index contract tests: 4/4 pass.
- **Fresh storage evidence:** PostgreSQL 18.4 has `vector 0.8.3`, `pg_trgm 1.6`, and `pg_search 0.25.1` installed. `vectorscale`, `pgai`/`ai`, and `hll` are unavailable/uninstalled. The live FTS trigger is already limited to search-relevant column updates. `codebase_chunk_index` has 48 indexes; sizes alone do not prove bloat. `atlas_kanban_reconciliation_v1` exists as an ordinary, unpartitioned table with zero rows; existing Kanban and immutable source-index owners remain separate. Windows reports an NVMe SSD, while PostgreSQL's Docker named-volume backing path and I/O performance remain unmeasured. No extension, index, trigger, task-admission, GPU, or production-routing mutation was performed by this verification.
- **Reference correction:** `docs/EMBEDDINGGEMMA-COMPLETE-REFERENCE.md` now qualifies the overlapping vocabulary arithmetic, copy-based mmap prototype, descriptor-only non-AST routing, and empty/unpartitioned reconciliation table. It also records current TurboVec runtime evidence and the distinction between SSD-oriented vector ANN, typed graph analysis, and compatible BitNet model inference. Pgvectorscale's PG18 source support and open halfvec request are linked to upstream; no installation is implied. The broader source-lineage, reviewed-taxonomy, graph-admission, and retrieval-quality gates remain open.

### Daily failure-to-board proof — 2026-10-18

- [x] **AR-DAILY-PROPOSAL-BOUNDARY-01** Hardened the existing JSON board writer, not a new Kanban authority. Zod requires read-only/proposal/noncanonical envelopes and PROPOSED mutation-forbidden candidates; rejects duplicates, malformed boards, missing plans and artifact/receipt collisions. Added dry-run/local receipt support, changed-during-preparation detection, temporary-file rename, byte readback and before/after checksums. Mapped rows explicitly set dispatchable=false. Eleven focused coordinator/board/daily-admission tests pass. This is not a distributed lock or canonical task admission.
- [x] **AR-DAILY-BOARD-READBACK-01** Fresh read-only fabric audit completed and rolled back with NOT_SAFE_TO_PROJECT: SYMBOLS_RESOLVED, SEMANTIC_OWNER_PROVEN and LATENT_FAMILY_PROVEN are PARTIAL_PROVEN; projection checksums, BitFrost keys and ACE grounding remain NOT_PROVEN. Extracted these six failures plus the GEPA evidence correction through the existing offline planner. Preview and bounded JSON-board merge retained seven earlier proposals and wrote seven current proposals (fourteen total); preserved preimage and independently verified file checksum, non-dispatching flags and deterministic plan replay. PostgreSQL Kanban rows and execution queues were untouched. Artifacts: `.tmp/atlas-daily-gate-20261018-continuation/`; report: `docs/reports/daily-gate-proposal-hardening-20261018.md`.
- [x] **AR-DAILY-BOARD-BROWSER-01** Actual desktop/mobile Playwright checks pass at 1280/390 pixels: rendered source IDs, PROPOSED status, reason codes and expandable evidence match file-backed proposals; no execution buttons; no card/page horizontal overflow. Mobile sidebar toggle preserves desktop preference and defaults to a compact rail; dashboard metadata/IDs wrap. Renamed the heading Daily Diagnostic Board and linked the distinct OpenSpec source index. Final screenshots are preserved under the artifact directory's `playwright-width/` and `playwright-layout/`; earlier failures are retained. Full Svelte check: zero errors, ten existing warnings in eight other files; direct changed-file compilation: zero warnings.
- **Symbol-gate dry-run probe (2026-10-19T01:11Z):** ran the existing extractor with `--limit 1` and no `--apply`. It examined one supported Markdown candidate, extracted 22 observations, attempted/committed zero files, and reported `datastoreWriteAttempted=false`; the result is correctly `SHARD_INCOMPLETE`, `GRAPHIFY_OBSERVATION_ONLY`, `WORKING_TREE`, with no workspace-revision filter. This is a local diagnostic, not admitted symbol coverage and does not change the daily gate. Receipt: `docs/reports/graphify-symbol-extractor-v1-1792372287403.json`. Advancing the gate requires a frozen, admitted workspace/source-revision cohort and the script's planned shard/readback flow; no apply was run.

### TurboVec contract synchronization and client double-query elimination — 2026-10-18

- [x] **ALIGN-TV-03** Reconciled live `sveltekit-frontend/src/lib/server/vector/turbovec-contract.ts` with 128-d MRL constants (`TURBOVEC_INDEX_DIMENSION = 128`, `TURBOVEC_PROJECTION = 'mrl-prefix-l2'`, `TURBOVEC_REPRESENTATION_ID = 'embeddinggemma_mrl128_l2_4bit_v1'`) and added `TurboVecRepresentationSchema` and `TurboVecContractSchema` matching `:8791` runtime contracts.
- [x] **ALIGN-TV-06** Switched default collection parameter in `sveltekit-frontend/src/lib/server/search/turbovec-search.ts` (`searchQdrantDirect`, `searchQdrantWithVectors`, `searchTurboVecNative`, `searchTurboVecSidecar`, `searchTurboVecFallback`, `searchCodebaseAnn`, `searchTurboVecCode`, `searchQdrantCode`) from legacy `codebase_chunks_768` to active `codebase_chunks_768_v2`.
- [x] **ALIGN-TV-07** Eliminated double Qdrant query penalty on sidecar fallback in `searchTurboVecCode`. Single initial call to `searchQdrantWithVectors` supplies candidate points with vectors to both `searchTurboVecSidecar` and fallback `searchTurboVecFallback`, completely eliminating the redundant second network round-trip. `svelte-check`: 0 errors.

Production closure remains open: this was an admission audit and diagnostic-board update, not a successful daily indexing run or permission to execute repairs. ACE-GEPA-01 was reopened after source inspection disproved the prior live-framework claim; historical tensor receipt retained, with independent bank/slice/concatenation byte parity only. Do not consume simulated framework scores as training labels or ContextManifest admission.

- **OpenSpec source-index refresh + Admin read-only browser proof (2026-10-19):** after prior ledger edits, regenerated the census (`DIAGNOSTIC_ONLY_NOT_PROMOTABLE`) and applied a bounded snapshot with exact expected revision `sha256:10fe4fd7a965faa6b42837a787241d202e8eaee3fc57fcd6c64d35b8e0c3de60`; importer reported `SOURCE_INDEX_READBACK_PROVEN`, 5,599 rows, 0 invalid. An independent `BEGIN READ ONLY` query confirmed snapshot metadata, 5,599 stored rows and 5,599 distinct source refs (3,009 DECLARED_ID, 2,395 DERIVED_ID, 195 AMBIGUOUS); these identities remain unpromoted and Kanban is untouched. Admin Playwright task-source test passed 1/1 with global DB-seeding hooks skipped; direct browser check returned HTTP 200, the matching heading and count 5,599, and saved `.tmp/atlas-daily-gate-20261019/admin-atlas-task-sources.png`. No task mutation UI exists. The final snapshot will need refresh after this ledger entry because the revision includes task files.
- **Continuation verification (2026-10-18 workspace state):** `node --test scripts/atlas/index-openspec-task-sources-v1.test.mjs` passed 4/4. `npx playwright test tests/e2e/admin-atlas-runtime-health.spec.ts --grep "task-source index" --reporter=line` passed 1/1; global setup seeded three temporary case fixtures and teardown removed all three. This is a real browser/render/interaction test, not a screenshot review alone. The source-index migration and Admin view already exist; the next action is a fresh source-census/apply so the displayed snapshot covers the current task-file revisions. The Graphify lifecycle, ACP/A2A repair dispatch, and DSPy/GEPA/OaK runtime claims remain open; no Graphify run or repair dispatch was fabricated or started.
- **Locator-refresh checkpoint (2026-10-19):** after the preceding ledger edits, a bounded refresh produced `SOURCE_INDEX_READBACK_PROVEN` for 5,602 source refs at workspace revision `sha256:36d65e7a5786c13d7082022170edd0e8514886b5cb5eacc21d540a0113596eee`; a separate `BEGIN READ ONLY` query confirmed `COMPLETE`, 5,602 rows, and 5,602 distinct refs. This is a checkpoint, not task admission; the final refresh must include this ledger entry.
- **2026-10-19 continuation — Phase 89 stats and task-source snapshot identity:** corrected `/api/phase89/stats` to use preserved schema objects (`kg_nodes.node_type`, `phase89_import_edges`, `cpg_edges`, `raw_error_embeddings`) and stable success/failure response keys. Added a read-only, 30-day runtime-error diagnostic lane beside the Daily Graphify board with explicit severity/recurrence/recency Top 10/Top 100 ranking; it does not create Kanban tasks or authorize execution. Focused route/projection tests passed 4/4; live read-only SQL found 85 groups. Fixed the task-source importer collision by deriving immutable snapshot identity from the exact source-row manifest plus workspace revision, not volatile census metadata; focused importer tests passed 5/5. An initial apply attempt rolled back on the prior collision; the corrected bounded apply and separate SQL readback passed for 5,612 rows (3,010 declared, 2,400 derived, 202 ambiguous), with 0 invalid, 0 canonical task promotions, and 0 executable Kanban writes. Full Svelte check remains unverified because it was interrupted during high-memory activity; no Graphify lifecycle or repair dispatch was started.
- **2026-10-19 Phase 89 navigation/data wiring correction:** `/api/phase89/topology` previously selected nonexistent `raw_error_embeddings.raw_text` and `.source`; the preserved table contains `error_hash`, `embedding`, `metadata`, and `created_at`, while file/message observations belong to `phase89_error_instances`. The route now groups distinct error instances by `file_path` and left-joins embeddings by `error_hash`, avoiding fanout over duplicate embedding rows. The AST Topology page now maps the stats endpoint's top-level response, loads and applies the topology response instead of discarding it, and shows an honest empty/error state with a link to the shared Daily Diagnostic Board. Focused route and ranking tests passed 6/6. Live browser/API verification returned topology HTTP 200 with no error and zero indexed Phase 89 instances; the Dashboard showed 89 runtime-error groups and its explicit Top 10/Top 100 controls. This is a read-only diagnostic alignment, not Graphify evidence, Kanban task admission, or repair authorization. A full `npm run check` was interrupted after prolonged silence and remains unverified. Refresh the OpenSpec task-source snapshot after this ledger entry.
- **2026-10-19 runtime-error live refresh continuation:** Added an admin-only, `no-store` JSON endpoint for the existing 30-day runtime-error ranking and 15-second visible-tab refresh plus manual refresh on the Daily Diagnostic Board. Top 10/Top 100 remain severity/recurrence/recency-ranked diagnostic projections; errors do not become Kanban tasks or Graphify findings. Live read-only schema inspection confirmed `kg_nodes.node_type` (not `kind`) and `error_events.kind/severity/collected_at`; the ranking SQL executed successfully and returned 89 groups (10 in Top 10, 89 available in Top 100). No recent stored error matched the reported missing-kind message, so the pasted dev-server log may predate the current stats fix or have come from an older Vite module instance. The route/projection tests passed 4/4. Svelte diagnostics reported 0 errors and 16 warnings in 10 files, including one new state-initialization warning; that warning was corrected afterward, but a clean exit and post-fix check remain unverified due to high memory pressure. Refresh this source-index snapshot after the ledger update.
- **2026-10-19 task-priority projection:** Added a separate read-only ranking of the file-backed Daily Graphify board using only each task's declared P0–P3 priority (`100/75/50/25`), with stable task-ID tie ordering and blocker/source references shown. The panel has independent Top 10/Top 100 controls and explicitly does not imply learned importance, Graphify confidence, task admission, or dispatch. Runtime-error ranking remains a separate diagnostic lane. Focused board/error/API Vitest passed 11/11; Playwright verified both dashboard control sets and transitions (2/2), with all three global test fixtures removed by teardown. Current source board had 14 proposal rows (4 P0, 8 P1, 1 P2, 1 P3); no PostgreSQL Kanban writes, Graphify run, or repair dispatch occurred. Refresh the source-index snapshot after this ledger entry.
- **2026-10-19 runtime-error source and browser proof:** Extended the admin-only, `no-store` refresh endpoint and 15-second visible-tab/manual refresh to rank both client `error_events` and unresolved server `error_logs` without merging either into Kanban or Graphify truth. Live read-only SQL verified 89 client-event groups plus 301 unresolved server-log groups (390 total). Focused Vitest tests pass 4/4; the Playwright dashboard refresh test passes 1/1. Its screenshot is retained at `sveltekit-frontend/test-results/e2e-admin-atlas-runtime-he-bfc62-c-Top-10-and-Top-100-errors-chromium/test-finished-1.png`. The changed Svelte component compiles with zero component warnings. Full `npm run check` emitted 0 errors and 16 warnings but was stopped under memory pressure before exit status; a post-fix full check remains open. Playwright created and cleaned up three `[PW-TEST]` rows; independent readback confirmed zero remain. Refresh the source-index snapshot after this ledger addition.
- **Runtime severity normalization:** Server `error_logs` stores `WARNING`, while the shared ranking score recognizes `warn`; the query now normalizes `warning` to `warn` before scoring. Focused tests remain 4/4, and live read-only census confirms 334 warning rows map to `warn` (with other severity values unchanged). The full type-check remains open as stated above.
- **2026-10-19 Graphify lifecycle audit (superseded historical result):** an earlier snapshot incorrectly reported `LIFECYCLE_OWNER_UNPROVEN` and described the latest receipt as still open. The later read-only re-audit at lines 485–488 supersedes those findings: lifecycle owner roles and transition APIs are identified, while live PostgreSQL still shows 19 stale runs, no current-revision run, mismatched selected/daily execution IDs, and a `LEGACY_IMPORTED` authority row that does not confirm either current selection. Keep daily Graphify, ACP/A2A repair dispatch, and production indexing gated; do not reuse or promote the historical receipts. No Graphify run, stale-run reconciliation, downstream projection, or repair dispatch was started.
- **OpenSpec source-index continuation (2026-10-19):** audited the existing PostgreSQL 18 source-index owner and Admin Atlas read-only page; no parallel task authority was added. Hardened `scripts/atlas/index-openspec-task-sources-v1.mjs` with a 10,000-row transaction cap and complete persisted-field comparison for in-transaction and post-commit readback (`source_ref`, `change_id`, `source_line`, `task_text`, `task_hash`, `task_status`, `identity_status`, `canonical_task_key_candidate`, `archived`). Focused importer tests pass 6/6; the 5,640-row census dry-run had zero invalid rows. A bounded snapshot apply and independent PostgreSQL read-only count confirmed 5,640 rows and unique source refs, with 204 ambiguous identities retained as ambiguous and zero Kanban writes. Admin task-source Playwright passed 1/1; global setup fixtures were removed by teardown. The final current-revision census/apply is recorded in `.tmp/openspec-task-source-index-v1/receipt.json`; the portfolio remains diagnostic-only and no task identity or executable Kanban status was promoted. Graphify eligibility remains false; no Graphify run or repair dispatch was started.
- **2026-10-19 lazy-route navigation regression:** added a focused Playwright check for sidebar navigation from the AI dashboard to Admin Codebase Index and Demos, then through the demos preview/launch flow to YoRHa Terminal. It records failed or non-2xx SvelteKit client-node module requests and asserts none occurred. Playwright passed 1/1; test fixtures were removed by global teardown. This validates browser navigation only; it is not a Graphify lifecycle or production-rendering proof.
- **2026-10-19 receipt/rank adapter audit:** the canonical Vitest writer and independent verifier already exist (`scripts/atlas/ingest-test-receipts.mjs`, `scripts/atlas/verify-test-receipts.mjs`); the verifier persists to the existing `atlas_receipt_verifier_results_v1` table. `atlas_receipt_verification_v1` is only a derived view and must not be treated as independent verification. Receipt parser tests and patch-tournament evidence-gating tests pass 13/13 each. The rank adapter in `atlas/execution/atlas-rank-input-adapter-v1.ts` resolves through the sealed CandidateOrdinalMapV1, validates columnar/evidence revisions, cross-checks the existing CPU GEMM, and emits advisory/no-write receipts; its focused suite passes 24/24. Python `candidate_concept_tile_v1.py` derives `ordinal_map_revision` from the verified sealed map; focused tests pass 14/14. Integration remains open: the active 4x6 tile contract means four candidate identities × six channels, while the latest approved adapter requirement means four feature groups/states × six channels per candidate ([B,4,6]); a separate unintegrated `src/lib/server/agent/atlas-rank-input-adapter-v1.ts` uses the latter shape but only trusts a caller-supplied `sealed: true` marker and lacks the real ordinal resolver. Do not route it to scoring or add another receipt schema until the shape is reconciled with the existing GEMM owner. No live database query/write or GPU execution was performed. Refresh the task-source snapshot after this ledger update.
- **2026-10-19 Graphify lifecycle re-audit (read-only correction):** fresh `scripts/atlas/audit-graphify-lifecycle-owner-v1.mjs` completed successfully with `writesPerformed=false`. Owner roles are now identified (one each for revision inventory, per-attempt execution, authority, stale-run maintenance, and daily orchestration), correcting the earlier `LIFECYCLE_OWNER_UNPROVEN` finding. Eligibility remains false: 19 stale runs, 0 running/current runs, and conflicting receipt IDs (`selectedExecutionId=74d50c86-8194-45ea-8c3d-61aab737ef83`, `dailyExecutionId=0dba1c0d-2cf7-4f35-a61b-c77956f60d3d`); the sole authority row is `LEGACY_IMPORTED` and does not confirm the selected receipt. Current blockers: `DECISION_DAILY_EXECUTION_ID_MISMATCH`, `AUTHORITY_TABLE_DOES_NOT_CONFIRM_DECISION_RECEIPT`, `CURRENT_RUN_NOT_ESTABLISHED`, `REPOSITORY_REVISION_NOT_CURRENT`. No lifecycle reconciliation, Graphify run, downstream projection, or repair dispatch was started. Fresh reports: `docs/reports/graphify-lifecycle-owner-v1.json`, `docs/reports/graphify-stale-run-portfolio-v1.json`, `docs/reports/graphify-current-run-eligibility-v1.json`. Refresh the task-source snapshot after this ledger update.
- **2026-10-19 structured Graphify blocker proposals:** `scripts/atlas/run-agentic-error-fixing-v1.mjs` now recognizes `atlas.graphify-current-run-eligibility.v1` and emits one stable, non-dispatching `PROPOSED` candidate per validated blocker code, preserving counts and the selected/daily execution IDs. Regression coverage passes 6/6 in `scripts/atlas/run-agentic-error-fixing-kanban-v1.test.mjs`. The fresh eligibility report produced four gate-specific proposals. The existing daily board merge applied them while retaining all 14 prior task IDs; post-write readback confirmed 18 total tasks and exactly four current-plan candidates with the four blocker codes, each `mutationAllowed=false`, `canonicalAuthority=false`, and `dispatchable=false`. Receipt `.tmp/goal-continuation-20261019/structured-board-apply.json` records `databaseWritesPerformed=false` and `dispatchPerformed=false`. Playwright verified the Daily Diagnostic Board Top 10/Top 100 dashboard controls after the merge (2/2); global teardown deleted all three temporary case fixtures. Refresh the task-source snapshot after this ledger update.
- **2026-10-19 lifecycle-audit accuracy recheck (read-only):** focused owner-role tests pass 7/7. The lifecycle audit now detects the existing transition APIs (`completeExecution`, `completeGraphifyRunInTransactionV2`, `completeGraphifyRunV2`) instead of hard-coding their absence; this proves code availability only, not a completed run. A fresh DB read-only audit in `.tmp/codex-graphify-audit-20261019/` reports `writesPerformed=false`, `eligibleForFreshRun=false`, 19 stale runs, zero current runs, and the same conflicting execution IDs/authority mismatch. The daily JSON receipt says `terminalStatus=COMPLETED`, but points to the non-selected execution, so it does not clear the mismatch. No Graphify run, reconciliation, projection, or dispatch was performed. The source-index snapshot is now behind this ledger edit.
- **Graphify execution-pair readback (PostgreSQL `BEGIN READ ONLY`):** both receipt IDs exist and have status `COMPLETED` for workspace revision `sha256:e24bb97187ea6394eeba457dd849915f570045b7a1867780fdc7aa9ea62b9acc`. Each has the same three completed stages (`OPEN`, `SOURCE_SELECTION`, `INVENTORY`); input, selection, and inventory-output checksums match. Only `74d50c86-8194-45ea-8c3d-61aab737ef83` has legacy `canonical_authority=true` and authority state `LEGACY_IMPORTED`; `0dba1c0d-2cf7-4f35-a61b-c77956f60d3d` is not selected. Neither has rows in `graphify_execution_files`; one completed `graphify_runs` row binds that workspace revision and manifest digest. These records demonstrate duplicate completed attempts over one old snapshot, not a current-revision run or permission to promote either receipt. No data was changed.
