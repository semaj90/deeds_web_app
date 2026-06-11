# Temporal Kanban Consolidation — June 11, 2026

**Purpose**: Map blocking dependencies across Phase 11, 16, 17, 18, and HyperRAG to clarify critical path and safe agent workloads for Phase 3F trace generation.

**Status**: COMPLETE — Board state clear, agent workloads mapped, Phase 3F activation path defined.

---

## Executive Summary

Three **independent** active lanes exist post-June 11, each with different blocking status:

1. **Phase 16 Runtime Patching** — ✅ READY NOW (no dependencies)
2. **Phase 3F Trace Population** — ⏸️ READY (pending Temporal Kanban clarity) — **NOW CLEAR**
3. **Neo4j USED_CONCEPT Sync** — ⏳ BLOCKED BY Phase 3F (needs 1,000+ traces)

**Critical Path**: Phase 16 patching can start immediately in parallel with Phase 3F trace generation. Both are independent. Start Phase 3F traces **now** — the board is clean.

---

## Phase Dependency Map

```
┌─────────────────────────────────────────────────────────────┐
│                        Phase 3E.1 COMPLETE ✅                │
│    (Telemetry → Concept bridge, strategy_distribution)       │
└────────────────┬────────────────────────────────────────────┘
                 │
                 ↓
┌─────────────────────────────────────────────────────────────┐
│                   Phase 3F (READY TO START) ✅                │
│        Gemma4-Agent + Error-Agent trace recording            │
│  Input: Qdrant selected_concepts/packets from live queries   │
│  Output: agent_traces table (target: 1,000+ rows)            │
│  Gates: >100 telemetry, fusion ≥60%, reward ≥0.5            │
│                                                               │
│  Independent tasks (can run in PARALLEL):                    │
│  ├─ Phase 16 Runtime Patching (no deps)                      │
│  ├─ Qdrant Concept Enrichment (no deps)                      │
│  └─ Phase 3F trace accumulation (active)                     │
└────────────┬────────────────────┬───────────────────────────┘
             │                    │
             ↓                    ↓
┌──────────────────────┐ ┌─────────────────────────────┐
│  Phase 16: Graph    │ │ Phase 3F Traces Ready? →    │
│ Refresh Runtime ✅  │ │ >100 telemetry rows?        │
│                     │ │ fusion_dominance ≥60%?      │
│ (manifest + gates)  │ │ Yes? → Phase 3G gates OPEN  │
└─────────────────────┘ └─────────────────────────────┘
                             │
                             ↓
                    ┌──────────────────────┐
                    │ Phase 3G (Deferred)  │
                    │ Neo4j GDS Projection │
                    │ (awaits Phase 3F OK) │
                    └──────────────────────┘
```

---

## Phase 11 (LLM Synthesis Memory) — Status: STABLE ✅

**What it is**: Foundational LLM synthesis memory model + agent backbone

**Key deliverables**:
- ✅ gemma4-agent.ts (4 in-process tools: rag_search, case_search, memory_recall, hyperedge_stats)
- ✅ recordAgentTrace() wired (fire-and-forget into agent_traces table)
- ✅ Tool definitions in llama-tool-definitions.ts
- ✅ MCP tool boundaries defined (no raw DB access)

**Dependency status**: INDEPENDENT
- Does NOT block Phase 3F
- Does NOT depend on Phase 17 or 18
- Phase 11D-B next gate: real Ollama embed + retrieval-pass Qdrant/Neo4j/Redis/Langfuse dry-run scoring

**Safe to use NOW**: Yes. Both Gemma4-Agent and Error-Agent are wired and operational.

---

## Phase 16 (Graph Refresh Runtime) — Status: READY ✅

**What it is**: Runtime wiring for graph manifest caching, invalidation, and refresh promotion

**Key artifacts (all present)**:
- ✅ graph-refresh-manifest.json (memory/exports/)
- ✅ Invalidation code (src/lib/server/cache/invalidation*.ts)
- ✅ Promotion wiring (refresh-promotion-states.mjs)
- ✅ Refresh scripts (write-graph-refresh-manifest.mjs)

