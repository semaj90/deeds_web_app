## 1. Inventory Existing Owners

- [ ] 1.1 Audit the current ACP, A2A, MCP, LangChain/LangGraph, Deep Agents, Mastra, Hermes, OpenWiki, Kanban, Paperclip, and Studio owners; record present/absent/configured/registered/live status without starting services or dispatching agents.
- [ ] 1.2 Trace each integration to its existing schema, registry, authorization boundary, health source, receipt, and canonical data owner; identify duplicate registries and stale documentation as findings, not new owners.
- [ ] 1.3 Freeze an inventory input revision and checksum and classify every statement as source-observed, fixture-tested, live-verified, or unknown.

## 2. Define Framework-Neutral Contracts

- [ ] 2.1 Add a versioned read-only integration descriptor and readiness receipt that reference existing owners and encode status, evidence level, revision, timestamp, checksum, blocker, and next proof gate.
- [ ] 2.2 Add contract validation for missing, stale, malformed, and contradictory integration evidence; ensure unknown integrations cannot become live-verified.
- [ ] 2.3 Define adapter conformance checks for request identity, source/workspace revisions, authorization result, bounded execution, evidence references, and replay metadata.
- [ ] 2.4 Prove that receipts omit credentials, hidden reasoning, prompt contents not needed for audit, raw KV cache, and tensor state.

## 3. Align Protocol and Framework Consumers

- [ ] 3.1 Audit and test ACP capability discovery and dispatch against the existing server-side tool registry and authorization checks.
- [ ] 3.2 Audit and test A2A agent discovery/dispatch only for independently deployable owners; keep local calls local absent an isolation requirement.
- [ ] 3.3 Verify MCP `tools/list` and authorized `tools/call` for selected read-only Atlas tools, including stable schemas, bounded inputs, structured outputs, and rejection before handler execution when unauthorized.
- [ ] 3.4 Add adapter contract tests for existing LangChain/LangGraph and Mastra owners; preserve framework-neutral workflow and evidence contracts.
- [ ] 3.5 Determine whether Deep Agents and Hermes have actual installed/runtime owners; leave them `NOT_PRESENT` or `UNVERIFIED` when absent and add no dependency solely for visibility.
- [ ] 3.6 Verify OpenWiki/TOC discovery links cannot register, authorize, invoke, or promote a tool.

## 4. Preserve Retrieval and Context Authority

- [ ] 4.1 Route framework search calls through existing SearchRuntime and canonical identity resolution; do not add a search index, RRF owner, or independent semantic vote.
- [ ] 4.2 Verify candidate identity, logical lane, source/workspace revision, evidence references, and degraded status survive each adapter boundary.
- [ ] 4.3 Require the existing ACE/ContextManifest admission before framework context injection; reject raw retrieval hits, stale framework memory, and LUT-only references as admitted evidence.
- [ ] 4.4 Replay one read-only request through at least two adapter paths and compare canonical IDs, revisions, evidence checksums, authorization outcomes, and logical retrieval votes.

## 5. Build the Studio Readiness Projection

- [ ] 5.1 Implement a read-only integration-readiness loader that composes existing descriptors and receipts without a new registry table or canonical write.
- [ ] 5.2 Add an authorized Parent Atlas Studio readiness panel with stable degraded states, owner links, last evidence, blockers, and next proof actions.
- [ ] 5.3 Add keyword/alias routing for search, multi-hop, LUT, corpus, glossary, backend, ACP, A2A, MCP, OpenWiki, Kanban, and related owners; ensure aliases do not confer permission or canonical identity.
- [ ] 5.4 Prove the readiness UI performs no tool dispatch, cache hydration, task-state mutation, or hidden-state persistence.

## 6. Align OpenWiki, TOCs, and Kanban

- [ ] 6.1 Update the generated-source Master TOC and agent-rules TOC with owner-qualified links and protocol/framework distinctions; identify generator ownership before editing generated artifacts.
- [ ] 6.2 Connect OpenWiki references to source/spec owners and freshness evidence; do not hand-edit generated wiki pages or treat wiki text as authority.
- [ ] 6.3 Connect readiness cards to existing canonical Kanban feature/task identities and evidence gates; stale receipts must not mark tasks verified/done.
- [ ] 6.4 Check links and generated-index consistency using the repository-owned validation commands.

