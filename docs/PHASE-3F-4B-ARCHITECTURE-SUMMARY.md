# Phase 3F-4B: Hierarchical Knowledge OS Architecture

**Date**: June 11, 2026
**Status**: Phase 3E.1 COMPLETE | Phase 3F-4B ARCHITECTURE DEFINED

---

## Overview

Parent Atlas is transforming from a **static RAG system** to a **self-learning hierarchical knowledge operating system** with five distinct computational layers:

```
Layer 0: Raw Artifacts (Git, Filesystem, SeaweedFS)
  ↓ Index once
Layer 1: Parent Atlas (concept_records, retrieval_telemetry, agent_traces in Postgres)
  ↓ Packetize
Layer 2: NES Packets (Qdrant + Postgres, semantic units with metadata)
  ↓ Abstract to
Layer 3: Concept Space (temperature, strategy_distribution, community_id)
  ↓ Trace decisions
Layer 4: Agent Traces (query→strategy→concepts→tools→outcome→reward)
  ↓ Distill high-confidence
Layer 5: QLoRA Dataset (instruction-outcome pairs for fine-tuning)
  ↓ Train
Layer 6: Gemma4 Planner (learns which strategy + concepts succeed)
```

---

## Critical New Field: strategy_distribution

**JSONB in concept_records** (Phase 3E.1):

```json
{
  "concept_id": "authentication",
  "strategy_distribution": {
    "fusion": 127,
    "vector_only": 21,
    "lexical_only": 11,
    "structural_only": 3,
    "cold_neschrom": 2
  },
  "concept_temperature": 0.94
}
```

**Why it matters**: Preserves **causality**. The system learns not just "authentication is hot" but "**fusion discovers authentication reliably** (87% of the time)." This teaches future planners to prefer fusion when seeking authentication concepts.

---

## Phase 3F: Agent Trace Distillation (READY TO ACTIVATE)

**Gate**: >100 telemetry records with meaningful strategy_distribution variance

**New Table**: agent_traces
```sql
{
  trace_id: uuid PRIMARY KEY,
  task_id: text,
  query: text,
  retrieval_strategy: enum,
  selected_concepts: jsonb,        -- THE KEY NEW FIELD
  selected_packets: jsonb,
  tools_called: jsonb,
  outcome: 'success' | 'partial' | 'failure',
  reward: 0.0-1.0
}
```

**Reward Function** (tunable):
```
reward = 0.40·tests_passing
       + 0.30·no_regressions
       + 0.20·code_quality
       + 0.10·fix_minimalism
```

**What This Enables**:
- Complete decision path logging (query→strategy→concepts→tools→outcome)
- Learning signal quantification (reward = how good was this decision)
- Planner training dataset generation (QLoRA examples)

**Most Valuable Asset** (after Phase 3F):
The (query, strategy, concepts, outcome, reward) tuple — the exact shape Gemma4 needs to learn "when I see this query, prefer this strategy and these concepts."

---

## Phase 3G: Neo4j Retrieval Graph (READY AFTER 3F)

**New Module**: `src/lib/server/db/neo4j-gds-retrieval.ts`

**Projection**: retrievalAnalysis
- Nodes: Concept, Strategy, AgentTrace
- Edges: DISCOVERED_BY (strategy→concept), USED_CONCEPT (trace→concept), USED_STRATEGY (trace→strategy)

**GDS Algorithms**:
- **PageRank**: Which concepts are most important (by success correlation)
- **Louvain**: Emergent concept communities (cluster similar concepts)
- **Node Similarity**: Find concept cousins
- **Personalized PageRank**: Strategy-scoped authority ("what concepts relate to authentication?")

**Usage in Planning** (Phase 4):
1. Task: "fix missing auth guard"
2. Query Neo4j: "What concepts have high PageRank in community=auth?"
3. Select top-3 by (authority + temperature)
4. Execute repair using unified concept cluster
5. Outcome → agent_traces → training signal

---

## New Scripts

### 1. `scripts/atlas/sync-retrieval-graph.mjs`
Synchronize Postgres retrieval data into Neo4j for GDS planning.

