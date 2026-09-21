# Parent Atlas Workboard Feature Utility Fabric — Tasks

> Recorded 2026-09-20. Advisory/shadow only. No canonical write, no runtime enablement, no Python
> environment upgrade, no LangGraph-in-GPU-env. Statuses use CREATED / WIRED / DRY_RUN_PROVEN /
> APPLY_PROVEN / NOT_PROVEN only.

## HANDOFF — state as of 2026-09-20 (read this first)

**Status in one line:** advisory/shadow tranche. The controller, canonical stores, tasks.md files and every Python environment are UNCHANGED; everything below is read-only reports, helpers, tests and design. Nothing is promoted.

### What exists (all advisory, `writesPerformed:false`)

| Piece | Files | Verified by |
|---|---|---|
| Studio report cache (S1-B) | `sveltekit-frontend/src/lib/server/atlas/openspec-board/awareness.ts` (+ `awareness.spec.ts`) | vitest 4/4; cold 2,259 ms -> repeat 1 ms |
| WorkboardFeatureVectorV1 (presence masks + basis) | `scripts/atlas/adapt-openspec-controller-to-ranker-v3.mjs` -> `docs/reports/actionable-workboard-v3.json` (`featureVector`, `featureCoverage`, `reviewState`, `taskIdentity`) | order + legacy fields byte-identical when added |
| Low-rank challenger producer | `python/build_low_rank_task_recommendation_v2.py` (+ 8 tests in `python/test_atlas_compute.py`, 15/15 file) | `--include-weak-basis` opt-in; `NEAR_CONSTANT` + presence gates |
| Tasks.md text derivation experiment | `scripts/atlas/derive-workboard-features-from-tasks-v1.mjs` -> `docs/reports/workboard-feature-derivation-v1.json` | dependency/cost NOT derivable; flags weak |
| Ledger metadata convention + identity | `scripts/atlas/lib/wfu-metadata.mjs` (+ `.test.mjs` 18/18), wired into `scripts/atlas/build-openspec-workboard-v1.mjs` | `<!-- wfu: depends=..; est=..; reads=..; writes=.. -->`, `blockHash`, `stableKey`, `logicalTaskKey`, cycle check |
| Authority-review join by logical key + `REVIEW_STALE` (fail closed) | `scripts/atlas/audit-openspec-authority-text-review-v1.mjs`, adapter | `selectionEligible` 2,267/2,267 present |
| NS-7A shadow dependency scheduler | `scripts/atlas/build-dependency-scheduler-shadow-v1.mjs` -> `docs/reports/dependency-scheduler-shadow-v1.json` | `admissionEligible` = false |
| NS-8D id suggestions (NOT applied) | `scripts/atlas/suggest-task-ids-v1.mjs` -> `docs/reports/task-id-suggestions-v1.json` + `.patch` | 2023 suggestions across 52 files; `git apply --check --unidiff-zero` passes; 3 skipped (line drift) |
| Tournament doc | `docs/architecture/PARENT-ATLAS-STUDIO-AWARENESS-TOURNAMENT.md` | slots S1-S7; only S1-B done |

### Regenerate the chain (order matters; the ledger builder can hit a ~40 s Windows file lock — just retry)

`node scripts/atlas/build-openspec-workboard-v1.mjs` -> `node scripts/atlas/run-openspec-execution-controller-atomic-v1.mjs` -> `node scripts/atlas/audit-openspec-authority-text-review-v1.mjs` -> `node scripts/atlas/adapt-openspec-controller-to-ranker-v3.mjs` -> `node scripts/atlas/derive-workboard-features-from-tasks-v1.mjs` -> `(cd python && python build_low_rank_task_recommendation_v2.py)` -> `node scripts/atlas/build-openspec-challenger-tournament-v1.mjs` -> `node scripts/atlas/build-dependency-scheduler-shadow-v1.mjs` -> `node scripts/atlas/suggest-task-ids-v1.mjs`.
Tests: `node --test scripts/atlas/lib/wfu-metadata.test.mjs` · `(cd python && python -m unittest test_atlas_compute)` · `(cd sveltekit-frontend && npx vitest run src/lib/server/atlas/openspec-board/awareness.spec.ts)` · `openspec validate parent-atlas-workboard-feature-utility-fabric --strict`.

### Current numbers (do not quote older ones in this file — they were true when written)

- Open task identity: `{"MIGRATION_TITLE_HASH": 2026, "DECLARED_ID": 1162, "DECLARED_ID_SECTION_QUALIFIED": 78, "AMBIGUOUS_DECLARED_ID": 22}`; logical-key coverage of controller-actionable tasks **0.4363** (need 0.95). Declared-dependency coverage of actionable **0.0009** (need 0.95). Shadow counts `{"sameDecision": 4, "incumbentReadyOnly": 0, "dependencyReadyOnly": 0, "unresolvedDependency": 0, "ambiguousDependency": 0, "cycleDetected": 0, "missingMetadata": 3179}`.
- Tournament: default challenger runs on 2 qualified features (`goalRank`, `selectionEligible`); weak-basis (12-feature) ordering is uncorrelated with the deterministic order (Spearman 0.30) — advisory only, no ground truth.

### Decisions waiting on the operator (nothing below was decided or done)

