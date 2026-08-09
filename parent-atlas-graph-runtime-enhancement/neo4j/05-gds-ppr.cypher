MATCH (seed:CodebaseFile)
WHERE seed.path IN $seedPaths
WITH collect(seed) AS seeds
CALL gds.pageRank.stream($graphName, {
  sourceNodes: seeds,
  dampingFactor: 0.85,
  maxIterations: 20,
  tolerance: 1e-7
})
YIELD nodeId, score
RETURN coalesce(gds.util.asNode(nodeId).path, gds.util.asNode(nodeId).id) AS nodeKey,
       score AS personalizedPagerank
ORDER BY personalizedPagerank DESC;
