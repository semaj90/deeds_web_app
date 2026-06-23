# Agentic Loop: Frozen Architecture (Session 71)

**Status**: ✅ ARCHITECTURE LOCKED — Ready for stabilization before model training

---

## The Five-Step Loop (No Deviations)

```
┌─────────────────────────────────────────────────────────────┐
│                      USER TASK                               │
│  "Agent memory registry is missing—add it to backfill"       │
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│ STEP 1: GEMMA4 (Planner — Decides)                         │
├─────────────────────────────────────────────────────────────┤
│ Input:  User task description                               │
│ Action:                                                     │
│   1. Parse feature_id from task                             │
│   2. Classify: schema fix? retrieval issue? agentic loop?   │
│   3. Decompose: what sub-tasks?                             │
│   4. Recommend: next tool (TurboVec search? OpenCode patch?)│
│                                                              │
│ Output: {                                                    │
│   "feature_id": "agent_memory_packets",                     │
│   "classification": "schema_fix",                           │
│   "sub_tasks": ["add agent_memory_registry", ...],          │
│   "confidence": 0.94,                                       │
│   "next_step": "TurboVec search for similar migrations",    │
│   "trace_id": "trace_abc123"                                │
│ }                                                            │
│                                                              │
│ Rule: NEVER edit code. ONLY decide.                         │
│       Decision + reasoning stored as trace.                 │
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│ STEP 2: TURBOVEC (Associative Memory — Recalls)            │
├─────────────────────────────────────────────────────────────┤
│ Input:  feature_id = "agent_memory_packets"                 │
│         classification = "schema_fix"                        │
│ Action:                                                     │
│   1. Search Qdrant: similar schema migrations                │
│   2. Search Postgres: related traces (prior fixes)           │
│   3. Search repo: similar upsert patterns                    │
│   4. Rank by confidence + relevance                          │
│                                                              │
│ Output: [                                                    │
│   {                                                          │
│     "confidence": 0.94,                                      │
│     "type": "schema_migration",                              │
│     "file": "drizzle/manual/0053_agent_memory_registry.sql" │
│     "reason": "exact match—many:many packets table"         │
│   },                                                         │
│   {                                                          │
│     "confidence": 0.88,                                      │
│     "type": "similar_upsert",                                │
│     "file": "scripts/atlas/wire-qdrant.mjs",                │
│     "line_range": "120–170",                                 │
│     "reason": "batch upsert to Qdrant with same payload"    │
│   },                                                         │
│   {                                                          │
│     "confidence": 0.84,                                      │
│     "type": "test_pattern",                                  │
│     "file": "tests/agent-memory-schema-matching.spec.ts",   │
│     "reason": "temporal payload density validation"         │
│   }                                                          │
│ ]                                                            │
│                                                              │
│ Rule: NEVER decide. ONLY recall similar solutions.          │
│       Rank by semantic similarity + prior success.          │
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│ STEP 3: OPENCODE (Surgeon — Patches)                       │
├─────────────────────────────────────────────────────────────┤
│ Input:  Top candidates from TurboVec (Top-1: 0.94)          │
│         Feature to implement: agent_memory_packets           │
│ Action:                                                     │
│   1. Read Top-1 file (migration 0053) → 50 lines max        │
│   2. Read current backfill script → 50 lines around error   │
│   3. Extract pattern (many:many, no FK to task_id)          │
│   4. Apply patch to target file (exact 3-line block)        │
│   5. Run test (npm run test -- agent-memory-schema-matching)│
│                                                              │
│ Patches applied:                                             │
│   File: scripts/atlas/Start-P3gBackfill.ps1:120             │
│   - Line 123: INSERT INTO agent_memory_registry (add row)   │
│   + Line 124: INSERT INTO agent_memory_packets (batch rows) │
│   (no schema invention, pure copy of proven pattern)        │
│                                                              │
│ Output: {                                                    │
│   "files_read": ["drizzle/manual/0053_...sql", "..."],      │
│   "files_modified": ["scripts/atlas/Start-P3gBackfill.ps1"],│
│   "lines_changed": 3,                                       │
│   "test_output": "8/8 pass",                                │
│   "confidence": 0.96,                                       │
│   "patch_trace": "trace_abc123_patch_001"                   │
│ }                                                            │
│                                                              │
│ Rule: NEVER invent. ONLY patch using proven patterns.       │
│       Read max 50 lines at a time. Exact blocks only.       │
│       Test immediately after patch.                         │
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│ STEP 4: REPLAY (Validation — Did it work?)                 │
├─────────────────────────────────────────────────────────────┤
│ Input:  Patch applied + test results                        │
│ Action:                                                     │
│   1. Run unit tests (8/8 pass → ✅)                         │
│   2. Run integration test (fetch from agent_memory_packets) │
│   3. Run replay trace (re-execute prior tasks with fix)     │
│   4. Measure: latency, quality, proof_quality_delta         │
│   5. Compare: before/after baseline                         │
│                                                              │
│ Output: {                                                    │
│   "tests_run": 8,                                           │
│   "tests_passed": 8,                                        │
│   "quality_baseline_before": 0.94,                          │
│   "quality_baseline_after": 0.94,                           │
│   "quality_delta": 0.0,                                     │
│   "latency_before_ms": 2500,                                │
│   "latency_after_ms": 25,                                   │
│   "verdict": "PASS—quality preserved, 100× speedup",        │
│   "proof_hash": "sha256:xyz",                               │
│   "replay_traces_verified": 42                              │
│ }                                                            │
│                                                              │
│ Rule: NEVER approximate. Proof quality >= baseline.         │
│       If quality degraded: FAIL, revert patch, try again.   │
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│ STEP 5: POSTGRES (Truth — Records Everything)              │
├─────────────────────────────────────────────────────────────┤
│ Input:  Task lifecycle (all prior steps)                    │
│ Action:                                                     │
│   1. Create task record in agent_tasks:                     │
│      ├─ task_id: feature:agent_memory_packets              │
│      ├─ trace_id: trace_abc123                              │
│      ├─ feature_id: agent_memory_packets                    │
│      ├─ status: PASS                                        │
│      ├─ progress: 100%                                      │
│      ├─ confidence: 0.96                                    │
│      │                                                      │
│      ├─ timeline:                                           │
│      │  ├─ 0% — task created                               │
│      │  ├─ 10% — TurboVec found similar (Top-1: 0.94)      │
│      │  ├─ 25% — OpenCode read files                       │
│      │  ├─ 40% — patch drafted                              │
│      │  ├─ 55% — patch applied                              │
│      │  ├─ 70% — tests run                                  │
│      │  ├─ 80% — targeted tests pass                        │
│      │  ├─ 90% — replay passes                              │
│      │  └─ 100% — trace recorded                            │
│      │                                                      │
│      ├─ artifacts:                                          │
│      │  ├─ files_read: [migration.sql, backfill.ps1]       │
│      │  ├─ files_modified: [Start-P3gBackfill.ps1]         │
│      │  ├─ tests_run: [agent-memory-schema-matching]       │
│      │  └─ reports: [p3g-backfill.json]                    │
│      │                                                      │
│      └─ metadata:                                           │
│         ├─ trace_id: trace_abc123                           │
│         ├─ agent: claude                                    │
│         ├─ proof_hash: sha256:xyz                           │
│         ├─ turbo_vec_top_candidate: 0.94                    │
│         └─ recommended_next: "Execute P3g backfill"         │
│                                                              │
│   2. Create trace record in mcp_trace_ownership:            │
│      ├─ trace_id: trace_abc123                              │
│      ├─ task_id: feature:agent_memory_packets              │
│      ├─ agent: claude                                       │
│      ├─ packet_keys: [schema-fix, agent-memory-packets]    │
│      ├─ proof_hash: sha256:xyz                              │
│      └─ status: CLOSED                                      │
│                                                              │
│ Output: {                                                    │
│   "task_id": "feature:agent_memory_packets",                │
│   "trace_id": "trace_abc123",                               │
│   "status": "PASS",                                         │
│   "created_at": "2026-06-23T18:30:00Z",                     │
│   "closed_at": "2026-06-23T18:35:00Z"                       │
│ }                                                            │
│                                                              │
│ Rule: NEVER guess. ALL decisions + patches + metrics        │
│       must be recorded. Replay uses this trace.             │
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│ LOOP: Back to STEP 2 (TurboVec Indexes Repair)             │
├─────────────────────────────────────────────────────────────┤
│ Action:                                                     │
│   1. Embed the patch as a new feature in Qdrant              │
│   2. Tag with: feature_id, trace_id, confidence, timestamp  │
│   3. Store in Qdrant codebase_chunks_768                    │
│                                                              │
│ Future discovery:                                           │
│   Similar error found → TurboVec queries Qdrant             │
│   → Top-1 candidate: this patch (0.96 confidence)           │
│   → Gemma4 recommends it                                    │
│   → OpenCode applies it                                     │
│                                                              │
│ Result: Second task uses first task's solution              │
│         (repo becomes self-teaching memory system)          │
└─────────────────────────────────────────────────────────────┘
```

