# Parent Atlas Workstation — Phase 1–20 Master To-Do

Updated: 2026-10-15  
Status: **PARTIAL / EVIDENCE-GATED**  
Authority: canonical phase owners and OpenSpec `tasks.md`; this file is a navigation and integration projection, not a second task-state owner.

## How to use this list

- Legacy phases 1–10 and canonical workstation phases P11–P20 are separate namespaces. No ordinal mapping for legacy P1–P10 has been proven; keep each `NOT_VERIFIED` until its own owner and acceptance evidence are found.
- Canonical P11–P25 ownership is indexed in [`parent-atlas-workstation-todo.md`](../parent-atlas-workstation-todo.md). Revision work belongs to P12, but its apply/backfill execution is deferred until after P20 and closure of `parent-atlas-gpu-sidecar-patch-tournament`; do not renumber P12 or implement revision-field persistence early.
- A task link or checked box is not proof that a phase is complete. Use the phase crosswalk generator, then verify the owning task, acceptance criteria, current receipt, and independent readback.
- Status vocabulary: `CREATED`, `WIRED`, `PROVEN`, `DONE`, `PARTIAL`, `WAITING`. `DONE` requires the owner’s acceptance plus current wired-and-proven evidence.
- Kanban and generated workboards are projections. OpenSpec owner ledgers remain the task state authority; do not create duplicate schedulers or completion writers.

## Legacy phases 1–10

| Phase | Status | Required next step |
|---|---|---|
| P1 | NOT_VERIFIED | Find the phase-specific owner, acceptance contract, and current proof receipt. |
| P2 | NOT_VERIFIED | Find the phase-specific owner, acceptance contract, and current proof receipt. |
| P3 | NOT_VERIFIED | Find the phase-specific owner, acceptance contract, and current proof receipt. |
| P4 | NOT_VERIFIED | Find the phase-specific owner, acceptance contract, and current proof receipt. |
| P5 | NOT_VERIFIED | Find the phase-specific owner, acceptance contract, and current proof receipt. |
| P6 | NOT_VERIFIED | Find the phase-specific owner, acceptance contract, and current proof receipt. |
| P7 | NOT_VERIFIED | Find the phase-specific owner, acceptance contract, and current proof receipt. |
| P8 | NOT_VERIFIED | Find the phase-specific owner, acceptance contract, and current proof receipt. |
| P9 | NOT_VERIFIED | Find the phase-specific owner, acceptance contract, and current proof receipt. |
| P10 | NOT_VERIFIED | Find the phase-specific owner, acceptance contract, and current proof receipt. |

Do not copy the historical 1–24 summary statuses into these rows. The missing ordinal crosswalk is itself an open governance gate.

## Canonical workstation phases P11–P20

