# Clustering, Routing & Recommendation Architecture Specification

**Version**: 1.0  
**Status**: Phase 1 (Identity & Schema Authority) — Ready for Implementation  
**Last Updated**: July 23, 2026

## Executive Summary

This specification defines the complete architecture for validating K-Means clusters, building bounded recommendation packets, enforcing task promotion gates, and orchestrating end-to-end retrieval through Mastra workflows.

**Core principle**: Raw statistical clusters must resolve to stable, canonical entity IDs before high-confidence inference.

**Expected flow**: Raw Embedding → K-Means Cluster ID → Canonical Feature ID → Recommendation → Task Promotion Gate → Kanban Workflow

---

## 11. Recommendation Record Schema

The recommendation record is the immutable artifact produced by the ranker, storing all evidence needed to reconstruct or audit a scoring decision.

```typescript
export const RecommendationRecordSchema = z.object({
  recommendation_id: z.string().min(1),
  query_id: z.string().min(1),
  candidate_tree_node_id: z.string().min(1),
  usefulness_probability: z.number().min(0).max(1),
  confidence: z.number().min(0).max(1),
  ranker_model_id: z.string().min(1),
  feature_contract_version: z.string().min(1),
  feature_values: RecommendationFeaturesSchema,
  evidence_refs: z.array(z.string().min(1)),
  reason_codes: z.array(z.string().min(1)),
  corpus_snapshot_id: z.string().min(1),
  graph_projection_id: z.string().nullable(),
  created_at: z.string().datetime(),
});
```

### Audit Tests

- Feature values are stored with the score
- Ranker model and corpus versions are immutable
- Recommendation can be reconstructed from stored features
- Every reason code has supporting evidence
- Recommendations never contain raw model tensors
- Recommendations never use tokenizer IDs as canonical identity

---

## 12. ACP Recommendation Packet Schema

The ACP (Agent Control Plane) recommendation packet is a bounded, budget-aware envelope containing a query, candidate set, graph paths, and permissions. It is the direct input to Gemma4 synthesis.

```typescript
export const ACPRecommendationPacketSchema = z.object({
  contract: z.literal('atlas:acp-recommendation:v1'),
  query_id: z.string().min(1),
  intent: z.string().min(1),
  candidates: z.array(z.object({
    tree_node_id: z.string().min(1),
    source_ref: z.string().min(1),
    relevance_probability: z.number().min(0).max(1),
    reason_codes: z.array(z.string().min(1)),
    evidence_refs: z.array(z.string().min(1)),
    estimated_context_tokens: z.number().int().nonnegative().min(1).max(20),
  })),
  graph_paths: z.array(z.object({
    nodes: z.array(z.string().min(2)),
    edges: z.array(z.string().min(1)),
    path_score: z.number().min(0).max(1),
  })),
  budget: z.object({
    max_source_files: z.number().int().min(1).max(20),
    max_raw_tokens: z.number().int().min(1),
    max_tool_calls: z.number().int().min(1),
    max_graph_hops: z.number().int().min(0).max(3),
  }),
  permissions: z.object({
    mode: z.enum(['read_only', 'proposal_only', 'patch_allowed']),
    allowed_roots: z.array(z.string().min(1)),
  }),
  corpus_snapshot_id: z.string().min(1),
});
```

### ACP Smoke Gates

- Maximum candidate count enforced
- Total estimated tokens stay within budget
- All source paths fall under allowed_roots
- Graph path length stays within hop budget
- Candidate identities exist in Postgres
- Evidence references resolve
- Gemma4 receives summaries first (raw source only for selected candidates)
- Read-only packets cannot invoke patch tools

---

## 13. Recommendation to Kanban Contract Gate

A recommendation must not become a task merely because its score is high. The promotion gate enforces 8 criteria before a recommendation becomes a PROPOSED task.