1. **NS-8D apply?** Review `docs/reports/task-id-suggestions-v1.patch`; applying it edits ~2023 lines in 52 tasks.md files (many already carry other sessions' uncommitted edits — check `git status` first). Prefixes are auto-generated from change names and some are long (e.g. `ABRFACA`).
2. **NS-7B admission** of declared dependencies into controller actionability — only after every shadow criterion is met and with explicit approval (coverage bar 95% of actionable).
3. **R13** topic ids: the concurrent session's `topic-identity-v1.ts` uses UUIDv5 (SHA-1); repo policy prefers the UUIDv8 (SHA-256) helper for derived ids — keep as a declared derived index key or switch, before any table stores `topic_id`.
4. **FOREST-01** what "forest" meant (taxonomy/graph forest vs ML tree ensemble / cuML FIL).
5. **REGISTRY-COVERAGE-01a** whether to widen `atlas_callable_search` (a Postgres-writing, reviewed promotion — 285 rows today).

### Known issues / caveats

- Transient Windows file-lock failures (`errno -4094`) hit the ledger builder and adapter; cause never captured (suspected another process holding a generated report). Retry is sufficient so far.
- A concurrent session is also editing `openspec-board/*` and generated reports; regenerated artifacts (`openspec-workboard-v1.json`, `docs/OPENSPEC-WORKBOARD.md`, controller reports, `actionable-workboard-v3.json`) were rewritten during this work. Pre-change copies of the ledger/controller/workboard and the two adapter/builder scripts sit in the session scratchpad only (not in the repo).
- `REVIEW_STALE` path is unit-reasoned but not exercised on real data (all reviews were fresh). `stableKey`/`logicalTaskKey` are order- and heading-dependent in documented ways.
- The taxonomy hierarchy is a clean tree; PART_OF / IS_A / INHERITS_FROM have multi-parent nodes (408 / 8 / 8) — recorded, not fixed.
- I added an eighth topological-sort implementation before the census found 9 others (Duplication Prevention miss) — classify under TOPO-01.

### Recommended next order

NS-8D (operator decides) -> NS-9 (declare `depends=/est=/writes=` on the actionable identity-lane tasks) -> NS-7C (Postgres recursive-CTE `CYCLE` proof) -> NS-7D (compare) -> NS-7B (admission, approval) -> WORKBOARD-DATA-EXEC-01/02 -> WORKBOARD-LANGGRAPH-01 -> STUDIO-DEPENDENCY-01. Keep GPU work out of it: RTX 3060 Ti (Ampere sm_86, 8 GB) is shared with llama-server; no executor here is GPU-justified.

## Ownership split (frozen)

| Concern | Owner | Never |
|---|---|---|
| Process traversal (task → evidence → feature row → rank → tournament → BLOCKED/RECOMMEND/APPROVAL) | LangGraph (checkpoint/resume/approval) | symbol→caller, AST descendants, PageRank/PPR, kNN |
| Indexed knowledge traversal | PostgreSQL 18, NetworkX/cuGraph, pgvector, Qdrant/cuVS | process state |
| Tensor execution | GPU workers behind RPC | identity, ranking authority |
| UI state | SvelteKit 2 SSR + Bits UI v2; IndexedDB = filters/expanded rows/layout only | topic authority, source revisions, tournament winner, promotion receipts |

## Review outcomes — plan vs repo (verified 2026-09-20)

| # | Proposed | Finding | Decision |
|---|---|---|---|
| R1 | New `packages/atlas-utility/` | `packages/parent-atlas/src/core` already has `domain-classification-v1`, `domain-classification-signal-v1`, `feature-matrix(-materializer)`, `identity-v1`, `feature-candidate-classification-v1`, `feature-promotion-eligibility-v1`, `ranking/`, `langgraph/`, `evidence/`, `classification/`; `packages/atlas-core/src/langgraph` exists | **Do not create a peer package.** Add helpers as subdirs/files under `packages/parent-atlas/src/core` (Duplication Prevention: packages first) |
| R2 | New `atlas_topics`, `atlas_topic_aliases`, `atlas_topic_evidence`, `atlas_entity_topics` | 12 topic/domain tables already exist: `taxonomy_nodes`, `taxonomy_edges`, `atlas_domain_ontology`, `domain_taxonomy_v1`, `atlas_concepts`, `atlas_ontology_concepts`, `ontology_domain_tuples`, `document_topics`, `feature_domain`, `feature_domain_facts`, `atlas_taxonomy_assignment_candidates`, `warden_hmm_topics` | **Classify each first (WFU-06a); extend the canonical owner.** Create a new table only if no owner fits, recorded in the runtime-ownership registry |
| R3 | `topic_id = UUIDv5` (or UUIDv8 if SHA-256 required) | Repo canonical derivation is UUIDv8 over canonical JSON: `sveltekit-frontend/src/lib/utils/uuid.ts` `UUID_DERIVATION_REVISION='atlas.uuid.derive.sha256-canonical-json-uuidv8.v1'` | **Use the existing UUIDv8 derivation.** UUIDv5 stays compatibility/index-key only |
| R4 | UUIDv7 for run/receipt ids | PG18.4 `uuidv7()` verified working | Adopt for `crawl_run_id`, `classification_run_id`, `tournament_run_id`, `receipt_id` |
| R5 | AIO + bitmap scans | `pg_aios` view present; `io_method=worker`; `pg_trgm`, `vector` installed; **`btree_gin` NOT installed** | Bitmap-AND across separate btree/GIN indexes needs no `btree_gin`. Claim no AIO benefit until `EXPLAIN (ANALYZE,BUFFERS)` + `pg_aios` show it (WFU-07) |
| R6 | `remainingRequiredGates`, `unblocksGateCount`, `prerequisiteCount`, `downstreamBlockedCount` | Controller `dependencyGraph.status = TASK_LEDGER_DEPENDENCY_RECEIPTS_NOT_DECLARED`; `dependsOnTaskIds` empty on all 2,309 actionable rows; declared dependency data exists only as `blockerGroups` (5 groups, 561 tasks in `DECLARED_TASK_DEPENDENCY`) for *waiting* tasks | **Not derivable today.** Stay absent (present=false) until the ledger declares dependency receipts (WFU-09b) |
| R7 | Feature fields generally | Measured varying on real data: `goalRank`(8), `priority`(2), `lastUpdatedAt`(37, controller), `lane`(3), `readOnly`(2), `selectionEligible`(2). Constant: `kind`, `eta`, `state`, `executionState`, all 13 defaulted numerics | Build the first vector from these; everything else present=false |
| R8 | Anime.js | **Not a dependency** in `sveltekit-frontend/package.json` | HTML `<progress>` + CSS + WAAPI first; Anime.js only after a proven gap (DEPENDENCY-CAPABILITY-GUARD-01) |
| R9 | `.okf` vocabulary | `./.okf` and `sveltekit-frontend/src/lib/server/mcp/okf-resource-catalog.mjs` exist | Reuse for WFU-05; do not add a second vocabulary owner |
| R10 | Admin routes `/admin/atlas/{topics,domains,registry,tournaments,retrieval,cache}` | `(app)/admin/atlas` and `(app)/admin/atlas/ontology` exist; studio is `/atlas/studio/openspec` | Extend those routes; do not fork a parallel admin tree |
| R11 | PyTorch guidance | 2.14.0 is latest stable (web-verified; CUDA-matrix claims from operator note, not independently verified). Repo: Windows 2.8.0+cu128, WSL2 rapids 2.13.0+cu130, WSL2 cuTile 2.14.0+cu132, Docker decoder/rank 2.13.0-cuda13.2 | Freeze roles below; no upgrade in this tranche |
| R12 | New `atlas_work_items` / `atlas_work_item_edges` / `atlas_tournament_*` tables | Work-item persistence already exists: `kanban_tasks` (claim token, heartbeat, attempts, idempotency_key), `kanban_task_dependencies` (parent/child edges), `kanban_task_events`, `task_registry`, plus `graphify_audit_kanban`, `workflow_tasks`, `agent_tasks`. **`kanban_tasks`, `kanban_task_dependencies`, `kanban_task_events`, `task_registry` are all EMPTY (0 rows)** | **Do not add parallel work-item tables.** Classify the kanban tables as the candidate owner (WORKBOARD-TRAVERSAL-01a); decide an openspec-task-key mapping (e.g. via `idempotency_key`) before any write. Tournament run/candidate/receipt tables only if no owner fits |
| R13 | WFU-01 not started | A concurrent session already built it: `sveltekit-frontend/src/lib/server/atlas/knowledge/topic-identity-v1.ts` (+ spec), `scripts/atlas/audit-topic-identity-readiness-v1.ts`, `docs/reports/topic-identity-readiness-v1.json` = `DERIVED_TOPIC_IDENTITIES_PROVEN` (16 topics, 0 duplicate topic/title ids), `canonicalAuthority:false`, Postgres table `NOT_CREATED`. It derives `topicId` with **UUIDv5 (SHA-1)**, not the repo's UUIDv8 helper (R3), and lives under `knowledge/`, not `packages/parent-atlas/src/core` (R1) | Treat WFU-01 as PRESENT (not reviewed line-by-line). **Open decision before any table persists `topic_id`:** keep UUIDv5 as a declared derived index key (`canonicalIdentity:false`, record algorithm + namespace per repo UUID policy) or switch to the UUIDv8 derivation. Not resolved here |
| R14 | `atlas_callable_search` 285 vs 11,067 | **Measured 2026-09-20 (REGISTRY-COVERAGE-01, read-only).** Not a failed writer: `scripts/atlas/materialize-ast-symbol-versions.mjs` is a bounded, reviewed promotion (default read-only; `--apply` requires `--limit=N`; only nominations already resolving to an active canonical `atlas_symbol_registry` row are eligible; variables never eligible). Funnel: `atlas_symbol_registry` 10,454 active (+50 retired) -> resolution artifact 42,524 rows (8,727 CANONICAL / 33,797 UNRESOLVED) -> nomination artifact **461 rows** (function 46, method 36, interface 30, type 6, class 5, **variable 338 ineligible**) -> registry 285 rows. AST side: 1 source revision, 2,203 files, function 1,764 / class 3,675 / type 2,281 (TypeScript 1,730 fn, JavaScript 34 fn) | Classification `GATED_BY_DESIGN__UPSTREAM_NOMINATIONS_SPARSE` (replaces my earlier `REGISTRY_MATERIALIZATION_INCOMPLETE` guess). Widening coverage = producing/reviewing more nominations, a Postgres-writing promotion decision (not run here) |
| R15 | pgvector iterative HNSW scan | pgvector **0.8.3** installed; `hnsw.iterative_scan` exists (registers once the vector library loads in a session) and is currently `off` | Available for filtered semantic search; enable per-query (`SET LOCAL hnsw.iterative_scan = relaxed_order`) only after an exact-vs-HNSW recall proof (SEMANTIC-INDEX-01) |
| R16 | LangGraph durable execution | Web-verified: checkpointer saves state each super-step; `interrupt()` pauses until resume (needs checkpointer + thread id, payload JSON-serializable). Caveat from the same search: checkpoint-resume is not exactly-once side effects. `langgraph-checkpoint-postgres` is already an optional pin in `docker/langgraph-synthesis/requirements.txt` | Nodes must be idempotent; side effects (writes, Valkey, notifications) go after an approval interrupt and carry idempotency keys; durable checkpointer = Postgres, opt-in by flag |
| R17 | PG18 AIO + bitmap scans | Web-verified (PostgreSQL 18 release notes): AIO subsystem covers sequential scans, bitmap heap scans, vacuum; `io_method` = sync / worker / io_uring; `pg_aios` shows in-flight AIO. Local: `io_method=worker` | Confirmed as a real optimization path, not a new table/index type. Prove per query with `EXPLAIN (ANALYZE, BUFFERS)` + `pg_aios` (PG18-PLAN-01) |

## Python/GPU environment roles (frozen)

| Environment | Role | Rule |
|---|---|---|
| Windows `C:\Python313` (torch 2.8.0+cu128) | CPU utilities, existing tests, low-rank producer | not a canonical GPU runtime; migrate later after caller audit |
| WSL2 `atlas-rapids-cu13` (2.13.0+cu130) | RAPIDS/cuVS/cuGraph | keep isolated; no LangGraph, no cuTile |
| WSL2 `atlas-cutile-cu132` (2.14.0+cu132) | cuTile/SIMT/new GPU PyTorch | best-aligned current lane |
| Docker LangGraph (Python 3.12) | orchestration | CPU-only, no torch; calls GPU workers over RPC |

GPU budget: llama-server holds ~7.5 GB of the 8 GB card. Training/clustering runs when it is idle or on CPU; never load RAPIDS + cuTile + a training job together.

## Priority order

| Order | Phase | Why |
|---|---|---|
| 1 | WFU-09, WFU-10 (+ TOURNAMENT-FEATURES-01) | the actual blocker. **2026-09-20: feature vector + presence masks + producer wired; only 2 weak qualified features exist — real independent features still need upstream production (WFU-09b/09d)** |
| 2 | Studio S1/S2 (see tournament doc) | SSR cost (~320 MB parsed per load) + staleness visibility |
| 3 | WFU-01..05 | deterministic helpers, no DB |
| 4 | WFU-06..08 | schema (after R2 classification) + indexed retrieval + FeaturePacket |
| 5 | WFU-11..13 | admission, UI, smoke suite |

## Phases

### WFU-01 — TopicIdentityV1
- [ ] Normalize topic key (`namespace/name[/version]`); derive `topic_id` via existing UUIDv8 (R3); title is display only.
- [ ] Version-distinct topics stay distinct where versions differ materially (e.g. TypeScript 5 vs 7).

### WFU-02 — LanguageRegistryV1
- [ ] Language detect + registry; reuse `atlas_ast_nodes.language` and treesitter-chunker language names before adding any enum.

### WFU-03 — KeywordEvidenceV1
- [ ] Keyword/identifier extraction and rg / ast-grep query builders; output = evidence objects, never canonical writes.

### WFU-04 — AST/rg evidence adapter
- [ ] rg evidence resolves `sourceRef`; ast-grep evidence resolves `treeNodeId` (reuse `AstGrepObservationV1`, `atlas_callable_search`).
- [ ] Record the registry coverage gap: `atlas_callable_search` 285 rows vs `atlas_ast_nodes` 11,067 — explain before relying on it.

### WFU-05 — OKF vocabulary adapter
- [ ] Map evidence onto `.okf` vocabulary (domain, language, concepts, relations `IMPLEMENTS/CALLS/READS/WRITES/DEPENDS_ON`). OKF defines vocabulary; it does not retrieve.

### WFU-06 — Postgres topic/domain schema
- [ ] **WFU-06a** Classify the 12 existing tables (R2) as CANONICAL_OWNER / BACKEND / ADAPTER / DEAD in `docs/architecture/runtime-ownership-registry.json`.
- [ ] **WFU-06b** Only if no owner fits: additive migration (`drizzle/manual/*.sql`, `IF NOT EXISTS`), disposable-DB proof first; no `drizzle-kit push`.
- [ ] Indexes: BTREE (topic_id, topic_key, domain_id, language_id), GIN (aliases[], tags[], tsvector title+description), `pg_trgm` (title, normalized alias). pgvector/HNSW only if topic semantic search proves useful.

### WFU-07 — Indexed retrieval + EXPLAIN proof
- [ ] Multi-predicate query (domain + language + FTS + active) shows Bitmap AND/OR plan; record `EXPLAIN (ANALYZE, BUFFERS, WAL, SETTINGS)` and `pg_aios` output (R5).
- [ ] Decide `btree_gin` only if a mixed multicolumn GIN is actually needed.

### WFU-08 — FeaturePacketV1
- [ ] Deterministic checksum; carries topic/domain/language evidence with `packet_key`, `source_ref`, `source_revision`, `producer_revision`.

### WFU-09 — WorkboardFeatureVectorV1 (blocker)
- [x] **WFU-09a** (2026-09-20, WIRED) `featureVector` (`atlas.workboard-feature-vector.v1`) added to every task by `scripts/atlas/adapt-openspec-controller-to-ranker-v3.mjs`: 14 features, each `{present, value, basis}` with basis `OBSERVED | DERIVED | PROXY | HEURISTIC | ABSENT`; absent = `present:false, value:0`, never a default. Top-level `featureCoverage` reports present/absent/basis/distinctValues/`qualifiedVarying` per feature. **Additive:** verified all 2,309 task ids + ranks identical and every legacy field byte-identical before/after regeneration.
- [ ] **WFU-09b** (2026-09-20: text derivation tried, 12 edges / 2,298 tasks — **not derivable from tasks.md**, see TOURNAMENT-FEATURES-01 / NS-1) Dependency fields (`prerequisiteCount`, `unblocksGateCount`, `remainingRequiredGates`, `downstreamBlockedCount`) stay absent until the task ledger declares dependency receipts (R6); upstream ask. See R12 (kanban dependency table exists but is empty).
- [x] **WFU-09c** (measured on the real controller, 2,309 actionable tasks) qualified + varying today: `goalRank` (DERIVED from `priority`, 8 distinct) and `selectionEligible` (DERIVED from the authority text review, 2 distinct). Excluded by basis: `sourceAgeSeconds` (PROXY — `lastUpdatedAt` is the `FILESYSTEM_MTIME` of the containing tasks.md, 62 distinct) and `mutationRisk` (HEURISTIC — title-text guess). Absent everywhere (10): prerequisiteCount, evidenceReceiptCount, affectedFileCount, remainingRequiredGates, unblocksGateCount, estimatedMinutes, risk, evidenceReuse, goalClosure, cacheAffinity.
- [ ] **WFU-09d** `goalRank` is the deterministic sort's first key and equals `priority`, so the two qualified features are only weakly independent of the order being challenged. Real independent signals (cost, dependency, evidence reuse, task-level freshness) still need upstream production.
- [ ] Reuse the `CandidateFeatureMatrix` philosophy (`packages/parent-atlas/src/core/feature-matrix.ts`) when the vector is promoted beyond the adapter.

### WFU-10 — Tournament feature population
- [x] (2026-09-20) `python/build_low_rank_task_recommendation_v2.py` reads `featureVector` only (never the legacy defaulted scalars); uses a feature only if present on >= 90% of tasks, qualified basis (`OBSERVED|DERIVED`; `--include-weak-basis` opts in PROXY/HEURISTIC) and non-constant; missing cells are mean-filled and reported; fewer than 2 usable features -> `DEGENERATE_INSUFFICIENT_FEATURE_VARIANCE`.
- [x] Tests in `python/test_atlas_compute.py` (13/13 pass): determinism, non-authoritative, single-feature refusal, legacy defaults ignored, weak basis excluded unless opted in, sparse feature rejected.
- [x] First real comparison (advisory): tournament `COMPARISON_AVAILABLE`, 2 qualified features (`goalRank`, `selectionEligible`), rank 2; 2,309 tasks compared, mean |rank delta| 227.5, identical rank on 144; top-10 / top-50 / top-200 overlap 3/10, 21/50, 93/200. **Not evidence of a better ranking** — only that two weak features order tasks differently; challenger stays `eligibleForAuthority:false`.
- [ ] Retire the adapter's legacy defaulted scalar fields (`lowRankScore=0.5`, `estimatedMinutes=15`, `remainingRequiredGates=999`, ...) once a consumer census shows nothing reads them (unchanged for now).

#### TOURNAMENT-FEATURES-01 — derive the features from tasks.md (2026-09-20, read-only, advisory)

Question: can the missing ranking features be derived from the OpenSpec tasks.md text itself? **Answer: partly — enough for routing/classification signals, not enough for dependency, cost or a trustworthy ranking.**

Built (CREATED, not wired into the adapter): `scripts/atlas/derive-workboard-features-from-tasks-v1.mjs` -> `docs/reports/workboard-feature-derivation-v1.json` (deterministic, ~0.6 s, `writesPerformed:false`). Producer extended: `python/build_low_rank_task_recommendation_v2.py` gained a `NEAR_CONSTANT` guard (non-modal values < 1% of tasks), a `TEXT_DERIVED` weak basis, and 6 new feature names; all 15 tests in `python/test_atlas_compute.py` pass (2 new for this producer: near-constant rejection, text-derived needs opt-in).

**How far it got**

| Step | Result |
|---|---|
| Join controller rows to tasks.md blocks | 9,143 rows: 6,879 by recorded line, 2,252 only by text search, 12 unresolved (99.9%). **24.8% of controller `line` values are stale** (tasks.md edited after the controller ran) — the line number cannot be trusted |
| Actionable workboard tasks located | 2,298 of 2,309 (11 unlocated stay absent); 1,098 have a named ID (`**ID — title**`) |
| File paths extracted | 274, of which 263 exist on disk (96%) — but only 154 tasks (6.7%) mention any |
| Receipts extracted (`*-vN.json`) | 59, of which 49 exist in `docs/reports` — 38 tasks (1.7%) mention any |
| Prerequisite edges (ID + cue word: after / requires / gated behind / depends on ...) | **12 resolved, 9 unresolved IDs across 2,298 tasks**; `prerequisiteCount` non-zero on 7 tasks (0.3%), `remainingRequiredGates` on 3 (0.13%) |
| `unblocksGateCount` / `downstreamBlockedCount` | only computable for the 1,098 named-ID tasks; non-zero on 9 |
| Keyword flags | `requiresHumanApproval` 33 (1.4%), `schemaRisk` 139 (6.0%), `productionRisk` 228 (9.9%), `externalDependencyRisk` 64 (2.8%) — HEURISTIC, precision not measured |
| `specLineCount` (block length, cost proxy) | all 2,298, 41 distinct values, 1-60 |
| `estimatedMinutes`, `historicalMedianMinutes` | **not derivable** — no estimate or history exists in the text |

**Tournament with the derived features** (scratchpad copy, not the canonical workboard; `--include-weak-basis`): 12 features used at rank 3 (goalRank, selectionEligible, sourceAgeSeconds, mutationRisk, evidenceReceiptCount, affectedFileCount, evidenceReuse, specLineCount, requiresHumanApproval, schemaRisk, productionRisk, externalDependencyRisk); rejected: prerequisiteCount + remainingRequiredGates (`NEAR_CONSTANT`), unblocksGateCount + downstreamBlockedCount (present on 1,098/2,309 only).

| Comparison | Value |
|---|---|
| Spearman vs deterministic rank | 0.298 |
| Top-10 / top-50 / top-200 / top-500 overlap | 0/10, 1/50, 19/200 (chance ~17), 191/500 (chance ~108) |
| Spearman vs the 2-feature challenger | 0.100 — ordering swings with the feature set |

**Conclusions (do not overstate)**

1. Dependency and cost features are **not derivable from tasks.md text** — prerequisites are almost never declared in a parseable way (12 edges / 2,298 tasks) and there are no estimates. This confirms R6 empirically; it needs a ledger contract change, not a better regex.
2. The 12-feature ordering is essentially uncorrelated with the deterministic order and unstable across feature sets. With no outcome data and assumed signs (+ receipts, - spec size/risk), it is **not evidence of a better ranking** and must stay `eligibleForAuthority:false`.
3. The text-derived flags are more useful as **routing/classification signals** (human-approval / schema / production / external risk -> LangGraph BLOCKED vs APPROVAL) than as ranking inputs — after a hand-labelled precision check.
4. Default producer behavior is unchanged: without `--include-weak-basis` it still uses only `goalRank` and `selectionEligible`.

**Next steps (logged for OpenSpec integration)**

- [x] **NS-1 Ledger metadata contract (needs an operator decision).** Add an optional, machine-readable per-task convention in tasks.md (e.g. declared `depends:`, `est:`, `reads:`/`writes:`) parsed by the controller, so dependency/cost become OBSERVED instead of guessed. This is the only route to real `prerequisiteCount` / `remainingRequiredGates` / `estimatedMinutes` (WFU-09b). **DONE 2026-09-20 (CREATED + fixture-proven):** convention `<!-- wfu: depends=ID,ID; est=MINUTES; reads=path,path; writes=path,path -->` (inline on the checkbox line or in its indented block) parsed by `scripts/atlas/build-openspec-workboard-v1.mjs`; ids resolved local-first then globally-unique; invalid declarations fail visible (`declared.unresolvedDepends`, no dependency fields emitted); adapter labels declared fields OBSERVED/DERIVED. Piloted on NS-3..NS-6 below (author estimates, not measured throughput). Adoption is the remaining work.
- [x] **NS-2 Controller freshness.** Emit a content hash of each task block and the source file hash in `openspec-execution-controller-v1.json`; 24.8% stale `line` values show the join cannot rely on line numbers. **DONE 2026-09-20:** ledger rows now carry `blockHash` (sha256 of the task block) and the workboard carries `sourceFileHashes` (sha256 per tasks.md). The controller still joins by line; consumers should prefer `blockHash` — see follow-up in the log.
- [ ] **NS-3 Precision check.** Hand-label ~50 tasks for `requiresHumanApproval`, `schemaRisk`, `productionRisk`, `externalDependencyRisk`; record precision/recall before any use (TOURNAMENT-04). <!-- wfu: depends=NS-1; est=90; reads=docs/reports/workboard-feature-derivation-v1.json; writes=none -->
- [ ] **NS-4 Route, don't rank.** Use the checked flags as BLOCKED/APPROVAL routing inputs in WORKBOARD-TRAVERSAL-02; keep them out of the ranking until NS-3 and NS-5 pass. <!-- wfu: depends=NS-3; est=120; reads=docs/reports/workboard-feature-derivation-v1.json; writes=packages/atlas-core/src/langgraph -->
- [ ] **NS-5 Decision + outcome logging.** Reuse `kanban_task_events` (empty, R12) to log recommendation, decision and outcome per task; without outcomes no ranking claim can be evaluated (then XGBoost -> shadow bandit per the recorded direction). <!-- wfu: depends=none; est=180; reads=none; writes=kanban_task_events -->
- [ ] **NS-6 Adapter integration (behind a flag).** Merge the derived features into `featureVector` with basis `TEXT_DERIVED` / `HEURISTIC` only after NS-3; the canonical workboard is unchanged today. <!-- wfu: depends=NS-3; est=60; reads=docs/reports/workboard-feature-derivation-v1.json; writes=scripts/atlas/adapt-openspec-controller-to-ranker-v3.mjs -->

#### NS-1 / NS-2 implementation + pilot result (2026-09-20)

Built: `scripts/atlas/lib/wfu-metadata.mjs` (pure helpers, 10/10 `node --test scripts/atlas/lib/wfu-metadata.test.mjs`) wired into `scripts/atlas/build-openspec-workboard-v1.mjs`; the controller already spreads extra row fields; the adapter already read `dependsOnTaskIds` / `estimatedMinutes` / `readSet` / `writeSet` and now labels declared fields honestly (`remainingRequiredGates`, `unblocksGateCount` = DERIVED from declared edges; `estimatedMinutes` = OBSERVED as declared; `mutationRisk` from declared `writes=` = DERIVED, else the title-text HEURISTIC).

| Check | Result |
|---|---|
| Ledger rows with `blockHash` | 9,253 of 9,253; `sourceFileHashes` for 90 tasks.md files |
| Pilot declarations (NS-3..NS-6 in this file) | 4 declared, 0 unresolved, 0 warnings; `remainingRequiredGates` NS-3=0, NS-4=1, NS-6=1; NS-3 `unblocksGateCount`=2 |
| Reached the workboard `featureVector` as observations | yes (NS-3, NS-5 are ACTIONABLE): `prerequisiteCount` OBSERVED, `estimatedMinutes` OBSERVED (90, 180), `remainingRequiredGates` / `unblocksGateCount` DERIVED, `affectedFileCount` OBSERVED |
| Coverage on the 2,258-task workboard | each new feature present on 1-2 tasks: **adoption, not code, is now the limit** |
| Bug found + fixed during the pilot | the parser matched the convention's own documentation (a literal example in NS-1's text); comments inside inline code spans are now ignored (tested) |
| Default challenger after regeneration | **DEGENERATE again** (1 qualified varying feature, `goalRank`): `selectionEligible` is present on 1,920 / 2,258 tasks (85% < the 90% presence gate) because `openspec-authority-text-review-v1.json` (2,309 rows, 2026-09-19) is stale against the regenerated ledger — 338 tasks lost their review row when line-based `taskKey`s shifted after other sessions edited tasks.md |

