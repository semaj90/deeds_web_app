# Parent Atlas: worktree-adaptive learning, backprop, HLL, and monitoring

Status: PLANNED (no task below is complete). Created 2026-10-15.

## Authority rules (apply to every task)

- PostgreSQL remains canonical. Qdrant, Valkey/BitFrost, Neo4j, and HLL counters are projections or telemetry.
- **Scheduling decision (2026-10-15):** defer implementation that creates, persists, propagates, changes writer policy for, invalidates from, or backfills `source_revision`, `workspace_revision`, or related `*_revision` fields until after workstation P20+ and closure of `parent-atlas-gpu-sidecar-patch-tournament`. This does not defer read-only audits or existing runtime validation; missing or mismatched lineage still fails closed.
- Backprop trains challenger models only. It never writes canonical packet facts, `source_revision`, identity, or lifecycle transitions (see `ATLAS-LEARNING-01` and `POLICY-05`).
- HLL is telemetry. It never decides eviction, promotion, residency, or retrieval votes (see `parent-atlas-telemetry-lowrank-recommendation-okf-integration`, HLL tasks).
- A worktree change is detected by source-byte SHA-256 (`source_revision`), never by the current worktree alone. Reprocess; do not assign.
- Every promotion needs a revision-qualified receipt, a CPU or fixture oracle, and an explicit operator decision.

## Dependencies (existing gates; this change does not re-open them)

| Dependency | Owner | State |
|---|---|---|
| `source_revision` persisted by producers | `openspec/changes/parent-atlas-chunk-index-whole-file-hash` (ATLAS-SOURCE-REVISION-01 block) | PRODUCER_PATCHED; apply blocked on authorization |
| Historical revision backfill | same | Not started; 25,913 matched paths, 1,928 changed, 366 missing |
| Metric equivalence for float32 `semantic_768` | `parent-atlas-gpu-sidecar-patch-tournament` GPU-26 | Open |
| Accelerator observability and fallback receipts | same, GPU-27, GPU-31 | Open |
| Valkey invalidation and fail-open proof | same, BF-02, BF-06 | Open |
| Reviewed query-grouped labels for supervised rankers | `parent-atlas-retrieval-lod-algorithm-taxonomy` ATLAS-LEARNING-01 | Blocked: 49 of 200 reviewed rows |
| Model promotion rules (held-out metrics, rollback pointer) | `parent-atlas-ml-graph-retrieval-convergence` POLICY-05 | Open |
| MLP reranker challenger (E5) | `parent-atlas-gpu-graph-vector-substrate` | Open |

## Phase 0 — Contract freeze

- [ ] AWM-00-01 Freeze the worktree change record: `{sourceRef, prior_source_revision, current_source_revision, detected_at, detector}`. Detector is byte hash only.
- [ ] AWM-00-02 Freeze the HLL projection record: key namespace, precision, window, and the statement that it is telemetry only.
- [ ] AWM-00-03 Freeze the monitoring receipt schema: revision-qualified, checksummed, append-only.
- [ ] AWM-00-04 Record which PyTorch gate (GPU-26 and the E5 challenger) each later phase must pass.

## Phase 1 — Worktree change detection — GATED: start only after workstation P20+ gates (source_revision)

Operator decision (2026-10-15): do not start until the parent-atlas workstation phase gates are complete, including P20 and later, and after `parent-atlas-gpu-sidecar-patch-tournament` has closed its own tasks. Items kept as written; not started.

Existing owners: `graphify-delta-v1`, `workspace-binding-cas-v1`, `workspace-invalidation-projector-v1`, `workspace-snapshot-compaction-v1` (combined in `graphify-daily-incremental-plan-v1.ts`). Source authority: `CURRENT-SOURCE-OWNER-RECONCILIATION-01`; the sealed 25,542-source cohort is proven at `sha256:e24bb97187ea6394eeba457dd849915f570045b7a1867780fdc7aa9ea62b9acc`, but the 2026-10-15 read-only drift planner found 1,909 source/content mismatches against the current workspace candidate (`sha256:a99c44e3ff5ea03393c2bff88be3c3da1a88d3f18c5a2745f38871fa097e108c`). The candidate is not promoted; bounded reprocessing/backfill remains unauthorized and `safeToBackfill=false`.

- [ ] AWM-01-01 Feed the existing delta batch with `source_revision` (byte SHA-256) as its input identity. Do not add a second change detector.
- [ ] AWM-01-02 Consume the existing invalidation projection for dependent chunks, packets, embeddings, summaries, graph edges, and cached contexts. Report only.
- [ ] AWM-01-03 Bounded single-source readback. Blocked on ATLAS-SOURCE-REVISION-01 apply authorization and on the chunk-vs-packet `source_revision` writer decision.

## Phase 2 — Invalidation and reprocessing — GATED: start only after workstation P20+ gates (source_revision)

Gated with Phase 1, same start condition. Historical backfill stays blocked by SOURCE-REVISION-BACKFILL-PLAN-01 (`safeToBackfill=false`) regardless of phase order.

- [ ] AWM-02-01 Reprocess `CHANGED` sources through the producer, not by assigning revisions. Preserve unrelated rows. Blocked until CURRENT-SOURCE-OWNER-RECONCILIATION-01 seals an admitted source set (`SOURCE-REVISION-BACKFILL-PLAN-01`: `safeToBackfill=false`).
- [ ] AWM-02-02 Invalidate Valkey keys bound to the old revision only after the Postgres write succeeds (BF-01, BF-02).
- [ ] AWM-02-03 Prove fail-open behavior when Valkey is down (BF-06).

## Phase 3 — HLL breadth telemetry (owned by the telemetry change)

Owner: `parent-atlas-telemetry-lowrank-recommendation-okf-integration` (HLL tasks, unchecked). This phase adds only the gate below.

- [ ] AWM-03-01 Gate: the telemetry change's HLL breadth counters must not change eviction, promotion, residency, or retrieval ordering. Verified by that change's tests, not re-implemented here.
- [ ] AWM-03-02 Gate: HLL error bound against exact counts on a bounded fixture, recorded in that change.

## Phase 4 — Adaptive backprop (challenger only)

- [ ] AWM-04-01 Define the training set only from reviewed, query-grouped labels (ATLAS-LEARNING-01). No synthetic labels, no generated reasoning traces.
- [ ] AWM-04-02 Train a challenger (MLP reranker, E5) on CPU first. Compare against the frozen baseline on the same held-out split.
- [ ] AWM-04-03 Gate GPU training on GPU-26 metric equivalence: CPU and GPU scores must agree within a stated tolerance for the same inputs.
- [ ] AWM-04-04 Any promotion needs held-out metrics, a rollback pointer, and operator approval (POLICY-05). Otherwise the challenger stays a challenger.

## Phase 5 — Monitoring

- [ ] AWM-05-01 Emit a monitoring receipt per run: staleness by revision, HLL error bound, challenger-vs-baseline deltas, accelerator fallback reason (GPU-27).
- [ ] AWM-05-02 Alert on revision drift between Postgres, Qdrant, and Neo4j projections. Report only; do not auto-repair.
- [ ] AWM-05-03 Keep receipts append-only and checksummed. A missing receipt is a failure, not a pass.

