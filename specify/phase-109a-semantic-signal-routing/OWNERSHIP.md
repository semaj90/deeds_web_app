# Phase 109A Ownership Boundaries

**Objective**: Define who owns what in Phase 109A. Prevents duplicate implementations and establishes clear contract boundaries.

**Format**: Owner → Responsibility → Forbidden Actions

---

## Canonical Ownership Table

### Data Layer (Postgres + Drizzle)

| Owner | Module | Responsibility | Forbidden |
|-------|--------|-----------------|-----------|
| **Postgres** | `sveltekit-frontend/src/lib/server/db/schema-postgres.ts` | ✅ `atlas_packets` truth | Direct Qdrant writes (use projection) |
| | | ✅ `classification_envelope` versioning | Direct Neo4j writes (use rebuilder) |
| | | ✅ `semantic_signals` (signal ledger) | Direct Redis writes (use cache invalidator) |
| | | ✅ `recommendation_log` (evidence + lifecycle) | Overwrite existing records (use VERSIONING) |
| **Drizzle Schema** | `schema-postgres.ts` | ✅ Type inference for Postgres tables | Introduce ORM-incompatible SQL |
| | | ✅ Constraint definitions | Skip migrations |
| | | ✅ Index definitions | Hardcode table names |

**Validation**: Every semantic signal must have a Postgres INSERT or UPDATE with timestamp proof.

---

### Projection Stores (Rebuildable, Not Authoritative)

| Owner | Module | Responsibility | Forbidden |
|-------|--------|-----------------|-----------|
| **Neo4j** | `canonical-id-hierarchy.ts` + `hypergraph-traversal.ts` | ✅ HyperGraphRAG projection from Postgres | Direct identity creation (import from Postgres) |
| | | ✅ Graph traversal (seed-based, budget-bounded) | Full-graph traversal |
| | | ✅ Topology facts (BELONGS_TO, USES, etc.) | Non-deterministic projections |
| **Neo4j Rebuilder** | (TBD: phase-109a-rebuild-neo4j.mts) | ✅ Deterministic Cypher from Postgres | Manual Neo4j mutations |
| | | ✅ Validation (audit orphans) | Skipping rebuilder |
| **Qdrant** | `qdrant-packet-projection.ts` | ✅ Vector payload projection from Postgres | Direct semantic signal writes |
| | | ✅ Semantic payload enrichment | Serving as truth store |
| **Qdrant Rebuilder** | (TBD: phase-109a-rebuild-qdrant.mts) | ✅ Deterministic payload transformation | Manual payload updates |
| | | ✅ Collection validation | Skipping rebuilder |
| **Redis/Bitfrost** | `cache/redis-exact-match.ts` + `cache/bifrost-*.ts` | ✅ Ephemeral L1/L2 cache | Assuming cache correctness after Postgres write |
| | | ✅ TTL-based expiration | Bypassing cache invalidation |
| **Cache Invalidator** | (TBD: phase-109a-cache-invalidator.ts) | ✅ Async invalidation after Postgres writes | Synchronous cache updates |
| | | ✅ Recovery from divergence | Writing to cache before Postgres |

**Validation**: Rebuilders must be idempotent. Run 2× = same result.

---

### Semantic Signals (Phase 109A Core)

| Owner | Module | Responsibility | Forbidden |
|-------|--------|-----------------|-----------|
| **SemanticSignal Contract** | `specify/.../contracts/SEMANTIC-SIGNAL-V1.md` | ✅ Zod schema + Postgres type | Custom signal formats |
| | | ✅ Provenance requirements (producer, revision, evidence) | Signals without evidence_ids |
| | | ✅ Immutability rules (subject, revision never change) | Post-creation signal mutation |
| **Classification Ledger** | `classification-ledger-writer.ts` | ✅ Atomic writes to Postgres + validation | Direct `classification_envelope` updates |
| | | ✅ Evidence reference resolution | Signals with unresolvable evidence_ids |
| | | ✅ Schema versioning | Breaking schema changes mid-deployment |
| **Learned Domain Classifier** | (TBD: phase-109a-domain-classifier.py) | ✅ PyTorch multi-label head training | Forcing labels without validation gates |
| | | ✅ Confidence scoring + evidence aggregation | Direct promotion without F1 ≥ 0.80 proof |
| | | ✅ Per-domain metrics (precision, recall, F1) | Using training loss as acceptance criterion |
| **Classification Validator** | (TBD: phase-109a-validate-classifier.mts) | ✅ Gate checking (F1, precision, AUROC, calibration) | Skipping gate validation |
| | | ✅ OOD detection (AUROC ≥ 0.85) | Deploying classifier with low OOD performance |
| | | ✅ AST fact conflict detection (Invariant 4) | Allowing learned→AST contradictions without flagging |
| **Domain Taxonomy** | (TBD: phase-109a-domain-taxonomy.ts) | ✅ Versioned registry (Postgres table) | Hardcoding taxonomy in multiple services |
| | | ✅ Multi-version support | Untracked taxonomy mutations |
| | | ✅ Label deprecation tracking | Reusing deprecated labels |