Notes / limits:
- The pilot estimates (`est=`) are **author estimates**, not measured throughput; the ledger `eta` contract (receipt-linked durations only) is unchanged.
- The controller's own `executionState` still comes from its keyword rules (`classifyExecutionState` / `classifyBlocker`); declared `depends=` edges do not yet drive ACTIONABLE vs WAITING (NS-7). NS-4 and NS-6 are not in the actionable set today for keyword reasons, not because of their declared dependency on NS-3.
- One adapter run returned exit code 1 during this work and succeeded unchanged on rerun; the error was not captured (suspected transient Windows file lock on a generated report) — not verified.
- Regenerated generated artifacts during the pilot: `docs/reports/openspec-workboard-v1.json`, `docs/OPENSPEC-WORKBOARD.md`, the controller reports, `actionable-workboard-v3.json`, `workboard-feature-derivation-v1.json`, `openspec-challenger-tournament-v1.json`. Pre-change copies of the ledger/controller/workboard and the two scripts were kept outside the repo (session scratchpad).

- [ ] **NS-7 Declared dependencies drive execution state (needs an operator decision — the controller is the deterministic authority).** For tasks that declare `depends=`, derive WAITING_ON_DEPENDENCY vs ACTIONABLE from `remainingRequiredGates` instead of keyword guesses. Changes authority behavior; do not enable silently.
- [ ] **NS-8 Stable task identity for joins.** Key downstream joins (authority text review, tournament, receipts) by `blockHash` (or a declared stable id), not `change:line`; refresh `openspec-authority-text-review-v1.json` after ledger regeneration. Restores the 338 `selectionEligible` cells and the second qualified feature.
- [ ] **NS-9 Adoption.** Declare `depends=` / `est=` / `writes=` on the tasks that matter first (identity/authority lane, the ~200 controller-actionable rows), then re-measure `featureCoverage`; tournament features stay `PRESENT_ON_TOO_FEW_TASKS` until coverage passes the 90% gate or the gate is deliberately changed.

