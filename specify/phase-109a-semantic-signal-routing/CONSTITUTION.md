# Phase 109A Constitution: Immutable Invariants

**Effective**: 2026-07-29  
**Authority**: GitHub Spec Kit + GSD Acceptance Criteria  
**Scope**: All Phase 109A code, tests, and validations

These 10 invariants are **non-negotiable**. Every script, test, and implementation must enforce them. No exceptions without Phase 110+ override.

---

## 1. Postgres is Canonical ✅

**Rule**: All semantic signals and evidence originate in Postgres. Caches and projections are derivatives.

**Enforcement**:
```typescript
// ❌ FORBIDDEN: Write to Qdrant/Redis/Neo4j first
await qdrant.updatePayload(...);

// ✅ REQUIRED: Write to Postgres first
const [signal] = await db.insert(semantic_signals).values({...}).returning();

// ✅ THEN: Invalidate derived stores (async, non-blocking)
await redis.del(`semantic:${signal.id}`);
await qdrant.updatePayload(...);
```

**Validation Gate**:
- Every semantic signal write must have a corresponding Postgres `INSERT` or `UPDATE`
- Timestamp must be within 1 second of Postgres transaction
- Workspace and revision must be immutable after creation

---

## 2. Projection Stores Are Rebuildable 🔄

**Rule**: Neo4j, Qdrant, and Redis are deterministic projections of Postgres. They may diverge; reconciliation via rebuilders.

**Projection Contracts**:
- **Neo4j**: HyperGraphRAG facts = Postgres packets + graph seeds (deterministic Cypher)
- **Qdrant**: Payloads = Postgres packets + semantic signals (deterministic transformation)
- **Redis**: Cache = Postgres + Qdrant (TTL-based, ephemeral)

**Rebuilders**:
```bash
npm run atlas:rebuild:neo4j      # Postgres → Neo4j
npm run atlas:rebuild:qdrant     # Postgres → Qdrant payloads
npm run atlas:rebuild:redis      # Postgres/Qdrant → Redis (optional)
```

**Recovery Protocol**:
1. Detect divergence (audit script finds orphan references)
2. Export Postgres canonical state
3. Run deterministic rebuilder
4. Validate reconciliation
5. Only then promote to production

**Validation Gate**:
- Rebuilder must be idempotent (run 2× = same result)
- No manual fixes to projections; always rebuild from Postgres

---

## 3. Signals Require Complete Provenance 📋

**Rule**: Every persisted semantic signal must include subject, producer, revision, and evidence references.

**Required Fields** (SemanticSignalV1):
```typescript
{
  // Identity
  subject_id: string;           // packet_key or entity_id
  signal_type: SignalType;      // DomainClass | IntentTag | RetrievalLane | etc.
  
  // Provenance
  producer: string;             // "domain_classifier_v1" | "intent_analyzer" | etc.
  producer_model_revision: string;  // If learned: model SHA-256
  producer_schema_version: string;  // If deterministic: schema version
  
  // Evidence
  evidence_ids: string[];       // References to authoritative facts
                                // Format: "postgres:packet:{id}" | "ast_node:{id}" | etc.
  evidence_confidence?: number; // 0.0–1.0, optional for learned signals
  
  // Metadata
  created_at: Date;
  workspace_id: string;
  revision_id: string;          // Immutable; points to snapshot state
}
```

**Validation Gate**:
```typescript
// ❌ FAIL: Missing evidence_ids
const signal = { subject_id: "x", signal_type: "domain", producer: "classifier_v1" };

// ✅ PASS: Complete provenance
const signal = {
  subject_id: "x",
  signal_type: "domain",
  producer: "domain_classifier_v1",
  producer_model_revision: "sha256:abc123...",
  evidence_ids: ["postgres:packet:x", "ast_node:func_main"],
  evidence_confidence: 0.92,
  created_at: new Date(),
  workspace_id: "acme-legal-2026q3",
  revision_id: "rev_xyz"
};
```

---

## 4. Learned Tags Cannot Override Authoritative AST Facts 🚫

**Rule**: Tree-sitter and ast-grep output is immutable ground truth. Learned taggers may supplement but not contradict.

**Resolution Priority**:
1. **AST Facts** (highest priority, immutable)
   - Function names, class hierarchy, imports, exports
   - Type annotations, control flow
2. **Learned POS/Entity Tags** (medium priority, fallible)
   - Part-of-speech tagging, named entity extraction
   - Sentiment, intent classification
3. **Default/Unknown** (lowest priority)
   - Unclassified content, out-of-distribution inputs

**Conflict Resolution**:
```typescript
// If AST says "identifier:function_name" but learned tagger says "POS:noun"
// → Record as "disagreement", mark signal as FLAGGED

const disagreement = {
  packet_id,
  field: "pos_tag",
  ast_fact: "identifier:function_name",
  learned_value: "POS:noun",
  confidence: 0.45,
  status: "CONFLICT_RECORDED"  // Do NOT resolve automatically
};
```

**Validation Gate**:
- Count conflicts per model
- If conflicts > 5%, retrain or deprioritize learned model
- If single critical domain (auth, crypto) has conflicts → ACTIVE_DEGRADED