| Phase | Owner(s) | Current evidence / status | Next closure gate |
|---|---|---|---|
| P11 — Experience and memory wiring | `parent-atlas-agentic-run-receipt-binding`; `parent-atlas-ace-rlm-bitfrost-integration`; `parent-atlas-kv-cache-adaptation-research` | **PARTIAL.** Focused execution-spine/DSPy-output contracts pass 18/18; source census found A2A/native, raw tool-loop, and manifest-bound Mastra entry points, but no Prime production caller. | Close in order: route owner → server-owned ContextManifest admission/readback → Prime/Ornith handoff → bounded RLM live receipt. DSPy/GEPA are offline challengers under P20/P21, not agent authorities; they may consume only qualified evidence handles. No fourth route, raw tool-result injection, hidden reasoning/KV persistence, or early revision writes. |
| P12 — Source, revision, and chunk authority | `parent-atlas-retrieval-lineage-dag-convergence`; producer dependency `parent-atlas-chunk-index-whole-file-hash` | **PARTIAL / EXECUTION DEFERRED.** The root phase index records 14,564/24,456 strict bound-source passes and one exact DB-to-disk source readback; 1,086 nested namespace gaps and further mismatches remain. | Keep source/workspace revision writes, writer-policy changes, apply, and backfill deferred until after P20 plus GPU-sidecar tournament closure. Preserve fail-closed runtime checks. The two tagged P12 gates are `parent-atlas-chunk-index-whole-file-hash:313` and `:315`; they remain unchecked. |
| P13 — Feature registry and capability classification | `parent-atlas-candidate-feature-execution-fabric` and the existing registry owner | **PARTIAL.** Taxonomy/classification is descriptive and cannot establish packet, function, or source identity. | Produce a bounded, independently read-back eligible feature cohort using existing identity owners; record missingness and rejection reasons. No feature-driven admission or new registry table. |
| P14 — Exact context cache and residency | `parent-atlas-ace-bitfrost-cache-correctness`; `parent-atlas-ace-rlm-bitfrost-integration` | **CONTRACTS PRESENT; LIVE WIRING/MEASUREMENT OPEN.** BitFrost/Valkey is derived cache state, not canonical evidence or GPU tensor storage. | Prove admitted ContextManifest identity/checksum, cache-key correctness, stale invalidation, physical readback, and cold/warm evidence parity before claiming residency. |
| P15 — Semantic retrieval and single fusion owner | `parent-atlas-retrieval-fusion-reachability` | **PARTIAL.** SearchRuntime owns lane normalization, deduplication, and RRF; Qdrant/TurboVec/cuVS/CAGRA are executors or projections. | Run a frozen query/candidate cohort through the production SearchRuntime; prove one vote per logical lane and exact candidate identity through final Top-K. |
| P16 — Graph, KAG, ontology, and bounded expansion | `parent-atlas-retrieval-lineage-dag-convergence`; `parent-atlas-retrieval-lod-algorithm-taxonomy` | **PARTIAL.** NetworkX is the CPU reference; Neo4j/cuGraph are derived lanes. A parity result on a degenerate containment graph is not authority evidence. | Use an admissible, revision-qualified graph snapshot with directional edges, verified endpoints, bounded traversal, and independent readback; graph scores cannot mint identities or votes. |
| P17 — NLP, structural facts, and numeric feature assembly | `parent-atlas-governed-compute-fabric`; `parent-atlas-candidate-feature-execution-fabric`; GPU ABI owners | **PARTIAL.** 8095, Arrow/NDJSON, Python, and GPU feature surfaces exist; phase-level live receipt and eligible cohort are not established here. | Prove one source-qualified parser observation → canonical identity → feature row with presence mask and checksummed ordinal mapping; preserve CPU oracle before GPU comparison. |
| P18 — Learned reranking evaluation | `parent-atlas-best-fit-score-fabric`; `parent-atlas-neural-prefill-encoder` golden-QRELS owner; retrieval-lineage evidence dependency | **PARTIAL / EVALUATION ONLY.** The current golden audit has 60 exact query bindings but 0 human judgments; the 2,433-candidate pool has 0 revision-bound candidates and no compatible corpus manifest. | Close `GOLDEN-RELEVANCE-REVIEW-01` and `GOLDEN-QRELS-EVAL-01` in the golden-QRELS owner before comparing EmbeddingGemma recipes or training rerankers. Keep human relevance separate from source authority; no training/import/promotion from agent-proposed labels. |
| P19 — Deterministic policy baseline | `parent-atlas-candidate-feature-execution-fabric`; `parent-atlas-governed-compute-fabric` | **PARTIAL.** HMM/linear policies may rank legal actions from qualified features; they do not own retrieval identity or authorization. | Prove deterministic replay, tie/missing-feature handling, policy receipt and legal-action-set enforcement before P20 optimization. |
| P20 — Program/workflow contracts | `parent-atlas-governed-compute-fabric`; evaluation dependency `parent-atlas-compute-rank-cache-eval-dspy-gepa` | **PLANNED / OPEN.** DSPy is a constrained program/skill-selection contract, not an agent authority. Owner task 16.2 and isolated-worker gate `DSPY-SIDECAR-01` are unchecked. | Prove deterministic DAG legality, schema/permission checks and hard resource caps outside DSPy; evaluate only within an already legal host action set using frozen held-out evidence and a checksummed policy-artifact receipt. Do not persist new `*_revision` fields before P20 closes. |

## Agent and optimization alignment

Use existing owners in this order; do not add a parallel Prime agent, RLM state store, prompt writer, memory store, or workflow scheduler:

