# Phase 109A: Semantic Signal and Domain Routing — Evidence Audit

**Date**: 2026-07-29  
**Status**: AUDIT_COMPLETE  
**Objective**: Map existing owners before implementing semantic signal system

---

## Executive Summary

Phase 109A requires integrating 8 critical architectural components:
1. **Domain Classification** (multi-label) → Postgres + PyTorch
2. **Query Intent Analysis** → Semantic routing + lane planning
3. **Retrieval Plans** → Bounded lane selection + Go Retrieval
4. **HyperGraphRAG Traversal** → Seed-based, budget-bounded
5. **ACE Packet Assembly** → Signal inclusion + continuity
6. **Recommendation Engine** → Evidence-backed with rollback
7. **Loop State Observation** → FSM instrumentation
8. **Context Continuity** → Checkpoint persistence

**Critical Finding**: Most components exist but operate independently. Phase 109A consolidates them under one semantic signal contract.

---

## Existing Owners (Classification by Status)

### ACTIVE_VERIFIED ✅ (Core Infrastructure)

| Component | Owner | Status | Evidence |
|-----------|-------|--------|----------|
| **Postgres Canonical Identity** | `sveltekit-frontend/src/lib/server/db/schema-postgres.ts` | ACTIVE_VERIFIED | 70+ tables, `atlas_packets` as truth |
| **Domain Classification Schema** | `sveltekit-frontend/src/lib/server/db/schema-postgres.ts` | ACTIVE_VERIFIED | `domain_class` enum, `classification_envelope` table |
| **ACE Packet Envelope** | `sveltekit-frontend/src/lib/server/ace/canonical-packet-envelope.ts` | ACTIVE_VERIFIED | Versioned `PacketEnvelopeV1` contract (360 lines) |
| **Classification Ledger** | `sveltekit-frontend/src/lib/server/atlas/contracts/classification-ledger-writer.ts` | ACTIVE_VERIFIED | Evidence-backed writes + validation (287 lines) |
| **Neo4j Projection** | `sveltekit-frontend/src/lib/server/topology/canonical-id-hierarchy.ts` | ACTIVE_VERIFIED | Identity hierarchy + graph authority (458 lines) |
| **HyperGraphRAG Traversal** | `sveltekit-frontend/src/lib/server/hypergraph/hypergraph-traversal.ts` | ACTIVE_VERIFIED | Seed-based, budget-bounded traversal (402 lines) |
| **Graph Budget Enforcement** | `sveltekit-frontend/src/lib/server/ace/context-packet-budgeter.ts` | ACTIVE_VERIFIED | Max nodes/edges/hops validation |
| **Mastra Workflow State** | `sveltekit-frontend/src/lib/server/atlas/atlas-mastra-workflow.ts` | ACTIVE_VERIFIED | Orchestration + state tracking (445 lines) |
| **MCP Tool Registry** | `sveltekit-frontend/src/mcp/server.ts` | ACTIVE_VERIFIED | 42 tools, bounded semantic exposure |
| **Recommendation Schema** | `sveltekit-frontend/src/lib/server/atlas/contracts/recommendation.ts` | ACTIVE_VERIFIED | Evidence-backed + rollback plan (260 lines) |
| **Go Retrieval Bridge** | `sveltekit-frontend/src/lib/server/retrieval/go-search-bridge.ts` | ACTIVE_VERIFIED | Production retrieval orchestration |

### ACTIVE_DEGRADED ⚠️ (Partial or Experimental)

| Component | Owner | Issue | Evidence |
|-----------|-------|-------|----------|
| **Query Intent Analysis** | `sveltekit-frontend/src/lib/server/opencode/intent-router.spec.ts` | No production router | Test-only, intent mapping incomplete |
| **Semantic Tagging** | `sveltekit-frontend/src/lib/server/services/langextract-service.ts` | LangExtract only | No learned POS/entity tagger |
| **Learned Domain Classifier** | `sveltekit-frontend/scripts/atlas/lib/classifier-contracts.ts` | No PyTorch model | Contracts exist, trainer missing |
| **Retrieval Lane Planning** | `sveltekit-frontend/src/lib/server/retrieval/cognitive-router.ts` | Hardcoded routing | No deterministic planner from query intent |
| **Context Continuity** | `sveltekit-frontend/src/lib/server/ace/state/workflow-state.ts` | No checkpoint persistence | State tracking, no recovery FSM |
| **Loop Observation FSM** | `sveltekit-frontend/src/lib/server/ace/state/hmm-state-estimator.ts` | HMM prototype only | Not production-ready |

