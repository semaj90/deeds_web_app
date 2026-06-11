# Phase 3F: Agent Trace Distillation

**Status**: READY — Awaiting Phase 3E.1 stabilization (>100 telemetry records)

**Objective**: Capture the complete decision path from query → strategy → concepts → outcome, creating the canonical dataset for Gemma4 planner training.

---

## The Four Feedback Loops Phase 3F Completes

### Loop 1: Retrieval Loop (✅ Phase 3E.1)
```
Query → retrieval_strategy → selected packets → selected concepts
Stored in: retrieval_telemetry + concept_records
Answers: What information was useful?
```

### Loop 2: Repair Loop (🔨 Phase 3F)
```
Query → repair attempt → success/failure
Stored in: agent_traces.outcome + agent_traces.reward
Answers: Which concepts actually solved problems?
```

### Loop 3: Behavioral Temperature Loop (✅ Phase 3E.1)
```
retrieval_count + last_retrieved_at + repair_success + strategy_distribution
Produces: concept_temperature
Answers: What is important right now?
```

### Loop 4: Distillation Loop (🔨 Phase 3F)
```
Query → retrieval path → concept selection → repair outcome
Exports: qlora_examples.jsonl
Answers: How should Gemma4 behave next time?
```

---

## Schema: agent_traces Table

```sql
CREATE TABLE agent_traces (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Canonical trace identifiers
  task_id text,
  query text NOT NULL,
  
  -- Retrieval telemetry link
  retrieval_telemetry_id bigint REFERENCES retrieval_telemetry(id),
  retrieval_strategy text CHECK (retrieval_strategy IN ('vector_only', 'lexical_only', 'structural_only', 'fusion', 'cold_neschrom')),
  
  -- Concept memory link
  selected_concept_ids jsonb DEFAULT '[]'::jsonb NOT NULL,  -- array of concept_id strings
  selected_packet_keys jsonb DEFAULT '[]'::jsonb NOT NULL,  -- array of packet keys
  
  -- Tool execution
  tools_called jsonb DEFAULT '[]'::jsonb NOT NULL,  -- array of MCP tool names
  tool_calls_count integer DEFAULT 0,
  tool_calls_detail jsonb DEFAULT '[]'::jsonb,  -- array of {tool, args, result}
  
  -- Outcome & Reward
  outcome text CHECK (outcome IN ('success', 'partial', 'failure')),
  repair_diff_stats jsonb,  -- {files_touched, lines_added, lines_deleted, tests_passing, tests_failing}
  reward double precision,  -- 0.0-1.0 normalized score
  
  -- Timestamps
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL
);

-- Indexes for common queries
CREATE INDEX idx_agent_traces_outcome ON agent_traces(outcome);
CREATE INDEX idx_agent_traces_retrieval_strategy ON agent_traces(retrieval_strategy);
CREATE INDEX idx_agent_traces_created ON agent_traces(created_at DESC);
CREATE INDEX idx_agent_traces_concepts_gin ON agent_traces USING GIN(selected_concept_ids);
CREATE INDEX idx_agent_traces_reward ON agent_traces(reward DESC);
```

---

## Schema: qlora_examples Table

```sql
CREATE TABLE qlora_examples (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Source trace
  agent_trace_id uuid NOT NULL REFERENCES agent_traces(id),
  
  -- Training data
  query text NOT NULL,
  retrieval_strategy text NOT NULL,
  selected_concepts jsonb NOT NULL,  -- array of concept_ids
  selected_packets jsonb NOT NULL,   -- array of packet_keys
  repair_outcome text NOT NULL,      -- success/partial/failure
  reward double precision NOT NULL,  -- 0.0-1.0
  
  -- Export state
  exported_at timestamp with time zone,
  exported_version text,
  
  created_at timestamp with time zone DEFAULT now() NOT NULL
);

-- Index for export pipeline
CREATE INDEX idx_qlora_examples_exported ON qlora_examples(exported_at DESC);
CREATE INDEX idx_qlora_examples_outcome ON qlora_examples(repair_outcome);
CREATE INDEX idx_qlora_examples_reward ON qlora_examples(reward DESC);
```

---

## Tasks

### Task 1: Wire agent_traces Recording

**Location**: `src/lib/server/ai/agent-executor.ts` (or equivalent agent runner)

**On successful repair**:
```typescript
await recordAgentTrace({
  taskId: caseId,
  query: userQuery,
  retrievalStrategy: context.retrievalStrategy,  // from Phase 3E.1
  selectedConceptIds: selectedConcepts.map(c => c.concept_id),
  selectedPacketKeys: selectedPackets.map(p => p.key),
  toolsCalled: ['drizzle', 'rg', 'typescript'],
  outcome: 'success',
  repairDiffStats: {
    filesTouched: 1,
    linesAdded: 5,
    linesDeleted: 0,
    testsPassing: 5,
    testsFailing: 0,
  },
  reward: computeReward(testResults, codeQuality),
});
```

