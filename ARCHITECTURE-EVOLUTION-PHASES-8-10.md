# Architecture Evolution: Phases 8-10 Roadmap

**Status**: Architectural vision frozen (Phases 6-7 execution unblocked)  
**Horizon**: Sessions 123-130 (post-production validation)

---

## Current Stable Architecture (Phase 6-7)

The following are production-ready and should change **only for bug fixes**:

| Component | Status | Rationale |
|-----------|--------|-----------|
| Multi-signal retrieval engine | ✅ Stable | 4-lane RRF proven in A/B test (16.62% faster) |
| RRF fusion | ✅ Stable | Weight distribution validated (0.40/0.30/0.20/0.10) |
| Keyword extraction | ✅ Stable | 26.8K unique, 100% coverage, BM25 indexed |
| Feature flag routing | ✅ Stable | Probabilistic canary logic wired end-to-end |
| Canary/rollback tooling | ✅ Stable | 2-minute rollback validated, npm scripts ready |
| A/B benchmark harness | ✅ Stable | 20-query test corpus, recall/latency/diversity gates |
| Operational runbook | ✅ Stable | Phase 6-7 discipline documented (11 sign-off gates) |

**These layers form the production foundation.**

---

## Architecture Evolution Timeline

### Phase 6-7: Production Validation (Sessions 123-124)

**Scope**: Prove stable operation under live traffic  
**Unfreeze**: Only for emergency bug fixes  
**Deliver**: 24h soak test report, production sign-off

---

### Phase 8: Semantic Packet & Ontology Enrichment (Sessions 125-127)

**Problem**: Current retrieval returns flat chunks. Context is expensive to reconstruct.

**Solution**: Semantic packet generation (your Phase 3b.2 work extended to production scale)

#### 8.1 Semantic Object Generation

Move from:
```
file → chunk → embedding
```

To:
```
document → semantic_object → ontology_node → tree_node → packet
         ↓
         embedding
```

**Semantic object includes:**
- Identity (packet_key, source_ref, feature_id)
- Title (derived from feature_label → summary → domain:feature_id)
- Domain classification (content-based via keyword matching)
- Tree hierarchy (workspace/repository/module/feature/packet)
- Keywords (from ontology + summary)
- API signatures (for implementation search)
- Topology signals (SOM cluster, KMeans, community, authority)

**Production scale:** 58,365 packets → deterministic semantic objects → Postgres enrichment

**Deliverable:**
- `semantic-packet-generator.ts` (extends phase3b2-semantic-splitter-pipeline.mjs)
- Postgres schema: `atlas_semantic_packets` (JSONB + indexed fields)
- npm script: `atlas:phase8:semantic:generate:{dry,apply}`

#### 8.2 Formalized Tree Hierarchy

Canonicalize the containment hierarchy:

```
Workspace
  ↓ (repositories)
Repository
  ↓ (modules)
Module
  ↓ (features)
Feature (Semantic Object)
  ↓ (packets)
Packet
  ↓ (embeddings)
Embedding
```

**Key insight:** Embedding is a property of the packet, not its identity.

**Schema:**
```sql
CREATE TABLE workspace (
  workspace_id uuid PRIMARY KEY,
  name text,
  created_at timestamp
);

CREATE TABLE repository (
  repository_id uuid PRIMARY KEY,
  workspace_id uuid REFERENCES workspace,
  name text,
  source_url text
);

CREATE TABLE module (
  module_id uuid PRIMARY KEY,
  repository_id uuid REFERENCES repository,
  path text,
  kind text  -- 'directory', 'file', 'package'
);

CREATE TABLE feature_semantic (
  feature_id text PRIMARY KEY,
  module_id uuid REFERENCES module,
  feature_label text,
  domain text,
  subdomain text,
  summary text,
  ontology_tuples jsonb,
  authority real,
  created_at timestamp
);

CREATE TABLE packet (
  packet_key text PRIMARY KEY,
  feature_id text REFERENCES feature_semantic,
  tree_node_id text,
  identity_lane text,
  summary text,
  keywords text[],
  api_signatures text[],
  created_at timestamp
);

CREATE TABLE embedding (
  embedding_id uuid PRIMARY KEY,
  packet_key text REFERENCES packet,
  model text,  -- 'embeddinggemma'
  dimension int,  -- 384
  vector vector(384),
  created_at timestamp
);
```

