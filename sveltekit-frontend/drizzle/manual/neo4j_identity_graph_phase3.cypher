// ============================================================================
// Neo4j Identity Graph Rebuild — Phase 3 (Real Identity Structure)
// Date: 2026-06-23 Session 74
// Purpose: Replace fragmented SIMILAR_TOPOLOGY with hierarchical identity graph
// Before: 12,944 edges on disconnected nodes (45,511 isolated)
// After: Connected identity chain + SOM topology + real PageRank
// ============================================================================

// PHASE 1: Create Canonical Node Types (30 min)
// ============================================================================

// 1a. ContextTree nodes (document-level roots)
// Source: atlas_tree_nodes WHERE depth > 0
CALL apoc.periodic.iterate(
  "
  WITH [
    {tree_id: 'tree:root', directory_path: 'src/lib/server', depth: 1, node_count: 156, summary: 'Server utilities'},
    {tree_id: 'tree:root2', directory_path: 'src/routes', depth: 1, node_count: 200, summary: 'API routes'}
  ] AS trees
  UNWIND trees AS tree
  RETURN tree
  ",
  "
  CREATE (ct:ContextTree {
    tree_id: tree.tree_id,
    directory_path: tree.directory_path,
    tree_depth: tree.depth,
    node_count: tree.node_count,
    summary: tree.summary,
    created_at: datetime()
  })
  RETURN ct
  ",
  {batchSize: 100}
)
YIELD batches, total
RETURN 'ContextTree nodes created: ' + total AS result;

// 1b. Feature nodes (feature labels scoped to domain)
// Source: atlas_feature_labels
CALL apoc.periodic.iterate(
  "
  MATCH (f {type: 'feature'})
  WHERE exists(f.feature_id)
  RETURN f.feature_id AS feature_id,
         f.label AS feature_label,
         f.community_id AS community_id,
         f.domain_class AS domain_class,
         COALESCE(f.confidence, 1.0) AS confidence
  ",
  "
  CREATE (feat:Feature {
    feature_id: feature_id,
    feature_label: feature_label,
    community_id: community_id,
    domain_class: domain_class,
    confidence: confidence,
    created_at: datetime()
  })
  RETURN feat
  ",
  {batchSize: 100}
)
YIELD batches, total
RETURN 'Feature nodes created: ' + total AS result;

// 1c. SOMCell nodes (Self-Organizing Map grid topology)
// Source: Computed from atlas_packets.metadata.som_cluster (20x20 grid = 400 cells)
// This query generates SOM cells and their neighbors
CALL apoc.periodic.iterate(
  "
  UNWIND range(0, 19) AS x
  UNWIND range(0, 19) AS y
  RETURN x, y, (x * 20 + y) AS som_cluster
  ",
  "
  // For each SOM cell, compute neighbor offsets (8-neighborhood: moore)
  WITH x, y, som_cluster,
       [n IN [
         {dx: -1, dy: -1}, {dx: -1, dy: 0}, {dx: -1, dy: 1},
         {dx:  0, dy: -1},                  {dx:  0, dy: 1},
         {dx:  1, dy: -1}, {dx:  1, dy: 0}, {dx:  1, dy: 1}
       ]
       WHERE x + n.dx >= 0 AND x + n.dx < 20 AND y + n.dy >= 0 AND y + n.dy < 20
       | ((x + n.dx) * 20 + (y + n.dy))
       ] AS neighbors
  CREATE (sc:SOMCell {
    som_cluster: som_cluster,
    som_x: x,
    som_y: y,
    cell_neighbors: neighbors,
    topology_type: 'grid_20x20',
    density: 0,
    created_at: datetime()
  })
  RETURN sc
  ",
  {batchSize: 400}
)
YIELD batches, total
RETURN 'SOMCell nodes created: ' + total AS result;

