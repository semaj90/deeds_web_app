# Phase 8: Neo4j GDS + SOM Topology Reference

## Canonical Cypher Patterns for Phase 8

### 1. GDS Graph Projection (PageRank + Topology)

```cypher
-- Create graph projection on Packet nodes + SIMILAR_TOPOLOGY edges
CALL gds.graph.project(
  'codebaseGraph',
  'Packet',
  {
    SIMILAR_TOPOLOGY: { orientation: 'NATURAL' }
  }
)
YIELD nodeCount, relationshipCount
RETURN nodeCount, relationshipCount;
```

**What it does**: Projects all `Packet` nodes and their `SIMILAR_TOPOLOGY` relationships (SOM grid neighbors) into an in-memory graph for GDS algorithms.

**Expected output**: 
- `nodeCount`: ~58,304 (all packets)
- `relationshipCount`: ~8 × grid_cells (Moore neighborhood = 8 adjacencies per cell, border cells have fewer)

---

### 2. PageRank Stream (20 iterations, damping factor 0.85)

```cypher
-- Compute PageRank on the codebaseGraph projection
CALL gds.pageRank.stream('codebaseGraph', {
  maxIterations: 20,
  dampingFactor: 0.85
})
YIELD nodeId, score
WITH gds.util.asNode(nodeId) as node, score
SET node.pageRankScore = score
RETURN count(*) as nodeCount, 
       min(score) as minScore, 
       max(score) as maxScore, 
       avg(score) as avgScore;
```

**What it does**: Computes PageRank on the SOM topology graph. High scores = central/well-connected packets in the topology.

**Hard rule**: Write `pageRankScore` to Neo4j Packet nodes ONLY. No other store owns this value.

**Expected output**:
- `nodeCount`: ~58,304
- `avgScore`: 0.5-1.5 (typical PR range)

---

### 3. Shortest Path (A* informed search example)

Use this to find the best path between two packets via topology:

```cypher
-- Find shortest path from packet A to packet B through SIMILAR_TOPOLOGY edges
MATCH (start:Packet {packet_key: $startKey}),
      (end:Packet {packet_key: $endKey})
CALL gds.shortestPath.astar.stream('codebaseGraph', {
  sourceNode: start,
  targetNode: end,
  latitudeProperty: 'som_row',      -- SOM row as north-south coordinate
  longitudeProperty: 'som_col',     -- SOM col as east-west coordinate
  distanceProperty: 'distance'      -- Cost per edge (uniform = 1.0)
})
YIELD index, nodeIds, costs
RETURN index, 
       [nodeId in nodeIds | gds.util.asNode(nodeId).packet_key] as packetPath,
       costs;
```

**What it does**: Finds the shortest path through SOM topology using A* algorithm with SOM coordinates as heuristic. Faster than Dijkstra when you have good geometry hints.

**Why A***: SOM grid has spatial structure. A* uses `som_row` and `som_col` to estimate remaining cost to goal, making it faster than unguided Dijkstra.

---

### 4. Create SOM Topology Edges (Moore Neighborhood)

```cypher
-- Create SIMILAR_TOPOLOGY edges between SOM grid neighbors
-- Fetch all (row, col) pairs with packets
WITH COLLECT(DISTINCT {row: p.som_row, col: p.som_col})
  as cells
-- For each cell, find its 8 Moore neighbors and create edges
MATCH (p1:Packet), (p2:Packet)
WHERE p1.som_row IS NOT NULL AND p1.som_col IS NOT NULL
  AND p2.som_row IS NOT NULL AND p2.som_col IS NOT NULL
  -- Moore neighborhood: differ by at most 1 in each dimension
  AND abs(p1.som_row - p2.som_row) <= 1
  AND abs(p1.som_col - p2.som_col) <= 1
  AND (p1.som_row <> p2.som_row OR p1.som_col <> p2.som_col)
MERGE (p1)-[r:SIMILAR_TOPOLOGY {confidence: 0.95}]->(p2)
RETURN count(r) as edgesCreated;
```

**What it does**: Creates bidirectional `SIMILAR_TOPOLOGY` edges between all packets that are neighbors in the SOM grid (Moore neighborhood = 8 adjacent cells, including diagonals).

**Edge count**: For a 20×20 SOM grid with packets distributed:
- Corner cells (4): 3 neighbors each = 12 edges
- Edge cells (72): 5 neighbors each = 360 edges
- Interior cells (324): 8 neighbors each = 2,592 edges
- Total: ~2,964 edges (rough estimate, depends on packet distribution)

---

### 5. Louvain Community Detection (optional clustering)

