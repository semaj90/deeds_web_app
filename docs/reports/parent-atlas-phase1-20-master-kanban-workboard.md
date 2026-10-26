# Parent Atlas: Phase 1–20+ Master Kanban Workboard & Production Hardening

> **Status:** HISTORICAL BASELINE — see current evidence overlay below.
> **Date:** 2026-10-15  
> **Schema:** `atlas.parent-atlas-kanban-workboard.v1`  
> **Authority Order:** PostgreSQL 18.4 (Canonical Truth) → 8095 Tree-sitter/AST-grep → pgvector / Qdrant (Projections) → TurboVec gRPC → Go Retrieval → LangExtract → Ornith 1.5-9b (:8090 Synthesis)

## Current evidence overlay — 2026-10-25

This overlay supersedes historical status labels below where they conflict. The detailed October 15 architecture, counts, service-health claims, and phase assertions are retained for provenance; they have not all been revalidated as current. OpenSpec owner `tasks.md` files remain authoritative. This document and the generated OpenSpec workboard are diagnostic projections, not completion authority.

### Phase namespace and current verdict

The repository uses two incompatible numbering systems: approximate legacy Phase 1–24 labels and canonical workstation IDs `workstation-p11` through `workstation-p25`. Do not map same-numbered legacy rows onto workstation phases. The canonical index leaves workstation P1–P10 unmapped; therefore no overall Phase 1–20 percentage is computable.

| Canonical phase | Current evidence verdict | First outstanding proof |
|---|---|---|
| P1–P10 | `NOT_MAPPED` | Identify canonical workstation phase IDs and owners; do not borrow legacy ordinals. |
| P11 — Experience/memory wiring | `NOT_VERIFIED` | Current phase-specific receipt for the admitted revision and caller path. |
| P12 — Source/revision/chunk authority | `PARTIAL / BLOCKED` | Source bindings exist, but the current projection audit reports zero exact admitted packet matches; identity and revision qualification remain unproven. |
| P13 — Feature registry/classification | `PARTIAL / NOT_PROVEN` | The classifier ledger reports `CLASSIFIER_LINEAGE_BLOCKED`; current admitted classifier lineage is absent. |
| P14 — Context cache/residency | `PARTIAL / NOT_PROVEN` | No admitted user-query lifecycle proves actual load/unload, readback, and residency identity. |
| P15 — Semantic retrieval/fusion | `PARTIAL / NOT_PROVEN` | No correlated authenticated query trace reaches a qualified `ContextManifest` and `PromptPlan`. |
| P16 — Graph/ontology expansion | `BLOCKED` | No terminal Graphify run matches workspace revision `c636…`; projection audit verdict is `NOT_SAFE_TO_PROJECT`. |
| P17 — NLP/structural/numeric features | `NOT_PROVEN` | Phase audit has zero mapped or passing receipts. |
| P18 — Learned reranking evaluation | `NOT_PROVEN` | Phase audit has zero mapped or passing receipts; label-gated experiments are not production proof. |
| P19 — Deterministic policy baseline | `NOT_PROVEN` | Phase audit has zero mapped or passing receipts. |
| P20 — Program/workflow contracts | `NOT_PROVEN` | Phase audit has zero mapped or passing receipts; post-P20 deferrals remain separate gates. |

Evidence: `docs/reports/parent-atlas-phase-roadmap-reconciliation-v1.json`, `docs/parent-atlas-workstation-todo.md`, `docs/reports/phase17-21-current-proof-audit-20261016.json`, `docs/reports/atlas-canonical-projection-fabric-audit-2026-10-25.json`, and `openspec/changes/parent-atlas-workspace-snapshot-runtime/tasks.md`. The projection audit reports `IDENTITY_ALIGNED`, `REVISION_QUALIFIED`, `SYMBOLS_RESOLVED`, `ORDINAL_MAP_SEALED`, `PROJECTIONS_CHECKSUM_ALIGNED`, `BITFROST_KEYS_DERIVABLE`, and `ACE_EVIDENCE_GROUNDED` as `NOT_PROVEN`; other predicates are partial except the ontology cohort predicate.

