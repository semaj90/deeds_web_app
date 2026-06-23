# KAG Topology Ontology: 4D Manifold Routing + Query Patterns

**Status**: Research foundation for Knowledge-Augmented Generation (KAG) layer  
**Last Updated**: June 23, 2026 (Session 74+)  
**Parallel with**: P3g embedding backfill (4.5K→13.5K)

---

## 1. Topology Ontology: Linked Domain Topics

The 4D retrieval manifold maps packet discovery across four axes:

| Axis | Variable | Meaning | Algorithm | Index |
|------|----------|---------|-----------|-------|
| **X** | `x_cosine` | Semantic similarity (768-dim embeddings) | Cosine distance, HNSW | Qdrant HNSW |
| **Y** | `y_graph` | Graph connectivity / dependency depth | BFS, DFS, k-hops | Neo4j cypher, PageRank |
| **Z** | `z_som` | SOM cell/cluster neighborhood | K-means grid, SOM BMU | Redis cell cache, Postgres atlas_topology_index |
| **W** | `w_authority` | PageRank / Karpathy authority score | Eigenvalue iteration, GPU acceleration | Postgres atlas_higher_hop_index + libTorch GPU |

### Topology Ontology Structure

```
Domain (Root)
  ├─ Semantic Layer (X-axis)
  │   ├─ Dense Vector Space (768-dim)
  │   ├─ Sparse LSA/BM25 (keyword)
  │   ├─ Concept Hierarchy (onto graph)
  │   └─ Entity Types (person, code, statute, evidence)
  │
  ├─ Graph Layer (Y-axis)
  │   ├─ Direct References (imports, calls)
  │   ├─ Weak References (type uses, data flows)
  │   ├─ Document Hierarchy (file → module → package)
  │   └─ Cross-Domain Links (legal ↔ code)
  │
  ├─ Topology Layer (Z-axis)
  │   ├─ SOM Grid (20×20 = 400 cells)
  │   ├─ Cluster Membership (K-means, 272 clusters)
  │   ├─ BMU Neighborhood (8-connected grid neighbors)
  │   └─ Hierarchical Clustering (dendrogram levels)
  │
  └─ Authority Layer (W-axis)
    ├─ PageRank (directed edge weight)
    ├─ Betweenness Centrality (bridge importance)
    ├─ Karpathy Blend (0.4·PR + 0.3·attn + 0.3·auth)
    └─ Temporal Authority (freshness decay)
```

---

## 2. Query Patterns: RPC to Sparse Graph Algorithms

### Pattern 1: Dense Vector Search (X-axis only)

**When**: Fast, low-context queries ("find similar functions")

```typescript
// Query: "find me authentication functions"
// Latency: ~50ms (Qdrant HNSW)
// Hit rate: ~70% precision

const query = {
  type: "dense_vector",
  embedding: await embed("find me authentication functions", "embeddinggemma"),
  collection: "codebase_chunks_768",
  limit: 10,
  score_threshold: 0.75,
  metrics: "cosine"
};

// RPC payload
{
  "packet_rpc": {
    "lane": "dense_semantic",
    "x_cosine": 0.87,
    "y_graph": null,
    "z_som": null,
    "w_authority": null,
    "hits": [
      { "packet_key": "ace:packet:auth:001", "score": 0.87, "source": "dense_x" }
    ]
  }
}
```

### Pattern 2: Sparse BM25 Keyword Search

**When**: Exact phrase matching ("error handling in middleware")

```typescript
// Query: "error handling middleware"
// Latency: ~100ms (Postgres trigram + FTS)
// Hit rate: ~85% precision

const query = {
  type: "sparse_bm25",
  query: "error handling middleware",
  collections: ["codebase_chunks_768", "documents_atlas"],
  limit: 15,
  match_mode: "all_terms"
};

// RPC payload
{
  "packet_rpc": {
    "lane": "sparse_keyword",
    "x_cosine": null,
    "y_graph": null,
    "z_som": null,
    "w_authority": null,
    "hits": [
      { "packet_key": "ace:packet:error:042", "score": 0.91, "source": "sparse_bm25" }
    ]
  }
}
```

### Pattern 3: Single-Hop Graph Traversal (Y-axis)

**When**: Finding immediate dependencies ("what imports this module?")

