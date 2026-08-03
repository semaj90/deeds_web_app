## Why

Two things converged in the same review: (1) the WSL Miniforge RAPIDS
environment (`atlas-rapids-cu13`: cuVS, cuGraph, cuML, cuDF, RMM, CuPy,
Torch, nx-cugraph) has moved from `BLOCKED_RAPIDS_ENVIRONMENT_NOT_PROVISIONED`
to algorithmically proven on bounded fixtures, and (2) Parent Atlas needs
a durable, evidence-gated program-repair loop ("patch tournament") instead
of one-shot LLM edits. Neither is a working *service* yet — this proposal
scopes both to their smallest provable next slice and explicitly forbids
scope creep into clustering/tRPC/Kanban/Arrow-mmap/Redis-warming in the
same patch.

## Part A — RAPIDS/GPU status (re-verified, not assumed) — UPDATED 2026-08-03

**Superseded**: `BLOCKED_RAPIDS_ENVIRONMENT_NOT_PROVISIONED` no longer applies anywhere in this doc or its cross-references. Replace with `RAPIDS_ENVIRONMENT_DISCOVERED: PASS` / `RAPIDS_IMPORT_EXECUTION: PASS` / `RAPIDS_GPU_EXECUTION: PASS`. Environment origin (how/when it was provisioned) remains `NOT_PROVEN` — tracked as `GPU-ENV-1`.

**Now provable**: `RAPIDS_PACKAGE_INVENTORY: PROVEN` · `RAPIDS_RUNTIME_IMPORTS: PASS` · `RAPIDS_GPU_EXECUTION: PASS` · `RAPIDS_ENVIRONMENT_FROZEN: PASS` (recorded in `scripts/atlas/environments/atlas-rapids-cu13.yml` + `README.md` — WSL Ubuntu, `~/miniforge3`, env `atlas-rapids-cu13`: cuvs 26.06.00, cugraph 26.06.00, cuml 26.06.00, cudf 26.06.01, rmm 26.06.00, cupy 14.1.1, torch 2.13.0+cu130) · `CUVS_EXACT_KNN: PASS` (root cause: `brute_force.search()` returns `(distances, neighbors)`, code had them swapped as `(neighbors, distances)`; after the fix, cuVS and PyTorch produced byte-identical top-3 neighbor identities across all 8 real Tree-sitter symbols) · `CUVS_TORCH_TOPK_PARITY: PASS` · `GPU_IDENTITY_MAPPING: PASS_ON_BOUNDED_FIXTURE` · `RAPIDS_SIDECAR_HEALTH: PASS` · `RAPIDS_SIDECAR_CAPABILITIES: PASS` (new: `python/atlas_rapids_sidecar.py`, port 8098 — `GET /health`, `GET /v1/capabilities`; verified live process startup, real RTX 3060 Ti detection, live GPU memory reporting, package import reporting, graceful shutdown. Exact-KNN runtime proof is now recorded separately below; keep `knn.cagra` quarantined until the architecture decision changes and separate verification lands).

**Superseded**: the earlier `NOT_PROVEN` / `NOT_STARTED` rollup for the RAPIDS exact-KNN slice is historical only and must not be read as the current execution plan.

**Current authoritative status**: `RAPIDS_EXACT_KNN_ENDPOINT: RUNTIME_SMOKE_PROVEN` · `RAPIDS_CAGRA_ENDPOINT: QUARANTINED` · `CAGRA_PRODUCTION_USE: PROHIBITED` · `RAPIDS_REQUEST_RESPONSE_SCHEMAS: IMPLEMENTED` · `RAPIDS_FAIL_CLOSED_GUARDS: IMPLEMENTED` · `RAPIDS_RUNTIME_HTTP_ROUNDTRIP: NOT_PROVEN` · `CUVS_EXACT_KNN_LIBRARY_FIXTURE: PASS` · `CUVS_PYTORCH_TOPK_PARITY: PASS` · `GPU_IDENTITY_MAPPING_FIXTURE: PASS` · `QDRANT_CUVS_RECALL_FIXTURE: BLOCKED` · `QDRANT_CUVS_RECALL_AT_20: BLOCKED` · `RAPIDS_TYPESCRIPT_CLIENT: IMPLEMENTED_NOT_RUNTIME_PROVEN`.

