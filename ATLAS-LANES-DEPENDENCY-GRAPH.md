# Atlas Lanes: Dependency Graph & Parallel Execution Plan

**Date**: July 8, 2026 (Session 122 Final)  
**Purpose**: Map which lanes overlap, which block each other, which can run in parallel

---

## Dependency Model

### Critical Path (Blocking Sequence)

```
Production Validation (Phase 6-7, Sessions 123-124)
  ↓ (must complete before)
Semantic Packet Generation (Phase 8.1, Sessions 125-126)
  ↓ (must complete before)
Multi-Space Framework (Phase 8b, Sessions 127-128)
  ↓ (must complete before)
OpenTelemetry Instrumentation (Phase 9, Sessions 128-129)
  ↓ (must complete before)
Adaptive Routing (Phase 10, Sessions 130+)
```

**Why**: Each phase builds observability layer that next phase needs. Can't do adaptive routing without traces. Can't trace without multi-space decomposition. Can't decompose without semantic objects.

---

## Phase 8 Parallel Lanes (Sessions 125-127)

### Three Independent Lanes Can Run in Parallel

#### Lane A: Semantic Packet Generation
**Scope**: Generate semantic objects for all 58K packets (extends Phase 3b.2)  
**Duration**: ~8 hours  
**Dependencies**: None (reads from Postgres, writes to new table)  
**Overlap**: None

**Tasks**:
1. Extend phase3b2-semantic-splitter-pipeline.mjs to production scale
2. Deterministic title derivation (feature_label → summary → domain:feature_id)
3. Content-based domain classification (keyword matching)
4. Tree path construction (workspace/repo/module/feature/packet)
5. Keyword extraction from ontology
6. Backfill `atlas_semantic_packets` table

**Produces**: 58,365 semantic objects in Postgres

---

#### Lane B: Tree Hierarchy Formalization
**Scope**: Create workspace/repository/module/feature containment schema  
**Duration**: ~6 hours  
**Dependencies**: None (creates new tables, migrates existing data)  
**Overlap**: None

**Tasks**:
1. Create 5 new tables (workspace, repository, module, feature_semantic, packet, embedding)
2. Backfill workspace/repository/module from source_ref patterns
3. Join feature_id to feature_semantic table
4. Migrate packet references to new hierarchy
5. Verify joins (expect >90% success rate)

**Produces**: Normalized containment hierarchy

---

#### Lane C: TurboVec Load From Qdrant
**Scope**: Populate TurboVec index from enriched Qdrant points  
**Duration**: ~4 hours  
**Dependencies**: None (reads from Qdrant, writes to TurboVec)  
**Overlap**: None

**Tasks**:
1. Scroll Qdrant codebase_chunks_768 points with enriched payloads
2. Filter for required fields (feature_id, community_id, or tags)
3. Call TurboVecService.Upsert for each point
4. Verify indexed count > 0
5. Test search returns candidates
6. Validate candidate → Qdrant payload → atlas_packets linkage

**Produces**: TurboVec index populated, search operational

---

### Parallel Execution Timeline

```
Session 125, Day 1 (8 hours):
  └─ Lane A: Semantic objects           [████████] 8h
  └─ Lane B: Tree hierarchy             [██████] 6h
  └─ Lane C: TurboVec load              [████] 4h
     (all start at T+0, finish at T+8)

Session 126, Day 1 (4 hours):
  └─ Lane A: Backfill + validation      [████] 4h
  └─ Lane B: Backfill + validation      [████] 4h
  └─ Lane C: Integration test           [██] 2h
```

**Total Phase 8 time: ~2 working days (Lanes A+B can overlap completely)**

---

## Phase 8b: Multi-Space Framework (Sessions 127-128)

**Cannot start until**: Phase 8 Lanes A+B complete (need semantic objects + tree hierarchy)

### Three Parallel Sub-Lanes

#### Sub-Lane 8b.1: Space Abstraction Interface
**Scope**: Define 4 mathematical spaces formally  
**Duration**: ~3 hours  
**Dependencies**: None (pure design/interface work)