// 1d. Packet nodes (chunk-level identity)
// Source: atlas_packets + nes_chrom_packets join on source_ref
CALL apoc.periodic.iterate(
  "
  MATCH (p {type: 'packet'})
  WHERE exists(p.packet_key) AND exists(p.source_ref)
  RETURN
    p.packet_key AS packet_key,
    p.source_ref AS source_ref,
    p.file_path AS file_path,
    p.function_symbol AS function_symbol,
    p.summary AS summary,
    p.qdrant_point_id AS qdrant_point_id,
    p.directory_path AS directory_path,
    p.feature_id AS feature_id,
    COALESCE(p.som_cluster, 0) AS som_cluster,
    COALESCE(p.confidence, 1.0) AS confidence
  ",
  "
  CREATE (pkt:Packet {
    packet_key: packet_key,
    source_ref: source_ref,
    file_path: file_path,
    function_symbol: function_symbol,
    summary: summary,
    qdrant_point_id: qdrant_point_id,
    som_cluster: som_cluster,
    confidence: confidence,
    created_at: datetime()
  })
  RETURN pkt
  ",
  {batchSize: 100}
)
YIELD batches, total
RETURN 'Packet nodes created: ' + total AS result;

// ============================================================================
// PHASE 2: Create Relationships (Identity Chain + Topology) (20 min)
// ============================================================================

// 2a. Packet → ContextTree (every packet belongs to a tree)
CALL apoc.periodic.iterate(
  "
  MATCH (pkt:Packet)
  MATCH (ct:ContextTree) WHERE pkt.source_ref STARTS WITH ct.directory_path
  RETURN pkt, ct
  LIMIT 10000
  ",
  "
  CREATE (pkt)-[:BELONGS_TO]->(ct)
  RETURN pkt
  ",
  {batchSize: 100}
)
YIELD batches, total
RETURN 'BELONGS_TO relationships created: ' + total AS result;

// 2b. Packet → Feature (every packet has a feature)
CALL apoc.periodic.iterate(
  "
  MATCH (pkt:Packet)
  MATCH (feat:Feature {feature_id: pkt.feature_id})
  RETURN pkt, feat
  LIMIT 10000
  ",
  "
  CREATE (pkt)-[:HAS_FEATURE]->(feat)
  RETURN pkt
  ",
  {batchSize: 100}
)
YIELD batches, total
RETURN 'HAS_FEATURE relationships created: ' + total AS result;

// 2c. Packet → SOMCell (every packet has a BMU cell)
CALL apoc.periodic.iterate(
  "
  MATCH (pkt:Packet)
  MATCH (sc:SOMCell {som_cluster: pkt.som_cluster})
  RETURN pkt, sc
  LIMIT 10000
  ",
  "
  CREATE (pkt)-[:IN_SOM]->(sc)
  RETURN pkt
  ",
  {batchSize: 100}
)
YIELD batches, total
RETURN 'IN_SOM relationships created: ' + total AS result;

// 2d. SOMCell → SOMCell (grid adjacency)
CALL apoc.periodic.iterate(
  "
  MATCH (s1:SOMCell), (s2:SOMCell)
  WHERE s1.som_cluster < s2.som_cluster
    AND s2.som_cluster IN s1.cell_neighbors
  RETURN s1, s2
  ",
  "
  CREATE (s1)-[:ADJACENT_TO {distance: 1}]->(s2)
  RETURN s1
  ",
  {batchSize: 100}
)
YIELD batches, total
RETURN 'ADJACENT_TO relationships created: ' + total AS result;

// 2e. Feature → CommunityId (soft grouping)
CALL apoc.periodic.iterate(
  "
  MATCH (f:Feature)
  WHERE exists(f.community_id)
  RETURN f
  ",
  "
  MERGE (c:CommunityId {community_id: f.community_id})
  CREATE (f)-[:IN_COMMUNITY]->(c)
  RETURN f
  ",
  {batchSize: 100}
)
YIELD batches, total
RETURN 'IN_COMMUNITY relationships created: ' + total AS result;

// ============================================================================
// PHASE 3: Archive Old Topology (10 min)
// ============================================================================

