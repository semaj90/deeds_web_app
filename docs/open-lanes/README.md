# Open Lanes — Parallel Execution Roadmap

**Updated**: June 11, 2026  
**Scope**: Parent Atlas Phase 3D/3E + Neo4j GDS + Gemma4 Orchestration  
**Coordination**: No blocking dependencies; run in parallel

Current working order:
BM25 + concept activation -> spectra-g / Engram optional adapter ->
XGBoost formal reranker -> Neo4j contextual trees + HyperRAG packet RPC ->
Autoencoder / SOM latent topology -> native GEMM deferred.

Split contracts:
- `docs/atlas/xgboost-reranker-contract.md`
- `docs/atlas/native-gemm-deferral.md`

---

## Current Active Lanes

### Lane 1: Phase 3D — Retrieval Telemetry Foundation ✅ WIRED
- **Status**: Point 1 (ACE Assembler) complete; Points 2–3 pending
- **Owner**: Claude
- **Timeline**: 2 weeks (Point 1 complete, baseline collection 2 weeks)
- **Document**: `docs/architecture/phase-3d-telemetry-instrumentation.md`
- **Fixes**: `docs/phase-3d-telemetry-fixes.md`

**Checkpoint**: ACE context assembler now emits fire-and-forget telemetry. Manual migration ready. Awaiting npm run check:fast verification.

### Lane 2: Phase 3E.1 — Concept Telemetry Integration ⏳ READY TO START
- **Status**: Schema extended; triggers/app logic pending
- **Owner**: Claude + Gemma4 Agent
- **Timeline**: 1 week (parallel with Phase 3D.2–3D.4)
- **Document**: `docs/open-lanes/phase-3e-1-concept-telemetry.md`
- **Start Gate**: Phase 3D baseline >100 records

**Next Task**: Link retrieval_telemetry → concept_records via trigger or app-level updates.

### Lane 3: Neo4j GDS + Gemma4 Subagent Orchestration ⏳ READY TO PLAN
- **Status**: Architecture documented; implementation pending
- **Owner**: Claude
- **Timeline**: 3–4 weeks (parallel with Phase 3D.2–3E.1)
- **Document**: `docs/open-lanes/neo4j-gds-gemma4-orchestration.md`
- **Start Gate**: Phase 3D Point 1 confirmed working

**Next Task**: Implement Neo4j GDS tool wrapper (`src/lib/server/tools/neo4j-gds-tools.ts`).

---

## Parallel Execution Model

All three lanes can run **simultaneously** because they operate on **orthogonal concerns**:

```
Phase 3D (Retrieval Telemetry)
  ↓
Records query behavior
  ↓
Feeds concept_records updates (Phase 3E.1)
  └─ AND feeds Neo4j subgraph context (Lane 3)

Phase 3E.1 (Concept Memory)
  ↓
Aggregates & ranks concepts
  ↓
Provides lifecycle metadata for Gemma4 planning

Lane 3 (Neo4j GDS + Gemma4)
  ↓
Reads Neo4j topology + concept rankings
  ↓
Emits tool calls for code repair
  ↓
Writes agent_traces (outcome) → concept_records
```

### Shared State

| Table | Lane 1 | Lane 2 | Lane 3 |
|-------|--------|--------|--------|
| `retrieval_telemetry` | WRITES | reads + increments concepts | reads |
| `concept_records` | — | WRITES (temperature, lifecycle) | reads (for planning) |
| `agent_traces` | — | — | WRITES (repair outcomes) |
| `neo4j` (graph) | — | — | reads (via GDS tools) |

**No circular dependencies**: Lane 1 → 2 → 3, but Lane 3 reads don't block Lanes 1–2.

---

## Weekly Checkpoints

### Week 1 (June 11–18)
- [x] Phase 3D P0–P3 schema fixes
- [x] Phase 3E lifecycle fields added
- [ ] Phase 3D Point 1 >100 telemetry records
- [ ] Phase 3E.1 trigger/app-level linking working
- [ ] Neo4j GDS tool wrapper skeleton

### Week 2 (June 18–25)
- [ ] Phase 3D Point 2 (Hybrid Search) wired
- [ ] Phase 3E.1 temperature recomputation job live
- [ ] concept-temperature-report.json generated
- [ ] Neo4j GDS 5 core functions implemented
- [ ] Qdrant multi-vector enrichment deployed

### Week 3 (June 25–July 2)
- [ ] Phase 3D Point 3 (HyperRAG) wired
- [ ] Gemma4 MCP tool integration wired
- [ ] 10+ manual test queries through full pipeline
- [ ] agent_traces table populated
- [ ] Production readiness: PASS 66 / WARN 0 / FAIL 0

### Week 4 (July 2–9)
- [ ] >1,000 baseline queries collected (Phase 3D.4)
- [ ] QLoRA dataset exported
- [ ] Gemma4 planning SFT prototype
- [ ] Phase 3D/3E/Lane 3 fully integrated

