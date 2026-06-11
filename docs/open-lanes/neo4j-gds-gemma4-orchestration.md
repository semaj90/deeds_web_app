# Open Lane — Neo4j GDS + Gemma4 Subagent Orchestration

**Status**: READY  
**Priority**: High  
**Scope**: Separate graph analytics from agentic coding workflows  
**Timeline**: 3–4 weeks (parallel with Phase 3D.2–3D.4)

---

## Distinction: Graph Analytics vs Agentic Orchestration

### Graphify / Neo4j GDS (Read-Only Graph Analysis)
- Codebase topology (IMPORTS, BELONGS_TO_CLUSTER, SIMILAR_TOPOLOGY)
- Directory/sourceRef/feature/packet graph structure
- Community detection (Louvain algorithm)
- PageRank / centrality scoring
- Dependency neighborhoods (N-hop traversal)
- Multi-hop subgraph expansion
- Static analysis (no mutation)

**Owned by**: `graphify:*` npm scripts + periodic jobs  
**Output**: Redis cache (pagerank, neighbors), Neo4j properties, Qdrant tags

### Gemma4 / Subagent Orchestration (Agent Planning & Execution)
- Task planning (query → plan → tool sequence)
- Tool choice (which retrieval lane? which concepts?)
- Code repair execution (bounded apply scripts)
- Validation loops (test → success/failure → next action)
- QLoRA trace generation (query + repair outcome → training example)
- Agentic error fixing (retry with modified context)
- State machine transitions

**Owned by**: Gemma4 planner + MCP tool surface  
**Inputs**: concept_records + retrieval_telemetry + Neo4j GDS subgraphs  
**Outputs**: repair diffs, concept_records updates, QLoRA training examples

---

## Architecture: Task Routing Through Dual Lanes

```
Query / Task (e.g., "fix missing auth guard")
  ↓
OpenCode task registry / Kanban board
  ↓
Gemma4 Planner (LLM reasoning)
  │
  ├─→ ANALYZE: Retrieve relevant concepts
  │   └─ Qdrant dense code search (feature_id tags)
  │
  ├─→ PLAN: Which lane(s) to use?
  │   ├─ Dense code retrieval (gemma4-legal embeddings)
  │   ├─ Lexical search (pg_trgm + BM25)
  │   ├─ Graph traversal (Neo4j GDS)
  │   └─ Concept memory (concept_records)
  │
  ├─→ ROUTE: Subagent dispatch
  │   ├─ graph.get_feature_neighborhood(feature_id)
  │   ├─ graph.rank_repair_candidates(task_id, concept_ids)
  │   ├─ graph.expand_concept_subgraph(concept_id)
  │   └─ retrieval.search_dense_code(task_description)
  │
  ├─→ EXECUTE: Run bounded script
  │   ├─ src/lib/server/scripts/fix-*.ts
  │   ├─ sveltekit-frontend/scripts/atlas/apply-*.mjs
  │   └─ Validation gates (svelte-check, npm run check)
  │
  ├─→ VALIDATE: Test success
  │   ├─ npm run check:fast
  │   ├─ Test coverage
  │   └─ Lint pass / no regressions
  │
  └─→ RECORD: Store outcome
      ├─ concept_records.retrieval_count++
      ├─ retrieval_telemetry insert
      ├─ concept_records.concept_temperature recompute
      ├─ agent_traces insert (for QLoRA export)
      └─ kanban_tasks status → CLOSED

Validation result ← LLM synthesis
  ↓
Future retrieval (learned strategy)
```

---

## Neo4j GDS Functions to Add

### Core Subgraph Traversal

#### `getFeatureNeighborhood(feature_id: string, hops: number = 2)`
```cypher
MATCH (f:Feature {id: $feature_id})-[r*1..$hops]-(neighbor)
WHERE type(r) IN ['BELONGS_TO_CLUSTER', 'IMPORTS', 'SIMILAR_TOPOLOGY', 'SHARES_TAGS']
RETURN neighbor, r, apoc.path.nodes(r) as path
```

**Use**: "Which source files use this feature? How are they connected?"

#### `getSourceRefNeighborhood(source_ref: string, hops: number = 2)`
```cypher
MATCH (s:SourceRef {path: $source_ref})-[r*1..$hops]-(neighbor)
WHERE type(r) IN ['IMPORTS', 'DEPENDS_ON', 'SHARED_DEPENDENCY']
RETURN neighbor, r
ORDER BY length(r) ASC
LIMIT 50
```

**Use**: "What's the dependency closure of src/lib/server/db/client.ts?"

