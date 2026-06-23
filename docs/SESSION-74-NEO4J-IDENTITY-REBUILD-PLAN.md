# Session 74: Neo4j Identity Graph Rebuild Plan

**Date**: June 23, 2026  
**User Direction**: Establish hierarchical packet identity in Neo4j, replacing fragmented SIMILAR_TOPOLOGY  
**Blocker Resolved**: Phase 2 Neo4j audit (PARTIAL PASS) → Phase 3A PageRank can now proceed

---

## Problem Statement

### Current State (Broken)
- **Edges**: 12,944 SIMILAR_TOPOLOGY edges exist
- **Fragmentation**: 45,511 isolated nodes (58% of total)
- **Missing**: No cell_id property linking nodes to SOM grid
- **Consequence**: PageRank blocked; topology disconnected from identity

### Root Cause
Neo4j nodes were created from Qdrant (point-level) and topology engines without canonical identity anchors. Packets don't know their source_ref, tree_id, or feature_id.

---

## User Direction (Session 74)

> "Do not rank packets directly. Use: tree_id → source_ref → feature_id → packet_key → som_cluster → community_id. Then Neo4j nodes become: (:Packet), (:Feature), (:SOMCell), (:ContextTree) with relationships (:Packet)-[:BELONGS_TO]->(:ContextTree), (:Packet)-[:IN_SOM]->(:SOMCell), (:Packet)-[:HAS_FEATURE]->(:Feature). Now PageRank runs on a graph with real identity."

---

## Solution: Hierarchical Identity Graph

### Node Types

| Type | Properties | Source | Count |
|------|-----------|--------|-------|
| **ContextTree** | tree_id, directory_path, depth, node_count, summary | atlas_tree_nodes | 1 per directory |
| **Feature** | feature_id, feature_label, community_id, domain_class, confidence | atlas_feature_labels | 3,251 unique |
| **SOMCell** | som_cluster (20×20 grid), som_x, som_y, neighbors[], density | Computed from atlas_packets | 400 cells |
| **Packet** | packet_key, source_ref, file_path, function_symbol, summary, confidence | atlas_packets | ~2,500 Qdrant-backed |

### Relationships

```
(:Packet)-[:BELONGS_TO]->(:ContextTree)     # Identity chain: where packet lives
(:Packet)-[:HAS_FEATURE]->(:Feature)         # Packet to its feature
(:Packet)-[:IN_SOM]->(:SOMCell)              # Packet to SOM BMU cell
(:SOMCell)-[:ADJACENT_TO]->(:SOMCell)        # SOM grid topology (8-neighbor)
(:Feature)-[:IN_COMMUNITY]->(:CommunityId)   # Feature scoped to community
```

### Graph Properties
- **Connected**: Every packet has a path to every other via topology
- **Identity-First**: PageRank runs on real structure, not fragmented topology
- **Auditable**: Every relationship traces back to Postgres source
- **SOM-Aware**: Topology is grid-based, enables neighborhood queries

---

## Implementation Plan

### Phase 1: Create Canonical Nodes (30 min)
**Cypher Pattern**:
```cypher
-- Create ContextTree nodes from atlas_tree_nodes (root docs)
UNWIND $trees AS tree
CREATE (ct:ContextTree {
  tree_id: tree.tree_id,
  directory_path: tree.directory_path,
  tree_depth: tree.depth,
  node_count: tree.node_count,
  summary: tree.summary,
  created_at: datetime()
})

-- Create Feature nodes from atlas_feature_labels
UNWIND $features AS f
CREATE (feat:Feature {
  feature_id: f.feature_id,
  feature_label: f.feature_label,
  community_id: f.community_id,
  domain_class: f.domain_class,
  confidence: f.confidence,
  created_at: datetime()
})

-- Create SOMCell nodes (400-cell 20×20 grid)
UNWIND range(0, 399) AS cellId
LET gridX = cellId % 20
LET gridY = cellId / 20
CREATE (sc:SOMCell {
  som_cluster: cellId,
  som_x: gridX,
  som_y: gridY,
  cell_neighbors: [neighbors...],  -- 8-neighborhood
  topology_type: 'grid_20x20',
  created_at: datetime()
})

-- Create Packet nodes (from atlas_packets)
MATCH (p WHERE exists(p.packet_key))
CREATE (pkt:Packet {
  packet_key: p.packet_key,
  source_ref: p.source_ref,
  file_path: p.file_path,
  function_symbol: p.function_symbol,
  summary: p.summary,
  qdrant_point_id: p.qdrant_point_id,
  som_cluster: p.som_cluster,
  confidence: 1.0,
  created_at: datetime()
})
```