**Tasks**:
1. Create `RetrievalSpace` interface
2. Implement `SemanticSpace` (Qdrant ANN)
3. Implement `LexicalSpace` (Postgres BM25)
4. Implement `TopologySpace` (Neo4j traversal)
5. Implement `ExecutionSpace` (Redis frequency)

**Produces**: Modular space interface, 4 implementations

---

#### Sub-Lane 8b.2: Space Routing Integration
**Scope**: Route all searches through 4-space abstraction  
**Duration**: ~4 hours  
**Dependencies**: Sub-Lane 8b.1 (needs space interface)

**Tasks**:
1. Refactor go-retrieval-facade.ts to call all 4 spaces
2. Collect results from each space independently
3. Pass space contributions to RRF
4. Expose per-space latency in traces

**Produces**: Unified space-based routing

---

#### Sub-Lane 8b.3: Per-Space Observability
**Scope**: Add span attributes for each space contribution  
**Duration**: ~2 hours  
**Dependencies**: Sub-Lane 8b.2 (needs space routing)

**Tasks**:
1. Add space name to each result
2. Add space dimension metadata
3. Add per-space candidate count
4. Add per-space latency
5. Add per-space normalization strategy

**Produces**: Rich per-space telemetry

---

### Parallel Execution Timeline

```
Session 127, Day 1 (4 hours):
  └─ Sub-Lane 8b.1: Interfaces    [███] 3h
  └─ Sub-Lane 8b.2 starts at 3h mark: [████] 4h
  └─ Sub-Lane 8b.3 starts at 7h mark: [██] 2h
     (overlaps: 1 and 2, then 2 and 3)
```

**Total Phase 8b time: ~1 working day (fully sequential, no true parallelization possible)**

---

## Phase 9: OpenTelemetry Instrumentation (Sessions 128-129)

**Cannot start until**: Phase 8b complete (need multi-space routing)

### Four Independent Parallel Lanes

#### Lane 9.1: OTEL Span Instrumentation
**Scope**: Add distributed trace spans at every hop  
**Duration**: ~4 hours  
**Dependencies**: None (instrumentation is additive)

**Tasks**:
1. Add OTEL initialization
2. Add span for dispatcher decision
3. Add span for each space search (4 spans)
4. Add span for identity gate
5. Add span for RRF fusion
6. Add span for optional Gemma4 synthesis

**Produces**: Full request trace structure

---

#### Lane 9.2: Span Attributes (Identity & Results)
**Scope**: Enrich spans with packet identity + ranking info  
**Duration**: ~3 hours  
**Dependencies**: Lane 9.1 (needs spans to enrich)

**Tasks**:
1. Add packet_key to each span
2. Add tree_node_id (workspace/repo/module/feature)
3. Add domain + subdomain
4. Add identity_lane (canonical/recoverable/quarantine)
5. Add rrf_rank + rrf_score
6. Add candidate_count per space

**Produces**: Identity-rich spans

---

#### Lane 9.3: Langfuse Export (AI Layer)
**Scope**: Export traces to Langfuse for AI observability  
**Duration**: ~2 hours  
**Dependencies**: Lanes 9.1 + 9.2 (needs spans + attributes)

**Tasks**:
1. Create Langfuse exporter
2. Map OTEL spans → Langfuse trace format
3. Extract AI-specific fields (model, tokens, hallucination)
4. Test trace upload
5. Verify dashboard visibility

**Produces**: Langfuse traces (AI visualization)

---

#### Lane 9.4: Prometheus Export (Infrastructure)
**Scope**: Export metrics to Prometheus for infrastructure monitoring  
**Duration**: ~2 hours  
**Dependencies**: Lanes 9.1 + 9.2 (needs spans for metrics)

**Tasks**:
1. Create Prometheus exporter
2. Emit per-space latency as histogram
3. Emit candidate count as gauge
4. Emit error rate as counter
5. Wire Grafana dashboard
6. Test metric scraping

**Produces**: Prometheus metrics (infrastructure visualization)

---

