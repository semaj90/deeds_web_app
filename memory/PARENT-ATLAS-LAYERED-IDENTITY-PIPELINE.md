---
name: Parent Atlas Layered Identity Pipeline (July 26, 2026)
description: Authority separation architecture—AST proves structure, Postgres proves identity, Qdrant proposes semantics, Neo4j proves graph, PageRank scores authority, GDS discovers communities
type: project
---

# Parent Atlas Layered Identity Pipeline

**Foundation**: Qdrant audit ledger (54,224 real points) establishes source_ref → packet_key mapping. This document designs how to materialize stable identity tuples and graph structure BEFORE running PageRank, Louvain, BFS, or A* queries.

---

## 1. Canonical Parent Atlas Identity Spine

**Non-negotiable chain** (each field has one job, one authority):

| Field | Meaning | Authority | Source |
|-------|---------|-----------|--------|
| **source_ref** | Repository relative file or document location | Filesystem | Postgres atlas_packets |
| **tree_node_id** | Exact AST symbol or structural node | Tree-sitter AST materialization | Derived from source_ref + node_kind + symbol_name |
| **packet_key** | Stable Parent Atlas packet identity | Postgres durability | Qdrant audit ledger (EXACT_ATLAS_PACKET_KEY) |
| **feature_id** | Capability implemented by one or more symbols/files | Derived, governed | Feature classifier (symbol names, imports, calls, routes) |
| **feature_label** | Human-readable feature name | Derived label | Feature registry |
| **domain_class** | Broad operational category (retrieval, graph, cache, etc.) | Classifier | Domain registry |
| **ontology_id** | Normalized concept type | Ontology registry | Concept classification |
| **qdrant_point_id** | ANN projection identity | Qdrant derived pointer | Qdrant collection codebase_chunks_768 |
| **kmeans_cluster_id** | Geometric neighborhood (K-Means routing only) | Derived model output | K-Means model v3 |
| **som_row, som_col, som_index** | SOM topology neighborhood | Derived model output | SOM 20×20 model |
| **community_id** | Graph community membership | Neo4j GDS output | Louvain community detection |
| **pagerank** | Authority score | Neo4j GDS output | PageRank algorithm v2 |

**CRITICAL RULE**: Do NOT collapse `feature_id`, `domain_class`, `ontology_id`, `kmeans_cluster_id`, `community_id`, `tree_node_id` into a generic `cluster_id`. Each layer has a distinct purpose and authority.

---

## 2. Recommended Graph Model

**The graph represents relationships, not duplicated whole records.**

### Node Types
- **SourceRef** — file path or document URI
- **TreeNode** — AST symbol (function, class, variable, import, etc.)
- **Packet** — Parent Atlas packet (aggregation of tree_nodes)
- **Feature** — capability/feature boundary
- **Domain** — broad operational category
- **OntologyConcept** — normalized concept type
- **KMeansCluster** — vector neighborhood centroid
- **SOMCell** — SOM grid cell (row, col)
- **Community** — graph-derived community
- **DataStore** — Postgres, Qdrant, Redis, Neo4j, etc.

### Relationship Types

**Structural truth (AST edges):**
- `SourceRef -CONTAINS-> TreeNode` — file contains symbol
- `TreeNode -CALLS-> TreeNode` — function/method call graph
- `TreeNode -IMPORTS-> TreeNode` — module/package import
- `TreeNode -READS-> DataStore` — reads from persistence layer
- `TreeNode -WRITES-> DataStore` — writes to persistence layer

**Semantic/feature edges:**
- `TreeNode -IMPLEMENTS-> Feature` — symbol implements capability
- `TreeNode -MATERIALIZES-> Packet` — tree_node instantiates packet
- `Packet -FROM_SOURCE-> SourceRef` — packet originates from file
- `Packet -REPRESENTS-> TreeNode` — packet represents symbol