#### NS-7 / NS-8 groundwork after web research (2026-09-20)

Web-verified design points (search, not primary standards): (1) Kahn's algorithm is the *legality layer* of a scheduler — nodes left unprocessed mean a cycle; priorities, batching and resource limits are separate logic, so declared dependencies must not replace the deterministic priority order. (2) Line-number keys re-mint a task's identity when unrelated lines move; the fix people converge on is a content hash for identity with position kept as a separate non-identity field. Sources: Medium "Mastering Kahn's Algorithm", FalkorDB "Topological Sort Algorithm: A Practical Guide for 2026", GitHub issue Emasoft/ai-maestro-janitor#291 (line number embedded in a dedupe key), dysthesis/demiurge#18 ("Stable identity for tasks").

Implemented (in `scripts/atlas/lib/wfu-metadata.mjs`, 13/13 `node --test`):
- **Cycle legality check (NS-7 prerequisite):** Kahn over declared `depends=` edges; cycle members and tasks downstream of a cycle get `declared.dependencyState = CYCLE_OR_DOWNSTREAM_OF_CYCLE` and NO dependency fields (fail visible). Independent declared fields (`est=`, `writes=`) still emit. No real cycles exist yet (0 of 4 declarations). This does **not** change ACTIONABLE/WAITING — that remains NS-7.
- **Stable task identity (NS-8, emitted only):** every ledger row now has `stableKey` = `change#<16 hex of sha256(change + normalized title)>`, ignoring checkbox state, the wfu comment, emphasis and case, so a `[ ]`->`[x]` flip, a line move or a metadata edit keeps it; a title edit changes it; identical titles within a change get `~2`, `~3` (order-dependent — documented limitation). `taskKey` (`change:line`) is unchanged for compatibility.