```typescript
export const TaskPromotionGateSchema = z.object({
  recommendation_id: z.string().min(1),
  retrieval_confidence: z.number().min(0).max(1),
  evidence_completeness: z.number().min(0).max(1),
  duplicate_task_probability: z.number().min(0).max(1),
  actionable: z.boolean(),
  affected_paths_known: z.boolean(),
  acceptance_criteria_present: z.boolean(),
  permissions_resolved: z.boolean(),
  gate_decision: z.enum(['PROMOTE', 'REVIEW_REQUIRED', 'REJECT']),
  failure_reasons: z.array(z.string()),
});
```

### Recommended Initial Thresholds

```typescript
const PROMOTION_THRESHOLDS = {
  retrieval_confidence: 0.80,
  evidence_completeness: 0.85,
  duplicate_task_probability: 0.20,
  actionable: true,
  affected_paths_known: true,
  acceptance_criteria_present: true,
  permissions_resolved: true,
};
```

### Promotion Logic

```typescript
function evaluateTaskPromotion(input: z.infer<typeof TaskPromotionGateSchema>) {
  // Reject if evidence is missing entirely
  if (!input.actionable || !input.acceptance_criteria_present) {
    return 'REJECT';
  }

  // Review if confidence is marginal or duplication risk is high
  if (
    input.retrieval_confidence < 0.8 ||
    input.evidence_completeness < 0.85 ||
    input.duplicate_task_probability > 0.2 ||
    !input.affected_paths_known ||
    !input.permissions_resolved
  ) {
    return 'REVIEW_REQUIRED';
  }

  return 'PROMOTE';
}
```

### Tests

- `kanban.high-score-insufficient-evidence.spec.ts`
- `kanban.duplicate-task-blocked.spec.ts`
- `kanban.missing-acceptance-criteria.spec.ts`
- `kanban.unknown-paths-review.spec.ts`
- `kanban.read-only-permission-block.spec.ts`
- `kanban.valid-proposal-promoted.spec.ts`

---

## 14. End-to-End Smoke Scenario

Use a fixed fixture repository containing:
- `searchCandidates`
- `scoreAllClusters`
- `retrievalRouter`
- `rerankResults`
- `reciprocalRankFusion`
- `buildAcePacket`
- `recommendationWorkflow`

### Dependency Graph

```
retrievalRouter CALLS scoreAllClusters
retrievalRouter CALLS searchCandidates
searchCandidates CALLS rerankResults
rerankResults CALLS reciprocalRankFusion
reciprocalRankFusion CALLS buildAcePacket
buildAcePacket INVOKES_WORKFLOW recommendationWorkflow
```

### Query

**"Where is cluster routing calculated and which recommendation workflow consumes it?"**

### Expected Flow

1. Ripgrep finds cluster centroid references in `scoreAllClusters` and `recommendationWorkflow`
2. EmbeddingGemma produces the query vector
3. TurboVec returns the nearest three KMeans centroids
4. Qdrant performs cluster-filtered ANN
5. A global ANN lane remains active
6. Lexical results are merged
7. Neo4j expands at most two hops
8. The ranker scores all candidates (`scoreAllClusters` and `retrievalRouter` rank highly)
9. The graph path reaches `recommendationWorkflow`
10. The ACP packet remains within the token and file budgets
11. Gemma4 proposes a bounded Kanban task
12. Zod validates the proposal
13. The promotion gate determines whether it becomes PROPOSED

### Expected Evidence Path

```
scoreAllClusters CALLED_BY retrievalRouter
CALLS buildAcePacket
INVOKES_WORKFLOW recommendationWorkflow
```

### Smoke Assertions

- KMeans selected candidate neighborhoods but did not produce the final answer
- Exact lexical candidates survived cluster filtering
- Graph traversal stayed within two hops
- No candidate lacked `tree_node_id`
- No graph edge lacked `evidence_ref`
- All model and snapshot versions matched
- PageRank contributed as a feature, not as authority
- ACP packet stayed below 12,000 estimated tokens
- No more than eight source files were included
- Task was not created before promotion gate evaluation

---

## 15. Failure Path Smoke Tests

The system must also provide degraded state proofs.

### Centroid Cache Unavailable