---

## 5. Domain Classification is Multi-Label 🏷️

**Rule**: Each packet may have 0 or more domain labels. No forced "primary" domain.

**Semantics**:
```typescript
type DomainClassificationV1 = {
  subject_id: string;
  domain_labels: [
    { label: "retrieval", confidence: 0.92, source: "classifier_v1" },
    { label: "embeddings", confidence: 0.78, source: "classifier_v1" },
    { label: "caching", confidence: 0.34, source: "intent_router" }
  ];
  // No "primary" field; confidence scores are the authority
};
```

**Validation Gate**:
- Sum of confidences > 1.0 is OK (overlapping domains)
- If sum < 0.1 → mark as UNCLASSIFIED (not forced to default)
- If max confidence < 0.5 → record as UNCERTAIN

---

## 6. Unknown / OOD Inputs May Remain Unclassified ❓

**Rule**: Out-of-distribution inputs must not be force-labeled. Record as UNCERTAIN or UNKNOWN.

**Allowed States**:
```typescript
// ✅ VALID: Record uncertainty
{ subject_id, domain_labels: [], confidence: 0.0, state: "UNCLASSIFIED" }

// ✅ VALID: Record soft label with low confidence
{ subject_id, domain_labels: [...], confidence: 0.22, state: "UNCERTAIN" }

// ❌ INVALID: Force a label to avoid null
{ subject_id, domain_labels: [{ label: "unknown", confidence: 0.99, ... }] }
```

**Validation Gate**:
- OOD detection AUROC ≥ 0.85 before promoting classifier
- If AUROC < 0.85 → ACTIVE_DEGRADED (cannot safely detect OOD)
- Do NOT train on UNCERTAIN examples as ground truth

---

## 7. Model Output Cannot Self-Promote 🚫

**Rule**: Learned classifiers produce scores. Scores are NOT authoritative until passing validation gates.

**Promotion Workflow**:
```
Model runs
  → Outputs scores + evidence_ids
  → Validation gate checks: F1 ≥ 0.80, precision ≥ 0.90, AUROC ≥ 0.85
  → If PASS: status = "ACTIVE_VERIFIED"
  → If FAIL: status = "ACTIVE_DEGRADED" (do not auto-promote)
```

**Validation Gates** (all must pass):
- Domain macro F1 ≥ 0.80
- Critical domain precision ≥ 0.90 (auth, crypto, security)
- OOD AUROC ≥ 0.85
- Calibration error < 0.10
- Zero contradictions with AST facts (Invariant 4)

**Code Enforcement**:
```typescript
const gateResults = await validateDomainClassifier(model);
if (gateResults.passed === false) {
  classifierStatus = "ACTIVE_DEGRADED";  // NOT promoted
  logWarning(`Classifier failed ${gateResults.failed_gates.length} gates`);
  // Do NOT update production tables
  return;
}
```

---

## 8. Graph Traversal is Seed-Based and Budget-Bounded 📊

**Rule**: No full-graph traversal. All traversals must begin from retrieved seeds and respect hard limits.

**Seed Sources** (origin of traversal):
- Dense/sparse Qdrant ANN results
- BM25 lexical search
- Symbol/schema search results
- Explicit API input

**Hard Limits** (per traversal):
```typescript
const budget: TraversalBudgetV1 = {
  max_seeds: 12,              // Qdrant top-12 only
  max_hops: 2,                // 2 edges max from seed
  max_nodes: 40,              // 40 unique entities
  max_edges: 80,              // 80 unique relationships
  max_returned_facts: 20,     // Return top-20 only
  token_budget?: 4096,        // Optional: total token limit
};
```

**Stricter Limits for Expensive Operations**:
```typescript
// GPU Reranking: smaller neighborhood
if (operation === "gpu_rerank") budget.max_nodes = 20;

// Semantic expansion: even tighter
if (operation === "semantic_expand") budget.max_hops = 1;
```

**Validation Gate**:
```bash
# Check: no traversals exceed limits
npm run atlas:validate:graph:bounds

# Check: all traversals have seeds
npm run atlas:audit:orphan:traversals

# Check: no traversals touching > 20 million nodes
npm run atlas:audit:runaway:queries
```

---

## 9. Agent Loop State is Observable, Not Autonomous 🔄

**Rule**: Recommendations and loop state changes are proposals. No autonomous mutations.

**Allowed Capabilities**:
- ✅ Read Postgres, Qdrant, Neo4j
- ✅ Log observations to event stream
- ✅ Propose recommendations with evidence
- ✅ Suggest state transitions
- ✅ Record reasoning traces

**Forbidden Capabilities**:
- ❌ Direct Postgres mutations (use ledger)
- ❌ Autonomous recommendation execution
- ❌ Rerank without validation
- ❌ Update Neo4j without rebuilder
- ❌ Bypass retrieval plans via direct graph access

