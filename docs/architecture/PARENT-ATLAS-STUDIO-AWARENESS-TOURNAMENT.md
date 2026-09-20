# Parent Atlas Studio — Codebase-Awareness Integration Tournament
**Status**: NOT_RUN (design + baseline only) | **Date**: 2026-09-20 | **Route**: `/atlas/studio/openspec` | **Authority**: `docs/reports/*.json` receipts

---

## TL;DR

The studio page (`src/routes/atlas/studio/openspec/+page.server.ts`) reads awareness from `docs/reports` JSON via `openspec-board/{report-reader,awareness,capability-census}.ts`. This doc defines **modular slots**; each slot has an incumbent and challengers that compete on the same frozen fixture. Challengers are advisory/shadow only; deterministic reports stay authority. Nothing here is implemented or promoted.

## Measured baseline (2026-09-20)

| Finding | Evidence |
|---|---|
| Per-request full parse of huge reports, no cache | `awareness.ts` `readJson` = `JSON.parse(readFile)` on directory-graph 171M + file-labels 115M + file-kmeans 35M every load; `report-reader.ts` parses controller 8.7M more |
| Reader lists reports that do not exist | `openspec-next-actions-v2.json`, `atlas-shadow-preference-eval-v1.json` MISSING |
| Challenger input is degenerate | `low-rank-task-recommendation-v2.json` = `DEGENERATE_INSUFFICIENT_FEATURE_VARIANCE` (1/14 features vary) |
| Capability census truncated | `parent-atlas-capability-census-v1.json`: `scanTruncated:true`, `filesScanned:50000` |
| No freshness in snapshot | awareness reports only `Boolean(report)`; no `generatedAt`/age/checksum |
| Codebase index stale | `docs/graph/codebase-graph.json` 2026-08-30; newest probe 2026-09-10 |
| Symbol registry thin | `atlas_callable_search` 285 rows vs `atlas_ast_nodes` 11,067 |
| Down services | `topology_search` :8101, `rerank` :8099 (`trace.trace_system_health`) |

## Rules (hard gates — fail = disqualified)

| # | Rule |
|---|---|
| G1 | Advisory only: no canonical/Postgres/Qdrant/Neo4j write; `writesPerformed:false` |
| G2 | Deterministic receipts remain authority; challenger `eligibleForAuthority:false` |
| G3 | No new dependency/runtime owner without a proven capability gap (DEPENDENCY-CAPABILITY-GUARD-01); check `runtime-ownership-registry.json` first |
| G4 | Same frozen fixture + seed → identical output checksum (replay) |
| G5 | Svelte 5 runes only; SSR-safe; degraded response keeps the same shape (Degraded Response Contract) |
| G6 | Missing/stale input is reported as such, never as PASS |

## Scoring (100 pts, after gates)

| Criterion | Pts | Measure |
|---|---|---|
| Correctness / evidence | 30 | agrees with live truth on fixture; receipts present |
| SSR latency + memory | 20 | p50/p95 load time, peak RSS on studio load |
| Determinism / replay | 15 | identical checksum across 3 runs |
| Reuse (no new owner) | 15 | extends existing module vs adds peer |
| Failure behavior | 10 | degraded shape, no throw, stale flagged |
| Effort / blast radius | 10 | files touched, migration needed |

## Slots

### S1 — Report read path (SSR cost)

| Entrant | Role | Idea |
|---|---|---|
| A | incumbent | full `JSON.parse` per request |
| B | challenger | mtime+size keyed in-process cache, invalidated via existing `depends('atlas:openspec-board')` |
| C | challenger | generators emit small `*.summary.json` sidecars; studio reads sidecars, big files lazy/on-demand |
| D | challenger | Postgres read-model (already noted "optional history only") |

**S1 result (2026-09-20, entrant B implemented, SHADOW-equivalent read path, no writes):** `awareness.ts` now caches the derived snapshot by (dir, name, size, mtime) with in-flight dedupe; 4/4 tests pass (`awareness.spec.ts`).

| Metric (real `docs/reports`) | A incumbent | B challenger |
|---|---|---|
| First load | ~2.3 s (every load) | 2,259 ms |
| Repeat load (inputs unchanged) | ~2.3 s | 1 ms |
| Peak RSS on a cold build | ~789 MB | ~789 MB (unchanged) |
| Invalidation | n/a | any size/mtime change or new/removed report |