**Validation**: Classifier must pass all 7 gates before production. Gates logged in Postgres.

---

### Query & Retrieval Planning

| Owner | Module | Responsibility | Forbidden |
|-------|--------|-----------------|-----------|
| **Query Intent Analyzer** | (TBD: phase-109a-query-intent-analyzer.mts) | ✅ Intent classification (domain probabilities) | Skipping intent analysis |
| | | ✅ Lane hints + depth estimates | Forcing single retrieval lane |
| | | ✅ Evidence in extracted entities | Vague query interpretation |
| **QueryAnalysis Contract** | `specify/.../contracts/QUERY-ANALYSIS-V1.md` | ✅ Intent probabilities (domain, action, uncertainty) | Incomplete intent specification |
| | | ✅ Extracted entities + schema hints | Ignoring query structure |
| **Lane Planner** | (TBD: phase-109a-lane-planner.mts) | ✅ Deterministic routing (intent → lane) | Probabilistic lane selection |
| | | ✅ Candidate + rerank + final limits per lane | Unlimited lane candidates |
| **RetrievalPlan Contract** | `specify/.../contracts/RETRIEVAL-PLAN-V1.md` | ✅ Lane selection + limits + allowed filters | Plans without lane validation |
| | | ✅ Token budget + depth bounds | Unbounded retrieval plans |
| **Go Retrieval** | `go-search-bridge.ts` | ✅ Enforce plans (validate lane, limits, filters) | Ignoring plan constraints |
| | | ✅ Fanout + fusion (RRF, semantic blend) | Direct Qdrant/BM25 bypassing orchestration |
| | | ✅ Graph enrichment (bounded Neo4j hops) | Arbitrary graph expansion |

**Validation**: Plans must have all fields populated. Go Retrieval must reject incomplete plans.

---

### Graph Traversal (Bounded HyperGraphRAG)

| Owner | Module | Responsibility | Forbidden |
|-------|--------|-----------------|-----------|
| **HyperGraphRAG Traversal** | `hypergraph-traversal.ts` | ✅ Seed-based initiation (no full-graph start) | Full-graph or arbitrary node traversal |
| | | ✅ Budget enforcement (hops, nodes, edges) | Exceeding budget limits |
| | | ✅ Neo4j query generation | Arbitrary Cypher queries |
| **TraversalBudget Contract** | `specify/.../contracts/TRAVERSAL-BUDGET-V1.md` | ✅ Hard limits (max_seeds, max_hops, max_nodes) | Soft or per-component limits |
| | | ✅ Expensive operation overrides (GPU rerank, semantic expansion) | Unified budget across all operations |
| **Graph Budget Validator** | (TBD: phase-109a-validate-graph-bounds.mts) | ✅ Audit all traversals for budget compliance | Skipping traversal audits |
| | | ✅ Detect runaway queries (million+ node access) | Allowing traversals touching unreasonable node counts |

**Validation**: No traversal may access > 40 nodes or 80 edges. GPU rerank even tighter (20 nodes max).

---

### Agent Loop & State

| Owner | Module | Responsibility | Forbidden |
|-------|--------|-----------------|-----------|
| **Mastra Workflow** | `atlas-mastra-workflow.ts` | ✅ State transitions (deterministic FSM) | Non-deterministic state changes |
| | | ✅ Tool selection + execution tracking | Autonomous mutation without state record |
| | | ✅ Error handling + recovery routing | Silent failures or unreported errors |
| **Loop Observation FSM** | (TBD: phase-109a-loop-observation.mts) | ✅ Event logging (state, tool, result, retries) | Untracked tool invocations |
| | | ✅ State encoding (UNDERSTAND, CLASSIFY, PLAN, RETRIEVE, etc.) | Ad-hoc state naming |
| | | ✅ Recovery routing (ERROR → RECOVER) | Manual recovery interventions |
| **LoopObservation Contract** | `specify/.../contracts/LOOP-OBSERVATION-V1.md` | ✅ Structured event format (state, tool, result, duration) | Unstructured logs |
| | | ✅ Per-state metrics (retrieval count, token pressure) | Missing operational visibility |
| **HMM State Estimator** | `hmm-state-estimator.ts` | ✅ Probabilistic state inference (prototype only) | Training HMM without 100+ sequences |
| | | ✅ Readiness reporting | Claiming production HMM readiness prematurely |