**First failing boundary:** the source snapshot/bindings do not join to an exact canonical packet cohort (`IDENTITY_ALIGNED` and `REVISION_QUALIFIED` are `NOT_PROVEN`; exact admitted packet matches: 0). Separately, no terminal Graphify run is recorded for `c636…`, and the documented terminal path requires explicit authorization for a write-capable apply chain. Neither failure authorizes packet tagging or projection writes.

### Fresh OpenSpec task snapshot

The read-only projection generated at `2026-10-26T02:23:57.558Z` contains **13,344 tasks**: **7,885 marked complete** and **5,459 open**. This is a generated task-state summary, not a Phase 1–20 or production-completion percentage. The hardening ledger contains **13 checked / 69 open (13/82 = 15.9%)**, a checkbox ratio only.

Isolated JSON and Markdown outputs: `.tmp/atlas/openspec-workboard-phase1-20-refresh-20261025T192353.json` and `.tmp/atlas/openspec-workboard-phase1-20-refresh-20261025T192353.md`. They are ignored local diagnostics generated with an absent controller input; the shared 59 MB `docs/reports/openspec-workboard-v1.json` was not overwritten.

No database, cache, Graphify, model, service, or projection-store writes occurred. The historical workboard sections below are preserved as an October 15 snapshot; do not use their service counts or `DONE` labels as current proof.

---

## 1. OAKLib + NetworkX Alignment Architecture

```
                       ┌───────────────────────────────┐
                       │   PostgreSQL 18 Canonical     │
                       │  atlas_domain_ontology (SQL)   │
                       └──────────────┬────────────────┘
                                      │
               ┌──────────────────────┴──────────────────────┐
               ▼                                             ▼
  ┌─────────────────────────────┐               ┌─────────────────────────────┐
  │   OAKLib (Ontology Access)  │               │   LangExtract NLP (:8095)   │
  │  AtlasPostgresOntologyAdapter│              │  Grounded Mention Spans     │
  │  IS_A, SUBCLASS_OF, PART_OF │               │  Exact byte ranges (offset) │
  └────────────┬────────────────┘               └─────────────┬───────────────┘
               │                                              │
               └──────────────────────┬───────────────────────┘
                                      ▼
                        ┌───────────────────────────┐
                        │    NetworkX DiGraph       │
                        │ (In-Memory Python Oracle) │
                        │  atlas_synthesis_context_ │
                        │        graph.py           │
                        └─────────────┬─────────────┘
                                      │ Serialized Node List + Edge Tuples
                                      ▼
                        ┌───────────────────────────┐
                        │      Ornith 1.5-9b        │
                        │    (:8090 llama-server)   │
                        │   Bounded Prompt Context  │
                        └───────────────────────────┘
```

### The Alignment Distinction
1. **OAK (Ontology Access Kit / `oaklib`)**:
   - Provides deterministic ontology lookup, concept ID resolution, hierarchical traversal (`ancestors`, `descendants`), and ontology relationship graphs (`IS_A`, `SUBCLASS_OF`).
   - Implemented in `python/atlas_oak_kernel.py` and `python/parent_atlas_ontology/oaklib_external_adapter.py`.
   - Never mutates canonical database records; acts as an ontology accessor.

2. **OaK (Ontology-as-a-Kernel - arXiv:2608.22974)**:
   - The architectural design pattern: LLMs and synthesis agents must never read unbounded raw graph dumps. They access ontology and evidence state exclusively through a frozen schema and a small, typed function registry (`lookup`, `search`, `ancestors`, `descendants`).

3. **NetworkX (In-Memory Graph Oracle)**:
   - Implemented in `python/atlas_synthesis_context_graph.py` and `python/parent_atlas_networkx_pagerank.py`.
   - Takes OAKLib ontology concept tuples, joins them with LangExtract grounded source spans, and constructs an in-memory directed graph (`nx.DiGraph`).
   - Serializes the graph into compact `(u, v, edge_type)` tuples for the `llm_synthesis` context window.
   - Provides the mathematical CPU reference oracle for PageRank authority (`atlas_graph_authority_scores`) against which GPU (cuGraph) projections are validated.

---

## 2. Phase 1–12 Review: Did We Accomplish Them?