Real-data measurements: 9,256 ledger rows, 9,256 unique `stableKey`s, 51 duplicate-title disambiguations. Against the previous ledger, of 9,143 old `change:line` keys **6,854 still point at the same task, 536 now point at a DIFFERENT task, and 1,753 are missing** — the concrete size of the line-key drift that broke the authority-review join.

- [x] **NS-8a (partly done 2026-09-20) Migrate consumers to `stableKey`.** DONE for the authority-review join: `audit-openspec-authority-text-review-v1.mjs` emits `stableKey`; `adapt-openspec-controller-to-ranker-v3.mjs` joins by `stableKey` and trusts a legacy `change:line` key only for review rows that carry no `stableKey`. Fresh regeneration: review 2,264/2,264 rows keyed, `selectionEligible` present on 2,264/2,264 (was 1,920/2,258), default challenger `OK` on `goalRank` + `selectionEligible`, tournament `COMPARISON_AVAILABLE`. **Limits:** that recovery is what any fresh regeneration would also give; drift-tolerance itself is covered only by the `stableKey` unit tests, not by an end-to-end stale-review run. STILL OPEN: the tournament script, `derive-workboard-features-from-tasks-v1.mjs` and receipts still join by `change:line`. Original text: The authority text review (`openspec-authority-text-review-v1.json`), the tournament, the derivation script and receipts still join by `change:line`. Migrate them, then refresh the review; only then does `selectionEligible` recover its 338 lost cells.
- [ ] **NS-8b Duplicate-title policy.** 51 same-title pairs rely on occurrence order; decide whether to require a unique leading id (`**ID — ...**`) for tasks that carry declarations.
- Operational note: the ledger builder hit a transient Windows file-write error (`node:fs:2425`) once and succeeded on retry; same class as the earlier unexplained adapter exit 1. Cause not captured.

### WFU-11 — ACE / BitFrost admission
- [ ] `TopicEvidence → FeaturePacketV1 → validation → admission → ACE candidate → residency → BitFrost/Valkey`. Topic discovery never warms caches directly.
- [ ] Cache keys carry `topicId`, `workspaceRevision`, `sourceRevision`, `featureRevision`, `representationRevision`; centroid = qualified member vectors + checksum; a cluster/centroid never becomes topic identity.

### WFU-12 — Parent Atlas Studio UI
- [ ] SvelteKit 2 SSR + Bits UI v2, Svelte 5 runes; extend `(app)/admin/atlas` and `/atlas/studio/openspec` (R10). SSR snapshot from Postgres/receipts; SSE for live run/receipt updates.
- [ ] Progress = native `<progress value max>` + label; CSS/WAAPI for basic motion; Anime.js only for complex tournament timelines after a proven gap (R8).
- [x] Studio S1-B (2026-09-20): `openspec-board/awareness.ts` snapshot cache keyed by (dir, name, size, mtime) + in-flight dedupe; `awareness.spec.ts` 4/4 pass; real reports: cold 2,259 ms → repeat 1 ms; cold RSS ~789 MB unchanged. Result recorded in `docs/architecture/PARENT-ATLAS-STUDIO-AWARENESS-TOURNAMENT.md`.
- [ ] Studio S1-C (summary sidecars to remove the cold parse) and `readOpenSpecBoardSnapshot` caching remain open; S2 (freshness) from the same doc.

### Additional phases from the 2026-09-20 traversal/index review

| ID | Phase | Notes |
|---|---|---|
| WORKBOARD-TRAVERSAL-01 | Postgres task + edge snapshot | **01a** classify `kanban_tasks` / `kanban_task_dependencies` / `kanban_task_events` / `task_registry` / `graphify_audit_kanban` / `workflow_tasks` / `agent_tasks` first (R12); tables are empty today so the snapshot is a schema decision, not a migration of live data |
| WORKBOARD-TRAVERSAL-02 | LangGraph process traversal | ready -> fan-out specialists -> verify -> tournament -> approval `interrupt()`; idempotent nodes; Postgres checkpointer opt-in (R16). LangGraph traverses WORK only — never symbol/AST/PageRank/kNN traversal |
| REGISTRY-COVERAGE-01 | Explain the registry gap (**DONE read-only 2026-09-20 — see result block below; follow-ups 01a-01d open**) | counts by language / kind / source revision: AST symbols, callable-eligible, registry populated, missing; classify `COVERAGE_BY_DESIGN` vs `REGISTRY_MATERIALIZATION_INCOMPLETE` (R14). Do this **before** adding indexes |
| ONTOLOGY-INDEX-01 | `feature_ontology_tuples` query-shape census | capture real predicates first; GIN only for `@>`/array/jsonb shapes, composite B-tree for `(subject_id,predicate)` shapes; consider FKs or revision-qualified validation receipts. Currently 9 B-tree indexes, no GIN, no FK |
| PG18-PLAN-01 | Bitmap AND/OR + AIO proof | `EXPLAIN (ANALYZE, BUFFERS, WAL, SETTINGS)` on domain + language + FTS + active; read `pg_aios`; no "AIO bitmap table" exists (R17) |
| SEMANTIC-INDEX-01 | Exact vs filtered HNSW | exact cosine oracle vs pgvector HNSW with `hnsw.iterative_scan=relaxed_order` under domain/workspace filters (R15); IVFFlat / Qdrant / cuVS / CAGRA remain challengers. No persistent Top-K table — candidates stay request-scoped in `CandidateOrdinalMap`/manifest |
| WORKBOARD-UI-01 | HTML/CSS truth | native `<progress value max>` + label, server-state values, SSE-backed live updates; IndexedDB for filters/layout only |
| WORKBOARD-UI-02 | Optional motion | CSS/WAAPI first; Anime.js (not installed, R8) only for complex tournament/graph timelines after a proven gap |

#### REGISTRY-COVERAGE-01 result (2026-09-20, read-only, no writes)