**Validation**: No state transitions without event log. FSM must be observable and reproducible.

---

### Continuity & Recovery

| Owner | Module | Responsibility | Forbidden |
|-------|--------|-----------------|-----------|
| **Context Continuity** | (TBD: phase-109a-context-continuity.mts) | ✅ Checkpoint persistence (goal, decisions, evidence) | Losing checkpoint on compaction |
| | | ✅ Compaction verification (retention checks) | Skipping continuity validation |
| | | ✅ Recovery protocol (RECOVER → UNDERSTAND) | Proceeding after failed continuity check |
| **ContinuityCheckpoint Contract** | `specify/.../contracts/CONTINUITY-CHECKPOINT-V1.md` | ✅ Active goal + accepted decisions + rejected hypotheses | Incomplete checkpoint state |
| | | ✅ Evidence reference preservation | Broken references after compaction |
| | | ✅ Unresolved question retention | Discarding open questions |
| **Compaction Verifier** | (TBD: phase-109a-verify-compaction.mts) | ✅ Audit: goals retained ≥ 98% | Allowing data loss during compaction |
| | | ✅ Audit: decision retention ≥ 98% | Overwriting prior decisions |
| | | ✅ Audit: evidence reference resolution ≥ 100% | Dangling evidence references |

**Validation**: After compaction, run verifier. If any check fails, route to RECOVER state.

---

### Recommendations & Evidence

| Owner | Module | Responsibility | Forbidden |
|-------|--------|-----------------|-----------|
| **Recommendation Schema** | `contracts/recommendation.ts` | ✅ Evidence + inference + validation plan | Unsupported recommendations |
| | | ✅ Rollback plan (executable, idempotent) | Recommendations without rollback path |
| | | ✅ Lifecycle (PROPOSED → IMPLEMENTED → VALIDATED) | Autonomous recommendation execution |
| **Recommendation Validator** | (TBD: phase-109a-validate-recommendation.mts) | ✅ Evidence reference resolution | Recommending with broken evidence |
| | | ✅ Rollback plan verification (testability) | Untestable rollback procedures |
| | | ✅ Impact prediction validation | Vague "expected_impact" fields |
| **RecommendationV1 Contract** | `specify/.../contracts/RECOMMENDATION-V1.md` | ✅ Problem statement + proposed action + validation criteria | Ambiguous recommendations |
| | | ✅ Confidence + evidence_confidence scores | Unattributed high-confidence claims |
| | | ✅ Rollback verification (how to prove success) | Rollback without verification step |
| **Recommendation Promotion** | `classification-ledger-writer.ts` | ✅ Gate checking before APPROVED state | Skipping validation before approval |
| | | ✅ Postgres persistence (immutable log) | Direct recommendation mutations |

**Validation**: No recommendation may be APPROVED without passing all validation gates.

---

### AST & Structural Facts

| Owner | Module | Responsibility | Forbidden |
|-------|--------|-----------------|-----------|
| **Tree-sitter** | `ast-grep-extractor.ts` + `tree-sitter-wrapper.ts` | ✅ AST facts (functions, classes, types, imports) | POS/entity tagging (use learned tagger) |
| | | ✅ Authoritative symbol extraction | Fuzzy symbol matching |
| **AST Grep** | `ast-grep-*.ts` | ✅ Code structure (control flow, patterns) | Semantic/intent analysis (use learned model) |
| **Learned POS/Entity Tagger** | (TBD: phase-109a-pos-entity-tagger.py) | ✅ POS tags + named entities | Overwriting AST facts |
| | | ✅ Mixed content (prose + code) | Treating all input as code |
| **Code-Aware Tagger Validator** | (TBD: phase-109a-validate-code-tagger.mts) | ✅ Conflict detection (learned vs AST) | Allowing AST→learned contradictions |
| | | ✅ Disagreement logging (for retraining data) | Silent loss of signal quality |