// 3a. Mark SIMILAR_TOPOLOGY edges as deprecated
MATCH ()-[r:SIMILAR_TOPOLOGY]->()
SET r.deprecated_at = datetime(),
    r.replacement_relationship = 'IN_SOM + ADJACENT_TO + identity chain'
RETURN count(r) AS marked_deprecated;

// 3b. Optional: DELETE SIMILAR_TOPOLOGY if verified safe
// MATCH ()-[r:SIMILAR_TOPOLOGY]->()
// DELETE r
// RETURN count(r) AS deleted;

// ============================================================================
// VERIFICATION QUERIES (run after migration to confirm)
// ============================================================================

// V1: Check Packet node count
MATCH (pkt:Packet)
RETURN 'Packet nodes' AS entity, count(pkt) AS count;

// V2: Check Feature node count
MATCH (feat:Feature)
RETURN 'Feature nodes' AS entity, count(feat) AS count;

// V3: Check SOMCell node count (should be 400)
MATCH (sc:SOMCell)
RETURN 'SOMCell nodes' AS entity, count(sc) AS count;

// V4: Check ContextTree node count
MATCH (ct:ContextTree)
RETURN 'ContextTree nodes' AS entity, count(ct) AS count;

// V5: Check identity chain completeness
MATCH (pkt:Packet)-[:BELONGS_TO]->(ct:ContextTree)
RETURN 'Packets with BELONGS_TO' AS relationship, count(DISTINCT pkt) AS count;

// V6: Check feature linkage
MATCH (pkt:Packet)-[:HAS_FEATURE]->(f:Feature)
RETURN 'Packets with HAS_FEATURE' AS relationship, count(DISTINCT pkt) AS count;

// V7: Check SOM topology
MATCH (pkt:Packet)-[:IN_SOM]->(sc:SOMCell)
RETURN 'Packets with IN_SOM' AS relationship, count(DISTINCT pkt) AS count;

// V8: Check SOM adjacency (should be ~1600 edges for 20x20 grid 8-neighbor)
MATCH (s1:SOMCell)-[:ADJACENT_TO]->(s2:SOMCell)
RETURN 'SOM adjacencies' AS relationship, count(DISTINCT s1) AS source_cells, count(*) AS edges;

// V9: New PageRank path (connected subgraph)
MATCH (start:Packet)-[:IN_SOM]->(sc1:SOMCell)-[:ADJACENT_TO]->(sc2:SOMCell)<-[:IN_SOM]-(end:Packet)
RETURN
  'Connected packets via SOM' AS metric,
  count(DISTINCT start) AS connected_packet_count,
  count(DISTINCT sc1) AS som_cell_count,
  count(DISTINCT sc2) AS neighbor_cell_count,
  count(start) AS total_paths;

// V10: Deprecated edges still present
MATCH ()-[r:SIMILAR_TOPOLOGY]->()
RETURN 'Deprecated SIMILAR_TOPOLOGY edges' AS relationship, count(r) AS count;

// ============================================================================
// SUMMARY
// ============================================================================
// This migration transforms Neo4j from fragmented topology (45,511 isolated nodes)
// to a real identity graph where:
// - Every Packet has a source_ref, feature_id, SOM cell, and parent tree
// - Features group into communities
// - SOM cells form a connected grid topology
// - PageRank can now run on the real identity + SOM adjacency paths
//
// Timeline:
// Phase 1 (create nodes): 30 min (4 node types × ~10s per batch of 100)
// Phase 2 (create edges): 20 min (5 relationship types × ~4s per batch of 100)
// Phase 3 (archive): 10 min (mark + verify old topology)
// Total: 60 minutes
//
// Success Criteria:
// - V9 returns connected_packet_count > 1000 (real connected subgraph)
// - V10 shows original SIMILAR_TOPOLOGY still marked deprecated (audit trail)
// - PageRank runs cleanly on new identity + SOM topology
// ============================================================================