```cypher
-- Detect communities in SOM topology using Louvain algorithm
CALL gds.louvain.stream('codebaseGraph', {
  maxIterations: 10,
  tolerance: 0.001,
  includeIntermediateCommunities: false
})
YIELD nodeId, communityId
WITH gds.util.asNode(nodeId) as node, communityId
SET node.louvainCommunity = communityId
RETURN count(*) as nodesUpdated,
       count(DISTINCT communityId) as communityCount;
```

**What it does**: Groups packets into communities based on SIMILAR_TOPOLOGY connectivity. Useful for hierarchical clustering on top of SOM.

---

### 6. Drop GDS Projection (cleanup)

```cypher
-- Clean up the in-memory graph projection
CALL gds.graph.drop('codebaseGraph')
YIELD graphName
RETURN graphName;
```

---

## Phase 8 Execution Order (with Neo4j Cypher)

### Step 3: Create SOM Topology Edges (if not already done)

```bash
# Via Cypher directly (one-time):
cypher-shell -u neo4j -p neo4j123 << 'EOF'
MATCH (p1:Packet), (p2:Packet)
WHERE p1.som_row IS NOT NULL AND p1.som_col IS NOT NULL
  AND p2.som_row IS NOT NULL AND p2.som_col IS NOT NULL
  AND abs(p1.som_row - p2.som_row) <= 1
  AND abs(p1.som_col - p2.som_col) <= 1
  AND (p1.som_row <> p2.som_row OR p1.som_col <> p2.som_col)
MERGE (p1)-[r:SIMILAR_TOPOLOGY {confidence: 0.95}]->(p2)
RETURN count(r) as edgesCreated;
EOF
```

### Step 4: Run PageRank (with Node.js wrapper)

```bash
npm run atlas:phase16:gds:apply
# Internally runs: compute-pagerank-neo4j.mjs
```

The script:
1. Projects graph: `CALL gds.graph.project(...)`
2. Streams PageRank: `CALL gds.pageRank.stream(...)`
3. Sets scores: `SET node.pageRankScore = score`
4. Caches top-100: Redis `couchdb:pagerank_scores`
5. Drops projection: `CALL gds.graph.drop(...)`

---

## Verification Queries

### Check PageRank scores populated

```cypher
MATCH (n:Packet)
WHERE n.pageRankScore IS NOT NULL
RETURN count(n) as scored,
       min(n.pageRankScore) as minScore,
       max(n.pageRankScore) as maxScore,
       avg(n.pageRankScore) as avgScore;
```

**Expected**: ~58,304 packets scored, avgScore 0.5-2.0

---

### Check SOM topology edges

```cypher
MATCH ()-[r:SIMILAR_TOPOLOGY]->()
RETURN count(r) as edgeCount;
```

**Expected**: ~2,000-3,000 edges (depending on SOM cell density)

---

### Check Louvain communities

```cypher
MATCH (n:Packet)
WHERE n.louvainCommunity IS NOT NULL
RETURN count(DISTINCT n.louvainCommunity) as communityCount,
       count(n) as packetCount;
```

---

### Find high-authority packets

```cypher
MATCH (n:Packet)
WHERE n.pageRankScore IS NOT NULL
RETURN n.packet_key, n.pageRankScore
ORDER BY n.pageRankScore DESC
LIMIT 20;
```

---

## Performance Notes

- **GDS graph projection**: ~5-10 seconds for 58K nodes + 2-3K edges
- **PageRank stream (20 iterations)**: ~10-15 seconds
- **Louvain community detection**: ~5-10 seconds
- **A* shortest path**: ~100-500ms per query (depends on path length)

**Memory usage**: GDS requires in-memory graph. ~2-4 GB for this dataset on RTX 3060 Ti.

---

## Hard Rules for Phase 8 Neo4j

1. **Use `toString(id(n))` not `n.stableKey`** — Packet nodes don't have stableKey, only Neo4j internal id()
2. **Write `pageRankScore` to Neo4j only** — Don't write to Postgres/Redis directly from Cypher
3. **Create SIMILAR_TOPOLOGY edges before PageRank** — PageRank algorithm needs the edges
4. **Use Moore neighborhood (8 adjacencies)** — Not Von Neumann (4 adjacencies), unless specified
5. **Drop GDS projections after use** — In-memory graphs consume memory until dropped
6. **Cache top-100 scores in Redis** — For fast ACE retrieval (Phase 9)

---

## Related Scripts

- `compute-pagerank-neo4j.mjs` — Full PageRank pipeline (create projection → stream → cache → cleanup)
- `create-som-topology-edges.mjs` — Create SIMILAR_TOPOLOGY edges from Postgres SOM coords
- `export-neo4j-gds-scores.mjs` — Export PageRank scores to JSON/CSV for analysis
- `backfill-gds-som-topology.mjs` — Sync SOM coords from Postgres to Neo4j Packet nodes
