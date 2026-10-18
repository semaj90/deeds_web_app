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
- [ ] 15.3 **ACE-PROMPT-02** OPEN. Inject a `dspy.BaseLM` subclass that calls Bifrost (`:3040`, model id `openai/ornith-1.5-9b`) directly so LiteLLM is never used for calls. Not tested: DSPy behavior with LiteLLM removed.
- [ ] 15.4 **ACE-CONTEXT-01** OPEN. Render a validated proposal into the existing `buildAceContextPacketV1` `rawEvidence` (NES-LUT sanitized) and the `ContextManifestV2` to `PromptPlanV1` path (AFC-04B); do not add a second prompt compiler or budget.
- [x] 15.5 **ACE-OUTCOME-01** CREATED (offline). Hash-chained `atlas.ace-outcome-receipt.v1`, `writesPerformed=false`, tamper and reorder detection tested. No persistence, no live caller.
- [x] 15.6 **KANBAN-RUNTIME-OWNERSHIP-01** audit CREATED, verdict **NOT_PROVEN**. `scripts/atlas/audit-kanban-runtime-ownership-v1.mjs` writes `docs/reports/kanban-runtime-ownership-v1.json` from verified evidence only (read-only).

| Gate | Proven? | Evidence |
|---|---|---|
| taskContractResolved | true | live board family (`kanban-task-board.ts`, `kanban-task-event-contracts.ts`, `board/daily-graphify-board.ts`) has production importers; the newer `workflow-action-event-v1.ts`/`task-run-contract-v1.ts` family has **none** (unwired scaffold, commits `ab11561789`, `d526695c60`) |
| uiReadModelProven | true | `admin/ai-dashboard/+page.server.ts` and `api/phase89/workflow/+server.ts` read the board; live store has 166 `kanban_tasks` (160 pending, 6 done) and 160 `kanban_task_events` (143 `file_feed_snapshot`, 11 `proof_run`, 5 `probe`, 1 `code_change`) |
| dispatcherCallerProven | false | `executeHermesAgentStepV1` and the LangGraph `kanban-error-fixing-agent` have **0** production callers (spec/cli only) |
| durableWriterProven | false | `workflow_events` has 0 rows |
| claimHeartbeatReclaimProven | false | no claim/heartbeat/reclaim events; `kanban_task_attempts` 0, `kanban_task_dependencies` 0, `agent_runs` 0, `hermes_dag_runs` 0; claim logic only in `python/prove_dag_*_v1.py` proofs; 2 rows in `workflow_action_leases` |
| timelineRevisionLinkProven | false | 0 task events carry a workspace revision |
| graphifyAdmissionProven | false | latest `atlas-canonical-projection-fabric-audit` is `NOT_SAFE_TO_PROJECT` |

- [ ] 15.7 **HERMES-STAGE-EVIDENCE-01** OPEN, file under active extraction (not edited here). `executeHermesAgentStepV1` hardcodes the tournament stages (`typecheck pass`, `unitTests 15 passed`, `graphEvidence pass`, `durationMs 420`) and tool versions, and `adaptRankerFromOutcomesV1` trains the 61-parameter FM Rank-4 model on `outcomeSuccess`. Required: stage results must come from tool events (ids, exit codes, hashes); until then outcome labels are fabricated and must not feed adaptive backprop. Also: `buildAceContextPacketV1` is pure (no Redis write) although its comment says "injected to Redis".
- [ ] 15.8 **KANBAN-RUNTIME-PROOF-01** OPEN. One read-only repair-diagnostic task on a fixture: dependency readiness, claim, lease, heartbeat, completion, immutable receipt, deterministic replay, `writesPerformed=false`; then a separate authorized worktree-edit gate. Decide which contract family is canonical (live board vs workflow-event) before any new writer.
- [ ] 15.9 **AWM-04-02 / ACE-GEPA-01** OPEN (existing AR-12). Frozen baseline vs challenger on CPU, held-out split, labels only from reviewed outcomes; no label from 15.7 until fixed.
- [ ] 15.10 **ACE-MLP8-01** OPEN (P2, optional). No 8-node network exists; the only MLP is the policy reranker (in-128-64-32-1) and the FM Rank-4 model. "siglrelu" matches nothing in the repo. Any 8-8-1 challenger must beat both on frozen candidates (Recall@K, MRR, stability, latency).
- [ ] 15.11 **ACE-GRPO-01** OPEN (P3, offline only). Reward design for one task to N episodes needs a **strict checker** first: deterministic grader that re-runs real tools, forbids reward hacking (no model-reported success), and trains only on "edge" tasks the model sometimes solves. GRPO tooling (TRL) is not installed; no trainer, no episode store, no checker exist yet.
- [ ] 15.12 **ACE-HLL-01** OPEN. Distinct-candidate telemetry (HLL) with error checks; `breadth_score` feature currently has no producer.

Not found in the repo (searched): "logi" (any spelling); a Paperclip agent (only icons and one route comment: "Mastra/paperclip orchestration"); GRPO self-prompting loop. OaK here means Ontology-as-a-Kernel (`python/atlas_oak_kernel.py`, 8095 `/oak/*`).


### AR-15 suggestions by lane (1-3 each; grounded in what exists, nothing here is started)

**LangExtract / 8095 Python helpers**
1. Make the runtime explicit and visible: `python/atlas_langextract_runtime.py` defaults `LANGEXTRACT_RUNTIME` to the local shim unless set to `official`, while 8095 `/health` only says `langextract:true`. Report the active runtime in `/health` before any helper-registry entry relies on it.
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
- DSPy 3.4.1 + GEPA 0.1.4 are installed (`atlas-dspy-exp` venv) but no LM is wired (ACE-PROMPT-02), so nothing has been optimized or run; no GRPO tooling is installed and no strict checker exists (ACE-GRPO-01); OaK (Ontology-as-a-Kernel) is served at 8095 `/oak/*` and is only an evidence input. Do not describe any of these as "in use" until a receipt shows an executed, validated run.