1. **Canonical retrieval/context:** SearchRuntime → canonical candidate identity → CandidateFeatureMatrix → exact evidence → ACE packet → ContextManifest.
2. **Prime/RLM (P11):** `agent-execution-spine-v1.ts` is the existing Prime/RLM contract owner. It is reported contract-only; the missing proof is a live caller consuming an admitted ContextManifest checksum and bounded tool envelope. RLM working state remains ephemeral and non-authoritative.
3. **DSPy (P20):** select/optimize only among actions already admitted by the capability registry and deterministic DAG. Require a frozen evaluation set, held-out results, and a checksummed artifact receipt. No production prompt mutation or authorization.
4. **GEPA (P21 follow-on):** keep reflective program/prompt optimization separate from P20's DSPy contract. Governed-compute task `16.2a` and evaluation gates `GEPA-VERSION-01`, `GEPA-HELDOUT-01`, and `GEPA-SHADOW-01` are unchecked; require frozen RouteTrace/eval receipts, held-out comparison, shadow-only output, and no automatic promotion.
5. **Cross-owner gate:** Prime/RLM live execution and DSPy/GEPA offline optimization share only serialized, admitted evidence handles and validator-backed outcomes. Runtime feedback is not a label until independently qualified; held-out evidence never feeds optimization. The exact dependency sequence and open status are recorded in both owning OpenSpec ledgers.
6. **Promotion:** any learned policy or procedure stays a challenger until independently reviewed receipts prove quality, replay determinism, provenance, resource bounds, and rollback. A score or accepted suggestion cannot authorize edits.

Prime/RLM evidence and open gates are recorded in `openspec/changes/parent-atlas-ace-rlm-bitfrost-integration/tasks.md` (`PRIMEAGENT-ORNITH-HANDOFF-01`, `ACE-PIPELINE-VERTICAL-READBACK-01`, `RLM-E2E-01`). DSPy/GEPA evaluation gates are in `parent-atlas-compute-rank-cache-eval-dspy-gepa/tasks.md`; deterministic authorization and DAG gates remain in `parent-atlas-governed-compute-fabric/tasks.md`. Phase tags are navigation links only, not completion evidence.

Crosswalk correction (2026-10-15): explicit links now include P11 Prime/RLM, P12 deferred writer gates, P13–P19 phase gates, P20 DSPy, and P21 GEPA. The generated crosswalk is the source for the current count; links do not imply proof or completion.

## Kanban, workboard, and application hardening

- [ ] Keep OpenSpec task ledgers as the write authority; generated workboard/Kanban views consume owner state and link back to exact task refs and receipts.
- [ ] Add phase IDs to further tasks only after the phase acceptance scope is confirmed in the canonical phase index. Never bulk-assign every task in a shared owner change to each phase.
- [ ] Refresh workboard reports only through their read-only builder; the 2026-10-15 snapshot is dated and partial. A workboard percentage is not proof of completion.
- [ ] Prove integrations independently: MCP tool registry/schema/permissions, ACP/A2A transport receipts, OpenCode caller, RLM/Prime adapter, ACE/ContextManifest and cache owner. Protocol reachability alone is not a production integration.
- [ ] Run focused tests for changed owners first; record exact command, result, receipt path, and readback. Keep Svelte checks logged with the repository capture script.
- [ ] SvelteKit app build is `npm run build` in `sveltekit-frontend`; logged check is `npm run check:logged`. Both are `NOT_RUN` by this master-list update.
- [ ] No `desktop`, Electron, or Tauri build script was found in the inspected root/SvelteKit package manifests. Do not claim a desktop deliverable until its actual package/target and build gate are identified.
- [ ] Before production completion, run owner-specific tests, logged Svelte checks, app build, service-health checks, migration/drift audits where relevant, security and rollback review, and end-to-end receipts. No blanket build or service restart is authorized by this document.

## Crosswalk command and current audit

Run from the repository root:

```powershell
node scripts/atlas/build-parent-atlas-phase-task-crosswalk-v1.mjs --summary
```

The current read-only crosswalk has 16 canonical index rows. Its generated summary currently reports 20 explicit task links across P11–P21, including the P11 route-owner gate and one P18 reranker-training gate; verify the generator output before scheduling. P23 and grouped P27–P30 lack explicit owner slugs; legacy P1–P10 remain a separate, unmapped namespace. No phase is closed by the existence of a link.

## Remaining Execution Sequence to Finish Master To-Do