---

## Lane Dependencies (if serial execution needed)

```
Phase 3D.1 (DONE)
  ↓
Phase 3D.2 (June 18–25)
  ↓ once >100 records
Phase 3E.1 (June 18–25, parallel)
  ↓ once telemetry + concepts stable
Lane 3 GDS + Gemma4 (June 25–July 2)
  ↓ once tool contracts defined
Gemma4 planning training (July 2–9)
```

But in **parallel execution**, Lane 2 and 3 can START once Point 1 is wired (June 11–12), even if baseline collection is ongoing.

---

## Git Workflow

### Phase 3D Branch
```bash
git checkout -b phase-3d-telemetry
# Commit: Phase 3D P0–P3 schema fixes
# Commit: Phase 3D.1 ACE assembler instrumentation
# Commit: Phase 3D test suite
git push origin phase-3d-telemetry
```

### Phase 3E.1 Branch
```bash
git checkout -b phase-3e-1-concept-telemetry
# Commit: concept_records lifecycle fields
# Commit: retrieval_telemetry → concept_records trigger
# Commit: temperature recomputation job
git push origin phase-3e-1-concept-telemetry
```

### Lane 3 Branch
```bash
git checkout -b neo4j-gds-gemma4-orchestration
# Commit: Neo4j GDS tool wrapper
# Commit: Qdrant multi-vector enrichment
# Commit: Gemma4 MCP integration
git push origin neo4j-gds-gemma4-orchestration
```

**Merge order**: Phase 3D.1 → Phase 3E.1 → Lane 3 (to avoid forward dependencies).

---

## Validation Gates

### Gate: Production Readiness
```bash
npm run atlas:production-readiness
# Expected: PASS 66 / WARN 0 / FAIL 0
```

### Gate: TypeScript Compilation
```bash
npm run check:fast
# Expected: 0 errors, 0 warnings
```

### Gate: Phase 3D Test Suite
```bash
npm run test:telemetry:phase3d
# Expected: 5/5 gates pass
```

### Gate: Concept Records Audit
```bash
npm run atlas:concept-records
# Expected: 0 orphans, >100 records
```

### Gate: Open Lanes Board State
```bash
npm run opencode:tasks:state
# Expected: All lanes show progress
```

---

## Decision Tree: Serial vs Parallel

**Use PARALLEL execution if**:
- Team has >1 person
- Lanes have no circular dependencies (✓ confirmed)
- Staging environment available (✓ have one)
- CI/CD can handle merges from multiple branches (✓ yes)

**Use SERIAL execution if**:
- Solo developer
- Need maximum stability at each step
- Limited testing capacity

**Recommendation**: PARALLEL (lanes 1, 2, 3 start June 11–12).

---

## Risk Mitigation

### Risk: Schema Conflicts
**Mitigation**: All three lanes modify different tables (telemetry, concept_records, neo4j).
**Conflict Resolution**: Merge Phase 3D first, then Phase 3E.1, then Lane 3.

### Risk: Circular Test Dependencies
**Mitigation**: Each lane has isolated test suite (no cross-imports).
**Validation**: Run `npm run check:fast` after each merge.

### Risk: Performance Regression
**Mitigation**: Phase 3D telemetry is fire-and-forget (no blocking).
**Validation**: Monitor production-readiness gate (must stay ≥ PASS 66).

### Risk: Incomplete Baseline
**Mitigation**: Don't start Phase 3D.2 until Point 1 has >100 records.
**Validation**: Telemetry summary report gate.

---

## Success Criteria (EOW July 9)

- [x] Phase 3D.1 ACE assembler telemetry wired
- [ ] Phase 3D.2 & 3D.3 surfaces wired (Points 2–3)
- [ ] >1,000 baseline queries collected
- [ ] Phase 3E.1 concept telemetry integration live
- [ ] Neo4j GDS + Gemma4 orchestration wired
- [ ] agent_traces populated (50+ repair outcomes)
- [ ] QLoRA dataset exported (100+ examples)
- [ ] Production readiness maintained (PASS 66 / WARN 0 / FAIL 0)
- [ ] All 3 lanes merged to main

---

## References

- **Phase 3D**: `docs/architecture/phase-3d-telemetry-instrumentation.md`, `docs/phase-3d-telemetry-fixes.md`
- **Phase 3E.1**: `docs/open-lanes/phase-3e-1-concept-telemetry.md`
- **Lane 3**: `docs/open-lanes/neo4j-gds-gemma4-orchestration.md`
- **Architecture**: `docs/architecture/trace-runtime-split.md`, `docs/architecture/trace-kag-web-development-guide.md`

---

**Coordination**: No manual scheduling needed. Lanes auto-integrate via shared telemetry/concept_records tables.

**Owner**: Claude + Gemma4 Agent (agentic error fixing)

**Status**: READY FOR PARALLEL EXECUTION
