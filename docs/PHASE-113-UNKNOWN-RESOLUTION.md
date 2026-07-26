# Phase 113: Unknown Resolution Pipeline

**Date**: July 25, 2026 (planning phase)  
**Status**: 🚀 PHASE 111 COMPLETE | ⏳ PHASE 113 DESIGN READY  
**Timeline**: Days 2-14 (parallel with Phase 112 evaluation)

---

## Objective

Implement a multi-layer pipeline for handling unknown/ambiguous queries: observation → candidate generation → evidence gathering → promotion to resolved facts.

---

## The Unknown Resolution Problem

### Current Limitation (Phase 111)

Phase 108+ retrieval system has excellent coverage for **known facts** (61,659 indexed packets):
- ✅ When user asks "where is the auth middleware?" → found
- ✅ When user asks "what does caching do?" → found
- ❌ When user asks "what will happen if I change X?" → speculation needed
- ❌ When user asks "how should I fix this error?" → complex reasoning needed

### Unknown Query Types (Target for Phase 113)

1. **Counterfactual reasoning**: "What if we removed this module?"
2. **Error diagnosis**: "Why is this failing?" (requires tracing + evidence assembly)
3. **Architectural recommendations**: "Should we use caching here?" (requires domain knowledge)
4. **Cross-boundary analysis**: "How does A affect B?" (requires graph traversal + simulation)
5. **Future planning**: "What changes are needed for X?" (requires synthesis)

---

## 4-Stage Unknown Resolution Pipeline

### Stage 1: Observation (Fact Extraction)

**Input**: User query  
**Process**: Decompose question into observable facts

**Example**:
```
User: "Why is the auth middleware slow?"

Observable facts:
  1. Fact: auth middleware exists (known)
  2. Fact: auth middleware has X dependency (known)
  3. Observation: latency >threshold (can measure)
  4. Observation: cache hit rate <70% (can measure)
  5. Unknown: root cause (to be determined)
```

**Implementation**:
- Use Gemma4 to parse query into observable vs unknown facts
- Cross-reference known facts against Qdrant
- Identify measurement points for observable facts
- Flag unknowns for candidate generation

**Output**: Structured observation JSON
```json
{
  "query": "Why is the auth middleware slow?",
  "known_facts": [
    { "fact_id": "auth:middleware:exists", "confidence": 1.0 },
    { "fact_id": "auth:depends:redis", "confidence": 0.95 }
  ],
  "observable_facts": [
    { "metric": "auth_latency_p95", "current_value": 350, "threshold": 250 },
    { "metric": "cache_hit_rate", "current_value": 0.65, "threshold": 0.70 }
  ],
  "unknowns": [
    { "unknown_id": "auth:slow:root_cause", "type": "causal" }
  ]
}
```

### Stage 2: Candidate Generation

**Input**: Observation JSON + unknowns  
**Process**: Generate plausible candidates for unknown facts

**Candidates for "auth middleware slow"**:
1. **Candidate A**: Redis connection pooling is saturated
2. **Candidate B**: Database query in auth validation is unindexed
3. **Candidate C**: Cryptographic operation (bcrypt) not optimized
4. **Candidate D**: Network latency to external auth service
5. **Candidate E**: Concurrent request throttling

**Implementation**:
- Use Gemma4 + Neo4j graph traversal to generate candidates
- Search Qdrant for similar performance issues (transfer learning)
- Generate candidates from architectural patterns
- Score candidates by prior plausibility

**Candidate Scoring**:
```
score(candidate) = 
  0.4 · similarity_to_known_issues +
  0.3 · architectural_likelihood +
  0.2 · dependency_graph_proximity +
  0.1 · temporal_recency
```

**Output**: Ranked candidate list
```json
{
  "candidates": [
    {
      "id": "auth:redis:connection_pool_saturation",
      "description": "Redis connection pool exhausted by concurrent requests",
      "prior_probability": 0.45,
      "supporting_evidence": ["redis_timeout_errors", "high_concurrent_auth"],
      "contradicting_evidence": []
    },
    {
      "id": "auth:db:unindexed_query",
      "description": "Database query missing index on auth table",
      "prior_probability": 0.32,
      "supporting_evidence": ["slow_postgres_query", "large_user_table"],
      "contradicting_evidence": []
    },
    ...
  ]
}
```

### Stage 3: Evidence Gathering

**Input**: Ranked candidates  
**Process**: Gather evidence for/against each candidate

**Evidence Sources** (LDR integration):