**Expected**: Cluster lane DEGRADED, global ANN ACTIVE, lexical lane ACTIVE, graph lane ACTIVE, request succeeds with warning

### Qdrant Unavailable

**Expected**: Dense & sparse lanes UNAVAILABLE, ripgrep ACTIVE, Neo4j expansion from lexical seeds ACTIVE, recommendation confidence reduced, task promotion requires review

### Neo4j Unavailable

**Expected**: Semantic and lexical retrieval succeeds, graph features marked unavailable, no invented zero-distance graph features, task may proceed only when graph evidence is not required

### Stale KMeans Model

**Expected**: Cluster filtering blocked, global ANN fallback used, KMEANS_MODEL_STALE evidence emitted

### Summary Hash Mismatch

**Expected**: Summary excluded, exact source reloaded, summary regeneration job emitted

### Ranker Unavailable

**Expected**: Versioned RRF fallback, fallback model ID recorded, probability field omitted or explicitly uncalibrated

---

## 16. Implementation Order (10 Phases)

### Phase 1: Identity and Schema Authority

**Implement first** — This is the foundation for all downstream phases.

- TreeNodeIdentitySchema: canonical Postgres tables and uniqueness constraints
- Cross-store identity parity verifier
- Corpus and embedding manifest references
- Explicit naming rules for `kmeans_cluster_id`, `community_id`, `domain_class`, `tree_node_id`

**Exit gates**:
- `IDENTITY_STABLE`
- `CROSS_STORE_IDENTITY_PROVEN`

### Phase 2: KMeans Routing

- Centroid manifest assignment writer
- Query-to-centroid router (nearest three selection)
- Global ANN fallback
- Routing budget and telemetry

**Exit gates**:
- `KMEANS_ASSIGNMENT_PROVEN`
- `KMEANS_ROUTING_PROVEN`
- `ROUTING_RECALL_ACCEPTABLE`

### Phase 3: Lexical Candidate Lane

- `rg --json` runner
- JSON parser + path exclusions
- Match to tree node resolution
- Candidate deduplication
- Lexical candidate merge

**Exit gates**:
- `LEXICAL_CANDIDATES_PROVEN`
- `LEXICAL_ANN_MERGE_PROVEN`

### Phase 4: Graph Projection

- Canonical edge evidence table
- Neo4j projector + parity verifier
- PageRank and Leiden jobs
- Feature write-back to Postgres
- Stale projection detection

**Exit gates**:
- `GRAPH_PROJECTION_PROVEN`
- `GRAPH_FEATURE_WRITEBACK_PROVEN`

### Phase 5: Hierarchical Summaries

- Symbol summaries
- File summaries
- Module and subsystem summaries
- Parent-child summary links
- Summary vector indexing
- Summary-to-source resolution

**Exit gates**:
- `SUMMARY_HIERARCHY_PROVEN`
- `COARSE_TO_FINE_RETRIEVAL_PROVEN`

### Phase 6: Bounded Multi-Hop Retrieval

- Relationship allowlist
- Two-hop traversal
- Cycle detection
- Node budget + hop penalty
- Source and snapshot validation

**Exit gates**:
- `GRAPH_EXPANSION_PROVEN`
- `MULTIHOP_BOUNDING_PROVEN`

### Phase 7: Recommendation Features and Ranker

- Feature envelope
- Hand-tuned baseline
- Logistic regression baseline
- Gradient correctness test
- XGBoost comparison
- Probability calibration
- Evaluation tables

**Exit gates**:
- `FEATURE_CONTRACT_PROVEN`
- `RANKER_EVALUATED`
- `PROBABILITY_CALIBRATED`

### Phase 8: ACP Packet and Gemma4

- Bounded packet schema
- Evidence resolution
- Token estimation
- Path and permission budgets
- Gemma4 structured output schema
- Malformed output rejection

**Exit gates**:
- `ACP_PACKET_PROVEN`
- `GEMMA4_OUTPUT_VALIDATED`

### Phase 9: Kanban Promotion