### Parallel Execution Timeline

```
Session 128, Day 1 (4 hours):
  └─ Lane 9.1: Spans              [████] 4h
  └─ Lane 9.2 starts at 4h:       [███] 3h
  └─ Lane 9.3 at 7h (parallel):   [██] 2h
  └─ Lane 9.4 at 7h (parallel):   [██] 2h
     (1 blocks 2; 2 unblocks 3&4; 3&4 can run in parallel)

Total: ~1.5 working days
```

---

## Phase 10: Adaptive Routing & Contextual Assembly (Sessions 130+)

**Cannot start until**: Phase 9 complete (need traces for feedback)

### Two Sequential Stages

#### Stage 10.1: Feedback Collection & Dataset Building
**Scope**: Collect user feedback, build training dataset  
**Duration**: ~8 hours (+ ongoing collection)  
**Dependencies**: Phase 9 (needs trace_id for feedback linkage)

**Tasks**:
1. Add feedback API endpoint (/api/retrieval/feedback)
2. Collect (trace_id, user_rating, accepted/rejected, latency)
3. Link feedback to original trace
4. Build labeled dataset in Postgres
5. Validate >=500 positive examples
6. Validate >=100 negative examples

**Produces**: Labeled feedback dataset

---

#### Stage 10.2: Adaptive Routing Policy (RL Training)
**Scope**: Train policy to learn RRF weights from feedback  
**Duration**: ~12 hours (compute-bound)  
**Dependencies**: Stage 10.1 (needs training data)

**Tasks**:
1. Export labeled traces to Python
2. Train lightweight policy (e.g., linear regression of RRF weights)
3. Validate policy improves over static 0.40/0.30/0.20/0.10
4. Deploy policy to production
5. Monitor for policy drift

**Produces**: Learned routing policy

---

#### Stage 10.3: Contextual Packet Assembly
**Scope**: Return results with full tree context  
**Duration**: ~4 hours  
**Dependencies**: Phase 8 (needs tree hierarchy)

**Tasks**:
1. Modify retrieval response to include tree_node
2. Add related_packets (Neo4j neighbors)
3. Add context_summary (from semantic packet)
4. Test "find all implementations of feature X"
5. Wire Parent Atlas integration

**Produces**: Contextual result objects

---

### Execution Timeline

```
Session 130, Day 1-2 (20 hours):
  └─ Stage 10.1: Feedback        [████████] 8h
  └─ Stage 10.2: RL Training     [████████████] 12h (can run in parallel with 10.1)
  └─ Stage 10.3: Assembly        [████] 4h (must wait for 10.1+10.2)

Total: ~2 working days
```

---

## Overlap Summary: Which Lanes Interfere?

### No Overlap (True Parallelization)

**Phase 8 (Sessions 125-126):**
- Lane A (semantic objects) + Lane B (tree hierarchy) + Lane C (TurboVec) → **0% interference**
- All three can run simultaneously
- Each reads different sources, writes different targets
- **Recommendation**: Run all 3 in parallel, complete in ~8 hours

**Phase 9 (Sessions 128-129):**
- Lane 9.3 (Langfuse) + Lane 9.4 (Prometheus) → **0% interference after 9.2**
- Both exporters read same traces, write to different systems
- **Recommendation**: Run both in parallel, complete in ~2 hours

### Sequential Dependencies (Must Order)

**Phase 6-7 → Phase 8**: Production validation required before semantic work  
**Phase 8 → Phase 8b**: Semantic packets + tree hierarchy required for multi-space decomposition  
**Phase 8b → Phase 9**: Multi-space routing required for per-space instrumentation  
**Phase 9 → Phase 10**: Traces required for feedback collection

---

## Risk: Where Lanes Might Collide

### Risk 1: Semantic Packets (Lane A) vs. Neo4j Projection

If Lane A generates semantic packets with tree_node_id pointing to Neo4j nodes that don't exist yet:
- **Probability**: Medium (tree hierarchy might lag)
- **Mitigation**: Phase 8 Lanes A+B run in parallel; A waits for B's output if needed
- **Fallback**: Use temporary tree_node_id, update after B completes