1. **Static Code Analysis** (Qdrant + AST lane):
   - Search for Redis client configuration
   - Find connection pool size setting
   - Check if tuned for concurrent auth load

2. **Dynamic Metrics** (Prometheus/Grafana if available):
   - Redis connection pool utilization
   - Database query latency by table
   - Cryptographic operation timing

3. **Historical Issues** (Neo4j + prior cases):
   - Search for similar performance issues
   - Find resolved cases with same pattern
   - Extract resolution steps

4. **Comparative Analysis** (Qdrant semantic search):
   - Find best practices for auth middleware
   - Compare current implementation
   - Identify deviations

**Evidence Strength Scoring**:
```
strength(evidence) = 
  case evidence.type of:
    "measured_metric" → 0.95  (highest confidence)
    "code_finding" → 0.80
    "prior_case" → 0.60
    "best_practice_deviation" → 0.50
```

**Output**: Evidence dossier per candidate
```json
{
  "candidate": "auth:redis:connection_pool_saturation",
  "evidence_for": [
    {
      "type": "code_finding",
      "finding": "Connection pool size = 10, concurrent auth requests = 50",
      "strength": 0.80,
      "source": "src/lib/server/auth/redis-client.ts:42"
    },
    {
      "type": "prior_case",
      "case": "Session 140: Redis pool exhaustion under load",
      "resolution": "Increased pool size to 50",
      "strength": 0.60
    }
  ],
  "evidence_against": []
}
```

### Stage 4: Promotion to Resolved Fact

**Input**: Evidence-weighted candidates  
**Process**: Promote strongest candidate to resolved fact + store in KAG

**Promotion Decision**:
```
if max(evidence_score) > 0.75:
  promote_to_fact(best_candidate)
  confidence = max(evidence_score)
else:
  return "insufficient_evidence"
  request_human_adjudication()
```

**Promotion Action**:
1. Create fact entry in Postgres
2. Embed explanation in Qdrant
3. Add edge to Neo4j graph
4. Cache in Redis (24h TTL)
5. Emit NATS event for subscribers

**Output**: Resolved fact entry
```json
{
  "fact_id": "auth:slow:root_cause:resolved:session_142_q987",
  "original_query": "Why is the auth middleware slow?",
  "resolved_fact": "Redis connection pool saturation (size=10, load=50)",
  "confidence": 0.82,
  "evidence_count": 2,
  "created_at": "2026-07-26T12:34:56Z",
  "promotion_stage": "Stage 4: Promotion",
  "storage": ["postgres:unknown_resolutions", "qdrant:unknown_facts", "neo4j:inferred_edges"]
}
```

---

## LDR (Local Deep Research) Integration

### Current State

LDR tools available for evidence gathering:
- `ldr_search`: Semantic search on codebase
- `ldr_analyze`: Code pattern detection
- `ldr_compare`: Comparative analysis
- `ldr_trace`: Call graph traversal

### Phase 113 Additions

**New LDR tools for unknown resolution**:

1. **`ldr_evidence_gather`**:
   - Takes candidate + query
   - Returns ranked evidence (code + metrics + priors)
   - Scoring: dynamic + static + historical

2. **`ldr_hypothesis_test`**:
   - Takes hypothesis (candidate)
   - Tests against codebase (find contradictions)
   - Returns confidence score

3. **`ldr_resolution_similarity`**:
   - Takes unresolved query
   - Finds similar resolved cases
   - Returns applicable resolution steps

---

## Database Schema (New Tables)

### `unknown_observations`
```sql
CREATE TABLE unknown_observations (
  id uuid PRIMARY KEY,
  query text NOT NULL,
  known_facts jsonb,
  observable_facts jsonb,
  unknowns jsonb,
  created_at timestamp DEFAULT NOW(),
  user_id integer REFERENCES users(id)
);
```

### `unknown_candidates`
```sql
CREATE TABLE unknown_candidates (
  id uuid PRIMARY KEY,
  observation_id uuid REFERENCES unknown_observations(id),
  candidate_text text NOT NULL,
  prior_probability real,
  supporting_evidence jsonb,
  contradicting_evidence jsonb,
  created_at timestamp DEFAULT NOW()
);
```

### `unknown_evidence`
```sql
CREATE TABLE unknown_evidence (
  id uuid PRIMARY KEY,
  candidate_id uuid REFERENCES unknown_candidates(id),
  evidence_type text,
  finding text,
  strength real,
  source text,
  created_at timestamp DEFAULT NOW()
);
```