## Gaps to resolve before Phase 2 can start

1. Operator authorization for the single-file apply (ATLAS-SOURCE-REVISION-01).
2. Operator decision on the historical backfill approach.
3. Reviewed label set (ATLAS-LEARNING-01): 49 of 200 rows is far short of the trust floor.
4. Whether the GPU sidecar tournament (GPU-21 to GPU-32) is the owner of the "tournament" gates referenced here. Confirm before Phase 4.

## Phase 6 — LangGraph GPU rerank node wiring (CPU orchestration, GPU executor)

Boundary: `packages/atlas-core` stays CPU-only (no PyTorch dependency). The node calls an existing GPU executor over NATS (`gpu.cuda.rank`) or HTTP. Tensor math stays in the executor. Existing stub: `makeOptionalGpuRerank` in `packages/atlas-core/src/langgraph/worker.ts` (TODO, unwired).

- [ ] AWM-06-01 Inventory the executor that will serve `gpu.cuda.rank` (candidate: an existing `:8098` or `:8121` service). Record its owner, its input and output schema, and its revision. Do not add a second owner.
- [ ] AWM-06-02 Define the request contract: candidate ordinals, `source_ref`, `source_revision`, float32 `semantic_768` vectors by reference (not inline JSON), and a `workspace_revision`. Reject any request missing those identities.
- [ ] AWM-06-03 Build the CPU reference rerank for the same candidates and the same inputs. This is the oracle.
- [ ] AWM-06-04 Gate promotion on GPU-26 metric equivalence: ordering, tie handling, and score tolerance must match the CPU oracle on a bounded fixture.
- [ ] AWM-06-05 Typed fallback: any GPU error or missing executor falls back to the CPU order with a receipt naming the reason (GPU-27). The node must never block the graph.
- [ ] AWM-06-06 Wire the node only after AWM-06-04 passes. Until then the stub stays, and the graph runs unchanged.
- [ ] AWM-06-07 Measure latency and transfer overhead against the CPU path on the bounded fixture. Promotion needs a measured win, including transfer cost.

Blocked by: GPU-26, GPU-27. AWM-06-02 identity uses candidate ordinals and packet keys until Phase 10 supplies `source_revision`.

## Sequencing (operator decision, 2026-10-15)

Execution order: Phase 7 Top-K/PageRank → Phase 8 reviewed-label model evaluation → Phase 9 diagnostic AST/semantic/contextual retrieval. All implementation that creates, persists, propagates, changes writer policy for, invalidates from, or backfills source/workspace/related `*_revision` fields—including legacy Phases 1–2/10—is deferred until after workstation P20+ and closure of `parent-atlas-gpu-sidecar-patch-tournament`. Phase 10 is a legacy workstream label, not permission to execute it before that gate.

Risk recorded: Phases 7–9 run before source revisions exist. Grounding and training data are therefore identified by packet key and source ref, not by revision. Every gate below treats that as an explicit limitation, not as qualified evidence.

## Phase 7 — Top-K and PageRank candidates (uses existing owners)

### Authority source contract (defined 2026-10-15)

- **Authority source:** NetworkX/cuGraph PageRank computed over a frozen graph snapshot (graph revision + node-table and edge-table hashes). Neo4j GDS is a challenger and a stale source; it is not the authority.
- **Parameters:** damping 0.85, tolerance 1e-12, max iterations 1000, uniform dangling redistribution. The NetworkX run must record the same parameters, or the result is labelled PARITY_ONLY.
- **Admission gate (must pass before any write to `atlas_graph_authority_scores`):**
  - at least 100 distinct score values;
  - reference edges present (CALLS, IMPORTS, REFERENCES, or resolved call edges). Containment-only graphs (DERIVED_FROM, CONTAINS) are rejected;
  - a non-degenerate top-K (no flat top score across the candidate set);
  - graph revision checksum recorded; source revisions deferred to Phase 10.
- **Current state:** the parity snapshot (`sveltekit-frontend/docs/reports/graph-snapshot-parity`, revision dff9006f…) fails the gate: 2 distinct scores, 54,078 nodes at the maximum, containment-only edges. It is a valid parity fixture, not an authority source.
- **Frozen candidate receipt:** `sveltekit-frontend/docs/reports/pagerank-frozen-candidates-v1.json` (top-50 by key tie-break, candidatesChecksum `sha256:d050…`). Marked NOT_ADMITTED_AS_AUTHORITY.

### Frozen corpus candidates rule

- A candidate set is fixed by graph revision plus candidatesChecksum. Never edit a frozen set in place; a changed snapshot or parameter set produces a new revision.
- A set is usable for Top-K only if its admission gate passes. A non-admitted set may serve as a parity fixture, never as a ranking claim.

### Next step to unblock Phase 7

Build a snapshot that includes reference edges (CALLS/IMPORTS/REFERENCES) from the admitted structural owners, then re-run the gate. The Phase 7 items below stay open until that snapshot passes.



Owners: PageRank authority (`atlas.pagerank-authority.v1`, see parent-atlas-graph-validation-fabric and graph-analysis-contract); Top-K fusion (SearchRuntime single owner).

- [ ] AWM-07-01 (unchecked 2026-10-15: notes below say PARTIAL; the snapshot figures are cited only by the receipt and workboard, not re-verified this session) Produce PageRank-ranked candidate sets from the authority table only. Qdrant and Neo4j are projections; the authority table is the source. Verified from snapshot `8129be75-9b01-43a4-a08c-3bdd39ec66c6` in `atlas_graph_authority_scores` (1,761 distinct scores, non-degenerate range 0.15–5.71, reference edges present, read-only).
  - BLOCKED_REFRESH_SOURCE (2026-10-15): the authority refresh script (`scripts/atlas/promote-pagerank-authority-from-neo4j.mjs`) reads Neo4j `Packet.pagerank`. Neo4j is not reachable (dry run fails to connect; AGENTS.md runs Engram-only with `NEO4J_ENABLED=false`). CLAUDE.md also marks GDS PageRank as stale and names NetworkX/cuGraph as the trusted PageRank path. Choosing the authority source is an owner decision before any refresh.
  - PARTIAL (read-only check, 2026-10-15): `atlas_graph_authority_scores` has 212,398 rows, 5 snapshots (newest 2026-08-29), 56,980 distinct packets. 116,862 rows (55%) join `atlas_packets`. Staleness and join coverage must be resolved before candidate sets are trusted.