### Newly Proven Diagnostic Foundations (2026-10-15)
- [x] **P11 PrimeAgent $\to$ Ornith Handoff, ACE Vertical Readback & RLM E2E (`PRIMEAGENT-ORNITH-HANDOFF-01`, `ACE-PIPELINE-VERTICAL-READBACK-01`, `RLM-E2E-01`)**: `scripts/atlas/prove-p11-primeagent-ornith-rlm-e2e-v1.mts` and `docs/reports/p11-primeagent-ornith-rlm-e2e-receipt-v1.json` (`ContextManifestV2` checksum `sha256:18c6958ac637133a49ec5045aea2558bf4b0b0b7418cb81dd76f78fbf7e73d73`, `runReadOnlyAgentReplayV1` `finalState: "COMPLETE"`, `RlmWorkingStateV1` `persistenceClass: "EPHEMERAL"`, duplicate subproblem suppression verified, `writesPerformed: false`, `kvCachePersisted: false`).
- [x] **5-Plane Polyglot LUT, ATen Inverse Hardware Search & DSPy-GEPA-OaK-RLM Subhelper Audit**: `python/prove_polyglot_aten_dspy_gepa_oak_v1.py`, `sveltekit-frontend/src/lib/server/atlas/prefill/polyglot-dag-oak-rlm-prefill.spec.ts`, and `docs/reports/polyglot-aten-dspy-gepa-oak-receipt-v1.json` (RTX 3060 Ti `PS2_VU1_DOUBLE_BUFFER_DMA` tier selected with `7,126 MiB` free VRAM; `4×768` ATen `torch.cat(...).contiguous()` smoke check passed with `0` NaN/Inf; 50/50 4-byte DMA-aligned polyglot entries with `0` orphaned edges, mean `88.62%` / min `70.19%` token savings $\ge 65\%$ gate, `gepaReflectiveMetric` score `1.0`, and `parseDspyRepairOutputV1` `ContextManifestV2` admission proven).
- [x] **Retrieval DAG Prefill Synthesis LUT & `.f32bin` Tensor Shard**: `sveltekit-frontend/src/lib/server/atlas/prefill/retrieval-dag-prefill-lut-v1.ts`, `sveltekit-frontend/data/atlas-tensor-proof/retrieval_dag_prefill_lut_v1.json`, `sveltekit-frontend/data/atlas-tensor-proof/retrieval_dag_prefill_768.f32bin` (`153,600` B), and `docs/reports/retrieval-dag-prefill-lut-receipt-v1.json` (50 entries, direct OS `openSync`/`readSync` 3,072B vector slice & UTF-8 span streaming, topological `[30, 20, 10, 0]` dependency ordering, `PromptPlanV1` + `ContextPrefixIdentityV1` synthesis, `kvCachePersisted: false`).
- [x] **Unified 7-Stage End-to-End Execution Flow Receipt**: `docs/reports/unified-7stage-execution-flow-receipt-v1.json` (7/7 stages `PASS`: Domain/4D Frustum MBVH4 Query $\to$ SOM/64-D Manifold Bitmask Pruning $\to$ NES `.f32bin` LUT Streaming $\to$ IsoQuant $SO(4)$ Quaternion Rotation $\to$ RTX 3060 Ti LibTorch/cuBLAS Rerank & QLoRA Gate $\to$ BitFrost Residency Knapsack $\to$ `atlas.action.v1` `PROPOSED -> VERIFIED`).
- [x] **Frozen Retrieval-to-Context Execution Receipt (`RetrievalContextExecutionReceiptV1`)**: `docs/reports/retrieval-context-execution-receipt-v1.json` (7/7 gates `PASS`, `manifestIdentityChecksum: 1644213f096c5277c7b32f61f8cbddc19a01f6c3bb4ee36d77db9d31daf3db53`, `writesPerformed: false`).
- [x] **Svelte 5 AST, Rune, Handler & Element Span Parity (`VER-03`)**: `scripts/graphify/lib/svelte-ast-extractor.mjs`, `scripts/atlas/svelte-rune-crosscheck-v1.mjs`, and `scripts/atlas/svelte-handler-crosscheck-v1.mjs` (10 files, 50 runes, 27 handlers, `SPAN_CONTAINMENT_PROVEN`, 0 mismatches).
- [x] **Visual Element Rendering (`VER-01`, `VER-02`, `VER-03`, `VER-04`, `VER-99-01`)**: `docs/reports/ver-01-ver02-webgpu-rendering-audit-receipt-v1.json`, `docs/reports/ver-04-unocss-design-token-receipt-v1.json`, and `docs/reports/mbvh4-stackless-traversal-receipt-v1.json` (Mixamo 14-bone weight sum deviation $2.2204 \times 10^{-16}$, RLE texture compression ratio $16.0\times$ within 2 KB/40 KB budgets, 256-byte WebGPU row-stride parity, UnoCSS token/shortcut inventory, and 4-Wide MBVH4 128-byte SoA + stackless nibble-bitmask `bitstack: u32` traversal in `mbvh4_traversal.wgsl`, `mbvh4-accelerator.ts`, and `karpathy-dag-subhelpers.ts`).
- [x] **P13 & P17 Stratified 50-File AST & `CandidateFeatureMatrix` Cohort**: `docs/reports/p13-p17-stratified-feature-cohort-receipt-v1.json` (50 files across 5 strata, 525 revision-qualified `tn_v1_` tree nodes, 0 UTF-8 span failures, `50×8` `CandidateFeatureMatrix` with `ordinalMapChecksum: sha256:5d00f097941fd064238b9f5c445cbf2c13efd9a0edb7c82b83dd56dac60facbf`).
- [x] **P16 (`GRAPH-CSR-01` & `CUGRAPH-PARITY-01`)**: `docs/reports/p16-graph-csr-cugraph-parity-receipt-v1.json` (396 nodes, 625 unique directed edges, `csrChecksum: sha256:3ac3595b2ab666359b79c9d2f5b12ba8aa2254640045351961338cea16a39166`, CPU NetworkX vs GPU CUDA CSR SpMV PageRank max abs diff $2.9877 \times 10^{-11}$, live RAPIDS `cuGraph 26.06.00` executed with 100% top-10 cohort ordinal order parity `[25, 0, 2, 1, 4, 5, 6, 3, 8, 9]`).
- [x] **P14, P15 & P19 Cache, Single-Fusion & Policy Baseline Receipt**: `docs/reports/p14-p15-p19-cache-fusion-policy-receipt-v1.json` (BitFrost cold/warm parity + stale-revision invalidation + 40 KB residency plan; `fuseSearchRuntimeCandidates` 1-vote-per-logical-lane deduplication; deterministic policy replay across all 6 HMM states `policyReplayChecksum: sha256:69fc5b94dc7d55268c550923067ed0d576313d28e0e5868fd6197e7c5a36b674`).
- [x] **Auto-Mode Classifier Gate**: `sveltekit-frontend/src/lib/server/retrieval/auto-mode-classifier-gate.ts` + `auto-mode-classifier-gate.spec.ts` (4/4 Vitest passed).
- [x] **Workstation Compute Reference Harnesses**: `docs/reports/tensor-gemm-parity-receipt.json` ($1.4156 \times 10^{-7}$ max diff, 39.39 MiB VRAM) and `docs/reports/duckdb-batch-extract-receipt.json` (5,000 rows, round-trip Parquet schema & row-count readback fidelity; `zero_copy_memory_transfer_proven: false`).
- [x] **OpenSpec Governance**: `npx openspec validate --changes` passes **109/109** (including `visual-element-rendering` with all `VER-01..04` tasks marked `PROVEN`).