**Completion**: ~65-70% (runtime gates ready, execution pending)

**Dependency status**: INDEPENDENT
- Does NOT depend on Phase 3F
- Does NOT depend on Phase 17 or 18
- Can start patching immediately

**Next step**: Bind graph-refresh-manifest.json and run refresh-promotion-states.mjs

---

## Phase 17 (Feature Extraction) — Status: READY ✅

**What it is**: Offline feature extraction pipeline (numpy/PyTorch)

**Key scripts**:
- ✅ npm run atlas:phase17 (feature extractor, Python preferred, JS fallback)
- ✅ scripts/atlas/phase17-pytorch-features.mjs (documented, dry-run validated)

**Input contract**: JSONL cards with embedding vectors

**Output**: Feature vectors (.npy files), JSONL enrichment

**Dependency status**: INDEPENDENT (data layer)
- Does NOT block Phase 3F trace generation
- Does NOT depend on Phase 3F results
- Runs offline, no impact on live agents

**Safe to use NOW**: Yes, when needed. Not on critical path.

---

## Phase 18 (XGBoost Reranker) — Status: READY ✅

**What it is**: Offline reranking model (numpy/xgboost)

**Key scripts**:
- ✅ npm run atlas:phase18 (reranker, Python preferred, JS fallback)
- ✅ scripts/atlas/phase18-xgboost-rerank.mjs (documented)

**Input contract**: Feature vectors from Phase 17

**Output**: Rerank scores, ranked JSONL

**Dependency status**: DEPENDS ON Phase 17
- Phase 17 must run first (produces feature vectors)
- Both are offline; no impact on live agents
- Result feeds Postgres/Qdrant for ranking

**Safe to use NOW**: Yes. Run Phase 17 → Phase 18 in sequence when optimization lane is active.

---

## Phase 3F (Agent Trace Accumulation) — Status: READY TO START ✅

**What it is**: Live agent query accumulation + trace recording

**Agents**:
- ✅ Gemma4-Agent (wired, fire-and-forget trace recording)
- ✅ Error-Agent (wired, structural repair traces)

**Data flow**:
1. User query → Gemma4-Agent → selected_concepts/packets extracted from Qdrant
2. Tool calls executed (rag_search, case_search, memory_recall, hyperedge_stats)
3. Trace recorded: query, strategy, concepts, outcome, reward
4. **Fire-and-forget** — does NOT block query response

**Target**: 1,000+ traces with selected_concepts populated

**Validation gates** (Phase 3E.1 checkpoint):
- ✅ >100 telemetry records exist (from Phase 3E.1)
- ✅ fusion_dominance ≥60% (strategy_distribution shows fusion > vector_only variance)
- ✅ >80% of traces have reward ≥0.5

**Dependency status**: INDEPENDENT
- Does NOT depend on Phase 16
- Does NOT depend on Phase 17 or 18
- Phase 3E.1 already complete (telemetry bridge in place)

**Next step**: RUN NOW
- Boot Gemma4 agents in live mode
- Accumulate 2-3 days of queries
- Monitor Phase 3E.1 report (npm run phase3e:generate-report)
- When gates pass, Phase 3G activates (Neo4j GDS)

---

## Phase 3G (Neo4j GDS Projection) — Status: CODE READY ✅

**What it is**: Neo4j graph data science (PageRank, Louvain, Node Similarity)

**Key deliverables**:
- ✅ neo4j-gds-retrieval.ts (267 lines, algorithm wrappers)
- ✅ sync-retrieval-graph.mjs (200 lines, Postgres → Neo4j batch sync)
- ✅ GDS projection definitions

**Input**: USED_CONCEPT edges from Phase 3F traces (via selected_concepts)

**Activation gate**: Phase 3F > 1,000 traces