- [x] AWM-07-02 Feed candidates into the existing SearchRuntime Top-K fusion. No second fusion, no second RRF vote. Verified in `src/lib/server/atlas/retrieval/search-runtime-adapter-graph.spec.ts` (2/2) and `src/lib/server/atlas/retrieval/graph-retriever.spec.ts` (2/2): graph expansion candidates are de-duplicated against fused packets and do not add duplicate RRF votes.
- [x] AWM-07-03 Require each candidate to hydrate with a terminal disposition (HYDRATED or a typed rejection). Silent drops are a failure. Verified in `src/lib/server/retrieval/hydrate-candidates.spec.ts` (6/6, re-run 2026-10-15): all candidates reach terminal states (`HYDRATED`, `AMBIGUOUS_SOURCE_REF`, `MISSING_SOURCE_REF`).
- [x] AWM-07-04 Replay the Function Registry seed through Top-K. Result (receipt `docs/reports/candidate-hydration-proof-v1-function-registry-seed.json`): the seed qualifies, then hydration returns AMBIGUOUS_SOURCE_REF (2 chunk rows, no revisions). Separately, the seed packet has NO score in any PageRank snapshot, so PageRank-based candidate generation omits it before hydration. Two distinct failure points, both recorded.
- [x] AWM-07-05 Bounded fixture receipt: candidate counts per stage, rejection reasons, PageRank version, checksum. Writes nothing. Emitted in `docs/reports/phase7-topk-hydration-receipt.json` (`schema: atlas.phase7-topk-hydration-receipt.v1`): 25 sampled, 1 HYDRATED, 24 rejected (10 MISSING_SOURCE_REF, 14 AMBIGUOUS_SOURCE_REF), 1 admitted to ContextManifest, 0 unhydrated promotions, `writes_performed: false`, gate PASS.

Gate to leave Phase 7: a receipt where every candidate has a terminal disposition, and no candidate is promoted without HYDRATED status.

## Phase 8 — QLoRA / safetensors fine-tuning (challenger, gated)

Owners: ATLAS-LEARNING-01 (reviewed labels), POLICY-05 (promotion rules and rollback pointer), E5 (challenger). Adapter artifacts are separate revisions from the Ornith serving model.

- [ ] AWM-08-01 Training examples come only from reviewed, query-grouped pairs. No generated reasoning traces, no hidden-thought logs, no unreviewed model output as ground truth.
- [ ] AWM-08-02 Each example carries packet key, source ref, and evidence ref. Examples without a revision are labelled `REVISION_UNQUALIFIED` and cannot be used for promotion metrics.
- [ ] AWM-08-03 Train a safetensors adapter as a challenger against the frozen baseline on the same held-out split. Store it under a new adapter revision with a checksum.
- [ ] AWM-08-04 Promotion needs held-out metrics, a rollback pointer, operator approval, and a re-run after Phase 10 qualifies the training set.
- [ ] AWM-08-05 Adapter load or unload changes the model revision in prefill and synthesis cache identities.

Gate to leave Phase 8: the reviewed label set meets the trust floor (ATLAS-LEARNING-01: 200 rows, 30 per class). Current state: 49 of 200 reviewed rows.

## Phase 9 — Canonical AST, semantic, and contextual recommendations: index, retrieve, rank

Owners: canonical packet persistence (semantic packet writer, subject to the revision-policy audit), SearchRuntime, ContextManifest (Phase 10 admission), Ornith synthesis with citation verification.

- [ ] AWM-09-01 Index canonical AST symbols and semantic chunks with their packet keys. Use the existing AST and tree-sitter producers; no new parser.
- [x] AWM-09-02 Retrieve through SearchRuntime lanes (lexical, semantic, AST) with one vote per logical lane. Verified in `src/lib/server/atlas/retrieval/recommendation-smoke.spec.ts` (1/1): multi-lane candidates emit with relevance probability, reason codes, and graph paths under single-lane fusion.
- [ ] AWM-09-03 Rank recommendations with the Phase 7 candidate set and the Phase 8 adapter only when promoted. Fallback is the baseline ranking, with a receipt naming the reason.
- [ ] AWM-09-04 Ground each recommendation in admitted evidence IDs. Citation verification follows the fail-closed verifier (MISSING_SOURCE_REVISION rejects until Phase 10).
- [ ] AWM-09-05 Bounded end-to-end receipt: one request, retrieved candidates, ranked recommendations, citations, rejections. Labelled DIAGNOSTIC_ONLY while revisions are missing.

Gate to leave Phase 9: a receipt where every recommendation is either grounded to an admitted evidence ID or explicitly rejected with a reason.

## Legacy Phase 10 — source_revision propagation (execution deferred to post-P20)

This section groups the deferred source-revision work; it does not make it the next sequential phase. Reopens Phases 1–2 and the chunk-writer apply only after the Post-P20 gate below. Existing authorization, source-owner reconciliation, dry-run, and independent readback requirements remain in force.

- [ ] AWM-10-01 Resolve CURRENT-SOURCE-OWNER-RECONCILIATION-01 before any writes. Source authority and byte identity are separate gates.
- [ ] AWM-10-02 Resolve SOURCE-REVISION WRITER OWNERSHIP between the chunk writer and semantic packet writer (COALESCE policy). Test matrix: initial insert, identical replay, missing revision, changed bytes, stale writer, historical mismatch.
- [ ] AWM-10-03 Authorize and run the single-file apply (scripts/atlas/connection-config.mjs), with readback.
- [ ] AWM-10-04 Backfill only qualified cohorts, in batches, with readback. The 1,928 changed-file and 366 missing paths stay NULL until reprocessed.
- [ ] AWM-10-05 Re-run Phases 7–9 with revision-qualified identities, and re-check training data under AWM-08-02.

## Post-P20 gate (operator sequencing decision, 2026-10-15)

Do not start bulk revision production, source-revision writer changes, Phases 1–2/legacy Phase 10, or the items below until: (a) the parent-atlas workstation phase gates through P20 are complete, and (b) `parent-atlas-gpu-sidecar-patch-tournament` has closed its tasks. A thematic match to the tournament is not an ownership claim; confirm its scope first. This scheduling deferral does not suspend existing runtime revision checks: unqualified or mismatched evidence must continue to fail closed, and current bounded read-only lineage proofs may continue.

## Post-P20 backlog (operator-listed, not started)

- [ ] PX-01 (post-P20) Source revision: Phase 1 change detection, Phase 2 invalidation, and legacy Phase 10 writer/readback/backfill (see above); preserve fail-closed runtime qualification before and during the deferral.
- [ ] PX-02 ast-grep symbol and function ranking: rank symbols and functions by structural match, under the existing ast-grep observation owner. No new parser.
- [ ] PX-03 Adaptive fine-tuned backprop: challenger-only, gated by Phase 8 rules (reviewed labels, held-out split, promotion needs approval).
- [ ] PX-04 Hot / warm / cold MLP: tiered residency and ranking by an MLP challenger; tier decisions must trace to a receipt, not to an HLL count alone.
- [ ] PX-05 User +1/-1 feedback from queries: feedback is a reviewed signal. Record it as an outcome event with query, candidate, and evidence IDs. It never directly changes ranking or training until reviewed.
- [ ] PX-06 Query summaries and keyword analysis: summaries and keyword extraction under the existing summary and keyword owners; outputs stay non-authoritative.
- [ ] PX-07 "Did you mean" suggestions: suggest query corrections from the qualified lexical and symbol indexes. Suggestions never replace the user query silently.

## Integration addendum (2026-10-15, append-only)