### Next Steps in Dependency Order
1. **Track 1 — P13–P17 Live Cohort Expansion & Cache Readback (Read-Only / Bounded)**:
   - [x] **P13**: Run the unified `.svelte`/`.ts` AST extractor and `:8095` sidecar (`_mint_revision_qualified_tree_node_id`) over a stratified 50-file cohort across UI, Server, DB, Retrieval, and MCP (`docs/reports/p13-p17-stratified-feature-cohort-receipt-v1.json`).
   - [x] **P14**: Prove `ContextManifestV2` revisioned write/readback and stale-revision invalidation in BitFrost (`docs/reports/p14-p15-p19-cache-fusion-policy-receipt-v1.json`), plus the `VER-02` WebGPU texture byte-budget receipt (`docs/reports/ver-01-ver02-webgpu-rendering-audit-receipt-v1.json`).
   - [x] **P15**: Execute the frozen query cohort through `fuseSearchRuntimeCandidates` (`sveltekit-frontend/src/lib/server/retrieval/search-runtime.ts`) to prove 1 vote per logical lane through final Top-K (`docs/reports/p14-p15-p19-cache-fusion-policy-receipt-v1.json`).
   - [x] **P16 (`GRAPH-CSR-01` & `CUGRAPH-PARITY-01`)**: Compile the admitted typed code-edge CSR (`CALLS`, `IMPORTS`, `RUNE_DEPENDENCY`, `EVENT_DISPATCH`) and verify numerical PageRank parity between CPU NetworkX, PyTorch CUDA CSR SpMV, and WSL2 RAPIDS `cuGraph 26.06.00` (`docs/reports/p16-graph-csr-cugraph-parity-receipt-v1.json`).
   - [x] **P17**: Assemble the `50×8` `CandidateFeatureMatrix` with explicit presence masks and `ordinalMapChecksum` (`docs/reports/p13-p17-stratified-feature-cohort-receipt-v1.json`).
