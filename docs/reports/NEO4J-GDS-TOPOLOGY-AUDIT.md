# Neo4j GDS & Topology Audit — Session 74 Resolution

**Date**: 2026-06-23T22:20:00.000Z  
**Status**: Ready for Neo4j Browser verification

---

## Question 1: Did We Fix the Neo4j Audit Issue?

**Answer**: Not yet — the original audit deferred Neo4j due to missing direct driver. Now we have three paths:

### Path A: Neo4j Browser (No Auth Needed)
**URL**: http://localhost:7474  
**Status**: ✅ **AVAILABLE** (verified running)  
**Auth**: Default (neo4j/neo4j if first-time setup)  
**Effort**: 5 minutes manual queries

### Path B: Cypher HTTP API with Auth
**Endpoint**: http://localhost:7687 (bolt) or http://localhost:7474/db/neo4j/exec  
**Auth Required**: Yes (neo4j:neo4j)  
**Effort**: Scripting curl + auth headers

### Path C: Node.js Driver
**Package**: `neo4j-driver` (npm)  
**Effort**: 30 min to wire + test  
**Benefit**: Automation-friendly for scheduled audits

---

## Question 2: How Do We Build GDS Graphs?

**Answer**: Three-step process:

### Step 1: Project the Graph into Memory
```cypher
// Neo4j Browser — run this first
CALL gds.graph.project(
  'som_grid',                    // Graph name
  'Node',                        // Node label to include
  'SIMILAR_TOPOLOGY',           // Relationship type to include
  {
    relationshipProperties: ['weight', 'distance'],
    nodeProperties: ['som_row', 'som_col', 'som_index']
  }
)
YIELD graphName, nodeCount, relationshipCount
RETURN graphName, nodeCount, relationshipCount;
```

**Expected output**:
```
graphName: 'som_grid'
nodeCount: ~146 (SOM grid cells)
relationshipCount: ~309 (SIMILAR_TOPOLOGY edges)
```

### Step 2: Calculate PageRank on the Graph
```cypher
CALL gds.pageRank.stream('som_grid')
YIELD nodeId, score
WITH nodeId, score
MATCH (n) WHERE id(n) = nodeId
RETURN n.cell_id as cell_id, n.som_row, n.som_col, score
ORDER BY score DESC
LIMIT 10;
```

### Step 3: Write Results Back to Database
```cypher
CALL gds.pageRank.write('som_grid', {writeProperty: 'pageRank'})
YIELD nodePropertiesWritten, ranIterations
RETURN nodePropertiesWritten, ranIterations;
```

---

## Question 3: How Do We Do Topological Mapping with JSON Parsing?

**Answer**: Two approaches:

### Approach A: Cypher-to-JSON Export (Recommended)
```cypher
// Export SOM grid topology as JSON
MATCH (n:Node) WHERE n.som_row IS NOT NULL
WITH collect({
  cell_id: n.cell_id,
  som_row: n.som_row,
  som_col: n.som_col,
  som_index: n.som_index,
  pagerank: n.pagerank
}) as nodes,
  (MATCH ()-[r:SIMILAR_TOPOLOGY]->() RETURN collect({
    source: startNode(r).cell_id,
    target: endNode(r).cell_id,
    weight: r.weight
  }) as edges
)
RETURN apoc.convert.toJson({
  nodes: nodes,
  edges: edges,
  metadata: {
    grid_rows: 20,
    grid_cols: 20,
    timestamp: datetime.now()
  }
}) as topology_json;
```

**Output**: JSON parseable by Node.js:
```json
{
  "nodes": [
    {"cell_id": "som:0:0", "som_row": 0, "som_col": 0, "pagerank": 2.45},
    {"cell_id": "som:0:1", "som_row": 0, "som_col": 1, "pagerank": 1.89}
  ],
  "edges": [
    {"source": "som:0:0", "target": "som:0:1", "weight": 1.0},
    {"source": "som:0:1", "target": "som:1:1", "weight": 1.0}
  ],
  "metadata": {
    "grid_rows": 20,
    "grid_cols": 20
  }
}
```

**Node.js parsing**:
```typescript
import fs from 'fs';

// 1. Export from Neo4j (run above Cypher, save output as JSON)
const topologyJson = fs.readFileSync('./som_topology.json', 'utf8');
const topology = JSON.parse(topologyJson);

// 2. Index nodes by cell_id for O(1) lookup
const nodeMap = new Map(
  topology.nodes.map(n => [n.cell_id, n])
);

// 3. Build adjacency list for traversal
const adjacencyList = new Map();
for (const edge of topology.edges) {
  if (!adjacencyList.has(edge.source)) {
    adjacencyList.set(edge.source, []);
  }
  adjacencyList.get(edge.source).push({
    target: edge.target,
    weight: edge.weight
  });
}

// 4. Traverse topology (example: k-hop neighbors)
function getKHopNeighbors(cellId, k) {
  const visited = new Set();
  const queue = [[cellId, 0]]; // [cellId, depth]
  const neighbors = [];

  while (queue.length > 0) {
    const [current, depth] = queue.shift();
    if (depth > k || visited.has(current)) continue;
    visited.add(current);

    const node = nodeMap.get(current);
    neighbors.push({
      cell_id: current,
      distance: depth,
      pagerank: node.pagerank
    });

    if (depth < k && adjacencyList.has(current)) {
      for (const {target} of adjacencyList.get(current)) {
        queue.push([target, depth + 1]);
      }
    }
  }

  return neighbors;
}

// 5. Example: find top-K neighbors by PageRank
const topNeighbors = getKHopNeighbors('som:10:10', 2)
  .sort((a, b) => b.pagerank - a.pagerank)
  .slice(0, 10);
console.log('Top 10 neighbors:', topNeighbors);
```