## 7. Production Hardening and Promotion

- [ ] 7.1 Add tests for authorization denial, malformed schemas, timeout, retry bounds, duplicate dispatch, stale receipts, degraded dependencies, and replay determinism.
- [ ] 7.2 Capture one correlated end-to-end read-only receipt from authorized agent request through registered tool, SearchRuntime, qualified ContextManifest, and Studio/task-board projection.
- [ ] 7.3 Verify cold/warm or cache behavior only through existing cache owners and explicit readback; do not infer residency from plans or latency alone.
- [ ] 7.4 Run focused tests, TypeScript/Svelte checks, OpenSpec strict validation, TOC checks, and whitespace checks; record exact commands and exits.
- [ ] 7.5 Keep each integration `PARTIAL` or `BLOCKED` until its own live evidence and independent readback satisfy acceptance criteria; require separate approval for writes, agent dispatch, dependency additions, or production enablement.

## 8. Acquisition, Model, and License Provenance

- [ ] 8.1 Audit the existing Firecrawl capture and BeautifulSoup parse owners; verify the handoff preserves requested/resolved URL, provider, fetch time, raw-byte digest, parser/version, normalized text digest, and source terms without direct canonical writes.
- [ ] 8.2 Audit `python/atlas_external_docs.py::fetch_beautifulsoup` for SSRF/egress controls; require allowed schemes/hosts, redirect revalidation, response-size and timeout ceilings, and no internal/private-network targets before any live fetch path is enabled.
- [ ] 8.3 Verify `beautifulsoup4` version/license in the active Python environment and treat parsing as local transformation, not network acquisition or content-rights clearance.
- [ ] 8.4 Record provider/runtime, exact upstream model ID, artifact digest/revision, dimensions, precision, task convention, and model license separately for Ollama and Hugging Face execution paths.
- [ ] 8.5 Distinguish EmbeddingGemma 2 (`google/embeddinggemma-2`, Apache-2.0 per its model card) from the existing EmbeddingGemma 1 `google/embeddinggemma-300m` (Gemma license); do not retarget `semantic_768` until runtime support, model checksum, task convention, vector parity, and retrieval evaluation are proven.
- [ ] 8.6 Record Firecrawl self-hosted/source license, Firecrawl SDK license, hosted-service terms, target-site terms/robots policy, BeautifulSoup license, Ollama runtime license, Hugging Face tooling license, and model-weight license as distinct fields; do not use one integration's license as the others'.
- [ ] 8.7 Add license/provenance checks to integration readiness and generated OpenWiki/TOC links; missing or ambiguous rights metadata SHALL remain `UNVERIFIED` and SHALL block redistribution/promotion, not read-only local analysis where otherwise authorized.

## 9. Phase 23 EmbeddingGemma 2 Runtime Evaluation