**Concept edges:**
- `Feature -IN_DOMAIN-> Domain` — feature belongs to domain
- `Feature -HAS_CONCEPT-> OntologyConcept` — feature embodies concept
- `OntologyConcept -IN_DOMAIN-> Domain` — ontology concept in domain

**Vector/clustering edges (routing only, NOT truth):**
- `TreeNode -IN_KMEANS-> KMeansCluster` — vector nearest centroid (distance, cardinality)
- `TreeNode -IN_SOM-> SOMCell` — SOM grid cell (row, col, distance_to_bmu)
- `TreeNode -IN_COMMUNITY-> Community` — graph-detected community membership

---

## 3. Linked Tuple Contract

Materialize **one normalized tuple per tree_node or packet** with full provenance:

```sql
-- Example tuple derived from audit ledger + AST + classification
{
  source_ref: "sveltekit-frontend/scripts/atlas/qdrant-postgres-identity-audit.mjs",
  tree_node_id: "ts::function::classifyPoint::312",  -- hash(language, source_ref, node_kind, symbol_name, start_byte)
  packet_key: "packet:abc123def456",
  feature_id: "retrieval::identity-audit",
  feature_label: "Cross-store identity audit",
  domain_class: "retrieval",
  ontology_id: "ontology::cross_store_identity",
  topology_label: "audit-script",
  qdrant_collection: "codebase_chunks_768",
  qdrant_point_id: "fffe7fd3-...-uuid",
  kmeans_cluster_id: 17,
  som_row: 8,
  som_col: 13,
  som_index: 173,  -- (row * 20) + col
  community_id: 39582,
  pagerank: 0.00421,
  evidence_state: "ACTIVE_VERIFIED",
  
  -- Provenance (model versions for reproducibility)
  ast_version: "tree-sitter-javascript@v0.20.1",
  embedding_model: "embeddinggemma-768",
  kmeans_model_version: "kmeans::v3",
  som_model_version: "som::20x20::v2",
  graph_projection_version: "parent-atlas-gds::v2",
  pagerank_model_version: "pagerank::v2",
  community_model_version: "louvain::v1",
  
  -- Metadata
  content_hash: "sha256(...)",
  generated_at: "2026-07-26T03:14:22Z"
}
```

**Why this matters**: Each field is independently auditable. If `pagerank` changes, you update only the PageRank model version, not the entire tuple. If `feature_id` changes, it doesn't invalidate `tree_node_id` or `qdrant_point_id`.

---

## 4. Execution Order (Gate A–E)

### Gate A: Identity Ledger Validation
**Input**: Qdrant audit ledger (54,224 NDJSON entries)  
**Validation checks**:
- ✅ Unique Qdrant point IDs (zero duplicates)
- ✅ packet_key cardinality (one packet_key per point or documented conflict)
- ✅ source_ref cardinality (acceptable range: 1-3 points per source_ref typically)
- ✅ Cross-evidence agreement (if point matches multiple tables, check consistency)
- ✅ Derive mutation_eligible flag (can safely backfill atlas_packets.qdrant_point_id?)

**Output**:
```
qdrant_point_id, packet_key, tree_node_id, match_method, match_cardinality, cross_evidence_agrees, mutation_eligible
```

**CRITICAL**: Do NOT backfill all missing `atlas_packets.qdrant_point_id` values. Backfill only one-to-one, conflict-free records (mutation_eligible=true).

---

### Gate B: AST Materialization
**Input**: source_ref (from audit ledger) + tree-sitter AST parsing  
**Derive** `tree_node_id` using content-addressable hash:

```
tree_node_id = hash(
  language,
  normalized_source_ref,
  node_kind,              -- "function", "class", "variable", "import", etc.
  qualified_symbol_name,  -- "classifyPoint", "QdrantPostgresAudit.auditAllPoints", etc.
  structural_signature    -- parameter count, optional flags, etc.
)
```