### Risk 2: TurboVec Load (Lane C) vs. Qdrant Payload Sync

If Qdrant payloads are being updated while TurboVec is reading:
- **Probability**: Low (both are reads; updates are rare)
- **Mitigation**: TurboVec load takes single Qdrant snapshot (not streaming)
- **Fallback**: Re-run load after semantic enrichment (Phase 8 Lane A)

### Risk 3: Multi-Space Routing (Phase 8b) vs. Existing Retrieval

If go-retrieval-facade.ts is refactored while production traffic is live:
- **Probability**: HIGH (Phase 6-7 overlaps Phase 8 start)
- **Mitigation**: Phase 8 starts AFTER Phase 7 soak test completes (24h wait)
- **Fallback**: Feature-flag Phase 8b changes; test in staging first

### Risk 4: OTEL Instrumentation (Phase 9) vs. Production Latency

If adding spans increases latency beyond acceptable:
- **Probability**: Low (spans are async)
- **Mitigation**: Make OTEL async; off-path from critical latency
- **Fallback**: Disable OTEL for hot path; enable selectively

---

## Optimized Execution Schedule

### Sessions 123-124: Phase 6-7 (Production Validation)
- Canary ramp + 24h soak test
- **Duration**: ~27 hours
- **End state**: Production sign-off gates pass

### Sessions 125-126: Phase 8 (Parallel Lanes A+B+C)
- Run all three lanes simultaneously
- Semantic packets (Lane A)
- Tree hierarchy (Lane B)
- TurboVec load (Lane C)
- **Duration**: ~8-10 hours (full day)
- **End state**: 58K packets have semantic objects + tree hierarchy; TurboVec operational

### Session 127: Phase 8b (Sequential Sub-Lanes)
- Interface design (sub-lane 1)
- Integration (sub-lane 2)
- Observability (sub-lane 3)
- **Duration**: ~8-10 hours (full day)
- **End state**: Multi-space framework operational; 4 spaces contribute to RRF

### Sessions 128-129: Phase 9 (Parallel Lanes 9.3+9.4)
- OTEL instrumentation (Lane 9.1, sequential)
- Span enrichment (Lane 9.2, sequential)
- Langfuse export (Lane 9.3, parallel with 9.4)
- Prometheus export (Lane 9.4, parallel with 9.3)
- **Duration**: ~8-12 hours (1.5 days)
- **End state**: Full distributed tracing; observability available in Langfuse + Prometheus

### Sessions 130+: Phase 10 (Sequential Stages)
- Feedback collection (Stage 10.1)
- RL training (Stage 10.2, parallel with 10.1)
- Contextual assembly (Stage 10.3, after 10.1+10.2)
- **Duration**: ~20 hours (2 days)
- **End state**: Adaptive routing + contextual results

---

## Total Timeline

| Phase | Sessions | Parallel? | Duration | Cumulative |
|-------|----------|-----------|----------|-----------|
| 6-7 | 123-124 | N/A | ~27h | 27h |
| 8 | 125-126 | ✅ 3 lanes | ~10h | 37h |
| 8b | 127 | ❌ Sequential | ~10h | 47h |
| 9 | 128-129 | ✅ Last 2 lanes | ~12h | 59h |
| 10 | 130+ | ✅ Partial | ~20h | 79h |

**Total to fully adaptive intelligent retrieval: ~80 working hours (~2 weeks, Sessions 123-130)**

---

## Recommendation

**Lanes DO overlap strategically, but not conflictingly:**

1. **Phase 8**: All 3 lanes can run true parallel (0% interference)
2. **Phase 8b**: Sequential but short (1 day)
3. **Phase 9**: Mostly sequential, final 2 lanes parallel (1.5 days)
4. **Phase 10**: Mostly parallel (2 days)

**Execute parallelized where marked, proceed sequentially where dependencies exist. No blocker risks identified.**

Ready for Phase 6-7 production execution, then Phase 8 parallel launch.
