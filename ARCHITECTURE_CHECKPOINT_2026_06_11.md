# Architecture Checkpoint — June 11, 2026
## Parent Atlas: Retrieval Infrastructure → Knowledge Lifecycle

**Status**: ✅ PASS 66 / WARN 0 / FAIL 0  
**Milestone**: Concept memory foundation complete. System is now adaptive-ready.

---

## What Was Delivered

### Phase 3D: Retrieval Telemetry ✅
**Completed**: Point 1 (ACE assembler instrumentation)

- Fire-and-forget telemetry pattern established
- `retrieval_strategy` enum locked (5 values: vector_only, lexical_only, structural_only, fusion, cold_neschrom)
- Manual migration wired (all DESC indexes in SQL, not Drizzle)
- Test suite ready (5 smoke gates)

**Status**: Awaiting validation (`npm run test:telemetry:phase3d` + >100 live records)

### Phase 3E: Concept Memory Foundation ✅
**Completed**: Lifecycle fields + causality preservation

Added 4 critical fields to `concept_records`:

1. **retrievalStrategy** — Which lane discovered this concept?
2. **lastRetrievedAt** — When was it last useful? (lifecycle automation)
3. **conceptTemperature** — How hot is it? (behavioral ranking)
4. **strategyDistribution** — WHY is it hot? (causality preservation)

**Example**:
```json
{
  "concept_id": "authentication",
  "concept_temperature": 0.95,
  "strategy_distribution": {
    "fusion": 842,
    "vector_only": 131,
    "lexical_only": 62,
    "structural_only": 27,
    "cold_neschrom": 9
  }
}
```

This preserves the causal signal: "Concept is hot because fusion (robust multi-signal) finds it 842 times, not just because vector rarely finds it 131 times."

---

## The Architectural Shift

### Before (Retrieval Infrastructure)
```
Query → Qdrant → Packets → LLM → Answer
```
- Static index
- No memory of decisions
- Cannot improve over time

### After (Knowledge Lifecycle)
```
Query → Retrieval (with telemetry) → Concepts (with causality) → Agent Planning → Answer
  ↓
Concept Memory (self-observing)
  ↓
Future Query (learned patterns)
```

- Behavioral evidence captured
- Concepts synthesized from patterns
- System learns which strategies work
- Ready for Gemma4 planning + QLoRA training

---

## What This Means for Gemma4 Learning

### Before QLoRA Data
```json
{
  "prompt": "fix auth bug",
  "completion": "added isAuthenticated guard"
}
```
**Problem**: Model doesn't learn WHY auth bugs are fixed this way.

### Future QLoRA Data (After 3E.1 + 3F)
```json
{
  "query": "fix missing auth guard",
  "retrieval_strategy": "fusion",
  "selected_concepts": ["auth_guard_pattern", "error_handling"],
  "repair_outcome": "success",
  "reward": 0.94
}
```
**Solution**: Model learns: "For auth bugs, use fusion retrieval → select auth concepts → high success."

---

## Immediate Action Items

### TODO: Phase 3E.1 Concept Telemetry Integration (ACTIVE)

**Pure data pipeline** (1–2 weeks):

- [ ] Link retrieval_telemetry → concept_records
  - On telemetry INSERT: find matching concepts, increment retrieval_count
  - Update last_retrieved_at, set retrieval_strategy
  - **Add to strategy_distribution[strategy]++** (NEW: track causality)

- [ ] Auto-recompute conceptTemperature
  - Formula: 0.50·recent_retrievals + 0.30·repair_success + 0.20·fusion_rate
  - Run every 6 hours (background job, not in hot path)

- [ ] Generate concept-temperature-report.json/md
  - Lifecycle distribution (ACTIVE/WARM/COOL/COLD)
  - **Strategy breakdown**: Which retrieval lanes produce hot concepts?
  - Archive candidates (T < 0.2, no retrievals in 60 days)