```typescript
// Query: "all packages that import @deeds/parent-atlas"
// Latency: ~200ms (Neo4j 1-hop)
// Hit rate: ~100% (graph is authoritative)

const query = {
  type: "graph_1hop",
  start_node: "src/lib/server/db/client.ts",
  direction: "inbound",
  edge_types: ["IMPORTS", "USES", "REFERENCES"],
  limit: 50
};

// Cypher
MATCH (src:CodebaseFile)-[r:IMPORTS|USES|REFERENCES]->(target:CodebaseFile)
WHERE target.path = $path
RETURN src, r, target
ORDER BY r.confidence DESC
LIMIT 50;

// RPC payload
{
  "packet_rpc": {
    "lane": "graph_1hop",
    "x_cosine": null,
    "y_graph": 1,
    "z_som": null,
    "w_authority": null,
    "hits": [
      { "packet_key": "ace:packet:auth:001", "depth": 1, "edge_type": "IMPORTS", "source": "graph_1hop" }
    ]
  }
}
```

### Pattern 4: Multi-Hop BFS (Y-axis, bounded k)

**When**: Finding transitive dependencies ("what's reachable from this file in ≤3 hops?")

```typescript
// Query: "all code reachable from src/lib/ai/client-router.ts in ≤3 hops"
// Latency: ~500ms (Neo4j BFS with pruning)
// Hit rate: ~95% (heuristic pruning may miss rare paths)

const query = {
  type: "graph_khop",
  start_node: "src/lib/ai/client-router.ts",
  k_hops: 3,
  direction: "outbound",
  edge_types: ["IMPORTS", "CALLS", "USES"],
  max_results: 200
};

// Cypher (bounded BFS)
CALL apoc.path.expandConfig({
  startNode: $startNode,
  relationshipFilter: "IMPORTS|CALLS|USES",
  maxLevel: 3,
  limit: 200
})
YIELD path, node
RETURN path, node
ORDER BY apoc.path.len(path) ASC;

// RPC payload
{
  "packet_rpc": {
    "lane": "graph_khop",
    "x_cosine": null,
    "y_graph": 3,
    "z_som": null,
    "w_authority": null,
    "hits": [
      { "packet_key": "ace:packet:auth:042", "depth": 2, "path_length": 2, "source": "graph_khop" }
    ]
  }
}
```

### Pattern 5: SOM Cell + Neighborhood (Z-axis)

**When**: Finding topologically similar clusters ("packets in same SOM region")

```typescript
// Query: "all packets in SOM cells adjacent to (10, 12)"
// Latency: ~30ms (Redis cell cache)
// Hit rate: ~99% (exact grid lookup)

const query = {
  type: "som_neighborhood",
  cell_x: 10,
  cell_y: 12,
  radius: 1,  // 8-connected neighbors
  include_self: true
};

// Algorithm: Tricubic interpolation on 20×20 SOM grid
const neighbors = [
  { x: 9, y: 11 }, { x: 9, y: 12 }, { x: 9, y: 13 },
  { x: 10, y: 11 }, { x: 10, y: 12 }, { x: 10, y: 13 },
  { x: 11, y: 11 }, { x: 11, y: 12 }, { x: 11, y: 13 }
];

// RPC payload
{
  "packet_rpc": {
    "lane": "som_neighborhood",
    "x_cosine": null,
    "y_graph": null,
    "z_som": 1,
    "w_authority": null,
    "hits": [
      { "packet_key": "ace:packet:auth:001", "som_cell": "10,12", "distance": 0, "source": "som_exact" },
      { "packet_key": "ace:packet:auth:042", "som_cell": "9,12", "distance": 1, "source": "som_neighbor" }
    ]
  }
}
```

### Pattern 6: Authority Ranking (W-axis)

**When**: Finding influential packets ("most important for this query context")

```typescript
// Query: "top-10 most authoritative packets matching 'authentication'"
// Latency: ~300ms (Postgres blend + GPU rank)
// Hit rate: ~95% (GPU attention score variance)

const query = {
  type: "authority_rank",
  semantic_query: "authentication",
  blend_weights: {
    pagerank: 0.4,
    attention: 0.3,
    authority: 0.3
  },
  limit: 10
};

// SQL (Postgres + libTorch GPU rerank)
SELECT p.packet_key, p.summary,
  0.4 * p.pagerank_score +
  0.3 * p.attention_score +
  0.3 * p.authority_score AS blend_score
FROM atlas_packets p
WHERE p.packet_key = ANY($packet_keys)
ORDER BY blend_score DESC
LIMIT 10;

// RPC payload
{
  "packet_rpc": {
    "lane": "authority_rank",
    "x_cosine": null,
    "y_graph": null,
    "z_som": null,
    "w_authority": 0.92,
    "hits": [
      { "packet_key": "ace:packet:auth:001", "blend_score": 0.92, "source": "authority_rank" }
    ]
  }
}
```