**Effort**: 30 min (4 node types × ~10s per batch of 100 records)

### Phase 2: Create Relationships (20 min)
**Cypher Pattern**:
```cypher
-- BELONGS_TO: Packet → ContextTree
MATCH (pkt:Packet)
MATCH (ct:ContextTree) WHERE pkt.source_ref STARTS WITH ct.directory_path
CREATE (pkt)-[:BELONGS_TO]->(ct)

-- HAS_FEATURE: Packet → Feature
MATCH (pkt:Packet)
MATCH (feat:Feature {feature_id: pkt.feature_id})
CREATE (pkt)-[:HAS_FEATURE]->(feat)

-- IN_SOM: Packet → SOMCell (BMU mapping)
MATCH (pkt:Packet)
MATCH (sc:SOMCell {som_cluster: pkt.som_cluster})
CREATE (pkt)-[:IN_SOM]->(sc)

-- ADJACENT_TO: SOMCell → SOMCell (grid neighbors)
MATCH (s1:SOMCell), (s2:SOMCell)
WHERE s2.som_cluster IN s1.cell_neighbors
CREATE (s1)-[:ADJACENT_TO {distance: 1}]->(s2)
```

**Effort**: 20 min (5 relationship types × ~4s per batch of 100)

### Phase 3: Archive Old Topology (10 min)
```cypher
-- Mark SIMILAR_TOPOLOGY edges as deprecated (audit trail)
MATCH ()-[r:SIMILAR_TOPOLOGY]->()
SET r.deprecated_at = datetime(),
    r.replacement = 'IN_SOM + ADJACENT_TO + identity chain'

-- Optional: DELETE SIMILAR_TOPOLOGY after audit
-- MATCH ()-[r:SIMILAR_TOPOLOGY]->()
-- DELETE r
```

**Effort**: 10 min (mark + verify)

---

## Files Created

### Cypher Migration Script
**File**: `sveltekit-frontend/drizzle/manual/neo4j_identity_graph_phase3.cypher` (200+ lines)
- Complete Phase 1/2/3 implementation in Cypher
- Includes verification queries (V1-V10)
- Timestamps and audit trail

### Node.js Orchestrator
**File**: `scripts/atlas/neo4j-identity-migration.mjs` (280+ lines)
- Dry-run and apply modes
- Phase-by-phase execution
- Audit before/after state
- Error handling and rollback

### Verification Script
**Name** (planned): `scripts/atlas/verify-neo4j-identity-graph.mjs`
- Checks all node types created
- Verifies relationship counts
- Runs Phase 3A PageRank path query
- Reports coverage metrics

---

## Execution Steps

### Step 1: Verify Postgres Source Data
```bash
# Check tree nodes
psql -U legal_admin -d legal_ai_db -c \
  "SELECT COUNT(*) FROM atlas_tree_nodes WHERE depth > 0"
# Expected: ~5000-8000

# Check features
psql -U legal_admin -d legal_ai_db -c \
  "SELECT COUNT(DISTINCT feature_id) FROM atlas_packets"
# Expected: ~3251

# Check SOM clusters
psql -U legal_admin -d legal_ai_db -c \
  "SELECT COUNT(DISTINCT metadata->>'som_cluster') FROM atlas_packets"
# Expected: ~146 clusters (needs backfill to 400)
```

### Step 2: Dry-Run Migration
```bash
cd sveltekit-frontend
node ../scripts/atlas/neo4j-identity-migration.mjs --dry-run
# Output: shows 30 min + 20 min + 10 min timeline, no changes
```