**FSM States** (deterministic, observable):
```
UNDERSTAND → CLASSIFY → PLAN → RETRIEVE → EXPAND_GRAPH 
→ RERANK → ASSEMBLE_CONTEXT → GENERATE → VALIDATE 
→ {RECOVERED | COMPLETE | WAIT_EXTERNAL | ERROR}
```

**Validation Gate**:
```bash
npm run atlas:audit:loop:autonomy
# Fail if: any state transition without event log entry
#          any mutation without evidence reference
#          any rerank without validation criteria
```

---

## 10. Recommendations Require Evidence + Rollback Plan 📋

**Rule**: Every recommendation must cite evidence and define rollback before promotion.

**Recommendation Lifecycle**:
```typescript
enum RecommendationStatus {
  PROPOSED = "proposed",              // Just created
  EVIDENCE_GATHERING = "gathering",   // Collecting references
  READY_FOR_REVIEW = "ready",         // All evidence present
  APPROVED = "approved",              // Human or gate approved
  IMPLEMENTED = "implemented",        // Change applied
  VALIDATED = "validated",            // Validation passed
  REJECTED = "rejected",              // Validation failed
  SUPERSEDED = "superseded"           // Replaced by newer rec
}
```

**Required Fields**:
```typescript
type RecommendationV1 = {
  // Identity
  id: string;
  subject_id: string;  // What to change (e.g., packet_id, label_id)
  
  // Recommendation
  proposed_action: string;            // Human-readable action
  inference_explanation: string;      // Why the agent recommends this
  
  // Evidence
  evidence_ids: string[];             // Postgres/Qdrant/Neo4j references
  evidence_confidence: number;        // 0.0–1.0 aggregate confidence
  
  // Validation
  validation_criteria: string;        // How to verify success
  expected_impact: string;            // Predicted outcome
  
  // Safety
  rollback_plan: string;              // How to undo if validation fails
  rollback_verification: string;      // How to prove rollback succeeded
  
  // Lifecycle
  status: RecommendationStatus;
  created_at: Date;
  approved_at?: Date;
  approved_by?: string;               // User or system approver
  implemented_at?: Date;
  validated_at?: Date;
  validation_error?: string;          // If REJECTED, why?
};
```

**Validation Gate**:
```bash
# Before promotion from READY_FOR_REVIEW → APPROVED
npm run atlas:validate:recommendation:evidence
# Fail if: evidence_ids reference non-existent entities
#          rollback_plan is empty or untestable
#          expected_impact is vague
#          validation_criteria has no measurable metric

# After IMPLEMENTED, must pass:
npm run atlas:validate:recommendation:rollback
# Fail if: rollback does not restore prior state
#          rollback is not idempotent
```

---

## Enforcement Summary

| Invariant | Who Enforces | Trigger | Fail Mode |
|-----------|--------------|---------|-----------|
| 1 | Postgres transaction + cache invalidator | Every signal write | TRANSACTION_FAILED |
| 2 | Rebuilder scripts + audit | Divergence detection | PROJECTION_DESYNC |
| 3 | Zod schema + DB trigger | Signal INSERT | VALIDATION_ERROR |
| 4 | Conflict detector + FSM | Learned→AST comparison | DISAGREEMENT_RECORDED |
| 5 | Multi-label validator | Domain INSERT | INVALID_SCHEMA |
| 6 | OOD detector + gate | Confidence threshold | UNCERTAIN_STATE |
| 7 | Validation gate + CI | Model output | ACTIVE_DEGRADED |
| 8 | Traversal budget enforcer | Graph API call | BUDGET_EXCEEDED |
| 9 | FSM validator + audit | State transition | UNAUTHORIZED_MUTATION |
| 10 | Recommendation validator + gate | Promotion workflow | MISSING_ROLLBACK |

---

## CI/CD Hooks (Implementation Required)

### Pre-Tool-Use
- Block: Unbounded graph traversal (Invariant 8)
- Block: Direct projection store writes (Invariant 2)
- Block: Model self-promotion (Invariant 7)
- Block: Autonomous recommendation execution (Invariant 9)

### Post-Tool-Use
- After domain classifier changes: run validation gates (Invariant 7)
- After Qdrant payload changes: audit projection integrity (Invariant 2)
- After Neo4j facts added: verify seed-based access only (Invariant 8)
- After recommendation creation: validate evidence + rollback (Invariant 10)

---

## Supersession & Deprecation

**Superseded Scripts Must Fail Closed**:
```typescript
// scripts/atlas/old-direct-qdrant-writer.mts
console.error("❌ This script is SUPERSEDED by phase-109a-signal-ledger-writer.mts");
console.error("   Enforce through: Postgres canonical → ledger writer → cache invalidation");
process.exit(1);  // MANDATORY: fail if accidentally invoked
```

**Deprecated Models Must Reject**:
```typescript
if (model.revision < "2026-07-29") {
  throw new Error("Domain classifier v0 deprecated; use v1+ (trained 2026-07-29 or later)");
}
```

---

**Audit Interval**: Monthly (every 4 weeks)  
**Last Audit**: 2026-07-29  
**Next Audit**: 2026-08-26  
**Authority**: Phase 109A GitHub Spec Kit, enforced via GSD acceptance criteria
