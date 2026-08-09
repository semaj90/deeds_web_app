CALL gds.pageRank.stream($graphName, {
  dampingFactor: 0.85,
  maxIterations: 20,
  tolerance: 1e-7
})
YIELD nodeId, score
RETURN coalesce(gds.util.asNode(nodeId).path, gds.util.asNode(nodeId).id) AS nodeKey,
       score AS pagerankRaw
ORDER BY pagerankRaw DESC;
