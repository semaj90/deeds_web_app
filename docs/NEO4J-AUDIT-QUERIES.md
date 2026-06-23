# Neo4j SIMILAR_TOPOLOGY Audit — Query Execution Guide

**Date**: 2026-06-23 12:25 UTC
**Purpose**: P4 Phase 1.5 — Verify topology integrity before PageRank
**Status**: PENDING — Copy and execute in Neo4j Browser

---

## Neo4j Browser Access

1. Open browser: **http://localhost:7474**
2. Default auth: `neo4j` / `neo4j` (or your configured password)
3. Copy-paste each query below into the query editor

---

## Query 1: Edge Count

**Purpose**: Verify SIMILAR_TOPOLOGY edges exist and count them

```cypher
MATCH ()-[r:SIMILAR_TOPOLOGY]->()
RETURN count(r) AS edge_count;
```

**Expected Result**:
- Row with `edge_count` value
- Should be > 0 (has topology)
- For validation: typically 300–1000 edges in SOM cell graph

**Save as**: `neo4j_audit_edge_count`

---

## Query 2: Self-Loop Count

**Purpose**: Detect self-edges (a cell pointing to itself)

```cypher
MATCH (a)-[r:SIMILAR_TOPOLOGY]->(b)
WHERE a.cell_id = b.cell_id
RETURN count(r) AS self_loop_count;
```

**Expected Result**:
- `self_loop_count` = 0 (or very close to 0)
- Self-loops indicate topology design flaw
- Stop if this is > 10

**Save as**: `neo4j_audit_self_loops`

---

## Query 3: Isolated Node Count

**Purpose**: Find nodes with no incoming or outgoing SIMILAR_TOPOLOGY edges

```cypher
MATCH (n)
WHERE NOT (n)-[:SIMILAR_TOPOLOGY]-()
AND NOT ()-[:SIMILAR_TOPOLOGY]->(n)
RETURN count(n) AS isolated_node_count;
```

**Expected Result**:
- `isolated_node_count` = some number
- Stop if > 50% of total nodes (disconnected graph)
- For validation: typically 10–20% isolated is acceptable

**Save as**: `neo4j_audit_isolated_nodes`

---

## Query 4: Duplicate Edges

**Purpose**: Detect multiple SIMILAR_TOPOLOGY relationships between same cell pair

```cypher
MATCH (a)-[r:SIMILAR_TOPOLOGY]->(b)
WITH a.cell_id AS from_cell, b.cell_id AS to_cell, count(r) AS rel_count
WHERE rel_count > 1
RETURN from_cell, to_cell, rel_count
ORDER BY rel_count DESC
LIMIT 20;
```

**Expected Result**:
- Empty result (0 rows) = no duplicates ✅
- Any rows = duplicate edges exist ❌
- Stop if any duplicates found

**Save as**: `neo4j_audit_duplicate_edges`

---

## Query 5 (Optional): Total Node Count

**Purpose**: Get baseline for isolated node percentage

```cypher
MATCH (n)
RETURN count(n) AS total_nodes;
```

**Use for**: `isolated_node_count / total_nodes * 100 = isolation_percentage`

---

## Query 6 (Optional): Detailed Audit Report

**Purpose**: Get complete topology snapshot

```cypher
MATCH ()-[r:SIMILAR_TOPOLOGY]->()
WITH count(r) AS edge_count
MATCH (n)
WITH edge_count, count(n) AS total_nodes
MATCH (a)-[r:SIMILAR_TOPOLOGY]->(b)
WHERE a.cell_id = b.cell_id
WITH edge_count, total_nodes, count(r) AS self_loops
MATCH (n)
WHERE NOT (n)-[:SIMILAR_TOPOLOGY]-()
AND NOT ()-[:SIMILAR_TOPOLOGY]->(n)
RETURN {
  edge_count: edge_count,
  total_nodes: total_nodes,
  self_loops: self_loops,
  isolated_nodes: count(n),
  isolation_percent: ROUND(100.0 * count(n) / total_nodes, 2)
} AS audit_summary;
```

---

## How to Save Results

After running each query:

1. Click **JSON** tab (bottom right of results)
2. Copy the JSON output
3. Paste into `docs/reports/neo4j-similar-topology-audit.json` under the matching query
4. Keep the structure:

```json
{
  "timestamp": "...",
  "phase": "P4 Phase 1.5: Neo4j Topology Integrity",
  "checks": {
    "edge_count": {
      "query": "MATCH ()-[r:SIMILAR_TOPOLOGY]->() RETURN count(r)",
      "result": { "edge_count": 309 },
      "verdict": "PASS"
    },
    "self_loops": {
      "query": "...",
      "result": { "self_loop_count": 0 },
      "verdict": "PASS"
    },
    "isolated_nodes": {
      "query": "...",
      "result": { "isolated_node_count": 5, "total_nodes": 146, "isolation_percent": 3.4 },
      "verdict": "PASS"
    },
    "duplicate_edges": {
      "query": "...",
      "result": [],
      "verdict": "PASS"
    }
  },
  "verdict": "PASS - topology integrity verified",
  "status": "COMPLETE"
}
```

---

## Pass/Fail Criteria

| Query | Pass Condition | Fail Condition |
|-------|---|---|
| Edge count | > 0 | = 0 |
| Self-loops | = 0 or ≤ 2 | > 2 |
| Isolated nodes | ≤ 20% of total | > 20% |
| Duplicate edges | Empty result (0 rows) | Any rows present |
| **Overall** | All 4 PASS | Any 1 FAIL |

**Overall Verdict**: 
- **PASS**: All 4 checks pass → Can proceed to Phase 2 (PageRank)
- **FAIL**: Any check fails → Stop and repair topology before PageRank

---

## After Updating Report

Once all 4 queries complete and results are in the report:

1. **If all PASS**: 
   ```
   Phase 1.5 COMPLETE ✅
   → Proceed to Phase 2: Topology-Only PageRank
   → Script: (to be created) compute SOM cell PageRank
   ```

2. **If any FAIL**: 
   ```
   Phase 1.5 BLOCKED ❌
   → Repair topology (identify which query failed)
   → Re-run after repair
   → Do NOT proceed to PageRank
   ```

---

## Command to Monitor Progress

After each query, check the report file size:

```bash
wc -c docs/reports/neo4j-similar-topology-audit.json
```

Initially: ~600 bytes (placeholder)
After updating with results: ~1500–2000 bytes

---

## Slack Notification (Optional)

Once Neo4j audit completes:
```
✅ Neo4j SIMILAR_TOPOLOGY audit PASS
- Edge count: 309
- Self-loops: 0
- Isolated nodes: 3.4%
- Duplicates: 0
→ Ready for Phase 2 (PageRank)
```

---

**Next**: After completing all 4 queries and updating the report, file will be evidence for P4 Phase 2 decision gate.
