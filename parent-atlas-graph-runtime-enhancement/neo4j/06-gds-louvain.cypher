CALL gds.louvain.stream($graphName, {concurrency: $concurrency})
YIELD nodeId, communityId, intermediateCommunityIds
RETURN coalesce(gds.util.asNode(nodeId).path,gds.util.asNode(nodeId).id) AS nodeKey,
       communityId, intermediateCommunityIds
ORDER BY communityId, nodeKey;
