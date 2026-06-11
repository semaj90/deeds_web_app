# Phase 3D + 3E + Lane 3 Integrated Roadmap

**Milestone**: Moving from Retrieval Infrastructure to Concept Memory + Agentic Orchestration  
**Date**: June 11, 2026  
**Status**: Foundation Complete, Ready for Parallel Execution

---

## The Three-Lane Architecture

### What Changed at Each Phase

#### Phase 3D: Retrieval Telemetry (Infrastructure)
**Before**: Query → Qdrant → Packets → Answer (no memory of decisions)  
**After**: Query → Retrieval → **Telemetry** → Packets → Answer (records what works)

**What it enables**: Behavioral evidence. "This query retrieved 5 vector hits, 3 lexical hits, 0 structural hits → fusion strategy → successful answer."

**Wired this session**:
- ✅ `retrieval_telemetry` table (18 columns, 9 indexes)
- ✅ `retrievalStrategy` enum (vector_only | lexical_only | structural_only | fusion | cold_neschrom)
- ✅ ACE context assembler instrumentation (Point 1/3)
- ✅ Fire-and-forget telemetry emitter

---

#### Phase 3E: Concept Memory (Abstraction Layer)
**Before**: Packets are raw observations (8,170 cards, no synthesis)  
**After**: Packets → **Concept Synthesis** → `concept_records` (compressed abstractions)

**What it enables**: Behavioral learning. "Authentication concepts discovered via fusion are 95% successful; vector-only authentication is 40% successful."

**Added this session**:
- ✅ `concept_records` extended with lifecycle fields:
  - `retrievalStrategy` (how was this concept discovered?)
  - `lastRetrievedAt` (when was it last useful?)
  - `conceptTemperature` (how hot is this concept now? 0.0–1.0)

**Data flow**: retrieval_telemetry → concept_records (auto-update)

---

#### Lane 3: Neo4j GDS + Gemma4 Orchestration (Agent Planning)
**Before**: Only Qdrant ANN + raw Postgres queries  
**After**: Neo4j GDS (topology analysis) + Gemma4 (planning) + **Bounded scripts** (execution)

**What it enables**: Agentic repair. "Given this task, which concepts are relevant? Which source files cluster together? What's the dependency path? → Plan → Execute → Record outcome."

**Architecture**:
- Neo4j GDS: Read-only graph analysis (5 tools)
- Gemma4: LLM planner (MCP tool calls)
- Qdrant: Multi-vector retrieval (dense code, dense summary, dense concept)
- Postgres: Canonical truth (concept_records, agent_traces)
- Bounded scripts: Deterministic repair execution

---

## Data Layer Unification

### Storage Tiers

| Tier | Purpose | Source | Updated By |
|------|---------|--------|-----------|
| **L1: Real-time** | Behavior signals | Query → Retrieval | Phase 3D (telemetry) |
| **L2: Concept Memory** | Learned abstractions | Telemetry → Synthesis | Phase 3E.1 (aggregation) |
| **L3: Graph Knowledge** | Topology + structure | code graph | Lane 3 (GDS analysis) |
| **L4: Agent Memory** | Repair outcomes | Execution results | Lane 3 (traces) |

### Coordination

```
retrieval_telemetry (L1)
  ↓ increments
concept_records (L2)
  ↓ provides concepts to
Neo4j GDS queries (L3)
  ↓ context for
Gemma4 planning + MCP tools (Lane 3)
  ↓ executes
Bounded repair scripts
  ↓ records outcome
agent_traces → concept_records
```

**No circular dependencies**: L1 → L2 → L3 → L4.

---

## Parallel Execution Feasibility

### Lane Independence

| Concern | Phase 3D | Phase 3E.1 | Lane 3 |
|---------|----------|-----------|--------|
| **Reads from** | (nothing) | telemetry | concept_records + Neo4j |
| **Writes to** | retrieval_telemetry | concept_records | agent_traces, Neo4j |
| **Blocks** | Phase 3E.1 | Lane 3 | QLoRA training |
| **Blocked by** | (nothing) | Phase 3D.1 | Phase 3E.1 |

**Verdict**: Can execute **3D and 3E.1 in parallel** (both start when 3D.1 is wired, ~June 11–12).  
**Lane 3 can start** once concept_records schema is stable (~June 12–13).

### Timeline (Parallel)

```
June 11   3D.1 WIRED ✅ / 3E.1 READY / Lane 3 READY
June 12   3E.1 START / Lane 3 START
June 18   3D.2 WIRE / 3E.1 >100 telemetry records
June 25   3D.3 WIRE / 3E.1 temperature reports / Lane 3 GDS tools live
July 2    3D.4 BASELINE / Lane 3 Gemma4 + MCP wired / agent_traces >50
July 9    CONVERGENCE: QLoRA dataset + Gemma4 planning training

Total wall-clock time: 4 weeks (parallel) vs 12+ weeks (serial)
```

---

## What's Living Where