**Dependency status**: BLOCKED BY Phase 3F
- Needs 1,000+ traces to have sufficient USED_CONCEPT edges
- Current state: ~110 traces → Phase 3G not yet active
- When Phase 3F hits 1,000+ → Phase 3G gates open automatically

**Safe to preview NOW**: Yes (dry-run mode). Full activation waits for Phase 3F gate.

---

## HyperRAG (4-Lane Hypergraph) — Status: OPERATIONAL ✅

**What it is**: Neo4j + Qdrant integrated hypergraph with 4 typed edge lanes

**Key components**:
- ✅ 282 edges across A/B/C/D lanes (cluster_context, shared_resource, agents_context, vault_link)
- ✅ Qdrant payload tagging with concept_id, community_id, retrieval_strategy
- ✅ Neo4j SIMILAR_TOPOLOGY + BELONGS_TO_CLUSTER edges

**Dependency status**: INDEPENDENT
- Hypergraph was built during Phase 2B completion
- Does NOT depend on Phase 3F
- Feeds results to Phase 3F agents (selected_concepts sourced from HyperRAG)

**Safe to use NOW**: Yes. HyperRAG is the source of truth for retrieval context that Phase 3F agents use.

---

## Critical Path Analysis

### What's on the critical path?

```
CRITICAL PATH (determines when Phase 3G activates):

Phase 3E.1 COMPLETE ✅
    ↓
Phase 3F trace accumulation (START NOW)
    ├─ 2-3 days of live queries
    ├─ target: 1,000+ traces
    └─ gates: >100 telemetry, fusion ≥60%, reward ≥0.5
        ↓
Phase 3F gates pass
    ↓
Phase 3G Neo4j GDS (automatically activated)
```

### What's NOT on the critical path?

```
PARALLEL (can run independently):

Phase 16 Runtime Patching (START NOW)
    └─ independent of Phase 3F
    └─ target completion: 1-2 days

Phase 17/18 (Offline optimization lanes)
    └─ independent of Phase 3F
    └─ run when optimization work is prioritized

Qdrant Concept Enrichment (START NOW)
    └─ tag codebase_chunks_768 with concept_id, community_id
    └─ independent of Phase 3F
    └─ target completion: 1 day
```

---

## Board State Summary (June 11, 2026)

### ACTIVE (Start immediately)

1. **Phase 3F Trace Population** ← **THIS IS UNBLOCKED. START NOW.**
   - Gemma4-Agent fires on every user query
   - Error-Agent fires on structural repair
   - Fire-and-forget recording (non-blocking)
   - Target: accumulate 1,000+ traces over 2-3 days

2. **Phase 16 Runtime Patching** ← **START IN PARALLEL**
   - All artifacts present
   - Bind manifest + verify gates
   - Target: 1-2 days, independent work

3. **Qdrant Concept Enrichment** ← **START IN PARALLEL**
   - Tag codebase_chunks_768 with concept metadata
   - No dependencies
   - Target: 1 day

### READY (pending Phase 3F)

1. **Phase 3G Neo4j GDS Projection**
   - Code complete, awaiting Phase 3F gate
   - Gate: >1,000 traces (currently ~110, growing daily)
   - Automatic activation when gate passes

2. **Neo4j USED_CONCEPT Graph Sync**
   - Scaffolding ready
   - Depends on Phase 3F traces
   - Ready after traces hit 1,000+

### DEFERRED (safe, no impact)

1. **Phase 17G GPU JSON Tensor Mapping**
   - Spec complete: `docs/architecture/phase-17g-gpu-json-tensor-mapping.md`
   - MCP tool contract fully defined
   - Activation gates: Phase 3F > 1,000 traces + QLoRA > 100 examples
   - **Why safe**: No runtime dependency on active lanes

2. **Phase 17 Feature Extraction**
   - Ready to run (offline)
   - Independent of Phase 3F
   - Run when optimization work scheduled

3. **Phase 18 XGBoost Reranker**
   - Ready after Phase 17 (offline dependency)
   - Independent of Phase 3F

---

## Decision: Which agent workloads are safe to activate?

### Safe to activate NOW:

✅ **Gemma4-Agent** (Phase 11, fully wired)
- 4 in-process tools (no external gRPC/HTTP calls that can fail)
- Fire-and-forget trace recording
- Rate limited (20 req/user/min)
- MCP tool boundary: read-only (no DB mutations)
- **Status**: ACTIVATE NOW

✅ **Error-Agent** (Phase 11, fully wired)
- Structural repair + classification via HMM
- Fire-and-forget trace recording
- No external calls beyond local DB
- **Status**: ACTIVATE NOW

✅ **Neo4j Sync** (Phase 3G scaffolding)
- Can start scaffolding independent of Phase 3F
- Full activation waits for 1,000+ traces
- **Status**: SCAFFOLD NOW, FULL SYNC AFTER Phase 3F gate

✅ **Qdrant Enrichment** (Phase 11 extension)
- Tag codebase_chunks_768 with retrieval metadata
- No external dependencies
- Feeds selected_concepts to Phase 3F agents
- **Status**: RUN NOW

### NOT safe to activate (external dependencies):

❌ **RAG Search Agent** (if it exists as separate agent)
- Depends on Qdrant health
- Could introduce query latency variability
- **Status**: Monitor, don't activate separately (Gemma4-Agent already includes rag_search tool)

❌ **LLM Inference Agent** (if unbounded)
- Depends on Ollama availability
- Could block query responses
- **Status**: Fire-and-forget only (Phase 11 pattern established)

---

## Implementation Plan (June 11 → June 15)

### Day 1 (June 11 evening / June 12)

```
1. ✅ Temporal Kanban consolidation COMPLETE (this doc)
2. ▶ Start Phase 3F trace accumulation
   - Confirm Gemma4-Agent active
   - Confirm Error-Agent active
   - Monitor agent_traces table growth
3. ▶ Start Phase 16 patching (parallel)
   - Bind graph-refresh-manifest.json
   - Run refresh-promotion-states.mjs
4. ▶ Start Qdrant concept enrichment (parallel)
   - Tag codebase_chunks_768
```

### Days 2-3 (June 13-14)

```
- Phase 3F trace accumulation continues (target: 500+ traces)
- Phase 16 patching verification
- Qdrant enrichment completion
- Monitor Phase 3E.1 report: fusion_dominance trend
```

### Day 4-5 (June 15)

```
- Phase 3F gate check: >1,000 traces? fusion ≥60%? reward ≥0.5?
  - YES → Phase 3G gates OPEN, activate Neo4j GDS
  - NO → continue accumulation, check Phase 3E.1 report for gaps
```

---

## Validation Checklist

Before activating Phase 3F, verify:

- [ ] Gemma4-Agent running on every user query (check logs)
- [ ] Error-Agent running on structural repairs (check logs)
- [ ] recordAgentTrace() fires without blocking (check latency delta)
- [ ] agent_traces table accumulating rows (daily growth check)
- [ ] Phase 3E.1 telemetry > 100 rows (npm run phase3e:generate-report)
- [ ] strategy_distribution shows fusion dominance (check report)
- [ ] Qdrant concept enrichment complete (tag audit)
- [ ] Phase 16 manifest bound + gates verified

---

## Reference Documents

- **Board State**: `docs/reports/board-state-2026-06-11.md`
- **Phase 3E.1**: `memory/phase-3e-1-checkpoint.md`
- **Phase 3F Wiring**: `memory/phase-3f-agent-loop-wiring.md`
- **Phase 17G Spec**: `docs/architecture/phase-17g-gpu-json-tensor-mapping.md`
- **HyperRAG 4-lanes**: `memory/hypergraph-4-lanes-vault.md`
- **Karpathy Blend**: `sveltekit-frontend/memory/architecture/karpathy-rl-som-routing-plan.md`

---

**Conclusion**: The board is clear. Phase 3F is unblocked. Start trace accumulation now. All three parallel lanes (Phase 16, Phase 3F, Qdrant enrichment) can run independently. No further dependencies discovered.