Verified against repo evidence on 2026-10-15:
- [x] Legacy symbol materializer (`scripts/atlas/materialize-ast-symbol-versions.mjs`) is read-only by default; apply requires `--limit=N` and `ALLOW_LEGACY_SYMBOL_VERSION_BYPASS_WRITE`.
- [x] Legacy packet materializer (`scripts/atlas/materialize-addressable-packets.mjs`) builds synthetic objects (`extractSyntheticObjects`). These are not native AST nodes and must not seed canonical identity.
- [ ] P12 cohort counts (22,532 exact; 1,909 mismatches; 1,086 nested; 15 unavailable; total 25,542). NOT FOUND in any P12 receipt; the totals appear only in unrelated reports. Do not cite until a receipt exists.
- [ ] P13 zero eligible training candidates. Not verified in this pass.

Corrections adopted:
- Cosine similarity ranges over [-1, 1]. Any LUT that expects [0, 1] uses the documented transform `s = (cos + 1) / 2`.
- The baked polynomial sets prefetch and residency priority only. It never sets source authority or final retrieval rank.
- LOD work stays DIAGNOSTIC_ONLY until source authority, native AST lineage, and ContextManifest admission are qualified.

- [x] Workspace revision removed from the first native lineage trace by operator decision (2026-10-15); deferred. Trace: docs/reports/native-ast-lineage-trace-bounded-tool-caller-v1.json.

- [ ] AWM-10-03 DEFERRED (operator, 2026-10-15): the five-row source_revision apply for bounded-tool-caller.ts is not authorized to run. Execution waits until after the workstation P20 gates. Do not offer it as the next step.

## Handoff (2026-10-15)

Full phase, legacy-label, and audit status lives in `docs/parent-atlas-phase1-20-master-todo.md`. This section covers only what this change owns.

**Verified this session**
- Synthesis proof (`scripts/atlas/prove-retrieval-summarization-flow.mjs`): Ornith `ornith-1.5-9b` on `:8090`; LangExtract passes natively; fail-closed citation verifier with 8 unit cases; last live run WARN (one rejected revision).
- Kanban writer (`scripts/agents/repair-registry.ts`, `repair-loop.ts`): deterministic IDs; done-guard; rethrow on failure. Rollback proof replayed as SQL, not through the TypeScript function.
- Function Registry seed qualifies live; hydration returns `AMBIGUOUS_SOURCE_REF` (receipt `docs/reports/candidate-hydration-proof-v1-function-registry-seed.json`).
- Native lineage trace for `bounded-tool-caller.ts` (receipt `docs/reports/native-ast-lineage-trace-bounded-tool-caller-v1.json`): AST and packet bound to current bytes; packet-to-chunk link passes via the lineage table; chunk rows have NULL `source_revision`; workspace revision deferred.
- PageRank: custom reference matches NetworkX on the parity snapshot (receipt `docs/reports/pagerank-networkx-custom-parity-v1.json`); the snapshot fails the authority admission gate (2 distinct scores, containment-only edges).
- Frozen candidate set marked NOT_ADMITTED_AS_AUTHORITY (`docs/reports/pagerank-frozen-candidates-v1.json`).
- Root `CLAUDE.md`: invariants section added, including the deferral rule.

**Deferred, not to be started**
- `source_revision` writes of any kind (chunk apply, backfill, propagation) until after P20. Operator decision, 2026-10-15.
- Tasks AWM-01 and AWM-02 (source change detection and invalidation) and AWM-10 in this file.

**Blocked on a decision**
1. P12 vs P20 numbering conflict.
2. PageRank authority source: NetworkX/cuGraph path recommended; needs reference edges (CALLS, IMPORTS, REFERENCES) from an admitted structural owner.
3. `EMBEDDING_REQUIRE_GPU=true` vs CPU on `:8097`.
4. Valkey eviction-policy persistence and Langfuse secret rotation (both change live services).

**Not yet done**
- Golden retrieval judgments (60 queries, zero judgments): recall cannot be reported.
- Production build, full test suite, desktop app, and app runtime: `NOT_VERIFIED`. The build was started and stopped.
- Skill/GAN/MCP consolidation remains `PARTIAL`: 14 Claude and 10 OpenCode skills were compared; GAN ownership/supersession remains `NOT_VERIFIED`; and the corrected TypeScript-AST MCP audit found 191 direct registrations, 190 unique names, and one unresolved source duplicate. Six bounded live MCP surfaces compiled schemas, but deployed source parity, handler behavior, authorization, configuration reconciliation, and several server lifecycles remain open. See the dated refresh below, `docs/reports/mcp-enabled-surface-consolidation-v2-20261015.json`, and `docs/parent-atlas-phase1-20-master-todo.md`.

**Next step**
Start with the first unchecked item under "Not yet covered" in the master to-do.

**Consolidation audit handoff (read-only, 2026-10-15)**
- Skill comparison: 7 shared names; 4 byte-identical and 3 differ only in OpenSpec slash-command examples. The configured callers are OpenCode agent entries and Claude's `Skill(trace-mcp-tooling)` hook; these are platform-local namespaces, not evidence that either copy is superseded. Claude's `trace-mcp-tooling` frontmatter allowlists 8 tools; OpenCode agent entries enable the broader `trace*` prefix. `atlas-tools-mcp` includes write-capable `record_outcome`, which OpenCode globally denies; preserve the capability label. No copies archived.
- GAN and `toolgan` families have distinct roles. Do not archive based on filename or historical report count; trace callers, side effects, test coverage, and current owner first.
- Fresh GAN fixture gate: `scripts/atlas/prove-gan-adversarial-v1.mts` passed 16/16 probes and five evaluator self-tests. Independent receipt readback confirms `canonicalAuthority=false`, `writesPerformed=false`, and all datastore counters zero; file SHA-256 `716d1970bce3a5e816954bfdb05e3be38e013463cf426fc38f5066a63eaaa7f7` at `docs/reports/gan-adversarial-proof-v1-consolidation-20261015.json`. This is fixture-only, not live data proof.
- Scope/caller review found distinct operations: four package launchers for Tool-GAN plan/dedupe/execute/replay plus `verify:rpc-gan`; execute cannot run shell commands and persistent outcome logging writes ledgers. The live DB GAN reader requires named receipts and writes a new report; the devops smoke script probes services and writes reports. Three older `validate-*-gan.mjs` scripts contain `atlas_story_proofs` INSERT paths. None were run in this refresh. Supersession remains `NOT_VERIFIED`; no script was archived.
- Earlier MCP static census (47 files / 20 direct registration files / 201 call sites) is a historical snapshot. Current literal source search finds 205 `registerTool(` / `.tool(` call sites across 23 TypeScript files: 22 non-test files plus one test. This is a bounded text inventory, not full static-source/schema parity.
- P12/source-revision write deferral remains in force until after workstation P20 gates.
- Validation: `npx openspec validate parent-atlas-adaptive-backprop-hll-monitoring --strict` passed; scoped whitespace check passed. MCP runtime/schema validation remains `NOT_RUN`.