### Pattern 7: Adaptive 4D Fusion (All axes)

**When**: Complex queries requiring multi-source ranking ("find security-critical authentication code that other modules depend on")

```typescript
// Query: semantic + graph + topology + authority fusion
// Latency: ~1.5s (parallel stages, GPU rerank)
// Hit rate: ~75% (fusion can miss niche combinations)

const query = {
  type: "fusion_4d",
  semantic_query: "authentication security",
  graph_hops: 2,
  som_radius: 2,
  authority_threshold: 0.5,
  fusion_weights: {
    x_cosine: 0.4,      // 40% semantic
    y_graph: 0.2,       // 20% graph dependency
    z_som: 0.15,        // 15% topology
    w_authority: 0.25   // 25% authority
  },
  limit: 20
};

// Stage 1: Dense semantic search (50ms, ~100 candidates)
// Stage 2: Graph expansion (2-hop BFS, 200ms, filter to ~50)
// Stage 3: SOM neighborhood filter (20ms, neighbor boost)
// Stage 4: GPU attention rerank (100ms, final sort)

// RPC payload
{
  "packet_rpc": {
    "lane": "fusion_4d",
    "x_cosine": 0.85,
    "y_graph": 2,
    "z_som": 1.5,
    "w_authority": 0.78,
    "stages": [
      { "stage": "dense_search", "duration_ms": 50, "candidates": 98 },
      { "stage": "graph_expansion", "duration_ms": 210, "candidates": 52 },
      { "stage": "som_filter", "duration_ms": 18, "candidates": 48 },
      { "stage": "gpu_rerank", "duration_ms": 120, "final_hits": 20 }
    ],
    "hits": [
      { "packet_key": "ace:packet:auth:001", "scores": { "x": 0.87, "y": 2, "z": 1.0, "w": 0.92 }, "final_score": 0.875 }
    ]
  }
}
```

### Pattern 8: DAG Shortest Path (Y-axis, multi-threaded)

**When**: Finding the shortest dependency chain between two modules

```typescript
// Query: "shortest path from src/lib/ai/client-router.ts to src/lib/server/db/client.ts"
// Latency: ~400ms (Dijkstra + multi-threaded Go retrieval engine)
// Hit rate: ~99% (graph is complete)

const query = {
  type: "dag_shortest_path",
  start: "src/lib/ai/client-router.ts",
  end: "src/lib/server/db/client.ts",
  direction: "outbound",
  edge_weights: {
    IMPORTS: 1.0,
    USES: 1.0,
    CALLS: 0.5
  }
};

// Go Retrieval Engine (multi-threaded Dijkstra)
// Pseudo-code:
// 1. Spawn N worker threads
// 2. Each explores a frontier of nodes
// 3. Share visited set via atomic counter
// 4. Merge results → shortest path

// RPC payload
{
  "packet_rpc": {
    "lane": "dag_shortest_path",
    "x_cosine": null,
    "y_graph": 4,
    "z_som": null,
    "w_authority": null,
    "path": [
      "src/lib/ai/client-router.ts",
      "src/lib/server/cache.ts",
      "src/lib/server/redis.ts",
      "src/lib/server/db/client.ts"
    ],
    "path_length": 3,
    "source": "dag_shortest_path"
  }
}
```

### Pattern 9: Tricubic SOM Search (Z-axis, interpolation)

**When**: Finding packets between grid cells (smooth neighborhood search)

