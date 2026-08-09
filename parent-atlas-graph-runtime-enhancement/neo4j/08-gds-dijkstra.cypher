MATCH (source:CodebaseFile {path: $sourcePath})
MATCH (target:CodebaseFile {path: $targetPath})
CALL gds.shortestPath.dijkstra.stream($graphName, {
  sourceNode: source,
  targetNodes: [target],
  relationshipWeightProperty: $weightProperty
})
YIELD totalCost, path, costs
RETURN totalCost,
       [n IN nodes(path) | coalesce(n.path,n.id,elementId(n))] AS nodeKeys,
       costs;