**Retrieval packet architecture audit (read-only, 2026-10-15)**
- `python/miniforge_nlp_sidecar_v2.py` defines `/ast/chunk` with Tree-sitter-derived signature/ancestry and byte spans. Local `@ast-grep/napi` is a separate implementation. The `createLiveStructuralLaneRetrieverV1` adapter has no caller found in the SvelteKit source scan; therefore 8095 → SearchRuntime registration is `NOT_VERIFIED` despite its contract test passing.
- `title_id` is not a fusion result: `generateTitleIdentity` hashes canonical `packet_key` plus generator version, while choosing a display slug from packet feature/symbol/domain evidence. Search query fusion remains SearchRuntime/RRF. Any hot lookup map must be derived, bounded, and keyed by canonical identity plus applicable revisions.
- The RPC packet registry is a contract/descriptor, not an extra canonical key-value store. NetworkX is an existing read-only snapshot consumer; it must consume the revision-qualified graph projection, not reconstruct canonical graph identity from summaries.
- Focused verification: live structural adapter, Function Registry snapshot loader, and ACE context packet assembler specs all passed: 3 files / 8 tests. No running 8095 call, production lane registration, database read, source-lineage replay, ContextManifest admission, or NetworkX live snapshot was exercised.
- Open gates: register/prove the structural provider through the existing lane and SearchRuntime; reconcile exact source/chunk authority before final ContextManifest; then run the graph mirror only from an admitted graph snapshot. SIMDJSON/AVX2 remains a parse/transport optimization hypothesis until a measured bounded batch shows benefit.

**Consolidation follow-up (read-only, 2026-10-15)**
- Python parser fixture follow-up: `docs/reports/atlas-ast-python-sidecar-observation-readonly-20261015.json` records one revision-matched `calculate_score` chunk from the same 8095 `/ast/chunk` owner. It proves parser fixture behavior only, not source-backed corpus lineage or retrieval integration.
- Live discovery receipt `docs/reports/mcp-tool-surface-live-consolidation-20261015.json` reports both probed servers reachable: `atlas-tools` exposed 10 tools and TRACE exposed 193. A fresh read-only TRACE `tools/list` returned 193 unique tools; all 193 input schemas compiled under their declared JSON Schema drafts (Ajv 8.20.0: 16 Draft 7, 177 Draft 2020-12), with zero compile errors or duplicate names. Receipt: `docs/reports/mcp-tool-surface-schema-validation-v1-20261015.json`, toolset SHA-256 `5024992e6d512be7d6c9355f95ad0e3452c6733f2f21914cdc55bc9aa0ea4199`. No `tools/call` was made. Schema compilation is not handler-behavior proof.
- The live `context.prefetch_feature_context` entry has the schema and description in `new_tools.ts`, not the legacy inline block in `trace-mcp-server.ts`; the live list exposes one tool entry. This supersedes the prior claim that the live list could not distinguish the schema. The deployed source/build identity is not verified, so source-to-runtime registration ownership and duplicate cleanup remain open; do not remove either implementation yet.
- The local `@ast-grep/napi` extractor now abstains on Python/unknown hints instead of silently parsing them as TypeScript. The broad-language observation path is the existing 8095 Tree-sitter sidecar; receipt `docs/reports/atlas-ast-sidecar-observation-readonly-20261015.json` proves one bounded source observation only, not production lane registration. `ast-grep.exe` is a structural-pattern tool, not a language detector or per-file parser service; `codebase-memory-mcp` and SIMDJSON are not syntax/identity providers.
- [ ] Add a typed adapter from 8095 Tree-sitter observations into the existing AST retrieval lane for non-JS languages. Dispatch by explicit extension/LSP language ID, retain provider and grammar provenance, exact source byte spans, native node/ancestor IDs, and source identity; reject unsupported languages and mismatched evidence. Keep local AST-grep as an opt-in structural-pattern producer, not a fallback parser. Do not add per-language executables, a second language registry, a new `tree_node_id` derivation, or another fusion owner.
- **Svelte parser cross-check (2026-10-15):** reran `scripts/atlas/svelte-rune-crosscheck-v1.mjs` against ten current components. All splitter receipts matched current source SHA-256; 50 rune calls matched AST-grep with zero mismatches, and all parser/compare stages succeeded. The markup check is only a regex-count sanity check, not independent syntax parsing. Run receipts are `.tmp/atlas/svelte-rune-crosscheck-v2-2026-10-15T23-20-58-729Z-*.json`. The run writes normalized `.ts` scratch files and receipts under `.tmp/atlas/`; corrected receipts disclose those writes, set `canonicalDatastoreWritesPerformed=false`, and use run-stamped, source-path-keyed names. Receipts are diagnostic only; this does not prove 8095 → SearchRuntime registration, canonical AST identity, source-revision qualification, or graph persistence.
- The proposed `tree_node_id`/hyperedge minting sketch is not an admission implementation: IDs and relations must join to canonical source and symbol identity, and cross-file `CALLS`/`REFERENCES` require a resolution owner rather than syntax-only guesses. Source-revision writes remain deferred until after workstation P20; no new table persistence or graph-lane routing is authorized by parser parity.
- [ ] Reconcile the duplicate context tool definitions and skill-referenced names against their intended live server schemas, retaining write-capability labels.

### Consolidation refresh — 2026-10-15 22:30Z
- **Skills:** Current inventory remains 14 Claude / 10 OpenCode / 7 shared. Four shared files are byte-identical; the other three differ only in slash-command spelling. OpenCode's `mcp-toolchain` agent allows `trace_*`, `turbovec_*`, `engram_*`, and `langextract_*`, but the root OpenCode MCP list declares only TRACE, Atlas tools, and Atlas task kernel; the frontend config separately enables TurboVec/Engram-related endpoints. Live TRACE advertises TRACE/Engram/TurboVec tools but zero names containing `langextract`. The four-provider workflow is therefore not proven end-to-end; reconcile the two OpenCode config roots and LangExtract tool/transport before calling it backed. No duplicate skill is proven superseded.
- **GAN:** Exact scoped inventory is 12 GAN-token files under `scripts/atlas`, one additional `validate-gan-tool-calls.mjs` under `sveltekit-frontend/scripts/atlas`, and 7 `agentic-toolgan` files. The old “17 scripts” total is not supported by these explicit scopes. Three legacy validators contain database proof-table insert branches; `prove-gan-audit-readonly-v1.mts` documents a historical lowercase source-ref policy drift, but does not prove it supersedes the distinct validators. ToolGAN execute remains proposal-only; `agentic-toolgan-log-outcome.mjs` writes local ledgers. Fixture receipt hash rechecked; no validators or mutation paths executed.
- **GAN guard/supersession follow-up:** `validate-feature-envelope-gan.mjs` records only when `--apply` is supplied (and exits before DB proof persistence for `--dry-run`); `validate-provenance-gan.mjs` and `validate-qdrant-join-gan.mjs` likewise gate their `atlas_story_proofs` INSERT/UPSERT branches on `--apply`. Treat all three as write-capable and do not invoke with `--apply` absent a separate authorization. `gan-validate-live-packets.mts` opens a PostgreSQL pool, reads a sample, and writes a fixed `.tmp/gan-validate-live-packets-report.json`; it is not a no-side-effect probe. `prove-gan-audit-readonly-v1.mts` is a distinct read-only DB audit that requires explicit receipt inputs and emits a report; its `supersedes` field only reclassifies two historical receipts for source-ref policy drift. It does **not** establish replacement of the feature-envelope, provenance, or Qdrant-join validators. Thus supersession remains `NOT_VERIFIED`; no archival, script execution, database writes, or live-row validation occurred in this audit.
- **MCP:** Corrected receipt `docs/reports/mcp-enabled-surface-consolidation-v2-20261015.json` supersedes v1, whose regex scanner counted a comment example as a registration and `createToolWithDispatcher(...)` factories as shared handlers. The TypeScript-AST scan finds 191 direct registrations / 190 names and one real source duplicate (`context.prefetch_feature_context`, `new_tools.ts` vs. the legacy inline TRACE implementation); runtime exposes one entry, but deployed source ownership remains unverified. Its fixture run detects the expected synthetic collision and shared-handler alias. Six bounded live surfaces compiled their advertised schemas: TRACE (193), Atlas-tools (10), Atlas-task-kernel list-only (6; normal initialize unverified), gemma4-offload (9), engram-embed (11), and LDR (4). TurboVec `:8791/mcp` returned 404 at initialize. No tools/call was made. Root `playwright` and `socraticode` MCPs were not probed; frontend `:8099` TurboVec sidecar is disabled. Static source-to-runtime/schema parity, handler behavior, authorization enforcement, deployed build identity, and root/frontend config reconciliation remain open. Overall remains `PARTIAL`.
- **Architecture handoff still missing:** The 8095 Tree-sitter observation and local AST-grep are separate observations; no production caller for the live structural-lane adapter is established. AST/semantic/keyword evidence may populate typed, provenance-carrying feature fields in an existing packet, but it must not synthesize `title_id` from query-time fusion scores. `title_id` is deterministic from canonical `packet_key` plus generator version; SearchRuntime owns query fusion/RRF. RPC packet registry is a contract/descriptor, not a second key-value authority; any array/map/LUT is a derived bounded lookup keyed by qualified packet identity and applicable revisions. First prove sidecar → existing structural lane → SearchRuntime → exact chunk/source qualification → ContextManifest; only then construct the NetworkX mirror from the admitted revision-qualified graph snapshot. AVX2/SIMDJSON is an optimization candidate for bounded parsing/packing, not a substitute for the identity joins or an established latency win.
- All observations above are non-canonical; `canonicalAuthority=false`, `writesPerformed=false`. Existing source/workspace revision write deferral until after workstation P20 remains in force.