### Summary Analysis — evidence-qualified verdicts
The repository historical record has two phase counting systems:
1. **Legacy Ordinals (1–24)**: Found in legacy markdown summaries; were rough project milestones, not receipt-backed OpenSpec ledgers.
2. **Canonical Workstation Roadmap (`workstation-p11` through `workstation-p25`)**: Defined in `docs/parent-atlas-workstation-todo.md` and reconciled in `docs/reports/parent-atlas-phase-roadmap-reconciliation-v1.json`.

| Phase Milestone | Description | Audit Status | Accomplished? | Details & Blockers |
|---|---|---|---|---|
| **Phase 1–6 (Legacy)** | Workspace Ingestion, Chunking, Initial FTS | `HISTORICAL_MERGED / NOT_VERIFIED` | **Unknown** | Historical summaries claim these were subsumed by PostgreSQL chunk/packet surfaces, but no phase-specific acceptance receipts are cited. Canonical workstation P1–P10 are unmapped; do not infer equivalence or completion. |
| **Phase 7 (AWM-07)** | Top-K PageRank Candidate Hydration & Parity | `BOUNDED_READ_ONLY_GATE_PASS / PHASE_PARTIAL` | **Partial** | The 2026-10-15 receipt sampled 25 candidates: 1 hydrated/admitted, 24 terminally rejected, zero unhydrated promotions, and zero writes. This proves bounded safe handling, not whole-phase closure; owner-ledger tasks remain open. See `docs/reports/phase7-topk-hydration-receipt.json` and `openspec/changes/parent-atlas-adaptive-backprop-hll-monitoring/tasks.md`. |
| **Phase 8 (AWM-08)** | QLoRA / Safetensors Challenger Reranker | `BLOCKED_NO_ELIGIBLE_REVIEWED_LABELS` | **No — incomplete** | The old 49/200 tally is unreconciled. Fresh 2026-10-25 validation found 0/2,433 completed grades and 0 revision-bound queries/candidates; the separate 1,287-judgment queue has 0 completed judgments and 0 hard negatives. No challenger training or held-out evaluation is eligible. See `docs/reports/golden-relevance-review-pool-validation-2026-10-25-phase8.json`, `docs/reports/golden-relevance-review-queue-validation-2026-10-25-phase8.json`, and the AWM-08 owner ledger. |
| **Phase 9 (AWM-09)** | Multi-Lane SearchRuntime Recommendations | `DIAGNOSTIC_SUBTASK_PROVEN / PHASE_PARTIAL` | **Partial** | AWM-09-02 records a 1/1 lexical/semantic/AST fusion smoke. AWM-09-01 and 09-03–09-05 remain open; revision-qualified evidence and an end-to-end receipt are still required. |
| **Phase 10 (AWM-10)** | Source Revision Propagation & Invalidation | `DEFERRED_POST_P20` | **No — intentionally deferred** | The owner ledger defers source-revision propagation until post-P20 and GPU-sidecar gates pass. Deferral is not completion. |
| **Legacy Phase 11–12** | No canonical legacy definitions established | `NOT_MAPPED` | **Unknown** | The reconciliation does not define legacy ordinals 11–12. The workstation P11/P12 entries below are a separate numbering system. |
| **Workstation P11** | Experience & memory wiring | `HISTORICAL_HEALTH_CLAIM / NOT_REVERIFIED` | **Not currently proven** | The October 15 material reports local service health, but that is not current availability or a phase-specific caller-path receipt. This canonical phase is not the old “local infrastructure health” label. |
| **Workstation P12** | Source, revision & chunk authority | `PARTIAL / IDENTITY_AND_REVISION_BLOCKED` | **No — incomplete** | Source-binding work exists, but the current overlay reports zero exact admitted packet matches and legacy chunk rows remain unrevisioned. No backfill is authorized. |

---

## 3. Comprehensive Master Kanban Board (Phase 1–20+)

