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

## Part A — RAPIDS/GPU status (re-verified, not assumed)

**Now provable**: `RAPIDS_PACKAGE_INVENTORY: PROVEN` · `RAPIDS_RUNTIME_IMPORTS: PASS` · `RAPIDS_GPU_EXECUTION: PASS` · `CUGRAPH_PAGERANK_PARITY: PASS` (NetworkX/Neo4j-GDS/cuGraph agree to ~5e-9) · `CUVS_EXACT_KNN: PASS` (fixed swapped return order from `brute_force` search) · `CUVS_TORCH_TOPK_PARITY: PASS` · `GPU_IDENTITY_MAPPING: PASS_ON_BOUNDED_FIXTURE`.

**Still `NOT_PROVEN`**: GPU sidecar HTTP service, capability registry, request/response schemas, Arrow batch transport, msgpack transport, MCP GPU tool, tRPC GPU admin API, Kanban GPU receipts, queue/cancellation, TurboVec fallback alignment, Qdrant-vs-cuVS recall comparison (not run), stale-symbol-version rejection (partial).

**PageRank property naming** — verified this session: `getTopPageRankClient` (`neo4j-gds-client.ts:237`) and `getTopPageRank` (`graph-analytics-service.ts:67`) both correctly default to `'pageRankScore'` (the property ~15+ production consumers read), matching the GS1.35 fix. **The previously-flagged "possible duplicate early return" does not exist in the current code** — single return statement, no dead branch. No further PageRank code fix needed; the open item is still choosing one authoritative property name across the 3 historically-diverged names (`pageRankScore` / `graphPageRank` / plain `pagerank`) and auditing which of ~18 candidate scripts originally wrote the old 59,692-row data — deferred, operator decision.

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

## What Changes (bounded first slice only)

1. **RAPIDS**: verify the PageRank return-statement concern (done, see Part A — no code change needed); freeze the RAPIDS environment with an explicit export; build sidecar health+capabilities endpoint only; add exact-KNN endpoint with an identity manifest; run one Qdrant-vs-cuVS recall@20 fixture; add one internal TypeScript client; expose exactly one bounded read-only MCP operation. **Do not** add clustering, tRPC, Kanban, Arrow-mmap, or Redis warming in this pass.
2. **Patch Tournament**: define `PatchTournament`/`PatchCandidate`/validation schemas; one Postgres-backed tournament repository; generate exactly 3 candidates; 3 isolated Git worktrees; apply with exact revision guards; static tests in parallel; focused tests on at most 2 survivors; deterministic ranking; one ACE comparison packet; display top 3 on the existing Kanban board; require manual approval; **do not auto-apply, do not train a model**.

Everything past this slice (learned reranker, QLoRA, RL/bandit, full retrieval-budget/centroid-warming/BitFrost/multi-API-scheduling implementation) is tracked in `tasks.md` as explicitly deferred.