- [ ] 9.1 Use Ollama as the first local runtime candidate: verify the installed Ollama version and exact tag metadata, then test `embeddinggemma-2:270m` for the text/code baseline. Treat `570m` as a text+audio model package whose Ollama tag currently advertises text input; do not assume direct audio embedding is supported or that its added audio component improves text retrieval. Do not infer local availability from the public listing.
- [ ] 9.2 If the operator approves a model pull, capture the exact Ollama model digest, reported dimensions, runtime version, task prefixes, normalization behavior, and license metadata; do not change the existing `semantic_768` manifest or canonical vectors.
- [ ] 9.3 Run a bounded, read-only Phase 23 comparison against a frozen query/document fixture and the official Hugging Face `google/embeddinggemma-2` reference. Compare output shape, finite values, cosine agreement, retrieval Recall@K/MRR, latency, peak VRAM/RAM, and cold/warm behavior; retain separate receipts per runtime/model artifact.
- [ ] 9.4 Decide whether ONNX/WebGPU or LiteRT is worth evaluating only after the Ollama baseline is measured, or if Ollama is unavailable/incompatible. Compare equivalent text-only 270M inference first; keep ONNX/WebGPU and LiteRT as distinct execution backends and do not conflate LiteRT Web/WASM with WebGPU.
- [ ] 9.5 Record the final Phase 23 decision as `OLLAMA_FIRST`, `COMPARE_ALTERNATES`, or `BLOCKED` with evidence and next gate. Any backend, quantization, or model change creates a distinct representation revision and remains challenger-only until vector and retrieval parity are accepted.
- [ ] 9.6 Map the existing Legal-AI speech pipeline before adding audio embeddings: verify Whisper/Docling transcription owners, transcript timestamps/evidence lineage, and the video-analysis API/page; classify Piper as text-to-speech unless a separately verified speech-recognition owner is found. Do not replace the existing transcription or video-analysis path with EmbeddingGemma 2.
- [ ] 9.7 For legal audio/video retrieval, first evaluate text embeddings over revision-qualified transcript segments with timestamps and evidence references using the 270M text model. Treat direct audio/video embeddings as a separate multimodal challenger requiring validated input support, modality-specific fixtures, source/time-span lineage, and retrieval evaluation; do not assume Ollama's text-input tags accept media.
- [ ] 9.8 Keep transcript text, audio features, video/frame features, and AST/code features as distinct representations aligned through canonical evidence/source IDs and time or byte spans. Do not concatenate them into `semantic_768` or mix vectors across model/runtime revisions without a versioned alignment and parity receipt.
- [ ] 9.9 Inventory Whisper artifacts in the documented install/cache locations before any pull: record model family/size (`tiny`, `base`, `small`, `medium`, `large`), exact file path, byte size, SHA-256, quantization, runtime/provider, and availability. The current launcher documents `ggml-base.bin` at approximately 142 MB; this is an expected size, not proof that the file is present. Do not download or launch a model as part of the inventory.
- [ ] 9.10 Freeze an approved, revision-qualified audio evaluation set with human-reviewed reference transcripts, language, source/evidence IDs, and timestamp spans. Exclude unauthorized or sensitive recordings; preserve access controls and do not copy raw audio into evaluation receipts.
- [ ] 9.11 Compare the existing faster-whisper/Docling path and any available local Whisper fallback on the same frozen set. Report WER/CER, timestamp error where applicable, language coverage, cold/warm p50/p95 latency, throughput, peak RAM/VRAM, model artifact size/checksum, and structured failure/abstention rates. Keep ASR quality separate from embedding retrieval quality; no production promotion from fixture-only or synthetic data.
- [ ] 9.12 Evaluate downstream search separately: embed revision-qualified transcript segments with timestamps/evidence references, then measure Recall@K, MRR/NDCG, and source-span readback against independently judged queries. Compare EmbeddingGemma 2 text embeddings only with matched task prefixes, dimensions, normalization, and runtime/model revisions; direct audio/video embeddings require separate modality-specific tests.
- [ ] 9.13 Record the evaluation receipt and decision (`WHISPER_PRESENT`, `WHISPER_NOT_FOUND_IN_CHECKED_PATHS`, `EVAL_READY`, or `BLOCKED`) with exact commands, exit codes, artifact and fixture checksums, metrics, and limitations. Keep results advisory; do not alter canonical transcripts, embeddings, or retrieval configuration without a separate promotion gate.

## 10. NES-Style Resource Streaming, Action DAG, and Proof Gates

- [x] 10.1 **NES-Style Resource Lookup Tables (TENSOR-IO-01)**: Decouple contiguous numerical tensors \(X \in \mathbb{R}^{N \times 768}\) from metadata strings/identities. CPU owns the parallel registry (`ordinal -> canonicalId`, `sourceRevision`, `featureLabel`, `tensorShard`, `byteOffset`, `representationRevision`). GPU executes bounded Top-K GEMM \(S = Q X^\top\) over memory-mapped contiguous slices; CPU resolves ordinals back to canonical identities through the LUT without mutating stores. Verified in `scripts/atlas/prove-tensor-io-01.mjs`.
- [x] 10.2 **BitNet vs Binary Representation Clarification**: Enforce distinction between BitNet b1.58 ternary weights \(w \in \{-1, 0, +1\}\) (model inference challenger) and binary 0/1 codes (Hamming-distance bit-packed screening). Neither replaces canonical float32 representations without parity receipts.
- [x] 10.3 **Action DAG Schema & Finite-State Machine (RETRIEVAL-DAG-01)**:
      Implement `atlas.action.v1` (`actionId`, `requestId`, `kind`, `dependsOn`, `evidenceRefs`, `expectedSourceRevision`, `permission`, `idempotencyKey`, `state`).
      Enforce the explicit finite-state machine: `PROPOSED → QUALIFIED → QUEUED → LEASED → RUNNING → VERIFIED`.
      A graph traversal hit is NOT permission to mutate files (`writes: 0` guardrail). PostgreSQL owns durable action history and identity; Redis/Valkey coordinates ephemeral worker leases and heartbeats. Contract suite passed 4/4 in `sveltekit-frontend/src/lib/server/atlas/contracts/atlas-action-dag-v1.spec.ts`.