**Do not**
- Offer the five-row chunk apply as a next step.
- Run any database write without an explicit authorization variable.
- Kill `llama-server` or the `:5173` dev server.

### Consolidation recheck — 2026-10-15
- Skill inventory rechecked from current directories: 14 Claude, 10 OpenCode, 7 shared; four shared files are byte-identical and three differ only in OpenSpec slash-command spelling. No duplicate is proven superseded. Local `repo_*` offload names are present alongside four deprecated `gemma4_*` aliases. `atlas-tools-mcp`'s 10 Atlas-tools references match the mock list; its five task-kernel references are present in the local six-tool facade, while deployed OpenCode activation remains unverified. TRACE tool spelling needs a namespace-normalization check: the skill uses underscore-style names while the live server advertises dotted names (for example `graph.expand_neighborhood`). `record_outcome` is write-capable and must remain permission-labeled.
- Read-only MCP initialize/tools-list and current-format compilation passed for TRACE HTTP **193/193**, local offload stdio **9/9**, Atlas-tools mock stdio **10/10**, and task-kernel stdio facade **6/6** using Ajv 8 plus `ajv-formats`. No `tools/call` was made; datastore writes were zero. Atlas-tools was explicitly in mock mode, and task-kernel initialization only proved its local facade/child startup—not OpenCode agent wiring. The offload compatibility server listed canonical `repo_*` tools and deprecated `gemma4_*` aliases; runtime model execution was not invoked.
- GAN source inventory separates 12 GAN validators/probes under `scripts/atlas`, seven `agentic-toolgan` files, and additional `scripts/phase85/audit-production-gan-readiness.mjs`, `scripts/verify/rpc-validation-gan.mjs`, and `sveltekit-frontend/scripts/atlas/validate-gan-tool-calls.mjs`. Historical validators retain `--apply` database-write branches; the live-packet audit writes a local report; Tool-GAN plan/dedupe/outcome utilities mutate local ledgers. The adversarial fixture proof and read-only live-audit tool have distinct scopes. No script or copy is proven superseded; none was executed or archived in this recheck. The existing fixture receipt SHA-256 was rechecked as `716d1970bce3a5e816954bfdb05e3be38e013463cf426fc38f5066a63eaaa7f7`; it remains fixture-only, not live data proof.
- Recheck receipt: `docs/reports/parent-atlas-consolidation-recheck-v1-20261015.json`; transient MCP tool-surface capture: `.tmp/atlas-mcp-tool-surface-live-20261015.json`.
- Overall remains **PARTIAL**. Remaining configured MCP servers, TRACE skill-name normalization, deployed agent authorization, and the 24-file registry-to-handler audit remain open. GAN ownership/caller proof and supersession remain open; do not infer production readiness from fixture passes or registrations.

### Consolidation verification refresh — 2026-10-15 23:23Z
- **Skills:** Rechecked all seven same-named skill copies across Claude/OpenCode/Codex. Four are byte-identical; the other three differ only in platform-specific OpenSpec slash-command examples. No copy is superseded. The Claude `atlas-tools-mcp` permission list includes `record_outcome`, which writes a local ledger and Neo4j; preserve that explicit write boundary. TRACE skill alias normalization remains unverified.
- **GAN:** Re-read the current validators, callers, and task gate. The read-only audit's `supersedes` field reclassifies two historical source-ref-policy receipts only; it does not replace the separate feature-envelope, provenance, or Qdrant-join validators. The three validators have `--apply`-guarded `atlas_story_proofs` writes; live packet validation writes a local report; Tool-GAN outcome/dedupe utilities write local ledgers. No scripts ran, no scripts were archived, and no family-wide supersession is proven.
- **TRACE live surface:** One fresh list-only request to `http://127.0.0.1:8788/mcp` returned HTTP 200 and 193 unique tools with 193 input schemas. Ajv compiled all schemas (16 Draft 7, 177 Draft 2020-12), with zero schema errors. No `tools/call` was made and no report was written. This does not establish source/runtime handler parity, deployed build identity, or authorization enforcement.
- **TRACE source/runtime name reconciliation:** A fresh TypeScript-AST scan of `sveltekit-frontend/src/mcp/**/*.ts` excluding tests found 46 source files, 17 files with literal `server.registerTool` sites, 191 registration sites and 190 unique names. Against live TRACE, 184 names overlap; six literal registrations are absent live (`trace.bifrost_dispatch`, `codebase.rg_search`, three `research.*`, `kb.rg_atlas_search`), while nine live names are registered through non-literal helper/array paths (six Phase 109A entries in `phase109a-mcp-tools.ts`, three `atlas.*` entries in `native-acceleration-tools.ts`). The sole duplicate remains `context.prefetch_feature_context`. The older disabled-tool receipt is dated 2026-09-14 and cannot establish today's reason for those six absences. No handler was called; source/runtime semantic parity and deployed build identity remain open. The prior “24 registry files” denominator is not supported by this scoped census.
- **Reconciliation statuses:** skill-copy comparison `PASS` (supersession `NOT_VERIFIED`); GAN owner/supersession review `PARTIAL`; TRACE live list/schema compilation `PASS`; literal-source/live name reconciliation `PARTIAL`; deployed authorization and handler execution `NOT_RUN`. Checksums and exact deltas are in `docs/reports/mcp-source-live-reconciliation-20261015T232655Z.json`.
- **AST diagnostic correction:** ten current Svelte components still pass their source-bound rune comparison (50 total, zero mismatches). The saved `.tmp` receipts now truthfully declare local scratch writes; markup equality remains regex-count heuristic only. See `scripts/atlas/svelte-rune-crosscheck-v1.mjs` and the stamped receipts under `.tmp/atlas/`.
- Validation: strict OpenSpec validation passed after this refresh. Overall consolidation remains **PARTIAL**; keep supersession, complete MCP configuration/source/handler reconciliation, production authorization, and the 8095-to-SearchRuntime AST adapter open.