**Deliverable:**
- `0110_formalized_tree_hierarchy.sql` (schema migration)
- `tree-hierarchy-backfill.mjs` (populate from existing data)
- npm script: `atlas:phase8:hierarchy:{audit,backfill:dry,backfill:apply}`

---

### Phase 8b: Multi-Space Retrieval Framework (Sessions 127-128)

**Problem:** Current RRF treats all signals equally. Doesn't expose retrieval strategy.

**Solution:** Formalize retrieval as a fusion of four orthogonal mathematical spaces.

#### Four Mathematical Spaces

**Space 1: Semantic (Dense Vectors)**
```
Dimension: 384-dim (embeddinggemma)
Search: Qdrant HNSW ANN
Signal: Vector cosine similarity
Strength: Captures semantic intent
Weakness: Exact keyword miss (e.g., "authentication" vs "OAuth")
```

**Space 2: Lexical (Sparse Text)**
```
Dimension: Bag-of-words
Search: Postgres trigram + BM25
Signal: Exact keyword match + TF-IDF ranking
Strength: Finds exact terminology
Weakness: No semantic understanding (e.g., "login" vs "session")
```

**Space 3: Topology (Graph Structure)**
```
Dimension: Graph edges + node properties
Search: Neo4j traversal + PageRank
Signal: Structural importance + neighborhood relationships
Strength: Captures architectural relationships
Weakness: Doesn't understand query intent (requires translation to graph)
```

**Space 4: Execution (Observational Telemetry)**
```
Dimension: Query history + user behavior
Search: Redis hot cache + frequency analysis
Signal: What users actually found useful (historical frequency)
Strength: Learns from collective usage
Weakness: Cold start problem (new queries have no history)
```

#### Multi-Space RRF

```typescript
interface RetrievalSpace {
  name: string;
  dimension: number;
  search(): Promise<Candidate[]>;
  normalizationStrategy: 'minmax' | 'zscore' | 'log';
}

const spaces: RetrievalSpace[] = [
  {
    name: 'Semantic',
    dimension: 384,
    search: () => qdrantSearch(query),
    normalizationStrategy: 'minmax'
  },
  {
    name: 'Lexical',
    dimension: 'unbounded',
    search: () => postgresSearch(query),
    normalizationStrategy: 'log'
  },
  {
    name: 'Topology',
    dimension: 'graph-based',
    search: () => neo4jSearch(query),
    normalizationStrategy: 'zscore'
  },
  {
    name: 'Execution',
    dimension: 'frequency-based',
    search: () => redisHotCacheSearch(query),
    normalizationStrategy: 'minmax'
  }
];

// RRF fuses all four spaces
const rffWeights = {
  semantic: 0.40,
  lexical: 0.30,
  topology: 0.20,
  execution: 0.10
};

function multiSpaceRRF(query, spaces, weights) {
  const results = spaces.map(space => ({
    space: space.name,
    candidates: space.search(),
    weight: weights[space.name.toLowerCase()]
  }));
  
  return rffFusion(results);
}
```

**Deliverable:**
- `multi-space-retrieval-framework.ts` (formalized space interface)
- Updated go-retrieval-facade.ts to explicitly route through all 4 spaces
- `MULTI-SPACE-RETRIEVAL-DESIGN.md` (architectural reference)

---

### Phase 9: OpenTelemetry & Adaptive Routing (Sessions 128-129)

**Problem:** RRF weights are static. No observability into where latency comes from. No learning from user feedback.

**Solution:** Instrument every request as an OTEL trace. Use traces to learn adaptive routing.

#### 9.1 Full Observability Stack

**OTEL Traces**: Every request becomes a distributed trace