- [x] 10.4 **Breadth-Stability Contract (`atlas.breadth-stability.v2`)**: Extend the breadth stability evaluation contract to record `inputSnapshotChecksum`, `checkpointChecksum`, `representationRevision`, `queriesEvaluated`, unmeasured null metrics (`topKOverlap`, `recallAt10`, `p95LatencyMs`, `peakGpuBytes`, `peakCpuRssBytes`), `replayChecksum`, `writesPerformed: false`, and `eligibleForAuthority: false`.
- [x] 10.5 **Execution Proof: TENSOR-IO-01**: NVMe snapshot → CPU mmap (`torch.from_file(..., shared=False)`) → pinned batch → RTX cuBLAS GEMM. Acceptance criterion: Identical canonical row mapping, validated numerics, bounded VRAM (~1.5 GB free headroom preserved while `:8090` Ornith is active). Live verified on RTX 3060 Ti (`batchCosineTopK`, `cuda_cublas`, max delta 1.7881e-7 < 1e-5, 6.91 GB VRAM free, writes: 0, receipt in `docs/reports/tensor-io-01-receipt.json`).
- [x] 10.6 **Execution Proof: RETRIEVAL-DAG-01**: Top-K → RRF → ContextManifest → action DAG. Acceptance criterion: Zero unqualified evidence admission, no executor-owned canonical mutations. Verified in `scripts/atlas/prove-retrieval-dag-01.mjs` (113ms, unqualified candidate fails closed with `LIVE_FEATURE_JOIN_BLOCKED`, admitted candidate populates ContextManifest, action DAG transitions `PROPOSED → QUALIFIED → QUEUED → LEASED → RUNNING → VERIFIED` with 5/5 valid transitions, `writes: 0` verified, receipt in `docs/reports/retrieval-dag-01-receipt.json`).
- [x] 10.7 **Execution Proof: AGENT-WORK-01**: Generate/edit approved files → affected-test selection → sharded tests. Acceptance criterion: Idempotent actions, matching source revisions, complete append-only receipts. Verified in `scripts/atlas/prove-agent-work-01.mjs` (target file source revision qualified, idempotency verified, stale revision fails closed with `STALE_REVISION_REQUALIFY`, affected test shard selected and passed 4/4 tests under vitest lane-contracts in 8.98s, `writes: 0` verified across Postgres, Qdrant, and Neo4j, receipt in `docs/reports/agent-work-01-receipt.json`).

## Native and GPU evidence review — 2026-10-15