**Validation**: Conflicts logged but not auto-resolved. Tagging accuracy must improve over time.

---

### Synthesis & Generation

| Owner | Module | Responsibility | Forbidden |
|-------|--------|-----------------|-----------|
| **Gemma4** | openai-facade.ts + llama-server | ✅ Synthesis + reasoning (NOT autonomous mutation) | Direct Postgres writes |
| | | ✅ Weak labeling (for training data, not production) | Skipping weak label validation |
| | | ✅ Explanation generation | Executing recommendations without approval |
| **ACE Packet Assembly** | `ace-materializer.ts` + `context-assembler.ts` | ✅ Select signals for current task context | Including all signals (causes bloat) |
| | | ✅ Preserve evidence references + linkage | Discarding signal provenance in synthesis input |

**Validation**: ACE must select ≤20 signals per generation. Every included signal must affect retrieval, authority, or validation.

---

### Testing & Validation

| Owner | Module | Responsibility | Forbidden |
|-------|--------|-----------------|-----------|
| **Unit Tests** | `tests/phase-109a-*.spec.ts` | ✅ Multi-label normalization | Skipping edge case tests |
| | | ✅ Taxonomy version resolution | Testing only happy path |
| | | ✅ AST conflict detection | Allowing failures in invariant checks |
| **Integration Tests** | `tests/integration/phase-109a-*.spec.ts` | ✅ Postgres → Qdrant projection | Testing in isolation (no end-to-end) |
| | | ✅ Neo4j HyperGraphRAG (seed-based) | Untested traversal budgets |
| | | ✅ MCP tool contracts | Untested recommendation rollback |
| **Evaluation Tests** | `tests/eval/phase-109a-*.spec.ts` | ✅ Domain classification metrics | Accepting metrics < 0.80 F1 |
| | | ✅ Query intent accuracy | Skipping OOD AUROC evaluation |
| | | ✅ Bounded traversal compliance | Allowing one budget violation |

**Validation**: All 13 required validation scripts must pass before production deployment.

---

## Ownership Conflicts (Resolved)

**Q: Can Learned Classifier override AST facts?**  
**A**: No. Conflict logged, signal flagged DISAGREEMENT_RECORDED. AST wins. (Invariant 4)

**Q: Can Recommendation auto-execute after approval?**  
**A**: No. APPROVED status enables human review; IMPLEMENTED only after explicit confirmation.

**Q: Can MCP tools propose Neo4j mutations?**  
**A**: Yes, via recommendation contracts. No, direct Neo4j writes. Mutations route through ledger → rebuilder.

**Q: Can Mastra workflow bypass Classification Ledger?**  
**A**: No. All signal writes → ledger → validation → Postgres. Never direct updates.

**Q: Can Go Retrieval ignore RetrievalPlan constraints?**  
**A**: No. Must validate plan completeness and enforce all limits. Reject incomplete plans.

**Q: Can GPU Reranking exceed budget?**  
**A**: No. Max 20 nodes for rerank (even stricter than standard 40 limit).

---

## Summary: Who Can Do What?

| Action | Owner | Gate |
|--------|-------|------|
| Write semantic signal | Classification Ledger | Postgres tx successful |
| Project signal to Qdrant | Qdrant Rebuilder | Deterministic transformation from Postgres |
| Write recommendation | Recommendation Validator | Evidence complete + rollback testable |
| Execute recommendation | Human/Approver | Explicit approval, tracked in Postgres |
| Traverse Neo4j graph | HyperGraphRAG Traversal | Seed-based, budget ≤ 40 nodes |
| Retrain domain classifier | Phase 109A Trainer | Gate checking (F1 ≥ 0.80) required |
| Promote classifier to production | Phase 109A Promotion Gate | All 7 gates PASS, logged in Postgres |
| Generate Gemma4 response | ACE Assembler | Signal selection ≤ 20, evidence refs preserved |
| Modify Postgres schema | Drizzle + Manual Migration | Version tracked, backward compatible |
| Rebuild Neo4j/Qdrant/Redis | Phase 109A Rebuilders | On-demand or scheduled, no downtime |

---

**Last Updated**: 2026-07-29  
**Authority**: GitHub Spec Kit § Ownership Boundaries  
**Enforcement**: Pre-tool-use hooks block unauthorized operations