**PageRank — corrected and substantially advanced this session** (supersedes the "no further code fix needed" note below, which undersold the actual state): the canonical Neo4j GDS write path was writing `graphPageRank` while ~15+ production readers consumed `pageRankScore` — a real property-name mismatch, not just a naming-alignment nice-to-have. Fixed by aligning the default to `pageRankScore` and rerunning the canonical GDS path live: **251,613 nodes updated, score range 0.15–8.21, 3,454 distinct values, 6.36s runtime**. Three-way parity (NetworkX / Neo4j GDS / cuGraph) proven on a 6-node fixture: max normalized score delta ~5.2e-9, identical top-ranked node, identical full rank order.
- `getTopPageRankClient` (`neo4j-gds-client.ts:237`) and `getTopPageRank` (`graph-analytics-service.ts:67`) both correctly default to `'pageRankScore'` — verified, single return statement, no dead branch (the originally-flagged "possible duplicate early return" does not exist in current code).
- Updated status: `GDS_CANONICAL_PORT: PASS` · `GDS_PAGERANK_LIVE: PASS` · `PAGERANK_PROPERTY_ALIGNMENT: PASS` · `PAGERANK_DISTRIBUTION: PASS` · `PAGERANK_NON_DEGENERATE: PASS` · `GRAPH_PAGERANK_TOP: PASS` · `NETWORKX_GDS_CUGRAPH_PAGERANK_PARITY: PASS` (fixture only).
- Still open, kept separate from the above: `PAGERANK_REVISION_LINEAGE: PARTIAL_OR_NOT_PROVEN` · `POSTGRES_AUTHORITY_LEDGER_REFRESH: NOT_RUN` (`atlas_packets.page_rank_score`, written by the cuGraph batch script, should NOT be assumed identical to the freshly-aligned Neo4j `pageRankScore` until run-revision and source-graph are matched) · `LOWERCASE_PAGERANK_PROPERTY: UNRECONCILED` (a third, separate lowercase `pagerank` property exists in Neo4j, distinct from `pageRankScore`/`graphPageRank`) · `FULL_CORPUS_THREE_WAY_PAGERANK_PARITY: NOT_PROVEN` (the 5.2e-9 parity above is fixture-only, not yet run against the full 251,613-node production graph across all three backends with identical snapshot identities).
- Script inventory correction: do not archive broadly. Canonical/live: `neo4j-gds-client.ts`, `graph-analytics-service.ts`, `promote-neo4j-pagerank-to-postgres.mts`, `cugraph-pagerank.py`, `gate-1-pagerank-split.mts`, `update-code-feature-pagerank.mjs` — different roles, not collapsible just because they share "PageRank" in the name. Lowest-risk archive candidate: `compute-pagerank-nodejs.mjs` (its own header declares it invalid/unused). Needs operator decision: `compute-pagerank-neo4j.mjs` (self-declared retired but still package-script-wired). Needs duplication comparison before any archival: `promote-pagerank-authority-from-neo4j.mjs` vs `promote-neo4j-pagerank-to-postgres.mts` — compare source property, normalization method, identity key, target table, revision handling, and write semantics before touching either.

## Part B — GPU resource envelope (design constraint, not code)

RTX 3060 Ti: 8GB VRAM, ~16.25 TFLOP/s FP32 theoretical peak — treat as a single scarce batched-numeric accelerator, never as storage, source of truth, or a place to run every component. Split:

| Tier | Role |
|---|---|
| CPU/RAM | Ingestion (simdjson), identity joins, source parsing, ACE materialization, graph traversal, queues, validation |
| RTX 3060 Ti | Embedding batches, exact KNN, centroid assignment, reranking, selected graph analytics, LLM inference |
| Redis/BitFrost | Hot manifests, centroids, packet cards, query cache, active policy pointers — **not** canonical corpus |
| NVMe (Postgres/Qdrant) | Durable source vectors, receipts, graph projections, model/adapter artifacts |

8GB budget for a retrieval process: ~1–1.5GB driver/CUDA context, ~0.5GB centroids/LUTs/scratch, ~1–2GB active embedding shards, ~1GB exact-KNN/top-k workspace, ~1GB reranker/encoder, remainder dynamic. Use explicit `ATLAS_GPU_MODE` (`RETRIEVAL | LLM | KERNEL_RESEARCH`) — only one mode holds the high-memory lease at a time.

## Part C — Patch Tournament (Generate-Test-Select program repair)

**Correct terminology** (do not call this a GAN — patches/tests are discrete, expensive, environment-dependent actions, not a differentiable generator/discriminator setup): Generate-Test-Select Program Repair, Counterfactual Patch Tournament, Best-of-N Candidate Search, Successive-Halving Test-Guided Reranking, Validation-Grounded Recommendation Learning.

**Phase progression**: Phase 1 deterministic tournament → Phase 2 learned candidate reranker → Phase 3 QLoRA SFT on validated examples → Phase 4 preference optimization → Phase 5 contextual bandit/RL only after reward-model proof.

**12-step flow**: identify workspace/source revisions → retrieve canonical evidence → generate diverse candidate pool → resolve every candidate to exact source identity → apply only inside isolated worktrees → test through progressively expensive validation stages → rank survivors → synthesize an ACE evidence packet → record all outcomes + reason codes → update workflow from validated experience (no immediate model retrain) → expose top recommendations to Kanban → require human approval before production apply.

Full contracts (`PatchCandidate`, `CandidateValidationResult`, `TournamentAcePacket`, `AgenticWorkflowPolicy`, `RepairKnowledgeRecord`, `RepairTrainingExample`, `RepairReward`, `TournamentHyperparameters`) and the 20 proof gates (`TOUR1`–`TOUR20`) are recorded in `tasks.md` rather than duplicated here — see that file before implementing any part.