Reviewed against repo artifacts only. Nothing below was re-run in this review; statuses come from existing receipts and file checks.
- CUDA gather (CUDA-01/02): VERIFIED by `docs/reports/atlas-cuda-gather-01-receipt.json` (2026-10-15T06:35Z, RTX 3060 Ti). 6-candidate gather maxDiff 0; H2D transfer 0.686 ms; kernel 0.984 ms; bounds checks fail closed.
- TENSOR-IO-01: VERIFIED by `docs/reports/tensor-io-01-receipt.json` (2026-10-15T06:40Z, RTX 3060 Ti). 1000-row contiguous float32 snapshot on NVMe paired with NES-style CPU LUT, 50-candidate gather offloaded to cuBLAS SGEMM, max delta 1.7881e-7 < 1e-5 vs CPU oracle, 6.91 GB VRAM preserved.
- RETRIEVAL-DAG-01: VERIFIED by `docs/reports/retrieval-dag-01-receipt.json` (2026-10-15T06:41Z). Top-K search and RRF fusion joined into ContextManifest; unqualified candidate blocked; 5/5 FSM transitions passed (`PROPOSED → QUALIFIED → QUEUED → LEASED → RUNNING → VERIFIED`); writes: 0 verified.
- AGENT-WORK-01: VERIFIED by `docs/reports/agent-work-01-receipt.json` (2026-10-15T06:43Z). Source revision verification, idempotency key proof, stale revision rejection (`STALE_REVISION_REQUALIFY`), affected test shard selection and execution (4/4 passed), writes: 0 verified.
- ACE 4D manifold pipeline: PROVEN by `docs/reports/ace-4d-manifold-e2e-pipeline-receipt-v1.json` (2026-10-15T06:08Z). Stage list is recorded there; it is not evidence of ACE promotion or canonical writes.
- Native graph/tree parity (NATIVE-01): script present (`scripts/atlas/test-native-graph-tree-parity.mjs`); 7/7 is reported, not re-verified here. Open: large CSR graphs, malformed-tree limits, N-API ownership and lifetime tests.
- Action DAG FSM: spec present (`sveltekit-frontend/src/lib/server/atlas/contracts/atlas-action-dag-v1.spec.ts`); 4/4 is reported, verified by vitest lane-contracts.
- Zero-copy wording: `torch::from_blob` wraps CPU memory without copying; `.to(kCUDA)` still performs a host-to-device copy. Do not describe the path as zero-copy GPU execution.
- Not proven: manifold interpolation edge cases and CPU/GPU parity (MANIFOLD-01/02), real Graphify CSR snapshot loading (GRAPH-01), manifold recommendations as advisory-only ACE candidates (ACE-01), and GPU-over-CPU performance (PERF-01).
## Workstation phases 17–24 audit — 2026-10-15

Sources: `scripts/atlas/audit-phase17-21-workstation.mjs` (read-only SELECTs; regenerated `docs/reports/phase17-21-workstation-audit.{json,md}`), plus code-presence checks for phases 22–24. No checkboxes changed.
- P17 PyTorch feature extraction: SCAFFOLD_ONLY (35%). Extractor and Python fallback exist; phase17 artifact has 1 row; card-length heuristics remain.
- P18 XGBoost reranker: SCAFFOLD_ONLY (40%). Scripts and sidecar lanes exist; compatibility artifact has 1 row; no validated training denominator yet.
- P19 HMM + linear policy baseline: OPERATIONAL (90%). Append-only retrieval loop has 443 rows.
- P20 DSPy program contract: OPERATIONAL (95%) per audit. Zod validation 3251/3251 valid; this status is the audit's, not re-derived here.
- P21 GEPA / reflective optimization: EVAL_GATED (75%). 50-query replay proof passes; policy/PPO and Gym scripts are research surfaces.
- P22 learned-policy experiments: research surfaces only (PPO audit scripts; no PPO trainer found). Not started as a trained lane.
- P23 QLoRA / SFT: eval-only. A PEFT LoRA trainer exists for a tool-routing cross-encoder (`python/parent_atlas_neural_router/train_tool_cross_encoder.py`) and a QLoRA dataset exporter exists (`sveltekit-frontend/scripts/export-qlora-dataset.mjs`). No QLoRA adapter for a chat model has been trained or evaluated.
- P24 DPO: no trainer found; only a mention in a readiness report generator. Not started.
- Unresolved: the audit reports summary schema MIGRATION_PENDING while its `summary_missing` field is null. The migration status needs a direct column check before anyone acts on it.

## Local Ornith runtime MCP controls — 2026-10-15