```
User Query
  ├─ [SPAN] Dispatcher Decision
  │   ├─ identity_lane: 'canonical'
  │   ├─ domain: 'Retrieval'
  │   └─ latency_ms: 3
  │
  ├─ [SPAN] Identity Bitmap Gate
  │   ├─ quarantine_count: 0
  │   └─ latency_ms: 1
  │
  ├─ [SPAN] Semantic Search (Qdrant)
  │   ├─ space: 'semantic'
  │   ├─ dimension: 384
  │   ├─ candidates_returned: 64
  │   ├─ latency_ms: 18
  │   └─ attributes: [packet_key, tree_node_id, domain]
  │
  ├─ [SPAN] Lexical Search (Postgres)
  │   ├─ space: 'lexical'
  │   ├─ candidates_returned: 48
  │   ├─ latency_ms: 6
  │   └─ attributes: [packet_key, keyword_match_count]
  │
  ├─ [SPAN] Topology Search (Neo4j)
  │   ├─ space: 'topology'
  │   ├─ candidates_returned: 32
  │   ├─ latency_ms: 7
  │   └─ attributes: [packet_key, pagerank_score]
  │
  ├─ [SPAN] Execution Cache (Redis)
  │   ├─ space: 'execution'
  │   ├─ cache_hit: true
  │   ├─ latency_ms: 2
  │   └─ attributes: [packet_key, frequency_count]
  │
  ├─ [SPAN] RRF Fusion
  │   ├─ weight_semantic: 0.40
  │   ├─ weight_lexical: 0.30
  │   ├─ weight_topology: 0.20
  │   ├─ weight_execution: 0.10
  │   ├─ final_candidates: 10
  │   ├─ latency_ms: 2
  │   └─ attributes: [packet_key, rrf_rank, rrf_score]
  │
  └─ [SPAN] Gemma4 Synthesis (if in scope)
      ├─ model: 'gemma4-rotorquant'
      ├─ tokens_generated: 156
      ├─ latency_ms: 850
      └─ attributes: [packet_key, hallucination_detected]
```

**Each span carries attributes:**
- `packet_key`, `tree_node_id`, `domain`, `feature_id` (identity)
- `identity_lane` (canonical/recoverable/quarantine)
- `rrf_rank`, `rrf_score` (fusion results)
- `candidate_count` (retrieval width)
- `latency_ms` (per-hop timing)

**Langfuse Integration:**
- AI-layer visualization (query → reasoning → response)
- Model performance dashboard
- Hallucination detection

**Infrastructure Dashboard (separate from Langfuse):**
- OpenTelemetry Collector (OTEL protocol)
- Prometheus exporter (metrics)
- Grafana dashboard (timing + throughput)

**Deliverable:**
- `otel-instrumentation.ts` (trace initialization)
- `span-attributes.ts` (standardized attribute schema)
- `langfuse-exporter.ts` (AI layer export)
- `OTEL-INSTRUMENTATION-GUIDE.md`

#### 9.2 Adaptive Routing Foundation

**Collect feedback signals:**
```json
{
  "query": "authentication session validation",
  "trace_id": "...",
  "rrf_weights_used": [0.40, 0.30, 0.20, 0.10],
  "result_selected": 0,  // index of user's chosen result
  "result_was_correct": true,
  "user_accepted": true,
  "time_to_accept_ms": 2345,
  "hallucination_detected": false,
  "per_space_contribution": {
    "semantic": 0.42,
    "lexical": 0.31,
    "topology": 0.18,
    "execution": 0.09
  }
}
```

**Feedback collection:**
- Store every trace + feedback pair in Postgres
- Annotate with ground truth (accepted / rejected / helpful / misleading)
- Create a labeled dataset for learning

**Deliverable:**
- `feedback-collection.ts` (API endpoint for user feedback)
- `feedback_signals` table (Postgres)
- npm script: `atlas:phase9:feedback:{collect,audit}`
- **Note:** Actual adaptive routing RL training deferred to Phase 10

---

### Phase 10: Intelligent Context Assembly (Sessions 130+)

**Problem:** Every search result is isolated. Context must be reconstructed.

**Solution:** Semantic packets encode context automatically.

#### 10.1 Contextual Result Assembly

Move from:
```
Result 1: chunk text
Result 2: chunk text
Result 3: chunk text
↓ (reconstruct context)
```

To:
```
Result 1: Semantic Packet
  ├─ packet_key
  ├─ tree_node (workspace/repo/module/feature)
  ├─ domain
  ├─ related_packets (via Neo4j neighbors)
  ├─ embedding
  └─ context_summary

Result 2: Semantic Packet
  └─ (same rich structure)

↓ (context already available)
```

**Example:**

