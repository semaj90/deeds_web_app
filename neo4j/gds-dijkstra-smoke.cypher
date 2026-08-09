// GR3 — GDS Dijkstra smoke query.
//
// This file is a REFERENCE COPY for manual cypher-shell / Neo4j Browser smoke testing only.
// The canonical, actually-used-in-production owner is `runDijkstraContext()` in
// sveltekit-frontend/src/lib/server/graph/neo4j-gds.ts (see runDijkstraPair /
// runDijkstraNeighborhood). Do NOT wire application code to this file directly — call
// runDijkstraContext() instead. This file exists so the query can be eyeballed/run ad hoc
// against the live 'codeTopology' projection without spinning up the TS runtime.
//
// Params:
//   $sourceRef   e.g. "src/lib/server/features/ai/ace/context-assembler.ts"
//   $targetRef   e.g. "src/lib/server/queue/rabbitmq-manager-fixed.ts"
//   $limit       e.g. 10
//
// Contract under test (must hold for GR3 Dijkstra PASS):
//   - source/target both resolve
//   - a path + finite totalCost is returned (or empty result if genuinely unreachable —
//     not an error)

MATCH (source)
WHERE source.source_ref = $sourceRef OR source.path = $sourceRef OR source.feature_id = $sourceRef
MATCH (target)
WHERE target.source_ref = $targetRef OR target.path = $targetRef OR target.feature_id = $targetRef
CALL gds.shortestPath.dijkstra.stream('codeTopology', {
  sourceNode: id(source),
  targetNode: id(target),
  relationshipWeightProperty: 'cost'
})
YIELD totalCost, nodeIds, costs
RETURN
  totalCost,
  costs,
  [nodeId IN nodeIds | coalesce(
    gds.util.asNode(nodeId).source_ref,
    gds.util.asNode(nodeId).path,
    gds.util.asNode(nodeId).feature_id,
    gds.util.asNode(nodeId).name
  )] AS hopPath
LIMIT $limit;