| Measure | Value |
|---|---|
| `atlas_ast_nodes` | 11,223 rows; 1 `source_revision`, 1 workspace, 0 superseded, 2,203 files |
| AST function / class / type | 1,764 / 3,675 / 2,281 (TypeScript fn 1,730, JavaScript fn 34) |
| `atlas_symbol_registry` (canonical) | 10,454 active, 50 retired |
| Resolution artifact (`.tmp/atlas/graphify-file-index-v1/ast-symbol-resolution.jsonl`, 2026-09-09) | 42,524 rows: 8,727 CANONICAL, 33,797 UNRESOLVED |
| Nomination artifact (same dir, 2026-09-09) | 461 rows; promotable kinds 123 (function 46, method 36, interface 30, type 6, class 5); variable 338 ineligible |
| `atlas_callable_search` | 285 rows / 30 source files; function 65, type 23, class 6, **NULL `node_kind` 191** |
| Registry revision schemes | **200 rows `workspace:0` (legacy placeholder, 24 files)** + 85 rows SHA-256 revision (6 files) |
| Registry producer | `atlas-ast-symbol-version-materializer-v1` / projection `atlas-callable-search-v1` (all 285) |
| Path forms | registry `source_ref` mixes `sveltekit-frontend/src/...` and `src/...`; materializer's `canonicalAstSourceRef` strips the prefix, so prefixed rows predate or bypass it |

Caveat: the resolution/nomination artifacts (graphify file index) and `atlas_ast_nodes` were not proven to describe the same symbol population; treat the funnel as directional.

- [ ] **REGISTRY-COVERAGE-01a** Decide whether to expand nominations from the 8,727 canonical-resolved symbols. Human-gated: `--apply --limit=N` writes to Postgres; do a read-only dry run first and record the receipt.
- [ ] **REGISTRY-COVERAGE-01b** The 200 `workspace:0` registry rows carry a legacy revision. Repo rule: never coerce a SHA-256 revision into legacy `0`. Classify them historical / non-promotion-eligible or re-materialize under a real revision.
- [ ] **REGISTRY-COVERAGE-01c** 191 of 285 registry rows (67%) have NULL `node_kind`; find the writer path that leaves it unset (`enrich-ast-callable-search.mjs` vs the materializer) before relying on `atlas_callable_search_node_kind_idx`.
- [ ] **REGISTRY-COVERAGE-01d** Reconcile the mixed `sveltekit-frontend/` prefix in `source_ref` before joining registry rows to `atlas_ast_nodes.relative_path`.
- [ ] Do not add indexes to `atlas_callable_search` for coverage reasons: it already has 8 GIN + 6 B-tree indexes on a 285-row table; the gap is upstream nominations, not index shape.

### Topology / DAG / forest census + web research (2026-09-20, read-only)

Scope: topological sort, forests and link topology across OAKLIB, NetworkX, cuGraph/RAPIDS and cuVS. "Has link topology forest" is read here as the taxonomy hierarchy (`taxonomy_nodes.parent_key`) and its typed edges (`taxonomy_edges.relation`) — an interpretation, not confirmed.

**Web-verified (search summaries; primary docs not opened)**

| Topic | Finding |
|---|---|
| NetworkX 3.6.1 | `topological_sort`, `topological_generations`, `dag_longest_path`, `is_forest` exist; a cyclic graph raises `NetworkXUnfeasible`; `topological_sort` is built on `topological_generations`. Local Windows Python has networkx 3.3 |
| OAKLIB | `ancestors()` / `descendants()` and graph-walk strategies across adapters; the SQL adapter precomputes the relation-graph closure; traversal can stand in for reasoning. A NetworkX adapter was **not** confirmed by the search |
| cuGraph / RAPIDS | connected components, strongly connected components and a **C++** DAG / topological-sort API are documented (cugraph_cpp docs). **Measured TOPO-04 (WSL2 `atlas-rapids-cu13`, cuGraph 26.06.00): the Python API has NO topological sort** (no `topological_sort`, no name matching topo/dag/forest); CC / SCC / WCC exist |
| nx-cugraph | search found nothing, so it was **measured (TOPO-04, nx-cugraph 26.06.00, networkx 3.6.1 in that env)**: accelerates `is_forest`, `is_branching`, `ancestors`, `descendants`; does **not** accelerate `topological_sort`, `topological_generations`, `is_directed_acyclic_graph`, `dag_longest_path`. The CPU NLP sidecar reports `nx_cugraph:false`, `cugraph:false` |
| cuVS | vector search (ANN/exact kNN) only — it has no topological-sort or forest role |

**Live measurement on the taxonomy (NetworkX 3.3, read-only Postgres export)**

| Graph | Result |
|---|---|
| `taxonomy_nodes.parent_key` | 5,527 nodes, 5,526 edges, 1 root, 0 missing parents; `is_forest` True (one weakly connected tree), DAG, 4 generations, longest path 3. Single column, so in-degree <= 1 by construction |
| `taxonomy_edges` overall | 62,802 edges: PART_OF 57,751 / IS_A 5,008 / INHERITS_FROM 43 |
| PART_OF | 36,544 nodes, DAG, **not a forest**: 408 nodes have multiple incoming edges; 397 weakly connected components |
| IS_A | 5,009 nodes, DAG, `is_forest` True but **8 nodes have multiple IS_A parents** (NetworkX `is_forest` is an undirected-acyclic test; single inheritance needs `is_branching`) |
| INHERITS_FROM | 51 nodes, DAG, 8 components, 8 nodes with multiple incoming |

**Repo census — every existing topological-sort / DAG / forest implementation found (Duplication Prevention)**

| Where | What it is |
|---|---|
| `python/atlas_compute/typed_graph_runtime.py` | typed graph executor, backend enum `networkx` / `cugraph` (NetworkX = oracle, cuGraph = challenger); candidate CANONICAL_OWNER for Python graph algorithms |
| `python/graph_snapshot_parity_networkx_oracle.py`, `..._cugraph_oracle.py` | NetworkX <-> cuGraph parity pipeline (PageRank + Louvain), live-proven |
| `python/parent_atlas_spectral_multihop.py` | contains topological / DAG logic |
| `python/atlas_oak_kernel.py` | real oaklib kernel (`get_adapter`, `OboGraphInterface`, `ancestors`); layered owner from `parent-atlas-ontology-kernel` |
| `scripts/atlas/build-error-fix-dag.mjs` | error-fix DAG builder |
| `sveltekit-frontend/src/lib/server/features/ai/ace/kag-dag-runner.ts` (+ spec) | KAG DAG runner |
| `sveltekit-frontend/src/lib/server/retrieval/document-dag.ts` | document DAG |
| `sveltekit-frontend/src/lib/server/atlas/graph/s-graph-taxonomy.ts` | taxonomy graph |
| `sveltekit-frontend/src/lib/server/analysis/agentic-fix-proposal.ts` | fix-proposal ordering |
| `scripts/atlas/lib/wfu-metadata.mjs` (this session) | Kahn cycle check over declared task dependencies |

**Honest correction:** the NS-7 groundwork added an eighth topological-sort implementation (`wfu-metadata.mjs`) *before* this census — a Duplication Prevention miss. It is small, Node-side, and specific to task-ledger legality (the ledger builder is Node; the Python executors cannot be called from it), so it stays local for now, but it must be classified alongside the others (TOPO-01), not silently kept.

**Conclusions**
- At this scale (5.5K nodes / 62.8K edges; task ledger 9.3K nodes) CPU NetworkX is sufficient; a GPU path (cuGraph on the RTX 3060 Ti) is not justified by size and would need a proven capability gap (DEPENDENCY-CAPABILITY-GUARD-01). cuVS is irrelevant to topology.
- The taxonomy hierarchy is clean (a single tree); the typed-edge layers are DAGs with real multi-parent structure (PART_OF 408, IS_A 8, INHERITS_FROM 8) — data-quality facts to classify, not defects to fix here.

- [ ] **TOPO-01** Classify all 10 implementations above in `docs/architecture/runtime-ownership-registry.json` (CANONICAL_OWNER / BACKEND / ADAPTER / EXPERIMENT / COMPATIBILITY / DEAD); decide whether TS-side DAG helpers share one module or stay per-purpose.

  **Runtime ownership audit correction (2026-09-21, read-only):** `scripts/atlas/audit-runtime-ownership.mjs` now understands the registry's existing domain-scoped `owners[]` contract and deferred optional challenger classifications (`OPTIONAL_CHALLENGER_NOT_INSTALLED` / `OPTIONAL_CHALLENGER_NOT_WIRED`). The audit passes with zero violations; semantic_768 and symbol_identity remain explicitly `not_proven`, and challenger lanes remain deferred rather than canonical. This removes a stale audit false failure but does not close TOPO-01, which still requires classification of the ten topology implementations and the TS helper ownership decision. Test: `node --test scripts/atlas/audit-runtime-ownership.test.mjs`; command: `npm run atlas:docs:runtime-ownership`.