## HLL helper alignment audit (2026-10-16, read-only; `DIAGNOSTIC_PASS`, no code changed)

Inventory: shared client `sveltekit-frontend/src/lib/server/atlas/telemetry/atlas-hll-telemetry.ts` (`AtlasHllTelemetryClient`, `buildHllRegisterKeys(namespace, windowId)` -> `atlas:hll:<ns>:<window>:{workflows,symbols,sessions,errors,sources}`) has NO production caller (only its own spec). Two scripts bypass it with private `redis-cli` adapters and ad hoc keys.

| Producer | Key(s) | Finding |
|---|---|---|
| `scripts/atlas/warm-bitfrost-agent-cache.mjs` | `bitfrost:agent:hll:keys` | One register receives task_id, story_id, packet_key, feature_id AND source_ref, so its count mixes five entity kinds and is not interpretable as any one cardinality; no window. |
| `scripts/atlas/warm-feature-identity-cache.mjs` | `feature-identity:hll:featureIds`, `:sourceRefs` | Separate registers per kind (good), but `sourceRefs` adds a hash of the source_ref, and there is no window or namespace. |

Live state (Valkey `legal-ai-valkey`, auth verified, 175 keys): neither key family exists, and no code outside the two scripts reads them. Renaming them therefore breaks no consumer and loses no history.

- [x] HLL-ALIGN-01 (DONE 2026-10-16) Route both warm scripts through the shared client (one register per entity kind, namespace + window from `buildHllRegisterKeys`), keeping the mjs scripts' `redis-cli` adapter behind the `HllRedisAdapter` interface. Retire the mixed-kind register. Dry-run first; HLL stays breadth telemetry only (never identity or evidence; Valkey is disposable).
- [ ] HLL-ALIGN-02 (PARTIAL: window = UTC day via `buildDailyHllWindowId`, applied in both scripts; TTL still open) Decide the window policy (per run vs per day) and a TTL for the registers; the scripts currently accumulate without either.
- [x] HLL-ALIGN-03 (DONE 2026-10-16) Add a test that records a mixed batch and asserts the five registers stay separate, so the single-register pattern cannot return.

HLL-ALIGN-01/03 implementation notes (2026-10-16): the shared client gained `buildHllEntityKey`, `buildDailyHllWindowId`, `recordEntityBatch` (per-kind registers, de-duplication, PFADD chunked at 6,000 combined characters, adapter results coerced to numbers) and `queryEntityEstimates`; the five-register `recordTelemetryBatch` and `buildHllRegisterKeys` are unchanged. `warm-bitfrost-agent-cache.mjs` now records `tasks/stories/packets/features/sources` into five registers under `atlas:hll:bitfrost-agent-warm:<UTC day>:<kind>` (one batched call instead of one `docker exec` per row); `warm-feature-identity-cache.mjs` records `features` and `sources` (canonical-source-ref HASHES, documented as non-mergeable with raw-path registers) under `atlas:hll:feature-identity-warm:<UTC day>:<kind>`; both CLI adapters now return the PFADD result as a number. Verified: HLL spec 6/6 pass (3 new, including the mixed-kind regression); both scripts pass `node --check`; `warm-feature-identity-cache.mjs --limit=400` dry run prints the new key names and writes nothing; a real-Valkey smoke test (throwaway namespace `hll-align-smoke`, 120 s expiry) recorded 300 long source paths through the `redis-cli` adapter in chunks and returned `{packets:3, sources:300, features:1}`. NOT run: `warm-bitfrost-agent-cache.mjs` and `warm-feature-identity-cache.mjs --apply` (both write cache entries; operator approval needed). `added` in the result counts PFADD calls that changed a register, not elements (same semantics as `recordTelemetryBatch`). Unrelated finding: `warm-bitfrost-agent-cache.mjs` still carries a literal database password in its `DB_URL` fallback; move it to env only (not changed here).

