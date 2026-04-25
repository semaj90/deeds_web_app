# ACE Contextual Engineering: RAG/KAG/DAG Architecture

## Overview

**ACE** = **A**utonomous **C**ontextual **E**ngineering
**Purpose**: Enhance Legal AI application with advanced RAG (Retrieval-Augmented Generation), KAG (Knowledge-Augmented Generation), and DAG (Directed Acyclic Graph) query planning.

**Date**: January 12, 2026
**Version**: Phase 97
**Status**: Architecture design + implementation roadmap

---

## Core Philosophy

### Traditional RAG (What We Have)
```
User Query → Vector Search → Retrieve Documents → LLM Generation → Answer
```

**Limitations**:
- No relationship awareness (documents exist in isolation)
- Single-hop retrieval (can't traverse connections)
- Static context window (all context loaded upfront)
- Linear execution (can't parallelize complex queries)

### ACE RAG/KAG/DAG (What We're Building)
```
User Query
  ↓
DAG Query Planner (decompose into subtasks)
  ↓
Parallel Execution:
  ├─ RAG: Vector Search (Qdrant)
  ├─ KAG: Knowledge Graph Expansion (PostgreSQL relationships)
  └─ DAG: Subtask orchestration
  ↓
Dynamic Context Injection (mid-stream)
  ↓
LLM Synthesis → Streaming Answer
```

**Advantages**:
- ✅ Relationship-aware (KAG connects entities)
- ✅ Multi-hop retrieval (traverse knowledge graph)
- ✅ Dynamic context (inject when needed, not upfront)
- ✅ Parallel execution (faster for complex queries)

---

## Architecture Layers

### Layer 1: RAG Foundation (Existing ✅)

**Components**:
```typescript
// Vector database
Qdrant: phase89_code_units collection
- 5000+ code units indexed
- nomic-embed-text-v1.5 embeddings (768 dimensions)

// Cache layer
Redis: glyph embeddings
- Error cluster vectors cached
- 5-minute TTL for hot paths

// Search service
/api/rag/search
- Semantic search via Qdrant
- Hybrid scoring (vector + keyword)
```

**Current Workflow**:
```typescript
// src/routes/api/rag/search/+server.ts
export const POST: RequestHandler = async ({ request }) => {
  const { query, topK = 10 } = await request.json();

  const results = await qdrant.search({
    collection: 'phase89_code_units',
    query: embedQuery(query),
    limit: topK
  });

  return json({ results });
};
```

---

### Layer 2: KAG Enhancement (New 🆕)

**Purpose**: Augment RAG results with knowledge graph relationships

**Database Schema**:
```sql
-- legal_ai_db: Entities and relationships
CREATE TABLE cases (
  id SERIAL PRIMARY KEY,
  title TEXT,
  user_id INTEGER REFERENCES users(id)
);

CREATE TABLE persons_of_interest (
  id SERIAL PRIMARY KEY,
  name TEXT,
  case_id INTEGER REFERENCES cases(id)
);

CREATE TABLE evidence (
  id SERIAL PRIMARY KEY,
  description TEXT,
  case_id INTEGER REFERENCES cases(id),
  person_id INTEGER REFERENCES persons_of_interest(id)
);

-- Relationship graph (explicit)
CREATE TABLE entity_relationships (
  id SERIAL PRIMARY KEY,
  entity_type_a TEXT,  -- 'case', 'person', 'evidence'
  entity_id_a INTEGER,
  relation_type TEXT,  -- 'mentions', 'supports', 'contradicts'
  entity_type_b TEXT,
  entity_id_b INTEGER,
  confidence FLOAT
);
```

**KAG Service**:
```typescript
// src/lib/ai/kag-service.ts
export class KnowledgeAugmentedGeneration {
  constructor(
    private qdrant: QdrantClient,
    private db: PostgresClient
  ) {}

  async augmentSearch(ragResults: VectorSearchResult[], hops = 2) {
    // Step 1: Extract entities from RAG results
    const entities = this.extractEntities(ragResults);
    // Example: [{ type: 'evidence', id: 42 }, { type: 'person', id: 7 }]

    // Step 2: Query knowledge graph for relationships
    const graph = await this.db.query(`
      WITH RECURSIVE entity_graph AS (
        -- Base case: Direct relationships
        SELECT entity_type_a, entity_id_a, relation_type,
               entity_type_b, entity_id_b, 1 as depth
        FROM entity_relationships
        WHERE (entity_type_a = ANY($1) AND entity_id_a = ANY($2))
           OR (entity_type_b = ANY($1) AND entity_id_b = ANY($2))

        UNION

        -- Recursive case: N-hop traversal
        SELECT r.entity_type_a, r.entity_id_a, r.relation_type,
               r.entity_type_b, r.entity_id_b, eg.depth + 1
        FROM entity_relationships r
        JOIN entity_graph eg ON (
          (r.entity_type_a = eg.entity_type_b AND r.entity_id_a = eg.entity_id_b)
          OR (r.entity_type_b = eg.entity_type_a AND r.entity_id_b = eg.entity_id_a)
        )
        WHERE eg.depth < $3
      )
      SELECT * FROM entity_graph;
    `, [
      entities.map(e => e.type),
      entities.map(e => e.id),
      hops
    ]);

    // Step 3: Merge RAG + KAG contexts
    return this.mergeContexts(ragResults, graph.rows);
  }

  private mergeContexts(ragResults, graphData) {
    return {
      documents: ragResults,
      knowledgeGraph: this.buildGraphStructure(graphData),
      augmentedPrompt: this.generateContextPrompt(ragResults, graphData)
    };
  }

  private generateContextPrompt(docs, graph) {
    return `
## Retrieved Documents
${docs.map(d => `- ${d.content}`).join('\n')}

## Knowledge Graph Context
${graph.map(r => `${r.entity_type_a}(${r.entity_id_a}) --[${r.relation_type}]--> ${r.entity_type_b}(${r.entity_id_b})`).join('\n')}

## Synthesis Instructions
Use both document content AND knowledge graph relationships to provide a comprehensive answer.
    `.trim();
  }
}
```

**API Endpoint**:
```typescript
// src/routes/api/kag/search/+server.ts
import { KnowledgeAugmentedGeneration } from '$lib/ai/kag-service';

export const POST: RequestHandler = async ({ request }) => {
  const { query, topK = 10, hops = 2 } = await request.json();

  const kag = new KnowledgeAugmentedGeneration(qdrant, db);

  // Step 1: RAG search
  const ragResults = await qdrant.search({
    collection: 'phase89_code_units',
    query: embedQuery(query),
    limit: topK
  });

  // Step 2: KAG augmentation
  const augmented = await kag.augmentSearch(ragResults, hops);

  return json(augmented);
};
```

---

### Layer 3: DAG Query Planning (New 🆕)

**Purpose**: Decompose complex queries into parallel subtasks

**Example Query Decomposition**:
```
User Query: "Analyze all evidence related to Person X and generate a case summary"

DAG Execution Plan:
                    ┌─────────────┐
                    │ Query Root  │
                    │ (User Query)│
                    └──────┬──────┘
                           │
      ┌────────────────────┼────────────────────┐
      │                    │                    │
┌─────▼─────┐        ┌────▼─────┐        ┌────▼─────┐
│ Subtask 1 │        │Subtask 2 │        │Subtask 3 │
│ RAG: Get  │        │KAG: Get  │        │DB: Get   │
│ Evidence  │        │ Person   │        │ Case     │
│ Docs      │        │ Relations│        │ Details  │
└─────┬─────┘        └────┬─────┘        └────┬─────┘
      │                   │                   │
      └────────┬──────────┴──────────┬────────┘
               │                     │
         ┌─────▼──────┐        ┌────▼─────┐
         │ Subtask 4  │        │Subtask 5 │
         │ Synthesize │        │ Format   │
         │ Findings   │        │ Report   │
         └─────┬──────┘        └────┬─────┘
               │                    │
               └─────────┬──────────┘
                         │
                   ┌─────▼──────┐
                   │   Final    │
                   │   Answer   │
                   └────────────┘
```

**DAG Service**:
```typescript
// src/lib/ai/dag-planner.ts
export class DAGQueryPlanner {
  constructor(
    private llm: LLMRouter,
    private kag: KnowledgeAugmentedGeneration
  ) {}

  async executeQuery(userQuery: string) {
    // Step 1: LLM decomposes query into subtasks
    const plan = await this.llm.complete({
      prompt: `
Decompose this query into executable subtasks:
"${userQuery}"

Return JSON:
{
  "subtasks": [
    { "id": "task1", "action": "rag_search", "query": "...", "dependencies": [] },
    { "id": "task2", "action": "kag_expand", "entityIds": [...], "dependencies": ["task1"] },
    { "id": "task3", "action": "synthesize", "dependencies": ["task1", "task2"] }
  ]
}
      `,
      model: 'gemini-2.0-flash-exp'
    });

    const tasks = JSON.parse(plan.text).subtasks;

    // Step 2: Build execution DAG
    const dag = this.buildDAG(tasks);

    // Step 3: Execute tasks in parallel (respecting dependencies)
    const results = await this.executeDAG(dag);

    return results;
  }

  private buildDAG(tasks: Task[]) {
    const nodes = new Map<string, DAGNode>();

    // Create nodes
    for (const task of tasks) {
      nodes.set(task.id, {
        task,
        dependencies: task.dependencies.map(id => nodes.get(id)!),
        executed: false,
        result: null
      });
    }

    return Array.from(nodes.values());
  }

  private async executeDAG(nodes: DAGNode[]) {
    const results = new Map<string, any>();

    // Topological sort + parallel execution
    const ready = nodes.filter(n => n.dependencies.length === 0);

    while (ready.length > 0) {
      // Execute all ready tasks in parallel
      const batch = await Promise.all(
        ready.map(node => this.executeNode(node, results))
      );

      // Mark as executed
      batch.forEach((result, i) => {
        ready[i].executed = true;
        ready[i].result = result;
        results.set(ready[i].task.id, result);
      });

      // Find newly ready tasks
      ready.splice(0, ready.length,
        ...nodes.filter(n =>
          !n.executed &&
          n.dependencies.every(d => d.executed)
        )
      );
    }

    return results;
  }

  private async executeNode(node: DAGNode, context: Map<string, any>) {
    switch (node.task.action) {
      case 'rag_search':
        return await this.kag.qdrant.search({
          query: node.task.query,
          limit: 10
        });

      case 'kag_expand':
        return await this.kag.augmentSearch(
          context.get(node.dependencies[0].task.id),
          2 // hops
        );

      case 'synthesize':
        const allResults = node.dependencies.map(d =>
          context.get(d.task.id)
        );
        return await this.llm.complete({
          prompt: `Synthesize these results: ${JSON.stringify(allResults)}`,
          model: 'gemini-2.0-flash-exp'
        });

      default:
        throw new Error(`Unknown action: ${node.task.action}`);
    }
  }
}
```

**API Endpoint**:
```typescript
// src/routes/api/dag/query/+server.ts
import { DAGQueryPlanner } from '$lib/ai/dag-planner';

export const POST: RequestHandler = async ({ request }) => {
  const { query } = await request.json();

  const planner = new DAGQueryPlanner(llm, kag);
  const results = await planner.executeQuery(query);

  return json({ results });
};
```

---

### Layer 4: Streaming Context Injection (Enhancement 🔧)

**Current Problem**:
```typescript
// Existing streaming: All context loaded BEFORE streaming
const ragContext = await qdrant.search(query);  // 500ms
const stream = await llm.generateStream(query, ragContext);  // Streams

// User waits 500ms for context THEN sees first token
```

**ACE Solution - Dynamic Context Injection**:
```typescript
// Mid-stream context injection
const stream = new ReadableStream({
  async start(controller) {
    // 1. Start LLM streaming IMMEDIATELY
    const llmStream = await llm.generateStream(query, {
      onNeedContext: async (topic) => {
        // 2. LLM signals it needs context mid-stream
        const context = await qdrant.search(topic);
        return context;
      }
    });

    // 3. Stream tokens + context updates
    for await (const chunk of llmStream) {
      if (chunk.type === 'token') {
        controller.enqueue(`data: ${JSON.stringify(chunk)}\n\n`);
      } else if (chunk.type === 'needsContext') {
        // Fetch context in background, don't block streaming
        this.injectContextAsync(chunk.topic, controller);
      }
    }
  }
});
```

**Implementation**:
```typescript
// src/routes/api/chat/stream/+server.ts
export const GET: RequestHandler = async ({ url }) => {
  const query = url.searchParams.get('q') || '';

  const stream = new ReadableStream({
    async start(controller) {
      try {
        // ACE Pattern: Streaming + Dynamic RAG
        const llmStream = llmRouter.streamWithDynamicRAG(query, {
          onContextNeeded: async (topic) => {
            // Inject context mid-stream
            const ragResults = await qdrant.search(topic);
            const kagResults = await kag.augmentSearch(ragResults);

            controller.enqueue(
              `data: ${JSON.stringify({
                type: 'context',
                data: kagResults
              })}\n\n`
            );

            return kagResults.augmentedPrompt;
          }
        });

        for await (const chunk of llmStream) {
          controller.enqueue(`data: ${JSON.stringify(chunk)}\n\n`);
        }

        controller.close();
      } catch (error) {
        controller.enqueue(`data: ${JSON.stringify({
          type: 'error',
          error: error.message
        })}\n\n`);
        controller.close();
      }
    }
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive'
    }
  });
};
```

---

## Implementation Roadmap

### Phase 1: KAG Foundation (2 hours)
- [ ] Create `src/lib/ai/kag-service.ts`
- [ ] Add `entity_relationships` table to PostgreSQL
- [ ] Implement `augmentSearch()` with recursive CTE
- [ ] Create `/api/kag/search` endpoint
- [ ] Test with case/person/evidence relationships

### Phase 2: DAG Query Planning (3 hours)
- [ ] Create `src/lib/ai/dag-planner.ts`
- [ ] Implement LLM query decomposition
- [ ] Build DAG executor with topological sort
- [ ] Create `/api/dag/query` endpoint
- [ ] Test with complex multi-step queries

### Phase 3: Streaming Enhancement (1 hour)
- [ ] Add `onContextNeeded` callback to LLM router
- [ ] Implement mid-stream context injection
- [ ] Update `/api/chat/stream` to use dynamic RAG
- [ ] Test with Playwright SSE assertions

### Phase 4: Frontend Integration (2 hours)
- [ ] Create `src/lib/components/ai/KAGChat.svelte`
- [ ] Add knowledge graph visualization
- [ ] Show DAG execution progress
- [ ] Display context injection events

---

## Testing Strategy

### Unit Tests
```typescript
// src/lib/ai/kag-service.test.ts
describe('KnowledgeAugmentedGeneration', () => {
  it('should extract entities from RAG results', () => {
    const ragResults = [
      { content: 'Evidence #42 mentions Person #7' }
    ];
    const entities = kag.extractEntities(ragResults);
    expect(entities).toEqual([
      { type: 'evidence', id: 42 },
      { type: 'person', id: 7 }
    ]);
  });

  it('should perform 2-hop graph traversal', async () => {
    // Case → Person → Evidence
    const graph = await kag.augmentSearch(ragResults, 2);
    expect(graph.knowledgeGraph.hops).toBe(2);
  });
});
```

### Integration Tests
```typescript
// tests/kag-integration.spec.ts
test('KAG search returns augmented context', async ({ request }) => {
  const response = await request.post('/api/kag/search', {
    data: { query: 'evidence for assault', topK: 5, hops: 2 }
  });

  const data = await response.json();
  expect(data.documents).toHaveLength(5);
  expect(data.knowledgeGraph).toBeDefined();
  expect(data.augmentedPrompt).toContain('Knowledge Graph Context');
});
```

### E2E Tests
```typescript
// tests/phase97-kag-dag.spec.ts
test('DAG query execution', async ({ page }) => {
  await page.goto('/chat');

  await page.fill('textarea', 'Analyze all evidence for Case #1 and generate summary');
  await page.click('button:text("Send")');

  // Should show DAG execution progress
  await expect(page.locator('[data-testid="dag-progress"]')).toBeVisible();

  // Should show final synthesized answer
  await expect(page.locator('[data-testid="chat-message"]')).toContainText('Summary:');
});
```

---

## Performance Benchmarks

### Target Metrics

| Operation | Current | Target (ACE) | Improvement |
|-----------|---------|--------------|-------------|
| **RAG Search** | 200ms | 200ms | - |
| **KAG Augmentation** | N/A | 300ms | New feature |
| **DAG Planning** | N/A | 100ms | New feature |
| **Total (Simple Query)** | 200ms | 300ms | +100ms (acceptable) |
| **Total (Complex Query)** | 800ms (serial) | 400ms (parallel) | **-50%** ✅ |
| **Time to First Token** | 500ms | **50ms** | **-90%** ✅ |

**Key Win**: Time to First Token reduced from 500ms → 50ms via streaming-first approach

---

## ACE Loop: Self-Improvement

### Observability
```typescript
// src/lib/ai/ace-telemetry.ts
export class ACETelemetry {
  logQuery(query: string, plan: DAGPlan, results: Map<string, any>) {
    // Store in PostgreSQL for analysis
    db.query(`
      INSERT INTO ace_query_logs (query, plan, results, duration_ms)
      VALUES ($1, $2, $3, $4)
    `, [query, plan, results, Date.now() - startTime]);
  }

  async analyzePatterns() {
    // Monthly: Analyze common query patterns
    const patterns = await db.query(`
      SELECT query, COUNT(*) as freq
      FROM ace_query_logs
      WHERE created_at > NOW() - INTERVAL '30 days'
      GROUP BY query
      ORDER BY freq DESC
      LIMIT 100
    `);

    // Suggest optimizations (e.g., pre-compute common KAG paths)
    return this.generateOptimizations(patterns.rows);
  }
}
```

### Continuous Learning
```typescript
// src/lib/ai/ace-learner.ts
export class ACELearner {
  async learnFromFeedback(queryId: string, feedback: 'good' | 'bad') {
    const log = await db.query('SELECT * FROM ace_query_logs WHERE id = $1', [queryId]);

    if (feedback === 'bad') {
      // Decompose query differently next time
      await this.updateDecompositionStrategy(log.query, log.plan);
    } else {
      // Reinforce successful patterns
      await this.reinforcePattern(log.query, log.plan);
    }
  }
}
```

---

## Next Steps

1. **Test Current Streaming** (5 min)
   ```bash
   npx playwright test tests/phase97-streaming-test.spec.ts --reporter=list
   ```

2. **Implement KAG Service** (2 hours)
   - Start with `src/lib/ai/kag-service.ts`
   - Add entity extraction + graph traversal

3. **Build DAG Planner** (3 hours)
   - Implement query decomposition
   - Add parallel execution engine

4. **Enhance Streaming** (1 hour)
   - Add dynamic context injection
   - Test with complex queries

**Total ETA**: 6-7 hours for full ACE implementation

---

**Status**: ✅ Architecture Complete
**Next**: Run streaming tests and begin KAG implementation