---

## Boundaries (Hard Rules)

### Gemma4 MUST:
- ✅ Classify features
- ✅ Decide next step
- ✅ Recommend tools
- ✅ Estimate confidence
- ✅ Record reasoning as trace

### Gemma4 MUST NOT:
- ❌ Edit code (only OpenCode edits)
- ❌ Query database directly (ask Postgres via OpenCode)
- ❌ Invent schema (only reference existing)
- ❌ Skip TurboVec for pattern discovery

### TurboVec MUST:
- ✅ Search Qdrant for similar features
- ✅ Search Postgres for similar traces
- ✅ Search repo for similar patterns
- ✅ Rank by confidence + relevance
- ✅ Return Top-N candidates with scores

### TurboVec MUST NOT:
- ❌ Decide which candidate to use (Gemma4 decides)
- ❌ Read file contents (OpenCode reads)
- ❌ Apply patches (OpenCode applies)
- ❌ Run tests (OpenCode runs tests)

### OpenCode MUST:
- ✅ Read files (max 50 lines at a time)
- ✅ Read surrounding context (max 100 lines)
- ✅ Apply exact patches to existing code
- ✅ Run targeted tests
- ✅ Trace every file read/modified

### OpenCode MUST NOT:
- ❌ Invent schema (must read CREATE TABLE first)
- ❌ Create new functions (only patch existing)
- ❌ Read entire repo (context tiny always)
- ❌ Decide which patch to apply (Gemma4 decides)
- ❌ Modify files without tests immediately after