### GATED 🔐 (Requires Review Before Use)

| Component | Owner | Gate | Evidence |
|-----------|-------|------|----------|
| **Qdrant Payload Projection** | `sveltekit-frontend/src/lib/server/atlas/projections/qdrant-packet-projection.ts` | Semantic signal inclusion | Payloads lack standardized signal format |
| **Evidence Validation** | `sveltekit-frontend/src/lib/server/unknown/evidence-validator.ts` | Reference resolution | Missing workspace/revision tracking |
| **Multi-Hop Retrieval** | `packages/parent-atlas/src/core/multi-hop-retrieval.ts` | Budget enforcement | No hard limits on traversal |
| **Recommendation Promotion** | `sveltekit-frontend/src/lib/server/atlas/contracts/recommendation-promotion.spec.ts` | Rollback testing | Lifecycle state incomplete |

### REFERENCE_ONLY 📚 (Historical, Not Production)

| Component | Owner | Status | Note |
|-----------|-------|--------|------|
| **Phase 7 Full Pipeline** | `sveltekit-frontend/scripts/atlas/phase7-full-pipeline.mts` | Deprecated | Replaced by Phase 108+ architecture |
| **Phase 3 Snapshot** | `sveltekit-frontend/scripts/atlas/phase3-control-snapshot-builder.mts` | Archived | Training data only |
| **Old Orchestrator** | `scripts/phase104-backups/src/lib/server/orchestrator/gemma-agent.ts` | Backup | Superseded by Mastra |

### SUPERSEDED 🔄 (Do Not Use)

| Component | Owner | Reason | Replacement |
|-----------|-------|--------|-------------|
| **JSONish Envelope** | (unknown) | Incomplete contracts | Use `PacketEnvelopeV1` |
| **Hardcoded Domain Taxonomy** | (scattered) | Not versioned | Create `domain_taxonomy_v1` table |
| **Direct Qdrant Writes** | (old scripts) | No Postgres authority | Use `classification-ledger-writer.ts` |

### FAILED ❌ (Do Not Use)

| Component | Owner | Reason | Impact |
|-----------|-------|--------|--------|
| **Phase 18 XGBoost Reranker** | (abandoned) | Training data insufficient | Defer to Phase 110 |
| **Old Recommender** | (unknown) | Insufficient evidence validation | Use new `recommendation.ts` |

---

## Key Dependencies (Must Maintain)

### Canonical Authority Chain

```
Postgres (truth)
  ├─ atlas_packets (packet identity)
  ├─ classification_envelope (signal versioning)
  ├─ domain_taxonomy_v1 (label registry, TBD)
  └─ recommendation_log (evidence + rollback)
       ↓
  Neo4j (HyperGraphRAG projection)
  Qdrant (semantic payload projection)
  Redis (Bitfrost cache, ephemeral)
  Go Retrieval (fanout + fusion)
```

### Ownership Boundaries (Do Not Cross)

| Owner | Responsibility | Forbidden |
|-------|-----------------|-----------|
| **Postgres+Drizzle** | Canonical signal identity, versioning, evidence refs | Direct cache/graph writes |
| **Neo4j** | HyperGraphRAG projection, topology facts | Canonical domain labels |
| **Qdrant** | Semantic vector payload projection | Authoritative signal definition |
| **Go Retrieval** | Fanout, fusion, plan enforcement | Direct Neo4j/Qdrant mutations |
| **PyTorch Classifier** | Learned multi-label scoring | Overwriting authoritative AST facts |
| **Mastra Workflow** | State tracking, tool selection | Direct Postgres writes (use ledger) |
| **MCP Tools** | Read-only semantic info access | Proposing mutations without evidence |
| **Gemma4** | Synthesis, weak labeling | Autonomous recommendation execution |