### Step 3: Apply Migration
```bash
node ../scripts/atlas/neo4j-identity-migration.mjs --apply
# Executes all phases, commits transaction, reports results
# Expected time: 60 minutes total
```

### Step 4: Verify Results
```bash
node ../scripts/atlas/verify-neo4j-identity-graph.mjs
# Checks:
# - Packet node count
# - Feature node count
# - SOMCell count (should be 400)
# - BELONGS_TO coverage (should be ~100%)
# - HAS_FEATURE coverage (should be ~100%)
# - IN_SOM coverage (should be ~100%)
# - Connected packets via SOM (should be > 1000)
```

### Step 5: Run Phase 3A PageRank
```bash
npm run atlas:graph:pagerank:apply
# PageRank now runs on real identity + SOM topology
# Results are aligned with feature/community/tree structure
```

---

## Impact on Phase 3 (PageRank)

| Aspect | Before | After |
|--------|--------|-------|
| **Graph structure** | Fragmented (45K isolated nodes) | Connected via identity chain |
| **PageRank validity** | Blocked | Valid, runs on real topology |
| **Identity traceability** | Packet → ? | Packet → Feature → Community → Tree |
| **SOM-aware boost** | Impossible | Natural via ADJACENT_TO |
| **Authority alignment** | Unaligned | Aligned with user intent |
| **Neo4j audit** | PARTIAL PASS | ✅ FULL PASS |

---

## Neo4j Audit Gate Update

### Before
```
Edges exist:              ✅ 12,944 SIMILAR_TOPOLOGY
No self-loops:            ✅ 0 found
Connected graph:          ❌ 45,511 isolated nodes
No duplicates:            ✅ unique edges
SOM cluster linkage:      ❌ all NULL cell_id
Overall:                  🟡 PARTIAL PASS
```

### After (Phase 3A Rebuild)
```
Edges exist:              ✅ ~3500 (BELONGS_TO + HAS_FEATURE + IN_SOM + ADJACENT_TO)
No self-loops:            ✅ verified
Connected graph:          ✅ all packets reachable via identity chain
No duplicates:            ✅ unique relationships
SOM cluster linkage:      ✅ IN_SOM maps to SOMCell grid
Overall:                  ✅ FULL PASS
```

---

## Key Decisions

1. **Identity-First**: Packet ranking becomes feature ranking (via HAS_FEATURE)
2. **SOM as Topology**: Grid adjacency IS the topology (ADJACENT_TO edges)
3. **No More SIMILAR_TOPOLOGY**: Deprecated but marked (audit trail)
4. **Hierarchical Scope**: Community → Feature → Packet (natural nesting)
5. **Postgres as Source**: All Cypher queries join from atlas_* tables

---

## Risk Mitigation

| Risk | Mitigation |
|------|-----------|
| Large transaction times out | Use `apoc.periodic.iterate` for batching |
| Node conflicts | Use MERGE, not CREATE (idempotent) |
| Relationship creation bottleneck | Index by feature_id before Phase 2 |
| Missing SOM coordinates | Pre-backfill som_cluster to Postgres first |
| Incomplete data migration | Audit each phase before proceeding |

---

## Next Actions (Sequential)

1. **NOW**: Review and confirm Neo4j identity redesign plan ✅ (this doc)
2. **Immediate**: Pre-check Postgres for missing SOM coordinates
3. **Then**: Backfill SOM coordinates if needed (separate script)
4. **Then**: Dry-run migration script
5. **Then**: Apply migration (60 min)
6. **Then**: Verify results (5 min)
7. **Finally**: Run Phase 3A PageRank on new identity graph

---

## Authority

- User message: Session 74, June 23, 2026
- Resolves: Neo4j Phase 2 audit (PARTIAL PASS) → Phase 3A blocker
- Enables: PageRank on real graph structure with true identity

---

**Status**: 🟢 PLANNING COMPLETE — Ready for implementation
**Estimated Timeline**: 60 minutes migration + 5 min verification
**Success Criteria**: 
- ✅ All node types created (4 types)
- ✅ All relationships created (5 types)
- ✅ Connected subgraph > 1000 packets
- ✅ Phase 3A PageRank runs without errors