**Fire-and-forget pattern** (non-blocking, same as telemetry).

### Task 2: Compute Reward Function

**Formula** (tunable):
```
reward = 0.40 · tests_passing + 0.30 · no_regressions + 0.20 · code_quality + 0.10 · fix_minimal
```

Where:
- **tests_passing**: count / total tests (0-1)
- **no_regressions**: 1.0 if new failures == 0, else 0.0
- **code_quality**: linter score, type safety, complexity metrics
- **fix_minimal**: penalty if lines_added >> minimum needed

**Example outcomes**:
- All tests pass, no regressions, clean code → reward = 0.95
- Tests pass but 1 regression → reward = 0.65
- Partial success (some tests fail) → reward = 0.40
- Complete failure → reward = 0.0

### Task 3: Export QLoRA Dataset

**Location**: `scripts/atlas/export-qlora-dataset.mjs`

**On demand**: `npm run qlora:export`

**Output**: `qlora_examples.jsonl`

```jsonl
{"query": "fix missing auth guard", "retrieval_strategy": "fusion", "selected_concepts": ["authentication", "route_protection"], "selected_packets": ["packet_auth_pattern", "packet_sveltekit_guard"], "repair_outcome": "success", "reward": 0.93}
{"query": "optimize database query", "retrieval_strategy": "vector_only", "selected_concepts": ["database_orm", "query_performance"], "selected_packets": ["packet_drizzle_docs", "packet_perf_tips"], "repair_outcome": "partial", "reward": 0.52}
```

**Filter criteria**:
- Only successful/partial repairs (outcome != 'failure')
- Only traces with reward > 0.5 (high-confidence examples)
- Only traces with >1 concept selected (rich context)

**This becomes the canonical Gemma4 planner training dataset.**

---

## Exit Criteria

- [ ] agent_traces table created and indexed
- [ ] qlora_examples table created and indexed
- [ ] Trace recording wired to at least one agent (fire-and-forget)
- [ ] Reward function implemented and tuned
- [ ] >50 agent_traces with outcome recorded
- [ ] QLoRA export generates >10 training examples
- [ ] PASS 66 / WARN 0 / FAIL 0 maintained

---

## Integration with Phase 3E.1

**Data flow**:
```
retrieval_telemetry (Phase 3D)
  ↓ updates
concept_records (Phase 3E.1)
  ↓ selected by agent for repair
agent_traces (Phase 3F) ← NEW
  ↓ successful traces export to
qlora_examples (Phase 3F) ← NEW
  ↓ feeds
Gemma4 Planner Training
```

**Key invariant**: agent_traces references both:
- `retrieval_telemetry_id` (what information was retrieved)
- `selected_concept_ids` (which abstractions were used)

This allows future analysis: "Which concepts co-occur in successful repairs?"

---

## What We're NOT Doing Yet

❌ **Neo4j DISCOVERED_BY / UPDATED_BY edges** (Phase 3G)
- Wait for agent_traces to be stable first
- Then wire Task USED_CONCEPT and USED_STRATEGY edges

❌ **Gemma4 QLoRA fine-tuning** (Phase 4A)
- Wait for >100 high-quality examples
- Requires training infrastructure (Unsloth, Colab, etc.)

❌ **Autonomous repair evaluation** (Phase 4B)
- Wait for QLoRA adapter to be trained and deployed

---

## Success Metrics (Target: End of Sprint)

- [ ] >50 agent_traces recorded
- [ ] >80% of traces have reward > 0.5
- [ ] QLoRA dataset has >20 exportable examples
- [ ] Reward distribution is meaningful (not all 0.0 or 1.0)
- [ ] Agent traces correlate with concept temperature (successful traces use high-temp concepts)

---

## References

- Phase 3E.1 Concept Memory: `docs/open-lanes/phase-3e-1-concept-telemetry.md`
- Phase 3D Telemetry: `docs/phase-3d-telemetry-fixes.md`
- Neo4j Planning (Phase 3G): `docs/open-lanes/neo4j-gds-gemma4-orchestration.md`

---

**Status**: Ready to activate once Phase 3E.1 stabilizes with >100 telemetry records.

**Next Checkpoint**: After >50 agent_traces are recorded, analyze reward distribution and concept selection patterns before proceeding to Phase 3G (Neo4j graph expansion).