**Example**:
```
source_ref: scripts/atlas/qdrant-postgres-identity-audit.mjs
node_kind: function
symbol_name: classifyPoint
start_byte: 8432
start_line: 312
content_hash: sha256(function body)

tree_node_id: hash("javascript", "scripts/atlas/qdrant-postgres-identity-audit.mjs", "function", "classifyPoint", 8432)
            = "ts::function::classifyPoint::8432"
```

**Preferred rule**: Use content hash + structural signature, not line numbers (lines move).

---

### Gate C: Feature Labeling
**Assign each `tree_node_id` exactly one primary `feature_id`** with optional secondary features.

**Example**:
```
tree_node_id: ts::function::classifyPoint::8432
primary_feature_id: retrieval::identity-audit
secondary_feature_ids: [
  retrieval::qdrant-scroll,
  governance::lineage-ledger
]
feature_label: "Cross-store identity audit"
```

**Evidence for feature assignment** (in priority order):
1. Symbol names (if function name contains "retrieval", "cache", "graph", etc.)
2. Imports (if imports from `$lib/server/retrieval/`, it's a retrieval feature)
3. Calls (if calls Qdrant, Redis, Neo4j clients, infer storage layer feature)
4. Routes (if in `/api/retrieval/`, infer retrieval feature)
5. Schemas (if defines `retrieval_result`, infer retrieval)
6. Database tables (if touches `atlas_packets`, infer identity/packet feature)

**NOT features** (avoid):
- Package name alone ("sveltekit-frontend/...")
- Directory depth
- File type (all .ts is not one feature)

---

### Gate D: Domain and Ontology
**Keep domain broad** (operational category):
- `retrieval` — search, indexing, vector ANN
- `graph` — topology, traversal, GDS
- `cache` — Redis, Bifrost, L1/L2 memory
- `agent_runtime` — LLM orchestration, tool calls
- `compiler` — AST parsing, code generation
- `database` — schema, transactions, migrations
- `gpu` — tensor ops, CUDA
- `frontend` — UI components, client state
- `backend` — server-side logic, routes
- `telemetry` — observability, logging
- `workflow` — state machines, DAG execution
- `testing` — test harnesses, fixtures
- `infrastructure` — deployment, containers
- `documentation` — docs, comments
- `security` — auth, validation, encryption

**Keep ontology specific** (concept type):
- `cross_store_identity` — resolving identity across stores
- `qdrant_scroll` — Qdrant pagination contracts
- `packet_backlink` — Postgres ← Qdrant backlinks
- `ast_symbol` — tree-sitter symbol identity
- `graph_authority` — PageRank, degree centrality
- `semantic_cluster` — K-Means membership
- `error_repair` — fixing broken references
- `retrieval_ranking` — reranking, scoring

**One feature can have multiple domain/ontology pairs**:
```
feature_id: retrieval::identity-audit
domain_class: retrieval
ontology_id: ontology::cross_store_identity

feature_id: retrieval::identity-audit
domain_class: graph
ontology_id: ontology::ast_symbol
```

---

### Gate E: Clustering (Routing Only)
**K-Means should route candidate search, NOT establish truth.**

```
feature_embedding: 768-dim vector (from embeddings model)
nearest_kmeans_centroid: cluster_17
distance_to_centroid: 0.42
kmeans_cluster_id: 17
cluster_model_version: kmeans::v3
```

**Use K-Means for**: "Which cluster should I search first to find similar features?"  
**Do NOT use for**: "This feature belongs to cluster 17 (fact)."

**SOM remains a topology neighborhood** (separate from K-Means):
```
som_row: 8
som_col: 13
som_index: 173  -- (8 * 20) + 13
distance_to_bmu: 0.18
som_model_version: som::20x20::v2
```

**SOM is for**: Spatial grid queries, neighborhood expansion.  
**Do NOT conflate SOM clusters with K-Means clusters or feature_id.**

---

## 5. Neo4j Projection (DDL)

### Create Constraints First
```cypher
CREATE CONSTRAINT source_ref_unique IF NOT EXISTS
  FOR (s:SourceRef) REQUIRE s.source_ref IS UNIQUE;

CREATE CONSTRAINT tree_node_key IF NOT EXISTS
  FOR (n:TreeNode) REQUIRE n.tree_node_id IS UNIQUE;

CREATE CONSTRAINT packet_key IF NOT EXISTS
  FOR (p:Packet) REQUIRE p.packet_key IS UNIQUE;

CREATE CONSTRAINT feature_key IF NOT EXISTS
  FOR (f:Feature) REQUIRE f.feature_id IS UNIQUE;

CREATE CONSTRAINT ontology_key IF NOT EXISTS
  FOR (o:OntologyConcept) REQUIRE o.ontology_id IS UNIQUE;

CREATE CONSTRAINT domain_key IF NOT EXISTS
  FOR (d:Domain) REQUIRE d.domain_class IS UNIQUE;
```

### Materialize Identity Nodes
```cypher
UNWIND rows AS row
MERGE (s:SourceRef {source_ref: row.source_ref})

MERGE (n:TreeNode {tree_node_id: row.tree_node_id})
  SET n.node_kind = row.node_kind,
      n.symbol_name = row.symbol_name,
      n.content_hash = row.content_hash,
      n.evidence_state = row.evidence_state,
      n.ast_version = row.ast_version

MERGE (p:Packet {packet_key: row.packet_key})
  SET p.qdrant_point_id = row.qdrant_point_id,
      p.evidence_state = row.evidence_state

MERGE (f:Feature {feature_id: row.feature_id})
  SET f.feature_label = row.feature_label

MERGE (d:Domain {domain_class: row.domain_class})

MERGE (o:OntologyConcept {ontology_id: row.ontology_id})

-- Link identity chain
MERGE (s)-[:CONTAINS]->(n)
MERGE (n)-[:MATERIALIZES]->(p)
MERGE (n)-[:IMPLEMENTS]->(f)
MERGE (f)-[:IN_DOMAIN]->(d)
MERGE (f)-[:HAS_CONCEPT]->(o)
```

### Materialize AST Relationships (Separately)
```cypher
UNWIND edges AS edge
MATCH (from:TreeNode {tree_node_id: edge.from_tree_node_id})
MATCH (to:TreeNode {tree_node_id: edge.to_tree_node_id})

MERGE (from)-[r:CALLS]->(to)
  SET r.source = edge.source,
      r.confidence = edge.confidence,
      r.content_hash = edge.content_hash
```

---

## 6. Run Graph Validation BEFORE PageRank

**Integrity checks** (must all pass):

```cypher
-- Check 1: All TreeNodes materialize a Packet
MATCH (n:TreeNode)
WHERE NOT (n)-[:MATERIALIZES]->(:Packet)
RETURN count(n) AS tree_nodes_without_packet

-- Check 2: All Packets materialize a TreeNode
MATCH (p:Packet)
WHERE NOT (:TreeNode)-[:MATERIALIZES]->(p)
RETURN count(p) AS packets_without_tree_node

-- Check 3: All Features have a Domain
MATCH (f:Feature)
WHERE NOT (f)-[:IN_DOMAIN]->(:Domain)
RETURN count(f) AS features_without_domain

-- Check 4: All TreeNodes implement exactly one primary Feature
MATCH (n:TreeNode)-[r:IMPLEMENTS]->(f:Feature)
WITH n, count(r) AS feature_count
WHERE feature_count > 1
RETURN n.tree_node_id, feature_count
-- (Multiple features may be OK if marked primary/secondary, but enforce it)
```

**Expected result**: All counts = 0 (perfect graph integrity).

---

## 7. GDS Projection (Separate by Purpose)

**Do NOT include K-Means/SOM membership edges in PageRank by default.** Hundreds of nodes pointing to one cluster node distort authority scoring.

### Projection 1: Call Graph (for PageRank)
```cypher
CALL gds.graph.project(
  'parentAtlasCallGraph',
  'TreeNode',
  {CALLS: {orientation: 'NATURAL'}, DEPENDS_ON: {orientation: 'NATURAL'}},
  {relationshipProperties: ['confidence']}
)
YIELD graphName, nodeCount, relationshipCount
RETURN graphName, nodeCount, relationshipCount;
```

### Projection 2: Feature Graph (for community detection)
```cypher
CALL gds.graph.project(
  'parentAtlasFeatureGraph',
  'Feature',
  {IMPLEMENTS: {orientation: 'UNDIRECTED'}, IN_DOMAIN: {orientation: 'UNDIRECTED'}},
  {relationshipProperties: []}
)
YIELD graphName, nodeCount, relationshipCount;
```

### Projection 3: Ontology Graph (for concept traversal)
```cypher
CALL gds.graph.project(
  'parentAtlasOntologyGraph',
  ['Feature', 'OntologyConcept'],
  {HAS_CONCEPT: {orientation: 'UNDIRECTED'}},
  {relationshipProperties: []}
)
YIELD graphName, nodeCount, relationshipCount;
```

### Projection 4: Topology Graph (for bounded BFS)
```cypher
CALL gds.graph.project(
  'parentAtlasTopologyGraph',
  'TreeNode',
  {CALLS: {orientation: 'NATURAL'}, IMPORTS: {orientation: 'NATURAL'}},
  {relationshipProperties: ['confidence']}
)
YIELD graphName, nodeCount, relationshipCount;
```

---

## 8. PageRank (on Call Graph)

**Use PageRank on executable dependency/call topology**, NOT on semantic clusters.

```cypher
CALL gds.pageRank.write(
  'parentAtlasCallGraph',
  {
    writeProperty: 'pagerank_v2',
    maxIterations: 20,
    dampingFactor: 0.85,
    concurrency: 4
  }
)
YIELD nodePropertiesWritten, ranIterations, didConverge
RETURN nodePropertiesWritten, ranIterations, didConverge;

-- Write metadata
MATCH (meta:GraphMetadata {name: 'pagerank'})
SET meta.model_version = 'pagerank::v2',
    meta.generated_at = datetime(),
    meta.damping_factor = 0.85,
    meta.max_iterations = 20,
    meta.converged = true;
```

**Keep version naming explicit**: `pagerank_v2`, `pagerank_model_version`, `pagerank_generated_at`.

---

## 9. Louvain Community Detection (on Feature Graph)

**Run Louvain on feature level or dependency graphs, NOT directly on semantic clusters.**

```cypher
CALL gds.louvain.stream(
  'parentAtlasFeatureGraph',
  {
    relationshipWeightProperty: 'weight',
    concurrency: 4,
    maxIterations: 10
  }
)
YIELD nodeId, communityId, intermediateCommunityIds
WITH gds.util.asNode(nodeId) AS node, communityId, intermediateCommunityIds
MATCH (node)-[:IN_DOMAIN]->(d:Domain)
CREATE (c:Community {community_id: 'community_' + communityId, domain: d.domain_class})
MERGE (node)-[:IN_COMMUNITY]->(c)
RETURN count(DISTINCT c) AS communities_found;
```

**Louvain uses relationship weights** (if projected with weight property) and is suitable for **detecting communities in topology**, **NOT for replacing semantic feature_id classification**.

---

## 10. BFS for Bounded Neighborhood Expansion

**Use BFS when**: "What is reachable within N hops?" "What depends on this feature?" "What calls this symbol?"

### GDS BFS (for performance)
```cypher
MATCH (start:TreeNode {tree_node_id: 'target_tree_node_id'})
CALL gds.bfs.stream(
  'parentAtlasCallGraph',
  {
    sourceNode: id(start),
    maxDepth: 4,
    targetNodes: []
  }
)
YIELD path
RETURN [n IN nodes(path) | n.tree_node_id] AS traversal
LIMIT 500;
```

### Cypher APOC BFS (for online exploration, NOT batch)
```cypher
MATCH (start:TreeNode {tree_node_id: 'target_tree_node_id'})
CALL apoc.path.expandConfig(
  start,
  {
    relationshipFilter: 'CALLS|IMPORTS|DEPENDS_ON|IMPLEMENTS',
    labelFilter: 'TreeNode|Feature',
    minLevel: 1,
    maxLevel: 4,
    bfs: true,
    uniqueness: 'NODE_GLOBAL',
    limit: 500
  }
)
YIELD path
RETURN path;
```

**Important**: `apoc.path.expandConfig` is NOT safe for Neo4j parallel runtime, so use it for **bounded online exploration**, not mass parallel batch traversals.

---

## 11. Cypher Shortest Path

**Use Cypher when**: Need a constrained path with rich pattern filters.

```cypher
MATCH (start:Feature {feature_id: 'from_feature'})
MATCH (finish:Feature {feature_id: 'to_feature'})

MATCH p = SHORTEST 1 (start)<-[:IMPLEMENTS]-(a:TreeNode)-[r:CALLS|IMPORTS]-(b:TreeNode)-[:IMPLEMENTS]->(finish)
RETURN
  [n IN nodes(p) | coalesce(n.feature_id, n.tree_node_id)] AS path_nodes,
  [r IN relationships(p) | type(r)] AS path_relationships,
  length(p) AS hops;
```

**Cypher supports `SHORTEST path` patterns** and can use bidirectional BFS for appropriate predicates. **Put filters inside the traversed pattern** where possible (complex predicates may fallback to exhaustive search).

---

## 12. A* for Weighted Repair Paths

**Use A* when**: Edges have costs, nodes have coordinates, heuristic dimensions guide you to cheapest repair workflow.

```cypher
-- Example edge costs for Parent Atlas repair workflow
-- cost = 1.0 (base) + uncertainty_penalty + stale_evidence_penalty + cross_domain_penalty + deprecated_node_penalty

MATCH (source:Feature {feature_id: 'source'})
MATCH (target:Feature {feature_id: 'target'})

CALL gds.shortestPath.astar.stream(
  'parentAtlasRepairGraph',
  {
    sourceNode: id(source),
    targetNode: id(target),
    relationshipWeightProperty: 'cost',
    latitudeProperty: 'manifold_x',
    longitudeProperty: 'manifold_y'
  }
)
YIELD totalCost, nodeIds, costs, path
RETURN totalCost, [id IN nodeIds | gds.util.asNode(id).feature_id] AS features, costs;
```

**IMPORTANT**: Do NOT call arbitrary semantic embedding coordinates "latitude" and "longitude" unless the heuristic remains admissible for your edge cost model. Otherwise use Dijkstra (unweighted or simple weights only).

---

## 13. Decision Matrix: Which Graph Function for Which Question?

| Question | Algorithm | Rationale |
|----------|-----------|-----------|
| What calls this function? | Cypher (1 hop) | Direct edge traversal, exact pattern |
| What is reachable within 3–4 hops? | BFS (GDS or APOC) | Fast bounded traversal, all paths |
| What is the nearest dependency chain? | Cypher shortest path | Pattern-rich, bidirectional BFS |
| What is the cheapest repair route? | Dijkstra or A* | Edge-weighted, heuristic-guided |
| Which nodes are most authoritative? | PageRank | Centrality scoring on call graph |
| Which features form workflows? | Louvain, Leiden | Community detection on feature graph |
| Which nodes are disconnected? | Weakly Connected Components (WCC) | Graph connectivity audit |
| Which directed cycles exist? | Strongly Connected Components (SCC) | Circular dependency detection |
| Which functions are structurally similar? | Node Similarity, FastRP | Embedding-based similarity |
| Which semantic area is likely relevant? | K-Means, SOM | Vector-space routing |
| Which exact code element is authoritative? | tree_node_id + AST edges | Structural truth, not semantic |

---

## 14. Next Implementation Sequence

### Phase 1: Finish Ledger Governance
- ✅ Qdrant audit execution (DONE)
- Fix limit output, cross-evidence overlap matrix
- Point-to-packet cardinality validation
- Packet-to-point cardinality validation
- Derive `mutation_eligible` flag

### Phase 2: AST Identity
- Materialize `source_ref`, `tree_node_id`, `symbol_name`, `node_kind`
- Parent `tree_node_id` (for nested symbols)
- Content hash for structural identity

### Phase 3: Feature, Domain, Ontology
- Generate governed mappings: `tree_node_id` → `feature_id`
- Generate `feature_id` → `domain_class`
- Generate `feature_id` → `ontology_id`

### Phase 4: Linked Tuples
- Write Postgres derived table: `atlas_feature_tuples` (single row per tree_node/packet)
- Columns: `packet_key`, `tree_node_id`, `feature_id`, `domain_class`, `ontology_id`, `kmeans_cluster_id`, `som_index`, `community_id`, `pagerank`, `evidence_state`, `model_versions`

### Phase 5: Neo4j Projection
- Create constraints (source_ref, tree_node_id, packet_key, feature_id, ontology_id)
- UNWIND tuples → MERGE identity nodes
- UNWIND AST edges → MERGE CALLS, IMPORTS, etc.

### Phase 6: GDS Baseline (WCC → PageRank → Louvain)
- WCC first (tells you if graph is coherent or fragmented)
- PageRank on call graph (authority scoring)
- Louvain on feature graph (community discovery)

### Phase 7: Online Traversals (Tool Surface)
- `atlas_graph_neighbors(tree_node_id, depth)` — APOC BFS
- `atlas_graph_bfs(tree_node_id, max_depth, relationship_filter)` — GDS BFS
- `atlas_graph_shortest_path(from, to, cost_model)` — Cypher SHORTEST
- `atlas_graph_astar(from, to, heuristic)` — GDS A*
- `atlas_graph_authority(top_k)` — PageRank top-K
- `atlas_graph_feature_community(feature_id)` — Louvain community expansion

### Phase 8: Retrieval Fusion (RRF + Evidence Weighting)
```
0.50 · semantic_similarity (Qdrant cosine)
0.15 · feature_match (exact feature_id)
0.10 · domain_match (same domain_class)
0.10 · pagerank_authority (normalized)
0.10 · community_affinity (same community_id)
0.05 · inverse_graph_distance (1 / (hops + 1))
```

Treat as starting point, not canonical. Evaluate offline before shipping.

---

## Final Target Architecture

```
Repository (source_ref)
    ↓
Tree-sitter AST (tree_node_id, node_kind, symbol_name)
    ↓
Postgres Tuples (packet_key, feature_id, feature_label, domain_class, ontology_id)
    ↓
Neo4j Graph (SourceRef -CONTAINS-> TreeNode -CALLS-> TreeNode -IMPLEMENTS-> Feature)
    ↓
GDS Projections (CallGraph, FeatureGraph, OntologyGraph, TopologyGraph)
    ↓
PageRank / Louvain / WCC (authority, communities, connectivity)
    ↓
Qdrant (semantic candidates, K-Means SOM routing)
    ↓
RRF Reranking (fuse semantic + graph + authority + community)
    ↓
ACE Packet Assembly (Gemma4 synthesis)
```

**Critical design rule**:
- AST proves structure
- Postgres proves identity
- Qdrant proposes semantic candidates
- K-Means/SOM route neighborhoods
- Neo4j proves graph relationships
- PageRank scores authority
- Louvain discovers communities
- BFS/A* answer traversal questions

**Do NOT let any derived clustering field overwrite `tree_node_id`, `packet_key`, or `feature_id`.**

---

## Status

**READY FOR PHASE 2**: AST materialization and feature labeling.

Qdrant audit ledger (54,224 points) provides the source_ref → packet_key → qdrant_point_id identity spine. Neo4j will layer AST structure, feature classification, and graph semantics on top.