```typescript
// Query: "packets near interpolated SOM position (10.5, 12.3)"
// Latency: ~40ms (tricubic interpolation)
// Hit rate: ~90% (extrapolation can miss boundary cases)

const query = {
  type: "som_tricubic",
  position: { x: 10.5, y: 12.3 },
  radius: 1.5,  // blend across neighbors
  limit: 20
};

// Algorithm: Tricubic interpolation
// f(x,y) = Σ Σ c[i][j] * (x-x0)^i * (y-y0)^j  for i,j ∈ [0,3]
// Blend 8 neighbor cells using cubic Hermite splines

// RPC payload
{
  "packet_rpc": {
    "lane": "som_tricubic",
    "x_cosine": null,
    "y_graph": null,
    "z_som": 1.5,
    "w_authority": null,
    "interpolation": {
      "base_cells": 4,
      "method": "cubic_hermite",
      "position": { "x": 10.5, "y": 12.3 }
    },
    "hits": [
      { "packet_key": "ace:packet:auth:001", "interpolated_distance": 0.2, "source": "som_tricubic" }
    ]
  }
}
```

### Pattern 10: Hybrid Sparse Graph + Dense (Y + X fusion)

**When**: Finding semantically similar code that's also on a dependency path

```typescript
// Query: "semantically similar error handlers that are upstream of my module"
// Latency: ~800ms (2 searches + intersection)
// Hit rate: ~60% (intersection can be small)

const query = {
  type: "hybrid_sparse_dense",
  semantic_query: "error handling",
  graph_direction: "inbound",
  graph_hops: 3,
  intersection_required: true,
  score_threshold: 0.7
};

// Stage 1: Dense semantic search → set A
// Stage 2: Graph 3-hop inbound → set B
// Stage 3: A ∩ B → result

// RPC payload
{
  "packet_rpc": {
    "lane": "hybrid_sparse_dense",
    "x_cosine": 0.82,
    "y_graph": 2,
    "z_som": null,
    "w_authority": null,
    "set_operations": {
      "semantic_candidates": 78,
      "graph_candidates": 34,
      "intersection": 8
    },
    "hits": [
      { "packet_key": "ace:packet:error:042", "source_x": 0.82, "source_y": 2, "source": "hybrid" }
    ]
  }
}
```

---

## 3. Agentic Dataset Building: LDR Knowledge Extraction

Extract domain knowledge from LDR (Local Deep Research) service to seed KAG:

### LDR → Knowledge Extraction Pipeline

```
LDR Research Task
  ↓ (query: "how to build authentication systems?")
Flask + Gemma4 + SearXNG
  ↓ (returns: summary + sources + metadata)
Chunk → Embed (768-dim)
  ↓
Qdrant chunks_web_search + Postgres research_summaries
  ↓
Extract Domain Tuples (LDR-to-domain mapping):
  • entity_type: [person, code, statute, evidence, technique]
  • domain_class: [auth, security, infra, frontend, legal, analysis]
  • concept_hierarchy: [root → parent → child]
  • semantic_tags: [keyword, keyword, ...]
  ↓
Seed KAG layer with domain facts
```

### Docker-based Dataset Builder

**Container**: `local-deep-research` (Flask + Gemma4)  
**Port**: 5000  
**RPC**: HTTP POST

```bash
# Extract knowledge via docker exec (agentic)
docker exec local-deep-research curl -X POST http://localhost:5000/api/research/start \
  -H "Content-Type: application/json" \
  -d '{"query": "how do SOM grids optimize nearest-neighbor search?", "max_iterations": 5}'

# Response: { "research_id": "12345", "status": "running" }

# Check status
docker exec local-deep-research curl http://localhost:5000/api/research/status/12345

# Export as knowledge tuple
# (domain_class: "topology", concept: "SOM_GRID", source: "ldr:12345", confidence: 0.87)
```

### Knowledge Tuple Schema

```typescript
interface KnowledgeTuple {
  tuple_id: string;           // hash(domain + concept + source)
  domain_class: "auth" | "infra" | "topology" | "legal" | ...;
  concept: string;            // "SOM_GRID", "PAGERANK", "DEPENDENCY_PATH"
  description: string;        // one-line explanation
  source_type: "ldr" | "codebase" | "graph" | "manual";
  source_ref: string;         // "ldr:12345" or packet_key
  confidence: number;         // 0.0-1.0
  semantic_embedding?: number[]; // 768-dim for similarity
  child_concepts?: string[];   // concept_hierarchy
  examples?: string[];        // code examples, query examples
  created_at: string;         // ISO timestamp
  refreshed_at: string;
}
```

### Agentic Dataset Building Command