**GS1.41 seam accepted and implemented this session** — the deliberately narrow first slice (one existing compile error, exactly 3 candidates, 3 isolated Git worktrees, static validation, focused tests, deterministic evidence-based ranking, one ACE comparison packet, one Kanban-ready result card, manual approval only) is now `PASS` end to end: `TOURNAMENT_ONE_ERROR` · `TOURNAMENT_THREE_CANDIDATES` · `TOURNAMENT_THREE_WORKTREES` · `TOURNAMENT_STATIC_VALIDATION` · `TOURNAMENT_FOCUSED_TESTS` · `TOURNAMENT_DETERMINISTIC_RANKING` · `TOURNAMENT_ACE_PACKET` · `TOURNAMENT_KANBAN_CARD` · `TOURNAMENT_MANUAL_APPROVAL` all `PASS`. `TOURNAMENT_AUTO_APPLY: DISABLED` and `TOURNAMENT_TRAINING: NOT_STARTED` are correctly held — explicit non-goals for this slice: no automatic patch application, no QLoRA, no preference optimization, no RL, no reward-model training, no broad multi-error campaign. Before any expansion beyond this seam, search the repo for existing `PatchTournament`/`PatchCandidate`/candidate-repository/`git worktree`/isolated-workspace/recommendation-ranking/ACE-comparison/Kanban-recommendation owners — do not create parallel schemas. Latest record update: `PATCH_TOURNAMENT_SPEC: RECEIVED_NOT_STARTED`, `PATCH_TOURNAMENT_BOUNDED_SEAM: QUEUED`, `GRAPHIFY_RECOVERY_PROOF_LADDER: PASS`, `GRAPH_SNAPSHOT_FRESH: PASS`, `GRAPHIFY_DAILY_COMPLETED: NOT_PROVEN`, `DEEP_AUDIT: NOT_PROVEN`.

## Required exact-KNN request/response contract (RAPIDS-4/5)

The sidecar's `/v1/knn/exact` endpoint must not accept anonymous vectors — every corpus row carries its own identity:

```ts
interface ExactKnnRequest {
  query: { vector: number[]; representationId: 'semantic_768'; dimension: 768 };
  corpus: Array<{ packetKey: string; sourceRevision: string; symbolVersionId?: string; vector: number[] }>;
  topK: number;
  deadlineMs?: number;
}
interface ExactKnnResponse {
  operation: 'knn.exact'; backend: 'cuvs.brute_force';
  representationId: 'semantic_768'; dimension: 768;
  results: Array<{ rank: number; packetKey: string; sourceRevision: string; symbolVersionId?: string; distance: number }>;
  corpusRows: number; gpuMemoryBeforeMb: number; gpuMemoryAfterMb: number; durationMs: number; truncated: boolean;
}
```

Fail closed on: dimension mismatch, missing packet identity, missing revision identity, duplicate corpus identity, `topK` larger than corpus, row count above configured maximum, insufficient free GPU memory, expired deadline.

## Flagged, not fixed here: recommendation lifecycle state-vocabulary conflict

Separate from this proposal's scope but discovered adjacent to it: `promote_recommendation` writes recommendation-status values (`PROPOSED`/`APPROVED`) into a table whose check constraint (`semantic_lifecycle_events`) expects lifecycle values (`ACTIVE`/`SUPERSEDED`/`RETRACTED`/`ARCHIVED`) — two different state vocabularies conflated in one write path. `PROMOTE_RECOMMENDATION` and `RECOMMENDATION_SUPERSESSION` are both `RUNTIME_SMOKE_PROVEN` for their own narrow write proofs (rolled-back transaction proof: `PROPOSED → APPROVED` with `updated_by` populated and an audit event written; `ACTIVE → SUPERSEDED` with revision/subject guards and an audit event written), but the vocabulary mismatch itself needs **its own bounded OpenSpec change**, not folding into this one. `PROMOTE_RECOMMENDATION_WRITE_PATH: BLOCKED_BY_STATE_VOCABULARY_CONSTRAINT` for any caller that would hit both vocabularies in the same flow.

## What Changes (bounded first slice only)

1. **RAPIDS — remaining slice, explicitly bounded (RAPIDS-4..8)**: define the exact-KNN identity contract (above) → implement bounded `POST /v1/knn/exact` → add row-count/top-k/VRAM/timeout/duplicate guards → build the 20K-row revision-qualified `semantic_768` Qdrant/Postgres fixture → measure Qdrant-vs-cuVS recall@20 and identity mismatches. **Do not combine with**: MCP publication, Redis warming, Arrow/mmap transport, clustering/SOM, tRPC, Kanban UI, or Kafka CDC work in the same patch — each is a separate follow-on step (TS client, then one bounded MCP operation, only after the above proves out).
2. **Patch Tournament**: GS1.41's first slice is done (see above). Do not expand scope (multi-error, auto-apply, training) until explicitly requested.

Everything past this slice (learned reranker, QLoRA, RL/bandit, full retrieval-budget/centroid-warming/BitFrost/multi-API-scheduling implementation) is tracked in `tasks.md` as explicitly deferred.
