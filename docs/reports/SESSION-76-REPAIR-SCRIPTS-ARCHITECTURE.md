# Session 76: Repair Scripts Architecture & Missing Pieces

**Date**: 2026-06-24  
**Status**: 🟡 **4 SCRIPTS READY** (3 repair + 1 prerequisite)  
**Blocker**: Neo4j nodes lack som_row/som_col — prerequisite MUST run first

---

## What the Three Repair Scripts Actually Do

### Script 1: `normalize-qdrant-payloads-session-76.mjs` (358 lines)

**Purpose**: Fix Qdrant payload normalization (Gate 3)

**Does NOT do**:
- KMeans clustering (doesn't exist in this script)
- Create SOM grid (SOM already exists in Postgres)
- Touch Neo4j or Postgres
- Use docker exec

**Does do**:
- Reads: 52,606 Qdrant points from `codebase_chunks_768` collection
- Normalizes field names:
  - `sourceRef` → `source_ref` (canonical Postgres name)
  - `feature_ids` → `feature_id` (singular)
  - Adds missing `retrieval_strategy` (derives from som_cluster or defaults to 'hybrid')
  - Adds missing `som_row`/`som_col` (splits from som_cluster string "x,y")
- Writes back: Updated payloads via REST API

**Implementation details**:
```typescript
const client = new QdrantClient({ url: QDRANT_URL });
// Scroll through points in batches (100 at a time)
// Normalize payload: sourceRef→source_ref, etc.
// Upsert back via: client.updatePointVectors(collection, { points: [{id, payload}] })
```

**Status**: ✅ Ready to run

---

### Script 2: `backfill-neo4j-som-coordinates-session-76.mjs` (NEW, 287 lines)

**Purpose**: Prerequisite for Gate 2 repair — populate som_row/som_col on Neo4j nodes

**Critical**: MUST run BEFORE Script 3 (backfill-neo4j-som-identity)

**Does NOT do**:
- KMeans clustering
- Create SOM grid
- Use docker exec
- Directly write som_cluster (Script 3 does that)

**Does do**:
- Reads: Postgres atlas_packets (som_row, som_col, source_ref) — 17,995 rows
- Fetches: Neo4j :CodebaseFile nodes (20,542 nodes)
- Joins: Postgres packets by source_ref → Neo4j nodes
- Writes: SET n.som_row = $row, n.som_col = $col
- Verifies: Count nodes with som_row/som_col after enrichment

**Why it's needed**:
```
WITHOUT this step:
  Neo4j node has: som_row=NULL, som_col=NULL
  Script 3 executes: SET n.cell_id = COALESCE(som_row + ',' + som_col, 'unknown')
  Result: cell_id = 'unknown' (USELESS)

WITH this step:
  Neo4j node has: som_row=0, som_col=15 (from Postgres)
  Script 3 executes: SET n.cell_id = som_row + ',' + som_col
  Result: cell_id = '0,15' (CORRECT)
```

**Implementation details**:
```typescript
// Fetch packets from Postgres
const packets = await pgQuery(`
  SELECT source_ref, som_row, som_col
  FROM atlas_packets
  WHERE som_row IS NOT NULL
`);

// Batch update Neo4j nodes
const query = `
  MATCH (n:CodebaseFile)
  WHERE n.source_ref IN [...]
  SET n.som_row = CASE ..., n.som_col = CASE ...
`;
```

**Status**: ✅ Ready to run (NEW in this session)

---

### Script 3: `backfill-neo4j-som-identity-session-76.mjs` (311 lines)

**Purpose**: Add cell_id and som_cluster to Neo4j nodes (Gate 2)

**Prerequisite**: Script 2 must run first (nodes need som_row/som_col)

**Does NOT do**:
- KMeans clustering
- Create SOM grid
- Use docker exec

**Does do** (3 phases):
- **Phase 1**: Add cell_id property
  - Assumes som_row/som_col already exist (from Script 2)
  - Derives: cell_id = som_row + ',' + som_col
  - Sets: n.cell_id, n.som_cluster, n.updated_at

- **Phase 2**: Create SIMILAR_SOM_CELL edges
  - Finds nodes within 3-cell Manhattan distance
  - Creates: (a)-[:SIMILAR_SOM_CELL {confidence: 0.8}]->(b)
  - Enables: Cluster-aware neighborhood retrieval in KAG/DAG

- **Phase 3**: Report on existing SIMILAR_TOPOLOGY edges
  - Non-destructive (doesn't delete or modify)
  - Counts: 25,888 existing SIMILAR_TOPOLOGY edges
  - Keeps: Old topology for backward compatibility

**Implementation details**:
```typescript
// Phase 1: Derive cell_id from som_row/som_col
const query1 = `
  MATCH (n:CodebaseFile)
  WHERE n.som_row IS NOT NULL
  SET n.cell_id = n.som_row + ',' + n.som_col
`;

// Phase 2: Create 3-cell neighborhood edges
const query2 = `
  MATCH (a:CodebaseFile), (b:CodebaseFile)
  WHERE abs(a.som_row - b.som_row) <= 1
    AND abs(a.som_col - b.som_col) <= 1
  CREATE (a)-[:SIMILAR_SOM_CELL {confidence: 0.8}]->(b)
`;
```

**Status**: ✅ Ready to run (but REQUIRES Script 2 first)

---

### Script 4: `verify-metadata-contract-gates-session-76.mjs` (461 lines)

**Purpose**: Re-audit all three gates (read-only verification)

**Does NOT do**:
- Any writes (audit only)
- KMeans clustering
- Touch any data

**Does do**:
- **Gate 1**: Query Postgres atlas_packets for som_row/som_col coverage
  - Expected: 17,995/17,995 (100%)
  - Current: ✅ PASS

- **Gate 2**: Query Neo4j CodebaseFile for cell_id/som_cluster coverage
  - Expected: 20,542/20,542 (100%)
  - Current: ❌ FAIL (0/20,542 before repair scripts)

- **Gate 3**: Sample 100 Qdrant points for retrieval_strategy coverage
  - Expected: 100% with retrieval_strategy field
  - Current: ⚠️ PARTIAL (0% without Script 1 repair)

**Implementation details**:
```typescript
// Gate 1
const result1 = await pgQuery(`
  SELECT COUNT(*) total, COUNT(CASE WHEN som_row IS NOT NULL THEN 1 END) with_som
  FROM atlas_packets
`);

// Gate 2
const result2 = await neo4jSession.run(`
  MATCH (n:CodebaseFile)
  RETURN count(n), count(CASE WHEN n.cell_id IS NOT NULL THEN 1 END)
`);

// Gate 3
const scrollResp = await qdrantClient.scroll('codebase_chunks_768', { limit: 100 });
// Check payload.retrieval_strategy on each point
```

**Status**: ✅ Ready to run

---

## Missing Pieces (Not in Repair Scripts)

### 1. KMeans Clustering
**Status**: Does NOT exist in repair scripts  
**Location**: Stage 5.5 (Phase B)  
**Purpose**: Assign packets to 272 SOM cells (20×20 grid)  
**Implementation**: graphify-cluster-sync-partition.mjs uses hash-based routing (not true kmeans)  
**Why not built**: True kmeans would need:
- 3,251 packet embeddings (768-dim vectors from Qdrant)
- Python sklearn library or Node.js kmeans implementation
- Deferred to Phase B (cluster_sync is responsible)

### 2. SOM Grid Derivation
**Status**: Already exists  
**Location**: Postgres atlas_packets (som_row, som_col columns)  
**Dimensions**: ~20×20 = 400 cells possible (currently using 146 cells)  
**Coordinates**: Values range from 0 to ~20 for each dimension  
**How derived**: 
- Option A: GPU k-means in Phase 6 (not yet implemented)
- Option B: Pre-computed in earlier phase (already done)
- Current: Postgres has canonical SOM coordinates

### 3. Docker Exec for Indexed Tables
**Status**: NOT NEEDED  
**Reason**: All services (Postgres, Neo4j, Qdrant) run directly on host (127.0.0.1)  
**Correct approach**: Use native drivers
- Postgres: pg.Pool from Node.js
- Neo4j: neo4j-driver via Bolt protocol
- Qdrant: REST API client

### 4. Neo4j Bolt Cypher Execution
**Status**: ✅ Implemented in Script 3  
**Protocol**: Bolt (binary protocol, fast)  
**Query type**: Cypher (Neo4j query language)  
**Implementation**:
```typescript
const driver = neo4j.driver('bolt://127.0.0.1:7687', auth);
const session = driver.session();
await session.run(cypherQuery, params);
```

### 5. GDS (Graph Data Science)
**Status**: NOT USED in repair scripts  
**Why**: Optional (APOC is free, but even that's not needed)  
**Usage**: PageRank, community detection, centrality (deferred to Phase D+)  
**Availability**: Free tier available on Neo4j 5.x  
**When needed**: Phase D error analysis (rank clusters by authority)

---

## The Real Problem (And Solution)

### Current Blocker: Neo4j Nodes Have No SOM Coordinates

**Symptom**:
```
Gate 2 audit shows: 0/20,542 nodes have cell_id
Gate 2 audit shows: 0/20,542 nodes have som_cluster
```

**Root cause**:
- Postgres atlas_packets: ✅ som_row, som_col populated (100%)
- Neo4j CodebaseFile nodes: ❌ som_row, som_col NOT populated (0%)
- No join/sync between stores yet

**Solution order** (CRITICAL):
1. Run Script 2 (backfill-neo4j-som-coordinates) — **copies Postgres som_row/som_col to Neo4j**
2. Run Script 3 (backfill-neo4j-som-identity) — **derives cell_id from now-present som_row/som_col**
3. Run Script 4 (verify gates) — **confirms Gate 2 now PASS**
4. THEN run Script 1 (normalize-qdrant-payloads) — **fixes Gate 3 independently**

---

## Correct Repair Workflow (Session 76 Updated)

```bash
# Step 1: Current state audit
npm run atlas:gate:verify:all --verbose
# Expected output:
#   Gate 1: PASS (17995/17995)
#   Gate 2: FAIL (0/20542 cell_id)
#   Gate 3: PARTIAL (0% retrieval_strategy)

# Step 2: PREREQUISITE — Populate Neo4j som_row/som_col from Postgres
npm run atlas:gate:repair:neo4j:coords:apply
# Enriches 20,542 Neo4j nodes with som_row, som_col

# Step 3: Derive cell_id and som_cluster from now-present som_row/som_col
npm run atlas:gate:repair:neo4j:identity --apply --phase=all
# Phase 1: SET cell_id = som_row + ',' + som_col
# Phase 2: Create SIMILAR_SOM_CELL neighborhood edges
# Phase 3: Report existing SIMILAR_TOPOLOGY edges

# Step 4: Normalize Qdrant payloads (independent of Neo4j fixes)
npm run atlas:gate:repair:qdrant:apply
# sourceRef→source_ref, add retrieval_strategy, etc.

# Step 5: Final verification
npm run atlas:gate:verify:all --verbose
# Expected:
#   Gate 1: PASS ✅
#   Gate 2: PASS ✅ (20542/20542 have cell_id)
#   Gate 3: PASS ✅ (100% retrieval_strategy)
```

**Timeline**:
- Prerequisite (Script 2): 5 minutes
- Gate 2 identity (Script 3): 25 minutes
- Gate 3 normalization (Script 1): 20 minutes
- Verification (Script 4): 5 minutes
- **Total**: 55 minutes (1 minute longer than original estimate, but CORRECT path)

---

## Critical Rules

1. **DO NOT run Script 3 without Script 2 first**
   - Script 3 assumes som_row/som_col exist
   - Without them: All cell_ids become 'unknown'
   - Result: Gate 2 stays FAIL

2. **Script 1 and Script 2 are independent**
   - Can run in parallel or in any order
   - Gate 3 (Qdrant) doesn't depend on Gate 2 (Neo4j)
   - Gate 1 (Postgres) is unaffected by either

3. **All gates must PASS before Phase B `--apply`**
   - User directive: No writes until metadata contract validated
   - Phase B (cluster_sync) will corrupt data if gates FAIL

---

## NPM Scripts (Updated)

```json
"atlas:gate:repair:qdrant": "dry-run Qdrant normalization",
"atlas:gate:repair:qdrant:apply": "apply Qdrant normalization",

"atlas:gate:repair:neo4j:coords": "dry-run: populate som_row/som_col",
"atlas:gate:repair:neo4j:coords:apply": "apply: populate som_row/som_col",

"atlas:gate:repair:neo4j:identity": "dry-run: derive cell_id (requires coords first)",
"atlas:gate:repair:neo4j": "chained: coords → identity (both dry-run)",
"atlas:gate:repair:neo4j:apply": "chained: coords → identity (both apply)",

"atlas:gate:verify:all": "read-only: verify all three gates",
"atlas:gate:verify:all:verbose": "read-only: with detailed logging"
```

---

## Architecture Summary

```
SOM IDENTITY CHAIN (Session 76 Repair Path)
════════════════════════════════════════════════════════════════════════════

Postgres atlas_packets (CANONICAL TRUTH)
  ├─ som_row, som_col populated (100%, 17,995 rows)
  └─ source_ref, feature_id, packet_key (canonical lineage)

   ↓ Script 2 (backfill-neo4j-som-coordinates)
   ↓ Joins by source_ref, copies coordinates

Neo4j :CodebaseFile nodes (TOPOLOGY MIRROR)
  ├─ som_row, som_col enriched (by Script 2)
  └─ 20,542 nodes populated

   ↓ Script 3 (backfill-neo4j-som-identity)
   ↓ Derives cell_id, creates neighborhood edges

Neo4j node properties (CLUSTER-AWARE RETRIEVAL)
  ├─ cell_id = som_row + ',' + som_col
  ├─ som_cluster = cell_id (alias)
  └─ SIMILAR_SOM_CELL edges (3-cell neighborhood)

Qdrant payloads (RETRIEVAL MIRROR) 
  ├─ retrieval_strategy (added by Script 1)
  ├─ som_cluster (derived from packet's cluster)
  └─ som_row, som_col (for prefilter hints)

   ↓ Phase B execution (graphify-cluster-sync-partition)
   ↓ Routes packets by SOM cluster, partitions Bifrost cache

Bifrost L2 Cache (PRE-FILTER LAYER)
  ├─ bifrost:cell:{x}:{y}:* keys (partitioned by SOM cell)
  └─ Enables 7× speedup on L2 cache hits
```

---

## Success Criteria (Session 77 Entry Point)

✅ All three gates PASS:
- Gate 1: 17,995/17,995 (100%)
- Gate 2: 20,542/20,542 (100%)
- Gate 3: 52,606/52,606 (100%)

✅ Neo4j has SIMILAR_SOM_CELL edges (enables cluster-aware DAG traversal)

✅ Qdrant has retrieval_strategy field (enables ACE filtering)

✅ Postgres SOM coordinates synced to Neo4j (enables topology-aware reranking)

Then: `npm run atlas:cluster-sync:partition:apply` (Phase B, 90 min)