### Approach B: Live Neo4j Queries (If JSON Export Not Available)
```typescript
// Use neo4j-driver for live queries
import neo4j from 'neo4j-driver';

const driver = neo4j.driver('bolt://localhost:7687', 
  neo4j.auth.basic('neo4j', 'neo4j')
);

async function getTopology() {
  const session = driver.session();
  
  // Query directly in TypeScript
  const result = await session.run(
    `MATCH (n:Node)-[r:SIMILAR_TOPOLOGY]-(m:Node)
     WHERE n.som_row IS NOT NULL
     RETURN {
       source: n.cell_id,
       target: m.cell_id,
       weight: r.weight,
       source_pagerank: n.pagerank,
       target_pagerank: m.pagerank
     } as edge
     LIMIT 1000`
  );

  const edges = result.records.map(r => r.get('edge'));
  
  // Build topology structure
  const topology = {
    edges,
    nodeCount: new Set(
      edges.flatMap(e => [e.source, e.target])
    ).size,
    edgeCount: edges.length
  };

  await session.close();
  return topology;
}
```

---

## Current Neo4j State (To Verify)

Run these queries in Neo4j Browser (http://localhost:7474):

### Query 1: Node Count and Distribution
```cypher
MATCH (n:Node) WHERE n.som_row IS NOT NULL
RETURN 
  count(n) as som_grid_nodes,
  min(n.som_row) as min_row,
  max(n.som_row) as max_row,
  min(n.som_col) as min_col,
  max(n.som_col) as max_col;
```

**Expected**: ~400 nodes (20×20 grid), som_row/col ranges 0-19

### Query 2: SIMILAR_TOPOLOGY Edge Count
```cypher
MATCH ()-[r:SIMILAR_TOPOLOGY]->()
RETURN 
  count(r) as edge_count,
  type(r) as relationship_type;
```

**Expected**: ~309 edges (grid adjacencies)

### Query 3: Self-Loop Check (Topology Health)
```cypher
MATCH (a)-[r:SIMILAR_TOPOLOGY]->(b) 
WHERE a.cell_id = b.cell_id
RETURN 
  count(r) as self_loop_count;
```

**Expected**: 0 (no self-loops in a valid grid)

### Query 4: Isolated Nodes (Connectivity)
```cypher
MATCH (n:Node) WHERE n.som_row IS NOT NULL
WHERE NOT (n)-[:SIMILAR_TOPOLOGY]-()
RETURN 
  count(n) as isolated_node_count,
  collect(n.cell_id) as isolated_cells LIMIT 5;
```

**Expected**: 0 (all grid cells connected)

### Query 5: PageRank Distribution
```cypher
MATCH (n:Node) WHERE n.pagerank IS NOT NULL
RETURN
  count(n) as nodes_with_pagerank,
  min(n.pagerank) as min_rank,
  max(n.pagerank) as max_rank,
  avg(n.pagerank) as avg_rank;
```

**Expected**: PageRank scores present, avg ~1.0 (normalized)

---

## Execution Plan (Next 30 min)

### Step 1: Neo4j Browser Audit (10 min)
1. Open http://localhost:7474
2. Run the 5 queries above
3. Screenshot results
4. Document findings

### Step 2: GDS Graph Creation (10 min)
1. Run `CALL gds.graph.project(...)` in Neo4j Browser
2. Run PageRank calculation
3. Verify results

### Step 3: JSON Export & Parsing (10 min)
1. Export topology to JSON (or run direct queries)
2. Parse in Node.js
3. Verify adjacency list works

---

## Integration with Metadata Searchability Fix

**Timeline**:
1. **Now (22:20)**: Complete metadata normalization (65 min) → done ~23:25
2. **Then (23:25)**: Run Neo4j topology queries (30 min) → done ~23:55
3. **Result**: Both searchability + topology ready for P4 GPU Authority Blend

**Why separate**:
- Metadata searchability = Qdrant payload normalization (independent)
- Neo4j topology = Graph structure verification (independent)
- Both enable P4, but neither blocks the other

---

## Success Criteria for Neo4j Section

**All must PASS**:
- ✅ Neo4j Browser responds (http://localhost:7474 loads)
- ✅ Query 1: ~400 SOM grid nodes detected
- ✅ Query 2: ~309 SIMILAR_TOPOLOGY edges
- ✅ Query 3: 0 self-loops (topology healthy)
- ✅ Query 4: 0 isolated nodes (fully connected grid)
- ✅ Query 5: PageRank scores present and normalized
- ✅ GDS projection succeeds and calculates PageRank
- ✅ JSON export parses without errors in Node.js

---

## Files Ready for Next Session

- `docs/reports/SESSION-74-COMPLETION-CHECKPOINT.md` — metadata audit summary
- `docs/reports/NEO4J-GDS-TOPOLOGY-AUDIT.md` — **this document**
- `docs/reports/METADATA-SEARCHABILITY-NEXT-STEPS.md` — execution plan

**Next**: Execute metadata fix + topology verification → P4 ready