### `unknown_resolutions`
```sql
CREATE TABLE unknown_resolutions (
  id uuid PRIMARY KEY,
  original_query text NOT NULL,
  resolved_fact text NOT NULL,
  candidate_id uuid REFERENCES unknown_candidates(id),
  confidence real,
  evidence_count integer,
  storage_locations jsonb,
  created_at timestamp DEFAULT NOW(),
  user_id integer REFERENCES users(id)
);
```

---

## Execution Plan (Days 2-14)

### Days 2-4: Stage 1-2 Implementation (Observation + Candidates)

**Task**: Implement observation extraction + candidate generation  
**Deliverable**: Gemma4 prompts + Neo4j queries  
**Duration**: 8-12 hours

```typescript
// Pseudocode
async function generateCandidates(query: string): Promise<Candidate[]> {
  const observation = await extractObservation(query);  // Stage 1
  const known = await qdrantSearch(observation.known_facts);
  const candidates = await gemma4.generateCandidates(observation, known);
  return rankCandidates(candidates);
}
```

### Days 5-9: Stage 3-4 Implementation (Evidence + Promotion)

**Task**: Wire evidence gathering + promotion logic  
**Deliverable**: LDR integration + promotion scoring  
**Duration**: 12-16 hours

```typescript
// Pseudocode
async function promoteCandidate(candidate: Candidate): Promise<ResolvedFact> {
  const evidence = await ldrEvidenceGather(candidate);  // Stage 3
  const score = scoreEvidence(evidence);
  
  if (score > 0.75) {
    return await promoteFact(candidate, score);  // Stage 4
  } else {
    return { status: "insufficient_evidence", score };
  }
}
```

### Days 10-12: Testing & Validation

**Task**: Manual test on 20-30 unknown queries  
**Deliverable**: Test report + error analysis  
**Duration**: 8-10 hours

**Test Scenarios**:
1. "Why is auth slow?" → Should resolve to connection pool
2. "How to optimize caching?" → Should find best practices
3. "What if we remove middleware X?" → Should trace dependencies
4. "Why does this query fail?" → Should do error diagnosis
5. "Should we add feature Y?" → Should synthesize recommendation

### Days 13-14: Documentation & Readiness

**Task**: Document Phase 113 + prepare for Phase 114  
**Deliverable**: Phase 113 completion report  
**Duration**: 4-6 hours

---

## Success Criteria

✅ **Stage Implementation**:
- [ ] Stage 1 (Observation): Extracts known vs unknown facts
- [ ] Stage 2 (Candidates): Generates 3-5 ranked candidates per unknown
- [ ] Stage 3 (Evidence): Gathers 2+ evidence per candidate
- [ ] Stage 4 (Promotion): Promotes facts with >0.75 confidence

✅ **Integration**:
- [ ] LDR tools integrated and functional
- [ ] Unknown resolution table schema created
- [ ] Postgres ↔ Qdrant ↔ Neo4j ↔ Redis synchronized
- [ ] NATS events emitted on promotion

✅ **Accuracy**:
- [ ] Manual test accuracy >70% (human adjudication agrees)
- [ ] Confidence scores correlate with correctness
- [ ] Fallback to human review for <0.75 confidence

✅ **Performance**:
- [ ] End-to-end unknown resolution <5 seconds
- [ ] Candidate generation <1 second
- [ ] Evidence gathering <3 seconds

---

## Rollout to Production (Phase 113)

**After Phase 113 validation**:
1. Enable unknown resolution in `/api/unknown-resolution`
2. Log all resolutions (for Phase 114 improvement)
3. Track accuracy metrics (user feedback)
4. Prepare Phase 114 automation

---

## Expected Impact

**Before Phase 113**: User gets retrieval results (known facts only)  
**After Phase 113**: User gets results + explanations + inferred facts

Example:
```
Query: "Why is auth slow?"

Phase 111 Response:
  [Retrieval results for "auth middleware", "performance optimization", ...]

Phase 113 Response:
  [Retrieval results + UNKNOWN RESOLUTION]
  
  Inferred Fact:
  - Root cause: Redis connection pool saturation (confidence 0.82)
    Evidence: 
      1. Pool size = 10, concurrent load = 50
      2. Similar issue resolved in Session 140
    Recommendation: Increase pool size to 50-100
```

---

**Prepared by**: Claude Code (Session 142 Continuation)  
**Status**: ⏳ PHASE 113 DESIGN READY (Days 2-14)  
**Parallel Execution**: Concurrent with Phase 112 evaluation metrics