```bash
node scripts/atlas/sync-retrieval-graph.mjs [--dry-run] [--full] [--skip-gds]

# Steps:
#   1. Sync concepts from concept_records
#   2. Sync strategies (5 retrieval strategies)
#   3. Sync agent traces + edges (USED_CONCEPT, USED_STRATEGY)
#   4. Sync retrieval telemetry (DISCOVERED_BY edges)
#   5. Run GDS algorithms (PageRank, Louvain, Node Similarity)
```

---

## Validation Gates

### Phase 3E.1 Checkpoint (CURRENT)
Run when >100 telemetry records exist:
```bash
npm run phase3e:generate-report
```

Check JSON output:
- `summary.total_concepts ≥ 100`
- `summary.strategy_variance.fusion_dominance_pct ≥ 60%`
- `lifecycle_distribution.ACTIVE + WARM ≥ 70%`
- No concept has uniform distribution (all 5 lanes 20%)

**Success**: Move to Phase 3F activation

### Phase 3F Gate (when 3E.1 passes)
- [ ] >50 agent_traces recorded
- [ ] >80% have reward > 0.5
- [ ] >10 QLoRA examples exported
- [ ] reward shows variance (not all 0.0 or 1.0)

### Phase 3G Gate (when 3F passes)
- [ ] Neo4j projection: 100+ nodes, 500+ edges
- [ ] PageRank scores assigned
- [ ] Louvain communities detected
- [ ] USED_CONCEPT edges populated from agent_traces

---

## Data Architecture

| Layer | Storage | Technology | Purpose |
|-------|---------|-----------|---------|
| **L0** | Git + Filesystem | Version control | Immutable source |
| **L1** | Postgres | Drizzle ORM | Canonical metadata |
| **L2** | Qdrant + Postgres | Vector + relational | Semantic retrieval units |
| **L3** | Postgres | JSONB + SQL | Symbolic reasoning |
| **L4** | Postgres | agent_traces | Decision provenance |
| **L5** | JSON | QLoRA dataset | Training data |
| **L6** | GPU VRAM | Gemma4 adapter | Learning |

---

## Closed Feedback Loop

```
Query
  ↓ [Retrieve via L2-3]
Repair Decision
  ↓ [Execute tools]
Outcome (success/failure)
  ↓ [Measure reward]
Agent Trace (L4)
  ↓ [Batch export success cases]
QLoRA Dataset (L5)
  ↓ [Accumulate >10 high-reward examples]
Gemma4 Fine-Tuning
  ↓ [QLoRA adapter improves decision-making]
Next Query
  ↓ [Uses updated planner]
[Better decisions]
```

**This loop closes automatically.** Each successful repair improves future planning.

---

## Next Checkpoint

**When**: >100 telemetry records accumulated from live ACE queries
**Action**: `npm run phase3e:generate-report`
**Decision**: If fusion_dominance ≥ 60%, activate Phase 3F wiring

---

## Files Created This Session

1. **`src/lib/server/db/neo4j-gds-retrieval.ts`** (267 lines)
   - Neo4j GDS projection definition
   - Algorithm wrappers (PageRank, Louvain, Node Similarity, PPR)
   - Utility queries (top concepts by authority, communities)

2. **`scripts/atlas/sync-retrieval-graph.mjs`** (compact)
   - PostgreSQL→Neo4j synchronization
   - Supports `--dry-run`, `--full`, `--skip-gds` flags

3. **`memory/5-layer-hierarchical-knowledge-os.md`** (comprehensive)
   - Full 5-layer architecture explained
   - Data flow, validation gates, why this design

---

## Key Insight

**Before Phase 3E.1**: Retrieval system (static index → static answers)

**After Phase 3E.1**: Learning infrastructure (observe what works → adapt behavior)

**After Phase 3F+**: Adaptive orchestration (Gemma4 learns planning, routing, scheduling)

**The most valuable asset is no longer the packet or embedding. It's the (query, strategy, concepts, outcome, reward) tuple — the training data that teaches the system to make better decisions.**