### Chunk workspace-binding audit and post-P20 gate recheck — 2026-10-18
- Read-only audit receipt: `.tmp/atlas/chunk-workspace-binding-audit-20261018.json` (receipt checksum `sha256:2ea095d565eb496aea86a0fd7652936014b4b7ca49a01040a0cb567d72dc626d`). The audit ran bounded SELECTs in a read-only transaction; `sourceRevisionRead=true` (diagnostic only), local working-tree/current-HEAD and two historical commit blobs were read only for the 51 affected refs, and `writesPerformed=false`.
- For workspace `sha256:e24bb97187ea6394eeba457dd849915f570045b7a1867780fdc7aa9ea62b9acc`, 180,081 chunks match the exact source-ref binding and 179,221 also match the whole-file content digest; 860 source-ref matches fail the content-digest check. All 860 have non-null `file_content_hash` values differing from the binding `content_digest`; they span 51 source refs. Metadata groups are 475 rows/34 refs marked `content_hash_scope=chunk`, SHA-256 v1, and 385 rows/17 refs with hash metadata absent; none has `content_hash = file_content_hash`. All 860 lack `source_revision` and `workspace_revision`. Writer fingerprints split them into 801 `fullrepo` rows across 49 refs indexed on 2026-09-15 with `embeddinggemma:latest` and `chunk_source` metadata, and 59 `fullrepo` rows across 2 refs indexed 2026-07-04 with the task-prefix model and no `chunk_source` metadata. These are fingerprints only. The current `scripts/atlas/index-full-repo-for-search.mjs` whole-file-hash INSERT change was introduced in commit `aba4c17dc464f1c37a6bd9b1158e9ece90f13446` at 2026-09-15 14:51 PDT, after the 801 rows' recorded `indexed_at` range (17:59–20:54 UTC); therefore that current code cannot explain those original index timestamps. A separate dry-run report at `docs/reports/backfill-codebase-chunk-index-file-content-hash-v1.json` (2026-09-15 21:53 UTC) found 270,766 rows already populated and updated 0, but does not identify which historical operation populated the 860 mismatches. Do not attribute either cohort to a specific writer. The selected Graphify execution `74d50c86-8194-45ea-8c3d-61aab737ef83` has membership for all 51 refs; its content hashes match the workspace binding for 51/51, and its `code_source_revision` digest matches the binding digest for 51/51. None of the 860 chunk hashes equals that current source digest. A bounded local worktree comparison found 2 refs matching the admitted binding digest, 21 matching a stored chunk `file_content_hash`, and 28 matching neither (3,437,290 total bytes). Current Git `HEAD` blobs matched the admitted digest for 0 refs, matched a stored chunk hash for 9, and matched neither for 42 (3,403,626 bytes); the bindings had no Git blob OID for any of the 51 refs. Both byte comparisons are diagnostic only, not sealed-snapshot proof. This supports that the canonical workspace cohort is internally consistent while the chunk projection is from another content generation; exact historical writer attribution and the original bytes remain unavailable. Across three observed workspace revisions, 167,178 matching chunks bind to two or more revisions, so content equality alone cannot choose a unique workspace revision.
- Post-P20 prerequisite recheck: no completion proof for workstation gates through P20 was found in the scoped owner ledgers. `parent-atlas-gpu-sidecar-patch-tournament/tasks.md` still has GPU-21 through GPU-32 open, including GPU-26 metric equivalence and GPU-27 typed fallback; CUDA134-SIMT-CHALLENGER-01 is also open. Revision-field writes/backfills remain deferred. Do not run either existing or newly proposed apply/backfill scripts.
- The selected Graphify execution `74d50c86-8194-45ea-8c3d-61aab737ef83` is explicitly `CURRENT_SNAPSHOT_PROVEN`; an unselected audit remains ambiguous between two qualifying executions. This proves snapshot authority only, not chunk-level lineage or write authorization.
- Additional run-attribution check (2026-10-18): the 860 mismatched chunk rows have no `run_id`, `execution_id`, or `indexing_run_id` in `codebase_chunk_index.metadata`. Grouped by their available metadata, they split into 701 plain-model `TEXT_FALLBACK` chunks across 47 refs, 100 plain-model `large-text` chunks across 2 refs, and 59 task-prefix chunks without `chunk_source` across 2 refs. This supplies no authoritative indexing-run ID; timestamps/model/chunk-kind remain fingerprints, not writer attribution. Audit implementation: `scripts/atlas/audit-chunk-workspace-binding-v1.mjs` (untracked local audit utility); syntax and read-only run passed.
- Graphify file-level run crosscheck: only 39/51 mismatched source refs have a `graphify_files` row; all 39 resolve through `last_seen_run_id` to run `48485685-e773-4433-a1f8-00f5524cca44`, completed `2026-09-05T23:06:59.988Z`, repository revision `b05e25b18ec817b9c21aafdf39196465e206179e`. A follow-up confirmed the other 12 refs are present in the selected execution's `graphify_execution_file_membership_v2`: all 12/12 membership content hashes and source-revision digests match their admitted workspace binding. Thus they are missing only from `graphify_files`, not from the selected execution cohort. This still does not attribute the 860 chunk rows to that Graphify run; no chunk-to-run link exists.
- Historical backfill evidence reconciled: the owner ledger `openspec/changes/parent-atlas-chunk-index-whole-file-hash/tasks.md` records explicit full-table authorization and an applied `--apply` run of `backfill-codebase-chunk-index-file-content-hash-v1.mjs` updating 52,154 rows, followed by a same-day catch-up of 69,815 rows; it reports 10,787 exact file-hash matches after the apply. The currently retained report at `docs/reports/backfill-codebase-chunk-index-file-content-hash-v1.json` is a later `DRY_RUN` (2026-09-15 21:53:55 UTC), with `alreadyPopulated=270766`, `updated=0`, `hashed=0`, so the apply receipt was overwritten or not retained at that path. This makes the whole-file-hash backfill the documented source of the column population, correcting the earlier claim that the operation was unknown. It still does not identify which of the 860 current mismatches were among those backfilled rows or prove the historical source bytes used for each one.
- Row-level receipt recovery check: filename inventory of retained `.tmp/atlas`, `docs/reports`, `logs`, and the owning OpenSpec change found no apply-batch row list or separate apply receipt. Git history for the report path contains only the committed dry-run report; no tracked `APPLY` report version was found. Thus the historical batch totals cannot be joined to the current 860 chunk IDs. Do not infer membership from matching hashes or timestamps.
- Historical Git-blob comparison (read-only, same 51 refs): at `aba4c17dc464f1c37a6bd9b1158e9ece90f13446`, 8 blobs matched the admitted binding digest, 1 matched a stored chunk `file_content_hash`, 37 matched neither, and 5 refs were absent; at `0fdde19a86e82d9d3e86d925eb2bc9d123809853`, 0 matched the admitted digest, 14 matched a stored chunk hash, 37 matched neither, and none was absent. These commit snapshots provide historical byte candidates only; they do not prove the bytes used by the authorized backfill or connect any commit blob to a specific updated row. Preserve `P20_CLOSURE_NOT_PROVEN` and do not backfill from these matches.
- Backfill implementation/evidence check: `scripts/atlas/backfill-codebase-chunk-index-file-content-hash-v1.mjs` updates batches by UUID and accumulates only `rowCount`; the `UPDATE` has no `RETURNING` clause and does not persist batch UUIDs. The retained 2026-09-15 report is explicitly `DRY_RUN` with `updated=0`; the owner ledger documents the prior apply totals, but no surviving artifact links those totals to row IDs. Thus the original per-row backfill set cannot be recovered from the checked-in script/report, even though historical hash matches narrow possible source bytes.
- Database-log recovery check (read-only): live `pg_settings` reports `logging_collector=off`, `log_statement=none`, `log_min_duration_statement=-1`, `archive_mode=off`, and `archive_command=(disabled)`; neither `pgaudit` nor `pg_stat_statements` is installed. Docker uses `json-file` with `max-size=20m`, `max-file=3`. The retained 2026-09-15 PostgreSQL log stream contains 3,009 lines, 0 backfill-script/UPDATE signatures, and 62 `file_content_hash = EXCLUDED.file_content_hash` upsert fragments. These logs therefore add no row-level backfill evidence; absence of a logged signature is not proof the apply did not run because statement logging was disabled.
- Row-history capability check (read-only): the only `codebase_chunk_index` triggers are its search-vector maintenance trigger on INSERT/UPDATE; no chunk-audit/history table or `codebase_audit_events` table exists in the live catalog. `track_commit_timestamp=off`, so current tuple `xmin` cannot be mapped to historical commit time with PostgreSQL's commit-timestamp facility. This closes the remaining in-database row-history avenues checked in this pass; no row-level apply membership evidence was found.
- Prior-snapshot digest crosscheck (read-only, exact 860 current mismatches): zero rows match any older `atlas_workspace_source_bindings.content_digest` for the same source ref; zero affected refs have a prior-revision digest match. The stored chunk hashes therefore cannot be explained by a different retained workspace binding revision in the live binding table. This remains a content-generation discrepancy, not an identity repair candidate.
- Verdict: `READ_ONLY_AUDIT_PASS / P20_CLOSURE_NOT_PROVEN / GPU_TOURNAMENT_OPEN / REVISION_WRITE_DEFERRED`. Continue with read-only evidence and runtime tests only; do not mark deferred tasks complete from this audit.