```bash
# Via rg + docker + agentic dispatch
npm run kag:extract:ldr -- \
  --domain topology \
  --concepts SOM_GRID PAGERANK TRICUBIC_SEARCH \
  --max-results 500 \
  --output-format ndjson

# Pseudo-code:
# 1. For each concept, spawn LDR task: "explain CONCEPT"
# 2. Collect results into Redis queue: kag:pending:concepts
# 3. Worker loop: take task → fetch LDR result → extract tuples → insert Postgres
# 4. Index in Qdrant: kag_knowledge_vectors
```

---

## 4. Go Retrieval Engine: Multi-threaded DAG Search

**Why Go instead of Node.js?**
- **Goroutines** (lightweight threads, 100K+ concurrency)
- **BFS/DFS/Dijkstra** with native multi-threading (no event loop)
- **Fast path-finding** for DAG shortest-path queries
- **gRPC** for high-throughput RPC

### Architecture

```
SvelteKit (Node.js) HTTP
  ↓ POST /graph/dag-shortest-path
Go Retrieval Engine (port 50053)
  ├─ Worker Pool (8 goroutines)
  ├─ Shared visited map (atomic counter)
  ├─ BFS/Dijkstra frontier
  └─ Write results → response JSON
```

### Sample Go Pseudocode

```go
package main

import (
    "context"
    "sync"
    "sync/atomic"
)

type DagSearchRequest struct {
    Start string
    End   string
    MaxHops int
}

type Node struct {
    ID string
    Edges []Edge
}

type Edge struct {
    To string
    Weight float32
}

func DijkstraParallel(start, end string, maxHops int) ([]string, error) {
    // Frontier-based parallel Dijkstra
    visited := &sync.Map{}      // thread-safe visited set
    distance := &sync.Map{}     // node → distance
    predecessor := &sync.Map{}  // node → previous node
    frontier := make(chan string, 100) // work queue
    
    // Initialize
    distance.Store(start, 0.0)
    frontier <- start
    
    wg := &sync.WaitGroup{}
    for i := 0; i < 8; i++ {
        wg.Add(1)
        go func() {
            defer wg.Done()
            for node := range frontier {
                // Skip if visited
                if _, exists := visited.Load(node); exists {
                    continue
                }
                visited.Store(node, true)
                
                // Early exit if found
                if node == end {
                    return
                }
                
                // Explore neighbors
                for _, edge := range getEdges(node) {
                    newDist := getDistance(node) + edge.Weight
                    
                    oldDist, _ := distance.LoadOrStore(edge.To, newDist)
                    if newDist < oldDist.(float32) {
                        distance.Store(edge.To, newDist)
                        predecessor.Store(edge.To, node)
                        frontier <- edge.To
                    }
                }
            }
        }()
    }
    
    // Wait for workers
    close(frontier)
    wg.Wait()
    
    // Reconstruct path
    path := []string{end}
    current := end
    for current != start {
        prev, _ := predecessor.Load(current)
        path = append([]string{prev.(string)}, path...)
        current = prev.(string)
    }
    
    return path, nil
}
```

### Integration with SvelteKit

```typescript
// src/routes/api/graph/dag-shortest-path/+server.ts

import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ request }) => {
  const { start, end, maxHops } = await request.json();
  
  const response = await fetch('http://localhost:50053/dag/shortest-path', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ start, end, max_hops: maxHops })
  });
  
  const result = await response.json();
  return json(result);
};
```

---

## 5. HyperRAG Dense Search Integration

### Packet RPC → HyperRAG Dense Search Flow

```
Client Query
  ↓
Router (src/lib/server/ai/client-router.ts)
  ├─ Simple? → LOCAL ONNX (gemma270m)
  └─ Complex? → HyperRAG Dense
      ├─ Stage 1: Dense X-axis search (Qdrant HNSW, ~50ms)
      ├─ Stage 2: Y-axis graph expansion (1-2 hops, ~100ms)
      ├─ Stage 3: Z-axis SOM filter (Redis, ~20ms)
      ├─ Stage 4: W-axis authority rank (GPU, ~100ms)
      ├─ Stage 5: Fusion + rerank (20 results)
      ↓
      Gemma4 LLM (llama-server :8090)
        ├─ TurboQuant KV cache (q8_0/turbo3)
        ├─ Prompt cache warming
        └─ Answer + citations
      ↓
      Response (with packet_rpc trace)
```