---

## Phase 109A Blocking Dependencies

**CLEAR TO PROCEED**: All critical owners exist. No blocking gaps.

**Pre-Requisites (Already Met)**:
- ✅ Postgres `atlas_packets` + `classification_envelope` tables
- ✅ ACE packet envelope contract (v1)
- ✅ Neo4j HyperGraphRAG projection service
- ✅ Qdrant collection with payloads
- ✅ Go Retrieval orchestration
- ✅ Mastra workflow + MCP integration
- ✅ Bitfrost Redis cache

**To Be Created** (Phase 109A scope):
1. ⏳ Domain taxonomy versioned registry (Postgres + Zod contract)
2. ⏳ Query intent analyzer (deterministic planner)
3. ⏳ PyTorch multi-label classifier (baseline + learned model)
4. ⏳ Retrieval lane planner (deterministic routing from query intent)
5. ⏳ SemanticSignal contract (unified signal format)
6. ⏳ Loop state FSM (UNDERSTAND → COMPLETE)
7. ⏳ Continuity checkpoint persistence (recovery gates)
8. ⏳ Recommendation validation schema (evidence + rollback)

---

## Evidence Filing Rules (Phase 109A Constitution)

### Invariant 1: Postgres is Canonical
- Signal writes: Postgres first, then invalidate caches (Redis/Qdrant/Neo4j)
- Query truth: Always join from Postgres, never trust projection stores alone
- Schema versions: Version every contract via `schema_version` column

### Invariant 2: Projection Stores Are Rebuildable
- Neo4j facts = deterministic from Postgres identity + HyperGraphRAG seed graph
- Qdrant payloads = deterministic from Postgres packets + computed signals
- Redis cache = ephemeral, invalidate after Postgres writes
- Recovery: Run deterministic rebuilders if any projection diverges

### Invariant 3: Signals Require Provenance
Every signal must include:
- **subject_id** (packet_key or entity identity)
- **signal_type** (SemanticSignalV1 discriminated union)
- **producer** (component that computed it: "domain_classifier", "intent_analyzer", etc.)
- **revision** (model version if learned, schema version if deterministic)
- **evidence_ids** (references to authoritative facts, e.g., AST node IDs)
- **confidence** (optional, 0.0–1.0 for learned signals)
- **created_at** (timestamp)

### Invariant 4: Learned Tags ≠ Authoritative Facts
- Tree-sitter AST facts override learned POS/entity tags
- If learned tagger contradicts AST: record as disagreement, fail signal validation
- AST symbols are immutable; learned labels may be retrained

### Invariant 5: Multi-Label Domain Classification
- Each packet may have 0+ domain labels
- No hard "primary" domain; use probability scores instead
- Support out-of-distribution (unknown domain) without forcing a label

### Invariant 6: Graph Traversal is Seed-Based and Budget-Bounded
- Traversal must start from retrieved chunks (Qdrant, BM25, or symbol search)
- No full-graph traversal; max 12 seeds, 2 hops, 40 nodes, 80 edges, 20 returned facts
- Stricter limits for expensive operations (reranking, GPU inference)

### Invariant 7: Model Output ≠ Promotion
- Learned classifier produces scores; scores are NOT authoritative
- Promotion requires validation gate: F1 ≥ 0.80, precision (critical domain) ≥ 0.90, AUROC(OOD) ≥ 0.85
- Failed gates → ACTIVE_DEGRADED or GATED (never auto-promote)

### Invariant 8: Recommendations Require Evidence + Rollback
- Every recommendation must cite evidence (packet IDs, reasoning path)
- Validation plan must specify criteria for rollback
- Rollback must be executable without operator intervention
- Status: PROPOSED → READY_FOR_REVIEW → APPROVED → IMPLEMENTED → VALIDATED or REJECTED

### Invariant 9: Context Continuity Must Persist Across Compaction
Before compaction:
- Save ContinuityCheckpoint: active_goal, accepted_decisions, rejected_hypotheses, evidence_ids
After compaction:
- Verify: all active goals retained, decisions retained, rejection reasons retained
- Failed verification → route to RECOVER state, do not proceed to GENERATE