- Duplicate detection
- Evidence completeness scoring
- Actionability rules
- Acceptance criteria validation
- Permission gate
- PROPOSED task creation
- Human or policy approval

**Exit gates**:
- `TASK_GATE_PROVEN`
- `KANBAN_PROPOSAL_PROVEN`

### Phase 10: Mastra LangGraph Orchestration

- Workflow checkpoint
- Retry and resume
- Approval suspension
- Task claim lease
- Event recording
- Corpus snapshot pinning
- Tool call budget enforcement

**Exit gates**:
- `WORKFLOW_CHECKPOINT_PROVEN`
- `WORKFLOW_RESUME_PROVEN`
- `AGENT_TOOL_BOUNDARY_PROVEN`

---

## 17. Initial Test Command Structure

```bash
# Run tests for each phase
npm run test:atlas:identity       # Phase 1
npm run test:atlas:kmeans         # Phase 2
npm run test:atlas:lexical        # Phase 3
npm run test:atlas:graph          # Phase 4
npm run test:atlas:summaries      # Phase 5
npm run test:atlas:multihop       # Phase 6
npm run test:atlas:ranker         # Phase 7
npm run test:atlas:acp            # Phase 8
npm run test:atlas:kanban         # Phase 9
npm run test:atlas:workflow       # Phase 10

# Run all tests
npm run test:atlas:all
```

### Recommended Test Layout

```
tests/atlas/
  fixtures/
    cluster-routing-repo/
    centroid-manifest.json
    graph-edges.json
    evaluation-queries.jsonl
  identity/
  kmeans/
  routing/
  lexical/
  graph/
  summaries/
  multihop/
  ranker/
  acp/
  kanban/
  workflow/
  smoke/
```

---

## 18. Definition of Done

The implementation is not complete until these statements are supported by test evidence:

1. **KMeans reduces candidate search space without becoming an authority** — A candidate outside selected KMeans clusters can still win through global ANN, exact lexical evidence, or graph evidence.

2. **Semantic clusters, graph communities, domains, and syntax identities are stored in separate typed fields** — Not conflated or overwritten.

3. **Every recommendation can be traced to tree nodes, source hashes, summaries, graph edges, feature values, model versions, and a corpus snapshot** — Full provenance chain.

4. **Neo4j PageRank, communities, and paths are derived features** — Written back to Postgres with projection provenance. Not used directly for ranking without feature encapsulation.

5. **TurboVec accelerates centroid routing and scoring** — But does not own canonical point or source identity.

6. **Qdrant remains the durable semantic retrieval projection** — Mirroring Postgres pgvector chunks, not replacing them.

7. **The ACP packet is bounded by files, tokens, graph hops, permissions, and tool calls** — All budgets enforced before reaching Gemma4.

8. **Gemma4 cannot directly promote a recommendation into executable work** — Only propose. Promotion gate gates task creation.

9. **A Kanban task is created only after evidence, duplication, actionability, acceptance criteria, and permission gates pass** — Not automatically from score.

10. **Workflow checkpointing is proven independently** — From future neural network gradient checkpointing.

---

## Recommended Next Action

The first concrete implementation slice should cover:

1. **Identity parity**: TreeNodeIdentitySchema, Postgres uniqueness constraints, cross-store verifier
2. **KMeans routing**: Centroid assignment, nearest-three selection, global ANN fallback
3. **Lexical candidates**: `rg --json` runner, path resolution, deduplication
4. **One fixed end-to-end smoke query**: Validates the full retrieval flow

This slice establishes the contracts on which graph expansion, ranking, ACP transport, and Kanban promotion depend.

---

## Reference Documents

- `src/lib/schemas/clustering_validation_contract.ts` — KMeans validation schema
- `docs/ATLAS-ARCHITECTURE-DECISION-LANES-AND-CONTRACTS.md` — Lanes & contracts specification
- `memory/PHASE-COMPLETION-DEEP-AUDIT-SUMMARY.md` — Current phase status (48% across 7 systems)
- `scripts/atlas/` — Implementation scripts and orchestration