- [ ] **TOPO-02** Keep `wfu-metadata.mjs` Kahn local, or replace it with a shared helper if TOPO-01 names a Node-side owner; record the decision.
- [ ] **TOPO-03** Add taxonomy invariants as a read-only smoke check: `parent_key` is a forest with in-degree <= 1 (`nx.is_branching`), zero missing parents; report multi-parent counts per relation (PART_OF 408, IS_A 8, INHERITS_FROM 8) as a tracked baseline.
- [x] **TOPO-04** (2026-09-20, read-only import probe in `atlas-rapids-cu13`) DONE: cuGraph 26.06.00 and nx-cugraph 26.06.00 import; **no GPU topological sort exists in Python**; nx-cugraph covers `is_forest` / `is_branching` / `ancestors` / `descendants` only. `oaklib` is **not importable** in that env (it lives with the oak kernel). Consequence: topological order, generations, DAG check and longest path stay CPU NetworkX; forest/branching/ancestor checks *could* run on GPU but at 5.5K nodes / 62.8K edges there is no capability gap to justify it.
- [ ] **TOPO-05** Confirm OAKLIB reuse: route ancestor/descendant/closure questions through `atlas_oak_kernel.py` (`OboGraphInterface`) instead of new traversal code; check for a NetworkX adapter in the installed oaklib version before assuming one.
- [ ] **TOPO-06** Use `nx.is_branching` (single-parent forest) vs `nx.is_forest` (undirected acyclic) deliberately per relation; document which the taxonomy contract requires.

#### "Forest" — two meanings, corrected (2026-09-20)

The operator's NVIDIA overview shows that in the NVIDIA/RAPIDS stack "forest" means **tree-ensemble ML** (cuML Random Forest, and the Forest Inference Library, FIL), not a graph forest. The earlier taxonomy-forest census (`parent_key` tree, `is_forest`) answered the *graph* reading and stays valid; the ML reading was not addressed until now. Which one "link topology forest" meant is **not confirmed**.

Measured (read-only, WSL2 `atlas-rapids-cu13`): `xgboost` 3.3.0 (CUDA build true), `cuml` 26.06.00 with `cuml.fil.ForestInference` importable, `treelite` 4.7.0, `scikit-learn` 1.9.0, `lightgbm` missing. Repo: `python/prove_atlas_xgboost_gpu_runtime_v1.py` already proves XGBoost `tree_method=hist, device=cuda:0` and fails closed (`XGBOOST_CUDA_REQUEST_NOT_HONORED`) when CUDA is not honored; the grouped ranker is `python/atlas_xgboost_grouped_ranking_v1.py`.

| Piece | Relevance here |
|---|---|
| XGBoost (gradient-boosted trees) | already the planned first-stage supervised ranker; NOT a Random Forest |
| cuML FIL | loads trained XGBoost/sklearn forests (via treelite) for fast GPU inference; useful only for large-batch inference of an already-trained model — no gap at workboard scale (~2.3K tasks) |
| cuML Random Forest | not in any current plan; would be a new model owner (DEPENDENCY-CAPABILITY-GUARD-01) |
| CUTLASS vs CuTile / SIMT / GEMM | already handled by the LEVEL 1-3 ladder (CUB oracle, SIMT, cuTile) for glyph scoring; the arXiv figure the overview cites (cuTile GEMM at 52-79% of cuBLAS) is for Hopper-class hardware, not this Ampere sm_86 card — our cuTile performance is unmeasured (`CUTILE-ACE-PERF-01` not attempted) |
| cuVS | vector ANN / clustering only |

- [ ] **FOREST-01** Confirm with the operator which "forest" was meant (graph forest vs ML tree ensemble) before building either.
- [ ] **FOREST-02** If ML: keep XGBoost as the ranker; evaluate cuML FIL only when a trained model exists and batch inference latency is a measured problem; treat cuML Random Forest as a challenger needing its own gap proof.
- [ ] **FOREST-03** No forest/tree model can be trained meaningfully until decisions and outcomes are logged (NS-5); the current workboard has 2 qualified features and no labels.

#### NS-8A/8B identity + NS-7A shadow scheduler (2026-09-20, operator design review applied)

Design decisions recorded (from the operator review, adopted): `change:line` is a **source location only**; identity must not depend on it. **TaskIdentityV1**: `logicalTaskKey = change + ":" + declaredTaskId` (durable across moves and edits), `taskRevision = blockHash` (changes when the task text changes — tells a review whether it is still current), `sourceLine` = diagnostic only. A task with no declared id, or a duplicated id within its change, has **no logical key** and stays non-authoritative (migration key = `stableKey` title hash; never silently fall back to `change:line` for promotion). `blockHash` alone is not the join key. NS-7 is split so declared dependencies never replace the controller's rules in one step.

Implemented (all read-only / additive; `node --test scripts/atlas/lib/wfu-metadata.test.mjs` 16/16):
- **NS-8A** `resolveDeclarations` emits `logicalTaskKey` + `taskIdentity {logicalTaskKey, taskRevision, sourceLine, migrationKey, basis}` with basis `DECLARED_ID | AMBIGUOUS_DECLARED_ID | MIGRATION_TITLE_HASH`; ambiguous dependency ids are now reported separately (`declared.ambiguousDepends`) from unresolved ones.
- **NS-8B** the authority review records `logicalTaskKey` + `reviewedTaskRevision`; the adapter joins logical key -> migration key -> legacy line key, and a revision mismatch is `REVIEW_STALE`, which **fails closed** (not selection-eligible, `selectionEligible` feature absent). Adapter rows now carry `reviewState` and `taskIdentity`. Fresh run: reviewState {"REVIEWED_CURRENT": 2261}; `selectionEligible` coverage {"present": 2261, "absent": 0, "basis": {"DERIVED": 2261}, "distinctValues": 2, "qualifiedVarying": true}.
- **NS-7A** `scripts/atlas/build-dependency-scheduler-shadow-v1.mjs` -> `docs/reports/dependency-scheduler-shadow-v1.json`: computes actionability twice (incumbent keyword/controller rules vs declared-dependency readiness) and records `sameDecision / incumbentReadyOnly / dependencyReadyOnly / unresolvedDependency / ambiguousDependency / cycleDetected / missingMetadata`. `behaviorChanged:false`, `controllerAuthorityUnchanged:true`, `writesPerformed:false`. `depends=none` = observed empty set; no comment = `missingMetadata` (absence is never inferred as none).

**Shadow result now:** 3175 open tasks considered (2261 controller-actionable); counts {"sameDecision": 4, "incumbentReadyOnly": 0, "dependencyReadyOnly": 0, "unresolvedDependency": 0, "ambiguousDependency": 0, "cycleDetected": 0, "missingMetadata": 3171}; open-task identity basis {"MIGRATION_TITLE_HASH": 1955, "DECLARED_ID": 1205, "AMBIGUOUS_DECLARED_ID": 120}. `admissionEligible` = **false**.

| NS-7B admission criterion | Value | Required | Status |
|---|---|---|---|
| dependencyMetadataCoverageOfActionable | 0.0009 | 0.95 | unmet |
| ambiguousEdges | 0 | 0 | MET |
| unresolvedRequiredEdges | 0 | 0 | MET |
| cycles | 0 | 0 | MET |
| logicalTaskIdentityStable | True | True | MET |
| logicalKeyCoverageOfActionable | 0.4224 | 0.95 | unmet |
| noRegressionOfRequiredGates | 0 | 0 | MET |

The dominant blocker is metadata coverage (declared dependencies are a handful of tasks against ~2.3K actionable), exactly as expected before adoption (NS-9). Undeclared tasks stay on the incumbent logic.

Sequence adopted: NS-8A -> NS-8B -> NS-7A (SHADOW ONLY) -> NS-7C -> NS-9 -> NS-7D -> NS-7B (admission, explicit approval only), then the executor/LangGraph/Studio tasks below.