2. **Track 2 — P18 Golden Relevance Review Floor (`GOLDEN-RELEVANCE-REVIEW-01` & `GOLDEN-QRELS-EVAL-01`)**:
   - [ ] Complete human relevance judgments in the Golden Review workflow (`scripts/atlas/serve-golden-review-v1.mjs`) from **49 $\to$ 200 reviewed query-candidate pairs** (minimum 30 per domain class) and bind a revision-qualified corpus manifest before moving logistic regression, MLP, or QLoRA/XGBoost challengers out of shadow mode.
3. **Track 3 — P19 Policy Baseline, P20/P21 DSPy/GEPA & P11 Prime/Ornith Live Handoff**:
   - [x] **P19**: Prove deterministic policy replay, tie-breaking, and missing-feature handling on the legal action set (`docs/reports/p14-p15-p19-cache-fusion-policy-receipt-v1.json`).
   - [x] **P20 (`DSPY-SIDECAR-01`) & P21 (`GEPA-SHADOW-01`)**: Prove constrained skill/action selection, OaK option insert, RLM pointer swap (`<rlm_call label="..." />`), and `gepa_reflective_metric` evaluation within the already-legal host DAG on frozen held-out evidence with `ContextManifestV2` admission (`docs/reports/polyglot-aten-dspy-gepa-oak-receipt-v1.json`).
   - [x] **P11 (`PRIMEAGENT-ORNITH-HANDOFF-01`, `ACE-PIPELINE-VERTICAL-READBACK-01` & `RLM-E2E-01`)**: Wire `agent-execution-spine-v1.ts` and `rlm-runtime.ts` to consume an admitted `ContextManifestV2` checksum (`sha256:18c6958ac637133a49ec5045aea2558bf4b0b0b7418cb81dd76f78fbf7e73d73`) and execute a bounded read-only tool/synthesis replay (`docs/reports/p11-primeagent-ornith-rlm-e2e-receipt-v1.json`).
4. **Track 4 — Post-P20 Deferred P12 Source/Revision Backfill & Reviewed DDL Apply**:
   - [ ] After P20 and the GPU sidecar tournament close, execute the operator-reviewed P12 gates (`parent-atlas-chunk-index-whole-file-hash:313` and `:315`) and review/apply `drizzle/manual/proposed_20261015_atlas_hypergraph_edges_spec.sql`.
5. **Track 5 — SvelteKit 2 Application & Visual Rendering Verification (`VER-01`, `VER-04`, Build Gates)**:
   - [x] Generate receipts for `VER-01-02` (courtroom `.glb` bone-weight invariant) and `VER-04-03`/`04` (`uno.config.ts` token/shortcut audit across live `.svelte` files) (`docs/reports/ver-01-ver02-webgpu-rendering-audit-receipt-v1.json`, `docs/reports/ver-04-unocss-design-token-receipt-v1.json`).
   - [ ] Execute `npm run check:logged` and `npm run build` in `sveltekit-frontend`, plus `npm run audit:contracts` and `npm run audit:drizzle`.

This master list is not a claim that all repository files, phases, tests, integrations, or production gates have been reviewed or passed. Update the owning OpenSpec ledger only when its own acceptance evidence is present.