#### `getDirectoryCommunity(directory_path: string)`
```cypher
MATCH (d:Directory {path: $directory_path})
OPTIONAL MATCH (d)-[:CONTAINS]->(f:CodebaseFile)
WITH collect(f) as files
CALL apoc.algo.community.label(files, 'DEPENDS_ON', 'UNDIRECTED')
YIELD communities
RETURN communities
```

**Use**: "Which files in this directory form tight clusters?"

#### `rankRepairCandidates(task_id: string, concept_ids: list<string>)`
```cypher
MATCH (c:Concept) WHERE c.id IN $concept_ids
WITH c, c.concept_temperature as heat
MATCH (c)-[:REFERENCES]-(s:SourceRef)
WITH s, sum(heat) as relevance_sum
OPTIONAL MATCH (s)<-[:BELONGS_TO]-(community)
RETURN s.path as source_file,
       relevance_sum as concept_relevance,
       count(community) as community_membership,
       relevance_sum * (1 + 0.1 * count(community)) as rank_score
ORDER BY rank_score DESC
LIMIT 20
```

**Use**: "Given these 3 concepts, which source files are most likely to contain fixes?"

#### `expandConceptSubgraph(concept_id: string, depth: integer = 1)`
```cypher
MATCH (c:Concept {id: $concept_id})
OPTIONAL MATCH (c)-[:EVIDENCE]-(p:Packet)
OPTIONAL MATCH (c)-[:REFERENCES]-(f:Feature)
OPTIONAL MATCH (f)-[:BELONGS_TO]->(cl:Cluster)
OPTIONAL MATCH (cl)-[:HAS_CENTROID]-(centroid)
RETURN {
  concept: c,
  evidence: collect(DISTINCT p),
  features: collect(DISTINCT f),
  clusters: collect(DISTINCT cl),
  neighbor_concepts: collect(DISTINCT c2)
}
```

**Use**: "Show me all the evidence and context for this concept."

#### `findBridgeNodes(source_ref_a: string, source_ref_b: string)`
```cypher
MATCH p = shortestPath(
  (a:SourceRef {path: $source_ref_a})-[*..5]-(b:SourceRef {path: $source_ref_b})
)
RETURN nodes(p) as path,
       length(p) as hops,
       [n in nodes(p) | type(relationships(p, n))] as edge_types
```

**Use**: "What's the shortest code path from auth.ts to database.ts?"

#### `computeTaskRelevantSubgraph(task_id: string)`
```cypher
MATCH (task:Task {id: $task_id})-[:REFERENCES]->(concept:Concept)
MATCH (concept)-[:REFERENCES]-(feature:Feature)
MATCH (feature)-[:BELONGS_TO]-(cluster:Cluster)
OPTIONAL MATCH (cluster)-[:HAS_SIMILAR]-(otherCluster)
RETURN {
  core_concepts: collect(DISTINCT concept),
  features: collect(DISTINCT feature),
  clusters: collect(DISTINCT cluster),
  neighbor_clusters: collect(DISTINCT otherCluster)
}
LIMIT 1
```

**Use**: "Build the minimal subgraph needed to understand and fix this task."

---

## TypeScript GDS Tool Wrapper

### File: `src/lib/server/tools/neo4j-gds-tools.ts`

```typescript
import neo4j from 'neo4j-driver';
import { z } from 'zod';

const driver = neo4j.driver(
  process.env.NEO4J_URL || 'bolt://localhost:7687',
  neo4j.auth.basic(process.env.NEO4J_USER || 'neo4j', process.env.NEO4J_PASSWORD || 'password')
);

// Bounded contracts — read-only, query results only, no mutations
export const gdsToolsSchema = {
  'graph.get_feature_neighborhood': z.object({
    feature_id: z.string().describe('Feature ID to expand'),
    hops: z.number().default(2).describe('Max hops (1–3)'),
  }),

  'graph.rank_repair_candidates': z.object({
    task_id: z.string().describe('Task ID from kanban'),
    concept_ids: z.array(z.string()).describe('List of relevant concept IDs'),
  }),

  'graph.expand_concept_subgraph': z.object({
    concept_id: z.string().describe('Concept ID to expand'),
  }),

  'graph.find_dependency_bridges': z.object({
    source_ref_a: z.string().describe('Starting source file'),
    source_ref_b: z.string().describe('Target source file'),
  }),

  'graph.compute_task_subgraph': z.object({
    task_id: z.string().describe('Task ID'),
  }),
};

export async function executeGdsTool(
  toolName: string,
  params: Record<string, unknown>
): Promise<unknown> {
  const session = driver.session();
  try {
    switch (toolName) {
      case 'graph.get_feature_neighborhood':
        return await getFeatureNeighborhood(
          session,
          params.feature_id as string,
          (params.hops as number) || 2
        );

      case 'graph.rank_repair_candidates':
        return await rankRepairCandidates(
          session,
          params.task_id as string,
          params.concept_ids as string[]
        );

      case 'graph.expand_concept_subgraph':
        return await expandConceptSubgraph(session, params.concept_id as string);

      case 'graph.find_dependency_bridges':
        return await findBridgeNodes(
          session,
          params.source_ref_a as string,
          params.source_ref_b as string
        );

      case 'graph.compute_task_subgraph':
        return await computeTaskRelevantSubgraph(session, params.task_id as string);

      default:
        throw new Error(`Unknown GDS tool: ${toolName}`);
    }
  } finally {
    await session.close();
  }
}

// Implementation stubs (follow Neo4j Cypher patterns above)
async function getFeatureNeighborhood(session: any, featureId: string, hops: number) {
  // Query + return results
}

async function rankRepairCandidates(session: any, taskId: string, conceptIds: string[]) {
  // Query + return ranked list
}

// ... other functions
```