```json
{
  "packet_key": "ace:packet:auth:001",
  "feature_id": "auth.sessions",
  "tree_node": {
    "workspace": "deeds-web-app",
    "repository": "sveltekit-frontend",
    "module": "src/lib/server/auth",
    "feature": "Session Validation",
    "packet": "validateSession function"
  },
  "domain": "Authentication",
  "summary": "Validates Lucia session tokens...",
  "related_packets": [
    { "packet_key": "auth:002", "relation": "CALLS", "feature": "Session Refresh" },
    { "packet_key": "auth:003", "relation": "VALIDATES", "feature": "Token Expiry" }
  ],
  "embedding": [0.42, -0.18, ...],
  "rrf_rank": 1,
  "rrf_score": 0.98
}
```

#### 10.2 Parent Atlas Convergence

Once semantic packets are contextualized, Parent Atlas becomes powerful:

```
"Find all places where authentication sessions are used"
  ↓
Semantic search for feature: "auth.sessions"
  ↓
Packet: validateSession (auth:001)
  ├─ Related packets (via Neo4j): 23 packets
  ├─ Tree containment: all under /src/lib/server/auth
  ├─ Routes calling it: 7 API routes
  ├─ Tests covering it: 14 test cases
  ├─ Comments mentioning it: 8 locations
  └─ TypeScript types importing it: 12 files

Result: Complete context cluster, not scattered chunks
```

**Deliverable:**
- `semantic-packet-context-assembler.ts`
- Updated retrieval API to return full semantic packets
- Parent Atlas integration layer
- Example: "find all implementations of feature X" query becomes tractable

---

## Architectural Naming Refinement

### Current (Transitional)
```
"Multi-Vector Retrieval Engine"
```

### Proposed (Canonical, Sessions 125+)
```
"Multi-Signal Adaptive Retrieval Engine" (MARE)
```

**Rationale:** The system fuses:
- Dense vectors (semantic)
- Sparse text (lexical)
- Graph structure (topology)
- Query history (execution)
- Identity validation (safety)
- Telemetry feedback (adaptation)

"Multi-vector" undersells the architecture. "Multi-signal" is accurate.

---

## Summary: Stable vs. Evolving

| Layer | Status | Should Freeze After |
|-------|--------|-------------------|
| Core retrieval engine (4 lanes) | ✅ Stable | Phase 7 production sign-off |
| RRF fusion (weights 0.40/0.30/0.20/0.10) | ✅ Stable | Phase 7 production sign-off |
| Canary/rollback tooling | ✅ Stable | Phase 7 production sign-off |
| **Semantic packet generation** | 🟡 Evolving | After Phase 8 completion |
| **Tree hierarchy formalization** | 🟡 Evolving | After Phase 8 completion |
| **Multi-space framework** | 🟡 Evolving | After Phase 8b completion |
| **OTEL instrumentation** | 🟡 Evolving | After Phase 9 completion |
| **Adaptive routing** | 🔵 Future | Phase 10+ (requires ML training) |
| **Contextual assembly** | 🔵 Future | Phase 10+ (depends on 8-9) |

---

## Implementation Ordering

**Session 123-124: Phase 6-7 (Production Validation)**
- Execute canary ramp
- Run 24h soak test
- Collect baseline metrics
- Freeze retrieval engine

**Session 125-127: Phase 8 (Semantic Enrichment)**
- Generate semantic objects for 58K packets
- Formalize tree hierarchy
- Backfill Postgres with structured context
- Enable contextual retrieval

**Session 127-128: Phase 8b (Multi-Space Framework)**
- Formalize four mathematical spaces
- Route all searches through space abstraction
- Expose space contribution in traces
- Prepare for adaptive routing

**Session 128-129: Phase 9 (Observability)**
- Wire OTEL into all retrieval hops
- Export traces to Langfuse (AI) + Prometheus (infra)
- Collect user feedback signals
- Build dataset for adaptation

**Session 130+: Phase 10 (Adaptive Routing & Context)**
- Train adaptive routing policy from feedback
- Implement contextual packet assembly
- Integrate with Parent Atlas
- Enable "find implementations of feature" queries

---

## Go/No-Go: Architecture Frozen

**Phases 6-7 Core Retrieval:** ✅ FROZEN  
**Phases 8-10 Evolution Path:** ✅ DOCUMENTED  
**Session 123+ Roadmap:** ✅ CLEAR

This architecture scales from 4-lane RRF (Phases 6-7) to multi-signal intelligent retrieval (Phases 10+) without rework.

**Ready for production deployment + evolution planning.**