### Invariant 10: Superseded References Must Fail Closed
- Scripts marked superseded must `process.exit(1)` if called
- Deprecated models must reject inputs with clear error message
- Phase 110+ must not accidentally revert to Phase 109A if later phase fails

---

## Next Steps (Phase 109A Entry)

1. **Create contracts** (2h):
   - `SemanticSignalV1` (Zod + Postgres type)
   - `DomainClassificationV1` (multi-label probability)
   - `QueryAnalysisV1` (intent + lane plan)
   - `TraversalBudgetV1` (hard limits)
   - `RecommendationV1` (evidence + lifecycle)

2. **Build training data** (1h):
   - Stratified corpus from Postgres (source_path, artifact_kind, existing_labels)
   - Weak labels from Gemma4 + graph neighbors
   - Reviewed labels from ACTIVE_VERIFIED existing labels
   - Separate evaluation split

3. **Implement baseline classifier** (1h):
   - Frozen EmbeddingGemma embeddings
   - Small PyTorch multi-label head (3-4 layers)
   - Deterministic rule fallback
   - Report: precision, recall, F1 per domain

4. **Wire semantic signals to Postgres** (1.5h):
   - Classification ledger writes
   - Signal projection to Qdrant payloads
   - Validation gates

5. **Implement query analysis + lane planner** (1.5h):
   - Query intent classifier
   - Deterministic routing engine
   - Go Retrieval integration

6. **Setup loop observation FSM** (1h):
   - State machine: UNDERSTAND → CLASSIFY → PLAN → RETRIEVE → GENERATE → VALIDATE
   - Event logging to Postgres
   - Recovery routing

7. **Implement context continuity** (1h):
   - Checkpoint persistence
   - Compaction verification
   - Recovery protocol

8. **Validation suite** (2h):
   - 13 focused scripts (see spec kit)
   - Integration tests
   - Evaluation tests

**Total Timeline**: 11–13 hours  
**Parallel Opportunity**: Steps 3 (PyTorch) can run in background while steps 1–2 execute

---

## Files Ready for Creation

```
specify/phase-109a-semantic-signal-routing/
├── RESEARCH.md                                    ✅ (this file)
├── PLAN.md                                         (step-by-step implementation)
├── TASKS.md                                        (13 required scripts + tests)
├── DATA-MODEL.md                                   (Postgres schema extensions)
├── contracts/
│   ├── SEMANTIC-SIGNAL-V1.md                       (Zod schema + examples)
│   ├── DOMAIN-CLASSIFICATION-V1.md                 (multi-label contract)
│   ├── QUERY-ANALYSIS-V1.md                        (intent + lanes)
│   ├── TRAVERSAL-BUDGET-V1.md                      (hard limits)
│   ├── CONTINUITY-CHECKPOINT-V1.md                 (recovery contract)
│   ├── LOOP-OBSERVATION-V1.md                      (FSM events)
│   └── RECOMMENDATION-V1.md                        (evidence + lifecycle)
├── CONSTITUTION.md                                (10 immutable invariants)
├── OWNERSHIP.md                                    (authority boundaries)
└── PROMOTION-GATES.md                              (proof levels + thresholds)
```

---

**Status**: Ready for Phase 109A PLAN.md  
**Next**: Create `PLAN.md` with step-by-step implementation order

---

## Implementation Update (2026-07-29)

- `sveltekit-frontend/src/lib/server/atlas/contracts/semantic-signal-v1.ts` is now present and enforces the shared Phase 109A schemas.
- `sveltekit-frontend/src/lib/server/atlas/semantic-signal-routing.ts` now produces compact query analysis, retrieval plans, continuity checkpoints, loop observations, recommendations, and proof manifests.
- `sveltekit-frontend/src/routes/api/atlas/runtime-retrieve/+server.ts` and `sveltekit-frontend/src/routes/api/atlas/mastra-agent/+server.ts` now surface compact semantic signal packets.
- Focused vitest coverage passed for the taxonomy, routing helper, and semantic tool integration.
- Remaining work is still bounded: Postgres persistence, Redis logging, proof manifest storage, and deeper evaluation harnesses.