```
┌─────────────────────────────────┐   ┌─────────────────────────────────┐   ┌─────────────────────────────────┐   ┌─────────────────────────────────┐
│         BACKLOG / GATED         │   │          IN PROGRESS            │   │        VERIFIED / PROVEN        │   │        DONE & HARDENED          │
├─────────────────────────────────┤   ├─────────────────────────────────┤   ├─────────────────────────────────┤   ├─────────────────────────────────┤
│ • P10 / P12 Source Revision     │   │ • P8 QLoRA Reranker Challenger  │   │ • P7 PageRank Top-K Hydration   │   │ • OpenSpec Change Suite         │
│   Backfill (Post-P20)           │   │   (Eligible labels: 0 current)  │   │   (Receipt PASS, writes: 0)     │   │   (108/108 Valid)               │
│ • P17 LibTorch CUDA Feature     │   │ • P14 WebGPU N64 LOD Streaming  │   │ • P9 Multi-Lane Recommendations │   │ • PostgreSQL 18 pgvector HNSW   │
│   Extraction Tournament         │   │   (Resource Viewpoint Bridge)   │   │   (SearchRuntime 1-vote fusion) │   │   (220k vectors, 768-D)         │
│ • P18 Supervised XGBoost GNN    │   │ • P16 OAKLib / NetworkX         │   │ • P11 Infrastructure TCP Health │   │ • Ornith 1.5-9b Local Synthesis │
│   Reranking                     │   │   Ontology Kernel Wiring        │   │   (Engram :8792 active)         │   │   (:8090, 0 Gemma mentions)     │
│ • P22 Learned-Policy Research   │   │ • Desktop App Electron/Tauri    │   │ • TurboVec gRPC Dimension       │   │ • Go Retrieval Codebase Engine  │
│ • P23 Transport QUIC/NATS Pool  │   │   Hardening & Build Gates       │   │   Transform (768 -> 64 manifold)│   │   (:8100, read-only streaming)  │
└─────────────────────────────────┘   └─────────────────────────────────┘   └─────────────────────────────────┘   └─────────────────────────────────┘
```

---

## 4. Phase-by-Phase Technical Audit (P1 through P20+)

### P1–P6: Ingestion & Canonical Foundation
- **State:** `DONE & HARDENED`
- **Owner:** PostgreSQL 18 `legal_ai_db`
- **Artifacts:** `codebase_chunk_index` (274,465 rows), `atlas_packets` (54,078 packets).
- **Guardrail:** PostgreSQL owns canonical truth; Qdrant and Neo4j are projections.

### P7: Top-K PageRank Candidate Hydration & Fusion
- **State:** `VERIFIED & PROVEN`
- **Owner:** SearchRuntime + PageRank Authority (`atlas_graph_authority_scores`)
- **Receipt:** `docs/reports/phase7-topk-hydration-receipt.json`
- **Verification:** Snapshot `8129be75-9b01-43a4-a08c-3bdd39ec66c6` (1,761 distinct scores > 100, reference call graph edges present). 25 sampled, 1 HYDRATED (`src/lib/components/ui/select.ts`), 24 terminal rejections (`AMBIGUOUS_SOURCE_REF` / `MISSING_SOURCE_REF`), zero unhydrated promotions, `writes_performed: false`.

### P8: QLoRA / Safetensors Challenger Reranker
- **State:** `IN PROGRESS (Gated on Data)`
- **Owner:** `parent-atlas-retrieval-lod-algorithm-taxonomy` (ATLAS-LEARNING-01)
- **Current Metric:** 0 eligible labels in the current relevance-review inputs (0/2,433 pool grades and 0/1,287 queue judgments complete; zero revision-bound queries/candidates). The old 49/200 is unreconciled. A separate inventory describes 49 revision-qualified rows in a 142-row *unreviewed domain-classification draft*; this is a different task and is not evidence for AWM-08 relevance labels.
- **Rule:** No synthetic reasoning traces or unreviewed model outputs as labels.

### P9: Canonical AST, Semantic, Contextual Recommendations
- **State:** `PROVEN (Diagnostic Mode)`
- **Owner:** SearchRuntime single fusion owner (`recommendation-smoke.spec.ts`)
- **Verification:** 1-vote per logical lane. Citations grounded in verified evidence IDs. Rejection reasons typed.

### P10: Source Revision Propagation & Invalidation
- **State:** `DEFERRED TO POST-P20`
- **Blocker:** 274,465 chunk rows lack revision digests. Applying a strict revision gate now halts live retrieval across the entire repository. Deferred until workstation P20 completes.