- [ ] **NS-7C** Cycle + unresolved + ambiguity **proof**: the in-lib Kahn check and the ambiguous/unresolved split exist (tested); **database-side CYCLE proof now passes (2026-09-21, read-only)** via `scripts/atlas/audit-workboard-postgres-cycle-v1.mjs` and `npm run atlas:docs:workboard-cycle`: PostgreSQL recursive CTE with `CYCLE` executed successfully; `cycleRows=0`, `unresolvedRows=0`, `duplicateEdgeGroups=0`, and both existing workboard tables are currently empty (`kanbanTasks=0`, `kanbanTaskDependencies=0`). The task remains open because this proves the read-model query mechanism, not revision-qualified dependency receipt coverage or scheduler admission. Report: `docs/reports/workboard-postgres-cycle-v1.json`; `writesPerformed=false`.
- [ ] **NS-7D** Compare incumbent vs dependency scheduler on adopted metadata and record the receipt (needs NS-9 coverage first).
- [ ] **NS-7B** DECLARED_DEPENDENCY_ADMISSION: only when every criterion above is met **and** the operator approves; the coverage bar is **>= 95% of controller-actionable tasks** (undeclared tasks otherwise stay on the incumbent).
- [ ] **WORKBOARD-DATA-EXEC-01** `PostgresWorkboardExecutor`: dependency truth in Postgres by **reusing** `kanban_task_dependencies` / `kanban_tasks` (empty, R12) extended with `task_key`, `task_revision`, `depends_on_task_key`, `dependency_kind`, `declared`, `source_ref`, `source_revision`; readiness = current revision valid AND every REQUIRED dependency DONE AND no unresolved required dependency AND no cycle AND existing controller gates pass; recursive traversal returns the blocking path (Studio shows "blocked by NS-9 <- requires NS-3", not just WAITING). No second work-item store.
- [ ] **WORKBOARD-DATA-EXEC-02** `SourceEvidenceExecutor` (rg / ast-grep / tree-sitter -> `sourceRef` / `treeNodeId` evidence) over the existing `/ast/chunk` and `atlas_callable_search` owners.
- [ ] **DataExecutorRegistryV1** logical capabilities `DEPENDENCY_LOOKUP, TASK_EVIDENCE, SYMBOL_LOOKUP, AST_QUERY, LEXICAL_SEARCH, SEMANTIC_SEARCH, GRAPH_TRAVERSAL, FEATURE_DERIVATION` behind one envelope: request `{requestId, capability, workspaceRevision, logicalTaskKey?, taskRevision?, queryText?, canonicalIds?, limit, readOnly:true, inputChecksum}`, result `{requestId, capability, executorId, executorRevision, evidence[], inputChecksum, outputChecksum, canonicalWrites:false, authorityGranted:false, retrievalVoteAdded:false}`. Executors supply facts only; the deterministic controller/tournament decides scheduling. **Reuse, do not add lanes:** the semantic executor must sit on the existing SearchRuntime / Go Retrieval / Qdrant / pgvector owners as ONE logical semantic lane (`semantic_768`); the graph executor reuses `typed_graph_runtime.py` (NetworkX oracle, cuGraph challenger). Register in `runtime-ownership-registry.json` first.
- [ ] **WORKBOARD-LANGGRAPH-01** ready set -> evidence fan-out -> feature construction -> deterministic incumbent -> shadow tournament -> verification -> `interrupt()` -> approval -> apply. Web-verified: resuming re-enters the interrupted node, so everything before `interrupt()` must be read-only/idempotent; mutation only in the post-approval apply node with an idempotency key and receipt.

  **LangGraph serde refresh (2026-09-21, read-only):** `npm run atlas:docs:langgraph-serde` passed all 11 static hardening checks (`STATIC_HARDENING_PROVEN`), including strict msgpack configuration, serializer safety floors, isolated checkpoint namespace, and explicit setup controls. `npm run atlas:smoke:langgraph-container` passed with `RUNTIME_IMPORT_PROVEN`; no checkpoint setup, database write, cache write, or mutation was performed. WORKBOARD-LANGGRAPH-01 remains open because the governed ready-set/tournament/approval traversal is not yet proven.
- [ ] **STUDIO-DEPENDENCY-01** SSR dependency path view + native `<progress>`, fed from the executor's blocking path.

Hardware constraint (operator, 2026-09-20): **RTX 3060 Ti, Ampere sm_86, 8 GB VRAM**, shared with llama-server (~7.5 GB). Consequences recorded: no GPU executor is justified at workboard scale; cuVS / cuGraph / cuML FIL / cuTile must not be loaded concurrently with the chat model; FIL (the ML "forest" reading) stays a challenger with no measured gap (FOREST-02).

#### NS-8C identity hygiene (2026-09-20)

Cause analysis (read-only, before): of 3,280 open tasks, 1,205 had a usable declared id, **120 had an id duplicated inside their change (52 duplicate groups, only 14 with identical text)**, and 1,955 had no declared id (1,852 plain checkbox lines, 103 bold-titled without an id). The 120 included a **bug in my id pattern**: it accepted any hyphenated sentence start (e.g. "Re-run") as an id. The concentration was in `parent-atlas-best-fit-score-fabric` (49 of 120).

Fixes (in `scripts/atlas/lib/wfu-metadata.mjs`, 18/18 `node --test`; the ledger builder now records each task's nearest-heading `sectionSlug`):
- **Stricter id pattern:** named ids are UPPERCASE hyphen segments containing a digit (WFU-09a, TOPO-04, MICRO-04-TRAIN-SMOKE); dotted numeric ids stay (14.6a); "Re-run", "Pre-wire", "ACE-RLM" (no digit) are no longer ids.
- **Section-qualified identity:** an id reused inside one change but unique within its section gets `logicalTaskKey = change:ID@section` (basis `DECLARED_ID_SECTION_QUALIFIED`); still-duplicated ids stay `AMBIGUOUS_DECLARED_ID` with no logical key. A renamed heading changes the key (documented limitation).

Result on the regenerated ledger (3288 open tasks): identity basis `{"MIGRATION_TITLE_HASH": 2026, "DECLARED_ID": 1162, "DECLARED_ID_SECTION_QUALIFIED": 78, "AMBIGUOUS_DECLARED_ID": 22}`; `logicalKeyCoverageOfActionable` = **0.4363** (required 0.95, unmet); open tasks with no `sectionSlug`: 0. Before: `{"DECLARED_ID": 1205, "AMBIGUOUS_DECLARED_ID": 120, "MIGRATION_TITLE_HASH": 1955}`, coverage 0.4224.

Policy (unchanged): tasks with no declared id stay **non-authoritative**; nothing is promoted on `change:line` or on the title-hash migration key. The remaining gap is mostly plain checkbox lines that need authors to add ids.

- [ ] **NS-8D** Id-assignment helper (proposal only): a read-only tool that *suggests* ids for id-less tasks (e.g. `CHANGE-NNN`) as a diff for the operator to apply — it must NOT edit tasks.md itself; adoption is an operator decision because it touches ~1.9K task lines across 88 changes.
- [ ] **NS-8E** Remaining duplicated ids (`AMBIGUOUS_DECLARED_ID`): list them per change so owners can rename; concentrated in `parent-atlas-best-fit-score-fabric`.

### WFU-13 — Smoke suite (fail-closed, before workboard wiring)

| ID | Check |
|---|---|
| UTILITY-01 | topic normalization deterministic |
| UTILITY-02 | same topic key → same topic UUID |
| UTILITY-03 | different language/version → distinct topic where required |
| UTILITY-04 | rg evidence resolves `sourceRef` |
| UTILITY-05 | ast-grep evidence resolves `treeNodeId` |
| UTILITY-06 | domain classifier returns evidence + revision |
| UTILITY-07 | OKF mapping validates schema |
| UTILITY-08 | topic upsert idempotent in disposable DB |
| UTILITY-09 | GIN/B-tree bitmap plan available |
| UTILITY-10 | semantic topic search exact vs HNSW parity |
| UTILITY-11 | FeaturePacket checksum deterministic |
| UTILITY-12 | ACE admission never precedes validation |
| UTILITY-13 | Valkey key revision-qualified |
| UTILITY-14 | centroid checksum deterministic |
| TOURNAMENT-01 | feature row has >1 varying qualified feature |
| TOURNAMENT-02 | low-rank challenger deterministic |
| TOURNAMENT-03 | challenger `authority=false` |
| TOURNAMENT-04 | missing features → DEGRADED/BLOCKED, never fabricated defaults |

- [x] `TOURNAMENT-02` / `-03` partially covered by 2 tests already in `python/test_atlas_compute.py` (determinism + non-authoritative + degenerate refusal).

## Crawler / external docs (WFU-04b, after WFU-05)
- [ ] fetch → BeautifulSoup → canonical doc → Pydantic → language/version classifier → OKF → EmbeddingGemma `semantic_768` → `external_programming_docs_768`. Pin source URL, product/library, **version**, `retrievedAt`, content checksum, parser revision.

## LangGraph process graph (after WFU-09/10)
- [ ] OPEN → classify → retrieve evidence → fan-out specialists → validate → feature row → deterministic rank → shadow challengers → tournament → `BLOCKED | RECOMMEND | APPROVAL`. Extends `packages/atlas-core/src/langgraph` / `packages/parent-atlas/src/langgraph`; checkpoint/resume and human approval only.

## Data labeler → KMeans → XGBoost → RL (recorded direction, not started)
- [ ] Labeler stays symbolic/CPU (extend `train_domain_classifier.py`); KMeans extends `atlas_compute/som.py`, `cluster_softmax.py`, `atlas_cluster_models`; XGBoost stays first-stage (`atlas_xgboost_grouped_ranking_v1.py`); RL = offline contextual bandit in shadow only, and only after decisions+outcomes are logged. Wire-format rule: no bulk vectors through JSON/simdjson.