### Sample HyperRAG Query Log

```json
{
  "query": "how should I implement error handling in async middleware?",
  "packet_rpc_trace": {
    "start_time": "2026-06-23T14:30:42Z",
    "lanes": [
      {
        "name": "dense_semantic",
        "latency_ms": 52,
        "candidates": 98,
        "threshold": 0.75,
        "passed": 18
      },
      {
        "name": "graph_expansion",
        "latency_ms": 108,
        "start_nodes": 18,
        "hops": 2,
        "candidates_expanded": 45
      },
      {
        "name": "som_filter",
        "latency_ms": 22,
        "cell_hits": 45,
        "neighborhood_boost": 0.05
      },
      {
        "name": "authority_rank",
        "latency_ms": 125,
        "gpu_rerank": true,
        "blend_weights": { "pr": 0.4, "attn": 0.3, "auth": 0.3 }
      },
      {
        "name": "fusion_final",
        "latency_ms": 35,
        "final_hits": 20,
        "hit_sources": {
          "dense": 12,
          "graph": 5,
          "authority": 3
        }
      }
    ],
    "total_latency_ms": 342,
    "cache_hit_rate": 0.15,
    "bifrost_L2_hit": false,
    "gemma4_inference_ms": 2850
  },
  "answer": "In async middleware, use try-catch within async functions...",
  "citations": [
    { "packet_key": "ace:packet:error:042", "relevance": 0.89 },
    { "packet_key": "ace:packet:async:071", "relevance": 0.87 }
  ]
}
```

---

## 6. Tools & Dependencies

### Required Services

| Service | Port | Type | Status |
|---------|------|------|--------|
| SvelteKit | 5173 | HTTP | ✅ |
| Qdrant | 6333 | gRPC/HTTP | ✅ |
| Postgres | 5432 | SQL | ✅ |
| Redis | 6379 | Cache | ✅ |
| Neo4j | 7687 | gRPC/Bolt | ✅ |
| Ollama (Gemma4) | 11434 | HTTP | ✅ |
| llama-server | 8090 | HTTP | ✅ |
| Go Retrieval | 50053 | gRPC | ⏳ (wip) |
| Local Deep Research | 5000 | HTTP | ⏳ (optional) |

### NPM Commands

```bash
# KAG Knowledge extraction
npm run kag:extract:ldr           # Extract domain tuples from LDR
npm run kag:build:ontology        # Build topology ontology
npm run kag:sync:qdrant           # Sync knowledge to Qdrant

# Query testing
npm run kag:test:dense            # Test X-axis dense search
npm run kag:test:graph            # Test Y-axis graph search
npm run kag:test:som              # Test Z-axis SOM search
npm run kag:test:authority        # Test W-axis authority rank
npm run kag:test:fusion:4d        # Test all-axes fusion

# Go Retrieval Engine
npm run go:retrieval:start        # Start Go service (port 50053)
npm run go:retrieval:test         # Test shortest-path queries
```

---

## 7. Next Steps

1. **[Current] Build LDR knowledge extraction** (Session 74+ parallel)
   - Seed KAG with domain tuples
   - Create ontology in Postgres `kag_knowledge_tuples` table
   - Index in Qdrant `kag_knowledge_vectors`

2. **Implement Go Retrieval Engine** (Session 75)
   - Multi-threaded Dijkstra
   - gRPC service on port 50053
   - Integration tests for DAG shortest-path

3. **Wire HyperRAG 4D Fusion** (Session 76)
   - Parallel stage execution
   - GPU attention reranking
   - End-to-end latency < 1.5s

4. **Benchmark & Optimize** (Session 77)
   - Measure hit rates per lane
   - Tune fusion weights
   - Cache hottest paths in Redis

---

## References

- **LDR Client**: `sveltekit-frontend/src/lib/server/analytics/ldr-client.ts`
- **LDR-ACE Bridge**: `sveltekit-frontend/src/lib/server/analytics/ldr-ace-bridge.ts`
- **Topology Index**: `atlas_topology_index` (Postgres, x_cosine/y_graph/z_som/w_authority columns)
- **Packet RPC**: `sveltekit-frontend/src/routes/api/hyperrag/packet-rpc.ts`
- **ACE Context Assembler**: `sveltekit-frontend/src/lib/server/ace/context-assembler.ts`