### P11: Workstation State & Service Health Gate
- **State:** `VERIFIED OPERATIONAL`
- **Services Active:**
  - `:8090`: `llama-server.exe` (`ornith-1.5-9b`, synthesis & tool calls)
  - `:11434`: Ollama (`embeddinggemma:latest`, 768-D canonical dense vectors)
  - `:6333`: Qdrant (`codebase_chunks_768`, 328k points)
  - `:5434`: PostgreSQL 18.4 (`legal_ai_db`, pgvector HNSW index)
  - `:50062`: TurboVec gRPC sidecar (manifold projection)
  - `:8100`: Go Retrieval HTTP engine
  - `:8095`: LangExtract HTTP entity extractor

### P12: Identity Authority & Chunk Writer Revision
- **State:** `DEFERRED TO POST-P20`
- **Owner:** `openspec/changes/parent-atlas-chunk-index-whole-file-hash`
- **Status:** Producer patched; single-file apply blocked on operator authorization (`safeToBackfill=false`).

### P13: Feature Extraction & Classification Pipeline
- **State:** `IN PROGRESS`
- **Owner:** `atlas.nlp.analyze.v1` / `python/miniforge_nlp_sidecar.py`
- **Requirement:** Structural coordinates must carry syntax coordinate tags and `canonical_authority: false`.

### P14: Context Residency & Resource Streaming (WebGPU / N64 LOD Analogy)
- **State:** `IN PROGRESS`
- **Existing Precedent:** `sveltekit-frontend/src/lib/webgpu/N64TextureLODSystem.ts` (4 KB page swaps, priority & last-access tracking) and `shader-cache-manager.ts`.
- **Query Viewpoint Concept:** The user's query acts as the camera. LOD 0 (Hot: IDs, compact labels) $\to$ LOD 1 (Warm: 64-D centroid) $\to$ LOD 2 (Semantic 768-D) $\to$ LOD 3 (AST & Graph Neighborhood) $\to$ LOD 4 (Exact Source Spans).
- **Rule:** No raw tensors or KV cache persisted to disk or Valkey (BitFrost stores descriptors only).

### P15: SearchRuntime RRF Multi-Lane Fusion
- **State:** `DONE & HARDENED`
- **Owner:** `sveltekit-frontend/src/lib/server/retrieval/orchestrator.ts`
- **Rule:** 1 vote per logical lane. Dedup across Lexical BM25, Dense Semantic 768, and AST/Graph expansion.

### P16: Graph Traversal, OAKLib & PageRank Authority
- **State:** `VERIFIED & PROVEN`
- **Owner:** `python/atlas_synthesis_context_graph.py` + PostgreSQL `atlas_graph_authority_scores`.
- **Integration:** OAKLib provides ontology hierarchy; NetworkX builds the context graph; PostgreSQL stores validated PageRank scores.

### P17–P20: GPU Sidecar Tournament & Workstation Hardening
- **State:** `SCAFFOLD & HARDENING`
- **Rules:** Native Windows LibTorch / RAPIDS WSL2 ABI checks. Never terminate `:8090` without graceful drain.

---

## 5. Desktop App & Production Hardening Checklist (`npm run build`)

To build and package the Deeds Web App legal-AI platform into a production desktop application:

### Step 1: Frontend Type Integrity Gate
- [x] Run strict Svelte 5 runes audit: verify no legacy `export let`, `$:`, or `on:click`.
- [x] Ensure Bits UI v2 components use the namespace `child` snippet pattern.
- [ ] Execute clean Svelte check:
  ```powershell
  cd sveltekit-frontend
  npm run check
  ```

### Step 2: OpenSpec Governance Validation
- [x] All 108 change specifications valid:
  ```powershell
  npx openspec validate --changes
  ```

### Step 3: Service Health & Endpoints Pre-flight
- [x] Verify `:8090` responds with `ornith-1.5-9b` at `/v1/models`.
- [x] Verify `:5434` PostgreSQL 18 is up with pgvector extension enabled.
- [x] Verify `:6333` Qdrant collection `codebase_chunks_768` is accessible.

### Step 4: Production SvelteKit Build
- [ ] Build SvelteKit static / node server bundle:
  ```powershell
  cd sveltekit-frontend
  npm run build
  ```

### Step 5: Desktop Packaging
- [ ] If packaging with Electron / Tauri / Wails:
  - Point app webview to the built SvelteKit bundle (`build/index.html` or local server adapter).
  - Bind backend API calls via `env.server.ts` to workstation sidecars.
  - Enforce Engram-only memory lane (`ENGRAM_ONLY=true`).