- [x] Register bounded `llama_server.status`, `llama_server.start`, and `llama_server.unload` on loopback TRACE only, with strict schemas and explicit mutation confirmation. Reuse `scripts/launch-turboquant.ps1 -Detached -NoEvict` and share the idle/ownership-checked controller with the existing VS Code stop task. Implementation: `sveltekit-frontend/src/mcp/llama-runtime-tools.ts`, `scripts/atlas/llama-server-control.ps1`.
- [x] Prove MCP schema/list/call boundaries and PowerShell confirmation, ownership, busy-slot, idempotency, launch-argument, shutdown/readback and memory-delta guards using isolated fixtures. Record actual results separately from live runtime evidence; see `docs/architecture/llama-runtime-mcp-controls.md` for bounded commands.
- [x] Record 9 passing MCP tests, 16 passing isolated guard/lifecycle checks, focused strict TypeScript and OpenSpec validation, plus a real read-only MCP status exchange in `docs/reports/llama-runtime-mcp-implementation-20261016T0315Z.json`. The live status proof uses an in-memory MCP transport with actual Windows/NVIDIA readback; it does not establish deployed TRACE discovery or a live start/unload cycle.
- [ ] Prove discovery on the refreshed deployed TRACE server/client; do not restart shared TRACE automatically or equate source registration with session tool availability.
- [ ] After separate operator authorization, prove an actual idle start/unload lifecycle with independent process/listener/model and per-GPU used/free readbacks. Keep the currently unloaded service stopped during read-only validation.

## 11. Phase 24 — Live Source Lineage and Governed Document Editing

Parent Atlas: the next blocker is **live source lineage**, not GPU performance. The latest investigation changes the priority. RTX gather, tensor I/O, native graph helpers, and focused integration tests have passed their respective proof gates. But attempting to run a real Function Registry lookup exposed a more fundamental problem: the registry (`atlas_callable_search`), AST projection (`atlas_ast_nodes`), workspace revision, and source-byte verifier do not yet agree on identity and revision semantics (0/85 matched in live census). Another CUDA benchmark, embedding model, or HyperGraphRAG traversal will not resolve the current integration blocker.

Safeguards must be strictly enforced before document editing: the trained NLP symbol editor and function/module recommendation engine (PCA/SVD low-rank tangent/manifold projection) must be trained, qualified, and verified against live source lineage BEFORE any AST-grep / TS-Morph document editing is tested or enabled.

- [ ] 11.1 **Live Source Lineage Reconciliation (P24-LINEAGE-01)**: Reconcile `atlas_callable_search` so each candidate resolves to exactly one canonical `atlas_symbol_versions` record, an exact packet/source binding, and one native-provenance AST node at matching workspace/source revisions and content digest. Census must show zero revision mismatches (0/85 resolved) before proceeding.
- [ ] 11.2 **Live Source-Byte Qualification (P24-SNAPSHOT-02)**: Load live symbol through snapshot loader; verify whole-file SHA-256, UTF-8 boundaries, function span, and expected revisions. Wrong revisions or absent AST nodes fail closed without writes.
- [ ] 11.3 **Trained NLP Symbol Editor & Recommendation Engine (P24-NLP-04)**: Train and freeze the query→function recommendation cohort with reviewed labels, hard negatives, and query-grouped splits. Establish deterministic RRF baseline; compare Naive Bayes and logistic regression before XGBoost/MLP. Recommendation output is advisory-only (`mutability: READ_ONLY`, `canonicalAuthority: false`).
- [ ] 11.4 **PCA/SVD Low-Rank Tangent / Manifold Projection (P24-LOWRANK-05 & P24-TANG-06)**: Evaluate PCA/TruncatedSVD low-rank tangent manifold projection on the source-qualified feature matrix against the full-dimensional semantic baseline. Verify reconstruction variance, Recall@K, and ℓ²-sampling access assumptions; output remains non-promotional and advisory.
- [ ] 11.5 **Governed AST-Grep / TS-Morph Document Editing Safeguards (P24-EDITOR-03)**: Require model training and lineage qualification BEFORE any document editing is tested. TS-Morph produces source-bound symbol/edit proposals only (diff checksum, preimage SHA-256, path containment, allowed-root policy). Any actual write requires explicit `AtlasActionV1` in `PROPOSED` state with plan-bound human approval, compare-and-swap preimage check, and post-write readback (`writes: 0` guardrail).
- [ ] 11.6 **Unified Phase 24 Recommendation Receipt (P24-RECEIPT-07)**: Emit read-only execution receipt binding request ID, canonical symbol IDs, source/workspace revisions, training cohort checksums, diff checksums, validation results, and `writesPerformed: false`.