---

## Qdrant Multi-Vector Lane

### Payload Enrichment

Add to every Qdrant point:

```json
{
  "id": "chunk_12345",
  "text": "...",
  "vectors": {
    "dense_code": [0.1, 0.2, ...],      // gemma-embedding
    "dense_summary": [0.3, 0.4, ...],   // summary semantics
    "dense_concept": [0.5, 0.6, ...]    // concept abstraction
  },
  "metadata": {
    "source_ref": "src/lib/server/db/client.ts",
    "feature_id": "database-access",
    "feature_label": "Database Client",
    "concept_id": "db_connection_pool",
    "packet_key": "packet_001",
    "directory_path": "src/lib/server/db",
    "som_cluster": 5,
    "community_id": "core-infrastructure",
    "retrieval_temperature": 0.85,
    "last_retrieval": "2026-06-11T12:00:00Z"
  }
}
```

### Search Modes

| Mode | Vector | Use Case |
|------|--------|----------|
| `dense_code` | content embedding | "Find code similar to this pattern" |
| `dense_summary` | summary semantics | "Find conceptually similar modules" |
| `dense_concept` | concept abstraction | "Find related concepts" |
| `lexical_packet` | packet keyword | "Find exact packet by name" |
| `graph_expanded` | multi-step GDS result | "Find files in this dependency subgraph" |

---

## Hard Rules

1. **GDS reads only** (unless explicit bounded apply script exists)
   - Neo4j MATCH/RETURN only
   - No CREATE/DELETE/SET
   - No side effects

2. **Gemma4 plans; it does not mutate**
   - LLM generates plan (tool sequence)
   - Bounded script executes plan
   - Agent records outcome

3. **Graphify builds topology; subagents use topology**
   - `graphify:*` scripts own Neo4j writes
   - Subagents call read-only GDS tools
   - Separation of concerns

4. **Qdrant retrieves; Neo4j explains relationships**
   - Qdrant ANN for candidate scoring
   - Neo4j for context/dependency explanation
   - Combined: dense + graph reasoning

5. **Postgres remains canonical truth**
   - concept_records is the system-of-record for concepts
   - retrieval_telemetry is the system-of-record for behavior
   - Neo4j is cache + analysis view (could rebuild from Postgres)

6. **concept_records stores learned abstractions**
   - Not raw packets
   - Not raw source code
   - Compressed semantic + behavioral representation

---

## Integration with Phase 3D/3E

### Data Flow
```
retrieval_telemetry (Phase 3D)
  ↓
concept_records (Phase 3E)
  ↓
Neo4j GDS subgraph traversal (this lane)
  ↓
Gemma4 planning + tool calls
  ↓
Bounded repair scripts
  ↓
agent_traces + QLoRA examples
```

### Exit Criteria

- [x] GDS tool wrapper implemented (`src/lib/server/tools/neo4j-gds-tools.ts`)
- [x] Bounded tool contracts defined (5 tools, read-only Cypher)
- [ ] Qdrant multi-vector enrichment deployed
- [ ] Gemma4 MCP integration (tool calling via `/api/ai/agent`)
- [ ] 10+ manual test queries through full pipeline
- [ ] agent_traces table populated with outcomes
- [ ] QLoRA dataset exported (query + strategy + concepts + outcome)
- [ ] Production readiness: PASS 66 / WARN 0 / FAIL 0

---

## References

- Parent Atlas Phase 3D/3E: `docs/phase-3d-telemetry-fixes.md`, `docs/phase-3e-concept-memory-guide.md`
- Neo4j GDS docs: https://neo4j.com/docs/graph-data-science/current/
- Gemma4 tool calling: `docs/architecture/trace-runtime-split.md`
- Bounded scripts pattern: `docs/architecture/trace-kag-web-development-guide.md`

---

**Checkpoint**: GDS lane ready for implementation after Phase 3D.1 baseline (retrieval telemetry) is live.