Not fixed by B: the first load and every report regeneration still parse ~320 MB (RSS spike). `readOpenSpecBoardSnapshot` (controller etc., sha256 of content) is not cached. Entrant C (summary sidecars) is the remaining lever for the cold cost. Baseline for A measured as the same code path uncached (cold time), not a separate timed run.

### S2 — Awareness freshness

| Entrant | Role | Idea |
|---|---|---|
| A | incumbent | `Boolean(report)` only |
| B | challenger | per-report `{generatedAt, ageSec, checksum, stale}` in `AtlasAwarenessSnapshotV2` |
| C | challenger | one freshness manifest written by the report generators |

### S3 — Codebase coverage census

| Entrant | Role | Idea |
|---|---|---|
| A | incumbent | 50,000-file capped scan (truncated) |
| B | challenger | `git ls-files` inventory, uncapped, ignore-aware |
| C | challenger | incremental by `git diff` since last census checksum |

### S4 — Missing/degenerate producers

| Entrant | Role | Idea |
|---|---|---|
| A | incumbent | reader tolerates missing files silently |
| B | challenger | build producers for `next-actions-v2`, `shadow-preference-eval-v1` |
| C | challenger | drop them from the reader list + record as `NOT_PRODUCED` in snapshot |
| D | challenger | fix upstream features (TOURNAMENT-FEATURES-01) so the low-rank ordering is non-degenerate — **2026-09-20: text derivation from tasks.md tried; dependency/cost not derivable, flags weak; needs a ledger metadata contract (NS-1)** |

### S5 — Ranking challenger (workboard tournament)

| Entrant | Role | Status |
|---|---|---|
| A | incumbent | deterministic critical-path rank (`ACTIVE`) |
| B | challenger | low-rank (`python/build_low_rank_task_recommendation_v2.py`) — **2026-09-20: runs on `featureVector` (WFU-09/10); 2 qualified features (`goalRank`, `selectionEligible`), top-10/50/200 overlap vs deterministic 3/10, 21/50, 93/200; weak signal, advisory only** |
| C | challenger | XGBoost shadow (`XGBOOST_RERANK_MODE=shadow`) — not wired here |
| D | challenger | human feedback (`humanFeedback:false` today) |

### S6 — Structural codebase awareness source

| Entrant | Role | Idea |
|---|---|---|
| A | incumbent | stale graph JSON / probe files |
| B | challenger | `graphify:daily` refresh, receipt-gated |
| C | challenger | sidecar `/ast/chunk` (treesitter-chunker) incremental over changed files → `atlas_ast_nodes`; close the 285 vs 11,067 registry gap |
| D | challenger | git-diff-driven partial re-index feeding S3-C |

### S7 — Live service health panel

| Entrant | Role | Idea |
|---|---|---|
| A | incumbent | none on studio page |
| B | challenger | read-only `trace.trace_system_health` surfaced as a panel; failures shown, not hidden |

## Procedure

| Step | Action |
|---|---|
| 1 | Freeze fixture: copy current `docs/reports` inputs + checksum; record seed |
| 2 | Each entrant emits receipt `{slot, entrant, checksum, p50/p95, peakRss, gates, score, writesPerformed:false}` |
| 3 | Score per table above; ties → smaller blast radius |
| 4 | Winner per slot stays `SHADOW` until `RecommendationTournamentV1`/`RecommendationReceiptV1` promotion |
| 5 | Record result under `RECOMMENDATION-TOURNAMENT-01` in `openspec/changes/parent-atlas-retrieval-lineage-dag-convergence/tasks.md` |

## Suggested order

| Order | Slot | Why first |
|---|---|---|
| 1 | S1 | biggest measured cost (~320 MB parsed per load); unblocks all others |
| 2 | S2 | cheap, makes staleness visible for every later slot |
| 3 | S4 → S5 | S5 cannot run until S4-D gives ≥2 varying features |
| 4 | S3, S6 | need S2 to show whether coverage actually improved |
| 5 | S7 | independent; depends on :8101/:8099 being restarted |

## Links

| Item | Path |
|---|---|
| Studio route | `sveltekit-frontend/src/routes/atlas/studio/openspec/` |
| Board modules | `sveltekit-frontend/src/lib/server/atlas/openspec-board/` |
| Tournament script | `scripts/atlas/build-openspec-challenger-tournament-v1.mjs` |
| Low-rank producer | `python/build_low_rank_task_recommendation_v2.py` |
| Tasks | `openspec/changes/parent-atlas-retrieval-lineage-dag-convergence/tasks.md` (gate 8) |