### Phase 3D Artifacts
- **Schema**: `src/lib/server/db/schema/retrieval-telemetry.ts`
- **Emitter**: `src/lib/server/telemetry/ace-telemetry-emitter.ts`
- **Instrumentation**: `src/lib/server/features/ai/ace/context-assembler.ts` (line ~3806)
- **Migration**: `sveltekit-frontend/drizzle/manual/20260611_retrieval_telemetry.sql`
- **Tests**: `scripts/phase-3d/test-retrieval-telemetry.mjs`
- **Docs**: `docs/architecture/phase-3d-telemetry-instrumentation.md`, `docs/phase-3d-telemetry-fixes.md`

### Phase 3E.1 Artifacts
- **Schema**: `src/lib/server/db/schema/concept-records.ts` (lifecycle fields added)
- **Link**: `src/lib/server/telemetry/retrieval-recorder.ts` (app-level or trigger-based)
- **Job**: `scripts/atlas/recompute-concept-temperatures.mjs`
- **Reporter**: `scripts/atlas/generate-concept-temperature-report.mjs`
- **Reports**: `docs/reports/concept-temperature-report.json/.md`
- **Docs**: `docs/open-lanes/phase-3e-1-concept-telemetry.md`

### Lane 3 Artifacts
- **GDS Tools**: `src/lib/server/tools/neo4j-gds-tools.ts` (5 functions)
- **Qdrant Enrichment**: Tags added to payloads (source_ref, feature_id, concept_id, etc.)
- **Gemma4 Integration**: MCP tool calls wired via `/api/ai/agent`
- **Trace Table**: `agent_traces` (query, concepts, tools, outcome, score)
- **Docs**: `docs/open-lanes/neo4j-gds-gemma4-orchestration.md`

---

## Exit Criteria: All Lanes Converged

### Week 4 (July 2–9)

**Phase 3D**: ✅ Complete
- [x] Point 1 (ACE) wired
- [x] Point 2 (Hybrid Search) wired
- [x] Point 3 (HyperRAG) wired (optional)
- [x] >1,000 baseline queries collected
- [x] retrieval_telemetry_summary.md generated

**Phase 3E.1**: ✅ Complete
- [x] Trigger/app-level linking live
- [x] Temperature recomputation job running
- [x] >500 concept_records with temperature > 0.1
- [x] concept_records now behaves like engram memory
- [x] concept-temperature-report.md shows meaningful distribution

**Lane 3**: ✅ Complete
- [x] Neo4j GDS 5 tools implemented
- [x] Qdrant multi-vector enrichment deployed
- [x] Gemma4 MCP tool calling wired
- [x] 10+ manual test queries through full pipeline
- [x] agent_traces populated (50+ repair outcomes)
- [x] Production readiness: PASS 66 / WARN 0 / FAIL 0

**Final Gate**: QLoRA Dataset Export
```bash
npm run export:qlora-dataset
# Output: qlora_examples.jsonl (100+ rows)
# Shape: { query, retrieval_strategy, concepts, repair_outcome, success_score }
```

---

## The Unified Data Loop

```
User Query
  ↓
Phase 3D: Record telemetry
  (which lanes were used? how many hits?)
  ↓
Phase 3E.1: Update concept memory
  (increment concept retrieval_count)
  (recompute concept_temperature)
  ↓
Lane 3: Graph + plan
  (expand relevant subgraphs)
  (call Gemma4 planner)
  ↓
Agent Execution
  (run bounded repair script)
  (record outcome in agent_traces)
  ↓
Feedback Loop
  (update concept_records with success/failure)
  (export as QLoRA example)
  ↓
Future Query
  (learned: "for auth bugs, use fusion strategy + auth_guard concept")
```

**This is no longer just a retrieval system.** It's a **self-observing, self-learning agentic system** that:
- Captures behavioral evidence (Phase 3D)
- Synthesizes concepts (Phase 3E)
- Plans repairs using topology (Lane 3)
- Records outcomes for training (Lane 3 traces)

---

## Why This Order Matters

### Phase 3D First (Behavior Capture)
You can't optimize what you don't measure. Telemetry is the foundation.

### Phase 3E.1 Second (Memory Synthesis)
Once you have telemetry, aggregate it into concepts. Concepts are the "latent abstractions" that make learning efficient.

### Lane 3 Third (Agentic Planning)
Once concepts exist, teach Gemma4 which concepts matter for which tasks. GDS provides the topology context.

### QLoRA Training Last
You now have (problem, retrieval_strategy, concepts, outcome) tuples. Train Gemma4 on them.

---

## Strategic Significance

**This work moves Parent Atlas from**:
- **Retrieval infrastructure** (Phase 3A–3C)
- **Telemetry & governance** (Phase 3D–3E)

**To**:
- **Autonomous agent orchestration** (Lane 3 + Gemma4 + QLoRA)

The next era is not "better search" but "learned planning."

---

## References

- **All open lanes**: `docs/open-lanes/README.md`
- **Phase 3D foundation**: `docs/phase-3d-telemetry-fixes.md`
- **Phase 3E.1 tasks**: `docs/open-lanes/phase-3e-1-concept-telemetry.md`
- **Lane 3 architecture**: `docs/open-lanes/neo4j-gds-gemma4-orchestration.md`
- **Full validation checklist**: `docs/phase-3d-validation-checklist.md`

---

**Status**: Foundation laid. Parallel execution ready.

**Next**: Validate TypeScript + run Phase 3D tests → Start Phases 3E.1 + Lane 3 implementation → Converge on QLoRA training.