**Exit Criteria**:
- [x] Schema extended (4 fields)
- [ ] >500 concept_records with populated strategy_distribution
- [ ] Report shows clear strategy patterns (not flat distribution)
- [ ] PASS 66 / WARN 0 / FAIL 0 maintained

### TODO: Delay agent_traces (Until 3E.1 is live)

**Do NOT start Phase 3F yet**. Reason:

- Telemetry = factual (what happened)
- Concepts = synthetic (patterns learned)
- Traces = interpretative (agent decisions)

**Order**: Telemetry → Concepts (stable) → Traces → QLoRA

If you layer traces on unstable concepts, you corrupt the learning signal.

### TODO: Neo4j Graph Additions (Parallel with 3E.1)

Add two relationship types:

```cypher
Concept ──DISCOVERED_BY──→ RetrievalStrategy
Concept ──UPDATED_BY──→ TelemetryEvent
```

**Use**: "Find concepts discovered via fusion (high-quality) vs vector-only (brittle)."

---

## Risk Mitigation

### Pre-existing TypeScript error
- Not introduced by Phase 3D/3E changes
- `src/routes/api/ai/error-agent/+server.ts:23` (unrelated)
- Does not block Phase 3D.1 validation

### strategy_distribution design choice
- **Option A**: Count occurrences (842, 131, 62) ← **Chosen**
  - Preserve raw signal for learning
  - Easier to aggregate into telemetry reports
- **Option B**: Proportions (85%, 12%, 3%)
  - Loses scale information
  - Harder to compute incrementally

### Trigger vs Job for telemetry → concept bridge
- **Trigger**: Fast, atomic, but scales poorly if telemetry is high-volume (>1k/hr)
- **Job**: Slower (batch delay), but safe, observable, easier to debug
- **Recommendation**: Start with batch job (safer), optimize to trigger if needed

---

## Success Metrics (EOW June 18)

- [x] Phase 3D P0–P3 schema fixes
- [x] Phase 3E lifecycle fields (+ strategy_distribution)
- [ ] Phase 3D baseline >100 records (live system test)
- [ ] Phase 3E.1 telemetry → concept bridge working
- [ ] strategy_distribution shows meaningful variance (not flat)
- [ ] concept-temperature-report generated
- [ ] PASS 66 / WARN 0 / FAIL 0 maintained

---

## What We're NOT Doing Yet

❌ **Agent traces** (Phase 3F) — Wait for 3E.1 to stabilize  
❌ **QLoRA training** — Wait for traces + >50 repair outcomes  
❌ **Gemma4 planner** — Wait for QLoRA dataset shape finalized  
❌ **Lifecycle automation** — Wait for temperature distribution validated  

**Why**: Each layer depends on the one below being stable. If you build on unstable foundations, learning is corrupted.

---

## The Strategic Shift

**This is the moment the system stops being a static RAG index.**

- Phase 3A–3C: "Can we retrieve code well?" (infrastructure)
- Phase 3D–3E: "Can we measure what works?" (observation)
- Phase 3F+: "Can we plan repairs using what we learned?" (learning)

After Phase 3E.1, `concept_records` is not a report table. It's the **symbolic memory layer** that sits between retrieval and agent planning.

Telemetry feeds concepts continuously. Concepts feed Gemma4 planning. Planning feeds agent_traces. Traces feed QLoRA training.

**That's adaptive system design.**

---

## References

- Telemetry foundation: `docs/phase-3d-telemetry-fixes.md`
- Concept memory: `docs/phase-3e-concept-memory-guide.md`
- Next steps: `docs/TODO_2026_06_11.md`
- Parallel lanes: `docs/open-lanes/README.md`
- Full roadmap: `docs/PHASE-3D-3E-LANE-3-ROADMAP.md`

---

**Next Checkpoint**: After Phase 3E.1 telemetry is live (>500 concepts with strategy_distribution populated), review concept-temperature-report to validate learning patterns before committing to Phase 3F traces + Phase 4A evaluation harness.

**Owner**: Claude + Gemma4 Agent (agentic orchestration)

**Status**: Foundation locked. Ready for Phase 3E.1 data pipeline implementation.