### Postgres MUST:
- ✅ Store task lifecycle (0–100% progress)
- ✅ Store traces (Gemma4 decisions + reasoning)
- ✅ Store artifacts (files read, files modified)
- ✅ Store metrics (latency, quality, confidence)
- ✅ Serve as replay source (re-execute prior task)

### Postgres MUST NOT:
- ❌ Guess at data (only store measured values)
- ❌ Clean up traces (retain full audit trail)
- ❌ Join across incomplete tasks (enforce completed tasks only)

### trace-MCP MUST:
- ✅ Record every tool call (atlas.search, atlas.packet.get, etc.)
- ✅ Store arguments + results
- ✅ Store latency + confidence
- ✅ Enable replay (re-run tool call with same args)
- ✅ Emit proof_hash for verification

### trace-MCP MUST NOT:
- ❌ Filter or summarize traces (raw storage only)
- ❌ Decide to use cached results (Gemma4 decides)

---

## The Growing Memory System

**After 10 tasks (hypothetical)**:

```
Postgres task table:
├─ Task 1: agent_memory_registry (PASS, 0.94 confidence)
├─ Task 2: qdrant_upsert_fix (PASS, 0.96 confidence)
├─ Task 3: retrieval_quality_gate (PASS, 0.91 confidence)
├─ Task 4: replay_validation (PASS, 0.93 confidence)
├─ Task 5: couchdb_archival (PASS, 0.89 confidence)
├─ Task 6: gpu_latency_measurement (PASS, 0.95 confidence)
├─ Task 7: manifold_4d_prefilter (PASS, 0.92 confidence)
├─ Task 8: proof_quality_delta (PASS, 0.90 confidence)
├─ Task 9: agentic_claims_ledger (PASS, 0.94 confidence)
└─ Task 10: trace_mcp_provenance (PASS, 0.93 confidence)

Qdrant repo embeddings:
├─ 2,488 original code chunks
├─ + 10 new repair patches (indexed with trace_id + confidence)
└─ Next time similar error appears: patches are Top-N candidates

TurboVec recommendations:
├─ Task 11: similar agent_memory issue → Top-1: Task 1 repair (0.94)
├─ Task 12: similar qdrant upsert → Top-1: Task 2 repair (0.96)
└─ ...escalating accuracy as repair library grows

Result:
├─ Tasks 11+ execute in O(1) — direct match, high confidence
├─ Gemma4 learning curve: steep in sessions 1–5, flat by session 10
├─ OpenCode context: constant 50-line windows (never grows)
├─ Postgres: permanent audit trail (never changes)
```

---

## When to Break the Loop (Upgrade)

You only deviate from this loop when:

1. **New capability required** (e.g., multi-language support)
   - ✅ Design the new capability as a new step
   - ✅ Add it to the loop with clear boundaries
   - ✅ Don't remove or weaken existing steps

2. **Model changes needed** (e.g., QLoRA fine-tuning)
   - ✅ **After** 10+ tasks completed with this loop (builds enough data)
   - ✅ Fine-tune on Postgres task traces (decision + patch correctness)
   - ✅ Re-run all 10 tasks through replay lane to verify parity

3. **Performance optimization** (e.g., batch TurboVec searches)
   - ✅ **After** proving step correctness (no logic changes)
   - ✅ Optimization must preserve proof quality >= baseline
   - ✅ Add to Step 4: replay lane

---

## Implementation Checklist

Before running the agentic loop at scale:

- [ ] Postgres task table schema exists (created by migration 0053)
- [ ] mcp_trace_ownership table exists (migration 0053)
- [ ] Qdrant ready for new patch embeddings
- [ ] Redis cache for TurboVec search results
- [ ] Neo4j edges for Go-Retrieval multi-hop
- [ ] trace-MCP tools: atlas.search, atlas.packet.get, atlas.replay.verify
- [ ] Test: Gemma4 classify feature (0.90+ confidence)
- [ ] Test: TurboVec rank Top-3 (0.80+ confidence each)
- [ ] Test: OpenCode read + patch 50-line blocks
- [ ] Test: Replay verify quality_baseline >= baseline
- [ ] Test: Postgres record task lifecycle (0–100% progress)
- [ ] Test: Trace-MCP replay prior task from trace_id

---

## Summary: The Frozen Loop

| Step | Component | Role | Rule |
|------|-----------|------|------|
| 1 | Gemma4 | Planner | Decide, never edit |
| 2 | TurboVec | Memory | Recall, never decide |
| 3 | OpenCode | Surgeon | Patch exactly, never invent |
| 4 | Replay | Validator | Verify quality >= baseline |
| 5 | Postgres | Truth | Record everything |

**This architecture stabilizes. Train models after it's proven.**
